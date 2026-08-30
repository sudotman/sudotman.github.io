#!/usr/bin/env node

/**
 * One-time migration: Blogspot posts to `content/posts/*.md`.
 *
 * Kept in the repository as the record of how the archive was converted, and
 * so the import can be replayed if a post needs re-deriving from the feed.
 * It never overwrites an existing file — once a post is in `content/posts`,
 * that file is the source of truth and edits belong in the editor.
 *
 *   node scripts/import-blogger.mjs           import anything not yet present
 *   node scripts/import-blogger.mjs --force   re-derive every post from Blogger
 *   node scripts/import-blogger.mjs --dry-run print what it would write
 */

import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { serializePost } from '../js/lib/post.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const POSTS_DIR = path.join(ROOT, 'content/posts');
const IMAGES_DIR = path.join(ROOT, 'images/blog');
const FEED = 'https://blog.satyam.lol/feeds/posts/default?alt=json&max-results=500';

const force = process.argv.includes('--force');
const dryRun = process.argv.includes('--dry-run');

/**
 * Blogspot truncates slugs to fit its own URL scheme ("the-juxtaposition-of-
 * societal"). These are the readable replacements; the original URL is kept in
 * each post's frontmatter so nothing about the provenance is lost.
 */
const SLUGS = new Map([
  ['/2025/07/carcinization-on-internet.html', 'carcinization-on-the-internet'],
  ['/2024/03/political-discussion-and-debates-in.html', 'political-discussion-in-the-attention-deficit-age'],
  ['/2023/10/killers-of-flower-moon-defines-what.html', 'killers-of-the-flower-moon'],
  ['/2022/04/grimes-intersection-of-background.html', 'grimes-and-dream-art-pop'],
  ['/2022/03/absurdism-and-life.html', 'absurdism-and-life'],
  ['/2021/08/the-juxtaposition-of-societal.html', 'dark-souls-3-power-and-society']
]);

/**
 * Images the author uploaded to Blogger are pulled into the repository so the
 * archive stops depending on Google. Third-party hotlinks (stock previews, a
 * journal figure) are left pointing where they always pointed rather than
 * vendoring somebody else's licensed artwork.
 */
const SELF_HOSTED = /^https:\/\/blogger\.googleusercontent\.com\//i;

const NAMED_ENTITIES = new Map([
  ['amp', '&'], ['lt', '<'], ['gt', '>'], ['quot', '"'], ['apos', "'"],
  ['nbsp', ' '], ['ndash', '–'], ['mdash', '—'], ['hellip', '…'],
  ['lsquo', '‘'], ['rsquo', '’'], ['ldquo', '“'], ['rdquo', '”']
]);

function decodeEntities(value = '') {
  return String(value).replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
    if (entity.startsWith('#x')) return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    if (entity.startsWith('#')) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    return NAMED_ENTITIES.get(entity.toLowerCase()) ?? match;
  });
}

function attribute(tag, name) {
  return decodeEntities(tag.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i'))?.[1] || '');
}

/** Escapes the markdown control characters that appear in ordinary prose. */
function escapeMarkdown(value = '') {
  return String(value)
    .replace(/([\\`*_[\]])/g, '\\$1')
    .replace(/^(\s*)([-+>#])/gm, '$1\\$2')
    .replace(/^(\s*\d+)\./gm, '$1\\.');
}

async function downloadImage(url, slug, index) {
  const extension = (new URL(url).pathname.match(/\.(jpe?g|png|gif|webp|avif)$/i)?.[1] || 'png').toLowerCase();
  const name = `${slug}-${String(index + 1).padStart(2, '0')}.${extension === 'jpeg' ? 'jpg' : extension}`;
  const destination = path.join(IMAGES_DIR, name);
  const href = `/images/blog/${name}`;

  if (dryRun) return href;

  const response = await fetch(url, { headers: { 'user-agent': 'satyam.lol blog import' } });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  await mkdir(IMAGES_DIR, { recursive: true });
  await writeFile(destination, Buffer.from(await response.arrayBuffer()));
  console.log(`  image ${href}`);
  return href;
}

/**
 * Converts the small subset of HTML that Blogger's editor emits. Blogger uses
 * <div> as a paragraph, wraps figures in caption tables, and pads posts with
 * empty <p><br></p> spacers — all of which have to be unwound before the text
 * reads as markdown.
 */
async function htmlToMarkdown(html, slug) {
  const images = [];
  let text = String(html);

  // Caption tables: <table class="tr-caption-container"> img + caption cell.
  text = text.replace(
    /<table\b[^>]*tr-caption-container[\s\S]*?<img\b([^>]*)>[\s\S]*?<td\b[^>]*tr-caption[^>]*>([\s\S]*?)<\/td>[\s\S]*?<\/table>/gi,
    (match, imgAttributes, caption) => {
      const source = attribute(`<img ${imgAttributes}>`, 'src');
      const alt = attribute(`<img ${imgAttributes}>`, 'alt');
      const text_ = decodeEntities(caption.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
      images.push({ src: source, alt: alt || text_, caption: text_ });
      return `\n\nIMAGE:${images.length - 1}\n\n`;
    }
  );

  // Blogger wraps each inline image in a lightbox link to the full-size copy on
  // its own CDN. Left in place that would re-link every migrated image straight
  // back to Google, so unwrap the anchor and keep only the image.
  text = text.replace(/<a\b[^>]*>\s*(<img\b[^>]*>)\s*<\/a>/gi, '$1');

  // Any remaining image, with or without a separator wrapper.
  text = text.replace(/<img\b([^>]*)>/gi, (match, imgAttributes) => {
    const source = attribute(match, 'src');
    if (!source) return '';
    images.push({ src: source, alt: attribute(match, 'alt'), caption: '' });
    return `\n\nIMAGE:${images.length - 1}\n\n`;
  });

  text = text.replace(/<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>/gi, (match, inner) => `\n\nQUOTE:${
    Buffer.from(inner, 'utf8').toString('base64')
  }\n\n`);

  text = text.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (match, attributes, label) => {
    const href = attribute(`<a ${attributes}>`, 'href');
    const inner = decodeEntities(label.replace(/<[^>]+>/g, '')).trim();
    if (!href || !inner) return inner;
    // A bare URL used as its own label reads better as an autolink.
    return inner === href ? `<${href}>` : `[${escapeMarkdown(inner)}](${href})`;
  });

  text = text
    .replace(/<(b|strong)\b[^>]*>([\s\S]*?)<\/\1>/gi, (match, tag, inner) => (inner.trim() ? `**${inner.trim()}**` : ''))
    .replace(/<(i|em)\b[^>]*>([\s\S]*?)<\/\1>/gi, (match, tag, inner) => (inner.trim() ? `*${inner.trim()}*` : ''))
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])\s*>/gi, '\n\n')
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<[^>]+>/g, '');

  text = decodeEntities(text)
    .split('\n')
    .map((line) => line.replaceAll('\u00a0', ' ').trim())
    .join('\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // Prose still has to be escaped, but everything converted above is markdown
  // on purpose. Park those spans behind a sentinel that carries no markdown
  // meaning and cannot collide with an ordinary number in the text.
  const guarded = [];
  text = text.replace(
    /(!?\[[^\]]*\]\([^)]*\)|<https?:\/\/[^>]+>|\*\*[^*\n]+\*\*|\*[^*\n]+\*|IMAGE:\d+|QUOTE:[A-Za-z0-9+/=]+)/g,
    (match) => `@@GUARD${guarded.push(match) - 1}@@`
  );
  text = escapeMarkdown(text).replace(/@@GUARD(\d+)@@/g, (match, index) => guarded[Number(index)]);

  const resolved = [];
  for (const [index, image] of images.entries()) {
    const src = SELF_HOSTED.test(image.src) ? await downloadImage(image.src, slug, index) : image.src;
    resolved.push({ ...image, src });
  }

  text = text.replace(/IMAGE:(\d+)/g, (match, index) => {
    const image = resolved[Number(index)];
    if (!image) return '';
    const caption = image.caption ? ` "${image.caption.replace(/"/g, "'")}"` : '';
    return `![${image.alt.replace(/[[\]]/g, '')}](${image.src}${caption})`;
  });

  text = text.replace(/QUOTE:([A-Za-z0-9+/=]+)/g, (match, encoded) => {
    const inner = decodeEntities(Buffer.from(encoded, 'base64').toString('utf8').replace(/<[^>]+>/g, ' '))
      .replace(/\s+/g, ' ')
      .trim();
    return inner ? `> ${escapeMarkdown(inner)}` : '';
  });

  return text.replace(/\n{3,}/g, '\n\n').trim();
}

async function main() {
  const response = await fetch(FEED, { headers: { 'user-agent': 'satyam.lol blog import' } });
  if (!response.ok) throw new Error(`Blogger feed returned ${response.status}`);
  const feed = await response.json();

  await mkdir(POSTS_DIR, { recursive: true });
  const existing = new Set((await readdir(POSTS_DIR).catch(() => [])).map((name) => name.replace(/\.md$/, '')));

  for (const entry of feed.feed?.entry || []) {
    const legacyUrl = entry.link?.find((link) => link.rel === 'alternate')?.href || '';
    const pathname = legacyUrl ? new URL(legacyUrl).pathname : '';
    const slug = SLUGS.get(pathname);

    if (!slug) {
      console.warn(`No slug mapped for ${pathname || 'an entry with no link'}; skipping.`);
      continue;
    }
    if (existing.has(slug) && !force) {
      console.log(`${slug}: already imported, leaving it alone.`);
      continue;
    }

    console.log(`${slug}:`);
    const title = decodeEntities(entry.title?.$t || 'Untitled').trim();
    const body = await htmlToMarkdown(entry.content?.$t || '', slug);
    const tags = (entry.category || []).map((category) => String(category.term).toLowerCase()).filter(Boolean);

    const file = serializePost({
      title,
      date: new Date(entry.published?.$t).toISOString().slice(0, 10),
      // Left blank on purpose: an auto-excerpt here just repeats the post's
      // opening lines back at the reader in its own header. Leaving it out
      // lets the build fall back to an excerpt for the index card and feed,
      // without showing that same redundant line on the post itself. Write a
      // real one-sentence summary by hand once the post is imported.
      tags,
      legacyUrl
    }, body);

    if (dryRun) {
      console.log(file.slice(0, 600));
      continue;
    }

    await writeFile(path.join(POSTS_DIR, `${slug}.md`), file, 'utf8');
    console.log(`  wrote content/posts/${slug}.md (${body.length} chars)`);
  }
}

await main();

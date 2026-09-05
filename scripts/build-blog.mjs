#!/usr/bin/env node

/**
 * Generates the native blog from `content/posts/*.md`.
 *
 * Writes static HTML rather than rendering markdown in the browser, so every
 * post is readable, crawlable and archivable without JavaScript. Output is
 * committed to the repository so a clone previews correctly with no build, and
 * CI regenerates before deploying so the live site can never serve stale HTML.
 *
 *   node scripts/build-blog.mjs           write the blog
 *   node scripts/build-blog.mjs --check   fail if committed output is stale
 *   node scripts/build-blog.mjs --drafts  include posts marked draft: true
 */

import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { escapeHtml, renderMarkdown } from '../js/lib/markdown.js';
import { dateLabel, normalizePost, parseFrontmatter, sortPosts } from '../js/lib/post.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const POSTS_DIR = path.join(ROOT, 'content/posts');
const BLOG_DIR = path.join(ROOT, 'blog');
const INDEX_PATH = path.join(ROOT, 'content/blog.json');
const SITEMAP_PATH = path.join(ROOT, 'sitemap.xml');
const REDIRECT_DOC_PATH = path.join(ROOT, 'docs/blogspot-redirect.html');
const HOME_PATH = path.join(ROOT, 'content/home.json');

const SITE = 'https://satyam.lol';
const SITEMAP_START = '  <!-- blog:start -->';
const SITEMAP_END = '  <!-- blog:end -->';

const checkOnly = process.argv.includes('--check');
const includeDrafts = process.argv.includes('--drafts');

const problems = [];
const written = [];
const stale = [];

function fail(location, message) {
  problems.push(`${location}: ${message}`);
}

function xmlEscape(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

async function readIfPresent(filePath) {
  try {
    return await readFile(filePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

/**
 * In check mode nothing is written; the file is only compared. That keeps
 * `npm test` side-effect free while still catching output that drifted.
 */
async function emit(filePath, contents) {
  const relative = path.relative(ROOT, filePath);
  const current = await readIfPresent(filePath);
  if (current === contents) return;
  if (checkOnly) {
    stale.push(relative);
    return;
  }
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, contents, 'utf8');
  written.push(relative);
}

async function loadPosts() {
  let files = [];
  try {
    files = (await readdir(POSTS_DIR)).filter((name) => name.endsWith('.md')).sort();
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return [];
  }

  const posts = [];
  const seen = new Map();

  for (const file of files) {
    const location = `content/posts/${file}`;
    const slug = file.replace(/\.md$/, '');
    const { data, body } = parseFrontmatter(await readFile(path.join(POSTS_DIR, file), 'utf8'));

    if (!String(data.title || '').trim()) fail(location, 'frontmatter needs a title');
    if (!data.date) fail(location, 'frontmatter needs a date');
    if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) fail(location, 'filename must be a lowercase slug, like my-post.md');
    if (!body.trim()) fail(location, 'has no body');
    if (seen.has(slug)) fail(location, `duplicate slug, already used by ${seen.get(slug)}`);
    seen.set(slug, location);

    const post = normalizePost({ slug, data, body });
    if (data.date && !post.published) fail(location, `date "${data.date}" is not a valid date`);
    if (post.draft && !includeDrafts) continue;
    posts.push(post);
  }

  return sortPosts(posts);
}

function layout({ title, description, canonical, image, head = '', body, bodyClass = '' }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="theme-color" content="#ffffff">
  <meta property="og:type" content="${canonical.includes('/blog/') && canonical !== `${SITE}/blog/` ? 'article' : 'website'}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(canonical)}">
  <meta property="og:image" content="${escapeHtml(image)}">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <link rel="alternate" type="application/rss+xml" title="satyam kashyap — writing" href="${SITE}/blog/feed.xml">
  <link rel="icon" href="/cardIcon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/css/copy-email.css?v=20260821a">
  <link rel="stylesheet" href="/css/blog.css?v=20260829a">
${head}</head>
<body${bodyClass ? ` class="${bodyClass}"` : ''}>
${body}
</body>
</html>
`;
}

function chrome() {
  return `      <nav class="blog-nav" aria-label="Site">
        <a href="/">[home]</a>
        <a href="/blog/">[writing]</a>
        <a href="/blog/feed.xml">[rss]</a>
        <a href="/tech.html">[ononline]</a>
      </nav>`;
}

function siteFooter(identity) {
  const links = Object.entries(identity.links || {})
    .filter(([name]) => name !== 'writing')
    .map(([name, href]) => `<a href="${escapeHtml(href)}" target="_blank" rel="noreferrer">${escapeHtml(name)}</a>`)
    .join(' · ');
  return `      <footer class="blog-footer">
        <p class="blog-footer__statement">${escapeHtml(identity.statement || '')}</p>
        <p>${links} · <button type="button" class="copy-email" data-copy-email="${escapeHtml(identity.email || '')}" aria-label="Copy ${escapeHtml(identity.email || '')} to clipboard">${escapeHtml(identity.email || '')}</button></p>
      </footer>`;
}

function tagList(tags, className) {
  if (!tags.length) return '';
  return `<ul class="${className}">${tags.map((tag) => `<li>${escapeHtml(tag)}</li>`).join('')}</ul>`;
}

function postCard(post) {
  return `        <li class="post-list__entry" data-tags="${escapeHtml(post.tags.join(' '))}" data-search="${escapeHtml(`${post.title} ${post.summary} ${post.tags.join(' ')}`.toLowerCase())}">
          <p class="post-list__date"><time datetime="${escapeHtml(post.date)}">${escapeHtml(post.dateLabel)}</time></p>
          <h3><a href="${escapeHtml(post.href)}">${escapeHtml(post.title)}</a></h3>
          <div class="post-list__meta">
            <p class="post-list__summary">${escapeHtml(post.summary)}</p>
            <p class="post-list__stats"><small>${post.minutes} min · ${post.words.toLocaleString('en-US')} words</small>${tagList(post.tags, 'post-list__tags')}</p>
          </div>
        </li>`;
}

function indexPage(posts, identity) {
  const tags = [...new Set(posts.flatMap((post) => post.tags))].sort();
  const years = [...new Set(posts.map((post) => post.year))];
  const filters = tags.length
    ? `        <div class="post-filter" data-post-filter>
          <label class="post-filter__search">
            <span class="visually-hidden">Search posts</span>
            <input type="search" placeholder="search writing…" data-post-search autocomplete="off">
          </label>
          <div class="post-filter__tags" role="group" aria-label="Filter by tag">
            <button type="button" data-tag="" class="is-active">all (${posts.length})</button>
            ${tags.map((tag) => `<button type="button" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</button>`).join('\n            ')}
          </div>
        </div>`
    : '';

  const body = `  <a class="skip-link" href="#writing-index">Skip to the writing index</a>
  <div class="blog-page">
${chrome()}

    <header class="blog-masthead">
      <h1>writing</h1>
      <p class="blog-masthead__lead">Varying essays and notes</p>
      <p class="blog-masthead__note"><a href="/blog/feed.xml">subscribe by rss</a> · <a href="/write/">writer</a></p>
    </header>

    <main id="writing-index">
${filters}
      <ol class="post-list" data-post-list>
${posts.map(postCard).join('\n')}
      </ol>
      <p class="post-list__empty" data-post-empty hidden>Nothing matches that. <button type="button" data-post-reset>clear the filter</button></p>
    </main>

${siteFooter(identity)}
  </div>
  <script src="/js/copy-email.js?v=20260829a" defer></script>
  <script src="/js/blog.js?v=20260829a" defer></script>`;

  return layout({
    title: 'writing — satyam kashyap',
    description: 'Essays and notes by Satyam Kashyap on the internet, cinema, music and the things software does to attention.',
    canonical: `${SITE}/blog/`,
    image: `${SITE}/og.png`,
    body,
    bodyClass: 'blog-body'
  });
}

function outlineMarkup(headings) {
  const usable = headings.filter((heading) => heading.level === 2);
  if (usable.length < 3) return '';
  return `      <nav class="post-outline" aria-label="On this page">
        <p class="post-outline__title">on this page</p>
        <ol>${usable.map((heading) => `<li><a href="#${escapeHtml(heading.id)}">${escapeHtml(heading.text)}</a></li>`).join('')}</ol>
      </nav>`;
}

function articleSchema(post, identity) {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.summary,
    datePublished: post.published,
    dateModified: post.updated || post.published,
    wordCount: post.words,
    keywords: post.tags.join(', ') || undefined,
    image: post.cover ? new URL(post.cover, SITE).toString() : `${SITE}/og.png`,
    author: { '@type': 'Person', name: identity.name, url: SITE },
    publisher: { '@type': 'Person', name: identity.name, url: SITE },
    mainEntityOfPage: { '@type': 'WebPage', '@id': `${SITE}${post.href}` }
  });
}

function postPage(post, { newer, older }, identity) {
  const { html, headings } = renderMarkdown(post.body);
  const canonical = `${SITE}${post.href}`;
  const cover = post.cover
    ? `      <figure class="post-cover">
        <img src="${escapeHtml(post.cover)}" alt="${escapeHtml(post.coverAlt || post.title)}" loading="eager" decoding="async">
        ${post.coverAlt ? `<figcaption>${escapeHtml(post.coverAlt)}</figcaption>` : ''}
      </figure>`
    : '';

  const legacy = post.legacyUrl
    ? `        <p class="post-legacy">First published on <a href="${escapeHtml(post.legacyUrl)}" target="_blank" rel="noreferrer nofollow">Blogspot</a>.</p>`
    : '';

  const neighbours = newer || older
    ? `      <nav class="post-neighbours" aria-label="More writing">
        ${newer ? `<a class="post-neighbours__link" href="${escapeHtml(newer.href)}"><span>newer</span> ${escapeHtml(newer.title)}</a>` : '<span></span>'}
        ${older ? `<a class="post-neighbours__link post-neighbours__link--older" href="${escapeHtml(older.href)}"><span>older</span> ${escapeHtml(older.title)}</a>` : '<span></span>'}
      </nav>`
    : '';

  const body = `  <a class="skip-link" href="#post-body">Skip to the post</a>
  <div class="blog-page blog-page--post">
${chrome()}

    <article class="post">
      <header class="post-header">
        <p class="post-header__meta"><time datetime="${escapeHtml(post.date)}">${escapeHtml(post.dateLabel)}</time> · ${post.minutes} min read${post.updated && post.updated !== post.published ? ` · updated ${escapeHtml(dateLabel(post.updated))}` : ''}</p>
        <h1>${escapeHtml(post.title)}</h1>
        ${post.summaryIsGenerated ? '' : `<p class="post-header__summary">${escapeHtml(post.summary)}</p>`}
        ${tagList(post.tags, 'post-header__tags')}
${legacy}
      </header>
${cover}
${outlineMarkup(headings)}
      <div class="post-body" id="post-body">
${html}
      </div>
    </article>

${neighbours}

    <p class="post-back"><a href="/blog/">← all writing</a></p>

${siteFooter(identity)}
  </div>
  <script src="/js/copy-email.js?v=20260829a" defer></script>`;

  return layout({
    title: `${post.title} — satyam kashyap`,
    description: post.summary,
    canonical,
    image: post.cover ? new URL(post.cover, SITE).toString() : `${SITE}/og.png`,
    head: `  <meta property="article:published_time" content="${escapeHtml(post.published)}">
${post.tags.map((tag) => `  <meta property="article:tag" content="${escapeHtml(tag)}">`).join('\n')}${post.tags.length ? '\n' : ''}  <script type="application/ld+json">${articleSchema(post, identity)}</script>
`,
    body,
    bodyClass: 'blog-body'
  });
}

function feed(posts, identity) {
  const items = posts.slice(0, 30).map((post) => `    <item>
      <title>${xmlEscape(post.title)}</title>
      <link>${SITE}${post.href}</link>
      <guid isPermaLink="true">${SITE}${post.href}</guid>
      <pubDate>${new Date(post.published).toUTCString()}</pubDate>
      <description>${xmlEscape(post.summary)}</description>
${post.tags.map((tag) => `      <category>${xmlEscape(tag)}</category>`).join('\n')}${post.tags.length ? '\n' : ''}      <content:encoded><![CDATA[${renderMarkdown(post.body).html.replaceAll(']]>', ']]&gt;')}]]></content:encoded>
    </item>`).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>satyam kashyap — writing</title>
    <link>${SITE}/blog/</link>
    <description>Essays and notes by ${xmlEscape(identity.name || 'Satyam Kashyap')}.</description>
    <language>en</language>
    <atom:link href="${SITE}/blog/feed.xml" rel="self" type="application/rss+xml"/>
${posts[0] ? `    <lastBuildDate>${new Date(posts[0].published).toUTCString()}</lastBuildDate>\n` : ''}${items}
  </channel>
</rss>
`;
}

function blogIndexJson(posts) {
  return `${JSON.stringify({
    schemaVersion: 1,
    source: 'content/posts',
    count: posts.length,
    posts: posts.map((post) => ({
      id: post.id,
      slug: post.slug,
      title: post.title,
      href: post.href,
      published: post.published,
      updated: post.updated || undefined,
      year: post.year,
      summary: post.summary,
      tags: post.tags,
      minutes: post.minutes,
      words: post.words,
      legacyUrl: post.legacyUrl || undefined
    }))
  }, null, 2)}\n`;
}

async function updateSitemap(posts) {
  const current = await readIfPresent(SITEMAP_PATH);
  if (!current) return;

  const entries = [
    `  <url>\n    <loc>${SITE}/blog/</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>`,
    ...posts.map((post) => `  <url>\n    <loc>${SITE}${post.href}</loc>\n    <lastmod>${(post.updated || post.published).slice(0, 10)}</lastmod>\n    <changefreq>yearly</changefreq>\n    <priority>0.6</priority>\n  </url>`)
  ].join('\n');
  const block = `${SITEMAP_START}\n${entries}\n${SITEMAP_END}`;

  const hasMarkers = current.includes(SITEMAP_START) && current.includes(SITEMAP_END);
  const next = hasMarkers
    ? current.replace(new RegExp(`${SITEMAP_START}[\\s\\S]*?${SITEMAP_END}`), block)
    : current.replace('</urlset>', `${block}\n</urlset>`);

  await emit(SITEMAP_PATH, next);
}

/**
 * Blogger cannot be redirected from this repository, so the build emits a
 * ready-to-paste theme snippet instead of leaving the mapping in someone's head.
 */
async function writeRedirectDoc(posts) {
  const mapped = posts.filter((post) => post.legacyUrl);
  if (!mapped.length) return;

  const rows = mapped
    .map((post) => `  ${JSON.stringify(new URL(post.legacyUrl).pathname)}: ${JSON.stringify(`${SITE}${post.href}`)}`)
    .join(',\n');

  const contents = `<!--
  Paste inside <head> of the Blogspot theme (Blogger → Theme → Edit HTML).
  Generated by scripts/build-blog.mjs. Do not hand-edit; re-run npm run build.

  Blogger cannot issue a 301, so this sends readers and search engines to the
  canonical page at ${SITE}/blog/ using rel=canonical plus a client redirect.
-->
<script>
/*<![CDATA[*/
(function () {
  var moved = {
${rows}
  };
  var target = moved[location.pathname];
  if (!target) return;

  // Point the canonical at the new home before redirecting, so a crawler that
  // does not run the redirect still credits the right URL. Reuse the theme's
  // own canonical tag when it has one rather than adding a second.
  var canonical = document.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement('link');
    canonical.rel = 'canonical';
    document.head.appendChild(canonical);
  }
  canonical.href = target;

  location.replace(target + location.hash);
})();
/*]]>*/
</script>
`;

  await emit(REDIRECT_DOC_PATH, contents);
}

async function pruneRemovedPosts(posts) {
  if (checkOnly) return;
  let directories = [];
  try {
    directories = (await readdir(BLOG_DIR, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return;
  }

  const keep = new Set(posts.map((post) => post.slug));
  for (const directory of directories) {
    if (keep.has(directory)) continue;
    await rm(path.join(BLOG_DIR, directory), { recursive: true, force: true });
    written.push(`removed blog/${directory}/`);
  }
}

async function main() {
  const home = JSON.parse(await readFile(HOME_PATH, 'utf8'));
  const identity = home.identity || {};
  const posts = await loadPosts();

  if (problems.length) {
    console.error(`Blog build failed with ${problems.length} problem${problems.length === 1 ? '' : 's'}:`);
    problems.forEach((problem) => console.error(`- ${problem}`));
    process.exitCode = 1;
    return;
  }

  await emit(path.join(BLOG_DIR, 'index.html'), indexPage(posts, identity));

  for (const [position, post] of posts.entries()) {
    const neighbours = { newer: posts[position - 1], older: posts[position + 1] };
    await emit(path.join(BLOG_DIR, post.slug, 'index.html'), postPage(post, neighbours, identity));
  }

  await emit(path.join(BLOG_DIR, 'feed.xml'), feed(posts, identity));
  await emit(INDEX_PATH, blogIndexJson(posts));
  await updateSitemap(posts);
  await writeRedirectDoc(posts);
  await pruneRemovedPosts(posts);

  if (checkOnly) {
    if (stale.length) {
      console.error(`Committed blog output is stale in ${stale.length} file${stale.length === 1 ? '' : 's'}. Run: npm run build`);
      stale.forEach((file) => console.error(`- ${file}`));
      process.exitCode = 1;
      return;
    }
    console.log(`Blog output is up to date for ${posts.length} post${posts.length === 1 ? '' : 's'}.`);
    return;
  }

  console.log(`Built ${posts.length} post${posts.length === 1 ? '' : 's'}; ${written.length} file${written.length === 1 ? '' : 's'} changed.`);
  written.forEach((file) => console.log(`- ${file}`));
}

await main();

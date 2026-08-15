#!/usr/bin/env node

import { readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOME_PATH = path.join(ROOT, 'content/home.json');

function decodeEntities(value = '') {
  const named = new Map([
    ['amp', '&'],
    ['apos', "'"],
    ['gt', '>'],
    ['lt', '<'],
    ['nbsp', ' '],
    ['quot', '"']
  ]);

  return String(value).replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
    if (entity.startsWith('#x')) return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    if (entity.startsWith('#')) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    return named.get(entity.toLowerCase()) ?? match;
  });
}

function textFromHtml(value = '') {
  return decodeEntities(String(value)
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n\n')
    .replace(/<\/li\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function tagValue(block, tagName) {
  const escaped = tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(block).match(new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, 'i'));
  return decodeEntities((match?.[1] || '').replace(/^\s*<!\[CDATA\[/, '').replace(/\]\]>\s*$/, '').trim());
}

function normalizeDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? '' : date.toISOString();
}

function isHttpUrl(value) {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(url, {
      headers: { 'user-agent': 'satyam.lol external-feed sync' },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`${url} returned ${response.status}`);
    return response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function bloggerPosts(payload) {
  return (payload?.feed?.entry || []).map((entry) => {
    const href = entry.link?.find((link) => link.rel === 'alternate')?.href || '';
    const published = normalizeDate(entry.published?.$t || entry.updated?.$t);
    const postId = String(entry.id?.$t || '').match(/post-(\d+)$/)?.[1]
      || href.replace(/^https?:\/\//, '').replace(/\W+/g, '-').replace(/^-|-$/g, '');
    return {
      id: `blogger-${postId}`,
      title: textFromHtml(entry.title?.$t || 'Untitled'),
      published,
      year: published.slice(0, 4),
      href
    };
  }).filter((post) => post.id && post.title && post.published && isHttpUrl(post.href));
}

function letterboxdReviews(xml, minimumCharacters) {
  return [...String(xml).matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)]
    .map((match) => {
      const item = match[1];
      const description = tagValue(item, 'description');
      const film = tagValue(item, 'letterboxd:filmTitle');
      const href = tagValue(item, 'link');
      const guid = tagValue(item, 'guid');
      const poster = description.match(/<img\b[^>]*\bsrc=["']([^"']+)["']/i)?.[1] || '';
      const review = textFromHtml(description.replace(/<p>\s*<img\b[^>]*>\s*<\/p>/gi, ''));
      const ratingValue = Number.parseFloat(tagValue(item, 'letterboxd:memberRating'));
      const published = normalizeDate(tagValue(item, 'pubDate'));
      const reviewCharacters = [...review].length;

      return {
        id: guid || href.replace(/^https?:\/\//, '').replace(/\W+/g, '-').replace(/^-|-$/g, ''),
        film,
        filmYear: tagValue(item, 'letterboxd:filmYear'),
        rating: Number.isFinite(ratingValue) ? ratingValue : null,
        watchedDate: tagValue(item, 'letterboxd:watchedDate'),
        published,
        review,
        reviewCharacters,
        href,
        poster: isHttpUrl(poster) ? poster : ''
      };
    })
    .filter((review) => review.film
      && review.reviewCharacters > minimumCharacters
      && review.published
      && isHttpUrl(review.href));
}

function mergeReviews(currentItems, fetchedItems, minimumCharacters) {
  const byId = new Map();
  for (const review of [...(currentItems || []), ...(fetchedItems || [])]) {
    if (!review?.id || !review.film || review.reviewCharacters <= minimumCharacters || !review.published) continue;
    byId.set(review.id, { ...byId.get(review.id), ...review });
  }
  return [...byId.values()].sort((left, right) => Date.parse(right.published) - Date.parse(left.published));
}

async function readJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function refreshOrReuse({ name, url, currentItems, currentMetadata, transform }) {
  try {
    const source = await fetchText(url);
    const items = transform(source);
    return {
      items,
      metadata: { url, fetchedAt: new Date().toISOString(), status: 'fresh' }
    };
  } catch (error) {
    if (!Array.isArray(currentItems)) throw error;
    console.warn(`${name} refresh failed; using the existing cache (${error.message})`);
    return {
      items: currentItems,
      metadata: { ...currentMetadata, url, status: 'cached' }
    };
  }
}

async function main() {
  const home = await readJson(HOME_PATH);
  const config = home?.externalFeeds;
  if (!config) throw new Error('content/home.json requires an externalFeeds object');

  const outputPath = path.resolve(ROOT, config.cache);
  if (!outputPath.startsWith(`${ROOT}${path.sep}`)) throw new Error('externalFeeds.cache must stay inside the repository');
  const current = await readJson(outputPath);
  const minimumCharacters = config.reviewMinCharacters;
  if (!Number.isInteger(minimumCharacters) || minimumCharacters < 1) {
    throw new Error('externalFeeds.reviewMinCharacters must be a positive integer');
  }

  const [blogger, letterboxd] = await Promise.all([
    refreshOrReuse({
      name: 'Blogger',
      url: config.blogger,
      currentItems: current?.writing,
      currentMetadata: current?.sources?.blogger,
      transform: (source) => bloggerPosts(JSON.parse(source))
    }),
    refreshOrReuse({
      name: 'Letterboxd',
      url: config.letterboxd,
      currentItems: current?.reviews,
      currentMetadata: current?.sources?.letterboxd,
      transform: (source) => letterboxdReviews(source, minimumCharacters)
    })
  ]);

  const output = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sources: {
      blogger: blogger.metadata,
      letterboxd: {
        ...letterboxd.metadata,
        reviewMinCharacters: minimumCharacters
      }
    },
    writing: blogger.items,
    reviews: mergeReviews(current?.reviews, letterboxd.items, minimumCharacters)
  };

  const tempPath = `${outputPath}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  await rename(tempPath, outputPath);
  console.log(`Synced ${output.writing.length} Blogger posts and ${output.reviews.length} long Letterboxd reviews (including cached history).`);
}

await main();

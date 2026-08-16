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

function reviewCharacterCount(value = '') {
  return [...String(value)].length;
}

function normalizeReview(review) {
  const text = String(review?.review || '').trim();
  return {
    ...review,
    review: text,
    reviewCharacters: reviewCharacterCount(text)
  };
}

function isQualifyingReview(review, minimumCharacters) {
  return review?.id
    && review?.film
    && review?.published
    && reviewCharacterCount(review.review) > minimumCharacters;
}

function isHttpUrl(value) {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

async function fetchText(url, { retries = 2 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(url, {
        headers: { 'user-agent': 'satyam.lol external-feed sync' },
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`${url} returned ${response.status}`);
      return response.text();
    } catch (error) {
      lastError = error;
      if (attempt < retries) await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError;
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
      const reviewCharacters = reviewCharacterCount(review);

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
    const normalized = normalizeReview(review);
    if (!isQualifyingReview(normalized, minimumCharacters)) continue;
    byId.set(normalized.id, { ...byId.get(normalized.id), ...normalized });
  }
  return [...byId.values()].sort((left, right) => Date.parse(right.published) - Date.parse(left.published));
}

function attributeValue(block, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(block).match(new RegExp(`${escaped}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'i'));
  return decodeEntities(match?.[2] || '');
}

function archiveProfilePrefix(archiveUrl) {
  const pathname = new URL(archiveUrl).pathname;
  return pathname.match(/^(.*)\/reviews(?:\/|$)/i)?.[1] || '';
}

function archiveFilmHref(value, archiveUrl) {
  if (!value) return '';
  const archive = new URL(archiveUrl);
  const profilePrefix = archiveProfilePrefix(archiveUrl);
  const resolved = new URL(value, archive);
  if (resolved.pathname.startsWith('/film/') && profilePrefix) {
    resolved.pathname = `${profilePrefix}${resolved.pathname}`;
  }
  return resolved.toString();
}

function reviewRatingFromLabel(label) {
  const value = String(label || '');
  const fullStars = (value.match(/★/g) || []).length;
  if (!fullStars && !value.includes('½')) return null;
  return fullStars + (value.includes('½') ? 0.5 : 0);
}

function archiveArticles(html) {
  return [...String(html).matchAll(/<article\b[^>]*data-object-name=["']review["'][^>]*>[\s\S]*?<\/article>/gi)]
    .map((match) => match[0]);
}

function archivePageCount(html) {
  const pageNumbers = [...String(html).matchAll(/\/reviews\/films\/page\/(\d+)\//gi)].map((match) => Number(match[1]));
  return Math.max(1, ...pageNumbers.filter(Number.isInteger));
}

function parseArchiveArticle(article, archiveUrl) {
  const viewingId = attributeValue(article, 'data-object-id').match(/(?:^|:)(\d+)$/)?.[1]
    || attributeValue(article, 'data-object-id').match(/(\d+)$/)?.[1];
  if (!viewingId) return null;

  const filmTitleHtml = article.match(/<h2\b[^>]*class=["'][^"']*\bprimaryname\b[^"']*["'][\s\S]*?<a\b[^>]*>([\s\S]*?)<\/a>/i)?.[1]
    || attributeValue(article, 'data-item-full-display-name');
  const film = textFromHtml(filmTitleHtml).replace(/\s+\(\d{4}\)$/, '').trim();
  const filmYear = article.match(/<span\b[^>]*class=["'][^"']*\breleasedate\b[^"']*["'][\s\S]*?<a\b[^>]*>(\d{4})<\/a>/i)?.[1]
    || attributeValue(article, 'data-item-full-display-name').match(/\((\d{4})\)$/)?.[1]
    || '';
  const watchedDate = article.match(/<time\b[^>]*class=["'][^"']*\btimestamp\b[^"']*["'][^>]*datetime=["'](\d{4}-\d{2}-\d{2})["']/i)?.[1] || '';
  const bodyMatch = article.match(/<div\b[^>]*class=["'][^"']*\bjs-review-body\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
  const bodyHtml = bodyMatch?.[1] || '';
  const review = textFromHtml(bodyHtml);
  const fullTextPath = attributeValue(article, 'data-full-text-url');
  const hrefPath = attributeValue(article, 'data-item-link')
    || article.match(/<a\b[^>]*href=["']([^"']*\/film\/[^"']*)["'][^>]*class=["'][^"']*\bcontext\b[^"']*["']/i)?.[1]
    || '';
  const posterPath = attributeValue(article, 'data-poster-url');
  const ratingLabel = article.match(/aria-label=["']([^"']*★[^"']*)["']/i)?.[1] || '';

  return {
    id: `letterboxd-review-${viewingId}`,
    film,
    filmYear,
    rating: reviewRatingFromLabel(ratingLabel),
    watchedDate,
    published: normalizeDate(watchedDate ? `${watchedDate}T00:00:00Z` : ''),
    review,
    reviewCharacters: reviewCharacterCount(review),
    href: archiveFilmHref(hrefPath, archiveUrl),
    poster: posterPath ? new URL(posterPath, archiveUrl).toString() : '',
    fullTextPath,
    needsFullText: Boolean(fullTextPath && (bodyHtml.includes('collapsed-text') || review.endsWith('…')))
  };
}

function parseFullTextResponse(payload) {
  let source = String(payload || '');
  try {
    const json = JSON.parse(source);
    source = json.text || json.review || json.html || source;
  } catch {
    // Letterboxd normally returns an HTML fragment, not JSON.
  }
  const body = source.match(/<div\b[^>]*class=["'][^"']*\bjs-review-body\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]
    || source.match(/<div\b[^>]*class=["'][^"']*\bbody-text\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]
    || source;
  return textFromHtml(body);
}

async function mapWithConcurrency(values, limit, mapper) {
  const results = new Array(values.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker));
  return results;
}

function archivePageUrl(archiveUrl, page) {
  if (page === 1) return archiveUrl;
  return `${archiveUrl.replace(/\/?$/, '/')}page/${page}/`;
}

async function letterboxdArchiveReviews({ archiveUrl, currentItems, recentItems }) {
  const firstPage = await fetchText(archiveUrl, { retries: 3 });
  const totalPages = archivePageCount(firstPage);
  const pageNumbers = Array.from({ length: totalPages - 1 }, (_, index) => index + 2);
  const remainingPages = await mapWithConcurrency(pageNumbers, 3, async (page) => ({
    page,
    html: await fetchText(archivePageUrl(archiveUrl, page), { retries: 3 })
  }));
  const pages = [{ page: 1, html: firstPage }, ...remainingPages];
  const parsed = pages.flatMap(({ html }) => archiveArticles(html)
    .map((article) => parseArchiveArticle(article, archiveUrl))
    .filter(Boolean));
  const known = new Map([...(currentItems || []), ...(recentItems || [])].map((review) => [review.id, review]));

  const reviews = await mapWithConcurrency(parsed, 4, async (review) => {
    const cached = known.get(review.id);
    let text = cached?.review || review.review;
    if (review.needsFullText && !cached?.review) {
      try {
        text = parseFullTextResponse(await fetchText(new URL(review.fullTextPath, archiveUrl).toString(), { retries: 2 }));
      } catch (error) {
        console.warn(`Could not load full text for ${review.id}; skipping the truncated archive entry (${error.message})`);
        return null;
      }
    }
    return normalizeReview({ ...review, ...cached, review: text });
  });

  return {
    items: reviews.filter(Boolean),
    pages: totalPages,
    entries: parsed.length
  };
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

async function refreshLetterboxd({ config, current, minimumCharacters }) {
  const recent = await refreshOrReuse({
    name: 'Letterboxd RSS',
    url: config.letterboxd,
    currentItems: current?.reviews,
    currentMetadata: current?.sources?.letterboxd,
    transform: (source) => letterboxdReviews(source, minimumCharacters)
  });

  try {
    const archive = await letterboxdArchiveReviews({
      archiveUrl: config.letterboxdArchive,
      currentItems: current?.reviews,
      recentItems: recent.items
    });
    return {
      items: mergeReviews(current?.reviews, [...archive.items, ...recent.items], minimumCharacters),
      metadata: {
        ...recent.metadata,
        archiveUrl: config.letterboxdArchive,
        archiveStatus: 'fresh',
        archivePages: archive.pages,
        archiveEntries: archive.entries
      }
    };
  } catch (error) {
    console.warn(`Letterboxd archive refresh failed; using RSS and the existing cache (${error.message})`);
    return {
      items: mergeReviews(current?.reviews, recent.items, minimumCharacters),
      metadata: {
        ...recent.metadata,
        archiveUrl: config.letterboxdArchive,
        archiveStatus: 'cached',
        archiveError: error.message
      }
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
    refreshLetterboxd({ config, current, minimumCharacters })
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
    reviews: letterboxd.items
  };

  const tempPath = `${outputPath}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  await rename(tempPath, outputPath);
  console.log(`Synced ${output.writing.length} Blogger posts and ${output.reviews.length} long Letterboxd reviews (including cached history).`);
}

await main();

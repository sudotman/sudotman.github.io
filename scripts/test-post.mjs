#!/usr/bin/env node

/**
 * Regression tests for the post file format.
 *
 * The editor writes these files and the build script reads them back, so a
 * round-trip that loses or mangles a field silently corrupts a post on save.
 * Every file in content/posts is also round-tripped as a real-world case.
 */

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { dateLabel, normalizePost, parseFrontmatter, serializePost, sortPosts, toIsoDate } from '../js/lib/post.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const POSTS_DIR = path.join(ROOT, 'content/posts');

const failures = [];
let checks = 0;

function check(name, condition, detail = '') {
  checks += 1;
  if (!condition) failures.push(`${name}${detail ? `\n    ${detail}` : ''}`);
}

function roundTrip(name, data, body) {
  const file = serializePost(data, body);
  const parsed = parseFrontmatter(file);
  for (const [key, value] of Object.entries(data)) {
    if (value === '' || value === false || (Array.isArray(value) && !value.length)) {
      check(`${name}: ${key} is omitted when empty`, !(key in parsed.data), JSON.stringify(parsed.data));
      continue;
    }
    check(
      `${name}: ${key} survives`,
      JSON.stringify(parsed.data[key]) === JSON.stringify(value),
      `wrote ${JSON.stringify(value)}, read ${JSON.stringify(parsed.data[key])}\n    file: ${JSON.stringify(file.slice(0, 240))}`
    );
  }
  check(`${name}: body survives`, parsed.body === body.trim(), `read ${JSON.stringify(parsed.body.slice(0, 120))}`);
  return file;
}

roundTrip('plain', { title: 'A simple post', date: '2026-08-30' }, 'Body text.');

// Titles are the field most likely to carry YAML-hostile punctuation.
roundTrip('colon title', { title: 'Grimes: Intersection of Art Pop', date: '2026-08-30' }, 'x');
roundTrip('quoted title', { title: 'the "youtuber voice" problem', date: '2026-08-30' }, 'x');
roundTrip('apostrophe title', { title: "scorsese's cinema", date: '2026-08-30' }, 'x');
roundTrip('leading dash title', { title: '- not a list item', date: '2026-08-30' }, 'x');
roundTrip('hash title', { title: '#hashtag opener', date: '2026-08-30' }, 'x');
roundTrip('bracket title', { title: '[draft] something', date: '2026-08-30' }, 'x');
roundTrip('boolean-looking title', { title: 'true', date: '2026-08-30' }, 'x');

roundTrip('full frontmatter', {
  title: 'Everything at once',
  date: '2026-08-30',
  updated: '2026-09-01',
  summary: 'A summary with: a colon, a "quote" and a — dash.',
  tags: ['essays', 'the internet'],
  cover: '/images/blog/cover.png',
  coverAlt: 'A cover image',
  legacyUrl: 'https://blog.satyam.lol/2026/08/x.html',
  draft: true
}, '# Heading\n\nParagraph.\n\n- a\n- b');

roundTrip('empty fields are dropped', {
  title: 'Kept',
  date: '2026-08-30',
  summary: '',
  tags: [],
  cover: '',
  draft: false
}, 'x');

// Body content that could be mistaken for frontmatter must not confuse the split.
const trickyBody = '---\n\nA horizontal rule opened the post.\n\n---\n\nAnd another.';
const trickyParsed = parseFrontmatter(serializePost({ title: 'Rules', date: '2026-08-30' }, trickyBody));
check('a body starting with --- is not eaten', trickyParsed.body === trickyBody, JSON.stringify(trickyParsed.body));
check('frontmatter still parses beside it', trickyParsed.data.title === 'Rules', JSON.stringify(trickyParsed.data));

// A file with no frontmatter is treated as all body rather than throwing.
const bare = parseFrontmatter('Just prose, no frontmatter.');
check('bare file parses as body', bare.body === 'Just prose, no frontmatter.' && Object.keys(bare.data).length === 0);

// Block list syntax is accepted even though the serialiser emits inline lists.
const blockList = parseFrontmatter('---\ntitle: Block\ndate: 2026-08-30\ntags:\n  - one\n  - two\n---\n\nbody\n');
check('block lists parse', JSON.stringify(blockList.data.tags) === '["one","two"]', JSON.stringify(blockList.data));

check('serializePost ends with exactly one newline', serializePost({ title: 'x', date: '2026-08-30' }, 'body\n\n\n').endsWith('body\n'));

// Dates are formatted in UTC so a label never shifts under a local timezone.
check('dateLabel formats in UTC', dateLabel('2025-07-27T00:00:00.000Z') === '27 jul 2025', dateLabel('2025-07-27T00:00:00.000Z'));
check('dateLabel handles a bare date', dateLabel('2021-08-26') === '26 aug 2021', dateLabel('2021-08-26'));
check('toIsoDate trims a timestamp', toIsoDate('2025-07-27T15:57:00.001Z') === '2025-07-27');
check('toIsoDate rejects nonsense', toIsoDate('not a date') === '');

const normalized = normalizePost({
  slug: 'a-post',
  data: { title: 'A Post', date: '2025-07-27', tags: ['Essays', 'essays', ' Film '] },
  body: 'word '.repeat(440)
});
check('normalizePost builds the href', normalized.href === '/blog/a-post/', normalized.href);
check('normalizePost dedupes and lowercases tags', JSON.stringify(normalized.tags) === '["essays","film"]', JSON.stringify(normalized.tags));
check('normalizePost derives a summary when none is given', normalized.summary.length > 0 && normalized.summary.endsWith('…'));
check('normalizePost counts reading time', normalized.minutes === 2, String(normalized.minutes));
check('normalizePost exposes the year', normalized.year === '2025', normalized.year);

// The post page hides its header summary when it is just the opening lines
// repeated; the flag it keys off has to be right in both directions.
check('normalizePost flags a missing summary as generated', normalized.summaryIsGenerated === true);
const withSummary = normalizePost({
  slug: 'b-post',
  data: { title: 'B Post', date: '2025-07-27', summary: 'A hand-written summary.' },
  body: 'Some unrelated body text that the summary does not repeat.'
});
check('normalizePost keeps an explicit summary verbatim', withSummary.summary === 'A hand-written summary.', withSummary.summary);
check('normalizePost flags an explicit summary as not generated', withSummary.summaryIsGenerated === false);

const ordered = sortPosts([
  { title: 'b', published: '2021-01-01T00:00:00.000Z' },
  { title: 'a', published: '2025-01-01T00:00:00.000Z' }
]);
check('sortPosts puts the newest first', ordered[0].title === 'a');

// Every real post has to survive a load-edit-save cycle byte for byte.
const files = (await readdir(POSTS_DIR)).filter((name) => name.endsWith('.md')).sort();
check('there are posts to check', files.length > 0);

for (const file of files) {
  const original = await readFile(path.join(POSTS_DIR, file), 'utf8');
  const { data, body } = parseFrontmatter(original);
  const rewritten = serializePost(data, body);
  check(`${file} round-trips unchanged`, rewritten === original, `re-serialising changed the file; diff at byte ${
    [...original].findIndex((character, index) => character !== rewritten[index])
  }`);

  const post = normalizePost({ slug: file.replace(/\.md$/, ''), data, body });
  check(`${file} has a title`, Boolean(post.title) && post.title !== 'Untitled');
  check(`${file} has a valid date`, Boolean(post.published), String(data.date));
  check(`${file} has a summary`, post.summary.length > 20);
}

if (failures.length) {
  console.error(`Post format failed ${failures.length} of ${checks} checks:`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log(`Post format passed ${checks} checks across ${files.length} real posts.`);
}

/**
 * Post file format: frontmatter parsing, serialising and normalisation.
 *
 * Shared by `scripts/build-blog.mjs` and the browser editor so a file the
 * editor writes is byte-for-byte what the build script expects to read back.
 *
 * The frontmatter dialect is a deliberate YAML subset — scalars, inline lists
 * and block lists. Anything richer would need a real YAML parser, and posts
 * have never needed one.
 */

import { excerpt, markdownToText, readingMinutes, slugify, wordCount } from './markdown.js';

const DELIMITER = '---';

/** Written in this order so hand edits and editor saves produce equal files. */
export const FIELD_ORDER = ['title', 'date', 'updated', 'summary', 'tags', 'cover', 'coverAlt', 'legacyUrl', 'draft'];

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function unquote(value) {
  const text = String(value).trim();
  if (/^"[\s\S]*"$/.test(text)) {
    return text.slice(1, -1).replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\');
  }
  if (/^'[\s\S]*'$/.test(text)) return text.slice(1, -1).replace(/''/g, "'");
  return text;
}

function parseScalar(value) {
  const text = String(value).trim();
  if (!text) return '';
  if (/^\[[\s\S]*\]$/.test(text)) {
    const inner = text.slice(1, -1).trim();
    return inner ? inner.split(',').map((entry) => unquote(entry)).filter(Boolean) : [];
  }
  if (text === 'true') return true;
  if (text === 'false') return false;
  return unquote(text);
}

/** Splits a post file into its frontmatter object and its markdown body. */
export function parseFrontmatter(source = '') {
  const text = String(source).replaceAll('\r\n', '\n').replace(/^﻿/, '');
  if (!text.startsWith(`${DELIMITER}\n`)) return { data: {}, body: text.trim() };

  const end = text.indexOf(`\n${DELIMITER}`, DELIMITER.length);
  if (end === -1) return { data: {}, body: text.trim() };

  const head = text.slice(DELIMITER.length + 1, end);
  const body = text.slice(text.indexOf('\n', end + 1) + 1);
  const data = {};
  let listKey = '';

  for (const line of head.split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;

    const listItem = line.match(/^\s*-\s+(.*)$/);
    if (listItem && listKey) {
      data[listKey].push(unquote(listItem[1]));
      continue;
    }

    const pair = line.match(/^([A-Za-z][\w-]*)\s*:\s*([\s\S]*)$/);
    if (!pair) continue;

    const [, key, rawValue] = pair;
    if (!rawValue.trim()) {
      data[key] = [];
      listKey = key;
      continue;
    }
    data[key] = parseScalar(rawValue);
    listKey = '';
  }

  return { data, body: body.replace(/^\n+/, '').trimEnd() };
}

function quoteIfNeeded(value) {
  const text = String(value);
  if (text === '') return '""';
  if (/^[\s]|[\s]$/.test(text)) return JSON.stringify(text);
  if (/^[-?:,[\]{}#&*!|>'"%@`]/.test(text)) return JSON.stringify(text);
  if (/:\s|\s#/.test(text)) return JSON.stringify(text);
  if (/^(?:true|false|null|~)$/i.test(text)) return JSON.stringify(text);
  if (text.includes('\n')) return JSON.stringify(text);
  return text;
}

export function serializeFrontmatter(data = {}) {
  const keys = [...FIELD_ORDER.filter((key) => key in data), ...Object.keys(data).filter((key) => !FIELD_ORDER.includes(key))];
  const lines = [];

  for (const key of keys) {
    const value = data[key];
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (!value.length) continue;
      lines.push(`${key}: [${value.map((entry) => quoteIfNeeded(entry)).join(', ')}]`);
      continue;
    }
    if (typeof value === 'boolean') {
      if (value) lines.push(`${key}: true`);
      continue;
    }
    lines.push(`${key}: ${quoteIfNeeded(value)}`);
  }

  return lines.join('\n');
}

/** Renders a complete `.md` file. Always ends with exactly one newline. */
export function serializePost(data = {}, body = '') {
  const head = serializeFrontmatter(data);
  const text = String(body).replaceAll('\r\n', '\n').trim();
  return `${DELIMITER}\n${head}\n${DELIMITER}\n\n${text}\n`;
}

export function isValidDate(value) {
  return Boolean(value) && !Number.isNaN(new Date(value).valueOf());
}

/** Formats as "27 jul 2025" in UTC, so the label never shifts by timezone. */
export function dateLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return '';
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

export function toIsoDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? '' : date.toISOString().slice(0, 10);
}

/**
 * Turns a parsed file into the record every surface renders from: the build
 * script, the blog index, the homepage list and the editor's post picker.
 */
export function normalizePost({ slug, data = {}, body = '' }) {
  const id = String(slug || slugify(data.title || '')).trim();
  const published = isValidDate(data.date) ? new Date(data.date).toISOString() : '';
  const tags = (Array.isArray(data.tags) ? data.tags : [])
    .map((tag) => String(tag).trim().toLowerCase())
    .filter(Boolean);

  return {
    id,
    slug: id,
    href: `/blog/${id}/`,
    title: String(data.title || 'Untitled').trim(),
    published,
    updated: isValidDate(data.updated) ? new Date(data.updated).toISOString() : '',
    date: published.slice(0, 10),
    dateLabel: dateLabel(published),
    year: published.slice(0, 4),
    summary: String(data.summary || '').trim() || excerpt(body, 200),
    tags: [...new Set(tags)],
    draft: data.draft === true,
    cover: String(data.cover || '').trim(),
    coverAlt: String(data.coverAlt || '').trim(),
    legacyUrl: String(data.legacyUrl || '').trim(),
    words: wordCount(body),
    minutes: readingMinutes(body),
    text: markdownToText(body),
    body
  };
}

export function sortPosts(posts = []) {
  return [...posts].sort((left, right) => {
    const gap = Date.parse(right.published || 0) - Date.parse(left.published || 0);
    return gap || left.title.localeCompare(right.title, undefined, { sensitivity: 'base' });
  });
}

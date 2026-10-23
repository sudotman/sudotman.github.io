/**
 * Every document the studio can edit, and the changeset sitting on top of them.
 *
 * Documents are read from the served site rather than from GitHub, so the
 * studio opens and reads without a token. Edits accumulate here and in
 * localStorage; nothing reaches the repository until the publish screen sends
 * them, together, as one commit.
 *
 * Files are written back as `JSON.stringify(value, null, 2)` with a trailing
 * newline, which is byte-for-byte how they are committed today. A studio diff
 * therefore shows the change and nothing else.
 */

import { deepEqual, describe } from './diff.js';

export const PATHS = {
  home: 'content/home.json',
  feed: 'content/programming.json',
  manifest: 'content.json',
  creative: 'content/creative.json',
  profile: 'profile.json',
  reel: 'content/reel.json'
};

/** Documents the site works fine without; a missing one is not an error. */
const OPTIONAL = new Set(['reel']);

const STORE_KEY = 'satyam.studio.changeset';

const originals = new Map();
const originalText = new Map();
const current = new Map();
const missing = new Set();
const staleEdits = new Set();
const listeners = new Set();

let loaded = false;

/* ---------- plumbing ---------- */

export const serialize = (value) => `${JSON.stringify(value, null, 2)}\n`;

const clone = (value) => (value === undefined ? undefined : structuredClone(value));

/** FNV-1a. Only needs to notice that a document moved, not to resist anyone. */
function fingerprint(text) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

function storage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function announce() {
  for (const listener of listeners) listener();
}

/* ---------- persistence ---------- */

function persist() {
  const docs = {};
  const basis = {};
  for (const name of dirtyNames()) {
    docs[name] = current.get(name);
    basis[name] = fingerprint(originalText.get(name) || '');
  }
  try {
    if (!Object.keys(docs).length) storage()?.removeItem(STORE_KEY);
    else storage()?.setItem(STORE_KEY, JSON.stringify({ savedAt: new Date().toISOString(), docs, basis }));
  } catch {
    // A full or blocked store costs the author the safety net, not the edits.
  }
}

function restore() {
  let saved;
  try {
    saved = JSON.parse(storage()?.getItem(STORE_KEY) || '');
  } catch {
    return;
  }
  if (!saved?.docs) return;

  for (const [name, value] of Object.entries(saved.docs)) {
    if (!(name in PATHS) || !originals.has(name)) continue;
    current.set(name, value);
    // The document moved underneath an edit made against an older copy. The
    // edit is kept — losing work silently is worse — but the author is told.
    if (saved.basis?.[name] !== fingerprint(originalText.get(name) || '')) staleEdits.add(name);
  }
}

/* ---------- loading ---------- */

export async function load() {
  originals.clear();
  originalText.clear();
  current.clear();
  missing.clear();
  staleEdits.clear();

  await Promise.all(Object.entries(PATHS).map(async ([name, path]) => {
    try {
      const response = await fetch(`/${path}`, { cache: 'no-cache' });
      if (!response.ok) throw new Error(String(response.status));
      const text = await response.text();
      originalText.set(name, text);
      originals.set(name, JSON.parse(text));
      current.set(name, JSON.parse(text));
    } catch (error) {
      if (!OPTIONAL.has(name)) throw new Error(`could not read /${path}: ${error.message}`);
      missing.add(name);
    }
  }));

  restore();
  loaded = true;
  announce();
}

export const isLoaded = () => loaded;
export const isMissing = (name) => missing.has(name);
export const isStale = (name) => staleEdits.has(name);
export const pathOf = (name) => PATHS[name];
export const textOf = (name) => originalText.get(name) || '';

/* ---------- reading and writing ---------- */

export function doc(name) {
  return current.get(name);
}

export function original(name) {
  return originals.get(name);
}

/**
 * Edits a document through a copy, so a view can mutate freely without the
 * pristine original or the undo path ever being touched.
 */
export function edit(name, mutate) {
  if (!current.has(name) && !OPTIONAL.has(name)) throw new Error(`${name} is not loaded`);
  const draft = clone(current.get(name));
  const result = mutate(draft);
  current.set(name, result === undefined ? draft : result);
  staleEdits.delete(name);
  persist();
  announce();
}

/** Replaces a whole document — how a missing optional one is first created. */
export function replace(name, value) {
  current.set(name, value);
  if (!originals.has(name)) {
    originals.set(name, missing.has(name) ? undefined : originals.get(name));
    originalText.set(name, originalText.get(name) || '');
  }
  persist();
  announce();
}

export function discard(name) {
  if (name) {
    if (originals.has(name)) current.set(name, clone(originals.get(name)));
    else current.delete(name);
    staleEdits.delete(name);
  } else {
    for (const key of Object.keys(PATHS)) {
      if (originals.has(key)) current.set(key, clone(originals.get(key)));
      else current.delete(key);
    }
    staleEdits.clear();
  }
  persist();
  announce();
}

/* ---------- what changed ---------- */

export function isDirty(name) {
  if (!current.has(name)) return false;
  if (!originals.has(name)) return true;
  return !deepEqual(originals.get(name), current.get(name));
}

export function dirtyNames() {
  return Object.keys(PATHS).filter(isDirty);
}

export function changes(name) {
  return describe(originals.get(name), current.get(name));
}

export function changeCount() {
  return dirtyNames().reduce((total, name) => total + changes(name).length, 0);
}

/** `[{ name, path, text, changes }]` — exactly what a commit would carry. */
export function changeset() {
  return dirtyNames().map((name) => ({
    name,
    path: PATHS[name],
    text: serialize(current.get(name)),
    changes: changes(name)
  }));
}

/** Called once a commit lands: the new state becomes the pristine one. */
export function settle() {
  for (const name of dirtyNames()) {
    originals.set(name, clone(current.get(name)));
    originalText.set(name, serialize(current.get(name)));
    missing.delete(name);
  }
  staleEdits.clear();
  persist();
  announce();
}

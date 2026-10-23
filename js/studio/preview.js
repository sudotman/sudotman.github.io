/**
 * Showing the real site with uncommitted edits.
 *
 * The studio and the site are the same origin, so the pending documents can be
 * handed over in sessionStorage and the front door asked to render from them
 * instead of fetching. That is a few lines in js/landing.js and in the inline
 * loader in index.html, and it means a colour pair or a renamed film can be
 * seen on the page it belongs to rather than approximated here.
 *
 * The preview is per-tab and never leaves the browser.
 */

import * as store from './store.js';

export const PREVIEW_KEY = 'satyam.studio.preview';

/** The pending state of every document, keyed by the path the site fetches. */
function payload() {
  const docs = {};
  for (const [name, path] of Object.entries(store.PATHS)) {
    const value = store.doc(name);
    if (value !== undefined) docs[path] = value;
  }
  return { savedAt: new Date().toISOString(), docs, reel: store.doc('reel') };
}

/**
 * Opens `path` in a new tab with the changeset applied. Returns false when the
 * handover could not be written, so the caller can say so rather than opening
 * a tab that quietly shows the live site instead.
 */
export function openPreview(path) {
  try {
    sessionStorage.setItem(PREVIEW_KEY, JSON.stringify(payload()));
  } catch {
    return false;
  }
  const url = new URL(path, location.origin);
  url.searchParams.set('studio-preview', '1');
  window.open(url.href, 'satyam-studio-preview');
  return true;
}

/**
 * The work as a single thing, however many files it is spread across.
 *
 * On disk a project is scattered: its record is in content/home.json or
 * content/programming.json, its place on the front door is an entry in
 * home.featured, its colour pair and slug are in content/creative.json, and its
 * medium has to exist in content.json's catalog. Every view above this module
 * works with the whole work; this is where it is gathered and taken apart
 * again.
 *
 * Reading mirrors js/landing.js, so what the studio shows is what the front
 * door will render. Writing goes through store.edit, so each operation lands in
 * the changeset and in the diff.
 */

import * as store from './store.js';

const text = (value) => (typeof value === 'string' ? value.trim() : '');

/** Mirrors yearFor in js/landing.js. */
export const yearOf = (record) => (record.sortDate
  ? String(record.sortDate).slice(0, 4)
  : String(record.year || 'ongoing'));

export const mediumOf = (record) => String(record.medium || record.category || 'work');
export const summaryOf = (record) => text(record.summary) || text(record.short);
export const bodyOf = (record) => text(record.body) || text(record.long);

/** Where a record lives. The two files hold different shapes of the same idea. */
export const SOURCES = {
  home: { name: 'home', path: store.PATHS.home, label: 'front door record', hint: 'prose body, links as named pairs' },
  feed: { name: 'feed', path: store.PATHS.feed, label: 'archive feed', hint: 'shown on ononline too; links as a list' }
};

/* ---------- reading ---------- */

const worksOf = (name) => (store.doc(name)?.works || []);

/** Every work, gathered across both files, with everything attached to it. */
export function index() {
  const home = store.doc('home') || {};
  const creative = store.doc('creative')?.projects || [];
  const manifest = store.doc('manifest') || {};

  const featured = Array.isArray(home.featured) ? home.featured : [];
  const creativeByWork = new Map(creative.map((project) => [project.workId, project]));
  const mediums = new Map((manifest.catalog?.mediums || []).map((medium) => [medium.id, medium]));

  const gather = (source) => worksOf(source).map((record, position) => ({
    id: String(record.id || ''),
    title: String(record.title || 'Untitled'),
    source,
    position,
    record,
    medium: mediumOf(record),
    mediumEntry: mediums.get(record.category || record.medium) || null,
    year: yearOf(record),
    summary: summaryOf(record),
    body: bodyOf(record),
    featured: featured.indexOf(String(record.id || '')),
    creative: creativeByWork.get(String(record.id || '')) || null
  }));

  const all = [...gather('home'), ...gather('feed')];
  const byId = new Map(all.map((work) => [work.id, work]));

  // The front door's own two tiers: the author's order leads, the rest follows
  // alphabetically, each work appearing exactly once.
  const leads = featured.map((id) => byId.get(id)).filter(Boolean);
  const leadIds = new Set(leads.map((work) => work.id));
  const rest = all
    .filter((work) => !leadIds.has(work.id))
    .sort((left, right) => left.title.localeCompare(right.title, undefined, { numeric: true, sensitivity: 'base' }));

  return { all, byId, featured, leads, rest, creative, mediums };
}

/**
 * Everything that would break, or already reads oddly, on the live site.
 * A client-side subset of scripts/validate-content.mjs, shown before a commit
 * rather than after a failed build.
 */
export function problems() {
  const model = index();
  const found = [];
  const add = (severity, message, where = '') => found.push({ severity, message, where });

  const seen = new Map();
  for (const work of model.all) {
    if (!work.id) add('error', 'a work has no id', SOURCES[work.source].label);
    else if (seen.has(work.id)) add('error', `two works share the id "${work.id}"`, `${SOURCES[seen.get(work.id)].label} and ${SOURCES[work.source].label}`);
    else seen.set(work.id, work.source);

    if (!work.summary) add('warning', `${work.title} has no summary`, work.id);
    if (!work.body) add('warning', `${work.title} has no body`, work.id);
    if (work.source === 'feed' && work.record.category && !model.mediums.has(work.record.category)) {
      add('error', `${work.title} uses the medium "${work.record.category}", which is not in the catalog`, work.id);
    }
  }

  for (const id of model.featured) {
    if (!model.byId.has(id)) add('error', `featured lists "${id}", which is not a work`, 'home.featured');
  }

  const slugs = new Map();
  for (const project of model.creative) {
    if (!model.byId.has(project.workId)) {
      add('error', `the creative archive points at "${project.workId}", which is not a work`, project.slug);
    }
    if (slugs.has(project.slug)) add('error', `two creative projects share the slug "${project.slug}"`, project.slug);
    else slugs.set(project.slug, project.workId);
  }

  return found;
}

/* ---------- the front door's order ---------- */

export function setFeatured(ids) {
  store.edit('home', (home) => {
    home.featured = [...ids];
  });
}

export function toggleFeatured(id) {
  const featured = index().featured;
  setFeatured(featured.includes(id) ? featured.filter((entry) => entry !== id) : [...featured, id]);
}

/** Moves a lead by `delta` places, clamped — the keyboard path for dragging. */
export function nudgeFeatured(id, delta) {
  const featured = [...index().featured];
  const from = featured.indexOf(id);
  if (from < 0) return;
  const to = Math.min(featured.length - 1, Math.max(0, from + delta));
  if (to === from) return;
  featured.splice(to, 0, ...featured.splice(from, 1));
  setFeatured(featured);
}

/** Drops `id` at `to`, the index it should end up at once it has been lifted. */
export function moveFeatured(id, to) {
  const featured = [...index().featured];
  const from = featured.indexOf(id);
  if (from < 0) return;
  featured.splice(from, 1);
  featured.splice(Math.min(Math.max(0, to), featured.length), 0, id);
  setFeatured(featured);
}

/* ---------- records ---------- */

export function updateWork(id, patch) {
  const work = index().byId.get(id);
  if (!work) return;
  store.edit(work.source, (document_) => {
    const record = document_.works[work.position];
    for (const [key, value] of Object.entries(patch)) {
      const empty = value === undefined || value === ''
        || (Array.isArray(value) && !value.length)
        || (value && typeof value === 'object' && !Array.isArray(value) && !Object.keys(value).length);
      if (empty) delete record[key];
      else record[key] = value;
    }
  });
}

/** Renaming an id has to carry every reference with it, or the work vanishes. */
export function renameWork(id, nextId) {
  const work = index().byId.get(id);
  if (!work || !nextId || nextId === id) return;

  store.edit(work.source, (document_) => {
    document_.works[work.position].id = nextId;
  });
  store.edit('home', (home) => {
    home.featured = (home.featured || []).map((entry) => (entry === id ? nextId : entry));
  });
  store.edit('creative', (creative) => {
    for (const project of creative.projects || []) {
      if (project.workId === id) project.workId = nextId;
    }
  });
}

export function createWork(source, record) {
  store.edit(source, (document_) => {
    document_.works = [...(document_.works || []), record];
  });
}

export function deleteWork(id) {
  const work = index().byId.get(id);
  if (!work) return;

  store.edit(work.source, (document_) => {
    document_.works = document_.works.filter((record) => record.id !== id);
  });
  store.edit('home', (home) => {
    home.featured = (home.featured || []).filter((entry) => entry !== id);
  });
  store.edit('creative', (creative) => {
    creative.projects = (creative.projects || []).filter((project) => project.workId !== id);
  });
}

/* ---------- moving a record between the two files ---------- */

/**
 * The two files describe a work differently, so a move is a translation:
 *
 *   home                      feed
 *   medium          ←→        category
 *   summary         ←→        short
 *   body            ←→        long
 *   links {k: href} ←→        links [{label, href}]
 *   images [...]    ←→        gallery [...]
 *
 * `year` has no home in the feed, where the front door falls back to
 * "ongoing"; it is kept on the record anyway, so moving back restores it.
 */
export function translate(record, to) {
  const next = { ...record };
  if (to === 'feed') {
    if (next.medium !== undefined) { next.category = next.medium; delete next.medium; }
    if (next.summary !== undefined) { next.short = next.summary; delete next.summary; }
    if (next.body !== undefined) { next.long = next.body; delete next.body; }
    if (next.links && !Array.isArray(next.links)) {
      next.links = Object.entries(next.links).map(([label, href]) => ({ label, href }));
    }
    if (Array.isArray(next.images)) { next.gallery = next.images; delete next.images; }
    // The feed requires a cover, a legacy image, or an explicit text presentation.
    if (!next.image && !next.cover) next.presentation = 'text';
    return next;
  }

  if (next.category !== undefined) { next.medium = next.category; delete next.category; }
  if (next.short !== undefined) { next.summary = next.short; delete next.short; }
  if (next.long !== undefined) { next.body = next.long; delete next.long; }
  if (Array.isArray(next.links)) {
    next.links = Object.fromEntries(next.links.map((link) => [link.label || link.kind || 'link', link.href]));
    if (!Object.keys(next.links).length) delete next.links;
  }
  if (Array.isArray(next.gallery)) { next.images = next.gallery; delete next.gallery; }
  if (next.image && !next.images) { next.images = [next.image]; delete next.image; }
  delete next.presentation;
  delete next.tracks;
  if (!next.year) next.year = 'ongoing';
  return next;
}

export function moveWork(id, to) {
  const work = index().byId.get(id);
  if (!work || work.source === to) return;
  const translated = translate(work.record, to);

  store.edit(work.source, (document_) => {
    document_.works = document_.works.filter((record) => record.id !== id);
  });
  store.edit(to, (document_) => {
    document_.works = [...(document_.works || []), translated];
  });
}

/* ---------- the creative archive ---------- */

export function upsertCreative(workId, project) {
  store.edit('creative', (creative) => {
    creative.projects = creative.projects || [];
    const position = creative.projects.findIndex((entry) => entry.workId === workId);
    const next = { workId, ...project };
    if (position < 0) creative.projects.push(next);
    else creative.projects[position] = { ...creative.projects[position], ...next };
  });
}

export function removeCreative(workId) {
  store.edit('creative', (creative) => {
    creative.projects = (creative.projects || []).filter((project) => project.workId !== workId);
  });
}

/** A starting point for a work joining the archive, so no field opens empty. */
export function creativeDraft(work) {
  const slug = work.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || work.id;
  return { workId: work.id, slug, discipline: work.medium.replaceAll('_', ' '), color: '#f0ede4', accent: '#141411' };
}

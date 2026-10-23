/**
 * ononline's shell and taxonomy: content.json.
 *
 * The catalog is what every archive-feed work is filed under, so a medium
 * removed here while a work still uses it fails the build. The counts next to
 * each entry say how many works would be orphaned before that happens.
 */

import { MEDIUM, SITE_HEADER, TRACK } from '../../lib/schema.js';
import { button, el, plural } from '../dom.js';
import { form } from '../fields.js';
import * as model from '../model.js';
import * as store from '../store.js';

const section = (title, note, ...body) => el('fieldset.studio-section', {},
  el('legend.studio-section__head', {},
    el('span.studio-section__title', {}, title),
    note ? el('span.studio-section__note', {}, note) : null),
  ...body);

function usage() {
  const mediums = new Map();
  const tracks = new Map();
  const defaults = store.doc('feed')?.source?.defaultTracks || [];

  for (const work of model.index().all) {
    const medium = work.record.category || work.record.medium;
    if (medium) mediums.set(medium, (mediums.get(medium) || 0) + 1);
    if (work.source !== 'feed') continue;
    for (const track of (work.record.tracks?.length ? work.record.tracks : defaults)) {
      tracks.set(track, (tracks.get(track) || 0) + 1);
    }
  }
  return { mediums, tracks };
}

function header(context) {
  return section('site header', 'the masthead on /tech.html',
    el('div.studio-grid', {}, form(SITE_HEADER, store.doc('manifest').siteHeader, (key, value) => {
      store.edit('manifest', (document_) => {
        if (value === undefined || value === '') delete document_.siteHeader[key];
        else document_.siteHeader[key] = value;
      });
    }, { refresh: context.refresh })));
}

function taxonomy(kind, schema, context, counts, note) {
  const entries = store.doc('manifest').catalog?.[kind] || [];

  const card = (entry, position) => el('div.chip-card', { style: { borderLeftColor: entry.accent || '#000' } },
    el('div.studio-item__head', {},
      el('span.studio-item__name', {}, entry.id),
      el('span', {},
        el('span.studio-section__note', {}, plural(counts.get(entry.id) || 0, 'work')),
        ' ',
        button('remove', {
          class: 'studio-mini',
          onclick: () => {
            const used = counts.get(entry.id) || 0;
            if (used && !confirm(`${plural(used, 'work')} still use “${entry.id}”. Removing it fails the build until they are refiled. Remove anyway?`)) return;
            if (!used && !confirm(`Remove “${entry.id}” from the catalog?`)) return;
            store.edit('manifest', (document_) => { document_.catalog[kind].splice(position, 1); });
            context.refresh();
          }
        }))),
    ...form(schema, entry, (key, value) => {
      store.edit('manifest', (document_) => {
        if (value === undefined || value === '') delete document_.catalog[kind][position][key];
        else document_.catalog[kind][position][key] = value;
      });
    }, { refresh: context.refresh }));

  return section(kind, note,
    el('div.chip-grid', {}, entries.map(card)),
    el('div.studio-actions', {}, button(`add a ${kind.replace(/s$/, '')}`, {
      class: 'studio-action',
      onclick: () => {
        const id = prompt(`What is the ${kind.replace(/s$/, '')} called? Lowercase, no spaces.`);
        if (!id?.trim()) return;
        const key = id.trim().toLowerCase().replace(/\s+/g, '_');
        if (entries.some((entry) => entry.id === key)) {
          return context.setStatus(`${key} is already in the catalog.`, 'error');
        }
        store.edit('manifest', (document_) => {
          document_.catalog[kind].push({ id: key, label: key.replaceAll('_', ' '), accent: '#A8FF51' });
        });
        context.refresh();
      }
    })));
}

function sources(context) {
  const entries = store.doc('manifest').catalog?.sources || [];
  return section('sources', 'the feed files the archive reads',
    el('ul.studio-changes', {}, entries.map((source) => el('li', {},
      `${source.id} → ${source.src} · default tracks ${(source.defaultTracks || []).join(', ') || 'none'}`))),
    el('p.record-residency__note', {},
      'Feed files are registered here and listed again in content/home.json under sources. '
      + 'Adding one is a repository change rather than a content one, so the studio shows them without editing them.'),
    context ? null : null);
}

function render(main, context) {
  const counts = usage();
  main.append(header(context));
  main.append(taxonomy('mediums', MEDIUM, context, counts.mediums,
    'every archive-feed work must use one of these'));
  main.append(taxonomy('tracks', TRACK, context, counts.tracks,
    'the two columns the archive sorts into'));
  main.append(sources(context));
}

export default {
  id: 'ononline',
  label: 'ononline',
  title: 'ononline',
  lede: 'The shell and taxonomy behind /tech.html. Every archive-feed work is filed under one of these mediums, '
    + 'so the counts matter before anything is removed.',
  render
};

/**
 * One work, whole, across every file it lives in.
 *
 * The fields come from the schema for whichever file holds the record, because
 * content/home.json and content/programming.json describe the same idea
 * differently. Underneath them is the residency row: which file the record is
 * in, whether it leads the front door, whether the creative archive carries it
 * and in what colours, and which medium ononline files it under. Each card
 * names the file it writes, so nothing here is magic.
 */

import { CREATIVE_PROJECT, FEED_WORK, HOME_WORK } from '../../lib/schema.js';
import { button, el } from '../dom.js';
import { field, form } from '../fields.js';
import * as model from '../model.js';
import * as store from '../store.js';

const SOURCE_LABEL = {
  home: 'content/home.json',
  feed: 'content/programming.json'
};

function mediumOptions() {
  const catalog = store.doc('manifest')?.catalog?.mediums || [];
  return catalog.map((medium) => [medium.id, `${medium.id} — ${medium.label}`]);
}

function schemaFor(work) {
  if (work.source === 'home') return HOME_WORK;
  return FEED_WORK.map((descriptor) =>
    (descriptor.key === 'category' ? { ...descriptor, options: mediumOptions().map(([id]) => id) } : descriptor));
}

/* ---------- residency ---------- */

function residencyCard({ title, file, on, note, body }) {
  return el('div.record-residency__card', { dataset: { on: String(on) } },
    el('p.record-residency__title', {},
      el('span', {}, title),
      el('span.record-residency__file', {}, file)),
    note ? el('p.record-residency__note', {}, note) : null,
    body || null);
}

function livesIn(work, redraw) {
  const other = work.source === 'home' ? 'feed' : 'home';
  const target = model.SOURCES[other];

  return residencyCard({
    title: 'lives in',
    file: SOURCE_LABEL[work.source],
    on: true,
    note: model.SOURCES[work.source].hint,
    body: el('div.studio-actions', {}, button(`move to the ${target.label}`, {
      class: 'studio-action',
      onclick: () => {
        const translated = model.translate(work.record, other);
        const gained = Object.keys(translated).filter((key) => !(key in work.record));
        const lost = Object.keys(work.record).filter((key) => !(key in translated));
        const summary = [
          gained.length ? `becomes ${gained.join(', ')}` : '',
          lost.length ? `loses ${lost.join(', ')}` : ''
        ].filter(Boolean).join('; ');

        if (!confirm(`Move “${work.title}” to ${SOURCE_LABEL[other]}?\n\n${summary || 'The record carries over unchanged.'}`)) return;
        model.moveWork(work.id, other);
        redraw();
      }
    }))
  });
}

function frontDoor(work, redraw) {
  const featured = work.featured >= 0;
  const total = model.index().featured.length;

  return residencyCard({
    title: 'front door',
    file: 'content/home.json → featured',
    on: featured,
    note: featured
      ? `lead ${work.featured + 1} of ${total}`
      : 'listed under “everything else”, alphabetically',
    body: el('div.studio-actions', {},
      button(featured ? 'stop featuring' : 'feature this', {
        class: 'studio-action',
        onclick: () => {
          model.toggleFeatured(work.id);
          redraw();
        }
      }),
      featured ? button('earlier', {
        class: 'studio-mini',
        disabled: work.featured === 0,
        onclick: () => {
          model.nudgeFeatured(work.id, -1);
          redraw();
        }
      }) : null,
      featured ? button('later', {
        class: 'studio-mini',
        disabled: work.featured === total - 1,
        onclick: () => {
          model.nudgeFeatured(work.id, 1);
          redraw();
        }
      }) : null)
  });
}

function creativeArchive(work, redraw) {
  const project = work.creative;

  const body = el('div');
  if (project) {
    const schema = CREATIVE_PROJECT.filter((descriptor) => descriptor.key !== 'workId');
    const swatch = el('div.creative-tile__swatch', {
      style: { background: project.color, color: project.accent }
    }, work.title);

    body.append(swatch);
    body.append(...form(schema, project, (key, value) => {
      model.upsertCreative(work.id, { [key]: value });
      if (key === 'color') swatch.style.background = value;
      if (key === 'accent') swatch.style.color = value;
    }, { refresh: redraw }));
  }

  body.append(el('div.studio-actions', {}, button(project ? 'remove from the archive' : 'add to the archive', {
    class: project ? 'studio-action is-danger' : 'studio-action',
    onclick: () => {
      if (project) {
        if (!confirm(`Take “${work.title}” out of /living/, /river/ and /doors/?`)) return;
        model.removeCreative(work.id);
      } else {
        model.upsertCreative(work.id, model.creativeDraft(work));
      }
      redraw();
    }
  })));

  return residencyCard({
    title: 'creative archive',
    file: 'content/creative.json',
    on: Boolean(project),
    note: project ? 'rendered by /living/, /river/ and /doors/' : 'not carried by the creative routes',
    body
  });
}

function ononline(work) {
  if (work.source !== 'feed') {
    return residencyCard({
      title: 'ononline',
      file: 'content/programming.json',
      on: false,
      note: 'only the archive feed reaches ononline. Move the record there to list it.'
    });
  }

  const feedDefaults = store.doc('feed')?.source?.defaultTracks || [];
  const tracks = work.record.tracks?.length ? work.record.tracks : feedDefaults;
  const medium = work.mediumEntry;

  return residencyCard({
    title: 'ononline',
    file: 'content.json → catalog',
    on: true,
    note: `${medium ? `filed under “${medium.label}”` : `medium “${work.record.category}” is not in the catalog`}`
      + ` · track${tracks.length === 1 ? '' : 's'} ${tracks.join(', ') || 'none'}`
      + `${work.record.tracks?.length ? '' : ' (inherited from the feed)'}`,
    body: medium ? el('div.chip-card', { style: { borderLeftColor: medium.accent } },
      el('span.studio-row__label', {}, `${medium.id} · ${medium.accent}`)) : null
  });
}

/* ---------- the sheet ---------- */

export function recordSheet(id, context) {
  const sheet = el('div');

  const redraw = () => {
    const work = model.index().byId.get(id);
    sheet.replaceChildren();
    if (!work) {
      sheet.append(el('div.studio-empty', {}, 'That work is no longer in the changeset.'));
      return;
    }

    sheet.append(el('div.record-residency', {},
      livesIn(work, redraw),
      frontDoor(work, redraw),
      creativeArchive(work, redraw),
      ononline(work)));

    const schema = schemaFor(work);
    const grid = el('div.studio-grid');

    // The id is every reference the site makes to this work, so it is renamed
    // rather than edited: featured and the creative archive move with it.
    const idDescriptor = schema.find((descriptor) => descriptor.key === 'id');
    grid.append(field(idDescriptor, work.id, (_key, next) => {
      if (next && next !== work.id) {
        model.renameWork(work.id, next);
        id = next;
      }
    }, { refresh: redraw }));

    grid.append(...form(
      schema.filter((descriptor) => descriptor.key !== 'id'),
      work.record,
      (key, value) => model.updateWork(work.id, { [key]: value }),
      { refresh: redraw }
    ));

    sheet.append(el('fieldset.studio-section', {},
      el('legend.studio-section__head', {},
        el('span.studio-section__title', {}, 'the record'),
        el('span.studio-section__note', {}, SOURCE_LABEL[work.source])),
      grid));

    sheet.append(el('div.studio-actions', {}, button('delete this work', {
      class: 'studio-action is-danger',
      onclick: () => {
        if (!confirm(`Remove “${work.title}” from ${SOURCE_LABEL[work.source]}, the front door and the creative archive?`)) return;
        model.deleteWork(work.id);
        context.closeRecord();
      }
    })));
  };

  redraw();
  return sheet;
}

export function openRecord(id, context) {
  const work = model.index().byId.get(id);
  context.openRecord(work ? work.title : id, recordSheet(id, context), context.refresh);
}

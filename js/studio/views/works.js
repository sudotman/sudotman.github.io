/**
 * The works board.
 *
 * Two bands, laid out the way the front door renders them: the featured leads
 * in the author's own order, then everything else alphabetically. Arranging the
 * site is the interaction here — dragging a card is the edit — rather than
 * something that falls out of editing an array by index.
 *
 * Dragging is a poor fit for touch and for anyone not using a mouse, so every
 * move also has a button: earlier, later, feature, drop.
 */

import { button, el, plural } from '../dom.js';
import * as model from '../model.js';
import { openPreview } from '../preview.js';
import * as store from '../store.js';
import { openRecord } from './record.js';

/** Kept outside render so a refresh does not throw the author's filters away. */
const filters = { search: '', medium: '', source: '', residency: '' };

let dragging = '';

/* ---------- filtering ---------- */

function matches(work) {
  const search = filters.search.trim().toLowerCase();
  if (search && ![work.title, work.id, work.summary, work.medium].some(
    (value) => String(value).toLowerCase().includes(search))) return false;
  if (filters.medium && work.medium !== filters.medium) return false;
  if (filters.source && work.source !== filters.source) return false;
  if (filters.residency === 'featured' && work.featured < 0) return false;
  if (filters.residency === 'creative' && !work.creative) return false;
  if (filters.residency === 'nowhere' && (work.featured >= 0 || work.creative)) return false;
  return true;
}

const filtering = () => Boolean(filters.search || filters.medium || filters.source || filters.residency);

function filterBar(context) {
  const update = (key) => (event) => {
    filters[key] = event.target.value;
    context.refresh();
  };

  const mediums = [...new Set(model.index().all.map((work) => work.medium))].sort();

  const select = (key, label, options) => {
    const node = el('select', { 'aria-label': label, onchange: update(key) });
    node.append(el('option', { value: '' }, label));
    for (const option of options) {
      const [value, text] = Array.isArray(option) ? option : [option, option];
      node.append(el('option', { value, selected: filters[key] === value }, text));
    }
    return node;
  };

  const search = el('input', {
    type: 'text',
    value: filters.search,
    placeholder: 'search titles, ids, summaries',
    'aria-label': 'search works',
    oninput: (event) => { filters.search = event.target.value; context.refresh(); }
  });

  const bar = el('div.studio-filters', {},
    search,
    select('medium', 'any medium', mediums),
    select('source', 'either file', [['home', 'front door record'], ['feed', 'archive feed']]),
    select('residency', 'anywhere', [
      ['featured', 'featured'],
      ['creative', 'in the creative archive'],
      ['nowhere', 'neither']
    ]),
    filtering() ? button('clear', {
      class: 'studio-mini',
      onclick: () => {
        Object.assign(filters, { search: '', medium: '', source: '', residency: '' });
        context.refresh();
      }
    }) : null,
    button('new work', { class: 'studio-action', onclick: () => createWork(context) }),
    button('preview the front door', {
      class: 'studio-action',
      title: 'opens / in a new tab, rendered from the pending changeset',
      onclick: () => {
        if (!openPreview('/')) context.setStatus('This browser would not hand the preview over.', 'error');
        else context.setStatus('Previewing the front door with the pending changes in a new tab.', 'ok');
      }
    }));

  // Typing re-renders the board, which replaces this input; put the caret back.
  queueMicrotask(() => {
    if (!filters.search) return;
    search.focus();
    search.setSelectionRange(search.value.length, search.value.length);
  });

  return bar;
}

/* ---------- creating ---------- */

function createWork(context) {
  const title = prompt('What is the work called?');
  if (!title?.trim()) return;

  const id = `p_${title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')}`;
  if (model.index().byId.has(id)) {
    context.setStatus(`A work with the id ${id} already exists.`, 'error');
    return;
  }

  // A front-door record is the simpler shape and needs no catalog entry, so a
  // new work starts there and can be moved to the feed from its own sheet.
  model.createWork('home', {
    id,
    title: title.trim(),
    medium: 'work',
    year: String(new Date().getFullYear()),
    summary: '',
    body: ''
  });
  context.refresh();
  openRecord(id, context);
}

/* ---------- marks ---------- */

function marks(work) {
  return [
    el('span.mark', { dataset: { on: String(work.featured >= 0) }, title: work.featured >= 0 ? `lead ${work.featured + 1}` : 'not featured' }, '★'),
    el('span.mark.mark--creative', {
      dataset: { on: String(Boolean(work.creative)) },
      title: work.creative ? `creative archive · /${work.creative.slug}/` : 'not in the creative archive',
      style: work.creative ? { background: work.creative.color, color: work.creative.accent, borderColor: work.creative.color } : {}
    }, '◆'),
    el('span.mark', {
      dataset: { on: String(work.source === 'feed') },
      title: work.source === 'feed' ? 'in the archive feed, so it reaches ononline' : 'front door record only'
    }, '●')
  ];
}

/* ---------- dragging ---------- */

function draggable(node, work, onDrop) {
  node.draggable = true;
  node.addEventListener('dragstart', (event) => {
    dragging = work.id;
    node.dataset.dragging = 'true';
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', work.id);
  });
  node.addEventListener('dragend', () => {
    dragging = '';
    delete node.dataset.dragging;
  });
  node.addEventListener('dragover', (event) => {
    if (!dragging || dragging === work.id) return;
    event.preventDefault();
    node.dataset.over = 'true';
  });
  node.addEventListener('dragleave', () => delete node.dataset.over);
  node.addEventListener('drop', (event) => {
    event.preventDefault();
    delete node.dataset.over;
    const moved = event.dataTransfer.getData('text/plain') || dragging;
    if (moved && moved !== work.id) onDrop(moved);
  });
}

function dropZone(label, onDrop) {
  const zone = el('div.board-drop', {}, label);
  zone.addEventListener('dragover', (event) => {
    if (!dragging) return;
    event.preventDefault();
    zone.dataset.over = 'true';
  });
  zone.addEventListener('dragleave', () => delete zone.dataset.over);
  zone.addEventListener('drop', (event) => {
    event.preventDefault();
    delete zone.dataset.over;
    const moved = event.dataTransfer.getData('text/plain') || dragging;
    if (moved) onDrop(moved);
  });
  return zone;
}

/* ---------- the two bands ---------- */

function leadCard(work, context, total) {
  const card = el('li.work-card', {},
    el('div.work-card__top', {},
      el('span.work-card__rank', {}, String(work.featured + 1).padStart(2, '0')),
      el('span.work-card__foot', {}, marks(work))),
    el('h3.work-card__title', {},
      button(work.title, { class: 'work-open', onclick: () => openRecord(work.id, context) })),
    el('span.work-card__meta', {}, `${work.medium.replaceAll('_', ' ')} · ${work.year}`),
    el('p.work-card__summary', {}, work.summary || 'no summary yet'),
    el('div.work-card__foot', {},
      button('↑', {
        class: 'studio-mini',
        title: 'move earlier',
        disabled: work.featured === 0,
        onclick: () => { model.nudgeFeatured(work.id, -1); context.refresh(); }
      }),
      button('↓', {
        class: 'studio-mini',
        title: 'move later',
        disabled: work.featured === total - 1,
        onclick: () => { model.nudgeFeatured(work.id, 1); context.refresh(); }
      }),
      button('drop', {
        class: 'studio-mini',
        title: 'move down to everything else',
        onclick: () => { model.toggleFeatured(work.id); context.refresh(); }
      })));

  draggable(card, work, (moved) => {
    const target = model.index().featured.indexOf(work.id);
    if (!model.index().featured.includes(moved)) model.toggleFeatured(moved);
    model.moveFeatured(moved, target < 0 ? 0 : target);
    context.refresh();
  });

  return card;
}

function restRow(work, context) {
  const node = el('li.work-row', {},
    el('span.work-row__title', {},
      button(work.title, { class: 'work-open', onclick: () => openRecord(work.id, context) })),
    el('span.work-row__meta', {}, `${work.medium.replaceAll('_', ' ')} / ${work.year}`),
    el('span.work-row__foot', {},
      marks(work),
      button('★ feature', {
        class: 'studio-mini',
        onclick: () => { model.toggleFeatured(work.id); context.refresh(); }
      })));

  draggable(node, work, () => {});
  return node;
}

/* ---------- problems ---------- */

function problemStrip() {
  const found = model.problems();
  if (!found.length) return null;
  const errors = found.filter((problem) => problem.severity === 'error');
  return el('div.studio-problems', { dataset: { severity: errors.length ? 'error' : 'warning' } },
    el('h2', {}, errors.length ? `${plural(errors.length, 'problem')} to fix` : 'worth a look'),
    el('ul', {}, found.map((problem) => el('li', { dataset: { severity: problem.severity } },
      problem.where ? `${problem.message} (${problem.where})` : problem.message))));
}

/* ---------- render ---------- */

function render(main, context) {
  const strip = problemStrip();
  if (strip) main.append(strip);
  main.append(filterBar(context));

  const { leads, rest, all } = model.index();
  const visibleLeads = leads.filter(matches);
  const visibleRest = rest.filter(matches);

  main.append(el('fieldset.studio-section', {},
    el('legend.studio-section__head', {},
      el('span.studio-section__title', {}, 'leads'),
      el('span.studio-section__note', {},
        `${plural(leads.length, 'work')}, in this order, above the fold · home.json → featured`)),
    el('ol.board-leads', {}, visibleLeads.map((work) => leadCard(work, context, leads.length))),
    visibleLeads.length === 0
      ? el('p.board-empty', {}, filtering() ? 'No leads match the filters.' : 'Nothing is featured yet.')
      : null,
    dropZone('drop a work here to feature it last', (moved) => {
      const featured = model.index().featured;
      if (!featured.includes(moved)) model.toggleFeatured(moved);
      model.moveFeatured(moved, model.index().featured.length);
      context.refresh();
    })));

  main.append(el('fieldset.studio-section', {},
    el('legend.studio-section__head', {},
      el('span.studio-section__title', {}, 'everything else'),
      el('span.studio-section__note', {},
        `${plural(rest.length, 'work')}, alphabetical${filtering() ? ` · ${visibleRest.length} shown` : ''}`)),
    el('ul.board-rest', {}, visibleRest.map((work) => restRow(work, context))),
    visibleRest.length === 0 ? el('p.board-empty', {}, 'Nothing here matches the filters.') : null,
    dropZone('drop a lead here to stop featuring it', (moved) => {
      if (model.index().featured.includes(moved)) model.toggleFeatured(moved);
      context.refresh();
    })));

  const counts = `${plural(all.length, 'work')} · ${store.doc('home').works.length} front door, `
    + `${store.doc('feed').works.length} archive feed · ${model.index().creative.length} in the creative archive`;
  main.append(el('p.studio-lede', {}, counts));
}

export default {
  id: 'works',
  label: 'works',
  title: 'works',
  lede: 'Every project, wherever its record lives. The top band is what the front door shows first, '
    + 'in this order — drag a card, or use the buttons.',
  render
};

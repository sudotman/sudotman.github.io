/**
 * The reel's copy, type and palette, laid out as a storyboard.
 *
 * Only what the viewer reads and hears, and the type it is read in. The choreography —
 * fifteen seconds, eight holds, a 116 bpm grid — stays in js/intro.js, because
 * it is timing rather than content and an editor for it would be a different
 * tool. Lists the cut is timed against, like the four xr headings, can be
 * rewritten but not lengthened: js/intro.js holds them to their length rather
 * than let a config desynchronise the reel.
 *
 * Play it opens the front door with the pending config, so a renamed film or a
 * changed typeface is on screen in fifteen seconds without a deploy.
 */

import {
  REEL_CLAUSE,
  REEL_FILM_CARD,
  REEL_PALETTE,
  REEL_SCENES,
  REEL_TILE,
  REEL_TYPE,
  checkReel
} from '../../lib/schema.js';
import { button, el } from '../dom.js';
import { field, form } from '../fields.js';
import { openPreview } from '../preview.js';
import { soundtrack } from '../soundtrack.js';
import * as store from '../store.js';

/** Scene fields whose value is a list of records rather than a plain value. */
const SUB_SCHEMA = { filmCards: REEL_FILM_CARD, clauses: REEL_CLAUSE, tiles: REEL_TILE };
const NESTED = new Set(Object.keys(SUB_SCHEMA));

const sceneAt = (id) => store.doc('reel')?.scenes?.[id] || {};

function editScene(id, key, value) {
  store.edit('reel', (reel) => {
    reel.scenes[id][key] = value;
  });
}

function editNested(id, key, index, field_, value) {
  store.edit('reel', (reel) => {
    reel.scenes[id][key][index][field_] = value;
  });
}

function nestedBlock(scene, descriptor, context) {
  const entries = sceneAt(scene.id)[descriptor.key] || [];
  const schema = SUB_SCHEMA[descriptor.type];
  const fixed = descriptor.type === 'filmCards' || descriptor.type === 'clauses';

  const card = (entry, index) => el('div.studio-item', {},
    el('div.studio-item__head', {},
      el('span.studio-item__name', {}, entry.title || entry.word || `${descriptor.label} ${index + 1}`),
      fixed ? null : button('remove', {
        class: 'studio-mini',
        onclick: () => {
          store.edit('reel', (reel) => { reel.scenes[scene.id][descriptor.key].splice(index, 1); });
          context.refresh();
        }
      })),
    ...form(schema, entry, (key, value) => editNested(scene.id, descriptor.key, index, key, value),
      { refresh: context.refresh }));

  return el('div', {},
    el('p.studio-row__label', {}, descriptor.label + (fixed ? ' — the cut is timed to these, so the count is fixed' : '')),
    el('div.studio-stack', {}, entries.map(card)),
    fixed ? null : el('div.studio-actions', {}, button(`add to ${descriptor.label}`, {
      class: 'studio-mini',
      onclick: () => {
        const blank = Object.fromEntries(schema.map((entry) => [entry.key, entry.type === 'integer' ? 0 : '']));
        store.edit('reel', (reel) => { reel.scenes[scene.id][descriptor.key].push(blank); });
        context.refresh();
      }
    })));
}

function sceneCard(scene, context) {
  const value = sceneAt(scene.id);
  const plain = scene.fields.filter((descriptor) => !NESTED.has(descriptor.type));

  return el('section.reel-scene', {},
    el('span.reel-scene__title', {}, scene.title),
    ...form(
      plain.map((descriptor) => (descriptor.type === 'fixedList' ? { ...descriptor, type: 'list' } : descriptor)),
      value,
      (key, next) => editScene(scene.id, key, next),
      { refresh: context.refresh }
    ),
    ...scene.fields
      .filter((descriptor) => NESTED.has(descriptor.type))
      .map((descriptor) => nestedBlock(scene, descriptor, context)));
}

function typeAndPalette(context) {
  const reel = store.doc('reel');

  const swatches = el('div.reel-swatches', {}, REEL_PALETTE.map((descriptor) => {
    const chip = el('div', {
      style: { width: '54px', height: '34px', border: '1px solid #000', background: reel.palette[descriptor.key] }
    });
    return el('span.reel-swatch', {}, chip, descriptor.label);
  }));

  return el('fieldset.studio-section', {},
    el('legend.studio-section__head', {},
      el('span.studio-section__title', {}, 'type & palette'),
      el('span.studio-section__note', {}, 'every scene draws from these')),
    swatches,
    el('div.studio-grid', {},
      ...form(REEL_TYPE, reel.type, (key, value) => {
        store.edit('reel', (next) => { next.type[key] = value; });
      }, { refresh: context.refresh }),
      ...REEL_PALETTE.map((descriptor) => field(descriptor, reel.palette[descriptor.key], (key, value) => {
        store.edit('reel', (next) => { next.palette[key] = value; });
        const index = REEL_PALETTE.indexOf(descriptor);
        const chip = swatches.children[index]?.firstChild;
        if (chip) chip.style.background = value;
      }, { refresh: context.refresh }))));
}

function missing(main, context) {
  main.append(el('div.studio-empty', {},
    'content/reel.json is not on the served site yet.',
    el('br'), el('br'),
    'It is committed with this change — run npm run build and reload, or publish and come back.'));
  context.setStatus('content/reel.json did not load.', 'error');
}

function render(main, context) {
  if (store.isMissing('reel') || !store.doc('reel')) return missing(main, context);

  const found = checkReel(store.doc('reel'));
  if (found.length) {
    main.append(el('div.studio-problems', { dataset: { severity: 'error' } },
      el('h2', {}, 'these would fail the build'),
      el('ul', {}, found.map((problem) => el('li', { dataset: { severity: 'error' } },
        `${problem.key}: ${problem.message}`)))));
  }

  main.append(el('div.studio-actions', {},
    button('play it', {
      class: 'studio-action is-primary',
      onclick: () => {
        if (!openPreview('/?intro')) context.setStatus('This browser would not hand the preview over.', 'error');
        else context.setStatus('Playing the reel with the pending config in a new tab.', 'ok');
      }
    }),
    el('span.studio-section__note', {}, 'opens the front door with these words, uncommitted')));

  main.append(el('div.reel-board', {},
    REEL_SCENES.map((scene) => sceneCard(scene, context))));

  main.append(soundtrack(context));

  main.append(typeAndPalette(context));

  main.append(el('p.record-residency__note', {},
    'content/reel.json is the source. npm run build writes js/reel-config.js from it, which is what the site loads; '
    + 'js/intro.js keeps a copy of every word as its fallback, so a missing or broken config costs nothing.'));
}

export default {
  id: 'reel',
  label: 'the reel',
  title: 'the reel',
  lede: 'The fifteen seconds before the front door, scene by scene. Copy, sound, type and palette are editable here; '
    + 'the choreography stays in js/intro.js.',
  render
};

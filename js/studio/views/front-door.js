/**
 * Everything on the front door that is not a work: who you are, what you are
 * on, the four branches, and where the external feeds come from.
 *
 * All of it is content/home.json. The work section is its own board — see
 * js/studio/views/works.js — because arranging it needs a different shape.
 */

import { BRANCH, EXTERNAL_FEEDS, IDENTITY, NOW_ITEM } from '../../lib/schema.js';
import { button, el } from '../dom.js';
import { form } from '../fields.js';
import { openPreview } from '../preview.js';
import * as store from '../store.js';

const section = (title, note, ...body) => el('fieldset.studio-section', {},
  el('legend.studio-section__head', {},
    el('span.studio-section__title', {}, title),
    note ? el('span.studio-section__note', {}, note) : null),
  ...body);

function identity(context) {
  const home = store.doc('home');
  return section('identity', 'the masthead, the statement and the social links',
    el('div.studio-grid', {}, form(IDENTITY, home.identity, (key, value) => {
      store.edit('home', (document_) => {
        if (value === undefined || value === '') delete document_.identity[key];
        else document_.identity[key] = value;
      });
    }, { refresh: context.refresh })));
}

function now(context) {
  const items = store.doc('home').now || [];

  const card = (item, position) => el('div.studio-item', {},
    el('div.studio-item__head', {},
      el('span.studio-item__name', {}, `now ${position + 1}`),
      el('span', {},
        button('↑', {
          class: 'studio-mini',
          disabled: position === 0,
          onclick: () => move(position, -1)
        }),
        ' ',
        button('↓', {
          class: 'studio-mini',
          disabled: position === items.length - 1,
          onclick: () => move(position, 1)
        }),
        ' ',
        button('remove', {
          class: 'studio-mini',
          onclick: () => {
            if (!confirm(`Remove “${item.title}” from now?`)) return;
            store.edit('home', (document_) => { document_.now.splice(position, 1); });
            context.refresh();
          }
        }))),
    ...form(NOW_ITEM, item, (key, value) => {
      store.edit('home', (document_) => { document_.now[position][key] = value; });
    }, { refresh: context.refresh }));

  function move(position, delta) {
    store.edit('home', (document_) => {
      const target = position + delta;
      [document_.now[position], document_.now[target]] = [document_.now[target], document_.now[position]];
    });
    context.refresh();
  }

  return section('now', 'what you are on at the moment — at least one is required',
    el('div.studio-stack', {}, items.map(card)),
    el('div.studio-actions', {}, button('add a now', {
      class: 'studio-action',
      onclick: () => {
        store.edit('home', (document_) => { document_.now = [...(document_.now || []), { title: '', text: '' }]; });
        context.refresh();
      }
    })));
}

function branches(context) {
  const all = store.doc('home').branches || {};

  const card = ([name, branch]) => el('div.studio-item', {},
    el('div.studio-item__head', {},
      el('span.studio-item__name', {}, name),
      button('remove', {
        class: 'studio-mini',
        onclick: () => {
          if (!confirm(`Take the ${name} branch off the front door? The route itself stays.`)) return;
          store.edit('home', (document_) => { delete document_.branches[name]; });
          context.refresh();
        }
      })),
    ...form(BRANCH, branch, (key, value) => {
      store.edit('home', (document_) => { document_.branches[name][key] = value; });
    }, { refresh: context.refresh }));

  return section('branches', 'the other doors out of the front page',
    el('div.studio-stack', {}, Object.entries(all).map(card)),
    el('div.studio-actions', {}, button('add a branch', {
      class: 'studio-action',
      onclick: () => {
        const name = prompt('What is the branch called? Lowercase, one word.');
        if (!name?.trim()) return;
        const key = name.trim().toLowerCase();
        if (all[key]) return context.setStatus(`There is already a branch called ${key}.`, 'error');
        store.edit('home', (document_) => {
          document_.branches[key] = { href: `/${key}/`, description: '' };
        });
        context.refresh();
      }
    })));
}

function feeds(context) {
  return section('external feeds', 'where the reviews and the writing index come from',
    el('div.studio-grid', {}, form(EXTERNAL_FEEDS, store.doc('home').externalFeeds, (key, value) => {
      store.edit('home', (document_) => { document_.externalFeeds[key] = value; });
    }, { refresh: context.refresh })));
}

function sources(context) {
  const home = store.doc('home');
  const registered = (store.doc('manifest')?.catalog?.sources || []).map((source) => source.src);

  return section('work sources', 'feeds the front door merges in besides its own records',
    el('ul.studio-changes', {}, (home.sources || []).map((source) => el('li', {},
      source,
      registered.includes(source) ? '' : ' — not registered in content.json, which fails the build'))),
    el('p.record-residency__note', {},
      'Sources are registered in content.json under catalog.sources. Adding one here without adding it there '
      + 'will not build, so the ononline screen is the place to start.'));
}

function render(main, context) {
  main.append(el('div.studio-actions', {}, button('preview the front door', {
    class: 'studio-action',
    onclick: () => {
      if (!openPreview('/')) context.setStatus('This browser would not hand the preview over.', 'error');
      else context.setStatus('Previewing the front door with the pending changes in a new tab.', 'ok');
    }
  })));
  main.append(identity(context));
  main.append(now(context));
  main.append(branches(context));
  main.append(feeds(context));
  main.append(sources(context));
}

export default {
  id: 'front-door',
  label: 'front door',
  title: 'front door',
  lede: 'Who the site says you are, what you are on, and the doors out of the front page. '
    + 'The work section has its own board.',
  render
};

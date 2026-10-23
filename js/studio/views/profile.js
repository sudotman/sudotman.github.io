/**
 * profile.json: the working history, the education, the stack and the
 * interests ononline reads.
 *
 * Plainer than the rest because the data is plain — ordered lists of records
 * with no cross-file references to keep straight.
 */

import { PROFILE_EDUCATION, PROFILE_JOB, PROFILE_ROLE } from '../../lib/schema.js';
import { button, el } from '../dom.js';
import { form } from '../fields.js';
import * as store from '../store.js';

const section = (title, note, ...body) => el('fieldset.studio-section', {},
  el('legend.studio-section__head', {},
    el('span.studio-section__title', {}, title),
    note ? el('span.studio-section__note', {}, note) : null),
  ...body);

/** The add / move / remove controls every ordered list here needs. */
function listControls({ items, position, label, onMove, onRemove }) {
  return el('span', {},
    button('↑', { class: 'studio-mini', disabled: position === 0, onclick: () => onMove(-1) }),
    ' ',
    button('↓', { class: 'studio-mini', disabled: position === items.length - 1, onclick: () => onMove(1) }),
    ' ',
    button('remove', {
      class: 'studio-mini',
      onclick: () => {
        if (!confirm(`Remove ${label}?`)) return;
        onRemove();
      }
    }));
}

function swap(list, position, delta) {
  const target = position + delta;
  [list[position], list[target]] = [list[target], list[position]];
}

function jobs(context) {
  const items = store.doc('profile').workExperience || [];

  const card = (job, position) => el('div.studio-item', {},
    el('div.studio-item__head', {},
      el('span.studio-item__name', {}, job.organization || 'untitled'),
      listControls({
        items,
        position,
        label: `“${job.organization}”`,
        onMove: (delta) => {
          store.edit('profile', (document_) => swap(document_.workExperience, position, delta));
          context.refresh();
        },
        onRemove: () => {
          store.edit('profile', (document_) => { document_.workExperience.splice(position, 1); });
          context.refresh();
        }
      })),
    el('div.studio-grid', {}, form(PROFILE_JOB, job, (key, value) => {
      store.edit('profile', (document_) => {
        if (value === undefined || value === '') delete document_.workExperience[position][key];
        else document_.workExperience[position][key] = value;
      });
    }, { refresh: context.refresh })),
    roles(job, position, context));

  return section('work', `${items.length} organisations`,
    el('div.studio-stack', {}, items.map(card)),
    el('div.studio-actions', {}, button('add an organisation', {
      class: 'studio-action',
      onclick: () => {
        store.edit('profile', (document_) => {
          document_.workExperience = [
            { organization: '', period: '', roles: [], summary: '' },
            ...(document_.workExperience || [])
          ];
        });
        context.refresh();
      }
    })));
}

function roles(job, jobPosition, context) {
  const items = job.roles || [];

  const line = (role, position) => el('div.pair-row', {},
    ...form(PROFILE_ROLE, role, (key, value) => {
      store.edit('profile', (document_) => { document_.workExperience[jobPosition].roles[position][key] = value; });
    }, { refresh: context.refresh }),
    button('remove', {
      class: 'studio-mini',
      onclick: () => {
        store.edit('profile', (document_) => { document_.workExperience[jobPosition].roles.splice(position, 1); });
        context.refresh();
      }
    }));

  return el('div', {},
    el('p.studio-row__label', {}, 'roles, newest first'),
    ...items.map(line),
    button('add a role', {
      class: 'studio-mini',
      onclick: () => {
        store.edit('profile', (document_) => {
          const target = document_.workExperience[jobPosition];
          target.roles = [{ title: '', period: '' }, ...(target.roles || [])];
        });
        context.refresh();
      }
    }));
}

function education(context) {
  const items = store.doc('profile').education || [];

  const card = (entry, position) => el('div.studio-item', {},
    el('div.studio-item__head', {},
      el('span.studio-item__name', {}, entry.institution || 'untitled'),
      listControls({
        items,
        position,
        label: `“${entry.institution}”`,
        onMove: (delta) => {
          store.edit('profile', (document_) => swap(document_.education, position, delta));
          context.refresh();
        },
        onRemove: () => {
          store.edit('profile', (document_) => { document_.education.splice(position, 1); });
          context.refresh();
        }
      })),
    el('div.studio-grid', {}, form(PROFILE_EDUCATION, entry, (key, value) => {
      store.edit('profile', (document_) => {
        if (value === undefined || value === '') delete document_.education[position][key];
        else document_.education[position][key] = value;
      });
    }, { refresh: context.refresh })));

  return section('education', `${items.length} entries · one of degree or qualification is enough`,
    el('div.studio-stack', {}, items.map(card)),
    el('div.studio-actions', {}, button('add an entry', {
      class: 'studio-action',
      onclick: () => {
        store.edit('profile', (document_) => {
          document_.education = [{ institution: '', period: '', summary: '' }, ...(document_.education || [])];
        });
        context.refresh();
      }
    })));
}

function stack(context) {
  const tech = store.doc('profile').techStack || {};

  const group = ([name, values]) => el('div.studio-item', {},
    el('div.studio-item__head', {}, el('span.studio-item__name', {}, name)),
    el('label.studio-row', { dataset: { wide: 'true' } },
      el('span.studio-row__label', {}, 'one per line'),
      el('textarea', {
        rows: 4,
        spellcheck: 'false',
        oninput: (event) => {
          const next = event.target.value.split('\n').map((entry) => entry.trim()).filter(Boolean);
          store.edit('profile', (document_) => { document_.techStack[name] = next; });
        }
      }, (values || []).join('\n'))));

  return section('tech stack', 'free-form groups',
    el('div.studio-stack', {}, Object.entries(tech).map(group)),
    el('div.studio-actions', {}, button('add a group', {
      class: 'studio-action',
      onclick: () => {
        const name = prompt('What is the group called?');
        if (!name?.trim()) return;
        store.edit('profile', (document_) => {
          document_.techStack = { ...document_.techStack, [name.trim()]: [] };
        });
        context.refresh();
      }
    })));
}

function interests(context) {
  const all = store.doc('profile').interests || {};

  const card = ([name, interest]) => el('div.studio-item', {},
    el('div.studio-item__head', {}, el('span.studio-item__name', {}, name)),
    el('div.studio-grid', {}, Object.entries(interest).map(([key, value]) =>
      el('label.studio-row', { dataset: { wide: String(key === 'description') } },
        el('span.studio-row__label', {}, key),
        key === 'description'
          ? el('textarea', {
            rows: 4,
            oninput: (event) => {
              store.edit('profile', (document_) => { document_.interests[name][key] = event.target.value; });
            }
          }, value)
          : el('input', {
            type: 'text',
            value,
            spellcheck: 'false',
            oninput: (event) => {
              store.edit('profile', (document_) => { document_.interests[name][key] = event.target.value; });
            }
          })))));

  return section('interests', 'cinema, music, books, games',
    el('div.studio-stack', {}, Object.entries(all).map(card)));
}

function render(main, context) {
  main.append(jobs(context));
  main.append(education(context));
  main.append(stack(context));
  main.append(interests(context));
}

export default {
  id: 'profile',
  label: 'profile',
  title: 'profile',
  lede: 'The working history and the interests ononline reads from profile.json.',
  render
};

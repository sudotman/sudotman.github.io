/**
 * Controls built from the field descriptors in js/lib/schema.js.
 *
 * One descriptor renders one row, and the same descriptor decides what counts
 * as a problem, so a form and its rules can never disagree. Controls report on
 * `input` and never re-render themselves: a view that rebuilt its DOM on every
 * keystroke would take the caret with it.
 */

import { fieldProblem } from '../lib/schema.js';
import { button, el, row } from './dom.js';

const lines = (value) => (Array.isArray(value) ? value.join('\n') : '');
const fromLines = (value) => value.split('\n').map((entry) => entry.trim()).filter(Boolean);

/**
 * `onChange(key, value)` fires as the author types. `refresh` is only called by
 * controls that add or remove rows, which have to rebuild to show it.
 */
export function field(descriptor, value, onChange, { context = {}, refresh = () => {} } = {}) {
  const problem = fieldProblem(descriptor, value, context);
  const options = { hint: descriptor.hint, problem, wide: descriptor.wide ?? isWide(descriptor) };

  // The row is not rebuilt as the author types — that would take the caret with
  // it — so the one thing that has to keep up, the field's own complaint, is
  // updated in place instead.
  const report = (key, next) => {
    onChange(key, next);
    const found = fieldProblem(descriptor, next, context);
    node.dataset.invalid = String(Boolean(found));
    let line = node.querySelector('.studio-row__problem');
    if (!found) return void line?.remove();
    if (!line) {
      line = el('small.studio-row__problem');
      node.append(line);
    }
    line.textContent = found;
  };

  const node = row(descriptor.label, control(descriptor, value, report, { context, refresh }), options);
  return node;
}

const isWide = (descriptor) => ['long', 'pairs', 'linkList', 'list', 'assetList'].includes(descriptor.type);

function control(descriptor, value, onChange, { context, refresh }) {
  const emit = (next) => onChange(descriptor.key, next);

  switch (descriptor.type) {
    case 'long':
      return el('textarea', {
        rows: descriptor.rows || 4,
        spellcheck: 'true',
        oninput: (event) => emit(event.target.value)
      }, String(value ?? ''));

    case 'integer':
      return el('input', {
        type: 'number',
        min: String(descriptor.min ?? 0),
        value: value ?? '',
        oninput: (event) => emit(event.target.value === '' ? undefined : Number(event.target.value))
      });

    case 'color':
      return colourControl(value, emit);

    case 'select':
      return selectControl(descriptor.options || [], value, emit, descriptor.required);

    case 'workId':
      return selectControl(context.workOptions || [], value, emit, true);

    case 'list':
    case 'assetList':
      return el('textarea', {
        rows: descriptor.rows || 3,
        spellcheck: 'false',
        placeholder: 'one per line',
        oninput: (event) => emit(fromLines(event.target.value))
      }, lines(value));

    case 'pairs':
      return pairsControl(value, emit, refresh);

    case 'linkList':
      return linkListControl(value, emit, refresh);

    default:
      return el('input', {
        type: 'text',
        value: value ?? '',
        spellcheck: String(descriptor.type === 'text'),
        oninput: (event) => emit(event.target.value)
      });
  }
}

function colourControl(value, emit) {
  const current = /^#[0-9A-Fa-f]{6}$/.test(String(value || '')) ? String(value) : '#000000';
  const swatch = el('input', {
    type: 'color',
    value: current,
    'aria-label': 'colour picker',
    oninput: (event) => {
      text.value = event.target.value;
      emit(event.target.value);
    }
  });
  const text = el('input', {
    type: 'text',
    value: value ?? '',
    spellcheck: 'false',
    oninput: (event) => {
      const next = event.target.value.trim();
      if (/^#[0-9A-Fa-f]{6}$/.test(next)) swatch.value = next;
      emit(next);
    }
  });
  return el('span.studio-colour', {}, swatch, text);
}

function selectControl(options, value, emit, required) {
  const select = el('select', { onchange: (event) => emit(event.target.value || undefined) });
  if (!required || value === undefined || value === '') {
    select.append(el('option', { value: '' }, required ? 'choose one' : '—'));
  }
  for (const option of options) {
    const [optionValue, label] = Array.isArray(option) ? option : [option, option];
    select.append(el('option', { value: optionValue, selected: optionValue === value }, label));
  }
  // An unknown value would vanish silently otherwise, taking the edit with it.
  if (value !== undefined && value !== '' && !options.some((option) => (Array.isArray(option) ? option[0] : option) === value)) {
    select.append(el('option', { value, selected: true }, `${value} (not in the catalog)`));
  }
  return select;
}

/** A name → href map, the shape home.json and identity use for links. */
function pairsControl(value, emit, refresh) {
  const pairs = Object.entries(value && typeof value === 'object' ? value : {});
  const wrap = el('div');

  const commit = (next) => emit(Object.fromEntries(next.filter(([name]) => name.trim())));

  pairs.forEach(([name, href], position) => {
    wrap.append(el('span.pair-row', {},
      el('input', {
        type: 'text',
        value: name,
        'aria-label': 'link name',
        spellcheck: 'false',
        oninput: (event) => {
          pairs[position][0] = event.target.value;
          commit(pairs);
        }
      }),
      el('input', {
        type: 'text',
        value: href ?? '',
        'aria-label': 'link href',
        spellcheck: 'false',
        oninput: (event) => {
          pairs[position][1] = event.target.value;
          commit(pairs);
        }
      }),
      button('remove', {
        class: 'studio-mini',
        onclick: () => {
          commit(pairs.filter((_, index) => index !== position));
          refresh();
        }
      })));
  });

  wrap.append(button('add a link', {
    class: 'studio-mini',
    onclick: () => {
      commit([...pairs, ['link', 'https://']]);
      refresh();
    }
  }));
  return wrap;
}

/** A list of `{ label, href }`, the shape the archive feed uses. */
function linkListControl(value, emit, refresh) {
  const links = Array.isArray(value) ? value.map((link) => ({ ...link })) : [];
  const wrap = el('div');
  const commit = () => emit(links.filter((link) => link.label?.trim() || link.href?.trim()));

  links.forEach((link, position) => {
    wrap.append(el('span.pair-row', {},
      el('input', {
        type: 'text',
        value: link.label ?? '',
        'aria-label': 'link label',
        oninput: (event) => {
          links[position].label = event.target.value;
          commit();
        }
      }),
      el('input', {
        type: 'text',
        value: link.href ?? '',
        'aria-label': 'link href',
        spellcheck: 'false',
        oninput: (event) => {
          links[position].href = event.target.value;
          commit();
        }
      }),
      button('remove', {
        class: 'studio-mini',
        onclick: () => {
          links.splice(position, 1);
          commit();
          refresh();
        }
      })));
  });

  wrap.append(button('add a link', {
    class: 'studio-mini',
    onclick: () => {
      links.push({ label: 'link', href: 'https://' });
      commit();
      refresh();
    }
  }));
  return wrap;
}

/** Every row for a record, in the order the schema declares them. */
export function form(fields, value, onChange, options = {}) {
  return fields.map((descriptor) => field(descriptor, value?.[descriptor.key], onChange, options));
}

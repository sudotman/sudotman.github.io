/**
 * Element helpers for the studio.
 *
 * Everything here builds nodes and sets textContent. The studio renders
 * repository data — work titles, link labels, review text — and nothing it
 * renders is ever handed to innerHTML, so the escaping discipline the site
 * keeps with escapeHtml is kept here by construction instead.
 */

/**
 * `el('div.card', { onclick }, child, 'text')`. The tag may carry a dot-class
 * list; attributes starting with `on` become listeners, `dataset` is spread
 * onto the dataset, everything else is set as an attribute.
 */
export function el(spec, attributes = {}, ...children) {
  const [tag, ...classes] = String(spec).split('.');
  const node = document.createElement(tag || 'div');
  if (classes.length) node.className = classes.join(' ');

  for (const [key, value] of Object.entries(attributes || {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'dataset') {
      Object.assign(node.dataset, value);
    } else if (key === 'style' && typeof value === 'object') {
      Object.assign(node.style, value);
    } else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2), value);
    } else if (key === 'text') {
      node.textContent = String(value);
    } else if (value === true) {
      node.setAttribute(key, '');
    } else {
      node.setAttribute(key, String(value));
    }
  }

  append(node, children);
  return node;
}

export function append(node, children) {
  for (const child of children.flat(Infinity)) {
    if (child === undefined || child === null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export const clear = (node) => {
  node.replaceChildren();
  return node;
};

export const button = (label, attributes = {}) => el('button', { type: 'button', ...attributes }, label);

/** A labelled control, the shape every form row in the studio takes. */
export function row(label, control, { hint = '', problem = '', wide = false } = {}) {
  return el('label.studio-row', { dataset: { wide: String(wide), invalid: String(Boolean(problem)) } },
    el('span.studio-row__label', {}, label),
    control,
    hint ? el('small.studio-row__hint', {}, hint) : null,
    problem ? el('small.studio-row__problem', {}, problem) : null);
}

/** Keeps a caret where it was across a re-render that replaced the input. */
export function restoreCaret(from, to) {
  if (!from || !to || typeof from.selectionStart !== 'number') return;
  try {
    to.setSelectionRange(from.selectionStart, from.selectionEnd);
  } catch {
    // Inputs like colour pickers have no selection; nothing to restore.
  }
}

export const plural = (count, one, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

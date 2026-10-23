/**
 * What changed, said in a way a person can check before committing.
 *
 * A line-by-line text diff of reformatted JSON is accurate and unreadable: a
 * record moving from one position to another looks like forty changed lines.
 * This walks the two values instead, keying lists by whatever identity their
 * entries carry — a work's `id`, a creative project's `slug`, a plain string —
 * so a reorder reads as a reorder and a renamed project reads as one field.
 */

const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

export function deepEqual(left, right) {
  if (left === right) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((entry, index) => deepEqual(entry, right[index]));
  }
  if (isObject(left) && isObject(right)) {
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    return [...keys].every((key) => deepEqual(left[key], right[key]));
  }
  return false;
}

const IDENTITY_KEYS = ['id', 'workId', 'slug', 'organization', 'institution', 'title'];

function keyOf(value) {
  if (typeof value === 'string') return value;
  if (isObject(value)) {
    for (const key of IDENTITY_KEYS) {
      if (typeof value[key] === 'string' && value[key].trim()) return value[key];
    }
  }
  return null;
}

/** Keys for a list, or null when they are missing or repeat. */
function listKeys(list) {
  const keys = list.map(keyOf);
  if (keys.some((key) => key === null)) return null;
  return new Set(keys).size === keys.length ? keys : null;
}

const child = (path, key) => (path ? `${path}.${key}` : String(key));
const entry = (path, key) => `${path}[${key}]`;

function walk(before, after, path, out) {
  if (deepEqual(before, after)) return;

  if (before === undefined) return void out.push({ path, kind: 'added', after });
  if (after === undefined) return void out.push({ path, kind: 'removed', before });

  if (Array.isArray(before) && Array.isArray(after)) {
    const beforeKeys = listKeys(before);
    const afterKeys = listKeys(after);

    if (beforeKeys && afterKeys) {
      const beforeMap = new Map(beforeKeys.map((key, index) => [key, before[index]]));
      const afterMap = new Map(afterKeys.map((key, index) => [key, after[index]]));

      for (const key of beforeKeys) {
        if (!afterMap.has(key)) out.push({ path: entry(path, key), kind: 'removed', before: beforeMap.get(key) });
      }
      for (const key of afterKeys) {
        if (!beforeMap.has(key)) out.push({ path: entry(path, key), kind: 'added', after: afterMap.get(key) });
        else walk(beforeMap.get(key), afterMap.get(key), entry(path, key), out);
      }

      // A reorder is its own fact; without it, moving a lead to the front of
      // the front door shows up as no change at all.
      const shared = (keys, other) => keys.filter((key) => other.includes(key));
      const beforeShared = shared(beforeKeys, afterKeys);
      const afterShared = shared(afterKeys, beforeKeys);
      if (!deepEqual(beforeShared, afterShared)) {
        out.push({ path, kind: 'reordered', before: beforeShared, after: afterShared });
      }
      return;
    }

    const length = Math.max(before.length, after.length);
    for (let index = 0; index < length; index += 1) {
      walk(before[index], after[index], entry(path, index), out);
    }
    return;
  }

  if (isObject(before) && isObject(after)) {
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
      walk(before[key], after[key], child(path, key), out);
    }
    return;
  }

  out.push({ path, kind: 'changed', before, after });
}

/** Every difference between two documents, as `[{ path, kind, before, after }]`. */
export function describe(before, after) {
  const out = [];
  walk(before, after, '', out);
  return out;
}

const TRIM = 90;

/** A value shortened for a one-line summary. */
export function preview(value) {
  if (value === undefined) return '—';
  if (typeof value === 'string') return value.length > TRIM ? `${value.slice(0, TRIM)}…` : value;
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? '' : 's'}`;
  if (isObject(value)) return `{ ${Object.keys(value).join(', ')} }`;
  return String(value);
}

/* ---------- the raw view ---------- */

const MAX_LINES = 4000;

/**
 * A line diff of the two serialised files, for the author who wants to see the
 * bytes. Plain longest-common-subsequence, with the whole file reported as
 * replaced rather than spending a few hundred megabytes on a table nobody will
 * read.
 */
export function lineDiff(beforeText, afterText) {
  const before = beforeText.split('\n');
  const after = afterText.split('\n');

  if (before.length > MAX_LINES || after.length > MAX_LINES) {
    return [{ kind: 'remove', text: beforeText }, { kind: 'add', text: afterText }];
  }

  const table = Array.from({ length: before.length + 1 }, () => new Uint32Array(after.length + 1));
  for (let i = before.length - 1; i >= 0; i -= 1) {
    for (let j = after.length - 1; j >= 0; j -= 1) {
      table[i][j] = before[i] === after[j]
        ? table[i + 1][j + 1] + 1
        : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

  const out = [];
  let i = 0;
  let j = 0;
  while (i < before.length && j < after.length) {
    if (before[i] === after[j]) out.push({ kind: 'same', text: before[i++], index: j++ });
    else if (table[i + 1][j] >= table[i][j + 1]) out.push({ kind: 'remove', text: before[i++] });
    else out.push({ kind: 'add', text: after[j++] });
  }
  while (i < before.length) out.push({ kind: 'remove', text: before[i++] });
  while (j < after.length) out.push({ kind: 'add', text: after[j++] });
  return out;
}

/** The diff with untouched stretches collapsed to a count. */
export function collapse(rows, keep = 2) {
  const out = [];
  let run = [];
  const flush = () => {
    if (!run.length) return;
    if (run.length <= keep * 2 + 1) out.push(...run);
    else {
      out.push(...run.slice(0, keep));
      out.push({ kind: 'gap', text: `… ${run.length - keep * 2} unchanged lines …` });
      out.push(...run.slice(-keep));
    }
    run = [];
  };

  for (const entry of rows) {
    if (entry.kind === 'same') run.push(entry);
    else {
      flush();
      out.push(entry);
    }
  }
  flush();
  return out;
}

/** One readable sentence per change, for the publish screen. */
export function summarise(changes) {
  return changes.map((change) => {
    switch (change.kind) {
      case 'added':
        return `added ${change.path} — ${preview(change.after)}`;
      case 'removed':
        return `removed ${change.path} — ${preview(change.before)}`;
      case 'reordered':
        return `reordered ${change.path} — ${change.after.join(', ')}`;
      default:
        return `${change.path}: ${preview(change.before)} → ${preview(change.after)}`;
    }
  });
}

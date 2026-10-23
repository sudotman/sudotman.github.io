/**
 * What every editable record in this repository looks like.
 *
 * One description per record shape, used twice: the studio builds its forms
 * from it, and it checks edits against it before anything is committed. The
 * rules mirror `scripts/validate-content.mjs`, which stays the authority — it
 * runs in CI and a commit that fails it never deploys. This module exists so
 * the author finds out at the keyboard rather than from a red Actions run.
 *
 * Keep the two in step. A rule tightened in the validator and not here means
 * the studio cheerfully commits something CI will reject.
 */

export const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const HEX_PATTERN = /^#[0-9A-Fa-f]{6}$/;
export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const hasText = (value) => typeof value === 'string' && value.trim().length > 0;
const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

/* ---------- the primitive checks ---------- */

/** Mirrors validateLinkHref: http(s), mailto, tel, a hash, or inside the repo. */
export function hrefProblem(value) {
  if (!hasText(value)) return 'must not be empty';
  const href = value.trim();
  if (/^https?:\/\//i.test(href)) {
    try {
      const url = new URL(href);
      if (!['http:', 'https:'].includes(url.protocol)) return 'only http and https are allowed';
    } catch {
      return 'must be a valid URL';
    }
    return '';
  }
  if (/^(mailto:|tel:)/i.test(href) || href.startsWith('#')) return '';
  if (href === '/') return '';
  if (href.startsWith('/')) return repoPathProblem(href.slice(1));
  if (/^[A-Za-z][A-Za-z\d+.-]*:/.test(href)) {
    return 'only http(s), mailto, tel, hash, or repository-relative links are allowed';
  }
  return repoPathProblem(href);
}

/** Mirrors resolveInsideRepo, minus the filesystem lookup CI does. */
export function repoPathProblem(value) {
  const normalized = String(value || '').split('#', 1)[0].split('?', 1)[0].replaceAll('\\', '/');
  if (!normalized) return 'the path must not be empty';
  if (normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized)) {
    return 'the path must be relative to the repository root';
  }
  const parts = [];
  for (const part of normalized.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (!parts.length) return 'the path must stay inside the repository';
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  if (!parts.length) return 'the path must stay inside the repository';
  return '';
}

/** Mirrors registerAsset: a remote URL, or a path inside the repository. */
export function assetProblem(value) {
  if (!hasText(value)) return 'must not be empty';
  const reference = value.trim();
  if (/^https?:\/\//i.test(reference)) {
    try {
      new URL(reference);
    } catch {
      return 'must be a valid URL';
    }
    return '';
  }
  return repoPathProblem(reference.startsWith('/') ? reference.slice(1) : reference);
}

/* ---------- field descriptors ---------- */

/**
 * A field is `{ key, label, type, required, hint, options }`. The studio reads
 * `type` to choose a control and `fieldProblem` reads it to choose a rule.
 */
const field = (key, label, type = 'text', extra = {}) => ({ key, label, type, required: true, ...extra });
const optional = (key, label, type = 'text', extra = {}) => field(key, label, type, { required: false, ...extra });

export function fieldProblem(descriptor, value, context = {}) {
  const { type, required } = descriptor;
  const empty = value === undefined || value === null || value === ''
    || (Array.isArray(value) && value.length === 0)
    || (typeof value === 'string' && !value.trim());

  if (empty) return required ? 'must not be empty' : '';

  switch (type) {
    case 'id':
      if (!hasText(value)) return 'must not be empty';
      if (!ID_PATTERN.test(value.trim())) return 'letters, numbers, underscores and hyphens only';
      return '';
    case 'slug':
      if (!SLUG_PATTERN.test(String(value).trim())) return 'must be a lowercase kebab-case slug';
      return '';
    case 'color':
      if (!HEX_PATTERN.test(String(value).trim())) return 'must be a six-digit hex colour, like #ffb427';
      return '';
    case 'date':
      if (!DATE_PATTERN.test(String(value).trim())) return 'must use YYYY-MM-DD';
      return '';
    case 'integer': {
      const number = Number(value);
      if (!Number.isInteger(number) || number < (descriptor.min ?? 0)) {
        return `must be a whole number of at least ${descriptor.min ?? 0}`;
      }
      return '';
    }
    case 'level': {
      const { min = 0, max = 1 } = descriptor;
      if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
        return `must be a number from ${min} to ${max}`;
      }
      return '';
    }
    case 'toggle':
      if (typeof value !== 'boolean') return 'must be true or false';
      return '';
    case 'href':
      return hrefProblem(value);
    case 'asset':
      return assetProblem(value);
    case 'repoPath':
      return repoPathProblem(String(value).replace(/^\/+/, ''));
    case 'url':
      try {
        const url = new URL(String(value));
        if (!['http:', 'https:'].includes(url.protocol)) return 'only http and https are allowed';
      } catch {
        return 'must be a valid URL';
      }
      return '';
    case 'select':
      if (descriptor.options && !descriptor.options.includes(String(value))) {
        return `must be one of ${descriptor.options.join(', ')}`;
      }
      return '';
    case 'workId':
      if (context.knownWorkIds && !context.knownWorkIds.has(String(value))) {
        return `no work has the id "${value}"`;
      }
      return '';
    case 'list':
      if (!Array.isArray(value)) return 'must be a list';
      if (value.some((entry) => !hasText(entry))) return 'no entry may be empty';
      return '';
    case 'assetList': {
      if (!Array.isArray(value)) return 'must be a list';
      const bad = value.map((entry) => assetProblem(entry)).find(Boolean);
      return bad ? `one image ${bad}` : '';
    }
    case 'pairs': {
      if (!isObject(value)) return 'must be a set of named links';
      if (descriptor.nonEmpty && !Object.keys(value).length) return 'needs at least one link';
      for (const [name, href] of Object.entries(value)) {
        if (!hasText(name)) return 'a link name is empty';
        const problem = hrefProblem(href);
        if (problem) return `${name} ${problem}`;
      }
      return '';
    }
    case 'linkList': {
      if (!Array.isArray(value)) return 'must be a list of links';
      for (const link of value) {
        if (!isObject(link)) return 'each link must have a label and an href';
        if (!hasText(link.label)) return 'a link has no label';
        const problem = hrefProblem(link.href);
        if (problem) return `${link.label || 'a link'} ${problem}`;
      }
      return '';
    }
    default:
      if (!hasText(value)) return 'must not be empty';
      return '';
  }
}

/** Every problem in one record, as `[{ key, label, message }]`. */
export function checkRecord(fields, value, context = {}) {
  const problems = [];
  for (const descriptor of fields) {
    const message = fieldProblem(descriptor, value?.[descriptor.key], context);
    if (message) problems.push({ key: descriptor.key, label: descriptor.label, message });
  }
  return problems;
}

/* ---------- the record shapes ---------- */

/** content/home.json works: prose body, links as a name → href object. */
export const HOME_WORK = [
  field('id', 'id', 'id', { hint: 'referenced by featured and the creative archive — changing it breaks both' }),
  field('title', 'title'),
  field('medium', 'medium', 'text', { hint: 'free text here, unlike the archive feed' }),
  field('year', 'year'),
  field('summary', 'summary', 'long', { rows: 3, hint: 'the line under the title on the front door' }),
  field('body', 'body', 'long', { rows: 12, hint: 'the record a visitor reads when they open it' }),
  optional('links', 'links', 'pairs', { nonEmpty: true, hint: 'present but empty is an error — remove it instead' }),
  optional('images', 'images', 'assetList')
];

/** content/programming.json works: legacy short/long, links as a list. */
export const FEED_WORK = [
  field('id', 'id', 'id'),
  field('title', 'title'),
  field('category', 'medium', 'select', { hint: 'one of the mediums registered in content.json' }),
  field('short', 'summary', 'long', { rows: 3 }),
  field('long', 'body', 'long', { rows: 10 }),
  optional('tracks', 'tracks', 'list', { hint: 'left empty, the feed default applies' }),
  optional('links', 'links', 'linkList'),
  optional('image', 'cover image', 'asset'),
  optional('gallery', 'gallery', 'assetList'),
  optional('sortDate', 'sort date', 'date'),
  optional('roles', 'roles', 'list')
];

/** content/creative.json: presentation only, pointing at a canonical work. */
export const CREATIVE_PROJECT = [
  field('workId', 'work', 'workId'),
  field('slug', 'slug', 'slug'),
  field('discipline', 'discipline'),
  optional('year', 'year override', 'text', { hint: 'left empty, the work\'s own year is used' }),
  field('color', 'colour', 'color'),
  field('accent', 'accent', 'color')
];

export const IDENTITY = [
  field('name', 'name'),
  field('role', 'role'),
  field('location', 'location'),
  field('intro', 'intro', 'long', { rows: 4 }),
  field('statement', 'statement'),
  field('email', 'email'),
  field('links', 'links', 'pairs', { nonEmpty: true })
];

export const NOW_ITEM = [
  field('title', 'title'),
  field('text', 'text', 'long', { rows: 3 })
];

export const BRANCH = [
  field('href', 'href', 'href'),
  field('description', 'description', 'long', { rows: 2 })
];

export const EXTERNAL_FEEDS = [
  field('cache', 'review cache', 'repoPath'),
  field('blog', 'blog index', 'repoPath'),
  field('letterboxd', 'letterboxd rss', 'url'),
  field('letterboxdArchive', 'letterboxd archive', 'url'),
  field('reviewMinCharacters', 'minimum review length', 'integer', { min: 1 })
];

export const SITE_HEADER = [
  field('title', 'title'),
  field('subtitle', 'subtitle'),
  field('kicker', 'kicker'),
  optional('bannerImage', 'banner image', 'asset')
];

export const TRACK = [
  field('id', 'id', 'id'),
  field('label', 'label'),
  optional('displayLabel', 'display label'),
  field('accent', 'accent', 'color')
];

export const MEDIUM = [
  field('id', 'id', 'id'),
  field('label', 'label'),
  optional('displayLabel', 'display label'),
  field('accent', 'accent', 'color')
];

export const PROFILE_JOB = [
  field('organization', 'organization'),
  optional('website', 'website', 'href'),
  field('period', 'period'),
  field('summary', 'summary', 'long', { rows: 3 })
];

export const PROFILE_ROLE = [
  field('title', 'title'),
  field('period', 'period')
];

export const PROFILE_EDUCATION = [
  optional('degree', 'degree'),
  optional('qualification', 'qualification'),
  field('institution', 'institution'),
  field('period', 'period'),
  field('summary', 'summary', 'long', { rows: 3 })
];

/* ---------- the reel ---------- */

/**
 * The copy the reel carries, scene by scene. Timing and choreography stay in
 * js/intro.js; only what the viewer reads is editable here.
 */
export const REEL_SCENES = [
  {
    id: 'front-door',
    title: '01 — front door',
    fields: [
      field('name', 'name', 'text', { hint: 'set in two lines, split on the space' }),
      field('chip', 'strapline'),
      field('marquee', 'vertical marquee', 'long', { rows: 2, hint: 'repeated five times down the left edge' }),
      field('sentence', 'the three clauses', 'clauses')
    ]
  },
  {
    id: 'xr',
    title: '02 — xr / parallax labs',
    fields: [
      field('label', 'scene label'),
      field('headings', 'headings', 'fixedList', { hint: 'four, one per beat — the cut is timed to them' }),
      field('subtitles', 'subtitles', 'fixedList', { hint: 'four, matching the headings' }),
      field('pending', 'patent chip')
    ]
  },
  {
    id: 'films',
    title: '03 — written & directed',
    fields: [
      field('label', 'viewfinder label'),
      field('subtitle', 'subtitle line'),
      field('director', 'clapperboard director'),
      field('cards', 'film cards', 'filmCards')
    ]
  },
  {
    id: 'tools',
    title: '04 — ship tools in public',
    fields: [
      field('headline', 'headline', 'fixedList', { hint: 'four words; the third starts a new line' }),
      field('chips', 'chips', 'fixedList', { hint: 'four; the first is overwritten by the repo count' }),
      field('repoCount', 'repo count', 'integer', { min: 0, hint: 'counts up from zero during the scene' }),
      field('works', 'the tile wall', 'tiles')
    ]
  },
  {
    id: 'statement',
    title: '05 — statement',
    fields: [
      field('quote', 'quote', 'long', { rows: 2, hint: 'the last word is set in italic' }),
      field('centre', 'centre of the diagram'),
      field('labels', 'the four circles', 'fixedList')
    ]
  },
  {
    id: 'sign-off',
    title: '06 — sign-off',
    fields: [
      field('url', 'url'),
      field('aside', 'aside'),
      field('credits', 'credits', 'long', { rows: 2 }),
      field('links', 'links', 'list', { hint: 'joined with dots across, stacked down' })
    ]
  }
];

export const REEL_FILM_CARD = [
  field('meta', 'meta line', 'text', { hint: 'shown in uppercase monospace' }),
  field('title', 'title'),
  field('blurb', 'blurb', 'long', { rows: 2 })
];

export const REEL_CLAUSE = [
  optional('before', 'before'),
  field('word', 'highlighted word'),
  field('style', 'style', 'select', { options: ['box', 'link', 'plain'] }),
  optional('after', 'after')
];

export const REEL_TYPE = [
  field('sans', 'sans stack'),
  field('mono', 'mono stack'),
  field('serif', 'serif stack')
];

export const REEL_PALETTE = [
  field('yellow', 'yellow', 'color'),
  field('green', 'green', 'color'),
  field('mint', 'mint', 'color'),
  field('ink', 'ink', 'color'),
  field('paper', 'paper', 'color'),
  field('river', 'river', 'color'),
  field('gold', 'gold', 'color')
];

/**
 * How the soundtrack sounds, not what it is: sounds/intro.mp3 is cut to the
 * 116 bpm grid, so the track stays with the choreography. Every level is
 * clamped again by js/intro.js, which keeps its own defaults.
 */
export const REEL_MUSIC = [
  field('on', 'sound', 'toggle', { hint: 'off, the reel plays silent and the first click skips' }),
  field('volume', 'volume', 'level', { min: 0, max: 1, step: 0.05, ends: ['hush', 'loud'] }),
  field('warmth', 'warmth', 'level', { min: 0, max: 1, step: 0.05, ends: ['clear', 'through a wall'] }),
  field('spinUp', 'tape spin-up', 'level', { min: 0, max: 0.9, step: 0.05, ends: ['instant', 'lazy'] }),
  field('pulse', 'stripe pulse', 'level', { min: 0, max: 2, step: 0.1, ends: ['still', 'bouncy'] })
];

/** One tile on the drifting wall of scene 04. */
export const REEL_TILE = [
  field('title', 'title'),
  field('meta', 'meta'),
  field('group', 'group', 'integer', { min: 0, hint: '0 xr · 1 film · 2 code · 3 art — it flies into that circle' })
];

/** Sub-records a scene holds, each checked against its own shape. */
const NESTED = { filmCards: REEL_FILM_CARD, clauses: REEL_CLAUSE, tiles: REEL_TILE };

/**
 * A `fixedList` is a list whose length the choreography depends on: four
 * headings are four beats of the cut. Entries can be rewritten; the count
 * cannot change, and js/intro.js clamps it back if it does.
 */
export function checkReel(reel, context = {}) {
  const problems = [];
  const at = (scope, found) => found.map((problem) => ({ ...problem, key: `${scope}.${problem.key}` }));

  for (const scene of REEL_SCENES) {
    const value = reel?.scenes?.[scene.id] || {};
    const plain = scene.fields.filter((descriptor) => !(descriptor.type in NESTED));
    problems.push(...at(`scenes.${scene.id}`, checkRecord(
      plain.map((descriptor) => (descriptor.type === 'fixedList' ? { ...descriptor, type: 'list' } : descriptor)),
      value,
      context
    )));

    for (const descriptor of scene.fields) {
      if (!(descriptor.type in NESTED)) continue;
      const entries = Array.isArray(value[descriptor.key]) ? value[descriptor.key] : [];
      if (!entries.length) {
        problems.push({ key: `scenes.${scene.id}.${descriptor.key}`, label: descriptor.label, message: 'needs at least one entry' });
      }
      entries.forEach((item, index) => {
        problems.push(...at(`scenes.${scene.id}.${descriptor.key}[${index}]`, checkRecord(NESTED[descriptor.type], item, context)));
      });
    }
  }

  problems.push(...at('type', checkRecord(REEL_TYPE, reel?.type || {}, context)));
  problems.push(...at('palette', checkRecord(REEL_PALETTE, reel?.palette || {}, context)));
  problems.push(...at('music', checkRecord(REEL_MUSIC, reel?.music || {}, context)));
  return problems;
}

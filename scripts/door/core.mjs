/**
 * The door: the one part of satyam.lol that is not a static file.
 *
 * It keeps two things visitors leave on the front door.
 *
 *   note from the previous visitor under the door. Only one is shown at a time: a visitor reads what
 *   the last one left, and theirs replaces it. The last KEPT are held so that a
 *   note nobody should have to read can be swept away, which brings back the one
 *   before it.
 *
 *   One word each. Every visitor may leave one word a day, in any script. They
 *   run on as one sentence at the foot of the page.
 *
 * This file is the whole of the logic and knows nothing about where it runs. It
 * takes a tiny database interface — all(sql, ...params) and run(sql, ...params)
 * — and answers a web Request with a web Response. worker.mjs gives it
 * Cloudflare D1; server.mjs gives it node:sqlite; scripts/test-door.mjs gives
 * it a database in memory.
 *
 * What it will not keep: addresses. A visitor is a salted hash of their IP,
 * used only to hold them to the limits below, and blanked after FORGET.
 */

export const LIMITS = {
  note: 200,            // characters in a note
  word: 24,             // characters in a word
  kept: 20,             // notes held, so a sweep has something to bring back
  shown: 80             // words sent with the front door's first request
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const EVERY = {
  word: 20 * HOUR,      // one word a day, with some slack for "a day"
  note: 10 * MINUTE,
  sweepsPerDay: 3,
  notesPerHour: 40,     // across everyone: nobody needs the door this busy
  wordsPerHour: 300,
  sweepsPerHour: 20
};

const FORGET = 2 * DAY;

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS words (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  word TEXT NOT NULL,
  at INTEGER NOT NULL,
  who TEXT NOT NULL DEFAULT '',
  gone INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  text TEXT NOT NULL,
  at INTEGER NOT NULL,
  who TEXT NOT NULL DEFAULT '',
  gone INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sweeps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  note INTEGER NOT NULL,
  at INTEGER NOT NULL,
  who TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS words_who ON words (who, at);
CREATE INDEX IF NOT EXISTS notes_who ON notes (who, at);
CREATE INDEX IF NOT EXISTS sweeps_who ON sweeps (who, at);
`;

const characters = (value) => [...value].length;

// A word is letters and the marks that ride on them, in any script, with an
// apostrophe or a hyphen allowed inside. No digits, no dots, no spaces: nothing
// that can be made into an address or a sentence.
const WORD = /^[\p{L}\p{M}][\p{L}\p{M}'’\-]*$/u;

// Anything that reads as somewhere to go. A note is for whoever comes next, not
// for sending them elsewhere.
const LINKISH = /(https?:|www\.|[a-z0-9-]+\.(com|net|org|io|co|ru|cn|in|me|ly|gg|app|dev|lol|xyz|info|biz|link|site|online|shop|top|click)\b|\b[\w.+-]+@[\w-]+\.[a-z]{2,})/i;

export function cleanWord(value) {
  const word = String(value ?? '').normalize('NFC').trim();
  if (!word) return { error: 'a word, please' };
  if (characters(word) > LIMITS.word) return { error: `a word, not a sentence: ${LIMITS.word} letters at most` };
  if (!WORD.test(word)) return { error: 'one word, letters only' };
  return { value: word };
}

export function cleanNote(value) {
  const text = String(value ?? '').normalize('NFC')
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return { error: 'note from the previous visitor is empty' };
  if (characters(text) > LIMITS.note) return { error: `keep it to ${LIMITS.note} characters` };
  if (!/\p{L}/u.test(text)) return { error: 'say something in words' };
  if (LINKISH.test(text)) return { error: 'no links or addresses in a note' };
  return { value: text };
}

async function hash(value) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  return [...bytes.slice(0, 12)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * @param {object} options
 * @param {{all: Function, run: Function}} options.db
 * @param {string[]} options.origins  pages allowed to write, e.g. https://satyam.lol
 * @param {string} [options.adminKey] bearer key for removing a word or a note
 * @param {string} [options.salt]     mixed into the visitor hash; set it, keep it secret
 * @param {string} [options.block]    comma-separated terms no word or note may contain
 * @param {() => number} [options.now]
 */
export function createDoor({ db, origins = [], adminKey = '', salt = '', block = '', now = Date.now }) {
  const allowed = new Set(origins.map((origin) => origin.trim().replace(/\/+$/, '')).filter(Boolean));
  const blocked = block.split(',').map((term) => term.trim().toLowerCase()).filter(Boolean);
  const isBlocked = (value) => {
    const lower = value.toLowerCase();
    return blocked.some((term) => lower.includes(term));
  };

  const count = async (sql, ...params) => Number((await db.all(sql, ...params))[0]?.n || 0);

  async function currentNote() {
    const [note] = await db.all('SELECT id, text, at FROM notes WHERE gone = 0 ORDER BY id DESC LIMIT 1');
    return note ? { id: note.id, text: note.text, at: note.at } : null;
  }

  async function latestWords(limit = LIMITS.shown) {
    const rows = await db.all('SELECT id, word FROM words WHERE gone = 0 ORDER BY id DESC LIMIT ?', limit);
    return rows.reverse().map((row) => ({ id: row.id, word: row.word }));
  }

  const totalWords = () => count('SELECT COUNT(*) AS n FROM words WHERE gone = 0');

  // Hashes are for holding someone to a limit, and the longest limit is a day.
  async function forget(at) {
    for (const table of ['words', 'notes', 'sweeps']) {
      await db.run(`UPDATE ${table} SET who = '' WHERE who != '' AND at < ?`, at - FORGET);
    }
  }

  function reply(body, status, headers) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers }
    });
  }

  async function body(request) {
    if (!/^application\/json\b/i.test(request.headers.get('Content-Type') || '')) return null;
    const raw = await request.text();
    if (raw.length > 4096) return null;
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }

  const tooSoon = (message, wait) => ({ status: 429, body: { error: message, retryAfter: Math.max(1, Math.ceil(wait / 1000)) } });

  async function leaveWord(payload, who, at) {
    const word = cleanWord(payload.word);
    if (word.error) return { status: 400, body: { error: word.error } };
    if (isBlocked(word.value)) return { status: 400, body: { error: 'not that one' } };
    const [mine] = await db.all('SELECT at FROM words WHERE who = ? AND at > ? ORDER BY at DESC LIMIT 1', who, at - EVERY.word);
    if (mine) return tooSoon('one word a day. come back tomorrow.', mine.at + EVERY.word - at);
    if (await count('SELECT COUNT(*) AS n FROM words WHERE at > ?', at - HOUR) >= EVERY.wordsPerHour) {
      return tooSoon('too many words at once. try in a while.', HOUR);
    }
    const { lastId } = await db.run('INSERT INTO words (word, at, who) VALUES (?, ?, ?)', word.value, at, who);
    return { status: 201, body: { word: { id: lastId, word: word.value }, total: await totalWords() } };
  }

  async function leaveNote(payload, who, at) {
    const note = cleanNote(payload.text);
    if (note.error) return { status: 400, body: { error: note.error } };
    if (isBlocked(note.value)) return { status: 400, body: { error: 'not that one' } };
    const [mine] = await db.all('SELECT at FROM notes WHERE who = ? AND at > ? ORDER BY at DESC LIMIT 1', who, at - EVERY.note);
    if (mine) return tooSoon('you just left one. give it a few minutes.', mine.at + EVERY.note - at);
    if (await count('SELECT COUNT(*) AS n FROM notes WHERE at > ?', at - HOUR) >= EVERY.notesPerHour) {
      return tooSoon('the door is busy. try in a while.', HOUR);
    }
    const { lastId } = await db.run('INSERT INTO notes (text, at, who) VALUES (?, ?, ?)', note.value, at, who);
    await db.run('DELETE FROM notes WHERE id NOT IN (SELECT id FROM notes ORDER BY id DESC LIMIT ?)', LIMITS.kept);
    return { status: 201, body: { note: { id: lastId, text: note.value, at } } };
  }

  // Sweeping takes note from the previous visitor off the top and shows the one beneath. It only works
  // on note from the previous visitor that is actually showing, so two people sweeping at once cannot
  // take two notes for one bad one.
  async function sweepNote(payload, who, at) {
    const showing = await currentNote();
    if (!showing || Number(payload.id) !== showing.id) return { status: 409, body: { error: 'that note is already gone', note: showing } };
    if (await count('SELECT COUNT(*) AS n FROM sweeps WHERE who = ? AND at > ?', who, at - DAY) >= EVERY.sweepsPerDay) {
      return tooSoon('that is enough sweeping for one day.', DAY);
    }
    if (await count('SELECT COUNT(*) AS n FROM sweeps WHERE at > ?', at - HOUR) >= EVERY.sweepsPerHour) {
      return tooSoon('the door is busy. try in a while.', HOUR);
    }
    await db.run('UPDATE notes SET gone = 1 WHERE id = ?', showing.id);
    await db.run('INSERT INTO sweeps (note, at, who) VALUES (?, ?, ?)', showing.id, at, who);
    return { status: 200, body: { note: await currentNote() } };
  }

  async function handle(request, { ip = '' } = {}) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const origin = (request.headers.get('Origin') || '').replace(/\/+$/, '');
    const cors = {
      Vary: 'Origin',
      ...(allowed.has(origin) ? {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400'
      } : {})
    };
    const send = (payload, status = 200) => reply(payload, status, cors);

    try {
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

      if (request.method === 'GET') {
        if (path === '/') return send({ ok: true, what: 'the door at satyam.lol' });
        if (path === '/door') {
          return send({ note: await currentNote(), words: await latestWords(), total: await totalWords(), limits: { note: LIMITS.note, word: LIMITS.word } });
        }
        if (path === '/words') {
          const after = Math.max(0, Number(url.searchParams.get('after')) || 0);
          const limit = Math.min(1000, Math.max(1, Number(url.searchParams.get('limit')) || 1000));
          const rows = await db.all('SELECT id, word FROM words WHERE gone = 0 AND id > ? ORDER BY id ASC LIMIT ?', after, limit);
          return send({ words: rows.map((row) => ({ id: row.id, word: row.word })), total: await totalWords() });
        }
        return send({ error: 'nothing here' }, 404);
      }

      // Removing something is the author's, with the key.
      if (request.method === 'DELETE') {
        if (!adminKey || request.headers.get('Authorization') !== `Bearer ${adminKey}`) return send({ error: 'not yours to remove' }, 401);
        const [, table, id] = path.match(/^\/(word|note)\/(\d+)$/) || [];
        if (!table) return send({ error: 'nothing here' }, 404);
        await db.run(`UPDATE ${table}s SET gone = 1 WHERE id = ?`, Number(id));
        return send({ ok: true });
      }

      if (request.method === 'POST') {
        // A browser always says where a cross-site write comes from; only the site may write.
        if (!allowed.has(origin)) return send({ error: 'the door only opens from the site' }, 403);
        const payload = await body(request);
        if (!payload) return send({ error: 'send JSON' }, 400);
        const at = now();
        const who = await hash(`${salt}:${ip || 'nobody'}`);
        const act = { '/word': leaveWord, '/note': leaveNote, '/note/sweep': sweepNote }[path];
        if (!act) return send({ error: 'nothing here' }, 404);
        const result = await act(payload, who, at);
        await forget(at);
        return send(result.body, result.status);
      }

      return send({ error: 'not that way' }, 405);
    } catch (error) {
      console.error(error);
      return send({ error: 'the door is stuck' }, 500);
    }
  }

  return { handle };
}

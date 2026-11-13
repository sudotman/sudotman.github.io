#!/usr/bin/env node

/**
 * Tests for the door (scripts/door/core.mjs): note from the previous visitor under it and the words.
 *
 * The door is the one part of the site that takes writing from strangers, and
 * it runs somewhere the rest of the checks never look. These run its real
 * logic against a real SQLite database held in memory, with the clock in the
 * test's hands, so the rules about what may be left and how often are pinned
 * before anything is deployed.
 */

import { readFile } from 'node:fs/promises';
import { cleanNote, cleanWord, createDoor, LIMITS, SCHEMA } from './door/core.mjs';

let sqlite;
try {
  ({ sqlite } = await import('./door/server.mjs'));
} catch (error) {
  // node:sqlite arrived in Node 22.5. The site's own checks do not need it.
  console.log(`Door tests skipped: ${error.message}`);
  process.exit(0);
}

const failures = [];
let checks = 0;

function check(name, condition, detail = '') {
  checks += 1;
  if (!condition) failures.push(`${name}${detail ? `\n    ${detail}` : ''}`);
}

const SITE = 'https://satyam.lol';
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
let clock = Date.UTC(2026, 10, 14);

function door(options = {}) {
  const db = sqlite(':memory:');
  return { db, ...createDoor({ db, origins: [SITE], adminKey: 'key', salt: 'salt', now: () => clock, ...options }) };
}

async function call(target, method, path, { body, ip = '1.1.1.1', origin = SITE, headers = {} } = {}) {
  const response = await target.handle(new Request(`https://door.test${path}`, {
    method,
    headers: { ...(origin ? { Origin: origin } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined
  }), { ip });
  return { status: response.status, headers: response.headers, json: response.status === 204 ? null : await response.json() };
}

// ── what counts as a word
for (const word of ['lamp', 'दरवाज़ा', 'دروازہ', 'naïve', "don't", 'well-worn', '門']) {
  check(`"${word}" is a word`, cleanWord(word).value === word.normalize('NFC'), JSON.stringify(cleanWord(word)));
}
for (const word of ['', '   ', 'two words', 'a.com', 'h4x', 'x'.repeat(LIMITS.word + 1), '<b>', '-dash', 'emoji🙂', 'a/b']) {
  check(`${JSON.stringify(word)} is not a word`, !!cleanWord(word).error, JSON.stringify(cleanWord(word)));
}
check('a word is trimmed', cleanWord('  lamp ').value === 'lamp');

// ── what counts as a note
check('a note is kept as written', cleanNote('the kettle is still warm.').value === 'the kettle is still warm.');
check('a note has its whitespace collapsed', cleanNote('  one\n\n two\tthree ').value === 'one two three');
check('a note loses its control characters', cleanNote('a\u202eb\u0007c').value === 'a b c', JSON.stringify(cleanNote('a\u202eb\u0007c')));
for (const text of ['', '   ', '!!!', '12345', 'see https://example.com', 'go to www.example.org now', 'cheap pills at pills.shop', 'write to me@example.com', 'x'.repeat(LIMITS.note + 1)]) {
  check(`${JSON.stringify(text.slice(0, 40))} is not a note`, !!cleanNote(text).error, JSON.stringify(cleanNote(text)));
}
check('a note may be exactly the limit', !!cleanNote('x'.repeat(LIMITS.note)).value);
check('a note may be in any script', !!cleanNote('दरवाज़ा खुला है').value && !!cleanNote('دروازہ کھلا ہے').value);
check('a note may mention a sentence with a full stop', !!cleanNote('i was here. so were you.').value, JSON.stringify(cleanNote('i was here. so were you.')));

// ── the door, empty
{
  const d = door();
  const first = await call(d, 'GET', '/door');
  check('an empty door answers', first.status === 200 && first.json.note === null && first.json.words.length === 0 && first.json.total === 0, JSON.stringify(first.json));
  check('the door says its limits', first.json.limits.note === LIMITS.note && first.json.limits.word === LIMITS.word);
  check('the site may read it', first.headers.get('Access-Control-Allow-Origin') === SITE);
  const stranger = await call(d, 'GET', '/door', { origin: 'https://elsewhere.example' });
  check('another site is not given CORS', stranger.headers.get('Access-Control-Allow-Origin') === null);
  const preflight = await call(d, 'OPTIONS', '/note');
  check('a preflight is answered', preflight.status === 204 && preflight.headers.get('Access-Control-Allow-Methods').includes('POST'));
  check('an unknown path is a 404', (await call(d, 'GET', '/elsewhere')).status === 404);
}

// ── note from the previous visitor under the door
{
  const d = door();
  const refused = await call(d, 'POST', '/note', { body: { text: 'hello' }, origin: 'https://elsewhere.example' });
  check('only the site may write', refused.status === 403, JSON.stringify(refused));
  check('a write with no origin is refused', (await call(d, 'POST', '/note', { body: { text: 'hello' }, origin: '' })).status === 403);
  check('a link is refused', (await call(d, 'POST', '/note', { body: { text: 'visit http://x.example' } })).status === 400);

  const one = await call(d, 'POST', '/note', { body: { text: 'first under the door' } });
  check('a note is left', one.status === 201 && one.json.note.text === 'first under the door', JSON.stringify(one));
  check('and is what the door shows', (await call(d, 'GET', '/door')).json.note.id === one.json.note.id);

  const again = await call(d, 'POST', '/note', { body: { text: 'and another' } });
  check('the same visitor cannot leave two in a row', again.status === 429 && again.json.retryAfter > 0, JSON.stringify(again));

  const two = await call(d, 'POST', '/note', { body: { text: 'second, from someone else' }, ip: '2.2.2.2' });
  check('the next visitor replaces it', two.status === 201 && (await call(d, 'GET', '/door')).json.note.text === 'second, from someone else');

  const stale = await call(d, 'POST', '/note/sweep', { body: { id: one.json.note.id }, ip: '3.3.3.3' });
  check('a note that is not showing cannot be swept', stale.status === 409 && stale.json.note.id === two.json.note.id, JSON.stringify(stale));

  const swept = await call(d, 'POST', '/note/sweep', { body: { id: two.json.note.id }, ip: '3.3.3.3' });
  check('sweeping brings back the one before', swept.status === 200 && swept.json.note.text === 'first under the door', JSON.stringify(swept));
  const last = await call(d, 'POST', '/note/sweep', { body: { id: one.json.note.id }, ip: '3.3.3.3' });
  check('sweeping the last leaves nothing', last.status === 200 && last.json.note === null, JSON.stringify(last));

  clock += 11 * MINUTE;
  const later = await call(d, 'POST', '/note', { body: { text: 'ten minutes on' } });
  check('the same visitor may leave another later', later.status === 201, JSON.stringify(later));
}

// ── a visitor can only sweep so much, and only so many notes are held
{
  const d = door();
  for (let i = 0; i < LIMITS.kept + 5; i += 1) {
    clock += 2 * MINUTE;
    await call(d, 'POST', '/note', { body: { text: `note number ${i}` }, ip: `10.0.0.${i}` });
  }
  const held = await d.db.all('SELECT COUNT(*) AS n FROM notes');
  check(`only ${LIMITS.kept} notes are held`, held[0].n === LIMITS.kept, JSON.stringify(held));

  let showing = (await call(d, 'GET', '/door')).json.note;
  for (let i = 0; i < 3; i += 1) showing = (await call(d, 'POST', '/note/sweep', { body: { id: showing.id }, ip: '9.9.9.9' })).json.note;
  const fourth = await call(d, 'POST', '/note/sweep', { body: { id: showing.id }, ip: '9.9.9.9' });
  check('a fourth sweep in a day is refused', fourth.status === 429, JSON.stringify(fourth));
  check('and note from the previous visitor is still there', (await call(d, 'GET', '/door')).json.note.id === showing.id);
}

// ── one word each
{
  const d = door();
  const one = await call(d, 'POST', '/word', { body: { word: 'lamp' } });
  check('a word is left', one.status === 201 && one.json.word.word === 'lamp' && one.json.total === 1, JSON.stringify(one));
  const again = await call(d, 'POST', '/word', { body: { word: 'kettle' } });
  check('one word a day', again.status === 429, JSON.stringify(again));
  check('a sentence is refused', (await call(d, 'POST', '/word', { body: { word: 'two words' }, ip: '2.2.2.2' })).status === 400);
  await call(d, 'POST', '/word', { body: { word: 'दरवाज़ा' }, ip: '2.2.2.2' });
  await call(d, 'POST', '/word', { body: { word: 'دروازہ' }, ip: '3.3.3.3' });
  const read = await call(d, 'GET', '/door');
  check('words come back in the order they were left', read.json.words.map((item) => item.word).join(' ') === 'lamp दरवाज़ा دروازہ', JSON.stringify(read.json.words));

  clock += 21 * HOUR;
  const tomorrow = await call(d, 'POST', '/word', { body: { word: 'kettle' } });
  check('and another the next day', tomorrow.status === 201 && tomorrow.json.total === 4, JSON.stringify(tomorrow));

  const page = await call(d, 'GET', '/words?after=2&limit=1');
  check('the archive pages by id', page.json.words.length === 1 && page.json.words[0].word === 'دروازہ' && page.json.total === 4, JSON.stringify(page.json));

  check('removing needs the key', (await call(d, 'DELETE', '/word/1')).status === 401);
  const removed = await call(d, 'DELETE', '/word/1', { headers: { Authorization: 'Bearer key' } });
  check('the author can remove a word', removed.status === 200 && (await call(d, 'GET', '/door')).json.total === 3);

  clock += 3 * 24 * HOUR;
  await call(d, 'POST', '/word', { body: { word: 'later' }, ip: '4.4.4.4' });
  const kept = await d.db.all("SELECT COUNT(*) AS n FROM words WHERE who != ''");
  check('visitor hashes are forgotten after two days', kept[0].n === 1, JSON.stringify(kept));
}

// ── the blocklist, and a door with no key
{
  const d = door({ block: 'kettle, Spoon', adminKey: '' });
  check('a blocked word is refused', (await call(d, 'POST', '/word', { body: { word: 'KETTLE' } })).status === 400);
  check('a blocked term inside a note is refused', (await call(d, 'POST', '/note', { body: { text: 'pass the spoon please' } })).status === 400);
  check('with no key nothing can be removed', (await call(d, 'DELETE', '/word/1', { headers: { Authorization: 'Bearer ' } })).status === 401);
  check('a body that is not JSON is refused', (await d.handle(new Request('https://door.test/word', { method: 'POST', headers: { Origin: SITE, 'Content-Type': 'application/json' }, body: 'lamp' }), { ip: '1.1.1.1' })).status === 400);
  check('a form post is refused', (await d.handle(new Request('https://door.test/word', { method: 'POST', headers: { Origin: SITE, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'word=lamp' }), { ip: '1.1.1.1' })).status === 400);
}

// ── the schema file D1 is given matches what the code creates
{
  const file = await readFile(new URL('./door/schema.sql', import.meta.url), 'utf8');
  const statements = (sql) => sql.split('\n').filter((line) => line.trim() && !line.startsWith('--')).join('\n').trim();
  check('schema.sql matches core.mjs', statements(file) === statements(SCHEMA));
}

if (failures.length) {
  console.error(`The door failed ${failures.length} of ${checks} checks:`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`The door passed ${checks} checks.`);

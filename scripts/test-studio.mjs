#!/usr/bin/env node

/**
 * Tests for the two libraries the studio stands on.
 *
 * js/lib/github.js builds the one commit that carries a whole changeset. Get
 * the sequence wrong and the studio either loses an edit or pushes over
 * someone else's work, so the call sequence is driven here against a fake.
 *
 * js/lib/schema.js has to agree with scripts/validate-content.mjs, which is
 * what CI actually enforces. The cheapest way to catch drift is to check every
 * real record in the repository against the schema: if the validator passes
 * content the schema rejects, the studio would refuse edits to a perfectly good
 * record, and if the schema passes something the validator rejects, the studio
 * would commit a change that fails the build.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { commitFiles, fromBase64, toBase64, treeEntry } from '../js/lib/github.js';
import {
  BRANCH,
  CREATIVE_PROJECT,
  EXTERNAL_FEEDS,
  FEED_WORK,
  HOME_WORK,
  IDENTITY,
  MEDIUM,
  NOW_ITEM,
  PROFILE_EDUCATION,
  PROFILE_JOB,
  PROFILE_ROLE,
  SITE_HEADER,
  TRACK,
  checkRecord,
  hrefProblem,
  repoPathProblem
} from '../js/lib/schema.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = async (relative) => JSON.parse(await readFile(path.join(ROOT, relative), 'utf8'));

const failures = [];
let checks = 0;

function check(name, condition, detail = '') {
  checks += 1;
  if (!condition) failures.push(`${name}${detail ? `\n    ${detail}` : ''}`);
}

async function throws(name, run, fragment) {
  checks += 1;
  try {
    await run();
    failures.push(`${name}\n    expected it to throw, it did not`);
  } catch (error) {
    if (!String(error.message).includes(fragment)) {
      failures.push(`${name}\n    threw "${error.message}", expected something containing "${fragment}"`);
    }
  }
}

/* ---------- base64 ---------- */

for (const sample of ['plain ascii', 'मेरे डिजिटल स्पेस में', 'दरवाज़े — “quotes” · ★', '']) {
  check(`base64 round-trips ${JSON.stringify(sample.slice(0, 20))}`, fromBase64(toBase64(sample)) === sample);
}

/* ---------- tree entries ---------- */

check('a written file is an ordinary blob', JSON.stringify(treeEntry('a.json', 'abc'))
  === JSON.stringify({ path: 'a.json', mode: '100644', type: 'blob', sha: 'abc' }));
check('a removed file carries a null sha', treeEntry('a.json', null).sha === null);

/* ---------- the commit sequence ---------- */

/** Stands in for the live request function, recording everything asked of it. */
function fakeGithub({ head = 'HEAD1', tree = 'TREE1' } = {}) {
  const calls = [];
  let blob = 0;
  const request = async (path_, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ path: path_, method: options.method || 'GET', body });

    if (path_.startsWith('git/ref/')) return { object: { sha: head } };
    if (path_.startsWith('git/commits/')) return { tree: { sha: tree } };
    if (path_ === 'git/blobs') return { sha: `BLOB${++blob}` };
    if (path_ === 'git/trees') return { sha: 'TREE2' };
    if (path_ === 'git/commits') return { sha: 'COMMIT1' };
    if (path_.startsWith('git/refs/')) return {};
    throw new Error(`unexpected call to ${path_}`);
  };
  return { calls, request };
}

{
  const { calls, request } = fakeGithub();
  const result = await commitFiles(
    [
      { path: 'content/home.json', text: '{"a":1}' },
      { path: 'content/creative.json', text: '{"b":2}' },
      { path: 'content/gone.json', remove: true }
    ],
    { message: 'studio: a change' },
    request
  );

  check('the commit sha comes back', result.commit === 'COMMIT1', JSON.stringify(result));

  const sequence = calls.map((call) => `${call.method} ${call.path}`);
  check('it reads the ref first', sequence[0] === 'GET git/ref/heads/master', sequence.join('\n    '));
  check('then the head commit', sequence[1] === 'GET git/commits/HEAD1', sequence.join('\n    '));
  check('one blob per written file, none for the removal',
    sequence.filter((entry) => entry === 'POST git/blobs').length === 2, sequence.join('\n    '));
  check('then one tree', sequence.filter((entry) => entry === 'POST git/trees').length === 1);
  check('then one commit', sequence.filter((entry) => entry === 'POST git/commits').length === 1);
  check('and the ref moves last', sequence.at(-1) === 'PATCH git/refs/heads/master', sequence.join('\n    '));

  const treeCall = calls.find((call) => call.path === 'git/trees');
  check('the tree builds on the current one', treeCall.body.base_tree === 'TREE1');
  check('the tree carries all three paths', treeCall.body.tree.length === 3, JSON.stringify(treeCall.body.tree));
  check('the removed path has a null sha',
    treeCall.body.tree.find((entry) => entry.path === 'content/gone.json').sha === null);
  check('written paths carry their blob shas',
    treeCall.body.tree.filter((entry) => /^BLOB\d$/.test(entry.sha || '')).length === 2,
    JSON.stringify(treeCall.body.tree));

  const commitCall = calls.find((call) => call.path === 'git/commits' && call.method === 'POST');
  check('the commit hangs off the old head', JSON.stringify(commitCall.body.parents) === '["HEAD1"]');
  check('the commit points at the new tree', commitCall.body.tree === 'TREE2');
  check('the commit carries the message', commitCall.body.message === 'studio: a change');

  const refCall = calls.at(-1);
  check('the ref moves to the new commit', refCall.body.sha === 'COMMIT1');

  const blobCall = calls.find((call) => call.path === 'git/blobs');
  check('blobs go up base64-encoded', blobCall.body.encoding === 'base64');
  check('and carry the file text', fromBase64(blobCall.body.content) === '{"a":1}');
}

{
  // A changeset built against an older tip must not quietly flatten whoever
  // pushed in between.
  const { request } = fakeGithub({ head: 'MOVED' });
  await throws(
    'a moved branch refuses the commit',
    () => commitFiles([{ path: 'a.json', text: '{}' }], { message: 'x', expectHead: 'HEAD1' }, request),
    'the branch moved'
  );
}

{
  const { calls, request } = fakeGithub({ head: 'HEAD1' });
  await commitFiles([{ path: 'a.json', text: '{}' }], { message: 'x', expectHead: 'HEAD1' }, request);
  check('a matching head goes through', calls.some((call) => call.path.startsWith('git/refs/')));
}

await throws('an empty changeset is refused', () => commitFiles([], { message: 'x' }), 'nothing to commit');
await throws('a commit without a message is refused',
  () => commitFiles([{ path: 'a.json', text: '{}' }], {}), 'needs a message');

/* ---------- link and path rules ---------- */

for (const href of ['https://example.com/x', 'mailto:hello@satyam.lol', 'tel:+911234567890', '/blog/', '#project=p_hear', '/', 'images/banner.jpg']) {
  check(`${href} is an acceptable href`, hrefProblem(href) === '', hrefProblem(href));
}
for (const href of ['javascript:alert(1)', 'data:text/html,x', 'ftp://example.com', '', '   ']) {
  check(`${href || '(empty)'} is refused`, hrefProblem(href) !== '');
}
check('a path may not climb out of the repository', repoPathProblem('../../etc/passwd') !== '');
check('a path may not be absolute', repoPathProblem('/etc/passwd') !== '');
check('a drive letter is not a repository path', repoPathProblem('C:/windows') !== '');
check('an ordinary path is fine', repoPathProblem('content/home.json') === '');
check('a path may step down and back up', repoPathProblem('images/../images/banner.jpg') === '');

/* ---------- the schema against the real repository ---------- */

const home = await readJson('content/home.json');
const manifest = await readJson('content.json');
const creative = await readJson('content/creative.json');
const profile = await readJson('profile.json');
const programming = await readJson('content/programming.json');

const report = (label, problems) => check(label, problems.length === 0,
  problems.map((problem) => `${problem.key}: ${problem.message}`).join('\n    '));

report('identity passes the schema', checkRecord(IDENTITY, home.identity));
report('externalFeeds passes the schema', checkRecord(EXTERNAL_FEEDS, home.externalFeeds));
home.now.forEach((item, index) => report(`now[${index}] passes the schema`, checkRecord(NOW_ITEM, item)));
Object.entries(home.branches).forEach(([name, branch]) =>
  report(`branch ${name} passes the schema`, checkRecord(BRANCH, branch)));

for (const work of home.works) {
  report(`home work ${work.id} passes the schema`, checkRecord(HOME_WORK, work));
}

// The medium is only valid against the catalog, so the options come from it.
const mediumIds = manifest.catalog.mediums.map((medium) => medium.id);
const feedWorkSchema = FEED_WORK.map((descriptor) =>
  descriptor.key === 'category' ? { ...descriptor, options: mediumIds } : descriptor);

for (const work of programming.works) {
  report(`feed work ${work.id} passes the schema`, checkRecord(feedWorkSchema, work));
}

const knownWorkIds = new Set([...home.works, ...programming.works].map((work) => work.id));
for (const project of creative.projects) {
  report(`creative ${project.slug} passes the schema`, checkRecord(CREATIVE_PROJECT, project, { knownWorkIds }));
}

report('siteHeader passes the schema', checkRecord(SITE_HEADER, manifest.siteHeader));
manifest.catalog.tracks.forEach((track) => report(`track ${track.id} passes the schema`, checkRecord(TRACK, track)));
manifest.catalog.mediums.forEach((medium) => report(`medium ${medium.id} passes the schema`, checkRecord(MEDIUM, medium)));

profile.workExperience.forEach((job) => {
  report(`job ${job.organization} passes the schema`, checkRecord(PROFILE_JOB, job));
  job.roles.forEach((role) => report(`role ${role.title} passes the schema`, checkRecord(PROFILE_ROLE, role)));
});
profile.education.forEach((entry, index) =>
  report(`education[${index}] passes the schema`, checkRecord(PROFILE_EDUCATION, entry)));

// Every featured id has to resolve, or the front door quietly drops a lead.
for (const id of home.featured) {
  check(`featured ${id} resolves to a work`, knownWorkIds.has(id));
}

/* ---------- the reel, once it exists ---------- */

try {
  const reel = await readJson('content/reel.json');
  const { checkReel } = await import('../js/lib/schema.js');
  report('content/reel.json passes the schema', checkReel(reel));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

if (failures.length) {
  console.error(`Studio libraries failed ${failures.length} of ${checks} checks:`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log(`Studio libraries passed ${checks} checks against the live content.`);
}

#!/usr/bin/env node

/**
 * Parses every script in the repository.
 *
 * This used to be a hand-maintained chain of `node --check` calls in
 * package.json, which meant a new module was only covered if someone
 * remembered to add it — and the studio arrived with a dozen of them. Walking
 * the tree cannot forget.
 *
 * Generated output is checked too: js/reel-config.js is written by a script,
 * and a script that writes a syntax error should be caught here rather than in
 * a browser.
 */

import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOTS = ['js', 'scripts'];
const SKIP = new Set(['node_modules', 'vendor']);
const EXTENSIONS = new Set(['.js', '.mjs']);

async function walk(directory) {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (SKIP.has(entry.name) || entry.name.startsWith('.')) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...await walk(full));
    else if (EXTENSIONS.has(path.extname(entry.name))) found.push(full);
  }
  return found;
}

const files = [];
for (const name of ROOTS) {
  const directory = path.join(ROOT, name);
  if (await stat(directory).then(() => true, () => false)) files.push(...await walk(directory));
}
files.sort();

const failures = [];
await Promise.all(files.map(async (file) => {
  try {
    await run(process.execPath, ['--check', file]);
  } catch (error) {
    failures.push(`${path.relative(ROOT, file).replaceAll('\\', '/')}\n${error.stderr || error.message}`);
  }
}));

if (failures.length) {
  console.error(`Syntax check failed for ${failures.length} of ${files.length} files:`);
  failures.sort().forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log(`Syntax check passed for ${files.length} files.`);
}

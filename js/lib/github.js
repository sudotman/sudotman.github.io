/**
 * The GitHub client shared by the writing desk at /write/ and the studio at
 * /studio/.
 *
 * Both tools keep a fine-grained token in this browser's localStorage under the
 * same key, so one token scoped to this repository with Contents: read and
 * write serves both. The token leaves this device only as an Authorization
 * header to api.github.com. Nothing here talks to any other origin, and nothing
 * here writes the token anywhere but that one localStorage key.
 *
 * Two ways to commit:
 *
 *   putFile / removeFile  the contents API, one file, one commit. What the
 *                         writing desk needs: a post is a single file.
 *
 *   commitFiles           the git data API — blobs, a tree, a commit, a ref
 *                         move. What the studio needs: a change to the front
 *                         door can touch four files, and four contents-API
 *                         calls would be four commits and four deploys.
 */

const STORE = {
  token: 'satyam.write.token',
  config: 'satyam.write.config'
};

export const DEFAULT_CONFIG = { owner: 'sudotman', repo: 'sudotman.github.io', branch: 'master' };

/* ---------- stored settings ---------- */

function storage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    // A browser with site data blocked throws on the property itself.
    return null;
  }
}

export function readToken() {
  return storage()?.getItem(STORE.token) || '';
}

export function writeToken(value) {
  const store = storage();
  if (!store) return;
  const trimmed = String(value || '').trim();
  if (trimmed) store.setItem(STORE.token, trimmed);
  else store.removeItem(STORE.token);
}

export function forgetToken() {
  storage()?.removeItem(STORE.token);
}

export function hasToken() {
  return Boolean(readToken());
}

export function readConfig() {
  try {
    return { ...DEFAULT_CONFIG, ...(JSON.parse(storage()?.getItem(STORE.config) || '') || {}) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function writeConfig(partial = {}) {
  const next = {
    owner: String(partial.owner || '').trim() || DEFAULT_CONFIG.owner,
    repo: String(partial.repo || '').trim() || DEFAULT_CONFIG.repo,
    branch: String(partial.branch || '').trim() || DEFAULT_CONFIG.branch
  };
  try {
    storage()?.setItem(STORE.config, JSON.stringify(next));
  } catch {
    // Nothing to do: the caller carries on against the defaults.
  }
  return next;
}

/* ---------- encoding ---------- */

/** btoa only handles latin-1, so UTF-8 has to be widened byte by byte first. */
export function toBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** The inverse, for file contents the contents API hands back base64-encoded. */
export function fromBase64(encoded) {
  const binary = atob(String(encoded).replace(/\s+/g, ''));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/* ---------- requests ---------- */

/**
 * One call against this repository. A 404 comes back as `{ missing: true }`
 * rather than throwing, because "the file is not there yet" is an ordinary
 * answer for both tools; anything else throws with GitHub's own message.
 */
export async function request(path, options = {}) {
  const { owner, repo, branch } = readConfig();
  const base = `https://api.github.com/repos/${owner}/${repo}`;
  const response = await fetch(path ? `${base}/${path}` : base, {
    ...options,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${readToken()}`,
      'x-github-api-version': '2022-11-28',
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...options.headers
    }
  });

  if (response.status === 404) return { missing: true, branch };
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error(detail.message || `GitHub returned ${response.status}`);
  }
  if (response.status === 204) return { branch };
  return { ...(await response.json()), branch };
}

const post = (path, body, request_ = request) =>
  request_(path, { method: 'POST', body: JSON.stringify(body) });

/* ---------- reading ---------- */

export async function repoInfo(request_ = request) {
  return request_('');
}

/**
 * Checks the stored token against the stored repository. Returns a sentence fit
 * to show the author, or throws one.
 */
export async function verify(request_ = request) {
  if (!hasToken()) throw new Error('add a token first');
  const { owner, repo, branch } = readConfig();
  const info = await repoInfo(request_);
  if (info.missing) throw new Error(`${owner}/${repo} is not reachable with this token`);
  if (info.permissions && !info.permissions.push) throw new Error('this token cannot write to the repository');
  return { name: info.full_name || `${owner}/${repo}`, branch };
}

/** The file as text plus its blob sha, or `{ missing: true }`. */
export async function readFile(path, request_ = request) {
  const { branch } = readConfig();
  const result = await request_(`contents/${path}?ref=${encodeURIComponent(branch)}`);
  if (result.missing) return result;
  return {
    sha: result.sha,
    text: result.content ? fromBase64(result.content) : '',
    branch: result.branch
  };
}

/* ---------- writing one file ---------- */

export async function putFile(path, { text, message, sha }, request_ = request) {
  const { branch } = readConfig();
  return request_(`contents/${path}`, {
    method: 'PUT',
    body: JSON.stringify({
      message,
      content: toBase64(text),
      branch,
      ...(sha ? { sha } : {})
    })
  });
}

export async function removeFile(path, { message, sha }, request_ = request) {
  const { branch } = readConfig();
  return request_(`contents/${path}`, {
    method: 'DELETE',
    body: JSON.stringify({ message, sha, branch })
  });
}

/* ---------- writing several files as one commit ---------- */

/**
 * A tree entry for one file. A null sha is how the git data API says "this path
 * is gone"; everything else is an ordinary non-executable blob.
 */
export function treeEntry(path, sha) {
  return sha === null
    ? { path, mode: '100644', type: 'blob', sha: null }
    : { path, mode: '100644', type: 'blob', sha };
}

/**
 * Commits a set of files together.
 *
 * `files` is `[{ path, text }]`, or `{ path, remove: true }` to delete one.
 * `expectHead`, when given, is the commit the caller built its edits against: a
 * head that has moved since means someone else pushed, and overwriting them
 * silently is not this tool's call to make.
 *
 * Returns `{ commit, head }` — the new commit sha and the ref it now points at.
 */
export async function commitFiles(files, { message, expectHead = '' } = {}, request_ = request) {
  const list = (files || []).filter((file) => file && file.path);
  if (!list.length) throw new Error('nothing to commit');
  if (!message) throw new Error('a commit needs a message');

  const { branch } = readConfig();
  const ref = `heads/${branch}`;

  const head = await request_(`git/ref/${ref}`);
  if (head.missing) throw new Error(`the branch ${branch} is not in the repository`);
  const headSha = head.object?.sha;
  if (!headSha) throw new Error(`could not read the tip of ${branch}`);
  if (expectHead && expectHead !== headSha) {
    throw new Error('the branch moved since these edits were loaded — reload the studio and try again');
  }

  const headCommit = await request_(`git/commits/${headSha}`);
  const baseTree = headCommit.tree?.sha;
  if (!baseTree) throw new Error('could not read the tree of the current commit');

  // Blobs first: each one is independent, so they go up together.
  const blobs = await Promise.all(list.map(async (file) => {
    if (file.remove) return null;
    const blob = await post('git/blobs', { content: toBase64(file.text ?? ''), encoding: 'base64' }, request_);
    return blob.sha;
  }));

  const tree = await post('git/trees', {
    base_tree: baseTree,
    tree: list.map((file, index) => treeEntry(file.path, blobs[index]))
  }, request_);
  if (!tree.sha) throw new Error('could not build the tree');

  const commit = await post('git/commits', {
    message,
    tree: tree.sha,
    parents: [headSha]
  }, request_);
  if (!commit.sha) throw new Error('could not create the commit');

  await request_(`git/refs/${ref}`, {
    method: 'PATCH',
    body: JSON.stringify({ sha: commit.sha })
  });

  return { commit: commit.sha, head: headSha, branch };
}

/** The sha the branch currently points at, for conflict detection later. */
export async function headSha(request_ = request) {
  const { branch } = readConfig();
  const head = await request_(`git/ref/heads/${branch}`);
  return head.missing ? '' : head.object?.sha || '';
}

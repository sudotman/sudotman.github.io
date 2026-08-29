/**
 * The writing desk at /write/.
 *
 * Renders the preview with the same module the build script uses, so what is
 * on screen is what the published page will contain. Work is autosaved to
 * localStorage on every keystroke; publishing commits the markdown file to the
 * site repository through the GitHub contents API, and CI does the rest.
 *
 * The token never leaves this device except in an Authorization header to
 * api.github.com. Nothing here talks to any other origin.
 */

import { markdownToHtml, readingMinutes, slugify, wordCount } from './lib/markdown.js';
import { parseFrontmatter, serializePost, toIsoDate } from './lib/post.js';

const STORE = {
  drafts: 'satyam.write.drafts',
  token: 'satyam.write.token',
  config: 'satyam.write.config'
};

const DEFAULT_CONFIG = { owner: 'sudotman', repo: 'sudotman.github.io', branch: 'master' };
const POSTS_PATH = 'content/posts';
const AUTOSAVE_DELAY = 500;

const app = document.getElementById('editor');
if (app) app.hidden = false;

const fields = Object.fromEntries(
  [...document.querySelectorAll('[data-field]')].map((element) => [element.dataset.field, element])
);
const previewPane = document.querySelector('[data-preview]');
const panes = document.querySelector('[data-panes]');
const statusLine = document.querySelector('[data-status]');
const saveState = document.querySelector('[data-save-state]');
const statsLine = document.querySelector('[data-stats]');
const previewUrl = document.querySelector('[data-preview-url]');
const githubButton = document.querySelector('[data-open-settings]');
const deleteButton = document.querySelector('[data-delete]');
const publishButton = document.querySelector('[data-publish]');
const libraryDialog = document.querySelector('[data-library]');
const libraryList = document.querySelector('[data-library-list]');
const settingsDialog = document.querySelector('[data-settings]');
const settingsResult = document.querySelector('[data-settings-result]');
const settingInputs = Object.fromEntries(
  [...document.querySelectorAll('[data-setting]')].map((element) => [element.dataset.setting, element])
);

/** The slug the current buffer was loaded from; empty for an unsaved new post. */
let loadedSlug = '';
/** Blob sha of the file as loaded, so a publish can detect a remote change. */
let loadedSha = '';
/** Preserved across an edit so a migrated post keeps pointing at its origin. */
let legacyUrl = '';
let published = [];
let autosaveTimer = 0;
let previewTimer = 0;

/* ---------- storage ---------- */

function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || '') ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    setStatus(`Could not save locally: ${error.message}`, 'error');
  }
}

const drafts = () => readJson(STORE.drafts, {});
const config = () => ({ ...DEFAULT_CONFIG, ...readJson(STORE.config, {}) });
const token = () => localStorage.getItem(STORE.token) || '';

/* ---------- buffer ---------- */

function currentSlug() {
  return slugify(fields.slug.value.trim() || fields.title.value.trim());
}

function readBuffer() {
  return {
    title: fields.title.value.trim(),
    date: fields.date.value || toIsoDate(new Date()),
    summary: fields.summary.value.trim(),
    tags: fields.tags.value.split(',').map((tag) => tag.trim().toLowerCase()).filter(Boolean),
    cover: fields.cover.value.trim(),
    draft: fields.draft.checked,
    body: fields.body.value
  };
}

function writeBuffer(data = {}, body = '', slug = '') {
  fields.title.value = data.title || '';
  fields.slug.value = slug || '';
  fields.date.value = toIsoDate(data.date) || toIsoDate(new Date());
  fields.summary.value = data.summary || '';
  fields.tags.value = (Array.isArray(data.tags) ? data.tags : []).join(', ');
  fields.cover.value = data.cover || '';
  fields.draft.checked = data.draft === true;
  fields.body.value = body || '';
}

/** The exact bytes that would be committed, so preview and publish agree. */
function fileContents() {
  const buffer = readBuffer();
  const today = toIsoDate(new Date());
  // Revising something already published stamps an updated date, so the post
  // page and the feed can say so without the author remembering to.
  const isRevision = Boolean(loadedSlug) && published.some((post) => post.slug === loadedSlug);
  return serializePost({
    title: buffer.title || 'Untitled',
    date: buffer.date,
    updated: isRevision && buffer.date !== today ? today : '',
    summary: buffer.summary,
    tags: buffer.tags,
    cover: buffer.cover,
    legacyUrl,
    draft: buffer.draft
  }, buffer.body);
}

/* ---------- rendering ---------- */

function setStatus(message, tone = '') {
  if (!statusLine) return;
  statusLine.textContent = message;
  statusLine.dataset.tone = tone;
}

function renderPreview() {
  const buffer = readBuffer();
  previewPane.innerHTML = markdownToHtml(buffer.body);
  const words = wordCount(buffer.body);
  statsLine.textContent = `${words.toLocaleString('en-US')} word${words === 1 ? '' : 's'} · ${readingMinutes(buffer.body)} min`;

  const slug = currentSlug();
  previewUrl.textContent = slug ? `satyam.lol/blog/${slug}/` : 'satyam.lol/blog/…';
  previewUrl.href = slug ? `/blog/${slug}/` : '/blog/';
}

function markSaved(saved) {
  saveState.textContent = saved ? 'saved locally' : 'saving…';
  saveState.dataset.dirty = String(!saved);
}

function autosave() {
  const slug = currentSlug() || '__untitled__';
  const buffer = readBuffer();
  const all = drafts();
  all[slug] = { ...buffer, slug, loadedSlug, savedAt: new Date().toISOString() };
  // Renaming a post should not leave the old draft behind as a phantom entry.
  if (loadedSlug && loadedSlug !== slug) delete all[loadedSlug];
  writeJson(STORE.drafts, all);
  markSaved(true);
}

function onEdit() {
  markSaved(false);
  clearTimeout(previewTimer);
  previewTimer = setTimeout(renderPreview, 120);
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(autosave, AUTOSAVE_DELAY);
}

/* ---------- github ---------- */

function githubReady() {
  return Boolean(token());
}

function refreshGithubState() {
  githubButton.dataset.githubState = githubReady() ? 'on' : 'off';
  publishButton.disabled = !githubReady();
  publishButton.title = githubReady() ? '' : 'Add a GitHub token first — see the github panel.';
}

async function github(path, options = {}) {
  const { owner, repo, branch } = config();
  const base = `https://api.github.com/repos/${owner}/${repo}`;
  const response = await fetch(path ? `${base}/${path}` : base, {
    ...options,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token()}`,
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
  return { ...(await response.json()), branch };
}

/** btoa only handles latin-1, so UTF-8 has to be widened byte by byte first. */
function toBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}


async function fetchRemote(slug) {
  const { branch } = config();
  return github(`contents/${POSTS_PATH}/${slug}.md?ref=${encodeURIComponent(branch)}`);
}

async function publish() {
  const slug = currentSlug();
  if (!slug) return setStatus('Give the post a title or a slug first.', 'error');
  if (!fields.title.value.trim()) return setStatus('The post needs a title.', 'error');
  if (!fields.body.value.trim()) return setStatus('The post has no body yet.', 'error');

  publishButton.disabled = true;
  setStatus('Checking the repository…');

  try {
    const { branch } = config();
    const remote = await fetchRemote(slug);
    const exists = !remote.missing;

    if (exists && slug !== loadedSlug) {
      const confirmed = confirm(`A post already exists at ${slug}.md. Overwrite it?`);
      if (!confirmed) return setStatus('Nothing was published.');
    }

    // Someone edited the file elsewhere between opening it and publishing.
    if (exists && loadedSha && remote.sha !== loadedSha) {
      const confirmed = confirm('This post changed in the repository since you opened it. Overwrite those changes?');
      if (!confirmed) return setStatus('Nothing was published.');
    }

    const contents = fileContents();
    setStatus('Committing…');

    const result = await github(`contents/${POSTS_PATH}/${slug}.md`, {
      method: 'PUT',
      body: JSON.stringify({
        message: `${exists ? 'post: update' : 'post:'} ${fields.title.value.trim()}`,
        content: toBase64(contents),
        branch,
        ...(exists ? { sha: remote.sha } : {})
      })
    });

    loadedSlug = slug;
    loadedSha = result.content?.sha || '';
    fields.slug.value = slug;

    // The draft has become a real post; keeping it would shadow the file.
    const all = drafts();
    delete all[slug];
    delete all.__untitled__;
    writeJson(STORE.drafts, all);

    await loadPublished();
    setStatus(`Committed to ${branch}. The site rebuilds and deploys in about a minute — /blog/${slug}/`, 'ok');
  } catch (error) {
    setStatus(`Publish failed: ${error.message}`, 'error');
  } finally {
    refreshGithubState();
  }
}

async function removePost() {
  const slug = loadedSlug || currentSlug();
  if (!slug) return;
  if (!confirm(`Delete content/posts/${slug}.md from the repository? The post comes off the site on the next deploy.`)) return;

  deleteButton.disabled = true;
  setStatus('Deleting…');

  try {
    const { branch } = config();
    const remote = await fetchRemote(slug);
    if (remote.missing) throw new Error('that post is not in the repository');

    await github(`contents/${POSTS_PATH}/${slug}.md`, {
      method: 'DELETE',
      body: JSON.stringify({ message: `post: remove ${slug}`, sha: remote.sha, branch })
    });

    setStatus(`Deleted ${slug}.md.`, 'ok');
    await loadPublished();
    newPost();
  } catch (error) {
    setStatus(`Delete failed: ${error.message}`, 'error');
  } finally {
    deleteButton.disabled = false;
  }
}

/* ---------- library ---------- */

async function loadPublished() {
  try {
    const response = await fetch('/content/blog.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error(String(response.status));
    published = (await response.json()).posts || [];
  } catch {
    published = [];
  }
}

function entryButton(label, meta, handler) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'editor-library__entry';
  const strong = document.createElement('strong');
  strong.textContent = label;
  const small = document.createElement('small');
  small.textContent = meta;
  button.append(strong, small);
  button.addEventListener('click', handler);
  return button;
}

function renderLibrary() {
  libraryList.replaceChildren();
  const localDrafts = Object.values(drafts()).sort((left, right) => String(right.savedAt).localeCompare(String(left.savedAt)));

  if (localDrafts.length) {
    const heading = document.createElement('h3');
    heading.textContent = 'local drafts (this browser only)';
    libraryList.append(heading);
    for (const draft of localDrafts) {
      libraryList.append(entryButton(
        draft.title || 'untitled',
        `${draft.slug === '__untitled__' ? 'no slug' : draft.slug} · ${new Date(draft.savedAt).toLocaleString()}`,
        () => openDraft(draft)
      ));
    }
  }

  const heading = document.createElement('h3');
  heading.textContent = 'published';
  libraryList.append(heading);

  if (!published.length) {
    const empty = document.createElement('p');
    empty.className = 'editor-library__empty';
    empty.textContent = 'No published posts found in content/blog.json.';
    libraryList.append(empty);
    return;
  }

  for (const post of published) {
    libraryList.append(entryButton(
      post.title,
      `${post.published.slice(0, 10)} · ${post.minutes} min`,
      () => openPublished(post.slug)
    ));
  }
}

function openDraft(draft) {
  loadedSlug = draft.loadedSlug || '';
  loadedSha = '';
  writeBuffer(draft, draft.body, draft.slug === '__untitled__' ? '' : draft.slug);
  legacyUrl = '';
  afterOpen(`Opened the local draft “${draft.title || 'untitled'}”.`);
}

async function openPublished(slug) {
  setStatus(`Loading ${slug}…`);
  try {
    // The markdown ships with the site, so opening a post needs no token.
    const response = await fetch(`/${POSTS_PATH}/${slug}.md`, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`could not read ${slug}.md (${response.status})`);
    const { data, body } = parseFrontmatter(await response.text());

    loadedSlug = slug;
    loadedSha = '';
    writeBuffer(data, body, slug);
    legacyUrl = data.legacyUrl || '';

    // A sha is only obtainable with a token, and only matters for conflicts.
    if (githubReady()) {
      const remote = await fetchRemote(slug).catch(() => ({ missing: true }));
      loadedSha = remote.missing ? '' : remote.sha;
    }

    afterOpen(`Editing “${data.title || slug}”.`);
  } catch (error) {
    setStatus(`Could not open that post: ${error.message}`, 'error');
  }
}

function afterOpen(message) {
  libraryDialog.close();
  deleteButton.hidden = !loadedSlug || !githubReady();
  renderPreview();
  autosave();
  setStatus(message, 'ok');
  fields.body.focus({ preventScroll: true });
}

function newPost() {
  loadedSlug = '';
  loadedSha = '';
  writeBuffer({ date: toIsoDate(new Date()) }, '', '');
  legacyUrl = '';
  deleteButton.hidden = true;
  renderPreview();
  setStatus('New post.');
  fields.title.focus();
}

/* ---------- markdown insert helpers ---------- */

const WRAPPERS = {
  bold: { before: '**', after: '**', placeholder: 'bold text' },
  italic: { before: '*', after: '*', placeholder: 'italic text' },
  code: { before: '```\n', after: '\n```', placeholder: 'code', block: true },
  link: { before: '[', after: '](https://)', placeholder: 'link text' },
  image: { before: '![', after: '](/images/blog/ "caption")', placeholder: 'alt text' },
  h2: { before: '## ', after: '', placeholder: 'heading', block: true },
  quote: { before: '> ', after: '', placeholder: 'quoted text', block: true },
  list: { before: '- ', after: '', placeholder: 'item', block: true },
  rule: { before: '\n---\n', after: '', placeholder: '', block: true }
};

function insert(kind) {
  const wrapper = WRAPPERS[kind];
  if (!wrapper) return;

  const area = fields.body;
  const { selectionStart: start, selectionEnd: end, value } = area;
  const selected = value.slice(start, end) || wrapper.placeholder;

  // Block constructs need to start on their own line to parse as blocks.
  const needsBreak = wrapper.block && start > 0 && value[start - 1] !== '\n';
  const lead = needsBreak ? '\n' : '';
  const replacement = `${lead}${wrapper.before}${selected}${wrapper.after}`;

  area.setRangeText(replacement, start, end, 'end');
  const selectionStart = start + lead.length + wrapper.before.length;
  area.setSelectionRange(selectionStart, selectionStart + selected.length);
  area.focus();
  onEdit();
}

/* ---------- settings ---------- */

function loadSettings() {
  const current = config();
  settingInputs.owner.value = current.owner;
  settingInputs.repo.value = current.repo;
  settingInputs.branch.value = current.branch;
  settingInputs.token.value = token();
}

function saveSettings() {
  writeJson(STORE.config, {
    owner: settingInputs.owner.value.trim() || DEFAULT_CONFIG.owner,
    repo: settingInputs.repo.value.trim() || DEFAULT_CONFIG.repo,
    branch: settingInputs.branch.value.trim() || DEFAULT_CONFIG.branch
  });

  const value = settingInputs.token.value.trim();
  if (value) localStorage.setItem(STORE.token, value);
  else localStorage.removeItem(STORE.token);

  refreshGithubState();
  deleteButton.hidden = !loadedSlug || !githubReady();
}

function setSettingsResult(message, tone = '') {
  settingsResult.textContent = message;
  settingsResult.dataset.tone = tone;
}

async function verifyToken() {
  saveSettings();
  if (!githubReady()) return setSettingsResult('Add a token first.', 'error');

  setSettingsResult('Checking…');
  try {
    const { owner, repo, branch } = config();
    const info = await github('');
    if (info.missing) throw new Error(`${owner}/${repo} is not reachable with this token`);
    if (info.permissions && !info.permissions.push) throw new Error('this token cannot write to the repository');
    setSettingsResult(`Connected to ${info.full_name} — publishing to ${branch}.`, 'ok');
  } catch (error) {
    setSettingsResult(`Not connected: ${error.message}`, 'error');
  }
}

/* ---------- exports ---------- */

function download() {
  const slug = currentSlug() || 'untitled';
  const blob = new Blob([fileContents()], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${slug}.md`;
  anchor.click();
  URL.revokeObjectURL(url);
  setStatus(`Downloaded ${slug}.md — drop it in content/posts/ and commit.`, 'ok');
}

async function copyToClipboard() {
  try {
    await navigator.clipboard.writeText(fileContents());
    setStatus('Copied the full post file to the clipboard.', 'ok');
  } catch (error) {
    setStatus(`Could not copy: ${error.message}`, 'error');
  }
}

/* ---------- wiring ---------- */

for (const element of Object.values(fields)) {
  element.addEventListener('input', onEdit);
  element.addEventListener('change', onEdit);
}

document.querySelectorAll('[data-insert]').forEach((button) => {
  button.addEventListener('click', () => insert(button.dataset.insert));
});

document.querySelector('[data-toggle-preview]').addEventListener('click', (event) => {
  const hidden = panes.dataset.previewHidden === 'true';
  panes.dataset.previewHidden = String(!hidden);
  event.currentTarget.classList.toggle('is-off', !hidden);
});

document.querySelector('[data-open-library]').addEventListener('click', async () => {
  await loadPublished();
  renderLibrary();
  libraryDialog.showModal();
});

document.querySelector('[data-new-post]').addEventListener('click', () => {
  if (fields.body.value.trim() && !confirm('Start a new post? The current one stays in local drafts.')) return;
  newPost();
});

githubButton.addEventListener('click', () => {
  loadSettings();
  setSettingsResult('');
  settingsDialog.showModal();
});

document.querySelectorAll('[data-close-dialog]').forEach((button) => {
  button.addEventListener('click', () => button.closest('dialog').close());
});

for (const dialog of [libraryDialog, settingsDialog]) {
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
}

settingsDialog.addEventListener('close', saveSettings);
document.querySelector('[data-verify-token]').addEventListener('click', verifyToken);
document.querySelector('[data-forget-token]').addEventListener('click', () => {
  localStorage.removeItem(STORE.token);
  settingInputs.token.value = '';
  refreshGithubState();
  deleteButton.hidden = true;
  setSettingsResult('Token removed from this browser.', 'ok');
});

publishButton.addEventListener('click', publish);
deleteButton.addEventListener('click', removePost);
document.querySelector('[data-download]').addEventListener('click', download);
document.querySelector('[data-copy]').addEventListener('click', copyToClipboard);

document.addEventListener('keydown', (event) => {
  if (!(event.metaKey || event.ctrlKey)) return;
  const key = event.key.toLowerCase();

  if (key === 's') {
    event.preventDefault();
    autosave();
    setStatus('Saved to this browser. Use publish to put it on the site.', 'ok');
    return;
  }
  if (key === 'enter') {
    event.preventDefault();
    if (githubReady()) publish();
    return;
  }
  if (document.activeElement !== fields.body) return;
  if (key === 'b' || key === 'i' || key === 'k') {
    event.preventDefault();
    insert(key === 'k' ? 'link' : key === 'b' ? 'bold' : 'italic');
  }
});

// Losing a few seconds of typing to a closed tab is avoidable; flush first.
window.addEventListener('beforeunload', () => {
  if (saveState.dataset.dirty === 'true') autosave();
});

async function boot() {
  refreshGithubState();
  await loadPublished();

  const requested = new URLSearchParams(location.search).get('post');
  // Reopen wherever the last session stopped, so a reload or a crashed tab
  // never costs work that was already autosaved.
  const [recent] = Object.values(drafts())
    .filter((draft) => draft?.body?.trim())
    .sort((left, right) => String(right.savedAt).localeCompare(String(left.savedAt)));

  if (requested && published.some((post) => post.slug === requested)) {
    await openPublished(requested);
  } else if (recent) {
    openDraft(recent);
  } else {
    newPost();
  }

  renderPreview();
  markSaved(true);
}

boot();

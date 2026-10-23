/**
 * The studio at /studio/.
 *
 * A desk for everything satyam.lol hosts that is not prose: the works, the
 * order they appear in on the front door, the creative archive's colour pairs,
 * ononline's taxonomy, the profile, and the reel's copy and type. Prose has its
 * own desk at /write/; this one links to it.
 *
 * Nothing here reaches the repository on its own. Edits accumulate in a
 * changeset (js/studio/store.js) and leave as one commit from the publish
 * screen, so a change that touches four files rebuilds the site once.
 *
 * The GitHub side is js/lib/github.js, shared with the writing desk: one
 * fine-grained token, kept in this browser, sent to api.github.com and nowhere
 * else.
 */

import * as github from '../lib/github.js';
import { button, clear, el } from './dom.js';
import * as store from './store.js';

import creative from './views/creative.js';
import frontDoor from './views/front-door.js';
import ononline from './views/ononline.js';
import profile from './views/profile.js';
import publish from './views/publish.js';
import reel from './views/reel.js';
import works from './views/works.js';
import writing from './views/writing.js';

const VIEWS = [frontDoor, works, creative, ononline, reel, profile, writing, publish];
const DEFAULT_VIEW = 'works';

const app = document.getElementById('studio');
const rail = document.querySelector('[data-rail]');
const main = document.querySelector('[data-main]');
const where = document.querySelector('[data-where]');
const statusLine = document.querySelector('[data-status]');
const pendingLabel = document.querySelector('[data-pending]');
const githubButton = document.querySelector('[data-open-settings]');
const settingsDialog = document.querySelector('[data-settings]');
const settingsResult = document.querySelector('[data-settings-result]');
const recordDialog = document.querySelector('[data-record]');
const recordTitle = document.querySelector('[data-record-title]');
const recordBody = document.querySelector('[data-record-body]');
const settingInputs = Object.fromEntries(
  [...document.querySelectorAll('[data-setting]')].map((element) => [element.dataset.setting, element])
);

let currentView = '';

/* ---------- chrome ---------- */

function setStatus(message, tone = '') {
  statusLine.textContent = message;
  statusLine.dataset.tone = tone;
}

function refreshChrome() {
  const dirty = store.dirtyNames();
  const count = store.changeCount();
  pendingLabel.textContent = dirty.length
    ? `${count} change${count === 1 ? '' : 's'} in ${dirty.length} file${dirty.length === 1 ? '' : 's'}`
    : 'no pending changes';
  pendingLabel.dataset.dirty = String(dirty.length > 0);
  githubButton.dataset.githubState = github.hasToken() ? 'on' : 'off';

  for (const entry of rail.querySelectorAll('[data-view]')) {
    const badge = entry.querySelector('.studio-rail__count');
    if (!badge) continue;
    badge.textContent = count ? String(count) : '';
    badge.hidden = !count;
  }
}

/* ---------- the record sheet ---------- */

let onRecordClose = null;

function openRecord(title, body, onClose = null) {
  recordTitle.textContent = title;
  clear(recordBody).append(body);
  onRecordClose = onClose;
  if (!recordDialog.open) recordDialog.showModal();
  recordBody.scrollTop = 0;
}

const closeRecord = () => recordDialog.close();

/** What every view is handed, so none of them reaches for the chrome itself. */
const context = {
  setStatus,
  openRecord,
  closeRecord,
  go: (id) => { location.hash = `#${id}`; },
  refresh: () => renderView(currentView)
};

/* ---------- routing ---------- */

function buildRail() {
  clear(rail);
  for (const view of VIEWS) {
    if (view.id === 'publish') rail.append(el('div.studio-rail__rule'));
    rail.append(button([
      el('span', {}, view.label),
      view.id === 'publish' ? el('span.studio-rail__count', { hidden: true }) : null
    ], {
      dataset: { view: view.id },
      onclick: () => context.go(view.id)
    }));
  }
  rail.append(el('div.studio-rail__rule'));
  rail.append(el('a', { href: '/write/' }, 'the writing desk →'));
  rail.append(el('a', { href: '/', target: '_blank', rel: 'noreferrer' }, 'the live site →'));
}

function renderView(id) {
  const view = VIEWS.find((entry) => entry.id === id) || VIEWS.find((entry) => entry.id === DEFAULT_VIEW);
  currentView = view.id;

  for (const entry of rail.querySelectorAll('[data-view]')) {
    entry.setAttribute('aria-current', String(entry.dataset.view === view.id));
  }
  where.textContent = view.label;

  clear(main);
  main.append(el('h1.studio-head', {}, view.title || view.label));
  if (view.lede) main.append(el('p.studio-lede', {}, view.lede));
  view.render(main, context);
  refreshChrome();
}

const route = () => renderView(location.hash.replace(/^#/, '') || DEFAULT_VIEW);

/* ---------- settings ---------- */

function loadSettings() {
  const config = github.readConfig();
  settingInputs.owner.value = config.owner;
  settingInputs.repo.value = config.repo;
  settingInputs.branch.value = config.branch;
  settingInputs.token.value = github.readToken();
}

function saveSettings() {
  github.writeConfig({
    owner: settingInputs.owner.value,
    repo: settingInputs.repo.value,
    branch: settingInputs.branch.value
  });
  github.writeToken(settingInputs.token.value);
  refreshChrome();
  if (currentView === 'publish') renderView(currentView);
}

function setSettingsResult(message, tone = '') {
  settingsResult.textContent = message;
  settingsResult.dataset.tone = tone;
}

/* ---------- wiring ---------- */

githubButton.addEventListener('click', () => {
  loadSettings();
  setSettingsResult('');
  settingsDialog.showModal();
});

document.querySelectorAll('[data-close-dialog]').forEach((element) => {
  element.addEventListener('click', () => element.closest('dialog').close());
});

for (const dialog of [settingsDialog, recordDialog]) {
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
}

settingsDialog.addEventListener('close', saveSettings);
recordDialog.addEventListener('close', () => {
  clear(recordBody);
  const handler = onRecordClose;
  onRecordClose = null;
  handler?.();
});

document.querySelector('[data-verify-token]').addEventListener('click', async () => {
  saveSettings();
  setSettingsResult('Checking…');
  try {
    const { name, branch } = await github.verify();
    setSettingsResult(`Connected to ${name} — publishing to ${branch}.`, 'ok');
  } catch (error) {
    setSettingsResult(`Not connected: ${error.message}`, 'error');
  }
});

document.querySelector('[data-forget-token]').addEventListener('click', () => {
  github.forgetToken();
  settingInputs.token.value = '';
  refreshChrome();
  setSettingsResult('Token removed from this browser.', 'ok');
});

window.addEventListener('hashchange', route);
store.subscribe(refreshChrome);

// Pending edits only live in this browser; a closed tab should say so once.
window.addEventListener('beforeunload', (event) => {
  if (!store.dirtyNames().length) return;
  event.preventDefault();
  event.returnValue = '';
});

/* ---------- boot ---------- */

async function boot() {
  buildRail();
  app.hidden = false;
  setStatus('Reading the site…');

  try {
    await store.load();
  } catch (error) {
    clear(main).append(el('div.studio-empty', {},
      'The studio could not read the site\'s content. ',
      el('br'),
      error.message,
      el('br'), el('br'),
      'Serving over file:// will do this — use npm run serve.'));
    setStatus(`Could not load: ${error.message}`, 'error');
    return;
  }

  route();

  const stale = Object.keys(store.PATHS).filter(store.isStale);
  const dirty = store.dirtyNames();
  if (stale.length) {
    setStatus(`Pending edits to ${stale.join(', ')} were made against an older copy of the site. Check them on the publish screen before committing.`, 'error');
  } else if (dirty.length) {
    setStatus(`Picked up ${store.changeCount()} pending change${store.changeCount() === 1 ? '' : 's'} from this browser.`);
  } else {
    setStatus(github.hasToken() ? 'Ready.' : 'Ready to read. Add a GitHub token to publish — see the github panel.');
  }
}

boot();

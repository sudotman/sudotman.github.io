/**
 * Review the changeset, then send it as one commit.
 *
 * The contents API would want one call per file, which is one commit and one
 * deploy per file: renaming a project and recolouring it would rebuild the site
 * three times and leave three commits saying a third of the story each. This
 * goes through the git data API instead, so a changeset is a changeset.
 *
 * Before committing it checks two things the author cannot see from here: that
 * the studio's own rules are satisfied, and that none of the files being
 * written has moved in the repository since the studio read them. The scheduled
 * feed sync pushes on its own every six hours, so "the branch moved" is normal
 * and only the files in this changeset matter.
 */

import * as github from '../../lib/github.js';
import { collapse, lineDiff, summarise } from '../diff.js';
import { button, clear, el } from '../dom.js';
import { problems } from '../model.js';
import * as store from '../store.js';

const MESSAGE_KEY = 'satyam.studio.message';

/** "home.json, creative.json" — what a default commit message is built from. */
const basename = (path) => path.split('/').pop();

function defaultMessage(files) {
  if (!files.length) return '';
  const names = files.map((file) => basename(file.path).replace(/\.json$/, ''));
  return `studio: update ${names.join(', ')}`;
}

function rawDiff(file) {
  const before = store.textOf(file.name) || '';
  const rows = collapse(lineDiff(before, file.text));
  const pre = el('pre.studio-raw');
  for (const entry of rows) {
    if (entry.kind === 'add') pre.append(el('ins', {}, `+ ${entry.text}\n`));
    else if (entry.kind === 'remove') pre.append(el('del', {}, `- ${entry.text}\n`));
    else if (entry.kind === 'gap') pre.append(`  ${entry.text}\n`);
    else pre.append(`  ${entry.text}\n`);
  }
  return pre;
}

function fileCard(file, context) {
  const body = el('div.studio-file__body');
  const sentences = summarise(file.changes);

  body.append(el('ul.studio-changes', {}, file.changes.map((change, index) =>
    el('li', { dataset: { kind: change.kind } }, sentences[index]))));

  if (store.isStale(file.name)) {
    body.append(el('p.studio-row__problem', {},
      'These edits were made against an older copy of the site. Check the raw diff before committing.'));
  }

  let raw = null;
  const toggle = button('raw diff', {
    onclick: () => {
      if (raw) {
        raw.remove();
        raw = null;
        toggle.textContent = 'raw diff';
        return;
      }
      raw = rawDiff(file);
      body.append(raw);
      toggle.textContent = 'hide diff';
    }
  });

  return el('section.studio-file', {},
    el('header.studio-file__head', {},
      el('span', {}, file.path),
      el('span', {},
        toggle,
        ' ',
        button('discard', {
          onclick: () => {
            if (!confirm(`Throw away every pending change to ${file.path}?`)) return;
            store.discard(file.name);
            context.refresh();
          }
        }))),
    body);
}

/** Files in this changeset whose repository copy has moved since the studio read it. */
async function movedSinceLoaded(files) {
  const moved = [];
  await Promise.all(files.map(async (file) => {
    const remote = await github.readFile(file.path);
    if (remote.missing) return;
    if (remote.text !== store.textOf(file.name)) moved.push(file.path);
  }));
  return moved;
}

function render(main, context) {
  const files = store.changeset();
  const found = problems();
  const errors = found.filter((problem) => problem.severity === 'error');

  if (!files.length) {
    main.append(el('div.studio-empty', {},
      'Nothing is waiting to be published.',
      el('br'), el('br'),
      'Edits made anywhere in the studio gather here, and leave together as one commit.'));
    return;
  }

  if (found.length) {
    main.append(el('div.studio-problems', { dataset: { severity: errors.length ? 'error' : 'warning' } },
      el('h2', {}, errors.length ? 'these would fail the build' : 'worth a look'),
      el('ul', {}, found.map((problem) => el('li', { dataset: { severity: problem.severity } },
        problem.where ? `${problem.message} (${problem.where})` : problem.message)))));
  }

  for (const file of files) main.append(fileCard(file, context));

  const message = el('input', {
    type: 'text',
    value: sessionStorage.getItem(MESSAGE_KEY) || defaultMessage(files),
    'aria-label': 'commit message',
    oninput: (event) => sessionStorage.setItem(MESSAGE_KEY, event.target.value)
  });

  const { branch } = github.readConfig();
  const ready = github.hasToken();

  const publishButton = button(`publish to ${branch}`, {
    class: 'studio-action is-primary',
    disabled: !ready || errors.length > 0,
    title: !ready ? 'Add a GitHub token first — see the github panel.'
      : errors.length ? 'Fix the errors above first.' : '',
    onclick: () => send()
  });

  async function send() {
    publishButton.disabled = true;
    context.setStatus('Checking the repository…');

    try {
      const moved = await movedSinceLoaded(files);
      if (moved.length) {
        const confirmed = confirm(
          `${moved.join(' and ')} changed in the repository since the studio read ${moved.length === 1 ? 'it' : 'them'}.\n\n`
          + 'Publishing overwrites those changes with what is on screen. Continue?');
        if (!confirmed) return context.setStatus('Nothing was published.');
      }

      context.setStatus(`Committing ${files.length} file${files.length === 1 ? '' : 's'}…`);
      const result = await github.commitFiles(
        files.map((file) => ({ path: file.path, text: file.text })),
        { message: message.value.trim() || defaultMessage(files) }
      );

      store.settle();
      sessionStorage.removeItem(MESSAGE_KEY);
      context.setStatus(
        `Committed ${result.commit.slice(0, 7)} to ${branch}. The site rebuilds and deploys in about a minute.`, 'ok');
      context.refresh();
    } catch (error) {
      context.setStatus(`Publish failed: ${error.message}`, 'error');
    } finally {
      publishButton.disabled = false;
    }
  }

  main.append(el('fieldset.studio-section', {},
    el('legend.studio-section__head', {},
      el('span.studio-section__title', {}, 'commit'),
      el('span.studio-section__note', {}, `${files.length} file${files.length === 1 ? '' : 's'} · one commit · one deploy`)),
    el('label.studio-row', { dataset: { wide: 'true' } },
      el('span.studio-row__label', {}, 'message'),
      message),
    el('div.studio-actions', {},
      publishButton,
      button('discard everything', {
        class: 'studio-action is-danger',
        onclick: () => {
          if (!confirm('Throw away every pending change in the studio?')) return;
          store.discard();
          context.setStatus('Discarded every pending change.');
          context.refresh();
        }
      }))));
}

export default {
  id: 'publish',
  label: 'publish',
  title: 'publish',
  lede: 'Every pending change, in the files it will land in. One commit, one build, one deploy.',
  render
};

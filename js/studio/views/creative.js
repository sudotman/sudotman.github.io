/**
 * The creative archive: content/creative.json.
 *
 * These records hold no content of their own — identity, summaries, links and
 * media all resolve from the canonical work. What lives here is presentation:
 * a slug, a discipline, and a colour pair that /living/, /river/ and /doors/
 * render the work in. The colours are the content, so they are shown at size
 * rather than as hex in a text field.
 */

import { CREATIVE_PROJECT } from '../../lib/schema.js';
import { button, el } from '../dom.js';
import { form } from '../fields.js';
import * as model from '../model.js';
import * as store from '../store.js';

function tile(project, context) {
  const work = model.index().byId.get(project.workId);
  const title = work ? work.title : `${project.workId} — missing`;

  return el('div.creative-tile', {},
    el('div.creative-tile__swatch', { style: { background: project.color, color: project.accent } }, title),
    el('span.creative-tile__slug', {}, `/${project.slug}/ · ${project.discipline}`),
    el('div.studio-actions', {},
      button('edit', { class: 'studio-mini', onclick: () => openProject(project.workId, context) }),
      button('remove', {
        class: 'studio-mini',
        onclick: () => {
          if (!confirm(`Take “${title}” out of the creative archive?`)) return;
          model.removeCreative(project.workId);
          context.refresh();
        }
      })));
}

function openProject(workId, context) {
  const sheet = el('div');

  const redraw = () => {
    const project = model.index().creative.find((entry) => entry.workId === workId);
    const work = model.index().byId.get(workId);
    sheet.replaceChildren();
    if (!project) return void sheet.append(el('div.studio-empty', {}, 'That project is no longer in the archive.'));

    const swatch = el('div.creative-tile__swatch', {
      style: { background: project.color, color: project.accent }
    }, work ? work.title : workId);

    sheet.append(swatch);
    sheet.append(el('p.record-residency__note', {},
      work
        ? `Everything else about this project — title, summary, links, images — comes from ${
          work.source === 'home' ? 'content/home.json' : 'content/programming.json'}. Edit it on the works board.`
        : 'This points at a work that does not exist. Either fix the work, or remove this entry.'));

    sheet.append(el('div.studio-grid', {}, form(CREATIVE_PROJECT, project, (key, value) => {
      model.upsertCreative(workId, { [key]: value });
      if (key === 'color') swatch.style.background = value;
      if (key === 'accent') swatch.style.color = value;
    }, { refresh: redraw, context: { knownWorkIds: model.index().byId, workOptions: workOptions() } })));
  };

  redraw();
  context.openRecord('creative record', sheet, context.refresh);
}

const workOptions = () => model.index().all
  .map((work) => [work.id, `${work.title} (${work.id})`])
  .sort((left, right) => left[1].localeCompare(right[1]));

function render(main, context) {
  const { creative, byId, all } = model.index();

  const absent = all.filter((work) => !creative.some((project) => project.workId === work.id));

  main.append(el('fieldset.studio-section', {},
    el('legend.studio-section__head', {},
      el('span.studio-section__title', {}, 'projects'),
      el('span.studio-section__note', {}, `${creative.length} · rendered by /living/, /river/ and /doors/`)),
    el('div.creative-grid', {}, creative.map((project) => tile(project, context)))));

  const picker = el('select', { 'aria-label': 'work to add' });
  picker.append(el('option', { value: '' }, 'choose a work'));
  for (const work of absent.sort((left, right) => left.title.localeCompare(right.title))) {
    picker.append(el('option', { value: work.id }, `${work.title} (${work.id})`));
  }

  main.append(el('fieldset.studio-section', {},
    el('legend.studio-section__head', {},
      el('span.studio-section__title', {}, 'add a work'),
      el('span.studio-section__note', {}, `${absent.length} not carried by the archive`)),
    el('div.studio-actions', {},
      picker,
      button('add', {
        class: 'studio-action',
        onclick: () => {
          const work = byId.get(picker.value);
          if (!work) return;
          model.upsertCreative(work.id, model.creativeDraft(work));
          context.refresh();
          openProject(work.id, context);
        }
      }))));

  if (store.isMissing('creative')) {
    main.append(el('p.studio-row__problem', {}, 'content/creative.json did not load.'));
  }
}

export default {
  id: 'creative',
  label: 'creative archive',
  title: 'creative archive',
  lede: 'Presentation only: a slug, a discipline and a colour pair for each work the creative routes carry. '
    + 'Everything a visitor reads resolves from the work itself.',
  render
};

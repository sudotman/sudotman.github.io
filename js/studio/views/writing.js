/**
 * The writing, listed but not edited.
 *
 * Posts are markdown files, not JSON records, and they already have a desk
 * built for them at /write/ — a preview that renders with the same module the
 * build script uses, a Substack export, an autosaved buffer. Duplicating that
 * here would mean two renderers to keep in step. So this screen says what is
 * published and hands each post over.
 */

import { button, el } from '../dom.js';

const WRITE = '/write/';

function render(main, context) {
  const list = el('div.studio-stack');
  main.append(el('fieldset.studio-section', {},
    el('legend.studio-section__head', {},
      el('span.studio-section__title', {}, 'published'),
      el('span.studio-section__note', {}, 'content/blog.json, generated from content/posts')),
    list));

  main.append(el('div.studio-actions', {},
    el('a.studio-action.is-primary', { href: WRITE }, 'open the writing desk'),
    el('a.studio-action', { href: '/blog/', target: '_blank', rel: 'noreferrer' }, 'see the writing index')));

  fetch('/content/blog.json', { cache: 'no-cache' })
    .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
    .then(({ posts = [] }) => {
      if (!posts.length) {
        list.append(el('p.board-empty', {}, 'Nothing is published yet.'));
        return;
      }
      for (const post of posts) {
        list.append(el('div.work-row', {},
          el('span.work-row__title', {}, post.title),
          el('span.work-row__meta', {}, `${String(post.published).slice(0, 10)} · ${post.minutes} min · /${post.slug}/`),
          el('span.work-row__foot', {},
            el('a.studio-mini', { href: `${WRITE}?post=${encodeURIComponent(post.slug)}` }, 'edit'),
            el('a.studio-mini', { href: `/blog/${post.slug}/`, target: '_blank', rel: 'noreferrer' }, 'read'))));
      }
    })
    .catch((error) => {
      list.append(el('p.studio-row__problem', {}, `The writing index did not load: ${error.message}`));
      context.setStatus('content/blog.json did not load — run npm run build.', 'error');
    });
}

export default {
  id: 'writing',
  label: 'writing',
  title: 'writing',
  lede: 'Posts are markdown, and the writing desk at /write/ already handles them. This is the index, with a way in.',
  render
};

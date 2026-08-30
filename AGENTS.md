# AGENTS.md

## Repo Purpose

This repository powers the complete static portfolio network at `satyam.lol`. The parent experience is `index.html`; creative routes and the ononline field manual are hosted by the same repository.

## Working Boundaries

- Treat `index.html` as the parent crossing.
- Treat `living/`, `river/`, and `doors/` as three renderings of `content/creative.json` through `js/creative-network.js`.
- Treat `tech.html` as the ononline homepage shell, with shared assets in `css/modules/` and `js/modules/`.
- Treat `content/home.json` as the source of truth for the front door: identity, `now`, `featured` order, branches, external feeds, and homepage-only work records.
- Treat `content.json` and `profile.json` as the source of truth for ononline (`tech.html`) content and taxonomy.
- Treat `content/creative.json` as presentation-only for the creative archive. It references a canonical `workId`; identity, summaries, links, and media resolve from `content/home.json` and its registered feed.
- Treat `content/posts/*.md` as the source of truth for the blog. One file is one post; the filename is the slug.
- Treat `blog/`, `content/blog.json`, the `blog:start`/`blog:end` block in `sitemap.xml`, and `docs/` as generated. Never hand-edit them; run `npm run build`.
- Treat `content/external-feeds.json` as generated. Never hand-edit it; run `npm run sync`. It carries Letterboxd reviews only — writing is native now, and the Blogger feed was retired.
- Treat `js/lib/markdown.js` and `js/lib/post.js` as shared by the build script, the validator and the browser editor. A change to either affects all three; run `npm test`.
- Treat `minimalist.html` and `terminal/` as standalone surfaces unless explicitly asked to merge them into the main architecture.

## Blog Map

- `content/posts/*.md`: post source, frontmatter plus Markdown
- `scripts/build-blog.mjs`: generates the pages, feed, index JSON, sitemap block and Blogspot redirect snippet
- `js/lib/markdown.js`: the Markdown renderer, shared with the editor; escapes raw HTML rather than passing it through
- `js/lib/post.js`: frontmatter parse/serialise and post normalisation
- `css/blog.css`, `js/blog.js`: the writing index and post pages
- `write/index.html`, `css/editor.css`, `js/editor.js`: the editor, which commits posts via the GitHub contents API

## ononline Module Map

### CSS

- `base.css`: utilities and shared primitives
- `sections.css`: homepage sections and tab layouts
- `project-ui.css`: project modal and lightbox
- `interactive-system.css`: dots renderer styling, CRT layer, controls, cards
- `mobile.css`: responsive corrections and touch/mobile rules

### JavaScript

- `core.js`: performance config, canvas dots field, theme behavior, tab boot sequence
- `interface.js`: reveal/return transitions, modal handling, image lightbox
- `content.js`: project loading, sampler modes, filters, stack/shuffle actions
- `heatmap.js`: click heatmap, oracle overlays, loading overlays, audio helpers

## Editing Guidance

- Prefer changing data files over hardcoding content into HTML.
- The front door renders one Work section in two tiers, not a selected list plus a full index that repeats it. `featured` decides which works lead and in what order; everything else follows alphabetically under `everything else`. Keep every work to a single appearance, and keep the section free of filter, search and sort controls.
- Both landing dialogs share `createRecordDialog` in `js/landing.js`. Add behaviour there rather than to one dialog, so the project and review records stay identical.
- The front door restores its own scroll position because it renders after fetching. If you change when `render` runs, keep `applySavedPosition` after it, or back-navigation from the blog and the branches lands at the top again.
- Keep shared homepage logic inside the existing module split instead of creating a new monolith.
- For responsiveness work, fix the base rule first when possible; use `mobile.css` for targeted overrides.
- For the dots system, preserve the canvas-backed approach unless there is a strong reason to reintroduce DOM-heavy rendering.
- For ASCII mode, keep frame rate capped and avoid per-cell DOM updates.

## Verification Expectations

- Run `npm test` after edits. It syntax-checks every script, runs the markdown and post-format suites, checks the committed blog output is not stale, and runs the content validator.
- Run `npm run build` after touching `content/posts/` or anything the blog templates render, and commit the generated output alongside the source.
- Use `npm run serve` for a browser pass; the blog needs directory URLs and the editor needs ES modules, so `file://` will not do.
- If visual behavior changes, do a browser sanity pass when possible.
- Call out when something was syntax-checked but not browser-tested.

## Invariants

- Never commit `.env`. It is gitignored and rsync-excluded from the Pages artifact.
- Everything user-supplied or feed-derived goes through `escapeHtml` before it reaches `innerHTML`, and every href through `safeHref`/`isSafeUrl`. Match that discipline in new renderers.
- Deleting an image requires checking it is unreferenced across every HTML, JS, CSS, and JSON file first — the validator only checks that referenced assets exist, not the reverse.
- `CNAME` is `satyam.lol` (apex). Every canonical and `og:url` must use the apex host; www 301s to it.
- The editor's GitHub token lives in the author's browser localStorage and must only ever be sent to `api.github.com`. Never add a request from `/write/` to any other origin, and never log or persist the token anywhere else.
- `/write/` stays `noindex` and `Disallow`ed in `robots.txt`.

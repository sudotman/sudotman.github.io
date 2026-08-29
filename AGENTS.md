# AGENTS.md

## Repo Purpose

This repository powers the complete static portfolio network at `satyam.lol`. The parent experience is `index.html`; creative routes and the Core Tech field manual are hosted by the same repository.

## Working Boundaries

- Treat `index.html` as the parent crossing.
- Treat `living/`, `river/`, and `doors/` as three renderings of `content/creative.json` through `js/creative-network.js`.
- Treat `tech.html` as the Core Tech homepage shell, with shared assets in `css/modules/` and `js/modules/`.
- Treat `content/home.json` as the source of truth for the front door: identity, `now`, `featured` order, branches, external feeds, and homepage-only work records.
- Treat `content.json` and `profile.json` as the source of truth for Core Tech (`tech.html`) content and taxonomy.
- Treat `content/creative.json` as presentation-only for the creative archive. It references a canonical `workId`; identity, summaries, links, and media resolve from `content/home.json` and its registered feed.
- Treat `content/external-feeds.json` as generated. Never hand-edit it; run `npm run sync`.
- Treat `minimalist.html` and `terminal/` as standalone surfaces unless explicitly asked to merge them into the main architecture.

## Core Tech Module Map

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
- Keep shared homepage logic inside the existing module split instead of creating a new monolith.
- For responsiveness work, fix the base rule first when possible; use `mobile.css` for targeted overrides.
- For the dots system, preserve the canvas-backed approach unless there is a strong reason to reintroduce DOM-heavy rendering.
- For ASCII mode, keep frame rate capped and avoid per-cell DOM updates.

## Verification Expectations

- Run `npm test` after edits. It syntax-checks every script and runs the content validator.
- If visual behavior changes, do a browser sanity pass when possible.
- Call out when something was syntax-checked but not browser-tested.

## Invariants

- Never commit `.env`. It is gitignored and rsync-excluded from the Pages artifact.
- Everything user-supplied or feed-derived goes through `escapeHtml` before it reaches `innerHTML`, and every href through `safeHref`/`isSafeUrl`. Match that discipline in new renderers.
- Deleting an image requires checking it is unreferenced across every HTML, JS, CSS, and JSON file first — the validator only checks that referenced assets exist, not the reverse.
- `CNAME` is `satyam.lol` (apex). Every canonical and `og:url` must use the apex host; www 301s to it.

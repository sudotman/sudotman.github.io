# AGENTS.md

## Repo Purpose

This repository powers a static personal portfolio site. The main experience is `index.html`, with shared assets in `css/modules/` and `js/modules/`.

## Working Boundaries

- Treat `index.html` as the only shared homepage shell.
- Treat `content.json` and `profile.json` as the source of truth for homepage content.
- Treat `minimalist.html`, `outer_siraji_project.html`, `test.html`, and `terminal/` as standalone surfaces unless explicitly asked to merge them into the main architecture.

## Homepage Module Map

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

- Run `node --check` on changed JavaScript modules after edits.
- If visual behavior changes, do a browser sanity pass when possible.
- Call out when something was syntax-checked but not browser-tested.

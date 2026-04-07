# sudotman.github.io

Static personal website and portfolio repo.

This repo currently contains one main interactive homepage plus a few standalone side pages and experiments. The homepage is data-driven and runs with plain HTML, CSS, and JavaScript loaded directly by `index.html`.

## What Is Live

- `index.html`: main homepage and primary surface
- `content.json`: project card and modal content
- `profile.json`: experience, skills, and interests content
- `css/modules/`: shared homepage styling
- `js/modules/`: shared homepage behavior

## What Is Standalone

- `minimalist.html`: separate text-first profile page
- `outer_siraji_project.html`: standalone concept/prototype page
- `test.html`: sandbox page
- `terminal/`: standalone mini pages

## Frontend Structure

### CSS

- `css/modules/base.css`: shared foundations and generic UI
- `css/modules/sections.css`: main content sections and layouts
- `css/modules/project-ui.css`: project modal and lightbox UI
- `css/modules/interactive-system.css`: dots renderer visuals, cards, CRT effects, controls
- `css/modules/mobile.css`: responsive overrides

### JavaScript

- `js/modules/core.js`: performance flags, canvas dot field, theme wiring, tab bootstrapping
- `js/modules/interface.js`: reveal/return flows, modals, lightbox behavior
- `js/modules/content.js`: content loading, sampler, filters, card controls, scroll-wave behavior
- `js/modules/heatmap.js`: click heatmap, oracle/loading overlays, sound helpers

## Data Model

### `content.json`

Controls:
- project ids
- categories
- summary/long descriptions
- gallery images
- external links

### `profile.json`

Controls:
- work experience
- education
- tech stack
- interests

## Running Locally

Use a static server because the homepage fetches JSON files.

```powershell
npx serve .
```

or

```powershell
python -m http.server 8000
```

Then open the served URL in a browser.

## Current Notes

- The homepage dots are now canvas-backed rather than DOM-dot based.
- Heatmap clicks still work on the normal homepage view.
- ASCII mode is rendered from the webcam feed into the canvas path instead of rewriting DOM nodes.
- Vendor assets are committed locally under `vendor/`.

## Maintenance Rule Of Thumb

- If you are changing homepage content, start with `content.json` or `profile.json`.
- If you are changing homepage visuals, start in `css/modules/`.
- If you are changing homepage behavior, start in `js/modules/`.
- If you are touching a standalone page, keep it isolated unless you intentionally want it folded into the shared homepage system.

# Project Structure

## Purpose

This repository hosts a static personal website and a few adjacent standalone pages. The main portfolio experience is data-driven and lives around `index.html`, `content.json`, `profile.json`, and the shared assets under `css/modules/` and `js/modules/`.

## Repo Map

```text
.
|-- index.html
|-- minimalist.html
|-- outer_siraji_project.html
|-- test.html
|-- content.json
|-- profile.json
|-- css/
|   `-- modules/
|       |-- base.css
|       |-- sections.css
|       |-- project-ui.css
|       |-- interactive-system.css
|       `-- mobile.css
|-- js/
|   `-- modules/
|       |-- core.js
|       |-- interface.js
|       |-- content.js
|       `-- heatmap.js
|-- images/
|-- icons/
|-- sounds/
|-- terminal/
|-- vendor/
|   |-- css/
|   `-- js/
|-- .github/
|-- .kiro/
`-- docs/
```

## Entry Points

### `index.html`

The main live homepage.

Responsibilities:
- Loads vendor CSS/JS plus the modular local CSS/JS files.
- Holds the static shell for the header, footer, dots canvas area, modals, and tab containers.
- Delegates almost all dynamic content to JSON and JavaScript.

### `minimalist.html`

A separate minimal text-first version of the site. It is self-contained and does not reuse the shared homepage modules.

### `outer_siraji_project.html`

A standalone concept/prototype page for a language-preservation project. It currently uses inline styles and CDN-delivered Tailwind rather than the shared homepage system.

### `test.html`

An experimental page for visual/interaction prototyping. Treat it as a sandbox, not part of the main portfolio architecture.

### `terminal/`

Holds niche standalone HTML pages unrelated to the main homepage shell.

## Data Files

### `content.json`

Primary source for portfolio projects.

Contains:
- project ids
- categories
- titles and descriptions
- gallery image arrays
- external links

`js/modules/content.js` reads this file to render project cards and project modal content.

### `profile.json`

Primary source for experience, skills, and interests.

Contains:
- work experience
- education
- tech stack
- interests and related links

`js/modules/core.js` reads this file to populate the experience and interests tabs.

## CSS Modules

### `css/modules/base.css`

Shared foundations and early-page UI.

Includes:
- generic utilities
- modal scroll locking
- TLDR modal
- sites modal

### `css/modules/sections.css`

Main content-section styling.

Includes:
- revealed projects container
- tab panels
- experience layout
- interests layout

### `css/modules/project-ui.css`

Project presentation surfaces.

Includes:
- project modal
- project modal layout
- image lightbox

### `css/modules/interactive-system.css`

Homepage-specific interaction styling.

Includes:
- project cards
- dots system
- CRT overlay
- theme variants
- constellation navigation
- card controls
- central card icon styling

### `css/modules/mobile.css`

Responsive overrides and touch/mobile fixes. This file is intentionally last so it can override desktop-first rules cleanly.

## JavaScript Modules

### `js/modules/core.js`

Core bootstrapping and shared behaviors.

Includes:
- performance flags
- glowing dots grid setup
- homepage boot sequence
- theme toggle
- tab switching
- profile loading
- drag system

### `js/modules/interface.js`

Top-level interface actions.

Includes:
- reveal/return transitions
- TLDR modal behavior
- sites modal behavior
- project modal creation
- image lightbox behavior
- escape-key and click interactions

### `js/modules/content.js`

Content rendering and card interactions.

Includes:
- scroll-based dot motion
- project loading from `content.json`
- color sampler
- card audio helpers
- stack/shuffle/filter controls

### `js/modules/heatmap.js`

Visitor heatmap and oracle-related behavior.

Includes:
- KVDB sync
- local caching
- progressive heatmap reveal
- oracle overlays
- sound helpers
- loading overlays

## Asset Directories

### `images/`

Project screenshots, gifs, hero assets, and general media. The folder currently mixes homepage assets and project-specific assets, so naming consistency matters.

### `icons/`

Small SVG assets used as UI symbols or branding elements.

### `sounds/`

Small UI sound effects used by card actions.

### `vendor/`

Pinned third-party assets committed into the repo.

Notable dependencies:
- GSAP
- InertiaPlugin
- jQuery
- Webflow CSS/JS

## Non-Website Support Files

### `.github/`

Repository automation and deployment workflow files.

### `.kiro/`

Internal steering/spec documentation. Useful for project context, but not part of the runtime website.

### `.vscode/`

Editor-specific workspace settings.

## What Is Shared Vs Standalone

Shared homepage system:
- `index.html`
- `content.json`
- `profile.json`
- `css/modules/*`
- `js/modules/*`
- `images/`, `icons/`, `sounds/`, `vendor/`

Standalone pages:
- `minimalist.html`
- `outer_siraji_project.html`
- `test.html`
- `terminal/*`

This distinction matters because changes to the shared modules should be made carefully, while standalone pages can be refactored or archived independently.

## Editing Guidance

- If you are changing homepage visuals, start with `index.html` plus the relevant CSS module.
- If you are changing project cards or project modal content, edit `content.json` first.
- If you are changing experience, skills, or interests, edit `profile.json` first.
- If you are fixing responsiveness, start in `css/modules/mobile.css`, then move earlier only if a base rule is fundamentally wrong.
- If a file is experimental and not wired into `index.html`, avoid mixing its styles/scripts into the shared homepage system.

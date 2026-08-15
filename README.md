# satyam.lol

Satyam Kashyap's static portfolio network: one concise front door, three exploratory arrangements of the creative archive, and a deeper technical field manual.

Everything is plain HTML, CSS, JavaScript, and JSON deployed through GitHub Pages. There is no build step.

## Routes

- `/`: the direct Hypertext introduction, visible project index, and native project records
- `/living/`: the archive as a contact sheet
- `/river/`: the archive as a horizontal current
- `/doors/`: the archive as spatial thresholds
- `/tech.html`: the complete Core Tech field manual and project dossiers

The root is intentionally brief. It establishes Satyam's identity, current practice, films, R&D, public-code products, and writing without duplicating the full dossiers. Living, River, Doors, and Core Tech remain the deeper entrances.

Standalone surfaces remain isolated unless deliberately folded into the network:

- `minimalist.html`
- `outer_siraji_project.html`
- `test.html`
- `terminal/`

## Source of truth

### `content.json`

The original, deliberately small Core Tech manifest contains:

- `siteHeader`: the Core Tech archive introduction
- `catalog.tracks` and `catalog.mediums`: shared taxonomy
- `catalog.sources`: the ordered publishing-feed registry

The current feeds are:

- `content/programming.json`: technical and programming work
- `content/film-art.json`: the original, currently empty Core Tech publishing path for films and art

### `content/home.json`

The front page source is intentionally compact:

- `identity`: name, role, introduction, contact, and public profiles
- `now`: the film and applied-R&D notes currently in progress
- `featured`: stable ids for the selected-project list
- `branches`: the four existing ways to go deeper — Living, River, Doors, and Core Tech
- `externalFeeds`: the Blogger and Letterboxd feed URLs, generated cache path, and long-review threshold
- `works`: concise homepage-only records
- `sources`: the existing technical feed used to complete the 27-project index

`content/external-feeds.json` is generated from those public feeds. It contains every Blogger post in the current blog feed and Letterboxd film reviews whose text is longer than the configured threshold. The sync merges older qualifying reviews into the cache as the rolling RSS feed advances, so the local index can grow over time. Do not hand-edit it; run `node scripts/sync-external-feeds.mjs` instead.

Links inside homepage work records use a small object (`live`, `source`, `read`, `record`, or `contact`) so the interface can derive its own wording instead of storing presentation labels in the data.

### `content/creative.json`

This is the presentation map for Living, River, and Doors. Each entry references a canonical `workId` and adds only archive-specific presentation data such as slug, discipline, year override, and colors.

Do not duplicate identity, summaries, links, or media here. Those resolve from `content/home.json` and its registered technical feed through `js/creative-network.js`.

### `profile.json`

This controls the detailed Core Tech profile:

- experience
- education
- technical stack
- interests

## Frontend structure

### Front door

- `index.html`: accessible shell, SEO metadata, and no-script fallback
- `css/landing.css`: the responsive Hypertext visual system and project dialog
- `js/landing.js`: compact data loading, visible indexes, branch register, and native project records

The front page exposes identity, current work, selected projects, the complete project index, Blogger writing, long-form Letterboxd reviews, and all four deeper branches. Project summaries stay visible; opening a project or review reveals its full record in a dedicated native dialog.

The Pages workflow refreshes both external feeds on every deployment and every six hours. A checked-in cache keeps local development and deployments resilient when a source is briefly unavailable.

### Creative archive

- `css/creative-network.css`: shared styling for Living, River, and Doors
- `js/creative-network.js`: canonical-data resolution and route-specific interactions

### Core Tech

CSS modules:

- `css/modules/base.css`
- `css/modules/sections.css`
- `css/modules/project-ui.css`
- `css/modules/interactive-system.css`
- `css/modules/mobile.css`

JavaScript modules:

- `js/modules/core.js`
- `js/modules/interface.js`
- `js/modules/content.js`
- `js/modules/heatmap.js`

Core Tech supports its existing `#work/<id>` deep links.

## Publishing a work

1. Decide whether the record belongs in `content/home.json` or the existing technical feed.
2. Give it a globally unique, stable `id`.
3. For technical-feed work, use a registered category. Homepage-only records use a plain-language medium.
4. Add an optimized local cover when possible. Remote HTTPS media is supported, but original local film assets are more reliable than third-party poster URLs.
5. Add meaningful alternative text to every image.
6. Reference the id from `featured` or `content/creative.json` only when it belongs in that view.
7. Run `node scripts/validate-content.mjs`.

Published public code without an explicit license should be described as public code or built in public, not automatically as open source.

### Homepage work shape

```json
{
  "id": "film-example",
  "title": "Example",
  "medium": "film",
  "year": "2026",
  "summary": "A short plain-text description.",
  "body": "A longer project description.",
  "images": ["images/example.webp"],
  "links": {
    "record": "https://example.com/"
  }
}
```

## Validation

```sh
node scripts/sync-external-feeds.mjs
node scripts/validate-content.mjs
```

The validator checks the Core Tech manifest, compact homepage data, profile, registered feeds, taxonomy, unique ids, URLs, creative-archive references, and local assets. It has no package dependencies.

Run `node --check` on any changed JavaScript file as well.

## Running locally

Use a static server because the interfaces fetch JSON:

```sh
python3 -m http.server 8000
```

Then open `http://localhost:8000/`.

## Maintenance rule of thumb

- Identity, front-door language, featured order, branches, and homepage-only work: `content/home.json`
- Core Tech manifest and taxonomy: `content.json`
- Technical work: `content/programming.json`
- Films and art: `content/film-art.json`
- Creative-archive appearance and order: `content/creative.json`
- Experience, stack, and interests: `profile.json`
- Front-door visuals or behavior: `css/landing.css` and `js/landing.js`
- Living, River, or Doors: `css/creative-network.css` and `js/creative-network.js`
- Core Tech: the existing files under `css/modules/` and `js/modules/`

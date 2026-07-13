# sudotman.github.io

Static personal website and portfolio repo.

This repo contains one main editorial portfolio plus a few standalone side pages and experiments. The homepage is a data-driven “field manual of impossible machines” and runs with plain HTML, CSS, and JavaScript loaded directly by `index.html`.

## What Is Live

- `index.html`: main homepage and primary surface
- `content.json`: portfolio manifest, taxonomy, and publishing-feed registry
- `content/programming.json`: programming and technical work
- `content/film-art.json`: film and art work
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
- `css/modules/interactive-system.css`: instrument engraving, reveal motion, pointer registration, and interaction states
- `css/modules/mobile.css`: responsive overrides

### JavaScript

- `js/modules/core.js`: shared state, scroll progress, section tracking, reveal wiring, and the canvas instrument engraving
- `js/modules/interface.js`: navigation, hash-addressable project folios, safe legacy body rendering, and the image lightbox
- `js/modules/content.js`: manifest/feed normalization plus rendering for work, experience, education, interests, and satellite sites
- `js/modules/heatmap.js`: lightweight pointer registration, lens parallax, and project-plate coordinate details

## Data Model

### `content.json`

This is the source of truth for the portfolio catalog contract. It defines the schema version, identity and contact details, homepage language, curated work, satellite sites, track and medium taxonomy, and the ordered list of publishing feeds. Do not add an unregistered feed.

The current feeds are:

- `content/programming.json`, whose works inherit the `programming` track
- `content/film-art.json`, whose works inherit the `arts` track

Both feeds use stable work ids. Existing programming records retain the legacy `short`, `long`, `image`, and `gallery` fields; new records should prefer the v2 `summary`, `body`, `cover`, and `media` fields. A work at the intersection of both practices can set `"tracks": ["programming", "arts"]` explicitly.

### `profile.json`

Controls:
- work experience
- education
- tech stack
- interests

## Publishing Workflows

### Programming work

1. Add optimized local media under `images/` or use stable HTTPS media URLs.
2. Add the work to `content/programming.json` and choose a registered medium such as `open_source`, `game`, `rnd`, or `art`.
3. Keep the source default unless the work is hybrid; hybrid work should explicitly list both tracks.
4. Run `node scripts/validate-content.mjs` before committing.

### Film and art work

1. Add an optimized cover plus any stills or posters under `images/`.
2. Add the work to `content/film-art.json` and choose `film`, `installation`, or `visual_art`.
3. Give every new image meaningful alternative text. Model playable media with the supported typed `media` entries below instead of hiding embed URLs in `links`.
4. Run `node scripts/validate-content.mjs` before committing.

The public feeds should contain published work only; hiding a draft in browser code does not make its JSON private.

### Supported v2 media

- Images use `{ "type": "image", "src": "...", "alt": "..." }`; `thumbnail`, `caption`, `width`, and `height` are optional.
- Hosted video uses `{ "type": "video", "provider": "youtube", "id": "...", "title": "..." }`. The supported providers are `youtube` (the 11-character video id) and `vimeo` (the numeric video id).
- Direct video uses `{ "type": "video", "src": "...", "title": "..." }`; `poster` and `caption` are optional. Do not combine `src` with `provider`/`id`.
- Audio uses `{ "type": "audio", "src": "...", "title": "..." }`; `caption` is optional.

Video and audio sources are hydrated only when their modal section approaches the viewport. Use repository-relative files or HTTPS URLs; provider page URLs are not ids.

### V2 work example

This documentation-only example shows the minimum shape for a new film/art entry. Replace every placeholder before adding a real work to a feed.

```json
{
  "id": "film-replace-with-slug",
  "title": "Replace with title",
  "medium": "film",
  "sortDate": "2026-01-01",
  "roles": ["director"],
  "summary": "A short plain-text description for the portfolio card.",
  "body": [
    {
      "type": "paragraph",
      "text": "A longer project description."
    }
  ],
  "cover": {
    "src": "images/replace-with-cover.webp",
    "alt": "Describe the visible still or poster",
    "width": 1200,
    "height": 800
  },
  "media": [
    {
      "type": "video",
      "provider": "youtube",
      "id": "replace-with-video-id",
      "title": "Replace with accessible video title"
    }
  ],
  "links": [
    {
      "kind": "watch",
      "href": "https://example.com/replace-me",
      "label": "watch film"
    }
  ]
}
```

### Validation

`node scripts/validate-content.mjs` checks the manifest, profile shape, both feeds, taxonomy references, unique work ids, core fields, links, and every local asset path. It exits nonzero on errors and has no package dependencies.

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

- The homepage opens directly on the portfolio; there is no entrance gate or hidden archive.
- The hero engraving is canvas-backed, low-density, capped at 27 fps, and static when reduced motion is requested.
- Project details use native dialogs and retain `#work/<id>` deep links.
- The film/art publishing feed remains intentionally empty and is represented as a developing branch.
- Vendor assets remain committed for standalone legacy surfaces, but the homepage no longer loads them.

## Maintenance Rule Of Thumb

- If you are changing portfolio structure or taxonomy, start with `content.json`; publish individual works through the registered feed files.
- If you are changing experience, skills, education, or interests, start with `profile.json`.
- If you are changing homepage visuals, start in `css/modules/`.
- If you are changing homepage behavior, start in `js/modules/`.
- If you are touching a standalone page, keep it isolated unless you intentionally want it folded into the shared homepage system.

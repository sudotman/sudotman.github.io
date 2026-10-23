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
- Treat `content/reel.json` as the source of truth for everything the showreel says, for the type and palette it says it in, and for how its soundtrack sounds (`music`: on/off, the voice, a fader per stem, volume, warmth, tape spin-up, stripe pulse). The choreography stays in `js/intro.js`; the arrangement stays in `scripts/soundtrack/`.
- Treat `sounds/reel/` and `sounds/intro.mp3` as generated. The soundtrack is synthesised by `scripts/soundtrack/audio.py` (numpy) and rendered to stems by `npm run soundtrack` (needs python3, numpy and ffmpeg; not part of `npm test`). Then run `npm run build`, which carries `sounds/reel/stems.json` into `js/reel-config.js`. `audio.py` mirrors the warp constants in `js/intro.js` (RATE, RAMP, the web freeze list); change both together.
- Treat `blog/`, `content/blog.json`, `js/reel-config.js`, the `blog:start`/`blog:end` block in `sitemap.xml`, and `docs/` as generated. Never hand-edit them; run `npm run build`.
- Treat `content/external-feeds.json` as generated. Never hand-edit it; run `npm run sync`. It carries Letterboxd reviews only — writing is native now, and the Blogger feed was retired.
- Treat `js/lib/markdown.js` and `js/lib/post.js` as shared by the build script, the validator and the browser editor. A change to either affects all three; run `npm test`.
- Treat `js/lib/github.js` and `js/lib/schema.js` as shared by the writing desk and the studio. A change to either affects both desks; run `npm test`.
- Treat `js/lib/substack.js` as the Substack paste format, used only by the editor's copy button. Nothing in this repository talks to Substack over the network, and nothing should start to: its write endpoints are private and undocumented.
- Treat `minimalist.html` and `terminal/` as standalone surfaces unless explicitly asked to merge them into the main architecture.

## Blog Map

- `content/posts/*.md`: post source, frontmatter plus Markdown
- `scripts/build-blog.mjs`: generates the pages, feed, index JSON, sitemap block and Blogspot redirect snippet
- `js/lib/markdown.js`: the Markdown renderer, shared with the editor; escapes raw HTML rather than passing it through
- `js/lib/post.js`: frontmatter parse/serialise and post normalisation
- `css/blog.css`, `js/blog.js`: the writing index and post pages
- `write/index.html`, `css/editor.css`, `js/editor.js`: the editor, which commits posts via the GitHub contents API
- `js/lib/substack.js`: the Substack paste format, shared by the editor's copy button and its tests

## Studio Map

The studio at `/studio/` edits every structured surface except prose, and commits a whole
changeset as one commit through the git data API. Prose keeps its own desk at `/write/`.

- `studio/index.html`, `css/studio.css`: the shell
- `js/lib/github.js`: token, config, single-file writes, and `commitFiles` — shared with the editor
- `js/lib/schema.js`: the field descriptors every studio form and check is built from. These
  mirror `scripts/validate-content.mjs`, which stays the authority; tighten a rule there and
  tighten it here, or the studio will commit something CI rejects
- `js/studio/store.js`: the loaded documents and the pending changeset
- `js/studio/model.js`: a work gathered across `home.json`, `programming.json`, `creative.json`
  and `content.json`, and taken apart again on write
- `js/studio/diff.js`: the readable change list and the raw line diff
- `js/studio/preview.js`: hands the changeset to the live site in sessionStorage
- `js/studio/views/*.js`: one screen each; `works.js` and `record.js` are the centre of it
- `js/studio/soundtrack.js`: the cassette deck on the reel screen — a shelf of voices, a channel strip per stem,
  the master. It loads `js/intro.js` and plays through its `SatyamReel.sound` mixer, so there is one audio chain

Files are written as `JSON.stringify(value, null, 2)` with a trailing newline, which is exactly
how they are committed today. Keep them that way: reformatting one by hand turns the next
studio diff into a whole-file rewrite.

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
- The intro (`js/intro.js`) is only loaded when the inline script in `index.html` decides to play it: first visit in a tab, and never for deep links, back-navigation, reduced motion or automation. It ends by landing on `.hyper-intro h1` and `.hyper-subtitle`, measured live, so after changing their typography open `/?intro` and check the landing still matches. Keep its cover rules in `landing.css` in step with the body's stripe. `[reel]` in the entry nav replays it through `SatyamIntro.play`; it opens the audio context inside the click, so keep that call synchronous in the handler.
- The reel's words, fonts and colours come from `content/reel.json`, but `js/intro.js` keeps a full copy as its fallback, so a missing or malformed config costs nothing. Change one and change the other, or the reel will say different things depending on whether the config loaded. Lists the cut is timed against — the four xr headings, the four headline words, the three film cards — are held to their length by `mergeReel`; adding an entry there means editing the choreography too.
- Both landing dialogs share `createRecordDialog` in `js/landing.js`. Add behaviour there rather than to one dialog, so the project and review records stay identical.
- The front door restores its own scroll position because it renders after fetching. If you change when `render` runs, keep `applySavedPosition` after it, or back-navigation from the blog and the branches lands at the top again.
- Keep shared homepage logic inside the existing module split instead of creating a new monolith.
- For responsiveness work, fix the base rule first when possible; use `mobile.css` for targeted overrides.
- For the dots system, preserve the canvas-backed approach unless there is a strong reason to reintroduce DOM-heavy rendering.
- For ASCII mode, keep frame rate capped and avoid per-cell DOM updates.

## Verification Expectations

- Run `npm test` after edits. It syntax-checks every script under `js/` and `scripts/`, runs the markdown, post-format, Substack and studio suites, checks the committed blog and reel output is not stale, and runs the content validator.
- Run `npm run build` after touching `content/posts/`, `content/reel.json`, or anything the blog templates render, and commit the generated output alongside the source.
- Use `npm run serve` for a browser pass; the blog needs directory URLs and the editor needs ES modules, so `file://` will not do.
- If visual behavior changes, do a browser sanity pass when possible.
- Call out when something was syntax-checked but not browser-tested.

## Invariants

- Never commit `.env`. It is gitignored and rsync-excluded from the Pages artifact.
- Everything user-supplied or feed-derived goes through `escapeHtml` before it reaches `innerHTML`, and every href through `safeHref`/`isSafeUrl`. Match that discipline in new renderers.
- Deleting an image requires checking it is unreferenced across every HTML, JS, CSS, and JSON file first — the validator only checks that referenced assets exist, not the reverse.
- `CNAME` is `satyam.lol` (apex). Every canonical and `og:url` must use the apex host; www 301s to it.
- The GitHub token lives in the author's browser localStorage under one key shared by `/write/` and `/studio/`, and must only ever be sent to `api.github.com`. Never add a request from either desk to any other origin, and never log or persist the token anywhere else.
- `/write/` and `/studio/` stay `noindex` and `Disallow`ed in `robots.txt`.
- The studio builds its DOM with `createElement` and `textContent` rather than `innerHTML`. Keep it that way: it renders repository data, and that is the same discipline `escapeHtml` enforces on the site.

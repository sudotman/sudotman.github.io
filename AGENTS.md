# AGENTS.md

## Repo Purpose

This repository powers the complete static portfolio network at `satyam.lol`. The parent experience is `index.html`; creative routes and the ononline field manual are hosted by the same repository.

## Working Boundaries

- Treat `index.html` as the parent crossing.
- Treat `living/`, `river/`, and `doors/` as three renderings of `content/creative.json` through `js/creative-network.js`.
- Treat `tech.html` as the ononline homepage shell, with shared assets in `css/modules/` and `js/modules/`.
- Treat `content/home.json` as the source of truth for the front door: identity, `now`, `featured` order, branches, external feeds, homepage-only work records, what the fixed words say in other languages (`languages`), and the door's address (`door.endpoint`).
- Treat `content.json` and `profile.json` as the source of truth for ononline (`tech.html`) content and taxonomy.
- Treat `content/creative.json` as presentation-only for the creative archive. It references a canonical `workId`; identity, summaries, links, and media resolve from `content/home.json` and its registered feed.
- Treat `content/posts/*.md` as the source of truth for the blog. One file is one post; the filename is the slug.
- Treat `content/reel.json` as the source of truth for everything the showreel says, for the type and palette it says it in, and for how its soundtrack sounds (`music`: on/off, the voice, a fader per stem, volume, warmth, tape spin-up, stripe pulse). The choreography stays in `js/intro.js`; the arrangement stays in `scripts/soundtrack/`.
- Treat `sounds/reel/` and `sounds/intro.mp3` as generated. The soundtrack is synthesised by `scripts/soundtrack/audio.py` (numpy) and rendered to stems by `npm run soundtrack` (needs python3, numpy and ffmpeg; not part of `npm test`). Then run `npm run build`, which carries `sounds/reel/stems.json` into `js/reel-config.js`. `audio.py` mirrors the warp constants in `js/intro.js` (RATE, RAMP, the web freeze list); change both together.
- Treat `blog/`, `content/blog.json`, `js/reel-config.js`, the `blog:start`/`blog:end` block in `sitemap.xml`, and `docs/` as generated. Never hand-edit them; run `npm run build`.
- Treat `content/external-feeds.json` as generated. Never hand-edit it; run `npm run sync`. It carries Letterboxd reviews only — writing is native now, and the Blogger feed was retired.
- Treat `content/door.json` as generated. Never hand-edit it; run `npm run sync:door`. It is the committed copy of the words visitors left at the door.
- Treat `scripts/door/` as a service, not part of the static site: it is excluded from the Pages artifact with the rest of `scripts/`, and deployed separately (its README has the steps).
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

## Front Door Map

`js/landing.js` renders the page and then says so with three events on `document`:
`landing:ready` (the page exists; carries `home`, the works map and the reviews),
`landing:record` / `landing:record-closed` (a record dialog rendered or closed) and
`landing:rows` (more review rows arrived). The scripts below add their own for what a
visitor did: `language:switched`, `visitor:kept` (star, unstar, mark, lift) and `door:left`
(note, word, sweep); `js/ambient.js` turns each into a sound, so a new action that should be
heard dispatches one of these and gets an entry in `CUES`. Everything below listens for those and hangs its
own controls on the page; none of them is called by `landing.js`, and each can fail to load
without taking the page with it. They are loaded before `landing.js` in `index.html`, in the
order their links join the entry nav.

- `js/visitor.js`: the visitor's own layer, kept in localStorage and nowhere else. Stars (a
  button closing each work row and in its record), the highlighter (picked up from the yellow
  chip; marks are drawn with the CSS Custom Highlight API and remembered by their words, per
  `data-mark-scope`), and `[your copy]`, the page cut down to those two
- `js/language.js`: the name is the language switch. It rewrites every `[data-say]` element
  from `languages` in `content/home.json`, and the welcome line down the left edge
- `js/ambient.js`: `[sound]` at the top right, and `sound` in the footer line. A synth
  pad made of oscillators, not a recording: each part of the page holds one of the reel's
  chords, scrolling picks out its notes and touching a link or button strums them. It gives
  the page's events sounds of their own (`CUES`: a record opening and closing, the language
  changing, stars, marks, the door) and while on, makes the stripe breathe and fray into the margin in dithered yellow and stands a dithered landscape along the foot of the window that goes from peaks to sea as the page scrolls, with a sun at the end, a star per word left at the door (`door:words`) and a paper boat for a note; a touch ripples through all of it
- `js/door.js`: note from the previous visitor under the door and one word each, talking to `scripts/door/`
- `scripts/door/core.mjs`: all of the door's logic; `worker.mjs` runs it on Cloudflare with D1,
  `server.mjs` on Node with `node:sqlite`. `scripts/test-door.mjs` pins its rules
- `scripts/sync-door.mjs`, `.github/workflows/door.yml`: copy the words into `content/door.json`
  and commit them

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
- The intro (`js/intro.js`) never plays unasked. It is loaded by the `reel` row that closes More ways through (any link carrying `data-reel`; the row is written in `render`, not a branch in `home.json`, because a branch is a page), or by the inline script in `index.html` on an arrival at `/?intro` (those links' own href, and what the studio's preview opens; not on back-navigation). Do not bring back a first-visit autoplay. It ends by landing on `.hyper-intro h1` and `.hyper-subtitle`, measured live, so after changing their typography open `/?intro` and check the landing still matches. Keep its cover rules in `landing.css` in step with the body's stripe. The stripe plays it too: `.stripe-reel` is a `data-reel` link laid over the stripe and the margin beside it, out of the tab order because it repeats the `reel` row; the body still paints the stripe, so keep that link's width in step with it as well. Those links play it through `SatyamIntro.play`; it opens the audio context inside the click, so keep that call synchronous in the handler.
- The reel's words, fonts and colours come from `content/reel.json`, but `js/intro.js` keeps a full copy as its fallback, so a missing or malformed config costs nothing. Change one and change the other, or the reel will say different things depending on whether the config loaded. Lists the cut is timed against — the four xr headings, the four headline words, the three film cards — are held to their length by `mergeReel`; adding an entry there means editing the choreography too.
- The front door, the 404 and the writing pages take every colour from `css/theme.css`, which each loads before its own stylesheet; `css/landing.css` and `css/blog.css` name tokens, never colours. Light is the default and dark is Solarized Dark, chosen with the `[dark]` / `[light]` bracket link (any element carrying `data-theme-toggle`) and kept in localStorage by `js/theme.js`, which is loaded in the head without `defer` so the choice is on `<html>` before first paint. Do not make it follow `prefers-color-scheme`. A new colour goes into both palettes in `theme.css`; the dark values stay on the Solarized palette. The blog's copy of the toggle lives in `chrome()` in `scripts/build-blog.mjs`.
- The reel wears the page's theme on the site. In `createReel`, `C` holds the colours of the scenes drawn as the page (01 front door, 04 tools, 05 intersection, 06 sign-off, the stripe, the flash): `LIGHT` is the cut as authored and what the video renders always use; in the dark theme `play` passes `dark` and the same roles are read from the `css/theme.css` tokens on `<html>`, with the Solarized literals as fallback. The xr and film scenes (02, 03) keep their own colours in both. A colour added to those page scenes goes through `C`, not a literal, or the dark reel will show a light patch; the name is set in `onYellow` while it sits on the slab or the field and mixes to `strong` as they leave. After touching it, step through both themes with `SatyamReel.create(host, { web: true, dark })` and `seek`.
- The name is the language switch (`js/language.js`): english, hindi, urdu. A new fixed word on the front door gets a `data-say` key in `render` and an entry per language in `content/home.json`; a language without one leaves the english. Each script has its own setting of the name in `landing.css` (`:lang(hi)`, `:lang(ur)`) because neither can wear the latin tracking or leading; the name's size is `--name-size` on `.hyper-intro`, so change that, not the `h1`. The reel is english until its end card, which says the name and the chip in the page's language and copies their setting from the page (`sayAsPage` in `js/intro.js`), so the page keeps its language while the reel plays. A new language, or a change to how `landing.css` sets one, needs no change there, but open `/?intro` in it and check the landing still matches.
- A section the highlighter may mark carries `data-mark-scope`; a record dialog gets one per record. `js/ambient.js` reads the same attribute to know which part of the page is on screen, so a new section needs it for both, and a chord in `WHERE` if it should hold anything but the default. Text a visitor wrote (the door) is deliberately not markable.
- The sound never starts unasked and is not remembered between visits. Its chords mirror `CH` in `scripts/soundtrack/audio.py`; if the reel changes key, change `CHORDS` in `js/ambient.js` with it. The entry nav has two sides: links that go somewhere and how the page reads on the left, what plays (`[sound]`) in `.hyper-entry-nav__right`. Keep it to those; anything else goes in the footer line.
- The front door prints as a CV (`@media print` at the end of `landing.css`), and `css/theme.css` puts the light palette back for print. A new block on the page is either set for print there or added to its hidden list.
- Both landing dialogs share `createRecordDialog` in `js/landing.js`. Add behaviour there rather than to one dialog, so the project and review records stay identical.
- The front door restores its own scroll position because it renders after fetching. If you change when `render` runs, keep `applySavedPosition` after it, or back-navigation from the blog and the branches lands at the top again.
- Keep shared homepage logic inside the existing module split instead of creating a new monolith.
- For responsiveness work, fix the base rule first when possible; use `mobile.css` for targeted overrides.
- For the dots system, preserve the canvas-backed approach unless there is a strong reason to reintroduce DOM-heavy rendering.
- For ASCII mode, keep frame rate capped and avoid per-cell DOM updates.

## Verification Expectations

- Run `npm test` after edits. It syntax-checks every script under `js/` and `scripts/`, runs the markdown, post-format, Substack, studio and door suites, checks the committed blog and reel output is not stale, and runs the content validator.
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
- The door (`door.endpoint`) is the only origin other than `satyam.lol` the front door talks to. It is sent what the visitor typed and nothing else: no cookies, no credentials, no identifiers. Do not add another, and do not send it more.
- Whatever a stranger wrote (a note, a word) reaches the page through `textContent`, never markup, and the door refuses links. Keep both: the service is the only place the site takes writing from people who are not its author.
- Stars and marks never leave the visitor's browser. Nothing in `js/visitor.js` makes a request.
- `/write/` and `/studio/` stay `noindex` and `Disallow`ed in `robots.txt`.
- The studio builds its DOM with `createElement` and `textContent` rather than `innerHTML`. Keep it that way: it renders repository data, and that is the same discipline `escapeHtml` enforces on the site.

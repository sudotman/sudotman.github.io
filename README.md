# satyam.lol

Satyam Kashyap's static portfolio network: one concise front door, three exploratory arrangements of the creative archive, and a deeper technical field manual.

Everything is plain HTML, CSS, JavaScript, JSON, and Markdown deployed through GitHub Pages. There is no bundler; the only generated output is the blog, and it is committed so a clone previews correctly with nothing installed.

## Routes

- `/`: the direct Hypertext introduction, visible project index, and native project records
- `/living/`: the archive as a contact sheet
- `/river/`: the archive as a horizontal current
- `/doors/`: the archive as spatial thresholds
- `/blog/`: the native writing archive, built from `content/posts/*.md`
- `/blog/<slug>/`: a post, rendered to static HTML at build time
- `/blog/feed.xml`: RSS, with full post content
- `/write/`: the writing desk (noindex, and disallowed in `robots.txt`)
- `/studio/`: the content dashboard (noindex, and disallowed in `robots.txt`)
- `/tech.html`: the complete ononline field manual and project dossiers

The root is intentionally brief. It establishes Satyam's identity, current practice, films, R&D, public-code products, and writing without duplicating the full dossiers. Living, River, Doors, and ononline remain the deeper entrances.

Standalone surfaces remain isolated unless deliberately folded into the network:

- `minimalist.html`
- `terminal/`

## Source of truth

### `content.json`

The original, deliberately small ononline manifest contains:

- `siteHeader`: the ononline archive introduction
- `catalog.tracks` and `catalog.mediums`: shared taxonomy
- `catalog.sources`: the ordered publishing-feed registry

The current feeds are:

- `content/programming.json`: technical and programming work
- `content/film-art.json`: the original, currently empty ononline publishing path for films and art

### `content/home.json`

The front page source is intentionally compact:

- `identity`: name, role, introduction, contact, and public profiles
- `now`: the film and applied-R&D notes currently in progress
- `featured`: stable ids for the works that lead the Work section, in the order they appear there
- `branches`: the four existing ways to go deeper — Living, River, Doors, and ononline
- `externalFeeds`: the Letterboxd feed/archive URLs, the generated caches (`cache` for reviews, `blog` for the writing index), and the long-review threshold
- `works`: concise homepage-only records
- `sources`: the existing technical feed used to complete the full work index

`content/external-feeds.json` is generated from Letterboxd. It contains every public review found by walking the account's paginated review archive, keeping only reviews whose text is longer than the configured threshold. The RSS feed supplies newly published and recently edited reviews; the archive walk supplies older history. Do not hand-edit it; run `node scripts/sync-external-feeds.mjs` instead.

Writing is no longer fetched from Blogspot. It lives in this repository — see [The blog](#the-blog).

Links inside homepage work records use a small object (`live`, `source`, `read`, `record`, or `contact`) so the interface can derive its own wording instead of storing presentation labels in the data.

### `content/creative.json`

This is the presentation map for Living, River, and Doors. Each entry references a canonical `workId` and adds only archive-specific presentation data such as slug, discipline, year override, and colors.

Do not duplicate identity, summaries, links, or media here. Those resolve from `content/home.json` and its registered technical feed through `js/creative-network.js`.

### `profile.json`

This controls the detailed ononline profile:

- experience
- education
- technical stack
- interests

## Frontend structure

### Front door

- `index.html`: accessible shell, SEO metadata, and no-script fallback
- `css/landing.css`: the responsive Hypertext visual system, the work register, and the record dialogs
- `js/landing.js`: compact data loading, the two-tier work register, branch register, and native project records
- `js/intro.js`: the 15-second showreel that opens the front door once per tab, then sets the name down on the page's own heading; the same engine renders the video cuts. `index.html` decides whether it plays; `?intro` forces it. Its soundtrack, `sounds/intro.mp3`, is rendered by the showreel kit to the engine's timing and comes in on the first click or tap. `[reel]` in the entry nav replays it with sound from the first frame

The front page exposes identity, current work, one two-tier work register, native writing from `content/blog.json`, long-form Letterboxd reviews, and all four deeper branches.

Work is one section in two tiers rather than a selected list plus a full index that repeated it. Every project appears exactly once. The `featured` ids lead, in the author's order, each given a full row — ★, large title, medium and year, summary. Everything else follows under `everything else` as one compact line each, alphabetically. There are no filters, no search and no sort control: the two tiers are the whole interface.

Because the page only renders once its JSON arrives, the browser cannot restore scroll on a back-navigation — it has nothing tall enough to scroll to yet. `js/landing.js` takes that over: it sets `history.scrollRestoration = "manual"`, records the offset and the number of expanded reviews to `sessionStorage` on `pagehide`, and reapplies both once the page exists. It restores only when the navigation type is `back_forward`, so a fresh visit still starts at the top.

Opening a project or review reveals its full record in a native dialog. Both dialogs are driven by one controller, so they behave identically: `←`/`→` and the arrow keys step to the neighbouring record, the bar shows the position in the sequence, and `esc` closes. The project sequence runs across both tiers in reading order, so stepping past the last featured record continues into `everything else`. Opening pushes a single history entry, so one Back leaves the record however far you stepped; closing returns focus and scroll to the row you were actually reading, not the one you opened from.

The Pages workflow rebuilds the blog and refreshes the Letterboxd feed on every deployment and every six hours. A checked-in cache keeps local development and deployments resilient when a source is briefly unavailable.

### Creative archive

- `css/creative-network.css`: shared styling for Living, River, and Doors
- `js/creative-network.js`: canonical-data resolution and route-specific interactions

### ononline

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

ononline supports its existing `#work/<id>` deep links.

## The blog

Posts are Markdown files in `content/posts/`. One file is one post, and the filename is the URL slug:
`content/posts/absurdism-and-life.md` becomes `satyam.lol/blog/absurdism-and-life/`.

```markdown
---
title: "Grimes: dream art pop"
date: 2026-08-30
summary: One sentence. Omit it and the opening lines are used.
tags: [music, essays]
cover: /images/blog/cover.png
coverAlt: Alternative text for the cover
legacyUrl: https://blog.satyam.lol/2022/04/…
draft: true
---

Body in Markdown.
```

Only `title` and `date` are required. `draft: true` keeps a post out of the build.

Leaving `summary` out doesn't leave a gap — the opening lines fill in for the index card, the RSS
description and the meta/OG description, same as most blogs. The one place that fallback is deliberately
suppressed is the post's own header, since an auto-excerpt there would just repeat the text sitting right
below it. Write a real one-sentence summary when a post deserves that header line; a quiet fallback everywhere
else is the point, not a bug.

### Writing a post

Open `/write/` — the editor. It previews with the same renderer the build script uses, so the preview is
the published page. Work autosaves to this browser's localStorage on every keystroke.

Publishing commits `content/posts/<slug>.md` straight to this repository through the GitHub contents API,
and the Pages workflow rebuilds and deploys. To enable it, open the **github** panel and paste a
[fine-grained personal access token](https://github.com/settings/personal-access-tokens) scoped to
**this repository only**, with **Contents: read and write** and nothing else.

The token is kept in localStorage on that device and is sent only to `api.github.com`. Anyone with access
to the browser profile can read it, so use **forget token** on a shared machine. `/write/` is `noindex`
and disallowed in `robots.txt`, but it is a public URL — it is the token, not the page, that is the secret.

Without a token the editor still works fully offline: **download .md** or **copy** the file and commit it
yourself. Editing posts in any text editor works just as well; the editor is a convenience, not the pipeline.

Shortcuts: `⌘S` save locally, `⌘↵` publish, `⌘B` / `⌘I` / `⌘K` bold, italic, link.

### Building

```sh
npm run build        # regenerate blog/, content/blog.json, sitemap.xml, docs/
npm run build:check  # fail if the committed output is stale
```

The build writes `blog/index.html`, one `blog/<slug>/index.html` per post, `blog/feed.xml`,
`content/blog.json` for the homepage and the editor, the blog block in `sitemap.xml`, and
`docs/blogspot-redirect.html`. Directories for deleted posts are pruned. CI rebuilds before deploying,
so the live site cannot serve stale HTML.

Rendering is shared code: `js/lib/markdown.js` and `js/lib/post.js` are imported by the build script,
the validator and the browser editor alike. Raw HTML in a post is escaped rather than passed through.

### Mirroring to Substack

satyam.lol stays the original. `/write/` has a **copy for substack** button: it renders the open post
with the same `js/lib/markdown.js` the site uses, adjusts it for someone else's editor, and puts it on
the clipboard as rich text. Open a new Substack post and paste — headings, bold, links, quotes, lists,
code blocks and images all land as themselves, because Substack's editor reads the `text/html` flavour
of a paste.

Three adjustments happen on the way out, all in `js/lib/substack.js`:

- relative targets become absolute, since `/images/blog/a.png` means nothing on Substack
- figures unwrap into an image followed by its caption in italics, which pastes more reliably
- the post ends with a line linking back to its canonical page on satyam.lol

The clipboard also carries a plain-text flavour, which is the markdown source with absolute targets, for
anywhere the rich paste does not land. Title and subtitle are separate fields in Substack, so they are
deliberately not part of the copy.

Nothing here talks to Substack. There is no API, no session cookie and no scheduled job — Substack
publishes no write API, and the endpoints its own editor uses are private and change without notice.
Pasting is the part that is allowed to be manual.

### Migrating from Blogspot

`scripts/import-blogger.mjs` converted the six Blogspot posts to Markdown, pulling the author's own
uploaded images into `images/blog/`. It never overwrites an existing file — once a post is in
`content/posts/`, that file is the source of truth.

Blogger cannot issue a 301 from this repository, so the build emits `docs/blogspot-redirect.html`:
paste it into the Blogspot theme's `<head>` (Blogger → Theme → Edit HTML) to canonical and redirect each
old post to its new home. That file is excluded from the deployed artifact.

## The studio

`/studio/` is a dashboard over everything on the site that is not prose. It exists because a
single project is spread across four files — its record in `content/home.json` or
`content/programming.json`, its place on the front door in `home.featured`, its colour pair and
slug in `content/creative.json`, its medium in `content.json` — and keeping those in step by hand
is the kind of work a tool should do.

It opens and reads without a token. To publish, add the same fine-grained GitHub token the writing
desk uses (**Contents: read and write**, scoped to this repository); one token serves both, and it
is sent to `api.github.com` and nowhere else.

**The works board** is the centre of it. Two bands, laid out the way the front door renders them:
the featured leads in your order, then everything else alphabetically. Drag a card to reorder,
drag it down to stop featuring it, or use the `↑ ↓ drop` buttons — which is also how it works on a
phone. Each card carries three marks: `★` featured, `◆` in the creative archive and tinted with
its own colours, `●` in the archive feed and so on ononline.

**The record sheet** opens from any card and holds the whole work: its fields, plus a residency row
naming the file behind each toggle. Moving a record between `content/home.json` and
`content/programming.json` is one button and translates the shape — `medium ↔ category`,
`summary ↔ short`, `body ↔ long`, named links ↔ a list of links — telling you what it will gain and
lose first. Renaming an `id` carries `featured` and the creative archive with it.

**Everything else** gets its own screen: the front door's identity, `now`, branches and feeds; the
creative archive as colour tiles; ononline's header and taxonomy, with a count of how many works
each medium still holds; the profile; and the reel.

**Preview** hands the pending changeset to the real site in `sessionStorage` and opens it, so the
front door or the reel can be seen with uncommitted edits before anything is published.

**Publish** is one screen and one commit. Every changed file is listed with a readable summary —
*reordered featured — p_openpiano, p_hear, …* rather than forty changed lines — with the raw diff
behind a toggle. It commits through the git data API, so a change touching four files is one
commit and one deploy rather than four of each. Before sending, it checks the rules in
`js/lib/schema.js` and warns if any file being written has moved in the repository since the studio
read it.

Point the branch at something other than `master` in the github panel to try a change without
touching the live site.

## The reel

`content/reel.json` holds every word the fifteen-second showreel says, the three font stacks and
the seven colours. `npm run build` writes `js/reel-config.js` from it, which is what the page
loads, ahead of `js/intro.js`.

`js/intro.js` keeps a copy of all of it as its own fallback and merges the config over the top, so
a config that is missing, slow or malformed costs nothing — the reel plays as written. Lists the
cut is timed against (the four xr headings, the four headline words, the three film cards) are held
to their length rather than allowed to desynchronise the edit; the tile wall and the sign-off links
can grow.

The choreography — fifteen seconds, eight holds, a 116 bpm grid — stays in `js/intro.js`. The
studio's reel screen edits the words and the type, and plays the result.

## Publishing a work

The studio does all of this from `/studio/`. By hand:

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
npm test
```

The validator checks the ononline manifest, compact homepage data, profile, registered feeds, taxonomy, unique ids, URLs, creative-archive references, the reel's copy and palette, blog frontmatter, and local assets. It also fails when `content/blog.json` or `js/reel-config.js` has drifted from its source. It has no package dependencies.

`npm test` runs `node --check` over every script under `js/` and `scripts/`, so a new module is covered the moment it exists.

## Running locally

The interfaces fetch JSON, the blog serves directory URLs, and the editor loads ES modules, so a static
server is required:

```sh
npm run serve
```

Then open `http://localhost:4173/`, `/blog/`, `/write/`, or `/studio/`. It resolves directory URLs to
`index.html` and falls back to `404.html`, the way Pages does.

## Checks

There is still no bundler. The Node scripts only generate and verify content:

```sh
npm test
```

That runs `scripts/check-syntax.mjs` over every script, the markdown, post-format, Substack and
studio test suites, `npm run build:check` for stale blog and reel output, and then
`scripts/validate-content.mjs`.
To refresh the Letterboxd feed by hand:

```sh
npm run sync
```

`npm run sync:rss` does the same without the ~40-request Letterboxd archive walk, which is what CI uses on a push. Pass `--strict` to fail instead of silently reusing the committed cache when a source is unreachable.

## Maintenance rule of thumb

- Identity, front-door language, featured order, branches, and homepage-only work: `content/home.json`
- ononline manifest and taxonomy: `content.json`
- Technical work: `content/programming.json`
- Films and art: `content/film-art.json`
- Creative-archive appearance and order: `content/creative.json`
- Experience, stack, and interests: `profile.json`
- Reel copy, type and palette: `content/reel.json` (then `npm run build`)
- Anything above, without opening a JSON file: `/studio/`
- Writing: `content/posts/*.md`, through `/write/` or any text editor
- Blog appearance: `css/blog.css`; blog page structure: `scripts/build-blog.mjs`
- Writing desk: `write/index.html`, `css/editor.css`, `js/editor.js`
- Studio: `studio/index.html`, `css/studio.css`, `js/studio/`
- GitHub publishing and the content schema, shared by both desks: `js/lib/github.js`, `js/lib/schema.js`
- Reel choreography: `js/intro.js`
- Markdown rendering and the post file format: `js/lib/markdown.js` and `js/lib/post.js`
- Front-door visuals or behavior: `css/landing.css` and `js/landing.js`
- Living, River, or Doors: `css/creative-network.css` and `js/creative-network.js`
- ononline: the existing files under `css/modules/` and `js/modules/`

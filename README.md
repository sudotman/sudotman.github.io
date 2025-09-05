## satyam.github.io — Developer Guide

This document explains how the site is put together, where to find things, and the safe knobs you can turn to customize behavior and visuals.

### Contents
- Overview and entry points
- Interactive dots grid (pixel diamonds)
- Heatmap (KVDB) and data flow
- Projects: data, rendering, and interactions
- Modals and lightbox
- Navigation constellation and tabs
- Mood/ASCII camera sampler
- Scroll‑wave dot motion
- Center card button (pixel PNG)
- Performance and responsiveness
- Tweakables (quick reference)

---

## Overview and entry points

- HTML: `index.html` is the one page.
- CSS: `css/style.css` contains site styles (and the pixel diamond drawing rules).
- JS: `js/main.js` is the single script driving all interactions.
- Data: `content.json` (projects) and `profile.json` (profile/skills/interests).

Load order is vanilla: the CSS is linked in the head, and `main.js` is loaded (with `defer`) after GSAP and its InertiaPlugin.

---

## Interactive dots grid (pixel diamonds)

Responsible code: `initGlowingInteractiveDotsGrid()` in `js/main.js`.

What it does:
1. Scans for containers with the attribute `data-dots-container-init`.
2. Builds a grid of `.dot` elements sized from the container font size and gap.
3. Creates a “hole” in the center to keep the card/UI readable.
4. Stores each dot’s center to support fast distance math.
5. Animates color based on pointer proximity and speed; click shockwaves add temporary inertia.

Key implementation details:
- Dots are actual DOM nodes with class `dot`. We do not show a circular background. Instead, shape is drawn via CSS pseudo elements so we can freely move/scale with transforms without “reverting to squares”.
- Shape: all dots are uniform diamonds via `shape-diamond` class. The visual is rendered with a pixel art 7×7 grid using `box-shadow` in CSS.
- To keep performance predictable, the grid stores a stride (`container._interactionStride`) and interaction loops only update every Nth dot for very dense grids.

Important variables (edit in `main.js` inside `initGlowingInteractiveDotsGrid`):
- `threshold`, `speedThreshold`, `shockRadius`, `shockPower`, `maxSpeed` — change the feel of proximity/impulse.
- `centerHole` — set to `false` to fill the hole.
- Grid density is capped by `maxDots` (desktop 900, low‑end ~450). The code increases the gap automatically if there would be too many elements.

Important CSS (edit in `css/style.css`):
- Pixel diamonds are defined under `.dots-container .dot.shape-diamond::before` (7×7 pixel map). Modify the `box-shadow` map if you want a different icon.
- `.dots-container .dot` sets `background: transparent; border-radius: 0` so a background square cannot “show through”. Color is driven by the element’s `color`.

Color path (very important): all interactions set `color` on `.dot`, not `background-color`. The pseudo element uses `currentColor`, so heatmap, hover, scroll wave, and mood sampler stay consistent.

---

## Heatmap (KVDB) and data flow

Responsible code: the section labeled “Visitor Heatmap” in `js/main.js`.

How it works:
1. Each dot has a deterministic key: `getDotKey(dot) => "row_col"`.
2. On first reveal (after a one‑time oracle overlay), `revealHeatmap(container)` shows a loading animation, applies local fallback blobs (so something appears immediately), then progressively syncs counts from KVDB.
3. Clicks increment local counts immediately (for snappy feedback), persist to `localStorage` and are batched to KVDB using a small write queue with backoff/retry.
4. Colors map from count via `colourFromCount(count)` (green → yellow → orange → red). This sets `.style.color` on the dot (not background).

Service config:
- Endpoint bucket id is defined at the top of the heatmap block: `KVDB_BUCKET` and `HEATMAP_ENDPOINT`.

Reliability/perf:
- Fetches are timed out with `AbortController` and retried; after multiple failures, the system marks KVDB “unavailable” and continues locally.
- Writes are batched and flushed on visibility change and unload.

Change color steps:
- Edit `colourFromCount()` in `js/main.js`.

---

## Projects: data, rendering, and interactions

Responsible code:
- Loader: `loadProjects()` in `js/main.js` pulls `content.json` and builds `.project-card` nodes into `.projects-grid` using a `DocumentFragment` to avoid layout thrash.
- Draggable cards: `initCardDragSystem()` adds mouse/touch drag with GSAP, keeping movement in `requestAnimationFrame`.
- Card actions: `stackProjectCards()`, `shuffleProjectCards()`, and filtering in `filterProjects()` use GSAP timelines.
- Project modal: `openProjectModal()` builds a rich modal with links and a gallery; `openImageLightbox()` provides full‑screen viewing with keyboard and thumbnails.

Where to change category accent colors: see `accentMap` in `loadProjects()`.

---

## Modals and lightbox

Files:
- Markup in `index.html` (`#tldr-modal`, `#project-modal`).
- Styling: “TLDR Modal Styles”, “Project Modal Styles” sections in `css/style.css`.
- Behavior: `openTldrModal()`, `closeTldrModal()`, `openProjectModal()`, `closeProjectModal()` in `js/main.js`.

Lightbox navigation uses `window.currentLightboxImages` and keyboard events. If you add a gallery to a project, just pass an array of image URLs in `content.json` under `gallery`.

---

## Navigation constellation and tabs

Files:
- Markup in `index.html` under `.constellation-nav` and the three tabs’ containers.
- JS: `initTabSwitching()` swaps `.tab-content` visibility and triggers animations (`animateExperienceCards`, `animateInterestCards`). It also calls `morphConstellation()` for the subtle line motion.

---

## Mood/ASCII camera sampler

Responsible code: `initColorSampler()` in `js/main.js`.

What it does:
- Adds a “mood” button. On click, requests the camera and continuously samples a video frame to compute an average color.
- When ASCII is toggled, grid spacing tightens, and the video frame is downscaled to the grid and converted to ASCII characters per dot.

How color applies: again, it updates `.dot.style.color` so it is compatible with heatmap and the pixel diamond shapes.

---

## Scroll‑wave dot motion

Responsible code: `initScrollBasedDotAnimation()`.

When projects content is revealed, scrolling the panel applies a subtle sine/cosine wave to the dots. The handler is `requestAnimationFrame`‑throttled and respects the stride and ASCII mode.

---

## Center card button (pixel PNG)

Markup: in `index.html` inside `.dots-wrap`.

Styles: see the “Central Card Icon Enhancements” section at the bottom of `css/style.css`.

- Container (sizing): `.osmo-icon__link` uses a responsive width clamp and `aspect-ratio: 2/3`.
- Image rendering: `.osmo-icon-svg` forces nearest‑neighbor scaling via multiple `image-rendering` declarations and adds a mild neon drop‑shadow.

Sizing variable to tweak:
- `width: clamp(110px, 12vw, 200px);` in `.osmo-icon__link` (min, preferred viewport % width, max). Increase/decrease these three numbers to change size globally.

---

## Performance and responsiveness

Highlights:
- GSAP lag smoothing enabled; pointer/scroll handlers are batched in `requestAnimationFrame`.
- Dragging, stacking, shuffling scale down easing/durations on low‑core or mobile devices (see `PERF.isLowEnd`).
- Grid density automatically throttles to keep DOM sizes in check.
- CSS uses `contain` and `will-change` on moving elements.

Running locally: open `index.html` in a modern browser; for file‑URL restrictions on fetch (projects/profile JSON), serve with any static server (e.g., `npx serve .`).

---

## Tweakables (quick reference)

Visual
- Dot shape map: `css/style.css` → `.dots-container .dot.shape-diamond::before` (edit pixel layout).
- Dot color steps: `js/main.js` → `colourFromCount()`.
- Dot proximity/shock feel: `threshold`, `speedThreshold`, `shockRadius`, `shockPower` in `initGlowingInteractiveDotsGrid()`.
- Card PNG size: `css/style.css` → `.osmo-icon__link { width: clamp(110px, 12vw, 200px); }`.
- Modal/lightbox glow and timings: matching sections in CSS and `open*` functions in JS.

Behavior
- Projects categories → accent colors: `accentMap` in `loadProjects()`.
- Max stored heatmap clicks: `MAX_STORED_CLICKS` in `js/main.js`.
- KVDB bucket id: `KVDB_BUCKET` in `js/main.js`.

Troubleshooting
- Dots look like circles/squares: ensure changes still set `.dot.style.color` and that `.dots-container .dot` background remains transparent.
- Heatmap not loading: check console for KVDB availability logs; the system will fall back to local-only if the service is down.
- Card image looks blurry: confirm the `.osmo-icon-svg` `image-rendering: pixelated` rule is not overridden and that the image isn’t constrained with HTML width/height attributes.



todo:

can we make it so that "dante's digital inferno everything is what it truly is" is actually clickable and once you click it, it turns the whole CRT blue/green color scheme into this pink-ish one. changes the text to "nothinge ever happens - we are so back" and changes the diamonds to hearts
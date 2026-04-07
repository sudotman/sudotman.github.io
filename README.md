# sudotman.github.io — Master README

Personal single-page portfolio / experiment site with a CRT-inspired UI, interactive pixel-diamond dot field, project cards, and camera-based mood/ASCII rendering.

## Project Structure

- `index.html` — main page markup.
- `css/style.css` — primary styling.
- `js/main.js` — all interaction logic (dots, heatmap, cards, modal, mood/ascii).
- `content.json` — project data.
- `profile.json` — profile data.

## Core Features

1. **Interactive Dot Grid**
   - Mouse hover proximity glow + inertial impulse.
   - Click shockwaves.
   - Center hole around the card.

2. **Heatmap Reveal**
   - Dot click persistence via local storage.
   - Progressive remote sync (KVDB when reachable).

3. **Mood + ASCII Camera Modes**
   - Mood mode samples camera color in real time.
   - ASCII mode maps camera frames onto the dot grid.

4. **Projects / Modal UX**
   - Dynamic cards loaded from JSON.
   - Filtering, shuffle/stack interactions, modal + gallery lightbox.

## Local Development

Use any static web server from repo root:

```bash
npx serve .
```

Then open the provided local URL in a modern browser.

## Notes

- For reliable `fetch` of JSON files, prefer serving over HTTP instead of opening via `file://`.
- GSAP + InertiaPlugin are expected from `/vendor/js` includes in `index.html`.

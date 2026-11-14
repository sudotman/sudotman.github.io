/*
 * The page's sound: a soft synth pad held under the front door, and notes for what the
 * visitor does on it.
 *
 * Nothing here is a recording, so nothing loops. The pad is oscillators playing one chord
 * for as long as the visitor stays in one part of the page; moving to another part glides
 * it to that part's chord. Scrolling picks out the chord's notes one at a time, upward on
 * the way down the page and downward on the way back, and touching a link or a button
 * strums three of them.
 *
 * The chords are the reel's (CH in scripts/soundtrack/audio.py): D minor 9 at the top,
 * through B flat, G minor, F and the suspended A, and D major 9 at the footer, which is
 * the lift the reel ends on. Reading to the bottom of the page resolves it.
 *
 * Things that happen on the page have sounds of their own, cut from the same chord so they
 * always sit in it: a record opening and closing, the language changing, a star, a mark, a
 * note slid under the door. Each is told to this script by an event; nothing calls it.
 *
 * While it plays there are two things to see, both dithered as an old one-bit screen would
 * draw them. The stripe thickens and thins with the sound, as it does in the reel, and where
 * the window has a margin beside the text its edge frays into it in yellow. And a landscape
 * stands along the foot of the window, three ranges deep, which makes the journey the
 * reel's credits name as the page is scrolled: Himalayan peaks under snow at the top, in the
 * page's ink; green hills through the middle; and at the end the sea off Mumbai, blue. At
 * the end the sun comes up out of the water
 * under the footer's links as the chord turns major; left there, it climbs and throws its
 * rays. After dark, or in the dark theme, every word left at the door is a star over it,
 * and a note left there crosses as a paper boat. Touching anything sends a ripple out from
 * where it was touched: along the land to either side, and up and down the stripe.
 *
 * It never starts unasked. [sound] at the top right, and `sound` in the
 * footer's line turn it on and off, and the audio context is opened inside that click, the only
 * place a browser allows it. It is not remembered between visits, for the same reason.
 * The reel has a soundtrack of its own, so playing the reel turns this off.
 */
(() => {
  "use strict";

  const root = document.documentElement;

  // Bass note first, then the voicing, as MIDI notes.
  const CHORDS = {
    dm9: [38, 50, 53, 57, 60, 64],
    bbmaj9: [34, 46, 50, 53, 57, 60],
    gm9: [31, 43, 46, 50, 53, 57],
    fmaj9: [29, 41, 45, 48, 52, 55],
    a7sus4: [33, 45, 50, 52, 55, 59],
    dmaj9: [38, 50, 54, 57, 61, 64]
  };

  // Which chord a part of the page holds, by the data-mark-scope js/landing.js gives it.
  // A part this does not name (your copy, the door) holds ELSEWHERE.
  const WHERE = {
    intro: "dm9",
    now: "dm9",
    work: "bbmaj9",
    writing: "gm9",
    "film-writing": "fmaj9",
    more: "a7sus4",
    footer: "dmaj9"
  };
  const ELSEWHERE = "a7sus4";

  const LEVEL = 0.6;          // the whole thing, under the page rather than over it
  const GLIDE = 1.1;          // seconds, roughly, for one chord to give way to the next
  const STEP = 150;           // pixels of scrolling per note
  const OPEN = 900;           // the pad's low-pass, in Hz
  const NEXT_ROOM = 300;      // and while a record is open

  const frequency = (midi) => 440 * 2 ** ((midi - 69) / 12);

  let main = null;
  let sound = null;           // everything that exists only while it plays
  const toggles = [];

  function reverbFor(ctx) {
    const seconds = 3.2;
    const impulse = ctx.createBuffer(2, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = impulse.getChannelData(channel);
      for (let i = 0; i < data.length; i++) {
        const t = i / ctx.sampleRate;
        data[i] = (Math.random() * 2 - 1) * Math.exp(-t * 2.4);
      }
    }
    const convolver = ctx.createConvolver();
    convolver.buffer = impulse;
    return convolver;
  }

  // One chord of the pad: a sine under it, and two saws a few cents apart on each note,
  // which is what makes it move without anything moving it.
  function hold(name) {
    const { ctx, pad } = sound;
    const at = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0, at);
    out.gain.setTargetAtTime(1, at, GLIDE);
    out.connect(pad);
    const oscillators = [];
    const voice = (type, midi, cents, level) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = type;
      oscillator.frequency.value = frequency(midi);
      oscillator.detune.value = cents;
      gain.gain.value = level;
      oscillator.connect(gain);
      gain.connect(out);
      oscillator.start(at);
      oscillators.push(oscillator);
    };
    const [bass, ...notes] = CHORDS[name];
    // Small speakers cannot play the bass note itself, so the octave above carries it.
    voice("sine", bass, 0, 0.11);
    voice("triangle", bass + 12, 0, 0.09);
    notes.forEach((note, index) => {
      voice("sawtooth", note, 6 + index, 0.045);
      voice("sawtooth", note, -6 - index, 0.045);
    });
    return { name, out, oscillators };
  }

  function letGo(held) {
    const { ctx } = sound;
    const at = ctx.currentTime;
    held.out.gain.cancelScheduledValues(at);
    held.out.gain.setTargetAtTime(0, at, GLIDE * 0.8);
    held.oscillators.forEach((oscillator) => oscillator.stop(at + GLIDE * 6));
    held.oscillators.at(-1).onended = () => held.out.disconnect();
  }

  function moveTo(name) {
    if (!sound || sound.held?.name === name) return;
    if (sound.held) letGo(sound.held);
    sound.held = hold(name);
    // The notes scrolling and touching play: the voicing an octave up, then its lower half again above that.
    const notes = CHORDS[name].slice(1);
    sound.scale = [...notes.map((note) => note + 12), ...notes.slice(0, 3).map((note) => note + 24)];
    sound.at = Math.min(sound.at, sound.scale.length - 1);
  }

  function pluck(midi, level, when = 0, pan = 0) {
    const { ctx, dry, wet } = sound;
    const at = ctx.currentTime + when;
    const body = ctx.createOscillator();
    const shine = ctx.createOscillator();
    const shineLevel = ctx.createGain();
    const envelope = ctx.createGain();
    const tone = ctx.createBiquadFilter();
    const place = ctx.createStereoPanner();
    body.type = "triangle";
    body.frequency.value = frequency(midi);
    shine.type = "sine";
    shine.frequency.value = frequency(midi) * 2;
    shineLevel.gain.value = 0.25;
    tone.type = "lowpass";
    tone.frequency.value = 2600;
    place.pan.value = pan;
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.exponentialRampToValueAtTime(level, at + 0.006);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + 1.7);
    body.connect(envelope);
    shine.connect(shineLevel);
    shineLevel.connect(envelope);
    envelope.connect(tone);
    tone.connect(place);
    place.connect(dry);
    place.connect(wet);
    body.start(at);
    shine.start(at);
    body.stop(at + 1.8);
    shine.stop(at + 1.8);
    body.onended = () => place.disconnect();
  }

  // Air rather than a note: filtered noise sliding from one pitch to another.
  function swish(from, to, seconds, level, when = 0) {
    const { ctx, dry, wet } = sound;
    const at = ctx.currentTime + when;
    if (!sound.noise) {
      sound.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = sound.noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    const source = ctx.createBufferSource();
    const band = ctx.createBiquadFilter();
    const envelope = ctx.createGain();
    source.buffer = sound.noise;
    band.type = "bandpass";
    band.Q.value = 1.4;
    band.frequency.setValueAtTime(from, at);
    band.frequency.exponentialRampToValueAtTime(to, at + seconds);
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.exponentialRampToValueAtTime(level, at + seconds * 0.25);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
    source.connect(band);
    band.connect(envelope);
    envelope.connect(dry);
    envelope.connect(wet);
    source.start(at, Math.random() * 0.4, seconds + 0.05);
    source.onended = () => envelope.disconnect();
  }

  // What the page's own events sound like. `n` is a note of the chord being held, counted
  // up from its lowest, so every one of these is in key wherever on the page it happens.
  const n = (index) => sound.scale[Math.min(index, sound.scale.length - 1)];
  const CUES = {
    // A record opening lifts; closing sets it back down, lower than it started.
    open() {
      swish(400, 1600, 0.3, 0.03);
      pluck(n(1), 0.12, 0, -0.2);
      pluck(n(3), 0.12, 0.07, 0.2);
    },
    close() {
      swish(1800, 260, 0.5, 0.045);
      pluck(n(5), 0.12, 0, 0.25);
      pluck(n(2), 0.12, 0.09, -0.1);
      pluck(n(0) - 12, 0.17, 0.2, 0);
    },
    // Four quick notes up the chord, starting higher for each language along.
    language({ index = 0 }) {
      for (let i = 0; i < 4; i++) pluck(n(index + i), 0.11, i * 0.055, i * 0.25 - 0.4);
    },
    star() {
      pluck(n(2), 0.13, 0, -0.2);
      pluck(n(5), 0.13, 0.08, 0.2);
    },
    unstar() {
      pluck(n(5), 0.1, 0, 0.2);
      pluck(n(2), 0.1, 0.08, -0.2);
    },
    mark() {
      swish(2400, 3400, 0.16, 0.03);
      pluck(n(6), 0.08, 0.03, 0.1);
    },
    lift() {
      pluck(n(1), 0.08, 0, -0.1);
    },
    // Paper going under a door, then two notes for it having arrived.
    note() {
      swish(500, 2600, 0.38, 0.07);
      pluck(n(0), 0.16, 0.16, -0.15);
      pluck(n(4), 0.14, 0.27, 0.15);
    },
    word() {
      pluck(n(6), 0.15, 0, 0);
      pluck(n(7), 0.09, 0.09, 0.3);
    },
    sweep() {
      swish(3200, 180, 0.65, 0.08);
    },
    // The end of the page: the chord has just turned major, and this climbs it slowly.
    sun() {
      [1, 3, 5, 7].forEach((index, order) => pluck(n(index), 0.11, 0.25 + order * 0.22, order * 0.3 - 0.45));
    },
    // Its rays coming out: air opening upward, and the top of the chord, scattered.
    rays() {
      swish(1800, 6400, 0.9, 0.022);
      [5, 7, 6, 7].forEach((index, order) => pluck(n(index) + (order > 1 ? 12 : 0), 0.06, order * 0.1, order % 2 ? 0.5 : -0.5));
    }
  };

  function cue(name, detail = {}) {
    if (!sound || !CUES[name]) return;
    CUES[name](detail);
  }

  // The part of the page under the middle of the window.
  function partNow() {
    // The footer is short and never reaches the middle, so the end of the page is its.
    if (window.scrollY + window.innerHeight >= root.scrollHeight - 8) return WHERE.footer;
    const middle = window.innerHeight / 2;
    for (const part of main.querySelectorAll(":scope > [data-mark-scope], :scope > section")) {
      const box = part.getBoundingClientRect();
      if (box.top <= middle && box.bottom >= middle) return WHERE[part.dataset.markScope] || ELSEWHERE;
    }
    return null;   // between two parts: stay on the chord it is on
  }

  let lastY = 0;
  let travelled = 0;
  let lastNote = 0;

  function onScroll() {
    if (!sound) return;
    const y = window.scrollY;
    const delta = y - lastY;
    lastY = y;
    const part = partNow();
    if (part) moveTo(part);

    travelled += Math.abs(delta);
    if (travelled < STEP) return;
    travelled = 0;
    const now = performance.now();
    if (now - lastNote < 80) return;   // a flick of the wheel is a run of notes, not a smear
    lastNote = now;
    // Down the page climbs the chord, back up descends it, turning round at either end.
    const next = sound.at + (delta >= 0 ? 1 : -1);
    sound.at = next < 0 ? 1 : next >= sound.scale.length ? sound.scale.length - 2 : next;
    pluck(sound.scale[sound.at], 0.1, 0, Math.random() * 1.2 - 0.6);
  }

  // Controls that announce what they did get that sound instead of a strum.
  const SPOKEN_FOR = "[data-language-next], [data-star], [data-lift], .project-link, .review-link, [data-dialog-close], [data-dialog-prev], [data-dialog-next], [data-door-form] button, [data-door-sweep], [data-ambient-toggle]";

  function onTouch(event) {
    if (!sound || !event.target.closest?.("a, button, input, summary")) return;
    ripple(event.clientX, event.clientY);
    if (event.target.closest(SPOKEN_FOR)) return;
    const start = Math.floor(Math.random() * 3);
    [0, 2, 4].forEach((offset, index) => {
      pluck(sound.scale[(start + offset) % sound.scale.length], 0.16, index * 0.06, index * 0.4 - 0.4);
    });
  }

  function muffle(on) {
    if (!sound) return;
    sound.pad.frequency.setTargetAtTime(on ? NEXT_ROOM : OPEN, sound.ctx.currentTime, 0.25);
  }

  function label() {
    const on = !!sound;
    for (const toggle of toggles) {
      const word = on ? "quiet" : "sound";
      toggle.textContent = toggle.dataset.ambientToggle === "nav" ? `[${word}]` : word;
      toggle.title = on ? "turn the sound off" : "a soft synth under the page. it follows where you are and what you touch.";
      toggle.setAttribute("aria-pressed", String(on));
    }
  }

  /* ---------------------------------------------------------------------- */
  /* What it looks like: the stripe frays, and hills stand along the foot    */
  /* ---------------------------------------------------------------------- */

  // An 8 x 8 ordered-dither matrix, built the usual way from the 2 x 2 one. A flat tone
  // through it comes out as an even weave, which is the whole look.
  const BAYER = (() => {
    let matrix = [[0]];
    for (let size = 1; size < 8; size *= 2) {
      const next = [];
      for (let y = 0; y < size * 2; y++) {
        next.push([]);
        for (let x = 0; x < size * 2; x++) {
          next[y].push(4 * matrix[y % size][x % size] + [[0, 2], [3, 1]][Math.floor(y / size)][Math.floor(x / size)]);
        }
      }
      matrix = next;
    }
    return matrix.flat();
  })();

  const CELL = 2;             // screen pixels per dot
  const REACH = 120;          // the furthest the stripe frays, in screen pixels
  const CLEAR = 14;           // and how far short of the text it always stops
  // The hills, far to near. Each is a tone of its own, lighter the further away, and thins
  // out below its crest, which is what reads as mist lying between one range and the next.
  const RIDGES = [
    { rise: 0.94, grain: 1, drift: 3, tone: 0.09, seed: 1.3 },
    { rise: 0.62, grain: 1.6, drift: 6, tone: 0.17, seed: 4.1 },
    { rise: 0.34, grain: 2.4, drift: 11, tone: 0.28, seed: 7.7 }
  ];
  // At the very end of the page a small sun comes up between the far hills and the near
  // ones, under the footer's links, and the near hills dip to let it.
  // Left there a moment longer it climbs clear of them, and then throws rays.
  const SUN = { radius: 17, glow: 2.3, clear: 7, climb: 2.9, rays: 12, reach: 4.4 };
  const SKY = 150;            // screen pixels of empty canvas above the hills, for the sun to climb into
  // A note left at the door crosses as a paper boat. Its shape, and how long the crossing takes.
  const BOAT = {
    crossing: 16,
    shape: [
      "......#......",
      ".....###.....",
      "....#####....",
      "...#######...",
      "#############",
      ".###########.",
      "..#########.."
    ]
  };
  let boats = [];
  // How many words have been left at the door, as js/door.js last said. Each is a star.
  let wordsLeft = 0;
  // A fixed, scattered number between 0 and 1 for the nth thing, so a star keeps its place.
  const scatter = (n, salt) => {
    const x = Math.sin(n * 127.1 + salt * 311.7) * 43758.5453;
    return x - Math.floor(x);
  };
  // After dark by the visitor's own clock, or whenever the page is.
  const isNight = () => {
    const hour = new Date().getHours();
    return root.dataset.theme === "dark" || hour >= 19 || hour < 6;
  };
  // A touch sends a ripple out from where it landed: along the hills to either side, and
  // up and down the stripe. These are the ones still travelling.
  const RIPPLE = { life: 2.2, speed: 560, width: 70 };
  let ripples = [];
  let haze = null;

  function ripple(x, y, strength = 1) {
    if (!sound) return;
    ripples.push({ x, y, strength, born: performance.now() / 1000 });
    if (ripples.length > 8) ripples.shift();
  }

  // How much the ripples lift a point `at` along their line of travel, given where each
  // started on that line. Two crests leave every touch, one each way, fading as they go.
  function lifted(at, origin, now) {
    let lift = 0;
    for (const one of ripples) {
      const age = now - one.born;
      const gone = age * RIPPLE.speed;
      const fade = one.strength * Math.exp(-age * 1.7);
      const a = (at - one[origin] - gone) / RIPPLE.width;
      const b = (at - one[origin] + gone) / RIPPLE.width;
      lift += fade * (Math.exp(-a * a) + Math.exp(-b * b));
    }
    return lift;
  }

  function startHaze() {
    const stripe = document.querySelector(".stripe-reel");
    const make = (className, first) => {
      const canvas = document.createElement("canvas");
      canvas.className = className;
      canvas.setAttribute("aria-hidden", "true");
      if (first) document.body.prepend(canvas);
      else document.body.append(canvas);
      return { canvas, context: canvas.getContext("2d"), image: null };
    };
    const fray = make("ambient-fray", false);
    const hills = make("ambient-hills", true);
    const still = matchMedia("(prefers-reduced-motion: reduce)");
    const wave = new Uint8Array(256);
    let crests = null;
    let level = 0;
    let risen = 0;            // 0 below the hills, 1 standing on them
    let high = 0;             // then 0 to 1 as it climbs above them
    let rays = 0;             // then 0 to 1 as its rays come out
    let dwell = 0;            // seconds it has stood on the hills
    let wasAtEnd = false;
    let journey = 0;          // 0 at the top of the page, 1 at the end of it

    const size = () => {
      // The fray lives in the empty margin between the text and the stripe and nowhere
      // else. Where the window is too narrow to have one, only the stripe moves.
      const box = fray.canvas.getBoundingClientRect();
      const room = Math.min(REACH, box.right - main.getBoundingClientRect().right - CLEAR);
      fray.image = null;
      fray.canvas.hidden = room < 16;
      if (!fray.canvas.hidden) {
        fray.canvas.style.width = `${room}px`;
        fray.canvas.width = Math.ceil(room / CELL);
        fray.canvas.height = Math.ceil(window.innerHeight / CELL);
        fray.image = fray.context.createImageData(fray.canvas.width, fray.canvas.height);
      }

      const foot = hills.canvas.getBoundingClientRect();
      hills.canvas.width = Math.max(1, Math.ceil(foot.width / CELL));
      hills.canvas.height = Math.max(1, Math.ceil(foot.height / CELL));
      hills.image = hills.context.createImageData(hills.canvas.width, hills.canvas.height);
      crests = RIDGES.map(() => new Float32Array(hills.canvas.width));
    };

    const colour = (context, value, fallback) => {
      context.fillStyle = fallback;
      context.fillStyle = value;
      return [1, 3, 5].map((at) => parseInt(context.fillStyle.slice(at, at + 2), 16) || 0);
    };

    function drawFray(t, now, [r, g, b]) {
      const { context, image } = fray;
      if (!image) return;
      const { width, height, data } = image;
      const swell = 0.55 + level * 0.9;
      for (let y = 0; y < height; y++) {
        // How far the fray reaches at this height: three slow waves climbing the stripe,
        // and whatever ripples are passing.
        const reach = width * (swell * Math.max(0, 0.42
          + 0.3 * Math.sin(y * 0.021 + t * 0.5)
          + 0.2 * Math.sin(y * 0.047 - t * 0.33 + 2)
          + 0.12 * Math.sin(y * 0.11 + t * 0.9 + 4))
          + 0.85 * lifted(y * CELL, "y", now));
        for (let x = 0; x < width; x++) {
          const away = width - 1 - x;   // the stripe is at the canvas's right edge
          const tone = away < reach ? 0.85 * (1 - away / reach) ** 1.5 : 0;
          const at = (y * width + x) * 4;
          data[at] = r;
          data[at + 1] = g;
          data[at + 2] = b;
          data[at + 3] = tone * 64 > BAYER[(y & 7) * 8 + (x & 7)] + 0.5 ? 255 : 0;
        }
      }
      context.putImageData(image, 0, 0);
    }

    // How high a range stands at a point along it, for each of the three countries the
    // page passes through. `p` is distance along the range; all three come out around 0..1.
    const LAND = [
      // The Himalayas: nothing but peaks, a big one, smaller ones on its shoulders.
      (p, seed) => 0.26
        + 0.4 * (1 - Math.abs(Math.sin(p * 3.1 + seed)))
        + 0.22 * (1 - Math.abs(Math.sin(p * 7.3 + seed * 2)))
        + 0.12 * (1 - Math.abs(Math.sin(p * 13.7 + seed * 3))),
      // The hills between: a long roll, a shorter one, and a run of small peaks.
      (p, seed) => 0.46
        + 0.26 * Math.sin(p * 2.1 + seed)
        + 0.15 * Math.sin(p * 5.3 + seed * 2)
        + 0.13 * (1 - Math.abs(Math.sin(p * 9.1 + seed * 3))),
      // The sea off Mumbai: nearly level, and never still.
      (p, seed, t, index) => 0.36
        + 0.05 * Math.sin(p * 15 + seed + t * (0.9 + index * 0.5))
        + 0.028 * Math.sin(p * 34 - t * (1.6 + index * 0.4) + seed * 2)
    ];

    function drawHills(t, now, yellow) {
      const { context, image, canvas } = hills;
      // The page's ink, whichever theme that is today.
      const [r, g, b] = (getComputedStyle(document.body).color.match(/\d+/g) || [0, 0, 0]).map(Number);
      const { width, height, data } = image;
      const swell = 0.88 + level * 0.3;
      // The hills keep to the foot of the canvas; above them is sky.
      const sky = Math.min(height - 1, Math.round(SKY / CELL));
      const band = height - sky;
      // Each country has its colour, all three from the page's own palette: rock in its
      // ink, hills in its green, water in the blue of its links.
      const ink = [r, g, b];
      const styles = getComputedStyle(root);
      const green = colour(context, styles.getPropertyValue("--green").trim(), "#00d16f");
      const blue = colour(context, styles.getPropertyValue("--link").trim(), "#0000e7");

      // Where the sun comes up: under the middle of the footer's links.
      const box = canvas.getBoundingClientRect();
      const links = main.querySelector("footer > p:last-child");
      let line = null;
      if (links) {
        const run = document.createRange();
        run.selectNodeContents(links);
        line = run.getBoundingClientRect();
      }
      const sunX = line ? (line.left + line.width / 2 - box.left) / CELL : width * 0.3;
      const sunR = SUN.radius / CELL;

      // Where on the journey the page is: the first half of the scroll takes the peaks
      // down into hills, the second lays the hills out into sea.
      const leg = Math.min(1, journey * 2);
      const last = Math.max(0, journey * 2 - 1);
      const toHills = leg * leg * (3 - 2 * leg);
      const toSea = last * last * (3 - 2 * last);

      // Where each range's crest stands in every column, sliding sideways, the near range
      // fastest. A ripple lifts the near range most, as a wave lifts whatever floats nearest.
      RIDGES.forEach((ridge, index) => {
        const crest = crests[index];
        const give = 0.13 * (index + 1);
        // Peaks stand taller than hills, and the far water sits lower than the far hills.
        const rise = ridge.rise * (1.16 - 0.16 * toHills);
        for (let x = 0; x < width; x++) {
          const along = x * CELL + t * ridge.drift;
          const p = (along / 1000) * ridge.grain;
          const inland = LAND[0](p, ridge.seed) * (1 - toHills) + LAND[1](p, ridge.seed) * toHills;
          const shape = inland * (1 - toSea) + LAND[2](p, ridge.seed, t, index) * toSea;
          crest[x] = sky + band * (1 - rise * shape * swell - give * lifted(x * CELL, "x", now));
        }
      });
      // Above this line a range is under snow. It is low on the peaks and climbs out of
      // reach as they become hills.
      const snowline = RIDGES.map((ridge) => sky + band * (1 - ridge.rise * (0.64 + 0.6 * toHills)));

      // The sun. It comes up over the highest hill under the middle of the footer's links,
      // never closer to them than SUN.clear. It is in front of the far range and behind
      // the others, which sink around it wherever they would hide it.
      let sun = null;
      if (risen > 0.004) {
        if (line) {
          const radius = sunR * (1 + level * 0.08);
          const x = sunX;
          const column = Math.max(0, Math.min(width - 1, Math.round(x)));
          const ceiling = (line.bottom + SUN.clear - box.top) / CELL + radius;   // as near the links as it may come
          const up = Math.min(height - radius * 0.4, Math.max(ceiling, Math.min(crests[0][column], crests[1][column]) - radius * 0.45));
          const eased = 1 - (1 - risen) ** 3;
          const climbed = high * high * (3 - 2 * high);
          const y = height + radius * 1.6 + (up - height - radius * 1.6) * eased - Math.max(0, Math.min(radius * SUN.climb, up - ceiling)) * climbed;
          // Its rays stop short of the links too, and lengthen as they come out.
          const from = radius * 1.5;
          const most = Math.min(radius * SUN.reach, y - (line.bottom + 3 - box.top) / CELL);
          sun = { x, y, radius, from, to: from + Math.max(0, most - from) * (1 - (1 - rays) ** 2), most };
          for (let index = 1; index < RIDGES.length; index++) {
            const sill = up + radius * (0.3 + 0.55 * (index - 1));
            const crest = crests[index];
            for (let at = Math.max(0, Math.floor(x - radius * 7)); at < Math.min(width, x + radius * 7); at++) {
              const near = Math.exp(-(((at - x) / (radius * 2.6)) ** 2)) * eased;
              if (crest[at] < sill) crest[at] += (sill - crest[at]) * near;
            }
          }
        }
      }

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const weave = BAYER[(y & 7) * 8 + (x & 7)] + 0.5;
          // The same weave, shifted, for choosing a colour, so colour and tone do not line up.
          const shade = BAYER[((y + 3) & 7) * 8 + ((x + 5) & 7)] + 0.5;
          const at = (y * width + x) * 4;
          // The nearest range that reaches this high is the one seen; the sun is between
          // the far one and the rest.
          let tone = 0;
          let lit = false;
          let paint = ink;
          for (let index = RIDGES.length - 1; index >= 0; index--) {
            if (index === 0 && sun) {
              const far = Math.hypot(x - sun.x, y - sun.y);
              const away = far / sun.radius;
              let glow = away < 1 ? 0.94 : away < SUN.glow ? 0.3 * (1 - (away - 1) / (SUN.glow - 1)) ** 2 : 0;
              // The rays: spokes turning slowly, with brightness running outward along them.
              if (far > sun.from && far < sun.to) {
                const spoke = Math.cos(Math.atan2(y - sun.y, x - sun.x) * SUN.rays + t * 0.3);
                if (spoke > 0.45) {
                  const run = 0.5 + 0.5 * Math.sin(far * 0.6 - t * 5);
                  glow = Math.max(glow, 0.85 * ((spoke - 0.45) / 0.55) * (0.35 + 0.65 * run) * (1 - (far - sun.from) / (sun.most - sun.from)) ** 0.6);
                }
              }
              if (glow * 64 > weave) {
                lit = true;
                break;
              }
            }
            const top = crests[index][x];
            if (y < top) continue;
            tone = RIDGES[index].tone * (1 - 0.6 * ((y - top) / Math.max(1, height - top)));
            // Its colour is woven the way its tone is: part-way between two countries, some
            // dots are one's and some the other's.
            paint = toHills * 64 > shade ? green : ink;
            if (toSea * 64 > shade) paint = blue;
            if (index < 2 && top < snowline[index]) {
              // Snow: the crest drawn as a line, and under it nothing, down to a ragged edge.
              const edge = 1 + Math.abs(top - crests[index][Math.min(width - 1, x + 1)]);
              if (y - top < edge) {
                tone = 1;
                paint = ink;
              } else if (y - top < (snowline[index] - top) * 0.7 + Math.sin(x * 0.8 + index * 2) * 1.3) {
                tone = 0;
              }
            }
            // On water the sun lays a broken path of light towards the shore.
            if (sun && index > 0 && toSea > 0.3 && y > sun.y) {
              const spread = sun.radius * (0.55 + 0.012 * (y - sun.y)) * (1 + 0.35 * Math.sin(y * 1.9 + t * 3.1));
              const glint = 0.5 * toSea * risen * (1 - Math.abs(x - sun.x) / spread) * (0.55 + 0.45 * Math.sin(y * 2.7 - t * 4.3 + x * 0.4));
              if (Math.abs(x - sun.x) < spread && glint * 64 > weave) lit = true;
            }
            break;
          }
          const shown = lit ? yellow : paint;
          data[at] = shown[0];
          data[at + 1] = shown[1];
          data[at + 2] = shown[2];
          // The land is half there, a drawn line or the sun all there.
          data[at + 3] = lit || tone >= 1 ? 255 : tone * 64 > weave ? 140 : 0;
        }
      }

      // Anything drawn over the land goes into whatever the land left empty.
      const dot = (x, y, colour) => {
        if (x < 0 || y < 0 || x >= width || y >= height) return;
        const at = (y * width + x) * 4;
        if (data[at + 3]) return;
        data[at] = colour[0];
        data[at + 1] = colour[1];
        data[at + 2] = colour[2];
        data[at + 3] = 255;
      };

      // The stars: one for every word left at the door, each always in its own place, out
      // after dark or in the dark theme, and gone as the sun gets up. They twinkle by
      // going out for a moment, one at a time.
      const dark = (isNight() ? 1 : 0) * (1 - high);
      if (dark > 0 && wordsLeft > 0) {
        const count = Math.min(wordsLeft, 500);
        for (let index = 0; index < count; index++) {
          if (scatter(index, 3) > dark) continue;
          if (Math.sin(t * (0.4 + scatter(index, 4) * 1.3) + scatter(index, 5) * 40) > 0.93) continue;
          const x = Math.floor(scatter(index, 1) * width);
          const y = 1 + Math.floor(scatter(index, 2) ** 1.4 * (sky + band * 0.35));
          dot(x, y, ink);
          // The newest few are a little bigger, so a word just left can be found.
          if (index >= wordsLeft - 3 || index % 9 === 0) {
            dot(x - 1, y, ink);
            dot(x + 1, y, ink);
            dot(x, y - 1, ink);
            dot(x, y + 1, ink);
          }
        }
      }

      // A note that was just left sails across as a paper boat, riding the middle range
      // and passing behind the near one.
      boats = boats.filter((boat) => now - boat.launched < BOAT.crossing);
      for (const boat of boats) {
        const along = (now - boat.launched) / BOAT.crossing;
        const left = Math.round(-BOAT.shape[0].length + along * (width + BOAT.shape[0].length * 2));
        const keel = Math.max(0, Math.min(width - 1, left + Math.floor(BOAT.shape[0].length / 2)));
        const top = Math.round(crests[1][keel] - BOAT.shape.length + 2 + Math.sin(now * 2.3 + boat.launched) * 1.2);
        BOAT.shape.forEach((row, dy) => {
          for (let dx = 0; dx < row.length; dx++) {
            const x = left + dx;
            const y = top + dy;
            if (row[dx] !== "#" || x < 0 || x >= width || y < 0 || y >= height || y >= crests[2][x]) continue;
            const at = (y * width + x) * 4;
            data[at] = r;
            data[at + 1] = g;
            data[at + 2] = b;
            data[at + 3] = 255;
          }
        });
      }

      context.putImageData(image, 0, 0);
    }

    function draw() {
      if (!sound || document.hidden) return;
      const now = performance.now() / 1000;
      ripples = ripples.filter((one) => now - one.born < RIPPLE.life);
      sound.meter.getByteTimeDomainData(wave);
      let energy = 0;
      for (let i = 0; i < wave.length; i++) energy += ((wave[i] - 128) / 128) ** 2;
      level += (Math.min(1, Math.sqrt(energy / wave.length) * 5) - level) * 0.18;

      // The stripe itself thickens with the sound, and jumps when something is touched.
      const jump = ripples.reduce((most, one) => Math.max(most, one.strength * Math.exp(-(now - one.born) * 5)), 0);
      stripe?.style.setProperty("--ambient-level", (still.matches ? 0 : level * 0.9 + jump * 1.4).toFixed(3));

      // The landscape follows the scroll, a little behind it, so it is seen to change.
      const far = Math.max(1, root.scrollHeight - window.innerHeight);
      const here = Math.max(0, Math.min(1, window.scrollY / far));
      journey = still.matches ? here : journey + (here - journey) * 0.12;

      // Reaching the end of the page brings the sun up, and leaving it lets it set.
      const atEnd = window.scrollY + window.innerHeight >= root.scrollHeight - 8;
      if (atEnd && !wasAtEnd) cue("sun");
      wasAtEnd = atEnd;
      if (still.matches) {
        risen = high = rays = Number(atEnd);
      } else if (atEnd) {
        // Up onto the hills, a pause, on into the sky, and then the rays.
        risen = Math.min(1, risen + 0.022);
        if (risen >= 1) dwell += 0.04;
        if (dwell > 1.2) high = Math.min(1, high + 0.011);
        if (high >= 1) {
          if (!rays) cue("rays");
          rays = Math.min(1, rays + 0.018);
        }
      } else {
        // And back the way it came, rays first.
        dwell = 0;
        if (rays > 0) rays = Math.max(0, rays - 0.09);
        else if (high > 0) high = Math.max(0, high - 0.05);
        else risen = Math.max(0, risen - 0.05);
      }

      // The stripe's own yellow, whichever theme that is today.
      const yellow = colour(hills.context, getComputedStyle(root).getPropertyValue("--yellow").trim(), "#ffef00");
      const t = still.matches ? 0 : now;
      drawFray(t, now, yellow);
      drawHills(t, now, yellow);
    }

    size();
    draw();
    addEventListener("resize", size);
    const timer = setInterval(draw, 40);
    haze = () => {
      clearInterval(timer);
      removeEventListener("resize", size);
      stripe?.style.removeProperty("--ambient-level");
      fray.canvas.remove();
      hills.canvas.remove();
      ripples = [];
      haze = null;
    };
  }

  function stop() {
    const ending = sound;
    haze?.();
    sound = null;
    delete root.dataset.ambient;
    label();
    if (!ending) return;
    const { ctx, master } = ending;
    try {
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
    } catch {
      /* the context has already gone */
    }
    setTimeout(() => ctx.close().catch(() => {}), 900);
  }

  function start() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (sound || !AudioContextClass || root.classList.contains("intro")) return;
    let ctx = null;
    try {
      ctx = new AudioContextClass({ latencyHint: "interactive" });
      ctx.resume().catch(() => {});
    } catch {
      return;
    }

    const master = ctx.createGain();
    const limiter = ctx.createDynamicsCompressor();
    const pad = ctx.createBiquadFilter();
    const padSend = ctx.createGain();
    const dry = ctx.createGain();
    const wet = ctx.createGain();
    const reverb = reverbFor(ctx);
    const drift = ctx.createOscillator();
    const driftDepth = ctx.createGain();

    master.gain.setValueAtTime(0, ctx.currentTime);
    master.gain.setTargetAtTime(LEVEL, ctx.currentTime, 0.6);
    master.connect(limiter);
    limiter.connect(ctx.destination);
    const meter = ctx.createAnalyser();
    meter.fftSize = 256;
    master.connect(meter);

    pad.type = "lowpass";
    pad.frequency.value = document.querySelector("dialog[open]") ? NEXT_ROOM : OPEN;
    pad.Q.value = 0.6;
    pad.connect(master);
    padSend.gain.value = 0.5;
    pad.connect(padSend);
    padSend.connect(reverb);

    dry.gain.value = 0.7;
    wet.gain.value = 0.55;
    dry.connect(master);
    wet.connect(reverb);
    reverb.connect(master);

    // The filter opens and closes a little, very slowly, so a held chord still breathes.
    drift.frequency.value = 0.07;
    driftDepth.gain.value = 180;
    drift.connect(driftDepth);
    driftDepth.connect(pad.frequency);
    drift.start();

    sound = { ctx, master, pad, dry, wet, meter, noise: null, held: null, scale: [], at: 0 };
    root.dataset.ambient = "on";
    lastY = window.scrollY;
    travelled = 0;
    moveTo(partNow() || WHERE.intro);
    startHaze();
    label();
  }

  document.addEventListener("landing:ready", () => {
    main = document.getElementById("landing-main");
    if (!main || !(window.AudioContext || window.webkitAudioContext) || toggles.length) return;

    const button = (where) => {
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "bracket-button";
      toggle.dataset.ambientToggle = where;
      toggles.push(toggle);
      return toggle;
    };

    main.querySelector(".hyper-entry-nav__right")?.append(button("nav"));

    const line = main.querySelector("footer > p:last-child");
    if (line) {
      const extra = document.createElement("span");
      extra.className = "footer-extra";
      extra.append(" · ", button("footer"));
      line.append(extra);
    }

    label();
  });

  // Kept synchronous: the audio context has to be opened inside the click.
  document.addEventListener("click", (event) => {
    if (!event.target.closest?.("[data-ambient-toggle]")) return;
    if (sound) stop();
    else start();
  });

  addEventListener("scroll", onScroll, { passive: true });
  document.addEventListener("pointerdown", onTouch, { passive: true });
  let recordOpen = false;
  document.addEventListener("landing:record", () => {
    // Stepping from one record to the next is not opening one.
    if (!recordOpen) cue("open");
    recordOpen = true;
    muffle(true);
  });
  document.addEventListener("landing:record-closed", () => {
    recordOpen = false;
    cue("close");
    muffle(false);
  });
  document.addEventListener("language:switched", (event) => cue("language", event.detail));
  document.addEventListener("visitor:kept", (event) => cue(event.detail.kind));
  document.addEventListener("door:left", (event) => {
    cue(event.detail.kind);
    if (sound && event.detail.kind === "note") boats.push({ launched: performance.now() / 1000 });
  });
  // Kept whether or not the sound is on, so the sky is right the moment it is.
  document.addEventListener("door:words", (event) => {
    wordsLeft = Math.max(0, Number(event.detail.total) || 0);
  });

  document.addEventListener("visibilitychange", () => {
    if (!sound) return;
    (document.hidden ? sound.ctx.suspend() : sound.ctx.resume()).catch(() => {});
  });

  // The reel has its own soundtrack.
  new MutationObserver(() => {
    if (root.classList.contains("intro")) stop();
  }).observe(root, { attributes: true, attributeFilter: ["class"] });
})();

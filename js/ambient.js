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
 * While it plays there is something to see as well: a few dots drifting behind the page,
 * dithered on a coarse grid, slow enough to miss. They take the page's ink, so they belong
 * to whichever theme is on, and they move a little more when the sound is louder.
 *
 * It never starts unasked. [sound] at the top right, beside [reel], and `sound` in the
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
    if (!sound || !event.target.closest?.("a, button, input, summary") || event.target.closest(SPOKEN_FOR)) return;
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
  /* The haze: a few dithered dots behind the page while it plays            */
  /* ---------------------------------------------------------------------- */

  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const CELL = 4;             // screen pixels per dot
  const THIN = 0.11;          // how much of the densest patch is ever lit
  let haze = null;

  function startHaze() {
    const canvas = document.createElement("canvas");
    canvas.className = "ambient-haze";
    canvas.setAttribute("aria-hidden", "true");
    document.body.prepend(canvas);
    const context = canvas.getContext("2d");
    const still = matchMedia("(prefers-reduced-motion: reduce)");
    const wave = new Uint8Array(256);
    let image = null;
    let level = 0;

    const size = () => {
      canvas.width = Math.ceil(window.innerWidth / CELL);
      canvas.height = Math.ceil(window.innerHeight / CELL);
      image = context.createImageData(canvas.width, canvas.height);
      draw();
    };

    function draw() {
      if (!sound || !image || document.hidden) return;
      // The page's ink, whichever theme that is today.
      const [r, g, b] = (getComputedStyle(document.body).color.match(/\d+/g) || [0, 0, 0]).map(Number);
      sound.meter.getByteTimeDomainData(wave);
      let energy = 0;
      for (let i = 0; i < wave.length; i++) energy += ((wave[i] - 128) / 128) ** 2;
      level += (Math.min(1, Math.sqrt(energy / wave.length) * 5) - level) * 0.2;

      const t = still.matches ? 0 : performance.now() / 1000;
      const { width, height, data } = image;
      const thin = THIN * (0.75 + level * 0.9);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          // Two slow waves leaning on each other, which reads as drift rather than stripes.
          const a = Math.sin(x * 0.043 + t * 0.09 + 1.7 * Math.sin(y * 0.031 - t * 0.06));
          const c = Math.sin(y * 0.052 - t * 0.07 + 1.3 * Math.sin(x * 0.027 + t * 0.05));
          const density = ((a * c + 1) / 2) ** 2 * thin;
          const lit = density * 16 > BAYER[(y & 3) * 4 + (x & 3)] + 0.5;
          const at = (y * width + x) * 4;
          data[at] = r;
          data[at + 1] = g;
          data[at + 2] = b;
          data[at + 3] = lit ? 255 : 0;
        }
      }
      context.putImageData(image, 0, 0);
    }

    size();
    addEventListener("resize", size);
    const timer = setInterval(draw, 110);
    haze = () => {
      clearInterval(timer);
      removeEventListener("resize", size);
      canvas.remove();
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
  document.addEventListener("door:left", (event) => cue(event.detail.kind));

  document.addEventListener("visibilitychange", () => {
    if (!sound) return;
    (document.hidden ? sound.ctx.suspend() : sound.ctx.resume()).catch(() => {});
  });

  // The reel has its own soundtrack.
  new MutationObserver(() => {
    if (root.classList.contains("intro")) stop();
  }).observe(root, { attributes: true, attributeFilter: ["class"] });
})();

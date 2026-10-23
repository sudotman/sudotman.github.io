/**
 * The reel's soundtrack, as a cassette deck on the reel screen.
 *
 * The soundtrack is synthesised — scripts/soundtrack/audio.py, 116 bpm, D minor
 * to D major — and rendered as stems: drums, bass, effects, and the chords once
 * for each of five voices. The deck picks the voice from a shelf of tapes, sets
 * a fader per stem, and the master: on or off, volume, warmth, how lazily the
 * tape spins up when a visitor clicks for sound, and how hard the yellow stripe
 * breathes with it.
 *
 * listen plays through js/intro.js's own mixer (SatyamReel.sound), loaded here
 * for the purpose, so what the studio plays is what the front door will play.
 * It follows the faders while it plays. Audio is fetched from the site itself;
 * nothing here talks to any other origin.
 */

import { REEL_MIX, REEL_MUSIC } from '../lib/schema.js';
import { button, el } from './dom.js';
import * as store from './store.js';

// Keep in step with the version index.html loads js/intro.js at.
const ENGINE = '/js/intro.js?v=20261023b';
const KIT = '/sounds/reel/stems.json';
const BPM = 116;
const TAPE = 0.35;

/** What js/intro.js falls back to; used when reel.json predates a field. */
const DEFAULTS = {
  on: true, voice: 'synth', volume: 1, warmth: 0, spinUp: 0.65, pulse: 1,
  mix: { drums: 1, bass: 1, chords: 1, effects: 1 }
};

/** The shelf, with what each tape is. The names are the synth's own. */
const VOICES = {
  synth: { colour: 'yellow', note: 'detuned saws, a plucked arp' },
  rhodes: { colour: 'gold', note: 'fm electric piano, tremolo' },
  mallets: { colour: 'mint', note: 'vibraphone, marimba' },
  sitar: { colour: 'green', note: 'tanpura drone, plucked sitar' },
  strings: { colour: 'river', note: 'string machine, pizzicato' }
};

/** Each stem's colour on the waveform and its channel strip. */
const STEM_COLOUR = { drums: 'ink', bass: 'river', chords: 'green', effects: 'gold' };

const SVG = 'http://www.w3.org/2000/svg';
const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const round = (value) => Math.round(value * 100) / 100;

function music() {
  const saved = store.doc('reel')?.music || {};
  const value = Object.fromEntries(REEL_MUSIC.map(({ key }) => [key, key in saved ? saved[key] : DEFAULTS[key]]));
  value.mix = Object.fromEntries(REEL_MIX.map(({ key }) => [key, key in (saved.mix || {}) ? saved.mix[key] : DEFAULTS.mix[key]]));
  return value;
}

/** Written whole and in schema order, so an older reel.json gains the block cleanly. */
function setMusic(key, value) {
  const next = { ...music(), [key]: value };
  const { mix, ...rest } = next;
  store.edit('reel', (reel) => {
    reel.music = { ...rest, mix };
  });
}

const setMix = (key, value) => setMusic('mix', { ...music().mix, [key]: value });

/* ---------- the engine and the audio, shared across renders ---------- */

let engine = null;

/** js/intro.js, which only plays when asked; here it is loaded for its mixer. */
function loadEngine() {
  if (window.SatyamReel?.sound) return Promise.resolve(window.SatyamReel.sound);
  engine ||= new Promise((resolve, reject) => {
    const script = el('script', { src: ENGINE });
    script.onload = () => (window.SatyamReel?.sound ? resolve(window.SatyamReel.sound) : reject(new Error('js/intro.js has no mixer')));
    script.onerror = () => {
      engine = null;
      reject(new Error('js/intro.js did not load'));
    };
    document.head.append(script);
  });
  return engine;
}

let kit = null;
const tracks = new Map();

function loadKit() {
  kit ||= fetch(KIT).then((response) => (response.ok ? response.json() : null)).catch(() => null);
  return kit;
}

/** The four stems for a voice, decoded once. */
function loadTrack(voice) {
  if (!tracks.has(voice)) {
    const pending = Promise.all([loadEngine(), loadKit()])
      .then(([sound, manifest]) => sound.load(voice, { kit: manifest }))
      .catch((error) => {
        tracks.delete(voice);
        throw error;
      });
    tracks.set(voice, pending);
  }
  return tracks.get(voice);
}

/** One playing take. */
let deck = null;

function stop() {
  if (!deck) return;
  const { ctx, board } = deck;
  deck = null;
  const now = ctx.currentTime;
  board.out.gain.cancelScheduledValues(now);
  board.out.gain.setValueAtTime(board.out.gain.value, now);
  board.out.gain.linearRampToValueAtTime(0, now + 0.12);
  board.stop(now + 0.14);
  setTimeout(() => ctx.close().catch(() => {}), 300);
}

function play(sound, track, from, levels, onEnd) {
  stop();
  const Context = window.AudioContext || window.webkitAudioContext;
  const ctx = new Context({ latencyHint: 'interactive' });
  const board = sound.board(ctx, track, levels);
  const meters = {};
  for (const [name, fader] of Object.entries(board.faders)) {
    meters[name] = ctx.createAnalyser();
    meters[name].fftSize = 512;
    fader.connect(meters[name]);
  }

  const now = ctx.currentTime + 0.03;
  const startRate = 1 - clamp(levels.spinUp, 0, 0.9);
  board.out.gain.setValueAtTime(0, now);
  board.out.gain.linearRampToValueAtTime(clamp(levels.volume), now + 0.22);
  board.start(now, from, startRate, TAPE);

  const take = { ctx, board, meters, now, from, startRate, duration: (track.single || track.stems.chords).duration };
  board.onended = () => {
    if (deck !== take) return;
    deck = null;
    ctx.close().catch(() => {});
    onEnd();
  };
  deck = take;
}

/** Where the take is in the track, following the spin-up ramp. */
function position(take) {
  const since = take.ctx.currentTime - take.now;
  if (since <= 0) return { at: take.from, rate: take.startRate };
  if (since < TAPE) {
    const rate = take.startRate + (1 - take.startRate) * (since / TAPE);
    return { at: take.from + since * (take.startRate + rate) / 2, rate };
  }
  return { at: take.from + TAPE * (1 + take.startRate) / 2 + (since - TAPE), rate: 1 };
}

const levelOf = (analyser, scratch) => {
  analyser.getByteTimeDomainData(scratch);
  let energy = 0;
  for (let index = 0; index < analyser.fftSize; index += 1) {
    const v = (scratch[index] - 128) / 128;
    energy += v * v;
  }
  return clamp(Math.sqrt(energy / analyser.fftSize) * 4.5);
};

/* ---------- the cassette ---------- */

function svg(tag, attributes = {}, ...children) {
  const node = document.createElementNS(SVG, tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  for (const child of children) node.append(child);
  return node;
}

function spool(cx, cy) {
  const pack = svg('circle', { cx, cy, r: 14, class: 'tape__pack' });
  const teeth = svg('g', { class: 'tape__hub' },
    svg('circle', { cx, cy, r: 7, class: 'tape__hub-ring' }),
    ...[0, 60, 120, 180, 240, 300].map((angle) => svg('rect', {
      x: cx - 1.2, y: cy - 7, width: 2.4, height: 3, class: 'tape__tooth', transform: `rotate(${angle} ${cx} ${cy})`
    })));
  return { pack, teeth, cx, cy };
}

function cassette(palette) {
  const left = spool(86, 66);
  const right = spool(154, 66);
  const band = svg('rect', { x: 18, y: 14, width: 204, height: 13, fill: palette.yellow });
  const title = svg('text', { x: 40, y: 24, class: 'tape__title' }, 'the reel — synth');
  const body = svg('svg', { viewBox: '0 0 240 152', class: 'tape__art', 'aria-hidden': 'true' },
    svg('rect', { x: 2, y: 2, width: 236, height: 148, rx: 10, fill: palette.ink }),
    ...[[12, 12], [228, 12], [12, 140], [228, 140]].map(([cx, cy]) => svg('circle', { cx, cy, r: 2.6, class: 'tape__screw' })),
    svg('rect', { x: 18, y: 14, width: 204, height: 92, rx: 5, fill: palette.paper }),
    band,
    svg('rect', { x: 18, y: 27, width: 204, height: 3, fill: palette.ink, opacity: 0.15 }),
    svg('text', { x: 26, y: 24, class: 'tape__side' }, 'A'),
    title,
    svg('rect', { x: 58, y: 46, width: 124, height: 40, rx: 20, class: 'tape__window' }),
    left.pack, right.pack, left.teeth, right.teeth,
    svg('text', { x: 120, y: 100, class: 'tape__meta' }, `${BPM} bpm · d minor → d major`),
    svg('path', { d: 'M54 150 L66 118 L174 118 L186 150 Z', class: 'tape__bridge' }),
    ...[88, 108, 132, 152].map((cx) => svg('circle', { cx, cy: 136, r: 3.2, class: 'tape__hole' })));
  return { body, left, right, band, title };
}

/* ---------- the waveform ---------- */

const BAR = 2;
const peakCache = new WeakMap();

/** One peak per bar for a buffer, worked out once per width rather than every frame. */
function peaksFor(buffer, width) {
  const cached = peakCache.get(buffer);
  if (cached?.width === width) return cached.values;
  const data = buffer.getChannelData(0);
  const count = Math.ceil(width / BAR);
  const values = new Float32Array(count);
  for (let bar = 0; bar < count; bar += 1) {
    const start = Math.floor((bar / count) * data.length);
    const end = Math.floor(((bar + 1) / count) * data.length);
    let peak = 0;
    for (let index = start; index < end; index += 4) peak = Math.max(peak, Math.abs(data[index]));
    values[bar] = peak;
  }
  peakCache.set(buffer, { width, values });
  return values;
}

/**
 * The stems stacked out from the centre line, each scaled by its fader, so the
 * strip shows where each part lives and how loud it now sits.
 */
function drawWave(canvas, track, mix, played, palette) {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (!width || !height || !track) return;
  const ratio = window.devicePixelRatio || 1;
  if (canvas.width !== Math.round(width * ratio)) {
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
  }
  const g = canvas.getContext('2d');
  g.setTransform(ratio, 0, 0, ratio, 0, 0);
  g.clearRect(0, 0, width, height);

  const duration = (track.single || track.stems.chords).duration;
  const beat = 60 / BPM;
  for (let index = 0, t = 0; t < duration; index += 1, t = index * beat) {
    const x = Math.round((t / duration) * width) + 0.5;
    g.fillStyle = index % 4 === 0 ? '#bdbdbd' : '#e6e6e6';
    g.fillRect(x, index % 4 === 0 ? 0 : height * 0.2, 1, index % 4 === 0 ? height : height * 0.6);
  }

  const layers = track.stems
    ? Object.keys(STEM_COLOUR).map((name) => ({ values: peaksFor(track.stems[name], width), gain: mix[name], colour: palette[STEM_COLOUR[name]] }))
    : [{ values: peaksFor(track.single, width), gain: 1, colour: palette.ink }];
  // Scaled so the default mix's loudest moment just fills the strip.
  let tallest = 0;
  for (let bar = 0; bar < layers[0].values.length; bar += 1) {
    tallest = Math.max(tallest, layers.reduce((sum, layer) => sum + layer.values[bar], 0));
  }
  const scale = (height / 2 - 2) / (tallest || 1);
  const middle = height / 2;

  layers[0].values.forEach((_, bar) => {
    const x = bar * BAR;
    g.globalAlpha = x / width <= played ? 1 : 0.4;
    let reach = 0;
    for (const layer of layers) {
      const h = layer.values[bar] * layer.gain * scale;
      if (h < 0.25) continue;
      g.fillStyle = layer.colour;
      g.fillRect(x, middle - reach - h, BAR - 0.6, h);
      g.fillRect(x, middle + reach, BAR - 0.6, h);
      reach += h;
    }
  });
  g.globalAlpha = 1;

  if (played > 0) {
    g.fillStyle = palette.ink;
    g.fillRect(Math.round(played * width) - 1, 0, 2, height);
  }
}

/* ---------- the controls ---------- */

function readout(key, value) {
  switch (key) {
    case 'volume': return value === 0 ? 'muted' : `${Math.round(value * 100)}%`;
    case 'warmth': return value === 0 ? 'untouched' : `cut at ${Math.round(20000 * Math.pow(450 / 20000, value) / 10) * 10} Hz`;
    case 'spinUp': return value === 0 ? 'no wobble' : `starts at ${Math.round((1 - value) * 100)}% speed`;
    case 'pulse': return value === 0 ? 'stripe holds still' : `× ${value.toFixed(1)}`;
    default: return value === 0 ? 'out' : `${Math.round(value * 100)}%`;
  }
}

/** A horizontal master control, words at both ends. */
function slider(descriptor, value, onInput, onChange) {
  const out = el('output.tape-fader__value', {}, readout(descriptor.key, value));
  const input = el('input', {
    type: 'range',
    min: String(descriptor.min),
    max: String(descriptor.max),
    step: String(descriptor.step),
    value: String(value),
    'aria-label': descriptor.label,
    oninput: (event) => {
      const next = round(Number(event.target.value));
      out.textContent = readout(descriptor.key, next);
      onInput(descriptor.key, next);
    },
    onchange: (event) => onChange(descriptor.key, Number(event.target.value))
  });
  const [low, high] = descriptor.ends;
  return el('label.tape-fader', { dataset: { key: descriptor.key } },
    el('span.tape-fader__label', {}, descriptor.label),
    el('span.tape-fader__track', {},
      el('span.tape-fader__end', {}, low), input, el('span.tape-fader__end', {}, high)),
    out);
}

/** A channel strip: a meter, an upright fader with its unity mark, a readout. */
function strip(descriptor, value, colour, onInput) {
  const out = el('output.tape-strip__value', {}, readout(descriptor.key, value));
  const meter = el('span.tape-strip__meter', {}, el('span.tape-strip__level', { style: { background: colour } }));
  const set = (next) => {
    out.textContent = readout(descriptor.key, next);
    onInput(descriptor.key, next);
  };
  const input = el('input', {
    type: 'range',
    min: String(descriptor.min),
    max: String(descriptor.max),
    step: String(descriptor.step),
    value: String(value),
    'aria-label': `${descriptor.label} level`,
    oninput: (event) => set(round(Number(event.target.value))),
    // Back to where the render put it.
    ondblclick: () => {
      input.value = '1';
      set(1);
    }
  });
  const node = el('div.tape-strip', { dataset: { key: descriptor.key }, title: descriptor.hint || 'double-click to put it back at 1' },
    el('span.tape-strip__body', {},
      meter,
      el('span.tape-strip__rail', {}, input, el('span.tape-strip__unity', { style: { bottom: `${(1 / descriptor.max) * 100}%` } }))),
    el('span.tape-strip__label', {}, el('span.tape-strip__chip', { style: { background: colour } }), descriptor.label),
    out);
  return { node, input, level: meter.firstChild };
}

/** The deck, ready to append. `context` is the view's, for the status line. */
export function soundtrack(context) {
  const palette = {
    ink: '#141411', paper: '#f0ede4', yellow: '#ffef00', green: '#00d16f', mint: '#8affc1', river: '#173dc4', gold: '#ffb427',
    ...store.doc('reel')?.palette
  };
  const start = music();
  const art = cassette(palette);
  let track = null;

  const shell = el('button.tape', {
    type: 'button',
    'aria-pressed': String(start.on),
    title: 'take the tape out, or put it back',
    onclick: () => toggle(!music().on)
  }, art.body);
  const tag = el('span.tape-tag', {}, '');
  const stripe = el('span.tape-stripe', { style: { background: palette.yellow } });
  const sound = el('input', { type: 'checkbox', checked: start.on, onchange: (event) => toggle(event.target.checked) });

  const shelf = el('div.tape-shelf', { role: 'radiogroup', 'aria-label': 'voice' },
    Object.entries(VOICES).map(([voice, about]) => {
      const spine = el('button.tape-spine', { type: 'button', role: 'radio', dataset: { voice }, onclick: () => choose(voice) },
        el('span.tape-spine__name', {}, voice), el('span.tape-spine__note', {}, about.note));
      spine.style.setProperty('--spine', palette[about.colour]);
      return spine;
    }));

  const canvas = el('canvas.tape-wave', {
    'aria-label': 'the soundtrack, stem by stem, with its beat grid — click to listen from there',
    onclick: (event) => {
      if (!track) return;
      const box = canvas.getBoundingClientRect();
      listen(clamp((event.clientX - box.left) / box.width) * (track.single || track.stems.chords).duration);
    }
  });
  const listenButton = button('▶ listen', { class: 'studio-action is-primary', onclick: () => (deck ? halt() : listen(0)) });
  const note = el('span.studio-section__note', {}, 'click the waveform to listen from there');

  const strips = REEL_MIX.map((descriptor) => strip(descriptor, start.mix[descriptor.key], palette[STEM_COLOUR[descriptor.key]], (key, value) => {
    setMix(key, value);
    deck?.board.set(music(), 0.03);
    wake();
  }));

  const masters = REEL_MUSIC.filter((descriptor) => descriptor.type === 'level').map((descriptor) => slider(
    descriptor,
    start[descriptor.key],
    (key, value) => {
      setMusic(key, value);
      if (!deck) return;
      if (key === 'volume') deck.board.out.gain.setTargetAtTime(value, deck.ctx.currentTime, 0.03);
      if (key === 'warmth') deck.board.set(music(), 0.03);
    },
    (key) => {
      // The spin-up only happens as the tape starts, so let go of the slider and hear it again.
      if (key === 'spinUp' && deck) listen(position(deck).at);
    }));

  function paint() {
    const now = music();
    const off = !now.on;
    const mixable = !track || Boolean(track.stems);
    shell.classList.toggle('is-out', off);
    shell.setAttribute('aria-pressed', String(!off));
    sound.checked = !off;
    tag.textContent = off ? 'tape out — the reel plays silent, and a click skips it' : 'tape in — a click brings the sound up';
    art.band.setAttribute('fill', palette[VOICES[now.voice]?.colour] || palette.yellow);
    art.title.textContent = `the reel — ${now.voice}`;
    for (const spine of shelf.children) {
      const chosen = spine.dataset.voice === now.voice;
      spine.classList.toggle('is-chosen', chosen);
      spine.setAttribute('aria-checked', String(chosen));
      spine.disabled = off;
    }
    for (const node of masters) node.querySelector('input').disabled = off;
    for (const channel of strips) channel.input.disabled = off || !mixable;
    listenButton.disabled = off;
    if (!mixable) note.textContent = 'the stems are not rendered — npm run soundtrack — so only the master applies';
  }

  function toggle(on) {
    setMusic('on', on);
    if (!on) halt();
    paint();
  }

  function choose(voice) {
    if (music().voice === voice) return;
    setMusic('voice', voice);
    paint();
    const at = deck ? position(deck).at : null;
    const wanted = voice;
    loadTrack(voice).then((next) => {
      if (music().voice !== wanted) return;
      track = next;
      paint();
      wake();
      if (at !== null) listen(at);
    }, (error) => context.setStatus(`The ${voice} tape would not load: ${error.message}`, 'error'));
  }

  let raf = 0;
  let level = 0;
  let angle = 0;
  let last = 0;
  const wave = new Uint8Array(1024);

  function frame(time) {
    // Navigating away removes the deck; the take goes with it.
    if (!canvas.isConnected) return halt();
    const dt = last ? Math.min(0.05, (time - last) / 1000) : 0;
    last = time;
    let played = 0;
    let rate = 0;
    if (deck) {
      const where = position(deck);
      played = clamp(where.at / deck.duration);
      rate = where.rate;
      const target = levelOf(deck.board.meter, wave);
      level += (target - level) * (target > level ? 0.55 : 0.12);
    } else {
      level *= 0.85;
    }
    for (const channel of strips) {
      const analyser = deck?.meters[channel.node.dataset.key];
      const target = analyser ? levelOf(analyser, wave) : 0;
      const now = Number(channel.level.dataset.v || 0);
      const next = now + (target - now) * (target > now ? 0.6 : 0.15);
      channel.level.dataset.v = String(next);
      channel.level.style.transform = `scaleY(${clamp(next * 1.6)})`;
    }

    // Same arithmetic as the stripe on the front door.
    const v = level * 1.3 * clamp(music().pulse, 0, 2);
    stripe.style.transform = v > 0.002 ? `scaleX(${1 + v})` : 'none';

    angle = (angle + dt * rate * 220) % 360;
    for (const [side, share] of [[art.left, 1 - played], [art.right, played]]) {
      side.pack.setAttribute('r', String(8 + 11 * share));
      side.teeth.setAttribute('transform', `rotate(${angle} ${side.cx} ${side.cy})`);
    }
    drawWave(canvas, track, music().mix, played, palette);
    raf = deck || level > 0.002 ? requestAnimationFrame(frame) : 0;
  }

  function wake() {
    if (!raf && canvas.isConnected) {
      last = 0;
      raf = requestAnimationFrame(frame);
    }
  }

  function listen(from) {
    if (!music().on) return;
    const voice = music().voice;
    Promise.all([loadEngine(), loadTrack(voice)]).then(([engineSound, next]) => {
      if (!canvas.isConnected || music().voice !== voice) return;
      track = next;
      play(engineSound, next, from, music(), () => {
        listenButton.textContent = '▶ listen';
        shell.classList.remove('is-playing');
        wake();
      });
      listenButton.textContent = '■ stop';
      shell.classList.add('is-playing');
      context.setStatus(`Listening to the ${voice} tape with the pending mix. Move a fader and it follows.`, 'ok');
      wake();
    }, (error) => context.setStatus(`The soundtrack would not load: ${error.message}`, 'error'));
  }

  function halt() {
    stop();
    listenButton.textContent = '▶ listen';
    shell.classList.remove('is-playing');
    wake();
  }

  paint();
  loadTrack(start.voice).then((loaded) => {
    track = loaded;
    paint();
    wake();
  }, () => {});

  return el('fieldset.studio-section', {},
    el('legend.studio-section__head', {},
      el('span.studio-section__title', {}, 'the soundtrack'),
      el('span.studio-section__note', {}, `synthesised by scripts/soundtrack — ${BPM} bpm, five voices, four stems`)),
    el('div.tape-deck', {},
      el('div.tape-bay', {}, shell, stripe, tag, shelf),
      el('div.tape-desk', {},
        el('label.tape-switch', {}, sound, el('span.tape-switch__knob'), el('span', {}, 'sound')),
        el('div.tape-mixer', {}, strips.map((channel) => channel.node)),
        ...masters,
        el('div.studio-actions', {}, listenButton, note))),
    canvas);
}

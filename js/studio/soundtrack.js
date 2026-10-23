/**
 * The reel's soundtrack, as a cassette deck on the reel screen.
 *
 * The deck edits how the soundtrack sounds — whether it plays at all, how loud,
 * how warm, how lazily the tape spins up when a visitor clicks for sound, and
 * how hard the yellow stripe breathes with it. It does not change the track:
 * sounds/intro.mp3 is cut to the 116 bpm grid the choreography is timed to.
 *
 * listen plays the soundtrack here through the same chain js/intro.js builds —
 * low-pass, meter, fader — with the pending levels, and follows the sliders
 * while it plays, so a change is heard before it is committed. The audio is
 * fetched from the site itself; nothing here talks to any other origin.
 */

import { REEL_MUSIC } from '../lib/schema.js';
import { button, el } from './dom.js';
import * as store from './store.js';

// Keep in step with SOUND in js/intro.js.
const SOUND = '/sounds/intro.mp3?v=20260927b';
const BPM = 116;
const TAPE = 0.35;

/** What js/intro.js falls back to; used when reel.json predates the music block. */
const DEFAULTS = { on: true, volume: 1, warmth: 0, spinUp: 0.65, pulse: 1 };

const SVG = 'http://www.w3.org/2000/svg';
const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);

/** The same curve js/intro.js uses: 0 leaves the track alone, 1 is a wall away. */
const cutoff = (warmth) => (warmth > 0 ? 20000 * Math.pow(450 / 20000, clamp(warmth)) : 20000);

function music() {
  const saved = store.doc('reel')?.music || {};
  return Object.fromEntries(REEL_MUSIC.map(({ key }) => [key, key in saved ? saved[key] : DEFAULTS[key]]));
}

/** Written whole and in schema order, so an older reel.json gains the block cleanly. */
function setMusic(key, value) {
  const next = { ...music(), [key]: value };
  store.edit('reel', (reel) => {
    reel.music = next;
  });
}

/* ---------- the audio, shared across renders ---------- */

let buffer = null;
let loading = null;

function load() {
  if (buffer) return Promise.resolve(buffer);
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!OAC) return Promise.reject(new Error('this browser cannot decode audio'));
  loading ||= fetch(SOUND)
    .then((response) => (response.ok ? response.arrayBuffer() : Promise.reject(new Error(`${SOUND} returned ${response.status}`))))
    .then((data) => new OAC(2, 48000, 48000).decodeAudioData(data))
    .then((decoded) => {
      buffer = decoded;
      return decoded;
    })
    .catch((error) => {
      loading = null;
      throw error;
    });
  return loading;
}

/** One playing take: a source through low-pass → meter → fader. */
let deck = null;

function stop() {
  if (!deck) return;
  const { ctx, src, gain } = deck;
  deck = null;
  const now = ctx.currentTime;
  gain.gain.cancelScheduledValues(now);
  gain.gain.setValueAtTime(gain.gain.value, now);
  gain.gain.linearRampToValueAtTime(0, now + 0.12);
  try {
    src.stop(now + 0.14);
  } catch {
    // Already stopped.
  }
  setTimeout(() => ctx.close().catch(() => {}), 300);
}

function play(from, levels, onEnd) {
  stop();
  const Context = window.AudioContext || window.webkitAudioContext;
  const ctx = new Context({ latencyHint: 'interactive' });
  const src = ctx.createBufferSource();
  const tone = ctx.createBiquadFilter();
  const meter = ctx.createAnalyser();
  const gain = ctx.createGain();
  src.buffer = buffer;
  tone.type = 'lowpass';
  tone.frequency.value = cutoff(levels.warmth);
  meter.fftSize = 1024;
  src.connect(tone);
  tone.connect(meter);
  meter.connect(gain);
  gain.connect(ctx.destination);

  const now = ctx.currentTime + 0.03;
  const startRate = 1 - clamp(levels.spinUp, 0, 0.9);
  src.playbackRate.setValueAtTime(startRate, now);
  src.playbackRate.linearRampToValueAtTime(1, now + TAPE);
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(clamp(levels.volume), now + 0.22);
  src.start(now, from);

  const take = { ctx, src, tone, meter, gain, now, from, startRate };
  src.onended = () => {
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
  const body = svg('svg', { viewBox: '0 0 240 152', class: 'tape__art', 'aria-hidden': 'true' },
    svg('rect', { x: 2, y: 2, width: 236, height: 148, rx: 10, fill: palette.ink }),
    ...[[12, 12], [228, 12], [12, 140], [228, 140]].map(([cx, cy]) => svg('circle', { cx, cy, r: 2.6, class: 'tape__screw' })),
    svg('rect', { x: 18, y: 14, width: 204, height: 92, rx: 5, fill: palette.paper }),
    svg('rect', { x: 18, y: 14, width: 204, height: 13, fill: palette.yellow }),
    svg('rect', { x: 18, y: 27, width: 204, height: 3, fill: palette.green }),
    svg('text', { x: 26, y: 24, class: 'tape__side' }, 'A'),
    svg('text', { x: 40, y: 24, class: 'tape__title' }, 'the reel — satyam.lol'),
    svg('rect', { x: 58, y: 46, width: 124, height: 40, rx: 20, class: 'tape__window' }),
    left.pack, right.pack, left.teeth, right.teeth,
    svg('text', { x: 120, y: 100, class: 'tape__meta' }, `${BPM} bpm · 0:15`),
    svg('path', { d: 'M54 150 L66 118 L174 118 L186 150 Z', class: 'tape__bridge' }),
    ...[88, 108, 132, 152].map((cx) => svg('circle', { cx, cy: 136, r: 3.2, class: 'tape__hole' })));
  return { body, left, right };
}

/* ---------- the waveform ---------- */

const BAR = 2;
let peaks = { width: 0, values: [] };

/** One peak per bar, worked out once per width rather than every frame. */
function peaksFor(decoded, width) {
  if (peaks.width === width) return peaks.values;
  const data = decoded.getChannelData(0);
  const count = Math.ceil(width / BAR);
  const values = new Float32Array(count);
  for (let bar = 0; bar < count; bar += 1) {
    const start = Math.floor((bar / count) * data.length);
    const end = Math.floor(((bar + 1) / count) * data.length);
    let peak = 0;
    for (let index = start; index < end; index += 4) peak = Math.max(peak, Math.abs(data[index]));
    values[bar] = peak;
  }
  peaks = { width, values };
  return values;
}

function drawWave(canvas, decoded, played, palette) {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (!width || !height) return;
  const ratio = window.devicePixelRatio || 1;
  if (canvas.width !== Math.round(width * ratio)) {
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
  }
  const g = canvas.getContext('2d');
  g.setTransform(ratio, 0, 0, ratio, 0, 0);
  g.clearRect(0, 0, width, height);

  const seconds = decoded.duration;
  const beat = 60 / BPM;
  for (let index = 0, t = 0; t < seconds; index += 1, t = index * beat) {
    const x = Math.round((t / seconds) * width) + 0.5;
    g.fillStyle = index % 4 === 0 ? '#bdbdbd' : '#e6e6e6';
    g.fillRect(x, index % 4 === 0 ? 0 : height * 0.2, 1, index % 4 === 0 ? height : height * 0.6);
  }

  const values = peaksFor(decoded, width);
  const middle = height / 2;
  values.forEach((peak, bar) => {
    const x = bar * BAR;
    const h = Math.max(1, peak * (height - 6));
    g.fillStyle = x / width <= played ? palette.ink : '#9a9a94';
    g.fillRect(x, middle - h / 2, BAR - 0.6, h);
  });

  if (played > 0) {
    g.fillStyle = palette.green;
    g.fillRect(Math.round(played * width) - 1, 0, 2, height);
  }
}

/* ---------- the controls ---------- */

function readout(key, value) {
  switch (key) {
    case 'volume': return value === 0 ? 'muted' : `${Math.round(value * 100)}%`;
    case 'warmth': return value === 0 ? 'untouched' : `cut at ${Math.round(cutoff(value) / 10) * 10} Hz`;
    case 'spinUp': return value === 0 ? 'no wobble' : `starts at ${Math.round((1 - value) * 100)}% speed`;
    case 'pulse': return value === 0 ? 'stripe holds still' : `× ${value.toFixed(1)}`;
    default: return '';
  }
}

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
      const next = Math.round(Number(event.target.value) * 100) / 100;
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

/** The deck, ready to append. `context` is the view's, for the status line. */
export function soundtrack(context) {
  const palette = { ink: '#141411', paper: '#f0ede4', yellow: '#ffef00', green: '#00d16f', ...store.doc('reel')?.palette };
  const levels = music();
  const art = cassette(palette);

  const shell = el('button.tape', {
    type: 'button',
    'aria-pressed': String(levels.on),
    title: 'take the tape out, or put it back',
    onclick: () => toggle(!music().on)
  }, art.body);
  const tag = el('span.tape-tag', {}, '');
  const stripe = el('span.tape-stripe', { style: { background: palette.yellow } });
  const sound = el('input', {
    type: 'checkbox',
    checked: levels.on,
    onchange: (event) => toggle(event.target.checked)
  });
  const canvas = el('canvas.tape-wave', {
    'aria-label': 'the soundtrack, with its beat grid — click to listen from there',
    onclick: (event) => {
      if (!buffer) return;
      const box = canvas.getBoundingClientRect();
      listen(clamp((event.clientX - box.left) / box.width) * buffer.duration);
    }
  });
  const listenButton = button('▶ listen', { class: 'studio-action is-primary', onclick: () => (deck ? halt() : listen(0)) });

  const faders = REEL_MUSIC.filter((descriptor) => descriptor.type === 'level').map((descriptor) => slider(
    descriptor,
    levels[descriptor.key],
    (key, value) => {
      setMusic(key, value);
      if (!deck) return;
      const now = deck.ctx.currentTime;
      if (key === 'volume') deck.gain.gain.setTargetAtTime(value, now, 0.03);
      if (key === 'warmth') deck.tone.frequency.setTargetAtTime(cutoff(value), now, 0.03);
    },
    (key) => {
      // The spin-up only happens as the tape starts, so let go of the slider and hear it again.
      if (key === 'spinUp' && deck) listen(position(deck).at);
    }));

  function paint() {
    const off = !music().on;
    shell.classList.toggle('is-out', off);
    shell.setAttribute('aria-pressed', String(!off));
    sound.checked = !off;
    tag.textContent = off ? 'tape out — the reel plays silent, and a click skips it' : 'tape in — a click brings the sound up';
    for (const node of faders) node.querySelector('input').disabled = off;
    listenButton.disabled = off;
  }

  function toggle(on) {
    setMusic('on', on);
    if (!on) halt();
    paint();
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
    if (deck && buffer) {
      const where = position(deck);
      played = clamp(where.at / buffer.duration);
      rate = where.rate;
      deck.meter.getByteTimeDomainData(wave);
      let energy = 0;
      for (let index = 0; index < wave.length; index += 1) {
        const v = (wave[index] - 128) / 128;
        energy += v * v;
      }
      const target = clamp(Math.sqrt(energy / wave.length) * 4.5);
      level += (target - level) * (target > level ? 0.55 : 0.12);
    } else {
      level *= 0.85;
    }

    // Same arithmetic as the stripe on the front door.
    const v = level * 1.3 * clamp(music().pulse, 0, 2);
    stripe.style.transform = v > 0.002 ? `scaleX(${1 + v})` : 'none';

    angle = (angle + dt * rate * 220) % 360;
    for (const [side, share] of [[art.left, 1 - played], [art.right, played]]) {
      side.pack.setAttribute('r', String(8 + 11 * share));
      side.teeth.setAttribute('transform', `rotate(${angle} ${side.cx} ${side.cy})`);
    }
    if (buffer) drawWave(canvas, buffer, played, palette);
    raf = deck || level > 0.002 ? requestAnimationFrame(frame) : 0;
  }

  const wake = () => {
    if (!raf) {
      last = 0;
      raf = requestAnimationFrame(frame);
    }
  };

  function listen(from) {
    if (!music().on) return;
    load().then(() => {
      play(from, music(), () => {
        listenButton.textContent = '▶ listen';
        shell.classList.remove('is-playing');
        wake();
      });
      listenButton.textContent = '■ stop';
      shell.classList.add('is-playing');
      context.setStatus('Listening with the pending levels. Move a slider and it follows.', 'ok');
      wake();
    }, (error) => context.setStatus(`The soundtrack would not load: ${error.message}`, 'error'));
  }

  function halt() {
    stop();
    listenButton.textContent = '▶ listen';
    shell.classList.remove('is-playing');
    if (canvas.isConnected) wake();
  }

  paint();
  load().then(() => wake(), () => {});

  return el('fieldset.studio-section', {},
    el('legend.studio-section__head', {},
      el('span.studio-section__title', {}, 'the soundtrack'),
      el('span.studio-section__note', {}, `sounds/intro.mp3 · ${BPM} bpm — the track is cut to the reel, so only how it sounds is editable`)),
    el('div.tape-deck', {},
      el('div.tape-bay', {}, shell, stripe, tag),
      el('div.tape-desk', {},
        el('label.tape-switch', {}, sound, el('span.tape-switch__knob'), el('span', {}, 'sound')),
        ...faders,
        el('div.studio-actions', {}, listenButton,
          el('span.studio-section__note', {}, 'click the waveform to listen from there')))),
    canvas);
}

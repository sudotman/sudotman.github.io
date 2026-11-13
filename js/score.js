/*
 * The score: the reel's soundtrack, played under the front door and mixed by where the
 * visitor is on it. Each section of the page has its own balance of the four stems (drums
 * under Work, chords under Writing) and scrolling glides from one to the next.
 *
 * It never starts unasked. [score] in the entry nav starts it and [hush] stops it, and the
 * audio context is opened inside that click, which is the only place a browser allows it.
 *
 * It plays through the reel's own mixer (SatyamReel.sound in js/intro.js: the same stems,
 * faders, soft clip and warmth), so there is still one audio chain. The reel's music runs
 * Dm9, Bbmaj9, Gm9, Fmaj9, A7sus4 and then lifts into D major to end; the first 24 beats stop
 * just short of the lift, on the dominant, so they loop back to the top as a turnaround.
 * scripts/soundtrack/audio.py is where that arrangement lives: if its section beats move,
 * LOOP_BEATS moves with them.
 *
 * While it plays the stripe breathes with it, as it does in the reel. A record opening
 * closes the low-pass, as if the music were in the next room. The reel has a soundtrack of
 * its own, so playing the reel stops this.
 */
(() => {
  "use strict";

  const root = document.documentElement;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;

  const LOOP_BEATS = 24;
  const SEAM = 0.045;        // one pass fades under the start of the next
  const AHEAD = 3;           // seconds of music kept scheduled
  const GLIDE = 0.35;
  const NEXT_ROOM = 0.62;    // warmth while a record is open

  // How much of each stem a section asks for. Sections are the page's own, found by the
  // same data-mark-scope the highlighter uses; one this table does not know plays as `rest`.
  const BALANCE = {
    intro: { drums: 0, bass: 0, chords: 0.8, effects: 0 },
    now: { drums: 0, bass: 0.7, chords: 0.8, effects: 0 },
    work: { drums: 1, bass: 1, chords: 0.45, effects: 0 },
    writing: { drums: 0, bass: 0.55, chords: 1, effects: 0 },
    "film-writing": { drums: 0.4, bass: 0.7, chords: 0.6, effects: 0.8 },
    more: { drums: 1, bass: 1, chords: 1, effects: 0.5 },
    footer: { drums: 0, bass: 0, chords: 0.55, effects: 0 },
    rest: { drums: 0, bass: 0.5, chords: 0.9, effects: 0.2 }
  };

  const clamp = (value, low = 0, high = 1) => Math.min(high, Math.max(low, Number.isFinite(value) ? value : low));

  let main = null;
  let link = null;
  let state = null;          // everything that exists only while it plays
  let starting = false;

  const music = () => {
    const configured = window.__REEL?.music || {};
    return {
      voice: typeof configured.voice === "string" ? configured.voice : "synth",
      volume: clamp(configured.volume ?? 1),
      warmth: clamp(configured.warmth ?? 0),
      pulse: clamp(configured.pulse ?? 1, 0, 2),
      mix: configured.mix || {}
    };
  };

  // Each section's share of the window, as a weight on its balance.
  function balanceNow() {
    const height = window.innerHeight || 1;
    const sum = { drums: 0, bass: 0, chords: 0, effects: 0 };
    let total = 0;
    main.querySelectorAll(":scope > [data-mark-scope], :scope > section").forEach((section) => {
      const box = section.getBoundingClientRect();
      const seen = Math.min(box.bottom, height) - Math.max(box.top, 0);
      if (seen <= 0) return;
      const wants = BALANCE[section.dataset.markScope] || BALANCE.rest;
      for (const name in sum) sum[name] += wants[name] * seen;
      total += seen;
    });
    if (!total) return BALANCE.rest;
    for (const name in sum) sum[name] /= total;
    return sum;
  }

  function mix() {
    if (!state) return;
    const { base, board } = state;
    const balance = balanceNow();
    const levels = {};
    for (const name in balance) levels[name] = clamp((base.mix[name] ?? 1) * balance[name], 0, window.SatyamReel.sound.MIX_TOP);
    board.set({ warmth: state.muffled ? Math.max(base.warmth, NEXT_ROOM) : base.warmth, mix: levels }, GLIDE);
  }

  let mixQueued = false;
  function queueMix() {
    if (!state || mixQueued) return;
    mixQueued = true;
    requestAnimationFrame(() => {
      mixQueued = false;
      mix();
    });
  }

  // One pass of the loop: every stem from the same instant, handed to its fader, and faded
  // out just past the seam, where the next pass has already come in.
  function pass(when) {
    const { ctx, track, board, period, playing } = state;
    const parts = track.stems ? Object.entries(track.stems) : [["single", track.single]];
    for (const [name, buffer] of parts) {
      const source = ctx.createBufferSource();
      const seam = ctx.createGain();
      source.buffer = buffer;
      seam.gain.setValueAtTime(1, when);
      seam.gain.setValueAtTime(1, when + period);
      seam.gain.linearRampToValueAtTime(0, when + period + SEAM);
      source.connect(seam);
      seam.connect(track.stems ? board.faders[name] : board.tone);
      source.start(when, 0, period + SEAM + 0.01);
      playing.add(source);
      source.onended = () => {
        playing.delete(source);
        source.disconnect();
        seam.disconnect();
      };
    }
  }

  function schedule() {
    if (!state || state.ctx.state !== "running") return;
    while (state.nextAt < state.ctx.currentTime + AHEAD) {
      pass(state.nextAt);
      state.nextAt += state.period;
    }
  }

  const still = matchMedia("(prefers-reduced-motion: reduce)");
  const wave = new Uint8Array(1024);
  function breathe() {
    if (!state) return;
    state.raf = requestAnimationFrame(breathe);
    if (still.matches || !state.stripe) return;
    state.board.meter.getByteTimeDomainData(wave);
    let energy = 0;
    for (let i = 0; i < wave.length; i++) {
      const v = (wave[i] - 128) / 128;
      energy += v * v;
    }
    // Gentler than the reel's meter: that pulses for fifteen seconds, this for as long as it plays.
    const target = clamp(Math.sqrt(energy / wave.length) * 3.2);
    state.level += (target - state.level) * (target > state.level ? 0.55 : 0.12);
    state.stripe.style.setProperty("--score-level", (state.level * state.base.pulse).toFixed(3));
  }

  function label() {
    if (!link) return;
    const on = !!state || starting;
    link.textContent = on ? "[hush]" : "[score]";
    link.title = on ? "stop the music" : "the reel's soundtrack, mixed by where you are on the page";
    link.setAttribute("aria-pressed", String(on));
  }

  function stop() {
    starting = false;
    const ending = state;
    state = null;
    delete root.dataset.score;
    label();
    if (!ending) return;
    cancelAnimationFrame(ending.raf);
    clearInterval(ending.timer);
    ending.stripe?.style.removeProperty("--score-level");
    const { ctx, board, playing } = ending;
    try {
      const at = ctx.currentTime;
      board.out.gain.cancelScheduledValues(at);
      board.out.gain.setValueAtTime(board.out.gain.value, at);
      board.out.gain.linearRampToValueAtTime(0, at + 0.4);
      for (const source of playing) source.stop(at + 0.45);
    } catch {
      /* the context has already gone */
    }
    setTimeout(() => ctx.close().catch(() => {}), 600);
  }

  function start() {
    if (state || starting || root.classList.contains("intro")) return;
    let ctx = null;
    try {
      ctx = new AudioContextClass({ latencyHint: "playback" });
      ctx.resume().catch(() => {});
    } catch {
      return;
    }
    starting = true;
    label();
    const giveUp = (error) => {
      if (error) console.error(error);
      starting = false;
      label();
      ctx.close().catch(() => {});
    };

    (window.SatyamLanding?.loadReel?.() || Promise.reject(new Error("the reel's mixer is not here")))
      .then(() => window.SatyamReel.sound.load(music().voice))
      .then((track) => {
        // [hush], or the reel, arrived while the stems were loading.
        if (!starting || root.classList.contains("intro")) return giveUp();
        starting = false;
        const base = music();
        const board = window.SatyamReel.sound.board(ctx, track, base);
        const at = ctx.currentTime + 0.06;
        board.out.gain.setValueAtTime(0, at);
        board.out.gain.linearRampToValueAtTime(base.volume * 0.85, at + 0.7);
        state = {
          ctx, track, board, base,
          period: LOOP_BEATS * window.SatyamReel.BEAT,
          nextAt: at,
          playing: new Set(),
          muffled: !!document.querySelector("dialog[open]"),
          stripe: document.querySelector(".stripe-reel"),
          level: 0,
          raf: 0,
          timer: 0
        };
        root.dataset.score = "on";
        mix();
        schedule();
        state.timer = setInterval(schedule, 500);
        breathe();
        label();
      })
      .catch(giveUp);
  }

  document.addEventListener("landing:ready", () => {
    main = document.getElementById("landing-main");
    const nav = main?.querySelector(".hyper-entry-nav");
    if (!nav || nav.querySelector("[data-score-toggle]")) return;
    link = document.createElement("button");
    link.type = "button";
    link.className = "bracket-button";
    link.dataset.scoreToggle = "";
    label();
    nav.append(" ", link);
  });

  // Kept synchronous: the audio context has to be opened inside the click.
  document.addEventListener("click", (event) => {
    if (!event.target.closest?.("[data-score-toggle]")) return;
    if (state || starting) stop();
    else start();
  });

  addEventListener("scroll", queueMix, { passive: true });
  addEventListener("resize", queueMix);
  document.addEventListener("landing:rows", queueMix);

  document.addEventListener("landing:record", () => {
    if (!state) return;
    state.muffled = true;
    mix();
  });
  document.addEventListener("landing:record-closed", () => {
    if (!state) return;
    state.muffled = false;
    mix();
  });

  document.addEventListener("visibilitychange", () => {
    if (!state) return;
    (document.hidden ? state.ctx.suspend() : state.ctx.resume().then(schedule)).catch(() => {});
  });

  // The reel has its own soundtrack.
  new MutationObserver(() => {
    if (root.classList.contains("intro")) stop();
  }).observe(root, { attributes: true, attributeFilter: ["class"] });
})();

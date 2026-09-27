/*
 * The front door's overture: a 15-second showreel that plays once per visit and
 * lands on the page beneath it. The same engine renders the video cuts, so the
 * reel on the site and the reel in the files never drift apart.
 *
 * Time runs on two clocks. `t` is the choreography (authored as a 10-second
 * cut); `T` is the wall clock (15 seconds). A warp maps one to the other: it
 * plays the choreography at ~0.97× and inserts whole-beat holds where every
 * choreographed element is at rest, while ambient motion (the globe, the river,
 * drift) keeps running on `T`. Holds are whole beats, so every cut stays on the
 * 116 bpm grid of the soundtrack.
 *
 * index.html decides whether to play (first visit in a tab, no deep link, no
 * reduced motion) and adds `html.intro`, which paints a matching cover until
 * this script takes over. Any key or scroll skips; the first click or tap brings
 * the soundtrack in (sounds/intro.mp3), the next one skips.
 */
(() => {
  "use strict";

  // ─────────────────────────────────────────────────────────── shared utilities
  const Y = "#ffef00", GREEN = "#00d16f", MINT = "#8affc1", INK = "#141411", PAPER = "#f0ede4", RIVER = "#173dc4", GOLD = "#ffb427";
  const SANS = "Arial, Helvetica, sans-serif", MONO = '"Courier New", Courier, monospace', SERIF = '"Times New Roman", Times, serif';
  const DUR = 15;
  const RATE = 29 / 30, BEAT = 0.5 / RATE, RAMP = 0.16;
  const FREEZE_VIDEO = [[1.49, 1], [3.78, 1], [4.84, 1], [5.2, 1], [5.57, 1], [6.88, 1], [8.13, 1], [9.8, 2]];
  const FREEZE_WEB = [[1.49, 1], [3.78, 1], [4.84, 1], [5.2, 1], [5.57, 1], [6.88, 1], [8.13, 1], [9.02, 2]];

  const clamp = (x, a = 0, b = 1) => x < a ? a : x > b ? b : x;
  const lerp = (a, b, t) => a + (b - a) * t;
  const P = (t, a, b) => clamp((t - a) / (b - a));
  const E = {
    outCubic: x => 1 - Math.pow(1 - x, 3),
    inCubic: x => x * x * x,
    inOutCubic: x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2,
    inOutQuint: x => x < .5 ? 16 * x ** 5 : 1 - Math.pow(-2 * x + 2, 5) / 2,
    outExpo: x => x >= 1 ? 1 : 1 - Math.pow(2, -10 * x),
    inExpo: x => x <= 0 ? 0 : Math.pow(2, 10 * x - 10),
    inOutExpo: x => x <= 0 ? 0 : x >= 1 ? 1 : x < .5 ? Math.pow(2, 20 * x - 10) / 2 : (2 - Math.pow(2, -20 * x + 10)) / 2,
    outBack: x => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); },
  };
  // damped spring step response; dt in seconds since release
  const spr = (dt, k = 14, w = 22) => dt <= 0 ? 0 : 1 - Math.exp(-k * dt) * Math.cos(w * dt);
  const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const mix = (a, b, t) => { const A = hex(a), B = hex(b); return `rgb(${A.map((v, i) => Math.round(lerp(v, B[i], t))).join(",")})`; };
  const pad = (n, l = 2) => String(n).padStart(l, "0");
  const typed = (str, t, a, b) => str.slice(0, Math.round(str.length * P(t, a, b)));

  // wall clock ⇄ choreography
  function makeWarp(freezes) {
    const starts = []; let beats = 0;
    for (const [f, n] of freezes) { starts.push([(f - RATE * RAMP / 2) / RATE + beats * BEAT, n * BEAT]); beats += n; }
    const bump = T => {
      let b = 0;
      for (const [s, L] of starts) {
        const p = L - RAMP, x = T - s;
        if (x <= 0 || x >= L + RAMP) continue;
        b += x < RAMP ? (1 - Math.cos(Math.PI * x / RAMP)) / 2 : x < RAMP + p ? 1 : (1 + Math.cos(Math.PI * (x - RAMP - p) / RAMP)) / 2;
      }
      return b;
    };
    const STEP = 1 / 2000, n = Math.ceil(DUR / STEP) + 2, tab = new Float64Array(n);
    for (let i = 1; i < n; i++) tab[i] = tab[i - 1] + RATE * (1 - bump((i - 0.5) * STEP)) * STEP;
    const W = T => { const x = clamp(T, 0, DUR) / STEP, i = Math.floor(x); return i >= n - 1 ? tab[n - 1] : lerp(tab[i], tab[i + 1], x - i); };
    const R = t => { let lo = 0, hi = n - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (tab[m] < t) lo = m + 1; else hi = m; } return lo * STEP; };
    return { W, R };
  }

  // ─────────────────────────────────────────────────────────── the reel
  function createReel(host, o = {}) {
    const V = o.orient === "v", WEB = !!o.web;
    const DW = V ? 1080 : 1920, DH = V ? 1920 : 1080;
    const sc = WEB ? Math.min(o.vw / DW, o.vh / DH) : 1;
    const SW = WEB ? o.vw / sc : DW, SH = WEB ? o.vh / sc : DH;
    const OX = (SW - DW) / 2, OY = (SH - DH) / 2;
    const STR = WEB ? [o.stripe[0] / sc, o.stripe[1] / sc] : [DW - 22, DW - 16];
    const { W: warp, R: unwarp } = makeWarp(WEB ? FREEZE_WEB : FREEZE_VIDEO);
    const X0 = V ? 80 : 150;

    const el = (tag, parent, css = {}, cls = "") => { const e = document.createElement(tag); if (cls) e.className = cls; Object.assign(e.style, css); parent.appendChild(e); return e; };
    const NS = "http://www.w3.org/2000/svg";
    const sv = (tag, parent, attrs = {}) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); parent.appendChild(e); return e; };
    const letters = (parent, text, css = {}) => [...text].map(ch => { const s = el("span", parent, { display: "inline-block", whiteSpace: "pre", ...css }); s.textContent = ch; return s; });
    const abs = (x, y, css = {}) => ({ position: "absolute", left: x + "px", top: y + "px", ...css });
    const bleed = { position: "absolute", left: "0px", top: "0px", width: SW + "px", height: SH + "px" };
    const box = (w, h) => ({ position: "absolute", left: "0px", top: "0px", width: w + "px", height: h + "px" });

    const style = el("style", host);
    style.textContent = `
      .sk-reel, .sk-reel * { box-sizing: border-box; margin: 0; padding: 0; }
      .sk-reel { -webkit-font-smoothing: antialiased; text-rendering: geometricPrecision; font-kerning: normal; }
      .sk-reel .w { display: inline-block; }
      .sk-reel .xr { display: inline-block; background: #000; color: #fff; font: 700 0.9em/0.9 ${SANS}; letter-spacing: -0.05em; padding: 0.04em 0.16em 0.1em 0.12em; vertical-align: 0.02em; }
      .sk-reel .lk { color: #0000e7; text-decoration: underline; text-decoration-thickness: 0.05em; text-underline-offset: 0.13em; }
      .sk-reel .card { position: absolute; left: 16px; bottom: 16px; max-width: 300px; background: ${PAPER}; border: 1px solid ${INK}; padding: 8px 12px 9px; color: ${INK}; }
      .sk-reel .card b { display: block; font: 400 31px/1.02 ${SERIF}; letter-spacing: -0.01em; }
      .sk-reel .card i { display: block; margin-top: 5px; font: normal 400 12px/1.3 ${MONO}; text-transform: uppercase; letter-spacing: 0.08em; }
      .sk-reel .hbox { display: inline-block; background: ${INK}; color: #fff; font: 700 1em/0.9 ${SANS}; letter-spacing: -0.055em; padding: 0.03em 0.23em 0.12em 0.09em; margin: 0 0 14px 0; }
      .sk-reel .ychip { position: absolute; background: ${Y}; color: #000; font: 700 28px/1 ${MONO}; padding: 8px 12px; white-space: pre; }`;
    const stage = el("div", host, { ...bleed, overflow: "hidden", background: "#fff", transformOrigin: "0 0" }, "sk-reel");
    const scenes = [];
    const scene = (a, b, bg) => { const s = el("div", stage, { ...bleed, overflow: "hidden", background: bg, display: "none" }); scenes.push({ s, a, b }); return s; };
    const content = (parent, css = {}) => el("div", parent, { ...box(DW, DH), left: OX + "px", top: OY + "px", ...css });

    // ─────────────────────────────────────── 01 front door
    const L1 = V
      ? { fs: 250, y: 620, slabL: 56, slabT: 578, slabB: 1052, chipY: 1092, chipFs: 24, chipPad: 10, sentY: 1172, sentFs: 76 }
      : { fs: 400, y: 140, slabL: 112, slabT: 100, slabB: 800, chipY: 822, chipFs: 30, chipPad: 12, sentY: 900, sentFs: 62 };
    const s1 = scene(0, 2.0, "#fff");
    const s1cam = content(s1, { transformOrigin: "0 0" });
    const swipe = el("div", s1cam, { position: "absolute", background: Y });
    const VTXT = "मेरे डिजिटल स्पेस में आपका स्वागत है!   میری ڈیجیٹل دنیا میں خوش آمدید!   ".repeat(5);
    const vtxt = el("div", s1, abs(34, 0, { writingMode: "vertical-rl", font: `400 19px/1 ${SERIF}`, color: "#000", whiteSpace: "nowrap" }));
    vtxt.textContent = VTXT;
    const nameBox = el("div", s1cam, abs(X0, L1.y, { font: `900 ${L1.fs}px/0.68 ${SANS}`, letterSpacing: "-0.09em", color: "#000", whiteSpace: "nowrap" }));
    const N1 = letters(el("div", nameBox), "satyam"), N2 = letters(el("div", nameBox), "kashyap");
    const CHIP = "creative technologist and filmmaker — mumbai, india";
    const chip = el("div", s1cam, abs(X0, L1.chipY, { font: `700 ${L1.chipFs}px/1.2 ${MONO}`, padding: `${L1.chipFs / 6}px ${L1.chipPad}px`, color: "#000", whiteSpace: "pre" }));
    chip.textContent = CHIP;
    const caret = el("span", s1cam, abs(0, L1.chipY + L1.chipFs * 0.27, { width: L1.chipFs * 0.57 + "px", height: L1.chipFs * 1.03 + "px", background: "#000" }));
    const sent = el("div", s1cam, abs(X0, L1.sentY, { font: `400 ${L1.sentFs}px/1.12 ${SERIF}`, color: "#000", whiteSpace: "nowrap" }));
    const gap = V ? "<br>" : "&nbsp; ";
    sent.innerHTML = `<span class="w">i</span> <span class="w">lead</span> <span class="w xr">xr</span><span class="w">.</span>${gap}<span class="w">i</span> <span class="w">make</span> <span class="w lk">films</span><span class="w">.</span>${gap}<span class="w">i</span> <span class="w">ship</span> <span class="w lk">tools</span><span class="w">.</span>`;
    const words = [...sent.querySelectorAll(".w")];
    const xrBox = sent.querySelector(".xr");
    const s1black = el("div", s1, { ...bleed, background: "#000", opacity: 0 });
    let chipR, xrC;

    function r1(t, T) {
      const e1 = E.outExpo(P(t, 0, 0.36));
      let l = lerp(STR[0] - OX, L1.slabL, e1), r = STR[1] - OX, tp = L1.slabT, bt = L1.slabB;
      const m = E.inOutExpo(P(t, 0.58, 0.9));
      l = lerp(l, chipR.l, m); r = lerp(r, chipR.r, m); tp = lerp(tp, chipR.t, m); bt = lerp(bt, chipR.b, m);
      Object.assign(swipe.style, { left: l + "px", top: tp + "px", width: (r - l) + "px", height: (bt - tp) + "px", transform: `skewX(${Math.sin(Math.PI * m) * -6}deg)` });
      const jump = L1.fs * 0.6;
      N1.forEach((s, i) => { const dt = t - (0.1 + i * 0.032), f = spr(dt, 13, 20); s.style.opacity = clamp(dt / 0.05); s.style.transform = `translateY(${(1 - f) * jump}px) rotate(${(1 - f) * -12}deg) scaleY(${1 + (1 - f) * 0.35})`; });
      N2.forEach((s, i) => { const dt = t - (0.2 + i * 0.03), f = spr(dt, 13, 20); s.style.opacity = clamp(dt / 0.05); s.style.transform = `translateY(${(1 - f) * -jump}px) rotate(${(1 - f) * 12}deg) scaleY(${1 + (1 - f) * 0.35})`; });
      const shown = typed(CHIP, t, 0.84, 1.14);
      chip.textContent = shown; chip.style.opacity = t > 0.8 ? 1 : 0;
      caret.style.left = (X0 + L1.chipPad + shown.length * L1.chipFs * 0.6) + "px";
      caret.style.opacity = (t > 0.82 && (t < 1.16 || Math.floor(T * 5) % 2 === 0)) ? 1 : 0;
      words.forEach((w, i) => { const e = E.outExpo(P(t, 0.96 + i * 0.03, 1.32 + i * 0.03)); w.style.opacity = e; w.style.transform = `translateY(${(1 - e) * 46}px)`; });
      const xe = spr(t - (0.96 + 2 * 0.03), 12, 20);
      xrBox.style.transform = `translateY(${(1 - clamp(xe)) * 30}px) scale(${lerp(0.4, 1, xe)})`;
      xrBox.style.color = mix("#ffffff", "#000000", P(t, 1.76, 1.9));
      vtxt.style.opacity = E.outCubic(P(t, 0.3, 0.7)) * 0.9;
      vtxt.style.transform = `translateY(${-120 - T * 60}px)`;
      // drift, then dive into the [xr] label
      const dx = -T * 8, z = Math.pow(P(t, 1.5, 2.0), 4), S = Math.exp(z * Math.log(60)), c = E.inOutCubic(P(t, 1.5, 1.92));
      const px = lerp(xrC.x + dx, DW / 2, c), py = lerp(xrC.y, DH / 2, c);
      s1cam.style.transform = `translate(${px - S * xrC.x}px, ${py - S * xrC.y}px) scale(${S})`;
      s1black.style.opacity = P(t, 1.95, 1.99);
    }

    // ─────────────────────────────────────── 02 xr / ononline
    const L2 = V
      ? { gc: [540, 640], R: 300, bx: 410, by: 430, lblY: 1150, slotY: 1184, slotH: 190, hFs: 152, subY: 1394, subFs: 22, pendY: 1450, pendFs: 28, roY: 1640, anch: [[-360, -300], [330, -282], [270, 318]] }
      : { gc: [1372, 540], R: 322, bx: 470, by: 430, lblY: 318, slotY: 352, slotH: 212, hFs: 178, subY: 590, subFs: 23, pendY: 646, pendFs: 30, roY: 876, anch: [[-392, -300], [352, -282], [290, 312]] };
    const s2 = scene(1.98, 3.9, "#020504");
    const s2cam = el("div", s2, { ...bleed, transformOrigin: "50% 50%" });
    el("div", s2cam, { ...bleed, background: `radial-gradient(ellipse ${V ? "90% 50%" : "58% 72%"} at ${OX + L2.gc[0]}px ${OY + L2.gc[1]}px, #0d3220 0%, #07170f 42%, #020504 100%)` });
    const s2c = content(s2cam);
    const cv = el("canvas", s2c, box(DW, DH)); cv.width = DW; cv.height = DH; const g = cv.getContext("2d");
    const s2label = el("div", s2c, abs(X0, L2.lblY, { font: `700 22px/1 ${MONO}`, color: GREEN, whiteSpace: "pre", letterSpacing: "0.02em" }));
    const slot = el("div", s2c, abs(X0 - 14, L2.slotY, { width: "900px", height: L2.slotH + "px", overflow: "hidden" }));
    const HEADS = ["lead xr", "MaRTES", "gaganyaan", "patents"], WS = [2.0, 2.5, 3.0, 3.5, 4.2];
    const heads = HEADS.map(w => { const d = el("div", slot, abs(12, 8, { font: `700 ${L2.hFs}px/1 ${SANS}`, letterSpacing: "-0.075em", color: "#eafff3", whiteSpace: "nowrap" })); d.textContent = w; return d; });
    const SUBS = ["lead xr dev — parallax labs, mumbai", "mission rehearsal & tactical engagement simulator", "an end-to-end vr simulator for isro's gaganyaan", "vr colocation via qr anchors + android gaussian splats"];
    const s2sub = el("div", s2c, abs(X0, L2.subY, { font: `400 ${L2.subFs}px/1.3 ${MONO}`, color: MINT, whiteSpace: "pre" }));
    const pend = el("div", s2c, abs(X0, L2.pendY, { font: `700 ${L2.pendFs}px/1 ${MONO}`, background: Y, color: "#000", padding: "8px 14px", transformOrigin: "0 50%", whiteSpace: "pre" }));
    pend.textContent = "patent-pending × 2";
    const readout = el("div", s2c, abs(X0, L2.roY, { font: `400 16px/1.7 ${MONO}`, color: "rgba(138,255,193,.72)", whiteSpace: "pre", letterSpacing: "0.04em" }));
    el("div", s2cam, { ...bleed, background: "repeating-linear-gradient(0deg, rgba(0,0,0,.26) 0 2px, rgba(0,0,0,0) 2px 4px)" });
    el("div", s2cam, { ...bleed, background: "radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) 52%, rgba(0,0,0,.7) 100%)" });

    const GC = { x: L2.gc[0], y: L2.gc[1], R: L2.R, f: 1500 };
    const rot = (p, ay, ax, az = 0) => {
      const [x, y, z] = p; let c = Math.cos(ay), s = Math.sin(ay);
      const x1 = x * c + z * s, z1 = -x * s + z * c; c = Math.cos(ax); s = Math.sin(ax);
      const y1 = y * c - z1 * s, z2 = y * s + z1 * c;
      if (!az) return [x1, y1, z2];
      c = Math.cos(az); s = Math.sin(az); return [x1 * c - y1 * s, x1 * s + y1 * c, z2];
    };
    const proj = p => { const k = GC.f / (GC.f + p[2] * GC.R); return [GC.x + p[0] * GC.R * k, GC.y + p[1] * GC.R * k, k, p[2]]; };
    const lonLines = [], latLines = [];
    for (let k = 0; k < 12; k++) { const lon = k * Math.PI / 6, pts = []; for (let j = 0; j <= 36; j++) { const la = -Math.PI / 2 + j * Math.PI / 36; pts.push([Math.cos(la) * Math.cos(lon), Math.sin(la), Math.cos(la) * Math.sin(lon)]); } lonLines.push(pts); }
    for (let k = 1; k < 12; k++) { const la = -Math.PI / 2 + k * Math.PI / 12, pts = []; for (let j = 0; j <= 72; j++) { const lon = j * Math.PI * 2 / 72; pts.push([Math.cos(la) * Math.cos(lon), Math.sin(la), Math.cos(la) * Math.sin(lon)]); } latLines.push(pts); }
    const NSPL = 1150, SPL = [], r2 = rng(7);
    for (let i = 0; i < NSPL; i++) {
      const y = 1 - 2 * (i + .5) / NSPL, rr = Math.sqrt(1 - y * y), ph = i * 2.399963, j = 1 + (r2() - .5) * 0.07, u = r2();
      SPL.push({ tgt: [rr * Math.cos(ph) * j, y * j, rr * Math.sin(ph) * j], st: [(r2() - .5) * 7, (r2() - .5) * 4.5, (r2() - .25) * 4], d: r2() * 0.34, sz: 2 + r2() * 5, c: u < .05 ? 3 : u < .12 ? 2 : u < .55 ? 1 : 0 });
    }
    const sprites = [GREEN, MINT, "#ffffff", Y].map(col => {
      const c = document.createElement("canvas"); c.width = c.height = 64; const x = c.getContext("2d");
      const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); const [r, gg, b] = hex(col);
      gr.addColorStop(0, `rgba(${r},${gg},${b},1)`); gr.addColorStop(0.25, `rgba(${r},${gg},${b},.55)`); gr.addColorStop(1, `rgba(${r},${gg},${b},0)`);
      x.fillStyle = gr; x.fillRect(0, 0, 64, 64); return c;
    });
    const finder = (x, y, s, a) => {
      const m = s / 7; g.save(); g.globalAlpha = a; g.fillStyle = Y;
      g.fillRect(x - s / 2, y - s / 2, s, m); g.fillRect(x - s / 2, y + s / 2 - m, s, m); g.fillRect(x - s / 2, y - s / 2, m, s); g.fillRect(x + s / 2 - m, y - s / 2, m, s);
      g.fillRect(x - 1.5 * m, y - 1.5 * m, 3 * m, 3 * m); g.restore();
    };
    const T_ORBIT = unwarp(2.92);

    function r2d(t, T) {
      g.clearRect(0, 0, DW, DH);
      const ay = 0.72 * T + 0.3, ax = -0.36;
      const front = new Path2D(), back = new Path2D();
      const drawLine = (pts, q) => {
        const n = (pts.length - 1) * q; let prev = proj(rot(pts[0], ay, ax));
        for (let j = 1; j <= Math.ceil(n); j++) {
          let p = pts[j]; if (j > n) { const f = n - (j - 1); p = pts[j - 1].map((v, i) => lerp(v, pts[j][i], f)); }
          const cur = proj(rot(p, ay, ax)); const path = (prev[3] + cur[3]) < 0 ? front : back;
          path.moveTo(prev[0], prev[1]); path.lineTo(cur[0], cur[1]); prev = cur;
        }
      };
      lonLines.forEach((pts, k) => drawLine(pts, E.outCubic(P(t, 2.0 + k * 0.018, 2.5 + k * 0.018))));
      latLines.forEach((pts, k) => drawLine(pts, E.outCubic(P(t, 2.08 + k * 0.018, 2.58 + k * 0.018))));
      g.lineWidth = 1.2; g.strokeStyle = "rgba(0,209,111,.16)"; g.stroke(back);
      g.lineWidth = 1.6; g.strokeStyle = "rgba(138,255,193,.62)"; g.stroke(front);
      // gaussian splats swarm into the sphere
      g.globalCompositeOperation = "lighter";
      for (const s of SPL) {
        const p = E.outExpo(P(t, 2.0 + s.d, 2.8 + s.d));
        let q = s.st.map((v, i) => lerp(v, s.tgt[i], p));
        q = rot(q, (1 - p) * 2.6, 0);
        const wob = 1 + 0.025 * Math.sin(T * 6 + s.d * 40) * p; q = q.map(v => v * wob);
        const pr = proj(rot(q, ay, ax));
        if (pr[2] <= 0) continue;
        const size = s.sz * (1 + (1 - p) * 7) * pr[2] * 3.2;
        g.globalAlpha = clamp((0.25 + 0.75 * p) * (pr[3] < 0 ? 1 : 0.32) * (1 - (1 - p) * 0.55));
        g.drawImage(sprites[s.c], pr[0] - size / 2, pr[1] - size / 2, size, size);
      }
      // gaganyaan orbit
      const oq = E.outCubic(P(t, 2.92, 3.28));
      if (oq > 0) {
        const ring = th => proj(rot([1.55 * Math.cos(th), 0, 1.55 * Math.sin(th)], 0, -0.3, -0.36));
        g.globalAlpha = 1; g.lineWidth = 1.5;
        for (let j = 0; j < 120 * oq; j++) {
          const a = ring(j / 120 * Math.PI * 2), b = ring((j + 1) / 120 * Math.PI * 2);
          g.strokeStyle = a[3] < 0 ? "rgba(234,255,243,.55)" : "rgba(0,209,111,.2)";
          g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
        }
        const th0 = 3.9 + (T - T_ORBIT) * 1.7;
        for (let k = 14; k >= 0; k--) {
          const c = ring(th0 - k * 0.045), sz = (k === 0 ? 70 : 34 - k * 1.6) * c[2];
          g.globalAlpha = oq * (k === 0 ? 1 : 0.5 * (1 - k / 15)); g.drawImage(sprites[2], c[0] - sz / 2, c[1] - sz / 2, sz, sz);
        }
        const c = ring(th0);
        g.globalCompositeOperation = "source-over"; g.globalAlpha = oq;
        g.fillStyle = "#fff"; g.beginPath(); g.arc(c[0], c[1], 5, 0, 7); g.fill();
        g.font = `700 15px ${MONO}`; g.fillStyle = MINT; g.textAlign = c[0] > DW - 300 ? "right" : "left";
        g.fillText("GAGANYAAN · LEO 400 KM", c[0] + (g.textAlign === "right" ? -16 : 16), c[1] - 12); g.textAlign = "left";
      }
      g.globalCompositeOperation = "source-over"; g.globalAlpha = 1;
      // tracking brackets
      const bq = E.outExpo(P(t, 2.12, 2.42));
      if (bq > 0) {
        const L = 70 * bq; g.strokeStyle = "rgba(0,209,111,.8)"; g.lineWidth = 2; g.beginPath();
        for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const x = GC.x + sx * L2.bx, y = GC.y + sy * L2.by; g.moveTo(x, y + sy * L); g.lineTo(x, y); g.lineTo(x - sx * L, y); }
        g.stroke();
      }
      // qr anchors + colocation mesh
      const pts = L2.anch.map(([x, y]) => [GC.x + x, GC.y + y]);
      const mq = E.outCubic(P(t, 3.56, 3.72));
      if (mq > 0) {
        g.setLineDash([10, 8]); g.lineWidth = 2; g.strokeStyle = `rgba(255,239,0,${0.8 * mq})`; g.beginPath();
        for (let i = 0; i < 3; i++) { const a = pts[i], b = pts[(i + 1) % 3]; g.moveTo(a[0], a[1]); g.lineTo(lerp(a[0], b[0], mq), lerp(a[1], b[1], mq)); }
        g.stroke(); g.setLineDash([]);
      }
      pts.forEach(([x, y], i) => {
        const dt = t - (3.48 + i * 0.05); if (dt <= 0) return; const f = spr(dt, 16, 26);
        finder(x, y, 66 * f, clamp(dt / 0.04));
        const right = x > GC.x;
        g.font = `700 14px ${MONO}`; g.fillStyle = Y; g.globalAlpha = clamp((dt - 0.05) / 0.05); g.textAlign = right ? "right" : "left";
        g.fillText(`ANCHOR_0${i + 1}`, right ? x - 44 : x + 44, y + 5); g.globalAlpha = 1; g.textAlign = "left";
      });
    }

    function r2s(t, T) {
      r2d(t, T);
      const zin = E.outExpo(P(t, 1.98, 2.55)), c1 = E.inExpo(P(t, 3.79, 3.89));
      const sy = lerp(1.7, 1, zin) * lerp(1, 0.004, c1), sx = lerp(1.7, 1, zin) * lerp(1, 1.1, c1);
      s2cam.style.transform = `scale(${sx}, ${sy})`;
      s2cam.style.filter = c1 > 0 ? `brightness(${1 + 3.5 * c1})` : "none";
      s2label.textContent = typed("02 — xr / parallax labs", t, 2.04, 2.22);
      heads.forEach((h, i) => {
        const a = WS[i], b = WS[i + 1], inP = E.outExpo(P(t, a, a + 0.32)), outP = E.inExpo(P(t, b - 0.1, b));
        h.style.display = (t >= a && t < b) ? "block" : "none";
        h.style.transform = `translateY(${((1 - inP) - outP) * L2.slotH}px)`;
        const ab = 16 * ((1 - inP) + outP);
        h.style.textShadow = `${ab}px 0 rgba(255,40,90,.75), ${-ab}px 0 rgba(0,240,255,.75), 0 0 34px rgba(0,209,111,.5)`;
      });
      const i = t < 2.5 ? 0 : t < 3.0 ? 1 : t < 3.5 ? 2 : 3;
      s2sub.textContent = typed(SUBS[i], t, WS[i] + 0.04, WS[i] + (i === 3 ? 0.2 : 0.3));
      const pd = t - 3.52; pend.style.opacity = pd > 0 ? 1 : 0; pend.style.transform = `scaleX(${clamp(spr(pd, 14, 22), 0, 1.2)})`;
      const cnt = Math.floor(NSPL * E.outCubic(P(t, 2.0, 3.1)));
      const an = t < 3.48 ? 0 : t < 3.53 ? 1 : t < 3.58 ? 2 : 3;
      readout.textContent = `SPLATS ${pad(cnt, 4)}/${NSPL}    ANCHORS ${an}/3    6DOF ● TRACKING    72 HZ\nIPD 63.5 MM    MTP ${(11.2 + 2.6 * Math.sin(T * 17)).toFixed(1)} MS    POSE ${(Math.sin(T * 3) * 0.41).toFixed(3)} ${(1.62 + Math.sin(T * 2.3) * 0.02).toFixed(3)} ${(Math.cos(T * 2.7) * 0.35).toFixed(3)}`;
      readout.style.opacity = P(t, 2.1, 2.3);
    }

    // ─────────────────────────────────────── 03 film / river
    const L3 = V
      ? { AH: 1350, sun: [540, 290, 200], hor: 470, reflY: 484, reflW: 380, reflStep: 20, metaY: 706, titleY: 744, titleFs: 170, blurbY: 942, blurbFs: 34, blurbW: 900, clap: [240, 96, 1], beam: [380, -520], sirR: [-760, 520], sirB: [740, 520], ratio: "4:5" }
      : { AH: 803, sun: [1570, 330, 240], hor: 560, reflY: 574, reflW: 440, reflStep: 24, metaY: 196, titleY: 238, titleFs: 224, blurbY: 506, blurbFs: 38, blurbW: 820, clap: [1150, 170, 1], beam: [1050, -420], sirR: [-500, 250], sirB: [1350, 250], ratio: "2.39:1" };
    const AH = L3.AH, X3 = V ? 76 : 140;
    const s3 = scene(3.9, 5.76, "#000");
    const ap = el("div", s3, abs(0, 0, { width: SW + "px", overflow: "hidden", background: RIVER }));
    const apIn = el("div", ap, abs(0, 0, { width: SW + "px", height: AH + "px" }));
    const rs = sv("svg", apIn, { width: SW, height: AH, style: "position:absolute;left:0;top:0;overflow:visible" });
    const rlines = []; for (let i = 0; i < Math.ceil(AH / 62) + 1; i++) rlines.push(sv("path", rs, { fill: "none", stroke: PAPER, "stroke-width": 1.3, opacity: 0.26 }));
    const strip = el("div", apIn, abs(0, 0, { width: SW * 3 + "px", height: AH + "px" }));
    const plate = i => { const p = el("div", strip, abs(SW * i, 0, { width: SW + "px", height: AH + "px", overflow: "hidden" })); return { p, c: el("div", p, abs(OX, 0, { width: DW + "px", height: AH + "px" })) }; };
    const meta = (p, txt) => { const m = el("div", p, abs(X3 + 12, L3.metaY, { font: `700 18px/1 ${MONO}`, color: PAPER, border: `1.5px solid ${PAPER}`, padding: "5px 9px 4px", letterSpacing: "0.08em", whiteSpace: "pre" })); m.textContent = txt; return m; };
    const title = (p, txt, gold, clip = true) => { const d = el("div", p, abs(X3, L3.titleY, { font: `italic 400 ${L3.titleFs}px/1 ${SERIF}`, color: "#fff", whiteSpace: "nowrap", letterSpacing: "-0.015em", clipPath: clip ? "inset(-20% -10% -2% -10%)" : "none" })); const ls = letters(d, txt); if (gold) ls.slice(gold).forEach(s => { s.style.color = GOLD; }); return ls; };
    const blurb = (p, txt) => { const b = el("div", p, abs(X3 + 14, L3.blurbY, { width: L3.blurbW + "px", font: `italic 400 ${L3.blurbFs}px/1.18 ${SERIF}`, color: PAPER })); b.textContent = txt; return b; };
    // A — chhoti gold: a gold sun on the river
    const pA = plate(0);
    const [sx0, sy0, sr0] = L3.sun;
    const sunClip = el("div", pA.c, abs(0, 0, { width: DW + "px", height: L3.hor + "px", overflow: "hidden" }));
    const sun = el("div", sunClip, abs(sx0 - sr0, sy0 - sr0, { width: 2 * sr0 + "px", height: 2 * sr0 + "px", borderRadius: "50%", background: GOLD }));
    const refl = []; for (let i = 0; i < 8; i++) refl.push(el("div", pA.c, abs(0, L3.reflY + i * L3.reflStep, { height: (12 - i) + "px", background: GOLD, borderRadius: "8px" })));
    const mA = meta(pA.c, "FILM · 2025 · 26 MIN"), tA = title(pA.c, "Chhoti Gold", 7), bA = blurb(pA.c, "an absurd, surreal short about two people whose lives change after they meet.");
    // B — blue dogs: noir searchlight and a siren wash
    const pB = plate(1);
    el("div", pB.p, { ...box(SW, AH), background: "linear-gradient(180deg, rgba(4,10,40,.55), rgba(4,10,40,.1) 60%, rgba(4,10,40,.5))" });
    const beam = el("div", pB.c, abs(L3.beam[0], L3.beam[1], { width: "900px", height: "1700px", transformOrigin: "450px 0px", background: "linear-gradient(180deg, rgba(255,255,255,.34), rgba(255,255,255,0) 85%)", clipPath: "polygon(46% 0, 54% 0, 100% 100%, 0 100%)" }));
    const sirR = el("div", pB.c, abs(L3.sirR[0], L3.sirR[1], { width: "1100px", height: "1100px", borderRadius: "50%", background: "radial-gradient(circle, rgba(243,59,47,.8), rgba(243,59,47,0) 62%)" }));
    const sirB = el("div", pB.c, abs(L3.sirB[0], L3.sirB[1], { width: "1100px", height: "1100px", borderRadius: "50%", background: "radial-gradient(circle, rgba(120,150,255,.9), rgba(120,150,255,0) 62%)" }));
    meta(pB.c, "FILM · 2023 · 15 MIN · HINDI"); title(pB.c, "Blue Dogs", 0, false); blurb(pB.c, "two men in mumbai, caught in bigotry, paranoia and delusion.");
    // C — film 03 and a clapperboard
    const pC = plate(2);
    const mC = meta(pC.c, "● IN DEVELOPMENT"); title(pC.c, "film 03", 0, false); blurb(pC.c, "the next one, after chhoti gold and blue dogs.");
    const clap = el("div", pC.c, abs(L3.clap[0], L3.clap[1], { width: "600px" }));
    const stick = el("div", clap, abs(0, 0, { width: "600px", height: "74px", background: `repeating-linear-gradient(-58deg, #fff 0 46px, ${INK} 46px 92px)`, border: `5px solid ${INK}`, transformOrigin: "0% 100%" }));
    el("div", clap, abs(0, 78, { width: "600px", height: "60px", background: `repeating-linear-gradient(58deg, #fff 0 46px, ${INK} 46px 92px)`, border: `5px solid ${INK}` }));
    const board = el("div", clap, abs(0, 142, { width: "600px", height: "360px", background: INK, border: `4px solid ${PAPER}`, color: PAPER, font: `700 30px/1 ${MONO}`, padding: "26px 30px", whiteSpace: "pre" }));
    board.innerHTML = `<div style="border-bottom:2px solid ${PAPER};padding-bottom:18px">PROD.  FILM 03</div><div style="border-bottom:2px solid ${PAPER};padding:18px 0">DIR.   SATYAM KASHYAP</div><div style="border-bottom:2px solid ${PAPER};padding:18px 0">SCENE 01    TAKE 01</div><div style="padding-top:18px">ROLL A      2026</div>`;
    // viewfinder
    const vf = el("div", apIn, box(SW, AH));
    const vs = sv("svg", vf, { width: SW, height: AH, style: "position:absolute;left:0;top:0" });
    const cm = 44, cl = 62, cxv = SW / 2, cyv = AH / 2;
    sv("path", vs, { d: `M${cm} ${cm + cl}V${cm}H${cm + cl} M${SW - cm - cl} ${cm}H${SW - cm}V${cm + cl} M${cm} ${AH - cm - cl}V${AH - cm}H${cm + cl} M${SW - cm - cl} ${AH - cm}H${SW - cm}V${AH - cm - cl} M${cxv - 16} ${cyv}H${cxv + 16} M${cxv} ${cyv - 16}V${cyv + 16}`, fill: "none", stroke: "#fff", "stroke-width": 2.5, opacity: 0.85 });
    const vfT = (x, y, right) => el("div", vf, abs(x, y, { font: `700 16px/1 ${MONO}`, color: "#fff", whiteSpace: "pre", letterSpacing: "0.06em", textAlign: right ? "right" : "left", width: right ? "600px" : "auto" }));
    const rec = el("div", vf, abs(68, 66, { width: "14px", height: "14px", borderRadius: "50%", background: "#ff2b2b" }));
    vfT(92, 66).textContent = "REC   A-CAM";
    vfT(SW - 68 - 600, 66, true).textContent = `24.000 FPS   ${L3.ratio}   ISO 800   T2.0`;
    const vf3 = vfT(68, AH - 82);
    vfT(SW - 68 - 600, AH - 82, true).textContent = "03 — WRITTEN & DIRECTED";
    const line = el("div", s3, abs(0, SH / 2 - 2, { width: SW + "px", height: "4px", background: "#fff", boxShadow: "0 0 28px 8px rgba(200,255,225,.85)" }));
    const subBar = el("div", s3, abs(0, SH / 2 + AH / 2 + (V ? 70 : 36), { width: SW + "px", textAlign: "center", font: `700 28px/1 ${MONO}`, color: Y, whiteSpace: "pre" }));
    const T_FILM = unwarp(4.0), T_BEAM = [unwarp(4.9), unwarp(5.36)];

    function r3(t, T) {
      const h = t < 4.0 ? 4 : lerp(4, AH, E.outExpo(P(t, 4.0, 4.36)));
      ap.style.top = (SH / 2 - h / 2) + "px"; ap.style.height = h + "px"; apIn.style.top = ((h - AH) / 2) + "px";
      ap.style.background = mix("#ffffff", RIVER, P(t, 4.0, 4.1));
      line.style.opacity = t < 4.0 ? 1 : 1 - P(t, 4.0, 4.1);
      line.style.transform = `scaleY(${t < 4.0 ? 1 : lerp(1, 3, P(t, 4.0, 4.1))})`;
      // whip pans between the three films
      const sx = -SW * (E.inOutQuint(P(t, 4.93, 5.12)) + E.inOutQuint(P(t, 5.36, 5.54)));
      strip.style.transform = `translateX(${sx}px)`;
      rlines.forEach((p, i) => {
        let d = ""; const y0 = 40 + i * 62, off = sx * 0.22;
        for (let k = 0; k <= 24; k++) { const x = k / 24 * (SW + 400) - 200; const y = y0 + (x - SW / 2) * -0.045 + 14 * Math.sin(x * 0.004 + T * 1.3 + i * 0.9) + 6 * Math.sin(x * 0.011 - T * 1.9 + i); d += (k ? "L" : "M") + (x + (off % 200)).toFixed(1) + " " + y.toFixed(1); }
        p.setAttribute("d", d);
      });
      const se = E.outExpo(P(t, 4.08, 4.62));
      sun.style.transform = `translateY(${(1 - se) * sr0 * 1.8}px)`;
      refl.forEach((b, i) => { const w = (L3.reflW - i * L3.reflW * 0.105) * E.outCubic(P(t, 4.3 + i * 0.03, 4.6 + i * 0.03)); b.style.width = w + "px"; b.style.left = (sx0 - w / 2 + 16 * Math.sin(T * 7 + i * 1.7)) + "px"; });
      tA.forEach((s, i) => { const e = E.outExpo(P(t, 4.16 + i * 0.026, 4.66 + i * 0.026)); s.style.transform = `translateY(${(1 - e) * L3.titleFs * 1.12}px)`; });
      const rise = (n, a) => { const e = E.outExpo(P(t, a, a + 0.4)); n.style.opacity = e; n.style.transform = `translateY(${(1 - e) * 30}px)`; };
      rise(mA, 4.22); rise(bA, 4.38);
      beam.style.transform = `rotate(${lerp(38, 8, P(T, T_BEAM[0], T_BEAM[1]))}deg)`;
      const fl = Math.floor(T * 11) % 2;
      sirR.style.opacity = (fl ? 0.95 : 0.12) * P(t, 5.0, 5.1); sirB.style.opacity = (fl ? 0.12 : 0.95) * P(t, 5.0, 5.1);
      mC.textContent = (Math.floor(T * 3) % 2 ? "● " : "  ") + "IN DEVELOPMENT";
      let ang = -30; if (t > 5.6) ang = lerp(-30, 0, E.inCubic(P(t, 5.6, 5.75)));
      if (t > 5.75) ang = -5 * Math.exp(-(t - 5.75) * 30) * Math.abs(Math.sin((t - 5.75) * 50));
      stick.style.transform = `rotate(${ang}deg)`;
      vf.style.opacity = E.outCubic(P(t, 4.18, 4.32));
      rec.style.opacity = Math.floor(T * 2.5) % 2 ? 1 : 0.15;
      const ft = Math.max(0, Math.floor((T - T_FILM) * 24)) + 24 * 17 + 7; vf3.textContent = `TC 01:00:${pad(Math.floor(ft / 24))}:${pad(ft % 24)}`;
      subBar.textContent = typed("i write and direct films.", t, 4.3, 4.6);
    }

    // ─────────────────────────────────────── 04 tools / living
    const L5 = V
      ? { c: [540, 1010], quoteY: 380, quoteFs: 70 }
      : { c: [960, 562], quoteY: 92, quoteFs: 58 };
    const VC = [[-115, -110], [115, -110], [-115, 110], [115, 110]].map(([dx, dy]) => [L5.c[0] + dx, L5.c[1] + dy]), VR = 236;
    const L4 = V
      ? { hx: 80, hy: 540, hFs: 128, pan: [30, 120], chips: [[560, 396, -2], [600, 880, 2.5], [80, 1016, -1.5], [300, 1320, 1.5]] }
      : { hx: 150, hy: 318, hFs: 150, pan: [46, 30], chips: [[1180, 196, -2], [1236, 690, 2.5], [150, 690, -1.5], [690, 850, 1.5]] };
    const s4 = scene(5.75, 7.52, INK);
    const iris = el("div", s4, { ...bleed, background: PAPER });
    const grid = el("div", s4, { ...bleed, transformOrigin: "50% 50%" });
    const TW = 392, TH = 324, GAP = 12;
    const COLS = Math.max(3, Math.ceil((SW + 2 * L4.pan[0] + 40 + GAP) / (TW + GAP)));
    let ROWS = Math.ceil((SH + 2 * L4.pan[1] + 40 + GAP) / (TH + GAP)); while (COLS * ROWS < 24) ROWS++;
    const GX = (SW - (COLS * TW + (COLS - 1) * GAP)) / 2, GY = (SH - (ROWS * TH + (ROWS - 1) * GAP)) / 2;
    const slotXY = k => [GX + (k % COLS) * (TW + GAP), GY + Math.floor(k / COLS) * (TH + GAP)];
    const WORKS = [
      // [title, meta, group]  0 xr · 1 film · 2 code · 3 art
      ["MaRTES", "r&d · current", 0], ["gaganyaan vr", "isro · r&d", 0], ["UE camera2", "quest 3 · c++", 0], ["mr hmg simulator", "r&d · ongoing", 0], ["vr fire safety", "training · r&d", 0], ["interaction research", "isdk · c#", 0],
      ["Chhoti Gold", "film · 2025", 1], ["Blue Dogs", "film · 2023", 1], ["film 03", "in development", 1], ["cbfc cut lists", "censorship explorer", 1], ["126 reviews", "letterboxd", 1], ["carcinization", "essay · 2025", 1],
      ["Hear", "offline · private", 2], ["OpenPiano", "web midi · lessons", 2], ["OpenWorkout", "local-first", 2], ["better unity", "31★ · open source", 2], ["render buddy", "unreal toolkit", 2], ["UE MCP bridge", "unreal editor × mcp", 2],
      ["the closet", "drifting archive", 3], ["Pahari Preservation", "language archive", 3], ["Unlearn", "puzzle-platformer", 3], ["artsaver", "passive art", 3], ["wusic", "minimal player", 3], ["the everything bagel", "eeaao, but a site", 3],
    ];
    const PAL = ["#f33b2f", "#e5a0aa", "#536a50", "#d7fb34", "#99c4e7", "#3658d8", "#203a8c", "#8ca58e", "#f05a47", "#f4e8c6", "#ffb427", "#6b2c59"];
    const GCOL = ["#d7fb34", "#99c4e7", "#f05a47", "#e5a0aa"];
    const NT = COLS * ROWS, r4 = rng(42);
    const order = [...Array(NT).keys()].sort(() => r4() - 0.5);
    const perm = [...Array(NT).keys()].sort(() => r4() - 0.5);
    // a wider screen than the cut needs more tiles; those repeat the works
    const tiles = order.map((_, i) => {
      const k = order.indexOf(i), wk = WORKS[i % WORKS.length];
      const base = PAL[Math.floor(r4() * PAL.length)];
      let c2 = PAL[Math.floor(r4() * PAL.length)]; if (c2 === base) c2 = PAL[(PAL.indexOf(base) + 5) % PAL.length];
      const d = el("div", grid, abs(0, 0, { width: TW + "px", height: TH + "px", overflow: "hidden", background: base }));
      const cd = 190 + r4() * 220;
      const circ = el("div", d, abs(r4() * TW - cd / 2, r4() * TH * 0.8 - cd / 2, { width: cd + "px", height: cd + "px", borderRadius: "50%", background: c2 }));
      const bar = el("div", d, abs(-80, 40 + r4() * 180, { width: "560px", height: (54 + r4() * 40) + "px", background: r4() < .7 ? "#f4efe4" : "#fff" }));
      const bs = 110 + r4() * 110;
      const blk = el("div", d, abs(TW * 0.45 + r4() * TW * 0.4 - bs / 2, r4() * TH * 0.6 - bs / 2, { width: bs + "px", height: bs + "px", background: INK }));
      const card = el("div", d, {}, "card"); card.innerHTML = `<b>${wk[0]}</b><i>${wk[1]}</i>`;
      return { d, circ, bar, blk, card, k, base, grp: wk[2], barR: -28 + r4() * 56, blkR: -30 + r4() * 60 };
    });
    const s4c = content(s4);
    const hl = el("div", s4c, abs(L4.hx, L4.hy, { width: "1500px", fontSize: L4.hFs + "px" }));
    const hboxes = ["ship", "tools", "in", "public."].map((w, i) => { if (i === 2) el("br", hl); const b = el("div", hl, {}, "hbox"); const s = el("span", b, { display: "inline-block" }); s.textContent = w; return { b, s }; });
    const CHIPS = ["73 public repos", "31★ better unity", "plethora of domains ;)", "private, local-first <3"];
    const chips = CHIPS.map((txt, i) => { const [x, y, r] = L4.chips[i]; const c = el("div", s4c, abs(x, y, { transformOrigin: "0% 50%" }), "ychip"); c.textContent = txt; return { c, r }; });
    const T_S4 = [unwarp(5.75), unwarp(7.5)];

    function r4s(t, T) {
      iris.style.clipPath = `circle(${lerp(0, Math.hypot(SW, SH) * 0.62, E.inOutCubic(P(t, 7.16, 7.42)))}px at ${OX + L5.c[0]}px ${OY + L5.c[1]}px)`;
      const cs = lerp(1.2, 1.0, E.outCubic(P(t, 5.75, 6.9))), pan = P(T, T_S4[0], T_S4[1]);
      const cx = lerp(L4.pan[0], -L4.pan[0], pan), cy = lerp(L4.pan[1], -L4.pan[1], pan);
      const shake = t > 6.9 && t < 7.2 ? Math.sin(t * 90) * 5 * (1 - P(t, 6.9, 7.2)) : 0;
      grid.style.transform = `translate(${cx + shake}px, ${cy}px) scale(${cs})`;
      const inv = ([x, y]) => [(x + OX - SW / 2 - cx) / cs + SW / 2, (y + OY - SH / 2 - cy) / cs + SH / 2];
      tiles.forEach((tl, i) => {
        let [x, y] = slotXY(tl.k);
        const dt = t - (5.78 + Math.hypot(x + TW / 2 - SW / 2, y + TH / 2 - SH / 2) / 1500 * 0.34), f = spr(dt, 12, 17);
        const e = E.inOutExpo(P(t, 6.9 + i * 0.004, 7.14 + i * 0.004));
        const [x2, y2] = slotXY(perm[tl.k]);
        x = lerp(x, x2, e); y = lerp(y, y2, e);
        let w = TW, hgt = TH, rad = 0, bg = tl.base;
        const scl = f * (1 - 0.14 * Math.sin(Math.PI * e)), inner = 1 - E.inOutCubic(P(t, 7.06, 7.2));
        // the tiles sort themselves into the four circles of the intersection
        const m = E.inOutExpo(P(t, 7.16 + (i % 6) * 0.01, 7.44 + (i % 6) * 0.01));
        if (m > 0) {
          const [tx, ty] = inv(VC[tl.grp]), dd = 2 * VR / cs;
          const ccx = lerp(x + TW / 2, tx, m), ccy = lerp(y + TH / 2, ty, m);
          w = lerp(TW, dd, m); hgt = lerp(TH, dd, m); x = ccx - w / 2; y = ccy - hgt / 2;
          rad = lerp(0, dd / 2, E.outCubic(m)); bg = mix(tl.base, GCOL[tl.grp], clamp(m * 1.6));
        }
        Object.assign(tl.d.style, { left: x + "px", top: y + "px", width: w + "px", height: hgt + "px", borderRadius: rad + "px", background: bg, transform: `scale(${scl})`, opacity: clamp(dt / 0.06) });
        tl.circ.style.transform = `scale(${E.outBack(P(dt, 0.04, 0.42))})`;
        tl.bar.style.transform = `translateX(${lerp(-620, 0, E.outExpo(P(dt, 0.02, 0.42)))}px) rotate(${tl.barR}deg)`;
        tl.blk.style.transform = `rotate(${tl.blkR + (1 - E.outExpo(P(dt, 0.06, 0.5))) * 120}deg) scale(${E.outExpo(P(dt, 0.06, 0.4))})`;
        const ce = E.outExpo(P(dt, 0.12, 0.45));
        tl.card.style.opacity = ce * inner; tl.circ.style.opacity = tl.bar.style.opacity = tl.blk.style.opacity = inner;
        tl.card.style.transform = `translateY(${(1 - ce) * 50}px)`;
      });
      hboxes.forEach(({ b, s }, i) => {
        const a = 5.98 + i * 0.125, e = E.outExpo(P(t, a, a + 0.22)), o = E.inExpo(P(t, 7.1 + i * 0.03, 7.26 + i * 0.03));
        b.style.clipPath = `inset(0 ${(1 - e) * 100}% 0 ${o * 100}%)`;
        s.style.transform = `translateX(${(1 - e) * -60}px)`;
      });
      chips.forEach(({ c, r }, i) => {
        const dt = t - (6.38 + i * 0.09), f = spr(dt, 14, 24), o = 1 - E.inExpo(P(t, 7.08, 7.22));
        c.style.opacity = dt > 0 ? o : 0;
        c.style.transform = `rotate(${r}deg) scale(${f * o})`;
        if (i === 0) c.textContent = `${Math.round(73 * E.outCubic(P(t, 6.38, 6.75)))} public repos`;
      });
    }

    // ─────────────────────────────────────── 05 intersection
    const s5 = scene(7.44, 8.53, PAPER);
    const s5cam = content(s5, { transformOrigin: "0 0" });
    const vsvg = sv("svg", s5cam, { width: DW, height: DH, style: "position:absolute;left:0;top:0;overflow:visible" });
    const defs = sv("defs", vsvg), clipId = "skv" + Math.random().toString(36).slice(2, 7);
    VC.forEach(([x, y], i) => { const cp = sv("clipPath", defs, { id: clipId + i }); sv("circle", cp, { cx: x, cy: y, r: VR }); });
    const vg = sv("g", vsvg);
    VC.forEach(([x, y], i) => sv("circle", vg, { cx: x, cy: y, r: VR, fill: GCOL[i], style: "mix-blend-mode:multiply" }));
    let cg = vg; for (let i = 0; i < 4; i++) cg = sv("g", cg, { "clip-path": `url(#${clipId}${i})` });
    const ydot = sv("circle", cg, { cx: L5.c[0], cy: L5.c[1], r: 0, fill: Y });
    const vstroke = VC.map(([x, y]) => sv("circle", vg, { cx: x, cy: y, r: VR, fill: "none", stroke: INK, "stroke-width": 3 }));
    const vlabels = [["xr", -248, -220], ["film", 248, -220], ["code", -248, 228], ["art", 248, 228]].map(([s, dx, dy]) => ({ s, tx: sv("text", vg, { x: L5.c[0] + dx, y: L5.c[1] + dy, "text-anchor": "middle", "dominant-baseline": "central", style: `font:700 34px ${MONO};fill:${INK}` }) }));
    const me = sv("text", vg, { x: L5.c[0], y: L5.c[1] + 4, "text-anchor": "middle", "dominant-baseline": "central", style: `font:700 46px ${SANS};letter-spacing:-0.06em;fill:#000` }); me.textContent = "satyam";
    const quote = el("div", s5cam, abs(0, L5.quoteY, { width: DW + "px", textAlign: "center", font: `400 ${L5.quoteFs}px/1.12 ${SERIF}`, color: INK, whiteSpace: "nowrap" }));
    const QW = "science is only fun if its intersectional!".split(" ");
    const qspans = QW.map((w, i) => { if (V && i === 4) el("br", quote); const s = el("span", quote, { display: "inline-block", marginRight: "0.25em" }); s.textContent = w; if (i === QW.length - 1) s.style.fontStyle = "italic"; return s; });
    const s5y = el("div", s5, { ...bleed, background: Y, opacity: 0 });
    const T_S5 = [unwarp(7.44), unwarp(8.5)];

    function r5(t, T) {
      s5.style.opacity = P(t, 7.44, 7.5);
      const pulse = t > 8.0 ? 1 + 0.035 * Math.exp(-(t - 8.0) * 9) : 1, [ccx, ccy] = L5.c;
      vg.setAttribute("transform", `rotate(${lerp(-5, 4, E.inOutCubic(P(T, T_S5[0], T_S5[1])))} ${ccx} ${ccy}) translate(${ccx} ${ccy}) scale(${pulse}) translate(${-ccx} ${-ccy})`);
      vstroke.forEach((c, i) => c.setAttribute("opacity", E.outCubic(P(t, 7.46 + i * 0.03, 7.6 + i * 0.03))));
      vlabels.forEach(({ tx, s }, i) => { tx.textContent = typed(s, t, 7.56 + i * 0.05, 7.66 + i * 0.05); });
      ydot.setAttribute("r", Math.max(0, 250 * spr(t - 7.86, 12, 18)));
      const mp = t - 7.98;
      me.setAttribute("opacity", (mp > 0 ? 1 : 0) * (1 - P(t, 8.2, 8.3)));
      me.setAttribute("transform", `translate(${ccx} ${ccy + 4}) scale(${mp > 0 ? spr(mp, 14, 24) : 0}) translate(${-ccx} ${-ccy - 4})`);
      qspans.forEach((s, i) => { const e = E.outExpo(P(t, 7.46 + i * 0.04, 7.82 + i * 0.04)); s.style.opacity = e; s.style.transform = `translateY(${(1 - e) * 40}px)`; });
      // dive into the yellow intersection
      const z = Math.pow(P(t, 8.16, 8.53), 4), S = Math.exp(z * Math.log(26)), c = E.inOutCubic(P(t, 8.16, 8.46));
      s5cam.style.transform = `translate(${lerp(ccx, DW / 2, c) - S * ccx}px, ${lerp(ccy, DH / 2, c) - S * ccy}px) scale(${S})`;
      s5y.style.opacity = P(t, 8.47, 8.52);
    }

    // ─────────────────────────────────────── 06 satyam.lol
    const L6 = V
      ? { fs: 250, x: 80, y: 740, urlFs: 76, urlY: 1160, linksY: 1278, linksFs: 22, tagY: 1432, tagFs: 22, side: [80, 510] }
      : { fs: 330, x: 150, y: 150, urlFs: 92, urlY: 716, linksY: 852, linksFs: 21, tagY: 904, tagFs: 26, side: [1196, 214] };
    const s6 = scene(8.5, 99, "#fff");
    const yfield = el("div", s6, { position: "absolute", top: "-40px", height: (SH + 80) + "px", background: Y });
    const vtxt6 = el("div", s6, abs(34, 0, { writingMode: "vertical-rl", font: `400 19px/1 ${SERIF}`, color: "#000", whiteSpace: "nowrap" }));
    vtxt6.textContent = VTXT;
    const s6cam = content(s6, { transformOrigin: "50% 50%" });
    const name6 = el("div", s6cam, abs(L6.x, L6.y, { font: `900 ${L6.fs}px/0.68 ${SANS}`, letterSpacing: "-0.09em", color: "#000", whiteSpace: "nowrap", transformOrigin: "0 0" }));
    const K1 = letters(el("div", name6), "satyam"), K2 = letters(el("div", name6), "kashyap");
    const url = el("div", s6cam, abs(L6.x, L6.urlY, { background: "#000", color: "#fff", font: `700 ${L6.urlFs}px/0.9 ${SANS}`, letterSpacing: "-0.055em", padding: "6px 24px 16px 16px", whiteSpace: "pre" }));
    url.textContent = "satyam.lol";
    const links = el("div", s6cam, abs(L6.x + 2, L6.linksY, { font: `400 ${L6.linksFs}px/1.7 ${MONO}`, color: "#000", whiteSpace: "pre" }));
    const LINKS = V ? "github.com/sudotman\nhello@satyam.lol\nletterboxd.com/satyamkashyap" : "github.com/sudotman   ·   hello@satyam.lol   ·   letterboxd.com/satyamkashyap";
    const tag6 = el("div", s6cam, abs(L6.x, L6.tagY, { font: `700 ${L6.tagFs}px/1.2 ${MONO}`, padding: `${L6.tagFs / 5.2}px ${L6.tagFs / 2.36}px`, background: Y, color: "#000", whiteSpace: "pre", transformOrigin: "0 50%" }));
    tag6.textContent = CHIP;
    const side = el("div", s6cam, abs(L6.side[0], L6.side[1], { color: "#000" }));
    el("div", side, { font: `italic 400 ${V ? 64 : 58}px/1 ${SERIF}`, whiteSpace: "nowrap" }).textContent = "perpetually curious.";
    el("div", side, { font: `700 18px/1.5 ${MONO}`, marginTop: "16px", whiteSpace: "pre" }).textContent = "lead xr dev  ·  filmmaker  ·  toolmaker\nhimalayas → mumbai";
    const T_S6 = unwarp(8.5);
    let land = null, landTried = false;

    // Web only: measure where the page's own name and subtitle sit, in stage units.
    function measureLanding() {
      landTried = true;
      const h1 = document.querySelector(".hyper-intro h1"), sub = document.querySelector(".hyper-subtitle");
      if (!h1 || !sub) return;
      const hr = h1.getBoundingClientRect(), sr = sub.getBoundingClientRect(), fs = parseFloat(getComputedStyle(h1).fontSize);
      if (!hr.width || hr.bottom < 0 || hr.top > o.vh) return;
      const cs6 = getComputedStyle(sub);
      land = {
        x: hr.left / sc - OX, y: hr.top / sc - OY, k: fs / sc / L6.fs,
        sub: { x: sr.left / sc - OX, y: sr.top / sc - OY, w: sr.width / sc, fs: parseFloat(cs6.fontSize) / sc, pad: `${parseFloat(cs6.paddingTop) / sc}px ${parseFloat(cs6.paddingLeft) / sc}px` },
      };
    }

    function r6(t, T) {
      const shake = t < 8.8 ? Math.exp(-(t - 8.5) * 12) * 16 : 0;
      const drift = WEB ? 1 : lerp(1, 1.018, P(T, T_S6, DUR));
      s6cam.style.transform = `translate(${Math.sin(t * 97) * shake}px, ${Math.cos(t * 83) * shake}px) scale(${drift})`;
      const rt = WEB ? E.inOutExpo(P(t, 9.1, 9.4)) : E.inOutExpo(P(t, 9.22, 9.52));
      const l = lerp(-40, STR[0], rt), r = lerp(SW + 40, STR[1], rt);
      yfield.style.left = l + "px"; yfield.style.width = (r - l) + "px";
      [...K1, ...K2].forEach((s, i) => { const dt = t - (8.5 + i * 0.018), e = E.outExpo(clamp(dt / 0.34)); s.style.opacity = clamp(dt / 0.04); s.style.transform = `scale(${lerp(2.3, 1, e)}) translateY(${(1 - e) * 30}px)`; });
      vtxt6.style.transform = `translateY(${-120 - T * 60}px)`;
      if (!WEB) {
        url.style.clipPath = `inset(0 ${(1 - E.outExpo(P(t, 8.76, 9.0))) * 100}% 0 0)`;
        links.textContent = typed(LINKS, t, 8.92, 9.2);
        const te = E.outExpo(P(t, 9.5, 9.72)); tag6.style.transform = `scaleX(${te})`; tag6.style.opacity = te > 0 ? 1 : 0;
        const se = E.outExpo(P(t, 9.4, 9.75)); side.style.opacity = se; side.style.transform = `translateY(${(1 - se) * 24}px)`;
        vtxt6.style.opacity = P(t, 9.45, 9.7) * 0.9;
        return 1;
      }
      // web: hold the end card, then set the name down exactly where the page keeps it
      url.style.display = links.style.display = "none";
      const se = E.outExpo(P(t, 8.72, 9.0)), gone = 1 - P(t, 9.1, 9.24);
      side.style.opacity = se * gone; side.style.transform = `translateY(${(1 - se) * 24}px)`;
      vtxt6.style.opacity = 0;
      if (t >= 9.05 && !landTried) measureLanding();
      if (!land) { tag6.style.opacity = 0; return 1 - P(t, 9.1, 9.4); }
      const f = E.inOutCubic(P(t, 9.1, 9.5));
      name6.style.transform = `translate(${(land.x - L6.x) * f}px, ${(land.y - L6.y) * f}px) scale(${lerp(1, land.k, f)})`;
      // the page's subtitle may wrap on a narrow screen; matching its width wraps this one the same way
      Object.assign(tag6.style, { left: land.sub.x + "px", top: land.sub.y + "px", width: land.sub.w + "px", whiteSpace: "normal", fontSize: land.sub.fs + "px", padding: land.sub.pad });
      const te = E.outExpo(P(t, 9.38, 9.52)); tag6.style.transform = `scaleX(${te})`; tag6.style.opacity = te > 0 ? 1 : 0;
      return 1 - E.inOutCubic(P(t, 9.5, 9.74));
    }

    // ─────────────────────────────────────── signature stripe, flash
    const stripe = el("div", stage, abs(STR[0], 0, { width: (STR[1] - STR[0]) + "px", height: SH + "px", background: Y }));
    const flash = el("div", stage, { ...bleed, background: "#fff", opacity: 0 });

    // ─────────────────────────────────────── timeline
    const RENDER = [r1, r2s, r3, r4s, r5, r6];
    let lastScene = -1;
    function seek(T) {
      const t = warp(T);
      let out = 1;
      scenes.forEach((s, i) => { const on = t >= s.a && t < s.b; if (s.on !== on) { s.s.style.display = on ? "block" : "none"; s.on = on; } if (on) { const v = RENDER[i](t, T); if (i === 5) out = v; lastScene = i; } });
      flash.style.opacity = t >= 5.75 ? 1 - P(t, 5.75, 5.86) : 0;
      let pk = 0; for (const b of [0.5, 2.0, 4.0, 6.0, 8.5]) if (t >= b) pk = Math.exp(-(t - b) * 16);
      stage.style.transform = `scale(${sc}) translate(${-pk * 0.007 * SW}px, ${-pk * 0.007 * SH}px) scale(${1 + pk * 0.014})`;
      return { t, fade: out };
    }

    // measure the chip and the [xr] label before anything moves
    s1.style.display = "block";
    const base = stage.getBoundingClientRect(), cr = chip.getBoundingClientRect(), xb = xrBox.getBoundingClientRect();
    chipR = { l: cr.left - base.left - OX, r: cr.right - base.left - OX, t: cr.top - base.top - OY, b: cr.bottom - base.top - OY };
    xrC = { x: xb.left - base.left - OX + xb.width / 2, y: xb.top - base.top - OY + xb.height / 2 };
    s1.style.display = "none";
    seek(0);
    // web: the stripe breathes with the soundtrack
    const level = v => { stripe.style.transform = v > 0.002 ? `scaleX(${1 + v})` : "none"; };
    return { seek, level, W: warp, R: unwarp, DUR, lastScene: () => lastScene };
  }

  window.SatyamReel = { create: createReel, DUR, RATE, BEAT, RAMP, FREEZE_VIDEO };

  // ─────────────────────────────────────────────────────────── the website overture
  const root = document.documentElement;
  if (!root.classList.contains("intro") || window.__introCancelled) return;
  window.__introStarted = true;

  // Browsers only let sound start from a gesture, so the reel begins silent (unless the
  // browser already allows it) and the first click or tap brings the soundtrack in like
  // tape spinning up, landing in sync; from then on the picture follows the audio clock.
  const SOUND = "/sounds/intro.mp3?v=20260927b";
  const TAPE = 0.35, TAPE_FROM = 0.35;

  function start() {
    const vw = root.clientWidth, vh = root.clientHeight;
    const body = document.body.getBoundingClientRect();
    const narrow = matchMedia("(max-width: 700px)").matches, coarse = matchMedia("(pointer: coarse)").matches;
    const stripe = narrow ? [body.right - 13, body.right - 8] : [body.right - 22, body.right - 16];
    const host = document.createElement("div");
    host.setAttribute("aria-hidden", "true");
    Object.assign(host.style, { position: "fixed", inset: "0", zIndex: "2147483001", overflow: "hidden", background: "#fff", cursor: "pointer", contain: "strict" });
    document.body.appendChild(host);
    let reel;
    try {
      reel = createReel(host, { orient: vw / vh < 1 ? "v" : "h", vw, vh, web: true, stripe });
    } catch (error) {
      host.remove(); root.classList.remove("intro"); console.error(error); return;
    }
    root.classList.add("intro-live");
    const hint = document.createElement("div");
    Object.assign(hint.style, { position: "absolute", right: narrow ? "22px" : "34px", bottom: "16px", font: `700 11px/1 ${MONO}`, letterSpacing: "0.06em", color: "#fff", mixBlendMode: "difference", pointerEvents: "none", transition: "opacity .3s", opacity: 0 });
    host.appendChild(hint);

    let T = 0, last = 0, raf = 0, leaving = 0, done = false;
    let buffer = null, noSound = !(window.AudioContext || window.webkitAudioContext), want = false, ctx = null, src = null, gain = null, meter = null, sound = null, lvl = 0;
    const setHint = () => {
      const offer = !want && !noSound;
      hint.textContent = coarse ? (offer ? "tap for sound · swipe to skip" : "tap to skip") : (offer ? "click for sound · any key to skip" : "any key to skip");
    };
    setHint();

    const startSound = () => {
      if (sound || !ctx || !buffer || done || leaving) return;
      const lat = ctx.outputLatency || ctx.baseLatency || 0.02, now = ctx.currentTime + 0.03;
      // start ahead by what the spin-up loses, so audio and picture meet as it reaches speed
      const offset = T + 0.03 + lat + TAPE * (1 - TAPE_FROM) / 2;
      src = ctx.createBufferSource(); src.buffer = buffer;
      gain = ctx.createGain(); meter = ctx.createAnalyser(); meter.fftSize = 1024;
      src.connect(gain); gain.connect(meter); meter.connect(ctx.destination);
      src.playbackRate.setValueAtTime(TAPE_FROM, now); src.playbackRate.linearRampToValueAtTime(1, now + TAPE);
      gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(1, now + 0.22);
      src.onended = () => { if (done) ctx.close().catch(() => {}); };
      src.start(now, offset);
      sound = { now, lat, offset };
    };
    // where the listener is in the soundtrack, once it has spun up
    const heard = () => sound.offset + TAPE * (1 + TAPE_FROM) / 2 + (ctx.currentTime - sound.lat - sound.now - TAPE);
    const locked = () => sound && ctx.currentTime - sound.lat - sound.now > TAPE;
    const enableSound = () => {
      if (want || noSound) return;
      want = true; setHint();
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: "interactive" });
        ctx.resume();
      } catch {
        noSound = true; setHint(); return;
      }
      startSound();
    };
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!noSound && OAC) {
      fetch(SOUND)
        .then(r => r.ok ? r.arrayBuffer() : Promise.reject(new Error(`${SOUND} returned ${r.status}`)))
        .then(data => new OAC(2, 48000, 48000).decodeAudioData(data))
        .then(b => { buffer = b; startSound(); })
        .catch(() => { noSound = true; setHint(); });
      if (navigator.getAutoplayPolicy?.("audiocontext") === "allowed") enableSound();
    } else noSound = true;

    const finish = () => {
      if (done) return; done = true;
      cancelAnimationFrame(raf); host.remove(); root.classList.remove("intro", "intro-live");
      removeEventListener("keydown", skip, true); removeEventListener("wheel", skip, true); removeEventListener("touchmove", skip, true);
      removeEventListener("click", onClick, true); removeEventListener("resize", onResize); document.removeEventListener("visibilitychange", onVisibility);
      if (ctx && !sound) ctx.close().catch(() => {});   // with sound, the last chord rings out over the page
    };
    const skip = () => {
      if (leaving || done) return;
      leaving = performance.now();
      if (gain) { const c = ctx.currentTime; gain.gain.cancelScheduledValues(c); gain.gain.setValueAtTime(gain.gain.value, c); gain.gain.linearRampToValueAtTime(0, c + 0.4); src.stop(c + 0.45); }
    };
    const onClick = () => { if (!want && !noSound) enableSound(); else skip(); };
    // A real resize (not a mobile toolbar sliding away) invalidates the layout.
    const onResize = () => { if (Math.abs(root.clientWidth - vw) > 40 || Math.abs(root.clientHeight - vh) > 160) skip(); };
    const onVisibility = () => { if (ctx) (document.hidden ? ctx.suspend() : ctx.resume()).catch(() => {}); };

    const wave = new Uint8Array(1024);
    const frame = now => {
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0; last = now;
      T = Math.min(DUR, locked() ? heard() : T + dt);
      const { fade } = reel.seek(T);
      hint.style.opacity = T > 0.6 && reel.lastScene() < 5 ? 0.75 : 0;
      if (meter) {
        meter.getByteTimeDomainData(wave);
        let e = 0; for (let i = 0; i < wave.length; i++) { const v = (wave[i] - 128) / 128; e += v * v; }
        const target = clamp(Math.sqrt(e / wave.length) * 4.5);
        lvl += (target - lvl) * (target > lvl ? 0.55 : 0.12);
      }
      const out = leaving ? 1 - clamp((now - leaving) / 320) : 1;
      reel.level(lvl * 1.3 * Math.min(fade, out));
      host.style.opacity = Math.min(fade, out);
      if (fade <= 0 || out <= 0 || T >= DUR) return finish();
      raf = requestAnimationFrame(frame);
    };
    addEventListener("keydown", skip, { capture: true });
    addEventListener("wheel", skip, { capture: true, passive: true });
    addEventListener("touchmove", skip, { capture: true, passive: true });
    addEventListener("click", onClick, { capture: true });
    addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibility);
    raf = requestAnimationFrame(frame);
  }
  if (document.body) start(); else document.addEventListener("DOMContentLoaded", start, { once: true });
})();

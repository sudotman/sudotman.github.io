"""Procedural, frame-synced soundtrack for the 15 s reel. 116 bpm, D minor -> D major.

This is the website's copy of the synth that made sounds/intro.mp3, extended to render stems.
scripts/soundtrack/render.py drives it; run that rather than this file. Everything placed is
routed into one of four stems — drums, bass, chords (the voice's pad, arpeggio and sparkle) and
effects (the sounds placed on the picture) — and each stem is mixed down through the same
reverb, gap duck and fade, all of which are linear. The stems therefore sum to the old mix, and
the one non-linear step, the master's soft clip, is applied by js/intro.js after its faders.

Sound effects are placed on the choreography clock and mapped through the same
warp as intro.js (keep RATE / RAMP / FREEZE in sync with it). Music is written
straight onto the wall-clock beat grid; because holds are whole beats, every
choreographed downbeat lands on a real one.
"""
import numpy as np, wave, sys, os

# `python3 audio.py` renders the video cut (reel.wav); `python3 audio.py web` renders the
# website's version (intro.wav): its own end-card timing and landing, and a second of tail
# so the last chord rings out over the page.
WEB = len(sys.argv) > 1 and sys.argv[1] == 'web'
SR = 48000
DUR = 16.0 if WEB else 15.0
N = int(SR * DUR)
rng = np.random.default_rng(3)

# ── the warp (mirror of makeWarp in intro.js)
RATE, RAMP = 29 / 30, 0.16
BEAT = 0.5 / RATE
FREEZE = [(1.49, 1), (3.78, 1), (4.84, 1), (5.2, 1), (5.57, 1), (6.88, 1), (8.13, 1), (9.02, 2) if WEB else (9.8, 2)]
_starts, _b = [], 0
for f, n in FREEZE:
    _starts.append(((f - RATE * RAMP / 2) / RATE + _b * BEAT, n * BEAT)); _b += n
def _bump(T):
    b = np.zeros_like(T)
    for s, Ln in _starts:
        p, x = Ln - RAMP, T - s
        up = (x > 0) & (x < RAMP); pl = (x >= RAMP) & (x < RAMP + p); dn = (x >= RAMP + p) & (x < Ln + RAMP)
        b[up] += (1 - np.cos(np.pi * x[up] / RAMP)) / 2; b[pl] += 1
        b[dn] += (1 + np.cos(np.pi * (x[dn] - RAMP - p) / RAMP)) / 2
    return b
STEP = 1 / 2000
_Tg = (np.arange(int(DUR / STEP) + 2) - 0.5) * STEP
_tab = np.concatenate([[0], np.cumsum(RATE * (1 - _bump(_Tg[1:])) * STEP)])
def R(t):  # choreography time -> wall clock (first time it is reached)
    return float(np.searchsorted(_tab, t) * STEP)
def RD(a, b): return R(b) - R(a)

# Each stem has its own dry bus, reverb send and music bus (gated / sidechained); stem() routes
# everything placed after it. Effects are placed last, in this file, after the arrangement.
STEMS = ('drums', 'bass', 'chords', 'effects')
BUS = {name: (np.zeros(N), np.zeros(N), np.zeros(N), np.zeros(N), np.zeros((2, N))) for name in STEMS}
def stem(name):
    global L, Rr, RL, RRv, MUS
    L, Rr, RL, RRv, MUS = BUS[name]
stem('effects')

def mtof(m): return 440.0 * 2 ** ((m - 69) / 12)
def tt(d): return np.arange(int(SR * d)) / SR

def putT(sig, T0, gain=1.0, pan=0.0, rev=0.0, bus=None):
    i = int(round(T0 * SR))
    if i >= N: return
    s = sig[: max(0, N - i)] * gain
    if i < 0: s = s[-i:]; i = 0
    gl, gr = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    if bus is not None:
        bus[0, i:i + len(s)] += s * gl; bus[1, i:i + len(s)] += s * gr; return
    L[i:i + len(s)] += s * gl; Rr[i:i + len(s)] += s * gr
    if rev: RL[i:i + len(s)] += s * gl * rev; RRv[i:i + len(s)] += s * gr * rev
def put(sig, t0, *a, **k): putT(sig, R(t0), *a, **k)   # placed on the choreography clock

def svf(x, fc, q=0.7, mode='bp'):
    fc = np.broadcast_to(np.asarray(fc, float), x.shape)
    f = 2 * np.sin(np.pi * np.clip(fc, 20, SR / 6) / SR)
    lo = bp = 0.0; out = np.empty_like(x); damp = 1 / q
    for n in range(len(x)):
        hi = x[n] - lo - damp * bp; bp += f[n] * hi; lo += f[n] * bp
        out[n] = bp if mode == 'bp' else lo if mode == 'lp' else hi
    return out

def fft_filter(x, lo=None, hi=None):
    X = np.fft.rfft(x); fr = np.fft.rfftfreq(len(x), 1 / SR); m = np.ones_like(fr)
    if lo: m *= 1 / (1 + (lo / np.maximum(fr, 1)) ** 4)
    if hi: m *= 1 / (1 + (fr / hi) ** 4)
    return np.fft.irfft(X * m, len(x))

noise = lambda d: rng.standard_normal(int(SR * d))

# ── instruments
def kick(big=False):
    d = 0.9 if big else 0.45; t = tt(d)
    f = (42 if big else 48) + 130 * np.exp(-t * 30)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * (3.2 if big else 7.5))
    click = fft_filter(noise(d), lo=2500) * np.exp(-t * 400) * 0.35
    return np.tanh((body + click) * (1.8 if big else 1.4))
def boom(d=1.6):
    t = tt(d); f = 55 * np.exp(-t * 0.6) + 8
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 2.2) * np.minimum(1, t * 200)
def snare(d=0.3):
    t = tt(d)
    return fft_filter(noise(d), lo=1200, hi=9000) * np.exp(-t * 22) * 0.8 + np.sin(2 * np.pi * 185 * t) * np.exp(-t * 30) * 0.6
def hat(open_=False):
    d = 0.25 if open_ else 0.05; t = tt(d)
    return fft_filter(noise(d), lo=7000) * np.exp(-t * (14 if open_ else 90))
def tick(f=3200, d=0.03):
    t = tt(d)
    return (fft_filter(noise(d), lo=2500) * 0.5 + np.sin(2 * np.pi * f * t)) * np.exp(-t * 320)
def blip(f, d=0.07):
    t = tt(d)
    return np.sign(np.sin(2 * np.pi * f * t)) * np.exp(-t * 38) * np.minimum(1, t * 3000) * 0.5
def pop(f0=900, f1=260, d=0.09):
    t = tt(d); f = f1 + (f0 - f1) * np.exp(-t * 60)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 42)
def whoosh(d, f0, f1, q=1.4, shape='swell'):
    t = tt(d); x = t / d; fc = f0 * (f1 / f0) ** x
    env = np.sin(np.pi * x) ** 1.5 if shape == 'swell' else x ** 2.2 * (1 - np.exp(-(1 - x) * 60))
    return svf(noise(d), fc, q) * env
def riser(d, f0=180, f1=1400):
    t = tt(d); x = t / d; f = f0 * (f1 / f0) ** (x ** 1.6)
    ph = 2 * np.pi * np.cumsum(f) / SR
    tone = (np.sin(ph) + 0.4 * np.sin(2.01 * ph) + 0.3 * np.sign(np.sin(ph * 0.5))) * 0.3
    return (tone + svf(noise(d), f * 3, 2.2) * 1.2) * x ** 2.4
def zap(d=0.14):
    t = tt(d); f = 60 + 3200 * np.exp(-t * 34)
    return (np.sin(2 * np.pi * np.cumsum(f) / SR) + fft_filter(noise(d), lo=3000) * 0.3 * (rng.random(len(t)) < 0.08)) * np.exp(-t * 12)
def clapper(d=0.5):
    t = tt(d)
    wood = sum(np.sin(2 * np.pi * f * t) * np.exp(-t * k) for f, k in [(820, 55), (1370, 70), (2330, 95), (420, 40)])
    return np.tanh((wood * 0.5 + fft_filter(noise(d), lo=900, hi=7000) * np.exp(-t * 60) * 2.2) * 1.6)
def chime(freqs, d=1.6, k=3.2):
    t = tt(d)
    return sum(np.sin(2 * np.pi * f * t) * np.exp(-t * k * (1 + i * 0.6)) / (1 + i) for i, f in enumerate(freqs)) * np.minimum(1, t * 800)
def crash(d=2.4):
    t = tt(d); return fft_filter(noise(d), lo=4200) * np.exp(-t * 2.0) * np.minimum(1, t * 900)
def pluck(f, d=0.22):
    t = tt(d); ph = 2 * np.pi * f * t
    return (np.sin(ph) + 0.35 * np.sin(2 * ph) + 0.12 * np.sin(3 * ph)) * np.exp(-t * 16) * np.minimum(1, t * 900)
def saw(f, t, det=0.0):
    ph = (f * (1 + det)) * t; return 2 * (ph - np.floor(ph + 0.5))

# ── the grid: section edges are whole beats on the wall clock
B2, B4, B6, B75, B8, B85 = (R(x) for x in (2.0, 4.0, 6.0, 7.5, 8.0, 8.5))
GAP = (R(3.89), R(4.0))
beats = [k * BEAT for k in range(int(DUR / BEAT) + 1)]
in_gap = lambda T: GAP[0] - 1e-3 <= T < GAP[1] - 1e-3
print('section beats', [round(x / BEAT, 3) for x in (B2, B4, B6, B75, B8, B85)])

CH = [(0.0, B2, [50, 53, 57, 60, 64]),        # Dm9
      (B2, B4, [46, 50, 53, 57, 60]),         # Bbmaj9
      (B4, B6, [43, 46, 50, 53, 57]),         # Gm9
      (B6, B75, [41, 45, 48, 52, 55]),        # Fmaj9
      (B75, B85, [45, 50, 52, 55, 59]),       # A7sus4 — the build
      (B85, DUR, [38, 50, 54, 57, 61, 64])]   # Dmaj9 — the lift
ROOT = [(0.0, B2, 38), (B2, B4, 34), (B4, B6, 31), (B6, B75, 29)]

tp = tt(DUR)

# ── the arrangement: the original reel. VOICE picks what plays the chords; drums, bass and effects
# draw from the shared generator in the same order whatever the voice, so they come out identical.
# (The video kit also has hyperpop and industrial arrangements; they are not stem-ready.)
VOICE = os.environ.get('VOICE', 'synth')
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'style_reel.py')).read())

# ── 01 front door
stem('effects')
put(whoosh(0.4, 7000, 900, 1.2), 0.0, 0.5, pan=0.4, rev=0.2)
put(boom(0.7), 0.0, 0.25)
for i in range(6): put(tick(2400 + i * 180), 0.21 + i * 0.032, 0.18, pan=-0.3 + 0.1 * i)
for i in range(7): put(tick(2000 + i * 160), 0.31 + i * 0.03, 0.18, pan=-0.3 + 0.1 * i)
put(whoosh(0.34, 1500, 5000, 1.8), 0.58, 0.28, pan=-0.2)
for i in range(26): put(tick(4200 + (i % 3) * 300, 0.02), 0.84 + i * 0.3 / 26, 0.1, pan=0.2 * ((i % 2) * 2 - 1))
put(pop(500, 140, 0.12), 1.02, 0.35)
for i in range(12): put(tick(1800, 0.02), 0.96 + i * 0.03, 0.07)
put(riser(RD(1.5, 2.0), 140, 2200), 1.5, 0.5, rev=0.3)
put(whoosh(RD(1.5, 2.0), 400, 9000, 1.6, 'rise'), 1.5, 0.5)

# ── 02 xr
put(boom(1.8), 2.0, 0.55); put(crash(1.2), 2.0, 0.07, rev=0.3)
for i in range(70):
    put(chime([2200 + rng.random() * 4400], 0.18, 26), 2.0 + rng.random() ** 1.6 * 0.95, 0.035, pan=rng.random() * 1.6 - 0.8, rev=0.6)
for b in [2.5, 3.0, 3.5]:
    put(blip(1760, 0.05), b, 0.22, pan=-0.3); put(blip(880, 0.08), b + 0.03, 0.18, pan=0.3)
    put(fft_filter(noise(0.08), lo=2000) * (rng.random(int(SR * 0.08)) < 0.15), b, 0.2)
for i in range(22): put(tick(3600, 0.015), 2.04 + i * 0.008, 0.06)
put(whoosh(1.0, 180, 700, 3.0), 2.92, 0.35, pan=-0.6, rev=0.3)
for i, f in enumerate([1318.5, 1568, 1975.5]): put(blip(f, 0.09), 3.48 + i * 0.05, 0.28, pan=-0.4 + 0.4 * i, rev=0.3)
put(pop(1200, 500, 0.08), 3.52, 0.3)
put(zap(0.16), 3.79, 0.55, rev=0.2)

# ── 03 film
put(boom(1.4), 4.0, 0.45); put(whoosh(0.5, 300, 2400, 1.0), 3.99, 0.4, rev=0.4)
T0, i = R(4.05), 0
while T0 < R(5.75):                                           # projector clatter, 24 fps
    putT(fft_filter(tick(900 + 300 * (i % 2), 0.02), hi=3000), T0, 0.07, pan=0.5); i += 1; T0 = R(4.05) + i / 24
for i in range(13): put(tick(3900, 0.02), 4.3 + i * 0.3 / 13, 0.09)
put(whoosh(0.3, 600, 6000, 1.2), 4.88, 0.6, pan=-0.6, rev=0.2)
put(whoosh(0.3, 600, 6000, 1.2), 5.31, 0.6, pan=0.6, rev=0.2)
d = RD(5.02, 5.33); t = tt(d)
put(np.sin(2 * np.pi * 740 * t) * np.sin(np.pi * t / d) * 0.1 + np.sin(2 * np.pi * 587 * t) * 0.06 * (np.floor(t * 11) % 2) * np.sin(np.pi * t / d), 5.02, 0.35, rev=0.5)
put(whoosh(0.16, 900, 3500, 1.5), 5.6, 0.3)
put(clapper(), 5.75, 0.9, rev=0.45)

# ── 04 tools
for i in range(20): put(pop(700 + rng.random() * 900, 220 + rng.random() * 200), 5.8 + i * 0.017, 0.18, pan=rng.random() * 1.4 - 0.7)
for i in range(4): put(snare(0.14) * 0.5 + pop(300, 90, 0.14), 5.98 + i * 0.125, 0.4, pan=-0.2 + 0.13 * i)
for i in range(4): put(pop(1500, 700, 0.07), 6.38 + i * 0.09, 0.3, pan=0.5 - 0.3 * i, rev=0.2)
for i in range(18): put(tick(2600 + rng.random() * 1500, 0.02), 6.9 + i * 0.014, 0.12, pan=rng.random() * 1.6 - 0.8)
put(whoosh(0.26, 3000, 800, 1.5), 6.9, 0.4)
put(whoosh(0.32, 4000, 300, 1.2), 7.14, 0.5, rev=0.4)

# ── 05 intersection
put(riser(RD(7.5, 8.5), 220, 1800), 7.5, 0.38, rev=0.4)
for i in range(4): put(tick(3000, 0.02), 7.56 + i * 0.05, 0.12)
put(chime([1760, 2217, 2637, 3520], 1.4, 3.0), 7.86, 0.22, rev=0.7)
put(pop(1000, 400, 0.1), 7.98, 0.32)
put(whoosh(RD(8.14, 8.52), 300, 12000, 1.4, 'rise'), 8.14, 0.55)

# ── 06 satyam.lol
put(kick(big=True), 8.5, 0.95); put(boom(1.5), 8.5, 0.6); put(crash(2.8), 8.5, 0.16, rev=0.4)
for i in range(13): put(pop(400, 120, 0.08), 8.5 + i * 0.018 + 0.05, 0.1)
if not WEB:
    put(whoosh(0.22, 2000, 6000, 1.5), 8.76, 0.25)
    for i in range(30): put(tick(4400 + (i % 4) * 200, 0.015), 8.92 + i * 0.28 / 30, 0.07, pan=0.3)
    put(whoosh(0.32, 900, 5000, 1.3), 9.2, 0.35, pan=0.6, rev=0.3)
    put(tick(5200, 0.05), 9.5, 0.4, pan=0.8, rev=0.5); put(pop(260, 80, 0.2), 9.5, 0.4)
    put(chime([mtof(86), mtof(90), mtof(93)], 1.2, 2.2), 9.52, 0.08, rev=0.8)
    for i in range(8): put(tick(3800, 0.015), 9.5 + i * 0.22 / 8, 0.05)
else:
    put(whoosh(0.3, 1500, 4200, 1.4), 8.72, 0.18, pan=0.4, rev=0.3)              # "perpetually curious." rises
    put(whoosh(0.32, 900, 5000, 1.3), 9.1, 0.35, pan=0.6, rev=0.3)               # the yellow folds into the stripe
    d = RD(9.1, 9.5); t = tt(d); f = 700 * (260 / 700) ** (t / d)                 # the name glides down to the page
    put(np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * t / d) ** 2, 9.1, 0.1, rev=0.5)
    put(tick(4600, 0.03), 9.38, 0.2, pan=-0.2)                                    # the subtitle wipes on
    put(tick(5200, 0.04), 9.4, 0.25, pan=0.8, rev=0.4)                            # the yellow lands in the stripe
    put(pop(300, 90, 0.18), 9.5, 0.45); put(kick(), 9.5, 0.28)                    # and the name sets down, on the beat
    put(chime([mtof(86), mtof(90), mtof(93), mtof(98)], 1.8, 1.7), 9.5, 0.1, rev=0.9)

# ── mix
ir_t = tt(1.4); IRS = []
for ch in range(2):
    ir = rng.standard_normal(len(ir_t)) * np.exp(-ir_t * 3.6); ir = fft_filter(ir, lo=250, hi=7000); IRS.append(ir / np.sqrt(np.sum(ir ** 2)))
def mixdown(name):
    L, Rr, RL, RRv, MUS = BUS[name]
    out = np.stack([L, Rr]) + MUS
    for ch, send in enumerate([RL + MUS[0] * 0.25, RRv + MUS[1] * 0.25]):
        n = len(send) + len(IRS[ch]); out[ch] += np.fft.irfft(np.fft.rfft(send, n) * np.fft.rfft(IRS[ch], n), n)[:N] * 0.35
    out[:, (tp >= GAP[0]) & (tp < GAP[1] - 0.005)] *= 0.25
    out *= np.clip((DUR - tp) / 0.45, 0, 1) ** 1.5
    return out

OUT = os.environ.get('STEMS_OUT')
if OUT:                                       # the stems, unclipped, for render.py
    os.makedirs(OUT, exist_ok=True)
    for name in STEMS: np.save(os.path.join(OUT, name + '.npy'), mixdown(name).astype(np.float32))
    print('wrote stems', VOICE, OUT)
else:                                         # the old single mix, kept to check the stems against it
    out = sum(mixdown(name) for name in STEMS)
    out = np.tanh(out * 0.85)
    out /= np.max(np.abs(out)) / 0.89
    path = 'intro' + ('' if VOICE == 'synth' else '-' + VOICE) + '.wav'
    with wave.open(path, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((out.T * 32767).astype('<i2').tobytes())
    print('wrote', path, out.shape)

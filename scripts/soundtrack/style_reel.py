"""The original arrangement: detuned-saw pads, plucked arpeggio, four-on-the-floor. VOICE swaps the pad and arp."""

# ── voices: the chords, the arpeggio and the closing sparkle. VOICE=synth|rhodes|mallets|sitar|strings.
# Drums, bass and effects are shared; each voice is level-matched to the synth it replaces.
VOICE = os.environ.get('VOICE', 'synth')
vrng = np.random.default_rng(11)      # voices draw their own randomness, so every effect stays identical

def ks(f, d, loss=0.996, bright=0.5):
    """Karplus–Strong plucked string, tuned exactly: synthesised where the loop is a whole number of samples."""
    n = max(2, int(round(SR / f))); sr2 = f * n; L = int(sr2 * d) + 2 * n
    y = np.zeros(L); x = vrng.uniform(-1, 1, n)
    for _ in range(int((1 - bright) * 5)): x = 0.5 * (x + np.roll(x, 1))
    y[:n] = x - x.mean()
    for k in range(1, L // n):
        blk = y[(k - 1) * n:k * n]; prev = y[(k - 1) * n - 1] if k > 1 else 0.0
        y[k * n:(k + 1) * n] = loss * 0.5 * (blk + np.concatenate(([prev], blk[:-1])))
    out = np.interp(np.arange(int(SR * d)) / SR * sr2, np.arange(L), y)
    return out * np.minimum(1, np.arange(len(out)) / 24)
def rhodes(f, d=1.6, vel=0.8):                     # two-operator FM, the DX7 electric piano
    t = tt(d); idx = (1.6 * vel + 0.4) * np.exp(-t * 5) + 0.3
    body = np.sin(2 * np.pi * f * t + idx * np.sin(2 * np.pi * f * t))
    bark = np.sin(2 * np.pi * 15.8 * f * t) * np.exp(-t * 55) * 0.12 * vel
    return (body + bark) * np.exp(-t * (1.1 + f / 900)) * np.minimum(1, t * 600)
def marimba(f, d=0.9):                             # modal: the bar's three inharmonic partials
    t = tt(d)
    s = (np.sin(2 * np.pi * f * t) * np.exp(-t * (6 + f / 300)) + 0.35 * np.sin(2 * np.pi * 3.93 * f * t) * np.exp(-t * (24 + f / 80))
         + 0.12 * np.sin(2 * np.pi * 9.24 * f * t) * np.exp(-t * 60))
    return s * np.minimum(1, t * 3000)
def vibes(f, d=2.4):
    t = tt(d)
    s = np.sin(2 * np.pi * f * t) + 0.25 * np.sin(2 * np.pi * 4.0 * f * t) * np.exp(-t * 8) + 0.08 * np.sin(2 * np.pi * 10 * f * t) * np.exp(-t * 30)
    return s * np.exp(-t * 1.2) * (1 + 0.35 * np.sin(2 * np.pi * 5.5 * t)) * np.minimum(1, t * 1500)
def jawari(y): return 0.55 * y + 0.45 * np.tanh(3.2 * y)   # the buzzing bridge of a sitar or tanpura
def sitar(f, d=1.5): return jawari(ks(f, d, loss=0.998, bright=0.85)) * np.exp(-tt(d) * 1.2)
def pizz(f, d=0.5): return ks(f, d, loss=0.99, bright=0.35) * np.exp(-tt(d) * 5)

def pad_synth():
    pad = np.zeros((2, N))
    for a, b, notes in CH:
        i0, i1 = int(a * SR), int(b * SR); seg = tp[i0:i1] - a
        env = np.minimum(1, seg / 0.04) * np.minimum(1, (b - a - seg) / 0.04 + (1 if b >= DUR else 0))
        if a == B85: env = np.exp(-seg * 0.75) * np.minimum(1, seg / 0.01)
        for m in notes:
            f = mtof(m + 12)
            pad[0, i0:i1] += (saw(f, seg, -0.004) + saw(f, seg, 0.003)) * env
            pad[1, i0:i1] += (saw(f, seg, 0.004) + saw(f, seg, -0.002)) * env
    pad[0] = fft_filter(pad[0], lo=160, hi=2400); pad[1] = fft_filter(pad[1], lo=160, hi=2400)
    return pad * 0.042
def pad_struck(note, every=2, tremolo=0.0):        # chords struck on the grid, strummed a touch
    pad = np.zeros((2, N))
    for a, b, notes in CH:
        final = a == B85; T0 = a
        while T0 < b - 1e-6:
            if not in_gap(T0):
                for j, m in enumerate(n for n in notes if n + 12 >= 48):
                    putT(note(mtof(m + 12), 2.8 if final else 1.6), T0 + j * 0.012, 1.0, pan=-0.3 + 0.15 * j, bus=pad)
            if final: break
            T0 += every * BEAT
    if tremolo:
        lfo = np.sin(2 * np.pi * tremolo * tp); pad[0] *= 1 + 0.3 * lfo; pad[1] *= 1 - 0.3 * lfo
    return pad
def pad_strings():                                 # a string machine: three detuned, drifting saws per note
    pad = np.zeros((2, N))
    for a, b, notes in CH:
        i0, i1 = int(a * SR), int(b * SR); seg = tp[i0:i1] - a
        env = np.minimum(1, seg / 0.22) * np.minimum(1, (b - a - seg) / 0.12 + (1 if b >= DUR else 0))
        if a == B85: env = np.exp(-seg * 0.6) * np.minimum(1, seg / 0.12)
        for m in notes:
            f = mtof(m + 12)
            for rate, ph, pan in [(0.63, 0.0, -0.6), (0.87, 2.1, 0.0), (1.13, 4.2, 0.6)]:
                w = np.cumsum(f * (1 + 0.0035 * np.sin(2 * np.pi * rate * seg + ph + m))) / SR
                w = 2 * (w - np.floor(w + 0.5)) * env
                pad[0, i0:i1] += w * (1 - pan) / 2; pad[1, i0:i1] += w * (1 + pan) / 2
    pad[0] = fft_filter(pad[0], lo=250, hi=3200); pad[1] = fft_filter(pad[1], lo=250, hi=3200)
    return pad
def pad_tanpura():                                 # the drone: Pa, Sa, Sa, low Sa — one string a beat, all the way through
    pad = np.zeros((2, N)); k = 0
    while k * BEAT < DUR - 0.3:
        m = [45, 50, 50, 38][k % 4]
        putT(jawari(ks(mtof(m), 4.5, loss=0.9995, bright=0.4)), k * BEAT, 1.0, pan=[-0.3, 0.2, 0.35, -0.1][k % 4], bus=pad); k += 1
    return pad

pat = [0, 2, 4, 3, 1, 3, 2, 4]
def arp(note, step, octave, into):
    for a, b, notes in CH[:4]:
        k = 0; T0 = max(a, 2 * BEAT)
        while T0 < b - 1e-6:
            if not in_gap(T0):
                putT(note(mtof(notes[pat[k % 8] % len(notes)] + octave)), T0, 0.07 if T0 < B2 else 0.1, pan=0.5 if k % 2 else -0.5, bus=into)
            k += 1; T0 = max(a, 2 * BEAT) + k * step
VOICES = {  # pad, arp note, arp step (beats), arp octave, sparkle shift, pad trim, arp trim
    'synth':   (pad_synth,                                   pluck,                                   0.25, 24, 0,   1.0,  1.0),
    'rhodes':  (lambda: pad_struck(rhodes, 2, tremolo=4.5),  lambda f: rhodes(f, 0.9, 0.55),          0.5,  12, -12, 1.0,  0.85),
    'mallets': (lambda: pad_struck(vibes, 2),                marimba,                                 0.25, 24, 0,   0.8,  0.9),
    'sitar':   (pad_tanpura,                                 sitar,                                   0.5,  12, -12, 0.8,  1.0),
    'strings': (pad_strings,                                 pizz,                                    0.25, 12, -12, 1.0,  0.9),
}
padF, noteF, step, octave, shift, padTrim, arpTrim = VOICES[VOICE]
stem('chords')
active = (tp >= 2 * BEAT) & (tp < B75)
rms = lambda x: np.sqrt(np.mean(x[:, active] ** 2)) + 1e-12
padRef = pad_synth(); arpRef = np.zeros((2, N)); arp(pluck, 0.25 * BEAT, 24, arpRef)
padL = padRef if VOICE == 'synth' else padF(); arpL = arpRef if VOICE == 'synth' else np.zeros((2, N))
if VOICE != 'synth': arp(noteF, step * BEAT, octave, arpL)
padGain = rms(padRef) / rms(padL) * padTrim; arpGain = rms(arpRef) / rms(arpL) * arpTrim
MUS += padL * padGain + arpL * arpGain

stem('bass')
for a, b, m in ROOT:                                           # bass, 8ths on the root
    k = 0; T0 = a
    while T0 < b - 1e-6:
        if not in_gap(T0):
            d = BEAT / 2 * 0.96; t = tt(d); f = mtof(m)
            s = (saw(f, t) * 0.6 + np.sin(2 * np.pi * f * t)) * np.exp(-t * 7) * np.minimum(1, t * 400)
            putT(fft_filter(s, hi=380 + 500 * (k % 2 == 0)), T0, 0.27 if a >= B2 else 0.18, bus=MUS)
        k += 1; T0 = a + k * BEAT / 2
t = tt(2.2); putT(np.sin(2 * np.pi * mtof(38) * t) * np.exp(-t * 1.2), B85, 0.5, bus=MUS)

stem('chords')
for k, m in enumerate([74, 78, 81, 85, 88, 90]):              # final sparkle, slowing down
    sp = pluck(mtof(m), 0.6) if VOICE == 'synth' else noteF(mtof(m + shift)) * arpGain / 0.1 * 0.1
    putT(sp, B85 + 0.1 * k + 0.014 * k * k, 0.1, pan=-0.6 + 0.24 * k, rev=0.5)
print('voice', VOICE, 'pad gain', round(padGain, 3), 'arp gain', round(arpGain, 3))

kicks = [T for T in beats if T < B75 - 1e-3 and not in_gap(T)]
sc = np.ones(N)
for k in kicks + [B8, B85]:
    i = int(k * SR); seg = tt(0.45); sc[i:i + len(seg)] = np.minimum(sc[i:i + len(seg)], 1 - 0.7 * np.exp(-seg * 9))
gate = np.ones(N); gi0, gi1 = int(GAP[0] * SR), int(GAP[1] * SR)
gate[gi0:gi1] = 0; gate[gi0 - 240:gi0] = np.linspace(1, 0, 240)
for name in ('chords', 'bass'): BUS[name][4][:] *= sc * gate   # the music bus, ducked and gated

# ── drums
stem('drums')
for T0 in kicks:
    big = any(abs(T0 - x) < 1e-3 for x in (B2, B4, B6))
    putT(kick(big), T0, 0.75 if big else 0.6)
putT(kick(), B8, 0.35)
for T0 in beats:
    k = round(T0 / BEAT)
    if B2 < T0 < B75 - 1e-3 and k % 2 == 0 and not in_gap(T0) and abs(T0 - B4) > 1e-3 and abs(T0 - B6) > 1e-3:
        putT(snare(), T0, 0.26, rev=0.4)
k = 4
while k * BEAT / 2 < B75 - 1e-3:
    T0 = k * BEAT / 2
    if k % 2 and not in_gap(T0): putT(hat(open_=T0 >= B2), T0, 0.08, pan=0.3)
    k += 1
k = int(B2 / (BEAT / 4) + 0.5)
while k * BEAT / 4 < B75 - 1e-3:
    T0 = k * BEAT / 4
    if not in_gap(T0): putT(hat(), T0, 0.025 + 0.02 * (k % 2), pan=-0.3)
    k += 1
T0 = B85 - 1.0                                                # snare roll into the drop
while T0 < B85 - 0.01:
    x = (T0 - (B85 - 1.0)) / 1.0; putT(snare(0.12), T0, 0.05 + 0.2 * x ** 1.5, rev=0.3); T0 += BEAT / 4 * (1 - 0.75 * x)


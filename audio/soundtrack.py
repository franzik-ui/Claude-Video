"""
Original procedural soundtrack + sound design for "The Dot" (PAYBACK AI Enablement).
Everything is synthesised from scratch (no samples, no third-party music), so it is
free to use internally. Event times mirror src/film.js.

Output: audio/soundtrack.wav (48 kHz, stereo, 32-bit PCM)
"""
import numpy as np
from scipy import signal
from scipy.io import wavfile
import os

SR = 48000
DUR = 29.0
N = int(SR * DUR)
rng = np.random.default_rng(1234)

music = np.zeros((N, 2))
sfx = np.zeros((N, 2))
verb_send = np.zeros((N, 2))
duck = np.ones(N)  # sidechain envelope applied to pads/bass


def jit(i):  # identical to film.js
    return np.sin(i * 12.9898) * 0.012


def note(name):
    names = {'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11}
    n, o = name[:-1], int(name[-1])
    return 440.0 * 2 ** ((names[n] + 12 * (o + 1) - 69) / 12)


def place(buf, x, t, gain=1.0, pan=0.0, send=0.0):
    i = int(round(t * SR))
    if i >= N:
        return
    if i < 0:
        x = x[-i:]; i = 0
    x = x[:N - i]
    l = np.cos((pan + 1) * np.pi / 4) * np.sqrt(2)
    r = np.sin((pan + 1) * np.pi / 4) * np.sqrt(2)
    buf[i:i + len(x), 0] += x * gain * l
    buf[i:i + len(x), 1] += x * gain * r
    if send:
        verb_send[i:i + len(x), 0] += x * gain * send * l
        verb_send[i:i + len(x), 1] += x * gain * send * r


def tt(d):
    return np.arange(int(d * SR)) / SR


def env_ad(d, a, dec):
    t = tt(d)
    e = np.minimum(1, t / max(a, 1e-4)) * np.exp(-np.maximum(0, t - a) / dec)
    return e


def lp(x, fc, order=2):
    b, a = signal.butter(order, min(fc, SR / 2 * 0.95) / (SR / 2), 'low')
    return signal.lfilter(b, a, x)


def hp(x, fc, order=2):
    b, a = signal.butter(order, fc / (SR / 2), 'high')
    return signal.lfilter(b, a, x)


def bp(x, lo, hi, order=2):
    b, a = signal.butter(order, [lo / (SR / 2), min(hi, SR / 2 * 0.95) / (SR / 2)], 'band')
    return signal.lfilter(b, a, x)


def sweep_filter(x, f0, f1, q=2.0, curve=1.0):
    """state-variable bandpass with an exponential cutoff sweep"""
    n = len(x)
    f = f0 * (f1 / f0) ** (np.linspace(0, 1, n) ** curve)
    g = 2 * np.sin(np.pi * np.minimum(f, SR / 6) / SR)
    lo = bd = 0.0
    out = np.empty(n)
    damp = 1 / q
    for i in range(n):
        hi_ = x[i] - lo - damp * bd
        bd += g[i] * hi_
        lo += g[i] * bd
        out[i] = bd
    return out


# ---------------------------------------------------------------- instruments
def kick(d=0.45, punch=1.0):
    t = tt(d)
    f = 45 + 110 * np.exp(-t * 28)
    ph = 2 * np.pi * np.cumsum(f) / SR
    x = np.sin(ph) * np.exp(-t * 7.5)
    click = hp(rng.standard_normal(len(t)), 2500) * np.exp(-t * 400) * 0.25
    return np.tanh((x + click) * 1.6 * punch)


def clap(d=0.3):
    t = tt(d)
    n = rng.standard_normal(len(t))
    e = np.zeros(len(t))
    for k, o in enumerate([0, 0.011, 0.022]):
        e += (t >= o) * np.exp(-np.maximum(0, t - o) * (180 if k < 2 else 22))
    return bp(n, 900, 5000) * e * 0.8


def hat(d=0.05, open_=False):
    t = tt(0.35 if open_ else d)
    x = hp(rng.standard_normal(len(t)), 7000)
    return x * np.exp(-t * (12 if open_ else 90)) * 0.5


def snare(d=0.22):
    t = tt(d)
    body = np.sin(2 * np.pi * 190 * t) * np.exp(-t * 30) * 0.5
    nz = bp(rng.standard_normal(len(t)), 1500, 9000) * np.exp(-t * 18)
    return body + nz * 0.7


def additive(freq, d, harmonics=12, bright=1.0, decay=1.0, attack=0.004, detune=0.0):
    t = tt(d)
    x = np.zeros(len(t))
    for h in range(1, harmonics + 1):
        fh = freq * h * (1 + detune * (h % 3 - 1) * 0.001)
        if fh > SR * 0.45:
            break
        amp = (1 / h) ** (1.2 / bright)
        dec = decay / (1 + (h - 1) * 0.35)
        x += amp * np.sin(2 * np.pi * fh * t + h) * np.exp(-t / dec)
    return x * np.minimum(1, t / attack)


def pluck(freq, d=0.6, bright=1.0):
    return additive(freq, d, 14, bright, decay=0.22) * 0.5


def marimba(freq, d=1.0):
    t = tt(d)
    x = np.sin(2 * np.pi * freq * t) * np.exp(-t * 4) + 0.35 * np.sin(2 * np.pi * freq * 4 * t) * np.exp(-t * 16)
    x += 0.12 * np.sin(2 * np.pi * freq * 9.2 * t) * np.exp(-t * 40)
    return x * np.minimum(1, t / 0.002)


def bell(freq, d=1.2):
    t = tt(d)
    ratios = [(1, 1, 2.2), (2.76, 0.4, 5), (5.4, 0.2, 8), (8.93, 0.1, 12)]
    x = sum(a * np.sin(2 * np.pi * freq * r * t) * np.exp(-t * k) for r, a, k in ratios)
    return x * np.minimum(1, t / 0.002)


def pad(freqs, d, attack=0.35, release=0.6, cutoff=2400):
    t = tt(d)
    x = np.zeros(len(t))
    for f in freqs:
        for det in (-0.07, 0.0, 0.08):
            ff = f * 2 ** (det / 12)
            for h in range(1, 10):
                if ff * h > cutoff * 1.5:
                    break
                x += (1 / h) * np.sin(2 * np.pi * ff * h * t + rng.uniform(0, 6.28)) * (1 / (1 + (ff * h / cutoff) ** 2))
    e = np.minimum(1, t / attack) * np.minimum(1, (d - t) / release)
    return x * e / (len(freqs) * 3)


def bass(freq, d, drive=1.2):
    t = tt(d)
    x = np.sin(2 * np.pi * freq * t) + 0.3 * np.sin(2 * np.pi * freq * 2 * t) + 0.12 * np.sin(2 * np.pi * freq * 3 * t)
    e = np.minimum(1, t / 0.006) * np.minimum(1, (d - t) / 0.03) * np.exp(-t * 1.2)
    return np.tanh(x * e * drive) * 0.6


def noise_whoosh(d, f0, f1, q=1.4, curve=1.0, shape='bell'):
    t = tt(d)
    x = sweep_filter(rng.standard_normal(len(t)), f0, f1, q, curve)
    if shape == 'bell':
        e = np.sin(np.pi * t / d) ** 2
    elif shape == 'rise':
        e = (t / d) ** 2.2
    else:
        e = (1 - t / d) ** 2
    return x * e * 0.5


def pop(f0=500, f1=1400, d=0.09):
    t = tt(d)
    f = f0 + (f1 - f0) * (1 - np.exp(-t * 60))
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 45)


def click(bright=1.0):
    t = tt(0.03)
    x = bp(rng.standard_normal(len(t)), 1800 * bright, 7000) * np.exp(-t * 320)
    x += np.sin(2 * np.pi * 180 * t) * np.exp(-t * 150) * 0.35
    return x


def crash(d=2.2):
    t = tt(d)
    x = hp(rng.standard_normal(len(t)), 4000) * np.exp(-t * 1.9)
    x += hp(rng.standard_normal(len(t)), 9000) * np.exp(-t * 3.5) * 0.5
    return x * 0.35


def sub_boom(d=1.6, f=42):
    t = tt(d)
    fr = f + 30 * np.exp(-t * 8)
    return np.sin(2 * np.pi * np.cumsum(fr) / SR) * np.exp(-t * 2.4) * np.minimum(1, t / 0.005)


# ---------------------------------------------------------------- harmony
CH = {
    'D': ['D3', 'A3', 'D4', 'F#4', 'E5'],
    'Bm': ['B2', 'F#3', 'B3', 'D4', 'A4'],
    'G': ['G2', 'D3', 'B3', 'D4', 'F#4'],
    'A': ['A2', 'E3', 'A3', 'C#4', 'E4'],
}
ROOT = {'D': 'D2', 'Bm': 'B1', 'G': 'G1', 'A': 'A1'}
BEAT = 0.5


def chord_f(c):
    return [note(n) for n in CH[c]]


# -------------------------------------------------- 0–3 s: intro / hook
# soft room-tone pad
place(music, pad([note('D3'), note('A3'), note('E4')], 3.2, attack=1.2, release=0.6, cutoff=900), 0.0, 0.35, send=0.4)
HOOK = 'AI sounds interesting'
for i, ch in enumerate(HOOK):
    t = 0.25 + i * 0.056 + jit(i)
    place(sfx, click(0.7 if ch == ' ' else 1.0 + 0.2 * np.sin(i * 3.1)), t, 0.8, pan=-0.15 + 0.3 * ((i * 7) % 5) / 5)
place(sfx, pop(700, 1500, 0.08), 1.75, 0.5, send=0.3)
# the dot inflates: riser into Pointee
place(sfx, noise_whoosh(0.85, 300, 5000, 1.2, 1.6, 'rise'), 2.0, 0.55, send=0.3)
t_r = tt(0.85)
place(sfx, np.sin(2 * np.pi * np.cumsum(220 * 2 ** (t_r * 2.4)) / SR) * (t_r / 0.85) ** 2 * 0.18, 2.0, 1.0)
# Pointee pops out
place(sfx, pop(260, 900, 0.18), 2.8, 0.9, send=0.3)
place(sfx, bell(note('D6'), 1.0), 2.8, 0.18, pan=0.2, send=0.5)

# -------------------------------------------------- drums & bass arrangement
def drums(start, end, style):
    t = start
    b = 0
    while t < end - 1e-6:
        pos = b % 4
        if style == 'A':            # light half-time groove
            if pos == 0:
                place(music, kick(), t, 0.8)
                duck_at(t, 0.45)
            if pos == 2:
                place(music, clap(), t, 0.35, send=0.25)
            place(music, hat(), t + BEAT / 2, 0.22, pan=0.3)
            if b % 2 == 1:
                place(music, hat(), t, 0.12, pan=-0.3)
        elif style == 'B':          # building: kick on every beat, 16th hats
            place(music, kick(0.35, 0.9), t, 0.7)
            duck_at(t, 0.4)
            for s in range(4):
                place(music, hat(0.03), t + s * BEAT / 4, 0.1 + 0.08 * (s == 2), pan=0.35)
            if pos in (1, 3):
                place(music, clap(), t, 0.3, send=0.2)
        elif style == 'C':          # drop
            place(music, kick(0.45, 1.25), t, 1.0)
            duck_at(t, 0.65)
            place(music, hat(open_=True), t + BEAT / 2, 0.18, pan=0.25)
            place(music, hat(0.03), t + BEAT / 4, 0.1, pan=-0.35)
            place(music, hat(0.03), t + 3 * BEAT / 4, 0.1, pan=-0.35)
            if pos in (1, 3):
                place(music, clap(), t, 0.5, send=0.3)
                place(music, snare(), t, 0.25)
        elif style == 'D':          # outro: gentle
            if pos == 0:
                place(music, kick(0.4, 0.8), t, 0.6)
                duck_at(t, 0.35)
            place(music, hat(), t + BEAT / 2, 0.14, pan=0.3)
        t += BEAT
        b += 1


def duck_at(t, depth):
    i = int(t * SR)
    d = tt(0.32)
    e = 1 - depth * np.exp(-d * 9)
    j = min(N, i + len(e))
    duck[i:j] = np.minimum(duck[i:j], e[:j - i])


drums(3.0, 11.0, 'A')
drums(11.0, 14.0, 'B')
drums(15.0, 20.5, 'C')
drums(21.0, 23.5, 'D')

# snare roll + riser into the drop
for k in range(16):
    tk = 14.0 + k * (1.0 / 16)
    place(music, snare(0.12), tk, 0.08 + 0.3 * (k / 16) ** 2, pan=0.1, send=0.2)
place(sfx, noise_whoosh(1.0, 400, 9000, 1.3, 1.5, 'rise'), 14.0, 0.6, send=0.3)

# chords / bass per bar
SECTIONS = [
    # (start, chord, bars_len_seconds, pad_gain, stab_pattern)
    (3.0, 'D', 2.0, 0.55, 'A'), (5.0, 'Bm', 2.0, 0.55, 'A'), (7.0, 'G', 2.0, 0.6, 'A'), (9.0, 'A', 2.0, 0.6, 'A'),
    (11.0, 'Bm', 2.0, 0.65, 'B'), (13.0, 'A', 2.0, 0.65, 'B'),
    (15.0, 'D', 2.0, 0.75, 'C'), (17.0, 'Bm', 2.0, 0.75, 'C'), (19.0, 'G', 1.0, 0.75, 'C'), (20.0, 'A', 1.0, 0.7, 'C'),
    (21.0, 'D', 2.0, 0.5, 'D'), (23.0, 'Bm', 1.0, 0.45, 'D'), (24.0, 'A', 1.0, 0.45, 'R'),
]
pad_bus = np.zeros((N, 2))
bass_bus = np.zeros((N, 2))
for (st, c, ln, pg, pat) in SECTIONS:
    place(pad_bus, pad(chord_f(c), ln + 0.35, attack=0.25 if pat != 'R' else 0.8, release=0.35, cutoff=1600 if pat in 'AD' else 2600), st, pg, send=0.35)
    r = note(ROOT[c])
    if pat == 'A':
        for b in range(int(ln / BEAT)):
            if b % 2 == 0:
                place(bass_bus, bass(r, BEAT * 1.8), st + b * BEAT, 0.9)
        # off-beat plucked stabs
        for b in (1, 3):
            for f in chord_f(c)[2:]:
                place(music, pluck(f * 2, 0.5, 1.2), st + b * BEAT + BEAT / 2, 0.12, pan=0.25, send=0.3)
    elif pat == 'B':
        for s in range(int(ln / (BEAT / 2))):
            place(bass_bus, bass(r, BEAT / 2 * 0.9, 1.4), st + s * BEAT / 2, 0.75)
        # rising 16th arpeggio
        arp = chord_f(c)[1:] + [chord_f(c)[2] * 2]
        for s in range(int(ln / (BEAT / 4))):
            f = arp[s % len(arp)] * 2
            place(music, pluck(f, 0.25, 1.5), st + s * BEAT / 4, 0.07 + 0.05 * (st - 11 + s * BEAT / 4) / 4, pan=-0.3 + 0.6 * (s % 2), send=0.25)
    elif pat == 'C':
        for s in range(int(ln / (BEAT / 2))):
            oct_ = 2 if s % 2 else 1
            place(bass_bus, bass(r * oct_, BEAT / 2 * 0.85, 1.8), st + s * BEAT / 2, 0.8)
        # bright chord stabs (syncopated)
        for b in (0, 0.75, 1.5, 2.5, 3.25):
            if b * BEAT < ln:
                for f in chord_f(c)[1:]:
                    place(music, additive(f * 2, 0.35, 16, 1.6, 0.12, detune=6) * 0.5, st + b * BEAT, 0.1, pan=0.0, send=0.35)
    elif pat == 'D':
        for b in range(int(ln / BEAT)):
            if b % 2 == 0:
                place(bass_bus, bass(r, BEAT * 1.6), st + b * BEAT, 0.6)

# final sting chord (logo) with a long tail
sting_t = 25.0
place(music, sub_boom(2.2, 38), sting_t, 0.9)
place(music, kick(0.6, 1.2), sting_t, 0.8)
place(music, crash(3.0), sting_t, 0.55, send=0.6)
for f in [note('D3'), note('A3'), note('D4'), note('F#4'), note('A4'), note('E5'), note('F#5')]:
    place(music, additive(f, 3.8, 14, 1.3, 0.9, attack=0.003) * 0.35, sting_t, 0.35, pan=np.clip((f - 400) / 800, -0.4, 0.4), send=0.6)
place(pad_bus, pad(chord_f('D') + [note('A4')], 4.0, attack=0.05, release=2.2, cutoff=2200), sting_t, 0.6, send=0.5)
place(bass_bus, bass(note('D2'), 2.5, 1.0), sting_t, 0.8)

# apply sidechain duck to pads and bass
music += pad_bus * duck[:, None] + bass_bus * (0.6 + 0.4 * duck[:, None])

# -------------------------------------------------- sfx: LEARN (3–7)
place(sfx, noise_whoosh(0.45, 600, 3000, 1.0, 1, 'bell'), 3.3, 0.25, pan=0.3)
place(sfx, pop(400, 1100, 0.12), 3.9, 0.45, pan=-0.2, send=0.3)
for k, tp in enumerate([4.0, 4.5, 5.0]):
    place(sfx, pop(600 + 150 * k, 1600 + 200 * k, 0.09), tp, 0.45, pan=0.35, send=0.3)
    place(sfx, marimba(note(['F#5', 'A5', 'D6'][k]), 0.8), tp, 0.18, pan=0.35, send=0.3)
place(sfx, noise_whoosh(0.22, 2000, 6000, 1.5, 1, 'bell'), 5.35, 0.2)
place(sfx, bell(note('A5'), 1.6), 5.57, 0.3, send=0.6)
place(sfx, bell(note('D6'), 1.6), 5.6, 0.2, send=0.6)
# dive into Pointee
place(sfx, noise_whoosh(0.55, 200, 2500, 1.2, 1.4, 'rise'), 6.5, 0.7, send=0.2)
place(sfx, sub_boom(0.8, 50), 7.0, 0.5)

# -------------------------------------------------- sfx: TRY (7–11)
place(sfx, noise_whoosh(0.6, 1200, 250, 1.3, 1, 'bell'), 7.0, 0.35, pan=-0.5)
place(sfx, pop(300, 900, 0.14), 7.55, 0.5, pan=0.3, send=0.3)
place(sfx, noise_whoosh(0.4, 900, 5000, 1.2, 1, 'bell'), 7.5, 0.25, pan=0.3)
for i in range(42):
    t = 7.95 + i * 0.024 + jit(i + 40) * 0.5
    place(sfx, click(1.3), t, 0.28, pan=0.35)
for k, tb in enumerate([9.0, 9.25, 9.5]):
    place(sfx, click(0.6) * 1.5, tb, 0.5, pan=0.4)
    place(sfx, pop(200, 500, 0.05), tb, 0.3, pan=0.4)
    place(sfx, marimba(note(['D5', 'F#5', 'A5'][k]), 0.8), tb + 0.2, 0.22, pan=0.4, send=0.3)
place(sfx, bell(note('D6'), 1.4), 9.7, 0.18, pan=0.4, send=0.5)
# collapse into a single dot
place(sfx, noise_whoosh(0.75, 5000, 300, 1.2, 0.8, 'bell'), 10.35, 0.5, send=0.3)
place(sfx, pop(900, 1800, 0.07), 11.1, 0.4, send=0.4)

# -------------------------------------------------- sfx: SHARE (11–15)
PENTA = ['D5', 'E5', 'F#5', 'A5', 'B5', 'D6', 'E6', 'F#6', 'A6', 'B6']
for rank in range(28):
    t = 11.6 + rank * 0.062
    f = note(PENTA[min(len(PENTA) - 1, rank // 3)])
    place(sfx, bell(f, 0.9), t, 0.06 + 0.03 * (rank % 2), pan=np.sin(rank * 1.7) * 0.6, send=0.5)
place(sfx, noise_whoosh(0.65, 300, 2000, 1.2, 1, 'bell'), 14.3, 0.3)

# -------------------------------------------------- sfx: BUILD / PROMPTATHON (15–21)
place(music, crash(2.5), 15.0, 0.6, send=0.4)
place(music, sub_boom(1.2, 45), 15.0, 0.7)
place(sfx, pop(250, 700, 0.12), 15.3, 0.35)
for k, tc in enumerate([16.0, 16.5, 17.0, 17.5]):
    place(sfx, pop(350 + 90 * k, 1000 + 180 * k, 0.1), tc, 0.5, pan=-0.3 + 0.2 * k, send=0.3)
for k, tc in enumerate([18.0, 18.25, 18.5, 18.75]):
    place(sfx, marimba(note(['A5', 'B5', 'D6', 'F#6'][k]), 0.7), tc, 0.3, pan=-0.3 + 0.2 * k, send=0.3)
# wizard fly-by: doppler whoosh + sparkle grains
place(sfx, noise_whoosh(1.9, 500, 3500, 1.6, 1.0, 'bell'), 18.55, 0.5, send=0.4)
for g in range(40):
    tg = 18.7 + g * 0.042 + rng.uniform(0, 0.02)
    place(sfx, bell(note(PENTA[5 + g % 5]) * 1.5, 0.35), tg, 0.035, pan=0.8 - 1.6 * g / 40, send=0.6)
# the pitch lands: confetti
place(sfx, hp(rng.standard_normal(int(0.25 * SR)), 1500) * np.exp(-tt(0.25) * 22) * 0.8, 19.5, 0.6, pan=0.3)
place(sfx, crash(2.4), 19.5, 0.5, pan=0.3, send=0.5)
for g in range(24):
    place(sfx, click(1.6), 19.55 + rng.uniform(0, 0.9), 0.05 * rng.uniform(0.4, 1), pan=rng.uniform(-0.8, 0.8))
# transition into the resolve
place(sfx, noise_whoosh(0.7, 4000, 300, 1.2, 1, 'bell'), 20.45, 0.4, send=0.3)

# -------------------------------------------------- sfx: RESOLVE (21–29)
for k, tw in enumerate([21.5, 22.0, 22.5, 23.0]):
    place(sfx, marimba(note(['D5', 'F#5', 'A5', 'D6'][k]), 1.2), tw, 0.42, pan=-0.45 + 0.3 * k, send=0.4)
    place(sfx, pop(500, 1200, 0.07), tw, 0.2, pan=-0.45 + 0.3 * k)
# the mark assembles, the frame closes
place(sfx, noise_whoosh(1.4, 300, 6000, 1.2, 1.4, 'rise'), 23.6, 0.55, send=0.3)
t_r = tt(1.4)
place(sfx, np.sin(2 * np.pi * np.cumsum(note('A3') * 2 ** (t_r * 0.9)) / SR) * (t_r / 1.4) ** 2 * 0.12, 23.6, 1.0, send=0.3)
place(sfx, noise_whoosh(0.4, 1500, 7000, 1.4, 1, 'bell'), 24.55, 0.25, pan=-0.2)
place(sfx, noise_whoosh(0.5, 800, 3000, 1.0, 1, 'bell'), 25.2, 0.12)
# typed closing line
FINAL = 'AI is part of my everyday work'
for i, ch in enumerate(FINAL):
    t = 26.05 + i * 0.034 + jit(i + 80) * 0.6
    place(sfx, click(0.7 if ch == ' ' else 1.1), t, 0.3, pan=-0.2 + 0.4 * i / len(FINAL))
place(sfx, pop(700, 1500, 0.08), 27.25, 0.5, send=0.4)
place(sfx, bell(note('D6'), 2.0), 27.27, 0.22, send=0.7)
place(sfx, bell(note('A6'), 2.0), 27.3, 0.1, send=0.7)

# ---------------------------------------------------------------- reverb + mix
def make_ir(d=2.4):
    t = tt(d)
    ir = np.zeros((len(t), 2))
    for c in range(2):
        n = rng.standard_normal(len(t))
        n = lp(n, 7000) * np.exp(-t * 2.6)
        ir[:, c] = n
    ir[: int(0.012 * SR)] = 0  # predelay
    return ir / np.sqrt((ir ** 2).sum(axis=0))


ir = make_ir()
wet = np.stack([signal.fftconvolve(verb_send[:, c], ir[:, c])[:N] for c in range(2)], axis=1)
wet = hp(wet.T, 250).T

mix = music * 0.85 + sfx * 0.9 + wet * 0.55
# gentle master: low cut, soft saturation, fade
mix = hp(mix.T, 28).T
fade = np.ones(N)
fi = int(28.3 * SR)
fade[fi:] = np.linspace(1, 0, N - fi) ** 1.5
mix *= fade[:, None]
peak = np.max(np.abs(mix))
mix = mix / peak * 0.9
mix = np.tanh(mix * 1.25) / np.tanh(1.25)
mix = mix / np.max(np.abs(mix)) * 0.891  # -1 dBFS sample peak

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'soundtrack.wav')
pcm = np.clip(mix * (2 ** 31 - 1), -(2 ** 31), 2 ** 31 - 1).astype(np.int32)
wavfile.write(out, SR, pcm)
print('wrote', out, 'peak', np.max(np.abs(mix)))

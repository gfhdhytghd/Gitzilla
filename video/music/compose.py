"""Gitzilla pitch score: an original chiptune, 120 BPM, 1 bar = 2 s, locked to video/STORYBOARD.md.

Voices follow the game's own synth (client/audio/synth.ts): narrow pulse lead, quantised triangle bass, noise drums,
fast pulse arpeggios. Key: A minor (the game's "terminal" theme), lifting to C major for the classroom.
Usage: python3 compose.py  ->  score.wav (48 kHz stereo 16-bit) + score.json (section map)
"""
import json, wave
import numpy as np

SR, BPM = 48000, 120
BEAT = 60 / BPM
BAR = 4 * BEAT
BARS = 68
TAIL = 4.0
N = int(SR * (BAR * BARS + TAIL))
L = np.zeros(N); R = np.zeros(N)
rng = np.random.default_rng(1337)

# storyboard sections (bar ranges, end exclusive)
SECTIONS = dict(hook=(0, 4), genesis=(4, 12), raid=(12, 28), organ=(28, 34), royale=(34, 44),
                classroom=(44, 58), built=(58, 64), end=(64, 68))


def sec(bar):
    for k, (a, b) in SECTIONS.items():
        if a <= bar < b:
            return k
    return "end"


def at(bar, beat=0.0):
    return int(SR * (bar * BAR + beat * BEAT))


def add(sig, start, pan=0.0, gain=1.0):
    if start >= N:
        return
    end = min(N, start + len(sig))
    s = sig[: end - start] * gain
    L[start:end] += s * np.sqrt(0.5 * (1 - pan))
    R[start:end] += s * np.sqrt(0.5 * (1 + pan))


def hz(m):
    return 440 * 2 ** ((m - 69) / 12)


def adsr(n, a=0.004, d=0.08, s=0.6, r=0.04):
    t = np.arange(n) / SR
    dur = n / SR
    e = np.where(t < a, t / a, s + (1 - s) * np.exp(-(t - a) / max(d, 1e-4)))
    rel = np.clip((dur - t) / r, 0, 1)
    return e * rel


def smooth(x, k=3):
    return np.convolve(x, np.ones(k) / k, mode="same")


# ---------- chip voices ----------

def pulse(m, dur, duty=0.25, gain=0.18, vib=0.0, slide=0.0, env=None):
    n = int(SR * dur); t = np.arange(n) / SR
    f = hz(m) * (1 + vib * np.sin(2 * np.pi * 5.5 * t) * np.clip((t - 0.12) / 0.2, 0, 1)) * 2 ** (slide * t / max(dur, 1e-3) / 12)
    ph = np.cumsum(f) / SR % 1.0
    x = np.where(ph < duty, 1.0, -1.0)
    x = smooth(x, 3)
    return x * (env if env is not None else adsr(n)) * gain


def tri(m, dur, gain=0.32):
    n = int(SR * dur); t = np.arange(n) / SR
    ph = (hz(m) * t) % 1.0
    x = 1 - 4 * np.abs(ph - 0.5)
    x = np.round(x * 7.5) / 7.5                    # 4-bit-ish steps, the NES triangle grit
    return x * adsr(n, 0.002, 0.3, 0.85, 0.02) * gain


def noise(dur, gain, decay, hold=1):
    n = int(SR * dur)
    x = rng.uniform(-1, 1, (n + hold - 1) // hold).repeat(hold)[:n]
    t = np.arange(n) / SR
    return x * np.exp(-t / decay) * gain


def kick():
    n = int(SR * 0.28); t = np.arange(n) / SR
    f = 50 + 160 * np.exp(-t / 0.03)
    x = 1 - 4 * np.abs((np.cumsum(f) / SR % 1.0) - 0.5)
    return x * np.exp(-t / 0.11) * 0.75


def snare():
    x = noise(0.22, 0.36, 0.06, hold=2)
    x[: int(SR * 0.08)] += pulse(50, 0.08, 0.5, 0.12, env=np.exp(-np.arange(int(SR * 0.08)) / SR / 0.03))
    return x


def hat(open_=False):
    return noise(0.18 if open_ else 0.05, 0.07 if open_ else 0.06, 0.05 if open_ else 0.012, hold=1)


def crash():
    return noise(1.6, 0.22, 0.5, hold=1)


def riser(dur):
    n = int(SR * dur); t = np.arange(n) / SR
    x = noise(dur, 1.0, 1e9, hold=1)
    k = np.linspace(40, 2, n).astype(int)          # crude sweep: shrinking moving-average window
    y = np.empty(n)
    c = np.cumsum(np.concatenate([[0], x]))
    for i in range(0, n, 512):
        kk = max(1, k[i]); j = np.arange(i, min(n, i + 512))
        y[j] = (c[j + 1] - c[np.maximum(0, j + 1 - kk)]) / kk
    return y * (t / dur) ** 2 * 0.25


# ---------- harmony ----------
# A minor: Am – F – C – G (one chord per bar); classroom lifts to C major: C – G – Am – F
MINOR = [(57, [57, 60, 64]), (53, [53, 57, 60]), (48, [55, 60, 64]), (55, [55, 59, 62])]
MAJOR = [(48, [55, 60, 64]), (55, [55, 59, 62]), (57, [57, 60, 64]), (53, [53, 57, 60])]
PENTA_MIN = [57, 60, 62, 64, 67, 69, 72, 74, 76, 79, 81]     # A minor pentatonic, A3..A5
PENTA_MAJ = [60, 62, 64, 67, 69, 72, 74, 76, 79, 81, 84]     # C major pentatonic

# lead motifs: (step index into the pentatonic, length in 8ths); None = rest. 8 eighths per bar, 2-bar phrases.
MOTIF_RAID = [(6, 2), (5, 1), (6, 1), (8, 2), (7, 2), (6, 1), (5, 1), (4, 2), (3, 2), None, (4, 1), (5, 1)]
MOTIF_RAID_B = [(8, 2), (9, 1), (8, 1), (7, 2), (6, 2), (5, 2), (6, 1), (7, 1), (6, 4), None, None]
MOTIF_ROYALE = [(3, 1), (3, 1), (6, 1), (3, 1), (7, 2), (6, 1), (5, 1), (4, 1), (4, 1), (7, 1), (4, 1), (8, 2), (7, 2)]
MOTIF_CLASS = [(5, 2), (6, 2), (7, 2), (5, 2), (8, 3), (7, 1), (6, 2), (5, 2)]
MOTIF_END = [(5, 1), (7, 1), (9, 1), (10, 5)]


def lead(motif, bar0, bars, scale, duty=0.25, gain=0.16, octave=0, pan=-0.15):
    pos = 0.0; end = bars * 8; i = 0
    while pos < end:
        ev = motif[i % len(motif)]; i += 1
        if ev is None:
            pos += 1; continue
        step, ln = ev
        ln = min(ln, end - pos)
        m = scale[min(step, len(scale) - 1)] + octave
        add(pulse(m, ln * BEAT / 2 * 0.95, duty, gain, vib=0.006 if ln >= 2 else 0), at(bar0, pos / 2), pan=pan)
        # echo voice, the classic chip "delay" made from a quieter copy
        add(pulse(m, ln * BEAT / 2 * 0.9, duty, gain * 0.35), at(bar0, pos / 2 + 0.75), pan=-pan)
        pos += ln


# ---------- arrangement ----------
for bar in range(BARS):
    s = sec(bar)
    a, b = SECTIONS[s]
    local = bar - a
    chords = MAJOR if s == "classroom" else MINOR
    root, tones = chords[bar % 4]

    # arpeggio (16ths, 12.5% pulse) — the grid that runs through the whole film
    if s not in ("end",) or local == 0:
        arp_gain = {"hook": 0.07, "genesis": 0.08, "raid": 0.07, "organ": 0.06, "royale": 0.07,
                    "classroom": 0.07, "built": 0.08, "end": 0.06}[s]
        steps = 16 if s != "organ" else 8
        for k in range(steps):
            if s == "hook" and local < 2 and k % 2:
                continue
            m = tones[k % 3] + 12 + (12 if (k // 3) % 2 and s in ("raid", "royale", "built") else 0)
            add(pulse(m, BEAT / (steps / 4) * 0.8, 0.125, arp_gain, env=None), at(bar, k * 4 / steps), pan=0.3 if k % 2 else -0.05)

    # bass
    if s in ("genesis", "raid", "royale", "classroom", "built") or (s == "hook" and local >= 2):
        pattern = [0, 1, 2, 3, 4, 5, 6, 7] if s in ("raid", "royale", "built") else [0, 3, 4, 6]
        for k in pattern:
            m = root - 12 + (12 if k % 2 and s in ("raid", "royale") else 0) + (7 if k == 6 and s == "royale" else 0)
            add(tri(m, BEAT / 2 * 0.9), at(bar, k * 0.5))
    if s == "organ":
        add(tri(root - 12, BAR * 0.98, 0.26), at(bar))

    # drums
    if s == "hook":
        if local == 0:
            add(riser(BAR * 1.5), at(0, 2))
        if local == 2:
            add(crash(), at(bar), gain=1.2); add(kick(), at(bar), gain=1.3)
        if local >= 2:
            for k in (0, 2):
                add(kick(), at(bar, k))
            add(snare(), at(bar, 3), gain=0.8)
    elif s == "genesis":
        for k in range(4):
            if k % 2 == 0 or local >= 4:
                add(kick(), at(bar, k))
        for k in range(8):
            add(hat(), at(bar, k * 0.5 + 0.25), pan=0.4)
        if local >= 4:
            add(snare(), at(bar, 1)); add(snare(), at(bar, 3))
        if local == 7:                                     # snare roll into the raid
            for k in range(8):
                add(snare(), at(bar, 2 + k * 0.25), gain=0.4 + 0.08 * k)
            add(riser(BAR * 0.5), at(bar, 2))
    elif s in ("raid", "royale", "built"):
        for k in range(4):
            add(kick(), at(bar, k))
        add(snare(), at(bar, 1)); add(snare(), at(bar, 3))
        hats = 16 if s == "royale" else 8
        for k in range(hats):
            add(hat(open_=(k % 4 == 2 and s != "royale")), at(bar, k * 4 / hats + (0.25 if hats == 8 else 0)), pan=0.4)
        if local == 0:
            add(crash(), at(bar))
    elif s == "classroom":
        add(kick(), at(bar, 0)); add(kick(), at(bar, 2.5))
        add(snare(), at(bar, 1), gain=0.7); add(snare(), at(bar, 3), gain=0.7)
        for k in range(8):
            add(hat(), at(bar, k * 0.5), pan=0.4, gain=0.8)
        if local == 0:
            add(crash(), at(bar), gain=0.8)
    elif s == "organ" and local == 0:
        add(crash(), at(bar), gain=0.6)

    # organ breakdown: soft held pulse chords (50% duty, slow attack)
    if s == "organ":
        for m in tones:
            n = int(SR * BAR * 0.98)
            add(pulse(m + 12, BAR * 0.98, 0.5, 0.05, vib=0.004, env=adsr(n, 0.35, 0.6, 0.8, 0.4)), at(bar), pan=0.2)

# lead lines per section
lead(MOTIF_RAID, 12, 8, PENTA_MIN)
lead(MOTIF_RAID_B, 20, 6, PENTA_MIN, duty=0.125)
lead(MOTIF_ROYALE, 36, 8, PENTA_MIN, duty=0.25, gain=0.14, octave=-12)
lead(MOTIF_CLASS, 46, 12, PENTA_MAJ, duty=0.5, gain=0.13)
lead(MOTIF_RAID, 58, 6, PENTA_MIN, duty=0.125, gain=0.13)

# victory fanfare at the raid's VICTORY shot (bar 27) — the game's own 'victory' cue, voiced up
for i, m in enumerate([72, 76, 79, 84, 79, 84]):
    add(pulse(m, 0.13 if i < 5 else 0.6, 0.5, 0.16), at(27, i * 0.3), pan=-0.1)
for i, m in enumerate([48, 52, 55]):
    add(tri(m, 0.6, 0.3), at(27, 2 + i * 0.5))

# end: final fanfare + held A-minor-add9 → resolve
for i, m in enumerate([69, 72, 76, 81]):
    add(pulse(m, 0.22 if i < 3 else 2.8, 0.25, 0.16, vib=0.008 if i == 3 else 0), at(64, i * 0.5), pan=-0.1)
lead(MOTIF_END, 65, 1, PENTA_MIN, duty=0.25, gain=0.12, octave=12)
for m in (45, 57, 64, 71):
    n = int(SR * 6)
    add(pulse(m, 6, 0.5, 0.05, env=adsr(n, 0.05, 1.5, 0.5, 2.5)), at(66))
add(tri(33, 6, 0.3), at(66)); add(crash(), at(66), gain=0.9); add(kick(), at(66), gain=1.2)

# ---------- space + master ----------
def delay(x, sec_, fb, mix):
    d = int(SR * sec_); y = x.copy()
    for k in range(1, 5):
        y[d * k:] += x[:-d * k] * (fb ** k) * mix
    return y


L, R = delay(L, BEAT * 0.75, 0.35, 0.22), delay(R, BEAT * 0.5, 0.35, 0.22)
mix = np.stack([L, R], 1)
mix = np.tanh(mix * 1.2) / 1.2
fade = int(SR * 2.5); mix[-fade:] *= np.linspace(1, 0, fade)[:, None]
mix *= 10 ** (-1.5 / 20) / np.abs(mix).max()
pcm = (mix * 32767).astype("<i2")
with wave.open("score.wav", "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes(pcm.tobytes())
json.dump({"bpm": BPM, "bar": BAR, "bars": BARS, "sections": SECTIONS}, open("score.json", "w"), indent=1)
print("ok", round(N / SR, 1), "s")

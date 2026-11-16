"""Audio analysis for a new song -> data/<song>/audio.json (same schema as analyze.py writes for pdoom).
Generic version: librosa beat grid (constant tempo fitted to the drum stem), bar phase from kick energy,
envelopes from the Demucs stems, band-limited drum onsets."""
import json, sys
import numpy as np, librosa, soundfile as sf
from scipy.signal import butter, sosfiltfilt, find_peaks
FPS = 100
stems_dir, out = sys.argv[1], sys.argv[2]
def load(n):
    y, sr = sf.read(f"{stems_dir}/{n}.wav", dtype="float32", always_2d=True); return y.mean(1), sr
dr, sr = load("drums"); vo, _ = load("vocals"); ba, _ = load("bass"); ot, _ = load("other")
mix = dr + vo + ba + ot; dur = len(mix) / sr
def band(x, lo, hi):
    if lo is None: sos = butter(4, hi, "lowpass", fs=sr, output="sos")
    elif hi is None: sos = butter(4, lo, "highpass", fs=sr, output="sos")
    else: sos = butter(4, [lo, hi], "bandpass", fs=sr, output="sos")
    return sosfiltfilt(sos, x).astype(np.float32)
def env(x, win=2048):
    hop = sr // FPS; n = int(dur * FPS) + 1
    p = np.pad(x.astype(np.float64) ** 2, (win // 2, win)); c = np.concatenate([[0], np.cumsum(p)])
    i = np.arange(n) * hop; r = np.sqrt((c[i + win] - c[i]) / win)
    o = np.zeros(n); a_att, a_rel = np.exp(-1 / (FPS * 0.010)), np.exp(-1 / (FPS * 0.090)); v = 0
    for k in range(n):
        a = a_att if r[k] > v else a_rel; v = a * v + (1 - a) * r[k]; o[k] = v
    return np.clip(o / (np.percentile(o, 99) + 1e-9), 0, 1)
# --- tempo & grid
oenv = librosa.onset.onset_strength(y=dr, sr=sr, hop_length=512)
tempo0 = float(np.atleast_1d(librosa.beat.beat_track(onset_envelope=oenv, sr=sr, hop_length=512)[0])[0])
kick = band(dr, None, 120); kenv = librosa.onset.onset_strength(y=kick, sr=sr, hop_length=128)
kt = librosa.frames_to_time(np.arange(len(kenv)), sr=sr, hop_length=128)
def score(P, off, e=oenv, hop=512):
    t = np.arange(off, dur, P); idx = np.clip(np.round(t * sr / hop).astype(int), 0, len(e) - 1); return e[idx].mean()
best = None
for cand in [tempo0, tempo0 / 2, tempo0 * 2, tempo0 * 2 / 3, tempo0 * 3 / 2]:
    if not 60 <= cand <= 180: continue
    for bpm in np.arange(cand - 2, cand + 2, 0.005):
        P = 60 / bpm; offs = np.arange(0, P, 0.004)
        sc = [score(P, o) for o in offs]; j = int(np.argmax(sc))
        if best is None or sc[j] > best[0]: best = (sc[j], bpm, offs[j])
_, bpm, off = best; P = 60 / bpm
off = max((score(P, o, kenv, 128) * 0 + score(P, o), o) for o in np.arange(off - 0.02, off + 0.02, 0.001))[1] % P
beats = np.arange(off, dur, P)
# bar phase: which beat-of-4 carries the most low-end attack energy
ph = [np.mean([kenv[np.argmin(abs(kt - b))] for b in beats[k::4]]) for k in range(4)]
k0 = int(np.argmax(ph)); downbeats = beats[k0::4]
print(f"tempo0 {tempo0:.2f} -> bpm {bpm:.3f} off {off:.3f} phase scores {np.round(ph,2)} k0 {k0}")
# --- onsets
def onsets(x, min_gap, delta):
    e = librosa.onset.onset_strength(y=x, sr=sr, hop_length=128); e = e / (np.percentile(e, 99.5) + 1e-9)
    pk, pr = find_peaks(e, height=delta, distance=max(1, int(min_gap * sr / 128)), prominence=delta * 0.6)
    return [[round(float(t), 3), round(float(min(1, h)), 3)] for t, h in zip(librosa.frames_to_time(pk, sr=sr, hop_length=128), pr["peak_heights"])]
on = dict(kick=onsets(kick, 0.09, 0.25), snare=onsets(band(dr, 180, 2500), 0.10, 0.30), hat=onsets(band(dr, 7000, None), 0.045, 0.22), vocal=onsets(vo, 0.10, 0.25))
feats = dict(rms=env(mix), low=env(band(mix, None, 150)), mid=env(band(mix, 150, 2500)), high=env(band(mix, 2500, None)), vocal=env(vo), drums=env(dr), bass=env(ba), other=env(ot))
# --- coarse sections: per-bar energy of drums / vocals (for inspection; named by hand afterwards)
bars = []
for i, d in enumerate(downbeats):
    a, b = int(d * FPS), int(min(dur, d + 4 * P) * FPS)
    bars.append((i, round(float(d), 2), *[round(float(feats[k][a:b].mean()), 2) for k in ("drums", "bass", "vocal", "other", "rms")]))
for b in bars: print(*b)
doc = dict(duration=round(dur, 3), bpm=round(float(bpm), 3), beat_period=round(P, 5), time_signature=[4, 4],
           beats=[round(float(t), 3) for t in beats], downbeats=[round(float(t), 3) for t in downbeats], sections=[], fps=FPS,
           **{k: [round(float(v), 3) for v in a] for k, a in feats.items()}, onsets=on)
json.dump(doc, open(out, "w"), separators=(",", ":"))
print("wrote", out, {k: len(v) for k, v in on.items()})

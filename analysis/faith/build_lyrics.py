"""lyrics sheet + Whisper word timings -> data/<song>/lyrics.json (schema of data/lyrics.json).
1. The sheet's words are matched to Whisper's words in order (difflib); unmatched words are interpolated.
2. --fa: each line is then force-aligned (torchaudio MMS_FA) to the vocal stem inside its rough window."""
import json, re, sys, difflib
sheet, out = sys.argv[1], sys.argv[2]; FA = "--fa" in sys.argv
norm = lambda s: re.sub(r"[^a-z0-9']", "", s.lower().replace("’", "'"))
src = []
for f, keys in [("whisper.json", None), ("whisper_gaps.json", ["0-50", "46-70", "106-122", "204-264"]), ("whisper_large.json", None)]:
    try: j = json.load(open(f))
    except FileNotFoundError: continue
    for k in (keys or [None]):
        r = j[k] if k else j; off = float(k.split("-")[0]) if k else 0
        src.append([dict(w=norm(w["word"]), start=w["start"] + off, end=w["end"] + off) for s in r["segments"] for w in s["words"] if norm(w["word"])])
lines = [l.strip() for l in open(sheet, encoding="utf-8") if l.strip()]
# "@a-b text": the line is sung inside [a, b] s (for lines the transcription missed or that repeat)
hints = {}
for i, l in enumerate(lines):
    m = re.match(r"@([\d.]+)-([\d.]+)\s+(.*)", l)
    if m: hints[i] = (float(m[1]), float(m[2])); lines[i] = m[3]
toks = [(li, w) for li, l in enumerate(lines) for w in l.split()]
tn = [norm(w) for _, w in toks]
times = [None] * len(toks)
# match against each source in turn; earlier sources win, later ones fill what is still missing
for ws in src:
    sm = difflib.SequenceMatcher(a=tn, b=[w["w"] for w in ws], autojunk=False)
    for a, b, n in sm.get_matching_blocks():
        if n < 3: continue   # short accidental matches put words in the wrong place
        for k in range(n):
            if times[a + k] is None:
                t = ws[b + k]
                # keep monotonic with the neighbours already placed
                prev = next((times[i] for i in range(a + k - 1, -1, -1) if times[i]), None)
                nxt = next((times[i] for i in range(a + k + 1, len(toks)) if times[i]), None)
                if (prev is None or t["start"] >= prev[0]) and (nxt is None or t["start"] <= nxt[0]): times[a + k] = (t["start"], t["end"])
for k, (li, _) in enumerate(toks):
    if li in hints:
        idx = [q for q in range(len(toks)) if toks[q][0] == li]; h0, h1 = hints[li]; n = len(idx)
        times[k] = (h0 + (h1 - h0) * idx.index(k) / n, h0 + (h1 - h0) * (idx.index(k) + 1) / n)
# interpolate the gaps
i = 0
while i < len(toks):
    if times[i] is None:
        j = i
        while j < len(toks) and times[j] is None: j += 1
        a = times[i - 1][1] if i else 0.0; b = times[j][0] if j < len(toks) else a + 0.4 * (j - i)
        b = min(b, a + 0.45 * (j - i))
        for k in range(i, j): times[k] = (a + (b - a) * (k - i) / (j - i), a + (b - a) * (k - i + 1) / (j - i))
        print("interpolated:", " ".join(toks[k][1] for k in range(i, j)), f"@{a:.2f}-{b:.2f}")
        i = j
    else: i += 1
doc = []
for li, l in enumerate(lines):
    ws = [dict(w=toks[k][1], start=times[k][0], end=times[k][1]) for k in range(len(toks)) if toks[k][0] == li]
    doc.append(dict(text=l, words=ws))
if FA:
    import torch, torchaudio, soundfile as sf
    b = torchaudio.pipelines.MMS_FA; model = b.get_model(); tok = b.get_tokenizer(); al = b.get_aligner()
    y, sr = sf.read("stems/htdemucs/faith/vocals.wav", dtype="float32", always_2d=True)
    y = torchaudio.functional.resample(torch.from_numpy(y.mean(1)), sr, 16000)
    for li, d in enumerate(doc):
        a = max(0, d["words"][0]["start"] - 0.7); e = d["words"][-1]["end"] + 0.9
        if li in hints: a, e = hints[li][0] - 0.2, hints[li][1] + 0.3
        words = [re.sub(r"[^a-z']", "", norm(w["w"])) or "a" for w in d["words"]]
        with torch.inference_mode(): em, _ = model(y[int(a * 16000):int(e * 16000)][None])
        spans = al(em[0], tok(words)); ratio = (e - a) / em.shape[1]
        moved = 0
        for w, sp in zip(d["words"], spans):
            s2, e2 = a + sp[0].start * ratio, a + sp[-1].end * ratio; moved = max(moved, abs(s2 - w["start"]))
            w["start"], w["end"], w["conf"] = s2, e2, round(float(sum(x.score * (x.end - x.start) for x in sp) / max(1, sum(x.end - x.start for x in sp))), 2)
        print(f"{d['words'][0]['start']:7.2f} max shift {moved:.2f}  {d['text']}")
for d in doc:
    ws = d["words"]
    for k, w in enumerate(ws):
        # a word is lit until it ends, but never past the next one's start, and not shorter than 90 ms
        if k + 1 < len(ws): w["end"] = min(max(w["end"], w["start"] + 0.09), ws[k + 1]["start"])
        w["end"] = min(w["end"], w["start"] + 2.5)
        w["start"], w["end"] = round(w["start"], 3), round(max(w["end"], w["start"] + 0.05), 3)
    d["start"], d["end"] = ws[0]["start"], ws[-1]["end"]
json.dump(dict(lines=doc, notes="Lyrics transcribed from the audio (Whisper medium.en / large-v3 on the Demucs vocal stem), corrected by hand, word times by MMS forced alignment. Not the author's sheet."), open(out, "w"), indent=1, ensure_ascii=False)
for d in doc: print(f"{d['start']:7.2f} {d['end']:7.2f}  {d['text']}")

import whisper, json, subprocess
V = "stems/htdemucs/faith/vocals.wav"
def clip(a, b):
    f = f"clip_{a}_{b}.wav"; subprocess.run(["ffmpeg","-y","-loglevel","error","-ss",str(a),"-to",str(b),"-i",V,"-ar","16000","-ac","1",f],check=True); return f
out = {}
m = whisper.load_model("medium.en")
for a, b in [(0, 50), (46, 70), (106, 122), (204, 264)]:
    r = m.transcribe(clip(a, b), word_timestamps=True, language="en", condition_on_previous_text=False, temperature=(0, 0.2, 0.4), no_speech_threshold=0.8, compression_ratio_threshold=2.0,
                     initial_prompt="Gospel trap song lyrics. Yeah, I walk through the valley, shadows all around. Hallelujah, I'm standing my ground. Faith amid doubt.")
    out[f"{a}-{b}"] = r
    print(f"== medium {a}-{b}", flush=True)
    for s in r["segments"]: print(f'{s["start"]+a:7.2f} {s["end"]+a:7.2f} {s["text"]}', flush=True)
json.dump(out, open("whisper_gaps.json", "w"))
del m
m = whisper.load_model("large-v3")
r = m.transcribe(V, word_timestamps=True, language="en", condition_on_previous_text=False, temperature=(0, 0.2, 0.4), compression_ratio_threshold=2.0, hallucination_silence_threshold=2.0)
json.dump(r, open("whisper_large.json", "w"))
print("== large-v3 full", flush=True)
for s in r["segments"]: print(f'{s["start"]:7.2f} {s["end"]:7.2f} {s["text"]}', flush=True)

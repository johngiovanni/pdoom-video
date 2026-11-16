import whisper, json
m = whisper.load_model("medium.en")
r = m.transcribe("stems/htdemucs/faith/vocals.wav", word_timestamps=True, language="en", condition_on_previous_text=False, temperature=0)
json.dump(r, open("whisper.json","w"))
for s in r["segments"]: print(f'{s["start"]:7.2f} {s["end"]:7.2f} {s["text"]}')

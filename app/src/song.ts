// Which song the app plays: ?song=<name> (default: pdoom). A song has its own timing data
// (data/<name>/lyrics.json, data/<name>/audio.json; pdoom's sit directly in data/), its audio
// (audio/<name>.mp3) and its edit (a makeTimeline in src/timeline-<name>.ts, see main.ts).
export const SONG = new URLSearchParams(globalThis.location?.search ?? '').get('song') ?? 'pdoom';
export const DATA_DIR = SONG === 'pdoom' ? 'data' : `data/${SONG}`;
export const AUDIO_URL = `audio/${SONG}.mp3`;

// The edit of "Faith Amid Doubt" (?song=faith): five plates on the song's sections, cut on its grid.
import type { TimelineEntry } from './engine/engine';
import type { SceneClass } from './engine/scene';
import type { Lyrics } from './engine/lyrics';
import type { AudioData } from './engine/audio';

const modules = import.meta.glob<{ default: SceneClass }>('./scenes/faith-*.ts');
const scene = (name: string) => () => {
  const m = modules[`./scenes/${name}.ts`];
  return m ? m() : Promise.reject(new Error(`scene module not found: scenes/${name}.ts`));
};

export function makeTimeline(ly: Lyrics, au: AudioData): TimelineEntry[] {
  /** Cut on the last half-beat before the first word of the nth line matching q (the song is in half-time). */
  const cut = (q: string, nth = 0) => {
    const s = ly.get(q, nth).words[0]!.start - 0.06;
    return au.timeOfBeat(Math.floor(au.beatAt(s) * 2) / 2);
  };
  /** The downbeat nearest t. */
  const bar = (t: number) => au.downbeats.reduce((b, d) => (Math.abs(d - t) < Math.abs(b - t) ? d : b), 0);
  const b = {
    verse1: bar(ly.get('demons in the silence').start),
    chorus1: cut('walk through the valley', 0),
    verse2: cut("worth the grace"),
    chorus2: cut('walk through the valley', 1),
    bridge: bar(ly.get('prodigal').start),
    finale: bar(ly.get('still here').start), // the drums come back
    end: au.duration,
  };
  const E = (id: string, file: string, start: number, end: number, params: Record<string, any> = {}): TimelineEntry =>
    ({ id, load: scene(file), start, end, params });
  return [
    E('dawn', 'faith-dawn', 0, b.verse1),
    E('verse1', 'faith-verse', b.verse1, b.chorus1, { variant: 'cage' }),
    E('chorus1', 'faith-valley', b.chorus1, b.verse2, { n: 1 }),
    E('verse2', 'faith-verse', b.verse2, b.chorus2, { variant: 'crown' }),
    E('chorus2', 'faith-valley', b.chorus2, b.bridge, { n: 2 }),
    E('bridge', 'faith-rain', b.bridge, b.finale),
    E('finale', 'faith-valley', b.finale, b.end, { n: 3, finale: true }),
  ];
}

// Verse plate: doubt. The lyric runs down the left as a slab; on the right, the figure the verse
// leans on: the cage (verse 1: bars, opening at "turning the page") or the crown (verse 2: a ring of
// thorns around the ember, which catches at "a fire that burns"). params.variant = 'cage' | 'crown'.
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D, W, H } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { rgba } from '../engine/palette';
import { TAU, ease, hash, lerp, noise2, prog } from '../engine/util';
import { sparkParticles } from './_motifs';
import { activeLines, caption, drawFaithReadout, drawLyricBlock, ember, embers, faithValue, marginRef, skyPass, typed } from './faith-kit';

const AX = 1440, AY = 520;

export default class FaithVerse extends Scene {
  sky = skyPass();
  layer = new Layer2D();
  lb = new LineBatch(3000, { screen2D: true, blend: 'add' });
  marks: number[] = [];
  turn = 1e9;

  override init() {
    const ly = this.ctx.lyrics;
    this.marks = ly.find('walk through the valley').map((l) => l.start);
    const q = this.ctx.params.variant === 'crown' ? 'fire' : 'Turning the page';
    const l = ly.find(q).find((x) => x.start >= this.ctx.start && x.start < this.ctx.end);
    if (l) this.turn = l.start;
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp, lyrics, audio } = this.ctx;
    const t = f.t, crown = this.ctx.params.variant === 'crown';
    const open = prog(t, this.turn, this.turn + 2.4, ease.outCubic); // the figure gives way
    const v = faithValue(t, audio.duration, this.marks);
    const u = this.sky.u;
    (u.sun!.value as THREE.Vector3).set(AX, AY, 40 + 60 * open);
    u.disc!.value = 0;
    u.glow!.value = 0.22 + 0.5 * open + f.a.kick * 0.22;
    u.haze!.value = H + 200; u.hazeI!.value = 0;
    u.t!.value = t;
    this.sky.render(renderer, out);

    const c = this.layer.ctx;
    this.layer.clear();
    const jit = f.a.snare * 5;
    if (!crown) {
      // the cage: bars with a slow sway; they part from the middle when the page turns
      const N = 34;
      for (let i = 0; i < N; i++) {
        const s = (i + 0.5) / N - 0.5;
        const part = Math.sign(s) * open * (0.5 - Math.abs(s)) * 520;
        const x0 = AX + s * 1050 + part;
        const edge = 1 - Math.pow(Math.abs(s) * 2, 2.2);
        c.beginPath();
        for (let y = -20; y <= H + 20; y += 36) {
          const x = x0 + noise2(i * 0.6, y * 0.004 + t * 0.25, 2) * 16 + (hash(i, Math.floor(t * 30)) - 0.5) * jit;
          if (y === -20) c.moveTo(x, y); else c.lineTo(x, y);
        }
        const lit = Math.exp(-((s * 5) ** 2));
        c.strokeStyle = rgba(lit > 0.4 ? 'ash' : 'graphite', (0.25 + 0.6 * edge) * (0.75 + 0.25 * f.a.kick));
        c.lineWidth = 1.2 + 2.2 * lit + f.a.kick * 1.2;
        c.stroke();
      }
      // cross-ties
      for (const y of [150, H - 150]) {
        c.strokeStyle = rgba('graphite', 0.7 * (1 - open)); c.lineWidth = 2;
        c.beginPath(); c.moveTo(AX - 540, y + noise2(t * 0.3, y, 1) * 6); c.lineTo(AX + 540, y - noise2(t * 0.3, y, 4) * 6); c.stroke();
      }
    } else {
      // the crown: two braided rings and their thorns, turning; it loosens as the fire catches
      const R = 300 + 70 * open + f.a.kick * 8, rot = t * 0.07;
      for (let ring = 0; ring < 3; ring++) {
        c.beginPath();
        for (let i = 0; i <= 240; i++) {
          const a = (i / 240) * TAU;
          const r = R + Math.sin(a * 9 + ring * 2.1 + t * 0.4) * 16 + Math.cos(a * 4 - ring) * 8;
          const x = AX + Math.cos(a + rot) * r, y = AY + Math.sin(a + rot) * r * 0.96;
          if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
        }
        c.strokeStyle = rgba(ring === 1 ? 'ash' : 'graphite', 0.85 - 0.3 * open); c.lineWidth = 1.6;
        c.stroke();
      }
      for (let i = 0; i < 64; i++) {
        const a = (i / 64) * TAU + hash(i, 1) * 0.08 + rot;
        const r = R + Math.sin(a * 9) * 10, len = (26 + 60 * hash(i, 2)) * (1 - 0.5 * open) * (1 + f.a.snare * 0.3);
        const tilt = (hash(i, 3) - 0.5) * 1.5, dir = hash(i, 5) < 0.3 ? -1 : 1;
        c.strokeStyle = rgba('bone', 0.5 + 0.4 * hash(i, 4)); c.lineWidth = 1.3;
        c.beginPath();
        c.moveTo(AX + Math.cos(a) * r, AY + Math.sin(a) * r * 0.96);
        c.lineTo(AX + Math.cos(a) * r + Math.cos(a + tilt) * len * dir, AY + Math.sin(a) * r * 0.96 + Math.sin(a + tilt) * len * dir);
        c.stroke();
      }
    }

    // ---- lyric
    for (const { line, out: o } of activeLines(lyrics, t, this.ctx.start, this.ctx.end, 1.4)) {
      drawLyricBlock(c, line, t, { x: 120, y: 520, maxW: 940, maxSize: 210, minSize: 64, align: 'left', rowChars: 13, slab: true }, o);
    }
    drawFaithReadout(c, 120, H - 92, v);
    caption(c, typed(crown ? 'PLATE 03 — THE CROWN' : 'PLATE 02 — THE CAGE', t, this.ctx.start + 0.2), 120, 96);
    marginRef(c, lyrics, t, W - 96, H - 78);
    comp.draw(renderer, this.layer.upload(), out);

    this.lb.clear();
    const ex = AX + Math.sin(t * 0.8) * 14, ey = AY + Math.cos(t * 1.1) * 12;
    sparkParticles(this.lb, t, (tb) => ({ x: AX + Math.sin(tb * 0.8) * 14, y: AY + Math.cos(tb * 1.1) * 12 }), { rate: (tb) => 14 + 110 * prog(tb, this.turn, this.turn + 2), rateMax: 124, life: 0.8, speed: 150, gravity: 120, seed: crown ? 6 : 5 });
    ember(this.lb, ex, ey, t, v * 0.5 + open * 0.6 + f.a.vocal * 0.15);
    embers(this.lb, t, { n: Math.round(70 * open), x0: AX - 320, x1: AX + 320, y0: AY - 200, y1: AY + 200, rise: 30, seed: 12, intensity: 0.8 });
    this.lb.render(renderer, out);

    return { bloom: 0.7 + 0.3 * open, halation: 0.3, vignette: 0.45, zoom: 1 + 0.008 * f.a.kick, shake: [(hash(Math.floor(t * 60), 1) - 0.5) * f.a.snare * 3, 0] as [number, number] };
  }
}

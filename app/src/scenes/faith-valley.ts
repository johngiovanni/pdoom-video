// Chorus plate: the valley. A line-drawn valley floor runs toward a light on the horizon; the lyric
// stands over it as a slab. params.n = 1, 2, 3 (each chorus: more light), params.finale for the last.
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D, W, H } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { rgba } from '../engine/palette';
import { F, font } from '../engine/type';
import { clamp, ease, lerp, noise2, prog, smoothstep } from '../engine/util';
import { activeLines, caption, drawFaithReadout, drawLyricBlock, ember, embers, faithValue, marginRef, rays, skyPass, typed } from './faith-kit';

const HY = 650, CX = W / 2, FOC = 620, CAM = 1.55;
const ROWS = 44, COLS = 96, DZ = 0.9, HALF = 17;

export default class FaithValley extends Scene {
  sky = skyPass();
  layer = new Layer2D();
  lb = new LineBatch(4000, { screen2D: true, blend: 'add' });
  marks: number[] = [];

  override init() {
    this.marks = this.ctx.lyrics.find('walk through the valley').map((l) => l.start);
    const still = this.ctx.lyrics.find("still here")[0];
    if (still) this.marks.push(still.start);
  }

  height(x: number, zi: number) {
    const a = Math.abs(x);
    const wall = Math.pow(smoothstep(1.6, 13, a), 1.25) * 6.2;
    const n = noise2(x * 0.33 + 40, zi * 0.29, 3) * 0.6 + noise2(x * 0.9, zi * 0.8, 5) * 0.25;
    return wall * (0.55 + 0.6 * (n + 0.6)) + n * 0.08;
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp, lyrics, audio } = this.ctx;
    const t = f.t, n: number = this.ctx.params.n ?? 1, finale = !!this.ctx.params.finale;
    const level = [0.45, 0.7, 1][n - 1] ?? 1;
    const lastLine = lyrics.linesIn(this.ctx.start, this.ctx.end).pop();
    const tail = finale && lastLine ? prog(t, Math.max(lastLine.end + 1, this.ctx.end - 14), this.ctx.end - 0.6) : 0; // the outro
    const rise = prog(f.lt, 0, 6, ease.outCubic);
    const R = lerp(70, 150, level) + rise * 26 + f.a.kick * 10 + tail * 60;
    const sunY = HY + lerp(46, 0, level) - rise * 24 - tail * 50;
    const u = this.sky.u;
    (u.sun!.value as THREE.Vector3).set(CX, sunY, R);
    u.disc!.value = 1;
    u.glow!.value = 0.5 + level * 0.7 + f.a.kick * 0.35 + f.a.rms * 0.25;
    u.haze!.value = HY; u.hazeI!.value = 0.5 + level * 0.7;
    u.t!.value = t;
    this.sky.render(renderer, out);

    const c = this.layer.ctx;
    this.layer.clear();
    rays(c, CX, sunY, R + 14, 240 + 380 * level, t, 96, 0.22 + 0.3 * level + 0.25 * f.a.snare);

    // ---- the valley: rows of the floor, far to near, each hiding what lies behind it
    const speed = 5.2 + 1.2 * level;
    const s = t * speed, shift = Math.floor(s / DZ), frac = s / DZ - shift;
    const kicks = audio.events('kick', t - 1.6, t);
    c.lineJoin = 'round';
    for (let k = ROWS; k >= 0; k--) {
      const z = (k - frac) * DZ + 1.1;
      if (z < 0.7) continue;
      const zi = k + shift;
      const fade = clamp(1 - z / (ROWS * DZ), 0, 1);
      let wave = 0;
      for (const [kt, ks] of kicks) { const zw = (t - kt) * 26 + 1; wave += ks * 0.22 * Math.exp(-((z - zw) ** 2) / 2.2) * Math.exp(-(t - kt) * 1.6); }
      c.beginPath();
      for (let i = 0; i <= COLS; i++) {
        const x = lerp(-HALF, HALF, i / COLS);
        const y = this.height(x, zi) + wave * Math.exp(-(x * x) / 30);
        const sx = CX + (FOC * x) / z, sy = HY + (FOC * (CAM - y)) / z;
        if (i === 0) c.moveTo(sx, sy); else c.lineTo(sx, sy);
      }
      c.strokeStyle = wave > 0.02 ? rgba('ember', clamp(fade * 1.2 + wave * 2, 0, 1)) : rgba('bone', Math.pow(fade, 1.6) * 0.8 + 0.05);
      c.lineWidth = lerp(0.8, 1.7, fade);
      c.save();
      c.lineTo(W + 400, H + 400); c.lineTo(-400, H + 400); c.closePath();
      c.fillStyle = rgba('ink', 1); c.fill();
      c.restore();
      c.stroke();
    }
    // the path: a hot line down the middle of the floor, toward the light
    const g = c.createLinearGradient(0, HY, 0, H);
    g.addColorStop(0, rgba('ember', 0.95)); g.addColorStop(1, rgba('signal', 0));
    c.strokeStyle = g; c.lineWidth = 1.6;
    c.beginPath(); c.moveTo(CX, HY + 6); c.lineTo(CX, H); c.stroke();

    // ---- lyric
    for (const { line, out: o } of activeLines(lyrics, t, this.ctx.start, this.ctx.end, 2.2)) {
      drawLyricBlock(c, line, t, { x: CX, y: 240, maxW: 1480, maxSize: 170, minSize: 70, align: 'center', rowChars: 20, slab: true }, o);
    }
    // ---- margins
    const v = faithValue(t, audio.duration, this.marks);
    drawFaithReadout(c, 96, H - 92, v, 0.9 * (1 - tail));
    caption(c, typed(finale ? 'PLATE 05 — STILL HERE' : `PLATE 0${n + 1} — THE VALLEY`, t, this.ctx.start + 0.2), 96, 96, 0.6 * (1 - tail));
    marginRef(c, lyrics, t, W - 96, H - 78);
    if (tail > 0) {
      const a = prog(tail, 0.08, 0.3);
      c.textAlign = 'center';
      c.fillStyle = rgba('bone', a);
      c.font = font(F.archivo(125, 900), 92);
      c.fillText('FAITH AMID DOUBT', CX, 230);
      caption(c, 'A LYRIC PLATE IN FIVE PARTS', CX, 280, 0.7 * a, 'center');
    }
    comp.draw(renderer, this.layer.upload(), out);

    // ---- embers and the ember itself
    this.lb.clear();
    embers(this.lb, t, { n: Math.round(40 + 160 * level), x0: 0, x1: W, y0: HY - 40, y1: H + 60, rise: 26, seed: n, intensity: 0.5 + level * 0.6 });
    ember(this.lb, CX, sunY - R - 40 - 14 * Math.sin(t * 1.3), t, v);
    this.lb.render(renderer, out);

    const hit = f.a.kick;
    return { bloom: 0.75 + 0.3 * level + 0.2 * hit, halation: 0.4, zoom: 1 + 0.012 * hit, exposure: 1 + 0.08 * hit, fade: finale ? prog(t, this.ctx.end - 2.2, this.ctx.end - 0.2) : 0, flash: f.lt < 0.6 ? 0.5 * Math.pow(0.5, f.lt / 0.12) : 0 };
  }
}

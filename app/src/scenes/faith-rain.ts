// Bridge plate: the downpour. No drums: rain over a road that runs to a lit door on the horizon
// ("I've been the prodigal … mercy met me"). The lyric is set in the serif, quiet; the door opens
// through the plate and floods the frame into the last chorus.
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D, W, H } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { LIN, rgba } from '../engine/palette';
import { F } from '../engine/type';
import { ease, hash, lerp, prog } from '../engine/util';
import { activeLines, caption, drawFaithReadout, drawLyricBlock, embers, faithValue, marginRef, skyPass, typed } from './faith-kit';

const HY = 660, CX = W / 2;

export default class FaithRain extends Scene {
  sky = skyPass();
  layer = new Layer2D();
  lb = new LineBatch(5000, { screen2D: true, blend: 'add' });
  marks: number[] = [];
  shakeAt = 1e9;
  danceAt = 1e9;

  override init() {
    const ly = this.ctx.lyrics;
    this.marks = ly.find('walk through the valley').map((l) => l.start);
    this.shakeAt = ly.find('storms rage')[0]?.start ?? 1e9;
    this.danceAt = ly.find('dancing')[0]?.start ?? 1e9;
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp, lyrics, audio } = this.ctx;
    const t = f.t, p = f.p;
    const door = prog(p, 0.05, 1, ease.inCubic); // the door opens
    const flood = prog(t, this.ctx.end - 1.6, this.ctx.end, ease.inCubic);
    const u = this.sky.u;
    (u.sun!.value as THREE.Vector3).set(CX, HY - 30, 30 + 40 * door);
    u.disc!.value = 0;
    u.glow!.value = 0.3 + 1.0 * door + 2.5 * flood;
    u.haze!.value = HY; u.hazeI!.value = 0.25 + 0.8 * door;
    u.t!.value = t;
    this.sky.render(renderer, out);

    const c = this.layer.ctx;
    this.layer.clear();
    // horizon and the road
    c.strokeStyle = rgba('ash', 0.5); c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(0, HY); c.lineTo(W, HY); c.stroke();
    for (const s of [-1, 1]) {
      c.strokeStyle = rgba('bone', 0.6); c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(CX + s * 14, HY); c.lineTo(CX + s * 620, H + 10); c.stroke();
    }
    // centre dashes, running toward us
    for (let i = 0; i < 14; i++) {
      const z = ((i + (t * 0.5) % 1) / 14) ** 2.2;
      const y0 = lerp(HY, H + 10, z), y1 = lerp(HY, H + 10, Math.min(1, z + 0.02 + z * 0.08));
      c.strokeStyle = rgba('ember', 0.25 + 0.6 * z); c.lineWidth = 1 + 3 * z;
      c.beginPath(); c.moveTo(CX, y0); c.lineTo(CX, y1); c.stroke();
    }
    // puddle rings where the rain lands
    for (let i = 0; i < 26; i++) {
      const life = 1.1 + hash(i, 1), ph = (t / life + hash(i, 2)) % 1, gen = Math.floor(t / life + hash(i, 2));
      const z = hash(i, gen, 3) ** 1.6, x = CX + (hash(i, gen, 4) - 0.5) * W * (0.2 + z), y = lerp(HY + 8, H, z);
      c.strokeStyle = rgba('bone', 0.35 * (1 - ph)); c.lineWidth = 1;
      c.beginPath(); c.ellipse(x, y, ph * 60 * (0.2 + z), ph * 14 * (0.2 + z), 0, 0, Math.PI * 2); c.stroke();
    }
    // the door: a standing bar of light on the horizon
    const dw = 10 + 26 * door + 900 * flood, dh = 70 + 40 * door + 800 * flood;
    c.fillStyle = rgba('bone', 0.9); c.fillRect(CX - dw / 2, HY - dh, dw, dh);
    c.fillStyle = rgba('ember', 0.9); c.fillRect(CX - dw / 2 - 3, HY - dh, 3, dh); c.fillRect(CX + dw / 2, HY - dh, 3, dh);

    for (const { line, out: o } of activeLines(lyrics, t, this.ctx.start, this.ctx.end, 1.6)) {
      drawLyricBlock(c, line, t, { x: CX, y: 300, maxW: 1500, maxSize: 150, minSize: 84, align: 'center', rowChars: 22, family: F.serif(600, true), upper: false, leading: 1.0 }, o);
    }
    drawFaithReadout(c, 96, H - 92, faithValue(t, audio.duration, this.marks));
    caption(c, typed('PLATE 04 — THE DOWNPOUR', t, this.ctx.start + 0.2), 96, 96);
    marginRef(c, lyrics, t, W - 96, H - 78);
    comp.draw(renderer, this.layer.upload(), out);

    // rain: stateless streaks; after "dancing in the downpour" the light catches them
    this.lb.clear();
    const lit = prog(t, this.danceAt, this.danceAt + 3);
    for (let i = 0; i < 900; i++) {
      const sp = 0.9 + hash(i, 1) * 0.9, ph = (t * sp + hash(i, 2)) % 1, gen = Math.floor(t * sp + hash(i, 2));
      const x = hash(i, gen, 3) * (W + 300) - 100, y = ph * (H + 200) - 100, len = 26 + 50 * hash(i, 4);
      const near = hash(i, 5);
      const k = 0.1 + 0.35 * near + 0.3 * lit * Math.exp(-(((x - CX) / 500) ** 2));
      const col: [number, number, number] = lit > 0 && hash(i, 6) < lit * 0.5 ? [LIN.ember[0] * 2, LIN.ember[1] * 2, LIN.ember[2] * 2] : [LIN.bone[0], LIN.bone[1], LIN.bone[2]];
      this.lb.seg2(x, y, x - len * 0.16, y - len, 0.8 + near, col, k);
    }
    embers(this.lb, t, { n: Math.round(120 * lit), x0: CX - 500, x1: CX + 500, y0: HY - 100, y1: H, rise: 30, seed: 21 });
    this.lb.render(renderer, out);

    const sh = Math.pow(0.5, Math.max(0, t - this.shakeAt) / 1.2) * (t >= this.shakeAt ? 1 : 0);
    return { bloom: 0.7 + 0.5 * door, halation: 0.4, vignette: 0.5, flash: flood * 0.9, shake: [(hash(Math.floor(t * 60), 1) - 0.5) * 14 * sh, (hash(Math.floor(t * 60), 2) - 0.5) * 10 * sh] as [number, number] };
  }
}

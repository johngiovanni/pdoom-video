// Opening plate: before dawn. Layered ridgelines in the dark, one ember climbing; the light is still
// under the horizon when the first lines come ("When the shadows fall, still I rise").
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D, W, H } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { rgba } from '../engine/palette';
import { F, font } from '../engine/type';
import { ease, fbm1, hash, lerp, prog, smoothstep } from '../engine/util';
import { sparkParticles } from './_motifs';
import { activeLines, caption, drawFaithReadout, drawLyricBlock, ember, embers, marginRef, skyPass, typed } from './faith-kit';

const HY = 640, RIDGES = 9;

export default class FaithDawn extends Scene {
  sky = skyPass();
  layer = new Layer2D();
  lb = new LineBatch(3000, { screen2D: true, blend: 'add' });

  emberAt(t: number) {
    // climbs from below the frame to above the ridges, drifting
    const p = prog(t, 1.5, this.ctx.end - 1, ease.inOutQuad);
    return { x: W / 2 + Math.sin(t * 0.45) * 90 * (1 - p * 0.6) + Math.sin(t * 1.9) * 8, y: lerp(H + 30, HY - 210, p) + Math.sin(t * 1.1) * 10 };
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp, lyrics } = this.ctx;
    const t = f.t;
    const rise = lyrics.find('still I rise')[0];
    const lift = rise ? prog(t, rise.start, this.ctx.end, ease.inOutQuad) : f.p; // the light gathers after "still I rise"
    const build = prog(t, this.ctx.end - 13, this.ctx.end, ease.inCubic);
    const u = this.sky.u;
    (u.sun!.value as THREE.Vector3).set(W / 2, HY + 150 - lift * 70, 110);
    u.disc!.value = 0;
    u.glow!.value = 0.12 + lift * 0.55 + f.a.bass * 0.5 + build * 0.3;
    u.haze!.value = HY; u.hazeI!.value = 0.1 + lift * 0.7 + f.a.bass * 0.6;
    u.t!.value = t;
    this.sky.render(renderer, out);

    const c = this.layer.ctx;
    this.layer.clear();
    // stars
    for (let i = 0; i < 140; i++) {
      const x = hash(i, 1) * W, y = hash(i, 2) * (HY - 40);
      const tw = 0.35 + 0.65 * Math.abs(Math.sin(t * (0.4 + hash(i, 3)) + i));
      c.fillStyle = rgba('bone', 0.5 * tw * (1 - lift * 0.5) * prog(t, 0.2, 3));
      c.fillRect(x, y, 1.6, 1.6);
    }
    // ridges, far to near: each a line that hides what is behind it
    const push = 1 + 0.25 * prog(t, 0, this.ctx.end, ease.inOutQuad);
    for (let k = 0; k < RIDGES; k++) {
      const d = k / (RIDGES - 1); // 0 far .. 1 near
      const base = HY + (10 + d * d * 430) * push - 20;
      const amp = lerp(60, 230, d), fq = lerp(0.0036, 0.0013, d), drift = t * lerp(3, 26, d);
      c.beginPath();
      for (let x = -20; x <= W + 20; x += 12) {
        const y = base - (fbm1((x + drift) * fq + k * 13.7, 4, k) * 0.5 + 0.5) * amp - Math.exp(-(((x - W / 2) / 900) ** 2)) * -30 * d;
        if (x === -20) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.save();
      c.lineTo(W + 20, H + 20); c.lineTo(-20, H + 20); c.closePath();
      c.fillStyle = rgba('ink', 1); c.fill();
      c.restore();
      c.strokeStyle = k < 2 ? rgba('ember', 0.25 + 0.6 * lift) : rgba('bone', lerp(0.22, 0.75, d) * prog(t, 0.5 + k * 0.35, 3 + k * 0.35));
      c.lineWidth = lerp(1, 1.8, d);
      c.stroke();
    }

    // title
    const ta = Math.min(prog(t, 3.2, 5.5), 1 - prog(t, 17, 20));
    if (ta > 0) {
      c.textAlign = 'center'; c.textBaseline = 'alphabetic';
      c.fillStyle = rgba('bone', ta);
      c.font = font(F.archivo(125, 900), 104);
      c.letterSpacing = `${lerp(18, 6, prog(t, 3.2, 20, ease.outCubic))}px`;
      c.fillText('FAITH AMID DOUBT', W / 2, 330);
      c.letterSpacing = '0px';
      caption(c, typed('A GOSPEL TRAP LYRIC PLATE', t, 5.2), W / 2, 384, 0.7 * ta, 'center');
    }
    for (const { line, out: o } of activeLines(lyrics, t, this.ctx.start, this.ctx.end, 3.2)) {
      drawLyricBlock(c, line, t, { x: W / 2, y: 300, maxW: 1400, maxSize: 200, align: 'center', rowChars: 18, slab: true }, o);
    }
    drawFaithReadout(c, 96, H - 92, 0.08 + 0.04 * lift + 0.01 * Math.sin(t * 2.3), 0.9 * prog(t, 8, 10));
    caption(c, typed('PLATE 01 — BEFORE DAWN', t, 1), 96, 96, 0.6);
    marginRef(c, lyrics, t, W - 96, H - 78);
    comp.draw(renderer, this.layer.upload(), out);

    this.lb.clear();
    const e = this.emberAt(t);
    sparkParticles(this.lb, t, (tb) => this.emberAt(tb), { rate: 26, life: 0.9, speed: 70, gravity: 60, intensity: 0.7, seed: 4 });
    ember(this.lb, e.x, e.y, t, 0.1 + 0.25 * lift + f.a.vocal * 0.2);
    embers(this.lb, t, { n: Math.round(60 * build), x0: 200, x1: W - 200, y0: HY, y1: H, rise: 22, seed: 9, intensity: 0.7 });
    this.lb.render(renderer, out);

    return { bloom: 0.7 + 0.25 * f.a.bass, halation: 0.35, vignette: 0.5, fade: 1 - prog(t, 0, 2.2), exposure: 1 + 0.12 * smoothstep(0.3, 1, f.a.bass) };
  }
}

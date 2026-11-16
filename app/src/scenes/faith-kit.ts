// Shared pieces of the "Faith Amid Doubt" plates: the karaoke lyric block, the faith readout,
// the ember (this video's spark) and small drawing helpers.
import * as THREE from 'three';
import { FSPass } from '../engine/gl';
import type { LineBatch } from '../engine/lines';
import { LIN, rgba } from '../engine/palette';
import { sparkHead } from './_motifs';
import { F, font, measure } from '../engine/type';
import { Lyrics, norm, type Line, type Word } from '../engine/lyrics';
import { TAU, clamp, ease, hash, lerp, prog, smoothstep } from '../engine/util';

/** Words that stay lit in signal orange once sung. */
const KEY = new Set(['faith', 'rise', 'grace', 'hallelujah', 'love', 'mercy', 'holy', 'light', 'miracles', 'redemption', 'peace', 'promises', 'victory', 'found', 'fire', 'anchor', 'life']);

export interface BlockOpts {
  /** Anchor: left edge (align left) or centre (align centre) of the block, and its vertical centre. */
  x: number; y: number;
  maxW: number;
  maxSize?: number; minSize?: number;
  align?: 'left' | 'center';
  family?: string;
  upper?: boolean;
  /** Target characters per row before a line is broken. */
  rowChars?: number;
  leading?: number;
  /** Rows are each fitted to the block width (a justified slab) instead of sharing one size. */
  slab?: boolean;
}

interface Placed { word: Word; text: string; x: number; y: number; size: number; w: number; row: number }
interface Block { placed: Placed[]; w: number; h: number }

const cache = new Map<string, Block>();

/** Break a line into rows of about `rowChars` characters (balanced), never splitting a word. */
function rows(words: Word[], rowChars: number): Word[][] {
  const total = words.reduce((s, w) => s + w.w.length + 1, -1);
  const n = clamp(Math.round(total / rowChars), 1, 4);
  if (n === 1) return [words];
  const out: Word[][] = [];
  let cur: Word[] = [], len = 0, left = total, k = n;
  for (let i = 0; i < words.length; i++) {
    const w = words[i]!;
    const target = left / k;
    if (cur.length && len + w.w.length / 2 > target && k > 1) { out.push(cur); left -= len; k--; cur = []; len = 0; }
    cur.push(w); len += w.w.length + 1;
  }
  if (cur.length) out.push(cur);
  return out;
}

function build(line: Line, o: BlockOpts): Block {
  const fam = o.family ?? F.archivo(75, 900);
  const up = o.upper ?? true, maxSize = o.maxSize ?? 150, minSize = o.minSize ?? 54, leading = o.leading ?? 0.94;
  const rs = rows(line.words, o.rowChars ?? 16);
  const txt = (w: Word) => (up ? w.w.toUpperCase() : w.w);
  const rowText = rs.map((r) => r.map(txt).join(' '));
  const fit = (s: string) => clamp((o.maxW / Math.max(1, measure(s, fam, 100))) * 100, minSize, maxSize);
  const shared = Math.min(...rowText.map(fit));
  const placed: Placed[] = [];
  let y = 0, bw = 0;
  rs.forEach((r, ri) => {
    const size = o.slab ? Math.min(fit(rowText[ri]!), shared * 1.9) : shared;
    const space = measure(' ', fam, size) || size * 0.22;
    const ws = r.map((w) => measure(txt(w), fam, size));
    const rw = ws.reduce((a, b) => a + b, 0) + space * (r.length - 1);
    bw = Math.max(bw, rw);
    let x = o.align === 'center' ? -rw / 2 : 0;
    y += size * leading;
    r.forEach((w, i) => { placed.push({ word: w, text: txt(w), x, y, size, w: ws[i]!, row: ri }); x += ws[i]! + space; });
  });
  for (const p of placed) p.y -= y / 2 - p.size * 0.1; // centre the block on the anchor
  return { placed, w: bw, h: y };
}

/**
 * Draw one lyric line as a karaoke block: words rise in as their row starts, wait in graphite, burn
 * through in signal as they are sung and settle in bone (key words stay lit). `out` 0..1 fades the
 * whole block away upward. Returns the position of the word being sung (for the ember), if any.
 */
export function drawLyricBlock(c: CanvasRenderingContext2D, line: Line, t: number, o: BlockOpts, out = 0): { x: number; y: number } | null {
  const key = `${line.i}|${o.x}|${o.y}|${o.maxW}|${o.maxSize}|${o.align}|${o.family}|${o.rowChars}|${o.slab}|${o.upper}`;
  let b = cache.get(key);
  if (!b) cache.set(key, (b = build(line, o)));
  const fam = o.family ?? F.archivo(75, 900);
  let head: { x: number; y: number } | null = null;
  c.save();
  c.textBaseline = 'alphabetic';
  c.textAlign = 'left';
  const rowStart: number[] = [];
  for (const p of b.placed) rowStart[p.row] = Math.min(rowStart[p.row] ?? 1e9, p.word.start);
  for (const p of b.placed) {
    const w = p.word;
    const appear = Math.min(w.start, rowStart[p.row]! + 0.03 * w.index) - 0.16;
    const a = prog(t, appear, appear + 0.2, ease.outCubic);
    if (a <= 0) continue;
    const sung = Lyrics.wordProgress(w, t);
    const hot = Math.pow(0.5, Math.max(0, t - w.end) / 0.22); // afterglow once sung
    const pop = sung > 0 ? 1 + 0.06 * Math.pow(0.5, (t - w.start) / 0.09) : 1;
    const x = o.x + p.x, y = o.y + p.y + (1 - a) * p.size * 0.35 - out * out * 60;
    const alpha = a * (1 - out);
    c.font = font(fam, p.size);
    c.save();
    c.translate(x + p.w / 2, y - p.size * 0.35);
    c.scale(pop, pop);
    c.translate(-p.w / 2, p.size * 0.35);
    // waiting / settled
    const isKey = KEY.has(norm(w.w));
    if (sung <= 0) { c.fillStyle = rgba('graphite', 0.55 * alpha); c.fillText(p.text, 0, 0); }
    else {
      c.fillStyle = sung >= 1 ? (isKey ? rgba('signal', alpha) : rgba('bone', alpha * lerp(1, 0.92, 1 - hot))) : rgba('graphite', 0.55 * alpha);
      c.fillText(p.text, 0, 0);
      if (sung < 1 || hot > 0.02) {
        // the burn: a signal wipe while the word is sung, cooling to bone after
        c.save();
        c.beginPath(); c.rect(-4, -p.size * 1.1, (p.w + 8) * sung, p.size * 1.5); c.clip();
        c.fillStyle = sung < 1 ? rgba('signal', alpha) : rgba('ember', alpha * hot * (isKey ? 0 : 0.9));
        c.fillText(p.text, 0, 0);
        c.restore();
      }
      if (sung < 1) head = { x: x + p.w * sung, y: y - p.size * 0.36 };
    }
    c.restore();
  }
  c.restore();
  return head;
}

/** The lines to show at t inside [t0, t1): the line being sung and, briefly, the one leaving. */
export function activeLines(lyrics: Lyrics, t: number, t0: number, t1: number, hold = 1.2): { line: Line; out: number }[] {
  const ls = lyrics.lines.filter((l) => l.start >= t0 - 0.5 && l.start < t1);
  const res: { line: Line; out: number }[] = [];
  for (let i = 0; i < ls.length; i++) {
    const l = ls[i]!, next = ls[i + 1];
    const leave = Math.min(next ? next.start - 0.18 : 1e9, l.end + hold);
    if (t < l.start - 0.2 || t > leave + 0.22) continue;
    res.push({ line: l, out: smoothstep(leave, leave + 0.2, t) });
  }
  return res;
}

/** Faith over the song: low and wavering in the verses, stepping up with each chorus. */
export function faithValue(t: number, dur: number, marks: number[]): number {
  // marks: start times of the choruses (each lifts the estimate)
  const vals = [0.12, 0.47, 0.78, 1.0];
  let v = vals[0]!;
  marks.forEach((m, i) => { v = lerp(v, vals[Math.min(i + 1, vals.length - 1)]!, prog(t, m, m + 1.2, ease.outExpo)); });
  const settle = marks.length ? smoothstep(marks[marks.length - 1]!, marks[marks.length - 1]! + 2, t) : 0;
  const waver = (hash(Math.floor(t * 4)) - 0.5) * 0.03 * (1 - settle);
  return clamp(v + waver + 0.04 * (t / dur) * (1 - settle), 0, 1);
}

/** Small instrument: FAITH / DOUBT with a tick bar (the P(doom) readout's counterpart). */
export function drawFaithReadout(c: CanvasRenderingContext2D, x: number, y: number, v: number, alpha = 1) {
  c.save();
  c.textBaseline = 'alphabetic';
  c.textAlign = 'left';
  c.font = font(F.mono(500), 13);
  c.letterSpacing = '3px';
  c.fillStyle = rgba('bone', 0.6 * alpha);
  c.fillText('FAITH', x, y - 44);
  c.fillStyle = rgba('graphite', 0.9 * alpha);
  c.fillText('DOUBT', x + 190, y - 44);
  c.letterSpacing = '0px';
  c.font = font(F.mono(400), 40);
  c.fillStyle = rgba(v > 0.7 ? 'signal' : 'bone', 0.92 * alpha);
  c.fillText(v.toFixed(2), x, y);
  c.fillStyle = rgba('graphite', 0.9 * alpha);
  c.fillText((1 - v).toFixed(2), x + 190, y);
  for (let i = 0; i < 40; i++) {
    const on = i / 40 < v;
    c.fillStyle = on ? rgba('signal', 0.9 * alpha) : rgba('graphite', 0.5 * alpha);
    c.fillRect(x + i * 7.4, y + 14, 3, on ? 10 : 6);
  }
  c.restore();
}

/** Mono caption, tracked out (the plate's marginal voice). */
export function caption(c: CanvasRenderingContext2D, s: string, x: number, y: number, alpha = 0.6, align: CanvasTextAlign = 'left', size = 13) {
  c.save();
  c.font = font(F.mono(500), size);
  c.letterSpacing = '3px';
  c.textAlign = align;
  c.textBaseline = 'alphabetic';
  c.fillStyle = rgba('ash', alpha);
  c.fillText(s, x, y);
  c.restore();
}

/** Typewriter reveal of a caption. */
export const typed = (s: string, t: number, t0: number, cps = 28) => s.slice(0, Math.max(0, Math.floor((t - t0) * cps)));

// ---------------------------------------------------------------- sky, ember, marginalia

/**
 * Background pass shared by the plates: ink, a light source (a disc with a soft HDR glow, in logical
 * px, y down) and a haze band along a horizon. Everything else is drawn over it.
 */
export function skyPass() {
  return new FSPass(/* glsl */ `
    uniform vec3 sun;      // x, y (logical px, y down), radius
    uniform float disc;    // 0..1 the disc itself
    uniform float glow;    // halo strength
    uniform float haze;    // horizon y (px, y down)
    uniform float hazeI;
    uniform float t;
    void main() {
      vec2 p = vec2(FRAG_PX.x, 1080.0 - FRAG_PX.y);
      float d = length(p - sun.xy);
      vec3 col = C_INK;
      float halo = exp(-d / (sun.z * 2.2 + 60.0)) * 0.55 + exp(-d / (sun.z * 6.0 + 160.0)) * 0.10;
      col += mix(C_BLOOD, C_SIGNAL, sat(halo * 1.5)) * halo * glow;
      float hz = exp(-abs(p.y - haze) / 70.0) * (0.35 + 0.65 * exp(-abs(p.x - sun.x) / 900.0));
      col += C_SIGNAL * hz * hazeI * 0.16;
      float edge = 1.0 - smoothstep(sun.z - 1.5, sun.z + 1.5, d);
      // the disc: hot core, engraved with fine horizontal bands toward its lower limb
      float band = 0.5 + 0.5 * sin((p.y - sun.y) * 0.9 - t * 1.5);
      float low = smoothstep(-0.2, 1.0, (p.y - sun.y) / max(sun.z, 1.0));
      vec3 dc = mix(vec3(1.5, 1.25, 0.95), C_EMBER * 1.15, low) * (1.0 - 0.8 * smoothstep(0.15, 0.7, low) * step(0.5, band));
      col = mix(col, dc, edge * disc);
      fragColor = vec4(col, 1.0);
    }`, { sun: { value: new THREE.Vector3(960, 640, 120) }, disc: { value: 0 }, glow: { value: 0 }, haze: { value: 640 }, hazeI: { value: 0 }, t: { value: 0 } });
}

/** Embers rising from a region: stateless, each ember a short additive streak. */
export function embers(lb: LineBatch, t: number, o: { n: number; x0: number; x1: number; y0: number; y1: number; rise?: number; seed?: number; intensity?: number }) {
  const rise = o.rise ?? 140, I = o.intensity ?? 1, seed = o.seed ?? 1;
  for (let i = 0; i < o.n; i++) {
    const life = 3 + hash(i, seed) * 5;
    const ph = (t / life + hash(i, seed + 1)) % 1;
    const gen = Math.floor(t / life + hash(i, seed + 1));
    const x = lerp(o.x0, o.x1, hash(i, gen, seed + 2)) + Math.sin(t * (0.6 + hash(i, seed + 3)) + i) * 26;
    const y = lerp(o.y1, o.y0, 0) - ph * rise * life * (0.5 + hash(i, seed + 4)) + (o.y1 - o.y0) * hash(i, gen, seed + 5) * -1;
    const k = Math.sin(ph * Math.PI);
    const fl = 0.6 + 0.4 * Math.sin(t * 17 + i * 3.1);
    const c: [number, number, number] = [LIN.ember[0] * 3 * I * fl, LIN.ember[1] * 2.4 * I * fl, LIN.ember[2] * 1.8 * I * fl];
    lb.seg2(x, y, x + 0.6, y - 5 - 6 * hash(i, seed + 6), 1.4 + 1.6 * hash(i, seed + 7), c, k);
  }
}

/** The ember that carries the song: a spark head whose size follows `v`. */
export function ember(lb: LineBatch, x: number, y: number, t: number, v: number) {
  sparkHead(lb, x, y, t, 0.7 + v * 1.6, 0.6 + v * 0.9);
}

/** Scripture in the margin: shown while the lyric that leans on it is sung. */
const REFS: [string, string][] = [
  ['thief in the night', '1 THESS. 5:2'], ['walk through the valley', 'PS. 23:4'], ['holy ground', 'EX. 3:5'],
  ['From the ashes', 'ISA. 61:3'], ['the anchor', 'HEB. 6:19'], ['crown of thorns', 'MATT. 27:29'],
  ['sharper than', 'HEB. 4:12'], ['wrestle', 'GEN. 32:24'], ['prodigal', 'LUKE 15:20'], ['mountains shake', 'PS. 46:2'],
  ['Life after death', '1 COR. 15:55'], ['still I rise', 'MIC. 7:8'], ['carry me', 'ISA. 46:4'],
];
export function marginRef(c: CanvasRenderingContext2D, lyrics: Lyrics, t: number, x: number, y: number, align: CanvasTextAlign = 'right') {
  for (const [q, ref] of REFS) for (const l of lyrics.find(q)) {
    if (t < l.start || t > l.end + 1.6) continue;
    const a = Math.min(prog(t, l.start, l.start + 0.3), 1 - prog(t, l.end + 1.2, l.end + 1.6));
    caption(c, typed(`REF. ${ref}`, t, l.start, 40), x, y, 0.75 * a, align);
    return;
  }
}

/** Rays around a point (hairlines, slowly turning), for the light. */
export function rays(c: CanvasRenderingContext2D, x: number, y: number, r0: number, r1: number, t: number, n: number, alpha: number, upperOnly = true) {
  c.save();
  c.lineWidth = 1;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + t * 0.03;
    if (upperOnly && Math.sin(a) > 0.12) continue;
    const len = r1 * (0.45 + 0.55 * hash(i, 9)) * (0.85 + 0.15 * Math.sin(t * 0.9 + i * 1.7));
    c.strokeStyle = rgba(i % 3 === 0 ? 'ember' : 'bone', alpha * (0.35 + 0.65 * hash(i, 4)));
    c.beginPath();
    c.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0);
    c.lineTo(x + Math.cos(a) * (r0 + len), y + Math.sin(a) * (r0 + len));
    c.stroke();
  }
  c.restore();
}

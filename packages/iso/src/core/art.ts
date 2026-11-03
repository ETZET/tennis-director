/**
 * 像素素材烘焙（ADR 0019）：字符画 → Uint32 像素缓冲，按 art + 换色表缓存。不碰 DOM。
 *
 * - '.' 透明；
 * - 大写字母是槽位（format.ts 的 SLOT），颜色取 slots，缺的取 DEFAULT_SLOTS；槽位颜色写 'none' = 透明（例如"没拿球拍"）；
 * - 小写字母先查素材的 pal，查不到就是对应大写槽位压暗（×0.75）；
 * - 其余字符查素材的 pal；
 * - 'Y'（灯光）槽位的像素是自发光（夜里不压暗）。
 *
 * 烘焙结果是白天色，夜色在画的时候换算（`nightArt`）。
 */
import { DEFAULT_SLOTS, type PixelArt, SLOT, type SlotChar, type SlotColors } from '../art/format';
import { hx, nightP, pk } from './color';
import type { BakedArt } from './graph';

/** 小写字母的压暗系数 */
export const DARK = 0.75;

const byIdentity = new WeakMap<PixelArt, WeakMap<SlotColors, BakedArt>>();
const byKey = new WeakMap<PixelArt, Map<string, BakedArt>>();
const NO_SLOTS: SlotColors = {};

function slotsKey(s: SlotColors): string {
  const ks = Object.keys(s).sort();
  let out = '';
  for (const k of ks) out += `${k}=${s[k as keyof SlotColors]};`;
  return out;
}

function resolve(ch: string, a: PixelArt, slots: SlotColors): { c: number; em: boolean } {
  if (ch === '.' || ch === ' ') return { c: 0, em: false };
  const up = ch.toUpperCase();
  const isSlot = up in SLOT;
  if (isSlot && ch === up) {
    const name = SLOT[up as SlotChar];
    const hex = slots[name] ?? DEFAULT_SLOTS[name];
    if (hex === 'none') return { c: 0, em: false };
    const c = hx(hex);
    return { c: pk(c[0], c[1], c[2]), em: up === 'Y' };
  }
  const fixed = a.pal?.[ch];
  if (fixed !== undefined) {
    if (fixed === 'none') return { c: 0, em: false };
    const c = hx(fixed);
    return { c: pk(c[0], c[1], c[2]), em: false };
  }
  if (isSlot) {
    const name = SLOT[up as SlotChar];
    const hex = slots[name] ?? DEFAULT_SLOTS[name];
    if (hex === 'none') return { c: 0, em: false };
    const c = hx(hex);
    return { c: pk(c[0] * DARK, c[1] * DARK, c[2] * DARK), em: up === 'Y' };
  }
  return { c: 0, em: false };
}

function bake(a: PixelArt, slots: SlotColors): BakedArt {
  const h = a.rows.length;
  let w = 0;
  for (const r of a.rows) w = Math.max(w, r.length);
  const px = new Uint32Array(w * h);
  let emissive: Uint8Array | undefined;
  const memo = new Map<string, { c: number; em: boolean }>();
  for (let j = 0; j < h; j++) {
    const row = a.rows[j] as string;
    for (let i = 0; i < row.length; i++) {
      const ch = row[i] as string;
      let r = memo.get(ch);
      if (!r) {
        r = resolve(ch, a, slots);
        memo.set(ch, r);
      }
      px[j * w + i] = r.c;
      if (r.em && r.c) {
        emissive ??= new Uint8Array(w * h);
        emissive[j * w + i] = 1;
      }
    }
  }
  const out: { -readonly [K in keyof BakedArt]: BakedArt[K] } = { w, h, ox: a.ox, oy: a.oy, px };
  if (emissive) out.emissive = emissive;
  if (a.pts) out.pts = a.pts;
  return out;
}

/** 烘焙一张字符画（按 art 对象和换色表缓存；同一个 slots 对象走快路径） */
export function bakeArt(a: PixelArt, slots: SlotColors = NO_SLOTS): BakedArt {
  let idm = byIdentity.get(a);
  if (!idm) {
    idm = new WeakMap();
    byIdentity.set(a, idm);
  }
  const hit = idm.get(slots);
  if (hit) return hit;
  let km = byKey.get(a);
  if (!km) {
    km = new Map();
    byKey.set(a, km);
  }
  const key = slotsKey(slots);
  let b = km.get(key);
  if (!b) {
    b = bake(a, slots);
    km.set(key, b);
  }
  idm.set(slots, b);
  return b;
}

const flipped = new WeakMap<BakedArt, BakedArt>();

/**
 * 水平翻转，按结果缓存；翻两次回到原图。
 * 锚点在像素缝上（身体以第 ox-1 和第 ox 列之间的缝对称），所以 ox' = w - ox；挂点是像素，x' = w - 1 - x。
 */
export function flipArt(b: BakedArt): BakedArt {
  const hit = flipped.get(b);
  if (hit) return hit;
  const { w, h } = b;
  const px = new Uint32Array(w * h);
  const em = b.emissive ? new Uint8Array(w * h) : undefined;
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      px[j * w + (w - 1 - i)] = b.px[j * w + i] as number;
      if (em && b.emissive) em[j * w + (w - 1 - i)] = b.emissive[j * w + i] as number;
    }
  const out: { -readonly [K in keyof BakedArt]: BakedArt[K] } = { w, h, ox: w - b.ox, oy: b.oy, px };
  if (em) out.emissive = em;
  if (b.pts) {
    const pts: Record<string, readonly [number, number]> = {};
    for (const [k, p] of Object.entries(b.pts)) pts[k] = [w - 1 - p[0], p[1]];
    out.pts = pts;
  }
  flipped.set(b, out);
  flipped.set(out, b);
  return out;
}

const nightCache = new WeakMap<BakedArt, Map<number, Uint32Array>>();

/**
 * 夜色换算后的像素（按夜色和受光量化后缓存）。自发光像素不换算。
 * n、lit 应当已经量化（n 按 1/16，lit 按 1/4），否则缓存会膨胀。
 */
export function nightArt(b: BakedArt, n: number, lit: number): Uint32Array {
  if (n <= 0) return b.px;
  let m = nightCache.get(b);
  if (!m) {
    m = new Map();
    nightCache.set(b, m);
  }
  const key = Math.round(n * 64) * 1000 + Math.round(lit * 100);
  let px = m.get(key);
  if (!px) {
    if (m.size > 48) m.clear();
    px = new Uint32Array(b.px.length);
    for (let i = 0; i < px.length; i++) {
      const v = b.px[i] as number;
      px[i] = v === 0 ? 0 : b.emissive?.[i] ? v : nightP(v, n, lit);
    }
    m.set(key, px);
  }
  return px;
}

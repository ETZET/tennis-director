/**
 * 精灵表：人物 × 动作 × 朝向 × 是否翻转 → 烘焙好的帧（RGBA），带缓存。
 * 翻转的帧先翻材质图、再重新算明暗，所以朝左走的时候光还是从左边来（不会出现"半边脸亮的那一侧跟着人转"）。
 */
import type { BakedArt } from '@td/iso';
import type { AnimName, Member } from './cast';
import { bake, cropMap, flipMap, type MatMap } from './paint';
import { compose, type Facing } from './rig';

export interface Frame extends BakedArt {
  readonly map: MatMap;
}

const cache = new Map<string, Frame[]>();

export function frames(m: Member, anim: AnimName, facing: Facing, flip = false, racketOverride?: boolean): Frame[] {
  const key = `${m.id}|${anim}|${facing}|${flip ? 1 : 0}|${racketOverride ?? '-'}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const a = m.anims[anim];
  const withRacket = racketOverride ?? (anim === 'walk' ? !!m.carry && a.racket : a.racket);
  const out = a.frames.map((p) => {
    let mm = cropMap(compose(m.build, p, facing, withRacket).map, 1);
    if (flip) mm = flipMap(mm);
    const px = bake(mm, m.look);
    return { map: mm, w: mm.w, h: mm.h, ox: mm.ox, oy: mm.oy, px } as Frame;
  });
  cache.set(key, out);
  return out;
}

/** 第 t 秒应该放哪一帧（循环） */
export function frameAt(m: Member, anim: AnimName, t: number): number {
  const a = m.anims[anim];
  const n = a.frames.length;
  const dts = typeof a.dt === 'number' ? new Array(n).fill(a.dt) : a.dt;
  const total = dts.reduce((s: number, v: number) => s + v, 0);
  let u = ((t % total) + total) % total;
  for (let i = 0; i < n; i++) {
    if (u < dts[i]) return i;
    u -= dts[i];
  }
  return n - 1;
}

/** 一个动作一轮多长（秒） */
export function animLength(m: Member, anim: AnimName): number {
  const a = m.anims[anim];
  return typeof a.dt === 'number' ? a.dt * a.frames.length : a.dt.reduce((s, v) => s + v, 0);
}

/** 统一的帧尺寸（所有帧的锚点对齐后的外框），给页面上的格子用 */
export function boxOf(fs: Frame[]): { w: number; h: number; ox: number; oy: number } {
  let l = 0;
  let r = 0;
  let t = 0;
  let b = 0;
  for (const f of fs) {
    l = Math.max(l, f.ox);
    r = Math.max(r, f.w - f.ox);
    t = Math.max(t, f.oy);
    b = Math.max(b, f.h - f.oy);
  }
  return { w: l + r, h: t + b, ox: l, oy: t };
}

/** 把一帧画进 ImageData（按锚点对齐到 (ax, ay)） */
export function blit(img: ImageData, f: Frame, ax: number, ay: number): void {
  const d = new Uint32Array(img.data.buffer);
  const x0 = ax - f.ox;
  const y0 = ay - f.oy;
  for (let j = 0; j < f.h; j++) {
    const y = y0 + j;
    if (y < 0 || y >= img.height) continue;
    for (let i = 0; i < f.w; i++) {
      const v = f.px[j * f.w + i];
      if (!v) continue;
      const x = x0 + i;
      if (x < 0 || x >= img.width) continue;
      d[y * img.width + x] = v;
    }
  }
}

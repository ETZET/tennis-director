/** 帧缓存：人物 × 动作 × 朝向 → 字符画和烘焙好的像素；再加一个把烘焙图画进小画布的工具。 */
import { type BakedArt, bakeArt, type PixelArt } from '@td/iso';
import type { CharDef, ClipName } from './cast';
import { compose, type Facing, silhouette } from './rig';

export interface Anim {
  readonly arts: readonly PixelArt[];
  readonly baked: readonly BakedArt[];
  readonly sil: readonly BakedArt[];
  readonly dts: readonly number[];
  readonly total: number;
}

const cache = new Map<string, Anim>();

export function anim(ch: CharDef, clip: ClipName, facing: Facing): Anim {
  const key = `${ch.id}|${clip}|${facing}`;
  let a = cache.get(key);
  if (!a) {
    const c = ch.clip(clip, facing);
    const arts = c.poses.map((p) => compose(ch.rig, facing, p));
    a = {
      arts,
      baked: arts.map((x) => bakeArt(x, ch.slots)),
      sil: arts.map((x) => bakeArt(silhouette(x), ch.slots)),
      dts: c.dts,
      total: c.dts.reduce((s, d) => s + d, 0),
    };
    cache.set(key, a);
  }
  return a;
}

/** t 秒时是第几帧（循环） */
export function frameAt(a: Anim, t: number): number {
  let r = t % a.total;
  for (let i = 0; i < a.dts.length; i++) {
    r -= a.dts[i] as number;
    if (r < 0) return i;
  }
  return a.dts.length - 1;
}

/** 不同帧（去重后）的数量：成本估计用 */
export function uniqueFrames(ch: CharDef, clips: readonly ClipName[]): number {
  const seen = new Set<string>();
  for (const f of ['front', 'back'] as const)
    for (const c of clips) for (const art of anim(ch, c, f).arts) seen.add(`${f}|${art.rows.join('/')}`);
  return seen.size;
}

/** 低分辨率小画布：按整数倍放大显示 */
export class PixCanvas {
  readonly el: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly img: ImageData;
  private readonly buf: Uint32Array;
  private last = '';
  constructor(
    readonly w: number,
    readonly h: number,
    readonly scale: number,
    readonly bg: number = 0,
  ) {
    this.el = document.createElement('canvas');
    this.el.width = w;
    this.el.height = h;
    this.el.style.width = `${w * scale}px`;
    this.el.style.height = `${h * scale}px`;
    this.el.style.imageRendering = 'pixelated';
    this.ctx = this.el.getContext('2d') as CanvasRenderingContext2D;
    this.img = this.ctx.createImageData(w, h);
    this.buf = new Uint32Array(this.img.data.buffer);
  }
  clear(): void {
    this.buf.fill(this.bg);
  }
  /** 地上的影子 */
  shadow(cx: number, cy: number, rx: number, ry: number, col: number): void {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1 && x >= 0 && y >= 0 && x < this.w && y < this.h) this.buf[y * this.w + x] = col;
      }
  }
  /** 锚点放在 (ax, ay) */
  art(a: BakedArt, ax: number, ay: number, flip = false): void {
    const ox = flip ? a.w - a.ox : a.ox;
    for (let j = 0; j < a.h; j++)
      for (let i = 0; i < a.w; i++) {
        const c = a.px[j * a.w + (flip ? a.w - 1 - i : i)] as number;
        if (!c) continue;
        const x = ax - ox + i;
        const y = ay - a.oy + j;
        if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.buf[y * this.w + x] = c;
      }
  }
  /** 只有内容变了才提交 */
  flush(key: string): void {
    if (key === this.last) return;
    this.last = key;
    this.ctx.putImageData(this.img, 0, 0);
  }
}

/** '#rrggbb' → ABGR */
export function abgr(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return ((0xff << 24) | ((n & 255) << 16) | (n & 0xff00) | ((n >> 16) & 255)) >>> 0;
}

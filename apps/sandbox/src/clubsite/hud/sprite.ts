// 像素精灵：字符格子（icons.ts）→ 小 canvas（1 纹素 = 1 像素），CSS 按整数倍放大（image-rendering: pixelated）。
// 自动加 1 纹素的靛黑描边（八邻域）和往下 1 纹素的深影 —— 画图标时只画里面的形状，描边永远一样粗。
import { INK, INK_SHADOW, KEYS } from './colors';

export interface Sprite {
  rows: readonly string[];
  /** 额外的字符 → 颜色（覆盖 KEYS） */
  keys?: Record<string, number>;
}

/** 像素格子 → RGBA（含描边、投影）。outline=false 时不加描边 */
export function rasterize(
  s: Sprite,
  outline = true,
  shadow = outline,
): { w: number; h: number; px: Uint8ClampedArray<ArrayBuffer> } {
  const h0 = s.rows.length;
  const w0 = Math.max(...s.rows.map((r) => r.length));
  const pad = outline ? 1 : 0;
  const w = w0 + pad * 2;
  const h = h0 + pad * 2 + (shadow ? 1 : 0);
  const px = new Uint8ClampedArray(w * h * 4);
  const solid = new Uint8Array(w * h);
  const put = (x: number, y: number, c: number) => {
    const i = (y * w + x) * 4;
    px[i] = (c >> 16) & 255;
    px[i + 1] = (c >> 8) & 255;
    px[i + 2] = c & 255;
    px[i + 3] = 255;
  };
  for (let y = 0; y < h0; y++) {
    const row = s.rows[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.' || ch === ' ') continue;
      const c = s.keys?.[ch] ?? KEYS[ch];
      if (c === undefined) throw new Error(`sprite: unknown key ${ch}`);
      put(x + pad, y + pad, c);
      solid[(y + pad) * w + x + pad] = 1;
    }
  }
  if (!outline) return { w, h, px };
  const edge = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (solid[y * w + x]) continue;
      let n = false;
      for (let dy = -1; dy <= 1 && !n; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < w && yy < h && solid[yy * w + xx]) {
            n = true;
            break;
          }
        }
      if (n) edge[y * w + x] = 1;
    }
  for (let i = 0; i < w * h; i++) if (edge[i]) put(i % w, Math.floor(i / w), INK);
  if (shadow)
    for (let y = h - 1; y > 0; y--)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (solid[i] || edge[i]) continue;
        const up = (y - 1) * w + x;
        if (solid[up] || edge[up]) put(x, y, INK_SHADOW);
      }
  return { w, h, px };
}

const cache = new Map<string, HTMLCanvasElement>();

/** 精灵 → canvas（缓存）。canvas 是 1 纹素 = 1 像素，用 pixelCanvas 放大 */
export function spriteCanvas(s: Sprite, key: string, outline = true): HTMLCanvasElement {
  const k = `${key}|${outline}`;
  const hit = cache.get(k);
  if (hit) return hit;
  const { w, h, px } = rasterize(s, outline);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.putImageData(new ImageData(px, w, h), 0, 0);
  cache.set(k, c);
  return c;
}

/** 复制一份 canvas，按 scale 倍放大显示（CSS 尺寸 = 纹素 × scale，最近邻） */
export function pixelCanvas(src: HTMLCanvasElement, scale: number, cls = ''): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  (c.getContext('2d') as CanvasRenderingContext2D).drawImage(src, 0, 0);
  c.className = `pxh-px ${cls}`.trim();
  c.style.width = `${src.width * scale}px`;
  c.style.height = `${src.height * scale}px`;
  return c;
}

/** 把 src 画进已有的 canvas（尺寸跟着换） */
export function blit(dst: HTMLCanvasElement, src: HTMLCanvasElement, scale: number) {
  if (dst.width !== src.width || dst.height !== src.height) {
    dst.width = src.width;
    dst.height = src.height;
  }
  const g = dst.getContext('2d') as CanvasRenderingContext2D;
  g.clearRect(0, 0, dst.width, dst.height);
  g.drawImage(src, 0, 0);
  dst.style.width = `${src.width * scale}px`;
  dst.style.height = `${src.height * scale}px`;
}

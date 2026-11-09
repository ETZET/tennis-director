/**
 * 页面上的小画布：把烘好的帧画到低分辨率画布上（整数倍放大由 CSS 的 pixelated 做）。
 * 地面是一条和游戏同色的沙地 / 硬地，带人物脚下的影子。
 */
import type { BakedArt } from '@td/iso';

export function blit(ctx: CanvasRenderingContext2D, a: BakedArt, x: number, y: number, flip = false): void {
  const img = ctx.getImageData(x - (flip ? a.w - a.ox : a.ox), y - a.oy, a.w, a.h);
  const d = new Uint32Array(img.data.buffer);
  for (let j = 0; j < a.h; j++)
    for (let i = 0; i < a.w; i++) {
      const v = a.px[j * a.w + i] as number;
      if (v) d[j * a.w + (flip ? a.w - 1 - i : i)] = v;
    }
  ctx.putImageData(img, x - (flip ? a.w - a.ox : a.ox), y - a.oy);
}

/** 脚下的椭圆影子（压暗地面） */
export function shadow(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number): void {
  const img = ctx.getImageData(x - rx - 1, y - 2, rx * 2 + 2, 4);
  const d = img.data;
  for (let j = 0; j < 4; j++)
    for (let i = 0; i < rx * 2 + 2; i++) {
      const dx = (i - rx - 0.5) / rx;
      const dy = (j - 1.5) / 1.6;
      if (dx * dx + dy * dy > 1) continue;
      const k = (j * (rx * 2 + 2) + i) * 4;
      d[k] = (d[k] as number) * 0.72;
      d[k + 1] = (d[k + 1] as number) * 0.72;
      d[k + 2] = (d[k + 2] as number) * 0.76;
    }
  ctx.putImageData(img, x - rx - 1, y - 2);
}

/** 地面：沙地（带一点颗粒）+ 远处一道草，和 Palm Oasis 同一套颜色 */
export function ground(ctx: CanvasRenderingContext2D, w: number, h: number, kind: 'sand' | 'court' = 'sand'): void {
  const img = ctx.createImageData(w, h);
  const d = img.data;
  const base = kind === 'sand' ? [214, 186, 140] : [62, 120, 140];
  const far = kind === 'sand' ? [176, 196, 128] : [52, 98, 118];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const k = (y * w + x) * 4;
      const n = ((x * 73856093) ^ (y * 19349663)) >>> 0;
      const j = ((n % 13) - 6) * 1.4;
      const c = y < h * 0.3 ? far : base;
      d[k] = (c[0] as number) + j;
      d[k + 1] = (c[1] as number) + j;
      d[k + 2] = (c[2] as number) + j * 0.8;
      d[k + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
}

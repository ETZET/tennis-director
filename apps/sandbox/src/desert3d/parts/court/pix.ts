// 小小的像素画布：在 Uint8 RGBA 上逐像素画（不抗锯齿），做成最近邻采样的贴图。
import * as THREE from 'three';

export type RGB = [number, number, number];

export const hex = (h: number): RGB => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
export const mixRGB = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
export const scaleRGB = (a: RGB, k: number): RGB => [a[0] * k, a[1] * k, a[2] * k];

export class Pix {
  readonly data: Uint8Array;
  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.data = new Uint8Array(w * h * 4);
  }
  set(x: number, y: number, c: RGB) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    this.data[i] = c[0];
    this.data[i + 1] = c[1];
    this.data[i + 2] = c[2];
    this.data[i + 3] = 255;
  }
  get(x: number, y: number): RGB {
    x = Math.max(0, Math.min(this.w - 1, Math.floor(x)));
    y = Math.max(0, Math.min(this.h - 1, Math.floor(y)));
    const i = (y * this.w + x) * 4;
    return [this.data[i], this.data[i + 1], this.data[i + 2]];
  }
  /** 把 (x, y) 往 c 混 t */
  tint(x: number, y: number, c: RGB, t: number) {
    this.set(x, y, mixRGB(this.get(x, y), c, t));
  }
  /** 方形笔刷的直线 */
  line(x0: number, y0: number, x1: number, y1: number, w: number, paint: (x: number, y: number) => void) {
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
    const r0 = -Math.floor((w - 1) / 2);
    for (let i = 0; i <= n; i++) {
      const x = Math.round(x0 + ((x1 - x0) * i) / n);
      const y = Math.round(y0 + ((y1 - y0) * i) / n);
      for (let a = 0; a < w; a++) for (let b = 0; b < w; b++) paint(x + r0 + a, y + r0 + b);
    }
  }
  texture(): THREE.DataTexture {
    const t = new THREE.DataTexture(this.data, this.w, this.h, THREE.RGBAFormat);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.colorSpace = THREE.NoColorSpace; // 颜色管理关了：贴图原值就是屏幕色
    t.needsUpdate = true;
    return t;
  }
}

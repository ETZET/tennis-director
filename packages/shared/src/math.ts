/** 纯数学工具。所有层都可以用；不依赖浏览器或 three.js。 */

export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** smoothstep 缓动，t 在 [0,1]。 */
export const ease = (t: number): number => t * t * (3 - 2 * t);

export interface XZ {
  x: number;
  z: number;
}

export interface XYZ {
  x: number;
  y: number;
  z: number;
}

/** 水平面（xz）上的距离。 */
export const hdist = (a: XZ, b: XZ): number => Math.hypot(b.x - a.x, b.z - a.z);

/** 把角度规整到 (-π, π]。 */
export const wrapAngle = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

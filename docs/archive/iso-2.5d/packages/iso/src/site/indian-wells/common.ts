import { hash } from '../../core/color';
import type { Custom, DrawContext } from '../../core/graph';
import type { Cast } from './ground';

/**
 * build.ts 和 variants.ts 共用的类型和小工具（单独放一个文件，两边互相引用会成环）。
 */

export interface Lamp {
  x: number;
  z: number;
  r: number;
  i: number;
}

/** 风和雨（天空模块每帧写，棕榈和旗子读） */
export interface Weather {
  wind: number;
  rain: number;
}

export type Bounds = { x0: number; x1: number; z0: number; z1: number; y0: number; y1: number };
export type Draw = (r: DrawContext) => void;

/** 变体和升级的画法（variants.ts）要用到的构建工具 */
export interface Kit {
  add(b: Bounds, draw: Draw): Custom;
  addDyn(b: Bounds, draw: Draw): void;
  cast(c: Cast): void;
  lampAt(l: Lamp): void;
  umbrella(x: number, z: number, rad: number, c1: string, c2: string, h?: number): void;
  lightPole(
    x: number,
    z: number,
    h: number,
    o?: { on?: boolean; broken?: boolean; lx?: number; lz?: number; r?: number; i?: number },
  ): void;
  stringLights(pts: readonly (readonly [number, number])[], on: boolean, y?: number): void;
  fenceSeg(x0: number, z0: number, x1: number, z1: number, h: number, o?: { c?: string }): void;
  cone(x: number, z: number): void;
  readonly wx: Weather;
}

/**
 * 夜里算不算"天黑了"（亮灯、发光窗户）。门槛每个节点错开一点（夜色 0.38~0.58，按节点深度 zcur 取哈希，只影响画面）：
 * 黄昏时灯和窗户一盏盏亮起来，天亮时一盏盏灭，不是同一帧全亮全灭。
 */
export const dark = (r: DrawContext): boolean =>
  r.night > 0.38 + 0.2 * hash(Math.round(((r as { zcur?: number }).zcur ?? 0) * 4), 5, 41);

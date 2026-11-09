import type { XYZ } from '@td/shared';

/** 局部坐标；y 省略时视为 0。 */
export interface LocalPoint {
  x: number;
  y?: number;
  z: number;
}

/**
 * 场地坐标系：每块场地有自己的原点和朝向（俱乐部是一块块拼起来的，场地之间不平行）。
 * 局部 x 沿底线到底线方向，z 沿球网方向；原点在球网中心，y=0 是场地表面。
 */
export class CourtFrame {
  readonly oy: number;
  readonly c: number;
  readonly s: number;

  constructor(
    readonly ox: number,
    terraceY: number,
    readonly oz: number,
    /** 绕 y 轴的转角（弧度） */
    readonly a: number,
    /** 半长（含界外） */
    readonly hx: number,
    /** 半宽（含界外） */
    readonly hz: number,
  ) {
    this.oy = terraceY + 0.07;
    this.c = Math.cos(a);
    this.s = Math.sin(a);
  }

  /** 局部 → 世界。 */
  w(p: LocalPoint): XYZ {
    return {
      x: this.ox + p.x * this.c + p.z * this.s,
      y: this.oy + (p.y || 0),
      z: this.oz - p.x * this.s + p.z * this.c,
    };
  }

  /** 世界 → 局部。 */
  l(p: LocalPoint): XYZ {
    const dx = p.x - this.ox;
    const dz = p.z - this.oz;
    return { x: dx * this.c - dz * this.s, y: (p.y || 0) - this.oy, z: dx * this.s + dz * this.c };
  }

  /** 局部朝向 → 世界朝向。 */
  yaw(localYaw: number): number {
    return localYaw + this.a;
  }

  inside(x: number, z: number, margin = 0): boolean {
    const l = this.l({ x, z });
    return Math.abs(l.x) <= this.hx + margin && Math.abs(l.z) <= this.hz + margin;
  }
}

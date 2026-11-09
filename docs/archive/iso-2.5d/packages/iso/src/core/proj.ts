/**
 * 等距投影（ADR 0019，样片的 P / unP）：先绕旋转中心 (cx, cz) 转角 ang，再
 * `sx = ox + (rx - rz) * k`，`sy = oy + (rx + rz) * k / 2 - y * k * HV`。
 * 投影是仿射的：平面多边形的深度（rx + rz）在屏幕上也是仿射的，深度缓冲靠这一点逐像素算。
 * 不碰 DOM，能在 node 里测。
 */

/** 竖直方向的缩放（样片的 HV）：1 米高在屏幕上是 1.225 * k 像素 */
export const HV = 1.225;

/** 精灵档位的基准：1 档时 14 像素高的人正好 1.8 米 */
export const K1 = 14 / 1.8;

/**
 * 某个缩放（k）该用的精灵档位：n 档和 n+1 档的分界在 K1 * sqrt(n(n+1))（两档 k 的几何中点），
 * 所以 7.8 → 1 档、15.6 → 2 档、23.4 → 3 档，11 以下都是 1 档。
 * 档位跟着镜头的目标档位走（IsoCamera 设 Projection.sprite），不跟着缓动中的 k 走。
 */
export function spriteScaleFor(k: number): number {
  let n = 1;
  while (k >= K1 * Math.sqrt(n * (n + 1))) n++;
  return n;
}

/** 双指缩放时换档的回差：要越过分界这么多倍才换，手指抖动不会来回跳 */
export const SPRITE_HYST = 1.08;

/** 双指缩放中：在当前档位 cur 的基础上带回差地取档位 */
export function spriteScaleHyst(k: number, cur: number): number {
  let n = Math.max(1, Math.round(cur));
  while (k >= K1 * Math.sqrt(n * (n + 1)) * SPRITE_HYST) n++;
  while (n > 1 && k < (K1 * Math.sqrt(n * (n - 1))) / SPRITE_HYST) n--;
  return n;
}

export class Projection {
  /** 旋转中心（世界米），固定不随平移变：静态层缓存靠它在平移时只需要挪像素 */
  cx = 0;
  cz = 0;
  ang = 0;
  /** 每米多少缓冲像素 */
  k = 4;
  /** 定住的精灵档位（IsoCamera 按目标档位设）；0 = 按当前 k 算 */
  sprite = 0;
  /** 旋转中心投影到的缓冲像素（整数） */
  ox = 0;
  oy = 0;
  // 旋转矩阵 rx = m0*dx + m1*dz，rz = m2*dx + m3*dz
  m0 = 1;
  m1 = 0;
  m2 = 0;
  m3 = 1;

  setAngle(a: number): void {
    this.ang = a;
    const c = Math.cos(a);
    const s = Math.sin(a);
    // 静止在等距角时去掉浮点误差
    this.m0 = Math.abs(c) < 1e-9 ? 0 : c;
    this.m1 = Math.abs(s) < 1e-9 ? 0 : -s;
    this.m2 = Math.abs(s) < 1e-9 ? 0 : s;
    this.m3 = Math.abs(c) < 1e-9 ? 0 : c;
  }

  copy(o: Projection): this {
    this.cx = o.cx;
    this.cz = o.cz;
    this.k = o.k;
    this.sprite = o.sprite;
    this.ox = o.ox;
    this.oy = o.oy;
    this.ang = o.ang;
    this.m0 = o.m0;
    this.m1 = o.m1;
    this.m2 = o.m2;
    this.m3 = o.m3;
    return this;
  }

  get spriteScale(): number {
    return this.sprite > 0 ? this.sprite : spriteScaleFor(this.k);
  }

  /** 世界 → 缓冲像素 */
  P(x: number, y: number, z: number): [number, number] {
    const dx = x - this.cx;
    const dz = z - this.cz;
    const rx = this.m0 * dx + this.m1 * dz;
    const rz = this.m2 * dx + this.m3 * dz;
    return [this.ox + (rx - rz) * this.k, this.oy + (rx + rz) * this.k * 0.5 - y * this.k * HV];
  }

  sx(x: number, z: number): number {
    const dx = x - this.cx;
    const dz = z - this.cz;
    return this.ox + (this.m0 * dx + this.m1 * dz - this.m2 * dx - this.m3 * dz) * this.k;
  }

  sy(x: number, y: number, z: number): number {
    const dx = x - this.cx;
    const dz = z - this.cz;
    return this.oy + (this.m0 * dx + this.m1 * dz + this.m2 * dx + this.m3 * dz) * this.k * 0.5 - y * this.k * HV;
  }

  /** 深度 rx + rz（越大越靠近镜头） */
  depth(x: number, z: number): number {
    const dx = x - this.cx;
    const dz = z - this.cz;
    return (this.m0 + this.m2) * dx + (this.m1 + this.m3) * dz;
  }

  /** 缓冲像素 → 高度 y 的平面上的世界点 */
  unP(sx: number, sy: number, y = 0): [number, number] {
    const a = (sx - this.ox) / this.k;
    const b = (2 * (sy + y * this.k * HV - this.oy)) / this.k;
    const rx = (a + b) * 0.5;
    const rz = (b - a) * 0.5;
    return [this.cx + this.m0 * rx + this.m2 * rz, this.cz + this.m1 * rx + this.m3 * rz];
  }

  /** 世界水平向量 → 转后的 (rx, rz) */
  rot(x: number, z: number): [number, number] {
    return [this.m0 * x + this.m1 * z, this.m2 * x + this.m3 * z];
  }

  /** 法线 (nx, nz) 的竖直面是否朝镜头 */
  vis(nx: number, nz: number): boolean {
    return this.m0 * nx + this.m1 * nz + this.m2 * nx + this.m3 * nz > 0.01;
  }

  /** 任意法线是否朝镜头（视线方向在转后坐标里是 (1, 1/HV, 1)） */
  visN(nx: number, ny: number, nz: number): boolean {
    return this.m0 * nx + this.m1 * nz + this.m2 * nx + this.m3 * nz + ny / HV > 0.01;
  }
}

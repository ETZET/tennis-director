import { pick, type Rand, range, type XZ } from '@td/shared';
import { applyMat, Custom, type DrawContext, type Node } from '../core/graph';

/**
 * 漫画式粒子特效（活动动画库，ADR 0010）：尘土、水花、泥点、彩纸、汗珠、烟、火、速度线、落叶……
 * 像素版：一个 Custom 节点画所有粒子，每颗粒子是 1～3 个像素的小方块（速度线是一条细线）。
 * 坐标是粒子节点所在父节点的局部坐标（活动的场地坐标系）。
 */

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** 已存在的秒数 / 寿命 */
  l: number;
  max: number;
  /** 尺寸和各轴拉伸 */
  s: number;
  sx?: number;
  sy?: number;
  sz?: number;
  col: string;
  /** 重力、每 1/60 秒的阻尼 */
  g?: number;
  drag?: number;
  /** 飘动幅度和相位 */
  flut?: number;
  ph?: number;
  /** 落地高度（null 表示不落地） */
  floor?: number | null;
  /** 先长大后消失 / 保持大小到最后才缩 */
  grow?: boolean;
  hold?: boolean;
  spin?: number;
  rx?: number;
  ry?: number;
  /** 自发光（夜里不压暗）：火、火花 */
  em?: boolean;
}

type Spec = Omit<Particle, 'l' | 'vx' | 'vy' | 'vz'> & { vx?: number; vy?: number; vz?: number };

export interface ParticleOptions {
  /** 粒子上限，超过就挤掉最老的 */
  n?: number;
  /** 局部坐标的地面高度（落地的粒子停在这里） */
  groundY?: (x: number, z: number) => number;
  /** 当前风（局部坐标，米/秒²），落叶、纸片、烟会顺风飘 */
  wind?: () => XZ;
}

const ZERO: XZ = { x: 0, z: 0 };
const CONFETTI = ['#ff5a6a', '#ffd84a', '#5fd1ff', '#8af08a', '#ffffff', '#c48aff'];
const _p = { x: 0, y: 0, z: 0 };

export class Particles {
  /** 画所有粒子的节点（旧版叫 mesh） */
  readonly node: Custom;
  private readonly P: Particle[] = [];
  private readonly N: number;
  private readonly groundY: (x: number, z: number) => number;
  private readonly wind: () => XZ;
  private readonly rr: (a: number, b: number) => number;
  private readonly chance: (p: number) => boolean;

  constructor(
    parent: Node,
    private readonly rand: Rand,
    o: ParticleOptions = {},
  ) {
    this.N = o.n ?? 700;
    this.groundY = o.groundY ?? (() => 0);
    this.wind = o.wind ?? (() => ZERO);
    this.rr = (a, b) => range(rand, a, b);
    this.chance = (p) => rand() < p;
    this.node = new Custom((r, self) => this.draw(r, self), { x0: 0, x1: 0, y0: 0, y1: 0, z0: 0, z1: 0 });
    this.node.renderOrder = 4;
    parent.add(this.node);
  }

  /** 兼容旧名 */
  get mesh(): Custom {
    return this.node;
  }

  get count(): number {
    return this.P.length;
  }

  add(o: Spec): void {
    if (this.P.length >= this.N) this.P.shift();
    this.P.push({ vx: 0, vy: 0, vz: 0, ...o, l: 0 });
  }

  private col(arr: readonly string[]): string {
    return pick(arr, this.rand);
  }

  private fl(x: number, z: number): number {
    return this.groundY(x, z) + 0.02;
  }

  update(dt: number): void {
    const { P } = this;
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    for (let i = P.length - 1; i >= 0; i--) {
      const o = P[i] as Particle;
      o.l += dt;
      if (o.l >= o.max) {
        P.splice(i, 1);
        continue;
      }
      o.vy -= (o.g ?? 0) * dt;
      const dr = o.drag ? o.drag ** (dt * 60) : 1;
      o.vx *= dr;
      o.vy *= dr;
      o.vz *= dr;
      o.x += o.vx * dt;
      o.y += o.vy * dt;
      o.z += o.vz * dt;
      if (o.flut) {
        o.x += Math.sin(o.l * 7 + (o.ph ?? 0)) * o.flut * dt;
        o.z += Math.cos(o.l * 5 + (o.ph ?? 0)) * o.flut * dt * 0.6;
      }
      if (o.floor != null && o.y < o.floor) {
        o.y = o.floor;
        o.vy *= -0.25;
        o.vx *= 0.5;
        o.vz *= 0.5;
      }
      if (o.x < x0) x0 = o.x;
      if (o.x > x1) x1 = o.x;
      if (o.y < y0) y0 = o.y;
      if (o.y > y1) y1 = o.y;
      if (o.z < z0) z0 = o.z;
      if (o.z > z1) z1 = o.z;
    }
    // 深度排序用的包围盒跟着粒子走
    const b = this.node.bounds;
    if (P.length) {
      b.x0 = x0;
      b.x1 = x1;
      b.y0 = y0;
      b.y1 = y1;
      b.z0 = z0;
      b.z1 = z1;
    } else {
      b.x0 = b.x1 = b.y0 = b.y1 = b.z0 = b.z1 = 0;
    }
    this.node.visible = P.length > 0;
  }

  /** 每颗粒子画成 1～3 像素的方块；速度线和细长的（热浪）画成线。 */
  private draw(r: DrawContext, self: Custom): void {
    const m = self.matrixWorld;
    const ss = r.spriteScale;
    for (const o of this.P) {
      const u = o.l / o.max;
      const k = o.grow
        ? (0.5 + u * 1.3) * (u > 0.7 ? (1 - u) / 0.3 : 1)
        : o.hold
          ? u > 0.75
            ? (1 - u) / 0.25
            : 1
          : 1 - u * u;
      const s = o.s * k;
      if (s <= 0.002) continue;
      _p.x = o.x;
      _p.y = o.y;
      _p.z = o.z;
      applyMat(m, _p);
      const c = o.em ? r.em(o.col) : r.col(o.col, 1, 0.6);
      if (o.sz && o.sz > 0.3 && (o.sx ?? 1) < 0.2) {
        // 速度线：沿 ry 方向的一条线（局部方向换到世界）
        const yaw = o.ry ?? 0;
        const len = s * o.sz;
        const ex = { x: o.x + Math.sin(yaw) * len, y: o.y, z: o.z + Math.cos(yaw) * len };
        applyMat(m, ex);
        r.wline([_p.x, _p.y, _p.z], [ex.x, ex.y, ex.z], c, 1);
        continue;
      }
      const [sx, sy] = r.P(_p.x, _p.y, _p.z);
      // 像素大小：按屏幕上的米数，限制在 1～3 档像素
      const pxW = Math.max(1, Math.min(3 * ss, Math.round(s * Math.max(o.sx ?? 1, o.sz ?? 1) * r.k * 0.9)));
      let pxH = Math.max(1, Math.min(3 * ss, Math.round(s * (o.sy ?? 1) * r.k * 0.9)));
      // 彩纸、落叶翻转时一会儿扁一会儿宽
      if (o.spin && o.rx != null) pxH = Math.max(1, Math.round(pxH * Math.abs(Math.cos(o.rx + o.l * o.spin)) + 0.4));
      r.rect(Math.round(sx - pxW / 2), Math.round(sy - pxH / 2), pxW, pxH, c);
    }
  }

  dispose(): void {
    this.node.parent?.remove(this.node);
    this.P.length = 0;
  }

  /* ---------------- 各种特效 ---------------- */

  dust(x: number, y: number, z: number, n = 5, col = '#c9b48c'): void {
    const { rr } = this;
    for (let i = 0; i < n; i++)
      this.add({
        x: x + rr(-0.2, 0.2),
        y: y + 0.05,
        z: z + rr(-0.2, 0.2),
        vx: rr(-1, 1),
        vy: rr(0.5, 1.4),
        vz: rr(-1, 1),
        g: 2,
        drag: 0.92,
        max: rr(0.4, 0.7),
        s: rr(0.12, 0.22),
        col,
        grow: true,
      });
  }

  splash(x: number, y: number, z: number, n = 10): void {
    const { rr } = this;
    const floor = this.fl(x, z);
    for (let i = 0; i < n; i++)
      this.add({
        x,
        y: y + 0.05,
        z,
        vx: rr(-1.6, 1.6),
        vy: rr(1.6, 3.4),
        vz: rr(-1.6, 1.6),
        g: 9.8,
        max: rr(0.35, 0.6),
        s: rr(0.06, 0.11),
        col: this.col(['#9fd8ff', '#d8f1ff', '#6fb8e8']),
        floor,
      });
  }

  mud(x: number, y: number, z: number, n = 12): void {
    const { rr } = this;
    const floor = this.fl(x, z);
    for (let i = 0; i < n; i++)
      this.add({
        x,
        y: y + 0.05,
        z,
        vx: rr(-2, 2),
        vy: rr(1.5, 3.6),
        vz: rr(-2, 2),
        g: 9.8,
        max: rr(0.4, 0.8),
        s: rr(0.08, 0.16),
        col: this.col(['#6a4a2e', '#57391f', '#7d5a3a']),
        floor,
      });
  }

  confetti(x: number, y: number, z: number, n = 40, spread = 1.5): void {
    const { rr } = this;
    const floor = this.fl(x, z);
    for (let i = 0; i < n; i++)
      this.add({
        x: x + rr(-0.3, 0.3),
        y,
        z: z + rr(-0.3, 0.3),
        vx: rr(-spread, spread) * 2,
        vy: rr(3, 6.5),
        vz: rr(-spread, spread) * 2,
        g: 4,
        drag: 0.95,
        max: rr(1.6, 2.6),
        s: rr(0.08, 0.14),
        sy: 0.3,
        col: this.col(CONFETTI),
        spin: rr(5, 12),
        rx: rr(0, 3),
        hold: true,
        flut: 1.2,
        ph: rr(0, 6),
        floor,
      });
  }

  sparkle(x: number, y: number, z: number, n = 12, col = '#ffe45c'): void {
    const { rr } = this;
    for (let i = 0; i < n; i++) {
      const a = rr(0, 6.28);
      const b = rr(-0.6, 1);
      this.add({
        x,
        y,
        z,
        vx: Math.cos(a) * rr(1.5, 3),
        vy: b * 2.5 + 1,
        vz: Math.sin(a) * rr(1.5, 3),
        drag: 0.88,
        max: rr(0.4, 0.7),
        s: rr(0.08, 0.14),
        col,
        spin: 8,
        em: true,
      });
    }
  }

  sweat(x: number, y: number, z: number): void {
    const { rr } = this;
    const s = this.chance(0.5) ? 1 : -1;
    this.add({
      x,
      y,
      z,
      vx: s * rr(0.6, 1.2),
      vy: rr(1.2, 2),
      vz: rr(-0.4, 0.4),
      g: 9.8,
      max: 0.5,
      s: 0.07,
      col: '#7fd0ff',
    });
  }

  tears(x: number, y: number, z: number): void {
    const { rr } = this;
    for (const s of [-1, 1])
      this.add({
        x: x + s * 0.1,
        y,
        z,
        vx: s * rr(1, 1.8),
        vy: rr(1.5, 2.4),
        vz: rr(-0.3, 0.3),
        g: 9.8,
        max: 0.5,
        s: 0.07,
        col: '#7fd0ff',
      });
  }

  /** 喘气的白雾 */
  puff(x: number, y: number, z: number): void {
    const { rr } = this;
    this.add({
      x,
      y,
      z,
      vx: rr(-0.2, 0.2),
      vy: 0.6,
      vz: rr(-0.2, 0.2),
      drag: 0.94,
      max: 0.7,
      s: 0.16,
      col: '#f2f6f8',
      grow: true,
    });
  }

  smoke(x: number, y: number, z: number, col = '#b9b6b0'): void {
    const { rr } = this;
    const w = this.wind();
    this.add({
      x: x + rr(-0.2, 0.2),
      y,
      z: z + rr(-0.2, 0.2),
      vx: rr(-0.15, 0.15) + w.x,
      vy: rr(0.8, 1.3),
      vz: rr(-0.15, 0.15) + w.z,
      drag: 0.985,
      max: rr(1.6, 2.4),
      s: rr(0.22, 0.34),
      col,
      grow: true,
    });
  }

  fire(x: number, y: number, z: number, n = 10): void {
    const { rr } = this;
    for (let i = 0; i < n; i++)
      this.add({
        x: x + rr(-0.3, 0.3),
        y,
        z: z + rr(-0.3, 0.3),
        vx: rr(-0.4, 0.4),
        vy: rr(1.8, 3.4),
        vz: rr(-0.4, 0.4),
        drag: 0.95,
        max: rr(0.35, 0.7),
        s: rr(0.14, 0.26),
        col: this.col(['#ff5a2a', '#ffb02a', '#ffe46a']),
        em: true,
      });
  }

  /** 速度线：沿 yaw 方向的细长白条 */
  speed(x: number, y: number, z: number, yaw: number): void {
    this.add({
      x,
      y,
      z,
      max: 0.22,
      s: 1,
      sx: 0.03,
      sy: 0.03,
      sz: this.rr(0.5, 0.9),
      ry: yaw,
      col: '#ffffff',
      hold: true,
    });
  }

  leaf(x: number, y: number, z: number): void {
    const { rr } = this;
    const w = this.wind();
    this.add({
      x,
      y,
      z,
      vx: w.x * 2.6 + rr(-0.4, 0.4),
      vy: rr(-0.3, 0.4),
      vz: w.z * 2.6 + rr(-0.3, 0.3),
      max: rr(2.4, 3.6),
      s: rr(0.1, 0.16),
      sy: 0.25,
      col: this.col(['#c9873a', '#a8682a', '#8aa04a', '#d8b25a']),
      spin: rr(4, 9),
      rx: 1,
      flut: 2.2,
      ph: rr(0, 6),
      hold: true,
    });
  }

  /** 酷热时地面升起的热浪 */
  shimmer(x: number, y: number, z: number): void {
    const { rr } = this;
    this.add({
      x,
      y,
      z,
      vy: rr(0.6, 1.1),
      max: rr(1, 1.6),
      s: rr(0.05, 0.09),
      sy: 2.5,
      col: this.col(['#ffe2b0', '#ffd28a']),
      flut: 0.8,
      ph: rr(0, 6),
      hold: true,
    });
  }

  /** 碎片（摔拍、球罐炸飞） */
  debris(x: number, y: number, z: number, n: number, cols: readonly string[]): void {
    const { rr } = this;
    const floor = this.fl(x, z);
    for (let i = 0; i < n; i++)
      this.add({
        x,
        y,
        z,
        vx: rr(-2.5, 2.5),
        vy: rr(2, 4.5),
        vz: rr(-2.5, 2.5),
        g: 9.8,
        max: rr(0.6, 1),
        s: rr(0.07, 0.14),
        col: this.col(cols),
        spin: 10,
        rx: 1,
        floor,
      });
  }

  /** 被风吹飞的纸（传单、纸盘子） */
  paper(x: number, y: number, z: number): void {
    const { rr } = this;
    const w = this.wind();
    this.add({
      x,
      y,
      z,
      vx: w.x * 2 + rr(-0.5, 0.5),
      vy: rr(1, 2),
      vz: w.z * 2 + rr(-0.3, 0.3),
      g: 0.6,
      drag: 0.98,
      max: rr(2.2, 3.2),
      s: 0.22,
      sy: 0.08,
      sz: 0.75,
      col: '#f6f3ea',
      spin: rr(4, 8),
      rx: 1,
      flut: 2.5,
      ph: rr(0, 6),
      hold: true,
    });
  }

  /** 秋天的落叶（枫岭） */
  fall(x: number, y: number, z: number): void {
    const { rr } = this;
    this.add({
      x,
      y,
      z,
      vx: rr(-0.3, 0.3),
      vy: -0.55,
      vz: rr(-0.3, 0.3),
      max: rr(4, 6),
      s: 0.15,
      sy: 0.25,
      col: this.col(['#d8832e', '#c4462b', '#e5b33b', '#a8552a']),
      spin: rr(3, 6),
      rx: 1,
      flut: 1.6,
      ph: rr(0, 6),
      hold: true,
      floor: this.fl(x, z) + 0.02,
    });
  }

  steam(x: number, y: number, z: number): void {
    const { rr } = this;
    this.add({ x, y, z, vx: rr(-0.1, 0.1), vy: 0.7, vz: rr(-0.1, 0.1), max: 1.1, s: 0.1, col: '#ffffff', grow: true });
  }
}

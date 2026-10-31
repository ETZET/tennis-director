import { pick, type Rand, range, type XZ } from '@td/shared';
import * as THREE from 'three';
import { boxGeo } from '../people/parts';

/**
 * 漫画式粒子特效（活动动画库，ADR 0010）：尘土、水花、泥点、彩纸、汗珠、烟、火、速度线、落叶……
 * 一个实例化网格画所有粒子；每颗粒子是一个带颜色的小方块。
 * 坐标是粒子网格所在父节点的局部坐标（活动的场地坐标系）。
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
  c: THREE.Color;
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
}

type Spec = Omit<Particle, 'l' | 'c' | 'vx' | 'vy' | 'vz'> & { col: string; vx?: number; vy?: number; vz?: number };

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

export class Particles {
  readonly mesh: THREE.InstancedMesh;
  private readonly P: Particle[] = [];
  private readonly d = new THREE.Object3D();
  private readonly N: number;
  private readonly groundY: (x: number, z: number) => number;
  private readonly wind: () => XZ;
  private readonly rr: (a: number, b: number) => number;
  private readonly chance: (p: number) => boolean;

  constructor(
    parent: THREE.Object3D,
    private readonly rand: Rand,
    o: ParticleOptions = {},
  ) {
    this.N = o.n ?? 700;
    this.groundY = o.groundY ?? (() => 0);
    this.wind = o.wind ?? (() => ZERO);
    this.rr = (a, b) => range(rand, a, b);
    this.chance = (p) => rand() < p;
    const m = new THREE.InstancedMesh(boxGeo(1, 1, 1), new THREE.MeshBasicMaterial({ color: '#ffffff' }), this.N);
    m.frustumCulled = false;
    m.renderOrder = 4;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const white = new THREE.Color('#ffffff');
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < this.N; i++) {
      m.setColorAt(i, white);
      m.setMatrixAt(i, zero);
    }
    m.count = 0;
    parent.add(m);
    this.mesh = m;
  }

  get count(): number {
    return this.P.length;
  }

  add(o: Spec): void {
    if (this.P.length >= this.N) this.P.shift();
    const { col, ...rest } = o;
    this.P.push({ vx: 0, vy: 0, vz: 0, ...rest, l: 0, c: new THREE.Color(col) });
  }

  private col(arr: readonly string[]): string {
    return pick(arr, this.rand);
  }

  private fl(x: number, z: number): number {
    return this.groundY(x, z) + 0.02;
  }

  update(dt: number): void {
    const { P, d } = this;
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
    }
    for (let i = 0; i < P.length; i++) {
      const o = P[i] as Particle;
      const u = o.l / o.max;
      const k = o.grow
        ? (0.5 + u * 1.3) * (u > 0.7 ? (1 - u) / 0.3 : 1)
        : o.hold
          ? u > 0.75
            ? (1 - u) / 0.25
            : 1
          : 1 - u * u;
      const s = o.s * k;
      d.position.set(o.x, o.y, o.z);
      d.rotation.set(o.rx ? o.rx + o.l * (o.spin ?? 0) : 0, (o.ry ?? 0) + o.l * (o.spin ?? 0) * 0.6, 0);
      d.scale.set(s * (o.sx ?? 1), s * (o.sy ?? 1), s * (o.sz ?? 1));
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
      this.mesh.setColorAt(i, o.c);
    }
    this.mesh.count = P.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.parent?.remove(this.mesh);
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
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

/**
 * 轻量场景图（ADR 0019）：照 three.js Object3D 的一个小子集写，演出代码（活动库、人物）可以几乎原样搬过来。
 * 这里只管变换和父子关系，不管怎么画；画由 core/draw.ts 遍历场景图、按每个节点的 `kind` 光栅。
 *
 * 坐标：世界单位是米，y 向上，北是 -z（和 layout.ts 一样）。旋转是欧拉角，顺序 XYZ（three 的默认）。
 */

export class V3 {
  constructor(
    public x = 0,
    public y = 0,
    public z = 0,
  ) {}
  set(x: number, y: number, z: number): this {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }
  setScalar(s: number): this {
    return this.set(s, s, s);
  }
  copy(v: { x: number; y: number; z: number }): this {
    return this.set(v.x, v.y, v.z);
  }
  clone(): V3 {
    return new V3(this.x, this.y, this.z);
  }
  add(v: { x: number; y: number; z: number }): this {
    return this.set(this.x + v.x, this.y + v.y, this.z + v.z);
  }
  sub(v: { x: number; y: number; z: number }): this {
    return this.set(this.x - v.x, this.y - v.y, this.z - v.z);
  }
  multiplyScalar(s: number): this {
    return this.set(this.x * s, this.y * s, this.z * s);
  }
  lerp(v: { x: number; y: number; z: number }, t: number): this {
    return this.set(this.x + (v.x - this.x) * t, this.y + (v.y - this.y) * t, this.z + (v.z - this.z) * t);
  }
  distanceTo(v: { x: number; y: number; z: number }): number {
    return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z);
  }
}

export class Euler {
  constructor(
    public x = 0,
    public y = 0,
    public z = 0,
  ) {}
  set(x: number, y: number, z: number): this {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }
  copy(e: { x: number; y: number; z: number }): this {
    return this.set(e.x, e.y, e.z);
  }
}

/** 3×4 仿射矩阵（列主序的前三行）：[m0 m3 m6 m9; m1 m4 m7 m10; m2 m5 m8 m11]。 */
export type Mat = Float64Array;

const IDENT = (): Mat => new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]);

function compose(out: Mat, p: V3, r: Euler, s: V3): void {
  // three 的 XYZ 顺序：R = Rx * Ry * Rz
  const a = Math.cos(r.x);
  const b = Math.sin(r.x);
  const c = Math.cos(r.y);
  const d = Math.sin(r.y);
  const e = Math.cos(r.z);
  const f = Math.sin(r.z);
  const ae = a * e;
  const af = a * f;
  const be = b * e;
  const bf = b * f;
  out[0] = c * e * s.x;
  out[1] = (af + be * d) * s.x;
  out[2] = (bf - ae * d) * s.x;
  out[3] = -c * f * s.y;
  out[4] = (ae - bf * d) * s.y;
  out[5] = (be + af * d) * s.y;
  out[6] = d * s.z;
  out[7] = -b * c * s.z;
  out[8] = a * c * s.z;
  out[9] = p.x;
  out[10] = p.y;
  out[11] = p.z;
}

const MUL_TMP = new Float64Array(12);

function mul(out: Mat, A: Mat, B: Mat): void {
  const r = MUL_TMP;
  for (let col = 0; col < 4; col++) {
    const b0 = B[col * 3] as number;
    const b1 = B[col * 3 + 1] as number;
    const b2 = B[col * 3 + 2] as number;
    for (let row = 0; row < 3; row++)
      r[col * 3 + row] =
        (A[row] as number) * b0 +
        (A[3 + row] as number) * b1 +
        (A[6 + row] as number) * b2 +
        (col === 3 ? (A[9 + row] as number) : 0);
  }
  out.set(r);
}

/** 用矩阵变换一个点（原地）。 */
export function applyMat(m: Mat, v: { x: number; y: number; z: number }): void {
  const { x, y, z } = v;
  v.x = (m[0] as number) * x + (m[3] as number) * y + (m[6] as number) * z + (m[9] as number);
  v.y = (m[1] as number) * x + (m[4] as number) * y + (m[7] as number) * z + (m[10] as number);
  v.z = (m[2] as number) * x + (m[5] as number) * y + (m[8] as number) * z + (m[11] as number);
}

function invert(m: Mat): Mat {
  const [a, b, c, d, e, f, g, h, i, tx, ty, tz] = m as unknown as number[];
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C || 1e-12;
  const o = new Float64Array(12);
  o[0] = A / det;
  o[3] = B / det;
  o[6] = C / det;
  o[1] = -(b * i - c * h) / det;
  o[4] = (a * i - c * g) / det;
  o[7] = -(a * h - b * g) / det;
  o[2] = (b * f - c * e) / det;
  o[5] = -(a * f - c * d) / det;
  o[8] = (a * e - b * d) / det;
  o[9] = -(o[0] * tx + o[3] * ty + o[6] * tz);
  o[10] = -(o[1] * tx + o[4] * ty + o[7] * tz);
  o[11] = -(o[2] * tx + o[5] * ty + o[8] * tz);
  return o;
}

/** 节点的画法；renderer 按它分派。 */
export type NodeKind = 'group' | 'box' | 'sprite' | 'custom';

export class Node {
  readonly kind: NodeKind = 'group';
  name = '';
  readonly position = new V3();
  readonly rotation = new Euler();
  readonly scale = new V3(1, 1, 1);
  visible = true;
  parent: Node | null = null;
  readonly children: Node[] = [];
  userData: Record<string, unknown> = {};
  /** 深度排序的偏置（米）：正数往前画。同一位置的东西靠它定先后（例如手里的道具画在人前面） */
  renderOrder = 0;
  /** 夜里的受光量 0..1（1 = 不受夜色影响）；undefined = 按所在位置的灯光算 */
  lit: number | undefined = undefined;
  readonly matrixWorld: Mat = IDENT();
  private readonly local: Mat = IDENT();

  add(...ns: Node[]): this {
    for (const n of ns) {
      if (n === this) continue;
      n.parent?.remove(n);
      n.parent = this;
      this.children.push(n);
    }
    return this;
  }

  remove(...ns: Node[]): this {
    for (const n of ns) {
      const i = this.children.indexOf(n);
      if (i >= 0) {
        this.children.splice(i, 1);
        n.parent = null;
      }
    }
    return this;
  }

  removeFromParent(): this {
    this.parent?.remove(this);
    return this;
  }

  /** 换父节点但保持世界变换不变（three 的 attach）。 */
  attach(n: Node): this {
    this.updateWorldChain();
    n.updateWorldChain();
    const rel = new Float64Array(12);
    mul(rel, invert(this.matrixWorld), n.matrixWorld);
    // 只还原位置和绕 y 的转角（演出里够用）
    n.position.set(rel[9] as number, rel[10] as number, rel[11] as number);
    n.rotation.y = Math.atan2(rel[6] as number, rel[8] as number);
    this.add(n);
    return this;
  }

  traverse(fn: (n: Node) => void): void {
    fn(this);
    for (const c of this.children) c.traverse(fn);
  }

  traverseVisible(fn: (n: Node) => void): void {
    if (!this.visible) return;
    fn(this);
    for (const c of this.children) c.traverseVisible(fn);
  }

  /** 从根往下重算世界矩阵（parentFirst：先算父节点链）。 */
  updateMatrixWorld(parentFirst = true): void {
    if (parentFirst && this.parent) {
      const chain: Node[] = [];
      for (let p: Node | null = this.parent; p; p = p.parent) chain.unshift(p);
      for (const p of chain) p.updateSelf();
    }
    this.updateSelf();
    for (const c of this.children) c.updateMatrixWorld(false);
  }

  /** 只重算祖先链和自己（不碰子节点）：取世界坐标时用，避免每次都重算整棵子树。 */
  updateWorldChain(): void {
    const chain: Node[] = [];
    for (let p: Node | null = this; p; p = p.parent) chain.push(p);
    for (let i = chain.length - 1; i >= 0; i--) (chain[i] as Node).updateSelf();
  }

  private updateSelf(): void {
    compose(this.local, this.position, this.rotation, this.scale);
    if (this.parent) mul(this.matrixWorld, this.parent.matrixWorld, this.local);
    else this.matrixWorld.set(this.local);
  }

  getWorldPosition(out = new V3()): V3 {
    this.updateWorldChain();
    return out.set(this.matrixWorld[9] as number, this.matrixWorld[10] as number, this.matrixWorld[11] as number);
  }

  /** 世界朝向（绕 y 的转角）。 */
  getWorldYaw(): number {
    this.updateWorldChain();
    return Math.atan2(this.matrixWorld[6] as number, this.matrixWorld[8] as number);
  }

  localToWorld<T extends { x: number; y: number; z: number }>(v: T): T {
    this.updateWorldChain();
    applyMat(this.matrixWorld, v);
    return v;
  }

  worldToLocal<T extends { x: number; y: number; z: number }>(v: T): T {
    this.updateWorldChain();
    applyMat(invert(this.matrixWorld), v);
    return v;
  }
}

export class Group extends Node {
  override readonly kind: NodeKind = 'group';
}

/** 方块的画法（等距挤出：顶面、两个可见侧面，按世界法线明暗）。 */
export interface BoxStyle {
  /** 顶面颜色（默认同 color） */
  top?: string;
  /** 侧面颜色（默认同 color） */
  side?: string;
  /** 自发光：夜里不变暗（窗户、灯泡、发光的水） */
  emissive?: boolean;
  /** 顶面边缘的高光线（默认开，太小的方块自动不画） */
  edge?: boolean;
  /** 描深色外轮廓（人手里的小道具用） */
  outline?: boolean;
}

/**
 * 方块：中心在节点原点（和 three 的 BoxGeometry 一样），尺寸 w×h×d（x×y×z，米）。
 * 投影后小于 1 像素的方块至少画 1 个像素。
 */
export class Box extends Node {
  override readonly kind: NodeKind = 'box';
  constructor(
    public w: number,
    public h: number,
    public d: number,
    public color: string,
    public style: BoxStyle = {},
  ) {
    super();
  }
}

/**
 * 像素精灵：始终正对镜头，按整数倍放大（不随缩放连续变大，见 ADR 0019 的"精灵档位"）。
 * 锚点像素对准节点世界位置的投影点。frame 由使用者每帧换（人物动画）。
 */
export class Sprite extends Node {
  override readonly kind: NodeKind = 'sprite';
  /** 已烘焙的帧（core/art 的 bakeArt 生成） */
  frame: BakedArt | null = null;
  flipX = false;
  /** 不透明度 0..1（像素溶解，不做半透明混合） */
  opacity = 1;
  /** 被建筑挡住的部分画成棋盘格剪影（人物用，免得走到墙后就看不见） */
  xray = false;
  constructor(frame: BakedArt | null = null) {
    super();
    this.frame = frame;
  }
}

/** 自己画：renderer 在排好序的位置调用 draw（世界包围盒用于深度排序）。 */
export class Custom extends Node {
  override readonly kind: NodeKind = 'custom';
  constructor(
    public draw: (r: DrawContext, self: Custom) => void,
    /** 局部包围盒（米），深度排序用 */
    public bounds: { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number } = {
      x0: -0.5,
      x1: 0.5,
      y0: 0,
      y1: 1,
      z0: -0.5,
      z1: 0.5,
    },
  ) {
    super();
  }
}

/** 烘焙好的像素图：RGBA 打包成 Uint32（ABGR，小端，和 ImageData 一致），0 = 透明。 */
export interface BakedArt {
  readonly w: number;
  readonly h: number;
  readonly ox: number;
  readonly oy: number;
  readonly px: Uint32Array;
  /** 自发光像素的掩码（夜里不压暗），可选 */
  readonly emissive?: Uint8Array;
  readonly pts?: Readonly<Record<string, readonly [number, number]>>;
}

/**
 * 给 Custom 节点和场景构建用的绘图上下文：等距投影和光栅原语（core/raster 实现）。
 * 所有坐标是世界米；返回值和参数里的屏幕坐标是缓冲像素。
 */
export interface DrawContext {
  /** 世界 → 缓冲像素 */
  P(x: number, y: number, z: number): [number, number];
  /** 当前每米多少缓冲像素（随缩放变） */
  readonly k: number;
  /** 精灵放大档位（整数 ≥ 1） */
  readonly spriteScale: number;
  /** 当前镜头转角下，法线 (nx, nz) 的面是否朝镜头 */
  vis(nx: number, nz: number): boolean;
  /** 夜色换算后的颜色（lit 0..1 = 该处受灯光的程度） */
  col(hex: string, f?: number, lit?: number): number;
  /** 自发光颜色（夜里不压暗） */
  em(hex: string, f?: number): number;
  /** 该处夜里受灯光的程度 0..1（白天 0） */
  litAt(x: number, z: number): number;
  readonly night: number;
  /** 演出时间（秒），给摆动、闪烁用 */
  readonly t: number;
  wpoly(
    pts: readonly (readonly [number, number, number])[],
    c: number,
    shader?: (x: number, y: number) => number,
  ): void;
  wline(a: readonly [number, number, number], b: readonly [number, number, number], c: number, w?: number): void;
  box(
    x0: number,
    x1: number,
    z0: number,
    z1: number,
    y0: number,
    y1: number,
    hex: string,
    o?: BoxStyle & { lit?: number },
  ): void;
  hipRoof(
    x0: number,
    x1: number,
    z0: number,
    z1: number,
    y: number,
    rise: number,
    hex: string,
    o?: { lit?: number },
  ): void;
  cyl(x: number, z: number, r: number, y0: number, y1: number, hex: string, o?: { lit?: number; top?: string }): void;
  pix(x: number, y: number, c: number): void;
  /** 压暗一个像素（影子）：f 是亮度倍率 */
  darken(x: number, y: number, f: number): void;
  rect(x: number, y: number, w: number, h: number, c: number): void;
  line(x0: number, y0: number, x1: number, y1: number, c: number, w?: number): void;
  ell(cx: number, cy: number, rx: number, ry: number, c: number): void;
  glow(sx: number, sy: number, r: number, rgb: readonly [number, number, number], intensity: number): void;
  /** 在世界点画一张烘焙像素图（锚点对齐，按 spriteScale 放大） */
  art(
    a: BakedArt,
    x: number,
    y: number,
    z: number,
    o?: { flipX?: boolean; scale?: number; lit?: number; xray?: boolean },
  ): void;
}

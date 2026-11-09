// 大门和俱乐部立牌共用的小工具：按材质收几何体再合并、灰泥皮（带剥落露砖的洞）、竖直面上的平面图案（徽标、假字）。
// 大门（club-gate / east-gate）和立牌（club-monument）都从这里拿，两个场景（clubpark、clubdesk）的 ctx 形状一样。
// 单位米，y 朝上，+z 朝镜头（南）。设计纹素 0.09 米：横向一格 0.09，竖直面上一行 ≈ 0.127 米（俯角 45°）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Mats, Tones, ToonOpts } from '../../../clubfront/toon';

/** 用到的调色板名字（两个场景的 Pal 都有） */
export type KitKey = 'adobe' | 'cap' | 'ball' | 'timber' | 'signBoard' | 'signPaint' | 'ironwork' | 'clothWhite';

/** 两个场景 AssetCtx 的公共部分（clubpark / clubdesk 的 ctx 都能直接传进来） */
export interface KitCtx {
  mats: Mats;
  pal: object;
  mat(key: KitKey, extra?: ToonOpts): THREE.MeshToonMaterial;
  rng(stream: string): () => number;
  variant: number;
}

/** 设计纹素：横向 0.09 米；竖直面上一行 0.09 / 0.707 米 */
export const DU = 0.09;
export const DV = 0.09 / Math.SQRT1_2;

// ── 材质 ────────────────────────────────────────────

/** 朝镜头的竖直牌面：光往上偏、档位放宽 → 落中档（暗档的大墙前面读得出来） */
export const FACING: ToonOpts = { lightUp: 0.6, bands: [-0.4, 0.4], noShadowReceive: true };

/**
 * 灰泥（柱面、立牌墙身）：土坯色的大块浅深斑（墙面 uv → 屏幕纹素的 Voronoi 块，没有缝），少数块上沿一行亮边。
 * 几乎是平的：同档三色只差 ~10 个亮度，远看还是一整块"梅紫"的暗面。
 */
export const STUCCO: ToonOpts = {
  elem: { kind: 'stones', space: 'wall', size: [22, 13], seam: 0, hi: 0.18, seed: 3 },
  toneW: [0.3, 0.26],
};

/**
 * 灰泥剥落露出来的土坯砖（本地颜色，走 adobe 的配色组，跟墙一起被午后方案调色）：
 * 砖比灰泥深一档、偏红褐（暗档 L ≈ 63，灰泥暗档 87）；砖缝是浅的泥灰（暗档 L ≈ 94，接近灰泥本色）——
 * 深砖 + 浅缝，洞读成"露出来的几块砖"，不是几道黑裂缝。待核心代理提升进调色板：`adobeBrick`。
 */
const BRICK_RAMP: [number, number, number] = [0xd08a6a, 0xa25a52, 0x5e3454];
const BRICK_TONES: Tones = {
  bands: [
    [0xd08a6a, 0xd8966e, 0xc47e62], // L 151 / 161 / 139
    [0xa25a52, 0xac6458, 0x965050], // L 105 / 115 / 95
    [0x5e3454, 0x683a5a, 0x542e4c], // L 63 / 70 / 56
  ],
  seam: [0xf0c8a4, 0xc48c80, 0x7a5474], // 泥灰缝 L 206 / 151 / 94（比砖浅）
  hi: [0xe4a47c, 0xb87060, 0x704462], // 缝下面那行（砖的上沿）L 175 / 126 / 80
};
export const BRICK: ToonOpts = {
  ramp: BRICK_RAMP,
  tones: BRICK_TONES,
  edge: 0.3,
  convex: 0.3,
  // 一层 2～4 行（1 行缝）、砖宽 5～9 纹素，缝下面那行一半亮；不淌沙（q.y 很大），没有 aElem → 不按矮墙算
  elem: { kind: 'strata', space: 'wall', size: [7, 3], hi: 0.5, q: [0, 999, 0, 0], seed: 7 },
};

/**
 * 黄铜门牌（本地颜色，和 clubdesk 的 `brass` 同值；clubpark 的调色板没有它）：clubdesk 的表里有就直接用。
 * 只吃方案的全局调色（同 clubdesk：brass 不在 GROUP 表里）。
 */
const BRASS: ToonOpts = {
  ramp: [0xf4c860, 0xc48c44, 0x6e4c58],
  edge: 0.6,
  convex: 0.6,
  tones: {
    bands: [
      [0xf4c860, 0xf8d470, 0xecbc56],
      [0xc48c44, 0xcc9850, 0xb8803e],
      [0x6e4c58, 0x785662, 0x64444e],
    ],
    seam: [0xd8a84c, 0x9a6a3e, 0x4e3646],
    hi: [0xfce48c, 0xdaa860, 0x926a72],
  },
};
export function brassMat(ctx: KitCtx, extra?: ToonOpts): THREE.MeshToonMaterial {
  if ('brass' in ctx.pal) return (ctx.mat as (k: string, e?: ToonOpts) => THREE.MeshToonMaterial)('brass', extra);
  return ctx.mats.toon(0xffffff, { ...BRASS, ...extra });
}

// ── 按材质收几何体 ──────────────────────────────────

/** 同一个材质的几何体合并成一个网格（只留 position / normal / uv；没有 uv 的补 0） */
export class Bucket {
  private m = new Map<THREE.Material, { geos: THREE.BufferGeometry[]; cast: boolean; name: string }>();
  add(mat: THREE.Material, g: THREE.BufferGeometry, opts: { cast?: boolean; name?: string } = {}) {
    let e = this.m.get(mat);
    if (!e) {
      e = { geos: [], cast: opts.cast ?? true, name: opts.name ?? '' };
      this.m.set(mat, e);
    }
    const n = g.index ? g.toNonIndexed() : g;
    for (const a of Object.keys(n.attributes))
      if (a !== 'position' && a !== 'normal' && a !== 'uv') n.deleteAttribute(a);
    if (!n.getAttribute('normal')) n.computeVertexNormals();
    if (!n.getAttribute('uv'))
      n.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n.getAttribute('position').count * 2), 2));
    e.geos.push(n);
  }
  build(mats: Mats, root: THREE.Object3D) {
    for (const [mat, e] of this.m) {
      const mesh = new THREE.Mesh(mergeGeometries(e.geos), mat);
      mesh.name = e.name;
      root.add(mesh);
      mats.prepare(mesh, { cast: e.cast });
    }
  }
}

/** 轴对齐的盒子：底面中心 (x, y, z) */
export function box(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry {
  return new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
}

// ── 竖直面：一个面的坐标系（右、上、朝外），把 xy 平面上画的东西贴上去 ──

export interface Face {
  /** 面上的原点（世界/本地坐标） */
  o: THREE.Vector3;
  r: THREE.Vector3;
  u: THREE.Vector3;
  n: THREE.Vector3;
}
const Y = new THREE.Vector3(0, 1, 0);
/** 朝外法线 n（水平）的竖直面；右 = up × n，保证 r × u = n（右手系，正面朝外） */
export function faceOf(o: THREE.Vector3, n: THREE.Vector3): Face {
  const r = new THREE.Vector3().crossVectors(Y, n);
  return { o, r, u: Y.clone(), n: n.clone() };
}
/** xy 平面（法线 +z）上的几何体 → 贴到面上，往外挪 lift 米 */
export function onFace(g: THREE.BufferGeometry, f: Face, lift = 0): THREE.BufferGeometry {
  const m = new THREE.Matrix4().makeBasis(f.r, f.u, f.n);
  m.setPosition(f.o.clone().addScaledVector(f.n, lift));
  return g.applyMatrix4(m);
}

/** 写墙面 uv（材质规范 v2 的 space: 'wall'）：x = 沿墙（米，从 u0 起），y = 离墙顶多深（米） */
export function wallUv(g: THREE.BufferGeometry, f: Face, top: number, u0 = 0): THREE.BufferGeometry {
  const p = g.getAttribute('position');
  const uv = new Float32Array(p.count * 2);
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    uv[i * 2] = u0 + v.clone().sub(f.o).dot(f.r);
    uv[i * 2 + 1] = top - v.y;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

// ── 灰泥剥落的洞：按设计纹素的台阶形轮廓 ─────────────

/**
 * 一个剥落的洞：从 (u, v)（米，面上的左下角）往上每行一个 [左, 右]（设计纹素，相对 u），行高 DV。
 * 行要彼此连着（台阶形的不规则轮廓，不是方块）。
 */
export interface Spall {
  u: number;
  v: number;
  rows: [number, number][];
}
function spallPath(s: Spall): THREE.Vector2[] {
  const pts: THREE.Vector2[] = [];
  const n = s.rows.length;
  const X = (c: number) => s.u + c * DU;
  const V = (r: number) => s.v + r * DV;
  pts.push(new THREE.Vector2(X(s.rows[0][0]), V(0)), new THREE.Vector2(X(s.rows[0][1]), V(0)));
  for (let i = 0; i < n; i++) {
    pts.push(new THREE.Vector2(X(s.rows[i][1]), V(i + 1)));
    if (i + 1 < n) pts.push(new THREE.Vector2(X(s.rows[i + 1][1]), V(i + 1)));
  }
  pts.push(new THREE.Vector2(X(s.rows[n - 1][0]), V(n)));
  for (let i = n - 1; i > 0; i--) {
    pts.push(new THREE.Vector2(X(s.rows[i][0]), V(i)));
    pts.push(new THREE.Vector2(X(s.rows[i - 1][0]), V(i)));
  }
  // 去掉重合的点
  return pts.filter((p, i) => i === 0 || !p.equals(pts[i - 1]));
}

/**
 * 一面灰泥皮：w × (y0..y1) 的板，厚 t，带剥落的洞（洞里露出后面的砖芯）。
 * 面坐标：u 从 −w/2 到 w/2（往右），v = 本地 y。f.o 是这面墙皮里侧（砖芯表面）的中心、y 0 处。
 */
export function skinFace(f: Face, w: number, y0: number, y1: number, t: number, holes: Spall[]): THREE.BufferGeometry {
  const sh = new THREE.Shape([
    new THREE.Vector2(-w / 2, y0),
    new THREE.Vector2(w / 2, y0),
    new THREE.Vector2(w / 2, y1),
    new THREE.Vector2(-w / 2, y1),
  ]);
  for (const h of holes) sh.holes.push(new THREE.Path(spallPath(h)));
  const ex = new THREE.ExtrudeGeometry(sh, { depth: t, bevelEnabled: false, curveSegments: 1 });
  ex.deleteAttribute('uv');
  // 背面（贴着砖芯的那一面，法线朝里）永远看不见：去掉，省一半的三角形
  const g = ex.index ? ex.toNonIndexed() : ex;
  const p = g.getAttribute('position');
  const nr = g.getAttribute('normal');
  const keep: number[] = [];
  for (let i = 0; i < p.count; i += 3) if (nr.getZ(i) > -0.9) keep.push(i, i + 1, i + 2);
  const pos = new Float32Array(keep.length * 3);
  const nor = new Float32Array(keep.length * 3);
  keep.forEach((k, j) => {
    pos.set([p.getX(k), p.getY(k), p.getZ(k)], j * 3);
    nor.set([nr.getX(k), nr.getY(k), nr.getZ(k)], j * 3);
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return onFace(out, f);
}

/**
 * 灰泥柱（或墙身）：w × d 的方柱，从 y0 到 y1。外面一层 t 厚的灰泥皮（四面，带洞），里面是砖芯（洞里看得见）。
 * holes：每面的洞 { s, e, n, w }（朝南 / 东 / 北 / 西）。返回 [灰泥, 砖芯]，都写好了墙面 uv（离 y1 多深）。
 */
export function stuccoBlock(
  w: number,
  d: number,
  y0: number,
  y1: number,
  cx: number,
  cz: number,
  t: number,
  holes: Partial<Record<'s' | 'e' | 'n' | 'w', Spall[]>>,
): { skin: THREE.BufferGeometry[]; core: THREE.BufferGeometry[] } {
  const skin: THREE.BufferGeometry[] = [];
  const core: THREE.BufferGeometry[] = [];
  const sides = [
    { k: 's' as const, n: new THREE.Vector3(0, 0, 1), half: d / 2, len: w, u0: 0 },
    { k: 'e' as const, n: new THREE.Vector3(1, 0, 0), half: w / 2, len: d - 2 * t, u0: w },
    { k: 'n' as const, n: new THREE.Vector3(0, 0, -1), half: d / 2, len: w, u0: w + d },
    { k: 'w' as const, n: new THREE.Vector3(-1, 0, 0), half: w / 2, len: d - 2 * t, u0: 2 * w + d },
  ];
  for (const s of sides) {
    const o = new THREE.Vector3(cx, 0, cz).addScaledVector(s.n, s.half - t);
    const f = faceOf(o, s.n);
    skin.push(wallUv(skinFace(f, s.len, y0, y1, t, holes[s.k] ?? []), f, y1, s.u0));
    // 砖芯：只要有洞的面才画（看不见的面省掉）
    if (holes[s.k]?.length) {
      const cw = s.k === 's' || s.k === 'n' ? w - 2 * t : d - 2 * t;
      const cg = onFace(new THREE.PlaneGeometry(cw, y1 - y0).translate(0, (y0 + y1) / 2, 0), f);
      core.push(wallUv(cg, f, y1, s.u0));
    }
  }
  return { skin, core };
}

// ── 平面图案：徽标、假字（不写真的字：俱乐部还没定名字） ──

/** xy 平面上的矩形 [左, 下, 右, 上]（米） */
export type R4 = [number, number, number, number];
export function rectGeo([x0, y0, x1, y1]: R4): THREE.BufferGeometry {
  return new THREE.PlaneGeometry(x1 - x0, y1 - y0).translate((x0 + x1) / 2, (y0 + y1) / 2, 0);
}

/**
 * 一个"像字的"假字：3 × 5 格（格 = unit 米）的笔画：左竖 / 右竖 / 中竖 + 上 / 中 / 下横，按随机挑，至少两笔。
 * 返回矩形（左下角在 (x, y)）。笔画按行合并成横条、竖条合并成一整根。
 */
export function glyph(rnd: () => number, x: number, y: number, unit: number, cols = 3, rows = 5): R4[] {
  // 2026-11-08 用户：假字不要像真字母（以前的竖横组合读成「7FF110」）。现在每个"字"只是一两道横短划：
  // 中线一道（长 2～3 格），偶尔在下面一行再补一道短的，像远处看不清的手写招牌；俱乐部定名以后再换真字。
  const mid = Math.floor(rows / 2);
  const len = rnd() < 0.35 ? cols - 1 : cols;
  const off = len < cols && rnd() < 0.5 ? 1 : 0;
  const out: R4[] = [[x + off * unit, y + mid * unit, x + (off + len) * unit, y + (mid + 1) * unit]];
  if (rnd() < 0.3) {
    const c0 = Math.floor(rnd() * (cols - 1));
    out.push([x + c0 * unit, y + (mid + 2) * unit, x + (c0 + 1) * unit, y + (mid + 3) * unit]);
  }
  return out;
}

/** 一行假字：n 个字，字宽 3 格、字距 gap 格，从 x 起；返回矩形和这行的宽度 */
export function word(
  rnd: () => number,
  n: number,
  x: number,
  y: number,
  unit: number,
  gap = 1,
): { rects: R4[]; w: number } {
  const rects: R4[] = [];
  for (let i = 0; i < n; i++) rects.push(...glyph(rnd, x + i * (3 + gap) * unit, y, unit));
  return { rects, w: (n * (3 + gap) - gap) * unit };
}

/** 网球的两条缝（2D 徽标）：圆心 (cx, cy)、半径 r 的球上左右各一段弧，线宽 lw */
export function ballSeams(cx: number, cy: number, r: number, lw: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const R = 0.95 * r;
  const c = 1.3 * r;
  const a = (46 * Math.PI) / 180;
  for (const s of [-1, 1]) {
    // 弧心在球外（左 / 右），只取伸进球里的那一段
    const start = s < 0 ? -a : Math.PI - a;
    out.push(new THREE.RingGeometry(R - lw / 2, R + lw / 2, 10, 1, start, 2 * a).translate(cx + s * c, cy, 0));
  }
  return out;
}

/** 网球的立体缝：球心 c、半径 r 的球面上的经典"网球缝"曲线，管粗 tube；法线改成球面法线（跟着球的明暗走） */
export function ballSeam3D(
  c: THREE.Vector3,
  r: number,
  tube: number,
  rot = new THREE.Euler(),
  segs = 32,
): THREE.BufferGeometry {
  class Seam extends THREE.Curve<THREE.Vector3> {
    // biome-ignore lint/complexity/noUselessConstructor: Curve 的构造函数是 protected，这里放开
    constructor() {
      super();
    }
    override getPoint(t: number, out = new THREE.Vector3()) {
      const a = t * Math.PI * 2;
      const k = 0.44;
      out.set(Math.cos(a) + k * Math.cos(3 * a), Math.sin(a) - k * Math.sin(3 * a), 2 * Math.sqrt(k) * Math.sin(2 * a));
      return out.normalize().multiplyScalar(r * 1.012);
    }
  }
  const g = new THREE.TubeGeometry(new Seam(), segs, tube, 3, true);
  g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(rot));
  // 球面法线：缝跟着球的亮顶 / 中腰 / 暗底走，不是一根自己有明暗的绳子
  const p = g.getAttribute('position');
  const n = g.getAttribute('normal') as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    n.setXYZ(i, v.x, v.y, v.z);
  }
  return g.translate(c.x, c.y, c.z);
}

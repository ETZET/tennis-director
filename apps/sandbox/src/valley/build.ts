// valley 的白模：地面、山、路、河床、楼、绿地、棕榈、灌木、风车、步道和观景台、事的标记。全按 layout.ts / terrain.ts 的数。
// 几何按（区域, 材质）合并成一个网格：锁着的区域整片换成压暗的材质（"锁着 = 暗"），解锁换回来。
// 平的大面（地面、路、河床、绿地）按区域的真实边界切开再归区域（原来按 20 米一格的格子中心归，锁着的边是锯齿）。
// 山按 24 格一块切开（视锥外的块不画）。俱乐部那块（CLUB_BOX）不铺，clubwalk 的底图和区域管。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Shape } from '../clubsite/play';
import type { SharedUniforms } from '../clubsite/render/ctx';
import { box } from '../clubsite/render/geo';
import type { Elem, Tones } from '../clubsite/render/toon';
import {
  along,
  type Bldg,
  BRIDGES,
  BUILDINGS,
  distToLine,
  FLOOR,
  GREENS,
  HOTEL_BLDGS,
  HOTEL_PLOT,
  houses,
  inPoly,
  POIS,
  type PoiKind,
  REGIONS,
  ROADS,
  type Road,
  regionAt,
  S,
  SCALE,
  type V2,
  WASH,
  washDist,
  windmills,
} from './layout';
import { buildMountains, MTN_RAMP } from './mountains';
import { EL, type MapCtx, PAL, type PalKey } from './reuse';
import { CLUB_BOX, HF, inClubBox, LOOKOUT, mountainY, trailY } from './terrain';

type Ramp = [number, number, number];
/**
 * 锁着的区域：每档往深紫灰里压，但保留档与档之间的差（原来三档一律往同一个色 lerp 58%，档差只剩四成，
 * 一片发灰发平、像蒙了一层雾）。亮档压得最多、暗档压得少 → 还看得出形状，整体是"没开灯的夜里"。
 */
const DIM_TO = new THREE.Color(0x2c2450);
const DIM_K = [0.56, 0.5, 0.36];
const dimHex = (c: THREE.ColorRepresentation, i: number) =>
  `#${new THREE.Color(c).lerp(DIM_TO, DIM_K[i] ?? 0.5).getHexString()}`;
const dimRamp = (r: readonly number[]): Ramp => r.map((c, i) => dimHex(c, i)) as unknown as Ramp;
/**
 * 带元素图案的材质（沙、碎石、石板……）按 tones 上色，只换 ramp 不起作用（原来锁着的区域路和楼压暗了、地面还是亮的，
 * 一块块暗东西浮在亮沙上）：tones 也一样压
 */
const dimTones = (t: Tones): Tones => ({
  bands: t.bands.map((b, i) => b.map((c) => dimHex(c, i))) as unknown as Tones['bands'],
  seam: t.seam.map((c, i) => dimHex(c, i)) as unknown as Tones['seam'],
  hi: t.hi.map((c, i) => dimHex(c, i)) as unknown as Tones['hi'],
});

/** 大面积表面的元素图案（材质规范 v2，同 clubmap2：沙粒、碎石步道、水纹……） */
const ELEM: Record<string, Elem> = {
  sand: EL.sand,
  sandHigh: { ...EL.sand, seed: 7 },
  sandPatch: { ...EL.sand, seed: 19 },
  path: EL.path,
  water: EL.water,
  adobe: EL.adobe,
  flagstone: EL.flagstone,
  tile: EL.tile,
};

/** 合并前统一：不带索引、只留 position + normal */
function prep(g: THREE.BufferGeometry): THREE.BufferGeometry {
  let o = g.index ? g.toNonIndexed() : g;
  if (o !== g) g.dispose();
  for (const k of Object.keys(o.attributes)) if (k !== 'position' && k !== 'normal') o.deleteAttribute(k);
  if (!o.attributes.normal) o.computeVertexNormals();
  o = o as THREE.BufferGeometry;
  return o;
}

/** 平铺的三角形（自己算法线朝上） */
function flatTris(pos: number[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
/**
 * 折线的带子（每段一个四边形 + 拐点一个圆补缝）；half 可以按点给。
 * seg：拐点那块圆的边数（宽的路要多一点，不然拐弯外沿是折的）
 */
function ribbon(
  pts: readonly V2[],
  half: number | readonly number[],
  y: number | ((i: number) => number),
  seg = 12,
): THREE.BufferGeometry {
  const pos: number[] = [];
  const H = (i: number) => (typeof half === 'number' ? half : half[i]);
  const Y = (i: number) => (typeof y === 'number' ? y : y(i));
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1];
    const [bx, bz] = pts[i];
    const L = Math.hypot(bx - ax, bz - az);
    if (L < 1e-3) continue;
    const nx = -(bz - az) / L;
    const nz = (bx - ax) / L;
    const ha = H(i - 1);
    const hb = H(i);
    const ya = Y(i - 1);
    const yb = Y(i);
    const a0 = [ax + nx * ha, ya, az + nz * ha];
    const a1 = [ax - nx * ha, ya, az - nz * ha];
    const b0 = [bx + nx * hb, yb, bz + nz * hb];
    const b1 = [bx - nx * hb, yb, bz - nz * hb];
    pos.push(...a0, ...b0, ...a1, ...a1, ...b0, ...b1);
  }
  for (let i = 1; i < pts.length - 1; i++) {
    const [cx, cz] = pts[i];
    const r = H(i);
    for (let k = 0; k < seg; k++) {
      const a = (k / seg) * Math.PI * 2;
      const b = ((k + 1) / seg) * Math.PI * 2;
      pos.push(
        cx,
        Y(i),
        cz,
        cx + Math.cos(b) * r,
        Y(i),
        cz + Math.sin(b) * r,
        cx + Math.cos(a) * r,
        Y(i),
        cz + Math.sin(a) * r,
      );
    }
  }
  return fixUp(flatTris(pos));
}
/**
 * 折线的带子，拐点斜接（相邻两段共用拐点的两个顶点，整条一张连着的网）。
 * ribbon 是每段一个四边形 + 拐点一块圆，段和段的端边在拐点上只差一点浮点，低分辨率下每个拐点都露出一条横穿路面的亮缝。
 * 斜接最长 2 倍半宽（拐得太急的拐点外角切掉，底下垫一块圆补上）
 */
function strip(pts: readonly V2[], half: number | readonly number[], y: number, seg = 16): THREE.BufferGeometry {
  const H = (i: number) => (typeof half === 'number' ? half : half[i]);
  const P: V2[] = pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 1e-3);
  const n = P.length;
  const segN = (i: number): V2 => {
    const [ax, az] = P[i];
    const [bx, bz] = P[i + 1];
    const L = Math.hypot(bx - ax, bz - az);
    return [-(bz - az) / L, (bx - ax) / L];
  };
  const L: number[][] = [];
  const R: number[][] = [];
  const pos: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = i > 0 ? segN(i - 1) : segN(0);
    const b = i < n - 1 ? segN(i) : segN(n - 2);
    let mx = a[0] + b[0];
    let mz = a[1] + b[1];
    const ml = Math.hypot(mx, mz) || 1;
    mx /= ml;
    mz /= ml;
    const cos = mx * a[0] + mz * a[1];
    const k = H(i) / Math.max(0.5, cos);
    L.push([P[i][0] + mx * k, y, P[i][1] + mz * k]);
    R.push([P[i][0] - mx * k, y, P[i][1] - mz * k]);
    if (cos < 0.5 && i > 0 && i < n - 1) {
      // 太急的拐点：外角切掉了，垫一块圆（低 3 毫米，只从切口露出来）
      const r = H(i);
      for (let q = 0; q < seg; q++) {
        const t0 = (q / seg) * Math.PI * 2;
        const t1 = ((q + 1) / seg) * Math.PI * 2;
        const [cx, cz] = P[i];
        pos.push(cx, y - 0.003, cz, cx + Math.cos(t1) * r, y - 0.003, cz + Math.sin(t1) * r);
        pos.push(cx + Math.cos(t0) * r, y - 0.003, cz + Math.sin(t0) * r);
      }
    }
  }
  for (let i = 1; i < n; i++) pos.push(...L[i - 1], ...L[i], ...R[i - 1], ...R[i - 1], ...L[i], ...R[i]);
  return fixUp(flatTris(pos));
}
/** 朝下的三角形翻过来（ribbon 的绕向按左右手不定） */
function fixUp(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const p = g.attributes.position as THREE.BufferAttribute;
  const n = g.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i += 3) {
    if (n.getY(i) >= 0) continue;
    // 交换第 2、3 个顶点
    for (const k of [0, 1, 2]) {
      const t = p.getComponent(i + 1, k);
      p.setComponent(i + 1, k, p.getComponent(i + 2, k));
      p.setComponent(i + 2, k, t);
    }
  }
  g.computeVertexNormals();
  return g;
}
function polyTop(poly: readonly V2[], y: number): THREE.BufferGeometry {
  const shape = new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z)));
  const g = new THREE.ShapeGeometry(shape);
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  return g;
}
/** 转过的盒子：中心 (x, z)、底 y */
function rbox(w: number, h: number, d: number, x: number, y: number, z: number, rot = 0): THREE.BufferGeometry {
  const g = box(w, h, d, 0, y, 0);
  if (rot) g.rotateY(rot);
  g.translate(x, 0, z);
  return g;
}
/** 水平的圆（y 高） */
const disc = (r: number, seg: number, x: number, y: number, z: number) =>
  new THREE.CircleGeometry(r, seg).rotateX(-Math.PI / 2).translate(x, y, z);

/** 区域 id（俱乐部那块 = club；山上 / 平地外 = none，不会压暗） */
function regionOf(x: number, z: number): string {
  if (inClubBox(x, z)) return 'club';
  if (!inPoly(FLOOR, x, z)) return 'none';
  return regionAt(x, z)?.id ?? 'none';
}

// ── 区域的边（regionOf 的分界线全在这些线段上）：平的大面按它们切开 ─────────────
type P3 = [number, number, number];
const EDGES: [V2, V2][] = [];
{
  const loop = (pts: readonly V2[]) => {
    for (let i = 0; i < pts.length; i++) EDGES.push([pts[i], pts[(i + 1) % pts.length]]);
  };
  const B = CLUB_BOX;
  loop([
    [B.x0, B.z0],
    [B.x1, B.z0],
    [B.x1, B.z1],
    [B.x0, B.z1],
  ]);
  loop(FLOOR);
  for (const r of REGIONS) loop(r.poly);
}
const EG = 40;
const EDGE_GRID = new Map<string, number[]>();
EDGES.forEach(([a, b], i) => {
  for (let gx = Math.floor(Math.min(a[0], b[0]) / EG); gx <= Math.floor(Math.max(a[0], b[0]) / EG); gx++)
    for (let gz = Math.floor(Math.min(a[1], b[1]) / EG); gz <= Math.floor(Math.max(a[1], b[1]) / EG); gz++) {
      const k = `${gx}|${gz}`;
      const l = EDGE_GRID.get(k) ?? [];
      l.push(i);
      EDGE_GRID.set(k, l);
    }
});
/** 凸多边形按直线 a→b 切成左右两半（在线上的点两边都要） */
function splitPoly(poly: P3[], a: V2, b: V2): [P3[], P3[]] {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const side = (p: P3) => dx * (p[2] - a[1]) - dz * (p[0] - a[0]);
  const L: P3[] = [];
  const R: P3[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const sp = side(p);
    const sq = side(q);
    if (sp >= 0) L.push(p);
    if (sp <= 0) R.push(p);
    if ((sp > 0 && sq < 0) || (sp < 0 && sq > 0)) {
      const t = sp / (sp - sq);
      const m: P3 = [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
      L.push(m);
      R.push(m);
    }
  }
  return [L, R];
}
const areaXZ = (p: P3[]) => {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const q = p[(i + 1) % p.length];
    s += p[i][0] * q[2] - q[0] * p[i][2];
  }
  return Math.abs(s) / 2;
};
/** 三角形按区域边切开：每块（凸多边形）和它归的区域 */
function splitByRegion(tri: P3[]): { reg: string; poly: P3[]; club: boolean }[] {
  let x0 = Number.POSITIVE_INFINITY;
  let x1 = Number.NEGATIVE_INFINITY;
  let z0 = Number.POSITIVE_INFINITY;
  let z1 = Number.NEGATIVE_INFINITY;
  for (const p of tri) {
    x0 = Math.min(x0, p[0]);
    x1 = Math.max(x1, p[0]);
    z0 = Math.min(z0, p[2]);
    z1 = Math.max(z1, p[2]);
  }
  const seen = new Set<number>();
  let pieces = [tri];
  for (let gx = Math.floor(x0 / EG); gx <= Math.floor(x1 / EG); gx++)
    for (let gz = Math.floor(z0 / EG); gz <= Math.floor(z1 / EG); gz++)
      for (const e of EDGE_GRID.get(`${gx}|${gz}`) ?? []) {
        if (seen.has(e)) continue;
        seen.add(e);
        const [a, b] = EDGES[e];
        if (Math.max(a[0], b[0]) < x0 || Math.min(a[0], b[0]) > x1) continue;
        if (Math.max(a[1], b[1]) < z0 || Math.min(a[1], b[1]) > z1) continue;
        const next: P3[][] = [];
        for (const pc of pieces) {
          const [l, r] = splitPoly(pc, a, b);
          if (l.length >= 3 && areaXZ(l) > 1e-6) next.push(l);
          if (r.length >= 3 && areaXZ(r) > 1e-6) next.push(r);
        }
        pieces = next;
      }
  return pieces.map((poly) => {
    let cx = 0;
    let cz = 0;
    for (const p of poly) {
      cx += p[0] / poly.length;
      cz += p[2] / poly.length;
    }
    return { reg: regionOf(cx, cz), poly, club: inClubBox(cx, cz) };
  });
}

/** 两点之间的距离到形状（导航的挡路形状）：≤ 0 = 在里面 */
function shapeDist(sh: Shape, x: number, z: number): number {
  if ('x0' in sh) {
    const dx = Math.max(sh.x0 - x, 0, x - sh.x1);
    const dz = Math.max(sh.z0 - z, 0, z - sh.z1);
    return Math.hypot(dx, dz);
  }
  if ('poly' in sh) return inPoly(sh.poly, x, z) ? 0 : distToLine([...sh.poly, sh.poly[0]], x, z);
  if ('a' in sh) return distToLine([sh.a, sh.b], x, z) - sh.r;
  return Math.hypot(x - sh.x, z - sh.z) - sh.r;
}

// 手写的世界坐标（原尺寸）都过 S（layout.ts 的整体缩放）；只压位置，不压大小
/** 学校跑道的中心 */
const TRACK = S(795, -700);
/** 瀑布下的潭 */
const FALLS = S(16, -610);
/** 印第安峡谷绿洲（野生扇叶棕榈一丛） */
const OASIS = S(300, 282);

const DRIVEABLE = ROADS.filter((r) => r.kind !== 'trail');
/** 离路面（车道，不含步道）边多远：< 0 = 在路面上 */
const roadGap = (x: number, z: number, skip?: Road) => {
  let best = Number.POSITIVE_INFINITY;
  for (const q of DRIVEABLE) if (q !== skip) best = Math.min(best, distToLine(q.pts, x, z) - q.w / 2);
  return best;
};
/** 离步道边多远 */
const trailGap = (x: number, z: number) => {
  let best = Number.POSITIVE_INFINITY;
  for (const q of ROADS) if (q.kind === 'trail') best = Math.min(best, distToLine(q.pts, x, z) - q.w / 2 - 0.3);
  return best;
};

/**
 * 棕榈的冠：一圈下垂的长叶（每片两节：里节平伸、外节往下垂，叶片两头尖）+ 冠心一团；法线按冠心的球面（整冠一个亮顶、暗底）。
 * 原来是八根等宽的扁盒子，远看像螺旋桨。本地原点在树脚，冠心在 y。
 */
export function palmCrownGeo(n: number, L: number, y: number, seed = 1): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [prep(new THREE.IcosahedronGeometry(0.55, 0).translate(0, y + 0.05, 0))];
  const up = new THREE.Vector3(0, 1, 0);
  const blade = (p0: THREE.Vector3, p1: THREE.Vector3, w0: number, w1: number) => {
    const d = p1.clone().sub(p0);
    const len = d.length();
    d.normalize();
    // 三棱、不封口（一片叶 6 个三角形；路边一排几百棵，三角形预算紧）
    const g = new THREE.CylinderGeometry(w1, w0, len, 3, 1, true).scale(1, 1, 0.3);
    const X = new THREE.Vector3().crossVectors(d, up).normalize();
    const Z = new THREE.Vector3().crossVectors(X, d).normalize();
    g.applyMatrix4(new THREE.Matrix4().makeBasis(X, d, Z));
    g.translate((p0.x + p1.x) / 2, (p0.y + p1.y) / 2, (p0.z + p1.z) / 2);
    parts.push(prep(g));
  };
  for (let k = 0; k < n; k++) {
    const h = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453;
    const j = h - Math.floor(h);
    const a = (k / n) * Math.PI * 2 + (j - 0.5) * 0.35;
    // 上下三层：朝上的短叶、平伸的、往下垂的
    const lift = [0.42, 0.05, -0.32][k % 3];
    const len = L * (k % 3 === 0 ? 0.78 : 1) * (0.9 + j * 0.2);
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const p0 = new THREE.Vector3(0, y, 0).addScaledVector(dir, 0.3);
    const p1 = p0
      .clone()
      .addScaledVector(dir, len * 0.5 * Math.cos(lift))
      .add(new THREE.Vector3(0, len * 0.5 * Math.sin(lift), 0));
    const droop = lift - 0.75;
    const p2 = p1
      .clone()
      .addScaledVector(dir, len * 0.5 * Math.cos(droop))
      .add(new THREE.Vector3(0, len * 0.5 * Math.sin(droop), 0));
    blade(p0, p1, 0.14, 0.34);
    blade(p1, p2, 0.34, 0.06);
  }
  const g = mergeGeometries(parts);
  const p = g.attributes.position as THREE.BufferAttribute;
  const nn = g.attributes.normal as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i), p.getY(i) - (y - 0.9), p.getZ(i)).normalize();
    nn.setXYZ(i, v.x, v.y, v.z);
  }
  return g;
}

export interface ValleyWorld {
  root: THREE.Group;
  /** 锁 / 解锁一片区域：压暗或换回来 */
  setLocked(id: string, locked: boolean): void;
  /** 酒店扩张地：空地（立桩子）↔ 酒店白模 */
  setHotel(on: boolean): void;
  /** 每步（风车转） */
  update(dt: number, t: number): void;
  /** 事的标记（世界坐标，标记顶上） */
  poiTops: Map<string, THREE.Vector3>;
  /** 细节模块登记的挡路形状（围栏、长椅、看台……） */
  blocked: Shape[];
}

/** 实例化的一件（棕榈、灌木、路灯……）：位置、缩放、绕 y 转、归哪个区域（锁着压暗） */
export interface InstItem {
  x: number;
  z: number;
  s: number;
  reg: string;
  y?: number;
  rot?: number;
}

/**
 * 细节模块（src/valley/detail/*.ts）拿到的东西。几何都是世界坐标；put 进去的按（区域, 材质）合并，锁着的区域自动压暗。
 * - put(region, key, geo)：region 用 regionOf(x, z) 算（按物件的中心）；key 是 clubmap2 调色板的键（PalKey）
 * - instance(geo, key, items)：同一个形状摆很多（geo 在本地原点，底在 y 0）
 * - block(shape)：挡路（导航；不给的话总监会穿过去）。Shape 同 clubsite/play 的 Rect / Circle / Poly / Seg
 * - rng('名字')：种子随机流（不要用 Math.random）
 * - root / mat：要单独一个网格（会动的、要开关的）就自己 new Mesh(geo, mat(key)) 加到 root
 */
export interface DetailCtx {
  put(region: string, key: PalKey, g: THREE.BufferGeometry): void;
  regionOf(x: number, z: number): string;
  rng(stream: string): () => number;
  block(shape: Shape): void;
  /** 这块地细节铺满了（广场、停车场、球场、草坪）：build.ts 撒的灌木、大道边的棕榈不进来 */
  clear(r: { x0: number; x1: number; z0: number; z1: number }): void;
  instance(g: THREE.BufferGeometry, key: PalKey, items: InstItem[], cast?: boolean): void;
  root: THREE.Group;
  mat(key: PalKey): THREE.Material;
  /** 平的大面（铺地、草坪……）：按区域的真实边界切开再归区域（锁着压暗时边是直的，不按物件中心整块归） */
  putFlat?(key: PalKey, g: THREE.BufferGeometry): void;
}
export type Detail = (d: DetailCtx) => void;

/** 不投影的材质键：平的东西（地面、路、绿地、河床） */
const NO_CAST = new Set<string>([
  'sand',
  'asphalt',
  'lawn',
  'line',
  'sandPatch',
  'path',
  'court',
  'surround',
  'clay',
  'green',
  'sandHigh',
]);

/** details：各区域的细节模块（main 传 detail/index.ts 的 DETAILS；细节模块 import 这里的工具，反过来不 import 它们，免得绕圈） */
export function buildValley(
  ctx: MapCtx,
  uniforms: SharedUniforms,
  locked: ReadonlySet<string>,
  details: readonly Detail[] = [],
): ValleyWorld {
  void uniforms;
  const root = new THREE.Group();
  root.name = 'valley';

  // ── 材质：每个（键, 暗不暗）一个 ──
  const mats = new Map<string, THREE.Material>();
  const mat = (key: PalKey | 'mtn', dim: boolean): THREE.Material => {
    const id = `${key}|${dim}`;
    let m = mats.get(id);
    if (!m) {
      if (key === 'mtn')
        m = ctx.mats.toon(0xffffff, {
          ramp: dim ? dimRamp(MTN_RAMP) : MTN_RAMP,
          edge: 0.3,
          convex: 0.15,
          bands: [0.15, 0.75],
          lightUp: 0.1,
        });
      else {
        const elem = ELEM[key as string];
        const sw = PAL[key] as { ramp: readonly number[]; tones?: Tones };
        // 沥青用调色板原来的（和俱乐部车道一样）：r2 改成的石板蓝远看像河、像天
        const base = sw.ramp;
        m = ctx.mat(key, {
          ...(elem ? { elem } : {}),
          ...(dim ? { ramp: dimRamp(base), ...(sw.tones ? { tones: dimTones(sw.tones) } : {}) } : {}),
        });
      }
      mats.set(id, m);
    }
    return m;
  };

  // ── 桶：按（区域, 材质[, 不投影]）攒几何，最后合并 ──
  const bucket = new Map<string, THREE.BufferGeometry[]>();
  const put = (region: string, key: PalKey, g: THREE.BufferGeometry) => {
    const k = `${region}|${key}`;
    const list = bucket.get(k) ?? [];
    list.push(prep(g));
    bucket.set(k, list);
  };
  /** 细的、长的东西（护栏、栏杆）：不投影（投出来是一条粗黑带） */
  const putThin = (region: string, key: PalKey, g: THREE.BufferGeometry) => {
    const k = `${region}|${key}|thin`;
    const list = bucket.get(k) ?? [];
    list.push(prep(g));
    bucket.set(k, list);
  };
  /** 平的大面：按区域边切开再放 */
  const putFlat = (key: PalKey, g0: THREE.BufferGeometry) => {
    const g = g0.index ? g0.toNonIndexed() : g0;
    const p = g.attributes.position as THREE.BufferAttribute;
    const out = new Map<string, number[]>();
    for (let i = 0; i + 2 < p.count; i += 3) {
      const tri: P3[] = [0, 1, 2].map((k) => [p.getX(i + k), p.getY(i + k), p.getZ(i + k)] as P3);
      for (const { reg, poly, club } of splitByRegion(tri)) {
        // 俱乐部那块（CLUB_BOX）的地归 clubwalk 的区域（clubpark 的前场、车道……）：山谷一块平的都不画
        if (club) continue;
        const arr = out.get(reg) ?? [];
        for (let k = 1; k + 1 < poly.length; k++) arr.push(...poly[0], ...poly[k], ...poly[k + 1]);
        out.set(reg, arr);
      }
    }
    g.dispose();
    if (g !== g0) g0.dispose();
    for (const [reg, pos] of out) put(reg, key, flatTris(pos));
  };
  /** 按区域分好的网格（换材质用） */
  const byRegion = new Map<string, { obj: THREE.Mesh | THREE.InstancedMesh; key: PalKey | 'mtn' }[]>();
  const own = (region: string, obj: THREE.Mesh | THREE.InstancedMesh, key: PalKey | 'mtn') => {
    const list = byRegion.get(region) ?? [];
    list.push({ obj, key });
    byRegion.set(region, list);
  };

  // ── 地面：20 米一格，格子中心在平地里（或平地外 20 米内，山脚盖着）；俱乐部那块不铺；按区域边切开 ──
  {
    const C = 20;
    const pos: number[] = [];
    for (let x = HF.x0; x < HF.x1; x += C)
      for (let z = HF.z0; z < HF.z1; z += C) {
        const cx = x + C / 2;
        const cz = z + C / 2;
        if (cx > CLUB_BOX.x0 && cx < CLUB_BOX.x1 && cz > CLUB_BOX.z0 && cz < CLUB_BOX.z1) continue;
        // 九个点（四角、四边中点、中心）都在山上才不铺：只看中心和两个角的话，山脚的格子会被跳过、露出缺块
        const up = (a: number, b: number) => mountainY(a, b) > 0.3;
        const nine: [number, number][] = [
          [cx, cz],
          [x, z],
          [x + C, z],
          [x, z + C],
          [x + C, z + C],
          [cx, z],
          [cx, z + C],
          [x, cz],
          [x + C, cz],
        ];
        if (!inPoly(FLOOR, cx, cz) && nine.every(([a, b]) => up(a, b))) continue;
        pos.push(x, 0, z, x, 0, z + C, x + C, 0, z, x + C, 0, z, x, 0, z + C, x + C, 0, z + C);
      }
    putFlat('sand', flatTris(pos));
  }

  // ── 山（valley/mountains.ts）──
  for (const m of buildMountains(ctx)) {
    root.add(m);
    own('none', m, 'mtn');
  }

  // ── 河床：浅一档的沙（石头在细节之后撒，要让开细节铺好的地） ──
  putFlat('sandPatch', strip(WASH.pts, WASH.half, 0.012));

  // ── 绿地 ──
  for (const q of GREENS) {
    const [cx, cz] = q.poly.reduce(([a, b], [x, z]) => [a + x / q.poly.length, b + z / q.poly.length], [0, 0]);
    if (q.kind === 'golf') {
      putFlat('lawn', polyTop(q.poly, 0.015));
      // 塔奎兹溪高尔夫的球洞、果岭、沙坑在 detail/east.ts；这里给别的球场撒几块（印第安峡谷高尔夫的旗插在这几块上，detail/south.ts）
      if (q.id === 'tahquitz_golf') continue;
      const rnd = ctx.rng(`valley:${q.id}`);
      for (let k = 0; k < 7; k++) {
        const a = k * 2.4;
        // 离球场中心的偏移是位置：跟着整体缩放收（大小不缩）；detail/south.ts 的旗插在这几块上，照这里的位置
        const x = cx + Math.cos(a) * (35 + k * 10) * SCALE;
        const z = cz + Math.sin(a) * (24 + k * 5) * SCALE;
        const g = new THREE.CircleGeometry(5 + rnd() * 4, 20).rotateX(-Math.PI / 2).scale(1.4, 1, 1);
        putFlat(k % 2 ? 'sandHigh' : 'green', g.translate(x, 0.025, z));
      }
    } else if (q.kind === 'park' || q.kind === 'field') putFlat('lawn', polyTop(q.poly, 0.015));
    else if (q.kind === 'runway') putFlat('asphalt', polyTop(q.poly, 0.02));
  }
  // 学校的跑道（日出公园的公共球场在 detail/east.ts）
  putFlat(
    'clay',
    // 跑道：外圈约 54×34 米（原来 96×48，比缩过的操场还大，东头压进体育馆）
    new THREE.RingGeometry(13, 17, 48)
      .rotateX(-Math.PI / 2)
      .scale(1.6, 1, 1)
      .translate(TRACK[0], 0.025, TRACK[1]),
  );

  // ── 路：整条一根带子（拐点补圆），按区域边切开；中线虚线（大道、公路）在路口、路头让开 ──
  for (const r of ROADS) {
    if (r.kind === 'trail') {
      if (r.id === 'museum_trail') {
        // 爬山的那条：每个点按步道高度
        const fine: V2[] = [];
        const ss: number[] = [];
        for (const [s, p] of along(r.pts, 2)) {
          fine.push(p);
          ss.push(s);
        }
        // 法线一律朝上：2 米一段的斜面各自的法线略不同，傍晚太阳低时一段亮一段暗（像糖果条纹）
        const tg = ribbon(fine, r.w / 2 + 0.3, (i) => trailY(ss[i]) + 0.04);
        const nrm = tg.attributes.normal as THREE.BufferAttribute;
        for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, 0, 1, 0);
        put('mountain', 'path', tg);
      } else putFlat('path', strip(r.pts, r.w / 2 + 0.3, 0.02));
      continue;
    }
    putFlat('asphalt', strip(r.pts, r.w / 2, 0.03));
    if (r.kind === 'avenue' || r.kind === 'highway') {
      const total = along(r.pts, 1).length;
      for (const [s, p, t] of along(r.pts, 8)) {
        if (s < 8 || s > total - 8) continue;
        // 路口：别的路面 3 米以内不画（原来虚线一路穿过路口）
        if (roadGap(p[0], p[1], r) < 3 + 1.5 || inClubBox(p[0], p[1])) continue;
        const g = box(0.25, 0.02, 3, 0, 0.03, 0);
        g.rotateY(Math.atan2(t[0], t[1]));
        put(regionOf(p[0], p[1]), 'line', g.translate(p[0], 0, p[1]));
      }
    }
  }

  // 桥：过河那段沿着路两边的矮护栏（栏板 + 每 4 米一根柱），跟着路弯；两头一对粗一点的端柱
  for (const br of BRIDGES) {
    const r = ROADS.find((q) => q.id === br.road);
    if (!r) continue;
    const fine = along(r.pts, 2);
    // 离桥位置最近的那个点，往两头走到出了河床 3 米
    let ci = 0;
    fine.forEach(([, p], i) => {
      if (Math.hypot(p[0] - br.x, p[1] - br.z) < Math.hypot(fine[ci][1][0] - br.x, fine[ci][1][1] - br.z)) ci = i;
    });
    let i0 = ci;
    let i1 = ci;
    while (i0 > 0 && washDist(fine[i0][1][0], fine[i0][1][1]) < 3) i0--;
    while (i1 < fine.length - 1 && washDist(fine[i1][1][0], fine[i1][1][1]) < 3) i1++;
    const off = r.w / 2 + 0.45;
    for (const s of [-1, 1]) {
      const rail: V2[] = [];
      for (let i = i0; i <= i1; i++) {
        const [, p, t] = fine[i];
        rail.push([p[0] - t[1] * off * s, p[1] + t[0] * off * s]);
      }
      for (let i = 1; i < rail.length; i++) {
        const [ax, az] = rail[i - 1];
        const [bx, bz] = rail[i];
        const mx = (ax + bx) / 2;
        const mz = (az + bz) / 2;
        const L = Math.hypot(bx - ax, bz - az);
        const rot = Math.atan2(bx - ax, bz - az);
        // 河床步道从桥下穿过：步道那段护栏开口
        if (trailGap(mx, mz) < 0.6 || trailGap(bx, bz) < 0.6) continue;
        putThin(regionOf(mx, mz), 'concrete', rbox(0.3, 0.5, L + 0.02, mx, 0, mz, rot));
        if (i % 2 === 0) put(regionOf(mx, mz), 'concrete', rbox(0.42, 0.7, 0.42, bx, 0, bz, rot));
      }
      const n = rail.length;
      if (n < 2) continue;
      for (const [p, q] of [
        [rail[0], rail[1]],
        [rail[n - 1], rail[n - 2]],
      ] as const)
        if (trailGap(p[0], p[1]) > 0.8)
          put(
            regionOf(p[0], p[1]),
            'concrete',
            rbox(0.7, 0.95, 0.9, p[0], 0, p[1], Math.atan2(q[0] - p[0], q[1] - p[1])),
          );
    }
  }

  // ── 楼 ──
  /** 楼朝哪条路：最近的路面点在楼的本地坐标里是哪个方向（±x / ±z 四个面挑一个） */
  const faceOf = (o: Bldg): [number, number] => {
    let best = Number.POSITIVE_INFINITY;
    let bx = o.x;
    let bz = o.z + 1;
    for (const q of DRIVEABLE)
      for (let i = 1; i < q.pts.length; i++) {
        const [ax, az] = q.pts[i - 1];
        const [cx, cz] = q.pts[i];
        const dx = cx - ax;
        const dz = cz - az;
        const L = dx * dx + dz * dz;
        const t = L > 0 ? Math.max(0, Math.min(1, ((o.x - ax) * dx + (o.z - az) * dz) / L)) : 0;
        const px = ax + dx * t;
        const pz = az + dz * t;
        const d = Math.hypot(o.x - px, o.z - pz);
        if (d < best) {
          best = d;
          bx = px;
          bz = pz;
        }
      }
    const rot = o.rot ?? 0;
    const wx = bx - o.x;
    const wz = bz - o.z;
    // 世界 → 楼的本地（rotateY(rot) 的逆）
    const lx = wx * Math.cos(rot) - wz * Math.sin(rot);
    const lz = wx * Math.sin(rot) + wz * Math.cos(rot);
    return Math.abs(lx) / o.w > Math.abs(lz) / o.d ? [Math.sign(lx), 0] : [0, Math.sign(lz) || 1];
  };
  /**
   * 贴在楼的一个面上的东西：g 在"面的坐标"里建（x 沿墙、y 朝上、+z 朝墙外，原点在墙面底边中点），这里转到世界。
   * face：本地的面法线（±1, 0）或（0, ±1）
   */
  const onFace = (o: Bldg, face: [number, number], g: THREE.BufferGeometry, u = 0) => {
    const half = face[0] ? o.w / 2 : o.d / 2;
    g.translate(u, 0, half);
    g.rotateY(Math.atan2(face[0], face[1]));
    if (o.rot) g.rotateY(o.rot);
    return g.translate(o.x, 0, o.z);
  };
  const faceLen = (o: Bldg, face: [number, number]) => (face[0] ? o.d : o.w);

  const roofKey: Record<Bldg['kind'], PalKey> = {
    shop: 'concrete',
    civic: 'roofTile',
    school: 'roofTile',
    house: 'concrete',
    hotel: 'roofTile',
    gas: 'metal',
    office: 'concrete',
    museum: 'cap',
    misc: 'roofTile', // 老球拍俱乐部（1930 年代）、收费亭：西班牙式红瓦（原来褪色木板，一大块灰米色平板）
  };
  const wallKey: Record<Bldg['kind'], PalKey> = {
    shop: 'stucco',
    civic: 'stucco',
    school: 'adobe',
    house: 'stucco',
    hotel: 'stucco',
    gas: 'stucco',
    office: 'stucco',
    museum: 'adobe',
    misc: 'adobe',
  };
  const AWNING: PalKey[] = ['canvasStripe', 'fabricStripe', 'clothTeal', 'clothRed', 'flowerYellow'];
  const ALL_SOLIDS = [...BUILDINGS, ...houses()];
  // 门、窗、招牌、车棚、蝶形顶、加油岛……在各区域的细节（detail/*.ts）里按楼的朝向做；这里只有墙、屋顶板、遮阳篷、钟楼、雨棚板
  const putBldg = (o: Bldg, reg: string, rnd: () => number) => {
    const rot = o.rot ?? 0;
    put(reg, wallKey[o.kind], rbox(o.w, o.h, o.d, o.x, 0, o.z, rot));
    // 屋顶：一块出挑的板（中世纪现代的平顶 / 蝶形顶简化）
    const over = o.kind === 'house' ? 1.4 : 0.5;
    // 大楼（航站楼、高中）是现代的平顶：浅色，不是一整块 1000 多平米的橙红瓦板
    let rk: PalKey = o.w * o.d > 1200 && o.kind !== 'museum' ? 'concrete' : roofKey[o.kind];
    // 小区的房子不全是一个灰白平顶（一眼看完、画面发灰）：棕榈泉老街区一半是西班牙复兴式的红瓦，
    // 中世纪现代的平顶有白的、灰的，封檐板刷一道颜色（青、黄、珊瑚红）
    let fascia: PalKey | null = null;
    if (o.kind === 'house') {
      const h = rnd();
      rk = h < 0.5 ? 'roofTile' : h < 0.8 ? 'cap' : 'concrete';
      if (rk !== 'roofTile')
        fascia = (['clothTeal', 'flowerYellow', 'clothRed', 'clothTeal'] as const)[Math.floor(rnd() * 4)];
    }
    put(reg, rk, rbox(o.w + over, 0.35, o.d + over, o.x, o.h, o.z, rot));
    if (fascia) put(reg, fascia, rbox(o.w + over + 0.08, 0.22, o.d + over + 0.08, o.x, o.h - 0.02, o.z, rot));
    if (o.kind === 'shop') {
      // 遮阳篷：挂在朝路的那面（原来随机朝前朝后，一半挂在楼背后），往外斜；伸出多少按墙到路边的空当（不伸到车道上方）
      const face = faceOf(o);
      // 那面墙的中点（世界坐标）
      const lx = face[0] * (o.w / 2);
      const lz = face[1] * (o.d / 2);
      const gap = roadGap(o.x + lx * Math.cos(rot) + lz * Math.sin(rot), o.z - lx * Math.sin(rot) + lz * Math.cos(rot));
      const depth = Math.min(1.9, gap - 0.9);
      const key = AWNING[Math.floor(rnd() * AWNING.length)];
      if (depth >= 0.9) {
        const aw = new THREE.BoxGeometry(faceLen(o, face) * 0.8, 0.14, depth)
          .translate(0, 0, depth / 2)
          .rotateX(0.28)
          .translate(0, 2.9, 0);
        put(reg, key, onFace(o, face, aw));
      }
    }
    if (o.id === 'cityhall') {
      // 钟楼：塔身 + 一圈檐 + 四角墩子围着的钟室（深色） + 檐 + 四坡尖顶；朝南一面挂钟（原来是一根 6×22 的方柱 + 一块板）
      const cx = o.x + o.w / 2 - 4;
      const cz = o.z - o.d / 2 + 4;
      // 不投影：22 米的方塔在市政厅屋顶上投一整块方的黑影（"大块硬边的影子"）
      putThin(reg, 'stucco', rbox(6, 17, 6, cx, 0, cz));
      putThin(reg, 'stucco', rbox(6.8, 0.5, 6.8, cx, 17, cz));
      putThin(reg, 'ironwork', rbox(4.6, 4, 4.6, cx, 17.5, cz));
      for (const sx of [-1, 1])
        for (const sz of [-1, 1]) putThin(reg, 'stucco', rbox(1.3, 4, 1.3, cx + sx * 2.35, 17.5, cz + sz * 2.35));
      putThin(reg, 'stucco', rbox(7.2, 0.6, 7.2, cx, 21.5, cz));
      putThin(
        reg,
        'roofTile',
        new THREE.ConeGeometry(5.3, 4.6, 4, 1).rotateY(Math.PI / 4).translate(cx, 22.1 + 2.3, cz),
      );
      putThin(
        reg,
        'clothWhite',
        new THREE.CylinderGeometry(1.7, 1.7, 0.2, 18).rotateX(Math.PI / 2).translate(cx, 13.5, cz + 3.08),
      );
      putThin(reg, 'ironwork', new THREE.BoxGeometry(0.2, 1.2, 0.08).translate(cx, 14.0, cz + 3.22));
      putThin(reg, 'ironwork', new THREE.BoxGeometry(0.9, 0.2, 0.08).translate(cx + 0.4, 13.5, cz + 3.22));
    }
    // 加油站的雨棚板（柱子、加油岛、红边在 detail/town.ts）
    // 不投影：4.5 米高的 16 × 10 米板在前场投一整块方的黑影；薄的板（四根柱 + 红边在 town.ts）
    if (o.kind === 'gas') putThin(reg, 'metal', rbox(16, 0.4, 10, o.x, 4.55, o.z + 14, rot));
  };
  {
    const rnd = ctx.rng('valley:bldg');
    for (const o of ALL_SOLIDS) putBldg(o, regionOf(o.x, o.z), rnd);
  }
  // 酒店扩张地：空地立桩子 + 牌子；酒店白模单独一组，调试开关切
  const hotelPlot = new THREE.Group();
  const hotelBldg = new THREE.Group();
  {
    const P = HOTEL_PLOT;
    const stakes: THREE.BufferGeometry[] = [];
    // 桩子不立在路上（酒店地块的车道从这块地中间穿过）
    const stake = (x: number, z: number) => {
      if (roadGap(x, z) > 0.6) stakes.push(box(0.15, 0.8, 0.15, x, 0, z));
    };
    for (let x = P.x0; x <= P.x1; x += 8) {
      stake(x, P.z0);
      stake(x, P.z1);
    }
    for (let z = P.z0 + 8; z < P.z1; z += 8) {
      stake(P.x0, z);
      stake(P.x1, z);
    }
    const st = new THREE.Mesh(mergeGeometries(stakes.map(prep)), mat('toolOrange', false));
    st.name = 'valley:hotelPlot:stakes';
    const sign = new THREE.Mesh(
      mergeGeometries([
        prep(box(4, 2.2, 0.2, 0, 1, 0)),
        prep(box(0.2, 1.2, 0.2, -1.5, 0, 0)),
        prep(box(0.2, 1.2, 0.2, 1.5, 0, 0)),
      ]),
      mat('signBoard', false),
    );
    sign.name = 'valley:hotelPlot:sign';
    // 牌子立在地块南沿外、车道北边（原来在 (174, 17)，正压在酒店地块的车道上）
    sign.position.set(214, 0, P.z0 - 2);
    hotelPlot.add(st, sign);
    for (const o of HOTEL_BLDGS) {
      const m = new THREE.Mesh(prep(rbox(o.w, o.h, o.d, o.x, 0, o.z, o.rot)), mat('stucco', false));
      const r = new THREE.Mesh(prep(rbox(o.w + 1, 0.6, o.d + 1, o.x, o.h, o.z, o.rot)), mat('roofTile', false));
      m.castShadow = r.castShadow = true;
      m.receiveShadow = r.receiveShadow = true;
      m.name = `valley:hotel:${o.id}`;
      r.name = `valley:hotel:${o.id}:roof`;
      hotelBldg.add(m, r);
    }
    // 泳池
    const pool = new THREE.Mesh(prep(box(20, 0.05, 10, 196, 0.01, 72)), mat('water', false));
    pool.name = 'valley:hotel:pool';
    hotelBldg.add(pool);
    hotelBldg.visible = false;
    hotelPlot.name = 'valley:hotelPlot';
    hotelBldg.name = 'valley:hotelBldg';
    root.add(hotelPlot, hotelBldg);
  }
  // 观景台：石板圆台 + 一圈木栏（柱 + 扶手） + 一条长椅
  put(
    'mountain',
    'flagstone',
    new THREE.CylinderGeometry(LOOKOUT.r, LOOKOUT.r, 0.4, 24).translate(LOOKOUT.x, LOOKOUT.y - 0.15, LOOKOUT.z),
  );
  {
    const N = 16;
    const R = LOOKOUT.r - 0.4;
    const trail = ROADS.find((q) => q.id === 'museum_trail')?.pts ?? [];
    for (let k = 0; k < N; k++) {
      const a = (k / N) * Math.PI * 2;
      const b = ((k + 1) / N) * Math.PI * 2;
      const ax = LOOKOUT.x + Math.cos(a) * R;
      const az = LOOKOUT.z + Math.sin(a) * R;
      const bx = LOOKOUT.x + Math.cos(b) * R;
      const bz = LOOKOUT.z + Math.sin(b) * R;
      // 步道进来的口子不围
      if (distToLine(trail, (ax + bx) / 2, (az + bz) / 2) < 2.5) continue;
      put('mountain', 'wood', box(0.22, 1.1, 0.22, ax, LOOKOUT.y, az));
      put('mountain', 'wood', box(0.22, 1.1, 0.22, bx, LOOKOUT.y, bz));
      putThin(
        'mountain',
        'wood',
        rbox(
          0.16,
          0.14,
          Math.hypot(bx - ax, bz - az),
          (ax + bx) / 2,
          LOOKOUT.y + 0.95,
          (az + bz) / 2,
          Math.atan2(bx - ax, bz - az),
        ),
      );
    }
    // 长椅：座板 + 两条腿 + 靠背
    const bx = LOOKOUT.x;
    const bz = LOOKOUT.z + 3;
    put('mountain', 'wood', box(2.4, 0.12, 0.55, bx, LOOKOUT.y + 0.42, bz));
    put('mountain', 'wood', box(2.4, 0.4, 0.1, bx, LOOKOUT.y + 0.6, bz - 0.28));
    for (const s of [-1, 1]) put('mountain', 'woodWeathered', box(0.14, 0.42, 0.5, bx + s * 1.0, LOOKOUT.y, bz));
  }
  // 瀑布：峡谷尽头的山壁上一条竖的水 + 底下一汪
  // 瀑布的水柱和后面的山壁在 detail/south.ts（这里原来朝东的一片竖水，镜头朝北只看得到一条边）
  put('wash', 'water', new THREE.CircleGeometry(7, 20).rotateX(-Math.PI / 2).translate(FALLS[0], 0.03, FALLS[1]));

  // ── 事的标记：一根杆子（底座、顶上一颗球） + 一面按种类上色的旗 ──
  const POI_KEY: Record<PoiKind, PalKey> = {
    errand: 'clothBlue',
    person: 'clothRed',
    event: 'seat',
    find: 'flowerYellow',
    view: 'clothPurple',
  };
  const poiTops = new Map<string, THREE.Vector3>();
  const flagAt: V2[] = [];
  {
    /** 旗子能不能立在这：不在路面上（含路肩 1.4 米）、不在楼里、不在瀑布潭里、不和别的旗挤在一起 */
    const free = (x: number, z: number) =>
      roadGap(x, z) > 1.4 &&
      trailGap(x, z) > 0.4 &&
      !ALL_SOLIDS.some((o) => Math.abs(o.x - x) < o.w / 2 + 1.2 && Math.abs(o.z - z) < o.d / 2 + 1.2) &&
      Math.hypot(x - FALLS[0], z - FALLS[1]) > 8.5 &&
      !flagAt.some(([fx, fz]) => Math.hypot(fx - x, fz - z) < 3);
    for (const p of POIS) {
      const hill = p.id === 'p_lookout' || p.id === 'p_sunrise';
      // 有楼的就立在楼前（朝南一点），没楼的就在原地
      const b = BUILDINGS.find((o) => Math.hypot(o.x - p.x, o.z - p.z) < 1);
      let x = b ? b.x : p.x;
      let z = b ? b.z + b.d / 2 + 3 : p.z + 3;
      if (p.id === 'p_sunrise') z -= 4;
      if (!hill && !free(x, z)) {
        // 原地站不住（压在路上：好几个事就在路的尽头 / 拐点上）→ 就近找一块空地
        search: for (let r = 1; r <= 16; r += 1)
          for (let k = 0; k < 16; k++) {
            const a = (k / 16) * Math.PI * 2 + Math.PI / 2;
            const qx = x + Math.cos(a) * r;
            const qz = z + Math.sin(a) * r;
            if (inPoly(FLOOR, qx, qz) && free(qx, qz)) {
              x = qx;
              z = qz;
              break search;
            }
          }
      }
      flagAt.push([x, z]);
      const y = hill ? LOOKOUT.y : inPoly(FLOOR, x, z) ? 0 : Math.max(0, mountainY(x, z));
      const reg = hill ? 'mountain' : regionOf(x, z);
      put(reg, 'concrete', new THREE.CylinderGeometry(0.32, 0.4, 0.2, 8).translate(x, y + 0.1, z));
      put(reg, 'metal', box(0.14, 3.4, 0.14, x, y, z));
      put(reg, 'metal', new THREE.IcosahedronGeometry(0.16, 0).translate(x, y + 3.5, z));
      put(reg, POI_KEY[p.kind], box(1.3, 0.8, 0.08, x + 0.72, y + 2.45, z));
      poiTops.set(p.id, new THREE.Vector3(x, y + 3.6, z));
    }
  }

  // ── 各区域的细节（src/valley/detail/：每个文件一片，往同一个桶里放） ──
  const blocked: Shape[] = [];
  const clears: { x0: number; x1: number; z0: number; z1: number }[] = [];
  const inClear = (x: number, z: number, pad = 0) =>
    clears.some((r) => x > r.x0 - pad && x < r.x1 + pad && z > r.z0 - pad && z < r.z1 + pad);
  const pendingInst: { g: THREE.BufferGeometry; key: PalKey; items: InstItem[]; cast: boolean }[] = [];
  const dctx: DetailCtx = {
    put,
    regionOf,
    rng: ctx.rng,
    block: (sh) => blocked.push(sh),
    clear: (r) => clears.push(r),
    instance: (g, key, items, cast = true) => pendingInst.push({ g: prep(g), key, items, cast }),
    root,
    mat: (key) => mat(key, false),
    putFlat,
  };
  for (const d of details) d(dctx);
  const nearBlocked = (x: number, z: number, pad: number) => blocked.some((sh) => shapeDist(sh, x, z) < pad);
  const nearFlag = (x: number, z: number, pad: number) => flagAt.some(([fx, fz]) => Math.hypot(fx - x, fz - z) < pad);

  // ── 路头：死胡同（小街、小巷的尽头不接别的路）铺一个掉头的圆；接到别的路上的就补一块和路一样宽的圆 ──
  for (const r of DRIVEABLE) {
    for (const p of [r.pts[0], r.pts[r.pts.length - 1]]) {
      const joined = roadGap(p[0], p[1], r) < 0.5;
      // 出了平地的路头（公路出山口、东西向的路到东边山脚）：平切，路像是翻过坡去了，不画圆头
      if (!joined && distToLine([...FLOOR, FLOOR[0]], p[0], p[1]) < 10) continue;
      const R = r.w / 2 + 3.5;
      const bulb =
        !joined &&
        (r.kind === 'street' || r.kind === 'lane') &&
        // 酒店地块的车道：酒店还没盖，空地里一个掉头圆像一根棒棒糖
        r.id !== 'hotel_lane' &&
        !ALL_SOLIDS.some((o) => Math.hypot(o.x - p[0], o.z - p[1]) < Math.hypot(o.w, o.d) / 2 + R + 0.5) &&
        !nearBlocked(p[0], p[1], R + 0.5) &&
        !inClear(p[0], p[1], R) &&
        !nearFlag(p[0], p[1], R + 0.5);
      putFlat('asphalt', disc(bulb ? R : r.w / 2, bulb ? 28 : r.w > 9 ? 20 : 14, p[0], 0.03, p[1]));
    }
  }

  // ── 河床里的石头：成堆（河床拐弯的外侧、沙洲上一堆一堆），中间大片空着；实例化、按块剔除。
  // 不撒在路上、步道上、桥边、细节铺好的地上。原来 360 块均匀撒满整条河床、合成一个一直在画的网格（约 3.6 万三角形）
  const washRocks: InstItem[] = [];
  {
    const rnd = ctx.rng('valley:wash');
    for (let c = 0; c < 26; c++) {
      const k = (c + 0.3 + rnd() * 0.4) * ((WASH.pts.length - 1) / 26);
      const s = Math.floor(k);
      const t = k - s;
      const [ax, az] = WASH.pts[s];
      const [bx, bz] = WASH.pts[s + 1];
      const L = Math.hypot(bx - ax, bz - az);
      const half = WASH.half[s] + (WASH.half[s + 1] - WASH.half[s]) * t;
      // 堆在河床的一边（外侧沙洲），不在中线上
      const h = half * (rnd() < 0.5 ? -1 : 1) * (0.35 + rnd() * 0.45);
      const cx = ax + (bx - ax) * t - ((bz - az) / L) * h;
      const cz = az + (bz - az) * t + ((bx - ax) / L) * h;
      const n = 3 + Math.floor(rnd() * 5);
      for (let q = 0; q < n; q++) {
        const a = rnd() * Math.PI * 2;
        const d = rnd() * 3.5;
        const x = cx + Math.cos(a) * d * 1.4;
        const z = cz + Math.sin(a) * d * 0.8;
        const r = q === 0 ? 1.1 + rnd() * 0.6 : 0.35 + rnd() * rnd() * 0.9;
        const rot = rnd() * 6;
        if (washDist(x, z) > -1) continue;
        if (roadGap(x, z) < r + 2 || trailGap(x, z) < r + 0.6) continue;
        if (inClear(x, z, r + 0.5) || nearBlocked(x, z, r + 0.5) || nearFlag(x, z, r + 1.5)) continue;
        washRocks.push({ x, z, s: r, reg: regionOf(x, z), rot });
      }
    }
    pendingInst.push({
      g: prep(new THREE.DodecahedronGeometry(1, 0).scale(1, 0.6, 1).translate(0, 0.25, 0)),
      key: 'rock',
      items: washRocks,
      cast: true,
    });
  }

  // ── 合并 ──
  for (const [k, list] of bucket) {
    const [region, key, thin] = k.split('|') as [string, PalKey, string | undefined];
    const g = mergeGeometries(list);
    for (const x of list) x.dispose();
    if (!g) continue;
    const m = new THREE.Mesh(g, mat(key, locked.has(region)));
    m.name = `valley:${region}:${key}${thin ? ':thin' : ''}`;
    m.receiveShadow = true;
    // 平的东西不投影（地面、路、绿地、河床），细长的不投影（护栏），立着的投影
    m.castShadow = !thin && !NO_CAST.has(key);
    root.add(m);
    own(region, m, key);
  }

  // ── 棕榈（大道两边一排、椰枣园一格一格、绿洲一丛）、灌木：实例化，按区域一组 ──
  /** 离楼多远才种（树冠半径约 3.4 米：比冠低的楼让开 2.5 米，高过冠底的让开 4.5 米，免得冠插进屋顶、遮阳篷） */
  const clearOfBldg = (x: number, z: number) =>
    !ALL_SOLIDS.some((o) => {
      const pad = o.h > 6 ? 4.5 : 2.5;
      return Math.abs(o.x - x) < o.w / 2 + pad && Math.abs(o.z - z) < o.d / 2 + pad;
    });
  const avenuePalms: InstItem[] = [];
  const grovePalms: InstItem[] = [];
  {
    const rnd = ctx.rng('valley:palms');
    for (const r of ROADS) {
      if (r.kind !== 'avenue') continue;
      for (const [, p, t] of along(r.pts, 18)) {
        for (const side of [-1, 1]) {
          // 沿路抖 ±2.5 米（不是尺子量的一排）
          const j = (rnd() - 0.5) * 5;
          const x = p[0] + t[0] * j - t[1] * side * (r.w / 2 + 2.2);
          const z = p[1] + t[1] * j + t[0] * side * (r.w / 2 + 2.2);
          const s = 0.9 + rnd() * 0.35;
          const rot = rnd() * 6.28;
          if (!inPoly(FLOOR, x, z) || inClubBox(x, z)) continue;
          if (roadGap(x, z, r) < 1.5 || distToLine(r.pts, x, z) < r.w / 2 + 1.2) continue;
          if (washDist(x, z) < 2) continue;
          // 不站在楼顶上、细节铺好的地上、旗子跟前、细节的挡路形状里
          if (inClear(x, z, 1) || !clearOfBldg(x, z)) continue;
          if (nearFlag(x, z, 3) || nearBlocked(x, z, 0.8)) continue;
          avenuePalms.push({ x, z, s, reg: regionOf(x, z), rot });
        }
      }
    }
    for (const q of GREENS) {
      if (q.kind !== 'grove') continue;
      const xs = q.poly.map((v) => v[0]);
      const zs = q.poly.map((v) => v[1]);
      for (let x = Math.min(...xs) + 6; x < Math.max(...xs); x += 12)
        for (let z = Math.min(...zs) + 6; z < Math.max(...zs); z += 12) {
          const s = 0.7 + rnd() * 0.2;
          const rot = rnd() * 6.28;
          if (!inPoly(q.poly, x, z)) continue;
          // 路从园子里穿过（球拍俱乐部路的东头）：路上和路边 1.5 米不种
          if (roadGap(x, z) < 1.5 || inClear(x, z, 1) || !clearOfBldg(x, z) || nearBlocked(x, z, 0.8)) continue;
          grovePalms.push({ x, z, s, reg: regionOf(x, z), rot });
        }
    }
    // 印第安峡谷绿洲：野生的扇叶棕榈一丛
    for (let k = 0; k < 14; k++) {
      const a = rnd() * Math.PI * 2;
      // 离丛心的距离也是位置：跟着整体缩放收（峡谷口只剩 20～45 米宽）
      const d = (4 + rnd() * 14) * SCALE;
      const s = 1 + rnd() * 0.4;
      const x = OASIS[0] + Math.cos(a) * d;
      const z = OASIS[1] + Math.sin(a) * d * 0.6;
      if (!inPoly(FLOOR, x, z) || inClear(x, z, 0.5) || nearFlag(x, z, 3) || nearBlocked(x, z, 0.5)) continue;
      if (trailGap(x, z) < 0.5) continue;
      avenuePalms.push({ x, z, s, reg: 'south', rot: rnd() * 6.28 });
    }
  }
  const instance = (geo: THREE.BufferGeometry, key: PalKey, items: InstItem[], cast: boolean) => {
    // 按（区域, 160 米一块）分：视锥外的块整块不画（实例化网格按整体包围球剔除）
    const regs = new Map<string, typeof items>();
    for (const it of items) {
      const k = `${it.reg}|${Math.floor(it.x / 160)}|${Math.floor(it.z / 160)}`;
      const l = regs.get(k) ?? [];
      l.push(it);
      regs.set(k, l);
    }
    const M = new THREE.Matrix4();
    const Q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    for (const [k, list] of regs) {
      const reg = k.split('|')[0];
      const im = new THREE.InstancedMesh(geo, mat(key, locked.has(reg)), list.length);
      list.forEach((it, i) => {
        Q.setFromAxisAngle(up, it.rot ?? 0);
        M.compose(new THREE.Vector3(it.x, it.y ?? 0, it.z), Q, new THREE.Vector3(it.s, it.s, it.s));
        im.setMatrixAt(i, M);
      });
      im.castShadow = cast;
      im.receiveShadow = true;
      im.computeBoundingSphere();
      im.name = `valley:${reg}:${key}:inst`;
      root.add(im);
      own(reg, im, key);
    }
  };
  {
    // 大道、绿洲：加州蒲葵（高、直，冠下一圈枯叶裙）；椰枣园：矮一点、没有裙、叶子更长
    const trunk = prep(new THREE.CylinderGeometry(0.24, 0.36, 8, 6).translate(0, 4, 0));
    const skirt = prep(new THREE.CylinderGeometry(0.75, 0.95, 2.4, 8).translate(0, 6.95, 0));
    // 树干不投影：低太阳下 8 米的干投出 30 多米又直又黑的长带（椰枣园里一排排），冠和裙的影子留着
    instance(trunk, 'palmTrunk', avenuePalms, false);
    instance(skirt, 'palmSkirt', avenuePalms, true);
    instance(palmCrownGeo(10, 3.4, 8.15, 3), 'palm', avenuePalms, true);
    instance(trunk, 'palmTrunk', grovePalms, false);
    instance(palmCrownGeo(9, 3.8, 8.1, 7), 'palm', grovePalms, true);
  }
  {
    // 沙漠的地被：灌木（鼠尾草绿、橄榄绿）、干草丛、小石头，按 4 米的抖动格子撒（手机一屏 17×38 米里十来样）
    const rnd = ctx.rng('valley:scrub');
    const solids = [...ALL_SOLIDS, ...HOTEL_BLDGS];
    const grid = new Map<string, Bldg[]>();
    for (const o of solids) {
      const k = `${Math.floor(o.x / 50)}|${Math.floor(o.z / 50)}`;
      grid.set(k, [...(grid.get(k) ?? []), o]);
    }
    const nearBldg = (x: number, z: number) => {
      for (let i = -1; i <= 1; i++)
        for (let j = -1; j <= 1; j++)
          for (const o of grid.get(`${Math.floor(x / 50) + i}|${Math.floor(z / 50) + j}`) ?? [])
            if (Math.abs(o.x - x) < o.w / 2 + 2.5 && Math.abs(o.z - z) < o.d / 2 + 2.5) return true;
      return false;
    };
    const bush: InstItem[] = [];
    const olive: InstItem[] = [];
    const tuft: InstItem[] = [];
    const stone: InstItem[] = [];
    /** 每种的半径（缩放 1 时，米）：离路要按它让开，不然大丛的边伸进路面 */
    const RAD = { bush: 0.7, olive: 1.08, tuft: 0.45, stone: 0.35 };
    const C = 4.2;
    for (let x = HF.x0; x < HF.x1; x += C)
      for (let z = HF.z0; z < HF.z1; z += C) {
        const px = x + rnd() * C;
        const pz = z + rnd() * C;
        const r = rnd();
        // 稀疏：有的地方成片、有的地方空（噪声）
        const dens = 0.18 + 0.5 * (Math.sin(px * 0.021 + Math.cos(pz * 0.017) * 2) * 0.5 + 0.5);
        if (r > dens) continue;
        if (!inPoly(FLOOR, px, pz) || inClubBox(px, pz)) continue;
        if (washDist(px, pz) < 0.5) {
          if (washDist(px, pz) > -4) continue;
        }
        if (GREENS.some((q) => inPoly(q.poly, px, pz))) continue;
        const s = 0.5 + rnd() * 0.9;
        const rot = rnd() * 6;
        const t = rnd();
        const kind: keyof typeof RAD =
          washDist(px, pz) < 0 ? 'stone' : t < 0.38 ? 'bush' : t < 0.58 ? 'olive' : t < 0.88 ? 'tuft' : 'stone';
        const rad = RAD[kind] * s;
        if (roadGap(px, pz) < rad + 1 || trailGap(px, pz) < rad + 0.4) continue;
        if (nearBldg(px, pz)) continue;
        if (inClear(px, pz, 0.5 + rad) || nearBlocked(px, pz, rad + 0.3) || nearFlag(px, pz, rad + 1)) continue;
        const it: InstItem = { x: px, z: pz, s, reg: regionOf(px, pz), rot };
        ({ bush, olive, tuft, stone })[kind].push(it);
      }
    instance(prep(new THREE.IcosahedronGeometry(0.7, 0).scale(1, 0.7, 1).translate(0, 0.3, 0)), 'sage', bush, false);
    instance(
      prep(new THREE.IcosahedronGeometry(0.9, 0).scale(1.2, 0.8, 1).translate(0, 0.45, 0)),
      'olive',
      olive,
      false,
    );
    instance(prep(new THREE.ConeGeometry(0.45, 0.6, 5).translate(0, 0.3, 0)), 'dryTuft', tuft, false);
    instance(
      prep(new THREE.DodecahedronGeometry(0.35, 0).scale(1, 0.55, 1).translate(0, 0.1, 0)),
      'rock',
      stone,
      false,
    );
  }

  for (const it of pendingInst) instance(it.g, it.key, it.items, it.cast);

  // ── 风车：山口外一大片（塔 + 机舱 + 轮毂 + 三片尖叶，叶子转）；高矮不一 ──
  const rotors: THREE.Object3D[] = [];
  {
    const tower = prep(new THREE.CylinderGeometry(0.55, 1.05, 34, 8).translate(0, 17, 0));
    const nacelle = mergeGeometries([
      prep(new THREE.BoxGeometry(1.6, 1.6, 4.2).translate(0, 34.6, -0.6)),
      prep(new THREE.ConeGeometry(0.7, 1.2, 8).rotateX(Math.PI / 2).translate(0, 34.6, 2.0)),
    ]);
    const blades = mergeGeometries(
      [0, 1, 2].map((k) =>
        prep(
          new THREE.CylinderGeometry(0.12, 0.55, 15, 4)
            .scale(1, 1, 0.35)
            .translate(0, 7.8, 0)
            .rotateZ((k / 3) * Math.PI * 2),
        ),
      ),
    );
    const tm = mat('concrete', false);
    const bm = mat('canvas', false);
    windmills().forEach(([x, z], i) => {
      const y = Math.max(0, mountainY(x, z));
      const s = 0.85 + (((i * 37) % 11) / 11) * 0.3;
      const t = new THREE.Mesh(tower, tm);
      t.position.set(x, y, z);
      t.scale.setScalar(s);
      const n = new THREE.Mesh(nacelle, tm);
      n.position.set(x, y, z);
      n.scale.setScalar(s);
      const r = new THREE.Mesh(blades, bm);
      r.position.set(x, y + 34.6 * s, z + 2.2 * s);
      r.scale.setScalar(s);
      r.rotation.z = (x * 0.13) % 6;
      t.name = n.name = r.name = 'valley:windmill';
      rotors.push(r);
      root.add(t, n, r);
    });
  }

  // ── 接口 ──
  const setLocked = (id: string, on: boolean) => {
    for (const { obj, key } of byRegion.get(id) ?? []) obj.material = mat(key as PalKey, on);
  };
  return {
    root,
    setLocked,
    setHotel(on) {
      hotelPlot.visible = !on;
      hotelBldg.visible = on;
    },
    update(dt) {
      for (const r of rotors) r.rotation.z -= dt * 0.9;
    },
    poiTops,
    blocked,
  };
}

/** 楼的脚印（导航挡路用：转过的矩形 → 多边形） */
export function bldgPoly(o: Bldg, pad = 0.2): V2[] {
  const c = Math.cos(o.rot ?? 0);
  const s = Math.sin(o.rot ?? 0);
  const hw = o.w / 2 + pad;
  const hd = o.d / 2 + pad;
  return [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ].map(([x, z]) => [o.x + x * c + z * s, o.z - x * s + z * c] as const);
}

export { box, polyTop, rbox, ribbon };
export const ALL_REGION_IDS = REGIONS.map((r) => r.id);

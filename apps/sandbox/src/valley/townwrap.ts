// 小镇的比例（townscale.ts 的规矩）落到细节上：包一层 DetailCtx，细节文件（detail/*.ts、sites/*.ts）照缩之前的尺寸写
// （读 layout 的 BUILDINGS_RAW、SITES_RAW、housesRaw()），放进来的几何、实例、资产、挡路的形状、占地在这里按位置变换：
// - 贴着一栋缩过的楼（三栋办事楼的 FRAMES，别的楼、小区房子的脚印外扩 PAD 米）：跟着这栋楼的相似变换走
//   （轴 = 门口 / 朝街那一面的正中，位置、大小、y 都乘 k；平铺的只缩 xz）。比这栋楼的框还大的不算贴着（整条街的人行道）。
// - 别处的小件（立着、宽深都 < LONG_M）：缩 TOWN_K。细节文件一件东西是几块几何分开 put 的（长椅 = 座 + 腿、车 = 车身 + 车厢），
//   各绕各的中心缩会散架：先攒着，最后（flush）把挨着的几块（包围盒相距 < JOIN 米）归成一件，整件绕它的底面中心缩。
// - 别处的长条（围墙、遮阳棚、栏杆）：只压低（y × TOWN_K），长度不缩。平铺的（< FLAT_M 高）和俱乐部、店内：不动。
import * as THREE from 'three';
import type { Shape } from '../clubsite/play';
import type { DetailCtx, InstItem } from './build';
import { bldgFrames } from './layout';
import { FLAT_M, FRAMES, keepScale, LONG_M, TOWN_K } from './townscale';

/** 楼的脚印往外扩多少还算"贴着楼"（遮阳篷、门廊、招牌、墙根的花盆） */
const PAD = 2;

/** 一个相似变换：轴、倍数，能管多大的东西（世界包围盒的宽深上限），哪些点归它 */
interface WF {
  px: number;
  pz: number;
  k: number;
  maxW: number;
  maxD: number;
  has(x: number, z: number): boolean;
}
let FRAMES_W: { site: WF[]; grid: Map<string, WF[]> } | null = null;
const CELL = 40;
function frames() {
  if (FRAMES_W) return FRAMES_W;
  const site: WF[] = FRAMES.map((f) => ({
    px: f.px,
    pz: f.pz,
    k: TOWN_K,
    maxW: f.zone.x1 - f.zone.x0 + 1,
    maxD: f.zone.z1 - f.zone.z0 + 1,
    has: (x, z) => x >= f.zone.x0 && x <= f.zone.x1 && z >= f.zone.z0 && z <= f.zone.z1,
  }));
  const grid = new Map<string, WF[]>();
  for (const b of bldgFrames()) {
    const hw = b.hw + PAD;
    const hd = b.hd + PAD;
    // 转过的矩形的世界包围盒（半宽、半深）
    const ex = Math.abs(b.c) * hw + Math.abs(b.s) * hd;
    const ez = Math.abs(b.s) * hw + Math.abs(b.c) * hd;
    const wf: WF = {
      px: b.px,
      pz: b.pz,
      k: b.k,
      maxW: 2 * ex + 1,
      maxD: 2 * ez + 1,
      has: (x, z) => {
        const dx = x - b.cx;
        const dz = z - b.cz;
        return Math.abs(dx * b.c - dz * b.s) <= hw && Math.abs(dx * b.s + dz * b.c) <= hd;
      },
    };
    for (let gx = Math.floor((b.cx - ex) / CELL); gx <= Math.floor((b.cx + ex) / CELL); gx++)
      for (let gz = Math.floor((b.cz - ez) / CELL); gz <= Math.floor((b.cz + ez) / CELL); gz++) {
        const key = `${gx}|${gz}`;
        const l = grid.get(key) ?? [];
        l.push(wf);
        grid.set(key, l);
      }
  }
  FRAMES_W = { site, grid };
  return FRAMES_W;
}
/** (x, z) 归哪个变换；w d = 东西的世界包围盒宽深（比框大的不归） */
function frameFor(x: number, z: number, w: number, d: number): WF | undefined {
  const { site, grid } = frames();
  const fit = (f: WF) => f.has(x, z) && w <= f.maxW && d <= f.maxD;
  return site.find(fit) ?? grid.get(`${Math.floor(x / CELL)}|${Math.floor(z / CELL)}`)?.find(fit);
}
const fmapW = (f: WF, x: number, z: number): [number, number] => [f.px + (x - f.px) * f.k, f.pz + (z - f.pz) * f.k];

const K = TOWN_K;
type Mode = { kind: 'frame'; f: WF } | { kind: 'small'; x: number; z: number } | { kind: 'long' } | { kind: 'keep' };

/** 一块包围盒（世界坐标）该怎么缩 */
function modeOf(bb: THREE.Box3, flat = false): Mode {
  const cx = (bb.min.x + bb.max.x) / 2;
  const cz = (bb.min.z + bb.max.z) / 2;
  if (keepScale(cx, cz)) return { kind: 'keep' };
  const w = bb.max.x - bb.min.x;
  const d = bb.max.z - bb.min.z;
  const f = frameFor(cx, cz, w, d);
  if (f) return { kind: 'frame', f };
  if (flat || bb.max.y - bb.min.y < FLAT_M) return { kind: 'keep' };
  // 悬空的（招牌、灯头）也按包围盒的底面中心当落地点
  if (w < LONG_M && d < LONG_M) return { kind: 'small', x: cx, z: cz };
  return { kind: 'long' };
}

const M = new THREE.Matrix4();
const T1 = new THREE.Matrix4();
const T2 = new THREE.Matrix4();
const SC = new THREE.Matrix4();
/** 绕 (px, 0, pz) 缩：xz 乘 kx，y 乘 ky */
function about(px: number, pz: number, kx: number, ky: number): THREE.Matrix4 {
  T1.makeTranslation(-px, 0, -pz);
  SC.makeScale(kx, ky, kx);
  T2.makeTranslation(px, 0, pz);
  return M.copy(T2).multiply(SC).multiply(T1);
}

function geoMatrix(g: THREE.BufferGeometry, flat: boolean): THREE.Matrix4 | null {
  g.computeBoundingBox();
  const bb = g.boundingBox;
  if (!bb || bb.isEmpty()) return null;
  const m = modeOf(bb, flat);
  if (m.kind === 'frame') return about(m.f.px, m.f.pz, m.f.k, flat ? 1 : m.f.k);
  if (m.kind === 'small') return about(m.x, m.z, K, K);
  if (m.kind === 'long') return about(0, 0, 1, K);
  return null;
}

function shapeBox(s: Shape): THREE.Box3 {
  const b = new THREE.Box3();
  if ('poly' in s) for (const [x, z] of s.poly) b.expandByPoint(new THREE.Vector3(x, 0, z));
  else if ('a' in s) {
    b.expandByPoint(new THREE.Vector3(Math.min(s.a[0], s.b[0]) - s.r, 0, Math.min(s.a[1], s.b[1]) - s.r));
    b.expandByPoint(new THREE.Vector3(Math.max(s.a[0], s.b[0]) + s.r, 0, Math.max(s.a[1], s.b[1]) + s.r));
  } else if ('r' in s) {
    b.expandByPoint(new THREE.Vector3(s.x - s.r, 0, s.z - s.r));
    b.expandByPoint(new THREE.Vector3(s.x + s.r, 0, s.z + s.r));
  } else {
    b.expandByPoint(new THREE.Vector3(s.x0, 0, s.z0));
    b.expandByPoint(new THREE.Vector3(s.x1, 0, s.z1));
  }
  b.max.y = 1; // 挡路的形状都当"立着的"看
  return b;
}
/** 挡路的形状：贴着楼的跟楼走，别处的小件绕中心缩，长条不动 */
function mapShape(s: Shape): Shape {
  const m = modeOf(shapeBox(s));
  let fx: (x: number, z: number) => [number, number];
  let kr = 1;
  if (m.kind === 'frame') {
    const f = m.f;
    fx = (x, z) => fmapW(f, x, z);
    kr = f.k;
  } else if (m.kind === 'small') {
    const { x: cx, z: cz } = m;
    fx = (x, z) => [cx + (x - cx) * K, cz + (z - cz) * K];
    kr = K;
  } else return s;
  if ('poly' in s) return { ...s, poly: s.poly.map(([x, z]) => fx(x, z)) };
  if ('a' in s) return { ...s, a: fx(s.a[0], s.a[1]), b: fx(s.b[0], s.b[1]), r: s.r * kr };
  if ('r' in s) {
    const [x, z] = fx(s.x, s.z);
    return { ...s, x, z, r: s.r * kr };
  }
  const [x0, z0] = fx(s.x0, s.z0);
  const [x1, z1] = fx(s.x1, s.z1);
  return { ...s, x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1) };
}

/** 两块几何的包围盒相距多近算一件东西的部件 */
const JOIN = 0.12;
/** 归成一件以后比这个还大（一排挨着的桌椅、一整圈栏杆）：不缩长宽，只压低 */
const GROUP_MAX = 8;
interface Piece {
  bb: THREE.Box3;
  g: THREE.BufferGeometry;
  emit: () => void;
}
/** 攒着的小件归成一件一件（并查集 + 2 米一格的网格）再缩 */
function flushPieces(list: Piece[]): void {
  const parent = list.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const C = 2;
  const grid = new Map<string, number[]>();
  list.forEach((p, i) => {
    const near: number[] = [];
    for (let gx = Math.floor((p.bb.min.x - JOIN) / C); gx <= Math.floor((p.bb.max.x + JOIN) / C); gx++)
      for (let gz = Math.floor((p.bb.min.z - JOIN) / C); gz <= Math.floor((p.bb.max.z + JOIN) / C); gz++) {
        const key = `${gx}|${gz}`;
        const l = grid.get(key);
        if (l) near.push(...l);
        if (l) l.push(i);
        else grid.set(key, [i]);
      }
    for (const j of near) {
      const q = list[j].bb;
      if (
        p.bb.min.x - JOIN <= q.max.x &&
        p.bb.max.x + JOIN >= q.min.x &&
        p.bb.min.z - JOIN <= q.max.z &&
        p.bb.max.z + JOIN >= q.min.z &&
        p.bb.min.y - JOIN <= q.max.y &&
        p.bb.max.y + JOIN >= q.min.y
      )
        parent[find(j)] = find(i);
    }
  });
  const groups = new Map<number, Piece[]>();
  list.forEach((p, i) => {
    const r = find(i);
    const l = groups.get(r) ?? [];
    l.push(p);
    groups.set(r, l);
  });
  const ub = new THREE.Box3();
  for (const ps of groups.values()) {
    ub.makeEmpty();
    for (const p of ps) ub.union(p.bb);
    const big = ub.max.x - ub.min.x > GROUP_MAX || ub.max.z - ub.min.z > GROUP_MAX;
    const m = big ? about(0, 0, 1, K) : about((ub.min.x + ub.max.x) / 2, (ub.min.z + ub.max.z) / 2, K, K);
    for (const p of ps) {
      p.g.applyMatrix4(m);
      p.emit();
    }
  }
}

export interface TownWrapped extends DetailCtx {
  /** 细节都跑完以后调：攒着的小件归成一件一件缩、交给 build.ts */
  flush(): void;
}

export function townWrap(d: DetailCtx): TownWrapped {
  const box = new THREE.Box3();
  const pieces: Piece[] = [];
  /** 立着的一块几何：贴着楼的跟楼走、长条压低、小件攒着 */
  const stand = (g: THREE.BufferGeometry, emit: () => void) => {
    g.computeBoundingBox();
    const bb = g.boundingBox;
    if (!bb || bb.isEmpty()) return emit();
    const m = modeOf(bb);
    if (m.kind === 'small') {
      pieces.push({ bb: bb.clone(), g, emit });
      return;
    }
    if (m.kind === 'frame') g.applyMatrix4(about(m.f.px, m.f.pz, m.f.k, m.f.k));
    else if (m.kind === 'long') g.applyMatrix4(about(0, 0, 1, K));
    emit();
  };
  return {
    ...d,
    // 不缩的原样上下文（世界坐标的细节要放挡路形状、或整块自己缩好的东西时用：plaza.ts）
    raw: d,
    flush() {
      flushPieces(pieces);
      pieces.length = 0;
    },
    put(region, key, g) {
      stand(g, () => d.put(region, key, g));
    },
    putThin: d.putThin
      ? (region, key, g) => {
          stand(g, () => d.putThin?.(region, key, g));
        }
      : undefined,
    putFlat: d.putFlat
      ? (key, g) => {
          const m = geoMatrix(g, true);
          if (m) g.applyMatrix4(m);
          d.putFlat?.(key, g);
        }
      : undefined,
    instance(g, key, items, cast) {
      // 实例：一件一件按它的落地点分（几何本身是本地的、落地点在原点）
      g.computeBoundingBox();
      const bb = g.boundingBox;
      // 平铺 = 贴在地上（最高点 < FLAT_M），不是"薄"：车身两侧 0.12 米厚的饰条在 0.84 米高，按厚度判会被当成平铺、不跟车身一起缩
      //（2026-11-21：每辆停着的车两边留下两条原尺寸的 4.9 米白条）
      if (!bb || bb.max.y < FLAT_M) return d.instance(g, key, items, cast);
      const out: InstItem[] = items.map((it) => {
        const w = (bb.max.x - bb.min.x) * it.s;
        const dd = (bb.max.z - bb.min.z) * it.s;
        box.min.set(it.x - w / 2, 0, it.z - dd / 2);
        box.max.set(it.x + w / 2, 1, it.z + dd / 2);
        const m = modeOf(box);
        const y = (k: number) => (it.y === undefined ? undefined : it.y * k);
        if (m.kind === 'frame') {
          const [x, z] = fmapW(m.f, it.x, it.z);
          return { ...it, x, z, s: it.s * m.f.k, y: y(m.f.k) };
        }
        if (m.kind === 'small' || m.kind === 'long') return { ...it, s: it.s * K, y: y(K) };
        return it;
      });
      d.instance(g, key, out, cast);
    },
    asset(obj, region) {
      obj.updateMatrixWorld(true);
      box.setFromObject(obj);
      if (!box.isEmpty()) {
        const m = modeOf(box);
        if (m.kind === 'frame') {
          const [x, z] = fmapW(m.f, obj.position.x, obj.position.z);
          obj.position.set(x, obj.position.y * m.f.k, z);
          obj.scale.multiplyScalar(m.f.k);
        } else if (m.kind === 'small') {
          obj.position.y *= K;
          obj.scale.multiplyScalar(K);
        } else if (m.kind === 'long') obj.scale.y *= K;
      }
      d.asset(obj, region);
    },
    block(shape) {
      d.block(mapShape(shape));
    },
    clear(r) {
      const f = frameFor((r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2, r.x1 - r.x0, r.z1 - r.z0);
      if (!f) return d.clear(r);
      const [x0, z0] = fmapW(f, r.x0, r.z0);
      const [x1, z1] = fmapW(f, r.x1, r.z1);
      d.clear({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1) });
    },
  };
}

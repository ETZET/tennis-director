// 三栋办事楼（sites/paper.ts、sports.ts、hardware.ts）共用的摆放工具：车道守卫、灰盒、贴立面的薄片、锯齿顶、圆柱、
// 实例化的小件（长椅、棕榈、车、路灯、空调、龙舌兰）、占地和灯光圈（town.ts 读：街边家具躲开占地，夜里的灯光圈一起开关）。
// 2026-11-16 从 town.ts 第 1b 节搬出来（美术关卡 2：每栋楼一个代理，各改各的 site 文件 + assets 文件）。这个文件归核心代理。
// 坐标都是缩完的世界坐标（米）；资产（src/valley/assets）用 d.asset(obj) 放，灰盒用这里的 G / Sf。
import * as THREE from 'three';
import type { Shape } from '../../../clubsite/play';
import { box } from '../../../clubsite/render/geo';
import { type DetailCtx, type InstItem, rbox } from '../../build';
import { distToLine, ROADS } from '../../layout';
import type { PalKey } from '../../reuse';

export interface Box2 {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/**
 * 平铺层的高度（米）。叠着的两层至少差 0.01（共面会闪）；地 0、绿地 0.015、车道 0.03（build.ts）。
 * 人行道垫在车道底下；铺面（广场、草坪、停车场……）不压车道，统一一层；铺面上的东西再往上一层一层。
 */
export const Y = {
  walk: 0.02,
  zebra: 0.045,
  pave: 0.042,
  pave2: 0.054,
  pave3: 0.066,
  pave4: 0.078,
} as const;

// ── 车道守卫：离地 0.12～4.5 米（路缘 0.1 米高不算）的东西，有一个顶点落进任何一条车道（半宽以内）就整件不放（高处的树冠、招牌可以伸过去）──
const STREETS = ROADS.filter((r) => r.kind !== 'trail');
const ROAD_BOX = STREETS.map((r) => {
  const xs = r.pts.map((p) => p[0]);
  const zs = r.pts.map((p) => p[1]);
  const h = r.w / 2;
  return { r, x0: Math.min(...xs) - h, x1: Math.max(...xs) + h, z0: Math.min(...zs) - h, z1: Math.max(...zs) + h };
});
const onCarriage = (x: number, z: number) =>
  ROAD_BOX.some((b) => x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1 && distToLine(b.r.pts, x, z) < b.r.w / 2);
const V = new THREE.Vector3();
/** 这块几何（可带变换）有没有离地 0.12～4.5 米的顶点落进车道 */
export function hitsRoad(g: THREE.BufferGeometry, m?: THREE.Matrix4): boolean {
  g.computeBoundingBox();
  const bb = (g.boundingBox as THREE.Box3).clone();
  if (m) bb.applyMatrix4(m);
  if (bb.max.y < 0.12 || bb.min.y > 4.5) return false;
  if (!ROAD_BOX.some((b) => bb.max.x > b.x0 && bb.min.x < b.x1 && bb.max.z > b.z0 && bb.min.z < b.z1)) return false;
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    V.fromBufferAttribute(pos, i);
    if (m) V.applyMatrix4(m);
    if (V.y >= 0.12 && V.y <= 4.5 && onCarriage(V.x, V.z)) return true;
  }
  return false;
}

/** 灯光圈（夜里）：中心、半径、最高照到的 y */
export interface Pool {
  x: number;
  z: number;
  reg: string;
  r?: number;
  h?: number;
}
/** 三栋楼留给 town.ts 的东西：占的地（街边家具躲开）、灯光圈（town.ts 第 9 节一起开关）。sites 在 town 之前跑（detail/index.ts） */
interface SiteState {
  claims: Box2[];
  pools: Pool[];
}
const STATE = new WeakMap<DetailCtx, SiteState>();
export function siteState(d: DetailCtx): SiteState {
  let s = STATE.get(d);
  if (!s) {
    s = { claims: [], pools: [] };
    STATE.set(d, s);
  }
  return s;
}

const CAR_KEYS: PalKey[] = ['carRed', 'clothTeal', 'clothBlue', 'canvas', 'flowerYellow', 'seat'];

/** 一栋楼的摆放工具。rnd = 这栋楼的随机流（d.rng('名字')）。最后调 finish() 把实例化的小件交给 build.ts */
export function siteKit(d: DetailCtx, rnd: () => number) {
  const st = siteState(d);
  const pick = <T>(a: readonly T[]): T => a[Math.floor(rnd() * a.length) % a.length];
  let skipped = 0;
  const put = (key: PalKey, g: THREE.BufferGeometry, x: number, z: number) => {
    if (hitsRoad(g)) {
      skipped++;
      g.dispose();
      return;
    }
    d.put(d.regionOf(x, z), key, g);
  };
  /** 转过的盒子（中心 x z、底 y） */
  const bx = (key: PalKey, w: number, h: number, dd: number, x: number, y: number, z: number, rot = 0) =>
    put(key, rbox(w, h, dd, x, y, z, rot), x, z);
  /** 地上的一块平面（矩形，可转） */
  const flat = (key: PalKey, w: number, dd: number, x: number, y: number, z: number, rot = 0) =>
    put(
      key,
      new THREE.PlaneGeometry(w, dd)
        .rotateX(-Math.PI / 2)
        .rotateY(rot)
        .translate(x, y, z),
      x,
      z,
    );
  const block = (sh: Shape) => d.block(sh);
  const blockRect = (x: number, z: number, w: number, dd: number, rot = 0) => {
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const poly = [
      [-w / 2, -dd / 2],
      [w / 2, -dd / 2],
      [w / 2, dd / 2],
      [-w / 2, dd / 2],
    ].map(([a, b]) => [x + a * c + b * s, z - a * s + b * c] as const);
    block({ poly });
  };
  /** 占地：town.ts 的街边家具躲开，build.ts 的灌木和大道棕榈也不往这里撒 */
  const claim = (r: Box2) => {
    st.claims.push(r);
    d.clear(r);
  };
  /** 灰盒：中心 (x, z)、底 y；blk = 挡路（底 < 1.8 米才挡） */
  const G = (key: PalKey, w: number, h: number, dd: number, x: number, y: number, z: number, rot = 0, blk = true) => {
    bx(key, w, h, dd, x, y, z, rot);
    if (blk && y < 1.8) blockRect(x, z, w, dd, rot);
  };
  /** 贴在朝南立面上的薄片（立面 z = fz，往外 u 米，厚 t） */
  const Sf = (key: PalKey, w: number, h: number, x: number, y: number, fz: number, u = 0.08, t = 0.12) =>
    bx(key, w, h, t, x, y, fz + u);
  /** 锯齿顶的一齿：南低北高的斜面（北面竖直，是天窗），沿 x 长 w */
  const tooth = (key: PalKey, w: number, x: number, y: number, zS: number, zN: number, h: number) => {
    const x0 = x - w / 2;
    const x1 = x + w / 2;
    const P = [
      [x0, y, zS],
      [x1, y, zS],
      [x1, y, zN],
      [x0, y, zN],
      [x0, y + h, zN],
      [x1, y + h, zN],
    ];
    const tri = [
      [0, 1, 5],
      [0, 5, 4], // 斜面（朝南上方）
      [3, 4, 5],
      [3, 5, 2], // 北面（竖直的天窗）
      [0, 4, 3], // 西端
      [1, 2, 5], // 东端
    ];
    const pos: number[] = [];
    for (const t of tri) for (const i of t) pos.push(...(P[i] as number[]));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    put(key, g, x, (zS + zN) / 2);
  };
  /** 圆柱：axis y 立着（底 y）；x / z 横放（底 y = 圆柱最低点） */
  const cyl = (
    key: PalKey,
    r: number,
    h: number,
    x: number,
    y: number,
    z: number,
    axis: 'y' | 'x' | 'z' = 'y',
    n = 10,
  ) => {
    const g = new THREE.CylinderGeometry(r, r, h, n);
    if (axis === 'x') g.rotateZ(Math.PI / 2);
    if (axis === 'z') g.rotateX(Math.PI / 2);
    put(key, g.translate(x, y + (axis === 'y' ? h / 2 : r), z), x, z);
  };

  // ── 实例化的小件（同 town.ts 的形状） ──
  const inst = new Map<string, { g: THREE.BufferGeometry; key: PalKey; items: InstItem[]; cast: boolean }>();
  const instM = new THREE.Matrix4();
  const instQ = new THREE.Quaternion();
  const UP = new THREE.Vector3(0, 1, 0);
  const instHits = (names: readonly string[], it: InstItem) => {
    instQ.setFromAxisAngle(UP, it.rot ?? 0);
    instM.compose(new THREE.Vector3(it.x, it.y ?? 0, it.z), instQ, new THREE.Vector3(it.s, it.s, it.s));
    return names.some((n) => {
      const e = inst.get(n);
      return !!e && hitsRoad(e.g, instM);
    });
  };
  const addInst = (name: string, it: InstItem) => {
    if (instHits([name], it)) {
      skipped++;
      return false;
    }
    inst.get(name)?.items.push(it);
    return true;
  };
  const defInst = (name: string, key: PalKey, parts: THREE.BufferGeometry[], cast = true) => {
    const list = parts.map((p) => (p.index ? p.toNonIndexed() : p));
    for (const p of list)
      for (const a of Object.keys(p.attributes)) if (a !== 'position' && a !== 'normal') p.deleteAttribute(a);
    const pos: number[] = [];
    for (const p of list) pos.push(...(p.attributes.position.array as Float32Array));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    inst.set(name, { g, key, items: [], cast });
  };
  defInst('lampPole', 'ironwork', [box(0.18, 4.4, 0.18, 0, 0, 0), box(0.12, 0.12, 0.8, 0, 4.25, 0.35)]);
  defInst('lampHead', 'signPaint', [box(0.42, 0.3, 0.42, 0, 3.98, 0.7)], false);
  defInst('bench', 'wood', [box(1.9, 0.12, 0.55, 0, 0.42, 0), box(1.9, 0.45, 0.12, 0, 0.55, -0.26)]);
  defInst('benchLeg', 'ironwork', [box(0.12, 0.42, 0.5, -0.8, 0, 0), box(0.12, 0.42, 0.5, 0.8, 0, 0)], false);
  defInst('ac', 'metal', [box(1.3, 0.8, 1.0, 0, 0, 0)], false);
  defInst('agave', 'cactus', [new THREE.ConeGeometry(0.55, 0.9, 5).translate(0, 0.45, 0)], false);
  defInst('palmTrunk', 'palmTrunk', [new THREE.CylinderGeometry(0.22, 0.34, 8, 5).translate(0, 4, 0)]);
  {
    const fronds: THREE.BufferGeometry[] = [new THREE.IcosahedronGeometry(0.55, 0).translate(0, 8.1, 0)];
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + (k % 2) * 0.2;
      const droop = k % 2 ? 0.55 : 0.32;
      fronds.push(
        new THREE.BoxGeometry(0.55, 0.08, 3.1).translate(0, 0, 1.45).rotateX(droop).rotateY(a).translate(0, 8.15, 0),
      );
    }
    defInst('palmCrown', 'palm', fronds);
  }
  for (const k of CAR_KEYS) defInst(`car:${k}`, k, [box(2.0, 0.7, 4.8, 0, 0.28, 0)]);
  defInst('carTrim', 'stucco', [box(0.14, 0.12, 4.9, -0.96, 0.84, 0), box(0.14, 0.12, 4.9, 0.96, 0.84, 0)], false);
  defInst('carSeat', 'clothWhite', [box(1.7, 0.45, 1.2, 0, 0.98, -0.4)], false);
  defInst('carGlass', 'silverBlue', [box(1.7, 0.4, 0.1, 0, 1.0, 0.6)], false);
  defInst('carTyre', 'ironwork', [box(1.84, 0.3, 3.9, 0, 0, 0)], false);

  /** 六十年代的长车身敞篷（车头朝本地 +z；不给颜色就随机挑） */
  const car = (x: number, z: number, rot: number, key?: PalKey) => {
    const k = key ?? pick(CAR_KEYS);
    const it = { x, z, s: 1, rot, reg: d.regionOf(x, z) };
    const parts = [`car:${k}`, 'carTrim', 'carSeat', 'carGlass', 'carTyre'];
    if (instHits(parts, it)) return;
    for (const n of parts) addInst(n, it);
    blockRect(x, z, 2.1, 4.9, rot);
  };
  const palm = (x: number, z: number, s = 1, y = 0) => {
    const it = { x, z, s, y, rot: rnd() * 6, reg: d.regionOf(x, z) };
    if (instHits(['palmTrunk', 'palmCrown'], it)) return;
    addInst('palmTrunk', it);
    addInst('palmCrown', it);
    block({ x, z, r: 0.45 });
  };
  /** 长椅（面朝本地 +z） */
  const bench = (x: number, z: number, rot: number) => {
    const it = { x, z, s: 1, rot, reg: d.regionOf(x, z) };
    if (instHits(['bench', 'benchLeg'], it)) return;
    addInst('bench', it);
    addInst('benchLeg', it);
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    block({ a: [x - 0.9 * c, z + 0.9 * s], b: [x + 0.9 * c, z - 0.9 * s], r: 0.4 });
  };
  /** 夜里的灯光圈（town.ts 第 9 节开关） */
  const pool = (x: number, z: number, r?: number, h?: number) => st.pools.push({ x, z, reg: d.regionOf(x, z), r, h });
  /** 路灯（本地 +z 朝路），同 town.ts */
  const lamp = (x: number, z: number, rot: number) => {
    const it = { x, z, s: 1, rot, reg: d.regionOf(x, z) };
    if (instHits(['lampPole', 'lampHead'], it)) return;
    addInst('lampPole', it);
    addInst('lampHead', it);
    block({ x, z, r: 0.25 });
    st.pools.push({ x: x + Math.sin(rot) * 0.7, z: z + Math.cos(rot) * 0.7, reg: it.reg });
  };
  /** 收尾：实例化的小件交给 build.ts；返回车道守卫拦下的件数 */
  const finish = () => {
    for (const { g, key, items, cast } of inst.values()) if (items.length) d.instance(g, key, items, cast);
    return skipped;
  };

  return {
    put,
    bx,
    flat,
    block,
    blockRect,
    claim,
    G,
    Sf,
    tooth,
    cyl,
    addInst,
    car,
    palm,
    bench,
    lamp,
    pool,
    finish,
  };
}
export type SiteKit = ReturnType<typeof siteKit>;

// valley 细节：市中心（棕榈谷大道 / 印第安峡谷路 / 塔奎兹路一带）和北边的老街区（拉斯帕尔马斯、电影人街区、球拍俱乐部）、111 号公路的加油站。
// 接口见 build.ts 的 DetailCtx。只改这个文件。
//
// 构图（照 pixel-scene 的规矩：先定主角，细节成簇，平地留白）：
// - 主角是"走得进去"的几处：塔奎兹路北边空地穿进去的小巷 → 市政厅东边的喷泉广场 → 市政厅背后 → 老酒店草坪上的表演赛场 → 酒店前院 → 印第安峡谷路；
//   棕榈谷大道西边咖啡馆的露天座。街道本身只给人行道、路缘、路口斑马线、路灯和长椅（在店面之间的空当里），不往沙地上撒东西。
// - 朝镜头（朝南）的立面是暗带：店面玻璃、矮墙、看台的正面都是免费的明暗层次；招牌按朝向挑做法（朝南贴墙、朝北立在屋顶、朝东西用伸出来的竖招牌）。
// - 小区只做"中世纪现代"的几样：朝路的矮墙（暗带）、车棚、后院泳池、彩色的门、院子里一棵棕榈；不是每家都有。
// - 发现点：废弃的球拍俱乐部（褪色开裂的老场子、倒了一半的围网、干掉的泳池、钉了木板的窗）。加油站：雨棚的柱子、加油岛、价格牌。
// 线和杆都 ≥ 2 纹素（默认 0.045 米/纹素）；白线（斑马线、车位线、球场线）是强边缘大户，只放在路口和主角上。
import * as THREE from 'three';
import type { Shape } from '../../clubsite/play';
import { box } from '../../clubsite/render/geo';
import { bldgPoly, type DetailCtx, type InstItem, rbox, ribbon } from '../build';
import {
  along,
  type Bldg,
  BUILDINGS_RAW as BUILDINGS,
  distToLine,
  housesRaw as houses,
  inPoly,
  ROADS,
  type Road,
  S,
  SCALE,
  SITES_RAW as SITES,
  type V2,
} from '../layout';
import type { PalKey } from '../reuse';
import { hitsRoad, siteState, Y } from './sites/kit';

interface Box2 {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}
/** 立面的坐标系：origin 是立面中心（地面），out 朝外，tan 顺着立面 */
interface Face {
  o: Bldg;
  ox: number;
  oz: number;
  out: V2;
  tan: V2;
  /** 立面一半长 */
  half: number;
  /** 楼在 out 方向的一半深 */
  depth: number;
}

const STREETS = ROADS.filter((r) => r.kind !== 'trail');
/** 三家办事的楼（layout.ts 的 SITES）：门面、招牌在 detail/sites/ 摆，通用的店面招牌不做 */
const ERRAND_IDS = new Set(['paper', 'paper_press', 'sports', 'hardware']);
const roadById = (id: string) => ROADS.find((r) => r.id === id) as Road;
/** 折线左手的单位法向（同 build.ts 的 ribbon） */
const nrm = (a: V2, b: V2): V2 => {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return [-(b[1] - a[1]) / L, (b[0] - a[0]) / L];
};
/** 折线平移 o 米（拐点斜接） */
function offsetLine(pts: readonly V2[], o: number): V2[] {
  return pts.map((p, i) => {
    const n1 = i > 0 ? nrm(pts[i - 1], p) : nrm(p, pts[i + 1]);
    const n2 = i < pts.length - 1 ? nrm(p, pts[i + 1]) : n1;
    let nx = n1[0] + n2[0];
    let nz = n1[1] + n2[1];
    const L = Math.hypot(nx, nz) || 1;
    nx /= L;
    nz /= L;
    const k = Math.max(0.5, nx * n1[0] + nz * n1[1]);
    return [p[0] + (nx * o) / k, p[1] + (nz * o) / k] as const;
  });
}
/** 折线裁进矩形：可能断成几段 */
function clip(pts: readonly V2[], r: Box2): V2[][] {
  const runs: V2[][] = [];
  let cur: V2[] = [];
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1];
    const [bx, bz] = pts[i];
    const dx = bx - ax;
    const dz = bz - az;
    const p = [-dx, dx, -dz, dz];
    const q = [ax - r.x0, r.x1 - ax, az - r.z0, r.z1 - az];
    let t0 = 0;
    let t1 = 1;
    let ok = true;
    for (let k = 0; k < 4 && ok; k++) {
      if (p[k] === 0) ok = q[k] >= 0;
      else {
        const t = q[k] / p[k];
        if (p[k] < 0) {
          if (t > t1) ok = false;
          else t0 = Math.max(t0, t);
        } else if (t < t0) ok = false;
        else t1 = Math.min(t1, t);
      }
    }
    if (!ok) {
      if (cur.length > 1) runs.push(cur);
      cur = [];
      continue;
    }
    const A: V2 = [ax + dx * t0, az + dz * t0];
    const B: V2 = [ax + dx * t1, az + dz * t1];
    if (cur.length === 0 || t0 > 0) {
      if (cur.length > 1) runs.push(cur);
      cur = [A];
    }
    cur.push(B);
    if (t1 < 1) {
      runs.push(cur);
      cur = [];
    }
  }
  if (cur.length > 1) runs.push(cur);
  return runs;
}
/** 沿折线走，ok 的连续段交给 emit（路缘、矮墙按"能放的地方"断开） */
function runsAlong(
  pts: readonly V2[],
  ok: (x: number, z: number) => boolean,
  emit: (a: V2, b: V2) => void,
  step = 0.5,
) {
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1];
    const [bx, bz] = pts[i];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / step));
    const at = (t: number): V2 => [ax + (bx - ax) * t, az + (bz - az) * t];
    let s: number | null = null;
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const [x, z] = at(t);
      const good = ok(x, z);
      if (good && s === null) s = t;
      if (s !== null && (!good || k === n)) {
        const e = good ? t : (k - 1) / n;
        if (e - s > 0.02) emit(at(s), at(e));
        s = null;
      }
    }
  }
}

// 平铺层的高度（Y）、车道守卫（hitsRoad）在 sites/kit.ts（三栋办事楼也用）

export function detailTown(d: DetailCtx): void {
  const rnd = d.rng('valley:town');
  const pick = <T>(a: readonly T[]): T => a[Math.floor(rnd() * a.length) % a.length];
  // ── 车道守卫：离地 0.12～4.5 米（路缘 0.1 米高不算）的东西，有一个顶点落进任何一条车道（半宽以内）就整件不放（高处的树冠、招牌可以伸过去）──
  // （铺面、人行道、斑马线、路缘这些贴地的不管。招牌、雨棚、道具跟着店面走，店面是 layout.ts 撒的，会变；
  //  这里兜底，保证 town.ts 的东西永远不进车道。）
  let skipped = 0;
  /** 调试：主角块放下了没有、放在哪（lights.userData.placed） */
  const dbgPlaced: Record<string, Box2 | null> = {};
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

  // ── 占地查询：楼（有名字的 + 撒的）、路 ──
  const BLD = [...BUILDINGS, ...houses()].map((o) => ({ o, r: Math.hypot(o.w, o.d) / 2 }));
  const inBldg = (x: number, z: number, pad = 0.3) =>
    BLD.some(
      ({ o, r }) => Math.abs(o.x - x) < r + pad && Math.abs(o.z - z) < r + pad && inPoly(bldgPoly(o, pad), x, z),
    );
  const roadGap = (x: number, z: number, except?: Road) => {
    let best = Number.POSITIVE_INFINITY;
    for (const r of STREETS) if (r !== except) best = Math.min(best, distToLine(r.pts, x, z) - r.w / 2);
    return best;
  };
  const free = (x: number, z: number, pad = 0.3) => !inBldg(x, z, pad) && roadGap(x, z) > pad;
  /** 转过的矩形（中心、宽 w 沿 rot 的本地 x）四角 + 边中点 + 中心都空 */
  const rectFree = (x: number, z: number, w: number, dd: number, rot = 0, pad = 0.3) => {
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    for (const a of [-0.5, 0, 0.5])
      for (const b of [-0.5, 0, 0.5]) {
        const lx = a * w;
        const lz = b * dd;
        if (!free(x + lx * c + lz * s, z - lx * s + lz * c, pad)) return false;
      }
    return true;
  };
  /** 我自己占掉的地（广场、草坪、停车场、露天座）：街边家具躲开 */
  const taken: Box2[] = [];
  /** 占地：街边家具躲开，build.ts 的灌木和大道棕榈也不往这里撒 */
  const claim = (r: Box2) => {
    taken.push(r);
    d.clear(r);
  };
  const inTaken = (x: number, z: number, pad = 0) =>
    taken.some((r) => x > r.x0 - pad && x < r.x1 + pad && z > r.z0 - pad && z < r.z1 + pad);

  // ── 山谷按 layout.ts 的 S() 缩过（位置 × 0.7、尺寸不变）：写死的世界坐标一律过 SB；铺面类的块按"空不空"收边 ──
  /** 旧坐标（缩之前）的矩形 → 现在的世界坐标 */
  const SB = (b: Box2): Box2 => {
    const [ax, az] = S(b.x0, b.z0);
    const [bx2, bz] = S(b.x1, b.z1);
    return { x0: Math.min(ax, bx2), x1: Math.max(ax, bx2), z0: Math.min(az, bz), z1: Math.max(az, bz) };
  };
  /** 整块（每 1.5 米一个采样点）不压楼、不压路、不压我已经占的地 */
  const boxBad = (b: Box2, pad: number, avoidTaken: boolean) => {
    const bad: V2[] = [];
    const nx = Math.max(2, Math.ceil((b.x1 - b.x0) / 1.5));
    const nz = Math.max(2, Math.ceil((b.z1 - b.z0) / 1.5));
    for (let i = 0; i <= nx; i++)
      for (let j = 0; j <= nz; j++) {
        const x = b.x0 + ((b.x1 - b.x0) * i) / nx;
        const z = b.z0 + ((b.z1 - b.z0) * j) / nz;
        if (!free(x, z, pad) || (avoidTaken && inTaken(x, z, -0.01))) bad.push([x, z]);
      }
    return bad;
  };
  /** 压到东西就往里收边（每步试四条边各收 1 米，挑剩下压得最少的那条），收到比 minW × minD 还小就放弃（返回 null）：放不下宁可不放，不叠 */
  const fit = (b0: Box2, minW: number, minD: number, pad = 0.4, avoidTaken = true): Box2 | null => {
    let b = { ...b0 };
    let bad = boxBad(b, pad, avoidTaken).length;
    for (let it = 0; it < 200 && bad; it++) {
      let best: Box2 | null = null;
      let bestBad = Number.POSITIVE_INFINITY;
      for (const c of [
        { ...b, x0: b.x0 + 1 },
        { ...b, x1: b.x1 - 1 },
        { ...b, z0: b.z0 + 1 },
        { ...b, z1: b.z1 - 1 },
      ]) {
        if (c.x1 - c.x0 < minW || c.z1 - c.z0 < minD) continue;
        const n = boxBad(c, pad, avoidTaken).length;
        if (n < bestBad) {
          bestBad = n;
          best = c;
        }
      }
      if (!best) return null;
      b = best;
      bad = bestBad;
    }
    return bad ? null : b;
  };
  /** 从 (x, z) 往 dir 方向走，走到离车道边 < edge 米（踩上人行道）为止，返回那时的 z（最多走 lim 米） */
  const zToWalk = (x: number, z: number, dir: number, edge: number, lim = 40) => {
    for (let k = 0; k < lim * 2; k++) if (roadGap(x, z + (dir * k) / 2) < edge) return z + (dir * k) / 2;
    return null;
  };

  // ── 立面 ──
  const faceOf = (o: Bldg, ax: 'x' | 'z', sgn: number): Face => {
    const r = o.rot ?? 0;
    const lx: V2 = [Math.cos(r), -Math.sin(r)];
    const lz: V2 = [Math.sin(r), Math.cos(r)];
    const out: V2 = ax === 'z' ? [lz[0] * sgn, lz[1] * sgn] : [lx[0] * sgn, lx[1] * sgn];
    const tan: V2 = ax === 'z' ? lx : lz;
    const depth = ax === 'z' ? o.d / 2 : o.w / 2;
    return {
      o,
      ox: o.x + out[0] * depth,
      oz: o.z + out[1] * depth,
      out,
      tan,
      half: ax === 'z' ? o.w / 2 : o.d / 2,
      depth,
    };
  };
  /** 离路最近的那面（店面 / 正门） */
  const frontOf = (o: Bldg): Face => {
    let best: Face | null = null;
    let bd = Number.POSITIVE_INFINITY;
    for (const ax of ['z', 'x'] as const)
      for (const sgn of [1, -1]) {
        const f = faceOf(o, ax, sgn);
        const g = roadGap(f.ox + f.out[0] * 2, f.oz + f.out[1] * 2);
        if (g < bd - 0.5) {
          bd = g;
          best = f;
        }
      }
    return best as Face;
  };
  /** 最朝南（朝镜头）的那面 */
  const southOf = (o: Bldg): Face => {
    let best = faceOf(o, 'z', 1);
    for (const ax of ['z', 'x'] as const)
      for (const sgn of [1, -1]) {
        const f = faceOf(o, ax, sgn);
        if (f.out[1] > best.out[1]) best = f;
      }
    return best;
  };
  /** 立面坐标系里的点：t 顺着立面、u 往外 */
  const fp = (f: Face, t: number, u: number): V2 => [
    f.ox + f.tan[0] * t + f.out[0] * u,
    f.oz + f.tan[1] * t + f.out[1] * u,
  ];
  const fRot = (f: Face) => Math.atan2(-f.tan[1], f.tan[0]);
  /** 立面坐标系里的盒子：sx 顺着立面、sz 往外 */
  const fbox = (f: Face, key: PalKey, sx: number, h: number, sz: number, t: number, y: number, u: number, tilt = 0) => {
    const [x, z] = fp(f, t, u);
    const g = box(sx, h, sz, 0, -h / 2, 0);
    if (tilt) g.rotateZ(tilt);
    g.translate(0, y + h / 2, 0)
      .rotateY(fRot(f))
      .translate(x, 0, z);
    put(key, g, x, z);
  };

  // ── 实例化的小件 ──
  const inst = new Map<string, { g: THREE.BufferGeometry; key: PalKey; items: InstItem[]; cast: boolean }>();
  const instM = new THREE.Matrix4();
  const instQ = new THREE.Quaternion();
  const UP = new THREE.Vector3(0, 1, 0);
  /** 这一件（几个实例化部件一起）会不会压到车道 */
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
  // 路灯：杆 + 朝路的短臂（本地 +z 朝路）+ 灯头。灯头只伸到路缘外 0.1 米（不悬在车道上）；夜里换自发光（见最后的"夜里"）
  defInst('lampPole', 'ironwork', [box(0.18, 4.4, 0.18, 0, 0, 0), box(0.12, 0.12, 0.8, 0, 4.25, 0.35)]);
  defInst('lampHead', 'signPaint', [box(0.42, 0.3, 0.42, 0, 3.98, 0.7)], false);
  // 长椅（面朝本地 +z）
  defInst('bench', 'wood', [box(1.9, 0.12, 0.55, 0, 0.42, 0), box(1.9, 0.45, 0.12, 0, 0.55, -0.26)]);
  // 小件不投影（省阴影 pass 的三角形；凳腿、桶、车上的零件的影子都被大件的影子盖住）
  defInst('benchLeg', 'ironwork', [box(0.12, 0.42, 0.5, -0.8, 0, 0), box(0.12, 0.42, 0.5, 0.8, 0, 0)], false);
  // 方花槽 + 里面一团草（一半的槽再冒两三朵红花：原来整团红色的二十面体像一颗红宝石）
  defInst('planter', 'adobe', [box(1.3, 0.6, 1.3, 0, 0, 0)]);
  defInst(
    'planterSage',
    'sage',
    [new THREE.IcosahedronGeometry(0.62, 0).scale(1, 0.55, 1).translate(0, 0.72, 0)],
    false,
  );
  defInst(
    'planterBloom',
    'flowerRed',
    [
      new THREE.IcosahedronGeometry(0.2, 0).translate(-0.25, 1.0, 0.18),
      new THREE.IcosahedronGeometry(0.18, 0).translate(0.28, 0.98, -0.12),
      new THREE.IcosahedronGeometry(0.17, 0).translate(0.05, 1.04, 0.32),
    ],
    false,
  );
  // 垃圾桶
  defInst('bin', 'ironwork', [new THREE.CylinderGeometry(0.3, 0.27, 0.9, 6).translate(0, 0.45, 0)], false);
  // 屋顶的空调箱（棕榈泉每个平顶上都有）
  defInst('ac', 'metal', [box(1.3, 0.8, 1.0, 0, 0, 0)], false);
  // 棕榈（同 build.ts 的形状：八片往下垂的叶子 + 中间一小团；原来的扁八面体看着是一块绿菱形，影子是一大块菱形黑斑）
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
  // 圆花池（棕榈坐在里面）
  defInst('potRound', 'adobe', [new THREE.CylinderGeometry(1.15, 1.2, 0.55, 10).translate(0, 0.275, 0)]);
  // 六十年代的长车身敞篷（同 vehicles.ts 的样子；车头朝本地 +z）
  const CAR_KEYS: PalKey[] = ['carRed', 'clothTeal', 'clothBlue', 'canvas', 'flowerYellow', 'seat'];
  for (const k of CAR_KEYS) defInst(`car:${k}`, k, [box(2.0, 0.7, 4.8, 0, 0.28, 0)]);
  defInst('carTrim', 'stucco', [box(0.14, 0.12, 4.9, -0.96, 0.84, 0), box(0.14, 0.12, 4.9, 0.96, 0.84, 0)], false);
  defInst('carSeat', 'clothWhite', [box(1.7, 0.45, 1.2, 0, 0.98, -0.4)], false);
  defInst('carGlass', 'silverBlue', [box(1.7, 0.4, 0.1, 0, 1.0, 0.6)], false);
  // 底盘 + 轮子：一块收进去的暗盒（俯视 45° 只看得见车身下沿一条暗边；原来四个轮子 48 个三角形）
  defInst('carTyre', 'ironwork', [box(1.84, 0.3, 3.9, 0, 0, 0)], false);
  // 杂草 / 小仙人掌（废弃球场的裂缝里、院子里）
  defInst('weed', 'sage', [new THREE.IcosahedronGeometry(0.5, 0).scale(1, 0.6, 1).translate(0, 0.2, 0)], false);
  defInst('agave', 'cactus', [new THREE.ConeGeometry(0.55, 0.9, 5).translate(0, 0.45, 0)], false);

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
  const bench = (x: number, z: number, rot: number) => {
    const it = { x, z, s: 1, rot, reg: d.regionOf(x, z) };
    if (instHits(['bench', 'benchLeg'], it)) return;
    addInst('bench', it);
    addInst('benchLeg', it);
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    block({ a: [x - 0.9 * c, z + 0.9 * s], b: [x + 0.9 * c, z - 0.9 * s], r: 0.4 });
  };
  /** 路灯的灯光圈（夜里）：灯头底下、往路那边挪一点 */
  const lampPools: { x: number; z: number; reg: string; r?: number; h?: number }[] = [];
  const lamp = (x: number, z: number, rot: number) => {
    const it = { x, z, s: 1, rot, reg: d.regionOf(x, z) };
    if (instHits(['lampPole', 'lampHead'], it)) return;
    addInst('lampPole', it);
    addInst('lampHead', it);
    block({ x, z, r: 0.25 });
    lampPools.push({ x: x + Math.sin(rot) * 0.7, z: z + Math.cos(rot) * 0.7, reg: it.reg });
  };
  const planter = (x: number, z: number, bloom = false) => {
    const it = { x, z, s: 1, rot: rnd() * 6, reg: d.regionOf(x, z) };
    if (instHits(['planter', 'planterSage', 'planterBloom'], it)) return;
    addInst('planter', { ...it, rot: 0 });
    addInst('planterSage', it);
    if (bloom) addInst('planterBloom', it);
    block({ x, z, r: 0.8 });
  };

  // 招牌的底色（每家一个）、门的颜色（棕榈泉的彩色门）
  const SIGN: PalKey[] = ['signBoard', 'carRed', 'seat', 'clothTeal', 'toolOrange', 'clothPurple'];
  const DOOR: PalKey[] = ['flowerYellow', 'clothTeal', 'toolOrange', 'clothPurple', 'carRed', 'canvasStripe'];

  // ══ 1. 市中心的街：人行道、路缘、斑马线 ══════════════════════════════
  // 人行道 = 路两边各宽 sw 米的陶砖带（陶砖比步道的浅土色暖、饱和，和车道、沙地都分得开）（在路面底下铺一条更宽的带子，路面盖住中间）；路缘 = 路边一条矮石条，遇到横路断开
  // 塔奎兹路只铺到旧 x 660（市中心这片的东边界；再往东是学校那片，归 detail/east.ts）
  const DT: Record<string, { sw: number; clip: Box2 }> = {
    palm_canyon: { sw: 4, clip: SB({ x0: 280, x1: 380, z0: -1100, z1: -775 }) },
    indian_canyon: { sw: 3, clip: SB({ x0: 380, x1: 440, z0: -1090, z1: -775 }) },
    tahquitz: { sw: 4, clip: SB({ x0: 268, x1: 659, z0: -930, z1: -880 }) },
    alejo: { sw: 2.5, clip: SB({ x0: 320, x1: 659, z0: -1030, z1: -980 }) },
  };
  const runs: { r: Road; pts: V2[]; sw: number }[] = [];
  for (const [id, { sw, clip: c }] of Object.entries(DT)) {
    const r = roadById(id);
    for (const pts of clip(r.pts, c)) runs.push({ r, pts, sw });
  }
  for (const { r, pts, sw } of runs) {
    const mid = pts[Math.floor(pts.length / 2)];
    put('tile', ribbon(pts, r.w / 2 + sw, Y.walk), mid[0], mid[1]);
    // 路缘：两边各一条 0.3 宽、0.1 高；跨过别的路的地方断开
    for (const side of [-1, 1]) {
      const edge = offsetLine(pts, side * (r.w / 2 + 0.1));
      runsAlong(
        edge,
        (x, z) => roadGap(x, z, r) > 0.4,
        (a, b) => {
          const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
          const cx = (a[0] + b[0]) / 2;
          const cz = (a[1] + b[1]) / 2;
          bx('concrete', 0.3, 0.1, L, cx, 0, cz, Math.atan2(b[0] - a[0], b[1] - a[1]));
        },
      );
    }
  }
  // 斑马线：两条路的交点，每条路在交点两边各一道（那边有路才画）
  const tangentAt = (r: Road, x: number, z: number): V2 => {
    let best = Number.POSITIVE_INFINITY;
    let t: V2 = [0, 1];
    for (let i = 1; i < r.pts.length; i++) {
      const dd = distToLine([r.pts[i - 1], r.pts[i]], x, z);
      if (dd < best) {
        best = dd;
        const [ax, az] = r.pts[i - 1];
        const [bx2, bz] = r.pts[i];
        const L = Math.hypot(bx2 - ax, bz - az);
        t = [(bx2 - ax) / L, (bz - az) / L];
      }
    }
    return t;
  };
  const crossings: V2[] = [];
  for (const [ia, ib] of [
    ['palm_canyon', 'tahquitz'],
    ['indian_canyon', 'tahquitz'],
    ['palm_canyon', 'alejo'],
    ['indian_canyon', 'alejo'],
  ] as const) {
    const A = roadById(ia);
    const B = roadById(ib);
    let P: V2 = A.pts[0];
    let bd = Number.POSITIVE_INFINITY;
    for (const [, p] of along(A.pts, 0.5)) {
      const dd = distToLine(B.pts, p[0], p[1]);
      if (dd < bd) {
        bd = dd;
        P = p;
      }
    }
    crossings.push(P);
    for (const [R, O] of [
      [A, B],
      [B, A],
    ] as const) {
      const t = tangentAt(R, P[0], P[1]);
      const n: V2 = [-t[1], t[0]];
      for (const s of [-1, 1]) {
        const cx = P[0] + t[0] * s * (O.w / 2 + 2.4);
        const cz = P[1] + t[1] * s * (O.w / 2 + 2.4);
        if (distToLine(R.pts, cx, cz) > 0.5 || distToLine(O.pts, cx, cz) < O.w / 2) continue;
        const rot = Math.atan2(t[0], t[1]);
        for (let u = -R.w / 2 + 0.9; u <= R.w / 2 - 0.6; u += 1.3)
          flat('line', 0.65, 2.8, cx + n[0] * u, Y.zebra, cz + n[1] * u, rot);
      }
    }
  }
  const nearCrossing = (x: number, z: number, r: number) => crossings.some((p) => Math.hypot(p[0] - x, p[1] - z) < r);

  // ══ 1b. 三家办事的楼：报社、体育用品店、五金大超市 —— 搬到 detail/sites/（paper.ts、sports.ts、hardware.ts，2026-11-16 美术关卡 2）══
  // 它们在 town 之前跑；这里只把院子（layout.ts 的 SITES）和它们占的地（报箱那一条……）记进 taken，街边家具躲开。
  // 原来第 1b 节在这里取了 153 个随机数（停车场的车、绿岛的棕榈）：跳过同样多，town 后面的东西（招牌颜色、车棚……）一个数不差。
  for (const s of SITES) claim(s);
  for (const r of siteState(d).claims) taken.push(r);
  for (let k = 0; k < 153; k++) rnd();

  // ══ 2. 主角：喷泉广场、小巷、市政厅背后、老酒店草坪和表演赛场、酒店前院、咖啡馆露天座 ═══
  const cityhall = BUILDINGS.find((o) => o.id === 'cityhall') as Bldg;
  const hotel = BUILDINGS.find((o) => o.id === 'hotel_old') as Bldg;
  const cafe = BUILDINGS.find((o) => o.id === 'cafe') as Bldg;
  {
    // 喷泉广场：市政厅东边，南边一条小巷接到塔奎兹路的人行道。位置跟着市政厅走；大小按缩过的间距（44 米 × 0.7 起），压到楼 / 路就收边
    const PZ = fit(
      {
        x0: cityhall.x + cityhall.w / 2 + 3,
        x1: cityhall.x + cityhall.w / 2 + 3 + 44 * SCALE,
        z0: cityhall.z - cityhall.d / 2 - 20 * SCALE,
        z1: cityhall.z + cityhall.d / 2 - 4,
      },
      18,
      16,
    );
    dbgPlaced.plaza = PZ;
    if (PZ) {
      claim(PZ);
      const cx = (PZ.x0 + PZ.x1) / 2;
      const cz = (PZ.z0 + PZ.z1) / 2;
      const hw = (PZ.x1 - PZ.x0) / 2;
      const hd = (PZ.z1 - PZ.z0) / 2;
      /** 广场里的相对位置（−1…1）→ 世界坐标；离边 1.5 米内的不放 */
      const at = (u: number, v: number): V2 | null => {
        const x = cx + u * hw;
        const z = cz + v * hd;
        return x > PZ.x0 + 1.5 && x < PZ.x1 - 1.5 && z > PZ.z0 + 1.5 && z < PZ.z1 - 1.5 ? [x, z] : null;
      };
      flat('flagstone', PZ.x1 - PZ.x0, PZ.z1 - PZ.z0, cx, Y.pave, cz);
      // 小巷：广场南沿到塔奎兹路人行道之间的空当（9 米宽放不下就窄一点，最窄 3.5 米；压楼就往旁边挪）
      lanes: for (const lw of [9, 7, 5, 3.5])
        for (let x = PZ.x0 + lw / 2; x <= PZ.x1 - lw / 2; x += 0.5) {
          const z1 = zToWalk(x, PZ.z1, 1, 4.5);
          if (z1 === null || z1 - PZ.z1 < 1) continue;
          const lane: Box2 = { x0: x - lw / 2, x1: x + lw / 2, z0: PZ.z1, z1 };
          if (boxBad(lane, 0.2, true).length) continue;
          claim(lane);
          flat('flagstone', lw, lane.z1 - lane.z0, x, Y.pave, (lane.z0 + lane.z1) / 2);
          if (lw >= 7 && lane.z1 - lane.z0 > 6) {
            planter(lane.x0 + 0.9, lane.z1 - 3, true);
            planter(lane.x1 - 0.9, lane.z1 - 3);
          }
          break lanes;
        }
      // 喷泉：一圈池沿（外壁 + 沿顶的环，中间是空的）+ 比池沿低一截的水 + 中间的柱子和小盆
      // （原来池沿是实心圆柱、水面高过池沿，看着是一块蓝色圆饼）
      const fx = cx + Math.min(3, hw - 6);
      const fz = cz + Math.min(2, hd - 6);
      put('cap', new THREE.CylinderGeometry(3.7, 3.8, 0.55, 20, 1, true).translate(fx, 0.275, fz), fx, fz);
      put('cap', new THREE.RingGeometry(3.15, 3.7, 20).rotateX(-Math.PI / 2).translate(fx, 0.55, fz), fx, fz);
      put('water', new THREE.CircleGeometry(3.2, 20).rotateX(-Math.PI / 2).translate(fx, 0.4, fz), fx, fz);
      put('adobe', new THREE.CylinderGeometry(0.45, 0.6, 1.7, 8).translate(fx, 0.85, fz), fx, fz);
      put('cap', new THREE.CylinderGeometry(1.35, 0.9, 0.3, 12).translate(fx, 1.85, fz), fx, fz);
      put('water', new THREE.CircleGeometry(1.15, 12).rotateX(-Math.PI / 2).translate(fx, 2.01, fz), fx, fz);
      put('foam', new THREE.CylinderGeometry(0.16, 0.24, 0.7, 6).translate(fx, 2.0, fz), fx, fz);
      put('foam', new THREE.RingGeometry(1.5, 2.0, 14).rotateX(-Math.PI / 2).translate(fx, 0.412, fz), fx, fz);
      block({ x: fx, z: fz, r: 3.9 });
      // 喷泉旁三条长椅（面朝喷泉；不是四角对称），出了广场的不放
      for (const a of [Math.PI * 0.2, Math.PI * 0.85, Math.PI * 1.45]) {
        const r = 6.6 + (a > 3 ? 0.8 : 0);
        const x = fx + Math.cos(a) * r;
        const z = fz + Math.sin(a) * r;
        if (x > PZ.x0 + 1.5 && x < PZ.x1 - 1.5 && z > PZ.z0 + 1.5 && z < PZ.z1 - 1.5)
          bench(x, z, Math.atan2(fx - x, fz - z));
      }
      // 圆花池里的棕榈：散在广场边上（不成排、大小不一）；投影是广场上的暗块
      for (const [u, v, sc] of [
        [-0.64, -0.73, 1.1],
        [-0.45, -0.14, 0.95],
        [-0.68, 0.55, 1.05],
        [0.6, -0.55, 1.0],
        [0.72, 0.41, 1.15],
      ] as const) {
        const p = at(u, v);
        if (!p || Math.hypot(p[0] - fx, p[1] - fz) < 6) continue;
        addInst('potRound', { x: p[0], z: p[1], s: 1, reg: d.regionOf(p[0], p[1]) });
        palm(p[0], p[1], sc, 0.5);
        block({ x: p[0], z: p[1], r: 1.3 });
      }
      // 市政厅门口的三根旗杆（广场西沿）
      for (const [k, key] of (['clothBlue', 'clothWhite', 'clothRed'] as PalKey[]).entries()) {
        const x = PZ.x0 + 1.6;
        const z = cz - 5 + k * 5;
        if (z < PZ.z0 + 1 || z > PZ.z1 - 2.5) continue;
        bx('metal', 0.18, 8, 0.18, x, 0, z);
        bx(key, 0.1, 1.2, 1.9, x, 6.6, z + 1.0);
        block({ x, z, r: 0.3 });
      }
      // 广场三盏灯
      for (const [u, v] of [
        [-0.32, 0.86],
        [0.55, 0.73],
        [0.1, -0.77],
      ] as const) {
        const p = at(u, v);
        if (p && Math.hypot(p[0] - fx, p[1] - fz) > 4.5) lamp(p[0], p[1], Math.atan2(fx - p[0], fz - p[1]));
      }
    }
    // 市政厅背后（北边）一条 6 米宽的石板路，西接酒店草坪、东接广场
    const back = fit(
      {
        x0: cityhall.x - cityhall.w / 2 - 6,
        x1: PZ ? PZ.x0 : cityhall.x + cityhall.w / 2,
        z0: cityhall.z - cityhall.d / 2 - 7,
        z1: cityhall.z - cityhall.d / 2 - 1,
      },
      8,
      3,
      0.3,
    );
    if (back) {
      claim(back);
      flat('flagstone', back.x1 - back.x0, back.z1 - back.z0, (back.x0 + back.x1) / 2, Y.pave, (back.z0 + back.z1) / 2);
    }
    // 市政厅门前：一块陶砖前庭接到塔奎兹路的人行道（原来是沙地 + 阴影里几团灌木，像一颗颗深绿卷心菜）
    const fz1 = zToWalk(cityhall.x, cityhall.z + cityhall.d / 2, 1, 4.5);
    const front =
      fz1 !== null && fz1 - (cityhall.z + cityhall.d / 2) > 1.5
        ? fit(
            {
              x0: cityhall.x - cityhall.w / 2,
              x1: cityhall.x + cityhall.w / 2,
              z0: cityhall.z + cityhall.d / 2 + 0.05,
              z1: fz1,
            },
            12,
            1.5,
            0,
          )
        : null;
    if (front) {
      claim(front);
      // 陶砖（西班牙复兴式的市政厅门前；整块落在市政厅的影子里，用石板是一片灰紫）
      flat(
        'tile',
        front.x1 - front.x0,
        front.z1 - front.z0,
        (front.x0 + front.x1) / 2,
        Y.pave,
        (front.z0 + front.z1) / 2,
      );
      if (front.z1 - front.z0 > 6) for (const s2 of [-1, 1]) planter(cityhall.x + s2 * 7, front.z0 + 3.5, s2 > 0);
    }
  }
  {
    // 老酒店草坪：酒店和市政厅之间，一块草地 + 一片表演赛场（东西向）+ 北边一排看台（正面朝镜头）。
    // 范围跟着两栋楼走（南北按缩过的间距），压到楼 / 路就收边；放不下的东西不放（球场要 34 × 19，看台再要 9 米）
    const LW = fit(
      {
        x0: hotel.x + hotel.w / 2 + 2,
        x1: cityhall.x - cityhall.w / 2 - 6,
        z0: cityhall.z - 40 * SCALE,
        z1: cityhall.z + 11 * SCALE,
      },
      14,
      10,
    );
    dbgPlaced.lawn = LW;
    if (LW) {
      claim(LW);
      const W = LW.x1 - LW.x0;
      const D = LW.z1 - LW.z0;
      const cx = (LW.x0 + LW.x1) / 2;
      flat('lawn', W, D, cx, Y.pave, (LW.z0 + LW.z1) / 2);
      // 球场靠南放（南边留 5 米给伞），看台在它北边
      // 场边（17 米深）放不下就收到草坪深度 − 0.8（最少 15）；南边够 5 米才放伞
      const court = W >= 34 && D >= 15;
      const sd = Math.min(17, D - 0.8);
      const roomy = D >= 23;
      const stands = court && D >= 28.5;
      const cz = court ? (roomy ? LW.z1 - 5 - 8.5 : (LW.z0 + LW.z1) / 2) : 0;
      if (court) {
        flat('surround', 33, sd, cx, Y.pave2, cz);
        flat('court', 23.77, 10.97, cx, Y.pave3, cz);
        // 线（2 纹素以上宽）：底线、单双打边线、发球线、中线
        const L = (w: number, dd: number, x: number, z: number) => flat('line', w, dd, x, Y.pave4, z);
        for (const s of [-1, 1]) {
          L(0.12, 10.97, cx + s * 11.885, cz);
          L(23.77, 0.12, cx, cz + s * 5.485);
          L(23.77, 0.1, cx, cz + s * 4.115);
          L(0.1, 8.23, cx + s * 6.4, cz);
        }
        L(12.8, 0.1, cx, cz);
        // 网：两根柱子 + 一条暗带（不画网眼）+ 白边
        for (const s of [-1, 1]) bx('ironwork', 0.16, 1.07, 0.16, cx, 0, cz + s * 6.4);
        bx('net', 0.06, 0.9, 12.8, cx, 0.08, cz);
        bx('netTape', 0.1, 0.08, 12.8, cx, 0.98, cz);
        block({ a: [cx, cz - 6.5], b: [cx, cz + 6.5], r: 0.2 });
      }
      if (stands) {
        // 看台：北边三级（朝南，正面是暗带）
        const sz = cz - 8.5 - 2.2;
        for (let k = 0; k < 3; k++) {
          bx('wood', 14, 0.45 * (k + 1), 1.0, cx, 0, sz - k * 1.0 + 1.0);
          bx('seat', 14, 0.1, 0.5, cx, 0.45 * (k + 1), sz - k * 1.0 + 1.15);
        }
        blockRect(cx, sz, 14.2, 3.2);
      }
      // 草坪南边：几把遮阳伞 + 躺椅（酒店的客人），放得下几把放几把
      for (let k = 0; k < 3; k++) {
        const x = LW.x0 + 6 + k * 9;
        const z = LW.z1 - 3.2;
        if (x + 2.5 > LW.x1 || D < 7 || (court && !roomy)) break;
        bx('wood', 0.14, 2.3, 0.14, x, 0, z);
        const key: PalKey = k % 2 ? 'fabricStripe' : 'canvasStripe';
        put(key, new THREE.ConeGeometry(1.5, 0.5, 8).translate(x, 2.35, z), x, z);
        bx('clothWhite', 0.7, 0.3, 1.8, x + 1.3, 0, z + 0.2);
        block({ x, z, r: 0.4 });
        blockRect(x + 1.3, z + 0.2, 0.8, 1.9);
      }
      // 草坪北沿一道矮绿篱（暗带）：碰到楼就断开；看台占了北沿就不种
      if (!stands || cz - 8.5 - 4.5 > LW.z0 + 1.5)
        runsAlong(
          [
            [LW.x0 + 2, LW.z0 + 0.6],
            [LW.x1 - 2, LW.z0 + 0.6],
          ],
          (x, z) => !inBldg(x, z, 0.8),
          (a, b) => {
            const len = b[0] - a[0];
            if (len < 2) return;
            bx('olive', len, 0.8, 0.9, (a[0] + b[0]) / 2, 0, a[1]);
            blockRect((a[0] + b[0]) / 2, a[1], len, 1);
          },
        );
    }
  }
  {
    // 酒店前院：南门口的石板地、门廊（红瓦顶 + 四根柱）、两棵花池里的棕榈
    const f = southOf(hotel);
    const F = fit(
      { x0: hotel.x - hotel.w / 2 - 4, x1: hotel.x + hotel.w / 2 + 2, z0: f.oz + 0.05, z1: f.oz + 15 },
      14,
      6,
      0,
    );
    if (F) {
      claim(F);
      flat('flagstone', F.x1 - F.x0, F.z1 - F.z0, (F.x0 + F.x1) / 2, Y.pave, (F.z0 + F.z1) / 2);
      const px = hotel.x - 8;
      if (F.z1 - f.oz > 7.5 && px - 5.5 > F.x0 && px + 5.5 < F.x1) {
        for (const [dx, dz] of [
          [-4.5, 1],
          [4.5, 1],
          [-4.5, 5.6],
          [4.5, 5.6],
        ] as const) {
          bx('stucco', 0.45, 3.6, 0.45, px + dx, 0, f.oz + dz);
          block({ x: px + dx, z: f.oz + dz, r: 0.35 });
        }
        bx('roofTile', 10.6, 0.4, 7.2, px, 3.6, f.oz + 3.3);
        bx('clothRed', 10.7, 0.25, 7.3, px, 3.5, f.oz + 3.3);
      }
      if (F.z1 - f.oz > 9)
        for (const x of [hotel.x + 3, hotel.x + 14]) {
          if (x + 1.5 > F.x1) continue;
          addInst('potRound', { x, z: f.oz + 7, s: 1, reg: d.regionOf(x, f.oz + 7) });
          palm(x, f.oz + 7, 1.15, 0.5);
          block({ x, z: f.oz + 7, r: 1.3 });
        }
    }
  }
  {
    // 咖啡馆露天座：咖啡馆朝棕榈谷大道那面和大道之间的空地
    const r = roadById('palm_canyon');
    const x1 = cafe.x - cafe.w / 2 - 0.5;
    // 西沿 = 大道路缘外 0.6 米（从咖啡馆往西走到那里；原来写死 x 332）
    let x0 = x1;
    while (x0 > x1 - 40 && distToLine(r.pts, x0 - 0.25, cafe.z) - r.w / 2 > 0.6) x0 -= 0.25;
    let z0 = cafe.z + cafe.d / 2;
    let z1 = cafe.z - cafe.d / 2 - 8;
    // 南北收到两边的店之间
    while (z0 > z1 + 4 && !rectFree((x0 + x1) / 2, z0 - 0.5, x1 - x0, 1, 0, 0.2)) z0 -= 1;
    while (z1 < z0 - 4 && !rectFree((x0 + x1) / 2, z1 + 0.5, x1 - x0, 1, 0, 0.2)) z1 += 1;
    const P: Box2 = { x0, x1, z0: z1, z1: z0 };
    if (z0 - z1 >= 6 && x1 - x0 >= 5 && x0 > x1 - 39 && !boxBad(P, 0.2, true).length) {
      claim(P);
      flat('flagstone', x1 - x0, z0 - z1, (x0 + x1) / 2, Y.pave, (z0 + z1) / 2);
      // 朝路一排花槽（中间留口）
      for (let z = z1 + 1; z <= z0 - 1; z += 2.2) {
        if (Math.abs(z - (z0 + z1) / 2) < 1.4) continue;
        planter(x0 + 0.7, z, rnd() < 0.4);
      }
      // 桌子 + 条纹伞 + 椅子
      let k = 0;
      // 一排错开半格（原来一格一格对齐，像棋盘）
      let row = 0;
      for (let z = z1 + 2.6; z <= z0 - 2.4; z += 4.2, row++)
        for (let x = x0 + 3.2 + (row % 2) * 1.9; x <= x1 - 1.5; x += 3.8) {
          bx('clothWhite', 1.0, 0.1, 1.0, x, 0.72, z);
          bx('ironwork', 0.14, 0.72, 0.14, x, 0, z);
          bx('ironwork', 0.5, 0.5, 0.5, x - 0.9, 0, z);
          bx('ironwork', 0.5, 0.5, 0.5, x + 0.9, 0, z);
          bx('wood', 0.12, 2.4, 0.12, x, 0.82, z);
          const key: PalKey = k++ % 2 ? 'canvasStripe' : 'fabricStripe';
          put(key, new THREE.ConeGeometry(1.45, 0.45, 8).translate(x, 2.85, z), x, z);
          blockRect(x, z, 2.4, 1.0);
        }
      // 门口的小黑板
      bx('ironwork', 0.7, 1.0, 0.25, x0 + 1.8, 0, (z0 + z1) / 2 + 0.6);
    }
  }

  // ══ 3. 停车场（店后面）：沥青 + 车位线 + 几辆车 + 角上一棵棕榈 ═══════
  const lot = (L: Box2, carsN: boolean) => {
    // 车位：carsN = 车头朝南北（车位沿 x 排成行），否则朝东西
    const W = L.x1 - L.x0;
    const D = L.z1 - L.z0;
    claim(L);
    // 浅色水泥地（沙漠里的停车场多是水泥；整片灰沥青在正午是一大块灰，饱和度 0.16）
    flat('concrete', W, D, (L.x0 + L.x1) / 2, Y.pave, (L.z0 + L.z1) / 2);
    // 行：车位 5.5 深、通道 6.5；背靠背的两行中间夹一条 2.4 米的绿化带（草 + 棕榈 + 灌木）：S A S | S A S | S …
    // （原来一整片灰沥青 + 一格格白线，正午饱和度 0.16）
    const across = carsN ? D : W;
    const rows: number[] = [];
    const islands: number[] = [];
    let pos = 0;
    while (pos + 5.5 <= across) {
      rows.push(pos + 2.75);
      pos += 5.5;
      if (rows.length % 2 === 1) pos += 6.5;
      else if (pos + 2.4 + 5.5 <= across) {
        islands.push(pos + 1.2);
        pos += 2.4;
      }
    }
    const len = carsN ? W : D;
    const nStall = Math.floor((len - 1) / 2.8);
    const off = (len - nStall * 2.8) / 2;
    rows.forEach((rr, ri) => {
      // 行朝哪边开进来：偶数行车头朝 +，奇数行朝 −
      const face = ri % 2 === 0 ? 1 : -1;
      for (let k = 0; k <= nStall; k++) {
        const a = off + k * 2.8;
        if (carsN) flat('line', 0.15, 5.0, L.x0 + a, Y.pave2, L.z0 + rr);
        else flat('line', 5.0, 0.15, L.x0 + rr, Y.pave2, L.z0 + a);
        if (k === nStall || rnd() > 0.65) continue;
        const b = a + 1.4;
        if (carsN) car(L.x0 + b, L.z0 + rr, face > 0 ? 0 : Math.PI);
        else car(L.x0 + rr, L.z0 + b, face > 0 ? Math.PI / 2 : -Math.PI / 2);
      }
    });
    for (const c of islands) {
      const il = len - 2;
      const ix = carsN ? (L.x0 + L.x1) / 2 : L.x0 + c;
      const iz = carsN ? L.z0 + c : (L.z0 + L.z1) / 2;
      flat('lawn', carsN ? il : 2.4, carsN ? 2.4 : il, ix, Y.pave2, iz);
      for (const s2 of [-1, 1]) {
        if (carsN) bx('cap', il, 0.15, 0.2, ix, 0, iz + s2 * 1.2);
        else bx('cap', 0.2, 0.15, il, ix + s2 * 1.2, 0, iz);
      }
      blockRect(ix, iz, carsN ? il : 2.6, carsN ? 2.6 : il);
      // 棕榈：间隔 10～15 米不等；中间夹几丛灌木
      for (let u = 3 + rnd() * 3; u < il - 2; u += 10 + rnd() * 5) {
        const px = carsN ? L.x0 + 1 + u : ix;
        const pz = carsN ? iz : L.z0 + 1 + u;
        palm(px, pz, 0.85 + rnd() * 0.25);
        const v = u + 4 + rnd() * 2;
        if (v < il - 2) {
          const wx = carsN ? L.x0 + 1 + v : ix;
          const wz = carsN ? iz : L.z0 + 1 + v;
          addInst('weed', { x: wx, z: wz, s: 1.1 + rnd() * 0.4, rot: rnd() * 6, reg: d.regionOf(wx, wz) });
        }
      }
    }
    // 角上一棵棕榈 + 一盏灯
    palm(L.x1 - 1.2, L.z0 + 1.2, 0.95);
    lamp(L.x0 + 1, L.z1 - 1, carsN ? Math.PI : Math.PI / 2);
  };
  // 位置是缩之前量的（过 S），大小按缩过的间距收：压到楼 / 路就收边，比 14 × 12 还小就不铺
  for (const [b, n] of [
    // 原来"超市的停车场"（464…538, −873…−818）那块现在是五金大超市（第 1b 节）
    [{ x0: 359, x1: 390, z0: -978, z1: -952 }, false], // 咖啡馆背后
    [{ x0: 371, x1: 390, z0: -874, z1: -827 }, false], // 银行背后
    [{ x0: 283, x1: 307, z0: -877, z1: -846 }, false], // 超市背后（原来的五金店）
  ] as const) {
    const L = fit(SB(b), 14, 12, 0.4);
    dbgPlaced[`lot${Object.keys(dbgPlaced).length}`] = L;
    if (L) lot(L, n);
  }

  // ══ 4. 街边：路灯（路缘里侧）、长椅、花槽、垃圾桶 —— 只放在店面之间的空当里 ═══
  {
    const palms: V2[] = [];
    for (const r of ROADS)
      if (r.kind === 'avenue')
        for (const [, p, t] of along(r.pts, 18))
          for (const side of [-1, 1])
            palms.push([p[0] - t[1] * side * (r.w / 2 + 2.2), p[1] + t[0] * side * (r.w / 2 + 2.2)]);
    const nearPalm = (x: number, z: number, r: number) => palms.some((p) => Math.hypot(p[0] - x, p[1] - z) < r);
    const placed: V2[] = [];
    const clear = (x: number, z: number, r: Road, pad: number) =>
      !inBldg(x, z, pad) &&
      roadGap(x, z, r) > 3 &&
      !nearCrossing(x, z, 9) &&
      !inTaken(x, z, 0.6) &&
      !nearPalm(x, z, 1.6) &&
      !placed.some((p) => Math.hypot(p[0] - x, p[1] - z) < 2.2);
    for (const { r, pts, sw } of runs) {
      for (const side of [-1, 1]) {
        let lastLamp = -99;
        let lastBench = -99;
        let gapBench = 24;
        for (const [s, p, t] of along(pts, 1)) {
          const n: V2 = [-t[1] * side, t[0] * side];
          const toRoad = Math.atan2(-n[0], -n[1]);
          // 路灯：路缘里侧 0.9 米，≥ 20 米一盏（灯头伸到路缘上方，不进车道）
          if (s - lastLamp >= 20) {
            const o = r.w / 2 + 0.9;
            const x = p[0] + n[0] * o;
            const z = p[1] + n[1] * o;
            if (clear(x, z, r, 0.3)) {
              lamp(x, z, toRoad);
              placed.push([x, z]);
              lastLamp = s;
            }
          }
          // 长椅 + 垃圾桶 / 花槽：人行道靠店那侧，只在店门口（背后 14 米内有楼），间隔 24～50 米不等
          // （原来空地前面也摆、每 26 米一套，长长一条街一眼看完）
          if (sw >= 3 && s - lastBench >= gapBench) {
            const o = r.w / 2 + sw - 0.9;
            const x = p[0] + n[0] * o;
            const z = p[1] + n[1] * o;
            const shop = [3, 7, 11, 14].some((k) => inBldg(x + n[0] * k, z + n[1] * k, 0.3));
            const ok = shop && [-1.2, 0, 1.2].every((k) => clear(x + t[0] * k, z + t[1] * k, r, 0.4));
            const x2 = x + t[0] * 2.2;
            const z2 = z + t[1] * 2.2;
            if (ok && clear(x2, z2, r, 0.4)) {
              bench(x, z, toRoad);
              if (rnd() < 0.5) {
                addInst('bin', { x: x2, z: z2, s: 1, reg: d.regionOf(x2, z2) });
                block({ x: x2, z: z2, r: 0.35 });
              } else planter(x2, z2, rnd() < 0.5);
              placed.push([x, z], [x2, z2]);
              lastBench = s;
              gapBench = 24 + rnd() * 26;
            }
          }
        }
      }
    }
  }

  // ══ 5. 店面：招牌（按朝向）、朝南的玻璃和门、屋顶空调 ══════════════════
  const SHOPS = SB({ x0: 270, x1: 720, z0: -1110, z1: -770 });
  const shops = BLD.map((b) => b.o).filter(
    (o) =>
      (o.kind === 'shop' || o.kind === 'civic' || o.kind === 'office' || o.kind === 'hotel') &&
      o.x > SHOPS.x0 &&
      o.x < SHOPS.x1 &&
      o.z < SHOPS.z1 &&
      o.z > SHOPS.z0,
  );
  /** 一行"字"：招牌面上几块浅色小块（按词断开） */
  const letters = (f: Face, t0: number, len: number, y: number, h: number, u: number, vertical = false) => {
    const n = Math.max(2, Math.floor(len / 0.55));
    const step = len / n;
    for (let k = 0; k < n; k++) {
      if (rnd() < 0.18 && k > 0 && k < n - 1) continue; // 词和词之间
      const lw = step * (0.55 + rnd() * 0.2);
      if (vertical) fbox(f, 'signPaint', 0.06, step * 0.7, lw, t0, y + h - (k + 0.85) * step, u);
      else fbox(f, 'signPaint', lw, h * 0.5, 0.06, t0 - len / 2 + (k + 0.5) * step, y + h * 0.25, u);
    }
  };
  for (const o of shops) {
    // 三家办事的楼的门面、招牌在第 10 节（白模 → 资产），这里不做
    if (o.id === 'cityhall' || o.id === 'museum' || ERRAND_IDS.has(o.id)) continue;
    const f = frontOf(o);
    const key = o.id === 'bank' ? 'signBoard' : pick(SIGN);
    const named = !!o.name;
    if (!named && rnd() < 0.25) continue;
    if (f.out[1] > 0.7) {
      // 朝南（朝镜头）：玻璃店面 + 门 + 贴墙的招牌
      const bw = Math.min(f.half * 1.3, named ? 11 : 8);
      const y = Math.min(o.h - 1.3, 3.1);
      fbox(f, 'jug', f.half * 1.4, 1.7, 0.1, 0, 0.45, 0.05); // 玻璃（夜里亮，见最后的"夜里"）
      fbox(f, pick(DOOR), 1.2, 2.3, 0.14, f.half * 0.55, 0, 0.07);
      fbox(f, key, bw, 1.0, 0.22, 0, y, 0.12);
      letters(f, 0, bw - 0.8, y, 1.0, 0.26);
    } else if (f.out[1] < -0.7) {
      // 朝北（背对镜头）：屋顶前沿立一块招牌，镜头看得到它的南面
      const bw = Math.min(f.half * 1.3, named ? 11 : 8);
      fbox(f, 'ironwork', 0.18, 0.5, 0.18, -bw / 2 + 0.6, o.h + 0.35, -0.8);
      fbox(f, 'ironwork', 0.18, 0.5, 0.18, bw / 2 - 0.6, o.h + 0.35, -0.8);
      fbox(f, key, bw, 1.3, 0.22, 0, o.h + 0.75, -0.8);
      letters(f, 0, bw - 0.8, o.h + 0.75, 1.3, -0.95);
    } else {
      // 朝东西：伸出来的竖招牌（板面朝南北，镜头看得到）
      const side = f.tan[1] > 0 ? 1 : -1; // 板的朝镜头那面
      const t = (rnd() < 0.5 ? -1 : 1) * f.half * 0.55;
      const tall = named || rnd() < 0.35;
      const h = tall ? 2.6 : 1.3;
      const y = Math.max(2.9, Math.min(o.h - h + 0.6, 3.4));
      fbox(f, 'ironwork', 0.1, 0.12, 1.7, t, y + h, 0.85);
      fbox(f, key, 0.2, h, 1.3, t, y, 0.95);
      if (tall) {
        // 竖着排的字
        const n = Math.max(3, Math.floor(h / 0.5));
        for (let k = 0; k < n; k++)
          fbox(f, 'signPaint', 0.06, 0.32, 0.7, t + side * 0.13, y + h - 0.45 - (k * (h - 0.4)) / n, 0.95);
      } else for (const u of [0.6, 1.3]) fbox(f, 'signPaint', 0.06, 0.55, 0.5, t + side * 0.13, y + 0.38, u);
    }
    // 屋顶空调（一两台）
    const r = o.rot ?? 0;
    const nAc = o.w * o.d > 300 ? 2 : 1;
    for (let k = 0; k < nAc; k++) {
      const lx = (rnd() - 0.5) * (o.w - 3);
      const lz = (rnd() - 0.5) * (o.d - 3);
      const x = o.x + lx * Math.cos(r) + lz * Math.sin(r);
      const z = o.z - lx * Math.sin(r) + lz * Math.cos(r);
      addInst('ac', { x, z, s: 1, y: o.h + 0.35, rot: r, reg: d.regionOf(x, z) });
    }
  }
  // 有名字的几家各一样认得出的东西
  {
    const get = (id: string) => BUILDINGS.find((o) => o.id === id) as Bldg;
    // 广场剧院：朝阿莱霍路的大雨棚（灯泡边）+ 角上一根高过屋顶的竖招牌
    const th = get('theater');
    const tf = frontOf(th);
    // 雨棚只伸出 1.4 米（剧院离阿莱霍路很近，原来 3 米深的雨棚伸到了车道上方）
    fbox(tf, 'signPaint', th.w * 0.7, 0.9, 1.4, 0, 3.4, 0.7);
    fbox(tf, 'flowerYellow', th.w * 0.7 + 0.2, 0.2, 1.6, 0, 4.3, 0.7);
    fbox(tf, 'carRed', 1.3, 7.5, 0.3, th.w / 2 - 1.6, 4.6, 0.4);
    for (let k = 0; k < 6; k++) fbox(tf, 'flowerYellow', 0.7, 0.6, 0.1, th.w / 2 - 1.6, 11.2 - k * 1.15, 0.6);
    for (const s of [-1, 1]) fbox(tf, 'flowerYellow', 1.2, 1.7, 0.1, s * th.w * 0.42, 0.7, 0.05); // 海报框
    // 银行：门口四根柱 + 街角一座老钟
    const bk = get('bank');
    const bf = frontOf(bk);
    for (const s of [-1.5, -0.5, 0.5, 1.5]) {
      fbox(bf, 'stucco', 0.7, bk.h - 0.6, 0.7, s * 2.6, 0, 1.2);
      const [x, z] = fp(bf, s * 2.6, 1.2);
      block({ x, z, r: 0.5 });
    }
    fbox(bf, 'stucco', 11.5, 0.6, 2.2, 0, bk.h - 0.6, 1.1);
    // 餐馆：一根高杆上斜着的"太空时代"招牌
    const dn = get('diner');
    const df = frontOf(dn);
    {
      const [x, z] = fp(df, dn.w / 2 + 1.5, 1.5);
      bx('ironwork', 0.25, 7.5, 0.25, x, 0, z);
      const g = box(3.6, 1.6, 0.25, 0, 0, 0).rotateZ(0.28).translate(0, 6.6, 0);
      put('clothTeal', g.translate(x, 0, z), x, z);
      put('flowerYellow', new THREE.OctahedronGeometry(0.8, 0).translate(x + 1.9, 8.2, z), x, z);
      block({ x, z, r: 0.3 });
    }
    // 超市（2026-11-16 和五金店对调，在原来五金店那块）：门口的购物车棚
    const mk = get('market');
    const mf = frontOf(mk);
    fbox(mf, 'metal', 4, 1.0, 1.4, mk.w * 0.3, 0, 2);
    {
      const [x, z] = fp(mf, mk.w * 0.3, 2);
      blockRect(x, z, 4.2, 1.6, fRot(mf));
    }
    // 老酒店：屋顶一排大字（老招牌的铁架）
    for (let k = 0; k < 5; k++)
      bx('carRed', 1.4, 2.0, 0.3, hotel.x - 5 + k * 2.5, hotel.h + 0.35, hotel.z + hotel.d / 2 - 1.5);
    bx('ironwork', 13, 0.25, 0.2, hotel.x, hotel.h + 0.35, hotel.z + hotel.d / 2 - 1.75);
    // 市政厅：朝南的大门（拱门的暗洞 + 台阶）
    const cf = southOf(cityhall);
    fbox(cf, 'ironwork', 4, 3.2, 0.1, 0, 0, 0.05);
    fbox(cf, 'cap', 7, 0.3, 2.2, 0, 0, 1.1);
  }

  // ══ 6. 老街区：拉斯帕尔马斯、电影人街区、球拍俱乐部路 ══════════════
  {
    const hs = houses().filter((o) => /^(las_palmas|movie_colony|racquet)/.test(o.id));
    for (const o of hs) {
      const f = frontOf(o);
      const gap = roadGap(f.ox, f.oz);
      const yard = Math.min(Math.max(gap - 0.8, 2.5), 9);
      const cs = rnd() < 0.5 ? -1 : 1; // 车棚在哪边
      const wallKey: PalKey = pick(['stucco', 'stucco', 'adobe', 'flagstone']);
      /** 立面坐标里的一段（t0 → t1，离墙 u）整段都空着（不压楼、不压路） */
      const segFree = (t0: number, t1: number, u: number, pad: number) => {
        const n = Math.max(2, Math.ceil(Math.abs(t1 - t0) / 0.5));
        for (let k = 0; k <= n; k++) {
          const [x, z] = fp(f, t0 + ((t1 - t0) * k) / n, u);
          if (!free(x, z, pad)) return false;
        }
        return true;
      };
      // 车棚：屋子侧面一块平顶（贴着墙，原来离墙 0.4 米悬着）+ 外侧两根柱；一半有车
      const cpT = cs * (f.half + 3);
      const [cpx, cpz] = fp(f, cpT, -2.5);
      const [ckx, ckz] = fp(f, cs * (f.half + 3.4), -2.5);
      /** 立面坐标里的矩形（t 方向宽 w、u 方向深 dd）的外接框：占掉，后面的老场子、泳池躲开 */
      const claimF = (t: number, u: number, w: number, dd: number) => {
        const c = [-0.5, 0.5].flatMap((a) => [-0.5, 0.5].map((b) => fp(f, t + a * w, u + b * dd)));
        claim({
          x0: Math.min(...c.map((p) => p[0])),
          x1: Math.max(...c.map((p) => p[0])),
          z0: Math.min(...c.map((p) => p[1])),
          z1: Math.max(...c.map((p) => p[1])),
        });
      };
      const hasCarport = rectFree(ckx, ckz, 5.2, 6.6, fRot(f), 0.2) && !inTaken(ckx, ckz, 3) && rnd() < 0.7;
      if (hasCarport) {
        fbox(f, 'concrete', 6, 0.22, 6.8, cpT, 2.5, -2.5);
        claimF(cpT, -2.5, 6, 6.8);
        for (const u of [-5.4, 0.6]) {
          fbox(f, 'ironwork', 0.18, 2.5, 0.18, cpT + cs * 2.7, 0, u);
          const [x, z] = fp(f, cpT + cs * 2.7, u);
          block({ x, z, r: 0.2 });
        }
        if (rnd() < 0.55) car(cpx, cpz, Math.atan2(f.out[0], f.out[1]));
        // 车道：车棚到路边（路面盖住伸进路的那一截）
        if (segFree(cpT - 1.6, cpT + 1.6, yard * 0.5, 0) && segFree(cpT - 1.6, cpT + 1.6, yard - 0.5, 0)) {
          const [dx, dz] = fp(f, cpT, yard / 2 + 0.6);
          flat('concrete', 4, yard + 1.2, dx, Y.pave, dz, fRot(f));
        }
      }
      // 朝路的矮墙（中间留门口；车道那边断开）：南面朝镜头就是一条暗带。整段都要空着（原来只看中点，拐角处的墙伸进了路）
      if (rnd() < 0.75) {
        const u = yard;
        const end = cs * (f.half + (hasCarport ? 0.6 : 2));
        const far = -cs * (f.half + 1.5);
        let any = false;
        for (const [a, b] of [
          [far, -cs * 0.9],
          [cs * 0.9, end],
        ] as const) {
          const t = (a + b) / 2;
          const len = Math.abs(b - a);
          if (len < 1 || !segFree(a, b, u, 0.6)) continue;
          fbox(f, wallKey, len, 0.85, 0.3, t, 0, u);
          fbox(f, 'cap', len + 0.1, 0.1, 0.4, t, 0.85, u);
          const [ax, az] = fp(f, a, u);
          const [bx2, bz] = fp(f, b, u);
          block({ a: [ax, az], b: [bx2, bz], r: 0.25 });
          any = true;
        }
        // 门口的石板小路（有墙才有）
        if (any) {
          const [wx, wz] = fp(f, 0, u / 2);
          flat('flagstone', 1.3, u, wx, Y.pave2, wz, fRot(f));
        }
      }
      // 前院一半是草坪（老街区浇得起水；门口小路压在草上面一层）
      if (yard > 3.5 && rnd() < 0.5) {
        const lw = f.half * 2 - 1;
        const [lx, lz] = fp(f, 0, yard / 2);
        if (segFree(-lw / 2, lw / 2, yard / 2, 0.3) && segFree(-lw / 2, lw / 2, yard - 0.8, 0.3))
          flat('lawn', lw, yard - 1.4, lx, Y.pave, lz, fRot(f));
      }
      // 彩色的门（朝南的才看得见）
      if (f.out[1] > 0.3) fbox(f, pick(DOOR), 1.1, 2.2, 0.12, -cs * 0.5, 0, 0.06);
      // 朝南那面的窗（暗玻璃两块）
      const sf = southOf(o);
      if (sf.out[1] > 0.5)
        for (const s of [-1, 1])
          fbox(
            sf,
            rnd() < 0.6 ? 'jug' : 'ironwork',
            Math.min(2.6, sf.half * 0.6),
            1.2,
            0.08,
            s * sf.half * 0.5,
            0.9,
            0.04,
          );
      // 后院泳池（俯视下的一块蓝，最"棕榈泉"）：池沿是一圈（四条），水面比池沿低一截
      // （原来池沿是一整块实心板、水面高过池沿 1 厘米，像一块蓝色的板子摆在地上）
      if (rnd() < 0.55) {
        const u = -2 * f.depth - 4;
        const t = -cs * 1.5;
        const [x, z] = fp(f, t, u);
        if (rectFree(x, z, 9.5, 6, fRot(f), 0.3) && !inTaken(x, z, 5)) {
          claimF(t, u, 10, 6.4);
          const [px, pz] = fp(f, t, u);
          flat('concrete', 10, 6.4, px, Y.pave, pz, fRot(f));
          flat('water', 7.8, 4.0, px, 0.1, pz, fRot(f));
          for (const s of [-1, 1]) {
            fbox(f, 'cap', 8.4, 0.16, 0.3, t, 0, u + s * 2.15);
            fbox(f, 'cap', 0.3, 0.16, 4.0, t + s * 4.05, 0, u);
          }
          if (rnd() < 0.5) fbox(f, 'clothWhite', 0.7, 0.3, 1.8, t + 4.6, 0, u);
          blockRect(x, z, 8.4, 4.6, fRot(f));
        }
      }
      // 院子：一棵棕榈（不在车棚那边）、一两丛龙舌兰
      if (rnd() < 0.6) {
        const [x, z] = fp(f, -cs * (f.half + 1.2), yard * 0.55);
        if (free(x, z, 1)) palm(x, z, 0.85 + rnd() * 0.3);
      }
      for (let k = 0; k < 2; k++) {
        if (rnd() < 0.5) continue;
        // 不种在门口的石板小路上（|t| < 1.2）
        const t = (rnd() < 0.5 ? -1 : 1) * (1.4 + rnd() * Math.max(0.2, f.half * 0.8 - 1.4));
        const [x, z] = fp(f, t, 1.2 + rnd() * (yard - 2));
        if (free(x, z, 0.5)) addInst('agave', { x, z, s: 0.8 + rnd() * 0.5, rot: rnd() * 6, reg: d.regionOf(x, z) });
      }
      if (rnd() < 0.5) {
        const lx = (rnd() - 0.5) * (o.w - 3);
        const lz = (rnd() - 0.5) * (o.d - 3);
        const r = o.rot ?? 0;
        const x = o.x + lx * Math.cos(r) + lz * Math.sin(r);
        const z = o.z - lx * Math.sin(r) + lz * Math.cos(r);
        addInst('ac', { x, z, s: 0.85, y: o.h + 0.35, rot: r, reg: d.regionOf(x, z) });
      }
    }
  }

  // ══ 7. 废弃的球拍俱乐部（发现点）════════════════════════════════════
  {
    const rc = BUILDINGS.find((o) => o.id === 'racquet_club') as Bldg;
    const sf = southOf(rc);
    // 朝南的立面：褪色的长招牌（一头掉下来斜挂着）、钉了木板的窗、墙上的老海报
    fbox(sf, 'woodWeathered', 11, 1.2, 0.2, 0, 3.4, 0.15, 0.12);
    for (let k = 0; k < 8; k++) fbox(sf, 'rust', 0.6, 0.55, 0.06, -4.6 + k * 1.25, 3.62 + k * 0.15, 0.28);
    for (const t of [-10, -5.5, 5.5, 10]) {
      fbox(sf, 'ironwork', 2.2, 1.4, 0.06, t, 1.0, 0.03);
      fbox(sf, 'woodWeathered', 2.6, 0.25, 0.12, t, 1.6, 0.1, 0.45);
      fbox(sf, 'woodWeathered', 2.6, 0.25, 0.12, t, 1.6, 0.1, -0.4);
    }
    fbox(sf, 'ironwork', 1.6, 2.4, 0.06, 0, 0, 0.03); // 门洞
    fbox(sf, 'flowerYellow', 0.9, 1.3, 0.05, 2.2, 1.1, 0.04); // 老海报
    fbox(sf, 'clothRed', 0.8, 1.1, 0.05, 3.3, 1.2, 0.04);
    // 老场子：在俱乐部旁边找一块空地（先北边，再东、西、南）
    const W = 28;
    const D = 14;
    let site: V2 | null = null;
    // 先找南边（楼前，镜头看得全），再北边（往北多挪几米，楼的立面不挡住场子），最后东西两边
    for (const [dx, dz] of [
      [0, rc.d / 2 + D / 2 + 1],
      [0, -(rc.d / 2 + D / 2 + 5)],
      [0, -(rc.d / 2 + D / 2 + 3)],
      [0, -(rc.d / 2 + D / 2 + 1)],
      [rc.w / 2 + W / 2 + 1, 0],
      [-(rc.w / 2 + W / 2 + 1), 0],
    ] as const) {
      for (let k = 0; k < 12 && !site; k++) {
        const x = rc.x + dx + (k % 2 ? 1 : -1) * Math.floor(k / 2) * 1.5;
        const z = rc.z + dz;
        if (!boxBad({ x0: x - W / 2, x1: x + W / 2, z0: z - D / 2, z1: z + D / 2 }, 0.2, true).length) site = [x, z];
      }
      if (site) break;
    }
    if (site) {
      const [cx, cz] = site;
      claim({ x0: cx - W / 2 - 1, x1: cx + W / 2 + 1, z0: cz - D / 2 - 1, z1: cz + D / 2 + 1 });
      flat('surroundCrack', W, D, cx, Y.pave, cz);
      flat('courtBleach', 23.77, 10.97, cx, Y.pave2, cz);
      // 线：褪了一半，有的段没了
      const seg = (w: number, dd: number, x: number, z: number) => {
        if (rnd() < 0.3) return;
        flat('line', w, dd, x, Y.pave3, z);
      };
      for (const s of [-1, 1]) {
        seg(0.12, 10.97, cx + s * 11.885, cz);
        for (const h of [-1, 1]) seg(11.8, 0.12, cx + h * 5.95, cz + s * 5.485);
        seg(0.1, 8.23, cx + s * 6.4, cz);
      }
      // 裂缝：三条 2 纹素宽的折线（缝 + 下沿一条亮边）、裂缝里的杂草
      for (let c = 0; c < 3; c++) {
        let x = cx - 10 + rnd() * 20;
        let z = cz - 5;
        let a = Math.PI / 2 + (rnd() - 0.5) * 0.8;
        for (let k = 0; k < 7; k++) {
          const L = 1.2 + rnd() * 1.2;
          const nx = x + Math.cos(a) * L;
          const nz = z + Math.sin(a) * L;
          const rot = Math.atan2(nx - x, nz - z);
          flat('courtCrack', 0.1, L + 0.05, (x + nx) / 2, Y.pave4, (z + nz) / 2, rot);
          // 下沿一条亮边（翘起来的漆皮迎光）：垫在缝底下、往南挪一点，只露出南边那一纹素
          flat('line', 0.1, L, (x + nx) / 2, Y.pave3, (z + nz) / 2 + 0.06, rot);
          if (rnd() < 0.4)
            addInst('weed', { x: nx, z: nz, s: 0.5 + rnd() * 0.5, rot: rnd() * 6, reg: d.regionOf(nx, nz) });
          x = nx;
          z = nz;
          a += (rnd() - 0.5) * 1.1;
        }
      }
      // 吹进来的沙（两三块）
      for (let k = 0; k < 3; k++) {
        const x = cx + (rnd() - 0.5) * 22;
        const z = cz + (rnd() - 0.5) * 9;
        put(
          'sand',
          new THREE.CircleGeometry(0.9 + rnd() * 0.9, 9)
            .rotateX(-Math.PI / 2)
            .scale(1.6, 1, 1)
            .translate(x, Y.pave4 + 0.012, z),
          x,
          z,
        );
      }
      // 网：一根柱子歪了，网塌下来一半
      bx('rust', 0.16, 1.07, 0.16, cx, 0, cz - 6.4);
      put(
        'rust',
        box(0.16, 1.07, 0.16, 0, 0, 0)
          .rotateX(0.5)
          .translate(cx, 0, cz + 6.4),
        cx,
        cz,
      );
      put('net', box(0.06, 0.8, 12.8, 0, 0, 0).rotateX(-0.06).translate(cx, 0.12, cz), cx, cz);
      block({ a: [cx, cz - 6.5], b: [cx, cz + 6.5], r: 0.2 });
      // 围网：一圈锈柱子，北、东、西三面还挂着暗带，南面倒了（一片躺在地上），几处柱子没了
      const fx0 = cx - W / 2 + 0.3;
      const fx1 = cx + W / 2 - 0.3;
      const fz0 = cz - D / 2 + 0.3;
      const fz1 = cz + D / 2 - 0.3;
      const fence = (a: V2, b: V2, standing: number) => {
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const n = Math.round(L / 3);
        const rot = Math.atan2(b[0] - a[0], b[1] - a[1]);
        for (let k = 0; k <= n; k++) {
          const x = a[0] + ((b[0] - a[0]) * k) / n;
          const z = a[1] + ((b[1] - a[1]) * k) / n;
          if (rnd() < 0.18) continue;
          const lean = rnd() < 0.2 ? (rnd() - 0.5) * 0.6 : 0;
          put('rust', box(0.16, 3, 0.16, 0, 0, 0).rotateX(lean).rotateY(rot).translate(x, 0, z), x, z);
          block({ x, z, r: 0.2 });
          if (k === n) continue;
          const mx = x + (b[0] - a[0]) / n / 2;
          const mz = z + (b[1] - a[1]) / n / 2;
          if (rnd() < standing) {
            put(
              'net',
              box(0.06, 2.4, L / n - 0.2, 0, 0.4, 0)
                .rotateY(rot)
                .translate(mx, 0, mz),
              mx,
              mz,
            );
            block({ a: [x, z], b: [x + (b[0] - a[0]) / n, z + (b[1] - a[1]) / n], r: 0.15 });
          } else if (rnd() < 0.4)
            put(
              'net',
              new THREE.PlaneGeometry(L / n - 0.3, 2.2)
                .rotateX(-Math.PI / 2)
                .rotateY(rot + Math.PI / 2)
                .translate(mx + 0.4, Y.pave4 + 0.024, mz + 0.9),
              mx,
              mz,
            );
        }
      };
      fence([fx0, fz0], [fx1, fz0], 0.7);
      fence([fx0, fz0], [fx0, fz1], 0.6);
      fence([fx1, fz0], [fx1, fz1], 0.6);
      fence([fx0, fz1], [fx1, fz1], 0.12);
      // 一把散了架的长椅
      bx('woodWeathered', 1.9, 0.12, 0.5, cx - 8, 0.0, cz + D / 2 + 1.2, 0.3);
      blockRect(cx - 8, cz + D / 2 + 1.2, 2, 0.8, 0.3);
    }
    // 干掉的泳池：俱乐部另一边（剥落的蓝底 + 沙 + 池沿）
    for (const [dx, dz] of [
      [rc.w / 2 + 6, 0],
      [-(rc.w / 2 + 6), 0],
      [0, rc.d / 2 + 6],
    ] as const) {
      const x = rc.x + dx;
      const z = rc.z + dz;
      const pw = dx ? 7 : 12;
      const pd = dx ? 12 : 7;
      if (
        boxBad({ x0: x - pw / 2 - 0.8, x1: x + pw / 2 + 0.8, z0: z - pd / 2 - 0.8, z1: z + pd / 2 + 0.8 }, 0.2, true)
          .length
      )
        continue;
      claim({ x0: x - pw / 2 - 1, x1: x + pw / 2 + 1, z0: z - pd / 2 - 1, z1: z + pd / 2 + 1 });
      // 池沿一圈（四条）+ 池底 + 北边一条暗带（看得见的那面池壁）+ 吹进来的一堆沙
      // （原来池沿是一整块实心板、池底铺在板顶上，看着是一块浅蓝的垫子）
      for (const s of [-1, 1]) {
        bx('cap', pw + 1.2, 0.2, 0.6, x, 0, z + s * (pd / 2 + 0.3));
        bx('cap', 0.6, 0.2, pd, x + s * (pw / 2 + 0.3), 0, z);
      }
      flat('courtBleach', pw, pd, x, Y.pave, z);
      flat('courtCrack', pw, 0.9, x, Y.pave2, z - pd / 2 + 0.45);
      put(
        'sand',
        new THREE.CircleGeometry(Math.min(pw, pd) * 0.35, 8)
          .rotateX(-Math.PI / 2)
          .scale(1.3, 1, 1)
          .translate(x + 0.8, Y.pave3, z + pd * 0.2),
        x,
        z,
      );
      blockRect(x, z, pw + 1.2, pd + 1.2);
      break;
    }
    // 门口两棵没人修剪的棕榈（垂着的枯叶裙）
    for (const s of [-1, 1]) {
      const [x, z] = fp(sf, s * (sf.half + 2), 3);
      if (!free(x, z, 0.8)) continue;
      palm(x, z, 1.15);
      put('palmSkirt', new THREE.CylinderGeometry(0.9, 0.5, 2.4, 6).translate(x, 8.1 * 1.15 - 1.1, z), x, z);
    }
  }

  // ══ 8. 111 号公路的加油站 ═════════════════════════════════════════
  {
    const gs = BUILDINGS.find((o) => o.id === 'gas') as Bldg;
    const cx = gs.x;
    const cz = gs.z + 14; // 雨棚（build.ts 画的顶）
    // 前场水泥地 + 接到加油站支路尽头的一段（原来前场和路不连着，四周一圈沙）
    const FC = fit({ x0: cx - 17, x1: cx + 17, z0: gs.z + gs.d / 2 + 0.05, z1: cz + 11 }, 18, 10, 0.3);
    if (FC) {
      claim(FC);
      flat('concrete', FC.x1 - FC.x0, FC.z1 - FC.z0, (FC.x0 + FC.x1) / 2, Y.pave, (FC.z0 + FC.z1) / 2);
    }
    const spur = roadById('gas_spur');
    const end = spur.pts[spur.pts.length - 1];
    {
      const x0 = end[0] - 7;
      const x1 = end[0] + 2;
      const z0 = end[1] - 1;
      const z1 = cz - 8;
      if (x1 > x0 && z1 > z0) {
        d.clear({ x0, x1, z0, z1 });
        flat('concrete', x1 - x0, z1 - z0, (x0 + x1) / 2, Y.pave2, (z0 + z1) / 2);
      }
    }
    // 雨棚：四根柱 + 红色的边（盖住 build.ts 那块雨棚板的四个侧面，顶面还是它的）
    for (const [dx, dz] of [
      [-6.5, -3],
      [6.5, -3],
      [-6.5, 3],
      [6.5, 3],
    ] as const) {
      bx('stucco', 0.5, 4.5, 0.5, cx + dx, 0, cz + dz);
      block({ x: cx + dx, z: cz + dz, r: 0.35 });
    }
    bx('clothRed', 16.2, 0.42, 10.2, cx, 4.52, cz);
    // 夜里雨棚底下亮着（一个大灯光圈，见最后的"夜里"）
    lampPools.push({ x: cx, z: cz + 2, reg: d.regionOf(cx, cz), r: 10, h: 4.4 });
    // 两个加油岛，各两台加油机
    for (const ix of [-3.2, 3.2]) {
      bx('concrete', 1.4, 0.22, 6.2, cx + ix, 0, cz);
      for (const dz of [-1.6, 1.6]) {
        bx('clothRed', 0.8, 1.7, 0.6, cx + ix, 0.22, cz + dz);
        bx('clothWhite', 0.86, 0.3, 0.66, cx + ix, 1.92, cz + dz);
        bx('ironwork', 0.5, 0.35, 0.08, cx + ix, 1.3, cz + dz + 0.32);
      }
      blockRect(cx + ix, cz, 1.4, 6.2);
    }
    // 一辆车停在油枪旁边
    car(cx - 6.2 + 1.2, cz + 0.5, 0, 'clothTeal');
    // 店面朝南：玻璃 + 门 + 招牌；门口冰柜、充气机
    const f = southOf(gs);
    fbox(f, 'jug', gs.w * 0.6, 1.7, 0.1, -2, 0.45, 0.05);
    fbox(f, 'clothBlue', 1.2, 2.3, 0.14, 6, 0, 0.07);
    fbox(f, 'clothRed', 9, 1.0, 0.22, -1, 3.4, 0.12);
    letters(f, -1, 8, 3.4, 1.0, 0.26);
    fbox(f, 'clothWhite', 1.8, 1.1, 0.8, 3, 0, 0.6);
    fbox(f, 'clothBlue', 1.2, 0.3, 0.05, 3, 0.55, 1.02);
    {
      const [x, z] = fp(f, 3, 0.6);
      blockRect(x, z, 1.9, 0.9);
    }
    // 价格牌：高杆 + 红牌 + 三条白色价格条（朝南；原来 3 × 3 的白方块像一扇窗）
    const px = cx - 15;
    const pz = cz + 7;
    bx('metal', 0.35, 5.5, 0.35, px, 0, pz);
    bx('clothRed', 3.2, 3.0, 0.3, px, 5.5, pz);
    bx('clothWhite', 3.0, 0.6, 0.32, px, 7.9, pz);
    for (let k = 0; k < 3; k++) bx('signPaint', 2.4, 0.42, 0.34, px, 5.85 + k * 0.68, pz);
    block({ x: px, z: pz, r: 0.35 });
    // 路边一个充气机（黄）
    bx('flowerYellow', 0.6, 1.2, 0.5, cx + 13, 0, cz + 2);
    block({ x: cx + 13, z: cz + 2, r: 0.45 });
  }

  for (const { g, key, items, cast } of inst.values()) if (items.length) d.instance(g, key, items, cast);

  // ══ 9. 夜里：路灯头、招牌的字、店面和住家的窗（jug）换成自发光的暖白，每盏灯一个灯光圈（clubsite/daylight 找 userData.night）═══
  // 锁着的区域（build.ts 换了压暗的材质）不开灯：看那片区域的网格现在是不是原色材质
  {
    /** 原色材质 + 自发光（clone 不带 onBeforeCompile、程序键；userData 里描边用的法线材质会被 JSON 走一遍丢掉，都补上） */
    const glowOf = (key: PalKey, emissive: number) => {
      const base = d.mat(key) as THREE.MeshToonMaterial;
      const m = base.clone();
      m.onBeforeCompile = base.onBeforeCompile;
      m.customProgramCacheKey = base.customProgramCacheKey;
      m.userData = { ...base.userData };
      m.emissive = new THREE.Color(emissive);
      return m;
    };
    // 灯光圈：town 自己的 + 三栋办事楼的（sites/，停车场高杆灯、路灯）
    const pools = [...lampPools, ...siteState(d).pools];
    // 灯头、招牌的字：暖白；窗：暖橙（同一个白色太刺眼，像一块白板）
    const glow = glowOf('signPaint', 0x6a5a30);
    const glowWin = glowOf('straw', 0x5a4424);
    let on = false;
    const lit = new Set<string>();
    const regionLit = (reg: string) => {
      let ok = false;
      d.root.traverse((o) => {
        if (ok || !(o as THREE.Mesh).isMesh || !o.name.startsWith(`valley:${reg}:`)) return;
        const key = o.name.split(':')[2] as PalKey;
        const m = (o as THREE.Mesh).material;
        if (m === d.mat(key) || m === glow || m === glowWin) ok = true;
      });
      return ok;
    };
    const lights = new THREE.Group();
    lights.name = 'valley:town:lights';
    lights.userData.roadSkipped = skipped;
    lights.userData.placed = dbgPlaced; // 车道守卫拦下的件数（调试看）
    lights.userData.night = {
      setOn(v: boolean) {
        on = v;
        lit.clear();
        for (const reg of new Set(pools.map((p) => p.reg))) if (regionLit(reg)) lit.add(reg);
        d.root.traverse((o) => {
          const m = o as THREE.Mesh;
          const hit = /^valley:([^:]+):(signPaint|jug)(:inst)?$/.exec(o.name);
          if (!hit || !lit.has(hit[1])) return;
          const day = d.mat(hit[2] as PalKey);
          const night = hit[2] === 'jug' ? glowWin : glow;
          if (m.material === day || m.material === night) m.material = on ? night : day;
        });
      },
    };
    for (const p of pools) {
      const o = new THREE.Object3D();
      const pool: [number, number, number, number] = [p.x, p.z, p.r ?? 4.8, p.h ?? 4.6];
      const none: [number, number, number, number] = [p.x, p.z, 0, 0];
      o.userData.night = { pool: () => (on && lit.has(p.reg) ? pool : none) };
      lights.add(o);
    }
    d.root.add(lights);
  }
}

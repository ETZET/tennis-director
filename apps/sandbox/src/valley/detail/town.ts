// valley 细节：小镇的街（主街、横街、后街）：人行道、路缘、路口斑马线、路面标线、行道棕榈 + 路灯、花池、长椅，
// 主街南边的车位和后院墙，夜里开灯。
// 六家店自己的门面、院子在 detail/sites/（先跑，占的地记在 siteState 里，这里的街边家具躲开）；住宅的院子在 south.ts。
// 2026-11-21 小镇压紧：老街区、喷泉广场、老酒店草坪、咖啡馆露天座、店后的停车场、通用铺面的招牌、球拍俱乐部、加油站都删了。
// 2026-11-21 精细化（街区代理，批判清单 C1 C3 C5 C9 C14 / M1 M6 M12 M13 M14）：
//   市中心的地铺满萨尔蒂略陶砖（人行道铺到楼脚、店间、楼后）+ adobe 矮边方花池；主街人行道、路缘、行道棕榈铺到 x 626；
//   棕榈 18 米一棵（方树坑）、路灯在两棵中间、两边错开；横街两排棕榈 + 花槽 + 路口大花盆；主街双黄中线、停止线、补丁、井盖；
//   车位一格一条 2 纹素漆线、车换六种颜色；车位后面一道连续的后院墙（灰泥 + 花砖段 + 九重葛）。
// 接口见 build.ts 的 DetailCtx。只改这个文件。坐标都是世界坐标（米）。
// 线和杆都 ≥ 2 纹素（小镇里镜头拉近到 0.75：1 纹素 = 0.034 米、1 屏幕行 = 0.048 米）；白线是强边缘大户，只放在路口和车位。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { build as buildAgave } from '../../clubsite/nature/agave';
import { build as buildBarrel } from '../../clubsite/nature/barrel-cactus';
import type { Shape } from '../../clubsite/play';
import { box } from '../../clubsite/render/geo';
import type { ToonOpts } from '../../clubsite/render/toon';
import { bldgPoly, type DetailCtx, palmCrownGeo, rbox, ribbon } from '../build';
import {
  along,
  BUILDINGS_RAW as BUILDINGS,
  distToLine,
  housesRaw as houses,
  inPoly,
  ROADS,
  type Road,
  SITES_RAW as SITES,
  type V2,
} from '../layout';
import { TOWN_EL } from '../palette';
import type { PalKey } from '../reuse';
import { FRAMES, keepScale, TOWN_K } from '../townscale';
import { hitsRoad, siteState, Y } from './sites/kit';

interface Box2 {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/** 小镇里的 1 纹素（米）：默认 0.045 × main.ts 的 TOWN_ZOOM 0.75 */
const TX = 0.045 * 0.75;
/** 1 屏幕行（沿 z 的米数）：俯 45° 下 z 方向一纹素 = TX / cos45 */
const ROWZ = TX / Math.SQRT1_2;
/** 小件按原尺寸写，townWrap 乘 K（townscale.ts）；要它缩完正好多大就写 目标 / K */
const K = TOWN_K;
/** 市中心铺满的陶砖底（垫在人行道 Y.walk、车道 0.03 的下面；店的铺面、广场在 Y.pave 往上盖） */
const Y_BASE = 0.01;
/** 路面上的东西（车道 0.03 之上，斑马线 0.045）：补丁、标线 / 井盖各一层，叠着的差 ≥ 0.01 */
const Y_PATCH = 0.05;
const Y_MARK = 0.06;

const STREETS = ROADS.filter((r) => r.kind !== 'trail');
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
/** 合并前统一：不带索引、只留 position + normal */
function prepG(g: THREE.BufferGeometry, keepColor = false): THREE.BufferGeometry {
  const o = g.index ? g.toNonIndexed() : g;
  for (const a of Object.keys(o.attributes))
    if (a !== 'position' && a !== 'normal' && !(keepColor && a === 'color')) o.deleteAttribute(a);
  if (!o.attributes.normal) o.computeVertexNormals();
  return o;
}
/** 一团（球面法线，细分 1：不是面法线的多面体）；sx sy sz 压成椭球 */
function blob(r: number, sx = 1, sy = 1, sz = 1, detail = 1): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(r, detail);
  const p = g.attributes.position as THREE.BufferAttribute;
  const n = g.attributes.normal as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i), p.getY(i), p.getZ(i)).normalize();
    n.setXYZ(i, v.x, v.y, v.z);
  }
  return g.scale(sx, sy, sz);
}
/** 资产（clubsite/nature）拆成按网格序号的几何（本地坐标，世界矩阵烘进去），拿去实例化 */
function assetParts(obj: THREE.Object3D): THREE.BufferGeometry[] {
  obj.updateMatrixWorld(true);
  const out: THREE.BufferGeometry[] = [];
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    out.push(prepG(m.geometry.clone().applyMatrix4(m.matrixWorld)));
  });
  return out;
}

// 平铺层的高度（Y）、车道守卫（hitsRoad）在 sites/kit.ts（三栋办事楼也用）

export function detailTown(d: DetailCtx): void {
  const rnd = d.rng('valley:town');
  // ── 车道守卫：离地 0.12～4.5 米（路缘 0.1 米高不算）的东西，有一个顶点落进任何一条车道（半宽以内）就整件不放（高处的树冠、招牌可以伸过去）──
  let skipped = 0;
  /** 调试：主角块放下了没有、放在哪（lights.userData.placed） */
  const dbgPlaced: Record<string, Box2 | number | null> = {};
  /** 调试：这个文件放了多少三角形（烘进区域桶的 + 自己的网格），lights.userData.placed.tris */
  let tris = 0;
  const count = (g: THREE.BufferGeometry) => {
    tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
  };
  const dput = (region: string, key: PalKey, g: THREE.BufferGeometry) => {
    count(g);
    d.put(region, key, g);
  };
  const put = (key: PalKey, g: THREE.BufferGeometry, x: number, z: number) => {
    if (hitsRoad(g)) {
      skipped++;
      g.dispose();
      return;
    }
    dput(d.regionOf(x, z), key, g);
  };
  /** 转过的盒子（中心 x z、底 y） */
  const bx = (key: PalKey, w: number, h: number, dd: number, x: number, y: number, z: number, rot = 0) =>
    put(key, rbox(w, h, dd, x, y, z, rot), x, z);
  /** 地上的一块平面（矩形，可转） */
  const plane = (w: number, dd: number, x: number, y: number, z: number, rot = 0) =>
    new THREE.PlaneGeometry(w, dd)
      .rotateX(-Math.PI / 2)
      .rotateY(rot)
      .translate(x, y, z);
  const flat = (key: PalKey, w: number, dd: number, x: number, y: number, z: number, rot = 0) =>
    put(key, plane(w, dd, x, y, z, rot), x, z);
  const block = (sh: Shape) => d.block(sh);

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
  /** 店的院子、停车排（sites/ 和 layout.ts 的 SITES）：街边家具躲开 */
  const taken: Box2[] = [];
  const claim = (r: Box2) => {
    taken.push(r);
    d.clear(r);
  };
  const inTaken = (x: number, z: number, pad = 0) =>
    taken.some((r) => x > r.x0 - pad && x < r.x1 + pad && z > r.z0 - pad && z < r.z1 + pad);

  // ── 手挑颜色的东西（路面标线、补丁、井盖、车）：按（材质, 区域）合成一个网格，d.asset 放（锁着的区域跟着压暗）──
  // 网格名用调色板的键（town 第 9 节夜里按网格名找材质）。立着的（车）：townWrap 对一整块"长条"只压低（y × K），
  // 这里先把它们按最终的样子摆好、y 先除 K；两头各垫一个退化的三角形把包围盒撑到 > LONG_M（单独一辆也走"长条"那条路）。
  const custom = new Map<
    string,
    { key: PalKey; extra: ToonOpts; stand: boolean; cast: boolean; by: Map<string, THREE.BufferGeometry[]> }
  >();
  const defCustom = (id: string, key: PalKey, extra: ToonOpts, stand = false, cast = false) =>
    custom.set(id, { key, extra, stand, cast, by: new Map() });
  const cput = (id: string, g: THREE.BufferGeometry, x: number, z: number, region?: string) => {
    const e = custom.get(id);
    if (!e) return;
    const reg = region ?? d.regionOf(x, z);
    const l = e.by.get(reg) ?? [];
    l.push(prepG(g, !!e.extra.vertexColors));
    e.by.set(reg, l);
  };
  const finishCustom = () => {
    for (const { key, extra, stand, cast, by } of custom.values())
      for (const [reg, list] of by) {
        const g = mergeGeometries(list);
        for (const x of list) x.dispose();
        if (!g) continue;
        count(g);
        if (stand) {
          g.computeBoundingBox();
          const bb = g.boundingBox as THREE.Box3;
          const cx = (bb.min.x + bb.max.x) / 2;
          const cz = (bb.min.z + bb.max.z) / 2;
          if (!keepScale(cx, cz)) g.scale(1, 1 / K, 1);
          const pad = new THREE.BufferGeometry();
          pad.setAttribute(
            'position',
            new THREE.Float32BufferAttribute(
              [cx - 2.6, 0, cz, cx - 2.6, 0, cz, cx - 2.6, 0, cz, cx + 2.6, 0, cz, cx + 2.6, 0, cz, cx + 2.6, 0, cz],
              3,
            ),
          );
          pad.setAttribute(
            'normal',
            new THREE.Float32BufferAttribute(
              new Array(18).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)),
              3,
            ),
          );
          if (g.attributes.color) pad.setAttribute('color', new THREE.Float32BufferAttribute(new Array(18).fill(1), 3));
          const all = mergeGeometries([g, pad]) as THREE.BufferGeometry;
          g.dispose();
          pad.dispose();
          const m = new THREE.Mesh(all, d.actx.mat(key, extra));
          m.name = `valley:${reg}:${key}`;
          if (!cast) m.userData.noCast = true;
          d.asset(m, reg);
        } else {
          const m = new THREE.Mesh(g, d.actx.mat(key, extra));
          m.name = `valley:${reg}:${key}`;
          m.userData.noCast = true;
          d.asset(m, reg);
        }
      }
  };

  // ══ 0. 形状 ═════════════════════════════════════════════════════════════════
  // 路灯：杆 + 朝路的短臂（本地 +z 朝路）+ 灯头。灯头只伸到路缘外 0.1 米（不悬在车道上）；夜里换自发光（见最后的"夜里"）
  // 杆、臂都不投影（傍晚细杆的长影是一条条麻点细线，M12）
  // 路灯、行道棕榈不实例化：按原尺寸烘进区域桶（ironwork、signPaint、palm…… 别的模块也有这几个桶，不多出绘制），
  // townWrap 把挨着的几块（杆 + 臂 + 灯头、干 + 裙 + 冠）归成一件、绕它的中心缩 K。thin = 不投影
  type Part = { key: PalKey; thin: boolean; g: THREE.BufferGeometry };
  const LAMP: Part[] = [
    { key: 'ironwork', thin: true, g: prepG(box(0.18, 4.4, 0.18, 0, 0, 0)) },
    { key: 'ironwork', thin: true, g: prepG(box(0.12, 0.12, 0.8, 0, 4.25, 0.35)) },
    // 灯头进 signPaint 的桶（第 9 节夜里按网格名 valley:区域:signPaint 换自发光）
    { key: 'signPaint', thin: false, g: prepG(box(0.42, 0.3, 0.42, 0, 3.98, 0.7)) },
  ];
  // 行道棕榈：同 build.ts 大道的加州蒲葵（树干 + 枯叶裙 + 下垂的长叶冠，球面法线）。树干不投影（低太阳下一条又直又黑的长带）
  const PALM: Part[] = [
    { key: 'palmTrunk', thin: true, g: prepG(new THREE.CylinderGeometry(0.24, 0.36, 8, 6).translate(0, 4, 0)) },
    { key: 'palmSkirt', thin: false, g: prepG(new THREE.CylinderGeometry(0.75, 0.95, 2.4, 8).translate(0, 6.95, 0)) },
    // 叶片不投影（傍晚一片片锯齿长影是强边缘大户：银行门口 17.6 点 0.054）；投影只留枯叶裙 + 冠心一团（圆的团影）
    { key: 'palm', thin: true, g: palmCrownGeo(10, 3.4, 8.15, 3) },
    { key: 'palm', thin: false, g: prepG(blob(1.15, 1, 0.5, 1).translate(0, 8.0, 0)) },
  ];
  /** 一件（几块）摆到 (x, y, z)、缩放 s、转 rot，烘进区域桶；有一块压到车道就整件不放 */
  const bake = (reg: string, parts: Part[], x: number, y: number, z: number, s: number, rot: number) => {
    const gs = parts.map((p) => p.g.clone().scale(s, s, s).rotateY(rot).translate(x, y, z));
    if (gs.some((g) => hitsRoad(g))) {
      skipped++;
      for (const g of gs) g.dispose();
      return false;
    }
    parts.forEach((p, k) => {
      count(gs[k]);
      if (p.thin && d.putThin) d.putThin(reg, p.key, gs[k]);
      else dput(reg, p.key, gs[k]);
    });
    const tag = parts === PALM ? 'palms' : parts === LAMP ? 'lamps' : parts === BENCH ? 'benches' : 'bins';
    dbgPlaced[tag] = ((dbgPlaced[tag] as number) ?? 0) + 1;
    return true;
  };
  // 长椅（面朝本地 +z）、垃圾桶：同上烘进桶（凳腿、桶不投影）
  const BENCH: Part[] = [
    { key: 'wood', thin: false, g: prepG(box(1.9, 0.12, 0.55, 0, 0.42, 0)) },
    { key: 'wood', thin: false, g: prepG(box(1.9, 0.45, 0.12, 0, 0.55, -0.26)) },
    { key: 'ironwork', thin: true, g: prepG(box(0.12, 0.42, 0.5, -0.8, 0, 0)) },
    { key: 'ironwork', thin: true, g: prepG(box(0.12, 0.42, 0.5, 0.8, 0, 0)) },
  ];
  const BIN: Part[] = [
    { key: 'ironwork', thin: true, g: prepG(new THREE.CylinderGeometry(0.3, 0.27, 0.9, 6).translate(0, 0.45, 0)) },
  ];
  // 下面这些（树坑、花池、花槽、花盆、里面的植物）不实例化：直接 put 进区域桶（和别的模块的 adobe、仙人掌……合成一个网格，不多出绘制）。
  // put 的东西 townWrap 照样处理：平的（树坑）不缩；立着的挨着的几块归成一件、绕它的中心缩 K（花池 + 植物一起缩）
  /** 花池里的植物：桶形仙人掌一组、龙舌兰（clubsite/nature 的资产拆开：法线照资产的）、九重葛（绿团 + 玫红 / 珊瑚花团） */
  const PLANT: { key: PalKey; g: THREE.BufferGeometry }[][] = [];
  {
    const barrel = assetParts(buildBarrel(d.actx));
    PLANT.push([
      { key: 'cactus', g: barrel[0] },
      ...(barrel[1] ? [{ key: 'flowerYellow' as PalKey, g: barrel[1] }] : []),
    ]);
    const agave = assetParts(buildAgave(d.actx));
    PLANT.push([{ key: 'silverBlue', g: mergeGeometries(agave) as THREE.BufferGeometry }]);
    PLANT.push([
      {
        key: 'olive',
        g: mergeGeometries(
          [blob(0.62, 1.15, 0.8, 1, 0).translate(0, 0.55, 0), blob(0.42, 1, 1, 1, 0).translate(0.45, 0.85, 0.1)].map(
            (g) => prepG(g),
          ),
        ) as THREE.BufferGeometry,
      },
      {
        key: 'flowerPurple',
        g: mergeGeometries(
          [
            blob(0.26, 1, 1, 1, 0).translate(-0.3, 0.98, 0.25),
            blob(0.22, 1, 1, 1, 0).translate(0.25, 1.1, 0.3),
            blob(0.2, 1, 1, 1, 0).translate(0.62, 0.92, -0.1),
            blob(0.18, 1, 1, 1, 0).translate(-0.55, 0.7, 0.4),
          ].map((g) => prepG(g)),
        ) as THREE.BufferGeometry,
      },
      {
        key: 'flowerRed',
        g: mergeGeometries(
          [
            blob(0.17, 1, 1, 1, 0).translate(0.05, 1.12, -0.05),
            blob(0.16, 1, 1, 1, 0).translate(-0.12, 0.8, 0.52),
            blob(0.15, 1, 1, 1, 0).translate(0.5, 0.62, 0.5),
          ].map((g) => prepG(g)),
        ) as THREE.BufferGeometry,
      },
    ]);
  }

  // ── 手挑的颜色 ──
  // 主街双黄中线：赭黄（hwMustard 往灰里收；亮档 L ≈ 170，和 street 亮档 138 差 32 < 60）。朝上的平面：不要 SIGN_FACE 的往上偏的光
  defCustom('yellow', 'hwMustard', {
    ramp: [0xd8aa4c, 0xa48446, 0x5a4c60],
    lightUp: 0,
    bands: [0.1, 0.5],
    noShadowReceive: false,
    edge: 0.05,
    convex: 0,
  });
  // 补丁：street 低一级（同一套元素：封层斑还在）
  const streetTones = (dl: number) => {
    const sh = (c: number) => {
      const r = Math.max(0, Math.min(255, ((c >> 16) & 255) + dl));
      const g = Math.max(0, Math.min(255, ((c >> 8) & 255) + dl));
      const b = Math.max(0, Math.min(255, (c & 255) + dl));
      return (r << 16) | (g << 8) | b;
    };
    const tri = (a: number, b: number, c: number) => [sh(a), sh(b), sh(c)] as [number, number, number];
    return {
      ramp: tri(0x918a7c, 0x5e6a80, 0x384862),
      tones: {
        bands: [
          tri(0x918a7c, 0x989183, 0x898274),
          tri(0x5e6a80, 0x657187, 0x566278),
          tri(0x384862, 0x3f4f69, 0x2d4060),
        ] as [[number, number, number], [number, number, number], [number, number, number]],
        seam: tri(0x7f796d, 0x4f5c74, 0x293d5f),
        hi: tri(0xa59e90, 0x727e94, 0x4a5a74),
      },
      elem: TOWN_EL.street,
    } satisfies ToonOpts;
  };
  defCustom('patch', 'street', streetTones(-13));
  // 井盖：铸铁的暗灰紫 + 一纹素亮边（亮边那圈用 lotPaint 的颜色，单独一圈）
  // 井盖：铸铁（ironwork，平的、不投影）+ 一纹素亮边（lotPaint 一圈）—— 都进区域桶，不多出绘制
  // 车：六种车身（M14：红 / 海军蓝 / 薄荷 / 金 / 奶油 / 银），车顶同色亮一级；挡风玻璃深蓝
  const CARS: { body: [number, number, number]; roof: [number, number, number] }[] = [
    { body: [0xd8503e, 0xa83a48, 0x5e2a58], roof: [0xee7058, 0xbc4c52, 0x6a3260] },
    { body: [0x40609e, 0x2e4482, 0x22285a], roof: [0x5878b8, 0x3c5496, 0x2a3468] },
    { body: [0x7cc8a4, 0x4e9a8c, 0x2c5a6e], roof: [0x9adcba, 0x62ae98, 0x346676] },
    { body: [0xe0aa40, 0xb07a3c, 0x664a5c], roof: [0xf2c45e, 0xc48e48, 0x725466] },
    { body: [0xf0dcb4, 0xc8a8a0, 0x7a6894], roof: [0xfbecd2, 0xd8bcb4, 0x86769e] },
    { body: [0xb8c2cc, 0x8a94aa, 0x505878], roof: [0xd0d8e0, 0xa0aabc, 0x5c6684] },
  ];
  // 车身、车顶一个材质：ramp 近白（中档、暗档往冷紫里偏），颜色是顶点色（省 11 个绘制）
  defCustom('car', 'carRed', { ramp: [0xffffff, 0xc0b4cc, 0x6c64a0], vertexColors: true }, true, true);

  // ── 放东西的小工具 ──
  /**
   * 立着的小件放不进的地：三栋店的缩放框（townscale.ts 的 FRAMES：贴着楼的那块地里的东西跟着楼缩向门口，世界里写的位置会被挪走）、
   * 住宅脚印外 2.3 米（同理跟着房子缩）。这些地只铺平的（陶砖底、树坑那种 < 0.15 米的不缩）
   */
  const inFrame = (x: number, z: number) =>
    FRAMES.some((f) => x >= f.zone.x0 - 0.8 && x <= f.zone.x1 + 0.8 && z >= f.zone.z0 - 0.8 && z <= f.zone.z1 + 0.8) ||
    BLD.some(
      ({ o, r }) => o.kind === 'house' && Math.hypot(o.x - x, o.z - z) < r + 3 && inPoly(bldgPoly(o, 2.4), x, z),
    );
  /** 街边家具都放下了的位置（互相让开） */
  const placed: V2[] = [];
  const near = (x: number, z: number, r: number) => placed.some((p) => Math.hypot(p[0] - x, p[1] - z) < r);
  const bench = (x: number, z: number, rot: number) => {
    if (!bake(d.regionOf(x, z), BENCH, x, 0, z, 1, rot)) return false;
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    block({ a: [x - 0.9 * c, z + 0.9 * s], b: [x + 0.9 * c, z - 0.9 * s], r: 0.4 });
    return true;
  };
  /** 路灯的灯光圈（夜里）：灯头底下、往路那边挪一点 */
  const lampPools: { x: number; z: number; reg: string; r?: number; h?: number }[] = [];
  const lamp = (x: number, z: number, rot: number, s = 1) => {
    if (inFrame(x, z) || inTaken(x, z, 0.4)) return false;
    const reg = d.regionOf(x, z);
    if (!bake(reg, LAMP, x, 0, z, s, rot)) return false;
    block({ x, z, r: 0.25 });
    lampPools.push({ x: x + Math.sin(rot) * 0.45, z: z + Math.cos(rot) * 0.45, reg, r: 4.2 * s, h: 4.6 * s });
    placed.push([x, z]);
    return true;
  };
  /** 一棵行道棕榈 + 方树坑 */
  const palm = (x: number, z: number, pit = true) => {
    // plaza.ts（在 town 之前跑）占的地、店的院子都在 taken 里：躲开
    if (inFrame(x, z) || inTaken(x, z, 0.6)) return false;
    if (!bake(d.regionOf(x, z), PALM, x, 0, z, 0.9 + rnd() * 0.25, rnd() * 6.28)) return false;
    if (pit) {
      // 树坑：1.4 米见方、0.1 米高的 adobe 沿（朝南一纹素多的暗边）+ 里面一块碎石（平的：不跟着缩）
      put('adobe', box(1.4, 0.1, 1.4, x, 0, z), x, z);
      put('gravelYard', plane(1.12, 1.12, x, 0.104, z), x, z);
      // 树坑南半边一小丛花（九重葛的玫红 + 珊瑚红，脚下一团绿）：人行道上多一点颜色（第 3 轮：主街中饱和度 0.38）
      const pk = (key: PalKey, r: number, dx: number, dz: number, y: number) =>
        put(key, blob(r / K, 1, 0.7, 1, 0).translate(x + dx, y / K, z + dz), x + dx, z + dz);
      pk('olive', 0.26, 0.05, 0.36, 0.1);
      pk('flowerPurple', 0.17, -0.3, 0.38, 0.14);
      pk('flowerRed', 0.15, 0.36, 0.3, 0.13);
    }
    block({ x, z, r: 0.5 });
    placed.push([x, z]);
    return true;
  };
  /** 花池里的一株：桶仙人掌、龙舌兰、九重葛轮流（按种子） */
  const plant = (x: number, z: number, y: number, kind: number, s = 1) => {
    const r = rnd() * 6.28;
    const k = kind === 1 ? s * 0.95 : s;
    for (const { key, g } of PLANT[kind]) put(key, g.clone().scale(k, k, k).rotateY(r).translate(x, y, z), x, z);
  };
  /**
   * 路缘线上的长花槽（第 3 轮：人行道上的颜色）：缩完 2.6 × 0.9 米、0.35 米高的 adobe 槽，两丛九重葛。
   * 按原尺寸写 /K（< LONG_M 的小件整件绕中心缩 K；缩完要 2.6 米只能这么写）
   */
  const flowerBox = (x: number, z: number) => {
    if (inFrame(x, z) || inTaken(x, z, 0.5) || roadGap(x, z) < 0.6) return false;
    const reg = d.regionOf(x, z);
    dput(reg, 'adobe', box(2.6 / K, 0.56, 0.9 / K, x, 0, z));
    dput(reg, 'gravelYard', box(2.6 / K - 0.3, 0.2, 0.9 / K - 0.3, x, 0.38, z));
    for (const dx of [-0.62, 0.62]) plant(x + dx / K, z, 0.58, 2, 0.95);
    block({ x0: x - 1.35, x1: x + 1.35, z0: z - 0.5, z1: z + 0.5 });
    placed.push([x, z]);
    dbgPlaced.flowerBoxes = ((dbgPlaced.flowerBoxes as number) ?? 0) + 1;
    return true;
  };
  /** 方花池（缩完 1.4 米见方）+ 一株 */
  let bedN = 0;
  const bed = (x: number, z: number, kind = bedN % 3, minGap = 1.6) => {
    // 店的缩放框里（报社东边那条）：townWrap 会把框里的东西按门口缩过去 —— 写反算回去的位置（反算出了框 = 这里放不了）
    let wx = x;
    let wz = z;
    const f = FRAMES.find((q) => x >= q.zone.x0 && x <= q.zone.x1 && z >= q.zone.z0 && z <= q.zone.z1);
    if (f) {
      wx = f.px + (x - f.px) / K;
      wz = f.pz + (z - f.pz) / K;
      if (!(wx > f.zone.x0 + 1 && wx < f.zone.x1 - 1 && wz > f.zone.z0 + 1 && wz < f.zone.z1 - 1)) return false;
    } else if (inFrame(x, z) || roadGap(x, z) < minGap) return false;
    // 楼的脚印（BUILDINGS_RAW 是缩之前的）按写的位置查
    if (inBldg(wx, wz, 0.6)) return false;
    // 方花池（M8）：缩完 1.4 米见方、0.4 米高的 adobe 矮边（上沿 adobe 自己的亮边），里面碎石 + 一株
    dput(d.regionOf(wx, wz), 'adobe', box(2.26, 0.65, 2.26, wx, 0, wz));
    dput(d.regionOf(wx, wz), 'gravelYard', box(1.94, 0.2, 1.94, wx, 0.42, wz));
    plant(wx, wz, 0.62, kind);
    block({ x: wx, z: wz, r: 0.75 });
    placed.push([x, z]);
    bedN++;
    return true;
  };

  // ══ 1. 市中心的地：陶砖铺满（C1）══════════════════════════════════════════
  // 人行道 = 路两边的陶砖带（陶砖比步道的浅土色暖、饱和，和车道、沙地都分得开）；店前、店间、楼后整块铺一层陶砖底（Y_BASE，
  // 店的铺面、广场在 Y.pave 往上盖）。底是一整块（比哪个缩放框都大，townWrap 不动它；putFlat 按区域边切开）。
  // 停车场 = 店自己的 lotPave；车道 = street；住宅前院 = 碎石（south.ts）。沙只留在住宅圈外。
  const BASE: Box2[] = [
    // 主街北边、后街南边、两家店之间和楼后（报社西边 G1 那块归 plaza.ts：x 214…228）
    { x0: 228, x1: 333, z0: -48.2, z1: -5 },
    // 主街南边西段：车位 + 后面的人行道，一直到后院墙（z 14.2）；横街对面 G4 小广场那段 plaza.ts 往上盖
    { x0: 214, x1: 341, z0: 5, z1: 14.2 },
    // 主街南边东段（公园东边到东头）
    { x0: 476, x1: 612, z0: 5, z1: 14.2 },
    // 五金门前：x 612 以西 z −8 以北是 hardware.ts 朝主街的花池带（不叠两层）；612 以东铺到停车场的南沿 z −11.7
    { x0: 612, x1: 626, z0: -11.7, z1: -5 },
    // 后街东头（第 3 轮）：回车圈、G2 停车场南沿和后街北边人行道之间那条、去校队球场西北门的小径（plaza.ts 的门柱、旗、长椅站在这上面）
    { x0: 296, x1: 346, z0: -58.7, z1: -55.0 },
    { x0: 326, x1: 346, z0: -55.0, z1: -47.2 },
  ];
  {
    const pos: number[] = [];
    for (const r of BASE)
      pos.push(
        ...[r.x0, Y_BASE, r.z0, r.x0, Y_BASE, r.z1, r.x1, Y_BASE, r.z0],
        ...[r.x1, Y_BASE, r.z0, r.x0, Y_BASE, r.z1, r.x1, Y_BASE, r.z1],
      );
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    if (d.putFlat) d.putFlat('tile', g);
    else put('tile', g, 280, -20);
  }
  // 撒点（build.ts 的灌木、大道棕榈）躲开：市中心、主街两边到后院墙、横街、后街、五金门前
  for (const r of [
    { x0: 214, x1: 334, z0: -49, z1: -5 },
    { x0: 214, x1: 628, z0: -12, z1: 14.6 },
    { x0: 200, x1: 330, z0: -58.5, z1: -45 },
    { x0: 296, x1: 346, z0: -59, z1: -47 },
  ])
    d.clear(r);

  // 人行道（陶砖带）+ 路缘
  // 主街西段（市中心）门前 4.5 米；东段贴学校、公园的 3 米；横街 3 米；后街 2.5 米
  const DT: { id: string; sw: number; clip: Box2 }[] = [
    { id: 'main', sw: 4.5, clip: { x0: 214, x1: 333, z0: -20, z1: 20 } },
    { id: 'main', sw: 3, clip: { x0: 333, x1: 626, z0: -20, z1: 20 } },
    { id: 'cross', sw: 3, clip: { x0: 260, x1: 290, z0: -140, z1: 0 } },
    { id: 'back', sw: 2.5, clip: { x0: 200, x1: 400, z0: -60, z1: -40 } },
  ];
  /** 主街南边的车位排（车头朝里，盖住那一段人行道）：横街斑马线那段（G4）、公园那段不放 */
  const PK = { z0: 5.1, z1: 10.6, walk1: 14, stall: 2.6 };
  const PARK_RUNS: [number, number][] = [
    [237, 263.4],
    [285.4, 329],
    [480, 604],
  ];
  const inParkRun = (x: number, z: number) =>
    z > 4.5 && z < PK.z1 + 0.2 && PARK_RUNS.some(([a, b]) => x > a - 0.2 && x < b + 0.2);
  const runs: { r: Road; pts: V2[]; sw: number }[] = [];
  for (const { id, sw, clip: c } of DT) {
    const r = roadById(id);
    for (const pts of clip(r.pts, c)) runs.push({ r, pts, sw });
  }
  for (const { r, pts, sw } of runs) {
    const mid = pts[Math.floor(pts.length / 2)];
    put('tile', ribbon(pts, r.w / 2 + sw, Y.walk), mid[0], mid[1]);
    // 路缘：两边各一条 0.3 宽、0.1 高；跨过别的路、车位入口的地方断开
    for (const side of [-1, 1]) {
      const edge = offsetLine(pts, side * (r.w / 2 + 0.1));
      runsAlong(
        edge,
        (x, z) => roadGap(x, z, r) > 0.4 && !inParkRun(x, z),
        (a, b) => {
          const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
          const cx = (a[0] + b[0]) / 2;
          const cz = (a[1] + b[1]) / 2;
          bx('concrete', 0.3, 0.1, L, cx, 0, cz, Math.atan2(b[0] - a[0], b[1] - a[1]));
        },
      );
    }
  }

  // 斑马线：两条路的交点，每条路在交点两边各一道（那边有路才画）；斑马线外 1 米一道 2 纹素的停止线（只拦驶向路口的那半边）
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
    ['cross', 'main'],
    ['cross', 'back'],
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
        // 停止线：斑马线再往外 1 米；车往路口开（方向 −s·t），右手边那半条车道（世界里右手 = (−dz, dx)）
        const o = O.w / 2 + 2.4 + 1.4 + 0.9;
        const sx = P[0] + t[0] * s * o;
        const sz = P[1] + t[1] * s * o;
        const dir: V2 = [-s * t[0], -s * t[1]];
        const right: V2 = [-dir[1], dir[0]];
        const span = R.w / 2 - 0.7;
        // 沿路方向 2 纹素：东西向的路 → 停止线在屏幕上是竖的（2 纹素 x）；南北向 → 横的（2 屏幕行 z）
        const thick = Math.abs(t[0]) > 0.7 ? 2 * TX : 2 * ROWZ;
        const ux = sx + right[0] * (0.3 + span / 2);
        const uz = sz + right[1] * (0.3 + span / 2);
        flat('lotPaint', span, thick, ux, Y_MARK, uz, rot);
      }
    }
  }
  const nearCrossing = (x: number, z: number, r: number) => crossings.some((p) => Math.hypot(p[0] - x, p[1] - z) < r);

  // ══ 1b. 六家店（detail/sites/）在 town 之前跑；这里只把院子（layout.ts 的 SITES）和它们占的地记进 taken，街边家具躲开 ══
  for (const s of SITES) claim(s);
  for (const r of siteState(d).claims) taken.push(r);

  // ══ 1c. 路面（C14 / M1）：主街双黄中线、横街黄虚线、补丁、停止线、井盖（磨痕试过：低一级看不出来，省一个绘制） ══════════════
  {
    const main = roadById('main');
    // 中线断开的地方：路口（横街 274.4、公园西路 336、学校车道 450、五金进口 520.5）和东头的岔口
    const GAPS: [number, number][] = [
      [263.9, 284.9],
      [329, 343],
      [442, 458],
      [515, 526],
    ];
    const x0 = 214;
    const x1 = 604;
    const segs: [number, number][] = [];
    let a = x0;
    for (const [g0, g1] of GAPS) {
      if (g0 > a) segs.push([a, g0]);
      a = g1;
    }
    segs.push([a, x1]);
    // 双黄线：各 2 屏幕行、中间隔 2 屏幕行（每条正好盖 2 个像素中心，不会时有时无）
    for (const [s0, s1] of segs)
      for (const zc of [-1.5 * ROWZ, 1.5 * ROWZ]) {
        const L = s1 - s0;
        cput('yellow', plane(L, 2 * ROWZ, (s0 + s1) / 2, Y_MARK, zc), (s0 + s1) / 2, zc);
      }
    // 补丁：30～40 米一块，两条车道轮流，硬边、低一级；不压中线
    const prnd = d.rng('valley:town:patches');
    let lane = 1;
    for (let x = x0 + 12; x < x1 - 6; x += 30 + prnd() * 10) {
      if (GAPS.some(([g0, g1]) => x > g0 - 4 && x < g1 + 4)) continue;
      const w = 1.6 + prnd() * 1.8;
      const dz = 1.1 + prnd() * 1.4;
      const zc = lane * (0.45 + dz / 2 + prnd() * 1.4);
      cput('patch', plane(w, dz, x, Y_PATCH, zc), x, zc);
      lane = -lane;
    }
    // 横街：黄虚线中线（2 纹素宽，段 1.5 米、隔 2 米；两头让开斑马线和停止线）
    for (let z = -12.5; z > -41.5; z -= 3.5) cput('yellow', plane(2 * TX, 1.5, 274.4, Y_MARK, z - 0.75), 274.4, z);
    // 横街、后街：各两块补丁
    for (const [x, z, w, dz] of [
      [272.2, -24, 2.2, 1.6],
      [276.6, -36.5, 1.8, 2.4],
      [236, -50.2, 2.6, 1.4],
      [304, -53.0, 2.0, 1.6],
    ] as const)
      cput('patch', plane(w, dz, x, Y_PATCH, z), x, z);
    // 井盖：车道正中、约 55 米一个，两条车道轮流（1 纹素亮边：亮的一圈 + 里面一块暗铁）
    let side = -1;
    for (let x = 240; x < x1; x += 52 + prnd() * 8) {
      if (GAPS.some(([g0, g1]) => x > g0 - 3 && x < g1 + 3)) continue;
      const zc = side * 2.6;
      const r = 0.42;
      put('lotPaint', new THREE.CircleGeometry(r, 14).rotateX(-Math.PI / 2).translate(x, Y_MARK, zc), x, zc);
      d.putThin?.(
        d.regionOf(x, zc),
        'ironwork',
        new THREE.CircleGeometry(r - TX, 14).rotateX(-Math.PI / 2).translate(x, Y_MARK + 0.004, zc),
      );
      side = -side;
    }
    void main;
  }

  // ══ 1d. 主街南边：店的对面一排车位（M13 / M14）══════════════════════════════
  // 车头朝里的直车位贴着路缘（z 5.1…10.6，盖住那一段的人行道），车位后面 3.4 米人行道（z 10.6…14），再往南是后院墙。
  // 每格一条 2 纹素的平漆线（芥末黄，不要凸起的隔条；地是 lotPave）；车位后沿一条矮路缘（暗带）。车按小镇的比例（缩完 1.24 × 3 米），六种颜色轮流。
  {
    const crnd = d.rng('valley:town:parking:cars');
    let lastColor = -1;
    let carN = 0;
    for (const [x0, x1] of PARK_RUNS) {
      const n = Math.floor((x1 - x0) / PK.stall);
      const xa = (x0 + x1) / 2 - (n * PK.stall) / 2;
      const xb = xa + n * PK.stall;
      // 车位的地 = 停车场的暖铺面 lotPave（lead 定的：停车场一律 lotPave；第 3 轮从 street 换过来，主街中饱和度 0.38）
      flat('lotPave', xb - xa, PK.z1 - PK.z0, (xa + xb) / 2, 0.03, (PK.z0 + PK.z1) / 2);
      for (let k = 0; k <= n; k++)
        // 车位线：芥末黄（同中线，lotPave 的板缝是 1 纹素的浅缝，奶油漆线混在里面分不出来）
        cput(
          'yellow',
          plane(2 * TX, PK.z1 - PK.z0 - 0.8, xa + k * PK.stall, Y_MARK, (PK.z0 + PK.z1) / 2 + 0.4),
          xa + k * PK.stall,
          (PK.z0 + PK.z1) / 2,
        );
      bx('concrete', xb - xa, 0.12, 0.25, (xa + xb) / 2, 0, PK.z1);
      for (let k = 0; k < n; k++) {
        if (crnd() > 0.6) continue;
        const x = xa + (k + 0.5) * PK.stall;
        let c = Math.floor(crnd() * CARS.length);
        if (c === lastColor) c = (c + 1 + Math.floor(crnd() * (CARS.length - 1))) % CARS.length;
        lastColor = c;
        // 七成车头朝里（南）
        const rot = crnd() < 0.7 ? 0 : Math.PI;
        car(x, (PK.z0 + PK.z1) / 2 + 0.2, rot, c);
        carN++;
      }
      taken.push({ x0, x1, z0: PK.z0, z1: PK.z1 });
      block({ x0: xa, x1: xb, z0: PK.z0, z1: PK.z1 - 0.2 });
    }
    dbgPlaced.cars = carN;
  }
  /** 一辆车（最终尺寸 = 原尺寸 × K，绕落地点；车头朝本地 +z） */
  function car(x: number, z: number, rot: number, color: number) {
    const col = (g: THREE.BufferGeometry, hex: number) => {
      const c = new THREE.Color(hex);
      const n = g.attributes.position.count;
      g.setAttribute(
        'color',
        new THREE.Float32BufferAttribute(
          new Array(n).fill(0).flatMap(() => [c.r, c.g, c.b]),
          3,
        ),
      );
      return g;
    };
    const parts: THREE.BufferGeometry[] = [
      col(box(2.0, 0.66, 4.8, 0, 0.28, 0).toNonIndexed(), CARS[color].body[0]),
      col(box(1.8, 0.1, 1.94, 0, 1.36, -0.35).toNonIndexed(), CARS[color].roof[0]),
    ];
    // 车身 + 车顶（顶点色、一个材质）都归 town（车位排西头那几格在俱乐部的区域里：一辆车不值得多一组网格）
    for (const g of parts) {
      g.scale(K, K, K).rotateY(rot).translate(x, 0, z);
      cput('car', g, x, z, 'town');
    }
    // 底盘、玻璃进区域桶（ironwork、silverBlue）：照原尺寸写在各自的中心，townWrap 绕中心缩 K（中心先按 K 挪好）
    const at = (dz: number): [number, number] => [x + Math.sin(rot) * dz * K, z + Math.cos(rot) * dz * K];
    const [tx, tz] = at(0);
    put('ironwork', rbox(1.84, 0.3, 3.9, tx, 0, tz, rot), tx, tz);
    const [gx, gz] = at(-0.25);
    put('silverBlue', rbox(1.74, 0.42, 2.5, gx, 0.94, gz, rot), gx, gz);
  }

  // ══ 2. 后院墙（C5）：车位后人行道的南沿一道连续的墙 ══════════════════════════
  // 土坯灰泥墙（adobe：和花池一家，暗面梅紫、有夯土层元素；缩完 1.5 米）+ 压顶，每 7 米灰泥后一段 4.6 米花砖（镂空：一格一格的暗洞）；接缝一根方墩。
  // 墙头几处搭九重葛。G4 小广场那段（横街对面）、公园西路、公园门口断开。墙朝南的面（院子那边）是画面上的暗带。
  {
    const WZ = 14.4;
    const H = 1.5 / K;
    const T = 0.3;
    const wrnd = d.rng('valley:town:wall');
    const SEGS: [number, number][] = [
      [232, 263.4],
      [285.4, 331],
      [478, 609],
    ];
    /** 花砖一格：缩完 7 纹素宽、4 屏幕行高；洞 3.5 纹素 × 2 行（长墙不缩长度，只压低：高度写 /K） */
    const CW = 7 * TX;
    const CH = (4 * ROWZ) / K;
    // 墙后（院子那边）一条碎石：住宅把离这道墙 < 2.5 米的院子北墙删掉、用这道墙封口，中间不留沙缝（第 3 轮）
    for (const [s0, s1] of SEGS) {
      const g = new THREE.PlaneGeometry(s1 - s0, 3.2)
        .rotateX(-Math.PI / 2)
        .translate((s0 + s1) / 2, 0.006, WZ + 0.15 + 1.6);
      if (d.putFlat) d.putFlat('gravelYard', g);
      d.clear({ x0: s0, x1: s1, z0: WZ, z1: WZ + 3.4 });
    }
    for (const [s0, s1] of SEGS) {
      let x = s0;
      let breeze = false;
      while (x < s1 - 1) {
        // 一段 ≥ 4.6 米（townWrap 把 < 4.5 米的一块当小件缩短，接缝会断）：末尾剩不到 4.6 米就并进这一段
        let L = breeze ? 4.6 : 7;
        if (s1 - (x + L) < 4.6) L = s1 - x;
        const cx = x + L / 2;
        const reg = d.regionOf(cx, WZ);
        if (breeze) {
          // 花砖段：墙身 breezeBlock（元素是一块块砖），朝南的面上一格一格的暗洞（合成一块几何，和墙一样长）
          dput(reg, 'breezeBlock', box(L, H - 0.2, T, cx, 0, WZ));
          const holes: THREE.BufferGeometry[] = [];
          const nx = Math.floor((L - 0.3) / CW);
          const ny = Math.floor((H - 0.2 - 0.45) / CH);
          for (let i = 0; i < nx; i++)
            for (let j = 0; j < ny; j++)
              holes.push(
                new THREE.PlaneGeometry(3.5 * TX, CH / 2).translate(
                  cx - (nx * CW) / 2 + (i + 0.5) * CW,
                  0.35 + (j + 0.5) * CH,
                  WZ + T / 2 + 0.01,
                ),
              );
          const hg = mergeGeometries(holes.map((g) => prepG(g)));
          if (hg) dput(reg, 'ironwork', hg);
        } else dput(reg, 'adobe', box(L, H - 0.2, T, cx, 0, WZ));
        // 压顶（伸出 3 厘米）
        dput(reg, 'cap', box(L + 0.06, 0.2, T + 0.1, cx, H - 0.2, WZ));
        // 方墩（段与段的接缝）
        if (x > s0) dput(reg, 'cap', box(0.5, H + 0.15, 0.48, x, 0, WZ));
        // 九重葛：灰泥段一半搭一丛（墙头 + 往北垂下来）
        if (!breeze && L >= 5 && wrnd() < 0.55) {
          const bxp = cx + (wrnd() - 0.5) * (L - 2.5);
          // 实例的 y 跟着乘 K：写缩之前的高度（墙头往下埋一点）
          plant(bxp, WZ - 0.25, (1.5 - 0.4) / K, 2, 1.25);
        }
        block({ x0: x, x1: x + L, z0: WZ - T / 2 - 0.1, z1: WZ + T / 2 + 0.1 });
        x += L;
        breeze = !breeze;
      }
    }
  }

  // ══ 3. 行道棕榈 + 路灯（M6 / C3）：同一条线交替 —— 棕榈 18 米一棵，灯在两棵中间；两边错开半格 ══════════
  // 线在路缘里侧 1 米（北边 z −6；南边车位那几段在车位后的人行道上 z 12.3，公园那段 z 6）。躲开斑马线、店门、岔路口、车位。
  {
    const main = roadById('main');
    const DOORS = [249, 292.6, 325.6];
    const okAt = (x: number, z: number) =>
      !nearCrossing(x, z, 10.5) &&
      roadGap(x, z, main) > 0.9 &&
      !inBldg(x, z, 0.8) &&
      !inParkRun(x, z) &&
      !near(x, z, 2.2) &&
      !(z < 0 && DOORS.some((dx) => Math.abs(dx - x) < 2.6));
    const lineZ = (side: number, x: number) => {
      if (side < 0) return -6;
      if (x > 341 && x < 476) return 6.1;
      return 12.3;
    };
    for (const side of [-1, 1]) {
      const xEnd = side < 0 ? 625 : 607;
      for (let s = side < 0 ? 0 : 9; 216 + s < xEnd; s += 9) {
        const x = 216 + s;
        // 南边 G4 小广场那段（横街对面，plaza.ts）不放
        if (side > 0 && x > 262 && x < 287.5) continue;
        const z = lineZ(side, x);
        if (!okAt(x, z)) {
          // 挪一两米再试（躲店门、岔路口）
          const alt = [1.8, -1.8, 3.2, -3.2].map((dx) => x + dx).find((xx) => okAt(xx, z));
          if (alt === undefined) continue;
          if ((s / 9) % 2 === (side < 0 ? 0 : 1)) palm(alt, z);
          else lamp(alt, z, side < 0 ? 0 : Math.PI);
          continue;
        }
        const isPalm = (s / 9) % 2 === (side < 0 ? 0 : 1);
        if (isPalm) {
          // 棕榈两边 4.5 米（棕榈和灯中间）各一个九重葛方花池：人行道上的颜色（第 3 轮）
          if (palm(x, z)) for (const dx of [-4.5, 4.5]) if (okAt(x + dx, z)) flowerBox(x + dx, z);
        } else lamp(x, z, side < 0 ? 0 : Math.PI);
      }
    }
  }

  // ══ 4. 横街（C9）：两排棕榈（8 米一棵、两边对齐，方树坑）+ 树坑间的长花槽（花槽里的路灯）+ 路口大花盆 ══════════
  // 后街北边市政厅门口：横街轴线两边一对高灯柱（框住钟塔）
  {
    const W = 274.4 - 5 - 1.0;
    const E = 274.4 + 5 + 1.0;
    for (const x of [W, E]) {
      for (const z of [-13, -21, -29, -37]) palm(x, z);
      for (const z of [-17, -25, -33]) {
        // 长花槽：adobe 沿 0.9 宽 + 碎石；长 4.6 米 ≥ LONG_M = "长条"，townWrap 只压低（高度写 /K），长度不缩。
        // 银行 drive-up 从横街东边进来（z −18.5）：压到那条车道的不放
        if (roadGap(x, z - 2.3) < 0.2 || roadGap(x, z + 2.3) < 0.2 || roadGap(x, z) < 0.2) continue;
        put('adobe', box(0.9, 0.55, 4.6, x, 0, z), x, z);
        put('gravelYard', box(0.72, 0.2, 4.6, x, 0.36, z), x, z);
        for (const dz of [-1.5, 1.5]) plant(x, z + dz, 0.56, dz < 0 ? 2 : 1, 0.85);
        block({ x0: x - 0.35, x1: x + 0.35, z0: z - 2.3, z1: z + 2.3 });
        placed.push([x, z]);
        // 花槽正中立一盏灯（−17、−33）
        if (z !== -25) lamp(x, z, x < 274.4 ? Math.PI / 2 : -Math.PI / 2);
      }
    }
    // 路口四角的大花盆：主街口两角、后街口两角（各一棵小棕榈或一丛龙舌兰 + 九重葛）
    for (const [x, z, k] of [
      [264.9, -8.4, 0],
      [283.9, -8.4, 1],
      // 后街口两角：报社、银行的缩放框边上让开（放进框里会被挪向店门）
      [267.4, -44.2, 1],
      [281.0, -44.2, 0],
    ] as const) {
      if (inFrame(x, z)) continue;
      // 大圆花盆（缩完半径 0.75 米）
      const reg = d.regionOf(x, z);
      dput(reg, 'adobe', new THREE.CylinderGeometry(1.2, 1.05, 0.9, 12).translate(x, 0.45, z));
      dput(reg, 'gravelYard', new THREE.CylinderGeometry(1.05, 1.05, 0.2, 12).translate(x, 0.78, z));
      if (k === 0) {
        bake(reg, PALM, x, 0.95, z, 0.55, rnd() * 6);
      } else {
        plant(x - 0.2, z, 0.98, 1, 1.1);
        plant(x + 0.35, z + 0.25, 0.98, 2, 0.8);
      }
      block({ x, z, r: 0.8 });
      placed.push([x, z]);
    }
    // 市政厅门口的一对高灯柱：后街北边的人行道上，横街轴线两边
    for (const x of [268.4, 280.4]) lamp(x, -56.6, 0, 1.4);
  }

  // ══ 5. 店间、楼后的方花池（C1 / M8）：8～12 米一个 ══════════════════════════
  {
    const spots: V2[] = [
      // 报社和横街之间（报社东墙 256.5 …… 横街人行道 266.4）：报社的缩放框里，只够得着贴墙那 3 米（x ≤ 259.5、z ≥ −41.4）
      [258.6, -20],
      [258.6, -29.5],
      [258.6, -39],
      // 报社、印刷车间后面、银行西边那条也在缩放框里、反算出框（只铺陶砖；要摆东西得在 sites/paper.ts、bank.ts 里写）
      // 主街南边，车位排的两头（人行道上）
      [238.5, 12.3],
      [479.5, 12.3],
      [606.5, 12.3],
    ];
    const why: string[] = [];
    for (const [x, z] of spots) {
      const r = [inTaken(x, z, 0.6) && 'taken', roadGap(x, z) <= 0.9 && 'road', near(x, z, 1.8) && 'near'].filter(
        Boolean,
      );
      if (r.length || !bed(x, z)) why.push(`${x},${z}:${r.join('+') || 'frame'}`);
    }
    dbgPlaced.bedWhy = why.length;
    (dbgPlaced as Record<string, unknown>).bedWhyList = why;
  }

  // ══ 6. 街边：长椅 + 垃圾桶 / 花池 —— 只在店门口（背后 14 米内有楼），间隔 24～50 米不等 ═══
  {
    const clearAt = (x: number, z: number, r: Road, pad: number) =>
      !inBldg(x, z, pad) && roadGap(x, z, r) > 3 && !nearCrossing(x, z, 9) && !inTaken(x, z, 0.6) && !near(x, z, 2.2);
    for (const { r, pts, sw } of runs) {
      for (const side of [-1, 1]) {
        let lastBench = -99;
        let gapBench = 24;
        for (const [s, p, t] of along(pts, 1)) {
          const n: V2 = [-t[1] * side, t[0] * side];
          const toRoad = Math.atan2(-n[0], -n[1]);
          if (sw >= 3 && s - lastBench >= gapBench) {
            const o = r.w / 2 + sw - 0.9;
            const x = p[0] + n[0] * o;
            const z = p[1] + n[1] * o;
            if (inParkRun(x, z)) continue;
            const shop = [3, 7, 11, 14].some((k) => inBldg(x + n[0] * k, z + n[1] * k, 0.3));
            const ok = shop && [-1.2, 0, 1.2].every((k) => clearAt(x + t[0] * k, z + t[1] * k, r, 0.4));
            const x2 = x + t[0] * 2.2;
            const z2 = z + t[1] * 2.2;
            if (ok && clearAt(x2, z2, r, 0.4) && bench(x, z, toRoad)) {
              if (rnd() < 0.5) {
                bake(d.regionOf(x2, z2), BIN, x2, 0, z2, 1, 0);
                block({ x: x2, z: z2, r: 0.35 });
              } else bed(x2, z2);
              placed.push([x, z], [x2, z2]);
              lastBench = s;
              gapBench = 24 + rnd() * 26;
            }
          }
        }
      }
    }
  }

  finishCustom();
  dbgPlaced.tris = Math.round(tris);

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
        if (!(key in (d.actx.pal as object))) return;
        const m = (o as THREE.Mesh).material;
        if (m === d.mat(key) || m === glow || m === glowWin) ok = true;
      });
      return ok;
    };
    const lights = new THREE.Group();
    lights.name = 'valley:town:lights';
    lights.userData.roadSkipped = skipped;
    lights.userData.placed = dbgPlaced; // 车道守卫拦下的件数、每样放了几件（调试看）
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

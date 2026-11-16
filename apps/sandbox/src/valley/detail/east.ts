// valley 细节：学校和日出公园（高中、体育馆、操场、公共球场、游泳中心）、东谷（机场、塔奎兹溪高尔夫、向日葵小区、两片椰枣园、深井小区）。
// 接口见 build.ts 的 DetailCtx。只改这个文件。
//
// 构图（pixel-scene 的规矩：先定主角，细节成簇放在主角上，平地留白）：
// - 日出公园的主角是公共球场：四片一排、围网、网、线、灯杆、看台；一片网没了、一片裂了（"公园的公共球场要人管"）。
//   东南角一面对墙练习墙（天才少年傍晚在这儿打，墙前一块磨白的地、一地球、他的包）；南边草地上周末公开课的小场地、帐篷、锥桶；
//   游泳中心南边一个室外池（泳道绳、救生椅、遮阳伞）；篮球半场、厕所、儿童游乐场、野餐棚把公园填成"有事可做"的地方。
// - 高中：前门广场（旗杆、校牌、校际赛的两顶帐篷和横幅）、操场北边的看台、跑道分道线、球门、跳远沙坑；体育馆南边四片校队球场（教练在门口等）；
//   东边一排临时教室，西边教职工停车场。
// - 机场：跑道标线、滑行道（黄中线）、停机坪上几架小飞机、两座机库、塔台、航站楼门口的白色帆布顶、风向袋。
// - 塔奎兹溪高尔夫：六个洞（发球台、球道、果岭、旗、沙坑），两个洞跨过干河床，球车道上两座木桥，池塘，前面的球具店和球车棚。
// - 小区：每家按种子随机挑几样（车道、车、后院泳池、矮墙、柑橘树、前院草坪或砾石+仙人掌），深井小区里留着一片片老葡萄柚园。
// - 椰枣园：分块（土路十字分开），两块漫灌沟、两块树盘；水渠、拖拉机、修剪下来的叶堆；路边一个卖椰枣奶昔的小摊。
// 尺寸按"设计纹素"0.09 米：杆、柄 ≥ 0.14 米，线 0.1 米；网、围网用一条暗带，不画网眼；不撒满地的小东西。
//
// 第二轮审查（2026-11-15）定的规矩：
// - 薄的、细的东西（围网、挡风布、网、杆、栏杆、旗、横幅、机翼）不投影：傍晚它们的影子是又长又直的硬黑带（thin()）。
// - 树冠用球面法线的团（不是一面一面的宝石），棕榈用垂下来的叶子（同 build.ts）。
// - 地面一层层的高度至少错开 0.01 米（Y 表），上面那层只盖该盖的地方。
// - 电线杆、两对球场之间的矮挡风布、车棚删掉（看不懂、投长影）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { box } from '../../clubsite/render/geo';
import type { DetailCtx, InstItem } from '../build';
import { ribbon } from '../build';
import { BUILDINGS, distToLine, GREENS, houses, inPoly, ROADS, S, type V2, WASH, washDist } from '../layout';
import type { PalKey } from '../reuse';

/** 局部坐标系：原点 (x, z)、绕 y 转 r（同 rbox：局部 z 轴 = 世界 (sin r, cos r)） */
interface Fr {
  x: number;
  z: number;
  r: number;
}
const W0: Fr = { x: 0, z: 0, r: 0 };
const at = (f: Fr, lx: number, lz: number): V2 => {
  const c = Math.cos(f.r);
  const s = Math.sin(f.r);
  return [f.x + lx * c + lz * s, f.z - lx * s + lz * c];
};
/** 区间减去洞 */
function cut(s0: number, s1: number, holes: readonly (readonly [number, number])[]): [number, number][] {
  let out: [number, number][] = [[s0, s1]];
  for (const [h0, h1] of holes) {
    const next: [number, number][] = [];
    for (const [a, b] of out) {
      if (h1 <= a || h0 >= b) next.push([a, b]);
      else {
        if (h0 > a) next.push([a, h0]);
        if (h1 < b) next.push([h1, b]);
      }
    }
    out = next;
  }
  return out.filter(([a, b]) => b - a > 0.05);
}
const road = (id: string) => ROADS.find((r) => r.id === id);
/** 离哪条路（不含步道）的路面边多近（< 0 = 在路上） */
function roadGap(x: number, z: number): number {
  let best = Number.POSITIVE_INFINITY;
  for (const r of ROADS) if (r.kind !== 'trail') best = Math.min(best, distToLine(r.pts, x, z) - r.w / 2);
  return best;
}
/** 折线上最近的点 */
function nearestOn(pts: readonly V2[], x: number, z: number): V2 {
  let best = Number.POSITIVE_INFINITY;
  let out: V2 = pts[0];
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1];
    const [bx, bz] = pts[i];
    const dx = bx - ax;
    const dz = bz - az;
    const L = dx * dx + dz * dz;
    const t = L > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L)) : 0;
    const px = ax + dx * t;
    const pz = az + dz * t;
    const dd = Math.hypot(x - px, z - pz);
    if (dd < best) {
      best = dd;
      out = [px, pz];
    }
  }
  return out;
}

interface Box2 {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/** 折线在 x 处的 z（按 x 单调的路；x 超出两头取端点） */
function zAt(pts: readonly V2[], x: number): number {
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1];
    const [bx, bz] = pts[i];
    if ((x - ax) * (x - bx) <= 0 && ax !== bx) return az + ((bz - az) * (x - ax)) / (bx - ax);
  }
  return Math.abs(x - pts[0][0]) < Math.abs(x - pts[pts.length - 1][0]) ? pts[0][1] : pts[pts.length - 1][1];
}
/** 多边形的外框 */
function bbox(poly: readonly V2[]): Box2 {
  const xs = poly.map((v) => v[0]);
  const zs = poly.map((v) => v[1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
}

/**
 * 地面一层层的高度（米）。build.ts 的：河床 0.012、草地 / 高尔夫 0.015、步道 / 跑道 0.02、跑道（操场）0.025、路 0.03。
 * 这里的每层和压着的那层至少差 0.01（共面闪烁）。
 */
const Y = {
  /** 压在路下面的接驳（停车带、机场停车场的车道） */
  under: 0.018,
  /** 草地上的铺地（球场外场、硬地、广场、池边） */
  pad: 0.03,
  /** 铺地上的一层（内场、匹克球场面、罚球区） */
  court: 0.042,
  /** 线、晒白的斑 */
  line: 0.054,
  /** 线上的裂缝 */
  crack: 0.066,
  /** 人走的小路（压在路边、铺地边上：比路 0.03、铺地 Y.pad 都高 0.012） */
  path: 0.042,
} as const;

/**
 * 一团（树冠）：球面法线（亮顶、中腰、暗底，不是一面一面的宝石），再按轴缩放。
 * 20 个面（detail 0）就够：法线是球面的，读起来是圆的；detail 1 是 80 个面，深井一片柑橘园三角形超预算
 */
function blob(r: number, sx = 1, sy = 1, sz = 1): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(r, 0);
  const p = g.attributes.position as THREE.BufferAttribute;
  const n = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const v = new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)).normalize();
    n.set([v.x, v.y, v.z], i * 3);
  }
  g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
  g.deleteAttribute('uv');
  return g.scale(sx, sy, sz);
}
/** 合并前统一：不带索引、只留 position + normal */
function flatAttrs(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const o = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(o.attributes)) if (k !== 'position' && k !== 'normal') o.deleteAttribute(k);
  if (!o.attributes.normal) o.computeVertexNormals();
  return o;
}
const mergeAll = (list: THREE.BufferGeometry[]) => mergeGeometries(list.map(flatAttrs)) as THREE.BufferGeometry;

export function detailEast(d: DetailCtx): void {
  // ── 不投影的东西：按（区域, 材质, 160 米一块）攒，最后各合并成一个实例（cast = false；锁着照样压暗） ──
  const ncBuckets = new Map<string, { reg: string; key: PalKey; list: THREE.BufferGeometry[] }>();
  let thinMode = false;
  const bb = new THREE.Box3();
  const ctr = new THREE.Vector3();
  const putG = (region: string, key: PalKey, g: THREE.BufferGeometry) => {
    if (!thinMode) {
      d.put(region, key, g);
      return;
    }
    g.computeBoundingBox();
    bb.copy(g.boundingBox as THREE.Box3).getCenter(ctr);
    const k = `${region}|${key}|${Math.floor(ctr.x / 160)}|${Math.floor(ctr.z / 160)}`;
    const b = ncBuckets.get(k) ?? { reg: region, key, list: [] };
    b.list.push(g);
    ncBuckets.set(k, b);
  };
  /** 里面放的都不投影（围网、网、杆、栏杆、旗、横幅、机翼） */
  const thin = (fn: () => void) => {
    const was = thinMode;
    thinMode = true;
    try {
      fn();
    } finally {
      thinMode = was;
    }
  };

  // ── 小工具（都按局部坐标系） ──
  const reg = (x: number, z: number) => d.regionOf(x, z);
  /** 盒子：局部中心 (lx, lz)、底 y、再绕自己转 rr */
  const cube = (key: PalKey, f: Fr, lx: number, lz: number, w: number, h: number, dp: number, y = 0, rr = 0) => {
    const [x, z] = at(f, lx, lz);
    const g = box(w, h, dp, 0, y, 0);
    if (f.r + rr) g.rotateY(f.r + rr);
    putG(reg(x, z), key, g.translate(x, 0, z));
  };
  /** 世界坐标的盒子 */
  const wcube = (key: PalKey, x: number, z: number, w: number, h: number, dp: number, y = 0, rot = 0) =>
    cube(key, { x, z, r: rot }, 0, 0, w, h, dp, y);
  /** 平铺的矩形（局部范围），法线朝上 */
  const flat = (key: PalKey, f: Fr, lx0: number, lx1: number, lz0: number, lz1: number, y: number) => {
    const g = new THREE.PlaneGeometry(lx1 - lx0, lz1 - lz0)
      .rotateX(-Math.PI / 2)
      .translate((lx0 + lx1) / 2, y, (lz0 + lz1) / 2);
    if (f.r) g.rotateY(f.r);
    g.translate(f.x, 0, f.z);
    const [cx, cz] = at(f, (lx0 + lx1) / 2, (lz0 + lz1) / 2);
    putG(reg(cx, cz), key, g);
  };
  /** 平的椭圆 */
  const disc = (key: PalKey, x: number, z: number, rx: number, rz: number, y: number, rot = 0, seg = 14) => {
    const g = new THREE.CircleGeometry(1, seg).rotateX(-Math.PI / 2).scale(rx, 1, rz);
    if (rot) g.rotateY(rot);
    putG(reg(x, z), key, g.translate(x, y, z));
  };
  /** 折线带子（世界坐标） */
  const band = (key: PalKey, pts: V2[], half: number | number[], y: number) => {
    if (pts.length < 2) return;
    const m = pts[Math.floor(pts.length / 2)];
    putG(reg(m[0], m[1]), key, ribbon(pts, half, y));
  };
  const cyl = (key: PalKey, x: number, z: number, r: number, h: number, y = 0, seg = 8) =>
    putG(reg(x, z), key, new THREE.CylinderGeometry(r, r, h, seg).translate(x, y + h / 2, z));
  const blockRect = (f: Fr, lx0: number, lx1: number, lz0: number, lz1: number) =>
    d.block({ poly: [at(f, lx0, lz0), at(f, lx1, lz0), at(f, lx1, lz1), at(f, lx0, lz1)] });
  const blockSeg = (a: V2, b: V2, r = 0.25) => d.block({ a, b, r });
  /** 占地（撒树、电线杆时躲开） */
  const occ: Box2[] = [];
  /** 占地；clr = 同时告诉 build 这块别撒灌木、行道棕榈（铺了、摆了东西的地方） */
  const occupy = (f: Fr, lx0: number, lx1: number, lz0: number, lz1: number, pad = 0, clr = true) => {
    const ps = [at(f, lx0, lz0), at(f, lx1, lz0), at(f, lx1, lz1), at(f, lx0, lz1)];
    const b = {
      x0: Math.min(...ps.map((p) => p[0])) - pad,
      x1: Math.max(...ps.map((p) => p[0])) + pad,
      z0: Math.min(...ps.map((p) => p[1])) - pad,
      z1: Math.max(...ps.map((p) => p[1])) + pad,
    };
    occ.push(b);
    if (clr) d.clear(b);
  };
  const isFree = (x: number, z: number, pad = 0) =>
    !occ.some((b) => x > b.x0 - pad && x < b.x1 + pad && z > b.z0 - pad && z < b.z1 + pad);

  // 实例化的小东西：攒起来最后一起放
  const inst = {
    tree: [] as InstItem[],
    citrus: [] as InstItem[],
    palm: [] as InstItem[],
    ball: [] as InstItem[],
    cone: [] as InstItem[],
    agave: [] as InstItem[],
    cactus: [] as InstItem[],
    frond: [] as InstItem[],
  };
  const item = (x: number, z: number, s = 1, rot = 0, y = 0): InstItem => ({ x, z, s, reg: reg(x, z), rot, y });

  /**
   * 围网：局部 a → b 的一道。下面 2.6 米是绿色挡风布（实心暗带），上面一条更暗的"铁丝网"带；gaps = 门洞（沿线距离区间），
   * bare = 挡风布破了的那段（只剩铁丝网）。立柱每 ~6 米一根（≥ 2 纹素），挡路按段。
   */
  const fence = (
    f: Fr,
    a: V2,
    b: V2,
    h: number,
    gaps: (readonly [number, number])[] = [],
    bare: (readonly [number, number])[] = [],
  ) => {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const ux = (b[0] - a[0]) / L;
    const uz = (b[1] - a[1]) / L;
    const rr = Math.atan2(ux, uz);
    const P = (s: number): [number, number] => [a[0] + ux * s, a[1] + uz * s];
    const low = Math.min(2.6, h);
    // 挡风布、铁丝网、立柱都不投影：傍晚一道 3.6 米的围网投出来是一整条又长又直的黑带
    thin(() => {
      for (const [s0, s1] of cut(0, L, gaps)) {
        for (const [p, q] of cut(s0, s1, bare)) cube('windscreen', f, ...P((p + q) / 2), 0.1, low, q - p, 0, rr);
        for (const [p, q] of bare) {
          const lo = Math.max(p, s0);
          const hi = Math.min(q, s1);
          if (hi > lo) cube('net', f, ...P((lo + hi) / 2), 0.06, low, hi - lo, 0, rr);
        }
        if (h > low) cube('net', f, ...P((s0 + s1) / 2), 0.08, h - low, s1 - s0, low, rr);
        const n = Math.max(1, Math.round((s1 - s0) / 6));
        for (let k = 0; k <= n; k++) cube('ironwork', f, ...P(s0 + ((s1 - s0) * k) / n), 0.16, h + 0.1, 0.16, 0, rr);
        blockSeg(at(f, ...P(s0)), at(f, ...P(s1)), 0.22);
      }
    });
  };
  /** 矩形围网：门 = { side, at（沿那边从左/上量的局部坐标）, w } */
  const fenceRect = (
    f: Fr,
    x0: number,
    x1: number,
    z0: number,
    z1: number,
    h: number,
    doors: { side: 'n' | 's' | 'e' | 'w'; at: number; w?: number }[],
    bare: { side: 'n' | 's' | 'e' | 'w'; s0: number; s1: number }[] = [],
  ) => {
    const sides = {
      n: [[x0, z0] as V2, [x1, z0] as V2, x0],
      s: [[x0, z1] as V2, [x1, z1] as V2, x0],
      w: [[x0, z0] as V2, [x0, z1] as V2, z0],
      e: [[x1, z0] as V2, [x1, z1] as V2, z0],
    } as const;
    for (const k of ['n', 's', 'w', 'e'] as const) {
      const [a, b, o] = sides[k];
      const gaps = doors
        .filter((q) => q.side === k)
        .map((q) => [q.at - o - (q.w ?? 1.6) / 2, q.at - o + (q.w ?? 1.6) / 2] as const);
      const br = bare.filter((q) => q.side === k).map((q) => [q.s0 - o, q.s1 - o] as const);
      fence(f, a, b, h, gaps, br);
    }
  };

  /**
   * 一片网球场（局部 z = 长轴），标准尺寸：双打 10.97 × 23.77、单打边线 8.23、发球线离网 6.40、网柱在双打边线外 0.914。
   * 内场（双打线以内）青蓝、外场绿（外场那块由调用方在 Y.pad 整块铺，围网以内都是）—— 和俱乐部的硬地一个样子，手机上一眼认得出。
   * 网（ok / sag 下垂 / none 没了）：暗带 + 白网带 + 中间一条白中带；网和柱子不投影。裂缝只在内场里。
   */
  const court = (f: Fr, net: 'ok' | 'sag' | 'none' = 'ok', cracks = 0, rnd?: () => number) => {
    const LW = 0.1;
    const HL = 11.885;
    const HD = 5.485;
    const HS = 4.115;
    const SV = 6.4;
    flat('court', f, -HD - LW / 2, HD + LW / 2, -HL - LW / 2, HL + LW / 2, Y.court);
    const ln = (lx0: number, lx1: number, lz0: number, lz1: number) => flat('line', f, lx0, lx1, lz0, lz1, Y.line);
    for (const s of [-1, 1]) {
      ln(-HD - LW / 2, HD + LW / 2, s * HL - LW / 2, s * HL + LW / 2);
      ln(s * HD - LW / 2, s * HD + LW / 2, -HL + LW / 2, HL - LW / 2);
      ln(s * HS - LW / 2, s * HS + LW / 2, -HL + LW / 2, HL - LW / 2);
      ln(-HS + LW / 2, HS - LW / 2, s * SV - LW / 2, s * SV + LW / 2);
      ln(-LW / 2, LW / 2, s * (HL - 0.3), s * (HL - LW / 2));
    }
    ln(-LW / 2, LW / 2, -SV + LW / 2, SV - LW / 2);
    const gy = Y.court;
    thin(() => {
      for (const s of [-1, 1]) cube('ironwork', f, s * 6.4, 0, 0.18, 1.07, 0.18, gy);
      if (net !== 'none') {
        const nh = net === 'sag' ? 0.74 : 0.914;
        // 网身朝镜头、永远在背光面：用水桶蓝（暗档 L ~100，和场地同一家蓝）而不是 net 的深靛（L 36），读成透光的网而不是一堵墙
        cube('jug', f, 0, 0, 12.8, nh - 0.12, 0.06, gy);
        cube('netTape', f, 0, 0, 12.82, 0.14, 0.14, gy + nh - 0.12);
        cube('netTape', f, 0, 0, 0.1, nh - 0.12, 0.1, gy);
        blockSeg(at(f, -6.4, 0), at(f, 6.4, 0), 0.15);
      }
    });
    // 裂缝：2 纹素宽的折线 + 下沿（朝镜头）一纹素翘起的亮漆；只在内场的漆面上
    if (cracks && rnd) {
      for (let k = 0; k < cracks; k++) {
        const pts: V2[] = [];
        let lx = -HD + 0.6 + rnd() * 4;
        let lz = (rnd() < 0.5 ? -1 : 1) * (1.5 + rnd() * 8.5);
        for (let i = 0; i < 5; i++) {
          pts.push(at(f, lx, lz));
          lx += 1.2 + rnd() * 1.6;
          lz = Math.max(-HL + 0.5, Math.min(HL - 0.5, lz + (rnd() - 0.5) * 2.4));
          if (lx > HD - 0.4) break;
        }
        if (pts.length < 2) continue;
        band(
          'courtBleach',
          pts.map(([x, z]) => [x, z + 0.1] as V2),
          0.06,
          Y.crack,
        );
        band('courtCrack', pts, 0.09, Y.crack + 0.012);
      }
    }
  };

  /** 铝看台：局部 x 沿长、一排排往局部 +z 升高（人朝局部 −z 坐） */
  const bleacher = (f: Fr, len: number, rows: number, seat: PalKey = 'concrete') => {
    const step = 0.75;
    const rise = 0.4;
    // 座板、踏板也不投影：一排排板子互相投影，下午整个看台是一片抖点的横条
    thin(() => {
      for (let k = 0; k < rows; k++) {
        const y = 0.4 + k * rise;
        cube(seat, f, 0, k * step, len, 0.1, 0.42, y);
        cube(seat, f, 0, k * step - 0.4, len, 0.08, 0.32, y - 0.36);
      }
    });
    const xs = [-len / 2 + 0.3, len / 2 - 0.3];
    if (len > 10) xs.push(0);
    const top = 0.4 + (rows - 1) * rise;
    const back = (rows - 1) * step + 0.3;
    // 架子、后栏杆：细的，不投影
    thin(() => {
      for (const lx of xs) for (let k = 0; k < rows; k++) cube('ironwork', f, lx, k * step, 0.18, 0.4 + k * rise, 0.18);
      cube('ironwork', f, 0, back, len, 0.12, 0.12, top + 0.9);
      for (const lx of xs) cube('ironwork', f, lx, back, 0.16, top + 0.95, 0.16);
    });
    blockRect(f, -len / 2, len / 2, -0.6, back + 0.15);
    occupy(f, -len / 2, len / 2, -0.6, back + 0.15, 1);
  };

  /** 折叠帐篷（四条腿 + 方锥顶 + 一圈帷边） */
  const canopy = (x: number, z: number, s: number, key: PalKey, rot = 0) => {
    const f: Fr = { x, z, r: rot };
    thin(() => {
      for (const [a, b] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ])
        cube('metal', f, (a * s) / 2 - a * 0.1, (b * s) / 2 - b * 0.1, 0.14, 2.2, 0.14);
    });
    cube(key, f, 0, 0, s, 0.28, s, 2.0);
    const g = new THREE.ConeGeometry(s * Math.SQRT1_2, 0.8, 4).rotateY(Math.PI / 4 + rot).translate(x, 2.28 + 0.4, z);
    putG(reg(x, z), key, g);
  };

  /** 小汽车：局部 z = 车头方向的长轴 */
  const car = (x: number, z: number, rot: number, key: PalKey, truck = false) => {
    const f: Fr = { x, z, r: rot };
    thin(() => cube('net', f, 0, 0, 1.7, 0.3, 3.8, 0)); // 底盘：影子被车身的盖住，不投
    cube(key, f, 0, 0, 1.85, 0.72, 4.3, 0.28);
    if (truck) {
      cube(key, f, 0, -0.9, 1.75, 0.66, 1.7, 1.0);
      cube('jug', f, 0, -1.78, 1.6, 0.42, 0.06, 1.12);
      cube('net', f, 0, 1.1, 1.6, 0.08, 1.9, 1.0);
    } else {
      cube(key, f, 0, 0.25, 1.65, 0.58, 2.2, 1.0);
      cube('jug', f, 0, -0.88, 1.5, 0.42, 0.06, 1.08);
    }
    blockRect(f, -0.95, 0.95, -2.2, 2.2);
    occupy(f, -1, 1, -2.3, 2.3, 0.5);
  };

  /** 小飞机（上单翼，局部 −z = 机头）；s 缩放 */
  const plane = (x: number, z: number, rot: number, stripe: PalKey, s = 1) => {
    const f: Fr = { x, z, r: rot };
    const c = (key: PalKey, lx: number, lz: number, w: number, h: number, dp: number, y: number) =>
      cube(key, f, lx * s, lz * s, w * s, h * s, dp * s, y * s);
    c('clothWhite', 0, 0, 1.25, 1.3, 7.2, 0.55);
    c('clothWhite', 0, -4.0, 1.1, 1.05, 1.0, 0.65);
    c('ironwork', 0, -4.6, 0.18, 2.0, 0.12, 0.2);
    c('jug', 0, -2.4, 1.1, 0.55, 1.0, 1.55);
    thin(() => c('clothWhite', 0, -1.4, 11, 0.16, 1.6, 2.05)); // 机翼：薄板，不投影
    c(stripe, 0, 0.3, 1.28, 0.22, 7.0, 1.05);
    c('clothWhite', 0, 4.6, 0.7, 0.75, 2.6, 0.95);
    c(stripe, 0, 5.6, 0.14, 1.5, 1.4, 1.35);
    thin(() => c('clothWhite', 0, 5.7, 3.6, 0.12, 1.0, 1.2));
    for (const sx of [-1, 1]) c('net', sx * 1.2, -0.6, 0.28, 0.55, 0.45, 0);
    c('net', 0, -3.6, 0.24, 0.6, 0.35, 0);
    blockRect(f, -0.8 * s, 0.8 * s, -4.8 * s, 6.4 * s);
    blockRect(f, -5.5 * s, 5.5 * s, -2.2 * s, -0.6 * s);
    occupy(f, -5.6 * s, 5.6 * s, -5 * s, 6.5 * s, 1);
  };

  /** 高尔夫球车 */
  const gcart = (x: number, z: number, rot: number) => {
    const f: Fr = { x, z, r: rot };
    cube('clothWhite', f, 0, 0, 1.2, 0.7, 2.4, 0.2);
    cube('clothTeal', f, 0, 0.2, 1.1, 0.25, 0.7, 0.9);
    for (const [a, b] of [
      [-0.5, -0.9],
      [0.5, -0.9],
      [-0.5, 0.9],
      [0.5, 0.9],
    ])
      cube('metal', f, a, b, 0.1, 1.1, 0.1, 0.9);
    cube('clothWhite', f, 0, 0, 1.3, 0.1, 2.1, 2.0);
    blockRect(f, -0.65, 0.65, -1.25, 1.25);
  };

  /** 长椅（局部 x 沿长） */
  const bench = (f: Fr, len = 1.8) => {
    // 旧木头色（wood 的橙太冲，竖着看是一根橙色的杆）
    cube('woodWeathered', f, 0, 0, len, 0.1, 0.45, 0.42);
    cube('woodWeathered', f, 0, 0.2, len, 0.4, 0.08, 0.55);
    for (const s of [-1, 1]) cube('ironwork', f, (s * len) / 2 - s * 0.15, 0, 0.14, 0.42, 0.4);
    blockRect(f, -len / 2, len / 2, -0.3, 0.3);
  };

  /** 野餐桌 */
  const picnic = (x: number, z: number, rot = 0) => {
    const f: Fr = { x, z, r: rot };
    cube('wood', f, 0, 0, 2.0, 0.1, 0.8, 0.72);
    for (const s of [-1, 1]) cube('wood', f, 0, s * 0.75, 2.0, 0.08, 0.3, 0.42);
    for (const s of [-1, 1]) cube('woodWeathered', f, s * 0.75, 0, 0.14, 0.72, 1.6);
    blockRect(f, -1.0, 1.0, -0.95, 0.95);
  };

  /**
   * 灯杆（顶上一个灯头，奶油色：暗档也亮）；不投影。pool = 夜里照亮的那一圈 [x, z, 半径]（clubsite/daylight 天黑自动开，
   * 只挑离镜头最近的几盏）
   */
  const lamp = (x: number, z: number, h = 9, rot = 0, pool?: [number, number, number]) => {
    thin(() => {
      wcube('ironwork', x, z, 0.24, h, 0.24);
      wcube('signPaint', x, z, 1.0, 0.32, 0.5, h, rot);
    });
    d.block({ x, z, r: 0.3 });
    if (pool) {
      const o = new THREE.Object3D();
      o.name = 'valley:east:lamp';
      const v: [number, number, number, number] = [pool[0], pool[1], pool[2], h + 0.6];
      o.userData.night = { pool: () => v };
      d.root.add(o);
    }
  };

  park();
  school();
  airport();
  golf();
  neighborhoods();
  groves();
  placeInstances();

  // ════════════════════════════════════════════════════════════════════
  // 日出公园（GREENS.sunrise_park；游泳中心、公园路从 layout 读）
  // ════════════════════════════════════════════════════════════════════
  function park(): void {
    const rnd = d.rng('valley:east:park');
    // 第三轮（山谷整体缩到 0.7）：公园 126 × 119 米。位置都从公园的多边形、游泳中心、公园路推出来，大小不缩（球场照标准）。
    // 北半边四片球场；球场南边：西边公开课的硬地、中间到球场南门的小路、东边对墙练习场；游泳中心南边室外池；
    // 公园路南边：野餐棚、游乐场、厕所、篮球半场。（原来球场东边的看台放不下，删了）
    const pk = bbox(GREENS.find((q) => q.id === 'sunrise_park')?.poly ?? []);
    const sw = BUILDINGS.find((b) => b.id === 'swim_center') ?? { x: pk.x1 - 35, z: pk.z0 + 42, w: 30, d: 20 };
    const lane = road('park_lane');
    const laneZ = (x: number) => (lane ? zAt(lane.pts, x) : pk.z1 - 20);
    // ── 公共球场：四片一排，南北向（真实的球场都这么摆，下午不晃眼）；西沿伸出草地 2 米（日出大道还在 5 米外） ──
    const BX0 = pk.x0 - 2;
    const BX1 = BX0 + 74;
    const BZ0 = pk.z0 + 1;
    const BZ1 = BZ0 + 38;
    const CZ = (BZ0 + BZ1) / 2;
    flat('surround', W0, BX0, BX1, BZ0, BZ1, Y.pad);
    const cxs = [0, 1, 2, 3].map((i) => BX0 + 9.25 + i * 18.5);
    // 1 号场：网被偷了只剩网柱，前面一个路障；4 号场：漆面裂了、网塌着 —— 都是"要人管"的样子
    court({ x: cxs[0], z: CZ, r: 0 }, 'none');
    court({ x: cxs[1], z: CZ, r: 0 }, 'ok');
    court({ x: cxs[2], z: CZ, r: 0 }, 'ok', 1, rnd);
    court({ x: cxs[3], z: CZ, r: 0 }, 'sag', 4, rnd);
    // 1 号场的路障（橙白锯马 + 一块牌子）
    {
      const f: Fr = { x: cxs[0], z: CZ + 4, r: 0 };
      cube('toolOrange', f, 0, 0, 2.6, 0.22, 0.14, 0.8);
      cube('clothWhite', f, 0, 0, 2.6, 0.16, 0.14, 0.55);
      for (const s of [-1, 1]) cube('woodWeathered', f, s * 1.1, 0, 0.14, 1.0, 0.5);
      cube('signBoard', f, 0, -0.1, 0.9, 0.6, 0.08, 1.05);
      blockRect(f, -1.3, 1.3, -0.3, 0.3);
    }
    // 围网 3.6 米：南边中间一个门（2、3 号场之间，小路从公园路过来），西边一个门；北边一段挡风布破了
    const GX = BX0 + 37;
    fenceRect(
      W0,
      BX0,
      BX1,
      BZ0,
      BZ1,
      3.6,
      [
        { side: 's', at: GX },
        { side: 'w', at: CZ },
      ],
      [{ side: 'n', s0: BX0 + 58, s1: BX0 + 66 }],
    );
    occupy(W0, BX0, BX1, BZ0, BZ1, 1.5);
    // 灯杆：围网外六根（南边中间那根让开门口）；夜里照亮场地：每盏往场里 8 米为圆心、半径 10 米
    for (const x of [BX0 - 0.8, GX, BX1 + 0.8])
      for (const z of [BZ0 - 0.8, BZ1 + 0.8]) {
        const lx = x === GX && z > CZ ? GX + 2.6 : x;
        lamp(lx, z, 9, 0, [x + Math.sign(GX - x) * 7, z + Math.sign(CZ - z) * 8, 10]);
      }
    // 每片场南边一条长椅（场里），3 号场围网上一块翻分牌
    for (const cx of cxs) bench({ x: cx + 4.5, z: BZ1 - 1.4, r: 0 });
    thin(() => {
      wcube('signBoard', cxs[2] - 3, BZ1 + 0.16, 1.4, 1.0, 0.1, 1.1);
      wcube('signPaint', cxs[2] - 3, BZ1 + 0.22, 1.0, 0.5, 0.06, 1.35);
    });
    // 球：攒在围网脚下、网前（一堆一堆，不撒满）
    const pile = (x: number, z: number, n: number, rx: number, rz: number) => {
      for (let k = 0; k < n; k++) inst.ball.push(item(x + (rnd() - 0.5) * rx, z + (rnd() - 0.5) * rz));
    };
    pile(cxs[1] - 6, BZ0 + 0.6, 7, 4, 0.6);
    pile(cxs[2] + 5, BZ1 - 0.6, 6, 3, 0.6);
    pile(cxs[2] - 2, CZ + 1, 4, 3, 1.2);

    // ── 对墙练习墙：天才少年傍晚在这儿打（POI p_kid 在公园路尽头，场地在它北边，不压路） ──
    {
      const WX = BX1 - 15;
      const WZ = BZ1 + 2.4;
      const SZ = WZ + 18; // 场地南沿
      flat('surround', W0, WX - 14, WX + 14, WZ - 0.6, SZ + 2, Y.pad);
      flat('court', W0, WX - 11, WX + 11, WZ, SZ, Y.court);
      // 场地上的线：一条"网线"距离（6.4 米）的发球线和中线
      flat('line', W0, WX - 8, WX + 8, WZ + 6.35, WZ + 6.45, Y.line);
      flat('line', W0, WX - 0.05, WX + 0.05, WZ, WZ + 6.35, Y.line);
      // 站的地方磨白了（他几年来每天站在这儿）
      disc('courtBleach', WX + 1, WZ + 11.5, 1.8, 1.1, Y.line, 0, 10);
      // 墙 3 米（真的对墙练习墙差不多这么高）。不投影：傍晚一道 16 米的墙投出来是又长又直的黑带
      thin(() => wcube('windscreen', WX, WZ - 0.2, 16, 3.0, 0.4));
      wcube('netTape', WX, WZ + 0.02, 16, 0.12, 0.06, 0.91); // 墙上画的网高线
      wcube('toolOrange', WX - 4, WZ + 0.02, 0.7, 0.7, 0.06, 1.7); // 胶带贴的靶子
      wcube('toolOrange', WX + 4.5, WZ + 0.02, 0.7, 0.7, 0.06, 1.3);
      for (const s of [-1, 1]) wcube('ironwork', WX + s * 8.1, WZ - 0.2, 0.26, 3.2, 0.5);
      blockSeg([WX - 8, WZ - 0.2], [WX + 8, WZ - 0.2], 0.35);
      occupy(W0, WX - 14, WX + 14, WZ - 1, SZ + 2, 1);
      // 墙脚一排球、场上散的几个
      for (let k = 0; k < 9; k++) inst.ball.push(item(WX - 7 + rnd() * 14, WZ + 0.4 + rnd() * 0.8));
      for (let k = 0; k < 5; k++) inst.ball.push(item(WX - 6 + rnd() * 12, WZ + 3 + rnd() * 9));
      // 他的包、一筐球
      wcube('clothRed', WX + 9.3, SZ - 2.4, 0.95, 0.36, 0.38, 0, 0.3);
      wcube('metal', WX - 6.5, SZ - 3, 0.7, 0.75, 0.7);
      wcube('ball', WX - 6.5, SZ - 3, 0.6, 0.22, 0.6, 0.75);
      // 西边一条长椅（朝东）、东边一根老路灯（傍晚就靠它；游泳中心在 3 米外）
      bench({ x: WX - 12.6, z: WZ + 10, r: Math.PI / 2 });
      lamp(WX + 15.5, SZ - 6, 6, 0, [WX + 3, WZ + 8, 9]);
    }
    // 公开课的硬地（球场西南、南门小路的西边）：两片匹克球场（标准 6.1 × 13.4，网前 2.13 米的"厨房"线）
    const CX0 = pk.x0;
    const CX1 = GX - 2;
    const CZ0 = BZ1 + 3;
    const CZ1 = CZ0 + 22;
    const PKX = (CX0 + CX1) / 2 - 1;
    flat('asphalt', W0, CX0, CX1, CZ0, CZ1, Y.pad);
    for (const cz of [CZ0 + 5.5, CZ0 + 16]) {
      const f: Fr = { x: PKX, z: cz, r: Math.PI / 2 }; // 小场长轴沿东西
      flat('pickle', f, -3.6, 3.6, -7.6, 7.6, Y.court);
      const ln = (a: number, b: number, c: number, e: number) => flat('line', f, a, b, c, e, Y.line);
      for (const s of [-1, 1]) {
        ln(-3.05, 3.05, s * 6.7 - 0.05, s * 6.7 + 0.05);
        ln(s * 3.05 - 0.05, s * 3.05 + 0.05, -6.65, 6.65);
        ln(-3, 3, s * 2.13 - 0.05, s * 2.13 + 0.05);
        ln(-0.05, 0.05, s * 2.18, s * 6.65);
      }
      thin(() => {
        for (const s of [-1, 1]) cube('ironwork', f, s * 3.35, 0, 0.14, 0.92, 0.14, Y.court);
        cube('jug', f, 0, 0, 6.7, 0.74, 0.06, Y.court);
        cube('netTape', f, 0, 0, 6.72, 0.12, 0.12, Y.court + 0.74);
      });
      blockSeg(at(f, -3.4, 0), at(f, 3.4, 0), 0.15);
    }
    // 锥桶：两条折线（步伐练习，在两片场之间、南沿）
    for (let k = 0; k < 5; k++) {
      inst.cone.push(item(CX0 + 2 + k * 1.4, CZ0 + 10.4 + (k % 2) * 0.8));
      inst.cone.push(item(CX1 - 9 + k * 1.4, CZ1 - 1.2 + (k % 2) * 0.5));
    }
    // 帐篷、一桌、一筐球（东头，网和小路之间）
    const TX = CX1 - 3;
    canopy(TX, CZ0 + 3, 3.6, 'clothTeal');
    wcube('clothWhite', TX, CZ0 + 3, 2.0, 0.75, 0.8);
    wcube('metal', TX, CZ0 + 10.4, 0.85, 0.8, 0.6);
    wcube('ball', TX, CZ0 + 10.4, 0.75, 0.25, 0.5, 0.8);
    d.block({ x: TX, z: CZ0 + 3, r: 1.4 });
    occupy(W0, CX0, CX1, CZ0, CZ1, 1);

    // ── 游泳中心南边的室外池 ──
    {
      const X0 = sw.x - sw.w / 2 + 2;
      const X1 = Math.min(pk.x1 - 2, X0 + 46);
      const Z0 = sw.z + sw.d / 2 + 4.5;
      const Z1 = Z0 + 33.5;
      // 池边铺陶砖（同俱乐部前台的萨尔蒂略陶砖；浅色碎石铺地整片发白，正午整屏饱和度只有 0.34）
      flat('tile', W0, X0, X1, Z0, Z1, Y.pad);
      // 池子 25 × 13，池沿高出一点
      const px0 = X0 + 11;
      const px1 = px0 + 26;
      const pz0 = Z0 + 8.5;
      const pz1 = pz0 + 14;
      flat('water', W0, px0, px1, pz0, pz1, 0.1);
      wcube('concrete', (px0 + px1) / 2, pz0, px1 - px0 + 0.6, 0.18, 0.6);
      wcube('concrete', (px0 + px1) / 2, pz1, px1 - px0 + 0.6, 0.18, 0.6);
      wcube('concrete', px0, (pz0 + pz1) / 2, 0.6, 0.18, pz1 - pz0);
      wcube('concrete', px1, (pz0 + pz1) / 2, 0.6, 0.18, pz1 - pz0);
      // 泳道绳（红白交替）
      for (let k = 1; k < 6; k++)
        wcube(k % 2 ? 'clothRed' : 'clothWhite', (px0 + px1) / 2, pz0 + k * (14 / 6), 25.4, 0.08, 0.14, 0.1);
      // 出发台
      for (let k = 0; k < 6; k++) wcube('clothWhite', px0 - 0.6, pz0 + (k + 0.5) * (14 / 6), 0.55, 0.6, 0.55);
      d.block({
        poly: [
          [px0, pz0],
          [px1, pz0],
          [px1, pz1],
          [px0, pz1],
        ],
      });
      // 儿童浅池（西南角）
      const kx = X0 + 5;
      const kz = Z1 - 7;
      flat('water', W0, kx - 3, kx + 3, kz - 3, kz + 3, 0.08);
      for (const [x, z, w, dp] of [
        [kx, kz - 3, 6.4, 0.4],
        [kx, kz + 3, 6.4, 0.4],
        [kx - 3, kz, 0.4, 6],
        [kx + 3, kz, 0.4, 6],
      ])
        wcube('concrete', x, z, w, 0.14, dp);
      // 救生椅（南边池沿，朝北）
      {
        const f: Fr = { x: (px0 + px1) / 2, z: pz1 + 2.4, r: 0 };
        thin(() => {
          for (const [a, b] of [
            [-0.4, -0.4],
            [0.4, -0.4],
            [-0.4, 0.4],
            [0.4, 0.4],
          ])
            cube('clothWhite', f, a, b, 0.16, 1.9, 0.16);
          cube('metal', f, 0.6, 0.3, 0.12, 3.0, 0.12, 0);
        });
        cube('clothWhite', f, 0, 0, 1.0, 0.14, 0.9, 1.9);
        cube('clothWhite', f, 0, 0.4, 1.0, 0.8, 0.12, 2.0);
        putG(reg(f.x, f.z), 'clothRed', new THREE.ConeGeometry(1.1, 0.5, 6).translate(f.x + 0.6, 3.2, f.z + 0.3));
        blockRect(f, -0.6, 0.6, -0.6, 0.6);
      }
      // 东边一排遮阳伞 + 躺椅
      const UMB: PalKey[] = ['canvasStripe', 'clothTeal', 'flowerYellow'];
      const ux = X1 - 4;
      [Z0 + 4, Z0 + 14, Z0 + 24].forEach((z, i) => {
        thin(() => wcube('metal', ux, z, 0.14, 2.4, 0.14));
        putG(reg(ux, z), UMB[i], new THREE.ConeGeometry(1.6, 0.6, 8).translate(ux, 2.6, z));
        for (const s of [-1, 1]) wcube('clothWhite', ux + s * 1.6, z + 0.4, 0.75, 0.32, 1.9);
        d.block({ x: ux, z: z + 0.4, r: 2.2 });
      });
      // 池子围栏：两道横杆 + 立柱（不是一排细栏杆），北边（对着游泳中心的门）、西边（对着公园路尽头）各一个门
      const rail = (a: V2, b: V2, gaps: [number, number][]) => {
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const rx = (b[0] - a[0]) / L;
        const rz = (b[1] - a[1]) / L;
        const rr = Math.atan2(rx, rz);
        for (const [s0, s1] of cut(0, L, gaps)) {
          const m = (s0 + s1) / 2;
          thin(() => {
            for (const y of [0.45, 1.35])
              cube('ironwork', W0, a[0] + rx * m, a[1] + rz * m, 0.12, 0.12, s1 - s0, y, rr);
            const n = Math.max(1, Math.round((s1 - s0) / 3));
            for (let k = 0; k <= n; k++) {
              const s = s0 + ((s1 - s0) * k) / n;
              cube('ironwork', W0, a[0] + rx * s, a[1] + rz * s, 0.14, 1.5, 0.14, 0, rr);
            }
          });
          blockSeg([a[0] + rx * s0, a[1] + rz * s0], [a[0] + rx * s1, a[1] + rz * s1], 0.2);
        }
      };
      const doorN = sw.x - X0;
      const doorW = 20.6;
      rail([X0, Z0], [X1, Z0], [[doorN - 1.2, doorN + 1.2]]);
      rail([X0, Z1], [X1, Z1], []);
      rail([X0, Z0], [X0, Z1], [[doorW, doorW + 3.2]]);
      rail([X1, Z0], [X1, Z1], []);
      occupy(W0, X0, X1, Z0, Z1, 1.5);
      // 游泳中心的门头：招牌 + 雨篷
      const fz = sw.z + sw.d / 2;
      wcube('signBoard', sw.x, fz + 0.1, 9, 1.3, 0.12, 3.9);
      wcube('signPaint', sw.x, fz + 0.2, 6.5, 0.5, 0.1, 4.3);
      wcube('clothTeal', sw.x, fz + 1.6, 6, 0.24, 3.2, 3.0);
      thin(() => {
        for (const s of [-1, 1]) wcube('metal', sw.x + s * 2.8, fz + 2.9, 0.16, 3.0, 0.16);
      });
      occupy(W0, sw.x - sw.w / 2 - 1, sw.x + sw.w / 2 + 1, sw.z - sw.d / 2, fz + 3.2, 1);
      // 公园路尽头 → 池子西门的一小段路
      if (lane) {
        const e = lane.pts[lane.pts.length - 1];
        band(
          'path',
          [
            [e[0] + lane.w / 2, e[1] + 1],
            [X0 - 2.5, Z0 + doorW + 1.6],
            [X0 + 0.5, Z0 + doorW + 1.6],
          ],
          1.1,
          Y.path,
        );
      }
    }
    // 篮球半场（东南角；篮板在北头）
    {
      const x0 = pk.x1 - 22;
      const z0 = pk.z1 - 25;
      flat('asphalt', W0, x0, x0 + 18, z0, z0 + 16, Y.pad);
      flat('court', W0, x0 + 6.6, x0 + 11.4, z0, z0 + 5.8, Y.court); // 罚球区（蓝）
      flat('line', W0, x0 + 0.3, x0 + 17.7, z0 + 15.65, z0 + 15.75, Y.court);
      flat('line', W0, x0 + 6.5, x0 + 11.5, z0 + 5.7, z0 + 5.9, Y.line);
      thin(() => wcube('ironwork', x0 + 9, z0 - 0.4, 0.24, 3.2, 0.24));
      wcube('clothWhite', x0 + 9, z0 + 0.4, 1.8, 1.05, 0.1, 2.75);
      wcube('toolOrange', x0 + 9, z0 + 0.8, 0.5, 0.06, 0.5, 3.05);
      d.block({ x: x0 + 9, z: z0 - 0.4, r: 0.35 });
      occupy(W0, x0, x0 + 18, z0, z0 + 16, 1);
    }
    // 厕所（篮球场西边）
    {
      const x = pk.x1 - 37;
      const z = pk.z1 - 15;
      wcube('adobe', x, z, 9, 3.2, 6);
      wcube('concrete', x, z, 10, 0.3, 7, 3.2);
      for (const s of [-1, 1]) wcube('signBoard', x + s * 2.2, z + 3.05, 1.1, 2.1, 0.1);
      blockRect(W0, x - 4.6, x + 4.6, z - 3.2, z + 3.2);
      occupy(W0, x - 5, x + 5, z - 3.5, z + 3.5, 1);
      wcube('metal', x - 8, z + 3.5, 0.6, 0.95, 0.5);
    }

    // ── 野餐棚、儿童游乐场（公园路南边） ──
    {
      const f: Fr = { x: pk.x0 + 14, z: pk.z1 - 11, r: 0.08 };
      for (const [a, b] of [
        [-3.6, -2.6],
        [3.6, -2.6],
        [-3.6, 2.6],
        [3.6, 2.6],
      ]) {
        cube('wood', f, a, b, 0.3, 3.0, 0.3);
        d.block({ x: at(f, a, b)[0], z: at(f, a, b)[1], r: 0.3 });
      }
      // 四坡的瓦顶（一块平板读不出是棚子）
      cube('roofTile', f, 0, 0, 9, 0.25, 6.8, 3.0);
      putG(
        reg(f.x, f.z),
        'roofTile',
        new THREE.ConeGeometry(1, 1.1, 4)
          .rotateY(Math.PI / 4)
          .scale(9 * Math.SQRT1_2, 1, 6.8 * Math.SQRT1_2)
          .rotateY(f.r)
          .translate(f.x, 3.25 + 0.55, f.z),
      );
      picnic(...at(f, -3, -0.5), 0.08);
      picnic(...at(f, 3, 0.5), 0.08);
      wcube('net', ...at(f, 6.5, 4.4), 0.8, 0.9, 0.6);
      occupy(f, -4.5, 4.5, -3.4, 3.4, 1);
      // 游乐场：一块沙坑地（沙漠里的游乐场铺沙，不是红土那种饱和的橙）+ 一座塔（红顶）+ 滑梯 + 秋千
      const gx = pk.x0 + 47;
      const gz = pk.z1 - 11;
      disc('sandHigh', gx, gz, 9, 6.5, Y.pad, 0, 18);
      const t: Fr = { x: gx - 3, z: gz - 2, r: 0 };
      for (const [a, b] of [
        [-1.4, -1.4],
        [1.4, -1.4],
        [-1.4, 1.4],
        [1.4, 1.4],
      ])
        thin(() => cube('clothBlue', t, a, b, 0.2, 3.2, 0.2));
      cube('wood', t, 0, 0, 3.2, 0.2, 3.2, 1.6);
      cube('clothBlue', t, 0, 1.55, 3.0, 0.7, 0.1, 1.8);
      putG(
        reg(t.x, t.z),
        'clothRed',
        new THREE.ConeGeometry(2.4, 1.4, 4).rotateY(Math.PI / 4).translate(t.x, 3.9, t.z),
      );
      // 滑梯：从平台往南滑下
      {
        const g = box(1.0, 0.16, 4.0, 0, -0.08, 0)
          .rotateX(-0.42)
          .translate(t.x, 0.9, t.z + 1.4 + 1.85);
        putG(reg(t.x, t.z), 'flowerYellow', g);
      }
      blockRect(t, -1.6, 1.6, -1.6, 4.8);
      // 秋千
      const s: Fr = { x: gx + 4.5, z: gz + 1, r: 0 };
      thin(() => {
        for (const sx of [-2.2, 2.2]) {
          cube('clothTeal', s, sx, -0.9, 0.18, 2.6, 0.18);
          cube('clothTeal', s, sx, 0.9, 0.18, 2.6, 0.18);
        }
        cube('clothTeal', s, 0, 0, 4.8, 0.18, 0.18, 2.5);
      });
      for (const sx of [-0.9, 0.9]) cube('clothRed', s, sx, 0, 0.6, 0.1, 0.3, 0.5);
      for (const sx of [-2.2, 2.2]) blockSeg(at(s, sx, -0.9), at(s, sx, 0.9), 0.2);
      occupy(W0, gx - 9, gx + 9, gz - 6.5, gz + 6.5, 1);
    }

    // ── 公交站（日出大道边，朝西）、公园路口的斑马线（横过日出大道） ──
    const sr = road('sunrise');
    if (sr && lane) {
      const j = lane.pts[0];
      const bz = j[1] - 17.5;
      const [rx] = nearestOn(sr.pts, j[0], bz);
      const f: Fr = { x: rx + sr.w / 2 + 2, z: bz, r: Math.PI / 2 };
      cube('clothTeal', f, 0, 0.2, 4.2, 0.14, 1.8, 2.4);
      cube('signBoard', f, 0, 0.9, 4.2, 1.8, 0.1, 0.4);
      thin(() => {
        for (const s of [-1, 1]) cube('metal', f, s * 2, 0.9, 0.14, 2.4, 0.14);
        cube('metal', f, 2.6, -0.4, 0.14, 2.6, 0.14);
      });
      cube('wood', f, 0, 0.5, 3.2, 0.1, 0.45, 0.45);
      cube('signBoard', f, 2.6, -0.4, 0.5, 0.5, 0.08, 2.2);
      blockRect(f, -2.1, 2.1, 0.6, 1.0);
      occupy(f, -2.6, 2.6, -0.5, 1.2, 1);
      const cz = j[1] - 7;
      const [cx] = nearestOn(sr.pts, j[0], cz);
      for (let k = 0; k < 6; k++) wcube('line', cx - 4 + k * 1.6, cz, 0.7, 0.02, 3.2, 0.035);
    }

    // ── 公园里的路：公园路 → 球场南门（从公开课和练习场中间穿过） ──
    band(
      'path',
      [
        [GX, laneZ(GX) - (lane?.w ?? 7) / 2 - 0.5],
        [GX, BZ1 + 0.6],
      ],
      1.1,
      Y.path,
    );
    // 公园路南边一条停车带（三辆车）
    if (lane) {
      const [a, b] = [lane.pts[1], lane.pts[2]];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const u: V2 = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
      const n: V2 = [-u[1], u[0]]; // 朝东南（公园南边）
      const rot = Math.atan2(u[0], u[1]);
      const P = (t: number, o: number): V2 => [a[0] + u[0] * t + n[0] * o, a[1] + u[1] * t + n[1] * o];
      // 贴着路边（和路同一层同一个材质：接缝看不出来、也不闪）
      band('asphalt', [P(L * 0.18, lane.w / 2 + 1.4), P(L * 0.9, lane.w / 2 + 1.4)], 1.4, 0.03);
      const CAR: PalKey[] = ['concrete', 'carRed', 'clothWhite'];
      [0.3, 0.45, 0.75].forEach((t, i) => {
        const [x, z] = P(L * t, lane.w / 2 + 1.5);
        car(x, z, rot, CAR[i], i === 2);
      });
    }

    // ── 树：手摆几团（公园南沿、公开课和公园路之间、游泳中心东边），不满地撒 ──
    for (const [x, z, s] of [
      [pk.x0 + 4, pk.z1 - 3, 1.0],
      [pk.x0 + 34, pk.z1 - 4, 0.9],
      [pk.x0 + 62, pk.z1 - 4, 0.85],
      [pk.x1 - 2, pk.z1 - 3, 0.9],
      [pk.x0 + 26, CZ1 + 13, 0.9],
      [pk.x0 + 4, CZ1 + 10, 0.8],
      [sw.x + sw.w / 2 + 10, sw.z - 2, 1.0],
    ])
      inst.tree.push(item(x, z, s, rnd() * 6));
    // 公园入口那对棕榈（公园路两边）
    if (lane) {
      const x = pk.x0 + 1;
      for (const s of [-1, 1]) inst.palm.push(item(x, laneZ(x) + s * 6.5, 1.0, rnd() * 6));
    }
  }

  // ════════════════════════════════════════════════════════════════════
  // 棕榈泉高中（教学楼、体育馆从 BUILDINGS 读，跑道中心同 build.ts 的 S(795, −700)）
  // ════════════════════════════════════════════════════════════════════
  function school(): void {
    const rnd = d.rng('valley:east:school');
    // 第三轮（山谷缩到 0.7）：位置都从教学楼、体育馆、跑道中心（build.ts 同一个 S(795, −700)）、学校车道推出来，大小不缩。
    // 教学楼南面到跑道只剩 19 米：前门广场 + 校际赛放这条；看台挪到跑道南边（朝北看）；跳远沙坑、记分牌放不下，删了。
    const mb = BUILDINGS.find((b) => b.id === 'school_main') ?? { x: 616, z: -553, w: 70, d: 40 };
    const gym = BUILDINGS.find((b) => b.id === 'school_gym') ?? { x: 658, z: -504, w: 36, d: 30 };
    const [TKX, TKZ] = S(795, -700);
    const mx0 = mb.x - mb.w / 2;
    const mx1 = mb.x + mb.w / 2;
    const mz1 = mb.z + mb.d / 2; // 教学楼南面
    const gz0 = gym.z - gym.d / 2;
    const gz1 = gym.z + gym.d / 2;
    const EX = mx0 + 32; // 正门（学校车道贴着楼的西半边进来、尽头在 x 602，门开在车道东边）
    // ── 教学楼：南立面两条带形窗（每 4 米一根窗棂）、入口雨篷、校名 ──
    {
      const zf = mz1 + 0.05;
      // 车道压着楼的西半边南面走（layout 的学校车道）：那一段墙上不贴窗带（贴了就是路面上的东西）
      for (const y of [1.9, 5.5])
        for (let x = mx0 + 2; x < mx1 - 2; x += 4.2)
          if (roadGap(x + 2, zf + 0.5) > 2.5) wcube('signBoard', x + 2, zf, 3.8, 1.3, 0.1, y);
      wcube('concrete', EX, mz1 + 2, 8, 0.35, 3.6, 3.4);
      for (const s of [-1, 1]) wcube('concrete', EX + s * 3.6, mz1 + 3.4, 0.32, 3.4, 0.32);
      wcube('net', EX, zf, 3.4, 2.5, 0.12);
      wcube('signPaint', mx0 + 41, zf, 16, 0.9, 0.12, 7.3);
      wcube('clothRed', mx0 + 41, zf + 0.02, 17, 0.2, 0.1, 8.3);
      // 体育馆：南面两扇大门（对着校队球场的北门）、一条校色带、屋顶空调
      for (const s of [-1, 1]) wcube('clothRed', gym.x + s * 7, gz1 + 0.05, 4, 3.2, 0.12);
      wcube('clothRed', gym.x, gz1 + 0.05, gym.w, 0.9, 0.1, 8.0);
      for (const dx of [-10, 4, 13]) wcube('metal', gym.x + dx, gym.z - 2, 2.4, 1.3, 2.2, 10);
      // 两楼之间的连廊（L 形，蓝绿顶）：教学楼东面 → 体育馆北面
      const walk = (a: V2, b: V2) => {
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const u: V2 = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
        const rot = Math.atan2(u[0], u[1]);
        cube('clothTeal', W0, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 3.2, 0.2, L, 3.0, rot);
        for (let s = 0; s <= L; s += 5) {
          const x = a[0] + u[0] * s;
          const z = a[1] + u[1] * s;
          thin(() => {
            for (const o of [-1.4, 1.4]) wcube('metal', x - u[1] * o, z + u[0] * o, 0.18, 3.0, 0.18);
          });
        }
      };
      walk([mx1 + 0.5, mz1 - 3], [gym.x, mz1 - 3]);
      walk([gym.x, mz1 - 3], [gym.x, gz0 - 0.5]);
    }
    // 前门广场（压在学校车道的尽头上面；车道贴着楼的南面走，东西都摆在车道南边）
    const PZ1 = TKZ - 24 - 1;
    flat('path', W0, mx0 - 9, EX + 16, mz1 + 1, PZ1, Y.path);
    const SZ = PZ1 - 8; // 车道南边那一条的中线
    // 旗杆、旗：不投影
    const FX = EX - 15;
    thin(() => {
      wcube('ironwork', FX, SZ, 0.2, 10, 0.2);
      wcube('clothRed', FX + 1.05, SZ, 1.9, 0.38, 0.06, 9.0);
      wcube('clothWhite', FX + 1.05, SZ, 1.9, 0.38, 0.06, 8.62);
      wcube('clothRed', FX + 1.05, SZ, 1.9, 0.38, 0.06, 8.24);
      wcube('clothBlue', FX + 0.5, SZ, 0.8, 0.76, 0.08, 8.62);
    });
    d.block({ x: FX, z: SZ, r: 0.3 });
    // 校牌（矮土坯墩 + 蓝牌）：广场西南角外
    {
      const x = mx0 - 14;
      const z = PZ1 - 3;
      wcube('adobe', x, z, 5, 1.3, 1.0);
      wcube('signBoard', x, z + 0.55, 4.2, 0.7, 0.1, 0.35);
      blockRect(W0, x - 2.5, x + 2.5, z - 0.5, z + 0.5);
    }
    // 两个花池各一棵棕榈
    for (const x of [mx0 - 6, EX + 13]) {
      const z = SZ + 0.5;
      wcube('adobe', x, z, 2.6, 0.55, 2.6);
      flat('lawn', { x, z, r: 0 }, -1.1, 1.1, -1.1, 1.1, 0.56);
      inst.palm.push(item(x, z, 0.9, rnd() * 6, 0.55));
      d.block({ x, z, r: 1.4 });
    }
    // 校际赛：主队红帐篷、客队蓝帐篷，中间记分台，后面一条横幅
    const EZ = PZ1 - 3.4;
    canopy(EX - 12, EZ, 3.6, 'clothRed');
    canopy(EX + 12, EZ, 3.6, 'clothBlue');
    wcube('clothWhite', EX, EZ, 2.6, 0.8, 0.8);
    // 横幅：一块布 + 两根杆，不投影
    thin(() => {
      for (const s of [-1, 1]) wcube('metal', EX + s * 6, SZ + 1, 0.16, 3.1, 0.16);
      wcube('clothTeal', EX, SZ + 1, 11.6, 1.1, 0.08, 1.9);
      wcube('signPaint', EX, SZ + 1.07, 7, 0.4, 0.06, 2.25);
    });
    for (const s of [-1, 1]) d.block({ x: EX + s * 6, z: SZ + 1, r: 0.25 });
    // 两队的球包一排（帐篷前面）
    for (let k = 0; k < 4; k++) {
      wcube('clothRed', EX - 13.8 + k * 1.2, EZ + 2.3, 0.9, 0.34, 0.36, 0, 0.2 * (rnd() - 0.5));
      wcube('clothBlue', EX + 10.2 + k * 1.2, EZ + 2.3, 0.9, 0.34, 0.36, 0, 0.2 * (rnd() - 0.5));
    }
    d.block({ x: EX - 12, z: EZ, r: 1.5 });
    d.block({ x: EX + 12, z: EZ, r: 1.5 });
    occupy(W0, mx0 - 9, EX + 16, mz1, PZ1 + 0.5, 1);

    // ── 跑道南边的看台（朝北看跑道），顶上一个播音间 ──
    {
      const f: Fr = { x: TKX, z: TKZ + 28, r: 0 };
      bleacher(f, 34, 6, 'seat');
      cube('stucco', f, 0, 4.4, 7, 2.6, 2.4, 2.4);
      cube('signBoard', f, 0, 3.15, 6, 0.9, 0.1, 3.6);
      cube('concrete', f, 0, 4.4, 7.8, 0.3, 3.2, 5.0);
    }
    // ── 跑道分道线、终点线、内场的足球门和线 ──
    {
      for (const r of [19.5, 21, 22.5]) {
        const g = new THREE.RingGeometry(r - 0.05, r + 0.05, 40)
          .rotateX(-Math.PI / 2)
          .scale(2, 1, 1)
          .translate(TKX, 0.037, TKZ);
        putG(reg(TKX, TKZ), 'line', g);
      }
      wcube('line', TKX, TKZ + 21, 0.15, 0.02, 6, 0.037);
      // 内场：50 × 24 的足球场（只画边线、中线、中圈）
      const F: Fr = { x: TKX, z: TKZ, r: 0 };
      const ln = (a: number, b: number, c: number, e: number) => flat('line', F, a, b, c, e, 0.03);
      for (const s of [-1, 1]) {
        ln(-25, 25, s * 12 - 0.05, s * 12 + 0.05);
        ln(s * 25 - 0.05, s * 25 + 0.05, -12, 12);
      }
      ln(-0.05, 0.05, -12, 12);
      putG(
        reg(TKX, TKZ),
        'line',
        new THREE.RingGeometry(4.4, 4.5, 24).rotateX(-Math.PI / 2).translate(TKX, 0.031, TKZ),
      );
      for (const s of [-1, 1]) {
        const x = TKX + s * 25;
        // 球门：门框 + 后面的网（不投影；网矮一点、只是一条暗带）
        thin(() => {
          for (const zz of [-3.66, 3.66]) wcube('clothWhite', x, TKZ + zz, 0.14, 2.44, 0.14);
          wcube('clothWhite', x, TKZ, 0.14, 0.14, 7.46, 2.3);
          wcube('net', x + s * 1.0, TKZ, 0.06, 1.2, 7.3, 0);
        });
        for (const zz of [-3.66, 3.66]) blockSeg([x, TKZ + zz], [x + s * 1.0, TKZ + zz], 0.15);
        blockSeg([x + s * 1.0, TKZ - 3.66], [x + s * 1.0, TKZ + 3.66], 0.12);
      }
    }

    // ── 体育馆南边四片校队球场（教练在体育馆门口等）：南北 34.5 米（拉蒙路在南边，外场每头 5.4 米）；西沿让开跑道的东头 ──
    {
      const BX0 = TKX + 49.5;
      const BX1 = BX0 + 74;
      const BZ0 = gz1 + 1.8;
      const BZ1 = BZ0 + 34.5;
      const CZ = (BZ0 + BZ1) / 2;
      flat('surround', W0, BX0, BX1, BZ0, BZ1, Y.pad);
      for (let i = 0; i < 4; i++) court({ x: BX0 + 9.25 + i * 18.5, z: CZ, r: 0 }, 'ok');
      fenceRect(W0, BX0, BX1, BZ0, BZ1, 3.6, [
        { side: 'n', at: BX0 + 18.5 },
        { side: 'n', at: BX0 + 55.5 },
        { side: 'e', at: CZ },
      ]);
      occupy(W0, BX0, BX1, BZ0, BZ1, 1.5);
      // 东边围网外挂一条校队横幅（红，朝日出大道）
      thin(() => {
        wcube('clothRed', BX1 + 0.12, CZ - 9, 0.06, 1.0, 10, 1.5);
        wcube('signPaint', BX1 + 0.16, CZ - 9, 0.04, 0.4, 7, 1.8);
      });
      // 每片场网边一条队员长椅（东边），一号场一车球、几个锥桶
      for (let i = 0; i < 4; i++) bench({ x: BX0 + 9.25 + i * 18.5 + 7.7, z: CZ + 3, r: Math.PI / 2 }, 2.4);
      wcube('metal', BX0 + 6, CZ + 8, 0.8, 0.8, 0.6);
      wcube('ball', BX0 + 6, CZ + 8, 0.7, 0.25, 0.5, 0.8);
      for (let k = 0; k < 4; k++) inst.cone.push(item(BX0 + 4 + k * 2.4, CZ - 8));
      for (let k = 0; k < 6; k++) inst.ball.push(item(BX0 + 10 + rnd() * 10, BZ0 + 0.5 + rnd() * 0.6));
    }

    // ── 东边一排临时教室（加州学校的标志），西边教职工停车场 ──
    for (const dx of [66, 82, 98]) {
      const f: Fr = { x: mb.x + dx, z: mb.z - 9, r: 0 };
      cube('woodWeathered', f, 0, 0, 13, 3.0, 9, 0.4);
      cube('concrete', f, 0, 0, 13.6, 0.3, 9.6, 3.4);
      thin(() => cube('net', f, 0, 0, 13, 0.4, 9, 0));
      cube('signBoard', f, -3, 4.52, 1.1, 2.1, 0.08, 0.5);
      cube('wood', f, -3, 5.6, 1.6, 0.4, 2.2, 0);
      blockRect(f, -6.6, 6.6, -4.6, 6.7);
      occupy(f, -6.6, 6.6, -4.6, 6.8, 1);
    }
    {
      const LX0 = mb.x - 84;
      const LZ0 = mb.z - 18;
      const LZ1 = mb.z + 14;
      // 停车场和接到学校车道的一小段：和路同一层（0.03）同一个材质，接缝不闪
      flat('asphalt', W0, LX0, LX0 + 44, LZ0, LZ1, 0.03);
      const sl = road('school_lane');
      const cx = LX0 + 34;
      band(
        'asphalt',
        [
          [cx, LZ1 - 1],
          [cx, sl ? nearestOn(sl.pts, cx, LZ1)[1] : LZ1 + 6],
        ],
        3,
        0.03,
      );
      const CAR: PalKey[] = ['concrete', 'carRed', 'clothWhite', 'clothBlue', 'metal', 'cap'];
      for (const [z0, z1, cz, rot] of [
        [LZ0, LZ0 + 5.4, LZ0 + 2.7, 0],
        [LZ1 - 5.4, LZ1, LZ1 - 2.7, Math.PI],
      ] as const) {
        for (let k = 0; k <= 15; k++) {
          const x = LX0 + 2 + k * 2.75;
          flat('line', W0, x - 0.05, x + 0.05, z0, z1, Y.court);
          // 接车道那一格空着
          if (k < 15 && rnd() < 0.45 && Math.abs(x + 1.375 - cx) > 3)
            car(x + 1.375, cz, rot + (rnd() - 0.5) * 0.06, CAR[Math.floor(rnd() * CAR.length)]);
        }
      }
      occupy(W0, LX0, LX0 + 44, LZ0, LZ1, 1);
      // 停车场北边一排遮阴树
      for (const dx of [4, 16, 31, 43]) inst.tree.push(item(LX0 + dx, LZ0 - 3, 0.9 + rnd() * 0.25, rnd() * 6));
    }
    // 操场边几棵
    for (const [x, z] of [
      [TKX - 52, TKZ - 22],
      [TKX + 44, TKZ + 30],
    ])
      inst.tree.push(item(x, z, 0.9 + rnd() * 0.25, rnd() * 6));
  }

  // ════════════════════════════════════════════════════════════════════
  // 机场（跑道从 GREENS.runway 推，航站楼、机场路从 layout 读）
  // ════════════════════════════════════════════════════════════════════
  function airport(): void {
    const rnd = d.rng('valley:east:airport');
    // 第三轮（山谷缩到 0.7）：跑道从 GREENS.runway 的多边形推（长 380、宽 28）；航站楼、机场路从 layout 读。
    // 机场路的尽头离航站楼北面只剩 6 米：停机坪在机场路北边、滑行道西边；机库挪到航站楼南边（原位置落在跑道上）；
    // 航站楼东边的双发客机、正在滑行的那架放不下，删了。地面多用水泥（暖、浅），整片不发灰。
    const rw = GREENS.find((q) => q.id === 'runway')?.poly ?? [];
    if (rw.length < 4) return;
    const nA: V2 = [(rw[0][0] + rw[1][0]) / 2, (rw[0][1] + rw[1][1]) / 2];
    const nB: V2 = [(rw[2][0] + rw[3][0]) / 2, (rw[2][1] + rw[3][1]) / 2];
    const RL = Math.hypot(nB[0] - nA[0], nB[1] - nA[1]) / 2; // 半长
    const R: Fr = { x: (nA[0] + nB[0]) / 2, z: (nA[1] + nB[1]) / 2, r: Math.atan2(nB[0] - nA[0], nB[1] - nA[1]) };
    const HW = (Math.hypot(rw[1][0] - rw[0][0], rw[1][1] - rw[0][1]) * Math.cos(R.r)) / 2;
    /** 跑道中线在世界 z 处的 x */
    const cx = (z: number) => nA[0] + ((nB[0] - nA[0]) * (z - nA[1])) / (nB[1] - nA[1]);
    // 跑道标线：中线虚线、两头的斑马（钢琴键）、瞄准点
    for (let lz = -RL + 35; lz < RL - 35; lz += 40) flat('line', R, -0.45, 0.45, lz, lz + 22, 0.03);
    for (const s of [-1, 1]) {
      for (let lx = 2.5; lx + 0.9 < HW - 1; lx += 3)
        for (const sx of [-1, 1]) {
          const a = s * (RL - 4);
          const b = s * (RL - 28);
          flat('line', R, sx * lx - 0.9, sx * lx + 0.9, Math.min(a, b), Math.max(a, b), 0.03);
        }
      for (const sx of [-1, 1])
        flat('line', R, sx * 6 - 1.6, sx * 6 + 1.6, s * (RL - 75) - 15, s * (RL - 75) + 15, 0.03);
      // 两头的进近灯（伸出跑道外的几排）
      for (let k = 1; k <= 3; k++) {
        const [x, z] = at(R, 0, s * (RL + k * 10));
        if (washDist(x, z) < 0 || roadGap(x, z) < 4 || reg(x, z) === 'none') continue;
        thin(() => {
          cube('flowerYellow', R, 0, s * (RL + k * 10), 6, 0.2, 0.3, 0.7);
          for (const sx of [-2.6, 0, 2.6]) cube('ironwork', R, sx, s * (RL + k * 10), 0.16, 0.7, 0.16);
        });
      }
      // 跑道头一排绿灯
      for (let k = -3; k <= 3; k++) cube('seat', R, k * 4.2, s * (RL + 0.6), 0.4, 0.3, 0.4);
    }
    // ── 平行滑行道（西边，黄中线）+ 三条联络道：水泥，压在跑道（0.02）上面 0.014 ──
    const AY = 0.034;
    const TX = -(HW + 16);
    const LINKS = [-RL + 25, 0, RL - 25];
    band('concrete', [at(R, TX, -RL + 25), at(R, TX, RL - 25)], 7, AY);
    band('flowerYellow', [at(R, TX, -RL + 25), at(R, TX, RL - 25)], 0.16, AY + 0.012);
    for (const lz of LINKS) {
      band('concrete', [at(R, TX, lz), at(R, -HW + 1, lz)], 7, AY);
      band('flowerYellow', [at(R, TX, lz), at(R, -HW + 1, lz)], 0.16, AY + 0.012);
    }
    /** 水泥坪的伸缩缝：每 6 米一条 1 纹素的暗缝（不然一整块水泥和沙一个颜色，读不出是铺过的地） */
    const joints = (x0: number, x1: number, z0: number, z1: number) => {
      for (let x = x0 + 6; x < x1 - 1; x += 6) flat('asphalt', W0, x - 0.05, x + 0.05, z0 + 0.3, z1 - 0.3, AY + 0.012);
      for (let z = z0 + 6; z < z1 - 1; z += 6) flat('asphalt', W0, x0 + 0.3, x1 - 0.3, z - 0.05, z + 0.05, AY + 0.012);
    };
    /** 滑行道西沿在世界 z 处的 x */
    const taxiW = (z: number) => cx(z) + TX / Math.cos(R.r) - 3.5;
    // 边灯（每 40 米一盏，两边；联络道口上不放）
    for (let lz = -RL + 15; lz < RL; lz += 40)
      for (const s of [-1, 1])
        if (s > 0 || LINKS.every((q) => Math.abs(q - lz) > 6))
          cube('clothWhite', R, s * (HW + 0.8), lz, 0.35, 0.4, 0.35);
    // 跑道 + 滑行道一整条：平整过的地，不长灌木
    {
      const ps = [at(R, TX - 8, -RL), at(R, HW + 2, -RL), at(R, HW + 2, RL), at(R, TX - 8, RL)];
      d.clear({
        x0: Math.min(...ps.map((p) => p[0])),
        x1: Math.max(...ps.map((p) => p[0])),
        z0: Math.min(...ps.map((p) => p[1])),
        z1: Math.max(...ps.map((p) => p[1])),
      });
    }

    const term = BUILDINGS.find((b) => b.id === 'terminal') ?? { x: 1001, z: -560, w: 60, d: 24 };
    const ar = road('airport');
    const TX0 = term.x - term.w / 2;
    const TX1 = term.x + term.w / 2;
    const TZ0 = term.z - term.d / 2;
    const TZ1 = term.z + term.d / 2;
    const roadEnd: V2 = ar ? ar.pts[ar.pts.length - 1] : [term.x, TZ0 - 18];
    const roadW = ar?.w ?? 10;
    // ── 停机坪：机场路北边、滑行道西边（水泥）；三个系留位，三架小飞机 ──
    const AZ1 = roadEnd[1] - roadW / 2 - 4;
    const AZ0 = AZ1 - 29;
    const AX0 = (ar ? Math.max(...ar.pts.map((p) => p[0]).filter((x) => x < roadEnd[0] - 10)) : TX0) + roadW / 2 + 3;
    const AX1 = taxiW(AZ1) + 3.5;
    flat('concrete', W0, AX0, AX1, AZ0, AZ1, AY);
    joints(AX0, AX1, AZ0, AZ1);
    occupy(W0, AX0, AX1, AZ0, AZ1, 1);
    const STR: PalKey[] = ['clothRed', 'clothBlue', 'flowerYellow'];
    [0, 1, 2].forEach((k) => {
      const x = AX0 + 12 + k * 16;
      if (x + 6 > AX1) return;
      // 系留点的黄 T
      flat('flowerYellow', W0, x - 0.08, x + 0.08, AZ0 + 7, AZ0 + 19, AY + 0.024);
      flat('flowerYellow', W0, x - 3, x + 3, AZ0 + 18.9, AZ0 + 19.1, AY + 0.024);
      plane(x, AZ0 + 13.5 + (rnd() - 0.5), Math.PI + (rnd() - 0.5) * 0.2, STR[k]);
    });
    // 航站楼东北角的行李车（停机坪和航站楼之间）
    for (let k = 0; k < 3; k++)
      wcube(k ? 'concrete' : 'toolOrange', TX1 - 10 + k * 2.4, AZ1 + 6, 1.6, 1.0, 2.6, 0, 0.1);

    // ── 两座机库（拱顶，门朝南开着），航站楼南边、滑行道西边；门前一块水泥坪 ──
    const HZ = TZ1 + 2 + 9;
    const HX1 = taxiW(HZ - 9) - 1;
    for (const x of [HX1 - 38, HX1 - 12]) {
      const z = HZ;
      wcube('concrete', x, z, 24, 6, 18);
      // 半个圆柱（轴沿 z、拱朝上）压扁成低拱；4 个面（10 个面的时候每面亮度都压在色阶线上，一条条闪着的抖点）
      const roof = new THREE.CylinderGeometry(12, 12, 18, 4, 1, false, Math.PI / 2, Math.PI)
        .rotateX(Math.PI / 2)
        .scale(1, 0.28, 1)
        .translate(x, 6, z);
      putG(reg(x, z), 'roofString', roof);
      wcube('net', x, z + 9.02, 18, 5.4, 0.1);
      wcube('cap', x, z + 9.05, 18, 0.5, 0.12, 5.4);
      blockRect(W0, x - 12, x + 12, z - 9, z + 9);
      occupy(W0, x - 12, x + 12, z - 9, z + 9, 2);
    }
    flat('concrete', W0, HX1 - 51, taxiW(HZ + 16) + 3.5, HZ + 9, HZ + 23, AY);
    joints(HX1 - 51, taxiW(HZ + 23), HZ + 9, HZ + 23);
    occupy(W0, HX1 - 51, HX1 + 3, HZ + 9, HZ + 23, 1);
    plane(HX1 - 38, HZ + 16, Math.PI, 'carRed'); // 机库门口

    // ── 航站楼：南立面一条玻璃带、招牌；北面（机场路尽头）一排白色帆布顶落客棚（棕榈泉机场的样子） ──
    wcube('jug', term.x, TZ1 + 0.05, term.w - 6, 2.4, 0.1, 1.2);
    wcube('signBoard', term.x, TZ1 + 0.1, 12, 1.4, 0.12, 5.2);
    wcube('signPaint', term.x, TZ1 + 0.15, 8, 0.5, 0.1, 5.65);
    for (let x = TX0 + 7; x < TX1 - 4; x += 11.5) {
      const z = TZ0 - 1.6;
      thin(() => {
        for (const s of [-1, 1]) wcube('metal', x + s * 2.2, z, 0.2, 4.2, 0.2);
      });
      putG(reg(x, z), 'clothWhite', new THREE.ConeGeometry(3.4, 2.0, 4).rotateY(Math.PI / 4).translate(x, 5.2, z - 1));
      for (const s of [-1, 1]) d.block({ x: x + s * 2.2, z, r: 0.25 });
    }
    occupy(W0, TX0, TX1, TZ0 - 4, TZ0, 0);
    // 停车场（航站楼西边），接上机场路
    {
      // 西边贴着向日葵小区的一栋房子（x 942 以西），停车场让开它
      const LX1 = TX0 - 3;
      const LX0 = LX1 - 23;
      const LZ0 = TZ0 + 2;
      const LZ1 = LZ0 + 18;
      flat('asphalt', W0, LX0, LX1, LZ0, LZ1, 0.03);
      if (ar) {
        const q = nearestOn(ar.pts, LX1 - 5, LZ0);
        band(
          'asphalt',
          [
            [LX1 - 5, LZ0 + 1],
            [q[0], q[1]],
          ],
          3.5,
          0.03,
        );
      }
      const CAR: PalKey[] = ['concrete', 'carRed', 'clothWhite', 'clothBlue', 'cap'];
      for (const [z0, z1, cz, rot] of [
        [LZ0, LZ0 + 5.4, LZ0 + 2.7, 0],
        [LZ1 - 5.4, LZ1, LZ1 - 2.7, Math.PI],
      ] as const)
        for (let k = 0; k <= 8; k++) {
          const x = LX0 + 0.5 + k * 2.75;
          flat('line', W0, x - 0.05, x + 0.05, z0, z1, Y.court);
          if (k < 8 && rnd() < 0.5 && Math.abs(x + 1.375 - (LX1 - 5)) > 3)
            car(x + 1.375, cz, rot + (rnd() - 0.5) * 0.05, CAR[Math.floor(rnd() * CAR.length)]);
        }
      occupy(W0, LX0, LX1, LZ0, LZ1, 1);
      // 塔台（停车场北边、机场路西边的空地）
      const x = LX0 + 3;
      const z = LZ0 - 8;
      wcube('concrete', x, z, 4, 16, 4);
      wcube('jug', x, z, 6.4, 2.8, 6.4, 16);
      wcube('concrete', x, z, 7.4, 0.6, 7.4, 18.8);
      thin(() => wcube('ironwork', x + 1.5, z + 1.5, 0.2, 3.2, 0.2, 19.4));
      wcube('clothRed', x + 1.5, z + 1.5, 0.5, 0.5, 0.5, 22.4);
      blockRect(W0, x - 2.2, x + 2.2, z - 2.2, z + 2.2);
      occupy(W0, x - 4, x + 4, z - 4, z + 4, 1);
      // 停车场南沿两棵棕榈
      for (const px of [LX0 + 2, LX1 - 2]) inst.palm.push(item(px, LZ1 + 3, 1.0, rnd() * 6));
    }
    // ── 风向袋 + 一圈白色标志圈（跑道西边、滑行道外） ──
    {
      const [x, z] = at(R, TX - 12, -RL * 0.4);
      thin(() => wcube('ironwork', x, z, 0.2, 6, 0.2));
      putG(
        reg(x, z),
        'toolOrange',
        new THREE.ConeGeometry(0.55, 2.8, 8)
          .rotateZ(Math.PI / 2)
          .rotateY(0.5)
          .translate(x + 1.3, 5.6, z + 0.7),
      );
      d.block({ x, z, r: 0.3 });
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2;
        wcube('clothWhite', x + Math.cos(a) * 6, z + Math.sin(a) * 6, 1.4, 0.3, 0.6, 0, -a);
      }
    }
  }

  // ════════════════════════════════════════════════════════════════════
  // 塔奎兹溪高尔夫（GREENS.tahquitz_golf；干河床斜穿过去）
  // ════════════════════════════════════════════════════════════════════
  function golf(): void {
    const rnd = d.rng('valley:east:golf');
    const poly = GREENS.find((q) => q.id === 'tahquitz_golf')?.poly ?? [];
    // 第三轮（山谷缩到 0.7）：球场 290 × 170 米，河床（宽度只缩到 0.85）横在中间 66 米宽，北边一条、南边一条。
    // 六个洞放不下：北边两个洞、南边两个洞往回打；球车道绕一圈，东西两头各一座木桥过河床；池塘删了。
    const CART: V2[] = [
      [775, -283],
      [790, -298],
      [900, -294],
      [1010, -288],
      [1048, -262],
      [1052, -200],
      [1035, -160],
      [930, -148],
      [830, -160],
      [795, -195],
      [785, -262],
      [775, -283],
    ];
    // 层高：球道 / 河床沙 0.027（压草 0.015）→ 果岭、剪草条、池塘 0.039 → 球车道 0.045 → 沙坑、浪花 0.051 → 洞 0.063
    const GY = { base: 0.027, green: 0.039, cart: 0.045, bunker: 0.051, cup: 0.063 };
    // 河床在球场里露出来（build 的草盖住了）：只在球场的 x 范围里再铺一层沙（不盖到日出大道的桥、球场外的河床步道）
    const xs = poly.map((v) => v[0]);
    const GX0 = Math.min(...xs);
    const GX1 = Math.max(...xs);
    const wpts: V2[] = [];
    const whs: number[] = [];
    for (let x = GX0; x <= GX1; x += 10) {
      const k = WASH.pts.findIndex((p, n) => n > 0 && p[0] >= x);
      if (k < 1) continue;
      const [ax, az] = WASH.pts[k - 1];
      const [bx, bz] = WASH.pts[k];
      const t = (x - ax) / (bx - ax);
      wpts.push([x, az + (bz - az) * t]);
      whs.push(WASH.half[k - 1] + (WASH.half[k] - WASH.half[k - 1]) * t);
    }
    band('sandPatch', wpts, whs, GY.base);
    // 河床步道在沙下面了：球场里那段再画一遍（同 build 的宽）
    const wt = road('wash_trail');
    if (wt) {
      const tp = wt.pts.filter((p) => p[0] >= GX0 - 60);
      band('path', tp, wt.w / 2 + 0.3, GY.green);
    }
    // 河床里几块石头（场上看得见的"障碍"）：躲开步道、球车道、桥，一团一团的不规则石头
    const rockG = (r: number) => {
      const g = new THREE.DodecahedronGeometry(r, 0);
      g.scale(0.85 + rnd() * 0.35, 0.5 + rnd() * 0.2, 0.85 + rnd() * 0.35);
      g.rotateY(rnd() * Math.PI * 2);
      return g;
    };
    for (let k = 0; k < 14; k++) {
      const x = GX0 + 20 + rnd() * (GX1 - GX0 - 40);
      const kk = WASH.pts.findIndex((p, n) => n > 0 && p[0] >= x);
      if (kk < 1) continue;
      const [ax, az] = WASH.pts[kk - 1];
      const [bx, bz] = WASH.pts[kk];
      const z = az + ((bz - az) * (x - ax)) / (bx - ax) + (rnd() - 0.5) * 50;
      if (washDist(x, z) > -4) continue;
      if (wt && distToLine(wt.pts, x, z) < 4) continue;
      if (distToLine(CART, x, z) < 5) continue;
      const r = 0.45 + rnd() * 0.6;
      putG(reg(x, z), 'rock', rockG(r).translate(x, r * 0.15, z));
      if (rnd() < 0.6) {
        const r2 = r * (0.4 + rnd() * 0.3);
        putG(reg(x, z), 'rock', rockG(r2).translate(x + r + r2 * 0.6, r2 * 0.1, z + (rnd() - 0.5) * r));
      }
    }
    // 六个洞：发球台 → 果岭（3、6 号跨河床）
    const HOLES: [V2, V2, number][] = [
      [[805, -285], [888, -281], 7],
      [[915, -285], [1005, -275], 7],
      [[1030, -172], [935, -165], 9],
      [[905, -170], [830, -185], 9],
    ];
    const FLAGS: PalKey[] = ['clothRed', 'flowerYellow', 'clothBlue', 'clothRed'];
    HOLES.forEach(([tee, grn, hw], i) => {
      const L = Math.hypot(grn[0] - tee[0], grn[1] - tee[1]);
      const u: V2 = [(grn[0] - tee[0]) / L, (grn[1] - tee[1]) / L];
      const rot = Math.atan2(u[0], u[1]);
      // 球道：每 6 米一个点，宽窄起伏；在河床里断开（要打过去）
      let run: V2[] = [];
      let hs: number[] = [];
      const flush = () => {
        if (run.length > 1) band('lawnStripe', run, hs, GY.base);
        run = [];
        hs = [];
      };
      for (let s = 14; s < L - 12; s += 6) {
        const x = tee[0] + u[0] * s;
        const z = tee[1] + u[1] * s;
        const h = hw * (0.75 + 0.35 * Math.sin(s * 0.05 + i * 2) + 0.1 * rnd());
        // 球道的边也不压到河床的沙上（同一层，压上就闪）
        if (washDist(x, z) < h + 1 || !inPoly(poly, x, z)) {
          flush();
          continue;
        }
        run.push([x, z]);
        hs.push(h);
        // 剪草的横条（隔一段一条亮的），球道从远处也读得出来
        if (Math.floor(s / 6) % 2 === 0 && s + 6 < L - 12)
          band(
            'green',
            [
              [x, z],
              [x + u[0] * 6, z + u[1] * 6],
            ],
            h - 1.2,
            GY.green,
          );
        // 球道两边的棕榈：每 ~40 米一簇 2～3 棵，左右交替
        if (s % 42 < 6 && s > 20) {
          const side = Math.floor(s / 42) % 2 ? 1 : -1;
          const o = h + 5 + rnd() * 4;
          const n = 2 + Math.floor(rnd() * 2);
          for (let k = 0; k < n; k++) {
            const px = x - u[1] * side * (o + k * 2.2) + u[0] * (rnd() - 0.5) * 5;
            const pz = z + u[0] * side * (o + k * 2.2) + u[1] * (rnd() - 0.5) * 5;
            if (washDist(px, pz) > 3 && inPoly(poly, px, pz) && distToLine(CART, px, pz) > 4)
              inst.palm.push(item(px, pz, 0.9 + rnd() * 0.3, rnd() * 6));
          }
        }
      }
      flush();
      // 发球台：高出一点的一块，两个白色发球标
      const T: Fr = { x: tee[0], z: tee[1], r: rot };
      cube('green', T, 0, 0, 5, 0.22, 7, 0);
      for (const s of [-1, 1]) cube('clothWhite', T, s * 1.6, -2, 0.22, 0.22, 0.22, 0.22);
      cube('woodWeathered', T, 3.4, 2.4, 0.9, 0.7, 0.14, 0.4); // 洞号牌
      thin(() => cube('woodWeathered', T, 3.4, 2.4, 0.16, 0.5, 0.16, 0));
      // 果岭 + 旗 + 洞
      disc('green', grn[0], grn[1], 9, 7, GY.green, rot, 18);
      const px = grn[0] + (rnd() - 0.5) * 5;
      const pz = grn[1] + (rnd() - 0.5) * 4;
      disc('net', px, pz, 0.22, 0.22, GY.cup, 0, 8);
      thin(() => {
        wcube('ironwork', px, pz, 0.12, 2.4, 0.12);
        wcube(FLAGS[i], px + 0.4, pz, 0.75, 0.48, 0.06, 1.85);
      });
      // 沙坑：果岭边一两个（两三个圆拼成的豆子形），一个球道沙坑
      const G: Fr = { x: grn[0], z: grn[1], r: rot };
      const bunker = (lx: number, lz: number, r: number) => {
        for (let k = 0; k < 3; k++) {
          const [x, z] = at(G, lx + (k - 1) * r * 0.9, lz + (rnd() - 0.5) * r * 0.6);
          const rr = r * (0.8 + rnd() * 0.3);
          if (distToLine(CART, x, z) > rr + 1.6) disc('sandHigh', x, z, rr, r * 0.7, GY.bunker, rot, 12);
        }
      };
      bunker(i % 2 ? 9 : -9, 2, 2.6);
      if (i % 3 !== 1) bunker(i % 2 ? -8 : 8, -4, 2.2);
      const s = L * 0.55;
      const fx = tee[0] + u[0] * s;
      const fz = tee[1] + u[1] * s;
      if (washDist(fx, fz) > 6) {
        const F: Fr = { x: fx, z: fz, r: rot };
        const [bx, bz] = at(F, (i % 2 ? -1 : 1) * hw * 0.9, 0);
        if (distToLine(CART, bx, bz) > 5) disc('sandHigh', bx, bz, 3.2, 2.0, GY.bunker, rot + 0.6, 12);
      }
    });
    // ── 球车道（浅色水泥，弯弯地连各洞），过河床的两座木桥 ──
    band('path', CART, 1.2, GY.cart);
    for (let ci = 1; ci < CART.length; ci++) {
      const a = CART[ci - 1];
      const b = CART[ci];
      // 只给穿过河床的那几段架桥
      let wet = false;
      for (let q = 0; q <= 1; q += 0.05)
        if (washDist(a[0] + (b[0] - a[0]) * q, a[1] + (b[1] - a[1]) * q) < 0) wet = true;
      if (!wet) continue;
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const u: V2 = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
      const rot = Math.atan2(u[0], u[1]);
      const f: Fr = { x: (a[0] + b[0]) / 2, z: (a[1] + b[1]) / 2, r: rot };
      // 只在河床那段架桥
      let s0 = 0;
      let s1 = L;
      for (let s = 0; s <= L; s += 1)
        if (washDist(a[0] + u[0] * s, a[1] + u[1] * s) < 0.5) {
          s0 = s;
          break;
        }
      for (let s = L; s >= 0; s -= 1)
        if (washDist(a[0] + u[0] * s, a[1] + u[1] * s) < 0.5) {
          s1 = s;
          break;
        }
      // 桥不伸出这一段（原来两头各多 2 米，拐弯处横到下一段路上）
      const b0 = Math.max(0, s0 - 2);
      const b1 = Math.min(L, s1 + 2);
      const m = (b0 + b1) / 2 - L / 2;
      const len = b1 - b0;
      cube('wood', f, 0, m, 3.4, 0.12, len, 0.0);
      // 栏杆在河床步道穿过的地方断开（步道从桥面上横穿过去，不能被一道栏杆拦住）
      const gaps: [number, number][] = [];
      if (wt)
        for (let q = 0; q <= len; q += 0.5) {
          const [x, z] = at(f, 0, m - len / 2 + q);
          if (distToLine(wt.pts, x, z) < wt.w / 2 + 1.4) {
            const last = gaps[gaps.length - 1];
            if (last && q - last[1] < 0.6) last[1] = q;
            else gaps.push([q, q]);
          }
        }
      const pieces = cut(
        0,
        len,
        gaps.map(([a, b]) => [a - 0.5, b + 0.5] as const),
      );
      for (const sx of [-1, 1])
        for (const [p0, p1] of pieces) {
          const pm = m - len / 2 + (p0 + p1) / 2;
          const pl = p1 - p0;
          const n = Math.max(1, Math.round(pl / 4));
          thin(() => {
            cube('woodWeathered', f, sx * 1.75, pm, 0.16, 0.12, pl, 0.85);
            for (let k = 0; k <= n; k++)
              cube('woodWeathered', f, sx * 1.75, pm - pl / 2 + (pl * k) / n, 0.18, 0.95, 0.18);
          });
          blockSeg(at(f, sx * 1.75, pm - pl / 2), at(f, sx * 1.75, pm + pl / 2), 0.15);
        }
    }
    // 两辆球车停在球车道边上（不在道上）
    gcart(850, -292.4, Math.PI / 2 + 0.06);
    gcart(980, -150, -Math.PI / 2 + 0.1);
    // 球具店（球场西北角外、日出大道边），球车棚，练习果岭：位置按原来的过 S
    const [hx, hz] = S(1034, -412);
    wcube('stucco', hx, hz, 18, 4.5, 10);
    wcube('roofTile', hx, hz, 19.4, 0.4, 11.4, 4.5);
    wcube('clothTeal', hx, hz + 5.8, 8, 0.2, 1.8, 2.8);
    wcube('signBoard', hx, hz + 5.1, 6, 0.9, 0.1, 3.5);
    blockRect(W0, hx - 9, hx + 9, hz - 5, hz + 5);
    occupy(W0, hx - 10, hx + 10, hz - 6, hz + 6, 1);
    // 球车棚：铁皮顶 + 一排白球车
    const [bx, bz] = S(1034, -394.5);
    wcube('metal', bx, bz, 16, 0.25, 6, 2.6);
    thin(() => {
      for (const x of [bx - 7.5, bx, bx + 7.5])
        for (const z of [bz - 2.7, bz + 2.7]) wcube('metal', x, z, 0.18, 2.6, 0.18);
    });
    for (let k = 0; k < 6; k++) gcart(bx - 6 + k * 2.4, bz, 0);
    occupy(W0, bx - 8, bx + 8, bz - 3.5, bz + 3.5, 1);
    // 练习果岭
    const [qx, qz] = S(1036, -432);
    disc('green', qx, qz, 8, 4.5, GY.green, 0, 16);
    thin(() => {
      for (const [x, z, k] of [
        [qx - 4, qz, 'clothRed'],
        [qx + 3, qz - 1.5, 'flowerYellow'],
        [qx + 0.5, qz + 1.8, 'clothBlue'],
      ] as const) {
        wcube('ironwork', x, z, 0.1, 1.0, 0.1);
        wcube(k, x + 0.2, z, 0.35, 0.25, 0.05, 0.75);
      }
    });
    // 几棵树（球道边成团、河床边）
    for (const [x, z, s] of [
      [880, -306, 1.0],
      [1030, -299, 0.9],
      [980, -139, 0.9],
      [870, -141, 1.0],
      [1062, -182, 0.85],
      [900, -191, 0.8],
    ])
      inst.tree.push(item(x, z, s, rnd() * 6));
    for (const [x, z] of [S(1018, -428), S(1018, -398)]) inst.palm.push(item(x, z, 1.05, rnd() * 6));
  }

  // ════════════════════════════════════════════════════════════════════
  // 小区：向日葵小区（日出大道东）、深井小区（河床南）
  // ════════════════════════════════════════════════════════════════════
  function neighborhoods(): void {
    const rnd = d.rng('valley:east:yards');
    const MINE = new Set(['sunrise_park_east', 'sunrise_cul', 'deepwell', 'deepwell_cul']);
    const all = houses();
    const mine = all.filter((h) => MINE.has(h.id.slice(0, h.id.lastIndexOf('_'))));
    const foot = all.map((h) => ({ h, r: Math.max(h.w, h.d) / 2 }));
    const clear = (x: number, z: number, self: (typeof all)[number], pad: number) =>
      roadGap(x, z) > pad &&
      washDist(x, z) > 2 &&
      !foot.some(({ h, r }) => h !== self && Math.hypot(h.x - x, h.z - z) < r + pad);
    // 车的颜色只用不带噪点的材质（silverBlue、sage 是植物的，车身上一片抖点）
    const CARS: PalKey[] = ['concrete', 'carRed', 'clothWhite', 'clothBlue', 'cap', 'metal', 'flowerYellow'];
    for (const h of mine) {
      const rid = h.id.slice(0, h.id.lastIndexOf('_'));
      const deep = rid.startsWith('deepwell');
      const rd = road(rid);
      if (!rd) continue;
      const f: Fr = { x: h.x, z: h.z, r: h.rot ?? 0 };
      // 哪边朝路：最近的路点在局部 z 的哪一侧
      const q = nearestOn(rd.pts, h.x, h.z);
      const lzDir: V2 = [Math.sin(f.r), Math.cos(f.r)];
      const fz = (q[0] - h.x) * lzDir[0] + (q[1] - h.z) * lzDir[1] >= 0 ? 1 : -1;
      const toRoad = Math.hypot(q[0] - h.x, q[1] - h.z) - rd.w / 2;
      const hw = h.w / 2;
      const hd = h.d / 2;
      // 车道：房子一侧往路上去；一半停着车（车棚删了：一块悬着的铁皮顶，看不懂、投一大块方影）
      const side = rnd() < 0.5 ? -1 : 1;
      const dx = side * (hw - 2.6);
      const dz0 = fz * hd;
      const dz1 = fz * (toRoad - 0.2);
      if (Math.abs(dz1) > Math.abs(dz0) + 1) {
        flat('path', f, dx - 1.8, dx + 1.8, Math.min(dz0, dz1), Math.max(dz0, dz1), 0.034);
        const r0 = rnd();
        const cz = fz * (hd + 3.2);
        // 车整个在车道上（四个角离路面边 ≥ 0.8 米），不伸进路里
        const carOk = [-1, 1].every((a) => [-2.3, 2.3].every((b) => roadGap(...at(f, dx + a, cz + b)) > 0.8));
        if (r0 < 0.55 && carOk)
          car(...at(f, dx, cz), f.r + (fz > 0 ? 0 : Math.PI), CARS[Math.floor(rnd() * CARS.length)], rnd() < 0.25);
      }
      // 前院：三成草坪（沙漠里浇水的那几家），其余砾石 + 一团仙人掌、龙舌兰、石头
      const front = fz * (hd + 0.2);
      const yardEnd = fz * Math.min(hd + 6, toRoad - 0.5);
      // 草坪 0.022、车道 0.034：车道横穿草坪的那块错开 0.012（原来 0.03 / 0.034 闪）
      if (rnd() < 0.3) flat('lawn', f, -hw + 0.4, hw - 0.4, Math.min(front, yardEnd), Math.max(front, yardEnd), 0.022);
      else {
        const cx = -side * (hw - 2.5);
        const cz = fz * (hd + 2.4);
        const [x, z] = at(f, cx, cz);
        const ok = (px: number, pz: number) => roadGap(px, pz) > 1.2;
        if (ok(x, z)) inst.agave.push(item(x, z, 0.8 + rnd() * 0.5, rnd() * 6));
        const cxz: V2 = [x + 1.4 * (rnd() - 0.5), z + 1.2];
        if (rnd() < 0.6 && ok(...cxz)) inst.cactus.push(item(...cxz, 0.7 + rnd() * 0.6, rnd() * 6));
        if (rnd() < 0.5 && ok(x - 1.3, z)) {
          const r = 0.45 + rnd() * 0.35;
          putG(reg(x, z), 'rock', new THREE.DodecahedronGeometry(r, 0).scale(1, 0.6, 1).translate(x - 1.3, r * 0.2, z));
        }
      }
      const pxz = at(f, -side * (hw - 1), fz * (hd + 3.5));
      if (rnd() < 0.22 && roadGap(...pxz) > 2.5) inst.palm.push(item(...pxz, 0.85 + rnd() * 0.3, rnd() * 6));
      // 后院：泳池（深井六成、向日葵四成），矮土坯墙围一圈，柑橘树
      const back = -fz;
      const pool = rnd() < (deep ? 0.6 : 0.4);
      const wallOn = rnd() < 0.65;
      const yd = hd + 9;
      const corners: V2[] = [
        at(f, -hw - 1.5, 0),
        at(f, -hw - 1.5, back * yd),
        at(f, hw + 1.5, back * yd),
        at(f, hw + 1.5, 0),
      ];
      // 后院不压到别的东西（机场停车场、公园……）：四个角都要在空地上
      const backOk =
        corners.every(([x, z]) => clear(x, z, h, 1.5) && isFree(x, z, 1)) &&
        clear(...at(f, 0, back * yd), h, 1.5) &&
        isFree(...at(f, 0, back * yd), 1);
      if (!backOk) continue;
      if (wallOn) {
        const seg = (a: V2, b: V2) => {
          const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
          // 矮墙不投影：傍晚一道十几米的墙投出来是一条长直黑带
          thin(() => {
            cube(
              'adobe',
              W0,
              (a[0] + b[0]) / 2,
              (a[1] + b[1]) / 2,
              0.3,
              1.6,
              L,
              0,
              Math.atan2(b[0] - a[0], b[1] - a[1]),
            );
            cube(
              'cap',
              W0,
              (a[0] + b[0]) / 2,
              (a[1] + b[1]) / 2,
              0.4,
              0.1,
              L + 0.1,
              1.6,
              Math.atan2(b[0] - a[0], b[1] - a[1]),
            );
          });
          blockSeg(a, b, 0.2);
        };
        seg(corners[0], corners[1]);
        seg(corners[1], corners[2]);
        // 一边留个院门
        const [c2, c3] = [corners[2], corners[3]];
        const mid: V2 = [c2[0] + (c3[0] - c2[0]) * 0.75, c2[1] + (c3[1] - c2[1]) * 0.75];
        seg(c2, mid);
      }
      const pl = (rnd() - 0.5) * (h.w - 9);
      if (pool) {
        const pz = back * (hd + 4.6);
        cube('concrete', f, pl, pz, 8.6, 0.14, 4.6);
        flat('water', f, pl - 3.9, pl + 3.9, pz - 1.9, pz + 1.9, 0.15);
        blockRect(f, pl - 4.3, pl + 4.3, pz - 2.3, pz + 2.3);
      }
      const trees = deep ? 1 + Math.floor(rnd() * 2.2) : rnd() < 0.5 ? 1 : 0;
      for (let k = 0; k < trees; k++) {
        const tx = (k % 2 ? -1 : 1) * (hw - 1.2) * (pool ? 1 : 0.4 + rnd() * 0.5);
        const tz = back * (pool ? hd + 8 : hd + 3 + rnd() * 5);
        inst.citrus.push(item(...at(f, tx, tz), 0.8 + rnd() * 0.35, rnd() * 6));
      }
      occupy(f, -hw - 1.5, hw + 1.5, Math.min(0, back * yd), Math.max(0, back * yd), 1);
    }
    for (const h of all) occupy({ x: h.x, z: h.z, r: h.rot ?? 0 }, -h.w / 2, h.w / 2, -h.d / 2, h.d / 2, 3, false);

    // ── 深井小区：老葡萄柚园的残片（环里手摆三块，一行行、缺几棵；环外沿路的不算） ──
    const dw = road('deepwell');
    if (dw) {
      const loop = dw.pts;
      // 三块园子的范围按原尺寸写、过 S（第三轮缩到 0.7；树距 7 米不缩，所以棵数少了）
      const BLOCKS = (
        [
          [588, 642, -276, -232],
          [652, 692, -252, -204],
          [556, 600, -228, -196],
        ] as const
      ).map(([a, b, c, e]) => {
        const [x0, z0] = S(a, c);
        const [x1, z1] = S(b, e);
        return [x0, x1, z0, z1] as const;
      });
      for (const [x0, x1, z0, z1] of BLOCKS) {
        for (let x = x0; x <= x1; x += 7)
          for (let z = z0; z <= z1; z += 7) {
            if (rnd() < 0.16) continue; // 死了 / 砍了的
            const jx = x + (rnd() - 0.5) * 0.8;
            const jz = z + (rnd() - 0.5) * 0.8;
            if (!inPoly(loop, jx, jz) || roadGap(jx, jz) < 4 || !isFree(jx, jz, 1)) continue;
            inst.citrus.push(item(jx, jz, 0.85 + rnd() * 0.3, rnd() * 6));
          }
        // 园子里一条灌溉沟、一个老水泵房
        band(
          'sandDrift',
          [
            [x0 - 2, (z0 + z1) / 2 + 3.5],
            [x1 + 2, (z0 + z1) / 2 + 3.5],
          ],
          0.6,
          0.022,
        );
      }
      const pump: V2 = S(612, -228);
      if (isFree(pump[0], pump[1], 2)) {
        wcube('adobe', pump[0], pump[1], 3.2, 2.6, 3.0);
        wcube('rust', pump[0], pump[1], 3.6, 0.2, 3.4, 2.6);
        wcube('rust', pump[0] + 2.2, pump[1], 0.4, 1.4, 0.4);
        d.block({ x: pump[0], z: pump[1], r: 2.0 });
        occupy(W0, pump[0] - 2, pump[0] + 2.6, pump[1] - 2, pump[1] + 2, 1);
      }
    }
  }

  // ════════════════════════════════════════════════════════════════════
  // 椰枣园（GREENS.date_grove / date_grove_s；路边的椰枣摊按日出大道、东棕榈谷大道的路边摆）
  // ════════════════════════════════════════════════════════════════════
  function groves(): void {
    const rnd = d.rng('valley:east:grove');
    const G = (id: string) => GREENS.find((q) => q.id === id)?.poly ?? [];
    /**
     * 一片园：土路十字分成四块，两块漫灌沟（沿棕榈一列一条深色沟）、两块树盘（每棵一块方的深色土），
     * 东西土路北边一条水渠（混凝土边 + 水）、隔一段一个出水口；拖拉机、叶堆成簇放在土路边上。
     * 土路正好在两排棕榈中间（build.ts 的棕榈按 minX + 6 + 12i 种，路在 minX + 12k 上），出水口也在两列之间。
     */
    const grove = (poly: readonly V2[], tx: number, tz: number) => {
      const xs = poly.map((v) => v[0]);
      const zs = poly.map((v) => v[1]);
      const x0 = Math.min(...xs);
      const x1 = Math.max(...xs);
      const z0 = Math.min(...zs);
      const z1 = Math.max(...zs);
      // 土路对准两排棕榈的正中（build.ts 的棕榈在 minX + 6 + 12i 上）
      tx = x0 + 12 * Math.max(1, Math.round((tx - x0) / 12));
      tz = z0 + 12 * Math.max(1, Math.round((tz - z0) / 12));
      // 土路：压实的浅沙（不是碎石步道那种一块块的纹）；两头收在园子里（斜边的园子，外框的角不在园子里）
      const inside = (x: number, z: number) => inPoly(poly, x, z);
      let ez0 = z0 + 1;
      while (ez0 < z1 && !inside(tx, ez0 - 1)) ez0 += 1;
      let ez1 = z1 - 1;
      while (ez1 > z0 && !inside(tx, ez1 + 1)) ez1 -= 1;
      let ex0 = x0 + 1;
      while (ex0 < x1 && !inside(ex0 - 1, tz)) ex0 += 1;
      let ex1 = x1 - 1;
      while (ex1 > x0 && !inside(ex1 + 1, tz)) ex1 -= 1;
      band(
        'sandHigh',
        [
          [ex0, tz],
          [ex1, tz],
        ],
        2.2,
        0.024,
      );
      band(
        'sandHigh',
        [
          [tx, ez0],
          [tx, ez1],
        ],
        2.2,
        0.024,
      );
      d.clear({ x0: ex0 - 2, x1: ex1 + 2, z0: tz - 3, z1: tz + 3 });
      d.clear({ x0: tx - 3, x1: tx + 3, z0: ez0 - 2, z1: ez1 + 2 });
      // 水渠：在南北土路那儿断开（路下面走暗管），两段
      for (const [a, b] of [
        [ex0, tx - 2.6],
        [tx + 2.6, ex1],
      ]) {
        band(
          'concrete',
          [
            [a, tz - 3.2],
            [b, tz - 3.2],
          ],
          0.6,
          0.03,
        );
        band(
          'water',
          [
            [a + 0.3, tz - 3.2],
            [b - 0.3, tz - 3.2],
          ],
          0.32,
          0.042,
        );
      }
      for (let x = x0 + 24; x < x1; x += 24)
        if (Math.abs(x - tx) > 3 && inPoly(poly, x, tz - 3.2)) cyl('concrete', x, tz - 3.2, 0.4, 0.5);
      // 每块按 (东/西, 南/北) 选沟或树盘
      for (let x = x0 + 6; x < x1; x += 12) {
        const west = x < tx;
        for (let z = z0 + 6; z < z1; z += 12) {
          if (!inPoly(poly, x, z)) continue;
          if (Math.abs(z - tz) < 4 || Math.abs(x - tx) < 4) continue;
          const north = z < tz;
          const furrow = west ? north : !north;
          if (furrow) flat('sandDrift', { x, z, r: 0 }, -1.1, 1.1, -6, 6, 0.022);
          else flat('sandDrift', { x, z, r: 0 }, -1.8, 1.8, -1.8, 1.8, 0.022);
        }
      }
      // 叶堆、梯子、拖拉机
      for (let k = 0; k < 7; k++) {
        const x = tx + (rnd() < 0.5 ? -1 : 1) * (12 + Math.floor(rnd() * 6) * 12);
        const z = tz + 4.2 + (rnd() - 0.5) * 0.4;
        if (!inPoly(poly, x, z)) continue;
        inst.frond.push(item(x, z, 0.8 + rnd() * 0.35, rnd() * 6));
      }
      {
        // 拖拉机停在南北土路东边的路肩上（路和棕榈列之间），不堵路
        const z = tz - 40 - Math.floor(rnd() * 3) * 12;
        const f: Fr = { x: tx + 3.4, z, r: 0 };
        cube('net', f, 0, 0, 1.6, 0.5, 2.6, 0);
        cube('seat', f, 0, 0.2, 1.4, 0.9, 2.4, 0.4);
        cube('seat', f, 0, 0.8, 1.2, 1.0, 1.0, 1.3);
        cube('jug', f, 0, 0.8, 1.15, 0.6, 1.05, 1.5);
        cube('ironwork', f, 0, -0.9, 0.14, 0.7, 0.14, 1.3);
        cube('woodWeathered', f, 0, 4.1, 1.8, 0.7, 3.6, 0.3);
        cube('palmSkirt', f, 0, 4.1, 1.6, 0.5, 3.2, 1.0);
        blockRect(f, -1, 1, -1.4, 6);
        occupy(f, -1, 1, -1.4, 6, 1);
      }
      // （梯子删了：一块 6 米的木板斜靠在空处，看不懂）
    };
    grove(G('date_grove'), ...S(866, -1106));
    grove(G('date_grove_s'), ...S(1300, 86));

    /** 路边的椰枣摊：白墙、蓝条纹雨篷、一桌一箱箱椰枣、高高的路牌、一辆皮卡；front = 朝路那面（局部 −z） */
    const stand = (x: number, z: number, rot: number, gravel: [number, number, number, number], signAt: V2) => {
      flat('sandDrift', W0, ...gravel, 0.024);
      occupy(W0, ...gravel, 0.5);
      const f: Fr = { x, z, r: rot };
      cube('stucco', f, 0, 0, 8, 3.2, 5);
      cube('roofTile', f, 0, 0, 8.8, 0.3, 5.8, 3.2);
      cube('canvasStripe', f, 0, -3.6, 8.4, 0.18, 2.4, 2.6);
      thin(() => {
        for (const s of [-1, 1]) cube('wood', f, s * 4, -4.6, 0.16, 2.6, 0.16);
      });
      cube('wood', f, 0, -3.0, 6, 0.95, 0.7);
      for (let k = 0; k < 5; k++) {
        cube('woodWeathered', f, -2.4 + k * 1.2, -3.0, 0.8, 0.3, 0.5, 0.95);
        cube('branch', f, -2.4 + k * 1.2, -3.0, 0.7, 0.08, 0.4, 1.25);
      }
      cube('signBoard', f, 0, -2.55, 4.5, 0.7, 0.1, 3.4);
      blockRect(f, -4.2, 4.2, -3.4, 2.6);
      occupy(f, -5, 5, -6, 3, 1);
      // 路牌
      // 斜着 45°：路上两个方向的车都看得见（镜头也看得见）
      const sf: Fr = { x: signAt[0], z: signAt[1], r: rot + Math.PI / 4 };
      for (const s of [-1.4, 1.4]) {
        thin(() => cube('wood', sf, s, 0, 0.22, 4.4, 0.22));
        const [px, pz] = at(sf, s, 0);
        d.block({ x: px, z: pz, r: 0.3 });
      }
      cube('signBoard', sf, 0, 0, 3.6, 1.8, 0.16, 2.8);
      cube('flowerYellow', sf, 0, -0.02, 2.6, 0.5, 0.18, 3.6);
      // 两张野餐桌、一辆皮卡
      picnic(...at(f, -6.5, -2), rot);
      picnic(...at(f, 6.2, 0.5), rot);
      car(...at(f, 9.5, -7.5), rot + Math.PI / 2, 'carRed', true);
      for (const [lx, lz] of [
        [-6, 3],
        [6.5, 4],
      ])
        inst.palm.push(item(...at(f, lx, lz), 1.0, rnd() * 6));
    };
    // 北园：日出大道边（路西），朝东；摊子离路面边 11 米
    {
      const sr = road('sunrise');
      const z = S(977, -1000)[1];
      const re = (sr ? nearestOn(sr.pts, 700, z)[0] : 742) - (sr?.w ?? 10) / 2;
      const x = re - 11;
      stand(x, z, -Math.PI / 2, [x - 10, re - 1, z - 14, z + 14], [re - 3.5, z - 17]);
    }
    // 南园：东棕榈谷大道边（路南），朝北
    {
      const ep = road('e_palm_canyon');
      const x = S(1212, -42)[0];
      const re = (ep ? nearestOn(ep.pts, x, 0)[1] : -52) + (ep?.w ?? 14) / 2;
      const z = re + 15.6;
      stand(x, z, 0, [x - 13.5, x + 14.5, re + 2, z + 6], [x + 20.6, re + 5]);
    }
  }

  // ════════════════════════════════════════════════════════════════════
  // 实例化：树、柑橘、棕榈、球、锥桶、龙舌兰、仙人掌、叶堆；最后是不投影的那批（thin）
  // ════════════════════════════════════════════════════════════════════
  function placeInstances(): void {
    const dI = (g: THREE.BufferGeometry, key: PalKey, items: InstItem[], cast = true) => {
      if (items.length) d.instance(g, key, items, cast);
    };
    // 树（牧豆树 / 遮阴树）：短干 + 三团球面法线的冠（一团大的压扁、两团小的偏开），不是一颗宝石
    {
      const trunk = new THREE.CylinderGeometry(0.16, 0.24, 2.6, 5).translate(0, 1.3, 0);
      const crown = mergeAll([
        blob(1.7, 1.2, 0.62, 1.1).translate(0, 3.2, 0),
        blob(1.15, 1, 0.7, 1).translate(1.25, 2.9, 0.55),
        blob(1.25, 1, 0.68, 1).translate(-1.05, 3.0, -0.6),
      ]);
      dI(trunk, 'branch', inst.tree, false); // 短干的影子被冠的影子盖住，不投省三角形
      dI(crown, 'olive', inst.tree);
    }
    // 柑橘：矮、圆、深绿
    {
      const trunk = new THREE.CylinderGeometry(0.12, 0.16, 0.9, 5).translate(0, 0.45, 0);
      // 一团就够（深井一片园子几百棵，三角形预算紧）
      const crown = blob(1.45, 1, 0.9, 1).translate(0, 1.7, 0);
      dI(trunk, 'branch', inst.citrus, false);
      dI(crown, 'palm', inst.citrus);
    }
    // 棕榈（同 build.ts 的样子：八片往下垂的叶子 + 中间一小团）
    {
      const trunk = new THREE.CylinderGeometry(0.22, 0.34, 8, 5).translate(0, 4, 0);
      const fronds: THREE.BufferGeometry[] = [blob(0.55).translate(0, 8.1, 0)];
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 + (k % 2) * 0.2;
        const droop = k % 2 ? 0.55 : 0.32;
        fronds.push(
          new THREE.BoxGeometry(0.55, 0.08, 3.1).translate(0, 0, 1.45).rotateX(droop).rotateY(a).translate(0, 8.15, 0),
        );
      }
      // 干不投影（8 米的干傍晚投出 30 多米的直黑带），冠照样投
      dI(trunk, 'palmTrunk', inst.palm, false);
      dI(mergeAll(fronds), 'palm', inst.palm);
    }
    dI(new THREE.BoxGeometry(0.11, 0.11, 0.11).translate(0, 0.055, 0), 'ball', inst.ball, false);
    dI(new THREE.ConeGeometry(0.2, 0.42, 6).translate(0, 0.21, 0), 'toolOrange', inst.cone, false);
    dI(new THREE.OctahedronGeometry(0.75, 0).scale(1, 0.55, 1).translate(0, 0.35, 0), 'silverBlue', inst.agave, false);
    {
      const g = new THREE.BoxGeometry(0.36, 1.5, 0.36).translate(0, 0.75, 0);
      const arm = new THREE.BoxGeometry(0.26, 0.6, 0.26).translate(0.32, 0.9, 0);
      const merged = [g, arm].map((x) => x.toNonIndexed());
      const pos = merged.flatMap((x) => Array.from(x.attributes.position.array as Float32Array));
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.computeVertexNormals();
      dI(geo, 'cactus', inst.cactus, false);
    }
    dI(
      new THREE.IcosahedronGeometry(1.2, 0).scale(1.4, 0.35, 0.9).translate(0, 0.2, 0),
      'palmSkirt',
      inst.frond,
      false,
    );
    // 不投影的那批：每（区域, 材质, 160 米一块）合并成一个实例
    for (const { reg: r, key, list } of ncBuckets.values()) {
      if (!list.length) continue;
      d.instance(mergeAll(list), key, [{ x: 0, z: 0, s: 1, reg: r }], false);
      for (const g of list) g.dispose();
    }
  }
}

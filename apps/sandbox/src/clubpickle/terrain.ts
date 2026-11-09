// clubpickle 的地形：从 clubdesk/terrain.ts 复制（2026-11-08），两个场景画的是同一块地 —— 地面、东墙、门外铺地、到达小院、步道、
// 广场（+1.2）、草坪（−0.5）、台阶、西边球场、围网（clubdesk 的 fence-screen 资产，buildFences）一模一样（布局常量只读 import clubdesk/layout）。
// 改的只有匹克球场（paintCourt）：
// - 厨房（非截击区）平涂一块深一级的钴蓝（palette.ts 的 kitchen），网两边两条深色带 = 匹克球场的记号；
// - 匹克球的网不在地形里建了（clubdesk 是一个灰盒），换成 SLOTS 里的 pickle-net 资产（#1，现在是占位）；
// - ?sfh=<米>：南围网（朝镜头那段）的高度，默认 2.2（同 clubdesk）。试矮围网（1.1）露出 2 号场的南边线，见 clubpickle.md「要商量的」。
// 几何工具从 clubsite/render/geo.ts import；世界坐标从 clubsite/world.ts import（只读）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildFences, type FenceRun } from '../clubdesk/assets/fence-screen';
import type { AssetCtx as DeskCtx } from '../clubdesk/ctx';
import {
  CLIP,
  FORECOURT,
  H,
  LAWN_PIT,
  PICKLE,
  PLAZA_TERRACE,
  type Rect,
  RUNNER,
  RUNNER2,
  SCENE_PATHS,
  STAIRS,
  type Stairs,
  type V2,
  WALL,
} from '../clubdesk/layout';
import type { AssetCtx as ParkCtx } from '../clubpark/ctx';
import { PAL as PARK_PAL } from '../clubpark/palette';
import { approachAt, buildApproach } from '../clubpark/terrain';
import { groundGeo } from '../clubsite/ground';
import { buildMountains } from '../clubsite/mountains';
import { box, insidePoly, quad, ring, smoothLine, topGeo, wallGeo } from '../clubsite/render/geo';
import type { ToonOpts } from '../clubsite/render/toon';
import {
  COURT_FENCES,
  COURTS,
  type Court,
  type FenceLine,
  FOUNTAIN,
  fencePieces,
  GATE,
  GROUNDS,
  PATHS,
  PICKLE_DOORS,
  PICKLE_FENCE_H,
} from '../clubsite/world';
import type { AssetCtx } from './ctx';
import { PK } from './layout';
import { EL, type Pal } from './palette';

type Key = keyof Pal;

/** 按材质收几何体，最后每种材质合并成一个网格（同 clubmap/build.ts 的 Bucket，键是这个场景的 Pal） */
class Bucket {
  private m = new Map<string, { key: Key; extra?: ToonOpts; geos: THREE.BufferGeometry[]; cast: boolean }>();
  add(key: Key, g: THREE.BufferGeometry, opts: { extra?: ToonOpts; cast?: boolean; tag?: string } = {}) {
    const id = `${key}|${opts.tag ?? ''}`;
    let e = this.m.get(id);
    if (!e) {
      e = { key, extra: opts.extra, geos: [], cast: opts.cast ?? true };
      this.m.set(id, e);
    }
    const n = g.index ? g.toNonIndexed() : g;
    for (const a of Object.keys(n.attributes)) if (a !== 'position' && a !== 'normal') n.deleteAttribute(a);
    if (!n.getAttribute('normal')) n.computeVertexNormals();
    e.geos.push(n);
  }
  build(ctx: AssetCtx, root: THREE.Object3D) {
    for (const [id, e] of this.m) {
      const mesh = new THREE.Mesh(mergeGeometries(e.geos), ctx.mat(e.key, e.extra));
      mesh.name = `pickle:${id}`;
      mesh.castShadow = e.cast;
      mesh.receiveShadow = true;
      root.add(mesh);
    }
  }
}

const FLAT = { cast: false };

/**
 * 门外铺地用 clubpark 的材质名（lotAsphalt、stallGravel、paver、kerb、lotPaint…），这个场景的调色板里没有：
 * 照 clubpark 的色板建参数，再借这个场景里同一个配色组的名字过方案的 grade（沥青、漆 = court 组，路缘 = wall 组；
 * 连锁砖、碎石不在任何组里 → 只吃全局 grade，直接 ctx.mats.toon），所以两个场景里同一块地颜色一样。
 */
function parkCtx(ctx: AssetCtx): ParkCtx {
  const proxy: Partial<Record<keyof typeof PARK_PAL, Key>> = {
    lotAsphalt: 'asphalt',
    lotPaint: 'line',
    kerb: 'concrete',
  };
  const mat = (key: keyof typeof PARK_PAL, extra?: ToonOpts) => {
    if (key in ctx.pal) return ctx.mat(key as Key, extra);
    const sw = PARK_PAL[key];
    const o: ToonOpts = {
      ramp: sw.ramp,
      edge: sw.edge,
      convex: sw.convex,
      tones: sw.tones,
      ...('opts' in sw ? sw.opts : {}),
      ...extra,
    };
    const via = proxy[key];
    return via ? ctx.mat(via, o) : ctx.mats.toon(0xffffff, o);
  };
  return { ...ctx, pal: PARK_PAL, mat } as unknown as ParkCtx;
}
/** 白线宽：2 设计纹素（0.18 米），同 desert3d-v2 的球场 */
const LW = 0.18;

/** 矩形和裁剪框求交；空 → null */
function clip(r: Rect, c: Rect = CLIP): Rect | null {
  // 球场、步道都裁到 CLIP（墙里这个场景画到的范围）
  const o = { x0: Math.max(r.x0, c.x0), x1: Math.min(r.x1, c.x1), z0: Math.max(r.z0, c.z0), z1: Math.min(r.z1, c.z1) };
  return o.x1 - o.x0 > 0.05 && o.z1 - o.z0 > 0.05 ? o : null;
}

/** 圆角矩形轮廓（不平滑；r 圆角半径） */
export function roundRect(r: Rect, rad: number): V2[] {
  const pts: V2[] = [];
  const cs: [number, number, number][] = [
    [r.x1 - rad, r.z1 - rad, 0],
    [r.x0 + rad, r.z1 - rad, Math.PI / 2],
    [r.x0 + rad, r.z0 + rad, Math.PI],
    [r.x1 - rad, r.z0 + rad, (3 * Math.PI) / 2],
  ];
  for (const [cx, cz, a0] of cs)
    for (let i = 0; i <= 4; i++) {
      const a = a0 + (i / 4) * (Math.PI / 2);
      pts.push([cx + Math.cos(a) * rad, cz + Math.sin(a) * rad]);
    }
  return pts;
}

export interface Terrain {
  root: THREE.Group;
  outlines: Record<string, V2[]>;
  /** 某点的地面高度（广场 / 草坪 / 门外的花坛 / 地面） */
  groundAt(x: number, z: number): number;
  /** 围网占位的标签位置（main.ts 贴"#8 fence-screen"） */
  fenceLabels: THREE.Vector3[];
}

export function buildTerrain(ctx: AssetCtx): Terrain {
  const root = new THREE.Group();
  root.name = 'terrain';
  const B = new Bucket();
  const LIP = ctx.texel * 1.2;

  const lawn = roundRect(LAWN_PIT, 1.0);
  const plaza = roundRect(PLAZA_TERRACE, 0.5);

  const groundAt = (x: number, z: number) => {
    const p: V2 = [x, z];
    if (insidePoly(p, plaza)) return H.plaza;
    if (insidePoly(p, lawn)) return H.lawn;
    if (x > GATE.x) return approachAt(x, z) ?? H.ground;
    return H.ground;
  };

  const add = (
    g: THREE.BufferGeometry,
    m: THREE.Material,
    name: string,
    opts: { recv?: boolean; cast?: boolean } = {},
  ) => {
    const mesh = new THREE.Mesh(g, m);
    mesh.name = name;
    mesh.receiveShadow = opts.recv ?? true;
    mesh.castShadow = opts.cast ?? true;
    root.add(mesh);
    return mesh;
  };
  const adobe = ctx.mat('adobe', { elem: EL.adobe });
  const cap = ctx.mat('cap');

  // ── 地面：墙外的沙漠沙一整块铺到画外（围墙里面挖掉，另铺压实的浅沙）──
  const grounds: V2[] = [
    [GROUNDS.x0, GROUNDS.z0],
    [GATE.x, GROUNDS.z0],
    [GATE.x, GROUNDS.z1],
    [GROUNDS.x0, GROUNDS.z1],
  ];
  add(groundGeo([grounds], H.ground), ctx.mat('sand', { elem: EL.sand }), 'top:ground', { cast: false });
  add(
    topGeo(grounds, H.ground + 0.004, [lawn]),
    ctx.mat('sandHigh', { elem: { ...EL.sand, seed: 7 } }),
    'top:grounds',
    {
      cast: false,
    },
  );

  // ── 东墙：土坯 + 压顶 + 壁柱（同 clubmap2 的算法：每段 floor(长/12) 等分）；大门的两根门柱是资产（east-gate） ──
  {
    const z0 = Math.max(CLIP.z0, GROUNDS.z0);
    const z1 = CLIP.z1 + 0.6;
    const segs: [number, number][] = [
      [GROUNDS.z0, GATE.z0 - 0.8],
      [GATE.z1 + 0.8, GROUNDS.z1],
    ];
    for (const [a, b] of segs) {
      const s0 = Math.max(a, z0);
      const s1 = Math.min(b, z1);
      const len = s1 - s0;
      const cz = (s0 + s1) / 2;
      B.add('adobe', box(WALL.t, WALL.h, len, GATE.x, 0, cz));
      B.add('cap', box(WALL.t + 0.2, WALL.cap, len, GATE.x, WALL.h, cz));
      const n = Math.floor((b - a) / 12);
      for (let i = 1; i < n; i++) {
        const pz = a + ((b - a) * i) / n;
        if (pz < z0 + 0.6 || pz > z1 - 0.6) continue;
        B.add('adobe', box(WALL.pier, WALL.pierH, WALL.pier, GATE.x, 0, pz));
        B.add('cap', box(WALL.pier + 0.2, WALL.pierCap, WALL.pier + 0.2, GATE.x, WALL.pierH, pz));
      }
    }
  }

  // ── 门外：落客区、车道、停车场、车位、花坛（和 clubpark 同一份几何；材质按 clubpark 的调色板，见 parkCtx） ──
  buildApproach(parkCtx(ctx), (g, m, name) => {
    const flat = name.startsWith('flat:') || name.startsWith('top:');
    const face = name.startsWith('wall:') || name.startsWith('lip:');
    add(g, m, `park:${name}`, { cast: !flat, recv: !face });
  });

  // ── 到达小院（陶砖）、步道（碎花岗岩） ──
  add(quad(FORECOURT, H.ground + 0.014), ctx.mat('tile', { elem: EL.tile }), 'tile:forecourt', { cast: false });
  const granite = ctx.mat('granite', { elem: EL.granite });
  const walks: Rect[] = [];
  // 地图的步道到到达小院西沿为止（小院是陶砖）；这个场景自己的两段小路裁到 CLIP
  for (const p of PATHS) {
    const r = clip(p, { ...CLIP, x1: FORECOURT.x0 + 0.01 });
    if (r) walks.push(r);
  }
  for (const p of SCENE_PATHS) {
    const r = clip(p);
    if (r) walks.push(r);
  }
  for (const [i, r] of walks.entries()) add(quad(r, H.ground + 0.012), granite, `path:${i}`, { cast: false });
  // 门里的 Y 字路口（压在陶砖上面）：石板引导道 门洞 → 柜台转角 → 小路（主）；碎花岗岩 门洞 → 长廊（次）
  const flag = ctx.mat('flagstone', { elem: EL.flagstone });
  add(topGeo(strip(smoothLine(RUNNER.pts, 0.4), RUNNER.w), H.ground + 0.02), flag, 'path:runner', { cast: false });
  add(topGeo(strip(smoothLine(RUNNER2.pts, 0.4), RUNNER2.w), H.ground + 0.018), granite, 'path:runner2', {
    cast: false,
  });

  // ── 喷泉广场：抬高 1.2，南沿挡土墙朝镜头（暗带）；喷泉照地图 ──
  {
    // 广场顶面用石板（地图上是陶砖）：和下面到达小院的陶砖分开，不连成一大片橙色
    add(topGeo(plaza, H.plaza), ctx.mat('flagstone', { elem: { ...EL.flagstone, seed: 4 } }), 'top:plaza', {
      cast: false,
    });
    add(wallGeo(plaza, H.plaza, H.plaza - LIP, true), cap, 'lip:plaza', { recv: false });
    add(
      wallGeo(plaza, H.plaza - LIP, -0.3, true, 0, () => H.plaza),
      adobe,
      'wall:plaza',
      { recv: false },
    );
    const y = H.plaza;
    B.add(
      'flagstone',
      new THREE.CircleGeometry(8, 32).rotateX(-Math.PI / 2).translate(FOUNTAIN.x, y + 0.02, FOUNTAIN.z),
      FLAT,
    );
    B.add('adobe', ring(FOUNTAIN.water + 0.6, FOUNTAIN.water, 0.6).translate(FOUNTAIN.x, y, FOUNTAIN.z));
    B.add(
      'water',
      new THREE.CircleGeometry(FOUNTAIN.water, 24).rotateX(-Math.PI / 2).translate(FOUNTAIN.x, y + 0.4, FOUNTAIN.z),
      FLAT,
    );
    B.add('cap', new THREE.CylinderGeometry(0.6, 0.9, 1.8, 10).translate(FOUNTAIN.x, y + 0.9, FOUNTAIN.z));
    B.add('cap', new THREE.CylinderGeometry(1.4, 1.0, 0.3, 10).translate(FOUNTAIN.x, y + 1.9, FOUNTAIN.z));
  }

  // ── 球员草坪：下沉 0.5，四周一圈朝里的矮墙（只有北沿朝镜头 = 一条实心暗带 + 陶砖亮唇） ──
  add(topGeo(lawn, H.lawn), ctx.mat('lawn'), 'top:lawn', { cast: false });
  add(wallGeo(lawn, H.ground, H.ground - LIP, false), cap, 'lip:lawn', { recv: false });
  add(
    wallGeo(lawn, H.ground - LIP, H.lawn - 0.05, false, 0, () => H.ground - H.lawn),
    adobe,
    'wall:lawn',
    {
      recv: false,
    },
  );

  // ── 台阶（广场两段、草坪一段） ──
  for (const [i, st] of STAIRS.entries())
    add(
      stairsGeo(st),
      ctx.mat('stair', {
        edge: 0.18,
        convex: 0.25,
        elem: {
          kind: 'treads',
          size: [6, 14],
          p: [st.x0, st.z0, 0, 1 / st.run],
          q: [st.steps, st.from, (st.from - st.to) / st.steps, 0],
        },
      }),
      `stairs:${i}`,
      { recv: false },
    );

  // ── 球场：匹克球（整片在画里）、西边的硬地和红土（只露东头，横屏才看得到）；围网 = assets/fence-screen 的 buildFences ──
  const fenceRuns: FenceRun[] = [];
  const fenceLabels: THREE.Vector3[] = [];
  B.add('surround', quad(PICKLE, 0.016), FLAT);
  for (const c of COURTS) {
    const cell: Rect = { x0: c.x - c.hx, x1: c.x + c.hx, z0: c.z - c.hz, z1: c.z + c.hz };
    // 中心球场不画（看台只在 clubmap2 里有，光一块场地不像样）
    if (c.kind === 'stadium' || !clip(cell)) continue;
    paintCourt(B, c);
    if (c.kind === 'hard' || c.kind === 'clay') {
      const r = clip(cell);
      if (r) fenceLabels.push(new THREE.Vector3(r.x1 - 1.5, 3.0, r.z0));
    }
  }
  // 网球场的围网：地图的 COURT_FENCES（挨着的场共用一道）；匹克球围场：西门 + 东北员工小门（PICKLE_DOORS）
  for (const f of COURT_FENCES) fenceLine(fenceRuns, f);
  fenceRect(fenceRuns, PICKLE, PICKLE_FENCE_H, PICKLE_DOORS);
  // ?sfh=：南围网（朝镜头那段）的高度（默认 2.2 同 clubdesk）
  const sfh = Number(ctx.params.get('sfh') ?? 2.2);
  for (const r of fenceRuns) if (r.z0 === PICKLE.z1 && r.z1 === PICKLE.z1 && r.x0 >= PICKLE.x0 - 0.01) r.h = sfh;
  fenceLabels.push(new THREE.Vector3(PICKLE.x1 - 2.5, 2.6, PICKLE.z1));

  B.build(ctx, root);
  root.add(buildFences(ctx as unknown as DeskCtx, fenceRuns));
  ctx.mats.prepare(root);
  for (const m of root.children as THREE.Mesh[]) {
    // 立面不接收投影（朝镜头的立面永远是干净的暗档）；平的东西不投影（门外铺地的网格名字带 park: 前缀）
    const n = m.name.replace(/^park:/, '');
    if (n.startsWith('wall:') || n.startsWith('lip:') || n.startsWith('stairs')) m.receiveShadow = false;
    if (m.name.startsWith('park:') && (n.startsWith('flat:') || n.startsWith('top:'))) m.castShadow = false;
    if (m.name === 'top:ground') m.castShadow = false;
  }
  // 地图边的山（这个场景默认看不到，平移到地图边才有；不投影、不受投影，prepare 之后再加）
  root.add(buildMountains((c, o) => ctx.mats.toon(c, o)));
  return { root, outlines: { lawn, plaza }, groundAt, fenceLabels };
}

/** 一片场（裁到 CLIP）：场边色 + 场内色 + 白线（沿 x 打）+ 网（同 clubmap2/build.ts 的 court，线宽换成 2 设计纹素） */
function paintCourt(B: Bucket, c: Court) {
  const pickle = c.kind === 'pickle';
  const L = pickle ? 13.41 : 23.77;
  const DW = pickle ? 6.1 : 10.97;
  const SW = pickle ? 6.1 : 8.23;
  const SVC = pickle ? 2.13 : 6.4;
  const cell: Rect = { x0: c.x - c.hx, x1: c.x + c.hx, z0: c.z - c.hz, z1: c.z + c.hz };
  const q = (r: Rect, y: number, key: Key) => {
    const k = clip(r);
    if (k) B.add(key, quad(k, y), FLAT);
  };
  if (c.kind === 'clay') q(cell, 0.018, 'clay');
  else {
    if (!pickle) q(cell, 0.018, 'surround');
    const m = pickle ? 0.6 : 1.4;
    q(
      { x0: c.x - L / 2 - m, x1: c.x + L / 2 + m, z0: c.z - DW / 2 - m * 0.6, z1: c.z + DW / 2 + m * 0.6 },
      0.022,
      pickle ? 'pickle' : 'court',
    );
  }
  // 厨房（非截击区）：网两边各 NVZ 米，深一级的钴蓝（压在场面上、白线下面）
  if (pickle) q({ x0: c.x - PK.NVZ, x1: c.x + PK.NVZ, z0: c.z - DW / 2, z1: c.z + DW / 2 }, 0.026, 'kitchen');
  const line = (x0: number, x1: number, z0: number, z1: number) => q({ x0, x1, z0, z1 }, 0.03, 'line');
  for (const s of [-1, 1]) {
    line(c.x + (s * L) / 2 - LW / 2, c.x + (s * L) / 2 + LW / 2, c.z - DW / 2, c.z + DW / 2);
    line(c.x - L / 2, c.x + L / 2, c.z + (s * DW) / 2 - LW / 2, c.z + (s * DW) / 2 + LW / 2);
    if (!pickle) line(c.x - L / 2, c.x + L / 2, c.z + (s * SW) / 2 - LW / 2, c.z + (s * SW) / 2 + LW / 2);
    line(c.x + s * SVC - LW / 2, c.x + s * SVC + LW / 2, c.z - SW / 2, c.z + SW / 2);
  }
  if (pickle)
    for (const s of [-1, 1])
      line(
        Math.min(c.x + s * SVC, c.x + (s * L) / 2),
        Math.max(c.x + s * SVC, c.x + (s * L) / 2),
        c.z - LW / 2,
        c.z + LW / 2,
      );
  else line(c.x - SVC, c.x + SVC, c.z - LW / 2, c.z + LW / 2);
  // 匹克球的网是资产（SLOTS 的 pickle-net），不在地形里建
  if (pickle || c.x < CLIP.x0 || c.x > CLIP.x1) return;
  const nh = pickle ? 0.86 : 1.07;
  const len = DW + (pickle ? 0.6 : 1.8);
  B.add('net', box(0.12, nh - 0.15, len, c.x, 0, c.z), { extra: { noShadowReceive: true }, cast: true });
  B.add('netTape', box(0.14, 0.15, len, c.x, nh - 0.15, c.z), FLAT);
}

/** 一道直的围网（地图的 FenceLine）：按门切开、裁到 CLIP，收成直线段交给 buildFences（assets/fence-screen） */
function fenceLine(runs: FenceRun[], f: FenceLine) {
  const alongX = Math.abs(f.z1 - f.z0) < 1e-6;
  if (alongX ? f.z0 < CLIP.z0 || f.z0 > CLIP.z1 : f.x0 < CLIP.x0 || f.x0 > CLIP.x1) return;
  const [a0, a1] = alongX ? [f.x0, f.x1] : [f.z0, f.z1];
  for (const [p, q] of fencePieces(a0, a1, f.doors)) {
    if (alongX) {
      const k = clip({ x0: p, x1: q, z0: f.z0 - 0.1, z1: f.z0 + 0.1 });
      if (k) runs.push({ x0: k.x0, z0: f.z0, x1: k.x1, z1: f.z0, h: f.h });
    } else {
      const k = clip({ x0: f.x0 - 0.1, x1: f.x0 + 0.1, z0: p, z1: q });
      if (k) runs.push({ x0: f.x0, z0: k.z0, x1: f.x0, z1: k.z1, h: f.h });
    }
  }
}

/** 围网：矩形四边，每边可以留几个门（at = 门中心沿那边的世界坐标），裁到 CLIP */
function fenceRect(
  runs: FenceRun[],
  r: Rect,
  h: number,
  doors: { side: 'n' | 's' | 'e' | 'w'; at: number; gap: number }[] = [],
) {
  const on = (side: string) => doors.filter((d) => d.side === side);
  fenceLine(runs, { x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z0, h, doors: on('n') });
  fenceLine(runs, { x0: r.x0, z0: r.z1, x1: r.x1, z1: r.z1, h, doors: on('s') });
  fenceLine(runs, { x0: r.x0, z0: r.z0, x1: r.x0, z1: r.z1, h, doors: on('w') });
  fenceLine(runs, { x0: r.x1, z0: r.z0, x1: r.x1, z1: r.z1, h, doors: on('e') });
}

/** 带状多边形（步道）：中线左右各偏 w/2，齐边（同 clubfront/terrain.ts 的 strip） */
function strip(line: V2[], w: number): V2[] {
  const L: V2[] = [];
  const R: V2[] = [];
  for (let i = 0; i < line.length; i++) {
    const a = line[Math.max(0, i - 1)];
    const b = line[Math.min(line.length - 1, i + 1)];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const l = Math.hypot(dx, dz) || 1;
    const [x, z] = line[i];
    const k = w / 2;
    L.push([x - (dz / l) * k, z + (dx / l) * k]);
    R.push([x + (dz / l) * k, z - (dx / l) * k]);
  }
  return [...L, ...R.reverse()];
}

/** 台阶：每级一个盒子（往上层里多伸 0.3 米，免得露缝） */
function stairsGeo(st: Stairs): THREE.BufferGeometry {
  const { x0, x1, z0, steps, run, from, to } = st;
  const rise = (from - to) / steps;
  const geos: THREE.BufferGeometry[] = [];
  for (let k = 0; k < steps; k++) {
    const top = from - rise * (k + 1);
    const za = z0 - 0.3;
    const zb = z0 + run * (k + 1);
    const hgt = top - (to - 0.1);
    geos.push(
      new THREE.BoxGeometry(x1 - x0, hgt, zb - za)
        .translate((x0 + x1) / 2, to - 0.1 + hgt / 2, (za + zb) / 2)
        .toNonIndexed(),
    );
  }
  for (const g of geos) g.deleteAttribute('uv');
  return mergeGeometries(geos);
}

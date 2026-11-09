// 地形：地面（clubsite/ground.ts，铺到画外）+ 墙里的压实沙地 + 北围墙、东墙（土坯、压顶、壁柱）
// + 喷泉广场（抬高 1.2：石板 + 喷泉一圈陶砖 + 西边步道；南沿挡土墙 = 暗带，同 clubdesk 的做法和尺寸）+ 两段台阶（clubdesk 的 STAIRS）
// + 长廊、到达小院 + 匹克球北半、西边硬地场的一角 + 中心球场的东看台（邻居，照 clubmap2/build.ts 的体块）
// + 门外的铺地（clubpark 的 buildApproach，同一份几何）。围网用 clubdesk 的 fence-screen（buildFences，只读 import）。
// 喷泉本身是资产（palm-fountain）；它还没画的时候，水面在这里先用 fountainWater 铺一块（白模里看得到冷色）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildFences, type FenceRun } from '../clubdesk/assets/fence-screen';
import { STAIRS as DESK_STAIRS, type Stairs, WALL } from '../clubdesk/layout';
import type { AssetCtx as ParkCtx } from '../clubpark/ctx';
import { PAL as PARK_PAL } from '../clubpark/palette';
import { approachAt, buildApproach } from '../clubpark/terrain';
import { groundGeo } from '../clubsite/ground';
import { buildMountains } from '../clubsite/mountains';
import { box, insidePoly, quad, topGeo, wallGeo } from '../clubsite/render/geo';
import type { ToonOpts } from '../clubsite/render/toon';
import {
  COURT_FENCES,
  COURTS,
  type Court,
  type FenceLine,
  FORECOURT,
  fencePieces,
  GATE,
  GROUNDS,
  PATHS,
  PICKLE_DOORS,
  PICKLE_FENCE_H,
} from '../clubsite/world';
import type { AssetCtx } from './ctx';
import {
  CLIP,
  FOUNTAIN,
  FOUNTAIN_SPEC,
  H,
  PICKLE,
  PLAZA,
  PLAZA_WALK,
  type Rect,
  STADIUM_LINK,
  type V2,
} from './layout';
import { EL, type Pal } from './palette';

type Key = keyof Pal;

/** 按材质收几何体，最后每种材质合并成一个网格（同 clubdesk/terrain.ts 的 Bucket） */
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
      mesh.name = `plaza:${id}`;
      mesh.castShadow = e.cast;
      mesh.receiveShadow = true;
      root.add(mesh);
    }
  }
}

const FLAT = { cast: false };
/** 白线宽：2 设计纹素（0.18 米），同 clubdesk */
const LW = 0.18;

/** 门外铺地用 clubpark 的材质名：同 clubdesk/terrain.ts 的 parkCtx（照 clubpark 的色板建参数，借同组的名字过配色） */
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

/** 矩形和裁剪框求交；空 → null */
function clip(r: Rect, c: Rect = CLIP): Rect | null {
  const o = { x0: Math.max(r.x0, c.x0), x1: Math.min(r.x1, c.x1), z0: Math.max(r.z0, c.z0), z1: Math.min(r.z1, c.z1) };
  return o.x1 - o.x0 > 0.05 && o.z1 - o.z0 > 0.05 ? o : null;
}

/** 圆角矩形轮廓（同 clubdesk/terrain.ts 的 roundRect：广场的轮廓要和那边一模一样） */
function roundRect(r: Rect, rad: number): V2[] {
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

/** 圆（多边形轮廓） */
function circle(cx: number, cz: number, r: number, n = 48): V2[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [cx + Math.cos(a) * r, cz + Math.sin(a) * r] as V2;
  });
}

export interface Terrain {
  root: THREE.Group;
  outlines: Record<string, V2[]>;
  /** 某点的地面高度（广场 / 门外的花坛 / 地面） */
  groundAt(x: number, z: number): number;
}

export function buildTerrain(ctx: AssetCtx, opts: { water: boolean }): Terrain {
  const root = new THREE.Group();
  root.name = 'terrain';
  const B = new Bucket();
  const LIP = ctx.texel * 1.2;
  const plaza = roundRect(PLAZA, 0.5);

  const groundAt = (x: number, z: number) => {
    if (insidePoly([x, z], plaza)) return H.plaza;
    if (x > GATE.x) return approachAt(x, z) ?? H.ground;
    return H.ground;
  };

  const add = (
    g: THREE.BufferGeometry,
    m: THREE.Material,
    name: string,
    o: { recv?: boolean; cast?: boolean } = {},
  ) => {
    const mesh = new THREE.Mesh(g, m);
    mesh.name = name;
    mesh.receiveShadow = o.recv ?? true;
    mesh.castShadow = o.cast ?? true;
    root.add(mesh);
    return mesh;
  };
  const adobe = ctx.mat('adobe', { elem: EL.adobe });
  const cap = ctx.mat('cap');

  // ── 地面：墙外的沙漠沙铺到画外（围墙里挖掉，另铺压实的浅沙）──
  const grounds: V2[] = [
    [GROUNDS.x0, GROUNDS.z0],
    [GATE.x, GROUNDS.z0],
    [GATE.x, GROUNDS.z1],
    [GROUNDS.x0, GROUNDS.z1],
  ];
  add(groundGeo([grounds], H.ground), ctx.mat('sand', { elem: EL.sand }), 'top:ground', { cast: false });
  add(topGeo(grounds, H.ground + 0.004), ctx.mat('sandHigh', { elem: { ...EL.sand, seed: 7 } }), 'top:grounds', {
    cast: false,
  });

  // ── 围墙：北墙（z −43，朝镜头的南面 = 画面上方的暗带）+ 东墙；压顶、壁柱同 clubmap2 的算法（每段 floor(长/12) 等分）──
  {
    const pier = (x: number, z: number) => {
      B.add('adobe', box(WALL.pier, WALL.pierH, WALL.pier, x, 0, z));
      B.add('cap', box(WALL.pier + 0.2, WALL.pierCap, WALL.pier + 0.2, x, WALL.pierH, z));
    };
    // 北墙：地图上整段 x −64…60；这里画 CLIP.x0 − 2 … 60
    {
      const a = GROUNDS.x0;
      const b = GROUNDS.x1;
      const s0 = CLIP.x0 - 2;
      const len = b - s0;
      const cx = (s0 + b) / 2;
      const z = GROUNDS.z0;
      B.add('adobe', box(len, WALL.h, WALL.t, cx, 0, z));
      B.add('cap', box(len + 0.2, WALL.cap, WALL.t + 0.2, cx, WALL.h, z));
      const n = Math.floor((b - a) / 12);
      for (let i = 1; i < n; i++) {
        const px = a + ((b - a) * i) / n;
        if (px > s0 + 0.6) pier(px, z);
      }
      pier(b, z); // 东北角
    }
    // 东墙：z −43 … 门洞北柱、门洞南柱 … CLIP.z1
    const segs: [number, number][] = [
      [GROUNDS.z0, GATE.z0 - 0.8],
      [GATE.z1 + 0.8, GROUNDS.z1],
    ];
    for (const [a, b] of segs) {
      const s0 = Math.max(a, CLIP.z0);
      const s1 = Math.min(b, CLIP.z1 + 0.6);
      if (s1 <= s0) continue;
      const cz = (s0 + s1) / 2;
      B.add('adobe', box(WALL.t, WALL.h, s1 - s0, GATE.x, 0, cz));
      B.add('cap', box(WALL.t + 0.2, WALL.cap, s1 - s0, GATE.x, WALL.h, cz));
      const n = Math.floor((b - a) / 12);
      for (let i = 1; i < n; i++) {
        const pz = a + ((b - a) * i) / n;
        if (pz > s0 + 0.6 && pz < s1 - 0.6) pier(GATE.x, pz);
      }
    }
  }

  // ── 门外：落客区、车道、停车场（和 clubpark / clubdesk 同一份几何；横屏右边才看得到）──
  buildApproach(parkCtx(ctx), (g, m, name) => {
    const flat = name.startsWith('flat:') || name.startsWith('top:');
    const face = name.startsWith('wall:') || name.startsWith('lip:');
    add(g, m, `park:${name}`, { cast: !flat, recv: !face });
  });

  // ── 到达小院（陶砖）、长廊和步道（碎花岗岩，到小院西沿为止；同 clubdesk）──
  add(quad(FORECOURT, H.ground + 0.014), ctx.mat('tile', { elem: EL.tile }), 'tile:forecourt', { cast: false });
  const granite = ctx.mat('granite', { elem: EL.granite });
  let i = 0;
  for (const p of PATHS) {
    const r = clip(p, { ...CLIP, x1: FORECOURT.x0 + 0.01 });
    if (r) add(quad(r, H.ground + 0.012), granite, `path:${i++}`, { cast: false });
  }

  // ── 喷泉广场：抬高 1.2（石板），南沿挡土墙朝镜头；喷泉一圈陶砖 r 9（暖色的底，衬冷色的水）；西边步道压在石板上 ──
  {
    const y = H.plaza;
    add(topGeo(plaza, y), ctx.mat('flagstone', { elem: { ...EL.flagstone, seed: 4 } }), 'top:plaza', { cast: false });
    add(wallGeo(plaza, y, y - LIP, true), cap, 'lip:plaza', { recv: false });
    add(
      wallGeo(plaza, y - LIP, -0.3, true, 0, () => y),
      adobe,
      'wall:plaza',
      { recv: false },
    );
    // 喷泉一圈陶砖（地图的 FOUNTAIN.r 9；白模用 tile 的石块元素，资产阶段换成放射 / 同心圆的砖缝）+ 外沿一圈压顶色的砖边（0.36 米 = 4 纹素）
    const apron = circle(FOUNTAIN.x, FOUNTAIN.z, FOUNTAIN.r);
    const border = circle(FOUNTAIN.x, FOUNTAIN.z, FOUNTAIN.r - 0.36);
    add(topGeo(apron, y + 0.012, [border]), ctx.mat('cap'), 'top:apron-border', { cast: false });
    add(topGeo(border, y + 0.014), ctx.mat('tile', { elem: { ...EL.tile, seed: 11 } }), 'top:apron', {
      cast: false,
    });
    // 西边步道（地图 PATHS 的 x 34…37 在广场上的一段，碎花岗岩；下去就是 clubdesk 的西台阶），绕开陶砖圈
    add(topGeo(roundRect(PLAZA_WALK, 0.2), y + 0.01), granite, 'path:plaza-walk', { cast: false });
    // 池水：资产还没画的时候先铺一块（喷泉资产里有自己的水面和涟漪）
    if (opts.water)
      add(
        new THREE.CircleGeometry(FOUNTAIN_SPEC.waterR, 40)
          .rotateX(-Math.PI / 2)
          .translate(FOUNTAIN.x, y + FOUNTAIN_SPEC.waterY, FOUNTAIN.z),
        ctx.mat('fountainWater', { noShadowReceive: false }),
        'top:water',
        { cast: false },
      );
  }

  // ── 建议加的：广场西沿的台阶 + 去中心球场看台的小路（STADIUM_LINK，横屏左边）──
  {
    const st = STADIUM_LINK.stairs;
    const rise = H.plaza / st.steps;
    const geos: THREE.BufferGeometry[] = [];
    for (let k = 0; k < st.steps; k++) {
      const top = H.plaza - rise * (k + 1);
      const xa = st.x1 + 0.3;
      const xb = st.x1 - st.run * (k + 1);
      geos.push(box(xa - xb, top + 0.1, st.z1 - st.z0, (xa + xb) / 2, -0.1, (st.z0 + st.z1) / 2).toNonIndexed());
    }
    for (const g of geos) g.deleteAttribute('uv');
    add(mergeGeometries(geos), ctx.mat('stair', { edge: 0.18, convex: 0.25 }), 'stairs:link', { recv: false });
    add(quad(STADIUM_LINK.path, H.ground + 0.012), granite, 'path:link', { cast: false });
  }

  // ── 台阶：clubdesk 的 STAIRS 里从广场下来的两段（x 34…37、49…51.4）──
  for (const [k, st] of DESK_STAIRS.filter((s) => s.from === H.plaza).entries())
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
      `stairs:${k}`,
      { recv: false },
    );

  // ── 球场：匹克球（北半在竖屏下沿）、西边硬地场的东北角、中心球场东头（横屏左边）；围网 = clubdesk 的 fence-screen ──
  const fenceRuns: FenceRun[] = [];
  B.add('surround', quad(PICKLE, 0.016), FLAT);
  for (const c of COURTS) {
    const cell: Rect = { x0: c.x - c.hx, x1: c.x + c.hx, z0: c.z - c.hz, z1: c.z + c.hz };
    if (!clip(cell)) continue;
    paintCourt(B, c);
  }
  // 网球场的围网：地图的 COURT_FENCES（挨着的场共用一道）；匹克球围场：西门 + 东北员工小门（PICKLE_DOORS）
  for (const f of COURT_FENCES) fenceLine(fenceRuns, f);
  fenceRect(fenceRuns, PICKLE, PICKLE_FENCE_H, PICKLE_DOORS);

  // ── 中心球场的看台（邻居：照 clubmap2/build.ts 的体块，只画 x > CLIP.x0 的东头；看台本身归以后的中心球场场景）──
  {
    const S = COURTS[0];
    const cx1 = S.x + S.hx;
    const cz0 = S.z - S.hz;
    const cz1 = S.z + S.hz;
    const x0 = CLIP.x0;
    const tier = (k: number, rise: number, deep: number) => ({ top: (k + 1) * rise, a: k * deep, b: (k + 1) * deep });
    // 北看台（6 级）+ 后墙：x x0 … cx1 + 2
    const nx1 = cx1 + 2;
    for (let k = 0; k < 6; k++) {
      const t = tier(k, 0.9, 1.2);
      B.add('concrete', box(nx1 - x0, t.top, t.b - t.a, (x0 + nx1) / 2, 0, cz0 - (t.a + t.b) / 2));
      B.add('seat', box(nx1 - x0 - 0.4, 0.35, 0.5, (x0 + nx1) / 2 - 0.2, t.top, cz0 - t.a - 0.35), { cast: false });
    }
    B.add('concrete', box(nx1 - x0, 1.4, 0.4, (x0 + nx1) / 2, 6 * 0.9, cz0 - 7.4));
    // 东看台（3 级）
    for (let k = 0; k < 3; k++) {
      const t = tier(k, 0.8, 1.2);
      B.add('concrete', box(t.b - t.a, t.top, cz1 - cz0, cx1 + (t.a + t.b) / 2, 0, S.z));
      B.add('seat', box(0.5, 0.3, cz1 - cz0 - 0.6, cx1 + t.a + 0.35, t.top, S.z), { cast: false });
    }
    // 南看台（2 级）：x x0 … cx1
    for (let k = 0; k < 2; k++) {
      const t = tier(k, 0.6, 1.1);
      B.add('concrete', box(cx1 - x0, t.top, t.b - t.a, (x0 + cx1) / 2, 0, cz1 + (t.a + t.b) / 2));
      B.add('seat', box(cx1 - x0 - 0.3, 0.25, 0.45, (x0 + cx1) / 2, t.top, cz1 + t.a + 0.3), { cast: false });
    }
  }

  B.build(ctx, root);
  root.add(buildFences(ctx as never, fenceRuns));
  ctx.mats.prepare(root);
  for (const m of root.children as THREE.Mesh[]) {
    // 立面不接收投影（朝镜头的立面永远是干净的暗档）；平的东西不投影
    const n = m.name.replace(/^park:/, '');
    if (n.startsWith('wall:') || n.startsWith('lip:') || n.startsWith('stairs')) m.receiveShadow = false;
    if (m.name.startsWith('park:') && (n.startsWith('flat:') || n.startsWith('top:'))) m.castShadow = false;
    if (n.startsWith('top:')) m.castShadow = false;
  }
  // 地图边的山（这个场景默认看不到；不投影、不受投影，prepare 之后再加）
  root.add(buildMountains((c, o) => ctx.mats.toon(c, o)));
  return { root, outlines: { plaza }, groundAt };
}

/** 一片场（裁到 CLIP）：场边色 + 场内色 + 白线 + 网（同 clubdesk/terrain.ts 的 paintCourt） */
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
  if (c.x < CLIP.x0 || c.x > CLIP.x1 || c.z > CLIP.z1) return;
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

/** 台阶：每级一个盒子（往上层里多伸 0.3 米，免得露缝；同 clubdesk） */
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

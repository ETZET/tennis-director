// 地形：地面（clubsite/ground.ts，铺到画外）+ 墙里的压实沙地 + 北围墙、西围墙（土坯、压顶、壁柱）
// + **会所的壳**（buildHouse：墙按 layout.ts 的 WALLS 切开门窗洞、每间房的地面、四坡红瓦屋顶；外观 / 里面两套，setInside 切换）
// + 邻居：餐车院子的地面（clubfood 的 FOOD_COURT、ARCADE_YARD 碎花岗岩、SPINE 石板）、长廊和西步道、泳池（照 clubmap2，clubpool 在重做）、
//   青训西场（场面 + 白线 + 网 + 围网）。家具、钟楼、门窗的装饰都是资产（占位），这里只管墙、地、屋顶。
//
// 外观 / 里面：每个网格的 userData.houseMode = 'out'（只在外观）| 'in'（只在里面）| 不设（都在）。setInside(root, on) 按它切 visible。
// - 外观：屋顶、二楼那一截墙、朝镜头的（沿 x 的）墙整高；钟楼是占位（layout.ts SLOTS 的 bell-tower，mode out）。
// - 里面：屋顶、二楼隐藏；朝镜头的墙（北外墙除外）和所有隔墙换成 1 米高的切墙（顶上 0.1 米 wallCut 深色）；沿 z 的外墙和北外墙留到 2.8 米（frame），顶上也压一条 wallCut；
//   钟楼底的墙（tower: true）只在里面出现。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildFences, type FenceRun } from '../clubdesk/assets/fence-screen';
import { WALL } from '../clubdesk/layout';
import { groundGeo } from '../clubsite/ground';
import { buildMountains } from '../clubsite/mountains';
import { box, quad, topGeo } from '../clubsite/render/geo';
import type { ToonOpts } from '../clubsite/render/toon';
import { COURT_FENCES, type Court, type FenceLine, fencePieces } from '../clubsite/world';
import type { AssetCtx } from './ctx';
import {
  ARCADE_YARD,
  alongX,
  CLIP,
  COURTS,
  FOOD_COURT,
  GROUNDS,
  H,
  isCut,
  MASS,
  NORTH_WALK,
  PATHS,
  POOL,
  POOL_DECK,
  type Rect,
  ROOFS,
  ROOMS,
  SPINE,
  STOREY,
  type V2,
  WALL_T,
  WALLS,
  type Wall,
  wallPieces,
} from './layout';
import { EL, type Pal } from './palette';

type Key = keyof Pal;
export type HouseMode = 'in' | 'out';

/** 按材质收几何体，最后每种材质合并成一个网格（同 clubfood/terrain.ts 的 Bucket）；mode 给整桶打外观 / 里面的标 */
class Bucket {
  private m = new Map<string, { key: Key; extra?: ToonOpts; geos: THREE.BufferGeometry[]; cast: boolean }>();
  constructor(private mode?: HouseMode) {}
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
  build(ctx: AssetCtx, root: THREE.Object3D, prefix: string) {
    for (const [id, e] of this.m) {
      const mesh = new THREE.Mesh(mergeGeometries(e.geos), ctx.mat(e.key, e.extra));
      mesh.name = `${prefix}:${this.mode ?? 'all'}:${id}`;
      mesh.castShadow = e.cast;
      mesh.receiveShadow = true;
      if (this.mode) mesh.userData.houseMode = this.mode;
      root.add(mesh);
    }
  }
}

const FLAT = { cast: false };
/** 白线宽：2 设计纹素（0.18 米），同 clubdesk */
const LW = 0.18;

/** 矩形和裁剪框求交；空 → null */
function clip(r: Rect, c: Rect = CLIP): Rect | null {
  const o = { x0: Math.max(r.x0, c.x0), x1: Math.min(r.x1, c.x1), z0: Math.max(r.z0, c.z0), z1: Math.min(r.z1, c.z1) };
  return o.x1 - o.x0 > 0.05 && o.z1 - o.z0 > 0.05 ? o : null;
}

/** 四坡屋顶（照 clubmap2/build.ts 的 hipRoof）：底在 y，高 h，四边出檐 over；屋脊沿长边 */
function hipRoof(r: Rect, y: number, h: number, over = 0.5): THREE.BufferGeometry {
  const x0 = r.x0 - over;
  const x1 = r.x1 + over;
  const z0 = r.z0 - over;
  const z1 = r.z1 + over;
  const w = x1 - x0;
  const d = z1 - z0;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const P = (x: number, yy: number, z: number) => new THREE.Vector3(x, yy, z);
  const a = P(x0, y, z0);
  const b = P(x1, y, z0);
  const c = P(x1, y, z1);
  const dd = P(x0, y, z1);
  const [r0, r1] =
    w >= d
      ? [P(x0 + d / 2, y + h, cz), P(x1 - d / 2, y + h, cz)]
      : [P(cx, y + h, z0 + w / 2), P(cx, y + h, z1 - w / 2)];
  const tris: THREE.Vector3[][] =
    w >= d
      ? [
          [a, r0, r1],
          [a, r1, b],
          [dd, c, r1],
          [dd, r1, r0],
          [a, dd, r0],
          [b, r1, c],
        ]
      : [
          [a, r0, b],
          [dd, c, r1],
          [a, dd, r1],
          [a, r1, r0],
          [b, r0, r1],
          [b, r1, c],
        ];
  const pos: number[] = [];
  for (const t of tris) {
    const n = new THREE.Vector3().subVectors(t[1], t[0]).cross(new THREE.Vector3().subVectors(t[2], t[0]));
    const tt = n.y < 0 ? [t[0], t[2], t[1]] : t;
    for (const v of tt) pos.push(v.x, v.y, v.z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** 一段墙（沿墙坐标 a0…a1、y0…y1）的盒子 */
function pieceGeo(w: Wall, a0: number, a1: number, y0: number, y1: number, tExtra = 0): THREE.BufferGeometry {
  const t = w.t + tExtra;
  const c = alongX(w) ? w.a[1] : w.a[0];
  const len = a1 - a0;
  const mid = (a0 + a1) / 2;
  return alongX(w) ? box(len, y1 - y0, t, mid, y0, c) : box(t, y1 - y0, len, c, y0, mid);
}

/** 墙的起止（沿墙坐标） */
function span(w: Wall): [number, number] {
  return alongX(w)
    ? [Math.min(w.a[0], w.b[0]), Math.max(w.a[0], w.b[0])]
    : [Math.min(w.a[1], w.b[1]), Math.max(w.a[1], w.b[1])];
}

/**
 * 会所的壳：墙（外观 / 里面两套）、每间房的地面、屋顶。只用这个场景调色板里的材质；坐标全是世界坐标（clubwalk 直接 add 进大场景）。
 * 返回的组里每个网格带 userData.houseMode，setInside(组, on) 切换。
 */
export function buildHouse(ctx: AssetCtx): THREE.Group {
  const root = new THREE.Group();
  root.name = 'clubhouse';
  const all = new Bucket();
  const out = new Bucket('out');
  const inn = new Bucket('in');
  const { gf, cut, cutCap, frame } = STOREY;

  // ── 地面：每间房一块（木地板 / 陶砖 / 冷色瓷砖 / 水泥），铺到脚印边，墙压在上面 ──
  for (const r of ROOMS) {
    const el =
      r.floor === 'floorOak'
        ? EL.floorOak
        : r.floor === 'floorCool'
          ? EL.floorCool
          : r.floor === 'tile'
            ? EL.tile
            : undefined;
    all.add(r.floor, quad(r.r, H.ground + 0.03), {
      ...FLAT,
      extra: el ? { elem: { ...el, seed: r.r.x0 } } : undefined,
      tag: r.id,
    });
  }

  // ── 墙 ──
  for (const w of WALLS) {
    const [s0, s1] = span(w);
    /** 隔墙刷赭石石灰水（plaster），外墙白灰泥（stucco） */
    const mat: Key = w.t < WALL_T.ext ? 'plaster' : 'stucco';
    if (w.upper) {
      out.add('stucco', pieceGeo(w, s0, s1, gf, w.h));
      continue;
    }
    if (isCut(w)) {
      // 朝镜头的墙、隔墙：外观整高（门窗洞）；里面切到 1 米，顶上一条深色
      if (!w.tower) for (const p of wallPieces(w, w.h)) out.add(mat, pieceGeo(w, p.a0, p.a1, p.y0, p.y1));
      for (const p of wallPieces(w, cut)) {
        const top = p.y1 >= cut - 1e-3;
        inn.add(mat, pieceGeo(w, p.a0, p.a1, p.y0, top ? cut - cutCap : p.y1));
        if (top) inn.add('wallCut', pieceGeo(w, p.a0, p.a1, cut - cutCap, cut, 0.02));
      }
      continue;
    }
    // 沿 z 的外墙、北外墙（娃娃屋的三面框）：frame（2.8 米）以下两种模式都在；外观再加上面那截（到檐高，门洞照开）；
    // 里面在 frame 顶上压一条深色。框不留整层 4 米：北墙 4 米时朝镜头的那面是一大条阴影里的灰紫，还往休息室里投 4 米的影
    const B = w.tower ? inn : all;
    for (const p of wallPieces(w, frame)) B.add('stucco', pieceGeo(w, p.a0, p.a1, p.y0, p.y1));
    if (!w.tower)
      for (const p of wallPieces(w, w.h))
        if (p.y1 > frame + 1e-3) out.add('stucco', pieceGeo(w, p.a0, p.a1, Math.max(p.y0, frame), p.y1));
    for (const p of wallPieces(w, frame))
      if (p.y1 >= frame - 1e-3) inn.add('wallCut', pieceGeo(w, p.a0, p.a1, frame, frame + cutCap, 0.02));
  }

  // ── 屋顶（外观）：layout.ts 的 ROOFS（二层、东翼、一层两片、拱廊转角），红瓦四坡顶；二层檐下一圈檐口 ──
  for (const r of ROOFS) out.add('roofTile', hipRoof(r, r.eave, r.roof, r.over));
  {
    const r = MASS.upper;
    const t = 0.25;
    for (const z of [r.z0 - 0.1, r.z1 + 0.1])
      out.add('stucco', box(r.x1 - r.x0 + 0.5, t, 0.3, (r.x0 + r.x1) / 2, r.eave - t, z));
  }

  all.build(ctx, root, 'house');
  out.build(ctx, root, 'house');
  inn.build(ctx, root, 'house');
  ctx.mats.prepare(root);
  return root;
}

/** 外观 / 里面：按 userData.houseMode 切 visible（'in' 只在里面、'out' 只在外观、不设的都在）。clubwalk 拿会所的组调这个 */
export function setInside(root: THREE.Object3D, on: boolean) {
  root.traverse((o) => {
    const m = o.userData.houseMode as HouseMode | undefined;
    if (m) o.visible = m === 'in' ? on : !on;
  });
}

export interface Terrain {
  root: THREE.Group;
  house: THREE.Group;
  groundAt(x: number, z: number): number;
}

export function buildTerrain(ctx: AssetCtx): Terrain {
  const root = new THREE.Group();
  root.name = 'terrain';
  const B = new Bucket();
  const groundAt = (_x: number, _z: number) => H.ground;
  const add = (g: THREE.BufferGeometry, m: THREE.Material, name: string) => {
    const mesh = new THREE.Mesh(g, m);
    mesh.name = name;
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    root.add(mesh);
    return mesh;
  };

  // ── 地面：墙外的沙漠沙铺到画外（围墙里挖掉，另铺压实的浅沙）──
  const grounds: V2[] = [
    [GROUNDS.x0, GROUNDS.z0],
    [GROUNDS.x1, GROUNDS.z0],
    [GROUNDS.x1, GROUNDS.z1],
    [GROUNDS.x0, GROUNDS.z1],
  ];
  add(groundGeo([grounds], H.ground), ctx.mat('sand', { elem: EL.sand }), 'top:ground');
  add(topGeo(grounds, H.ground + 0.004), ctx.mat('sandHigh', { elem: { ...EL.sand, seed: 7 } }), 'top:grounds');

  // ── 围墙：北墙（z −43）+ 西墙（x −64）；壁柱同 clubmap2（每段 floor(长/12) 等分）──
  {
    const pier = (x: number, z: number) => {
      B.add('adobe', box(WALL.pier, WALL.pierH, WALL.pier, x, 0, z));
      B.add('cap', box(WALL.pier + 0.2, WALL.pierCap, WALL.pier + 0.2, x, WALL.pierH, z));
    };
    const { x0: a, x1: b, z0: zN, z1: zS } = GROUNDS;
    const e = CLIP.x1 + 2;
    B.add('adobe', box(e - a, WALL.h, WALL.t, (a + e) / 2, 0, zN));
    B.add('cap', box(e - a + 0.2, WALL.cap, WALL.t + 0.2, (a + e) / 2, WALL.h, zN));
    const n = Math.floor((b - a) / 12);
    for (let i = 1; i < n; i++) {
      const px = a + ((b - a) * i) / n;
      if (px < e - 0.6) pier(px, zN);
    }
    pier(a, zN);
    const s1 = CLIP.z1 + 0.6;
    B.add('adobe', box(WALL.t, WALL.h, s1 - zN, a, 0, (zN + s1) / 2));
    B.add('cap', box(WALL.t + 0.2, WALL.cap, s1 - zN, a, WALL.h, (zN + s1) / 2));
    const m = Math.floor((zS - zN) / 12);
    for (let i = 1; i < m; i++) {
      const pz = zN + ((zS - zN) * i) / m;
      if (pz < s1 - 0.6) pier(a, pz);
    }
  }

  // ── 邻居：餐车院子（clubfood）的地面：碎花岗岩、球员通道石板（东头只到 CLIP）──
  const granite = ctx.mat('granite', { elem: EL.granite });
  for (const [i, r] of [FOOD_COURT, ARCADE_YARD].entries()) {
    const k = clip(r);
    if (k) add(quad(k, H.ground + 0.01), granite, `top:food-${i}`);
  }
  {
    const k = clip(SPINE);
    if (k) add(quad(k, H.ground + 0.016), ctx.mat('flagstone', { elem: { ...EL.flagstone, seed: 5 } }), 'top:spine');
  }
  // clubpool 建议的石板小路（拱廊转角 → 泳池北门）
  add(
    quad(NORTH_WALK, H.ground + 0.016),
    ctx.mat('flagstone', { elem: { ...EL.flagstone, seed: 9 } }),
    'top:north-walk',
  );
  // 长廊、西步道（碎花岗岩）
  let i = 0;
  for (const p of PATHS) {
    const r = clip(p);
    if (r) add(quad(r, H.ground + 0.012), granite, `path:${i++}`);
  }

  // ── 泳池（邻居：照 clubmap2，clubpool 在重做）：池畔石板、水、池沿、躺椅、三间帐篷 ──
  {
    B.add('flagstone', quad(POOL_DECK, 0.014), { ...FLAT, extra: { elem: EL.flagstone } });
    B.add('water', quad(POOL, 0.05), FLAT);
    const { x0, x1, z0, z1 } = POOL;
    const RIM = 0.6;
    B.add('cap', box(x1 - x0 + 2 * RIM, 0.25, RIM, (x0 + x1) / 2, 0, z0 - RIM / 2));
    B.add('cap', box(x1 - x0 + 2 * RIM, 0.25, RIM, (x0 + x1) / 2, 0, z1 + RIM / 2));
    B.add('cap', box(RIM, 0.25, z1 - z0, x0 - RIM / 2, 0, (z0 + z1) / 2));
    B.add('cap', box(RIM, 0.25, z1 - z0, x1 + RIM / 2, 0, (z0 + z1) / 2));
    for (let x = x0 + 1; x <= x1 - 1; x += 2.6) B.add('clothWhite', box(0.8, 0.35, 1.9, x, 0, z1 + 2.4));
    for (const x of [-57.5, -51, -44.5]) {
      B.add('canvas', box(3.2, 2.6, 2.6, x, 0, 0.6));
      B.add('canvasStripe', hipRoof({ x0: x - 1.6, x1: x + 1.6, z0: -0.7, z1: 1.9 }, 2.6, 0.9, 0.2));
    }
  }

  // ── 球场（邻居）：青训西场（横屏右下角）+ 围网（clubdesk 的 fence-screen）──
  const fenceRuns: FenceRun[] = [];
  for (const c of COURTS) {
    const cell: Rect = { x0: c.x - c.hx, x1: c.x + c.hx, z0: c.z - c.hz, z1: c.z + c.hz };
    if (c.kind === 'stadium' || !clip(cell)) continue;
    paintCourt(B, c);
  }
  for (const f of COURT_FENCES) fenceLine(fenceRuns, f);

  B.build(ctx, root, 'site');
  root.add(buildFences(ctx as never, fenceRuns));
  ctx.mats.prepare(root);
  for (const m of root.children as THREE.Mesh[]) if (m.name.startsWith('top:')) m.castShadow = false;
  root.add(buildMountains((c, o) => ctx.mats.toon(c, o)));

  const house = buildHouse(ctx);
  root.add(house);
  return { root, house, groundAt };
}

/** 一片场（裁到 CLIP）：场边色 + 场内色 + 白线 + 网（同 clubfood/terrain.ts 的 paintCourt） */
function paintCourt(B: Bucket, c: Court) {
  const L = 23.77;
  const DW = 10.97;
  const SW = 8.23;
  const SVC = 6.4;
  const cell: Rect = { x0: c.x - c.hx, x1: c.x + c.hx, z0: c.z - c.hz, z1: c.z + c.hz };
  const q = (r: Rect, y: number, key: Key) => {
    const k = clip(r);
    if (k) B.add(key, quad(k, y), FLAT);
  };
  if (c.kind === 'clay') q(cell, 0.018, 'clay');
  else {
    q(cell, 0.018, 'surround');
    q(
      { x0: c.x - L / 2 - 1.4, x1: c.x + L / 2 + 1.4, z0: c.z - DW / 2 - 0.84, z1: c.z + DW / 2 + 0.84 },
      0.022,
      'court',
    );
  }
  const line = (x0: number, x1: number, z0: number, z1: number) => q({ x0, x1, z0, z1 }, 0.03, 'line');
  for (const s of [-1, 1]) {
    line(c.x + (s * L) / 2 - LW / 2, c.x + (s * L) / 2 + LW / 2, c.z - DW / 2, c.z + DW / 2);
    line(c.x - L / 2, c.x + L / 2, c.z + (s * DW) / 2 - LW / 2, c.z + (s * DW) / 2 + LW / 2);
    line(c.x - L / 2, c.x + L / 2, c.z + (s * SW) / 2 - LW / 2, c.z + (s * SW) / 2 + LW / 2);
    line(c.x + s * SVC - LW / 2, c.x + s * SVC + LW / 2, c.z - SW / 2, c.z + SW / 2);
  }
  line(c.x - SVC, c.x + SVC, c.z - LW / 2, c.z + LW / 2);
  if (c.x < CLIP.x0 || c.x > CLIP.x1 || c.z > CLIP.z1) return;
  const len = DW + 1.8;
  B.add('net', box(0.12, 0.92, len, c.x, 0, c.z), { extra: { noShadowReceive: true }, cast: true });
  B.add('netTape', box(0.14, 0.15, len, c.x, 0.92, c.z), FLAT);
}

/** 一道直的围网（地图的 FenceLine）：按门切开、裁到 CLIP，收成直线段交给 buildFences（clubdesk 的 fence-screen） */
function fenceLine(runs: FenceRun[], f: FenceLine) {
  const ax = Math.abs(f.z1 - f.z0) < 1e-6;
  if (ax ? f.z0 < CLIP.z0 || f.z0 > CLIP.z1 : f.x0 < CLIP.x0 || f.x0 > CLIP.x1) return;
  const [a0, a1] = ax ? [f.x0, f.x1] : [f.z0, f.z1];
  for (const [p, q] of fencePieces(a0, a1, f.doors)) {
    if (ax) {
      const k = clip({ x0: p, x1: q, z0: f.z0 - 0.1, z1: f.z0 + 0.1 });
      if (k) runs.push({ x0: k.x0, z0: f.z0, x1: k.x1, z1: f.z0, h: f.h });
    } else {
      const k = clip({ x0: f.x0 - 0.1, x1: f.x0 + 0.1, z0: p, z1: q });
      if (k) runs.push({ x0: f.x0, z0: k.z0, x1: f.x0, z1: k.z1, h: f.h });
    }
  }
}

// 地形：地面（clubsite/ground.ts，铺到画外）+ 墙里的压实沙地 + 北围墙、西围墙（土坯、压顶、壁柱）
// + 会所（照 clubmap2/build.ts 的体块：主楼、东翼、南翼、钟楼、拱廊、窗 —— 邻居 / 背景，以后归会所场景）
// + 餐车院子的地面（红砂碎石一整块；凉棚下陶砖；球员通道石板；孩子的草皮角）+ 长廊、西步道
// + 泳池（池畔石板、池子、池沿、躺椅、三间帐篷，照 clubmap2）+ 中心球场西半和看台体块、青训西场北半（邻居）+ 围网（clubdesk 的 fence-screen）。
// 一排车、凉棚、桌子都是资产（占位）；地面只管平的东西。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildFences, type FenceRun } from '../clubdesk/assets/fence-screen';
import { WALL } from '../clubdesk/layout';
import { groundGeo } from '../clubsite/ground';
import { buildMountains } from '../clubsite/mountains';
import { box, quad, topGeo } from '../clubsite/render/geo';
import type { ToonOpts } from '../clubsite/render/toon';
import { COURT_FENCES, COURTS, type Court, type FenceLine, fencePieces, GROUNDS } from '../clubsite/world';
import type { AssetCtx } from './ctx';
import {
  ARCADE_YARD,
  CLIP,
  FOOD_COURT,
  H,
  HOUSE,
  LAWN_GAMES,
  PATHS,
  PERGOLA,
  PLAYERS_GATE,
  POOL,
  POOL_DECK,
  type Rect,
  SPINE,
  type V2,
  WALKOUT,
} from './layout';
import { EL, type Pal } from './palette';

type Key = keyof Pal;

/** 按材质收几何体，最后每种材质合并成一个网格（同 clubplaza/terrain.ts 的 Bucket） */
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
      mesh.name = `food:${id}`;
      mesh.castShadow = e.cast;
      mesh.receiveShadow = true;
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

/** 四坡屋顶（照 clubmap2/build.ts 的 hipRoof，没导出）：底在 y，高 h，四边出檐 over；屋脊沿长边 */
function hipRoof(r: Rect, y: number, h: number, over = 0.6): THREE.BufferGeometry {
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

export interface Terrain {
  root: THREE.Group;
  groundAt(x: number, z: number): number;
}

export function buildTerrain(ctx: AssetCtx): Terrain {
  const root = new THREE.Group();
  root.name = 'terrain';
  const B = new Bucket();
  const groundAt = (_x: number, _z: number) => H.ground;
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

  // ── 地面：墙外的沙漠沙铺到画外（围墙里挖掉，另铺压实的浅沙）──
  const grounds: V2[] = [
    [GROUNDS.x0, GROUNDS.z0],
    [GROUNDS.x1, GROUNDS.z0],
    [GROUNDS.x1, GROUNDS.z1],
    [GROUNDS.x0, GROUNDS.z1],
  ];
  add(groundGeo([grounds], H.ground), ctx.mat('sand', { elem: EL.sand }), 'top:ground', { cast: false });
  add(topGeo(grounds, H.ground + 0.004), ctx.mat('sandHigh', { elem: { ...EL.sand, seed: 7 } }), 'top:grounds', {
    cast: false,
  });

  // ── 围墙：北墙（z −43，朝镜头的南面 = 画面上方的暗带）+ 西墙（x −64，横屏左沿）；壁柱同 clubmap2（每段 floor(长/12) 等分）──
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
    pier(a, zN); // 西北角
    const s1 = CLIP.z1 + 0.6;
    B.add('adobe', box(WALL.t, WALL.h, s1 - zN, a, 0, (zN + s1) / 2));
    B.add('cap', box(WALL.t + 0.2, WALL.cap, s1 - zN, a, WALL.h, (zN + s1) / 2));
    const m = Math.floor((zS - zN) / 12);
    for (let i = 1; i < m; i++) {
      const pz = zN + ((zS - zN) * i) / m;
      if (pz < s1 - 0.6) pier(a, pz);
    }
  }

  // ── 会所（邻居 / 背景：照 clubmap2/build.ts）：白灰泥墙 + 红瓦四坡顶；钟楼；东面拱廊（深色拱洞）；南面窗 ──
  {
    for (const r of [HOUSE.main, HOUSE.east, HOUSE.south]) {
      B.add('stucco', box(r.x1 - r.x0, r.h, r.z1 - r.z0, (r.x0 + r.x1) / 2, 0, (r.z0 + r.z1) / 2));
      B.add('roofTile', hipRoof(r, r.h, r.roof));
    }
    const t = HOUSE.tower;
    B.add('stucco', box(t.w, t.h, t.w, t.x, 0, t.z));
    B.add('ironwork', box(1.2, 1.6, t.w + 0.1, t.x, t.h - 2.9, t.z), { cast: false });
    B.add('ironwork', box(t.w + 0.1, 1.6, 1.2, t.x, t.h - 2.9, t.z), { cast: false });
    B.add(
      'roofTile',
      hipRoof({ x0: t.x - t.w / 2, x1: t.x + t.w / 2, z0: t.z - t.w / 2, z1: t.z + t.w / 2 }, t.h, t.roof, 0.4),
    );
    // 东面拱廊（主楼东墙 z −26…−16）+ 东翼南墙的厨房门、两扇窗（朝镜头）+ 主楼、南翼的南面窗
    for (let z = -25; z <= -17.5; z += 2.4)
      B.add('ironwork', box(0.2, 2.8, 1.5, HOUSE.main.x1 + 0.1, 0, z), { cast: false });
    B.add('ironwork', box(1.3, 2.3, 0.2, -43.0, 0, HOUSE.east.z1 + 0.1), { cast: false });
    for (const x of [-45.0, -41.2]) B.add('ironwork', box(1.0, 1.2, 0.2, x, 2.6, HOUSE.east.z1 + 0.1), { cast: false });
    for (let x = -60; x <= -48; x += 3) {
      B.add('ironwork', box(1.2, 1.6, 0.2, x, 4.8, HOUSE.main.z1 + 0.1), { cast: false });
      if (x < -51) B.add('ironwork', box(1.2, 1.6, 0.2, x, 1.2, HOUSE.south.z1 + 0.1), { cast: false });
    }
  }

  // ── 餐车院子（建议）：碎花岗岩一整块；凉棚下陶砖；球员通道石板；孩子的草皮角 ──
  const granite = ctx.mat('granite', { elem: EL.granite });
  // 院子自己的铺地：暖一点的红砂碎石（palette.ts 的 yardGranite），长廊、西步道照旧是 granite
  const yard = ctx.mat('yardGranite', { elem: { ...EL.granite, seed: 3 } });
  add(quad(FOOD_COURT, H.ground + 0.01), yard, 'top:court', { cast: false });
  add(quad(ARCADE_YARD, H.ground + 0.01), yard, 'top:yard', { cast: false });
  add(
    quad({ x0: PERGOLA.x0 - 0.5, x1: PERGOLA.x1 + 0.5, z0: PERGOLA.z0 - 0.4, z1: PERGOLA.z1 + 0.4 }, H.ground + 0.014),
    ctx.mat('tile', { elem: EL.tile }),
    'top:pergola-tile',
    { cast: false },
  );
  add(
    quad({ ...SPINE, x1: WALKOUT.x1 - 0.01 }, H.ground + 0.016),
    ctx.mat('flagstone', { elem: { ...EL.flagstone, seed: 5 } }),
    'top:spine',
    { cast: false },
  );
  add(quad(LAWN_GAMES, H.ground + 0.018), ctx.mat('lawn'), 'top:lawn', { cast: false });

  // ── 长廊、西步道（碎花岗岩）──
  let i = 0;
  for (const p of PATHS) {
    const r = clip(p);
    if (r) add(quad(r, H.ground + 0.012), granite, `path:${i++}`, { cast: false });
  }

  // ── 泳池（邻居：照 clubmap2）：池畔石板、水、池沿、躺椅、三间帐篷 ──
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

  // ── 球场（邻居）：中心球场西半、青训西场 / 会员场北头；围网 = clubdesk 的 fence-screen ──
  const fenceRuns: FenceRun[] = [];
  for (const c of COURTS) {
    const cell: Rect = { x0: c.x - c.hx, x1: c.x + c.hx, z0: c.z - c.hz, z1: c.z + c.hz };
    if (!clip(cell)) continue;
    paintCourt(B, c);
  }
  for (const f of COURT_FENCES) fenceLine(fenceRuns, f);

  // ── 中心球场的看台（邻居：照 clubmap2/build.ts 的体块，只画 x < CLIP.x1 的西半；看台本身归 clubstadium）──
  {
    const S = COURTS[0];
    const cx0 = S.x - S.hx;
    const cz0 = S.z - S.hz;
    const cz1 = S.z + S.hz;
    const x1 = CLIP.x1;
    const tier = (k: number, rise: number, deep: number) => ({ top: (k + 1) * rise, a: k * deep, b: (k + 1) * deep });
    const nx0 = cx0 - 2;
    for (let k = 0; k < 6; k++) {
      const t = tier(k, 0.9, 1.2);
      B.add('concrete', box(x1 - nx0, t.top, t.b - t.a, (nx0 + x1) / 2, 0, cz0 - (t.a + t.b) / 2));
      B.add('seat', box(x1 - nx0 - 0.4, 0.35, 0.5, (nx0 + x1) / 2 + 0.2, t.top, cz0 - t.a - 0.35), { cast: false });
    }
    B.add('stucco', box(x1 - nx0, 1.4, 0.4, (nx0 + x1) / 2, 6 * 0.9, cz0 - 7.4));
    for (let k = 0; k < 2; k++) {
      const t = tier(k, 0.6, 1.1);
      B.add('concrete', box(x1 - cx0, t.top, t.b - t.a, (cx0 + x1) / 2, 0, cz1 + (t.a + t.b) / 2));
      B.add('seat', box(x1 - cx0 - 0.3, 0.25, 0.45, (cx0 + x1) / 2, t.top, cz1 + t.a + 0.3), { cast: false });
    }
    // 球员拱门（clubstadium 的 #10 players-gate，这里只是个体块：两根柱 + 门楣，门洞东西向）
    const G = PLAYERS_GATE;
    for (const s of [-1, 1]) B.add('stucco', box(1.0, G.h, 0.9, G.x, 0, G.z + s * (G.span / 2 + 0.45)));
    B.add('stucco', box(1.0, 0.9, G.span + 1.8, G.x, G.h - 0.9, G.z));
    B.add('roofTile', box(1.3, 0.25, G.span + 2.2, G.x, G.h, G.z));
  }

  B.build(ctx, root);
  root.add(buildFences(ctx as never, fenceRuns));
  ctx.mats.prepare(root);
  for (const m of root.children as THREE.Mesh[]) if (m.name.startsWith('top:')) m.castShadow = false;
  root.add(buildMountains((c, o) => ctx.mats.toon(c, o)));
  return { root, groundAt };
}

/** 一片场（裁到 CLIP）：场边色 + 场内色 + 白线 + 网（同 clubplaza/terrain.ts 的 paintCourt） */
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
  if (!pickle) line(c.x - SVC, c.x + SVC, c.z - LW / 2, c.z + LW / 2);
  if (c.x < CLIP.x0 || c.x > CLIP.x1 || c.z > CLIP.z1) return;
  const nh = pickle ? 0.86 : 1.07;
  const len = DW + (pickle ? 0.6 : 1.8);
  B.add('net', box(0.12, nh - 0.15, len, c.x, 0, c.z), { extra: { noShadowReceive: true }, cast: true });
  B.add('netTape', box(0.14, 0.15, len, c.x, nh - 0.15, c.z), FLAT);
}

/** 一道直的围网（地图的 FenceLine）：按门切开、裁到 CLIP，收成直线段交给 buildFences（clubdesk 的 fence-screen） */
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

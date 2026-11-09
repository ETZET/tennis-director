// 地形：地面（clubsite/ground.ts，铺到画外）+ 墙里的压实沙地 + 西围墙（土坯、压顶、壁柱）
// + 会所（照 clubmap2/build.ts 的体块：主楼、东翼、南翼、钟楼、拱廊、窗 —— 邻居 / 背景，归会所场景 clubhouse）
// + **泳池**：抬高 0.45 米的池畔平台（石板，朝镜头的南沿是白灰泥）、池沿压顶、水线一圈花砖、池水（主角）
// + 建议的石板小路（会所 → 北门）和晒太阳的草坪 + 长廊、西步道 + 青训西场 / 会员场西头（邻居）+ 围网（clubdesk 的 fence-screen）。
// 围栏、门、台阶、躺椅这些都是资产（占位）；地面只管平的东西和池子本身。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildFences, type FenceRun } from '../clubdesk/assets/fence-screen';
import { WALL } from '../clubdesk/layout';
import { groundGeo } from '../clubsite/ground';
import { buildMountains } from '../clubsite/mountains';
import { box, quad, topGeo, wallGeo } from '../clubsite/render/geo';
import type { ToonOpts } from '../clubsite/render/toon';
import { COURT_FENCES, COURTS, type Court, type FenceLine, fencePieces, GROUNDS } from '../clubsite/world';
import type { AssetCtx } from './ctx';
import { CLIP, COPING, DECK, H, HOUSE, LAWN, NORTH_WALK, PATHS, POOL, type Rect, type V2 } from './layout';
import { EL, type Pal } from './palette';

type Key = keyof Pal;

/** 按材质收几何体，最后每种材质合并成一个网格（同 clubfood/terrain.ts 的 Bucket） */
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
      mesh.name = `pool:${id}`;
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
const inside = (r: Rect, x: number, z: number) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
const rectPts = (r: Rect): V2[] => [
  [r.x0, r.z0],
  [r.x1, r.z0],
  [r.x1, r.z1],
  [r.x0, r.z1],
];

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
  /** 地面高：池里 = 水面，平台上 = 平台顶，其余 0 */
  const groundAt = (x: number, z: number) => (inside(POOL, x, z) ? H.water : inside(DECK, x, z) ? H.deck : H.ground);
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

  // ── 地面：墙外的沙漠沙铺到画外（围墙里另铺压实的浅沙）──
  const grounds = rectPts(GROUNDS);
  add(groundGeo([grounds], H.ground), ctx.mat('sand', { elem: EL.sand }), 'top:ground', { cast: false });
  add(topGeo(grounds, H.ground + 0.004), ctx.mat('sandHigh', { elem: { ...EL.sand, seed: 7 } }), 'top:grounds', {
    cast: false,
  });

  // ── 西围墙（x −64，横屏左沿）：土坯 + 压顶 + 壁柱（同 clubmap2：每段 floor(长/12) 等分）──
  {
    const { x0: a, z0: zN, z1: zS } = GROUNDS;
    const pier = (x: number, z: number) => {
      B.add('adobe', box(WALL.pier, WALL.pierH, WALL.pier, x, 0, z));
      B.add('cap', box(WALL.pier + 0.2, WALL.pierCap, WALL.pier + 0.2, x, WALL.pierH, z));
    };
    const s0 = -20;
    const s1 = CLIP.z1 + 0.6;
    B.add('adobe', box(WALL.t, WALL.h, s1 - s0, a, 0, (s0 + s1) / 2));
    B.add('cap', box(WALL.t + 0.2, WALL.cap, s1 - s0, a, WALL.h, (s0 + s1) / 2));
    const m = Math.floor((zS - zN) / 12);
    for (let i = 1; i < m; i++) {
      const pz = zN + ((zS - zN) * i) / m;
      if (pz > s0 + 0.6 && pz < s1 - 0.6) pier(a, pz);
    }
  }

  // ── 会所（邻居 / 背景：照 clubmap2/build.ts）：白灰泥墙 + 红瓦四坡顶；钟楼；东面拱廊；南翼南墙的窗 + 一道门（建议）──
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
    for (let z = -25; z <= -17.5; z += 2.4)
      B.add('ironwork', box(0.2, 2.8, 1.5, HOUSE.main.x1 + 0.1, 0, z), { cast: false });
    for (let x = -60; x <= -48; x += 3) {
      B.add('ironwork', box(1.2, 1.6, 0.2, x, 4.8, HOUSE.main.z1 + 0.1), { cast: false });
      if (x < -51) B.add('ironwork', box(1.2, 1.6, 0.2, x, 1.2, HOUSE.south.z1 + 0.1), { cast: false });
    }
  }

  // ── 长廊、西步道（碎花岗岩）+ 建议的石板小路（会所 → 北门）──
  const granite = ctx.mat('granite', { elem: EL.granite });
  let i = 0;
  for (const p of PATHS) {
    const r = clip(p);
    if (r) add(quad(r, H.ground + 0.012), granite, `path:${i++}`, { cast: false });
  }
  add(quad(NORTH_WALK, H.ground + 0.014), ctx.mat('flagstone', { elem: { ...EL.flagstone, seed: 3 } }), 'top:walk', {
    cast: false,
  });
  // 晒太阳的草坪（建议）
  add(quad(LAWN, H.ground + 0.016), ctx.mat('lawn'), 'top:lawn', { cast: false });

  // ── 泳池（主角）：抬高的池畔平台 + 池沿压顶 + 水线花砖 + 水 ──
  {
    const deckPts = rectPts(DECK);
    const pool = rectPts(POOL);
    // 平台顶（石板，挖掉池子）、侧面（白灰泥，朝镜头的南沿 = 一条暗带；不接投影，免得麻点）
    add(topGeo(deckPts, H.deck, [pool]), ctx.mat('flagstone', { elem: { ...EL.flagstone, seed: 11 } }), 'top:deck', {
      cast: false,
    });
    B.add('stucco', wallGeo(deckPts, H.deck, H.ground, true), { extra: { noShadowReceive: true }, tag: 'plinth' });
    // 池沿压顶（浅奶油混凝土，比平台高 0.08，宽 COPING）：四条，北 / 南两条盖住四角
    const { x0, x1, z0, z1 } = POOL;
    const cy = H.deck;
    const ch = H.coping - H.deck;
    B.add('concrete', box(x1 - x0 + 2 * COPING, ch, COPING, (x0 + x1) / 2, cy, z0 - COPING / 2));
    B.add('concrete', box(x1 - x0 + 2 * COPING, ch, COPING, (x0 + x1) / 2, cy, z1 + COPING / 2));
    B.add('concrete', box(COPING, ch, z1 - z0, x0 - COPING / 2, cy, (z0 + z1) / 2));
    B.add('concrete', box(COPING, ch, z1 - z0, x1 + COPING / 2, cy, (z0 + z1) / 2));
    // 池壁：水面到压顶这一截（0.38 米）是水线一圈花砖（talavera）；北池壁朝镜头 = 水面上一条蓝花砖带
    const T = 0.06;
    const wh = H.coping - H.water;
    const wall = { extra: { noShadowReceive: true }, cast: false, tag: 'poolwall' };
    B.add('talavera', box(x1 - x0, wh, T, (x0 + x1) / 2, H.water, z0 + T / 2), wall);
    B.add('talavera', box(x1 - x0, wh, T, (x0 + x1) / 2, H.water, z1 - T / 2), wall);
    B.add('talavera', box(T, wh, z1 - z0, x0 + T / 2, H.water, (z0 + z1) / 2), wall);
    B.add('talavera', box(T, wh, z1 - z0, x1 - T / 2, H.water, (z0 + z1) / 2), wall);
    // 水面（受投影：救生员椅、帐篷的影子落进水里）
    add(quad(POOL, H.water), ctx.mat('poolWater', { noShadowReceive: false }), 'top:water', { cast: false });
  }

  // ── 球场（邻居）：青训西场、会员场的西头；围网 = clubdesk 的 fence-screen ──
  const fenceRuns: FenceRun[] = [];
  for (const c of COURTS) {
    const cell: Rect = { x0: c.x - c.hx, x1: c.x + c.hx, z0: c.z - c.hz, z1: c.z + c.hz };
    if (!clip(cell)) continue;
    paintCourt(B, c);
  }
  for (const f of COURT_FENCES) fenceLine(fenceRuns, f);

  B.build(ctx, root);
  root.add(buildFences(ctx as never, fenceRuns));
  ctx.mats.prepare(root);
  for (const m of root.children as THREE.Mesh[]) if (m.name.startsWith('top:')) m.castShadow = false;
  root.add(buildMountains((c, o) => ctx.mats.toon(c, o)));
  return { root, groundAt };
}

/** 一片场（裁到 CLIP）：场边色 + 场内色 + 白线 + 网（同 clubfood/terrain.ts 的 paintCourt） */
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

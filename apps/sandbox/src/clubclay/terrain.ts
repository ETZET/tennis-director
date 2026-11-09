// 地形：地面（clubsite/ground.ts，铺到画外）+ 墙里的压实沙地 + 南墙（土坯、压顶、壁柱）+ 碎花岗岩步道 + 下沉草坪（clubdesk 那块）
// + 球场：两片红土场（白模：底色 + 状态区块 + 胶带线，stage 2 换成 #1 clay-court 资产）、会员硬地场和青训场的一角（平涂）
// + 围网（clubdesk 的 fence-screen，只读）+ 墙外高尔夫（球道照 clubmap2/build.ts 的公式）。
// 几何工具从 clubfront/terrain.ts、clubmap/build.ts import（只读）；地图常量从 clubmap2/layout.ts import（只读）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildFences, type FenceRun } from '../clubdesk/assets/fence-screen';
import type { AssetCtx as DeskCtx } from '../clubdesk/world';
import { insidePoly, smoothLoop, topGeo, wallGeo } from '../clubfront/terrain';
import type { ToonOpts } from '../clubfront/toon';
import { box, quad } from '../clubmap/build';
import { type Court, GOLF, GROUNDS } from '../clubmap2/layout';
import { groundGeo } from '../clubsite/ground';
import { buildMountains } from '../clubsite/mountains';
import {
  CLIP,
  cellOf,
  DIM,
  FENCES,
  H,
  LAWN_PIT,
  LW,
  MEMBER,
  PRACTICE,
  PRACTICE_W,
  type Rect,
  SCENE_PATHS,
  SOUTH_WALL_Z,
  type V2,
  WALL,
} from './layout';
import { EL, type Pal } from './palette';
import type { AssetCtx } from './world';

type Key = keyof Pal;

/** 按材质收几何体，最后每种材质合并成一个网格（同 clubdesk/terrain.ts 的 Bucket，键是这个场景的 Pal） */
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
      mesh.name = `clay:${id}`;
      mesh.castShadow = e.cast;
      mesh.receiveShadow = true;
      root.add(mesh);
    }
  }
}

const FLAT = { cast: false };

/** 矩形和裁剪框求交；空 → null */
function clip(r: Rect, c: Rect = CLIP): Rect | null {
  const o = { x0: Math.max(r.x0, c.x0), x1: Math.min(r.x1, c.x1), z0: Math.max(r.z0, c.z0), z1: Math.min(r.z1, c.z1) };
  return o.x1 - o.x0 > 0.05 && o.z1 - o.z0 > 0.05 ? o : null;
}

/** 圆角矩形轮廓（同 clubdesk/terrain.ts 的 roundRect） */
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

export interface Terrain {
  root: THREE.Group;
  /** 某点的地面高度（草坪下沉，其余 0） */
  groundAt(x: number, z: number): number;
  /** #1 clay-court 的标签位置（main.ts 贴"#1 …"） */
  courtLabels: THREE.Vector3[];
}

export function buildTerrain(ctx: AssetCtx): Terrain {
  const root = new THREE.Group();
  root.name = 'terrain';
  const B = new Bucket();
  const LIP = ctx.texel * 1.2;
  const lawn = roundRect(LAWN_PIT, 1.0);
  const groundAt = (x: number, z: number) => (insidePoly([x, z], lawn) ? H.lawn : H.ground);

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

  // ── 地面：墙外沙漠的沙一整块铺到画外；围墙里面另铺压实的浅沙（挖掉草坪）──
  const grounds: V2[] = [
    [GROUNDS.x0, GROUNDS.z0],
    [GROUNDS.x1, GROUNDS.z0],
    [GROUNDS.x1, GROUNDS.z1],
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

  // ── 南墙（z 52）：土坯 + 压顶 + 壁柱（同 clubmap2 的算法：整段 floor(长/12) 等分）。朝镜头的南面 = 画面下方的暗带 ──
  {
    const z = SOUTH_WALL_Z;
    const a = GROUNDS.x0;
    const b = GROUNDS.x1;
    const s0 = Math.max(a, CLIP.x0);
    const s1 = Math.min(b, CLIP.x1);
    const cx = (s0 + s1) / 2;
    B.add('adobe', box(s1 - s0, WALL.h, WALL.t, cx, 0, z));
    B.add('cap', box(s1 - s0, WALL.cap, WALL.t + 0.2, cx, WALL.h, z));
    const n = Math.floor((b - a) / 12);
    for (let i = 1; i < n; i++) {
      const px = a + ((b - a) * i) / n;
      if (px < s0 + 0.6 || px > s1 - 0.6) continue;
      B.add('adobe', box(WALL.pier, WALL.pierH, WALL.pier, px, 0, z));
      B.add('cap', box(WALL.pier + 0.2, WALL.pierCap, WALL.pier + 0.2, px, WALL.pierH, z));
    }
  }

  // ── 步道（碎花岗岩，同 clubdesk）：地图的 + 东步道往南接到墙 ──
  const granite = ctx.mat('granite', { elem: EL.granite });
  for (const [i, p] of SCENE_PATHS.entries()) {
    const r = clip(p);
    if (r) add(quad(r, H.ground + 0.012), granite, `path:${i}`, { cast: false });
  }

  // ── 球员草坪（clubdesk：下沉 0.5，四周朝里的矮墙；这里只露西南角，横屏右边） ──
  add(topGeo(lawn, H.lawn), ctx.mat('lawn'), 'top:lawn', { cast: false });
  add(wallGeo(lawn, H.ground, H.ground - LIP, false), cap, 'lip:lawn', { recv: false });
  add(
    wallGeo(lawn, H.ground - LIP, H.lawn - 0.05, false, 0, () => H.ground - H.lawn),
    adobe,
    'wall:lawn',
    { recv: false },
  );

  // ── 球场 ──
  const courtLabels: THREE.Vector3[] = [];
  for (const c of [PRACTICE, PRACTICE_W, MEMBER]) paintHard(B, c);
  // 红土场面是资产 assets/clay-court（SLOTS 里的 clay-far / clay-near），这里不再画
  courtLabels.push(new THREE.Vector3(30.2, 0.2, 31.8), new THREE.Vector3(30.2, 0.2, 49.6));

  // ── 墙外：高尔夫球道（clubmap2/build.ts 同一个公式：弯弯的一条、几道斜的修剪条纹）──
  {
    const rnd = ctx.rng('clay:golf');
    const top: V2[] = [];
    const bot: V2[] = [];
    for (let x = GOLF.x0 - 4; x <= GOLF.x1 + 4; x += 8) {
      const zc = 63.5 + Math.sin(x * 0.045) * 4 + Math.sin(x * 0.11 + 1) * 1.4;
      const hw = 6.5 + Math.sin(x * 0.07 + 2) * 2;
      top.push([x, zc - hw]);
      bot.unshift([x, zc + hw]);
    }
    B.add('lawn', topGeo(smoothLoop([...top, ...bot], 1.2, rnd, 0.3), 0.012), FLAT);
    for (let x = GOLF.x0 + 2; x < GOLF.x1 - 6; x += 9) {
      const zc = 63.5 + Math.sin((x + 2) * 0.045) * 4;
      B.add('lawnStripe', quad({ x0: x, x1: x + 4.5, z0: zc - 3.2, z1: zc + 3.2 }, 0.016), FLAT);
    }
  }

  B.build(ctx, root);

  // ── 围网（clubdesk 的 fence-screen：同一个资产，只读）──
  const runs: FenceRun[] = [];
  for (const f of FENCES) {
    // 裁到 CLIP（门的位置按原来的起点算）
    const horiz = Math.abs(f.z1 - f.z0) < 1e-6;
    const a0 = horiz ? f.x0 : f.z0;
    const a1 = horiz ? f.x1 : f.z1;
    const lo = horiz ? CLIP.x0 : CLIP.z0;
    const hi = horiz ? CLIP.x1 : CLIP.z1;
    const c0 = Math.max(a0, lo);
    const c1 = Math.min(a1, hi);
    if (c1 - c0 < 0.3) continue;
    const run: FenceRun = horiz
      ? { x0: c0, z0: f.z0, x1: c1, z1: f.z1, h: f.h }
      : { x0: f.x0, z0: c0, x1: f.x1, z1: c1, h: f.h };
    if (f.door) {
      const at = f.door.at - (c0 - a0);
      if (at > 0 && at < c1 - c0) run.door = { at, gap: f.door.gap };
    }
    runs.push(run);
  }
  root.add(buildFences(ctx as unknown as DeskCtx, runs));

  // 水管：画在 #7 hose-reel 资产里（卷盘 + 拉出去的管子，layout.ts 的 HOSE 路线），这里不再铺占位

  ctx.mats.prepare(root);
  for (const m of root.children as THREE.Mesh[]) {
    // 立面不接收投影（朝镜头的立面永远是干净的暗档）；平的东西不投影
    if (m.name.startsWith('wall:') || m.name.startsWith('lip:')) m.receiveShadow = false;
    if (m.name === 'top:ground') m.castShadow = false;
  }
  // 地图边的山（这个场景默认看不到；不投影、不受投影，prepare 之后再加）
  root.add(buildMountains((c, o) => ctx.mats.toon(c, o)));
  return { root, groundAt, courtLabels };
}

/** 硬地场（会员场、青训场）：场边色 + 场内色 + 线 + 网（同 clubdesk 的 paintCourt，裁到 CLIP） */
function paintHard(B: Bucket, c: Court) {
  const cell = cellOf(c);
  const q = (r: Rect, y: number, key: Key) => {
    const k = clip(r);
    if (k) B.add(key, quad(k, y), FLAT);
  };
  q(cell, 0.018, 'surround');
  const m = 1.4;
  q(
    {
      x0: c.x - DIM.L / 2 - m,
      x1: c.x + DIM.L / 2 + m,
      z0: c.z - DIM.DW / 2 - m * 0.6,
      z1: c.z + DIM.DW / 2 + m * 0.6,
    },
    0.022,
    'court',
  );
  lines(c, (r) => q(r, 0.03, 'line'));
  if (c.x > CLIP.x0 && c.x < CLIP.x1 && c.z > CLIP.z0) {
    const len = DIM.DW + 1.8;
    B.add('net', box(0.12, DIM.netPost - 0.15, len, c.x, 0, c.z), { extra: { noShadowReceive: true }, cast: true });
    B.add('netTape', box(0.14, 0.15, len, c.x, DIM.netPost - 0.15, c.z), FLAT);
  }
}

/** 一片场的线（沿 x 打）：两条底线、两条双打边线、两条单打边线、两条发球线、中线；每条交给 put */
function lines(c: Court, put: (r: Rect, part: 'base' | 'side' | 'svc' | 'center') => void) {
  const { L, DW, SW, SVC } = DIM;
  for (const s of [-1, 1]) {
    put({ x0: c.x + (s * L) / 2 - LW / 2, x1: c.x + (s * L) / 2 + LW / 2, z0: c.z - DW / 2, z1: c.z + DW / 2 }, 'base');
    put({ x0: c.x - L / 2, x1: c.x + L / 2, z0: c.z + (s * DW) / 2 - LW / 2, z1: c.z + (s * DW) / 2 + LW / 2 }, 'side');
    put({ x0: c.x - L / 2, x1: c.x + L / 2, z0: c.z + (s * SW) / 2 - LW / 2, z1: c.z + (s * SW) / 2 + LW / 2 }, 'side');
    put({ x0: c.x + s * SVC - LW / 2, x1: c.x + s * SVC + LW / 2, z0: c.z - SW / 2, z1: c.z + SW / 2 }, 'svc');
  }
  put({ x0: c.x - SVC, x1: c.x + SVC, z0: c.z - LW / 2, z1: c.z + LW / 2 }, 'center');
}

/** 小随机数（地形里手摆形状的抖动；种子固定） */
function _mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

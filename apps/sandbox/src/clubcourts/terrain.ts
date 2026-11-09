// 地形：地面（clubsite/ground.ts，铺到画外）+ 墙里的压实浅沙 + 碎花岗岩步道（地图的 + 会员场南边的小路）
// + 球场：会员场、两片青训场（白模版的 #1 hard-court：外场绿 + 内场青蓝 + 线；会员场上的积沙、水洼是平涂的状态区块）、
//   右下露出来的两片红土场（平涂，clubclay 的场景）、上沿中心球场的南看台（照 clubmap2/build.ts 的公式，简化）
// + 围网（clubdesk 的 fence-screen，只读）。南墙（z 52）两个取景都看不到，不画。
// 几何工具从 clubfront/terrain.ts、clubmap/build.ts import（只读）；地图常量从 clubmap2/layout.ts import（只读）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildFences, type FenceRun } from '../clubdesk/assets/fence-screen';
import type { AssetCtx as DeskCtx } from '../clubdesk/world';
import { topGeo } from '../clubfront/terrain';
import type { Elem, ToonOpts } from '../clubfront/toon';
import { box, quad } from '../clubmap/build';
import { COURTS, type Court, GROUNDS } from '../clubmap2/layout';
import { groundGeo } from '../clubsite/ground';
import { buildMountains } from '../clubsite/mountains';
import {
  CLAY_FAR,
  CLIP,
  COURT_MARGIN,
  cellOf,
  DIM,
  FENCES,
  H,
  LW,
  MEMBER_STATE,
  type Rect,
  SCENE_PATHS,
  STADIUM,
  type V2,
} from './layout';
import { EL, type Pal } from './palette';
import type { AssetCtx } from './world';

type Key = keyof Pal;

/** 按材质收几何体，最后每种材质合并成一个网格（同 clubclay/terrain.ts 的 Bucket） */
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
      mesh.name = `courts:${id}`;
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

/** 平放的椭圆（水洼、小路上的沙） */
function ellipse(x: number, z: number, rx: number, rz: number, rot: number, y: number): THREE.BufferGeometry {
  return new THREE.CircleGeometry(1, 14)
    .rotateX(-Math.PI / 2)
    .scale(rx, 1, rz)
    .rotateY(rot)
    .translate(x, y, z);
}

export interface Terrain {
  root: THREE.Group;
  /** 某点的地面高度（这一片全平：0） */
  groundAt(x: number, z: number): number;
  /** #1 hard-court 的标签位置（main.ts 贴"#1 …"） */
  courtLabels: THREE.Vector3[];
}

export function buildTerrain(ctx: AssetCtx): Terrain {
  const root = new THREE.Group();
  root.name = 'terrain';
  const B = new Bucket();
  const groundAt = () => H.ground;

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

  // ── 地面：墙外沙漠的沙一整块铺到画外；围墙里面另铺压实的浅沙 ──
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

  // ── 步道（碎花岗岩，同 clubdesk / clubclay）：地图的 + 会员场南边的小路（建议）──
  const granite = ctx.mat('granite', { elem: EL.granite });
  for (const [i, p] of SCENE_PATHS.entries()) {
    const r = clip(p);
    if (r) add(quad(r, H.ground + 0.012), granite, `path:${i}`, { cast: false });
  }

  // ── 中心球场（上沿，clubstadium 的场景）：场面 + 南看台两级（照 clubmap2/build.ts，只画南边那一面）──
  {
    const S = STADIUM;
    paintHard(B, S);
    const cx0 = S.x - S.hx;
    const cx1 = S.x + S.hx;
    const cz1 = S.z + S.hz;
    for (let k = 0; k < 2; k++) {
      const top = (k + 1) * 0.6;
      const a = k * 1.1;
      const b = (k + 1) * 1.1;
      B.add('concrete', box(cx1 - cx0, top, b - a, S.x, 0, cz1 + (a + b) / 2));
      B.add('seat', box(cx1 - cx0 - 0.6, 0.25, 0.45, S.x, top, cz1 + a + 0.3), { cast: false });
    }
  }

  // ── 球场 ──
  // 三片硬地的场面是资产 assets/hard-court（SLOTS 里 hard-pw / hard-pe / hard-m，带积沙和水洼状态），这里不再画
  for (const c of [CLAY_FAR, COURTS.find((k) => k.id === 'outer_3') as Court]) paintClay(B, c);
  paintMemberState(B);
  const courtLabels = [new THREE.Vector3(-7.2, 0.2, 13.0), new THREE.Vector3(-7.2, 0.2, 31.6)];

  B.build(ctx, root);

  // ── 围网（clubdesk 的 fence-screen：同一个资产，只读）──
  const runs: FenceRun[] = [];
  for (const f of FENCES) {
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

  ctx.mats.prepare(root);
  for (const m of root.children as THREE.Mesh[]) if (m.name === 'top:ground') m.castShadow = false;
  // 地图边的山（这个场景默认看不到；不投影、不受投影，prepare 之后再加）
  root.add(buildMountains((c, o) => ctx.mats.toon(c, o)));
  return { root, groundAt, courtLabels };
}

/** 硬地场（白模版的 #1 hard-court）：外场绿 + 内场青蓝 + 线（同 clubmap2/build.ts 的尺寸，裁到 CLIP）。网是 #2 court-net（SLOTS） */
function paintHard(B: Bucket, c: Court) {
  const cell = cellOf(c);
  const elem = { extra: { elem: EL.hard as Elem }, cast: false };
  const q = (r: Rect, y: number, key: Key, opts = FLAT as { extra?: ToonOpts; cast?: boolean }) => {
    const k = clip(r);
    if (k) B.add(key, quad(k, y), opts);
  };
  q(cell, 0.018, 'surround', elem);
  q(courtRect(c), 0.022, 'court', elem);
  lines(c, (r) => q(r, 0.03, 'line'));
}

/** 内场青蓝的范围（线外多一圈） */
export function courtRect(c: Court): Rect {
  return {
    x0: c.x - DIM.L / 2 - COURT_MARGIN.x,
    x1: c.x + DIM.L / 2 + COURT_MARGIN.x,
    z0: c.z - DIM.DW / 2 - COURT_MARGIN.z,
    z1: c.z + DIM.DW / 2 + COURT_MARGIN.z,
  };
}

/** 红土场（横屏右下，clubclay 的两片；这里只平涂底色 + 白线，状态在 clubclay 那边） */
function paintClay(B: Bucket, c: Court) {
  const q = (r: Rect, y: number, key: Key, extra?: ToonOpts) => {
    const k = clip(r);
    if (k) B.add(key, quad(k, y), { cast: false, extra, tag: 'clay' });
  };
  q(cellOf(c), 0.018, 'clay', { elem: EL.clay });
  lines(c, (r) => q(r, 0.03, 'line'));
}

/** 一片场的线（沿 x 打）：两条底线、两条双打边线、两条单打边线、两条发球线、中线；每条交给 put */
function lines(c: Court, put: (r: Rect) => void) {
  const { L, DW, SW, SVC } = DIM;
  for (const s of [-1, 1]) {
    put({ x0: c.x + (s * L) / 2 - LW / 2, x1: c.x + (s * L) / 2 + LW / 2, z0: c.z - DW / 2, z1: c.z + DW / 2 });
    put({ x0: c.x - L / 2, x1: c.x + L / 2, z0: c.z + (s * DW) / 2 - LW / 2, z1: c.z + (s * DW) / 2 + LW / 2 });
    put({ x0: c.x - L / 2, x1: c.x + L / 2, z0: c.z + (s * SW) / 2 - LW / 2, z1: c.z + (s * SW) / 2 + LW / 2 });
    put({ x0: c.x + s * SVC - LW / 2, x1: c.x + s * SVC + LW / 2, z0: c.z - SW / 2, z1: c.z + SW / 2 });
  }
  put({ x0: c.x - SVC, x1: c.x + SVC, z0: c.z - LW / 2, z1: c.z + LW / 2 });
}

/**
 * 会员场的状态（白模版；stage 2 的 hard-court 资产照这里画成真的"积沙格 + 水洼"）：
 * 南边吹上来的积沙（盖在线上面，0.034）、吹薄了的一截（浅沙）、小路上的一层沙；喷雾滴下来的水洼（在线下面，0.026：线透过水还看得见）。
 */
function paintMemberState(B: Bucket) {
  // 积沙、吹薄、水洼都在 assets/hard-court 的状态网格里；这里只留南小路上的那层沙（不在场面上）
  for (const [x, z, rx, rz] of MEMBER_STATE.walkDust)
    B.add('sandDrift', ellipse(x, z, rx, rz, 0, 0.02), { cast: false, tag: 'walk' });
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

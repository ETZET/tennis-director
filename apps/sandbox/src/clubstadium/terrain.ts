// 地形：地面（clubsite/ground.ts，铺到画外）+ 墙里的压实沙地 + 北围墙（z −43，壁柱）
// + 中心球场（场边绿、内场蓝、白线；网是资产）+ 看台（北 6 级、东 3 级、南 2 级：色块白模，资产阶段换成 stadium-stands）
// + 长廊、青训场北半（围网 = clubdesk 的 fence-screen）+ 西头球员走的小路、工具角 + 会所露台（邻居，照 clubmap2/build.ts）
// + 东看台背后上看台的台阶、clubplaza 建议的去广场的小路（STADIUM_LINK）。
// 看台的明暗横带怎么来的：立面（朝镜头）不接收投影 → 干净的暗档；踏面接收投影 → 每级后 3/4 落在上一级的影子里，前沿一条亮边。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildFences, type FenceRun } from '../clubdesk/assets/fence-screen';
import { WALL } from '../clubdesk/layout';
import type { ToonOpts } from '../clubdesk/toon';
import { topGeo } from '../clubfront/terrain';
import { box, quad } from '../clubmap/build';
import { COURTS, type Court, GROUNDS } from '../clubmap2/layout';
import { groundGeo } from '../clubsite/ground';
import { buildMountains } from '../clubsite/mountains';
import {
  CELL,
  CLIP,
  DIM,
  EAST_STAIRS,
  H,
  NORTH_BACK,
  northTread,
  PATHS,
  type Rect,
  S,
  STADIUM_LINK,
  STANDS,
  TERRACE,
  TOOL_CORNER,
  tier,
  type V2,
  WALKOUT,
} from './layout';
import { EL, type Pal } from './palette';
import type { AssetCtx } from './world';

type Key = keyof Pal;

/** 按材质收几何体，最后每种材质合并成一个网格（同 clubplaza/terrain.ts 的 Bucket）；recv = 接不接收投影 */
class Bucket {
  private m = new Map<
    string,
    { key: Key; extra?: ToonOpts; geos: THREE.BufferGeometry[]; cast: boolean; recv: boolean }
  >();
  add(
    key: Key,
    g: THREE.BufferGeometry,
    opts: { extra?: ToonOpts; cast?: boolean; recv?: boolean; tag?: string } = {},
  ) {
    const id = `${key}|${opts.tag ?? ''}`;
    let e = this.m.get(id);
    if (!e) {
      e = { key, extra: opts.extra, geos: [], cast: opts.cast ?? true, recv: opts.recv ?? true };
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
      mesh.name = `stadium:${id}`;
      mesh.castShadow = e.cast;
      mesh.receiveShadow = e.recv;
      root.add(mesh);
    }
  }
}

const FLAT = { cast: false };
/** 白线宽：2 设计纹素（0.18 米），同 clubdesk / clubplaza */
const LW = 0.18;

/** 矩形和裁剪框求交；空 → null */
function clip(r: Rect, c: Rect = CLIP): Rect | null {
  const o = { x0: Math.max(r.x0, c.x0), x1: Math.min(r.x1, c.x1), z0: Math.max(r.z0, c.z0), z1: Math.min(r.z1, c.z1) };
  return o.x1 - o.x0 > 0.05 && o.z1 - o.z0 > 0.05 ? o : null;
}

/** 朝南（+z）的竖直面：x0…x1，z，y0…y1（看台立面、广告板正面） */
function faceS(x0: number, x1: number, z: number, y0: number, y1: number): THREE.BufferGeometry {
  return new THREE.PlaneGeometry(x1 - x0, y1 - y0).translate((x0 + x1) / 2, (y0 + y1) / 2, z);
}

export interface Terrain {
  root: THREE.Group;
  /** 某点的地面高度（看台的踏面 / 地面） */
  groundAt(x: number, z: number): number;
}

export function buildTerrain(ctx: AssetCtx, opts: { stands: boolean }): Terrain {
  const root = new THREE.Group();
  root.name = 'terrain';
  const B = new Bucket();
  const N = STANDS.north;
  const groundAt = (x: number, z: number) => {
    if (x > N.x0 && x < N.x1 && z < N.front && z > NORTH_BACK.z1) {
      const k = Math.min(N.n - 1, Math.floor((N.front - z) / N.deep));
      return northTread(k).y;
    }
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

  // ── 北围墙（z −43）：土坯 + 压顶 + 壁柱（同 clubmap2 的算法：整段 x −64…60 按 floor(长/12) 等分）。几乎全被北看台挡住 ──
  {
    const a = GROUNDS.x0;
    const b = GROUNDS.x1;
    const s0 = CLIP.x0 - 2;
    const s1 = CLIP.x1 + 2;
    const z = GROUNDS.z0;
    B.add('adobe', box(s1 - s0, WALL.h, WALL.t, (s0 + s1) / 2, 0, z), { extra: { elem: EL.adobe } });
    B.add('cap', box(s1 - s0 + 0.2, WALL.cap, WALL.t + 0.2, (s0 + s1) / 2, WALL.h, z));
    const n = Math.floor((b - a) / 12);
    for (let i = 1; i < n; i++) {
      const px = a + ((b - a) * i) / n;
      if (px < s0 + 0.6 || px > s1 - 0.6) continue;
      B.add('adobe', box(WALL.pier, WALL.pierH, WALL.pier, px, 0, z), { extra: { elem: EL.adobe } });
      B.add('cap', box(WALL.pier + 0.2, WALL.pierCap, WALL.pier + 0.2, px, WALL.pierH, z));
    }
  }

  // ── 步道：长廊、两排球场之间、西边南北步道（裁到 CLIP）+ 西头球员走的小路、工具角 + 东边去广场的小路 ──
  const granite = ctx.mat('granite', { elem: EL.granite });
  let pi = 0;
  for (const p of PATHS) {
    const r = clip(p);
    if (r) add(quad(r, H.ground + 0.012), granite, `top:path:${pi++}`, { cast: false });
  }
  add(quad(WALKOUT, H.ground + 0.013), granite, 'top:path:walkout', { cast: false });
  add(quad(TOOL_CORNER, H.ground + 0.011), ctx.mat('tile', { elem: { ...EL.tile, seed: 5 } }), 'top:tools', {
    cast: false,
  });
  {
    const r = clip(STADIUM_LINK.path);
    if (r) add(quad(r, H.ground + 0.012), granite, 'top:path:link', { cast: false });
  }

  // ── 会所露台（邻居，横屏左边）：陶砖 + 木凉棚 + 桌子（照 clubmap2/build.ts）──
  {
    B.add('tile', quad(TERRACE, 0.014), { ...FLAT, extra: { elem: EL.tile } });
    const { x0, x1, z0, z1 } = TERRACE;
    for (let z = z0 + 1; z <= z1 - 0.5; z += 4.8)
      for (const x of [x0 + 0.6, x1 - 0.6]) B.add('timber', box(0.35, 3.2, 0.35, x, 0, z));
    for (let z = z0 + 1; z <= z1 - 0.5; z += 2.4) B.add('timber', box(x1 - x0, 0.25, 0.3, (x0 + x1) / 2, 3.2, z));
    for (const z of [z0 + 4, z0 + 10, z0 + 16, z0 + 22])
      B.add('counterTop', box(1.4, 0.8, 1.4, (x0 + x1) / 2, 0, z), FLAT);
  }

  // ── 场地：中心球场 + 青训场北半（围网 = clubdesk 的 fence-screen）──
  const fenceRuns: FenceRun[] = [];
  for (const c of COURTS) {
    const cell: Rect = { x0: c.x - c.hx, x1: c.x + c.hx, z0: c.z - c.hz, z1: c.z + c.hz };
    if (!clip(cell)) continue;
    paintCourt(B, c);
    if (c.kind === 'hard' || c.kind === 'clay') fenceN(fenceRuns, cell, 2.6, c.x - c.hx + 3, 2.4);
  }

  // 看台和东看台背后的台阶：资产 assets/stadium-stands 存在时由它画，这里只画白模
  if (opts.stands) buildStands(B);

  // ── 东看台背后上看台的台阶（接 clubplaza 的 STADIUM_LINK 小路）：6 级，从 x 24 往西上到东看台顶 ──
  if (opts.stands) {
    const st = EAST_STAIRS;
    const topY = tier(STANDS.east.n - 1, STANDS.east.rise, STANDS.east.deep).top;
    const run = (st.x1 - st.x0) / st.steps;
    for (let k = 0; k < st.steps; k++) {
      const y = (topY / st.steps) * (k + 1);
      const xa = st.x1 - run * k;
      B.add('aisle', box(xa - st.x0, y, st.z1 - st.z0, (xa + st.x0) / 2, 0, (st.z0 + st.z1) / 2), {
        recv: false,
        extra: { edge: 0.2, convex: 0.3 },
      });
    }
  }

  B.build(ctx, root);
  root.add(buildFences(ctx as never, fenceRuns));
  ctx.mats.prepare(root);
  // 地图边的山（这个场景默认看不到；不投影、不受投影，prepare 之后再加）
  root.add(buildMountains((c, o) => ctx.mats.toon(c, o)));
  return { root, groundAt };
}

/**
 * 看台（色块白模）。每级 = 一个实心块（投影、立面不接收投影）+ 顶上一片踏面（接收投影 → 影子袋）+ 踏面后半一条座椅。
 * 北看台四条走道：每级拆成两步（0.45 高），走道里不放座椅；前面一道俱乐部蓝的广告板；后墙白灰泥。
 */
function buildStands(B: Bucket) {
  const N = STANDS.north;
  const aisleHalf = STANDS.aisleW / 2;
  const body = { recv: false, extra: { edge: 0.35, convex: 0.35 } };
  const tread = { cast: false, extra: { edge: 0.15, convex: 0.4 } };
  const seat = { cast: false, extra: { edge: 0.35, convex: 0.3 } };
  /** x0…x1 去掉走道以后的几段 */
  const runs = (x0: number, x1: number): [number, number][] => {
    const out: [number, number][] = [];
    let a = x0;
    for (const c of STANDS.aisles) {
      if (c - aisleHalf > a) out.push([a, c - aisleHalf]);
      a = c + aisleHalf;
    }
    if (x1 > a) out.push([a, x1]);
    return out;
  };

  // 北看台
  for (let k = 0; k < N.n; k++) {
    const t = tier(k, N.rise, N.deep);
    const tr = northTread(k);
    const cz = (tr.za + tr.zb) / 2;
    B.add('concrete', box(N.x1 - N.x0, t.top, N.deep, (N.x0 + N.x1) / 2, 0, cz), body);
    for (const [a, b] of runs(N.x0, N.x1)) {
      B.add('concrete', quad({ x0: a, x1: b, z0: tr.zb, z1: tr.za }, t.top + 0.006), tread);
      const sz = tr.zb + STANDS.seatD / 2 + 0.02;
      B.add('seat', box(b - a - 0.1, STANDS.seatH, STANDS.seatD, (a + b) / 2, t.top, sz), seat);
    }
    // 走道：前半在本级高度，后半高 0.45（半级）
    for (const c of STANDS.aisles) {
      B.add('aisle', quad({ x0: c - aisleHalf, x1: c + aisleHalf, z0: tr.za - N.deep / 2, z1: tr.za }, t.top + 0.007), {
        cast: false,
        extra: { edge: 0.2, convex: 0.3 },
      });
      if (k < N.n - 1)
        B.add('aisle', box(STANDS.aisleW, N.rise / 2, N.deep / 2, c, t.top, tr.zb + N.deep / 4), {
          recv: false,
          extra: { edge: 0.2, convex: 0.3 },
        });
      else
        B.add(
          'aisle',
          quad({ x0: c - aisleHalf, x1: c + aisleHalf, z0: tr.zb, z1: tr.za - N.deep / 2 }, t.top + 0.007),
          {
            cast: false,
          },
        );
    }
  }
  // 后墙（白灰泥）+ 两头的端墙（看台侧面）
  B.add(
    'stucco',
    box(N.x1 - N.x0, N.wallH, N.wallT, (N.x0 + N.x1) / 2, N.n * N.rise, (NORTH_BACK.z0 + NORTH_BACK.z1) / 2),
    body,
  );
  B.add(
    'cap',
    box(N.x1 - N.x0 + 0.2, 0.16, N.wallT + 0.2, (N.x0 + N.x1) / 2, NORTH_BACK.top, (NORTH_BACK.z0 + NORTH_BACK.z1) / 2),
    {
      recv: false,
    },
  );
  // 西头的看台端梯（观众从西头上到最高一级的横走道）：贴着看台西端，12 步
  {
    const steps = 12;
    const topY = N.n * N.rise;
    const z0 = N.front + 0.4;
    const z1 = NORTH_BACK.z1;
    const run = (z0 - z1) / steps;
    for (let i = 0; i < steps; i++) {
      const y = (topY / steps) * (i + 1);
      const za = z0 - run * i;
      B.add('aisle', box(1.2, y, za - z1, N.x0 - 0.6, 0, (za + z1) / 2), {
        recv: false,
        extra: { edge: 0.2, convex: 0.3 },
      });
    }
  }
  // 广告板：第一级立面前面一道（俱乐部蓝 = 前台柜台的 `counter`，比 signBoard 亮一档、彩度高；朝镜头 → lightUp 让它落中档、留住蓝）
  {
    const b = STANDS.board;
    B.add('counter', box(N.x1 - N.x0 - 2.4, b.h, b.t, (N.x0 + N.x1) / 2, 0, N.front + b.t / 2 + 0.01), {
      recv: false,
      cast: false,
      extra: { lightUp: 0.6, bands: [-0.4, 0.4], edge: 0.5 },
    });
    // 板上的字（白模：几段奶油色的横条，资产阶段换成俱乐部名 + 网球徽标）
    for (const x of [-12.5, -4.2, 4.2, 12.5])
      B.add('signPaint', faceS(x - 2.2, x + 2.2, N.front + b.t + 0.02, 0.32, 0.56), {
        recv: false,
        cast: false,
        extra: { lightUp: 0.6, bands: [-0.4, 0.4], edge: 0.1 },
      });
  }

  // 东看台（3 级，朝西）
  {
    const e = STANDS.east;
    for (let k = 0; k < e.n; k++) {
      const t = tier(k, e.rise, e.deep);
      const cx = e.front + (t.a + t.b) / 2;
      B.add('concrete', box(e.deep, t.top, e.z1 - e.z0, cx, 0, (e.z0 + e.z1) / 2), body);
      B.add('concrete', quad({ x0: e.front + t.a, x1: e.front + t.b, z0: e.z0, z1: e.z1 }, t.top + 0.006), tread);
      B.add(
        'seat',
        box(
          STANDS.seatD,
          STANDS.seatH * 0.9,
          e.z1 - e.z0 - 1.2,
          e.front + t.b - STANDS.seatD / 2 - 0.02,
          t.top,
          (e.z0 + e.z1) / 2,
        ),
        seat,
      );
    }
  }
  // 南看台（2 级，朝北 = 背对镜头；背墙朝镜头 = 下面一条暗带）
  {
    const s = STANDS.south;
    for (let k = 0; k < s.n; k++) {
      const t = tier(k, s.rise, s.deep);
      const cz = s.front + (t.a + t.b) / 2;
      B.add('concrete', box(s.x1 - s.x0, t.top, s.deep, (s.x0 + s.x1) / 2, 0, cz), body);
      B.add('concrete', quad({ x0: s.x0, x1: s.x1, z0: s.front + t.a, z1: s.front + t.b }, t.top + 0.006), tread);
      B.add(
        'seat',
        box(
          s.x1 - s.x0 - 1.2,
          STANDS.seatH * 0.8,
          STANDS.seatD,
          (s.x0 + s.x1) / 2,
          t.top,
          s.front + t.b - STANDS.seatD / 2 - 0.02,
        ),
        seat,
      );
    }
  }
}

/** 一片场（裁到 CLIP）：场边色 + 场内色 + 白线（网是资产 court-net；青训场的网在这里画） */
function paintCourt(B: Bucket, c: Court) {
  const { L, DW, SW, SVC } = DIM;
  const cell: Rect = { x0: c.x - c.hx, x1: c.x + c.hx, z0: c.z - c.hz, z1: c.z + c.hz };
  const q = (r: Rect, y: number, key: Key) => {
    const k = clip(r);
    if (k) B.add(key, quad(k, y), FLAT);
  };
  if (c.kind === 'clay') q(cell, 0.018, 'clay');
  else {
    q(cell, 0.018, 'surround');
    const m = 1.4;
    q(
      { x0: c.x - L / 2 - m, x1: c.x + L / 2 + m, z0: c.z - DW / 2 - m * 0.6, z1: c.z + DW / 2 + m * 0.6 },
      0.022,
      c.kind === 'stadium' ? 'courtShow' : 'court', // 中心球场用自己的内场色（表演场）
    );
  }
  const line = (x0: number, x1: number, z0: number, z1: number) => q({ x0, x1, z0, z1 }, 0.03, 'line');
  for (const s of [-1, 1]) {
    line(c.x + (s * L) / 2 - LW / 2, c.x + (s * L) / 2 + LW / 2, c.z - DW / 2, c.z + DW / 2);
    line(c.x - L / 2, c.x + L / 2, c.z + (s * DW) / 2 - LW / 2, c.z + (s * DW) / 2 + LW / 2);
    line(c.x - L / 2, c.x + L / 2, c.z + (s * SW) / 2 - LW / 2, c.z + (s * SW) / 2 + LW / 2);
    line(c.x + s * SVC - LW / 2, c.x + s * SVC + LW / 2, c.z - SW / 2, c.z + SW / 2);
    // 底线中点的小短线
    line(c.x + (s * L) / 2 - s * 0.3 - LW / 2, c.x + (s * L) / 2 - s * 0.3 + LW / 2, c.z - LW / 2, c.z + LW / 2);
  }
  line(c.x - SVC, c.x + SVC, c.z - LW / 2, c.z + LW / 2);
  if (c.id === S.id || c.z > CLIP.z1) return;
  // 青训场的网（中心球场的网是资产 court-net）：只画 CLIP 里的一段
  const z0 = Math.max(c.z - DW / 2 - 0.9, CLIP.z0);
  const z1 = Math.min(c.z + DW / 2 + 0.9, CLIP.z1);
  if (z1 <= z0) return;
  B.add('net', box(0.12, DIM.netH - 0.15, z1 - z0, c.x, 0, (z0 + z1) / 2), { extra: { noShadowReceive: true } });
  B.add('netTape', box(0.14, 0.15, z1 - z0, c.x, DIM.netH - 0.15, (z0 + z1) / 2), FLAT);
}

/** 北边一道围网（裁到 CLIP），在 at 处留一道门 */
function fenceN(runs: FenceRun[], r: Rect, h: number, at: number, gap: number) {
  for (const [p, q] of [
    [r.x0, at - gap / 2],
    [at + gap / 2, r.x1],
  ]) {
    const k = clip({ x0: p, x1: q, z0: r.z0 - 0.1, z1: r.z0 + 0.1 });
    if (k) runs.push({ x0: k.x0, z0: r.z0, x1: k.x1, z1: r.z0, h });
  }
}

/** 中心球场的场地外框（给 nav 用） */
export const COURT_CELL = CELL;

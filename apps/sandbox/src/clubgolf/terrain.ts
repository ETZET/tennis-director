// 地形：地面（clubsite/ground.ts，铺到画外）+ 墙里的压实沙地 + 西步道南头 + 南墙（土坯、压顶、壁柱，西步道南头开门）
// + 墙外：整条地块的沙漠砂石地（碎花岗岩）、沿墙的球车道、第 7 洞（果岭岛：长草一圈 + 球道草 + 果岭边 + 果岭、两个下挖的沙坑、
// 下挖的水塘 + 一圈石头塘沿；发球岛 + 垫高的发球台）、两头低成本的球道条带（修剪条纹、远处的果岭、平的沙坑）+ 地图边的山。
// 几何工具从 clubsite/render/geo.ts import；世界坐标从 clubsite/world.ts import（只读）。
// 白模：地面直接用计划的材质（草、砂石、白沙、水），占位只在 SLOTS 里（灰盒）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { WALL } from '../clubdesk/layout';
import { groundGeo } from '../clubsite/ground';
import { buildMountains } from '../clubsite/mountains';
import { box, insidePoly, quad, smoothLoop, topGeo, wallGeo } from '../clubsite/render/geo';
import type { ToonOpts } from '../clubsite/render/toon';
import type { AssetCtx } from './ctx';
import {
  BAND_Z,
  BANDS,
  BUNKERS,
  bandHw,
  bandZc,
  CART_PATH,
  FAR_BUNKERS,
  FAR_GREENS,
  GATE_APRON,
  GOLF,
  GOLF_GATE,
  GOLF_POND,
  GRAVEL_N,
  GREEN,
  GROUNDS,
  H,
  ISLAND_GREEN,
  ISLAND_TEE,
  POND_RIM,
  ROUGH_W,
  SOUTH_WALL_Z,
  TEE,
  type V2,
  WALL_PIERS,
  WEST_PATH,
} from './layout';
import { EL, type Pal } from './palette';

type Key = keyof Pal;

/** 按材质收几何体，最后每种材质合并成一个网格（同 clubclay/terrain.ts 的 Bucket，键是这个场景的 Pal） */
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
      mesh.name = `golf:${id}`;
      mesh.castShadow = e.cast;
      mesh.receiveShadow = true;
      root.add(mesh);
    }
  }
}

const FLAT = { cast: false };
/** 朝镜头的立面（墙、坑壁、岸壁）：不接收投影（干净的暗带） */
const FACE: ToonOpts = { noShadowReceive: true };

/** 椭圆轮廓（n 个点，逆时针） */
export function ellipse(x: number, z: number, rx: number, rz: number, n = 40): V2[] {
  const pts: V2[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push([x + Math.cos(a) * rx, z + Math.sin(a) * rz]);
  }
  return pts;
}

/** 闭合轮廓往外（d > 0）/ 往里（d < 0）偏 d 米：每个点沿相邻两段的外法线平均挪（平滑、近乎凸的轮廓够用） */
export function offsetLoop(pts: V2[], d: number): V2[] {
  const n = pts.length;
  const nrm = (i: number): V2 => {
    const [x0, z0] = pts[i];
    const [x1, z1] = pts[(i + 1) % n];
    const l = Math.hypot(x1 - x0, z1 - z0) || 1;
    return [(z1 - z0) / l, -(x1 - x0) / l];
  };
  // 法线朝外还是朝里：拿第一段的中点试一下
  const [ax, az] = pts[0];
  const [bx, bz] = pts[1];
  const n0 = nrm(0);
  const sgn = insidePoly([(ax + bx) / 2 + n0[0] * 0.05, (az + bz) / 2 + n0[1] * 0.05], pts) ? -1 : 1;
  return pts.map((p, i) => {
    const a = nrm((i - 1 + n) % n);
    const b = nrm(i);
    const nx = a[0] + b[0];
    const nz = a[1] + b[1];
    const l = Math.hypot(nx, nz) || 1;
    return [p[0] + (sgn * d * nx) / l, p[1] + (sgn * d * nz) / l] as V2;
  });
}

/** 多边形裁到竖条 a ≤ x ≤ b（Sutherland–Hodgman，两刀） */
function clipX(pts: V2[], a: number, b: number): V2[] {
  const cut = (poly: V2[], keep: (p: V2) => boolean, xc: number): V2[] => {
    const out: V2[] = [];
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      const kp = keep(p);
      const kq = keep(q);
      if (kp) out.push(p);
      if (kp !== kq) {
        const t = (xc - p[0]) / (q[0] - p[0]);
        out.push([xc, p[1] + (q[1] - p[1]) * t]);
      }
    }
    return out;
  };
  return cut(
    cut(pts, (p) => p[0] >= a, a),
    (p) => p[0] <= b,
    b,
  );
}

/** 一段低成本球道条带的轮廓（clubmap2 的公式，z 夹在 BAND_Z 里，两头 6 米收窄成圆头） */
function bandLoop(x0: number, x1: number): V2[] {
  const top: V2[] = [];
  const bot: V2[] = [];
  for (let x = x0; x <= x1 + 0.01; x += 2) {
    const e = Math.min(1, (x - x0) / 6, (x1 - x) / 6);
    const k = Math.sqrt(Math.max(0.05, e));
    const zc = Math.min(Math.max(bandZc(x), BAND_Z[0] + 3), BAND_Z[1] - 3);
    const hw = bandHw(x) * k;
    top.push([x, Math.max(BAND_Z[0], zc - hw)]);
    bot.unshift([x, Math.min(BAND_Z[1], zc + hw)]);
  }
  return [...top, ...bot];
}

export interface Terrain {
  root: THREE.Group;
  /** 某点的地面高度（发球台垫高、水塘和沙坑下挖，其余 0） */
  groundAt(x: number, z: number): number;
}

export function buildTerrain(ctx: AssetCtx): Terrain {
  const root = new THREE.Group();
  root.name = 'terrain';
  const B = new Bucket();
  const rnd = ctx.rng('golf:terrain');

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

  // ── 轮廓 ──
  const pond = ellipse(GOLF_POND.x, GOLF_POND.z, GOLF_POND.rx, GOLF_POND.rz, 56);
  const pondRim = ellipse(GOLF_POND.x, GOLF_POND.z, GOLF_POND.rx + POND_RIM, GOLF_POND.rz + POND_RIM, 56);
  const bunkers = BUNKERS.map((b) => ellipse(b.x, b.z, b.rx, b.rz, 28));
  const islandG = smoothLoop(ISLAND_GREEN, 0.8, rnd, 0);
  const islandT = smoothLoop(ISLAND_TEE, 0.8, rnd, 0);
  const holes = [pondRim, ...bunkers];
  const teeRect: V2[] = [
    [TEE.x - TEE.w / 2, TEE.z - TEE.d / 2],
    [TEE.x + TEE.w / 2, TEE.z - TEE.d / 2],
    [TEE.x + TEE.w / 2, TEE.z + TEE.d / 2],
    [TEE.x - TEE.w / 2, TEE.z + TEE.d / 2],
  ];
  const groundAt = (x: number, z: number) => {
    if (insidePoly([x, z], teeRect)) return H.tee;
    if (insidePoly([x, z], pond)) return H.water;
    if (bunkers.some((b) => insidePoly([x, z], b))) return H.bunker;
    return H.ground;
  };

  // ── 地面：沙漠的沙一整块铺到画外（挖掉围墙里、水塘、沙坑）；围墙里另铺压实的浅沙 ──
  const grounds: V2[] = [
    [GROUNDS.x0, GROUNDS.z0],
    [GROUNDS.x1, GROUNDS.z0],
    [GROUNDS.x1, GROUNDS.z1],
    [GROUNDS.x0, GROUNDS.z1],
  ];
  add(groundGeo([grounds, ...holes], H.ground), ctx.mat('sand', { elem: EL.sand }), 'top:ground', { cast: false });
  add(topGeo(grounds, H.ground + 0.004), ctx.mat('sandHigh', { elem: { ...EL.sand, seed: 7 } }), 'top:grounds', {
    cast: false,
  });
  // 西步道南头（墙里，碎花岗岩）
  add(
    quad({ ...WEST_PATH, z0: Math.max(WEST_PATH.z0, 30), z1: SOUTH_WALL_Z - WALL.t / 2 }, H.ground + 0.012),
    ctx.mat('granite', { elem: EL.granite }),
    'path:west',
    { cast: false },
  );

  // ── 南墙（z 52）：土坯 + 压顶 + 壁柱（同 clubmap2 的算法：整段 10 等分）；西步道南头开门（门洞 GOLF_GATE.x0…x1）──
  {
    const z = SOUTH_WALL_Z;
    for (const [a, b] of [
      [GROUNDS.x0, GOLF_GATE.x0],
      [GOLF_GATE.x1, GROUNDS.x1],
    ] as const) {
      B.add('adobe', box(b - a, WALL.h, WALL.t, (a + b) / 2, 0, z), { extra: FACE });
      B.add('cap', box(b - a, WALL.cap, WALL.t + 0.2, (a + b) / 2, WALL.h, z));
    }
    for (const px of WALL_PIERS) {
      if (px > GOLF_GATE.x0 && px < GOLF_GATE.x1) continue;
      B.add('adobe', box(WALL.pier, WALL.pierH, WALL.pier, px, 0, z), { extra: FACE });
      B.add('cap', box(WALL.pier + 0.2, WALL.pierCap, WALL.pier + 0.2, px, WALL.pierH, z));
    }
  }

  // ── 沙漠砂石地（碎花岗岩）：整条地块，北沿贴墙脚、南沿起伏（挖掉水塘、沙坑）──
  {
    const top: V2[] = [];
    const bot: V2[] = [];
    for (let x = GOLF.x0 - 6; x <= GOLF.x1 + 6; x += 4) {
      top.push([x, GRAVEL_N]);
      bot.unshift([x, GOLF.z1 + 0.6 + Math.sin(x * 0.13) * 0.9 + Math.sin(x * 0.051 + 1.3) * 0.7]);
    }
    const loop: V2[] = [...top, ...bot];
    add(topGeo(loop, H.gravel, holes), ctx.mat('granite', { elem: EL.granite }), 'top:gravel', { cast: false });
  }

  // ── 球车道（沿墙，整条地块）+ 门外的落脚地 ──
  const path = ctx.mat('path', { elem: EL.path });
  add(quad(CART_PATH, H.cartPath), path, 'path:cart', { cast: false });
  add(quad(GATE_APRON, H.cartPath), path, 'path:apron', { cast: false });

  // ── 两个岛：长草一圈（rough）+ 球道草（lawn）；果岭岛挖掉水塘（含塘沿）和两个沙坑 ──
  B.add('rough', topGeo(offsetLoop(islandG, ROUGH_W), H.rough, holes), FLAT);
  B.add('lawn', topGeo(islandG, H.fairway, holes), FLAT);
  B.add('rough', topGeo(offsetLoop(islandT, ROUGH_W), H.rough), FLAT);
  B.add('lawn', topGeo(islandT, H.fairway), FLAT);
  // 发球岛上两道修剪条纹（发球台东西两边）
  for (const [a, b] of [
    [-15.6, -12.9],
    [-7.1, -4.4],
  ])
    B.add('lawnStripe', topGeo(clipX(islandT, a, b), H.stripe), FLAT);

  // ── 果岭：一圈果岭边（collar，条纹草）+ 果岭（最亮的绿）──
  B.add(
    'lawnStripe',
    topGeo(ellipse(GREEN.x, GREEN.z, GREEN.rx + GREEN.collar, GREEN.rz + GREEN.collar), H.collar),
    FLAT,
  );
  B.add('green', topGeo(ellipse(GREEN.x, GREEN.z, GREEN.rx, GREEN.rz), H.green), FLAT);

  // ── 发球台：垫高 0.35，顶面条纹草，四周一圈冷石矮墙（朝镜头的南面 = 一条细暗带）──
  B.add('lawnStripe', topGeo(teeRect, H.tee), FLAT);
  B.add('rockCool', wallGeo(teeRect, H.tee, H.fairway - 0.02, true), { extra: FACE, cast: true });

  // ── 水塘：下挖，水面 H.water；塘沿一圈石头（顶面 + 往里的岸壁，北岸的岸壁朝镜头 = 一条暗带）──
  B.add('rockCool', topGeo(pondRim, 0.03, [pond]), FLAT);
  B.add('rockCool', wallGeo(pondRim, 0.03, H.fairway - 0.01, true), { extra: FACE, cast: false });
  B.add('rockCool', wallGeo(pond, 0.03, H.water - 0.05, false), { extra: FACE, cast: false });
  add(topGeo(pond, H.water), ctx.mat('fountainWater'), 'top:water', { cast: false });

  // ── 沙坑：下挖 0.22，白沙；坑壁也是白沙（北壁朝镜头 = 一条淡紫的暗边）──
  for (const b of bunkers) {
    B.add('bunker', topGeo(b, H.bunker), FLAT);
    B.add('bunker', wallGeo(b, H.fairway, H.bunker - 0.02, false), { extra: FACE, cast: false, tag: 'wall' });
  }

  // ── 两头的低成本球道条带：长草一圈 + 球道草 + 每 9 米一道 4.5 米宽的修剪条纹 + 远处的果岭、平的沙坑 ──
  for (const band of BANDS) {
    const loop = smoothLoop(bandLoop(band.x0, band.x1), 1.2, rnd, 0);
    B.add('rough', topGeo(offsetLoop(loop, ROUGH_W), H.rough), FLAT);
    B.add('lawn', topGeo(loop, H.fairway), FLAT);
    for (let x = band.x0 + 3; x < band.x1 - 3; x += 9) {
      const st = clipX(loop, x, x + 4.5);
      if (st.length >= 3) B.add('lawnStripe', topGeo(st, H.stripe), FLAT);
    }
  }
  for (const g of FAR_GREENS) {
    B.add('lawnStripe', topGeo(ellipse(g.x, g.z, g.r * 1.3 + 0.6, g.r + 0.6), H.collar), FLAT);
    B.add('green', topGeo(ellipse(g.x, g.z, g.r * 1.3, g.r), H.green), FLAT);
  }
  for (const b of FAR_BUNKERS) B.add('bunker', topGeo(ellipse(b.x, b.z, b.rx, b.rz, 24), H.green + 0.002), FLAT);

  B.build(ctx, root);
  ctx.mats.prepare(root);
  for (const m of root.children as THREE.Mesh[]) {
    if (m.name.startsWith('top:') || m.name.startsWith('path:')) m.castShadow = false;
  }
  // 地图边的山（不投影、不受投影，prepare 之后再加）
  root.add(buildMountains((c, o) => ctx.mats.toon(c, o)));
  return { root, groundAt };
}

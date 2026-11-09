// clubmap2 的几何：地面（一直铺到山底下）+ 地图边的山（clubsite/mountains.ts）、围墙和大门、步道、球场（场面 + 白线 + 网 + 围网 + 灯杆）、
// 中心球场看台、会所（白灰泥 + 红瓦 + 钟楼）、露台、泳池、喷泉广场、草坪、匹克球、露天前台、车道（往东翻过山口出画）和停车场、
// 高尔夫（球道、果岭、沙坑、水塘）、沙丘。
// 同一种材质合并成一个网格。植物、长椅、人是复用的资产，main.ts 里放（位置在 scatter.ts）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { groundGeo } from '../clubsite/ground';
import { buildMountains, passRoadGeo } from '../clubsite/mountains';
import { box, quad, ring, smoothLoop, topGeo } from '../clubsite/render/geo';
import type { Mats, ToonOpts } from '../clubsite/render/toon';
import {
  CLUBHOUSE,
  COURT_FENCES,
  COURTS,
  type Court,
  DESK,
  DRIVE,
  type FenceLine,
  FORECOURT,
  FOUNTAIN,
  fencePieces,
  GATE,
  GOLF,
  GOLF_POND,
  GROUNDS,
  LAWN,
  LOT_N,
  LOT_S,
  PATHS,
  PICKLE,
  PICKLE_DOORS,
  PICKLE_FENCE_H,
  PLAZA,
  POOL,
  POOL_DECK,
  type Rect,
  TERRACE,
  type V2,
} from '../clubsite/world';
import { EL, type Pal } from './palette';

type Key = keyof Pal;

export interface MapCtx {
  mat(key: Key, extra?: ToonOpts): THREE.MeshToonMaterial;
  /** 直接给色阶的材质（地图边的山用；已经吃了配色方案的 grade） */
  mats: Pick<Mats, 'toon'>;
  rng(stream: string): () => number;
}

/** 按材质收几何体，最后每种材质合并成一个网格 */
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
  build(ctx: MapCtx, root: THREE.Object3D) {
    for (const [id, e] of this.m) {
      const mesh = new THREE.Mesh(mergeGeometries(e.geos), ctx.mat(e.key, e.extra));
      mesh.name = `map2:${id}`;
      mesh.castShadow = e.cast;
      mesh.receiveShadow = true;
      root.add(mesh);
    }
  }
}

const LW = 0.32; // 白线宽（米）
const FLAT = { cast: false };

/** 椭圆 / 圆的平面（y 高） */
const disc = (x: number, z: number, rx: number, rz: number, y: number, seg = 28) =>
  new THREE.CircleGeometry(1, seg)
    .rotateX(-Math.PI / 2)
    .scale(rx, 1, rz)
    .translate(x, y, z);

/** 四坡屋顶：底在 y，高 h，四边出檐 over；屋脊沿长边 */
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
  let r0: THREE.Vector3;
  let r1: THREE.Vector3;
  if (w >= d) {
    r0 = P(x0 + d / 2, y + h, cz);
    r1 = P(x1 - d / 2, y + h, cz);
  } else {
    r0 = P(cx, y + h, z0 + w / 2);
    r1 = P(cx, y + h, z1 - w / 2);
  }
  const tris: THREE.Vector3[][] =
    w >= d
      ? [
          [a, r0, r1],
          [a, r1, b], // 北坡
          [dd, c, r1],
          [dd, r1, r0], // 南坡
          [a, dd, r0], // 西山
          [b, r1, c], // 东山
        ]
      : [
          [a, r0, b], // 北山
          [dd, c, r1], // 南山
          [a, dd, r1],
          [a, r1, r0], // 西坡
          [b, r0, r1],
          [b, r1, c], // 东坡
        ];
  const pos: number[] = [];
  for (const t of tris) {
    // 让法线朝外（朝上）
    const n = new THREE.Vector3().subVectors(t[1], t[0]).cross(new THREE.Vector3().subVectors(t[2], t[0]));
    const tt = n.y < 0 ? [t[0], t[2], t[1]] : t;
    for (const v of tt) pos.push(v.x, v.y, v.z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** 一块白灰泥楼：墙 + 红瓦四坡顶（返回屋檐高度） */
function house(B: Bucket, r: Rect, h: number, roofH: number) {
  B.add('stucco', box(r.x1 - r.x0, h, r.z1 - r.z0, (r.x0 + r.x1) / 2, 0, (r.z0 + r.z1) / 2));
  B.add('roofTile', hipRoof(r, h, roofH));
}

export function buildMap(ctx: MapCtx): THREE.Group {
  const root = new THREE.Group();
  root.name = 'clubmap2';
  const B = new Bucket();
  const add = (g: THREE.BufferGeometry, m: THREE.Material, name: string, recv = true, cast = true) => {
    const mesh = new THREE.Mesh(g, m);
    mesh.name = name;
    mesh.receiveShadow = recv;
    mesh.castShadow = cast;
    root.add(mesh);
  };

  // ── 地面：一整块沙地铺到画外 + 地图边的三道山梁和天幕（不投影） ──
  add(groundGeo(), ctx.mat('sand', { elem: EL.sand }), 'ground', true, false);
  root.add(buildMountains((c, o) => ctx.mats.toon(c, o)));

  // 围墙里面：压实的浅沙（和外面的沙漠分开）
  B.add('sandHigh', quad(GROUNDS, 0.004), { ...FLAT, extra: { elem: { ...EL.sand, seed: 7 } } });

  // ── 沙丘：围墙外几座压扁的沙包 ──
  {
    const rnd = ctx.rng('map2:dunes');
    const spots: [number, number, number][] = [
      [-74, -40, 9],
      [-30, -51, 7],
      [30, -50, 8],
      [86, -38, 9],
      [-74, 10, 7],
      [-72, 44, 8],
      [98, 44, 7],
      [-56, 78, 6],
    ];
    for (const [x, z, r] of spots) {
      const g = new THREE.SphereGeometry(1, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2);
      g.scale(r * (0.9 + rnd() * 0.4), r * 0.09, r * (0.6 + rnd() * 0.3)).rotateY(rnd() * Math.PI);
      B.add('sandDrift', g.translate(x, -0.05, z), { extra: { elem: { ...EL.sand, seed: x } } });
    }
  }

  // ── 围墙（土坯 + 压顶，每 12 米一根壁柱）+ 东墙大门 ──
  {
    const WH = 1.9;
    const WT = 0.7;
    const seg = (x0: number, z0: number, x1: number, z1: number) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;
      B.add('adobe', box(alongX ? len : WT, WH, alongX ? WT : len, cx, 0, cz));
      B.add('cap', box(alongX ? len + 0.2 : WT + 0.2, 0.18, alongX ? WT + 0.2 : len + 0.2, cx, WH, cz));
      const n = Math.floor(len / 12);
      for (let i = 1; i < n; i++) {
        const t = i / n;
        const px = x0 + (x1 - x0) * t;
        const pz = z0 + (z1 - z0) * t;
        B.add('adobe', box(1.1, WH + 0.5, 1.1, px, 0, pz));
        B.add('cap', box(1.3, 0.2, 1.3, px, WH + 0.5, pz));
      }
    };
    const { x0, x1, z0, z1 } = GROUNDS;
    seg(x0, z0, x1, z0);
    seg(x0, z1, x1, z1);
    seg(x0, z0, x0, z1);
    seg(x1, z0, x1, GATE.z0 - 0.8);
    seg(x1, GATE.z1 + 0.8, x1, z1);
    // 大门：两根高柱（柱顶网球）+ 木横梁 + 朝东的招牌
    for (const z of [GATE.z0 - 0.8, GATE.z1 + 0.8]) {
      B.add('adobe', box(1.7, 4.6, 1.7, GATE.x, 0, z));
      B.add('cap', box(1.9, 0.4, 1.9, GATE.x, 4.6, z));
      B.add('ball', new THREE.SphereGeometry(0.55, 10, 6).translate(GATE.x, 5.5, z));
    }
    B.add('timber', box(0.8, 0.7, GATE.z1 - GATE.z0 + 3.4, GATE.x, 3.7, 0));
    B.add('signBoard', box(0.25, 1.2, 6.4, GATE.x + 0.55, 2.4, 0), { extra: { lightUp: 0.6, bands: [-0.4, 0.4] } });
  }

  // ── 步道、到达小院 ──
  for (const p of PATHS) B.add('path', quad(p, 0.012), { ...FLAT, extra: { elem: EL.path } });
  B.add('tile', quad(FORECOURT, 0.014), FLAT);

  // ── 球场 ──
  for (const c of COURTS) court(B, c);
  // 网球场的围网：layout.ts 的 COURT_FENCES（挨着的场共用一道、近红土场和会员场南边不拉、红土场东边开门）
  for (const f of COURT_FENCES) fenceLine(B, f);
  // 匹克球围场（西门 + 东北的员工小门）
  fenceRect(B, PICKLE, PICKLE_FENCE_H, PICKLE_DOORS);

  // ── 中心球场看台：北高（6 级）、东中（3 级）、南低（2 级）；西头记分牌 ──
  {
    const S = COURTS[0];
    const cx0 = S.x - S.hx;
    const cx1 = S.x + S.hx;
    const cz0 = S.z - S.hz;
    const cz1 = S.z + S.hz;
    const tier = (k: number, rise: number, deep: number) => ({ top: (k + 1) * rise, a: k * deep, b: (k + 1) * deep });
    for (let k = 0; k < 6; k++) {
      const t = tier(k, 0.9, 1.2);
      B.add('concrete', box(cx1 - cx0 + 4, t.top, t.b - t.a, S.x, 0, cz0 - (t.a + t.b) / 2));
      B.add('seat', box(cx1 - cx0 + 3.6, 0.35, 0.5, S.x, t.top, cz0 - t.a - 0.35), { cast: false });
    }
    B.add('concrete', box(cx1 - cx0 + 4, 1.4, 0.4, S.x, 6 * 0.9, cz0 - 7.4)); // 后墙
    for (let k = 0; k < 3; k++) {
      const t = tier(k, 0.8, 1.2);
      B.add('concrete', box(t.b - t.a, t.top, cz1 - cz0, cx1 + (t.a + t.b) / 2, 0, S.z));
      B.add('seat', box(0.5, 0.3, cz1 - cz0 - 0.6, cx1 + t.a + 0.35, t.top, S.z), { cast: false });
    }
    for (let k = 0; k < 2; k++) {
      const t = tier(k, 0.6, 1.1);
      B.add('concrete', box(cx1 - cx0, t.top, t.b - t.a, S.x, 0, cz1 + (t.a + t.b) / 2));
      B.add('seat', box(cx1 - cx0 - 0.6, 0.25, 0.45, S.x, t.top, cz1 + t.a + 0.3), { cast: false });
    }
    // 记分牌（西头，朝东）
    for (const dz of [-2.6, 2.6]) B.add('ironwork', box(0.3, 2.4, 0.3, cx0 - 1.6, 0, S.z + dz));
    B.add('ironwork', box(0.4, 2.8, 7, cx0 - 1.6, 2.4, S.z));
    B.add('signPaint', box(0.1, 0.5, 5.2, cx0 - 1.38, 4.2, S.z), { cast: false });
  }

  // ── 会所：主楼两层、东翼、南边单层的一排，红瓦四坡顶；钟楼；东面拱廊 ──
  {
    const { x0, x1, z0, z1 } = CLUBHOUSE;
    house(B, { x0, x1: -46, z0, z1: -16 }, 8, 3.4);
    house(B, { x0: -46, x1, z0, z1: -27 }, 5.2, 2.4);
    house(B, { x0, x1: -50, z0: -16, z1 }, 4.4, 2);
    // 钟楼
    B.add('stucco', box(3.6, 12.5, 3.6, -45.6, 0, -18.2));
    B.add('ironwork', box(1.2, 1.6, 3.7, -45.6, 9.6, -18.2), { cast: false });
    B.add('ironwork', box(3.7, 1.6, 1.2, -45.6, 9.6, -18.2), { cast: false });
    B.add('roofTile', hipRoof({ x0: -47.4, x1: -43.8, z0: -20, z1: -16.4 }, 12.5, 2.6, 0.4));
    // 东面拱廊（主楼东墙 z −26…−16 一排深色拱洞）+ 南面窗
    for (let z = -25; z <= -17.5; z += 2.4) B.add('ironwork', box(0.2, 2.8, 1.5, -45.9, 0, z), { cast: false });
    for (let x = -60; x <= -48; x += 3) {
      B.add('ironwork', box(1.2, 1.6, 0.2, x, 4.8, -15.9), { cast: false });
      if (x < -51) B.add('ironwork', box(1.2, 1.6, 0.2, x, 1.2, -9.9), { cast: false });
    }
  }

  // ── 露台餐厅：陶砖地 + 木凉棚 + 桌子和伞 ──
  {
    B.add('tile', quad(TERRACE, 0.014), FLAT);
    const { x0, x1, z0, z1 } = TERRACE;
    for (let z = z0 + 1; z <= z1 - 0.5; z += 4.8)
      for (const x of [x0 + 0.6, x1 - 0.6]) B.add('timber', box(0.35, 3.2, 0.35, x, 0, z));
    for (let z = z0 + 1; z <= z1 - 0.5; z += 2.4)
      B.add('timber', box(x1 - x0, 0.25, 0.3, (x0 + x1) / 2, 3.2, z), { cast: true });
    for (const z of [z0 + 4, z0 + 10, z0 + 16, z0 + 22])
      B.add('counterTop', box(1.4, 0.8, 1.4, (x0 + x1) / 2, 0, z), { cast: false });
  }

  // ── 泳池：池畔石板、池沿、水、躺椅、三间帐篷 ──
  {
    B.add('flagstone', quad(POOL_DECK, 0.014), FLAT);
    const { x0, x1, z0, z1 } = POOL;
    B.add('water', quad(POOL, 0.05), FLAT);
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
  B.add('tile', quad(PLAZA, 0.014), FLAT);
  B.add('flagstone', disc(FOUNTAIN.x, FOUNTAIN.z, FOUNTAIN.r, FOUNTAIN.r, 0.02, 32), FLAT);
  B.add('adobe', ring(FOUNTAIN.water + 0.6, FOUNTAIN.water, 0.6).translate(FOUNTAIN.x, 0, FOUNTAIN.z));
  B.add('water', disc(FOUNTAIN.x, FOUNTAIN.z, FOUNTAIN.water, FOUNTAIN.water, 0.4, 24), FLAT);
  B.add('cap', new THREE.CylinderGeometry(0.6, 0.9, 1.8, 10).translate(FOUNTAIN.x, 0.9, FOUNTAIN.z));
  B.add('cap', new THREE.CylinderGeometry(1.4, 1.0, 0.3, 10).translate(FOUNTAIN.x, 1.9, FOUNTAIN.z));

  // ── 球员草坪 ──
  {
    const rnd = ctx.rng('map2:lawn');
    const pts: V2[] = [
      [LAWN.x0 + 1, LAWN.z0],
      [LAWN.x1, LAWN.z0 + 1],
      [LAWN.x1 - 0.5, LAWN.z1],
      [LAWN.x0 + 3, LAWN.z1 - 0.5],
      [LAWN.x0, (LAWN.z0 + LAWN.z1) / 2],
    ];
    B.add('lawn', topGeo(smoothLoop(pts, 0.8, rnd, 0.2), 0.016), FLAT);
  }

  // ── 露天前台：凉棚（4 柱 + 帆布顶 + 两道条纹）+ 朝东的柜台 + 后柜 + 毛巾车 + 饮水桶 ──
  {
    const { x, z, w, d, h } = DESK;
    for (const [px, pz] of [
      [x - w / 2 + 0.2, z - d / 2 + 0.2],
      [x + w / 2 - 0.2, z - d / 2 + 0.2],
      [x - w / 2 + 0.2, z + d / 2 - 0.2],
      [x + w / 2 - 0.2, z + d / 2 - 0.2],
    ])
      B.add('timber', box(0.35, h, 0.35, px, 0, pz));
    B.add('canvas', box(w + 0.6, 0.18, d + 0.6, x, h, z));
    for (const sz of [-2, 2]) B.add('canvasStripe', box(w + 0.62, 0.2, 1.1, x, h, z + sz));
    B.add('counter', box(0.7, 1.0, 4.8, x + w / 2 - 0.6, 0, z));
    B.add('counterTop', box(0.85, 0.1, 5.0, x + w / 2 - 0.6, 1.0, z));
    B.add('timber', box(0.5, 1.5, d - 1.2, x - w / 2 + 0.5, 0, z));
    B.add('clothWhite', box(0.6, 0.9, 0.9, x, 0, z + d / 2 + 0.9));
    B.add('jug', new THREE.CylinderGeometry(0.3, 0.3, 0.7, 8).translate(x + w / 2 + 0.5, 0.35, z + d / 2 - 0.3));
  }

  // ── 车道（出大门往东，翻过东边两道垭口出画）+ 两片停车场（车位线 + 车）──
  {
    B.add('asphalt', quad(DRIVE, 0.012), FLAT);
    // 直段往东：翻过东边两道垭口（mid 的山口、far 的鞍部），一直铺到地面尽头
    B.add('asphalt', passRoadGeo(DRIVE.x1 - 0.01, DRIVE.z0, DRIVE.z1, 0.012).road, FLAT);
    const cars: Key[] = ['carRed', 'clothBlue', 'clothWhite', 'straw', 'clothTeal', 'clothWhite', 'clothPurple'];
    const rnd = ctx.rng('map2:cars');
    let ci = 0;
    for (const lot of [LOT_N, LOT_S]) {
      B.add('asphalt', quad(lot, 0.01), FLAT);
      for (const [rowZ, face] of [
        [lot.z0 + 0.6, 1],
        [lot.z1 - 5.8, -1],
      ] as const) {
        for (let x = lot.x0 + 1; x + 2.6 <= lot.x1 - 0.6; x += 2.8) {
          B.add('line', quad({ x0: x, x1: x + LW, z0: rowZ, z1: rowZ + 5.2 }, 0.02), FLAT);
          if (rnd() < 0.55) {
            const key = cars[ci++ % cars.length];
            const cx = x + 1.4;
            const cz = rowZ + 2.6;
            B.add(key, box(1.9, 0.85, 4.4, cx, 0.25, cz));
            B.add(key, box(1.7, 0.6, 2.3, cx, 1.1, cz + face * 0.3));
            B.add('ironwork', box(1.95, 0.3, 4.2, cx, 0, cz));
          }
        }
      }
    }
  }

  // ── 高尔夫：弯弯的球道、三块果岭（旗杆）、沙坑、水塘 ──
  {
    const rnd = ctx.rng('map2:golf');
    const top: V2[] = [];
    const bot: V2[] = [];
    for (let x = GOLF.x0 - 4; x <= GOLF.x1 + 4; x += 8) {
      const zc = 63.5 + Math.sin(x * 0.045) * 4 + Math.sin(x * 0.11 + 1) * 1.4;
      const hw = 6.5 + Math.sin(x * 0.07 + 2) * 2;
      top.push([x, zc - hw]);
      bot.unshift([x, zc + hw]);
    }
    B.add('lawn', topGeo(smoothLoop([...top, ...bot], 1.2, rnd, 0.3), 0.012), FLAT);
    // 修剪条纹（斜着的几道亮绿）
    for (let x = GOLF.x0 + 2; x < GOLF.x1 - 6; x += 9) {
      const zc = 63.5 + Math.sin((x + 2) * 0.045) * 4;
      B.add('lawnStripe', quad({ x0: x, x1: x + 4.5, z0: zc - 3.2, z1: zc + 3.2 }, 0.016), FLAT);
    }
    for (const [gx, gz, r] of [
      [-52, 61, 4.5],
      [8, 66.5, 4],
      [66, 60.5, 4.5],
    ]) {
      B.add('green', disc(gx, gz, r * 1.3, r, 0.02), FLAT);
      B.add('clothWhite', box(0.12, 2.6, 0.12, gx + 0.8, 0, gz));
      B.add('clothRed', box(0.08, 0.6, 0.9, gx + 0.8, 2.0, gz + 0.45), { cast: false });
      B.add('sandHigh', disc(gx - r * 1.7, gz + 1.4, 2.4, 1.5, 0.024), FLAT);
    }
    B.add('sandHigh', disc(36, 68, 3, 1.8, 0.024), FLAT);
    B.add(
      'rock',
      new THREE.CylinderGeometry(1, 1, 0.2, 20)
        .scale(GOLF_POND.rx + 0.6, 1, GOLF_POND.rz + 0.6)
        .translate(GOLF_POND.x, 0.1, GOLF_POND.z),
      FLAT,
    );
    B.add('water', disc(GOLF_POND.x, GOLF_POND.z, GOLF_POND.rx, GOLF_POND.rz, 0.22), FLAT);
  }

  B.build(ctx, root);
  return root;
}

/** 一道直的围网（按门切开） */
function fenceLine(B: Bucket, f: FenceLine, y = 0) {
  const T = 0.22;
  const alongX = Math.abs(f.z1 - f.z0) < 1e-6;
  const [a0, a1] = alongX ? [f.x0, f.x1] : [f.z0, f.z1];
  for (const [p, q] of fencePieces(a0, a1, f.doors)) {
    if (alongX) B.add('windscreen', box(q - p, f.h, T, (p + q) / 2, y, f.z0));
    else B.add('windscreen', box(T, f.h, q - p, f.x0, y, (p + q) / 2));
  }
}

/** 围网：矩形四边，每边可以留几个门（side：哪一边；at：门中心沿那边的世界坐标；gap：门宽） */
function fenceRect(
  B: Bucket,
  r: Rect,
  h: number,
  doors: { side: 'n' | 's' | 'e' | 'w'; at: number; gap: number }[] = [],
) {
  const on = (side: string) => doors.filter((d) => d.side === side);
  fenceLine(B, { x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z0, h, doors: on('n') });
  fenceLine(B, { x0: r.x0, z0: r.z1, x1: r.x1, z1: r.z1, h, doors: on('s') });
  fenceLine(B, { x0: r.x0, z0: r.z0, x1: r.x0, z1: r.z1, h, doors: on('w') });
  fenceLine(B, { x0: r.x1, z0: r.z0, x1: r.x1, z1: r.z1, h, doors: on('e') });
}

/** 一片场：场边色 + 场内色 + 白线（沿 x 打）+ 网 + 四角灯杆（围网另外拉：COURT_FENCES） */
function court(B: Bucket, c: Court, y = 0, opts: { poles?: boolean } = {}) {
  const cell: Rect = { x0: c.x - c.hx, x1: c.x + c.hx, z0: c.z - c.hz, z1: c.z + c.hz };
  const pickle = c.kind === 'pickle';
  const L = pickle ? 13.41 : 23.77; // 底线到底线
  const DW = pickle ? 6.1 : 10.97; // 双打宽
  const SW = pickle ? 6.1 : 8.23;
  const SVC = pickle ? 2.13 : 6.4; // 发球线（匹克球：非截击区线）
  if (c.kind === 'clay') B.add('clay', quad(cell, y + 0.018), FLAT);
  else {
    B.add('surround', quad(cell, y + 0.018), FLAT);
    const m = pickle ? 0.6 : 1.4;
    B.add(
      pickle ? 'pickle' : 'court',
      quad(
        { x0: c.x - L / 2 - m, x1: c.x + L / 2 + m, z0: c.z - DW / 2 - m * 0.6, z1: c.z + DW / 2 + m * 0.6 },
        y + 0.022,
      ),
      FLAT,
    );
  }
  const ly = y + 0.03;
  const line = (x0: number, x1: number, z0: number, z1: number) => B.add('line', quad({ x0, x1, z0, z1 }, ly), FLAT);
  const lw = pickle ? LW * 0.8 : LW;
  for (const s of [-1, 1]) {
    line(c.x + (s * L) / 2 - lw / 2, c.x + (s * L) / 2 + lw / 2, c.z - DW / 2, c.z + DW / 2); // 底线
    line(c.x - L / 2, c.x + L / 2, c.z + (s * DW) / 2 - lw / 2, c.z + (s * DW) / 2 + lw / 2); // 双打边线
    if (!pickle) line(c.x - L / 2, c.x + L / 2, c.z + (s * SW) / 2 - lw / 2, c.z + (s * SW) / 2 + lw / 2);
    line(c.x + s * SVC - lw / 2, c.x + s * SVC + lw / 2, c.z - SW / 2, c.z + SW / 2); // 发球线
  }
  if (pickle) {
    for (const s of [-1, 1]) line(c.x + s * SVC, c.x + (s * L) / 2, c.z - lw / 2, c.z + lw / 2);
  } else line(c.x - SVC, c.x + SVC, c.z - lw / 2, c.z + lw / 2); // 中线
  // 网：沿 z 的一道暗带 + 白网带
  const nh = pickle ? 0.86 : 1.07;
  B.add('net', box(0.12, nh - 0.15, DW + (pickle ? 0.6 : 1.8), c.x, y, c.z), { extra: { noShadowReceive: true } });
  B.add('netTape', box(0.14, 0.15, DW + (pickle ? 0.6 : 1.8), c.x, y + nh - 0.15, c.z), FLAT);
  if (c.kind === 'hard' || c.kind === 'clay') {
    if (opts.poles !== false)
      for (const [px, pz] of [
        [cell.x0 + 0.4, cell.z0 + 0.4],
        [cell.x1 - 0.4, cell.z0 + 0.4],
        [cell.x0 + 0.4, cell.z1 - 0.4],
        [cell.x1 - 0.4, cell.z1 - 0.4],
      ]) {
        B.add('ironwork', box(0.22, 8.5, 0.22, px, y, pz));
        B.add('clothWhite', box(1.0, 0.3, 0.5, px, y + 8.5, pz), { cast: false });
      }
  }
}

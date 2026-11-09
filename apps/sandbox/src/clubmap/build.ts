// 微缩地图的几何：岛、三层台面、前墙和大门、步道铺地、球场块（场面 + 白线 + 网 + 围网）、建筑盒子、前台凉棚、喷泉、咖啡吧伞、练习墙、停车场。
// 全是胖方块：同一种材质合并成一个网格（draw call 少）。只为看"什么在哪、多大"，不是素材。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { box, quad, ring, smoothLoop, topGeo, wallGeo } from '../clubsite/render/geo';
import type { ToonOpts } from '../clubsite/render/toon';
import {
  BLOCKS,
  BUILDINGS,
  blockRect,
  CAFE_TERRACE,
  COURT,
  type CourtBlock,
  DESK,
  DROPOFF,
  FOUNTAIN,
  FRONT_WALL,
  GATE,
  H,
  HIT_PAD,
  HIT_WALL,
  ISLAND,
  LOT,
  MINI_COURTS,
  type Rect,
  ROAD,
  STAIRS,
  TERRACES,
  TILES,
  type V2,
  VIEW_LAWN,
  WALKS,
} from './layout';
import { EL, type Pal } from './palette';

export interface MapCtx {
  mat(key: keyof Pal, extra?: ToonOpts): THREE.MeshToonMaterial;
  rng(stream: string): () => number;
}

type Key = keyof Pal;

/** 按材质收几何体，最后每种材质合并成一个网格 */
export class Bucket {
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
  build(ctx: MapCtx, root: THREE.Object3D) {
    for (const [id, e] of this.m) {
      const mesh = new THREE.Mesh(mergeGeometries(e.geos), ctx.mat(e.key, e.extra));
      mesh.name = `map:${id}`;
      mesh.castShadow = e.cast;
      mesh.receiveShadow = e.recv;
      root.add(mesh);
    }
  }
}

/** 圆角矩形轮廓 */
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

export interface MapBuild {
  root: THREE.Group;
}

export function buildMap(ctx: MapCtx): MapBuild {
  const root = new THREE.Group();
  root.name = 'clubmap';
  const B = new Bucket();
  const LIP = 0.25;
  const LW = 0.3; // 白线宽（米）：微缩地图的缩放下 ≥ 1 纹素

  // ── 浮空岛：岛顶（到达区的砂石地）+ 外沿崖壁 + 岛底 ──
  const island = smoothLoop(ISLAND, 1.2, ctx.rng('map:island'), 0.2);
  const add = (g: THREE.BufferGeometry, m: THREE.Material, name: string, recv = true) => {
    const mesh = new THREE.Mesh(g, m);
    mesh.name = name;
    mesh.receiveShadow = recv;
    mesh.castShadow = true;
    root.add(mesh);
  };
  add(topGeo(island, H.arrival), ctx.mat('sand', { elem: EL.sand }), 'top:arrival');
  add(wallGeo(island, H.arrival, H.arrival - LIP, true), ctx.mat('cliffLip'), 'lip:island', false);
  add(
    wallGeo(island, H.arrival - LIP, H.skirt, true, 0, () => H.arrival - H.skirt),
    ctx.mat('cliff', { elem: EL.strata }),
    'wall:island',
    false,
  );
  add(undersideGeo(island), ctx.mat('underside', { side: THREE.DoubleSide }), 'underside', false);

  // ── 三层台面：顶 + 陶砖压顶的亮唇 + 土坯挡土墙（朝镜头 = 暗带） ──
  const tops: Record<string, Key> = { club: 'sand', courts: 'sandHigh', grass: 'sandHigh' };
  for (const [id, t] of Object.entries(TERRACES)) {
    const pts = roundRect(t, 2.5);
    add(topGeo(pts, t.h), ctx.mat(tops[id], { elem: { ...EL.sand, seed: t.h * 3 } }), `top:${id}`);
    add(wallGeo(pts, t.h, t.h - LIP, true), ctx.mat('cap'), `lip:${id}`, false);
    add(wallGeo(pts, t.h - LIP, H.arrival - 0.5, true), ctx.mat('adobe'), `wall:${id}`, false);
  }

  // ── 前墙（女儿墙，大门豁口两边）+ 大门 ──
  const [g0, g1] = FRONT_WALL.gap;
  for (const [a, b] of [
    [TERRACES.club.x0 + 1, g0],
    [g1, TERRACES.club.x1 - 1],
  ]) {
    B.add('adobe', box(b - a, FRONT_WALL.h + 0.01, 0.6, (a + b) / 2, H.club, FRONT_WALL.z - 0.3));
    B.add('cap', box(b - a + 0.1, 0.15, 0.7, (a + b) / 2, H.club + FRONT_WALL.h, FRONT_WALL.z - 0.3));
  }
  for (const sx of [-1, 1]) {
    const x = GATE.x + (sx * GATE.span) / 2;
    B.add('adobe', box(1.2, GATE.h - 0.6, 1.2, x, H.club, GATE.z));
    B.add('cap', box(1.4, 0.4, 1.4, x, H.club + GATE.h - 0.6, GATE.z));
    B.add('ball', new THREE.SphereGeometry(0.45, 10, 6).translate(x, H.club + GATE.h + 0.25, GATE.z));
  }
  B.add('timber', box(GATE.span + 2, 0.6, 0.8, GATE.x, H.club + GATE.h - 1.4, GATE.z));
  B.add('signBoard', box(3.6, 1.0, 0.2, GATE.x, H.club + GATE.h - 2.5, GATE.z + 0.5), {
    extra: { lightUp: 0.6, bands: [-0.4, 0.4] },
  });

  // ── 台阶（中轴） ──
  for (const st of STAIRS) {
    const rise = (st.from - st.to) / st.steps;
    for (let k = 0; k < st.steps; k++) {
      const top = st.from - rise * (k + 1);
      const za = st.z0 - 0.3;
      const zb = st.z0 + st.run * (k + 1);
      const hgt = top - (st.to - 0.1);
      B.add('stair', box(st.x1 - st.x0, hgt, zb - za, (st.x0 + st.x1) / 2, st.to - 0.1, (za + zb) / 2), {
        extra: { edge: 0.2, convex: 0.3 },
        recv: false,
      });
    }
  }

  // ── 铺地：公共区陶砖、步道石板、到达广场、停车场和车道 ──
  for (const t of TILES) B.add('tile', quad(t, H.club + 0.006), { cast: false });
  for (const w of WALKS) B.add('flagstone', quad(w, w.y + 0.012), { cast: false });
  B.add('flagstone', quad(DROPOFF, H.arrival + 0.012), { cast: false });
  B.add('asphalt', quad(LOT, H.arrival + 0.01), { cast: false });
  B.add('asphalt', quad(ROAD, H.arrival + 0.012), { cast: false });
  // 车位线（两排，车头朝北）+ 车
  const cars: Key[] = ['carRed', 'clothBlue', 'clothWhite', 'straw', 'clothTeal', 'clothWhite'];
  const rnd = ctx.rng('map:cars');
  let ci = 0;
  for (const rowZ of [61, 79]) {
    for (let x = LOT.x0 + 1.5; x + 2.6 <= LOT.x1 - 1; x += 2.8) {
      B.add('line', quad({ x0: x, x1: x + LW, z0: rowZ, z1: rowZ + 5.2 }, H.arrival + 0.02), { cast: false });
      if (rnd() < 0.62) {
        const key = cars[ci++ % cars.length];
        const cx = x + 1.4;
        const cz = rowZ + 2.6;
        B.add(key, box(1.9, 0.9, 4.4, cx, H.arrival + 0.25, cz));
        B.add(key, box(1.7, 0.6, 2.4, cx, H.arrival + 1.15, cz + 0.3));
        B.add('ironwork', box(1.95, 0.3, 4.2, cx, H.arrival, cz));
      }
    }
  }

  // ── 球场块 ──
  for (const b of BLOCKS) courtBlock(B, b, LW);

  // ── 建筑：土坯墙 + 功能色平屋顶（出檐 0.4）+ 朝南一扇深色门 ──
  for (const bd of BUILDINGS) {
    const w = bd.x1 - bd.x0;
    const d = bd.z1 - bd.z0;
    const cx = (bd.x0 + bd.x1) / 2;
    const cz = (bd.z0 + bd.z1) / 2;
    B.add('adobe', box(w, bd.h, d, cx, H.club, cz));
    B.add(bd.roof, box(w + 0.8, 0.35, d + 0.8, cx, H.club + bd.h, cz));
    B.add('ironwork', box(Math.min(3, w * 0.3), 2.4, 0.2, cx, H.club, bd.z1 + 0.05));
  }

  // ── 露天前台：凉棚（四根柱 + 帆布顶 + 两条蓝条纹）+ 柜台 + 后柜 ──
  {
    const { x, z, w, d, h } = DESK;
    for (const [px, pz] of [
      [x - w / 2 + 0.2, z - d / 2 + 0.2],
      [x + w / 2 - 0.2, z - d / 2 + 0.2],
      [x - w / 2 + 0.2, z + d / 2 - 0.2],
      [x + w / 2 - 0.2, z + d / 2 - 0.2],
    ])
      B.add('timber', box(0.35, h, 0.35, px, H.club, pz));
    B.add('canvas', box(w, 0.15, d, x, H.club + h, z));
    for (const sx of [-2.1, 2.1]) B.add('canvasStripe', box(1.2, 0.17, d + 0.02, x + sx, H.club + h, z));
    B.add('counter', box(4.4, 1.0, 0.65, x, H.club, z + d / 2 - 0.05));
    B.add('counterTop', box(4.5, 0.08, 0.75, x, H.club + 1.0, z + d / 2 - 0.05));
    B.add('timber', box(w - 0.8, 1.4, 0.5, x, H.club, z - d / 2 + 0.7));
  }

  // ── 喷泉广场：陶砖圆 + 水池（土坯池沿）──
  B.add(
    'tile',
    new THREE.CircleGeometry(FOUNTAIN.r, 32).rotateX(-Math.PI / 2).translate(FOUNTAIN.x, H.club + 0.008, FOUNTAIN.z),
    {
      cast: false,
    },
  );
  B.add('adobe', ring(FOUNTAIN.water + 0.6, FOUNTAIN.water, 0.55).translate(FOUNTAIN.x, H.club, FOUNTAIN.z));
  B.add(
    'water',
    new THREE.CircleGeometry(FOUNTAIN.water, 24).rotateX(-Math.PI / 2).translate(FOUNTAIN.x, H.club + 0.35, FOUNTAIN.z),
    {
      cast: false,
    },
  );
  B.add('cap', new THREE.CylinderGeometry(0.7, 0.9, 1.4, 10).translate(FOUNTAIN.x, H.club + 0.7, FOUNTAIN.z));

  // ── 咖啡吧露台：陶砖 + 6 把伞（奶油 / 珊瑚交替）──
  B.add('tile', quad(CAFE_TERRACE, H.club + 0.006), { cast: false });
  for (let i = 0; i < 6; i++) {
    const ux = CAFE_TERRACE.x0 + 3.2 + (i % 2) * 6.4;
    const uz = CAFE_TERRACE.z0 + 2.6 + Math.floor(i / 2) * 4.4;
    B.add('timber', box(0.2, 2.3, 0.2, ux, H.club, uz));
    B.add(i % 2 ? 'canvas' : 'fabricStripe', new THREE.ConeGeometry(1.6, 0.7, 8).translate(ux, H.club + 2.55, uz));
  }

  // ── 遮阳观赛坡：一块草坪（遮阳帆是复用的资产，main 里放）──
  B.add('lawn', quad(VIEW_LAWN, H.club + 0.008), { cast: false });

  // ── 练习墙 + 墙前硬地 + 两块儿童小场 ──
  B.add('court', quad(HIT_PAD, H.club + 0.01), { cast: false });
  B.add(
    'windscreen',
    box(HIT_WALL.x1 - HIT_WALL.x0, HIT_WALL.h, 0.6, (HIT_WALL.x0 + HIT_WALL.x1) / 2, H.club, HIT_WALL.z),
  );
  B.add(
    'line',
    box(HIT_WALL.x1 - HIT_WALL.x0 - 0.4, 0.15, 0.62, (HIT_WALL.x0 + HIT_WALL.x1) / 2, H.club + 0.9, HIT_WALL.z),
    {
      cast: false,
    },
  );
  for (const mc of MINI_COURTS) {
    B.add('surround', quad(mc, H.club + 0.01), { cast: false });
    const inner: Rect = { x0: mc.x0 + 1.25, x1: mc.x1 - 1.25, z0: mc.z0 + 1, z1: mc.z1 - 1 };
    B.add('clay', quad(inner, H.club + 0.012), { cast: false });
    outline(B, inner, H.club + 0.02, LW);
    const nz = (mc.z0 + mc.z1) / 2;
    B.add('net', box(inner.x1 - inner.x0 + 0.6, 0.8, 0.15, (mc.x0 + mc.x1) / 2, H.club, nz));
  }

  // 投影/受影按上面每个 add 的设定（这里没有风摆、镂空的材质，不用 mats.prepare）
  B.build(ctx, root);
  return { root };
}

/** 一块球场：底面（硬地 = 外场绿、红土 = 陶红、草地 = 两种绿的修剪条纹）+ 每片的内场 + 白线 + 网 + 围网（四周和排与排之间） */
function courtBlock(B: Bucket, b: CourtBlock, LW: number) {
  const r = blockRect(b);
  const y = b.y;
  if (b.kind === 'grass') {
    const band = 2.29; // 修剪条纹宽（米）：按纹素看是 8～10 行一条
    let i = 0;
    for (let z = r.z0; z < r.z1 - 1e-3; z += band, i++)
      B.add(
        i % 2 ? 'lawnStripe' : 'lawn',
        quad({ x0: r.x0, x1: r.x1, z0: z, z1: Math.min(r.z1, z + band) }, y + 0.01),
        {
          cast: false,
        },
      );
  } else B.add(b.kind === 'hard' ? 'surround' : 'clay', quad(r, y + 0.01), { cast: false });
  for (let c = 0; c < b.cols; c++)
    for (let w = 0; w < b.rows; w++) {
      const cx = r.x0 + (c + 0.5) * COURT.cellW;
      const cz = r.z0 + (w + 0.5) * COURT.cellL;
      if (b.kind === 'hard')
        B.add(
          'court',
          quad(
            { x0: cx - COURT.dw / 2, x1: cx + COURT.dw / 2, z0: cz - COURT.len / 2, z1: cz + COURT.len / 2 },
            y + 0.015,
          ),
          { cast: false },
        );
      courtLines(B, cx, cz, y + 0.025, LW);
      // 网：一条暗带（网身）+ 顶上白网带
      B.add('net', box(COURT.dw + 1.8, COURT.netH - 0.15, 0.12, cx, y, cz), { extra: { noShadowReceive: true } });
      B.add('netTape', box(COURT.dw + 1.8, 0.15, 0.14, cx, y + COURT.netH - 0.15, cz), { cast: false });
    }
  // 围网：四周 + 排与排之间（朝镜头的那面是深绿暗带）
  const FH = 2.4;
  const FT = 0.25;
  for (let w = 0; w <= b.rows; w++) {
    const z = r.z0 + w * COURT.cellL;
    B.add('windscreen', box(r.x1 - r.x0, FH, FT, (r.x0 + r.x1) / 2, y, z));
  }
  for (const x of [r.x0, r.x1]) B.add('windscreen', box(FT, FH, r.z1 - r.z0, x, y, (r.z0 + r.z1) / 2));
}

/** 一片球场的白线（双打边线、单打边线、底线、发球线、中线、中点） */
function courtLines(B: Bucket, cx: number, cz: number, y: number, LW: number) {
  const { dw, len, sw, svc } = COURT;
  const L = (x0: number, x1: number, z0: number, z1: number) =>
    B.add('line', quad({ x0, x1, z0, z1 }, y), { cast: false });
  for (const s of [-1, 1]) {
    L(cx - dw / 2 - LW / 2, cx + dw / 2 + LW / 2, cz + (s * len) / 2 - LW / 2, cz + (s * len) / 2 + LW / 2);
    L(cx + (s * dw) / 2 - LW / 2, cx + (s * dw) / 2 + LW / 2, cz - len / 2, cz + len / 2);
    L(cx + (s * sw) / 2 - LW / 2, cx + (s * sw) / 2 + LW / 2, cz - len / 2, cz + len / 2);
    L(cx - sw / 2, cx + sw / 2, cz + s * svc - LW / 2, cz + s * svc + LW / 2);
    L(cx - LW / 2, cx + LW / 2, cz + (s * len) / 2 - s * 0.45, cz + (s * len) / 2);
  }
  L(cx - LW / 2, cx + LW / 2, cz - svc, cz + svc);
}

/** 矩形四条白线 */
function outline(B: Bucket, r: Rect, y: number, LW: number) {
  const L = (x0: number, x1: number, z0: number, z1: number) =>
    B.add('line', quad({ x0, x1, z0, z1 }, y), { cast: false });
  L(r.x0, r.x1, r.z0, r.z0 + LW);
  L(r.x0, r.x1, r.z1 - LW, r.z1);
  L(r.x0, r.x0 + LW, r.z0, r.z1);
  L(r.x1 - LW, r.x1, r.z0, r.z1);
}

/** 岛底：外沿一圈往下、往里收（从 clubfront/terrain.ts 的 undersideGeo 简化） */
export function undersideGeo(island: V2[]): THREE.BufferGeometry {
  let cx = 0;
  let cz = 0;
  for (const [x, z] of island) {
    cx += x;
    cz += z;
  }
  cx /= island.length;
  cz /= island.length;
  const steps: [number, number][] = [
    [1.0, H.skirt],
    [0.9, H.skirt - 2.4],
    [0.7, H.skirt - 5.5],
    [0.4, H.skirt - 8.5],
    [0.1, H.bottom],
  ];
  const rings = steps.map(([k, y], s) =>
    island.map(
      ([x, z], i) => new THREE.Vector3(cx + (x - cx) * k, y - (s ? ((i * 37) % 11) * 0.12 * s : 0), cz + (z - cz) * k),
    ),
  );
  const pos: number[] = [];
  const K = island.length;
  for (let r = 0; r < rings.length - 1; r++)
    for (let i = 0; i < K; i++) {
      const j = (i + 1) % K;
      const A = rings[r];
      const Bn = rings[r + 1];
      pos.push(...A[i].toArray(), ...Bn[i].toArray(), ...Bn[j].toArray());
      pos.push(...A[i].toArray(), ...Bn[j].toArray(), ...A[j].toArray());
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  const nrm = g.getAttribute('normal') as THREE.BufferAttribute;
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < nrm.count; i++) {
    const ox = p.getX(i) - cx;
    const oz = p.getZ(i) - cz;
    if (nrm.getX(i) * ox + nrm.getZ(i) * oz < 0) nrm.setXYZ(i, -nrm.getX(i), -nrm.getY(i), -nrm.getZ(i));
  }
  return g;
}

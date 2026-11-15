// clubbuild 的地块和四周：沙漠地面（clubsite/ground）、远处的山（clubsite/mountains，整组挪到地块中心）、
// 抬高一点的沙色地块（开罗式的一块地：顶面 y = 0，侧面土坯墙，边上一圈矮沿）、南边正中的大门和从画面下沿进来的路、
// 建造模式才显示的网格线、步道（所有步道格合并成一个网格，变了就重建）。
// 静态的东西按材质合并（手机上省 draw call）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { groundGeo } from '../clubsite/ground';
import { buildMountains } from '../clubsite/mountains';
import { box, topGeo, wallGeo } from '../clubsite/render/geo';
import { REUSED } from '../clubsite/reuse';
import { LOT_D, LOT_W, TILE } from './catalog';
import type { AssetCtx } from './ctx';
import type { Pal } from './palette';
import { GATE_COLS, GATE_ROW, ROAD_TILES, tileCenter } from './sim';

/** 地块半宽、半深（米） */
export const HX = (LOT_W * TILE) / 2;
export const HZ = (LOT_D * TILE) / 2;
/** 四周沙漠比地块低多少（地块顶面 y = 0） */
export const DROP = 1.2;
/** 大门的世界坐标（两格的中间，地块南沿） */
export const GATE_X = ((GATE_COLS[0] + GATE_COLS[1] + 1) / 2 - LOT_W / 2) * TILE;
export const GATE_Z = HZ;
/** 路从画面下沿进来：客人从这里出生、从这里走掉 */
export const ROAD_FAR = HZ + ROAD_TILES * TILE;
/** 大门外的坡道：从地块南沿（RAMP_Z0）往南 RAMP 米下到沙漠 */
export const RAMP = 4;
export const RAMP_Z0 = HZ - 0.05;
/** 路宽（米） */
export const ROAD_HALF = 2.6;

/** 地块外面挪山的偏移：clubsite 的世界坐标里沙漠（DESERT）中心大约在 (10.5, 16)，挪到原点 */
const MTN_OFFSET = new THREE.Vector3(-10.5, -DROP, -16);

type G = THREE.BufferGeometry;

/** 按材质收几何体，最后每种材质合并成一个网格 */
class Bins {
  private m = new Map<keyof Pal, G[]>();
  add(key: keyof Pal, g: G) {
    const list = this.m.get(key) ?? [];
    list.push(g);
    this.m.set(key, list);
  }
  build(ctx: AssetCtx, name: string, opts?: { cast?: boolean; receive?: boolean }): THREE.Group {
    const out = new THREE.Group();
    out.name = name;
    for (const [key, list] of this.m) {
      const g = mergeGeometries(list.map((x) => (x.index ? x.toNonIndexed() : x)));
      const mesh = new THREE.Mesh(g, ctx.mat(key));
      mesh.name = `${name}:${String(key)}`;
      out.add(mesh);
    }
    ctx.mats.prepare(out, opts);
    return out;
  }
}

const strip = (g: G, keep: string[]) => {
  for (const k of Object.keys(g.attributes)) if (!keep.includes(k)) g.deleteAttribute(k);
  return g;
};
const pn = (g: G) => strip(g, ['position', 'normal']);

export interface Lot {
  root: THREE.Group;
  /** 网格线（建造模式才显示） */
  grid: THREE.Object3D;
  /** 远山（userData.crests） */
  mountains: THREE.Group;
}

export function buildLot(ctx: AssetCtx, rng: () => number): Lot {
  const root = new THREE.Group();
  root.name = 'lot';

  // ── 沙漠地面（铺得很远，低一级） + 远山 ──
  const ground = new THREE.Mesh(groundGeo(), ctx.mat('sandDrift'));
  ground.position.copy(MTN_OFFSET);
  ground.name = 'ground';
  ctx.mats.prepare(ground, { cast: false });
  root.add(ground);
  const mountains = buildMountains(ctx.mats.toon as Parameters<typeof buildMountains>[0], 3);
  mountains.position.copy(MTN_OFFSET);
  root.add(mountains);

  // ── 地块：顶面 + 一圈矮沿 + 土坯侧墙 ──
  const tops = new Bins();
  const R = 0.35; // 矮沿宽
  const rect = (x0: number, z0: number, x1: number, z1: number): [number, number][] => [
    [x0, z0],
    [x1, z0],
    [x1, z1],
    [x0, z1],
  ];
  tops.add('sandHigh', pn(topGeo(rect(-HX, -HZ, HX, HZ), 0)));
  const walls = new Bins();
  walls.add('adobe', wallGeo(rect(-HX - R, -HZ - R, HX + R, HZ + R), 0.18, -DROP - 0.05, true));
  // 矮沿（四边，大门那里断开）
  const curb = new Bins();
  const ch = 0.18;
  curb.add('cap', box(LOT_W * TILE + 2 * R, ch, R, 0, 0, -HZ - R / 2));
  curb.add('cap', box(R, ch, LOT_D * TILE + 2 * R, -HX - R / 2, 0, 0));
  curb.add('cap', box(R, ch, LOT_D * TILE + 2 * R, HX + R / 2, 0, 0));
  const gx0 = GATE_X - TILE;
  const gx1 = GATE_X + TILE;
  curb.add('cap', box(gx0 + HX + R, ch, R, (-HX - R + gx0) / 2, 0, HZ + R / 2));
  curb.add('cap', box(HX + R - gx1, ch, R, (HX + R + gx1) / 2, 0, HZ + R / 2));
  root.add(tops.build(ctx, 'lot-top', { cast: false }));
  root.add(walls.build(ctx, 'lot-wall', { cast: false }));
  root.add(curb.build(ctx, 'lot-curb'));

  // ── 大门：两根土坯柱 + 横梁 + 招牌 ──
  const gate = new Bins();
  const ph = 3.4;
  for (const sx of [-1, 1]) {
    const x = GATE_X + sx * (TILE + 0.45);
    gate.add('adobe', box(0.9, ph, 0.9, x, 0, GATE_Z + 0.1));
    gate.add('cap', box(1.1, 0.25, 1.1, x, ph, GATE_Z + 0.1));
  }
  gate.add('timber', box(2 * TILE + 1.6, 0.35, 0.4, GATE_X, ph - 0.6, GATE_Z + 0.1));
  gate.add('signBoard', box(3.6, 0.9, 0.18, GATE_X, ph - 0.5, GATE_Z + 0.35));
  root.add(gate.build(ctx, 'gate'));

  // ── 路：画面下沿进来，最后一段坡上地块 ──
  const road = new Bins();
  const z0 = RAMP_Z0 + 0.4;
  const ramp = RAMP - 0.4;
  road.add(
    'flagstone',
    pn(topGeo(rect(GATE_X - ROAD_HALF, z0 + ramp, GATE_X + ROAD_HALF, ROAD_FAR + 120), -DROP + 0.02)),
  );
  const rg = new THREE.BufferGeometry();
  const xa = GATE_X - ROAD_HALF;
  const xb = GATE_X + ROAD_HALF;
  const ny = ramp / Math.hypot(ramp, DROP);
  const nz = DROP / Math.hypot(ramp, DROP);
  rg.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [
        xa,
        0.01,
        z0 - 0.4,
        xb,
        0.01,
        z0 - 0.4,
        xa,
        -DROP + 0.02,
        z0 + ramp,
        xb,
        0.01,
        z0 - 0.4,
        xb,
        -DROP + 0.02,
        z0 + ramp,
        xa,
        -DROP + 0.02,
        z0 + ramp,
      ],
      3,
    ),
  );
  rg.setAttribute('normal', new THREE.Float32BufferAttribute(Array.from({ length: 6 }, () => [0, ny, nz]).flat(), 3));
  road.add('flagstone', rg);
  root.add(road.build(ctx, 'road', { cast: false }));

  // ── 四周沙漠里撒一点植物、石头（种子随机） ──
  const deco = ['creosote', 'barrel-cactus', 'rocks', 'agave', 'brittlebush', 'ocotillo', 'creosote', 'rocks'];
  for (let i = 0; i < 46; i++) {
    const a = rng() * Math.PI * 2;
    const x = Math.cos(a) * (HX + 4 + rng() * 26);
    const z = Math.sin(a) * (HZ + 4 + rng() * 22);
    if (Math.abs(x) < HX + 2 && Math.abs(z) < HZ + 2) continue;
    if (Math.abs(x - GATE_X) < ROAD_HALF + 1.5 && z > HZ) continue;
    const id = deco[Math.floor(rng() * deco.length)];
    const b = REUSED[id];
    if (!b) continue;
    const o = b({ ...ctx, variant: Math.floor(rng() * 3) } as unknown as Parameters<typeof b>[0]);
    o.position.set(x, -DROP, z);
    o.rotation.y = rng() * Math.PI * 2;
    root.add(o);
  }

  // ── 网格线（FX 图层：不描边；建造模式才显示） ──
  const lines: number[] = [];
  const y = 0.03;
  for (let i = 0; i <= LOT_W; i++) lines.push(-HX + i * TILE, y, -HZ, -HX + i * TILE, y, HZ);
  for (let j = 0; j <= LOT_D; j++) lines.push(-HX, y, -HZ + j * TILE, HX, y, -HZ + j * TILE);
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
  const grid = new THREE.LineSegments(
    lg,
    new THREE.LineBasicMaterial({ color: 0xc89a6e, transparent: true, opacity: 0.85, depthWrite: false }),
  );
  grid.layers.set(1);
  grid.renderOrder = 2;
  grid.visible = false;
  grid.name = 'grid';
  root.add(grid);

  return { root, grid, mountains };
}

/** 步道：所有步道格的顶面合成一个网格（比地块高一点点，陶砖铺地）。tiles 变了就重建 */
export function buildPaths(ctx: AssetCtx, tiles: [number, number][]): THREE.Object3D {
  const g = new THREE.Group();
  g.name = 'paths';
  const all = [...tiles, ...GATE_COLS.map((c) => [c, GATE_ROW] as [number, number])];
  const parts: G[] = [];
  const h = TILE / 2;
  for (const [c, r] of all) {
    const [x, z] = tileCenter(c, r);
    parts.push(
      pn(
        topGeo(
          [
            [x - h, z - h],
            [x + h, z - h],
            [x + h, z + h],
            [x - h, z + h],
          ],
          0.04,
        ),
      ),
    );
  }
  if (parts.length) {
    const mesh = new THREE.Mesh(mergeGeometries(parts.map((p) => p.toNonIndexed())), ctx.mat('tile'));
    ctx.mats.prepare(mesh, { cast: false });
    g.add(mesh);
  }
  return g;
}

import * as THREE from 'three';
import { pen } from '../../props/court';
import { VoxelBatcher } from '../../voxel/batcher';
import { sign } from '../../voxel/text';
import { type BuildContext, jit, sr } from '../../world/build-context';
import type { CourtFrame } from '../../world/frame';
import {
  CLUBHOUSE,
  DRIVE,
  F_O1,
  F_O2,
  F_O3,
  F_P1,
  F_P2,
  FOUNTAIN,
  GATE,
  GOLF,
  GROUNDS,
  LAWN,
  LOT_N,
  LOT_S,
  PATHS,
  PICKLE,
  PLAZA,
  POOL,
  POOL_DECK,
  SITE,
  STAD,
  TERRACE,
} from './layout';

/**
 * Palm Oasis Racquet Club 的静态场景（2026-11-02，照参考图重排，ADR 0018）。
 * 静态部分是"荒了但看得出原样"的底子：沙漠台地、高尔夫、围墙、大门、停车场、步道、
 * 中心球场的看台、会所的房子、泳池和喷泉的池子、各块场地的围网、灯杆。
 * 各设施开局的破败和修好以后的样子（场地面、水、活的棕榈、绿草、亮灯）在 overlays.ts 里按状态显示。
 *
 * 不投阴影（参考图的画法）：层次靠方块的明暗抖色。
 */

export const PAL = {
  desert: ['#cfae80', '#d6b688', '#c8a676', '#dcbd90', '#c4a272', '#d2b284'],
  sand: ['#dcbb8a', '#d3b07e', '#e3c697'],
  deadGrass: ['#b5a66b', '#a99c5f', '#9d9358', '#bcae78'],
  liveGrass: ['#5f9a4a', '#66a14f', '#5a9446', '#63a04c'],
  golf: ['#5fa548', '#69ae50'],
  dg: ['#d9c4a0', '#d2bc96', '#dfcaa6', '#cdb790'],
  deck: ['#ecdfc6', '#e6d8bc', '#f0e4cc'],
  asphalt: ['#5f5e5a', '#64635e'],
  drive: ['#6b6a66', '#706f6a', '#66655f'],
  /** 硬地场：紫色内场、深绿外圈；红土；匹克球蓝 */
  purple: ['#4b4f9e', '#4f53a3', '#474b98'],
  dkGreen: ['#2e5b3e', '#315f41', '#2b563b'],
  clay: ['#c8643c', '#c25e38', '#cd6a42'],
  pickle: ['#3f7fb0', '#4384b5', '#3b7aab'],
  /** 褪色、开裂的旧场地 */
  courtInWorn: '#8a8aa0',
  courtOutWorn: '#7f8c80',
  clayWorn: '#b98f72',
  boug: ['#d6337a', '#e04a8a', '#c22a6a', '#e86aa0'],
  stucco: '#efe6d6',
  stucco2: '#ece2d0',
  tile: ['#b8573a', '#c4643f'],
  stand: ['#e6dccb', '#ddd2bf'],
  navy: '#1d2f4f',
  champ: '#d8c08a',
  wall: '#e9dcc4',
  coping: '#c49a6a',
  dead: ['#8a7a52', '#7d6e4a', '#9a8a5e'],
  palm: ['#5d8f3a', '#6a9a42', '#4f8032', '#78a64a'],
  trunk: '#8a6a4a',
  rock: ['#a58668', '#8c6852', '#b99376'],
  slab: ['#c49a6a', '#a87c56', '#8a6448'],
} as const;

export const pickc = (ctx: BuildContext, xs: readonly string[]) => xs[Math.floor(ctx.rand() * xs.length)] as string;

type Rect = { readonly x0: number; readonly x1: number; readonly z0: number; readonly z1: number };
export const inRect = (r: Rect, x: number, z: number, m = 0) =>
  x >= r.x0 - m && x <= r.x1 + m && z >= r.z0 - m && z <= r.z1 + m;

/** 一片方块地面：顶面在 yTop，每格 size 米，颜色从 cols 里随机挑再抖一点 */
export function tile(
  vb: VoxelBatcher,
  ctx: BuildContext,
  r: Rect,
  cols: readonly string[],
  yTop: number,
  size = 2,
  skip?: (x: number, z: number) => boolean,
): void {
  for (let x = r.x0; x < r.x1 - 1e-6; x += size)
    for (let z = r.z0; z < r.z1 - 1e-6; z += size) {
      const w = Math.min(size, r.x1 - x);
      const d = Math.min(size, r.z1 - z);
      const col = jit(ctx, pickc(ctx, cols), 0.025);
      if (skip?.(x + w / 2, z + d / 2)) continue;
      vb.box(x + w / 2, yTop - 0.06, z + d / 2, w, 0.06, d, col);
    }
}

/** 一块沙堆：几层越往上越小的扁盒 */
export function sandPile(ctx: BuildContext, x: number, y: number, z: number, r: number): void {
  for (let k = 0; k < 3; k++) {
    const s = r * (1 - k * 0.3);
    ctx.flat.box(
      x + sr(ctx, -0.3, 0.3),
      y + k * 0.14,
      z + sr(ctx, -0.3, 0.3),
      s * sr(ctx, 1.4, 2),
      0.16,
      s * sr(ctx, 0.8, 1.2),
      jit(ctx, pickc(ctx, PAL.sand), 0.03),
      sr(ctx, 0, 3.14),
    );
  }
}

/** 风滚草：一团乱枝 */
export function tumbleweed(ctx: BuildContext, x: number, y: number, z: number, s = 1): void {
  for (let k = 0; k < 7; k++)
    ctx.solid.box(
      x + sr(ctx, -0.35, 0.35) * s,
      y + sr(ctx, 0, 0.5) * s,
      z + sr(ctx, -0.35, 0.35) * s,
      0.5 * s,
      0.12 * s,
      0.12 * s,
      jit(ctx, pickc(ctx, PAL.dead), 0.06),
      sr(ctx, 0, 3.14),
      sr(ctx, 0, 3.14),
      sr(ctx, 0, 3.14),
    );
}

export type PalmKind = 'ok' | 'dead' | 'snap';

/** 棕榈树（参考图的扇形叶）：ok 是活的；dead 是一圈垂下来的干叶裙；snap 是断了头，树冠躺在地上 */
export function palm(ctx: BuildContext, x: number, z: number, h: number, kind: PalmKind): void {
  const top = kind === 'snap' ? h * 0.45 : h;
  const lean = sr(ctx, 0.2, 0.9);
  const la = sr(ctx, 0, 6.28);
  const n = Math.ceil(top);
  for (let i = 0; i < n; i++) {
    const u = i / n;
    const w = 0.42 - u * 0.1;
    ctx.solid.box(
      x + Math.cos(la) * lean * u * u,
      i,
      z + Math.sin(la) * lean * u * u,
      w,
      1.02,
      w,
      jit(ctx, PAL.trunk, 0.06),
    );
  }
  const tx = x + Math.cos(la) * lean;
  const tz = z + Math.sin(la) * lean;
  if (kind === 'snap') {
    ctx.solid.box(tx, top, tz, 0.3, 0.5, 0.2, jit(ctx, '#a08a68', 0.05), 0.4);
    const a = sr(ctx, 0, 6.28);
    ctx.solid.box(x + Math.cos(a) * 3, 0, z + Math.sin(a) * 3, 0.4, 0.4, h * 0.5, jit(ctx, PAL.trunk, 0.05), a);
    for (let k = 0; k < 4; k++)
      ctx.solid.box(
        x + Math.cos(a) * (3 + h * 0.25),
        0.1,
        z + Math.sin(a) * (3 + h * 0.25),
        0.3,
        0.1,
        2.2,
        jit(ctx, pickc(ctx, PAL.dead), 0.05),
        a + k * 0.8,
      );
    return;
  }
  const fronds = kind === 'dead' ? 9 : 10;
  for (let k = 0; k < fronds; k++) {
    const a = (k / fronds) * Math.PI * 2 + sr(ctx, -0.2, 0.2);
    const col = jit(ctx, pickc(ctx, kind === 'dead' ? PAL.dead : PAL.palm), 0.05);
    if (kind === 'dead') {
      const droop = sr(ctx, 0.5, 1.1);
      ctx.solid.box(tx + Math.sin(a) * 0.8, top - 0.1, tz + Math.cos(a) * 0.8, 0.34, 0.1, 1.8, col, a, droop);
      if (k % 3 === 0)
        ctx.solid.box(tx + Math.sin(a) * 0.5, top - 1.8, tz + Math.cos(a) * 0.5, 0.3, 1.6, 0.18, col, a, 0.15);
    } else {
      ctx.solid.box(tx + Math.sin(a) * 0.9, top + 0.1, tz + Math.cos(a) * 0.9, 0.5, 0.12, 2, col, a, -0.18);
      ctx.solid.box(tx + Math.sin(a) * 2.3, top - 0.3, tz + Math.cos(a) * 2.3, 0.7, 0.1, 1.5, col, a, 0.42);
    }
  }
  if (kind === 'dead') ctx.solid.box(tx, top - 1.6, tz, 1.1, 1.7, 1.1, jit(ctx, '#9a8558', 0.05));
  else ctx.solid.box(tx, top - 0.4, tz, 0.7, 0.6, 0.7, jit(ctx, '#6d5a3c', 0.05));
}

/** 三角梅：一簇粉红的小方块 */
export function boug(ctx: BuildContext, x: number, y: number, z: number, n = 8, spread = 1): void {
  for (let k = 0; k < n; k++)
    ctx.solid.box(
      x + sr(ctx, -spread, spread),
      y + sr(ctx, -0.6, 0.6),
      z + sr(ctx, -spread, spread),
      sr(ctx, 0.25, 0.45),
      sr(ctx, 0.25, 0.45),
      sr(ctx, 0.25, 0.45),
      jit(ctx, pickc(ctx, PAL.boug), 0.04),
    );
}

/** 遮阳伞 */
export function umbrella(ctx: BuildContext, x: number, z: number, c1: string, c2: string, h = 2.4, r = 1.3): void {
  ctx.solid.box(x, 0, z, 0.07, h, 0.07, '#d8d4cc');
  for (let k = 0; k < 4; k++) {
    const s = r * 2 * (1 - k * 0.22);
    ctx.solid.box(x, h - 0.1 + k * 0.1, z, s, 0.1, s, k % 2 ? c2 : c1);
  }
}

/** 长椅 */
export function bench(ctx: BuildContext, x: number, z: number, len: number, ry = 0): void {
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  for (const u of [-len / 2 + 0.15, len / 2 - 0.15])
    ctx.solid.box(x + u * c, 0, z - u * s, 0.08, 0.42, 0.4, '#2a2f36', ry);
  ctx.solid.box(x, 0.42, z, len, 0.06, 0.42, '#c9a86a', ry);
}

/** 一辆车 */
export function car(ctx: BuildContext, x: number, z: number, body: string): void {
  ctx.solid.box(x, 0.25, z, 1.8, 0.55, 4.2, body);
  ctx.solid.box(x, 0.8, z + 0.2, 1.6, 0.5, 2.2, '#2c3a44');
  ctx.solid.box(x, 0.8, z + 0.2, 1.62, 0.08, 2.3, body);
  for (const [u, v] of [
    [0.85, 1.3],
    [-0.85, 1.3],
    [0.85, -1.3],
    [-0.85, -1.3],
  ] as const)
    ctx.solid.box(x + u, 0, z + v, 0.28, 0.6, 0.6, '#151515');
}

/** 一棵橡树，枝上挂一圈灯泡（灯泡进 lamp 批次，夜里亮） */
function oak(ctx: BuildContext, lamp: VoxelBatcher, x: number, z: number, s: number): void {
  ctx.solid.box(x, 0, z, 0.7 * s, 2.6 * s, 0.7 * s, '#5a4632');
  for (let k = 0; k < 26; k++) {
    const an = sr(ctx, 0, 6.28);
    const r = sr(ctx, 0, 2.8) * s;
    ctx.solid.box(
      x + Math.cos(an) * r,
      2.4 * s + sr(ctx, 0, 1.6) * s,
      z + Math.sin(an) * r,
      sr(ctx, 0.9, 1.4) * s,
      sr(ctx, 0.7, 1.1) * s,
      sr(ctx, 0.9, 1.4) * s,
      jit(ctx, pickc(ctx, ['#4f6a3a', '#5a7440', '#465f34']), 0.04),
    );
  }
  for (let k = 0; k < 10; k++) {
    const an = (k / 10) * 6.28;
    lamp.box(x + Math.cos(an) * 3 * s, 2.2 * s, z + Math.sin(an) * 3 * s, 0.14, 0.14, 0.14, '#ffe6a0');
  }
}

/** 灯杆：灯头进 lamp 批次 */
function lightPost(ctx: BuildContext, lamp: VoxelBatcher, x: number, z: number, h = 7): void {
  ctx.solid.box(x, 0, z, 0.2, h, 0.2, '#3a4048');
  ctx.solid.box(x, h, z, 0.9, 0.3, 0.5, '#2a2f36');
  lamp.box(x, h - 0.06, z, 0.8, 0.08, 0.42, '#fff2c8');
}

/* ---------------- 底子：沙漠台地、高尔夫、俱乐部的地面和步道 ---------------- */

function ground(ctx: BuildContext): void {
  // 台地外沿到 SITE；四边是一层层的砂岩，转到哪个角度都不会露出纸一样薄的边
  const tex = document.createElement('canvas');
  tex.width = tex.height = 64;
  const g = tex.getContext('2d');
  if (g)
    for (let i = 0; i < 64; i++)
      for (let j = 0; j < 64; j++) {
        g.fillStyle = pickc(ctx, PAL.desert);
        g.fillRect(i, j, 1, 1);
      }
  const t = new THREE.CanvasTexture(tex);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  const W = SITE.x1 - SITE.x0;
  const D = SITE.z1 - SITE.z0;
  t.repeat.set(W / 32, D / 32);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshLambertMaterial({ map: t }));
  m.rotation.x = -Math.PI / 2;
  m.position.set((SITE.x0 + SITE.x1) / 2, -0.001, (SITE.z0 + SITE.z1) / 2);
  ctx.scene.add(m);
  const bands = [
    [0, -1.2, PAL.slab[0]],
    [-1.2, -3, PAL.slab[1]],
    [-3, -5.5, PAL.slab[2]],
  ] as const;
  const { x0, x1, z0, z1 } = SITE;
  for (const [y1, y0, col] of bands) {
    const h = y1 - y0;
    for (let x = x0; x < x1; x += 4) {
      ctx.solid.box(x + 2, y0, z0 + 0.1, 4, h, 0.3, jit(ctx, col, 0.05));
      ctx.solid.box(x + 2, y0, z1 - 0.1, 4, h, 0.3, jit(ctx, col, 0.05));
    }
    for (let z = z0; z < z1; z += 4) {
      ctx.solid.box(x0 + 0.1, y0, z + 2, 0.3, h, 4, jit(ctx, col, 0.05));
      ctx.solid.box(x1 - 0.1, y0, z + 2, 0.3, h, 4, jit(ctx, col, 0.05));
    }
  }
  ctx.solid.box((x0 + x1) / 2, -5.5, (z0 + z1) / 2, x1 - x0 - 0.4, 5.45, z1 - z0 - 0.4, '#7a5a40');

  // 南墙外的高尔夫：一格格深浅相间的球道、沙坑、果岭和旗
  for (let x = GOLF.x0; x < GOLF.x1; x += 2)
    for (let z = GOLF.z0; z < GOLF.z1; z += 2)
      ctx.flat.box(
        x + 1,
        -0.04,
        z + 1,
        2,
        0.06,
        2,
        jit(ctx, PAL.golf[Math.floor((x + z) / 8) % 2 ? 0 : 1] as string, 0.025),
      );
  for (let k = 0; k < 26; k++) {
    const an = (k / 26) * Math.PI * 2;
    ctx.flat.box(
      18 + Math.cos(an) * sr(ctx, 2, 3.5),
      0.0,
      63 + Math.sin(an) * sr(ctx, 1.4, 2.4),
      1,
      0.05,
      1,
      '#e8d8b0',
    );
  }
  for (let k = 0; k < 30; k++) {
    const an = (k / 30) * Math.PI * 2;
    ctx.flat.box(-20 + Math.cos(an) * 4, 0, 64 + Math.sin(an) * 3, 1, 0.04, 1, '#7ab85e');
  }
  ctx.solid.box(-20, 0, 64, 0.05, 2.4, 0.05, '#f4efe4');
  ctx.solid.box(-19.7, 2, 64, 0.6, 0.4, 0.03, '#d84a3a');

  // 围墙里：荒了十年的草地（修好的地方在覆盖层里换成绿草）
  tile(ctx.flat, ctx, GROUNDS, PAL.deadGrass, 0.02, 2);
  // 步道（碎花岗岩）
  for (const p of PATHS) tile(ctx.flat, ctx, p, PAL.dg, 0.04, 2);
}

/** 围墙：米色灰泥、陶色压顶；东墙正中留门 */
function walls(ctx: BuildContext): void {
  const { x0, x1, z0, z1 } = GROUNDS;
  const seg = (ax: number, az: number, bx: number, bz: number) => {
    const along = Math.abs(bx - ax) > Math.abs(bz - az);
    const len = Math.hypot(bx - ax, bz - az);
    ctx.solid.box((ax + bx) / 2, 0, (az + bz) / 2, along ? len : 0.5, 1.3, along ? 0.5 : len, PAL.wall);
    ctx.solid.box(
      (ax + bx) / 2,
      1.3,
      (az + bz) / 2,
      along ? len + 0.1 : 0.6,
      0.12,
      along ? 0.6 : len + 0.1,
      PAL.coping,
    );
  };
  seg(x0, z0, x1, z0);
  seg(x0, z1, x1, z1);
  seg(x0, z0, x0, z1);
  seg(x1, z0, x1, GATE.z0);
  seg(x1, GATE.z1, x1, z1);
}

/** 大门：树篱拱门和招牌；门外代客泊车的车道、两片停车场、两排棕榈 */
function entrance(ctx: BuildContext, lamp: VoxelBatcher): void {
  const x = GATE.x + 0.5;
  for (const s of [-1, 1]) {
    ctx.solid.box(x, 0, s * 5, 1.2, 4.6, 1.2, jit(ctx, '#3f6a3a', 0.05));
    ctx.solid.box(x, 4.6, s * 5, 1.4, 0.3, 1.4, '#355e32');
  }
  ctx.solid.box(x, 4.6, 0, 1.2, 1.1, 11.2, jit(ctx, '#3f6a3a', 0.05));
  sign(ctx.scene, 'WELCOME TO PALM OASIS', 8.4, 0.7, x + 0.62, 4.9, 0, Math.PI / 2, PAL.navy, PAL.champ, 22);
  tile(ctx.flat, ctx, DRIVE, PAL.drive, 0.04, 2);
  tile(ctx.flat, ctx, LOT_N, PAL.asphalt, 0.02, 2);
  tile(ctx.flat, ctx, LOT_S, PAL.asphalt, 0.02, 2);
  for (let lx = 66; lx <= 86; lx += 4) {
    ctx.flat.box(lx, 0.02, -23, 0.12, 0.02, 6, '#e8e4d8');
    ctx.flat.box(lx, 0.02, 23, 0.12, 0.02, 6, '#e8e4d8');
  }
  for (let lx = 64; lx <= 88; lx += 6) {
    palm(ctx, lx, -5.2, sr(ctx, 9, 11), 'ok');
    palm(ctx, lx, 5.2, sr(ctx, 9, 11), 'ok');
  }
  for (const [cx, cz, c] of [
    [67, -23, '#111317'],
    [75, -23, '#9aa3aa'],
    [83, -23, PAL.navy],
    [71, 23, '#f2f2f0'],
    [83, 23, '#7a1f2a'],
  ] as const)
    car(ctx, cx, cz, c);
  // 代客泊车的小亭
  ctx.solid.box(63.5, 0, -6.4, 1.2, 1.1, 0.7, PAL.navy);
  umbrella(ctx, 63.5, -6.4, '#f4efe4', PAL.navy, 2.4, 1);
  for (const lz of [-16, 16]) lightPost(ctx, lamp, 89, lz, 6);
}

/* ---------------- 中心球场：北边高看台、南边低看台（中间留球员通道）、东头一段 ---------------- */

function stadium(ctx: BuildContext, lamp: VoxelBatcher): void {
  const { cx, cz } = STAD;
  for (let r = 0; r < 8; r++) {
    const y = 0.55 * (r + 1);
    const z = cz - 9.6 - r * 0.95;
    ctx.solid.box(cx, 0, z, 38, y, 0.95, jit(ctx, PAL.stand[r % 2] as string, 0.015));
    ctx.solid.box(cx, y, z + 0.42, 38, 0.06, 0.1, PAL.navy);
  }
  // 南看台两段，中间是球员通道（步道从这里进场）
  for (const side of [-1, 1])
    for (let r = 0; r < 2; r++) {
      const y = 0.45 * (r + 1);
      const z = cz + 9.6 + r * 0.9;
      ctx.solid.box(cx + side * 10.75, 0, z, 17.5, y, 0.9, jit(ctx, PAL.stand[1], 0.015));
    }
  for (let r = 0; r < 3; r++) {
    const y = 0.5 * (r + 1);
    const x = cx + 18.7 + r * 0.9;
    ctx.solid.box(x, 0, cz, 0.9, y, 19, jit(ctx, PAL.stand[1], 0.015));
  }
  ctx.solid.box(cx, 0, cz - 9.25, 38, 1, 0.2, PAL.navy);
  // 北看台上面的遮阳棚骨架（修好以后在覆盖层里挂上遮阳布）
  for (const x of [-15, -5, 5, 15]) ctx.solid.box(cx + x, 0, cz - 18.2, 0.3, 9.5, 0.3, '#e8e2d4');
  // 西头的大屏骨架
  ctx.solid.box(cx - 19.5, 0, cz, 0.6, 5.5, 0.6, '#3a4048');
  for (const [lx, lz] of [
    [-19, -9],
    [19, -9],
    [-19, 9],
    [21.5, 9.5],
  ] as const)
    lightPost(ctx, lamp, cx + lx, cz + lz, 9);
}

/* ---------------- 会所：西班牙复兴式的房子、红瓦屋顶；露台的地面和栏杆 ---------------- */

function clubhouse(ctx: BuildContext): void {
  const { x0, x1, z0, z1 } = CLUBHOUSE;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  ctx.solid.box(cx, 0, cz, x1 - x0, 4.2, z1 - z0, PAL.stucco);
  ctx.solid.box(cx - 3, 4.2, cz, x1 - x0 - 6, 3.6, z1 - z0 - 4, PAL.stucco2);
  const roof = (xa: number, xb: number, za: number, zb: number, y: number, n: number) => {
    for (let k = 0; k < n; k++) {
      const ins = k * 0.9;
      ctx.solid.box(
        (xa + xb) / 2,
        y + k * 0.42,
        (za + zb) / 2,
        xb - xa + 0.8 - ins * 2,
        0.42,
        zb - za + 0.8 - ins * 2,
        jit(ctx, PAL.tile[k % 2] as string, 0.03),
      );
    }
  };
  roof(x0, x1, z0, z1, 4.2, 2);
  roof(x0, x1 - 6, z0 + 2, z1 - 2, 7.8, 4);
  // 东立面：拱门的框（玻璃在覆盖层：开局钉着木板，修好了亮灯）
  for (let z = z0 + 2; z < z1 - 1; z += 3.2) {
    ctx.solid.box(x1 + 0.06, 0, z + 1.4, 0.14, 2.8, 2, '#2a3440');
    ctx.solid.box(x1 + 0.08, 2.8, z + 1.4, 0.16, 0.5, 1.4, PAL.stucco);
  }
  // 露台：铺地和栏杆
  tile(ctx.flat, ctx, TERRACE, ['#e8dcc4', '#e2d5ba', '#ece0ca'], 0.05, 1);
  for (let z = TERRACE.z0; z <= TERRACE.z1; z += 1.5) ctx.solid.box(TERRACE.x1, 0, z, 0.08, 1, 0.08, '#2a2f36');
  ctx.solid.box(TERRACE.x1, 1, (TERRACE.z0 + TERRACE.z1) / 2, 0.1, 0.08, TERRACE.z1 - TERRACE.z0, '#2a2f36');
}

/* ---------------- 泳池和喷泉：池畔、池壁（水在覆盖层） ---------------- */

function poolDeck(ctx: BuildContext): void {
  tile(ctx.flat, ctx, POOL_DECK, PAL.deck, 0.05, 1, (x, z) => inRect(POOL, x, z, -0.01));
  const { x0, x1, z0, z1 } = POOL;
  // 池底（空的，和池畔一样高：地面是平的）和一圈凸起的池沿
  for (let x = x0; x < x1; x++)
    for (let z = z0; z < z1; z++) ctx.flat.box(x + 0.5, 0, z + 0.5, 1, 0.055, 1, jit(ctx, '#9fb4bc', 0.04));
  for (let x = x0; x < x1; x++) {
    ctx.solid.box(x + 0.5, 0, z0 - 0.15, 1, 0.22, 0.3, '#f6f2e8');
    ctx.solid.box(x + 0.5, 0, z1 + 0.15, 1, 0.22, 0.3, '#f6f2e8');
  }
  for (let z = z0; z < z1; z++) {
    ctx.solid.box(x0 - 0.15, 0, z + 0.5, 0.3, 0.22, 1, '#f6f2e8');
    ctx.solid.box(x1 + 0.15, 0, z + 0.5, 0.3, 0.22, 1, '#f6f2e8');
  }
  // 救生员椅
  ctx.solid.box(x1 + 1, 0, 8, 0.8, 1.8, 0.8, '#f4efe4');
  ctx.solid.box(x1 + 1, 1.8, 8, 1, 0.1, 1, '#d84a3a');
}

function fountainPlaza(ctx: BuildContext): void {
  tile(ctx.flat, ctx, PLAZA, PAL.dg, 0.05, 2);
  const { x, z } = FOUNTAIN;
  for (let k = 0; k < 28; k++) {
    const an = (k / 28) * Math.PI * 2;
    ctx.solid.box(x + Math.cos(an) * 4.2, 0, z + Math.sin(an) * 4.2, 1, 0.6, 0.6, jit(ctx, '#e2d6bf', 0.03), -an);
  }
  // 池底
  for (let i = -4; i < 4; i++)
    for (let j = -4; j < 4; j++)
      if (Math.hypot(i + 0.5, j + 0.5) < 4)
        ctx.flat.box(x + i + 0.5, 0.02, z + j + 0.5, 1, 0.06, 1, jit(ctx, '#c9bda4', 0.03));
  ctx.solid.box(x, 0, z, 1.4, 1.3, 1.4, '#e2d6bf');
  ctx.solid.box(x, 1.3, z, 2.4, 0.2, 2.4, '#e2d6bf');
  ctx.solid.box(x, 1.5, z, 0.6, 0.9, 0.6, '#e2d6bf');
  ctx.solid.box(x, 2.4, z, 1.2, 0.16, 1.2, '#e2d6bf');
  bench(ctx, x - 6, z + 2, 2.2, Math.PI / 2);
  bench(ctx, x + 6, z - 2, 2.2, Math.PI / 2);
}

/* ---------------- 球场的围网（深绿）、匹克球的围网、灯杆 ---------------- */

function fences(ctx: BuildContext, lamp: VoxelBatcher): void {
  const courts: [CourtFrame, number[]][] = [
    [F_P1, [3, 9]],
    [F_P2, [5]],
    [F_O1, [2, 11]],
    [F_O2, [7]],
    [F_O3, [4, 12]],
  ];
  for (const [fr, holes] of courts) {
    pen(ctx, fr, { gate: 'N', holes, lean: 0.25, col: '#2b3a30', H: 3.4 });
    for (const [lx, lz] of [
      [-fr.hx, -fr.hz],
      [fr.hx, fr.hz],
    ] as const) {
      const p = fr.w({ x: lx, z: lz });
      lightPost(ctx, lamp, p.x, p.z, 7);
    }
  }
  // 匹克球：一个围起来的场子
  const fr = { x0: PICKLE.x0, x1: PICKLE.x1, z0: PICKLE.z0, z1: PICKLE.z1 };
  for (const [ax, az, bx, bz] of [
    [fr.x0, fr.z0, fr.x1, fr.z0],
    [fr.x0, fr.z1, fr.x1, fr.z1],
    [fr.x1, fr.z0, fr.x1, fr.z1],
  ] as const) {
    const along = Math.abs(bx - ax) > Math.abs(bz - az);
    const len = Math.hypot(bx - ax, bz - az);
    for (let u = 0; u <= len; u += 3) {
      const px = along ? ax + u : ax;
      const pz = along ? az : az + u;
      ctx.solid.box(px, 0, pz, 0.1, 2.6, 0.1, '#2b3a30');
    }
    ctx.solid.box((ax + bx) / 2, 2.5, (az + bz) / 2, along ? len : 0.08, 0.08, along ? 0.08 : len, '#2b3a30');
    ctx.solid.box((ax + bx) / 2, 0, (az + bz) / 2, along ? len : 0.06, 1.1, along ? 0.06 : len, '#24402e');
  }
  sign(ctx.scene, 'PICKLEBALL', 3.4, 0.45, 44, 1, fr.z0 - 0.08, 0, '#1f3a2a', '#9fe08a', 16);
}

/* ---------------- 景观：长廊棕榈、球员草坪的橡树、墙外的沙漠 ---------------- */

function landscape(ctx: BuildContext, lamp: VoxelBatcher): void {
  // 长廊两边的花坛和棕榈（一半活着、一半枯了，修好了也不换：沙漠里的老树）
  for (let x = -30; x <= 56; x += 8) {
    if (Math.abs(x) < 2) continue;
    ctx.solid.box(x, 0, -4.2, 1.2, 0.5, 1.2, '#e2d6bf');
    palm(ctx, x, -4.2, sr(ctx, 9, 12), ctx.rand() < 0.5 ? 'ok' : 'dead');
  }
  oak(ctx, lamp, 39.5, 32, 0.9);
  oak(ctx, lamp, 54, 19, 0.85);
  oak(ctx, lamp, -29, -39.5, 1);
  // 球员草坪：只是景观（ADR 0018），草一直半黄不绿
  tile(ctx.flat, ctx, LAWN, ['#8fa25a', '#99a862', '#8a9d56'], 0.05, 1);
  // 墙外的沙漠：石头、龙舌兰、灌木、仙人掌、海枣
  for (let k = 0; k < 140; k++) {
    const x = sr(ctx, SITE.x0 + 2, SITE.x1 - 2);
    const z = sr(ctx, SITE.z0 + 2, SITE.z1 - 2);
    const r = ctx.rand();
    const s = sr(ctx, 0.6, 1.6);
    if (inRect(GROUNDS, x, z, 3) || inRect(GOLF, x, z, 1) || inRect({ x0: 60, x1: 92, z0: -28, z1: 28 }, x, z))
      continue;
    if (r < 0.3)
      for (let j = 0; j < 4; j++)
        ctx.solid.box(
          x + sr(ctx, -0.6, 0.6) * s,
          0,
          z + sr(ctx, -0.6, 0.6) * s,
          sr(ctx, 0.8, 1.6) * s,
          sr(ctx, 0.6, 1.4) * s,
          sr(ctx, 0.8, 1.6) * s,
          jit(ctx, pickc(ctx, PAL.rock), 0.05),
        );
    else if (r < 0.55)
      for (let j = 0; j < 8; j++) {
        const an = (j / 8) * Math.PI * 2;
        ctx.solid.box(x, 0, z, 0.18 * s, sr(ctx, 0.7, 1) * s, 0.06 * s, jit(ctx, '#7f9a8a', 0.05), an, 0.5);
      }
    else if (r < 0.8)
      ctx.solid.box(x, 0, z, 1.1 * s, 0.7 * s, 1 * s, jit(ctx, pickc(ctx, ['#8a8f5a', '#7f845a', '#9a9a62']), 0.07));
    else if (r < 0.9) {
      ctx.solid.box(x, 0, z, 0.5, 0.6, 0.5, '#5f8a4a');
      ctx.solid.box(x, 0.6, z, 0.4, 0.12, 0.4, '#e86a8a');
    } else palm(ctx, x, z, sr(ctx, 6, 9), 'ok');
  }
}

export interface IndianWellsStatic {
  /** 夜里亮的灯头和灯泡（MeshBasic，颜色随天色变） */
  lamps: THREE.Mesh;
}

export function buildIndianWells(ctx: BuildContext): IndianWellsStatic {
  const lamp = new VoxelBatcher();
  ground(ctx);
  walls(ctx);
  entrance(ctx, lamp);
  stadium(ctx, lamp);
  clubhouse(ctx);
  poolDeck(ctx);
  fountainPlaza(ctx);
  fences(ctx, lamp);
  landscape(ctx, lamp);
  ctx.flat.build(ctx.scene, false, true);
  ctx.solid.build(ctx.scene, false, true);
  const lamps = lamp.build(ctx.scene, false, false);
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, color: '#5a5a5a' });
  lamps.material = mat;
  // 一天的光（world/daylight.ts）按灯的亮度调颜色：白天是灰的灯罩，夜里是暖白
  const off = new THREE.Color('#5a5a5a');
  const on = new THREE.Color('#ffffff');
  const fns = (ctx.scene.userData.tdLamps ??= []) as ((v: number) => void)[];
  fns.push((v) => mat.color.copy(off).lerp(on, v));
  return { lamps };
}

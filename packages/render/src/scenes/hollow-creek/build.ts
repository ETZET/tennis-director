import { clamp, lerp, pick, type XYZ } from '@td/shared';
import * as THREE from 'three';
import { courtLines, frameSign, net, pen, surface, weed } from '../../props/court';
import { bareTree, LEAF_LITTER, sparseTree, stoneWall } from '../../props/landscape';
import { sign } from '../../voxel/text';
import { type BuildContext, cbox, jit, sr } from '../../world/build-context';
import { creekZ, DECK, FA, FB, FC, FD, LOT, MID, POOL, roadY, STAIRS, UP, XE, XW, ZB, ZL, ZU } from './layout';

/**
 * 构建 Hollow Creek 的静态场景。
 *
 * 顺序就是画面：每一步都从同一条种子随机流（种子 1974）取数，
 * 调换任意两步会让后面所有的石块、杂草、裂缝都变样。
 * 要加新东西，加在最后，或者给它单独一条随机流。
 */

const GRASS = ['#7d8448', '#858a4c', '#6f7a40', '#8a8350', '#7a7246', '#6b6a3c', '#91855a', '#6a7a3e'];
const TRASH = ['#b23a2c', '#c9c9c2', '#3b6ea8', '#e8e2d0', '#5c8a3a'];
const WILLOW = ['#8a8a4a', '#7a7d42', '#9a8c4e', '#6f7440'];

export interface HollowCreekStatic {
  /** 塌掉的气膜上三个最高的鼓包（乌鸦站的地方） */
  bubblePeaks: XYZ[];
}

export function buildHollowCreek(ctx: BuildContext): HollowCreekStatic {
  groundPlane(ctx);
  terrain(ctx);
  court1(ctx);
  court2(ctx);
  const bubblePeaks = bubbleCourt(ctx);
  clayCourt(ctx);
  clubhouse(ctx);
  creek(ctx);
  trees(ctx);
  daleChair(ctx);
  ctx.flat.build(ctx.scene, false, true);
  ctx.solid.build(ctx.scene, true, true);
  return { bubblePeaks };
}

/** 460×460 的草地底面，64×64 像素的随机草色贴图。 */
function groundPlane(ctx: BuildContext): void {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  for (let i = 0; i < 64; i++)
    for (let j = 0; j < 64; j++) {
      const col = pick(GRASS, ctx.rand);
      if (x) {
        x.fillStyle = col;
        x.fillRect(i, j, 1, 1);
      }
    }
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(460 / 32, 460 / 32);
  const g = new THREE.Mesh(new THREE.PlaneGeometry(460, 460), new THREE.MeshLambertMaterial({ map: tex }));
  g.rotation.x = -Math.PI / 2;
  g.receiveShadow = true;
  ctx.scene.add(g);
}

function body(ctx: BuildContext, x0: number, x1: number, z0: number, z1: number, h: number, col = '#6f5a42'): void {
  ctx.solid.box((x0 + x1) / 2, 0, (z0 + z1) / 2, x1 - x0, h, z1 - z0, col);
}

function grassTop(
  ctx: BuildContext,
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  y: number,
  skip?: (x: number, z: number) => boolean,
): void {
  for (let x = x0; x < x1; x += 2)
    for (let z = z0; z < z1; z += 2) {
      const cx = x + 1;
      const cz = z + 1;
      if (skip?.(cx, cz)) continue;
      ctx.flat.box(
        cx,
        y,
        cz,
        2,
        0.03,
        2,
        ctx.rand() < 0.12 ? jit(ctx, '#7a6548', 0.04) : jit(ctx, pick(GRASS, ctx.rand), 0.03),
      );
    }
}

/** 台地土方、草皮、挡土墙、楼梯、东侧坡道。 */
function terrain(ctx: BuildContext): void {
  const { solid, flat } = ctx;
  // 上层台地，绕开泳池挖出来
  body(ctx, XW, POOL.x0, ZB, ZU, UP);
  body(ctx, POOL.x1, XE, ZB, ZU, UP);
  body(ctx, POOL.x0, POOL.x1, ZB, POOL.z0, UP);
  body(ctx, POOL.x0, POOL.x1, POOL.z1, ZU, UP);
  body(ctx, POOL.x0, 10, POOL.z0, POOL.z1, 1.5, '#6c9fa3');
  body(ctx, 10, POOL.x1, POOL.z0, POOL.z1, 0.55, '#5f9095');
  body(ctx, XW, XE, ZU, ZL, MID);

  const inPool = (x: number, z: number) =>
    x > POOL.x0 - 0.5 && x < POOL.x1 + 0.5 && z > POOL.z0 - 0.5 && z < POOL.z1 + 0.5;
  grassTop(ctx, -50, XE, -58, ZU, UP, inPool);
  grassTop(ctx, -50, XE, ZU, ZL, MID, (x, z) => FA.inside(x, z, -0.5) || FB.inside(x, z, -0.5));

  // 挡土墙：干砌石带苔藓，下面那道塌了一段
  stoneWall(ctx, 'z', ZU + 0.15, XW, XE, MID, UP);
  stoneWall(ctx, 'z', ZL + 0.15, XW, XE, 0, MID, [7, 11.5]);
  stoneWall(ctx, 'x', XE + 0.15, ZB, ZU, 0, UP);
  stoneWall(ctx, 'x', XE + 0.15, ZU, ZL, 0, MID);
  for (let k = 0; k < 16; k++)
    solid.box(
      sr(ctx, 6.5, 12),
      0,
      ZL + sr(ctx, 0.4, 2.4),
      sr(ctx, 0.5, 1.1),
      sr(ctx, 0.3, 0.4),
      sr(ctx, 0.3, 0.6),
      jit(ctx, '#8b867b', 0.07),
      sr(ctx, 0, 3),
      sr(ctx, -0.3, 0.3),
      sr(ctx, -0.3, 0.3),
    );

  // 楼梯：俱乐部的脊梁
  for (const s of STAIRS) {
    for (let i = 0; i < 6; i++) {
      const top = lerp(s.y0, s.y1, (i + 1) / 6);
      if (top - s.y1 < 0.01) continue;
      solid.box(0, s.y1, s.z0 + 0.3 + i * 0.6, s.x1 - s.x0, top - s.y1, 0.6, jit(ctx, '#a39e92', 0.05));
    }
    solid.box(s.x0 - 0.1, s.y1, s.z0 + 1.8, 0.12, 0.0001 + Math.abs(s.y0 - s.y1), 3.6, '#8b867b');
    for (let i = 0; i < 4; i++)
      solid.box(s.x1 + 0.05, s.y1 + lerp(s.y0 - s.y1, 0, i / 4), s.z0 + 0.4 + i * 0.9, 0.06, 1.0, 0.06, '#5a5550');
    solid.box(s.x1 + 0.05, s.y1 + 0.95, s.z0 + 1.5, 0.06, 0.06, 2.8, '#5a5550', 0, Math.atan2(s.y0 - s.y1, 3.6) * 0.9);
  }

  // 东侧坡道，下山后过小溪
  for (let z = -31; z < 70; z += 1) {
    const y = roadY(z + 0.5);
    if (y > 0.02) solid.box(45, 0, z + 0.5, 6, y, 1, '#6f6a5f');
    flat.box(45, y, z + 0.5, 6, 0.04, 1, ctx.rand() < 0.07 ? jit(ctx, '#2f302e', 0.02) : jit(ctx, '#4c4d4b', 0.04));
    if (Math.round(z) % 4 === 0) flat.box(45, y + 0.041, z + 0.5, 0.12, 0.01, 2, '#b9a03a');
  }
  for (let x = 40; x < 45; x += 1)
    for (let z = -34; z < -26; z += 1) flat.box(x + 0.5, UP, z + 0.5, 1, 0.04, 1, jit(ctx, '#4c4d4b', 0.04));
}

/** 1 号场：最后一块网球场。褪色的公园蓝，下垂的网。 */
function court1(ctx: BuildContext): void {
  surface(ctx, FA, '#4f6a86', '#5a7562', { worn: 0.16, cracks: 7, weeds: 0.25, puddles: 1, missing: 0.12 });
  net(ctx, FA, 'sag');
  pen(ctx, FA, { gate: 'E', holes: [9], peel: 22 });
  frameSign(ctx, FA, 'HOLLOW CR EK  TENNIS', 10, 0.6, 0, 1.4, FA.hz + 0.03, '#2d3a33', '#a9a58c', 15);
}

/** 2 号场：租给匹克球。新胶带、新网、亮色横幅——钱现在流向这里。 */
function court2(ctx: BuildContext): void {
  surface(ctx, FB, '#4f6a86', '#5a7562', { worn: 0.1, cracks: 4, weeds: 0.1, puddles: 0, missing: 0.12 });
  // 匹克球场地胶带
  const L = 6.705;
  const W = 3.05;
  const K = 2.13;
  const y = FB.oy + 0.004;
  const c = '#f2d23a';
  const tape = (x0: number, z0: number, x1: number, z1: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const along = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    const p = FB.w({ x: (x0 + x1) / 2, z: (z0 + z1) / 2 });
    ctx.flat.box(p.x, y, p.z, along ? len : 0.09, 0.012, along ? 0.09 : len, c, FB.a);
  };
  tape(-L, -W, -L, W);
  tape(L, -W, L, W);
  tape(-L, -W, L, -W);
  tape(-L, W, L, W);
  tape(-K, -W, -K, W);
  tape(K, -W, K, W);
  tape(-L, 0, -K, 0);
  tape(K, 0, L, 0);
  for (let i = 0; i < 5; i++) {
    const p = FB.w({ x: -K + 0.3 + i * 0.95, z: -W + 0.2 });
    ctx.flat.box(p.x, y, p.z, 0.8, 0.012, 0.4, '#f2d23a', FB.a);
  }
  net(ctx, FB, 'new');
  pen(ctx, FB, { gate: 'W', lean: 0.05, col: '#4e5b52' });
  frameSign(ctx, FB, 'PICKLEBALL OPEN PLAY · $8/HR', 10, 0.7, 0, 1.4, FB.hz + 0.03, '#7fcf6a', '#1b2a14', 16);
  // 匹克球群的东西：折叠椅、冷藏箱、音箱
  const chairs = [
    [-8, FB.hz - 1.2],
    [-7, FB.hz - 1.1],
    [-6, FB.hz - 1.2],
  ] as const;
  const cols = ['#d65a8a', '#3aa0b5', '#f0a020'];
  chairs.forEach(([x, z], i) => {
    cbox(ctx, FB, x, 0, z, 0.55, 0.42, 0.5, cols[i] as string);
    cbox(ctx, FB, x, 0.42, z - 0.22, 0.55, 0.5, 0.06, cols[i] as string, 0, -0.2);
  });
  cbox(ctx, FB, -4.6, 0, FB.hz - 1.2, 0.6, 0.42, 0.42, '#e8e2d0');
  cbox(ctx, FB, -4.6, 0.42, FB.hz - 1.2, 0.62, 0.07, 0.44, '#c94c3a');
  cbox(ctx, FB, -3.6, 0, FB.hz - 1.0, 0.3, 0.4, 0.25, '#222');
  cbox(ctx, FB, -3.6, 0.12, FB.hz - 0.87, 0.18, 0.18, 0.02, '#7fcf6a');
}

/** 气膜场：去年冬天塌了，再没充起来。 */
function bubbleCourt(ctx: BuildContext): XYZ[] {
  surface(ctx, FC, '#4f6a86', '#5a7562', { worn: 0.2, cracks: 3, weeds: 0.4, puddles: 0, missing: 0.1 });
  const peaks: XYZ[] = [];
  const bumps = [
    { x: -9, z: -2, h: 1.7, r: 4 },
    { x: 7, z: 2.5, h: 2.3, r: 5 },
    { x: 14, z: -4, h: 1.3, r: 3 },
    { x: -15, z: 4, h: 1.1, r: 3 },
  ];
  const posts = [
    { x: 0, z: -6.4, h: 1.15, r: 1.3 },
    { x: 0, z: 6.4, h: 1.15, r: 1.3 },
  ];
  const tear = (x: number, z: number) => ((x + 3.5) / 3.6) ** 2 + ((z - 5.5) / 2.2) ** 2 < 1;
  for (let x = -19; x <= 19; x += 1)
    for (let z = -9.5; z <= 9.5; z += 1) {
      if (tear(x, z)) continue;
      const edge = clamp(Math.min((19.6 - Math.abs(x)) / 2.6, (10 - Math.abs(z)) / 2.2), 0, 1);
      let h = 0.14 + 0.28 * Math.abs(Math.sin(x * 0.55 + z * 0.35)) + 0.12 * Math.abs(Math.sin(z * 0.9));
      for (const b of bumps) h += b.h * Math.exp(-((x - b.x) ** 2 + (z - b.z) ** 2) / (b.r * b.r));
      for (const p of posts) h = Math.max(h, p.h * Math.exp(-((x - p.x) ** 2 + (z - p.z) ** 2) / (p.r * p.r)));
      h = Math.max(0.1, h * (0.22 + 0.78 * edge));
      let col = jit(ctx, '#d9d5c8', 0.04);
      if (h < 0.4 && ctx.rand() < 0.45) col = jit(ctx, '#aaa698', 0.04);
      if (h < 0.3 && ctx.rand() < 0.25) col = jit(ctx, '#7b8a8f', 0.03);
      if (ctx.rand() < 0.07) col = jit(ctx, '#8f9a6a', 0.04);
      cbox(ctx, FC, x, -0.01, z, 1.0, h, 1.0, col);
    }
  for (let i = 0; i < 6; i++)
    cbox(ctx, FC, -3.5 + Math.cos(i) * 3.4, 0.04, 5.5 + Math.sin(i) * 2.1, 0.9, 0.05, 0.5, '#e2ded2', i, 0.2, 0.4);
  for (const b of bumps.slice(0, 3)) peaks.push(FC.w({ x: b.x, y: b.h + 0.3, z: b.z }));
  // 坏掉的鼓风机和瘪下去的风管
  cbox(ctx, FC, -21, 0, -6, 1.6, 1.3, 1.4, '#7b7f80');
  cbox(ctx, FC, -20.15, 0.3, -6, 0.04, 0.8, 0.9, '#2f3336');
  cbox(ctx, FC, -19.8, 0, -6, 1.4, 0.28, 1.0, '#cfcabd');

  frameSign(ctx, FC, 'BUBBLE CLOSED · NO INSURANCE', 5.4, 0.5, -10, 0.75, FC.hz + 1.1, '#d4601f', '#1e1e1e', 13);
  cbox(ctx, FC, -12.4, 0, FC.hz + 1.1, 0.08, 0.8, 0.08, '#5a5550');
  cbox(ctx, FC, -7.6, 0, FC.hz + 1.1, 0.08, 0.8, 0.08, '#5a5550');
  return peaks;
}

/** 红土场：Har-Tru 长满杂草，场地线翘起，压路滚生锈，一棵树倒在围网上。 */
function clayCourt(ctx: BuildContext): void {
  const fr = FD;
  const y = fr.oy - 0.07;
  for (let x = -17; x < 17; x += 2)
    for (let z = -9; z < 9; z += 2) {
      const p = fr.w({ x: x + 1, z: z + 1 });
      const r = ctx.rand();
      ctx.flat.box(p.x, y, p.z, 2, 0.06, 2, r < 0.3 ? jit(ctx, '#6e7a4a', 0.05) : jit(ctx, '#7c8569', 0.05), fr.a);
      if (r < 0.35) {
        for (let k = 0; k < 3; k++) {
          const q = fr.w({ x: x + sr(ctx, 0, 2), z: z + sr(ctx, 0, 2) });
          weed(ctx, q.x, y + 0.06, q.z, Math.floor(sr(ctx, 2, 5)));
        }
      }
    }
  courtLines(ctx, fr, '#d8d2c0', 0.35, y + 0.062);
  for (let k = 0; k < 5; k++)
    cbox(
      ctx,
      fr,
      sr(ctx, -11, 11),
      0,
      pick([-5.485, 5.485, -4.115, 4.115], ctx.rand),
      1.2,
      0.01,
      0.09,
      '#d8d2c0',
      0,
      0,
      sr(ctx, 0.2, 0.5),
      ctx.flat,
    );
  for (let k = 0; k < 3; k++) {
    const p = fr.w({ x: sr(ctx, -10, 10), z: sr(ctx, -5, 5) });
    const w = sr(ctx, 2, 4);
    const d = sr(ctx, 1, 2.4);
    ctx.flat.box(p.x, y + 0.064, p.z, w, 0.004, d, '#5d6f78', fr.a);
  }
  cbox(ctx, fr, 0, 0, -6.4, 0.12, 1.0, 0.12, '#2a332d');
  cbox(ctx, fr, 0, 0, 6.4, 0.12, 1.0, 0.12, '#2a332d', 0, 0, 0.35);
  for (let i = 0; i < 8; i++)
    cbox(ctx, fr, 0.3, 0, -6 + i * 1.5, 0.04, 0.35 + ctx.rand() * 0.4, 1.5, '#262b27', 0, 0, 0.25);
  cbox(ctx, fr, -13.5, 0, 6, 1.6, 0.55, 0.55, '#6b4f3a', 0.3);
  cbox(ctx, fr, -13.5, 0.25, 7.2, 0.06, 0.06, 2.2, '#5a4a3a', 0.3, 0.5);
  // 倒在北侧围网上的树
  cbox(ctx, fr, 9, 0.1, -10.5, 0.65, 0.65, 11, '#4a3a2e', 0.55, -0.07);
  for (let k = 0; k < 5; k++)
    cbox(
      ctx,
      fr,
      9 + sr(ctx, -3, 3),
      0.6,
      -10 + sr(ctx, -4, 4),
      0.15,
      1.8,
      0.15,
      '#55443a',
      sr(ctx, 0, 3),
      sr(ctx, -1, 1),
      sr(ctx, 0.6, 1.2),
    );
  for (let k = 0; k < 14; k++)
    cbox(
      ctx,
      fr,
      sr(ctx, 5, 12),
      0,
      sr(ctx, -6, -2),
      0.6,
      0.6,
      0.6,
      jit(ctx, pick(LEAF_LITTER, ctx.rand), 0.05),
      0,
      sr(ctx, 0, 1),
    );

  pen(ctx, FD, { holes: [3, 4, 17], lean: 0.4, col: '#5a5148' });
  frameSign(ctx, FD, 'CLAY COURT · MEMBERS ONLY', 4.4, 0.45, 0, 0.75, FD.hz + 0.6, '#4f5a44', '#c8c0a0', 12);
  cbox(ctx, FD, -2.2, 0, FD.hz + 0.6, 0.08, 0.75, 0.08, '#5a5550');
  cbox(ctx, FD, 2.2, 0, FD.hz + 0.6, 0.08, 0.75, 0.08, '#5a5550', 0, 0, 0.3);
}

/** A 字形会所、露台、干涸的泳池、碎石停车场。 */
function clubhouse(ctx: BuildContext): void {
  const { solid, flat, scene } = ctx;
  const x0 = -17;
  const x1 = -4;
  const z0 = -35;
  const z1 = -22.6;
  const cx = (x0 + x1) / 2;
  const W = x1 - x0;
  for (let k = 0; k < 12; k++) {
    const w = W - k * 1.05;
    if (w < 0.6) break;
    solid.box(
      cx,
      UP + k * 0.62,
      (z0 + z1) / 2,
      w,
      0.62,
      z1 - z0 + 0.6,
      ctx.rand() < 0.18 ? jit(ctx, '#8a6a45', 0.04) : jit(ctx, '#3d3430', 0.05),
    );
    for (const s of [-1, 1])
      if (ctx.rand() < 0.35)
        solid.box(
          cx + s * (w / 2 - 0.25),
          UP + k * 0.62 + 0.3,
          (z0 + z1) / 2 + sr(ctx, -5, 5),
          0.5,
          0.36,
          sr(ctx, 0.8, 2),
          '#8a6a45',
        );
  }
  for (let k = 0; k < 11; k++) {
    const w = W - k * 1.05 - 0.9;
    if (w < 0.5) break;
    const n = Math.max(1, Math.round(w));
    for (let i = 0; i < n; i++) {
      const x = cx - w / 2 + (w / n) * (i + 0.5);
      const r = ctx.rand();
      const col =
        k === 0 && Math.abs(x - cx) < 1.2
          ? '#5a3b2a'
          : r < 0.12
            ? '#a8875a'
            : r < 0.18
              ? '#1d2225'
              : i % 2
                ? '#4d6470'
                : '#6b4a30';
      solid.box(x, UP + k * 0.62, z1 + 0.32, w / n - 0.06, 0.58, 0.08, col);
    }
  }
  sign(
    scene,
    'HOLLOW CR EK TENNIS CL B · EST. 1974',
    8.5,
    0.55,
    (DECK.x0 + DECK.x1) / 2,
    DECK.y + 0.55,
    DECK.z1 + 0.12,
    0,
    '#2d3a33',
    '#c9bf9f',
    15,
  );
  // 露台：缺几块板，柱子落到墙下，栏杆断了
  for (let z = DECK.z0; z < DECK.z1; z += 0.5) {
    if (ctx.rand() < 0.07) continue;
    solid.box(
      (DECK.x0 + DECK.x1) / 2,
      DECK.y - 0.08,
      z + 0.25,
      DECK.x1 - DECK.x0,
      0.08,
      0.46,
      jit(ctx, '#8a7258', 0.05),
    );
  }
  for (let x = DECK.x0 + 0.3; x < DECK.x1; x += 3) solid.box(x, MID, DECK.z1 - 0.3, 0.2, DECK.y - MID, 0.2, '#5d4c3c');
  for (let x = DECK.x0; x <= DECK.x1; x += 0.6) {
    if (ctx.rand() < 0.25) continue;
    solid.box(x, DECK.y, DECK.z1 - 0.05, 0.07, 0.9, 0.07, '#6d5a46', 0, 0, ctx.rand() < 0.1 ? 0.4 : 0);
  }
  solid.box((DECK.x0 + DECK.x1) / 2 - 2, DECK.y + 0.9, DECK.z1 - 0.05, DECK.x1 - DECK.x0 - 4, 0.08, 0.1, '#6d5a46');
  solid.box(DECK.x1 - 1.2, DECK.y + 0.4, DECK.z1 - 0.05, 2.4, 0.08, 0.1, '#6d5a46', 0, 0, -0.35);
  (
    [
      [-14, -20],
      [-12.6, -20.6],
    ] as const
  ).forEach(([x, z], i) => {
    solid.box(x, DECK.y, z, 0.5, 0.42, 0.5, '#e8e2d0', 0, 0, i ? 1.4 : 0);
  });
  solid.box(-10, DECK.y, -21.3, 1.2, 0.75, 0.8, '#7a6650');

  // 干涸的泳池
  const P = POOL;
  for (let x = P.x0; x < P.x1; x += 1) {
    solid.box(
      x + 0.5,
      0.55,
      P.z0 + 0.05,
      1,
      UP - 0.55,
      0.1,
      ctx.rand() < 0.2 ? jit(ctx, '#5f7f80', 0.04) : jit(ctx, '#7fb3b8', 0.04),
    );
    solid.box(
      x + 0.5,
      0.55,
      P.z1 - 0.05,
      1,
      UP - 0.55,
      0.1,
      ctx.rand() < 0.2 ? jit(ctx, '#5f7f80', 0.04) : jit(ctx, '#7fb3b8', 0.04),
    );
  }
  solid.box(P.x0 + 0.05, 1.5, (P.z0 + P.z1) / 2, 0.1, UP - 1.5, P.z1 - P.z0, '#7fb3b8');
  solid.box(P.x1 - 0.05, 0.55, (P.z0 + P.z1) / 2, 0.1, UP - 0.55, P.z1 - P.z0, '#7fb3b8');
  for (let x = P.x0; x < P.x1; x += 1)
    for (let z = P.z0; z < P.z1; z += 1) {
      const fy = x < 10 ? 1.5 : 0.55;
      if (ctx.rand() < 0.3)
        flat.box(
          x + 0.5,
          fy,
          z + 0.5,
          1,
          0.012,
          1,
          jit(ctx, ctx.rand() < 0.5 ? '#55787a' : '#7a6a4a', 0.04),
          sr(ctx, 0, 1),
        );
    }
  flat.box(14, 0.56, (P.z0 + P.z1) / 2, 5, 0.2, 6, '#4f6b3c');
  flat.box(13, 0.76, -27, 1.6, 0.004, 1.2, '#68844d');
  for (let k = 0; k < 30; k++)
    flat.box(
      sr(ctx, P.x0 + 0.5, P.x1 - 0.5),
      sr(ctx, 0, 1) < 0.5 ? 1.51 : 0.77,
      sr(ctx, P.z0 + 0.5, P.z1 - 0.5),
      0.22,
      0.02,
      0.22,
      pick(LEAF_LITTER, ctx.rand),
      sr(ctx, 0, 3),
    );
  solid.box(12, 0.77, -29, 0.9, 0.5, 0.6, '#9aa0a3', 0.6, 0, 0.25);
  solid.box(4, UP - 1.0, P.z1 - 0.4, 0.06, 1.6, 0.06, '#c9cccd');
  solid.box(4.6, UP - 1.0, P.z1 - 0.4, 0.06, 1.6, 0.06, '#c9cccd');
  solid.box(15.5, UP + 0.3, P.z0 - 0.4, 0.5, 0.1, 2.6, '#d9d4c3', 0, 0.18, 0);
  for (let x = P.x0 - 2; x < P.x1 + 2; x += 1)
    for (let z = P.z0 - 2; z < P.z1 + 2; z += 1) {
      if (x >= P.x0 && x < P.x1 && z >= P.z0 && z < P.z1) continue;
      flat.box(x + 0.5, UP + 0.01, z + 0.5, 1, 0.03, 1, jit(ctx, '#b5b0a2', 0.05));
    }
  (
    [
      [4, -33],
      [7, -33.3],
      [18, -26],
    ] as const
  ).forEach(([x, z], i) => {
    solid.box(x, UP, z, 0.6, 0.3, 1.7, '#c9cccd', i * 0.4, 0, i === 2 ? 1.2 : 0);
  });
  solid.box(18.4, UP, -30, 0.08, 2.2, 0.08, '#8a8a86', 0, 0.35, 0);
  solid.box(18.0, UP + 1.8, -29.4, 2.4, 0.15, 2.4, '#b55a4a', 0.3, 0.35, 0.1);
  sign(scene, 'POOL CLOSED', 2.4, 0.4, 10, UP + 1.0, P.z1 + 0.95, 0, '#e8e2d0', '#b23a2c', 13);
  solid.box(8.8, UP, P.z1 + 0.95, 0.06, 1.0, 0.06, '#5a5550');
  solid.box(11.2, UP, P.z1 + 0.95, 0.06, 1.0, 0.06, '#5a5550');

  // 碎石停车场、坑洼、出售牌
  for (let x = LOT.x0; x < LOT.x1; x += 2)
    for (let z = LOT.z0; z < LOT.z1; z += 2)
      flat.box(
        x + 1,
        UP + 0.01,
        z + 1,
        2,
        0.04,
        2,
        ctx.rand() < 0.1 ? jit(ctx, '#5d5a52', 0.03) : jit(ctx, '#8f8a7c', 0.05),
      );
  for (let k = 0; k < 4; k++)
    flat.box(sr(ctx, 22, 38), UP + 0.05, sr(ctx, -40, -22), sr(ctx, 1, 2), 0.004, sr(ctx, 0.7, 1.4), '#5d6f78');
  for (let x = 22; x < 40; x += 3.2)
    solid.box(
      x,
      UP + 0.05,
      -24.2,
      1.4,
      0.16,
      0.3,
      ctx.rand() < 0.3 ? '#8b867b' : '#b5b0a2',
      0,
      0,
      ctx.rand() < 0.3 ? 0.2 : 0,
    );
  sign(scene, 'SITE FOR SALE · 6.2 ACRES', 4.2, 0.9, 38, UP + 1.8, -19.6, 0, '#d84f2e', '#f7f3e8', 12);
  solid.box(36.2, UP, -19.7, 0.12, 1.9, 0.12, '#7a6650');
  solid.box(39.8, UP, -19.7, 0.12, 1.9, 0.12, '#7a6650');
}

/** 小溪、人行桥（少一块板）、公路桥、碎石小路。 */
function creek(ctx: BuildContext): void {
  const { solid, flat } = ctx;
  for (let x = -70; x < 80; x += 1) {
    const cz = creekZ(x + 0.5);
    for (let dz = -1.5; dz <= 1.5; dz += 1) flat.box(x + 0.5, 0, cz + dz, 1, 0.02, 1, jit(ctx, '#4c666b', 0.04));
    flat.box(x + 0.5, 0, cz - 2.5, 1, 0.03, 1, jit(ctx, '#5b4b3a', 0.05));
    flat.box(x + 0.5, 0, cz + 2.5, 1, 0.03, 1, jit(ctx, '#5b4b3a', 0.05));
    if (ctx.rand() < 0.25)
      solid.box(
        x + sr(ctx, 0, 1),
        0,
        cz + pick([-2.4, 2.4], ctx.rand) + sr(ctx, -0.3, 0.3),
        sr(ctx, 0.3, 0.7),
        sr(ctx, 0.2, 0.4),
        sr(ctx, 0.3, 0.6),
        jit(ctx, '#8b867b', 0.07),
        sr(ctx, 0, 3),
      );
    if (ctx.rand() < 0.3) {
      const bz = cz + pick([-2.2, 2.3], ctx.rand);
      for (let k = 0; k < 4; k++) {
        const h = sr(ctx, 0.6, 1.3);
        const xx = x + sr(ctx, 0, 1);
        const zz = bz + sr(ctx, -0.4, 0.4);
        solid.box(xx, 0, zz, 0.05, h, 0.05, '#6d7a3a', 0, sr(ctx, -0.2, 0.2));
        solid.box(xx, h, zz, 0.09, 0.25, 0.09, '#5a3e2a');
      }
    }
    if (ctx.rand() < 0.12)
      flat.box(x + 0.5, 0.025, cz + sr(ctx, -1, 1), sr(ctx, 0.2, 0.4), 0.01, 0.12, pick(TRASH, ctx.rand));
  }
  // 脊梁上的人行桥，少一块板
  const fz = creekZ(0);
  for (let z = fz - 3.4; z < fz + 3.4; z += 0.4) {
    if (Math.abs(z - fz - 0.6) < 0.21) continue;
    solid.box(0, 0.3, z, 1.8, 0.08, 0.34, jit(ctx, '#7a6650', 0.05));
  }
  for (const s of [-0.95, 0.95])
    for (let z = fz - 3.2; z <= fz + 3.2; z += 1.6)
      solid.box(s, 0.3, z, 0.08, 0.9, 0.08, '#5d4c3c', 0, 0, s > 0 && z > fz ? 0.5 : 0);
  solid.box(-0.95, 1.15, fz, 0.08, 0.08, 6.6, '#5d4c3c');
  // 公路桥
  const rz = creekZ(45);
  for (const s of [42.2, 47.8]) solid.box(s, 0.04, rz, 0.15, 0.8, 7, '#8a8a86');
  // 碎石小路，断断续续
  for (let z = 12.6; z < fz - 3.4; z += 1) {
    if (ctx.rand() < 0.2) continue;
    flat.box(0, 0, z + 0.5, 1.8, 0.03, 1, jit(ctx, '#b0a483', 0.05));
  }
  for (let x = -1; x < 22; x += 1) {
    if (ctx.rand() < 0.15) continue;
    flat.box(x + 0.5, UP + 0.01, -20.6, 1, 0.03, 1.8, jit(ctx, '#b0a483', 0.05));
  }
}

function trees(ctx: BuildContext): void {
  (
    [
      [-30, -48, 1.1],
      [-12, -52, 1],
      [6, -47, 1.2],
      [26, -50, 1],
      [-40, -30, 1],
      [34, -46, 1.1],
      [-46, -14, 1],
    ] as const
  ).forEach(([x, z, s], i) => {
    if (i % 2) bareTree(ctx, x, UP, z, s);
    else sparseTree(ctx, x, UP, z, s);
  });
  for (const [x, z, s] of [
    [-48, -2, 1],
    [-50, 6, 0.9],
  ] as const)
    bareTree(ctx, x, MID, z, s);
  for (const [x, z, s] of [
    [-44, 33, 1.2],
    [-30, 42, 1.1],
    [-12, 32, 1],
    [10, 43, 1.1],
    [32, 33, 1],
    [58, 30, 1.1],
    [-58, 40, 1],
  ] as const)
    sparseTree(ctx, x, 0, z, s, WILLOW, 0.5);
  for (const [x, z, s] of [
    [60, 0, 1],
    [56, -14, 1.1],
    [-50, 22, 1],
    [24, 50, 1],
  ] as const)
    bareTree(ctx, x, 0, z, s);
}

/** Dale 在 1 号场边的折叠躺椅和冷藏箱。 */
function daleChair(ctx: BuildContext): void {
  for (const [a, b] of [
    [-0.25, -0.22],
    [0.25, -0.22],
    [-0.25, 0.22],
    [0.25, 0.22],
  ] as const)
    cbox(ctx, FA, 3.3 + a, 0, -0.9 + b, 0.04, 0.42, 0.04, '#b7bcbf');
  for (let i = 0; i < 5; i++) cbox(ctx, FA, 3.1 + i * 0.1, 0.4, -0.9, 0.09, 0.05, 0.5, i % 2 ? '#e8e2d0' : '#3f7a5a');
  cbox(ctx, FA, 3.6, 0.4, -0.9, 0.06, 0.65, 0.5, '#3f7a5a', 0, 0, -0.25);
  cbox(ctx, FA, 3.35, 0, -0.15, 0.55, 0.4, 0.4, '#2d6fb0');
  cbox(ctx, FA, 3.35, 0.4, -0.15, 0.57, 0.07, 0.42, '#e8e2d0');
}

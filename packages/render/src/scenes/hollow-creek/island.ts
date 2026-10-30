import { mulberry32, pick } from '@td/shared';
import * as THREE from 'three';
import { VoxelBatcher } from '../../voxel/batcher';
import { type BuildContext, jit, sr } from '../../world/build-context';
import { coastDistance, creekZ, ISLAND, UNDERSIDE } from './layout';

/**
 * 浮空岛的静态部分（设计稿「Floating island」）：
 * 只铺在岛上的草地顶面；岛底剖面（草皮唇边、两层土、往里收的岩层）；
 * 从土层垂下的根须、崖边的杂草和裂开的岩块。
 *
 * 用单独的随机流（不碰场景主随机流），所以岛上原有的每块石头、每丛草都不变。
 */

const ISLAND_SEED = 0x15a4d;

const X0 = ISLAND.x0 - 2;
const X1 = ISLAND.x1 + 2;
const Z0 = ISLAND.z0 - 2;
const Z1 = ISLAND.z1 + 2;

const cellIn = (x: number, z: number, inset = 0) => coastDistance(x + 0.5, z + 0.5, inset) < 0;

/**
 * 草地顶面：只铺岛上的格子，每一行连续的格子合成一块。
 * UV 按世界坐标算，草色贴图和原型 460×460 平面上的位置逐像素一致。
 */
export function islandGround(tex: THREE.Texture): THREE.Mesh {
  const pos: number[] = [];
  const uv: number[] = [];
  const quad = (xa: number, xb: number, za: number, zb: number) => {
    const P = [
      [xa, za],
      [xa, zb],
      [xb, zb],
      [xa, za],
      [xb, zb],
      [xb, za],
    ] as const;
    for (const [x, z] of P) {
      pos.push(x, 0, z);
      // 原平面：u = (x+230)/460，v = (230−z)/460，再重复 460/32 次
      uv.push((x + 230) / 32, (230 - z) / 32);
    }
  };
  for (let z = Z0; z < Z1; z++) {
    let run: number | null = null;
    for (let x = X0; x <= X1; x++) {
      const inside = x < X1 && cellIn(x, z);
      if (inside && run === null) run = x;
      if (!inside && run !== null) {
        quad(run, x, z, z + 1);
        run = null;
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: tex }));
  m.receiveShadow = true;
  return m;
}

/** 一丛探出崖边的杂草。y0 是草根的高度。 */
function weedTuft(ctx: BuildContext, x: number, z: number, y0: number): void {
  for (let k = 0; k < 3; k++)
    ctx.solid.box(
      x + sr(ctx, 0.2, 0.8),
      y0,
      z + sr(ctx, 0.2, 0.8),
      sr(ctx, 0.06, 0.12),
      sr(ctx, 0.15, 0.45),
      sr(ctx, 0.06, 0.12),
      jit(ctx, pick(['#5e7a2e', '#6d7f34', '#7d8a3c'], ctx.rand), 0.05),
      sr(ctx, 0, 3),
      sr(ctx, -0.3, 0.3),
      sr(ctx, -0.3, 0.3),
    );
}

/** 某个格子在 inset 收边后是不是该层的外圈（往外一格就出界）。 */
function ringCell(x: number, z: number, inset: number): boolean {
  if (!cellIn(x, z, inset)) return false;
  return (
    !cellIn(x + 1, z, inset) ||
    !cellIn(x - 1, z, inset) ||
    !cellIn(x, z + 1, inset) ||
    !cellIn(x, z - 1, inset) ||
    !cellIn(x + 2, z, inset) ||
    !cellIn(x - 2, z, inset) ||
    !cellIn(x, z + 2, inset) ||
    !cellIn(x, z - 2, inset)
  );
}

/** 这个外圈格子朝外的方向（用来让根须往外垂）。 */
function outward(x: number, z: number): { x: number; z: number } {
  const d = coastDistance(x + 0.5, z + 0.5);
  const e = 0.01;
  const gx = coastDistance(x + 0.5 + e, z + 0.5) - d;
  const gz = coastDistance(x + 0.5, z + 0.5 + e) - d;
  const n = Math.hypot(gx, gz) || 1;
  return { x: gx / n, z: gz / n };
}

/** 岛底剖面、根须、崖边细节（自己建网格）。 */
export function buildIsland(base: BuildContext): void {
  // 岛底单独一个批次：背着太阳的剖面也要看得出土是棕的、石头是灰的（设计稿的两种面色）
  const ctx: BuildContext = { ...base, solid: new VoxelBatcher(), rand: mulberry32(ISLAND_SEED) };
  const { solid } = ctx;
  const inCreekMouth = (x: number, z: number) => Math.abs(z + 0.5 - creekZ(x + 0.5)) < 1.6;

  // 草皮唇边和土层：贴着岛边的一圈，层与层的分界上下起伏
  for (let z = Z0; z < Z1; z++)
    for (let x = X0; x < X1; x++) {
      if (!ringCell(x, z, 0)) continue;
      const cx = x + 0.5;
      const cz = z + 0.5;
      const lip = UNDERSIDE.lip - ctx.rand() * 0.15;
      solid.box(cx, lip, cz, 1, -lip - 0.01, 1, jit(ctx, ctx.rand() < 0.25 ? '#6b6a3c' : '#6f7a40', 0.05));
      let top = lip;
      for (const layer of UNDERSIDE.soil) {
        const to = layer.to - ctx.rand() * 0.6;
        solid.box(cx, to, cz, 1, top - to, 1, jit(ctx, layer.col, 0.05));
        top = to;
      }
      // 土层和岩层之间一条薄黏土
      if (ctx.rand() < 0.35) solid.box(cx, top - 0.3, cz, 1.01, 0.3, 1.01, jit(ctx, '#8a7458', 0.05));
    }

  // 岩层：一层比一层往里收，最底下收成一个尖
  let stoneTop: number = UNDERSIDE.soil[UNDERSIDE.soil.length - 1]?.to ?? -5;
  for (const layer of UNDERSIDE.stone) {
    for (let z = Z0; z < Z1; z++)
      for (let x = X0; x < X1; x++) {
        if (!ringCell(x, z, layer.inset)) continue;
        // 岩层下沿参差不齐，像碎裂的岩石
        const ragged = ctx.rand() * 0.8;
        solid.box(
          x + 0.5,
          layer.to - ragged,
          z + 0.5,
          1,
          stoneTop - layer.to + ragged,
          1,
          jit(ctx, ctx.rand() < 0.2 ? '#4a4640' : layer.col, 0.06),
        );
      }
    stoneTop = layer.to;
  }
  // 最底层岩盘把中间填满，从下面看不出是空的
  const last = UNDERSIDE.stone[UNDERSIDE.stone.length - 1];
  const prev = UNDERSIDE.stone[UNDERSIDE.stone.length - 2];
  if (last && prev) {
    const i = last.inset;
    solid.box(
      (ISLAND.x0 + ISLAND.x1) / 2,
      last.to,
      (ISLAND.z0 + ISLAND.z1) / 2,
      ISLAND.x1 - ISLAND.x0 - 2 * i - 2,
      prev.to - last.to,
      ISLAND.z1 - ISLAND.z0 - 2 * i - 2,
      '#3f3c37',
    );
  }

  // 根须：从土层外壁垂下来，Hollow Creek 的荒废感
  for (let z = Z0; z < Z1; z++)
    for (let x = X0; x < X1; x++) {
      if (!ringCell(x, z, 0) || inCreekMouth(x, z)) continue;
      if (ctx.rand() > 0.07) continue;
      const o = outward(x, z);
      const len = sr(ctx, 1.5, 7);
      const startY = sr(ctx, -7.5, -1);
      const rx = x + 0.5 + o.x * 0.55;
      const rz = z + 0.5 + o.z * 0.55;
      solid.box(rx, startY - len, rz, 0.1, len, 0.1, jit(ctx, pick(['#4a3a2e', '#5a4636', '#3e3128'], ctx.rand), 0.04));
      if (ctx.rand() < 0.5)
        solid.box(
          rx + o.x * 0.12,
          startY - len * 0.6,
          rz + o.z * 0.12,
          0.08,
          len * 0.4,
          0.08,
          '#4a3a2e',
          0,
          o.z * 0.4,
          -o.x * 0.4,
        );
    }

  // 崖边：杂草探出边缘，偶尔一块裂开歪斜的岩石
  for (let z = Z0; z < Z1; z++)
    for (let x = X0; x < X1; x++) {
      if (!cellIn(x, z) || cellIn(x, z, 1.2) || inCreekMouth(x, z)) continue;
      const r = ctx.rand();
      if (r < 0.1) {
        weedTuft(ctx, x, z, 0);
      } else if (r < 0.13) {
        const o = outward(x, z);
        solid.box(
          x + 0.5 + o.x * 0.4,
          -2.4,
          z + 0.5 + o.z * 0.4,
          sr(ctx, 0.8, 1.4),
          sr(ctx, 1.5, 2.6),
          sr(ctx, 0.8, 1.4),
          jit(ctx, '#7b7468', 0.06),
          sr(ctx, 0, 3),
          o.z * 0.15,
          -o.x * 0.15,
        );
      }
    }

  // 小溪两头：在岛边前面用一道矮石岸截住，水不往外流
  for (let z = Z0; z < Z1; z++)
    for (let x = X0; x < X1; x++) {
      if (!cellIn(x, z) || cellIn(x, z, 1.6) || !inCreekMouth(x, z)) continue;
      solid.box(x + 0.5, -0.6, z + 0.5, 1.02, 0.78, 1.02, jit(ctx, ctx.rand() < 0.4 ? '#8b867b' : '#7b7468', 0.06));
      if (ctx.rand() < 0.5) weedTuft(ctx, x, z, 0.18);
    }

  solid.build(ctx.scene, true, true, { emissive: new THREE.Color('#3a3128') });
}

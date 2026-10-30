import { mulberry32, pick } from '@td/shared';
import * as THREE from 'three';
import { type BuildContext, jit, sr } from '../../world/build-context';
import { CAUSEWAY_END_Z, causewayStartZ, coastDistance, creekZ, ISLAND, onIsland } from './layout';

/**
 * 岛屿外缘：草地顶面、海岸悬崖（表土 / 黏土 / 岩层）、小溪入海处的瀑布、
 * 浪花、近岸浅水、礁石、海面，以及唯一的出岛通道：东侧的公路堤道。
 *
 * 用单独的随机流（不碰场景主随机流），所以岛上原有的每块石头、每丛草都不变。
 */

const ISLAND_SEED = 0x15a4d;

/** 岛屿网格范围（1 米一格），比圆角矩形大出海岸起伏的最大值。 */
const X0 = Math.floor(ISLAND.cx - ISLAND.hx - 10);
const X1 = Math.ceil(ISLAND.cx + ISLAND.hx + 10);
const Z0 = Math.floor(ISLAND.cz - ISLAND.hz - 10);
const Z1 = Math.ceil(ISLAND.cz + ISLAND.hz + 10);

const cellIn = (x: number, z: number) => onIsland(x + 0.5, z + 0.5);

/**
 * 草地顶面：只铺岛上的格子，每一行连续的格子合成一块。
 * UV 按世界坐标算，草色贴图和原来 460×460 平面上的位置逐像素一致。
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

/** 海岸、海面和堤道。要在 flat / solid 两个批次 build 之前调用。 */
export function buildIsland(base: BuildContext): void {
  const ctx: BuildContext = { ...base, rand: mulberry32(ISLAND_SEED) };
  const { solid, flat, scene } = ctx;
  const { seaY, floorY } = ISLAND;
  const roadX0 = 41;
  const roadX1 = 49;
  const csz = causewayStartZ();
  const onRoad = (x: number, z: number) => x + 0.5 > roadX0 && x + 0.5 < roadX1 && z >= csz - 2;

  for (let z = Z0; z < Z1; z++)
    for (let x = X0; x < X1; x++) {
      const inside = cellIn(x, z);
      const cx = x + 0.5;
      const cz = z + 0.5;
      if (inside) {
        const edge = !cellIn(x + 1, z) || !cellIn(x - 1, z) || !cellIn(x, z + 1) || !cellIn(x, z - 1);
        if (!edge || onRoad(x, z)) continue;
        const inCreek = Math.abs(cz - creekZ(cx)) < 1.6;
        if (inCreek) {
          // 小溪从崖边落进海里
          solid.box(cx, seaY, cz, 1, -seaY - 0.02, 1, jit(ctx, ctx.rand() < 0.5 ? '#8fa6aa' : '#a9bcbd', 0.04));
          solid.box(cx, floorY, cz, 1, seaY - floorY, 1, jit(ctx, '#55524b', 0.05));
          continue;
        }
        // 表土、黏土、岩层，三层高度各有起伏
        const soil = -0.45 - ctx.rand() * 0.2;
        const clay = -1.5 - ctx.rand() * 0.35;
        solid.box(cx, soil, cz, 1, -soil - 0.02, 1, jit(ctx, '#4f4232', 0.05));
        solid.box(cx, clay, cz, 1, soil - clay, 1, jit(ctx, ctx.rand() < 0.3 ? '#8a7458' : '#7a6650', 0.05));
        solid.box(cx, floorY, cz, 1, clay - floorY, 1, jit(ctx, ctx.rand() < 0.25 ? '#5b5952' : '#6e6c66', 0.06));
        // 崖边垂下的草
        if (ctx.rand() < 0.18) solid.box(cx, soil + 0.05, cz, 1.02, 0.35, 1.02, jit(ctx, '#6f7a40', 0.05));
        continue;
      }
      if (onRoad(x, z)) continue;
      const d = coastDistance(cx, cz);
      if (d > 4.5) continue;
      // 浪花紧贴崖脚，外面一圈浅水
      if (d < 1.2 && ctx.rand() < 0.6) flat.box(cx, seaY, cz, 1, 0.03, 1, jit(ctx, '#b9c3c2', 0.05));
      else flat.box(cx, seaY, cz, 1, 0.015, 1, jit(ctx, '#6b7f83', 0.03).lerp(new THREE.Color('#5d6d70'), d / 4.5));
      if (d > 0.6 && d < 3.5 && ctx.rand() < 0.06) {
        const s = sr(ctx, 0.5, 1.4);
        solid.box(
          cx + sr(ctx, -0.3, 0.3),
          floorY,
          cz + sr(ctx, -0.3, 0.3),
          s,
          seaY - floorY + sr(ctx, 0.1, 0.5),
          s * 0.9,
          jit(ctx, '#6e6c66', 0.07),
          sr(ctx, 0, 3),
        );
      }
    }

  // 出岛的唯一通道：东侧公路沿堤道向南伸进雾里
  for (let z = csz - 2; z < CAUSEWAY_END_Z; z += 1) {
    solid.box(45, floorY, z + 0.5, 8, -floorY - 0.02, 1, jit(ctx, ctx.rand() < 0.2 ? '#5b5952' : '#6e6c66', 0.05));
    // 堤身往岛里多伸 2 米接住岸边；路面从岸线开始，接上岛上的公路
    if (z >= csz) {
      flat.box(45, 0, z + 0.5, 6, 0.04, 1, ctx.rand() < 0.07 ? jit(ctx, '#2f302e', 0.02) : jit(ctx, '#4c4d4b', 0.04));
      if (Math.round(z) % 4 === 0) flat.box(45, 0.041, z + 0.5, 0.12, 0.01, 2, '#b9a03a');
    }
    if (z % 6 === 0) for (const s of [-1, 1]) solid.box(45 + s * 3.6, 0, z + 0.5, 0.12, 0.7, 0.12, '#d9d4c3');
    // 抛石护坡和堤脚浪花
    for (const s of [-1, 1]) {
      if (ctx.rand() < 0.5)
        solid.box(
          45 + s * sr(ctx, 4.1, 4.9),
          floorY,
          z + sr(ctx, 0, 1),
          sr(ctx, 0.5, 1.1),
          seaY - floorY + sr(ctx, 0.1, 0.45),
          sr(ctx, 0.5, 1.1),
          jit(ctx, pick(['#6e6c66', '#7b786f', '#5b5952'], ctx.rand), 0.05),
          sr(ctx, 0, 3),
        );
      if (ctx.rand() < 0.55) flat.box(45 + s * 4.6, seaY, z + 0.5, 1, 0.03, 1, jit(ctx, '#b9c3c2', 0.05));
    }
  }

  // 海面：灰绿色，远处被雾吞进天色
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(1000, 1000), new THREE.MeshLambertMaterial({ color: '#5d6d70' }));
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = seaY - 0.01;
  sea.receiveShadow = true;
  scene.add(sea);
}

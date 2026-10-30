import type { Rand } from '@td/shared';
import { range } from '@td/shared';
import type * as THREE from 'three';
import { type ColorLike, jitter, VoxelBatcher } from '../voxel/batcher';
import type { CourtFrame } from './frame';

/**
 * 场景构建时的上下文：场景图、两个体素批次和一条种子随机流。
 * 所有构建函数都从同一条随机流按顺序取数，所以调用顺序就是画面的一部分。
 */
export interface BuildContext {
  readonly scene: THREE.Scene;
  /** 地面薄层：不投影，只接收阴影 */
  readonly flat: VoxelBatcher;
  /** 实体：投影并接收阴影 */
  readonly solid: VoxelBatcher;
  readonly rand: Rand;
}

export function createBuildContext(scene: THREE.Scene, rand: Rand): BuildContext {
  return { scene, flat: new VoxelBatcher(), solid: new VoxelBatcher(), rand };
}

/** [a,b) 的种子随机数。 */
export const sr = (ctx: BuildContext, a: number, b: number): number => range(ctx.rand, a, b);

/** 用种子随机流做颜色抖动。 */
export const jit = (ctx: BuildContext, hex: string, amt = 0.05): THREE.Color => jitter(hex, amt, ctx.rand);

/** 在场地坐标系里放一个盒子（默认放进 solid 批次）。 */
export function cbox(
  ctx: BuildContext,
  fr: CourtFrame,
  lx: number,
  ly: number,
  lz: number,
  w: number,
  h: number,
  d: number,
  col: ColorLike,
  ry = 0,
  rx = 0,
  rz = 0,
  vb: VoxelBatcher = ctx.solid,
): void {
  const p = fr.w({ x: lx, y: ly, z: lz });
  vb.box(p.x, p.y, p.z, w, h, d, col, fr.a + ry, rx, rz);
}

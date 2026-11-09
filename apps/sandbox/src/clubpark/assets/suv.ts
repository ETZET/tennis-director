// SUV（clubpark.md「suv」）：方、高、大轮子，车顶两条行李架，车尾挂备胎；车头朝本地 −z。variant 同 car。
// 做法、userData 接口见 vehicle/build.ts；尺寸见 vehicle/specs.ts。
import type * as THREE from 'three';
import type { AssetCtx } from '../ctx';
import { buildVehicle } from './vehicle/build';
import { SUV } from './vehicle/specs';

export function build(ctx: AssetCtx): THREE.Object3D {
  return buildVehicle(ctx, SUV);
}

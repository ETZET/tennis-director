// 轿车（clubpark.md「car」）：Q 版胖轿车，车头朝本地 −z。variant 0…6 = CAR_PAINTS 的车漆，8 = 落客的车（前门开着）。
// 做法、userData 接口见 vehicle/build.ts；尺寸见 vehicle/specs.ts。
import type * as THREE from 'three';
import type { AssetCtx } from '../world';
import { buildVehicle } from './vehicle/build';
import { CAR } from './vehicle/specs';

export function build(ctx: AssetCtx): THREE.Object3D {
  return buildVehicle(ctx, CAR);
}

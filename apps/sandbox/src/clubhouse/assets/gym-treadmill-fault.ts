// 跑步机（亮红灯）：和 gym-treadmill 同一台机器（共用 gym-treadmill.ts 的 treadmill()），控制台上多一块发光的红灯（3 × 2 纹素，立高 1 纹素）
// + 台面前沿一条黄黑相间的警示条（每段 2 纹素）。信号：总监按住修。0.81 × 1.44 × 1.81 米（9 × 16 × 20 纹素）。三角形 240。
// 三角形见 gym-treadmill.ts 顶上。userData：beltY = 0.28。
import type * as THREE from 'three';
import type { AssetCtx } from '../ctx';
import { treadmill } from './gym-treadmill';

export function build(ctx: AssetCtx): THREE.Object3D {
  return treadmill(ctx, true);
}

// exit-arbor：东西向出口的木架廊（exit-gate.ts 的 buildExitGate，deep = 2.4 米）：两对灰泥柱 + 两根顺着路的长梁 + 5 根椽子。
// 镜头 yaw 0 从侧面看一道门只是一根竖线；看一段廊是"路钻进一段棚子、往画面外去"。
import type * as THREE from 'three';
import type { AssetCtx } from '../ctx';
import { buildExitGate, GATE_CLEAR } from './exit-gate';

export function build(ctx: AssetCtx): THREE.Object3D {
  return buildExitGate(ctx, GATE_CLEAR, true, 2.4);
}

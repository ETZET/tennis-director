// exit-posts：台阶口的出口门 —— 只有两根灰泥门柱、没有横梁和灯笼（exit-gate.ts 的 buildExitGate）。
import type * as THREE from 'three';
import type { AssetCtx } from '../ctx';
import { buildExitGate, GATE_CLEAR } from './exit-gate';

export function build(ctx: AssetCtx): THREE.Object3D {
  return buildExitGate(ctx, GATE_CLEAR, false);
}

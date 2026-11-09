// 俱乐部东墙的大门（从门里看）：和 clubpark 的 club-gate 是同一个资产，实现只有一份（clubpark/assets/gate/gate.ts）。
import type * as THREE from 'three';
import { buildGate } from '../../clubpark/assets/gate/gate';
import type { AssetCtx } from '../world';

export function build(ctx: AssetCtx): THREE.Object3D {
  return buildGate(ctx);
}

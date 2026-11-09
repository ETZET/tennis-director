// 俱乐部东墙的大门（从门外看）。实现在 gate/gate.ts，和 clubdesk 的 east-gate 是同一份。
import type * as THREE from 'three';
import type { AssetCtx } from '../world';
import { buildGate } from './gate/gate';

export function build(ctx: AssetCtx): THREE.Object3D {
  return buildGate(ctx);
}

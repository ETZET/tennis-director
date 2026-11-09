// #3 grackle：一只大尾拟八哥（几何、姿势、动画在 life/bird.ts）。
// 变体 = 起始姿势（自动播放）：v0 站着（偶尔甩尾）、v1 低头喝水、v2 飞、v3 跳。
// SLOTS：bird-bowl（上碗沿）建议 v1，bird-fly 建议 v2。userData.pose(name, phase?) 见 life/bird.ts。
import type * as THREE from 'three';
import type { AssetCtx } from '../ctx';
import { BIRD_POSES, makeBird } from './life/bird';

export function build(ctx: AssetCtx): THREE.Object3D {
  const pose = BIRD_POSES[[0, 1, 3, 2][ctx.variant % 4]];
  return makeBird(ctx, { pose, offset: ctx.variant * 0.77 });
}

// #3 grackles：池壁后沿的两只（一组）。一只侧身低头喝水，一只侧身站着翘尾巴（侧面的剪影最像鸟）。
// 本地 x 沿着池沿排开（±0.27 米），z 几乎不动 —— 压顶只有 0.62 米宽：slot 的 rotY 让本地 x 顺着池沿走最稳。
// userData.birds = [喝水的, 站着的]，每只都有 pose(name, phase?)（life/bird.ts）；userData.pose(name, phase?) 一起换。
import * as THREE from 'three';
import type { AssetCtx } from '../world';
import { makeBird } from './life/bird';

export function build(ctx: AssetCtx): THREE.Object3D {
  const g = new THREE.Group();
  g.name = 'grackles';
  // 喝水的那只：朝池心（本地 +z）偏 50°，四分之三侧面；站着的那只：侧身朝 −x
  const a = makeBird(ctx, { pose: 'drink', offset: 0.4 + ctx.variant });
  a.position.set(-0.27, 0, 0.04);
  a.rotation.y = 0.9;
  const b = makeBird(ctx, { pose: 'stand', offset: 1.9 + ctx.variant });
  b.position.set(0.27, 0, -0.03);
  b.rotation.y = -Math.PI / 2 - 0.25;
  b.scale.setScalar(1.04);
  g.add(a, b);
  const birds = [a, b];
  g.userData.birds = birds;
  g.userData.pose = (name: string, phase?: number) => {
    for (const x of birds) x.userData.pose(name, phase);
  };
  return g;
}

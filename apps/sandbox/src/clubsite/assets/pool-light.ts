// pool-light：泳池的水下灯（第三轮，夜景用）。摆在池底中间（y = 池底的高度），沿本地 x 两盏：池底两块 2 × 1 纹素的灯面，
// 天黑亮成青白，水面和池壁泛一片青光（只照到池沿以下：高过池沿的铺地、躺椅不染青）。
// 变体 = 两盏灯的间距：0 → 3.8 米（8 米长的池），1 → 6 米。池深按 0.9 米算（光照到本地 y 0.86）。
import * as THREE from 'three';
import { LAMP_AQUA, nightLight } from '../daylight/night';
import { Bucket, box, DU, type NetCtx } from './nets/kit';

export function build(ctx: NetCtx): THREE.Object3D {
  const g = new THREE.Group();
  g.name = 'pool-light';
  const gap = ctx.variant % 2 === 1 ? 6 : 3.8;
  const lens = { bands: [-2, -1.5] as [number, number], edge: 0, convex: 0, noShadowReceive: true };
  const off = ctx.mat('clothWhite', { ...lens, ramp: [0x9ad0e0, 0x9ad0e0, 0x9ad0e0] });
  const on = ctx.mat('clothWhite', { ...lens, ramp: [0xd8fff4, 0xd8fff4, 0xd8fff4], emissive: 0x081410 });
  const b = new Bucket();
  for (const sx of [-1, 1]) b.add(off, box(2 * DU, DU, DU, (sx * gap) / 2, 0.08, 0));
  const [mesh] = b.build(ctx.mats, g);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  g.userData.night = nightLight(g, {
    glow: [[mesh, off, on]],
    spots: [-1, 1].map((sx) => ({
      at: [(sx * gap) / 2, 0, 0] as [number, number, number],
      r: gap * 0.95,
      h: 0.86,
      c: LAMP_AQUA,
      k: 0.32,
    })),
  });
  return g;
}

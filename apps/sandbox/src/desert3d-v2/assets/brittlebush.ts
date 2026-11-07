// 脆灌木（brittlebush）：银蓝的紧凑圆垫子（3 团），团顶点着几簇黄色小菊。v1 是盛花：花簇更多、更集中在顶上。
// 规格 1.4 × 0.9 × 1.3 米（≈ 16 × 7 纹素），1.2k 三角形以内。
import * as THREE from 'three';
import type { AssetCtx } from '../world';
import { Bucket, blob, dot, place } from './creosote/kit';

export function build(ctx: AssetCtx): THREE.Object3D {
  const v = ctx.variant % 2;
  const rnd = ctx.rng(`brittlebush:${v}`);
  const g = new THREE.Group();
  const B = new Bucket();
  const H = 0.9;
  const leaf = ctx.mat('silverBlue', {
    sway: 0.03,
    swayH: H,
    bands: [-0.3, 0.36],
    lightUp: 0.5,
    noise: 0.2,
    convex: 0.1,
  });
  const flower = ctx.mat('flowerYellow', {
    sway: 0.03,
    swayH: H,
    bands: [-0.6, -0.1],
    lightUp: 0.7,
    edge: 0.15,
    convex: 0,
    noShadowReceive: true,
  });

  // 垫子：左右两团 + 后面偏高一团，底压平贴地
  const a0 = rnd() * Math.PI * 2;
  const clumps = [
    { x: -0.3, y: 0.34, z: 0.12, r: 0.42 },
    { x: 0.32, y: 0.32, z: 0.16, r: 0.4 },
    { x: 0.02, y: 0.46, z: -0.16, r: 0.48 },
  ].map((c) => {
    const ca = Math.cos(a0 * 0.3);
    const sa = Math.sin(a0 * 0.3);
    return { ...c, x: c.x * ca - c.z * sa, z: c.x * sa + c.z * ca, r: c.r * (0.94 + rnd() * 0.12) };
  });
  for (const c of clumps) {
    const bg = blob(c.r, rnd, { detail: 2, squash: 0.78, jitter: 0.14, flatBottom: -0.55 / 0.78 });
    B.add(leaf, place(bg, c.x, c.y, c.z, rnd() * 6));
  }

  // 黄花簇：每簇 3～4 朵 2 纹素的小菊，贴在团的上半球（偏镜头一侧多一点）
  const fr = ctx.rng(`brittlebush:flowers:${v}`);
  const nClusters = v === 0 ? 3 : 5;
  for (let k = 0; k < nClusters; k++) {
    const c = clumps[k % clumps.length];
    const th = (k / nClusters) * Math.PI * 2 * 1.7 + fr() * 0.8;
    const ph = 0.05 + fr() * 0.4;
    const cx = c.x + Math.sin(ph) * Math.sin(th) * c.r * 0.95;
    const cz = c.z + Math.sin(ph) * Math.cos(th) * c.r * 0.95 + 0.05;
    const cy = c.y + Math.cos(ph) * c.r * 0.78;
    const m = 3 + Math.floor(fr() * 2);
    for (let j = 0; j < m; j++) {
      const fg = dot(0.1, fr, 0.75);
      const a = (j / m) * Math.PI * 2 + fr();
      B.add(flower, place(fg, cx + Math.cos(a) * 0.08, cy + fr() * 0.04, cz + Math.sin(a) * 0.07));
    }
  }

  B.build(g);
  ctx.mats.prepare(g);
  return g;
}

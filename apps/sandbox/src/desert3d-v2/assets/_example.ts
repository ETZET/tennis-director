// 资产模板（画廊：desert3d-v2.html?asset=_example）。复制成 assets/<id>.ts 再改；场景里 SLOTS 的 asset 名字对上就自动替换占位。
// 规则：只用 palette.ts 的材质（ctx.mat）；可见部分 ≥ 3 纹素厚（ctx.texel 米/纹素）；随机只用 ctx.rng；本地原点 = 落地点，y 0 = 地面。
import * as THREE from 'three';
import type { AssetCtx } from '../world';

export function build(ctx: AssetCtx): THREE.Object3D {
  const rnd = ctx.rng(`_example:${ctx.variant}`);
  const g = new THREE.Group();
  // 一块胖胖的红岩：低细分的二十面体 + 顶点扰动，压扁；球面法线让它有清楚的亮顶/中腰/暗底
  const geo = new THREE.IcosahedronGeometry(0.7, 1);
  const p = geo.getAttribute('position') as THREE.BufferAttribute;
  // 二十面体是非索引的：同一位置的顶点要扰动得一样（按位置记），否则会裂缝
  const seen = new Map<string, number>();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    if (!seen.has(key)) seen.set(key, 0.85 + rnd() * 0.3);
    const k = seen.get(key)!;
    p.setXYZ(i, p.getX(i) * k * 1.3, Math.max(-0.1, p.getY(i) * k * 0.75), p.getZ(i) * k);
  }
  geo.computeVertexNormals();
  const rock = new THREE.Mesh(geo, ctx.mat('rock', { sphereNormals: [0, -0.2, 0] }));
  rock.position.y = 0.35;
  g.add(rock);
  ctx.mats.prepare(g);
  return g;
}

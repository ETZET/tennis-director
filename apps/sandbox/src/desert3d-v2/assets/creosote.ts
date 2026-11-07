// 石炭酸灌木（creosote）：几根短粗的暗枝从地面放射，顶着 4～5 团通透的鼠尾草绿叶团，团顶零星几簇黄花。
// 规格 2.0 × 1.5 × 1.8 米（≈ 22 × 12 纹素），1.5k 三角形以内。
import * as THREE from 'three';
import type { AssetCtx } from '../world';
import { Bucket, blob, dot, place } from './creosote/kit';

export function build(ctx: AssetCtx): THREE.Object3D {
  const v = ctx.variant % 2;
  const rnd = ctx.rng(`creosote:${v}`);
  const g = new THREE.Group();
  const B = new Bucket();
  const H = 1.5;
  const leaf = ctx.mat('sage', { sway: 0.05, swayH: H, bands: [0.06, 0.52], lightUp: 0.45, noise: 0.4 });
  const stem = ctx.mat('branch', { sway: 0.05, swayH: H, edge: 0.4, convex: 0.2 });
  const flower = ctx.mat('flowerYellow', {
    sway: 0.05,
    swayH: H,
    bands: [-0.6, -0.1],
    lightUp: 0.7,
    edge: 0.15,
    convex: 0,
    noShadowReceive: true,
  });

  // 叶团：外圈几团 + 中间一团最高。外圈的团心往外推，团之间留缝露出枝
  const n = v === 0 ? 3 : 4;
  const a0 = rnd() * Math.PI * 2;
  const clumps: { x: number; y: number; z: number; r: number }[] = [];
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * Math.PI * 2 + (rnd() - 0.5) * 0.5;
    const d = 0.52 + rnd() * 0.1;
    const r = (n === 3 ? 0.44 : 0.4) + rnd() * 0.06;
    clumps.push({ x: Math.cos(a) * d, y: 0.9 + rnd() * 0.16, z: Math.sin(a) * d * 0.8, r });
  }
  clumps.push({ x: (rnd() - 0.5) * 0.2, y: 1.18, z: -0.14, r: 0.42 });

  for (const [i, c] of clumps.entries()) {
    const detail = n === 4 && i === 0 ? 1 : 2;
    B.add(leaf, place(blob(c.r, rnd, { detail, squash: 0.8, jitter: 0.12 }), c.x, c.y, c.z, rnd() * 6));
    // 枝：从地面中心附近斜着伸到团底，3 纹素粗，下粗上细
    const from = new THREE.Vector3((rnd() - 0.5) * 0.15, 0, (rnd() - 0.5) * 0.15);
    const to = new THREE.Vector3(c.x * 0.85, c.y - c.r * 0.5, c.z * 0.85);
    const len = from.distanceTo(to);
    const sg = new THREE.CylinderGeometry(0.1, 0.14, len, 5, 1, true);
    sg.translate(0, len / 2, 0);
    sg.applyQuaternion(
      new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize()),
    );
    sg.translate(from.x, from.y, from.z);
    B.add(stem, sg);
  }

  // 黄花：几簇（每簇 2～3 个 ≥ 2 纹素的点），只放在团顶偏镜头一侧
  const fr = ctx.rng(`creosote:flowers:${v}`);
  const tops = [...clumps].sort((p, q) => q.y + q.z * 0.3 - (p.y + p.z * 0.3));
  const nClusters = v === 0 ? 3 : 4;
  for (let k = 0; k < nClusters; k++) {
    const c = tops[k % tops.length];
    const th = (fr() - 0.5) * 1.6;
    const ph = 0.35 + fr() * 0.45; // 离团顶的角度
    const cx = c.x + Math.sin(ph) * Math.sin(th) * c.r;
    const cz = c.z + Math.sin(ph) * Math.cos(th) * c.r;
    const cy = c.y + Math.cos(ph) * c.r * 0.82;
    const m = 2 + Math.floor(fr() * 2);
    for (let j = 0; j < m; j++) {
      const fg = dot(0.1, fr);
      B.add(flower, place(fg, cx + (fr() - 0.5) * 0.26, cy + fr() * 0.06, cz + (fr() - 0.5) * 0.2));
    }
  }

  B.build(g);
  ctx.mats.prepare(g);
  return g;
}

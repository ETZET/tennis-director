// boulder（大石头，地形，2 × 2 格 = 6 × 6 米）：开局压在地上的一块红岩大石头（花钱能清掉）。
// 开罗距离（0.149 米/纹素）下要一眼读成"一块大石头"：一个 4.6 × 3.6 米、2.6 米高的胖石块（低细分二十面体按位置扰动 → 几个大切面，
// 每个切面一个颜色、棱上的凸边只给 0.3），旁边一块小的、两三颗碎石，脚下几团枯草（石缝里长的）。
// 顶上一块苔藓似的浅色 = 被晒白的顶（convex 交给描边）。本地原点 = 占地中心，+z 朝镜头。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

/** 按位置扰动的石头（同一个顶点在每个面上扰动一样 → 不裂）；sx/sy/sz 半径 */
function rock(rnd: () => number, sx: number, sy: number, sz: number, detail = 1): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const seed = rnd() * 100;
  const n = (x: number, y: number, z: number) => {
    const h = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + seed) * 43758.5453;
    return h - Math.floor(h);
  };
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const k = 0.82 + 0.3 * n(Math.round(x * 100), Math.round(y * 100), Math.round(z * 100));
    // 底平：y < −0.3 的压平（石头坐在地上）
    const yy = y < -0.3 ? -0.3 + (y + 0.3) * 0.25 : y;
    p.setXYZ(i, x * k * sx, (yy + 0.3) * k * sy, z * k * sz);
  }
  const out = g.index ? g.toNonIndexed() : g;
  out.computeVertexNormals();
  out.deleteAttribute('uv');
  return out;
}

export function build(ctx: AssetCtx): THREE.Object3D {
  const root = new THREE.Group();
  root.name = 'boulder';
  const v = ((ctx.variant % 3) + 3) % 3;
  const rnd = ctx.rng(`boulder:${v}`);

  const big = rock(rnd, 2.3, 2.0, 1.8)
    .rotateY(rnd() * Math.PI)
    .translate(-0.3, 0, -0.35);
  const small = rock(rnd, 1.05, 0.95, 0.9)
    .rotateY(rnd() * Math.PI)
    .translate(1.75, 0, 1.35);
  const bits: THREE.BufferGeometry[] = [];
  for (const [x, z, s] of [
    [-1.9, 1.7, 0.38],
    [0.4, 2.15, 0.3],
    [2.35, -0.9, 0.34],
  ] as const) {
    bits.push(rock(rnd, s * 1.2, s, s, 0).translate(x, 0, z));
  }
  const rockMat = ctx.mat('rock', { edge: 0.6, convex: 0.3, lightUp: 0.15 });
  const mesh = new THREE.Mesh(mergeGeometries([big, small]), rockMat);
  mesh.name = 'boulder:rock';
  root.add(mesh);
  const bitMesh = new THREE.Mesh(mergeGeometries(bits), ctx.mat('rockCool', { edge: 0.5, convex: 0.3 }));
  bitMesh.name = 'boulder:bits';
  root.add(bitMesh);
  // 石缝里的枯草团（圆顶 + 球面法线，草秆色）
  const tufts: THREE.BufferGeometry[] = [];
  for (const [x, z, s] of [
    [-2.2, 0.9, 0.42],
    [0.9, 1.75, 0.36],
    [2.4, 0.4, 0.3],
  ] as const) {
    const g = new THREE.IcosahedronGeometry(s, 1).scale(1.3, 0.75, 1);
    // 球面法线：每团自己的
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    const nrm = new THREE.Float32BufferAttribute(new Float32Array(p.count * 3), 3);
    const t = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      t.set(p.getX(i), p.getY(i) + s * 0.3, p.getZ(i)).normalize();
      nrm.setXYZ(i, t.x, t.y, t.z);
    }
    g.setAttribute('normal', nrm);
    g.translate(x, s * 0.3, z);
    g.deleteAttribute('uv');
    tufts.push(g);
  }
  const tuftMesh = new THREE.Mesh(
    mergeGeometries(tufts),
    ctx.mat('dryGrass', { lightUp: 0.3, bands: [0, 0.55], noise: 0.35, edge: 0.4, convex: 0.1, noShadowReceive: true }),
  );
  tuftMesh.name = 'boulder:tufts';
  root.add(tuftMesh);
  ctx.mats.prepare(root);
  // 碎石、草团不投影（麻点）；大石头投
  bitMesh.castShadow = false;
  tuftMesh.castShadow = false;
  return root;
}

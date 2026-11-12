// up-planter：女儿墙顶上的花槽（#94，×2）。2.4 × 0.35 × 0.35 米（27 × 4 × 4 设计纹素；花冒出槽口到 ≈ 0.5）。
// 陶土的长槽（朝镜头的正面 2 屏幕行：上面一条 1 纹素的槽沿，下面是槽身，中间嵌一条钴蓝的塔拉韦拉砖带）；
// 槽里一排天竺葵：绿叶 7 团（压扁的二十面体，从槽口往前、往两头垂一点）+ 红花 13 团（八面体，盖在叶子顶上和正面）。
// 团的法线 = 自己的球面法线 × 0.55 + 整排（一根沿 x 的轴）的法线 × 0.45（同 bougainvillea）。
// 在女儿墙上、背后是天 / 露台：不接投影，往上偏光 → 花顶亮档、正面中档。外观里它是南立面顶上的一条红。
// 材质：pot（槽）、canvasStripe（砖带，钴蓝）、palm（叶）、flowerRed（花）。三角形 ≈ 280。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

type G = THREE.BufferGeometry;
interface Blob {
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  rz: number;
}
/** 一团：二十面体 / 八面体压成椭球；法线 = 团的椭球法线和整排（轴在 y = ay、z = az 的一根横轴）法线的混合 */
function blobGeo(b: Blob, ay: number, az: number, small = false): G {
  const g = small ? new THREE.OctahedronGeometry(1, 0) : new THREE.IcosahedronGeometry(1, 0);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const n = new THREE.BufferAttribute(new Float32Array(p.count * 3), 3);
  const v = new THREE.Vector3();
  const w = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const own = new THREE.Vector3(v.x / b.rx, v.y / b.ry, v.z / b.rz).normalize();
    v.set(b.x + v.x * b.rx, b.y + v.y * b.ry, b.z + v.z * b.rz);
    p.setXYZ(i, v.x, v.y, v.z);
    w.set(0, v.y - ay, v.z - az).normalize();
    own.multiplyScalar(0.55).addScaledVector(w, 0.45).normalize();
    n.setXYZ(i, own.x, own.y, own.z);
  }
  g.setAttribute('normal', n);
  return g;
}
const box = (w: number, h: number, d: number, x: number, y: number, z: number): G =>
  new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);

export function build(ctx: AssetCtx): THREE.Object3D {
  const T = ctx.texel;
  const W = 2.4;
  const D = 0.35;
  const H = 0.27;
  const rnd = ctx.rng(`up-planter:${ctx.variant}`);
  const j = (a: number) => (rnd() - 0.5) * 2 * a;

  const root = new THREE.Group();
  root.name = 'up-planter';
  const face = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number], noShadowReceive: true };
  // 槽：槽身（往里收半纹素）+ 槽沿
  const trough = mergeGeometries([box(W - T, H - T, D - T, 0, 0, 0), box(W, T, D, 0, H - T, 0)]);
  root.add(new THREE.Mesh(trough, ctx.mat('pot', { ...face, edge: 0.5, convex: 0.3 })));
  // 砖带：正面中间一条钴蓝（1 屏幕行），分成 7 段（段之间露陶土 1 纹素）
  const tiles: G[] = [];
  const N = 7;
  const seg = (W - 3 * T) / N;
  for (let i = 0; i < N; i++)
    tiles.push(
      new THREE.PlaneGeometry(seg - T, 0.11).translate(-(W - 3 * T) / 2 + (i + 0.5) * seg, 0.1, (D - T) / 2 + 0.004),
    );
  root.add(
    new THREE.Mesh(
      mergeGeometries(tiles),
      ctx.mat('canvasStripe', { ...face, elem: undefined, tones: undefined, edge: 0, convex: 0 }),
    ),
  );

  // 花和叶
  const foliage = { noShadowReceive: true, lightUp: 0.4, noise: 0.3, edge: 0.22, convex: 0.15 };
  const leafM = ctx.mat('palm', {
    ...foliage,
    bands: [-0.5, 0.25],
    elem: { kind: 'leaves', size: [3.2, 3.2], hi: 0.15 },
  });
  const flowerM = ctx.mat('flowerRed', {
    ...foliage,
    bands: [-0.9, 0.18],
    elem: { kind: 'leaves', size: [3.5, 3.5], hi: 0.15 },
    ramp: [0xf84a3c, 0xcc3048, 0x7a265c],
    tones: {
      bands: [
        [0xf84a3c, 0xff6650, 0xe43c38], // L 109 / 128 / 96
        [0xcc3048, 0xd83a52, 0xbc2a42],
        [0x7a265c, 0x883068, 0x6c2052],
      ],
      seam: [0xd83838, 0xa82840, 0x5a1c48],
      hi: [0xff8468, 0xec5262, 0x9c3c7a],
    },
  });
  const leaves: G[] = [];
  const flowers: G[] = [];
  const AY = H - 0.1;
  const AZ = -0.05;
  const NL = 7;
  for (let i = 0; i < NL; i++) {
    const x = -W / 2 + 0.2 + (i * (W - 0.4)) / (NL - 1) + j(0.04);
    leaves.push(
      blobGeo({ x, y: H + 0.05 + j(0.02), z: 0.02 + j(0.02), rx: 0.2, ry: 0.14 + j(0.02), rz: 0.15 }, AY, AZ),
    );
  }
  const NF = 13;
  for (let i = 0; i < NF; i++) {
    const x = -W / 2 + 0.16 + (i * (W - 0.32)) / (NF - 1) + j(0.05);
    const up = i % 2 === 0;
    flowers.push(
      blobGeo(
        {
          x,
          y: H + (up ? 0.15 : 0.06) + j(0.02),
          z: up ? -0.02 : 0.1,
          rx: 0.125 + j(0.015),
          ry: 0.105,
          rz: 0.1,
        },
        AY,
        AZ,
        true,
      ),
    );
  }
  root.add(new THREE.Mesh(mergeGeometries(leaves), leafM));
  root.add(new THREE.Mesh(mergeGeometries(flowers), flowerM));
  ctx.mats.prepare(root);
  return root;
}

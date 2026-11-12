// bougainvillea：攀在南拱廊柱子上的三角梅（#8，×2）。1.2 × 3.8 × 0.5 米（13 × 42 × 6 设计纹素）。本地原点 = 柱子正面的落地点，
// −z 0.15 处是墙面（柱子 0.57 宽，两边是拱）。
// 一根木质的老藤（branch）从地上斜着爬上柱子；绿叶（palm，叶团元素 3.2 纹素）顺着柱子一串、到拱顶上沿铺开、两头往拱里垂一点；
// 洋红的花团（leaves 元素 4 纹素的团，"会所唯一的一块冷粉色"）盖在叶子的正面和顶上，叶子从花团之间露出来。
// 每一团是一个压扁的二十面体（花团是八面体），法线 = 团自己的球面法线 × 0.55 + 整丛（柱子一串 / 拱上一片）的法线 × 0.45（整丛一个圆顶，
// 不是每团一个亮顶）。挂在背光的墙上：不接投影、往上偏光 0.4 + 低阈值 → 正面落中档、顶上落亮档（同树冠的做法）。
// 变体：ctx.variant 换团的大小和位置（ctx.rng）。
// 材质：palm（叶）、clothPurple（花：借 club 组调色，亮档 / 中档几乎不染橙，洋红留得住；ramp + tones 覆盖）、branch。
// 三角形 ≈ 320（叶 10 团 × 20、花 12 团 × 8、藤 24）。
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

/** 一团：二十面体（20 个三角形）/ 八面体（8 个，小花团）压成椭球；法线 = 团的椭球法线和整丛法线的混合 */
function blobGeo(b: Blob, mass: THREE.Vector3, small = false): G {
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
    w.copy(v).sub(mass).normalize();
    own.multiplyScalar(0.55).addScaledVector(w, 0.45).normalize();
    n.setXYZ(i, own.x, own.y, own.z);
  }
  g.setAttribute('normal', n);
  return g;
}
function merge(geos: G[]): G {
  const m = mergeGeometries(geos);
  if (!m) throw new Error('bougainvillea: merge failed');
  return m;
}

export function build(ctx: AssetCtx): THREE.Object3D {
  const g = new THREE.Group();
  const rnd = ctx.rng(`bougainvillea:${ctx.variant}`);
  const j = (a: number) => (rnd() - 0.5) * 2 * a;
  const flip = ctx.variant % 2 === 1 ? -1 : 1;

  const foliage = { noShadowReceive: true, lightUp: 0.4, noise: 0.35, edge: 0.22, convex: 0.15 };
  const leaf = ctx.mat('palm', {
    ...foliage,
    noise: 0.25,
    bands: [-0.5, 0.25],
    elem: { kind: 'leaves', size: [3.2, 3.2], hi: 0.15 },
  });
  const flower = ctx.mat('clothPurple', {
    ...foliage,
    bands: [-0.95, 0.18],
    elem: { kind: 'leaves', size: [4, 4], hi: 0.15 },
    ramp: [0xf070c8, 0xc8409c, 0x6a2a6a],
    tones: {
      bands: [
        [0xf070c8, 0xff8cd8, 0xe05cb8], // L 134 / 158 / 120（调完 155 / 179 / 136）
        [0xc8409c, 0xd04aa8, 0xb8388e],
        [0x6a2a6a, 0x783478, 0x5c2460],
      ],
      seam: [0xd050a8, 0xa03080, 0x4a1c50],
      hi: [0xffa0e0, 0xe060b8, 0x8a3c8a],
    },
  });
  const wood = ctx.mat('branch', { noShadowReceive: true, lightUp: 0.3, convex: 0.4 });

  // 整丛的两个"圆心"：柱子上那一串、拱上那一片（都在墙里面一点 → 正面的法线朝外）
  const colC = new THREE.Vector3(0, 1.6, -0.5);
  const topC = new THREE.Vector3(0, 3.0, -0.5);
  const leaves: G[] = [];
  const flowers: G[] = [];
  const L = (b: Blob, c: THREE.Vector3) => leaves.push(blobGeo(b, c));
  const F = (b: Blob, c: THREE.Vector3) => flowers.push(blobGeo(b, c, true));

  // ── 叶：柱子上一串（4 团，左右错开）+ 拱上一片（4 团）+ 两头往拱里垂（2 团） ──
  for (let i = 0; i < 4; i++) {
    const y = 0.75 + i * 0.6 + j(0.06);
    L({ x: flip * (i % 2 ? 0.08 : -0.06) + j(0.03), y, z: 0.0, rx: 0.3 + j(0.03), ry: 0.36, rz: 0.24 }, colC);
  }
  for (const [x, y, rx, ry] of [
    [-0.31, 3.12, 0.3, 0.3],
    [0.3, 3.18, 0.3, 0.3],
    [0.0, 3.42, 0.36, 0.3],
    [0.0, 2.9, 0.3, 0.28],
  ])
    L({ x: x * flip + j(0.03), y: y + j(0.04), z: 0.0, rx, ry, rz: 0.24 }, topC);
  for (const s of [-1, 1]) L({ x: s * 0.43, y: 2.62 + j(0.08), z: 0.0, rx: 0.13, ry: 0.32, rz: 0.12 }, topC);

  // ── 花团：盖在叶子正面、顶上；柱子上稀一点（下半截只有两团），拱上密 ──
  const flowerAt: [number, number, number, number][] = [
    // x, y, 横半径, 竖半径
    [-0.36, 3.3, 0.24, 0.22],
    [-0.14, 3.55, 0.24, 0.2],
    [0.16, 3.58, 0.24, 0.2],
    [0.36, 3.34, 0.24, 0.22],
    [0.2, 3.06, 0.22, 0.2],
    [-0.18, 3.02, 0.22, 0.2],
    [0.44, 2.8, 0.14, 0.2],
    [-0.44, 2.76, 0.14, 0.2],
    [0.08, 2.52, 0.2, 0.2],
    [-0.12, 2.08, 0.18, 0.2],
    [0.14, 1.6, 0.17, 0.18],
    [-0.1, 1.02, 0.15, 0.17],
  ];
  for (const [x, y, rx, ry] of flowerAt) {
    const c = y > 2.6 ? topC : colC;
    F({ x: x * flip + j(0.03), y: y + j(0.04), z: 0.15, rx: rx + j(0.02), ry, rz: 0.12 }, c);
  }

  // ── 老藤：地上一截（两段，斜着上柱子） ──
  const stem = merge([
    new THREE.BoxGeometry(0.24, 0.62, 0.2)
      .translate(0, 0.31, 0.0)
      .rotateZ(flip * 0.12)
      .toNonIndexed(),
    new THREE.BoxGeometry(0.22, 0.5, 0.18)
      .translate(0.0, 0.25, 0.0)
      .rotateZ(-flip * 0.2)
      .translate(flip * 0.06, 0.55, 0.0)
      .toNonIndexed(),
  ]);

  g.add(new THREE.Mesh(merge(leaves), leaf));
  g.add(new THREE.Mesh(merge(flowers), flower));
  g.add(new THREE.Mesh(stem, wood));
  g.traverse((o) => {
    o.castShadow = true;
  });
  ctx.mats.prepare(g);
  return g;
}

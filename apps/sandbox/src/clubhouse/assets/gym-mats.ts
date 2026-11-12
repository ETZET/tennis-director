// 团课房的瑜伽垫 ×8：两排、每排 4 张，长边南北（朝教练台），紫 / 青 / 珊瑚轮着来。
// 整块 3.8 × 0.1 × 3.4 米（42 × 0.7 × 38 设计纹素，一块深靛的薄垫底）；每张 0.63 × 1.62 米（7 × 18 纹素），一圈 1 纹素的深色边。
// 元素：垫面 planks（横向的防滑棱，每 0.27 米一道 1 纹素的亮条，几乎不变深浅）。
// 三角形 114（每张：底板盒 12 = 深色边 + 垫面 2；垫底 2）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

const T = 0.09;

type Ramp = [number, number, number];
/** 三种垫子：[垫面三档, 深色边三档]。紫、青借 club 组（暗档留蓝紫）；珊瑚借 fabricStripe（也是 club 组） */
const COLORS: { key: 'clothPurple' | 'clothTeal' | 'fabricStripe'; top: Ramp; rim: Ramp }[] = [
  { key: 'clothPurple', top: [0xb070f8, 0x8448d8, 0x4a2c90], rim: [0x9462dc, 0x6c46b4, 0x3a2a80] },
  { key: 'clothTeal', top: [0x50dcc4, 0x2aa8a4, 0x245e7c], rim: [0x34aaa0, 0x268088, 0x204a6a] },
  { key: 'fabricStripe', top: [0xff9478, 0xe0645e, 0x7a3a6a], rim: [0xe0645e, 0xb44a56, 0x642c5e] },
];

export function build(ctx: AssetCtx): THREE.Object3D {
  const g = new THREE.Group();
  const MW = 7 * T;
  const ML = 18 * T;
  const tops: THREE.BufferGeometry[][] = [[], [], []];
  const rims: THREE.BufferGeometry[][] = [[], [], []];
  // 列中心：间距 11.5 纹素（垫子之间 4.5 纹素的木地板）；排中心：±9.5 纹素（两排之间 1 纹素）
  const xs = [-17.25, -5.75, 5.75, 17.25].map((v) => v * T);
  const zs = [-9.5 * T, 9.5 * T];
  let k = 0;
  for (const z of zs) {
    for (const x of xs) {
      const c = k % 3;
      // 后排往右错一张颜色：两排不对成一样的竖条
      rims[c].push(new THREE.BoxGeometry(MW, 0.045, ML).translate(x, 0.04 + 0.0225, z));
      tops[c].push(new THREE.PlaneGeometry(MW - 2 * T, ML - 2 * T).rotateX(-Math.PI / 2).translate(x, 0.095, z));
      k++;
    }
    k++;
  }
  COLORS.forEach((col, i) => {
    if (!tops[i].length) return;
    const top = ctx.mat(col.key, {
      ramp: col.top,
      tones: undefined,
      edge: 0.05,
      convex: 0,
      elem: { kind: 'planks', p: [0, 0, 1, 3 * T], seam: 0, hi: 1 },
      toneW: [0.3, 0.3],
    });
    const rim = ctx.mat(col.key, { ramp: col.rim, tones: undefined, edge: 0.3, convex: 0.1 });
    g.add(new THREE.Mesh(mergeGeometries(tops[i]), top));
    g.add(new THREE.Mesh(mergeGeometries(rims[i]), rim));
  });
  // 垫底：一整块深靛的薄垫（3.8 × 3.4，y 0.04：房间的地板面在楼板上 0.03）—— 垫子之间露出来的是它，不是地板：
  // 垫子的深边和地板差 > 60 会在每张垫子两侧各出一条强边缘；和垫底只差 20～50
  g.add(
    new THREE.Mesh(
      new THREE.PlaneGeometry(3.8, 3.4).rotateX(-Math.PI / 2).translate(0, 0.04, 0),
      ctx.mat('clothBlue', { ramp: [0x5a4cb4, 0x443c90, 0x2c2866], tones: undefined, edge: 0.3, convex: 0 }),
    ),
  );
  ctx.mats.prepare(g);
  return g;
}

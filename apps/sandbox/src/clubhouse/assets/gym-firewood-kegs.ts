// B1 储藏间北墙的柴堆 + 两只酒桶（#159）：1.62 × 0.89 × 0.73 米 = 18 × 10 × 8 纹素，朝南（+z 对镜头）。
// 西半边柴堆（壁炉烧的，2F 会员休息室来扛）：深树皮色的一垛（8 × 7 行 × 8）、正面三排 3 纹素的圆木端面
// （浅木色的圈 + 1 纹素深色的芯，竖向拉长 √2 倍、屏幕上是圆的；中间那排错开半个 = 码柴，圈和圈之间露出深色树皮）；
// 东半边两只立着的酒桶：上下两截锥台拼出鼓肚（8 段）、两道深色铁箍，桶顶浅木色 + 深色塞子。
// 竖直方向按屏幕行排（1 行 = 1.414 纹素）。三角形 240（预算 300）。没有 userData。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

const FACE = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number], noShadowReceive: true };
const ROUND = { lightUp: 0.55, bands: [-0.45, -0.1] as [number, number], noShadowReceive: true };
const BRIGHT = { lightUp: 0.55, bands: [-0.9, -0.6] as [number, number], noShadowReceive: true };

export function build(ctx: AssetCtx): THREE.Object3D {
  const T = ctx.texel;
  const R = Math.SQRT2; // 竖面上的 1 屏幕行（纹素）
  const bins = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const put = (m: THREE.Material, g: THREE.BufferGeometry) => {
    const a = bins.get(m);
    if (a) a.push(g);
    else bins.set(m, [g]);
  };
  const box = (m: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number) =>
    put(m, new THREE.BoxGeometry(w * T, h * T, d * T).translate(x * T, (y + h / 2) * T, z * T));
  const disc = (m: THREE.Material, d: number, seg: number, x: number, y: number, z: number) =>
    put(m, new THREE.CircleGeometry((d / 2) * T, seg).scale(1, R, 1).translate(x * T, y * T, z * T));
  const decal = (m: THREE.Material, w: number, h: number, x: number, y: number, z: number) =>
    put(m, new THREE.PlaneGeometry(w * T, h * T).translate((x + w / 2) * T, (y + h / 2) * T, z * T));

  // ── 材质 ──
  const bark = ctx.mat('branch', { ...FACE, ramp: [0xb07a5a, 0x98625a, 0x4a3a66] });
  // 圆木端面：浅木色（画出来 L ≈ 165），芯和缝里的树皮都比它暗 ≈ 55（端面多，每个两条竖边，> 60 就是强边缘）
  const endWood = ctx.mat('woodWeathered', { ...BRIGHT, ramp: [0xd89e6a, 0xc08a5e, 0x6a5078], edge: 0.2 });
  const core = ctx.mat('woodWeathered', { ...BRIGHT, ramp: [0xa86448, 0x8a5040, 0x5a4470], edge: 0.1 });
  const keg = ctx.mat('wood', {
    ...ROUND,
    ramp: [0xe0985a, 0xb86a46, 0x5e3e6a],
    convex: 0.3,
  });
  const kegTop = ctx.mat('woodWeathered', { ramp: [0xe8b47c, 0xc08c66, 0x5e4a78], noShadowReceive: true, convex: 0.3 });
  const hoop = ctx.mat('ironwork', { ...ROUND, ramp: [0x9a7aa8, 0x86689a, 0x3a3060], convex: 0, edge: 0.3 });
  const bung = ctx.mat('ironwork', { ramp: [0x5a4a6a, 0x4a3a5a, 0x2a2440], noShadowReceive: true, edge: 0.1 });

  // ── 柴堆：x −9…−1，z −4…+4，7 行高；正面三排端面（3 纹素一个，排距 2 行、中间那排错开 1.5 纹素 = 码柴的样子）──
  const FX = -5; // 柴堆中心 x
  const zf = 4;
  box(bark, 8, 7 * R, 8, FX, 0, 0);
  const ends: [number, number][] = [
    [-7.5, 1.5],
    [-4.5, 1.5],
    [-1.5, 1.5],
    [-6, 3.5],
    [-3, 3.5],
    [-7.5, 5.5],
    [-4.5, 5.5],
    [-1.5, 5.5],
  ];
  for (const [x, r] of ends) {
    disc(endWood, 3, 8, x, r * R, zf + 0.004 / T);
    decal(core, 1, R, x - 0.5, (r - 0.5) * R, zf + 0.008 / T);
  }

  // ── 两只酒桶：圆心 x 2.4、6.6，半径 2（鼓肚 2.4），高 7 行；两道箍 ──
  const H = 7 * R;
  for (const kx of [2.4, 6.6]) {
    const r0 = 2.0;
    const r1 = 2.4;
    put(keg, new THREE.CylinderGeometry(r1 * T, r0 * T, (H / 2) * T, 8, 1, true).translate(kx * T, (H / 4) * T, 0));
    put(
      keg,
      new THREE.CylinderGeometry(r0 * T, r1 * T, (H / 2) * T, 8, 1, true).translate(kx * T, ((3 * H) / 4) * T, 0),
    );
    put(kegTop, new THREE.CircleGeometry(r0 * T, 8).rotateX(-Math.PI / 2).translate(kx * T, H * T, 0));
    put(bung, new THREE.PlaneGeometry(T, T).rotateX(-Math.PI / 2).translate((kx + 0.5) * T, H * T + 0.004, 0.5 * T));
    // 箍：行 1…2、行 5…6（那儿的桶身半径 ≈ 2.17，箍比桶身大 0.25）
    const rr = r0 + ((r1 - r0) * 1.5) / 3.5 + 0.25;
    for (const hy of [1, 5])
      put(hoop, new THREE.CylinderGeometry(rr * T, rr * T, R * T, 8, 1, true).translate(kx * T, (hy + 0.5) * R * T, 0));
  }

  const root = new THREE.Group();
  root.name = 'gym-firewood-kegs';
  for (const [m, gs] of bins) root.add(new THREE.Mesh(gs.length > 1 ? mergeGeometries(gs) : gs[0], m));
  ctx.mats.prepare(root);
  return root;
}

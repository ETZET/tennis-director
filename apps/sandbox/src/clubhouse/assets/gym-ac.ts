// B1 机房的空调主机（#157）：1.44 × 1.15 × 0.9 米 = 16 × 12.7 × 10 纹素（机壳 14 宽 + 东侧铜管），朝南（+z 对镜头），背贴墙。
// 元素：机房青绿的钢板机壳（借 metal）+ 两条深靛的底轨；正面西边一个大圆风扇罩：深靛的外圈（7 纹素）、
// 中档的扇叶区 + 一道十字的叶片、浅色的轴心（2 纹素），竖向拉长 √2 倍、屏幕上是圆的；
// 东边一块"落了灰"的滤网：灰米色（低饱和、偏暖）、3 道 1 行的横暗缝；机顶 3 道横向通风缝；
// 东侧两根铜管（2 纹素）往北拐进墙。竖直方向按屏幕行排（1 行 = 1.414 纹素）。三角形 136（预算 200）。没有 userData。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

const FACE = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number], noShadowReceive: true };
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
  const decal = (m: THREE.Material, w: number, h: number, x: number, y: number, z: number, lift = 0) =>
    put(m, new THREE.PlaneGeometry(w * T, h * T).translate((x + w / 2) * T, (y + h / 2) * T, z * T + 0.004 + lift));
  const disc = (m: THREE.Material, d: number, seg: number, x: number, y: number, z: number, lift: number) =>
    put(m, new THREE.CircleGeometry((d / 2) * T, seg).scale(1, R, 1).translate(x * T, y * T, z * T + lift));
  /** 顶面上的横条（纹素）：宽 w、深 d，中心 x、z，贴在 y 上 */
  const topStrip = (m: THREE.Material, w: number, d: number, x: number, y: number, z: number) =>
    put(m, new THREE.PlaneGeometry(w * T, d * T).rotateX(-Math.PI / 2).translate(x * T, y * T + 0.004, z * T));

  // ── 材质 ──
  // 机壳：青绿钢板（借 metal，提亮一点：亮 L 180 / 中 L 135 / 暗 L 78）
  const shell = ctx.mat('metal', { ...FACE, ramp: [0x4ad0b0, 0x24a296, 0x1e5874], convex: 0.5 });
  const rail = ctx.mat('ironwork', { ...FACE, ramp: [0x5a5a9a, 0x3a3a80, 0x262458] });
  const ring = ctx.mat('ironwork', { ...FACE, ramp: [0x4a4aa0, 0x34369a, 0x22244e], edge: 0.2 });
  const blades = ctx.mat('ironwork', { ...FACE, ramp: [0x6a74d0, 0x5462c4, 0x2e3266], edge: 0.1 });
  const hub = ctx.mat('clothWhite', { ...BRIGHT, ramp: [0xe0eaf0, 0xc0ccd8, 0x6a7aa0], edge: 0.1 });
  // 滤网：落了灰的灰米色（L ≈ 160，饱和度低 —— 这就是"该清了"的信号色）
  const filter = ctx.mat('woodWeathered', { ...FACE, ramp: [0xd8c8a8, 0xb4a490, 0x5c4c78], edge: 0.1 });
  const slit = ctx.mat('woodWeathered', { ...FACE, ramp: [0x9a8a80, 0x84746e, 0x4a3c66], edge: 0.1 });
  const vent = ctx.mat('metal', { ramp: [0x3a8a88, 0x2c6a76, 0x1e4060], noShadowReceive: true, edge: 0.1 });
  const copper = ctx.mat('rust', { ...FACE, ramp: [0xf0a060, 0xd07848, 0x6a3454], convex: 0.5 });

  // ── 机壳：15 × 8 行 × 10（z −5…+5），底轨 2 条（1 行）──
  const W = 14;
  box(rail, W - 2, R, 2, 0, 0, -3);
  box(rail, W - 2, R, 2, 0, 0, 3);
  box(shell, W, 8 * R, 10, 0, R, 0);
  const zf = 5;
  // 风扇罩：圆心 (−3, 行 5)，外圈 7、扇叶 5、十字叶片、轴心 2
  const FX = -2.5;
  const FY = 5 * R;
  disc(ring, 7, 14, FX, FY, zf, 0.004);
  disc(blades, 5, 12, FX, FY, zf, 0.008);
  decal(ring, 5, 0.5 * R, FX - 2.5, FY - 0.25 * R, zf, 0.006);
  decal(ring, 1, 2.5 * R, FX - 0.5, FY - 1.25 * R, zf, 0.006);
  disc(hub, 2, 8, FX, FY, zf, 0.012);
  // 滤网：东边 5 × 6 行（行 2…8），3 道横缝
  decal(filter, 5, 6 * R, 1.5, 2 * R, zf);
  for (let k = 0; k < 3; k++) decal(slit, 5, R, 1.5, (3 + k * 2) * R, zf, 0.002);
  // 机顶：3 道横向通风缝
  for (let k = 0; k < 3; k++) topStrip(vent, W - 4, 1, 0, 9 * R, -2.5 + k * 2.5);
  // 东侧两根铜管：从侧面伸出 2 纹素，再往北进墙
  for (const py of [3, 5.5]) {
    box(copper, 2, 2, 2, W / 2 + 1, py * R, 2);
    box(copper, 2, 2, 5, W / 2 + 1, py * R, -1.5);
  }

  const root = new THREE.Group();
  root.name = 'gym-ac';
  for (const [m, gs] of bins) root.add(new THREE.Mesh(gs.length > 1 ? mergeGeometries(gs) : gs[0], m));
  ctx.mats.prepare(root);
  return root;
}

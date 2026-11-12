// B1 前台大厅的饮水机（#136）：0.45 × 1.27 × 0.54 米 = 5 × 14 × 6 纹素（接水盘凸出 1 纹素）。
// 元素：白色机身（踢脚 1 行深靛）+ 正面会所蓝的柜门 + 出水面板（暗的出水凹槽、红 / 蓝两个龙头、接水盘）；
// 顶上倒扣的大水桶：几乎空了（信号 → 去储藏扛一桶）—— 桶身是很浅的淡蓝，只有底下一条细细的水线（隔着桶壁看见的一行深一点的蓝），
// 桶颈、桶口压在机身顶上。竖直方向按屏幕行排（1 行 = 1.414 纹素）。三角形 118（预算 150）。
// userData：setLevel(k)（桶里的水：0 = 快空了，默认 / 1 = 半桶 / 2 = 满）、level()。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

const FACE = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number], noShadowReceive: true };

export function build(ctx: AssetCtx): THREE.Object3D {
  const T = ctx.texel;
  const R = Math.SQRT2; // 竖面上的 1 屏幕行（纹素）
  const bins = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const put = (m: THREE.Material, g: THREE.BufferGeometry) => {
    const a = bins.get(m);
    if (a) a.push(g);
    else bins.set(m, [g]);
  };
  /** 盒子（纹素）：宽、高、深，x / z 中心，y 底 */
  const box = (m: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number) =>
    put(m, new THREE.BoxGeometry(w * T, h * T, d * T).translate(x * T, (y + h / 2) * T, z * T));
  /** 贴在正面（z）上的薄片（纹素）：宽 w、高 h，左下角 x、y */
  const decal = (m: THREE.Material, w: number, h: number, x: number, y: number, z: number) =>
    put(m, new THREE.PlaneGeometry(w * T, h * T).translate((x + w / 2) * T, (y + h / 2) * T, z * T + 0.004));
  /** 竖的圆柱（纹素）：半径、高、段数，y 底 */
  const cyl = (m: THREE.Material, r: number, h: number, seg: number, y: number, open = false) =>
    put(m, new THREE.CylinderGeometry(r * T, r * T, h * T, seg, 1, open).translate(0, (y + h / 2) * T, 0));

  // ── 材质 ──
  // 机身：白（clothWhite，正面落中档 #c6bcd4、顶面亮档）
  const shell = ctx.mat('clothWhite', { ...FACE, convex: 0.4 });
  const kick = ctx.mat('ironwork', { ...FACE, ramp: [0x4a4a7a, 0x34345e, 0x262448] });
  // 出水面板：会所蓝（借 clothBlue，提亮：L 150 / 118 / 70）
  const panel = ctx.mat('clothBlue', { ...FACE, ramp: [0x6aa2ec, 0x4a82dc, 0x2a3e8a] });
  const recess = ctx.mat('ironwork', { ...FACE, ramp: [0x3a3a66, 0x2c2a52, 0x201e40], edge: 0.2 });
  const hot = ctx.mat('clothRed', { ...FACE, bands: [-0.9, -0.6] });
  const cold = ctx.mat('jug', { ...FACE, bands: [-0.9, -0.6] });
  // 空桶：很浅的淡蓝（借 jug：L 226 / 196 / 130），侧沿亮、正中中档
  const jug = ctx.mat('jug', {
    lightUp: 0.55,
    bands: [-0.45, -0.1],
    noShadowReceive: true,
    ramp: [0xb8ecf6, 0x88d2ea, 0x4e84c0],
    convex: 0.3,
  });
  // 桶底剩的一点水：深一点的蓝（L 150），桶身最下面一行
  const water = ctx.mat('water', {
    lightUp: 0.55,
    bands: [-0.45, -0.1],
    noShadowReceive: true,
    ramp: [0x6ad0e4, 0x3aa4cc, 0x2e5c92],
    convex: 0.2,
  });
  const neck = ctx.mat('jug', { ...FACE, ramp: [0x8ac8e0, 0x5aa6cc, 0x3a6aa0] });

  // ── 机身：5 × 6 行 × 5（≈ 0.45 × 0.85 × 0.45 米），踢脚 1 行往里收 1 纹素 ──
  box(kick, 4, R, 4, 0, 0, 0);
  box(shell, 5, 5 * R, 5, 0, R, 0);
  // 正面：会所蓝的柜门（行 1…3）+ 出水面板（行 3…6：凹槽行 4…5，红 / 蓝龙头在槽顶，接水盘在槽底凸出 1 纹素）
  const zf = 2.5;
  decal(panel, 5, 2 * R, -2.5, R, zf);
  decal(panel, 5, 2.5 * R, -2.5, 3 * R, zf);
  decal(recess, 3, R, -1.5, 4 * R, zf + 0.01);
  decal(hot, 1, R, -1.5, 4 * R, zf + 0.02);
  decal(cold, 1, R, 0.5, 4 * R, zf + 0.02);
  box(recess, 3, 0.5 * R, 1, 0, 3.5 * R, 3);

  // ── 水桶：桶颈 1 行压在机身顶（y = 6 行），桶身 3 行（半径 2.4 纹素），最下面 1 行是剩的水 ──
  const Y0 = 6 * R;
  cyl(neck, 1.2, R, 6, Y0);
  cyl(water, 2.4, R, 8, Y0 + R, true);
  cyl(jug, 2.4, 2 * R, 8, Y0 + 2 * R);

  const root = new THREE.Group();
  root.name = 'gym-water';
  const fill = (to: THREE.Object3D) => {
    for (const [m, gs] of bins) {
      const list = gs.some((g) => !g.index) ? gs.map((g) => (g.index ? g.toNonIndexed() : g)) : gs;
      to.add(new THREE.Mesh(list.length > 1 ? mergeGeometries(list) : list[0], m));
    }
    bins.clear();
    return to;
  };
  // 机身 + 桶颈 + 桶底那一行水（一直在）+ 空桶身（水位 0，默认）
  fill(root);
  const emptyG = root.children.find((c) => (c as THREE.Mesh).material === jug) ?? null;
  // 水位 1（半桶）：下面两行水 + 上面一行空；水位 2（满）：三行都是水，桶顶一块水色的盖
  const waterTop = ctx.mat('water', { ramp: [0x7adcec, 0x4ab4d8, 0x2e5c92], noShadowReceive: true, convex: 0.2 });
  cyl(water, 2.4, R, 8, Y0 + 2 * R, true);
  cyl(jug, 2.4, R, 8, Y0 + 3 * R);
  const halfG = fill(new THREE.Group());
  cyl(water, 2.4, 2 * R, 8, Y0 + 2 * R, true);
  put(waterTop, new THREE.CircleGeometry(2.4 * T, 8).rotateX(-Math.PI / 2).translate(0, (Y0 + 4 * R) * T, 0));
  const fullG = fill(new THREE.Group());
  root.add(halfG, fullG);
  ctx.mats.prepare(root);
  // 开关（stage 3）：setLevel(k) 桶里的水 0 = 快空了（默认，原来的样子）/ 1 = 半桶 / 2 = 满
  let level = 0;
  root.userData.setLevel = (k: number) => {
    level = Math.max(0, Math.min(2, Math.round(k)));
    if (emptyG) emptyG.visible = level === 0;
    halfG.visible = level === 1;
    fullG.visible = level === 2;
  };
  root.userData.level = () => level;
  root.userData.setLevel(0);
  return root;
}

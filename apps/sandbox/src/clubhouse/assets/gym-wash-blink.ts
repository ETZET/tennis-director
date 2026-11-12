// B1 洗衣房：烘干机上挂的闪灯小面板（#151，"洗完了"的信号）：0.54 × 0.38 × 0.09 米 = 6 × 3 行 × 1 纹素。
// 场景里挂在东头那台烘干机的正面上半截（y 0.75…1.13）。元素：深靛的小外壳（顶上露 1 行）+ 正面下两行黄色面板（亮档）+ 面板上面那行一盏 4 纹素 × 1 行的灯：
// 灭的时候是暗琥珀色，亮的时候换成近白的亮黄，面板整块提亮一档（光晕，6 × 2 行）。
// userData.update(dt, t)：每秒闪一次（亮 0.5 秒、灭 0.5 秒），只切换"亮"那一组网格的 visible。setActive(on)：false = 不闪（灭着），默认 true。
// 三角形 16（亮的时候 20；预算 40）。
import * as THREE from 'three';
import type { AssetCtx } from '../ctx';

const FACE = { lightUp: 0.55, bands: [-0.9, -0.6] as [number, number], noShadowReceive: true };

export function build(ctx: AssetCtx): THREE.Object3D {
  const T = ctx.texel;
  const R = Math.SQRT2; // 竖面上的 1 屏幕行（纹素）
  const root = new THREE.Group();
  root.name = 'gym-wash-blink';
  const zf = 0.5 * T; // 面板正面

  // 外壳：深靛（顶上露 1 行 + 顶面），正面下两行是黄色的面板（借 flowerYellow，正面亮档 #ffd23c）
  const shell = ctx.mat('ironwork', {
    lightUp: 0.55,
    bands: [-0.45, 0.35],
    noShadowReceive: true,
    ramp: [0x5a5a9a, 0x3a3a80, 0x262458],
  });
  root.add(new THREE.Mesh(new THREE.BoxGeometry(6 * T, 3 * R * T, T).translate(0, 1.5 * R * T, 0), shell));
  const body = ctx.mat('flowerYellow', { ...FACE, edge: 0.1 });
  root.add(new THREE.Mesh(new THREE.PlaneGeometry(6 * T, 2 * R * T).translate(0, R * T, zf + 0.002), body));
  // 灭的灯：暗琥珀（L ≈ 110），面板上面那一行
  const off = ctx.mat('flowerYellow', { ...FACE, ramp: [0xb0702e, 0x8a5434, 0x5a3450], edge: 0.1 });
  root.add(new THREE.Mesh(new THREE.PlaneGeometry(4 * T, R * T).translate(0, 1.5 * R * T, zf + 0.004), off));

  // 亮：光晕（淡黄，盖住整个正面）+ 灯（近白的亮黄）
  const halo = ctx.mat('flowerYellow', { ...FACE, ramp: [0xffe44a, 0xf4c040, 0x8a5466], edge: 0.1 });
  const lamp = ctx.mat('ball', { ...FACE, ramp: [0xfffcd0, 0xf4f0a0, 0x8a8a5a], edge: 0.1 });
  const on = new THREE.Group();
  on.add(new THREE.Mesh(new THREE.PlaneGeometry(6 * T, 2 * R * T).translate(0, R * T, zf + 0.006), halo));
  on.add(new THREE.Mesh(new THREE.PlaneGeometry(4 * T, R * T).translate(0, 1.5 * R * T, zf + 0.008), lamp));
  root.add(on);

  ctx.mats.prepare(root);
  root.traverse((o) => {
    o.castShadow = false;
  });
  // 开关（stage 3）：setActive(false) = 没有洗完的衣服，灯灭着不闪（默认 true = 一直闪）
  let active = true;
  root.userData.update = (_dt: number, t: number) => {
    on.visible = active && Math.floor(t * 2) % 2 === 0;
  };
  root.userData.setActive = (a: boolean) => {
    active = a;
    if (!a) on.visible = false;
  };
  root.userData.active = () => active;
  return root;
}

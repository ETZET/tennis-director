// gym-mirror · B1 自由重量区北墙的一整条镜墙，朝南（+z 朝镜头）。
// 尺寸 7.65 × 1.8 × 0.06 米（85 × 20 × 1 设计纹素）；板底 = 放置点的 y（slots-b1 给的是楼板 + 0.35）。
// 元素：一块深色背板（露出来就是 1 纹素的框 + 面板之间 1 纹素的缝）、6 块玻璃（每块 13 纹素 ≈ 1.17 米），
//   每块玻璃：上面是冷银蓝，下面三行是倒映的绿胶地（更暗的青），2～3 道斜的亮光痕（3 / 2 / 2 纹素宽，往右上斜，每块板位置不同）。
// 朝镜头的竖直面：lightUp + 低 bands（落中档），不接投影；横的线按屏幕行（竖直 1 行 = 0.09 / 0.707 米）。
// 颜色故意比"银镜"饱和（午后配色的中档会把蓝洗灰 ≈ 1/3）：渲出来玻璃 S ≈ 0.45、光痕 ≈ 0.3；光痕和玻璃亮度差 < 60（没有强边缘）。
// 三角形：背板 12 + 玻璃 6 × 2 × 2 + 光痕 15 × 2 = 66（预算 80）。不投影、不接投影。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

export function build(ctx: AssetCtx): THREE.Object3D {
  const T = ctx.texel;
  const R = T / Math.SQRT1_2; // 竖直方向一屏幕行（米）
  const rnd = ctx.rng('gym-mirror:streaks');
  const face = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number], noShadowReceive: true, noise: 0 };
  const frameM = ctx.mat('ironwork', { ...face, ramp: [0x6a80c4, 0x4656ae, 0x303a78], edge: 0.4, convex: 0.2 });
  const glassM = ctx.mat('jug', { ...face, ramp: [0x70a6f0, 0x4888e8, 0x3a5498], edge: 0.1, convex: 0 });
  const floorM = ctx.mat('jug', { ...face, ramp: [0x2e90b0, 0x187ea0, 0x22466e], edge: 0.1, convex: 0 });
  const hiM = ctx.mat('jug', { ...face, ramp: [0xa8d4fc, 0x88bef8, 0x6a8cc4], edge: 0.05, convex: 0 });
  const hi2M = ctx.mat('jug', { ...face, ramp: [0x88baf8, 0x6aa6f2, 0x5478b8], edge: 0.05, convex: 0 });

  const parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const add = (m: THREE.Material, g: THREE.BufferGeometry) => {
    const list = parts.get(m) ?? [];
    list.push(g);
    parts.set(m, list);
  };
  /** 朝 +z 的矩形（x0..x1, y0..y1）在 z */
  const rect = (m: THREE.Material, x0: number, x1: number, y0: number, y1: number, z: number) =>
    add(m, new THREE.PlaneGeometry(x1 - x0, y1 - y0).translate((x0 + x1) / 2, (y0 + y1) / 2, z));
  /** 斜的光痕：平行四边形，底边 [x0, x0 + w]、顶边往右挪 dx */
  const streak = (m: THREE.Material, x0: number, w: number, y0: number, y1: number, dx: number, z: number) => {
    const g = new THREE.PlaneGeometry(1, 1);
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const top = p.getY(i) > 0;
      const right = p.getX(i) > 0;
      p.setXYZ(i, x0 + (right ? w : 0) + (top ? dx : 0), top ? y1 : y0, z);
    }
    add(m, g);
  };

  const N = 6;
  const PW = 13 * T; // 每块玻璃宽
  const W = (2 + N * 13 + (N - 1)) * T; // 框 1 + 6 块 + 5 道缝 = 85 纹素
  const H = 1.8;
  // 背板（框和缝的颜色）：z −0.03…0.01
  add(frameM, new THREE.BoxGeometry(W, H, 0.04).translate(0, H / 2, -0.01));
  const yG0 = R; // 玻璃底（框下沿一行）
  const yG1 = H - R; // 玻璃顶
  const yF = yG0 + 3 * R; // 倒影带的上沿
  for (let i = 0; i < N; i++) {
    const x0 = -W / 2 + T + i * (PW + T);
    rect(floorM, x0, x0 + PW, yG0, yF, 0.022);
    rect(glassM, x0, x0 + PW, yF, yG1, 0.022);
    // 光痕：一宽（3 纹素）一窄（2 纹素）平行、从倒影带上沿斜到玻璃顶（往右上挪 4 纹素）；
    // 每块板的位置、间隔不一样；放得下的板在右下再加一道短的
    const dx = 4 * T;
    const a = Math.floor(rnd() * 3);
    const gap = 1 + Math.floor(rnd() * 2);
    const s0 = x0 + a * T;
    const s1 = s0 + (3 + gap) * T;
    streak(hiM, s0, 3 * T, yF, yG1, dx, 0.03);
    streak(hi2M, s1, 2 * T, yF, yG1, dx, 0.03);
    const s2 = s1 + 3 * T;
    if (s2 + 2 * T + dx * 0.5 <= x0 + PW + 1e-6 && rnd() < 0.75)
      streak(hi2M, s2, 2 * T, yF, yF + 4 * R, dx * 0.5, 0.03);
  }

  const root = new THREE.Group();
  for (const [m, gs] of parts) root.add(new THREE.Mesh(mergeGeometries(gs), m));
  ctx.mats.prepare(root, { cast: false, receive: false });
  return root;
}

// B1 更衣室的储物柜一排（#140，男 / 女各一排）：2.34 × 1.78 × 0.45 米 = 26 × 19.8 × 5 纹素。
// 元素：深青的柜体（门缝 = 门和门之间露出来的 1 纹素柜体）+ 两层门（下 6 行、上 5 行，下层的下半截被坐板挡住），门色会所青 / 绿一格一格地换；
// 每扇门顶上两道 2 纹素宽的暗通风条、门边 1 纹素的亮把手；底下 1 行深靛踢脚；
// 柜前一条木的坐板（座面 0.45 米，1 纹素厚、2 纹素深，两只深色托架）—— 还在 0.45 米的规格里（柜体 3 纹素深 + 坐板 2 纹素）。
// 变体：v0 男更衣（青起头），v1 女更衣（绿起头、把手换暖黄）。竖直方向按屏幕行排（1 行 = 1.414 纹素）。
// 三角形 142（预算 250）。没有 userData。
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
  const box = (m: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number) =>
    put(m, new THREE.BoxGeometry(w * T, h * T, d * T).translate(x * T, (y + h / 2) * T, z * T));
  /** 贴在正面上的薄片（纹素）：宽 w、高 h，左下角 x、y */
  const decal = (m: THREE.Material, w: number, h: number, x: number, y: number, z: number, lift = 0) =>
    put(m, new THREE.PlaneGeometry(w * T, h * T).translate((x + w / 2) * T, (y + h / 2) * T, z * T + 0.004 + lift));

  const women = ctx.variant % 2 === 1;
  // ── 材质 ──
  // 柜体（门缝的颜色）：深青（L 151 / 122 / 72）
  const carcass = ctx.mat('seat', { ...FACE, ramp: [0x3cb0a0, 0x1e8c86, 0x164a6a] });
  const capMat = ctx.mat('seat', { ramp: [0x5ee2bc, 0x34bca0, 0x24607a], noShadowReceive: true });
  const kick = ctx.mat('ironwork', { ...FACE, ramp: [0x4a4a9a, 0x3a3480, 0x262458] });
  // 门：会所青（中档 L 174）和会所绿（中档 L 181）。正面落中档；两种门的亮度差 < 15（并排的竖边不出强边缘）
  const doorTeal = ctx.mat('clothTeal', { ...FACE, ramp: [0x5adcc8, 0x2cc4b0, 0x24607a] });
  const doorGreen = ctx.mat('seat', { ...FACE, ramp: [0x7ad890, 0x48c070, 0x2a6a6a] });
  // 通风条、门缝都只比门暗 50～58（竖边每行都算横向相邻差，> 60 = 强边缘）
  const vent = ctx.mat('seat', { ...FACE, ramp: [0x3cb0a0, 0x1e8c86, 0x164a6a], edge: 0.1 });
  const handle = women
    ? ctx.mat('flowerYellow', { ...FACE, bands: [-0.9, -0.6], ramp: [0xf6e08a, 0xe4b450, 0x8a5466] })
    : ctx.mat('clothWhite', { ...FACE, bands: [-0.9, -0.6], ramp: [0xc8f0e0, 0xa8d8cc, 0x5a7a9a] });
  const seat = ctx.mat('wood', { ramp: [0xe8a868, 0xb87452, 0x5e426e], noShadowReceive: true });
  const bracket = ctx.mat('ironwork', { ...FACE });

  // ── 柜体：27 × 14 行 × 3（z −2.5…+0.5）──
  const W = 26;
  const ZB = -1; // 柜体中心 z
  const zf = ZB + 1.5; // 柜门那一面
  box(kick, W - 1, R, 2, 0, 0, ZB - 0.5);
  box(carcass, W, 13 * R, 3, 0, R, ZB);
  // 柜顶：一层浅薄荷色的顶板（亮档 L ≈ 200；柜体本色的顶面只有 L 150，整排柜子没有亮面）
  put(capMat, new THREE.PlaneGeometry(W * T, 3 * T).rotateX(-Math.PI / 2).translate(0, 14 * R * T + 0.004, ZB * T));
  // 门：5 列 × 2 层，每扇 4 纹素宽，门缝 1 纹素，两头各留 1 纹素柜体边；
  //   竖向按整行：踢脚 行 0…1、下层门 行 1…7、中缝 行 7…8、上层门 行 8…13、顶缝 行 13…14
  const COLS = 5;
  const dw = 4;
  const x0 = -((COLS * dw + (COLS - 1)) / 2);
  for (let c = 0; c < COLS; c++) {
    const x = x0 + c * (dw + 1);
    for (let t = 0; t < 2; t++) {
      const y = t === 0 ? R : 8 * R;
      const h = t === 0 ? 6 * R : 5 * R;
      const teal = (c + t + (women ? 1 : 0)) % 2 === 0;
      decal(teal ? doorTeal : doorGreen, dw, h, x, y, zf);
      // 通风条：门顶下面两道 2 纹素宽 × 1 行（中间隔 1 行）
      decal(vent, 2, R, x + 1, y + h - 2 * R, zf, 0.001);
      decal(vent, 2, R, x + 1, y + h - 4 * R, zf, 0.001);
      // 把手：门右沿 1 纹素 × 1 行
      decal(handle, 1, R, x + dw - 1, y + 2 * R, zf, 0.001);
    }
  }
  // ── 坐板：柜前 2 纹素深（z +0.5…+2.5），座面在 0.45 米，两只托架 ──
  const SY = 0.45 / T; // 座面高（纹素）
  box(seat, W - 2, 1, 2, 0, SY - 1, zf + 1);
  for (const sx of [-1, 1]) box(bracket, 1, SY - 1, 2, sx * (W / 2 - 4), 0, zf + 1);

  const root = new THREE.Group();
  root.name = 'gym-lockers';
  for (const [m, gs] of bins) root.add(new THREE.Mesh(gs.length > 1 ? mergeGeometries(gs) : gs[0], m));
  ctx.mats.prepare(root);
  return root;
}

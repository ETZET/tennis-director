// #57 卖空的一格（信号）：贴在东边那架纪念品架（shop-merch-shelves 中格的西半边）正面的一块薄板。
// 尺寸：0.63 宽 × 0.51 高 × 0.04 深（7 纹素 × 4 行；竖直 1 行 = √2 纹素 = 0.127 米）。
// 画的是"空了的一格"：底下 1 行胡桃木隔板前沿（和纪念品架同色），上面 3 行空格子的暗底（暗玫瑰色，最上 1 行更暗 = 上一层隔板下的影子），
// 隔板前沿上挂一张杏色价签（4 纹素 × 2 行），价签上一道红斜杠 = "卖完了"（没有字）。
// 明暗：暗底 L ≈ 110 / 价签 L ≈ 180 / 红杠、隔板 L ≈ 125～130（价签和暗底差 ≈ 70，只有 1 处强边缘）。
// 全是朝镜头的平面（厚 0.04 米，顶面看不见）。材质：timber、ironwork（借名，暗底）、counterTop、fabricStripe。三角形 10。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

export function build(ctx: AssetCtx): THREE.Object3D {
  const T = ctx.texel;
  const R = Math.SQRT2; // 竖直 1 屏幕行（纹素单位）
  const parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  /** 朝 +z 的矩形（纹素坐标：x 从中心、y 从底）；z 米 */
  const quad = (m: THREE.Material, x0: number, x1: number, y0: number, y1: number, z: number, rot = 0) => {
    const g = new THREE.PlaneGeometry((x1 - x0) * T, (y1 - y0) * T);
    if (rot) g.rotateZ(rot);
    g.translate(((x0 + x1) / 2) * T, ((y0 + y1) / 2) * T, z);
    const list = parts.get(m) ?? [];
    list.push(g);
    parts.set(m, list);
  };
  const face = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number], noShadowReceive: true, convex: 0 };
  const wood = ctx.mat('timber', { ...face, edge: 0.35, ramp: [0xc8865c, 0xa86a50, 0x5a3c66] });
  const hole = ctx.mat('ironwork', { ...face, edge: 0.3, ramp: [0xbc6a7a, 0xa85a6c, 0x4a2c5c] });
  const shade = ctx.mat('ironwork', { ...face, edge: 0.3, ramp: [0xa65a70, 0x944c62, 0x422650] });
  const tag = ctx.mat('counterTop', { ...face, edge: 0.4, ramp: [0xf4c494, 0xe0a87c, 0x8a78aa] });
  const red = ctx.mat('fabricStripe', { ...face, edge: 0.2, ramp: [0xff8a62, 0xe86058, 0x6a2a5e] });

  const X = 3.5; // 半宽 3.5 纹素 = 0.315 米
  const zb = -0.02;
  const zf = 0.02;
  quad(hole, -X, X, R, 3 * R, zb); // 空格子的暗底
  quad(shade, -X, X, 3 * R, 4 * R, zb); // 上一层隔板下的影子
  quad(wood, -X, X, 0, R, zf - 0.01); // 隔板前沿
  // 价签：挂在隔板前沿上（下半压着前沿、上半进空格），偏西
  const tx0 = -2.5;
  const tx1 = 1.5;
  quad(tag, tx0, tx1, 0.5 * R, 2.5 * R, zf - 0.005);
  // 红斜杠：1 纹素粗，从价签左下到右上
  const len = Math.hypot(tx1 - tx0, 2 * R) - 1;
  const ang = Math.atan2(2 * R, tx1 - tx0);
  const cx = (tx0 + tx1) / 2;
  const cy = 1.5 * R;
  quad(red, cx - len / 2, cx + len / 2, cy - 0.5, cy + 0.5, zf - 0.002, ang);

  const root = new THREE.Group();
  for (const [m, gs] of parts) {
    const mesh = new THREE.Mesh(gs.length > 1 ? mergeGeometries(gs) : gs[0], m);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    root.add(mesh);
  }
  return root;
}

// 泳池躺椅：白漆框（一圈托盘 + 4 条短腿）+ 一条浅水青的垫子（三段：靠背、身子、脚），靠背在北端（−z）抬起 35°。
// 0.8 × 0.45（平躺那段；靠背顶到 ≈ 0.75）× 2.0 米，长边沿 z。本地原点 = 脚印中心的地面。
// 俯视 45° 垫子是主面：大块、安静（不加元素，段和段之间一行缝）；靠背顶上一块青绿小枕头是唯一的一点深色。
// 一种材质一个网格；小道具不接投影（靠背投在垫子上的影只剩毛边麻点）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

/** 设计纹素（米）、地面纵深 / 竖直方向一个屏幕行（米） */
const T = 0.09;
const ROW = T / 2 / Math.SQRT1_2; // 1× 下一个屏幕行 ≈ 0.064 米；两行 = 一个设计纹素行

/** 道具：光往上偏一半 → 顶面亮、朝镜头的侧面中档、底面暗 */
const PROP = { lightUp: 0.5, bands: [-0.45, 0.5] as [number, number] };

/** 盒子：中心 (x, y, z) */
function box(w: number, h: number, d: number, x: number, y: number, z: number) {
  return new THREE.BoxGeometry(w, h, d).translate(x, y, z);
}

export function build(ctx: AssetCtx): THREE.Object3D {
  const g = new THREE.Group();
  g.name = 'lounger';
  const W = 0.8;
  const L = 2.0;
  const legH = 0.2;
  const trayH = 0.1; // 框的厚度（侧面一行多）
  const trayY = legH + trayH / 2; // 框中心
  const topY = legH + trayH; // 框顶 0.3
  const cushT = 0.13; // 垫子厚 ≈ 1 设计行
  const gap = 2 * ROW; // 段缝 ≈ 1 设计纹素行
  const hinge = -0.32; // 靠背的铰点（z）
  const backLen = 0.66;
  const tilt = (35 * Math.PI) / 180;

  // ── 白漆框：平的那段托盘 + 靠背托盘（绕铰点抬起）+ 4 条腿 + 靠背下的撑杆 ──
  const frame: THREE.BufferGeometry[] = [];
  const flatLen = L / 2 - hinge; // 铰点到脚端
  frame.push(box(W, trayH, flatLen, 0, trayY, hinge + flatLen / 2));
  const backTray = box(W, trayH, backLen, 0, trayH / 2 - trayH, -backLen / 2)
    .rotateX(tilt)
    .translate(0, topY, hinge);
  frame.push(backTray);
  // 腿：0.2 见方（2 纹素多），缩进一点；北端两条在靠背下面
  const lx = W / 2 - 0.12;
  for (const sx of [-1, 1]) {
    frame.push(box(0.2, legH, 0.2, sx * lx, legH / 2, L / 2 - 0.16));
    frame.push(box(0.2, legH, 0.2, sx * lx, legH / 2, -L / 2 + 0.2));
  }
  // 撑杆：靠背中段下面一根横档（3 纹素宽），把靠背撑住（从侧面看是个三角）
  frame.push(box(W - 0.1, 0.2, 0.12, 0, topY + 0.12, hinge - 0.42));
  g.add(new THREE.Mesh(mergeGeometries(frame), ctx.mat('stucco', PROP)));

  // ── 垫子：比框每边窄 1 纹素（框露出一圈 1 纹素白边）；三段 —— 脚、身子、靠背 ──
  const cw = W - 2 * T;
  const cushion: THREE.BufferGeometry[] = [];
  const footLen = 0.5;
  const zFoot1 = L / 2 - T; // 脚端也让出 1 纹素白边
  const zFoot0 = zFoot1 - footLen;
  const zBody1 = zFoot0 - gap;
  const zBody0 = hinge + gap / 2;
  cushion.push(box(cw, cushT, zFoot1 - zFoot0, 0, topY + cushT / 2, (zFoot0 + zFoot1) / 2));
  cushion.push(box(cw, cushT, zBody1 - zBody0, 0, topY + cushT / 2, (zBody0 + zBody1) / 2));
  const backCush = backLen - gap / 2 - T;
  cushion.push(
    box(cw, cushT, backCush, 0, cushT / 2, -gap / 2 - backCush / 2)
      .rotateX(tilt)
      .translate(0, topY, hinge),
  );
  // 浅水青（jug 这一家，彩度低），顶面几乎全亮档
  g.add(new THREE.Mesh(mergeGeometries(cushion), ctx.mat('jug', { ...PROP, edge: 0.3, convex: 0.25 })));

  // ── 小枕头：靠背顶上一块青绿（clothTeal），0.5 × 0.12 × 0.24 ──
  const pillow = box(cw - 2 * T, 0.12, 0.26, 0, cushT + 0.06, -backLen + 0.2)
    .rotateX(tilt)
    .translate(0, topY, hinge);
  g.add(new THREE.Mesh(pillow, ctx.mat('clothTeal', { ...PROP, edge: 0.3, convex: 0.2 })));

  ctx.mats.prepare(g, { receive: false });
  return g;
}

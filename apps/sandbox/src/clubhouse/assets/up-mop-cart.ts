// 拖把车（活的信号：没推回清洁间，停在酒吧东墙边）：深蓝塑料的底盘 + 四个小脚轮，−x 头一只红水桶（灰色的挤水器、一团米白拖把头，
// 2 纹素粗的铝拖把杆斜靠着往 +x 立起来），+x 头一个蓝色的工具箱，里面插着一块折起来的黄色"小心地滑"牌（三角棱柱，脊沿 z）。
// 0.9 × 1.0 × 0.5 米（10 × 11 × 6 设计纹素）。场景里 rotY = FACE.E（本地 −x 朝镜头）：看到的是水桶这头 + 顶面，黄牌的斜面朝镜头、在水桶后面高出来；
// 画廊里（rotY 0）看到长边，黄牌是一个三角。
// 元素：没有（小件，几块饱和的颜色）。
// 三角形 154（底盘 12、脚轮 48、工具箱 12 + 箱沿 12、水桶 16 + 水面 8、挤水器 12、拖把头 12、杆 12、黄牌 8、牌上的字条 2）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

const T = 0.09;
const box = (w: number, h: number, d: number, x: number, y: number, z: number) =>
  new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
const FRONT = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number] };

export function build(ctx: AssetCtx): THREE.Object3D {
  const g = new THREE.Group();
  const add = (gs: THREE.BufferGeometry[], m: THREE.Material) =>
    g.add(new THREE.Mesh(mergeGeometries(gs.map((x) => (x.index ? x.toNonIndexed() : x))), m));
  const L = 0.9;
  const D = 0.5;
  const WH = 0.08; // 脚轮高
  const PY = WH + 0.12; // 底盘顶
  const small = { ...FRONT, edge: 0.45, convex: 0.35, noShadowReceive: true, tones: undefined };

  // 底盘 + 工具箱：深蓝塑料
  const bx0 = 0.02; // 工具箱 −x 沿
  const BOXH = 0.42;
  add(
    [
      box(L, PY - WH, D, 0, WH, 0),
      box(L / 2 - bx0, BOXH, D - 0.06, (bx0 + L / 2) / 2, PY, 0),
      // 箱沿：顶上出 1 纹素的一圈（亮边）
      box(L / 2 - bx0 + 0.04, T, D - 0.02, (bx0 + L / 2) / 2, PY + BOXH - T, 0),
    ],
    ctx.mat('clothBlue', { ...small, ramp: [0x4a8ae8, 0x3a62c0, 0x2c3680] }),
  );
  // 脚轮：四个深色小块
  add(
    [-1, 1].flatMap((sx) => [-1, 1].map((sz) => box(T, WH, T, sx * (L / 2 - T), 0, sz * (D / 2 - T)))),
    ctx.mat('ironwork', { ...small, ramp: [0x5a5878, 0x3e3c5c, 0x2a2844] }),
  );
  // 红水桶（−x 头）：上口大、开口，里面看得到一圈内壁和灰蓝的水
  const bxC = -L / 2 + 0.2;
  const BR = 0.18;
  const BH = 0.3;
  add(
    [new THREE.CylinderGeometry(BR, BR - 0.03, BH, 8, 1, true).translate(bxC, PY + BH / 2, 0)],
    ctx.mat('carRed', { ...small, ramp: [0xf05a46, 0xc23c48, 0x6a2858], side: THREE.DoubleSide }),
  );
  add(
    [new THREE.CircleGeometry(BR - 0.02, 8).rotateX(-Math.PI / 2).translate(bxC, PY + BH - 0.08, 0)],
    ctx.mat('water', { ...small, ramp: [0x6a9cb4, 0x547e9e, 0x3a5a86], elem: undefined }),
  );
  // 挤水器（桶口 +x 半边，灰钢）+ 拖把头（米白一团，在桶口 −x 半边）
  add(
    [box(1.6 * T, 1.6 * T, 2 * BR - 0.04, bxC + 0.07, PY + BH - 0.06, 0)],
    ctx.mat('steel', { ...small, ramp: [0xb0c4dc, 0x7c94b8, 0x48587e] }),
  );
  add(
    [box(2.2 * T, 1.4 * T, 2.6 * T, bxC - 0.06, PY + BH - 0.07, -0.06)],
    ctx.mat('clothWhite', { ...small, ramp: [0xfff0d8, 0xe0ccbe, 0x9a86a4] }),
  );
  // 拖把杆：2 纹素粗的铝杆（冷色，和暖色的地板、黄牌分开），从拖把头斜着往 +x 立到 1.0 米（靠在工具箱上），
  // 往 −z 偏 0.12：场景里（−x 朝镜头）杆在黄牌旁边，不挡牌面
  const y0 = PY + BH - 0.02;
  const top = 1.0;
  const x0 = bxC - 0.06; // 杆脚在拖把头里
  const x1 = bx0 + 0.04;
  const len = Math.hypot(x1 - x0, top - y0);
  add(
    [
      new THREE.BoxGeometry(2 * T, len, 2 * T)
        .rotateZ(-Math.atan2(x1 - x0, top - y0))
        .translate((x0 + x1) / 2, (y0 + top) / 2, -0.12),
    ],
    ctx.mat('steel', { ...small, ramp: [0x9cd0f8, 0x5c94e0, 0x3a4c96] }),
  );
  // 黄色"小心地滑"牌：折起来插在工具箱里（三角棱柱，脊沿 z，底宽 0.3、露出箱沿 0.42）
  const sx = (bx0 + L / 2) / 2 + 0.02;
  const sb = PY + BOXH - 0.1;
  const sh = 0.52;
  const tri = new THREE.Shape([new THREE.Vector2(-0.15, 0), new THREE.Vector2(0.15, 0), new THREE.Vector2(0, sh)]);
  add(
    [new THREE.ExtrudeGeometry(tri, { depth: 0.3, bevelEnabled: false }).translate(sx, sb, -0.15)],
    ctx.mat('signPaint', { ...small, ramp: [0xffe830, 0xf8c820, 0x9a6a3c] }), // 借 signPaint（club 组）：午后配色不把黄染成桃色
  );
  // 牌上的字条（−x 斜面上一条 1 纹素的深色带：场景里朝镜头那面）
  const ang = Math.atan2(0.15, sh);
  add(
    [
      new THREE.PlaneGeometry(0.2, T)
        .rotateY(-Math.PI / 2)
        .rotateZ(-ang)
        .translate(sx - 0.15 * 0.45 - 0.006, sb + sh * 0.55, 0),
    ],
    ctx.mat('ironwork', { ...small, ramp: [0x5a4870, 0x4a3a62, 0x2c2848] }),
  );
  ctx.mats.prepare(g);
  return g;
}

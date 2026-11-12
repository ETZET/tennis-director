// B1 洗衣房北墙的洗衣机 + 烘干机一排（#150）：2.88 × 1.15 × 0.82 米 = 32 × 12.7 × 9 纹素（机顶上的篮子、毛巾到 1.5 米），朝南（+z 对镜头）。
// 从西往东：洗衣机、洗衣机、烘干机、烘干机，各 8 纹素宽、并排。元素：白色机身（正面中档、顶面亮档）+ 1 行深靛踢脚；
// 正面一个圆的舷窗：钢色的门圈（7 纹素）+ 深靛的玻璃（5 纹素，左上一纹素反光）—— 竖向拉长 √2 倍，45° 下在屏幕上是圆的；
// 顶上一行控制条：洗衣机会所蓝、烘干机橙；机顶一块浅钢蓝的面板（四边留 0.5 纹素白边）。烘干机的舷窗低一点（东头那台的上半截要挂闪灯 gym-wash-blink，
// 场景里在 y 0.75…1.05）。竖直方向按屏幕行排（1 行 = 1.414 纹素）。机顶上一只蓝色脏衣篮、一桶橙色洗衣液、一摞青 / 白毛巾。三角形 254（预算 400）。没有 userData。
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
  /** 正面上的圆（纹素）：直径 d（横向），竖向拉长 √2（屏幕上是圆的），圆心 x、y */
  const disc = (m: THREE.Material, d: number, x: number, y: number, z: number, lift: number) =>
    put(m, new THREE.CircleGeometry((d / 2) * T, 12).scale(1, R, 1).translate(x * T, y * T, z * T + lift));

  // ── 材质 ──
  // 机身：白（clothWhite，正面偏一点冷蓝）；门圈、玻璃、机身三层各差 ≈ 50 个亮度（不出 > 60 的强边缘）
  const shell = ctx.mat('clothWhite', { ...FACE, ramp: [0xf2f6ee, 0xb4ccf4, 0x6e78a4], convex: 0.4 });
  const kick = ctx.mat('ironwork', { ...FACE, ramp: [0x4a4a9a, 0x3a3480, 0x262458] });
  const rim = ctx.mat('metal', { ...FACE, ramp: [0xa8d0ec, 0x6c9cdc, 0x4a6488] });
  const glass = ctx.mat('ironwork', { ...FACE, ramp: [0x5a6ad0, 0x4c5cc4, 0x262c70] });
  const glint = ctx.mat('jug', { ...BRIGHT });
  const blue = ctx.mat('clothBlue', { ...FACE, ramp: [0x5a9ae8, 0x4a86e0, 0x2a3274] });
  const orange = ctx.mat('toolOrange', { ...FACE, ramp: [0xffa040, 0xf07a30, 0x7a3456] });
  // 机顶：浅钢蓝的面板（L ≈ 190；白的机顶上放什么都是 > 60 的强边缘）
  const lid = ctx.mat('metal', { ramp: [0x9cc8f4, 0x78a4dc, 0x4a5a98], noShadowReceive: true });
  const basket = ctx.mat('clothBlue', { ...FACE, ramp: [0x7ab4f4, 0x5a94e8, 0x2a3274], convex: 0.3 });
  const basketIn = ctx.mat('clothBlue', { ramp: [0x4a6ac8, 0x3a50a8, 0x2a3274], noShadowReceive: true, edge: 0.2 });
  const cap = ctx.mat('clothWhite', { ...FACE });
  const teal = ctx.mat('clothTeal', { ...FACE, bands: [-0.45, -0.25], convex: 0.3 });
  const towelW = ctx.mat('clothWhite', { ...FACE, bands: [-0.45, -0.25], convex: 0.3 });

  const ZB = 0; // 机身中心 z（−4.5…+4.5）
  const zf = ZB + 4.5;
  box(kick, 31, R, 8, 0, 0, ZB - 0.5);
  for (let i = 0; i < 4; i++) {
    const cx = -12 + i * 8;
    const dryer = i >= 2;
    box(shell, 8, 8 * R, 9, cx, R, ZB);
    put(
      lid,
      new THREE.PlaneGeometry(7 * T, 8 * T).rotateX(-Math.PI / 2).translate(cx * T, 9 * R * T + 0.004, -0.5 * T),
    );
    // 控制条（顶上 1 行）
    decal(dryer ? orange : blue, 8, R, cx - 4, 8 * R, zf);
    // 舷窗：洗衣机门圈 7 纹素（行 1…8）、玻璃 5；烘干机门圈 6（行 1…7）、玻璃 5 —— 上面空出来挂闪灯
    const cy = (dryer ? 4 : 4.5) * R;
    disc(rim, dryer ? 6 : 7, cx, cy, zf, 0.004);
    disc(glass, 5, cx, cy, zf, 0.008);
    decal(glint, 1, R, cx - 2, cy + 0.5 * R, zf, 0.008);
  }

  // ── 机顶上的东西（顶面 9 纹素深，45° 下是一大片白）：蓝色脏衣篮、橙色洗衣液桶、一摞青毛巾 ──
  const YT = 9 * R; // 机顶
  box(basket, 6, 2 * R, 5, -12, YT, -0.5);
  put(
    basketIn,
    new THREE.PlaneGeometry(4 * T, 3 * T).rotateX(-Math.PI / 2).translate(-12 * T, (YT + 2 * R) * T + 0.004, -0.5 * T),
  );
  box(orange, 3, 2 * R, 2, -3, YT, -1);
  box(cap, 1, 0.7, 1, -3.5, YT + 2 * R, -1);
  box(teal, 5, R, 4, 5, YT, -1);
  box(towelW, 5, R, 4, 5.5, YT + R, -1);
  box(teal, 5, R, 4, 5, YT + 2 * R, -1);

  const root = new THREE.Group();
  root.name = 'gym-washers';
  for (const [m, gs] of bins) root.add(new THREE.Mesh(gs.length > 1 ? mergeGeometries(gs) : gs[0], m));
  ctx.mats.prepare(root);
  return root;
}

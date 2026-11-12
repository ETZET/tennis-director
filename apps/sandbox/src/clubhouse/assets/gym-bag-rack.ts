// 拳击角的沙袋架：两根钢立柱（落地的脚沿 z）架一根钢梁，梁下挂三只沙袋（红 / 黑 / 蓝）。
// 3.06 × 2.61 × 0.81 米（34 × 29 × 9 设计纹素）。沙袋中心 y 1.2、底 0.6、顶 1.8（接口高度），直径 0.4（4.4 纹素）；
// 袋顶一圈浅色皮箍，两根 1 纹素的链子（链节 = 每 0.18 米一道 1 纹素的缝）往上收到梁下的挂钩。
// 中间那只（打的人站在它南边）轻轻晃：userData.update 转它的组（绕梁下的挂点）。
// 三角形 384（立柱 + 脚 + 梁 60；每只袋：袋身 10 段 40 + 皮箍 8 段 32 + 链 2 × 12 + 挂钩 12 → 108 × 3）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

const T = 0.09;
const box = (w: number, h: number, d: number, x: number, y: number, z: number) =>
  new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
/**
 * 圆柱的东西（袋身）：光往上偏一半（太阳在后方，朝镜头那面 l ≈ −0.23，两侧 ≈ 0）+ 档位 [−0.5, −0.12]
 * → 正面一条中档、两侧落亮档（逆光勾出的轮廓）。轮廓亮 → 和地面的亮度差 < 60，不出强边缘。
 */
const ROUNDF = { lightUp: 0.5, bands: [-0.5, -0.12] as [number, number], noShadowReceive: true };

type Ramp = [number, number, number];
const BAGS: { key: 'fabricStripe' | 'ironwork' | 'clothBlue'; ramp: Ramp }[] = [
  // 红、蓝的正面（中档）L ≈ 120：和亮地面差 < 60；只有黑袋子是真的暗（每行两条强边缘，认了）
  { key: 'fabricStripe', ramp: [0xff8070, 0xff5448, 0x6a2456] }, // 红（借 club 组的 fabricStripe，暗档留紫红）
  { key: 'ironwork', ramp: [0x7c78a8, 0x48446c, 0x2a2644] }, // 黑（深靛，正面 L ≈ 70；两侧的逆光亮边 L ≈ 125）
  { key: 'clothBlue', ramp: [0x6aa8f8, 0x4a7ee8, 0x262e78] }, // 蓝
];

export function build(ctx: AssetCtx): THREE.Object3D {
  const g = new THREE.Group();
  // 钢架：青绿漆（朝镜头的面落中档 L ≈ 140，和地面差 < 60）
  const steel = ctx.mat('metal', {
    ramp: [0x86e0cc, 0x52bcac, 0x2a5a7c],
    lightUp: 0.55,
    bands: [-0.45, 0.35],
    convex: 0.4,
    noShadowReceive: true,
  });
  const cap = ctx.mat('clothWhite', { ...ROUNDF, ramp: [0xf6e8d4, 0xd2b8b4, 0x7c6a98], convex: 0.3 });
  const chain = ctx.mat('metal', {
    ramp: [0xc8dce0, 0x84a4b4, 0x4a5a80],
    tones: undefined,
    lightUp: 0.6,
    bands: [-0.5, 0.2],
    edge: 0.2,
    convex: 0,
    noShadowReceive: true,
    elem: { kind: 'planks', p: [0, 1, 0, 2 * T], seam: 1, hi: 0 },
  });

  // 架子：立柱 3 纹素见方、梁 3 纹素高（梁顶 2.61）、脚 2 纹素高沿 z 9 纹素
  const PX = 15.5 * T;
  const YB = 26 * T; // 梁底
  const frame: THREE.BufferGeometry[] = [];
  const beam: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    frame.push(box(3 * T, YB, 3 * T, sx * PX, 0, 0));
    beam.push(box(3 * T, 2 * T, 9 * T, sx * PX, 0, 0));
  }
  beam.push(box(34 * T, 3 * T, 3 * T, 0, YB, 0));
  g.add(new THREE.Mesh(mergeGeometries(frame), steel));
  // 梁和脚：同一种漆，但不往上偏光 → 顶面亮、朝镜头的面落暗档（画面里一条横的暗带 = 架子的明暗骨架，横的不出强边缘）
  g.add(
    new THREE.Mesh(
      mergeGeometries(beam),
      ctx.mat('metal', { ramp: [0x6cd0bc, 0x3aa49c, 0x2a5a7c], convex: 0.4, noShadowReceive: true }),
    ),
  );

  const R = 0.2;
  BAGS.forEach((b, i) => {
    const x = (i - 1) * 10 * T;
    // 每只袋一个组，原点在梁下的挂点（晃的时候绕它转）
    const bag = new THREE.Group();
    bag.position.set(x, YB, 0);
    const y = (v: number) => v - YB;
    const body = new THREE.CylinderGeometry(R, R * 0.92, 1.2 - T, 10, 1).translate(0, y(0.6 + (1.2 - T) / 2), 0);
    bag.add(new THREE.Mesh(body, ctx.mat(b.key, { ...ROUNDF, ramp: b.ramp, tones: undefined, convex: 0.3 })));
    bag.add(
      new THREE.Mesh(new THREE.CylinderGeometry(R * 0.85, R + 0.005, T, 8, 1).translate(0, y(1.8 - T / 2), 0), cap),
    );
    // 链：两根从袋顶左右往上收到挂钩（1 纹素粗，倾斜）
    const top = y(1.8);
    const hook = -2 * T;
    const len = Math.hypot(0.12, hook - top);
    const ang = Math.atan2(0.12, hook - top);
    const links = [-1, 1].map((s) =>
      new THREE.BoxGeometry(T, len, T).rotateZ(s * ang).translate(s * 0.06, (top + hook) / 2, 0),
    );
    links.push(box(T, 2 * T, T, 0, hook, 0));
    bag.add(new THREE.Mesh(mergeGeometries(links), chain));
    if (i === 1) {
      bag.userData.update = (_dt: number, t: number) => {
        bag.rotation.x = 0.05 * Math.sin(t * 1.9) + 0.02 * Math.sin(t * 3.1 + 1);
        bag.rotation.z = 0.015 * Math.sin(t * 1.3);
      };
    }
    g.add(bag);
  });

  ctx.mats.prepare(g);
  return g;
}

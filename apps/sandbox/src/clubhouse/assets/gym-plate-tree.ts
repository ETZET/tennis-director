// gym-plate-tree · B1 自由重量区两个深蹲架之间的杠铃片树 + 脚下丢着的两片（信号：→ 挂回去）。+z 朝镜头。
// 尺寸 0.77 × 1.3 × 0.77 米（9 × 14 × 9 设计纹素）。
// 元素：钢底座（方板）+ 2 纹素的钢立柱（偏西北，给地上的片让地方）+ 朝南两根挂片的短桩；
//   下桩挂红（Ø0.46）+ 蓝（Ø0.40），上桩挂黄（Ø0.36）+ 绿（Ø0.30）：正对镜头就是一圈圈的彩色八角盘，桩头露 1 纹素钢 = 片心；
//   东南角地上平躺两片（绿在下、黄在上，错开一点）。
// 挂着的片正面：lightUp + 低 bands（中档的饱和色），不接投影；地上的片朝上 = 亮档。
// 三角形：底座 + 立柱 + 两根桩 4 × 12 + 片 6 × 24（八角，只做看得见的那一面盖）= 192（预算 220）。
// userData：setLoose(on)（默认 true = 上面说的样子；false = 地上两片挂回桩上）、loose()。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

export function build(ctx: AssetCtx): THREE.Object3D {
  const T = ctx.texel;
  const face = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number], noShadowReceive: true };
  const steel = ctx.mat('metal', { ...face, ramp: [0xa4aaf0, 0x8a90e8, 0x5254b0], edge: 0.5, convex: 0.4 });
  const plates = {
    red: ctx.mat('clothRed', { ...face, ramp: [0xff6a54, 0xe85656, 0xb04870], edge: 0.12, convex: 0.3 }),
    blue: ctx.mat('clothBlue', { ...face, ramp: [0x5a9cff, 0x4a6ce0, 0x4a58c0], edge: 0.12, convex: 0.3 }),
    yellow: ctx.mat('flowerYellow', { ...face, ramp: [0xd8a43a, 0xd88a30, 0x9a5a5a], edge: 0.12, convex: 0.3 }),
    green: ctx.mat('cactus', { ...face, ramp: [0x7cc450, 0x3ea058, 0x2e7a72], edge: 0.12, convex: 0.3 }),
  };

  // 三组：片树和挂着的（一直在）、地上丢着的（信号）、挂回去以后多出来的两片（setLoose(false) 才显示）
  type Bucket = Map<THREE.Material, THREE.BufferGeometry[]>;
  const base: Bucket = new Map();
  const looseParts: Bucket = new Map();
  const hungParts: Bucket = new Map();
  let parts = base;
  const add = (m: THREE.Material, g: THREE.BufferGeometry) => {
    const list = parts.get(m) ?? [];
    list.push(g);
    parts.set(m, list);
  };
  /** 方块：x/z 中心，y 底 */
  const box = (m: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number) =>
    add(m, new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z));
  /** 挂着的片：轴沿 z 的八角盘（顶上一条平边），只做朝南那面盖；z = 背面 */
  const hang = (m: THREE.Material, r: number, t: number, x: number, y: number, z: number) => {
    const rim = new THREE.CylinderGeometry(r, r, t, 8, 1, true).rotateX(Math.PI / 2).rotateZ(Math.PI / 8);
    const cap = new THREE.CircleGeometry(r, 8).rotateZ(Math.PI / 8).translate(0, 0, t / 2);
    for (const g of [rim, cap]) add(m, g.translate(x, y, z + t / 2));
  };
  /** 平躺的片：轴沿 y，只做朝上那面盖；y = 底 */
  const lie = (m: THREE.Material, r: number, t: number, x: number, y: number, z: number) => {
    const rim = new THREE.CylinderGeometry(r, r, t, 8, 1, true).rotateY(Math.PI / 8);
    const cap = new THREE.CircleGeometry(r, 8)
      .rotateX(-Math.PI / 2)
      .rotateY(Math.PI / 8)
      .translate(0, t / 2, 0);
    for (const g of [rim, cap]) add(m, g.translate(x, y + t / 2, z));
  };

  // 立柱偏西北，东南角留给地上的片
  const CX = -0.12;
  const CZ = -0.12;
  const BH = T;
  box(steel, 0.5, BH, 0.5, CX, 0, CZ);
  box(steel, 2 * T, 1.3 - BH, 2 * T, CX, BH, CZ);
  const zf = CZ + T; // 立柱正面
  const t = 0.08;
  const pegs: [number, [keyof typeof plates, number][]][] = [
    [
      0.36,
      [
        ['red', 0.23],
        ['blue', 0.2],
      ],
    ],
    [
      0.88,
      [
        ['yellow', 0.18],
        ['green', 0.15],
      ],
    ],
  ];
  for (const [y, list] of pegs) {
    // 桩：1.5 纹素见方，比外面那片多伸出 1 纹素（= 片心的钢）
    const len = list.length * t + T;
    box(steel, 1.5 * T, 1.5 * T, len, CX, y - 0.75 * T, zf + len / 2);
    list.forEach(([c, r], i) => {
      hang(plates[c], r, t - 0.005, CX, y, zf + i * t);
    });
  }
  // 地上丢着的两片：绿在下、黄在上（错开）
  parts = looseParts;
  lie(plates.green, 0.21, 0.07, 0.19, 0, 0.19);
  lie(plates.yellow, 0.17, 0.07, 0.15, 0.07, 0.23);
  // 挂回去：绿的挂到下桩最外面、黄的挂到上桩最外面（桩各接长一片的厚度）
  parts = hungParts;
  pegs.forEach(([y, list], k) => {
    const z0 = zf + list.length * t;
    box(steel, 1.5 * T, 1.5 * T, t + T, CX, y - 0.75 * T, z0 + (t + T) / 2);
    if (k === 0) hang(plates.green, 0.21, t - 0.005, CX, y, z0);
    else hang(plates.yellow, 0.17, t - 0.005, CX, y, z0);
  });
  parts = base;

  const root = new THREE.Group();
  const fill = (to: THREE.Object3D, b: Bucket) => {
    for (const [m, gs] of b) to.add(new THREE.Mesh(mergeGeometries(gs), m));
    return to;
  };
  fill(root, base);
  const looseG = fill(new THREE.Group(), looseParts);
  const hungG = fill(new THREE.Group(), hungParts);
  root.add(looseG, hungG);
  ctx.mats.prepare(root);
  // 开关（stage 3）：setLoose(true) = 两片丢在地上（默认，原来的样子）；false = 挂回桩上
  root.userData.setLoose = (on: boolean) => {
    looseG.visible = on;
    hungG.visible = !on;
  };
  root.userData.loose = () => looseG.visible;
  root.userData.setLoose(true);
  return root;
}

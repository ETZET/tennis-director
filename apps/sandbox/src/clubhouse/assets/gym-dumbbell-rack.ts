// gym-dumbbell-rack · B1 自由重量区镜前的两层哑铃架 + 架前地上散着的 3 只哑铃（信号：→ 拣回架子）。+z 朝镜头。
// 尺寸 3.0 × 1.04 × 0.7 米（33 × 12 × 8 设计纹素）。
// 元素：两头 2 纹素的钢侧板、一块背板、两层钢托盘（上层在后、高；下层在前、低，台阶式）；
//   每层三对（6 个槽），哑铃柄朝前后放（正对镜头看到的是 3 × 3 纹素的铃头色块），成对的颜色：上层黄 / 绿 / 蓝，下层红 / 蓝 / 绿；
//   每层中间一根钢的"柄"横条（比铃头高一点、1 纹素深）→ 俯看前后两个铃头之间露出一条暗缝 = 哑铃的柄。
//   架上空着 3 个槽（上层一只黄，下层一只红、一只蓝），那 3 只躺在架前地上（柄沿 x，哑铃的样子一眼认出）。
// 铃头朝镜头的面：lightUp + 低 bands（中档的饱和色），不接投影；托盘、侧板接投影。
// 三角形：架子 5 + 柄条 2 + 架上哑铃 9 + 地上 3 × 3 = 25 个方块 × 12 = 300（预算 350）。
// userData：setLoose(on)（默认 true = 上面说的样子；false = 地上的 3 只回到空槽里）、loose()。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

export function build(ctx: AssetCtx): THREE.Object3D {
  const T = ctx.texel;
  const face = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number], noShadowReceive: true };
  const steel = ctx.mat('ironwork', { ...face, ramp: [0x8a90ea, 0x5c62cc, 0x3c3c9c], edge: 0.5, convex: 0.4 });
  const handle = ctx.mat('ironwork', { ...face, ramp: [0x8088e0, 0x666cd8, 0x4242a0], edge: 0.3, convex: 0.2 });
  const heads = {
    yellow: ctx.mat('flowerYellow', { ...face, ramp: [0xdcaa36, 0xd07a30, 0x9a5a5a], edge: 0.5, convex: 0.3 }),
    green: ctx.mat('cactus', { ...face, ramp: [0x74bc4c, 0x3e9a56, 0x2e7a72], edge: 0.5, convex: 0.3 }),
    blue: ctx.mat('clothBlue', { ...face, ramp: [0x5a9cff, 0x3a64d4, 0x3a3e98], edge: 0.5, convex: 0.3 }),
    red: ctx.mat('clothRed', { ...face, ramp: [0xff6a50, 0xd03a48, 0x903068], edge: 0.5, convex: 0.3 }),
  };
  type Col = keyof typeof heads;

  // 三组：架子和架上的（一直在）、地上散着的（信号）、拣回架子以后补在空槽里的（setLoose(false) 才显示）
  type Bucket = Map<THREE.Material, THREE.BufferGeometry[]>;
  const base: Bucket = new Map();
  const looseParts: Bucket = new Map();
  const rackedParts: Bucket = new Map();
  let parts = base;
  const add = (m: THREE.Material, g: THREE.BufferGeometry) => {
    const list = parts.get(m) ?? [];
    list.push(g);
    parts.set(m, list);
  };
  /** 方块：x/z 中心，y 底；rot = 绕 y 转（弧度） */
  const box = (m: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, rot = 0) =>
    add(m, new THREE.BoxGeometry(w, h, d).rotateY(rot).translate(x, y + h / 2, z));

  const W = 3.0;
  const HW = 3 * T; // 铃头 3 纹素见方
  const DL = 4 * T; // 架上哑铃前后长 4 纹素（前头 1.3、柄 1.3、后头 1.3）
  const TT = T; // 托盘厚
  const tiers = [
    // 上层（后、高）：轻的
    { y: 0.68, z0: -0.33, cols: ['yellow', 'green', 'blue'] as Col[], gaps: [1] },
    // 下层（前、低）：重的
    { y: 0.3, z0: -0.14, cols: ['red', 'blue', 'green'] as Col[], gaps: [0, 3] },
  ];
  const IW = W - 4 * T; // 两块侧板之间
  // 侧板：2 纹素厚，从地到上层哑铃顶下一点，前后包住两层
  const zBack = -0.35;
  const zFront = tiers[1].z0 + DL;
  for (const sx of [-1, 1]) box(steel, 2 * T, 0.95, zFront - zBack, sx * (W / 2 - T), 0, (zBack + zFront) / 2);
  // 背板（上层后面，挡住架子后面的地）
  box(steel, IW, 0.95 - tiers[1].y, 0.02, 0, tiers[1].y, zBack + 0.01);
  // 每层三对：对里隔 1 纹素、对和对之间隔 3 纹素（3 + 1 + 3 = 7 纹素一对，整层 27 纹素）
  const slotX = (k: number) => {
    const pair = Math.floor(k / 2);
    return -13.5 * T + pair * 10 * T + (k % 2) * 4 * T + 1.5 * T;
  };
  for (const t of tiers) {
    const zc = t.z0 + DL / 2;
    box(steel, IW, TT, DL, 0, t.y, zc);
    // 柄条：比铃头高 4 厘米、1 纹素深 → 俯看前后两个铃头中间一条暗缝
    box(handle, IW - 2 * T, HW + 0.04, T, 0, t.y + TT, zc);
    t.cols.forEach((c, pair) => {
      for (const k of [0, 1]) {
        const slot = pair * 2 + k;
        parts = t.gaps.includes(slot) ? rackedParts : base;
        box(heads[c], HW, HW, DL, slotX(slot), t.y + TT, zc);
        parts = base;
      }
    });
  }
  // 地上散着的 3 只（柄沿 x：铃头 3 纹素、柄 1.5 纹素长 / 1.5 纹素粗），在架前的脚印里
  const loose: [Col, number, number, number][] = [
    ['red', -0.95, 0.2, 0],
    ['yellow', 0.05, 0.26, 0],
    ['blue', 0.85, 0.19, -0.06],
  ];
  parts = looseParts;
  for (const [c, x, z, rot] of loose) {
    const hl = 1.6 * T;
    const off = (HW + hl) / 2;
    const ox = Math.cos(rot) * off;
    const oz = -Math.sin(rot) * off;
    box(heads[c], HW, HW, HW, x - ox, 0, z - oz, rot);
    box(heads[c], HW, HW, HW, x + ox, 0, z + oz, rot);
    box(handle, hl + 0.02, 1.5 * T, 1.5 * T, x, HW / 2 - 0.75 * T, z, rot);
  }

  const root = new THREE.Group();
  const fill = (to: THREE.Object3D, b: Bucket) => {
    for (const [m, gs] of b) to.add(new THREE.Mesh(mergeGeometries(gs), m));
    return to;
  };
  fill(root, base);
  const looseG = fill(new THREE.Group(), looseParts);
  const rackedG = fill(new THREE.Group(), rackedParts);
  root.add(looseG, rackedG);
  ctx.mats.prepare(root);
  // 开关（stage 3）：setLoose(true) = 3 只散在地上、架上空 3 个槽（默认，原来的样子）；false = 拣回去了
  root.userData.setLoose = (on: boolean) => {
    looseG.visible = on;
    rackedG.visible = !on;
  };
  root.userData.loose = () => looseG.visible;
  root.userData.setLoose(true);
  return root;
}

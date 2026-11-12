// shop-pastry-case：吧台台面西半上的糕点柜（放置点 y 1.1 = 吧台台面）。
// 尺寸 0.9 × 0.45 × 0.5 米（w × h × d）≈ 10 × 5 × 6 设计纹素。
// 一个敞口的两层台阶式展示柜：深木底座、深木后板 + 后面一级钢台阶；前排、后排各一排糕点（2～3 纹素的块：可颂金黄、草莓挞红、
// 抹茶绿、粉色马卡龙、巧克力棕、柠檬黄）。玻璃不画成一整块（45° 下会盖住糕点）：画成青色的玻璃框 ——
// 两根前柱 + 顶上一圈 1 纹素的玻璃沿（glass 借 club 组调色）。朝镜头的面 lightUp + 低 bands，全部不接投影（小件）。
// 三角形 122（画廊实测）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

type G = THREE.BufferGeometry;
/** BoxGeometry 的面序：+x −x +y −y +z −z；默认不建朝下、朝北（−z）的面（镜头在南上方，看不见） */
const PY = 2;
const NY = 3;
const NZ = 5;
function boxG(w: number, h: number, d: number, x: number, y: number, z: number, drop: number[] = [NY, NZ]): G {
  const g = new THREE.BoxGeometry(w, h, d);
  const src = g.getIndex()!.array;
  const keep: number[] = [];
  for (let f = 0; f < 6; f++) if (!drop.includes(f)) for (let i = 0; i < 6; i++) keep.push(src[f * 6 + i]);
  g.setIndex(keep);
  g.clearGroups();
  return g.translate(x, y + h / 2, z);
}

const W = 0.9;
const D = 0.5;
const H = 0.45;
/** 底座高、后台阶 */
const BASE = 0.1;
const STEP = 0.14;

/** 糕点的颜色（[亮, 中, 暗]）：借 club 组的名字调色（午后配色不把暗面染成褐灰） */
type Kind = 'croissant' | 'tart' | 'matcha' | 'macaron' | 'choc' | 'lemon';
const RAMP: Record<Kind, [number, number, number]> = {
  croissant: [0xf6c058, 0xd88a3c, 0x7a4a5c], // 金黄（顶 L ≈ 194）
  tart: [0xf46a5a, 0xd84a4c, 0x7a2c5c], // 草莓红（顶 L ≈ 135）
  matcha: [0x9cd060, 0x6aa84c, 0x2e6262], // 抹茶绿（顶 L ≈ 182）
  macaron: [0xff9cc0, 0xe0709c, 0x7c3c78], // 粉（顶 L ≈ 175）
  choc: [0xb8705a, 0x8e5050, 0x4c3058], // 巧克力（顶 L ≈ 128）
  lemon: [0xfae070, 0xe4b450, 0x806064], // 柠檬黄（顶 L ≈ 217）
};
/** 每排：[种类, 中心 x, 宽]（宽是纹素的整数倍；一排挨着排满，中间不露钢台阶）。相邻两块顶面亮度差 < 60 */
const FRONT: [Kind, number, number][] = [
  ['macaron', -0.27, 0.18],
  ['croissant', -0.045, 0.27],
  ['lemon', 0.225, 0.27],
];
const BACK: [Kind, number, number][] = [
  ['choc', -0.295, 0.27],
  ['tart', -0.07, 0.18],
  ['matcha', 0.11, 0.18],
  ['croissant', 0.315, 0.23],
];

export function build(ctx: AssetCtx): THREE.Object3D {
  const wood: G[] = [];
  const steel: G[] = [];
  const glass: G[] = [];
  const cakes: Record<Kind, G[]> = { croissant: [], tart: [], matcha: [], macaron: [], choc: [], lemon: [] };

  // 深木底座（正面 1 行）+ 后半一级钢台阶
  wood.push(boxG(W, BASE, D, 0, 0, 0));
  steel.push(boxG(W - 0.04, STEP, 0.22, 0, BASE, -0.12));
  // 柜子的深木后板（后排糕点上面露一行）
  wood.push(boxG(W, H - BASE - 0.09, 0.04, 0, BASE, -D / 2 + 0.02, [NY, NZ, PY]));
  // 前排糕点（底座上，z +0.1）、后排（台阶上，z −0.12）
  for (const [k, x, w] of FRONT) cakes[k].push(boxG(w, k === 'croissant' ? 0.12 : 0.1, 0.18, x, BASE, 0.1));
  for (const [k, x, w] of BACK) cakes[k].push(boxG(w, k === 'choc' ? 0.12 : 0.1, 0.16, x, BASE + STEP, -0.12));
  // 玻璃框：两根前柱 + 顶上前沿、两侧沿、后沿（都是 1 纹素）
  for (const sx of [-1, 1])
    glass.push(boxG(0.09, H - BASE - 0.09, 0.09, sx * (W / 2 - 0.045), BASE, D / 2 - 0.045, [NY, NZ, PY]));
  glass.push(boxG(W, 0.09, 0.09, 0, H - 0.09, D / 2 - 0.045));
  for (const sx of [-1, 1]) glass.push(boxG(0.09, 0.09, D - 0.18, sx * (W / 2 - 0.045), H - 0.09, 0));
  glass.push(boxG(W, 0.09, 0.09, 0, H - 0.09, -D / 2 + 0.045));

  const root = new THREE.Group();
  root.name = 'shop-pastry-case';
  const FACE = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number], noShadowReceive: true };
  const add = (gs: G[], m: THREE.Material) => gs.length && root.add(new THREE.Mesh(mergeGeometries(gs), m));
  // 深胡桃木（底座、后板：中档 L ≈ 88，这件东西里唯一的暗色）
  add(wood, ctx.mat('timber', { ramp: [0xb0684c, 0x8a4a4c, 0x4c3058], ...FACE, edge: 0.4, convex: 0.3 }));
  add(steel, ctx.mat('steel', { ...FACE, edge: 0.35, convex: 0.4 }));
  // 玻璃框：浅青（中档 L ≈ 160，和旁边糕点的顶差 < 60）
  add(glass, ctx.mat('glass', { ramp: [0x6cd4e4, 0x3cb4cc, 0x2c62a0], ...FACE, edge: 0.3, convex: 0.5 }));
  for (const k of Object.keys(cakes) as Kind[])
    add(cakes[k], ctx.mat('fabricStripe', { ramp: RAMP[k], ...FACE, edge: 0.3, convex: 0.4 }));
  ctx.mats.prepare(root);
  return root;
}

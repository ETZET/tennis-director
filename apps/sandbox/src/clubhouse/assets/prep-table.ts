// 后厨中间的备餐台（#21）：1.98 × 0.9 × 0.9 米 = 22 × 10 × 10 纹素（碗和菜到 1.08 米），台面顶 y 0.9（脏锅 up-dirty-pans 摆在台面东半、台子中心 x +0.5 米）。
// 元素：偏蓝的不锈钢台面（亮档，前沿 1 纹素的板厚）+ 四条 1 纹素的钢腿 + 离地 0.25 米的一层下搁板（深一号）；
// 搁板上：番茄红的周转箱、一摞蓝的桶、一袋黄的面粉 —— 从正面的空当里看得见。
// 台面西半（东半空着留给锅）：蜂蜜色的砧板（上面两只番茄、一棵生菜、一根胡萝卜）、后面一只青釉碗（一碗玉米黄）和一只奶白碗（番茄酱）。
// 厨师站在北边，朝镜头。三角形 ≈ 190（预算 300）。没有 userData。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

type G = THREE.BufferGeometry;
type C3 = [number, number, number];
const FACE = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number], noShadowReceive: true };
/** BoxGeometry 的面序：+x −x +y −y +z −z */
const NY = 3;
const NZ = 5;

export function build(ctx: AssetCtx): THREE.Object3D {
  const T = ctx.texel;
  const bins = new Map<THREE.Material, G[]>();
  const put = (m: THREE.Material, g: G) => {
    const a = bins.get(m);
    if (a) a.push(g);
    else bins.set(m, [g]);
  };
  /** 去掉朝下、朝北的面（镜头在南上方，看不见） */
  const trim = (g: THREE.BoxGeometry, drop: number[]) => {
    const src = g.getIndex()!.array;
    const keep: number[] = [];
    for (let f = 0; f < 6; f++) if (!drop.includes(f)) for (let i = 0; i < 6; i++) keep.push(src[f * 6 + i]);
    g.setIndex(keep);
    g.clearGroups();
    return g;
  };
  /** 盒子（纹素；x、z 是中心，y 是底） */
  const box = (
    m: THREE.Material,
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    drop: number[] = [NY, NZ],
  ) => put(m, trim(new THREE.BoxGeometry(w * T, h * T, d * T), drop).translate(x * T, (y + h / 2) * T, z * T));
  const flat = (key: Parameters<AssetCtx['mat']>[0], ramp: C3, extra: object = {}) =>
    ctx.mat(key, { ...FACE, ramp, convex: 0.3, ...extra });
  const disc = (m: THREE.Material, r: number, x: number, y: number, z: number, lift = 0.004) =>
    put(m, new THREE.CircleGeometry(r * T, 8).rotateX(-Math.PI / 2).translate(x * T, y * T + lift, z * T));
  /** 锅 / 碗：不建底的圆柱 + 沿 + 里面的东西（圆片） */
  const pot = (m: THREE.Material, inside: THREE.Material, r: number, h: number, x: number, y: number, z: number) => {
    put(m, new THREE.CylinderGeometry(r * T, r * T, h * T, 8, 1, true).translate(x * T, (y + h / 2) * T, z * T));
    disc(m, r, x, y + h, z, 0);
    disc(inside, r - 0.5, x, y + h, z);
  };

  const top = flat('metal', [0x98c4f6, 0x7098dc, 0x445498]);
  const leg = flat('metal', [0x9cc0e8, 0x6c90d0, 0x44528e]);
  const shelf = ctx.mat('metal', { ramp: [0x7c9cd4, 0x6484c4, 0x3e4c8c], noShadowReceive: true });
  const red = flat('fabricStripe', [0xf4664c, 0xd8443c, 0x7a2850]);
  const blue = flat('clothBlue', [0x5aa0f0, 0x3c7ce0, 0x2a3274]);
  const sack = flat('flowerYellow', [0xf8d070, 0xe0a850, 0x8a6058]);
  const board = flat('canvas', [0xeebc7c, 0xc88a64, 0x7a5a84]);
  const tomato = flat('fabricStripe', [0xff6a50, 0xe04a40, 0x7a2850]);
  const lettuce = flat('clothTeal', [0x7ae060, 0x44b450, 0x22604e]);
  const carrot = flat('toolOrange', [0xffa040, 0xf07a30, 0x7a3456]);
  const teal = flat('jug', [0x58c8d0, 0x2a90b0, 0x24508c]);
  const cream = flat('clothWhite', [0xf4ecd8, 0xd4c4c8, 0x8a7ca8]);
  const corn = ctx.mat('flowerYellow', { ramp: [0xffe070, 0xf4c050, 0x9a7050], noShadowReceive: true });
  const sauce = ctx.mat('fabricStripe', { ramp: [0xf05a44, 0xd0443c, 0x7a2850], noShadowReceive: true });

  const W = 22;
  const D = 10;
  const H = 10;
  // 腿、下搁板、搁板上的东西
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(leg, 1, H - 1, 1, sx * (W / 2 - 0.5), 0, sz * (D / 2 - 0.5));
  box(shelf, W - 1, 0.8, D - 1, 0, 2, 0);
  box(red, 5, 3.4, 5, -6.5, 2.8, 1.5);
  box(blue, 4, 2.6, 4, -0.5, 2.8, 2);
  box(blue, 3.4, 1.4, 3.4, -0.5, 5.4, 2);
  box(sack, 5.5, 3, 5, 6, 2.8, 1.5);
  // 台面
  box(top, W, 1, D, 0, H - 1, 0);
  // 砧板 + 菜
  box(board, 6.5, 0.5, 4.5, -6.6, H, 1.8);
  box(tomato, 1.5, 1.3, 1.5, -8.6, H + 0.5, 2.4);
  box(tomato, 1.5, 1.3, 1.5, -8.2, H + 0.5, 0.6);
  box(lettuce, 2.2, 1.5, 2.2, -5.8, H + 0.5, 1.2);
  box(carrot, 2.6, 0.8, 0.9, -5.4, H + 0.5, 3.2);
  // 两只碗
  pot(teal, corn, 1.7, 1.3, -8.2, H, -2.8);
  pot(cream, sauce, 1.5, 1.2, -3.6, H, -3);

  const root = new THREE.Group();
  root.name = 'prep-table';
  for (const [m, gs] of bins) root.add(new THREE.Mesh(gs.length > 1 ? mergeGeometries(gs) : gs[0], m));
  ctx.mats.prepare(root);
  return root;
}

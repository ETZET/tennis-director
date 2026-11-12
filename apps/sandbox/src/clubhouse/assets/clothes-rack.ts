// 专卖店 · 衣架（#32，×2）：一根横杆架在两根立柱上、朝南（+z 对镜头）。1.44 × 1.53 × 0.5 米 = 16 × 17 × 5.5 纹素（12 行，含帽子）。
// 元素：会所青漆的立柱（2 纹素）+ 钢横杆（1 行）+ 一行 1 纹素的衣架（衣服正面最上面那条暗线）；横杆上挂 4 件衣服：
// 侧着挂（正面看到的是衣服的侧边），每件 3 纹素宽、4～5 行长，会所蓝 / 天蓝轮着（白的和立柱之间是强边缘，不用）；
// 底下一层矮台、顶上一条搁板（会所青），搁板上三顶帽子（帽顶 4 × 1 行 + 往前伸的另一色帽檐：红 / 黄、黄 / 蓝、蓝 / 红）。
// 竖直方向按屏幕行排（1 行 = 1.414 纹素）。三角形 182（预算 200）。没有 userData。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

/** 朝镜头的竖直面：中档 */
const FACE = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number], noShadowReceive: true };
/** 衣服、帽子：3 纹素宽，描边弱一点（不然两边各被压暗 1 纹素） */
const CLOTH = { ...FACE, edge: 0.25, convex: 0.15 };

export function build(ctx: AssetCtx): THREE.Object3D {
  const T = ctx.texel;
  const R = Math.SQRT2;
  const bins = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const put = (m: THREE.Material, g: THREE.BufferGeometry) => {
    const a = bins.get(m);
    if (a) a.push(g);
    else bins.set(m, [g]);
  };
  /** 盒子（纹素）：左沿 x0、宽 w，高 h（行）、深 d，y 底（行），z 中心 */
  const box = (m: THREE.Material, x0: number, w: number, y: number, h: number, d: number, z: number) =>
    put(m, new THREE.BoxGeometry(w * T, h * R * T, d * T).translate((x0 + w / 2) * T, (y + h / 2) * R * T, z * T));

  // ── 材质 ──
  const post = ctx.mat('clothTeal', { ...FACE, ramp: [0x34b8a8, 0x24988e, 0x24506e], convex: 0.3 });
  const rail = ctx.mat('steel', { ...FACE, lightUp: 0.7, ramp: [0xc8d8e8, 0xa8bcd4, 0x6c7c9c], convex: 0.5 });
  const hanger = ctx.mat('ironwork', { ...FACE, ramp: [0x4a4a8a, 0x3c3c7c, 0x262458] });
  const base = ctx.mat('clothTeal', { ...FACE, ramp: [0x40c4b0, 0x2a9c90, 0x24506e], convex: 0.4 });
  const blue = ctx.mat('clothBlue', { ...CLOTH, ramp: [0x5a9cf0, 0x3e74d8, 0x2a3274] });
  const sky = ctx.mat('clothBlue', { ...CLOTH, ramp: [0x8cd0f4, 0x62b0e8, 0x3a5a9a] });
  const yellow = ctx.mat('ball', { ...CLOTH, ramp: [0xe0f050, 0xc8dc48, 0x6a8a5a] });
  const red = ctx.mat('clothRed', { ...CLOTH, ramp: [0xf06050, 0xd84848, 0x62285a] });

  // ── 架子：x −8…+8（16 纹素），z −2.75…+2.75 ──
  box(base, -8, 16, 0, 1, 5.5, 0); // 矮台 0…1 行
  for (const x0 of [-8, 6]) box(post, x0, 2, 1, 10, 1.5, 0); // 立柱 1…11 行
  box(rail, -6, 12, 9, 1, 1, 0); // 横杆 9…10 行
  box(base, -8, 16, 10, 1, 3, 0); // 顶上一条搁板 10…11 行（放帽子）

  // ── 衣服：x0 = −6、−3、0、3（3 纹素宽、挨着），深 4.5（肩宽），挂到 9 行；长 5 / 4 行轮着 ──
  const cloth = [blue, sky, blue, sky];
  for (let i = 0; i < 4; i++) {
    const len = i % 2 ? 4 : 5;
    box(cloth[i], -6 + i * 3, 3, 9 - len, len, 4.5, 0);
  }
  // 衣架：衣服正面最上面一条 1 行的暗线 = 一排衣架的肩
  put(hanger, new THREE.PlaneGeometry(12 * T, R * T).translate(0, 8.5 * R * T, 2.25 * T + 0.004));

  // ── 搁板上三顶帽子：帽顶 4 纹素 × 1 行 × 2.5 深 + 往前伸 1.5 纹素的帽檐（0.3 纹素厚，和帽顶不同色 = 一眼认出是帽子）──
  const caps: [THREE.Material, THREE.Material][] = [
    [red, yellow],
    [yellow, blue],
    [blue, red],
  ];
  for (let i = 0; i < 3; i++) {
    const x0 = -7 + i * 5;
    box(caps[i][0], x0, 4, 11, 1, 2.5, -0.5);
    box(caps[i][1], x0, 4, 11, 0.3 / R, 1.5, 1.5);
  }

  const root = new THREE.Group();
  root.name = 'clothes-rack';
  for (const [m, gs] of bins) root.add(new THREE.Mesh(gs.length > 1 ? mergeGeometries(gs) : gs[0], m));
  ctx.mats.prepare(root);
  return root;
}

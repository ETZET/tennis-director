// 店招（图标）：立在店门口的小立牌（totem），0.54 × 1.27 × 0.3 米 = 6 × 10 行 × 3.3 纹素。没有字，只有图标。
// 元素：深店色的底座（1 行，往前后宽一点）+ 深店色的柱身（顶上 1 行、下面 1 行露出来）；中间 7 行是店色的图标板，
// 板上一个 5 × 6 像素的很浅的店色图标（1 像素 = 1 纹素宽 × 1 屏幕行高；在场景里 1 纹素 = 2 个渲染像素，居中正好各留 1 个像素的边）。
// 图标板 L ≈ 150～165、图标 L ≈ 200～210（差 < 60：图标的每一条竖边都不出强边缘），所以板都是亮一点的店色。
// 变体（ctx.variant）：0 专卖店（蓝，交叉的两只拍子）、1 穿线（青，线盘）、2 咖啡吧（焦糖，冒热气的杯子）、
// 3 纪念品店（珊瑚红，会所徽章的星）、4 运动营养 · 饮品（绿，水瓶）、5 便利店（橙，购物篮）。
// 三角形 ≈ 50～60（预算 120）。没有 userData。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

const FACE = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number], noShadowReceive: true, convex: 0.25 };
type C3 = [number, number, number];

/** 图标：5 列 × 6 行（第一行在最上面），# = 浅色 */
const ICONS: string[][] = [
  // 0 交叉的两只拍子：拍面在上面两角，拍柄在中间交叉
  ['##.##', '##.##', '.#.#.', '..#..', '.#.#.', '#...#'],
  // 1 线轴（正面看的线盘）：一圈轮缘、中间的轴心，右下拖出一截线头
  ['.###.', '#...#', '#.#.#', '#...#', '.###.', '...##'],
  // 2 冒热气的杯子：两缕热气、杯身、右边的杯柄、窄一点的杯底
  ['.#.#.', '#.#..', '.....', '####.', '#####', '.##..'],
  // 3 会所徽章的星
  ['..#..', '..#..', '#####', '.###.', '.#.#.', '#...#'],
  // 4 水瓶：瓶盖、瓶颈、瓶身
  ['.###.', '..#..', '.###.', '.###.', '.###.', '.###.'],
  // 5 购物篮：拱起的提手、篮沿、两行竖的篮条、篮底
  ['.###.', '#...#', '#####', '#.#.#', '#.#.#', '.###.'],
];
/**
 * 每家店的颜色：[柱身, 图标板, 图标] 的 [亮, 中, 暗]（正面落中档）。整块牌子是一家店的一个色系：柱身是深的店色（L ≈ 65～90），
 * 板是亮一点的店色（L ≈ 150～165），图标是很浅的店色（L ≈ 205～215，带一点彩度，不是纯白）。
 */
const COLORS: [C3, C3, C3][] = [
  [
    [0x3a5ac0, 0x2a3c98, 0x1e2a64],
    [0x78c0ff, 0x50aaf8, 0x2c4a90],
    [0xc8e4ff, 0xa4c8f4, 0x6a8ac0],
  ], // 0 专卖店：蓝
  [
    [0x108494, 0x046474, 0x0e3e50],
    [0x30dcd0, 0x04bcb0, 0x1e6070],
    [0x90ece0, 0x60d0c0, 0x5a9a9a],
  ], // 1 穿线：青
  [
    [0xa05a48, 0x7a4040, 0x4a2a40],
    [0xf0b478, 0xd89a5a, 0x7a4a5a],
    [0xfce4c4, 0xf0cca0, 0xa08a90],
  ], // 2 咖啡吧：焦糖
  [
    [0xb04050, 0x8a2e44, 0x5a2040],
    [0xffa088, 0xff8468, 0x8a3050],
    [0xffd4c4, 0xf4bca4, 0xa08090],
  ], // 3 纪念品店：珊瑚红
  [
    [0x2e8a3a, 0x1e6a2c, 0x1e4436],
    [0x70dc68, 0x48c44c, 0x2e6a5a],
    [0xc0f498, 0x9cdc70, 0x88a890],
  ], // 4 运动营养 · 饮品：绿
  [
    [0xc0603a, 0x9a4a34, 0x5a3040],
    [0xffb060, 0xf89038, 0x8a4a40],
    [0xffd8a8, 0xf0c084, 0xa09080],
  ], // 5 便利店：橙
];

export function build(ctx: AssetCtx): THREE.Object3D {
  const T = ctx.texel;
  const R = Math.SQRT2;
  const v = ((ctx.variant % ICONS.length) + ICONS.length) % ICONS.length;
  const bins = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const put = (m: THREE.Material, g: THREE.BufferGeometry) => {
    const a = bins.get(m);
    if (a) a.push(g);
    else bins.set(m, [g]);
  };
  const box = (m: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number) =>
    put(m, new THREE.BoxGeometry(w * T, h * T, d * T).translate(x * T, (y + h / 2) * T, z * T));
  const front = (m: THREE.Material, w: number, h: number, x: number, y: number, z: number) =>
    put(m, new THREE.PlaneGeometry(w * T, h * T).translate(x * T, (y + h / 2) * T, z * T));

  const [postC, panelC, iconC] = COLORS[v];
  const post = ctx.mat('ironwork', { ...FACE, ramp: postC });
  // 板的描边压暗调低：板两边那一列是牌子的轮廓，压暗了会和图标差 > 60
  const panel = ctx.mat('clothBlue', { ...FACE, edge: 0.1, ramp: panelC });
  const icon = ctx.mat('jug', { ...FACE, edge: 0.1, convex: 0.1, ramp: iconC });

  // ── 底座 6 × 1 行 × 3.3，柱身 6 × 9 行 × 3（正面 z +1.5）──
  const D = 3;
  const ZF = D / 2;
  box(post, 6, R, 3.3, 0, 0, 0);
  box(post, 6, 9 * R, D, 0, R, 0);
  // ── 图标板：行 2…8（7 行）；图标：行 3…8（6 行），5 列居中 ──
  front(panel, 6, 7 * R, 0, 2 * R, ZF + 0.02);
  ICONS[v].forEach((row, i) => {
    const y = (8 - i) * R;
    // 一行里连着的 # 并成一片
    let c = 0;
    while (c < row.length) {
      if (row[c] !== '#') {
        c++;
        continue;
      }
      let e = c;
      while (e < row.length && row[e] === '#') e++;
      front(icon, e - c, R, -2.5 + (c + e) / 2, y, ZF + 0.04);
      c = e;
    }
  });

  const root = new THREE.Group();
  root.name = 'shop-sign';
  for (const [m, gs] of bins) root.add(new THREE.Mesh(gs.length > 1 ? mergeGeometries(gs) : gs[0], m));
  ctx.mats.prepare(root);
  return root;
}

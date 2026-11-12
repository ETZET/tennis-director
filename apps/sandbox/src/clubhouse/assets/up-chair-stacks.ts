// 宴会厅叠着的椅子（#82，活的信号：活动之前椅子还没摆）：1.56 × 1.5 × 0.6 米 = 17 × 16.5 × 6.5 纹素，三摞并排（6、6、4 把），朝南（+z 对镜头）。
// 元素：每摞 = 一把叠一把的宴会椅：正面是一道道 seat 绿的坐垫前沿（每把 0.12 米一格，中间露出深色的椅架）→ 一眼是"叠起来的"；
// 最上面一把露出整块坐垫 + 靠背（绿垫 + 黄铜顶梁）；最下面一把的两条黄铜前腿。每摞往前错一点（叠得不太齐），第三摞矮一截。
// 竖直方向按屏幕行排（1 行 = 1.414 纹素）。三角形 204（预算 350）。没有 userData。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

const FACE = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number], noShadowReceive: true };
/** BoxGeometry 的面序：e +x、w −x、t +y、b −y、s +z、n −z */
const FACES = 'ewtbsn';

export function build(ctx: AssetCtx): THREE.Object3D {
  const bins = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const put = (m: THREE.Material, g: THREE.BufferGeometry) => {
    const a = bins.get(m);
    if (a) a.push(g);
    else bins.set(m, [g]);
  };
  /** 盒子（米）：x、z 是中心，y 是底；skip = 不要的面（默认去掉底面和背面） */
  const box = (m: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, skip = 'bn') => {
    const g = new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
    const src = Array.from(g.index?.array ?? []);
    const idx: number[] = [];
    for (let f = 0; f < 6; f++) if (!skip.includes(FACES[f])) idx.push(...src.slice(f * 6, f * 6 + 6));
    g.setIndex(idx);
    g.clearGroups();
    put(m, g);
  };

  // ── 材质 ──
  // 坐垫：seat 绿（比调色板再饱和一点）；正面落中档（L ≈ 125），顶面亮档
  const pad = ctx.mat('seat', { ...FACE, ramp: [0x62dc80, 0x30ac6c, 0x1e6068], convex: 0.3, edge: 0.3 });
  const padTop = ctx.mat('seat', { ramp: [0x62dc80, 0x30ac6c, 0x1e6068], convex: 0.3, noShadowReceive: true });
  // 椅架：坐垫之间露出来的深靛色
  const frame = ctx.mat('ironwork', { ...FACE, ramp: [0x5a4c9a, 0x40347a, 0x2a2456], tones: undefined, edge: 0.2 });
  const brass = ctx.mat('brass', { ...FACE, ramp: [0xf6c454, 0xc88a3c, 0x7a4a52], tones: undefined, convex: 0.3 });

  // ── 三摞 ──
  const SEAT0 = 0.42; // 最下面一把的坐垫底
  const PITCH = 0.12; // 每叠一把高出这么多
  const PAD = 0.07; // 坐垫厚
  const W = 0.46;
  const stacks: [number, number, number][] = [
    // [x, 几把, z]
    [-0.55, 6, -0.02],
    [0, 6, 0.01],
    [0.55, 4, -0.01],
  ];
  for (const [x, n, z] of stacks) {
    const topY = SEAT0 + (n - 1) * PITCH; // 最上面一把的坐垫底
    // 椅架的芯（坐垫之间的暗格）+ 两条前腿
    box(frame, W - 0.06, topY - SEAT0, 0.4, x, SEAT0, z - 0.02, 'bnt');
    for (const sx of [-1, 1]) box(brass, 0.07, SEAT0, 0.07, x + sx * (W / 2 - 0.035), 0, z + 0.2, 'bnt');
    // 坐垫：一把一道，越往上越往前错一点
    for (let k = 0; k < n; k++) {
      const last = k === n - 1;
      box(last ? padTop : pad, W, PAD, 0.46, x, SEAT0 + k * PITCH, z + 0.01 + k * 0.006, last ? 'bn' : 'bnt');
    }
    // 最上面一把的靠背：绿垫 + 黄铜顶梁
    box(pad, W - 0.04, 0.3, 0.07, x, topY + PAD, z - 0.22, 'bn');
    box(brass, W, 0.06, 0.08, x, topY + PAD + 0.3, z - 0.22, 'bn');
  }

  const root = new THREE.Group();
  root.name = 'up-chair-stacks';
  for (const [m, gs] of bins) root.add(new THREE.Mesh(gs.length > 1 ? mergeGeometries(gs) : gs[0], m));
  ctx.mats.prepare(root);
  return root;
}

// B1 机房的配电柜（#155）：1.17 × 2.42 × 0.41 米 = 13 × 27 × 4.5 纹素（柜体 2.04 米 + 柜顶进线管），朝南（+z 对镜头），背贴墙。
// 元素：冷灰的柜体（踢脚 1 行深靛）+ 正面一块深靛的开关面板（3 排断路器，每排 4 个 1 纹素的浅灰拨杆）——
// 中间那排第 3 个是跳闸的：红色、拨在下半行（信号 → 按住合闸）；面板上面一块黄色的警示牌（闪电三角，不写字）、
// 右沿一个门把手；柜顶两根进线管往上走。竖直方向按屏幕行排（1 行 = 1.414 纹素）。三角形 92（预算 150）。没有 userData。
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

  // ── 材质 ──
  // 柜体：冷灰（偏蓝，L 190 / 152 / 86）—— 钢板本色就是灰的
  const cab = ctx.mat('ironwork', { ...FACE, ramp: [0xa8c0f0, 0x7c94d8, 0x4a5488], convex: 0.5 });
  const kick = ctx.mat('ironwork', { ...FACE, ramp: [0x4a4a9a, 0x3a3480, 0x262458] });
  // 开关面板：深靛（L ≈ 90）；拨杆浅灰（L ≈ 145，和面板只差 ≈ 55）
  const board = ctx.mat('ironwork', { ...FACE, ramp: [0x6a78c0, 0x5462b4, 0x2a2e66], edge: 0.1 });
  const lever = ctx.mat('ironwork', { ...FACE, ramp: [0xb0c0ec, 0x8a9ad4, 0x5a6490], edge: 0.1 });
  const trip = ctx.mat('clothRed', { ...BRIGHT, ramp: [0xff5a3c, 0xe8402e, 0x7a2a4a], edge: 0.1 });
  const warn = ctx.mat('flowerYellow', { ...BRIGHT, edge: 0.1 });
  const bolt = ctx.mat('ironwork', { ...BRIGHT, ramp: [0x4a4a7a, 0x3a3a66, 0x262448], edge: 0.1 });
  const pipe = ctx.mat('metal', { ...FACE, ramp: [0x9cc0d8, 0x6a8cb0, 0x3e5478], convex: 0.5 });

  // ── 柜体：13 × 15 行 × 4（z −2…+2），踢脚 1 行往里收 1 纹素 ──
  box(kick, 12, R, 3, 0, 0, -0.5);
  box(cab, 13, 14 * R, 4, 0, R, 0);
  const zf = 2;
  box(cab, 1, 2 * R, 0.5, 5.5, 6 * R, zf + 0.25); // 门把手
  // 开关面板：9 × 7 行（行 3…10），3 排拨杆（行 4、6、8，每排 4 个，隔 1 纹素）
  const X0 = -4.5;
  decal(board, 9, 7 * R, X0, 3 * R, zf);
  for (let row = 0; row < 3; row++) {
    const y = (4 + row * 2) * R;
    for (let k = 0; k < 4; k++) {
      const tripped = row === 1 && k === 2;
      // 拨杆 1 纹素 × 1 行；跳闸的那个拨到下面一行
      decal(tripped ? trip : lever, 1, R, X0 + 1 + k * 2, tripped ? y - R : y, zf, 0.001);
    }
  }
  // 警示牌：黄色 5 × 2 行（行 11…13），中间一道斜的闪电（两段错开的暗块）
  decal(warn, 5, 2 * R, -2.5, 11 * R, zf);
  decal(bolt, 1, R, 0, 12 * R, zf, 0.001);
  decal(bolt, 1, R, -1, 11 * R, zf, 0.001);
  // 进线管：柜顶两根 2 × 2，往上 4 行
  for (const px of [-3.5, 3.5]) box(pipe, 2, 4 * R, 2, px, 15 * R, -1);

  const root = new THREE.Group();
  root.name = 'gym-panel';
  for (const [m, gs] of bins) root.add(new THREE.Mesh(gs.length > 1 ? mergeGeometries(gs) : gs[0], m));
  ctx.mats.prepare(root);
  return root;
}

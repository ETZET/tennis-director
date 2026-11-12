// #56 纪念品店的展示桌（帽子、毛巾、球筒），朝南。
// 尺寸：1.44 宽 × 0.83 高 × 0.81 深（16 × 6.5 行 × 9 设计纹素；竖直 1 行 = √2 纹素 = 0.127 米）。
// 结构：木桌（timber 借名）—— 蜂蜜色桌面 1 行厚（顺 z 的板，板缝竖着 → 屏幕上稳定）、胡桃木的裙板（缩进 1 纹素）和 3 × 3 纹素的腿、
// 下面一层隔板放两只海军蓝的货箱（隔板接收桌面的投影 = 桌子底下那一块暗）。
// 桌上：左边两顶帽子（海军蓝、红，帽檐往前 1 纹素）；中间一叠毛巾（红 / 奶白条，每条 1 行）；
// 右边三支顺 x 躺着的球筒（西头海军蓝盖 + 荧光黄筒身），两支在下、一支在上。
// 明暗：桌面亮（L ≈ 175），暗的是胡桃木的裙板、腿和桌底（桌子在橡木地板上靠这条暗框立起来），帽子、毛巾正面中间调；
// 件的颜色和桌面差 < 60（强边缘只数横向相邻）。
// 材质：timber（planks 元素）、fabricStripe（红）、canvasStripe（海军蓝）、counterTop（奶白）、ball。三角形 74。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Tones } from '../../clubsite/render/toon';
import type { AssetCtx } from '../ctx';

/** BoxGeometry 的面顺序：+x −x +y −y +z −z */
const FACE = { px: 0, nx: 1, py: 2, ny: 3, pz: 4, nz: 5 } as const;
type Face = keyof typeof FACE;

export function build(ctx: AssetCtx): THREE.Object3D {
  const T = ctx.texel;
  const R = Math.SQRT2; // 竖直 1 屏幕行（纹素单位）
  const parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  /** 盒子（纹素坐标：x 从中心、y 从地面、z 从中心）；faces = 只留哪些面 */
  const slab = (
    m: THREE.Material,
    x0: number,
    x1: number,
    y0: number,
    y1: number,
    z0: number,
    z1: number,
    faces: Face[],
  ) => {
    const g = new THREE.BoxGeometry((x1 - x0) * T, (y1 - y0) * T, (z1 - z0) * T);
    g.translate(((x0 + x1) / 2) * T, ((y0 + y1) / 2) * T, ((z0 + z1) / 2) * T);
    const src = g.index!.array;
    const idx: number[] = [];
    for (const f of faces) for (let i = 0; i < 6; i++) idx.push(src[FACE[f] * 6 + i]);
    g.setIndex(idx);
    const list = parts.get(m) ?? [];
    list.push(g);
    parts.set(m, list);
  };
  const front: Face[] = ['pz', 'py'];

  const face = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number], noShadowReceive: true };
  const woodTones: Tones = {
    bands: [
      [0xdc9c62, 0xe4a46a, 0xd2925a],
      [0xb8764e, 0xc28056, 0xac6c48],
      [0x664470, 0x704c7a, 0x5c3e66],
    ],
    seam: [0xc4864f, 0x9a5e44, 0x4e3460],
    hi: [0xf4b676, 0xd48e62, 0x7a5a86],
  };
  // 桌面：蜂蜜色，顺 z 的板（3 纹素宽，板缝竖着）
  const wood = ctx.mat('timber', {
    ...face,
    edge: 0.4,
    convex: 0.3,
    ramp: [0xdc9c62, 0xb8764e, 0x664470],
    tones: woodTones,
    elem: { kind: 'planks', space: 'local', p: [1, 0, 0, 0.27], q: [1, 0, 0, 0], seam: 1, hi: 0 },
  });
  // 裙板、腿：胡桃木（比桌面深一截，桌子在橡木地板上靠这条暗框立起来）
  const frame = ctx.mat('timber', { ...face, edge: 0.4, convex: 0.3, ramp: [0xc07850, 0x985a4a, 0x5a3c66] });
  // 下层隔板：深一档（桌底那一块暗），接收桌面的投影
  const woodLow = ctx.mat('timber', {
    lightUp: 0.55,
    bands: [-0.45, 0.35],
    edge: 0.3,
    convex: 0.2,
    ramp: [0x9a6250, 0x7e4e4a, 0x5a3c66],
  });
  const red = ctx.mat('fabricStripe', { ...face, edge: 0.4, convex: 0.25, ramp: [0xff8a62, 0xe25a52, 0x6a2a5e] });
  const navy = ctx.mat('canvasStripe', { ...face, edge: 0.4, convex: 0.25, ramp: [0x5a80e0, 0x4866c4, 0x2a2c6a] });
  const cream = ctx.mat('counterTop', { ...face, edge: 0.4, convex: 0.3, ramp: [0xf4dcc0, 0xd8ac8a, 0x8a78aa] });
  const ball = ctx.mat('ball', { ...face, edge: 0.4, convex: 0.3, ramp: [0xb8c840, 0xa4b038, 0x5e7a52] });

  // ── 桌子：x ±8，z ±4.5，桌面顶 6.5 行 ──
  const X = 8;
  const Z = 4.5;
  const top = 6.5 * R;
  slab(wood, -X, X, top - R, top, -Z, Z, ['pz', 'py']); // 桌面
  slab(frame, -X + 3, X - 3, top - 2 * R, top - R, -Z + 1, Z - 1, ['pz']); // 裙板（缩进 1 纹素）
  for (const lx of [-X, X - 3]) {
    slab(frame, lx, lx + 3, 0, top - R, Z - 3, Z, ['pz']); // 前腿
    slab(frame, lx, lx + 3, 0, top - R, -Z, -Z + 3, ['pz']); // 后腿（只露一点）
  }
  slab(woodLow, -X + 3, X - 3, R, 1.6 * R, -Z + 1, Z - 1, ['pz', 'py']); // 下层隔板
  slab(navy, -4, -1, 1.6 * R, 3 * R, -2, 2, front); // 货箱
  slab(navy, 1, 4, 1.6 * R, 3 * R, -2, 2, front);

  // ── 桌上 ──
  const y0 = top;
  const v = ctx.variant % 2;
  // 帽子（左）：帽身 3 × 3 纹素、1 行高，帽檐往前 1 纹素（0.4 纹素厚，只露顶面）；海军蓝、红并排
  const cap = (m: THREE.Material, x0: number, z1: number) => {
    slab(m, x0, x0 + 3, y0, y0 + R, z1 - 3, z1, front);
    slab(m, x0, x0 + 3, y0, y0 + 0.4, z1, z1 + 1, ['pz', 'py']);
  };
  cap(v ? red : navy, -7, 2);
  cap(v ? navy : red, -4, 1);
  // 毛巾（中）：一叠 3 × 3 纹素，红 / 奶白两条 + 红顶
  slab(red, -1, 2, y0, y0 + R, -2, 1, ['pz']);
  slab(cream, -1, 2, y0 + R, y0 + 2 * R, -2, 1, ['pz']);
  slab(red, -1, 2, y0 + 2 * R, y0 + 2.3 * R, -2, 1, front);
  // 球筒（右）：顺 x 躺着，3 纹素长（西头 1 纹素海军蓝盖 + 2 纹素荧光黄筒身）、1 行高、2 纹素粗；前后两支 + 上面一支
  const tube = (y: number, z0: number) => {
    slab(navy, 3, 4, y, y + R, z0, z0 + 2, front);
    slab(ball, 4, 6, y, y + R, z0, z0 + 2, front);
  };
  tube(y0, 1);
  tube(y0, -1);
  tube(y0 + R, 0);

  const root = new THREE.Group();
  for (const [m, gs] of parts) {
    const mesh = new THREE.Mesh(mergeGeometries(gs), m);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
  }
  return root;
}

// 董事会长桌（#79，总监办公室南半边，东西向）：4.0 × 0.95 × 1.2 米（≈ 44 × 10.5 × 13 设计纹素；桌面 3.7 × 0.9，面高 0.76）。
// 元素：玫瑰红木的长条桌面（planks，沿 x 的长板、每 3 纹素一道缝，四周 1 纹素亮边）+ 中间一条墨绿皮的桌旗（呼应保险柜）
// + 桌面下往里收的红木围板和两个墩腿；十把青绿皮的椅子收在桌下（南北各四把 + 两头各一把），只露出椅背：
// 南边四把椅背朝镜头（5 纹素宽，高出桌面 1.5 行）、下面是深色的椅腿；北边四把只露椅背的顶。
// 三角形 290（桌面 12、桌旗 2、围板 12、墩腿 24、椅背 120、椅腿 120）。没有 userData。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

const box = (w: number, h: number, d: number, x: number, y: number, z: number) =>
  new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
const FACE = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number], noShadowReceive: true, tones: undefined };

export function build(ctx: AssetCtx): THREE.Object3D {
  const T = ctx.texel;
  const g = new THREE.Group();
  g.name = 'up-board-table';
  const add = (gs: THREE.BufferGeometry[], m: THREE.Material) =>
    g.add(new THREE.Mesh(gs.length > 1 ? mergeGeometries(gs.map((x) => x.toNonIndexed())) : gs[0], m));
  const TOP = 0.76;
  const SLAB = 0.07;
  const TW = 3.7;
  const TD = 0.9;

  // ── 桌面：玫瑰红木长板（和橙色的柚木地板靠色相分开） ──
  add(
    [box(TW, SLAB, TD, 0, TOP - SLAB, 0)],
    ctx.mat('wood', {
      elem: { kind: 'planks', space: 'local', p: [0, 0, 1, 3 * T], seam: 1, hi: 0 },
      ramp: [0xd8745e, 0xb05458, 0x6a3e6a],
      tones: {
        bands: [
          [0xd8745e, 0xe27e66, 0xcc6a56],
          [0xb05458, 0xba5e60, 0xa44a50],
          [0x6a3e6a, 0x744672, 0x603660],
        ],
        seam: [0xb4584e, 0x8c3e4a, 0x52305c],
        hi: [0xf4967a, 0xc87070, 0x80507e],
      },
      lightUp: 0.4,
      bands: [-0.5, 0.45],
      edge: 0.5,
      convex: 0.4,
      noShadowReceive: true,
    }),
  );
  // 桌旗：墨绿皮，贴在桌面上 4 毫米
  add(
    [new THREE.PlaneGeometry(2.6, 3 * T).rotateX(-Math.PI / 2).translate(0, TOP + 0.004, 0)],
    ctx.mat('cactus', {
      ramp: [0x3cae78, 0x1e7a5c, 0x1c4a5a],
      tones: undefined,
      edge: 0,
      convex: 0,
      noShadowReceive: true,
    }),
  );
  // 围板 + 墩腿：红木
  add(
    [
      box(TW - 0.3, 0.1, TD - 0.2, 0, TOP - SLAB - 0.1, 0),
      box(0.2, TOP - SLAB - 0.1, TD - 0.3, -1.25, 0, 0),
      box(0.2, TOP - SLAB - 0.1, TD - 0.3, 1.25, 0, 0),
    ],
    ctx.mat('timber', { ...FACE, ramp: [0xb86458, 0x8c4450, 0x5a3462], edge: 0.4, convex: 0.3 }),
  );

  // ── 椅子：椅背（青绿皮）+ 椅腿（深色木） ──
  const backs: THREE.BufferGeometry[] = [];
  const legs: THREE.BufferGeometry[] = [];
  const CW = 5 * T;
  const BY = 0.42;
  const BH = 0.53; // 椅背顶 0.95
  for (const x of [-1.38, -0.46, 0.46, 1.38])
    for (const s of [-1, 1]) {
      const z = s * (0.6 - T / 2);
      backs.push(box(CW, BH, T, x, BY, z));
      legs.push(box(CW - T, BY, T, x, 0, z - s * 0.01));
    }
  for (const s of [-1, 1]) {
    const x = s * (2.0 - T / 2);
    backs.push(box(T, BH, CW, x, BY, 0));
    legs.push(box(T, BY, CW - T, x - s * 0.01, 0, 0));
  }
  add(backs, ctx.mat('clothTeal', { ...FACE, ramp: [0x3cc8d0, 0x2690a8, 0x24507a], edge: 0.6, convex: 0.3 }));
  add(legs, ctx.mat('timber', { ...FACE, ramp: [0x9a5a44, 0x74404c, 0x402a52], edge: 0.4, convex: 0.2 }));

  ctx.mats.prepare(g);
  return g;
}

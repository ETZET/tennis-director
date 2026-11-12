// 理疗床：钢腿钢框架起一张青绿的软垫床面（面高 0.75 = 接口高度），北头（−z）一截头枕带一个趴脸的洞，床面上一块叠好的白毛巾。
// 0.72 × 0.80 × 1.89 米（8 × 9 × 21 设计纹素）。病人坐在南半（slots 的 seat [0.75, 0.35]），毛巾在北半。
// 元素：床面 planks（沿 z 每 0.45 米一道亮条 = 软垫的绗缝，不画缝）。
// 三角形 ≈ 98（床面 12 + 头枕 12 + 脸洞 2 + 框 12 + 4 腿 48 + 毛巾 12）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

const T = 0.09;
const box = (w: number, h: number, d: number, x: number, y: number, z: number) =>
  new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);

export function build(ctx: AssetCtx): THREE.Object3D {
  const g = new THREE.Group();
  const add = (gs: THREE.BufferGeometry[], m: THREE.Material) => g.add(new THREE.Mesh(mergeGeometries(gs), m));
  const W = 8 * T;
  const L = 21 * T;
  const TOP = 0.75;
  const PAD = 1.5 * T; // 软垫厚
  const zh = -L / 2 + 4 * T; // 头枕和床身的分界
  const pad = ctx.mat('clothTeal', {
    ramp: [0x2cc8b0, 0x1c96a0, 0x1c587a],
    tones: undefined,
    lightUp: 0.4,
    bands: [-0.45, 0.4],
    edge: 0.6,
    convex: 0.35,
    elem: { kind: 'planks', p: [0, 0, 1, 5 * T], seam: 0, hi: 1 },
  });
  // 床身 + 头枕（中间 半纹素的缝，头枕窄 1 纹素）
  add(
    [
      box(W, PAD, L / 2 - zh - 0.02, 0, TOP - PAD, (zh + 0.02 + L / 2) / 2),
      box(W - T, PAD, zh + L / 2 - 0.02, 0, TOP - PAD, (-L / 2 + zh - 0.02) / 2),
    ],
    pad,
  );
  // 脸洞：头枕上一块深色（2 × 2 纹素）
  add(
    [new THREE.PlaneGeometry(2.4 * T, 1.8 * T).rotateX(-Math.PI / 2).translate(0, TOP + 0.002, (-L / 2 + zh) / 2)],
    ctx.mat('ironwork', { ramp: [0x2c3e5c, 0x22304e, 0x1a2036], edge: 0.05, convex: 0 }),
  );
  // 钢框（垫子下 1 纹素）+ 四条腿（1 纹素见方，往里收 1 纹素）
  const steel = ctx.mat('metal', {
    ramp: [0x9cc8ec, 0x5c8cc8, 0x34467e],
    lightUp: 0.5,
    bands: [-0.45, 0.35],
    edge: 0.5,
    convex: 0.3,
    noShadowReceive: true,
  });
  const legH = TOP - PAD - T;
  const lx = W / 2 - 1.5 * T;
  const lz = L / 2 - 1.5 * T;
  add(
    [
      box(W - 2 * T, T, L - 2 * T, 0, legH, 0),
      box(T, legH, T, -lx, 0, -lz),
      box(T, legH, T, lx, 0, -lz),
      box(T, legH, T, -lx, 0, lz),
      box(T, legH, T, lx, 0, lz),
    ],
    steel,
  );
  // 毛巾：叠好的一块，床身北半
  add(
    [box(5 * T, 0.5 * T, 3 * T, 0, TOP, zh + 3.5 * T)],
    ctx.mat('clothWhite', {
      ramp: [0xfffaf0, 0xdcd0d8, 0x8a7ea8],
      lightUp: 0.5,
      bands: [-0.45, 0.35],
      edge: 0.4,
      convex: 0.4,
      noShadowReceive: true,
    }),
  );
  ctx.mats.prepare(g);
  return g;
}

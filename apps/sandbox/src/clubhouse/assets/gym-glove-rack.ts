// 拳击角的手套架：两根钢立柱夹一块木挂板（贴在架子后沿），板上两排挂钩挂着 4 副手套（每副两只并排的圆块，红 / 黑轮着），
// 架前地上丢着两只（信号：没挂回去 → 拣起来挂好）。1.17 × 1.2 × 0.4 米（13 × 13 × 4.4 设计纹素）。
// 手套：每只 0.18 × 0.27 × 0.16 的盒子 + 球面法线（每只单独算，读成圆的一团）；地上的两只躺着（拳面朝前，各转一点）。
// 三角形 180（立柱 24 + 挂板 12 + 挂钩横条 24 + 手套 10 × 12）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { blobNormals } from '../../clubsite/render/toon';
import type { AssetCtx } from '../ctx';

const T = 0.09;
const box = (w: number, h: number, d: number, x: number, y: number, z: number) =>
  new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
const FACE = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number], noShadowReceive: true };

/** 一只手套：盒子 + 从自己中心往外的法线（圆的明暗） */
function glove(w: number, h: number, d: number, x: number, y: number, z: number, rotY = 0, rotX = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.deleteAttribute('uv');
  blobNormals(g, new THREE.Vector3(0, -h * 0.15, -d * 0.2));
  g.rotateX(rotX).rotateY(rotY).translate(x, y, z);
  return g;
}

export function build(ctx: AssetCtx): THREE.Object3D {
  const g = new THREE.Group();
  const add = (gs: THREE.BufferGeometry[], m: THREE.Material) => g.add(new THREE.Mesh(mergeGeometries(gs), m));
  const W = 13 * T;
  const zb = -0.2; // 后沿
  // 立柱（落地，2 纹素见方）+ 挂板（立柱之间，后沿，2 纹素以上起）
  add(
    [box(2 * T, 1.2, 2 * T, -W / 2 + T, 0, zb + T), box(2 * T, 1.2, 2 * T, W / 2 - T, 0, zb + T)],
    ctx.mat('metal', { ...FACE, ramp: [0x6cd0bc, 0x3aa49c, 0x2a5a7c], convex: 0.4 }),
  );
  add(
    [box(W - 4 * T, 1.2 - 3 * T, 0.05, 0, 3 * T, zb + 0.025)],
    // 浅木挂板：正面落亮档（档位 [−0.45, −0.25]，正面 l ≈ −0.16）—— 红、黑手套挂在亮板上才读得出
    ctx.mat('wood', {
      ...FACE,
      bands: [-0.45, -0.25],
      ramp: [0xf4a862, 0xcc7450, 0x6a4478],
      tones: undefined,
      elem: { kind: 'planks', p: [0, 1, 0, 0.36], seam: 1, hi: 1 },
    }),
  );
  // 两排挂钩横条（1 纹素高，钢）
  const rows = [10.5 * T, 6 * T];
  add(
    rows.map((y) => box(W - 4 * T, T, 0.06, 0, y, zb + 0.08)),
    ctx.mat('metal', { ...FACE, ramp: [0x3c8a8c, 0x2a6474, 0x1e3a5c], convex: 0.2 }),
  );
  // 手套：每排 2 副，挂在横条下面（顶 = 横条底 + 半纹素，盖住横条一点）
  const red: THREE.BufferGeometry[] = [];
  const black: THREE.BufferGeometry[] = [];
  const GW = 2 * T;
  const GH = 3 * T;
  const GD = 0.16;
  rows.forEach((y, r) => {
    [-2, 2].forEach((cx, i) => {
      const dst = (i + r) % 2 === 0 ? red : black;
      for (const s of [-1, 1]) dst.push(glove(GW, GH, GD, cx * T + s * T, y - GH / 2 + 0.5 * T, zb + 0.05 + GD / 2));
    });
  });
  // 地上的两只：躺着（拳面朝前）、各转一点
  const floorY = GD / 2;
  red.push(glove(GW, GH, GD, -2.2 * T, floorY, 0.04, 0.5, -Math.PI / 2));
  black.push(glove(GW, GH, GD, 1.8 * T, floorY, 0.03, -0.35, -Math.PI / 2));
  // 手套的明暗：球面法线 + 光往上偏 → 上半落亮档、下半中档；黑手套是深靛（亮档 L ≈ 108，和亮板差 < 70）
  const gl = { ...FACE, lightUp: 0.5, bands: [-0.55, -0.1] as [number, number], edge: 0.6, convex: 0.25 };
  add(red, ctx.mat('fabricStripe', { ...gl, ramp: [0xff6a56, 0xd0404c, 0x6a2456] }));
  add(black, ctx.mat('ironwork', { ...gl, ramp: [0x6a58b8, 0x463c90, 0x2a2460] }));
  ctx.mats.prepare(g);
  return g;
}

// 团课房的上课铃 · 课表板（立在教练台东边，朝南）：两根木立柱夹一块黑板，板上一格格彩色的课（图块，不写字），
// 顶上横梁挂一只黄铜铃。0.99 × 1.77 × 0.10 米（11 × 19.7 × 1.1 设计纹素；铃顶 1.77）。
// 黑板上：一条奶油色表头 + 3 列 × 4 行的课格（紫 = 瑜伽、青 = 普拉提、珊瑚 = 搏击、黄 = 单车），空着的格子 = 没课。
// 三角形 106（立柱 + 横梁 36 + 黑板 12 + 表头 2 + 课格 9 × 2 + 铃 6 段锥台 24 + 吊架 12）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

const T = 0.09;
const box = (w: number, h: number, d: number, x: number, y: number, z: number) =>
  new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
/** 朝镜头的竖直面（板面、课格）：光往上偏 + 档位往下挪 */
const FACE = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number], noShadowReceive: true };

export function build(ctx: AssetCtx): THREE.Object3D {
  const g = new THREE.Group();
  const add = (gs: THREE.BufferGeometry[], m: THREE.Material) => g.add(new THREE.Mesh(mergeGeometries(gs), m));

  const W = 11 * T;
  const D = 0.1;
  const y0 = 4 * T; // 黑板下沿
  const y1 = 15 * T; // 黑板上沿（横梁底）
  // 木框：两根立柱（落地）+ 顶横梁
  add(
    [box(T, y1 + T, D, -W / 2 + T / 2, 0, 0), box(T, y1 + T, D, W / 2 - T / 2, 0, 0), box(W, T, D, 0, y1, 0)],
    ctx.mat('timber', { ...FACE, convex: 0.4 }),
  );
  // 黑板：夹在两柱之间，往后退 1 厘米
  const bw = W - 2 * T;
  add([box(bw, y1 - y0, 0.06, 0, y0, -0.01)], ctx.mat('slate', { ...FACE, edge: 0.4, convex: 0.1 }));

  // 课格：贴在板面前 1 厘米的小片（2 三角形一格）。列 3 纹素宽，行 2 纹素高，格间 1 纹素
  const zf = 0.02 + 0.001;
  const cell = (cx: number, cy: number, w = 2 * T, h = 1.5 * T) => new THREE.PlaneGeometry(w, h).translate(cx, cy, zf);
  const xs = [-3 * T, 0, 3 * T];
  const ys = [12 * T, 10 * T, 8 * T, 6 * T].map((v) => v + 0.75 * T);
  // 每格的课（-1 = 空）：0 紫 1 青 2 珊瑚 3 黄
  const plan = [
    [0, 2, 1],
    [3, -1, 0],
    [1, 0, -1],
    [2, 3, 1],
  ];
  const cells: THREE.BufferGeometry[][] = [[], [], [], []];
  plan.forEach((row, r) => {
    row.forEach((c, i) => {
      if (c >= 0) cells[c].push(cell(xs[i], ys[r]));
    });
  });
  const cellMat = [
    ctx.mat('clothPurple', { ...FACE, ramp: [0xc08af8, 0x9a62e0, 0x5a3aa0], edge: 0.05, convex: 0 }),
    ctx.mat('clothTeal', { ...FACE, ramp: [0x5ae0c8, 0x34b4a8, 0x266a80], edge: 0.05, convex: 0 }),
    ctx.mat('fabricStripe', { ...FACE, ramp: [0xff9a7a, 0xe8705e, 0x8a4068], edge: 0.05, convex: 0 }),
    ctx.mat('flowerYellow', { ...FACE, ramp: [0xffd84c, 0xecac3c, 0x9a6460], edge: 0.05, convex: 0 }),
  ];
  cells.forEach((gs, i) => {
    if (gs.length) add(gs, cellMat[i]);
  });
  // 表头：奶油色一条（粉笔写的"本周"），整宽
  add(
    [new THREE.PlaneGeometry(bw - 2 * T, T).translate(0, 13.9 * T, zf)],
    ctx.mat('signPaint', { ...FACE, edge: 0.05 }),
  );

  // 铃：横梁正中挂一只黄铜铃（6 段的锥台，前后压扁到板厚），上面一个小吊架，下面一颗铃舌
  const bell = new THREE.CylinderGeometry(0.06, 0.15, 0.24, 6, 1, false)
    .scale(1, 1, 0.33)
    .translate(0, y1 + T + 0.12 + T, 0);
  const brass = ctx.mat('brass', { ...FACE, edge: 0.6, convex: 0.5 });
  add([bell, box(T, T, 0.05, 0, y1 + T, 0)], brass);

  ctx.mats.prepare(g);
  return g;
}

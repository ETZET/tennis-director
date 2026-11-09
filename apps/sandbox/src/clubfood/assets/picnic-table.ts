// #10 picnic-table · 南边的经典 A 字野餐桌（3 张，伞 patio-umbrella 放在同一点，伞杆从桌面中心的洞穿过去）。
// 尺寸：桌面 1.9（x）× 0.744（z，三块 0.248 米的板），桌面高 0.74；两条凳连在桌上（桌心 ±0.62，凳面宽 0.3、座高 0.46）；
// 两头各一副 A 字腿（yz 平面里两根斜腿 + 一根托着两条凳的横档），腿宽 0.2（屏幕上 4 纹素）。
// 伞洞：中间那块板在 x ±0.1 断开（0.2 米的缝，伞杆 0.18）。
// 材质：全是 timber。桌面 + 凳面 planks 顺长边（缝 1 纹素、缝后一纹素亮条；板号按几何体 z 取 —— 网格往北挪 0.124，
// 板缝落在 z = −0.372 / ±0.124 和凳心 ±0.62）；腿和横档另一个网格（不加板纹：斜腿上横着切板缝很难看）。
// 朝镜头的面 lightUp + 低 bands 留中档。凳面上不放东西（人物 setSeat(0.48)）。
// userData：top = 0.74（桌面高，本地 y；托盘、薯条放 y = top）。
// 本地原点 = 桌子中心的地面，+x 东，+z 朝镜头（南）。三角形 144。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

const LEN = 1.9;
const BOARD = 0.248;
const TOP = 0.74;
const TOP_T = 0.08;
const BENCH_Z = 0.62;
const BENCH_W = 0.3;
const SEAT = 0.46;
const SEAT_T = 0.06;
/** 伞洞半宽 */
const HOLE = 0.1;
/** 腿在两头往里收 */
const LEG_X = LEN / 2 - 0.3;
const LEG_W = 0.2;

const box = (w: number, h: number, d: number, x: number, y: number, z: number) =>
  new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);

function strut(x: number, y0: number, z0: number, y1: number, z1: number, w: number, t: number) {
  const len = Math.hypot(y1 - y0, z1 - z0);
  const g = new THREE.BoxGeometry(w, len, t);
  g.rotateX(Math.atan2(z1 - z0, y1 - y0));
  g.translate(x, (y0 + y1) / 2, (z0 + z1) / 2);
  return g;
}

export function build(ctx: AssetCtx): THREE.Object3D {
  const g = new THREE.Group();
  g.name = 'picnic-table';
  const front = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number], convex: 0.3 };
  // 板纹按几何体自己的 z：几何体往南挪 OFF、网格往北挪 OFF → 板缝在 z = OFF + k·BOARD
  const OFF = BOARD / 2;

  const boards: THREE.BufferGeometry[] = [];
  const y0 = TOP - TOP_T;
  // 北、南两块整板
  for (const z of [-BOARD, BOARD]) boards.push(box(LEN, TOP_T, BOARD, 0, y0, z));
  // 中间那块在伞洞两边断开
  const seg = LEN / 2 - HOLE;
  for (const s of [-1, 1]) boards.push(box(seg, TOP_T, BOARD, s * (HOLE + seg / 2), y0, 0));
  // 两条凳
  for (const z of [-BENCH_Z, BENCH_Z]) boards.push(box(LEN, SEAT_T, BENCH_W, 0, SEAT - SEAT_T, z));
  const planks = new THREE.Mesh(
    mergeGeometries(boards).translate(0, 0, OFF),
    ctx.mat('timber', { ...front, elem: { kind: 'planks', space: 'local', p: [0, 0, 1, BOARD], seam: 1, hi: 1 } }),
  );
  planks.position.z = -OFF;
  g.add(planks);

  // A 字腿：两根斜腿（桌面下 ±0.16 → 地上 ±0.74）+ 一根托凳的横档（座下）
  const frame: THREE.BufferGeometry[] = [];
  const beamY = SEAT - SEAT_T - 0.09;
  for (const x of [-LEG_X, LEG_X]) {
    for (const s of [-1, 1]) frame.push(strut(x, y0, s * 0.16, 0, s * 0.74, LEG_W, 0.09));
    frame.push(box(LEG_W, 0.09, BENCH_Z * 2 + BENCH_W - 0.06, x, beamY, 0));
  }
  g.add(new THREE.Mesh(mergeGeometries(frame), ctx.mat('timber', { ...front, noShadowReceive: true })));

  g.userData.top = TOP;
  ctx.mats.prepare(g);
  return g;
}

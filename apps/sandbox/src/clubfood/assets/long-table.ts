// #9 long-table · 凉棚下的啤酒花园长桌（6 张）：一张长桌 + 南北两条长凳。
// 尺寸（layout.ts 的 TABLE）：桌面 4.2（x）× 0.9（z），桌面高 0.76；长凳在桌心 ±0.65（z），凳面宽 0.325、座高 0.46。
// 材质：桌面 timber（planks 顺长边：三块 0.3 米的板，缝 1 纹素、缝后一纹素亮条）；长凳 wood（每条两块板，不加亮条，
// 0.33 米的凳面只有 5 行，再加亮条就是一排横线）；腿 metal（桌子两头各一副 A 字铁腿、凳子两头各一块腿板，3 纹素宽）。
// 太阳在后方：朝镜头的桌沿、凳沿、腿 lightUp + 低 bands 留在中档；桌面、凳面朝天 = 亮档。
// 凳面上不放东西（人坐上去：人物 setSeat(0.48)）。
// userData：top = 0.76（桌面高，本地 y；托盘放 y = top）。
// 本地原点 = 桌子中心的地面，+x 东（长边），+z 朝镜头（南）。三角形 132。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

const LEN = 4.2;
const W = 0.9;
const TOP = 0.76;
const TOP_T = 0.12;
const BENCH_Z = 0.65;
/** 凳面宽 = 两块板（板宽 BOARD，让桌心 ±0.65 正好是板缝） */
const BOARD = BENCH_Z / 4;
const BENCH_W = BOARD * 2;
const SEAT = 0.46;
const SEAT_T = 0.08;
/** 腿在两头往里收多少 */
const LEG_X = LEN / 2 - 0.42;
/** 腿宽（x，屏幕上看到的宽度）：3 设计纹素 */
const LEG_W = 0.27;

const box = (w: number, h: number, d: number, x: number, y: number, z: number) =>
  new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);

/** yz 平面里的一根斜撑：从 (y0, z0) 到 (y1, z1)，x 宽 w、厚 t */
function strut(x: number, y0: number, z0: number, y1: number, z1: number, w: number, t: number) {
  const dy = y1 - y0;
  const dz = z1 - z0;
  const len = Math.hypot(dy, dz);
  const g = new THREE.BoxGeometry(w, len, t);
  g.rotateX(Math.atan2(dz, dy));
  g.translate(x, (y0 + y1) / 2, (z0 + z1) / 2);
  return g;
}

export function build(ctx: AssetCtx): THREE.Object3D {
  const g = new THREE.Group();
  g.name = 'long-table';
  const front = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number], convex: 0.3 };

  // 桌面：三块 0.3 米的板顺长边。planks 按几何体自己的 z 取板号，网格往北挪 0.15 → 板缝落在 z = −0.45 / −0.15 / +0.15
  const top = new THREE.Mesh(
    box(LEN, TOP_T, W, 0, TOP - TOP_T, 0.15),
    ctx.mat('timber', { ...front, elem: { kind: 'planks', space: 'local', p: [0, 0, 1, 0.3], seam: 1, hi: 1 } }),
  );
  top.position.z = -0.15;
  g.add(top);

  // 长凳：两条，每条两块板（缝在凳心，北沿一纹素缝 = 凳面和桌下暗缝的分界）
  const seats = [-BENCH_Z, BENCH_Z].map((z) => box(LEN, SEAT_T, BENCH_W, 0, SEAT - SEAT_T, z));
  g.add(
    new THREE.Mesh(
      mergeGeometries(seats),
      ctx.mat('wood', { ...front, elem: { kind: 'planks', space: 'local', p: [0, 0, 1, BOARD], seam: 1, hi: 0 } }),
    ),
  );

  // 腿：桌子两头各一副 A 字（yz 平面，顶在桌面下、脚叉到 ±0.36），凳子两头各一块腿板
  const legs: THREE.BufferGeometry[] = [];
  for (const x of [-LEG_X, LEG_X]) {
    for (const s of [-1, 1]) legs.push(strut(x, TOP - TOP_T, s * 0.05, 0, s * 0.36, LEG_W, 0.08));
    for (const z of [-BENCH_Z, BENCH_Z]) legs.push(box(LEG_W, SEAT - SEAT_T, BENCH_W - 0.08, x, 0, z));
  }
  g.add(new THREE.Mesh(mergeGeometries(legs), ctx.mat('metal', { ...front, noShadowReceive: true })));

  g.userData.top = TOP;
  ctx.mats.prepare(g);
  return g;
}

// #5 自助水站（clubdesk.md）：木柜 + 垫块上一只大圆水桶（铁龙头、接水盘）+ 一摞白杯子。
// 会员自己接水，水桶空了总监来换（用户定的）：水桶是单独的一组（userData.jug），水位看得见。
// 本地原点 = 脚印中心，+z = 正面（龙头那边）；场景里 rotY = E（正面朝东对着小路），镜头看到的是本地 −x 那一侧。
// 一半在凉棚的投影池里 → 不关受影。
// userData：
//   setLevel(l)   水位 0..1，按 1× 下的屏幕行取整（levels 档）；返回取整后的 0..1
//   setEmpty(b)   true = 空桶（水位 0），false = 满桶（水位 1）
//   level         现在的水位 0..1；levels = 一共几档（每个会员接一杯掉一档：setLevel(level − 1 / levels)）
//   jug           水桶那一组（总监换桶时可以整个拿走 / 放回：本地位置 jugSeat）
import * as THREE from 'three';
import { blobNormals } from '../../clubsite/render/toon';
import type { AssetCtx } from '../ctx';
import { box, cyl, DT, lathe, noCast, Parts, ROW } from './props/kit';

/** 朝镜头的竖面（太阳在画面后方）：光往上偏、档位阈值往下挪 */
const FACE = { lightUp: 0.5, bands: [-0.45, 0.3] as [number, number] };

// 水桶的剖面（桶本地坐标，y 0 = 桶底）：微收的底、直筒、圆肩、短颈
const JR = 0.215;
const JH = 0.46;
const SHOULDER = 0.36;
const PROFILE: [number, number][] = [
  [0.19, 0],
  [0.21, 0.035],
  [JR, 0.08],
  [JR, SHOULDER - 0.02],
  [0.2, SHOULDER + 0.04],
  [0.16, 0.42],
  [0.1, JH],
];
/** 剖面上 y 处的半径（线性插值） */
function rAt(y: number): number {
  for (let i = 1; i < PROFILE.length; i++) {
    const [r0, y0] = PROFILE[i - 1];
    const [r1, y1] = PROFILE[i];
    if (y <= y1) return r0 + ((r1 - r0) * (y - y0)) / Math.max(y1 - y0, 1e-6);
  }
  return PROFILE[PROFILE.length - 1][0];
}
/** 剖面在 [ya, yb] 之间的一段（两头补上插值点） */
function slice(ya: number, yb: number): [number, number][] {
  const pts: [number, number][] = [[rAt(ya), ya]];
  for (const [r, y] of PROFILE) if (y > ya + 1e-4 && y < yb - 1e-4) pts.push([r, y]);
  pts.push([rAt(yb), yb]);
  return pts;
}
const JUG_C = new THREE.Vector3(0, JH * 0.45, 0);
const SEG = 12;

export function build(ctx: AssetCtx): THREE.Object3D {
  const root = new THREE.Group();
  // 柜子：竖板。p = (1, 0, 1)：正面（z 不变）每 0.2 米沿 x 一条缝，侧面（x 不变，场景里朝镜头的那面）沿 z 一条缝
  const wood = ctx.mat('timber', { elem: { kind: 'planks', p: [1, 0, 1, 0.2], seam: 1, hi: 1 } });
  const top = ctx.mat('timber', { elem: { kind: 'planks', p: [0, 0, 1, 0.34], seam: 1, hi: 1 } });
  const iron = ctx.mat('ironwork');
  const white = ctx.mat('clothWhite', FACE);

  // ── 木柜 0.8 × 0.78 × 0.6 + 台面（四边各伸 0.045）+ 水桶垫块 ──
  const p = new Parts();
  p.add(wood, box(0.8, 0.78, 0.6, 0, 0.39, 0));
  p.add(top, box(0.89, DT, 0.69, 0, 0.78 + DT / 2, 0));
  const jx = 0.12; // 桶在台面上偏东一点（本地 +x），杯子放在另一边
  p.add(top, box(0.36, DT, 0.36, jx, 0.87 + DT / 2, -0.02));
  // 接水盘（铁）：龙头下面
  p.add(iron, box(0.18, 0.045, 0.135, jx, 0.87 + 0.0225, 0.27));
  // ── 一摞白杯子：上大下小的筒，顶上一圈口沿 ──
  const cx = -0.24;
  p.add(white, cyl(0.065, 3 * DT, 8, cx, 0.87 + 1.5 * DT, 0.1, 'y', 0.08));
  p.add(white, cyl(0.09, 0.045, 8, cx, 0.87 + 3 * DT + 0.0225, 0.1));
  p.build(root);

  // ── 水桶（单独一组）：水那段 jug 色，上面空的那段浅灰青；桶盖白；龙头铁 ──
  const jug = new THREE.Group();
  const jugSeat = new THREE.Vector3(jx, 0.96, -0.02);
  jug.position.copy(jugSeat);
  root.add(jug);
  const water = ctx.mat('jug', { lightUp: 0.45, bands: [-0.2, 0.45] });
  // 空桶的颜色：调色板里没有（列进报告给核心代理）。比 jug 浅、灰、不饱和；暗档冷靛
  const air = ctx.mats.toon(0xffffff, {
    ramp: [0xdcecec, 0xa8bccc, 0x606c9c],
    edge: 0.6,
    convex: 0.8,
    lightUp: 0.45,
    bands: [-0.2, 0.45],
  });
  const lid = new Parts();
  lid.add(white, cyl(0.11, 0.045, SEG, 0, JH + 0.0225, 0));
  // 龙头：桶前面伸出的方块 + 往下的嘴
  lid.add(iron, box(DT, DT, 0.12, 0, 0.07, JR + 0.04));
  lid.add(iron, box(DT, 0.06, DT, 0, 0.0, JR + 0.055));
  lid.build(jug);
  const waterMesh = new THREE.Mesh(new THREE.BufferGeometry(), water);
  const airMesh = new THREE.Mesh(new THREE.BufferGeometry(), air);
  jug.add(waterMesh, airMesh);

  // 水位：从桶底往上到肩，按屏幕行分档
  const levels = Math.max(1, Math.round(SHOULDER / ROW));
  let level = 1;
  const make = (ya: number, yb: number, capTop: boolean): THREE.BufferGeometry => {
    const pts = slice(ya, yb);
    if (ya <= 1e-4) pts.unshift([0, 0]);
    if (capTop) pts.push([0, yb]);
    return blobNormals(lathe(pts, SEG), JUG_C);
  };
  const setLevel = (l: number) => {
    const k = Math.round(THREE.MathUtils.clamp(l, 0, 1) * levels);
    level = k / levels;
    const h = (k / levels) * SHOULDER;
    waterMesh.geometry.dispose();
    airMesh.geometry.dispose();
    waterMesh.geometry = k > 0 ? make(0, h, true) : new THREE.BufferGeometry();
    airMesh.geometry = make(h, JH, false);
    waterMesh.visible = k > 0;
    root.userData.level = level;
    return level;
  };
  setLevel(ctx.variant === 1 ? 0.4 : ctx.variant === 2 ? 0 : 1);
  root.userData.setLevel = setLevel;
  root.userData.setEmpty = (b: boolean) => setLevel(b ? 0 : 1);
  root.userData.levels = levels;
  root.userData.jug = jug;
  root.userData.jugSeat = jugSeat;

  ctx.mats.prepare(root);
  // 水桶不投影：太阳在后面，自投影会把朝镜头的半边（看水位的那面）全压暗；凉棚的影子照样落在它上面
  noCast(jug);
  return root;
}

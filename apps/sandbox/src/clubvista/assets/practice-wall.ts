// 练习墙（practice 图自己的；从 hit-wall 复制改）：一段 9 × 2.9 × 0.5 米的灰泥墙，正面朝南（+z，朝镜头）。
// 第 2 轮评判："像一块粉色广告牌"；第 3 轮："顶上一条细深灰带 + 白框，看不出厚墙" → 一面浅色的立墙：
//   - 墙身米白浅灰的灰泥（poolStone），朝镜头的立面 lightUp 抬到中档（读成一大块浅色的墙面，不是暗带）；
//   - 顶上一条 0.5 米深的浅色压顶（墙的厚度）+ 墙脚一行暗的勒脚 → 读得出是立着的厚墙；
//   - 一条网高的白线（0.91 米）、线上正中一个白边靶框；靶框里外几个深色的球印；
//   - 墙脚一排滚到墙根的球（12 个，成两三撮）。
// 比 hit-wall 矮 0.1 米；场地离墙脚留 0.8 米的外圈，墙影落在外圈上。本地原点 = 墙脚中心的地面。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

const T = 0.09;
const VROW = T / Math.SQRT1_2;

/** 朝镜头的立面：背光，落中档偏暗（不是一块黑） */
const FACE = { lightUp: 0.65, bands: [-0.6, 0.2] as [number, number] };

function box(w: number, h: number, d: number, x: number, y: number, z: number) {
  return new THREE.BoxGeometry(w, h, d).translate(x, y, z);
}

export function build(ctx: AssetCtx): THREE.Object3D {
  const g = new THREE.Group();
  g.name = 'practice-wall';
  const W = 9;
  const H = 2.9;
  const D = 0.5;
  const capH = VROW;
  const wallH = H - capH;

  // ── 墙身：三块墙板（板缝一纹素，退进去）──
  const panels = 3;
  const pw = W / panels;
  const wall: THREE.BufferGeometry[] = [];
  for (let i = 0; i < panels; i++) wall.push(box(pw - T, wallH, D, -W / 2 + pw * (i + 0.5), wallH / 2, 0));
  g.add(
    new THREE.Mesh(
      mergeGeometries(wall),
      ctx.mat('poolStone', {
        ...FACE,
        noShadowReceive: true,
        elem: { kind: 'stones', size: [30, 12], seam: 0, hi: 0, seed: 11 },
        toneW: [0.25, 0],
      }),
    ),
  );
  // 板缝的底子
  g.add(
    new THREE.Mesh(
      box(W - 0.02, wallH, D - 0.14, 0, wallH / 2, -0.07),
      ctx.mat('stepStone', { ...FACE, noShadowReceive: true, edge: 0.05, convex: 0 }),
    ),
  );
  // ── 压顶：每边宽出半纹素，顶面是亮唇（墙的厚度就靠它读出来）──
  g.add(new THREE.Mesh(box(W + 0.09, capH, D + 0.09, 0, wallH + capH / 2, 0), ctx.mat('curb', { lightUp: 0.3 })));

  // ── 墙脚一行暗的勒脚（比墙面每边宽出半纹素）：墙"立"在地上，不是贴在地上的一块板 ──
  g.add(
    new THREE.Mesh(
      box(W + 0.09, VROW, D + 0.09, 0, VROW / 2, 0),
      ctx.mat('stepStone', { lightUp: 0.3, bands: [-0.3, 0.4], noShadowReceive: true, edge: 0.05, convex: 0 }),
    ),
  );

  // ── 网高白线 + 靶框白边 ──
  const zf = D / 2 + 0.02;
  const lineY = 0.91;
  const lineH = VROW;
  const tw = 2.4;
  const tb = lineY + lineH + 2 * VROW;
  const th = 6 * VROW;
  const white: THREE.BufferGeometry[] = [box(W - 0.02, lineH, 0.02, 0, lineY + lineH / 2, zf)];
  white.push(box(tw + 2 * T, lineH, 0.02, 0, tb + th + lineH / 2, zf + 0.005));
  for (const sx of [-1, 1])
    white.push(box(T, th + lineH, 0.02, sx * (tw / 2 + T / 2), tb + (th + lineH) / 2, zf + 0.005));
  g.add(
    new THREE.Mesh(
      mergeGeometries(white),
      ctx.mat('line', { lightUp: 0.6, bands: [-0.9, -0.5], noShadowReceive: true, edge: 0.05, convex: 0 }),
    ),
  );

  // ── 球印：靶框里外几个 2 × 1 纹素的深色斑（球打上去的毛印），多半落在靶框附近 ──
  const rnd = ctx.rng(`practice-wall:${ctx.variant}`);
  const marks: THREE.BufferGeometry[] = [];
  const mk: [number, number][] = [
    [-0.5, 0.4],
    [0.3, 0.55],
    [0.7, 0.2],
    [-0.9, 0.7],
    [1.6, 0.3],
    [-1.8, 0.1],
    [2.6, 0.6],
  ];
  for (const [mx, my] of mk) {
    const x = Math.round((mx + (rnd() - 0.5) * 0.3) / T) * T;
    const y = tb + th * my;
    marks.push(box(2 * T, VROW, 0.02, x, y, zf + 0.004));
  }
  g.add(
    new THREE.Mesh(
      mergeGeometries(marks),
      ctx.mat('stepStone', { lightUp: 0.2, bands: [-0.1, 0.6], noShadowReceive: true, edge: 0, convex: 0 }),
    ),
  );

  // ── 墙脚一排球：三撮，滚到墙根 ──
  const balls: THREE.BufferGeometry[] = [];
  const clumps: [number, number][] = [
    [-3.2, 4],
    [0.6, 5],
    [3.3, 3],
  ];
  for (const [cx, n] of clumps)
    for (let i = 0; i < n; i++) {
      const x = Math.round((cx + (i - n / 2) * 0.24 + (rnd() - 0.5) * 0.1) / T) * T;
      const z = Math.round((0.14 + rnd() * 0.3) / T) * T;
      balls.push(new THREE.IcosahedronGeometry(0.1, 1).translate(x, 0.1, D / 2 + z));
    }
  g.add(
    new THREE.Mesh(
      mergeGeometries(balls),
      ctx.mat('ball', { lightUp: 0.5, bands: [-0.3, 0.3], noShadowReceive: true }),
    ),
  );

  ctx.mats.prepare(g);
  return g;
}

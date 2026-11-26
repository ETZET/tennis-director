// 凉棚（ramada）：四根粗木柱 + 两根顺 x 的大梁 + 一排顺 z 的椽子（平顶木格栅，椽子之间露空 → 地上是一条条的影子）
// + 西半边顶上盖一块奶白帆布（两头各垂下一截帘边）。不放家具（场景里另摆长椅、水站）。
// 4.4 × 2.9 × 3.6 米。本地原点 = 脚印中心的地面，+z 朝镜头。
// 材质规范 v2：木构 = timber 的 planks（每根木料一个深浅：椽子按 x 一根一格；梁、柱按自己的轴），帆布 = canvas（THIN 不接投影）。
// 柱子朝镜头那面 lightUp + 低 bands（太阳在后面，不然一根根黑条）。尺寸全按 0.09 米纹素取整：柱 3.5 纹素、椽 3 纹素宽、空 5 纹素。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

const T = 0.09;
/**
 * 朝镜头的竖面：光往上偏、档位阈值往下挪；不接投影（柱子正面本来就背着太阳，帆布的投影再压一层就是一根根黑条，
 * 读不出木头）。
 */
const FACE = { lightUp: 0.55, bands: [-0.45, 0.3] as [number, number], noShadowReceive: true };

/** 盒子：中心 (x, y, z) */
function box(w: number, h: number, d: number, x: number, y: number, z: number) {
  return new THREE.BoxGeometry(w, h, d).translate(x, y, z);
}

export function build(ctx: AssetCtx): THREE.Object3D {
  const g = new THREE.Group();
  g.name = 'ramada';
  const W = 4.4;
  const D = 3.6;
  const H = 2.9;
  const post = 4 * T; // 0.36
  const beamH = 3 * T; // 0.27
  const beamW = 3 * T;
  const rafH = 2 * T; // 椽子高 0.18（侧面一行多）
  const rafW = 3 * T; // 椽子宽 0.27（俯视 3 纹素）
  const yRafTop = H - 0.04; // 帆布压在椽子上，顶 = H
  const yRaf = yRafTop - rafH / 2;
  const yBeam = yRafTop - rafH - beamH / 2;
  const px = W / 2 - 0.5; // 柱子缩进：梁、椽子两头各挑出一截
  const pz = D / 2 - 0.45;

  // ── 柱子（四根）+ 斜撑（前后两排各两根，从柱子撑到大梁，3 纹素见方）──
  const posts: THREE.BufferGeometry[] = [];
  const postH = yBeam - beamH / 2;
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      posts.push(box(post, postH, post, sx * px, postH / 2, sz * pz));
      // 斜撑：柱子里侧 45°，长 0.85
      const br = box(0.85, 2 * T, 2 * T, 0, 0, 0)
        .rotateZ((-sx * Math.PI) / 4)
        .translate(sx * (px - 0.36), postH - 0.3, sz * pz);
      posts.push(br);
    }
  g.add(
    new THREE.Mesh(
      mergeGeometries(posts),
      ctx.mat('timber', { ...FACE, elem: { kind: 'planks', p: [1, 0, 0, 1.2], seam: 0, hi: 0, seed: 3 } }),
    ),
  );

  // ── 大梁（两根，顺 x，压在柱头上）──
  const beams: THREE.BufferGeometry[] = [];
  for (const sz of [-1, 1]) beams.push(box(W - 0.1, beamH, beamW, 0, yBeam, sz * pz));
  g.add(
    new THREE.Mesh(
      mergeGeometries(beams),
      ctx.mat('timber', { ...FACE, elem: { kind: 'planks', p: [0, 0, 1, pz * 2], seam: 0, hi: 0, seed: 5 } }),
    ),
  );

  // ── 椽子（顺 z，压在梁上）：根数 n，中心距 s，空 = s − 3 纹素 ──
  const n = 7;
  const s = (W - rafW) / (n - 1); // ≈ 0.69（7.7 纹素）→ 空 ≈ 4.7 纹素
  const rafters: THREE.BufferGeometry[] = [];
  const x0 = -W / 2 + rafW / 2;
  for (let i = 0; i < n; i++) rafters.push(box(rafW, rafH, D, x0 + i * s, yRaf, 0));
  // planks 沿 x 一格 = 一根椽子（格子起点对齐到最西那根的西沿）：每根一个深浅
  const rm = new THREE.Mesh(
    mergeGeometries(rafters).translate(W / 2, 0, 0),
    ctx.mat('timber', { ...FACE, elem: { kind: 'planks', p: [1, 0, 0, s], seam: 0, hi: 0, seed: 7 } }),
  );
  rm.position.x = -W / 2;
  g.add(rm);

  // ── 帆布：盖西边 3 根半椽子（x −2.2 … 0.1），平铺在椽子顶上；南北两头各垂下一截帘边（朝镜头那条是暗带）──
  const cx0 = -W / 2 - 0.05;
  const cx1 = x0 + 3 * s + rafW / 2;
  const cw = cx1 - cx0;
  const cl = D + 0.1;
  const ct = 0.05;
  const canvas: THREE.BufferGeometry[] = [];
  canvas.push(box(cw, ct, cl, (cx0 + cx1) / 2, yRafTop + ct / 2, 0));
  const drop = 3 * T;
  for (const sz of [-1, 1]) canvas.push(box(cw, drop, ct, (cx0 + cx1) / 2, yRafTop + ct - drop / 2, sz * (cl / 2)));
  g.add(new THREE.Mesh(mergeGeometries(canvas), ctx.mat('canvas', { lightUp: 0.3, bands: [-0.45, 0.45] })));

  ctx.mats.prepare(g);
  return g;
}

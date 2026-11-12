// tree-planter：拱廊前沙地上的树池（蒲葵压在 B1 顶板上，砌高 0.6 米）。2 × 0.6 × 2 米（22 × 7 × 22 设计纹素）。
// 塔拉韦拉花砖贴面的方池（talavera 钴蓝，strata 当花砖：一行 4 行高、一块 ≈ 7 纹素，砖缝 + 每块自己一个深浅），
// 上沿一圈奶白的花砖腰线（signPaint），陶砖压顶（cap，0.2 米宽），里面一块土（soilCut + 碎石）。蒲葵的槽位在 y 0.6（压顶面）。
// 朝镜头的侧面：lightUp + 低 bands（落中档，花砖的蓝留得住）、不接投影。三角形 74（池身 12 + 腰线 12 + 压顶 4 × 12 + 土 2）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';
import { EL } from '../palette';

const S = 2.0;
const H = 0.6;
const BODY = 0.5;
const RIM = 0.2;

/** 盒子的 uv 改成墙空间：x = 沿墙米数，y = 离 top 多深（米）；顶 / 底面给 0 */
function wallUv(g: THREE.BufferGeometry, top: number): THREE.BufferGeometry {
  const p = g.getAttribute('position');
  const n = g.getAttribute('normal');
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const side = Math.abs(n.getY(i)) < 0.5;
    const along = Math.abs(n.getZ(i)) > 0.5 ? p.getX(i) : p.getZ(i);
    uv.setXY(i, along + 5, side ? top - p.getY(i) : 0);
  }
  uv.needsUpdate = true;
  return g;
}

export function build(ctx: AssetCtx): THREE.Object3D {
  const g = new THREE.Group();
  const face = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number], noShadowReceive: true };
  // 池身：花砖（strata：墙空间，一行 4 行、一块 7 纹素；没有淌沙、没有矮墙规则）
  g.add(
    new THREE.Mesh(
      wallUv(new THREE.BoxGeometry(S, BODY, S).translate(0, BODY / 2, 0), BODY),
      ctx.mat('talavera', {
        ...face,
        elem: { kind: 'strata', space: 'wall', size: [7, 4], hi: 0.5, q: [0, 1e6, 0, 0] },
      }),
    ),
  );
  // 腰线：奶白花砖一圈（比池身外凸 1 厘米，0.38～0.5 米）
  g.add(
    new THREE.Mesh(
      wallUv(new THREE.BoxGeometry(S + 0.02, 0.12, S + 0.02).translate(0, 0.38 + 0.06, 0), 0.5),
      ctx.mat('signPaint', {
        ...face,
        elem: { kind: 'strata', space: 'wall', size: [6, 9], hi: 0, q: [0, 1e6, 0, 0] },
      }),
    ),
  );
  // 压顶：陶砖一圈（0.5～0.6 米），外凸 0.05
  const o = S / 2 + 0.05;
  const rims = [
    new THREE.BoxGeometry(2 * o, H - BODY, RIM).translate(0, BODY + (H - BODY) / 2, -o + RIM / 2),
    new THREE.BoxGeometry(2 * o, H - BODY, RIM).translate(0, BODY + (H - BODY) / 2, o - RIM / 2),
    new THREE.BoxGeometry(RIM, H - BODY, 2 * o - 2 * RIM).translate(-o + RIM / 2, BODY + (H - BODY) / 2, 0),
    new THREE.BoxGeometry(RIM, H - BODY, 2 * o - 2 * RIM).translate(o - RIM / 2, BODY + (H - BODY) / 2, 0),
  ];
  g.add(
    new THREE.Mesh(
      mergeGeometries(rims),
      ctx.mat('cap', { elem: { kind: 'stones', size: [9, 5], seam: 0.6, hi: 0.6 }, convex: 0.3 }),
    ),
  );
  // 土：比压顶低 0.06
  const iw = 2 * (o - RIM);
  g.add(
    new THREE.Mesh(
      new THREE.PlaneGeometry(iw, iw).rotateX(-Math.PI / 2).translate(0, H - 0.06, 0),
      ctx.mat('soilCut', { elem: { ...EL.soilCut, pebbles: 0.08, accent: [0xc8a080, 0x8a6a6a, 0x5c4a62] } }),
    ),
  );
  ctx.mats.prepare(g);
  return g;
}

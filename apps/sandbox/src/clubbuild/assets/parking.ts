// 停车场（4×5 格，12 × 15 米）：沥青 + 车位漆 + 路缘 + 复用的车和假紫荆。入口在门格 (2, 4)：南沿 x 0…3 断开路缘。
// - 地面（画的，照 clubpark/terrain.ts 的停车场）：沥青（lotAsphalt，深浅块元素）铺满，四边一圈水泥路缘（kerb，0.15 高，
//   朝镜头的南沿是一条亮顶暗面的带），入口那 3 米路缘断开、沥青伸到占地边。
// - 车位：北排 4 个（车头朝北，4.6 米深），南排西边 2 个（车头朝南）；车位之间 2 纹素宽的奶白漆线（lotPaint），
//   车头那头一道车轮挡（kerb 的矮条）。中间 5 米多的车道。
// - 南排东头（入口东边）一块种植岛：路缘围着碎花岗岩，种一棵假紫荆（palo-verde，缩到冠不出占地，≈ 0.6 倍）。
// - 车（复用 clubpark 的 car / suv：Q 版胖车，车头朝本地 −z）：3～4 辆，车漆按变体轮换，偶尔一辆 SUV、一个空位。
// 本地原点 = 占地中心，+z 朝镜头。
import * as THREE from 'three';
import { build as car } from '../../clubpark/assets/car';
import { build as suv } from '../../clubpark/assets/suv';
import { EL as PARK_EL } from '../../clubpark/palette';
import { build as paloVerde } from '../../clubsite/nature/palo-verde';
import { box, quad, topGeo, wallGeo } from '../../clubsite/render/geo';
import type { AssetCtx } from '../ctx';
import { EL } from '../palette';
import { Bucket, finish, place, reuse, roundRect } from './gnd-kit';

const HX = 6;
const HZ = 7.5;
/** 路缘宽、高 */
const K = 0.3;
const KH = 0.15;
/** 车位：宽、深；北排 z 从北沿往南、南排从南沿往北 */
const SW = 2.7;
const SD = 4.6;
const X0 = -HX + K + 0.1;
/** 入口（门格 col 2 → x 0…3） */
const GATE: [number, number] = [0, 3];
/** 漆线宽：2 设计纹素 */
const LW = 0.18;

export function build(ctx: AssetCtx): THREE.Object3D {
  const root = new THREE.Group();
  root.name = 'parking';
  const own = new THREE.Group();
  root.add(own);
  const B = new Bucket();
  const flat = { cast: false };

  // ── 沥青 ──
  B.add('lotAsphalt', quad({ x0: -HX + K, x1: HX - K, z0: -HZ + K, z1: HZ - K }, 0.01), {
    ...flat,
    extra: { elem: PARK_EL.lotAsphalt },
  });
  B.add('lotAsphalt', quad({ x0: GATE[0], x1: GATE[1], z0: HZ - K - 0.02, z1: HZ - 0.02 }, 0.01), flat);
  // ── 路缘（入口断开）──
  const kerb = { extra: { elem: PARK_EL.kerb } };
  B.add('kerb', box(HX * 2, KH, K, 0, 0, -HZ + K / 2), kerb);
  B.add('kerb', box(K, KH, HZ * 2 - 2 * K, -HX + K / 2, 0, 0), kerb);
  B.add('kerb', box(K, KH, HZ * 2 - 2 * K, HX - K / 2, 0, 0), kerb);
  B.add('kerb', box(GATE[0] + HX, KH, K, (-HX + GATE[0]) / 2, 0, HZ - K / 2), kerb);
  B.add('kerb', box(HX - GATE[1], KH, K, (GATE[1] + HX) / 2, 0, HZ - K / 2), kerb);

  // ── 车位：漆线 + 车轮挡 ──
  const nZ0 = -HZ + K;
  const nZ1 = nZ0 + SD;
  const sZ1 = HZ - K;
  const sZ0 = sZ1 - SD;
  const paint = { ...flat, tag: 'paint' };
  // 北排 4 个
  for (let i = 0; i <= 4; i++) {
    const x = X0 + i * SW;
    B.add('lotPaint', quad({ x0: x - LW / 2, x1: x + LW / 2, z0: nZ0 + 0.05, z1: nZ1 }, 0.02), paint);
  }
  for (let i = 0; i < 4; i++) B.add('kerb', box(1.6, 0.12, 0.22, X0 + (i + 0.5) * SW, 0.01, nZ0 + 0.55));
  // 南排西边 2 个（到入口为止）
  for (let i = 0; i <= 2; i++) {
    const x = X0 + i * SW;
    B.add('lotPaint', quad({ x0: x - LW / 2, x1: x + LW / 2, z0: sZ0, z1: sZ1 - 0.05 }, 0.02), paint);
  }
  for (let i = 0; i < 2; i++) B.add('kerb', box(1.6, 0.12, 0.22, X0 + (i + 0.5) * SW, 0.01, sZ1 - 0.55));
  // 车道上入口进来的箭头（一条竖杆 + 三角头，朝北）
  {
    const ax = (GATE[0] + GATE[1]) / 2;
    B.add('lotPaint', quad({ x0: ax - 0.12, x1: ax + 0.12, z0: 3.3, z1: 5.2 }, 0.02), paint);
    const tri = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(ax, 0.02, 2.5),
      new THREE.Vector3(ax - 0.5, 0.02, 3.35),
      new THREE.Vector3(ax + 0.5, 0.02, 3.35),
    ]);
    tri.computeVertexNormals();
    B.add('lotPaint', tri, paint);
  }

  // ── 种植岛（南排东头，入口东边）──
  const islands: { pts: [number, number][]; c: [number, number] }[] = [
    {
      pts: roundRect(GATE[1] + 0.35, sZ0 + 0.2, HX - K, sZ1, 0.5, 3),
      c: [(GATE[1] + 0.35 + HX - K) / 2, (sZ0 + sZ1) / 2],
    },
  ];
  for (const isl of islands) {
    B.add('kerb', topGeo(isl.pts, KH), kerb);
    B.add('kerb', wallGeo(isl.pts, KH, 0, true), { ...kerb, recv: false });
    const inner = isl.pts.map(([x, z]): [number, number] => [
      isl.c[0] + (x - isl.c[0]) * 0.86,
      isl.c[1] + (z - isl.c[1]) * 0.92,
    ]);
    B.add('granite', topGeo(inner, KH + 0.01), { cast: false, extra: { elem: { ...EL.granite, seed: 21 } } });
  }
  B.build(ctx, own, 'parking:');
  finish(ctx, own);

  // ── 树 ──
  const v = ctx.variant;
  const rnd = ctx.rng(`parking:${v}`);
  const tree = reuse(paloVerde, ctx, v);
  const isl = islands[0].c;
  // 先按原大量冠，再缩到冠伸出占地不超过 0.15 米（最大 0.8 倍）
  tree.rotation.y = rnd() * Math.PI * 2;
  tree.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(tree);
  const cx = isl[0];
  const cz = isl[1] - 0.2;
  const fit = Math.min((HX + 0.15 - cx) / bb.max.x, (HZ + 0.15 - cz) / bb.max.z, (cx + HX) / -bb.min.x);
  place(root, tree, cx, cz, tree.rotation.y, Math.min(0.8, fit), KH);

  // ── 车：北排 4 个位、南排 2 个位，空一个；车漆按变体轮换 ──
  const stalls: { x: number; z: number; ry: number }[] = [];
  for (let i = 0; i < 4; i++) stalls.push({ x: X0 + (i + 0.5) * SW, z: nZ0 + SD / 2 + 0.15, ry: 0 });
  for (let i = 0; i < 2; i++) stalls.push({ x: X0 + (i + 0.5) * SW, z: sZ1 - SD / 2 - 0.15, ry: Math.PI });
  const empty = [2, 5, 1, 4][v % 4];
  const suvAt = [3, 0, 4, 2][v % 4];
  stalls.forEach((s, i) => {
    if (i === empty) return;
    const kind = i === suvAt ? suv : car;
    const paintV = (v * 3 + i * 2) % 7;
    const o = reuse(kind, ctx, paintV);
    // 停得不完全正：左右偏一点、歪一点
    place(root, o, s.x + (rnd() - 0.5) * 0.25, s.z + (rnd() - 0.5) * 0.3, s.ry + (rnd() - 0.5) * 0.06);
  });
  return root;
}

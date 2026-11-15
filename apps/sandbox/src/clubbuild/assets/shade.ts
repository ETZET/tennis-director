// 遮阳休息区（2×2 格，6 × 6 米）：一块石板小场 + 复用的遮阳帆、长椅、自助水站。
// - 场面（画的）：5.6 × 5.6 米的石板（flagstone，石板元素），四边一圈 2 纹素的浅水泥路缘（concrete，比石板高一点 → 一条亮边）。
// - 遮阳帆（美术 r1：原来是 court-sail 的奶白底蓝宽条，和看台、球具店雨篷同一种蓝白条纹，开罗距离下会混）：
//   换成一整块白色方帆（clothWhite，往南斜、四角一高一低绷着），四根 0.3 米的绿漆钢杆（2 纹素）—— 俯视就是"一块白方块"。
// - 帆下：clubsite 的长椅（面朝镜头）；东边一台 clubdesk 的自助水站（木柜 + 大水桶，龙头朝镜头）。
// 本地原点 = 占地中心，+z 朝镜头。
import * as THREE from 'three';
import { build as waterStation } from '../../clubdesk/assets/water-station';
import { build as bench } from '../../clubsite/assets/bench';
import { box, quad } from '../../clubsite/render/geo';
import type { AssetCtx } from '../ctx';
import { EL } from '../palette';
import { Bucket, bar, finish, place, reuse } from './gnd-kit';

const HS = 2.8;
const PAD = 0.06;
const KERB = 0.18;

export function build(ctx: AssetCtx): THREE.Object3D {
  const root = new THREE.Group();
  root.name = 'shade';
  const own = new THREE.Group();
  root.add(own);
  const B = new Bucket();
  // 石板场面 + 四边路缘
  B.add('flagstone', quad({ x0: -HS + KERB, x1: HS - KERB, z0: -HS + KERB, z1: HS - KERB }, PAD), {
    cast: false,
    extra: { elem: { ...EL.flagstone, seed: 17 } },
  });
  const k = (w: number, d: number, x: number, z: number) => B.add('concrete', box(w, PAD + 0.04, d, x, 0, z));
  k(HS * 2, KERB, 0, -HS + KERB / 2);
  k(HS * 2, KERB, 0, HS - KERB / 2);
  k(KERB, HS * 2 - 2 * KERB, -HS + KERB / 2, 0);
  k(KERB, HS * 2 - 2 * KERB, HS - KERB / 2, 0);
  B.build(ctx, own, 'shade:');
  finish(ctx, own);

  // 遮阳帆：四根杆（北高南低）+ 一整块白帆（四角绷在杆顶，中间往下兜一点）
  const S = new Bucket();
  const P = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const corners = [P(-2.3, 3.3, -1.7), P(2.3, 2.9, -1.9), P(2.3, 2.5, 1.5), P(-2.3, 2.8, 1.6)];
  for (const c of corners)
    S.add('metal', bar(P(c.x, PAD, c.z), P(c.x, c.y + 0.15, c.z), 0.3), {
      tag: 'pole',
      extra: { lightUp: 0.5, convex: 0.3 },
    });
  const mid = P(0, 2.55, -0.1);
  const pos: number[] = [];
  for (let i = 0; i < 4; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % 4];
    pos.push(a.x, a.y, a.z, mid.x, mid.y, mid.z, b.x, b.y, b.z);
  }
  const sail = new THREE.BufferGeometry();
  sail.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  sail.computeVertexNormals();
  // 法线朝上（四个三角形绕向不一致时翻过来）
  const nrm = sail.getAttribute('normal') as THREE.BufferAttribute;
  for (let i = 0; i < nrm.count; i++) if (nrm.getY(i) < 0) nrm.setXYZ(i, -nrm.getX(i), -nrm.getY(i), -nrm.getZ(i));
  S.add('clothWhite', sail, {
    tag: 'sail',
    extra: { side: THREE.DoubleSide, lightUp: 0.35, bands: [-0.2, 0.3], edge: 0.5, convex: 0.1, noShadowReceive: true },
  });
  const sg = new THREE.Group();
  S.build(ctx, sg, 'shade:sail:');
  finish(ctx, sg);
  root.add(sg);
  // 帆下的长椅（面朝镜头），东边的水站
  place(root, reuse(bench, ctx, ctx.variant), -0.55, -0.55, 0, 1, PAD);
  place(root, reuse(waterStation, ctx, 0), 1.35, -0.45, 0, 1, PAD);
  return root;
}

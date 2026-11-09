// #19 trash-bag：扎好的黑垃圾袋（回收站旁边、总监拎着走）。
// 尺寸 ≈ 0.6 × 0.7 × 0.6（袋身 0.56 高 + 扎口 0.14）；三角形 74（上限 80）。
// 一团鼓鼓的袋身（下宽上收、坐在地上压扁一点，表面按 ctx.rng 起伏）+ 顶上一个扎口的小揪（两只"耳朵"，3 纹素宽）。
// ironwork 黑袋：球面法线 + lightUp → 顶上亮档、腰中档、底暗档；亮档里一条 1 纹素的塑料高光（ironwork 往上挪一档的颜色）。
// 变体（?v=）只换起伏的种子和揪的朝向。
//
// userData：
//   grip = { at: [0, 0.62, 0], axis: [0, -1, 0], up: [0, 0, 1] }   握点 = 扎口（本地坐标）；拎着时袋子挂在手下面（clubsite/people/hold.ts）
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

const R = 0.29;
const CY = 0.25;
const NECK_Y = 0.5;
const KNOT_TOP = 0.7;

const cache = new Map<number, { body: THREE.BufferGeometry; sheen: THREE.BufferGeometry }>();

function geometry(ctx: AssetCtx): { body: THREE.BufferGeometry; sheen: THREE.BufferGeometry } {
  const v = ctx.variant;
  const hit = cache.get(v);
  if (hit) return hit;
  const rnd = ctx.rng(`trash-bag:${v}`);

  // 袋身：7 × 5 的低模球（56 个三角形），逐顶点起伏；底压平坐地，上半截往扎口收
  const s = new THREE.SphereGeometry(R, 7, 5);
  const p = s.getAttribute('position') as THREE.BufferAttribute;
  const bump = new Map<string, number>();
  const tmp = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    tmp.fromBufferAttribute(p, i);
    // 同一个位置（接缝上的重复顶点）同一个起伏，别裂开
    const key = `${tmp.x.toFixed(3)},${tmp.y.toFixed(3)},${tmp.z.toFixed(3)}`;
    let b = bump.get(key);
    if (b === undefined) {
      b = 1 + (rnd() - 0.5) * 0.16;
      bump.set(key, b);
    }
    const u = tmp.y / R; // −1 底 … 1 顶
    // 下半截往外鼓（装满了往下坠），上半截收成扎口
    const wide = u < 0 ? 1.06 + 0.06 * -u : 1.06 - 0.86 * u * u * u;
    const y = tmp.y * (u > 0 ? 0.95 : 0.86);
    tmp.set(tmp.x * wide * b, y, tmp.z * wide * b * 0.96);
    p.setXYZ(i, tmp.x, Math.max(tmp.y + CY, 0), tmp.z);
  }
  s.computeVertexNormals();

  // 扎口：一个上宽下窄的四棱台（耳朵朝左右），转一个随机角
  const turn = (rnd() - 0.5) * 0.3;
  // 4 棱的截面是菱形，顶点在 ±x / ±z；z 压扁 → 两只耳朵朝左右（3.5 纹素宽），再随机转一点
  const knot = new THREE.CylinderGeometry(0.16, 0.035, KNOT_TOP - NECK_Y + 0.02, 4, 1, false)
    .scale(1, 1, 0.45)
    .rotateY(turn)
    .translate(0, (NECK_Y + KNOT_TOP) / 2 - 0.01, -0.02);
  // 去掉底面（藏在袋身里）
  const kn = knot.toNonIndexed();
  const keep = kn.getAttribute('position').count - 4 * 3;
  kn.setDrawRange(0, keep);
  const kn2 = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) {
    const a = kn.getAttribute(name) as THREE.BufferAttribute;
    kn2.setAttribute(
      name,
      new THREE.BufferAttribute((a.array as Float32Array).slice(0, keep * a.itemSize), a.itemSize),
    );
  }

  const body = mergeGeometries([s.toNonIndexed(), kn2]);

  // 塑料高光：左上肩上一条弯的窄带（3 段，1 纹素宽），贴在表面外面一点
  const sheenParts: THREE.BufferGeometry[] = [];
  const segs = 3;
  const a0 = 2.75;
  const a1 = 1.85;
  for (let i = 0; i < segs; i++) {
    const t0 = a0 + ((a1 - a0) * i) / segs;
    const t1 = a0 + ((a1 - a0) * (i + 1)) / segs;
    const pt = (t: number, lift: number) => {
      // 在袋身上半截（仰角 ≈ 40°）沿水平方向走
      const el = 0.45 + ((t - a0) / (a1 - a0)) * 0.45 + lift;
      const r = R * 1.08 * Math.cos(el) * (1.06 - 0.25 * Math.sin(el));
      return new THREE.Vector3(Math.cos(t) * r, CY + R * 1.02 * Math.sin(el) + 0.03, Math.sin(t) * r * 0.96);
    };
    const q = new THREE.BufferGeometry().setFromPoints([
      pt(t0, 0),
      pt(t1, 0),
      pt(t1, 0.3),
      pt(t0, 0),
      pt(t1, 0.3),
      pt(t0, 0.3),
    ]);
    sheenParts.push(q);
  }
  const sheen = mergeGeometries(sheenParts);
  // 法线：球面法线由材质给（sphereNormals），这里只要占位
  sheen.computeVertexNormals();

  const out = { body, sheen };
  cache.set(v, out);
  return out;
}

export function build(ctx: AssetCtx): THREE.Object3D {
  const g = new THREE.Group();
  g.name = 'trash-bag';
  const { body, sheen } = geometry(ctx);
  // 球面法线从袋身中心发出：顶上（和扎口）亮档、腰一圈中档、贴地的下沿暗档
  const opts = {
    sphereNormals: [0, CY, 0] as [number, number, number],
    lightUp: 0.5,
    bands: [-0.42, 0.6] as [number, number],
    noShadowReceive: true,
    convex: 0.25,
    edge: 0.5,
  };
  g.add(new THREE.Mesh(body, ctx.mat('ironwork', opts)));
  // 高光条：ironwork 往上挪一档（亮 = 比 ironwork 亮档再亮 ≈ 36，L ≈ 143），档位压到永远是亮档
  g.add(
    new THREE.Mesh(
      sheen,
      ctx.mat('bagSheen', {
        ...opts,
        bands: [-2, -1.5],
        convex: 0,
        edge: 0,
        side: THREE.DoubleSide,
      }),
    ),
  );
  g.userData.grip = { at: [0, NECK_Y + 0.07, 0], axis: [0, -1, 0], up: [0, 0, 1] };
  ctx.mats.prepare(g);
  return g;
}

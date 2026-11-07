// 裁判椅：两条胖金属前腿 + 后面一架梯子（两根梯梁 + 三根木横档）+ 木平台、木座、靠背 + 一块歪了的小条纹遮阳顶。
// 1.0 × 2.3 × 1.0 米；本地 +z = 裁判面朝的方向（SLOTS 里 rotY 让它面向球场），梯子在 -z。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../world';

function box(w: number, h: number, d: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rx) g.rotateX(rx);
  if (ry) g.rotateY(ry);
  if (rz) g.rotateZ(rz);
  g.translate(x, y, z);
  return g;
}

/** 两点之间的一根方杆（粗 t） */
function bar(a: THREE.Vector3, b: THREE.Vector3, t: number, td = t) {
  const d = new THREE.Vector3().subVectors(b, a);
  const g = new THREE.BoxGeometry(t, d.length(), td);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
  g.applyQuaternion(q);
  const m = a.clone().add(b).multiplyScalar(0.5);
  g.translate(m.x, m.y, m.z);
  return g;
}

/** 道具的明暗：光往上（偏镜头）多一半 → 顶面亮、朝镜头的立面中档、底面和背面暗 */
const PROP = { lightUp: 0.5, bands: [-0.45, 0.5] as [number, number] };

export function build(ctx: AssetCtx): THREE.Object3D {
  const rnd = ctx.rng(`umpire-chair:${ctx.variant}`);
  const g = new THREE.Group();
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const platY = 1.4;

  // ── 金属：前腿（胖，略外撇）、梯梁、靠背立柱、遮阳杆 ──
  const metal: THREE.BufferGeometry[] = [];
  const legT = 0.26;
  for (const sx of [-1, 1]) {
    metal.push(bar(v(sx * 0.4, 0, 0.38), v(sx * 0.3, platY, 0.24), legT)); // 前腿
    metal.push(bar(v(sx * 0.36, 0, -0.5), v(sx * 0.3, platY + 0.05, -0.22), 0.2)); // 梯梁（斜靠）
  }
  // 遮阳杆：从座位后面伸上去
  metal.push(bar(v(0, platY, -0.3), v(0, 2.18, -0.34), 0.18));
  const metalMesh = new THREE.Mesh(mergeGeometries(metal), ctx.mat('metal', PROP));
  g.add(metalMesh);

  // ── 木：平台、座、靠背、脚踏、三根横档 ──
  const wood: THREE.BufferGeometry[] = [];
  wood.push(box(0.86, 0.14, 0.72, 0, platY + 0.07, 0)); // 平台
  wood.push(box(0.6, 0.14, 0.44, 0, platY + 0.3, -0.02)); // 座
  wood.push(box(0.6, 0.12, 0.44, 0, platY + 0.16, -0.02)); // 座下的墩（让座和平台分开一档）
  wood.push(box(0.64, 0.36, 0.14, 0, platY + 0.58, -0.24, -0.12)); // 靠背
  wood.push(box(0.84, 0.16, 0.22, 0, 0.72, 0.34)); // 前腿之间的脚踏板
  for (let i = 0; i < 3; i++) {
    const t = (i + 1) / 4;
    const y = platY * t;
    const z = -0.5 + 0.28 * t;
    wood.push(box(0.76, 0.14, 0.2, 0, y, z - 0.02, 0, 0, (rnd() - 0.5) * 0.05));
  }
  const woodMesh = new THREE.Mesh(mergeGeometries(wood), ctx.mat('woodWeathered', PROP));
  g.add(woodMesh);

  // ── 遮阳顶：三条布（条纹 / 奶油 / 条纹），整块歪了一点，前沿垂一条边 ──
  const top = new THREE.Group();
  const cream: THREE.BufferGeometry[] = [];
  const stripe: THREE.BufferGeometry[] = [];
  const w = 0.3;
  for (let i = 0; i < 3; i++) {
    const x = (i - 1) * w;
    const dst = i === 1 ? cream : stripe;
    dst.push(box(w, 0.09, 0.62, x, 0, 0));
    dst.push(box(w, 0.18, 0.09, x, -0.1, 0.31)); // 前沿垂边
  }
  top.add(new THREE.Mesh(mergeGeometries(cream), ctx.mat('fabric', PROP)));
  top.add(new THREE.Mesh(mergeGeometries(stripe), ctx.mat('fabricStripe', PROP)));
  top.position.set(0.02, 2.24, -0.24);
  top.rotation.set(0.18, 0, -0.14 - rnd() * 0.06); // 往前低、往一边歪（螺丝松了）
  g.add(top);

  // 一点锈：一条前腿的脚
  g.add(new THREE.Mesh(bar(v(-0.4, 0, 0.38), v(-0.39, 0.16, 0.36), legT * 1.06), ctx.mat('rust', PROP)));

  ctx.mats.prepare(g, { receive: false });
  return g;
}

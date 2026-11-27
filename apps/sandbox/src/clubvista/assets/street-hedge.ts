// 球场街的树篱（修剪过的矮绿篱，图的边框：和别的图的棕榈台、看台、乱石拉开）。
// 一条方身（沿本地 x）+ 顶上一排压扁的圆团（修过但没修平：顶沿一团团起伏，45° 俯视读成"篱"不是"墙"），
// 法线按整条的中心轴往外推（blobNormals 的做法按段算）：顶面亮、朝镜头的立面中档、底沿暗 —— 立面就是一条冷暗带。
// v0 长 4 米、v1 2.6 米、v2 1.6 米（成簇用两三种长度）；高 1.05，厚 0.9。原点 = 落地点中心，长边沿本地 x。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

const LIT: [number, number, number] = [0x9cbc62, 0xa6c66c, 0x92b25a];
const MID: [number, number, number] = [0x5e9460, 0x689e68, 0x568a58];
const DARK: [number, number, number] = [0x356a68, 0x3c726e, 0x2f6262];
const SEAM: [number, number, number] = [0x86a452, 0x4e7e52, 0x2a5458];
const HAIR: [number, number, number] = [0xb0d070, 0x80b06c, 0x4e8070];

export function build(ctx: AssetCtx): THREE.Object3D {
  const v = ctx.variant % 3;
  const L = [4, 2.6, 1.6][v];
  const H = 1.05;
  const D = 0.9;
  const rnd = ctx.rng(`street-hedge:${v}`);
  const geos: THREE.BufferGeometry[] = [];
  // 方身（顶比底略收：上沿不是一条刀切的直线）
  const body = new THREE.BoxGeometry(L, H * 0.78, D, Math.max(2, Math.round(L / 0.5)), 2, 2);
  const p = body.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const k = y > 0 ? 0.93 : 1;
    p.setX(i, p.getX(i) * (y > 0 ? (L - 0.12) / L : 1));
    p.setZ(i, p.getZ(i) * k);
  }
  body.translate(0, (H * 0.78) / 2, 0);
  geos.push(body.toNonIndexed());
  // 顶上一排团（每 ~0.7 米一团，大小错开）
  const n = Math.max(2, Math.round(L / 0.7));
  for (let i = 0; i < n; i++) {
    const r = 0.36 + rnd() * 0.1;
    const s = new THREE.IcosahedronGeometry(r, 1);
    s.scale(1.25, 0.62, (D / 2 / r) * 0.98);
    const x = -L / 2 + 0.38 + ((L - 0.76) * (i + 0.5)) / n + (rnd() - 0.5) * 0.12;
    s.translate(x, H * 0.78 + r * 0.08, (rnd() - 0.5) * 0.06);
    geos.push(s.toNonIndexed());
  }
  const g0 = mergeGeometries(
    geos.map((q) => {
      q.deleteAttribute('uv');
      return q;
    }),
  );
  // 法线：从中心轴（沿 x 的一条线，高 0.45）往外推，再和朝上混一点 —— 整条读成一团软的体积
  g0.computeVertexNormals();
  const pos = g0.getAttribute('position');
  const nor = g0.getAttribute('normal');
  const t = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const ex = Math.abs(x) > L / 2 - 0.45 ? Math.sign(x) * (Math.abs(x) - (L / 2 - 0.45)) : 0;
    t.set(ex, pos.getY(i) - 0.45, pos.getZ(i)).normalize();
    t.lerp(new THREE.Vector3(nor.getX(i), nor.getY(i), nor.getZ(i)), 0.3).normalize();
    nor.setXYZ(i, t.x, t.y, t.z);
  }
  const leaf = ctx.mat('olive', {
    ramp: [LIT[0], MID[0], DARK[0]],
    tones: { bands: [LIT, MID, DARK], seam: SEAM, hi: HAIR },
    elem: { kind: 'blades', density: [0.06, 0.2], patch: 1.2 },
    bands: [0.22, 0.55],
    lightUp: 0.45,
    noise: 0.2,
    edge: 0.4,
    convex: 0.15,
  });
  const mesh = new THREE.Mesh(g0, leaf);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const g = new THREE.Group();
  g.name = 'street-hedge';
  g.add(mesh);
  ctx.mats.prepare(g);
  return g;
}

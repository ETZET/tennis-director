// 墨西哥刺木（ocotillo）：从同一个根放射、略往外弯的几根粗茎（≥ 3 纹素），茎梢一簇红花。
// 少而胖：6 根茎、每根 0.32 米粗，往左右张开；茎梢花穗是一个拉长的团（试过茎上挂叶团：单独一团亮绿反而怪）。
// 材质规范 v2：茎上是很淡的"节"——茎的 uv 换成米（x 绕茎、y 顺着茎），`stones`（墙空间）的格子比茎一圈还宽、
// 顺着茎 5 行一节 → 一节一节的段，段与段之间 1 纹素暗缝（只深一级），一成半的段上沿有亮边；每根茎的节错开。颜色手挑（灰绿，暗档冷靛）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Tones } from '../toon';
import { blobNormals } from '../toon';
import type { AssetCtx } from '../world';

/** 茎：灰绿 → 灰青 → 冷靛；缝深一级、亮边亮一级（差 ≈ 20 个亮度） */
const CANE: Tones = {
  bands: [
    [0xa0bc7c, 0xaac484, 0x98b476],
    [0x6a9074, 0x72987a, 0x62886c],
    [0x3a5672, 0x405e7a, 0x34506a],
  ],
  seam: [0x8eac70, 0x5c866e, 0x30486a],
  hi: [0xb8d092, 0x84aa82, 0x4a6a84],
};

/** 管子的 uv 换成米：x = 绕茎一圈的弧长 + 偏移（每根茎的节错开），y = 离茎梢的长度（墙空间 y = 离墙顶多深） */
function caneUv(g: THREE.BufferGeometry, len: number, r: number, off: number) {
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getY(i) * Math.PI * 2 * r + off * 7, (1 - uv.getX(i)) * len + off);
  uv.needsUpdate = true;
}

/** 把管子的法线往"上 + 离开主轴"偏一点：茎朝上的一侧整条亮，朝镜头的一侧是中档而不是全黑 */
function liftNormals(g: THREE.BufferGeometry, k: number) {
  const n = g.getAttribute('normal') as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < n.count; i++) {
    v.fromBufferAttribute(n, i);
    v.y += k;
    v.normalize();
    n.setXYZ(i, v.x, v.y, v.z);
  }
}

function blob(r: number, sx: number, sy: number, sz: number, at: THREE.Vector3, rot?: THREE.Quaternion) {
  const g = new THREE.IcosahedronGeometry(r, 1);
  g.scale(sx, sy, sz);
  if (rot) g.applyQuaternion(rot);
  g.translate(at.x, at.y, at.z);
  return blobNormals(g, at.clone());
}

export function build(ctx: AssetCtx): THREE.Object3D {
  const rnd = ctx.rng(`ocotillo:${ctx.variant}`);
  const T = ctx.texel;
  const R = Math.max(0.16, T * 1.75); // 茎半径：直径 ≥ 3.3 纹素
  const canes: THREE.BufferGeometry[] = [];
  const flowers: THREE.BufferGeometry[] = [];

  const n = 6;
  const a0 = rnd() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    // 方位均匀 + 抖动；中间两根更直更高
    const az = a0 + (i / n) * Math.PI * 2 + (rnd() - 0.5) * 0.6;
    const center = i < 2;
    const tilt = center ? 0.1 + rnd() * 0.1 : 0.34 + rnd() * 0.2; // 偏离竖直（弧度）
    const len = (center ? 3.0 : 2.3) + rnd() * 0.45;
    const dx = Math.cos(az);
    const dz = Math.sin(az) * 0.55; // 往左右张开（屏幕上展得开），前后收一点
    const base = new THREE.Vector3(dx * 0.12, 0, dz * 0.12);
    // 二次曲线：先陡后往外弯（像一把张开的鞭子）
    const mid = base
      .clone()
      .add(new THREE.Vector3(dx * Math.sin(tilt) * len * 0.35, len * 0.5, dz * Math.sin(tilt) * len * 0.35));
    const out = Math.sin(tilt) * 1.7 + 0.08;
    const tip = base
      .clone()
      .add(new THREE.Vector3(dx * out * len * 0.55, len * Math.cos(tilt * 0.9), dz * out * len * 0.55));
    const curve = new THREE.QuadraticBezierCurve3(base, mid, tip);
    const tube = new THREE.TubeGeometry(curve, 6, R, 5, false).toNonIndexed();
    caneUv(tube, curve.getLength(), R, rnd() * 3);
    liftNormals(tube, 0.9);
    canes.push(tube);
    // 花穗：茎梢一个拉长的红团（顺着茎方向）
    const tan = curve.getTangent(1);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan);
    const fp = tip.clone().addScaledVector(tan, 0.12);
    flowers.push(blob(R * 1.25, 1, 2.1, 1, fp, q));
  }
  // 根部：一个压扁的暗团把茎收在一起
  const root = blob(0.36, 1.1, 0.55, 1.0, new THREE.Vector3(0, 0.08, 0));

  const g = new THREE.Group();
  const sway = { sway: 0.1, swayH: 3.6, noShadowReceive: true };
  // 节：格子宽 60 纹素（比茎一圈 ≈ 11 纹素宽得多 → 一节横跨整根茎）、高 5 行；亮边只给一成半的节，三档里少挑高/低一级（淡）
  const caneMat = ctx.mat('cactus', {
    ...sway,
    ramp: [CANE.bands[0][0], CANE.bands[1][0], CANE.bands[2][0]],
    tones: CANE,
    elem: { kind: 'stones', space: 'wall', size: [60, 5], seam: 0.6, hi: 0.15 },
    toneW: [0.18, 0.18],
    lightUp: 0.65,
    bands: [-0.1, 0.4],
    edge: 0.6,
    convex: 0.5,
  });
  g.add(new THREE.Mesh(mergeGeometries([...canes, root]), caneMat));
  g.add(new THREE.Mesh(mergeGeometries(flowers), ctx.mat('flowerRed', { ...sway, lightUp: 0.5, bands: [-0.1, 0.35] })));
  ctx.mats.prepare(g);
  return g;
}

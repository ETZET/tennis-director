// #8 pergola：餐车院子中线的木凉棚 + 两道之字形串灯。
// 尺寸：本地 x ±5.1、z ±5.2（世界 x −36.6…−26.4、z −33.8…−23.4，原点在中心 (−31.5, −28.6)），顶 3.0 米。
// - 木柱（timber，4 纹素见方）：北、南两排各 4 根（x ±1.7、±4.92；z ±4.85）；
// - 东西两根主梁（北梁、南梁，planks：接头在柱子上方，每段一个深浅）；
// - 南北向的板条（屏幕上是竖条，不横切下面坐着的人）：6 根、间距 ≥ 1.7 米、4 纹素宽（0.36 米）——
//   太阳往西的影子偏移 ≈ 0.42 米，板条和自己在陶砖上的影子在屏幕上几乎挨着，中间不夹一条亮砖（少一道强边缘）；
// - 两道之字串灯：挂在长桌上方两根板条之间（x ±0.85 ↔ ±3.2），线 ironwork 1 纹素、下垂，灯泡 2 纹素（bulb，instanced）。
// userData：
//   setLit(k)  0..1：傍晚亮灯（k 0 = 白天的暖白玻璃；k 1 = 全部换成 flowerYellow 亮档；中间按随机顺序一颗颗亮）
//   posts      所有柱子的本地坐标 [lx, lz][]（导航挡路用；柱子 0.36 米见方）
//   beamY      梁底高度（米）
// - 柱脚：cap 的矮墩（5 纹素见方、2 纹素高）。
//   setLit 的亮灯 = flowerYellow 亮档 + 一点自发光；画廊 / 截图可以加 ?lit=0..1。
// 变体：没有（ctx.variant 不用）。
// 三角形：柱 96 + 柱脚 96 + 梁 24 + 板条 72 = 288，两道串灯的线 640（8 段 × 5 截 × 2 小段 × 8）≈ 930；
// 灯泡 instanced（12 三角形 × 32 颗）另算。4 次 draw（柱、梁、板条各一只 InstancedMesh + 柱脚）+ 线 + 灯泡 2。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

const T = 0.09; // 设计纹素
const HX = 5.1;
const HZ = 5.2;
const TOP = 3.0;
/** 板条：高 2 纹素、宽 4 纹素 */
const SLAT_H = 2 * T;
const SLAT_W = 4 * T;
/** 梁：高 4 纹素、厚 3 纹素 */
const BEAM_H = 4 * T;
const BEAM_D = 3 * T;
const BEAM_Y = TOP - SLAT_H - BEAM_H;
/** 柱：4 纹素见方 */
const POST_W = 4 * T;
const POST_X = [-4.92, -1.7, 1.7, 4.92];
const POST_Z = 4.85;
/**
 * 板条的 x：左右对称、间距 ≥ 1.7（1.7 / 2.35 / 1.72）。最外两根压在柱子那条线上；
 * 中间四根避开北边长凳上面朝镜头的人（x −3.7、−2.7、1.6、2.6：离板条边 ≥ 0.3 米），他们在板条之间露出来。
 */
const SLAT_X = [-4.92, -3.2, -0.85, 0.85, 3.2, 4.92];

export function build(ctx: AssetCtx): THREE.Object3D {
  const g = new THREE.Group();
  g.name = 'pergola';
  // 朝镜头的竖直面（柱子南面、梁南面）在暗档：lightUp + 低 bands 留住木头中档
  const face = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number], noShadowReceive: true, convex: 0.3 };

  // ── 柱子：instanced（本地坐标干净，板条元素按每根柱子自己的坐标取）：两块板拼的方柱，各一个深浅 ──
  const postGeo = new THREE.BoxGeometry(POST_W, BEAM_Y, POST_W).translate(0, BEAM_Y / 2, 0);
  const postMat = ctx.mat('timber', {
    ...face,
    elem: { kind: 'planks', space: 'local', seam: 0, hi: 0, p: [1, 0, 0, POST_W / 2], q: [1, 0, 0, 0] },
  });
  const posts: [number, number][] = [];
  for (const z of [-POST_Z, POST_Z]) for (const x of POST_X) posts.push([x, z]);
  const postMesh = new THREE.InstancedMesh(postGeo, postMat, posts.length);
  const m4 = new THREE.Matrix4();
  posts.forEach(([x, z], i) => {
    postMesh.setMatrixAt(i, m4.makeTranslation(x, 0, z));
  });
  postMesh.name = 'posts';
  g.add(postMesh);

  // 柱脚：一圈 cap 的矮墩（5 纹素见方、2 纹素高），柱子"站"在地上
  const footGeo = mergeGeometries(
    posts.map(([x, z]) => new THREE.BoxGeometry(5 * T, 2 * T, 5 * T).translate(x, T, z)),
  ) as THREE.BufferGeometry;
  const foot = new THREE.Mesh(footGeo, ctx.mat('cap', { convex: 0.3, noShadowReceive: true }));
  foot.name = 'footings';
  g.add(foot);

  // ── 主梁：两根（北、南），每根三段（接头在中间两根柱子上方 x ±1.7），planks 沿 x、每 3.4 米一段 ──
  // 基础几何体平移 +1.7，让 planks 的段界（本地 x = 0、3.4）落在世界 x −1.7、+1.7 上
  const beamGeo = new THREE.BoxGeometry(2 * HX, BEAM_H, BEAM_D).translate(1.7, BEAM_H / 2, 0);
  const beamMat = ctx.mat('timber', {
    ...face,
    elem: { kind: 'planks', space: 'local', seam: 1, hi: 1, p: [1, 0, 0, 3.4], q: [1, 0, 0, 0] },
  });
  const beams = new THREE.InstancedMesh(beamGeo, beamMat, 2);
  [-POST_Z, POST_Z].forEach((z, i) => {
    beams.setMatrixAt(i, m4.makeTranslation(-1.7, BEAM_Y, z));
  });
  beams.name = 'beams';
  g.add(beams);

  // ── 板条：南北向，6 根，搭在两根梁上、两头各出 0.35 米；顶面亮档（木头最亮的一块），paint 的长条深浅块 ──
  const slatGeo = new THREE.BoxGeometry(SLAT_W, SLAT_H, 2 * HZ).translate(0, SLAT_H / 2, 0);
  // 顶面朝天 = 亮档；南头的端面朝镜头，跟柱、梁一样用 lightUp 留在中档（不是一块块暗方点）
  const slatMat = ctx.mat('timber', {
    ...face,
    elem: { kind: 'paint', size: [5, 14], density: [0, 0] },
  });
  const slats = new THREE.InstancedMesh(slatGeo, slatMat, SLAT_X.length);
  SLAT_X.forEach((x, i) => {
    slats.setMatrixAt(i, m4.makeTranslation(x, BEAM_Y + BEAM_H, 0));
  });
  slats.name = 'slats';
  g.add(slats);

  ctx.mats.prepare(g);

  // ── 两道之字串灯：挂在板条底下一点（板条底 = 梁顶），线 1 纹素，下垂 ──
  const hangY = BEAM_Y + BEAM_H - 0.06;
  const wires: THREE.BufferGeometry[] = [];
  const bulbs: THREE.Vector3[] = [];
  const rnd = ctx.rng('pergola:zig');
  for (const side of [-1, 1]) {
    const xa = side * 0.85;
    const xb = side * 3.2;
    const n = 4; // 段数（W 形）
    const z0 = -POST_Z + 0.35;
    const z1 = POST_Z - 0.35;
    for (let k = 0; k < n; k++) {
      const a = new THREE.Vector3(k % 2 ? xb : xa, hangY, z0 + ((z1 - z0) * k) / n);
      const b = new THREE.Vector3(k % 2 ? xa : xb, hangY, z0 + ((z1 - z0) * (k + 1)) / n);
      const sag = 0.32 + rnd() * 0.08;
      const sl = stringLights(a, b, sag, 0.62);
      wires.push(sl.geo);
      bulbs.push(...sl.bulbs);
    }
  }
  const wire = new THREE.Mesh(
    mergeGeometries(wires) as THREE.BufferGeometry,
    // 线一律 ironwork 亮档（L ≈ 107）：落在亮砖和影子之间，不出一条条黑线
    ctx.mat('ironwork', { lightUp: 1, bands: [-2, -2], noShadowReceive: true, edge: 0.3, convex: 0 }),
  );
  wire.name = 'zigzag-wire';
  wire.castShadow = false;
  wire.receiveShadow = false;
  g.add(wire);

  const lights = bulbLights(ctx, bulbs, ctx.rng('pergola:lit'));
  g.add(lights.root);

  g.userData.setLit = lights.setLit;
  g.userData.posts = posts;
  g.userData.beamY = BEAM_Y;
  // 画廊 / 截图：?lit=0..1 直接看傍晚
  if (ctx.params.has('lit')) lights.setLit(Number(ctx.params.get('lit')));
  return g;
}

/** 下垂的线上的一点（抛物线近似：中点最低 sag） */
export function sagPoint(a: THREE.Vector3, b: THREE.Vector3, sag: number, t: number): THREE.Vector3 {
  const p = new THREE.Vector3().lerpVectors(a, b, t);
  p.y -= sag * 4 * t * (1 - t);
  return p;
}

/** 下垂的线在 t 处的切向（每单位 t 的米） */
function sagTangent(a: THREE.Vector3, b: THREE.Vector3, sag: number, t: number): THREE.Vector3 {
  return b
    .clone()
    .sub(a)
    .add(new THREE.Vector3(0, -sag * 4 * (1 - 2 * t), 0));
}

/**
 * 一条下垂的串灯：每 step 米一颗灯泡（两头不放）。线在每颗灯泡那儿断开，断口正好是线在屏幕上穿过灯泡的那一截
 * （俯视 45° 下，往南走的线总是从灯泡前面过 —— 不断开的话灯泡被自己的线劈成两半，只剩一道道小刻痕）。
 * sub = 两颗灯泡之间几小段。返回线的几何体和灯泡中心（线上的点）。
 */
export function stringLights(
  a: THREE.Vector3,
  b: THREE.Vector3,
  sag: number,
  step: number,
  sub = 2,
): { geo: THREE.BufferGeometry; bulbs: THREE.Vector3[] } {
  const n = Math.max(2, Math.round(a.distanceTo(b) / step));
  const ts: number[] = [];
  for (let j = 1; j < n; j++) ts.push(j / n);
  // 灯泡在屏幕上的半宽 1 纹素、半高 ≈ 0.127 米（顶面 + 正面各 0.18 × 0.707）：线走出这个框的那一点就是断口
  const gaps = ts.map((t) => {
    const d = sagTangent(a, b, sag, t);
    const m = d.length();
    const u = d.clone().divideScalar(m);
    const sx = Math.abs(u.x) > 1e-4 ? T / Math.abs(u.x) : 1e9;
    const sv = Math.abs(u.y - u.z) > 1e-4 ? 0.128 / (Math.abs(u.y - u.z) * Math.SQRT1_2) : 1e9;
    return Math.min(sx, sv, step * 0.4) / m;
  });
  const pieces: THREE.Vector3[][] = [];
  let t0 = 0;
  for (let i = 0; i <= ts.length; i++) {
    const t1 = i < ts.length ? ts[i] - gaps[i] : 1;
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= sub; k++) pts.push(sagPoint(a, b, sag, t0 + ((t1 - t0) * k) / sub));
    pieces.push(pts);
    if (i < ts.length) t0 = ts[i] + gaps[i];
  }
  const geo = mergeGeometries(pieces.map((p) => tube(p))) as THREE.BufferGeometry;
  return { geo, bulbs: ts.map((t) => sagPoint(a, b, sag, t)) };
}

/** 折线管子：每小段一根 1 纹素（0.07 米见方）的四面管子（没有端盖） */
export function tube(pts: THREE.Vector3[], r = 0.035): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i + 1 < pts.length; i++) {
    const p0 = pts[i];
    const p1 = pts[i + 1];
    const dir = p1.clone().sub(p0).normalize();
    let side = new THREE.Vector3().crossVectors(dir, up);
    if (side.lengthSq() < 1e-6) side = new THREE.Vector3(1, 0, 0);
    side.normalize();
    const vup = new THREE.Vector3().crossVectors(side, dir).normalize();
    // 四个面：上、下、左、右
    const faces: [THREE.Vector3, THREE.Vector3][] = [
      [vup, side],
      [vup.clone().negate(), side.clone().negate()],
      [side, vup.clone().negate()],
      [side.clone().negate(), vup],
    ];
    for (const [nrm, tan] of faces) {
      const base = pos.length / 3;
      const c0 = p0.clone().addScaledVector(nrm, r);
      const c1 = p1.clone().addScaledVector(nrm, r);
      const corners = [
        c0.clone().addScaledVector(tan, -r),
        c0.clone().addScaledVector(tan, r),
        c1.clone().addScaledVector(tan, r),
        c1.clone().addScaledVector(tan, -r),
      ];
      for (const c of corners) {
        pos.push(c.x, c.y, c.z);
        nor.push(nrm.x, nrm.y, nrm.z);
      }
      // 朝外的绕向
      const e1 = corners[1].clone().sub(corners[0]);
      const e2 = corners[2].clone().sub(corners[0]);
      const out = new THREE.Vector3().crossVectors(e1, e2).dot(nrm) > 0;
      if (out) idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      else idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((pos.length / 3) * 2).fill(0), 2));
  geo.setIndex(idx);
  return geo;
}

/**
 * 灯泡：两只 InstancedMesh（白天的暖白玻璃 bulb / 亮着的 flowerYellow 亮档），共用一套随机顺序：
 * 亮着的取前 m 颗、白天的取后 n − m 颗（白天那只倒着存），setLit(k) 只改两边的 count。
 * cap = 最多几颗（festoon 的 setEnds 会重排）。
 */
export function bulbLights(
  ctx: AssetCtx,
  pts: THREE.Vector3[],
  rnd: () => number,
  cap = pts.length,
): { root: THREE.Group; setLit: (k: number) => void; place: (pts: THREE.Vector3[]) => void } {
  const root = new THREE.Group();
  root.name = 'bulbs';
  // 灯泡 2 纹素：穿在线上；顶面和朝镜头的面都落亮档（白天 = 一颗暖白的玻璃点）
  const geo = new THREE.BoxGeometry(2 * T, 2 * T, 2 * T);
  const day = new THREE.InstancedMesh(
    geo,
    ctx.mat('bulb', { lightUp: 0.8, bands: [-0.5, 0.2], noShadowReceive: true, convex: 0, edge: 0.3 }),
    Math.max(cap, 1),
  );
  // 亮着：不管朝向一律 flowerYellow 亮档，再加一点自发光（亮档乘了午后太阳色以后比白天的暖白还暗 30，看着像关了灯）
  const lit = new THREE.InstancedMesh(
    geo,
    ctx.mat('flowerYellow', {
      lightUp: 1,
      bands: [-2, -2],
      noShadowReceive: true,
      convex: 0,
      edge: 0.2,
      emissive: 0x1c1404,
    }),
    Math.max(cap, 1),
  );
  for (const m of [day, lit]) {
    m.castShadow = false;
    m.receiveShadow = false;
    m.frustumCulled = false;
    root.add(m);
  }
  let n = 0;
  let k = 0;
  const m4 = new THREE.Matrix4();
  const apply = () => {
    const on = Math.round(k * n);
    lit.count = on;
    day.count = n - on;
    lit.visible = on > 0;
    day.visible = n - on > 0;
  };
  const place = (p: THREE.Vector3[]) => {
    n = Math.min(p.length, cap);
    const order = p.slice(0, n);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    for (let i = 0; i < n; i++) {
      const q = order[i];
      // 灯泡穿在线上（中心比线低半纹素）
      m4.makeTranslation(q.x, q.y - 0.04, q.z);
      lit.setMatrixAt(i, m4);
      day.setMatrixAt(n - 1 - i, m4);
    }
    lit.instanceMatrix.needsUpdate = true;
    day.instanceMatrix.needsUpdate = true;
    apply();
  };
  place(pts);
  return {
    root,
    place,
    setLit: (v: number) => {
      k = THREE.MathUtils.clamp(v, 0, 1);
      apply();
    },
  };
}

// 推式捡球器（总监用）：一个横躺的铁丝笼滚筒（轴沿 x，往 ±z 滚）+ 一根长柄，柄顶一根 T 形横把。
// 铁丝在 0.09 米/纹素下画不出来：笼子 = 暗靛色的芯（看进笼子里的暗）+ 两端两个金属轮圈 + 中间一道金属箍；
// 捡进去的球卡在笼壁上，一个个亮黄的鼓包露在笼子外面（球直径 0.2 米 ≈ 2.2 纹素，不接投影，画面里最亮的点）。
// 画廊：desert3d-v2.html?asset=ball-picker（&count=0..60，&tilt=-1.1，&roll=0 停转）
//
// 本地原点 = 笼子正下方的地面，笼子轴高 R。
// userData：
//   roll(dt, speed)  笼子按地面速度 speed（米/秒，正 = 往本地 +z 滚）转 dt 秒
//   setCount(n)      笼子里的球 0..60（显示的鼓包按比例，最多 32 个）
//   setTilt(rad)     柄的倾角：0 = 竖直，负 = 柄倒向 −z（推的人站在 −z 一侧）
//   gripPoint(dx=0)  T 形横把中心沿横把偏 dx 米处的世界坐标（人的双手握在 ±0.15）
//   handle           柄的转轴组（在笼轴高度，柄沿本地 +y，长 HANDLE_LEN）
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { BaseCtx as AssetCtx } from '../render/ctx';
import { blobNormals } from '../render/toon';

/** 笼子（轮圈）半径 = 轴高 */
export const PICKER_R = 0.27;
/** 柄从笼轴到横把中心的长度 */
export const HANDLE_LEN = 1.2;
export const PICKER_MAX = 60;

/** 道具的明暗：光往上偏一半（和 ball-hopper 一样） */
const PROP = { lightUp: 0.5, bands: [-0.45, 0.5] as [number, number], noShadowReceive: true };

/** 沿 x 轴的圆柱，中心 (x, y, z) */
function xCyl(r: number, len: number, x: number, y = 0, z = 0, seg = 12) {
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1);
  g.rotateZ(Math.PI / 2);
  g.translate(x, y, z);
  return g;
}
/** 两点之间的圆杆 */
function rod(a: THREE.Vector3, b: THREE.Vector3, r: number, seg = 6) {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  g.applyQuaternion(q);
  const m = a.clone().add(b).multiplyScalar(0.5);
  g.translate(m.x, m.y, m.z);
  return g;
}
function ball(r: number, x: number, y: number, z: number) {
  const g = new THREE.IcosahedronGeometry(r, 0);
  g.deleteAttribute('uv');
  g.translate(x, y, z);
  return blobNormals(g, new THREE.Vector3(x, y, z));
}

export function buildPicker(ctx: AssetCtx, opts: { gallery?: boolean } = {}): THREE.Group {
  const rnd = ctx.rng('ball-picker:slots');
  const root = new THREE.Group();
  root.name = 'ball-picker';
  const R = PICKER_R;
  const metal = ctx.mat('metal', PROP);

  // ── 笼子（绕 x 轴滚）──
  const cage = new THREE.Group();
  cage.position.y = R;
  root.add(cage);
  // 暗芯：看进铁丝笼里的暗（net 的靛色），比轮圈细一圈，球卡在芯和轮圈之间
  {
    const g = xCyl(0.17, 0.5, 0, 0, 0, 10);
    blobNormals(g, new THREE.Vector3(0, 0, 0));
    cage.add(new THREE.Mesh(g, ctx.mat('net', { ...PROP, edge: 0.3, convex: 0 })));
  }
  // 两端的轮圈（3 纹素宽，侧面看是两根胖竖条）+ 中间一道箍；轮圈上一块深色的辐条盘（滚的时候看得出转）
  {
    const gs = [xCyl(R, 0.12, -0.3, 0, 0, 14), xCyl(R, 0.12, 0.3, 0, 0, 14), xCyl(0.235, 0.08, 0, 0, 0, 12)];
    const g = mergeGeometries(gs);
    blobNormals(g, new THREE.Vector3(0, 0, 0));
    cage.add(new THREE.Mesh(g, metal));
    // 轮圈外侧的轮毂（深色，偏心一点：转起来一闪一闪）
    const hubs = mergeGeometries([xCyl(0.1, 0.06, -0.37, 0.08, 0, 8), xCyl(0.1, 0.06, 0.37, 0.08, 0, 8)]);
    cage.add(new THREE.Mesh(hubs, ctx.mat('hair', { ...PROP, edge: 0.3, convex: 0 })));
  }
  // 球：两圈 × 8 个卡在笼壁上（露出半个），再两圈错开的、更深一点的；按随机顺序装
  const BR = 0.1;
  const slots: THREE.Vector3[] = [];
  for (const [x, rr, off] of [
    [-0.145, 0.2, 0],
    [0.145, 0.2, 0.5],
    [-0.145, 0.16, 0.5],
    [0.145, 0.16, 0],
  ] as const) {
    for (let i = 0; i < 8; i++) {
      const a = ((i + off) / 8) * Math.PI * 2;
      slots.push(new THREE.Vector3(x, Math.cos(a) * rr, Math.sin(a) * rr));
    }
  }
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  const ballGeo = mergeGeometries(slots.map((p) => ball(BR, p.x, p.y, p.z)));
  const perBall = ballGeo.getAttribute('position').count / slots.length;
  const balls = new THREE.Mesh(ballGeo, ctx.mat('ball', { lightUp: 0.5, bands: [-0.3, 0.45], noShadowReceive: true }));
  cage.add(balls);

  // ── 柄（不跟着笼子转）──
  const handle = new THREE.Group();
  handle.position.y = R;
  root.add(handle);
  {
    const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    // 叉子：从两端轴头往上收到 0.42 处并成一根；轴头一截短横杆
    const gs = [
      rod(V(-0.42, 0, 0), V(-0.07, 0.42, 0), 0.05),
      rod(V(0.42, 0, 0), V(0.07, 0.42, 0), 0.05),
      xCyl(0.05, 0.12, -0.42, 0, 0, 6),
      xCyl(0.05, 0.12, 0.42, 0, 0, 6),
      rod(V(0, 0.36, 0), V(0, HANDLE_LEN, 0), 0.09), // 组装评审：0.065 → 0.09（直径 2 纹素，推着走时不再时有时无）
    ];
    handle.add(new THREE.Mesh(mergeGeometries(gs), metal));
    // T 形横把（深色橡胶，0.44 米长、粗 1.5 纹素）
    const grip = xCyl(0.07, 0.44, 0, HANDLE_LEN, 0, 6);
    blobNormals(grip, V(0, HANDLE_LEN + 0.05, 0));
    handle.add(new THREE.Mesh(grip, ctx.mat('hair', { ...PROP, edge: 0.4, convex: 0.2 })));
  }

  // ── 接口 ──
  let spin = 0;
  const setCount = (n: number) => {
    const k = Math.round((THREE.MathUtils.clamp(n, 0, PICKER_MAX) / PICKER_MAX) * slots.length);
    ballGeo.setDrawRange(0, k * perBall);
    balls.visible = k > 0;
  };
  root.userData.roll = (dt: number, speed: number) => {
    spin += (speed * dt) / R;
    cage.rotation.x = spin;
  };
  root.userData.setCount = setCount;
  root.userData.setTilt = (t: number) => {
    handle.rotation.x = t;
  };
  root.userData.gripPoint = (dx = 0) => {
    root.updateMatrixWorld(true);
    return handle.localToWorld(new THREE.Vector3(dx, HANDLE_LEN, 0));
  };
  root.userData.handle = handle;

  const q = ctx.params;
  setCount(q.get('count') !== null ? Number(q.get('count')) : 24);
  handle.rotation.x = opts.gallery && q.get('tilt') !== null ? Number(q.get('tilt')) : -1.1;
  if (opts.gallery && q.get('roll') !== '0') root.userData.update = (dt: number) => root.userData.roll(dt, 0.5);
  ctx.mats.prepare(root);
  return root;
}

export function build(ctx: AssetCtx): THREE.Object3D {
  return buildPicker(ctx, { gallery: true });
}

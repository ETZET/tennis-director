// #16 hand-truck · 补货手推车（总监推着走）：竖着的 L 形车架（工具橙 toolOrange = 吹叶机那个橙，总监的工具）
// + 两个轮（tyre）+ 车上两只木箱（timber，箱盖 planks）。三角形 ≈ 176（预算 200）。
// 本地原点 = 落地点中心，y 0 = 地面。尺寸 ≈ 0.78（含轮；车架本身 0.6）× 1.2 × 0.78 米。
// 推把比规格（1.3）低一点：人物肩高只有 ≈ 0.98（HIP_Y 0.5 + 0.48），推把在 1.12、身前 0.5 米时手臂刚好往前平伸。
// 朝向（按 clubsite/people/hold.ts 的推车约定）：**推把在 −z（背对镜头那边），箱子和车头托板在 +z**；
//   grip.axis = (0, 0, 1)（从推把指向车头），人站在推把后面朝 +z 推。放在地上不转时箱子朝镜头。
// 车架杆 0.17 米粗（≈ 2 纹素），推把顶上往后弯，横把在 y 1.12、z −0.3。
// userData：
//   grip = { at: [−0.2, 1.12, −0.3], at2: [0.2, 1.12, −0.3], axis: [0, 0, 1], up: [0, 1, 0], cart: true }（推把两端，本地坐标）
//   setLoad(n)  车上几只箱子 0..2（从下往上装）
//   load        当前几只
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

const flat = (g: THREE.BufferGeometry) => {
  g.deleteAttribute('uv');
  return g.index ? g.toNonIndexed() : g;
};

/** 两点之间的方杆（截面 t × t） */
function bar(t: number, a: THREE.Vector3, b: THREE.Vector3): THREE.BufferGeometry {
  const d = b.clone().sub(a);
  const g = new THREE.BoxGeometry(t, d.length() + t * 0.5, t);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}

const RAIL = 0.17;
const RAIL_X = 0.2;
const RAIL_Z = -0.12;
const HANDLE_Y = 1.12;
const HANDLE_Z = -0.3;
const WHEEL_R = 0.16;
const WHEEL_W = 0.16;
const WHEEL_X = 0.31;
const WHEEL_Z = -0.24;
const NOSE_T = 0.07;

/** 箱子：[宽, 高, 深, x, 底 y, z] */
const BOXES: [number, number, number, number, number, number][] = [
  [0.46, 0.36, 0.34, 0, NOSE_T, 0.13],
  [0.42, 0.32, 0.32, 0.02, NOSE_T + 0.36, 0.12],
];

export function build(ctx: AssetCtx): THREE.Object3D {
  const root = new THREE.Group();
  root.name = 'hand-truck';
  const SIDE = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number], noShadowReceive: true, convex: 0.3 };

  // ── 车架（工具橙）：两根竖杆 + 顶上往后弯 + 横把 + 中间一道横撑 + 车头托板 ───────────────
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const frame: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    const x = sx * RAIL_X;
    frame.push(bar(RAIL, V(x, 0.05, RAIL_Z), V(x, 0.95, RAIL_Z)));
    frame.push(bar(RAIL, V(x, 0.95, RAIL_Z), V(x, HANDLE_Y, HANDLE_Z)));
  }
  frame.push(new THREE.BoxGeometry(RAIL_X * 2 + RAIL + 0.04, 0.15, 0.15).translate(0, HANDLE_Y, HANDLE_Z));
  frame.push(new THREE.BoxGeometry(RAIL_X * 2, 0.12, 0.1).translate(0, 0.62, RAIL_Z));
  // 托板：从车架脚往前伸
  frame.push(new THREE.BoxGeometry(0.52, NOSE_T, 0.58).translate(0, NOSE_T / 2, 0.09));
  const frameMesh = new THREE.Mesh(mergeGeometries(frame.map(flat)), ctx.mat('toolOrange', { ...SIDE, edge: 0.5 }));
  frameMesh.name = 'frame';
  root.add(frameMesh);

  // ── 轮子（车架后脚两边）───────────────────────────────
  const wheels = [-1, 1].map((sx) =>
    flat(
      new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, WHEEL_W, 8)
        .rotateZ(Math.PI / 2)
        .translate(sx * WHEEL_X, WHEEL_R, WHEEL_Z),
    ),
  );
  const wheelMesh = new THREE.Mesh(mergeGeometries(wheels), ctx.mat('tyre', { ...SIDE, edge: 0.5, convex: 0.2 }));
  wheelMesh.name = 'wheels';
  root.add(wheelMesh);

  // ── 两只箱子（drawRange 截断 = setLoad）──────────────────────
  const bodies: THREE.BufferGeometry[] = [];
  const lids: THREE.BufferGeometry[] = [];
  const offB = [0];
  const offL = [0];
  for (const [w, h, d, x, y, z] of BOXES) {
    bodies.push(flat(new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z)));
    lids.push(flat(new THREE.PlaneGeometry(w - 0.06, d - 0.06).rotateX(-Math.PI / 2).translate(x, y + h + 0.006, z)));
    offB.push(offB[offB.length - 1] + bodies[bodies.length - 1].getAttribute('position').count);
    offL.push(offL[offL.length - 1] + lids[lids.length - 1].getAttribute('position').count);
  }
  const boxMesh = new THREE.Mesh(mergeGeometries(bodies), ctx.mat('timber', { ...SIDE, edge: 0.5 }));
  boxMesh.name = 'boxes';
  const lidMesh = new THREE.Mesh(
    mergeGeometries(lids),
    ctx.mat('timber', {
      noShadowReceive: true,
      convex: 0.2,
      edge: 0.4,
      elem: { kind: 'planks', space: 'local', p: [1, 0, 0, 0.23], seam: 1, hi: 0 },
    }),
  );
  lidMesh.name = 'box-lids';
  root.add(boxMesh, lidMesh);

  let load = BOXES.length;
  const setLoad = (n: number) => {
    load = Math.max(0, Math.min(BOXES.length, Math.round(n)));
    root.userData.load = load;
    boxMesh.geometry.setDrawRange(0, offB[load]);
    lidMesh.geometry.setDrawRange(0, offL[load]);
    boxMesh.visible = lidMesh.visible = load > 0;
  };

  root.userData.grip = {
    at: [-RAIL_X, HANDLE_Y, HANDLE_Z],
    at2: [RAIL_X, HANDLE_Y, HANDLE_Z],
    axis: [0, 0, 1],
    up: [0, 1, 0],
    cart: true,
  };
  root.userData.setLoad = setLoad;
  root.userData.load = load;
  // 画廊：?load=0..2
  const lp = ctx.params.get('load');
  if (lp !== null) setLoad(Number(lp));

  ctx.mats.prepare(root);
  return root;
}

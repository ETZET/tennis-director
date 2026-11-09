// #7 hose-reel 水管卷盘车 + 水管 + 喷头。
// 卷盘车：深色铁架（ironwork）+ 两个小轮 + 推把；两片俱乐部蓝的侧盘（counter）夹着一卷绿水管（seat，读成一个绿圆柱）；
// 东边一个摇把（橙色握头 toolOrange）。车身斜放（yaw −0.3）：侧盘露出一点盘面，不是一条竖线。
// 水管：六棱的管子（kit.ts 的 Tube，0.12 米粗 = 1× 下 2～3 纹素），俱乐部绿 —— 和红土互补，画面里最清楚的一条引导线。
// 默认沿 layout.ts 的 HOSE.pts 铺（世界坐标减去这个资产 slot 的位置）；尽头一个橙色手枪喷头躺在地上。
//
// 变体：v0 = 场景里的样子（水管铺到湿区东沿）；v1 = 只拖出一小段（画廊看卷盘、或者收在工具架边）。
//
// userData（stage 3）：
//   setPath(pts)：水管中心线（本地坐标，[x, z] 贴地或 [x, y, z]，从卷盘往外）。前面自动接上"从卷盘出来落到地上"的一段；
//                 返回水管长度（米）。喷头没被人拿着（还挂在这个资产下面）时，自动躺到线的尽头。
//   follow()：喷头被人拿着时每帧调：按喷头的接口（世界位置）在地上留拐点（每 0.8 米一个），超过 MAX_LEN 就把最早的拐点拉直；
//             返回 { length, taut }（taut = 已经拉到头了，人不该再往外走）。
//   reelIn()：收线（拐点清空，水管回到卷盘前一小段）；resetPath()：回到 layout 的样子。
//   length：当前放出去的长度；MAX_LEN = 18。卷盘上那卷绿管的粗细跟着放出去的长度变（全收 0.27 → 放满 0.17 米）。
//   nozzle：喷头（Object3D），nozzle.userData.grip = 握点（喷头自己的坐标）；拿的时候人物模块把它挂到手上（reparent），
//           放回去：root.add(nozzle) 再 setPath(...)。nozzle.userData.tail = 接水管的点（喷头坐标）、tip = 喷口（喷水 fx 从这里出）。
//   crank：摇把（Object3D，绕卷盘轴转），crank.userData.grip = 握头（摇把自己的坐标）；setCrank(角度)：摇把和那卷管一起转。
import * as THREE from 'three';
import { type Grip, Parts, smoothPath, Tube, type V3 } from '../../clubsite/tools/kit';
import type { AssetCtx } from '../ctx';
import { HOSE, SLOTS } from '../layout';

type K = 'ironwork' | 'counter' | 'seat' | 'toolOrange';

export const MAX_LEN = 18;
const R = 0.06; // 水管半径
const GY = 0.035 + R; // 贴地时中心线的高度（红土场面 0.03 厚）
const YAW = -0.3; // 车身斜放
const AXLE_Y = 0.46;
const FLANGE_R = 0.36;
const COIL_FULL = 0.27;
const COIL_EMPTY = 0.17;
const COIL_LEN = 0.5;
/** 圆的 / 侧对光的东西：光往上偏、档位放宽（落亮 + 中档） */
const SOFT = { lightUp: 0.55, bands: [-0.35, 0.3] as [number, number] };

export function build(ctx: AssetCtx): THREE.Object3D {
  const root = new THREE.Group();
  root.name = 'hose-reel';
  const opts = { noShadowReceive: true };

  // ── 卷盘车（车身坐标：轴沿 x，前 = +z，最后整体转 YAW）──
  const cart = new THREE.Group();
  cart.rotation.y = YAW;
  root.add(cart);
  const p = new Parts<K>();
  for (const s of [-1, 1]) {
    const x = s * 0.4;
    // 侧盘（3 纹素厚的盘子，车身斜放后露出窄椭圆盘面）
    p.cyl('counter', FLANGE_R, 0.07, 16, 'x', s * (COIL_LEN / 2 + 0.04), AXLE_Y, 0);
    // 轴头
    p.cyl('ironwork', 0.07, 0.08, 8, 'x', s * (COIL_LEN / 2 + 0.11), AXLE_Y, 0);
    // 侧架：一根直杆 轮轴 → (过卷盘轴) → 推把；卷盘轴 → 后脚。少而粗：两根，不搭成一团
    p.rod('ironwork', [x, 0.14, 0.2], [x, 0.94, -0.24], 0.08);
    p.rod('ironwork', [x, AXLE_Y, 0], [x, 0.03, -0.3], 0.08);
    // 轮子（深色胖轮）
    p.cyl('ironwork', 0.14, 0.09, 10, 'x', s * 0.47, 0.14, 0.2);
  }
  // 推把 + 两个橙色握套（总监的工具 = 工具橙）
  p.rod('ironwork', [-0.42, 0.94, -0.24], [0.42, 0.94, -0.24], 0.08);
  for (const s of [-1, 1]) p.cyl('toolOrange', 0.055, 0.16, 8, 'x', s * 0.26, 0.94, -0.24);
  // 两个后脚之间的横撑（落地，稳）
  p.rod('ironwork', [-0.4, 0.05, -0.28], [0.4, 0.05, -0.28], 0.08);
  // 侧盘朝东西（侧对太阳和镜头）：光往上偏 + 档位放宽 → 盘面落亮 / 中档的蓝，不是一块黑
  const frame = p.build((k) => ctx.mat(k, k === 'counter' ? { ...opts, ...SOFT } : opts), 'hose-reel');
  cart.add(frame);

  // 那卷管：单独一个网格（放线时变细、摇的时候转）
  const coil = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1, COIL_LEN, 16).rotateZ(-Math.PI / 2),
    ctx.mat('seat', {
      ...opts,
      ...SOFT,
      // 一圈圈的管：沿轴每 0.125 米一道 1 纹素的缝（不加亮条）
      elem: { kind: 'planks', space: 'local', p: [1, 0, 0, 0.125], seam: 1, hi: 0, seed: 2 },
    }),
  );
  coil.name = 'hose-reel:coil';
  coil.position.set(0, AXLE_Y, 0);
  cart.add(coil);

  // 摇把：东侧盘外，臂 0.2 米 + 橙色握头
  const crank = new THREE.Group();
  crank.name = 'hose-reel:crank';
  crank.position.set(COIL_LEN / 2 + 0.16, AXLE_Y, 0);
  const cp = new Parts<'ironwork' | 'toolOrange'>();
  cp.rod('ironwork', [0, 0, 0], [0, 0.22, 0], 0.07);
  cp.cyl('toolOrange', 0.05, 0.14, 8, 'x', 0.07, 0.22, 0);
  crank.add(cp.build((k) => ctx.mat(k, opts), 'hose-reel:crank'));
  crank.userData.grip = {
    at: [0.08, 0.22, 0],
    axis: [1, 0, 0],
    up: [0, 1, 0],
    tip: [0, 0, 0],
    pose: 'crank',
  } satisfies Grip;
  cart.add(crank);
  const setCrank = (a: number) => {
    crank.rotation.x = a;
    coil.rotation.x = a;
  };

  // ── 喷头（单独拿得起来的一件；喷头坐标：原点 = 手枪把中间，枪管朝 +z，枪身顶朝 +y）──
  const nozzle = new THREE.Group();
  nozzle.name = 'hose-reel:nozzle';
  const np = new Parts<'toolOrange' | 'ironwork'>();
  np.box('toolOrange', 0.09, 0.09, 0.3, 0, 0.08, 0.08); // 枪身
  np.box('toolOrange', 0.08, 0.17, 0.09, 0, -0.02, -0.03, [-0.25, 0, 0]); // 把
  np.box('ironwork', 0.11, 0.11, 0.06, 0, 0.08, 0.25); // 喷口（深色的头）
  np.box('ironwork', 0.1, 0.06, 0.1, 0, -0.12, -0.05); // 接水管的铁箍
  nozzle.add(np.build((k) => ctx.mat(k, opts), 'hose-reel:nozzle'));
  const TAIL = new THREE.Vector3(0, -0.15, -0.06);
  nozzle.userData.tail = TAIL.clone();
  nozzle.userData.tip = new THREE.Vector3(0, 0.08, 0.29);
  nozzle.userData.grip = {
    at: [0, 0, 0],
    axis: [0, 0, 1],
    up: [0, 1, 0],
    at2: [0, 0.02, 0.16],
    tip: [0, 0.08, 0.29],
    pose: 'water',
  } satisfies Grip;
  root.add(nozzle);

  // ── 水管 ──
  // 贴地的管子：光几乎从正上方来 → 顶上两条棱亮、朝镜头那一侧中档；没有暗档（暗档的深青在红土上读成一条黑线）
  const tube = new Tube(ctx.mat('seat', { ...opts, lightUp: 0.85, bands: [-0.6, 0.3] }), R, 140);
  tube.mesh.name = 'hose-reel:hose';
  root.add(tube.mesh);

  ctx.mats.prepare(root);
  // 水管、喷头贴地：不投影（投影是一条噪点线）；车身投影
  tube.mesh.castShadow = false;
  nozzle.traverse((o) => {
    o.castShadow = false;
  });

  // 水管从卷盘出来：卷盘底前沿 → 落到车前 0.45 米的地上
  cart.updateMatrix();
  const exit = new THREE.Vector3(0, AXLE_Y - 0.22, 0.2).applyMatrix4(cart.matrix);
  const drop = new THREE.Vector3(0, GY, 0.62).applyMatrix4(cart.matrix);
  drop.y = GY;

  const toV = (q: number[]) =>
    q.length === 3 ? new THREE.Vector3(q[0], q[1], q[2]) : new THREE.Vector3(q[0], GY, q[1]);
  const layNozzle = (end: THREE.Vector3, prev: THREE.Vector3) => {
    if (nozzle.parent !== root) return;
    // 躺着：枪管顺着水管的方向，侧放（把朝西边），压在地上
    const d = end.clone().sub(prev).setY(0);
    const yaw = Math.atan2(d.x, d.z);
    nozzle.rotation.set(0, yaw, Math.PI / 2, 'YXZ');
    nozzle.position.set(end.x, 0.03 + 0.06, end.z).add(new THREE.Vector3(0, 0, 0.2).applyEuler(nozzle.rotation));
  };

  let length = 0;
  const setPath = (pts: (number[] | THREE.Vector3)[]) => {
    const raw = [exit, drop, ...pts.map((q) => (q instanceof THREE.Vector3 ? q.clone() : toV(q)))];
    // 太近的点去掉（Catmull-Rom 在重合点上会打结）
    const clean: THREE.Vector3[] = [];
    for (const v of raw) if (!clean.length || v.distanceTo(clean[clean.length - 1]) > 0.15) clean.push(v);
    const line = smoothPath(clean, 0.25);
    tube.set(line);
    length = tube.length;
    root.userData.length = length;
    // 卷盘上剩的管：越放越细
    const k = THREE.MathUtils.clamp(length / MAX_LEN, 0, 1);
    const r = COIL_FULL + (COIL_EMPTY - COIL_FULL) * k;
    coil.scale.set(1, r, r);
    if (line.length >= 2) layNozzle(line[line.length - 1], line[line.length - 2]);
    return length;
  };

  // 默认的线：layout 的 HOSE.pts（世界）减去这个资产的 slot 位置（slot 不转）
  const slot = SLOTS.find((s) => s.asset === 'hose-reel');
  const ox = slot?.x ?? HOSE.pts[0][0];
  const oz = slot?.z ?? HOSE.pts[0][1] - 0.9;
  const layoutPts = (): number[][] => HOSE.pts.slice(1).map(([x, z]) => [x - ox, z - oz]);
  const shortPts = (): number[][] => [
    [-0.5, 1.4],
    [-1.3, 1.7],
    [-1.9, 1.3],
  ];
  const resetPath = () => setPath(ctx.variant === 1 ? shortPts() : layoutPts());

  // 跟人走：地上的拐点（本地坐标），初始 = 现在铺着的样子
  let trail: THREE.Vector3[] = [];
  const tail = new THREE.Vector3();
  const follow = () => {
    if (!trail.length) trail = (ctx.variant === 1 ? shortPts() : layoutPts()).map(toV);
    nozzle.updateWorldMatrix(true, false);
    root.updateWorldMatrix(true, false);
    tail.copy(TAIL).applyMatrix4(nozzle.matrixWorld);
    root.worldToLocal(tail);
    const g = new THREE.Vector3(tail.x, GY, tail.z);
    const last = trail[trail.length - 1] ?? drop;
    if (g.distanceTo(last) > 0.8) trail.push(g);
    // 手里那一段：从最后一个拐点往手边地上落一下，再起来到喷头
    const pts = [
      ...trail,
      new THREE.Vector3(tail.x * 0.9 + last.x * 0.1, GY, tail.z * 0.9 + last.z * 0.1),
      tail.clone(),
    ];
    let len = setPath(pts);
    let taut = false;
    while (len > MAX_LEN && trail.length > 1) {
      trail.shift();
      taut = true;
      len = setPath([...trail, tail.clone()]);
    }
    return { length: len, taut: taut || len > MAX_LEN };
  };
  const reelIn = () => {
    trail = [];
    setPath([]);
  };

  root.userData.setPath = setPath;
  root.userData.follow = follow;
  root.userData.reelIn = reelIn;
  root.userData.resetPath = resetPath;
  root.userData.MAX_LEN = MAX_LEN;
  root.userData.nozzle = nozzle;
  root.userData.crank = crank;
  root.userData.setCrank = setCrank;
  root.userData.grip = {
    // 推卷盘车：两只手握推把（车身坐标转回本地）
    at: rot([0.26, 0.94, -0.24]),
    at2: rot([-0.26, 0.94, -0.24]),
    axis: rot([0, -0.6, 0.8], true),
    up: rot([0, 0.8, 0.6], true),
    pose: 'push',
  } satisfies Grip;
  resetPath();
  return root;
}

/** 车身坐标 → 本地（绕 y 转 YAW） */
function rot(v: V3, dir = false): V3 {
  const t = new THREE.Vector3(...v).applyAxisAngle(new THREE.Vector3(0, 1, 0), YAW);
  if (dir) t.normalize();
  return [t.x, t.y, t.z];
}

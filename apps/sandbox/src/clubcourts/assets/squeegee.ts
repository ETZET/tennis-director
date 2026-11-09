// #9 squeegee 刮水板（总监刮会员场帆前的水洼用）：0.9 米宽的刮头 —— 俱乐部蓝的壳（counter）+ 下面一条深色橡胶条
// （ironwork，往前多伸出 1 纹素，读得出"刮的那条边"）+ 中间一个铸铁柄座；1.5 米的木柄（0.09 米 = 屏幕上稳定 2 纹素），
// 柄顶一截深色握套。
// 三个状态（userData.setState）：
//   'held'   立着（工具自己的坐标系）：刮头在原点（橡胶条底边贴地），柄沿 +y 往上、略往后（−z）仰 0；刮头正面（推的方向）朝 +z
//   'ground' 平放在地上（柄朝 +z）
//   'lean'   靠在北边的围网上（场景默认，SLOTS 的 squeegee：(−9.6, 17.05)，围网在本地 z ≈ −0.35）：刮头落地在 z +0.12，柄往北斜靠到网上
// 握点（userData.grip，当前状态的本地坐标；字段同 clubsite/tools/kit.ts 的 Grip）：主手在柄顶下 0.1 米，副手再往下 0.45 米；
//   axis 指向刮头，up = 刮头正面（推的方向），tip = 橡胶条底边中点，pose 'push'（人物模块的 push 姿势）。
// 注意：hold.ts 只在 state === 'ground' 时自动 setState('held')；从 'lean' 拿起来也能用（握点跟着状态算好的），
// 但最好先调 setState('held') 再 attach。
//
// userData：
//   state: 'held' | 'ground' | 'lean'；setState(s)
//   grip: Grip；tool: 真正的几何（状态切换只改它的变换）
//   bladeCenter(): 橡胶条底边中点（本地坐标，当前状态）
//   bladeEnds(): [西端, 东端]（本地坐标，当前状态）—— stage 3 刮水：拿到世界坐标后给场地 squeegee(x, z, dirX, dirZ, width = 0.9)
//   width: 0.9
import * as THREE from 'three';
import { type Grip, Parts, xfGrip } from '../../clubsite/tools/kit';
import type { AssetCtx } from '../world';

type K = 'counter' | 'ironwork' | 'timber';
type State = 'held' | 'ground' | 'lean';

const W = 0.9;
const TOP = 1.5;
/** 刮头的深（z）和高 */
const HEAD_D = 0.12;
const RUBBER_H = 0.06;
const SHELL_H = 0.11;

export function build(ctx: AssetCtx): THREE.Object3D {
  const p = new Parts<K>();
  // 'held' 坐标系：橡胶条底边在 y 0，刮头沿 x，柄沿 +y；刮头正面朝 +z
  p.box('ironwork', W, RUBBER_H, 0.05, 0, RUBBER_H / 2, 0.04); // 橡胶条（往前探一点）
  p.box('counter', W - 0.04, SHELL_H, HEAD_D, 0, RUBBER_H + SHELL_H / 2, 0); // 壳
  // 壳两头的端盖（深一点的胖块，刮头的宽读得清楚）
  for (const s of [-1, 1])
    p.box('ironwork', 0.05, SHELL_H + 0.02, HEAD_D + 0.02, (s * (W - 0.02)) / 2, RUBBER_H + SHELL_H / 2, 0);
  const seatY = RUBBER_H + SHELL_H;
  p.box('ironwork', 0.16, 0.09, 0.11, 0, seatY + 0.045, 0); // 柄座
  p.rod('timber', [0, seatY + 0.06, 0], [0, TOP - 0.16, 0], 0.09);
  p.box('ironwork', 0.11, 0.18, 0.11, 0, TOP - 0.09, 0); // 握套

  const tool = p.build(
    (k) =>
      ctx.mat(k, {
        noShadowReceive: true,
        // 刮头壳朝镜头的那一面：光往上偏一点 → 正面落中档、顶面亮；
        // 木柄：立着 / 靠着的时候朝镜头那面落中档（全暗就贴在深青的挡风布上看不见）
        ...(k === 'counter' ? { lightUp: 0.35, bands: [-0.3, 0.45] as [number, number] } : {}),
        ...(k === 'timber' ? { lightUp: 0.3, bands: [-0.55, 0.45] as [number, number] } : {}),
      }),
    'squeegee',
  );
  ctx.mats.prepare(tool);

  const root = new THREE.Group();
  root.name = 'squeegee';
  root.add(tool);

  const grip: Grip = {
    at: [0, TOP - 0.1, 0],
    axis: [0, -1, 0],
    up: [0, 0, 1],
    at2: [0, TOP - 0.55, 0],
    tip: [0, 0, 0.04],
    pose: 'push',
  };

  // 平放：绕 x 转 +90°（柄 → +z，刮头正面 / 橡胶条朝下贴地）；抬起半个刮头深，刮头挪到 z −0.7
  const GROUND = new THREE.Matrix4()
    .makeTranslation(0, HEAD_D / 2 + 0.03, -0.7)
    .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
  // 靠着围网：刮头落地在 z +0.12，柄往北（−z）倒 ≈ 17°，柄顶落到 z ≈ −0.3（围网布面）
  const LEAN_A = Math.asin(0.42 / TOP);
  const LEAN = new THREE.Matrix4().makeTranslation(0, 0, 0.12).multiply(new THREE.Matrix4().makeRotationX(-LEAN_A));

  const setState = (s: State) => {
    root.userData.state = s;
    tool.matrix.identity();
    if (s === 'ground') tool.matrix.copy(GROUND);
    if (s === 'lean') tool.matrix.copy(LEAN);
    tool.matrix.decompose(tool.position, tool.quaternion, tool.scale);
    root.userData.grip = xfGrip(grip, tool.matrix);
  };
  const local = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyMatrix4(tool.matrix);
  root.userData.tool = tool;
  root.userData.width = W;
  root.userData.setState = setState;
  root.userData.bladeCenter = () => local(0, 0, 0.04);
  root.userData.bladeEnds = () => [local(-W / 2, 0, 0.04), local(W / 2, 0, 0.04)];
  // 画廊：v0 靠网（场景默认），v1 立着（手里的样子），v2 平放
  setState((['lean', 'held', 'ground'] as const)[ctx.variant % 3]);
  return root;
}

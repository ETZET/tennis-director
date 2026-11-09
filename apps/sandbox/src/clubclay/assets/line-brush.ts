// #6 line-brush 扫线刷：0.6 米宽的俱乐部蓝刷头壳 + 一条草秆色刷毛 + 1.4 米木柄（0.09 米 = 屏幕上稳定 2 纹素）。
// 两个状态：'ground' 平放在地上（场景里 SLOTS 的 line-brush，柄朝 +z）、'held' 立着（总监推着走，`push` 姿势）。
// 握点（userData.grip，当前状态的本地坐标；'held' 时）：主手在柄顶下 0.1 米，副手再往下 0.4 米；axis 指向刷头，up = 刷头正面（推的方向）。
//
// userData：
//   state: 'ground' | 'held'；setState(s)
//   grip: Grip（见 clubsite/tools/kit.ts）；tool: 真正的几何（状态切换只改它的变换）
//   headCenter(): 刷头底边中点（本地坐标，当前状态）—— stage 3 扫线：这个点走过的线段 tapeDust → tape
import * as THREE from 'three';
import { type Grip, Parts, xfGrip } from '../../clubsite/tools/kit';
import type { AssetCtx } from '../world';

type K = 'counter' | 'dryGrass' | 'woodWeathered' | 'ironwork';

const HEAD_W = 0.6;
const HANDLE_TOP = 1.45;

export function build(ctx: AssetCtx): THREE.Object3D {
  const p = new Parts<K>();
  // 'held' 坐标系：刷头在原点上方，柄沿 +y 立起；刷头正面朝 +z
  p.box('dryGrass', HEAD_W - 0.04, 0.09, 0.1, 0, 0.045, 0); // 刷毛
  p.box('counter', HEAD_W, 0.1, 0.13, 0, 0.13, 0); // 壳
  p.box('ironwork', 0.12, 0.06, 0.1, 0, 0.21, 0); // 柄座
  p.rod('woodWeathered', [0, 0.2, 0], [0, HANDLE_TOP, 0], 0.09);
  p.box('ironwork', 0.1, 0.08, 0.1, 0, HANDLE_TOP - 0.03, 0); // 柄头的握套（深色，柄顶读得出来）

  const tool = p.build(
    (k) =>
      ctx.mat(k, {
        noShadowReceive: true,
        // 刷头壳朝镜头的那一面：光往上偏一点 → 侧面落中档，顶面亮
        ...(k === 'counter' ? { lightUp: 0.3 } : {}),
      }),
    'line-brush',
  );
  ctx.mats.prepare(tool);

  const root = new THREE.Group();
  root.name = 'line-brush';
  root.add(tool);

  const grip: Grip = {
    at: [0, HANDLE_TOP - 0.1, 0],
    axis: [0, -1, 0],
    up: [0, 0, 1],
    at2: [0, HANDLE_TOP - 0.5, 0],
    tip: [0, 0, 0],
    pose: 'push',
  };

  // 平放：绕 x 转 +90°（柄 → +z，刷头正面贴地），抬起半个刷头厚，刷头中心挪到 z −0.6
  const GROUND = new THREE.Matrix4()
    .makeTranslation(0, 0.065, -0.73)
    .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));

  const setState = (s: 'ground' | 'held') => {
    root.userData.state = s;
    tool.matrix.identity();
    if (s === 'ground') tool.matrix.copy(GROUND);
    tool.matrix.decompose(tool.position, tool.quaternion, tool.scale);
    // 握点跟着状态走：平放着也能直接拿起来（hold.ts 按握点重新摆整件东西）
    root.userData.grip = xfGrip(grip, tool.matrix);
  };
  root.userData.tool = tool;
  root.userData.setState = setState;
  root.userData.headCenter = () => new THREE.Vector3(0, 0, 0).applyMatrix4(tool.matrix);
  setState(ctx.variant === 1 ? 'held' : 'ground');
  return root;
}

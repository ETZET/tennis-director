// #5 skim-net 长杆捞网：2.4 米的金属漆伸缩杆（metal，0.1 米 = 1× 下稳定 2 纹素）+ 手握的深色握套和一道伸缩接头的箍
// + 杆头一个平的网圈（0.44 米宽，金属圈 0.09 米粗）+ 网兜（windscreen 深绿：圈里一块平的网面 + 往下垂 0.27 米的兜）。
//
// 两个状态：
//   'held'（v0，SLOTS 的 skim-net）：本地原点 = 总监的主手（slot 的 y = 广场 + 1.05）。杆往西（−x）、往下伸，
//          网圈平贴在水面上（水面 = 手下 0.63 米：广场 + 0.42），网兜沉在水里（被水面盖住，只看得到圈和网面）。
//   'ground'（v1）：平放在地上（杆沿 x，网圈在西头）。画廊里 v0 会整体抬高 1.1 米（不然网圈在台子下面）。
//
// userData：
//   state；setState('held' | 'ground')
//   grip: Grip（当前状态的本地坐标；'held' 时）—— 主手在原点，axis 顺着杆指向网圈，up ≈ 网口朝上，at2 = 副手（往网圈那边 0.55 米），pose 'skim'
//   ringCenter(): 网圈中心（本地坐标，当前状态）—— stage 3：叶子跟着它走、网圈在水面上划出的泡沫弧从这里出
//   tool：真正的几何（状态切换只改它的变换）
import * as THREE from 'three';
import { type Grip, Parts, perpUp, type V3, xfGrip } from '../../clubsite/tools/kit';
import type { AssetCtx } from '../world';

type K = 'metal' | 'ironwork' | 'windscreen';

/** 网圈中心（'held' 坐标：相对主手）、半径 */
const RING: V3 = [-2.45, -0.6, 0];
const RING_R = 0.2;

export function build(ctx: AssetCtx): THREE.Object3D {
  const p = new Parts<K>();
  // 杆：从手后 0.15 米 → 网圈的接头
  const joint = new THREE.Vector3(RING[0] + RING_R + 0.05, RING[1] + 0.04, RING[2]);
  const D = joint.clone().normalize();
  const at = (t: number): V3 => [D.x * t, D.y * t, D.z * t];
  const L = joint.length();
  p.rod('metal', at(-0.15), [joint.x, joint.y, joint.z], 0.1);
  // 握套（手的那一段，深色、胖一点）+ 伸缩接头的箍
  p.rod('ironwork', at(-0.17), at(0.32), 0.12);
  p.rod('ironwork', at(L * 0.52), at(L * 0.52 + 0.1), 0.13);
  // 网圈：一圈 8 段的方杆（平的，金属圈 0.09 米）+ 接头一小段
  const N = 10;
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * Math.PI * 2;
    const a1 = ((i + 1) / N) * Math.PI * 2;
    const q = (a: number): V3 => [RING[0] + Math.cos(a) * RING_R, RING[1], RING[2] + Math.sin(a) * RING_R * 1.1];
    p.rod('metal', q(a0), q(a1), [0.09, 0.06], [0, 1, 0]);
  }
  p.rod('metal', [RING[0] + RING_R, RING[1], RING[2]], [joint.x, joint.y, joint.z], 0.09);
  // 网面（圈里平的一块，稍低于圈）+ 往下垂的兜（倒锥）
  const face = new THREE.CylinderGeometry(RING_R - 0.02, RING_R - 0.02, 0.02, 12);
  face.scale(1, 1, 1.1);
  face.translate(RING[0], RING[1] - 0.015, RING[2]);
  p.add('windscreen', face);
  const bag = new THREE.ConeGeometry(RING_R - 0.03, 0.27, 10);
  bag.rotateX(Math.PI);
  bag.scale(1, 1, 1.1);
  bag.translate(RING[0] + 0.03, RING[1] - 0.03 - 0.135, RING[2]);
  p.add('windscreen', bag);

  const tool = p.build(
    (k) =>
      ctx.mat(k, {
        noShadowReceive: true,
        // 网面：一点点深浅块（paint），网兜不是一块死平的深绿
        ...(k === 'windscreen' ? { elem: { kind: 'paint', space: 'local', size: [3, 2], seed: 4 } } : {}),
      }),
    'skim-net',
  );
  const root = new THREE.Group();
  root.name = 'skim-net';
  root.add(tool);
  ctx.mats.prepare(root);
  // 细杆的投影是一条噪点线：杆和圈都不投影（网兜在水下）
  root.traverse((o) => {
    o.castShadow = false;
  });

  const grip: Grip = {
    at: [0, 0, 0],
    axis: [D.x, D.y, D.z],
    up: perpUp([D.x, D.y, D.z]),
    at2: at(0.55),
    tip: RING,
    pose: 'skim',
  };

  // 平放：把杆转平（绕 z 转掉杆的俯角），整体落地（最低点 = 网兜尖，平放时兜侧躺 → 抬到杆贴地）
  const pitch = Math.atan2(-D.y, -D.x);
  const GROUND = new THREE.Matrix4().makeTranslation(1.2, 0.06, 0).multiply(new THREE.Matrix4().makeRotationZ(-pitch));
  const lift = ctx.params.get('asset') === 'skim-net' ? 1.1 : 0;

  const setState = (s: 'held' | 'ground') => {
    root.userData.state = s;
    tool.matrix.identity();
    if (s === 'ground') tool.matrix.copy(GROUND);
    else tool.matrix.makeTranslation(0, lift, 0);
    tool.matrix.decompose(tool.position, tool.quaternion, tool.scale);
    root.userData.grip = xfGrip(grip, tool.matrix);
  };
  root.userData.tool = tool;
  root.userData.setState = setState;
  root.userData.ringCenter = () => new THREE.Vector3(...RING).applyMatrix4(tool.matrix);
  setState(ctx.variant === 1 ? 'ground' : 'held');
  return root;
}

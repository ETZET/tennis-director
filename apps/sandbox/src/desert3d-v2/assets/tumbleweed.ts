// 风滚草：一个枯草球。外壳是起伏很大的球（dryGrass 三档 + 竖向笔触噪声），开几个洞露出里面暗的枝芯 → 通透、枝杈感，不撒噪点。
// 规格 0.9 × 0.8 × 0.9 米（≈ 10 × 6 纹素），0.6k 三角形以内。
// 滚动：obj.userData.roll(dt, velocity) —— velocity 是世界坐标的地面速度（米/秒；Vector3 取 x、z，或 {x, z}），
// 只转球、不移动位置（位置由调用方推）。画廊里静止。
// 材质规范 v2：外壳上是 `blades` 竖向的枯枝划（亮档里是茶褐的枝、中档里是浅草色的枝、暗档里是浅紫的枝），
// 斑块疏密；`space: 'local'` 跟着球走（滚的时候图案不在球上"游"，跟着球心平移）。团与团之间的缝露出暗的枝芯 = 空隙。
import * as THREE from 'three';
import type { AssetCtx } from '../world';
import { Bucket, blob, tones } from './creosote/kit';

/** 干草（手挑）：[亮, 中, 暗] 各 [本色, 高一级, 低一级]；亮边色 = 枝划 */
const SHELL = tones(
  [0xf2d68a, 0xf8e29a, 0xecce7e],
  [0xc8945e, 0xd29e66, 0xbc8a58],
  [0x6e5a8c, 0x78649a, 0x64508a],
  [0xd8b06c, 0xa8745a, 0x5a4a7e],
  [0xdab272, 0xe2c27c, 0x8c76a4],
);

const R = 0.44;

export function build(ctx: AssetCtx): THREE.Object3D {
  const rnd = ctx.rng(`tumbleweed:${ctx.variant}`);
  const root = new THREE.Group();
  const spin = new THREE.Group();
  spin.position.y = R * 0.92;
  root.add(spin);
  const B = new Bucket();
  const shell = ctx.mat('dryGrass', {
    ramp: [SHELL.bands[0][0], SHELL.bands[1][0], SHELL.bands[2][0]],
    tones: SHELL,
    elem: { kind: 'blades', space: 'local', density: [0.16, 0.34], patch: 0.6 },
    bands: [-0.3, 0.32],
    lightUp: 0.45,
    noise: 0.15,
    edge: 0.4,
    convex: 0.15,
  });
  const core = ctx.mat('branch', { bands: [-2, 2], edge: 0.1, convex: 0, noShadowReceive: true });

  // 外壳：4～5 个起伏的草团挤成一个球，团与团之间的缝露出里面暗的枝芯（成块的"缝"，不是逐纹素的洞）
  const n = 5;
  const a0 = rnd() * Math.PI * 2;
  const dirs: THREE.Vector3[] = [new THREE.Vector3(0.2, 1, 0.5)];
  for (let i = 0; i < n - 1; i++) {
    const a = a0 + (i / (n - 1)) * Math.PI * 2;
    dirs.push(new THREE.Vector3(Math.cos(a), -0.15 + rnd() * 0.3, Math.sin(a)));
  }
  for (const d of dirs) {
    d.normalize().multiplyScalar(R * 0.5);
    const r = R * (0.52 + rnd() * 0.08);
    const bg = blob(r, rnd, { detail: 1, squash: 0.95, jitter: 0.18, lowC: 0.2 }).translate(d.x, d.y, d.z);
    // 法线 = 团自己的球面法线和整球法线各一半：每团有自己的亮顶，整球仍是上亮下暗
    const p = bg.getAttribute('position') as THREE.BufferAttribute;
    const nm = bg.getAttribute('normal') as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    const w = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).normalize();
      w.fromBufferAttribute(nm, i).multiplyScalar(0.6).add(v).normalize();
      nm.setXYZ(i, w.x, w.y, w.z);
    }
    B.add(shell, bg);
  }
  // 枝芯：暗、小一圈，从缝里看见
  B.add(core, blob(R * 0.78, rnd, { detail: 1, squash: 0.95, jitter: 0.12 }));
  B.build(spin);
  ctx.mats.prepare(root);

  const axis = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const qw = new THREE.Quaternion();
  root.userData.roll = (dt: number, velocity: { x: number; z?: number; y?: number }) => {
    const vx = velocity.x;
    const vz = velocity.z ?? velocity.y ?? 0;
    const speed = Math.hypot(vx, vz);
    if (speed < 1e-5 || dt <= 0) return;
    // 不打滑滚动：角速度 = 上 × 速度 / 半径 → 轴 (vz, 0, -vx)
    axis.set(vz / speed, 0, -vx / speed);
    // 世界轴换到 spin 的父坐标（root 可能被 SLOTS 旋转过）
    root.getWorldQuaternion(qw);
    axis.applyQuaternion(qw.invert());
    q.setFromAxisAngle(axis, (speed * dt) / R);
    spin.quaternion.premultiply(q);
  };
  return root;
}

// #9 line-marker：划线车（补底线、边线的白漆）。一只白漆桶（正面一条俱乐部蓝带、顶上一个盖子）坐在钢架上，
// 两只胖轮子（4 纹素宽的胎）、桶下一个出漆嘴、前头一只小滚轮；一根推把从车架往后上斜到腰高，顶上一根横杆、两头橙色握套。
// 本地原点 = 两轮之间的地面；车头朝 +z，推把朝 −z。规格 0.7 × 0.95 × 1.3。
// 放在工具角时 SLOTS 给 rotY（0.4）；总监推着走时由人物模块的 push 姿势拿着（握点在推把横杆中点）。
//
// userData：
//   grip   握点（人物模块 hold() 读它，约定见 clubsite/people/hold.ts）：
//          at  (0, 0.88, −0.7) 推把横杆中点（右手）· at2 (0.2, 0.88, −0.7)（左手）·
//          axis 从握点指向出漆嘴 · up 车架的上方 · tip (0, 0.02, 0.12) 出漆嘴落地点（身后留线就从这里画）· pose 'push'
//   roll(dt, speed)  轮子按地速转（米/秒）；画线车被推着走时每帧调
//   wheels           两只大轮 + 小滚轮（转的那几个网格）
import * as THREE from 'three';
import type { AssetCtx } from '../world';
import { Bag, PROP, pipe, V } from './court/kit';

const WHEEL = { r: 0.19, w: 0.12, x: 0.3, z: 0 };
const ROLLER = { r: 0.07, w: 0.24, z: 0.46 };

export function build(ctx: AssetCtx): THREE.Object3D {
  const root = new THREE.Group();
  root.name = 'line-marker';
  const frame = ctx.mat('metal', { ...PROP, convex: 0.6 });
  const bucket = ctx.mat('clothWhite', { ...PROP, lightUp: 0.5, convex: 0.5, sphereNormals: [0, 0.4, 0.1] });
  const band = ctx.mat('canvasStripe', { ...PROP, lightUp: 0.5, convex: 0.3, sphereNormals: [0, 0.4, 0.1] });
  const lid = ctx.mat('clothWhite', { ...PROP, convex: 0.7 });
  const tyre = ctx.mat('ironwork', { ...PROP, convex: 0.5 });
  const hub = ctx.mat('concrete', { ...PROP, convex: 0.7 });
  const grip = ctx.mat('toolOrange', { ...PROP, convex: 0.5 });

  const bag = new Bag();
  // ── 车架：两根纵梁（轮轴前后）+ 前横梁 + 后横梁，桶托 ──
  for (const s of [-1, 1]) bag.box(frame, 0.09, 0.09, 0.78, s * 0.22, 0.22, 0.12);
  bag.box(frame, 0.53, 0.09, 0.09, 0, 0.22, 0.48);
  bag.box(frame, 0.53, 0.09, 0.09, 0, 0.22, -0.24);
  bag.box(frame, 0.66, 0.05, 0.05, 0, WHEEL.r - 0.025, WHEEL.z); // 轮轴
  // 滚轮的两根支脚
  for (const s of [-1, 1]) pipe(bag, frame, V(s * 0.14, 0.24, 0.48), V(s * 0.14, ROLLER.r, ROLLER.z), 0.045, 4);
  // ── 漆桶：八边柱（0.44 宽、0.42 高），中间一条蓝带，顶上盖子 + 提手 ──
  const by = 0.3;
  const bh = 0.42;
  const br = 0.22;
  bag.add(bucket, new THREE.CylinderGeometry(br, br * 0.92, bh * 0.38, 8, 1).translate(0, by + bh * 0.19, 0.12));
  bag.add(band, new THREE.CylinderGeometry(br + 0.005, br + 0.005, bh * 0.22, 8, 1).translate(0, by + bh * 0.49, 0.12));
  bag.add(bucket, new THREE.CylinderGeometry(br, br, bh * 0.4, 8, 1).translate(0, by + bh * 0.8, 0.12));
  bag.add(lid, new THREE.CylinderGeometry(br + 0.03, br + 0.03, 0.05, 8, 1).translate(0, by + bh + 0.025, 0.12));
  bag.box(lid, 0.12, 0.05, 0.08, 0, by + bh + 0.05, 0.12);
  // 出漆嘴（桶底往下，到离地 0.06）
  pipe(bag, frame, V(0, by, 0.12), V(0, 0.07, 0.12), 0.05, 6);
  // ── 推把：两根管从后横梁往后上斜到 (±0.22, 0.86, −0.68)，顶上一根横杆，两头橙色握套 ──
  const H = { y: 0.88, z: -0.7 };
  for (const s of [-1, 1]) pipe(bag, frame, V(s * 0.2, 0.26, -0.22), V(s * 0.2, H.y, H.z), 0.045, 6);
  pipe(bag, frame, V(-0.27, H.y, H.z), V(0.27, H.y, H.z), 0.045, 6);
  for (const s of [-1, 1]) pipe(bag, grip, V(s * 0.09, H.y, H.z), V(s * 0.28, H.y, H.z), 0.06, 6);
  bag.into(root);

  // ── 轮子（会转：各自一个网格）──
  const wheels: THREE.Mesh[] = [];
  const wheelGeo = (r: number, w: number) => new THREE.CylinderGeometry(r, r, w, 10, 1).rotateZ(Math.PI / 2);
  for (const s of [-1, 1]) {
    const w = new THREE.Mesh(wheelGeo(WHEEL.r, WHEEL.w), tyre);
    w.position.set(s * WHEEL.x, WHEEL.r, WHEEL.z);
    // 轮毂：一个浅色小圆盘（朝外）
    const h = new THREE.Mesh(wheelGeo(WHEEL.r * 0.45, WHEEL.w + 0.02), hub);
    w.add(h);
    root.add(w);
    wheels.push(w);
  }
  const roller = new THREE.Mesh(wheelGeo(ROLLER.r, ROLLER.w), tyre);
  roller.position.set(0, ROLLER.r, ROLLER.z);
  root.add(roller);
  wheels.push(roller);

  const at: [number, number, number] = [0, H.y, H.z];
  const tip: [number, number, number] = [0, 0.02, 0.12];
  const ax = new THREE.Vector3(tip[0] - at[0], tip[1] - at[1], tip[2] - at[2]).normalize();
  const upv = new THREE.Vector3(0, 1, 0).sub(ax.clone().multiplyScalar(ax.y)).normalize();
  root.userData.grip = {
    at,
    at2: [0.2, H.y, H.z],
    axis: [ax.x, ax.y, ax.z],
    up: [upv.x, upv.y, upv.z],
    tip,
    pose: 'push',
  };
  root.userData.wheels = wheels;
  root.userData.roll = (dt: number, speed: number) => {
    for (const w of wheels) {
      const r = w === roller ? ROLLER.r : WHEEL.r;
      w.rotation.x += (dt * speed) / r;
    }
  };

  ctx.mats.prepare(root);
  return root;
}

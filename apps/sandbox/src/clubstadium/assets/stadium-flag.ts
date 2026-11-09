// #11 stadium-flag：记分牌两边、北看台后墙顶上的旗杆。2 纹素粗的钢杆（4.2 米）+ 底座法兰 + 杆顶一颗黄铜球，
// 一面 1.2 × 0.8 的旗顺风飘。v0 = 俱乐部旗（蓝 / 奶油 / 蓝三横条），v1 = 红旗（红 / 奶油 / 红）。
// 风：读共享的 uWind（方向 × 强度）、uGust（阵风）、uTime —— 旗朝下风那边转过去（风往东偏南吹 → 旗往右飘、略朝镜头），
// 旗面沿长度方向一道往外传的波（离杆越远摆得越大），阵风大时波快、旗展得更平。CPU 动 4 × 2 段的格子（顶点很少）。
// 本地原点 = 旗杆脚（SLOTS 里 y = 后墙顶 6.8）。
// userData.update(dt, t)：每帧按风改旗面（场景的 collectUpdaters 已经在调）；userData.flag = 旗面那个 Group。
import * as THREE from 'three';
import type { AssetCtx } from '../world';
import { Bag, PROP } from './court/kit';

const POLE = { h: 4.2, w: 0.18 };
const FLAG = { w: 1.2, h: 0.8, nx: 6, top: 4.05 };
/** 三横条：每条占旗高的比例（上 / 中 / 下） */
const BANDS = [0.36, 0.28, 0.36];

export function build(ctx: AssetCtx): THREE.Object3D {
  const root = new THREE.Group();
  root.name = 'stadium-flag';
  const v = ((ctx.variant % 2) + 2) % 2;
  const steel = ctx.mat('concrete', { ...PROP, lightUp: 0.6, bands: [-0.45, 0.3], convex: 0.6 });
  const brass = ctx.mat('brass', { ...PROP, convex: 0.8, sphereNormals: [0, POLE.h + 0.1, 0] });
  const clothOpts = {
    lightUp: 0.5,
    bands: [-0.6, 0.05] as [number, number],
    noShadowReceive: true,
    side: THREE.DoubleSide,
    convex: 0.2,
    edge: 0.4,
  };
  const field = v === 0 ? ctx.mat('counter', clothOpts) : ctx.mat('clothRed', clothOpts);
  const band = ctx.mat('canvas', clothOpts);

  const bag = new Bag();
  bag.box(steel, 0.36, 0.08, 0.36, 0, 0, 0);
  bag.box(steel, POLE.w, POLE.h, POLE.w, 0, 0.08, 0);
  bag.into(root);
  const knob = new THREE.Mesh(new THREE.IcosahedronGeometry(0.11, 1).translate(0, POLE.h + 0.12, 0), brass);
  root.add(knob);

  // ── 旗面：三条，每条一个 nx × 1 的格子；顶点每帧按风重算 ──
  const flag = new THREE.Group();
  flag.name = 'flag';
  flag.position.set(0, FLAG.top, 0);
  root.add(flag);
  interface Strip {
    geo: THREE.BufferGeometry;
    v0: number;
    v1: number;
  }
  const strips: Strip[] = [];
  let acc = 0;
  BANDS.forEach((f, i) => {
    const v0 = acc;
    const v1 = acc + f;
    acc = v1;
    const geo = new THREE.BufferGeometry();
    const n = (FLAG.nx + 1) * 2;
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const idx: number[] = [];
    for (let k = 0; k < FLAG.nx; k++) {
      const a = k * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geo.setIndex(idx);
    strips.push({ geo, v0, v1 });
    flag.add(new THREE.Mesh(geo, i === 1 ? band : field));
  });

  const U = ctx.uniforms;
  const tmp = new THREE.Vector2();
  /** 旗的姿态：u 0..1 沿旗长（0 = 杆），v 0..1 从上往下；返回本地位置（旗所在的面先当成 xy 面、往 +x 展开） */
  const shape = (u: number, vv: number, t: number, wind: number, gust: number, out: THREE.Vector3) => {
    const x = u * FLAG.w;
    // 波：沿旗长往外传，离杆越远越大；风越大波越快、幅度越小（旗展平）
    const k = 2.2 + gust * 1.2;
    const amp = (0.16 - 0.06 * gust) * u;
    const ph = t * (4 + 5 * gust) - u * k * Math.PI;
    const z = Math.sin(ph) * amp + Math.sin(ph * 0.5 + vv * 1.3) * amp * 0.35;
    // 风小时旗角往下耷拉
    const droop = (1 - Math.min(1, wind * 2.2)) * 0.35 * u * u;
    const y = -vv * FLAG.h - droop;
    return out.set(x * (1 - droop * 0.4), y, z);
  };
  const p = new THREE.Vector3();
  const update = (_dt: number, t: number) => {
    tmp.copy(U.uWind.value);
    const wind = tmp.length();
    const gust = U.uGust.value;
    // 旗朝下风转：风往 (wx, wz) 吹 → 旗的 +x 轴转到风向（绕 y），无风时朝东垂着
    const yaw = wind > 1e-3 ? Math.atan2(-tmp.y, tmp.x) : 0;
    flag.rotation.y = yaw;
    for (const s of strips) {
      const pos = s.geo.getAttribute('position') as THREE.BufferAttribute;
      for (let k = 0; k <= FLAG.nx; k++) {
        const u = k / FLAG.nx;
        shape(u, s.v0, t, wind, gust, p);
        pos.setXYZ(k * 2, p.x, p.y, p.z);
        shape(u, s.v1, t, wind, gust, p);
        pos.setXYZ(k * 2 + 1, p.x, p.y, p.z);
      }
      pos.needsUpdate = true;
      s.geo.computeVertexNormals();
      // 双面：法线统一朝镜头那边（+z 半球），两面看着一样亮
      const nor = s.geo.getAttribute('normal') as THREE.BufferAttribute;
      for (let i = 0; i < nor.count; i++) if (nor.getZ(i) < 0) nor.setXYZ(i, -nor.getX(i), -nor.getY(i), -nor.getZ(i));
      nor.needsUpdate = true;
      s.geo.computeBoundingSphere();
    }
  };
  update(0, 0.6 + v * 1.7);
  root.userData.update = (dt: number, t: number) => update(dt, t + v * 1.7);
  root.userData.flag = flag;

  ctx.mats.prepare(root);
  return root;
}

// path-lamp：小路边的矮路灯（第三轮，夜景用；各场景共用）。3.1 米：水泥墩 + 暗铁方杆 + 顶上一只四方的灯笼（奶白灯面、暗铁帽）。
// 原点 = 杆脚中心。默认不投影（细杆的影子横在路上是噪点）。
// userData.night：天黑自动亮（灯面换自发光的暖黄），脚下一圈半径 2.8 米的暖光。
import * as THREE from 'three';
import { LAMP_AMBER, nightLight } from '../daylight/night';
import { Bucket, box, DU, FACING, type NetCtx } from './nets/kit';

const H = 3.1;

export function build(ctx: NetCtx): THREE.Object3D {
  const g = new THREE.Group();
  g.name = 'path-lamp';
  const ironM = ctx.mat('ironwork', { ...FACING, convex: 0.6, edge: 0.5 });
  const footM = ctx.mat('concrete', { convex: 0.5, edge: 0.4 });
  const lens = { bands: [-2, -1.5] as [number, number], edge: 0.2, convex: 0, noShadowReceive: true };
  const off = ctx.mat('clothWhite', lens);
  const on = ctx.mat('clothWhite', { ...lens, ramp: [0xffe9a8, 0xffe9a8, 0xffe9a8], emissive: 0x241804 });
  const b = new Bucket();
  b.add(footM, box(0.36, 0.2, 0.36, 0, 0, 0));
  b.add(ironM, box(1.5 * DU, H - 0.75, 1.5 * DU, 0, 0.2, 0));
  // 灯笼：帽（比灯面宽一纹素）+ 底托
  b.add(ironM, box(0.5, DU, 0.5, 0, H - 0.12, 0));
  b.add(ironM, box(0.3, DU, 0.3, 0, H - 0.58, 0));
  b.build(ctx.mats, g);
  const lb = new Bucket();
  lb.add(off, box(0.36, 0.36, 0.36, 0, H - 0.49, 0));
  const [glass] = lb.build(ctx.mats, g);
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = false;
  });
  g.userData.night = nightLight(g, {
    glow: [[glass, off, on]],
    spots: [{ at: [0, 0, 0.3], r: 2.8, h: H + 0.3, c: LAMP_AMBER, k: 0.85 }],
  });
  return g;
}

// string-lights：一条自己立着的小灯串（第三轮，夜景用；露台、摊位边）。两根 2.7 米的细杆，中间一条下垂 0.4 米的线，每 0.6 米一颗灯泡。
// 沿本地 x 摆，原点 = 中点的地面。变体 = 长度：0 → 6 米，1 → 8 米，2 → 10 米。线和灯泡都不投影。
// userData.night：天黑灯泡换自发光的暖黄，线下面每 2.6 米一个半径 2.4 米的光斑（连成一条暖光带）。
import * as THREE from 'three';
import { LAMP_AMBER, nightLight } from '../daylight/night';
import { Bucket, box, DU, FACING, type NetCtx } from './nets/kit';

const POLE = 2.7;
const SAG = 0.4;
const LEN = [6, 8, 10];

export function build(ctx: NetCtx): THREE.Object3D {
  const g = new THREE.Group();
  g.name = 'string-lights';
  const L = LEN[ctx.variant % LEN.length];
  const ironM = ctx.mat('ironwork', { ...FACING, convex: 0.4, edge: 0.4 });
  const wireM = ctx.mat('ironwork', { lightUp: 1, bands: [-2, -2], noShadowReceive: true, edge: 0.2, convex: 0 });
  const bulb = { bands: [-2, -1.5] as [number, number], edge: 0.2, convex: 0, noShadowReceive: true };
  const off = ctx.mat('clothWhite', bulb);
  const on = ctx.mat('clothWhite', { ...bulb, ramp: [0xffe08a, 0xffe08a, 0xffe08a], emissive: 0x241804 });
  const b = new Bucket();
  for (const sx of [-1, 1]) {
    b.add(ironM, box(1.2 * DU, POLE, 1.2 * DU, (sx * L) / 2, 0, 0));
    b.add(ironM, box(0.3, 0.12, 0.3, (sx * L) / 2, 0, 0));
  }
  // 线：一截截 1 纹素粗的小段，沿抛物线下垂
  const n = Math.round(L / 0.6);
  const yAt = (t: number) => POLE - 0.08 - SAG * 4 * t * (1 - t);
  const bulbs = new Bucket();
  for (let i = 0; i < n; i++) {
    const t0 = i / n;
    const t1 = (i + 1) / n;
    const x0 = (t0 - 0.5) * L;
    const x1 = (t1 - 0.5) * L;
    const y = (yAt(t0) + yAt(t1)) / 2;
    b.add(wireM, box(x1 - x0, DU * 0.7, DU * 0.7, (x0 + x1) / 2, y, 0));
    if (i > 0) bulbs.add(off, box(2 * DU, 2 * DU, 2 * DU, x0, yAt(t0) - 2.4 * DU, 0));
  }
  b.build(ctx.mats, g);
  const [bulbMesh] = bulbs.build(ctx.mats, g);
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = false;
      o.receiveShadow = false;
    }
  });
  const m = Math.max(2, Math.round(L / 2.6));
  const spots = Array.from({ length: m }, (_, i) => ({
    at: [((i + 0.5) / m - 0.5) * L, 0, 0.2] as [number, number, number],
    r: 2.4,
    h: POLE + 0.3,
    c: LAMP_AMBER,
    k: 0.8,
  }));
  g.userData.night = nightLight(g, { glow: [[bulbMesh, off, on]], spots });
  return g;
}

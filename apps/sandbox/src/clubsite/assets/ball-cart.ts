// 教练的球车：腰高的金属筐（口朝上、里面是暗底）架在四条腿上，后腿下两个小轮，后面一根推把；筐里堆满荧光球，冒尖。
// 0.6 × 1.45 × 0.6 米（含冒尖的球）。球直径 0.22 米 ≈ 2.4 纹素，不接投影。
// 画廊：desert3d-v2.html?asset=ball-cart（&count=0..60）
// userData.setCount(n)：0..60，球从堆尖往下少（最多 36 个看得见的球，按比例）。
// 本地：原点 = 车底中心，筐口朝 +y，推把在 −z。教练喂球时站在它 −x 一侧（车在教练的左手边）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { BaseCtx as AssetCtx } from '../render/ctx';
import { blobNormals } from '../render/toon';
import { METAL_TONES, paint } from './bench/mats';

export const CART_MAX = 60;
/** 筐口高度（教练左手探进去的高度） */
export const CART_RIM_Y = 0.92;

const PROP = { lightUp: 0.5, bands: [-0.45, 0.5] as [number, number] };

function box(w: number, h: number, d: number, x: number, y: number, z: number) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}
function ball(r: number, x: number, y: number, z: number) {
  const g = new THREE.IcosahedronGeometry(r, 0);
  g.deleteAttribute('uv');
  g.translate(x, y, z);
  return blobNormals(g, new THREE.Vector3(x, y, z));
}

export function build(ctx: AssetCtx): THREE.Object3D {
  const rnd = ctx.rng('ball-cart:heap');
  const root = new THREE.Group();
  root.name = 'ball-cart';
  // 筐：内腔 0.48 × 0.42，壁厚 0.09（整 1 纹素），底 y = 0.5，口 y = CART_RIM_Y
  const W = 0.48;
  const D = 0.42;
  const T = 0.09;
  const Y0 = 0.5;
  const Y1 = CART_RIM_Y;
  const H = Y1 - Y0;
  const metal: THREE.BufferGeometry[] = [
    box(W + 2 * T, H, T, 0, Y0 + H / 2, D / 2 + T / 2),
    box(W + 2 * T, H, T, 0, Y0 + H / 2, -D / 2 - T / 2),
    box(T, H, D, W / 2 + T / 2, Y0 + H / 2, 0),
    box(T, H, D, -W / 2 - T / 2, Y0 + H / 2, 0),
    // 口沿一圈外凸的箍（2 纹素高，亮顶）
    box(W + 2 * T + 0.09, 0.14, T + 0.05, 0, Y1 - 0.05, D / 2 + T / 2),
    box(W + 2 * T + 0.09, 0.14, T + 0.05, 0, Y1 - 0.05, -D / 2 - T / 2),
    box(T + 0.05, 0.14, D, W / 2 + T / 2, Y1 - 0.05, 0),
    box(T + 0.05, 0.14, D, -W / 2 - T / 2, Y1 - 0.05, 0),
  ];
  // 腿：四条 0.14 粗（1.5 纹素；侧面两两连一根底横档，读成一个架子）
  const lx = W / 2 + T / 2;
  const lz = D / 2 + T / 2;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) metal.push(box(0.14, Y0, 0.14, sx * lx, Y0 / 2, sz * lz));
    metal.push(box(0.12, 0.1, D + 2 * T, sx * lx, 0.2, 0));
  }
  // 推把：后面两根立柱往上到 1.1 米，顶上一根横把
  for (const sx of [-1, 1]) metal.push(box(0.1, 0.32, 0.1, sx * (W / 2), Y1 + 0.12, -lz - 0.02));
  metal.push(box(W + 0.1, 0.1, 0.12, 0, Y1 + 0.28, -lz - 0.02));
  // 材质规范 v2：筐壁是平的漆面 → 很轻的有机深浅（差 6～8），不画擦痕；球车会被推着走 → local（图案跟着车，不游）
  root.add(
    new THREE.Mesh(
      mergeGeometries(metal),
      ctx.mat('metal', { ...PROP, elem: { ...paint([5, 4], [0, 0], 8), space: 'local' }, tones: METAL_TONES }),
    ),
  );

  // 筐底：暗靛（球少了露出来的"筐里面"）
  root.add(new THREE.Mesh(box(W, 0.06, D, 0, Y0 + 0.03, 0), ctx.mat('net', { ...PROP, edge: 0.2, convex: 0 })));
  // 两个小轮（后腿下，深色胶轮，侧面朝外）
  {
    const gs = [-1, 1].map((sx) => {
      const g = new THREE.CylinderGeometry(0.12, 0.12, 0.12, 10, 1);
      g.rotateZ(Math.PI / 2);
      g.translate(sx * (lx + 0.11), 0.12, -lz);
      blobNormals(g, new THREE.Vector3(sx * (lx + 0.11), 0.12, -lz));
      return g;
    });
    root.add(new THREE.Mesh(mergeGeometries(gs), ctx.mat('hair', { ...PROP, edge: 0.4, convex: 0.2 })));
  }

  // 球：一层层从底往上（setCount 只画前 k 个 → 少了是堆尖先没）
  const R = 0.11;
  const pts: THREE.Vector3[] = [];
  const layer = (y: number, nx: number, nz: number, sx: number, sz: number) => {
    const row: THREE.Vector3[] = [];
    for (let i = 0; i < nx; i++)
      for (let k = 0; k < nz; k++)
        row.push(
          new THREE.Vector3(
            (i - (nx - 1) / 2) * sx + (rnd() - 0.5) * 0.03,
            y + (rnd() - 0.5) * 0.03,
            (k - (nz - 1) / 2) * sz + (rnd() - 0.5) * 0.03,
          ),
        );
    pts.push(...row);
  };
  layer(Y0 + 0.13, 3, 3, 0.16, 0.14);
  layer(Y0 + 0.3, 3, 3, 0.16, 0.14);
  layer(Y1 + 0.02, 3, 3, 0.17, 0.15);
  layer(Y1 + 0.16, 3, 2, 0.16, 0.16);
  layer(Y1 + 0.3, 2, 1, 0.17, 0);
  layer(Y1 + 0.42, 1, 1, 0, 0);
  const geo = mergeGeometries(pts.map((p) => ball(R, p.x, p.y, p.z)));
  const per = geo.getAttribute('position').count / pts.length;
  const balls = new THREE.Mesh(geo, ctx.mat('ball', { lightUp: 0.5, bands: [-0.3, 0.45], noShadowReceive: true }));
  root.add(balls);
  const setCount = (n: number) => {
    const k = Math.round((THREE.MathUtils.clamp(n, 0, CART_MAX) / CART_MAX) * pts.length);
    geo.setDrawRange(0, k * per);
    balls.visible = k > 0;
  };
  root.userData.setCount = setCount;
  const q = ctx.params.get('count');
  setCount(q !== null ? Number(q) : CART_MAX);
  ctx.mats.prepare(root);
  return root;
}

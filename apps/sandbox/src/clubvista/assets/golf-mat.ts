// 练习打位：一块 1.5 × 1.5 的人工草垫（深一档的球道绿，四周一圈 1 纹素的深色包边）+ 垫上一个橡胶球托（一颗白球坐在上面）
// + 垫子西北角一筐球（深色铁丝筐、里面堆着一层白球）+ 筐边地上散着两三颗。
// v0 = 整套；v1 = 只有垫子和球托（筐被拿走了 —— 一排打位不要每个都一样）。本地原点 = 垫子中心的地面；打的方向 = +x（东）。
// 垫子是平的大面：安静（不加元素）；白球是这一块唯一的亮点。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

const T = 0.09;
const PROP = { lightUp: 0.45, bands: [-0.45, 0.45] as [number, number] };

function box(w: number, h: number, d: number, x: number, y: number, z: number) {
  return new THREE.BoxGeometry(w, h, d).translate(x, y, z);
}

/** 一颗球：小八面体（屏幕上 1～2 纹素的白点） */
const ball = (x: number, y: number, z: number) => new THREE.IcosahedronGeometry(0.055, 0).translate(x, y + 0.05, z);

export function build(ctx: AssetCtx): THREE.Object3D {
  const g = new THREE.Group();
  g.name = 'golf-mat';
  const S = 1.5;
  const th = 0.04;

  // 包边（深色，整块）+ 草面（往里缩 1 纹素、高一点点）
  g.add(new THREE.Mesh(box(S, th, S, 0, th / 2, 0), ctx.mat('ironwork', { edge: 0.2, convex: 0 })));
  g.add(new THREE.Mesh(box(S - 2 * T, 0.02, S - 2 * T, 0, th + 0.01, 0), ctx.mat('lawn', { edge: 0, convex: 0 })));
  // 打击区：中间一条浅一档的长条（垫子磨亮的那一道，顺 x）
  g.add(
    new THREE.Mesh(box(S - 5 * T, 0.02, 3 * T, 0, th + 0.014, 0.12), ctx.mat('lawnStripe', { edge: 0, convex: 0 })),
  );

  // 球托 + 球
  g.add(new THREE.Mesh(box(0.08, 0.06, 0.08, 0.1, th + 0.04, 0.12), ctx.mat('ironwork', PROP)));
  const balls: THREE.BufferGeometry[] = [ball(0.1, th + 0.06, 0.12)];

  if (ctx.variant % 2 === 0) {
    // 一筐球：铁丝筐（四面矮墙，顶开口）在垫子西北角外
    const bx = -S / 2 + 0.05;
    const bz = -S / 2 + 0.05;
    const w = 0.42;
    const h = 0.24;
    const wall = 0.04;
    const basket: THREE.BufferGeometry[] = [
      box(w, h, wall, bx, h / 2, bz - w / 2 + wall / 2),
      box(w, h, wall, bx, h / 2, bz + w / 2 - wall / 2),
      box(wall, h, w, bx - w / 2 + wall / 2, h / 2, bz),
      box(wall, h, w, bx + w / 2 - wall / 2, h / 2, bz),
      box(w, 0.03, w, bx, 0.015, bz),
      // 提手：一根横梁
      box(wall, 0.04, w, bx, h + 0.12, bz),
      box(wall, 0.14, wall, bx, h + 0.05, bz - w / 2 + wall / 2),
      box(wall, 0.14, wall, bx, h + 0.05, bz + w / 2 - wall / 2),
    ];
    g.add(new THREE.Mesh(mergeGeometries(basket), ctx.mat('ironwork', { ...PROP, edge: 0.3, convex: 0.2 })));
    // 筐里堆着的一层球（3 × 3，中间高一点）+ 筐边散着的
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++)
        balls.push(ball(bx - 0.12 + i * 0.12, h - 0.06 + (i === 1 && j === 1 ? 0.04 : 0), bz - 0.12 + j * 0.12));
    balls.push(ball(bx + 0.36, th, bz + 0.3), ball(0.45, th, -0.3), ball(-0.2, th, 0.5));
  }
  g.add(new THREE.Mesh(mergeGeometries(balls), ctx.mat('clothWhite', { ...PROP, edge: 0.2, convex: 0.3 })));

  ctx.mats.prepare(g, { receive: false });
  return g;
}

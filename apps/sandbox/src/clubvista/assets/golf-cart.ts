// 高尔夫球车：奶白车身（cartBody）、前面一个圆鼻子的车头罩、一排深色座椅、顶上一块平的篷（奶白底 + 三条俱乐部蓝的宽条纹，
// 前后各垂下 1 纹素的檐），四根深色细柱撑着；车尾一个放球包的架子（场景里另摆 golf-bag），四个胖轮子。
// 2.4 × 1.9 × 1.2 米（长边沿 x，车头朝 +x）。本地原点 = 脚印中心的地面。
// 篷是顶上最大的一块平面：大、安静；条纹顺着车长方向（俯视 45° 下是三道蓝）。柱子朝镜头那面 lightUp（不然是一根根黑条）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

const T = 0.09;
const PROP = { lightUp: 0.5, bands: [-0.45, 0.45] as [number, number] };
const FACE = { lightUp: 0.55, bands: [-0.45, 0.3] as [number, number], noShadowReceive: true };

function box(w: number, h: number, d: number, x: number, y: number, z: number) {
  return new THREE.BoxGeometry(w, h, d).translate(x, y, z);
}

export function build(ctx: AssetCtx): THREE.Object3D {
  const g = new THREE.Group();
  g.name = 'golf-cart';
  const L = 2.3;
  const W = 1.16;
  const wheelR = 0.22;
  const deckY = 0.42;

  // ── 车身：底盘一整块（地台）+ 车头罩（前面圆的一截）+ 两侧挡泥板 ──
  const body: THREE.BufferGeometry[] = [
    box(L - 0.2, 0.22, W, -0.05, deckY - 0.05, 0),
    // 车头罩：高一截、前端圆（半个横放的圆柱）
    box(0.5, 0.3, W - 0.08, L / 2 - 0.45, deckY + 0.2, 0),
    new THREE.CylinderGeometry(0.3, 0.3, W - 0.08, 12, 1, false, 0, Math.PI)
      .rotateX(Math.PI / 2)
      .rotateZ(-Math.PI / 2)
      .translate(L / 2 - 0.2, deckY + 0.05, 0),
    // 座椅下的箱子（座椅的底座）
    box(0.62, 0.3, W - 0.06, -0.12, deckY + 0.2, 0),
  ];
  g.add(new THREE.Mesh(mergeGeometries(body), ctx.mat('cartBody', { ...PROP, edge: 0.5, convex: 0.3 })));

  // ── 座椅：坐垫 + 靠背（深色），方向盘一根斜杆 + 一个圈 ──
  const seat: THREE.BufferGeometry[] = [
    box(0.56, 0.1, W - 0.14, -0.1, deckY + 0.4, 0),
    box(0.12, 0.42, W - 0.14, -0.4, deckY + 0.62, 0),
  ];
  g.add(new THREE.Mesh(mergeGeometries(seat), ctx.mat('seat', { ...PROP, edge: 0.4, convex: 0.3 })));

  const dark: THREE.BufferGeometry[] = [
    // 方向盘：斜杆 + 盘
    box(0.05, 0.5, 0.05, 0, 0.25, 0)
      .rotateZ(0.5)
      .translate(0.42, deckY + 0.3, 0.26),
    new THREE.TorusGeometry(0.13, 0.03, 4, 10)
      .rotateY(Math.PI / 2)
      .rotateZ(0.5)
      .translate(0.32, deckY + 0.58, 0.26),
    // 篷的四根柱子（前两根斜一点，挡风玻璃那样）
    box(0.06, 1.2, 0.06, L / 2 - 0.62, deckY + 0.78, W / 2 - 0.06),
    box(0.06, 1.2, 0.06, L / 2 - 0.62, deckY + 0.78, -W / 2 + 0.06),
    box(0.06, 1.2, 0.06, -L / 2 + 0.42, deckY + 0.78, W / 2 - 0.06),
    box(0.06, 1.2, 0.06, -L / 2 + 0.42, deckY + 0.78, -W / 2 + 0.06),
    // 车尾的球包架（一个矮框）
    box(0.06, 0.4, W - 0.2, -L / 2 + 0.12, deckY + 0.2, 0),
    box(0.3, 0.06, W - 0.2, -L / 2 + 0.24, deckY + 0.42, 0),
    // 前后保险杠
    box(0.08, 0.1, W - 0.1, L / 2 + 0.06, deckY - 0.12, 0),
    box(0.08, 0.1, W - 0.1, -L / 2 + 0.02, deckY - 0.12, 0),
  ];
  g.add(new THREE.Mesh(mergeGeometries(dark), ctx.mat('ironwork', { ...FACE, convex: 0.2 })));

  // ── 轮子：四个胖圆柱（轴沿 z），露在车身外 1 纹素 ──
  const wheels: THREE.BufferGeometry[] = [];
  for (const x of [L / 2 - 0.42, -L / 2 + 0.42])
    for (const sz of [-1, 1])
      wheels.push(
        new THREE.CylinderGeometry(wheelR, wheelR, 0.2, 10)
          .rotateX(Math.PI / 2)
          .translate(x, wheelR, sz * (W / 2 - 0.06)),
      );
  g.add(new THREE.Mesh(mergeGeometries(wheels), ctx.mat('rubber', { ...PROP, convex: 0.3 })));

  // ── 篷：奶白底板（比车身短，车头罩和车尾的架子露出来）+ 两条长边各一道 1 纹素的蓝檐（第 2 版：三条蓝条纹让整辆车读成一个条纹小摊）──
  const roofY = deckY + 1.32;
  const rl = L - 0.6;
  const rw = W + 0.1;
  const roof: THREE.BufferGeometry[] = [
    box(rl, 0.06, rw, 0.05, roofY, 0),
    box(T, 0.16, rw, 0.05 + rl / 2 - T / 2, roofY - 0.1, 0),
    box(T, 0.16, rw, 0.05 - rl / 2 + T / 2, roofY - 0.1, 0),
  ];
  g.add(new THREE.Mesh(mergeGeometries(roof), ctx.mat('cartBody', { ...PROP, edge: 0.5, convex: 0.2 })));

  const stripes: THREE.BufferGeometry[] = [];
  for (const z of [-rw / 2 + T / 2, rw / 2 - T / 2]) stripes.push(box(rl, 0.14, T, 0.05, roofY - 0.06, z));
  g.add(new THREE.Mesh(mergeGeometries(stripes), ctx.mat('canvasStripe', { ...PROP, edge: 0, convex: 0 })));

  ctx.mats.prepare(g, { receive: false });
  return g;
}

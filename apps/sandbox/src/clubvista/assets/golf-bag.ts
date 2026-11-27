// 高尔夫球包（支架包）：一个立着的胖圆筒，往后斜，两条细支架腿往后撑地；包口一圈深色，露出 4 根球杆头（金属）
// 和 2 个毛线杆头套（圆球）。包身三变体：v0 俱乐部蓝 clothBlue、v1 奶白 cartBody、v2 柜台深蓝 counter；
// 中段一条白带（奶白的包是蓝带）+ 一侧一条深色背带。≈ 0.36 × 1.15 米。本地原点 = 包底中心的地面，包往 −z（远离镜头）斜。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';
import type { Pal } from '../palette';

const BODY: (keyof Pal)[] = ['clothBlue', 'cartBody', 'counter'];
const PROP = { lightUp: 0.4, bands: [-0.45, 0.45] as [number, number] };

function box(w: number, h: number, d: number, x: number, y: number, z: number) {
  return new THREE.BoxGeometry(w, h, d).translate(x, y, z);
}

export function build(ctx: AssetCtx): THREE.Object3D {
  const root = new THREE.Group();
  root.name = 'golf-bag';
  const v = ctx.variant % BODY.length;
  const g = new THREE.Group();
  g.rotation.x = -0.25; // 往后（−z）斜
  root.add(g);
  const r = 0.17;
  const L = 0.86;

  // 包身：圆筒，中段一条带，包口、包底一圈深色
  const body = new THREE.CylinderGeometry(r, r * 0.94, L, 10).translate(0, L / 2 + 0.04, 0);
  g.add(new THREE.Mesh(body, ctx.mat(BODY[v], { ...PROP, edge: 0.4, convex: 0.35 })));
  const band = new THREE.CylinderGeometry(r + 0.012, r + 0.012, 0.12, 10, 1, true).translate(0, L * 0.45, 0);
  g.add(new THREE.Mesh(band, ctx.mat(v === 1 ? 'clothBlue' : 'clothWhite', { ...PROP, convex: 0.35 })));
  const dark: THREE.BufferGeometry[] = [
    new THREE.CylinderGeometry(r + 0.02, r + 0.02, 0.1, 10).translate(0, L + 0.04, 0),
    new THREE.CylinderGeometry(r * 0.96, r * 0.96, 0.08, 10).translate(0, 0.04, 0),
    // 背带：朝东一侧一条（屏幕上一道竖的暗线）
    box(0.05, L * 0.62, 0.07, r + 0.02, L * 0.52, 0.02),
  ];
  g.add(new THREE.Mesh(mergeGeometries(dark), ctx.mat('ironwork', { ...PROP, convex: 0.3 })));

  // 球杆：4 根杆颈 + 杆头（金属的小块，往外歪一点）
  const heads: THREE.BufferGeometry[] = [];
  const tops: [number, number, number][] = [
    [-0.08, 0.05, 0.3],
    [0.02, 0.09, -0.2],
    [0.09, -0.04, 0.1],
    [-0.02, -0.08, -0.35],
  ];
  for (const [x, z, a] of tops) {
    heads.push(box(0.045, 0.22, 0.045, x, L + 0.15, z).rotateY(a));
    heads.push(box(0.15, 0.06, 0.08, x + 0.04, L + 0.28, z).rotateY(a));
  }
  g.add(new THREE.Mesh(mergeGeometries(heads), ctx.mat('metal', { ...PROP, edge: 0.3, convex: 0.2 })));
  // 两个毛线杆头套（圆球）
  const cover = (x: number, z: number, k: keyof Pal) =>
    new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.085, 0).translate(x, L + 0.2, z),
      ctx.mat(k, { ...PROP, convex: 0.4 }),
    );
  g.add(cover(0.08, 0.08, 'clothWhite'));
  g.add(cover(-0.09, -0.04, v === 0 ? 'counter' : 'clothBlue'));

  // 支架腿：两根细腿从包背中段往后撑到地上
  const legs: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1])
    legs.push(
      box(0.05, 0.7, 0.05, 0, 0.35, 0)
        .rotateX(0.55)
        .translate(sx * 0.12, 0, -0.3),
    );
  root.add(new THREE.Mesh(mergeGeometries(legs), ctx.mat('ironwork', PROP)));

  ctx.mats.prepare(root, { receive: false });
  return root;
}

// shop-dirty-cups：信号道具 —— 咖啡吧后段一张小圆桌上没收的脏杯子（放置点 y 0.75 = cafe-table 的桌面）。
// 尺寸 0.5 × 0.2 × 0.35 米（w × h × d）≈ 6 × 2 × 4 设计纹素（杯塔顶到 0.27）。
// 西边一摞叠起来的三只杯子（2 × 3 纹素的块，一只一行），东边一摞碟子（圆，3 纹素）上面还坐着一只喝剩的杯子（杯口一纹素咖啡），
// 前面桌面上一滩洒出来的咖啡（扁圆，棕）。杯碟是孔雀青的釉（jug 借 club 组调色：在柠檬黄的桌面上跳出来），
// 咖啡渍是拿铁棕（亮档 L ≈ 134，夹在釉面的顶 L 171 和立面 L 113 中间，不出强边缘）。全部不接投影。
// 三角形 60（画廊实测）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

type G = THREE.BufferGeometry;
/** BoxGeometry 的面序：+x −x +y −y +z −z；不建朝下、朝北（−z）的面（镜头在南上方，看不见） */
const NY = 3;
const NZ = 5;
function boxG(w: number, h: number, d: number, x: number, y: number, z: number): G {
  const g = new THREE.BoxGeometry(w, h, d);
  const src = g.getIndex()!.array;
  const keep: number[] = [];
  for (let f = 0; f < 6; f++) if (f !== NY && f !== NZ) for (let i = 0; i < 6; i++) keep.push(src[f * 6 + i]);
  g.setIndex(keep);
  g.clearGroups();
  return g.translate(x, y + h / 2, z);
}
/** 不建底面的圆柱（底在 y） */
const cyl = (r: number, h: number, seg: number, x: number, y: number, z: number): G =>
  new THREE.CylinderGeometry(r, r, h, seg, 1, true).translate(x, y + h / 2, z);
const disc = (r: number, seg: number, x: number, y: number, z: number): G =>
  new THREE.CircleGeometry(r, seg).rotateX(-Math.PI / 2).translate(x, y, z);

export function build(ctx: AssetCtx): THREE.Object3D {
  const glaze: G[] = [];
  const coffee: G[] = [];

  // 西：三只叠起来的杯子（每只 0.09 高）
  glaze.push(boxG(0.18, 0.27, 0.16, -0.14, 0, -0.06));
  // 东：一摞碟子（圆，上面一圈）+ 坐在上面的杯子，杯口里一纹素咖啡
  glaze.push(cyl(0.135, 0.07, 8, 0.11, 0, -0.03));
  glaze.push(disc(0.135, 8, 0.11, 0.07, -0.03));
  glaze.push(boxG(0.18, 0.12, 0.16, 0.11, 0.07, -0.04));
  coffee.push(disc(0.05, 6, 0.11, 0.191, -0.04));
  // 杯塔顶上的一圈咖啡渍
  coffee.push(disc(0.05, 6, -0.14, 0.271, -0.06));
  // 前面桌上洒的一滩
  coffee.push(
    new THREE.CircleGeometry(0.1, 8)
      .rotateX(-Math.PI / 2)
      .scale(1.4, 1, 0.8)
      .translate(0.0, 0.004, 0.09),
  );

  const root = new THREE.Group();
  root.name = 'shop-dirty-cups';
  const FACE = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number], noShadowReceive: true };
  // 孔雀青的釉：顶面亮档 L ≈ 171、朝镜头的立面中档 L ≈ 113（这件里的暗色就是杯子的立面）
  root.add(
    new THREE.Mesh(
      mergeGeometries(glaze),
      ctx.mat('jug', { ramp: [0x58c0d0, 0x2a80a8, 0x24508c], ...FACE, edge: 0.3, convex: 0.4 }),
    ),
  );
  // 咖啡渍：拿铁棕（亮档 L ≈ 134：和釉面顶差 < 60）
  root.add(
    new THREE.Mesh(
      mergeGeometries(coffee),
      ctx.mat('timber', { ramp: [0xc07a50, 0x9a5a44, 0x4e3054], ...FACE, edge: 0.1, convex: 0 }),
    ),
  );
  ctx.mats.prepare(root);
  return root;
}

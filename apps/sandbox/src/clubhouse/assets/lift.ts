// lift：电梯（钟楼里，rotY 东）和货梯（东翼，rotY 0），三层各一个。1.5 × 2.6 × 1.5 米（17 × 29 × 17 设计纹素）。
// 井：一个石灰水墙的方井（plaster，墙面元素同隔墙），顶上压一圈切墙顶的梅紫（wallCut，和剖面里切开的墙一个读法）+ 一块不锈钢检修盖
// （45° 从上面看：梅紫的框 + 灰的方块 = "井、封顶"）。+z 面：不锈钢门套（steel）+ 两扇黄铜门（brass，planks 0.5 米一扇 → 中缝）、
// 门头一块黄铜楼层灯牌（中间一点琥珀色的亮字）、门右边一个不锈钢呼梯按钮板。
// 朝镜头的门、灯牌：lightUp + 低 bands（落中档）、不接投影。三角形 76（井 12 + 顶框 12 + 检修盖 2 + 门套 12 + 门 12 + 灯牌 12 + 亮字 2 + 按钮板 12）。
import * as THREE from 'three';
import type { AssetCtx } from '../ctx';
import { EL } from '../palette';

const W = 1.5;
const H = 2.6;
const DOOR_W = 1.0;
const DOOR_H = 2.05;

export function build(ctx: AssetCtx): THREE.Object3D {
  const g = new THREE.Group();
  const face = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number], noShadowReceive: true };
  const add = (geo: THREE.BufferGeometry, m: THREE.Material) => g.add(new THREE.Mesh(geo, m));
  const z = W / 2;
  // 井
  add(new THREE.BoxGeometry(W, H, W).translate(0, H / 2, 0), ctx.mat('plaster', { elem: EL.plaster }));
  // 顶：梅紫框（切墙顶）+ 不锈钢检修盖
  add(
    new THREE.BoxGeometry(W + 0.06, 0.1, W + 0.06).translate(0, H + 0.05, 0),
    ctx.mat('wallCut', { elem: EL.wallCut }),
  );
  add(
    new THREE.PlaneGeometry(0.8, 0.8).rotateX(-Math.PI / 2).translate(0, H + 0.102, 0),
    ctx.mat('steel', { elem: { kind: 'planks', space: 'local', seam: 1, hi: 1, p: [0, 0, 1, 0.4], q: [1, 0, 0, 0] } }),
  );
  // 门套（不锈钢）
  add(
    new THREE.BoxGeometry(DOOR_W + 0.18, DOOR_H + 0.12, 0.05).translate(0, (DOOR_H + 0.12) / 2, z + 0.025),
    ctx.mat('steel', face),
  );
  // 门（两扇黄铜，planks 0.5 米一扇 → 中缝 + 缝后亮条）
  add(
    new THREE.BoxGeometry(DOOR_W, DOOR_H, 0.04).translate(0, DOOR_H / 2, z + 0.06),
    ctx.mat('brass', {
      ...face,
      elem: { kind: 'planks', space: 'local', seam: 1, hi: 1, p: [1, 0, 0, DOOR_W / 2], q: [1, 0, 0, 0] },
    }),
  );
  // 楼层灯牌（黄铜）+ 亮字（琥珀）
  add(new THREE.BoxGeometry(0.56, 0.24, 0.05).translate(0, DOOR_H + 0.16, z + 0.03), ctx.mat('brass', face));
  add(
    new THREE.PlaneGeometry(0.27, 0.12).translate(0, DOOR_H + 0.28, z + 0.057),
    ctx.mat('toolOrange', { ...face, emissive: 0x6a3410 }),
  );
  // 呼梯按钮板
  add(new THREE.BoxGeometry(0.1, 0.27, 0.04).translate(DOOR_W / 2 + 0.17, 1.0, z + 0.02), ctx.mat('steel', face));
  ctx.mats.prepare(g);
  return g;
}

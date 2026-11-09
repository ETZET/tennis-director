// #10 drill-kit：训练小件（青训西场）。本地原点 = 落地点中心（y 0），+x 朝东，+z 朝南。
// 变体（ctx.variant / 画廊 ?v=）：
//   0 三个目标锥（−0.45, 0）（0, −0.3）（0.45, 0）—— 橙色胖锥 + 一块方底座，在青蓝上是最跳的小颜色点之一
//   1 呼啦圈目标（平放，⌀ 0.9，圈宽 0.1 米 = 1× 下 2 纹素）—— 红
//   2 一排四个地标点（孩子排队站的位置）：沿 x 每 0.9 米一个（−1.35…1.35），⌀ 0.32 的圆片，红黄相间
//   3 一个锥（stage 3 摆来摆去用）
//   4 一个地标点（红）
// 锥：太阳在后上方，朝镜头的半边本来全落暗档 → 光往上偏、档位放宽，正面落中档、顶上亮；小件不接投影（规范），但要投影（小暗点让它站在地上）。
// 平放的圈和圆片：贴地（y 0.03～0.05：硬地场面是 y 0.02 的一块板，要压在它上面），接投影（同地面一起进影子），不投影。
// userData.cones() → [x, z][]（本地；目标锥的位置，喂球的落点）、userData.spots() → [x, z][]（地标点）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../world';

type V2 = [number, number];

/** 锥：底座 0.28 见方（3 设计纹素）、锥身 ⌀ 0.24 → ⌀ 0.06、高 0.3（顶上一截平头） */
function coneGeo(x: number, z: number): THREE.BufferGeometry {
  const base = new THREE.BoxGeometry(0.28, 0.035, 0.28).translate(x, 0.0175, z);
  const body = new THREE.CylinderGeometry(0.03, 0.12, 0.27, 8, 1, false)
    .rotateY(Math.PI / 8)
    .translate(x, 0.035 + 0.135, z);
  return mergeGeometries([base.toNonIndexed(), body.toNonIndexed()]);
}

/** 平放的圆片（地标点） */
function discGeo(x: number, z: number, r: number): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(r, r, 0.02, 14).translate(x, 0.04, z);
}

export function build(ctx: AssetCtx): THREE.Object3D {
  const g = new THREE.Group();
  g.name = 'drill-kit';
  const v = ctx.variant;
  const cones: V2[] =
    v === 0
      ? [
          [-0.45, 0],
          [0, -0.3],
          [0.45, 0],
        ]
      : v === 3
        ? [[0, 0]]
        : [];
  const spots: V2[] =
    v === 2
      ? [
          [-1.35, 0],
          [-0.45, 0],
          [0.45, 0],
          [1.35, 0],
        ]
      : v === 4
        ? [[0, 0]]
        : [];

  if (cones.length) {
    const m = new THREE.Mesh(
      mergeGeometries(cones.map(([x, z]) => coneGeo(x, z))),
      ctx.mat('toolOrange', { lightUp: 0.6, bands: [-0.6, -0.05], edge: 0.35, convex: 0.25, noShadowReceive: true }),
    );
    m.name = 'drill-kit:cones';
    g.add(m);
    ctx.mats.prepare(m, { cast: true, receive: false });
  }

  if (v === 1) {
    // 呼啦圈：一圈 0.1 米宽的扁环（顶面 + 一点厚度），红
    const ring = new THREE.RingGeometry(0.4, 0.5, 28, 1).rotateX(-Math.PI / 2).translate(0, 0.05, 0);
    const m = new THREE.Mesh(ring, ctx.mat('clothRed', { edge: 0.2, convex: 0 }));
    m.name = 'drill-kit:hoop';
    g.add(m);
    ctx.mats.prepare(m, { cast: false, receive: true });
  }

  if (spots.length) {
    // 红黄相间：每种颜色一个网格
    const by: Record<'clothRed' | 'flowerYellow', THREE.BufferGeometry[]> = { clothRed: [], flowerYellow: [] };
    spots.forEach(([x, z], i) => {
      by[i % 2 === 0 ? 'clothRed' : 'flowerYellow'].push(discGeo(x, z, 0.16));
    });
    for (const [key, geos] of Object.entries(by) as [keyof typeof by, THREE.BufferGeometry[]][]) {
      if (!geos.length) continue;
      const m = new THREE.Mesh(mergeGeometries(geos), ctx.mat(key, { edge: 0.2, convex: 0 }));
      m.name = `drill-kit:spots-${key}`;
      g.add(m);
      ctx.mats.prepare(m, { cast: false, receive: true });
    }
  }

  g.userData.cones = () => cones.map((p) => [...p] as V2);
  g.userData.spots = () => spots.map((p) => [...p] as V2);
  return g;
}

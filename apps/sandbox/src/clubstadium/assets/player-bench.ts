// #4 player-bench：球员席（网旁、广告板前）。两把带靠背的木椅 + 中间一只冰箱（饮料）+ 一把椅背上搭着一条毛巾、
// 冰箱盖上两瓶水。v0（西，球员 A）冰箱蓝（jug），v1（东，球员 B）冰箱红（clothRed），盖子同色、中间一道白箍；
// 毛巾搭在靠网那把椅子上（靠外那把在伞底下）。
// 椅子用木（timber，板条 planks）—— 身后就是俱乐部蓝的广告板，蓝椅子会糊进去；木色在蓝板前跳出来。
// 本地原点 = 球员席中心的地面，椅子面朝 +z（朝场地 / 镜头）。宽 1.8、高 1.05、深 0.6。
//
// userData.seats = [[x, y, z], …]：两把椅子的座心（本地，座面顶 0.5；人物 sit 默认座高 0.52）。
// userData.cooler = [x, y, z]：冰箱盖中心（换边时球童递水、总监补水的点）。
import * as THREE from 'three';
import type { AssetCtx } from '../world';
import { Bag, DU, FACE_MID, PROP, rod, V } from './court/kit';

const SEAT = 0.5;

export function build(ctx: AssetCtx): THREE.Object3D {
  const root = new THREE.Group();
  root.name = 'player-bench';
  const v = ((ctx.variant % 2) + 2) % 2;
  const plank = (axis: [number, number, number], w: number) =>
    ctx.mat('timber', {
      ...PROP,
      convex: 0.8,
      elem: { kind: 'planks', p: [axis[0], axis[1], axis[2], w], seam: 1, hi: 1, space: 'local' },
    });
  const seatWood = plank([0, 0, 1], 0.14);
  const backWood = ctx.mat('timber', {
    ...FACE_MID,
    convex: 0.8,
    elem: { kind: 'planks', p: [0, 1, 0, 0.15], seam: 1, hi: 1, space: 'local' },
  });
  const legs = ctx.mat('ironwork', { ...PROP, convex: 0.5 });
  const cooler = v === 0 ? ctx.mat('jug', { ...PROP, convex: 0.6 }) : ctx.mat('clothRed', { ...PROP, convex: 0.6 });
  const coolerFace =
    v === 0 ? ctx.mat('jug', { ...FACE_MID, convex: 0.6 }) : ctx.mat('clothRed', { ...FACE_MID, convex: 0.6 });
  const lid = cooler;
  const handle = ctx.mat('clothWhite', { ...PROP, convex: 0.6 });
  const towel = ctx.mat('clothWhite', { ...FACE_MID, convex: 0.3 });
  const stripe = ctx.mat('canvasStripe', { ...FACE_MID, convex: 0.3 });
  const bottle = ctx.mat('jug', { ...PROP, lightUp: 0.6, convex: 0.4 });

  const bag = new Bag();
  // ── 两把椅子：座 0.52 × 0.48、板厚 0.06，靠背 0.5 × 0.5（往后仰 8°），四条铁腿 ──
  const chairX = [-0.62, 0.62];
  for (const cx of chairX) {
    bag.box(seatWood, 0.54, 0.07, 0.48, cx, SEAT - 0.07, 0.04);
    // 靠背：两条竖撑 + 一块背板（背板下沿离座 0.1：中间露一条缝）
    for (const s of [-1, 1]) rod(bag, legs, V(cx + s * 0.23, SEAT - 0.04, -0.18), V(cx + s * 0.23, 1.05, -0.26), 0.07);
    bag.box(backWood, 0.54, 0.42, 0.06, cx, 0.6, -0.22, -0.14);
    // 腿：前两条直、后两条略往后撇
    for (const s of [-1, 1]) {
      bag.box(legs, 0.07, SEAT - 0.07, 0.07, cx + s * 0.22, 0, 0.24);
      rod(bag, legs, V(cx + s * 0.22, 0, -0.22), V(cx + s * 0.22, SEAT - 0.07, -0.16), 0.07);
    }
    // 腿之间一根横撑（朝镜头，读出"四条腿的椅子"）
    bag.box(legs, 0.44, 0.06, 0.05, cx, 0.16, 0.24);
  }
  // ── 冰箱（中间，0.42 宽 × 0.44 高）：箱体 + 白盖 + 盖沿一圈 + 正面一条白带（把手），盖上两瓶水 ──
  bag.box(cooler, 0.46, 0.4, 0.4, 0, 0, 0.06);
  bag.add(coolerFace, new THREE.PlaneGeometry(0.46, 0.4).translate(0, 0.2, 0.261));
  bag.box(lid, 0.5, 0.09, 0.44, 0, 0.4, 0.06);
  bag.box(handle, 0.5, 0.05, 0.45, 0, 0.36, 0.06);
  bag.box(handle, 0.22, 0.06, 0.03, 0, 0.26, 0.275);
  for (const [bx, bz] of [
    [-0.08, 0.02],
    [0.1, 0.1],
  ])
    bag.add(bottle, new THREE.CylinderGeometry(0.06, 0.06, 0.26, 6).translate(bx, 0.49 + 0.13, bz));
  // ── 毛巾：搭在靠网那把椅子的靠背上（靠外那把在伞底下，看不见）（正面垂下 0.34、背面垂下 0.2），白底一条蓝条 ──
  const tx = chairX[v === 0 ? 1 : 0] + (v === 0 ? 0.05 : -0.05);
  const TW = 4 * DU;
  bag.box(towel, TW, 0.05, 0.12, tx, 1.0, -0.25);
  bag.box(towel, TW, 0.34, 0.04, tx, 0.68, -0.17, -0.14);
  bag.box(stripe, TW + 0.004, 0.08, 0.044, tx, 0.74, -0.168, -0.14);
  bag.box(towel, TW, 0.2, 0.04, tx, 0.82, -0.31, 0.14);
  bag.into(root);

  root.userData.seats = chairX.map((x) => [x, SEAT, 0.04]);
  root.userData.cooler = [0, 0.49, 0.06];
  ctx.mats.prepare(root);
  return root;
}

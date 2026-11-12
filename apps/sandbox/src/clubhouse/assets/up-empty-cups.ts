// 活的信号：茶几上的两只空杯（该收了）。0.5 × 0.14 × 0.3 米（6 × 2 × 3 设计纹素），放在茶几面上（slot y = 楼板 + 0.42）。
// 西边一只奶白的杯子搁在塔拉韦拉蓝的碟子上，东边一只直接放在桌上（把手朝镜头右边）。
// 杯口朝上能看到：杯口（亮）+ 中间 1 纹素 × 1 屏幕行的咖啡渍（棕，比杯口暗 < 60）= "空杯"。六边的杯身、碟子（棱朝镜头）。
// 奶白的瓷本色就灰（饱和度目标按瓷器 ≥ 0.30）：靠蓝碟拉上去。三角形 60（碟 18、两杯各 18、两块渍各 2、把手 2）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

/** 六边的杯身 / 碟身（开口）+ 顶面一块 */
function vessel(
  rt: number,
  rb: number,
  h: number,
  x: number,
  y: number,
  z: number,
): [THREE.BufferGeometry, THREE.BufferGeometry] {
  const side = new THREE.CylinderGeometry(rt, rb, h, 6, 1, true).translate(x, y + h / 2, z);
  const top = new THREE.CircleGeometry(rt, 6)
    .rotateX(-Math.PI / 2)
    .rotateY(Math.PI / 2)
    .translate(x, y + h, z);
  return [side, top];
}

export function build(ctx: AssetCtx): THREE.Object3D {
  const g = new THREE.Group();
  const add = (gs: THREE.BufferGeometry[], m: THREE.Material) =>
    g.add(new THREE.Mesh(gs.length > 1 ? mergeGeometries(gs) : gs[0], m));
  const face = {
    tones: undefined,
    lightUp: 0.55,
    bands: [-0.45, 0.35] as [number, number],
    noShadowReceive: true,
    edge: 0.5,
    convex: 0.3,
  };

  // 碟：r 0.15、厚 0.03
  const SH = 0.03;
  const [sSide, sTop] = vessel(0.15, 0.12, SH, -0.1, 0, 0);
  add([sSide, sTop], ctx.mat('talavera', { ...face, ramp: [0x3e72d8, 0x2e54b0, 0x243878] }));

  // 两只杯：口 r 0.1、底 r 0.075、高 0.11
  const RT = 0.1;
  const RB = 0.075;
  const CH = 0.11;
  const [aSide, aTop] = vessel(RT, RB, CH, -0.1, SH, -0.01);
  const [bSide, bTop] = vessel(RT, RB, CH, 0.15, 0, 0.03);
  const cream = ctx.mat('clothWhite', { ...face, ramp: [0xe0c8b0, 0xb89c98, 0x7a6090] });
  add([aSide, aTop, bSide, bTop], cream);
  // 把手：东边那只杯子右侧一块（1 纹素 × 1 屏幕行，朝镜头）
  const T = ctx.texel;
  const R = T / Math.SQRT1_2;
  add([new THREE.PlaneGeometry(T * 0.8, R * 0.6).translate(0.15 + RT + T * 0.3, CH * 0.55, 0.03 + 0.02)], cream);

  // 杯底的咖啡渍：杯口里一块四边形（棕，L ≈ 145）
  const dreg = (x: number, y: number, z: number) =>
    new THREE.PlaneGeometry(T, R).rotateX(-Math.PI / 2).translate(x, y + 0.003, z);
  add(
    [dreg(-0.1, SH + CH, -0.01), dreg(0.15, CH, 0.03)],
    ctx.mat('wood', { ...face, edge: 0, convex: 0, ramp: [0xc89060, 0xa06a58, 0x5e426e] }),
  );

  ctx.mats.prepare(g, { cast: false, receive: false });
  return g;
}

// #17 festoon：一条串灯（从凉棚北梁拉到餐车车顶前沿；场景里三条）。
// 两头都是世界坐标：main.ts 调 obj.userData.setEnds(a, b)（THREE.Vector3；a = 这个物体之后会被放到的位置），
// 本地画 0 → (b − a)，不旋转。下垂 0.45 米（中间最低）；每 0.5 米一颗灯泡（2 纹素，bulb，instanced）；
// 线 1 纹素（ironwork 亮档，四面管子没有端盖；在每颗灯泡那儿断开，灯泡不被自己的线劈开），不接收投影；线和灯泡都不投影（细线的影子在地上是一串噪点）。
// 没调 setEnds 之前（画廊）：a = (0, 2.5, 0) → b = (0, 2.5, −4.5)（往北 4.5 米、两头同高，抬到 2.5 米看）。
// userData：
//   setEnds(a, b)  两头的世界坐标（a 是物体原点），重画线和灯泡
//   setLit(k)      0..1：傍晚亮灯（k 0 = 白天的暖白玻璃，1 = 全部 flowerYellow 亮档；中间按随机顺序一颗颗亮）
// 三角形：线（9 截 × 2 小段 × 4 面）= 144；灯泡 instanced（12 三角形 × 每条 ≈ 8 颗）另算。
import * as THREE from 'three';
import type { AssetCtx } from '../ctx';
import { bulbLights, stringLights } from './pergola';

const SAG = 0.45;
const STEP = 0.5;
/** 两颗灯泡之间几小段线 */
const SUB = 2;
/** 最多几颗灯泡（≈ 15 米） */
const CAP = 32;

export function build(ctx: AssetCtx): THREE.Object3D {
  const g = new THREE.Group();
  g.name = 'festoon';
  const wireMat = ctx.mat('ironwork', { lightUp: 1, bands: [-2, -2], noShadowReceive: true, edge: 0.3, convex: 0 });
  const wire = new THREE.Mesh(new THREE.BufferGeometry(), wireMat);
  wire.name = 'wire';
  wire.castShadow = false;
  wire.receiveShadow = false;
  g.add(wire);
  const lights = bulbLights(ctx, [], ctx.rng(`festoon:lit:${ctx.variant}`), CAP);
  g.add(lights.root);

  const draw = (a: THREE.Vector3, b: THREE.Vector3) => {
    wire.geometry.dispose();
    const sl = stringLights(a, b, SAG, STEP, SUB);
    wire.geometry = sl.geo;
    lights.place(sl.bulbs);
  };
  draw(new THREE.Vector3(0, 2.5, 0), new THREE.Vector3(0, 2.5, -4.5));

  g.userData.setEnds = (a: THREE.Vector3, b: THREE.Vector3) => draw(new THREE.Vector3(), b.clone().sub(a));
  g.userData.setLit = lights.setLit;
  if (ctx.params.has('lit')) lights.setLit(Number(ctx.params.get('lit')));
  return g;
}

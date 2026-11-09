// #5 drag-mat 拖垫：前面一根木拖杆（2.4 米，沿 z）+ 后面一块钢丝网垫（ironwork，四块板 = 屏幕上三道横缝，不画网眼）
// + 两根短绳从拖杆两端汇到一点，再一根拉绳搭到总监肩上 / 手里（草绳色 straw，0.08～0.09 米 = 1× 下稳定 2 纹素）。
// 拖着走的时候垫子后沿翻起一小溜浅土（clayDust 的几个土块）。
//
// 两个状态（同一份几何，只换变换和材质）：
//   'drag'（v0，SLOTS 的 drag-mat）：本地原点 = 垫子中心落地点；拖杆在 −x（朝总监，总监往西拉），垫子拖在 +x。
//   'hung'（v1）：挂在围网上。本地原点 = 围网脚（z 0 = 挡风布那一面），拖杆横着（沿 x）离地 2.15 米，垫子垂下来朝镜头，
//                 两根短绳往上汇到围网顶上的钩子（y 2.6），拉绳从钩子垂下来。
//
// userData（stage 3）：
//   state；setState('drag' | 'hung')
//   grip: Grip —— 拉绳的头（主手 / 肩）；axis 顺着绳指向垫子。只有一只手。
//   setRopeEnd(p: THREE.Vector3)：把拉绳的头挪到 p（本地坐标；拖场时每帧传"总监的肩 / 手"变到本地后的点）。
//   ropeEnd(): 现在拉绳头的位置（本地）
//   trailEdge(): 垫子后沿的两端（本地，'drag' 状态）—— 走过的这条线段 dust → brushed（court 的 drag()）、扬土 fx 从这里出
import * as THREE from 'three';
import { type Grip, Parts, perpUp, type V3 } from '../../clubsite/tools/kit';
import type { AssetCtx } from '../world';

type K = 'woodWeathered' | 'ironwork' | 'straw' | 'clayDust';

/** 拖杆长、垫子深（沿 x）、拖杆截面 */
const LEN = 2.4;
const MAT_D = 1.0;
const BAR: [number, number] = [0.2, 0.13];
const BAR_X = -MAT_D / 2 - BAR[0] / 2 + 0.02;
/** 绳汇合的点（'drag' 坐标） */
const JOIN: V3 = [-1.2, 0.22, 0];
/** 默认拉绳头：总监（slot 西边 2 米）的右肩，他朝西走 → 右肩在北边 */
const ROPE_END: V3 = [-1.82, 1.32, -0.16];

export function build(ctx: AssetCtx): THREE.Object3D {
  const p = new Parts<K>();
  // 垫子：四块板（planks 沿 z 每 0.6 米一块）→ 屏幕上三道横缝
  p.box('ironwork', MAT_D, 0.035, LEN - 0.1, 0, 0.018, 0);
  // 后沿的卷边（比垫子高一点：一条暗边收住垫子的形）
  p.box('ironwork', 0.07, 0.06, LEN - 0.1, MAT_D / 2 - 0.035, 0.03, 0);
  // 拖杆
  p.box('woodWeathered', BAR[0], BAR[1], LEN, BAR_X, BAR[1] / 2, 0);
  // 两根短绳：拖杆两端 → 汇合点
  for (const s of [-1, 1]) p.rod('straw', [BAR_X - 0.05, BAR[1] * 0.7, s * (LEN / 2 - 0.12)], JOIN, 0.08);
  // 汇合处的绳结（胖一点，读得出"绳从这里分开"）
  p.box('straw', 0.14, 0.1, 0.14, JOIN[0], JOIN[1], JOIN[2]);

  const matOpts = (k: K, facing: boolean) =>
    ctx.mat(k, {
      // 平躺的垫子接投影（总监、绳子的影子落在上面）；挂起来朝镜头的立面不接（自投影在竖面上是一排排点）
      noShadowReceive: k !== 'ironwork' || facing,
      // 垫子平躺时顶面朝上本来落亮档（L ~110，读成一块灰板）：档位整体抬高 → 顶面落中档，读成"深色的扁格子"
      ...(k === 'ironwork'
        ? {
            // 挂起来时板缝是竖的：不要缝后的亮划（一排排虚线 = 噪点），只留缝
            elem: { kind: 'planks', space: 'local', p: [0, 0, 1, 0.6], seam: 1, hi: facing ? 0 : 1, seed: 5 },
            ...(facing ? {} : { bands: [0.1, 0.9] as [number, number] }),
          }
        : {}),
      // 挂在围网上时垫子朝镜头：光往上偏 + 档位放宽 → 落中档（暗的挡风布前面读得出来）
      ...(facing ? { lightUp: 0.6, bands: [-0.4, 0.4] as [number, number] } : {}),
    });
  const tool = p.build((k) => matOpts(k as K, false), 'drag-mat');

  // 后沿翻起的浅土：几个扁土块，长短不一（只在 'drag' 状态）
  const dust = new Parts<'clayDust'>();
  const rng = ctx.rng('drag-mat:dust');
  let z = -LEN / 2 + 0.05;
  while (z < LEN / 2 - 0.15) {
    const l = 0.28 + rng() * 0.4;
    const w = 0.1 + rng() * 0.08;
    dust.box('clayDust', w, 0.04 + rng() * 0.03, Math.min(l, LEN / 2 - z), MAT_D / 2 + w / 2 + 0.01, 0.02, z + l / 2);
    z += l + 0.06 + rng() * 0.18;
  }
  const dustG = dust.build(() => ctx.mat('clayDust', { noShadowReceive: true }), 'drag-mat:dust');
  tool.add(dustG);

  // 拉绳：一根单位盒子，setRopeEnd 时缩放 + 转向（不重建几何）
  const rope = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), ctx.mat('straw', { noShadowReceive: true }));
  rope.name = 'drag-mat:rope';
  const root = new THREE.Group();
  root.name = 'drag-mat';
  root.add(tool, rope);
  ctx.mats.prepare(root);
  // 绳子、土块不投影（细线的投影 = 一条噪点线，和绳子交叉成"×"）
  root.traverse((o) => {
    if (o.name.endsWith(':straw') || o.name === 'drag-mat:rope' || o.name.startsWith('drag-mat:dust'))
      o.castShadow = false;
  });

  const ROT_HUNG = new THREE.Matrix4().makeBasis(
    new THREE.Vector3(0, -1, 0), // 'drag' 的 +x（拖杆 → 垫子后沿）→ 往下
    new THREE.Vector3(0, 0, 1), // 'drag' 的 +y（垫子顶面）→ 朝镜头
    new THREE.Vector3(-1, 0, 0), // 'drag' 的 +z → 西
  );
  const HUNG = new THREE.Matrix4().makeTranslation(0, BAR_X * -1 + 1.55, 0.1).multiply(ROT_HUNG);

  const end = new THREE.Vector3(...ROPE_END);
  const join = new THREE.Vector3(...JOIN);
  const tmpA = new THREE.Vector3();
  const setRopeEnd = (pt: THREE.Vector3) => {
    end.copy(pt);
    tmpA.copy(join).applyMatrix4(tool.matrix);
    const dir = end.clone().sub(tmpA);
    const len = Math.max(dir.length(), 0.01);
    rope.position.copy(tmpA).add(end).multiplyScalar(0.5);
    rope.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    rope.scale.set(0.09, len, 0.09);
    const axis = tmpA.clone().sub(end).normalize();
    const a: V3 = [axis.x, axis.y, axis.z];
    root.userData.grip = {
      at: [end.x, end.y, end.z],
      axis: a,
      up: perpUp(a),
      tip: [tmpA.x, tmpA.y, tmpA.z],
      pose: 'drag',
    } satisfies Grip;
  };

  const facingMats = new Map<THREE.Mesh, [THREE.Material, THREE.Material]>();
  tool.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const k = m.name.split(':').pop() as K;
    facingMats.set(m, [m.material as THREE.Material, matOpts(k, true)]);
  });

  const setState = (s: 'drag' | 'hung') => {
    root.userData.state = s;
    tool.matrix.identity();
    if (s === 'hung') tool.matrix.copy(HUNG);
    tool.matrix.decompose(tool.position, tool.quaternion, tool.scale);
    tool.updateMatrix();
    dustG.visible = s === 'drag';
    for (const [m, [a, b]] of facingMats) m.material = s === 'hung' ? b : a;
    if (s === 'hung') {
      // 钩子在汇合点（围网顶），拉绳从钩子垂下来、头搭回到半腰
      const j = join.clone().applyMatrix4(tool.matrix);
      setRopeEnd(new THREE.Vector3(j.x + 0.12, 1.15, j.z + 0.04));
    } else setRopeEnd(new THREE.Vector3(...ROPE_END));
  };

  root.userData.setState = setState;
  root.userData.setRopeEnd = setRopeEnd;
  root.userData.ropeEnd = () => end.clone();
  root.userData.trailEdge = () => [
    new THREE.Vector3(MAT_D / 2, 0, -LEN / 2).applyMatrix4(tool.matrix),
    new THREE.Vector3(MAT_D / 2, 0, LEN / 2).applyMatrix4(tool.matrix),
  ];
  root.userData.tool = tool;
  setState(ctx.variant === 1 ? 'hung' : 'drag');
  return root;
}

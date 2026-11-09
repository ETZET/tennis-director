// #6 leaf-cart 保洁车：两轮的深色铁架小推车，车上一只大落叶桶（工具橙 toolOrange —— 和吹叶机同一个橙，一眼读成"总监的工具"），
// 桶后插着一把扫帚（头朝上：草秆色的扫帚头）和一把落叶耙（金属漆的扇形耙头），桶前挂一只浇水壶（jug）。
// 本地坐标：桶 + 轮子在 +x，推把在 −x（SLOTS 里 rotY W：桶朝镜头、推把朝北）。
//
// 桶里的落叶（palmSkirt 枯叶色）跟着 setFill 变：0 = 空（桶口是一块深色的洞），越满桶口的枯叶面越大，
// ≥ 0.85 冒出桶沿堆成一个尖，再戳出两三片碎叶。
//
// userData（stage 3）：
//   setFill(f: 0..1)；fill
//   grip: Grip —— 推车：两只手握推把（pose 'push'）
//   tools: { broom, rake, can }：车上能拿下来的三件（各自 userData.grip，坐标 = 那件东西自己的；拿走 = 人物模块 reparent，
//          放回：cart.userData.stow('broom' | 'rake' | 'can') 回到车上的位置）
//     broom.grip：扫帚（自己的坐标：扫帚头在下、柄朝 +y），pose 'sweep'
//     rake.grip：耙子（同上），pose 'rake'
//     can.grip：浇水壶的提把，axis 指向壶嘴，pose 'pour'；can.userData.spout = 壶嘴口（浇水 fx 从这里出）
import * as THREE from 'three';
import { type Grip, Parts, type V3 } from '../../clubsite/tools/kit';
import type { AssetCtx } from '../ctx';

const BIN = { x: 0.16, y0: 0.24, r: 0.31, h: 0.7 };
const RIM_Y = BIN.y0 + BIN.h;
const SOFT = { lightUp: 0.45, bands: [-0.3, 0.35] as [number, number] };

export function build(ctx: AssetCtx): THREE.Object3D {
  const root = new THREE.Group();
  root.name = 'leaf-cart';
  const small = { noShadowReceive: true };

  // ── 车架 + 轮子 ──
  const f = new Parts<'ironwork' | 'metal'>();
  for (const s of [-1, 1]) {
    // 侧梁：轮轴 → 推把（一根直杆），中间一根腿落地
    f.rod('ironwork', [0.34, 0.2, s * 0.3], [-0.62, 0.88, s * 0.26], 0.08);
    f.rod('ironwork', [-0.2, 0.52, s * 0.29], [-0.28, 0.02, s * 0.29], 0.08);
    // 轮子（胖、深色）+ 轮毂
    f.cyl('ironwork', 0.21, 0.09, 12, 'z', 0.34, 0.21, s * 0.38);
    f.cyl('metal', 0.07, 0.1, 8, 'z', 0.34, 0.21, s * 0.39);
  }
  // 推把横杆、底板（桶坐在上面）、腿之间的横撑
  f.rod('ironwork', [-0.62, 0.88, -0.28], [-0.62, 0.88, 0.28], 0.08);
  f.box('ironwork', 0.72, 0.05, 0.62, BIN.x, BIN.y0 - 0.025, 0);
  f.rod('ironwork', [-0.28, 0.06, -0.29], [-0.28, 0.06, 0.29], 0.07);
  // 桶口里面（空的时候是一块深色的洞）
  f.cyl('ironwork', BIN.r - 0.03, 0.02, 16, 'y', BIN.x, RIM_Y - 0.005, 0);
  root.add(f.build((k) => ctx.mat(k, small), 'leaf-cart'));

  // ── 落叶桶：圆桶 + 桶沿一圈（胖一点 → 上沿一条亮唇）+ 两个提手 ──
  const b = new Parts<'toolOrange'>();
  b.cyl('toolOrange', [BIN.r, BIN.r - 0.025], BIN.h - 0.06, 16, 'y', BIN.x, BIN.y0 + (BIN.h - 0.06) / 2, 0);
  b.cyl('toolOrange', BIN.r + 0.025, 0.07, 16, 'y', BIN.x, RIM_Y - 0.035, 0);
  for (const s of [-1, 1]) b.box('toolOrange', 0.14, 0.07, 0.07, BIN.x, RIM_Y - 0.16, s * (BIN.r + 0.03));
  root.add(b.build(() => ctx.mat('toolOrange', { ...small, ...SOFT }), 'leaf-cart:bin'));

  // ── 落叶（setFill）：桶口里一块枯叶面（半径跟着满的程度长）+ 满了以后冒出桶沿的一堆和几片碎叶 ──
  const leafMat = ctx.mat('palmSkirt', { ...small, lightUp: 0.4 });
  const leaves = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.03, 14), leafMat);
  leaves.name = 'leaf-cart:leaves';
  leaves.position.set(BIN.x, RIM_Y + 0.008, 0);
  const heap = new Parts<'palmSkirt'>();
  const cone = new THREE.ConeGeometry(BIN.r - 0.02, 0.2, 12);
  cone.translate(BIN.x, RIM_Y + 0.1, 0);
  heap.add('palmSkirt', cone);
  // 戳出来的碎叶：扁的长条，斜着
  heap.box('palmSkirt', 0.36, 0.03, 0.1, BIN.x - 0.12, RIM_Y + 0.14, 0.1, [0.2, 0.5, 0.45]);
  heap.box('palmSkirt', 0.3, 0.03, 0.12, BIN.x + 0.12, RIM_Y + 0.12, -0.12, [-0.3, -0.7, -0.35]);
  const heapG = heap.build(() => leafMat, 'leaf-cart:heap');
  root.add(leaves, heapG);

  // ── 能拿下来的工具：扫帚、耙子、浇水壶（各自一个组，自己的坐标 = 用的时候的样子）──
  const tools: Record<'broom' | 'rake' | 'can', THREE.Group> = {
    broom: broom(ctx),
    rake: rake(ctx),
    can: can(ctx),
  };
  // 在车上的位置：扫帚、耙子倒插在桶后（头朝上），浇水壶挂在桶前
  const STOW: Record<keyof typeof tools, THREE.Matrix4> = {
    broom: new THREE.Matrix4()
      .makeTranslation(-0.2, 1.72, -0.3)
      .multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0.08, 0.3, Math.PI - 0.06))),
    rake: new THREE.Matrix4()
      .makeTranslation(-0.18, 1.66, 0.28)
      .multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(-0.1, Math.PI / 2, Math.PI + 0.08))),
    can: new THREE.Matrix4().makeTranslation(BIN.x + BIN.r + 0.1, 0.4, 0.12),
  };
  const stow = (k: keyof typeof tools) => {
    const t = tools[k];
    root.add(t);
    t.matrix.copy(STOW[k]);
    t.matrix.decompose(t.position, t.quaternion, t.scale);
  };
  for (const k of Object.keys(tools) as (keyof typeof tools)[]) stow(k);

  ctx.mats.prepare(root);
  // 落叶面、碎叶贴在桶口：不投影
  leaves.castShadow = false;
  heapG.traverse((o) => {
    o.castShadow = false;
  });

  let fill = 0;
  const setFill = (v: number) => {
    fill = THREE.MathUtils.clamp(v, 0, 1);
    root.userData.fill = fill;
    // 桶口的枯叶面：0.15 起就看得到一圈，越满越大（盖住深色的洞）
    const r = fill <= 0.02 ? 0 : (BIN.r - 0.035) * Math.min(1, 0.45 + 0.6 * fill);
    leaves.visible = r > 0;
    leaves.scale.set(Math.max(r, 1e-3), 1, Math.max(r, 1e-3));
    heapG.visible = fill >= 0.85;
  };

  root.userData.setFill = setFill;
  root.userData.tools = tools;
  root.userData.stow = stow;
  root.userData.grip = {
    at: [-0.62, 0.88, -0.17],
    at2: [-0.62, 0.88, 0.17],
    axis: [1, 0, 0],
    up: [0, 1, 0],
    pose: 'push',
  } satisfies Grip;
  setFill(ctx.variant === 1 ? 1 : 0.55);
  return root;
}

/** 扫帚（自己的坐标：扫帚头在下（y 0），柄沿 +y 到 1.35 米，扫帚头的宽面朝 +z） */
function broom(ctx: AssetCtx): THREE.Group {
  const p = new Parts<'woodWeathered' | 'dryGrass' | 'ironwork'>();
  p.rod('woodWeathered', [0, 0.3, 0], [0, 1.35, 0], 0.09);
  // 扫帚头：一把上窄下宽的草秆（两块叠起来的扁盒子）+ 扎头的一道深色箍
  p.box('dryGrass', 0.34, 0.16, 0.1, 0, 0.08, 0);
  p.box('dryGrass', 0.24, 0.12, 0.1, 0, 0.21, 0);
  p.box('ironwork', 0.2, 0.05, 0.12, 0, 0.28, 0);
  const g = p.build((k) => ctx.mat(k, { noShadowReceive: true }), 'leaf-cart:broom');
  g.userData.grip = {
    at: [0, 1.2, 0],
    at2: [0, 0.8, 0],
    axis: [0, -1, 0],
    up: [0, 0, 1],
    tip: [0, 0.02, 0],
    pose: 'sweep',
  } satisfies Grip;
  return g;
}

/** 落叶耙（自己的坐标：耙头在下，柄沿 +y 到 1.4 米，扇面朝 +z） */
function rake(ctx: AssetCtx): THREE.Group {
  const p = new Parts<'woodWeathered' | 'metal' | 'ironwork'>();
  p.rod('woodWeathered', [0, 0.28, 0], [0, 1.4, 0], 0.09);
  // 扇形耙头：一块梯形的扁片（下宽 0.44、上窄 0.12）+ 颈上一道深色箍（不画耙齿：1 纹素的细缝在 1× 下会闪）
  const fan = new THREE.BufferGeometry();
  const w0 = 0.22;
  const w1 = 0.06;
  const t = 0.02;
  const v: V3[] = [
    [-w0, 0, -t],
    [w0, 0, -t],
    [w1, 0.3, -t],
    [-w1, 0.3, -t],
    [-w0, 0, t],
    [w0, 0, t],
    [w1, 0.3, t],
    [-w1, 0.3, t],
  ];
  fan.setAttribute('position', new THREE.Float32BufferAttribute(v.flat(), 3));
  fan.setIndex([
    4, 5, 6, 4, 6, 7, 1, 0, 3, 1, 3, 2, 0, 4, 7, 0, 7, 3, 5, 1, 2, 5, 2, 6, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2,
  ]);
  const fanNi = fan.toNonIndexed();
  fanNi.computeVertexNormals();
  p.add('metal', fanNi);
  p.box('ironwork', 0.12, 0.06, 0.06, 0, 0.3, 0);
  const g = p.build(
    (k) => ctx.mat(k, { noShadowReceive: true, ...(k === 'metal' ? { lightUp: 0.5, bands: [-0.4, 0.3] } : {}) }),
    'leaf-cart:rake',
  );
  g.userData.grip = {
    at: [0, 1.25, 0],
    at2: [0, 0.8, 0],
    axis: [0, -1, 0],
    up: [0, 0, 1],
    tip: [0, 0.02, 0],
    pose: 'rake',
  } satisfies Grip;
  return g;
}

/** 浇水壶（自己的坐标：原点 = 壶底中心，壶嘴朝 −z，提把在顶上） */
function can(ctx: AssetCtx): THREE.Group {
  const p = new Parts<'jug'>();
  p.cyl('jug', [0.1, 0.115], 0.2, 12, 'y', 0, 0.1, 0);
  p.cyl('jug', 0.06, 0.05, 10, 'y', 0, 0.215, 0.02); // 加水口
  p.rod('jug', [0, 0.06, -0.08], [0, 0.26, -0.3], 0.07); // 壶嘴
  p.box('jug', 0.08, 0.06, 0.08, 0, 0.27, -0.32); // 莲蓬头
  // 提把：顶上一道拱（三段）
  p.rod('jug', [0, 0.2, 0.09], [0, 0.32, 0.05], 0.06);
  p.rod('jug', [0, 0.32, 0.05], [0, 0.32, -0.05], 0.06);
  p.rod('jug', [0, 0.32, -0.05], [0, 0.2, -0.07], 0.06);
  const g = p.build(() => ctx.mat('jug', { noShadowReceive: true, lightUp: 0.4 }), 'leaf-cart:can');
  g.userData.grip = {
    at: [0, 0.32, 0],
    axis: [0, 0, -1],
    up: [0, 1, 0],
    tip: [0, 0.27, -0.36],
    pose: 'pour',
  } satisfies Grip;
  g.userData.spout = new THREE.Vector3(0, 0.27, -0.36);
  return g;
}

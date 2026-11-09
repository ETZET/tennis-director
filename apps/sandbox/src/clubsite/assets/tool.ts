// 放在地上的工具（总监捡起/放下用）：扫帚躺着、吹叶机侧躺、捡球器立在笼子上柄往后斜。
// 外形和总监手里的一样（扫帚、吹叶机的网格来自 player/rig.ts 的 makeBroom / makeBlower，捡球器来自 ball-picker.ts），
// 只是扫帚柄加粗到 0.17 米（≈ 2 纹素）：躺在地上的细柄 45° 下会时有时无。
//
// buildTool(ctx, kind) → THREE.Object3D：本地原点 = 地面上工具占地的中心，y 0 = 地面。
//   userData.kind     'broom' | 'picker' | 'blower'
//   userData.top      工具最高点的高度（米）：交互标记放在它上面 0.4 米
//   userData.picker   （只有 picker）捡球器对象：setCount(n) 笼子里的球，默认 0
// 画廊：desert3d-v2.html?asset=tool&v=0（扫帚）/ 1（捡球器）/ 2（吹叶机）/ 3（三样并排）
import * as THREE from 'three';
import { PERSON } from '../people/rig/player';
import { makeBlower, makeBroom } from '../people/rig/rig';
import type { BaseCtx as AssetCtx } from '../render/ctx';
import { buildPicker } from './ball-picker';

export type ToolKind = 'broom' | 'picker' | 'blower';
export const TOOL_KINDS: readonly ToolKind[] = ['broom', 'picker', 'blower'];

/** 工具的材质（和总监手里的同一套），tool-rack 也用 */
export function toolMats(ctx: AssetCtx) {
  return {
    wood: ctx.mat('wood', PERSON),
    head: ctx.mat('dryGrass', PERSON),
    body: ctx.mat('toolOrange', { ...PERSON, edge: 0.45, convex: 0.5 }),
    tube: ctx.mat('toolOrange', { ...PERSON, edge: 0.45, convex: 0.3 }),
    dark: ctx.mat('hair', { ...PERSON, edge: 0.3, convex: 0 }),
  };
}

/** 把一个对象包起来：包围盒的 xz 中心挪到原点、底挪到 y 0 */
function grounded(obj: THREE.Object3D): THREE.Group {
  const g = new THREE.Group();
  g.add(obj);
  g.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const c = box.getCenter(new THREE.Vector3());
  obj.position.x -= c.x;
  obj.position.z -= c.z;
  obj.position.y -= box.min.y;
  g.userData.top = box.max.y - box.min.y;
  return g;
}

export function buildTool(ctx: AssetCtx, kind: ToolKind): THREE.Object3D {
  const m = toolMats(ctx);
  let root: THREE.Group;
  if (kind === 'broom') {
    // 扫帚：扫帚头刷毛朝下立在地上（金色一块，最好认），柄从头顶往后倒、另一头搭在地上（斜 0.19 弧度）；整把斜放
    // 柄用中档的木色（亮档和亮沙只差一点，躺在地上会消失）
    const b = makeBroom({ ...m, wood: ctx.mat('wood', { ...PERSON, lightUp: 0, bands: [-0.3, 0.9] }) }, 0.085);
    const stick = b.children[2];
    const pivot = new THREE.Group();
    pivot.position.y = 0.26;
    stick.position.y = -0.26;
    pivot.add(stick);
    pivot.rotation.x = -(Math.PI / 2 - 0.19);
    b.add(pivot);
    const yaw = new THREE.Group();
    yaw.add(b);
    yaw.rotation.y = 0.7;
    root = grounded(yaw);
  } else if (kind === 'blower') {
    // 吹叶机侧躺：管子平放（朝 +x），机身在管子后面着地，深色进风口朝上
    const b = makeBlower(m);
    b.rotation.set(Math.PI, 0, Math.PI / 2, 'XZY');
    const yaw = new THREE.Group();
    yaw.add(b);
    yaw.rotation.y = -0.45;
    root = grounded(yaw);
  } else {
    // 捡球器立在笼子上，柄往后斜靠（−z）；空笼子
    const p = buildPicker(ctx);
    p.userData.setTilt(-0.42);
    p.userData.setCount(0);
    root = grounded(p);
    root.userData.picker = p;
  }
  root.name = `tool:${kind}`;
  root.userData.kind = kind;
  ctx.mats.prepare(root);
  return root;
}

export function build(ctx: AssetCtx): THREE.Object3D {
  if (ctx.variant < 3) return buildTool(ctx, TOOL_KINDS[ctx.variant] ?? 'broom');
  const g = new THREE.Group();
  TOOL_KINDS.forEach((k, i) => {
    const t = buildTool(ctx, k);
    t.position.x = (i - 1) * 1.7;
    g.add(t);
  });
  return g;
}

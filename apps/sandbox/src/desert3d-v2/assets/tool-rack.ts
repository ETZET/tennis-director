// 工具架：球场边一个胖胖的木架子（两根粗柱 + 三块背板 + 顶上一块往前斜的小檐），工具就住在这里：
// 扫帚头朝上挂在两根木钉上（左）、吹叶机挂在钩子上管子朝下（中）、捡球器立在地上柄靠着架子（右）。
// 2.4 × 2.2 × 0.9 米。开口朝本地 +z（工具挂在背板前面）。背板正对镜头时落暗档 → 橙色吹叶机、金色扫帚头、青绿捡球器在深色背板前跳出来。
// 檐只有 0.5 米深、在挂着的工具上面：45° 俯视下不挡工具。
//
// 建议放的位置（layout.ts 不归我改）：球场台地东南角，铺面东沿（x 7）和台地东沿（x ≈ 11.5）之间、通往台阶的步道旁：
//   { id: 'tool-rack', asset: 'tool-rack', x: 9.4, z: 12.6, y: 0, rotY: -Math.PI / 4 }
//   开口朝西南（对着铺面东南角的门和镜头），总监从台阶上来先路过它；离裁判椅（7.0, 0.6）、长椅（9.3, 5.2）够远，不挤。
//   想要正对镜头（最好认）：x 8.6, z 14.6, rotY 0（贴着台地南沿的暗带，人站在 z ≈ 15.3）。
//
// userData：
//   slots[kind] = { pos, rotY, tool, top }（都是本地坐标）
//     pos   总监拿/放这件工具时站的地面点（y 0，工具正前方 0.75 米）
//     rotY  总监站在 pos 时的朝向（人物正面朝 +z 时 rotY 0；面对架子 = π）
//     tool  架上这件工具的中心；top = 工具最高点（交互标记放在它上面 0.4 米）
//   show(kind, visible)  显示/隐藏架上的那件工具（捡走 → false，放回 → true）
//   shown(kind)          现在是否挂着
// 画廊：desert3d-v2.html?asset=tool-rack（&hide=broom,blower 隐藏架上的工具，&rot=-0.785 转过去看）
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { blobNormals } from '../toon';
import type { AssetCtx } from '../world';
import { buildPicker } from './ball-picker';
import { makeBlower, makeBroom } from './player/rig';
import { type ToolKind, toolMats } from './tool';

export interface RackSlot {
  pos: THREE.Vector3;
  rotY: number;
  tool: THREE.Vector3;
  top: THREE.Vector3;
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** 一块木料：盒子 + 法线从中心往外（胖胖的亮顶/中腰/暗底） */
function plank(w: number, h: number, d: number, x: number, y: number, z: number, rx = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rx) g.rotateX(rx);
  g.translate(x, y, z);
  return g;
}

export function build(ctx: AssetCtx): THREE.Object3D {
  const root = new THREE.Group();
  root.name = 'tool-rack';
  const wood = ctx.mat('wood', { edge: 0.6, convex: 0.5 });
  const board = ctx.mat('woodWeathered', { edge: 0.5, convex: 0.4 });

  const W = 2.4;
  const PZ = -0.3; // 柱子、背板的 z
  // ── 柱子：两根 0.27 米（3 纹素）方柱，顶上略高出背板 ──
  {
    const gs = [-1, 1].map((s) => plank(0.27, 2.12, 0.27, s * (W / 2 - 0.14), 1.06, PZ));
    root.add(new THREE.Mesh(mergeGeometries(gs), wood));
  }
  // ── 背板：三块横板叠成护墙板（上一块压在下一块前面 3 厘米，接缝处深度一跳 → 描边画出一条板缝），离地 0.3 米 ──
  {
    const gs: THREE.BufferGeometry[] = [];
    const H = 0.55;
    for (let i = 0; i < 3; i++) gs.push(plank(W - 0.3, H + 0.04, 0.1, 0, 0.3 + H / 2 + i * H, PZ - 0.1 + i * 0.03));
    root.add(new THREE.Mesh(mergeGeometries(gs), board));
  }
  // ── 檐：一块往前斜的板（顶面亮），两头搭在柱子上；下面一根横梁 ──
  {
    const roof = plank(W + 0.3, 0.1, 0.5, 0, 2.17, PZ + 0.08, 0.28);
    const beam = plank(W - 0.1, 0.18, 0.2, 0, 2.02, PZ + 0.02);
    root.add(new THREE.Mesh(roof, board));
    root.add(new THREE.Mesh(beam, wood));
  }
  // ── 木钉、钩子：胖胖的深色小块（2 纹素），扫帚挂在两根木钉上，吹叶机挂在一根钩子上 ──
  const BROOM_X = -0.62;
  const BLOWER_X = 0.08;
  const PICKER_X = 0.78;
  const HOOK_Y = 1.55;
  {
    const gs = [
      plank(0.13, 0.13, 0.22, BROOM_X - 0.19, 1.4, PZ + 0.08),
      plank(0.13, 0.13, 0.22, BROOM_X + 0.19, 1.4, PZ + 0.08),
      plank(0.13, 0.13, 0.26, BLOWER_X, HOOK_Y - 0.12, PZ + 0.1),
    ];
    const g = mergeGeometries(gs);
    blobNormals(g, V(0, HOOK_Y + 0.3, PZ));
    root.add(new THREE.Mesh(g, ctx.mat('hair', { edge: 0.4, convex: 0.3, noShadowReceive: true })));
  }

  // ── 架上的工具 ──
  const m = toolMats(ctx);
  const racked = {} as Record<ToolKind, THREE.Object3D>;
  // 扫帚：扫帚头着地立在架子前，柄往后靠在两根木钉之间 —— 金色的扫帚头在最低最前，不被檐挡（头朝上挂的话转 45° 就被檐盖住）
  {
    const b = makeBroom(m, 0.085);
    b.position.set(BROOM_X, 0, PZ + 0.45);
    b.rotation.set(-0.28, 0.12, 0, 'YXZ');
    racked.broom = b;
  }
  // 吹叶机：握把挂在钩子上，管子朝下，机身在前面
  {
    const b = makeBlower(m);
    b.position.set(BLOWER_X, HOOK_Y - 0.16, PZ + 0.12);
    b.rotation.y = 0.25;
    racked.blower = b;
  }
  // 捡球器：立在地上，柄往后靠在顶上那块背板上；空笼子
  {
    const p = buildPicker(ctx);
    p.userData.setTilt(-0.36);
    p.userData.setCount(0);
    p.position.set(PICKER_X, 0, PZ + 0.45);
    racked.picker = p;
  }
  for (const o of Object.values(racked)) root.add(o);

  // ── 槽位 ──
  const top = (o: THREE.Object3D) => {
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(o);
    return { c: box.getCenter(V(0, 0, 0)), y: box.max.y };
  };
  const slots = {} as Record<ToolKind, RackSlot>;
  for (const k of ['broom', 'blower', 'picker'] as ToolKind[]) {
    const { c, y } = top(racked[k]);
    slots[k] = { pos: V(c.x, 0, PZ + 1.05), rotY: Math.PI, tool: c, top: V(c.x, y, c.z) };
  }
  root.userData.slots = slots;
  const shown: Record<ToolKind, boolean> = { broom: true, blower: true, picker: true };
  root.userData.show = (k: ToolKind, visible: boolean) => {
    if (!racked[k]) return;
    shown[k] = visible;
    racked[k].visible = visible;
  };
  root.userData.shown = (k: ToolKind) => shown[k];
  for (const k of (ctx.params.get('hide') ?? '').split(',')) if (k in racked) root.userData.show(k, false);

  ctx.mats.prepare(root);
  // 画廊：&rot=-0.785 看转过的样子（场景里由 SLOTS 的 rotY 转）
  const rot = ctx.params.get('rot');
  if (rot !== null && ctx.params.get('asset') === 'tool-rack') {
    const g = new THREE.Group();
    root.rotation.y = Number(rot);
    g.add(root);
    return g;
  }
  return root;
}

// #14 tray-return：回收台（客人吃完把托盘放回来；总监从这里拿收餐盆去收桌子）。
// 世界 (−37.6, −27.5) 附近，场景里 rotY ≈ π/2 − 0.2（本地 +z = 正面 = 放托盘的一侧，朝东；本地 −x 那头朝南 = 朝镜头）。
// 尺寸 1.2（本地 x）× 1.5（高）× 0.5（本地 z）；三角形 ≈ 290（上限 300，含 12 只托盘）。
// 四根扁立柱（metal：从东面看 2 纹素；从南头看是 1 纹素的框线 —— 0.5 米深的架子两边各留 3 纹素的柱子就看不到托盘了）
// + 三层层板 + 顶板；层板上一摞摞红托盘（flowerRed，南头那摞顶到架子端头，镜头里每层一整块红），
// 顶板上一只白色收餐盆（clothWhite，盆里那块用斜法线落到中档 = 盆底）。
// 镜头从南边看进去：每层南半截（本地 −x）那摞最显眼，北半截被上一层挡住一半。
//
// userData：
//   setCount(n)   0..12：架子上的托盘数。从最上面那层往下填，每层先南（本地 −x）后北，每摞 2 只
//   count         当前数
//   spots.front   [lx, lz] 站的地面点（正面 +z 前 0.55 米、居中）
//   spots.tub     [lx, ly, lz] 收餐盆的中心（本地，拿起来时用）
//   tub           收餐盆的 Object3D（总监拿走时可以 tub.visible = false，或者挂到手上）
// 画廊：?asset=tray-return&count=12（&ry=1.37 = 场景里的朝向）
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ToonOpts } from '../../clubsite/render/toon';
import type { AssetCtx } from '../ctx';

const L = 1.2;
const D = 0.5;
/** 立柱：本地 x 方向 0.18（从东面看 2 纹素），本地 z 方向 0.09（从南头 = 镜头看是 1 纹素的框线，中间露出整摞托盘） */
const POST_X = 0.18;
const POST_Z = 0.09;
/** 三层层板的顶面高度 + 顶板 */
const SHELVES = [0.14, 0.56, 0.98];
const TOP_Y = 1.32;
const BOARD_T = 0.07;
/** 托盘 */
const TRAY = { w: 0.45, h: 0.035, d: 0.34 };
/** 每层两摞（本地 x：南 / 北），每摞 2 只 */
const STACK_X = [-0.33, 0.25];
const PER_STACK = 2;
const MAX = SHELVES.length * STACK_X.length * PER_STACK;

function box(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry {
  return new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z).toNonIndexed();
}

/** 把几何体所有法线换成 n（用来让一块朝天的面落到中档） */
function setNormal(g: THREE.BufferGeometry, n: THREE.Vector3): THREE.BufferGeometry {
  const a = g.getAttribute('normal') as THREE.BufferAttribute;
  const v = n.clone().normalize();
  for (let i = 0; i < a.count; i++) a.setXYZ(i, v.x, v.y, v.z);
  return g;
}

export function build(ctx: AssetCtx): THREE.Object3D {
  const g = new THREE.Group();
  g.name = 'tray-return';

  // 竖直面（立柱、板沿）朝镜头/朝东：抬到中档；不接投影（顶板的影子会把整个架子压成一块暗）
  const vert: ToonOpts = { lightUp: 0.55, bands: [-0.45, 0.35], noShadowReceive: true };

  // ── 架子：四根立柱 + 三层层板 + 顶板（一个网格） ──
  const frame: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      frame.push(box(POST_X, TOP_Y + BOARD_T, POST_Z, sx * (L / 2 - POST_X / 2), 0, sz * (D / 2 - POST_Z / 2)));
  for (const y of [...SHELVES, TOP_Y + BOARD_T]) frame.push(box(L, BOARD_T, D, 0, y - BOARD_T, 0));
  g.add(new THREE.Mesh(mergeGeometries(frame), ctx.mat('metal', { ...vert, convex: 0.3, edge: 0.5 })));

  // ── 托盘：12 只一个 InstancedMesh，count 决定显示几只（实例顺序 = 填的顺序） ──
  const trayGeo = box(TRAY.w, TRAY.h, TRAY.d, 0, 0, 0);
  const trays = new THREE.InstancedMesh(trayGeo, ctx.mat('flowerRed', { ...vert, convex: 0.25 }), MAX);
  const rnd = ctx.rng('tray-return:stack');
  const m4 = new THREE.Matrix4();
  const t = ctx.texel;
  let k = 0;
  for (let s = SHELVES.length - 1; s >= 0; s--)
    for (const x of STACK_X)
      for (let j = 0; j < PER_STACK; j++) {
        // 摞起来的托盘每只错开 0 或 1 纹素（整纹素），读得出是一摞
        const dx = j === 0 ? 0 : (rnd() < 0.5 ? -1 : 1) * t * 0.5;
        m4.makeTranslation(x + dx, SHELVES[s] + j * (TRAY.h + 0.004), 0);
        trays.setMatrixAt(k++, m4);
      }
  trays.instanceMatrix.needsUpdate = true;
  g.add(trays);

  // ── 收餐盆：白色塑料盆放在顶板上；盆底（内面）用往镜头斜的法线落中档，盆沿一圈亮 ──
  const tub = new THREE.Group();
  tub.name = 'tub';
  const TW = 0.62;
  const TD = 0.42;
  const TH = 0.18;
  const RIM = 0.08;
  const tubGeo = mergeGeometries([
    box(TW, TH, TD, 0, 0, 0),
    setNormal(
      new THREE.PlaneGeometry(TW - RIM * 2, TD - RIM * 2)
        .rotateX(-Math.PI / 2)
        .translate(0, TH + 0.003, 0)
        .toNonIndexed(),
      new THREE.Vector3(0, 0.55, 1),
    ),
  ]);
  tub.add(new THREE.Mesh(tubGeo, ctx.mat('clothWhite', { ...vert, bands: [-0.45, 0.62], convex: 0.3 })));
  tub.position.set(-0.08, TOP_Y + BOARD_T, 0);
  g.add(tub);

  let count = 0;
  const setCount = (n: number) => {
    count = THREE.MathUtils.clamp(Math.round(n), 0, MAX);
    trays.count = count;
    trays.visible = count > 0;
  };
  g.userData.setCount = setCount;
  Object.defineProperty(g.userData, 'count', { get: () => count, enumerable: true });
  g.userData.tub = tub;
  g.userData.spots = {
    front: [0, D / 2 + 0.55] as [number, number],
    tub: [tub.position.x, tub.position.y + TH / 2, tub.position.z] as [number, number, number],
  };

  setCount(ctx.params.has('count') ? Number(ctx.params.get('count')) : 7);
  ctx.mats.prepare(g);
  // 画廊里看场景的朝向：?asset=tray-return&ry=1.37（只在画廊生效，场景里由 SLOT 的 rotY 定）
  if (ctx.params.get('asset') === 'tray-return' && ctx.params.has('ry')) {
    const w = new THREE.Group();
    g.rotation.y = Number(ctx.params.get('ry'));
    w.add(g);
    w.userData = g.userData;
    return w;
  }
  return g;
}

// 拍架（clubpickle 的 paddle-rack：匹克球场特有的"挂拍排队"）：两根木立柱 + 一块开 6 个槽的横板 + 两只脚，
// 顶上一条小黑板横档（粉笔短划，不写真字）。槽里竖着插拍子，拍面朝镜头、柄朝下，每把一个颜色
// （珊瑚 paddle、黄、俱乐部蓝、橙、紫、白）—— 场边带最艳的一排小方块。默认插 4 把（从西往东），空 2 个槽。
// 1.56 × 1.05 × 0.32 米（规格 1.3 米宽放不下 6 把拍面 + 1 纹素多的缝，放宽到 1.56）。原点 = 落地点中心，朝南（+z）。
//
// userData（stage 3：来的人插拍子 +1、上场的人拿走最左边的）：
//   setPaddles(n)  0..6：从左（西）往右插满前 n 个槽；setCount 同一个函数（clubpickle.md 的名字）
//   count          当前把数
import * as THREE from 'three';
import { Bag, type CourtKey, DV, FACE_LIT, FACE_MID, type KitCtx } from './courtside/kit';

type Key = CourtKey | 'paddle';

const W = 1.56;
const SLOTS = 6;
const PITCH = 0.225;
const FACE_W = 0.165;
const FACE_H = 0.27;
/** 拍面的颜色（从西往东）：珊瑚、黄、俱乐部蓝、橙、紫、白 */
const COLORS: Key[] = ['paddle', 'flowerYellow', 'counter', 'toolOrange', 'clothPurple', 'clothWhite'];

export function build(ctx: KitCtx<Key>): THREE.Object3D {
  const root = new THREE.Group();
  root.name = 'paddle-rack';
  const mWood = ctx.mat('timber', { convex: 0.7 });
  // 朝镜头的横板正面：竖直面落中档、上沿一行亮边（convex）；横向一块板（planks 沿 y，一块板 0.12 米 → 横板是一整块）
  const mBoard = ctx.mat('timber', {
    convex: 0.8,
    ...FACE_MID,
    elem: { kind: 'planks', space: 'local', p: [0, 1, 0, 0.12], seam: 1, hi: 1 },
  });
  const mSlate = ctx.mat('slate', { ...FACE_MID, convex: 0.5 });
  const mChalk = ctx.mat('signPaint', FACE_MID);
  const mDark = ctx.mat('ironwork', { convex: 0.1 });

  const post = 0.13;
  const xi = W / 2 - post / 2;
  const fixed = new Bag();
  // 两只脚（沿 z 的木块）+ 两根立柱
  for (const s of [-1, 1]) {
    fixed.box(mWood, post + 0.02, 0.09, 0.4, s * xi, 0, 0);
    fixed.box(mWood, post, 1.05, post, s * xi, 0, -0.02);
  }
  // 开槽的横板：顶面 + 朝镜头的正面（y 0.4..0.52）
  const bw = W - 2 * post;
  fixed.box(mBoard, bw + 0.02, 0.12, 0.3, 0, 0.4, 0);
  // 槽：横板顶面上 6 道深色口（拍柄插进去的地方，空槽也看得到）
  for (let i = 0; i < SLOTS; i++) fixed.box(mDark, 0.1, 0.006, 0.12, slotX(i), 0.52, 0.02);
  // 拍子靠着的后横档（空槽的地方看得到）
  fixed.box(mWood, bw + 0.02, 0.09, 0.07, 0, 0.66, -0.1);
  // 顶上的小黑板横档（夹在两根立柱之间）+ 三道粉笔短划
  fixed.box(mSlate, bw + 0.02, 0.15, 0.06, 0, 0.9, -0.02);
  fixed.quad(mChalk, 0.27, DV / 2, -0.38, 0.975, 0.012);
  fixed.quad(mChalk, 0.18, DV / 2, -0.05, 0.975, 0.012);
  fixed.quad(mChalk, 0.27, DV / 2, 0.3, 0.975, 0.012);
  fixed.into(root);

  // 拍子：每把一个网格（一种颜色一个材质）；柄合成一个网格，用 drawRange 按把数截（从左往右插，前 n 把）
  const faces: THREE.Object3D[] = [];
  for (let i = 0; i < SLOTS; i++) {
    const f = new Bag();
    const m = ctx.mat(COLORS[i], { ...FACE_LIT, convex: 0.45 });
    // 拍面（实心、不画网线：和网球拍一眼分开）
    f.box(m, FACE_W, FACE_H, 0.04, slotX(i), 0.6, 0.03);
    const g = f.into();
    faces.push(g);
    root.add(g);
  }
  const grips = new Bag();
  const mGrip = ctx.mat('ironwork', { convex: 0.4, lightUp: 0.3 });
  for (let i = 0; i < SLOTS; i++) grips.box(mGrip, 0.06, 0.16, 0.05, slotX(i), 0.46, 0.03);
  const gripObj = grips.into();
  const gripMesh = gripObj.children[0] as THREE.Mesh;
  root.add(gripObj);
  const perGrip = gripMesh.geometry.getAttribute('position').count / SLOTS;

  // 小道具：不接投影（立柱、黑板、伞的影子会把拍面涂成一块暗）
  ctx.mats.prepare(root, { receive: false });

  const setPaddles = (n: number) => {
    const k = Math.max(0, Math.min(SLOTS, Math.round(n)));
    faces.forEach((f, i) => {
      f.visible = i < k;
    });
    gripMesh.geometry.setDrawRange(0, perGrip * k);
    gripMesh.visible = k > 0;
    root.userData.count = k;
  };
  setPaddles(4);
  root.userData.setPaddles = setPaddles;
  root.userData.setCount = setPaddles;
  return root;
}

function slotX(i: number) {
  return (i - (SLOTS - 1) / 2) * PITCH;
}

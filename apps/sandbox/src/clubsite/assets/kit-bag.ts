// 球拍包（clubclay 的 kit-bag；以后会员场 / 中心场的场边也用）：一个胖胖的长圆筒横放在长椅边的地上，
// 两色（v0 俱乐部蓝 clothBlue、v1 红 clothRed、v2 柜台蓝 counter）+ 中间一条白带 + 顶上一条深色提带，一头露两截拍柄。
// 0.95 × 0.32 × 0.32 米（11 × 5 设计纹素）：场边的小颜色点，细节不多。原点 = 落地点中心，长边沿 x。
import * as THREE from 'three';
import { Bag, type CourtKey, type KitCtx } from './courtside/kit';

const BODY: CourtKey[] = ['clothBlue', 'clothRed', 'counter'];

export function build(ctx: KitCtx): THREE.Object3D {
  const v = ctx.variant % BODY.length;
  const bag = new Bag();
  const r = 0.16;
  const len = 0.95;
  const sy = 0.88; // 压扁一点（软包落在地上）
  const mBody = ctx.mat(BODY[v], { convex: 0.35, lightUp: 0.2 });
  const mWhite = ctx.mat('clothWhite', { convex: 0.35, lightUp: 0.2 });
  const mDark = ctx.mat('ironwork', { convex: 0.3 });
  // 包身：胶囊（两头圆）横放
  const body = new THREE.CapsuleGeometry(r, len - 2 * r, 3, 10).rotateZ(Math.PI / 2).scale(1, sy, 1);
  bag.add(mBody, body, new THREE.Matrix4().makeTranslation(0, r * sy, 0));
  // 白带：中间偏一头的一圈（宽 0.13 ≈ 1.5 纹素）
  const band = new THREE.CylinderGeometry(r + 0.012, r + 0.012, 0.13, 10, 1, true).rotateZ(Math.PI / 2).scale(1, sy, 1);
  bag.add(mWhite, band, new THREE.Matrix4().makeTranslation(-0.12, r * sy, 0));
  // 端头一圈深色（包底的拉链头那一端）
  const cap = new THREE.CylinderGeometry(r * 0.86, r * 0.86, 0.06, 10, 1, true).rotateZ(Math.PI / 2).scale(1, sy, 1);
  bag.add(mDark, cap, new THREE.Matrix4().makeTranslation(len / 2 - 0.11, r * sy, 0));
  // 提带：顶上一条压扁的深色带（屏幕上是包顶一道暗线 + 两个扣）
  const top = 2 * r * sy;
  bag.box(mDark, 0.36, 0.035, 0.07, 0.06, top - 0.012, 0);
  bag.box(mDark, 0.06, 0.06, 0.09, -0.1, top - 0.04, 0);
  bag.box(mDark, 0.06, 0.06, 0.09, 0.22, top - 0.04, 0);
  // 拉链那头露出两截拍柄（白握把胶），斜着从包口伸出来
  const mGrip = ctx.mat('clothWhite', { convex: 0.5 });
  bag.box(mGrip, 0.16, 0.07, 0.07, len / 2 + 0.03, r * sy + 0.02, -0.04, 0, 0, 0.35);
  bag.box(mGrip, 0.14, 0.07, 0.07, len / 2 + 0.01, r * sy - 0.06, 0.05, 0, 0, 0.15);
  const root = bag.into();
  root.name = 'kit-bag';
  // 小道具：不接投影（场边那一条在围网的影子里，接了就是一个暗团，不是颜色点）
  ctx.mats.prepare(root, { receive: false });
  return root;
}

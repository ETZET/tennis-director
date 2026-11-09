// #8 court-sail 会员场北边的遮阳帆（俱乐部新装的，绷紧的；不是 desert3d-v2 那块断了一角的破帆）。
// 4.2 × 3.3 × 2.6 米：四根绿漆钢杆（后两根 3.3 米贴着会员场北围网，前两根 2.6 米），帆面四角用短拉索拉到杆顶，
// 四条边是往里收的弧边（张拉膜的样子），往南（镜头）斜下 ≈ 15°。奶白底 + 俱乐部蓝宽条（每条 ≥ 6 设计纹素）：
//   v0 条纹南北走（屏幕上是竖条），v1 条纹东西走（屏幕上是横条）—— 两块帆并排不一模一样。
// 前两根杆之间一根钢的前梁（本地 z +1.2，高 2.5）：喷雾管 #7（mist-line，世界 z 19.2）就挂在它下面。
// 帆面不接投影（帆布 THIN）、要投影（帆影是北走廊的深色底，水洼放在帆影外）：帆面另有一层反向三角形给投影 pass。
// 帆面朝南斜 → 对北边的太阳只有 ≈ 0.48 的点积（刚好掉到中档），光往上偏 0.35 → 顶面落亮档（画面里亮的一块）。
// 原点 = 四根杆的中心（地面），+z 朝镜头。
//
// userData（stage 3）：
//   frontBeam   前梁的两端 [西, 东]（本地坐标）：喷雾管 / 装饰挂在这条线上
//   corners     帆面四角（后西、后东、前西、前东，本地坐标）
import * as THREE from 'three';
import { Parts, type V3 } from '../../clubsite/tools/kit';
import type { AssetCtx } from '../world';
import { type SailSpec, sailSurface } from './comfort/surface';

/** 杆的位置：x ±POST_X，后 z −POST_Z、前 z +POST_Z */
const POST_X = 2.05;
const POST_Z = 1.2;
const BACK_H = 3.3;
const FRONT_H = 2.6;
/** 杆的粗细（米）：0.18 = 2 设计纹素（1× 下屏幕上 4 纹素） */
const POST_R = 0.09;
/** 前梁中心高 */
const BEAM_Y = 2.5;

export function build(ctx: AssetCtx): THREE.Object3D {
  const v = ctx.variant % 2;
  const root = new THREE.Group();
  root.name = 'court-sail';

  // ── 帆面 ─────────────────────────────────
  // 角比杆顶往里收 0.22 米（拉索 + 花篮螺丝），前角比前杆顶略低：帆面从 3.12 斜到 2.56
  const ix = POST_X - 0.2;
  // 一点点扭（双曲抛物面：对角的两个角高、另两个低）→ 绷紧的帆；v1 反着扭
  const tw = v === 0 ? 0.12 : 0.1;
  const corners: [V3, V3, V3, V3] = [
    [-ix, BACK_H - 0.12 - (v === 0 ? tw : tw * 2), -POST_Z + 0.16],
    [ix, BACK_H - 0.12 - (v === 0 ? tw * 2 : tw), -POST_Z + 0.16],
    [-ix, FRONT_H - 0.04 - (v === 0 ? tw * 2 : 0), POST_Z - 0.14],
    [ix, FRONT_H - 0.04 - (v === 0 ? 0 : tw * 2), POST_Z - 0.14],
  ];
  const spec: SailSpec =
    v === 0
      ? // 南北走的竖条：奶白 · 蓝 · 奶白 · 蓝 · 奶白（蓝条 ≈ 0.6 米 ≈ 7 设计纹素）
        { corners, cut: 0.085, sag: 0.05, along: 'u', bands: [0.2, 0.16, 0.28, 0.16, 0.2], sub: 2, across: 6 }
      : // 东西走的横条：奶白 · 蓝 · 奶白 · 蓝（前沿那条蓝 = 一条帆边，读成"俱乐部的帆"）
        { corners, cut: 0.085, sag: 0.05, along: 'v', bands: [0.24, 0.26, 0.24, 0.26], sub: 2, across: 8 };
  const [cream, stripe] = sailSurface(spec);
  const sailOpts = {
    lightUp: 0.35,
    elem: {
      kind: 'paint' as const,
      size: [12, 8] as [number, number],
      density: [0, 0.02] as [number, number],
      patch: 3,
    },
  };
  const mCream = new THREE.Mesh(cream, ctx.mat('canvas', { ...sailOpts, noShadowReceive: true }));
  const mStripe = new THREE.Mesh(stripe, ctx.mat('canvasStripe', { ...sailOpts, noShadowReceive: true }));
  mCream.name = 'court-sail:canvas';
  mStripe.name = 'court-sail:stripe';
  root.add(mCream, mStripe);

  // ── 杆、前梁、拉索 ──────────────────────────
  const p = new Parts<'metal' | 'ironwork' | 'concrete'>();
  const posts: [number, number, number][] = [
    [-POST_X, -POST_Z, BACK_H],
    [POST_X, -POST_Z, BACK_H],
    [-POST_X, POST_Z, FRONT_H],
    [POST_X, POST_Z, FRONT_H],
  ];
  posts.forEach(([x, z, h], i) => {
    p.cyl('metal', POST_R, h, 6, 'y', x, h / 2, z);
    // 杆顶的帽（胖一点，顶亮）
    p.box('metal', 0.24, 0.1, 0.24, x, h + 0.05, z);
    // 地脚：一块方水泥墩（露出地面 0.08）
    p.box('concrete', 0.36, 0.08, 0.36, x, 0.04, z);
    // 拉索：杆顶 → 帆角（铸铁色的短粗杆，0.09 = 屏幕上 2 纹素；花篮螺丝是中间胖一点的一节）
    const c = corners[i];
    const top: V3 = [x, h - 0.06, z];
    p.rod('ironwork', top, c, 0.08);
    const mid: V3 = [(top[0] + c[0]) / 2, (top[1] + c[1]) / 2, (top[2] + c[2]) / 2];
    p.box('ironwork', 0.13, 0.13, 0.13, ...mid);
  });
  // 前梁（喷雾管挂在它下面）
  p.box('metal', POST_X * 2, 0.11, 0.11, 0, BEAM_Y, POST_Z);
  // 杆朝镜头的一面：光往上偏 + 低 bands → 落中档（绿漆读得出来；全暗的话贴着深青的挡风布就没了）
  const frame = p.build((k) => ctx.mat(k, k === 'metal' ? { lightUp: 0.3, bands: [-0.5, 0.45] } : {}), 'court-sail');
  root.add(frame);

  ctx.mats.prepare(root);
  // 帆面：投影要、受影不要（材质已经 noShadowReceive；这里也关掉 receive，免得自影的粉刺）
  mCream.receiveShadow = false;
  mStripe.receiveShadow = false;

  root.userData.frontBeam = [
    [-POST_X, BEAM_Y, POST_Z],
    [POST_X, BEAM_Y, POST_Z],
  ];
  root.userData.corners = corners;
  return root;
}

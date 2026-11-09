// 器材箱（clubpickle 的 gear-box；前台的东西：和柜台同一家俱乐部蓝）：竖板箱身 + 木底座 + 木口沿，
// 盖子掀开（78°，还没靠到底：盖子内面的木板朝镜头，给里面的东西当浅色底），里面露出一卷备用网（暗卷 + 白网带的两头）、绞盘摇把、一根捡球管的头。
// 箱前东角一个铜扣。0.8 × 0.75 × 0.5 米（盖子掀开以后顶到 1.05 米）。原点 = 落地点中心，+z 朝镜头。
//
// userData（stage 3：总监在这里拿 / 还工具，SPOTS.gearBox）：
//   setLid(k)        0..1：0 = 盖上，1 = 掀开 78°（默认），可以每帧调（只转一个组）
//   setItems({ net?, crank?, tube? })  显示 / 藏起箱子里的东西（拿走摇把 = setItems({ crank: false })）
//   items            当前 { net, crank, tube }
import * as THREE from 'three';
import { Bag, type KitCtx } from './courtside/kit';

const W = 0.8;
const D = 0.5;
const H = 0.62; // 箱身顶（口沿下）
const T = 0.05; // 板厚
const LID_OPEN = (78 * Math.PI) / 180;

export function build(ctx: KitCtx): THREE.Object3D {
  const root = new THREE.Group();
  root.name = 'gear-box';
  // 箱身：俱乐部蓝竖板（板宽 0.2 米 ≈ 2.2 纹素，1 纹素缝，缝后一条亮）；朝镜头的正面落中档
  const mBox = ctx.mat('counter', {
    convex: 0.5,
    elem: { kind: 'planks', space: 'local', p: [1, 0, 0, 0.2], seam: 1, hi: 1 },
  });
  const mBoxFront = ctx.mat('counter', {
    convex: 0.5,
    lightUp: 0.6,
    bands: [-0.4, 0.4],
    elem: { kind: 'planks', space: 'local', p: [1, 0, 0, 0.2], seam: 1, hi: 1 },
  });
  const mWood = ctx.mat('timber', { convex: 0.7 });
  // 里面的木头（盖子内面、内壁、箱底）：盖子内面几乎竖着朝镜头，光往上偏 0.8、档位放到很低 → 落亮档，当网卷的浅色底
  const mIn = ctx.mat('timber', {
    convex: 0.3,
    lightUp: 0.8,
    bands: [-0.75, -0.45],
    elem: { kind: 'planks', space: 'local', p: [1, 0, 0, 0.13], seam: 1, hi: 0 },
  });
  const mBrass = ctx.mat('brass');

  const b = new Bag();
  // 木底座（比箱身宽一圈，压住地面）
  b.box(mWood, W + 0.06, 0.08, D + 0.06, 0, 0, 0);
  // 箱身四面（空心：里面看得到）
  b.box(mBoxFront, W, H - 0.08, T, 0, 0.08, D / 2 - T / 2);
  b.box(mBox, W, H - 0.08, T, 0, 0.08, -D / 2 + T / 2);
  for (const s of [-1, 1]) b.box(mBox, T, H - 0.08, D - 2 * T, s * (W / 2 - T / 2), 0.08, 0);
  // 里面：没上漆的木头（内壁 + 垫高的底），暗卷的网压在浅色木头上才读得出来
  b.box(mIn, W - 2 * T, 0.02, D - 2 * T, 0, 0.4, 0);
  b.box(mIn, W - 2 * T, H - 0.42, 0.012, 0, 0.42, -D / 2 + T + 0.006);
  // 木口沿：四条压边（上沿一行亮边）
  b.box(mWood, W + 0.04, 0.06, 0.07, 0, H, D / 2 - 0.015);
  b.box(mWood, W + 0.04, 0.06, 0.07, 0, H, -D / 2 + 0.015);
  for (const s of [-1, 1]) b.box(mWood, 0.07, 0.06, D - 0.06, s * (W / 2 - 0.015), H, 0);
  // 铜扣（前面东角，口沿下）+ 两个铜合页（后面）
  b.box(mBrass, 0.09, 0.12, 0.03, W / 2 - 0.14, H - 0.12, D / 2 + 0.01);
  for (const s of [-1, 1]) b.box(mBrass, 0.1, 0.05, 0.04, s * 0.24, H + 0.03, -D / 2 - 0.01);
  b.into(root);

  // ── 盖子（绕后沿转）────────────────────────────────
  const hinge = new THREE.Group();
  hinge.position.set(0, H + 0.06, -D / 2 + 0.005);
  root.add(hinge);
  const lid = new Bag();
  // 盖板（外面俱乐部蓝）+ 内面一块木板（掀开以后朝镜头）+ 前沿一道蓝的唇
  lid.box(mBox, W + 0.04, 0.05, D + 0.02, 0, 0, (D + 0.02) / 2);
  lid.box(mIn, W - 0.08, 0.015, D - 0.1, 0, -0.012, (D + 0.02) / 2);
  lid.box(mBox, W + 0.04, 0.09, 0.04, 0, -0.06, D);
  lid.into(hinge);

  // ── 箱子里的东西 ───────────────────────────────────
  // 卷着的备用网：一卷暗靛（net）横在前半（掀开的盖子挡不到），两头白网带；比口沿高出 0.1 米
  const net = new Bag();
  const mNet = ctx.mat('net', { convex: 0.4, lightUp: 0.3 });
  const mTape = ctx.mat('netTape', { convex: 0.5 });
  const rr = 0.13;
  net.add(mNet, new THREE.CylinderGeometry(rr, rr, W - 0.2, 10).rotateZ(Math.PI / 2).translate(0, H + 0.01, 0.06));
  for (const s of [-1, 1])
    net.add(
      mTape,
      new THREE.CylinderGeometry(rr + 0.008, rr + 0.008, 0.06, 10)
        .rotateZ(Math.PI / 2)
        .translate(s * 0.27, H + 0.01, 0.06),
    );
  // 网带的头从卷上耷拉下来一截（白，搭在前口沿上）
  net.box(mTape, 0.1, 0.03, 0.16, 0.12, H + 0.02, 0.17, 0.5, 0, 0);
  const gNet = net.into();

  // 绞盘摇把：一根斜靠在东北角的方杆（金属）+ 顶上的曲柄和橙色握把
  const crank = new Bag();
  const mMetal = ctx.mat('metal', { convex: 0.6 });
  crank.box(mMetal, 0.06, 0.48, 0.06, 0.28, 0.4, -0.12, 0.25, 0, -0.35);
  crank.box(mMetal, 0.18, 0.06, 0.06, 0.4, 0.83, -0.02, 0, 0, 0);
  crank.box(ctx.mat('toolOrange', { convex: 0.6 }), 0.07, 0.12, 0.07, 0.48, 0.86, -0.02);
  const gCrank = crank.into();

  // 捡球管：一根斜靠在西边的金属管，头（胖一点的笼子）朝上，笼里卡着一个黄球
  const tube = new Bag();
  const tubeLean = new THREE.Matrix4().compose(
    new THREE.Vector3(-0.27, 0.36, -0.1),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0.32, 0, 0.18)),
    new THREE.Vector3(1, 1, 1),
  );
  tube.add(mMetal, new THREE.CylinderGeometry(0.035, 0.035, 0.5, 6).translate(0, 0.25, 0), tubeLean);
  tube.add(mMetal, new THREE.CylinderGeometry(0.075, 0.075, 0.18, 8, 1, true).translate(0, 0.58, 0), tubeLean);
  tube.add(mMetal, new THREE.CylinderGeometry(0.08, 0.08, 0.03, 8).translate(0, 0.67, 0), tubeLean);
  tube.add(ctx.mat('ball', { convex: 0.4 }), new THREE.SphereGeometry(0.06, 8, 5).translate(0, 0.56, 0), tubeLean);
  const gTube = tube.into();

  root.add(gNet, gCrank, gTube);
  // 小道具：不接投影（场边带东头在东围网的影子里；接了就是一块暗，盖子、网卷都读不出来）
  ctx.mats.prepare(root, { receive: false });

  const items = { net: true, crank: true, tube: true };
  const setLid = (k: number) => {
    hinge.rotation.x = -LID_OPEN * Math.min(1, Math.max(0, k));
  };
  setLid(1);
  root.userData.setLid = setLid;
  root.userData.items = items;
  root.userData.setItems = (s: Partial<typeof items>) => {
    Object.assign(items, s);
    gNet.visible = items.net;
    gCrank.visible = items.crank;
    gTube.visible = items.tube;
  };
  return root;
}

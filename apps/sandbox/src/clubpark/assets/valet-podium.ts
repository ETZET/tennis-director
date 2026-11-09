// 代客台：一张木讲台（竖板，台面往北斜 = 朝着站在后面的代客，台面上一本摊开的白钥匙本），
// 正面（朝南、朝镜头）一块深蓝牌面，中间一颗网球徽标；后面一把俱乐部遮阳伞（奶油 / 俱乐部蓝相间的八片伞面）。
//
// 伞的位置：伞心在台子后面偏东（本地 +0.25, −1.15），伞沿高 2.35 —— 站在台后（本地 z −0.5）的代客帽子不被伞沿挡
// （伞沿前沿 z −0.15，遮挡条件 z人 > z沿 − (y沿 − 2.0)）；太阳在北边后上方，伞的投影往南 2 米多，罩住代客的上半身和台子。
//
// userData（本地坐标）：
//   anchors.stand   代客站的位置（台子后面，面朝南）
//   anchors.ledger  钥匙本（台面上，递钥匙、签字）
//   setUmbrella(open)  伞撑开 / 收起（收起 = 一根捆好的布卷；风大、下班）
import * as THREE from 'three';
import type { AssetCtx } from '../world';
import { box, cyl, merge, xf } from './valet/kit';

/** 台子：宽、深、台面前沿高、后沿高 */
const POD = { w: 0.62, d: 0.44, hFront: 1.12, hBack: 1.0 };
/** 伞：伞心（本地 x, z）、伞沿半径、伞沿高、伞顶高、几片 */
const UMB = { x: 0.25, z: -1.15, r: 1.0, yRim: 2.35, yTop: 2.68, n: 8 };

export function build(ctx: AssetCtx): THREE.Object3D {
  const g = new THREE.Group();
  g.name = 'valet-podium';
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, name: string) => {
    const m = new THREE.Mesh(geo, mat);
    m.name = name;
    g.add(m);
    return m;
  };
  const hw = POD.w / 2;
  const hd = POD.d / 2;

  // ── 木台：踢脚（深）+ 竖板台身 + 斜台面 ───────────────
  const body = [box(POD.w, POD.hBack - 0.08, POD.d, 0, 0.08, 0)];
  // 台面：一块斜板，前（南）高后（北）低，四边出 0.04
  const tilt = Math.atan2(POD.hFront - POD.hBack, POD.d);
  const topLen = Math.hypot(POD.d, POD.hFront - POD.hBack) + 0.08;
  // 台身上沿补一条三角（台面下面的斜边）：用一块往北斜的板压住
  const top = xf(new THREE.BoxGeometry(POD.w + 0.08, 0.05, topLen), {
    rx: -tilt,
    y: (POD.hFront + POD.hBack) / 2,
    z: 0,
  });
  const wedge = xf(new THREE.BoxGeometry(POD.w, POD.hFront - POD.hBack, 0.05), {
    y: POD.hBack + (POD.hFront - POD.hBack) / 2,
    z: hd - 0.025,
  });
  add(
    merge([...body, wedge]),
    ctx.mat('timber', { elem: { kind: 'planks', p: [1, 0, 0, 0.12], seam: 1, hi: 1 } }),
    'body',
  );
  add(
    merge([top, box(POD.w + 0.06, 0.08, POD.d + 0.06, 0, 0, 0)]),
    ctx.mat('timber', { noShadowReceive: true }),
    'top',
  );

  // ── 正面牌子：深蓝底 + 网球徽标（朝镜头：lightUp + 低 bands 落中档）──
  const plH = 0.42;
  const plY = 0.48;
  add(box(0.48, plH, 0.04, 0, plY, hd + 0.02), ctx.mat('signBoard', { lightUp: 0.5, bands: [-0.6, 0.6] }), 'plaque');
  const ballGeo = new THREE.CircleGeometry(0.14, 12).translate(0, plY + plH / 2, hd + 0.045);
  add(ballGeo, ctx.mat('ball', { noShadowReceive: true, lightUp: 0.5, bands: [-0.6, 0.6] }), 'emblem');

  // ── 钥匙本：摊开的白本子，贴着斜台面 ───────────────────
  const ledger = xf(new THREE.BoxGeometry(0.34, 0.03, 0.24), {
    rx: -tilt,
    x: -0.04,
    y: (POD.hFront + POD.hBack) / 2 + 0.035,
    z: 0.02,
  });
  add(ledger, ctx.mat('clothWhite', { noShadowReceive: true }), 'ledger');

  // ── 伞：配重底座 + 伞杆 + 八片伞面（奶油 / 蓝相间）+ 顶珠 ─────────
  const steel = ctx.mat('steel');
  const pole = [
    cyl(0.22, 0.07, 10, UMB.x, 0, UMB.z, 0.18),
    cyl(0.05, UMB.yTop + 0.06, 6, UMB.x, 0, UMB.z),
    cyl(0.05, 0.08, 6, UMB.x, UMB.yTop + 0.04, UMB.z, 0.02),
  ];
  add(merge(pole), steel, 'pole');
  const panels: [THREE.BufferGeometry[], THREE.BufferGeometry[]] = [[], []];
  // 每片：伞顶 + 伞沿上两点的三角（加一点厚度：上下各一片，法线朝外上方）
  for (let i = 0; i < UMB.n; i++) {
    const a0 = ((i + 0.5) / UMB.n) * Math.PI * 2;
    const a1 = ((i + 1.5) / UMB.n) * Math.PI * 2;
    const p0 = new THREE.Vector3(UMB.x, UMB.yTop, UMB.z);
    const p1 = new THREE.Vector3(UMB.x + Math.cos(a0) * UMB.r, UMB.yRim, UMB.z + Math.sin(a0) * UMB.r);
    const p2 = new THREE.Vector3(UMB.x + Math.cos(a1) * UMB.r, UMB.yRim, UMB.z + Math.sin(a1) * UMB.r);
    // 伞沿往下垂一小条（朝外的竖条：伞面的厚度，屏幕上 1～2 行）
    const drop = 0.08;
    const p1d = p1.clone().setY(UMB.yRim - drop);
    const p2d = p2.clone().setY(UMB.yRim - drop);
    const geo = new THREE.BufferGeometry().setFromPoints([p0, p2, p1, p1, p2, p2d, p1, p2d, p1d]);
    geo.computeVertexNormals();
    panels[i % 2].push(geo);
  }
  const canvasOpts = { side: THREE.DoubleSide };
  const open = [
    add(merge(panels[0]), ctx.mat('canvas', canvasOpts), 'umbrella-cream'),
    add(merge(panels[1]), ctx.mat('canvasStripe', canvasOpts), 'umbrella-blue'),
  ];
  // 收起的伞：一根布卷（奶油，扎一道蓝带）
  const furled = add(
    merge([cyl(0.1, 1.1, 8, UMB.x, UMB.yTop - 1.15, UMB.z, 0.05)]),
    ctx.mat('canvas', { lightUp: 0.3 }),
    'umbrella-furled',
  );
  const tie = add(cyl(0.095, 0.08, 8, UMB.x, UMB.yTop - 0.75, UMB.z), ctx.mat('canvasStripe'), 'umbrella-tie');
  furled.visible = false;
  tie.visible = false;

  ctx.mats.prepare(g);
  for (const n of ['emblem', 'ledger', 'plaque']) {
    const o = g.getObjectByName(n);
    if (o) o.castShadow = false;
  }

  g.userData.anchors = {
    stand: new THREE.Vector3(0, 0, -hd - 0.3),
    ledger: new THREE.Vector3(-0.04, (POD.hFront + POD.hBack) / 2 + 0.06, 0.02),
  };
  g.userData.setUmbrella = (o: boolean) => {
    for (const m of open) m.visible = o;
    furled.visible = !o;
    tie.visible = !o;
  };
  void hw;
  return g;
}

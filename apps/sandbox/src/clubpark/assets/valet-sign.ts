// "代客泊车"立牌：单杆立牌（铸铁圆座 + 青铜方杆 + 青铜框的深蓝牌子，往后仰一点），
// 牌面一个奶油色的小车图标（侧面：车身、车顶、两个轮子的缺口），不写字。
// 牌面朝镜头：lightUp + 低 bands 落中档，图标同样落中档（奶油金）。
import * as THREE from 'three';
import type { AssetCtx } from '../ctx';
import { box, cyl, merge, polyShape, shapeAt, xf } from './valet/kit';

/** 牌子：宽、高、底边高、后仰（弧度） */
const SIGN = { w: 0.8, h: 0.6, y: 0.58, lean: 0.14 };

export function build(ctx: AssetCtx): THREE.Object3D {
  const g = new THREE.Group();
  g.name = 'valet-sign';
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, name: string) => {
    const m = new THREE.Mesh(geo, mat);
    m.name = name;
    g.add(m);
    return m;
  };
  // 牌子的本地框架：原点 = 牌子下沿中点，绕 x 后仰
  const frame = (geo: THREE.BufferGeometry) => xf(geo, { rx: -SIGN.lean, y: SIGN.y, z: 0 });

  // ── 座 + 杆 ─────────────────────────────────────────
  add(merge([cyl(0.2, 0.06, 10, 0, 0, 0, 0.16), cyl(0.07, 0.05, 8, 0, 0.06, 0, 0.05)]), ctx.mat('ironwork'), 'base');
  const B = 0.05;
  const steel = [
    box(0.07, SIGN.y + 0.05, 0.07, 0, 0.06, -0.03),
    // 牌框：四条青铜边（框在牌子外面一圈）
    frame(box(SIGN.w + B * 2, B, 0.06, 0, -B, 0)),
    frame(box(SIGN.w + B * 2, B, 0.06, 0, SIGN.h, 0)),
    frame(box(B, SIGN.h, 0.06, -SIGN.w / 2 - B / 2, 0, 0)),
    frame(box(B, SIGN.h, 0.06, SIGN.w / 2 + B / 2, 0, 0)),
    // 顶上一颗小球帽
    frame(cyl(0.035, 0.05, 6, 0, SIGN.h + B, 0, 0.02)),
  ];
  add(merge(steel), ctx.mat('steel'), 'post');
  add(
    frame(box(SIGN.w, SIGN.h, 0.04, 0, 0, 0)),
    ctx.mat('signBoard', { lightUp: 0.55, bands: [-0.7, 0.6], noShadowReceive: true }),
    'board',
  );

  // ── 图标：一辆侧面的小车（奶油），两个轮子是缺口里的小圆 ──────────
  const car = polyShape([
    [-0.3, 0.03],
    [0.3, 0.03],
    [0.3, 0.1],
    [0.22, 0.13],
    [0.12, 0.13],
    [0.06, 0.24],
    [-0.14, 0.24],
    [-0.22, 0.13],
    [-0.3, 0.11],
  ]);
  // 车窗：一个缺口（露出深蓝底）
  const win = new THREE.Path();
  win.moveTo(-0.15, 0.155);
  win.lineTo(0.04, 0.155);
  win.lineTo(0.0, 0.205);
  win.lineTo(-0.11, 0.205);
  win.closePath();
  car.holes.push(win);
  const iconY = 0.2;
  const zI = 0.025;
  const icon = [
    frame(shapeAt(car, 0, iconY, zI)),
    frame(new THREE.CircleGeometry(0.075, 10).translate(-0.17, iconY, zI + 0.001)),
    frame(new THREE.CircleGeometry(0.075, 10).translate(0.17, iconY, zI + 0.001)),
  ];
  add(merge(icon), ctx.mat('signPaint', { noShadowReceive: true, lightUp: 0.55, bands: [-0.7, 0.6] }), 'icon');
  ctx.mats.prepare(g);
  for (const n of ['icon']) {
    const o = g.getObjectByName(n);
    if (o) o.castShadow = false;
  }
  return g;
}

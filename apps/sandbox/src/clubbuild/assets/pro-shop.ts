// pro-shop（球具店）：2 × 2 格 = 6 × 6 米，门格 (1, 1) = 前排东边那格。
// 一间白灰泥的小铺子（5.5 × 3.3 米，檐高 3.3）+ 红瓦四坡顶；正面一道传教士式的弧形山花（白灰泥，陶砖压顶）高出屋檐，山花上挂会所招牌；
// 门脸：西半边一个敞开的橱窗（陶砖窗套，窗洞里是暖赭色的店里）、东半边一扇拱形玻璃门（正对门格）；
// 门脸前一整条俱乐部蓝 / 奶油的条纹雨篷（斜面 + 一圈垂边）；墙脚一圈陶砖踢脚；门前一小块陶砖地。
// 复用：clubhouse 的 window-display（橱窗里的展台：穿会所球衣的模特 + 两支彩色球拍）、arch-window v1（拱形落地门）、
// club-sign（蓝漆板 + 网球 + 交叉球拍的会徽）、shop-sign v0（门口的蓝色球拍立牌）；clubsite 的 ball-hopper v1（满满一筐球）；
// clubdesk 的 pot + clubsite 的 agave（陶罐龙舌兰）。
// 新画：墙体、橱窗洞、山花、屋顶、雨篷、踢脚、门前地（材质 stucco、plaster、cap、roofTile、canvas、canvasStripe、tile，都是现成的）。
// 墙：正面落中档、东西两面落亮档（WALL_O：太阳在后方，朝镜头的面 l ≈ −0.35、侧面 ≈ 0）；墙不接投影（背光的墙接了就是一整块自己的影子）。
// 雨篷只伸出 0.5 米、挂得高（3.25 → 2.95）：45° 往下看，篷沿的屏幕高度 y − z 要高过橱窗里模特的头，橱窗才露得出来。
import * as THREE from 'three';
import { build as pot } from '../../clubdesk/assets/pot';
import { build as archWindow } from '../../clubhouse/assets/arch-window';
import { build as clubSign } from '../../clubhouse/assets/club-sign';
import { build as shopSign } from '../../clubhouse/assets/shop-sign';
import { build as windowDisplay } from '../../clubhouse/assets/window-display';
import { EL } from '../../clubhouse/palette';
import { build as hopper } from '../../clubsite/assets/ball-hopper';
import { build as agave } from '../../clubsite/nature/agave';
import type { ToonOpts } from '../../clubsite/render/toon';
import type { AssetCtx } from '../ctx';
import { addRoof, Bins, bx, FACE, faceZ, flat, put } from './bld-kit';

/** 墙：往上偏光，正面（l ≈ −0.35）落中档、侧面（l ≈ 0）落亮档 */
const WALL_O: ToonOpts = { elem: EL.stucco, lightUp: 0.55, bands: [-0.5, -0.12], noShadowReceive: true };

/** 一条弧形的上沿（山花）：从 (−hw, y0) 往里收、中间一个半圆顶（半径 r，圆心高 yc），点从西到东 */
function gableTop(hw: number, y0: number, yc: number, r: number): THREE.Vector2[] {
  const pts: THREE.Vector2[] = [];
  // 两肩：(−hw, y0) → (−r, yc) 一段往上凹的弧（四分之一椭圆）
  const n = 6;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = (t * Math.PI) / 2;
    pts.push(new THREE.Vector2(-hw + (hw - r) * Math.sin(a), y0 + (yc - y0) * (1 - Math.cos(a))));
  }
  for (let i = 1; i < 8; i++) {
    const a = Math.PI - (i / 8) * Math.PI;
    pts.push(new THREE.Vector2(Math.cos(a) * r, yc + Math.sin(a) * r));
  }
  for (let i = n; i >= 0; i--) {
    const t = i / n;
    const a = (t * Math.PI) / 2;
    pts.push(new THREE.Vector2(hw - (hw - r) * Math.sin(a), y0 + (yc - y0) * (1 - Math.cos(a))));
  }
  return pts;
}

/** 沿 z 挤出一块形状（z0 → z0 + d） */
function extrude(pts: THREE.Vector2[], z0: number, d: number): THREE.BufferGeometry {
  const s = new THREE.Shape(pts);
  return new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false, curveSegments: 1 }).translate(0, 0, z0);
}

export function build(ctx: AssetCtx): THREE.Object3D {
  const root = new THREE.Group();
  root.name = 'pro-shop';
  const B = new Bins(ctx);

  const X0 = -2.75;
  const X1 = 2.75;
  const ZB = -2.8; // 后墙
  const ZF = 0.5; // 门脸
  const ZR = -0.2; // 橱窗洞的里墙
  const EAVE = 3.6;
  // 橱窗洞
  const W0 = -2.35;
  const W1 = -0.35;
  const WY0 = 0.45;
  const WY1 = 2.25;

  // ── 墙体：后面一整块 + 门脸一层（橱窗那里开洞）──
  B.add('stucco', bx(X1 - X0, EAVE, ZR - ZB, 0, 0, (ZB + ZR) / 2), WALL_O);
  const slab = (x0: number, x1: number, y0: number, y1: number) =>
    B.add('stucco', bx(x1 - x0, y1 - y0, ZF - ZR, (x0 + x1) / 2, y0, (ZR + ZF) / 2), WALL_O);
  slab(X0, W0, 0, EAVE);
  slab(W0, W1, 0, WY0);
  slab(W0, W1, WY1, EAVE);
  slab(W1, X1, 0, EAVE);
  // 窗洞里：暖赭色的店里（里墙 + 两侧 + 顶），窗台陶砖
  B.add('plaster', faceZ(W0, WY0, W1 - W0, WY1 - WY0, ZR + 0.01), { ...FACE, bands: [-0.5, -0.2] }, 'in', false);
  B.add('cap', bx(W1 - W0 + 0.16, 0.08, ZF - ZR + 0.12, (W0 + W1) / 2, WY0 - 0.04, (ZR + ZF) / 2 + 0.06), {
    lightUp: 0.4,
    convex: 0.4,
    noShadowReceive: true,
  });
  // 陶砖窗套（1.5 纹素宽的框，贴在门脸上）
  const frame = { ...FACE, convex: 0.3 };
  const FW = 0.14;
  B.add('cap', bx(FW, WY1 - WY0 + FW, 0.06, W0 - FW / 2, WY0, ZF + 0.03), frame, 'frame');
  B.add('cap', bx(FW, WY1 - WY0 + FW, 0.06, W1 + FW / 2, WY0, ZF + 0.03), frame, 'frame');
  B.add('cap', bx(W1 - W0 + 2 * FW, FW, 0.06, (W0 + W1) / 2, WY1, ZF + 0.03), frame, 'frame');
  // 墙脚一圈陶砖踢脚（正面、东西两面）
  const base = { ...FACE, convex: 0.3, bands: [-0.5, -0.12] as [number, number] };
  B.add('cap', bx(X1 - X0 + 0.08, 0.32, 0.06, 0, 0, ZF + 0.03), base, 'base');
  B.add('cap', bx(0.06, 0.32, ZF - ZB, X0 - 0.03, 0, (ZB + ZF) / 2), base, 'base');
  B.add('cap', bx(0.06, 0.32, ZF - ZB, X1 + 0.03, 0, (ZB + ZF) / 2), base, 'base');

  // ── 红瓦四坡顶 + 檐下一道陶砖檐口 ──
  addRoof(B, [X0, X1, ZB, ZF], EAVE, 1.1, 0.18, { lightUp: 0.2 });
  B.add(
    'cap',
    bx(X1 - X0 + 0.16, 0.12, ZF - ZB + 0.16, 0, EAVE - 0.12, (ZB + ZF) / 2),
    { ...FACE, convex: 0.3 },
    'eave',
  );

  // ── 门脸上的弧形山花（白灰泥，陶砖压顶），高出屋檐 ──
  const GH = 1.6; // 半宽
  const top = gableTop(GH, EAVE + 0.55, EAVE + 1.05, 0.62);
  const gz = ZF - 0.28;
  const body = [new THREE.Vector2(-GH, EAVE - 0.4), new THREE.Vector2(GH, EAVE - 0.4), ...top.slice().reverse()];
  B.add('stucco', extrude(body, gz, 0.28), WALL_O);
  const capPts = [...top.map((p) => new THREE.Vector2(p.x, p.y + 0.13)), ...top.slice().reverse()];
  B.add('cap', extrude(capPts, gz - 0.04, 0.36), { lightUp: 0.4, convex: 0.5 }, 'gable');

  // ── 条纹雨篷：门脸 y 3.25 → 前沿（伸出 0.5）y 2.95；沿 x 一条条蓝 / 奶油；前沿一圈 0.2 的垂边 ──
  const AY0 = 3.25;
  const AY1 = 2.95;
  const AZ1 = ZF + 0.5;
  const n = 12;
  const aw = (X1 - X0 - 0.1) / n;
  const cloth: ToonOpts = {
    lightUp: 0.4,
    bands: [-0.45, 0.35],
    convex: 0.2,
    noShadowReceive: true,
    side: THREE.DoubleSide,
  };
  const valance: ToonOpts = { ...FACE, convex: 0.2 };
  for (let i = 0; i < n; i++) {
    const x0 = X0 + 0.05 + i * aw;
    const key = i % 2 ? 'canvas' : 'canvasStripe';
    const g = new THREE.BufferGeometry();
    const p = [x0, AY0, ZF, x0, AY1, AZ1, x0 + aw, AY1, AZ1, x0, AY0, ZF, x0 + aw, AY1, AZ1, x0 + aw, AY0, ZF];
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.computeVertexNormals();
    B.add(key, g, cloth, 'awning');
    // 垂边：颜色和上面那条错开（蓝下奶油、奶油下蓝）→ 一圈"齿"
    B.add(i % 2 ? 'canvasStripe' : 'canvas', faceZ(x0, AY1 - 0.18, aw, 0.18, AZ1), valance, 'valance', false);
  }
  // 雨篷两头的三角侧片（奶油）
  for (const x of [X0 + 0.05, X1 - 0.05]) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([x, AY0, ZF, x, AY1 - 0.18, AZ1, x, AY1, AZ1], 3));
    g.computeVertexNormals();
    B.add('canvas', g, { ...cloth, side: THREE.DoubleSide }, 'awning');
  }

  // ── 门前一块陶砖地 ──
  B.add(
    'tile',
    flat(-2.85, 2.85, ZF, 2.85, 0.012),
    { elem: { ...EL.terrace, seed: 41 }, edge: 0.1, convex: 0 },
    '',
    false,
  );
  B.add('cap', bx(5.7, 0.08, 0.16, 0, 0, 2.77), { convex: 0.3 }, 'curb', false);

  B.build(root, 'pro-shop:shell');

  // ── 复用的件 ──
  put(ctx, root, windowDisplay, (W0 + W1) / 2, WY0 + 0.04, ZR + 0.42, 0, 1, 0);
  put(ctx, root, archWindow, 1.45, 0, ZF + 0.15, 0, 0.92, 1);
  put(ctx, root, clubSign, 0, EAVE + 0.02, ZF + 0.01, 0, 0.9, 0);
  put(ctx, root, shopSign, -0.05, 0.012, 2.3, 0.2, 1, 0);
  put(ctx, root, hopper, -2.35, 0.012, 2.25, 0.4, 1, 1);
  put(ctx, root, pot, 2.5, 0.012, 1.05, 0, 0.85, 0);
  put(ctx, root, agave, 2.5, 0.012 + 0.85 * 0.85, 1.05, 1.1, 0.5, 2);

  return root;
}

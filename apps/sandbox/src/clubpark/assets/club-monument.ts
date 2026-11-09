// 俱乐部立牌（南花坛上，朝南 = 朝镜头）：大门的招牌朝东看不见，由它在画面里说"这是俱乐部"。
// 4.2 × 1.7 × 0.8：土坯灰泥墙身（和门柱同一种灰泥，墙脚两角剥落露砖）+ 两层陶砖压顶（中间一段加高）+
// 朝南的深蓝牌面（陶砖边框），奶油金的徽标（网球 + 交叉的两把球拍）和"俱乐部名"（假字：名字还没定，只画像字的笔画）。
// 牌面、边框、字都朝镜头：lightUp + 低 bands → 落中档，在暗档的灰泥墙前面读得出来。
import * as THREE from 'three';
import type { AssetCtx } from '../world';
import {
  BRICK,
  Bucket,
  ballSeams,
  box,
  DU,
  DV,
  FACING,
  faceOf,
  onFace,
  type R4,
  rectGeo,
  type Spall,
  STUCCO,
  stuccoBlock,
  word,
} from './gate/kit';

const W = 4.0;
const D = 0.62;
const H = 1.42;

export function build(ctx: AssetCtx): THREE.Object3D {
  const root = new THREE.Group();
  root.name = 'club-monument';
  const B = new Bucket();
  const rnd = ctx.rng(`club-monument:glyphs:${ctx.variant}`);

  const stucco = ctx.mat('adobe', STUCCO);
  const brick = ctx.mat('adobe', BRICK);
  const capM = ctx.mat('cap', {
    elem: { kind: 'stones', size: [14, 9], seam: 0, hi: 1, seed: 13 },
    toneW: [0.55, 0.12],
  });
  const frame = ctx.mat('cap', FACING);
  const board = ctx.mat('signBoard', FACING);
  const paint = ctx.mat('signPaint', FACING);
  const ball = ctx.mat('ball', FACING);

  // ── 墙身：灰泥皮 + 砖芯，朝南的墙脚两角剥落 ──
  const sp = (u: number, v: number, rows: string): Spall => ({
    u,
    v,
    rows: rows.split(' ').map((r) => r.split('-').map(Number) as [number, number]),
  });
  const { skin, core } = stuccoBlock(W, D, -0.15, H, 0, 0, DU, {
    s: [sp(-1.95, 0.0, '0-4 0-5 1-4 1-3'), sp(1.6, 0.0, '1-4 0-4 0-3'), sp(1.62, 1.12, '1-3 0-3')],
  });
  for (const g of skin) B.add(stucco, g);
  for (const g of core) B.add(brick, g, { cast: false });

  // ── 压顶：通长一层（出挑 0.1）+ 中间加高一段 ──
  B.add(capM, box(W + 0.2, 0.14, D + 0.18, 0, H, 0));
  B.add(capM, box(2.1, 0.14, D + 0.04, 0, H + 0.14, 0));

  // ── 牌面：陶砖边框（3.5 × 1.0，凸 0.05）+ 深蓝牌（3.3 × 0.8，再凸 0.04）──
  const PY = 0.72; // 牌面中心高度
  const f = faceOf(new THREE.Vector3(0, PY, D / 2), new THREE.Vector3(0, 0, 1));
  B.add(frame, onFace(new THREE.BoxGeometry(3.5, 1.0, 0.05).translate(0, 0, 0.025), f), { cast: false });
  B.add(board, onFace(new THREE.BoxGeometry(3.3, 0.8, 0.09).translate(0, 0, 0.045), f), { cast: false });
  const lift = 0.094;

  // 徽标（左边）：两把交叉的球拍（拍框是椭圆环、拍柄往下岔开）+ 前面一个网球（两条缝）
  const ex = -1.27;
  const ey = 0.0;
  for (const s of [-1, 1]) {
    const a = (s * 38 * Math.PI) / 180;
    const ring = new THREE.RingGeometry(0.11, 0.17, 14).scale(1, 1.22, 1).translate(0, 0.27, 0);
    const handle = new THREE.PlaneGeometry(0.075, 0.3).translate(0, -0.2, 0);
    const neck = new THREE.PlaneGeometry(0.06, 0.12).translate(0, 0.02, 0);
    for (const g of [ring, handle, neck]) {
      g.rotateZ(-a).translate(ex, ey, 0);
      B.add(paint, onFace(g, f, lift), { cast: false });
    }
  }
  const br = 0.17;
  const by = ey - 0.02;
  B.add(ball, onFace(new THREE.CircleGeometry(br, 16).translate(ex, by, 0), f, lift + 0.002), { cast: false });
  for (const g of ballSeams(ex, by, br, 0.05)) B.add(paint, onFace(g, f, lift + 0.004), { cast: false });

  // 名字：5 个假字（3 × 5 格，格 0.1 米 → 字高 0.5 米 ≈ 8 行）+ 下面一行小字（一个设计纹素高的短划）
  const rects: R4[] = [];
  const unit = 0.1;
  const name = word(rnd, 5, 0, 0, unit);
  const nx = -0.88;
  const ny = -0.06;
  for (const r of name.rects) rects.push([r[0] + nx, r[1] + ny, r[2] + nx, r[3] + ny]);
  let x = nx;
  const sy = -0.3;
  for (const n of [4, 2, 3]) {
    for (let i = 0; i < n; i++) {
      rects.push([x, sy, x + DU, sy + DV * 0.75]);
      x += DU * 1.6;
    }
    x += DU * 1.2;
  }
  for (const r of rects) B.add(paint, onFace(rectGeo(r), f, lift), { cast: false });

  B.build(ctx.mats, root);
  return root;
}

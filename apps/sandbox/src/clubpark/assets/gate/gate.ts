// 俱乐部东墙的大门：一份实现，两个场景共用（clubpark 的 club-gate 从外面看，clubdesk 的 east-gate 从里面看）。
// 尺寸照 clubmap2/build.ts：门柱 1.7 见方 4.6 米（z ±5.8）、柱帽 1.9 × 0.4、柱顶网球 r 0.55（球心 y 5.5）、
// 木横梁 0.8 × 0.7（底 y 3.7）沿 z 13.4 米、朝东的招牌 0.25 × 1.2 × 6.4（x +0.55，底 y 2.4）。1.9 米的土坯墙是地形，不在这里。
// 本地原点 = 门洞中心的地面（世界 x 60, z 0）；+x 朝东（门外），+z 朝南（朝镜头）。
//
// yaw 0 的相机（两个场景都是）看到的是：柱帽和网球的顶（亮档，画面里最亮的两个点）、两根柱朝南的面（暗档的灰泥，
// 柱脚和柱顶附近几块剥落露出土坯砖）、横梁的顶（屏幕上一根竖的木条，两头和中间几道铁箍）、招牌的顶边。
// 朝东的招牌侧对镜头看不见（用户定的：招牌照旧朝东，地图上读得出来），所以每根柱朝南的面上各钉一块小铜牌
// （网球徽标 + 两行假字），让大门在两个场景里都读成"俱乐部的入口"。
import * as THREE from 'three';
import {
  BRICK,
  Bucket,
  ballSeam3D,
  ballSeams,
  box,
  brassMat,
  DU,
  DV,
  FACING,
  type Face,
  faceOf,
  type KitCtx,
  onFace,
  type R4,
  rectGeo,
  type Spall,
  STUCCO,
  stuccoBlock,
  word,
} from './kit';

/** 尺寸（米），同 clubmap2/build.ts */
export const GATE_DIM = {
  pier: 1.7,
  pierH: 4.6,
  pierZ: 5.8,
  cap: 1.9,
  capH: 0.4,
  ball: 0.55,
  ballY: 5.5,
  beamW: 0.8,
  beamH: 0.7,
  beamY: 3.7,
  beamL: 13.4,
  sign: { x: 0.55, t: 0.25, y: 2.4, h: 1.2, l: 6.4 },
  /** 墙（地形）：厚 0.7、高 1.9 + 压顶 0.18 —— 南柱的南面、北柱的北面贴着它，洞和铜牌要躲开 */
  wallT: 0.7,
  wallTop: 2.08,
} as const;

/** 灰泥皮厚（= 洞的深度）：一个设计纹素 */
const SKIN = DU;

export function buildGate(ctx: KitCtx): THREE.Object3D {
  const D = GATE_DIM;
  const root = new THREE.Group();
  root.name = 'club-gate';
  const B = new Bucket();
  const rnd = ctx.rng('club-gate:glyphs');

  const stucco = ctx.mat('adobe', STUCCO);
  const brick = ctx.mat('adobe', BRICK);
  // 柱帽的陶砖顶：大块砖（14×9 纹素），不画深缝（暗缝在小顶面上是一张网），只画每块的上沿亮边；
  // 多数块取高一级 → 比沙亮，和网球一起是门上最亮的地方
  const capM = ctx.mat('cap', {
    elem: { kind: 'stones', size: [14, 9], seam: 0, hi: 1, seed: 11 },
    toneW: [0.55, 0.12],
  });
  const ballM = ctx.mat('ball', { lightUp: 0.45 });
  const seamM = ctx.mat('clothWhite', { edge: 0.2, convex: 0 });
  const beamM = ctx.mat('timber', { elem: { kind: 'planks', p: [1, 0, 0, 0.4], seam: 1, hi: 1, seed: 5 } });
  const iron = ctx.mat('ironwork');
  const board = ctx.mat('signBoard', FACING);
  const paint = ctx.mat('signPaint', FACING);
  const plate = brassMat(ctx, FACING);
  const ink = ctx.mat('signBoard', FACING);
  const ballFlat = ctx.mat('ball', FACING);
  const M = { plate, ink, ball: ballFlat };

  // ── 两根门柱：灰泥皮 + 砖芯（剥落的洞里看得见）+ 两层陶砖柱帽 + 网球 ──
  // 剥落的洞。面坐标 u = 沿面往右（米，面中心 0），v = 本地 y；每行 "左-右"（设计纹素，相对 u），行高 DV、从下往上。
  // yaw 0 下哪些地方看得见（量过）：
  // - 南柱的南面整面都看得见，但中间贴着墙（x ±0.35 到 y 1.9，压顶 ±0.45 到 2.08），柱顶中间露一截梁头（x ±0.4，y 3.7…4.4）；
  // - 北柱的南面中间被横梁的顶（x ±0.4，所有高度）和招牌的顶边（x 0.43…0.68，y < 1.85）挡住，只露左右两条。
  const sp = (u: number, v: number, rows: string): Spall => ({
    u,
    v,
    rows: rows.split(' ').map((r) => r.split('-').map(Number) as [number, number]),
  });
  const holes: Record<'n' | 's', Partial<Record<'s' | 'e' | 'n' | 'w', Spall[]>>> = {
    // 北柱（门洞北边）：南面朝门洞
    n: {
      s: [
        sp(-0.79, 0.0, '0-4 0-4 0-3 1-4 1-3 2-3'),
        sp(0.44, 3.55, '1-4 0-4 0-4 0-3 1-3'),
        sp(0.47, 2.0, '0-2 0-3 1-3'),
      ],
      e: [sp(-0.45, 0.0, '0-6 1-6 1-5 2-4')],
      w: [sp(0.05, 3.1, '0-4 0-5 1-4')],
    },
    // 南柱（门洞南边）：南面朝外（墙在中间）
    s: {
      s: [
        sp(0.42, 0.0, '0-4 0-4 1-4 1-3 2-3'),
        sp(-0.8, 0.75, '1-3 0-4 0-4 1-3'),
        sp(-0.78, 2.98, '1-4 0-6 0-6 1-5 2-4'),
        sp(0.47, 3.3, '0-3 0-3 1-3'),
      ],
      n: [sp(0.2, 0.0, '0-4 0-3 1-3')],
      w: [sp(-0.6, 0.6, '0-3 1-3')],
      e: [sp(0.2, 3.4, '0-4 1-4')],
    },
  };

  for (const [key, pz] of [
    ['n', -D.pierZ],
    ['s', D.pierZ],
  ] as const) {
    const { skin, core } = stuccoBlock(D.pier, D.pier, -0.3, D.pierH, 0, pz, SKIN, holes[key]);
    for (const g of skin) B.add(stucco, g);
    for (const g of core) B.add(brick, g, { cast: false });
    // 柱帽：下层 1.9 见方（出挑）、上层收进一圈；陶砖顶面（石块元素 10×7）
    B.add(capM, box(D.cap, 0.22, D.cap, 0, D.pierH, pz));
    B.add(capM, box(D.cap - 0.18, D.capH - 0.22, D.cap - 0.18, 0, D.pierH + 0.22, pz));
    // 柱顶网球 + 白缝（缝用球面法线，跟着球的明暗走）
    B.add(ballM, new THREE.SphereGeometry(D.ball, 12, 9).translate(0, D.ballY, pz));
    B.add(
      seamM,
      ballSeam3D(
        new THREE.Vector3(0, D.ballY, pz),
        D.ball,
        0.05,
        new THREE.Euler(key === 'n' ? 0.5 : 0.3, key === 'n' ? 0.6 : -0.9, 0.2),
      ),
      { cast: false },
    );
    // 铜牌（朝南的面）：南柱 = 墙顶以上、居中的横牌；北柱 = 横梁挡住了中间，竖牌钉在左边（墙里那一侧）露出来的那条上
    const south = new THREE.Vector3(0, 0, 1);
    if (key === 's') plaque(B, faceOf(new THREE.Vector3(0, 2.5, pz + D.pier / 2), south), 1.1, 0.64, M, rnd);
    else plaque(B, faceOf(new THREE.Vector3(-0.625, 2.62, pz + D.pier / 2), south), 0.37, 0.76, M, rnd);
  }

  // ── 木横梁：顶面两条顺梁的木纹板（中间一道缝 + 缝后一纹素亮条），四道铁箍 ──
  B.add(beamM, box(D.beamW, D.beamH, D.beamL, 0, D.beamY, 0));
  const inner = D.pierZ - D.pier / 2; // 4.95：柱内侧
  for (const z of [-inner + 1.85, -inner + 1.35, inner - 1.35, inner - 1.85])
    B.add(iron, box(D.beamW + 0.04, D.beamH + 0.04, 0.14, 0, D.beamY - 0.02, z), { cast: false });

  // ── 朝东的招牌（挂在横梁东侧下面，两根铁挂件）──
  const S = D.sign;
  B.add(board, box(S.t, S.h, S.l, S.x, S.y, 0));
  for (const z of [-S.l / 2 + 0.7, S.l / 2 - 0.7])
    B.add(iron, box(S.x + S.t / 2 + 0.04, D.beamY - S.y - S.h, 0.14, (S.x + S.t / 2 + 0.04) / 2, S.y + S.h, z), {
      cast: false,
    });
  signFace(
    B,
    faceOf(new THREE.Vector3(S.x + S.t / 2, S.y + S.h / 2, 0), new THREE.Vector3(1, 0, 0)),
    paint,
    ballFlat,
    rnd,
  );

  B.build(ctx.mats, root);
  return root;
}

/**
 * 铜牌（厚 0.05，f.o = 牌的中心，在柱面上）：网球徽标 + 几行假字（深蓝）。
 * 横牌（宽 ≥ 0.8）：徽标在左、右边两行字；竖牌：徽标在上、下面三行短字。字是一个设计纹素见方的块，字距半格。
 */
function plaque(
  B: Bucket,
  f: Face,
  W: number,
  H: number,
  M: { plate: THREE.Material; ink: THREE.Material; ball: THREE.Material },
  rnd: () => number,
) {
  const T = 0.05;
  B.add(M.plate, onFace(new THREE.BoxGeometry(W, H, T).translate(0, 0, T / 2), f), { cast: false });
  const lift = T + 0.004;
  const rects: R4[] = [];
  const line = (x0: number, y0: number, words: number[]) => {
    let x = x0;
    for (const n of words) {
      for (let i = 0; i < n; i++) {
        rects.push([x, y0, x + DU, y0 + DV]);
        x += DU * 1.5;
      }
      x += DU;
    }
  };
  if (W >= 0.8) {
    // 球 r 0.15（右沿 −0.18）；字从 −0.11 起，一行 4 个字到 0.475（牌的右沿 0.55）
    B.add(M.ball, onFace(new THREE.CircleGeometry(0.15, 12).translate(-W / 2 + 0.22, 0, 0), f, lift), { cast: false });
    const a = 1 + Math.floor(rnd() * 3);
    line(-0.11, 0.04, [a, 4 - a]);
    line(-0.11, -0.19, [3]);
  } else {
    B.add(M.ball, onFace(new THREE.CircleGeometry(0.11, 10).translate(0, H / 2 - 0.19, 0), f, lift), { cast: false });
    const x0 = -W / 2 + 0.06;
    line(x0, -0.06, [2]);
    line(x0, -0.32, [1 + Math.floor(rnd() * 2)]);
  }
  for (const r of rects) B.add(M.ink, onFace(rectGeo(r), f, lift), { cast: false });
}

/** 朝东的招牌面（6.4 × 1.2）：中间网球徽标（奶油圈 + 球 + 两条缝），两边各一个 5 字的假字词，上下各一道奶油细边 */
function signFace(B: Bucket, f: Face, paint: THREE.Material, ball: THREE.Material, rnd: () => number) {
  const lift = 0.006;
  const rects: R4[] = [];
  const unit = 0.09;
  const left = word(rnd, 5, 0, 0, unit);
  const off = 0.62;
  const gy = -0.22;
  for (const r of left.rects) rects.push([r[0] - off - left.w, r[1] + gy, r[2] - off - left.w, r[3] + gy]);
  const right = word(rnd, 5, 0, 0, unit);
  for (const r of right.rects) rects.push([r[0] + off, r[1] + gy, r[2] + off, r[3] + gy]);
  rects.push([-3.05, 0.42, 3.05, 0.48], [-3.05, -0.48, 3.05, -0.42]);
  for (const r of rects) B.add(paint, onFace(rectGeo(r), f, lift), { cast: false });
  B.add(paint, onFace(new THREE.RingGeometry(0.4, 0.48, 18), f, lift), { cast: false });
  B.add(ball, onFace(new THREE.CircleGeometry(0.4, 18), f, lift), { cast: false });
  for (const g of ballSeams(0, 0, 0.4, 0.06)) B.add(paint, onFace(g, f, lift + 0.002), { cast: false });
}

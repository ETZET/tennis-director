// #10 players-gate：西头的球员通道 —— 一座白灰泥拱门，门洞朝东西（球员从会所往东走进场）。
// 两根 1.0 米见方、3.6 米高的灰泥门柱（柱脚一圈陶砖色勒脚、柱头一圈压顶 + 红瓦四坡小帽），
// 两柱之间架一道矮一截的门楣（顺着 z），门楣下面是一道分段的弧（一级级收下去的拱腹），门楣上一个红瓦小坡顶（屋脊顺着 z）。
// 柱子比门楣高 —— yaw 0 下（侧对镜头）看得出"两根柱子夹着一道拱"：上头北柱的瓦帽、中间一段瓦顶、下头南柱的瓦帽和朝镜头的南面。
// 门楣南头朝东挑出一块俱乐部蓝的立牌（正对镜头，"CENTRE COURT"：一颗网球 + 两条奶油粗划，不写真字）。
// 本地原点 = 门洞中心的地面；门洞沿 x 穿过，两根柱子在 z = ±2.6。宽（x）1.2、高 4.2、长（z）6.2。
import * as THREE from 'three';
import type { AssetCtx } from '../ctx';
import { Bag, DU, DV, FACE_LIT, FACE_MID, tris, V } from './court/kit';

/** 门洞宽（两柱内沿之间）、柱宽、柱高、门楣底 / 顶、门楣宽 */
const G = { span: 4.2, col: 1.0, colH: 3.6, lintel0: 2.78, lintel1: 3.3, w: 0.86 };

export function build(ctx: AssetCtx): THREE.Object3D {
  const root = new THREE.Group();
  root.name = 'players-gate';
  const stuccoElem = { kind: 'paint' as const, size: [12, 8] as [number, number], space: 'local' as const, seed: 7 };
  const stucco = ctx.mat('stucco', { convex: 0.5, elem: stuccoElem });
  // 朝镜头的南柱南面：抬光落中档、不接收投影（不然瓦帽的影子把柱面切成一条条）
  const stuccoFace = ctx.mat('stucco', { ...FACE_MID, convex: 0.5, elem: stuccoElem });
  const cap = ctx.mat('cap', { convex: 0.8 });
  const tile = ctx.mat('roofTile', {
    convex: 0.3,
    elem: { kind: 'planks', p: [0, 0, 1, 0.42], seam: 1, hi: 0, space: 'local' },
    toneW: [0.18, 0.14],
  });
  const tileCap = ctx.mat('roofTile', { convex: 0.3 });
  const board = ctx.mat('counter', { ...FACE_MID, convex: 0.5 });
  const iron = ctx.mat('ironwork', { convex: 0.5, noShadowReceive: true });
  const paint = ctx.mat('signPaint', FACE_LIT);
  const ball = ctx.mat('ball', FACE_LIT);

  const bag = new Bag();
  const zc = (G.span + G.col) / 2; // 柱心 z
  const hc = G.col / 2;
  for (const s of [-1, 1]) {
    const z = s * zc;
    bag.box(stucco, G.col, G.colH - 0.46, G.col, 0, 0.3, z);
    // 勒脚（陶砖色 0.3 高，宽出一点）+ 柱头压顶（0.16，宽出 0.08）
    bag.box(cap, G.col + 0.1, 0.3, G.col + 0.1, 0, 0, z);
    bag.box(cap, G.col + 0.16, 0.16, G.col + 0.16, 0, G.colH - 0.16, z);
    // 四坡瓦帽（0.42 高）
    const y0 = G.colH;
    const y1 = G.colH + 0.42;
    const r = hc + 0.1;
    const c = V(0, y1, z);
    const p = [V(-r, y0, z - r), V(r, y0, z - r), V(r, y0, z + r), V(-r, y0, z + r)];
    bag.add(tileCap, tris([c, p[3], p[2], c, p[2], p[1], c, p[1], p[0], c, p[0], p[3]]));
  }
  // 南柱朝镜头的面：贴一层抬光的面（落中档，灰泥斑还在）
  bag.add(
    stuccoFace,
    new THREE.PlaneGeometry(G.col, G.colH - 0.76).translate(0, 0.3 + (G.colH - 0.76) / 2, zc + hc + 0.002),
  );
  // ── 门楣（两柱之间，顺着 z）──
  bag.box(stucco, G.w, G.lintel1 - G.lintel0, G.span + 0.1, 0, G.lintel0, 0);
  // ── 拱腹：门楣下面一级级往下收的块（4 级，每级 0.12；越靠柱子越低）──
  const steps = 4;
  for (let i = 0; i < steps; i++) {
    const t = (i + 1) / (steps + 1);
    const half = (G.span / 2) * Math.sqrt(1 - t * t);
    const h = 0.12;
    const y = G.lintel0 - (i + 1) * h;
    for (const s of [-1, 1]) {
      const z0 = s * (G.span / 2);
      const z1 = s * half;
      const len = Math.abs(z0 - z1);
      if (len < 0.05) continue;
      bag.box(stucco, G.w - 0.08, h, len, 0, y, (z0 + z1) / 2);
    }
  }
  // ── 门楣上的红瓦小坡顶：屋脊顺着 z，东西两坡（伸出门楣 0.12），只在两柱之间 ──
  const hx = G.w / 2 + 0.12;
  const z0 = -G.span / 2;
  const z1 = G.span / 2;
  const ridge = G.lintel1 + 0.3;
  const eave = G.lintel1 - 0.04;
  bag.add(
    tile,
    tris([
      // 东坡（法线 +x +y）
      V(0, ridge, z1),
      V(hx, eave, z1),
      V(hx, eave, z0),
      V(0, ridge, z1),
      V(hx, eave, z0),
      V(0, ridge, z0),
      // 西坡
      V(0, ridge, z0),
      V(-hx, eave, z0),
      V(-hx, eave, z1),
      V(0, ridge, z0),
      V(-hx, eave, z1),
      V(0, ridge, z1),
    ]),
  );
  for (const s of [-1, 1]) bag.box(tile, 0.08, 0.08, z1 - z0, s * (hx - 0.04), eave - 0.08, 0);
  bag.box(cap, 0.12, 0.07, z1 - z0, 0, ridge - 0.04, 0);
  // ── 立牌：门楣南头朝东挑出（正对镜头），一根铁挑杆 + 两根吊杆 ──
  const bw = 1.3;
  const bh = 0.64;
  const bx = G.w / 2 + 0.2 + bw / 2;
  const by = G.lintel0 - 0.1 - bh;
  const bz = G.span / 2 - 0.45;
  bag.box(iron, bw + 0.3, 0.07, 0.07, G.w / 2 + (bw + 0.3) / 2, G.lintel0 + 0.05, bz);
  for (const ox of [-0.5, 0.5]) bag.box(iron, 0.05, G.lintel0 + 0.05 - (by + bh), 0.05, bx + ox, by + bh, bz);
  bag.box(board, bw, bh, 0.08, bx, by, bz);
  const fz = bz + 0.045;
  bag.box(ball, 3 * DU, 2 * DV, 0.02, bx - bw / 2 + 0.24, by + bh / 2 - DV, fz);
  bag.quad(paint, 7 * DU, DV, bx + 0.12, by + bh - 0.18, fz + 0.012);
  bag.quad(paint, 6 * DU, DV, bx + 0.08, by + 0.2, fz + 0.012);
  bag.into(root);

  ctx.mats.prepare(root);
  return root;
}

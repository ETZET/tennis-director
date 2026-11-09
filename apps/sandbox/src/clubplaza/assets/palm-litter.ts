// #4 palm-litter：蒲葵掉下来的枯叶 —— 一片扇形的枯叶（折扇一样的褶 + 长柄）+ 一两片碎叶，平贴在陶砖上或漂在水面上。
// 元素 = 扇面的一条条叶裂（每条一个深浅，顶点色 0.86～1.0）+ 褶（相邻两条一条朝光一条背光，色阶自己分档）。
// 颜色：枯叶的草秆色，比陶砖亮一截（亮档 L 213 对陶砖 177；暗档 L 135 对陶砖影子 97）—— 落在蒲葵荫里也读得出来。
//
// 变体：v0 一大片 + 一条碎叶 + 一小片；v1 中等一片（叶柄折断）+ 两条碎叶；v2 两片叠着的一堆 + 一条碎叶（树根下）；
//       v3 / v4 = v0 / v1 **漂在水上**（叶边一圈 1 纹素的亮水纹，慢慢转一点）。SLOTS 里 litter-water / litter-water2 要用 v3 / v4。
// userData：
// - `setCount(n)`：只显示前 n 片（0 = 扫干净 / 捞干净）；`count`、`max`
// - `pieces`：每片的本地 [x, z]（米，按 setCount 的顺序；捞网 / 扫帚的目标点）
// - `setFloating(on)`：开关水纹圈（v3/v4 默认开）
// - `update(dt, t)`：漂着的时候慢慢转（±2°，7 秒一轮）
import * as THREE from 'three';
import type { AssetCtx } from '../world';
import { merge, tint, tris, v3 } from './life/kit';

/** 枯叶（局部新色）：亮 #f2d488 L213、中 #c8a070 L165、暗 #9a8090 L135（暗档故意亮：蒲葵荫里的陶砖影子 L 97） */
const LEAF: [number, number, number] = [0xf2d488, 0xc8a070, 0x9a8090];
/** 水纹：池水亮边色（fountainWater 的 hi 三档） */
const RIPPLE: [number, number, number] = [0x8cf0ee, 0x5cc8dc, 0x3c74b8];

interface Piece {
  geo: THREE.BufferGeometry;
  ring: THREE.BufferGeometry | null;
  at: [number, number];
}

/** 把片内坐标（x 沿叶柄、z 横向）转到资产本地：转 rot、挪到 (px, pz) */
function place(g: THREE.BufferGeometry, px: number, pz: number, rot: number) {
  return g.rotateY(rot).translate(px, 0, pz);
}

/** 三角形都朝上（叶子平躺，背面看不见） */
function up(t: THREE.Vector3[][]) {
  for (const tr of t) {
    const e1 = tr[1].clone().sub(tr[0]);
    const e2 = tr[2].clone().sub(tr[0]);
    if (e1.cross(e2).y < 0) [tr[1], tr[2]] = [tr[2], tr[1]];
  }
  return t;
}

/**
 * 一片扇形枯叶。片内坐标：叶柄基部（扇心）在原点，叶柄往 +x，扇面朝 −x 张开 spread 弧度。
 * 每条叶裂从扇心到 0.72 半径是连着的（实心的扇面），外面一截收成尖 → 外沿一圈锯齿（相邻两尖之间一个 V 口）；
 * 尖往上翘一点。相邻叶裂的中线一抬一压（很浅的褶），深浅主要靠每条一个顶点色（0.86～1.0）。
 */
function fan(r: number, spread: number, n: number, stalk: number, rnd: () => number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const y0 = 0.012;
  const P = (a: number, rr: number, y: number) => v3(Math.cos(a) * rr, y, Math.sin(a) * rr);
  const hub = v3(0.03, y0 + 0.004, 0);
  for (let i = 0; i < n; i++) {
    const a0 = Math.PI - spread / 2 + (spread * i) / n;
    const a1 = a0 + spread / n;
    const am = (a0 + a1) / 2;
    const ri = r * (0.86 + 0.14 * rnd());
    const fold = (i % 2 === 0 ? 1 : -1) * 0.008;
    const curl = 0.015 + 0.02 * rnd();
    const rf = ri * 0.72;
    const fl = P(a0, rf, y0 + curl * 0.3);
    const fr = P(a1, rf, y0 + curl * 0.3);
    const fm = P(am, rf, y0 + fold + curl * 0.3);
    const tip = P(am + (rnd() - 0.5) * 0.08, ri, y0 + curl);
    const t = up([
      [hub, fl, fm],
      [hub, fm, fr],
      [fl, tip, fm],
      [fm, tip, fr],
    ]);
    parts.push(tint(tris(t), [1, 0.9, 0.95, 0.86][Math.floor(rnd() * 4)]));
  }
  // 叶柄：一根扁的长条（≈ 2 纹素宽），比扇面暗一档的顶点色
  if (stalk > 0) parts.push(tint(new THREE.BoxGeometry(stalk, 0.03, 0.08).translate(stalk / 2 + 0.02, 0.015, 0), 0.86));
  return merge(parts, true);
}

/** 一圈 w 宽的带子（贴着多边形 pts 外面走，闭合），水纹用 */
function band(pts: [number, number][], w: number): THREE.BufferGeometry {
  let cx = 0;
  let cz = 0;
  for (const [x, z] of pts) {
    cx += x / pts.length;
    cz += z / pts.length;
  }
  const y = 0.004;
  const t: THREE.Vector3[][] = [];
  for (let i = 0; i < pts.length; i++) {
    const [x0, z0] = pts[i];
    const [x1, z1] = pts[(i + 1) % pts.length];
    let nx = z1 - z0;
    let nz = -(x1 - x0);
    const l = Math.hypot(nx, nz) || 1;
    nx /= l;
    nz /= l;
    if (nx * ((x0 + x1) / 2 - cx) + nz * ((z0 + z1) / 2 - cz) < 0) {
      nx = -nx;
      nz = -nz;
    }
    // 两头各多伸 w/2，拐角不留缝
    const ex = ((x1 - x0) / l) * w * 0.5;
    const ez = ((z1 - z0) / l) * w * 0.5;
    const a = v3(x0 - ex, y, z0 - ez);
    const b = v3(x1 + ex, y, z1 + ez);
    const c = v3(x1 + ex + nx * w, y, z1 + ez + nz * w);
    const d = v3(x0 - ex + nx * w, y, z0 - ez + nz * w);
    t.push([a, b, c], [a, c, d]);
  }
  return tris(up(t));
}

/** 水纹：围着整片叶子的一圈椭圆（扇面 + 叶柄，外面留 0.05 米），1 纹素宽 */
function ripple(r: number, spread: number, stalk: number): THREE.BufferGeometry {
  const x0 = -r;
  const x1 = Math.max(stalk, r * Math.cos(spread / 2) * -1, 0.05);
  const cx = (x0 + x1) / 2;
  const rx = (x1 - x0) / 2 + 0.06;
  const rz = r * Math.min(1, Math.sin(spread / 2) + 0.05) + 0.06;
  const pts: [number, number][] = [];
  const n = 16;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * rx, Math.sin(a) * rz]);
  }
  return band(pts, 0.045);
}

/** 一条碎叶（断下来的一条叶裂）：尖尖的长条，略弯 */
function strip(len: number, wid: number, k: number): THREE.BufferGeometry {
  const y = 0.012;
  const a = v3(-len / 2, y, 0);
  const b = v3(-len / 6, y + 0.01, wid / 2);
  const c = v3(len / 6, y + 0.012, wid / 2 + 0.01);
  const d = v3(len / 2, y + 0.02, 0.02);
  const e = v3(len / 6, y + 0.012, -wid / 2 + 0.01);
  const f = v3(-len / 6, y + 0.01, -wid / 2);
  return tint(
    tris(
      up([
        [a, b, f],
        [f, b, c],
        [f, c, e],
        [e, c, d],
      ]),
    ),
    k,
  );
}

/** 每个变体的几片（顺序 = setCount 的顺序：先大的） */
function pieces(v: number, rnd: () => number): Piece[] {
  const out: Piece[] = [];
  const add = (geo: THREE.BufferGeometry, ring: THREE.BufferGeometry | null, x: number, z: number, rot: number) => {
    place(geo, x, z, rot);
    if (ring) place(ring, x, z, rot);
    out.push({ geo, ring, at: [x, z] });
  };
  const S = 0.5 * Math.PI;
  switch (v % 3) {
    case 0:
      add(fan(0.46, 2.6, 8, 0.5, rnd), ripple(0.46, 2.6, 0.5), -0.02, 0, 0.1);
      add(strip(0.34, 0.085, 0.92), null, 0.36, 0.2, -0.5);
      add(fan(0.2, 1.7, 3, 0, rnd), ripple(0.2, 1.7, 0), -0.56, -0.14, 2.4);
      break;
    case 1:
      add(fan(0.38, 2.5, 7, 0.3, rnd), ripple(0.38, 2.5, 0.3), 0.05, 0.02, -0.2);
      add(strip(0.3, 0.08, 0.95), null, -0.42, 0.18, 0.7);
      add(strip(0.24, 0.075, 0.88), null, 0.4, -0.16, S + 0.3);
      break;
    default:
      add(fan(0.42, 2.6, 8, 0.45, rnd), null, -0.1, -0.05, 0.25);
      add(fan(0.32, 2.3, 6, 0.35, rnd), null, 0.22, 0.12, Math.PI - 0.5);
      add(strip(0.3, 0.08, 0.9), null, -0.45, 0.2, -0.9);
  }
  return out;
}

export function build(ctx: AssetCtx): THREE.Object3D {
  const v = ctx.variant;
  const rnd = ctx.rng(`palm-litter:${v}`);
  const ps = pieces(v, rnd);
  const g = new THREE.Group();
  g.name = 'palm-litter';

  // 一个网格：几片按顺序合并，setCount 用 drawRange 只画前 n 片
  const geo = merge(
    ps.map((p) => p.geo),
    true,
  );
  const ends: number[] = [];
  let acc = 0;
  for (const p of ps) {
    acc += p.geo.index ? p.geo.index.count : p.geo.getAttribute('position').count;
    ends.push(acc);
  }
  const leaf = new THREE.Mesh(
    geo,
    ctx.mat('dryGrass', { ramp: LEAF, vertexColors: true, edge: 0.35, convex: 0.3, bands: [0.1, 0.55] }),
  );
  leaf.name = 'litter-leaves';
  g.add(leaf);

  const ringGeos = ps.map((p) => p.ring ?? new THREE.BufferGeometry());
  const ringEnds: number[] = [];
  let racc = 0;
  for (const r of ringGeos) {
    racc += r.getAttribute('position')?.count ?? 0;
    ringEnds.push(racc);
  }
  const hasRing = ps.some((p) => p.ring);
  let ring: THREE.Mesh | null = null;
  if (hasRing) {
    ring = new THREE.Mesh(
      merge(ps.filter((p) => p.ring).map((p) => p.ring as THREE.BufferGeometry)),
      ctx.mat('fountainWater', { ramp: RIPPLE, edge: 0, convex: 0 }),
    );
    ring.name = 'litter-ripple';
    g.add(ring);
  }
  ctx.mats.prepare(g, { cast: false, receive: true });

  const st = { count: ps.length, floating: v >= 3 };
  const setCount = (n: number) => {
    st.count = Math.max(0, Math.min(ps.length, Math.round(n)));
    leaf.geometry.setDrawRange(0, st.count > 0 ? ends[st.count - 1] : 0);
    leaf.visible = st.count > 0;
    if (ring) {
      ring.geometry.setDrawRange(0, st.count > 0 ? ringEnds[st.count - 1] : 0);
      ring.visible = st.floating && st.count > 0;
    }
    g.userData.count = st.count;
  };
  const setFloating = (on: boolean) => {
    st.floating = on;
    if (ring) ring.visible = on && st.count > 0;
  };
  setCount(ps.length);
  setFloating(st.floating);

  g.userData.max = ps.length;
  g.userData.pieces = ps.map((p) => p.at);
  g.userData.setCount = setCount;
  g.userData.setFloating = setFloating;
  // 漂着的叶子慢慢转一点（整组 ±2°，7 秒一轮）；平放在地上的不动
  const rot0 = { y: NaN };
  g.userData.update = (_dt: number, t: number) => {
    if (!st.floating) return;
    if (Number.isNaN(rot0.y)) rot0.y = g.rotation.y;
    g.rotation.y = rot0.y + 0.035 * Math.sin((t / 7) * Math.PI * 2 + v);
  };
  return g;
}

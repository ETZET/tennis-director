// main-door：正门（#3，东立面，rotY 朝东；外观和一层、二层剖面都在）。本地 +z = 门外，y 0 = 门槛的底。
// 2.8 × 3.7 × 0.3 米 = 31 × 41 × 3.3 设计纹素（正面 26 行）。和 arch-window 一家：陶砖拱形门套 + 花砖拱圈。
// 元素：陶砖门套（拱形，砖 6 × 3，外拱和门洞同一个圆心）、两根出挑的陶砖壁柱（柱头、柱础是暖砂岩色的一行）、
//   会所蓝的花砖拱圈、深色染木的拱顶双扇门（竖板 3 纹素一道缝，中缝 1 纹素深色）、每扇两条铁合页带（1 行）+ 一个黄铜门环、
//   拱顶上一块黄铜盾徽（中间一块会所蓝，顶到 3.7 米，破开拱的轮廓）、陶砖门槛。
// 场景里镜头从南边看（门朝东）：看到的是南壁柱的侧面（3 纹素宽）+ 拱顶朝天的那条砖 + 盾徽的侧面 → 侧面、顶面都留着。
// 朝镜头的竖直面 lightUp 0.55 + 低 bands：陶砖 L 142、花砖 L 122、门 L 92、铁 L 62、黄铜 L 150（相邻差 < 60）。
// 材质：cap（陶砖）、plaster（柱头）、talavera、timber（门）、ironwork、signPaint（黄铜）、counter（盾心）。三角形 ≈ 300。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

type G = THREE.BufferGeometry;
type V3 = [number, number, number];
function merge(geos: G[]): G {
  const list = geos.map((g0) => {
    const g = g0.index ? g0.toNonIndexed() : g0;
    for (const k of Object.keys(g.attributes))
      if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    if (!g.attributes.uv)
      g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    return g;
  });
  const m = mergeGeometries(list);
  if (!m) throw new Error('main-door: merge failed');
  return m;
}
const bx = (w: number, h: number, d: number, x: number, y: number, z: number) =>
  new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
/** 朝 +z 的薄片：左下角 (x0, y0)，宽 w、高 h */
const pl = (x0: number, y0: number, w: number, h: number, z: number) =>
  new THREE.PlaneGeometry(w, h).translate(x0 + w / 2, y0 + h / 2, z);
/** 半圆拱的点（从左拱脚到右拱脚） */
const arc = (r: number, cy: number, seg: number) =>
  Array.from({ length: seg + 1 }, (_, i) => {
    const a = Math.PI - (i / seg) * Math.PI;
    return new THREE.Vector2(Math.cos(a) * r, cy + Math.sin(a) * r);
  });

export function build(ctx: AssetCtx): THREE.Object3D {
  const g = new THREE.Group();
  g.name = 'main-door';
  const W = 2.8;
  const R = 0.85; // 门洞半径（洞宽 1.7）
  const TOP = 3.05; // 门洞拱顶
  const SPRING = TOP - R; // 2.2
  const SILL = 0.08;
  const Z0 = -0.15;
  const ZS = 0.08; // 门套正面
  const ZP = 0.15; // 壁柱正面
  const ZD = -0.05; // 门扇

  // ── 材质 ──
  const face = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number], noShadowReceive: true };
  const brickTones = {
    bands: [
      [0xe8a070, 0xf0aa7a, 0xde966a],
      [0xd07e6a, 0xda8a74, 0xc47262], // L 142 / 152 / 132
      [0x7c4e8a, 0x865894, 0x704680],
    ] as [V3, V3, V3],
    seam: [0xcc8a60, 0xb0665a, 0x5e3a6e] as V3,
    hi: [0xf8b884, 0xe49a80, 0x9466a2] as V3,
  };
  const brick = ctx.mat('cap', {
    ...face,
    elem: { kind: 'stones', size: [6, 3], seam: 0.6, hi: 0.3 },
    tones: brickTones,
    convex: 0.3,
  });
  const stone = ctx.mat('plaster', { ...face, ramp: [0xf6cc94, 0xe8a47c, 0xa0688a], convex: 0.3 }); // 柱头、柱础 L 172
  const ring = ctx.mat('talavera', { ...face, ramp: [0x6aa4f0, 0x4a80d0, 0x263c8a], convex: 0.3 });
  const door = ctx.mat('timber', {
    ...face,
    ramp: [0xb87850, 0x94584e, 0x54386a],
    tones: {
      bands: [
        [0xb87850, 0xc28458, 0xac6e4a],
        [0x94584e, 0x9e6256, 0x8a5048], // L 104 / 114 / 95
        [0x54386a, 0x5e4274, 0x4a3060],
      ],
      seam: [0x945a44, 0x703c48, 0x3c2654],
      hi: [0xd09060, 0xac6c5c, 0x6c4e84],
    },
    elem: { kind: 'planks', space: 'local', p: [1, 0, 0, 3 * ctx.texel], seam: 1, hi: 0 },
    convex: 0,
  });
  const iron = ctx.mat('ironwork', { ...face, ramp: [0x5a4a7a, 0x483c6a, 0x302850], convex: 0.2 });
  const brass = ctx.mat('signPaint', { ...face, ramp: [0xf4c860, 0xd89c48, 0x9a6a6a], convex: 0.3 }); // L 160
  const blue = ctx.mat('counter', { ...face, ramp: [0x56b0f0, 0x2f80c8, 0x2d4991] });

  // ── 陶砖门套（拱形，挖拱洞）──
  const shape = new THREE.Shape([
    new THREE.Vector2(-W / 2, 0),
    new THREE.Vector2(W / 2, 0),
    ...arc(W / 2, SPRING, 8).reverse(),
  ]);
  shape.holes.push(new THREE.Path([new THREE.Vector2(-R, 0), ...arc(R, SPRING, 7), new THREE.Vector2(R, 0)]));
  const surround = new THREE.ExtrudeGeometry(shape, {
    depth: ZS - Z0,
    bevelEnabled: false,
    curveSegments: 8,
  }).translate(0, 0, Z0);
  // 壁柱（出挑到 ZP）：x ±0.95…±1.4，柱础 0…0.18、柱身到 2.2、柱头 2.2…2.38
  const PW = 0.45;
  const PX = W / 2 - PW / 2;
  const bricks: G[] = [surround];
  const stones: G[] = [];
  for (const s of [-1, 1]) {
    bricks.push(bx(PW, SPRING - 0.18, ZP - ZS, s * PX, 0.18, (ZP + ZS) / 2));
    stones.push(bx(PW, 0.18, ZP - Z0, s * PX, 0, (ZP + Z0) / 2));
    stones.push(bx(PW, 0.18, ZP - Z0, s * PX, SPRING, (ZP + Z0) / 2));
  }
  // 门槛
  bricks.push(bx(2 * R, SILL, ZS - Z0, 0, 0, (ZS + Z0) / 2));
  g.add(new THREE.Mesh(merge(bricks), brick));
  g.add(new THREE.Mesh(merge(stones), stone));

  // ── 花砖拱圈 ──
  const RING = 0.2;
  const ringShape = new THREE.Shape([...arc(R + RING, SPRING, 8), ...arc(R, SPRING, 8).reverse()]);
  g.add(new THREE.Mesh(new THREE.ShapeGeometry(ringShape).translate(0, 0, ZS + 0.006), ring));

  // ── 双扇门（拱顶）──
  const fill = new THREE.Shape(
    [new THREE.Vector2(-R, SILL), ...arc(R, SPRING, 7), new THREE.Vector2(R, SILL)].reverse(),
  );
  g.add(new THREE.Mesh(new THREE.ShapeGeometry(fill).translate(0, 0, ZD), door));
  // 铁件：中缝（1 纹素）+ 每扇两条合页带（1 行 = 0.13）
  const irons: G[] = [pl(-0.045, SILL, 0.09, TOP - SILL - 0.02, ZD + 0.004)];
  for (const s of [-1, 1])
    for (const y of [0.5, 1.78]) irons.push(pl(s > 0 ? R - 0.54 : -R, y, 0.54, 0.13, ZD + 0.004));
  g.add(new THREE.Mesh(merge(irons), iron));
  // 黄铜：门环（2 × 2 纹素）+ 盾徽
  const brassG: G[] = [];
  for (const s of [-1, 1]) brassG.push(pl(s * 0.24 - 0.09, 1.1, 0.18, 0.26, ZD + 0.006));
  const SH0 = 3.12;
  const SH1 = 3.7;
  const shield = new THREE.Shape([
    new THREE.Vector2(0, SH0),
    new THREE.Vector2(0.27, SH0 + 0.2),
    new THREE.Vector2(0.27, SH1),
    new THREE.Vector2(-0.27, SH1),
    new THREE.Vector2(-0.27, SH0 + 0.2),
  ]);
  brassG.push(
    new THREE.ExtrudeGeometry(shield, { depth: ZP - Z0 - 0.06, bevelEnabled: false }).translate(0, 0, Z0 + 0.06),
  );
  g.add(new THREE.Mesh(merge(brassG), brass));
  g.add(new THREE.Mesh(pl(-0.135, SH0 + 0.22, 0.27, 0.26, ZP + 0.004), blue));

  g.traverse((o) => {
    o.castShadow = true;
    o.receiveShadow = true;
  });
  ctx.mats.prepare(g);
  return g;
}

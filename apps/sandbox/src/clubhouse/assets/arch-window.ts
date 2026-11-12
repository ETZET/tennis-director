// arch-window：半圆拱窗（#4）。本地 +z = 窗外（朝镜头），y 0 = 窗台（v0）/ 门槛（v1）的底。
// v0 = 拱窗 + 铁花窗栅：1.3 × 2.0 × 0.3 米（14 × 22 × 3 设计纹素；包围盒 1.36 × 0.32 = 窗台出挑）。
//   拱形的陶砖窗套（砖 6 × 3）、花砖拱圈（talavera）、
//   玻璃、拱里映着天的亮子（亮档的青，L ≈ 175）、窗栅（两根竖条 + 拱脚一根横条，2 纹素宽）、陶砖窗台（朝天 = 亮档，不接投影）。
// v1 = 拱形落地门 / 外卖窗：1.8 × 2.78 × 0.3 米（20 × 31 × 3）。窗套 + 花砖拱圈 + 两扇深绿漆的玻璃门（下半截门板、上面 2 × 2 格玻璃）
//   + 拱里的亮子（映着天，没有条）+ 每格玻璃一道天光 + 陶砖门槛。背板顶 2.78（比规格的 2.5 高）：二层南墙那三扇的门洞（1.4 × 2.6）在墙里、
//   资产离墙面 0.15，45° 往下看会露出门洞的顶 → 窗套后面一块白灰泥背板（1.46 宽、1.9…2.78，和外墙同一套石灰水斑，
//   屏幕空间元素接得上）。
// 朝镜头的竖直面（窗套、拱圈、门、玻璃、窗栅）lightUp 0.55 + 低 bands：落中档、不接投影（陶砖 L 142、花砖 L 122、门漆 L 77）；
// 玻璃 L 127（高一级 / 低一级 ±10，三成的块上沿一道天光 L 163），天光斜条 L 171（离格子边 1 纹素）；陶砖的亮档压到 L 172；
// 相邻的颜色差都 < 60（不出强边缘）。
// 元素：stucco = EL.stucco（同外墙）；cap = stones 6 × 3（窗套）/ 6 × 4（窗台）；glass = stones 6 × 5。
// 材质：stucco、cap、talavera、glass、windscreen（门漆）、ironwork。三角形 v0 ≈ 150、v1 ≈ 155。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';
import { EL } from '../palette';

type G = THREE.BufferGeometry;
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
  if (!m) throw new Error('arch-window: merge failed');
  return m;
}
const bx = (w: number, h: number, d: number, x: number, y: number, z: number) =>
  new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
/** 半圆拱的点（从左拱脚到右拱脚） */
const arc = (r: number, cy: number, seg: number) =>
  Array.from({ length: seg + 1 }, (_, i) => {
    const a = Math.PI - (i / seg) * Math.PI;
    return new THREE.Vector2(Math.cos(a) * r, cy + Math.sin(a) * r);
  });
/** 拱形的窗套（宽 w、外拱和洞同一个圆心）挖一个拱洞（宽 2r、洞底 sill、拱顶 top） */
function archFrame(w: number, r: number, sill: number, top: number): THREE.Shape {
  const s = new THREE.Shape([
    new THREE.Vector2(-w / 2, 0),
    new THREE.Vector2(w / 2, 0),
    ...arc(w / 2, top - r, 7).reverse(),
  ]);
  const hole = new THREE.Path([new THREE.Vector2(-r, sill), ...arc(r, top - r, 6), new THREE.Vector2(r, sill)]);
  s.holes.push(hole);
  return s;
}
/** 半圆环（拱圈）：内半径 r0、外半径 r1，圆心 (0, cy) */
function archRing(r0: number, r1: number, cy: number, seg = 7): THREE.Shape {
  const out = arc(r1, cy, seg);
  const inn = arc(r0, cy, seg).reverse();
  return new THREE.Shape([...out, ...inn]);
}
/** 实心拱（洞里的玻璃）：宽 2r、底 y0、拱顶 top */
function archFill(r: number, y0: number, top: number, seg = 6): THREE.Shape {
  return new THREE.Shape([new THREE.Vector2(-r, y0), ...arc(r, top - r, seg), new THREE.Vector2(r, y0)].reverse());
}
/** 平面上的凸多边形（天光斜条、放射条），z 固定，朝 +z（点的顺序不限） */
function flat(pts0: number[][], z: number): G {
  let area = 0;
  for (let i = 0; i < pts0.length; i++) {
    const [x0, y0] = pts0[i];
    const [x1, y1] = pts0[(i + 1) % pts0.length];
    area += x0 * y1 - x1 * y0;
  }
  const pts = area < 0 ? [...pts0].reverse() : pts0;
  const pos: number[] = [];
  for (let i = 1; i + 1 < pts.length; i++) pos.push(...pts[0], z, ...pts[i], z, ...pts[i + 1], z);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

export function build(ctx: AssetCtx): THREE.Object3D {
  const g = new THREE.Group();
  const big = ctx.variant === 1;
  const W = big ? 1.8 : 1.3;
  const H = big ? 2.78 : 2.0; // 窗套高（v1 比规格的 2.5 高：盖住门洞顶）
  const R = big ? 0.66 : 0.42; // 洞的半径（洞宽 2R）
  const SILL = big ? 0.08 : 0.12; // 洞底
  const TOP = big ? 2.3 : 1.76; // 拱顶
  const SPRING = TOP - R;
  const Z0 = -0.15;
  const ZF = 0.12; // 窗套正面

  // ── 材质 ──
  const face = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number], noShadowReceive: true };
  const wall = ctx.mat('stucco', { elem: EL.stucco, edge: 0.2 });
  // 陶砖窗套：朝镜头的面落中档（L 146，饱和的橙），砖 6 × 3 纹素
  // 陶砖的三档：亮档压到 L 172（窗套顶面、窗台朝天，和暗墙差 < 60）；缝 −24
  const brickTones = {
    bands: [
      [0xe8a070, 0xf0aa7a, 0xde966a],
      [0xd07e6a, 0xda8a74, 0xc47262], // L 142 / 152 / 132
      [0x7c4e8a, 0x865894, 0x704680],
    ] as [[number, number, number], [number, number, number], [number, number, number]],
    seam: [0xcc8a60, 0xb0665a, 0x5e3a6e] as [number, number, number],
    hi: [0xf8b884, 0xe49a80, 0x9466a2] as [number, number, number],
  };
  const brick = ctx.mat('cap', {
    ...face,
    elem: { kind: 'stones', size: [6, 3], seam: 0.6, hi: 0.3 },
    tones: brickTones,
    convex: 0.3,
  });
  // 花砖拱圈：比壁泉的花砖亮一截（L 122）：和亮子的天光（L 172）差 < 60
  const ring = ctx.mat('talavera', { ...face, ramp: [0x6aa4f0, 0x4a80d0, 0x263c8a], convex: 0.3 });
  const sillMat = ctx.mat('cap', {
    elem: { kind: 'stones', size: [6, 4], seam: 0.6, hi: 0.4 },
    tones: brickTones,
    noShadowReceive: true,
    convex: 0.5,
  });
  const glass = ctx.mat('glass', {
    ...face,
    elem: { kind: 'stones', size: [6, 5], seam: 0, hi: 0.3 },
    toneW: [0.25, 0.2],
    tones: {
      bands: [
        [0x48aeba, 0x5ccad0, 0x3a86a0],
        [0x1890d0, 0x249cd8, 0x1484c4], // L 123 / 135 / 113（调完 +4；午后的中档往橙染，原色要更蓝才留得住饱和度）
        [0x3c5c98, 0x44689e, 0x36528c],
      ],
      seam: [0x34749a, 0x2c6490, 0x304882],
      hi: [0x8ee0e8, 0x48b8e0, 0x5878b0], // 中档亮边 L 163
    },
    edge: 0.3,
    convex: 0,
  });
  const glint = ctx.mat('glass', { ...face, ramp: [0x6cbcd2, 0x6cbcd2, 0x6cbcd2], edge: 0, convex: 0 }); // L 171
  // 亮子（拱里的那块玻璃）映着天：阈值压低 → 朝镜头也落亮档（亮档的调色几乎不动青色，饱和度留得住），L ≈ 175 的青，没有条
  const sky = ctx.mat('glass', {
    ...face,
    bands: [-0.95, -0.7],
    ramp: [0x4cd2ea, 0x2eb4d0, 0x2a94bc],
    edge: 0.2,
    convex: 0,
  });
  const iron = ctx.mat('ironwork', { ...face, convex: 0.5 });

  // ── 背板（白灰泥，和外墙一样：盖住墙上的门洞 / 窗洞）+ 陶砖窗套（拱形，挖拱洞）+ 花砖拱圈 ──
  // 背板只在 v1：盖住二层南墙门洞（1.4 宽、顶 2.6）露在拱形窗套上面的那两角（v0 的窗洞比窗套小）
  if (big) g.add(new THREE.Mesh(bx(1.46, H - 1.9, 0.03, 0, 1.9, Z0 + 0.015), wall));
  const surround = new THREE.ExtrudeGeometry(archFrame(W, R, SILL, TOP), {
    depth: ZF - Z0 - 0.03,
    bevelEnabled: false,
    curveSegments: 7,
  }).translate(0, 0, Z0 + 0.03);
  g.add(new THREE.Mesh(surround, brick));
  const RING = big ? 0.18 : 0.14;
  g.add(new THREE.Mesh(new THREE.ShapeGeometry(archRing(R, R + RING, SPRING)).translate(0, 0, ZF + 0.006), ring));

  // ── 玻璃（洞里，退进去） ──
  const ZG = big ? -0.08 : -0.06;
  const CUT = big ? SPRING + 0.09 : SPRING; // 亮子的底（v1 = 门框顶，v0 = 拱脚的横条）
  g.add(new THREE.Mesh(new THREE.ShapeGeometry(archFill(R, SILL, TOP)).translate(0, 0, ZG), glass));
  // 亮子：半圆（圆心在拱脚），贴在玻璃前面一点
  const fan = new THREE.Shape([
    new THREE.Vector2(-R + 0.005, CUT),
    ...arc(R - 0.005, SPRING, 7).slice(1, -1),
    new THREE.Vector2(R - 0.005, CUT),
  ]);
  g.add(new THREE.Mesh(new THREE.ShapeGeometry(fan).translate(0, 0, ZG + 0.004), sky));
  const glints: G[] = [];
  const ironG: G[] = [];

  if (big) {
    // ── v1：两扇玻璃门（深绿漆的框）+ 扇形亮子 ──
    const paint = ctx.mat('windscreen', { ...face, convex: 0.3 });
    const ZD = ZG + 0.03;
    const frame = new THREE.Shape([
      new THREE.Vector2(-R, SILL),
      new THREE.Vector2(R, SILL),
      new THREE.Vector2(R, SPRING + 0.09),
      new THREE.Vector2(-R, SPRING + 0.09),
    ]);
    // 每扇：外梃 0.1、中梃 0.09（两扇合起来一条 0.18）、下半截门板到 0.62、上面 2 × 2 格（横档 0.09）
    const gx0 = R - 0.1;
    const gx1 = 0.09;
    const rows: [number, number][] = [
      [0.62, 1.06],
      [1.2, SPRING], // 横档 0.14（竖直 1 米在屏幕上只有 0.7：0.14 米 = 1 行）
    ];
    for (const s of [-1, 1])
      for (const [y0, y1] of rows) {
        const a = s * gx1;
        const b = s * gx0;
        const [xa, xb] = a < b ? [a, b] : [b, a];
        frame.holes.push(
          new THREE.Path([
            new THREE.Vector2(xa, y0),
            new THREE.Vector2(xa, y1),
            new THREE.Vector2(xb, y1),
            new THREE.Vector2(xb, y0),
          ]),
        );
      }
    g.add(new THREE.Mesh(new THREE.ShapeGeometry(frame).translate(0, 0, ZD), paint));
    // 天光：每格玻璃里一道斜条，离格子边至少 1 纹素（天光和门框挨着就是 > 60 的强边缘）
    for (const sx of [-1, 1])
      for (const [y0, y1] of rows) {
        const xa = sx < 0 ? -gx0 : gx1;
        const big2 = y1 - y0 > 0.4;
        const t0 = y1 - 0.12;
        const t1 = y0 + (big2 ? 0.14 : 0.2);
        const x = xa + 0.1;
        glints.push(
          flat(
            [
              [x, t0],
              [x + 0.12, t0],
              [x + 0.28, t1],
              [x + 0.16, t1],
            ],
            ZG + 0.008,
          ),
        );
      }
    // 门槛
    g.add(new THREE.Mesh(bx(W - 0.3, SILL, ZF - Z0 + 0.02, 0, 0, (Z0 + ZF) / 2 + 0.01), sillMat));
  } else {
    // ── v0：窗栅（两根竖条到拱脚 + 拱脚一根横条，2 纹素 = 0.18 宽）+ 窗台 ──
    const BW = 0.18;
    const ZB = 0.06;
    for (const x of [-0.17, 0.17]) ironG.push(bx(BW, SPRING - SILL, 0.05, x, SILL, ZB));
    ironG.push(bx(2 * R, 0.14, 0.05, 0, SPRING - 0.07, ZB));
    // 窗台：陶砖，出挑到 +0.16
    g.add(new THREE.Mesh(bx(W + 0.06, SILL, 0.32, 0, 0, 0.01), sillMat));
  }
  if (glints.length) g.add(new THREE.Mesh(merge(glints), glint));
  if (ironG.length) g.add(new THREE.Mesh(merge(ironG), iron));
  g.traverse((o) => {
    o.castShadow = true;
    o.receiveShadow = true;
  });
  ctx.mats.prepare(g);
  return g;
}

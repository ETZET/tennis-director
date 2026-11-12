// wall-fountain：南拱廊西头的花砖壁泉（#9）。1.6 × 2.2 × 0.6 米（18 × 24 × 7 设计纹素）。本地 −z 0.3 = 贴着的墙面。
// 塔拉韦拉花砖背板（顶上半圆，厚 0.1）：钴蓝底 + 一圈奶油色的边 + 中间一朵奶油色的八角星 + 四个黄点；
// 铜出水口（1.2 米高）+ 一道往下落的水（2 纹素宽）；半圆小池（池壁蓝釉砖、陶砖压顶、里面一池水）。
// 小件、挂在拱廊里（露台的影子下）：不接投影，朝镜头的面 lightUp 0.55 + 低 bands 落中档；背板的蓝 L 126、奶油 L 178（差 < 60，
// 1 纹素的边不出强边缘），池壁的蓝 L 98，压顶和水面朝天落亮档。场景里 rotY 朝东（画面上是侧面：池子的半圆、压顶和水面）。
// 材质：talavera、signPaint、flowerYellow、brass、cap、fountainWater（都借原名，ramp 覆盖亮度）。没有元素（小件）。三角形 ≈ 150。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

type G = THREE.BufferGeometry;
const v = (x: number, y: number) => new THREE.Vector2(x, y);
function merge(geos: G[]): G {
  // 有的几何带 uv、有的不带，合并前统一去掉（toon 材质不用 uv，同 clubsite/render/geo.ts）
  const m = mergeGeometries(
    geos.map((g) => {
      const n = g.index ? g.toNonIndexed() : g;
      n.deleteAttribute('uv');
      return n;
    }),
  );
  if (!m) throw new Error('wall-fountain: merge failed');
  return m;
}
/** 拱形（宽 2r、底 y0、拱顶 top）的轮廓点，逆时针 */
const archPts = (r: number, y0: number, top: number, seg = 8) => [
  v(-r, y0),
  v(r, y0),
  ...Array.from({ length: seg + 1 }, (_, i) => {
    const a = (i / seg) * Math.PI;
    return v(Math.cos(a) * r, top - r + Math.sin(a) * r);
  }),
];
/** 半个椭圆环（平放在 y 上，圆心 (0, cz)，x 半轴 a、z 半轴 b，往 +z 一侧），内外各 seg 段 */
function halfRingFlat(a0: number, b0: number, a1: number, b1: number, y: number, cz: number, seg = 8): G {
  const pos: number[] = [];
  const P = (a: number, b: number, t: number) => [Math.cos(t) * a, y, cz + Math.sin(t) * b];
  for (let i = 0; i < seg; i++) {
    const t0 = (i / seg) * Math.PI;
    const t1 = ((i + 1) / seg) * Math.PI;
    const i0 = P(a0, b0, t0);
    const i1 = P(a0, b0, t1);
    const o0 = P(a1, b1, t0);
    const o1 = P(a1, b1, t1);
    pos.push(...i0, ...o0, ...o1, ...i0, ...o1, ...i1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  // 朝上（顶点顺序按 +y 朝外）
  const n = g.getAttribute('normal');
  if (n.getY(0) < 0) {
    for (let i = 0; i < pos.length; i += 9) {
      for (let k = 0; k < 3; k++) {
        const t = pos[i + 3 + k];
        pos[i + 3 + k] = pos[i + 6 + k];
        pos[i + 6 + k] = t;
      }
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
  }
  return g;
}
/** 半个椭圆柱面（池壁的外面），y0…y1 */
function halfWall(a: number, b: number, y0: number, y1: number, cz: number, seg = 8): G {
  const pos: number[] = [];
  const nrm: number[] = [];
  for (let i = 0; i < seg; i++) {
    const t0 = (i / seg) * Math.PI;
    const t1 = ((i + 1) / seg) * Math.PI;
    const p = (t: number, y: number) => [Math.cos(t) * a, y, cz + Math.sin(t) * b];
    const nn = (t: number) => {
      const x = Math.cos(t) / a;
      const z = Math.sin(t) / b;
      const l = Math.hypot(x, z);
      return [x / l, 0, z / l];
    };
    const q = [p(t0, y0), p(t1, y0), p(t1, y1), p(t0, y1)];
    const qn = [nn(t0), nn(t1), nn(t1), nn(t0)];
    for (const k of [0, 2, 1, 0, 3, 2]) {
      pos.push(...q[k]);
      nrm.push(...qn[k]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  return g;
}

export function build(ctx: AssetCtx): THREE.Object3D {
  const g = new THREE.Group();
  const W = 1.6;
  const H = 2.2;
  const R = W / 2;
  const ZB = -0.3; // 墙面
  const PT = 0.1; // 背板厚
  const ZP = ZB + PT; // 背板正面
  const face = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number], noShadowReceive: true };

  const tile = ctx.mat('talavera', { ...face, ramp: [0x6aa4f0, 0x4a80d0, 0x263c8a], convex: 0.3 }); // 背板 L 126
  const basinTile = ctx.mat('talavera', { ...face, convex: 0.3 }); // 池壁 L 98
  const cream = ctx.mat('signPaint', { ...face, ramp: [0xe4c492, 0xccaa7c, 0x8a7090], edge: 0.1, convex: 0 }); // L 178
  const yellow = ctx.mat('flowerYellow', { ...face, ramp: [0xf0c040, 0xd8a838, 0x8a5466], edge: 0.1, convex: 0 });
  const brass = ctx.mat('brass', { ...face, convex: 0.6 });
  const cap = ctx.mat('cap', { noShadowReceive: true, convex: 0.5 });
  const water = ctx.mat('fountainWater', { noShadowReceive: true, lightUp: 0.3, edge: 0.1, convex: 0 });
  const fall = ctx.mat('fountainWater', { ...face, ramp: [0x8cf0ee, 0x6ad8e8, 0x3c74b8], edge: 0, convex: 0 });

  // ── 背板 ──
  const panel = new THREE.Shape(archPts(R, 0, H));
  g.add(
    new THREE.Mesh(
      new THREE.ExtrudeGeometry(panel, { depth: PT, bevelEnabled: false, curveSegments: 8 }).translate(0, 0, ZB),
      tile,
    ),
  );
  // 奶油色的边（一圈 1 纹素：横 0.1、拱上 0.1）
  const border = new THREE.Shape(archPts(R - 0.05, 0.55, H - 0.05));
  border.holes.push(new THREE.Path(archPts(R - 0.15, 0.65, H - 0.17).reverse()));
  const paint: G[] = [new THREE.ShapeGeometry(border).translate(0, 0, ZP + 0.004)];
  // 中间一朵八角星（两个方块叠成）
  const cy = 1.62;
  const star: THREE.Vector2[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + Math.PI / 16;
    const r = i % 2 ? 0.13 : 0.26;
    star.push(v(Math.cos(a) * r, cy + Math.sin(a) * r * 1.2));
  }
  paint.push(new THREE.ShapeGeometry(new THREE.Shape(star)).translate(0, 0, ZP + 0.006));
  g.add(new THREE.Mesh(merge(paint), cream));
  // 四个黄点（星的四角外）
  const dots: G[] = [];
  for (const [x, y] of [
    [-0.42, 1.95],
    [0.42, 1.95],
    [-0.42, 1.2],
    [0.42, 1.2],
  ])
    dots.push(new THREE.PlaneGeometry(0.16, 0.2).translate(x, y, ZP + 0.006));
  g.add(new THREE.Mesh(merge(dots), yellow));

  // ── 出水口 + 落下的水 ──
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.18, 0.26).translate(0, 1.18, ZP + 0.13), brass));
  const WL = 0.46; // 水面
  const fz = ZP + 0.24;
  g.add(new THREE.Mesh(new THREE.PlaneGeometry(0.18, 1.1 - WL).translate(0, (1.1 + WL) / 2, fz), fall));

  // ── 半圆小池：池壁（蓝釉砖）+ 压顶（陶砖，半个椭圆环）+ 水面 ──
  const A = 0.76; // x 半轴
  const B = 0.5; // z 半轴（从背板往外）
  const BH = 0.5; // 池壁高
  const RIM = 0.08;
  g.add(new THREE.Mesh(halfWall(A, B, 0, BH, ZP), basinTile));
  g.add(
    new THREE.Mesh(
      merge([
        halfRingFlat(A - 0.1, B - 0.1, A + 0.02, B + 0.02, BH + RIM, ZP),
        halfWall(A + 0.02, B + 0.02, BH, BH + RIM, ZP),
      ]),
      cap,
    ),
  );
  g.add(new THREE.Mesh(halfRingFlat(0, 0, A - 0.1, B - 0.1, WL, ZP), water));

  g.traverse((o) => {
    o.castShadow = true;
  });
  ctx.mats.prepare(g);
  return g;
}

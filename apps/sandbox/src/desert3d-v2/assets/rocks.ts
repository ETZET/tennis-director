// 红岩（rocks-ne、rocks-pool、rock-e、rocks-e）：v0 一大块红砂岩 + 两块小的；v1 平顶的岩板（两层台）；v2 一块灰紫冷石 + 一块小红石。
// 做法照参考图的石头：几圈随机点的凸包（每块 20～40 个大三角面）→ 面法线出硬面三档（亮顶 / 中腰 / 暗前脸），
// 面比二十面体大、少，剪影有棱角，不会读成圆馒头；砂岩顶上那圈点几乎共面 → 一整块亮顶。
// 描边按"棱多面小"调低（edge 0.55、convex 0.4，否则每条棱都是白线）；石头不接收投影（掠射的面上投影毛边 = 麻点）。
//
// 材质规范 v2（每个切面一档，切面里是元素）：
// - 红砂岩的侧面 = 沉积层 `strata`（uv = [x, 离石顶多深]，一层 3～5 行、层缝 1 行、缝下亮边、少数竖节理）——层是水平的，
//   在每个切面上都是同一组水平线；顶面 = 几块大的 `stones`（风化的龟裂，缝浅）。
// - 岩漆（desert varnish）：一整块有形状的深色 —— 从石肩往下挂、下沿按列缓缓起伏、三分之一的列往下滴 1～3 行
//   （池塘石头苔藓帽的做法，几何上切出来：facets.ts splitByClass）；岩漆里沉积层照样画（同一个 strata，换一套深色）。
// - 冷石 = 花岗岩的块状节理 `stones`；顶前方一块地衣帽（黄绿，`paint` 的有机深浅，只分亮/中两档），下沿 1 行深绿、几列往下滴。
// - 脚下的积沙 = 沙纹 `ripples`（EL.sand，不要大沙斑）。
// 颜色在这里手挑（PALETTE-SUGGEST，见下面几套 tones）。
import * as THREE from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { EL } from '../palette';
import type { Elem, Tones } from '../toon';
import type { AssetCtx } from '../world';
import { type Classify, type Noise1, noise1, rowDy, splitByClass, toGeo } from './rocks/facets';

type Rnd = () => number;
type R3 = [number, number, number];
const tn = (lit: R3, mid: R3, dark: R3, seam: R3, hi: R3): Tones => ({ bands: [lit, mid, dark], seam, hi });

// PALETTE-SUGGEST rock.tones（红砂岩）：亮档赤陶 L155、中档玫瑰 L111、暗档靛紫 L69；高/低一级 ±10，
// 层缝 −20～24（冷一点、往紫），缝下亮边 +20；暗档的高一级 L79（不跨 120）
const ROCK_TONES = tn(
  [0xd88e68, 0xe29a6e, 0xcc8064],
  [0xa85e6a, 0xb46a6e, 0xa05868],
  [0x4e3c80, 0x58468a, 0x443478],
  [0xc27462, 0x8c4c64, 0x3c2e6c],
  [0xeaa478, 0xbc7272, 0x64509a],
);
// PALETTE-SUGGEST rockVarnish（新）：岩漆 —— 红砂岩上的锰铁深色皮，亮档 L120、中档 L82、暗档 L51（和岩面差 35 / 28 / 18，都 < 60）
const VARNISH_TONES = tn(
  [0xb06a64, 0xb87268, 0xa4625e],
  [0x7a4462, 0x844a66, 0x703e5c],
  [0x3a2c68, 0x40326e, 0x342862],
  [0x96545a, 0x643858, 0x2e2258],
  [0xc27c6c, 0x925470, 0x4c3c80],
);
// PALETTE-SUGGEST rockCool.tones（灰紫冷石，花岗岩）：亮 L175、中 L127、暗 L72；缝 −20～24，亮边 +20
const COOL_TONES = tn(
  [0xc0a8c4, 0xcab4cc, 0xb49cba],
  [0x8a78aa, 0x9482b2, 0x806ea0],
  [0x4a4280, 0x544a8a, 0x423a76],
  [0xa690b0, 0x74649a, 0x383268],
  [0xd4c0d8, 0x9e8cba, 0x5e5498],
);
// PALETTE-SUGGEST lichen（新）：地衣帽黄绿（亮 L186、中 L157），只用亮/中两档；下沿和滴下来的几列是青绿 L129（比中档低 28）
const LICHEN: R3 = [0xb2c46a, 0x8aa866, 0x8aa866];
const LICHEN_TONES = tn(
  [0xb2c46a, 0xbccc72, 0xa4b864],
  [0x8aa866, 0x94b06a, 0x7e9e62],
  [0x8aa866, 0x94b06a, 0x7e9e62],
  [0x8aa866, 0x6e9264, 0x6e9264],
  [0xc8d47c, 0xa0b870, 0xa0b870],
);
const LICHEN_RIM: R3 = [0x568262, 0x568262, 0x4c7266];

/** 一圈点：高度 y（± dy），半径 rx/rz（× 1 ± jr），n 个，起始角 a0 */
interface Ring {
  y: number;
  dy?: number;
  r: number;
  jr?: number;
  n: number;
}

interface RockOpts {
  /** 半宽（x）、半深（z），高 */
  rx: number;
  rz: number;
  rings: Ring[];
  x: number;
  z: number;
  ry?: number;
  y?: number;
}

/** 凸包石块：面法线、非索引，只留 position */
function rock(o: RockOpts, rnd: Rnd): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = [];
  for (const ring of o.rings) {
    const a0 = rnd() * Math.PI * 2;
    for (let i = 0; i < ring.n; i++) {
      const a = a0 + ((i + (rnd() - 0.5) * 0.5) / ring.n) * Math.PI * 2;
      const k = ring.r * (1 + (rnd() - 0.5) * 2 * (ring.jr ?? 0.12));
      const y = ring.y + (rnd() - 0.5) * 2 * (ring.dy ?? 0);
      pts.push(new THREE.Vector3(Math.cos(a) * o.rx * k, y, Math.sin(a) * o.rz * k));
    }
  }
  let g: THREE.BufferGeometry = new ConvexGeometry(pts);
  g.rotateY(o.ry ?? 0);
  g.translate(o.x, o.y ?? 0, o.z);
  if (g.index) g = g.toNonIndexed();
  for (const a of Object.keys(g.attributes)) if (a !== 'position') g.deleteAttribute(a);
  return g;
}

/** 积沙：压扁的半球，平滑法线，压住石脚 */
function drift(x: number, z: number, w: number, h: number, d: number, ry: number): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2);
  g.scale(w / 2, h, d / 2);
  g.rotateY(ry);
  g.translate(x, -0.03, z);
  g.deleteAttribute('uv');
  return g;
}

/** 圆钝的大石（底圈 + 外鼓的腰圈 + 收拢的肩圈 + 顶上几点） */
const boulder = (h: number, flat = 0.06): Ring[] => [
  { y: -0.1, r: 0.92, n: 7 },
  { y: h * 0.42, dy: h * 0.08, r: 1.0, n: 7 },
  { y: h * 0.82, dy: h * 0.05, r: 0.78, n: 6 },
  { y: h, dy: h * flat, r: 0.48, n: 5 },
];

// 组号
const SIDE = 0;
const TOP = 1;
const PATCH = 2;
const RIM = 3;
/** 朝上多少算顶面（顶面用 stones，侧面用沉积层） */
const TOP_NY = 0.72;

/**
 * 岩漆：从石肩往下挂的一整块深色。成簇的列（低频噪声）才有，两头收窄；下沿按列缓缓起伏，三分之一的列往下多滴 1～3 行。
 * 只在侧面（顶面朝天，雨水冲不出岩漆）。front：只在朝镜头这半边（z > 中心 − 0.1）
 */
function varnishCls(nz: Noise1, T: number, top: number, h: number, cz: number): Classify {
  return (p, n) => {
    const row = rowDy(n, T); // 这个面上一屏幕行 = 世界 y 多少米
    if (n.y > TOP_NY) return TOP;
    const col = Math.floor(p.x / T);
    const w = THREE.MathUtils.clamp((nz.vn(col * 0.17 + 3.3) - 0.55) / 0.1, 0, 1);
    if (w <= 0 || p.z < cz || n.z < 0.15) return SIDE;
    const depth = w * (0.12 + 0.2 * nz.vn(col * 0.23 + 9.1)) * h;
    // 竖向的道道：一半的列往下多挂 1～4 行（成簇的列里才有，所以不是一排梳齿）
    const drip = nz.hash(col, 5) > 0.5 ? (1 + Math.floor(nz.hash(col, 6) * 4)) * row : 0;
    return depth > row * 0.5 && p.y > top - depth - drip ? PATCH : SIDE;
  };
}

/**
 * 地衣帽（池塘石头苔藓帽的做法）：石顶往下 (0.3～0.5)·s 米（下沿按列 vn 起伏），离帽心（往前挪）< 0.55～0.65 半径；
 * 下沿 1 行深色（RIM），三分之一的列往下滴 1～3 行（只在朝镜头的面）。行数都按这个面上的屏幕行算（rowDy）。
 */
function lichenCls(nz: Noise1, T: number, top: number, cx: number, cz: number, R: number, s: number): Classify {
  return (p, n) => {
    const row = rowDy(n, T);
    const col = Math.floor(p.x / T);
    const rr = Math.hypot(p.x - cx, (p.z - cz - 0.28 * s) / 0.8) / R;
    const edgeY = top - (0.3 + 0.2 * nz.vn(col * 0.16 + 1.7)) * s;
    const wide = 0.55 + 0.1 * nz.vn(col * 0.2 + 8.3);
    if (p.y > edgeY && rr < wide) return p.y < edgeY + row ? RIM : PATCH;
    const drip = nz.hash(col, 5) > 0.64 ? (1 + Math.floor(nz.hash(col, 6) * 3)) * row : 0;
    if (p.y > edgeY - drip && rr < wide - 0.06 && n.z > 0.1) return RIM;
    return n.y > TOP_NY ? TOP : SIDE;
  };
}

export function build(ctx: AssetCtx): THREE.Object3D {
  const v = ctx.variant % 3;
  const rnd = ctx.rng(`rocks:${v}`);
  const T = ctx.texel;
  const nz = noise1(Math.floor(ctx.rng(`rocks:patch:${v}`)() * 1e9));
  const g = new THREE.Group();
  // 每种材质一组几何体
  const redSide: THREE.BufferGeometry[] = [];
  const redTop: THREE.BufferGeometry[] = [];
  const varnish: THREE.BufferGeometry[] = [];
  const cool: THREE.BufferGeometry[] = [];
  const lichen: THREE.BufferGeometry[] = [];
  const rim: THREE.BufferGeometry[] = [];
  const sand: THREE.BufferGeometry[] = [];
  const push = (dst: THREE.BufferGeometry[], geo: THREE.BufferGeometry | null) => geo && dst.push(geo);

  /** 红砂岩：侧面（沉积层 uv）、顶面、岩漆（可选） */
  const red = (geo: THREE.BufferGeometry, withVarnish: boolean) => {
    geo.computeBoundingBox();
    const bb = geo.boundingBox!;
    const top = bb.max.y;
    const h = top - Math.max(bb.min.y, 0);
    const cz = (bb.min.z + bb.max.z) / 2;
    const cls: Classify = withVarnish ? varnishCls(nz, T, top, h, cz) : (_p, n) => (n.y > TOP_NY ? TOP : SIDE);
    const parts = splitByClass(geo, cls, 4, T * 0.75);
    // 层从石顶往下 0.12 米开始数（墙顶第一行的"唇下暗线"在石头上是多余的一圈黑边）
    push(redSide, toGeo(parts[SIDE], top, 0.12));
    push(redTop, toGeo(parts[TOP]));
    push(varnish, toGeo(parts[PATCH], top, 0.12));
  };

  if (v === 0) {
    // 一大块红砂岩（平顶微斜）+ 右前一块中的 + 左前一块小的
    red(rock({ rx: 0.85, rz: 0.68, rings: boulder(1.15, 0.03), x: -0.15, z: -0.15, ry: 0.35 }, rnd), true);
    red(rock({ rx: 0.42, rz: 0.36, rings: boulder(0.55), x: 0.8, z: 0.45, ry: 1.1 }, rnd), false);
    red(rock({ rx: 0.28, rz: 0.24, rings: boulder(0.32), x: -0.95, z: 0.6, ry: 0.4 }, rnd), false);
    sand.push(drift(-0.75, 0.2, 1.3, 0.34, 1.3, 0.5));
  } else if (v === 1) {
    // 平顶岩板：宽而低的底层（斜边、几乎共面的顶）+ 后面叠一块小的上层（层状砂岩的台）
    const slab = (h: number, n: number): Ring[] => [
      { y: -0.08, r: 1.0, jr: 0.06, n },
      { y: h * 0.7, dy: 0.02, r: 1.0, jr: 0.06, n },
      { y: h, dy: 0.015, r: 0.86, jr: 0.06, n },
    ];
    red(rock({ rx: 1.25, rz: 0.9, rings: slab(0.4, 6), x: 0.05, z: 0.15, ry: 0.15 }, rnd), true);
    red(rock({ rx: 0.7, rz: 0.45, rings: slab(0.34, 5), x: -0.3, z: -0.35, ry: -0.25, y: 0.38 }, rnd), true);
    sand.push(drift(-1.2, 0.4, 0.9, 0.26, 1.3, 0.3));
  } else {
    // 灰紫冷石：一块圆钝的大石 + 右前一块小红石；冷石顶前方一块地衣帽
    const c = rock({ rx: 0.72, rz: 0.62, rings: boulder(1.0, 0.1), x: -0.15, z: -0.1, ry: 0.7 }, rnd);
    c.computeBoundingBox();
    const top = c.boundingBox!.max.y;
    const parts = splitByClass(c, lichenCls(nz, T, top, -0.15, -0.1, 0.72, 0.85), 4, T * 0.75);
    push(cool, toGeo([...parts[SIDE], ...parts[TOP]]));
    push(lichen, toGeo(parts[PATCH]));
    push(rim, toGeo(parts[RIM]));
    red(rock({ rx: 0.36, rz: 0.3, rings: boulder(0.4), x: 0.75, z: 0.5, ry: 0.2 }, rnd), false);
    sand.push(drift(-0.75, 0.25, 1.1, 0.3, 1.2, -0.3));
  }

  const add = (geos: THREE.BufferGeometry[], mat: THREE.Material, name: string) => {
    if (!geos.length) return;
    const m = new THREE.Mesh(mergeGeometries(geos), mat);
    m.name = name;
    g.add(m);
    return m;
  };
  // 多面体：凸边高光 ≤ 0.6，否则小面上一片白；不接收投影（掠射面上的投影毛边是麻点）
  const rockOpts = {
    edge: 0.55,
    convex: 0.4,
    noShadowReceive: true,
    bands: [-0.1, 0.45] as [number, number],
    lightUp: 0.35,
  };
  // 沉积层：一层 3～5 行，层里的块 9～16 纹素宽；q.x 0 = 没有"矮墙实心"、q.y 很大 = 不淌沙（石头不到 18 行）
  const strata = (seed: number): Elem => ({
    kind: 'strata',
    space: 'wall',
    size: [30, 4],
    hi: 0.5,
    q: [0, 1e5, 0, 0],
    seed,
  });
  // 顶面：风化的深浅斑（有机形状，不画缝 —— 顶面上的缝在 45° 下是一张碎瓷砖）
  const topStones: Elem = { kind: 'paint', size: [7, 5], density: [0, 0], seed: 3 };
  add(redSide, ctx.mat('rock', { ...rockOpts, elem: strata(1 + v), tones: ROCK_TONES }), 'rock');
  add(redTop, ctx.mat('rock', { ...rockOpts, elem: topStones, tones: ROCK_TONES }), 'rockTop');
  add(varnish, ctx.mat('rock', { ...rockOpts, elem: strata(1 + v), tones: VARNISH_TONES }), 'varnish');
  // 冷石的面更亮、更平：凸边再降一点，否则中档面上撒满亮点；花岗岩的块状节理
  add(
    cool,
    ctx.mat('rockCool', {
      ...rockOpts,
      convex: 0.3,
      elem: { kind: 'stones', size: [8, 5], seam: 0.6, hi: 0.3, seed: 5 },
      tones: COOL_TONES,
    }),
    'rockCool',
  );
  // 地衣只分亮/中两档（背光的面也是中档，不然是一块深色）
  const lichenOpts = { ...rockOpts, convex: 0.3, bands: [-2, 0.45] as [number, number] };
  add(
    lichen,
    ctx.mat('sage', {
      ...lichenOpts,
      ramp: LICHEN,
      noise: 0,
      elem: { kind: 'paint', size: [5, 4], density: [0, 0], seed: 2 },
      tones: LICHEN_TONES,
    }),
    'lichen',
  );
  add(rim, ctx.mat('sage', { ...lichenOpts, ramp: LICHEN_RIM, noise: 0 }), 'lichenRim');
  add(
    sand,
    ctx.mat('sandDrift', { lightUp: 0.3, elem: { ...EL.sand, mottle: 0, pebbles: 0.04, seed: 6 + v } }),
    'drift',
  );
  ctx.mats.prepare(g);
  return g;
}

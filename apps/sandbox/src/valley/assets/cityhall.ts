// 市政厅的资产（批 CH，2026-11-18 美术关卡 2，docs/lab/2026-11-07-3d-pixel/valley-civic.md「1. 市政厅」）。这个文件归市政厅的资产代理。
// ASSETS['<id>'] = (ctx) => THREE.Object3D：本地原点 = 落地点中心，y 0 = 地面，+z 朝南；材质只用 ctx.mat(key, extra)；随机只用 ctx.rng('<id>')。
// 画廊：/valleyassets.html?asset=<id>。摆放：detail/sites/cityhall.ts。
//
// 尺寸照**原尺寸**画（小镇的 townwrap 统一乘 0.62），除了两件"长条"（宽或深 ≥ 4.5 米、不贴着楼的）：
// cityhall-canopy、queue-rail —— townwrap 对长条只压高度，所以它们**长宽照最终尺寸、高度照原尺寸**画（头注里各写了）。
// 画面上的人（civic-person）同理照原尺寸画（1.8 米的人 = 原尺寸 2.9 米），缩完和镇上的真人一样高。
//
// 字：缩完一格 = 2 屏幕纹素（0.0675 米）→ 原尺寸一格 LT = 0.109 米；竖直面上一行 = LT / cos45。
// 朝南的立面永远在暗档：立面的沙色板、字、牌子给 lightUp（落中档的沙色 / 亮字），玻璃留暗档；夜里窗、字、钟面换自发光。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { box } from '../../clubsite/render/geo';
import type { Tones, ToonOpts } from '../../clubsite/render/toon';
import type { AssetCtx, AssetFn } from '../ctx';
import { type PalKey, SIGN_FACE, TOWN_EL } from '../palette';

/** 小镇的比例（townscale.ts 的 TOWN_K）：画面上的人、长条的高度换算用 */
const K = 0.62;
/** 字的一格（原尺寸米）：缩完 2 屏幕纹素 */
const LT = 0.109;
const LROW = LT / Math.SQRT1_2;
/** 夜里的暖光 */
const GLOW_SIGN = 0x6a5a30;
const GLOW_WIN = 0x5a4424;
const GLOW_CLOCK = 0x7a6c48;

type Ramp = [number, number, number];
/**
 * 屋面、挑檐顶、雨棚顶：沙色家族里暖一档的砾石屋面（civicSand 的亮档 S 0.38 太白：拉远时屋顶是楼的九成，
 * 门口竖屏三成是屋顶，全换成 civicSand 正午饱和度掉到 0.32）。L 182/193/170（S 0.56）· 147/158/136 · 92/102/82；缝 −30；亮边 +25。2026-11-18 亮档再暖一点：门口正午饱和度 0.367 → 0.379（竖屏下四分之一是沥青）
 */
const ROOF_T: Tones = {
  bands: [
    [0xf2ac6a, 0xfab878, 0xe6a060],
    [0xcc8a6a, 0xd69674, 0xc07e60],
    [0x744e7e, 0x7e5888, 0x6a4674],
  ] as [Ramp, Ramp, Ramp],
  seam: [0xd49a5e, 0xa86a5c, 0x52386a],
  hi: [0xffd29a, 0xe6a682, 0x92709c],
};
const ROOF_RAMP: Ramp = [0xf2ac6a, 0xcc8a6a, 0x744e7e];
/** 朝南的沙色立面：光往上偏一点 → 落中档的沙色（不是暗档的梅紫，和市中心白灰泥铺面的暗带拉开） */
const FACADE: ToonOpts = { lightUp: 0.6, bands: [-0.4, 0.45], noShadowReceive: true };

type Part = [THREE.BufferGeometry, THREE.Material];
/** 一件资产的零件：按材质合成一个网格（只留 position + normal） */
class Parts {
  list: Part[] = [];
  add(m: THREE.Material, ...gs: THREE.BufferGeometry[]) {
    for (const g of gs) this.list.push([g, m]);
    return this;
  }
  group(ctx: AssetCtx, name: string): THREE.Group {
    const g = new THREE.Group();
    g.name = name;
    const by = new Map<THREE.Material, THREE.BufferGeometry[]>();
    for (const [geo, m] of this.list) {
      const ng = geo.index ? geo.toNonIndexed() : geo;
      for (const a of Object.keys(ng.attributes)) if (a !== 'position' && a !== 'normal') ng.deleteAttribute(a);
      if (!ng.attributes.normal) ng.computeVertexNormals();
      by.set(m, [...(by.get(m) ?? []), ng]);
    }
    for (const [m, list] of by) {
      const merged = mergeGeometries(list);
      if (merged) g.add(new THREE.Mesh(merged, m));
    }
    ctx.mats.prepare(g);
    return g;
  }
}
/** 这些材质的网格不投影（不给 = 全部） */
function noCast(g: THREE.Group, ...mats: THREE.Material[]) {
  for (const o of g.children) {
    const m = o as THREE.Mesh;
    if (m.isMesh && (mats.length === 0 || mats.includes(m.material as THREE.Material))) {
      m.castShadow = false;
      m.userData.noCast = true;
    }
  }
}
/** 夜里亮的：[白天的材质, 夜里的材质] 天黑换；pool = 门灯的灯光圈（本地 x z、半径、高） */
function nightLights(
  g: THREE.Group,
  pairs: [THREE.Material, THREE.Material][],
  pool?: [number, number, number, number],
) {
  const meshes: [THREE.Mesh, THREE.Material, THREE.Material][] = [];
  for (const [day, night] of pairs)
    for (const o of g.children) {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.material === day) meshes.push([m, day, night]);
    }
  let lit = false;
  const v = new THREE.Vector3();
  g.userData.night = {
    setOn(on: boolean) {
      lit = false;
      for (const [m, day, night] of meshes)
        if (m.material === day || m.material === night) {
          m.material = on ? night : day;
          lit ||= on;
        }
    },
    pool: (): [number, number, number, number] => {
      if (!pool) return [0, 0, 0, 0];
      g.updateWorldMatrix(true, false);
      v.set(pool[0], 0, pool[1]).applyMatrix4(g.matrixWorld);
      return lit ? [v.x, v.z, pool[2], pool[3]] : [v.x, v.z, 0, 0];
    },
  };
}

/** 朝 +z 的竖直平面（中心 x、底 y、z） */
const quad = (w: number, h: number, x: number, y: number, z: number) =>
  new THREE.PlaneGeometry(w, h).translate(x, y + h / 2, z);
/** 地上 / 顶上的水平面（中心 x z、高 y） */
const flat = (w: number, d: number, x: number, y: number, z: number) =>
  new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2).translate(x, y, z);
/** 立着的圆柱（底 y） */
const cyl = (r: number, h: number, x: number, y: number, z: number, n = 6) =>
  new THREE.CylinderGeometry(r, r, h, n).translate(x, y + h / 2, z);
/** 朝 +z 的扁圆（厚 t） */
const disc = (r: number, t: number, x: number, y: number, z: number, n = 16) =>
  new THREE.CylinderGeometry(r, r, t, n).rotateX(Math.PI / 2).translate(x, y, z + t / 2);

// ── 像素字（5 × 7）──
const GLYPH: Record<string, string[]> = {
  C: ['.####', '#....', '#....', '#....', '#....', '#....', '.####'],
  I: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  G: ['.####', '#....', '#....', '#.###', '#...#', '#...#', '.###.'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
};
const CH = 6 * LT;
/** 一串字（朝 +z 的平面）：左下角 (x, y)，平面 z */
function textGeo(s: string, x: number, y: number, z: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  let cx = x;
  for (const ch of s) {
    const gl = GLYPH[ch];
    if (gl)
      gl.forEach((row, r) => {
        let c = 0;
        while (c < 5) {
          if (row[c] !== '#') {
            c++;
            continue;
          }
          let e = c;
          while (e < 5 && row[e] === '#') e++;
          out.push(quad((e - c) * LT, LROW, cx + ((c + e) / 2) * LT, y + (6 - r) * LROW, z));
          c = e;
        }
      });
    cx += CH;
  }
  return out;
}
const textW = (s: string) => s.length * CH - LT;
/** 竖排（每个字一行，往下排）：顶上那个字的左上角 (x, yTop) */
function textVGeo(s: string, x: number, yTop: number, z: number, gap = LROW * 2): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  let y = yTop - 7 * LROW;
  for (const ch of s) {
    if (ch !== ' ') out.push(...textGeo(ch, x, y, z));
    y -= 7 * LROW + gap;
  }
  return out;
}

// ═════════════════════════════════════════════════════════════════════════════════════════
// cityhall-front：原点 = 楼的中心（原尺寸 (434, −658)），楼 40 × 18 × 7.5（墙、屋顶板是 build.ts 的），南立面 z = +9。
// 从西往东：西半一整面暗玻璃（竖棂 1.5 米一根）+ 前面 16 根香槟金的管格栅（上下横梁）| 正门（两扇玻璃 + 深色门框 + 门上一块深蓝牌
// "CITY HALL"）| 东半一条窗带（雨棚盖着下半）；立面皮 = 沙色板（3 米一条竖缝）+ 勒脚；屋顶前沿深挑檐（出挑 2.2 + 白边）；
// 屋面：沙色的皮（6 米一格的分格缝）、两排天窗、四台空调、一个检修口 + 墙后的爬梯、一圈矮女儿墙压顶。
// ═════════════════════════════════════════════════════════════════════════════════════════
const cityhallFront: AssetFn = (ctx) => {
  const F = 9;
  const H = 7.5;
  const W = 40;
  const D = 18;
  const sand = ctx.mat('civicSand', { elem: TOWN_EL.civicSand, ...FACADE });
  const sandTop = ctx.mat('civicSand', {
    ramp: ROOF_RAMP,
    tones: ROOF_T,
    elem: { kind: 'planks', seam: 1, hi: 0.35, p: [1, 0, 0, 6], mottle: 0.35 },
    toneW: [0.2, 0.2],
  });
  const sandTrim = ctx.mat('civicSand', { noShadowReceive: true });
  // 挑檐前沿的封檐：亮档的沙色（比屋面浅一档，挑檐的边读得出来；原来白的，正午门口画面里一条白把饱和度拉低）
  const edgeBand = ctx.mat('civicSand', { noShadowReceive: true, lightUp: 0.6, bands: [-0.4, 0.2] });
  const glass = ctx.mat('jug', { noShadowReceive: true });
  const glassN = ctx.mat('straw', { noShadowReceive: true, emissive: GLOW_WIN });
  const iron = ctx.mat('ironwork', { noShadowReceive: true });
  const pipe = ctx.mat('pipeGold', { noShadowReceive: true, lightUp: 0.5, bands: [-0.3, 0.45] });
  const board = ctx.mat('signBoard', SIGN_FACE);
  const paint = ctx.mat('signPaint', SIGN_FACE);
  const paintN = ctx.mat('signPaint', { ...SIGN_FACE, emissive: GLOW_SIGN });
  const metal = ctx.mat('metal');
  const skylight = ctx.mat('jug', { bands: [0.9, 0.98] }); // 天窗落中档的蓝（反着天光），不是一块块浅青
  const p = new Parts();

  // ── 立面皮（沙色板，盖住 build.ts 的白墙）+ 勒脚（深一档的一条，接地）──
  p.add(sand, quad(W, H - 0.4, 0, 0.4, F + 0.03));
  p.add(iron, box(W + 0.1, 0.4, 0.08, 0, 0, F + 0.04));
  // ── 西半：暗玻璃墙（x −19…−5，高 0.8…5.4）+ 竖棂 ──
  p.add(glass, quad(14, 4.6, -12, 0.8, F + 0.06));
  for (let x = -19; x <= -5; x += 1.5) p.add(iron, quad(0.11, 4.6, x, 0.8, F + 0.07));
  p.add(sandTrim, box(14.2, 0.2, 0.3, -12, 0.6, F + 0.15)); // 窗台
  // 管格栅：16 根 Ø0.3（缩完 4 纹素），隔 0.85，离墙 0.7；上下两根横梁
  for (let i = 0; i < 16; i++) p.add(pipe, cyl(0.15, 5.4, -18 + i * 0.85, 0.3, F + 0.75));
  p.add(pipe, box(13.4, 0.26, 0.5, -11.6, 5.7, F + 0.55), box(13.4, 0.26, 0.5, -11.6, 0.1, F + 0.55));
  // ── 正门（x −3…3）：门框（深色）+ 两扇玻璃 + 中梃 + 门上的牌子 "CITY HALL" ──
  p.add(iron, quad(6.0, 4.0, 0, 0, F + 0.06));
  p.add(glass, quad(2.45, 3.4, -1.32, 0.1, F + 0.08), quad(2.45, 3.4, 1.32, 0.1, F + 0.08));
  p.add(board, box(7.4, 1.5, 0.2, 0, 4.15, F + 0.1));
  p.add(paint, ...textGeo('CITY HALL', -textW('CITY HALL') / 2, 4.15 + (1.5 - 7 * LROW) / 2 - LROW * 0.2, F + 0.21));
  // 门两边的门灯（小方灯，夜里亮）
  for (const s of [-1, 1]) p.add(paint, box(0.35, 0.5, 0.25, s * 3.5, 3.0, F + 0.12));
  // ── 格栅前一条矮花池（x −19…−9.6）：沙色矮墙 + 龙舌兰、九重葛（中世纪现代的沙漠庭院；楼影里也要看得出是花：不受投影、光往上偏）──
  {
    const planter = ctx.mat('civicSand', { noShadowReceive: true, lightUp: 0.3 });
    const soil = ctx.mat('wood', { noShadowReceive: true });
    const LEAF: ToonOpts = { lightUp: 0.4, bands: [-0.1, 0.6], noShadowReceive: true, noise: 0.3 };
    const agave = ctx.mat('cactus', LEAF);
    const bloom = ctx.mat('flowerPurple', LEAF);
    const leaf = ctx.mat('olive', LEAF);
    p.add(planter, box(9.4, 0.75, 1.3, -14.3, 0, F + 1.65));
    p.add(soil, flat(9.0, 0.9, -14.3, 0.72, F + 1.65));
    const rnd = ctx.rng('cityhall-front:planter');
    for (let i = 0; i < 6; i++) {
      const x = -18.4 + i * 1.6 + (rnd() - 0.5) * 0.4;
      if (i % 2 === 0) p.add(agave, new THREE.ConeGeometry(0.5, 1.1, 5).translate(x, 0.75 + 0.55, F + 1.65));
      else {
        p.add(leaf, new THREE.IcosahedronGeometry(0.62, 0).translate(x, 1.25, F + 1.6));
        p.add(bloom, new THREE.IcosahedronGeometry(0.42, 0).translate(x + 0.2, 1.6, F + 1.85));
      }
    }
  }
  // ── 东半：窗带（x 5…19，高 1.4…4.4）+ 竖棂 ──
  p.add(glass, quad(14, 3.0, 12, 1.4, F + 0.06));
  for (let x = 5; x <= 19; x += 2) p.add(iron, quad(0.11, 3.0, x, 1.4, F + 0.07));
  p.add(sandTrim, box(14.2, 0.2, 0.3, 12, 1.2, F + 0.15));

  // ── 深挑檐：沙色板往外 2.2（z F−1.2…F+2.2），前沿一条白边 0.6；整条比楼宽 3 米 ──
  p.add(sandTop, box(W + 3, 0.7, 3.4, 0, H, F + 0.5));
  p.add(edgeBand, box(W + 3.1, 0.6, 0.14, 0, H + 0.05, F + 2.25));
  for (const s of [-1, 1]) p.add(edgeBand, box(0.14, 0.6, 3.4, s * (W / 2 + 1.55), H + 0.05, F + 0.5));

  // ── 屋面：沙色的皮（6 米一格的分格缝，面朝上）+ 一圈矮女儿墙压顶 ──
  const RY = H + 0.6;
  p.add(sandTop, flat(W + 0.4, D + 0.4, 0, RY, 0));
  p.add(sandTrim, box(W + 0.6, 0.35, 0.3, 0, RY, -D / 2 - 0.05)); // 北沿压顶
  for (const s of [-1, 1]) p.add(sandTrim, box(0.3, 0.35, D - 1, s * (W / 2 + 0.15), RY, -0.5)); // 东西沿
  // 两排天窗（暗玻璃的斜面盒子，各 4 个，不等距）
  for (const [x, z] of [
    [-14, -3],
    [-7.5, -3],
    [-1.5, -3],
    [6, -3],
    [-11, 3.4],
    [-4, 3.4],
    [11.5, 3.4],
    [16, -3],
  ] as const) {
    p.add(sandTrim, box(2.4, 0.35, 1.6, x, RY, z));
    p.add(skylight, box(2.0, 0.12, 1.2, x, RY + 0.35, z));
  }
  // 四台空调（一团一团：箱子 + 顶上的风扇圈），东北角一组、西北一台
  for (const [x, z] of [
    [8.5, -6.2],
    [10.6, -6.2],
    [12.7, -6.0],
    [-17, -6.5],
  ] as const) {
    p.add(metal, box(1.6, 0.9, 1.3, x, RY, z));
    p.add(iron, new THREE.CircleGeometry(0.42, 8).rotateX(-Math.PI / 2).translate(x, RY + 0.91, z));
  }
  // 检修口（小方盒 + 盖）+ 北墙上的爬梯（两根立杆 + 横档，屋面以上露一截扶手）
  p.add(metal, box(1.3, 0.5, 1.3, 2.5, RY, -6.5));
  p.add(iron, box(1.4, 0.08, 1.4, 2.5, RY + 0.5, -6.5));
  for (const s of [-1, 1]) p.add(iron, box(0.1, 1.3, 0.1, -9 + s * 0.3, RY, -D / 2 + 0.2));
  // 一根旗杆底座 / 天线（屋顶上的细杆，不要：拉远看是噪点）—— 不放

  const g = p.group(ctx, 'valley-asset:cityhall-front');
  // 立面上的薄件（格栅、玻璃、字）不投影；挑檐、屋面上的东西投影
  noCast(g, glass, iron, paint, board, edgeBand, pipe);
  // 夜里：玻璃、字、门灯亮；门前一个灯光圈
  nightLights(
    g,
    [
      [glass, glassN],
      [paint, paintN],
    ],
    [0, F + 3.5, 6.5, 5],
  );
  return g;
};

// ═════════════════════════════════════════════════════════════════════════════════════════
// cityhall-steps：原点 = 正门门槛（原尺寸 (434, −649)），+z 朝南。三级宽台阶 16 米宽（每级深 1.24、高 0.29，上沿一条亮边）。
// v1 = 听证会那天：最上一级门西边一张讲台（木箱 + 深蓝顶板 + 一支话筒）+ 台阶两头红白蓝的彩旗带。
// ═════════════════════════════════════════════════════════════════════════════════════════
const cityhallSteps: AssetFn = (ctx) => {
  // 台阶和前庭一样整天在楼影里：同前庭的陶砖（cityhall-forecourt），不接收投影、落中档
  const stone = ctx.mat('tile', {
    ramp: [0xec9a64, 0xc8705a, 0xb84a6c],
    tones: SALTILLO_T,
    elem: { kind: 'stones', size: [9, 6], seam: 0.6, hi: 0.5 },
    noShadowReceive: true,
    bands: [0.1, 0.99],
  });
  const nose = ctx.mat('civicSand', { noShadowReceive: true, lightUp: 0.3 });
  const p = new Parts();
  for (let i = 0; i < 3; i++) {
    const dd = (3 - i) * 1.24;
    p.add(stone, box(16, (i + 1) * 0.29, dd, 0, 0, dd / 2));
    p.add(nose, box(16.02, 0.08, 0.12, 0, (i + 1) * 0.29 - 0.08, dd - 0.06)); // 踏步前沿（缩完 1 纹素的亮边）
  }
  // 两头的花池（矮沙色墙 + 一丛龙舌兰，压住台阶两端）
  const agave = ctx.mat('cactus');
  for (const s of [-1, 1]) {
    p.add(nose, box(1.4, 0.75, 3.72, s * 8.7, 0, 1.86));
    p.add(agave, new THREE.ConeGeometry(0.6, 1.0, 5).translate(s * 8.7, 1.25, 1.6));
  }
  if (ctx.variant === 1) {
    const wood = ctx.mat('wood');
    const board = ctx.mat('signBoard', SIGN_FACE);
    const iron = ctx.mat('ironwork');
    p.add(wood, box(1.3, 1.9, 0.8, -3.6, 0.87, 0.7));
    p.add(board, box(1.45, 0.3, 0.95, -3.6, 2.77, 0.7));
    p.add(iron, box(0.08, 0.7, 0.08, -3.4, 3.07, 0.95));
    // 彩旗带：台阶两头的花池之间拉一条（三色三角旗，一面一块）
    const flags: PalKey[] = ['clothRed', 'clothWhite', 'clothBlue'];
    for (let i = 0; i < 14; i++) {
      const m = ctx.mat(flags[i % 3], SIGN_FACE);
      const x = -7.6 + i * 1.17;
      const sag = 0.45 * Math.sin((i / 13) * Math.PI);
      const tri = new THREE.BufferGeometry().setAttribute(
        'position',
        new THREE.Float32BufferAttribute([-0.4, 0, 0, 0.4, 0, 0, 0, -0.55, 0], 3),
      );
      tri.computeVertexNormals();
      p.add(m, tri.translate(x, 4.2 - sag, 3.0));
    }
    for (const s of [-1, 1]) p.add(iron, box(0.12, 4.3, 0.12, s * 8.2, 0.75, 3.0));
  }
  const g = p.group(ctx, 'valley-asset:cityhall-steps');
  noCast(g, nose);
  return g;
};

// ═════════════════════════════════════════════════════════════════════════════════════════
// cityhall-canopy（长条：长宽 = 最终尺寸，高度 = 原尺寸）：原点 = 雨棚中心的地面（缩完 (444.05, −646.7)），14.9 × 8.6，
// 板底 5.8（缩完 3.6）、厚 0.5。两个 Ø2.3 圆洞（棕榈从里面穿出来；洞边一圈白）；前沿、东西沿一条白边；前沿三根细钢柱。
// 顶面沙色、6 米一格的伸缩缝。
// ═════════════════════════════════════════════════════════════════════════════════════════
export const CANOPY = {
  w: 14.9,
  d: 8.6,
  /** 洞（本地 x z） */
  holes: [
    [-4.45, 1.4],
    [2.55, 2.0],
  ] as [number, number][],
  y: 5.8,
  cols: [-6.85, -0.05, 6.85],
};
const cityhallCanopy: AssetFn = (ctx) => {
  const top = ctx.mat('civicSand', {
    ramp: ROOF_RAMP,
    tones: ROOF_T,
    elem: { kind: 'planks', seam: 1, hi: 0.3, p: [1, 0, 0, 3] },
    toneW: [0.2, 0.2],
  });
  const white = ctx.mat('stucco', { noShadowReceive: true, lightUp: 0.4, bands: [-0.2, 0.5] });
  const steel = ctx.mat('metal', { noShadowReceive: true });
  const { w, d, holes, y } = CANOPY;
  const t = 0.5;
  const p = new Parts();
  const sh = new THREE.Shape();
  sh.moveTo(-w / 2, -d / 2);
  sh.lineTo(w / 2, -d / 2);
  sh.lineTo(w / 2, d / 2);
  sh.lineTo(-w / 2, d / 2);
  sh.lineTo(-w / 2, -d / 2);
  for (const [hx, hz] of holes) {
    const ph = new THREE.Path();
    ph.absarc(hx, -hz, 1.15, 0, Math.PI * 2, true);
    sh.holes.push(ph);
  }
  // 平面（shape 的 y = −z）→ 拉伸 t 往 +y
  const slab = new THREE.ExtrudeGeometry(sh, { depth: t, bevelEnabled: false, curveSegments: 10 });
  slab.rotateX(-Math.PI / 2).translate(0, y, 0);
  p.add(top, slab);
  // 白边：前沿、东西沿（板的外侧再贴一条，比板高出 0.1）
  p.add(white, box(w + 0.12, t + 0.1, 0.1, 0, y - 0.05, d / 2 + 0.05));
  for (const s of [-1, 1]) p.add(white, box(0.1, t + 0.1, d, s * (w / 2 + 0.05), y - 0.05, 0));
  // 洞边一圈白（开口的圆管，略高出板面）
  for (const [hx, hz] of holes)
    p.add(white, new THREE.CylinderGeometry(1.2, 1.2, t + 0.12, 14, 1, true).translate(hx, y + t / 2, hz));
  // 前沿三根柱（缩完粗 0.12 = 3 纹素：长条的 xz 不缩，直接写最终粗细）
  for (const x of CANOPY.cols) p.add(steel, box(0.13, y, 0.13, x, 0, d / 2 - 0.3));
  const g = p.group(ctx, 'valley-asset:cityhall-canopy');
  noCast(g, white, steel);
  return g;
};

// ═════════════════════════════════════════════════════════════════════════════════════════
// clock-pylon：原点 = 塔脚中心。原尺寸 4.4 × 27 × 2.8（缩完 16.7 米，楼高的 3.6 倍：拉远认得出是地标）。
// 两片 1.0 米宽的沙色立板（中间空 1.4）夹着：下面一块花池底座，中段一条深蓝竖字牌（竖排 CITY HALL，缩完一格 2 纹素），
// 上段一个钟箱（朝南一面白钟面 Ø2.4：12 个刻度块、两根针、钟心），顶上一块出挑的平板 + 一颗金顶球。
// 不投影（27 米的塔投一整块方的硬影）；夜里钟面、字自发光。
// ═════════════════════════════════════════════════════════════════════════════════════════
const clockPylon: AssetFn = (ctx) => {
  // 立板：屋面那套暖一档的沙色（塔比楼暖、比楼深，前庭里一眼是"另一件东西"；正午门口画面的饱和度也靠它）
  const fin = ctx.mat('civicSand', {
    ramp: ROOF_RAMP,
    tones: ROOF_T,
    elem: { kind: 'planks', seam: 1, hi: 0.3, p: [0, 1, 0, 2.2] },
    ...FACADE,
  });
  const finTop = ctx.mat('civicSand', { ramp: ROOF_RAMP, tones: ROOF_T, noShadowReceive: true });
  const white = ctx.mat('stucco', { noShadowReceive: true, lightUp: 0.4, bands: [-0.2, 0.5] });
  const face = ctx.mat('clothWhite', { ...SIGN_FACE, lightUp: 0.7 });
  const faceN = ctx.mat('clothWhite', { ...SIGN_FACE, lightUp: 0.7, emissive: GLOW_CLOCK });
  const iron = ctx.mat('ironwork', { noShadowReceive: true });
  const board = ctx.mat('signBoard', SIGN_FACE);
  const paint = ctx.mat('signPaint', SIGN_FACE);
  const paintN = ctx.mat('signPaint', { ...SIGN_FACE, emissive: GLOW_SIGN });
  const gold = ctx.mat('pipeGold', { noShadowReceive: true, lightUp: 0.3 });
  const plant = ctx.mat('cactus');
  const p = new Parts();
  const HT = 26.2;
  // 底座花池（矮墙 + 两丛龙舌兰）
  p.add(finTop, box(4.4, 0.8, 2.8, 0, 0, 0));
  for (const s of [-1, 1]) p.add(plant, new THREE.ConeGeometry(0.55, 1.0, 5).translate(s * 1.4, 1.3, 0.6));
  // 两片立板
  for (const s of [-1, 1]) {
    p.add(fin, box(1.0, HT - 0.8, 2.4, s * 1.2, 0.8, 0));
  }
  // 竖字牌（两片立板之间，原尺寸 1.4 × 12.5，离地 3.5）："CITY HALL"
  const bx0 = 3.5;
  const bh = 12.5;
  p.add(board, box(1.4, bh, 0.5, 0, bx0, 0.3));
  p.add(paint, ...textVGeo('CITYHALL', -5 * LT * 0.5, bx0 + bh - 0.5, 0.56, LROW * 2.5));
  // 钟箱（立板之间，HT−6.5…HT−2.3）+ 朝南的钟面
  const cy = HT - 4.3;
  p.add(finTop, box(1.4, 4.2, 2.0, 0, HT - 6.5, 0));
  p.add(white, disc(1.25, 0.12, 0, cy, 1.0, 20)); // 白圈（钟面外沿比立板宽一点，两边各露 0.05）
  p.add(face, disc(1.12, 0.08, 0, cy, 1.1, 20));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const r = 0.92;
    const L = i % 3 === 0 ? 0.26 : 0.16;
    p.add(
      iron,
      box(i % 3 === 0 ? 0.14 : 0.1, L, 0.04, 0, -L / 2, 0)
        .rotateZ(-a)
        .translate(Math.sin(a) * r, cy + Math.cos(a) * r, 1.2),
    );
  }
  p.add(
    iron,
    box(0.12, 0.62, 0.05, 0, 0, 0)
      .rotateZ(-0.5)
      .translate(0.15, cy + 0.26, 1.24),
  ); // 时针（约十点）
  p.add(
    iron,
    box(0.09, 0.86, 0.05, 0, 0, 0)
      .rotateZ(2.1)
      .translate(-0.37, cy - 0.21, 1.25),
  ); // 分针
  p.add(gold, disc(0.12, 0.06, 0, cy, 1.26, 8));
  // 顶板（出挑）+ 金顶球
  p.add(white, box(4.4, 0.5, 3.2, 0, HT, 0)); // 宽 < 4.5：townwrap 才把整座塔当"小件"整体缩（不然只压高度）
  p.add(finTop, box(4.2, 0.3, 2.8, 0, HT + 0.5, 0));
  p.add(gold, cyl(0.06, 1.1, 0, HT + 0.8, 0, 6), new THREE.IcosahedronGeometry(0.32, 0).translate(0, HT + 2.1, 0));
  const g = p.group(ctx, 'valley-asset:clock-pylon');
  noCast(g);
  nightLights(
    g,
    [
      [face, faceN],
      [paint, paintN],
    ],
    [0, 1.8, 3.5, 6],
  );
  return g;
};

// ═════════════════════════════════════════════════════════════════════════════════════════
// notice-board：原点 = 两根柱中间的地面。3.5 × 3.9 × 0.4：两根深色柱 + 软木板 3 × 2（离地 1.6）+ 沙色小顶 + 板上的纸。
// v0 = 平时：6 张纸（白的公告、黄的批文、一张蓝的、一张红的），v1 = 听证会：中间一张大红通知（"HEARING"）。
// ═════════════════════════════════════════════════════════════════════════════════════════
const noticeBoard: AssetFn = (ctx) => {
  const iron = ctx.mat('ironwork');
  const cork = ctx.mat('kraft', { ...SIGN_FACE, lightUp: 0.4, elem: { kind: 'stones', size: [3, 3], seam: 0, hi: 0 } });
  const roof = ctx.mat('civicSand');
  const rnd = ctx.rng(`notice-board:${ctx.variant}`);
  const p = new Parts();
  for (const s of [-1, 1]) p.add(iron, box(0.2, 3.9, 0.2, s * 1.55, 0, 0));
  p.add(cork, box(3.0, 2.0, 0.14, 0, 1.6, 0.06));
  p.add(iron, box(3.1, 0.1, 0.18, 0, 1.55, 0.06), box(3.1, 0.1, 0.18, 0, 3.6, 0.06));
  p.add(roof, box(3.6, 0.22, 0.6, 0, 3.75, 0.05));
  const paper = ctx.mat('newsprint', { ...SIGN_FACE, lightUp: 0.6 });
  const keys: PalKey[] = ['flowerYellow', 'clothBlue', 'clothRed', 'clothTeal'];
  const slots: [number, number, number, number][] = [
    [-1.05, 2.75, 0.6, 0.7],
    [-0.3, 2.95, 0.55, 0.62],
    [0.45, 2.7, 0.62, 0.75],
    [1.1, 2.9, 0.5, 0.6],
    [-0.85, 1.95, 0.62, 0.55],
    [0.2, 1.95, 0.55, 0.6],
    [1.0, 2.0, 0.5, 0.55],
  ];
  slots.forEach(([x, y, w, h], i) => {
    const m = i % 3 === 1 ? ctx.mat(keys[Math.floor(rnd() * keys.length)], SIGN_FACE) : paper;
    p.add(m, quad(w, h, x, y, 0.15 + i * 0.002));
  });
  if (ctx.variant === 1) {
    const red = ctx.mat('clothRed', { ...SIGN_FACE, lightUp: 0.6 });
    const ink = ctx.mat('signPaint', SIGN_FACE);
    p.add(red, quad(1.8, 1.25, 0, 2.0, 0.19));
    p.add(ink, ...textGeo('HEARING', -textW('HEARING') / 2, 2.65, 0.2));
    p.add(ink, quad(1.2, LROW, 0, 2.3, 0.2), quad(0.8, LROW, 0, 2.1, 0.2));
  }
  const g = p.group(ctx, 'valley-asset:notice-board');
  noCast(g, paper, cork);
  return g;
};

// ═════════════════════════════════════════════════════════════════════════════════════════
// cityhall-forecourt（平铺：townwrap 不动，长宽 = 最终尺寸）：原点 = 前庭中心，52.2 × 6.7，高 0.042（kit 的 Y.pave）。
// 萨尔蒂略陶砖（同报社门前那套，棕榈泉的门廊地面）：前庭正午整块在楼的影子里 → 暗档给足彩度（玫瑰紫，不是灰粉）。
// ═════════════════════════════════════════════════════════════════════════════════════════
const SALTILLO_T: Tones = {
  bands: [
    [0xec9a64, 0xf2a66e, 0xe08e5a],
    [0xc8705a, 0xd27c62, 0xbc6652],
    // 暗档（前庭正午整块在楼影里）：比报社那套再红、再饱和一点 —— 门口竖屏三成是这块地，饱和度靠它（午后方案把暗档往灰褐拉）
    [0xb84a6c, 0xc05474, 0xac4264],
  ] as [Ramp, Ramp, Ramp],
  seam: [0xc47a50, 0xa45a4c, 0x8a3456],
  hi: [0xf8b47c, 0xdc8a6c, 0xcc6a88],
};
export const FORECOURT = { w: 52.2, d: 6.7 };
const cityhallForecourt: AssetFn = (ctx) => {
  // 前庭正午大半在楼影里，照实落暗档（午后方案把暗档压成灰褐 S 0.36，门口竖屏三成是它）→ 不接收投影、档位线往上挪：
  // 整块落中档的砖红（"楼影里的陶砖"，不是太阳底下的橙）；同报社拱廊顶 tileShadeOpts 的做法
  const pave = ctx.mat('tile', {
    ramp: [0xec9a64, 0xc8705a, 0xb84a6c],
    tones: SALTILLO_T,
    noShadowReceive: true,
    bands: [0.1, 0.99],
    elem: { kind: 'stones', size: [7, 5], seam: 0.6, hi: 0.3 },
    edge: 0.05,
    convex: 0,
  });
  const p = new Parts();
  p.add(pave, flat(FORECOURT.w, FORECOURT.d, 0, 0.042, 0));
  return p.group(ctx, 'valley-asset:cityhall-forecourt');
};

// ═════════════════════════════════════════════════════════════════════════════════════════
// queue-rail（长条：长宽 = 最终尺寸，高度 = 原尺寸）：原点 = 中心地面，最终 4.6 × 1.25；
// 两排立柱（每排 4 根，粗 0.1 = 3 纹素，顶上一颗亮球）+ 蓝拉带 + 西头封口 + 一块"请取号"的小立牌（TAKE A NUMBER → 用色块）。
// 原尺寸高：立柱 1.6（缩完 1.0）。
// ═════════════════════════════════════════════════════════════════════════════════════════
const queueRail: AssetFn = (ctx) => {
  const steel = ctx.mat('metal', { noShadowReceive: true });
  const ball = ctx.mat('pipeGold', { noShadowReceive: true });
  const belt = ctx.mat('clothBlue', { ...SIGN_FACE, lightUp: 0.4 });
  const sign = ctx.mat('signBoard', SIGN_FACE);
  const ink = ctx.mat('signPaint', SIGN_FACE);
  const H = 1.6;
  const p = new Parts();
  const xs = [-2.25, -0.75, 0.75, 2.25];
  for (const z of [-0.62, 0.62]) {
    for (const x of xs) {
      p.add(steel, box(0.1, H, 0.1, x, 0, z), box(0.3, 0.06, 0.3, x, 0, z));
      p.add(ball, box(0.14, 0.12, 0.14, x, H, z));
    }
    p.add(belt, box(4.5, 0.2, 0.04, 0, H - 0.35, z));
  }
  p.add(belt, box(0.04, 0.2, 1.24, -2.25, H - 0.35, 0)); // 西头封口
  // 东头入口的取号立牌（杆 + 小牌，牌面朝南）
  p.add(steel, box(0.08, H * 1.3, 0.08, 2.6, 0, 0.62));
  p.add(sign, box(0.55, 0.7, 0.05, 2.6, H * 1.3 - 0.2, 0.66));
  p.add(ink, quad(0.25, 0.25, 2.6, H * 1.3 + 0.05, 0.69));
  const g = p.group(ctx, 'valley-asset:queue-rail');
  noCast(g);
  return g;
};

// ═════════════════════════════════════════════════════════════════════════════════════════
// flagpole：原点 = 杆脚。杆 10 米 + 金顶球 + 旗面 2.2 × 1.4（朝南，往东飘：两块，中间一道折）。v0 蓝、v1 白、v2 红。
// ═════════════════════════════════════════════════════════════════════════════════════════
const flagpole: AssetFn = (ctx) => {
  const key: PalKey = (['clothBlue', 'clothWhite', 'clothRed'] as const)[((ctx.variant % 3) + 3) % 3];
  const steel = ctx.mat('metal');
  const gold = ctx.mat('pipeGold');
  const cloth = ctx.mat(key, { ...SIGN_FACE, lightUp: 0.5 });
  const clothS = ctx.mat(key, { ...SIGN_FACE, lightUp: 0.2 });
  const p = new Parts();
  p.add(steel, cyl(0.1, 10, 0, 0, 0, 6), box(0.6, 0.25, 0.6, 0, 0, 0));
  p.add(gold, new THREE.IcosahedronGeometry(0.2, 0).translate(0, 10.15, 0));
  // 旗面两块：靠杆那块正对南，外面那块往北折一点（面暗一档 = 一道折痕）
  p.add(cloth, quad(1.15, 1.4, 0.65, 8.3, 0.02));
  p.add(clothS, new THREE.PlaneGeometry(1.1, 1.4).rotateY(-0.35).translate(1.75, 8.3 + 0.7, -0.17));
  const g = p.group(ctx, 'valley-asset:flagpole');
  noCast(g, cloth, clothS);
  return g;
};

// ═════════════════════════════════════════════════════════════════════════════════════════
// civic-person：画面上的人（排队的、听证会的人群；不是镇上的真人，不会动）。原尺寸 2.9 米 = 缩完 1.8 米。
// Q 版的比例（同 clubsite/people：大头、短腿）：腿、身子、手臂、头（肤色 + 发 / 帽）；面朝 +z（南）。
// 变体：衣服颜色、肤色、帽子 / 头发、姿势（v % 4：站着 / 手里一张纸 / 叉腰 / 举手）。场景里转 rot 让他面朝北（背对镜头排队）或侧身。
// ═════════════════════════════════════════════════════════════════════════════════════════
const civicPerson: AssetFn = (ctx) => {
  const v = ctx.variant;
  const S = 1 / K; // 原尺寸 = 最终 / 0.62
  const shirts: PalKey[] = [
    'clothRed',
    'clothTeal',
    'flowerYellow',
    'clothBlue',
    'clothPurple',
    'clothWhite',
    'canvas',
  ];
  const pants: PalKey[] = ['ironwork', 'clothBlue', 'canvas', 'wood'];
  const skins: PalKey[] = ['skinLight', 'skinTan', 'skinDark'];
  // 人站在楼的影子里、朝南的面在暗档：光往上偏，衣服落中档、脸是肤色（不然一个个深褐的小方块）
  const LIT: ToonOpts = { lightUp: 0.5, bands: [-0.35, 0.4], noShadowReceive: true };
  const shirt = ctx.mat(shirts[v % shirts.length], LIT);
  const pant = ctx.mat(pants[(v * 3 + 1) % pants.length], LIT);
  const skin = ctx.mat(skins[(v * 5 + 2) % skins.length], LIT);
  const hairKey: PalKey = v % 5 === 3 ? 'straw' : 'hair';
  const hair = ctx.mat(hairKey, LIT);
  const p = new Parts();
  const add = (m: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, rz = 0) =>
    p.add(
      m,
      box(w * S, h * S, d * S, 0, 0, 0)
        .rotateZ(rz)
        .translate(x * S, y * S, z * S),
    );
  // 腿（0…0.55）、身子（0.5…1.12）、头（1.1…1.62）、发 / 帽
  for (const s of [-1, 1]) add(pant, 0.17, 0.55, 0.2, s * 0.11, 0, 0);
  add(shirt, 0.5, 0.62, 0.3, 0, 0.5, 0);
  add(skin, 0.5, 0.48, 0.44, 0, 1.12, 0);
  if (hairKey === 'straw') {
    add(hair, 0.78, 0.06, 0.7, 0, 1.56, 0);
    add(hair, 0.46, 0.18, 0.44, 0, 1.6, 0);
  } else add(hair, 0.54, 0.16, 0.48, 0, 1.5, -0.02);
  const pose = v % 4;
  for (const s of [-1, 1]) {
    if (pose === 3 && s > 0)
      add(skin, 0.12, 0.5, 0.12, 0.33, 1.05, 0); // 举手
    else if (pose === 2)
      add(shirt, 0.12, 0.42, 0.13, s * 0.33, 0.62, 0, s * 0.35); // 叉腰
    else add(shirt, 0.12, 0.48, 0.13, s * 0.31, 0.58, 0);
  }
  if (pose === 1) p.add(ctx.mat('newsprint'), box(0.3 * S, 0.36 * S, 0.02 * S, 0.12 * S, 0.62 * S, 0.2 * S)); // 手里一张表
  const g = p.group(ctx, 'valley-asset:civic-person');
  return g;
};

// ═════════════════════════════════════════════════════════════════════════════════════════
// cityhall-planter：前庭南沿的矮花池（原点 = 池底中心）：3.4 × 0.75 × 1.2 的沙色矮墙 + 土 + 两团九重葛（洋红）、一团绿、一丛龙舌兰。
// 前庭在楼影里：花和叶子不接收投影、光往上偏（影子里也是洋红和绿，不是"深色卷心菜"）。v1 = 镜像（龙舌兰在另一头）。
// ═════════════════════════════════════════════════════════════════════════════════════════
const cityhallPlanter: AssetFn = (ctx) => {
  const wall = ctx.mat('civicSand', { noShadowReceive: true, lightUp: 0.35 });
  const soil = ctx.mat('wood', { noShadowReceive: true });
  const LEAF: ToonOpts = { lightUp: 0.45, bands: [-0.2, 0.55], noShadowReceive: true, noise: 0.3 };
  const bloom = ctx.mat('flowerPurple', LEAF);
  const leaf = ctx.mat('olive', LEAF);
  const agave = ctx.mat('cactus', LEAF);
  const s = ctx.variant === 1 ? -1 : 1;
  const p = new Parts();
  p.add(wall, box(3.4, 0.75, 1.2, 0, 0, 0));
  p.add(soil, flat(3.1, 0.9, 0, 0.76, 0));
  // 九重葛开满（一大团洋红压过绿叶）：缩完 0.4～0.45 米一团，竖屏里是两块显眼的花色
  p.add(leaf, new THREE.IcosahedronGeometry(0.6, 0).translate(s * -1.05, 1.15, -0.1));
  p.add(bloom, new THREE.IcosahedronGeometry(0.72, 0).translate(s * -0.45, 1.35, 0.1));
  p.add(bloom, new THREE.IcosahedronGeometry(0.62, 0).translate(s * 0.4, 1.3, -0.05));
  p.add(bloom, new THREE.IcosahedronGeometry(0.4, 0).translate(s * -1.25, 1.55, 0.2));
  p.add(leaf, new THREE.IcosahedronGeometry(0.45, 0).translate(s * 0.9, 1.05, 0.2));
  p.add(agave, new THREE.ConeGeometry(0.45, 1.0, 5).translate(s * 1.3, 1.25, 0));
  const g = p.group(ctx, 'valley-asset:cityhall-planter');
  noCast(g, bloom, leaf, agave, soil);
  return g;
};

export const ASSETS: Record<string, AssetFn> = {
  'cityhall-front': cityhallFront,
  'cityhall-steps': cityhallSteps,
  'cityhall-forecourt': cityhallForecourt,
  'cityhall-planter': cityhallPlanter,
  'cityhall-canopy': cityhallCanopy,
  'clock-pylon': clockPylon,
  'notice-board': noticeBoard,
  'queue-rail': queueRail,
  flagpole,
  'civic-person': civicPerson,
};

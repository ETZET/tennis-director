// 餐馆店内的资产（批 D2，第二版风格；2026-11-18 第二轮："让布局和画面自己说话，不靠字"）。这个文件归餐馆的店内代理。
// ASSETS['in2-diner-…'] = (ctx) => THREE.Object3D：本地原点 = 落地点中心，y 0 = 地面，+z 朝南；材质只用 ctx.mat(key, extra)；随机只用 ctx.rng(id)。
// interiors/v2/diner.ts 摆（局部坐标 x 0…10.4 西 → 东、z 0…10.5 北 → 南）。
//
// 照 Sneaky Sasquatch 的餐馆 / 咖啡馆（参考图只看，不进仓库）：**店里没有一个字**，东西自己说明自己 ——
// 开放的后厨（北墙一排不锈钢台：煎板上三块肉饼、炸锅里的薯条、咖啡机两壶咖啡、冰箱、墙上的抽油烟罩和一层盘子），
// 一条横贯的吧台（青色前脸 + 奶白台面）把"员工那边 / 客人这边"分开，台上番茄酱 / 芥末瓶、咖啡杯、派罩、收银机、出菜铃，
// 一排红面吧台凳；东西两墙红色卡座，桌上汉堡、薯条、奶昔、咖啡。菜单板只有图标 + 几条线 + 价签的数字；墙上一个霓虹咖啡杯。
// 能聊的四个人看手边的东西认：场地工（卡座边靠着耙子、桌上一卷场地线）、妈妈（长椅上一个小号球拍包、桌上一筒球）、
// 教练（桌上一块夹板）、记者（桌上相机 + 笔记本）。
// 地板安静（米白 / 浅灰大格），颜色在红凳、红卡座、青吧台、青墙上。
// 店里是固定的顶光（main.ts INDOOR_LOOK，仰角 65°）：朝南的竖直面落暗档 → 墙上挂的、家具正面给 FACE / FRONT（光往上偏，落中档）。
//
// 材质（手挑 3 档 × 3 色，材质规范 v2：每档 [本色, 高一级, 低一级] + 缝 + 亮边，暗档往冷走）：
// FLOOR_A / FLOOR_B（米白 / 浅灰格，原值偏冷：午后金光会把暖白染进沙 / 桃一族）、TEAL_T（北墙、吧台前脸）、CHERRY_T（卡座、凳面、墙上一道红线）、
// TILE_T（白瓷砖墙裙）、CREAM_T（台面、桌面）、镀铬、不锈钢、煎板、菜单板深蓝，以及小件（派、面包、肉饼、生菜、薯条、奶昔、咖啡、球、球拍包）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { box } from '../../../clubsite/render/geo';
import type { Tones, ToonOpts } from '../../../clubsite/render/toon';
import type { AssetCtx, AssetFn } from '../../ctx';
import { SIGN_FACE } from '../../palette';

/** 半个设计纹素（米）：店里镜头近，线 = 2 屏幕像素 */
const T = 0.045;
/** 竖直面上一屏幕行（米） */
const ROW = T / Math.SQRT1_2;

/** 房间（同 interiors/v2/diner.ts） */
export const ROOM = {
  W: 10.4,
  D: 10.5,
  /** 北墙一排后厨台：进深、高 */
  KD: 0.75,
  KH: 0.95,
  /** 吧台：x 范围、前脸 z、进深、台面高 */
  CX0: 1.4,
  CX1: 8.6,
  CZ: 3.65,
  CD: 0.65,
  CH: 1.05,
  /** 墙裙高 */
  DADO: 1.0,
} as const;
const R = ROOM;

type Ramp = [number, number, number];
const tn = (lit: Ramp, mid: Ramp, dark: Ramp, seam: Ramp, hi: Ramp): Tones => ({ bands: [lit, mid, dark], seam, hi });

// ── 调色板（渲染出来还要再过一层午后金光的暖调；按截图量过）──
/** 地板：浅灰蓝 / 灰蓝两色大格（亮度差 ~25，低饱和、安静）；原值偏冷（午后金光会把它染暖，染完是中性的灰） */
const FLOOR_A: Ramp = [0x92a8e6, 0x7890c8, 0x465892];
const FLOOR_B: Ramp = [0x6680d2, 0x5068b2, 0x304086];
/** 后厨的地：深石板灰方砖（员工那边，比客人那边的格子暗两档，一眼分开） */
const QUARRY: Ramp = [0x4a5470, 0x3a4260, 0x222844];
/** 有元素图案（方砖缝）的材质要自己给 tones：不给就用借的那个调色板名（roofMetal）的浅灰 tones */
const QUARRY_T = tn(
  [0x4a5470, 0x525c78, 0x444c68],
  [0x3a4260, 0x424a68, 0x343a58],
  [0x222844, 0x282e4a, 0x1e223e],
  [0x343a54, 0x2a3048, 0x161a34],
  [0x626c88, 0x4e5672, 0x343a58],
);
const TILE_T = tn(
  [0xe4e8ee, 0xeceff4, 0xdce0e8],
  [0xc0c2d0, 0xc8cad6, 0xb8bac8],
  [0x7a7a9a, 0x8282a2, 0x727292],
  [0xc8ccd6, 0xa0a2b4, 0x5e5e80],
  [0xffffff, 0xd8dae4, 0x9494b2],
);
/** 青：北墙、吧台前脸、点唱机两边的管 */
const TEAL: Ramp = [0x1c8aa4, 0x146a86, 0x103656];
const TEAL_T = tn(
  [0x1c8aa4, 0x2494ac, 0x18809a],
  [0x146a86, 0x1a7490, 0x10607c],
  [0x103656, 0x163e5e, 0x0c2e4e],
  [0x16768e, 0x10526c, 0x0a2442],
  [0x4cacc4, 0x2c88a2, 0x225270],
);
/** 樱桃红：卡座、凳面、墙上一道红线 */
const CHERRY: Ramp = [0xd8384e, 0xb02842, 0x5c1a48];
const CHERRY_T = tn(
  [0xd8384e, 0xe0445a, 0xce3046],
  [0xb02842, 0xb8304a, 0xa6223c],
  [0x5c1a48, 0x642050, 0x541440],
  [0xb42a40, 0x8a1e38, 0x3e1038],
  [0xf06272, 0xcc3c54, 0x803060],
);
/** 白瓷砖（墙裙） */
const TILE: Ramp = [0xe4e8ee, 0xc0c2d0, 0x7a7a9a];
/** 奶白：桌面（原值偏冷） */
const CREAM: Ramp = [0xeceef0, 0xd0ccd8, 0x8a84a6];
/** 吧台台面：浅青的富美家台面（五十年代的餐馆） */
const FORMICA: Ramp = [0x9ee0d8, 0x74b8b8, 0x3c6a84];
const CHROME: Ramp = [0xdfe4ec, 0xa6aec2, 0x5a5e80];
const STEEL: Ramp = [0xc4cad4, 0x9298ac, 0x4e5272];
const NAVY: Ramp = [0x2c3c6e, 0x22305c, 0x161e40];
const INK: Ramp = [0x34303e, 0x28242e, 0x1a1822];
const GRILL: Ramp = [0x4a4a56, 0x36363e, 0x22222a];
const PIE: Ramp = [0xf0b860, 0xd08c48, 0x7a5050];
const BUN: Ramp = [0xe8a058, 0xc07848, 0x6c4450];
const PATTY: Ramp = [0x7a4436, 0x5c3030, 0x34202a];
const LETTUCE: Ramp = [0x8cd060, 0x5ca456, 0x2e6050];
const FRIES: Ramp = [0xffd860, 0xe0a840, 0x7a6048];
const SHAKE: Ramp = [0xf6b8c8, 0xd890a8, 0x7a5a80];
const COFFEE: Ramp = [0x6a4030, 0x4e2e28, 0x2c1c22];
const NEON: Ramp = [0xff8aa0, 0xe25a7a, 0x8a3a60];
const NEON_T: Ramp = [0x7af0e8, 0x46c4c8, 0x2a6a8a];
const BALL: Ramp = [0xd8f040, 0xa8c838, 0x56784c];
const WOOD: Ramp = [0xc08a58, 0x9a6444, 0x543a44];

/** 墙上挂的（朝南、贴墙）：落中档、不受投影 */
const FACE: ToonOpts = SIGN_FACE;
/** 家具朝镜头的正面：光往上偏一点（顶亮、正面中暗） */
const FRONT: ToonOpts = { lightUp: 0.3, bands: [-0.15, 0.5], noShadowReceive: true };
/** 墙面（大面，朝南）：光往上偏，落中档；不受投影 */
const WALLF: ToonOpts = { lightUp: 0.45, bands: [-0.3, 0.4], noShadowReceive: true };

/** 这几件共用的材质（场景里按（键, 参数）缓存成一份） */
function mats(ctx: AssetCtx) {
  return {
    cream: ctx.mat('roofMetal', { ramp: CREAM, noShadowReceive: true }),
    creamFront: ctx.mat('roofMetal', { ramp: CREAM, ...FRONT }),
    teal: ctx.mat('surround', { ramp: TEAL, tones: TEAL_T, noShadowReceive: true }),
    tealFront: ctx.mat('surround', { ramp: TEAL, tones: TEAL_T, ...FRONT }),
    tealWall: ctx.mat('surround', {
      ramp: TEAL,
      tones: TEAL_T,
      ...WALLF,
      elem: { kind: 'stones', size: [60, 30], seam: 0, hi: 0 },
      toneW: [0.12, 0.12],
    }),
    tile: ctx.mat('roofMetal', {
      ramp: TILE,
      tones: TILE_T,
      ...WALLF,
      elem: { kind: 'stones', size: [6, 3], seam: 1, hi: 0 },
    }),
    cherry: ctx.mat('carRed', { ramp: CHERRY, tones: CHERRY_T, noShadowReceive: true }),
    cherryFront: ctx.mat('carRed', { ramp: CHERRY, tones: CHERRY_T, ...FRONT }),
    cherryFace: ctx.mat('carRed', { ramp: CHERRY, ...FACE }),
    chrome: ctx.mat('roofMetal', { ramp: CHROME, edge: 0.4, convex: 0.7, noShadowReceive: true }),
    chromeFront: ctx.mat('roofMetal', { ramp: CHROME, ...FRONT, convex: 0.7 }),
    steel: ctx.mat('roofMetal', { ramp: STEEL, ...FRONT }),
    navy: ctx.mat('signBoard', { ramp: NAVY, ...FACE }),
    ink: ctx.mat('ironwork', { ramp: INK, noShadowReceive: true }),
    inkFace: ctx.mat('ironwork', { ramp: INK, ...FACE }),
    grill: ctx.mat('ironwork', { ramp: GRILL, noShadowReceive: true }),
    white: ctx.mat('clothWhite', { noShadowReceive: true }),
    whiteFace: ctx.mat('clothWhite', FACE),
    pie: ctx.mat('flowerYellow', { ramp: PIE, ...FRONT }),
    bun: ctx.mat('flowerYellow', { ramp: BUN, ...FRONT }),
    patty: ctx.mat('woodWeathered', { ramp: PATTY, noShadowReceive: true }),
    lettuce: ctx.mat('lawn', { ramp: LETTUCE, noShadowReceive: true }),
    fries: ctx.mat('flowerYellow', { ramp: FRIES, ...FRONT }),
    shake: ctx.mat('flowerPurple', { ramp: SHAKE, ...FRONT }),
    coffee: ctx.mat('woodWeathered', { ramp: COFFEE, noShadowReceive: true }),
    ketchup: ctx.mat('clothRed', FRONT),
    mustard: ctx.mat('flowerYellow', FRONT),
    gold: ctx.mat('flowerYellow', { edge: 0.4, convex: 0.7, noShadowReceive: true }),
    glass: ctx.mat('jug', { lightUp: 0.4, bands: [-0.3, 0.3], noShadowReceive: true }),
    neon: ctx.mat('dinerCoral', { ramp: NEON, ...FACE, emissive: 0x401018 }),
    neonTeal: ctx.mat('surround', { ramp: NEON_T, ...FACE, emissive: 0x103030 }),
    ball: ctx.mat('lawn', { ramp: BALL, ...FRONT }),
    wood: ctx.mat('wood', { ramp: WOOD, ...FRONT }),
  };
}

type Part = [THREE.BufferGeometry, THREE.Material];
/** 一件资产的零件：按材质合成一个网格（只留 position + normal） */
class Parts {
  list: Part[] = [];
  add(m: THREE.Material, ...gs: THREE.BufferGeometry[]) {
    for (const g of gs) this.list.push([g, m]);
    return this;
  }
  group(ctx: AssetCtx, name: string, noCast = true): THREE.Group {
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
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, m);
      if (noCast) {
        mesh.castShadow = false;
        mesh.userData.noCast = true;
      }
      g.add(mesh);
    }
    ctx.mats.prepare(g);
    return g;
  }
}

/** 朝 +z 的竖直平面（中心 x、底 y、z） */
const quad = (w: number, h: number, x: number, y: number, z: number) =>
  new THREE.PlaneGeometry(w, h).translate(x, y + h / 2, z);
/** 平放的面（朝上） */
const flat = (w: number, d: number, x: number, y: number, z: number) =>
  new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2).translate(x, y, z);
/** 竖的圆柱（底在 y） */
const cyl = (r0: number, r1: number, h: number, x: number, y: number, z: number, n = 12) =>
  new THREE.CylinderGeometry(r1, r0, h, n).translate(x, y + h / 2, z);
/** 朝 +z 的圆片（竖直面上按 cos45 拉高，屏幕上是圆的）；sy = 再压扁多少 */
const disc = (r: number, x: number, y: number, z: number, n = 20, sy = 1) =>
  new THREE.CircleGeometry(r, n).scale(1, sy / Math.SQRT1_2, 1).translate(x, y, z);
/** 朝 +z 的上半圆片 */
const halfDisc = (r: number, x: number, y: number, z: number, sy = 1) =>
  new THREE.CircleGeometry(r, 12, 0, Math.PI).scale(1, sy / Math.SQRT1_2, 1).translate(x, y, z);
/** 上半球（碗、罩、面包顶） */
const dome = (r: number, x: number, y: number, z: number, n = 10) =>
  new THREE.SphereGeometry(r, n, 5, 0, Math.PI * 2, 0, Math.PI / 2).translate(x, y, z);

type M = ReturnType<typeof mats>;
// ── 桌上的小件（几件资产共用；y = 桌面高）──
const cup = (p: Parts, m: M, x: number, y: number, z: number) => {
  p.add(m.white, cyl(0.12, 0.12, 0.02, x, y, z, 12));
  p.add(m.white, cyl(0.07, 0.08, 0.12, x, y + 0.02, z, 10));
  p.add(m.coffee, cyl(0.065, 0.065, 0.005, x, y + 0.14, z, 10));
};
const burger = (p: Parts, m: M, x: number, y: number, z: number) => {
  p.add(m.white, cyl(0.2, 0.22, 0.03, x, y, z, 14));
  p.add(m.bun, cyl(0.12, 0.12, 0.05, x, y + 0.03, z, 10));
  p.add(m.lettuce, cyl(0.14, 0.14, 0.025, x, y + 0.08, z, 10));
  p.add(m.patty, cyl(0.13, 0.13, 0.05, x, y + 0.105, z, 10));
  p.add(m.bun, dome(0.13, x, y + 0.155, z));
};
const fries = (p: Parts, m: M, x: number, y: number, z: number) => {
  p.add(m.ketchup, box(0.2, 0.12, 0.14, x, y, z)); // 红纸盒
  for (const [dx, dz, h] of [
    [-0.06, -0.03, 0.12],
    [0, 0.02, 0.16],
    [0.06, -0.02, 0.1],
    [-0.02, 0.04, 0.14],
    [0.05, 0.04, 0.12],
  ])
    p.add(m.fries, box(0.045, h, 0.045, x + dx, y + 0.08, z + dz));
};
const shake = (p: Parts, m: M, x: number, y: number, z: number) => {
  p.add(m.white, cyl(0.06, 0.1, 0.24, x, y, z, 10));
  p.add(m.shake, dome(0.1, x, y + 0.24, z));
  p.add(m.ketchup, new THREE.SphereGeometry(0.035, 6, 4).translate(x, y + 0.35, z));
  p.add(m.cherry, box(0.03, 0.2, 0.03, x + 0.04, y + 0.26, z - 0.02).rotateZ(0));
};
const pieSlice = (p: Parts, m: M, x: number, y: number, z: number) => {
  p.add(m.white, cyl(0.17, 0.19, 0.03, x, y, z, 14));
  p.add(m.pie, new THREE.CylinderGeometry(0.13, 0.13, 0.07, 3).rotateY(0.4).translate(x, y + 0.065, z));
};
const sauces = (p: Parts, m: M, x: number, y: number, z: number) => {
  p.add(m.ketchup, cyl(0.05, 0.05, 0.2, x, y, z - 0.08, 8));
  p.add(m.ketchup, cyl(0.02, 0.02, 0.05, x, y + 0.2, z - 0.08, 6));
  p.add(m.mustard, cyl(0.05, 0.05, 0.2, x, y, z + 0.08, 8));
  p.add(m.mustard, cyl(0.02, 0.02, 0.05, x, y + 0.2, z + 0.08, 6));
};

// ══ in2-diner-floor：地面（10.4 × 10.5，原点 = 北边那条边的中点 → 摆在 x 5.2、z 0）══════════════
// 客人那边：米白 + 浅灰两色大格（0.6 米）；员工那边（吧台后，z < 吧台前脸 − 进深）：深一点的灰方砖
const inFloor: AssetFn = (ctx) => {
  const W = R.W;
  const D = R.D;
  const LIT: ToonOpts = { edge: 0.05, convex: 0, bands: [-2, -1.5] };
  const a = ctx.mat('roofMetal', { ramp: FLOOR_A, ...LIT });
  const b = ctx.mat('roofMetal', { ramp: FLOOR_B, ...LIT });
  const q = ctx.mat('roofMetal', {
    ramp: QUARRY,
    tones: QUARRY_T,
    ...LIT,
    elem: { kind: 'stones', size: [7, 5], seam: 1, hi: 0 },
  });
  const p = new Parts();
  const zs = R.CZ - R.CD; // 员工 / 客人的分界（吧台后沿）
  // 框架的地板顶在 y 0.02：铺在 0.032 以上
  p.add(q, flat(W, zs, 0, 0.032, zs / 2));
  p.add(a, flat(W, D - zs, 0, 0.032, (zs + D) / 2));
  const S = 0.6;
  const nx = Math.round(W / S);
  const nz = Math.ceil((D - zs) / S);
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < nz; j++) {
      if ((i + j) % 2 === 0) continue;
      const z0 = zs + j * S;
      const d = Math.min(S, D - z0);
      p.add(b, flat(Math.min(S, W - i * S), d, -W / 2 + i * S + Math.min(S, W - i * S) / 2, 0.044, z0 + d / 2));
    }
  const g = p.group(ctx, 'valley-asset:in2-diner-floor');
  ctx.mats.prepare(g, { cast: false, receive: true });
  return g;
};

// ══ in2-diner-back：北墙 + 开放的后厨（原点 = 北墙正中落地点 → 摆在 x 5.2、z 0）══════════════
// 墙：白瓷砖墙裙 + 一道红线 + 青墙，墙顶一道红；后厨台（红柜门 + 不锈钢台面，进深 0.75）一排：西头咖啡机（两壶）、
// 正中煎板（三块肉饼）+ 炸锅（两篮薯条）、东头一台冰箱；煎板上方墙上一个抽油烟罩，台面上方一层架子（一摞盘子、一排杯子）。
const inBack: AssetFn = (ctx) => {
  const m = mats(ctx);
  const p = new Parts();
  const W = R.W;
  const x = (lx: number) => lx - W / 2;
  const zw = 0.012;
  p.add(m.tile, quad(W, R.DADO, 0, 0, zw));
  p.add(m.cherryFace, quad(W, ROW * 2, 0, R.DADO, zw + 0.003));
  p.add(m.tealWall, quad(W, 4.5 - R.DADO - ROW * 2, 0, R.DADO + ROW * 2, zw));
  p.add(m.cherryFace, quad(W, ROW * 2, 0, 4.5 - ROW * 4, zw + 0.003));
  // 后厨台（x 0.3 … 冰箱前）
  const kx0 = 0.3;
  const kx1 = W - 1.5;
  const kz = R.KD / 2 + 0.02;
  p.add(m.cherryFront, box(kx1 - kx0, R.KH, R.KD, x((kx0 + kx1) / 2), 0, kz)); // 红柜门（不锈钢台面）
  p.add(m.chromeFront, box(kx1 - kx0, 0.05, R.KD + 0.02, x((kx0 + kx1) / 2), R.KH, kz));
  for (let i = 0; i < 6; i++) p.add(m.inkFace, quad(0.04, R.KH - 0.2, x(kx0 + 1.1 + i * 1.1), 0.1, R.KD + 0.025)); // 柜门缝
  // 咖啡机（西头）：机身 + 两个保温盘上的玻璃壶（深咖啡 + 橙色把）
  const cmx = x(1.2);
  p.add(m.tealFront, box(1.0, 0.75, 0.55, cmx, R.KH, 0.3)); // 青色咖啡机
  p.add(m.inkFace, quad(0.7, 0.2, cmx, R.KH + 0.45, 0.58));
  for (const dx of [-0.25, 0.25]) {
    p.add(m.coffee, cyl(0.11, 0.13, 0.22, cmx + dx, R.KH + 0.02, 0.62, 10));
    p.add(m.glass, cyl(0.12, 0.12, 0.06, cmx + dx, R.KH + 0.24, 0.62, 10));
    p.add(m.ketchup, box(0.05, 0.12, 0.12, cmx + dx + 0.15, R.KH + 0.1, 0.62));
  }
  // 煎板：一块深色铁板 + 三块肉饼；炸锅：两个篮子里的薯条
  const gx = x(4.2);
  p.add(m.grill, box(2.0, 0.06, R.KD - 0.1, gx, R.KH, kz));
  for (const dx of [-0.6, 0, 0.55]) p.add(m.patty, cyl(0.15, 0.15, 0.05, gx + dx, R.KH + 0.06, kz, 10));
  const fx = x(6.1);
  p.add(m.steel, box(1.0, 0.1, R.KD - 0.08, fx, R.KH, kz));
  for (const dx of [-0.24, 0.24]) {
    p.add(m.inkFace, box(0.38, 0.06, 0.4, fx + dx, R.KH + 0.1, kz));
    for (let k = 0; k < 4; k++)
      p.add(m.fries, box(0.045, 0.14, 0.045, fx + dx - 0.12 + k * 0.08, R.KH + 0.12, kz + (k % 2) * 0.08 - 0.04));
    p.add(m.chromeFront, box(0.05, 0.05, 0.3, fx + dx, R.KH + 0.2, kz + 0.3));
  }
  // 抽油烟罩（煎板正上方，墙上）：樱桃红的罩子 + 镀铬下沿 + 红烟道（五十年代的厨房是漆过的）
  p.add(m.cherryFront, box(2.6, 0.55, 0.9, gx + 0.4, 2.0, 0.45));
  p.add(m.chromeFront, box(2.62, 0.09, 0.92, gx + 0.4, 1.96, 0.45));
  p.add(m.cherryFront, box(0.5, 1.95, 0.4, gx + 0.4, 2.55, 0.2));
  // 一层架子：一摞盘子 + 一排杯子（咖啡机上方偏东）
  p.add(m.steel, box(1.6, 0.05, 0.32, x(2.4), 1.95, 0.17));
  for (let k = 0; k < 3; k++) p.add(m.white, cyl(0.17, 0.17, 0.05, x(1.9), 2.0 + k * 0.06, 0.17, 12));
  for (let k = 0; k < 4; k++) p.add(m.white, cyl(0.06, 0.07, 0.11, x(2.4 + k * 0.22), 2.0, 0.17, 8));
  // 冰箱（东头）：白、圆角感靠两道门缝 + 一根镀铬把手
  const rx = x(W - 0.85);
  p.add(m.creamFront, box(1.1, 2.1, 0.75, rx, 0, 0.4));
  p.add(m.inkFace, quad(1.0, 0.04, rx, 1.35, 0.78));
  p.add(m.chromeFront, box(0.06, 0.6, 0.06, rx - 0.38, 1.5, 0.8));
  p.add(m.chromeFront, box(0.06, 0.5, 0.06, rx - 0.38, 0.6, 0.8));
  return p.group(ctx, 'valley-asset:in2-diner-back');
};

// ══ in2-diner-menu：菜单板（2.6 × 1.4，原点 = 板底中心，板面朝 +z）══════════════════════
// 深蓝底 + 一圈镀铬框；四样：小图标 + 两条看不清的"字"线；价签（只有数字）由 interiors/v2/diner.ts 挂在每样右边
export const MENU_ITEMS: { id: string; name: string; price: number; dx: number; dy: number }[] = [
  { id: 'coffee', name: '咖啡（随便续）', price: 1, dx: -0.95, dy: 1.0 },
  { id: 'pie', name: '一块派', price: 3, dx: -0.95, dy: 0.66 },
  { id: 'burger', name: '汉堡', price: 4, dx: -0.95, dy: 0.32 },
  { id: 'shake', name: '奶昔', price: 2, dx: 0.35, dy: 1.0 },
];
const inMenu: AssetFn = (ctx) => {
  const m = mats(ctx);
  const p = new Parts();
  const BW = 2.6;
  const BH = 1.4;
  p.add(m.navy, box(BW, BH, 0.06, 0, 0, 0));
  p.add(m.chromeFront, box(BW + 0.09, ROW, 0.08, 0, BH - ROW / 2, 0.01));
  p.add(m.chromeFront, box(BW + 0.09, ROW, 0.08, 0, -ROW / 2, 0.01));
  for (const sx of [-1, 1]) p.add(m.chromeFront, box(T * 2, BH, 0.08, sx * (BW / 2 + T / 2), 0, 0.01));
  const z = 0.035;
  const icon = (id: string, cx: number, cy: number) => {
    if (id === 'coffee') {
      p.add(m.whiteFace, quad(0.18, 0.14, cx, cy, z));
      p.add(m.whiteFace, quad(0.05, 0.08, cx + 0.12, cy + 0.03, z));
    } else if (id === 'pie') {
      const s = new THREE.Shape();
      s.moveTo(-0.11, 0);
      s.lineTo(0.11, 0);
      s.lineTo(0.03, 0.18);
      s.closePath();
      p.add(m.pie, new THREE.ShapeGeometry(s).translate(cx, cy, z));
    } else if (id === 'burger') {
      p.add(m.bun, quad(0.22, 0.06, cx, cy, z));
      p.add(m.patty, quad(0.24, 0.05, cx, cy + 0.06, z));
      p.add(m.bun, halfDisc(0.11, cx, cy + 0.11, z, 0.6));
    } else {
      p.add(m.whiteFace, quad(0.12, 0.16, cx, cy, z));
      p.add(m.shake, halfDisc(0.08, cx, cy + 0.16, z + 0.001, 0.7));
    }
  };
  for (const it of MENU_ITEMS) {
    icon(it.id, it.dx, it.dy);
    // 两条看不清的"字"（菜名、一行小字）：一长一短
    p.add(m.whiteFace, quad(0.42, ROW * 0.7, it.dx + 0.42, it.dy + 0.12, z));
    p.add(m.inkFace, quad(0.3, ROW * 0.5, it.dx + 0.36, it.dy + 0.03, z + 0.001));
  }
  // 右下：一块"今日特价"的派（大一点的图，没有字）
  const s = new THREE.Shape();
  s.moveTo(-0.28, 0);
  s.lineTo(0.28, 0);
  s.lineTo(0.08, 0.38);
  s.closePath();
  p.add(m.pie, new THREE.ShapeGeometry(s).translate(0.75, 0.18, z));
  p.add(m.bun, quad(0.56, ROW, 0.75, 0.18, z + 0.002));
  return p.group(ctx, 'valley-asset:in2-diner-menu');
};

// ══ in2-diner-neon：墙上的霓虹咖啡杯（1.3 × 1.0，原点 = 底边中心，朝 +z）══════════════════
// 深色底板 + 霓虹粉的杯子轮廓（像素画：杯身、把手、碟子）+ 青色三缕热气；店里没有字，这就是"招牌"
const inNeon: AssetFn = (ctx) => {
  const m = mats(ctx);
  const p = new Parts();
  p.add(m.inkFace, box(1.3, 1.0, 0.05, 0, 0, 0));
  const z = 0.03;
  const L = 0.06; // 灯管粗（≈ 3 个店内纹素）
  // 杯身：左右两条 + 底一条；碟子一条长的；把手一个小框
  p.add(m.neon, quad(L, 0.34, -0.22, 0.28, z), quad(L, 0.34, 0.16, 0.28, z), quad(0.44, L, -0.03, 0.26, z));
  p.add(m.neon, quad(0.66, L, -0.03, 0.16, z));
  p.add(m.neon, quad(0.14, L, 0.26, 0.5, z), quad(0.14, L, 0.26, 0.34, z), quad(L, 0.2, 0.33, 0.34, z));
  // 热气：三缕（两段错开）
  for (const [k, dx] of [-0.13, -0.03, 0.07].entries()) {
    p.add(m.neonTeal, quad(L, 0.12, dx, 0.68 + (k % 2) * 0.03, z));
    p.add(m.neonTeal, quad(L, 0.1, dx + 0.05, 0.8 + (k % 2) * 0.03, z));
  }
  return p.group(ctx, 'valley-asset:in2-diner-neon');
};

// ══ in2-diner-counter：吧台（原点 = 前脸底边正中；x 宽 CX1−CX0，台面往北 CD）══════════════
// 青色前脸 + 两道镀铬横条 + 奶白台面（镀铬包边）；台上：收银机（东头）、派罩、出菜铃（靠厨房那边）、两套番茄酱 / 芥末、餐巾盒、客人的咖啡
/** 吧台上客人的咖啡杯 / 盘子（本地 x，吧台中心 = 0）：吧台客坐的那几张凳子前面（interiors/v2/diner.ts） */
export const COUNTER_SEATS = [-2.05, 0.05, 2.15];
const inCounter: AssetFn = (ctx) => {
  const m = mats(ctx);
  const p = new Parts();
  const W = R.CX1 - R.CX0;
  const H = R.CH;
  const D = R.CD;
  p.add(m.tealFront, box(W, H - 0.07, D - 0.08, 0, 0, -(D - 0.08) / 2));
  p.add(m.chromeFront, box(W + 0.02, ROW, 0.04, 0, 0.22, 0.0));
  p.add(m.chromeFront, box(W + 0.02, ROW, 0.04, 0, H - 0.3, 0.0));
  p.add(m.ink, box(W, 0.12, 0.04, 0, 0, -0.04)); // 踢脚（暗）
  p.add(ctx.mat('surround', { ramp: FORMICA, ...FRONT }), box(W + 0.12, 0.07, D + 0.06, 0, H - 0.07, -D / 2 + 0.03));
  p.add(m.chromeFront, box(W + 0.14, 0.05, 0.05, 0, H - 0.08, 0.06));
  const top = H;
  // 收银机（东头）：机身 + 斜的键盘 + 弹出的钱屉 + 顶上一块小数码屏（亮绿，没有字）
  const rx = W / 2 - 0.55;
  p.add(m.creamFront, box(0.62, 0.3, 0.46, rx, top, -D / 2));
  p.add(m.chromeFront, box(0.56, 0.16, 0.3, rx, top + 0.3, -D / 2 - 0.06));
  p.add(m.ink, quad(0.36, 0.1, rx, top + 0.36, -D / 2 + 0.1));
  p.add(m.lettuce, quad(0.2, 0.06, rx, top + 0.38, -D / 2 + 0.101));
  p.add(m.creamFront, box(0.5, 0.08, 0.2, rx, top + 0.04, -D / 2 + 0.3));
  // 派罩：镀铬底座 + 一整个派 + 玻璃罩
  const px = W / 2 - 1.5;
  p.add(m.chromeFront, cyl(0.12, 0.08, 0.16, px, top, -D / 2, 10));
  p.add(m.pie, cyl(0.28, 0.28, 0.12, px, top + 0.16, -D / 2, 16));
  p.add(m.glass, dome(0.34, px, top + 0.16, -D / 2, 14));
  // 出菜铃（靠厨房那边的台沿，金色小罩 + 一颗按钮）
  for (const bx of [-W / 2 + 2.4, W / 2 - 2.4]) {
    p.add(m.ink, cyl(0.09, 0.09, 0.03, bx, top, -D + 0.12, 10));
    p.add(m.gold, dome(0.08, bx, top + 0.03, -D + 0.12, 10));
    p.add(m.gold, cyl(0.015, 0.015, 0.05, bx, top + 0.1, -D + 0.12, 6));
  }
  // 两套调料 + 餐巾盒
  for (const cx of [-W / 2 + 1.4, -W / 2 + 4.3]) {
    sauces(p, m, cx, top, -D / 2);
    p.add(m.chromeFront, box(0.2, 0.18, 0.12, cx + 0.3, top, -D / 2));
  }
  // 吧台客面前：咖啡、一盘汉堡 + 薯条、一块派
  cup(p, m, COUNTER_SEATS[0], top, -0.2);
  burger(p, m, COUNTER_SEATS[1], top, -0.25);
  fries(p, m, COUNTER_SEATS[1] + 0.3, top, -0.3);
  pieSlice(p, m, COUNTER_SEATS[2], top, -0.25);
  cup(p, m, COUNTER_SEATS[2] + 0.28, top, -0.2);
  return p.group(ctx, 'valley-asset:in2-diner-counter');
};

// ══ in2-diner-stool：吧台凳（原点 = 落地点；红面圆凳 + 镀铬腿 + 圆底座）══════════════════
const inStool: AssetFn = (ctx) => {
  const m = mats(ctx);
  const p = new Parts();
  p.add(m.chrome, cyl(0.2, 0.2, 0.05, 0, 0, 0, 12));
  p.add(m.chrome, cyl(0.05, 0.05, 0.62, 0, 0.05, 0, 8));
  p.add(m.chrome, cyl(0.22, 0.22, 0.04, 0, 0.62, 0, 14));
  p.add(m.cherry, cyl(0.21, 0.23, 0.12, 0, 0.66, 0, 14));
  return p.group(ctx, 'valley-asset:in2-diner-stool');
};

// ══ in2-diner-booth：一个卡座（原点 = 桌子正中落地点；桌子沿 x 从墙伸出，两条长椅在桌子南北，高靠背）══════
// 本地：贴墙的一头在 −x（摆东墙时转 π）；桌面 x −0.72…0.68、z −0.4…0.4；北长椅 z −0.68、南长椅 +0.68。
// 变体 = 谁坐这儿（桌上 / 椅上的东西说明他是谁）：
//   0 场地工：两杯咖啡、一块派、一卷白的场地线（白圆筒 + 中间暗的芯）
//   1 妈妈：汉堡 + 薯条、奶昔、一筒网球（荧光黄的筒）；北长椅贴墙那头一个小号球拍包（紫色包身 + 露出的拍柄）
//   2 教练：咖啡、一块夹板（木板 + 白纸 + 镀铬夹子 + 纸上画的半块球场：一个框 + 一条中线）
//   3 记者：咖啡、相机（黑机身 + 大镜头 + 亮的闪光灯）、摊开的笔记本（两页白纸，几条暗线）+ 一支铅笔
//   4 路人：汉堡 + 薯条、咖啡
const inBooth: AssetFn = (ctx) => {
  const m = mats(ctx);
  const p = new Parts();
  const L = 1.45;
  const xc = -0.02;
  p.add(m.creamFront, box(L - 0.05, 0.07, 0.8, xc, 0.72, 0));
  p.add(m.chromeFront, box(L - 0.03, 0.05, 0.05, xc, 0.71, 0.41));
  p.add(m.chrome, cyl(0.06, 0.06, 0.72, xc + 0.2, 0, 0, 8));
  p.add(m.chrome, box(0.5, 0.04, 0.4, xc + 0.2, 0, 0));
  for (const s of [-1, 1]) {
    p.add(m.cherryFront, box(L, 0.46, 0.52, xc, 0, s * 0.68));
    p.add(m.cherryFront, box(L, 1.22, 0.16, xc, 0, s * 1.0));
    p.add(m.chrome, box(L + 0.02, 0.05, 0.2, xc, 1.22, s * 1.0));
  }
  const yt = 0.79;
  sauces(p, m, -0.6, yt, 0);
  const v = ctx.variant ?? 0;
  if (v === 0) {
    cup(p, m, 0.1, yt, -0.24);
    cup(p, m, 0.1, yt, 0.24);
    pieSlice(p, m, -0.25, yt, 0.05);
    // 一卷场地线（横放的白圆筒，镜头看到筒身 + 两头的暗芯）
    p.add(
      m.white,
      new THREE.CylinderGeometry(0.13, 0.13, 0.22, 12).rotateZ(Math.PI / 2).translate(0.42, yt + 0.13, 0.22),
    );
    p.add(m.ink, new THREE.CylinderGeometry(0.05, 0.05, 0.23, 8).rotateZ(Math.PI / 2).translate(0.42, yt + 0.13, 0.22));
  } else if (v === 1) {
    burger(p, m, 0.05, yt, -0.22);
    fries(p, m, 0.4, yt, -0.2);
    shake(p, m, 0.25, yt, 0.22);
    // 一筒网球：荧光黄的筒 + 白盖
    p.add(m.ball, cyl(0.075, 0.075, 0.3, -0.25, yt, 0.2, 10));
    p.add(m.white, cyl(0.08, 0.08, 0.04, -0.25, yt + 0.3, 0.2, 10));
    // 小号球拍包（北长椅贴墙那头）：紫色包身 + 一道黄拉链 + 露出的拍柄
    p.add(m.shake, box(0.36, 0.5, 0.2, -0.5, 0.46, -0.62));
    p.add(m.mustard, box(0.37, 0.05, 0.21, -0.5, 0.82, -0.62));
    p.add(m.ink, box(0.06, 0.22, 0.06, -0.5, 0.96, -0.62));
  } else if (v === 2) {
    cup(p, m, -0.15, yt, 0.22);
    // 夹板（桌子靠过道那头；东墙的卡座转了 π，本地 −z 才是南边，坐着的人挡不住）：木板 + 白纸 + 镀铬夹子 + 纸上半块球场
    const cx = 0.3;
    const cz = -0.14;
    p.add(m.wood, box(0.44, 0.02, 0.56, cx, yt, cz));
    p.add(m.white, box(0.36, 0.01, 0.46, cx, yt + 0.02, cz - 0.02));
    p.add(m.chrome, box(0.2, 0.04, 0.07, cx, yt + 0.02, cz + 0.24));
    p.add(m.teal, box(0.28, 0.005, 0.04, cx, yt + 0.03, cz + 0.12), box(0.28, 0.005, 0.04, cx, yt + 0.03, cz - 0.2));
    p.add(
      m.teal,
      box(0.04, 0.005, 0.32, cx - 0.12, yt + 0.03, cz - 0.04),
      box(0.04, 0.005, 0.32, cx + 0.12, yt + 0.03, cz - 0.04),
    );
    p.add(m.teal, box(0.28, 0.005, 0.03, cx, yt + 0.03, cz - 0.04));
  } else if (v === 3) {
    cup(p, m, 0.4, yt, 0.24);
    // 相机：黑机身 + 前面一个大镜头 + 顶上亮的闪光灯
    p.add(m.ink, box(0.3, 0.17, 0.14, 0.15, yt, -0.2));
    p.add(
      m.grill,
      new THREE.CylinderGeometry(0.07, 0.07, 0.12, 10).rotateX(Math.PI / 2).translate(0.15, yt + 0.085, -0.08),
    );
    p.add(m.white, box(0.1, 0.07, 0.08, 0.05, yt + 0.17, -0.2));
    // 摊开的笔记本（两页白纸，每页三条暗线）+ 铅笔
    p.add(m.white, box(0.22, 0.02, 0.28, -0.25, yt, 0.08), box(0.22, 0.02, 0.28, -0.02, yt, 0.08));
    for (const px of [-0.25, -0.02])
      for (let k = 0; k < 3; k++) p.add(m.ink, box(0.15, 0.005, 0.022, px, yt + 0.021, 0.0 + k * 0.07));
    p.add(m.mustard, box(0.28, 0.025, 0.025, -0.12, yt + 0.02, 0.27).rotateY(0));
  } else {
    burger(p, m, 0.05, yt, -0.22);
    fries(p, m, 0.4, yt, -0.2);
    cup(p, m, 0.2, yt, 0.24);
  }
  return p.group(ctx, 'valley-asset:in2-diner-booth');
};

// ══ in2-diner-rake：靠在卡座边的场地耙（原点 = 耙柄落地点；往 −x 斜靠）══════════════════
const inRake: AssetFn = (ctx) => {
  const m = mats(ctx);
  const p = new Parts();
  const lean = 0.32;
  const len = 1.75;
  const g = (geo: THREE.BufferGeometry) => geo.rotateZ(lean);
  p.add(m.wood, g(box(0.06, len, 0.06, 0, 0, 0)));
  // 耙头（朝上，靠在椅背上）：一根横梁 + 七根齿（铝的灰）
  p.add(m.chromeFront, g(box(0.6, 0.06, 0.08, 0, len, 0)));
  for (let k = 0; k < 7; k++) p.add(m.chromeFront, g(box(0.045, 0.14, 0.045, -0.27 + k * 0.09, len + 0.05, 0)));
  return p.group(ctx, 'valley-asset:in2-diner-rake');
};

// ══ in2-diner-jukebox：点唱机（0.9 × 1.6 × 0.6，原点 = 落地点，正面朝 +z）══════════════
const inJukebox: AssetFn = (ctx) => {
  const m = mats(ctx);
  const p = new Parts();
  const w = 0.9;
  const h = 1.15;
  const d = 0.6;
  p.add(m.creamFront, box(w, h, d, 0, 0, 0));
  const arch = new THREE.CylinderGeometry(w / 2, w / 2, d, 16, 1, false, -Math.PI / 2, Math.PI)
    .rotateX(Math.PI / 2)
    .translate(0, h, 0);
  p.add(m.cherryFront, arch);
  const ring = new THREE.RingGeometry(w / 2 - 0.1, w / 2 - 0.02, 16, 1, 0, Math.PI).scale(1, 1 / Math.SQRT1_2, 1);
  p.add(m.neon, ring.translate(0, h, d / 2 + 0.005));
  for (const sx of [-1, 1]) p.add(m.tealFront, box(0.09, h - 0.15, 0.04, sx * (w / 2 - 0.07), 0.1, d / 2));
  p.add(m.ink, quad(0.5, 0.36, 0, 0.62, d / 2 + 0.006));
  p.add(m.pie, disc(0.12, 0, 0.8, d / 2 + 0.008));
  p.add(m.chromeFront, quad(0.6, ROW, 0, 0.45, d / 2 + 0.006));
  for (let k = 0; k < 3; k++) p.add(m.ink, quad(0.56, ROW * 0.6, 0, 0.12 + k * ROW * 1.2, d / 2 + 0.006));
  return p.group(ctx, 'valley-asset:in2-diner-jukebox');
};

// ══ in2-diner-clock：钟（直径 0.8，原点 = 钟心，钟面朝 +z）══════════════════════════════
const inClock: AssetFn = (ctx) => {
  const m = mats(ctx);
  const p = new Parts();
  p.add(m.whiteFace, disc(0.36, 0, 0, 0.02, 24));
  p.add(m.neon, new THREE.RingGeometry(0.34, 0.42, 24).scale(1, 1 / Math.SQRT1_2, 1).translate(0, 0, 0.025));
  for (let k = 0; k < 12; k += 3) {
    const a = (k / 12) * Math.PI * 2;
    p.add(m.inkFace, quad(T, ROW, Math.sin(a) * 0.27, (Math.cos(a) * 0.27) / Math.SQRT1_2 - ROW / 2, 0.03));
  }
  p.add(m.inkFace, box(0.045, 0.22, 0.01, 0, 0, 0.032).rotateZ(1.05));
  p.add(m.inkFace, box(0.045, 0.3, 0.01, 0, 0, 0.034).rotateZ(-1.0));
  return p.group(ctx, 'valley-asset:in2-diner-clock');
};

// ══ in2-diner-plant：门边一盆龟背竹 ════════════════════════════════════════════════════
const inPlant: AssetFn = (ctx) => {
  const p = new Parts();
  const pot = ctx.mat('roofMetal', { ramp: CREAM, ...FRONT });
  const leaf = ctx.mat('lawn', { ramp: [0x5ab46a, 0x2e8462, 0x1c4a58], lightUp: 0.4, noShadowReceive: true });
  p.add(pot, cyl(0.24, 0.3, 0.5, 0, 0, 0, 12));
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + 0.3;
    p.add(
      leaf,
      new THREE.SphereGeometry(0.26, 8, 5)
        .scale(1, 0.35, 0.7)
        .rotateZ(0.5)
        .translate(0.3, 0, 0)
        .rotateY(a)
        .translate(0, 0.75 + (k % 3) * 0.18, 0),
    );
  }
  return p.group(ctx, 'valley-asset:in2-diner-plant');
};

export const ASSETS: Record<string, AssetFn> = {
  'in2-diner-floor': inFloor,
  'in2-diner-back': inBack,
  'in2-diner-menu': inMenu,
  'in2-diner-neon': inNeon,
  'in2-diner-counter': inCounter,
  'in2-diner-stool': inStool,
  'in2-diner-booth': inBooth,
  'in2-diner-rake': inRake,
  'in2-diner-jukebox': inJukebox,
  'in2-diner-clock': inClock,
  'in2-diner-plant': inPlant,
};

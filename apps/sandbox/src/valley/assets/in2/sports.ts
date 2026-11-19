// 第二版店内的资产（id 以 in2-sports- 开头），归 sports 店内代理。本地原点 = 落地点中心，y 0 = 地面，+z 朝镜头（朝南），单位米。
// 画廊：/valleyassets.html?asset=in2-sports-…&zoom=0.02（和店里一样近）。场景：interiors/v2/sports.ts。
//
// 参考 Sneaky Sasquatch 店内的原则（scratchpad BRIEF-IN2）：镜头近、东西少而大 —— 每件"能买的"东西做成真实的 1.5～2 倍大，
// 剪影 2～4 个大块，一面墙一段只放 4～6 件主角，彼此留空；价签、气泡由 interiors/v2/kit.ts 画（这里只留出挂的位置）。
// 2026-11-19 第三轮（用户："let the layout and visual do the explanation, not the subtext"）：店里零字。分区不挂字条，
// 靠东西本身 + 几块图标牌（in2-sports-sign-*：深蓝圆牌上 9 × 9 的像素图标 —— 球拍、鞋、T 恤、线轴、循环箭头）；
// 球拍墙前的 TRY ZONE 字框 → 一块迷你球场地垫（in2-sports-court-mat，只有白线）。
// 店里的光：顶灯（仰角 65°），不投影（main.ts 的 INDOOR_LOOK）。所以：
// - 卖的东西（球拍、鞋、衣服、线卷、球包）朝镜头的面用 PROD：光往上偏 + 低档位线 → 落亮档，从暗背板上跳出来；
// - 货架、柜台、背板的正面用 FACE：落中档（暗一档的"框"）；朝上的面（台面、隔板、柜顶）自己是亮档 = 一行亮边。
// 店内纹素 ≈ 0.02 米（默认 0.045 × zoom 0.45）：线 ≥ 0.03 米（1.5 纹素）才稳；1 纹素的细节少用（强边缘预算）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { box } from '../../../clubsite/render/geo';
import type { Tones, ToonOpts } from '../../../clubsite/render/toon';
import type { AssetCtx, AssetFn } from '../../ctx';

// ══ 材质：每个手挑 [亮, 中, 暗] 三个本色，高 / 低一级 = 本色 ±10（加在 RGB 上，色相不漂），缝 −26、亮边 +24 ══
type C3 = [number, number, number];
const shift = (c: number, d: number) => {
  const ch = (s: number) => Math.max(0, Math.min(255, ((c >> s) & 255) + d));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};
const tones3 = (lit: number, mid: number, dark: number, step = 10): Tones => ({
  bands: [
    [lit, shift(lit, step), shift(lit, -step)],
    [mid, shift(mid, step), shift(mid, -step)],
    [dark, shift(dark, step), shift(dark, -step)],
  ],
  seam: [shift(lit, -26), shift(mid, -26), shift(dark, -22)] as C3,
  hi: [shift(lit, 24), shift(mid, 24), shift(dark, 22)] as C3,
});
const sw = (lit: number, mid: number, dark: number, edge = 0.4, convex = 0.3, step = 10): ToonOpts => ({
  ramp: [lit, mid, dark],
  edge,
  convex,
  tones: tones3(lit, mid, dark, step),
});

/**
 * 体育店 v2 的调色（"冷、亮、干净"，和外景的午后沙漠拉开；和第一版同一个方向：天蓝运动地胶 + 俱乐部蓝 + 深海军蓝背板 + 荧光黄绿 / 红）。
 * 都借 court 组（ctx.mat('surround', …)）过午后金光：亮档只往暖染 10%，冷色留得住。荧光借 plants 组（'lawn'）。
 * 后面的 L 是 [亮, 中, 暗] 本色的亮度（0.2126R + 0.7152G + 0.0722B）。
 */
export const IN2 = {
  /** 地胶：一整片天蓝（第三轮起不铺两色大格了，地要安静）。L 152 / 120 / 104 */
  floorA: sw(0x4cacf4, 0x4a86d2, 0x4a66ba, 0.05, 0),
  /** 地胶的接缝（每 3 米一道细线，比地暗 ~10）。L 141 / 112 / 97 */
  floorB: sw(0x3e9ce8, 0x407ac6, 0x445cae, 0.05, 0),
  /** 北墙上半：浅冰蓝（正面落中档 = 墙色）。L 214 / 196 / 140 */
  wall: sw(0xc8e2fa, 0xb4d6f8, 0x7894cc, 0.3, 0.2, 8),
  /** 墙裙、背板、柜身正面：深海军蓝。L 78 / 64 / 42 */
  navy: sw(0x2f50a6, 0x26428e, 0x1c2c66, 0.5, 0.3, 9),
  /** 冷白：台面、隔板、货架框。L 228 / 205 / 128 */
  white: sw(0xe0eaf8, 0xc6d4ee, 0x7882ac, 0.5, 0.35, 8),
  /** 钴蓝：收银台、穿线台的台身强调。L 117 / 96 / 58 */
  cobalt: sw(0x3e74e2, 0x305ec6, 0x223a86, 0.4, 0.3),
  /** 荧光黄绿（球、球罐、线卷、强调条）。L 212 / 170 / 108 */
  neon: sw(0xd4ee3c, 0xa8cc30, 0x5a8a50, 0.5, 0.35),
  /** 红（球拍、球包、购物车、收银机）。L 98 / 76 / 52 */
  red: sw(0xec4a3e, 0xcc3434, 0x84284a, 0.5, 0.35),
  /** 橙（球拍、鞋）。L 150 / 120 / 76 */
  orange: sw(0xfa8c2e, 0xe0701e, 0x9a4630, 0.5, 0.35),
  /** 青绿（球拍、衣服、鞋）。L 165 / 135 / 82 */
  teal: sw(0x26ccb6, 0x18a89a, 0x1a6a72, 0.5, 0.35),
  /** 紫（球拍）。L 92 / 72 / 46 */
  purple: sw(0x8a52d6, 0x6e3ebc, 0x452a80, 0.5, 0.35),
  /** 炭黑（握把、轮子、收银机屏框）。L 58 / 44 / 30 */
  ink: sw(0x3a3c4e, 0x2c2e40, 0x1e1f30, 0.5, 0.3, 8),
  /** 拍面的线：浅奶白（偏冷）。L 232 / 210 / 150 */
  strings: sw(0xeef0ea, 0xd6dae0, 0x98a0bc, 0.2, 0, 6),
  /** 旧拍子：褪色的灰蓝 / 灰绿（寄卖架）。L 140 / 116 / 78 */
  worn: sw(0x8c9cb4, 0x7686a2, 0x4c5a7c, 0.4, 0.3),
  /** 迷你球场地垫（球拍墙前，试拍的地方）：哑光球场绿，低对比。L 120 / 98 / 72 */
  court: sw(0x4a9a70, 0x3c845e, 0x2c5e54, 0.05, 0),
  /** 纸箱（72 个装的比赛球）：冷灰卡纸（不用桃 / 沙色）。L 186 / 160 / 110 */
  carton: sw(0xc2bcb0, 0xa8a49c, 0x6c6e88, 0.4, 0.3),
} satisfies Record<string, ToonOpts>;
export type In2Key = keyof typeof IN2;

/** 卖的东西朝镜头的面：落亮档（暗背板上跳出来） */
export const PROD: ToonOpts = { lightUp: 0.6, bands: [-0.5, 0.0], noShadowReceive: true };
/** 货架、背板、柜身的正面：落中档 */
export const FACE: ToonOpts = { lightUp: 0.55, bands: [-0.4, 0.3], noShadowReceive: true };
/** 一般的小件：不接收投影 */
export const PROP: ToonOpts = { noShadowReceive: true };

/** 体育店 v2 的材质：调色板项 + 用法（PROD / FACE / PROP） */
export function in2Mat(ctx: AssetCtx, key: In2Key, use: ToonOpts = PROP, extra?: ToonOpts): THREE.Material {
  const base = key === 'neon' ? 'lawn' : 'surround';
  return ctx.mat(base, { ...IN2[key], ...use, ...extra });
}

// ══ 几何小工具 ══
const T = 0.02; // 店内屏幕纹素（米）
/** 立面上的平板（朝 +z）：中心 x、底 y、离原点 z */
const plate = (w: number, h: number, x: number, y: number, z: number) =>
  new THREE.PlaneGeometry(w, h).translate(x, y + h / 2, z);
/** 椭圆（xy，朝 +z） */
const ellipse = (rx: number, ry: number, seg = 24) =>
  new THREE.ShapeGeometry(new THREE.Shape().absellipse(0, 0, rx, ry, 0, Math.PI * 2, false, 0), seg);
/** 椭圆环（xy，朝 +z）：外半径 rx ry、环宽 t */
function ellipseRing(rx: number, ry: number, t: number, seg = 24): THREE.BufferGeometry {
  const s = new THREE.Shape().absellipse(0, 0, rx, ry, 0, Math.PI * 2, false, 0);
  s.holes.push(new THREE.Path().absellipse(0, 0, rx - t, ry - t, 0, Math.PI * 2, true, 0));
  return new THREE.ShapeGeometry(s, seg);
}
/** 多边形（xy，朝 +z） */
function poly(pts: [number, number][]): THREE.BufferGeometry {
  const s = new THREE.Shape();
  for (const [i, [x, y]] of pts.entries()) i ? s.lineTo(x, y) : s.moveTo(x, y);
  return new THREE.ShapeGeometry(s);
}
/** 有厚度的多边形（xy 轮廓、沿 z 挤出 d，背面在 z 0） */
function slab(pts: [number, number][], d: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  for (const [i, [x, y]] of pts.entries()) i ? s.lineTo(x, y) : s.moveTo(x, y);
  return new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false });
}
/** 圆柱（底在 y） */
const cyl = (r: number, h: number, x: number, y: number, z: number, seg = 14) =>
  new THREE.CylinderGeometry(r, r, h, seg).translate(x, y + h / 2, z);
/** 圆盘（朝 +z 的圆柱：半径 r、厚 d，中心 x y、前脸在 z） */
const disc = (r: number, d: number, x: number, y: number, z: number, seg = 20) =>
  new THREE.CylinderGeometry(r, r, d, seg).rotateX(Math.PI / 2).translate(x, y, z - d / 2);

/** 按（材质, 投不投影）合并成几个网格 */
class Parts {
  list: { g: THREE.BufferGeometry; m: THREE.Material; cast: boolean }[] = [];
  constructor(private ctx: AssetCtx) {}
  add(m: THREE.Material, g: THREE.BufferGeometry, cast = false) {
    this.list.push({ g, m, cast });
  }
  build(name: string): THREE.Group {
    const out = new THREE.Group();
    out.name = name;
    const by = new Map<THREE.Material, { cast: boolean; gs: THREE.BufferGeometry[] }[]>();
    for (const { g, m, cast } of this.list) {
      const ng = g.index ? g.toNonIndexed() : g;
      for (const a of Object.keys(ng.attributes)) if (a !== 'position' && a !== 'normal') ng.deleteAttribute(a);
      if (!ng.attributes.normal) ng.computeVertexNormals();
      const arr = by.get(m) ?? [];
      let e = arr.find((x) => x.cast === cast);
      if (!e) arr.push((e = { cast, gs: [] }));
      e.gs.push(ng);
      by.set(m, arr);
    }
    for (const [m, arr] of by)
      for (const { cast, gs } of arr) {
        const merged = mergeGeometries(gs);
        if (!merged) continue;
        const mesh = new THREE.Mesh(merged, m);
        mesh.name = `${name}:${(m.userData.palKey as string | undefined) ?? m.name}`;
        if (!cast) mesh.userData.noCast = true;
        out.add(mesh);
      }
    this.ctx.mats.prepare(out, { cast: false, receive: false });
    return out;
  }
}

/** 一个资产里同一材质只建一份 */
function matsOf(ctx: AssetCtx) {
  const cache = new Map<string, THREE.Material>();
  return (key: In2Key, use: ToonOpts = PROP, extra?: ToonOpts) => {
    const k = `${key}|${JSON.stringify(use)}|${JSON.stringify(extra ?? null)}`;
    let m = cache.get(k);
    if (!m) cache.set(k, (m = in2Mat(ctx, key, use, extra)));
    return m;
  };
}

// ══ 球拍（xy 平面朝 +z；拍头中心在原点、拍柄朝 −y）：放大 ~1.6 倍，整支 1.25 米高、0.6 米宽 ══
const RACKET = { rx: 0.29, ry: 0.36, beam: 0.06, throat: 0.22, shaft: 0.12, grip: 0.36 };
/** 一支球拍：frame / bed / lines / grip 四组几何（本地，拍头中心原点），z = 前脸 */
function racketGeo(z: number, wear = false) {
  const { rx, ry, beam, throat, shaft, grip } = RACKET;
  const frame: THREE.BufferGeometry[] = [ellipseRing(rx, ry, beam).translate(0, 0, z + 0.004)];
  const bed: THREE.BufferGeometry[] = [ellipse(rx - beam + 0.005, ry - beam + 0.005).translate(0, 0, z)];
  const lines: THREE.BufferGeometry[] = [];
  // 线：竖 4、横 5（1.5 纹素宽，比拍面暗一点）——只为读出"是拍面"，不画满
  const lw = 1.5 * T;
  for (const x of [-0.15, -0.05, 0.05, 0.15]) {
    const h = 2 * (ry - beam) * Math.sqrt(Math.max(0, 1 - (x / (rx - beam)) ** 2)) - 0.03;
    lines.push(plate(lw, h, x, -h / 2, z + 0.002));
  }
  for (const y of [-0.2, -0.1, 0, 0.1, 0.2]) {
    const w = 2 * (rx - beam) * Math.sqrt(Math.max(0, 1 - (y / (ry - beam)) ** 2)) - 0.03;
    lines.push(plate(w, lw, 0, y - lw / 2, z + 0.002));
  }
  // 拍喉：两条斜梁围出的开口三角（实心三角太重）
  const y0 = -ry + 0.04;
  const y1 = y0 - throat;
  frame.push(
    poly([
      [-0.16, y0],
      [-0.1, y0],
      [-0.025, y1],
      [-0.045, y1],
    ]).translate(0, 0, z + 0.004),
    poly([
      [0.1, y0],
      [0.16, y0],
      [0.045, y1],
      [0.025, y1],
    ]).translate(0, 0, z + 0.004),
  );
  frame.push(plate(0.07, shaft, 0, y1 - shaft, z + 0.004));
  const gy = y1 - shaft - grip;
  const gripG = [plate(0.085, grip, 0, gy, z + 0.006), plate(0.1, 0.04, 0, gy - 0.03, z + 0.006)];
  if (wear) lines.length = 0;
  return { frame, bed, lines, grip: gripG, bottom: gy - 0.03 };
}

/** 球拍颜色组（拍框 / 握把）：轻 → 重 */
const RACKET_SET: { frame: In2Key; grip: In2Key }[] = [
  { frame: 'neon', grip: 'ink' },
  { frame: 'teal', grip: 'white' },
  { frame: 'orange', grip: 'ink' },
  { frame: 'red', grip: 'white' },
  { frame: 'white', grip: 'red' },
  { frame: 'purple', grip: 'neon' },
];
/** 球拍墙上 6 支的 x（本地）、拍头中心高、价签高（底边） */
export const RACKET_WALL = {
  xs: [-3.0, -1.8, -0.6, 0.6, 1.8, 3.0],
  k: 1.2,
  headY: 2.22,
  tagY: 0.3,
  tagZ: 0.53,
  w: 7.6,
};

// ── in2-sports-racket-wall：北墙正中的球拍墙（7.6 × 3.0 × 0.55）。S2 挑球拍 ──
// 冷白矮柜（价签挂在柜子正面）+ 深海军蓝背板（白框）+ 6 支大拍子一字排开，每支一个挂钩。大字条 RACQUETS 由店里挂在背板上方。
const racketWall: AssetFn = (ctx) => {
  const P = new Parts(ctx);
  const m = matsOf(ctx);
  const W = RACKET_WALL.w;
  // 矮柜：柜身（侧面、柜顶亮）、正面中档、踢脚
  P.add(m('white'), box(W, 0.8, 0.5, 0, 0, 0.25));
  P.add(m('white', FACE), plate(W - 0.04, 0.68, 0, 0.1, 0.502));
  P.add(m('navy', FACE), plate(W - 0.04, 0.1, 0, 0, 0.503));
  // 背板：深海军蓝，白框
  const by = 0.86;
  const bh = 2.1;
  P.add(m('navy', FACE), plate(W - 0.2, bh, 0, by, 0.04));
  P.add(m('white', FACE), box(W - 0.1, 0.06, 0.06, 0, by + bh, 0.03));
  for (const s of [-1, 1]) P.add(m('white', FACE), box(0.06, bh + 0.06, 0.06, s * (W / 2 - 0.08), by, 0.03));
  // 球拍
  RACKET_WALL.xs.forEach((x, i) => {
    const s = RACKET_SET[i];
    const r = racketGeo(0.1);
    const k = RACKET_WALL.k;
    const t = (g: THREE.BufferGeometry) => g.scale(k, k, 1).translate(x, RACKET_WALL.headY, 0);
    for (const g of r.frame) P.add(m(s.frame, PROD), t(g));
    for (const g of r.bed) P.add(m('strings', PROD), t(g));
    for (const g of r.lines) P.add(m('strings', FACE), t(g));
    for (const g of r.grip) P.add(m(s.grip, PROD), t(g));
    // 挂钩：拍头上面一个小白钩
    P.add(m('white', PROD), box(0.07, 0.09, 0.08, x, RACKET_WALL.headY + RACKET.ry * k - 0.02, 0.06));
  });
  return P.build('in2-sports-racket-wall');
};

// ── in2-sports-shoe-shelf：鞋墙（3.8 × 2.3 × 0.5，贴北墙西段）。两层隔板 × 两双鞋 = 4 双，侧面朝镜头 ──
/** 鞋：侧面剪影（鞋头朝 −x），长 0.5、高 0.2；鞋底白、鞋面颜色、一道亮色侧标 */
function shoeGeo(x: number, y: number, z: number, up: In2Key, mark: In2Key, m: ReturnType<typeof matsOf>, P: Parts) {
  const L = 0.5;
  const k = SHOE_K;
  const at = (g: THREE.BufferGeometry, dz: number) =>
    g.translate(0, 0, dz).scale(k, k, 1.25).rotateY(SHOE_YAW).translate(x, y, z);
  const sole = slab(
    [
      [-L / 2, 0],
      [L / 2, 0],
      [L / 2, 0.05],
      [-L / 2 - 0.02, 0.05],
    ],
    0.16,
  );
  P.add(m('white', PROD), at(sole, -0.16));
  const upper = slab(
    [
      [-L / 2 - 0.02, 0.05],
      [L / 2, 0.05],
      [L / 2, 0.19],
      [L / 2 - 0.12, 0.2],
      [-0.02, 0.17],
      [-L / 2 + 0.04, 0.1],
    ],
    0.14,
  );
  P.add(m(up, PROD), at(upper, -0.15));
  // 侧标（一道斜条）、鞋口暗一块
  P.add(
    m(mark, PROD),
    poly([
      [-0.1, 0.07],
      [0.02, 0.07],
      [0.12, 0.16],
      [0.04, 0.16],
    ])
      .translate(0, 0, 0.004)
      .scale(k, k, 1)
      .rotateY(SHOE_YAW)
      .translate(x, y, z),
  );
  P.add(
    m('ink', PROD),
    plate(0.1, 0.03, L / 2 - 0.08, 0.17, 0.004)
      .scale(k, k, 1)
      .rotateY(SHOE_YAW)
      .translate(x, y, z),
  );
}
const SHOES: { up: In2Key; mark: In2Key }[] = [
  { up: 'orange', mark: 'white' },
  { up: 'neon', mark: 'navy' },
  { up: 'red', mark: 'white' },
  { up: 'teal', mark: 'neon' },
];
/** 鞋放大多少（侧面 0.73 × 0.29 米） */
const SHOE_K = 2.0;
/** 鞋头往镜头这边转一点（侧面 + 鞋头都看得到） */
const SHOE_YAW = 0.4;
/** 鞋墙：4 双鞋的中心 x、隔板高（价签挂在隔板正面下沿） */
export const SHOE_SHELF = { xs: [-0.9, 0.9], shelves: [0.72, 1.56], w: 3.8, tagDrop: 0.31, tagZ: 0.39 };
const shoeShelf: AssetFn = (ctx) => {
  const P = new Parts(ctx);
  const m = matsOf(ctx);
  const W = SHOE_SHELF.w;
  // 背板（海军蓝，白框）；每只鞋一块小白托板（不用通长的隔板：45° 看下来通长隔板会挡住下一层）
  P.add(m('navy', FACE), plate(W - 0.1, 2.0, 0, 0.1, 0.04));
  for (const s of [-1, 1]) P.add(m('white', FACE), box(0.07, 2.1, 0.08, s * (W / 2 - 0.05), 0.06, 0.04));
  P.add(m('white', FACE), box(W, 0.07, 0.08, 0, 2.1, 0.04));
  P.add(m('white', FACE), box(W, 0.1, 0.08, 0, 0.0, 0.04));
  let k = 0;
  for (const y of SHOE_SHELF.shelves)
    for (const x of SHOE_SHELF.xs) {
      const sh = SHOES[k++];
      P.add(m('white'), box(1.1, 0.05, 0.38, x, y - 0.05, 0.19));
      P.add(m('white', FACE), plate(1.1, 0.05, x, y - 0.05, 0.382));
      // 一只大鞋（陈列样品），鞋头朝西南
      shoeGeo(x + 0.02, y, 0.3, sh.up, sh.mark, m, P);
    }
  return P.build('in2-sports-shoe-shelf');
};

// ── in2-sports-apparel：衣架（3.4 × 2.0 × 0.6）。一根横杆上 3 件大 Polo（正面朝镜头），底下一条踢脚横梁挂价签 ──
const SHIRTS: { body: In2Key; trim: In2Key }[] = [
  { body: 'red', trim: 'white' },
  { body: 'neon', trim: 'navy' },
  { body: 'teal', trim: 'white' },
];
export const APPAREL = { xs: [-1.05, 0, 1.05], w: 3.4, tagY: 0.1, tagZ: 0.06, barY: 1.86 };
const apparel: AssetFn = (ctx) => {
  const P = new Parts(ctx);
  const m = matsOf(ctx);
  const W = APPAREL.w;
  // 架子：两根立柱、横杆、底下一条横梁（价签挂在它正面）、两只脚
  for (const s of [-1, 1]) {
    P.add(m('white'), box(0.07, APPAREL.barY + 0.05, 0.07, s * (W / 2 - 0.05), 0, 0));
    P.add(m('white'), box(0.1, 0.06, 0.6, s * (W / 2 - 0.05), 0, 0));
  }
  P.add(m('white', FACE), box(W, 0.06, 0.06, 0, APPAREL.barY, 0));
  P.add(m('white', FACE), box(W - 0.1, 0.12, 0.05, 0, 0.16, 0));
  // 衣服：Polo 正面（肩宽 0.74、身长 0.8、短袖斜出去），衣架钩、领子、门襟
  APPAREL.xs.forEach((x, i) => {
    const s = SHIRTS[i];
    const top = APPAREL.barY - 0.08;
    const b = top - 0.82;
    const z = 0.05;
    P.add(
      m(s.body, PROD),
      slab(
        [
          [-0.26, b],
          [0.26, b],
          [0.26, top - 0.3],
          [0.42, top - 0.36],
          [0.48, top - 0.18],
          [0.24, top],
          [-0.24, top],
          [-0.48, top - 0.18],
          [-0.42, top - 0.36],
          [-0.26, top - 0.3],
        ],
        0.06,
      ).translate(x, 0, z - 0.03),
    );
    // 领子（三角两片）+ 门襟一条
    P.add(
      m(s.trim, PROD),
      poly([
        [-0.13, top + 0.005],
        [0, top - 0.12],
        [0.13, top + 0.005],
        [0.06, top + 0.005],
        [0, top - 0.06],
        [-0.06, top + 0.005],
      ]).translate(x, 0, z + 0.035),
    );
    P.add(m(s.trim, PROD), plate(0.04, 0.16, x, top - 0.26, z + 0.035));
    // 衣架钩
    P.add(m('ink', PROD), box(0.03, 0.1, 0.03, x, top - 0.01, 0));
  });
  return P.build('in2-sports-apparel');
};

// ── in2-sports-pyramid：球罐金字塔（1.8 × 1.6 × 1.8）。白色方台上 4 层罐子（5×5 / 4×4 / 3×3 / 2×2 / 1 顶），远看是一堆荧光黄绿 ──
// 罐子 = 荧光的球身（透明罐里看得到球）+ 红色盖子 + 一道海军蓝标签。小于 0.25 米的重复小件只当"一堆"读。
export const PYRAMID = { plinth: 1.8, plinthH: 0.42, tagY: 0.02, tagZ: 0.91 };
const pyramid: AssetFn = (ctx) => {
  const P = new Parts(ctx);
  const m = matsOf(ctx);
  const S = PYRAMID.plinth;
  const H0 = PYRAMID.plinthH;
  P.add(m('white'), box(S, H0, S, 0, 0, 0));
  P.add(m('white', FACE), plate(S - 0.04, H0 - 0.04, 0, 0.02, S / 2 + 0.002));
  P.add(m('navy', FACE), plate(S - 0.04, 0.06, 0, 0, S / 2 + 0.004));
  const r = 0.13;
  const h = 0.32;
  const pitch = 0.3;
  const body: THREE.BufferGeometry[] = [];
  const cap: THREE.BufferGeometry[] = [];
  const band: THREE.BufferGeometry[] = [];
  for (let lv = 0; lv < 5; lv++) {
    const n = 5 - lv;
    const y = H0 + lv * (h + 0.02);
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        const x = (i - (n - 1) / 2) * pitch;
        const z = (j - (n - 1) / 2) * pitch;
        body.push(cyl(r, h - 0.04, x, y, z, 12));
        cap.push(cyl(r + 0.008, 0.04, x, y + h - 0.04, z, 12));
        band.push(cyl(r + 0.004, 0.07, x, y + 0.1, z, 12));
      }
  }
  for (const g of body) P.add(m('neon'), g);
  for (const g of cap) P.add(m('neon'), g);
  for (const g of band) P.add(m('red'), g);
  return P.build('in2-sports-pyramid');
};

// ── in2-sports-ball-case：72 个装的比赛球纸箱（1.0 × 0.75 × 0.7），开着口、露出一箱荧光球。S1：很沉 ──
export const BALL_CASE = { tagY: 0.06, tagZ: 0.36 };
const ballCase: AssetFn = (ctx) => {
  const P = new Parts(ctx);
  const m = matsOf(ctx);
  const w = 1.0;
  const h = 0.6;
  const d = 0.7;
  P.add(m('carton'), box(w, h, d, 0, 0, 0));
  P.add(m('carton', FACE), plate(w - 0.02, h - 0.02, 0, 0.01, d / 2 + 0.002));
  // 正面一条海军蓝印的带子（品牌条）
  P.add(m('navy', FACE), plate(w - 0.02, 0.12, 0, 0.4, d / 2 + 0.004));
  // 开口：后面一片盖竖起来，两边两片往外翻；箱里一层球（荧光：底一块 + 3 × 4 个半露的大球，每个直径 0.2 米 = 10 纹素）
  P.add(m('carton'), new THREE.BoxGeometry(w - 0.02, 0.28, 0.02).rotateX(-0.25).translate(0, h + 0.13, -d / 2 - 0.02));
  for (const sx of [-1, 1])
    P.add(
      m('carton'),
      new THREE.BoxGeometry(0.22, 0.02, d - 0.04).rotateZ(sx * 0.5).translate(sx * (w / 2 + 0.09), h + 0.05, 0),
    );
  P.add(m('neon'), box(w - 0.06, 0.03, d - 0.06, 0, h - 0.04, 0));
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 3; j++)
      P.add(m('neon'), new THREE.SphereGeometry(0.1, 10, 6).translate(-0.34 + i * 0.226, h - 0.04, -0.21 + j * 0.21));
  return P.build('in2-sports-ball-case');
};

// ── in2-sports-bag-stand：球包 A 字架（2.2 × 1.9 × 1.0）。正面两只大球包（横着挂），每只下面一条横梁挂价签 ──
export const BAG_STAND = { xs: [-0.68, 0.68], w: 2.8, tagY: 0.5, tagZ: 0.5 };
const bagStand: AssetFn = (ctx) => {
  const P = new Parts(ctx);
  const m = matsOf(ctx);
  const W = BAG_STAND.w;
  // A 字架：两面斜板（白框 + 海军蓝板），从正面看是一块往后倒的板
  const lean = 0.32;
  const front = new THREE.BoxGeometry(W - 0.1, 1.8, 0.05).translate(0, 0.9, 0).rotateX(-lean).translate(0, 0.02, 0.38);
  P.add(m('navy', FACE), front);
  const back = new THREE.BoxGeometry(W - 0.1, 1.8, 0.05).translate(0, 0.9, 0).rotateX(lean).translate(0, 0.02, -0.38);
  P.add(m('navy'), back);
  for (const s of [-1, 1]) {
    P.add(m('white'), box(0.08, 0.08, 1.0, s * (W / 2 - 0.04), 0, 0));
    for (const z of [0.38, -0.38]) {
      const leg = new THREE.BoxGeometry(0.07, 1.86, 0.07)
        .translate(0, 0.93, 0)
        .rotateX(z > 0 ? -lean : lean)
        .translate(s * (W / 2 - 0.04), 0.02, z);
      P.add(m('white'), leg);
    }
  }
  // 价签横梁（正面下部）
  P.add(m('white', FACE), box(W - 0.1, 0.08, 0.06, 0, 0.62, 0.43));
  // 两只球包：圆角长条（0.9 × 0.36），横着挂在正面斜板前，挂带一条
  const bags: { body: In2Key; band: In2Key }[] = [
    { body: 'red', band: 'white' },
    { body: 'neon', band: 'ink' },
  ];
  BAG_STAND.xs.forEach((x, i) => {
    const b = bags[i];
    const y = 1.12;
    const z = 0.36 - Math.tan(lean) * (y - 0.9) + 0.14;
    const body = new THREE.CapsuleGeometry(0.22, 0.8, 4, 12).rotateZ(Math.PI / 2).scale(0.85, 1, 0.7);
    P.add(m(b.body, PROD), body.translate(x, y, z));
    P.add(m(b.band, PROD), plate(0.9, 0.07, x, y - 0.035, z + 0.16));
    // 包身上印一支横躺的拍子轮廓（拍头朝东）：一眼"球拍包"，不用字
    const ink = b.body === 'neon' ? 'navy' : 'white';
    P.add(m(ink, PROD), ellipseRing(0.11, 0.075, 0.025, 16).translate(x + 0.2, y + 0.09, z + 0.162));
    P.add(m(ink, PROD), plate(0.3, 0.03, x - 0.07, y + 0.075, z + 0.162));
    P.add(m('ink', PROD), plate(0.05, 0.32, x - 0.17, y + 0.15, z + 0.08));
    P.add(m('ink', PROD), plate(0.05, 0.32, x + 0.17, y + 0.15, z + 0.08));
  });
  return P.build('in2-sports-bag-stand');
};

// ── in2-sports-string-board：线卷墙（3.6 × 2.4，贴北墙东段）。白板上 3 个大线卷（直径 0.6），每个下面价签 ──
export const STRING_BOARD = { xs: [-1.1, 0, 1.1], y: 1.55, r: 0.3, tagY: 0.38, tagZ: 0.12, w: 3.6 };
const stringBoard: AssetFn = (ctx) => {
  const P = new Parts(ctx);
  const m = matsOf(ctx);
  const W = STRING_BOARD.w;
  P.add(m('navy', FACE), plate(W, 1.6, 0, 0.84, 0.03));
  P.add(m('white', FACE), box(W + 0.06, 0.06, 0.06, 0, 2.44, 0.03));
  P.add(m('white'), box(W, 0.06, 0.12, 0, 0.82, 0.06));
  const cols: In2Key[] = ['neon', 'red', 'white'];
  STRING_BOARD.xs.forEach((x, i) => {
    const y = STRING_BOARD.y;
    const r = STRING_BOARD.r;
    P.add(m('ink', PROD), disc(r, 0.04, x, y, 0.1));
    P.add(m(cols[i], PROD), disc(r - 0.05, 0.05, x, y, 0.14));
    // 线绕的几圈（深一点的环）+ 中心的轴
    P.add(m(cols[i], FACE), ellipseRing(r - 0.12, r - 0.12, 0.025).translate(x, y, 0.142));
    P.add(m('white', PROD), disc(0.07, 0.02, x, y, 0.16));
    P.add(m('ink', PROD), box(0.04, 0.1, 0.06, x, y + r - 0.02, 0.06));
  });
  return P.build('in2-sports-string-board');
};

// ── in2-sports-string-counter：穿线服务台（2.6 × 1.0 × 0.8）。钴蓝台身、白台面，台上一支待穿的拍子和一个铃 ──
export const STRING_COUNTER = { w: 2.6, d: 0.8, h: 1.0, tagY: 0.28, tagZ: 0.41 };
const stringCounter: AssetFn = (ctx) => {
  const P = new Parts(ctx);
  const m = matsOf(ctx);
  const { w, d, h } = STRING_COUNTER;
  P.add(m('cobalt'), box(w, h - 0.06, d, 0, 0, 0));
  P.add(m('cobalt', FACE), plate(w - 0.02, h - 0.12, 0, 0.04, d / 2 + 0.002));
  P.add(m('neon', FACE), plate(w - 0.02, 0.07, 0, h - 0.24, d / 2 + 0.004));
  P.add(m('white'), box(w + 0.1, 0.06, d + 0.1, 0, h - 0.06, 0));
  // 台上：躺着的一支拍子（拍头朝西）、一个铃
  const r = racketGeo(0, true);
  const lay = (g: THREE.BufferGeometry) =>
    g
      .rotateX(-Math.PI / 2)
      .rotateY(Math.PI / 2)
      .translate(-0.35, h + 0.012, 0.0);
  for (const g of r.frame) P.add(m('orange'), lay(g));
  for (const g of r.bed) P.add(m('strings'), lay(g));
  for (const g of r.grip) P.add(m('ink'), lay(g));
  P.add(
    m('white', PROD),
    new THREE.SphereGeometry(0.07, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0.85, h, 0.15),
  );
  P.add(m('ink'), cyl(0.09, 0.02, 0.85, h, 0.15, 10));
  return P.build('in2-sports-string-counter');
};

/** 穿线机放大多少 */
export const STRINGER_K = 1.4;
// ── in2-sports-stringer：穿线机（1.3 × 1.25 × 1.0）。圆底座 + 立柱 + 转台，台上横夹着一支拍子，一侧是拉线头（S3 自己穿线）──
const stringer: AssetFn = (ctx) => {
  const P = new Parts(ctx);
  const m = matsOf(ctx);
  P.add(m('ink'), cyl(0.38, 0.06, 0, 0, 0, 16));
  P.add(m('white'), cyl(0.06, 0.92, 0, 0.06, 0, 10));
  // 转台：一根长横梁（沿 x）+ 两头夹座
  P.add(m('cobalt'), box(1.0, 0.07, 0.14, 0, 0.98, 0));
  for (const x of [-0.42, 0.42]) P.add(m('white'), box(0.1, 0.1, 0.2, x, 1.0, 0));
  // 拍子：躺着（拍面朝上），拍头朝东
  const r = racketGeo(0);
  const lay = (g: THREE.BufferGeometry) =>
    g
      .rotateX(-Math.PI / 2)
      .rotateY(-Math.PI / 2)
      .translate(0.05, 1.07, 0);
  for (const g of r.frame) P.add(m('teal'), lay(g));
  for (const g of r.bed) P.add(m('strings'), lay(g));
  for (const g of r.lines) P.add(m('strings', { lightUp: 0, bands: [0.2, 1.1], noShadowReceive: true }), lay(g));
  for (const g of r.grip) P.add(m('ink'), lay(g));
  // 拉线头：西边一个箱子（钴蓝）+ 红色的张力表
  P.add(m('cobalt'), box(0.26, 0.3, 0.3, -0.62, 0.86, 0));
  P.add(m('cobalt', FACE), plate(0.24, 0.28, -0.62, 0.87, 0.152));
  P.add(m('white', PROD), disc(0.08, 0.02, -0.62, 1.02, 0.17));
  P.add(m('red', PROD), plate(0.02, 0.07, -0.62, 1.02, 0.172));
  P.add(m('white'), cyl(0.03, 0.1, -0.62, 0.76, 0, 8));
  const g = P.build('in2-sports-stringer');
  g.scale.setScalar(STRINGER_K);
  return g;
};

// ── in2-sports-used-rack：寄卖架（2.8 × 2.1 × 0.6，独立的一面）。4 支旧拍子 + 1 个空钩（S5：把自己的挂上去） ──
export const USED_RACK = { xs: [-1.05, -0.35, 0.35, 1.05], w: 2.8, headY: 1.58, tagY: 0.2, tagZ: 0.06 };
const usedRack: AssetFn = (ctx) => {
  const P = new Parts(ctx);
  const m = matsOf(ctx);
  const W = USED_RACK.w;
  // 框：两根立柱 + 顶梁 + 底梁（价签挂在底梁正面）+ 两只脚；背后一块浅灰蓝的挂板（钉板）
  for (const s of [-1, 1]) {
    P.add(m('white'), box(0.08, 2.1, 0.08, s * (W / 2 - 0.04), 0, 0));
    P.add(m('white'), box(0.12, 0.06, 0.6, s * (W / 2 - 0.04), 0, 0));
  }
  P.add(m('white', FACE), box(W, 0.08, 0.08, 0, 2.02, 0));
  P.add(m('white', FACE), box(W - 0.1, 0.12, 0.06, 0, 0.24, 0));
  P.add(m('worn', FACE), plate(W - 0.16, 1.62, 0, 0.38, -0.03));
  // 4 支旧拍子（小一号：0.8 倍），褪色的框、有的缠着胶带；第 5 个位置是空钩
  const sets: In2Key[] = ['red', 'teal', 'orange', 'purple'];
  USED_RACK.xs.forEach((x, i) => {
    const r = racketGeo(0.02, true);
    const t = (g: THREE.BufferGeometry) => g.scale(0.82, 0.82, 1).translate(x, USED_RACK.headY, 0);
    for (const g of r.frame) P.add(m(sets[i], FACE), t(g));
    for (const g of r.bed) P.add(m('worn', PROD, { bands: [-0.5, 0.2] }), t(g));
    for (const g of r.grip) P.add(m('white', FACE), t(g));
    // 拍框上一圈胶带（白）
    if (i % 2 === 0) P.add(m('white', PROD), plate(0.12, 0.05, x, USED_RACK.headY + 0.25, 0.03));
    P.add(m('ink', PROD), box(0.04, 0.06, 0.06, x, USED_RACK.headY + 0.29, -0.02));
    // 寄卖的手写吊牌：拍喉上拴一张歪着的白卡片（只有两道看不清的线）—— 和新拍子的统一价签不一样，一看是"别人的"
    const ty = USED_RACK.headY - 0.5;
    const tilt = i % 2 ? 0.25 : -0.2;
    const at = (g: THREE.BufferGeometry) => g.rotateZ(tilt).translate(x + 0.12, ty, 0.05);
    P.add(m('white', PROD), at(plate(0.16, 0.2, 0, -0.1, 0)));
    P.add(m('worn', FACE), at(plate(0.1, 0.025, 0, 0.0, 0.002)));
    P.add(m('worn', FACE), at(plate(0.07, 0.025, -0.015, -0.06, 0.002)));
    P.add(m('ink', PROD), plate(0.1, 0.02, x + 0.05, ty + 0.1, 0.045));
  });
  return P.build('in2-sports-used-rack');
};

// ── in2-sports-checkout：收银台（2.8 × 1.0 × 0.9），收银员站在北边（台后）。台上一台大收银机（红）、扫码窗、一叠纸袋 ──
export const CHECKOUT = { w: 2.8, d: 0.9, h: 1.0 };
const checkout: AssetFn = (ctx) => {
  const P = new Parts(ctx);
  const m = matsOf(ctx);
  const { w, d, h } = CHECKOUT;
  P.add(m('cobalt'), box(w, h - 0.06, d, 0, 0, 0));
  P.add(m('cobalt', FACE), plate(w - 0.02, h - 0.12, 0, 0.04, d / 2 + 0.002));
  P.add(m('neon', FACE), plate(w - 0.02, 0.07, 0, h - 0.24, d / 2 + 0.004));
  P.add(m('white'), box(w + 0.1, 0.06, d + 0.1, 0, h - 0.06, 0));
  // 扫码窗（台面上一块深色玻璃）
  P.add(m('worn'), box(0.42, 0.012, 0.32, -0.9, h, 0.12));
  P.add(m('white'), box(0.5, 0.008, 0.4, -0.9, h, 0.12));
  // 收银机：底座（钱箱）+ 往前斜的键盘 + 后面竖起的屏（屏朝南）
  const cx = -0.1;
  P.add(m('red'), box(0.62, 0.16, 0.5, cx, h, 0));
  P.add(m('red', FACE), plate(0.6, 0.14, cx, h + 0.01, 0.252));
  P.add(m('ink', PROD), plate(0.36, 0.03, cx, h + 0.06, 0.254));
  const key = new THREE.BoxGeometry(0.56, 0.05, 0.28).rotateX(0.35).translate(cx, h + 0.2, 0.05);
  P.add(m('white'), key);
  P.add(m('red'), box(0.5, 0.32, 0.1, cx, h + 0.16, -0.18));
  P.add(m('ink', PROD), plate(0.38, 0.18, cx, h + 0.27, -0.128));
  P.add(m('neon', PROD), plate(0.18, 0.05, cx, h + 0.33, -0.126));
  // 一叠纸袋（白，带一道荧光）
  P.add(m('white'), box(0.4, 0.14, 0.3, 1.0, h, 0.2));
  P.add(m('neon', PROD), plate(0.38, 0.03, 1.0, h + 0.06, 0.352));
  return P.build('in2-sports-checkout');
};

// ── in2-sports-cart：购物车（0.7 × 1.0 × 1.05，车把朝北 = 本地 −z）。红色塑料车筐（实心板 + 两道槽，不画铁丝网）、白车架、黑轮子 ──
const cart: AssetFn = (ctx) => {
  const P = new Parts(ctx);
  const m = matsOf(ctx);
  const W = 0.7;
  // 车筐：前低后高的梯形侧板（侧面看），底板
  const side = (sx: number) =>
    slab(
      [
        [-0.5, 0.42],
        [0.42, 0.46],
        [0.48, 0.98],
        [-0.46, 0.98],
      ],
      0.04,
    )
      .rotateY(Math.PI / 2)
      .translate(sx, 0, 0);
  P.add(m('red'), side(-W / 2 + 0.04));
  P.add(m('red'), side(W / 2));
  P.add(m('red'), box(W, 0.04, 0.92, 0, 0.42, -0.04));
  P.add(m('red', FACE), plate(W, 0.54, 0, 0.44, 0.44));
  P.add(m('red'), box(W, 0.52, 0.04, 0, 0.46, -0.48));
  // 两道槽（暗）、车筐上沿一圈白
  for (const y of [0.62, 0.78]) P.add(m('ink', PROD), plate(W - 0.16, 0.035, 0, y, 0.444));
  for (const s of [-1, 1]) P.add(m('white'), box(0.04, 0.04, 0.98, s * (W / 2 - 0.0), 0.98, -0.02));
  for (const z of [-0.5, 0.46]) P.add(m('white'), box(W + 0.04, 0.04, 0.04, 0, 0.98, z));
  // 车把（北边，白杆 + 荧光握套）、车架、轮子
  P.add(m('neon'), box(W + 0.08, 0.06, 0.06, 0, 1.0, -0.58));
  for (const s of [-1, 1]) {
    P.add(m('white'), box(0.04, 0.04, 0.12, s * (W / 2 - 0.02), 1.0, -0.52));
    const leg = new THREE.BoxGeometry(0.04, 0.4, 0.04).rotateX(0.15).translate(s * (W / 2 - 0.06), 0.22, -0.4);
    P.add(m('white'), leg);
    P.add(m('white'), box(0.04, 0.04, 1.0, s * (W / 2 - 0.06), 0.1, -0.02));
    for (const z of [-0.42, 0.38])
      P.add(m('ink'), disc(0.07, 0.05, s * (W / 2 - 0.06), 0.07, z + 0.025, 10).rotateY(Math.PI / 2));
  }
  return P.build('in2-sports-cart');
};

// ── in2-sports-wall：北墙的皮（18 × 4.5，贴在框架的墙前 2 厘米）：浅冰蓝的上半 + 1.1 米高的深海军蓝墙裙 + 一道白腰线 ──
export const WALL = { w: 18, h: 4.5, dado: 1.1 };
const wall: AssetFn = (ctx) => {
  const P = new Parts(ctx);
  const m = matsOf(ctx);
  const { w, h, dado } = WALL;
  P.add(m('wall', FACE), plate(w, h - dado, 0, dado, 0.02));
  P.add(m('navy', FACE), plate(w, dado, 0, 0, 0.02));
  P.add(m('white'), box(w, 0.07, 0.06, 0, dado - 0.02, 0.03));
  P.add(m('white'), box(w, 0.08, 0.1, 0, h - 0.08, 0.05));
  return P.build('in2-sports-wall');
};

// ══ 图标牌：店里不写字，分区用 9 × 9（或 11 × 11）的像素图标（'#' 主色、'+' 副色），屏幕上一样大 ══
const ICONS: Record<string, string[]> = {
  /** 侧面的球鞋（鞋头朝西）：鞋面 + 一道荧光侧标 + 鞋底 */
  shoe: [
    '.........',
    '......##.',
    '.....####',
    '..+++####',
    '.########',
    '#########',
    '.........',
    '#########',
    '.........',
  ],
  /** T 恤 */
  shirt: [
    '..##.##..',
    '.#######.',
    '#########',
    '##.###.##',
    '..#####..',
    '..#####..',
    '..#####..',
    '..#####..',
    '..#####..',
  ],
  /** 线轴（侧面）：上下两片白轮缘 + 中间绕满的荧光线 */
  spool: [
    '#########',
    '.#######.',
    '..+++++..',
    '..+++++..',
    '..+++++..',
    '..+++++..',
    '..+++++..',
    '.#######.',
    '#########',
  ],
  /** 绕回来的箭头 ↺（寄卖 / 二手：旧拍子回到店里再卖），11 × 11 */
  reuse: [
    '...........',
    '..###......',
    '.####..##..',
    '.##...####.',
    '##...######',
    '##.....##..',
    '##.....##..',
    '##.....##..',
    '.##...##...',
    '..#####....',
    '...###.....',
  ],
};
/** 图标的几何：中心 (x, y)、一格 c 米（竖直面上一行 = c / cos45，屏幕上是正方格），'#' → a、'+' → b */
function iconGeo(name: string, x: number, y: number, z: number, c: number) {
  const rows = ICONS[name];
  const r = c / Math.SQRT1_2;
  const n = rows.length;
  const a: THREE.BufferGeometry[] = [];
  const b: THREE.BufferGeometry[] = [];
  rows.forEach((row, i) => {
    let k = 0;
    while (k < row.length) {
      const ch = row[k];
      if (ch === '.') {
        k++;
        continue;
      }
      let e = k;
      while (e < row.length && row[e] === ch) e++;
      const g = plate((e - k) * c, r, x + ((k + e) / 2 - row.length / 2) * c, y + (n / 2 - i - 1) * r, z);
      (ch === '#' ? a : b).push(g);
      k = e;
    }
  });
  return { a, b };
}
/** 图标牌的尺寸：屏幕上是个圆（世界里竖向拉长 1 / cos45）；原点 = 牌子下沿正中，牌面朝 +z（z 0 = 背面） */
export const PLAQUE = { rx: 0.42, ry: 0.42 / Math.SQRT1_2 };
const plaque =
  (name: string, bg: In2Key, ink: In2Key, ink2: In2Key): AssetFn =>
  (ctx) => {
    const P = new Parts(ctx);
    const m = matsOf(ctx);
    const { rx, ry } = PLAQUE;
    const cy = ry + 0.03;
    P.add(m(bg, FACE), ellipse(rx, ry, 28).translate(0, cy, 0.02));
    P.add(m('white', PROD), ellipseRing(rx + 0.03, ry + 0.03, 0.045, 28).translate(0, cy, 0.024));
    const { a, b } = iconGeo(name, 0, cy, 0.028, 0.61 / ICONS[name].length);
    for (const g of a) P.add(m(ink, PROD), g);
    for (const g of b) P.add(m(ink2, PROD), g);
    return P.build(`in2-sports-sign-${name}`);
  };

// ── in2-sports-court-mat：球拍墙前的迷你球场地垫（4.4 × 1.8，平铺在地上）。哑光球场绿 + 白线（底线框、中网线、发球线、中线）。
// 原来这里是地上的 TRY ZONE 字框（S2：拿下拍子在这儿掂一掂、空挥）—— 一小块球场自己说明"在这儿挥两下" ──
export const COURT_MAT = { w: 4.4, d: 1.8 };
const courtMat: AssetFn = (ctx) => {
  const P = new Parts(ctx);
  const m = matsOf(ctx);
  const { w, d } = COURT_MAT;
  const flat = (fw: number, fd: number, x: number, z: number, y: number) =>
    new THREE.PlaneGeometry(fw, fd).rotateX(-Math.PI / 2).translate(x, y, z);
  const ground = { noShadowReceive: true } as ToonOpts;
  P.add(m('court', ground), flat(w, d, 0, 0, 0.004));
  const L = 0.05;
  const y = 0.008;
  const ln = m('white', ground);
  // 外框（双打边线 + 底线）
  P.add(ln, flat(w - 0.2, L, 0, -d / 2 + 0.12, y));
  P.add(ln, flat(w - 0.2, L, 0, d / 2 - 0.12, y));
  for (const s of [-1, 1]) P.add(ln, flat(L, d - 0.24, s * (w / 2 - 0.1), 0, y));
  // 网（正中一条深色粗线）、两条发球线、中线
  P.add(m('ink', ground), flat(0.08, d - 0.24, 0, 0, y + 0.001));
  for (const s of [-1, 1]) P.add(ln, flat(L, d - 0.24, s * 1.05, 0, y));
  P.add(ln, flat(2.1, L, 0, 0, y));
  return P.build('in2-sports-court-mat');
};

export const ASSETS: Record<string, AssetFn> = {
  'in2-sports-sign-shoe': plaque('shoe', 'navy', 'white', 'neon'),
  'in2-sports-sign-shirt': plaque('shirt', 'navy', 'neon', 'neon'),
  'in2-sports-sign-spool': plaque('spool', 'navy', 'white', 'neon'),
  'in2-sports-sign-reuse': plaque('reuse', 'teal', 'white', 'white'),
  'in2-sports-court-mat': courtMat,
  'in2-sports-racket-wall': racketWall,
  'in2-sports-shoe-shelf': shoeShelf,
  'in2-sports-apparel': apparel,
  'in2-sports-pyramid': pyramid,
  'in2-sports-ball-case': ballCase,
  'in2-sports-bag-stand': bagStand,
  'in2-sports-string-board': stringBoard,
  'in2-sports-string-counter': stringCounter,
  'in2-sports-stringer': stringer,
  'in2-sports-used-rack': usedRack,
  'in2-sports-checkout': checkout,
  'in2-sports-cart': cart,
  'in2-sports-wall': wall,
};

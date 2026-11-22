// 日出公园：公开课和社区公园的背景（批 KL）。docs/lab/2026-11-07-3d-pixel/valley-park.md「资产清单」。
// 这一批：park-mini-net、park-clinic-tent、park-clinic-banner、park-sign、park-shelter、park-playground
// 本地原点 = 落地点中心，y 0 = 地面，+z 朝镜头（朝南），单位米。设计纹素 0.09 米；材质只用 ctx.mat(key, extra)，随机只用 ctx.rng('<id>')。
//
// 颜色的分工（用户 2026-11-18）：公园里唯一的青绿是俱乐部带来的 —— 小网的管架、帐篷、横幅（clothTeal + 俱乐部的 metal 杆）；
// 市政的东西是公园棕 + 旧木头；野餐棚陶瓦 + 木；游乐场红顶、蓝栏板、黄滑梯（秋千架的青绿是清单定的）。
// 朝南的竖直面（横幅、帷边、园牌、栏板、拍面）永远在暗档 → SIGN_FACE（光往上偏 + 低档位线）落中档；字 signPaint 同样落中档。
// 细的、薄的（杆、网、横幅、链子、梯子）不投影（userData.noCast：傍晚是又长又直的硬黑带）。夜里这一批没有灯，什么都不亮。
// 字：3×5 粗字（interiors/v2/kit 的 FONT_SMALL），一个字的同列同宽的行并成一块薄片，贴在面前 1 厘米；一格 = 0.045 / 0.0675 米（游戏 1 / 1.5 纹素，
// 小镇镜头 0.03375 米/纹素下 = 1.33 / 2 纹素），竖直面上一行 = 一格 / cos45。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { box } from '../../../clubsite/render/geo';
import type { Tones, ToonOpts } from '../../../clubsite/render/toon';
import type { AssetCtx, AssetFn } from '../../ctx';
import { FONT_SMALL } from '../../interiors/v2/kit';
import { SIGN_FACE, TOWN_EL } from '../../palette';
import { cells57, GR, GT, width57 } from './font57';

/** 游戏里一个纹素（米，/valleyassets.html 默认缩放）、竖直面上一屏幕行（俯 45°） */
const T = 0.045;
const COS45 = Math.SQRT1_2;
const R = T / COS45;

type Part = [THREE.BufferGeometry, THREE.Material];

/** 几块几何按材质合成网格；noCast 里的材质不投影 */
function meshes(ctx: AssetCtx, parts: Part[], noCast: THREE.Material[] = []): THREE.Group {
  const g = new THREE.Group();
  const by = new Map<THREE.Material, THREE.BufferGeometry[]>();
  for (const [geo, m] of parts) {
    const ng = geo.index ? geo.toNonIndexed() : geo;
    for (const a of Object.keys(ng.attributes)) if (a !== 'position' && a !== 'normal') ng.deleteAttribute(a);
    if (!ng.attributes.normal) ng.computeVertexNormals();
    by.set(m, [...(by.get(m) ?? []), ng]);
  }
  for (const [m, list] of by) {
    const merged = mergeGeometries(list);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, m);
    if (noCast.includes(m)) mesh.userData.noCast = true;
    g.add(mesh);
  }
  ctx.mats.prepare(g);
  g.traverse((o) => {
    if (o.userData.noCast) o.castShadow = false;
  });
  return g;
}

/** 收集几何 */
function kit() {
  const parts: Part[] = [];
  const add = (g: THREE.BufferGeometry, m: THREE.Material) => {
    parts.push([g, m]);
    return g;
  };
  /** 盒子：中心 x z、底 y */
  const bx = (m: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number) =>
    add(box(w, h, d, x, y, z), m);
  /** 立着的圆柱（底 y） */
  const cyl = (m: THREE.Material, r0: number, r1: number, h: number, x: number, y: number, z: number, n = 8) =>
    add(new THREE.CylinderGeometry(r0, r1, h, n, 1, false).translate(x, y + h / 2, z), m);
  /** 从 a 到 b 的方杆（截面 s × s） */
  const rod = (m: THREE.Material, a: THREE.Vector3, b: THREE.Vector3, s: number) => {
    const len = a.distanceTo(b);
    const g = new THREE.BoxGeometry(s, len, s);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    g.applyQuaternion(q);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    g.translate(mid.x, mid.y, mid.z);
    return add(g, m);
  };
  return { parts, add, bx, cyl, rod };
}

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** 一串三角形（每 9 个数一个），法线朝外（离 inside 那一点远的一侧），平面法线 */
function facets(pos: number[], inside: THREE.Vector3): THREE.BufferGeometry {
  const out: number[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let i = 0; i < pos.length; i += 9) {
    a.fromArray(pos, i);
    b.fromArray(pos, i + 3);
    c.fromArray(pos, i + 6);
    const n = b.clone().sub(a).cross(c.clone().sub(a));
    const cen = a.clone().add(b).add(c).divideScalar(3);
    if (n.dot(cen.sub(inside)) < 0) out.push(...a.toArray(), ...c.toArray(), ...b.toArray());
    else out.push(...a.toArray(), ...b.toArray(), ...c.toArray());
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  g.computeVertexNormals();
  return g;
}
const tri = (p: THREE.Vector3, q: THREE.Vector3, r: THREE.Vector3) => [...p.toArray(), ...q.toArray(), ...r.toArray()];
const quadT = (p: THREE.Vector3, q: THREE.Vector3, r: THREE.Vector3, s: THREE.Vector3) => [
  ...tri(p, q, r),
  ...tri(p, r, s),
];

/**
 * 四坡顶（屋脊沿 x）：檐口 ±hx × ±hz、高 y0，屋脊 ±rx、高 y1（rx 0 = 四角锥）。
 * 返回 [南北两坡, 东西两坡]（分开给：瓦的条纹方向不一样）。
 */
function hipRoof(
  hx: number,
  hz: number,
  y0: number,
  rx: number,
  y1: number,
): [THREE.BufferGeometry, THREE.BufferGeometry] {
  const sw = v3(-hx, y0, hz);
  const se = v3(hx, y0, hz);
  const ne = v3(hx, y0, -hz);
  const nw = v3(-hx, y0, -hz);
  const r1 = v3(-rx, y1, 0);
  const r2 = v3(rx, y1, 0);
  const inside = v3(0, y0 - 1, 0);
  const ns = rx > 0 ? [...quadT(sw, se, r2, r1), ...quadT(ne, nw, r1, r2)] : [...tri(sw, se, r1), ...tri(ne, nw, r1)];
  const ew = [...tri(se, ne, r2), ...tri(nw, sw, r1)];
  return [facets(ns, inside), facets(ew, inside)];
}

// ── 3×5 粗字 ──────────────────────────────────────────────────────────

type Rect = [number, number, number, number];

/**
 * 格子图（'#' = 一格；第一行在最上）→ 盖住它的几块矩形 [左列, 右列, 下行, 上行)（行 0 = 最下）。
 * 每个没盖到的格取过它的最长一竖条或一横条，再往旁边能扩就扩成矩形；矩形可以互相叠（同一个材质、同一个面，叠了看不出），块数少 → 三角形少。
 */
function coverRects(rows: string[]): Rect[] {
  const H = rows.length;
  const on = (c: number, r: number) => r >= 0 && r < H && rows[H - 1 - r][c] === '#';
  const done = new Set<string>();
  const out: Rect[] = [];
  const colFull = (c: number, r0: number, r1: number) => {
    for (let r = r0; r < r1; r++) if (!on(c, r)) return false;
    return true;
  };
  const rowFull = (r: number, c0: number, c1: number) => {
    for (let c = c0; c < c1; c++) if (!on(c, r)) return false;
    return true;
  };
  for (let r = H - 1; r >= 0; r--)
    for (let c = 0; c < rows[H - 1 - r].length; c++) {
      if (!on(c, r) || done.has(`${c},${r}`)) continue;
      let r0 = r;
      let r1 = r + 1;
      while (on(c, r0 - 1)) r0--;
      while (on(c, r1)) r1++;
      let c0 = c;
      let c1 = c + 1;
      while (on(c0 - 1, r)) c0--;
      while (on(c1, r)) c1++;
      let rect: Rect;
      if (r1 - r0 >= c1 - c0) {
        let a = c;
        let b = c + 1;
        while (colFull(a - 1, r0, r1)) a--;
        while (colFull(b, r0, r1)) b++;
        rect = [a, b, r0, r1];
      } else {
        let a = r;
        let b = r + 1;
        while (rowFull(a - 1, c0, c1)) a--;
        while (rowFull(b, c0, c1)) b++;
        rect = [c0, c1, a, b];
      }
      for (let x = rect[0]; x < rect[1]; x++) for (let y = rect[2]; y < rect[3]; y++) done.add(`${x},${y}`);
      out.push(rect);
    }
  return out;
}

/** 一行 3×5 粗字 → 矩形（格；行 0 = 最下）+ 总列数（字距 1 格、空格 2 格，同 kit 的 textCols） */
function glyphRects(text: string): { rects: Rect[]; cols: number } {
  const rects: Rect[] = [];
  const chars = [...text.toUpperCase()];
  let cx = 0;
  chars.forEach((ch, i) => {
    const g = FONT_SMALL[ch];
    const gap = i < chars.length - 1 ? 1 : 0;
    if (!g) {
      cx += 2 + gap;
      return;
    }
    for (const [c0, c1, r0, r1] of coverRects(g)) rects.push([cx + c0, cx + c1, r0, r1]);
    cx += g[0].length + gap;
  });
  return { rects, cols: cx };
}

/** 一行字（竖直面，朝 +z）：x = 中心，y = 字底，z = 字面；cell = 一格宽（米），一行高 = cell / cos45 */
function textGeo(text: string, cell: number, x: number, y: number, z: number): THREE.BufferGeometry[] {
  const { rects, cols } = glyphRects(text);
  const row = cell / COS45;
  const x0 = x - (cols * cell) / 2;
  return rects.map(([c0, c1, r0, r1]) =>
    new THREE.PlaneGeometry((c1 - c0) * cell, (r1 - r0) * row).translate(
      x0 + ((c0 + c1) / 2) * cell,
      y + ((r0 + r1) / 2) * row,
      z,
    ),
  );
}

/** 一行 5×7 字（font57.ts，G4）：一格 = 小镇镜头 1 纹素 × 1 屏幕行，x = 中心（左沿取整到纹素）、y = 字底、z = 字面 */
function text57(text: string, x: number, y: number, z: number): THREE.BufferGeometry[] {
  const x0 = Math.round((x - (width57(text) * GT) / 2) / GT) * GT;
  return cells57(text).map(([c0, c1, r0, r1]) =>
    new THREE.PlaneGeometry((c1 - c0) * GT, (r1 - r0) * GR).translate(
      x0 + ((c0 + c1) / 2) * GT,
      y + ((r0 + r1) / 2) * GR,
      z,
    ),
  );
}

/** 格子图（'#' = 一格；第一行在最上）→ 薄片，左下角在 (x, y)，朝 +z */
function cellsGeo(rows: string[], cell: number, x: number, y: number, z: number): THREE.BufferGeometry[] {
  const row = cell / COS45;
  return coverRects(rows).map(([c0, c1, r0, r1]) =>
    new THREE.PlaneGeometry((c1 - c0) * cell, (r1 - r0) * row).translate(
      x + ((c0 + c1) / 2) * cell,
      y + ((r0 + r1) / 2) * row,
      z,
    ),
  );
}

/**
 * 陶瓦的元素色（roofTile 在调色板里只有 ramp：自动推的缝太深，亮档的瓦楞缝和瓦差 > 60 → 满屋顶强边缘）。
 * 每档 [本色, 高一级, 低一级]，缝差 −20～−27、亮边 +20～+27（L：亮 135 / 中 94 / 暗 57）。lead 以后可以并进 palette.ts 的 roofTile。
 */
const TILE_TONES: Tones = {
  bands: [
    [0xdc744e, 0xe6805a, 0xd06a46],
    [0xa84a48, 0xb25452, 0x9c4240],
    [0x5c2c52, 0x66345c, 0x52264a],
  ],
  seam: [0xb85a42, 0x8a3a40, 0x46203e],
  hi: [0xf09468, 0xc2625a, 0x74406a],
};

/** 朝南的面：SIGN_FACE 的光照 + 额外参数 */
const face = (extra?: ToonOpts): ToonOpts => ({ ...SIGN_FACE, ...extra });
/**
 * 俱乐部青绿布（帐篷顶、帷边、横幅）的元素三色（G4 美术返工）：clothTeal 没给 tones，自动推的高 / 低一级差 ~25 个亮度 → 布面斑块像迷彩。
 * 照漆面的做法（material-spec「沙漠移植」：斑块差约 6 个亮度），晒白不另画。L 153 / 159 / 147 · 117 / 123 / 111 · 73 / 79 / 67
 */
const TEAL_T: Tones = {
  bands: [
    [0x3cb4a4, 0x3ebbaa, 0x3aad9e],
    [0x2a8890, 0x2c8f97, 0x288189],
    [0x24506e, 0x275777, 0x214965],
  ],
  seam: [0x349d8f, 0x24737a, 0x1c3e56],
  hi: [0x45d0be, 0x33a4ae, 0x306a92],
};
/** 小件 / 薄片：不接收投影 */
const SMALL: ToonOpts = { noShadowReceive: true };
/** 竖着的细杆、管架（朝镜头的一面落中档，顶面亮档；青绿 = 俱乐部的东西，要认得出来） */
const POLE: ToonOpts = { lightUp: 0.55, bands: [-0.4, 0.3], noShadowReceive: true };
/** 朝下的一块平板（顶棚底）：单面的顶在阴影 pass 里不投影（three 用背面画影子），补一块朝下的面才有影子 */
const soffit = (w: number, d: number, y: number) =>
  new THREE.PlaneGeometry(w, d).rotateX(Math.PI / 2).translate(0, y, 0);

// ═════════════════════════════════════════════════════════════════════
// park-mini-net：便携小网 5.5 × 0.9 × 0.6（公开课两块红球小场之间，一排两张）
// ═════════════════════════════════════════════════════════════════════

/**
 * 俱乐部的便携小网：青绿方管架（两根 3 纹素的立柱 + 两个落地的 T 字脚，脚沿南北 0.6 米、在屏幕上是两条竖着的短青绿条）、
 * 网身一条水桶蓝的带（不画网眼，下沿一行青绿包边）、上沿 2 行白网带。网带两头包住立柱顶（一块方帽）。全部不投影（薄、细）。
 * v0 网带拉直；v1 中间松一行（另一张网，旧一点）。≈ 80 三角形。
 */
const miniNet: AssetFn = (ctx) => {
  const k = kit();
  const frame = ctx.mat('clothTeal', POLE);
  const net = ctx.mat('jug', { lightUp: 0.5, bands: [-0.15, 0.6], noShadowReceive: true, edge: 0.3, convex: 0 });
  const tape = ctx.mat('netTape', face());
  const W = 5.5;
  const PX = W / 2 - 0.085; // 立柱中心（柱 + 帽不出 5.5 米）
  const H = 0.9;
  const S = 3 * T; // 方管 3 纹素（青绿 = 俱乐部的东西，要认得出来）
  for (const s of [-1, 1]) {
    k.bx(frame, S, H - 0.04, S, s * PX, 0, 0); // 立柱
    k.bx(frame, S, 0.07, 0.6, s * PX, 0, 0); // T 字脚（沿南北）
    k.bx(frame, S + 0.03, 0.05, S + 0.03, s * PX, H - 0.05, 0); // 柱顶方帽
  }
  // 网身：立柱之间，离地 0.12，到网带下沿
  const tapeH = 2 * R;
  const top = H - 0.05;
  k.bx(net, 2 * PX - S, top - tapeH - 0.12, 0.02, 0, 0.12, 0);
  k.bx(frame, 2 * PX - S, R, 0.04, 0, 0.12 - R / 2, 0); // 网身下沿：青绿的包边绳
  // 网带：v0 一整条；v1 中间 2.4 米低一行（松了）
  if (ctx.variant === 1) {
    const mid = 2.4;
    const side = (2 * PX - mid) / 2;
    for (const s of [-1, 1]) k.bx(tape, side, tapeH, 0.05, s * (mid / 2 + side / 2), top - tapeH, 0);
    k.bx(tape, mid, tapeH, 0.05, 0, top - tapeH - R, 0);
  } else k.bx(tape, 2 * PX, tapeH, 0.05, 0, top - tapeH, 0);
  const g = meshes(ctx, k.parts, [frame, net, tape]);
  g.name = 'park-mini-net';
  return g;
};

// ═════════════════════════════════════════════════════════════════════
// park-clinic-tent：俱乐部的折叠帐篷 + 报名桌 3.4 × 2.9 × 3.4
// ═════════════════════════════════════════════════════════════════════

/**
 * 折叠帐篷（pop-up canopy）：青绿四角锥顶（檐 2.35、尖 2.9，布面 paint 大块深浅）+ 一圈 7 行高的帷边，
 * 朝南的帷边印一行白字 "TENNIS CLUB"（俱乐部名还没定）、两头各一颗荧光球；四条 2 纹素的俱乐部 metal 腿（不投影）。
 * 底下一张白布围裙的报名桌（报名表一张白纸、一摞青绿传单），东南角一只镀锌桶，插着三支借用的拍子（拍面朝镜头：红 / 蓝 / 红）。
 * 桌子、桶放在帐篷的南半边：帷边下沿（1.9 米，z 1.72）挡住屏幕上它北边的东西。≈ 430 三角形。
 */
const clinicTent: AssetFn = (ctx) => {
  const k = kit();
  // 顶：南坡（朝镜头）比北坡、东西坡低一档 → 四角锥的形出来；布面大块深浅，不要擦痕
  const roof = ctx.mat('clothTeal', {
    lightUp: 0,
    bands: [0.0, 0.8],
    convex: 0.3,
    noShadowReceive: true,
    tones: TEAL_T,
    elem: { kind: 'paint', size: [10, 6], density: [0, 0] },
  });
  const valance = ctx.mat(
    'clothTeal',
    face({ tones: TEAL_T, elem: { kind: 'paint', size: [12, 4], density: [0, 0] } }),
  );
  const valanceSide = ctx.mat('clothTeal', { noShadowReceive: true, convex: 0.2 });
  const leg = ctx.mat('metal', POLE);
  const ink = ctx.mat('signPaint', SIGN_FACE);
  const ballInk = ctx.mat('ball', SIGN_FACE);
  // 桌面接收帐篷的影子（正午、夜里都在棚影里）；朝镜头的围裙不接收（傍晚低太阳在布面上是一排竖条麻点），本来就落暗档
  const cloth = ctx.mat('clothWhite');
  const skirt = ctx.mat('clothWhite', { noShadowReceive: true });
  const paper = ctx.mat('signPaint');
  const flyer = ctx.mat('clothTeal', SMALL);
  const bucket = ctx.mat('chainLink', { lightUp: 0.4, bands: [-0.3, 0.4], convex: 0.3 });
  const grip = ctx.mat('ironwork', SMALL);
  const heads = [ctx.mat('clothRed', SIGN_FACE), ctx.mat('clothBlue', SIGN_FACE), ctx.mat('clothRed', SIGN_FACE)];

  const HX = 1.68; // 檐口半宽（帷边在外 1.5 厘米：3.4 米见方）
  const EAVE = 2.35;
  const PEAK = 2.9;
  const VH = 7 * R; // 帷边 7 行
  // 顶：四角锥（布）
  const [ns, ew] = hipRoof(HX, HX, EAVE, 0, PEAK);
  k.add(ns, roof);
  k.add(ew, roof);
  k.add(soffit(2 * HX, 2 * HX, EAVE), roof);
  // 帷边：南面朝镜头（字），东西北三面同色
  k.bx(valance, 2 * HX, VH, 0.03, 0, EAVE - VH, HX);
  k.bx(valanceSide, 2 * HX, VH, 0.03, 0, EAVE - VH, -HX);
  for (const s of [-1, 1]) k.bx(valanceSide, 0.03, VH, 2 * HX, s * HX, EAVE - VH, 0);
  // 字（G4：5×7、一格 = 1 纹素；原来 3×5 一格 1.33 纹素，笔画时宽时窄）：帷边 9 行，字 7 行居中
  const ty = EAVE - VH + (VH - 7 * GR) / 2;
  const name = 'TENNIS CLUB';
  for (const g of text57(name, 0, ty, HX + 0.025)) k.add(g, ink);
  const half = (width57(name) * GT) / 2;
  const dot = ['.#.', '###', '.#.'];
  for (const s of [-1, 1])
    for (const g of cellsGeo(dot, GT, s * (half + 0.16) - 1.5 * GT, ty + 2 * GR, HX + 0.025)) k.add(g, ballInk);
  // 腿
  const LX = HX - 0.08;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.bx(leg, 2 * T, EAVE - 0.03, 2 * T, sx * LX, 0, sz * LX);

  // 报名桌：白布围裙（1.8 × 0.74 × 0.7），桌面上一张报名表、一摞传单
  const TX = -0.3;
  const TZ = 0.95;
  k.bx(skirt, 1.8, 0.7, 0.7, TX, 0, TZ);
  k.bx(cloth, 1.84, 0.04, 0.74, TX, 0.7, TZ);
  k.add(
    new THREE.PlaneGeometry(0.32, 0.4)
      .rotateX(-Math.PI / 2)
      .rotateY(0.12)
      .translate(TX - 0.45, 0.745, TZ + 0.05),
    paper,
  );
  k.bx(flyer, 0.32, 0.06, 0.38, TX + 0.35, 0.74, TZ);
  k.bx(paper, 0.28, 0.02, 0.34, TX + 0.35, 0.8, TZ - 0.01); // 最上面那张露白
  // 借拍子的桶：镀锌桶 + 三支拍子（拍面朝镜头）
  const BX = 1.15;
  const BZ = 1.15;
  k.cyl(bucket, 0.2, 0.17, 0.42, BX, 0, BZ, 10);
  const rk: [number, number, number][] = [
    [-0.09, 0.86, 0.22],
    [0.08, 0.92, -0.18],
    [0.0, 0.78, 0.05],
  ];
  rk.forEach(([dx, hy, tilt], i) => {
    const z = BZ + 0.02 * (i - 1);
    k.bx(grip, T, hy - 0.16 - 0.4, T, BX + dx, 0.4, z); // 拍柄 / 拍颈（桶口到拍面）
    const head = new THREE.CylinderGeometry(0.15, 0.15, 0.03, 10)
      .rotateX(Math.PI / 2)
      .scale(0.82, 1, 1)
      .rotateZ(tilt)
      .translate(BX + dx, hy, z + 0.03);
    k.add(head, heads[i]);
  });
  const g = meshes(ctx, k.parts, [leg, grip, paper, flyer, ink, ballInk]);
  g.name = 'park-clinic-tent';
  return g;
};

// ═════════════════════════════════════════════════════════════════════
// park-clinic-banner：公开课横幅 3.6 × 2.2 × 0.3
// ═════════════════════════════════════════════════════════════════════

/**
 * 两根俱乐部的 metal 杆 + 一块青绿横幅（朝南，从小路过来先看到）："FREE TENNIS" / "SAT 9AM" 两行白字（3×5 粗字，一格 1.5 纹素），
 * 杆脚各压一个牛皮纸色的沙袋。横幅、杆都不投影（傍晚的硬黑带）；沙袋是地上的小件，投。≈ 190 三角形。
 */
const clinicBanner: AssetFn = (ctx) => {
  const k = kit();
  const pole = ctx.mat('metal', POLE);
  const cloth = ctx.mat('clothTeal', face({ tones: TEAL_T, elem: { kind: 'paint', size: [16, 6], density: [0, 0] } }));
  const ink = ctx.mat('signPaint', SIGN_FACE);
  const bag = ctx.mat('kraft', { convex: 0.3 });
  const PX = 1.65;
  const H = 2.2;
  const CELL = 1.5 * T;
  const row = CELL / COS45;
  // 横幅：上下各空 1.5 行，两行字之间空 2 行
  const BH = 5 * row * 2 + 2 * row + 3 * row;
  const B0 = H - 0.06 - BH;
  for (const s of [-1, 1]) {
    k.bx(pole, 2 * T, H, 2 * T, s * PX, 0, 0);
    // 沙袋：顺着南北压在杆脚上（一个扁胖块）
    k.bx(bag, 0.3, 0.15, 0.3, s * PX, 0, 0);
  }
  k.bx(cloth, 2 * PX - 2 * T, BH, 0.03, 0, B0, 0);
  const z = 0.03;
  for (const g of textGeo('FREE TENNIS', CELL, 0, B0 + 1.5 * row + 5 * row + 2 * row, z)) k.add(g, ink);
  for (const g of textGeo('SAT 9AM', CELL, 0, B0 + 1.5 * row, z)) k.add(g, ink);
  const g = meshes(ctx, k.parts, [pole, cloth, ink]);
  g.name = 'park-clinic-banner';
  return g;
};

// ═════════════════════════════════════════════════════════════════════
// park-sign：市政公园牌 2.6 × 1.5 × 0.3
// ═════════════════════════════════════════════════════════════════════

/**
 * 两根旧木桩（woodWeathered）+ 一块公园棕的木牌（横木板 0.2 米一块，parkBrown 的 planks），牌面朝南（SIGN_FACE 落中档）；
 * 刻字填奶油色 "SUNRISE PARK"（3×5 粗字，一格 1 纹素），下面一行小字 "City of Palm Springs"（字太小画不出笔画 → 词块：
 * 一个词一条 1 行高的奶油条）；牌顶一条压条；右下角一笔红喷漆涂鸦（一个弯的 tag + 一滴往下淌）。
 * 整块不投影（薄牌 + 杆）。≈ 130 三角形。
 * 注意：园牌在 PLAY_KEEP 外，进场景按 TOWN_K 缩到 0.62 → 字一格 0.028 米 < 小镇的 1 纹素（0.034），会糊；组装时建议放进 PLAY_KEEP 或单独不缩。
 */
const parkSign: AssetFn = (ctx) => {
  const k = kit();
  const post = ctx.mat('woodWeathered', { elem: { kind: 'planks', p: [1, 0, 0, 0.07], seam: 1, hi: 0 } });
  const board = ctx.mat('parkBrown', face({ elem: TOWN_EL.parkBrown, edge: 0.5 }));
  const capM = ctx.mat('woodWeathered', { convex: 0.4 });
  const ink = ctx.mat('signPaint', SIGN_FACE);
  // 喷漆要从棕牌上跳出来：固定在亮档（中档的砖红和牌面差不到 10 个亮度）
  const tag = ctx.mat('clothRed', { lightUp: 0, bands: [-3, -2], noShadowReceive: true });
  const W = 2.6;
  const B0 = 0.62; // 牌底
  const BH = 0.8;
  const BZ = 0.06; // 牌面在桩子前面
  for (const s of [-1, 1]) {
    k.bx(post, 0.16, 1.45, 0.16, s * 1.05, 0, 0);
    k.bx(capM, 0.2, 0.05, 0.2, s * 1.05, 1.45, 0); // 桩帽
  }
  k.bx(board, W, BH, 0.08, 0, B0, BZ);
  k.bx(capM, W, 0.06, 0.16, 0, B0 + BH, BZ); // 压条
  const z = BZ + 0.04 + 0.01;
  // 字（G4）：只留 "SUNRISE PARK" 一行 5×7（一格 = 1 纹素），竖着居中；原来下面一行"City of Palm Springs"的词块（1 行高）是一排噪点，删了
  const tY = B0 + (BH - 7 * GR) / 2;
  for (const g of text57('SUNRISE PARK', 0, tY, z)) k.add(g, ink);
  // 涂鸦：右下角一个弯的 tag + 一滴往下淌（盖住牌的下沿）
  const graf = ['.##..#', '#..#.#', '.##.#.', '...#..', '...#..'];
  for (const g of cellsGeo(graf, T, W / 2 - 0.42, B0 + 0.02, z + 0.002)) k.add(g, tag);
  const g = meshes(ctx, k.parts, [post, board, capM, ink, tag]);
  g.name = 'park-sign';
  return g;
};

// ═════════════════════════════════════════════════════════════════════
// park-shelter：野餐棚 9 × 4.4 × 6.8
// ═════════════════════════════════════════════════════════════════════

/**
 * 四根木柱 + 四坡陶瓦顶（檐 2.6～2.75、屋脊 4.4、屋脊沿东西 2.2 米，一条压脊）+ 一圈木封檐板；地上一块水泥台。
 * 瓦：roofTile 的板条元素当筒瓦的竖楞（南北两坡沿 x、东西两坡沿 z，每 0.4 米一道；只画缝不画亮条：缝 + 亮条挨着差 > 60，满屋顶强边缘）。
 * 棚底下两张野餐桌（旧木板：桌面 + 两条凳，A 字腿简成两根腿 + 一根托凳的横档）放在南半边：45° 下封檐板挡住屏幕上它北边一大块。
 * 东南角一个烧烤架（铸铁：一根柱子 + 一个炭盒 + 盖）。
 * 在 PLAY_KEEP 外：进场景按 TOWN_K 缩到 0.62（这里照清单的原尺寸画）。≈ 400 三角形。
 */
const shelter: AssetFn = (ctx) => {
  const k = kit();
  // 瓦：筒瓦一道 0.4 米（进场景缩 0.62 还有 7 纹素）；顶不接收投影（屋脊、东西坡的影子落在瓦楞上是一片麻点）
  const tileNS = ctx.mat('roofTile', {
    noShadowReceive: true,
    tones: TILE_TONES,
    elem: { kind: 'planks', p: [1, 0, 0, 0.4], seam: 1, hi: 0 },
  });
  const tileEW = ctx.mat('roofTile', {
    noShadowReceive: true,
    tones: TILE_TONES,
    elem: { kind: 'planks', p: [0, 0, 1, 0.4], seam: 1, hi: 0 },
  });
  const ridge = ctx.mat('roofTile', { convex: 0.6 });
  const timber = ctx.mat('wood', { elem: { kind: 'planks', p: [1, 0, 0, 0.1], seam: 1, hi: 0 } });
  const fascia = ctx.mat('wood', face({ noShadowReceive: false, edge: 0.6 }));
  const plank = ctx.mat('woodWeathered', { elem: { kind: 'planks', p: [0, 0, 1, 0.14], seam: 1, hi: 1 } });
  const plankX = ctx.mat('woodWeathered', { convex: 0.4 });
  const iron = ctx.mat('ironwork', { convex: 0.4 });
  const pad = ctx.mat('concrete', {
    edge: 0.05,
    convex: 0,
    elem: { kind: 'paint', size: [22, 12] },
  });

  const HX = 4.5;
  const HZ = 3.4;
  const EAVE = 2.75;
  const RIDGE = 4.3; // 瓦面的脊；压脊再高 0.1 → 4.4
  const RX = HX - HZ; // 等坡：屋脊半长 1.1
  // 水泥台
  k.bx(pad, 8.2, 0.04, 6.0, 0, 0, 0.1);
  // 顶
  const [ns, ew] = hipRoof(HX, HZ, EAVE, RX, RIDGE);
  k.add(ns, tileNS);
  k.add(ew, tileEW);
  k.add(soffit(2 * HX, 2 * HZ, EAVE), tileNS);
  k.bx(ridge, 2 * RX + 0.3, 0.14, 0.22, 0, RIDGE - 0.04, 0);
  // 封檐板：一圈 0.15 高（南面朝镜头）
  const FH = 0.16;
  k.bx(fascia, 2 * HX, FH, 0.08, 0, EAVE - FH, HZ - 0.04);
  k.bx(timber, 2 * HX, FH, 0.08, 0, EAVE - FH, -HZ + 0.04);
  for (const s of [-1, 1]) k.bx(timber, 0.08, FH, 2 * HZ, s * (HX - 0.04), EAVE - FH, 0);
  // 柱
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.bx(timber, 0.28, EAVE - FH, 0.28, sx * 3.9, 0.04, sz * 2.8);
  // 野餐桌 × 2
  const table = (x: number, z: number) => {
    const L = 1.8;
    k.bx(plank, L, 0.06, 0.76, x, 0.7, z); // 桌面
    for (const s of [-1, 1]) {
      k.bx(plank, L, 0.05, 0.28, x, 0.42, z + s * 0.6); // 凳
      for (const e of [-1, 1]) k.bx(plankX, 0.08, 0.7, 0.08, x + e * 0.62, 0.04, z + s * 0.24); // 腿
    }
    for (const e of [-1, 1]) k.bx(plankX, 0.08, 0.06, 1.5, x + e * 0.62, 0.36, z); // 托凳横档
  };
  table(-1.95, 1.85);
  table(1.75, 1.85);
  // 烧烤架（东南角，封檐板外一点也看得见）
  const GX = 3.55;
  const GZ = 2.95;
  k.bx(iron, 0.1, 0.62, 0.1, GX, 0.04, GZ);
  k.bx(iron, 0.62, 0.24, 0.42, GX, 0.66, GZ);
  k.bx(iron, 0.66, 0.05, 0.46, GX, 0.9, GZ - 0.02);
  const g = meshes(ctx, k.parts, [ridge]);
  g.name = 'park-shelter';
  return g;
};

// ═════════════════════════════════════════════════════════════════════
// park-playground：儿童游乐场 13 × 4.6 × 9（含沙坑）
// ═════════════════════════════════════════════════════════════════════

/**
 * 硬边沙坑（sandHigh + 沙纹，四边一圈木挡板）+ 西边一座平台塔（四根木柱、1.5 米平台、蓝栏板朝南 / 西 / 北、红四角锥顶到 4.6 米、
 * 南面西半边一架木梯）+ 黄滑梯（从平台东沿往东滑下来：侧面看是一条黄斜带）+ 东边一架秋千（青绿 A 字架、横梁 2.4 米，两个红座、
 * 四条铁链 1 纹素）。细的（链子、梯子、秋千架、塔柱）不投影；平台、栏板、顶、滑梯投。
 * 在 PLAY_KEEP 外：进场景按 TOWN_K 缩到 0.62（这里照清单的原尺寸画）。≈ 520 三角形。
 */
const playground: AssetFn = (ctx) => {
  const k = kit();
  const sand = ctx.mat('sandHigh', {
    edge: 0.05,
    convex: 0,
    elem: { kind: 'ripples', size: [9, 4], density: [0.01, 0.1], patch: 3, mottle: 0.4, seed: 5 },
  });
  const curb = ctx.mat('wood', { elem: { kind: 'planks', p: [0, 1, 0, 0.09], seam: 1, hi: 1 }, convex: 0.3 });
  const post = ctx.mat('wood', { ...POLE, convex: 0.3 });
  const deck = ctx.mat('wood', { convex: 0.3 }); // 平台：在塔顶的影子里，平涂（板缝在暗档里和亮的沙挨着就是强边缘）
  const panel = ctx.mat('clothBlue', face());
  const panelSide = ctx.mat('clothBlue', { convex: 0.3 });
  const roofM = ctx.mat('clothRed', { lightUp: 0.15, bands: [0.0, 0.5], convex: 0.3, noShadowReceive: true });
  const slide = ctx.mat('flowerYellow', { lightUp: 0.35, bands: [-0.25, 0.45], convex: 0.3, edge: 0.6 });
  const frame = ctx.mat('clothTeal', POLE);
  const seat = ctx.mat('clothRed', face());
  const chain = ctx.mat('ironwork', SMALL);
  const rungM = ctx.mat('wood', POLE);

  // 沙坑：13 × 9，挡板 0.2 宽 0.2 高，沙面 0.1
  const SX = 6.5;
  const SZ = 4.5;
  k.bx(sand, 2 * SX - 0.3, 0.1, 2 * SZ - 0.3, 0, 0, 0);
  k.bx(curb, 2 * SX, 0.2, 0.2, 0, 0, SZ - 0.1);
  k.bx(curb, 2 * SX, 0.2, 0.2, 0, 0, -SZ + 0.1);
  for (const s of [-1, 1]) k.bx(curb, 0.2, 0.2, 2 * SZ - 0.4, s * (SX - 0.1), 0, 0);

  // 平台塔：中心 (TX, TZ)，1.8 见方
  const TX = -3.4;
  const TZ = -0.9;
  const P = 0.82; // 柱离中心
  const DECK = 1.5;
  const TOP = 3.25;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.bx(post, 0.16, TOP, 0.16, TX + sx * P, 0.1, TZ + sz * P);
  k.bx(deck, 2 * P + 0.2, 0.1, 2 * P + 0.2, TX, DECK, TZ);
  // 栏板：南面东半边（西半边是梯子口）、西面、北面；东面是滑梯口
  const PH = 0.85;
  k.bx(panel, P, PH, 0.06, TX + P / 2, DECK + 0.1, TZ + P + 0.05);
  k.bx(panelSide, 0.06, PH, 2 * P, TX - P - 0.05, DECK + 0.1, TZ);
  k.bx(panelSide, 2 * P, PH, 0.06, TX, DECK + 0.1, TZ - P - 0.05);
  // 栏板上沿一根木扶手（南面整条）
  k.bx(post, 2 * P + 0.16, 0.07, 0.08, TX, DECK + 0.1 + PH, TZ + P + 0.05);
  // 红顶：四角锥，檐 ±1.15
  const [rns, rew] = hipRoof(1.15, 1.15, TOP + 0.1, 0, 4.6);
  for (const geo of [rns, rew]) k.add(geo.translate(TX, 0, TZ), roofM);
  k.bx(roofM, 2.3, 0.1, 2.3, TX, TOP, TZ); // 檐口一圈厚度
  // 梯子：南面西半边，往南斜出去
  const LX = TX - P / 2;
  const foot = TZ + P + 0.55;
  const head = TZ + P + 0.05;
  for (const s of [-1, 1]) k.rod(rungM, v3(LX + s * 0.28, 0.1, foot), v3(LX + s * 0.28, DECK + 0.1, head), 2 * T);
  for (let i = 1; i <= 4; i++) {
    const t = i / 5;
    k.bx(rungM, 0.56, 0.05, 0.06, LX, 0.1 + t * DECK, foot + (head - foot) * t);
  }

  // 滑梯：从平台东沿 (TX + P, DECK) 往东滑到 x ≈ 0.4（离沙 0.3），再平出 0.6 米
  const sx0 = TX + P + 0.1;
  const sx1 = 0.4;
  const y0 = DECK + 0.05;
  const y1 = 0.38;
  const len = Math.hypot(sx1 - sx0, y0 - y1);
  const ang = Math.atan2(y0 - y1, sx1 - sx0);
  const chute = (h: number, d: number, oy: number, oz: number) =>
    k.add(
      box(len, h, d, 0, oy, oz)
        .rotateZ(-ang)
        .translate((sx0 + sx1) / 2, (y0 + y1) / 2, TZ),
      slide,
    );
  chute(0.06, 0.56, -0.03, 0); // 槽底
  for (const s of [-1, 1]) chute(0.18, 0.06, 0, s * 0.28); // 两侧挡边
  k.bx(slide, 0.6, 0.06, 0.56, sx1 + 0.3, y1 - 0.06, TZ); // 平出段
  for (const s of [-1, 1]) k.bx(slide, 0.6, 0.18, 0.06, sx1 + 0.3, y1 - 0.06, TZ + s * 0.28);
  k.bx(post, 0.12, y1 - 0.12, 0.12, sx1 + 0.5, 0.1, TZ); // 出口的撑脚

  // 秋千：横梁沿东西 x 1.6…5.6，高 2.4，A 字腿往南北叉开
  const QZ = 0.6;
  const QY = 2.4;
  const qx0 = 1.7;
  const qx1 = 5.5;
  k.rod(frame, v3(qx0 - 0.1, QY, QZ), v3(qx1 + 0.1, QY, QZ), 2.5 * T);
  for (const x of [qx0, qx1])
    for (const s of [-1, 1]) k.rod(frame, v3(x, QY + 0.04, QZ), v3(x + (x < 3 ? -0.2 : 0.2), 0.1, QZ + s * 1.0), 2 * T);
  for (const x of [qx0 + 1.0, qx1 - 1.0]) {
    k.bx(seat, 0.5, 0.06, 0.22, x, 0.5, QZ);
    for (const s of [-1, 1]) k.bx(chain, T, QY - 0.56, T, x + s * 0.22, 0.56, QZ);
  }
  const g = meshes(ctx, k.parts, [frame, chain, rungM, post]);
  g.name = 'park-playground';
  return g;
};

// ═════════════════════════════════════════════════════════════════════
// park-grass-tuft：草地的"中间层"（G4 美术返工，lessons「组装经验」第 2 条：手摆的簇，不满地撒）0.5 × 0.3 × 0.4
// v0 一团深绿草（3～4 小团球面法线）/ v1 晒黄的一团 / v2 草团 + 几朵小花（白、黄，2 纹素一朵）/ v3 墙脚的高草（一把竖叶，2 纹素宽）。
// 都不接收投影、不投影（小东西：阴影毛边在小面上是麻点；它们的影子也读不出来）。组装放在墙脚、长椅脚、场角、步道转弯、树脚下。
// ═════════════════════════════════════════════════════════════════════
/** 草团的绿：比草地暗一截、偏蓝（草地画面 #8ab044；这团亮档画面约 #6c9c3e），晒黄的那团亮档压在 190 以下（和亮草差 < 60，不出强边缘） */
const TUFT_GREEN: [number, number, number] = [0x5e9a36, 0x3e7c46, 0x2a5458];
const TUFT_DRY: [number, number, number] = [0xc2b45a, 0x96884e, 0x5a5462];
const grassTuft: AssetFn = (ctx) => {
  const v = ctx.variant % 4;
  const rnd = ctx.rng(`park-grass-tuft:${v}`);
  const k = kit();
  const TUFT: ToonOpts = { noShadowReceive: true, lightUp: 0.35, convex: 0.25, edge: 0.3 };
  const green = ctx.mat('lawn', { ...TUFT, ramp: TUFT_GREEN, sphereNormals: [0, -0.05, 0] });
  const dry = ctx.mat('dryTuft', { ...TUFT, ramp: TUFT_DRY, sphereNormals: [0, -0.05, 0] });
  const blob3 = (m: THREE.Material, r: number, x: number, z: number, sy: number) =>
    k.add(new THREE.IcosahedronGeometry(r, 0).scale(1, sy, 1).translate(x, r * sy * 0.55, z), m);
  if (v === 3) {
    // 一把竖叶：7 片 2 纹素宽的薄条，往外散开、高矮不一
    const blade = ctx.mat('lawn', {
      noShadowReceive: true,
      ramp: TUFT_GREEN,
      lightUp: 0.5,
      bands: [-0.4, 0.35],
      convex: 0.1,
    });
    for (let i = 0; i < 7; i++) {
      const a = (i / 6 - 0.5) * 1.1;
      const h = 0.28 + rnd() * 0.2;
      k.add(
        new THREE.BoxGeometry(2 * T, h, 2 * T)
          .translate(0, h / 2, 0)
          .rotateZ(a * 0.6)
          .translate((i - 3) * 0.06, 0, (rnd() - 0.5) * 0.12),
        blade,
      );
    }
    blob3(green, 0.14, 0, 0.02, 0.6);
  } else {
    const m = v === 1 ? dry : green;
    const n = 3 + Math.floor(rnd() * 2);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd();
      const r = 0.1 + rnd() * 0.07;
      blob3(m, r, Math.cos(a) * 0.12, Math.sin(a) * 0.08, 0.75);
    }
    blob3(m, 0.15, 0, 0, 0.85);
  }
  if (v === 2) {
    // 小花：2 纹素的花头（白 / 黄），压在草团顶上，彼此隔开（不连成一条）
    const white = ctx.mat('clothWhite', { noShadowReceive: true, bands: [-9, -8] });
    const yellow = ctx.mat('flowerYellow', { noShadowReceive: true, bands: [-9, -8] });
    const spots: [number, number][] = [
      [-0.13, 0.02],
      [0.02, -0.06],
      [0.15, 0.05],
      [-0.03, 0.11],
      [0.1, -0.12],
    ];
    spots.forEach(([x, z], i) => {
      k.bx(i % 3 === 1 ? yellow : white, 2 * T, 2 * T, 2 * T, x, 0.2 + rnd() * 0.06, z);
    });
  }
  const g = meshes(
    ctx,
    k.parts,
    k.parts.map((p) => p[1]),
  );
  g.name = 'park-grass-tuft';
  return g;
};

export const ASSETS: Record<string, AssetFn> = {
  'park-grass-tuft': grassTuft,
  'park-mini-net': miniNet,
  'park-clinic-tent': clinicTent,
  'park-clinic-banner': clinicBanner,
  'park-sign': parkSign,
  'park-shelter': shelter,
  'park-playground': playground,
};

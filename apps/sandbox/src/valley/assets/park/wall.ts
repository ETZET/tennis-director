// 日出公园：对墙和野球局场边（批 KW）。docs/lab/2026-11-07-3d-pixel/valley-park.md「资产清单」。
// 这一批：park-wall、park-wall-court、park-kid-gear、park-racquet-queue、park-bench、park-trash、park-ball-hopper
// 本地原点 = 落地点中心，y 0 = 地面，+z 朝镜头（朝南），单位米。设计纹素 0.09 米；材质只用 ctx.mat(key, extra)，随机只用 ctx.rng('<id>')。
//
// 画廊默认 0.045 米 / 渲染纹素（= 半个设计纹素）：横向按 PX（0.045）取整，竖直面上一渲染行 = RV（0.045 / cos45），地面上一渲染行 = RG（同）。
// 朝南的竖直面（墙面、靠背、木牌、拍子）永远背光：给 FACE（光往上偏 + 低档位线 → 落中档）、不接收投影。
// 薄的、细的东西（墙也是：傍晚一道墙投出来是又长又直的黑带）全部 userData.noCast。
//
// 这个文件自己手挑的颜色（材质规范 v2：每档 [本色, 高一级, 低一级]，缝 / 亮边各三档，暗档往冷走）—— lead 以后可以并进 palette.ts：
// - WALL_WORN / WALL_WORN_CORE：对墙上球印磨出来的一块（hitWall 晒白、磨亮，两色硬边）
// - WALL_FOOT：墙脚一行脏边（hitWall 的缝色那一家）
// - COURT_WORN / COURT_WORN_CORE：少年站的地方磨白的一块（muniCourt 晒白，两色硬边；courtBleach 是俱乐部的青蓝，不能用）
// - WIRE：铁丝筐的筐壁（透过铁丝看到的一筐球：橄榄黄 + 每 0.09 米一条灰铁丝）
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { box } from '../../../clubsite/render/geo';
import type { Tones, ToonOpts } from '../../../clubsite/render/toon';
import type { AssetCtx, AssetFn } from '../../ctx';
import { type PalKey, TOWN_EL } from '../../palette';
import { cells57, GR, GT, width57 } from './font57';

/** 设计纹素（米） */
const T = 0.09;
/** 渲染纹素（画廊默认缩放，米） */
const PX = 0.045;
/** 竖直面 / 地面上一渲染行（米）：俯 45° 下 1 米 = 0.707 屏幕米 */
const RV = PX / Math.SQRT1_2;
const RG = RV;
/** 按渲染纹素 / 行取整 */
const qx = (v: number) => Math.round(v / PX) * PX;
const qy = (v: number) => Math.round(v / RV) * RV;

type Ramp = [number, number, number];
const tn = (lit: Ramp, mid: Ramp, dark: Ramp, seam: Ramp, hi: Ramp): Tones => ({ bands: [lit, mid, dark], seam, hi });

/** 朝南的竖直面（墙面、靠背、木牌、拍子）：落中档（资产代理的经验 0.5 / [−0.45, 0.3]），不接收投影 */
const FACE: ToonOpts = { lightUp: 0.5, bands: [-0.45, 0.3], noShadowReceive: true };
/** 小道具：不接收投影（阴影毛边在小面上是麻点） */
const PROP: ToonOpts = { noShadowReceive: true };

/**
 * 对墙的墙面：hitWall 的亮度原样，彩度提一截（hitWall 原值 S 0.15，过 wall 组的午后调色只剩 S 0.08 = 一面灰墙；
 * 这套中档 S 0.37 → 画面里 ~0.2，还是"灰绿漆"，但看得出是绿的）。L 161/171/152 · 131/141/122 · 80/89/72
 */
const WALL_T = tn(
  [0x84ac90, 0x8eb69a, 0x7aa286],
  [0x5a9080, 0x649a8a, 0x528676],
  [0x34566e, 0x3c5e76, 0x2e4e64],
  [0x6c947a, 0x4c7468, 0x22384e],
  [0xa2c8aa, 0x7eae9a, 0x4c6c84],
);
const WALL_RAMP: Ramp = [0x84ac90, 0x5a9080, 0x34566e];
/** 对墙上球印磨出来的一块：比 hitWall 亮一截、彩度低一点（L 中档 151 / 暗档 96） */
const WALL_WORN: Ramp = [0xa2c4a8, 0x7eaa98, 0x4a6a7e];
/** 磨得最狠的芯（偏西北、不同心）：再亮 ~15 */
const WALL_WORN_CORE: Ramp = [0xb8d6b8, 0x94bca8, 0x587a8a];
/** 墙脚一行脏边：hitWall 的缝那一家 */
const WALL_FOOT: Ramp = [0x6c947a, 0x4c7468, 0x22384e];
/** 少年站的地方：muniCourt 晒白（G4 跟着新内场：L 152 / 125 / 90）、芯再亮 ~14（L 166 / 140 / 101） */
const COURT_WORN: Ramp = [0x5cb09a, 0x48908a, 0x3a6278];
const COURT_WORN_CORE: Ramp = [0x72c2ac, 0x5aa29a, 0x467086];
/** 场上的裂缝（muniCourt 的缝再深一截，L 111 / 86 / 55）和缝下沿翘起的亮漆（= muniCourt 的亮边） */
const COURT_CRACK: Ramp = [0x308270, 0x25635f, 0x203b4d];
const COURT_LIP: Ramp = [0x45bca2, 0x389893, 0x376785];
/** 长椅座板底下的托板（板缝、掉了板的地方露出来）：woodWeathered 中档提亮一点（L 165），挨着亮的座板差 < 60 */
const BENCH_UNDER: Ramp = [0xd8b088, 0xbc9680, 0x5c4c78];
/** 垃圾桶的镀锌盖沿：chainLink 的亮档压一点（L 159 / 136 / 79） */
const TRASH_RIM: Ramp = [0x94a0a2, 0x7e8a98, 0x474e6a];
/** 铁丝筐的筐壁：透过铁丝的一筐球（橄榄黄，暗一档 = 筐里），缝 = 铁丝（灰），亮边不用 */
const WIRE_T = tn(
  [0xb4bc4c, 0xbcc456, 0xaab444], // L 175 / 183 / 167
  [0x8c9446, 0x949c4e, 0x848c40], // L 137 / 145 / 130
  [0x4c5a5c, 0x546262, 0x465254], // L 84 / 92 / 78
  [0x8a8a86, 0x6c6e74, 0x343a52], // 缝（铁丝）L 137 / 109 / 57
  [0xc8d060, 0xa0a856, 0x5c6a66],
);

type Part = [THREE.BufferGeometry, THREE.Material];

/** 一件资产的零件：按材质合成一个网格（只留 position + normal），全部不投影可选 */
class Parts {
  list: Part[] = [];
  add(m: THREE.Material, ...gs: THREE.BufferGeometry[]) {
    for (const g of gs) this.list.push([g, m]);
    return this;
  }
  group(ctx: AssetCtx, name: string, noCast: boolean | THREE.Material[] = false): THREE.Group {
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
    for (const o of g.children) {
      const mesh = o as THREE.Mesh;
      if (noCast === true || (Array.isArray(noCast) && noCast.includes(mesh.material as THREE.Material))) {
        mesh.castShadow = false;
        mesh.userData.noCast = true;
      }
    }
    return g;
  }
}

/** 朝 +z 的竖直矩形（左下角 x0, y0；宽 w、高 h；面在 z） */
const panel = (x0: number, y0: number, w: number, h: number, z: number) =>
  new THREE.PlaneGeometry(w, h).translate(x0 + w / 2, y0 + h / 2, z);
/** 地面上的矩形（朝上，离地 y） */
const flat = (x0: number, x1: number, z0: number, z1: number, y: number) =>
  new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2).translate((x0 + x1) / 2, y, (z0 + z1) / 2);

/**
 * 一块有机形状的硬边斑（磨白、球印）：n 个角、半径按 rng 起伏，顶点按渲染纹素 / 行取整（边是整纹素的台阶，不是斜的细边）。
 * 返回平面上的点（u 横、v 竖），调用方摆到墙上 / 地上。
 */
function blob(
  rnd: () => number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  n = 9,
  jit = 0.22,
): [number, number][] {
  const pts: [number, number][] = [];
  const a0 = rnd() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * Math.PI * 2;
    const k = 1 - jit + rnd() * jit * 2;
    pts.push([qx(cx + Math.cos(a) * rx * k), qy(cy + Math.sin(a) * ry * k)]);
  }
  return pts;
}
const shapeGeo = (pts: [number, number][]) =>
  new THREE.ShapeGeometry(new THREE.Shape(pts.map(([u, v]) => new THREE.Vector2(u, v))));
/** 墙面上的斑（朝 +z，面在 z） */
const wallBlob = (pts: [number, number][], z: number) => shapeGeo(pts).translate(0, 0, z);
/** 地上的斑（朝上，v = 往北为正 → z = −v） */
const groundBlob = (pts: [number, number][], y: number) =>
  shapeGeo(pts)
    .rotateX(-Math.PI / 2)
    .translate(0, y, 0);

/** 一行 5×7 字（font57.ts）：x = 中心、y = 字底、z = 字面；一格 GT × GR（游戏里 1 纹素 × 1 行），左沿取整到纹素 */
function bigText(text: string, x: number, y: number, z: number): THREE.BufferGeometry {
  const x0 = Math.round((x - (width57(text) * GT) / 2) / GT) * GT;
  const gs = cells57(text).map(([c0, c1, r0, r1]) =>
    panel(x0 + c0 * GT, y + r0 * GR, (c1 - c0) * GT, (r1 - r0) * GR, z),
  );
  return mergeGeometries(gs.map((g) => g.toNonIndexed())) ?? new THREE.BufferGeometry();
}

// ════════════════════════════════════════════════════════════════════════════
// park-wall：对墙练习墙 9.6 × 3.2 × 0.6（+ 背后两根扶壁）。
// 2026-11-18 美术返工 G4：墙是主角 —— 朝南的墙面回到暗档（去掉 FACE 的 lightUp：太阳在画面后方，墙面就是一大块冷石板蓝的暗带，
// 傍晚少年站在它前面才立得起来；关卡 1 灰盒那道深色墙是对的）。墙面元素 = 砌块（strata：一层 4 行 ±1、块宽 ~12 纹素、每块自己一个深浅、
// 竖缝八成、缝下一行亮一级），不要 1 纹素的球印点；顶上一条亮的压顶。墙面上：0.91 米白网高线、两块橙色胶带靶子、
// 墙中间偏东一大块球印磨白（两色硬边，暗档里也比墙亮一截）、墙脚一行脏边。两头是凸出一纹素的壁柱。
// ════════════════════════════════════════════════════════════════════════════
function parkWall(ctx: AssetCtx): THREE.Object3D {
  const rnd = ctx.rng('park-wall');
  const W = 9.0; // 墙身（两头壁柱之间）
  const H = qy(3.0);
  // 墙厚 0.3（G4：0.4 的墙顶压顶在画面上是 10 行宽的一条沙色板子；0.3 → 7 行，读成"一条亮边"）
  const Z0 = -0.1;
  const Z1 = 0.2; // 墙面
  const ZC = (Z0 + Z1) / 2;
  const P = new Parts();
  // 墙面借 chainLink 的名字过调色（court 组：色相几乎不动）；hitWall 借的是 concrete（wall 组 → 全局调色，中档色相往橙拉 35%），
  // 绿墙过完是灰的（S 0.08）。edge / convex 照 hitWall。不接收投影（立面：沙漠复盘第 8 条）
  const W_OPTS: ToonOpts = { ramp: WALL_RAMP, tones: WALL_T, edge: 0.4, convex: 0.2, noShadowReceive: true };
  // 砌块：uv = [沿墙米, 离墙顶米]（wall 空间：竖直 1 米 = 0.707 / 纹素 屏幕行）；不淌东西（q.y 很大）
  const blocks: ToonOpts['elem'] = { kind: 'strata', space: 'wall', size: [12, 4], hi: 0.5, q: [9, 999, 0, 0] };
  const faceMat = ctx.mat('chainLink', { ...W_OPTS, elem: blocks, toneW: [0.34, 0.3] });
  const plain = ctx.mat('chainLink', W_OPTS);
  const cap = ctx.mat('concrete', {});
  // 墙身：朝南那面单独一片（带 uv，砌块图案要），其余几面（两头、背面）平涂
  const front = new THREE.PlaneGeometry(W, H).translate(0, H / 2, Z1);
  {
    const uv = front.attributes.uv as THREE.BufferAttribute;
    const pos = front.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) + W / 2, H - pos.getY(i));
  }
  P.add(plain, box(W, H, Z1 - Z0 - 0.002, 0, 0, ZC - 0.001));
  const pw = qx(0.3);
  for (const s of [-1, 1]) P.add(plain, box(pw, H + 2 * RV, Z1 - Z0 + 0.18, s * (W / 2 + pw / 2), 0, ZC + 0.02));
  // 压顶（墙身上一条，前后各挑出一点）：顶面落亮档 = 墙顶一条亮边
  P.add(cap, box(W, 2 * RV, Z1 - Z0 + 0.04, 0, H, ZC));
  for (const s of [-1, 1]) P.add(cap, box(pw + 0.06, RV, Z1 - Z0 + 0.2, s * (W / 2 + pw / 2), H + 2 * RV, ZC + 0.02));
  // 背后两根扶壁（三角棱柱：贴墙 2.6 米高、往北伸 1.1 米）
  for (const x of [-2.4, 2.4]) {
    const sh = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(1.1, 0), new THREE.Vector2(0, 2.6)]);
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.3, bevelEnabled: false });
    // 形状 x → 往北（−z），y → 高，挤出 → x
    g.rotateY(Math.PI / 2).translate(x - 0.15, 0, Z0);
    P.add(plain, g);
  }
  // ── 墙面上的东西（面前 1 厘米、叠的再前 1 厘米）：都跟墙面一样落暗档（ramp 的第三个 = 暗档色），不再往上偏光 ──
  const zf = Z1 + 0.01;
  const DECAL: ToonOpts = { tones: undefined, edge: 0.4, convex: 0.2, noShadowReceive: true };
  const wallDecal = (ramp: Ramp) => ctx.mat('chainLink', { ...DECAL, ramp });
  // 墙脚一行脏边
  P.add(wallDecal(WALL_FOOT), panel(-W / 2, 0, W, RV, zf));
  // 网高线：0.91 米，一设计行（2 渲染行）。白线落中档（暗墙上的奶油灰，和墙差 < 60）
  P.add(ctx.mat('line', { ...FACE, lightUp: 0.3 }), panel(-W / 2, qy(0.85), W, 2 * RV, zf));
  // 球印磨白的一大块（墙中间偏东，两色硬边：芯偏西北、不同心）
  P.add(wallDecal(WALL_WORN), wallBlob(blob(rnd, 0.7, 1.68, 1.05, 0.6, 10, 0.18), zf));
  P.add(wallDecal(WALL_WORN_CORE), wallBlob(blob(rnd, 0.42, 1.8, 0.55, 0.32, 8, 0.2), zf + 0.01));
  // 两块胶带靶子（方框：横条 2 行、竖条 2 纹素）；东边那块中间贴了一个小方块
  const tape = ctx.mat('toolOrange', FACE);
  const target = (cx: number, cy: number, w: number, h: number, dot: boolean) => {
    const x0 = qx(cx - w / 2);
    const y0 = qy(cy - h / 2);
    const tw = 2 * PX;
    const th = 2 * RV;
    P.add(tape, panel(x0, y0, w, th, zf), panel(x0, y0 + h - th, w, th, zf));
    P.add(tape, panel(x0, y0 + th, tw, h - 2 * th, zf), panel(x0 + w - tw, y0 + th, tw, h - 2 * th, zf));
    if (dot) P.add(tape, panel(qx(cx - 2 * PX), qy(cy - RV), 4 * PX, 3 * RV, zf));
  };
  target(-2.5, 2.05, 16 * PX, 12 * RV, false);
  target(2.9, 1.4, 14 * PX, 10 * RV, true);
  const g = P.group(ctx, 'park-wall', true);
  // 带 uv 的墙面（Parts.group 只留 position + normal）
  const fm = new THREE.Mesh(front, faceMat);
  ctx.mats.prepare(fm);
  fm.castShadow = false;
  fm.userData.noCast = true;
  g.add(fm);
  return g;
}

// ════════════════════════════════════════════════════════════════════════════
// park-wall-court：对墙前的场地 16 × 19（原点 = 场地中心；北沿 z −9.5 = 墙脚）。
// 市政绿漆面（paint 深浅块）+ 离墙 6.4 米一条线 + 墙前中线 + 少年站的地方 (0.8, −1.5) 磨白一块（两色硬边）。
// ════════════════════════════════════════════════════════════════════════════
function parkWallCourt(ctx: AssetCtx): THREE.Object3D {
  const rnd = ctx.rng('park-wall-court');
  const W = 16;
  const D = 19;
  const ZN = -D / 2; // 墙脚
  const P = new Parts();
  P.add(ctx.mat('muniCourt', { elem: TOWN_EL.muniCourt }), flat(-W / 2, W / 2, -D / 2, D / 2, 0.006));
  const line = ctx.mat('line', {});
  const ly = 0.016;
  // 离墙 6.4 米的线（东西向，一设计行 = 2 渲染行深）、墙前中线（南北向，一设计纹素宽）
  const zl = ZN + 6.4;
  P.add(line, flat(-6, 6, zl - RG, zl + RG, ly));
  P.add(line, flat(-T / 2, T / 2, ZN, zl - RG, ly));
  // 他站的地方：(0.8, −1.5) 一块磨白（地上的 v 往北为正）
  const kx = 0.8;
  const kz = -1.5;
  P.add(
    ctx.mat('muniCourt', { ramp: COURT_WORN, tones: undefined }),
    groundBlob(blob(rnd, kx, -kz, 1.25, 0.95, 11, 0.16), 0.016),
  );
  P.add(
    ctx.mat('muniCourt', { ramp: COURT_WORN_CORE, tones: undefined }),
    groundBlob(blob(rnd, kx - 0.28, -kz + 0.22, 0.66, 0.46, 9, 0.2), 0.026),
  );
  // 一道裂缝：从东沿往西北爬，一段段横的（每段 3～7 纹素，换段上 / 下挪一行）—— 缝 + 下沿一行翘起的亮漆
  const crack = ctx.mat('muniCourt', { ramp: COURT_CRACK, tones: undefined });
  const lip = ctx.mat('muniCourt', { ramp: COURT_LIP, tones: undefined });
  let cx = qx(6.6);
  let cz = qy(4.2);
  for (let i = 0; i < 11 && cx > 1.5; i++) {
    const n = 3 + Math.floor(rnd() * 5);
    const x0 = cx - n * PX;
    P.add(crack, flat(x0, cx, cz - RG, cz, 0.016));
    P.add(lip, flat(x0 + PX, cx, cz, cz + RG, 0.016));
    cx = x0;
    cz += (rnd() < 0.7 ? -1 : 1) * RG;
  }
  return P.group(ctx, 'park-wall-court', true);
}

// ════════════════════════════════════════════════════════════════════════════
// 铁丝筐（park-ball-hopper 和 park-kid-gear 共用）：筐壁（透过铁丝的一筐球）+ 筐沿 + 一团荧光黄（球面法线，球顶一圈亮）
// ════════════════════════════════════════════════════════════════════════════
function basket(ctx: AssetCtx, P: Parts, x: number, y: number, z: number, w: number, h: number, heap: number) {
  const wire = ctx.mat('ironwork', {
    ...FACE,
    ramp: [WIRE_T.bands[0][0], WIRE_T.bands[1][0], WIRE_T.bands[2][0]],
    tones: WIRE_T,
    elem: { kind: 'planks', space: 'local', p: [1, 0, 0, 2 * PX], seam: 1, hi: 0 },
    toneW: [0.2, 0.2],
  });
  // 筐沿：镀锌铁（chainLink），每个面都落亮档 —— 和一团荧光黄、筐壁都差 < 60 个亮度（ironwork 的深靛紫、chainLink 的暗档挨着球是强边缘）
  const iron = ctx.mat('chainLink', { ...PROP, bands: [-9, -8] });
  P.add(wire, box(w, h, w, x, y, z));
  // 筐沿：比筐壁宽一点的一圈（顶面在球团四角露出来）
  P.add(iron, box(w + PX, RV, w + PX, x, y + h - RV * 0.5, z));
  // 一团球：上半球压扁（heap = 鼓起多高）
  if (heap > 0) {
    const r = w / 2 - PX * 0.5;
    const top = y + h + RV * 0.5;
    const sph = new THREE.SphereGeometry(r, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2)
      .scale(1, heap / r, 1)
      .translate(x, top - 0.01, z);
    P.add(ctx.mat('ball', { ...PROP, sphereNormals: [x, top - r * 0.6, z], lightUp: 0.2 }), sph);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// park-ball-hopper：铁丝球筐 0.6 × 0.95 × 0.6，两条可折的腿。v0 满（冒尖）、v1 平、v2 冒尖 + 地上滚出来两个、v3 腿收起来当提手（筐落地）
// ════════════════════════════════════════════════════════════════════════════
function parkBallHopper(ctx: AssetCtx): THREE.Object3D {
  const v = ctx.variant % 4;
  const P = new Parts();
  // 腿：镀锌铁，每个面都落亮档（暗档的深靛挨着筐壁、球团是强边缘；细杆本来就靠剪影）
  const iron = ctx.mat('chainLink', { ...PROP, bands: [-9, -8] });
  const w = qx(0.46);
  const h = qy(0.4);
  const legX = w / 2 + PX * 0.5 + 0.035;
  if (v === 3) {
    // 提手模式：筐放地上，两条腿翻上去在筐上面合成一个提手
    basket(ctx, P, 0, 0, 0, w, h, 0.12);
    for (const s of [-1, 1]) P.add(iron, box(0.07, h + 0.34, 0.07, s * legX, 0.02, 0));
    P.add(iron, box(2 * legX + 0.07, 0.06, 0.07, 0, h + 0.36, 0));
  } else {
    const y0 = qy(0.5);
    basket(ctx, P, 0, y0, 0, w, h, v === 1 ? 0.04 : 0.12);
    // 腿：每边一根竖杆（到筐沿）+ 一条落地的脚（南北向）
    for (const s of [-1, 1]) {
      P.add(iron, box(0.07, y0 + h * 0.8, 0.07, s * legX, 0, 0));
      P.add(iron, box(0.07, 0.05, w * 0.95, s * legX, 0, 0));
    }
  }
  if (v === 2) {
    const ball = ctx.mat('ball', { ...PROP, lightUp: 0.3 });
    for (const [bx, bz] of [
      [0.42, 0.28],
      [0.2, 0.46],
    ])
      P.add(ball, new THREE.SphereGeometry(0.04, 5, 2).translate(bx, 0.04, bz));
  }
  return P.group(ctx, 'park-ball-hopper');
}

// ════════════════════════════════════════════════════════════════════════════
// park-kid-gear：少年的红网球包（侧放，一支拍柄从拉链口伸出来）+ 一个铁丝球筐（一团荧光黄），1.2 × 0.8 × 0.7
// ════════════════════════════════════════════════════════════════════════════
function parkKidGear(ctx: AssetCtx): THREE.Object3D {
  const P = new Parts();
  // 包：横躺的胖圆柱（沿 x 0.82 米），截面压成椭圆（宽 > 高），球面法线 → 亮顶、中腰、暗底
  const bx = -0.06;
  const bz = 0.12;
  const r = 0.17;
  const BL = 0.74;
  const bag = new THREE.CylinderGeometry(r, r, BL, 10, 1)
    .rotateZ(Math.PI / 2)
    .scale(1, 0.92, 1.25)
    .translate(bx, r * 0.92, bz);
  P.add(ctx.mat('clothRed', PROP), bag);
  // 一条深色背带搭在包上（一设计纹素宽，横过包顶）
  const strap = new THREE.CylinderGeometry(r + 0.012, r + 0.012, T, 10, 1, true)
    .rotateZ(Math.PI / 2)
    .scale(1, 0.92, 1.25)
    .translate(bx + 0.16, r * 0.92, bz);
  P.add(ctx.mat('ironwork', PROP), strap);
  // 拍柄：从东头伸出来、往上翘一点；柄尾一个粗一点的尾盖
  // 拍柄：从西头的拉链口伸出来、往上翘；柄尾粗一点
  const gx = bx - BL / 2 - 0.1;
  const gy = r * 0.92 + 0.1;
  const grip = new THREE.BoxGeometry(0.26, 2 * PX, 2 * PX).rotateZ(-0.35).translate(gx, gy, bz + 0.04);
  P.add(ctx.mat('ironwork', PROP), grip);
  P.add(ctx.mat('ironwork', PROP), box(0.06, 0.1, 0.1, gx - 0.13, gy + 0.03, bz + 0.04));
  // 铁丝球筐（没有腿，落地）
  basket(ctx, P, 0.38, 0, -0.16, qx(0.36), qy(0.32), 0.1);
  // 地上滚出来两个球
  const ball = ctx.mat('ball', { ...PROP, lightUp: 0.3 });
  P.add(ball, new THREE.SphereGeometry(0.04, 5, 2).translate(0.12, 0.04, 0.28));
  P.add(ball, new THREE.SphereGeometry(0.04, 5, 2).translate(0.5, 0.04, 0.22));
  return P.group(ctx, 'park-kid-gear');
}

// ════════════════════════════════════════════════════════════════════════════
// park-bench：市政长椅 2.0 × 0.9 × 0.7。朝北（坐的人看场里）：靠背在 +z（朝镜头那边），镜头看到的是靠背的背面和座面的北半截。
// 墨绿铸铁的两片侧架 + 三条座板 + 两条靠背板（旧木头，板之间一渲染纹素缝）。
// v0 好的；v1 靠背上面那条板东半截断了；v2 靠背下面那条换过一条新板（深棕）
// ════════════════════════════════════════════════════════════════════════════
function parkBench(ctx: AssetCtx): THREE.Object3D {
  const v = ctx.variant % 3;
  const P = new Parts();
  const L = 1.86;
  // 座板：朝镜头的侧面（板缝里露出来的那一行）落中档，不落暗档（亮板面挨着暗档紫差 > 90 = 一行强边缘）
  const wood = ctx.mat('woodWeathered', {
    ...PROP,
    lightUp: 0.5,
    bands: [-0.45, 0.3],
    elem: { kind: 'paint', size: [12, 2], density: [0, 0] },
    // 木纹只取本色 + 低一级（高一级 L 201 挨着靠背的中档差 > 60）
    toneW: [0, 0.32],
  });
  // 靠背的背面：往南仰，法线朝下一点 → 档位线再往下挪，落中档（不然是暗档的紫，挨着亮的座板是强边缘）
  const woodBack = ctx.mat('woodWeathered', {
    ...FACE,
    lightUp: 0.6,
    bands: [-0.8, 0.2],
    elem: { kind: 'paint', size: [12, 2], density: [0, 0] },
    toneW: [0, 0.32],
    // 描边不提亮上沿（板的上沿提亮一行挨着板缝差 > 60）
    edge: 0.2,
    convex: 0.3,
  });
  const iron = ctx.mat('windscreenOld', { convex: 0.3 });
  // 座板：三条（南北向宽 0.11、缝 0.045），顶面 0.45
  for (const z of [-0.26, -0.105, 0.05]) P.add(wood, box(L, 0.05, 0.11, 0, 0.4, z));
  // 座板底下一块托板（木头的中档）：板缝里、掉了板的地方看到的是它，不是座下的黑影（亮木板挨着黑影差 > 90 = 一行行强边缘）
  P.add(
    ctx.mat('woodWeathered', { ...PROP, ramp: BENCH_UNDER, tones: undefined, bands: [-9, 9] }),
    flat(-L / 2 + 0.12, L / 2 - 0.12, -0.3, 0.1, 0.37),
  );
  // 靠背：两条，往南仰 12°（板之间留 0.1 米：从背后看得见缝里的座板）
  const lean = 0.21;
  const slat = (y: number, m: THREE.Material, len = L, x = 0) =>
    P.add(m, new THREE.BoxGeometry(len, 0.11, 0.045).rotateX(lean).translate(x, y, 0.2 + (y - 0.5) * 0.2));
  slat(0.56, v === 2 ? ctx.mat('parkBrown', { ...FACE, lightUp: 0.6, bands: [-0.8, 0.2] }) : woodBack);
  // v1：上面那条板东半截断掉了（只剩西边 0.8 米钉在侧架上）
  if (v === 1) slat(0.77, woodBack, 0.8, -L / 2 + 0.4);
  else slat(0.77, woodBack);
  // 侧架（铸铁）：前腿 + 座下横档 + 斜着上去的后柱（扶手 / 靠背的骨），一片厚 0.08
  const sh = new THREE.Shape(
    (
      [
        [-0.32, 0],
        [-0.23, 0],
        [-0.23, 0.33],
        [0.12, 0.33],
        [0.1, 0],
        [0.2, 0],
        [0.31, 0.9],
        [0.21, 0.9],
        [0.15, 0.4],
        [-0.32, 0.4],
      ] as [number, number][]
    ).map(([z, y]) => new THREE.Vector2(z, y)),
  );
  for (const s of [-1, 1]) {
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.1, bevelEnabled: false });
    // 形状 x → z（往南），y → 高，挤出 → −x
    g.rotateY(-Math.PI / 2).translate(s * (L / 2 - 0.1) + 0.05, 0, 0);
    P.add(iron, g);
  }
  return P.group(ctx, 'park-bench');
}

// ════════════════════════════════════════════════════════════════════════════
// park-trash：市政垃圾桶 0.6 × 0.95 × 0.6：墨绿铁皮桶（竖条）+ 镀锌的盖沿（一圈亮）+ 墨绿的穹顶盖、中间投口（暗）。
// v0 好的；v1 塞满了（投口冒出一截白垃圾袋）
// ════════════════════════════════════════════════════════════════════════════
function parkTrash(ctx: AssetCtx): THREE.Object3D {
  const v = ctx.variant % 2;
  const P = new Parts();
  // 桶身：朝镜头的那半圈落亮档、两边中档（太阳在后面，照默认整个桶是暗档的墨黑一条）
  const green = ctx.mat('windscreenOld', {
    convex: 0.2,
    lightUp: 0.5,
    bands: [-0.5, 0.05],
    elem: { kind: 'planks', space: 'local', p: [1, 0, 0, 3 * PX], seam: 1, hi: 0.4 },
  });
  const N = 10;
  P.add(green, new THREE.CylinderGeometry(0.27, 0.25, 0.8, N, 1, true).translate(0, 0.4, 0));
  // 盖沿：镀锌一圈
  // 盖沿：镀锌的亮一圈，但亮档压到 L 158（chainLink 的 176 挨着投口的暗色差 > 60 = 强边缘）
  const rim = ctx.mat('chainLink', { ...PROP, edge: 0.5, ramp: TRASH_RIM, tones: undefined, bands: [-9, -8] });
  P.add(rim, new THREE.CylinderGeometry(0.3, 0.3, RV * 1.2, N, 1, true).translate(0, 0.8 + RV * 0.6, 0));
  // 盖沿顶上一圈亮（环面朝上）
  P.add(rim, new THREE.RingGeometry(0.22, 0.3, N, 1).rotateX(-Math.PI / 2).translate(0, 0.8 + RV * 1.2, 0));
  // 穹顶盖（墨绿，平截锥）+ 投口（暗）
  const top = 0.8 + RV * 1.2;
  P.add(
    ctx.mat('windscreenOld', { convex: 0.2 }),
    new THREE.CylinderGeometry(0.14, 0.23, 0.1, 8, 1, true).translate(0, top + 0.05, 0),
  );
  // 投口：墨绿的中档（看进去是暗的，但不是黑洞）
  P.add(
    ctx.mat('windscreenOld', { ...PROP, bands: [-9, 9] }),
    new THREE.CircleGeometry(0.14, 8).rotateX(-Math.PI / 2).translate(0, top + 0.1, 0),
  );
  if (v === 1) {
    // 塞满了：投口冒出一截垃圾袋（clothWhite 的暗档灰紫：亮档的白挨着墨绿投口差 > 100 = 一圈强边缘）
    const bag = new THREE.SphereGeometry(0.13, 6, 2).scale(1, 0.6, 0.9).translate(0.02, top + 0.11, 0.01);
    P.add(ctx.mat('clothWhite', { ...PROP, bands: [9, 10] }), bag);
  }
  return P.group(ctx, 'park-trash');
}

// ════════════════════════════════════════════════════════════════════════════
// park-racquet-queue：挂在南围网上的"排队挂拍处" 3.2 × 2.6 × 0.2（原点 = 围网面上、中间；z 0 = 贴着围网）。
// 一根挂钩横杆 + 三支挂着的拍子（红 / 蓝 / 黄 = 三个人在排，一支挂得低一点）+ 上面一块手写木牌（两行粉笔字）。
// ════════════════════════════════════════════════════════════════════════════
function parkRacquetQueue(ctx: AssetCtx): THREE.Object3D {
  const P = new Parts();
  // 铁件（横杆、挂钩、手胶、铁丝）：每个面都落 ironwork 的亮档（L 107）—— 中档 L 63 挨着弦面、黄拍框差 > 60
  const iron = ctx.mat('ironwork', { ...FACE, bands: [-9, -8] });
  // 横杆 + 三个挂钩
  const barY = qy(1.6);
  // 横杆：只要朝南的一条（贴着围网，背面、两头看不见；顶面一行亮档挨着中档是强边缘）
  P.add(iron, panel(-1.3, barY, 2.6, 2 * RV, 0.075));
  // 拍框的档：红 / 蓝落亮档（中档 L 78 太暗，挨着灰弦面差 > 60），黄落中档（亮档 L 214 挨着弦面差 > 60）
  const LIT: ToonOpts = { ...FACE, bands: [-9, -8] };
  const MID: ToonOpts = { ...FACE, bands: [-9, 9] };
  const hooks: [number, PalKey, number, ToonOpts][] = [
    [-0.9, 'clothRed', 0, LIT],
    [0, 'clothBlue', -2 * RV, LIT],
    [0.9, 'flowerYellow', 0, MID],
  ];
  // 弦面：浅灰（line 的奶油白挨着红 / 蓝拍框差 > 100 = 一圈强边缘；远看弦面本来就是灰的）
  const strings = ctx.mat('chainLink', FACE);
  for (const [hx, key, dy, fo] of hooks) {
    const x = qx(hx);
    P.add(iron, panel(x - PX / 2, barY - 2 * RV + dy, PX, 3 * RV - dy, 0.085));
    // 拍头：椭圆框（外 0.3 × 0.4、框一渲染纹素 / 一行）+ 弦面
    const top = barY - 2 * RV + dy;
    const hw = 0.16;
    const hh = 0.34;
    const cy = top - hh;
    const frame = ctx.mat(key, fo);
    P.add(frame, new THREE.CircleGeometry(1, 10).scale(hw, hh, 1).translate(x, cy, 0.09));
    P.add(strings, new THREE.CircleGeometry(1, 10).scale(hw - 1.5 * PX, hh - 1.5 * RV, 1).translate(x, cy, 0.1));
    // 柄（2 渲染纹素宽，深色手胶），直接接在拍头下沿
    P.add(iron, panel(x - PX, cy - hh - 0.26 + 0.02, 2 * PX, 0.26, 0.09));
  }
  // 木牌：2.5 × 0.82，横板（每 0.2 米一条缝）+ 两行粉笔字
  const by0 = qy(1.78);
  const bh = qy(0.82);
  // 木牌：朝南的面 + 顶上一条板厚（背面贴着围网看不见）
  const board = ctx.mat('parkBrown', { ...FACE, elem: TOWN_EL.parkBrown });
  P.add(board, panel(-1.25, by0, 2.5, bh, 0.06), flat(-1.25, 1.25, 0.02, 0.06, by0 + bh));
  // 字（G4）：原来两行 3×5 粉笔字"WINNERS STAY / HANG RACKET"在游戏里是一小团粉色噪点（0.045 米一格 = 1.33 纹素，笔画时宽时窄）
  // → 只留一个词 + 一个箭头："NEXT ↓"（下一局的拍子挂这儿）。5×7 的字，一格 = 游戏里正好 1 纹素（0.03375 米 × 一屏幕行），笔画 1 纹素
  const chalk = ctx.mat('signPaint', FACE);
  const zt = 0.04 + 0.02 + 0.006;
  P.add(chalk, bigText('NEXT', -0.24, by0 + qy((0.82 - 7 * GR) / 2), zt));
  P.add(chalk, bigText('V', 0.42, by0 + qy((0.82 - 7 * GR) / 2), zt));
  // 两根挂木牌的铁丝（木牌顶两角往上 0.1 米）
  for (const s of [-1, 1]) P.add(iron, panel(s * 1.05 - PX / 2, by0 + bh, PX, 2 * RV, 0.03));
  return P.group(ctx, 'park-racquet-queue', true);
}

export const ASSETS: Record<string, AssetFn> = {
  'park-wall': parkWall,
  'park-wall-court': parkWallCourt,
  'park-kid-gear': parkKidGear,
  'park-racquet-queue': parkRacquetQueue,
  'park-bench': parkBench,
  'park-trash': parkTrash,
  'park-ball-hopper': parkBallHopper,
};

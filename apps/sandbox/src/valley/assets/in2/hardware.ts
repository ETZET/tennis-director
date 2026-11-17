// 第二版店内的资产（id 以 in2-hw- 开头），归 hardware 店内代理。本地原点 = 落地点中心（墙上的东西 = 正面底边中心），y 0 = 地面，+z 朝镜头（朝南），单位米。
// 五金大超市 v2（参考 Sneaky Sasquatch 的店内：镜头近、东西少而大、每件下面挂价签、分区大字条）。interiors/v2/hardware.ts 摆。
//
// 店里镜头 ≈ 0.02 米/纹素（v1 的 0.45 倍）：1 米 ≈ 50 纹素，所以"线"按 2～3 纹素（4～6 厘米）画，元素尺寸按这个尺度给。
// 店里的光（valley/main.ts 的 INDOOR_LOOK）：顶灯仰角 65°、方位 15°，不投影 → 朝上的面亮档、朝南（朝镜头）的竖面要靠 lightUp 落中档，
// 所以每个材质的**中档 = 正面的颜色**（手挑），亮档 = 顶面，暗档（冷）= 背光的侧面。
// 可买的东西：每个资产自己挂价签（kit.priceTag），userData.items = [{ id, name, price, x, y, z }]（本地坐标，y = 价签底边高），场景按摆放换算成 ITEMS。
// 配色（店内配色重做 + 用户选的地面）：深灰绿环氧地坪、浅灰绿的漆面砌块墙 + 深青灰墙裙 + 芥末黄腰线、海军蓝立柱 + 芥末黄横梁（品牌色）；
// 大字条 = 海军蓝底 + 芥末黄字（不学参考图家具大卖场的"深蓝波纹墙 + 黄底黑字大招牌"：墙是浅色砌块、招牌是货架上的一条条横条）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { box } from '../../../clubsite/render/geo';
import type { Elem, Tones, ToonOpts } from '../../../clubsite/render/toon';
import type { AssetCtx, AssetFn } from '../../ctx';
import { fascia, floorLabel, priceTag } from '../../interiors/v2/kit';
import type { PalKey } from '../../palette';

// ════════════════════════════ 材质 ════════════════════════════

type C3 = [number, number, number];
/** tn(亮, 中, 暗, 缝, 亮边)：每档 [本色, 高一级, 低一级] */
const tn = (lit: C3, mid: C3, dark: C3, seam: C3, hi: C3): Tones => ({ bands: [lit, mid, dark], seam, hi });

/**
 * 新材质（手挑 3 档 × 3 色；L = 0.2126R + 0.7152G + 0.0722B；暗档往冷走）。key = 借哪个老材质名过午后调色（组）。
 * 正面（朝南的竖面）落中档、顶面亮档、背光侧面暗档。
 */
const SW = {
  /** 深灰绿环氧地坪（用户选的；同第一版的色）：地永远落中档（bands [−2, 2]）。元素 = 很淡的大块深浅斑 + 擦痕 */
  floor: {
    key: 'roofMetal',
    ramp: [0x5a7a6c, 0x006a6e, 0x34483e],
    tones: tn(
      [0x5a7a6c, 0x628274, 0x527264],
      [0x006a6e, 0x06706f, 0x00646a], // L 84 / 88 / 80（环氧是平的，斑很淡）
      [0x34483e, 0x3a4e44, 0x2e4238],
      [0x40584c, 0x005a5e, 0x283a32], // 擦痕：−12
      [0x6e8e80, 0x0e7a7c, 0x40564a],
    ),
  },
  /** 地面切缝（4 米一道，2 纹素宽，比地暗 ~16） */
  joint: { key: 'roofMetal', ramp: [0x004a50, 0x004a50, 0x223430] },
  /**
   * 墙：淡青瓷绿的漆面砌块（店里最大的亮面，衬托货架上的东西）。中档 = 正面（L 190），亮档 = 墙顶，暗档 = 冷灰蓝。
   * 元素 = 一皮一皮的砌块（planks 横向，每 0.2 米一道缝，缝 −14）
   */
  wall: {
    key: 'signBoard',
    ramp: [0xb8e6d0, 0x8ccfb0, 0x5a7a90],
    tones: tn(
      [0xb8e6d0, 0xc2ecd8, 0xaedcc6],
      [0x8ccfb0, 0x96d4b8, 0x84c6a8], // L 190 / 196 / 182（淡青瓷绿：S ≈ 0.32，和深地同一家、比外景的灰泥白冷得多）
      [0x5a7a90, 0x628298, 0x527288],
      [0xa2d8c0, 0x78ba9c, 0x4a6a80], // 缝 −14
      [0xd0f4e2, 0xa8e0c6, 0x6e8ea4],
    ),
  },
  /** 墙裙：深青灰（墙下 1.2 米，挡脏；和地拉开一点：更灰更蓝） */
  dado: {
    key: 'signBoard',
    ramp: [0x4a7a86, 0x2e5c68, 0x22364e],
    tones: tn(
      [0x4a7a86, 0x52828e, 0x44727e],
      [0x2e5c68, 0x366470, 0x285460], // L 80（深青，S ≈ 0.55）
      [0x22364e, 0x283c54, 0x1e3048],
      [0x3e6e7a, 0x224c58, 0x182a40],
      [0x5e909c, 0x427280, 0x30465e],
    ),
  },
  /** 镀锌钢、卷帘门板、平板车面：冷的浅灰 */
  steel: {
    key: 'metal',
    ramp: [0xcce0ee, 0x96b8d0, 0x566a88],
    tones: tn(
      [0xcce0ee, 0xd4e6f2, 0xc2d8e6],
      [0x96b8d0, 0x9ec0d6, 0x8cb0c8], // L 179（冷的钢蓝灰，S ≈ 0.28）
      [0x5e6a80, 0x667288, 0x566278],
      [0xc8d0d4, 0x98a4ac, 0x4c586e], // 门板缝 −20
      [0xf0f2f2, 0xccd6da, 0x76829a],
    ),
  },
  /** 黑橡胶、轮子、座椅、黑塑料（喷头） */
  rubber: { key: 'ironwork', ramp: [0x5a5a66, 0x3a3a46, 0x22222e] },
  /** 托盘木（落中档，浅木在深地上不出强边缘） */
  pallet: {
    key: 'timber',
    ramp: [0xcaa070, 0xa88458, 0x5e4c62],
    tones: tn(
      [0xcaa070, 0xd2a878, 0xc09868],
      [0xa88458, 0xb08c60, 0x9c7a50], // L 136
      [0x5e4c62, 0x665468, 0x564458],
      [0xb48a5c, 0x7a5c40, 0x46384c], // 板缝 −32（看得出一条条板）
      [0xdcb684, 0xbc9868, 0x705e72],
    ),
  },
  /** 木方（2×4）：比托盘浅、偏黄 */
  timber: {
    key: 'timber',
    ramp: [0xe8c48a, 0xc8a06a, 0x6a5670],
    tones: tn(
      [0xe8c48a, 0xeecc94, 0xdeba80],
      [0xc8a06a, 0xd0a872, 0xbc9462],
      [0x6a5670, 0x725e78, 0x624e68],
      [0xd0aa74, 0x947048, 0x4e3e58],
      [0xf6d6a0, 0xd8b47e, 0x7e6a84],
    ),
  },
  /** 红土补土沙的袋子、整托（缩包）：陶红 */
  clay: {
    key: 'tile',
    ramp: [0xe8855a, 0xc4603e, 0x6e3a52],
    tones: tn(
      [0xe8855a, 0xee9066, 0xdc7a50],
      [0xc4603e, 0xcc6a46, 0xb85838], // L 117
      [0x6e3a52, 0x76425a, 0x66344c],
      [0xd47450, 0x9c4a34, 0x562c44], // 袋与袋的缝 −22
      [0xf6a078, 0xd87a56, 0x844e66],
    ),
  },
  /** 白：桶、PVC 管、白粉袋、调色机 */
  white: {
    key: 'pvc',
    ramp: [0xf4f2ec, 0xd6d8d6, 0x8a90a8],
    tones: tn(
      [0xf4f2ec, 0xfaf8f2, 0xeae8e2],
      [0xd6d8d6, 0xdcdedc, 0xccd0ce],
      [0x8a90a8, 0x9298b0, 0x8288a0],
      [0xe2e2de, 0xb6bab8, 0x767c96],
      [0xffffff, 0xe8eae8, 0x9ca2ba],
    ),
  },
  /** 洞洞板 / 零件墙底板：很浅的冷灰（比墙亮一点，东西衬在上面） */
  board: {
    key: 'signBoard',
    ramp: [0xeef0ea, 0xd2d8d2, 0x7c8698],
    tones: tn(
      [0xeef0ea, 0xf4f6f0, 0xe6e8e2],
      [0xd2d8d2, 0xd8ded8, 0xc8cec8],
      [0x7c8698, 0x848ea0, 0x747e90],
      [0xdcdfda, 0xb6bcb8, 0x6a7486],
      [0xffffff, 0xe2e6e2, 0x8e98aa],
    ),
  },
  /** 柜台面（浅灰的耐磨板） */
  counterTop: { key: 'signBoard', ramp: [0xb0e4cc, 0x7cc8a8, 0x587890] },
  /** 俱乐部青绿（划线漆、网柱）：俱乐部的颜色 */
  teal: { key: 'clothTeal', ramp: [0x3cc4ae, 0x22968a, 0x1e5466] },
  /** 绿：喷头盖、阀门、水管 */
  green: { key: 'green', ramp: [0x8ad65a, 0x52a84a, 0x2e5e52] },
  /** 挡风网、球网：深绿 */
  netGreen: { key: 'windscreen', ramp: [0x3a8a64, 0x24684e, 0x1a3c40] },
  /** 黄铜（接头、摇臂喷头） */
  brass: { key: 'flowerYellow', ramp: [0xf2cc5c, 0xc89a36, 0x6e5650] },
  /** 红：独轮车斗、喷嘴 */
  red: { key: 'flowerRed', ramp: [0xf06a5a, 0xc8443e, 0x6a2c4a] },
  /** 蓝：定时器、喷嘴 */
  blue: { key: 'clothBlue', ramp: [0x5aa0f0, 0x3a70c8, 0x24366e] },
  /** 橙：喷嘴、警示灯 */
  orange: { key: 'toolOrange', ramp: [0xffa040, 0xe0702a, 0x7a3a3c] },
  /** 紫：回用水的喷头盖 */
  purple: { key: 'flowerPurple', ramp: [0xb08ae0, 0x8460c0, 0x44306e] },
  /** 屏幕：深青（亮着的收银机、定时器、电脑） */
  screen: { key: 'signBoard', ramp: [0x5ad0c8, 0x2a8c98, 0x163a50] },
} as const satisfies Record<string, { key: PalKey; ramp: C3; tones?: Tones }>;
export type HwSwatch = keyof typeof SW;

/** 正面（朝南）落中档、顶面亮档的默认参数（SIGN_FACE 一类） */
const FACE: ToonOpts = { lightUp: 0.55, bands: [-0.4, 0.3], noShadowReceive: true, edge: 0.5, convex: 0.3 };

/** 材质缓存：同一个 mats（一个场景 / 画廊）+ 同参数 → 同一份（店里整屋合并成一种材质一个网格） */
const CACHE = new WeakMap<object, Map<string, THREE.MeshToonMaterial>>();
function cached(ctx: AssetCtx, key: PalKey, opts: ToonOpts): THREE.MeshToonMaterial {
  let m = CACHE.get(ctx.mats);
  if (!m) {
    m = new Map();
    CACHE.set(ctx.mats, m);
  }
  const k = `${key}|${JSON.stringify(opts)}`;
  let mat = m.get(k);
  if (!mat) {
    mat = ctx.mat(key, opts);
    m.set(k, mat);
  }
  return mat;
}
/** 一个新材质（SW 表）+ 额外参数 */
export function hwMat(ctx: AssetCtx, name: HwSwatch, extra: ToonOpts = {}): THREE.Material {
  const s = SW[name] as { key: PalKey; ramp: C3; tones?: Tones };
  return cached(ctx, s.key, { ...FACE, ramp: s.ramp, ...(s.tones ? { tones: s.tones } : {}), ...extra });
}
/** 老材质名（海军蓝、芥末黄）+ 额外参数，也走缓存 */
export function palMat(ctx: AssetCtx, key: PalKey, extra: ToonOpts = {}): THREE.Material {
  return cached(ctx, key, extra);
}
/** 给 kit 用的上下文：kit 里的 ctx.mat 也走缓存（整屋合并时价签、字条共用一份材质） */
export function cachedCtx(ctx: AssetCtx): AssetCtx {
  return { ...ctx, mat: (key, extra) => cached(ctx, key, extra ?? {}) };
}

/** 店里常用的几种 */
function mats(ctx: AssetCtx) {
  return {
    navy: palMat(ctx, 'hwNavy', { lightUp: 0.5, bands: [-0.4, 0.3], convex: 0.3, noShadowReceive: true }),
    mustard: palMat(ctx, 'hwMustard'),
    steel: hwMat(ctx, 'steel'),
    rubber: hwMat(ctx, 'rubber', { convex: 0.2 }),
    white: hwMat(ctx, 'white'),
    board: hwMat(ctx, 'board', { edge: 0.3, convex: 0.1 }),
    /** 大字条的底和字 */
    signBg: palMat(ctx, 'hwNavy', { lightUp: 0.55, bands: [-0.4, 0.3], noShadowReceive: true }),
    signInk: palMat(ctx, 'hwMustard'),
  };
}

// ════════════════════════════ 几何小工具 ════════════════════════════

type Part = [THREE.BufferGeometry, THREE.Material];
/** 收集几何（本地坐标） */
class Kit {
  parts: Part[] = [];
  add(g: THREE.BufferGeometry, m: THREE.Material) {
    this.parts.push([g, m]);
    return g;
  }
  /** 盒子：中心 x z、底 y */
  bx(m: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number) {
    return this.add(box(w, h, d, x, y, z), m);
  }
  /** 立着的圆柱（底 y） */
  cyl(m: THREE.Material, r0: number, r1: number, h: number, x: number, y: number, z: number, n = 12) {
    return this.add(new THREE.CylinderGeometry(r0, r1, h, n, 1).translate(x, y + h / 2, z), m);
  }
  /** 横放的圆柱（沿 x 或 z），中心 (x, y, z) */
  lie(m: THREE.Material, axis: 'x' | 'z', r: number, len: number, x: number, y: number, z: number, n = 10) {
    const g = new THREE.CylinderGeometry(r, r, len, n, 1);
    if (axis === 'x') g.rotateZ(Math.PI / 2);
    else g.rotateX(Math.PI / 2);
    return this.add(g.translate(x, y, z), m);
  }
  /** 朝 +z 的薄片（中心 x y z） */
  face(m: THREE.Material, w: number, h: number, x: number, y: number, z: number) {
    return this.add(new THREE.PlaneGeometry(w, h).translate(x, y, z), m);
  }
  /** 朝上的平面 */
  flat(m: THREE.Material, x0: number, z0: number, x1: number, z1: number, y: number) {
    return this.add(
      new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2).translate((x0 + x1) / 2, y, (z0 + z1) / 2),
      m,
    );
  }
  /** 甜甜圈（水管卷）：躺平（轴朝上）或立着（轴朝 +z） */
  torus(m: THREE.Material, R: number, r: number, x: number, y: number, z: number, upright = false) {
    const g = new THREE.TorusGeometry(R, r, 6, 16);
    if (!upright) g.rotateX(Math.PI / 2);
    return this.add(g.translate(x, y, z), m);
  }
}

/** 只留 position / normal、去索引（不同来源的几何才合得上） */
function plain(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const ng = g.index ? g.toNonIndexed() : g;
  for (const a of Object.keys(ng.attributes)) if (a !== 'position' && a !== 'normal') ng.deleteAttribute(a);
  return ng;
}

/** 可买的一件：本地坐标，y = 价签底边 */
export interface HwItem {
  id: string;
  name: string;
  price: number;
  x: number;
  y: number;
  z: number;
  /** 挤的地方用小号价签（kit 的 sm：牌高 0.31） */
  sm?: boolean;
}

/** kit 的几何按材质合成网格（一种材质一个网格），加上价签（kit.priceTag）和 items；店里没有投影 → 全部 noCast */
function finish(ctx: AssetCtx, k: Kit, name: string, items: HwItem[] = [], extra: THREE.Object3D[] = []): THREE.Group {
  const g = new THREE.Group();
  g.name = `valley-asset:${name}`;
  const by = new Map<THREE.Material, THREE.BufferGeometry[]>();
  for (const [geo, m] of k.parts) by.set(m, [...(by.get(m) ?? []), plain(geo)]);
  for (const [m, list] of by) {
    const merged = mergeGeometries(list);
    if (!merged) continue;
    g.add(new THREE.Mesh(merged, m));
  }
  const kc = cachedCtx(ctx);
  for (const it of items) {
    const t = priceTag(kc, it.price, { size: it.sm ? 'sm' : 'md' });
    t.position.set(it.x, it.y, it.z);
    g.add(t);
  }
  for (const o of extra) g.add(o);
  ctx.mats.prepare(g, { cast: false, receive: false });
  g.traverse((o) => {
    o.userData.noCast = true;
    o.castShadow = false;
  });
  g.userData.items = items;
  return g;
}

/** 大字条（kit.fascia，海军蓝底芥末黄字）：底边中心 (x, y, z) */
function sign(ctx: AssetCtx, text: string, w: number, h: number, x: number, y: number, z: number): THREE.Object3D {
  const M = mats(ctx);
  const f = fascia(cachedCtx(ctx), text, { w, h, bg: M.signBg, ink: M.signInk });
  f.position.set(x, y, z);
  return f;
}

/** 托盘（1.2 × 1.0 × 0.15）：面板 + 三根垫木（正面看得见缝） */
function pallet(ctx: AssetCtx, k: Kit, x: number, y: number, z: number, w = 1.2, d = 1.0) {
  const wood = hwMat(ctx, 'pallet', { elem: { kind: 'planks', space: 'local', p: [1, 0, 0, 0.16], seam: 2, hi: 0.3 } });
  const dark = hwMat(ctx, 'pallet', { lightUp: 0, bands: [2, 3] });
  k.bx(wood, w, 0.04, d, x, y + 0.11, z);
  for (const s of [-1, 0, 1]) k.bx(wood, 0.12, 0.11, d, x + s * (w / 2 - 0.06), y, z);
  // 垫木之间的暗缝（正面看是两个黑洞）
  k.bx(dark, w - 0.3, 0.09, d - 0.04, x, y + 0.01, z);
}

/** 一摞袋子（2 × 2 × n 层，每袋 0.54 × 0.14 × 0.44，袋与袋错一点） */
function bagStack(k: Kit, m: THREE.Material, x: number, y: number, z: number, layers: number, rnd: () => number) {
  for (let l = 0; l < layers; l++)
    for (let i = 0; i < 2; i++)
      for (let j = 0; j < 2; j++) {
        const dx = (rnd() - 0.5) * 0.04;
        const dz = (rnd() - 0.5) * 0.04;
        k.bx(m, 0.54, 0.13, 0.44, x + (i - 0.5) * 0.56 + dx, y + l * 0.14, z + (j - 0.5) * 0.46 + dz);
      }
}

/** 5 加仑的桶（桶身 + 盖 + 一道箍） */
function pail(k: Kit, body: THREE.Material, lid: THREE.Material, x: number, y: number, z: number, r = 0.15, h = 0.38) {
  k.cyl(body, r * 0.92, r, h - 0.03, x, y, z, 14);
  k.cyl(lid, r * 1.02, r * 1.02, 0.04, x, y + h - 0.04, z, 14);
  k.cyl(lid, r * 1.01, r * 1.01, 0.03, x, y + h * 0.42, z, 14);
}

// ════════════════════════════ 地、墙 ════════════════════════════

/** 地上的漆（局部米）：车道边线（横平竖直的折线两边）、实心黄条 */
export interface HwFloorMarks {
  /** 实心黄条 [x0, z0, x1, z1] */
  lines?: [number, number, number, number][];
  /** 叉车道：中线折线，两边各一条 0.08 米的黄线，离中线 half */
  lanes?: { pts: [number, number][]; half: number }[];
}

/**
 * in2-hw-floor：深灰绿环氧地坪（原点 = 局部原点，x 0…w、z 0…d），4 米一道切缝（2 纹素），安全黄标线。
 * 盖在框架的地板上面（y 0.03，不共面）；地上的字框（kit.floorLabel）场景放在 y 0.035。
 */
export function hwFloor(ctx: AssetCtx, w: number, d: number, marks: HwFloorMarks = {}): THREE.Group {
  const k = new Kit();
  const floorEl: Elem = { kind: 'paint', size: [60, 36], density: [0.004, 0.03], patch: 6 };
  const floor = hwMat(ctx, 'floor', { edge: 0.05, convex: 0, bands: [-2, 2], toneW: [0.22, 0.22], elem: floorEl });
  const joint = hwMat(ctx, 'joint', { edge: 0, convex: 0, bands: [-2, 2] });
  // 安全黄：芥末黄落中档（L ~143，和地差 < 60，不出强边缘）
  const yellow = palMat(ctx, 'hwMustard', { lightUp: 0, bands: [-2, 2], edge: 0.05, convex: 0, noShadowReceive: true });
  const Y = 0.03;
  k.flat(floor, 0, 0, w, d, Y);
  const J = 0.04;
  for (let x = 4; x < w - 0.5; x += 4) k.flat(joint, x - J / 2, 0, x + J / 2, d, Y + 0.002);
  for (let z = 4; z < d - 0.5; z += 4) k.flat(joint, 0, z - J / 2, w, z + J / 2, Y + 0.002);
  const y2 = Y + 0.004;
  for (const [x0, z0, x1, z1] of marks.lines ?? []) k.flat(yellow, x0, z0, x1, z1, y2);
  const LW = 0.08;
  for (const { pts, half } of marks.lanes ?? [])
    for (let i = 0; i + 1 < pts.length; i++) {
      const [ax, az] = pts[i];
      const [bx, bz] = pts[i + 1];
      if (ax === bx) {
        for (const s of [-1, 1]) {
          const x = ax + s * half;
          k.flat(yellow, x - LW / 2, Math.min(az, bz), x + LW / 2, Math.max(az, bz), y2);
        }
      } else {
        for (const s of [-1, 1]) {
          const z = az + s * half;
          k.flat(yellow, Math.min(ax, bx), z - LW / 2, Math.max(ax, bx), z + LW / 2, y2);
        }
      }
    }
  return finish(ctx, k, 'in2-hw-floor');
}

/**
 * in2-hw-wall：北墙里面的一层皮（原点 = 墙面底边的西端，沿 +x 长 len）：浅灰绿漆面砌块（一皮 0.2 米）、下面 1.2 米深青灰墙裙、
 * 墙裙顶一道 0.12 米的芥末黄腰线、顶上一条海军蓝压顶。gaps = 不画的段（门洞）[x0, x1]。
 */
export function hwWall(ctx: AssetCtx, len: number, h: number, gaps: [number, number][] = []): THREE.Group {
  const k = new Kit();
  const M = mats(ctx);
  const wall = hwMat(ctx, 'wall', {
    edge: 0.2,
    convex: 0,
    toneW: [0.12, 0.12],
    elem: { kind: 'planks', space: 'local', p: [0, 1, 0, 0.2], seam: 1, hi: 0.25 },
  });
  const dado = hwMat(ctx, 'dado', {
    edge: 0.2,
    convex: 0,
    toneW: [0.1, 0.1],
    elem: { kind: 'planks', space: 'local', p: [1, 0, 0, 1.2], seam: 2, hi: 0 },
  });
  const DADO = 1.2;
  // 把 [0, len] 按 gaps 切成几段
  const segs: [number, number][] = [];
  let x = 0;
  for (const [a, b] of [...gaps].sort((p, q) => p[0] - q[0])) {
    if (a > x) segs.push([x, a]);
    x = Math.max(x, b);
  }
  if (x < len) segs.push([x, len]);
  for (const [a, b] of segs) {
    const w = b - a;
    const cx = (a + b) / 2;
    k.face(dado, w, DADO, cx, DADO / 2, 0.02);
    k.bx(M.mustard, w, 0.12, 0.04, cx, DADO, 0.0);
    k.face(wall, w, h - DADO - 0.12 - 0.2, cx, DADO + 0.12 + (h - DADO - 0.32) / 2, 0.02);
    k.bx(M.navy, w, 0.2, 0.06, cx, h - 0.2, 0.0);
  }
  return finish(ctx, k, 'in2-hw-wall');
}

// ════════════════════════════ COURT SUPPLY 高货架（H2） ════════════════════════════

/** 高货架的尺寸：每跨宽、深、高、上层横梁高 */
export const HW_RACK = { bay: 3.3, d: 1.3, h: 4.3, beam: 2.2, top: 4.05 } as const;

type RackGood = 'clayBags' | 'netRolls' | 'windscreen' | 'lineTape' | 'clayPallet' | 'paintPails' | 'powderBags';
/** 每跨：下层（顾客拿）、上层（叉车取）各一样，每样两托并排 */
export const HW_RACK_GOODS: { low: RackGood; up: RackGood }[] = [
  { low: 'clayBags', up: 'clayPallet' },
  { low: 'netRolls', up: 'paintPails' },
  { low: 'windscreen', up: 'powderBags' },
  { low: 'lineTape', up: 'clayPallet' },
];
const GOOD_INFO: Record<RackGood, { name: string; price: number }> = {
  clayBags: { name: '红土补土沙（袋，50 磅）', price: 18 },
  netRolls: { name: '比赛球网', price: 260 },
  windscreen: { name: '挡风网（卷，18 米）', price: 180 },
  lineTape: { name: '球场划线带（卷）', price: 45 },
  clayPallet: { name: '红土补土沙（整托，40 袋）— 叉车取', price: 540 },
  paintPails: { name: '硬地球场面漆（整托，12 桶）— 叉车取', price: 960 },
  powderBags: { name: '红土场划线白粉（整托）— 叉车取', price: 220 },
};

/** 一托货：中心 (x, y, z) 落在托盘面上（y = 托盘底） */
function rackLoad(ctx: AssetCtx, k: Kit, good: RackGood, x: number, y: number, z: number, rnd: () => number) {
  const M = mats(ctx);
  pallet(ctx, k, x, y, z);
  const top = y + 0.15;
  switch (good) {
    case 'clayBags': {
      const bag = hwMat(ctx, 'clay', {
        elem: { kind: 'paint', size: [18, 10], density: [0, 0.02] },
        toneW: [0.3, 0.3],
      });
      bagStack(k, bag, x, top, z, 9, rnd);
      break;
    }
    case 'clayPallet':
    case 'powderBags': {
      // 缩包的一整托：一块，横向一道道袋缝
      const m = hwMat(ctx, good === 'clayPallet' ? 'clay' : 'white', {
        elem: { kind: 'planks', space: 'local', p: [0, 1, 0, 0.15], seam: 2, hi: 0.5 },
        toneW: [0.25, 0.25],
      });
      k.bx(m, 1.12, 0.92, 0.92, x, top, z);
      // 顶上一张托盘标签（白）
      k.bx(M.white, 0.3, 0.02, 0.2, x - 0.3, top + 0.92, z + 0.2);
      break;
    }
    case 'netRolls': {
      // 三卷球网（深绿卷 + 白网带），两卷在下一卷在上
      const net = hwMat(ctx, 'netGreen', { lightUp: 0.4, bands: [-0.2, 0.45] });
      const tape = hwMat(ctx, 'white', { lightUp: 0.4, bands: [-0.2, 0.45] });
      for (const [dx, dy] of [
        [-0.26, 0],
        [0.26, 0],
        [0, 0.44],
      ] as const) {
        k.lie(net, 'z', 0.22, 0.9, x + dx, top + 0.22 + dy, z, 12);
        k.lie(tape, 'z', 0.225, 0.08, x + dx, top + 0.22 + dy, z + 0.25, 12);
        k.lie(tape, 'z', 0.225, 0.08, x + dx, top + 0.22 + dy, z - 0.25, 12);
      }
      break;
    }
    case 'windscreen': {
      // 两卷立着的挡风网（深绿大卷 + 两道黑带）
      const net = hwMat(ctx, 'netGreen', { lightUp: 0.4, bands: [-0.2, 0.45] });
      for (const dx of [-0.29, 0.29]) {
        k.cyl(net, 0.27, 0.27, 1.55, x + dx, top, z, 14);
        for (const h of [0.35, 1.15]) k.cyl(M.rubber, 0.28, 0.28, 0.06, x + dx, top + h, z, 14);
      }
      break;
    }
    case 'lineTape': {
      // 一卷卷白色划线带（躺平的白环），2 × 2 摞，每摞 6 卷
      const tape = hwMat(ctx, 'white', { lightUp: 0.4, bands: [-0.2, 0.45] });
      for (const [dx, dz] of [
        [-0.28, -0.24],
        [0.28, -0.24],
        [-0.28, 0.24],
        [0.28, 0.24],
      ] as const)
        for (let l = 0; l < 6; l++) k.torus(tape, 0.16, 0.07, x + dx, top + 0.07 + l * 0.14, z + dz);
      break;
    }
    case 'paintPails': {
      const body = hwMat(ctx, 'white');
      const lid = hwMat(ctx, 'teal');
      for (let l = 0; l < 2; l++)
        for (let i = 0; i < 3; i++)
          for (let j = 0; j < 2; j++) pail(k, body, lid, x + (i - 1) * 0.34, top + l * 0.38, z + (j - 0.5) * 0.4);
      break;
    }
  }
}

/**
 * in2-hw-pallet-rack：靠北墙的高货架（原点 = 正面底边中心，往北深 d，沿 x 共 bays 跨）：海军蓝立柱、芥末黄横梁（上层 2.2 米、顶 4.05 米），
 * 每跨下层两托（顾客拿）、上层两托（叉车取，H2）；每样一个价签（下层挂在托盘正面、上层挂在横梁上）；顶上一条 COURT SUPPLY 大字条。
 */
export function hwPalletRack(ctx: AssetCtx, goods = HW_RACK_GOODS, label = 'COURT SUPPLY'): THREE.Group {
  const k = new Kit();
  const M = mats(ctx);
  const rnd = ctx.rng('in2-hw-pallet-rack');
  const { bay, d, h, beam, top } = HW_RACK;
  const n = goods.length;
  const W = bay * n;
  const x0 = -W / 2;
  const zF = -0.06; // 正面立柱中心
  const zB = -d + 0.06;
  const items: HwItem[] = [];
  for (let i = 0; i <= n; i++) {
    const x = x0 + i * bay;
    for (const z of [zF, zB]) k.bx(M.navy, 0.12, h, 0.1, x, 0, z);
    // 侧面的横撑（侧着看是一道道横线）
    for (const y of [0.4, 1.5, 2.7, 3.7]) k.bx(M.navy, 0.06, 0.06, d - 0.1, x, y, (zF + zB) / 2);
    // 柱脚护角（芥末黄）
    k.bx(M.mustard, 0.22, 0.5, 0.2, x, 0, zF + 0.04);
  }
  for (let i = 0; i < n; i++) {
    const cx = x0 + (i + 0.5) * bay;
    for (const y of [beam, top]) for (const z of [zF, zB]) k.bx(M.mustard, bay - 0.12, 0.14, 0.08, cx, y - 0.14, z);
    // 上层的托盘面（钢丝网层板）
    k.bx(M.rubber, bay - 0.14, 0.03, d - 0.16, cx, beam, (zF + zB) / 2);
    const g = goods[i];
    const zc = -d / 2 - 0.02;
    for (const s of [-1, 1]) {
      rackLoad(ctx, k, g.low, cx + s * 0.75, 0, zc, rnd);
      rackLoad(ctx, k, g.up, cx + s * 0.75, beam + 0.03, zc, rnd);
    }
    items.push({ id: `rack-${i}-low`, ...GOOD_INFO[g.low], x: cx, y: 0.02, z: 0.04 });
    items.push({ id: `rack-${i}-up`, ...GOOD_INFO[g.up], x: cx, y: beam - 0.46, z: zF + 0.06 });
  }
  const extra = label ? [sign(ctx, label, Math.min(W - 1, 7.4), 0.7, 0, top - 0.24, zF + 0.1)] : [];
  return finish(ctx, k, 'in2-hw-pallet-rack', items, extra);
}

// ════════════════════════════ 收货门（H3 / H4） ════════════════════════════

/**
 * in2-hw-dock-door：北墙上的卷帘门（原点 = 门洞底边中心，墙面 z 0）：钢蓝灰的卷帘一条条横缝、一排四个暗窗、门底黑黄警示条，
 * 上面卷帘盒、两边黑色防撞块和芥末黄护柱，地上一块钢的卸货板。门洞 4 × 3.6 米。
 */
export function hwDockDoor(ctx: AssetCtx): THREE.Group {
  const k = new Kit();
  const M = mats(ctx);
  const W = 4;
  const H = 3.6;
  // 门板：冷钢蓝灰的卷帘，一条条横缝（只有缝、没有亮条和深浅：亮条 + 深浅会读成木板）
  const slat = hwMat(ctx, 'steel', {
    edge: 0.3,
    convex: 0,
    toneW: [0.04, 0.04],
    elem: { kind: 'planks', space: 'local', p: [0, 1, 0, 0.18], seam: 2, hi: 0 },
  });
  const glass = hwMat(ctx, 'screen', { lightUp: 0.4, bands: [-0.4, 0.6] });
  k.bx(slat, W, H, 0.06, 0, 0, 0.04);
  for (let i = 0; i < 4; i++) k.bx(glass, 0.6, 0.26, 0.02, (i - 1.5) * 0.9, 2.55, 0.08);
  // 门底：黑 + 黄（一块块）
  for (let i = 0; i < 8; i++)
    k.bx(i % 2 ? M.rubber : M.mustard, W / 8, 0.16, 0.03, -W / 2 + (i + 0.5) * (W / 8), 0, 0.08);
  // 门框（海军蓝）、卷帘盒
  for (const s of [-1, 1]) k.bx(M.navy, 0.16, H + 0.1, 0.12, s * (W / 2 + 0.08), 0, 0.06);
  k.bx(M.navy, W + 0.6, 0.45, 0.4, 0, H, 0.2);
  // 防撞块（黑橡胶）、护柱（芥末黄，顶上黑一道）
  for (const s of [-1, 1]) {
    k.bx(M.rubber, 0.26, 0.42, 0.14, s * (W / 2 + 0.4), 0.6, 0.07);
    k.cyl(M.mustard, 0.11, 0.11, 1.1, s * (W / 2 + 0.55), 0, 0.45, 12);
    k.cyl(M.rubber, 0.115, 0.115, 0.08, s * (W / 2 + 0.55), 0.9, 0.45, 12);
  }
  // 卸货板（地上的钢板，比地亮）
  const plate = hwMat(ctx, 'dado', { bands: [-2, 2], edge: 0.1, convex: 0, noShadowReceive: true });
  k.bx(plate, 2.6, 0.03, 1.4, 0, 0.02, 0.8);
  return finish(ctx, k, 'in2-hw-dock-door');
}

// ════════════════════════════ 叉车（H2） ════════════════════════════

/**
 * in2-hw-forklift 1.15 × 2.2 × 3.3（原点 = 车身中心落地，货叉朝北 −z；场景转 90° 侧停，侧面最好认）：
 * 芥末黄车身 + 后面圆背的配重、黑座椅、海军蓝护顶架（四柱 + 顶框 + 三道横条）、暗色门架 + 货叉、四个黑轮、顶上橙色警示灯。
 */
export function hwForklift(ctx: AssetCtx): THREE.Group {
  const k = new Kit();
  const M = mats(ctx);
  const body = palMat(ctx, 'hwMustard', { lightUp: 0.35, bands: [-0.25, 0.4], convex: 0.4, noShadowReceive: true });
  const mast = hwMat(ctx, 'rubber', { lightUp: 0.3, bands: [-0.3, 0.4], convex: 0.3 });
  const beacon = hwMat(ctx, 'orange', { lightUp: 0.5 });
  // 车身、配重（后面圆背）
  k.bx(body, 1.1, 0.6, 1.5, 0, 0.2, -0.05);
  k.bx(body, 1.12, 0.62, 0.42, 0, 0.2, 0.86);
  k.lie(body, 'x', 0.32, 1.12, 0, 0.52, 1.06, 14);
  // 发动机罩（座椅下面）、踏板
  k.bx(body, 0.9, 0.12, 0.8, 0, 0.8, 0.25);
  k.bx(M.rubber, 1.0, 0.04, 0.5, 0, 0.8, -0.5);
  // 座椅
  k.bx(M.rubber, 0.5, 0.12, 0.42, 0, 0.92, 0.35);
  k.bx(M.rubber, 0.5, 0.5, 0.1, 0, 0.98, 0.6);
  // 方向盘
  k.cyl(M.rubber, 0.03, 0.03, 0.42, 0, 0.8, -0.32, 6);
  k.add(new THREE.TorusGeometry(0.15, 0.03, 5, 12).rotateX(-Math.PI / 3).translate(0, 1.24, -0.3), M.rubber);
  // 轮子
  for (const s of [-1, 1]) {
    k.lie(M.rubber, 'x', 0.25, 0.26, s * 0.5, 0.25, -0.55, 14);
    k.lie(M.rubber, 'x', 0.2, 0.22, s * 0.5, 0.2, 0.85, 14);
    k.lie(M.steel, 'x', 0.1, 0.28, s * 0.5, 0.25, -0.55, 8);
  }
  // 护顶架
  for (const [x, z] of [
    [-0.5, -0.45],
    [0.5, -0.45],
    [-0.5, 0.78],
    [0.5, 0.78],
  ] as const)
    k.bx(M.navy, 0.07, 1.32, 0.07, x, 0.78, z);
  k.bx(M.navy, 1.1, 0.07, 1.33, 0, 2.08, 0.16);
  for (const z of [-0.15, 0.16, 0.47]) k.bx(M.navy, 1.0, 0.04, 0.06, 0, 2.11, z);
  k.cyl(beacon, 0.07, 0.07, 0.12, 0.35, 2.15, 0.6, 10);
  // 门架（两根槽钢 + 横梁）、挂架、货叉
  for (const s of [-1, 1]) k.bx(mast, 0.1, 2.3, 0.12, s * 0.34, 0.08, -0.95);
  for (const y of [0.5, 1.6, 2.3]) k.bx(mast, 0.78, 0.08, 0.1, 0, y, -0.95);
  k.bx(mast, 0.95, 0.4, 0.06, 0, 0.12, -1.05);
  for (const s of [-1, 1]) k.bx(mast, 0.12, 0.05, 1.1, s * 0.3, 0.06, -1.62);
  return finish(ctx, k, 'in2-hw-forklift');
}

/**
 * in2-hw-rent-sign：叉车租赁的立牌（原点 = 底座中心）：海军蓝立杆 + RENT 字条 + 价签（租一小时）。
 */
export function hwRentSign(ctx: AssetCtx, price = 35): THREE.Group {
  const k = new Kit();
  const M = mats(ctx);
  k.bx(M.navy, 0.5, 0.06, 0.4, 0, 0, 0);
  k.bx(M.navy, 0.07, 1.6, 0.07, 0, 0.06, 0);
  k.bx(M.navy, 1.0, 0.06, 0.06, 0, 1.62, 0.02);
  const items: HwItem[] = [
    { id: 'forklift-rent', name: '租叉车（一小时，含叉车员教一遍）', price, x: 0, y: 0.6, z: 0.06 },
  ];
  return finish(ctx, k, 'in2-hw-rent-sign', items, [sign(ctx, 'RENT', 1.0, 0.5, 0, 1.12, 0.06)]);
}

// ════════════════════════════ PAINT：漆墙、调漆台（H6）、摇漆机、划线车 ════════════════════════════

export const HW_PAINTS: { id: string; name: string; price: number; body: HwSwatch; lid: HwSwatch }[] = [
  { id: 'paint-white', name: '白色划线漆（5 加仑）', price: 65, body: 'white', lid: 'white' },
  { id: 'paint-teal', name: '俱乐部青绿划线漆（5 加仑）', price: 72, body: 'teal', lid: 'white' },
  { id: 'paint-clay', name: '红土色面漆（5 加仑）', price: 72, body: 'clay', lid: 'white' },
  { id: 'paint-blue', name: '硬地蓝面漆（5 加仑）', price: 78, body: 'blue', lid: 'white' },
];

/**
 * in2-hw-paint-wall：靠墙的漆架（原点 = 正面底边中心，往北深 0.7）：每段一种颜色的三个大桶（两下一上），层板沿芥末黄，
 * 上面一大块色卡板（6 × 3 的色块），顶上 PAINT 字条。
 */
export function hwPaintWall(ctx: AssetCtx, paints = HW_PAINTS): THREE.Group {
  const k = new Kit();
  const M = mats(ctx);
  const SEC = 2.3;
  const n = paints.length;
  const W = SEC * n;
  const items: HwItem[] = [];
  // 背板、立柱、层板
  k.bx(hwMat(ctx, 'wall', { edge: 0.3, convex: 0.1 }), W, 2.6, 0.06, 0, 0, -0.68);
  for (let i = 0; i <= n; i++) k.bx(M.navy, 0.08, 2.6, 0.7, -W / 2 + i * SEC, 0, -0.35);
  k.bx(M.navy, W, 0.1, 0.62, 0, 0, -0.35);
  k.bx(M.steel, W, 0.04, 0.62, 0, 0.42, -0.35);
  k.bx(M.mustard, W, 0.1, 0.04, 0, 0.36, -0.03);
  paints.forEach((p, i) => {
    const cx = -W / 2 + (i + 0.5) * SEC;
    const body = hwMat(ctx, p.body, { lightUp: 0.45, bands: [-0.3, 0.5] });
    const lid = hwMat(ctx, p.lid, { lightUp: 0.45, bands: [-0.3, 0.5] });
    for (const [dx, dy] of [
      [-0.2, 0],
      [0.2, 0],
      [0, 0.38],
    ] as const)
      pail(k, body, lid, cx + dx, 0.46 + dy, -0.32, 0.17, 0.38);
    items.push({ id: p.id, name: p.name, price: p.price, x: cx, y: 0.1, z: 0.0 });
  });
  // 色卡板：一大块，色块 0.32 见方、间距 0.06
  const chips: HwSwatch[] = ['red', 'orange', 'brass', 'green', 'teal', 'blue', 'purple', 'clay', 'white'];
  const chipMats = chips.map((c) => hwMat(ctx, c, { lightUp: 0.55, bands: [-0.6, 0.6], edge: 0.1, convex: 0 }));
  const CW = 0.36;
  const cols = Math.floor((W - 0.6) / CW);
  k.bx(M.white, cols * CW + 0.16, 3 * CW + 0.16, 0.04, 0, 1.36, -0.64);
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < cols; c++)
      k.bx(
        chipMats[(c + r * 4) % chipMats.length],
        CW - 0.06,
        CW - 0.06,
        0.03,
        (c - (cols - 1) / 2) * CW,
        1.47 + (2 - r) * CW,
        -0.6,
      );
  return finish(ctx, k, 'in2-hw-paint-wall', items, [sign(ctx, 'PAINT', 2.8, 0.7, 0, 2.66, -0.6)]);
}

/**
 * in2-hw-paint-counter：调漆台（原点 = 柜台正面底边中心，台宽 6、深 0.9、高 1.0）：海军蓝柜身 + 芥末黄台沿、浅灰台面；
 * 台上：白色调色机（顶上一圈彩色色浆罐）、电脑、一加仑的调好的漆（价签挂台沿）。
 */
export function hwPaintCounter(ctx: AssetCtx): THREE.Group {
  const k = new Kit();
  const M = mats(ctx);
  const top = hwMat(ctx, 'counterTop', { edge: 0.3, convex: 0.2 });
  const W = 6;
  k.bx(M.navy, W, 0.92, 0.86, 0, 0, -0.45);
  k.bx(M.mustard, W + 0.04, 0.1, 0.04, 0, 0.82, -0.01);
  k.bx(top, W + 0.08, 0.06, 0.94, 0, 0.92, -0.45);
  // 调色机：白柜 + 顶上 8 个色浆罐（大一点，一眼是一圈彩色）
  k.bx(M.white, 0.9, 0.62, 0.62, -1.6, 0.98, -0.5);
  const caps: HwSwatch[] = ['red', 'orange', 'brass', 'green', 'teal', 'blue', 'purple', 'rubber'];
  caps.forEach((c, i) => {
    const a = (i / caps.length) * Math.PI * 2;
    k.cyl(
      hwMat(ctx, c, { lightUp: 0.5 }),
      0.08,
      0.08,
      0.16,
      -1.6 + Math.cos(a) * 0.26,
      1.6,
      -0.5 + Math.sin(a) * 0.2,
      10,
    );
  });
  k.bx(M.rubber, 0.3, 0.2, 0.04, -1.6, 1.18, -0.18);
  // 电脑
  const scr = hwMat(ctx, 'screen', { lightUp: 0.6, bands: [-0.6, 0.4] });
  k.bx(M.rubber, 0.12, 0.25, 0.12, 0.4, 0.98, -0.6);
  k.bx(M.rubber, 0.6, 0.42, 0.06, 0.4, 1.2, -0.58);
  k.bx(scr, 0.52, 0.34, 0.02, 0.4, 1.24, -0.54);
  // 一加仑调好的漆（青绿）
  const can = hwMat(ctx, 'steel', { lightUp: 0.4 });
  const lbl = hwMat(ctx, 'teal', { lightUp: 0.5 });
  k.cyl(can, 0.13, 0.13, 0.28, 1.8, 0.98, -0.35, 14);
  k.cyl(lbl, 0.132, 0.132, 0.14, 1.8, 1.03, -0.35, 14);
  const items: HwItem[] = [
    { id: 'paint-tint', name: '现调的漆（1 加仑，选颜色、摇匀）', price: 48, x: 1.8, y: 0.48, z: 0.03 },
  ];
  return finish(ctx, k, 'in2-hw-paint-counter', items);
}

/** in2-hw-shaker：摇漆机（原点 = 底面中心）：灰蓝机柜、芥末黄夹具、里面一桶漆、前面一个大红按钮 */
export function hwShaker(ctx: AssetCtx): THREE.Group {
  const k = new Kit();
  const M = mats(ctx);
  const body = hwMat(ctx, 'dado', { lightUp: 0.45, bands: [-0.35, 0.4] });
  const btn = hwMat(ctx, 'red', { lightUp: 0.6 });
  k.bx(body, 0.9, 0.5, 0.8, 0, 0, 0);
  k.bx(body, 0.9, 0.8, 0.12, 0, 0.5, -0.34);
  for (const s of [-1, 1]) k.bx(body, 0.1, 0.8, 0.8, s * 0.4, 0.5, 0);
  k.bx(body, 0.9, 0.08, 0.8, 0, 1.3, 0);
  k.bx(M.mustard, 0.6, 0.06, 0.5, 0, 0.5, 0);
  k.bx(M.mustard, 0.6, 0.06, 0.5, 0, 1.0, 0);
  pail(k, M.white, hwMat(ctx, 'teal'), 0, 0.56, 0, 0.15, 0.42);
  k.bx(btn, 0.12, 0.12, 0.04, 0.25, 0.28, 0.41);
  return finish(ctx, k, 'in2-hw-shaker');
}

/** in2-hw-striper：划线车（原点 = 底面中心，把手朝南）：四个轮子、白漆罐、海军蓝车架、把手 —— 地上的大件，价签挂把手上 */
export function hwStriper(ctx: AssetCtx): THREE.Group {
  const k = new Kit();
  const M = mats(ctx);
  k.bx(M.navy, 0.7, 0.06, 1.0, 0, 0.22, 0);
  for (const [x, z] of [
    [-0.32, -0.38],
    [0.32, -0.38],
    [-0.32, 0.38],
    [0.32, 0.38],
  ] as const)
    k.lie(M.rubber, 'x', 0.13, 0.08, x, 0.13, z, 12);
  pail(k, M.white, hwMat(ctx, 'teal'), 0, 0.28, -0.1, 0.2, 0.5);
  k.bx(M.rubber, 0.08, 0.06, 0.2, 0, 0.1, -0.5);
  for (const s of [-1, 1]) k.bx(M.navy, 0.05, 0.9, 0.05, s * 0.28, 0.28, 0.45);
  k.bx(M.mustard, 0.7, 0.07, 0.07, 0, 1.15, 0.48);
  const items: HwItem[] = [{ id: 'striper', name: '划线车（推着走，画白线）', price: 420, x: 0, y: 0.62, z: 0.5 }];
  return finish(ctx, k, 'in2-hw-striper', items);
}

// ════════════════════════════ IRRIGATION：喷头零件墙（H5） ════════════════════════════

export const HW_PARTS: { id: string; name: string; price: number }[] = [
  { id: 'part-spray', name: '弹出式喷头（散射）', price: 8 },
  { id: 'part-rotor', name: '旋转喷头（大射程）', price: 24 },
  { id: 'part-impact', name: '摇臂喷头（黄铜）', price: 32 },
  { id: 'part-nozzle', name: '喷嘴套装（三色）', price: 5 },
  { id: 'part-valve', name: '电磁阀', price: 38 },
  { id: 'part-fitting', name: '黄铜快接头', price: 7 },
  { id: 'part-timer', name: '浇水定时器', price: 89 },
  { id: 'part-drip', name: '滴灌套装', price: 19 },
];

/** 零件（放大成"包装板"上的大样）：中心 (x, y)，面朝 +z，贴在 z 上 */
function part(ctx: AssetCtx, k: Kit, i: number, x: number, y: number, z: number) {
  const M = mats(ctx);
  const L = { lightUp: 0.5, bands: [-0.35, 0.45] as [number, number] };
  const black = hwMat(ctx, 'rubber', L);
  const green = hwMat(ctx, 'green', L);
  const brass = hwMat(ctx, 'brass', L);
  switch (i) {
    case 0: // 弹出式喷头：黑筒 + 绿盖 + 喷嘴
      k.cyl(black, 0.11, 0.11, 0.42, x, y - 0.24, z + 0.12, 12);
      k.cyl(green, 0.13, 0.13, 0.06, x, y + 0.18, z + 0.12, 12);
      k.cyl(M.white, 0.04, 0.04, 0.1, x, y + 0.24, z + 0.12, 8);
      break;
    case 1: // 旋转喷头：更高的黑筒 + 灰顶
      k.cyl(black, 0.13, 0.13, 0.5, x, y - 0.28, z + 0.14, 12);
      k.cyl(M.steel, 0.15, 0.15, 0.08, x, y + 0.22, z + 0.14, 12);
      k.cyl(hwMat(ctx, 'purple', L), 0.06, 0.06, 0.06, x, y + 0.3, z + 0.14, 8);
      break;
    case 2: // 摇臂喷头：黄铜身、摇臂、弹簧
      k.cyl(brass, 0.06, 0.08, 0.26, x, y - 0.26, z + 0.1, 10);
      k.bx(brass, 0.5, 0.06, 0.08, x, y, z + 0.1);
      k.bx(brass, 0.08, 0.2, 0.08, x - 0.2, y - 0.14, z + 0.1);
      k.cyl(brass, 0.05, 0.05, 0.14, x + 0.18, y + 0.06, z + 0.1, 8);
      break;
    case 3: // 喷嘴套装：一张白卡上三个彩色喷嘴
      k.bx(M.white, 0.6, 0.36, 0.03, x, y - 0.18, z + 0.03);
      (['red', 'green', 'blue'] as const).forEach((c, j) => {
        k.cyl(hwMat(ctx, c, L), 0.07, 0.07, 0.16, x + (j - 1) * 0.18, y - 0.08, z + 0.1, 10);
      });
      break;
    case 4: // 电磁阀：绿色阀体 + 黑线圈 + 两头接口
      k.bx(green, 0.36, 0.22, 0.16, x, y - 0.2, z + 0.1);
      k.cyl(black, 0.08, 0.08, 0.2, x, y + 0.02, z + 0.1, 10);
      k.lie(green, 'x', 0.06, 0.6, x, y - 0.1, z + 0.1, 8);
      break;
    case 5: // 黄铜快接头：大六角 + 管
      k.lie(brass, 'x', 0.1, 0.24, x - 0.06, y - 0.05, z + 0.1, 6);
      k.lie(brass, 'x', 0.07, 0.32, x + 0.18, y - 0.05, z + 0.1, 10);
      break;
    case 6: // 定时器：灰盒、深青屏幕、蓝按钮
      k.bx(M.steel, 0.46, 0.5, 0.12, x, y - 0.28, z + 0.06);
      k.bx(hwMat(ctx, 'screen', { lightUp: 0.6, bands: [-0.6, 0.4] }), 0.32, 0.16, 0.02, x, y - 0.02, z + 0.12);
      for (const s of [-1, 0, 1]) k.bx(hwMat(ctx, 'blue', L), 0.08, 0.06, 0.03, x + s * 0.12, y - 0.18, z + 0.13);
      break;
    case 7: // 滴灌套装：一卷黑管（立着的环）+ 几个绿滴头
      k.torus(black, 0.17, 0.05, x, y - 0.06, z + 0.08, true);
      for (const s of [-1, 1]) k.cyl(green, 0.04, 0.04, 0.1, x + s * 0.28, y - 0.2, z + 0.08, 8);
      break;
  }
}

/**
 * in2-hw-parts-wall：立着的零件墙（原点 = 正面底边中心，宽 8、高 2.4、深 0.4，背后不看）：浅色底板、海军蓝框和底座，
 * 2 行 × 4 格，每格一个放大的零件（对号买，H5），格子下沿挂价签；顶上 IRRIGATION 大字条。
 */
export function hwPartsWall(ctx: AssetCtx, parts = HW_PARTS): THREE.Group {
  const k = new Kit();
  const M = mats(ctx);
  const W = 8;
  k.bx(M.navy, W, 0.3, 0.4, 0, 0, -0.2);
  k.bx(M.board, W - 0.2, 2.1, 0.08, 0, 0.3, -0.28);
  for (const s of [-1, 1]) k.bx(M.navy, 0.12, 2.5, 0.4, s * (W / 2 - 0.06), 0, -0.2);
  k.bx(M.navy, W, 0.1, 0.14, 0, 2.4, -0.33);
  const items: HwItem[] = [];
  const CW = (W - 0.4) / 4;
  // 每格：一块浅灰的格板（比底板暗一点，格子分得开）+ 下沿一条芥末黄（价签槽）
  const cell = hwMat(ctx, 'steel', { lightUp: 0.6, bands: [-0.6, 0.6], edge: 0.2, convex: 0 });
  for (let r = 0; r < 2; r++)
    for (let c = 0; c < 4; c++) {
      const i = r * 4 + c;
      if (i >= parts.length) continue;
      const x = -W / 2 + 0.2 + (c + 0.5) * CW;
      const yb = r === 0 ? 1.46 : 0.42;
      k.bx(cell, CW - 0.18, 0.72, 0.03, x, yb, -0.22);
      k.bx(M.mustard, CW - 0.12, 0.05, 0.05, x, yb - 0.05, -0.2);
      part(ctx, k, i, x, yb + 0.42, -0.2);
      items.push({ ...parts[i], x, y: yb - 0.37, z: -0.16, sm: true });
    }
  return finish(ctx, k, 'in2-hw-parts-wall', items, [sign(ctx, 'IRRIGATION', 5.2, 0.7, 0, 2.5, -0.24)]);
}

// ════════════════════════════ TOOLS：洞洞板 + 独轮车 ════════════════════════════

export const HW_TOOLS: { id: string; name: string; price: number }[] = [
  { id: 'tool-drag', name: '红土场拖网刷', price: 95 },
  { id: 'tool-squeegee', name: '硬地刮水滚筒', price: 45 },
  { id: 'tool-shovel', name: '铁锹', price: 29 },
  { id: 'tool-rake', name: '耙子', price: 24 },
];

/**
 * in2-hw-tool-wall：洞洞板货架（原点 = 正面底边中心，宽 4.8、高 2.3）：深青灰洞洞板（亮的工具衬暗底）、海军蓝细框（框都靠后、很薄，
 * 45° 俯视时不挡前面的东西），竖挂四把大工具（拖网刷、刮水滚筒、铁锹、耙子），每把下面一个价签；板前地上一辆红斗独轮车（价签挂车头）；
 * 顶上 TOOLS 字条。
 */
export function hwToolWall(ctx: AssetCtx): THREE.Group {
  const k = new Kit();
  const M = mats(ctx);
  const W = 4.8;
  const peg = hwMat(ctx, 'dado', { edge: 0.2, convex: 0 });
  k.bx(M.navy, W, 0.16, 0.5, 0, 0, -0.3);
  k.bx(peg, W - 0.16, 2.1, 0.06, 0, 0.16, -0.5);
  for (const s of [-1, 1]) k.bx(M.navy, 0.08, 2.3, 0.14, s * (W / 2 - 0.04), 0, -0.47);
  k.bx(M.navy, W, 0.08, 0.14, 0, 2.26, -0.47);
  const L = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number] };
  const wood = hwMat(ctx, 'timber', L);
  const steel = hwMat(ctx, 'steel', L);
  const orange = hwMat(ctx, 'orange', L);
  const items: HwItem[] = [];
  const xs = [-1.7, -0.57, 0.57, 1.7];
  const z = -0.4;
  // 拖网刷：长柄 + 1 米宽的刷头（橙刷毛 + 黑底座）
  k.bx(wood, 0.08, 1.5, 0.06, xs[0], 0.55, z);
  k.bx(M.rubber, 0.96, 0.08, 0.12, xs[0], 2.0, z);
  k.bx(orange, 0.92, 0.18, 0.1, xs[0], 1.82, z + 0.02);
  // 刮水滚筒：长柄 + 横滚筒（青绿海绵）+ 黄架
  k.bx(steel, 0.07, 1.5, 0.06, xs[1], 0.55, z);
  k.bx(M.mustard, 0.8, 0.06, 0.06, xs[1], 1.96, z);
  k.lie(hwMat(ctx, 'teal', L), 'x', 0.11, 0.72, xs[1], 1.9, z + 0.06, 12);
  // 铁锹：木柄 + D 形把手（上）+ 大锹头（下）
  k.bx(wood, 0.08, 1.15, 0.06, xs[2], 0.95, z);
  k.bx(M.rubber, 0.28, 0.08, 0.06, xs[2], 2.1, z);
  for (const s of [-1, 1]) k.bx(M.rubber, 0.05, 0.16, 0.06, xs[2] + s * 0.12, 1.98, z);
  k.add(
    new THREE.CylinderGeometry(0.2, 0.26, 0.6, 4, 1)
      .rotateY(Math.PI / 4)
      .scale(1, 1, 0.12)
      .translate(xs[2], 0.68, z + 0.02),
    steel,
  );
  // 耙子：木柄 + 宽耙头（齿朝上，挂着）
  k.bx(wood, 0.08, 1.4, 0.06, xs[3], 0.42, z);
  k.bx(steel, 0.66, 0.08, 0.08, xs[3], 1.84, z);
  for (let t = 0; t < 7; t++) k.bx(steel, 0.05, 0.16, 0.05, xs[3] - 0.3 + t * 0.1, 1.92, z);
  HW_TOOLS.forEach((t, i) => {
    items.push({ ...t, x: xs[i], y: 0.02, z: -0.08, sm: true });
  });
  // 独轮车：红斗 + 黑轮 + 两根把（车头朝南）
  const red = hwMat(ctx, 'red', { lightUp: 0.4, bands: [-0.3, 0.45] });
  const wz = 0.9;
  const bx = 0.62;
  k.add(
    new THREE.CylinderGeometry(0.46, 0.3, 0.34, 4, 1)
      .rotateY(Math.PI / 4)
      .scale(1.15, 1, 1)
      .translate(bx, 0.42, wz),
    red,
  );
  k.lie(M.rubber, 'x', 0.2, 0.12, bx, 0.2, wz + 0.5, 12);
  for (const s of [-1, 1]) {
    k.bx(M.navy, 0.05, 0.05, 1.1, bx + s * 0.24, 0.42, wz - 0.4);
    k.bx(M.navy, 0.05, 0.36, 0.05, bx + s * 0.22, 0.06, wz - 0.1);
  }
  items.push({ id: 'tool-barrow', name: '独轮车', price: 119, x: bx, y: 0.02, z: wz + 0.74 });
  return finish(ctx, k, 'in2-hw-tool-wall', items, [sign(ctx, 'TOOLS', 2.8, 0.7, 0, 2.34, -0.4)]);
}

// ════════════════════════════ LUMBER：悬臂长料架（H1） ════════════════════════════

export const HW_LONG: { id: string; name: string; price: number }[] = [
  { id: 'long-timber', name: '木方 2×4（3.6 米，一根）', price: 6 },
  { id: 'long-galv', name: '镀锌钢管（6 米，围网用）', price: 38 },
  { id: 'long-pvc', name: '白 PVC 管（6 米，灌溉主管）', price: 22 },
  { id: 'long-netpost', name: '网柱一对（带摇把）', price: 340 },
  { id: 'long-fence', name: '围网立柱（深绿，3 米）', price: 45 },
];

/**
 * in2-hw-lumber-rack：悬臂长料架（原点 = 立柱背脊的底边中心，宽 13.8）：海军蓝立柱（带脚）、芥末黄悬臂三层，**越往上越短**（下 1.3、中 0.9、上 0.55 米）——
 * 45° 俯视时上一层不压住下一层，三层料一层一层往后退，都看得见。西半边：木方（下）、镀锌管（中）、白 PVC 管（上）；
 * 东半边：一对网柱（下）、深绿围网立柱（中）、上层空着。每样一个小价签（挂在那层悬臂下面、料捆正前方）；顶上一条横梁 + LUMBER 字条。
 */
export function hwLumberRack(ctx: AssetCtx): THREE.Group {
  const k = new Kit();
  const M = mats(ctx);
  const W = 13.8;
  const cols = [-6.5, -2.17, 2.17, 6.5];
  const LV = [
    { y: 0.34, len: 1.3 },
    { y: 1.14, len: 0.9 },
    { y: 1.94, len: 0.55 },
  ];
  const H = 2.6;
  for (const x of cols) {
    k.bx(M.navy, 0.16, H, 0.16, x, 0, 0);
    k.bx(M.navy, 0.16, 0.12, 1.5, x, 0, 0.6);
    for (const l of LV) {
      k.bx(M.mustard, 0.1, 0.1, l.len, x, l.y - 0.1, l.len / 2);
      k.bx(M.mustard, 0.1, 0.1, 0.05, x, l.y, l.len - 0.03);
    }
  }
  k.bx(M.navy, W, 0.12, 0.12, 0, H, 0);
  const items: HwItem[] = [];
  const tag = (i: number, x: number, lv: number, front: number) =>
    items.push({ ...HW_LONG[i], x, y: LV[lv].y - 0.42, z: front + 0.03, sm: true });
  const L = { lightUp: 0.5, bands: [-0.35, 0.45] as [number, number] };
  const wood = hwMat(ctx, 'timber', {
    ...L,
    elem: { kind: 'planks', space: 'local', p: [0, 1, 0, 0.09], seam: 2, hi: 0.4 },
    toneW: [0.3, 0.3],
  });
  const galv = hwMat(ctx, 'steel', L);
  const pvc = hwMat(ctx, 'white', L);
  const green = hwMat(ctx, 'netGreen', L);
  const cxL = -3.45;
  const lenL = 6.4;
  // 木方一捆（4 层 × 0.09，深 1.0）
  k.bx(wood, lenL, 0.36, 1.0, cxL, LV[0].y, 0.75);
  tag(0, cxL - 1.2, 0, 1.25);
  // 镀锌管一捆（两层）
  for (let r = 0; r < 2; r++)
    for (let i = 0; i < 6 - r; i++)
      k.lie(galv, 'x', 0.055, lenL, cxL, LV[1].y + 0.06 + r * 0.1, 0.2 + (i + r * 0.5) * 0.12, 8);
  tag(1, cxL + 1.2, 1, 0.86);
  // 白 PVC 管（两层，粗）
  for (let r = 0; r < 2; r++)
    for (let i = 0; i < 3 - r; i++)
      k.lie(pvc, 'x', 0.08, lenL, cxL, LV[2].y + 0.08 + r * 0.15, 0.14 + (i + r * 0.5) * 0.17, 10);
  tag(2, cxL - 1.2, 2, 0.52);
  // 东半边：网柱一对（深绿方管 + 摇把盒）
  const cxR = 3.45;
  for (const s of [0, 1]) {
    k.bx(green, 1.7, 0.14, 0.14, cxR - 1.0, LV[0].y + s * 0.14, 0.75 + (s ? -0.1 : 0.22));
    k.bx(green, 0.24, 0.24, 0.22, cxR - 1.95, LV[0].y + s * 0.14, 0.75 + (s ? -0.1 : 0.22));
  }
  k.lie(M.steel, 'z', 0.1, 0.06, cxR - 1.95, LV[0].y + 0.12, 1.12, 10);
  tag(3, cxR - 1.0, 0, 1.2);
  // 围网立柱一捆（深绿圆管）
  for (let r = 0; r < 2; r++)
    for (let i = 0; i < 6 - r; i++)
      k.lie(green, 'x', 0.05, 3.2, cxR + 1.4, LV[1].y + 0.05 + r * 0.09, 0.2 + (i + r * 0.5) * 0.11, 8);
  tag(4, cxR + 1.4, 1, 0.86);
  return finish(ctx, k, 'in2-hw-lumber-rack', items, [sign(ctx, 'LUMBER', 3.4, 0.7, 0, H + 0.12, 0.08)]);
}

/** in2-hw-flatbed：平板推车（原点 = 车面中心落地，0.8 × 1.8，把手在北头）：镀锌网面、黑脚轮、海军蓝 U 形把手 */
export function hwFlatbed(ctx: AssetCtx): THREE.Group {
  const k = new Kit();
  const M = mats(ctx);
  const deck = hwMat(ctx, 'steel', {
    edge: 0.4,
    convex: 0.2,
    elem: { kind: 'planks', space: 'local', p: [0, 0, 1, 0.12], seam: 1, hi: 0.4 },
  });
  k.bx(deck, 0.8, 0.06, 1.8, 0, 0.26, 0);
  k.bx(M.navy, 0.84, 0.08, 0.06, 0, 0.24, 0.9);
  for (const [x, z] of [
    [-0.32, -0.75],
    [0.32, -0.75],
    [-0.32, 0.75],
    [0.32, 0.75],
  ] as const) {
    k.bx(M.navy, 0.06, 0.1, 0.06, x, 0.16, z);
    k.lie(M.rubber, 'x', 0.09, 0.06, x, 0.1, z, 10);
  }
  for (const s of [-1, 1]) k.bx(M.navy, 0.05, 1.0, 0.05, s * 0.37, 0.3, -0.88);
  k.bx(M.navy, 0.8, 0.06, 0.06, 0, 1.28, -0.88);
  k.bx(M.navy, 0.8, 0.04, 0.04, 0, 0.85, -0.88);
  return finish(ctx, k, 'in2-hw-flatbed');
}

// ════════════════════════════ 收银（门边） ════════════════════════════

/**
 * in2-hw-checkout：收银台（原点 = 柜台正面底边中心，宽 5.2、深 0.8、高 1.0；收银员站北边）：海军蓝柜身 + 芥末黄台沿、黑色传送带、
 * 收银机（深青屏幕、钱箱）；西头一个小货架（手套、卷尺，各一个价签）、一根立杆 + CHECKOUT 字条（不挡门口的堆头）。
 */
export function hwCheckout(ctx: AssetCtx): THREE.Group {
  const k = new Kit();
  const M = mats(ctx);
  const top = hwMat(ctx, 'counterTop', { edge: 0.3, convex: 0.2 });
  const W = 5.2;
  k.bx(M.navy, W, 0.9, 0.76, 0, 0, -0.4);
  k.bx(M.mustard, W + 0.04, 0.1, 0.04, 0, 0.8, -0.01);
  k.bx(top, W + 0.06, 0.06, 0.82, 0, 0.9, -0.4);
  k.bx(M.rubber, W - 1.8, 0.02, 0.5, -0.6, 0.96, -0.4);
  // 收银机
  const scr = hwMat(ctx, 'screen', { lightUp: 0.6, bands: [-0.6, 0.4] });
  k.bx(M.rubber, 0.5, 0.16, 0.45, 1.75, 0.96, -0.5);
  k.bx(M.rubber, 0.08, 0.3, 0.08, 1.75, 1.12, -0.55);
  k.bx(M.rubber, 0.46, 0.32, 0.05, 1.75, 1.38, -0.52);
  k.bx(scr, 0.38, 0.24, 0.02, 1.75, 1.42, -0.49);
  // 西头的小货架（1.0 × 1.5）：上层一双大工作手套、下层两个卷尺；各一个小价签
  const sx = -W / 2 - 0.6;
  k.bx(M.navy, 1.0, 0.1, 0.45, sx, 0, -0.3);
  k.bx(M.board, 0.96, 1.4, 0.04, sx, 0.1, -0.5);
  for (const s2 of [-1, 1]) k.bx(M.navy, 0.06, 1.5, 0.12, sx + s2 * 0.47, 0, -0.44);
  for (const y of [0.1, 0.8]) k.bx(M.mustard, 1.0, 0.05, 0.4, sx, y, -0.3);
  const glove = hwMat(ctx, 'brass', { lightUp: 0.55, bands: [-0.45, 0.35] });
  for (const s2 of [-1, 1]) {
    k.bx(glove, 0.28, 0.36, 0.08, sx + s2 * 0.18, 1.05, -0.3);
    k.bx(glove, 0.09, 0.16, 0.08, sx + s2 * 0.18 + s2 * 0.16, 1.12, -0.3);
    k.bx(M.navy, 0.28, 0.08, 0.09, sx + s2 * 0.18, 0.97, -0.3);
  }
  const tape = hwMat(ctx, 'orange', { lightUp: 0.55 });
  for (const s2 of [-1, 1]) {
    k.lie(tape, 'z', 0.15, 0.1, sx + s2 * 0.22, 0.52, -0.3, 14);
    k.lie(M.rubber, 'z', 0.06, 0.11, sx + s2 * 0.22, 0.52, -0.3, 10);
  }
  const items: HwItem[] = [
    { id: 'gloves', name: '工作手套', price: 12, x: sx, y: 0.6, z: -0.08, sm: true },
    { id: 'tape', name: '卷尺（30 米，量场地）', price: 15, x: sx, y: -0.02, z: -0.08, sm: true },
  ];
  // 立杆 + 字条
  k.bx(M.navy, 0.07, 2.4, 0.07, -W / 2 + 0.35, 0.96, -0.7);
  return finish(ctx, k, 'in2-hw-checkout', items, [sign(ctx, 'CHECKOUT', 2.4, 0.5, -W / 2 + 0.35, 2.9, -0.62)]);
}

// ════════════════════════════ 地上的促销堆头 ════════════════════════════

export const HW_PROMO: { id: string; name: string; price: number }[] = [
  { id: 'promo-paint', name: '白色划线漆（特价，5 加仑）', price: 59 },
  { id: 'promo-reel', name: '水管车（带 30 米水管）', price: 79 },
  { id: 'promo-roller', name: '红土场压路滚筒', price: 650 },
  { id: 'promo-mats', name: '红土场拖网（卷）', price: 85 },
  { id: 'promo-hose', name: '园艺水管（30 米一卷）', price: 34 },
];

/**
 * in2-hw-promo：地上的一个堆头（原点 = 底面中心，约 1.2 见方）：variant 0 白漆桶一托、1 水管车、2 红土场压路滚筒、
 * 3 拖网卷一托、4 一托水管卷；每个一根小立杆 + 价签（挂在正面）。
 */
export function hwPromo(ctx: AssetCtx, v = ctx.variant % 5): THREE.Group {
  const k = new Kit();
  const M = mats(ctx);
  const rnd = ctx.rng(`in2-hw-promo:${v}`);
  let tagY = 0.02;
  let tagZ = 0.56;
  switch (v) {
    case 0: {
      pallet(ctx, k, 0, 0, 0);
      const lid = hwMat(ctx, 'white');
      for (let l = 0; l < 2; l++)
        for (let i = 0; i < 3; i++)
          for (let j = 0; j < 2; j++)
            pail(
              k,
              M.white,
              l === 1 && i === 1 ? hwMat(ctx, 'red') : lid,
              (i - 1) * 0.36,
              0.15 + l * 0.4,
              (j - 0.5) * 0.42,
              0.16,
              0.4,
            );
      break;
    }
    case 1: {
      // 水管车：芥末黄车架、两个轮、一大卷绿水管（立着的环）
      const green = hwMat(ctx, 'green', { lightUp: 0.4, bands: [-0.3, 0.45] });
      for (const s of [-1, 1]) {
        k.bx(M.mustard, 0.05, 0.9, 0.05, s * 0.36, 0.1, 0);
        k.lie(M.rubber, 'x', 0.16, 0.08, s * 0.42, 0.16, 0.1, 12);
      }
      k.lie(M.mustard, 'x', 0.05, 0.8, 0, 0.55, 0, 8);
      k.lie(green, 'x', 0.3, 0.55, 0, 0.55, 0, 16);
      k.bx(M.mustard, 0.8, 0.05, 0.05, 0, 1.05, -0.1);
      tagY = 0.2;
      tagZ = 0.36;
      break;
    }
    case 2: {
      // 压路滚筒：一大段海军蓝滚筒（两头黑边）+ 芥末黄 U 形架 + 斜着往北上去的长把（顶上黑握把）
      k.lie(M.navy, 'x', 0.34, 1.0, 0, 0.34, 0.1, 16);
      for (const s of [-1, 1]) {
        k.lie(M.rubber, 'x', 0.35, 0.05, s * 0.5, 0.34, 0.1, 16);
        k.bx(M.mustard, 0.05, 0.08, 0.5, s * 0.57, 0.3, -0.1);
      }
      k.bx(M.mustard, 1.19, 0.06, 0.06, 0, 0.3, -0.35);
      k.add(new THREE.BoxGeometry(0.06, 0.06, 1.11).rotateX(0.696).translate(0, 0.66, -0.75), M.mustard);
      k.bx(M.rubber, 0.6, 0.06, 0.06, 0, 1.0, -1.18);
      tagY = 0.0;
      tagZ = 0.52;
      break;
    }
    case 3: {
      pallet(ctx, k, 0, 0, 0);
      const mat = hwMat(ctx, 'netGreen', { lightUp: 0.4, bands: [-0.2, 0.45] });
      for (let l = 0; l < 3; l++)
        for (let i = 0; i < 3 - (l > 1 ? 1 : 0); i++)
          k.lie(mat, 'z', 0.15, 0.95, (i - (l > 1 ? 0.5 : 1)) * 0.32, 0.3 + l * 0.27, 0, 10);
      break;
    }
    case 4: {
      pallet(ctx, k, 0, 0, 0);
      const green = hwMat(ctx, 'green', { lightUp: 0.4, bands: [-0.3, 0.45] });
      for (let l = 0; l < 3; l++)
        for (const [dx, dz] of [
          [-0.28, -0.22],
          [0.28, -0.22],
          [-0.28, 0.22],
          [0.28, 0.22],
        ] as const)
          if (!(l === 2 && dz > 0) || rnd() < 0.5) k.torus(green, 0.2, 0.07, dx, 0.22 + l * 0.15, dz);
      break;
    }
  }
  const items: HwItem[] = [{ ...HW_PROMO[v], x: 0, y: tagY, z: tagZ }];
  return finish(ctx, k, 'in2-hw-promo', items);
}

/** 地上的字框（kit.floorLabel，安全黄）：中心 (x, z)，y 盖在环氧地上 */
export function hwFloorLabel(ctx: AssetCtx, text: string, w: number, d: number): THREE.Object3D {
  const ink = palMat(ctx, 'hwMustard', { lightUp: 0, bands: [-2, 2], edge: 0.05, convex: 0, noShadowReceive: true });
  const o = floorLabel(cachedCtx(ctx), text, { w, d, ink });
  o.traverse((m) => {
    m.userData.noCast = true;
  });
  return o;
}

// ════════════════════════════ 画廊 ════════════════════════════

const wrap = (o: THREE.Object3D, x = 0, z = 0) => {
  const g = new THREE.Group();
  o.position.set(x, 0, z);
  g.add(o);
  return g;
};

export const ASSETS: Record<string, AssetFn> = {
  'in2-hw-floor': (ctx) =>
    wrap(
      hwFloor(ctx, 8, 8, {
        lanes: [
          {
            pts: [
              [4, 8],
              [4, 1],
            ],
            half: 1.6,
          },
        ],
      }),
      -4,
      -4,
    ),
  'in2-hw-wall': (ctx) => wrap(hwWall(ctx, 6, 4.5), -3, -1),
  'in2-hw-pallet-rack': (ctx) => wrap(hwPalletRack(ctx, HW_RACK_GOODS.slice(0, 2)), 0, 0.6),
  'in2-hw-dock-door': (ctx) => hwDockDoor(ctx),
  'in2-hw-forklift': (ctx) => {
    const f = hwForklift(ctx);
    f.rotation.y = Math.PI / 2;
    return wrap(f);
  },
  'in2-hw-rent-sign': (ctx) => hwRentSign(ctx),
  'in2-hw-paint-wall': (ctx) => wrap(hwPaintWall(ctx, HW_PAINTS.slice(0, 2)), 0, 0.3),
  'in2-hw-paint-counter': (ctx) => wrap(hwPaintCounter(ctx), 0, 0.45),
  'in2-hw-shaker': (ctx) => hwShaker(ctx),
  'in2-hw-striper': (ctx) => hwStriper(ctx),
  'in2-hw-parts-wall': (ctx) => wrap(hwPartsWall(ctx), 0, 0.2),
  'in2-hw-tool-wall': (ctx) => wrap(hwToolWall(ctx), 0, 0),
  'in2-hw-lumber-rack': (ctx) => wrap(hwLumberRack(ctx), 0, -0.6),
  'in2-hw-flatbed': (ctx) => hwFlatbed(ctx),
  'in2-hw-checkout': (ctx) => wrap(hwCheckout(ctx), 0, 0.4),
  'in2-hw-promo': (ctx) => hwPromo(ctx),
  'in2-hw-floor-label': (ctx) => hwFloorLabel(ctx, 'LOADING ZONE', 4, 3),
};

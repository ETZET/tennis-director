// 沙漠银行店内的资产（批 B2，第二版风格，2026-11-18）。这个文件归沙漠银行的店内代理。
// ASSETS['in2-bank-…'] = (ctx) => THREE.Object3D：本地原点 = 落地点中心，y 0 = 地面，+z 朝南；材质只用 ctx.mat(key, extra)。
// interiors/v2/bank.ts 摆（局部坐标 x 0…14 西 → 东、z 0…12 北 → 南）。
//
// 第二版的原则（Sneaky Sasquatch 的银行 / 办事处）：镜头近（店里 0.02 米/纹素），东西少而大、平涂大色块，轮廓从地和墙上跳出来；
// 线按"半个设计纹素" T = 0.045 米（屏幕上 2 像素），竖直面上的横线按屏幕行 ROW = T / cos45。
// 配色（和外观的铜 + 沙漠石是一家，但比外观深、换了调 —— 进门一眼知道"进了室内"）：
//   地 = 安静的深胡桃木长板（一个色、低对比，颜色不放在地上）；墙 = 深铜木的护墙板 + 银行绿的上半墙 + 铜顶线；
//   柜台 = 深铜木正面（竖凹槽）+ 奶白大理石台面 + 铜框玻璃；金库 = 亮钢的大圆门（铜轮、铜栓）+ 门里一墙铜色保险格和一车钱袋；
//   贷款区 = 墨绿地毯 + 胡桃木大桌 + 绿玻璃台灯；排队栏 = 铜柱 + 墨绿绒绳。
// 2026-11-18 第二轮（用户："让布局和画面自己说话，不靠字"）：店里零字 —— 柜员靠横贯的柜台 + 玻璃 + 电脑 + 后墙的柱廊图标，
// 金库靠大圆门 + 门里的保险格和钱袋，经理靠单独的大木桌 + 台灯 + 客人椅；价签只有数字。
// 店里是固定的顶光（main.ts INDOOR_LOOK，仰角 65°）：朝南的竖直面落暗档 → 墙上挂的、家具正面给 WALL_FACE / FRONT（光往上偏，落中档）。
//
// 新材质（手挑 3 档 × 3 色，材质规范 v2：每档 [本色, 高一级, 低一级] + 缝 + 亮边，暗档往冷走）：
// - FLOOR_T：深胡桃木地板（南北向长板、低对比）；INLAY：板接头的缝
// - BRONZE_T：深铜木（护墙板、柜台正面、长椅）；GREEN_T：银行绿（上半墙）；RUG：墨绿地毯
// - MARBLE：柜台面的奶白大理石；STEEL：金库门的亮钢；GLASS：柜台玻璃；BRASS：铜件（借 flowerYellow）
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

type Ramp = [number, number, number];
const tn = (lit: Ramp, mid: Ramp, dark: Ramp, seam: Ramp, hi: Ramp): Tones => ({ bands: [lit, mid, dark], seam, hi });

// ── 调色板（渲染出来还要再过一层午后金光的暖调） ──
/** 地：安静的深胡桃木地板（一个色、深浅只差 ±6，南北向长板）—— 暗、暖、低调，颜色留给柜台、墙、金库、桌椅。亮档 L ≈ 57 */
const FLOOR: Ramp = [0x4e3228, 0x3e2824, 0x261a2a];
const FLOOR_T = tn(
  [0x4e3228, 0x54362a, 0x482e26],
  [0x3e2824, 0x442c26, 0x382422],
  [0x261a2a, 0x2c1e2e, 0x221626],
  [0x3e261e, 0x322020, 0x18121e],
  [0x5e3e2e, 0x4c3228, 0x342636],
);
const INLAY: Ramp = [0x3e2620, 0x302024, 0x1a141e];
/** 深铜木（亮档 L ≈ 96） */
const BRONZE: Ramp = [0x8c5c38, 0x6a4430, 0x3a2a36];
const BRONZE_T = tn(
  [0x8c5c38, 0x94643e, 0x845432],
  [0x6a4430, 0x724a34, 0x623e2c],
  [0x3a2a36, 0x40303a, 0x342430],
  [0x6c4428, 0x50342a, 0x221a26],
  [0xa8744a, 0x86583a, 0x4a3a46],
);
/** 银行绿（上半墙，朝镜头 → 落中档） */
const GREEN: Ramp = [0x267a58, 0x1a6248, 0x123c42];
const GREEN_T = tn(
  [0x267a58, 0x2a805e, 0x227452],
  [0x1a6248, 0x1e684c, 0x165c44],
  [0x163842, 0x1a3e46, 0x12323c],
  [0x22584a, 0x1a483e, 0x0e2a34],
  [0x48866a, 0x347058, 0x24484e],
);
const RUG: Ramp = [0x1e5a48, 0x164a3e, 0x0e2e36];
const RUG_T = tn(
  [0x1e5a48, 0x22604c, 0x1a5444],
  [0x164a3e, 0x1a5042, 0x12443a],
  [0x0e2e36, 0x12323a, 0x0a2832],
  [0x184a3c, 0x103a34, 0x08202a],
  [0x2e7058, 0x225a4a, 0x163a42],
);
const MARBLE: Ramp = [0xece2cc, 0xc8b8a8, 0x6e6484];
const STEEL: Ramp = [0xd4d8de, 0xa2a8b8, 0x585e80];
const GLASS: Ramp = [0xbcd8d8, 0x8ab0b8, 0x46607a];
const BRASS: Ramp = [0xe2b05a, 0xb88446, 0x5e4448];
const WALNUT: Ramp = [0x6e3c34, 0x542e30, 0x2e1e2c];
const LEATHER: Ramp = [0xd8b68a, 0xae8a6c, 0x5c4a5e];
const LAMP_G: Ramp = [0x5ccc8e, 0x2c946a, 0x1a5052];
const PAPER: Ramp = [0xf6ecd6, 0xdcccb4, 0x8a7e9a];
const INKY: Ramp = [0x2e2a3a, 0x24202e, 0x161420];
const POT: Ramp = [0xb05a3a, 0x8a4232, 0x4a2a36];
const LEAF: Ramp = [0x5aa060, 0x3e7e52, 0x244a48];

/** 墙上挂的（朝南、贴墙）：落中档、不受投影 */
const WALL_FACE: ToonOpts = SIGN_FACE;
/** 家具朝镜头的正面：光往上偏一点（顶亮、正面中暗） */
const FRONT: ToonOpts = { lightUp: 0.3, bands: [-0.15, 0.5], noShadowReceive: true };

type Part = [THREE.BufferGeometry, THREE.Material];
/** 一件资产的零件：按材质合成一个网格（只留 position + normal） */
class Parts {
  list: Part[] = [];
  add(m: THREE.Material, ...gs: THREE.BufferGeometry[]) {
    for (const g of gs) this.list.push([g, m]);
    return this;
  }
  group(ctx: AssetCtx, name: string, noCast: THREE.Material[] = []): THREE.Group {
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
      if (noCast.includes(m)) {
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
/** 朝 +z 的圆片（扁圆柱，厚 t；中心 x y，背面在 z） */
const disc = (r: number, t: number, x: number, y: number, z: number, n = 24) =>
  new THREE.CylinderGeometry(r, r, t, n).rotateX(Math.PI / 2).translate(x, y, z + t / 2);

/** 这几件共用的材质（每件资产一份；场景里按（键, 参数）缓存成一份） */
function mats(ctx: AssetCtx) {
  return {
    bronze: ctx.mat('surround', { ramp: BRONZE, tones: BRONZE_T }),
    bronzeFront: ctx.mat('surround', { ramp: BRONZE, tones: BRONZE_T, ...FRONT }),
    bronzeFlute: ctx.mat('surround', {
      ramp: BRONZE,
      tones: BRONZE_T,
      ...FRONT,
      elem: { kind: 'planks', p: [1, 0, 0, 0.35], seam: 1, hi: 0.6 },
    }),
    brass: ctx.mat('flowerYellow', { ramp: BRASS, edge: 0.4, convex: 0.6, noShadowReceive: true }),
    brassFace: ctx.mat('flowerYellow', { ramp: BRASS, ...WALL_FACE }),
    marble: ctx.mat('cap', { ramp: MARBLE, edge: 0.3, convex: 0.3, noShadowReceive: true }),
    marbleFace: ctx.mat('cap', { ramp: MARBLE, ...WALL_FACE }),
    steel: ctx.mat('metal', { ramp: STEEL, edge: 0.4, convex: 0.5 }),
    steelFace: ctx.mat('metal', { ramp: STEEL, ...WALL_FACE }),
    glass: ctx.mat('jug', { ramp: GLASS, ...WALL_FACE }),
    walnut: ctx.mat('surround', { ramp: WALNUT }),
    walnutFront: ctx.mat('surround', { ramp: WALNUT, ...FRONT }),
    leather: ctx.mat('kraft', { ramp: LEATHER, noShadowReceive: true, convex: 0.3 }),
    paper: ctx.mat('newsprint', { ramp: PAPER, noShadowReceive: true }),
    paperFace: ctx.mat('newsprint', { ramp: PAPER, ...WALL_FACE }),
    ink: ctx.mat('ironwork', { ramp: INKY, noShadowReceive: true }),
    inkFace: ctx.mat('ironwork', { ramp: INKY, ...WALL_FACE }),
    green: ctx.mat('surround', { ramp: GREEN, ...FRONT }),
  };
}

/** 招牌、价签的底和字（interiors/v2/bank.ts 给 kit 的大字条用）：银行绿底 + 铜字、深铜底 + 奶白字 */
export function bankSignMats(ctx: AssetCtx) {
  return {
    green: ctx.mat('signBoard', { ...WALL_FACE, ramp: [0x1e5e4a, 0x164c3e, 0x0e3036] }),
    bronze: ctx.mat('surround', { ramp: BRONZE, ...WALL_FACE }),
    brass: ctx.mat('flowerYellow', { ramp: BRASS, ...WALL_FACE }),
    cream: ctx.mat('signPaint', WALL_FACE),
    rope: ctx.mat('signBoard', { ramp: RUG, edge: 0, convex: 0, noShadowReceive: true }),
  };
}

// ── in2-bank-floor：地（14 × 12，本地原点 = 北边那条边的中点 → 摆在 x 7、z 0）──
// 深胡桃木长板（南北向 0.45 米宽，每 3 米一道接缝，安静）；只在经理桌下一块墨绿地毯（颜色给"那张桌子"）
const inFloor: AssetFn = (ctx) => {
  const W = 14;
  const D = 12;
  const stone = ctx.mat('surround', {
    ramp: FLOOR,
    tones: FLOOR_T,
    edge: 0.05,
    convex: 0,
    elem: { kind: 'planks', p: [1, 0, 0, 0.45], seam: 1, hi: 0 },
    toneW: [0.16, 0.16],
  });
  const inlay = ctx.mat('surround', { ramp: INLAY, edge: 0.05, convex: 0 });
  const rug = ctx.mat('metal', {
    ramp: RUG,
    tones: RUG_T,
    edge: 0.08,
    convex: 0,
    elem: { kind: 'paint', size: [40, 24], density: [0, 0] },
    toneW: [0.2, 0.2],
  });
  const border = ctx.mat('flowerYellow', { ramp: [0xb88a3a, 0x8a6434, 0x4a3834], edge: 0.08, convex: 0 });
  const p = new Parts();
  p.add(stone, flat(W, D, 0, 0.03, D / 2));
  // 板的接头：每 3 米一道横缝（错开半格），不画满地的格子
  for (let z = 3; z < D; z += 3) p.add(inlay, flat(W, T * 2, 0, 0.036, z));
  // 经理桌下的地毯（x 8.7…12.9 → 本地 1.7…5.9，z 5.0…8.8）+ 铜边
  p.add(border, flat(4.2, 3.8, 3.8, 0.05, 6.9));
  p.add(rug, flat(4.2 - 0.16, 3.8 - 0.16, 3.8, 0.054, 6.9));
  const g = p.group(ctx, 'valley-asset:in2-bank-floor', [stone, inlay, rug, border]);
  ctx.mats.prepare(g, { cast: false, receive: true });
  return g;
};

// ── in2-bank-north-wall：北墙的皮（14 米宽，本地 x −7…7，墙面 z 0）：深铜木护墙板 + 银行绿上半墙 + 铜顶线 + 柜台后的大铜钟 ──
// 金库的门洞、门在 in2-bank-vault（贴在墙皮外面）；柜员区后墙的银行标志在 in2-bank-emblem
const inNorthWall: AssetFn = (ctx) => {
  const m = mats(ctx);
  const green = ctx.mat('surround', {
    tones: GREEN_T,
    ramp: GREEN,
    ...WALL_FACE,
    elem: { kind: 'stones', size: [60, 30], seam: 0, hi: 0 },
    toneW: [0.12, 0.12],
  });
  const panel = ctx.mat('surround', {
    ramp: BRONZE,
    tones: BRONZE_T,
    ...WALL_FACE,
    elem: { kind: 'planks', p: [1, 0, 0, 0.7], seam: 1, hi: 0.5 },
  });
  const rail = ctx.mat('surround', { ramp: BRONZE, noShadowReceive: true });
  const face = ctx.mat('signPaint', { ...WALL_FACE, lightUp: 0.8, bands: [-0.8, -0.2] });
  const p = new Parts();
  const Z = 0.02;
  // 护墙板（0…1.3）+ 压条 + 踢脚；上半截银行绿 + 顶线（铜）
  p.add(panel, quad(14, 1.3, 0, 0, Z));
  p.add(rail, box(14, 0.1, 0.1, 0, 1.3, 0.05), box(14, 0.12, 0.06, 0, 0, 0.03));
  p.add(green, quad(14, 3.0, 0, 1.4, Z));
  p.add(m.brass, box(14, 0.12, 0.1, 0, 4.36, 0.05));
  // 大铜钟（柜员区东头上方，x 6.6 → 本地 −0.4，y 3.5）：铜框 + 白盘 + 刻度 + 指针（3:00）
  {
    const cx = -0.4;
    const cy = 3.5;
    p.add(m.brassFace, disc(0.52, 0.06, cx, cy, 0.02, 28));
    p.add(face, disc(0.42, 0.02, cx, cy, 0.08, 28));
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const r = 0.34;
      const s = i % 3 === 0 ? T * 1.6 : T;
      p.add(m.inkFace, box(s, s, 0.01, cx + Math.sin(a) * r, cy + Math.cos(a) * r - s / 2, 0.1));
    }
    p.add(m.inkFace, box(T * 1.4, 0.26, 0.01, cx, cy, 0.11), box(0.2, T * 1.4, 0.01, cx + 0.1, cy - T * 0.7, 0.11));
  }
  return p.group(ctx, 'valley-asset:in2-bank-north-wall', [panel, rail, green, m.brass, m.brassFace, face, m.inkFace]);
};

// ── in2-bank-counter：横贯整间的柜台（14 × 2.2 × 0.9，原点 = 屋子正中 x 7 的柜台中心落地点）──
// 把屋子分成"员工那边（北）/ 客人这边（南）"：深铜木竖槽正面 + 奶白大理石台面 + 一道铜腰线。
// 西半（柜员区，本地 −7…0）：台面后沿一道铜框隔断，两个窗口敞开（看得见后面的柜员），窗口和窗口之间是磨砂玻璃；
// 每个窗口一台电脑（背对镜头的米白显示器 + 键盘）+ 一条铜托盘。东半（金库前，本地 0…7）：只有台面，不挡金库。
// 东头本地 5.0…6.0 是一扇铜色矮门（员工进出，比台面低一截），门后面就是员工那边。
const COUNTER_W = 14;
const WINDOWS = [-4.6, -2.0] as const;
const inCounter: AssetFn = (ctx) => {
  const m = mats(ctx);
  const beige = ctx.mat('newsprint', { ramp: [0xeee4cc, 0xccbca4, 0x76688a], convex: 0.3, noShadowReceive: true });
  const H = 1.1;
  const D = 0.9;
  const G0 = 5.0;
  const G1 = 6.0;
  const p = new Parts();
  // 柜身两段（门洞两边）
  for (const [x0, x1] of [
    [-COUNTER_W / 2, G0],
    [G1, COUNTER_W / 2],
  ]) {
    const w = x1 - x0;
    const cx = (x0 + x1) / 2;
    p.add(m.bronze, box(w, H - 0.06, D - 0.1, cx, 0, -0.05));
    p.add(m.bronzeFlute, quad(w, H - 0.16, cx, 0.1, D / 2 + 0.002));
    p.add(m.walnutFront, quad(w, 0.1, cx, 0, D / 2 + 0.004));
    p.add(m.marble, box(w + 0.08, 0.08, D + 0.16, cx, H - 0.06, 0));
    p.add(m.brass, box(w, ROW, 0.03, cx, H - 0.28, D / 2 + 0.01));
  }
  // 员工矮门（铜框 + 深铜木板，0.9 高）
  p.add(m.bronzeFront, box(G1 - G0 - 0.06, 0.86, 0.08, (G0 + G1) / 2, 0.04, 0.2));
  p.add(m.brass, box(G1 - G0, T * 2, 0.1, (G0 + G1) / 2, 0.9, 0.2));
  // 柜员区的隔断：铜框，窗口敞开，窗口之间磨砂玻璃
  const gy = H + 0.02;
  const gz = -D / 2 + 0.12;
  const gh = 1.05;
  const holes = WINDOWS.map((w) => [w - 0.75, w + 0.75] as const);
  const panes: [number, number][] = [];
  let x = -COUNTER_W / 2;
  for (const [a, b] of holes) {
    panes.push([x, a]);
    x = b;
  }
  panes.push([x, 0]);
  for (const [a, b] of panes) p.add(m.glass, quad(b - a, gh, (a + b) / 2, gy, gz));
  for (const px of [-COUNTER_W / 2, ...holes.flat(), 0]) p.add(m.brass, box(T * 2, gh + 0.04, 0.05, px, gy, gz));
  p.add(m.brass, box(COUNTER_W / 2, ROW * 1.4, 0.05, -COUNTER_W / 4, gy + gh, gz));
  for (const wx of WINDOWS) {
    // 铜托盘（递钱的地方）
    p.add(m.brass, box(1.4, 0.04, 0.34, wx, H + 0.02, gz + 0.22));
    // 电脑：显示器背对镜头（米白的壳 + 后面一个鼓包）+ 底座 + 键盘
    const cx = wx + 0.35;
    p.add(beige, box(0.56, 0.44, 0.1, cx, H + 0.12, -0.05), box(0.34, 0.26, 0.16, cx, H + 0.2, 0.06));
    p.add(beige, box(0.14, 0.1, 0.14, cx, H + 0.02, -0.05), box(0.36, 0.03, 0.18, cx, H + 0.02, -0.06));
    p.add(m.ink, box(0.46, 0.02, 0.14, cx, H + 0.03, -0.3));
  }
  // 东半台面上：一个铜铃（按铃叫人）+ 一摞存款单
  p.add(
    m.brass,
    cyl(0.1, 0.06, 0.08, 2.4, H + 0.02, 0.1, 10),
    new THREE.SphereGeometry(0.03, 6, 4).translate(2.4, H + 0.13, 0.1),
  );
  p.add(m.paper, box(0.34, 0.04, 0.24, 3.0, H + 0.02, 0.15));
  return p.group(ctx, 'valley-asset:in2-bank-counter', [
    m.bronzeFlute,
    m.walnutFront,
    m.marble,
    m.glass,
    m.ink,
    m.paper,
    beige,
    m.bronzeFront,
  ]);
};

// ── in2-bank-emblem：柜员区后墙的银行标志（2.0 × 1.7，原点 = 底边正中，墙面 z 0）──
// 墨绿的拱顶牌子 + 一圈铜边 + 铜色柱廊图标（三角山花、横梁、四根柱、两级台阶）—— 一眼"银行"，不用字
const inEmblem: AssetFn = (ctx) => {
  const m = mats(ctx);
  const panel = ctx.mat('signBoard', { ...WALL_FACE, ramp: [0x1e5e4a, 0x164c3e, 0x0e3036] });
  const p = new Parts();
  const w = 1.9;
  const h = 1.25;
  // 铜边（方的下半 + 拱顶）、墨绿面
  p.add(m.brassFace, quad(w + 0.12, h + 0.06, 0, -0.03, 0.01));
  p.add(m.brassFace, disc(w / 2 + 0.06, 0.02, 0, h, 0.005, 24));
  p.add(panel, quad(w, h, 0, 0, 0.03));
  p.add(panel, disc(w / 2, 0.02, 0, h, 0.025, 24));
  // 柱廊（铜）：台阶两级、四根柱、横梁、山花（三角）
  const z = 0.06;
  p.add(m.brassFace, quad(1.3, ROW * 2, 0, 0.15, z), quad(1.12, ROW * 2, 0, 0.15 + ROW * 2.4, z));
  for (const cx of [-0.42, -0.14, 0.14, 0.42]) p.add(m.brassFace, quad(0.13, 0.62, cx, 0.15 + ROW * 4.8, z));
  const top = 0.15 + ROW * 4.8 + 0.62;
  p.add(m.brassFace, quad(1.12, ROW * 2, 0, top, z));
  const tri = new THREE.BufferGeometry();
  tri.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [-0.62, top + ROW * 2.4, z, 0.62, top + ROW * 2.4, z, 0, top + ROW * 2.4 + 0.42, z],
      3,
    ),
  );
  tri.computeVertexNormals();
  p.add(m.brassFace, tri);
  return p.group(ctx, 'valley-asset:in2-bank-emblem', [m.brassFace, panel]);
};

// ── in2-bank-vault：金库（原点 = 门洞中心的墙脚，墙面 z 0；门洞 Ø 2.5、中心离地 1.45）──
// 一圈亮钢厚门框（铜铆钉一圈）、门洞里：深色的金库内间 + 两排铜色保险柜格（看得到里面）+ 一道钢栅门（开着，靠在西边）；
// 大圆门半开（铰链在东，往外转 62°）：钢门面（同心两圈 + 正中一个铜轮五根辐条）+ 0.45 厚的门边（一圈铜栓头露出来）。
const inVault: AssetFn = (ctx) => {
  const m = mats(ctx);
  const R = 1.25;
  const CY = 1.45;
  const dark = ctx.mat('ironwork', { ramp: [0x3a3040, 0x2c2636, 0x1c1828], ...WALL_FACE });
  const box2 = ctx.mat('flowerYellow', { ramp: [0xc8964e, 0xa07440, 0x4e3c46], ...WALL_FACE });
  const p = new Parts();
  // 门框：方的钢板墙垛（3.2 × 3.1）+ 圆环（外 R + 0.28）
  p.add(m.steelFace, quad(3.3, 3.15, 0, 0, 0.025));
  p.add(m.steel, new THREE.TorusGeometry(R + 0.12, 0.16, 6, 28).translate(0, CY, 0.08));
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    p.add(m.brass, disc(0.05, 0.03, Math.sin(a) * (R + 0.24), CY + Math.cos(a) * (R + 0.24), 0.2, 8));
  }
  // 门洞里：深色内间（一块圆片，略往墙里）+ 保险柜格（3 行 × 5 列，每格一个铜小门 + 一个深色锁孔）
  p.add(dark, disc(R, 0.01, 0, CY, 0.03, 28));
  const cw = 0.34;
  const ch = 0.26;
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 5; c++) {
      const x = (c - 2) * (cw + T);
      const y = CY - 0.62 + r * (ch + T);
      if (Math.hypot(x, y + ch / 2 - CY) > R - 0.22) continue;
      p.add(box2, quad(cw, ch, x, y, 0.05));
      p.add(m.inkFace, quad(T, T, x + cw * 0.3, y + ch / 2 - T / 2, 0.055));
    }
  // 金库地面（门洞底下一块钢踏板）
  p.add(m.steel, box(2.0, 0.06, 0.5, 0, 0, 0.25));
  // 门洞口一辆钢推车，车上一堆钱袋（麻布色的袋子、扎口、袋身一枚铜币）+ 一摞金条
  {
    const sack = ctx.mat('kraft', { ramp: [0xd8b47a, 0xb08a62, 0x5c4a5c], convex: 0.35, noShadowReceive: true });
    const gold = ctx.mat('flowerYellow', {
      ramp: [0xf2c84a, 0xc8963c, 0x6a5040],
      edge: 0.4,
      convex: 0.5,
      noShadowReceive: true,
    });
    const cz = 0.75;
    p.add(m.steel, box(1.3, 0.06, 0.62, 0.15, 0.32, cz));
    for (const [x, zz] of [
      [-0.4, -0.22],
      [0.7, -0.22],
      [-0.4, 0.22],
      [0.7, 0.22],
    ] as const)
      p.add(m.ink, box(0.05, 0.32, 0.05, x, 0, cz + zz), cyl(0.06, 0.06, 0.05, x, 0, cz + zz, 6));
    p.add(m.steel, box(0.05, 0.5, 0.56, 0.78, 0.38, cz));
    const bags: [number, number, number, number][] = [
      [-0.2, 0.38, cz - 0.08, 0.26],
      [0.22, 0.38, cz + 0.06, 0.24],
      [0.02, 0.62, cz - 0.02, 0.22],
    ];
    for (const [x, y, zz, r] of bags) {
      p.add(sack, new THREE.SphereGeometry(r, 8, 6).scale(1, 1.1, 0.9).translate(x, y + r, zz));
      p.add(sack, cyl(r * 0.3, r * 0.45, r * 0.5, x, y + r * 2.0, zz, 6));
      p.add(m.ink, cyl(r * 0.32, r * 0.32, T, x, y + r * 2.05, zz, 6));
      p.add(gold, disc(r * 0.35, 0.02, x, y + r * 1.05, zz + r * 0.88, 10));
    }
    for (let k = 0; k < 3; k++) p.add(gold, box(0.26, 0.08, 0.13, 0.55, 0.38 + k * 0.08, cz + 0.1 - (k % 2) * 0.04));
  }
  // 钢栅门（开着，叠在门洞西边的门框上）：几根竖栏 + 两道横档
  for (let i = 0; i < 6; i++) p.add(m.steel, box(T * 1.5, 2.3, T * 1.5, -1.45 + i * 0.16, 0.2, 0.32));
  p.add(m.steel, box(0.96, T * 2, T * 1.5, -1.05, 0.5, 0.32), box(0.96, T * 2, T * 1.5, -1.05, 2.2, 0.32));
  // 大圆门：在本地 "关着" 的位置建好（门面朝 +z，背面贴门洞），再绕东边铰链 (R + 0.1, z 0.2) 转开
  {
    const door = new Parts();
    const TH = 0.45;
    const hx = R + 0.1;
    // 门身（圆柱，轴 z）：门面在 z TH
    door.add(m.steel, new THREE.CylinderGeometry(R, R, TH, 32).rotateX(Math.PI / 2).translate(-hx, CY, TH / 2));
    door.add(m.steelFace, disc(R - 0.18, 0.02, -hx, CY, TH, 28));
    door.add(m.steel, new THREE.TorusGeometry(R - 0.3, 0.05, 4, 28).translate(-hx, CY, TH + 0.03));
    // 门边一圈铜栓头（门边上一圈短圆柱，朝外）
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      door.add(
        m.brass,
        new THREE.CylinderGeometry(0.06, 0.06, 0.18, 8)
          .translate(0, R + 0.06, 0)
          .rotateZ(a)
          .translate(-hx, CY, TH * 0.5),
      );
    }
    // 正中的铜轮：轮毂 + 五根辐条 + 外圈
    door.add(
      m.brass,
      cyl(0.12, 0.12, 0.16, 0, 0, 0, 12)
        .rotateX(Math.PI / 2)
        .translate(-hx, CY, TH + 0.06),
    );
    door.add(m.brass, new THREE.TorusGeometry(0.5, 0.045, 4, 20).translate(-hx, CY, TH + 0.2));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.3;
      door.add(
        m.brass,
        box(0.06, 0.5, 0.05, 0, 0.25, 0)
          .rotateZ(a)
          .translate(-hx, CY, TH + 0.18),
      );
    }
    // 铰链（两块钢）
    door.add(m.steel, box(0.24, 0.4, 0.3, -0.04, CY + 0.6, TH / 2), box(0.24, 0.4, 0.3, -0.04, CY - 1.0, TH / 2));
    const ang = (62 / 180) * Math.PI;
    for (const [g, mat] of door.list) {
      g.rotateY(ang);
      g.translate(hx, 0, 0.2);
      p.add(mat, g);
    }
  }
  return p.group(ctx, 'valley-asset:in2-bank-vault', [m.steelFace, dark, box2, m.inkFace]);
};

// ── in2-bank-desk：贷款经理单独一张大木桌（2.7 × 0.78 × 1.05，原点 = 桌子中心落地点；经理坐北朝南）──
// 胡桃木桌（正面一块深铜嵌板）+ 绿呢桌面 + 绿玻璃台灯 + 一叠贷款合同 + 名牌（铜座深牌，朝南）+ 一个钢笔架
const inDesk: AssetFn = (ctx) => {
  const m = mats(ctx);
  const felt = ctx.mat('surround', { ramp: RUG, noShadowReceive: true, edge: 0.2, convex: 0 });
  const shade = ctx.mat('lawn', { ramp: LAMP_G, edge: 0.3, convex: 0.4, noShadowReceive: true, lightUp: 0.5 });
  const W = 2.7;
  const D = 1.05;
  const H = 0.78;
  const p = new Parts();
  p.add(m.walnut, box(W, H - 0.06, D, 0, 0, 0));
  p.add(m.walnutFront, quad(W, H - 0.06, 0, 0, D / 2 + 0.002));
  p.add(m.bronzeFront, quad(W - 0.3, H - 0.3, 0, 0.12, D / 2 + 0.006));
  p.add(m.walnut, box(W + 0.1, 0.06, D + 0.1, 0, H - 0.06, 0));
  p.add(felt, flat(W - 0.3, D - 0.25, 0, H + 0.002, 0));
  // 台灯（西头）：铜座 + 半圆绿罩（东西向）
  const lx = -0.78;
  p.add(m.brass, cyl(0.13, 0.11, 0.05, lx, H, -0.2), box(0.05, 0.32, 0.05, lx, H + 0.05, -0.24));
  p.add(
    shade,
    new THREE.CylinderGeometry(0.15, 0.15, 0.5, 12, 1, false, 0, Math.PI)
      .rotateZ(Math.PI / 2)
      .translate(lx, H + 0.38, -0.2),
  );
  // 合同一叠 + 一支笔；名牌（朝南）
  p.add(m.paper, box(0.42, 0.05, 0.3, 0.2, H, 0.08), box(0.4, 0.02, 0.28, 0.24, H + 0.05, 0.06));
  p.add(m.ink, box(0.3, T, T, 0.22, H + 0.08, 0.12));
  p.add(m.brass, box(0.62, 0.05, 0.12, 0.62, H, 0.32));
  p.add(m.inkFace, box(0.58, 0.16, 0.04, 0.62, H + 0.05, 0.33));
  p.add(m.brassFace, quad(0.4, ROW, 0.62, H + 0.1, 0.355));
  return p.group(ctx, 'valley-asset:in2-bank-desk', [
    m.walnutFront,
    m.bronzeFront,
    felt,
    m.paper,
    m.ink,
    m.inkFace,
    m.brassFace,
  ]);
};

// ── in2-bank-chair：皮椅（原点 = 椅子中心落地点，面朝 +z）。v0 = 经理的高背转椅（深铜皮），v1 = 客人的扶手椅（驼色皮） ──
const inChair: AssetFn = (ctx) => {
  const m = mats(ctx);
  const v = ctx.variant ?? 0;
  const hide = v === 0 ? ctx.mat('surround', { ramp: BRONZE, convex: 0.3, noShadowReceive: true }) : m.leather;
  const p = new Parts();
  if (v === 0) {
    p.add(m.ink, cyl(0.04, 0.04, 0.32, 0, 0, 0, 6), box(0.6, 0.05, 0.08, 0, 0, 0), box(0.08, 0.05, 0.6, 0, 0, 0));
    p.add(hide, box(0.62, 0.16, 0.6, 0, 0.36, 0), box(0.62, 0.95, 0.16, 0, 0.5, -0.26));
  } else {
    p.add(m.walnut, ...[-0.26, 0.26].flatMap((x) => [-0.24, 0.24].map((z) => box(0.06, 0.4, 0.06, x, 0, z))));
    p.add(hide, box(0.64, 0.14, 0.6, 0, 0.4, 0), box(0.64, 0.5, 0.14, 0, 0.5, -0.24));
    p.add(hide, box(0.1, 0.24, 0.56, -0.3, 0.52, 0), box(0.1, 0.24, 0.56, 0.3, 0.52, 0));
  }
  return p.group(ctx, `valley-asset:in2-bank-chair:${v}`);
};

// ── in2-bank-loan-sign：贷款的三档立牌（1.3 × 1.95 × 0.5，原点 = 底座中心；牌面朝 +z）──
// 深铜木框 + 银行绿牌面，三档价签（kit，只有数字）挂在牌面上三行；每行左边一个铜小图标（一摞、两摞、三摞金币）—— 不写字
const inLoanSign: AssetFn = (ctx) => {
  const m = mats(ctx);
  const face = ctx.mat('surround', { ramp: GREEN, ...WALL_FACE });
  const p = new Parts();
  p.add(m.bronze, box(0.9, 0.08, 0.45, 0, 0, 0));
  p.add(m.bronze, box(T * 2, 0.4, T * 2, -0.5, 0.08, 0), box(T * 2, 0.4, T * 2, 0.5, 0.08, 0));
  p.add(m.bronze, box(1.3, 1.45, 0.08, 0, 0.48, 0));
  p.add(face, quad(1.18, 1.33, 0, 0.54, 0.042));
  // 三行的金币摞（一摞 / 两摞 / 三摞）
  for (let r = 0; r < 3; r++) {
    const y = 1.5 - r * 0.42;
    for (let s = 0; s <= r; s++)
      for (let k = 0; k < 3; k++)
        p.add(m.brassFace, box(0.1, ROW * 0.9, 0.02, -0.46 + s * 0.12, y - 0.12 + k * ROW, 0.05));
  }
  return p.group(ctx, 'valley-asset:in2-bank-loan-sign', [face, m.brassFace]);
};

// ── in2-bank-stanchion：排队栏的一段（原点 = 第一根柱的落地点，往 +x 排 n 根，间距 1.2；v = 根数 − 2）──
// 铜柱（圆底座 + 圆顶球）+ 两柱之间一根下垂的墨绿绒绳（三段折线）
const inStanchion: AssetFn = (ctx) => {
  const m = mats(ctx);
  const rope = bankSignMats(ctx).rope;
  const n = 2 + (ctx.variant ?? 0);
  const S = 1.2;
  const p = new Parts();
  for (let i = 0; i < n; i++) {
    const x = i * S;
    p.add(m.brass, cyl(0.17, 0.17, 0.05, x, 0, 0, 12), cyl(0.04, 0.04, 0.9, x, 0.05, 0, 8));
    p.add(m.brass, new THREE.SphereGeometry(0.07, 8, 6).translate(x, 0.98, 0));
    if (i < n - 1) {
      // 绳：两头在 0.88，中间垂到 0.66（三段）
      const pts: [number, number][] = [
        [x + 0.05, 0.88],
        [x + S * 0.33, 0.7],
        [x + S * 0.67, 0.7],
        [x + S - 0.05, 0.88],
      ];
      for (let k = 0; k < 3; k++) {
        const [ax, ay] = pts[k];
        const [bx, by] = pts[k + 1];
        const L = Math.hypot(bx - ax, by - ay);
        p.add(
          rope,
          box(L, 0.06, 0.06, 0, -0.03, 0)
            .rotateZ(Math.atan2(by - ay, bx - ax))
            .translate((ax + bx) / 2, (ay + by) / 2, 0),
        );
      }
    }
  }
  return p.group(ctx, `valley-asset:in2-bank-stanchion:${n}`, [rope]);
};

// ── in2-bank-slip-desk：填单台（1.7 × 1.1 × 0.8，原点 = 中心落地点）：深铜木台身 + 奶白大理石面 + 两摞存款单 + 两支链着的笔 + 一盏小铜灯 ──
const inSlipDesk: AssetFn = (ctx) => {
  const m = mats(ctx);
  const p = new Parts();
  p.add(m.bronze, box(1.5, 1.0, 0.6, 0, 0, 0));
  p.add(m.bronzeFlute, quad(1.5, 0.9, 0, 0.05, 0.302));
  p.add(m.marble, box(1.7, 0.06, 0.8, 0, 1.0, 0));
  for (const x of [-0.45, 0.35]) {
    p.add(m.paper, box(0.3, 0.06, 0.22, x, 1.06, 0.05));
    p.add(m.brass, box(0.08, 0.04, 0.08, x + 0.25, 1.06, -0.15));
    p.add(m.ink, box(0.24, T, T, x + 0.1, 1.11, 0.12).rotateY(0.4));
  }
  p.add(m.brass, cyl(0.03, 0.03, 0.34, 0, 1.06, -0.25, 6), box(0.36, 0.08, 0.14, 0, 1.4, -0.22));
  return p.group(ctx, 'valley-asset:in2-bank-slip-desk', [m.bronzeFlute, m.marble, m.paper, m.ink]);
};

// ── in2-bank-bench：候客长椅（2.0 × 0.85 × 0.6，原点 = 中心落地点，面朝 +z）：深铜木框 + 驼色皮垫 ──
const inBench: AssetFn = (ctx) => {
  const m = mats(ctx);
  const p = new Parts();
  for (const x of [-0.9, 0.9]) p.add(m.bronze, box(0.1, 0.42, 0.55, x, 0, 0));
  p.add(m.bronze, box(2.0, 0.06, 0.58, 0, 0.4, 0));
  p.add(m.leather, box(1.86, 0.1, 0.5, 0, 0.46, 0.02), box(1.86, 0.4, 0.1, 0, 0.5, -0.24));
  p.add(m.bronze, box(2.0, 0.08, 0.12, 0, 0.9, -0.26));
  return p.group(ctx, 'valley-asset:in2-bank-bench', [m.leather]);
};

// ── in2-bank-plant：盆栽（陶红大盆 + 一丛叶片，1.6 高；原点 = 盆的落地点）──
const inPlant: AssetFn = (ctx) => {
  const pot = ctx.mat('kraft', { ramp: POT, convex: 0.3, noShadowReceive: true });
  const leaf = ctx.mat('palm', { ramp: LEAF, convex: 0.2, lightUp: 0.4, noShadowReceive: true });
  const p = new Parts();
  p.add(pot, cyl(0.22, 0.3, 0.5, 0, 0, 0, 10), cyl(0.32, 0.32, 0.06, 0, 0.5, 0, 10));
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + (i % 2) * 0.3;
    const tilt = i % 3 === 0 ? 0.35 : 0.7;
    const len = i % 3 === 0 ? 1.1 : 0.85;
    p.add(
      leaf,
      box(0.22, 0.04, len, 0, 0, len / 2)
        .rotateX(-tilt)
        .rotateY(a)
        .translate(0, 0.55, 0),
    );
  }
  return p.group(ctx, 'valley-asset:in2-bank-plant', [pot, leaf]);
};

export const ASSETS: Record<string, AssetFn> = {
  'in2-bank-floor': inFloor,
  'in2-bank-north-wall': inNorthWall,
  'in2-bank-counter': inCounter,
  'in2-bank-emblem': inEmblem,
  'in2-bank-vault': inVault,
  'in2-bank-desk': inDesk,
  'in2-bank-chair': inChair,
  'in2-bank-loan-sign': inLoanSign,
  'in2-bank-stanchion': inStanchion,
  'in2-bank-slip-desk': inSlipDesk,
  'in2-bank-bench': inBench,
  'in2-bank-plant': inPlant,
};

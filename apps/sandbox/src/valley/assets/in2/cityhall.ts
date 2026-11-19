// 市政厅店内的资产（批 CH2，第二版风格，2026-11-18）。这个文件归市政厅的店内代理。
// ASSETS['in2-cityhall-…'] = (ctx) => THREE.Object3D：本地原点 = 落地点中心，y 0 = 地面，+z 朝南；材质只用 ctx.mat(key, extra)；随机只用 ctx.rng(id)。
// interiors/v2/cityhall.ts 摆（局部坐标 x 0…16 西 → 东、z 0…12 北 → 南）。
//
// 第二版的原则（Sneaky Sasquatch 的办事处）：镜头近、东西少而大、平涂大色块；线按半个设计纹素 T = 0.045 米。
// 配色：外观是暖沙色的中世纪现代长楼 → 屋里换一个调（进门一眼知道"进了室内"）：
// - 墙：深靛蓝（INDIGO，上半截）+ 柚木护墙板（TEAK，下半截）；地：灰石（STONE）；店里零字：窗口办什么看台面上的东西、墙上的图标；
// - 窗口柜台：柚木 + 奶白台面、浅青玻璃；字条、价签的底：靛蓝；亮点：香槟金（pipeGold，同外观的管格栅）、叫号屏的红字。
// 店里是固定顶光（main.ts INDOOR_LOOK）：大面（墙、地、柜台正面）锁在一档（LOCK：平涂，不管朝向），东西的顶面 / 侧面才分档。
//
// 新材质（手挑 3 档 × 3 色；锁档的大面三档挨着）：
// - STONE：灰石地（中性低饱和的大块石板：地是安静的底，颜色交给北墙的靛蓝、青绿台面、窗口上的东西）；BRASS_STRIP：地上的黄铜分隔条；LAMINATE：柜台 / 长桌 / 讲台的青绿贴面
// - INDIGO：靛紫墙（L 72 / 62 / 44）；TEAK：柚木（护墙板、柜台、讲台、长桌；L 124 / 96 / 60）
// - CREAM：台面、告示纸；GLASS：窗口的浅青玻璃；SHUTTER：听证会那天拉下来的卷帘（灰靛）
// - LED：叫号屏、取号机的红字（L 120，锁亮档）；MUSTARD：等候椅的玻璃钢椅壳（中世纪现代的芥末黄）
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { box } from '../../../clubsite/render/geo';
import type { ToonOpts } from '../../../clubsite/render/toon';
import type { AssetCtx, AssetFn } from '../../ctx';

/** 半个设计纹素（米）：店里镜头近，线 = 2 屏幕像素 */
const T = 0.045;
/** 竖直面上一屏幕行（米） */
const ROW = T / Math.SQRT1_2;

type Ramp = [number, number, number];
/** 平涂：锁在亮档（三档同一个颜色族，哪档落下来都对）、不受投影 */
const LOCK: ToonOpts = { bands: [-2, -1.9], noShadowReceive: true };
/** 家具朝镜头的正面：光往上偏（顶亮、正面中） */
const FRONT: ToonOpts = { lightUp: 0.3, bands: [-0.15, 0.5], noShadowReceive: true };

/** 灰石地：中性、低饱和（午后方案会往暖拉一点，原值偏一点蓝 → 渲染出来是中性灰） */
const STONE: Ramp = [0x46569a, 0x3f4e8c, 0x2c3868];
const BRASS_STRIP: Ramp = [0xd8b060, 0xbc9450, 0x7a6450];
const INDIGO: Ramp = [0x3442b8, 0x2e3aa4, 0x22287a];
const INDIGO_DK: Ramp = [0x34346a, 0x2c2c5c, 0x222248];
const TEAK: Ramp = [0xb05c3a, 0x924a34, 0x56364a];
const TEAK_DK: Ramp = [0x7e4a3c, 0x683c36, 0x40303e];
const CREAM: Ramp = [0xf4ead2, 0xe2d4ba, 0xa89cb0];
/** 柜台、长桌的台面：中世纪现代的青绿塑胶贴面（和玫瑰地、靛紫墙是一套 50 年代的配色） */
const LAMINATE: Ramp = [0x3cc4ae, 0x30aa9a, 0x206a76];
const GLASS: Ramp = [0xa8dcdc, 0x86c2c8, 0x5a8aa0];
const SHUTTER: Ramp = [0x8a8eae, 0x787c9c, 0x54587a];
const LED: Ramp = [0xff4a3a, 0xf0402e, 0xd03828];
const LED_BG: Ramp = [0x22202c, 0x1c1a24, 0x16141e];
const MUSTARD: Ramp = [0xe8b030, 0xd09c28, 0x8a6a40];
const CHROME: Ramp = [0xd8dce4, 0xb4b8c6, 0x70748e];
const LEAF: Ramp = [0x3e9a5a, 0x2e7e4e, 0x1e4e44];
const POT: Ramp = [0xe0e0dc, 0xc4c4c8, 0x7c7c96];
const RED_CLOTH: Ramp = [0xc8343e, 0xa82a3a, 0x5e2238];
const NAVY_CLOTH: Ramp = [0x2a4a8a, 0x1e3a74, 0x16264e];
const WHITE_CLOTH: Ramp = [0xf6f4ee, 0xe2e0dc, 0x9a98b0];
/** 网球（奖杯顶上那颗）、蓝图、档案盒 */
const BALL: Ramp = [0xd8f040, 0xc0dc34, 0x7a9440];
const BLUEPRINT: Ramp = [0x3a78c8, 0x2e64ae, 0x22447a];
const KRAFT: Ramp = [0xc89a62, 0xb08654, 0x6a5654];
const PAPERS: Ramp[] = [
  [0xf6efda, 0xe6dcc2, 0xa89cb0],
  [0xf2d86a, 0xdcc058, 0x8a7a60],
  [0x8ec8e8, 0x74b0d4, 0x4a6e98],
  [0xf09aa8, 0xd88294, 0x8a5470],
];

type Part = [THREE.BufferGeometry, THREE.Material];
/** 一件资产的零件：按材质合成一个网格（只留 position + normal）；店里不投影 */
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
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, m);
      mesh.castShadow = false;
      mesh.userData.noCast = true;
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
/** 朝 +z 的圆片 */
const disc = (r: number, t: number, x: number, y: number, z: number, n = 24) =>
  new THREE.CylinderGeometry(r, r, t, n).rotateX(Math.PI / 2).translate(x, y, z + t / 2);
const cyl = (r0: number, r1: number, h: number, x: number, y: number, z: number, n = 10) =>
  new THREE.CylinderGeometry(r1, r0, h, n).translate(x, y + h / 2, z);

/** 这家店的材质（场景里按（键, 参数）缓存成一份） */
function mats(ctx: AssetCtx) {
  const lock = (key: Parameters<AssetCtx['mat']>[0], ramp: Ramp) => ctx.mat(key, { ramp, tones: undefined, ...LOCK });
  return {
    indigo: lock('signBoard', INDIGO),
    indigoDk: lock('signBoard', INDIGO_DK),
    teakFace: ctx.mat('signBoard', {
      ramp: TEAK,
      tones: undefined,
      ...LOCK,
      elem: { kind: 'planks', p: [1, 0, 0, 0.3], seam: 1, hi: 0 },
    }),
    teak: ctx.mat('signBoard', { ramp: TEAK, tones: undefined, ...FRONT }),
    teakDk: lock('signBoard', TEAK_DK),
    cream: ctx.mat('signPaint', { ramp: LAMINATE, tones: undefined, ...FRONT }),
    creamFace: lock('signPaint', CREAM),
    glass: ctx.mat('signBoard', { ramp: GLASS, tones: undefined, ...LOCK, edge: 0.3 }),
    shutter: ctx.mat('signBoard', {
      ramp: SHUTTER,
      tones: undefined,
      ...LOCK,
      elem: { kind: 'planks', p: [0, 1, 0, 0.18], seam: 1, hi: 0.5 },
    }),
    led: lock('signPaint', LED),
    ledBg: lock('signBoard', LED_BG),
    brass: ctx.mat('signPaint', { ramp: BRASS_STRIP, tones: undefined, noShadowReceive: true, convex: 0.6 }),
    brassFace: lock('signPaint', BRASS_STRIP),
    chrome: ctx.mat('signPaint', { ramp: CHROME, tones: undefined, noShadowReceive: true, convex: 0.6 }),
    mustard: ctx.mat('signPaint', { ramp: MUSTARD, tones: undefined, ...FRONT, convex: 0.5 }),
    ink: lock('signBoard', LED_BG),
    leaf: ctx.mat('signBoard', { ramp: LEAF, tones: undefined, noShadowReceive: true, lightUp: 0.3, convex: 0.4 }),
    pot: ctx.mat('signPaint', { ramp: POT, tones: undefined, ...FRONT }),
  };
}
type M = ReturnType<typeof mats>;

/** 招牌、价签的底和字（interiors/v2/cityhall.ts 给 kit 的大字条 / 地面字用）：靛蓝底 + 香槟金字、柚木底 + 奶白字 */
export function cityhallSignMats(ctx: AssetCtx) {
  return {
    navy: ctx.mat('signBoard', { ramp: [0x26306e, 0x202860, 0x181e48], tones: undefined, ...LOCK }),
    teak: ctx.mat('signBoard', { ramp: TEAK_DK, tones: undefined, ...LOCK }),
    red: ctx.mat('signBoard', { ramp: RED_CLOTH, tones: undefined, ...LOCK }),
    gold: ctx.mat('signPaint', { ramp: [0xf6cc6a, 0xe8bc5a, 0xc89c48], tones: undefined, ...LOCK }),
    cream: ctx.mat('signPaint', { ramp: CREAM, tones: undefined, ...LOCK }),
  };
}

// ── 7 段数码字（叫号屏、取号机）：朝 +z，左下角 (x, y)，一段宽 s、长 L ──
const SEG: Record<string, string> = {
  '0': 'abcdef',
  '1': 'bc',
  '2': 'abged',
  '3': 'abgcd',
  '4': 'fgbc',
  '5': 'afgcd',
  '6': 'afgedc',
  '7': 'abc',
  '8': 'abcdefg',
  '9': 'abcfgd',
};
function digitGeo(ch: string, x: number, y: number, z: number, L: number, s: number): THREE.BufferGeometry[] {
  const on = SEG[ch] ?? '';
  const out: THREE.BufferGeometry[] = [];
  const hz = (yy: number) => box(L, s, 0.01, x + s + L / 2, yy, z);
  const vt = (xx: number, yy: number) => box(s, L, 0.01, xx + s / 2, yy, z);
  if (on.includes('a')) out.push(hz(y + 2 * L + 2 * s));
  if (on.includes('g')) out.push(hz(y + L + s));
  if (on.includes('d')) out.push(hz(y));
  if (on.includes('f')) out.push(vt(x, y + L + s * 1.5));
  if (on.includes('b')) out.push(vt(x + L + s, y + L + s * 1.5));
  if (on.includes('e')) out.push(vt(x, y + s * 0.5));
  if (on.includes('c')) out.push(vt(x + L + s, y + s * 0.5));
  return out;
}
const digitsGeo = (s: string, x: number, y: number, z: number, L: number, w: number) =>
  [...s].flatMap((ch, i) => digitGeo(ch, x + i * (L + w * 3), y, z, L, w));

// ═══ in2-cityhall-floor：地板 16 × 12（原点 = 北边那条边的中点）：安静的灰石（大块石板、低对比的缝，参考图的办事处 / 银行地面）+ 门口一块深色地垫。
// 颜色不在地上：给柜台、椅子、窗口上的东西、墙（2026-11-18 第二轮：用户"让布局和画面自己说话"）。═══
const inFloor: AssetFn = (ctx) => {
  const W = 16;
  const D = 12;
  const stone = ctx.mat('court', {
    ramp: STONE,
    tones: undefined,
    ...LOCK,
    edge: 0.05,
    convex: 0,
    elem: { kind: 'stones', size: [44, 30], seam: 1, hi: 0 },
    toneW: [0.25, 0.25],
  });
  const mat = ctx.mat('signBoard', { ramp: INDIGO_DK, tones: undefined, ...LOCK, edge: 0.05, convex: 0 });
  const p = new Parts();
  p.add(stone, flat(W, D, 0, 0.03, D / 2));
  // 门口的深色地垫（门洞 3 米）
  p.add(mat, flat(3.4, 1.6, 0, 0.04, D - 0.85));
  const g = p.group(ctx, 'valley-asset:in2-cityhall-floor');
  ctx.mats.prepare(g, { cast: false, receive: true });
  return g;
};

// ═══ in2-cityhall-north-wall：北墙的皮（16 米，本地 x −8…8，墙面 z 0）：柚木护墙板 + 靛紫上墙 + 顶线；西头一座大钟 ═══
const inNorthWall: AssetFn = (ctx) => {
  const m = mats(ctx);
  const p = new Parts();
  const Z = 0.02;
  p.add(m.teakFace, quad(16, 1.2, 0, 0, Z));
  p.add(m.brassFace, box(16, 0.08, 0.06, 0, 1.2, 0.04));
  p.add(m.indigo, quad(16, 3.1, 0, 1.28, Z));
  p.add(m.teakDk, box(16, 0.16, 0.1, 0, 4.34, 0.05));
  // 大钟（西头 x −6.6、y 3.3）：香槟金圈 + 奶白盘 + 12 个刻度 + 指针
  const cx = -6.6;
  const cy = 3.25;
  p.add(m.brassFace, disc(0.55, 0.05, cx, cy, 0.03));
  p.add(m.creamFace, disc(0.46, 0.02, cx, cy, 0.08));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const L = i % 3 === 0 ? 0.12 : 0.07;
    p.add(
      m.ink,
      box(T * 1.2, L, 0.01, 0, -L / 2, 0)
        .rotateZ(-a)
        .translate(Math.sin(a) * 0.38, cy + Math.cos(a) * 0.38, 0.1)
        .translate(cx, 0, 0),
    );
  }
  p.add(
    m.ink,
    box(T * 1.5, 0.24, 0.01, 0, 0.12, 0)
      .rotateZ(-0.5)
      .translate(cx, cy, 0.11),
  );
  p.add(
    m.ink,
    box(T * 1.2, 0.34, 0.01, 0, 0.17, 0)
      .rotateZ(1.9)
      .translate(cx, cy, 0.115),
  );
  return p.group(ctx, 'valley-asset:in2-cityhall-north-wall');
};

// ── 7 × 7 的像素图标（墙上的窗口牌、委员台的徽：店里不写字，用图标）──
const ICONS: Record<string, string[]> = {
  trophy: ['#.###.#', '#.###.#', '.#####.', '..###..', '...#...', '..###..', '.#####.'],
  house: ['...#...', '..###..', '.#####.', '#######', '.##.##.', '.##.##.', '.#####.'],
  envelope: ['#######', '##...##', '#.#.#.#', '#..#..#', '#.....#', '#.....#', '#######'],
  pillars: ['.#####.', '#######', '.#.#.#.', '.#.#.#.', '.#.#.#.', '.#.#.#.', '#######'],
};
/** 图标（朝 +z 的平片）：中心 (x, y)、一格 c 米（竖直面上一行 = c / cos45） */
function iconGeo(name: string, x: number, y: number, z: number, c: number): THREE.BufferGeometry[] {
  const rows = ICONS[name];
  const r = c / Math.SQRT1_2;
  const out: THREE.BufferGeometry[] = [];
  rows.forEach((row, i) => {
    let k = 0;
    while (k < 7) {
      if (row[k] !== '#') {
        k++;
        continue;
      }
      let e = k;
      while (e < 7 && row[e] === '#') e++;
      out.push(quad((e - k) * c, r, x + ((k + e) / 2 - 3.5) * c, y + (3 - i) * r - r / 2, z));
      k = e;
    }
  });
  return out;
}

// ═══ in2-cityhall-window：一个办事窗口（原点 = 北墙脚、窗口正中；+z 朝南）。3.4 宽：两侧柚木隔板（墙 → z 2.2，2.3 高）、
// 柜台（z 1.5…2.2，柚木正面 + 青绿台面）、台上一道矮玻璃挡板（办事员的头和肩露在上面）、柜台里一张小桌 + 一台电脑。
// **窗口办什么看台面上的东西**（不写字）：v0 办赛许可 = 一摞彩色表格 + 一个红柄印章 + 一个小网球奖杯；
// v1 扩建审批 = 三卷蓝图 + 摊开的一张 + 一个房子模型；v2 书记处 = 柜台后靠墙的文件柜 + 台上一摞档案盒 + 一个信封。
// 墙上（办事员头顶上方）一块深蓝圆牌 + 金色图标（奖杯 / 房子 / 信封）。v ≥ 10 = 听证会那天：卷帘拉下来（台面上的东西收走）。═══
const inWindow: AssetFn = (ctx) => {
  const m = mats(ctx);
  const closed = ctx.variant >= 10;
  const n = ctx.variant % 10;
  const p = new Parts();
  const W = 3.4;
  const lit = (ramp: Ramp) => ctx.mat('signPaint', { ramp, tones: undefined, ...FRONT });
  // 两侧隔板（0.14 厚、2.3 高，从墙到柜台前沿；顶上一条香槟金压边）
  for (const s of [-1, 1]) {
    p.add(m.teak, box(0.14, 2.3, 2.2, s * (W / 2 - 0.07), 0, 1.1));
    p.add(m.brass, box(0.16, 0.05, 2.22, s * (W / 2 - 0.07), 2.3, 1.1));
  }
  // 柜台：正面柚木 + 青绿台面（前沿 z 2.2）
  p.add(m.teakFace, quad(W - 0.28, 1.0, 0, 0, 2.2));
  p.add(m.teak, box(W - 0.28, 1.0, 0.7, 0, 0, 1.85));
  p.add(m.cream, box(W - 0.2, 0.07, 0.82, 0, 1.0, 1.85));
  const TOP = 1.07;
  if (!closed) {
    // 矮玻璃挡板 + 镀铬条；柜台里：小桌 + 电脑
    p.add(m.glass, box(W - 0.4, 0.5, 0.04, 0, 1.25, 1.62));
    p.add(m.chrome, box(W - 0.36, 0.04, 0.06, 0, 1.75, 1.62));
    p.add(m.teakDk, box(1.6, 0.75, 0.6, 0.6, 0, 0.6));
    p.add(m.ink, box(0.5, 0.34, 0.06, 1.05, 1.07, 1.3), box(0.1, 0.2, 0.1, 1.05, 0.87, 1.3));
    if (n === 0) {
      // 办赛许可：一摞彩色表格（错开的三张）+ 红柄印章 + 小网球奖杯
      for (const [k, r] of PAPERS.slice(1).entries())
        p.add(lit(r), box(0.46, 0.04, 0.34, -0.95 + k * 0.05, TOP + k * 0.04, 1.95 - k * 0.03));
      p.add(m.ink, box(0.16, 0.08, 0.12, -0.35, TOP, 1.98));
      p.add(
        lit(RED_CLOTH),
        cyl(0.05, 0.05, 0.2, -0.35, TOP + 0.08, 1.98, 8),
        new THREE.SphereGeometry(0.08, 8, 6).translate(-0.35, TOP + 0.32, 1.98),
      );
      p.add(m.brass, box(0.3, 0.08, 0.22, 1.05, TOP, 1.95), cyl(0.05, 0.05, 0.18, 1.05, TOP + 0.08, 1.95, 8));
      p.add(m.brass, cyl(0.1, 0.2, 0.28, 1.05, TOP + 0.26, 1.95, 10));
      for (const s of [-1, 1]) p.add(m.brass, box(0.05, 0.16, 0.05, 1.05 + s * 0.23, TOP + 0.34, 1.95));
      p.add(lit(BALL), new THREE.SphereGeometry(0.11, 10, 8).translate(1.05, TOP + 0.64, 1.95));
    } else if (n === 1) {
      // 扩建审批：三卷蓝图（横放的蓝圆筒）+ 摊开的一张（蓝底 + 白线）+ 房子模型（白墙 + 红顶）
      for (let k = 0; k < 3; k++)
        p.add(
          lit(BLUEPRINT),
          new THREE.CylinderGeometry(0.075, 0.075, 0.8, 8)
            .rotateZ(Math.PI / 2)
            .translate(-0.95, TOP + 0.075 + (k === 2 ? 0.13 : 0), 1.83 + (k === 2 ? 0.08 : k * 0.16)),
        );
      p.add(lit(BLUEPRINT), box(0.62, 0.02, 0.42, -0.15, TOP, 1.95));
      for (let k = 0; k < 3; k++)
        p.add(m.creamFace, box(0.48 - k * 0.12, 0.01, T * 0.8, -0.15, TOP + 0.02, 1.84 + k * 0.1));
      p.add(m.creamFace, box(0.58, 0.36, 0.42, 1.0, TOP, 1.95));
      const roof = new THREE.CylinderGeometry(0.01, 0.42, 0.28, 4)
        .rotateY(Math.PI / 4)
        .scale(1.0, 1, 0.75)
        .translate(1.0, TOP + 0.5, 1.95);
      p.add(lit(RED_CLOTH), roof);
      p.add(m.glass, box(0.1, 0.12, 0.01, 0.86, TOP + 0.12, 2.165), box(0.1, 0.2, 0.01, 1.12, TOP, 2.165));
    } else {
      // 书记处：柜台后靠墙的文件柜（三层抽屉）+ 台上一摞档案盒 + 一个信封
      p.add(m.shutter, box(0.7, 1.45, 0.55, -1.05, 0, 0.32));
      for (let k = 0; k < 3; k++) {
        p.add(m.ink, box(0.6, T * 0.6, 0.01, -1.05, 0.45 + k * 0.45, 0.6));
        p.add(m.chrome, box(0.18, 0.05, 0.03, -1.05, 0.28 + k * 0.45, 0.61));
      }
      for (let k = 0; k < 3; k++) p.add(lit(KRAFT), box(0.48, 0.2, 0.32, 0.95 + (k % 2) * 0.04, TOP + k * 0.2, 1.95));
      p.add(m.creamFace, box(0.42, 0.02, 0.28, -0.25, TOP, 1.97));
      p.add(
        m.ink,
        box(0.3, 0.012, T * 0.7, -0.33, TOP + 0.02, 1.9).rotateY(0.5),
        box(0.3, 0.012, T * 0.7, -0.17, TOP + 0.02, 1.9).rotateY(-0.5),
      );
    }
  } else {
    // 卷帘：贴墙的箱子 + 拉到台面的帘子（一条条横缝），柜台里看不见人
    p.add(m.indigoDk, box(W - 0.28, 0.3, 0.4, 0, 2.3, 0.2));
    p.add(m.shutter, box(W - 0.28, 1.3, 0.06, 0, 1.07, 1.62));
    p.add(m.shutter, new THREE.PlaneGeometry(W - 0.28, 1.6).rotateX(-Math.PI / 2 + 0.5).translate(0, 2.0, 0.9));
  }
  // 墙上的窗口牌：深蓝圆 + 金边 + 金色图标（办事员头顶上方）
  const ICON = ['trophy', 'house', 'envelope'][n] ?? 'envelope';
  p.add(m.brassFace, disc(0.4, 0.03, 0, 2.95, 0.03));
  p.add(m.indigoDk, disc(0.35, 0.02, 0, 2.95, 0.06));
  p.add(m.brassFace, ...iconGeo(ICON, 0, 2.95, 0.085, 0.07));
  return p.group(ctx, `valley-asset:in2-cityhall-window`);
};

// ═══ in2-cityhall-stanchions：一排铜色隔离柱 + 红绒绳（原点 = 排的中心，沿 x；n = 3 根，间距 1.0）= 排队（参考图的银行）═══
const inStanchions: AssetFn = (ctx) => {
  const m = mats(ctx);
  const rope = ctx.mat('signBoard', { ramp: RED_CLOTH, tones: undefined, ...FRONT, convex: 0.5 });
  const n = ctx.variant > 1 ? ctx.variant : 3;
  const p = new Parts();
  for (let k = 0; k < n; k++) {
    const x = (k - (n - 1) / 2) * 1.0;
    p.add(m.ink, cyl(0.17, 0.17, 0.05, x, 0, 0, 12));
    p.add(m.brass, cyl(0.035, 0.035, 0.9, x, 0.05, 0, 8), new THREE.SphereGeometry(0.06, 8, 6).translate(x, 1.0, 0));
    if (k < n - 1) {
      // 绳子：往下垂的两段
      for (const [a, b] of [
        [0, 0.5],
        [0.5, 1],
      ]) {
        const x0 = x + a;
        const x1 = x + b;
        const y0 = 0.85 - (a === 0 ? 0 : 0.14);
        const y1 = 0.85 - (a === 0 ? 0.14 : 0);
        const len = Math.hypot(x1 - x0, y1 - y0);
        p.add(
          rope,
          box(len, 0.05, 0.05, 0, -0.025, 0)
            .rotateZ(Math.atan2(y1 - y0, x1 - x0))
            .translate(x0 + (x1 - x0) / 2 - Math.cos(Math.atan2(y1 - y0, x1 - x0)) * 0, (y0 + y1) / 2, 0)
            .translate(0, 0, 0),
        );
      }
    }
  }
  return p.group(ctx, 'valley-asset:in2-cityhall-stanchions');
};

// ═══ in2-cityhall-ticket：取号机（原点 = 底座中心；参考图的办事处）：一块立着的白牌，上面一个**大红向下箭头**指着下面的出票口
// （票露出一截），牌顶一块红字数码屏"07"；底座 + 一根立柱。不写字：箭头 + 出票口就是"在这儿拿号"。═══
const inTicket: AssetFn = (ctx) => {
  const m = mats(ctx);
  const red = ctx.mat('signPaint', { ramp: RED_CLOTH, tones: undefined, ...LOCK });
  const white = ctx.mat('signPaint', { ramp: WHITE_CLOTH, tones: undefined, ...LOCK });
  const p = new Parts();
  p.add(m.ink, box(0.6, 0.06, 0.45, 0, 0, 0));
  p.add(m.indigoDk, box(0.12, 0.45, 0.12, 0, 0.06, 0));
  // 白牌（0.7 × 1.1，离地 0.5）+ 红边
  p.add(red, box(0.78, 1.18, 0.12, 0, 0.46, 0));
  p.add(white, box(0.7, 1.1, 0.02, 0, 0.5, 0.07));
  // 大红箭头（朝下）：竖条 + 三角
  p.add(red, box(0.16, 0.38, 0.01, 0, 0.98, 0.085));
  const tri = new THREE.BufferGeometry().setAttribute(
    'position',
    new THREE.Float32BufferAttribute([-0.25, 0.98, 0.085, 0, 0.7, 0.085, 0.25, 0.98, 0.085], 3),
  );
  tri.computeVertexNormals();
  p.add(red, tri);
  // 出票口（黑缝）+ 露出来的票
  p.add(m.ink, box(0.34, 0.06, 0.02, 0, 0.6, 0.085));
  p.add(m.creamFace, box(0.18, 0.13, 0.01, 0, 0.5, 0.095));
  // 牌顶的红字数码屏
  p.add(m.ledBg, box(0.6, 0.34, 0.14, 0, 1.64, 0));
  p.add(m.led, ...digitsGeo('07', -0.2, 1.68, 0.075, 0.1, 0.03));
  return p.group(ctx, 'valley-asset:in2-cityhall-ticket');
};

// ═══ in2-cityhall-serving：墙上的叫号屏（原点 = 屏底边正中，贴墙 z 0）：1.3 × 0.72 的黑屏，一个大红号"07"（只有号，不写字）═══
const inServing: AssetFn = (ctx) => {
  const m = mats(ctx);
  const p = new Parts();
  // 一个号，大而清楚：1.3 × 0.72 的柚木框 + 黑屏 + 红字"07"
  p.add(m.teakDk, box(1.3, 0.76, 0.08, 0, -0.07, 0.04));
  p.add(m.ledBg, box(1.16, 0.62, 0.02, 0, 0, 0.09));
  p.add(m.led, ...digitsGeo('07', -0.31, 0.04, 0.105, 0.18, 0.05));
  return p.group(ctx, 'valley-asset:in2-cityhall-serving');
};

// ═══ in2-cityhall-notice：大公告栏（原点 = 两根腿中间的地面，朝南）：3.2 × 2.0 的软木板（离地 0.55）+ 柚木框 + 5 张大告示
// （每张一个大色块标题 + 两三行字）；v1 = 听证会：正中一张大红"今晚听证会"压在最上面。═══
const inNotice: AssetFn = (ctx) => {
  const m = mats(ctx);
  const cork = ctx.mat('kraft', {
    ramp: [0xc08a58, 0xa8764c, 0x6a5254],
    tones: undefined,
    ...LOCK,
    elem: { kind: 'stones', size: [4, 4], seam: 0, hi: 0 },
  });
  const p = new Parts();
  for (const s of [-1, 1]) p.add(m.teak, box(0.12, 2.75, 0.12, s * 1.6, 0, 0));
  p.add(m.teakDk, box(3.4, 2.2, 0.08, 0, 0.5, 0));
  p.add(cork, box(3.16, 1.96, 0.02, 0, 0.62, 0.05));
  const rnd = ctx.rng(`in2-cityhall-notice:${ctx.variant}`);
  const sheets: [number, number, number, number][] = [
    [-1.05, 1.62, 0.78, 0.82],
    [-0.12, 1.75, 0.72, 0.7],
    [0.85, 1.55, 0.8, 0.9],
    [-0.75, 0.72, 0.85, 0.75],
    [0.55, 0.7, 0.7, 0.72],
  ];
  sheets.forEach(([x, y, w, h], i) => {
    const pm = ctx.mat('signPaint', { ramp: PAPERS[i % PAPERS.length], tones: undefined, ...LOCK });
    p.add(pm, quad(w, h, x, y, 0.07 + i * 0.002));
    // 标题（一条粗的）+ 两三行字（细条）
    p.add(m.ink, quad(w * 0.7, ROW * 2, x, y + h - 0.16 - ROW * 2, 0.075 + i * 0.002));
    const lines = 2 + Math.floor(rnd() * 2);
    for (let k = 0; k < lines; k++)
      p.add(
        m.ink,
        quad(
          w * (0.5 + rnd() * 0.3),
          ROW * 0.7,
          x - w * 0.05,
          y + h - 0.36 - ROW * 2 - k * ROW * 2.2,
          0.075 + i * 0.002,
        ),
      );
    // 图钉
    p.add(m.brassFace, box(0.06, 0.06, 0.02, x, y + h - 0.06, 0.08 + i * 0.002));
  });
  if (ctx.variant === 1) {
    const red = ctx.mat('signBoard', { ramp: RED_CLOTH, tones: undefined, ...LOCK });
    p.add(red, quad(1.3, 1.0, 0.05, 1.0, 0.1));
    p.add(
      m.creamFace,
      quad(1.0, ROW * 2.4, 0.05, 1.68, 0.105),
      quad(0.8, ROW, 0.05, 1.44, 0.105),
      quad(0.9, ROW, 0.05, 1.26, 0.105),
    );
    // 一个大钟面的图（几点开会）
    p.add(m.creamFace, disc(0.14, 0.01, 0.05, 1.12, 0.105, 14));
  }
  return p.group(ctx, 'valley-asset:in2-cityhall-notice');
};

// ═══ in2-cityhall-chairs：一排玻璃钢椅（原点 = 排的中心）：n 把（v = 椅子数，默认 4），0.62 一把，芥末黄椅壳 + 镀铬腿 + 一根横梁；
// 椅子面朝 +z（摆的时候转 π = 朝北，看窗口 / 讲台）。═══
const inChairs: AssetFn = (ctx) => {
  const m = mats(ctx);
  const n = ctx.variant > 0 ? ctx.variant : 4;
  const p = new Parts();
  const step = 0.66;
  p.add(m.chrome, box(n * step, 0.06, 0.1, 0, 0.3, 0));
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * step;
    p.add(m.mustard, box(0.5, 0.08, 0.46, x, 0.44, 0.02));
    p.add(m.mustard, box(0.5, 0.42, 0.07, x, 0.5, -0.22).rotateX(0));
    for (const s of [-1, 1])
      p.add(m.chrome, box(0.04, 0.44, 0.04, x + s * 0.2, 0, 0.15), box(0.04, 0.44, 0.04, x + s * 0.2, 0, -0.15));
  }
  return p.group(ctx, 'valley-asset:in2-cityhall-chairs');
};

// ═══ in2-cityhall-plant：大盆栽（原点 = 盆底中心）：白色锥形花盆 + 金腿 + 一丛天堂鸟叶子（大片、往外伸）═══
const inPlant: AssetFn = (ctx) => {
  const m = mats(ctx);
  const p = new Parts();
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    p.add(m.brass, box(0.04, 0.3, 0.04, Math.cos(a) * 0.18, 0, Math.sin(a) * 0.18));
  }
  p.add(m.pot, cyl(0.2, 0.3, 0.5, 0, 0.28, 0, 12));
  const rnd = ctx.rng('in2-cityhall-plant');
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + rnd() * 0.5;
    const h = 0.9 + rnd() * 0.6;
    const leaf = box(0.22, h, 0.03, 0, h / 2, 0)
      .rotateX(0.35 + rnd() * 0.25)
      .rotateY(a)
      .translate(0, 0.75, 0);
    p.add(m.leaf, leaf);
  }
  return p.group(ctx, 'valley-asset:in2-cityhall-plant');
};

// ═══ in2-cityhall-flag：室内旗架（原点 = 底座中心）：铜底座 + 2.6 米旗杆 + 金顶 + 垂下来的旗（v0 蓝 / v1 红 / v2 白）═══
const inFlag: AssetFn = (ctx) => {
  const m = mats(ctx);
  const ramp = [NAVY_CLOTH, RED_CLOTH, WHITE_CLOTH][((ctx.variant % 3) + 3) % 3];
  const cloth = ctx.mat('signBoard', { ramp, tones: undefined, ...FRONT });
  const p = new Parts();
  p.add(m.brass, cyl(0.22, 0.16, 0.12, 0, 0, 0, 12));
  p.add(m.brass, cyl(0.025, 0.025, 2.6, 0, 0.1, 0, 6));
  p.add(m.brass, new THREE.IcosahedronGeometry(0.08, 0).translate(0, 2.76, 0));
  // 垂旗：靠杆的一块（垂着、往南鼓一点）+ 下摆一折
  p.add(cloth, box(0.7, 1.0, 0.04, 0.38, 1.55, 0.04).rotateY(-0.25));
  p.add(cloth, box(0.5, 0.5, 0.04, 0.42, 1.12, 0.12).rotateY(-0.5));
  return p.group(ctx, 'valley-asset:in2-cityhall-flag');
};

// ═══ in2-cityhall-dais：听证会的委员长桌（原点 = 桌子正面中点的地面，桌面朝南）：6.4 宽、0.95 高的柚木长桌（正面一块靛蓝挡板），
// 三个委员的名牌（奶白）+ 三支话筒；后面三把高背椅（委员坐在上面，人是 interiors 摆的）。═══
const inDais: AssetFn = (ctx) => {
  const m = mats(ctx);
  const p = new Parts();
  const W = 6.4;
  // 一级矮台（0.2 高）
  p.add(m.teakDk, box(W + 0.8, 0.2, 2.2, 0, 0, -0.9));
  p.add(m.teak, box(W, 0.82, 0.8, 0, 0.2, -0.4));
  p.add(m.cream, box(W + 0.1, 0.06, 0.9, 0, 1.02, -0.4));
  p.add(m.indigoDk, quad(W - 0.3, 0.6, 0, 0.3, 0.01));
  p.add(m.brassFace, quad(W - 0.3, T, 0, 0.9, 0.012));
  for (const x of [-2.2, 0, 2.2]) {
    p.add(m.creamFace, box(0.6, 0.18, 0.06, x, 1.08, -0.05).rotateX(0));
    p.add(m.ink, box(0.04, 0.32, 0.04, x + 0.4, 1.08, -0.35), box(0.12, 0.06, 0.12, x + 0.4, 1.4, -0.33));
    // 高背椅（桌子北边）
    p.add(m.teakDk, box(0.62, 1.35, 0.12, x, 0.2, -1.55));
    p.add(m.teakDk, box(0.6, 0.12, 0.55, x, 0.68, -1.25));
  }
  // 法槌 + 槌座（主席面前）：一眼"开庭 / 开会"
  p.add(m.teakDk, cyl(0.12, 0.12, 0.04, 0.45, 1.08, -0.25, 12));
  p.add(m.teakDk, box(0.3, 0.03, 0.03, 0.62, 1.16, -0.2).rotateY(0.4));
  p.add(m.teak, new THREE.CylinderGeometry(0.06, 0.06, 0.18, 10).rotateZ(Math.PI / 2).translate(0.5, 1.2, -0.25));
  // 桌子正面正中的城徽：金圈 + 深蓝 + 金色柱廊图标（不写字）
  p.add(m.brassFace, disc(0.3, 0.02, 0, 0.6, 0.015, 20));
  p.add(m.indigoDk, disc(0.26, 0.02, 0, 0.6, 0.03, 20));
  p.add(m.brassFace, ...iconGeo('pillars', 0, 0.6, 0.055, 0.05));
  return p.group(ctx, 'valley-asset:in2-cityhall-dais');
};

// ═══ in2-cityhall-podium：讲台（原点 = 底座中心；正面朝 +z —— 摆的时候转 π，让上台答辩的人面朝北对委员）：
// 柚木斜面讲台 + 正面一块香槟金的城徽圆 + 一支话筒。═══
const inPodium: AssetFn = (ctx) => {
  const m = mats(ctx);
  const p = new Parts();
  p.add(m.teak, box(0.8, 1.05, 0.55, 0, 0, 0));
  p.add(m.cream, box(0.86, 0.06, 0.6, 0, 1.05, -0.02).rotateX(-0.25).translate(0, 0.02, 0));
  p.add(m.brassFace, disc(0.2, 0.02, 0, 0.62, 0.28, 18));
  p.add(m.ink, box(0.03, 0.35, 0.03, 0.22, 1.1, -0.15), box(0.08, 0.05, 0.08, 0.22, 1.44, -0.13));
  return p.group(ctx, 'valley-asset:in2-cityhall-podium');
};

export const ASSETS: Record<string, AssetFn> = {
  'in2-cityhall-floor': inFloor,
  'in2-cityhall-north-wall': inNorthWall,
  'in2-cityhall-window': inWindow,
  'in2-cityhall-stanchions': inStanchions,
  'in2-cityhall-ticket': inTicket,
  'in2-cityhall-serving': inServing,
  'in2-cityhall-notice': inNotice,
  'in2-cityhall-chairs': inChairs,
  'in2-cityhall-plant': inPlant,
  'in2-cityhall-flag': inFlag,
  'in2-cityhall-dais': inDais,
  'in2-cityhall-podium': inPodium,
};
export type { M as CityhallMats };

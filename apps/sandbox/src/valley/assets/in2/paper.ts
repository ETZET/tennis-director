// 第二版报社店内的资产（id 以 in2-paper- 开头），归 paper 店内代理。本地原点 = 落地点中心，y 0 = 地面，+z 朝镜头（朝南），单位米。
// interiors/v2/paper.ts 摆（局部坐标 x 0…14 西 → 东、z 0…12 北 → 南）。
//
// 第二版的原则（Sneaky Sasquatch 的办事处 / 银行 / 办公室）：镜头近（店里 0.02 米/纹素），东西少而大、轮廓从地和墙上跳出来；
// 线按"半个设计纹素" T = 0.045 米（屏幕上 2 像素），竖直面上的横线按屏幕行 ROW = T / cos45 取整。
// 配色照上一轮的"深沉的老编辑部"（用户认可）：深梅色胡桃木地板、墨绿墙 + 胡桃木护墙板、牛血红、黄铜；亮处是纸的米白和台灯。
// 店里是固定的顶光（main.ts INDOOR_LOOK，仰角 65°）：朝南的竖直面落暗档 → 墙上挂的、家具正面给 WALL_FACE / FRONT（光往上偏，落中档）。
//
// 新材质（手挑 3 档 × 3 色，材质规范 v2：每档 [本色, 高一级, 低一级] + 缝 + 亮边，暗档往冷走）：
// - FLOOR_T：深梅色胡桃木地板（planks，南北向 0.42 米宽的板，缝 1 纹素）
// - WALNUT_T：胡桃木（家具、护墙板）；GREEN_T：编辑部的墨绿墙（大块低对比补丁）
// - OXBLOOD：牛血红长地毯（门 → 总编桌）；CARPET：总编桌下的墨绿地毯；FELT：分类广告板的深绿呢面
// - CAB：记者钢桌的橄榄绿烤漆；BANKER：银行家台灯绿玻璃；BEIGE：老电脑机壳；OLDPAPER：发黄的旧报；SEPIA：旧照片
// - NAVY：报头牌的深蓝（同外观的报头）；SLIPS：分类广告小纸条的四种浅色（米白、浅黄、浅粉、浅蓝）
//
// 2026-11-19 店里零字（用户："let the layout and visual do the explanation, not the subtext"）：
// 报头 THE DESERT SUN → 北墙正中一块深蓝报头牌，只有外观上那个太阳（铜圈 + 橙黄搪瓷 + 光芒）；
// ARCHIVE → 三张旧头版本身（版面线 + 标题色块 + 照片块）+ 画灯 + 框下铜牌上的年份（只有数字）；
// CLASSIFIEDS → 广告板钉满浅色小纸条（一张带撕条）+ 写字台正中一台正对客人的打字机；
// FRONT DESK → 前台台面上大服务铃 + 一摞今天的报（头版朝上：标题色块 + 照片块），墙角两捆扎好的报；
// EDITOR 铜牌 → 不要（大桌 + 高背皮椅 + 绿台灯 + 红笔圈过的样张就是总编）。字形只剩数字（年份、价签、钟面刻度）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { box } from '../../../clubsite/render/geo';
import type { Tones, ToonOpts } from '../../../clubsite/render/toon';
import type { AssetCtx, AssetFn } from '../../ctx';
import { textGeo } from '../../interiors/v2/kit';
import { SIGN_FACE } from '../../palette';

/** 半个设计纹素（米）：店里镜头近，线 = 2 屏幕像素 */
const T = 0.045;
/** 竖直面上一屏幕行（米） */
const ROW = T / Math.SQRT1_2;

type Ramp = [number, number, number];
const tn = (lit: Ramp, mid: Ramp, dark: Ramp, seam: Ramp, hi: Ramp): Tones => ({ bands: [lit, mid, dark], seam, hi });

// ── 调色板（渲染出来还要再过一层午后金光的暖调；按截图量过）──
/** 地板：深梅色胡桃木，L ≈ 52 / 47 / 42（亮档）；板缝 −15 */
const FLOOR_T = tn(
  [0x52224e, 0x582854, 0x4a1c46],
  [0x3e1a44, 0x441e48, 0x38163e],
  [0x261440, 0x2c1844, 0x22103c],
  [0x301034, 0x280e30, 0x160c30],
  [0x642e5a, 0x502450, 0x341c48],
);
const FLOOR: Ramp = [0x52224e, 0x3e1a44, 0x261440];
/** 胡桃木：深、偏红；亮档 L ~84 */
const WALNUT_T = tn(
  [0x8a4446, 0x944c4c, 0x803e40],
  [0x68323e, 0x703842, 0x602c3a],
  [0x3a2238, 0x42283e, 0x341e32],
  [0x6a3038, 0x4e2636, 0x281828],
  [0xa65a56, 0x82424a, 0x523450],
);
const WALNUT: Ramp = [0x8a4446, 0x68323e, 0x3a2238];
/** 编辑部的墙：墨绿（朝镜头 → 主要落中档） */
const GREEN_T = tn(
  [0x1c786c, 0x228072, 0x167064],
  [0x10625c, 0x166a62, 0x0c5a54],
  [0x123a44, 0x16404a, 0x10343e],
  [0x1e604c, 0x164e46, 0x0a2a36],
  [0x44967a, 0x34806e, 0x22505a],
);
const GREEN: Ramp = [0x1e7c6a, 0x126658, 0x123a44];
const OXBLOOD: Ramp = [0x8a2a42, 0x6c2038, 0x3a1630];
const CARPET: Ramp = [0x125c50, 0x0e4c46, 0x08303a];
/** 地毯的深浅只差 ±5（大块、安静：地面一个主色，不要杂纹） */
const RUNNER_T = tn(
  [0x8a2a42, 0x902e46, 0x84263e],
  [0x6c2038, 0x72243c, 0x661c34],
  [0x3a1630, 0x3e1a34, 0x36142c],
  [0x701e2a, 0x561a2a, 0x2a1028],
  [0xa23c44, 0x82303c, 0x4a1e3a],
);
const CARPET_T = tn(
  [0x125c50, 0x166254, 0x0e564a],
  [0x0e4c46, 0x12524a, 0x0a4640],
  [0x08303a, 0x0c343e, 0x062c36],
  [0x0a4840, 0x083a38, 0x04202c],
  [0x247062, 0x1a5c54, 0x0e3a44],
);
const FELT: Ramp = [0x1c5a46, 0x15483c, 0x0c2c34];
const CAB: Ramp = [0xa8c488, 0x74946e, 0x3e5468];
const BANKER: Ramp = [0x6cd09a, 0x30946e, 0x1e5058];
const BEIGE: Ramp = [0xece0bc, 0xc4b096, 0x6e6484];
const SCREEN: Ramp = [0x3e7a62, 0x2c5a52, 0x1c3a40];
const OLDPAPER: Ramp = [0xf2dc9c, 0xd8bc84, 0x7a6480];
/** 旧报上的字行：比纸暗 ~45（不到强边缘的 60） */
const PRINT: Ramp = [0xb89a74, 0x9c7e66, 0x5a4a66];
const SEPIA: Ramp = [0xb08a62, 0x8a6650, 0x4e3e52];
const CREAM: Ramp = [0xfbefd2, 0xe6d2b0, 0x9a8aa6];
const INKY: Ramp = [0x3a3448, 0x2c2838, 0x1c1a2a];
/** 报头牌的深蓝（同外观报头的 board） */
const NAVY: Ramp = [0x2a4a8a, 0x1e3a74, 0x16264e];
/** 分类广告的小纸条：米白、浅黄、浅粉、浅蓝（都比呢面亮 ≥ 60，挤在一起读成"一板纸条"） */
const SLIPS: Ramp[] = [
  [0xf6ead0, 0xdccab0, 0x8a7c98],
  [0xf6e494, 0xdcc478, 0x8a7a70],
  [0xf4c4c0, 0xd8a4a8, 0x8a6a88],
  [0xc4dcf0, 0xa4bcd8, 0x6a7898],
];

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
/** 朝 +z 的圆片（扁圆柱，厚 t） */
const disc = (r: number, t: number, x: number, y: number, z: number, n = 20) =>
  new THREE.CylinderGeometry(r, r, t, n).rotateX(Math.PI / 2).translate(x, y, z + t / 2);
/** 一圈框（朝 +z）：外宽 w、外高 h、框宽 b、厚 t，底 y */
function frame(w: number, h: number, b: number, t: number, x: number, y: number, z: number) {
  return [
    box(w, b, t, x, y, z),
    box(w, b, t, x, y + h - b, z),
    box(b, h - 2 * b, t, x - w / 2 + b / 2, y + b, z),
    box(b, h - 2 * b, t, x + w / 2 - b / 2, y + b, z),
  ];
}

/** 这几件共用的材质（每件资产一份；场景里按（键, 参数）缓存成一份） */
function mats(ctx: AssetCtx) {
  return {
    walnut: ctx.mat('surround', { ramp: WALNUT, tones: WALNUT_T }),
    walnutFront: ctx.mat('surround', { ramp: WALNUT, tones: WALNUT_T, ...FRONT }),
    walnutPlank: ctx.mat('surround', {
      ramp: WALNUT,
      tones: WALNUT_T,
      ...FRONT,
      elem: { kind: 'planks', p: [1, 0, 0, 0.3], seam: 1, hi: 0.6 },
    }),
    brass: ctx.mat('flowerYellow', { edge: 0.4, convex: 0.6, noShadowReceive: true }),
    brassFace: ctx.mat('flowerYellow', WALL_FACE),
    paper: ctx.mat('newsprint', { ramp: CREAM, noShadowReceive: true }),
    paperFace: ctx.mat('newsprint', { ramp: CREAM, ...WALL_FACE }),
    oldFace: ctx.mat('newsprint', { ramp: OLDPAPER, ...WALL_FACE }),
    print: ctx.mat('kraft', { ramp: PRINT, ...WALL_FACE }),
    printFlat: ctx.mat('kraft', { ramp: PRINT, noShadowReceive: true }),
    ink: ctx.mat('ironwork', { ramp: INKY, noShadowReceive: true }),
    inkFace: ctx.mat('ironwork', { ramp: INKY, ...WALL_FACE }),
    red: ctx.mat('clothRed', { noShadowReceive: true }),
    redFace: ctx.mat('clothRed', WALL_FACE),
    cab: ctx.mat('metal', { ramp: CAB }),
    cabFront: ctx.mat('metal', { ramp: CAB, ...FRONT }),
    iron: ctx.mat('ironwork', { noShadowReceive: true }),
  };
}
type M = ReturnType<typeof mats>;

// ── in2-paper-floor：地板（14 × 12，本地原点 = 北边那条边的中点 → 摆在 x 7、z 0）──
// 深梅色胡桃木板（南北向，0.42 米宽）+ 门到总编桌的牛血红长地毯（黄铜边）+ 总编桌底下的墨绿地毯
const inFloor: AssetFn = (ctx) => {
  const W = 14;
  const D = 12;
  const boards = ctx.mat('surround', {
    ramp: FLOOR,
    tones: FLOOR_T,
    edge: 0.05,
    convex: 0,
    elem: { kind: 'planks', p: [1, 0, 0, 0.42], seam: 1, hi: 0 },
    toneW: [0.3, 0.3],
  });
  const runner = ctx.mat('surround', {
    ramp: OXBLOOD,
    tones: RUNNER_T,
    edge: 0.08,
    convex: 0,
    elem: { kind: 'paint', size: [40, 24], density: [0, 0] },
    toneW: [0.2, 0.2],
  });
  const carpet = ctx.mat('metal', {
    ramp: CARPET,
    tones: CARPET_T,
    edge: 0.08,
    convex: 0,
    elem: { kind: 'paint', size: [40, 24], density: [0, 0] },
    toneW: [0.2, 0.2],
  });
  // 地毯的边：暗铜（原来是亮黄铜，2026-11-19 降下来：地上安静，亮的留给台面上的东西）
  const border = ctx.mat('flowerYellow', { ramp: [0x8a6a3e, 0x6a5038, 0x3a2c34], edge: 0.08, convex: 0 });
  const p = new Parts();
  p.add(boards, flat(W, D, 0, 0.03, D / 2));
  // 总编桌底下的墨绿地毯（x 4.4…9.6、z 0.9…4.3）+ 一圈黄铜边
  p.add(border, flat(5.2, 3.4, 0, 0.05, 2.6));
  p.add(carpet, flat(5.2 - 0.16, 3.4 - 0.16, 0, 0.054, 2.6));
  // 门到总编地毯的长条（宽 1.6，z 4.3…11.9）
  p.add(border, flat(1.6, 7.6, 0, 0.05, 8.1));
  p.add(runner, flat(1.6 - 0.16, 7.6 - 0.12, 0, 0.054, 8.1));
  const g = p.group(ctx, 'valley-asset:in2-paper-floor', [boards, runner, carpet, border]);
  ctx.mats.prepare(g, { cast: false, receive: true });
  return g;
};

// ── in2-paper-north-wall：北墙的皮（14 米宽，本地 x −7…7，墙面 z 0）：胡桃木护墙板 + 墨绿墙 + 顶线 + 正中的报头牌 + 钟 ──
// 报头牌（总编头顶，x −1.3…1.3、y 3.3…4.26）：深蓝底 + 一圈铜边，正中外观上那个太阳（铜圈、橙黄搪瓷、12 道光芒），
// 太阳两边各两道细铜线（报头的装饰线，不是字）。进门第一眼：太阳 = 外面招牌上的太阳报
const inNorthWall: AssetFn = (ctx) => {
  const m = mats(ctx);
  const green = ctx.mat('surround', {
    tones: GREEN_T,
    ramp: GREEN,
    ...WALL_FACE,
    elem: { kind: 'stones', size: [60, 30], seam: 0, hi: 0 },
    toneW: [0.12, 0.12],
  });
  const rail = ctx.mat('surround', { ramp: WALNUT, noShadowReceive: true });
  const navy = ctx.mat('signBoard', { ...WALL_FACE, ramp: NAVY });
  const sunO = ctx.mat('sunEnamel', WALL_FACE);
  const sunI = ctx.mat('sunEnamel', { ...WALL_FACE, bands: [-0.9, -0.5] });
  const face = ctx.mat('signPaint', { ...WALL_FACE, lightUp: 0.8, bands: [-0.8, -0.2] });
  const p = new Parts();
  const Z = 0.02;
  // 护墙板（0…1.15，竖板）+ 压条 + 踢脚
  p.add(m.walnutPlank, quad(14, 1.15, 0, 0, Z));
  p.add(rail, box(14, 0.1, 0.1, 0, 1.15, 0.05), box(14, 0.12, 0.06, 0, 0, 0.03));
  // 上半截墨绿 + 顶线
  p.add(green, quad(14, 3.1, 0, 1.25, Z));
  p.add(rail, box(14, 0.14, 0.12, 0, 4.36, 0.06));
  // 报头牌：深蓝底 + 铜边框 + 太阳 + 两边的装饰线
  {
    const bw = 2.6;
    const y0 = 3.3;
    const bh = 0.96;
    const cy = y0 + bh / 2;
    p.add(navy, box(bw, bh, 0.06, 0, y0, 0.03));
    p.add(m.brassFace, ...frame(bw, bh, ROW, 0.02, 0, y0, 0.06));
    p.add(m.brassFace, disc(0.34, 0.03, 0, cy, 0.07, 24));
    p.add(sunO, disc(0.28, 0.03, 0, cy, 0.1, 24));
    p.add(sunI, disc(0.15, 0.02, 0, cy, 0.13, 20));
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      p.add(
        m.brassFace,
        box(T * 1.4, 0.1, 0.02, 0, 0, 0)
          .translate(0, 0.37, 0)
          .rotateZ(a)
          .translate(0, cy, 0.07),
      );
    }
    for (const sx of [-1, 1])
      for (const dy of [-0.09, 0.07]) p.add(m.brassFace, quad(0.62, ROW, sx * 0.86, cy + dy, 0.075));
  }
  // 钟（书架上方，x 4.6、y 3.55）：胡桃木框 + 白盘 + 四个刻度 + 指针（10:10）
  {
    const cx = 4.6;
    const cy = 3.55;
    p.add(rail, disc(0.4, 0.06, cx, cy, 0.02, 24));
    p.add(face, disc(0.32, 0.02, cx, cy, 0.08, 24));
    for (const [dx, dy] of [
      [0, 0.24],
      [0.24, 0],
      [0, -0.24],
      [-0.24, 0],
    ])
      p.add(m.inkFace, box(T * 1.4, T * 1.4, 0.01, cx + dx, cy + dy - T * 0.7, 0.1));
    p.add(
      m.inkFace,
      box(T * 1.3, 0.2, 0.01, 0, 0, 0)
        .rotateZ(0.95)
        .translate(cx, cy, 0.11),
      box(T * 1.3, 0.27, 0.01, 0, 0, 0)
        .rotateZ(-0.95)
        .translate(cx, cy, 0.11),
    );
  }
  return p.group(ctx, 'valley-asset:in2-paper-north-wall', [
    m.walnutPlank,
    rail,
    green,
    navy,
    m.brassFace,
    sunO,
    sunI,
    face,
    m.inkFace,
  ]);
};

// ── 旧报（朝 +z 的一张，挂在框里）：报头一条、标题两条粗、照片、三栏字行 ──
function frontPage(
  p: Parts,
  m: M,
  photo: THREE.Material,
  w: number,
  h: number,
  x: number,
  y: number,
  z: number,
  pic: (px: number, py: number, pw: number, ph: number, pz: number) => void,
) {
  const pad = 0.07;
  p.add(m.oldFace, quad(w, h, x, y, z));
  const x0 = x - w / 2 + pad;
  const x1 = x + w / 2 - pad;
  const iw = x1 - x0;
  let top = y + h - pad;
  // 报头：一条粗的 + 下面一条细线
  p.add(m.inkFace, quad(iw * 0.78, ROW * 2, x, top - ROW * 2, z + 0.004));
  top -= ROW * 3;
  p.add(m.print, quad(iw, ROW, x, top - ROW, z + 0.004));
  top -= ROW * 2.5;
  // 大标题：两行粗字（第二行短一点）
  p.add(m.inkFace, quad(iw, ROW * 2, x, top - ROW * 2, z + 0.004));
  top -= ROW * 3;
  p.add(m.inkFace, quad(iw * 0.66, ROW * 2, x0 + (iw * 0.66) / 2, top - ROW * 2, z + 0.004));
  top -= ROW * 3.5;
  // 照片（左边三分之二）+ 右边一栏字
  const ph = Math.min(h * 0.4, iw * 0.55);
  const pw = iw * 0.62;
  p.add(photo, quad(pw, ph, x0 + pw / 2, top - ph, z + 0.004));
  pic(x0 + pw / 2, top - ph, pw, ph, z + 0.008);
  for (let ly = top - ROW; ly > top - ph; ly -= ROW * 2)
    p.add(m.print, quad(iw - pw - T * 2, ROW, x1 - (iw - pw - T * 2) / 2, ly, z + 0.004));
  top -= ph + ROW * 1.5;
  // 下面三栏字行
  const cw = (iw - T * 4) / 3;
  for (let c = 0; c < 3; c++)
    for (let ly = top - ROW; ly > y + pad; ly -= ROW * 2)
      p.add(
        m.print,
        quad(c === 2 && ly < y + pad + ROW * 4 ? cw * 0.5 : cw, ROW, x0 + cw / 2 + c * (cw + T * 2), ly, z + 0.004),
      );
}

// ── in2-paper-archive：北墙西段的三张镶框旧头版（P3，本地原点 = 中间那张的底边正中，墙面 z 0）──
// 中间最大的是 1960 年那期（俱乐部开张：照片里一块球场、两棵棕榈、太阳）；两边 1948（镇上老楼的剪影）、1977（第一座奖杯）。框上方各一盏黄铜画灯，
// 框下各一块小铜牌，只刻年份（1 纹素 5×7 数字，墨色）：画灯 + 铜牌 = "挂起来的老东西"，不用 ARCHIVE 字条。
// 铜牌在框底下 0.06…0.36 米（摆在 y 1.65 时落在护墙板压条上面）
const inArchive: AssetFn = (ctx) => {
  const m = mats(ctx);
  const sepia = ctx.mat('kraft', { ramp: SEPIA, ...WALL_FACE });
  const courtG = ctx.mat('surround', { ...WALL_FACE, ramp: [0x5aa874, 0x3e8a6a, 0x2a5458] });
  const palm = ctx.mat('lawn', { ...WALL_FACE, ramp: [0x4a7a4a, 0x3a6448, 0x24404a] });
  const sky = ctx.mat('newsprint', { ...WALL_FACE, ramp: [0xe8d4a8, 0xccb48e, 0x7a6884] });
  const frameM = ctx.mat('ironwork', { ramp: [0x4a3a3c, 0x3a2e34, 0x221c2a], ...WALL_FACE });
  const lamp = ctx.mat('flowerYellow', { edge: 0.4, convex: 0.6, noShadowReceive: true, lightUp: 0.5 });
  const p = new Parts();
  const pages: [number, number, number, number][] = [
    // x, 宽, 高, 底
    [-1.55, 1.0, 1.3, 0.1],
    [0, 1.3, 1.62, 0],
    [1.55, 1.0, 1.3, 0.1],
  ];
  pages.forEach(([x, w, h, y0], i) => {
    const b = i === 1 ? 0.1 : 0.08;
    // 框（黑胡桃）+ 一圈米白卡纸
    p.add(i === 1 ? m.walnut : frameM, ...frame(w + b * 2 + 0.08, h + b * 2 + 0.08, b, 0.06, x, y0, 0.01));
    p.add(m.paperFace, quad(w + 0.08, h + 0.08, x, y0 + b, 0.03));
    frontPage(p, m, i === 1 ? sky : sepia, w, h, x, y0 + b + 0.04, 0.034, (px, py, pw, ph, pz) => {
      if (i === 1) {
        // 1960：开张那天的照片 —— 一块绿球场（白线）、两棵棕榈、太阳
        p.add(courtG, quad(pw * 0.8, ph * 0.42, px, py + ph * 0.06, pz));
        p.add(m.paperFace, quad(pw * 0.8, T, px, py + ph * 0.27, pz + 0.002));
        p.add(m.paperFace, quad(T, ph * 0.42, px, py + ph * 0.06, pz + 0.002));
        for (const sx of [-0.36, 0.36]) {
          p.add(sepia, quad(T * 1.4, ph * 0.5, px + pw * sx, py + ph * 0.3, pz + 0.003));
          p.add(palm, disc(ph * 0.14, 0.004, px + pw * sx, py + ph * 0.82, pz, 8));
        }
        p.add(m.brassFace, disc(ph * 0.1, 0.004, px + pw * 0.08, py + ph * 0.74, pz, 12));
      } else if (i === 2) {
        // 1977：第一座奖杯（深底上一只铜奖杯：杯身、两只耳、杯脚、底座）
        p.add(m.inkFace, quad(pw * 0.8, ph * 0.8, px, py + ph * 0.1, pz));
        p.add(m.brassFace, disc(ph * 0.17, 0.004, px, py + ph * 0.62, pz, 12));
        p.add(m.brassFace, quad(ph * 0.34, ph * 0.12, px, py + ph * 0.62, pz + 0.001));
        for (const sx of [-1, 1]) p.add(m.brassFace, quad(T, ph * 0.14, px + sx * ph * 0.21, py + ph * 0.56, pz));
        p.add(m.brassFace, quad(T * 1.2, ph * 0.14, px, py + ph * 0.32, pz));
        p.add(m.brassFace, quad(ph * 0.3, ph * 0.1, px, py + ph * 0.22, pz));
      } else {
        // 1948：一块深色剪影（镇上的老楼）
        p.add(m.inkFace, quad(pw * 0.7, ph * 0.38, px, py + ph * 0.1, pz));
      }
    });
    // 年份铜牌（框底下）：铜板 + 一圈暗边 + 墨色数字
    {
      const year = ['1948', '1960', '1977'][i];
      const py = -0.36;
      p.add(m.inkFace, quad(0.66, 0.3, x, py, 0.03));
      p.add(m.brassFace, quad(0.62, 0.3 - ROW * 0.6, x, py + ROW * 0.3, 0.034));
      p.add(m.inkFace, textGeo(year, { cell: 0.0225, x, y: py + (0.3 - (7 * 0.0225) / Math.SQRT1_2) / 2, z: 0.038 }));
    }
    // 画灯：一根黄铜杆 + 横着的灯罩（框顶上方）
    const top = y0 + h + b * 2 + 0.08;
    p.add(
      lamp,
      box(T, 0.16, 0.12, x, top, 0.05),
      cyl(0.05, 0.05, w * 0.55, 0, 0, 0, 8)
        .rotateZ(Math.PI / 2)
        .translate(x, top + 0.16, 0.14),
    );
  });
  return p.group(ctx, 'valley-asset:in2-paper-archive', [
    m.walnut,
    frameM,
    m.paperFace,
    m.oldFace,
    m.print,
    m.inkFace,
    sepia,
    sky,
    courtG,
    palm,
    m.brassFace,
    lamp,
  ]);
};

// ── 银行家台灯（铜座 + 绿玻璃半圆罩，东西向）──
function bankerLamp(p: Parts, m: M, shade: THREE.Material, x: number, y: number, z: number) {
  p.add(m.brass, cyl(0.13, 0.11, 0.05, x, y, z), box(0.05, 0.32, 0.05, x, y + 0.05, z - 0.04));
  p.add(
    shade,
    new THREE.CylinderGeometry(0.15, 0.15, 0.48, 12, 1, false, 0, Math.PI)
      .rotateZ(Math.PI / 2)
      .translate(x, y + 0.38, z),
  );
}

// ── in2-paper-editor-desk：总编的胡桃木大桌（2.8 × 0.78 × 1.2）。总编坐北朝南，访客在南边（镜头这边）。
// 两个抽屉柜（铜拉手）+ 中间的挡板；桌面：绿皮桌垫、银行家台灯、黑电话、一摞稿子、样张（P1：红笔圈了一块）、铜笔筒。
// 没有名牌：屋里最大的一张桌 + 高背皮椅 + 绿台灯 + 正对门口，就是总编
const inEditorDesk: AssetFn = (ctx) => {
  const m = mats(ctx);
  const shade = ctx.mat('metal', { ramp: BANKER, lightUp: 0.35, noShadowReceive: true });
  const blotter = ctx.mat('metal', { ramp: [0x2a6a52, 0x1e5446, 0x10303a], noShadowReceive: true });
  const phone = ctx.mat('ironwork', { ramp: [0x4a4458, 0x2e2a3c, 0x1a1828], noShadowReceive: true, convex: 0.6 });
  const p = new Parts();
  const W = 2.8;
  const D = 1.2;
  const H = 0.78;
  // 桌面
  p.add(m.walnut, box(W, 0.07, D, 0, H - 0.07, 0));
  // 两个抽屉柜（正面朝 +z）+ 中间的挡板（往里收 0.15）
  for (const sx of [-1, 1]) {
    const cx = sx * (W / 2 - 0.4);
    p.add(m.walnutFront, box(0.78, H - 0.07, D - 0.08, cx, 0, 0));
    for (let i = 0; i < 3; i++) {
      const y = 0.08 + i * 0.21;
      p.add(m.walnut, box(0.66, 0.17, 0.02, cx, y, D / 2 - 0.03));
      p.add(m.brass, box(0.18, T, 0.03, cx, y + 0.08, D / 2));
    }
  }
  p.add(m.walnutPlank, box(W - 1.6, H - 0.2, 0.05, 0, 0.1, D / 2 - 0.18));
  // 桌面上的：绿皮桌垫（总编面前）、台灯（西）、电话（东）、稿子、样张、笔筒
  p.add(blotter, flat(1.1, 0.6, 0, H + 0.004, -0.12));
  bankerLamp(p, m, shade, -1.05, H, -0.3);
  // 电话：底座 + 听筒
  p.add(phone, box(0.3, 0.1, 0.24, 1.0, H, -0.2), box(0.36, 0.07, 0.09, 1.0, H + 0.1, -0.2));
  // 一摞稿子
  p.add(m.paper, box(0.4, 0.12, 0.3, 0.7, H, 0.2), box(0.38, 0.03, 0.28, 0.72, H + 0.12, 0.19));
  // 样张（P1：总编当场用红笔圈一块）：摊在桌垫上靠南，一个红圈 + 一支红笔
  p.add(m.paper, flat(0.52, 0.4, -0.18, H + 0.01, 0.2));
  p.add(m.printFlat, flat(0.4, T, -0.18, H + 0.014, 0.06), flat(0.24, T, -0.24, H + 0.014, 0.16));
  p.add(m.red, new THREE.RingGeometry(0.075, 0.105, 16).rotateX(-Math.PI / 2).translate(-0.06, H + 0.016, 0.26));
  p.add(
    m.red,
    box(0.22, 0.025, 0.025, 0, 0, 0)
      .rotateY(0.5)
      .translate(0.16, H + 0.01, 0.3),
  );
  // 铜笔筒
  p.add(m.brass, cyl(0.06, 0.06, 0.16, 0.45, H, -0.32, 10));
  return p.group(ctx, 'valley-asset:in2-paper-editor-desk', [m.paper, m.printFlat, m.red, blotter, phone]);
};

// ── in2-paper-ad-board：分类广告的板子 + 写字台（P1 的另一头：自己挑一种登法）。本地原点 = 板子底边正中（板面 z 0），写字台在南边 z 0.62。
// 板子：两根胡桃木立柱、深绿呢面，**钉满**浅色小纸条（分类广告：米白 / 浅黄 / 浅粉 / 浅蓝，每张几条看不清的线 + 一颗红图钉，
// 一张底下一排撕条）；三种登法的样张夹在里面：西边一簇小纸条本身（小块分类）、中间体育版半版（蓝场地 + 黄网球的照片）、
// 东边整张头版（最下面一条红框圈出来 = 头版下面一条）。每种下面一个价签（kit，interiors 摆）。
// 写字台：正中一台**正对客人**的黑打字机（三排米白键、滚筒上卷着一张纸、左边一根亮的回车杆）+ 一张空白登记表、铜笔筒、一摞旧报
const inAdBoard: AssetFn = (ctx) => {
  const m = mats(ctx);
  const felt = ctx.mat('metal', { ramp: FELT, ...WALL_FACE, elem: { kind: 'paint', size: [24, 14] } });
  const ball = ctx.mat('flowerYellow', { ...WALL_FACE, ramp: [0xe4f070, 0xc4d050, 0x6a7448] });
  const photoG = ctx.mat('surround', { ...WALL_FACE, ramp: [0x4aa0b8, 0x3a7aa0, 0x2a4c78] });
  const slip = SLIPS.map((r) => ctx.mat('newsprint', { ramp: r, ...WALL_FACE }));
  const keys = ctx.mat('newsprint', { ramp: CREAM, noShadowReceive: true });
  const chrome = ctx.mat('metal', {
    ramp: [0xe8eef4, 0xb4c0cc, 0x5e6a84],
    edge: 0.4,
    convex: 0.6,
    noShadowReceive: true,
  });
  const p = new Parts();
  const BW = 3.1;
  // 立柱 + 板（y 0.62…2.45；呢面下面一条胡桃木沿 0.62…0.98 挂价签）+ 顶上一道压条
  for (const sx of [-1, 1]) p.add(m.walnut, box(0.1, 2.7, 0.1, (sx * (BW + 0.1)) / 2, 0, 0));
  p.add(m.walnutFront, box(BW, 1.83, 0.06, 0, 0.62, 0));
  p.add(felt, quad(BW - 0.16, 1.39, 0, 0.98, 0.032));
  p.add(m.walnut, box(BW + 0.2, 0.08, 0.1, 0, 2.45, 0));
  const Z = 0.04;
  const pin = (x: number, y: number, z = Z) => p.add(m.redFace, box(T * 1.6, ROW * 1.4, 0.02, x, y, z + 0.004));
  /** 一张小纸条：w × h，颜色 c，几条看不清的线（第一条粗 = 小标题），顶上一颗图钉；tabs = 底下一排撕条 */
  const note = (x: number, y: number, w: number, h: number, c: number, z = Z, tabs = false) => {
    p.add(slip[c % slip.length], quad(w, h, x, y, z));
    p.add(m.print, quad(w * 0.62, ROW, x, y + h - ROW * 2.6, z + 0.003));
    const bottom = tabs ? y + 0.13 : y + 0.04;
    for (let ly = y + h - ROW * 3.8; ly > bottom; ly -= ROW) p.add(m.print, quad(w * 0.76, ROW / 2, x, ly, z + 0.003));
    if (tabs) {
      for (let k = 1; k < 4; k++) p.add(m.inkFace, quad(T / 2, 0.11, x - w / 2 + (w / 4) * k, y, z + 0.002));
      for (let k = 0; k < 4; k++)
        p.add(m.print, quad(T / 2, 0.07, x - w / 2 + (w / 4) * (k + 0.5), y + 0.02, z + 0.003));
    }
    pin(x, y + h - ROW * 1.2, z);
  };
  // ① 西边：一簇小纸条（小块分类广告），2 列 × 3 行，错开一点
  {
    const cols = [-1.25, -0.82];
    const rows = [1.03, 1.47, 1.9];
    let c = 0;
    for (const [ri, y] of rows.entries())
      for (const [ci, x] of cols.entries()) {
        const w = 0.36 + ((ri + ci) % 2) * 0.04;
        const h = 0.38 + (ri === 2 ? 0 : ((ri * 3 + ci) % 3) * 0.02);
        note(x + (ri % 2 ? 0.03 : -0.02), y, w, h, c++, Z, ri === 0 && ci === 1);
      }
  }
  // ② 体育版半版（0.92 × 0.96）：照片 = 蓝场地上一个黄网球
  {
    const x = 0.02;
    const y = 1.3;
    p.add(m.paperFace, quad(0.92, 0.96, x, y, Z));
    p.add(m.inkFace, quad(0.78, ROW * 2, x, y + 0.84, Z + 0.003));
    p.add(photoG, quad(0.78, 0.46, x, y + 0.3, Z + 0.003));
    p.add(m.paperFace, quad(0.78, T, x, y + 0.53, Z + 0.006));
    p.add(ball, disc(0.11, 0.004, x + 0.18, y + 0.56, Z + 0.006, 14));
    for (let ly = y + 0.22; ly > y + 0.05; ly -= ROW * 2) p.add(m.print, quad(0.78, ROW, x, ly, Z + 0.003));
    pin(x, y + 0.88);
  }
  // ③ 头版下面一条（0.7 × 0.96）：整张头版，最下面一条横幅用红框圈出来（广告的位置）
  {
    const x = 1.07;
    const y = 1.3;
    p.add(m.paperFace, quad(0.7, 0.96, x, y, Z));
    p.add(m.inkFace, quad(0.56, ROW * 2, x, y + 0.84, Z + 0.003));
    p.add(m.inkFace, quad(0.58, ROW * 2, x, y + 0.7, Z + 0.003));
    for (let ly = y + 0.6; ly > y + 0.28; ly -= ROW * 2) p.add(m.print, quad(0.58, ROW, x, ly, Z + 0.003));
    p.add(m.redFace, ...frame(0.62, 0.2, ROW, 0.004, x, y + 0.04, Z + 0.004));
    p.add(m.brassFace, quad(0.5, 0.1, x, y + 0.08, Z + 0.006));
    pin(x, y + 0.88);
  }
  // 样张之间、上沿再塞几张小纸条（"钉满"）：中间和东边那张的上角压着
  note(0.58, 1.86, 0.3, 0.42, 1, Z + 0.008);
  note(-0.42, 1.98, 0.28, 0.32, 3, Z + 0.008);
  note(1.38, 1.98, 0.26, 0.32, 2, Z + 0.008);
  note(0.6, 1.04, 0.24, 0.3, 0, Z + 0.008);
  // 写字台（3.0 × 0.8 × 0.7，南边 z 0.62）：胡桃木 + 竖板的正面
  {
    const z = 0.62;
    const H = 0.82;
    p.add(m.walnut, box(3.0, 0.06, 0.7, 0, 0.76, z));
    p.add(m.walnutPlank, box(2.9, 0.62, 0.05, 0, 0.12, z + 0.3));
    for (const sx of [-1, 1]) p.add(m.walnutFront, box(0.08, 0.76, 0.66, sx * 1.44, 0, z));
    // 打字机（正对客人 = 键盘朝南）：黑机身、三排米白键（越往北越高）、背后的滚筒 + 卷着的一张纸、左头亮的回车杆
    {
      const x = -0.55;
      const tz = z + 0.02;
      p.add(m.ink, box(0.62, 0.1, 0.46, x, H, tz));
      p.add(m.ink, box(0.62, 0.12, 0.2, x, H + 0.1, tz - 0.13));
      p.add(
        m.ink,
        box(0.62, 0.03, 0.26, 0, 0, 0)
          .rotateX(0.35)
          .translate(x, H + 0.11, tz + 0.08),
      );
      for (let r = 0; r < 3; r++)
        for (let k = 0; k < 7; k++)
          p.add(keys, box(T, 0.02, T, x - 0.24 + k * 0.08 + (r % 2) * 0.03, H + 0.1 + r * 0.035, tz + 0.18 - r * 0.08));
      p.add(keys, box(0.3, 0.02, T, x, H + 0.1, tz + 0.22));
      p.add(
        m.ink,
        new THREE.CylinderGeometry(0.06, 0.06, 0.72, 12).rotateZ(Math.PI / 2).translate(x, H + 0.26, tz - 0.16),
      );
      p.add(chrome, box(0.04, 0.04, 0.04, x - 0.38, H + 0.26, tz - 0.16), box(0.16, T, T, x - 0.44, H + 0.3, tz - 0.1));
      p.add(
        m.paper,
        box(0.36, 0.2, 0.012, 0, 0.1, 0)
          .rotateX(-0.2)
          .translate(x, H + 0.22, tz - 0.2),
      );
      p.add(
        m.printFlat,
        box(0.26, T, 0.014, 0, 0.14, 0)
          .rotateX(-0.2)
          .translate(x, H + 0.22, tz - 0.2),
      );
    }
    // 一张空白登记表（一条红线 = 填好的一栏）、铜笔筒、一摞旧报
    p.add(m.paper, flat(0.36, 0.46, 0.35, H + 0.01, z + 0.06));
    p.add(m.printFlat, flat(0.26, T, 0.35, H + 0.014, z - 0.07), flat(0.26, T, 0.35, H + 0.014, z + 0.02));
    p.add(m.red, flat(0.2, T, 0.35, H + 0.016, z + 0.12));
    p.add(m.brass, cyl(0.06, 0.06, 0.16, 0.72, H, z - 0.16, 10));
    p.add(m.paper, box(0.44, 0.16, 0.32, 1.08, H, z), box(0.42, 0.04, 0.3, 1.1, H + 0.16, z - 0.01));
  }
  return p.group(ctx, 'valley-asset:in2-paper-ad-board', [
    felt,
    ...slip,
    m.paperFace,
    m.print,
    m.inkFace,
    m.redFace,
    m.brassFace,
    ball,
    photoG,
    m.paper,
    m.printFlat,
    m.red,
    keys,
    chrome,
  ]);
};

// ── in2-paper-reporter-desk：记者的钢桌（1.8 × 0.76 × 0.95，橄榄绿烤漆）。记者坐北朝南（脸朝镜头），
// 所以朝镜头的是桌子的挡板。v0 = 记者自己的桌（P2 来采访的那个，和餐馆里同一个人）：打字机（从背后看：机身 + 滚筒上卷着一张纸）
// + 一台相机（黑机身、大镜头朝镜头、顶上亮的闪光灯）+ 摊开的笔记本和铅笔 + 咖啡杯 —— 相机 + 本子 = 记者；
// v1 = 老电脑（米色机壳、墨绿屏朝北）+ 稿子堆 ──
const inReporterDesk: AssetFn = (ctx) => {
  const m = mats(ctx);
  const v = ctx.variant % 2;
  const beige = ctx.mat('newsprint', { ramp: BEIGE, convex: 0.5 });
  const screen = ctx.mat('metal', { ramp: SCREEN, noShadowReceive: true });
  const mug = ctx.mat('clothRed', { ramp: [0xf0e6d0, 0xd2c2ae, 0x7c6c88], convex: 0.5 });
  const lens = ctx.mat('metal', {
    ramp: [0x8a90a4, 0x4e5468, 0x262838],
    edge: 0.4,
    convex: 0.6,
    noShadowReceive: true,
  });
  const glass = ctx.mat('metal', { ramp: [0x6ab0d8, 0x3a6a9c, 0x1e3058], noShadowReceive: true });
  const pencil = ctx.mat('flowerYellow', { noShadowReceive: true });
  const p = new Parts();
  const W = 1.8;
  const D = 0.95;
  const H = 0.76;
  p.add(m.cab, box(W, 0.05, D, 0, H - 0.05, 0));
  // 东边一个抽屉柜 + 西边两条腿 + 朝南的挡板
  p.add(m.cabFront, box(0.5, H - 0.05, D - 0.06, W / 2 - 0.28, 0, 0));
  for (let i = 0; i < 3; i++) p.add(m.iron, box(0.2, T, 0.03, W / 2 - 0.28, 0.16 + i * 0.22, D / 2 - 0.02));
  p.add(m.cab, box(0.06, H - 0.05, D - 0.06, -W / 2 + 0.05, 0, 0));
  p.add(m.cabFront, box(W - 0.6, 0.42, 0.03, -0.25, H - 0.47, D / 2 - 0.06));
  if (v === 0) {
    // 打字机（背后朝镜头）：深色机身、滚筒、一张纸立着
    p.add(m.ink, box(0.5, 0.16, 0.4, -0.5, H, -0.08), box(0.54, 0.09, 0.1, -0.5, H + 0.14, 0.06));
    p.add(m.paper, box(0.32, 0.3, 0.012, -0.5, H + 0.2, 0.04));
    // 相机：黑机身 + 朝南的大镜头（亮边一圈）+ 顶上亮的闪光灯
    p.add(m.ink, box(0.4, 0.22, 0.17, 0.5, H, 0.04));
    p.add(lens, new THREE.CylinderGeometry(0.1, 0.1, 0.16, 12).rotateX(Math.PI / 2).translate(0.5, H + 0.11, 0.2));
    p.add(glass, disc(0.065, 0.01, 0.5, H + 0.11, 0.28, 12));
    p.add(m.paper, box(0.14, 0.1, 0.1, 0.4, H + 0.22, 0.04));
    // 摊开的笔记本（两页米白，几条暗线）+ 黄铅笔
    p.add(m.paper, box(0.2, 0.02, 0.28, -0.04, H, 0.18), box(0.2, 0.02, 0.28, 0.17, H, 0.18));
    for (const px of [-0.04, 0.17])
      for (let k = 0; k < 3; k++) p.add(m.printFlat, flat(0.14, T * 0.6, px, H + 0.022, 0.1 + k * 0.07));
    p.add(pencil, box(0.26, 0.025, 0.025, 0.06, H + 0.02, 0.36));
    p.add(mug, cyl(0.055, 0.055, 0.12, 0.6, H, -0.3, 10));
  } else {
    // 老电脑：米色机壳（屏朝北，朝镜头的是后壳）+ 机箱
    p.add(beige, box(0.5, 0.08, 0.42, -0.25, H, -0.02), box(0.46, 0.4, 0.42, -0.25, H + 0.08, -0.08));
    p.add(beige, box(0.34, 0.22, 0.18, -0.25, H + 0.14, 0.2));
    p.add(screen, box(0.38, 0.3, 0.01, -0.25, H + 0.13, -0.295));
    p.add(m.paper, box(0.4, 0.2, 0.3, 0.45, H, 0.12), box(0.34, 0.12, 0.28, 0.47, H + 0.2, 0.1));
    p.add(m.paper, flat(0.3, 0.22, 0.2, H + 0.005, -0.3));
  }
  return p.group(ctx, `valley-asset:in2-paper-reporter-desk:${v}`, [m.paper, m.printFlat, mug, screen, glass, pencil]);
};

/** 一摞报（平放、头版朝上）：中心 x / z、底 y、高 h。顶上：一条粗标题色块、一块照片、几条看不清的线 */
function todayStack(p: Parts, m: M, photo: THREE.Material, x: number, y: number, z: number, h: number) {
  const w = 0.46;
  const d = 0.34;
  p.add(m.paper, box(w, h, d, x, y, z));
  const top = y + h + 0.004;
  p.add(m.ink, flat(w - 0.08, ROW, x, top, z - d / 2 + 0.06));
  p.add(photo, flat(0.2, 0.15, x - 0.08, top, z + 0.05));
  for (const dz of [-0.01, 0.05, 0.11]) p.add(m.printFlat, flat(0.13, T * 0.6, x + 0.13, top, z + dz));
}

// ── in2-paper-reception：前台（3.2 × 1.05 × 0.8）。客人在南边（镜头这边），接待员站在北边。
// 胡桃木竖板的正面 + 黄铜踢脚，墨绿大理石台面（米白的纸、黄铜收银机衬在上面）；台上：黄铜收银机（西头，靠门）、
// 一只大服务铃（铜半球 + 顶上的按钮，台面朝客人那边）、摊开的访客簿、一摞今天的报（东头，头版朝上：标题色块 + 照片块）。
// 没有 FRONT DESK 字：门边的台子 + 台后站着的人 + 铃 = 前台
const inReception: AssetFn = (ctx) => {
  const m = mats(ctx);
  const top = ctx.mat('surround', { ramp: [0x2c7a68, 0x1e5e54, 0x10343e], convex: 0.4 });
  const keys = ctx.mat('signPaint', { noShadowReceive: true });
  const book = ctx.mat('clothRed', { ramp: OXBLOOD, noShadowReceive: true });
  const photo = ctx.mat('kraft', { ramp: SEPIA, noShadowReceive: true });
  const p = new Parts();
  const W = 3.2;
  const D = 0.8;
  const H = 1.05;
  // 柜体（正面竖板）+ 台面（往外挑 0.06）+ 黄铜踢脚
  p.add(m.walnutPlank, box(W, H - 0.06, D, 0, 0, 0));
  p.add(top, box(W + 0.12, 0.06, D + 0.12, 0, H - 0.06, 0));
  p.add(m.brass, box(W, 0.1, 0.02, 0, 0, D / 2 + 0.005));
  // 收银机（西头 x −0.95，进门就看得见）：黄铜机身、斜的键盘面、顶上弹起来的"价钱牌"、底下的钱抽屉
  {
    const x = -0.95;
    p.add(m.brass, box(0.5, 0.2, 0.42, x, H, 0), box(0.46, 0.16, 0.24, x, H + 0.2, -0.08));
    p.add(
      keys,
      box(0.42, 0.04, 0.2, 0, 0, 0)
        .rotateX(0.5)
        .translate(x, H + 0.24, 0.1),
    );
    for (let i = 0; i < 3; i++)
      p.add(
        m.ink,
        box(0.38, 0.015, 0.02, 0, 0, 0)
          .rotateX(0.5)
          .translate(x, H + 0.21 + i * 0.03, 0.06 + i * 0.05),
      );
    p.add(m.ink, box(0.32, 0.14, 0.03, x, H + 0.36, -0.12));
    p.add(keys, box(0.26, 0.08, 0.01, x, H + 0.39, -0.1));
    p.add(m.walnut, box(0.5, 0.06, 0.03, x, H + 0.03, 0.21));
  }
  // 服务铃（大：黑木座 + 铜半球 + 顶上的按钮），放在台面靠客人的沿上
  p.add(m.ink, cyl(0.15, 0.15, 0.04, -0.25, H, 0.2, 16));
  p.add(m.brass, new THREE.SphereGeometry(0.13, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2).translate(-0.25, H + 0.04, 0.2));
  p.add(m.brass, cyl(0.025, 0.025, 0.06, -0.25, H + 0.16, 0.2, 8), cyl(0.045, 0.045, 0.025, -0.25, H + 0.21, 0.2, 10));
  // 摊开的访客簿（牛血红皮面 + 两页米白）
  p.add(book, box(0.5, 0.03, 0.34, 0.15, H, 0.05));
  p.add(m.paper, flat(0.22, 0.3, 0.03, H + 0.035, 0.05), flat(0.22, 0.3, 0.27, H + 0.035, 0.05));
  p.add(m.printFlat, flat(0.16, T, 0.03, H + 0.04, 0.0), flat(0.16, T, 0.27, H + 0.04, 0.08));
  // 一摞今天的报（东头，头版朝上）
  todayStack(p, m, photo, 1.2, H, 0.0, 0.22);
  todayStack(p, m, photo, 0.72, H, 0.06, 0.12);
  return p.group(ctx, 'valley-asset:in2-paper-reception', [keys, book, m.paper, m.printFlat, m.ink, photo]);
};

// ── in2-paper-side-table：等候区的小茶几（0.6 × 0.5 × 0.5）：胡桃木 + 两本杂志 + 一个铜烟灰缸 ──
const inSideTable: AssetFn = (ctx) => {
  const m = mats(ctx);
  const mag = ctx.mat('clothBlue', { noShadowReceive: true });
  const p = new Parts();
  p.add(m.walnut, box(0.62, 0.05, 0.52, 0, 0.48, 0));
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ])
    p.add(m.walnut, box(0.05, 0.48, 0.05, sx * 0.26, 0, sz * 0.21));
  p.add(mag, box(0.3, 0.02, 0.38, -0.1, 0.53, 0.02).rotateY(0.2));
  p.add(m.paper, box(0.28, 0.02, 0.36, 0.06, 0.55, -0.02).rotateY(-0.15));
  p.add(m.brass, cyl(0.07, 0.06, 0.04, 0.2, 0.53, 0.14, 10));
  return p.group(ctx, 'valley-asset:in2-paper-side-table', [mag, m.paper]);
};

// ── in2-paper-bundles：前台东边墙角三捆扎好的今天的报（两捆并排、一捆摞在上面；本地原点 = 底面中心，占 0.5 × 0.8）──
// 每捆：米白一摞 + 头版朝上（标题色块 + 照片块）+ 十字扎的麻绳。和外观门口的报捆一个意思：这儿出报纸
const inBundles: AssetFn = (ctx) => {
  const m = mats(ctx);
  const photo = ctx.mat('kraft', { ramp: SEPIA, noShadowReceive: true });
  const twine = ctx.mat('kraft', { ramp: [0xdcb27a, 0xb08a5a, 0x5e4a5a], noShadowReceive: true });
  const p = new Parts();
  const bundle = (x: number, y: number, z: number, rot: number) => {
    const q = new Parts();
    todayStack(q, m, photo, 0, 0, 0, 0.26);
    q.add(twine, box(0.04, 0.27, 0.35, 0, -0.005, 0), box(0.47, 0.27, 0.04, 0, -0.005, 0));
    for (const [g, mat] of q.list) p.add(mat, g.rotateY(rot).translate(x, y, z));
  };
  bundle(0, 0, -0.2, 0);
  bundle(0, 0, 0.2, 0);
  bundle(0.02, 0.27, -0.05, 0.25);
  return p.group(ctx, 'valley-asset:in2-paper-bundles', [m.paper, m.printFlat, m.ink, photo, twine]);
};

export const ASSETS: Record<string, AssetFn> = {
  'in2-paper-floor': inFloor,
  'in2-paper-north-wall': inNorthWall,
  'in2-paper-archive': inArchive,
  'in2-paper-editor-desk': inEditorDesk,
  'in2-paper-ad-board': inAdBoard,
  'in2-paper-reporter-desk': inReporterDesk,
  'in2-paper-reception': inReception,
  'in2-paper-side-table': inSideTable,
  'in2-paper-bundles': inBundles,
};

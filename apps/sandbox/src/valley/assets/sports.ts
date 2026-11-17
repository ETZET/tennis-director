// 体育用品店的资产（批 S，docs/lab/2026-11-07-3d-pixel/valley-town.md「资产清单」）。这个文件归体育用品店的资产代理。
// 每个资产：ASSETS['<id>'] = (ctx) => THREE.Object3D。本地原点 = 落地点中心，y 0 = 地面，+z 朝镜头（朝南），单位米；
// 材质只用 ctx.mat(key, extra)（key 在 src/valley/palette.ts；锁着的区域按它压暗）；随机只用 ctx.rng('<id>')；变体 ctx.variant。
// 画廊：/valleyassets.html?asset=<id>；场景里在 detail/sites/sports.ts 用 makeAsset(id, d.actx) 放。
//
// 网球专卖（Pro Shop）：从街上认它 = 门正上方屋顶前沿一颗大网球 + 一条球场蓝招牌（球黄 / 奶油字）+ 蓝白条纹雨棚；
// 橱窗里一排球拍、一堆球罐、穿线机的剪影；西半边实墙上一块大球拍；门外穿线台、特价球罐桶。（试拍小场、对墙用户 2026-11-16 去掉了）
//
// 画法（material-spec.md / 资产代理的经验）：
// - 朝南的立面永远在暗档（太阳在画面后方）：墙皮用暗档三色 + 低频灰泥斑（paint 元素），不接收投影；
//   贴在立面上的招牌、字、橱窗里的东西、壁画用 SIGN_FACE（光往上偏 + 低档位线 → 落中档）。
// - 线 1 纹素（0.09 米），竖直面上一行 = ROW（0.127 米）；字是 5 × 7 的像素字，一笔 1 纹素 × 1 行。
// - 亮边只在该有的地方：窗台、雨棚、招牌、女儿墙压顶这些"朝上的窄面"自己就是一行亮边，不另画。
// - 夜里：橱窗、门的玻璃换暖色自发光，招牌字自发光，门前一个灯光圈（userData.night = { setOn, pool }）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { box } from '../../clubsite/render/geo';
import type { ToonOpts } from '../../clubsite/render/toon';
import type { AssetCtx, AssetFn } from '../ctx';
import { type PalKey, SIGN_FACE, TOWN_EL } from '../palette';

/** 设计纹素（米） */
const T = 0.09;
/** 竖直面上一屏幕行 = 0.09 / cos45 米（俯 45°） */
const ROW = T / Math.SQRT1_2;

/** 立面上的东西：朝镜头（暗档）→ 中档、不接收投影 */
const FACE: ToonOpts = SIGN_FACE;
/** 立面本身：不接收投影（阴影毛边落在竖直面上是麻点） */
const WALL: ToonOpts = { noShadowReceive: true };
/** 小道具（穿线台、球罐桶）：不接收投影 */
const PROP: ToonOpts = { noShadowReceive: true };

/**
 * 新材质 ballNeon（荧光球的黄绿：大网球、招牌的 TENNIS、球罐、壁画边的球）。调色板的 'ball' 归 accent 组，
 * 午后金光下亮档成了奶油黄 #ffeaa0（S 0.37），读不出"荧光"；这里手挑 3 档 × 3 色，借 plants 组（ctx.mat('lawn', …)：
 * 亮档只往 118° 偏 12%、暗档往青走）过午后调色。L：亮 218 / 227 / 206，中 166 / 176 / 155，暗 110 / 120 / 101（青绿，冷）；
 * 缝 −30 / −33 / −25，亮边 +22 / +29 / +31。lead 以后并进 palette.ts（TOWN.ballNeon，PROXY lawn）。
 */
const NEON: ToonOpts = {
  ramp: [0xd2ec3a, 0x92b832, 0x4c7a5c],
  edge: 0.6,
  convex: 0.4,
  tones: {
    bands: [
      [0xd2ec3a, 0xdcf44e, 0xc6e02e],
      [0x92b832, 0x9cc23c, 0x88ac2e],
      [0x4c7a5c, 0x568464, 0x447054],
    ],
    seam: [0xb4cc2c, 0x6e9628, 0x34604a],
    hi: [0xecff6a, 0xb4d44c, 0x6c9a6c],
  },
};
const neon = (ctx: AssetCtx, extra?: ToonOpts) => ctx.mat('lawn', { ...NEON, ...extra });

type Part = { g: THREE.BufferGeometry; m: THREE.Material; cast: boolean };

/** 按（材质, 投不投影）合成网格的收集器 */
class Parts {
  list: Part[] = [];
  constructor(private ctx: AssetCtx) {}
  add(m: THREE.Material, g: THREE.BufferGeometry, cast = true) {
    this.list.push({ g, m, cast });
  }
  build(name: string): THREE.Group {
    const out = new THREE.Group();
    out.name = name;
    const by = new Map<string, { m: THREE.Material; cast: boolean; gs: THREE.BufferGeometry[] }>();
    for (const { g, m, cast } of this.list) {
      const ng = g.index ? g.toNonIndexed() : g;
      for (const a of Object.keys(ng.attributes)) if (a !== 'position' && a !== 'normal') ng.deleteAttribute(a);
      if (!ng.attributes.normal) ng.computeVertexNormals();
      const k = `${m.uuid}:${cast}`;
      const e = by.get(k) ?? { m, cast, gs: [] };
      e.gs.push(ng);
      by.set(k, e);
    }
    for (const { m, cast, gs } of by.values()) {
      const merged = mergeGeometries(gs);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, m);
      mesh.name = `${name}:${(m.userData.palKey as string | undefined) ?? m.name}`;
      if (!cast) mesh.userData.noCast = true;
      out.add(mesh);
    }
    this.ctx.mats.prepare(out);
    out.traverse((o) => {
      if (o.userData.noCast) o.castShadow = false;
    });
    return out;
  }
}

// ── 几何小工具（都在资产本地坐标里） ──

/** 立面上的一块平板：中心 x、底 y、离原点 z（朝 +z） */
const plate = (w: number, h: number, x: number, y: number, z: number) =>
  new THREE.PlaneGeometry(w, h).translate(x, y + h / 2, z);

/** 椭圆（xy 平面，朝 +z） */
function ellipse(rx: number, ry: number, seg = 8): THREE.BufferGeometry {
  return new THREE.ShapeGeometry(new THREE.Shape().absellipse(0, 0, rx, ry, 0, Math.PI * 2, false, 0), seg);
}
/** 椭圆环（xy 平面，朝 +z）：外半径 rx ry，环宽 t */
function ellipseRing(rx: number, ry: number, t: number, seg = 8): THREE.BufferGeometry {
  const s = new THREE.Shape().absellipse(0, 0, rx, ry, 0, Math.PI * 2, false, 0);
  s.holes.push(new THREE.Path().absellipse(0, 0, rx - t, ry - t, 0, Math.PI * 2, true, 0));
  return new THREE.ShapeGeometry(s, seg);
}

/** 5 × 7 的像素字（# = 一格：宽 1 纹素、高 1 屏幕行） */
const FONT: Record<string, string[]> = {
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  N: ['#...#', '##..#', '##..#', '#.#.#', '#..##', '#..##', '#...#'],
  I: ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
};
/** 一行字的宽（纹素格）：每字 5 格 + 1 格字距，空格 3 格 */
const textCols = (s: string) => [...s].reduce((n, c) => n + (c === ' ' ? 3 : 6), 0) - (s.endsWith(' ') ? 0 : 1);
/** 一行字 → 平板（每个字每一行的连续格合成一块）。x0 = 左边，y0 = 字底，z = 离原点 */
function textGeo(s: string, x0: number, y0: number, z: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  let cx = 0;
  for (const ch of s) {
    if (ch === ' ') {
      cx += 3;
      continue;
    }
    const g = FONT[ch];
    for (let r = 0; r < 7; r++) {
      const row = g[r];
      let c = 0;
      while (c < 5) {
        if (row[c] !== '#') {
          c++;
          continue;
        }
        let e = c;
        while (e < 5 && row[e] === '#') e++;
        out.push(plate((e - c) * T, ROW, x0 + (cx + (c + e) / 2) * T, y0 + (6 - r) * ROW, z));
        c = e;
      }
    }
    cx += 6;
  }
  return out;
}

/** 夜里开关：换材质的网格（白天材质 → 夜里材质），锁着的区域（材质被换成压暗的）不开；pool 是本地坐标的灯光圈 */
function nightSwitch(
  root: THREE.Object3D,
  swaps: Map<THREE.Material, THREE.Material>,
  pool?: { x: number; z: number; r: number; h: number },
) {
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && swaps.has(m.material as THREE.Material)) {
      m.userData.sportsDay = m.material;
      meshes.push(m);
    }
  });
  let on = false;
  let lit = false;
  const v = new THREE.Vector3();
  root.userData.night = {
    setOn(o: boolean) {
      on = o;
      lit = false;
      for (const m of meshes) {
        const day = m.userData.sportsDay as THREE.Material;
        const night = swaps.get(day) as THREE.Material;
        if (m.material !== day && m.material !== night) continue; // 锁着：压暗的材质，不开灯
        m.material = on ? night : day;
        lit = true;
      }
    },
    pool: pool
      ? () => {
          v.set(pool.x, 0, pool.z).applyMatrix4(root.matrixWorld);
          return on && lit ? [v.x, v.z, pool.r, pool.h] : [v.x, v.z, 0, 0];
        }
      : undefined,
  };
}

/** 夜里的材质：同一个调色板名 + 同参数 + 自发光 */
const glowMat = (ctx: AssetCtx, key: PalKey, extra: ToonOpts, emissive: number) => ctx.mat(key, { ...extra, emissive });

// ══ sports-front：体育店门面（22 × 5.5 × 18，原点 = 楼的中心；立面在 z = +9）══
// 楼身（墙、屋顶板）是 build.ts 的盒子：这里给它贴一层自己的皮（立面、两侧、屋面、屋檐板，离原面 2 厘米，不共面），
// 再加立面上的东西 + 女儿墙 + 屋顶上的设备。画廊里没有 build.ts 的盒子，这层皮自己就是一栋楼。
const W = 22;
const D = 18;
const H = 5.5;
const FZ = D / 2; // 立面
const SLAB = 5.85; // build.ts 的屋顶板顶（5.5 + 0.35）
const DECK = SLAB + 0.02; // 屋面（这里的皮）
const OVER = 0.25; // 屋顶板出挑
/** 立面上的位置（本地 x）：橱窗、门、东小窗、壁画 */
const WIN = { x0: -3.6, x1: 3.9, y0: 0.45, y1: 2.05 };
const DOOR = { x: 6.5, w: 2.0, h: 2.2 };
const EWIN = { x0: 8.2, x1: 10.4, y0: 0.6, y1: 2.05 };
const MURAL_X = -5.6;
/** 雨棚：挂在 3.45、往外 1.0 米斜到 3.3，帘子 0.22 → 屏幕上只盖住立面 2.08 以上（橱窗顶 2.05 露出来） */
const AWN = { x0: -3.9, x1: 7.8, y: 3.45, d: 1.0, drop: 0.15, val: 0.22 };
/** 招牌：10 × 1.4 米，在雨棚上面 */
const SIGN = { x0: -2.9, x1: 7.1, y0: 3.62, h: 11 * ROW };

const sportsFront: AssetFn = (ctx) => {
  const P = new Parts(ctx);
  const rnd = ctx.rng('sports-front');
  // 材质
  // 墙皮：灰泥（stucco），朝南永远在暗档 → 暗档三色拉开到 ±12（灰泥补丁一块块看得出，阴影里纹理还在）
  const wall = ctx.mat('stucco', {
    ...WALL,
    elem: { kind: 'paint', size: [14, 7], seed: 3 },
    tones: {
      bands: [
        [0xfaeedc, 0xfff6e8, 0xf0e2d0],
        [0xdcc6c0, 0xe6d0ca, 0xd0bab4],
        [0x8e7a9e, 0x9a86aa, 0x826e92], // L 129 / 141 / 117
      ],
      seam: [0xe0d0c0, 0xc4aeac, 0x6e5a86],
      hi: [0xfffaf0, 0xecdcd6, 0xa492b4],
    },
  });
  const side = ctx.mat('stucco', WALL);
  const plinth = ctx.mat('cap', WALL);
  // 屋面：卷材防水层（比沙亮一点、偏桃色：楼顶和地靠女儿墙、太阳能板分开），每 1.8 米一条接缝（竖线，只比本色暗 ~20，不读成木地板）
  const deck = ctx.mat('concrete', {
    elem: { kind: 'planks', seam: 1, hi: 0.25, p: [1, 0, 0, 1.8], mottle: 0.25 },
    tones: {
      bands: [
        [0xf4be8c, 0xf8c696, 0xecb482], // L 198 / 205 / 188
        [0xcc9a84, 0xd4a48e, 0xc48e7a], // L 165 / 174 / 155
        [0x6e5a92, 0x786498, 0x66528a], // L 98 / 108 / 90
      ],
      seam: [0xe0aa7e, 0xb08070, 0x5a4a80],
      hi: [0xfcd4a8, 0xdcae98, 0x8270a6],
    },
  });
  // 太阳能板：俱乐部蓝的深一档（signBoard），每 1 米一块（竖缝），缝下一纹素亮条 = 板框
  // （新色组 solarBlue：比 signBoard 更饱和的电池片蓝，借 club 组；L 亮 128 / 138 / 117（天光反射，落中间调），中 94 / 103 / 85，暗 45 / 54 / 39）
  const solar = ctx.mat('signBoard', {
    elem: { kind: 'planks', seam: 1, hi: 0.6, p: [1, 0, 0, 1.0] },
    ramp: [0x4088ec, 0x2a62c0, 0x1c2c6c],
    tones: {
      bands: [
        [0x4088ec, 0x4a92f2, 0x367ce2],
        [0x2a62c0, 0x326cca, 0x2458b4],
        [0x1c2c6c, 0x24347a, 0x18265e],
      ],
      seam: [0x2664c4, 0x1c4890, 0x121c48],
      hi: [0x6aa6f6, 0x4a84d8, 0x34448a],
    },
  });
  const fascia = ctx.mat('cap', WALL);
  const para = ctx.mat('surround', { ...FACE, elem: { kind: 'paint', size: [16, 8], seed: 2 } });
  const paraTop = ctx.mat('surround', {});
  const coping = ctx.mat('line', { edge: 0.4, convex: 0.3 });
  const sideWall = ctx.mat('stucco', {});
  const frame = ctx.mat('ironwork', FACE);
  const glassOpts: ToonOpts = { ...FACE, lightUp: 0.4, bands: [-0.2, 0.5] };
  const glass = ctx.mat('jug', glassOpts);
  const glassHi = ctx.mat('jug', { ...FACE, lightUp: 0.7, bands: [-0.6, 0.2] });
  const sill = ctx.mat('cap', {});
  const board = ctx.mat('signBoard', FACE);
  const boardTop = ctx.mat('signBoard', {});
  const letterA = neon(ctx, FACE);
  const letterB = ctx.mat('signPaint', FACE);
  const blue = ctx.mat('canvasStripe', {});
  const blueFace = ctx.mat('canvasStripe', FACE);
  const cream = ctx.mat('fabric', {});
  const creamFace = ctx.mat('fabric', FACE);
  const red = ctx.mat('clothRed', FACE);
  const ball = neon(ctx, FACE);
  const white = ctx.mat('clothWhite', FACE);
  const navy = ctx.mat('clothBlue', FACE);
  const strings = ctx.mat('line', FACE);
  const steel = ctx.mat('metal', FACE);
  const metal = ctx.mat('metal', {});
  const dark = ctx.mat('ironwork', {});
  const roofM = ctx.mat('roofMetal', { elem: { kind: 'planks', seam: 1, hi: 0.5, p: [1, 0, 0, 0.27] } });
  const sky = ctx.mat('jug', {});

  // ── 皮：立面、两侧、屋面、屋檐板、勒脚 ──
  P.add(wall, plate(W, H, 0, 0, FZ + 0.02), false);
  for (const s of [-1, 1])
    P.add(
      side,
      new THREE.PlaneGeometry(D, H).rotateY((s * Math.PI) / 2).translate(s * (W / 2 + 0.02), H / 2, 0),
      false,
    );
  P.add(
    deck,
    new THREE.PlaneGeometry(W + 2 * OVER + 0.06, D + 2 * OVER + 0.06).rotateX(-Math.PI / 2).translate(0, DECK, 0),
  );
  P.add(fascia, box(W + 2 * OVER + 0.06, SLAB - H + 0.02, 0.04, 0, H, FZ + OVER + 0.02));
  // 勒脚：3 行高的陶色一条（和门前的陶砖一家），顶面朝上 = 一行亮边
  P.add(plinth, box(W + 0.04, 3 * ROW, 0.07, 0, 0, FZ + 0.055), false);

  // ── 女儿墙：前面一道 0.55 米（外圈绿 + 白压顶 = 球场的颜色），两侧和后面矮一点（灰泥 + 白压顶）──
  const PH = 0.55;
  const pz = FZ + OVER - 0.14;
  P.add(para, box(W + 2 * OVER, PH, 0.28, 0, DECK, pz));
  P.add(coping, box(W + 2 * OVER + 0.06, T, 0.34, 0, DECK + PH, pz));
  for (const s of [-1, 1]) {
    P.add(sideWall, box(0.24, 0.36, D + 2 * OVER - 0.28, s * (W / 2 + OVER - 0.12), DECK, -0.14));
    P.add(coping, box(0.3, T, D + 2 * OVER - 0.28, s * (W / 2 + OVER - 0.12), DECK + 0.36, -0.14));
  }
  P.add(sideWall, box(W + 2 * OVER, 0.36, 0.24, 0, DECK, -(D / 2 + OVER - 0.12)));
  P.add(coping, box(W + 2 * OVER + 0.06, T, 0.3, 0, DECK + 0.36, -(D / 2 + OVER - 0.12)));
  // 女儿墙朝里那面（屋面上看得到的顶）换成外圈绿的亮档：靠一块压在压顶下面的窄条（顶面朝上）
  P.add(paraTop, box(W + 2 * OVER - 0.1, 0.02, 0.06, 0, DECK + PH - 0.02, pz - 0.17), false);

  // ── 屋顶上的东西（拉远看楼就是屋顶：不能是一块空板）：西半边三排太阳能板（棕榈泉的平顶上最常见的东西；
  //    深蓝、每 1 米一块板的竖缝，朝镜头微微翘起），东北两个采光天窗、两台空调，前沿留空给大网球；一个检修口、两根排气管 ──
  const array = (x0: number, x1: number, z: number) => {
    const g = box(x1 - x0, 0.06, 1.62, 0, -0.03, 0)
      .rotateX(0.21)
      .translate((x0 + x1) / 2, DECK + 0.42, z);
    P.add(solar, g);
    P.add(dark, box(x1 - x0 - 0.2, 0.3, T, (x0 + x1) / 2, DECK, z - 0.6), false); // 后腿（一条暗的）
  };
  for (const z of [-7.3, -4.7, -2.1, 0.5]) array(-10.4, -1.0, z);
  for (const z of [-7.3, -4.7, -2.1]) array(4.2, 10.4, z);
  for (const z of [-7.2, -4.4]) {
    P.add(metal, box(1.5, 0.27, 2.0, 1.6, DECK, z));
    P.add(sky, new THREE.PlaneGeometry(1.32, 1.82).rotateX(-Math.PI / 2).translate(1.6, DECK + 0.28, z));
  }
  for (const [x, z] of [
    [1.6, -1.2],
    [8.6, 1.4],
  ] as const) {
    P.add(roofM, box(1.44, 0.81, 1.08, x, DECK, z));
    P.add(
      dark,
      new THREE.CircleGeometry(0.36, 8).rotateX(-Math.PI / 2).translate(x - 0.18, DECK + 0.82, z - 0.05),
      false,
    );
    P.add(dark, plate(1.08, 3 * ROW, x, DECK + 0.18, z + 0.55), false);
  }
  P.add(roofM, box(0.9, 0.27, 0.9, -7.8, DECK, 3.4));
  for (const [x, z] of [
    [-3.4, 3.4],
    [0.9, 4.6],
  ] as const)
    P.add(metal, new THREE.CylinderGeometry(0.1, 0.1, 0.54, 6).translate(x, DECK + 0.27, z));

  // ── 橱窗：框（1 纹素）、两根竖梃、窗台（朝上一行亮）、玻璃 + 两道斜的反光；玻璃上贴一层陈列 ──
  const wz = FZ + 0.04; // 玻璃面
  const ww = WIN.x1 - WIN.x0;
  const wh = WIN.y1 - WIN.y0;
  const wx = (WIN.x0 + WIN.x1) / 2;
  P.add(glass, plate(ww, wh, wx, WIN.y0, wz), false);
  // 反光：两道往右上斜的亮带（2 纹素宽），只在西头那一格（东边被陈列挡着）
  for (const [x0, wdt] of [
    [WIN.x0 + 0.35, 2 * T],
    [WIN.x0 + 0.75, T],
  ] as const) {
    const g = new THREE.PlaneGeometry(wdt, wh * 0.9);
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) pos.setX(i, pos.getX(i) + pos.getY(i) * 0.5);
    P.add(glassHi, g.translate(x0, WIN.y0 + wh / 2, wz + 0.005), false);
  }
  P.add(frame, box(ww + 2 * T, T, 0.06, wx, WIN.y1, FZ + 0.03), false);
  P.add(frame, box(T, wh, 0.06, WIN.x0 - T / 2, WIN.y0, FZ + 0.03), false);
  P.add(frame, box(T, wh, 0.06, WIN.x1 + T / 2, WIN.y0, FZ + 0.03), false);
  for (const x of [WIN.x0 + ww / 3, WIN.x0 + (2 * ww) / 3])
    P.add(frame, box(T, wh, 0.06, x, WIN.y0, FZ + 0.035), false);
  P.add(sill, box(ww + 0.3, 0.1, 0.2, wx, WIN.y0 - 0.1, FZ + 0.1), false);

  const dz = wz + 0.012; // 陈列（贴着玻璃）
  // 一格：五支球拍站成一排（拍头朝上，拍框颜色轮着，拍面一块浅色），底下一条陈列台
  const pane = ww / 3;
  const RK: PalKey[] = ['clothRed', 'ball', 'clothWhite', 'clothBlue', 'clothRed'];
  const rkMat: Record<string, THREE.Material> = { clothRed: red, ball, clothWhite: white, clothBlue: navy };
  const shelf = ctx.mat('wood', FACE);
  P.add(shelf, plate(pane - 0.2, 2 * ROW, WIN.x0 + pane / 2, WIN.y0, dz), false);
  for (let i = 0; i < 5; i++) {
    const x = WIN.x0 + 0.33 + i * ((pane - 0.66) / 4);
    const hy = WIN.y0 + 2 * ROW + 0.36 + 0.36; // 拍头中心
    const m = rkMat[RK[i]];
    P.add(m, ellipseRing(0.17, 0.24, T, 6).translate(x, hy, dz + 0.004), false);
    P.add(strings, ellipse(0.17 - T, 0.24 - T, 6).translate(x, hy, dz + 0.002), false);
    P.add(m, plate(T, 0.14, x, hy - 0.24 - 0.14, dz + 0.004), false); // 拍颈
    P.add(dark, plate(T, 0.22, x, hy - 0.24 - 0.36, dz + 0.004), false); // 拍柄（缠把）
  }
  // 二格：球罐金字塔（4-3-2-1，罐身球黄、罐盖白一行）
  const cx0 = WIN.x0 + pane * 1.5;
  P.add(shelf, plate(pane - 0.2, 2 * ROW, cx0, WIN.y0, dz), false);
  const CW = 0.27;
  const CH = 3 * ROW;
  for (let r = 0; r < 4; r++)
    for (let k = 0; k <= 3 - r; k++) {
      const x = cx0 + (k - (3 - r) / 2) * (CW + T);
      const y = WIN.y0 + 2 * ROW + r * (CH + ROW);
      P.add(ball, plate(CW, CH - ROW, x, y, dz + 0.004), false);
      P.add(white, plate(CW, ROW, x, y + CH - ROW, dz + 0.004), false);
    }
  // 三格：穿线机的剪影（立柱 + 夹着一支横放的拍）+ 墙上挂两卷线
  const sx = WIN.x0 + pane * 2.5;
  P.add(steel, plate(0.6, ROW, sx, WIN.y0, dz), false); // 底座
  P.add(steel, plate(2 * T, 0.62, sx, WIN.y0 + ROW, dz), false); // 立柱
  P.add(steel, plate(1.2, ROW, sx, WIN.y0 + ROW + 0.62, dz), false); // 夹拍的横杆
  P.add(red, plate(0.86, ROW, sx - 0.06, WIN.y0 + 2 * ROW + 0.62, dz + 0.004), false); // 夹着的拍（侧看一条）
  P.add(dark, plate(0.22, ROW, sx + 0.48, WIN.y0 + 2 * ROW + 0.62, dz + 0.004), false); // 拍柄
  P.add(dark, plate(3 * T, 2 * ROW, sx + 0.55, WIN.y0 + ROW + 0.62 - ROW, dz + 0.004), false); // 拉线头
  for (const [x, m] of [
    [sx - 0.55, ball],
    [sx - 0.25, red],
  ] as const)
    P.add(m, ellipse(0.12, 0.12, 4).translate(x, WIN.y1 - 0.32, dz + 0.004), false);

  // ── 门：玻璃门 + 框 + 推杆；门头一条横窗 ──
  const dx0 = DOOR.x - DOOR.w / 2;
  P.add(glass, plate(DOOR.w, DOOR.h, DOOR.x, 0, wz), false);
  P.add(glassHi, plate(T, DOOR.h * 0.7, DOOR.x - 0.55, 0.4, wz + 0.005), false);
  P.add(frame, box(DOOR.w + 2 * T, 2 * T, 0.07, DOOR.x, DOOR.h, FZ + 0.035), false);
  for (const x of [dx0 - T / 2, DOOR.x, dx0 + DOOR.w + T / 2])
    P.add(frame, box(T, DOOR.h, 0.07, x, 0, FZ + 0.035), false);
  P.add(steel, box(0.62, T, 0.08, DOOR.x - 0.48, 1.0, FZ + 0.09), false);
  P.add(steel, box(0.62, T, 0.08, DOOR.x + 0.48, 1.0, FZ + 0.09), false);
  // 门上一块"OPEN"牌的位置：一小块奶油色（夜里亮）
  P.add(letterB, plate(0.36, 2 * ROW, DOOR.x + 0.5, 1.5, wz + 0.01), false);

  // ── 东小窗：挂着三件网球衫（T 字），一根横杆 ──
  const ex = (EWIN.x0 + EWIN.x1) / 2;
  const ew = EWIN.x1 - EWIN.x0;
  const eh = EWIN.y1 - EWIN.y0;
  P.add(glass, plate(ew, eh, ex, EWIN.y0, wz), false);
  P.add(frame, box(ew + 2 * T, T, 0.06, ex, EWIN.y1, FZ + 0.03), false);
  P.add(frame, box(T, eh, 0.06, EWIN.x0 - T / 2, EWIN.y0, FZ + 0.03), false);
  P.add(frame, box(T, eh, 0.06, EWIN.x1 + T / 2, EWIN.y0, FZ + 0.03), false);
  P.add(sill, box(ew + 0.3, 0.1, 0.2, ex, EWIN.y0 - 0.1, FZ + 0.1), false);
  P.add(dark, plate(ew - 0.2, ROW, ex, EWIN.y1 - 0.3, dz), false);
  const SH = [white, navy, ball];
  for (let i = 0; i < 3; i++) {
    const x = EWIN.x0 + 0.42 + i * ((ew - 0.84) / 2);
    const top = EWIN.y1 - 0.3;
    const m = SH[i];
    P.add(m, plate(0.62, 2 * ROW, x, top - 2 * ROW, dz + 0.004), false); // 肩 + 袖
    P.add(m, plate(0.36, 5 * ROW, x, top - 7 * ROW, dz + 0.004), false); // 身
  }

  // ── 雨棚：奶油底的薄板（斜）+ 蓝条纹（每条 5 纹素）；前沿一道帘子（同样的条纹）──
  const aw = AWN.x1 - AWN.x0;
  const ax = (AWN.x0 + AWN.x1) / 2;
  const slope = Math.atan2(AWN.drop, AWN.d);
  const len = Math.hypot(AWN.d, AWN.drop);
  const top = (g: THREE.BufferGeometry) =>
    g
      .translate(0, 0, len / 2)
      .rotateX(slope)
      .translate(0, AWN.y, FZ + 0.03);
  P.add(cream, top(box(aw, 0.04, len, ax, -0.04, 0)), false);
  const fy = AWN.y - AWN.drop; // 前沿
  const fz2 = FZ + 0.03 + AWN.d;
  P.add(creamFace, plate(aw, AWN.val, ax, fy - AWN.val, fz2 + 0.002), false);
  const STRIPE = 5 * T;
  const n = Math.floor(aw / STRIPE);
  const sx0 = ax - (n * STRIPE) / 2;
  for (let i = 0; i < n; i += 2) {
    const x = sx0 + (i + 0.5) * STRIPE;
    P.add(blue, top(new THREE.PlaneGeometry(STRIPE, len).rotateX(-Math.PI / 2).translate(x, 0.004, 0)), false);
    P.add(blueFace, plate(STRIPE, AWN.val, x, fy - AWN.val, fz2 + 0.006), false);
  }

  // ── 招牌：球场蓝底板（顶面朝上 = 一行亮）+ "TENNIS"（球黄）"PRO SHOP"（奶油）+ 两头各一颗球 ──
  const sw = SIGN.x1 - SIGN.x0;
  const scx = (SIGN.x0 + SIGN.x1) / 2;
  P.add(board, plate(sw, SIGN.h, scx, SIGN.y0, FZ + 0.1), false);
  P.add(boardTop, box(sw, 0.06, 0.1, scx, SIGN.y0 + SIGN.h - 0.06, FZ + 0.05), false);
  P.add(boardTop, box(sw, 0.06, 0.1, scx, SIGN.y0, FZ + 0.05), false);
  const txt = 'TENNIS PRO SHOP';
  const cols = textCols(txt);
  const tx0 = scx - (cols * T) / 2;
  const ty0 = SIGN.y0 + 2 * ROW;
  const split = textCols('TENNIS ');
  for (const g of textGeo('TENNIS', tx0, ty0, FZ + 0.112)) P.add(letterA, g, false);
  for (const g of textGeo('PRO SHOP', tx0 + split * T, ty0, FZ + 0.112)) P.add(letterB, g, false);
  for (const s of [-1, 1]) {
    const bx = scx + s * ((cols * T) / 2 + 0.55);
    const by = SIGN.y0 + SIGN.h / 2;
    P.add(letterA, ellipse(0.36, 0.36, 5).translate(bx, by, FZ + 0.112), false);
    // 球上两道白缝：左右各一段往外鼓的弧（1 纹素），都在球里面
    for (const side of [-1, 1]) {
      const arc = new THREE.RingGeometry(0.22, 0.22 + T, 6, 1, side > 0 ? Math.PI - 0.8 : -0.8, 1.6);
      P.add(letterB, arc.translate(bx + side * 0.4, by, FZ + 0.116), false);
    }
  }

  // ── 西半边：实墙上一块大球拍（红框 + 浅色拍面 + 3 × 4 根线 + 黑缠把）+ 一颗球 ──
  const my = 2.55; // 拍头中心
  const RX = 0.68;
  const RY = 0.86;
  const mz = FZ + 0.03;
  P.add(red, ellipseRing(RX, RY, 2 * T, 12).translate(MURAL_X, my, mz + 0.004), false);
  P.add(creamFace, ellipse(RX - 2 * T, RY - 2 * T, 12).translate(MURAL_X, my, mz), false);
  for (const k of [-1, 0, 1]) {
    const x = MURAL_X + k * 0.2;
    const hh = 2 * (RY - 2 * T) * Math.sqrt(1 - ((k * 0.2) / (RX - 2 * T)) ** 2) - 0.06;
    P.add(red, plate(T, hh, x, my - hh / 2, mz + 0.002), false);
  }
  for (const k of [-1.5, -0.5, 0.5, 1.5]) {
    const y = my + k * 0.27;
    const ww2 = 2 * (RX - 2 * T) * Math.sqrt(1 - ((k * 0.27) / (RY - 2 * T)) ** 2) - 0.06;
    P.add(red, plate(ww2, ROW / 1.4, MURAL_X, y - ROW / 2.8, mz + 0.002), false);
  }
  // 拍喉（V：两条斜的 2 纹素）+ 拍柄
  const throatY = my - RY;
  for (const s of [-1, 1]) {
    const g = new THREE.PlaneGeometry(2 * T, 0.52);
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) pos.setX(i, pos.getX(i) + s * (pos.getY(i) + 0.26) * 0.42);
    P.add(red, g.translate(MURAL_X, throatY - 0.26 + 0.04, mz + 0.004), false);
  }
  P.add(red, plate(3 * T, 0.24, MURAL_X, throatY - 0.74, mz + 0.004), false);
  P.add(dark, plate(3 * T, 0.62, MURAL_X, throatY - 1.36, mz + 0.004), false);
  P.add(ball, ellipse(0.27, 0.27, 5).translate(MURAL_X + 1.15, my + 0.55, mz + 0.004), false);

  // 西墙上一条蓝色腰线（店招的蓝从门面延到西墙；2 行，和招牌中线同高）
  P.add(
    blueFace,
    plate(W / 2 + WIN.x0 - 0.35, 2 * ROW, (-W / 2 + WIN.x0 - 0.35) / 2, SIGN.y0 + SIGN.h / 2 - ROW, FZ + 0.03),
    false,
  );

  void rnd;
  const g = P.build('sports-front');
  // 夜里：玻璃 → 暖色自发光（橱窗的光照到门前：一个灯光圈）；招牌字、OPEN 牌 → 自发光
  const winNight = glowMat(ctx, 'straw', glassOpts, 0x5a4424);
  nightSwitch(
    g,
    new Map<THREE.Material, THREE.Material>([
      [glass, winNight],
      [letterA, neon(ctx, { ...FACE, emissive: 0x3a4810 })],
      [letterB, glowMat(ctx, 'signPaint', FACE, 0x6a5a30)],
    ]),
    { x: 1.2, z: FZ + 1.9, r: 4.2, h: 3.2 },
  );
  return g;
};

// ══ sports-ball-sign：屋顶前沿的大网球（Ø 2.4，站在 0.8 米的墩子上；原点 = 墩子底，y 0 = 屋面）══
const BALL_R = 1.2;
const BALL_Y = 0.8 + BALL_R - 0.06;
/** 网球的缝：a cos t + b cos 3t, a sin t − b sin 3t, 2√(ab) sin 2t（a + b = 1，正好在单位球面上） */
function seamRibbon(r: number, w: number, n: number, rot: THREE.Euler): THREE.BufferGeometry {
  const a = 0.68;
  const b = 1 - a;
  const c = 2 * Math.sqrt(a * b);
  const at = (t: number) =>
    new THREE.Vector3(a * Math.cos(t) + b * Math.cos(3 * t), a * Math.sin(t) - b * Math.sin(3 * t), c * Math.sin(2 * t))
      .normalize()
      .applyEuler(rot);
  const pos: number[] = [];
  const L: THREE.Vector3[] = [];
  const R: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI * 2;
    const p = at(t);
    const tan = at(t + 0.001)
      .sub(at(t - 0.001))
      .normalize();
    const s = new THREE.Vector3()
      .crossVectors(p, tan)
      .normalize()
      .multiplyScalar(w / 2);
    const q = p.clone().multiplyScalar(r);
    L.push(q.clone().add(s));
    R.push(q.clone().sub(s));
  }
  for (let i = 0; i < n; i++) {
    pos.push(...L[i].toArray(), ...R[i].toArray(), ...R[i + 1].toArray());
    pos.push(...L[i].toArray(), ...R[i + 1].toArray(), ...L[i + 1].toArray());
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

const sportsBallSign: AssetFn = (ctx) => {
  const P = new Parts(ctx);
  const c: [number, number, number] = [0, BALL_Y, 0];
  const ballOpts: ToonOpts = { sphereNormals: c, lightUp: 0.6, noise: 0.2, bands: [-0.3, 0.32] };
  const ballM = neon(ctx, ballOpts);
  const seamOpts: ToonOpts = { sphereNormals: c, lightUp: 0.6, bands: [-0.3, 0.32], side: THREE.DoubleSide, edge: 0.2 };
  const seam = ctx.mat('clothWhite', seamOpts);
  const pier = ctx.mat('surround', { elem: { kind: 'paint', size: [8, 6], seed: 9 } });
  const cup = ctx.mat('metal', {});
  // 墩子：外圈绿（同女儿墙），顶上一圈托盘
  P.add(pier, box(0.9, 0.62, 0.9, 0, 0, 0));
  P.add(cup, new THREE.CylinderGeometry(0.62, 0.5, 0.2, 8).translate(0, 0.72, 0));
  P.add(ballM, new THREE.SphereGeometry(BALL_R, 14, 10).translate(...c));
  // 缝：转到朝镜头（南、偏上）那面露出一道 S
  P.add(seam, seamRibbon(BALL_R * 1.012, 0.14, 56, new THREE.Euler(0.55, 0.35, 0.2)).translate(...c), false);
  const g = P.build('sports-ball-sign');
  // 夜里：球（和缝）被屋顶的泛光灯照着 —— 只加一点自发光（不是一颗发光的灯球）
  nightSwitch(
    g,
    new Map<THREE.Material, THREE.Material>([
      [ballM, neon(ctx, { ...ballOpts, emissive: 0x0a0e02 })],
      [seam, ctx.mat('clothWhite', { ...seamOpts, emissive: 0x0e0e10 })],
    ]),
  );
  return g;
};

// ══ stringing-station：门廊上的穿线台（1.2 × 1.3 × 0.8）══
// 立式穿线机（底座 + 立柱 + 转台横杆 + 平放夹着的一支拍：45° 俯视里拍头是一个椭圆环）+ 拉线头 + 一卷线；东边一张圆凳
const stringingStation: AssetFn = (ctx) => {
  const P = new Parts(ctx);
  const rnd = ctx.rng('stringing-station');
  // 小道具：不接收投影（门廊整个在楼的影子里；影子毛边落在小件上是麻点），朝上的面自己亮
  const base = ctx.mat('ironwork', PROP);
  const col = ctx.mat('metal', PROP);
  const frame = ctx.mat(rnd() < 0.5 ? 'clothRed' : 'clothBlue', PROP);
  const bed = ctx.mat('line', { ...PROP, edge: 0.2, convex: 0 });
  const grip = ctx.mat('ironwork', PROP);
  const spool = neon(ctx, PROP);
  const seat = ctx.mat('wood', { ...PROP, elem: { kind: 'planks', seam: 1, hi: 0.5, p: [1, 0, 0, 0.12] } });
  const mx = -0.22;
  // 底座：十字脚（两块 3 纹素的板）
  P.add(base, box(0.62, 0.07, 0.18, mx, 0, 0));
  P.add(base, box(0.18, 0.07, 0.56, mx, 0, 0));
  // 立柱（2 纹素）+ 柱上一个小托盘放一卷线
  P.add(col, box(0.18, 0.8, 0.18, mx, 0.07, 0));
  P.add(col, box(0.27, 0.04, 0.22, mx, 0.46, 0.18));
  P.add(spool, new THREE.CylinderGeometry(0.1, 0.1, 0.12, 6).translate(mx, 0.56, 0.2));
  // 转台：一根横杆（沿 x）+ 两头夹拍的立爪
  const ty = 0.87;
  P.add(col, box(0.84, 0.07, 0.14, mx - 0.06, ty, 0));
  for (const x of [mx - 0.42, mx + 0.3]) P.add(base, box(T, 0.14, 0.18, x, ty + 0.07, 0));
  // 平放的拍：拍头椭圆环（沿 x 长）、拍面浅色、拍颈 + 拍柄往东伸
  const hy = ty + 0.15;
  const hx = mx - 0.08;
  const flat = (g: THREE.BufferGeometry) => g.rotateX(-Math.PI / 2);
  P.add(frame, flat(ellipseRing(0.28, 0.21, T, 8)).translate(hx, hy + 0.012, 0));
  P.add(bed, flat(ellipse(0.28 - T, 0.21 - T, 8)).translate(hx, hy, 0));
  P.add(frame, box(0.22, 0.04, 0.09, hx + 0.38, hy - 0.02, 0));
  P.add(grip, box(0.24, 0.05, 0.1, hx + 0.6, hy - 0.025, 0));
  // 拉线头：杆的东头一个方块（深）+ 一根摇把
  P.add(base, box(0.2, 0.22, 0.2, mx + 0.4, ty - 0.1, -0.12));
  P.add(col, box(T, T, 0.3, mx + 0.4, ty + 0.12, -0.22));
  // 圆凳（东北，师傅坐的地方）
  const sx = 0.4;
  const sz = -0.16;
  P.add(base, new THREE.CylinderGeometry(0.17, 0.2, 0.04, 8).translate(sx, 0, sz));
  P.add(base, box(T, 0.52, T, sx, 0.04, sz));
  P.add(seat, new THREE.CylinderGeometry(0.2, 0.18, 0.07, 8).translate(sx, 0.56, sz));
  const g = P.build('stringing-station');
  return g;
};

// ══ ballcan-bin：门口的特价球罐桶（0.8 × 0.9 × 0.8）══
// 一个敞口的深色圆桶 + 腰上一道红箍 + 金属口沿；里面一堆球罐（罐身球黄、罐盖多是白的），中间堆得高；插一块价签
const ballcanBin: AssetFn = (ctx) => {
  const P = new Parts(ctx);
  const rnd = ctx.rng('ballcan-bin');
  const bin = ctx.mat('ironwork', PROP);
  const band = ctx.mat('clothRed', PROP);
  const rim = ctx.mat('metal', PROP);
  const can = neon(ctx, { ...PROP, lightUp: 0.2 });
  const lidW = ctx.mat('clothWhite', PROP);
  const lidR = ctx.mat('clothRed', PROP);
  const card = ctx.mat('signPaint', SIGN_FACE);
  const mark = ctx.mat('clothRed', SIGN_FACE);
  const R = 0.36;
  const BH = 0.46;
  P.add(bin, new THREE.CylinderGeometry(R, R * 0.92, BH, 10, 1, true).translate(0, BH / 2, 0));
  P.add(bin, new THREE.CircleGeometry(R - 0.02, 10).rotateX(-Math.PI / 2).translate(0, BH - 0.16, 0), false);
  P.add(band, new THREE.CylinderGeometry(R + 0.012, R * 0.98 + 0.012, 0.18, 10, 1, true).translate(0, 0.22, 0), false);
  P.add(rim, new THREE.CylinderGeometry(R + 0.02, R + 0.02, 0.06, 10, 1, true).translate(0, BH - 0.03, 0), false);
  // 球罐：中间一圈高、外圈低，几罐歪着；罐身露出口沿 0.1～0.4 米（黄绿的圆柱读得出来），罐盖只有几个是红 / 白的，别的就是罐顶的黄绿
  const CR = 0.095;
  const CHt = 0.3;
  const spots: [number, number, number][] = [
    [0, 0, 0.16],
    [-0.15, -0.1, 0.06],
    [0.15, -0.08, 0.07],
    [-0.06, 0.16, 0.03],
    [0.17, 0.12, 0.0],
    [-0.19, 0.08, 0.02],
    [0.04, -0.2, 0.05],
    [-0.02, 0.0, 0.32],
  ];
  for (const [x, z, lift] of spots) {
    const tilt = (rnd() - 0.5) * 0.5;
    const yaw = rnd() * Math.PI;
    const y0 = BH - 0.18 + lift;
    const body = new THREE.CylinderGeometry(CR, CR, CHt, 6, 1, true).translate(0, CHt / 2, 0);
    const lid = new THREE.CircleGeometry(CR, 6).rotateX(-Math.PI / 2).translate(0, CHt + 0.004, 0);
    for (const gg of [body, lid]) gg.rotateZ(tilt).rotateY(yaw).translate(x, y0, z);
    P.add(can, body, false);
    const r = rnd();
    P.add(r < 0.25 ? lidR : r < 0.45 ? lidW : can, lid, false);
  }
  // 价签：一根杆 + 一块牌（奶油底，一道红的价钱）
  P.add(bin, box(T, 0.5, T, 0.24, BH - 0.1, -0.16), false);
  P.add(card, box(0.36, 0.22, 0.03, 0.24, BH + 0.36, -0.14), false);
  P.add(mark, plate(0.24, ROW, 0.24, BH + 0.36 + 0.06, -0.12), false);
  return P.build('ballcan-bin');
};

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════
// 店内（id 以 in-sports- 开头；2026-11-16 店内关卡 1+2，设计稿 S1～S5）：interiors/sports.ts 摆进 30 × 24 米的店里。
// 镜头俯 45°、朝北：朝南（朝镜头）的竖直面永远在暗档 → 挂在墙上、朝南的陈列（球拍、线卷、牌子、柜台正面）用 FACE 落中档；
// 东西向的货架侧面在 yaw 0 下看不见 → 货架都做成**台阶式 / A 字架**（每一层的顶面朝上，商品摆在顶面上，俯视读得出来）。
// 尺寸按设计纹素 T（0.09 米）：线、缝 1 纹素，看得见的部分 ≥ 3 渲染纹素；商品按"看得清"放大一点（球罐直径 0.15 米）。
// 夜里：灯具（灯条、台灯、收银机屏幕）换自发光；灯光圈由室内（interiors/sports.ts）按房间铺，资产只在画廊里带一个圈。
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * 店内配色（用户 2026-11-16：店里的配色要和外景的"午后金光沙漠"拉开）：冷、亮、干净的运动零售 ——
 * 浅天蓝的运动地胶、冷白的货架和台面、深海军蓝的背板和台阶、钴蓝的地毯，荧光黄绿 / 红做强调。没有木头、没有沙 / 桃色。
 * 全部借 court 组（inMat → ctx.mat('surround', …)）：午后金光只往暖染 10%，渲染出来还是冷的。暗档往靛蓝走。
 * 后面的 L 是本色 / 高一级 / 低一级（0.2126R + 0.7152G + 0.0722B）。
 */
type Ramp3 = [number, number, number];
const tonesOf = (lit: Ramp3, mid: Ramp3, dark: Ramp3, seam: Ramp3, hi: Ramp3) => ({
  bands: [lit, mid, dark] as [Ramp3, Ramp3, Ramp3],
  seam,
  hi,
});
/**
 * 地胶：天蓝（L 147 / 156 / 138，S 0.73；渲染出来 S ≈ 0.45），每 1.2 米一条接缝（南北向的卷材）。
 * 室内的影子要软：暗档只比亮档暗 ~45（墙影的抖动边不出强边缘），色相往靛紫走
 */
export const IN_FLOOR: ToonOpts = {
  ramp: [0x40a0f0, 0x4a80cc, 0x4a62b8],
  edge: 0.05,
  convex: 0,
  tones: tonesOf(
    [0x40a0f0, 0x4eaaf4, 0x3896e6],
    [0x4a80cc, 0x5488d2, 0x4276c2],
    [0x4a62b8, 0x526cc0, 0x445aae],
    [0x348cdc, 0x3c6cb6, 0x3c50a0],
    [0x6cbaf8, 0x6a9ade, 0x627ac8],
  ),
  elem: { kind: 'planks', space: 'local', seam: 1, hi: 0.2, p: [1, 0, 0, 1.2], mottle: 0.2 },
};
/** 冷白（偏灰一点，和地胶差 < 60 不出强边缘）：货架、台面、柜身（L 218 / 227 / 207；暗档灰靛） */
export const IN_WHITE: ToonOpts = {
  ramp: [0xd2dcec, 0xaab4ce, 0x6a7096],
  edge: 0.5,
  convex: 0.4,
  tones: tonesOf(
    [0xd2dcec, 0xdce4f2, 0xc6d0e4],
    [0xaab4ce, 0xb4bed6, 0xa0aac4],
    [0x6a7096, 0x727aa0, 0x62688c],
    [0xb8c4d8, 0x8e98b6, 0x50567e],
    [0xeaf0fa, 0xc4cee2, 0x8890b4],
  ),
};
/** 深海军蓝：球拍墙背板、球墙台阶、货架背板、线卷板（L 74 / 85 / 66） */
export const IN_NAVY: ToonOpts = {
  ramp: [0x2e4c9a, 0x23397a, 0x1a2452],
  edge: 0.5,
  convex: 0.3,
  tones: tonesOf(
    [0x2e4c9a, 0x3858a6, 0x28448e],
    [0x23397a, 0x2a4284, 0x1e326e],
    [0x1a2452, 0x202c5c, 0x161f48],
    [0x223a7e, 0x1a2c62, 0x111838],
    [0x4a6cc0, 0x3a58a0, 0x2c3a72],
  ),
};
/** 钴蓝：门到球拍墙的地毯、试鞋区的地垫（L 108 / 118 / 99） */
export const IN_COBALT: ToonOpts = {
  ramp: [0x3a6ad8, 0x2c52b0, 0x1e2c6c],
  edge: 0.05,
  convex: 0,
  tones: tonesOf(
    [0x3a6ad8, 0x4676e0, 0x3260cc],
    [0x2c52b0, 0x345aba, 0x264aa4],
    [0x1e2c6c, 0x243476, 0x1a2662],
    [0x305cc4, 0x22449a, 0x141e52],
    [0x5a88e8, 0x4268c4, 0x2e3c84],
  ),
  elem: { kind: 'paint', size: [22, 14], density: [0, 0.02] },
};
/** 试挥区的外场绿（借 court 组）：暗档同样只暗 ~45（L 146 / 156 / 137，影里 L ~100） */
export const IN_GREEN: ToonOpts = {
  ramp: [0x3cb870, 0x2c9a6c, 0x2e7c7a],
  edge: 0.05,
  convex: 0,
  tones: tonesOf(
    [0x3cb870, 0x48c07a, 0x34ac66],
    [0x2c9a6c, 0x34a274, 0x268e64],
    [0x2e7c7a, 0x368684, 0x287272],
    [0x30a462, 0x24865e, 0x246868],
    [0x64d08a, 0x48b080, 0x48968e],
  ),
  elem: { kind: 'paint', size: [22, 14], density: [0, 0.02] },
};
/** 店内材质：opts（上面四个之一）+ extra（FACE / PROP 之类），都借 court 组 */
export const inMat = (ctx: AssetCtx, opts: ToonOpts, extra?: ToonOpts) => ctx.mat('surround', { ...opts, ...extra });

/** 3 × 5 的小像素字（店里的牌子、重量）：# = 宽 1 纹素、高 1 屏幕行；N 4 格宽、W 5 格宽 */
const FONT3: Record<string, string[]> = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'],
  B: ['##.', '#.#', '##.', '#.#', '##.'],
  C: ['.##', '#..', '#..', '#..', '.##'],
  E: ['###', '#..', '##.', '#..', '###'],
  G: ['.##', '#..', '#.#', '#.#', '.##'],
  H: ['#.#', '#.#', '###', '#.#', '#.#'],
  I: ['###', '.#.', '.#.', '.#.', '###'],
  K: ['#.#', '#.#', '##.', '#.#', '#.#'],
  L: ['#..', '#..', '#..', '#..', '###'],
  N: ['#..#', '##.#', '#.##', '#..#', '#..#'],
  O: ['.#.', '#.#', '#.#', '#.#', '.#.'],
  P: ['##.', '#.#', '##.', '#..', '#..'],
  R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['.##', '#..', '.#.', '..#', '##.'],
  T: ['###', '.#.', '.#.', '.#.', '.#.'],
  U: ['#.#', '#.#', '#.#', '#.#', '###'],
  W: ['#...#', '#...#', '#.#.#', '#.#.#', '.#.#.'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'],
  '0': ['###', '#.#', '#.#', '#.#', '###'],
  '1': ['.#.', '##.', '.#.', '.#.', '###'],
  '2': ['##.', '..#', '.#.', '#..', '###'],
  '3': ['##.', '..#', '.#.', '..#', '##.'],
  '5': ['###', '#..', '##.', '..#', '##.'],
  '6': ['.##', '#..', '###', '#.#', '###'],
  '7': ['###', '..#', '.#.', '.#.', '.#.'],
  '8': ['###', '#.#', '###', '#.#', '###'],
  '9': ['###', '#.#', '###', '..#', '##.'],
  $: ['.##', '##.', '.#.', '.##', '##.'],
};
/** 一行小字的宽（纹素格）：字宽 + 1 格字距，空格 2 格 */
const text3Cols = (s: string) =>
  [...s].reduce((n, ch) => n + (ch === ' ' ? 2 : (FONT3[ch]?.[0].length ?? 3) + 1), 0) - 1;
/** 一行小字（居中在 cx）→ 平板；y0 = 字底，z = 离原点（朝 +z） */
function text3(s: string, cx: number, y0: number, z: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  let col = -text3Cols(s) / 2;
  for (const ch of s) {
    if (ch === ' ') {
      col += 2;
      continue;
    }
    const g = FONT3[ch];
    if (!g) continue;
    const gw = g[0].length;
    for (let r = 0; r < 5; r++) {
      const row = g[r];
      let c = 0;
      while (c < gw) {
        if (row[c] !== '#') {
          c++;
          continue;
        }
        let e = c;
        while (e < gw && row[e] === '#') e++;
        out.push(plate((e - c) * T, ROW, cx + (col + (c + e) / 2) * T, y0 + (4 - r) * ROW, z));
        c = e;
      }
    }
    col += gw + 1;
  }
  return out;
}

/** 圆柱（底在 y） */
const cyl = (r: number, h: number, seg: number, x: number, y: number, z: number) =>
  new THREE.CylinderGeometry(r, r, h, seg).translate(x, y + h / 2, z);

/** 灯光圈（资产本地坐标）：r 半径、h 灯下多高以内的东西被照亮 */
export type InPool = { x: number; z: number; r: number; h: number };

/**
 * 店内的夜灯：swaps（白天材质 → 自发光材质）在 setOn 时换；pools 每个一个空的子节点带 userData.night.pool（daylight 每帧挑离镜头最近的 12 个）。
 * 记在 userData.inSwaps / inPools：interiors/sports.ts 把几个资产合成大网格以后，用合起来的表重新挂一次。
 */
export function inNight(root: THREE.Object3D, swaps: Map<THREE.Material, THREE.Material>, pools: InPool[]) {
  root.userData.inSwaps = swaps;
  root.userData.inPools = pools;
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && swaps.has(m.material as THREE.Material)) meshes.push(m);
  });
  let on = false;
  root.userData.night = {
    setOn(o: boolean) {
      on = o;
      for (const m of meshes) {
        const day = (m.userData.inDay ??= m.material) as THREE.Material;
        m.material = on ? (swaps.get(day) ?? day) : day;
      }
    },
  };
  const v = new THREE.Vector3();
  for (const p of pools) {
    const o = new THREE.Object3D();
    o.name = 'in-lamp-pool';
    o.position.set(p.x, 0, p.z);
    root.add(o);
    o.userData.night = {
      pool: (): [number, number, number, number] => {
        o.getWorldPosition(v);
        return on ? [v.x, v.z, p.r, p.h] : [v.x, v.z, 0, 0];
      },
    };
  }
}

/** 灯（灯条、灯罩口）：白天浅奶油、夜里暖黄自发光 */
function lampPair(ctx: AssetCtx, extra: ToonOpts = {}) {
  const day = ctx.mat('signPaint', { ...PROP, ...extra });
  const night = ctx.mat('signPaint', { ...PROP, ...extra, emissive: 0x6a5226 });
  return [day, night] as const;
}

/** 球拍几何（本地 xy 平面、朝 +z；拍头中心在原点，拍柄朝 −y）：框 1 纹素、拍面、拍喉 V、拍颈、缠把 */
function racketGeos(rx = 0.15, ry = 0.19, beam = 1.5 * T) {
  const frame: THREE.BufferGeometry[] = [ellipseRing(rx, ry, beam, 10).translate(0, 0, 0.004)];
  const bed: THREE.BufferGeometry[] = [ellipse(rx - beam, ry - beam, 10)];
  const grip: THREE.BufferGeometry[] = [];
  // 拍喉：实心的倒三角（拍头下沿 0.16 宽 → 拍颈 1 纹素，0.13 高）
  const th = new THREE.BufferGeometry();
  const y0 = -ry + 0.03;
  th.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [-0.08, y0, 0, -T / 2, y0 - 0.15, 0, T / 2, y0 - 0.15, 0, -0.08, y0, 0, T / 2, y0 - 0.15, 0, 0.08, y0, 0],
      3,
    ),
  );
  th.computeVertexNormals();
  frame.push(th.translate(0, 0, 0.004));
  frame.push(plate(T, 0.07, 0, y0 - 0.21, 0.004));
  grip.push(plate(1.5 * T, 0.2, 0, y0 - 0.41, 0.006));
  return { frame, bed, grip };
}

/** 色名 → 材质（'ball' 换成荧光黄绿 NEON） */
function clothMat(ctx: AssetCtx, key: PalKey, extra: ToonOpts): THREE.Material {
  return key === 'ball' ? neon(ctx, extra) : ctx.mat(key, extra);
}

// ── in-racket-wall：北墙球拍墙的一段（3.4 × 4.4 × 0.6，原点 = 脚下中心，背贴墙 z −0.3）。S2 挑球拍 ──
// 钴蓝的槽板（横槽每 0.36 米）上三排 × 7 支球拍（浅蓝拍面 + 彩色拍框：深色背板衬亮色拍子）；顶上一块海军蓝重量牌（"260"… + 5 格重量条，亮几格 = 第几档）+ 灯条；
// 脚下一个冷白矮柜（抽屉缝 + 柜顶几盒线 / 手胶）。变体 v0…v4 = 轻 → 重：拍框颜色从荧光、白、浅蓝走到红、黑、紫。
const RW_SETS: PalKey[][] = [
  ['ball', 'clothWhite', 'jug', 'clothTeal'],
  ['clothTeal', 'clothBlue', 'ball', 'clothWhite'],
  ['clothBlue', 'clothWhite', 'clothRed', 'flowerYellow'],
  ['clothRed', 'clothBlue', 'ball', 'clothWhite'],
  ['clothRed', 'clothPurple', 'flowerYellow', 'clothRed'],
];
const RW_G = ['260', '275', '290', '305', '320'];
const inRacketWall: AssetFn = (ctx) => {
  const P = new Parts(ctx);
  const v = Math.max(0, Math.min(4, ctx.variant));
  const rnd = ctx.rng(`in-sports-racket-wall:${v}`);
  const W = 3.4;
  const BZ = -0.3; // 背
  const slat = inMat(ctx, IN_COBALT, {
    ...FACE,
    elem: { kind: 'planks', space: 'local', seam: 1, hi: 0.4, p: [0, 1, 0, 0.36] },
  });
  const post = ctx.mat('ironwork', FACE);
  const cabFront = inMat(ctx, IN_WHITE, {
    ...FACE,
    elem: { kind: 'planks', space: 'local', seam: 1, hi: 0, p: [1, 0, 0, 0.85] },
  });
  const cabTop = inMat(ctx, IN_WHITE, PROP);
  const cabBody = inMat(ctx, IN_WHITE, PROP);
  const plaque = ctx.mat('signBoard', FACE);
  const ink = ctx.mat('signPaint', FACE);
  const barOn = neon(ctx, FACE);
  const barOff = ctx.mat('hwNavy', FACE);
  const bed = inMat(ctx, IN_FLOOR, { ...FACE, edge: 0.2, elem: undefined });
  const gripM = ctx.mat('ironwork', FACE);
  const [lamp, lampN] = lampPair(ctx, FACE);
  const set = RW_SETS[v];
  const mats = new Map<PalKey, THREE.Material>();
  const m = (k: PalKey) => {
    let x = mats.get(k);
    if (!x) mats.set(k, (x = clothMat(ctx, k, FACE)));
    return x;
  };
  // 槽板 + 两边立柱
  P.add(slat, box(W - 0.12, 2.86, 0.05, 0, 0.62, BZ + 0.025), false);
  for (const s of [-1, 1]) P.add(post, box(0.09, 3.4, 0.09, s * (W / 2 - 0.045), 0.62, BZ + 0.05), false);
  P.add(cabTop, box(W, T, 0.12, 0, 3.47, BZ + 0.06), false); // 槽板顶的压条（朝上 = 一行亮）
  // 矮柜：柜身 + 正面（两个抽屉缝）+ 柜顶
  P.add(cabBody, box(W, 0.6, 0.44, 0, 0, BZ + 0.22));
  P.add(cabFront, plate(W - 0.04, 0.5, 0, 0.04, BZ + 0.445), false);
  P.add(post, plate(W - 0.04, 0.05, 0, 0, BZ + 0.447), false); // 踢脚
  // 柜顶：几盒线（扁盒，3 色轮着）和一筒手胶
  const boxes: PalKey[] = ['clothRed', 'ball', 'clothBlue', 'clothWhite'];
  for (let i = 0; i < 5; i++) {
    const x = -1.3 + i * 0.62 + rnd() * 0.12;
    const k = boxes[(i + v) % boxes.length];
    P.add(clothMat(ctx, k, PROP), box(0.36, 0.09, 0.22, x, 0.6, BZ + 0.24 + rnd() * 0.06), false);
    if (rnd() < 0.6)
      P.add(clothMat(ctx, boxes[(i + 2) % 4], PROP), box(0.36, 0.09, 0.22, x + 0.02, 0.69, BZ + 0.26), false);
  }
  // 球拍：三排 × 7，拍头中心 y 3.08 / 2.18 / 1.28
  const z = BZ + 0.08;
  for (const hy of [3.08, 2.18, 1.28])
    for (let i = 0; i < 7; i++) {
      const x = -1.5 + i * 0.5;
      const k = set[Math.floor(rnd() * set.length)];
      const r = racketGeos();
      for (const g of r.frame) P.add(m(k), g.translate(x, hy, z), false);
      for (const g of r.bed) P.add(bed, g.translate(x, hy, z), false);
      for (const g of r.grip) P.add(k === 'ironwork' ? m('clothWhite') : gripM, g.translate(x, hy, z), false);
    }
  // 重量牌：7 行高的海军蓝，左边重量数字（米黄），右边 5 格重量条（亮 v + 1 格，一格比一格高）
  const PY = 3.58;
  P.add(plaque, plate(2.6, 7 * ROW, 0, PY, BZ + 0.1), false);
  for (const g of text3(`${RW_G[v]}G`, -0.55, PY + ROW, BZ + 0.11)) P.add(ink, g, false);
  for (let k = 0; k < 5; k++) {
    const h = (k + 1) * ROW;
    P.add(k <= v ? barOn : barOff, plate(2 * T, h, 0.35 + k * 0.22, PY + ROW, BZ + 0.11), false);
  }
  // 灯条（牌子上沿，往下照）
  P.add(lamp, box(W - 0.3, 0.07, 0.14, 0, PY + 7 * ROW + 0.02, BZ + 0.16), false);
  const g = P.build('in-sports-racket-wall');
  inNight(g, new Map([[lamp, lampN]]), [{ x: 0, z: 1.4, r: 3.2, h: 4.6 }]);
  return g;
};

// ── in-sign：店里朝南的牌子（变体 = 字）。原点 = 牌子底边中心（贴在墙上 / 货架顶上）；板 0.06 厚 ──
// v0 RACKETS（球拍墙正中，海军蓝底荧光字）、v1 STRINGING（穿线角）、v2 BALLS、v3 CONSIGN（寄卖，紫底）、v4 SHOES、v5 PAY HERE（收银）
const SIGNS: { text: string; board: PalKey; ink: PalKey }[] = [
  { text: 'RACKETS', board: 'signBoard', ink: 'ball' },
  { text: 'STRINGING', board: 'clothRed', ink: 'signPaint' },
  { text: 'BALLS', board: 'signBoard', ink: 'ball' },
  { text: 'CONSIGN', board: 'clothPurple', ink: 'signPaint' },
  { text: 'SHOES', board: 'clothTeal', ink: 'signPaint' },
  { text: 'PAY HERE', board: 'signBoard', ink: 'signPaint' },
];
const inSign: AssetFn = (ctx) => {
  const P = new Parts(ctx);
  const s = SIGNS[Math.max(0, Math.min(SIGNS.length - 1, ctx.variant))];
  const cols = text3Cols(s.text);
  const w = (cols + 4) * T;
  const h = 7 * ROW;
  const board = ctx.mat(s.board, FACE);
  const ink = clothMat(ctx, s.ink, FACE);
  const edgeM = inMat(ctx, IN_WHITE, PROP);
  P.add(board, box(w, h, 0.06, 0, 0, 0), false);
  P.add(edgeM, box(w + 0.04, 0.05, 0.1, 0, h, 0), false); // 顶上一条亮边（朝上的窄面）
  for (const g of text3(s.text, 0, ROW, 0.034)) P.add(ink, g, false);
  const g = P.build('in-sports-sign');
  const inkN =
    s.ink === 'ball' ? neon(ctx, { ...FACE, emissive: 0x3a4810 }) : ctx.mat(s.ink, { ...FACE, emissive: 0x5a4a28 });
  inNight(g, new Map([[ink, inkN]]), []);
  return g;
};

// ── in-ball-wall：西墙的球墙一段（深 2.2 × 高 1.5 × 长 3.4，原点 = 脚下中心，墙在 x −1.1）。S1 拿球 ──
// 三级深海军蓝的台阶往墙那边升高（台面朝上，俯视读得出一排排商品；荧光球罐在深蓝上跳出来）：最外一级（矮）72 个装的比赛球箱（白底 + 荧光一道），
// 中间一级四罐一组的球罐，最里一级单罐立着；罐身荧光黄绿、罐盖白 / 红 / 蓝（三个牌子）。墙上一道背板（看得见顶）。
// 变体：v0 / v1 / v2 罐盖的牌子比例不同；v3 最外一级换成球篮（教练用的捡球篮，青绿铁框 + 一团球）。
const inBallWall: AssetFn = (ctx) => {
  const P = new Parts(ctx);
  const v = ctx.variant;
  const rnd = ctx.rng(`in-sports-ball-wall:${v}`);
  const L = 3.4;
  const tierM = inMat(ctx, IN_NAVY, PROP);
  const riser = inMat(ctx, IN_WHITE, FACE);
  const back = inMat(ctx, IN_NAVY, PROP);
  const can = neon(ctx, { ...PROP, lightUp: 0.25, edge: 0.15, convex: 0 });
  const lids: THREE.Material[] = [
    ctx.mat('clothWhite', { ...PROP, edge: 0.15 }),
    ctx.mat('clothRed', { ...PROP, edge: 0.15 }),
    ctx.mat('clothBlue', { ...PROP, edge: 0.15 }),
  ];
  const kraft = inMat(ctx, IN_WHITE, PROP);
  const kraftBand = neon(ctx, PROP);
  const hopper = ctx.mat('metal', PROP);
  // 三级：[x0, x1, 台面高]
  const tiers: [number, number, number][] = [
    [0.36, 1.1, 0.42],
    [-0.38, 0.36, 0.82],
    [-1.02, -0.38, 1.22],
  ];
  for (const [x0, x1, h] of tiers) {
    P.add(tierM, box(x1 - x0, h, L, (x0 + x1) / 2, 0, 0));
    P.add(riser, plate(x1 - x0, 2 * ROW, (x0 + x1) / 2, h - 2 * ROW - 0.02, L / 2 + 0.005), false); // 南头一条蓝色价签条
  }
  P.add(back, box(0.08, 1.5, L, -1.06, 0, 0));
  const CR = 0.09;
  const CH = 0.3;
  const lidOf = () => {
    const r = rnd();
    const a = v === 1 ? 0.15 : v === 2 ? 0.45 : 0.3;
    return r < a ? lids[0] : r < a + (1 - a) * 0.55 ? lids[1] : lids[2];
  };
  const canAt = (x: number, y: number, z: number, lid: THREE.Material) => {
    P.add(can, cyl(CR, CH - 0.03, 6, x, y, z));
    P.add(lid, cyl(CR + 0.006, 0.03, 6, x, y + CH - 0.03, z), false);
  };
  // 最里一级：单罐，3 列 × 14
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 14; j++) {
      if (rnd() < 0.06) continue;
      canAt(-0.9 + i * 0.22, 1.22, -L / 2 + 0.16 + j * 0.23 + (i % 2) * 0.05, lidOf());
    }
  // 中间一级：四罐一组（2 × 2，组间空 0.1），每组同一个牌子
  for (let gz = 0; gz < 7; gz++)
    for (let gx = 0; gx < 2; gx++) {
      if (rnd() < 0.1) continue;
      const lid = lidOf();
      const cx = -0.18 + gx * 0.38;
      const cz = -L / 2 + 0.28 + gz * 0.46;
      for (const [dx, dz] of [
        [-0.095, -0.095],
        [0.095, -0.095],
        [-0.095, 0.095],
        [0.095, 0.095],
      ] as const)
        canAt(cx + dx, 0.82, cz + dz, lid);
    }
  // 最外一级：72 个装的纸箱（v3：两个捡球篮 + 纸箱）
  const nBox = v === 3 ? 3 : 5;
  for (let k = 0; k < nBox; k++) {
    const bz = -L / 2 + 0.38 + k * 0.66;
    const bh = 0.36;
    P.add(kraft, box(0.6, bh, 0.52, 0.73, 0.42, bz));
    P.add(kraftBand, box(0.61, 2 * T, 0.53, 0.73, 0.42 + bh - 0.2, bz), false);
    if (rnd() < 0.45) P.add(kraft, box(0.56, 0.3, 0.48, 0.73 + (rnd() - 0.5) * 0.06, 0.42 + bh, bz), false);
  }
  if (v === 3)
    for (const bz of [0.75, 1.3]) {
      // 捡球篮：青绿铁框（四根腿 + 上沿一圈）+ 一团球
      P.add(hopper, box(0.42, 0.05, 0.42, 0.73, 0.42 + 0.5, bz), false);
      for (const [dx, dz] of [
        [-0.18, -0.18],
        [0.18, -0.18],
        [-0.18, 0.18],
        [0.18, 0.18],
      ] as const)
        P.add(hopper, box(0.05, 0.55, 0.05, 0.73 + dx, 0.42, bz + dz), false);
      P.add(kraftBand, new THREE.SphereGeometry(0.2, 8, 5).scale(1, 0.75, 1).translate(0.73, 0.42 + 0.48, bz), false);
    }
  return P.build('in-sports-ball-wall');
};

// ── in-shoe-wall：东墙的鞋墙一段（深 1.8 × 高 1.6 × 长 4，原点 = 脚下中心，墙在 x +0.9）──
// 三级台阶往东墙升高；每级一排排鞋（一双 = 两只并排的圆头小块，鞋头朝西 = 朝过道），鞋底一道白（侧面看是一条亮边）；
// 墙边最高一级放鞋盒（深蓝盒 + 彩色盖）。变体换颜色。
const inShoeWall: AssetFn = (ctx) => {
  const P = new Parts(ctx);
  const v = ctx.variant;
  const rnd = ctx.rng(`in-sports-shoe-wall:${v}`);
  const L = 4;
  const tierM = inMat(ctx, IN_WHITE, PROP);
  const riser = ctx.mat('clothTeal', FACE);
  const back = inMat(ctx, IN_NAVY, PROP);
  const sole = ctx.mat('clothWhite', PROP);
  const kraft = inMat(ctx, IN_NAVY, PROP);
  const SHOE: PalKey[] =
    v % 2 ? ['clothBlue', 'clothWhite', 'clothRed', 'ball'] : ['clothWhite', 'ball', 'clothTeal', 'clothPurple'];
  const shoeMats = SHOE.map((k) => clothMat(ctx, k, { ...PROP, lightUp: 0.2 }));
  const lidMats = (['clothRed', 'ball', 'clothWhite'] as PalKey[]).map((k) => clothMat(ctx, k, PROP));
  const tiers: [number, number, number][] = [
    [-0.9, -0.3, 0.36],
    [-0.3, 0.3, 0.72],
    [0.3, 0.86, 1.08],
  ];
  for (const [x0, x1, h] of tiers) {
    P.add(tierM, box(x1 - x0, h, L, (x0 + x1) / 2, 0, 0));
    P.add(riser, plate(x1 - x0, 2 * ROW, (x0 + x1) / 2, h - 2 * ROW - 0.02, L / 2 + 0.005), false);
  }
  P.add(back, box(0.08, 2.0, L, 0.88, 0, 0));
  // 一双鞋：两只（各 0.13 宽 × 0.12 高 × 0.32 长，鞋头朝 −x 收窄一点），鞋底一条白
  const pair = (cx: number, y: number, cz: number, m: THREE.Material) => {
    for (const s of [-1, 1]) {
      const z = cz + s * 0.085;
      const g = new THREE.BoxGeometry(0.32, 0.11, 0.13, 2, 1, 1);
      const pos = g.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        if (x < -0.1) pos.setY(i, Math.min(pos.getY(i), 0.0)); // 鞋头低
      }
      g.computeVertexNormals();
      P.add(m, g.translate(cx, y + 0.045 + 0.055, z));
      P.add(sole, box(0.33, 0.045, 0.14, cx, y, z), false);
    }
  };
  for (let t = 0; t < 2; t++) {
    const [x0, x1, h] = tiers[t];
    for (let j = 0; j < 9; j++) {
      if (rnd() < 0.12) continue;
      pair((x0 + x1) / 2, h, -L / 2 + 0.26 + j * 0.43, shoeMats[Math.floor(rnd() * shoeMats.length)]);
    }
  }
  // 最高一级：鞋盒两摞
  const [bx0, bx1, bh] = tiers[2];
  for (let j = 0; j < 7; j++) {
    const z = -L / 2 + 0.32 + j * 0.56;
    const n = 1 + Math.floor(rnd() * 3);
    for (let k = 0; k < n; k++) {
      const y = bh + k * 0.15;
      P.add(kraft, box(0.42, 0.12, 0.3, (bx0 + bx1) / 2, y, z));
      P.add(lidMats[(j + k) % 3], box(0.44, 0.03, 0.32, (bx0 + bx1) / 2, y + 0.12, z), false);
    }
  }
  return P.build('in-sports-shoe-wall');
};

// ── in-gondola：A 字架货架（宽 1.5 × 高 1.6 × 长 9.4，原点 = 脚下中心，南北向）──
// 中间一道深蓝的背板，两边各两级冷白台面往外降低；商品摆在台面上（俯视看得见）。南头一个端架朝镜头（三层，商品正面朝南）。
// v0 = 配件（手胶、避震器、护腕：一盒盒彩色小块），南头端架挂"GRIPS"；v1 = 球包（长条圆角的包，彩色 + 一道对比色），端架挂"BAGS"。
const inGondola: AssetFn = (ctx) => {
  const P = new Parts(ctx);
  const v = ctx.variant % 2;
  const rnd = ctx.rng(`in-sports-gondola:${ctx.variant}`);
  const L = 9.4;
  const shelf = inMat(ctx, IN_WHITE, { ...PROP, convex: 0.3 });
  const spine = inMat(ctx, IN_NAVY, PROP);
  const spineFace = inMat(ctx, IN_NAVY, FACE);
  const plinth = ctx.mat('ironwork', PROP);
  const cap = inMat(ctx, IN_WHITE, FACE);
  const COL: PalKey[] =
    v === 0
      ? ['clothWhite', 'ball', 'clothBlue', 'clothRed', 'clothPurple', 'clothTeal']
      : ['clothRed', 'ironwork', 'clothBlue', 'clothWhite', 'ball'];
  const prod = COL.map((k) => clothMat(ctx, k, { ...PROP, lightUp: 0.15 }));
  const prodFace = COL.map((k) => clothMat(ctx, k, FACE));
  const stripe = ctx.mat('clothWhite', PROP);
  // 底座、背板
  P.add(plinth, box(1.5, 0.12, L, 0, 0, 0));
  P.add(spine, box(0.1, 1.6, L, 0, 0.12, 0));
  P.add(shelf, box(0.16, T, L, 0, 1.72, 0)); // 背板顶的压条
  // 两边两级台面：里一级高 0.95（x ±0.05…±0.4），外一级高 0.5（±0.4…±0.75）
  const levels: [number, number, number][] = [
    [0.05, 0.4, 0.95],
    [0.4, 0.75, 0.5],
  ];
  for (const s of [-1, 1])
    for (const [a, b, h] of levels) {
      const cx = (s * (a + b)) / 2;
      P.add(shelf, box(b - a, h - 0.12, L - 0.1, cx, 0.12, 0));
      // 商品：沿 z 一格一格（v0 小盒 0.18 × 0.14 × 0.22；v1 球包 0.3 × 0.26 × 0.8 横躺）
      if (v === 0) {
        for (let z = -L / 2 + 0.25; z < L / 2 - 0.2; z += 0.27) {
          if (rnd() < 0.12) continue;
          const k = Math.floor(rnd() * prod.length);
          const n = 1 + (rnd() < 0.4 ? 1 : 0);
          for (let q = 0; q < n; q++) P.add(prod[k], box(0.22, 0.12, 0.2, cx, h + q * 0.12, z));
        }
      } else {
        for (let z = -L / 2 + 0.55; z < L / 2 - 0.5; z += 0.95) {
          if (rnd() < 0.15) continue;
          const k = Math.floor(rnd() * prod.length);
          const bag = new THREE.CylinderGeometry(0.14, 0.14, 0.82, 8).rotateX(Math.PI / 2).scale(1.05, 1, 1);
          P.add(prod[k], bag.translate(cx, h + 0.14, z));
          P.add(stripe, box(0.3, 0.29, T, cx, h, z - 0.2), false); // 包上一道白（拉链带）
        }
      }
    }
  // 南头端架：三层朝南（0.15 / 0.6 / 1.05），每层一排商品正面；顶上一块牌子
  const ez = L / 2 + 0.25;
  P.add(spine, box(1.4, 1.5, 0.08, 0, 0.12, L / 2 + 0.02));
  for (const y of [0.15, 0.6, 1.05]) {
    P.add(shelf, box(1.4, 0.05, 0.42, 0, y, ez));
    for (let i = 0; i < 5; i++) {
      if (rnd() < 0.15) continue;
      const k = Math.floor(rnd() * prodFace.length);
      if (v === 0) P.add(prodFace[k], box(0.18, 0.3, 0.12, -0.52 + i * 0.26, y + 0.05, ez + 0.05));
      else if (i % 2 === 0) P.add(prodFace[k], box(0.38, 0.36, 0.2, -0.5 + i * 0.25, y + 0.05, ez));
    }
  }
  P.add(spineFace, plate(1.4, ROW, 0, 0.12, L / 2 + 0.061), false);
  const signTxt = v === 0 ? 'GRIPS' : 'BAGS';
  const sw = (text3Cols(signTxt) + 4) * T;
  P.add(cap, box(sw, 7 * ROW, 0.06, 0, 1.72, L / 2 + 0.03), false);
  for (const g of text3(signTxt, 0, 1.72 + ROW, L / 2 + 0.065)) P.add(prodFace[v === 0 ? 3 : 2], g, false);
  return P.build('in-sports-gondola');
};

// ── in-clothes-rack：圆衣架（Ø 1.5 × 1.55，原点 = 脚下中心）──
// 一根立柱 + 1.35 米高一圈横杆；18 件衣服沿圈挂（每件是朝外的一片：肩宽 0.5、长 0.7，衣架钩一纹素）；俯视是一圈彩色的"花瓣"。
// v0 = 网球衫（白 / 海军蓝 / 青绿），v1 = 裙装和外套（红 / 紫 / 白）
const inClothesRack: AssetFn = (ctx) => {
  const P = new Parts(ctx);
  const v = ctx.variant % 2;
  const rnd = ctx.rng(`in-sports-clothes-rack:${ctx.variant}`);
  const metal = ctx.mat('metal', PROP);
  const base = ctx.mat('ironwork', PROP);
  const COL: PalKey[] =
    v === 0
      ? ['clothWhite', 'clothBlue', 'clothTeal', 'clothWhite']
      : ['clothRed', 'clothPurple', 'clothWhite', 'ball'];
  const cloth = COL.map((k) => clothMat(ctx, k, { ...FACE, convex: 0.2 }));
  P.add(base, new THREE.CylinderGeometry(0.32, 0.36, 0.06, 10).translate(0, 0.03, 0));
  P.add(metal, cyl(0.045, 1.38, 6, 0, 0.06, 0));
  P.add(metal, new THREE.TorusGeometry(0.62, 0.035, 4, 16).rotateX(Math.PI / 2).translate(0, 1.38, 0), false);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + rnd() * 0.08;
    const m = cloth[Math.floor(rnd() * cloth.length)];
    const len = v === 1 && rnd() < 0.5 ? 0.9 : 0.68;
    // 一件：衣身一片（厚 0.06，沿切线方向宽）+ 肩（略宽一点的一条）
    const g = new THREE.BoxGeometry(0.42, len, 0.11).translate(0, -len / 2, 0);
    const sh = new THREE.BoxGeometry(0.5, 0.12, 0.13).translate(0, -0.08, 0);
    for (const x of [g, sh]) {
      x.rotateY(-a + Math.PI / 2).translate(Math.cos(a) * 0.66, 1.34, Math.sin(a) * 0.66);
      P.add(m, x);
    }
  }
  return P.build('in-sports-clothes-rack');
};

// ── in-shoe-bench：试鞋凳（2.0 × 0.5 × 0.6，原点 = 脚下中心）+ 量脚器 + 一摞鞋盒 ──
const inShoeBench: AssetFn = (ctx) => {
  const P = new Parts(ctx);
  const wood = inMat(ctx, IN_WHITE, PROP);
  const cushion = ctx.mat('clothRed', PROP);
  const leg = ctx.mat('ironwork', PROP);
  const kraft = inMat(ctx, IN_NAVY, PROP);
  const lid = ctx.mat('clothRed', PROP);
  const lid2 = ctx.mat('clothBlue', PROP);
  const plateM = ctx.mat('ironwork', PROP);
  const scale = ctx.mat('signPaint', PROP);
  P.add(wood, box(2.0, 0.08, 0.56, 0, 0.36, 0));
  P.add(cushion, box(1.9, 0.08, 0.5, 0, 0.44, 0));
  for (const x of [-0.85, 0.85]) P.add(leg, box(0.1, 0.36, 0.48, x, 0, 0));
  // 量脚器（凳前地上：一块深色板 + 米黄刻度条 + 脚跟挡）
  P.add(plateM, box(0.3, 0.03, 0.42, -0.35, 0, 0.62), false);
  P.add(scale, box(0.06, 0.035, 0.36, -0.42, 0, 0.62), false);
  P.add(plateM, box(0.3, 0.08, 0.06, -0.35, 0, 0.42), false);
  // 一摞鞋盒（凳子东头）
  for (let k = 0; k < 3; k++) {
    P.add(kraft, box(0.42, 0.12, 0.3, 1.32, k * 0.15, 0.05 + (k % 2) * 0.03));
    P.add(k % 2 ? lid2 : lid, box(0.44, 0.03, 0.32, 1.32, k * 0.15 + 0.12, 0.05 + (k % 2) * 0.03), false);
  }
  return P.build('in-sports-shoe-bench');
};

// ── in-pyramid：门口的球罐金字塔（底 1.6 × 高 1.75，原点 = 脚下中心）。S1：推车撞上会塌 ──
// 一块深色圆台（荧光一道边）+ 一层层球罐：每层下面垫一张纸板（一行亮边），罐盖一层白一层红（横带，远看就是一座黄绿金字塔）；
// 塔尖一罐倒扣一颗大球；台边插一块"SALE"小牌。
const inPyramid: AssetFn = (ctx) => {
  const P = new Parts(ctx);
  const can = neon(ctx, { ...PROP, lightUp: 0.3, edge: 0.15, convex: 0 });
  const lidW = ctx.mat('clothWhite', { ...PROP, edge: 0.15 });
  const lidR = ctx.mat('clothRed', { ...PROP, edge: 0.15 });
  const board = inMat(ctx, IN_WHITE, PROP);
  const plinth = inMat(ctx, IN_NAVY, PROP);
  const rim = neon(ctx, PROP);
  const sign = ctx.mat('clothRed', FACE);
  const ink = ctx.mat('signPaint', FACE);
  const pole = ctx.mat('ironwork', PROP);
  const ball = neon(ctx, { ...PROP, sphereNormals: [0, 0, 0], lightUp: 0.5 });
  const CR = 0.095;
  const CH = 0.3;
  const S = 0.21;
  const N = 6;
  P.add(plinth, new THREE.CylinderGeometry(1.0, 1.04, 0.14, 12).translate(0, 0.07, 0));
  P.add(rim, new THREE.CylinderGeometry(1.012, 1.012, 0.045, 12, 1, true).translate(0, 0.1, 0), false);
  let y = 0.14;
  for (let t = 0; t < N; t++) {
    const n = N - t;
    const half = ((n - 1) * S) / 2;
    P.add(board, box(n * S + 0.04, 0.02, n * S + 0.04, 0, y, 0), false);
    y += 0.02;
    const lid = t % 2 ? lidR : lidW;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        const x = -half + i * S;
        const z = -half + j * S;
        P.add(can, cyl(CR, CH - 0.03, 6, x, y, z));
        P.add(lid, cyl(CR + 0.006, 0.03, 6, x, y + CH - 0.03, z), false);
      }
    y += CH;
  }
  P.add(ball, new THREE.SphereGeometry(0.15, 10, 7).translate(0, y + 0.14, 0));
  // SALE 牌（东南角，插在台边上）
  P.add(pole, box(T, 1.15, T, 1.15, 0.0, 0.25), false);
  const sw = (text3Cols('SALE') + 3) * T;
  P.add(sign, box(sw, 6 * ROW, 0.04, 1.15, 1.15, 0.28), false);
  for (const g of text3('SALE', 1.15, 1.15 + ROW * 0.5, 0.305)) P.add(ink, g, false);
  return P.build('in-sports-pyramid');
};

// ── in-checkout：收银台（L 形：东西 6 × 0.9 + 东头往北 2.4；高 1.0。原点 = 东西那段的脚下中心）。S4 结账 ──
// 柜身俱乐部蓝（正面朝南 FACE，一道白腰线）+ 米白台面；台面上：扫码台（深色、一块红窗夜里亮）、收银机（屏幕夜里亮）、
// 刷卡机、一摞购物袋、一筒手胶的冲动消费小桶、一罐避震器；东头那段放打包台（纸箱、胶带）。店员站在 L 里面（北侧）。
const inCheckout: AssetFn = (ctx) => {
  const P = new Parts(ctx);
  const rnd = ctx.rng('in-sports-checkout');
  const body = ctx.mat('counter', PROP);
  const front = ctx.mat('counter', FACE);
  const band = ctx.mat('clothWhite', FACE);
  const top = inMat(ctx, IN_WHITE, PROP);
  const dark = ctx.mat('ironwork', PROP);
  const screen = ctx.mat('jug', PROP);
  const screenN = ctx.mat('jug', { ...PROP, emissive: 0x2a4a5a });
  const glass = ctx.mat('flowerRed', PROP);
  const glassN = ctx.mat('flowerRed', { ...PROP, emissive: 0x5a1a10 });
  const bag = ctx.mat('clothWhite', PROP);
  const kraft = inMat(ctx, IN_WHITE, PROP);
  const tub = ctx.mat('clothBlue', PROP);
  const COL: PalKey[] = ['clothRed', 'ball', 'clothWhite', 'clothPurple', 'clothTeal'];
  const W = 6;
  const D = 0.9;
  const H = 1.0;
  // 东西段 + 东头往北一段
  P.add(body, box(W, H - 0.06, D, 0, 0, 0));
  P.add(top, box(W + 0.08, 0.06, D + 0.1, 0, H - 0.06, 0));
  P.add(front, plate(W - 0.02, H - 0.08, 0, 0.02, D / 2 + 0.003), false);
  P.add(band, plate(W - 0.02, ROW, 0, 0.62, D / 2 + 0.006), false);
  P.add(body, box(D, H - 0.06, 2.4, W / 2 - D / 2, 0, -1.2 - D / 2 + 0.01));
  P.add(top, box(D + 0.1, 0.06, 2.4, W / 2 - D / 2, H - 0.06, -1.2 - D / 2 + 0.01));
  // 扫码台（偏西，客人从西边推车过来）：一块深色板 + 红窗
  P.add(dark, box(0.6, 0.05, 0.5, -1.6, H, 0.05), false);
  P.add(glass, box(0.36, 0.012, 0.22, -1.6, H + 0.05, 0.05), false);
  // 收银机：底座 + 斜屏（朝南上方）+ 钱箱
  P.add(dark, box(0.5, 0.14, 0.42, -0.4, H, -0.1));
  const scr = box(0.46, 0.3, 0.05, 0, 0, 0)
    .rotateX(-0.45)
    .translate(-0.4, H + 0.26, -0.16);
  P.add(dark, scr);
  P.add(
    screen,
    plate(0.38, 0.22, 0, 0.04, 0.03)
      .rotateX(-0.45)
      .translate(-0.4, H + 0.26, -0.16),
    false,
  );
  P.add(dark, box(0.16, 0.08, 0.22, 0.2, H, 0.14), false); // 刷卡机
  // 一摞购物袋（白）、手胶小桶、避震器罐
  P.add(bag, box(0.42, 0.18, 0.3, 0.8, H, -0.12));
  P.add(tub, cyl(0.17, 0.2, 8, 1.5, H, 0.1));
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const m = clothMat(ctx, COL[i % COL.length], PROP);
    P.add(m, cyl(0.035, 0.26, 4, 1.5 + Math.cos(a) * 0.09, H + 0.04, 0.1 + Math.sin(a) * 0.09), false);
  }
  P.add(neon(ctx, PROP), cyl(0.1, 0.14, 6, 2.05, H, 0.18), false);
  // 东头那段：打包台（纸箱、一卷胶带）
  P.add(kraft, box(0.5, 0.32, 0.45, W / 2 - D / 2, H, -1.5));
  P.add(kraft, box(0.42, 0.24, 0.4, W / 2 - D / 2 + 0.02, H + 0.32, -1.48), false);
  P.add(dark, cyl(0.08, 0.06, 8, W / 2 - D / 2, H, -0.6), false);
  void rnd;
  const g = P.build('in-sports-checkout');
  inNight(
    g,
    new Map([
      [screen, screenN],
      [glass, glassN],
    ]),
    [{ x: -0.6, z: 0.3, r: 3, h: 4.6 }],
  );
  return g;
};

// ── in-cart：购物车（0.62 宽 × 1.0 高 × 1.0 长，原点 = 脚下中心，车头朝 −z（北），把手在 +z）。S1 推车 ──
// 红色塑料筐（四面 + 底，俯视看得见筐里的暗底）、深色车架、四个小轮、把手一条米白握把。
const inCart: AssetFn = (ctx) => {
  const P = new Parts(ctx);
  const basket = ctx.mat('clothRed', { ...PROP, convex: 0.4 });
  const inner = ctx.mat('clothRed', { ...PROP, ramp: [0xb43c4c, 0x8a2e48, 0x4e2050], edge: 0.2, convex: 0 });
  const frame = ctx.mat('ironwork', PROP);
  const grip = inMat(ctx, IN_WHITE, PROP);
  const BW = 0.56;
  const BL = 0.78;
  const by = 0.45;
  const bh = 0.38;
  const t = 0.05;
  // 筐：底 + 四面（前面窄一点：前沿收 0.04）
  P.add(inner, box(BW - 2 * t, 0.03, BL - 2 * t, 0, by, -0.06));
  P.add(basket, box(t, bh, BL, -BW / 2 + t / 2, by, -0.06));
  P.add(basket, box(t, bh, BL, BW / 2 - t / 2, by, -0.06));
  P.add(basket, box(BW, bh, t, 0, by, -0.06 - BL / 2 + t / 2));
  P.add(basket, box(BW, bh * 0.85, t, 0, by + bh * 0.15, -0.06 + BL / 2 - t / 2));
  // 车架：两条底梁 + 后立柱 + 底下的托盘
  for (const s of [-1, 1]) {
    P.add(frame, box(T, T, 0.9, s * 0.24, 0.12, -0.04), false);
    P.add(frame, box(T, 0.5, T, s * 0.26, 0.12, 0.38), false);
  }
  P.add(frame, box(0.44, 0.03, 0.6, 0, 0.18, -0.06), false);
  // 轮子
  for (const [x, z] of [
    [-0.24, -0.42],
    [0.24, -0.42],
    [-0.24, 0.36],
    [0.24, 0.36],
  ] as const)
    P.add(frame, box(0.06, 0.12, 0.12, x, 0, z), false);
  // 把手
  P.add(frame, box(T, 0.18, T, -0.27, by + bh, 0.4), false);
  P.add(frame, box(T, 0.18, T, 0.27, by + bh, 0.4), false);
  P.add(grip, box(0.62, 0.07, 0.07, 0, by + bh + 0.16, 0.44), false);
  return P.build('in-sports-cart');
};

// ── in-consign-rack：寄卖架（5.2 宽 × 2.4 高 × 0.5，原点 = 脚下中心，朝南）+ 地上一箱旧拍子。S5 寄卖旧拍子 ──
// 一面独立的洞洞板（天蓝，横缝），顶上紫色"CONSIGN"牌；两排旧拍子（木拍带夹板、褪色的老款铝拍、几支新的），
// 每支拍柄下吊一张米黄价签（有几张划了红道 = 卖了）；架子前地上一个纸箱，竖着插三支拍子（拍柄朝上）。
const inConsignRack: AssetFn = (ctx) => {
  const P = new Parts(ctx);
  const rnd = ctx.rng('in-sports-consign-rack');
  const W = 5.2;
  const board = inMat(ctx, IN_FLOOR, {
    ...FACE,
    elem: { kind: 'planks', space: 'local', seam: 1, hi: 0.3, p: [0, 1, 0, 0.42] },
  });
  const boardBack = inMat(ctx, IN_WHITE, PROP);
  const leg = ctx.mat('ironwork', PROP);
  const bed = ctx.mat('line', { ...FACE, edge: 0.2 });
  const grip = ctx.mat('ironwork', FACE);
  const tag = ctx.mat('signPaint', FACE);
  const sold = ctx.mat('clothRed', FACE);
  const press = ctx.mat('wood', FACE);
  const OLD: PalKey[] = ['wood', 'woodWeathered', 'metal', 'clothWhite', 'clothRed', 'clothBlue', 'rust'];
  const mats = new Map<PalKey, THREE.Material>();
  const m = (k: PalKey) => {
    let x = mats.get(k);
    if (!x) mats.set(k, (x = clothMat(ctx, k, FACE)));
    return x;
  };
  // 板 + 两只脚（前后叉开的 T 字脚）
  P.add(boardBack, box(W, 2.0, 0.06, 0, 0.3, 0));
  P.add(board, plate(W - 0.04, 1.96, 0, 0.32, 0.031), false);
  for (const s of [-1, 1]) {
    P.add(leg, box(0.1, 0.32, 0.1, s * (W / 2 - 0.3), 0, 0));
    P.add(leg, box(0.1, 0.06, 0.8, s * (W / 2 - 0.3), 0, 0));
  }
  // 牌子
  const sw = (text3Cols('CONSIGN') + 4) * T;
  P.add(ctx.mat('clothPurple', FACE), box(sw, 7 * ROW, 0.06, 0, 2.32, 0.02), false);
  for (const g of text3('CONSIGN', 0, 2.32 + ROW, 0.055)) P.add(tag, g, false);
  // 两排旧拍子，每排 9 支
  const z = 0.06;
  for (const [row, hy] of [
    [0, 1.92],
    [1, 1.02],
  ] as const)
    for (let i = 0; i < 9; i++) {
      const x = -W / 2 + 0.42 + i * ((W - 0.84) / 8);
      const k = OLD[Math.floor(rnd() * OLD.length)];
      const wooden = k === 'wood' || k === 'woodWeathered';
      const r = racketGeos(wooden ? 0.13 : 0.14, wooden ? 0.16 : 0.17, wooden ? 1.5 * T : T);
      for (const g of r.frame) P.add(m(k), g.translate(x, hy, z), false);
      for (const g of r.bed) P.add(bed, g.translate(x, hy, z), false);
      for (const g of r.grip) P.add(grip, g.translate(x, hy, z), false);
      // 木拍带夹板（拍头外一圈方框：上下两条 + 两根螺杆）
      if (wooden && rnd() < 0.6) {
        P.add(press, plate(0.34, ROW, x, hy + 0.12, z + 0.012), false);
        P.add(press, plate(0.34, ROW, x, hy - 0.24, z + 0.012), false);
      }
      // 价签（拍柄下吊一张，1 纹素的线省掉：签直接挂在拍柄下沿）
      const ty = hy - 0.17 - 0.4 - 2 * ROW - 0.02;
      P.add(tag, plate(3 * T, 2 * ROW, x + 0.04, ty, z + 0.01), false);
      if ((row === 0 && i % 4 === 1) || (row === 1 && i % 5 === 3))
        P.add(sold, plate(3 * T, ROW / 1.4, x + 0.04, ty + ROW * 0.6, z + 0.014), false);
    }
  // 地上的一箱旧拍子（架子前东边）：纸箱 + 三支竖插的拍（拍头朝上露出来）
  const kraft = ctx.mat('kraft', { ...PROP, elem: TOWN_EL.kraft });
  const bx = 1.6;
  const bz = 0.95;
  P.add(kraft, box(0.7, 0.42, 0.5, bx, 0, bz));
  P.add(
    ctx.mat('kraft', { ...PROP, ramp: [0xa8784e, 0x80584a, 0x4a3450] }),
    box(0.62, 0.02, 0.42, bx, 0.38, bz),
    false,
  );
  for (const [dx, k] of [
    [-0.18, 'wood'],
    [0.02, 'clothRed'],
    [0.2, 'metal'],
  ] as const) {
    const r = racketGeos(0.12, 0.15);
    const lift = 0.42 + 0.2 + 0.15;
    for (const g of r.frame) P.add(clothMat(ctx, k, PROP), g.translate(bx + dx, lift, bz + 0.02 * dx), false);
    for (const g of r.bed) P.add(ctx.mat('line', PROP), g.translate(bx + dx, lift, bz + 0.02 * dx), false);
  }
  return P.build('in-sports-consign-rack');
};

// ── in-stringer：立式穿线机（1.3 × 1.25 × 1.0，原点 = 立柱脚下）+ 师傅的圆凳。S3 自己穿线 ──
// 十字脚 + 立柱（青绿）+ 转台（深色圆盘，两条夹拍臂）+ 平夹着的一支拍（拍头椭圆环，竖线穿了一半：4 道荧光线）；
// 东边拉线头（红色方块）上一个米黄表盘（一根红针，夜里表盘亮）；立柱上一个托盘放线卷。
const inStringer: AssetFn = (ctx) => {
  const P = new Parts(ctx);
  const base = ctx.mat('ironwork', PROP);
  const col = ctx.mat('metal', PROP);
  const table = ctx.mat('ironwork', { ...PROP, convex: 0.4 });
  const head = ctx.mat('clothRed', PROP);
  const dial = ctx.mat('signPaint', { ...PROP, lightUp: 0.4 });
  const dialN = ctx.mat('signPaint', { ...PROP, lightUp: 0.4, emissive: 0x4a3a1a });
  const needle = ctx.mat('clothRed', { ...PROP, edge: 0 });
  const frame = ctx.mat('clothBlue', PROP);
  const bed = ctx.mat('line', { ...PROP, edge: 0.2, convex: 0 });
  const str = neon(ctx, { ...PROP, edge: 0, convex: 0 });
  const gripM = ctx.mat('ironwork', PROP);
  const seat = ctx.mat('timber', {
    ...PROP,
    elem: { kind: 'planks', space: 'local', seam: 1, hi: 0.5, p: [1, 0, 0, 0.12] },
  });
  // 脚、立柱
  P.add(base, box(0.9, 0.08, 0.2, 0, 0, 0));
  P.add(base, box(0.2, 0.08, 0.8, 0, 0, 0));
  P.add(col, box(0.16, 0.86, 0.16, 0, 0.08, 0));
  // 转台 + 夹拍臂
  const ty = 0.94;
  P.add(table, new THREE.CylinderGeometry(0.42, 0.42, 0.06, 14).translate(0, ty + 0.03, 0));
  P.add(col, box(0.92, 0.07, 0.12, 0, ty + 0.06, 0));
  for (const x of [-0.42, 0.42]) P.add(base, box(0.1, 0.12, 0.16, x, ty + 0.13, 0));
  // 平夹着的拍（拍头沿 x 长）：框、拍面、四道竖线（沿 x 方向的竖线 → 屏幕上是横的；穿了一半）
  const hy = ty + 0.2;
  const flat = (g: THREE.BufferGeometry) => g.rotateZ(Math.PI / 2).rotateX(-Math.PI / 2);
  P.add(frame, flat(ellipseRing(0.17, 0.32, T + 0.02, 10)).translate(0, hy + 0.012, 0));
  P.add(bed, flat(ellipse(0.17 - T - 0.02, 0.32 - T - 0.02, 10)).translate(0, hy, 0), false);
  for (const zz of [-0.09, -0.03, 0.03, 0.09]) P.add(str, box(0.4, 0.012, 0.03, -0.02, hy + 0.004, zz), false);
  P.add(frame, box(0.18, 0.05, 0.09, 0.45, hy - 0.02, 0));
  P.add(gripM, box(0.24, 0.06, 0.11, 0.66, hy - 0.025, 0));
  // 拉线头（东北，挂在一根伸出的横梁上）+ 表盘
  P.add(col, box(0.5, 0.06, 0.1, 0.5, ty + 0.02, -0.3), false);
  P.add(head, box(0.3, 0.26, 0.26, 0.82, ty - 0.08, -0.3));
  P.add(dial, new THREE.CircleGeometry(0.1, 10).rotateX(-0.7).translate(0.82, ty + 0.2, -0.16), false);
  P.add(needle, box(0.02, 0.012, 0.08, 0.84, ty + 0.21, -0.17).rotateY(0), false);
  // 立柱上的线卷托盘
  P.add(col, box(0.24, 0.04, 0.24, -0.2, 0.5, 0.2), false);
  P.add(str, cyl(0.1, 0.12, 8, -0.2, 0.54, 0.2), false);
  // 圆凳（师傅坐南边，面朝机器）
  const sx = 0.05;
  const sz = 0.82;
  P.add(base, new THREE.CylinderGeometry(0.2, 0.22, 0.04, 8).translate(sx, 0.02, sz));
  P.add(base, box(T, 0.52, T, sx, 0.04, sz));
  P.add(seat, new THREE.CylinderGeometry(0.22, 0.2, 0.08, 10).translate(sx, 0.6, sz));
  const g = P.build('in-sports-stringer');
  inNight(g, new Map([[dial, dialN]]), [{ x: 0, z: 0.4, r: 2.6, h: 4.6 }]);
  return g;
};

// ── in-string-bench：穿线角的墙边工作台（3.6 × 2.6 × 0.8，原点 = 脚下中心，背贴北墙 z −0.4）──
// 冷白台面 + 冷白柜身（正面两扇柜门）；墙上一块深海军蓝的洞洞板挂 2 排线卷（圆盘朝南：荧光、红、蓝、白、黄、紫）；
// 台面上：一支躺着的拍（挂着取件牌）、一卷线、剪钳的小托盘、一盏台灯（夜里亮）。v1 墙上换成"待取"的拍子架（竖插 6 支，每支一张牌）。
const inStringBench: AssetFn = (ctx) => {
  const P = new Parts(ctx);
  const v = ctx.variant % 2;
  const rnd = ctx.rng(`in-sports-string-bench:${v}`);
  const W = 3.6;
  const BZ = -0.4;
  const topM = inMat(ctx, IN_WHITE, PROP);
  const body = inMat(ctx, IN_WHITE, PROP);
  const doors = inMat(ctx, IN_WHITE, {
    ...FACE,
    elem: { kind: 'planks', space: 'local', seam: 1, hi: 0, p: [1, 0, 0, 0.9] },
  });
  const panel = inMat(ctx, IN_NAVY, FACE);
  const peg = ctx.mat('ironwork', FACE);
  const dark = ctx.mat('ironwork', PROP);
  const tag = ctx.mat('signPaint', FACE);
  const [lamp, lampN] = lampPair(ctx, { lightUp: 0.3 });
  const REEL: PalKey[] = ['ball', 'clothRed', 'clothBlue', 'clothWhite', 'flowerYellow', 'clothPurple', 'clothTeal'];
  // 柜 + 台面
  P.add(body, box(W, 0.86, 0.72, 0, 0, BZ + 0.36));
  P.add(doors, plate(W - 0.06, 0.74, 0, 0.06, BZ + 0.725), false);
  P.add(topM, box(W + 0.06, 0.07, 0.78, 0, 0.86, BZ + 0.38));
  // 墙板
  P.add(panel, box(W - 0.1, 1.5, 0.04, 0, 1.15, BZ + 0.02), false);
  if (v === 0) {
    // 两排线卷（圆盘朝南，中间一个深色轴心）
    for (let r = 0; r < 2; r++)
      for (let i = 0; i < 7; i++) {
        const x = -1.45 + i * 0.48 + (r ? 0.24 : 0);
        if (x > 1.55) continue;
        const y = 2.25 - r * 0.62;
        const k = REEL[(i + r * 3) % REEL.length];
        const reel = new THREE.CylinderGeometry(0.17, 0.17, 0.1, 10).rotateX(Math.PI / 2).translate(x, y, BZ + 0.1);
        P.add(clothMat(ctx, k, FACE), reel, false);
        P.add(peg, ellipse(0.05, 0.05, 6).translate(x, y, BZ + 0.152), false);
      }
  } else {
    // 待取的拍子：一条横杆上挂 6 支，每支一张牌
    P.add(peg, plate(W - 0.4, ROW, 0, 2.4, BZ + 0.05), false);
    for (let i = 0; i < 6; i++) {
      const x = -1.35 + i * 0.54;
      const k = REEL[Math.floor(rnd() * REEL.length)];
      const r = racketGeos();
      for (const g of r.frame) P.add(clothMat(ctx, k, FACE), g.translate(x, 2.15, BZ + 0.08), false);
      for (const g of r.bed) P.add(ctx.mat('line', FACE), g.translate(x, 2.15, BZ + 0.08), false);
      for (const g of r.grip) P.add(peg, g.translate(x, 2.15, BZ + 0.08), false);
      P.add(tag, plate(3 * T, 2 * ROW, x + 0.12, 1.42, BZ + 0.09), false);
    }
  }
  // 台面上的东西
  const ty = 0.93;
  const flatR = racketGeos();
  const lay = (g: THREE.BufferGeometry) =>
    g
      .rotateX(-Math.PI / 2)
      .rotateY(Math.PI / 2 - 0.2)
      .translate(-0.9, ty + 0.01, BZ + 0.38);
  for (const g of flatR.frame) P.add(clothMat(ctx, v ? 'clothRed' : 'ball', PROP), lay(g), false);
  for (const g of flatR.bed) P.add(ctx.mat('line', PROP), lay(g), false);
  for (const g of flatR.grip) P.add(dark, lay(g), false);
  P.add(tag, box(0.12, 0.01, 0.16, -0.55, ty, BZ + 0.6), false);
  P.add(neon(ctx, PROP), new THREE.CylinderGeometry(0.15, 0.15, 0.09, 10).translate(0.1, ty + 0.045, BZ + 0.36), false);
  P.add(dark, box(0.4, 0.04, 0.24, 0.7, ty, BZ + 0.38), false);
  // 台灯：底座、一根斜杆、灯罩（朝下的口夜里亮）
  P.add(dark, cyl(0.09, 0.03, 6, 1.4, ty, BZ + 0.2), false);
  P.add(dark, box(0.05, 0.5, 0.05, 1.4, ty + 0.03, BZ + 0.2), false);
  P.add(dark, box(0.26, 0.12, 0.18, 1.3, ty + 0.48, BZ + 0.3), false);
  P.add(lamp, box(0.22, 0.02, 0.14, 1.3, ty + 0.47, BZ + 0.3), false);
  const g = P.build('in-sports-string-bench');
  inNight(g, new Map([[lamp, lampN]]), [{ x: 0.6, z: 1.0, r: 2.6, h: 4.6 }]);
  return g;
};

// ── in-string-desk：穿线服务台（5.2 × 1.05 × 0.7，原点 = 脚下中心）。S3 交给穿线师 ──
// 红色柜身（正面朝南 FACE，白字"STRINGING"）+ 冷白台面；台面上：服务铃、一叠取件牌、一块张力表小牌（荧光的 52～56 一格）、
// 一支等着穿线的拍（躺着）、一个装旧线头的小桶。
const inStringDesk: AssetFn = (ctx) => {
  const P = new Parts(ctx);
  const W = 5.2;
  const D = 0.7;
  const H = 1.05;
  const body = ctx.mat('clothRed', PROP);
  const front = ctx.mat('clothRed', FACE);
  const ink = ctx.mat('signPaint', FACE);
  const topM = inMat(ctx, IN_WHITE, PROP);
  const bell = ctx.mat('flowerYellow', { ...PROP, sphereNormals: [-1.8, H, 0.05], convex: 0.8 });
  const dark = ctx.mat('ironwork', PROP);
  const tag = ctx.mat('signPaint', PROP);
  const chart = inMat(ctx, IN_WHITE, FACE);
  const chartHi = neon(ctx, FACE);
  P.add(body, box(W, H - 0.07, D, 0, 0, 0));
  P.add(front, plate(W - 0.02, H - 0.1, 0, 0.03, D / 2 + 0.003), false);
  P.add(topM, box(W + 0.08, 0.07, D + 0.1, 0, H - 0.07, 0));
  for (const g of text3('STRINGING', 0, 0.36, D / 2 + 0.006)) P.add(ink, g, false);
  // 服务铃
  P.add(dark, cyl(0.1, 0.02, 8, -1.8, H, 0.05), false);
  P.add(
    bell,
    new THREE.SphereGeometry(0.09, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).translate(-1.8, H + 0.02, 0.05),
    false,
  );
  // 取件牌一叠、张力表
  P.add(tag, box(0.16, 0.05, 0.22, -1.3, H, 0.1), false);
  P.add(chart, box(0.5, 0.36, 0.03, 0.2, H, -0.18).rotateX(-0.2).translate(0, 0, 0), false);
  P.add(chartHi, plate(0.4, ROW, 0.2, H + 0.16, -0.155), false);
  // 一支等着穿线的拍
  const r = racketGeos();
  const lay = (g: THREE.BufferGeometry) =>
    g
      .rotateX(-Math.PI / 2)
      .rotateY(-Math.PI / 2 + 0.3)
      .translate(1.3, H + 0.01, 0.02);
  for (const g of r.frame) P.add(ctx.mat('clothBlue', PROP), lay(g), false);
  for (const g of r.bed) P.add(ctx.mat('line', PROP), lay(g), false);
  for (const g of r.grip) P.add(dark, lay(g), false);
  // 旧线头小桶
  P.add(dark, new THREE.CylinderGeometry(0.15, 0.13, 0.3, 8).translate(2.2, H + 0.15, -0.05));
  P.add(neon(ctx, PROP), cyl(0.12, 0.02, 8, 2.2, H + 0.29, -0.05), false);
  return P.build('in-sports-string-desk');
};

// ── in-wall-lamp：墙顶的射灯（0.5 × 0.5 × 0.7，原点 = 墙顶面中心；灯头往墙前 0.6 米、往下照）──
// 一根深色弯臂 + 一个圆筒灯头；灯口（朝下）白天米黄、夜里暖黄自发光；画廊里带一个灯光圈。
const inWallLamp: AssetFn = (ctx) => {
  const P = new Parts(ctx);
  const dark = ctx.mat('ironwork', PROP);
  const [lamp, lampN] = lampPair(ctx, { lightUp: 0.2 });
  P.add(dark, box(0.16, 0.08, 0.16, 0, 0, 0));
  P.add(dark, box(0.07, 0.07, 0.6, 0, 0.08, 0.3));
  const hd = new THREE.CylinderGeometry(0.11, 0.14, 0.26, 8).rotateX(0.5).translate(0, 0.02, 0.62);
  P.add(dark, hd);
  P.add(lamp, new THREE.CircleGeometry(0.11, 8).rotateX(Math.PI / 2 + 0.5).translate(0, -0.1, 0.68), false);
  const g = P.build('in-sports-wall-lamp');
  inNight(g, new Map([[lamp, lampN]]), [{ x: 0, z: 3, r: 3.5, h: 4.6 }]);
  return g;
};

// ── in-feature-table：新品展台（1.8 × 0.75 × 1.2，原点 = 脚下中心）──
// 白色台面 + 俱乐部蓝的台身；台面上三支新拍扇形躺着、一小摞球罐（3 罐）、一块立着的"NEW"小卡。门口进来的右前方，空地里一个落脚点。
const inFeatureTable: AssetFn = (ctx) => {
  const P = new Parts(ctx);
  const body = ctx.mat('counter', PROP);
  const front = ctx.mat('counter', FACE);
  const top = inMat(ctx, IN_WHITE, PROP);
  const bed = inMat(ctx, IN_WHITE, PROP);
  const dark = ctx.mat('ironwork', PROP);
  const card = ctx.mat('signPaint', FACE);
  const ink = ctx.mat('clothRed', FACE);
  const can = neon(ctx, { ...PROP, lightUp: 0.3, edge: 0.15, convex: 0 });
  const lid = ctx.mat('clothRed', { ...PROP, edge: 0.15 });
  const H = 0.72;
  P.add(body, box(1.7, H - 0.05, 1.1, 0, 0, 0));
  P.add(front, plate(1.68, H - 0.09, 0, 0.02, 0.553), false);
  P.add(top, box(1.8, 0.05, 1.2, 0, H - 0.05, 0));
  // 三支拍扇形躺着（拍柄聚在东南）
  const K: PalKey[] = ['ball', 'clothRed', 'clothBlue'];
  for (let i = 0; i < 3; i++) {
    const r = racketGeos();
    const a = -0.5 + i * 0.5;
    const lay = (g: THREE.BufferGeometry) =>
      g
        .rotateX(-Math.PI / 2)
        .rotateY(Math.PI / 2 + a)
        .translate(-0.1, H + 0.012 + i * 0.004, 0.05);
    for (const g of r.frame) P.add(clothMat(ctx, K[i], PROP), lay(g), false);
    for (const g of r.bed) P.add(bed, lay(g), false);
    for (const g of r.grip) P.add(dark, lay(g), false);
  }
  // 一小摞球罐（2 + 1）
  for (const [x, y, z] of [
    [0.55, 0, -0.3],
    [0.75, 0, -0.3],
    [0.65, 0.3, -0.3],
  ] as const) {
    P.add(can, cyl(0.09, 0.27, 6, x, H + y, z));
    P.add(lid, cyl(0.096, 0.03, 6, x, H + y + 0.27, z), false);
  }
  // NEW 小卡（立着，朝南）
  P.add(card, box(0.5, 0.36, 0.03, -0.55, H, -0.4), false);
  for (const g of text3('NEW', -0.55, H + 0.04, -0.383)) P.add(ink, g, false);
  return P.build('in-sports-feature-table');
};

export const ASSETS: Record<string, AssetFn> = {
  'sports-front': sportsFront,
  'sports-ball-sign': sportsBallSign,
  'stringing-station': stringingStation,
  'ballcan-bin': ballcanBin,
  // 店内（interiors/sports.ts）
  'in-sports-racket-wall': inRacketWall,
  'in-sports-sign': inSign,
  'in-sports-ball-wall': inBallWall,
  'in-sports-shoe-wall': inShoeWall,
  'in-sports-gondola': inGondola,
  'in-sports-clothes-rack': inClothesRack,
  'in-sports-shoe-bench': inShoeBench,
  'in-sports-pyramid': inPyramid,
  'in-sports-checkout': inCheckout,
  'in-sports-cart': inCart,
  'in-sports-consign-rack': inConsignRack,
  'in-sports-stringer': inStringer,
  'in-sports-string-bench': inStringBench,
  'in-sports-string-desk': inStringDesk,
  'in-sports-wall-lamp': inWallLamp,
  'in-sports-feature-table': inFeatureTable,
};

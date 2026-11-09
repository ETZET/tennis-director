// 地图边的山（棕榈泉 / 科切拉谷：圣哈辛托、圣罗莎那样光秃、一层层的岩山）—— clubmap2、clubpark、clubdesk 共用，世界坐标同
// clubmap2/layout.ts（米，y 朝上，北 = −z，东 = +x）。
//
// 便宜、画面简单：三道低多边形山梁，一道一个网格、一个材质，每道沿地图边（DESERT）绕一圈；再加一圈只写深度的"天幕"。
// 截面只有 5 个点（内山脚、内肩、山脊、外肩、外山脚），沿边每 8～14 米取一个截面，每个点按种子抖一点 → 一个个平直的岩面，
// 色阶材质的三档（亮 / 中 / 暗）就是岩面的明暗。不贴元素纹理、不加凸边高光、远两道不描边、不投影也不受投影。
//
// 正交 45° 俯视看山（v = 屏幕竖直坐标）：
// - 远边（山在地图后面）：v ∝ 高 + 离边距离 —— 越远、越高越往屏幕上走。三道山梁一道比一道远、一道比一道高，
//   外坡陡于 45°（自己挡住自己）→ 一层压一层的剪影。
// - 地面没有地平线：远边山脊后面的沙地只要露出来就一直往屏幕上走。所以最外一道山脊后面立一圈"天幕"（curtainGeo）：
//   竖直、朝里、只写深度不写颜色、最先画 → 远边山脊后面的地面都被它挡掉，露出的是背景的天；近边的天幕背对镜头被剔掉，
//   近处的地面照样一直铺到画外（ground.ts 铺得很大）。转到哪个方向都成立（凸的一圈：视线从近边进、远边出）。
// - 近边（转过来以后山在镜头和地图之间）：山脚离 DESERT 至少 1 米 → 山高 < 山脊离边的距离，近处的山只在画面下沿外面，
//   转到哪个方向都不挡地图。
// - 默认视角（clubmap2 横屏，yaw 38°，远边 = 西北）：山顶压在天际线以下（framing.ts 的 skylineV），每道山梁再往下错开
//   一点 → 俱乐部背后一层层山梁，最上面一条天。西北角正对镜头、离画面顶最近，那里的山矮一点（一个鞍部），
//   往西、往北两边越走越高（屏幕上都顶到天际线附近）。
//
// 地理（大致照实，第二轮）：西、北高（圣哈辛托在西北），南边矮一点（圣罗莎），东南是科切拉谷敞开的口子；
// 东边正对车道是一个山口 —— 第二道山梁在那里断开成两座山，最外一道压成一个低鞍部，车道翻过去出地图（passRoadGeo）。
import * as THREE from 'three';
import { DESERT, ROAD_OUT } from '../clubmap2/layout';
import { axes, PITCH, skylineV, VIEW_YAW } from './framing';

export type V2 = [number, number];
type Ramp = [number, number, number];

/** 材质工厂：传 ctx.mats.toon（已经吃了当前配色方案的 grade）。只用到色阶材质的这几个参数 */
export type MtnToon = (
  color: number,
  opts: { ramp: Ramp; edge: number; convex: number; lightUp?: number; bands?: [number, number] },
) => THREE.Material;

/** 八个方向（按外法线）：东、东南、南、西南、西、西北、北、东北 */
const COMPASS = ['e', 'se', 's', 'sw', 'w', 'nw', 'n', 'ne'] as const;
export type Compass = Record<(typeof COMPASS)[number], number>;

/** 一道山梁 */
export interface Ridge {
  id: string;
  /** 山脊离 DESERT 边的距离（米），再加 dDir 按方向的偏移 */
  d: number;
  dDir?: Partial<Compass>;
  /** 八个方向的山高（米）；中间按外法线的方位平滑过渡。实际山高再被默认视角的天际线、近边规则压 */
  h: Compass;
  /** 最矮多少米（天际线压完以后）：最外一道不能压没了，不然沙地直接顶着天 */
  hMin?: number;
  /** 沿边多少米取一个截面（越远越粗） */
  ds: number;
  /** 起伏的长度（米）：每这么长一个山头 */
  lambda: number;
  /** 内坡、外坡的水平/竖直比（1/tan 坡度）：0.6 ≈ 59°，0.84 ≈ 50° */
  kIn: number;
  kOut: number;
  /** 山脊离沿边路径往里往外走多少（米）：山梁不和地图边平行 */
  wander: number;
  /** 山嘴/山沟的强度 0..1 */
  spur: number;
  /** 山顶高度逐个截面抖多少（0..1，乘山高）：天际线是锯齿的一个个小山尖，不是一条顺滑的线 */
  jag?: number;
  /** 给了就是一个个分开的小山包：起伏噪声低于这个值的地方没有山（0..1，越大越稀） */
  knobs?: number;
  /**
   * 默认视角的天际线：山顶的屏幕高度 ≤ skylineV − drop − band·(1 − 起伏)。drop 让近的山梁比远的低一截（一层层），
   * band 让山头和垭口在屏幕上也有起伏（不是一条直的顶）。单位是屏幕米。
   */
  sky?: { drop: number; band: number };
  /**
   * 车道翻过去的垭口（只在东边，正对 ROAD_OUT）：|z − ROAD_OUT.z| < half 的截面压成高 h、坡 k 的缓鞍部（车道贴着它的面），
   * 往外 flank 米过渡回原来的山梁，过渡带上的山抬高 boost 倍 → 垭口两边各一座山。kOut：外坡另给（最外一道外坡短一点，
   * 天幕立在外山脚，远边看过去鞍顶后面露出的那条地面就窄）。
   */
  pass?: { h: number; k: number; kOut?: number; flank: number; boost: number };
  /** 手挑三档 [亮, 中, 暗]（配色方案的 grade 之前的原值）：暖玫瑰褐岩 → 远的一道更浅、更灰（空气） */
  ramp: Ramp;
  /** 描边强度（深度轮廓）：近的一道 0.25（剪影一圈暗线 + 上沿提亮），远的两道 0.1 / 0 */
  edge: number;
  /** 光往正上方偏（远的山更"平"，明暗差小 = 雾气） */
  lightUp: number;
  /** 档位阈值 [暗|中, 中|亮]（默认 [0.1, 0.5]）：亮档的门槛抬高 → 正对太阳的大坡面也按朝向分出亮、中两档，不是一整片 */
  bands?: [number, number];
}

export const RIDGES: Ridge[] = [
  {
    // 山前的小山包（一个个分开，中间露出后面的主山梁）；东边、东南没有（谷地敞开，车道从东边出去）
    id: 'near',
    d: 6,
    dDir: { w: 3, n: 3, sw: 3, s: 3, ne: 3 },
    h: { e: 0, se: 0, s: 6, sw: 8, w: 15, nw: 12, n: 15, ne: 0 },
    ds: 8,
    lambda: 36,
    kIn: 0.5,
    kOut: 0.62,
    wander: 3,
    spur: 0.8,
    knobs: 0.42,
    sky: { drop: 20, band: 6 },
    ramp: [0xcc8a74, 0x9c6468, 0x5c4280],
    edge: 0.3,
    lightUp: 0.1,
    bands: [0.15, 0.8],
  },
  {
    // 主山梁：一段一段的山（中间偶尔断开，露出后面最外一道的山脚），山嘴一条条下来；东边正对车道断开成山口（两边两座山）
    id: 'mid',
    d: 11,
    dDir: { w: 10, n: 10, sw: 9, s: 9, ne: 13, e: 25, se: 21 },
    h: { e: 18, se: 10, s: 12, sw: 18, w: 38, nw: 36, n: 38, ne: 18 },
    ds: 9,
    lambda: 56,
    kIn: 0.55,
    kOut: 0.62,
    wander: 6,
    spur: 1,
    jag: 0.12,
    knobs: 0.28,
    sky: { drop: 10, band: 10 },
    pass: { h: 1.2, k: 7, flank: 16, boost: 0.9 },
    ramp: [0xd89c8c, 0xae7880, 0x6c5488],
    edge: 0.3,
    lightUp: 0.15,
    bands: [0.18, 0.86],
  },
  {
    // 最外一道高山（棕榈泉背后的山顶线）：更粗、更浅一点；东边正对车道是一个低鞍部，车道翻过它出画
    id: 'far',
    d: 18,
    dDir: { w: 18, n: 18, sw: 18, s: 20, ne: 26, e: 48, se: 42 },
    h: { e: 22, se: 14, s: 20, sw: 30, w: 58, nw: 60, n: 58, ne: 26 },
    hMin: 8,
    ds: 10,
    lambda: 84,
    kIn: 0.55,
    kOut: 0.62,
    wander: 4,
    spur: 0.8,
    jag: 0.16,
    sky: { drop: 0, band: 18 },
    pass: { h: 5, k: 4.5, kOut: 2.4, flank: 22, boost: 0.5 },
    ramp: [0xe6bcb2, 0xc8a0a8, 0x9688b0],
    edge: 0.22,
    lightUp: 0.2,
    bands: [0.2, 0.88],
  },
];

/** 地图边那圈的圆角半径（米，离 DESERT 0 米时）：越大，西北角正对默认镜头的那一点越往里收（离画面顶越远） */
export const LOOP_ROUND = 34;

/** DESERT 的中心、半宽 */
const CX = (DESERT.x0 + DESERT.x1) / 2;
const CZ = (DESERT.z0 + DESERT.z1) / 2;
const HX = (DESERT.x1 - DESERT.x0) / 2;
const HZ = (DESERT.z1 - DESERT.z0) / 2;

/**
 * 绕 DESERT 一圈、往外偏 d 米的圆角矩形（逆时针看 = 从上往下看顺着 x→z），按弧长均匀取 n 个点，带朝外的单位法线。
 * 圆角半径 d + round：比纯偏移的角更圆一点，山梁转角不起尖。
 */
export interface LoopPt {
  p: V2;
  n: V2;
  /** 弧长（米） */
  s: number;
}
export function edgeLoop(d: number, step: number, round = LOOP_ROUND): { pts: LoopPt[]; L: number } {
  const r = d + round;
  const ax = HX + d - r;
  const az = HZ + d - r;
  // 先密密地走一圈（直边 + 四分之一圆弧，弧 24 段），再按弧长重采样
  const dense: V2[] = [];
  const corners: [number, number, number][] = [
    [CX + ax, CZ + az, 0],
    [CX - ax, CZ + az, Math.PI / 2],
    [CX - ax, CZ - az, Math.PI],
    [CX + ax, CZ - az, (Math.PI * 3) / 2],
  ];
  for (const [cx, cz, a0] of corners)
    for (let i = 0; i <= 24; i++) {
      const a = a0 + (i / 24) * (Math.PI / 2);
      dense.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
    }
  const acc = [0];
  for (let i = 1; i <= dense.length; i++) {
    const [x0, z0] = dense[i - 1];
    const [x1, z1] = dense[i % dense.length];
    acc.push(acc[i - 1] + Math.hypot(x1 - x0, z1 - z0));
  }
  const L = acc[dense.length];
  const n = Math.max(8, Math.round(L / step));
  const out: LoopPt[] = [];
  let k = 0;
  for (let i = 0; i < n; i++) {
    const s = (i / n) * L;
    while (acc[k + 1] < s) k++;
    const t = (s - acc[k]) / (acc[k + 1] - acc[k] || 1);
    const [x0, z0] = dense[k];
    const [x1, z1] = dense[(k + 1) % dense.length];
    const x = x0 + (x1 - x0) * t;
    const z = z0 + (z1 - z0) * t;
    // 法线：切线转 90°，朝外（离中心）
    let nx = z1 - z0;
    let nz = -(x1 - x0);
    const l = Math.hypot(nx, nz) || 1;
    nx /= l;
    nz /= l;
    if (nx * (x - CX) + nz * (z - CZ) < 0) {
      nx = -nx;
      nz = -nz;
    }
    out.push({ p: [x, z], n: [nx, nz], s });
  }
  return { pts: out, L };
}

/** 整数格上的哈希 → [0, 1) */
function hash(i: number, seed: number): number {
  let h = Math.imul(i ^ Math.imul(seed, 0x9e3779b1), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
/** 周期为 period 的一维值噪声（绕一圈接得上），平滑插值 */
function loopNoise(u: number, period: number, seed: number): number {
  const i = Math.floor(u);
  const f = u - i;
  const a = hash(((i % period) + period) % period, seed);
  const b = hash((((i + 1) % period) + period) % period, seed);
  const t = f * f * (3 - 2 * f);
  return a + (b - a) * t;
}
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** 按外法线的方位在八个方向之间平滑插值 */
function compass(c: Partial<Compass>, n: V2): number {
  let a = Math.atan2(n[1], n[0]);
  if (a < 0) a += Math.PI * 2;
  const f = a / (Math.PI / 4);
  const i = Math.floor(f) % 8;
  const t = smooth(0, 1, f - Math.floor(f));
  const A = c[COMPASS[i]] ?? 0;
  const B = c[COMPASS[(i + 1) % 8]] ?? 0;
  return A + (B - A) * t;
}

/** 一个截面：山高、山脊离沿边路径的偏移（往外 +）、山嘴/山沟、两边的坡、抖动的强度（垭口里 0） */
interface Section {
  h: number;
  o: number;
  spur: number;
  kIn: number;
  kOut: number;
  jit: number;
}

/** 垭口：东边正对车道的截面 → k 0（正常山梁）…1（鞍部）；以及过渡带上两座山的抬高倍数 */
function passAt(r: Ridge, p: V2, n: V2): { k: number; boost: number } {
  if (!r.pass || n[0] < 0.9) return { k: 0, boost: 1 };
  const u = (Math.abs(p[1] - ROAD_OUT.z) - ROAD_OUT.half) / r.pass.flank;
  return { k: 1 - smooth(0, 1, u), boost: 1 + r.pass.boost * Math.exp(-(((u - 1.1) / 0.8) ** 2)) };
}

/** 一道山梁在每个截面的山高、山脊的进出、山嘴 */
function sections(r: Ridge, loop: LoopPt[], L: number, seed: number): Section[] {
  const per = (len: number) => Math.max(3, Math.round(L / len));
  const p1 = per(r.lambda);
  const p2 = per(r.lambda / 2.1);
  const pk = per(r.lambda * 1.5);
  const pw = per(r.lambda * 1.7);
  const ps = per(r.ds * 2.3);
  const sky = skylineV(VIEW_YAW);
  const { c } = axes(VIEW_YAW);
  const cos = Math.cos(PITCH);
  const sin = Math.sin(PITCH);
  return loop.map(({ p, n, s }) => {
    const t = s / L;
    // 起伏：大山头 + 小起伏（0.55～1.2）
    let f = 0.55 + 0.45 * loopNoise(t * p1, p1, seed) + 0.2 * loopNoise(t * p2, p2, seed + 7);
    const rise = Math.min(1, Math.max(0, (f - 0.55) / 0.65));
    const { k, boost } = passAt(r, p, n);
    // knobs：一个个分开的小山包，门槛以下没有山（露出后面那道），以上至少 0.6（两头是陡的山鼻子，不是薄薄一片）
    if (r.knobs !== undefined && !(r.pass && n[0] > 0.9)) {
      const g = smooth(r.knobs, r.knobs + 0.2, loopNoise(t * pk, pk, seed + 13));
      f *= g < 0.35 ? 0 : 0.6 + 0.4 * g;
    }
    // 山脊进出（不和地图边平行）+ 按方向的偏移
    const o = (loopNoise(t * pw, pw, seed + 3) - 0.5) * 2 * r.wander * (1 - k) + compass(r.dDir ?? {}, n);
    const kIn = r.kIn + ((r.pass?.k ?? r.kIn) - r.kIn) * k;
    const kOut = r.kOut + ((r.pass?.kOut ?? r.pass?.k ?? r.kOut) - r.kOut) * k;
    let h = compass(r.h, n) * f * boost;
    // 默认视角的天际线：山顶屏幕高度 v = h·cosφ − (p·c)·sinφ ≤ vLim
    if (r.sky) {
      const vLim = sky - r.sky.drop - r.sky.band * (1 - rise);
      const pc = (p[0] + n[0] * o) * c[0] + (p[1] + n[1] * o) * c[1];
      h = Math.min(h, Math.max(r.hMin ?? 0, (vLim + pc * sin) / cos));
    }
    // 垭口：压成鞍部
    if (r.pass) h += (r.pass.h - h) * k;
    // 近边规则：山脚离 DESERT 至少 1 米（内坡最多伸到 kIn·h·1.22）→ 山高 < 山脊离边的距离，转到近边也不挡地图
    h = Math.max(0, Math.min(h, (r.d + o - 1) / (kIn * 1.22)));
    const spur = (loopNoise(t * ps, ps, seed + 11) * 2 - 1) * (1 - k);
    return { h, o, spur, kIn, kOut, jit: 1 - k };
  });
}

const FOOT = -0.4; // 山脚埋进地面一点，和沙地交成一条干净的线（不打架）

interface Rows {
  rows: THREE.Vector3[][];
  sec: Section[];
  loop: LoopPt[];
}

/** 一道山梁的截面行（每行 5 点：内山脚、内肩、山脊、外肩、外山脚）+ 截面参数 */
function ridgeRows(r: Ridge, seed: number): Rows {
  const { pts: loop, L } = edgeLoop(r.d, r.ds);
  const sec = sections(r, loop, L, seed);
  const rows = loop.map(({ p, n }, i) => {
    const { h: h0, o, spur, kIn, kOut, jit } = sec[i];
    const j = (k: number) => (hash(i * 8 + k, seed * 31 + 5) - 0.5) * jit;
    // 太矮的截面整个埋到山脚高度（小山包之间），不和地面叠在一个平面上；宽度按原高。山顶按 jag 抖（只往下，不顶破天际线）
    const h = h0 < 0.4 ? FOOT : h0 * (1 - (r.jag ?? 0) * (0.5 + j(7)));
    const w = h0;
    const pt = (off: number, y: number) => new THREE.Vector3(p[0] + n[0] * off, y, p[1] + n[1] * off);
    const sp = spur * r.spur;
    const crest = o + j(0) * 0.2 * w * kIn;
    // 山嘴：肩往外伸、抬高；山沟：肩缩回、压低 → 一条条从山脊下来的岩嘴，三档明暗自己出来
    return [
      pt(crest - kIn * w * (1.0 + 0.12 * sp + 0.2 * j(1)), FOOT),
      pt(crest - kIn * w * (0.4 + 0.3 * sp + 0.12 * j(2)), Math.max(FOOT, h * (0.5 + 0.22 * sp + 0.1 * j(3)))),
      pt(crest, h),
      pt(crest + kOut * w * (0.38 + 0.18 * sp + 0.12 * j(4)), Math.max(FOOT, h * (0.52 + 0.14 * sp + 0.1 * j(5)))),
      pt(crest + kOut * w * (0.96 + 0.1 * sp + 0.12 * j(6)), FOOT),
    ];
  });
  return { rows, sec, loop };
}

/** 一道山梁的几何体（非索引、平直法线）。截面 5 点：内山脚、内肩、山脊、外肩、外山脚 */
export function ridgeGeo(r: Ridge, seed = 1): THREE.BufferGeometry {
  return rowsGeo(ridgeRows(r, seed));
}

function rowsGeo({ rows, sec }: Rows): THREE.BufferGeometry {
  const pos: number[] = [];
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => {
    // 让面朝上（朝外）：法线 y < 0 就倒过来
    const ny = (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z);
    if (ny >= 0) pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    else pos.push(a.x, a.y, a.z, c.x, c.y, c.z, b.x, b.y, b.z);
  };
  for (let i = 0; i < rows.length; i++) {
    const k = (i + 1) % rows.length;
    if (sec[i].h < 0.4 && sec[k].h < 0.4) continue; // 山口、小山包之间
    const A = rows[i];
    const B = rows[k];
    for (let q = 0; q < 4; q++) {
      // 对角线交替（一行一行错开），面更碎一点
      if ((i + q) % 2 === 0) {
        tri(A[q], B[q], B[q + 1]);
        tri(A[q], B[q + 1], A[q + 1]);
      } else {
        tri(A[q], B[q], A[q + 1]);
        tri(B[q], B[q + 1], A[q + 1]);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/**
 * 天幕有多高（米）：要盖住远边山脊后面一直到地面尽头的沙地（ground.ts 的 GROUND_REACH 300 米，圆角的对角线上 ~420 米）。
 * 太高的部分在画面外，被近裁剪面切掉也没关系。
 */
export const CURTAIN_TOP = 480;

/**
 * 天幕的那一圈点：最外一道山梁每个截面的外山脚再往外 0.5 米。远边看过去，山脊后面 e 米的地面只要 e < 山高就被山脊挡住
 * （外山脚离山脊 ≈ 0.7·山高），所以外坡这一段本来就看不见，天幕立在这里不多挡什么；整座山都在天幕里面，转到侧面时
 * （天幕在屏幕上的最左、最右，两翼从那里接出去）不会被切出一条竖边、裂缝。垭口的鞍部外坡缓（外山脚离鞍顶 2.3 倍鞍高），
 * 远边看过去鞍顶后面露出窄窄一条地面、车道往远处去，再上面是天。
 */
function curtainPts({ rows, sec, loop }: Rows): V2[] {
  const pts = loop.map(({ n }, i): V2 => {
    const crest = rows[i][2];
    const foot = rows[i][4];
    const { h } = sec[i];
    if (h < 0.4) return [crest.x, crest.z];
    const out = (foot.x - crest.x) * n[0] + (foot.z - crest.z) * n[1] + 0.5;
    return [crest.x + n[0] * out, crest.z + n[1] * out];
  });
  return convexHull(pts);
}

/**
 * 凸包（逆时针，单调链）。天幕必须是凸的一圈：视线从近边进、远边出，远边那段只挡圈外面的东西；凹进去的地方
 * 侧着看（yaw 0 看东西两边）会有几段微微朝镜头，把它北边圈里面的地面也挡掉，露出一块天。
 */
function convexHull(pts: V2[]): V2[] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: V2, a: V2, b: V2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: V2[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: V2[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

/**
 * 天幕：沿最外一道山梁外面（curtainPts）立一圈竖直的带，面朝里。
 * 只写深度、不写颜色、最先画（renderOrder −1）→ 远边山脊后面的地面、车道都被挡掉，那里露出的是背景的天；
 * 近边的那段背对镜头被剔掉，看不见。法线 pass 里写"没有描边、没有凸边"的法线（alpha 0），不出轮廓线。
 */
function curtainGeo(pts: V2[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const lo = FOOT - 0.6;
  const N = pts.length;
  for (let i = 0; i < N; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[(i + 1) % N];
    // 朝里（朝地图中心）的是正面：三角形 (p 底, q 底, q 顶) 的法线 ∝ (−dz, dx)，要它指向中心
    const inward = (az - bz) * ((ax + bx) / 2 - CX) + (bx - ax) * ((az + bz) / 2 - CZ) < 0;
    const [px, pz, qx, qz] = inward ? [ax, az, bx, bz] : [bx, bz, ax, az];
    pos.push(px, lo, pz, qx, lo, qz, qx, CURTAIN_TOP, qz, px, lo, pz, qx, CURTAIN_TOP, qz, px, CURTAIN_TOP, pz);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/**
 * 天幕的两翼：画面很宽（横屏 2:1）时，左右两边的视线从整圈山的旁边擦过去，碰不到天幕，地面会一直顶到画面顶。
 * 所以从天幕在屏幕上最左、最右的两点各往外拉一片正对镜头的竖直带（只写深度，同一个材质）：那几列里，比这两点
 * 近的地面照样看得到，远的被挡掉 → 两边是一条平的地平线，上面是天。跟着镜头的方位摆（onBeforeRender，方位变了才重算）。
 */
function curtainWings(pts: V2[], mat: THREE.Material): THREE.Mesh {
  const g = new THREE.BufferGeometry();
  const pos = new THREE.Float32BufferAttribute(new Float32Array(12 * 3), 3);
  g.setAttribute('position', pos);
  const mesh = new THREE.Mesh(g, mat);
  mesh.name = 'mtn:wings';
  mesh.renderOrder = -1;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  const f = new THREE.Vector3();
  let lastYaw = Number.NaN;
  const LONG = 2000;
  mesh.onBeforeRender = (_r, _s, cam) => {
    mesh.castShadow = false;
    cam.getWorldDirection(f);
    const yaw = Math.atan2(-f.x, -f.z);
    if (Math.abs(yaw - lastYaw) < 1e-4) return;
    lastYaw = yaw;
    // c = 朝镜头的水平方向，r = 屏幕往右
    const c: V2 = [Math.sin(yaw), Math.cos(yaw)];
    const r: V2 = [c[1], -c[0]];
    // 最左、最右：往远边偏 ~14°（比天幕丢掉的侧对角度 ~12° 多 → 两翼和天幕在屏幕上接得上，没有缝；侧着看一条直边时，
    // 翼接在这条边的远端，不切过圈里的地面）
    const sx = (q: V2) => q[0] * r[0] + q[1] * r[1];
    const deep = (q: V2) => q[0] * c[0] + q[1] * c[1];
    const B = CURTAIN_FACING + 0.05;
    let lo = 0;
    let hi = 0;
    for (let i = 1; i < pts.length; i++) {
      if (sx(pts[i]) + B * deep(pts[i]) < sx(pts[lo]) + B * deep(pts[lo])) lo = i;
      if (sx(pts[i]) - B * deep(pts[i]) > sx(pts[hi]) - B * deep(pts[hi])) hi = i;
    }
    const y0 = FOOT - 0.6;
    const v: number[] = [];
    // 正面朝镜头（法线 = c）：左边的点 L、右边的点 R，(L 底, R 底, R 顶) 逆时针
    for (const [p, dir] of [
      [pts[lo], -1],
      [pts[hi], 1],
    ] as const) {
      const b: V2 = [p[0] + r[0] * LONG * dir, p[1] + r[1] * LONG * dir];
      const [L, R] = dir > 0 ? [p, b] : [b, p];
      v.push(L[0], y0, L[1], R[0], y0, R[1], R[0], CURTAIN_TOP, R[1], L[0], y0, L[1], R[0], CURTAIN_TOP, R[1]);
      v.push(L[0], CURTAIN_TOP, L[1]);
    }
    pos.array.set(v);
    pos.needsUpdate = true;
  };
  return mesh;
}

/**
 * 天幕的材质：颜色 pass 只写深度；法线 pass 写 (0, 0, 1) + alpha 0（没有描边、凸边）。
 * 两个 pass 都丢掉"差不多侧对镜头"（水平法线和朝镜头方向夹角 > ~78°）的那几段：yaw 0 看东西两边时，凸包的边只是微微
 * 朝镜头，却会把它后面整条地面挡成一道天的竖缝；这几列交给两翼（锚点往远边偏得比这个角度多，接得上）。
 */
const CURTAIN_VERT = /* glsl */ `
varying float vFacing;
void main() {
  vFacing = normalize(normalMatrix * normal).z;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const CURTAIN_FACING = 0.2;
function curtainMat(): THREE.Material {
  const frag = (body: string) => /* glsl */ `
varying float vFacing;
uniform float uMinFacing;
void main() {
  if (vFacing < uMinFacing) discard;
  ${body}
}`;
  // 正交俯角 45°：水平法线 n 的视空间 z = (n·c)·cos45
  const uniforms = { uMinFacing: { value: CURTAIN_FACING * Math.cos(PITCH) } };
  const m = new THREE.ShaderMaterial({
    vertexShader: CURTAIN_VERT,
    fragmentShader: frag('gl_FragColor = vec4(0.0);'),
    uniforms,
    colorWrite: false,
  });
  m.userData.normalMat = new THREE.ShaderMaterial({
    vertexShader: CURTAIN_VERT,
    fragmentShader: frag('gl_FragColor = vec4(0.5, 0.5, 1.0, 0.0);'),
    uniforms,
    blending: THREE.NoBlending,
  });
  return m;
}

/**
 * 三道山梁 + 天幕（一个 Group，名字 'mtn'；每道一个网格 'mtn:<id>'，天幕 'mtn:sky'）。材质传 ctx.mats.toon。
 * 山不投影、不受投影（远在投影相机外面，受影只会出硬边的怪块；明暗全靠岩面朝向）。
 * userData.crests：所有山脊点（x, y, z 连着放），clubmap2 的自动取景用它算山顶在屏幕上到哪。
 */
export function buildMountains(toon: MtnToon, seed = 1): THREE.Group {
  const root = new THREE.Group();
  root.name = 'mtn';
  const crests: number[] = [];
  let outer: Rows | undefined;
  for (const [i, r] of RIDGES.entries()) {
    const rr = ridgeRows(r, seed + i * 17);
    outer = rr;
    for (const [k, row] of rr.rows.entries()) if (rr.sec[k].h >= 0.4) crests.push(row[2].x, row[2].y, row[2].z);
    const mat = toon(0xffffff, { ramp: r.ramp, edge: r.edge, convex: 0, lightUp: r.lightUp, bands: r.bands });
    const mesh = new THREE.Mesh(rowsGeo(rr), mat);
    mesh.name = `mtn:${r.id}`;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    root.add(mesh);
  }
  if (outer) {
    const mat = curtainMat();
    const pts = curtainPts(outer);
    const sky = new THREE.Mesh(curtainGeo(pts), mat);
    sky.name = 'mtn:sky';
    sky.renderOrder = -1;
    sky.castShadow = false;
    sky.receiveShadow = false;
    // 保险：场景之后要是又对整棵树 prepare（会打开投影），340 米高的天幕投影会把整个地图盖黑 —— 每帧关掉
    sky.onBeforeRender = () => {
      sky.castShadow = false;
    };
    root.add(sky);
    root.add(curtainWings(pts, mat));
  }
  root.userData.crests = crests;
  return root;
}

// ── 山口的车道 ──────────────────────────────────────────

/** 一道山梁在垭口正中的截面（东边直边上，截面点就在 x = DESERT.x1 + 偏移）→ 那里的山面高；不在山上 = −Infinity */
function passProfile(r: Ridge, x: number): number {
  if (!r.pass) return -Infinity;
  const crest = DESERT.x1 + r.d + (r.dDir?.e ?? 0);
  const { h, k } = r.pass;
  const ko = r.pass.kOut ?? k;
  // 和 ridgeRows 一样的 5 点（垭口里没有抖动、山嘴）
  const xs = [crest - k * h, crest - k * h * 0.4, crest, crest + ko * h * 0.38, crest + ko * h * 0.96];
  const ys = [FOOT, h * 0.5, h, h * 0.52, FOOT];
  if (x <= xs[0] || x >= xs[4]) return -Infinity;
  for (let i = 0; i < 4; i++)
    if (x <= xs[i + 1]) return ys[i] + ((ys[i + 1] - ys[i]) * (x - xs[i])) / (xs[i + 1] - xs[i]);
  return -Infinity;
}

/** 车道在 x 处的地面高（翻垭口那段跟着鞍部起伏，其余 0） */
export function passY(x: number): number {
  let y = 0;
  for (const r of RIDGES) y = Math.max(y, passProfile(r, x));
  return y;
}

/**
 * 山口那段车道（从 x0 往东一直到 ROAD_OUT.x1，地面尽头）：宽 z0..z1 的带子，翻垭口的地方每米一段、跟着 passY 起伏
 * （再抬 lift），平地上一段到底。clubmap2 和 clubpark 都用它接在平的直段（DRIVE）后面。
 * dashes：中线虚线（宽 lineW、长 dash、空 dash，抬 lift；第一段从 from 开始，不给 = x0 + dash/2）。
 */
export function passRoadGeo(
  x0: number,
  z0: number,
  z1: number,
  lift = 0.012,
  dashes?: { lineW: number; dash: number; lift: number; from?: number },
): { road: THREE.BufferGeometry; dashes?: THREE.BufferGeometry } {
  // 断点：每道垭口的山脚之间每米一个，其余直接连过去
  const hills: [number, number][] = [];
  for (const r of RIDGES) {
    if (!r.pass) continue;
    const crest = DESERT.x1 + r.d + (r.dDir?.e ?? 0);
    hills.push([crest - r.pass.k * r.pass.h - 1, crest + (r.pass.kOut ?? r.pass.k) * r.pass.h + 1]);
  }
  const onHill = (x: number) => hills.some(([a, b]) => x >= a && x <= b);
  const xs: number[] = [x0];
  for (let x = Math.ceil(x0); x < ROAD_OUT.x1; x++) if (onHill(x) || onHill(x + 1) || onHill(x - 1)) xs.push(x);
  xs.push(ROAD_OUT.x1);
  const strip = (cuts: number[], za: number, zb: number, up: number) => {
    const pos: number[] = [];
    for (let i = 0; i + 1 < cuts.length; i++) {
      const a = cuts[i];
      const b = cuts[i + 1];
      if (b - a < 1e-3) continue;
      const ya = passY(a) + up;
      const yb = passY(b) + up;
      pos.push(a, ya, za, a, ya, zb, b, yb, zb, a, ya, za, b, yb, zb, b, yb, za);
    }
    return pos;
  };
  const geo = (pos: number[]) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return g;
  };
  const road = geo(strip(xs, z0, z1, lift));
  if (!dashes) return { road };
  const zc = (z0 + z1) / 2;
  const pos: number[] = [];
  for (let a = dashes.from ?? x0 + dashes.dash / 2; a + dashes.dash < ROAD_OUT.x1 - 1; a += dashes.dash * 2) {
    const cuts = [a, a + dashes.dash / 3, a + (dashes.dash * 2) / 3, a + dashes.dash];
    pos.push(...strip(cuts, zc - dashes.lineW / 2, zc + dashes.lineW / 2, dashes.lift));
  }
  return { road, dashes: geo(pos) };
}

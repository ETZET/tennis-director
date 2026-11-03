/**
 * 一天的光（从旧的 three.js 版 daylight 关键帧搬来）：按游戏分钟给天空、群山、地平线的颜色，
 * 太阳 / 月亮，星星，调色板夜色（0 白天 .. 1 深夜）和灯光强度。只读时间和雨量，不碰模拟。
 * `daylightAt` 是纯函数；`createDaylight` 把结果交给 IsoView（它自己按档位决定什么时候重画）。
 */
import { hx } from './color';

/** IsoView 用的光照状态 */
export interface Light {
  /** 天空渐变（上、中、地平线） */
  sky: [string, string, string];
  /** 三道山脊（远 → 近） */
  mtn: [string, string, string];
  /** 地台外的荒原（两种抖色） */
  plain: [string, string];
  /** 0 没有星星 .. 1 满天 */
  star: number;
  /** 太阳的颜色和位置（横、竖，0..1，竖是天空高度的比例；> 1 落到山后 / 地平线下） */
  disc: [string, number, number];
  /** 月亮：颜色（已按显隐褪进天色）、横、竖、显隐 0..1 */
  moonDisc: [string, number, number, number];
  /** 月亮看得见 */
  moon: boolean;
  /** 调色板夜色 0..1（同时决定黄昏的暖色，见 color.ts 的 warmth） */
  night: number;
  /** 灯 0 关 .. 1 全亮（夜色的函数，见 lampsOf） */
  lamps: number;
  /** 暖色系数 1 晴 .. 0 大雨（雨天不出金色时刻） */
  warm: number;
}

type RGB = [number, number, number];
interface Key {
  at: number;
  sky: [RGB, RGB, RGB];
  mtn: [RGB, RGB, RGB];
  plain: [RGB, RGB];
  star: number;
  /** 太阳颜色、横、竖 */
  sun: [RGB, number, number];
  night: number;
}

const K = (
  at: number,
  sky: [string, string, string],
  mtn: [string, string, string],
  plain: [string, string],
  star: number,
  sun: [string, number, number],
  night: number,
): Key => ({
  at,
  sky: sky.map((h) => [...hx(h)]) as Key['sky'],
  mtn: mtn.map((h) => [...hx(h)]) as Key['mtn'],
  plain: plain.map((h) => [...hx(h)]) as Key['plain'],
  star,
  sun: [[...hx(sun[0])] as RGB, sun[1], sun[2]],
  night,
});

const H = (h: number, m = 0) => h * 60 + m;
const NIGHT_SKY: [string, string, string] = ['#0e102c', '#2c2454', '#5c406e'];
const NIGHT_MTN: [string, string, string] = ['#3a2f58', '#2c2546', '#211c36'];
const NIGHT_PLAIN: [string, string] = ['#1e1a30', '#161426'];
const DAY_SKY: [string, string, string] = ['#60b2e6', '#9cd0ec', '#f8e0b8'];
const DAY_MTN: [string, string, string] = ['#c7a8b0', '#b0868a', '#a0786c'];
const DAY_PLAIN: [string, string] = ['#e2c498', '#ceaa80'];

/**
 * 关键帧（按时间排好，关键帧之间线性插值）。早晚各走一遍：夜 → 蓝调 → 日出 / 日落 → 金色时刻 → 白天。
 * 太阳早上从右边山后升起、傍晚在左边落到山后（竖约 0.5 就碰到山脊，> 1 在地平线下）；月亮另算（见 moonAt）。
 * 午后一直是白天，16:30 起往金色时刻走；20:00 收盘前已经入夜、灯全亮。
 */
const KEYS: readonly Key[] = [
  K(0, NIGHT_SKY, NIGHT_MTN, NIGHT_PLAIN, 1, ['#ffb060', 0.84, 1.3], 1),
  K(H(5), NIGHT_SKY, NIGHT_MTN, NIGHT_PLAIN, 1, ['#ffb060', 0.84, 1.3], 1),
  // 蓝调：天边先泛出一点紫红
  K(
    H(5, 45),
    ['#1c2350', '#454680', '#946888'],
    ['#4a3e6a', '#3a3158', '#2c2646'],
    ['#3c3244', '#30283a'],
    0.3,
    ['#ff9a5a', 0.84, 0.9],
    0.72,
  ),
  // 日出：太阳从右边山后出来
  K(
    H(6, 30),
    ['#4a5a96', '#d8889a', '#ffc080'],
    ['#b07a80', '#86607c', '#5e4e70'],
    ['#c08e72', '#a07462'],
    0,
    ['#ffb868', 0.84, 0.56],
    0.35,
  ),
  // 金色时刻
  K(
    H(7, 30),
    ['#6c8fc8', '#e8b49a', '#ffe0b0'],
    ['#c49a8a', '#a07c88', '#7c6a8a'],
    ['#e6c098', '#cfa47c'],
    0,
    ['#fff0c0', 0.82, 0.4],
    0.12,
  ),
  K(H(10, 30), DAY_SKY, DAY_MTN, DAY_PLAIN, 0, ['#fff6d6', 0.2, 0.3], 0),
  K(H(16, 30), DAY_SKY, DAY_MTN, DAY_PLAIN, 0, ['#fff6d6', 0.18, 0.32], 0),
  // 金色时刻：天还蓝，地平线发金，山被夕照染暖
  K(
    H(17, 35),
    ['#5a92cc', '#e6c49c', '#ffd890'],
    ['#d6a48e', '#ba8278', '#9a6a66'],
    ['#e8ba86', '#cf9c72'],
    0,
    ['#ffe2a0', 0.16, 0.42],
    0.12,
  ),
  // 日落：太阳贴着左边山脊，天边橙红
  K(
    H(18, 15),
    ['#3a3a72', '#c86a7a', '#ffb070'],
    ['#b46c72', '#805274', '#58466c'],
    ['#b8826a', '#9a6a5c'],
    0,
    ['#ffb060', 0.15, 0.56],
    0.35,
  ),
  // 蓝调：太阳落了，天边还剩一抹紫
  K(
    H(18, 55),
    ['#1a1e4a', '#3c3a74', '#8a5a7c'],
    ['#4c3e6a', '#3a3058', '#2c2546'],
    ['#3a3042', '#2e2636'],
    0.35,
    ['#ff8a50', 0.14, 0.9],
    0.72,
  ),
  K(H(19, 40), NIGHT_SKY, NIGHT_MTN, NIGHT_PLAIN, 1, ['#ff8a50', 0.14, 1.3], 1),
  K(H(24), NIGHT_SKY, NIGHT_MTN, NIGHT_PLAIN, 1, ['#ffb060', 0.84, 1.3], 1),
];

/** 灯光强度跟着夜色走：夜色 0.4 起慢慢亮，0.85 全亮（灯头的亮起门槛错开在 0.4~0.52，见 site 的 dark） */
export const lampsOf = (night: number): number => Math.max(0, Math.min(1, (night - 0.4) / 0.45));

const hex2 = (n: number) =>
  Math.round(Math.max(0, Math.min(255, n)))
    .toString(16)
    .padStart(2, '0');
const hex = (c: readonly number[]) => `#${hex2(c[0] as number)}${hex2(c[1] as number)}${hex2(c[2] as number)}`;
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const mixC = (a: readonly number[], b: readonly number[], u: number): RGB => [
  lerp(a[0] as number, b[0] as number, u),
  lerp(a[1] as number, b[1] as number, u),
  lerp(a[2] as number, b[2] as number, u),
];
const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** 阴雨天的灰：天空三段、山脊三道（雨越大越往这边靠） */
const OVERCAST_SKY: readonly RGB[] = [hx('#6e7682'), hx('#8e959e'), hx('#a9aaa6')];
const OVERCAST_MTN: readonly RGB[] = [hx('#9a96a0'), hx('#86808c'), hx('#74707e')];
/** 雨量到这儿太阳 / 月亮完全被云遮住 */
const DISC_GONE = 0.5;
/** 月亮的位置和颜色 */
const MOON: RGB = hx('#faf4d6');
const MOON_AT: readonly [number, number] = [0.76, 0.12];

/**
 * 一天中某一分钟的光（关键帧之间线性插值，连续变化）。
 * rain 0..1：天色往阴天灰靠、整体压暗，加一点夜色、压掉暖色；太阳 / 月亮随雨量褪进天色，雨量过半就看不见了。
 */
export function daylightAt(minute: number, rain = 0): Light {
  const m = ((minute % 1440) + 1440) % 1440;
  const wet = Math.max(0, Math.min(1, rain));
  let i = 0;
  while (i < KEYS.length - 2 && (KEYS[i + 1] as Key).at <= m) i++;
  const a = KEYS[i] as Key;
  const b = KEYS[i + 1] as Key;
  const u = b.at > a.at ? (m - a.at) / (b.at - a.at) : 0;
  const dim = 1 - 0.35 * wet;
  const dark = lerp(a.night, b.night, u);
  const night = Math.min(1, dark + 0.25 * wet);
  // 先按时间插值，再往阴天灰靠、压暗（夜里天本来就黑，往灰靠得少，免得下雨反而把夜空提亮）
  const grey = (x: RGB, y: RGB, g: RGB, k: number): RGB => {
    const c = mixC(mixC(x, y, u), g, k * (1 - 0.85 * dark));
    return [c[0] * dim, c[1] * dim, c[2] * dim];
  };
  const skyC = [0, 1, 2].map((j) => grey(a.sky[j] as RGB, b.sky[j] as RGB, OVERCAST_SKY[j] as RGB, 0.6 * wet)) as [
    RGB,
    RGB,
    RGB,
  ];
  // 太阳 / 月亮：颜色褪向它所在高度的天色；被云完全遮住时挪到地平线下面（IsoView 不画地平线以下的）
  const fade = Math.min(1, wet / DISC_GONE);
  const behind = (dy: number) => mixC(skyC[0], skyC[1], Math.min(1, Math.max(0, dy) / 0.6));
  const sy = lerp(a.sun[2], b.sun[2], u);
  const sunC = mixC(mixC(a.sun[0], b.sun[0], u), behind(sy), fade * 0.85);
  // 月亮：夜色 0.55 起慢慢显出来，0.9 全显
  const mA = smooth(0.55, 0.9, dark) * (1 - fade);
  const moonC = mixC(behind(MOON_AT[1]), MOON, mA);
  return {
    sky: [hex(skyC[0]), hex(skyC[1]), hex(skyC[2])],
    mtn: [0, 1, 2].map((j) => hex(grey(a.mtn[j] as RGB, b.mtn[j] as RGB, OVERCAST_MTN[j] as RGB, 0.3 * wet))) as [
      string,
      string,
      string,
    ],
    plain: [0, 1].map((j) => {
      const c = mixC(a.plain[j] as RGB, b.plain[j] as RGB, u);
      return hex([c[0] * dim, c[1] * dim, c[2] * dim]);
    }) as [string, string],
    star: lerp(a.star, b.star, u) * (1 - wet),
    disc: [hex(sunC), lerp(a.sun[1], b.sun[1], u), fade >= 1 ? 9 : sy],
    moonDisc: [hex(moonC), MOON_AT[0], fade >= 1 ? 9 : MOON_AT[1], mA],
    moon: mA > 0.02,
    night,
    lamps: lampsOf(night),
    warm: 1 - wet,
  };
}

/** 默认光照（正午） */
export const NOON: Light = daylightAt(12 * 60);

export interface Daylight {
  /** minute：一天中的分钟（可以带零头）；rain 0..1 */
  update(minute: number, rain: number): void;
  /** 当前灯光强度 0..1 */
  lamps(): number;
  /** 当前调色板夜色 0..1 */
  night(): number;
  readonly light: Light;
}

/**
 * 把一天的光交给画面：时间或雨量一变就重算（连续变化，不再按 10 分钟分档）。
 * IsoView 自己决定静态层怎么跟上（几档烘焙之间 Bayer 抖动过渡，见 view.ts）。
 */
export function createDaylight(world: { view: { setLight(l: Light): void } }): Daylight {
  let cur = NOON;
  let lastM = Number.NaN;
  let lastR = Number.NaN;
  return {
    update(minute, rain) {
      const m = ((minute % 1440) + 1440) % 1440;
      // 不到 0.05 游戏分钟、雨量不到 0.5% 的变化看不出来，省得每帧拼颜色字符串
      if (Math.abs(m - lastM) < 0.05 && Math.abs(rain - lastR) < 0.005) return;
      lastM = m;
      lastR = rain;
      cur = daylightAt(m, rain);
      world.view.setLight(cur);
    },
    lamps: () => cur.lamps,
    night: () => cur.night,
    get light() {
      return cur;
    },
  };
}

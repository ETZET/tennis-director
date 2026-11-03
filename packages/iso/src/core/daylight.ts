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
  /** 太阳（月亮）的颜色和位置（横、竖，0..1，竖是天空高度的比例） */
  disc: [string, number, number];
  /** 是月亮 */
  moon: boolean;
  /** 调色板夜色 0..1 */
  night: number;
  /** 灯 0 关 .. 1 全亮 */
  lamps: number;
}

interface Key {
  at: number;
  sky: [string, string, string];
  mtn: [string, string, string];
  plain: [string, string];
  star: number;
  disc: [string, number, number];
  night: number;
  lamps: number;
}

const MORNING: Key = {
  at: 8 * 60,
  sky: ['#6c8fc8', '#e8b49a', '#ffe0b0'],
  mtn: ['#c49a8a', '#a07c88', '#7c6a8a'],
  plain: ['#e6c098', '#cfa47c'],
  star: 0,
  disc: ['#fff0c0', 0.82, 0.7],
  night: 0.12,
  lamps: 0,
};
const DAY: Key = {
  at: 10 * 60 + 30,
  sky: ['#60b2e6', '#9cd0ec', '#f8e0b8'],
  mtn: ['#c7a8b0', '#b0868a', '#a0786c'],
  plain: ['#e2c498', '#ceaa80'],
  star: 0,
  disc: ['#fff6d6', 0.2, 0.3],
  night: 0,
  lamps: 0,
};
const DUSK: Key = {
  at: 18 * 60 + 15,
  sky: ['#3a3a72', '#c86a7a', '#ffb070'],
  mtn: ['#c27a7a', '#8a5a7a', '#5a4a6a'],
  plain: ['#b8826a', '#9a6a5c'],
  star: 0,
  disc: ['#ffd27a', 0.15, 0.78],
  night: 0.35,
  lamps: 0.35,
};
const NIGHT: Key = {
  at: 19 * 60 + 40,
  sky: ['#0e102c', '#2c2454', '#5c406e'],
  mtn: ['#3a2f58', '#2c2546', '#211c36'],
  plain: ['#1e1a30', '#161426'],
  star: 1,
  disc: ['#faf4d6', 0.78, 0.25],
  night: 1,
  lamps: 1,
};
/** 关键帧（按时间排好）：午后一直是白天，16:30 起往黄昏走；20:00 收盘前已经入夜、灯全亮 */
const KEYS: readonly Key[] = [
  { ...NIGHT, at: 0 },
  { ...NIGHT, at: 5 * 60 },
  MORNING,
  DAY,
  { ...DAY, at: 16 * 60 + 30 },
  DUSK,
  NIGHT,
  { ...NIGHT, at: 24 * 60 },
];

const hex2 = (n: number) =>
  Math.round(Math.max(0, Math.min(255, n)))
    .toString(16)
    .padStart(2, '0');
function mix(a: string, b: string, u: number, dim = 1): string {
  const x = hx(a);
  const y = hx(b);
  return `#${hex2((x[0] + (y[0] - x[0]) * u) * dim)}${hex2((x[1] + (y[1] - x[1]) * u) * dim)}${hex2((x[2] + (y[2] - x[2]) * u) * dim)}`;
}
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;

/** 阴雨天的灰：天空三段、山脊三道（雨越大越往这边靠） */
const OVERCAST_SKY: readonly [string, string, string] = ['#6e7682', '#8e959e', '#a9aaa6'];
const OVERCAST_MTN: readonly [string, string, string] = ['#9a96a0', '#86808c', '#74707e'];
/** 雨量到这儿太阳 / 月亮完全被云遮住 */
const DISC_GONE = 0.5;

/**
 * 一天中某一分钟的光（关键帧之间线性插值）。
 * rain 0..1：天色往阴天灰靠、整体压暗，加一点夜色；太阳 / 月亮随雨量褪进天色，雨量过半就看不见了。
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
  // 月亮 / 太阳在夜色过半时换
  const dark = lerp(a.night, b.night, u);
  const night = Math.min(1, dark + 0.25 * wet);
  const moon = dark > 0.6;
  // 先按时间插值，再往阴天灰靠、压暗（夜里天本来就黑，往灰靠得少，免得下雨反而把夜空提亮）
  const grey = (x: string, y: string, g: string, k: number) => mix(mix(x, y, u), g, k * (1 - 0.85 * dark), dim);
  const sky: [string, string, string] = [
    grey(a.sky[0], b.sky[0], OVERCAST_SKY[0], 0.6 * wet),
    grey(a.sky[1], b.sky[1], OVERCAST_SKY[1], 0.6 * wet),
    grey(a.sky[2], b.sky[2], OVERCAST_SKY[2], 0.6 * wet),
  ];
  // 太阳 / 月亮：颜色褪向它所在高度的天色；被云完全遮住时挪到地平线下面（IsoView 不画地平线以下的）
  const fade = Math.min(1, wet / DISC_GONE);
  const dy = lerp(a.disc[2], b.disc[2], u);
  const behind = mix(sky[0], sky[1], Math.min(1, dy / 0.6));
  const disc: [string, number, number] = [
    mix(mix(a.disc[0], b.disc[0], u), behind, fade * 0.85),
    lerp(a.disc[1], b.disc[1], u),
    fade >= 1 ? 9 : dy,
  ];
  return {
    sky,
    mtn: [
      grey(a.mtn[0], b.mtn[0], OVERCAST_MTN[0], 0.3 * wet),
      grey(a.mtn[1], b.mtn[1], OVERCAST_MTN[1], 0.3 * wet),
      grey(a.mtn[2], b.mtn[2], OVERCAST_MTN[2], 0.3 * wet),
    ],
    plain: [mix(a.plain[0], b.plain[0], u, dim), mix(a.plain[1], b.plain[1], u, dim)],
    star: lerp(a.star, b.star, u) * (1 - wet),
    disc,
    moon,
    night,
    lamps: lerp(a.lamps, b.lamps, u),
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

/** 把一天的光交给画面：IsoView 按夜色档、灯光档决定是否重烘静态层，天色每 10 游戏分钟重画背景 */
export function createDaylight(world: { view: { setLight(l: Light): void } }): Daylight {
  let cur = NOON;
  let bucket = '';
  return {
    update(minute, rain) {
      const key = `${Math.floor((((minute % 1440) + 1440) % 1440) / 10)}|${Math.round(rain * 10)}`;
      if (key === bucket) return;
      bucket = key;
      cur = daylightAt(minute, rain);
      world.view.setLight(cur);
    },
    lamps: () => cur.lamps,
    night: () => cur.night,
    get light() {
      return cur;
    },
  };
}

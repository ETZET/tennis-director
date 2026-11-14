// 时间和天气（纯函数，不 import three；node 里也能跑）：时刻 + 天气 → 这一刻的光（太阳/月亮的方向和直射强度、三档颜色乘子、
// 天色、轮廓色、云量、雨、风沙、星星、灯）。clubsite/daylight/index.ts 每帧把它写进 uniform、太阳、天空、管线。
//
// 美术约定（pixel-scene 第 1 条"太阳在画面后方"）：太阳不走真实的南天，而是从东边（画面右、+x）升起、绕到画面正后方（北、−z）、
// 落到西边（画面左）—— 影子永远落向镜头这一侧：早上影子长、往左下；中午短、几乎正下；傍晚长、往右下。
// 中午 12 点 ≈ 原来各场景定死的 el 44 / az 8（默认时刻 = 原来的样子）。
// 颜色乘子是相对配色方案（默认 6 午后金光）的：正午前后是 1（一个字节不变），清晨偏粉、傍晚偏橙、夜里整体压暗偏靛蓝；
// 亮 / 中 / 暗三档分开乘（影子的色相能跟亮面走不同的方向，像素画里黄昏的影子是紫的、亮面是橙的）。

export type Weather = 'clear' | 'cloudy' | 'overcast' | 'rain' | 'dust';
export const WEATHERS: Weather[] = ['clear', 'cloudy', 'overcast', 'rain', 'dust'];
export const WEATHER_NAME: Record<Weather, string> = {
  clear: '晴',
  cloudy: '多云',
  overcast: '阴',
  rain: '雨',
  dust: '风沙',
};

type RGB = [number, number, number];

export interface DayLook {
  /** 光源方向（度）：仰角、方位（0 = 正北 = 画面正后方，正 = 偏东 → 影子落向左下） */
  el: number;
  az: number;
  /** true = 现在是月亮在照（太阳在地平线下） */
  moon: boolean;
  /** 直射光强度 0..1：投影有多"实"（< 1 时投影按有序抖动稀掉；阴天、雨天 0 = 没有投影） */
  sunK: number;
  /** 着色用的最低仰角（度）：太阳低的时候顶面还是亮档（不然清晨整个地面掉到中档，看着像阴影），投影照真实的低太阳拉长 */
  shadeEl: number;
  /** 三档颜色乘子 */
  lit: RGB;
  mid: RGB;
  dark: RGB;
  /** 天空上下两色（0xRRGGBB） */
  skyTop: number;
  skyHorizon: number;
  /** 轮廓压暗色（乘在配色方案的 edgeTint 上） */
  edgeMul: RGB;
  /** 云影判定半径（1 = 场景手摆的云；> 1 云变大 = 多云；≥ 50 = 满天，亮档全压到中档） */
  cloudCut: number;
  /** 云飘的速度倍数 */
  cloudVel: number;
  /** 雨 0..1、风沙 0..1、星星 0..1 */
  rain: number;
  dust: number;
  stars: number;
  /** 风（乘在场景的风上） */
  wind: number;
  /** 灯：0 关 … 1 全开（天黑、阴雨天） */
  lamps: number;
  /** 风沙的颜色 */
  dustColor: RGB;
  /** 饱和度（1 = 原样；阴雨天、夜里往灰收一点） */
  sat: number;
}

/** 日出、日落、太阳最高仰角、日出日落时的方位（度） */
export const SUNRISE = 6;
export const SUNSET = 18.5;
const MAX_EL = 46;
/** 投影用的最低仰角：真太阳贴着地平线时影子能拉满屏，像素画里读不清；压到 12° 起（影子最长 ≈ 4.7 倍高） */
const MIN_EL = 12;
const AZ_RISE = 75;
/** 月亮：固定挂在画面后方偏西，影子短 */
const MOON = { el: 52, az: -18 };

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerp3 = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const mul3 = (a: RGB, b: RGB): RGB => [a[0] * b[0], a[1] * b[1], a[2] * b[2]];
const hex3 = (h: number): RGB => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
const toHex = (c: RGB) => {
  const q = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)));
  return (q(c[0]) << 16) | (q(c[1]) << 8) | q(c[2]);
};
const lerpHex = (a: number, b: number, t: number) => toHex(lerp3(hex3(a), hex3(b), t));

/** 把小时折到 [0, 24) */
export const wrapHour = (h: number) => ((h % 24) + 24) % 24;

/** 太阳的真实位置（度）：el < 0 = 地平线下 */
export function sunPos(hour: number): { el: number; az: number } {
  const t = (wrapHour(hour) - SUNRISE) / (SUNSET - SUNRISE);
  // 地平线下也接着算（el 变负），黄昏 / 黎明的过渡用
  return { el: MAX_EL * Math.sin(Math.PI * t), az: AZ_RISE * Math.cos(Math.PI * Math.min(1.15, Math.max(-0.15, t))) };
}

// ── 晴天的关键帧（小时 → 三档乘子、天色、轮廓） ──
interface Key {
  h: number;
  lit: RGB;
  mid: RGB;
  dark: RGB;
  /** 天空上下（null = 用配色方案自己的） */
  sky: [number, number] | null;
  edge: RGB;
}
const ONE: RGB = [1, 1, 1];
const NIGHT: Omit<Key, 'h'> = {
  lit: [0.4, 0.48, 0.74],
  mid: [0.3, 0.36, 0.6],
  dark: [0.21, 0.24, 0.45],
  sky: [0x0d1230, 0x232c58],
  edge: [0.55, 0.6, 0.9],
};
const KEYS: Key[] = [
  { h: 0, ...NIGHT },
  { h: 4.6, ...NIGHT },
  // 黎明前：天边泛青紫
  {
    h: 5.5,
    lit: [0.5, 0.52, 0.76],
    mid: [0.4, 0.42, 0.66],
    dark: [0.29, 0.3, 0.52],
    sky: [0x262c62, 0x7a6a9a],
    edge: [0.6, 0.58, 0.88],
  },
  // 日出：亮面粉橙、影子蓝紫
  {
    h: 6.4,
    lit: [1.02, 0.8, 0.74],
    mid: [0.74, 0.7, 0.86],
    dark: [0.6, 0.58, 0.82],
    sky: [0x4a5c9e, 0xf2aa8c],
    edge: [0.8, 0.7, 0.95],
  },
  // 早上：清爽偏冷
  {
    h: 8.3,
    lit: [1.0, 0.98, 0.97],
    mid: [0.95, 0.96, 1.03],
    dark: [0.92, 0.94, 1.05],
    sky: [0x5aa0e0, 0xc4e2f2],
    edge: [0.95, 0.97, 1.03],
  },
  { h: 10.5, lit: ONE, mid: ONE, dark: ONE, sky: null, edge: ONE },
  { h: 14, lit: ONE, mid: ONE, dark: ONE, sky: null, edge: ONE },
  // 下午晚些：金
  {
    h: 16.5,
    lit: [1.04, 0.96, 0.86],
    mid: [1.0, 0.93, 0.9],
    dark: [0.95, 0.88, 0.93],
    sky: [0x5a90d2, 0xf4ca92],
    edge: [1.02, 0.95, 0.95],
  },
  // 日落：亮面橙、中档淡紫、影子深紫
  {
    h: 18.1,
    lit: [1.1, 0.78, 0.58],
    mid: [0.84, 0.67, 0.76],
    dark: [0.6, 0.5, 0.74],
    sky: [0x4a5aa2, 0xf29462],
    edge: [0.95, 0.75, 0.9],
  },
  // 黄昏：蓝调
  {
    h: 19.1,
    lit: [0.56, 0.52, 0.74],
    mid: [0.45, 0.44, 0.66],
    dark: [0.32, 0.33, 0.55],
    sky: [0x262c6a, 0x8a5a84],
    edge: [0.65, 0.6, 0.9],
  },
  { h: 20.2, ...NIGHT },
  { h: 24, ...NIGHT },
];

function keyAt(hour: number, baseSky: [number, number]): Omit<Key, 'h' | 'sky'> & { sky: [number, number] } {
  const h = wrapHour(hour);
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1].h <= h) i++;
  const a = KEYS[i];
  const b = KEYS[i + 1];
  const t = smooth(a.h, b.h, h);
  const sa = a.sky ?? baseSky;
  const sb = b.sky ?? baseSky;
  return {
    lit: lerp3(a.lit, b.lit, t),
    mid: lerp3(a.mid, b.mid, t),
    dark: lerp3(a.dark, b.dark, t),
    sky: [lerpHex(sa[0], sb[0], t), lerpHex(sa[1], sb[1], t)],
    edge: lerp3(a.edge, b.edge, t),
  };
}

// ── 天气：在晴天的结果上再改 ──
interface WeatherMod {
  lit: RGB;
  mid: RGB;
  dark: RGB;
  /** 天色往这两个色混多少（白天的量；夜里按天黑程度再压暗） */
  sky: [number, number];
  skyK: number;
  sunK: number;
  cloudCut: number;
  cloudVel: number;
  rain: number;
  dust: number;
  stars: number;
  wind: number;
  /** 白天也要开灯的程度 */
  lamps: number;
  sat: number;
}
const WEATHER: Record<Weather, WeatherMod> = {
  clear: {
    lit: ONE,
    mid: ONE,
    dark: ONE,
    sky: [0, 0],
    skyK: 0,
    sunK: 1,
    cloudCut: 1,
    cloudVel: 1,
    rain: 0,
    dust: 0,
    stars: 1,
    wind: 1,
    lamps: 0,
    sat: 1,
  },
  // 多云：云团变大（云影盖住更多地面，还是手摆的那几团，只是更胖）、飘得快一点
  cloudy: {
    lit: [0.99, 0.99, 1.0],
    mid: [0.98, 0.98, 1.01],
    dark: ONE,
    sky: [0x6c98c8, 0xc8d6e2],
    skyK: 0.55,
    sunK: 1,
    cloudCut: 2.1,
    cloudVel: 2.2,
    rain: 0,
    dust: 0,
    stars: 0.4,
    wind: 1.4,
    lamps: 0,
    sat: 0.95,
  },
  // 阴天：没有直射光（亮档全压中档、投影没了），中档提一点、偏冷灰
  overcast: {
    lit: [0.98, 1.0, 1.04],
    mid: [1.04, 1.06, 1.1],
    dark: [1.08, 1.1, 1.14],
    sky: [0x7e8aa0, 0xb6bcc8],
    skyK: 1,
    sunK: 0,
    cloudCut: 99,
    cloudVel: 1,
    rain: 0,
    dust: 0,
    stars: 0,
    wind: 1.3,
    lamps: 0.2,
    sat: 0.78,
  },
  // 雨：阴天再压暗偏蓝，地面湿（暗档更深），开灯
  rain: {
    lit: [0.76, 0.8, 0.9],
    mid: [0.78, 0.83, 0.95],
    dark: [0.74, 0.79, 0.95],
    sky: [0x4a546c, 0x7c8494],
    skyK: 1,
    sunK: 0,
    cloudCut: 99,
    cloudVel: 1,
    rain: 1,
    dust: 0,
    stars: 0,
    wind: 1.8,
    lamps: 0.55,
    sat: 0.68,
  },
  // 风沙（沙漠里的）：太阳还在但被沙尘染黄、远处起雾，风大
  dust: {
    lit: [1.04, 0.92, 0.76],
    mid: [1.02, 0.92, 0.8],
    dark: [1.0, 0.9, 0.82],
    sky: [0xc4a072, 0xe6c898],
    skyK: 1,
    sunK: 1,
    cloudCut: 1,
    cloudVel: 2,
    rain: 0,
    dust: 1,
    stars: 0,
    wind: 3,
    lamps: 0.2,
    sat: 0.82,
  },
};

/** 天黑程度 0（白天）..1（夜里）：按亮档乘子的亮度 */
function darkness(lit: RGB): number {
  const l = 0.2126 * lit[0] + 0.7152 * lit[1] + 0.0722 * lit[2];
  return Math.min(1, Math.max(0, (0.95 - l) / (0.95 - 0.47)));
}

export interface SkyBase {
  /** 配色方案的天空（不带配色方案的场景给原来的天色） */
  sky: { top: number; horizon: number };
}

/** 这一刻的光（时刻：小时，可以带小数；超出 0..24 会折回来） */
export function dayLook(hour: number, weather: Weather, base: SkyBase): DayLook {
  const k = keyAt(hour, [base.sky.top, base.sky.horizon]);
  const w = WEATHER[weather];
  const sp = sunPos(hour);
  const night = darkness(k.lit);

  // 太阳 / 月亮：太阳 el > 2° 用太阳；落到 −4° 以下换月亮；中间那一段投影淡出淡入（换方向的那一刻没有投影，不跳）
  let el: number;
  let az: number;
  let moon: boolean;
  let direct: number;
  if (sp.el > -1) {
    moon = false;
    el = MIN_EL + (MAX_EL - MIN_EL) * Math.max(0, sp.el / MAX_EL);
    az = sp.az;
    direct = smooth(-1, 5, sp.el);
  } else {
    moon = true;
    el = MOON.el;
    az = MOON.az;
    direct = smooth(-1, -8, sp.el);
  }
  const lit = mul3(k.lit, w.lit);
  const mid = mul3(k.mid, w.mid);
  const dark = mul3(k.dark, w.dark);
  // 天：白天往天气的天色混；夜里天气的天色也跟着压暗
  const dim = 1 - 0.75 * night;
  const wTop = toHex(mul3(hex3(w.sky[0]), [dim, dim, dim * 1.1]));
  const wHor = toHex(mul3(hex3(w.sky[1]), [dim, dim, dim * 1.1]));
  return {
    el,
    az,
    moon,
    sunK: direct * w.sunK,
    shadeEl: moon ? el : Math.max(el, 30),
    lit,
    mid,
    dark,
    skyTop: lerpHex(k.sky[0], wTop, w.skyK),
    skyHorizon: lerpHex(k.sky[1], wHor, w.skyK),
    edgeMul: k.edge,
    cloudCut: w.cloudCut,
    cloudVel: w.cloudVel,
    rain: w.rain,
    dust: w.dust,
    stars: night * w.stars,
    wind: w.wind,
    lamps: Math.min(1, Math.max(smooth(0.3, 0.6, night), w.lamps * (0.5 + 0.5 * night))),
    dustColor: [0.86, 0.68, 0.46],
    sat: w.sat * (1 - 0.22 * night),
  };
}

/** 显示用：小时 → "18:30" */
export function clockText(hour: number): string {
  const h = wrapHour(hour);
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** 时段名（HUD） */
export function periodName(hour: number): string {
  const h = wrapHour(hour);
  if (h < 5) return '深夜';
  if (h < 6.8) return '清晨';
  if (h < 10.5) return '上午';
  if (h < 14) return '中午';
  if (h < 17) return '下午';
  if (h < 19.2) return '傍晚';
  if (h < 22) return '夜晚';
  return '深夜';
}

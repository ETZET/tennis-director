// 天气自己变（"不操作时世界照样运转"）：一天分成 3 小时一段，每段按种子哈希抽一种天气（沙漠：晴多、多云次之，阴、雨、风沙少），
// 段首 0.4 小时从上一段过渡过来。第一天 15 点前固定晴（打开页面的样子和以前一样）。纯函数，不用 Math.random。
import { type DayLook, dayLook, type SkyBase, type Weather } from './sky';

const BLOCK = 3;
const FADE = 0.4;
const ODDS: [Weather, number][] = [
  ['clear', 0.52],
  ['cloudy', 0.26],
  ['overcast', 0.08],
  ['rain', 0.06],
  ['dust', 0.08],
];

function hash(n: number, seed: number): number {
  let x = (Math.imul(n | 0, 0x9e3779b1) ^ Math.imul(seed | 0, 0x85ebca6b)) >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b) >>> 0;
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

/** 第 block 段（从第 0 天 0 点算，每段 3 小时）的天气 */
export function weatherOfBlock(block: number, seed: number): Weather {
  if (block * BLOCK < 15) return 'clear';
  const r = hash(block, seed);
  let acc = 0;
  for (const [w, p] of ODDS) {
    acc += p;
    if (r < acc) return w;
  }
  return 'clear';
}

/** 自动天气：total = 从第 0 天 0 点起的小时数 → 这一刻的天气（过渡中给两种 + 比例） */
export function autoWeather(total: number, seed: number): { from: Weather; to: Weather; t: number } {
  const b = Math.floor(total / BLOCK);
  const to = weatherOfBlock(b, seed);
  const from = weatherOfBlock(b - 1, seed);
  const t = Math.min(1, (total - b * BLOCK) / FADE);
  return { from, to, t: from === to ? 1 : t };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerp3 = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] => [
  lerp(a[0], b[0], t),
  lerp(a[1], b[1], t),
  lerp(a[2], b[2], t),
];
const lerpHex = (a: number, b: number, t: number) => {
  const c = (h: number, s: number) => (h >> s) & 255;
  const m = (s: number) => Math.round(lerp(c(a, s), c(b, s), t));
  return (m(16) << 16) | (m(8) << 8) | m(0);
};

/** 两种天气之间插值（同一时刻）：云量在对数里插（云一团团长胖，盖满天），其余线性 */
export function blendLook(a: DayLook, b: DayLook, t: number): DayLook {
  if (t >= 1) return b;
  if (t <= 0) return a;
  return {
    ...b,
    sunK: lerp(a.sunK, b.sunK, t),
    lit: lerp3(a.lit, b.lit, t),
    mid: lerp3(a.mid, b.mid, t),
    dark: lerp3(a.dark, b.dark, t),
    skyTop: lerpHex(a.skyTop, b.skyTop, t),
    skyHorizon: lerpHex(a.skyHorizon, b.skyHorizon, t),
    edgeMul: lerp3(a.edgeMul, b.edgeMul, t),
    cloudCut: Math.exp(lerp(Math.log(a.cloudCut), Math.log(b.cloudCut), t)),
    cloudVel: lerp(a.cloudVel, b.cloudVel, t),
    rain: lerp(a.rain, b.rain, t),
    dust: lerp(a.dust, b.dust, t),
    stars: lerp(a.stars, b.stars, t),
    wind: lerp(a.wind, b.wind, t),
    lamps: lerp(a.lamps, b.lamps, t),
    sat: lerp(a.sat, b.sat, t),
  };
}

/** 这一刻的光：weather = 'auto' 时按自动天气（total = 总小时数） */
export function lookAt(total: number, weather: Weather | 'auto', seed: number, base: SkyBase): DayLook {
  if (weather !== 'auto') return dayLook(total, weather, base);
  const w = autoWeather(total, seed);
  const b = dayLook(total, w.to, base);
  return w.t >= 1 ? b : blendLook(dayLook(total, w.from, base), b, w.t);
}

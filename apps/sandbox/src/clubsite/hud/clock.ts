// 日钟（左上）：一个像素画的圆，里面是这一刻的天（天色四条色带、太阳沿着弧从左升到右落、傍晚橙、夜里月亮和星星、
// 云按天气多少、雨丝、风沙），外圈是营业时段的进度（OPEN 点从正上方起顺时针走到 CLOSE 点一圈；已过的金色、没过的深墨，
// 一颗小网球骑在环上是"现在"，不进天空窗）；
// 圆下面一行很短的日期。数据从 clubsite/daylight 读（look = 这一刻的光、total = 时钟）。
// 画在 1 倍小 canvas 上（38×39 纹素），CSS 整数倍放大。
import type { DayLook, Weather } from '../daylight/sky';
import { INK, KEYS } from './colors';

export interface ClockData {
  /** 时刻（0..24） */
  hour: number;
  look: DayLook;
  weather: Weather;
}

/** 营业时段（日钟外圈一圈）：6 点开门、22 点关门 */
export const OPEN = 6;
export const CLOSE = 22;

const N = 38;
const C = N / 2;
/** 天一直贴到外环（参考：整个钟是一块亮的天，只有最外一圈墨线） */
const R_SKY = 13.5;
/** 外环 3 纹素（参考：粗的进度环，没有黑外框） */
const R_RING = 16.5;

type RGB = [number, number, number];
const rgb = (h: number): RGB => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
const mix = (a: RGB, b: RGB, k: number): RGB => [
  a[0] + (b[0] - a[0]) * k,
  a[1] + (b[1] - a[1]) * k,
  a[2] + (b[2] - a[2]) * k,
];
const mul = (a: RGB, m: readonly number[]): RGB => [a[0] * m[0], a[1] * m[1], a[2] * m[2]];

/** 画一帧日钟 → 1 倍 RGBA（N × N+1） */
export function drawClock(d: ClockData): { w: number; h: number; px: Uint8ClampedArray<ArrayBuffer> } {
  const w = N;
  const h = N + 1;
  const px = new Uint8ClampedArray(w * h * 4);
  const solid = new Uint8Array(w * h);
  const put = (x: number, y: number, c: RGB, a = 255) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = (y * w + x) * 4;
    px[i] = c[0];
    px[i + 1] = c[1];
    px[i + 2] = c[2];
    px[i + 3] = a;
    solid[y * w + x] = a === 255 ? 1 : 0;
  };
  const look = d.look;
  const top = rgb(look.skyTop);
  const hor = rgb(look.skyHorizon);
  const lit = look.lit;
  const night = look.moon;
  const wet = d.weather === 'overcast' || d.weather === 'rain';
  // 阴雨天：天往冷灰收
  const grey = mul(rgb(KEYS.s), lit);
  const top2 = wet ? mix(top, grey, 0.7) : top;
  const hor2 = wet ? mix(hor, grey, 0.7) : hor;

  // ── 天：四条平涂色带 ──
  const skyAt = (y: number): RGB => {
    const t = Math.min(1, Math.max(0, (y + 0.5 - (C - R_SKY)) / (2 * R_SKY)));
    const band = Math.min(3, Math.floor(t * 4));
    // 只往地平线色走一半：天在小圆里要够蓝，白云才读得出来
    return mix(top2, hor2, band / 8);
  };
  const inSky = (x: number, y: number) => Math.hypot(x + 0.5 - C, y + 0.5 - C) <= R_SKY;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (inSky(x, y)) put(x, y, skyAt(y));

  // ── 太阳 / 月亮 / 星星 ──
  const hr = d.hour;
  if (!night && hr > 5.6 && hr < 18.9) {
    const k = Math.min(1, Math.max(0, (hr - 6) / 12.5));
    const th = Math.PI * k;
    const sx = Math.round(C - 0.5 - 8.5 * Math.cos(th));
    const sy = Math.round(C + 2 - 10 * Math.sin(th));
    const low = Math.sin(th) < 0.35;
    const body = rgb(low ? KEYS.R : KEYS.Y);
    const core = rgb(low ? KEYS.Y : KEYS.W);
    for (let y = -3; y <= 3; y++)
      for (let x = -3; x <= 3; x++) {
        const r = Math.hypot(x, y);
        if (r > 3.1) continue;
        const X = sx + x;
        const Y = sy + y;
        if (!inSky(X, Y)) continue;
        put(X, Y, r < 1.6 && x <= 0 && y <= 0 ? core : body);
      }
  } else {
    // 三颗星（十字小星）
    if (look.stars > 0.2)
      for (const [x, y, big] of [
        [24, 11, 1],
        [27, 17, 0],
        [20, 15, 0],
      ] as const) {
        put(x, y, rgb(KEYS.W));
        if (big)
          for (const [dx, dy] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ])
            put(x + dx, y + dy, rgb(KEYS.w));
      }
    // 月亮：左上，一弯（手画的格子）
    const MOON = ['..WWW..', '.WWw...', 'WWw....', 'WWw....', 'WWw....', '.WWw...', '..WWW..'];
    MOON.forEach((r, y) => {
      for (let x = 0; x < r.length; x++) if (r[x] !== '.') put(12 + x, 10 + y, rgb(KEYS[r[x]]));
    });
  }

  // ── 云：下半圈一团一团（天气越阴越多），颜色乘这一刻的亮档（傍晚变橙、夜里变靛） ──
  // 云跟着时刻染色（傍晚橙、夜里靛）；阴雨天的云是扁平的灰蓝，不吃暮色（不然像火山），只在夜里压暗
  const tint = wet && !night ? [1, 1, 1] : lit;
  // 晴天的云：纯白顶 + 冷灰淡紫的底（不是米黄：米黄的云和沙地连成一片）
  const cloudLit = mul(rgb(wet ? KEYS.S : KEYS.Z), tint);
  const cloudShade = mul(rgb(wet ? KEYS.s : KEYS.z), tint);
  const puffs: [number, number, number][] = [];
  const amount = d.weather === 'clear' || d.weather === 'dust' ? 0 : d.weather === 'cloudy' ? 1 : 2;
  // 一条起伏的云堤：几团高低不一，顶边是一个个鼓包
  puffs.push(
    [C - 9, C + 7, 2.4],
    [C - 5, C + 5.5, 3.0],
    [C - 1, C + 7, 2.6],
    [C + 3, C + 5, 3.2],
    [C + 8, C + 6.5, 2.8],
    [C, C + 11, 5],
  );
  if (amount >= 1) puffs.push([C - 9, C + 4, 2.6], [C + 5, C + 4, 3.0], [C - 2, C + 5, 3.4]);
  // 阴、雨：一条平的云带压在上半（不往上堆成尖）
  if (amount >= 2)
    puffs.push(
      [C - 8, C + 1, 3.0],
      [C - 3, C, 3.2],
      [C + 2, C + 1, 3.0],
      [C + 7, C, 3.0],
      [C - 5, C - 3, 2.6],
      [C + 4, C - 3, 2.6],
    );
  // 晴天右上一条细云
  if (amount === 0 && !night)
    for (let x = 0; x < 5; x++) {
      put(C + 3 + x, C - 6, cloudLit);
      if (x > 0 && x < 4) put(C + 2 + x, C - 7, cloudLit);
    }
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      if (!inSky(x, y)) continue;
      let best = 99;
      let byCenter = 0;
      for (const [cx, cy, r] of puffs) {
        const q = Math.hypot(x + 0.5 - cx, (y + 0.5 - cy) * 1.15) - r;
        if (q < best) {
          best = q;
          byCenter = y + 0.5 - cy;
        }
      }
      if (best > 0) continue;
      // 云堤下半截是影（白顶、淡紫底，同参考）
      put(x, y, y + 0.5 > C + 7.5 || (best > -1.1 && byCenter > 1.5) ? cloudShade : cloudLit);
    }
  // 雨丝 / 风沙
  // 雨：三条斜线（不撒点）
  if (d.weather === 'rain')
    for (const x0 of [C - 6, C, C + 6])
      for (let k = 0; k < 5; k++) {
        const x = x0 - Math.floor(k / 2);
        const y = C + 3 + k;
        if (inSky(x, y)) put(x, y, rgb(KEYS.c));
      }
  if (d.weather === 'dust')
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) if (inSky(x, y) && y > C + 2 && (x * 3 + y) % 5 < 2) put(x, y, mul(rgb(KEYS.X), lit));

  // ── 内圈描边、外圈的一天进度、外描边 ──
  // 营业时段一圈：OPEN 点在正上方，CLOSE 点回到正上方；关门以后满圈、开门以前空圈
  const h24 = ((hr % 24) + 24) % 24;
  const prog = h24 < OPEN ? 0 : Math.min(1, (h24 - OPEN) / (CLOSE - OPEN));
  // 外环 3 纹素：没走过的 = 半透明墨（任何地面上都看得清），走过的 = 金（外侧一纹素深一档）；没有黑外框
  const track: RGB = rgb(INK);
  const gold = rgb(KEYS.Y);
  const goldDark = rgb(KEYS.y);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const r = Math.hypot(x + 0.5 - C, y + 0.5 - C);
      if (r <= R_SKY || r > R_RING) continue;
      // 角度：正上方 0，顺时针
      let a = Math.atan2(x + 0.5 - C, -(y + 0.5 - C)) / (Math.PI * 2);
      if (a < 0) a += 1;
      if (a <= prog) put(x, y, r > R_RING - 1 ? goldDark : gold);
      else put(x, y, track, 120);
    }
  // "现在"：进度弧的端头一个 3×3 的奶油点，1 纹素墨边（可以出环 1 纹素）
  if (prog > 0 && prog < 1) {
    const a = prog * Math.PI * 2;
    const rr = (R_SKY + R_RING) / 2;
    const cx = Math.round(C + Math.sin(a) * rr - 0.5);
    const cy = Math.round(C - Math.cos(a) * rr - 0.5);
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const edge = Math.abs(dx) === 2 || Math.abs(dy) === 2;
        if (edge && Math.abs(dx) === 2 && Math.abs(dy) === 2) continue;
        put(cx + dx, cy + dy, edge ? rgb(INK) : rgb(KEYS.W));
      }
  }
  return { w, h, px };
}

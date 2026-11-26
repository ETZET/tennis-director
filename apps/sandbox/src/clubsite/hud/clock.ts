// 日钟（左上）：一个像素画的圆，里面是这一刻的天（天色四条色带、太阳沿着弧从左升到右落、傍晚橙、夜里月亮和星星、
// 云按天气多少、雨丝、风沙），外圈是一天的进度（金色弧从正上方 0 点顺时针走），底下一个网球小徽章；圆下面一行很短的日期。
// 数据从 clubsite/daylight 读（look = 这一刻的光、total = 时钟）；点它 → 展开原来的时刻和天气面板（daylight/hud.ts）。
// 画在 1 倍小 canvas 上（36×37 纹素），CSS 整数倍放大。
import type { DayLook, Weather } from '../daylight/sky';
import { INK, INK_SHADOW, KEYS } from './colors';
import { rasterize } from './sprite';

export interface ClockData {
  /** 时刻（0..24） */
  hour: number;
  look: DayLook;
  weather: Weather;
}

const N = 36;
const C = N / 2;
const R_SKY = 11;
const R_RIM = 12;
const R_RING = 15;
const R_OUT = 16;

type RGB = [number, number, number];
const rgb = (h: number): RGB => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
const mix = (a: RGB, b: RGB, k: number): RGB => [
  a[0] + (b[0] - a[0]) * k,
  a[1] + (b[1] - a[1]) * k,
  a[2] + (b[2] - a[2]) * k,
];
const mul = (a: RGB, m: readonly number[]): RGB => [a[0] * m[0], a[1] * m[1], a[2] * m[2]];

/** 网球小徽章（复用心情泡的网球字形，去掉气泡）：7×7 + 描边 */
let badge: { w: number; h: number; px: Uint8ClampedArray<ArrayBuffer> } | null = null;
function ballBadge() {
  if (badge) return badge;
  const rows = ['..GGG..', '.GGWGg.', 'GGWGGgg', 'GGWGggg', 'GGGWggg', '.gggWg.', '..ghh..'];
  badge = rasterize({ rows }, true, false);
  return badge;
}

/** 画一帧日钟 → 1 倍 RGBA（N × N+1） */
export function drawClock(d: ClockData): { w: number; h: number; px: Uint8ClampedArray<ArrayBuffer> } {
  const w = N;
  const h = N + 1;
  const px = new Uint8ClampedArray(w * h * 4);
  const solid = new Uint8Array(w * h);
  const put = (x: number, y: number, c: RGB) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = (y * w + x) * 4;
    px[i] = c[0];
    px[i + 1] = c[1];
    px[i + 2] = c[2];
    px[i + 3] = 255;
    solid[y * w + x] = 1;
  };
  const look = d.look;
  const top = rgb(look.skyTop);
  const hor = rgb(look.skyHorizon);
  const lit = look.lit;
  const night = look.moon;
  const wet = d.weather === 'overcast' || d.weather === 'rain';

  // ── 天：四条色带 ──
  const skyAt = (y: number): RGB => {
    const t = Math.min(1, Math.max(0, (y + 0.5 - (C - R_SKY)) / (2 * R_SKY)));
    const band = Math.min(3, Math.floor(t * 4));
    // 只往地平线色走一半：天在小圆里要够蓝，白云才读得出来
    return mix(top, hor, band / 6);
  };
  const inSky = (x: number, y: number) => Math.hypot(x + 0.5 - C, y + 0.5 - C) <= R_SKY;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (inSky(x, y)) put(x, y, skyAt(y));

  // ── 太阳 / 月亮 / 星星 ──
  const hr = d.hour;
  if (!night && hr > 5.6 && hr < 18.9) {
    const k = Math.min(1, Math.max(0, (hr - 6) / 12.5));
    const th = Math.PI * k;
    const sx = Math.round(C - 0.5 - 7.5 * Math.cos(th));
    const sy = Math.round(C + 2 - 9 * Math.sin(th));
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
    // 星星（固定的几颗，按 look.stars 出）
    if (look.stars > 0.2) {
      const STARS: [number, number][] = [
        [11, 10],
        [22, 8],
        [26, 14],
        [14, 16],
        [24, 20],
        [9, 18],
        [19, 12],
      ];
      for (const [x, y] of STARS) if (inSky(x, y)) put(x, y, rgb(KEYS.W));
    }
    // 月亮：左上，一弯（手画的格子）
    const MOON = ['..WWW..', '.WWw...', 'WWw....', 'WWw....', 'WWw....', '.WWw...', '..WWW..'];
    MOON.forEach((r, y) => {
      for (let x = 0; x < r.length; x++) if (r[x] !== '.') put(12 + x, 9 + y, rgb(KEYS[r[x]]));
    });
  }

  // ── 云：下半圈一团一团（天气越阴越多），颜色乘这一刻的亮档（傍晚变橙、夜里变靛） ──
  const cloudLit = mul(rgb(KEYS.W), lit);
  const cloudShade = mul(rgb(wet ? KEYS.s : KEYS.w), lit);
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
  if (amount >= 2)
    puffs.push([C - 6, C, 3.2], [C + 2, C - 1, 3.6], [C + 8, C + 1, 2.8], [C - 3, C - 5, 3.0], [C + 4, C - 6, 2.8]);
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
  if (d.weather === 'rain')
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        // 稀稀的短雨丝：每条 2 纹素，斜着
        const k = (x * 5 + y * 3) % 17;
        if (inSky(x, y) && y > C - 4 && (k === 0 || k === 3)) put(x, y, rgb(KEYS.A));
      }
  if (d.weather === 'dust')
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) if (inSky(x, y) && y > C + 2 && (x * 3 + y) % 5 < 2) put(x, y, mul(rgb(KEYS.X), lit));

  // ── 内圈描边、外圈的一天进度、外描边 ──
  const prog = (((hr % 24) + 24) % 24) / 24;
  const track: RGB = rgb(0x4a4670);
  const trackDark: RGB = rgb(INK);
  const gold = rgb(KEYS.Y);
  const goldDark = rgb(KEYS.y);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const r = Math.hypot(x + 0.5 - C, y + 0.5 - C);
      if (r <= R_SKY) continue;
      if (r <= R_RIM) {
        put(x, y, rgb(INK));
        continue;
      }
      if (r <= R_RING) {
        // 角度：正上方 0，顺时针
        let a = Math.atan2(x + 0.5 - C, -(y + 0.5 - C)) / (Math.PI * 2);
        if (a < 0) a += 1;
        const outer = r > R_RING - 1;
        if (a <= prog) put(x, y, outer ? goldDark : gold);
        else put(x, y, outer ? trackDark : track);
        continue;
      }
      if (r <= R_OUT) put(x, y, rgb(INK));
    }
  // 指针头：进度弧的末端一点奶油色
  {
    const a = prog * Math.PI * 2;
    const rr = (R_RIM + R_RING) / 2;
    put(Math.floor(C + Math.sin(a) * rr), Math.floor(C - Math.cos(a) * rr), rgb(KEYS.W));
  }
  // 网球徽章：压在外圈正下方
  {
    const b = ballBadge();
    const ox = Math.floor(C - b.w / 2);
    const oy = N - b.h + 1;
    for (let y = 0; y < b.h; y++)
      for (let x = 0; x < b.w; x++) {
        const i = (y * b.w + x) * 4;
        if (b.px[i + 3]) put(ox + x, oy + y, [b.px[i], b.px[i + 1], b.px[i + 2]]);
      }
  }
  // 投影：往下 1 纹素
  for (let y = h - 1; y > 0; y--)
    for (let x = 0; x < w; x++) if (!solid[y * w + x] && solid[(y - 1) * w + x]) put(x, y, rgb(INK_SHADOW));
  return { w, h, px };
}

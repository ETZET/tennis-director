// 日钟（左上）：一个像素画的圆，里面是这一刻的天（天色四条色带、太阳沿着弧从左升到右落、傍晚橙、夜里月亮和星星、
// 云按天气多少、雨丝、风沙），外圈是营业时段的进度（OPEN 点从正上方起顺时针走到 CLOSE 点一圈；已过的金色、没过的深墨，
// 一颗小网球骑在环上是"现在"，不进天空窗）；
// 圆下面一行很短的日期。数据从 clubsite/daylight 读（look = 这一刻的光、total = 时钟）。
// 画在 1 倍小 canvas 上（42×43 纹素），CSS 整数倍放大。
import type { DayLook, Weather } from '../daylight/sky';
import { INK, INK_SHADOW, KEYS, PALE_SUN } from './colors';

export interface ClockData {
  /** 时刻（0..24） */
  hour: number;
  look: DayLook;
  weather: Weather;
}

/** 营业时段（日钟外圈一圈）：6 点开门、22 点关门 */
export const OPEN = 6;
export const CLOSE = 22;

/** 太阳：干草的亮档（淡黄） */
const SUN = PALE_SUN;

const N = 42;
const C = N / 2;
/**
 * 日钟环（第三轮定死，见 redo-ui.md「第三轮」的 locked）：天 → 1 纹素墨线 → 2 纹素实心轨道（没走过 = 墨，走过 = 奶油）→ 1 纹素墨线，
 * 下面 1 纹素深影。两条墨线把奶油进度夹在中间：亮地面上奶油不会融进沙地，暗地面上墨轨道外面还有奶油进度可看。
 */
const R_SKY = 13.5;
const R_GAP = 14.5;
const R_RING = 16.5;
const R_OUT = 17.5;
/** 外面再 1 纹素奶油细边（同右下按钮的底板）：暗地面（沥青、夜里）上钟不沉下去 */
const R_RIM = 18.5;

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
  if (!night && !wet && hr > 5.6 && hr < 18.9) {
    const k = Math.min(1, Math.max(0, (hr - 6) / 12.5));
    const th = Math.PI * k;
    const sx = Math.round(C - 0.5 - 8 * Math.cos(th));
    const sy = Math.round(C + 2 - 9.5 * Math.sin(th));
    const low = Math.sin(th) < 0.35;
    // 淡黄的太阳（干草的亮档），比草帽淡：界面不抢画面的焦点色
    const body = rgb(low ? KEYS.R : SUN);
    const core = rgb(KEYS.W);
    for (let y = -3; y <= 3; y++)
      for (let x = -3; x <= 3; x++) {
        const r = Math.hypot(x, y);
        if (r > 3.1) continue;
        const X = sx + x;
        const Y = sy + y;
        if (!inSky(X, Y)) continue;
        put(X, Y, r < 1.6 && x <= 0 && y <= 0 ? core : body);
      }
  } else if (!wet) {
    // 阴雨天不画太阳也不画月亮（云压着）
    // 三颗星（十字小星）
    if (look.stars > 0.2)
      for (const [x, y, big] of [
        [26, 13, 1],
        [29, 19, 0],
        [22, 17, 0],
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
      for (let x = 0; x < r.length; x++) if (r[x] !== '.') put(14 + x, 12 + y, rgb(KEYS[r[x]]));
    });
  }

  // ── 云：下半圈一团一团（天气越阴越多），颜色乘这一刻的亮档（傍晚变橙、夜里变靛） ──
  // 云跟着时刻染色（傍晚橙、夜里靛）；阴雨天的云是扁平的灰蓝，不吃暮色（不然像火山），只在夜里压暗
  const tint = wet && !night ? [1, 1, 1] : lit;
  // 晴天的云：纯白顶 + 冷灰淡紫的底（不是米黄：米黄的云和沙地连成一片）
  const cloudLit = mul(rgb(wet ? KEYS.S : KEYS.Z), tint);
  // 云底：白往天色走三分之一（冷灰蓝），不是淡紫
  const cloudShade = wet ? mul(rgb(KEYS.s), tint) : mix(cloudLit, top2, 0.35);
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
  // 雨：四条 1 纹素的斜线（白蓝），不撒点
  if (d.weather === 'rain')
    for (const x0 of [C - 7, C - 2, C + 3, C + 8])
      for (let k = 0; k < 4; k++) {
        const x = x0 - Math.floor(k / 2);
        const y = C + 2 + k + (x0 % 2);
        if (inSky(x, y)) put(x, y, rgb(KEYS.A));
      }
  if (d.weather === 'dust')
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) if (inSky(x, y) && y > C + 2 && (x * 3 + y) % 5 < 2) put(x, y, mul(rgb(KEYS.X), lit));

  // ── 内圈描边、外圈的一天进度、外描边 ──
  // 营业时段一圈：OPEN 点在正上方，CLOSE 点回到正上方；关门以后满圈、开门以前空圈
  const h24 = ((hr % 24) + 24) % 24;
  /** 营业中：开门到关门之间；关着门（夜里、清早）整圈墨色，"现在"钮停在正上方（开门的地方） */
  const open = h24 >= OPEN && h24 < CLOSE;
  const prog = open ? (h24 - OPEN) / (CLOSE - OPEN) : 0;
  // 轨道 2 纹素实心：没走过的 = 墨，走过的 = 奶油；里外各一条 1 纹素墨线；最外一圈 1 纹素奶油细边
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const r = Math.hypot(x + 0.5 - C, y + 0.5 - C);
      if (r <= R_SKY || r > R_RIM) continue;
      if (r > R_OUT) {
        put(x, y, rgb(KEYS.W));
        continue;
      }
      if (r <= R_GAP || r > R_RING) {
        put(x, y, rgb(INK));
        continue;
      }
      // 角度：正上方 0，顺时针
      let a = Math.atan2(x + 0.5 - C, -(y + 0.5 - C)) / (Math.PI * 2);
      if (a < 0) a += 1;
      put(x, y, open && a <= prog ? rgb(KEYS.W) : rgb(INK));
    }
  // 下面 1 纹素深影（只往下偏，同按钮底板）
  for (let x = 0; x < N; x++)
    for (let y = h - 1; y > 0; y--) {
      if (solid[y * w + x]) break;
      if (solid[(y - 1) * w + x]) {
        put(x, y, rgb(INK_SHADOW));
        break;
      }
    }
  // "现在"：一颗白钮，3 纹素宽、5 纹素长，沿半径方向从轨道里一直伸到奶油细边外 1 纹素 —— 不管轨道是墨还是奶油都看得见；
  // 外面一圈墨。关着门时停在正上方
  {
    const a = prog * Math.PI * 2;
    const ux = Math.sin(a);
    const uy = -Math.cos(a);
    const pts: [number, number][] = [];
    for (let t = R_GAP + 0.5; t <= R_RIM + 1.01; t += 0.5)
      for (const side of [-1, 0, 1]) pts.push([C - 0.5 + ux * t - uy * side, C - 0.5 + uy * t + ux * side]);
    const core = new Set<string>();
    for (const [fx, fy] of pts) core.add(`${Math.round(fx)},${Math.round(fy)}`);
    const edge = new Set<string>();
    for (const k of core) {
      const [cx, cy] = k.split(',').map(Number);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const kk = `${cx + dx},${cy + dy}`;
          if (!core.has(kk)) edge.add(kk);
        }
    }
    for (const k of edge) {
      const [x, y] = k.split(',').map(Number);
      put(x, y, rgb(INK));
    }
    for (const k of core) {
      const [x, y] = k.split(',').map(Number);
      put(x, y, rgb(0xffffff));
    }
  }
  return { w, h, px };
}

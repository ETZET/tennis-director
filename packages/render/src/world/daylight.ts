import * as THREE from 'three';
import { LIGHT_UNIT } from './color';
import type { Stage } from './stage';

/**
 * 一天的光（参考图 Palm Oasis，2026-11-02）：画出来的天空和三道山脊放在透明画布后面，
 * 半球光和太阳光跟着游戏时钟在早晨 → 白天 → 黄昏 → 夜里之间渐变。没有阴影，层次靠方块的明暗和抖色。
 *
 * 只读时间和雨量，不碰模拟。背景是一张 SVG，只在颜色明显变了的时候重画（每 10 游戏分钟左右一次）。
 */

interface Key {
  /** 一天中的分钟 */
  at: number;
  hemi: [string, string, number];
  sun: [string, number];
  /** 太阳方向（只决定明暗面，没有阴影） */
  sunPos: [number, number, number];
  sky: [string, string, string];
  mtn: [string, string, string];
  snow: string;
  /** 0 没有星星 .. 1 满天 */
  star: number;
  /** 背景里太阳（月亮）的颜色和位置（0..1，横、竖） */
  disc: [string, number, number];
  /** 球场灯 0 关 .. 1 全亮 */
  lamps: number;
}

const MORNING: Key = {
  at: 8 * 60,
  hemi: ['#fde6cf', '#8a6c62', 0.76],
  sun: ['#ffd6a0', 0.7],
  sunPos: [90, 40, -20],
  sky: ['#6c8fc8', '#e8b49a', '#ffe0b0'],
  mtn: ['#c49a8a', '#a07c88', '#7c6a8a'],
  snow: '#ffe8dc',
  star: 0,
  disc: ['#fff0c0', 0.82, 0.7],
  lamps: 0,
};
const DAY: Key = {
  at: 10 * 60 + 30,
  hemi: ['#f4ecdc', '#a88a64', 0.8],
  sun: ['#fff4e0', 0.55],
  sunPos: [20, 90, 30],
  sky: ['#5fa2dc', '#9cc8ea', '#d8ecf4'],
  mtn: ['#b9a08e', '#a38a8c', '#8a7f96'],
  snow: '#f4f2f0',
  star: 0,
  disc: ['#fff8d8', 0.62, 0.22],
  lamps: 0,
};
const DUSK: Key = {
  at: 18 * 60 + 15,
  hemi: ['#ffd8c0', '#6a5068', 0.74],
  sun: ['#ffa468', 0.95],
  sunPos: [-90, 28, 10],
  sky: ['#3a3a72', '#c86a7a', '#ffb070'],
  mtn: ['#c27a7a', '#8a5a7a', '#5a4a6a'],
  snow: '#ffd8d0',
  star: 0,
  disc: ['#ffd27a', 0.15, 0.78],
  lamps: 0.35,
};
const NIGHT: Key = {
  at: 19 * 60 + 40,
  hemi: ['#5a6aa0', '#2a2030', 0.42],
  sun: ['#8090c0', 0.2],
  sunPos: [30, 80, -40],
  sky: ['#0b1028', '#1c1f44', '#3a2f58'],
  mtn: ['#2c2842', '#221f38', '#1a182c'],
  snow: '#6a6a88',
  star: 1,
  disc: ['#f0f0ff', 0.78, 0.16],
  lamps: 1,
};
/** 关键帧（按时间排好）：午后一直是白天，16:30 起往黄昏走；20:00 收盘前已经入夜、球场灯全亮 */
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

const c1 = new THREE.Color();
const c2 = new THREE.Color();
function mix(a: string, b: string, u: number): string {
  return `#${c1.set(a).lerp(c2.set(b), u).getHexString()}`;
}
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;

/** 一天中某一分钟的光（关键帧之间线性插值） */
export function daylightAt(minute: number): Key {
  const m = ((minute % 1440) + 1440) % 1440;
  let i = 0;
  while (i < KEYS.length - 2 && (KEYS[i + 1] as Key).at <= m) i++;
  const a = KEYS[i] as Key;
  const b = KEYS[i + 1] as Key;
  const u = b.at > a.at ? (m - a.at) / (b.at - a.at) : 0;
  const m3 = <T extends [string, string, string]>(x: T, y: T) =>
    [mix(x[0], y[0], u), mix(x[1], y[1], u), mix(x[2], y[2], u)] as T;
  return {
    at: m,
    hemi: [mix(a.hemi[0], b.hemi[0], u), mix(a.hemi[1], b.hemi[1], u), lerp(a.hemi[2], b.hemi[2], u)],
    sun: [mix(a.sun[0], b.sun[0], u), lerp(a.sun[1], b.sun[1], u)],
    sunPos: [lerp(a.sunPos[0], b.sunPos[0], u), lerp(a.sunPos[1], b.sunPos[1], u), lerp(a.sunPos[2], b.sunPos[2], u)],
    sky: m3(a.sky, b.sky),
    mtn: m3(a.mtn, b.mtn),
    snow: mix(a.snow, b.snow, u),
    star: lerp(a.star, b.star, u),
    disc: [mix(a.disc[0], b.disc[0], u), lerp(a.disc[1], b.disc[1], u), lerp(a.disc[2], b.disc[2], u)],
    lamps: lerp(a.lamps, b.lamps, u),
  };
}

/* ---------- 背景：天空渐变、太阳、星星、三道山脊（像素化的台阶轮廓） ---------- */

function mulberry(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function ridge(seed: number, base: number, amp: number, step: number): number[] {
  const pts: number[] = [];
  const r = mulberry(seed);
  let y = base;
  for (let x = 0; x <= 2000; x += step) {
    y = Math.min(base + amp * 0.6, Math.max(base - amp * 2.2, y + (r() - 0.5) * amp));
    pts.push(x, Math.round(y / 4) * 4);
  }
  return pts;
}
const RIDGES = [ridge(7, 330, 70, 40), ridge(19, 400, 48, 30), ridge(31, 460, 30, 24)];
const STARS = (() => {
  const r = mulberry(5);
  return Array.from({ length: 160 }, () => ({
    x: r() * 2000,
    y: r() * 520,
    s: r() < 0.15 ? 6 : 3,
    o: 0.4 + r() * 0.6,
  }));
})();

export function backdropSvg(k: Key): string {
  const [sun, sx0, sy0] = k.disc;
  const sx = Math.round(sx0 * 2000);
  const sy = Math.round(sy0 * 1000);
  let s = `<svg viewBox="0 0 2000 1000" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" style="position:absolute;left:-50%;top:0;width:200%;height:100%;display:block"><defs><linearGradient id="td-sk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${k.sky[0]}"/><stop offset="0.45" stop-color="${k.sky[1]}"/><stop offset="0.75" stop-color="${k.sky[2]}"/></linearGradient></defs><rect width="2000" height="1000" fill="url(#td-sk)"/>`;
  if (k.star > 0.02)
    for (const t of STARS)
      s += `<rect x="${t.x.toFixed(0)}" y="${t.y.toFixed(0)}" width="${t.s}" height="${t.s}" fill="#fff" opacity="${(t.o * k.star).toFixed(2)}"/>`;
  s += `<rect x="${sx - 40}" y="${sy - 40}" width="80" height="80" fill="${sun}"/><rect x="${sx - 56}" y="${sy - 24}" width="112" height="48" fill="${sun}"/><rect x="${sx - 24}" y="${sy - 56}" width="48" height="112" fill="${sun}"/>`;
  RIDGES.forEach((pts, i) => {
    let d = 'M0 1000 ';
    for (let j = 0; j < pts.length; j += 2) {
      d += `L${pts[j]} ${pts[j + 1]} `;
      if (j + 2 < pts.length) d += `L${pts[j + 2]} ${pts[j + 1]} `;
    }
    s += `<path d="${d}L2000 1000 Z" fill="${k.mtn[i]}"/>`;
    if (i === 0)
      for (let j = 0; j < pts.length; j += 2)
        if ((pts[j + 1] as number) < 300)
          s += `<rect x="${pts[j]}" y="${pts[j + 1]}" width="40" height="14" fill="${k.snow}"/>`;
  });
  return `${s}</svg>`;
}

export interface Daylight {
  /** minute：一天中的分钟（可以带零头）；rain 0..1 */
  update(minute: number, rain: number): void;
  /** 当前球场灯亮度 0..1（夜里给灯杆、光池用） */
  lamps(): number;
}

/**
 * 透明画布后面挂一张背景（插在容器最前面），每帧按游戏时钟设灯。
 * 雨天整体压暗、去饱和（原来 rain.ts 改天色的那一套由这里接管：雨只给出 0..1）。
 */
export function createDaylight(stage: Stage): Daylight {
  const bg = document.createElement('div');
  bg.className = 'td-backdrop';
  bg.setAttribute('aria-hidden', 'true');
  Object.assign(bg.style, { position: 'absolute', inset: '0', zIndex: '0', overflow: 'hidden', pointerEvents: 'none' });
  stage.container.insertBefore(bg, stage.container.firstChild);
  const cv = stage.renderer.domElement;
  cv.style.position = 'relative';
  cv.style.zIndex = '1';
  stage.renderer.setClearColor(0x000000, 0);
  stage.scene.fog = null;
  let drawn = -999;
  let lamp = 0;
  let lastRain = -1;
  return {
    update(minute, rain) {
      const k = daylightAt(minute);
      lamp = k.lamps;
      const dim = 1 - 0.38 * rain;
      stage.hemi.color.set(k.hemi[0]);
      stage.hemi.groundColor.set(k.hemi[1]);
      stage.hemi.intensity = k.hemi[2] * dim * LIGHT_UNIT;
      stage.sun.color.set(k.sun[0]);
      stage.sun.intensity = k.sun[1] * (1 - 0.6 * rain) * LIGHT_UNIT;
      stage.sun.position.set(...k.sunPos);
      // 雨的旧写法会把清屏色设成不透明，这里每帧拨回透明
      stage.renderer.setClearColor(0x000000, 0);
      const m = Math.floor(k.at / 10);
      if (m !== drawn) {
        drawn = m;
        bg.innerHTML = backdropSvg(k);
      }
      const r = Math.round(rain * 20) / 20;
      if (r !== lastRain) {
        lastRain = r;
        bg.style.filter = r > 0 ? `saturate(${1 - 0.6 * r}) brightness(${1 - 0.3 * r})` : '';
      }
    },
    lamps: () => lamp,
  };
}

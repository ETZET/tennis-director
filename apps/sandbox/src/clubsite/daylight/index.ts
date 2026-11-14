// 时间和天气（所有俱乐部场景共用）：一个时钟 + 天气，每帧把这一刻的光写进
// - 太阳（DirectionalLight 的方向 → 着色和投影一起转；人、树、灯杆的影子跟着时刻变长变短、换方向；夜里换成月亮），
// - 材质（SharedUniforms.day：三档颜色乘子、直射强度、着色抬光、云量、灯光圈），
// - 天空背景（4 条色带）、轮廓色、风、云速，
// - 管线最后一步的雨、风沙、星星（pipe.atmo）。
// 光的表在 sky.ts（纯函数），自动天气在 weather.ts，左上角的时间面板在 hud.ts。
//
// 接入（场景 main.ts，画廊不接）：
//   const day = mountDaylight({ scene, pipe, sun, uniforms, params, scheme, hud: pxEl });
//   固定步长里：day.step(DT)；每帧 pipe.render 之前：day.frame()
//   太阳的位置默认 = sun.target + 方向 × 80 米；阴影相机跟着人走、要按纹素对齐的（clubwalk）传 placeSun。
// URL：hour=<0..24>（开局时刻，默认 12 = 原来的样子）、weather=auto|clear|cloudy|overcast|rain|dust（默认 auto）、
//      tspeed=<游戏秒/真实秒>（默认 120：真实 30 秒 = 游戏 1 小时；0 = 时间停着）、wseed=<天气种子>、day=0（整个关掉 = 以前的正午）；
//      带 sunel / sunaz 时太阳留在场景摆的位置（只换颜色）。
import * as THREE from 'three';
import type { SharedUniforms } from '../render/ctx';
import type { Scheme } from '../render/palettes';
import type { PixelPipeline } from '../render/pipeline';
import { createDayUniforms, LAMP_N } from '../render/toon';
import { mountDayHud } from './hud';
import { type DayLook, WEATHERS, type Weather, wrapHour } from './sky';
import { autoWeather, lookAt } from './weather';

export type { DayLook, Weather } from './sky';
export { clockText, periodName, WEATHER_NAME, WEATHERS } from './sky';

export interface DaylightOpts {
  scene: THREE.Scene;
  pipe: PixelPipeline;
  sun: THREE.DirectionalLight;
  uniforms: SharedUniforms;
  params: URLSearchParams;
  /** 配色方案（null = ?pal=current 原来的沙漠配色） */
  scheme: Scheme | null;
  /** 没有配色方案时的天色、轮廓色（原来各场景的） */
  sky?: { top: number; horizon: number };
  /** 太阳放哪（给方向，单位向量，从地面指向太阳）；默认放在 sun.target 沿方向 sunDist 米 */
  placeSun?: (dir: THREE.Vector3) => void;
  sunDist?: number;
  /** 时间面板挂在哪（左上角像素级别那一栏）；null = 不要面板 */
  hud?: HTMLElement | null;
}

export interface Daylight {
  /** 从第 0 天 0 点起的小时数（时钟）；时刻 = wrapHour(total) */
  total: number;
  weather: Weather | 'auto';
  /** 游戏秒 / 真实秒 */
  speed: number;
  readonly look: DayLook;
  /** 太阳（或月亮）方向：从地面指向光源 */
  readonly sunDir: THREE.Vector3;
  /** 固定步长里调：时钟往前走 */
  step(dt: number): void;
  /** 每帧渲染前调：写 uniform、太阳、天空、管线 */
  frame(): void;
  /** 跳到某个时刻（今天的；小时） */
  setHour(h: number): void;
  setWeather(w: Weather | 'auto'): void;
  /** 场景里加了 / 删了灯（userData.night），马上重新找（默认每 2 秒找一次） */
  rescanLamps(): void;
}

interface NightLight {
  setOn?: (on: boolean) => void;
  pool?: () => [number, number, number, number];
}

const DEFAULT_SKY = { top: 0x5fb0e8, horizon: 0xbfe3f2 };
const DEFAULT_EDGE: [number, number, number] = [0.5, 0.55, 0.78];

export function mountDaylight(o: DaylightOpts): Daylight {
  const { scene, pipe, sun, uniforms, params } = o;
  const num = (k: string, d: number) => (params.has(k) && params.get(k) !== '' ? Number(params.get(k)) : d);
  const enabled = params.get('day') !== '0';
  const fixedSun = params.has('sunel') || params.has('sunaz');
  const day = (uniforms.day ??= createDayUniforms());
  const baseSky = o.scheme?.sky ?? o.sky ?? DEFAULT_SKY;
  const baseEdge = o.scheme?.edgeTint ?? pipe.edges.tint ?? DEFAULT_EDGE;
  const baseSun = sun.color.clone();
  const baseWind = uniforms.uWind.value.clone();
  const baseCloudVel = uniforms.uCloudVel.value.clone();
  const sunDist = o.sunDist ?? 80;
  const wq = params.get('weather');
  const seed = num('wseed', 7);

  const st = {
    total: num('hour', 12),
    weather: (wq && (WEATHERS as string[]).includes(wq) ? wq : 'auto') as Weather | 'auto',
    speed: num('tspeed', 120),
  };
  let fxTime = 0;
  let look: DayLook = lookAt(st.total, st.weather, seed, { sky: baseSky });
  const sunDir = new THREE.Vector3();

  // ── 天空：1 × 64 的色带贴图，颜色变了才重画 ──
  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = 1;
  skyCanvas.height = 64;
  const skyTex = new THREE.CanvasTexture(skyCanvas);
  skyTex.magFilter = skyTex.minFilter = THREE.NearestFilter;
  skyTex.colorSpace = THREE.NoColorSpace;
  let skyKey = '';
  const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
  function drawSky(top: number, horizon: number) {
    const key = `${top}:${horizon}`;
    if (key === skyKey) return;
    skyKey = key;
    const g = skyCanvas.getContext('2d') as CanvasRenderingContext2D;
    const grad = g.createLinearGradient(0, 0, 0, 64);
    grad.addColorStop(0, hex(top));
    grad.addColorStop(1, hex(horizon));
    g.fillStyle = grad;
    g.fillRect(0, 0, 1, 64);
    // 4 条色带（像素画的天空）
    const d = g.getImageData(0, 0, 1, 64);
    for (let i = 0; i < 64; i++) {
      const q = Math.floor(i / 16) * 16 + 8;
      for (let k = 0; k < 3; k++) d.data[i * 4 + k] = d.data[q * 4 + k];
    }
    g.putImageData(d, 0, 0);
    skyTex.needsUpdate = true;
    document.body.style.background = hex(top);
  }

  // ── 灯：场景里 userData.night 的物件（球场灯……）；每 2 秒找一次，每帧挑离镜头最近的 LAMP_N 盏 ──
  let lights: NightLight[] = [];
  let scanT = 0;
  let lampsOn = false;
  function rescanLamps() {
    lights = [];
    scene.traverse((ob) => {
      const n = ob.userData.night as NightLight | undefined;
      if (n) lights.push(n);
    });
    // 新找到的灯（新建的区域）也按现在的状态开关一次
    for (const l of lights) l.setOn?.(lampsOn);
  }
  const pools: [number, number, number, number, number][] = [];
  function placeLamps(k: number) {
    const on = k > 0.35;
    if (on !== lampsOn) {
      lampsOn = on;
      for (const l of lights) l.setOn?.(on);
    }
    const arr = day.uLamps.value;
    for (const v of arr) v.set(0, 0, 0, 0);
    day.uLampK.value = k;
    if (k <= 0) return;
    const t = pipe.rig.target;
    pools.length = 0;
    for (const l of lights) {
      if (!l.pool) continue;
      const [x, z, r, h] = l.pool();
      pools.push([x, z, r, h, (x - t.x) ** 2 + (z - t.z) ** 2]);
    }
    pools.sort((a, b) => a[4] - b[4]);
    for (let i = 0; i < Math.min(LAMP_N, pools.length); i++)
      arr[i].set(pools[i][0], pools[i][1], pools[i][2], pools[i][3]);
  }

  function apply() {
    look = enabled ? lookAt(st.total, st.weather, seed, { sky: baseSky }) : lookAt(12, 'clear', seed, { sky: baseSky });
    const el = THREE.MathUtils.degToRad(look.el);
    const az = THREE.MathUtils.degToRad(look.az);
    sunDir.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
    // URL 里给了 sunel / sunaz（调光用）：太阳不动，只换颜色
    if (fixedSun) sunDir.copy(sun.position).sub(sun.target.position).normalize();
    else if (o.placeSun) o.placeSun(sunDir);
    else sun.position.copy(sun.target.position).addScaledVector(sunDir, sunDist);
    // 月亮：不再染太阳的暖色（夜色全在乘子里）
    if (look.moon) sun.color.setRGB(1, 1, 1);
    else sun.color.copy(baseSun);
    day.uDayLit.value.set(...look.lit);
    day.uDayMid.value.set(...look.mid);
    day.uDayDark.value.set(...look.dark);
    day.uSunK.value = look.sunK;
    // 着色抬光：让着色的有效仰角 = shadeEl（tan e' · cos e − sin e）
    const e = el;
    const e2 = THREE.MathUtils.degToRad(look.shadeEl);
    day.uDayLift.value = Math.max(0, Math.tan(e2) * Math.cos(e) - Math.sin(e));
    day.uCloudCut.value = look.cloudCut;
    day.uDaySat.value = look.sat;
    uniforms.uWind.value.copy(baseWind).multiplyScalar(look.wind);
    uniforms.uCloudVel.value.copy(baseCloudVel).multiplyScalar(look.cloudVel);
    pipe.edges.tint = [baseEdge[0] * look.edgeMul[0], baseEdge[1] * look.edgeMul[1], baseEdge[2] * look.edgeMul[2]];
    const a = pipe.atmo;
    a.rain = look.rain;
    a.dust = look.dust;
    a.dustColor = look.dustColor;
    a.stars = look.stars;
    a.time = fxTime;
    const w = uniforms.uWind.value;
    a.wind = Math.max(-1, Math.min(1, w.x * 1.5 || 0.3));
    drawSky(look.skyTop, look.skyHorizon);
    placeLamps(look.lamps);
  }

  scene.background = skyTex;
  rescanLamps();
  apply();

  const hud = o.hud
    ? mountDayHud(o.hud, {
        get: () => ({
          total: st.total,
          weather: st.weather,
          speed: st.speed,
          current: st.weather === 'auto' ? autoWeather(st.total, seed).to : st.weather,
        }),
        setHour: (h) => api.setHour(h),
        setWeather: (w) => api.setWeather(w),
        setSpeed: (s) => {
          st.speed = s;
        },
      })
    : null;

  const api: Daylight = {
    get total() {
      return st.total;
    },
    set total(v: number) {
      st.total = v;
    },
    get weather() {
      return st.weather;
    },
    set weather(v) {
      st.weather = v;
    },
    get speed() {
      return st.speed;
    },
    set speed(v: number) {
      st.speed = v;
    },
    get look() {
      return look;
    },
    sunDir,
    step(dt: number) {
      st.total += (dt * st.speed) / 3600;
      fxTime += dt;
      scanT -= dt;
      if (scanT <= 0) {
        scanT = 2;
        rescanLamps();
      }
    },
    frame() {
      apply();
      hud?.sync();
    },
    setHour(h: number) {
      const dayStart = Math.floor(st.total / 24) * 24;
      st.total = dayStart + wrapHour(h);
    },
    setWeather(w) {
      st.weather = w;
    },
    rescanLamps,
  };
  return api;
}

// 3D 像素画实验：Indian Wells 荒废球场（t3ssel8r 风格，three.js）。
// URL 参数：px（纹素 CSS 像素，默认 2）、zoom（米/纹素）、yaw/pitch（度）、hour（时刻 0..24）、
//   wind（0..1）、seed、warm（启动时先快进多少秒）、pause=1、edges=1（只看边缘）。
//   描边 dstr/nstr/tstr、dlo/dhi（默认按缩放自动）、edgemode=uniform；阴影 smap/srad/fur/shadow=soft；light=flat；noisek。
// 测试钩子：window.__d3 = { world, pipe, step(seconds), setHour(h) }
import './colors';
import * as THREE from 'three';
import { build as court } from './parts/court';
import { build as fx } from './parts/fx';
import { groundY, build as island } from './parts/island';
import { build as people } from './parts/people';
import { build as plants } from './parts/plants';
import { build as structures } from './parts/structures';
import { PixelPipeline } from './pipeline';
import { createMats, makeNoiseTexture } from './toon';
import type { Part, SharedUniforms, World } from './world';

const params = new URLSearchParams(location.search);
const num = (k: string, d: number) => (params.has(k) ? Number(params.get(k)) : d);
const deg = Math.PI / 180;

/** mulberry32 + 字符串哈希：每个部件一条独立随机流 */
function rngFactory(seed: number) {
  return (stream: string) => {
    let h = seed ^ 0x9e3779b9;
    for (let i = 0; i < stream.length; i++) h = Math.imul(h ^ stream.charCodeAt(i), 0x85ebca6b);
    let a = h >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
}

const rng = rngFactory(num('seed', 7));
const canvas = document.getElementById('c') as HTMLCanvasElement;

const uniforms: SharedUniforms = {
  uTime: { value: 0 },
  uWind: { value: new THREE.Vector2(0.8, 0.35).normalize().multiplyScalar(num('wind', 0.6)) },
  uGust: { value: 0.5 },
  uCloudTex: { value: makeNoiseTexture(128, rng('clouds')) },
  uCloudScale: { value: 1 / 40 },
  uCloudVel: { value: new THREE.Vector2(1.6, 0.7) },
  uCloudStrength: { value: num('clouds', 0.45) },
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe9c99a);

const pipe = new PixelPipeline(canvas, {
  px: num('px', 2),
  fxLayer: 1,
  rig: {
    target: new THREE.Vector3(num('tx', 0), 0, num('tz', 0)),
    yaw: num('yaw', 0) * deg,
    pitch: num('pitch', 45) * deg,
    metersPerTexel: num('zoom', 0.1),
  },
  // 深度阈值不填 → 按 mpt·cot(俯角) 自动算（dlo/dhi 可以手动覆盖）
  edges: {
    depthLo: params.has('dlo') ? num('dlo', 0) : undefined,
    depthHi: params.has('dhi') ? num('dhi', 0) : undefined,
    depthStrength: num('dstr', 0.55),
    normalStrength: num('nstr', 0.6),
    topStrength: num('tstr', 0.35),
    uniformDark: params.get('edgemode') === 'uniform' ? 1 : 0,
  },
});
pipe.showEdges = params.get('edges') === '1';

// 太阳：只决定方向、投影和亮档的色温（颜色由材质的三档色阶决定）。
// 放在画面后方（-z，远离镜头的一侧），仰角最高约 38° → 朝镜头的面统一落暗档、投影落向镜头。
const sun = new THREE.DirectionalLight(0xfff0d8, 1);
sun.castShadow = true;
// 阴影贴图：2048 盖住整个岛（±32 米）→ 每阴影纹素 0.031 米 ≤ 画面纹素（0.1 米）的一半；PCF 半径 4，材质里取阈值
const smap = num('smap', 2048);
sun.shadow.mapSize.set(smap, smap);
Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 140 });
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.04;
sun.shadow.radius = num('srad', 4);
scene.add(sun, sun.target);
// 半球光保留字段（fx 读它的颜色做夜色），但不参与材质光照
const hemi = new THREE.HemisphereLight(0xa9c4e8, 0xb07a4a, 0);
scene.add(hemi);

/** 时刻 → 太阳方向和颜色（简化：6 点日出，19 点日落；方位从东北经正北到西北，始终在画面后方） */
function setHour(h: number) {
  const t = (h - 6) / 13;
  const elev = Math.sin(Math.PI * THREE.MathUtils.clamp(t, 0, 1)) * 32 * deg + 6 * deg;
  const az = (-70 + 140 * t) * deg;
  sun.position.set(Math.sin(az) * Math.cos(elev), Math.sin(elev), -Math.cos(az) * Math.cos(elev)).multiplyScalar(60);
  const warm = 1 - Math.sin(Math.PI * THREE.MathUtils.clamp(t, 0, 1));
  sun.color.setHSL(0.09, 0.6 + 0.3 * warm, 0.82 - 0.12 * warm);
}
setHour(num('hour', 11));

const world: World = {
  scene,
  camera: pipe.camera,
  sun,
  hemi,
  uniforms,
  mats: createMats(uniforms, () => pipe.rig.metersPerTexel),
  rng,
  layers: { FX: 1 },
  play: { phase: 'idle' },
  groundY,
  params,
};

// A/B：fur（影子毛边，0 = 干净）、shadow=soft（不取阈值）、light=flat（暗档只是变暗，不偏色）、noisek（档位噪声倍数）
world.mats.globals.uFur.value = num('fur', 0.8);
world.mats.globals.uShadowHard.value = params.get('shadow') === 'soft' ? 0 : 1;
world.mats.globals.uLightModel.value = params.get('light') === 'flat' ? 1 : 0;
world.mats.globals.uNoiseK.value = num('noisek', 1);

const parts: Part[] = [island, court, structures, plants, fx, people].map((b) => b(world));

function resize() {
  pipe.resize(canvas.clientWidth, canvas.clientHeight, Math.min(devicePixelRatio, 3));
}
addEventListener('resize', resize);
resize();

// 固定步长推进（演出不决定数值；这里只是画面）
const DT = 1 / 60;
let simT = 0;
function step(seconds: number) {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) {
    simT += DT;
    uniforms.uTime.value = simT;
    for (const p of parts) p.update?.(DT, simT);
  }
}
step(num('warm', 0));

const paused = params.get('pause') === '1';
let last = performance.now();
let acc = 0;
function frame(now: number) {
  acc += Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!paused) {
    while (acc >= DT) {
      step(DT);
      acc -= DT;
    }
  }
  pipe.render(scene);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// 拖动平移、滚轮/双指缩放（档位：每纹素 0.1 ~ 0.4 米）
const pointers = new Map<number, { x: number; y: number }>();
let pinch0 = 0;
let zoom0 = pipe.rig.metersPerTexel;
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinch0 = Math.hypot(a.x - b.x, a.y - b.y);
    zoom0 = pipe.rig.metersPerTexel;
  }
});
canvas.addEventListener('pointermove', (e) => {
  const prev = pointers.get(e.pointerId);
  if (!prev) return;
  const cur = { x: e.clientX, y: e.clientY };
  pointers.set(e.pointerId, cur);
  if (pointers.size === 1) {
    const s = pipe.rig.metersPerTexel / pipe.px;
    const dx = (cur.x - prev.x) * s;
    const dy = (cur.y - prev.y) * s;
    const yaw = pipe.rig.yaw;
    const sinP = Math.sin(pipe.rig.pitch);
    // 屏幕右 = 相机右；屏幕上 = 地面上远离相机方向（除以 sin 俯角）
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    pipe.rig.target.x += -dx * rx + (dy / sinP) * fx;
    pipe.rig.target.z += -dx * rz + (dy / sinP) * fz;
  } else if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    pipe.rig.metersPerTexel = THREE.MathUtils.clamp((zoom0 * pinch0) / Math.max(d, 1), 0.08, 0.4);
  }
});
const up = (e: PointerEvent) => pointers.delete(e.pointerId);
canvas.addEventListener('pointerup', up);
canvas.addEventListener('pointercancel', up);
canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    pipe.rig.metersPerTexel = THREE.MathUtils.clamp(pipe.rig.metersPerTexel * Math.exp(e.deltaY * 0.001), 0.08, 0.4);
  },
  { passive: false },
);

Object.assign(window, { __d3: { world, pipe, step, setHour } });

// 池塘 3D 像素画风格研究（照着四张参考截图复刻，见 docs/lab/2026-11-07-3d-pixel/lessons.md）。
// URL 参数（A/B 对比用）：
//   season=summer|spring|autumn|winter   px=2（每纹素 CSS 像素）  zoom=0.0625（米/纹素）
//   pitch=45 yaw=0 tx tz（相机看向）
//   light=ramp|flat|lambert      手挑三档 / 三档但暗档只是变暗 / 连续 Lambert
//   shadow=hard|soft|basic smap=2048 srad=1.5    阴影：PCF 取阈值 / PCF 软边 / BasicShadowMap
//   edges=dir|uniform|off|show   描边：按方向（上沿提亮）/ 全压暗 / 不描 / 只看边
//   noise=0 detail=0 refl=0 clouds=0 foam=0 cshadow=0    关掉某一项（cshadow：云影）
//   post=0（色阶量化档数） sat=1  sun=x,y,z  t=秒（固定时刻）  pause=1  stats=1
import * as THREE from 'three';
import { CLOUDS, MPT, PITCH } from './layout';
import { PixelPipeline } from './pipeline';
import { buildProps } from './props';
import { createMats, makeShared } from './ramp';
import { PALETTES, type Season } from './season';
import { buildTerrain } from './terrain';
import { buildWater } from './water';

THREE.ColorManagement.enabled = false;

const params = new URLSearchParams(location.search);
const num = (k: string, d: number) => (params.has(k) ? Number(params.get(k)) : d);
const str = (k: string, d: string) => params.get(k) ?? d;
const deg = Math.PI / 180;

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
const rng = rngFactory(num('seed', 3));

const season = str('season', 'summer') as Season;
const pal = PALETTES[season] ?? PALETTES.summer;
const canvas = document.getElementById('c') as HTMLCanvasElement;
const zoom = num('zoom', MPT);

const shared = makeShared();
shared.uSnow.value = season === 'winter' ? 2 : 0;
shared.uShadowHard.value = str('shadow', 'hard') === 'soft' ? 0 : 1;
shared.uNoiseK.value = num('noise', 1);
shared.uDetail.value = num('detail', 1);
shared.uLightModel.value = { ramp: 0, flat: 1, lambert: 2 }[str('light', 'ramp')] ?? 0;
if (params.has('sun')) {
  const [x, y, z] = str('sun', '').split(',').map(Number);
  shared.uSunDir.value.set(x, y, z).normalize();
}

const edgeMode = str('edges', 'dir');
const shadowType =
  { hard: THREE.PCFShadowMap, soft: THREE.PCFShadowMap, basic: THREE.BasicShadowMap }[str('shadow', 'hard')] ??
  THREE.PCFShadowMap;
const pipe = new PixelPipeline(canvas, {
  px: num('px', 2),
  fxLayer: 1,
  shadowType,
  rig: {
    target: new THREE.Vector3(num('tx', 0), 0, num('tz', 0)),
    yaw: num('yaw', 0) * deg,
    pitch: num('pitch', PITCH) * deg,
    metersPerTexel: zoom,
  },
  edges: {
    depthLo: num('dlo', 0.15),
    depthHi: num('dhi', 0.3),
    dark: edgeMode === 'off' ? 0 : num('dark', 0.55),
    top: edgeMode === 'off' || edgeMode === 'uniform' ? 0 : num('top', 0.35),
    convex: edgeMode === 'off' ? 0 : num('convex', 0.6),
    uniformDark: edgeMode === 'uniform' ? 1 : 0,
  },
  grade: {
    sat: num('sat', season === 'spring' ? 0.85 : 1),
    posterize: num('post', 0),
    weather: season === 'winter' ? 2 : season === 'spring' ? 1 : 0,
    tint: season === 'spring' ? new THREE.Color(0.9, 0.92, 0.98) : new THREE.Color(1, 1, 1),
  },
});
pipe.showEdges = edgeMode === 'show';

const scene = new THREE.Scene();
scene.background = new THREE.Color(pal.grass[2]);

// 太阳只用来投影（颜色由色阶决定）；阴影相机盖住整个画面
const sun = new THREE.DirectionalLight(0xffffff, 1);
sun.castShadow = true;
const smap = num('smap', 2048);
sun.shadow.mapSize.set(smap, smap);
Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 120 });
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.03;
sun.shadow.radius = num('srad', 4);
shared.uFur.value = num('fur', 0.8);
shared.uCloudK.value = num('cshadow', pal.cloudShadow ?? 1);
shared.uGrassK.value = pal.grassK ?? 0.012;
shared.uFlowers.value = pal.flowers === false ? 0 : 1;
shared.uLeaves.value = pal.leaves ? 1 : 0;
CLOUDS.forEach((c, i) => {
  shared.uClouds.value[i].set(...c);
});
sun.position
  .copy(shared.uSunDir.value)
  .multiplyScalar(50)
  .add(new THREE.Vector3(2, 0, 2));
sun.target.position.set(2, 0, 2);
scene.add(sun, sun.target);

const mats = createMats(shared, zoom);
const terrain = buildTerrain(mats, pal, rng);
scene.add(terrain.root);
const props = buildProps(mats, pal, rng, season, shared);
scene.add(props.root);
const water = buildWater(
  terrain.pond,
  pal,
  shared,
  zoom,
  { tex: pipe.reflTarget.texture, matrix: pipe.mirrorMatrix },
  props.foam,
  {
    rain: season === 'spring',
  },
);
water.uniforms.uReflOn.value = num('refl', 1);
water.uniforms.uReflK.value = num('reflk', 0.3);
water.uniforms.uCloudsOn.value = num('clouds', 1);
water.uniforms.uFoamOn.value = num('foam', 1);
scene.add(water.mesh);
if (num('refl', 1) > 0) pipe.reflect = { y: -2.0, hide: [water.mesh], clip: shared.uClipY };

function resize() {
  pipe.resize(canvas.clientWidth, canvas.clientHeight, Math.min(devicePixelRatio, 3));
}
addEventListener('resize', resize);
resize();

const paused = params.get('pause') === '1';
let simT = num('t', 20);
let last = performance.now();
const stats = document.getElementById('stats') as HTMLDivElement;
const showStats = params.get('stats') === '1';
let frames = 0;
let acc = 0;
function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!paused) simT += dt;
  shared.uTime.value = simT;
  pipe.time = simT;
  water.update(simT);
  props.update(simT);
  const t0 = performance.now();
  pipe.renderer.info.autoReset = false;
  pipe.renderer.info.reset();
  pipe.render(scene);
  acc += performance.now() - t0;
  frames++;
  if (frames === 60) {
    const info = pipe.renderer.info.render;
    const msg = `[pond] cpu-side render ${(acc / 60).toFixed(2)} ms/frame, frame dt ${(dt * 1000).toFixed(1)} ms, all passes calls ${info.calls}, tris ${info.triangles}, low ${pipe.lowSize.x}x${pipe.lowSize.y}`;
    console.log(msg);
    if (showStats) stats.textContent = msg;
    acc = 0;
    frames = 0;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// 拖动平移
const pointers = new Map<number, { x: number; y: number }>();
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
});
canvas.addEventListener('pointermove', (e) => {
  const prev = pointers.get(e.pointerId);
  if (!prev) return;
  const cur = { x: e.clientX, y: e.clientY };
  pointers.set(e.pointerId, cur);
  const s = pipe.rig.metersPerTexel / pipe.px;
  pipe.rig.target.x -= (cur.x - prev.x) * s;
  pipe.rig.target.z -= ((cur.y - prev.y) * s) / Math.sin(pipe.rig.pitch);
});
const up = (e: PointerEvent) => pointers.delete(e.pointerId);
canvas.addEventListener('pointerup', up);
canvas.addEventListener('pointercancel', up);

// ?bench=N：同步渲 N 帧（每帧 readPixels 等 GPU 做完），打印平均毫秒（swiftshader 下只能看相对值）
if (params.has('bench')) {
  const n = num('bench', 30);
  const gl = pipe.renderer.getContext();
  const px = new Uint8Array(4);
  setTimeout(() => {
    const t0 = performance.now();
    for (let i = 0; i < n; i++) {
      shared.uTime.value += 1 / 60;
      pipe.render(scene);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    }
    console.log(`[pond] bench ${((performance.now() - t0) / n).toFixed(2)} ms/frame (gpu-synced, ${n} frames)`);
  }, 1500);
}

Object.assign(window, { __pond: { scene, pipe, shared, water } });

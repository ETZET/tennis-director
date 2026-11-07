// desert3d-v2：手摆构图的沙漠球场（美术方向底子）+ 资产画廊。
// 场景：  desert3d-v2.html                 （占位 = 冷灰体块 + id 标签；资产文件存在就换成资产）
// 画廊：  desert3d-v2.html?asset=<id>      （一块小沙台上只放这个资产：上/左 = 最终缩放，下/右 = 同一画面放大 3 倍）
// URL：zoom（米/纹素，默认 layout.MPT）、tx/tz、yaw/pitch（度）、hour、wind、seed、warm、pause=1、
//      labels=0（不显示标签）、ph=0（不放占位，只看地形和已画的资产）、edges=1（只看描边）、
//      画廊：v（变体）、ref=0（不放 1.8 米的人形比例尺）、bg=sky|sand。
import './colors';
import * as THREE from 'three';
import { createFx, type Fx } from './fx';
import { buildGround } from './ground';
import { H, MPT, SLOTS } from './layout';
import { createLife, type Life } from './life';
import { rngFactory } from './noise';
import { PAL, type Pal, SKY } from './palette';
import { PixelPipeline } from './pipeline';
import { placeholder, SPECS } from './placeholders';
import { buildTerrain, topGeo, wallGeo } from './terrain';
import { createMats, makeNoiseTexture } from './toon';
import type { AssetBuild, AssetCtx, SharedUniforms } from './world';

const params = new URLSearchParams(location.search);
const num = (k: string, d: number) => (params.has(k) ? Number(params.get(k)) : d);
const deg = Math.PI / 180;
const rng = rngFactory(num('seed', 7));

/** 已经画好的资产（assets/<id>.ts，export function build） */
const MODS = import.meta.glob<{ build: AssetBuild }>('./assets/*.ts', { eager: true });
const ASSETS: Record<string, AssetBuild> = {};
for (const [path, mod] of Object.entries(MODS)) {
  const id = path.replace('./assets/', '').replace(/\.ts$/, '');
  if (typeof mod.build === 'function') ASSETS[id] = mod.build;
}

const galleryId = params.get('asset');
const canvas = document.getElementById('c') as HTMLCanvasElement;
const canvas2 = document.getElementById('c2') as HTMLCanvasElement;
const labelsEl = document.getElementById('labels') as HTMLDivElement;
const infoEl = document.getElementById('info') as HTMLDivElement;
document.body.classList.toggle('gallery', !!galleryId);

const uniforms: SharedUniforms = {
  uTime: { value: 0 },
  uWind: { value: new THREE.Vector2(0.8, 0.35).normalize().multiplyScalar(num('wind', 0.5)) },
  uGust: { value: 0.5 },
  uCloudTex: { value: makeNoiseTexture(128, rng('clouds')) },
  uCloudScale: { value: 1 / 40 },
  uCloudVel: { value: new THREE.Vector2(1.6, 0.7) },
  uCloudStrength: { value: num('clouds', galleryId ? 0 : 0.25) },
};

const scene = new THREE.Scene();
scene.background = skyTexture(params.get('bg') === 'sand' ? 'sand' : 'sky');

const zoom = num('zoom', MPT);
const landscape = innerWidth > innerHeight;
const edges = {
  depthStrength: num('dstr', 0.48),
  normalStrength: num('nstr', 0.6),
  topStrength: num('tstr', 0.35),
};
const pipe = new PixelPipeline(canvas, {
  px: num('px', 2),
  fxLayer: 1,
  rig: {
    target: new THREE.Vector3(num('tx', 0), 0, num('tz', landscape ? 2 : 3)),
    yaw: num('yaw', 0) * deg,
    pitch: num('pitch', 45) * deg,
    metersPerTexel: zoom,
  },
  edges,
});
pipe.showEdges = params.get('edges') === '1';
// 画廊的放大窗：同一个纹素大小，每纹素 3 倍 CSS 像素（像素一个不差，只是放大）
const pipe2 = galleryId
  ? new PixelPipeline(canvas2, {
      px: num('px', 2) * 3,
      fxLayer: 1,
      rig: { ...pipe.rig, target: pipe.rig.target.clone() },
      edges,
    })
  : null;

// 太阳：画面后方（-z）、仰角约 35°（朝镜头的面统一落暗档，投影落向镜头）
const sun = new THREE.DirectionalLight(0xfff0d8, 1);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -36, right: 36, top: 36, bottom: -36, near: 1, far: 160 });
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.04;
sun.shadow.radius = 4;
scene.add(sun, sun.target);
/** 太阳：仰角、方位（度；0 = 正北 = 画面正后方，正 = 偏东 → 影子落向左下） */
function setSun(elevDeg: number, azDeg: number) {
  const el = elevDeg * deg;
  const az = azDeg * deg;
  sun.position.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).multiplyScalar(70);
}
/** 兼容：hour → 仰角/方位 */
function setHour(h: number) {
  const t = THREE.MathUtils.clamp((h - 6) / 13, 0, 1);
  setSun(Math.sin(Math.PI * t) * 46 + 6, -70 + 140 * t);
}
if (params.has('hour')) setHour(num('hour', 13));
else setSun(num('sunel', 50), num('sunaz', 22));

const mats = createMats(uniforms, () => pipe.rig.metersPerTexel);
const ctxBase = {
  mats,
  pal: PAL,
  mat(key: keyof Pal, extra?: Parameters<typeof mats.toon>[1]) {
    const sw = PAL[key];
    return mats.toon(0xffffff, {
      ramp: sw.ramp,
      edge: sw.edge,
      convex: sw.convex,
      ...('opts' in sw ? sw.opts : {}),
      ...extra,
    });
  },
  rng,
  uniforms,
  layers: { FX: 1 },
  texel: zoom,
  params,
};
const ctxFor = (variant: number): AssetCtx => ({ ...ctxBase, variant });

const updaters: ((dt: number, t: number) => void)[] = [];
const collectUpdaters = (o: THREE.Object3D) =>
  o.traverse((c) => {
    const u = c.userData.update as ((dt: number, t: number) => void) | undefined;
    if (u) updaters.push(u);
  });

function makeAsset(asset: string, variant: number): { obj: THREE.Object3D; real: boolean } {
  const b = ASSETS[asset];
  if (b) return { obj: b(ctxFor(variant)), real: true };
  return { obj: placeholder(ctxFor(variant), asset), real: false };
}

interface Label {
  el: HTMLDivElement;
  p: THREE.Vector3;
}
const labels: Label[] = [];
const showLabels = params.get('labels') !== '0';
function addLabel(text: string, p: THREE.Vector3, real: boolean) {
  if (!showLabels) return;
  const el = document.createElement('div');
  el.className = real ? 'lab real' : 'lab';
  el.textContent = text;
  labelsEl.appendChild(el);
  labels.push({ el, p });
}

let fx: Fx | undefined;
let life: Life | undefined;
if (galleryId) buildGallery(galleryId);
else buildScene();

function buildScene() {
  const terrain = buildTerrain(ctxFor(0));
  scene.add(terrain.root);
  if (params.get('detail') !== '0') scene.add(buildGround(ctxFor(0), terrain));
  const showPh = params.get('ph') !== '0';
  for (const s of SLOTS) {
    const { obj, real } = makeAsset(s.asset, s.variant ?? 0);
    if (!real && !showPh && s.asset !== 'court') continue;
    obj.position.set(s.x, s.y ?? 0, s.z);
    obj.rotation.y = s.rotY ?? 0;
    obj.scale.setScalar(s.s ?? 1);
    obj.name = `slot:${s.id}`;
    scene.add(obj);
    collectUpdaters(obj);
    const sp = SPECS[s.asset];
    if (s.asset !== 'court')
      addLabel(s.id, new THREE.Vector3(s.x, (s.y ?? 0) + (sp?.h ?? 1) * (s.s ?? 1) + 0.3, s.z), real);
  }
  if (showLabels) infoEl.textContent = `desert3d-v2 · ${Object.keys(ASSETS).length} 个资产已画 · 灰色 = 占位`;
  else infoEl.style.display = 'none';
  // 风沙和园区日常（?life=0 关掉人，?fx=0 关掉风沙）
  const court = scene.getObjectByName('slot:court');
  const tumble = scene.getObjectByName('slot:tumble');
  if (params.get('fx') !== '0') {
    fx = createFx(ctxFor(0), scene, court, tumble);
    const f = fx;
    updaters.push((dt, t) => f.update(dt, t));
  }
  if (params.get('life') !== '0') {
    const f: Fx = fx ?? { puff() {}, spray() {}, update() {}, gust: () => 0 };
    life = createLife(
      ctxFor(0),
      scene,
      (asset, variant) => {
        const o = makeAsset(asset, variant).obj;
        return o;
      },
      court,
      f,
      document.getElementById('hud'),
      (asset) => !!ASSETS[asset],
    );
    const l = life;
    updaters.push((dt, t) => l.update(dt, t));
  }
}

function buildGallery(id: string) {
  const variant = num('v', 0);
  const { obj, real } = makeAsset(id, variant);
  scene.add(obj);
  collectUpdaters(obj);
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  // 沙台要接得住投影（太阳在后方，影子落向镜头 ≈ 1.4 × 高）
  const hw = Math.max(2, size.x / 2 + 1.2);
  const hd = Math.max(2, size.z / 2 + 1.2, size.z / 2 + size.y * 1.4 * 0.6);
  // 小沙台：圆角方形，亮边 + 崖壁下 1.2 米
  const pts: [number, number][] = [];
  const r = 0.8;
  for (let k = 0; k < 4; k++) {
    const cx = (k === 0 || k === 3 ? 1 : -1) * (hw - r);
    const cz = (k < 2 ? 1 : -1) * (hd - r);
    for (let i = 0; i <= 4; i++) {
      const a = (k * Math.PI) / 2 + (i / 4) * (Math.PI / 2);
      pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
    }
  }
  const ctx = ctxFor(0);
  const tile = new THREE.Group();
  tile.add(new THREE.Mesh(topGeo(pts, 0), ctx.mat('sand')));
  tile.add(new THREE.Mesh(wallGeo(pts, 0, -zoom * 1.2, true), ctx.mat('cliffLip')));
  tile.add(new THREE.Mesh(wallGeo(pts, -zoom * 1.2, -1.2, true), ctx.mat('cliff')));
  mats.prepare(tile);
  scene.add(tile);
  if (params.get('ref') !== '0') {
    const ref = placeholder(ctx, 'player');
    ref.position.set(-hw + 0.5, 0, hd - 0.6);
    scene.add(ref);
  }
  const c = box.getCenter(new THREE.Vector3());
  pipe.rig.target.set(c.x, Math.max(0, c.y * 0.6), c.z + 0.4);
  if (pipe2) pipe2.rig.target.copy(pipe.rig.target);
  const sp = SPECS[id];
  const tx = (m: number) => Math.round(m / zoom);
  infoEl.textContent =
    `${id}${real ? '' : '（还没画：占位）'} · v${variant} · 包围盒 ${size.x.toFixed(2)}×${size.y.toFixed(2)}×${size.z.toFixed(2)} 米` +
    ` = ${tx(size.x)}×${tx(size.y)}×${tx(size.z)} 纹素` +
    (sp ? ` · 规格 ${sp.w}×${sp.h}×${sp.d} 米` : '');
  void H;
}

function skyTexture(kind: 'sky' | 'sand'): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 1;
  c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 64);
  const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
  if (kind === 'sky') {
    grad.addColorStop(0, hex(SKY.top));
    grad.addColorStop(1, hex(SKY.horizon));
  } else {
    grad.addColorStop(0, hex(PAL.sand.ramp[1]));
    grad.addColorStop(1, hex(PAL.sand.ramp[1]));
  }
  g.fillStyle = grad;
  g.fillRect(0, 0, 1, 64);
  // 按 4 档量化（像素画的天空也是色带，不是平滑渐变）
  const d = g.getImageData(0, 0, 1, 64);
  for (let i = 0; i < 64; i++) {
    const q = Math.floor(i / 16) * 16 + 8;
    for (let k = 0; k < 3; k++) {
      const a = d.data[q * 4 + k];
      d.data[i * 4 + k] = a;
    }
  }
  g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

function resize() {
  const dpr = Math.min(devicePixelRatio, 3);
  pipe.resize(canvas.clientWidth, canvas.clientHeight, dpr);
  pipe2?.resize(canvas2.clientWidth, canvas2.clientHeight, dpr);
}
addEventListener('resize', resize);
resize();

const DT = 1 / 60;
let simT = 0;
function step(seconds: number) {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) {
    simT += DT;
    uniforms.uTime.value = simT;
    uniforms.uGust.value = 0.5 + 0.35 * Math.sin(simT * 0.7) * Math.sin(simT * 0.23);
    for (const u of updaters) u(DT, simT);
  }
}
step(num('warm', 0));

const v3 = new THREE.Vector3();
function placeLabels() {
  if (!labels.length) return;
  const cam = pipe.camera;
  const low = pipe.lowSize;
  const W = canvas.clientWidth;
  const Hh = canvas.clientHeight;
  const lowW = low.x * pipe.px;
  const lowH = low.y * pipe.px;
  for (const l of labels) {
    v3.copy(l.p).project(cam);
    const x = ((v3.x + 1) / 2) * lowW - (lowW - W) / 2;
    const y = ((1 - v3.y) / 2) * lowH - (lowH - Hh) / 2;
    l.el.style.transform = `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px) translate(-50%, -100%)`;
  }
}

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
  pipe2?.render(scene);
  placeLabels();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// 拖动平移、滚轮/双指缩放（画廊：放大窗单独拖，看资产的不同部位）
if (pipe2) {
  let last2: { x: number; y: number } | null = null;
  canvas2.addEventListener('pointerdown', (e) => {
    canvas2.setPointerCapture(e.pointerId);
    last2 = { x: e.clientX, y: e.clientY };
  });
  canvas2.addEventListener('pointermove', (e) => {
    if (!last2) return;
    const s = pipe2.rig.metersPerTexel / pipe2.px;
    pipe2.rig.target.x -= (e.clientX - last2.x) * s;
    pipe2.rig.target.y += ((e.clientY - last2.y) * s) / Math.cos(pipe2.rig.pitch);
    last2 = { x: e.clientX, y: e.clientY };
  });
  canvas2.addEventListener('pointerup', () => {
    last2 = null;
  });
  // ?cy=（米）：放大窗看向的高度
  if (params.has('cy')) pipe2.rig.target.y = num('cy', 0);
}
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
    pipe.rig.target.x += -dx * Math.cos(yaw) + (dy / sinP) * -Math.sin(yaw);
    pipe.rig.target.z += -dx * -Math.sin(yaw) + (dy / sinP) * -Math.cos(yaw);
  } else if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    pipe.rig.metersPerTexel = THREE.MathUtils.clamp((zoom0 * pinch0) / Math.max(d, 1), 0.05, 0.3);
  }
});
const up = (e: PointerEvent) => pointers.delete(e.pointerId);
canvas.addEventListener('pointerup', up);
canvas.addEventListener('pointercancel', up);
canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    pipe.rig.metersPerTexel = THREE.MathUtils.clamp(pipe.rig.metersPerTexel * Math.exp(e.deltaY * 0.001), 0.05, 0.3);
  },
  { passive: false },
);

Object.assign(window, {
  __d3v2: {
    scene,
    pipe,
    pipe2,
    step,
    setHour,
    setSun,
    get life() {
      return life;
    },
    get fx() {
      return fx;
    },
    assets: Object.keys(ASSETS),
  },
});

// clubmap：整座俱乐部的微缩地图（一座浮空岛），给用户确认大布局：最前面到达和前台，前台后面是公共区（商店、穿线店、球员休息室），
// 中间是访客也能用的地方，最里面是三组球场（硬地、红土、草地）。只有胖方块和真尺寸，不画细节。
// 核心用 clubsite/render（toon、调色板、颜色管理、pipeline：相机距离 / 远裁剪面用构造参数 dist / far 拉远）+ clubsite/reuse.ts 的复用资产。
// URL：px（每纹素 CSS 像素，默认 1）、zoom（米/纹素；不给 = 自动取景，整座俱乐部装进画面）、tx/tz、labels=0、sunel/sunaz、pause=1。
// 拖动平移、双指/滚轮缩放。
import '../clubsite/render/colors';
import * as THREE from 'three';
import type { AssetCtx, SharedUniforms } from '../clubsite/render/ctx';
import { rngFactory } from '../clubsite/render/noise';
import { PixelPipeline } from '../clubsite/render/pipeline';
import { CLOUD_N, createMats } from '../clubsite/render/toon';
import { REUSED } from '../clubsite/reuse';
import { buildMap } from './build';
import { FRAME, LABELS, LANDMARKS, PEOPLE } from './layout';
import { PAL, type Pal, SKY } from './palette';

const params = new URLSearchParams(location.search);
const num = (k: string, d: number) => (params.has(k) ? Number(params.get(k)) : d);
const deg = Math.PI / 180;
const rng = rngFactory(num('seed', 13));

const canvas = document.getElementById('c') as HTMLCanvasElement;
const labelsEl = document.getElementById('labels') as HTMLDivElement;

const uniforms: SharedUniforms = {
  uTime: { value: 0 },
  uWind: { value: new THREE.Vector2(0.8, 0.35).normalize().multiplyScalar(0.3) },
  uGust: { value: 0.5 },
  uClouds: { value: Array.from({ length: CLOUD_N }, () => new THREE.Vector4(0, 0, 0, 0)) },
  uCloudVel: { value: new THREE.Vector2(0, 0) },
  uCloudStrength: { value: 0 },
};

const scene = new THREE.Scene();
scene.background = skyTexture();

const PX0 = num('px', 1);
// 取景：竖向 v = 0.707·(y − z)。看向点放在整座岛的屏幕中心
const vMid = (FRAME.vmin + FRAME.vmax) / 2;
const pipe = new PixelPipeline(canvas, {
  px: PX0,
  fxLayer: 1,
  rig: {
    target: new THREE.Vector3(num('tx', 0), 0, num('tz', -vMid / Math.SQRT1_2)),
    yaw: 0,
    pitch: 45 * deg,
    metersPerTexel: 0.25,
  },
  edges: { depthStrength: 0.48, normalStrength: 0.6, topStrength: 0.35 },
  dist: 220,
  far: 460,
});
/** 自动取景：整座岛（x ±xspan，v 在 vmin..vmax）装进画布，四周留 3% */
let userZoomed = params.has('zoom');
function fitZoom() {
  if (userZoomed) return;
  const w = canvas.clientWidth / pipe.px;
  const h = canvas.clientHeight / pipe.px;
  pipe.rig.metersPerTexel = Math.max((FRAME.xspan * 2) / w, (FRAME.vmax - FRAME.vmin) / h) * 1.03;
}
if (params.has('zoom')) pipe.rig.metersPerTexel = num('zoom', 0.25);

// 太阳：同 desert3d-v2 / clubfront（画面后方偏东、仰角 50°）；投影的相机盖住整座岛
const sun = new THREE.DirectionalLight(0xfff0d8, 1);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -150, right: 150, top: 150, bottom: -150, near: 1, far: 600 });
sun.shadow.bias = -0.0008;
sun.shadow.normalBias = 0.08;
sun.shadow.radius = 3;
sun.target.position.set(0, 0, -45);
scene.add(sun, sun.target);
function setSun(elevDeg: number, azDeg: number) {
  const el = elevDeg * deg;
  const az = azDeg * deg;
  sun.position
    .set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el))
    .multiplyScalar(250)
    .add(sun.target.position);
}
setSun(num('sunel', 50), num('sunaz', 22));

const mats = createMats(uniforms, () => pipe.rig.metersPerTexel);
const ctx = {
  mats,
  pal: PAL,
  mat(key: keyof Pal, extra?: Parameters<typeof mats.toon>[1]) {
    const sw = PAL[key];
    return mats.toon(0xffffff, {
      ramp: sw.ramp,
      edge: sw.edge,
      convex: sw.convex,
      tones: sw.tones,
      ...('opts' in sw ? sw.opts : {}),
      ...extra,
    });
  },
  rng,
  uniforms,
  layers: { FX: 1 },
  texel: 0.09,
  params: new URLSearchParams(),
  variant: 0,
};
const assetCtx = (variant: number): AssetCtx => ({ ...ctx, variant });

// ── 地图本体 + 复用的地标植物、遮阳帆和三个人（比例尺） ──
scene.add(buildMap(ctx).root);
for (const l of LANDMARKS) {
  const b = REUSED[l.asset];
  if (!b) continue;
  const o = b(assetCtx(l.v ?? 0));
  o.position.set(l.x, l.y, l.z);
  o.scale.setScalar(l.s ?? 1);
  scene.add(o);
}
for (const p of PEOPLE) {
  const b = REUSED[p.asset];
  if (!b) continue;
  const o = b(assetCtx(p.v ?? 0));
  o.position.set(p.x, 0, p.z);
  o.rotation.y = p.rotY;
  o.userData.setProp?.(p.asset === 'director' ? null : 'racket');
  o.userData.pose?.('idle', 0);
  scene.add(o);
}

// ── 中文标签（?labels=0 关） ──
interface Label {
  el: HTMLDivElement;
  p: THREE.Vector3;
}
const labels: Label[] = [];
if (params.get('labels') !== '0')
  for (const l of LABELS) {
    const el = document.createElement('div');
    el.className = l.big ? 'lab big' : 'lab';
    el.textContent = l.text;
    labelsEl.appendChild(el);
    labels.push({ el, p: new THREE.Vector3(l.x, l.y, l.z) });
  }

function skyTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 1;
  c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 64);
  const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
  grad.addColorStop(0, hex(SKY.top));
  grad.addColorStop(1, hex(SKY.horizon));
  g.fillStyle = grad;
  g.fillRect(0, 0, 1, 64);
  const d = g.getImageData(0, 0, 1, 64);
  for (let i = 0; i < 64; i++) {
    const q = Math.floor(i / 16) * 16 + 8;
    for (let k = 0; k < 3; k++) d.data[i * 4 + k] = d.data[q * 4 + k];
  }
  g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

function resize() {
  fitZoom();
  pipe.resize(canvas.clientWidth, canvas.clientHeight, Math.min(devicePixelRatio, 3));
}
addEventListener('resize', resize);
resize();

// 像素级别（同 clubfront：默认 1×；切换时米/纹素等比变，取景不变）
const PX_LEVELS = [1, 1.5, 2, 3];
const PX_KEY = 'clubmap.px';
const pxEl = document.getElementById('pxsel');
if (pxEl) {
  const chip = document.createElement('button');
  chip.className = 'px-chip';
  chip.type = 'button';
  chip.setAttribute('aria-haspopup', 'true');
  chip.setAttribute('aria-expanded', 'false');
  const list = document.createElement('div');
  list.className = 'px-list';
  list.hidden = true;
  const fmt = (v: number) => `${v}×`;
  const sync = () => {
    chip.textContent = `像素 ${fmt(pipe.px)}`;
    for (const b of list.querySelectorAll('button'))
      b.setAttribute('aria-pressed', String(Number(b.dataset.px) === pipe.px));
  };
  const setPx = (px: number) => {
    if (px === pipe.px) return;
    pipe.rig.metersPerTexel *= px / pipe.px;
    pipe.px = px;
    pipe.resize(canvas.clientWidth, canvas.clientHeight, Math.min(devicePixelRatio, 3));
    sync();
    try {
      localStorage.setItem(PX_KEY, String(px));
    } catch {}
  };
  for (const v of PX_LEVELS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.px = String(v);
    b.innerHTML = `<b>${fmt(v)}</b><span>${v === 1 ? '默认' : '更粗'}</span>`;
    b.addEventListener('click', () => {
      setPx(v);
      list.hidden = true;
      chip.setAttribute('aria-expanded', 'false');
    });
    list.appendChild(b);
  }
  chip.addEventListener('click', () => {
    list.hidden = !list.hidden;
    chip.setAttribute('aria-expanded', String(!list.hidden));
  });
  pxEl.append(chip, list);
  if (!params.has('px')) {
    try {
      const saved = Number(localStorage.getItem(PX_KEY));
      if (PX_LEVELS.includes(saved)) setPx(saved);
    } catch {}
  }
  sync();
}

const v3 = new THREE.Vector3();
function placeLabels() {
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
let t = 0;
let last = performance.now();
function frame(now: number) {
  if (!paused) t += Math.min(0.1, (now - last) / 1000);
  last = now;
  uniforms.uTime.value = t;
  pipe.render(scene);
  placeLabels();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// 拖动平移、双指/滚轮缩放（缩放上下限按像素级别等比）
const pointers = new Map<number, { x: number; y: number }>();
let pinch0 = 0;
let zoom0 = pipe.rig.metersPerTexel;
const clampZoom = (z: number) => THREE.MathUtils.clamp(z, 0.03 * pipe.px, 0.8 * pipe.px);
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
    pipe.rig.target.x -= (cur.x - prev.x) * s;
    pipe.rig.target.z -= ((cur.y - prev.y) * s) / Math.sin(pipe.rig.pitch);
  } else if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    pipe.rig.metersPerTexel = clampZoom((zoom0 * pinch0) / Math.max(d, 1));
    userZoomed = true;
  }
});
const up = (e: PointerEvent) => pointers.delete(e.pointerId);
canvas.addEventListener('pointerup', up);
canvas.addEventListener('pointercancel', up);
canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    pipe.rig.metersPerTexel = clampZoom(pipe.rig.metersPerTexel * Math.exp(e.deltaY * 0.001));
    userZoomed = true;
  },
  { passive: false },
);

Object.assign(window, { __clubmap: { scene, pipe, setSun } });

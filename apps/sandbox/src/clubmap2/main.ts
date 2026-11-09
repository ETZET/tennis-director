// clubmap2：照主游戏 2.5D 地图（Palm Oasis）的布局做的俱乐部缩略图，3D 像素风格，加了露天前台。
// 镜头像游戏一样斜着看（默认从东南看，yaw 38°），右下角两个按钮转 90°；拖动平移、双指/滚轮缩放。
// URL：px（每纹素 CSS 像素，默认 1）、yaw（度）、zoom（米/纹素，不给 = 自动取景）、labels=0、pal=<配色>、sunel/sunaz、pause=1。
import '../clubfront/colors';
import * as THREE from 'three';
import { rngFactory } from '../clubfront/noise';
import { SCHEMES, schemeById, schemeMats, schemeOpts } from '../clubfront/palettes';
import { mountPaletteSwitcher } from '../clubfront/palettes/switcher';
import { REUSED } from '../clubfront/reuse';
import { CLOUD_N, createMats, type ToonOpts } from '../clubfront/toon';
import type { AssetCtx, SharedUniforms } from '../clubfront/world';
import { PixelPipeline } from '../clubmap/pipeline';
import { axes, FIT_TIGHT, fitRange, HEADROOM, PITCH, SKY_STRIP, screenOf } from '../clubsite/framing';
import { buildMap } from './build';
import { LABELS } from './layout';
import { PAL, type Pal, SKY } from './palette';
import { placements } from './scatter';

const params = new URLSearchParams(location.search);
const num = (k: string, d: number) => (params.has(k) ? Number(params.get(k)) : d);
const deg = Math.PI / 180;
const rng = rngFactory(num('seed', 13));
const scheme = schemeById(params.get('pal'));

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

const pipe = new PixelPipeline(canvas, {
  px: num('px', 1),
  fxLayer: 1,
  rig: {
    target: new THREE.Vector3(10, 0, 10),
    yaw: num('yaw', innerHeight > innerWidth ? 62 : 38) * deg,
    pitch: PITCH,
    metersPerTexel: 0.35,
  },
  edges: {
    depthStrength: scheme?.edges?.depthStrength ?? 0.48,
    normalStrength: scheme?.edges?.normalStrength ?? 0.6,
    topStrength: scheme?.edges?.topStrength ?? 0.35,
    tint: scheme?.edgeTint,
  },
  // 镜头离目标远一点：地图边的天幕（clubsite/mountains.ts）有 480 米高，缩远时它的上半截不能被近裁剪面切掉
  dist: 520,
  far: 1100,
});

/**
 * 自动取景（clubsite/framing.ts）：先框住 FIT（围墙、停车场、高尔夫），再看远边的山顶在屏幕上到哪 —— 顶上加余量露出山梁和
 * 一条天（最多 HEADROOM，俱乐部缩小约 15%；山更高就让山出画）。竖屏横向卡住、竖向富余：地图居中，天被挡住时整体往下挪。
 * 屏幕横向 = p·r，竖向 = y·cosφ − (p·c)·sinφ。
 */
let userZoomed = params.has('zoom');
let crests: number[] = [];
function fit(resetTarget: boolean) {
  const yawDeg = pipe.rig.yaw / deg;
  const { sx0, sx1, v0, v1 } = fitRange(yawDeg);
  const w = canvas.clientWidth / pipe.px;
  const h = canvas.clientHeight / pipe.px;
  const mx = (sx0 + sx1) / 2;
  // 画面横向能看到的范围（先按不加余量的缩放估）里的最高山顶 + 一条天
  const mpt0 = Math.max((sx1 - sx0) / w, (v1 - v0) / h) * FIT_TIGHT;
  const half = (w * mpt0 * (1 + HEADROOM)) / 2;
  let top = v1;
  for (let i = 0; i < crests.length; i += 3) {
    const [sx, v] = screenOf(crests[i], crests[i + 1], crests[i + 2], yawDeg);
    if (Math.abs(sx - mx) <= half && v > top) top = v;
  }
  // 画面高 V = (地图高 + head)·FIT_TIGHT，地图底贴画面底时要 V·(1 − SKY_STRIP) ≥ 山顶 − 地图底
  const need = top > v1 ? (top - v0) / (FIT_TIGHT * (1 - SKY_STRIP)) - (v1 - v0) : 0;
  const head = Math.min(Math.max(0, need), (v1 - v0) * HEADROOM);
  if (!userZoomed) pipe.rig.metersPerTexel = Math.max((sx1 - sx0) / w, (v1 - v0 + head) / h) * FIT_TIGHT;
  if (resetTarget) {
    const V = h * pipe.rig.metersPerTexel;
    // 地图居中；天被挡住（山顶 + 一条天高过画面顶）就往上挪，最多挪到地图底贴着画面底
    const want = top > v1 ? top + V * SKY_STRIP : v1;
    let mv = (v0 + v1) / 2;
    if (mv + V / 2 < want) mv = Math.min(want - V / 2, v0 + V / 2);
    const { r, c } = axes(yawDeg);
    pipe.rig.target.set(r[0] * mx - (c[0] * mv) / Math.sin(PITCH), 0, r[1] * mx - (c[1] * mv) / Math.sin(PITCH));
  }
}
if (params.has('zoom')) pipe.rig.metersPerTexel = num('zoom', 0.35);

// 太阳：仰角 50°，方位跟着镜头转（保持从画面后方偏右打过来，影子朝镜头偏左）
const sun = new THREE.DirectionalLight(scheme?.sun ?? 0xfff0d8, 1);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -175, right: 175, top: 175, bottom: -175, near: 1, far: 700 });
sun.shadow.bias = -0.0008;
sun.shadow.normalBias = 0.1;
sun.shadow.radius = 3;
sun.target.position.set(12, 0, 12);
scene.add(sun, sun.target);
const SUN_EL = num('sunel', 50);
const SUN_AZ = num('sunaz', 22);
function setSun() {
  const el = SUN_EL * deg;
  const az = SUN_AZ * deg + pipe.rig.yaw;
  sun.position
    .set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el))
    .multiplyScalar(300)
    .add(sun.target.position);
}

const mats = createMats(uniforms, () => pipe.rig.metersPerTexel);
/** 调色板名字 → 材质参数；?pal= 的配色在这里换色（复用资产写死的颜色经 schemeMats 一起换） */
function palOpts(key: keyof Pal, extra?: ToonOpts): ToonOpts {
  const sw = PAL[key];
  const o: ToonOpts = {
    ramp: sw.ramp,
    edge: sw.edge,
    convex: sw.convex,
    tones: sw.tones,
    ...('opts' in sw ? sw.opts : {}),
    ...extra,
  };
  // biome-ignore lint/suspicious/noExplicitAny: 新加的几个材质名不在 clubfront 的 Pal 里，按全局调色走
  return scheme ? schemeOpts(scheme, key as any, o) : o;
}
const ctx = {
  mats: scheme ? schemeMats(scheme, mats) : mats,
  pal: PAL,
  mat(key: keyof Pal, extra?: ToonOpts) {
    return mats.toon(0xffffff, palOpts(key, extra));
  },
  rng,
  uniforms,
  layers: { FX: 1 },
  texel: 0.09,
  params: new URLSearchParams(),
  variant: 0,
};
const assetCtx = (variant: number) => ({ ...ctx, variant }) as unknown as AssetCtx;

// ── 地图本体 + 复用的植物、长椅、人 ──
scene.add(buildMap(ctx));
crests = (scene.getObjectByName('mtn')?.userData.crests as number[] | undefined) ?? [];
for (const p of placements(rng)) {
  const b = REUSED[p.asset];
  if (!b) continue;
  const o = b(assetCtx(p.v ?? 0));
  o.position.set(p.x, p.y ?? 0, p.z);
  o.scale.setScalar(p.s ?? 1);
  if (p.rotY) o.rotation.y = p.rotY;
  if (p.asset === 'player' || p.asset === 'coach' || p.asset === 'director') {
    o.userData.setProp?.(p.prop === undefined ? 'racket' : p.prop);
    o.userData.pose?.('idle', 0);
  }
  scene.add(o);
}

// ── 中文标签（?labels=0 关） ──
const labels: { el: HTMLDivElement; p: THREE.Vector3; x: number; y: number; w: number; h: number; big?: boolean }[] =
  [];
const showLabels = params.get('labels') !== '0';
for (const l of LABELS) {
  const el = document.createElement('div');
  el.className = l.big ? 'lab big' : 'lab';
  el.textContent = l.text;
  el.hidden = !showLabels;
  labelsEl.appendChild(el);
  labels.push({ el, p: new THREE.Vector3(l.x, l.y, l.z), x: 0, y: 0, w: 0, h: 0, big: l.big });
}

function skyTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 1;
  c.height = 64;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const grad = g.createLinearGradient(0, 0, 0, 64);
  const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
  const sky = scheme?.sky ?? SKY;
  grad.addColorStop(0, hex(sky.top));
  grad.addColorStop(1, hex(sky.horizon));
  g.fillStyle = grad;
  g.fillRect(0, 0, 1, 64);
  const d = g.getImageData(0, 0, 1, 64);
  for (let i = 0; i < 64; i++) {
    const q = Math.floor(i / 16) * 16 + 8;
    for (let k = 0; k < 3; k++) d.data[i * 4 + k] = d.data[q * 4 + k];
  }
  g.putImageData(d, 0, 0);
  document.body.style.background = hex(sky.top);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

function resize() {
  fit(!userZoomed);
  pipe.resize(canvas.clientWidth, canvas.clientHeight, Math.min(devicePixelRatio, 3));
}
addEventListener('resize', resize);
setSun();
resize();

// ── 左上：像素级别；右上：配色；右下：转镜头、标签开关 ──
const PX_LEVELS = [1, 1.5, 2, 3];
const PX_KEY = 'clubmap2.px';
const pxEl = document.getElementById('pxsel');
if (pxEl) {
  const chip = document.createElement('button');
  chip.className = 'px-chip';
  chip.type = 'button';
  chip.setAttribute('aria-expanded', 'false');
  const list = document.createElement('div');
  list.className = 'px-list';
  list.hidden = true;
  const sync = () => {
    chip.textContent = `像素 ${pipe.px}×`;
    for (const b of list.querySelectorAll('button'))
      b.setAttribute('aria-pressed', String(Number((b as HTMLElement).dataset.px) === pipe.px));
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
    b.innerHTML = `<b>${v}×</b><span>${v === 1 ? '默认' : '更粗'}</span>`;
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
const palEl = document.getElementById('palsel');
if (palEl) mountPaletteSwitcher(palEl, SCHEMES, scheme?.id ?? 'current');

const rotateBy = (d: number) => {
  pipe.rig.yaw += d * 90 * deg;
  setSun();
  fit(true);
};
document.getElementById('rotL')?.addEventListener('click', () => rotateBy(-1));
document.getElementById('rotR')?.addEventListener('click', () => rotateBy(1));
const labBtn = document.getElementById('labBtn');
let labelsOn = showLabels;
const syncLab = () => {
  if (labBtn) labBtn.textContent = labelsOn ? '标签 开' : '标签 关';
  for (const l of labels) l.el.hidden = !labelsOn;
};
labBtn?.addEventListener('click', () => {
  labelsOn = !labelsOn;
  syncLab();
});
syncLab();
document.getElementById('fitBtn')?.addEventListener('click', () => {
  userZoomed = false;
  fit(true);
});

const v3 = new THREE.Vector3();
/** 大标签先占位置 */
const byRank = [...labels].sort((a, b) => Number(!!b.big) - Number(!!a.big));
function placeLabels() {
  if (!labelsOn) return;
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
    l.x = x;
    l.y = y;
  }
  // 挤在一起的标签：按表里的顺序（大标签在前）留先来的，后来的压到别人就藏起来
  const kept: { x0: number; x1: number; y0: number; y1: number }[] = [];
  for (const l of byRank) {
    const w = l.el.offsetWidth || l.w;
    const h = l.el.offsetHeight || l.h;
    l.w = w;
    l.h = h;
    const r = { x0: l.x - w / 2 - 2, x1: l.x + w / 2 + 2, y0: l.y - h - 2, y1: l.y + 2 };
    const hit = kept.some((k) => r.x0 < k.x1 && r.x1 > k.x0 && r.y0 < k.y1 && r.y1 > k.y0);
    l.el.style.visibility = hit ? 'hidden' : 'visible';
    if (!hit) kept.push(r);
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

// 拖动平移（按镜头朝向换算）、双指/滚轮缩放
const pointers = new Map<number, { x: number; y: number }>();
let pinch0 = 0;
let zoom0 = pipe.rig.metersPerTexel;
const clampZoom = (z: number) => THREE.MathUtils.clamp(z, 0.03 * pipe.px, 1.2 * pipe.px);
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
    const yaw = pipe.rig.yaw;
    const dx = (cur.x - prev.x) * s;
    const dv = ((cur.y - prev.y) * s) / Math.sin(pipe.rig.pitch);
    pipe.rig.target.x -= Math.cos(yaw) * dx + Math.sin(yaw) * dv;
    pipe.rig.target.z -= -Math.sin(yaw) * dx + Math.cos(yaw) * dv;
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

Object.assign(window, { __clubmap2: { scene, pipe, rotateBy } });

// clubfront：俱乐部的露天前台和大门（印第安维尔斯沙漠，和 desert3d-v2 同一个世界）—— 白模阶段：手摆构图 + 调色板 + 占位。
// 场景：  clubfront.html                 （占位 = 冷灰体块 + id 标签；src/clubfront/assets/<id>.ts 存在就换成资产）
// 画廊：  clubfront.html?asset=<id>      （一块小台子上只放这个资产：上/左 = 最终缩放，下/右 = 同一画面放大 3 倍）
// 标签颜色：灰 = 占位（要画的新资产），绿 = 已画的新资产，青 = 从 desert3d-v2 复用的资产。洋红圆盘 = 站位，小点 = 路线（nav.ts）。
// URL：px（每纹素 CSS 像素，默认 1；画廊 2）、zoom（米/纹素，默认 MPT×px/2）、tx/tz、yaw/pitch（度）、sunel/sunaz、seed、warm、
//      pause=1、labels=0（不显示标签和站位）、ph=0（不放占位）、nav=0（标签开着也不画站位）、clouds=0、edges=1（只看描边）、
//      画廊：v（变体）、ref=0（不放 1.8 米的人形比例尺）、ground=tile|sand、cy（放大窗看的高度）。
//      pal=<id>：配色实验（palettes/，右上角切换；不带 = 现在的配色，原样）。
import './colors';
import * as THREE from 'three';
import { CLOUD_VEL, CLOUDS, H, MPT, SLOTS, TARGET_Z } from './layout';
import { buildNav } from './nav';
import { rngFactory } from './noise';
import { PAL, type Pal, SKY } from './palette';
import { SCHEMES, schemeById, schemeMats, schemeOpts } from './palettes';
import { mountPaletteSwitcher } from './palettes/switcher';
import { PixelPipeline } from './pipeline';
import { placeholder, SPECS } from './placeholders';
import { REUSED } from './reuse';
import { buildTerrain, topGeo, wallGeo } from './terrain';
import { CLOUD_N, createMats, type ToonOpts } from './toon';
import type { AssetBuild, AssetCtx, SharedUniforms } from './world';

const params = new URLSearchParams(location.search);
const num = (k: string, d: number) => (params.has(k) ? Number(params.get(k)) : d);
const deg = Math.PI / 180;
const rng = rngFactory(num('seed', 11));
/** 配色实验的方案（null = 现在的配色，所有颜色原样） */
const scheme = schemeById(params.get('pal'));

/** 这个场景自己画的资产（assets/<id>.ts，export function build）；同名的优先于复用的 */
const MODS = import.meta.glob<{ build: AssetBuild }>('./assets/*.ts', { eager: true });
const OWN: Record<string, AssetBuild> = {};
for (const [path, mod] of Object.entries(MODS)) {
  const id = path.replace('./assets/', '').replace(/\.ts$/, '');
  if (typeof mod.build === 'function') OWN[id] = mod.build;
}

const galleryId = params.get('asset');
const canvas = document.getElementById('c') as HTMLCanvasElement;
const canvas2 = document.getElementById('c2') as HTMLCanvasElement;
const labelsEl = document.getElementById('labels') as HTMLDivElement;
const infoEl = document.getElementById('info') as HTMLDivElement;
document.body.classList.toggle('gallery', !!galleryId);

const uniforms: SharedUniforms = {
  uTime: { value: 0 },
  uWind: { value: new THREE.Vector2(0.8, 0.35).normalize().multiplyScalar(num('wind', 0.4)) },
  uGust: { value: 0.5 },
  uClouds: {
    value: Array.from({ length: CLOUD_N }, (_, i) => new THREE.Vector4(...(CLOUDS[i] ?? [0, 0, 0, 0]))),
  },
  uCloudVel: { value: new THREE.Vector2(CLOUD_VEL, 0) },
  uCloudStrength: { value: num('clouds', galleryId ? 0 : 1) },
};

const scene = new THREE.Scene();
scene.background = skyTexture();

// 默认每纹素 1 个 CSS 像素（同 desert3d-v2；画廊 2）。zoom = 实际的米/纹素，按 2× 时的 MPT 等比换算，取景不变。
const PX0 = num('px', galleryId ? 2 : 1);
const zoom = num('zoom', (MPT * PX0) / 2);
/** 素材按 2× 的纹素大小建模（线宽、板缝、最小厚度），和当前像素级别无关 */
const designTexel = (zoom * 2) / PX0;
const landscape = innerWidth > innerHeight;
const edges = {
  depthStrength: num('dstr', scheme?.edges?.depthStrength ?? 0.48),
  normalStrength: num('nstr', scheme?.edges?.normalStrength ?? 0.6),
  topStrength: num('tstr', scheme?.edges?.topStrength ?? 0.35),
  tint: scheme?.edgeTint,
};
const pipe = new PixelPipeline(canvas, {
  px: PX0,
  fxLayer: 1,
  rig: {
    target: new THREE.Vector3(num('tx', 0), 0, num('tz', landscape ? TARGET_Z.landscape : TARGET_Z.portrait)),
    yaw: num('yaw', 0) * deg,
    pitch: num('pitch', 45) * deg,
    metersPerTexel: zoom,
  },
  edges,
});
pipe.showEdges = params.get('edges') === '1';
const pipe2 = galleryId
  ? new PixelPipeline(canvas2, {
      px: PX0 * 3,
      fxLayer: 1,
      rig: { ...pipe.rig, target: pipe.rig.target.clone() },
      edges,
    })
  : null;

// 太阳：同 desert3d-v2 —— 画面后方偏东、仰角 50°（朝镜头的墙落暗档，投影落向左下）
const sun = new THREE.DirectionalLight(scheme?.sun ?? 0xfff0d8, 1);
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
setSun(num('sunel', 50), num('sunaz', 22));

const mats = createMats(uniforms, () => pipe.rig.metersPerTexel);
/** 调色板名字 → 材质参数；配色实验（?pal=）在这里换色，复用资产写死的颜色（extra）也一起换 */
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
  return scheme ? schemeOpts(scheme, key, o) : o;
}
const ctxBase = {
  mats: scheme ? schemeMats(scheme, mats) : mats,
  pal: PAL,
  mat(key: keyof Pal, extra?: Parameters<typeof mats.toon>[1]) {
    return mats.toon(0xffffff, palOpts(key, extra));
  },
  rng,
  uniforms,
  layers: { FX: 1 },
  texel: designTexel,
  params,
};
const ctxFor = (variant: number): AssetCtx => ({ ...ctxBase, variant });

const updaters: ((dt: number, t: number) => void)[] = [];
const collectUpdaters = (o: THREE.Object3D) =>
  o.traverse((c) => {
    const u = c.userData.update as ((dt: number, t: number) => void) | undefined;
    if (u) updaters.push(u);
  });

type Kind = 'own' | 'reused' | 'placeholder';
function makeAsset(asset: string, variant: number): { obj: THREE.Object3D; kind: Kind } {
  const own = OWN[asset];
  if (own) return { obj: own(ctxFor(variant)), kind: 'own' };
  const reused = REUSED[asset];
  if (reused) return { obj: reused(ctxFor(variant)), kind: 'reused' };
  return { obj: placeholder(ctxFor(variant), asset), kind: 'placeholder' };
}

interface Label {
  el: HTMLDivElement;
  p: THREE.Vector3;
}
const labels: Label[] = [];
const showLabels = params.get('labels') !== '0' && !galleryId;
function addLabel(text: string, p: THREE.Vector3, kind: Kind) {
  if (!showLabels) return;
  const el = document.createElement('div');
  el.className = `lab ${kind}`;
  el.textContent = text;
  labelsEl.appendChild(el);
  labels.push({ el, p });
}

if (galleryId) buildGallery(galleryId);
else buildScene();

function buildScene() {
  const ctx = ctxFor(0);
  const terrain = buildTerrain(ctx);
  scene.add(terrain.root);
  const showPh = params.get('ph') !== '0';
  const count: Record<Kind, number> = { own: 0, reused: 0, placeholder: 0 };
  for (const s of SLOTS) {
    const { obj, kind } = makeAsset(s.asset, s.variant ?? 0);
    if (kind === 'placeholder' && !showPh) continue;
    count[kind]++;
    const y = s.y ?? terrain.groundAt(s.x, s.z);
    obj.position.set(s.x, y, s.z);
    obj.rotation.y = s.rotY ?? 0;
    obj.scale.setScalar(s.s ?? 1);
    obj.name = `slot:${s.id}`;
    if (s.prop !== undefined) obj.userData.setProp?.(s.prop);
    if (s.pose) obj.userData.pose?.(s.pose[0], s.pose[1]);
    scene.add(obj);
    collectUpdaters(obj);
    const sp = SPECS[s.asset];
    addLabel(s.id, new THREE.Vector3(s.x, y + (sp?.h ?? 1) * (s.s ?? 1) + 0.3, s.z), kind);
  }
  if (showLabels && params.get('nav') !== '0') scene.add(buildNav(ctx, terrain.groundAt));
  if (showLabels)
    infoEl.textContent = `clubfront 白模 · 占位 ${count.placeholder} · 复用 ${count.reused} · 新画 ${count.own}`;
  else infoEl.style.display = 'none';
}

function buildGallery(id: string) {
  const variant = num('v', 0);
  const { obj, kind } = makeAsset(id, variant);
  if (params.has('pose')) obj.userData.pose?.(params.get('pose'), params.has('phase') ? num('phase', 0) : undefined);
  scene.add(obj);
  collectUpdaters(obj);
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  // 小台子要接得住投影（太阳在后方，影子落向镜头 ≈ 1.2 × 高）
  const hw = Math.max(2, size.x / 2 + 1.2);
  const hd = Math.max(2, size.z / 2 + 1.2, size.z / 2 + size.y * 1.4 * 0.6);
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
  tile.add(new THREE.Mesh(topGeo(pts, 0), ctx.mat(params.get('ground') === 'sand' ? 'sand' : 'tile')));
  tile.add(new THREE.Mesh(wallGeo(pts, 0, -zoom * 1.2, true), ctx.mat('cap')));
  tile.add(new THREE.Mesh(wallGeo(pts, -zoom * 1.2, -1.2, true), ctx.mat('adobe')));
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
  const tx = (m: number) => Math.round(m / designTexel);
  const what = { own: '', reused: '（复用 desert3d-v2）', placeholder: '（还没画：占位）' }[kind];
  infoEl.textContent =
    `${id}${what} · v${variant} · 包围盒 ${size.x.toFixed(2)}×${size.y.toFixed(2)}×${size.z.toFixed(2)} 米` +
    ` = ${tx(size.x)}×${tx(size.y)}×${tx(size.z)} 设计纹素` +
    (sp ? ` · 规格 ${sp.w}×${sp.h}×${sp.d} 米` : '');
  void H;
}

function skyTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 1;
  c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 64);
  const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
  const sky = scheme?.sky ?? SKY;
  grad.addColorStop(0, hex(sky.top));
  grad.addColorStop(1, hex(sky.horizon));
  if (scheme) document.body.style.background = hex(sky.top);
  g.fillStyle = grad;
  g.fillRect(0, 0, 1, 64);
  // 按 4 档量化（像素画的天空也是色带）
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
  const dpr = Math.min(devicePixelRatio, 3);
  pipe.resize(canvas.clientWidth, canvas.clientHeight, dpr);
  pipe2?.resize(canvas2.clientWidth, canvas2.clientHeight, dpr);
}
addEventListener('resize', resize);
resize();

// 像素级别：每个纹素占几个 CSS 像素。切换时米/纹素按同样比例变，取景范围不变，只换像素的粗细（同 desert3d-v2）。
const PX_LEVELS = [1, 1.5, 2, 3];
const PX_KEY = 'clubfront.px';
const pxEl = document.getElementById('pxsel');
if (pxEl && !galleryId) {
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
    resize();
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

// 配色切换（右上角）
const palEl = document.getElementById('palsel');
if (palEl && !galleryId) mountPaletteSwitcher(palEl, SCHEMES, scheme?.id ?? 'current');

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

// 画廊的放大窗单独拖（看资产的不同部位）
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
  if (params.has('cy')) pipe2.rig.target.y = num('cy', 0);
}

// 拖动平移、双指/滚轮缩放（白模查看；玩法阶段换成摇杆 + 相机跟着总监）
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
    pipe.rig.metersPerTexel = THREE.MathUtils.clamp(
      (zoom0 * pinch0) / Math.max(d, 1),
      (0.05 * pipe.px) / 2,
      (0.3 * pipe.px) / 2,
    );
  }
});
const up = (e: PointerEvent) => pointers.delete(e.pointerId);
canvas.addEventListener('pointerup', up);
canvas.addEventListener('pointercancel', up);
canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    pipe.rig.metersPerTexel = THREE.MathUtils.clamp(
      pipe.rig.metersPerTexel * Math.exp(e.deltaY * 0.001),
      (0.05 * pipe.px) / 2,
      (0.3 * pipe.px) / 2,
    );
  },
  { passive: false },
);

Object.assign(window, {
  __club: { scene, pipe, pipe2, step, setSun, own: Object.keys(OWN), reused: Object.keys(REUSED), palOpts },
});

// clubpark：俱乐部大门外的停车场 / 到达区（和 clubdesk 场景以东墙大门为界，世界坐标同 clubsite/world.ts）—— 白模阶段。
// 场景：  clubpark.html                 （占位 = 冷灰体块 + id 标签；src/clubpark/assets/<id>.ts 存在就换成资产）
// 画廊：  clubpark.html?asset=<id>      （一块小台子上只放这个资产：上/左 = 最终缩放，下/右 = 同一画面放大 3 倍）
// 标签：灰 = 占位（要画的新资产），绿 = 已画的新资产，青 = 复用的资产，米黄 = 区域名。洋红 = 站位 / 路线（nav.ts）。
// URL：px（默认 1）、zoom、tx/tz、sunel/sunaz（默认 44° / 偏东 8°）、pause=1、labels=0、ph=0（不放占位）、nav=0、clouds=0、
//      edges=1、warm、seed、pal=<配色>（不带 = 6 午后金光；右上角切换）；画廊：v、ref=0、ground=paver|asphalt|sand、cy。
// 共用的 three.js 核心（管线、色阶材质、配色方案、复用资产）从 ../clubfront 只读 import，不复制、不改。
// stage 3（演出）：life.ts 跑停车场的日常（来车、落客、代客停车、取车、门童、球包车），SLOTS 里动的那些（车、会员、代客、门童、
// 停着的车 park-*）交给它建；?life=0 = 原来的白模定格（截图对比用）。默认玩法模式（总监由玩家操控，play.ts）；?play=0 = 只看。
import '../clubsite/render/colors';
import * as THREE from 'three';
import { type Hud, mountPlay, type Play } from '../clubsite/play';
import type { RegionJobs } from '../clubsite/region';
import { SCHEMES, schemeById } from '../clubsite/render/palettes';
import { mountPaletteSwitcher } from '../clubsite/render/palettes/switcher';
import { PixelPipeline } from '../clubsite/render/pipeline';
import { CLOUD_N } from '../clubsite/render/toon';
import type { SharedUniforms } from './ctx';
import { CLOUD_VEL, CLOUDS, MPT, SUN, VIEW } from './layout';
import { EL, type Pal, SKY } from './palette';
import { placeholder, SPECS } from './placeholders';
import { REUSED } from './reuse';
import { createParkKit, createParkRegion, type Kind, OWN, type ParkRegion } from './scene';

const params = new URLSearchParams(location.search);
const num = (k: string, d: number) => (params.has(k) ? Number(params.get(k)) : d);
const deg = Math.PI / 180;
/** 配色：不带 ?pal = 6 午后金光（golden）；pal=current = 原来的沙漠配色 */
const scheme = schemeById(params.get('pal'));

const galleryId = params.get('asset');
/** 玩法模式（默认）：总监交给玩家；?play=0 = 只看（拖动平移、白模标签） */
const PLAY = !galleryId && params.get('play') !== '0';
/** 日常演出（默认开）；?life=0 = 白模定格 */
const LIFE = !galleryId && params.get('life') !== '0';
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

const PX0 = num('px', galleryId ? 2 : 1);
const zoom = num('zoom', (MPT * PX0) / 2);
const designTexel = (zoom * 2) / PX0;
const landscape = innerWidth > innerHeight;
const view = landscape ? VIEW.landscape : VIEW.portrait;
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
    target: new THREE.Vector3(num('tx', view.tx), 0, num('tz', view.tz)),
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

// 太阳：午后晴天，画面后方偏东、仰角 44°（朝镜头的墙落暗档，投影落向左下，比正午长一点）。
// 场景在 x 60…105：太阳和阴影相机都围着场景中心放，不是原点。
const SUN_TARGET = galleryId ? new THREE.Vector3(0, 0, 0) : new THREE.Vector3(80, 0, 0);
const sun = new THREE.DirectionalLight(scheme?.sun ?? 0xfff0d8, 1);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -46, right: 46, top: 46, bottom: -46, near: 1, far: 180 });
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.04;
sun.shadow.radius = 4;
sun.target.position.copy(SUN_TARGET);
scene.add(sun, sun.target);
/** 太阳：仰角、方位（度；0 = 正北 = 画面正后方，正 = 偏东 → 影子落向左下） */
function setSun(elevDeg: number, azDeg: number) {
  const el = elevDeg * deg;
  const az = azDeg * deg;
  sun.position
    .set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el))
    .multiplyScalar(80)
    .add(SUN_TARGET);
}
setSun(num('sunel', SUN.el), num('sunaz', SUN.az));

const host = {
  scene,
  parent: scene,
  uniforms,
  params,
  texelMeters: () => pipe.rig.metersPerTexel,
  designTexel,
  life: LIFE,
  play: PLAY,
};
const kit = createParkKit(host, { gallery: !!galleryId });
const { mats, ctxFor, makeAsset, palOpts } = kit;

interface Label {
  el: HTMLDivElement;
  p: THREE.Vector3;
}
const labels: Label[] = [];
const showLabels = (params.has('labels') ? params.get('labels') !== '0' : !PLAY && !LIFE) && !galleryId;
function addLabel(text: string, p: THREE.Vector3, kind: Kind | 'zone') {
  if (!showLabels) return;
  const el = document.createElement('div');
  el.className = `lab ${kind}`;
  el.textContent = text;
  labelsEl.appendChild(el);
  labels.push({ el, p });
}

const updaters: ((dt: number, t: number) => void)[] = [];
const collectUpdaters = (o: THREE.Object3D) =>
  o.traverse((c) => {
    const u = c.userData.update as ((dt: number, t: number) => void) | undefined;
    if (u) updaters.push(u);
  });

let region: ParkRegion | null = null;
let life: ParkRegion['life'];
let play: (Play & { hud: Hud }) | null = null;
let jobs: RegionJobs | null = null;
if (galleryId) buildGallery(galleryId);
else {
  region = createParkRegion({ ...host, label: showLabels ? addLabel : undefined }, kit);
  const count = region.counts;
  if (showLabels)
    infoEl.textContent = `clubpark 白模 · 占位 ${count.placeholder} · 复用 ${count.reused} · 新画 ${count.own}`;
  else infoEl.style.display = 'none';
  Object.assign(window, { __parkTerrain: region.terrain });
  life = region.life;
  if (PLAY) {
    const st = region.start;
    play = mountPlay({
      scene,
      pipe,
      canvas,
      director: region.director() as THREE.Object3D,
      start: st.start,
      yaw: st.yaw,
      nav: { groundAt: region.groundAt, ...region.nav() },
      camera: st.camera,
      hint: st.hint,
    });
    jobs = region.attach(play);
  }
}

function buildGallery(id: string) {
  const variant = num('v', 0);
  const { obj, kind } = makeAsset(id, variant);
  if (params.has('pose')) obj.userData.pose?.(params.get('pose'), params.has('phase') ? num('phase', 0) : undefined);
  scene.add(obj);
  collectUpdaters(obj);
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const hw = Math.max(2, size.x / 2 + 1.2);
  const hd = Math.max(2, size.z / 2 + 1.2, size.z / 2 + size.y * 1.4 * 0.6);
  const ctx = ctxFor(0);
  const g = params.get('ground');
  const key: keyof Pal = g === 'sand' ? 'sand' : g === 'asphalt' ? 'lotAsphalt' : 'paver';
  const el = ctx.mat(key, { elem: key === 'sand' ? EL.sand : key === 'paver' ? EL.paver : EL.lotAsphalt });
  const tile = new THREE.Mesh(new THREE.BoxGeometry(hw * 2, 1.2, hd * 2).translate(0, -0.6, 0), el);
  mats.prepare(tile);
  scene.add(tile);
  if (params.get('ref') !== '0') {
    const ref = placeholder(ctx, 'valet');
    ref.position.set(-hw + 0.5, 0, hd - 0.6);
    scene.add(ref);
  }
  const c = box.getCenter(new THREE.Vector3());
  pipe.rig.target.set(c.x, Math.max(0, c.y * 0.6), c.z + 0.4);
  if (pipe2) pipe2.rig.target.copy(pipe.rig.target);
  const sp = SPECS[id];
  const tx = (m: number) => Math.round(m / designTexel);
  const what = { own: '', reused: '（复用）', placeholder: '（还没画：占位）' }[kind];
  infoEl.textContent =
    `${id}${what} · v${variant} · 包围盒 ${size.x.toFixed(2)}×${size.y.toFixed(2)}×${size.z.toFixed(2)} 米` +
    ` = ${tx(size.x)}×${tx(size.y)}×${tx(size.z)} 设计纹素` +
    (sp ? ` · 规格 ${sp.w}×${sp.h}×${sp.d} 米` : '');
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
  document.body.style.background = hex(sky.top);
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
  const dpr = Math.min(devicePixelRatio, 3);
  pipe.resize(canvas.clientWidth, canvas.clientHeight, dpr);
  pipe2?.resize(canvas2.clientWidth, canvas2.clientHeight, dpr);
}
addEventListener('resize', resize);
resize();

// 像素级别（左上角）：每个纹素占几个 CSS 像素；米/纹素等比变，取景不变（同 clubfront）
const PX_LEVELS = [1, 1.5, 2, 3];
const PX_KEY = 'clubpark.px';
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
    region?.update(DT, simT);
    for (const u of updaters) u(DT, simT);
    play?.update(DT, simT);
    jobs?.step(DT);
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
  play?.hud.frame();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// 画廊的放大窗单独拖
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

// 拖动平移、双指/滚轮缩放（只看模式；玩法模式下摇杆、缩放归 clubsite/play 的 hud）
const pointers = new Map<number, { x: number; y: number }>();
let pinch0 = 0;
let zoom0 = pipe.rig.metersPerTexel;
canvas.addEventListener('pointerdown', (e) => {
  if (play) return;
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
    if (play) return;
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
  __park: {
    scene,
    pipe,
    pipe2,
    step,
    setSun,
    own: Object.keys(OWN),
    reused: Object.keys(REUSED),
    palOpts,
    get life() {
      return life;
    },
    get play() {
      return play;
    },
    region,
  },
});

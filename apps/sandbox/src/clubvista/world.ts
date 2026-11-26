// clubvista：俱乐部拆成四张主题小图（到达 / 中心球场 / 绿洲泳池 / 练习场），每张一两屏大，图和图之间走过去 → 圆形遮罩转场。
// 照《垂钓手记》溪流地图的搭法：边缘最密、中间最空；地形 2～3 层，层间朝镜头的崖是暗带；最大的安静面（球场 / 水）在最低层；
// 主路斜着弯过画面、支路通兴趣点；每张图"入口 → 目的地 → 歇脚"。设计和自评：docs/lab/2026-11-07-3d-pixel/clubvista.md。
// URL：map=<arrive|court|oasis|practice>（开局在哪张图）、at=x,z（本图坐标，开局站哪）、look=x,z（截图：镜头对准这里，配 pause=1）、
//      px、zoom、pause=1、warm=秒、hour、weather、pal（默认 vista = 午后金光 + 冷影；golden / current / …）、ph=0（不放白模）、
//      labels=1（白模标签）、clouds=0、audit=1（能走的范围叠在画面上：绿 = 能走，红 = 挡住）。
// 调试：window.__vista（play、go(图, 入口)、step(秒)、state()）。
import '../clubsite/render/colors';
import * as THREE from 'three';
import { mountDaylight } from '../clubsite/daylight';
import { type Hud, mountPlay, type Play, type Shape } from '../clubsite/play';
import { snapDelta, ViewLerp } from '../clubsite/play/smooth';
import { SCHEMES, schemeById } from '../clubsite/render/palettes';
import { mountPaletteSwitcher } from '../clubsite/render/palettes/switcher';
import { PixelPipeline } from '../clubsite/render/pipeline';
import { CLOUD_N } from '../clubsite/render/toon';
import { type BuiltMap, buildMap, createKit } from './build';
import type { SharedUniforms } from './ctx';
import { vista } from './grade';
import { createIris } from './iris';
import { MAP_GAP, MAPS } from './maps';
import { SPECS } from './placeholders';

const params = new URLSearchParams(location.search);
const num = (k: string, d: number) => (params.has(k) && params.get(k) !== '' ? Number(params.get(k)) : d);
const pair = (k: string): [number, number] | null => {
  const v = params.get(k);
  if (!v) return null;
  const [a, b] = v.split(',').map(Number);
  return Number.isFinite(a) && Number.isFinite(b) ? [a, b] : null;
};
const deg = Math.PI / 180;
const palId = params.get('pal') ?? 'vista';
const scheme = palId === 'vista' ? vista : schemeById(palId);
const PLAY = params.get('play') !== '0';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const labelsEl = document.getElementById('labels') as HTMLDivElement;

const uniforms: SharedUniforms = {
  uTime: { value: 0 },
  uWind: { value: new THREE.Vector2(0.8, 0.35).normalize().multiplyScalar(num('wind', 0.4)) },
  uGust: { value: 0.5 },
  uClouds: { value: Array.from({ length: CLOUD_N }, () => new THREE.Vector4(0, 0, 0, 0)) },
  uCloudVel: { value: new THREE.Vector2(0.25, 0) },
  uCloudStrength: { value: num('clouds', 1) },
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0a12);

const MPT = 0.09;
const PX0 = num('px', 1);
const zoom = num('zoom', (MPT * PX0) / 2);
const designTexel = (zoom * 2) / PX0;
const pipe = new PixelPipeline(canvas, {
  px: PX0,
  fxLayer: 1,
  rig: { target: new THREE.Vector3(14, 0, 30), yaw: 0, pitch: 45 * deg, metersPerTexel: zoom },
  edges: {
    depthStrength: num('dstr', scheme?.edges?.depthStrength ?? 0.48),
    normalStrength: num('nstr', scheme?.edges?.normalStrength ?? 0.6),
    topStrength: num('tstr', scheme?.edges?.topStrength ?? 0.35),
    tint: scheme?.edgeTint,
  },
});

// ── 太阳：画面后方偏东（影子落向左下）；阴影相机跟着总监、按阴影纹素对齐（同 clubwalk） ──
const sun = new THREE.DirectionalLight(scheme?.sun ?? 0xfff0d8, 1);
sun.castShadow = true;
const SH = 36;
const SH_MAP = 2048;
sun.shadow.mapSize.set(SH_MAP, SH_MAP);
Object.assign(sun.shadow.camera, { left: -SH, right: SH, top: SH, bottom: -SH, near: 1, far: 220 });
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.04;
sun.shadow.radius = 4;
scene.add(sun, sun.target);
const SUN = { el: num('sunel', 46), az: num('sunaz', 12) };
const sunDir = new THREE.Vector3(
  Math.sin(SUN.az * deg) * Math.cos(SUN.el * deg),
  Math.sin(SUN.el * deg),
  -Math.cos(SUN.az * deg) * Math.cos(SUN.el * deg),
);
const sunRight = new THREE.Vector3();
const sunUp = new THREE.Vector3();
const sunAt = new THREE.Vector2(36, 30);
function aimSun(dir: THREE.Vector3) {
  sunDir.copy(dir);
  sunRight.crossVectors(new THREE.Vector3(0, 1, 0), sunDir).normalize();
  sunUp.crossVectors(sunDir, sunRight).normalize();
  placeSun(sunAt.x, sunAt.y);
}
function placeSun(x: number, z: number) {
  sunAt.set(x, z);
  const p = new THREE.Vector3(x, 0, z);
  const texel = (SH * 2) / SH_MAP;
  const a = Math.round(p.dot(sunRight) / texel) * texel;
  const b = Math.round(p.dot(sunUp) / texel) * texel;
  const c = p.dot(sunDir);
  const q = sunRight.clone().multiplyScalar(a).addScaledVector(sunUp, b).addScaledVector(sunDir, c);
  sun.target.position.copy(q);
  sun.position.copy(q).addScaledVector(sunDir, 100);
}
aimSun(sunDir.clone());

// ── 四张图 ──
const kit = createKit({ uniforms, params, texelMeters: () => pipe.rig.metersPerTexel, designTexel, scheme });
const built: BuiltMap[] = MAPS.map((def, i) => {
  const b = buildMap(def, i * MAP_GAP, kit, params);
  b.root.visible = false;
  scene.add(b.root);
  return b;
});
const byId = (id: string) => built.find((b) => b.def.id === id) as BuiltMap;
let cur = byId(params.get('map') ?? 'arrive') ?? built[0];
cur.root.visible = true;

/** 世界坐标 → 哪张图 */
/** 四张图叠在一起（MAP_GAP 0）：地面高度、能不能走都问当前这张 */
const groundAt = (x: number, z: number) => cur.groundAt(x - cur.ox, z);

// 总监（clubsite/people 的 director；play 管它的姿势和位置）
const director = kit.makeAsset('director', 0).obj;
director.name = 'slot:director';
scene.add(director);

function setClouds(m: BuiltMap) {
  const cl = m.def.clouds;
  for (let i = 0; i < CLOUD_N; i++) {
    const c = cl[i];
    uniforms.uClouds.value[i].set(c ? c[0] + m.ox : 0, c ? c[1] : 0, c ? c[2] : 0, c ? c[3] : 0);
  }
}
setClouds(cur);
const viewOf = (m: BuiltMap) => {
  const v = m.def.view ?? { x0: 0, x1: m.def.W, z0: 0, z1: m.def.D };
  return { x0: v.x0 + m.ox, x1: v.x1 + m.ox, z0: v.z0, z1: v.z1 };
};

const start0 = pair('at') ?? cur.def.start.at;
/** 导航的坡道表：play 的 NavMap 拿的是这个数组本身，换图时原地换内容再 setBlocked 重建网格 */
const ramps = [...cur.ramps];
let play: (Play & { hud: Hud }) | null = null;
if (PLAY) {
  play = mountPlay({
    scene,
    pipe,
    canvas,
    director,
    start: [start0[0] + cur.ox, start0[1]],
    yaw: cur.def.start.yaw,
    nav: {
      groundAt,
      bounds: { x0: -20, x1: (built.length - 1) * MAP_GAP + 48, z0: -10, z1: 70 },
      surface: (x, z) => cur.surface(x, z),
      blocked: cur.blocked,
      ramps,
      stepUp: 0.32,
    },
    camera: { lead: { portrait: 1.6, landscape: 0.6 }, view: viewOf(cur) },
    hint: '按住画面往手指走 · 点地面走过去',
  });
} else {
  director.position.set(start0[0] + cur.ox, groundAt(start0[0] + cur.ox, start0[1]), start0[1]);
  pipe.rig.target.set(start0[0] + cur.ox, 0, start0[1]);
}
const look = pair('look');
if (look) pipe.rig.target.set(look[0] + cur.ox, 0, look[1]);

// ── 转场 ──
function screenOf(p: THREE.Vector3): { x: number; y: number } {
  if (play) return play.project(p, canvas.clientWidth, canvas.clientHeight);
  return { x: innerWidth / 2, y: innerHeight / 2 };
}
const head = new THREE.Vector3();
const iris = createIris({ center: () => screenOf(head.copy(director.position).setY(director.position.y + 1)) });
let armed = false;
let moving = false;
async function go(id: string, entry: string) {
  if (moving) return;
  moving = true;
  await iris.run(() => swapTo(id, entry));
  moving = false;
  play?.toast(cur.def.name, 2.2);
}
function swapTo(id: string, entry: string) {
  const to = byId(id);
  const e = to.def.entries[entry] ?? to.def.start;
  cur.root.visible = false;
  cur = to;
  cur.root.visible = true;
  setClouds(cur);
  const wx = e.at[0] + cur.ox;
  const wz = e.at[1];
  if (play) {
    ramps.splice(0, ramps.length, ...cur.ramps);
    play.nav.setBlocked(cur.blocked as Shape[]);
    play.setView(viewOf(cur));
    play.teleport(wx, wz, e.yaw);
  } else {
    director.position.set(wx, groundAt(wx, wz), wz);
    pipe.rig.target.set(wx, 0, wz);
  }
  placeSun(wx, wz);
  armed = false;
}
function checkExits() {
  if (moving || !play) return;
  const s = play.state();
  const lx = s.x - cur.ox;
  const lz = s.z;
  let near = false;
  for (const ex of cur.def.exits) {
    const d = Math.hypot(lx - ex.at[0], lz - ex.at[1]);
    if (d < ex.r) {
      near = true;
      if (armed) {
        void go(ex.to, ex.entry);
        return;
      }
    } else if (d < ex.r + 1.5) near = true;
  }
  if (!near) armed = true;
}

// ── 白模标签（?labels=1） ──
const labels: { el: HTMLDivElement; p: THREE.Vector3; m: BuiltMap }[] = [];
if (params.get('labels') === '1')
  for (const b of built)
    for (const pl of b.placed) {
      if (pl.kind !== 'placeholder') continue;
      const el = document.createElement('div');
      el.className = 'lab placeholder';
      el.textContent = SPECS[pl.prop.a]?.name ?? pl.prop.a;
      labelsEl.appendChild(el);
      const h = SPECS[pl.prop.a]?.h ?? 1;
      labels.push({ el, p: pl.obj.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, h + 0.3, 0)), m: b });
    }
function placeLabels() {
  if (!labels.length) return;
  for (const l of labels) {
    l.el.style.display = l.m === cur ? '' : 'none';
    if (l.m !== cur) continue;
    const s = screenOf(l.p);
    l.el.style.transform = `translate(${s.x.toFixed(0)}px, ${s.y.toFixed(0)}px) translate(-50%, -100%)`;
  }
}

// ── 能走的范围（?audit=1）：每 0.5 米一个点，绿 = 能站，红 = 不能（高差 / 挡路 / noWalk） ──
if (params.get('audit') === '1' && play) {
  const nav = play.nav;
  for (const b of [cur]) {
    const pos: number[] = [];
    const col: number[] = [];
    for (let z = -4; z <= b.def.D + 2; z += 0.5)
      for (let x = -16; x <= b.def.W + 16; x += 0.5) {
        const wx = x + b.ox;
        const h = nav.clearAt(wx, z);
        const ok = h !== null && !nav.hitsBlocked(wx, z, nav.body - 0.03);
        pos.push(x, (h ?? b.groundAt(x, z)) + 0.06, z);
        col.push(ok ? 0.2 : 1, ok ? 1 : 0.15, ok ? 0.3 : 0.2);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 2, sizeAttenuation: false, vertexColors: true }));
    pts.renderOrder = 10;
    b.root.add(pts);
  }
}

function resize() {
  pipe.resize(canvas.clientWidth, canvas.clientHeight, Math.min(devicePixelRatio, 3));
}
addEventListener('resize', resize);
resize();

const pxEl = document.getElementById('pxsel');
const palEl = document.getElementById('palsel');
if (palEl) mountPaletteSwitcher(palEl, [vista, ...SCHEMES], scheme?.id ?? 'current');
const day = mountDaylight({ scene, pipe, sun, uniforms, params, scheme, hud: pxEl, placeSun: aimSun });

const DT = 1 / 60;
let simT = 0;
function step(seconds: number) {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) {
    simT += DT;
    uniforms.uTime.value = simT;
    day.step(DT);
    uniforms.uGust.value = 0.5 + 0.35 * Math.sin(simT * 0.7) * Math.sin(simT * 0.23);
    for (const u of cur.updaters) u(DT, simT);
    play?.update(DT, simT);
    checkExits();
    if (play) {
      const s = play.state();
      if (Math.hypot(s.x - sunAt.x, s.z - sunAt.y) > 6) placeSun(s.x, s.z);
    }
  }
}
step(num('warm', 0));
if (look) pipe.rig.target.set(look[0] + cur.ox, 0, look[1]);
if (play) {
  const s = play.state();
  placeSun(s.x, s.z);
}
if (look) placeSun(look[0] + cur.ox, look[1]);

const paused = params.get('pause') === '1';
let last = performance.now();
let acc = 0;
let lerp: ViewLerp | null = null;
function frame(now: number) {
  acc += snapDelta(Math.min(0.1, (now - last) / 1000));
  last = now;
  if (play && !lerp) lerp = new ViewLerp(play.director, pipe.rig, scene);
  if (!paused) {
    while (acc >= DT) {
      lerp?.mark();
      step(DT);
      acc -= DT;
    }
    lerp?.begin(acc / DT);
  }
  day.frame();
  pipe.render(scene);
  placeLabels();
  play?.hud.frame();
  lerp?.end();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

Object.assign(window, {
  __vista: {
    scene,
    pipe,
    play,
    built,
    go,
    step,
    cur: () => cur.def.id,
    state: () => (play ? { ...play.state(), map: cur.def.id, lx: play.state().x - cur.ox } : null),
  },
});

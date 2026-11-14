// clubhouse：会所（西班牙复兴式、红瓦、钟楼、拱廊；地图西北角，和 clubmap2 / clubfood / clubstadium 同一套世界坐标）—— 白模阶段：手摆构图 + 调色板 + 占位。
// 外观 / 里面两种状态：?inside=1（或右下角的按钮、window.__house.setInside(true)）= 剖面（娃娃屋）：屋顶、二楼、钟楼隐藏，朝镜头的墙切到 1 米。
// 场景：  clubhouse.html                （占位 = 冷灰体块 + "#编号 名字" 标签；src/clubhouse/assets/<id>.ts 存在就换成资产）
// 画廊：  clubhouse.html?asset=<id>      （一块小台子上只放这个资产：上/左 = 最终缩放，下/右 = 同一画面放大 3 倍）
// 标签颜色：深灰 = 占位（要画的新资产），绿 = 已画的新资产，青 = 复用的资产，洋红 = 站位，橙 = 共享坐标的建议 / 门，半透明黑 = 区域名、房间名。
// URL：inside=1、px（每纹素 CSS 像素，默认 1；画廊 2）、zoom（米/纹素）、tx/tz、yaw/pitch（度）、sunel/sunaz、seed、warm、
//      pause=1（时间停在 0：截图稳定）、labels=0（不显示标签和站位）、ph=0（不放占位）、nav=0、clouds=0、
//      edges=1（只看描边）、pal=<id>（配色，不带 = 6 午后金光；右上角切换）；画廊：v（变体）、ref=0、ground=tile|sand、cy。
//      life=0（不要演出和总监的活：stage 3，stage3.ts 的 createHouseLife —— 三层各一个模块 life-1f / 2f / b1.ts）。
//
// 给 clubwalk 的接口：terrain.ts 的 buildHouse(ctx)（会所的壳，世界坐标）+ setInside(组, on)（按 userData.houseMode 切换）；
// 摆好的资产照 SLOTS 的 mode 打上同一个 userData.houseMode（这里的 buildScene 就是这么做的），同一个 setInside 一起切。
// 门的世界坐标：layout.ts 的 DOORS（clubsite/world.ts 的 CLUBHOUSE_DOORS 同一份数）；导航：layout.ts 的 WALKABLE + nav.ts 的 houseBlocked()。
import '../clubsite/render/colors';
import * as THREE from 'three';
import { mountDaylight } from '../clubsite/daylight';
import { type Hud, mountPlay, type Play, playEnabled } from '../clubsite/play';
import { topGeo, wallGeo } from '../clubsite/render/geo';
import { rngFactory } from '../clubsite/render/noise';
import { SCHEMES, schemeById, schemeMats, schemeOpts } from '../clubsite/render/palettes';
import { mountPaletteSwitcher } from '../clubsite/render/palettes/switcher';
import { PixelPipeline } from '../clubsite/render/pipeline';
import { CLOUD_N, createMats, type ToonOpts } from '../clubsite/render/toon';
import type { AssetBuild, AssetCtx, SharedUniforms } from './ctx';
import {
  AREA_LABELS,
  CLOUD_VEL,
  CLOUDS,
  CLUBHOUSE,
  DOORS,
  FLOOR_NAME,
  FLOOR_Y,
  type Floor,
  FOOT,
  GOODS_LIFT,
  GROUNDS,
  INTERIOR_BG,
  LIFT,
  MPT,
  outsideHouse,
  SUN,
  TARGET,
} from './layout';
import { buildNav, floorFor, houseNav, liftNext, SPOT_NAMES } from './nav';
import { PAL, type Pal, PROXY, SKY } from './palette';
import { gymPerson } from './people';
import { NEW_SPECS, placeholder, SPECS } from './placeholders';
import { REUSED } from './reuse';
import { SPOTS } from './routes';
import { SLOTS, type Slot } from './slots';
import { createHouseLife, type HouseLife } from './stage3';
import { buildTerrain, setView as setHouseView } from './terrain';
import { type HouseMode, type HouseView, viewOf, viewsFor } from './view';

const params = new URLSearchParams(location.search);
const num = (k: string, d: number) => (params.has(k) ? Number(params.get(k)) : d);
const deg = Math.PI / 180;
const rng = rngFactory(num('seed', 17));
/** 配色：不带 ?pal = 默认（6 午后金光 golden）；?pal=current = 原来的沙漠配色 */
const scheme = schemeById(params.get('pal'));

/** 这个场景自己画的资产（assets/<id>.ts，export function build）；同名的优先于复用的 */
const MODS = import.meta.glob<{ build: AssetBuild }>('./assets/*.ts', { eager: true });
const OWN: Record<string, AssetBuild> = {};
for (const [path, mod] of Object.entries(MODS)) {
  const id = path.replace('./assets/', '').replace(/\.ts$/, '');
  if (typeof mod.build === 'function') OWN[id] = mod.build;
}

const galleryId = params.get('asset');
/** 玩法模式（默认开）：总监能走、自己进出会所、上下楼、坐电梯；?play=0 = 原来的看图模式（拖动平移、双指缩放） */
const PLAY = playEnabled(params) && !galleryId;
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
const SKY_TEX = skyTexture();
const SKY_BODY = document.body.style.background;
/** 进楼（沉浸式）：外面的东西都藏起来，背景换成楼里的暗色（楼外的天、山、邻居一样都看不到） */
const INTERIOR = new THREE.Color(INTERIOR_BG);
scene.background = SKY_TEX;

// 默认每纹素 1 个 CSS 像素（画廊 2）。zoom = 实际的米/纹素，按 2× 时的 MPT 等比换算，取景不变。
const PX0 = num('px', galleryId ? 2 : 1);
const zoom = num('zoom', (MPT * PX0) / 2);
/** 素材按 2× 的纹素大小建模（线宽、板缝、最小厚度），和当前像素级别无关 */
const designTexel = (zoom * 2) / PX0;
const landscape = innerWidth > innerHeight;
/** 外观 / 里面（剖面） */
let inside = params.get('inside') === '1';
/** 看哪一层（剖面）：?floor=-1 | 1 | 2 */
let floor: Floor = (([-1, 1, 2] as const).find((f) => String(f) === params.get('floor')) ?? 1) as Floor;
/** 取景：外观 / 里面（负一层比会所大，单独一个取景） */
const targetFor = (on: boolean) =>
  TARGET[on ? (floor === -1 ? 'b1' : 'inside') : 'outside'][landscape ? 'landscape' : 'portrait'];
const T0 = targetFor(inside);
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
    target: new THREE.Vector3(num('tx', T0.x), 0, num('tz', T0.z)),
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

// 太阳：午后，画面后方、偏东 8°（layout.ts 的 SUN，同 clubpark / clubdesk / clubplaza / clubfood）。阴影相机罩住会所和四周（中心 −50, 0, −22）
const sun = new THREE.DirectionalLight(scheme?.sun ?? 0xfff0d8, 1);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -36, right: 36, top: 36, bottom: -36, near: 1, far: 180 });
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.04;
sun.shadow.radius = 4;
const SUN_C = galleryId ? new THREE.Vector3(0, 0, 0) : new THREE.Vector3(-50, 0, -22);
sun.target.position.copy(SUN_C);
scene.add(sun, sun.target);
/** 太阳：仰角、方位（度；0 = 正北 = 画面正后方，正 = 偏东 → 影子落向左下，负 = 偏西 → 右下） */
function setSun(elevDeg: number, azDeg: number) {
  const el = elevDeg * deg;
  const az = azDeg * deg;
  sun.position
    .set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el))
    .multiplyScalar(80)
    .add(SUN_C);
}
setSun(num('sunel', SUN.el), num('sunaz', SUN.az));

const mats = createMats(uniforms, () => pipe.rig.metersPerTexel);
/**
 * 调色板名字 → 材质参数；配色（?pal=）在这里换色。这个场景新加的材质（切墙、冷色瓷砖、橡木地板）和 clubplaza 的池水、花砖不在 GROUP 表里：
 * 借 palette.ts 的 PROXY 过同组的 grade。
 */
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
  const via = PROXY[key] ?? key;
  if (!scheme) return o;
  // biome-ignore lint/suspicious/noExplicitAny: 这个场景新加的材质名不在 clubfront 的 Pal 里，按 PROXY 借组调色
  return schemeOpts(scheme, via as any, o as any) as ToonOpts;
}
const ctxBase = {
  mats: scheme ? schemeMats(scheme, mats) : mats,
  pal: PAL,
  mat(key: keyof Pal, extra?: ToonOpts) {
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

type Kind = 'own' | 'reused' | 'placeholder' | 'spot' | 'area' | 'propose';
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
  /** 贴在点的下面（站位、挤在一起的小东西），默认在上面 */
  below: boolean;
  /** 在哪几种看法里显示（不给 = 都显示） */
  views?: HouseView[];
}
const labels: Label[] = [];
const showLabels = !galleryId && params.get('labels') !== '0';
function addLabel(text: string, p: THREE.Vector3, kind: Kind, below = kind === 'spot', views?: HouseView[]) {
  if (!showLabels) return;
  const el = document.createElement('div');
  el.className = `lab ${kind}`;
  el.textContent = text;
  labelsEl.appendChild(el);
  labels.push({ el, p, below, views });
}
/** 占位的标签："#编号 名字" */
const phText = (asset: string, id: string) => {
  const sp = NEW_SPECS[asset];
  return sp?.n ? `#${sp.n} ${sp.name ?? asset}` : id;
};

/** 演出 + 总监的活（stage 3）：建场景之后建；?life=0 = 没有 */
let life: HouseLife | null = null;
let lifeJobs: { step(dt: number): void } | null = null;

const counts: Record<HouseView, Record<string, number>> = {
  out: { own: 0, reused: 0, placeholder: 0 },
  b1: { own: 0, reused: 0, placeholder: 0 },
  '1f': { own: 0, reused: 0, placeholder: 0 },
  '2f': { own: 0, reused: 0, placeholder: 0 },
};
const slotViews = (s: Slot) => s.views ?? viewsFor(s.level ?? 1, s.mode);
/** 标签：'out' 的只在外观（屋顶、钟楼上的字不进剖面）；别的照摆件的规则 */
const lv = (m?: HouseMode, level: Floor = 1): HouseView[] => (m === 'out' ? ['out'] : viewsFor(level, m));
if (galleryId) buildGallery(galleryId);
else buildScene();

function buildScene() {
  const ctx = ctxFor(0);
  const terrain = buildTerrain(ctx);
  scene.add(terrain.root);
  const showPh = params.get('ph') !== '0';
  const labelled = new Set<string>();
  const QUIET = ['player', 'coach', 'agave', 'brittlebush', 'creosote', 'smoke-tree', 'palo-verde', 'fan-palm'];
  for (const s of SLOTS) {
    const { obj, kind } = makeAsset(s.asset, s.variant ?? 0);
    if (kind === 'placeholder' && !showPh) continue;
    // 人：包一层健身姿势（不认识的姿势名照旧交给 clubsite/people）；场景里从 slot 的 phase 接着循环
    gymPerson(obj, ctxFor(s.variant ?? 0), { loop: true });
    const vs = slotViews(s);
    for (const v of vs) counts[v][kind]++;
    const y = s.y ?? FLOOR_Y[s.level ?? 1];
    obj.position.set(s.x, y, s.z);
    obj.rotation.y = s.rotY ?? 0;
    obj.scale.setScalar(s.s ?? 1);
    obj.name = `slot:${s.id}`;
    obj.userData.houseViews = vs;
    // 会所外面的摆件（四周的植物、邻居、地上的天窗）：进楼是沉浸式的，看剖面时藏起来
    obj.userData.houseOutside = outsideHouse(s.x, s.z, s.level ?? 1);
    if (s.prop !== undefined) obj.userData.setProp?.(s.prop);
    if (s.pose) obj.userData.pose?.(s.pose[0], s.pose[1]);
    scene.add(obj);
    applyPerson(obj, s);
    collectUpdaters(obj);
    const sp = SPECS[s.asset];
    const top = new THREE.Vector3(s.x, y + (sp?.h ?? 1) * (s.s ?? 1) + 0.3, s.z);
    if (s.noLabel) continue;
    // 玩法模式：总监会走，摆的位置上的标签就不对了
    if (PLAY && s.asset === 'director') continue;
    if (s.labelAt) addLabel(s.label ?? phText(s.asset, s.id), new THREE.Vector3(...s.labelAt), kind, true, vs);
    else if (kind === 'placeholder' || kind === 'own')
      addLabel(
        s.label ?? phText(s.asset, s.id),
        s.labelBelow ? new THREE.Vector3(s.x, y, s.z) : top,
        kind,
        s.labelBelow,
        vs,
      );
    else if (s.label) addLabel(s.label, top, kind, false, vs);
    else if (!labelled.has(s.asset) && !QUIET.includes(s.asset)) {
      labelled.add(s.asset);
      addLabel(s.asset, top, kind, false, vs);
    }
  }
  for (const a of AREA_LABELS)
    addLabel(a.text, new THREE.Vector3(a.x, a.y, a.z), (a.kind ?? 'area') as Kind, false, lv(a.mode, a.level));
  if (showLabels && params.get('nav') !== '0') {
    scene.add(buildNav(ctx, terrain.groundAt));
    for (const [k, name] of Object.entries(SPOT_NAMES)) {
      const at = SPOTS[k].at;
      const y = at.length > 2 ? (at[2] as number) : 0;
      addLabel(
        name,
        new THREE.Vector3(at[0], y + 0.05, at[1] + 0.3),
        'spot',
        true,
        lv('in', y > 2 ? 2 : y < -2 ? -1 : 1),
      );
    }
  }
}

/** 人物的 SLOT 字段：坐（setSeat）、看哪里（lookAt，要世界坐标 → 放进场景以后） */
function applyPerson(obj: THREE.Object3D, s: Slot) {
  const ud = obj.userData;
  if (s.seat) ud.setSeat?.(s.seat[0], s.seat[1] ?? 0);
  obj.updateMatrixWorld(true);
  if (s.look) ud.lookAt?.(new THREE.Vector3(...s.look));
}

/**
 * 外观 ↔ 里面。on = 里面（剖面）。frame = 相机挪到这个模式的默认取景（clubwalk 自己管相机时不要）。
 * 切 visible（setHouseInside：会所的壳 + 摆好的资产都按 userData.houseMode）、标签、右下角按钮的字、URL（截图方便）。
 */
function setInside(on: boolean, frame = true) {
  inside = on;
  const view = viewOf(on, floor);
  setHouseView(scene, view);
  life?.setView(on, floor);
  if (!galleryId) {
    scene.background = on ? INTERIOR : SKY_TEX;
    document.body.style.background = on ? `#${INTERIOR.getHexString()}` : SKY_BODY;
  }
  for (const l of labels) l.el.style.display = !l.views || l.views.includes(view) ? '' : 'none';
  if (frame) {
    const t = targetFor(on);
    pipe.rig.target.set(t.x, on ? FLOOR_Y[floor] : 0, t.z);
  }
  syncFloorBtns();
  if (showLabels) {
    const c = counts[view];
    infoEl.textContent = `clubhouse 白模 · ${on ? `里面（剖面 ${view.toUpperCase()}）` : '外观'} · 占位 ${c.placeholder} · 复用 ${c.reused} · 新画 ${c.own}`;
  } else infoEl.style.display = 'none';
  try {
    const u = new URL(location.href);
    if (on) u.searchParams.set('inside', '1');
    else u.searchParams.delete('inside');
    if (floor !== 1) u.searchParams.set('floor', String(floor));
    else u.searchParams.delete('floor');
    history.replaceState(null, '', u);
  } catch {}
}
/** 看哪一层（剖面）：换层 + 切进剖面 */
function setFloor(f: Floor, frame = true) {
  floor = f;
  setInside(true, frame);
}

function buildGallery(id: string) {
  const variant = num('v', 0);
  const { obj, kind } = makeAsset(id, variant);
  gymPerson(obj, ctxFor(variant));
  if (params.has('pose')) obj.userData.pose?.(params.get('pose'), params.has('phase') ? num('phase', 0) : undefined);
  scene.add(obj);
  collectUpdaters(obj);
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  // 小台子要接得住投影（太阳在后方，影子落向镜头 ≈ 0.9 × 高）
  const c0 = box.getCenter(new THREE.Vector3());
  const hw = Math.max(2, size.x / 2 + 1.2);
  const hd = Math.max(2, size.z / 2 + 1.2, size.z / 2 + size.y * 1.4 * 0.6);
  const pts: [number, number][] = [];
  const r = 0.8;
  for (let k = 0; k < 4; k++) {
    const cx = c0.x + (k === 0 || k === 3 ? 1 : -1) * (hw - r);
    const cz = c0.z + (k < 2 ? 1 : -1) * (hd - r);
    for (let i = 0; i <= 4; i++) {
      const a = (k * Math.PI) / 2 + (i / 4) * (Math.PI / 2);
      pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
    }
  }
  const ctx = ctxFor(0);
  const tile = new THREE.Group();
  tile.add(new THREE.Mesh(topGeo(pts, 0), ctx.mat(params.get('ground') === 'sand' ? 'sandHigh' : 'tile')));
  tile.add(new THREE.Mesh(wallGeo(pts, 0, -zoom * 1.2, true), ctx.mat('cap')));
  tile.add(new THREE.Mesh(wallGeo(pts, -zoom * 1.2, -1.2, true), ctx.mat('adobe')));
  ctx.mats.prepare(tile);
  scene.add(tile);
  if (params.get('ref') !== '0') {
    const ref = placeholder(ctx, 'player');
    ref.position.set(c0.x - hw + 0.5, 0, c0.z + hd - 0.6);
    scene.add(ref);
  }
  pipe.rig.target.set(c0.x, Math.max(0, c0.y * 0.6), c0.z + 0.4);
  if (pipe2) pipe2.rig.target.copy(pipe.rig.target);
  const sp = SPECS[id];
  const tx = (m: number) => Math.round(m / designTexel);
  const what = { own: '', reused: '（复用）', placeholder: '（还没画：占位）' }[kind as 'own'];
  infoEl.textContent =
    `${id}${what ?? ''} · v${variant} · 包围盒 ${size.x.toFixed(2)}×${size.y.toFixed(2)}×${size.z.toFixed(2)} 米` +
    ` = ${tx(size.x)}×${tx(size.y)}×${tx(size.z)} 设计纹素` +
    (sp ? ` · 规格 ${sp.w}×${sp.h}×${sp.d} 米` : '');
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
  document.body.style.background = hex(sky.top);
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

// 像素级别（左上）：每个纹素占几个 CSS 像素。切换时米/纹素按同样比例变，取景范围不变，只换像素的粗细。
const PX_LEVELS = [1, 1.5, 2, 3];
const PX_KEY = 'clubhouse.px';
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
      b.setAttribute('aria-pressed', String(Number((b as HTMLElement).dataset.px) === pipe.px));
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
// 时间和天气（clubsite/daylight：太阳绕着走、影子跟着转，夜里月亮 + 灯；左上角的时间面板）。画廊不接
const day = galleryId ? null : mountDaylight({ scene, pipe, sun, uniforms, params, scheme, sky: SKY, hud: pxEl });

// 换层（右下角一列，拇指够得着；玩法模式下挪到动作键上面）：2F / 1F / B1 / 外观，当前的那个 aria-pressed。
// 看图模式：点一层 = setFloor（剖面看那一层，相机挪过去），外观 = setInside(false)。
// 玩法模式：像坐电梯 —— 总监传送到那一层的电梯门口（外观 = 一层正门外），导航、剖面跟着换（画面永远是总监所在的那一层）。
type FloorKey = Floor | 'out';
const FLOOR_BTNS: [FloorKey, string][] = [
  [2, '2F'],
  [1, '1F'],
  [-1, 'B1'],
  ['out', '外观'],
];
const floorBtns = new Map<FloorKey, HTMLButtonElement>();
function syncFloorBtns() {
  const cur: FloorKey = inside ? floor : 'out';
  for (const [k, b] of floorBtns) b.setAttribute('aria-pressed', String(k === cur));
}
const modeEl = document.getElementById('modesel');
if (modeEl && !galleryId) {
  document.body.classList.toggle('play', PLAY);
  for (const [k, text] of FLOOR_BTNS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `px-chip floor-btn${k === 'out' ? ' out' : ''}`;
    b.textContent = text;
    b.setAttribute('aria-label', k === 'out' ? '看外观' : `看 ${text}`);
    b.addEventListener('click', () => {
      if (play) goFloor(k);
      else if (k === 'out') setInside(false);
      else setFloor(k);
    });
    floorBtns.set(k, b);
    modeEl.append(b);
  }
}

// ── 玩法：总监（clubsite/play）。导航每层一张（nav.ts 的 houseNav）：surface 是个壳，读当前层的 surface
//    （NavMap 留着 spec 对象，换层时只换 curSurface + setBlocked 重建网格）。楼梯段在 surface 里，不给 ramps。
type HouseNav = ReturnType<typeof houseNav>;
const navCache = new Map<Floor, HouseNav>();
const navOf = (f: Floor): HouseNav => {
  let n = navCache.get(f);
  if (!n) navCache.set(f, (n = houseNav(f)));
  return n;
};
/** 总监现在用哪一层的导航 */
let navFloor: Floor = 1;
let curSurface = navOf(1).surface;
const YAW_W = -Math.PI / 2;
const YAW_E = Math.PI / 2;
/** 进了会所的脚印（一层的 L 形，往里缩 0.2 米）= 剖面 */
const inFoot = (x: number, z: number) =>
  FOOT[1].some((r) => x > r.x0 + 0.2 && x < r.x1 - 0.2 && z > r.z0 + 0.2 && z < r.z1 - 0.2);
let play: (Play & { hud: Hud }) | null = null;
const director = PLAY ? scene.getObjectByName('slot:director') : undefined;
if (PLAY && director) {
  // 外观那个总监变成会走的那个：三种看法里都显示；剖面里摆着的那个（director-in）拿掉
  delete director.userData.houseViews;
  delete director.userData.houseMode;
  const dirIn = scene.getObjectByName('slot:director-in');
  if (dirIn) dirIn.removeFromParent();
  // ?inside=1（&floor=…）开局在那一层的电梯门口，不然在正门外（朝西，往里走）
  const startIn = inside;
  if (startIn) {
    navFloor = floor;
    curSurface = navOf(floor).surface;
  }
  play = mountPlay({
    scene,
    pipe,
    canvas,
    director,
    start: startIn ? LIFT.door : DOORS.main.out,
    yaw: startIn ? YAW_E : YAW_W,
    nav: {
      groundAt: () => 0,
      bounds: { x0: GROUNDS.x0, x1: CLUBHOUSE.x1 + 0.5, z0: GROUNDS.z0, z1: -1 },
      walkable: navOf(navFloor).walkable,
      blocked: navOf(navFloor).blocked,
      surface: (x, z) => curSurface(x, z),
    },
    camera: { lead: { portrait: 1.4, landscape: 0.5 } },
    hint: '拖动走路 · 点地面走过去 · 右边换层',
  });
  // 电梯：站在门口（三层同一个 x、z）按动作键 → 下一层（往上，到顶回负一层）
  const liftAt = new THREE.Vector3();
  play.add({
    id: 'lift',
    at: () => liftAt.set(LIFT.x1, FLOOR_Y[navFloor] + 1.2, LIFT.door[1]),
    stand: () => LIFT.door,
    radius: 1.0,
    label: () => `坐电梯 → ${FLOOR_NAME[liftNext(navFloor)]}`,
    onUse: (p) =>
      p.busy({
        name: 'lift',
        dur: 0.6,
        pose: 'idle',
        face: [LIFT.x1, LIFT.door[1]],
        mid: () => ride(liftNext(navFloor)),
      }),
  });
  // 货梯（东翼，后门边上）：同样往上一层（1F 货梯厅 → 2F 后厨 → B1 洗衣房）
  const goodsAt = new THREE.Vector3();
  play.add({
    id: 'goods-lift',
    at: () => goodsAt.set((GOODS_LIFT.x0 + GOODS_LIFT.x1) / 2, FLOOR_Y[navFloor] + 1.2, GOODS_LIFT.z1),
    stand: () => GOODS_LIFT.door,
    radius: 1.0,
    label: () => `坐货梯 → ${FLOOR_NAME[liftNext(navFloor)]}`,
    onUse: (p) =>
      p.busy({
        name: 'goods-lift',
        dur: 0.6,
        pose: 'idle',
        face: [(GOODS_LIFT.x0 + GOODS_LIFT.x1) / 2, GOODS_LIFT.z1],
        mid: () => ride(liftNext(navFloor), GOODS_LIFT.door),
      }),
  });
}
/** 换导航的层：先换 surface 再重建网格（rebuild 读 surface） */
function setNavFloor(f: Floor) {
  if (!play || f === navFloor) return;
  navFloor = f;
  curSurface = navOf(f).surface;
  play.nav.setBlocked(navOf(f).blocked);
}
/** 坐电梯 / 点换层按钮：到那一层的电梯门口（出电梯，朝东），剖面跟过去 */
function ride(f: Floor, at: readonly [number, number] = LIFT.door) {
  if (!play) return;
  setNavFloor(f);
  play.teleport(at[0], at[1], at === LIFT.door ? YAW_E : 0);
  setFloor(f, false);
  play.toast(FLOOR_NAME[f]);
}
/** 玩法模式的换层按钮 */
function goFloor(k: FloorKey) {
  if (!play) return;
  if (k === 'out') {
    if (!inside) return;
    setNavFloor(1);
    floor = 1;
    play.teleport(DOORS.main.out[0], DOORS.main.out[1], YAW_W);
    setInside(false, false);
    return;
  }
  if (inside && k === navFloor) return;
  ride(k);
}
/** 每个模拟步（play.update 之后）：进出会所 → 剖面 / 外观；脚下高度过了阈值 → 换那一层的导航和剖面 */
function housePost() {
  if (!play || !director) return;
  const p = director.position;
  const next = floorFor(navFloor, p.y);
  if (next !== navFloor) {
    setNavFloor(next);
    setFloor(next, false);
  }
  const inHouse = navFloor !== 1 || inFoot(p.x, p.z);
  if (inHouse !== inside) setInside(inHouse, false);
}

if (!galleryId && params.get('life') !== '0') {
  life = createHouseLife({
    parent: scene,
    ctxFor,
    rng,
    texel: designTexel,
    make: (asset, variant) => makeAsset(asset, variant).obj,
    playing: !!play,
    director: () => (play && director) || null,
  });
  if (play) lifeJobs = life.attach(play);
}

if (!galleryId) {
  setInside(PLAY && director ? inFoot(director.position.x, director.position.z) || navFloor !== 1 : inside, false);
  if (inside && !play) pipe.rig.target.y = FLOOR_Y[floor];
}

const DT = 1 / 60;
let simT = 0;
function step(seconds: number) {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) {
    simT += DT;
    uniforms.uTime.value = simT;
    day?.step(DT);
    uniforms.uGust.value = 0.5 + 0.35 * Math.sin(simT * 0.7) * Math.sin(simT * 0.23);
    for (const u of updaters) u(DT, simT);
    life?.update(DT, simT);
    play?.update(DT, simT);
    lifeJobs?.step(DT);
    housePost();
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
    if (l.el.style.display === 'none') continue;
    v3.copy(l.p).project(cam);
    const x = ((v3.x + 1) / 2) * lowW - (lowW - W) / 2;
    const y = ((1 - v3.y) / 2) * lowH - (lowH - Hh) / 2;
    l.el.style.transform = `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px) translate(-50%, ${l.below ? '30%' : '-100%'})`;
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
  day?.frame();
  pipe.render(scene);
  pipe2?.render(scene);
  placeLabels();
  play?.hud.frame();
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

// 拖动平移、双指/滚轮缩放（白模查看，只在 ?play=0；玩法模式是 clubsite/play 的摇杆 + 相机跟着总监）
if (!PLAY) mountViewerDrag();
function mountViewerDrag() {
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
}

Object.assign(window, {
  __house: {
    scene,
    pipe,
    pipe2,
    step,
    setSun,
    /** 外观 ↔ 里面（frame = 相机挪到默认取景） */
    setInside,
    /** 看哪一层（-1 | 1 | 2）；玩法模式下 = 坐电梯过去 */
    setFloor: (f: Floor, frame = true) => {
      if (![-1, 1, 2].includes(f)) return;
      if (play) goFloor(f);
      else setFloor(f, frame);
    },
    play,
    /** 演出 + 总监的活（?life=0 = null）：life.debug['1f' | '2f' | 'b1']、life.walkers() */
    life,
    navFloor: () => navFloor,
    isInside: () => inside,
    floor: () => floor,
    own: Object.keys(OWN),
    reused: Object.keys(REUSED),
    palOpts,
  },
});

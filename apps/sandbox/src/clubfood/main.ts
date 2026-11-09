// clubfood：会所旁边的餐车院子（餐厅小景；印第安维尔斯沙漠，和 clubmap2 / clubstadium / clubplaza 同一套世界坐标）—— 白模阶段：手摆构图 + 调色板 + 占位。
// 场景：  clubfood.html                （占位 = 冷灰体块 + "#编号 名字" 标签，车顶 / 篷 / 伞面涂提议的主色；src/clubfood/assets/<id>.ts 存在就换成资产）
// 画廊：  clubfood.html?asset=<id>      （一块小台子上只放这个资产：上/左 = 最终缩放，下/右 = 同一画面放大 3 倍）
// 标签颜色：深灰 = 占位（要画的新资产），绿 = 已画的新资产，青 = 复用的资产，洋红 = 站位，橙 = 共享坐标的建议，半透明黑 = 区域名。
// URL：px（每纹素 CSS 像素，默认 1；画廊 2）、zoom（米/纹素）、tx/tz、yaw/pitch（度）、sunel/sunaz、seed、warm、
//      pause=1（时间停在 0：截图稳定）、labels=0（不显示标签和站位）、ph=0（不放占位）、accent=0（占位全灰，不涂主色）、nav=0、clouds=0、
//      edges=1（只看描边）、pal=<id>（配色，不带 = 6 午后金光；右上角切换）；画廊：v（变体）、ref=0、ground=tile|sand、cy。
import '../clubdesk/colors';
import * as THREE from 'three';
import { rngFactory } from '../clubdesk/noise';
import { PixelPipeline } from '../clubdesk/pipeline';
import { CLOUD_N, createMats, type Mats, type ToonOpts } from '../clubdesk/toon';
import { SCHEMES, schemeById, schemeMats, schemeOpts } from '../clubfront/palettes';
import { mountPaletteSwitcher } from '../clubfront/palettes/switcher';
import { topGeo, wallGeo } from '../clubfront/terrain';
import { AREA_LABELS, CLOUD_VEL, CLOUDS, MPT, SLOTS, type Slot, SPOTS, SUN, TARGET } from './layout';
import { buildNav, SPOT_NAMES } from './nav';
import { PAL, type Pal, PROXY, SKY } from './palette';
import { festoonBetween, NEW_SPECS, placeholder, SPECS } from './placeholders';
import { REUSED } from './reuse';
import { buildTerrain } from './terrain';
import type { AssetBuild, AssetCtx, SharedUniforms } from './world';

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

// 默认每纹素 1 个 CSS 像素（画廊 2）。zoom = 实际的米/纹素，按 2× 时的 MPT 等比换算，取景不变。
const PX0 = num('px', galleryId ? 2 : 1);
const zoom = num('zoom', (MPT * PX0) / 2);
/** 素材按 2× 的纹素大小建模（线宽、板缝、最小厚度），和当前像素级别无关 */
const designTexel = (zoom * 2) / PX0;
const landscape = innerWidth > innerHeight;
const T0 = landscape ? TARGET.landscape : TARGET.portrait;
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

// 太阳：午后，画面后方、偏东 8°（layout.ts 的 SUN，同 clubpark / clubdesk / clubplaza）。阴影相机罩住院子、会所和两边（中心 −34, 0, −24）
const sun = new THREE.DirectionalLight(scheme?.sun ?? 0xfff0d8, 1);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -36, right: 36, top: 36, bottom: -36, near: 1, far: 180 });
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.04;
sun.shadow.radius = 4;
const SUN_C = galleryId ? new THREE.Vector3(0, 0, 0) : new THREE.Vector3(-34, 0, -24);
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
 * 调色板名字 → 材质参数；配色（?pal=）在这里换色。这个场景提议的主色（FOOD）和 clubplaza 的池水、花砖不在 clubfront 的 GROUP 表里：
 * 借 palette.ts 的 PROXY 过同组的 grade（冷色借 club、暖色借 accent、叶绿借 plants）。
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
  const g = schemeOpts(scheme, via as any, o as any) as ToonOpts;
  const k = SUN_SKIP[key];
  return k ? unSun(g, scheme.sun, k) : g;
}

/**
 * toon shader 的亮档会乘太阳色（mix(1, 太阳色 / 最大分量, 0.35)；午后 0xffcf96 → 绿 ×0.93、蓝 ×0.86）。
 * 池水的亮档本来是青（#68d7d9），乘完变成薄荷绿 #68c9ba。水面亮的地方是反射的天光，不该被太阳染那么暖：
 * 这些材质的亮档先除掉太阳色的 k 份（k 1 = 一点不染），渲出来就是清的青绿。
 */
const SUN_SKIP: Partial<Record<keyof Pal, number>> = { fountainWater: 0.75 };
function unSun(o: ToonOpts, sunHex: number, k: number): ToonOpts {
  const sc = new THREE.Color(sunHex);
  const m = Math.max(sc.r, sc.g, sc.b, 1e-3);
  // 颜色管理是关的（clubdesk/colors.ts）：Color(hex) 和 shader 里的太阳色都是 sRGB 原值，逐通道除就是精确的
  const f = [sc.r, sc.g, sc.b].map((c) => 1 / (1 + (c / m - 1) * 0.35 * k));
  const fix = (c: THREE.ColorRepresentation) => {
    const x = new THREE.Color(c);
    const h = x.getHex();
    const ch = [(h >> 16) & 255, (h >> 8) & 255, h & 255].map((v, i) => Math.min(255, Math.round(v * f[i])));
    return (ch[0] << 16) | (ch[1] << 8) | ch[2];
  };
  const out: ToonOpts = { ...o };
  if (o.ramp) out.ramp = [fix(o.ramp[0]), o.ramp[1], o.ramp[2]];
  if (o.tones) {
    const t = o.tones;
    out.tones = {
      bands: [t.bands[0].map(fix), t.bands[1], t.bands[2]] as typeof t.bands,
      seam: [fix(t.seam[0]), t.seam[1], t.seam[2]],
      hi: [fix(t.hi[0]), t.hi[1], t.hi[2]],
    };
  }
  return out;
}
const ctxBase = {
  // biome-ignore lint/suspicious/noExplicitAny: clubfront/toon 和这里的 toon 是同一份代码的两份拷贝，类型结构相同
  mats: scheme ? (schemeMats(scheme, mats as any) as unknown as Mats) : mats,
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
}
const labels: Label[] = [];
const showLabels = !galleryId && params.get('labels') !== '0';
function addLabel(text: string, p: THREE.Vector3, kind: Kind, below = kind === 'spot') {
  if (!showLabels) return;
  const el = document.createElement('div');
  el.className = `lab ${kind}`;
  el.textContent = text;
  labelsEl.appendChild(el);
  labels.push({ el, p, below });
}
/** 占位的标签："#编号 名字" */
const phText = (asset: string, id: string) => {
  const sp = NEW_SPECS[asset];
  return sp?.n ? `#${sp.n} ${sp.name ?? asset}` : id;
};

if (galleryId) buildGallery(galleryId);
else buildScene();

function buildScene() {
  const ctx = ctxFor(0);
  const terrain = buildTerrain(ctx);
  scene.add(terrain.root);
  const showPh = params.get('ph') !== '0';
  const count: Record<string, number> = { own: 0, reused: 0, placeholder: 0 };
  const labelled = new Set<string>();
  for (const s of SLOTS) {
    const made = makeAsset(s.asset, s.variant ?? 0);
    const { kind } = made;
    let obj = made.obj;
    if (kind === 'placeholder' && !showPh) continue;
    // 串灯：两头都是世界坐标（占位 / 资产都按两头重建）
    if (s.to && kind === 'placeholder') {
      const y0 = s.y ?? 0;
      obj = festoonBetween(
        ctxFor(s.variant ?? 0),
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(s.to[0] - s.x, s.to[1] - y0, s.to[2] - s.z),
      );
    } else if (s.to) obj.userData.setEnds?.(new THREE.Vector3(s.x, s.y ?? 0, s.z), new THREE.Vector3(...s.to));
    count[kind]++;
    const y = s.y ?? terrain.groundAt(s.x, s.z);
    obj.position.set(s.x, y, s.z);
    obj.rotation.y = s.rotY ?? 0;
    obj.scale.setScalar(s.s ?? 1);
    obj.name = `slot:${s.id}`;
    if (s.prop !== undefined) obj.userData.setProp?.(s.prop);
    if (s.pose) obj.userData.pose?.(s.pose[0], s.pose[1]);
    scene.add(obj);
    applyPerson(obj, s);
    collectUpdaters(obj);
    const sp = SPECS[s.asset];
    const top = new THREE.Vector3(s.x, y + (sp?.h ?? 1) * (s.s ?? 1) + 0.3, s.z);
    if (s.noLabel) continue;
    if (s.labelAt) addLabel(phText(s.asset, s.id), new THREE.Vector3(...s.labelAt), kind, true);
    else if (kind === 'placeholder' || kind === 'own')
      addLabel(phText(s.asset, s.id), s.labelBelow ? new THREE.Vector3(s.x, y, s.z) : top, kind, s.labelBelow);
    else if (s.label) addLabel(s.label, top, kind);
    else if (
      !labelled.has(s.asset) &&
      ![
        'player',
        'kid',
        'coach',
        'agave',
        'brittlebush',
        'creosote',
        'bench',
        'smoke-tree',
        'palo-verde',
        'fan-palm',
      ].includes(s.asset)
    ) {
      labelled.add(s.asset);
      addLabel(s.asset, top, kind);
    }
  }
  for (const a of AREA_LABELS) addLabel(a.text, new THREE.Vector3(a.x, a.y, a.z), a.kind ?? 'area');
  if (showLabels && params.get('nav') !== '0') {
    scene.add(buildNav(ctx, terrain.groundAt));
    for (const [k, name] of Object.entries(SPOT_NAMES)) {
      const [x, z] = SPOTS[k as keyof typeof SPOTS];
      addLabel(name, new THREE.Vector3(x, terrain.groundAt(x, z) + 0.05, z + 0.3), 'spot');
    }
  }
  if (showLabels)
    infoEl.textContent = `clubfood 白模 · 占位 ${count.placeholder} · 复用 ${count.reused} · 新画 ${count.own}`;
  else infoEl.style.display = 'none';
}

/** 人物的 SLOT 字段：坐（setSeat）、看哪里（lookAt，要世界坐标 → 放进场景以后） */
function applyPerson(obj: THREE.Object3D, s: Slot) {
  const ud = obj.userData;
  if (s.seat) ud.setSeat?.(s.seat[0], s.seat[1] ?? 0);
  obj.updateMatrixWorld(true);
  if (s.look) ud.lookAt?.(new THREE.Vector3(...s.look));
}

function buildGallery(id: string) {
  const variant = num('v', 0);
  const { obj, kind } = makeAsset(id, variant);
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
const PX_KEY = 'clubfood.px';
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

// 拖动平移、双指/滚轮缩放（白模查看；玩法阶段换成摇杆 + 相机跟着总监，desert3d-v2 的 control.ts）
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
  __food: {
    scene,
    pipe,
    pipe2,
    step,
    setSun,
    own: Object.keys(OWN),
    reused: Object.keys(REUSED),
    palOpts,
  },
});

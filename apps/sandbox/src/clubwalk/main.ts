// clubwalk：把做好的俱乐部场景连成一个大世界，总监在里面走来走去（试验中，docs/lab/2026-11-07-3d-pixel/clubwalk.md）。
// 一个画面管线、一个相机（yaw 0、俯角 45°、跟着总监）、一个太阳（el 44 / az 8，阴影相机跟着总监）、一个总监（clubsite/play）。
// 底图 = clubmap2 的整张低细节地图（地面、山、天、步道、建筑、植物），一直在；细节场景按区域（regions.ts）走近了才建，
// 建好的区域把底图上自己那块藏掉；离开画面的区域藏起来、停演出、撤掉互动点（建过的留着）。
// URL：px（默认 1）、zoom、pause=1、warm=秒、at=x,z（开局站哪）、walk=x,z（开局点地面走过去）、
//      route=x,z;x,z;…（依次走过去，截图用）、pal、seed、life=0、clouds=0、eager=1（开局就把所有区域建好）、perf=1（左下角性能）、
//      smooth=0（关掉渲染插值和帧间隔贴齐）、prebuild=0（关掉站着时的预建），对照用。
import '../clubsite/render/colors';
import * as THREE from 'three';
import { CLOUDS as CLAY_CLOUDS } from '../clubclay/layout';
import { CLOUDS as DESK_CLOUDS } from '../clubdesk/layout';
import { GOLF_GATE } from '../clubgolf/layout';
import { INTERIOR_BG, outsideHouse } from '../clubhouse/layout';
import { floorFor } from '../clubhouse/nav';
import type { HouseRegion } from '../clubhouse/scene';
import { buildMap } from '../clubmap2/build';
import { PAL as MAP_PAL, type Pal as MapPal } from '../clubmap2/palette';
import { placements } from '../clubmap2/scatter';
import { CLOUDS as PARK_CLOUDS, SPOTS as PARK_SPOTS } from '../clubpark/layout';
import { createParkKit } from '../clubpark/scene';
import { CLOUDS as PLAZA_CLOUDS } from '../clubplaza/layout';
import { mountDaylight } from '../clubsite/daylight';
import { director as clubDirector } from '../clubsite/people';
import {
  type Circle,
  type Hud,
  type Item,
  mountPlay,
  NavMap,
  type Play,
  type Ramp,
  type Shape,
} from '../clubsite/play';
import { snapDelta, ViewLerp } from '../clubsite/play/smooth';
import type { Region, RegionJobs } from '../clubsite/region';
import type { AssetCtx, BaseCtx, SharedUniforms } from '../clubsite/render/ctx';
import { rngFactory } from '../clubsite/render/noise';
import { schemeById, schemeMats, schemeOpts } from '../clubsite/render/palettes';
import { PixelPipeline } from '../clubsite/render/pipeline';
import { CLOUD_N, createMats, type ToonOpts } from '../clubsite/render/toon';
import { REUSED } from '../clubsite/reuse';
import {
  CLUBHOUSE,
  COURT_FENCES,
  COURTS,
  DRIVE,
  fencePieces,
  GATE,
  GOLF,
  GROUNDS,
  LAWN,
  PATHS,
  POOL,
  type Rect,
} from '../clubsite/world';
import { mountCast } from './cast';
import { clipMesh } from './clip';
import { grow, keepOwn, outside, overlaps, shapeBox } from './navclip';
import { inRects, REGIONS, type RegionDef, rectDist } from './regions';

const params = new URLSearchParams(location.search);
const num = (k: string, d: number) => (params.has(k) ? Number(params.get(k)) : d);
const pair = (k: string): [number, number] | null => {
  const v = params.get(k);
  if (!v) return null;
  const [a, b] = v.split(',').map(Number);
  return Number.isFinite(a) && Number.isFinite(b) ? [a, b] : null;
};
const deg = Math.PI / 180;
const scheme = schemeById(params.get('pal'));
const LIFE = params.get('life') !== '0';
const canvas = document.getElementById('c') as HTMLCanvasElement;
const placeEl = document.getElementById('place') as HTMLDivElement;
const perfEl = document.getElementById('perf') as HTMLDivElement;
const mapEl = document.getElementById('minimap') as HTMLCanvasElement;

// ── 共用的 uniform：云影挑各场景手摆的几团（同一条带里的不要两团） ──
const CLOUDS = [
  PARK_CLOUDS[0],
  PARK_CLOUDS[2],
  DESK_CLOUDS[0],
  DESK_CLOUDS[4],
  DESK_CLOUDS[6],
  CLAY_CLOUDS[0],
  PLAZA_CLOUDS[0],
  PLAZA_CLOUDS[3],
];
const uniforms: SharedUniforms = {
  uTime: { value: 0 },
  uWind: { value: new THREE.Vector2(0.8, 0.35).normalize().multiplyScalar(num('wind', 0.4)) },
  uGust: { value: 0.5 },
  uClouds: { value: Array.from({ length: CLOUD_N }, (_, i) => new THREE.Vector4(...(CLOUDS[i] ?? [0, 0, 0, 0]))) },
  uCloudVel: { value: new THREE.Vector2(0.12, 0) },
  uCloudStrength: { value: num('clouds', 1) },
};

const scene = new THREE.Scene();
const SKY_TEX = skyTexture();
const SKY_BODY = document.body.style.background;
const INTERIOR = new THREE.Color(INTERIOR_BG);
scene.background = SKY_TEX;
/** 进会所（沉浸式）：只画会所（stream 里别的区域、底图都藏），背景换成楼里的暗色 */
let immersive = false;
function setImmersive(on: boolean) {
  immersive = on;
  scene.background = on ? INTERIOR : SKY_TEX;
  document.body.style.background = on ? `#${INTERIOR.getHexString()}` : SKY_BODY;
}

// 默认每纹素 1 个 CSS 像素；米/纹素 = 0.09 × px / 2（同各场景）
const MPT = 0.09;
const PX0 = num('px', 1);
const zoom = num('zoom', (MPT * PX0) / 2);
const designTexel = (zoom * 2) / PX0;
const START: [number, number] = pair('at') ?? [PARK_SPOTS.director[0], PARK_SPOTS.director[1]];
const pipe = new PixelPipeline(canvas, {
  px: PX0,
  fxLayer: 1,
  rig: {
    target: new THREE.Vector3(START[0], 0, START[1] + 1),
    yaw: 0,
    pitch: 45 * deg,
    metersPerTexel: zoom,
  },
  edges: {
    depthStrength: scheme?.edges?.depthStrength ?? 0.48,
    normalStrength: scheme?.edges?.normalStrength ?? 0.6,
    topStrength: scheme?.edges?.topStrength ?? 0.35,
    tint: scheme?.edgeTint,
  },
});

// 绘制次数按一整帧（颜色 + 法线 + 投影 + 合成）累计：每帧开头手动清零
pipe.renderer.info.autoReset = false;

// ── 太阳：统一 el 44 / az 8；阴影相机跟着总监，按阴影纹素对齐（走路时影子边不闪） ──
const SUN = { el: num('sunel', 44), az: num('sunaz', 8) };
const sun = new THREE.DirectionalLight(scheme?.sun ?? 0xfff0d8, 1);
sun.castShadow = true;
const SH = 34;
const SH_MAP = 2048;
sun.shadow.mapSize.set(SH_MAP, SH_MAP);
Object.assign(sun.shadow.camera, { left: -SH, right: SH, top: SH, bottom: -SH, near: 1, far: 200 });
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.04;
sun.shadow.radius = 4;
scene.add(sun, sun.target);
const sunDir = new THREE.Vector3(
  Math.sin(SUN.az * deg) * Math.cos(SUN.el * deg),
  Math.sin(SUN.el * deg),
  -Math.cos(SUN.az * deg) * Math.cos(SUN.el * deg),
);
const sunRight = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), sunDir).normalize();
const sunUp = new THREE.Vector3().crossVectors(sunDir, sunRight).normalize();
/** 太阳方向换了（时间系统 clubsite/daylight 每帧给）：重算阴影相机的纹素网格，再按上次的位置摆 */
const sunAt = new THREE.Vector2(START[0], START[1]);
function aimSun(dir: THREE.Vector3) {
  if (dir.equals(sunDir)) return;
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
  sun.position.copy(q).addScaledVector(sunDir, 90);
}
placeSun(START[0], START[1]);

// ── 底图：clubmap2 的整张地图（低细节），按区域切开 ──
const host0 = {
  uniforms,
  params,
  texelMeters: () => pipe.rig.metersPerTexel,
  designTexel,
};
const mapMats = createMats(uniforms, host0.texelMeters);
function mapOpts(key: keyof MapPal, extra?: ToonOpts): ToonOpts {
  const sw = MAP_PAL[key];
  const o: ToonOpts = {
    ramp: sw.ramp,
    edge: sw.edge,
    convex: sw.convex,
    tones: sw.tones,
    ...('opts' in sw ? sw.opts : {}),
    ...extra,
  };
  // biome-ignore lint/suspicious/noExplicitAny: 地图新加的材质名不在 clubfront 的 Pal 里，按全局调色走
  return scheme ? schemeOpts(scheme, key as any, o) : o;
}
const mapRng = rngFactory(num('seed', 13));
const mapCtx = {
  mats: scheme ? schemeMats(scheme, mapMats) : mapMats,
  pal: MAP_PAL,
  mat: (key: keyof MapPal, extra?: ToonOpts) => mapMats.toon(0xffffff, mapOpts(key, extra)),
  rng: mapRng,
  uniforms,
  layers: { FX: 1 },
  texel: designTexel,
  params: new URLSearchParams(),
  variant: 0,
};
/** 底图：rest = 不归任何区域的（一直显示）；每个区域一块（区域没显示时显示） */
const base = { rest: new THREE.Group(), by: new Map<string, THREE.Group>() };
base.rest.name = 'base:rest';
scene.add(base.rest);
for (const d of REGIONS) {
  const g = new THREE.Group();
  g.name = `base:${d.id}`;
  base.by.set(d.id, g);
  scene.add(g);
}
const ALL_RECTS = REGIONS.flatMap((d) => d.rects);
const ownerOf = (x: number, z: number): RegionDef | null => REGIONS.find((d) => inRects(d.rects, x, z)) ?? null;
{
  const t0 = performance.now();
  const map = buildMap(mapCtx);
  map.updateMatrixWorld(true);
  const meshes: THREE.Mesh[] = [];
  map.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
  });
  for (const m of meshes) {
    // 山、天幕：在所有区域外面，整个留
    if (m.name.startsWith('mtn')) {
      base.rest.attach(m);
      continue;
    }
    for (const d of REGIONS) {
      const piece = m.clone();
      if (clipMesh(piece, d.rects, 'in')) base.by.get(d.id)?.attach(piece);
    }
    if (clipMesh(m, ALL_RECTS, 'out')) base.rest.attach(m);
  }
  // 植物、长椅、人：按位置归区域
  for (const p of placements(mapRng)) {
    const b = REUSED[p.asset];
    if (!b) continue;
    const o = b({ ...mapCtx, variant: p.v ?? 0 } as unknown as AssetCtx);
    o.position.set(p.x, p.y ?? 0, p.z);
    o.scale.setScalar(p.s ?? 1);
    if (p.rotY) o.rotation.y = p.rotY;
    if (p.asset === 'player' || p.asset === 'coach' || p.asset === 'director') {
      o.userData.setProp?.(p.prop === undefined ? 'racket' : p.prop);
      o.userData.pose?.('idle', 0);
    }
    const d = ownerOf(p.x, p.z);
    (d ? base.by.get(d.id) : base.rest)?.add(o);
  }
  // 底图是静的（没有演出、风摆在着色器里）：世界矩阵算一次就冻住，每帧的 updateMatrixWorld 跳过这整片（≈ 1500 个物体）
  for (const g of [base.rest, ...base.by.values()]) freezeMatrices(g);
  console.info(`clubwalk: 底图 ${(performance.now() - t0).toFixed(0)} ms`);
}

/** 静的一整片：世界矩阵算好，以后 scene.updateMatrixWorld 整片跳过（要再动它得先把 matrixWorldAutoUpdate 设回 true） */
function freezeMatrices(g: THREE.Object3D) {
  g.updateMatrixWorld(true);
  g.matrixWorldAutoUpdate = false;
}

// ── 总监：唯一的一个（clubsite/people 的 director，用停车场的调色建） ──
const dirKit = createParkKit(host0);
const director = clubDirector(dirKit.ctxFor(0) as unknown as BaseCtx);
director.name = 'slot:director';
director.userData.setProp?.(null);
director.userData.pose?.('idle', 0);
director.position.set(START[0], 0, START[1]);
scene.add(director);

// ── 区域 ──
interface Live {
  def: RegionDef;
  root: THREE.Group;
  region: Region | null;
  /** 导航的高度判断（区域自己的 walkable + ramps + groundAt），建好以后才有 */
  oracle: NavMap | null;
  /** 区域 nav() 的坡道（台阶）：surface 先查它们 */
  ramps: Ramp[];
  navBounds: Rect | null;
  blocked: Shape[];
  jobs: RegionJobs | null;
  attached: boolean;
  visible: boolean;
  /** 不想要了多久（秒）：超过 HIDE_AFTER 才藏（来回走在边上不闪） */
  idle: number;
  /** 一开始在范围外藏起来的摆件（演出把它们挪进来以后再显示） */
  hidden: { obj: THREE.Object3D; p: THREE.Vector3 }[];
  buildMs: number;
  /** 着色器预编完了（pipe.prewarm） */
  warm: boolean;
  /** 画过了（调试日志用） */
  drawn: boolean;
  scoped: Scoped | null;
}
const lives: Live[] = REGIONS.map((def) => {
  const root = new THREE.Group();
  root.name = `region:${def.id}`;
  root.visible = false;
  root.matrixWorldAutoUpdate = false;
  scene.add(root);
  return {
    def,
    root,
    region: null,
    oracle: null,
    ramps: [],
    navBounds: null,
    blocked: [],
    jobs: null,
    attached: false,
    visible: false,
    idle: 0,
    hidden: [],
    buildMs: 0,
    warm: false,
    drawn: false,
    scoped: null,
  };
});

let play: (Play & { hud: Hud }) | null = null;

function buildRegion(L: Live) {
  const t0 = performance.now();
  const r = L.def.create({
    scene,
    parent: L.root,
    uniforms,
    params,
    texelMeters: host0.texelMeters,
    designTexel,
    life: LIFE,
    play: true,
    director,
  });
  L.region = r;
  const rects = L.def.rects;
  // 地图边的山：底图有
  for (const m of L.root.children.filter((c) => c.name === 'mtn')) m.removeFromParent();
  for (const c of [...L.root.children]) {
    if (c.name === 'terrain') {
      c.updateMatrixWorld(true);
      const ms: THREE.Mesh[] = [];
      c.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) ms.push(o as THREE.Mesh);
      });
      for (const m of ms) {
        if (m.name.startsWith('mtn') || m.parent?.name === 'mtn') {
          m.removeFromParent();
          continue;
        }
        if (!clipMesh(m, rects, 'in')) m.removeFromParent();
      }
      c.traverse((o) => {
        if (o.name === 'mtn') o.visible = false;
      });
    } else if (c.name.startsWith('slot:')) {
      if (!inRects(rects, c.position.x, c.position.z)) {
        c.visible = false;
        L.hidden.push({ obj: c, p: c.position.clone() });
      }
    }
  }
  // 导航
  takeNav(L);
  // 会所：开局是外观（走进门里切成剖面，见 step 里的 houseInside）
  const house = asHouse(r);
  house?.setInside(false);
  // 会所三层、每层一张导航：换层（楼梯上过了 floorFor 的阈值、坐电梯）→ 重取这一层的导航，重建会所那块的世界网格
  house?.onFloor(() => {
    takeNav(L);
    if (!play) return;
    const next = allBlocked();
    play.nav.setBlocked(next, grow(L.def.rects, 1));
    navBlocked = next;
    navPrep = true;
  });
  L.buildMs = performance.now() - t0;
  // 着色器先编（颜色 / 法线 / 投影三套）：离进画面还有 WANT_MARGIN 那么远，异步编完再画就不卡
  const t1 = performance.now();
  const p0 = pipe.renderer.info.programs?.length ?? 0;
  void pipe.prewarm(L.root, scene).then(() => {
    L.warm = true;
    console.info(`clubwalk: 预编完 ${L.def.id} ${(performance.now() - t1).toFixed(0)} ms`);
  });
  const p1 = pipe.renderer.info.programs?.length ?? 0;
  console.info(
    `clubwalk: 建 ${L.def.id} ${L.buildMs.toFixed(0)} ms（预编 ${p1 - p0} 个程序，提交 ${(performance.now() - t1).toFixed(0)} ms）`,
  );
}

/**
 * 区域的导航 → 高度判断（oracle）+ 挡路的（只取中心在区域范围里的）。区域给了 surface（会所：按层的地面 + 这一层的楼梯）就用它，
 * 代替 walkable + groundAt（RegionNav 的类型里没有 surface，按需读）。
 */
function takeNav(L: Live) {
  const r = L.region as Region;
  const nav = r.nav() as ReturnType<Region['nav']> & { surface?(x: number, z: number): number | null };
  L.navBounds = nav.bounds;
  // 坡道在区域自己的导航 bounds 里才算（同独立页面：NavMap.height 先查 bounds）
  L.ramps = (nav.ramps ?? []).filter((q) => overlaps(q, nav.bounds, 0));
  L.oracle = new NavMap({
    groundAt: r.groundAt,
    bounds: nav.bounds,
    walkable: nav.walkable,
    ramps: nav.ramps,
    surface: nav.surface,
    cell: 1000,
  });
  // 挡路的：和区域范围重叠的整个留（一道墙跨过邻居、中心落在邻居那儿的也留，例如高尔夫的南墙）
  L.blocked = (nav.blocked ?? []).filter((s) => keepOwn(s, L.def.rects));
}
/** 会所的区域（有 setInside / setFloor / onFloor 的）；别的区域 = null */
const asHouse = (r: Region | null | undefined): HouseRegion | null =>
  r && 'onFloor' in r && 'setFloor' in r ? (r as HouseRegion) : null;
// ── 世界导航：每个点归哪个区域（建好的用区域自己的，没建的、区域外的用底图的粗规则） ──
const NAV_BOUNDS: Rect = { x0: -66, x1: 120, z0: -45, z1: 78 };
/** 底图能走的：围墙里 + 门外的车道、停车场 */
const BASE_WALK: Rect[] = [
  { x0: GROUNDS.x0 + 0.5, x1: GATE.x - 0.4, z0: GROUNDS.z0 + 0.5, z1: GROUNDS.z1 - 0.5 },
  { x0: GATE.x - 0.5, x1: 118, z0: -27, z1: 27 },
  // 南墙外的高尔夫（门在西步道南头）
  { x0: GROUNDS.x0, x1: 92, z0: GROUNDS.z1 - 0.6, z1: 74 },
];
const BASE_BLOCKED: Shape[] = (() => {
  const out: Shape[] = [];
  for (const f of COURT_FENCES) {
    const alongX = Math.abs(f.z1 - f.z0) < 1e-6;
    const [a0, a1] = alongX ? [f.x0, f.x1] : [f.z0, f.z1];
    for (const [p, q] of fencePieces(a0, a1, f.doors))
      out.push(alongX ? { a: [p, f.z0], b: [q, f.z0], r: 0.12 } : { a: [f.x0, p], b: [f.x0, q], r: 0.12 });
  }
  const stadium = COURTS.find((c) => c.kind === 'stadium');
  if (stadium) out.push({ x0: stadium.x - 26, x1: stadium.x + 26, z0: stadium.z - 16, z1: stadium.z - 9.6 });
  out.push(CLUBHOUSE, POOL);
  // 东墙（门洞留着）
  out.push({ a: [GATE.x, GROUNDS.z0], b: [GATE.x, GATE.z0 - 0.8], r: 0.4 });
  out.push({ a: [GATE.x, GATE.z1 + 0.8], b: [GATE.x, GROUNDS.z1], r: 0.4 });
  // 南墙（西步道南头的高尔夫门洞留着；同 clubgolf 的 nav）
  out.push({ a: [GOLF.x0, GOLF_GATE.z], b: [GOLF_GATE.x0, GOLF_GATE.z], r: 0.4 });
  out.push({ a: [GOLF_GATE.x1, GOLF_GATE.z], b: [GOLF.x1, GOLF_GATE.z], r: 0.4 });
  return out;
})();
/**
 * 建好的区域里、哪个区域的导航都不管的地方，哪些能走：门外的车道（DRIVE，同停车场的车道宽 ±0.4）一直到导航网格东边
 * （x 118 起是山口那段，到 120 还是平的，passY = 0）
 */
const OUTER_WALK: Rect[] = [{ x0: DRIVE.x0, x1: NAV_BOUNDS.x1, z0: DRIVE.z0 - 0.4, z1: DRIVE.z1 + 0.4 }];
const baseSurface = (x: number, z: number) => (inRects(BASE_WALK, x, z) ? 0 : null);
/** 这一点的导航问哪个区域：区域的 navFrom 里写了、那个区域也建好了就问它，否则问自己 */
function navOwner(own: Live, x: number, z: number): Live {
  const f = own.def.navFrom?.find((n) => inRects([n.r], x, z));
  const L = f ? lives.find((l) => l.def.id === f.from) : null;
  return L?.oracle ? L : own;
}
function surface(x: number, z: number): number | null {
  // 坡道（台阶）先问：台阶是区域明确给的能走的面，伸过区域边的那一截也按它（泳池东门台阶的脚伸进会员场的西步道、
  // 广场西沿的台阶落在中心球场的范围里）。坡道的高度和独立页面一样（区域自己的 NavMap 先查坡道）
  for (const L of lives) {
    if (!L.oracle) continue;
    for (const r of L.ramps) {
      if (x < r.x0 || x > r.x1 || z < r.z0 || z > r.z1) continue;
      const h = L.oracle.height(x, z);
      if (h !== null) return h;
    }
  }
  const rect = lives.find((L) => inRects(L.def.rects, x, z));
  const own = rect && navOwner(rect, x, z);
  if (own?.oracle) {
    const h = own.oracle.height(x, z);
    if (h !== null) return h;
    const nb = own.navBounds;
    if (nb && x >= nb.x0 && x <= nb.x1 && z >= nb.z0 && z <= nb.z1) return null;
    // 区域自己的导航不管这里（区域的范围比它的导航大）：问别的建好的区域
    for (const L of lives) {
      if (L === own || !L.oracle) continue;
      const g = L.oracle.height(x, z);
      if (g !== null) return g;
    }
    // 建好的区域的导航都不管这里（例如停车场的导航到 x 92，范围到 140）：画出来的车道接着走
    if (lives.some((L) => L.navBounds && inRects([L.navBounds], x, z))) return null;
    return inRects(OUTER_WALK, x, z) ? 0 : null;
  }
  return baseSurface(x, z);
}
function allBlocked(): Shape[] {
  // 底图的：建好的区域范围里那段裁掉（区域自己的导航管），范围外那段留着（底图照样画着，例如青训场 x 27 以东的围网）
  const built = lives.filter((L) => L.oracle).flatMap((L) => L.def.rects);
  const out: Shape[] = BASE_BLOCKED.flatMap((s) => outside(s, built));
  for (const L of lives) if (L.oracle) out.push(...L.blocked);
  return out;
}

// ── 包一层 play：互动点 / 顶栏 / 气泡的 id 加区域前缀；区域藏起来时撤掉互动点；顶栏只显示总监所在区域的 ──
interface Scoped {
  play: Play;
  setActive(on: boolean): void;
  setCurrent(on: boolean): void;
  owns(itemId: string): boolean;
  /** 收这件东西的互动点（区域登记的） */
  taker(item: Item): Parameters<Play['add']>[0] | null;
}
function scopePlay(p: Play, rid: string): Scoped {
  const inters = new Map<string, Parameters<Play['add']>[0]>();
  const stats = new Map<string, { label: string; value: string | number }>();
  const bubbles = new Set<string>();
  const items = new Set<string>();
  let active = true;
  let current = false;
  const pre = (id: string) => `${rid}:${id}`;
  const w: Play = Object.create(p);
  w.add = (it) => {
    const x = { ...it, id: pre(it.id) };
    inters.set(it.id, x);
    if (active) p.add(x);
    return () => {
      if (inters.get(it.id) === x) {
        inters.delete(it.id);
        p.remove(x.id);
      }
    };
  };
  w.remove = (id) => {
    inters.delete(id);
    p.remove(pre(id));
  };
  w.get = (id) => p.get(pre(id));
  w.addItem = (spec) => {
    items.add(spec.id);
    return p.addItem(spec);
  };
  w.addBlocker = (fn) => p.addBlocker(() => (active ? fn() : null));
  w.blockPerson = (obj, r = 0.3) => {
    const c: Circle = { x: 0, z: 0, r };
    return w.addBlocker(() => {
      if (!obj.visible || !obj.parent || obj === p.director) return null;
      c.x = obj.matrixWorld.elements[12] || obj.position.x;
      c.z = obj.matrixWorld.elements[14] || obj.position.z;
      return c;
    });
  };
  w.stat = (key, label, value) => {
    if (value === null) stats.delete(key);
    else stats.set(key, { label, value });
    if (current) p.stat(pre(key), label, value);
  };
  w.bubble = (key, anchor, text, dy) => {
    bubbles.add(key);
    p.bubble(pre(key), active ? anchor : null, text, dy);
  };
  w.toast = (text, sec) => {
    if (current) p.toast(text, sec);
  };
  return {
    play: w,
    owns: (id) => items.has(id),
    taker(item) {
      const st = p.state();
      for (const x of inters.values()) if (x.onPutDown && x.accepts?.(item, st)) return x;
      return null;
    },
    setActive(on) {
      if (on === active) return;
      active = on;
      for (const x of inters.values()) {
        if (on) p.add(x);
        else p.remove(x.id);
      }
      if (!on) for (const k of bubbles) p.bubble(pre(k), null);
    },
    setCurrent(on) {
      if (on === current) return;
      current = on;
      for (const [k, s] of stats) p.stat(pre(k), s.label, on ? s.value : null);
    },
  };
}

// ── 区域的显示 / 演出：画面范围（+ 余量）碰到的区域要；建好、显示、登记互动点 ──
const WANT_MARGIN = 14;
/** 画面外多少米以内的区域画出来（太阳在北：北边的东西影子落进画面） */
const RENDER_MARGIN = 6;
const HIDE_AFTER = 2;
function viewRect(margin: number): Rect {
  const low = pipe.lowSize;
  const mpt = pipe.rig.metersPerTexel;
  const hw = (low.x * mpt) / 2 + margin;
  const hd = (low.y * mpt) / 2 / Math.sin(pipe.rig.pitch) + margin;
  const t = pipe.rig.target;
  return { x0: t.x - hw, x1: t.x + hw, z0: t.z - hd, z1: t.z + hd };
}
const wanted = (L: Live, v: Rect) => L.def.rects.some((r) => rectDist(r, v) === 0);

function setVisible(L: Live, on: boolean) {
  L.visible = on;
  L.root.visible = on;
  // 藏起来的区域不演、不画：每帧的世界矩阵也不用算（显示回来那一帧照常算）
  L.root.matrixWorldAutoUpdate = on;
  const b = base.by.get(L.def.id);
  if (b) b.visible = !on;
  if (play && L.region) {
    if (on && !L.attached) {
      L.attached = true;
      L.scoped = scopePlay(play, L.def.id);
      // 有的场景开局把工具塞到总监手里（会员场的吹叶机、中心球场的…）：大世界里放回它该在的地方，手里原来的还给他
      const before = play.held();
      const ta = performance.now();
      L.jobs = L.region.attach(L.scoped.play);
      console.info(`clubwalk: 接入 ${L.def.id} ${(performance.now() - ta).toFixed(0)} ms`);
      const now = play.held();
      if (now && now !== before) {
        const it = play.take();
        const t = it && L.scoped.taker(it);
        if (it && t?.onPutDown) t.onPutDown(it, play);
        else if (it) it.place(director.position.x + 0.6, director.position.z + 0.6);
        if (before && before.where !== 'gone' && before.where !== 'held') play.give(before);
      }
    }
    L.scoped?.setActive(on);
  }
}

/** 总监站着不动多久（秒）以后开始预建：建一个区域主线程要卡 0.1～0.5 秒，站着的时候卡，比走着的时候卡看不出来 */
const PREBUILD_IDLE = 0.4;
/** prebuild=0 关掉预建（对照用） */
const PREBUILD = params.get('prebuild') !== '0';
/** 预建两个区域之间至少隔多久（秒）：让中间的帧把画面、编着色器跟上 */
const PREBUILD_GAP = 0.3;
let stillT = 0;
let sinceBuild = 0;
/** 这一帧建过区域（主线程卡了一下）：下一帧不追时间，免得卡完总监和镜头一下跳一大截 */
let hitched = false;

/** 一帧最多建一个（建一个 0.1～0.5 秒）。要用的（画面 + WANT_MARGIN 碰到的）马上建；站着不动时按远近预建别的 */
function stream(dt: number, force = false) {
  const v = viewRect(WANT_MARGIN);
  let built = false;
  const fresh: Live[] = [];
  const moving = !!play && (play.state().speed > 0.05 || play.pathLeft() > 0);
  stillT = moving ? 0 : stillT + dt;
  sinceBuild += dt;
  for (const L of lives) {
    const want = wanted(L, v);
    if (want && !L.region) {
      if (built && !force) continue;
      buildRegion(L);
      built = true;
      fresh.push(L);
    }
    if (!L.region) continue;
    const held = play?.held();
    const keep = want || (held && L.scoped?.owns(held.id));
    if (keep) {
      L.idle = 0;
      if (!L.visible) setVisible(L, true);
    } else if (L.visible) {
      L.idle += dt;
      if (L.idle > HIDE_AFTER) setVisible(L, false);
    }
  }
  // 预建：这一帧没建、总监站定了一会儿、离上次建隔够了 → 建离画面最近的一个没建的（建好先藏着，走近了直接显示）
  if (!built && !force && PREBUILD && stillT > PREBUILD_IDLE && sinceBuild > PREBUILD_GAP) {
    let best: Live | null = null;
    let bestD = Number.POSITIVE_INFINITY;
    const vNow = viewRect(0);
    for (const L of lives) {
      if (L.region) continue;
      const d = Math.min(...L.def.rects.map((r) => rectDist(r, vNow)));
      if (d < bestD) {
        bestD = d;
        best = L;
      }
    }
    if (best) {
      buildRegion(best);
      built = true;
      fresh.push(best);
    }
  }
  if (built) {
    sinceBuild = 0;
    hitched = true;
  }
  // 画（显示）只画画面附近的（+ RENDER_MARGIN，北边的影子落进画面）；演出、互动点在更大的 WANT_MARGIN 里照跑
  const vr = viewRect(RENDER_MARGIN);
  const v0 = viewRect(0);
  for (const L of lives) {
    // 着色器还没编完（pipe.prewarm）：画面外那圈余量里先不画（底图那块顶着），等编完；真进了画面就不等了（照旧当场等编译）
    // 总监在会所里（沉浸式）：只画会所，别的区域、底图都不画（楼里看不到外面）
    const show = L.visible && wanted(L, vr) && (L.warm || wanted(L, v0)) && (!immersive || L.def.id === 'clubhouse');
    const b0 = base.by.get(L.def.id);
    if (b0) b0.visible = !show && !immersive;
    if (L.root.visible !== show) {
      if (show && !L.drawn) {
        L.drawn = true;
        if (!L.warm) console.info(`clubwalk: ${L.def.id} 进画面时着色器还没编完（会当场等）`);
      }
      L.root.visible = show;
    }
  }
  base.rest.visible = !immersive;
  if (fresh.length && play) {
    const t0 = performance.now();
    const next = allBlocked();
    play.nav.setBlocked(next, navDirty(fresh, next));
    navBlocked = next;
    navPrep = true;
    // 正在点地面走：路是按建区域之前的（底图的粗平地）规划的，按新的网格从现在的位置重新规划（走不到就停）
    if (play.pathLeft()) play.replan();
    console.info(`clubwalk: 导航重建 ${(performance.now() - t0).toFixed(0)} ms ${fresh.map((L) => L.def.id)}`);
  } else if (navPrep && play) {
    // 连通分量、粗网格（~0.1 秒）挪到下一帧算，不和建区域挤在同一帧
    navPrep = false;
    play.nav.prepare();
  }
}
let navPrep = false;

/** 上一次给世界导航的挡路表（算新建区域以后哪些形状变了） */
let navBlocked: Shape[] = [];
/**
 * 建了新区域以后要重建的格子（外扩 1 米：身体半径 + 四周探点）：新区域的范围（地归它了）、它的导航 bounds
 * （它的导航也替别的区域、范围外的地回答）、挡路表里变了的形状（底图形状裁掉的、新区域带来的，都可能伸出范围）。
 * 只重建新区域的范围的话，结果会和建区域的先后有关（WALK-3）。
 */
function navDirty(fresh: readonly Live[], next: readonly Shape[]): Rect[] {
  const out: Rect[] = [];
  for (const L of fresh) {
    out.push(...L.def.rects);
    // bounds 只要范围外那几条（范围里面上一行已经有了；整块 bounds 重算一遍高尔夫要 3 秒）
    if (L.navBounds) out.push(...outside(L.navBounds, L.def.rects).map((s) => shapeBox(s)));
  }
  const key = (s: Shape) => JSON.stringify(s);
  const was = new Set(navBlocked.map(key));
  const now = new Set(next.map(key));
  for (const s of navBlocked) if (!now.has(key(s))) out.push(shapeBox(s));
  for (const s of next) if (!was.has(key(s))) out.push(shapeBox(s));
  return grow(out, 1);
}

// 开局：画面里的区域先建好（eager=1 全建），再建 play
{
  const v = viewRect(WANT_MARGIN);
  for (const L of lives) if (params.get('eager') === '1' || wanted(L, v)) buildRegion(L);
}
play = mountPlay({
  scene,
  pipe,
  canvas,
  director,
  start: START,
  yaw: 0,
  // 看台的端梯要 0.36（clubstadium），其余的高差（草坪 0.5、广场 1.2）照样挡住
  nav: { groundAt: () => 0, bounds: NAV_BOUNDS, surface, blocked: (navBlocked = allBlocked()), stepUp: 0.36 },
  camera: { lead: { portrait: 1.4, landscape: 0.5 }, zoom: [0.5, 1.8] },
  hint: '拖动走路 · 点地面走过去 · 走到哪建到哪',
});
for (const L of lives) if (L.region) setVisible(L, true);
// 规划要用的连通分量、粗网格先算好（不然第一次点地面要等 ~0.1 秒）
play.nav.prepare();
// 调试钩子（测试、截图脚本用）
(window as unknown as Record<string, unknown>).__clubwalk = { scene, lives, play, director, step };
// 人物：场景里的人对上演员表、名册、互动（clubwalk/cast；?cast=0 关）
const cast =
  params.get('cast') === '0' ? null : mountCast({ scene, lives, play, director, params, mats: dirKit.mats, scheme });

// ── 地点名（进入区域时淡出）+ 小地图 ──
const ZONES: { name: string; r: Rect }[] = [
  { name: '长廊', r: PATHS[1] },
  { name: '中心球场', r: { x0: -26, x1: 26, z0: -38, z1: -9 } },
  { name: '青训场', r: { x0: -34, x1: 34, z0: -2.5, z1: 14.4 } },
  { name: '会员场', r: { x0: -34, x1: -1, z0: 16.6, z1: 34 } },
  { name: '球员草坪', r: LAWN },
  { name: '会所', r: CLUBHOUSE },
  { name: '泳池', r: { x0: -61, x1: -39, z0: -1, z1: 18 } },
  { name: '高尔夫', r: { x0: -64, x1: 92, z0: 53, z1: 74 } },
];
let placeName = '';
function placeAt(x: number, z: number): { name: string; L: Live | null } {
  const L = lives.find((l) => inRects(l.def.rects, x, z)) ?? null;
  if (L) return { name: L.def.name, L };
  const zn = ZONES.find((q) => inRects([q.r], x, z));
  return { name: zn?.name ?? (x > GATE.x ? '大门外' : '俱乐部'), L: null };
}
function updatePlace() {
  const s = director.position;
  const { name, L } = placeAt(s.x, s.z);
  for (const l of lives) l.scoped?.setCurrent(l === L);
  if (name !== placeName) {
    placeName = name;
    placeEl.textContent = name;
    placeEl.classList.remove('show');
    void placeEl.offsetWidth;
    placeEl.classList.add('show');
  }
}
const MAP_VIEW: Rect = { x0: -66, x1: 122, z0: -46, z1: 56 };
function drawMap() {
  const g = mapEl.getContext('2d');
  if (!g) return;
  const W = mapEl.width;
  const H = mapEl.height;
  const sx = (x: number) => ((x - MAP_VIEW.x0) / (MAP_VIEW.x1 - MAP_VIEW.x0)) * W;
  const sz = (z: number) => ((z - MAP_VIEW.z0) / (MAP_VIEW.z1 - MAP_VIEW.z0)) * H;
  g.clearRect(0, 0, W, H);
  g.fillStyle = '#e8c48a';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#d9a86a';
  g.fillRect(sx(GROUNDS.x0), sz(GROUNDS.z0), sx(GROUNDS.x1) - sx(GROUNDS.x0), sz(GROUNDS.z1) - sz(GROUNDS.z0));
  for (const L of lives) {
    g.fillStyle = L.visible ? 'rgba(44,36,80,0.55)' : L.region ? 'rgba(44,36,80,0.3)' : 'rgba(44,36,80,0.15)';
    for (const r of L.def.rects) g.fillRect(sx(r.x0), sz(r.z0), sx(r.x1) - sx(r.x0), sz(r.z1) - sz(r.z0));
  }
  const v = viewRect(0);
  g.strokeStyle = '#fff3d6';
  g.lineWidth = 1;
  g.strokeRect(sx(v.x0), sz(v.z0), sx(v.x1) - sx(v.x0), sz(v.z1) - sz(v.z0));
  g.fillStyle = '#ffd23c';
  g.strokeStyle = '#2c2450';
  g.beginPath();
  g.arc(sx(director.position.x), sz(director.position.z), 3, 0, Math.PI * 2);
  g.fill();
  g.stroke();
}

function resize() {
  const dpr = Math.min(devicePixelRatio, 3);
  pipe.resize(canvas.clientWidth, canvas.clientHeight, dpr);
}
addEventListener('resize', resize);
resize();

// 像素级别（左上）
const PX_LEVELS = [1, 1.5, 2, 3];
const pxEl = document.getElementById('pxsel');
if (pxEl) {
  const chip = document.createElement('button');
  chip.className = 'px-chip';
  chip.type = 'button';
  const list = document.createElement('div');
  list.className = 'px-list';
  list.hidden = true;
  const sync = () => {
    chip.textContent = `像素 ${pipe.px}×`;
    for (const b of list.querySelectorAll('button'))
      b.setAttribute('aria-pressed', String(Number((b as HTMLElement).dataset.px) === pipe.px));
  };
  for (const v of PX_LEVELS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.px = String(v);
    b.innerHTML = `<b>${v}×</b><span>${v === 1 ? '默认' : '更粗'}</span>`;
    b.addEventListener('click', () => {
      if (v !== pipe.px) {
        pipe.rig.metersPerTexel *= v / pipe.px;
        pipe.px = v;
        resize();
      }
      list.hidden = true;
      sync();
    });
    list.appendChild(b);
  }
  chip.addEventListener('click', () => {
    list.hidden = !list.hidden;
  });
  pxEl.append(chip, list);
  sync();
}

// ── 时间和天气（clubsite/daylight）：太阳绕着走、影子跟着转，夜里月亮 + 球场灯；面板在像素级别下面 ──
const day = mountDaylight({ scene, pipe, sun, uniforms, params, scheme, placeSun: aimSun, hud: pxEl });

// ── 固定步长循环 ──
const DT = 1 / 60;
let simT = 0;
let unhideT = 0;
let houseInside = false;
const route: [number, number][] = (params.get('route') ?? '')
  .split(';')
  .map((s) => s.split(',').map(Number) as [number, number])
  .filter((p) => p.length === 2 && p.every(Number.isFinite));
function step(seconds: number) {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) {
    simT += DT;
    uniforms.uTime.value = simT;
    uniforms.uGust.value = 0.5 + 0.35 * Math.sin(simT * 0.7) * Math.sin(simT * 0.23);
    day.step(DT);
    for (const L of lives) if (L.visible) L.region?.update(DT, simT);
    play?.update(DT, simT);
    for (const L of lives) {
      if (!L.visible) continue;
      L.jobs?.step(DT);
      L.region?.post?.(DT, simT);
    }
    cast?.step(DT);
    // 走路线（截图用）：到了一个点就走下一个
    if (play && route.length && !play.pathLeft()) {
      const [x, z] = route.shift() as [number, number];
      play.tapWorld(x, z);
    }
    placeSun(director.position.x, director.position.z);
    // 会所：总监进了门（会所的体块里）→ 剖面（娃娃屋），出门 → 外观
    {
      const hr = asHouse(lives.find((l) => l.def.id === 'clubhouse')?.region);
      const p = director.position;
      // 会所的脚印（L 形，不含东边 clubfood 的拱廊前小院）；楼上、地下（脚下离地 > 1 米）在会所那一片里都算里面
      const nearHouse = p.x > -64.5 && p.x < -39.5 && p.z > -43 && p.z < -1;
      const inHouse = nearHouse && (Math.abs(p.y) > 1 || !outsideHouse(p.x, p.z, 1, -0.2));
      if (hr && inHouse !== houseInside) {
        houseInside = inHouse;
        hr.setInside(inHouse);
        setImmersive(inHouse);
      }
      // 楼梯上换层：脚下高度过了阈值（floorFor 带滞回）→ 剖面和导航换成那一层（onFloor 的回调重建网格，见 buildRegion）。
      // 两个平台、半跑在相邻两层的导航里都有，换过去的那一刻脚下站得住
      if (hr && inHouse) {
        const next = floorFor(hr.floor(), p.y);
        if (next !== hr.floor()) hr.setFloor(next);
      }
    }
    unhideT -= DT;
    if (unhideT <= 0) {
      unhideT = 0.5;
      // 演出把范围外藏着的人挪进来了 → 显示（只管一开始被藏的）
      for (const L of lives)
        L.hidden = L.hidden.filter(({ obj, p }) => {
          if (obj.position.distanceToSquared(p) < 0.01) return true;
          if (!inRects(L.def.rects, obj.position.x, obj.position.z)) return true;
          obj.visible = true;
          return false;
        });
    }
  }
}
{
  const w = pair('walk');
  if (w) play.tapWorld(w[0], w[1]);
}
step(num('warm', 0));
stream(0, true);

const paused = params.get('pause') === '1';
let last = performance.now();
let acc = 0;
let fpsT = 0;
let frames = 0;
let fps = 0;
let mapT = 0;
const showPerf = params.get('perf') === '1';
if (showPerf) perfEl.hidden = false;
// 走路平顺（clubsite/play/smooth.ts）：帧间隔贴 1/60 的整数倍；渲染时总监和镜头插值到两步之间；smooth=0 关掉（对照用）
const SMOOTH = params.get('smooth') !== '0';
const lerp = new ViewLerp(director, pipe.rig, scene);
function frame(now: number) {
  let real = Math.min(0.1, (now - last) / 1000);
  // 上一帧建了区域（主线程卡了一下）：不追那段时间，不然卡完总监一下跳出去好几步
  if (hitched && SMOOTH) real = DT;
  hitched = false;
  if (SMOOTH) real = snapDelta(real);
  acc += real;
  last = now;
  if (!paused) {
    while (acc >= DT) {
      if (SMOOTH) lerp.mark();
      step(DT);
      acc -= DT;
    }
  }
  stream(real);
  updatePlace();
  pipe.renderer.info.reset();
  if (SMOOTH && !paused) lerp.begin(acc / DT);
  day.frame();
  pipe.render(scene);
  play?.hud.frame();
  cast?.frame();
  lerp.end();
  mapT -= real;
  if (mapT <= 0) {
    mapT = 0.2;
    drawMap();
  }
  frames++;
  fpsT += real;
  if (fpsT >= 1) {
    fps = frames / fpsT;
    frames = 0;
    fpsT = 0;
    if (showPerf) {
      const info = pipe.renderer.info;
      perfEl.textContent = `${fps.toFixed(0)} fps · 绘制 ${info.render.calls} · 三角 ${(info.render.triangles / 1000).toFixed(0)}k · 区域 ${lives
        .filter((l) => l.visible)
        .map((l) => l.def.id.replace('club', ''))
        .join('/')}`;
    }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

function skyTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 1;
  c.height = 64;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const grad = g.createLinearGradient(0, 0, 0, 64);
  const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
  const sky = scheme?.sky ?? { top: 0x5fb0e8, horizon: 0xbfe3f2 };
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

/** 渲染一帧的统计（测试 / 文档用）：绘制次数、三角形、帧时间 */
function perf() {
  const info = pipe.renderer.info;
  info.reset();
  const t0 = performance.now();
  pipe.render(scene);
  pipe.renderer.getContext().finish();
  const ms = performance.now() - t0;
  return {
    calls: info.render.calls,
    triangles: info.render.triangles,
    renderMs: +ms.toFixed(1),
    fps: +fps.toFixed(1),
    visible: lives.filter((l) => l.visible).map((l) => l.def.id),
    built: lives.filter((l) => l.region).map((l) => [l.def.id, Math.round(l.buildMs)]),
  };
}

Object.assign(window, {
  __walk: {
    scene,
    pipe,
    play,
    director,
    lives,
    step,
    stream,
    perf,
    place: () => placeName,
    day,
    state: () => play?.state(),
  },
});

// clubplaza 的广场日常（演出，没有模拟；种子随机流，不用 Math.random）。clubplaza.md「玩法计划」：
// - 落叶：四棵蒲葵在阵风大的时候掉枯叶（从冠里打着旋落下来，约每 40 秒一片），落在陶砖上（palm-litter 平放）或水里
//   （漂着，慢慢往下风的池沿漂）。水里的片数 → 喷泉 setLeaves（≥ 3 水面变暗、闪光变少）。
// - 会员：从长廊走上两段台阶之一 → 饮水点喝水（drink-fountain setRunning）或去饮料车排队买一杯（摊主倒、setLevel）
//   → 找有荫的长椅坐 20～40 秒（setSeat + sit / sip / 孩子溅水时 clap）→ 从另一段台阶下去。
// - 孩子在池沿前来回，隔几秒伸手拨水溅起一团泡沫；家长看着，偶尔走过去把孩子拉回来。
// - 大尾拟八哥：池沿后段走走停停、低头喝水、跳两下；有人走近 1.5 米 → 一起飞到最近的蒲葵上（1.2 秒弧线），
//   8～15 秒后一只一只飞回来。
// - 放着不管（脏度 ≥ 5：水里的叶子 + 地上的一半）：长椅上的人皱眉走掉、新来的不坐，鸟不回来。
// 总监的活（捞叶子、扫地、浇花、倒桶、推车）是"原地的小任务"（job）：玩法模式里 play.ts 按住动作键时一帧帧推；
// ?play=0&life=1 的看戏模式由这里的 directorDemo 自己走过去做（截图、连拍用）。
import * as THREE from 'three';
import { POUR_FLOW, SKIM_WET, setStride } from '../clubsite/people';
import type { AssetCtx } from './ctx';
import { FOUNTAIN, FOUNTAIN_SPEC, H, PALMS, SPOTS, type V2 } from './layout';

type V3 = THREE.Vector3;
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const lerp = THREE.MathUtils.lerp;
const clamp = THREE.MathUtils.clamp;
const TAU = Math.PI * 2;
const turnTo = (a: number, b: number, k: number) => {
  let d = b - a;
  d -= Math.round(d / TAU) * TAU;
  return a + d * Math.min(1, k);
};
const flat = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(b.x - a.x, b.z - a.z);
const yawTo = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.atan2(b.x - a.x, b.z - a.z);

type Co = Generator<void, void, number>;

const C = v(FOUNTAIN.x, 0, FOUNTAIN.z);
const Y_WATER = H.plaza + FOUNTAIN_SPEC.waterY;
const Y_RIM = H.plaza + FOUNTAIN_SPEC.wallH;
/** 水里能漂的范围（池壁内 4.0，留出叶子半径） */
const WATER_R = FOUNTAIN_SPEC.waterR - 0.38;
/** 下碗（r 1.4）底下看不见：漂到这里面的叶子推出去 */
const BOWL_R = 1.75;
/** 风（同 main.ts 的 uWind 方向）：叶子往下风漂 */
const WIND = new THREE.Vector2(0.8, 0.35).normalize();

/** 台阶（clubdesk 的 STAIRS 前两段：广场南沿 z −12 往南 5 级 × 0.42 下到 0） */
const STAIR_X: [number, number][] = [
  [34.0, 37.0],
  [49.0, 51.4],
];
const STAIR_Z0 = -12;
const STAIR_Z1 = -12 + 5 * 0.42;

// ── 路网（手摆的点，避开池子、蒲葵树根、长椅、饮料车）：会员按最短路走 ─────────────
const NODES: Record<string, V2> = {
  PW: [27.5, -6.6],
  PMW: [35.5, -6.6],
  PME: [50.2, -6.5],
  PE: [59.0, -6.4],
  WB: [35.5, -9.3],
  EB: [50.2, -9.3],
  WT: [35.5, -12.7],
  ET: [50.2, -12.7],
  SW: [36.4, -15.8],
  SE: [52.2, -15.8],
  W: [34.9, -22.6],
  NW: [35.6, -30.4],
  N: [43.6, -30.6],
  NE: [53.4, -30.2],
  E: [53.7, -21.4],
  /** 饮水点前（喝水的人站在饮水点本地 (0, 0.55)，面朝它） */
  DF: [38.05, -14.4],
  /** 西长椅前、北长椅前、长廊长椅前 */
  BW: [38.6, -19.5],
  BN: [40.6, -32.5],
  BP: [53.4, -8.6],
  /** 饮料车前（买的人站位 = 车本地 (−0.25, 0.95)）和排队的两个位子 */
  Q0: [47.65, -31.55],
  Q1: [47.4, -30.65],
  Q2: [47.1, -29.8],
};
const EDGES: [string, string][] = [
  ['PW', 'PMW'],
  ['PMW', 'PME'],
  ['PME', 'PE'],
  ['PMW', 'WB'],
  ['PME', 'EB'],
  ['WB', 'WT'],
  ['EB', 'ET'],
  ['WT', 'SW'],
  ['ET', 'SE'],
  ['SW', 'SE'],
  ['SW', 'W'],
  ['W', 'NW'],
  ['NW', 'N'],
  ['N', 'NE'],
  ['NE', 'E'],
  ['E', 'SE'],
  ['SW', 'DF'],
  ['WT', 'DF'],
  ['SW', 'BW'],
  ['W', 'BW'],
  ['N', 'BN'],
  ['NW', 'BN'],
  ['PME', 'BP'],
  ['PE', 'BP'],
  ['N', 'Q2'],
  ['NE', 'Q2'],
  ['Q2', 'Q1'],
  ['Q1', 'Q0'],
];
const ADJ: Record<string, string[]> = {};
for (const [a, b] of EDGES) {
  (ADJ[a] ??= []).push(b);
  (ADJ[b] ??= []).push(a);
}
const nd = (k: string) => NODES[k];
/** 最短路（节点名 → 节点名，Dijkstra，图很小） */
function route(from: string, to: string): string[] {
  const dist: Record<string, number> = { [from]: 0 };
  const prev: Record<string, string> = {};
  const open = new Set([from]);
  while (open.size) {
    let u = '';
    for (const k of open) if (!u || dist[k] < dist[u]) u = k;
    open.delete(u);
    if (u === to) break;
    for (const w of ADJ[u] ?? []) {
      const d = dist[u] + Math.hypot(nd(w)[0] - nd(u)[0], nd(w)[1] - nd(u)[1]);
      if (dist[w] === undefined || d < dist[w]) {
        dist[w] = d;
        prev[w] = u;
        open.add(w);
      }
    }
  }
  const out = [to];
  while (out[0] !== from && prev[out[0]]) out.unshift(prev[out[0]]);
  return out;
}

/** 蒲葵的冠心（fan-palm 三个变体的 h / crown，冠心 = h − 0.62·crown，树干上部往 lean 弯） */
const PALM_V = [
  { h: 8.5, lean: 0.55, leanZ: 0.1, crown: 2.3 },
  { h: 9.4, lean: -0.75, leanZ: -0.15, crown: 2.45 },
  { h: 7.2, lean: 0.3, leanZ: 0.2, crown: 2.1 },
];
function crownOf(p: (typeof PALMS)[number]) {
  const V = PALM_V[p.v % 3];
  const cy = V.h - V.crown * 0.62;
  const k = (cy / V.h) ** 2;
  return { c: v(p.at[0] + V.lean * k * p.s, H.plaza + cy * p.s, p.at[1] + V.leanZ * k * p.s), r: V.crown * p.s };
}

// ── 对外的接口 ─────────────────────────────────────────
export interface LifeEnv {
  scene: THREE.Object3D;
  ctx: AssetCtx;
  /** SLOTS 的 id → 场景里的对象 */
  slot(id: string): THREE.Object3D | undefined;
  /** 建一个资产（不加进场景） */
  make(asset: string, variant: number): THREE.Object3D;
  groundAt(x: number, z: number): number;
  /** 玩法模式：总监交给玩家（不跑 directorDemo） */
  play: boolean;
  /** 落叶速度倍数（?leaves=） */
  leafRate?: number;
  /** 玩法模式：气泡交给 play.say（人、文字、秒、头顶多高） */
  say?(obj: THREE.Object3D, text: string, sec: number, dy: number): void;
  /** 大世界（clubwalk）：slot('director') 是共用的总监，开局不动它手里的东西 */
  sharedDirector?: boolean;
}

export type ToolName = 'net' | 'broom' | 'can';
export const TOOL_ZH: Record<ToolName, string> = { net: '捞网', broom: '扫帚', can: '浇水壶' };

/** 一个原地的小任务：play.ts 按住动作键时每帧 tick；返回 true = 做完 */
export interface Job {
  kind: 'skim' | 'sweep' | 'pour' | 'dump' | 'empty';
  tick(dt: number): boolean;
  /** 中途松手 / 走开 */
  cancel(): void;
  /** 0..1 进度（HUD 的进度条） */
  progress(): number;
}

export interface LeafRef {
  readonly id: number;
  readonly kind: 'water' | 'tile';
  readonly pos: V3;
}

export interface PlazaLife {
  update(dt: number): void;
  /** play.update 之后调（推着的车跟到总监身前） */
  post(): void;
  /** 测试 / 截图：马上从第 i 棵蒲葵掉一片叶子 */
  dropLeaf(palm?: number): boolean;
  state: {
    water: number;
    tiles: number;
    dirt: number;
    cart: number;
    load: number;
    seated: number;
    sold: number;
    birdsAway: boolean;
    dropped: number;
  };
  /** 一行状态（HUD 顶栏） */
  stats(): string;
  /** 气泡（世界坐标 + 文字） */
  alerts(): { p: V3; text: string }[];
  /** 会动的人（导航把他们当成圆） */
  people(): { x: number; z: number; r: number }[];
  /** 挡路的道具（保洁车会被推走） */
  blockers(): { x: number; z: number; r: number }[];
  debug(): unknown;
  /** 总监的活（play.ts 用；看戏模式 directorDemo 也用） */
  play: PlayApi;
}

export interface PlayApi {
  director: THREE.Object3D;
  cart: THREE.Object3D;
  /** 保洁车的位置（推走了就跟着动） */
  cartPos(): V3;
  /** 手上拿的工具（null = 空手；'cart' = 推着车） */
  held(): ToolName | 'cart' | null;
  take(t: ToolName): void;
  /** 把手上的工具放回车上 */
  stow(): void;
  /** 网兜 / 簸箕里装着的叶子（倒进桶才算） */
  load(): number;
  leaves(kind?: 'water' | 'tile'): LeafRef[];
  /** 离 p 最近、够得着的叶子 */
  nearestLeaf(kind: 'water' | 'tile', p: V3, max: number): LeafRef | null;
  /** 池边离某片水里的叶子最近的站位（池壁外 0.55 米） */
  rimSpot(leaf: LeafRef): V3;
  pots(): { id: number; pos: V3; wet: number }[];
  cartFill(): number;
  /** 推车去倒的地方（长廊东头） */
  dumpPoint(): V3;
  startSkim(leaf: LeafRef): Job;
  startSweep(leaf: LeafRef): Job;
  startPour(pot: number): Job;
  /** 把网兜 / 扫起来的叶子倒进桶 */
  startDump(): Job;
  /** 推着车：抓起 / 放下 */
  grabCart(): void;
  dropCart(): void;
  /** 在倒垃圾的地方把桶倒空 */
  startEmpty(): Job;
  /** 气泡 */
  say(text: string, s?: number): void;
  /** 捞网（靠在车上的那个对象）、车上的扫帚 / 浇水壶 */
  net: THREE.Object3D;
  tools: Record<'broom' | 'rake' | 'can', THREE.Object3D>;
  /** 捞网靠回车上（玩法模式：item.stow 之后调） */
  stowNet(): void;
  /** 扫帚 / 浇水壶插回车上 */
  stowOnCart(name: 'broom' | 'can'): void;
  /** 网兜 / 扫起来的叶子倒进桶（玩法模式 busy 的 mid 调）；返回倒了几片 */
  dumpLoad(): number;
  /** 桶倒空的进度（0..1，busy 的 tick 调） */
  emptyCart(k: number): void;
  /** 测试 / 截图：直接设桶里有多满 */
  debugFill(f: number): void;
}

// ── 实现 ─────────────────────────────────────────────
interface Actor {
  obj: THREE.Object3D;
  pos: V3;
  yaw: number;
  walkPh: number;
  name: string;
  /** 走在固定高度上（孩子沿着池壁压顶走），不跟地面 */
  fixY?: number;
}
const actor = (obj: THREE.Object3D, name: string): Actor => ({
  obj,
  pos: obj.position.clone(),
  yaw: obj.rotation.y,
  walkPh: 0,
  name,
});
const pose = (a: Actor, n: string, ph?: number) => a.obj.userData.pose?.(n, ph);
const sync = (a: Actor) => {
  a.obj.position.copy(a.pos);
  a.obj.rotation.y = a.yaw;
};

interface Seat {
  pos: V3;
  yaw: number;
  node: string;
  shade: number;
  who: Actor | null;
}

interface Leaf extends LeafRef {
  id: number;
  kind: 'water' | 'tile';
  pos: V3;
  obj: THREE.Object3D;
  on: boolean;
  fall: { t: number; dur: number; from: V3; to: V3; yaw0: number; spin: number; side: V2 } | null;
  drift: V2 | null;
  /** 正在被捞 / 扫（不再自己漂） */
  busy: boolean;
  yaw: number;
}

interface Bird {
  obj: THREE.Object3D;
  home: V3;
  homeYaw: number;
  pos: V3;
  yaw: number;
  mode: 'home' | 'fly' | 'perch';
  fly: { t: number; dur: number; from: V3; to: V3; arc: number; land: 'home' | 'perch' } | null;
  perch: V3;
  timer: number;
  /** 在池沿上：0 = 喝水，1 = 站着，2 = 跳；bowl 的只喝水 / 站 */
  act: number;
  actT: number;
  hop: { from: V3; to: V3; t: number } | null;
  bowl: boolean;
}

interface Particle {
  m: THREE.Mesh;
  p: V3;
  vel: V3;
  t: number;
  life: number;
  g: number;
  floorY: number;
}

export function createLife(env: LifeEnv): PlazaLife {
  const { scene, ctx } = env;
  const R = (k: string) => ctx.rng(`plaza-life:${k}`);
  const rLeaf = R('leaf');
  const rMem = R('member');
  const rKid = R('kid');
  const rBird = R('bird');
  const rnd = (r: () => number, a: number, b: number) => a + (b - a) * r();
  const uniforms = ctx.uniforms;
  let now = 0;

  const floorY = (x: number, z: number) => {
    if (z >= STAIR_Z0 && z <= STAIR_Z1 && STAIR_X.some(([a, b]) => x >= a && x <= b))
      return H.plaza * (1 - (z - STAIR_Z0) / (STAIR_Z1 - STAIR_Z0));
    return env.groundAt(x, z);
  };
  const at = (p: V2, dy = 0) => v(p[0], floorY(p[0], p[1]) + dy, p[1]);

  // ── 小特效：泡沫水花、水滴（几十个小方块，隐藏的不画）──────────
  const fxGeo = new THREE.BoxGeometry(1, 1, 1);
  const foamMat = ctx.mat('foam', { edge: 0, convex: 0, noShadowReceive: true, lightUp: 0.6 });
  const dropMat = ctx.mat('fountainWater', {
    ramp: [0x8cf0ee, 0x5cc8dc, 0x3c74b8],
    edge: 0,
    convex: 0,
    noShadowReceive: true,
    lightUp: 0.5,
  });
  const parts: Particle[] = [];
  const fxRoot = new THREE.Group();
  fxRoot.name = 'plaza-life-fx';
  scene.add(fxRoot);
  const particle = (mat: THREE.Material) => {
    let q = parts.find((x) => !x.m.visible && x.m.material === mat);
    if (!q) {
      const m = new THREE.Mesh(fxGeo, mat);
      m.castShadow = false;
      m.receiveShadow = false;
      m.visible = false;
      fxRoot.add(m);
      q = { m, p: v(0, 0, 0), vel: v(0, 0, 0), t: 0, life: 1, g: 9.8, floorY: 0 };
      parts.push(q);
    }
    return q;
  };
  /** 溅水：n 颗泡沫往上、往外蹦（0.4～0.6 秒） */
  const splash = (p: V3, n: number, up = 1.8, out = 0.7, r = rKid) => {
    for (let i = 0; i < n; i++) {
      const q = particle(i % 3 === 2 ? dropMat : foamMat);
      const a = r() * TAU;
      q.p.copy(p);
      q.vel.set(Math.cos(a) * out * (0.4 + r()), up * (0.6 + 0.5 * r()), Math.sin(a) * out * (0.4 + r()));
      q.t = 0;
      q.life = 0.4 + 0.2 * r();
      q.g = 9.8;
      q.floorY = Y_WATER;
      q.m.scale.setScalar(i % 2 ? 0.09 : 0.13);
      q.m.visible = true;
    }
  };
  /** 水面上一颗不动的泡沫（捞网划过的弧） */
  const foamDot = (p: V3, life = 0.7) => {
    const q = particle(foamMat);
    q.p.copy(p);
    q.vel.set(0, 0, 0);
    q.g = 0;
    q.t = 0;
    q.life = life;
    q.floorY = -99;
    q.m.scale.set(0.1, 0.02, 0.1);
    q.m.visible = true;
  };
  /** 一颗水滴（浇水壶）：从 p 带初速落下，落到 floor 消失 */
  const drop = (p: V3, vel: V3, floor: number) => {
    const q = particle(dropMat);
    q.p.copy(p);
    q.vel.copy(vel);
    q.g = 9.8;
    q.t = 0;
    q.life = 1.2;
    q.floorY = floor;
    q.m.scale.setScalar(0.07);
    q.m.visible = true;
  };
  const updateFx = (dt: number) => {
    for (const q of parts) {
      if (!q.m.visible) continue;
      q.t += dt;
      q.vel.y -= q.g * dt;
      q.p.addScaledVector(q.vel, dt);
      if (q.t >= q.life || (q.vel.y < 0 && q.p.y < q.floorY)) {
        q.m.visible = false;
        continue;
      }
      // 纹素对齐由管线做；这里只摆位置
      q.m.position.copy(q.p);
    }
  };

  // ── 气泡 ─────────────────────────────────────────
  const bubbles = new Map<Actor, { text: string; until: number }>();
  const say = (a: Actor, text: string, s = 2.2) => {
    if (env.say) {
      const dy = a.name === '孩子' ? 1.55 : memberSeat.has(a) ? 1.75 : 2.15;
      env.say(a.obj, text, s, dy);
    } else bubbles.set(a, { text, until: now + s });
  };
  /** 看戏模式自己摆总监；玩法模式总监的姿势、朝向归 play（这里只读他的位置） */
  const drive = !env.play;

  // ── 喷泉、饮料车、饮水点、保洁车、花盆 ─────────────────────
  const fountain = env.slot('palm-fountain');
  const setWaterLeaves = (n: number) => fountain?.userData.setLeaves?.(n);
  const drinks = env.slot('drinks-cart');
  const drinkFountain = env.slot('drink-fountain');
  const cart = env.slot('leaf-cart') as THREE.Object3D;
  const level = { red: 0.8, yellow: 0.7 };
  drinks?.userData.setLevel?.(level.red, level.yellow);
  cart.userData.setFill?.(0.25);
  let cartFill = 0.25;
  const CART_CAP = 12;

  // 花盆：土面上加一块湿土（浇过 = 深一档，慢慢干）
  const potIds = [0, 1, 2, 3];
  const wetMat = ctx.mat('sandDrift', { ramp: [0x8c5e44, 0x6a4436, 0x3e2a36], edge: 0, convex: 0 });
  const wetGeo = new THREE.CircleGeometry(0.255, 14).rotateX(-Math.PI / 2);
  const pots = potIds.map((i) => {
    const o = env.slot(`pot-${i}`);
    const pos = o ? o.position.clone() : v(0, 0, 0);
    const disc = new THREE.Mesh(wetGeo, wetMat);
    disc.position.set(pos.x, pos.y + 0.775, pos.z);
    disc.castShadow = false;
    disc.receiveShadow = true;
    scene.add(disc);
    // 一开始两盆是干的（东台阶顶那对浇过）
    const wet = i < 2 ? 0.8 : 0.15;
    disc.visible = wet > 0.35;
    return { id: i, pos, wet, disc };
  });

  // ── 落叶 ─────────────────────────────────────────
  // 原来白模里的四堆（litter-*）藏起来，换成一池可增可减的叶子：水里 6 片（v3 / v4 带水纹圈），地上 10 片（v0 / v1）
  for (const id of ['litter-water', 'litter-water2', 'litter-e', 'litter-w']) {
    const o = env.slot(id);
    if (o) o.visible = false;
  }
  const leaves: Leaf[] = [];
  const mkLeaf = (kind: 'water' | 'tile', variant: number) => {
    const obj = env.make('palm-litter', variant);
    obj.userData.setCount?.(1);
    obj.visible = false;
    scene.add(obj);
    const l: Leaf = {
      id: leaves.length,
      kind,
      pos: v(0, 0, 0),
      obj,
      on: false,
      fall: null,
      drift: null,
      busy: false,
      yaw: 0,
    };
    leaves.push(l);
    return l;
  };
  for (let i = 0; i < 6; i++) mkLeaf('water', 3 + (i % 2));
  for (let i = 0; i < 10; i++) mkLeaf('tile', i % 2);
  /** 水里的叶子漂到哪（下风那边的池沿，左右散开） */
  const driftTarget = (p: V3): V2 => {
    const side = new THREE.Vector2(-WIND.y, WIND.x);
    const off = clamp((p.x - C.x) * side.x + (p.z - C.z) * side.y, -2.2, 2.2);
    const t = new THREE.Vector2(C.x, C.z).addScaledVector(WIND, WATER_R * 0.92).addScaledVector(side, off);
    const d = t.clone().sub(new THREE.Vector2(C.x, C.z));
    if (d.length() > WATER_R) d.setLength(WATER_R);
    return [C.x + d.x, C.z + d.y];
  };
  const placeLeaf = (l: Leaf) => {
    l.obj.position.copy(l.pos);
    l.obj.rotation.set(0, l.yaw, 0);
  };
  const putLeaf = (l: Leaf, p: V3, yaw: number) => {
    l.on = true;
    l.busy = false;
    l.fall = null;
    l.pos.copy(p);
    l.yaw = yaw;
    l.drift = l.kind === 'water' ? driftTarget(p) : null;
    l.obj.visible = true;
    l.obj.userData.setFloating?.(l.kind === 'water');
    placeLeaf(l);
  };
  const removeLeaf = (l: Leaf) => {
    l.on = false;
    l.busy = false;
    l.fall = null;
    l.obj.visible = false;
  };
  /** 一片叶子从蒲葵冠里落下来（水里或陶砖上） */
  const dropFrond = (palmIdx?: number) => {
    const pi = palmIdx ?? Math.floor(rLeaf() * PALMS.length);
    const palm = PALMS[pi];
    const { c, r } = crownOf(palm);
    // 水里还是地上：离池子近的两棵（东西）四成落水，后面两棵三成
    const toWater = rLeaf() < (pi < 2 ? 0.45 : 0.32);
    const l = leaves.find((x) => !x.on && x.kind === (toWater ? 'water' : 'tile'));
    if (!l) return false;
    let to: V3;
    if (toWater) {
      // 落点：池子里朝这棵树的那一半，离池心 1.9～3.4 米
      const a0 = Math.atan2(palm.at[1] - C.z, palm.at[0] - C.x) + rnd(rLeaf, -0.7, 0.7);
      const rr = rnd(rLeaf, BOWL_R + 0.2, WATER_R - 0.2);
      to = v(C.x + Math.cos(a0) * rr, Y_WATER + 0.01, C.z + Math.sin(a0) * rr);
    } else {
      // 地上：树根下风 0.8～2.6 米，避开池壁（落到池壁上的推到外沿）
      const d = rnd(rLeaf, 0.8, 2.6);
      const a = Math.atan2(WIND.y, WIND.x) + rnd(rLeaf, -1.1, 1.1);
      let x = palm.at[0] + Math.cos(a) * d;
      let z = palm.at[1] + Math.sin(a) * d;
      const dc = Math.hypot(x - C.x, z - C.z);
      if (dc < FOUNTAIN_SPEC.basinR + 0.5) {
        const k = (FOUNTAIN_SPEC.basinR + 0.6) / dc;
        x = C.x + (x - C.x) * k;
        z = C.z + (z - C.z) * k;
      }
      to = v(x, floorY(x, z) + 0.006, z);
    }
    const a = rLeaf() * TAU;
    const from = v(c.x + Math.cos(a) * r * 0.55, c.y - 0.3, c.z + Math.sin(a) * r * 0.55);
    l.on = true;
    l.busy = false;
    l.drift = null;
    l.pos.copy(from);
    l.obj.visible = true;
    l.obj.userData.setFloating?.(false);
    const dir = new THREE.Vector2(to.x - from.x, to.z - from.z).normalize();
    l.fall = {
      t: 0,
      dur: rnd(rLeaf, 2.4, 3.2),
      from,
      to,
      yaw0: rLeaf() * TAU,
      spin: rnd(rLeaf, 1.5, 3) * (rLeaf() < 0.5 ? -1 : 1),
      side: [-dir.y, dir.x],
    };
    state.dropped++;
    return true;
  };
  const updateLeaves = (dt: number) => {
    for (const l of leaves) {
      if (!l.on) continue;
      if (l.fall) {
        const f = l.fall;
        f.t += dt;
        const u = Math.min(1, f.t / f.dur);
        // 先飘（慢）后落；左右打旋，越到地面摆得越小
        const k = u * 0.35 + u * u * 0.65;
        const sw = Math.sin(u * Math.PI * 3.2) * 0.55 * (1 - u);
        l.pos.set(
          lerp(f.from.x, f.to.x, smooth(u)) + f.side[0] * sw,
          lerp(f.from.y, f.to.y, k),
          lerp(f.from.z, f.to.z, smooth(u)) + f.side[1] * sw,
        );
        l.obj.position.copy(l.pos);
        l.obj.rotation.set(Math.sin(u * 11) * 0.7 * (1 - u), f.yaw0 + f.spin * u * 2, Math.cos(u * 8) * 0.5 * (1 - u));
        if (u >= 1) {
          putLeaf(l, f.to, f.yaw0 + f.spin * 2);
          if (l.kind === 'water') splash(f.to.clone().setY(Y_WATER + 0.02), 3, 0.9, 0.4, rLeaf);
        }
        continue;
      }
      if (l.kind === 'water' && !l.busy) {
        // 漂：每秒几厘米，往下风池沿；转一点点
        if (l.drift) {
          const dx = l.drift[0] - l.pos.x;
          const dz = l.drift[1] - l.pos.z;
          const d = Math.hypot(dx, dz);
          const sp = 0.05 * Math.min(1, d / 0.6) * (0.6 + 0.8 * uniforms.uGust.value);
          if (d > 0.02) {
            l.pos.x += (dx / d) * sp * dt;
            l.pos.z += (dz / d) * sp * dt;
          }
        }
        // 不进碗底、不出池壁
        const ox = l.pos.x - C.x;
        const oz = l.pos.z - C.z;
        const rr = Math.hypot(ox, oz);
        if (rr < BOWL_R) {
          l.pos.x = C.x + (ox / rr) * BOWL_R;
          l.pos.z = C.z + (oz / rr) * BOWL_R;
        } else if (rr > WATER_R) {
          l.pos.x = C.x + (ox / rr) * WATER_R;
          l.pos.z = C.z + (oz / rr) * WATER_R;
        }
        l.yaw += dt * 0.03 * Math.sin(now * 0.4 + l.id);
        placeLeaf(l);
      }
    }
  };
  // 落叶的节奏：阵风（uGust）大的时候攒"压力"，攒满掉一片；平均约 40 秒一片
  let pressure = 0.35;
  const leafRate = env.leafRate ?? 1;
  const updateDrops = (dt: number) => {
    const g = uniforms.uGust.value;
    pressure += dt * Math.max(0, g - 0.6) * 0.8 * leafRate;
    if (pressure >= 1 && g > 0.7) {
      pressure = -0.25 * rLeaf();
      dropFrond();
    }
  };

  // ── 人 ──────────────────────────────────────────
  const people: Actor[] = [];
  const person = (id: string, name = id): Actor | null => {
    const o = env.slot(id);
    if (!o) return null;
    const a = actor(o, name);
    people.push(a);
    return a;
  };

  // 协程
  const bg: Co[] = [];
  const spawn = (c: Co) => {
    c.next(0);
    bg.push(c);
  };
  function* wait(s: number): Co {
    let t = 0;
    while (t < s) t += yield;
  }
  function* until(cond: () => boolean, max = 60): Co {
    let t = 0;
    while (!cond() && t < max) t += yield;
  }
  /** 沿折线走（米/秒），y 跟着地面（台阶）；走路相位按步子 */
  function* walk(a: Actor, pts: V3[], speed = 1.25, stride?: number, poseName = 'walk'): Co {
    const len = setStride(a.obj, stride);
    for (const p of pts) {
      while (true) {
        const dt = yield;
        const dx = p.x - a.pos.x;
        const dz = p.z - a.pos.z;
        const L = Math.hypot(dx, dz);
        const step = speed * dt;
        if (L <= step) {
          a.pos.x = p.x;
          a.pos.z = p.z;
          a.pos.y = a.fixY ?? floorY(p.x, p.z);
          break;
        }
        a.pos.x += (dx / L) * step;
        a.pos.z += (dz / L) * step;
        a.pos.y = a.fixY ?? floorY(a.pos.x, a.pos.z);
        a.yaw = turnTo(a.yaw, Math.atan2(dx, dz), dt * 9);
        a.walkPh = (a.walkPh + step / len) % 1;
        pose(a, poseName, a.walkPh);
      }
    }
  }
  function* face(a: Actor, yaw: number, s = 0.35): Co {
    let t = 0;
    while (t < s) {
      const dt = yield;
      t += dt;
      a.yaw = turnTo(a.yaw, yaw, dt * 9);
    }
    a.yaw = yaw;
  }
  const pathTo = (from: string, to: string) => route(from, to).map((k) => at(nd(k)));
  /** 从现在的位置沿路网走到节点 key（先到最近的节点；已经在那儿就跳过） */
  function* goTo(a: Actor, key: string, speed = 1.25): Co {
    const pts = pathTo(nearestNode(a.pos), key);
    if (pts.length && flat(pts[0], a.pos) < 0.3) pts.shift();
    yield* walk(a, pts, speed);
  }
  /** 离这个点最近的路网节点 */
  const nearestNode = (p: V3, keys = Object.keys(NODES)) => {
    let best = keys[0];
    let bd = Infinity;
    for (const k of keys) {
      const d = Math.hypot(nd(k)[0] - p.x, nd(k)[1] - p.z);
      if (d < bd) {
        bd = d;
        best = k;
      }
    }
    return best;
  };

  // ── 脏度（水里的叶子 + 地上的一半）→ 长椅、鸟 ─────────────────
  const state = {
    water: 0,
    tiles: 0,
    dirt: 0,
    cart: 0,
    load: 0,
    seated: 0,
    sold: 0,
    birdsAway: false,
    dropped: 0,
  };
  const BAD = 5;
  const bad = () => state.dirt >= BAD;

  // ── 长椅（荫里的先坐满）──────────────────────────────
  const benchSeat = (id: string, node: string, shade: number): Seat[] => {
    const b = env.slot(id);
    if (!b) return [];
    const yaw = b.rotation.y;
    return [-0.45, 0.45].map((lx) => ({
      pos: v(
        b.position.x + lx * Math.cos(yaw) - 0.05 * Math.sin(yaw),
        b.position.y,
        b.position.z - lx * Math.sin(yaw) - 0.05 * Math.cos(yaw),
      ),
      yaw,
      node,
      shade,
      who: null,
    }));
  };
  const seats: Seat[] = [
    ...benchSeat('bench-w', 'BW', 3),
    ...benchSeat('bench-n', 'BN', 2),
    ...benchSeat('bench-prom', 'BP', 1),
  ];
  const freeSeat = () => {
    const free = seats.filter((s) => !s.who);
    if (!free.length) return null;
    const top = Math.max(...free.map((s) => s.shade));
    const best = free.filter((s) => s.shade === top);
    return best[Math.floor(rMem() * best.length)];
  };

  // ── 饮料车：摊主 + 排队 ─────────────────────────────
  const vendor = person('vendor', '摊主');
  const queue: Actor[] = [];
  const served = new Set<Actor>();
  const QN = ['Q0', 'Q1', 'Q2'];
  function* vendorLoop(): Co {
    if (!vendor) return;
    const home = vendor.pos.clone();
    vendor.yaw = 0;
    pose(vendor, 'idle');
    while (true) {
      yield* until(() => !!queue[0] && flat(queue[0].pos, at(nd('Q0'))) < 0.15, 9999);
      const buyer = queue[0];
      // 倒一杯：侧身对着饮料桶（车台在摊主身前偏东），倒 1.2 秒
      const red = rMem() < 0.5;
      yield* face(vendor, 0.5, 0.3);
      vendor.obj.userData.setProp?.('cup');
      const T = 1.2;
      for (let t = 0; t < T; ) {
        t += yield;
        pose(vendor, 'pour', Math.min(0.99, t / T));
      }
      yield* face(vendor, 0, 0.25);
      pose(vendor, 'idle');
      vendor.obj.userData.setProp?.(null);
      buyer.obj.userData.setProp?.('cup');
      if (red) level.red -= 0.06;
      else level.yellow -= 0.06;
      drinks?.userData.setLevel?.(level.red, level.yellow);
      state.sold++;
      say(vendor, red ? '洛神花！' : '柠檬水！', 1.6);
      served.add(buyer);
      yield* until(() => queue[0] !== buyer, 10);
      if (level.red < 0.2 || level.yellow < 0.2) {
        // 补货：蹲下去从车底拿一桶倒满
        say(vendor, '补货…', 2.5);
        for (let t = 0; t < 2.4; ) {
          t += yield;
          pose(vendor, 'pickup', clamp(t / 2.4, 0, 0.99));
        }
        level.red = Math.max(level.red, 0.85);
        level.yellow = Math.max(level.yellow, 0.8);
        drinks?.userData.setLevel?.(level.red, level.yellow);
        pose(vendor, 'idle');
      }
      vendor.pos.copy(home);
      yield* wait(0.4);
    }
  }

  // ── 会员 ────────────────────────────────────────
  type Stage = 'hidden' | 'enter' | 'sit' | 'buy';
  const members: Actor[] = [];
  const memberSeat = new Map<Actor, Seat>();
  /** 坐着看孩子溅水时鼓掌（kidSplash 时置一下） */
  let splashAt = -99;

  function* drinkAtFountain(m: Actor): Co {
    yield* goTo(m, 'DF');
    yield* face(m, Math.PI / 2, 0.3);
    drinkFountain?.userData.setRunning?.(true);
    for (let t = 0; t < 2.6; ) {
      t += yield;
      // 弯腰凑过去（pickup 的前半）、喝两口、直起来
      const u = t / 2.6;
      pose(m, 'pickup', 0.18 + 0.24 * Math.min(1, u * 4) * Math.min(1, (1 - u) * 4));
    }
    drinkFountain?.userData.setRunning?.(false);
    pose(m, 'idle');
  }
  let dfBusy = false;
  function* buyDrink(m: Actor): Co {
    if (queue.length >= 3) return;
    queue.push(m);
    // 排到自己的位子，往前挪
    while (true) {
      const i = queue.indexOf(m);
      const spot = at(nd(QN[Math.min(i, 2)]));
      if (flat(m.pos, spot) > 0.05) {
        if (flat(m.pos, at(nd('Q2'))) > 1.2) yield* goTo(m, 'Q2');
        yield* walk(m, [spot], 1.1);
        yield* face(m, Math.PI, 0.3);
        pose(m, 'idle');
      }
      if (i === 0) break;
      yield* until(() => queue.indexOf(m) < i, 30);
    }
    yield* until(() => served.has(m), 20);
    served.delete(m);
    yield* wait(0.5);
    queue.shift();
  }
  function* sitDown(m: Actor, s: Seat): Co {
    s.who = m;
    memberSeat.set(m, s);
    const front = s.pos.clone().add(v(Math.sin(s.yaw) * 0.55, 0, Math.cos(s.yaw) * 0.55));
    yield* goTo(m, s.node);
    yield* walk(m, [front]);
    yield* face(m, s.yaw + Math.PI, 0.25);
    yield* face(m, s.yaw, 0.35);
    m.pos.copy(s.pos);
    m.obj.userData.setSeat?.(0.52);
    state.seated++;
  }
  function* sitting(m: Actor, dur: number): Co {
    const cup = m.obj.userData.prop?.() === 'cup';
    let t = 0;
    let clapUntil = -1;
    let lastSplash = splashAt;
    pose(m, cup ? 'sip' : 'sit');
    while (t < dur) {
      const dt = yield;
      t += dt;
      // 孩子溅水 → 三成的人拍两下手
      if (splashAt !== lastSplash) {
        lastSplash = splashAt;
        if (rMem() < 0.3) clapUntil = t + 1.0;
      }
      if (clapUntil > t) pose(m, 'clap', (((t * 2) % 1) + 1) % 1);
      else if (clapUntil > 0) {
        clapUntil = -1;
        pose(m, cup ? 'sip' : 'sit');
      }
      if (bad() && t > 1.5) {
        say(m, rMem() < 0.5 ? '水好脏…' : '全是叶子', 2.4);
        m.obj.userData.lookAt?.(C.clone().setY(Y_WATER));
        yield* wait(1.2);
        return;
      }
    }
  }
  function* standUp(m: Actor): Co {
    const s = memberSeat.get(m);
    m.obj.userData.setSeat?.(null);
    m.obj.userData.lookAt?.(null);
    if (s) {
      s.who = null;
      memberSeat.delete(m);
      state.seated--;
      m.pos.copy(s.pos).add(v(Math.sin(s.yaw) * 0.55, 0, Math.cos(s.yaw) * 0.55));
    }
    pose(m, 'idle');
    yield* wait(0.2);
  }
  function* leave(m: Actor, side: 'W' | 'E'): Co {
    yield* goTo(m, side === 'W' ? 'PW' : 'PE');
    m.obj.userData.setProp?.(rMem() < 0.6 ? 'racket' : null);
    m.obj.visible = false;
  }
  function* memberLoop(m: Actor, start: Stage): Co {
    let stage = start;
    while (true) {
      let side: 'W' | 'E' = rMem() < 0.5 ? 'W' : 'E';
      if (stage === 'hidden') {
        m.obj.visible = false;
        yield* wait(rnd(rMem, 2, 8));
        // 人太多就再等一等（广场上同时最多 6 个）
        yield* until(() => members.filter((x) => x.obj.visible).length < 6, 30);
        m.pos.copy(at(nd(side === 'W' ? 'PW' : 'PE')));
        m.obj.visible = true;
        m.obj.userData.setProp?.(rMem() < 0.6 ? 'racket' : null);
        yield* walk(m, pathTo(side === 'W' ? 'PW' : 'PE', side === 'W' ? 'WT' : 'ET').slice(1));
        stage = 'enter';
      }
      if (stage === 'enter') {
        if (bad()) {
          // 一上来看见满池叶子：摇头，横穿过去从另一段台阶走
          yield* face(m, yawTo(m.pos, C), 0.4);
          say(m, '好多叶子…', 2);
          yield* wait(1.4);
          side = side === 'W' ? 'E' : 'W';
          yield* goTo(m, side === 'W' ? 'WT' : 'ET');
          yield* leave(m, side);
          stage = 'hidden';
          continue;
        }
        const wantDF = rMem() < 0.45 && !dfBusy;
        if (wantDF) {
          dfBusy = true;
          yield* drinkAtFountain(m);
          dfBusy = false;
        } else stage = 'buy';
      }
      if (stage === 'buy') {
        if (queue.length < 3) yield* buyDrink(m);
        stage = 'enter';
      }
      // 找座位
      const s = bad() ? null : freeSeat();
      if (s) {
        if (!memberSeat.has(m)) yield* sitDown(m, s);
        yield* sitting(m, rnd(rMem, 20, 40));
        yield* standUp(m);
      } else {
        // 没座位：站在池边看一会儿水
        const look = rMem() < 0.5 ? 'SW' : 'SE';
        yield* goTo(m, look);
        yield* face(m, yawTo(m.pos, C), 0.4);
        pose(m, 'idle');
        yield* wait(rnd(rMem, 5, 9));
      }
      const exit = m.pos.x < C.x ? 'E' : 'W';
      yield* leave(m, rMem() < 0.7 ? exit : exit === 'W' ? 'E' : 'W');
      stage = 'hidden';
    }
  }
  /** 一开始已经坐着的（白模里的四个）：直接占座，坐一会儿再走 */
  function* seatedStart(m: Actor, seatIdx: number, dur: number): Co {
    const s = seats[seatIdx];
    s.who = m;
    memberSeat.set(m, s);
    m.pos.copy(s.pos);
    m.yaw = s.yaw;
    state.seated++;
    yield* sitting(m, dur);
    yield* standUp(m);
    yield* leave(m, m.pos.x < C.x ? 'W' : 'E');
    yield* memberLoop(m, 'hidden');
  }

  for (const [id, seatIdx, dur] of [
    ['sit-w1', 0, 42],
    ['sit-w2', 1, 30],
    ['sit-n1', 2, 48],
    ['sit-n2', 3, 22],
  ] as [string, number, number][]) {
    const m = person(id);
    if (!m) continue;
    members.push(m);
    spawn(seatedStart(m, seatIdx, dur));
  }
  const buyer0 = person('member-drinks');
  if (buyer0) {
    members.push(buyer0);
    buyer0.yaw = Math.PI;
    spawn(memberLoop(buyer0, 'buy'));
  }
  const up0 = person('member-up');
  if (up0) {
    members.push(up0);
    // 正在西台阶上：先走到台阶顶
    spawn(
      (function* (): Co {
        yield* walk(up0, [at(nd('WT'))]);
        yield* memberLoop(up0, 'enter');
      })(),
    );
  }
  const cross0 = person('member-cross');
  if (cross0) {
    members.push(cross0);
    spawn(
      (function* (): Co {
        yield* walk(cross0, [at(nd('N')), at(nd('NE'))]);
        yield* leave(cross0, 'E');
        yield* memberLoop(cross0, 'hidden');
      })(),
    );
  }
  // 长廊上的一个：来回慢慢走（去 clubdesk / 回来）
  const prom = person('member-prom');
  if (prom)
    spawn(
      (function* (): Co {
        while (true) {
          yield* walk(prom, [v(28, 0, -6.4)], 1.1);
          yield* wait(2);
          yield* walk(prom, [v(57.5, 0, -6.2)], 1.1);
          yield* wait(3);
        }
      })(),
    );
  // 匹克球、看台上的人：原地的准备 / 呼吸（自动播放）
  for (const id of ['pickle-a', 'pickle-c']) env.slot(id)?.userData.pose?.('ready');
  for (const id of ['spectator-1', 'spectator-2']) env.slot(id)?.userData.pose?.('idle');

  // ── 孩子和家长 ──────────────────────────────────────
  const kid = person('kid', '孩子');
  const parent = person('parent', '家长');
  // 孩子站在池壁压顶上（池壁朝镜头那一段，r 4.3 = 压顶中线，高 0.6），沿着池沿走走停停：
  // 蹲下伸手就够得着水面（压顶比水面高 0.18），水花从手边溅起来；家长在池壁外看着
  const KID_R = FOUNTAIN_SPEC.waterR + 0.3;
  const KID_PTS: V2[] = [72, 84, 96, 108, 118].map((d) => {
    const a = (d * Math.PI) / 180;
    return [C.x + Math.cos(a) * KID_R, C.z + Math.sin(a) * KID_R];
  });
  /** 孩子拨水：伸手（pickup），手到水面那一刻溅起一团 */
  function* kidSplash(k: Actor): Co {
    const T = 0.9;
    let did = false;
    for (let t = 0; t < T; ) {
      t += yield;
      const u = Math.min(0.99, t / T);
      pose(k, 'pickup', u * 0.9);
      if (!did && u > 0.42) {
        did = true;
        const dir = C.clone().sub(k.pos).setY(0).normalize();
        // 手边：压顶里沿往里 0.25 米的水面
        const p = k.pos.clone().addScaledVector(dir, 0.55);
        const rr = Math.hypot(p.x - C.x, p.z - C.z);
        if (rr > FOUNTAIN_SPEC.waterR - 0.2)
          p.sub(C)
            .setY(0)
            .setLength(FOUNTAIN_SPEC.waterR - 0.2)
            .add(C);
        p.y = Y_WATER + 0.02;
        splash(p, 7, 1.9, 0.6);
        splashAt = now;
        if (rKid() < 0.35) say(k, '哗啦！', 1.2);
      }
    }
    pose(k, 'idle');
  }
  if (kid)
    spawn(
      (function* (): Co {
        kid.obj.userData.setProp?.(null);
        kid.fixY = Y_RIM;
        kid.pos.set(KID_PTS[1][0], Y_RIM, KID_PTS[1][1]);
        while (true) {
          const target = KID_PTS[Math.floor(rKid() * KID_PTS.length)];
          yield* walk(kid, [v(target[0], Y_RIM, target[1])], 0.8);
          yield* face(kid, yawTo(kid.pos, C) + rnd(rKid, -0.3, 0.3), 0.3);
          const n = 1 + Math.floor(rKid() * 3);
          for (let i = 0; i < n; i++) {
            yield* kidSplash(kid);
            yield* wait(rnd(rKid, 0.3, 1.2));
          }
          pose(kid, 'idle');
          yield* wait(rnd(rKid, 1.5, 4));
        }
      })(),
    );
  if (parent && kid)
    spawn(
      (function* (): Co {
        const home = parent.pos.clone();
        pose(parent, 'idle');
        while (true) {
          const t0 = rnd(rKid, 18, 30);
          for (let t = 0; t < t0; ) {
            const dt = yield;
            t += dt;
            parent.obj.userData.lookAt?.(kid.pos.clone().setY(kid.pos.y + 0.8));
          }
          // 走过去说一句，回来
          const near = kid.pos.clone().add(v(-0.7, 0, 0.55));
          near.y = floorY(near.x, near.z);
          parent.obj.userData.lookAt?.(null);
          yield* walk(parent, [near], 1.2);
          yield* face(parent, yawTo(parent.pos, kid.pos), 0.3);
          pose(parent, 'idle');
          say(parent, rKid() < 0.5 ? '别掉进去！' : '小心点～', 2);
          yield* wait(2.2);
          yield* walk(parent, [home], 1.2);
          yield* face(parent, yawTo(home, kid.pos), 0.3);
          pose(parent, 'idle');
        }
      })(),
    );

  // ── 鸟 ──────────────────────────────────────────
  const birds: Bird[] = [];
  const addBird = (o: THREE.Object3D | undefined, home: V3, yaw: number, bowl: boolean) => {
    if (!o) return;
    scene.attach(o);
    o.position.copy(home);
    o.rotation.set(0, yaw, 0);
    birds.push({
      obj: o,
      home: home.clone(),
      homeYaw: yaw,
      pos: home.clone(),
      yaw,
      mode: 'home',
      fly: null,
      perch: v(0, 0, 0),
      timer: 0,
      act: bowl ? 0 : Math.floor(rBird() * 3),
      actT: rnd(rBird, 1, 4),
      hop: null,
      bowl,
    });
  };
  {
    const pair = env.slot('birds-rim');
    const bs = (pair?.userData.birds as THREE.Object3D[] | undefined) ?? [];
    pair?.updateMatrixWorld(true);
    for (const b of bs) {
      const wp = b.getWorldPosition(new THREE.Vector3());
      const q = b.getWorldQuaternion(new THREE.Quaternion());
      const yaw = new THREE.Euler().setFromQuaternion(q, 'YXZ').y;
      addBird(b, wp, yaw, false);
    }
    // 第三只（白模里正飞下来的那只）：落在池沿西北段
    const a3 = (235 * Math.PI) / 180;
    const h3 = v(C.x + Math.cos(a3) * 4.3, Y_RIM, C.z + Math.sin(a3) * 4.3);
    addBird(env.slot('bird-fly'), h3, a3 + Math.PI / 2, false);
    const bw = env.slot('bird-bowl');
    if (bw) addBird(bw, bw.position.clone(), bw.rotation.y, true);
  }
  /** 每只鸟躲到哪棵蒲葵（离自己最近的），冠顶附近散开 */
  const perchFor = (b: Bird, i: number) => {
    let best = PALMS[0];
    let bd = Infinity;
    for (const p of PALMS) {
      const d = Math.hypot(p.at[0] - b.home.x, p.at[1] - b.home.z);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    const { c, r } = crownOf(best);
    const a = Math.atan2(C.z - c.z, C.x - c.x) + (i - 1.5) * 0.45;
    return v(c.x + Math.cos(a) * r * 0.45, c.y + 0.25, c.z + Math.sin(a) * r * 0.45);
  };
  const startFly = (b: Bird, to: V3, land: 'home' | 'perch', dur = 1.2) => {
    b.mode = 'fly';
    b.hop = null;
    b.fly = { t: 0, dur, from: b.pos.clone(), to: to.clone(), arc: 0.9 + 0.4 * rBird(), land };
    b.obj.userData.pose?.('fly');
  };
  /** 谁在鸟旁边（总监、孩子、会员、家长） */
  const disturbers = (): V3[] => [
    ...people.filter((a) => a.obj.visible).map((a) => a.pos),
    ...(director ? [director.obj.position] : []),
  ];
  const near = (p: V3, r: number) => disturbers().some((q) => Math.hypot(q.x - p.x, q.z - p.z) < r);
  const updateBirds = (dt: number) => {
    // 有人走近 1.5 米 → 一起飞；广场脏了（满池叶子）→ 也飞走，而且不回来（perch 里等广场干净）
    const scare = birds.some((b) => b.mode === 'home' && !b.bowl && near(b.pos, 1.5)) || bad();
    birds.forEach((b, i) => {
      if (b.mode === 'home') {
        if (scare) {
          startFly(b, perchFor(b, i), 'perch');
          b.timer = rnd(rBird, 8, 15) + i * 1.3;
          return;
        }
        // 池沿上的日常：喝水 / 站着甩尾 / 沿池沿跳一两下
        b.actT -= dt;
        if (b.hop) {
          b.hop.t += dt / 0.45;
          const u = Math.min(1, b.hop.t);
          b.pos.lerpVectors(b.hop.from, b.hop.to, u);
          if (u >= 1) {
            b.hop = null;
            b.obj.userData.pose?.('stand');
          }
        } else if (b.actT <= 0) {
          const next = b.bowl ? (b.act === 0 ? 1 : 0) : Math.floor(rBird() * 3);
          b.act = next;
          b.actT = next === 2 ? 0.9 : rnd(rBird, 2, 5);
          if (next === 0) b.obj.userData.pose?.('drink');
          else if (next === 1) b.obj.userData.pose?.('stand');
          else {
            // 沿池沿（切线方向）跳 0.15～0.3 米，离家不超过 0.45
            const ang = Math.atan2(b.pos.z - C.z, b.pos.x - C.x);
            const hAng = Math.atan2(b.home.z - C.z, b.home.x - C.x);
            let d = (rBird() < 0.5 ? -1 : 1) * rnd(rBird, 0.15, 0.3);
            if (Math.abs(ang + d / 4.3 - hAng) * 4.3 > 0.45) d = -d;
            const a2 = ang + d / 4.3;
            const to = v(C.x + Math.cos(a2) * 4.3, b.pos.y, C.z + Math.sin(a2) * 4.3);
            b.hop = { from: b.pos.clone(), to, t: 0 };
            b.yaw = Math.atan2(to.x - b.pos.x, to.z - b.pos.z);
            b.obj.userData.pose?.('hop');
          }
        }
      } else if (b.mode === 'fly' && b.fly) {
        const f = b.fly;
        f.t += dt;
        const u = Math.min(1, f.t / f.dur);
        const top = Math.max(f.from.y, f.to.y) + f.arc - Math.max(f.from.y, f.to.y);
        b.pos.lerpVectors(f.from, f.to, smooth(u));
        b.pos.y += 4 * u * (1 - u) * (f.arc + Math.max(0, top - f.arc));
        b.yaw = turnTo(b.yaw, Math.atan2(f.to.x - f.from.x, f.to.z - f.from.z), dt * 12);
        if (u >= 1) {
          b.fly = null;
          b.pos.copy(f.to);
          if (f.land === 'perch') {
            b.mode = 'perch';
            b.obj.userData.pose?.('stand');
            b.yaw = Math.atan2(C.x - b.pos.x, C.z - b.pos.z);
          } else {
            b.mode = 'home';
            b.yaw = b.homeYaw;
            b.act = 1;
            b.actT = rnd(rBird, 1, 2.5);
            b.obj.userData.pose?.('stand');
          }
        }
      } else if (b.mode === 'perch') {
        b.timer -= dt;
        // 一只一只回来：家附近 2.5 米没人、广场不脏
        if (b.timer <= 0) {
          if (!bad() && !near(b.home, 2.5) && !birds.some((o) => o.mode === 'fly' && o.fly?.land === 'home'))
            startFly(b, b.home, 'home', 1.3);
          else b.timer = rnd(rBird, 2, 4);
        }
      }
      b.obj.position.copy(b.pos);
      b.obj.rotation.y = b.yaw;
    });
    state.birdsAway = birds.some((b) => b.mode !== 'home');
  };

  // ── 总监（玩家；看戏模式下自己干活）─────────────────────────
  const directorOrNull = person('director', '总监');
  if (!directorOrNull) throw new Error('clubplaza life: 没有 director');
  // 函数声明里收窄会丢，这里落成非空常量
  const director: Actor = directorOrNull;
  if (!env.sharedDirector) director.obj.userData.setProp?.(null);
  if (drive) pose(director, 'idle');
  const net = env.slot('skim-net') as THREE.Object3D;
  const tools = cart.userData.tools as Record<'broom' | 'rake' | 'can', THREE.Object3D>;
  /** 捞网靠在保洁车北头（推把那边）：held 状态的杆竖起来，网圈朝上 */
  const stowNet = () => {
    scene.attach(net);
    net.userData.setState?.('held');
    const yaw = cart.rotation.y;
    // 车本地 (−0.75, 0, −0.38) = 推把外侧
    const lx = -0.78;
    const lz = -0.42;
    net.position.set(
      cart.position.x + lx * Math.cos(yaw) + lz * Math.sin(yaw),
      cart.position.y + 0.12,
      cart.position.z - lx * Math.sin(yaw) + lz * Math.cos(yaw),
    );
    // 杆（手 → 网圈）的方向是 (−2.45, −0.6)：绕 z 转到竖直偏 12°，再绕 y 让网圈偏向车外
    net.rotation.set(0, yaw + Math.PI / 2, 0);
    net.rotateZ(-(Math.PI / 2 + Math.atan2(0.6, 2.45)) + 0.2);
  };
  stowNet();
  let held: ToolName | 'cart' | null = null;
  let load = 0;
  const NET_CAP = 3;
  const takeTool = (t: ToolName) => {
    if (held === t) return;
    stowTool();
    const ud = director.obj.userData;
    if (t === 'net') ud.hold?.(net, net.userData.grip, 'net');
    else if (t === 'broom') ud.hold?.(tools.broom, tools.broom.userData.grip, 'broom');
    else ud.hold?.(tools.can, tools.can.userData.grip, 'can');
    held = t;
  };
  function stowTool() {
    if (!held) return;
    if (held === 'cart') {
      dropCart();
      return;
    }
    director.obj.userData.release?.(scene);
    if (held === 'net') stowNet();
    else cart.userData.stow?.(held === 'broom' ? 'broom' : 'can');
    held = null;
    pose(director, 'idle');
  }
  // 推车：车跟在总监身前（推把对着手），总监 push 姿势
  const grabCart = () => {
    stowTool();
    held = 'cart';
  };
  function dropCart() {
    held = null;
    pose(director, 'idle');
  }
  const followCart = () => {
    // 车本地 −x = 推把；推把落在总监身前 0.45 米 → 车心在身前 0.45 + 0.62 + 0.16
    const yaw = director.obj.rotation.y;
    const d = 1.1;
    const p = director.obj.position;
    const cx = p.x + Math.sin(yaw) * d;
    const cz = p.z + Math.cos(yaw) * d;
    cart.position.set(cx, floorY(cx, cz), cz);
    // 车本地 +x（桶）朝前：rotY = yaw − π/2
    cart.rotation.y = yaw - Math.PI / 2;
    if (net.parent === scene) stowNet();
  };

  const dpose = (n: string, ph?: number) => {
    if (drive) pose(director, n, ph);
  };
  /** 一个按秒推的小任务 */
  const job = (
    kind: Job['kind'],
    dur: number,
    step: (t: number, dt: number) => void,
    done: () => void,
    cancel: () => void = () => {},
  ): Job => {
    let t = 0;
    let over = false;
    return {
      kind,
      tick(dt) {
        if (over) return true;
        t += dt;
        step(t, dt);
        if (t >= dur) {
          over = true;
          done();
          return true;
        }
        return false;
      },
      cancel() {
        if (over) return;
        over = true;
        cancel();
      },
      progress: () => clamp(t / dur, 0, 1),
    };
  };
  const faceDirector = (p: V3, dt: number, k = 8) => {
    const o = director.obj;
    o.rotation.y = turnTo(o.rotation.y, yawTo(o.position, p), dt * k);
  };

  /** 捞一片水里的叶子：skim 一遍 1.2 秒，五遍 ≈ 6 秒；网圈贴水往回拖的时候叶子跟着网圈走，最后收进网兜 */
  const startSkim = (ref: LeafRef): Job => {
    const l = leaves[ref.id];
    l.busy = true;
    const SK = 1.2;
    const DUR = 6;
    let lastDot = 0;
    return job(
      'skim',
      DUR,
      (t, dt) => {
        if (drive) faceDirector(l.pos, dt, 6);
        const ph = (t / SK) % 1;
        dpose('skim', ph);
        const tip = director.obj.userData.toolTip?.() as V3 | null;
        if (!tip) return;
        const wet = ph >= SKIM_WET[0];
        if (wet) {
          // 网圈在水面上划：每 0.08 秒一颗泡沫，叶子往网圈挪（越到后面跟得越紧）
          if (t - lastDot > 0.08) {
            lastDot = t;
            foamDot(v(tip.x, Y_WATER + 0.015, tip.z), 0.8);
          }
          const k = clamp(dt * (1.5 + t * 0.9), 0, 1);
          const tx = tip.x;
          const tz = tip.z;
          l.pos.x = lerp(l.pos.x, tx, k);
          l.pos.z = lerp(l.pos.z, tz, k);
          // 不出池
          const ox = l.pos.x - C.x;
          const oz = l.pos.z - C.z;
          const rr = Math.hypot(ox, oz);
          if (rr > WATER_R) {
            l.pos.x = C.x + (ox / rr) * WATER_R;
            l.pos.z = C.z + (oz / rr) * WATER_R;
          }
          placeLeaf(l);
        }
        // 最后一遍拖上来：叶子进网兜（跟着网圈离开水面一点再消失）
        if (t > DUR - 0.5) {
          l.pos.set(tip.x, Math.max(Y_WATER + 0.01, tip.y), tip.z);
          placeLeaf(l);
        }
      },
      () => {
        removeLeaf(l);
        load++;
        dpose('idle');
        if (load >= NET_CAP) say(director, '网兜满了，去倒', 2);
      },
      () => {
        l.busy = false;
        l.drift = driftTarget(l.pos);
        dpose('idle');
      },
    );
  };
  /** 扫一片地上的叶子：sweep 一遍 1.3 秒、两遍半 ≈ 3 秒；叶子被扫帚往身前推，扫成一小堆收起来 */
  const startSweep = (ref: LeafRef): Job => {
    const l = leaves[ref.id];
    l.busy = true;
    const SW = 1.3;
    return job(
      'sweep',
      3.2,
      (t, dt) => {
        if (drive) faceDirector(l.pos, dt, 6);
        const ph = (t / SW) % 1;
        dpose('sweep', ph);
        // 扫帚往前带：叶子每遍挪 10 厘米、转一点
        const o = director.obj;
        const f = v(Math.sin(o.rotation.y), 0, Math.cos(o.rotation.y));
        if (ph > 0.3 && ph < 0.7) {
          l.pos.addScaledVector(f, dt * 0.25);
          l.yaw += dt * 0.8;
          l.pos.y = floorY(l.pos.x, l.pos.z) + 0.006;
          placeLeaf(l);
        }
      },
      () => {
        removeLeaf(l);
        load++;
        dpose('idle');
      },
      () => {
        l.busy = false;
        dpose('idle');
      },
    );
  };
  /** 浇一盆花：pour 一遍 1.2 秒，出水那段从壶嘴落水滴到土面 */
  const startPour = (i: number): Job => {
    const pot = pots[i];
    let lastDrop = 0;
    return job(
      'pour',
      2.4,
      (t, dt) => {
        if (drive) faceDirector(pot.pos, dt, 8);
        const ph = (t / 1.2) % 1;
        dpose('pour', ph);
        if (ph > POUR_FLOW[0] && ph < POUR_FLOW[1] && t - lastDrop > 0.05) {
          lastDrop = t;
          const tip = director.obj.userData.toolTip?.() as V3 | null;
          if (tip) drop(tip, v(0, -0.4, 0), pot.pos.y + 0.77);
        }
      },
      () => {
        pot.wet = 1;
        pot.disc.visible = true;
        dpose('idle');
      },
      () => dpose('idle'),
    );
  };
  /** 倒进桶：dump 一遍 1.6 秒 */
  const startDump = (): Job =>
    job(
      'dump',
      1.6,
      (t, dt) => {
        if (drive) faceDirector(cart.position, dt, 8);
        dpose('dump', Math.min(0.99, t / 1.6));
      },
      () => {
        dumpLoad();
        dpose('idle');
      },
      () => dpose('idle'),
    );
  function dumpLoad() {
    const n = load;
    cartFill = Math.min(1, cartFill + load / CART_CAP);
    cart.userData.setFill?.(cartFill);
    load = 0;
    if (cartFill >= 1) say(director, '桶满了，推去倒', 2.4);
    return n;
  }
  const emptyCart = (k: number) => {
    cartFill = k >= 1 ? 0 : cartFill;
    cart.userData.setFill?.(k >= 1 ? 0 : cartFill * (1 - smooth(k)));
  };
  /** 在长廊东头把桶倒空：dump 姿势，车桶慢慢空 */
  const DUMP = v(57.6, 0, -6.4);
  const startEmpty = (): Job => {
    const f0 = cartFill;
    return job(
      'empty',
      2.2,
      (t) => {
        dpose('dump', Math.min(0.99, t / 2.2));
        cart.userData.setFill?.(f0 * (1 - smooth(t / 2.2)));
      },
      () => {
        cartFill = 0;
        cart.userData.setFill?.(0);
        dpose('push', 0);
      },
      () => cart.userData.setFill?.(cartFill),
    );
  };

  // ── 看戏模式：总监自己干活（?play=0&life=1；截图、连拍）─────────────
  const D = director;
  function* dWalk(to: V3, speed = 2.2) {
    // 绕开池子：从最近的路网点走到离目标最近的路网点再过去
    const a = nearestNode(D.pos);
    const b = nearestNode(to);
    const pts = a === b ? [to] : [...pathTo(a, b), to];
    yield* walk(D, pts, speed, 1.3, held === 'cart' ? 'push' : 'walk');
    sync(D);
  }
  let curJob: Job | null = null;
  function* runJob(j: Job): Co {
    curJob = j;
    while (true) {
      const dt = yield;
      D.obj.position.copy(D.pos);
      if (j.tick(dt)) break;
      D.yaw = D.obj.rotation.y;
    }
    D.yaw = D.obj.rotation.y;
    curJob = null;
  }
  const atCart = () => {
    const y = cart.rotation.y;
    // 车本地 (−0.2, 0, 0.75)：车西边（rotY W 时 = 车的北边偏西）
    return v(
      cart.position.x - 0.95 * Math.cos(y + Math.PI / 2),
      H.plaza,
      cart.position.z + 0.95 * Math.sin(y + Math.PI / 2),
    );
  };
  function* directorDemo(): Co {
    yield* wait(1.5);
    while (true) {
      const wl = leaves.filter((l) => l.on && !l.fall && l.kind === 'water');
      const tl = leaves.filter((l) => l.on && !l.fall && l.kind === 'tile');
      if (cartFill >= 0.9) {
        // 桶满了：放下工具，推车下东台阶到长廊东头倒掉，再推回广场（停在保洁车原来那块荫里）
        yield* dWalk(atCart());
        stowTool();
        grabCart();
        yield* dWalk(DUMP.clone().add(v(-1.2, 0, 0)), 1.8);
        yield* face(D, Math.PI / 2, 0.4);
        yield* runJob(startEmpty());
        yield* dWalk(v(50.0, H.plaza, -18.4), 1.8);
        yield* face(D, Math.PI, 0.5);
        dropCart();
        continue;
      }
      if (load > 0 && (load >= NET_CAP || (!wl.length && !tl.length) || (held === 'net' && !wl.length))) {
        yield* dWalk(atCart());
        yield* runJob(startDump());
      } else if (wl.length) {
        if (held !== 'net') {
          yield* dWalk(atCart());
          takeTool('net');
          yield* wait(0.3);
        }
        const l = wl.reduce((a, b) => (flat(a.pos, D.pos) < flat(b.pos, D.pos) ? a : b));
        yield* dWalk(rimSpot(l));
        yield* runJob(startSkim(l));
      } else if (tl.length) {
        if (held !== 'broom') {
          yield* dWalk(atCart());
          takeTool('broom');
          yield* wait(0.3);
        }
        const l = tl.reduce((a, b) => (flat(a.pos, D.pos) < flat(b.pos, D.pos) ? a : b));
        const back = l.pos.clone().sub(C).setY(0).normalize().multiplyScalar(0.75);
        yield* dWalk(l.pos.clone().add(back));
        yield* runJob(startSweep(l));
      } else {
        const dry = pots.find((p) => p.wet < 0.4);
        if (dry) {
          if (held !== 'can') {
            yield* dWalk(atCart());
            takeTool('can');
            yield* wait(0.3);
          }
          yield* dWalk(dry.pos.clone().add(v(0, 0, -0.85)));
          yield* runJob(startPour(dry.id));
        } else {
          if (held) {
            yield* dWalk(atCart());
            stowTool();
          }
          pose(D, 'idle');
          yield* wait(2);
        }
      }
    }
  }
  const rimSpot = (ref: LeafRef) => {
    const a = Math.atan2(ref.pos.z - C.z, ref.pos.x - C.x);
    const r = FOUNTAIN_SPEC.basinR + 0.55;
    const x = C.x + Math.cos(a) * r;
    const z = C.z + Math.sin(a) * r;
    return v(x, floorY(x, z), z);
  };

  // 一开始：水里两片、地上两片（总监一来就有活）
  {
    const w0 = leaves.filter((l) => l.kind === 'water');
    putLeaf(w0[0], v(46.4, Y_WATER + 0.01, -23.0), 0.5);
    putLeaf(w0[1], v(41.7, Y_WATER + 0.01, -25.9), -0.8);
    const t0 = leaves.filter((l) => l.kind === 'tile');
    putLeaf(t0[0], v(SPOTS.sweepE[0], H.plaza + 0.006, SPOTS.sweepE[1]), 1.1);
    putLeaf(t0[1], v(SPOTS.sweepW[0], H.plaza + 0.006, SPOTS.sweepW[1]), -0.4);
  }

  spawn(vendorLoop());
  if (!env.play) spawn(directorDemo());

  const count = () => {
    state.water = leaves.filter((l) => l.on && !l.fall && l.kind === 'water').length;
    state.tiles = leaves.filter((l) => l.on && !l.fall && l.kind === 'tile').length;
    state.dirt = state.water + state.tiles * 0.5;
    state.cart = Math.round(cartFill * CART_CAP);
    state.load = load;
  };
  count();
  setWaterLeaves(state.water);

  for (const a of people) sync(a);

  const life: PlazaLife = {
    state,
    stats() {
      const clean = Math.round(clamp(100 - state.dirt * 14, 0, 100));
      return `广场 ${clean}% · 水里 ${state.water} 片 · 桶 ${state.cart}/${CART_CAP} · 长椅 ${state.seated} 人`;
    },
    alerts() {
      const out: { p: V3; text: string }[] = [];
      for (const [a, b] of bubbles) {
        if (b.until < now || !a.obj.visible) {
          bubbles.delete(a);
          continue;
        }
        const h = a.obj.userData.setSeat && memberSeat.has(a) ? 1.75 : 2.1;
        out.push({ p: a.obj.position.clone().setY(a.obj.position.y + (a === kid ? 1.55 : h)), text: b.text });
      }
      return out;
    },
    people: () =>
      people
        .filter((a) => a !== director && a.obj.visible)
        .map((a) => ({ x: a.pos.x, z: a.pos.z, r: a === kid ? 0.25 : 0.32 })),
    blockers: () => [
      { x: cart.position.x, z: cart.position.z, r: 0.6 },
      ...(drinks ? [{ x: drinks.position.x, z: drinks.position.z, r: 1.0 }] : []),
    ],
    debug: () => ({
      leaves: leaves
        .filter((l) => l.on)
        .map((l) => [l.id, l.kind, +l.pos.x.toFixed(2), +l.pos.z.toFixed(2), !!l.fall, l.busy]),
      birds: birds.map((b) => [b.mode, +b.pos.x.toFixed(2), +b.pos.y.toFixed(2), +b.pos.z.toFixed(2)]),
      people: people.map((a) => [a.name, a.obj.visible, +a.pos.x.toFixed(2), +a.pos.z.toFixed(2)]),
      queue: queue.map((a) => a.name),
      held,
      job: curJob ? [curJob.kind, +curJob.progress().toFixed(2)] : null,
      director: [+director.obj.position.x.toFixed(2), +director.obj.position.z.toFixed(2)],
      load,
      cartFill,
      pressure,
    }),
    play: {
      director: director.obj,
      cart,
      cartPos: () => cart.position.clone(),
      held: () => held,
      take: takeTool,
      stow: stowTool,
      load: () => load,
      leaves: (kind) => leaves.filter((l) => l.on && !l.fall && (!kind || l.kind === kind)),
      nearestLeaf(kind, p, max) {
        let best: Leaf | null = null;
        let bd = max;
        for (const l of leaves) {
          if (!l.on || l.fall || l.busy || l.kind !== kind) continue;
          const d = flat(l.pos, p);
          if (d < bd) {
            bd = d;
            best = l;
          }
        }
        return best;
      },
      rimSpot,
      pots: () => pots.map((p) => ({ id: p.id, pos: p.pos.clone(), wet: p.wet })),
      cartFill: () => cartFill,
      dumpPoint: () => DUMP.clone(),
      startSkim,
      startSweep,
      startPour,
      startDump,
      grabCart,
      dropCart,
      startEmpty,
      say: (text, s) => say(director, text, s),
      net,
      tools,
      stowNet,
      stowOnCart: (name) => cart.userData.stow?.(name),
      dumpLoad,
      emptyCart,
      debugFill(f) {
        cartFill = clamp(f, 0, 1);
        cart.userData.setFill?.(cartFill);
      },
    },
    dropLeaf: (i) => dropFrond(i),
    post() {
      if (held === 'cart') followCart();
    },
    update(dt) {
      now += dt;
      updateDrops(dt);
      for (let i = bg.length - 1; i >= 0; i--) if (bg[i].next(dt).done) bg.splice(i, 1);
      updateLeaves(dt);
      updateBirds(dt);
      updateFx(dt);
      for (const p of pots) {
        p.wet = Math.max(0, p.wet - dt / 150);
        p.disc.visible = p.wet > 0.35;
      }
      if (drive && held === 'cart') followCart();
      count();
      setWaterLeaves(state.water);
      for (const a of people) if (a !== director || !env.play) sync(a);
    },
  };
  return life;
}

function smooth(u: number) {
  const k = clamp(u, 0, 1);
  return k * k * (3 - 2 * k);
}

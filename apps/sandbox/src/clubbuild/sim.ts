// clubbuild 的模拟：纯函数式状态机（照 CLAUDE.md 的模拟规则写，虽然只是 sandbox 的思想实验）。
// 输入状态 + 命令 / 时间，输出新状态 + 领域事件；状态可序列化（只有数字、字符串、数组、普通对象），
// 不碰 three、DOM，不用 Math.random —— 随机数的种子在状态里（state.rng，mulberry32 一步一步往下走）。
//
// 规则（开罗式）：
// - 摆设施：在地块里、不压别的东西、星级够、钱够；当场扣钱。步道 1×1，可以连刷。拆掉退一半。
// - 建造：BUILD_SECONDS 秒建好（'built'）；建好时看相邻的组合（catalog COMBOS），第一次凑成的组合 = 新发现。
// - 客人：每天来多少按"吸引力"总和（设施的 appeal + 组合加成）；客人类型按各设施吸引的客群加权抽；
//   每位客人挑一个吸引他、有空位、走得到的设施（占一个位子，从走过去起就占），到了就花钱（'visitorSpend'），
//   待一会儿，一半人再去第二个地方，然后从大门走掉。
// - 走得到：设施的门格旁边（门格四邻、在占地外面）有一块步道，这块步道沿着步道连到大门（地块南边正中）。
//   走不到的设施头上显示"没有路"，一分钱不赚 —— 开罗式的温柔教学。
// - 钱只在两处变：客人花钱（马上进账）和每天收盘（扣维护费）。外加玩家自己的建造 / 拆除。
// - 每天收盘（'daySettled'）后看星级目标（STAR_GOALS），够了就升星（'starUp'），解锁新设施。
import {
  BUILDINGS,
  type BuildingDef,
  BY_ID,
  COMBOS,
  type Combo,
  DAY_SECONDS,
  type Guest,
  LOT_D,
  LOT_W,
  STAR_GOALS,
  START_MONEY,
  TILE,
} from './catalog';

export type Rot = 0 | 1 | 2 | 3;
export type Tile = [number, number];

/** 大门：南边正中两格（row LOT_D-1），永远算步道、不能建东西 */
export const GATE_ROW = LOT_D - 1;
export const GATE_COLS = [LOT_W / 2 - 1, LOT_W / 2] as const;
/** 建一座设施要几秒（游戏秒） */
export const BUILD_SECONDS = 2;
/** 客人走路：每秒几格（游戏秒；演出按同样的速度走，到门口正好赶上花钱） */
export const WALK_TPS = 2.5;
/** 大门外那段路（格）：客人从画面下沿走进来、走出去，走路时间算上它 */
export const ROAD_TILES = 5;
/** 一天（time 0..1）对应的钟点：7:00 开门，18:00 收盘（再晚天就暗了） */
export const DAY_START_HOUR = 7;
export const DAY_HOURS = 11;
export const hourOf = (time: number) => DAY_START_HOUR + time * DAY_HOURS;
/** 一天里开门迎客的时段（一天 0..1）：这之外不来新客人 */
export const OPEN_FROM = 0.03;
export const OPEN_TO = 0.72;
/** 每天的客人数 = BASE_VISITORS + 吸引力总和 × APPEAL_K */
export const BASE_VISITORS = 4;
export const APPEAL_K = 1;
/** 去第二个地方的概率 */
export const SECOND_STOP = 0.5;
/** 拆除退款比例 */
export const REFUND = 0.5;
/** 日志最多留几条 */
const LOG_MAX = 40;

/** 在一处待多久（游戏秒），按标签 */
const STAY_BY_TAG: Record<string, number> = {
  court: 9,
  pool: 9,
  stand: 8,
  house: 6,
  shop: 4,
  food: 5,
};
export function stayOf(def: BuildingDef): number {
  for (const t of def.tags) if (STAY_BY_TAG[t] !== undefined) return STAY_BY_TAG[t];
  return 5;
}

export interface Placed {
  uid: number;
  id: string;
  col: number;
  row: number;
  rot: Rot;
  /** 第几天放下的 */
  builtAt: number;
  /** 建造进度 0..1（1 = 建好） */
  build: number;
}

export interface Visitor {
  vid: number;
  guest: Guest;
  /** 要去的设施（uid），stops[i] 是现在这一站 */
  stops: number[];
  i: number;
  /** walk = 正往 stops[i] 走；stay = 在 stops[i] 待着；out = 往大门走 */
  stage: 'walk' | 'stay' | 'out';
  /** 这一段还剩几秒 */
  t: number;
}

export interface DayStats {
  income: number;
  visitors: number;
  /** 来了但没位子走掉的 */
  turnedAway: number;
  /** 每个设施今天赚了多少 / 接了几位 */
  byUid: Record<number, { income: number; guests: number }>;
  /** 组合加成多赚的 */
  comboBonus: number;
}

export interface LogEntry {
  day: number;
  text: string;
}

export interface State {
  seed: number;
  /** mulberry32 的内部状态（32 位） */
  rng: number;
  money: number;
  day: number;
  /** 一天里的时刻 0..1（1 = 收盘） */
  time: number;
  star: number;
  totalVisitors: number;
  nextUid: number;
  nextVid: number;
  placed: Placed[];
  /** 发现过的组合 id */
  combos: string[];
  /** 凑成的每一对：`${combo}:${aUid}:${bUid}` */
  pairs: string[];
  visitors: Visitor[];
  today: DayStats;
  /** 来客的累加器（满 1 来一位） */
  arrivalAcc: number;
  log: LogEntry[];
}

export type Command =
  | { type: 'place'; id: string; col: number; row: number; rot?: Rot }
  | { type: 'remove'; uid: number };

export type PlaceError = 'unknown' | 'bounds' | 'overlap' | 'locked' | 'money';

export type SimEvent =
  | { type: 'placed'; uid: number; id: string; cost: number }
  | { type: 'rejected'; reason: PlaceError | 'missing' | 'gate' }
  | { type: 'removed'; uid: number; id: string; refund: number }
  | { type: 'built'; uid: number; id: string }
  | { type: 'comboFound'; combo: string; uids: [number, number]; first: boolean }
  | { type: 'visitorArrive'; vid: number; guest: Guest; to: number }
  | { type: 'visitorSpend'; vid: number; uid: number; amount: number; bonus: number }
  | { type: 'visitorGo'; vid: number; from: number; to: number | null }
  | { type: 'visitorLeave'; vid: number }
  | { type: 'turnedAway'; guest: Guest }
  | {
      type: 'daySettled';
      day: number;
      income: number;
      upkeep: number;
      net: number;
      visitors: number;
      turnedAway: number;
      reasons: string[];
    }
  | { type: 'starUp'; star: number; unlocked: string[] };

export interface Result {
  state: State;
  events: SimEvent[];
}

// ── 随机数（种子在状态里） ──────────────────────────────

/** mulberry32 走一步：返回 [0,1) 并更新 s.rng（s 是已经复制过的状态） */
function rand(s: State): number {
  s.rng = (s.rng + 0x6d2b79f5) >>> 0;
  let r = Math.imul(s.rng ^ (s.rng >>> 15), 1 | s.rng);
  r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
  return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
}

function pickWeighted<T>(s: State, items: T[], w: (t: T) => number): T | null {
  let sum = 0;
  for (const it of items) sum += Math.max(0, w(it));
  if (sum <= 0) return null;
  let x = rand(s) * sum;
  for (const it of items) {
    x -= Math.max(0, w(it));
    if (x < 0) return it;
  }
  return items[items.length - 1] ?? null;
}

// ── 开局 ────────────────────────────────────────────────

const emptyDay = (): DayStats => ({ income: 0, visitors: 0, turnedAway: 0, byUid: {}, comboBonus: 0 });

export function newState(seed = 23, opts: { money?: number; day?: number; star?: number } = {}): State {
  return {
    seed,
    rng: (seed * 2654435761) >>> 0,
    money: opts.money ?? START_MONEY,
    day: opts.day ?? 1,
    time: 0,
    star: opts.star ?? 0,
    totalVisitors: 0,
    nextUid: 1,
    nextVid: 1,
    placed: [],
    combos: [],
    pairs: [],
    visitors: [],
    today: emptyDay(),
    arrivalAcc: 0,
    log: [],
  };
}

/** 开局的小布局：一片硬地 + 从大门进来的步道 + 门口两棵棕榈 + 一辆咖啡车（离球场远，组合留给玩家发现）。不花钱、直接建好 */
export const STARTER: { id: string; col: number; row: number; rot?: Rot }[] = [
  { id: 'court-hard', col: 2, row: 2 },
  { id: 'cafe', col: 12, row: 18 },
  { id: 'palm', col: 7, row: 23 },
  { id: 'palm', col: 10, row: 23 },
  { id: 'palm', col: 7, row: 20 },
  ...pathLine(8, 14, 8, 24),
  ...pathLine(9, 14, 9, 24),
  ...pathLine(2, 14, 7, 14),
  ...pathLine(10, 20, 13, 20),
];

/** 一段直的步道（含两端） */
export function pathLine(c0: number, r0: number, c1: number, r1: number): { id: string; col: number; row: number }[] {
  const out: { id: string; col: number; row: number }[] = [];
  const n = Math.max(Math.abs(c1 - c0), Math.abs(r1 - r0));
  for (let i = 0; i <= n; i++)
    out.push({
      id: 'path',
      col: c0 + Math.round(((c1 - c0) * i) / Math.max(1, n)),
      row: r0 + Math.round(((r1 - r0) * i) / Math.max(1, n)),
    });
  return out;
}

/** 把一组设施直接摆好建好（开局、测试用）：不扣钱、不发事件；组合也直接算上（不算"发现"） */
export function withLayout(state: State, items: { id: string; col: number; row: number; rot?: Rot }[]): State {
  const s = clone(state);
  for (const it of items) {
    const def = BY_ID[it.id];
    if (!def) continue;
    const rot = it.rot ?? 0;
    if (placeError(s, def, it.col, it.row, rot, true)) continue;
    s.placed.push({ uid: s.nextUid++, id: it.id, col: it.col, row: it.row, rot, builtAt: s.day, build: 1 });
  }
  for (const p of s.placed) for (const e of newPairs(s, p)) s.pairs.push(e.key);
  return s;
}

// ── 网格几何 ────────────────────────────────────────────

/** 转过以后的占地（格） */
export function footprint(def: BuildingDef, rot: Rot): { w: number; d: number } {
  return rot % 2 ? { w: def.d, d: def.w } : { w: def.w, d: def.d };
}

export interface Rect {
  c0: number;
  r0: number;
  /** 不含 */
  c1: number;
  r1: number;
}
export function rectOf(def: BuildingDef, col: number, row: number, rot: Rot): Rect {
  const { w, d } = footprint(def, rot);
  return { c0: col, r0: row, c1: col + w, r1: row + d };
}

/** 占地里相对中心的偏移（格，rot 0 的本地 x/z）转 rot 次 90°（three 的 rotation.y：+z → +x） */
export function rotXZ(x: number, z: number, rot: Rot): [number, number] {
  let a = x;
  let b = z;
  for (let i = 0; i < rot; i++) [a, b] = [b, -a];
  return [a, b];
}

/** 门格（转过以后的地块坐标） */
export function doorTile(p: { id: string; col: number; row: number; rot: Rot }): Tile {
  const def = BY_ID[p.id];
  const ox = def.door[0] + 0.5 - def.w / 2;
  const oz = def.door[1] + 0.5 - def.d / 2;
  const [x, z] = rotXZ(ox, oz, p.rot);
  const { w, d } = footprint(def, p.rot);
  return [Math.round(p.col + x + w / 2 - 0.5), Math.round(p.row + z + d / 2 - 0.5)];
}

/** 格子中心 → 世界坐标（米，地块中心是原点） */
export function tileCenter(col: number, row: number): [number, number] {
  return [(col + 0.5 - LOT_W / 2) * TILE, (row + 0.5 - LOT_D / 2) * TILE];
}
/** 设施占地中心 → 世界坐标 */
export function placedCenter(p: { id: string; col: number; row: number; rot: Rot }): [number, number] {
  const { w, d } = footprint(BY_ID[p.id], p.rot);
  return [(p.col + w / 2 - LOT_W / 2) * TILE, (p.row + d / 2 - LOT_D / 2) * TILE];
}
/** 世界坐标 → 格子（不管出没出界） */
export function worldToTile(x: number, z: number): Tile {
  return [Math.floor(x / TILE + LOT_W / 2), Math.floor(z / TILE + LOT_D / 2)];
}

export const inLot = (c: number, r: number) => c >= 0 && r >= 0 && c < LOT_W && r < LOT_D;
export const isGate = (c: number, r: number) => r === GATE_ROW && (GATE_COLS as readonly number[]).includes(c);

/** 占用表：每格 = 占着它的 uid，0 = 空，-1 = 大门 */
export function occupancy(state: State): Int32Array {
  const occ = new Int32Array(LOT_W * LOT_D);
  for (const c of GATE_COLS) occ[GATE_ROW * LOT_W + c] = -1;
  for (const p of state.placed) {
    const r = rectOf(BY_ID[p.id], p.col, p.row, p.rot);
    for (let y = r.r0; y < r.r1; y++) for (let x = r.c0; x < r.c1; x++) if (inLot(x, y)) occ[y * LOT_W + x] = p.uid;
  }
  return occ;
}

const byUid = (s: State, uid: number) => s.placed.find((p) => p.uid === uid);

// ── 摆放 ────────────────────────────────────────────────

/** 能不能放（null = 能）；free = 不看钱和星级（开局布局） */
export function placeError(
  state: State,
  def: BuildingDef | undefined,
  col: number,
  row: number,
  rot: Rot,
  free = false,
): PlaceError | null {
  if (!def) return 'unknown';
  const r = rectOf(def, col, row, rot);
  if (r.c0 < 0 || r.r0 < 0 || r.c1 > LOT_W || r.r1 > LOT_D) return 'bounds';
  const occ = occupancy(state);
  for (let y = r.r0; y < r.r1; y++) for (let x = r.c0; x < r.c1; x++) if (occ[y * LOT_W + x] !== 0) return 'overlap';
  if (!free && def.star > state.star) return 'locked';
  if (!free && state.money < def.cost) return 'money';
  return null;
}

export function canPlace(state: State, id: string, col: number, row: number, rot: Rot = 0): PlaceError | null {
  return placeError(state, BY_ID[id], col, row, rot);
}

/** 执行一条命令（摆 / 拆） */
export function apply(state: State, cmd: Command): Result {
  const s = clone(state);
  const events: SimEvent[] = [];
  if (cmd.type === 'place') {
    const def = BY_ID[cmd.id];
    const rot = cmd.rot ?? 0;
    const err = placeError(s, def, cmd.col, cmd.row, rot);
    if (err) return { state, events: [{ type: 'rejected', reason: err }] };
    const p: Placed = { uid: s.nextUid++, id: def.id, col: cmd.col, row: cmd.row, rot, builtAt: s.day, build: 0 };
    s.money -= def.cost;
    s.placed.push(p);
    events.push({ type: 'placed', uid: p.uid, id: p.id, cost: def.cost });
    // 步道当场铺好（不算建造、不凑组合）
    if (def.cat === 'road') p.build = 1;
  } else {
    const p = byUid(s, cmd.uid);
    if (!p) return { state, events: [{ type: 'rejected', reason: 'missing' }] };
    const def = BY_ID[p.id];
    const refund = Math.floor(def.cost * REFUND);
    s.money += refund;
    s.placed = s.placed.filter((q) => q.uid !== p.uid);
    s.pairs = s.pairs.filter((k) => {
      const [, a, b] = k.split(':');
      return Number(a) !== p.uid && Number(b) !== p.uid;
    });
    events.push({ type: 'removed', uid: p.uid, id: p.id, refund });
    // 正往这里走 / 在这里待着的客人：直接回家
    for (const v of s.visitors) {
      if (v.stage !== 'out' && v.stops[v.i] === p.uid) {
        v.stage = 'out';
        v.t = 4;
        events.push({ type: 'visitorGo', vid: v.vid, from: p.uid, to: null });
      }
      // 计划里的后一站被拆了：去掉
      v.stops = v.stops.filter((u, k) => k <= v.i || u !== p.uid);
    }
  }
  return { state: s, events };
}

// ── 路 ──────────────────────────────────────────────────

/** 设施要不要连到路才能营业（有客位的、停车场） */
export function needsPath(def: BuildingDef): boolean {
  return def.cap > 0 || def.tags.includes('parking');
}

/** 步道格（含大门）：1 = 是 */
function pathGrid(state: State): Uint8Array {
  const g = new Uint8Array(LOT_W * LOT_D);
  for (const c of GATE_COLS) g[GATE_ROW * LOT_W + c] = 1;
  for (const p of state.placed) if (p.id === 'path') g[p.row * LOT_W + p.col] = 1;
  return g;
}

const N4: Tile[] = [
  [0, 1],
  [1, 0],
  [0, -1],
  [-1, 0],
];

/** 设施门口能进出的步道格（门格的四邻，在占地外面、是步道） */
function entries(p: Placed, grid: Uint8Array): Tile[] {
  const [dc, dr] = doorTile(p);
  const r = rectOf(BY_ID[p.id], p.col, p.row, p.rot);
  const out: Tile[] = [];
  for (const [ax, ay] of N4) {
    const c = dc + ax;
    const w = dr + ay;
    if (!inLot(c, w)) continue;
    if (c >= r.c0 && c < r.c1 && w >= r.r0 && w < r.r1) continue;
    if (grid[w * LOT_W + c]) out.push([c, w]);
  }
  return out;
}

/** 步道上 BFS：从 sources 到最近的 goal，返回经过的格（含两端）；走不通 null */
function bfs(grid: Uint8Array, sources: Tile[], goals: Tile[]): Tile[] | null {
  if (!sources.length || !goals.length) return null;
  const goal = new Set(goals.map(([c, r]) => r * LOT_W + c));
  const prev = new Int32Array(LOT_W * LOT_D).fill(-2);
  const q: number[] = [];
  for (const [c, r] of sources) {
    const k = r * LOT_W + c;
    if (prev[k] !== -2) continue;
    prev[k] = -1;
    q.push(k);
  }
  for (let h = 0; h < q.length; h++) {
    const k = q[h];
    if (goal.has(k)) {
      const path: Tile[] = [];
      for (let x = k; x !== -1; x = prev[x]) path.push([x % LOT_W, Math.floor(x / LOT_W)]);
      return path.reverse();
    }
    const c = k % LOT_W;
    const r = Math.floor(k / LOT_W);
    for (const [ax, ay] of N4) {
      const nc = c + ax;
      const nr = r + ay;
      if (!inLot(nc, nr)) continue;
      const nk = nr * LOT_W + nc;
      if (prev[nk] !== -2 || !grid[nk]) continue;
      prev[nk] = k;
      q.push(nk);
    }
  }
  return null;
}

const gateTiles = (): Tile[] => GATE_COLS.map((c) => [c, GATE_ROW] as Tile);

/**
 * 路线（格）：from / to = 设施 uid，null = 大门。设施那头从门格算起 / 到门格为止。走不通 null。
 * 模拟按它的长度算走多久；演出按它走 —— 两边用同一条路。
 */
export function route(state: State, from: number | null, to: number | null): Tile[] | null {
  const grid = pathGrid(state);
  const ends = (uid: number | null): { tiles: Tile[]; door: Tile | null } => {
    if (uid === null) return { tiles: gateTiles(), door: null };
    const p = byUid(state, uid);
    if (!p) return { tiles: [], door: null };
    return { tiles: entries(p, grid), door: doorTile(p) };
  };
  const a = ends(from);
  const b = ends(to);
  const mid = bfs(grid, a.tiles, b.tiles);
  if (!mid) return null;
  return [...(a.door ? [a.door] : []), ...mid, ...(b.door ? [b.door] : [])];
}

/** 从大门走得到的设施（uid） */
export function reachableSet(state: State): Set<number> {
  const grid = pathGrid(state);
  // 从大门洪泛一遍
  const seen = new Uint8Array(LOT_W * LOT_D);
  const q: number[] = [];
  for (const [c, r] of gateTiles()) {
    seen[r * LOT_W + c] = 1;
    q.push(r * LOT_W + c);
  }
  for (let h = 0; h < q.length; h++) {
    const k = q[h];
    const c = k % LOT_W;
    const r = Math.floor(k / LOT_W);
    for (const [ax, ay] of N4) {
      const nc = c + ax;
      const nr = r + ay;
      if (!inLot(nc, nr)) continue;
      const nk = nr * LOT_W + nc;
      if (seen[nk] || !grid[nk]) continue;
      seen[nk] = 1;
      q.push(nk);
    }
  }
  const out = new Set<number>();
  for (const p of state.placed) {
    if (p.id === 'path') continue;
    if (entries(p, grid).some(([c, r]) => seen[r * LOT_W + c])) out.add(p.uid);
  }
  return out;
}

/** 建好了、要路却走不到的设施（头上显示"没有路"） */
export function unreachable(state: State): number[] {
  const ok = reachableSet(state);
  return state.placed
    .filter((p) => p.build >= 1 && p.id !== 'path' && needsPath(BY_ID[p.id]) && !ok.has(p.uid))
    .map((p) => p.uid);
}

// ── 组合 ────────────────────────────────────────────────

/** 两块占地之间隔几格（切比雪夫；贴着 = 0） */
export function gap(a: Rect, b: Rect): number {
  const dx = Math.max(0, a.c0 - b.c1, b.c0 - a.c1);
  const dy = Math.max(0, a.r0 - b.r1, b.r0 - a.r1);
  return Math.max(dx, dy);
}

const rectP = (p: { id: string; col: number; row: number; rot: Rot }) => rectOf(BY_ID[p.id], p.col, p.row, p.rot);

/** combo 在 (x 当 a, y 当 b) 这一对上成立吗 */
function comboHolds(c: Combo, x: { id: string }, y: { id: string }, g: number): boolean {
  return BY_ID[x.id].tags.includes(c.a) && BY_ID[y.id].tags.includes(c.b) && g <= (c.range ?? 1);
}

const pairKey = (c: Combo, a: number, b: number) =>
  c.a === c.b ? `${c.id}:${Math.min(a, b)}:${Math.max(a, b)}` : `${c.id}:${a}:${b}`;

/** p 和别的已建好的设施新凑成的组合（还没记进 state.pairs 的） */
function newPairs(s: State, p: Placed): { key: string; combo: Combo; a: number; b: number }[] {
  const out: { key: string; combo: Combo; a: number; b: number }[] = [];
  if (p.id === 'path') return out;
  const rp = rectP(p);
  for (const q of s.placed) {
    if (q.uid === p.uid || q.build < 1 || q.id === 'path') continue;
    const g = gap(rp, rectP(q));
    for (const c of COMBOS) {
      for (const [x, y] of [
        [p, q],
        [q, p],
      ] as const) {
        if (!comboHolds(c, x, y, g)) continue;
        const key = pairKey(c, x.uid, y.uid);
        if (s.pairs.includes(key) || out.some((o) => o.key === key)) continue;
        out.push({ key, combo: c, a: x.uid, b: y.uid });
      }
    }
  }
  return out;
}

/** 摆在这里会凑成哪些组合（放置时的提示）：对方的 uid + 组合 */
export function comboPreview(
  state: State,
  id: string,
  col: number,
  row: number,
  rot: Rot,
): { combo: Combo; uid: number; known: boolean }[] {
  const def = BY_ID[id];
  if (!def || def.cat === 'road') return [];
  const ghost = { uid: -1, id, col, row, rot, builtAt: state.day, build: 1 };
  const rp = rectP(ghost);
  const out: { combo: Combo; uid: number; known: boolean }[] = [];
  for (const q of state.placed) {
    if (q.id === 'path') continue;
    const g = gap(rp, rectP(q));
    for (const c of COMBOS)
      if (comboHolds(c, ghost, q, g) || comboHolds(c, q, ghost, g))
        if (!out.some((o) => o.uid === q.uid && o.combo.id === c.id))
          out.push({ combo: c, uid: q.uid, known: state.combos.includes(c.id) });
  }
  return out;
}

/** 每个设施身上生效的组合（作为 a 那边；同一个组合只算一次） */
export function activeCombos(state: State, uid: number): Combo[] {
  const ids = new Set<string>();
  for (const k of state.pairs) {
    const [cid, a, b] = k.split(':');
    const c = COMBOS.find((x) => x.id === cid);
    if (!c) continue;
    // 同标签的组合（美食街）两边都算 a
    if (Number(a) === uid || (c.a === c.b && Number(b) === uid)) ids.add(cid);
  }
  return COMBOS.filter((c) => ids.has(c.id));
}

/** 设施的实际收费（组合乘数） */
export function spendOf(state: State, p: Placed): { amount: number; base: number } {
  const def = BY_ID[p.id];
  let k = 1;
  for (const c of activeCombos(state, p.uid)) k *= c.spend;
  return { amount: Math.round(def.spend * k), base: def.spend };
}

/** 设施的实际吸引力（组合加数）；没建好 = 0，要路却走不到 = 0 */
export function appealOf(state: State, p: Placed, reach?: Set<number>): number {
  const def = BY_ID[p.id];
  if (p.build < 1) return 0;
  if (needsPath(def) && !(reach ?? reachableSet(state)).has(p.uid)) return 0;
  let a = def.appeal;
  for (const c of activeCombos(state, p.uid)) a += c.appeal;
  return a;
}

/** 今天的预计客人数（按现在的布局） */
export function visitorsPerDay(state: State): number {
  const reach = reachableSet(state);
  let sum = 0;
  for (const p of state.placed) sum += appealOf(state, p, reach);
  const hosts = state.placed.some((p) => p.build >= 1 && BY_ID[p.id].cap > 0 && reach.has(p.uid));
  return hosts ? BASE_VISITORS + sum * APPEAL_K : 0;
}

/** 设施现在占了几个位子（正往这走 + 在这待着的） */
export function occupantsOf(state: State, uid: number): number {
  let n = 0;
  for (const v of state.visitors) if (v.stage !== 'out' && v.stops[v.i] === uid) n++;
  return n;
}

/** 星级目标的进度（下一颗星；满星 null） */
export function starProgress(state: State): {
  goal: (typeof STAR_GOALS)[number];
  items: { key: string; label: string; have: number; need: number; done: boolean }[];
  done: boolean;
} | null {
  const goal = STAR_GOALS.find((g) => g.star === state.star + 1);
  if (!goal) return null;
  const buildings = state.placed.filter((p) => p.id !== 'path' && p.build >= 1).length;
  const items = [
    { key: 'visitors', label: '累计客人', have: state.totalVisitors, need: goal.visitors },
    { key: 'buildings', label: '设施', have: buildings, need: goal.buildings },
    { key: 'combos', label: '发现组合', have: state.combos.length, need: goal.combos },
    { key: 'money', label: '手上的钱', have: state.money, need: goal.money },
  ]
    .filter((i) => i.need > 0)
    .map((i) => ({ ...i, done: i.have >= i.need }));
  return { goal, items, done: items.every((i) => i.done) };
}

// ── 时间 ────────────────────────────────────────────────

/** 时间往前走 dt 游戏秒（已经乘过速度） */
export function tick(state: State, dt: number): Result {
  const s = clone(state);
  const events: SimEvent[] = [];
  buildStep(s, dt, events);

  const t0 = s.time;
  s.time = Math.min(1, s.time + dt / DAY_SECONDS);

  // 来客
  if (s.time > OPEN_FROM && t0 < OPEN_TO) {
    const per = visitorsPerDay(s);
    const span = (OPEN_TO - OPEN_FROM) * DAY_SECONDS;
    const used = Math.min(s.time, OPEN_TO) - Math.max(t0, OPEN_FROM);
    if (per > 0 && used > 0) s.arrivalAcc += (per * used * DAY_SECONDS) / span;
    while (s.arrivalAcc >= 1) {
      s.arrivalAcc -= 1 + (rand(s) - 0.5) * 0.6;
      spawnVisitor(s, events);
    }
  }

  // 客人
  for (const v of [...s.visitors]) {
    v.t -= dt;
    if (v.t > 0) continue;
    const p = byUid(s, v.stops[v.i]);
    if (v.stage === 'walk') {
      if (!p) {
        goOut(s, v, null, events);
        continue;
      }
      // 到了：花钱
      const { amount, base } = spendOf(s, p);
      s.money += amount;
      s.today.income += amount;
      s.today.comboBonus += amount - base;
      const st = (s.today.byUid[p.uid] ??= { income: 0, guests: 0 });
      st.income += amount;
      st.guests += 1;
      events.push({ type: 'visitorSpend', vid: v.vid, uid: p.uid, amount, bonus: amount - base });
      v.stage = 'stay';
      v.t = stayOf(BY_ID[p.id]) * (0.85 + rand(s) * 0.3);
    } else if (v.stage === 'stay') {
      // 再去一个地方？
      let next: Placed | null = null;
      if (v.stops.length === 1 && s.time < 0.9 && rand(s) < SECOND_STOP) {
        next = pickTarget(s, v.guest, v.stops);
      }
      if (next && p) {
        const r = route(s, p.uid, next.uid);
        if (r) {
          v.stops.push(next.uid);
          v.i++;
          v.stage = 'walk';
          v.t = Math.max(0.5, (r.length - 1) / WALK_TPS);
          events.push({ type: 'visitorGo', vid: v.vid, from: p.uid, to: next.uid });
          continue;
        }
      }
      goOut(s, v, p ?? null, events);
    } else {
      s.visitors = s.visitors.filter((x) => x !== v);
      events.push({ type: 'visitorLeave', vid: v.vid });
    }
  }

  // 收盘
  if (s.time >= 1) settle(s, events);
  return { state: s, events };
}

/** 只推建造进度（暂停时也能建：开罗式，停着时间照样能摆东西、看它建好） */
export function tickBuild(state: State, dt: number): Result {
  if (!state.placed.some((p) => p.build < 1)) return { state, events: [] };
  const s = clone(state);
  const events: SimEvent[] = [];
  buildStep(s, dt, events);
  return { state: s, events };
}

function buildStep(s: State, dt: number, events: SimEvent[]) {
  for (const p of s.placed) {
    if (p.build >= 1) continue;
    p.build = Math.min(1, p.build + dt / BUILD_SECONDS);
    if (p.build >= 1) {
      events.push({ type: 'built', uid: p.uid, id: p.id });
      for (const np of newPairs(s, p)) {
        s.pairs.push(np.key);
        const first = !s.combos.includes(np.combo.id);
        if (first) {
          s.combos.push(np.combo.id);
          log(
            s,
            `发现组合「${np.combo.name}」：${BY_ID[byUid(s, np.a)?.id ?? '']?.name ?? ''} 收入 ×${np.combo.spend}`,
          );
        }
        events.push({ type: 'comboFound', combo: np.combo.id, uids: [np.a, np.b], first });
      }
    }
  }
}

function goOut(s: State, v: Visitor, from: Placed | null, events: SimEvent[]) {
  const r = from ? route(s, from.uid, null) : null;
  v.stage = 'out';
  v.t = r ? Math.max(0.5, (r.length - 1 + ROAD_TILES) / WALK_TPS) : 3;
  events.push({ type: 'visitorGo', vid: v.vid, from: from?.uid ?? -1, to: null });
}

/** 给这位客人挑一个地方：吸引他、建好了、走得到、有空位；按吸引力加权 */
function pickTarget(s: State, guest: Guest, exclude: number[] = []): Placed | null {
  const reach = reachableSet(s);
  const cands = s.placed.filter((p) => {
    const def = BY_ID[p.id];
    return (
      p.build >= 1 &&
      def.cap > 0 &&
      def.guests.includes(guest) &&
      reach.has(p.uid) &&
      !exclude.includes(p.uid) &&
      occupantsOf(s, p.uid) < def.cap
    );
  });
  return pickWeighted(s, cands, (p) => appealOf(s, p, reach) + 1);
}

function spawnVisitor(s: State, events: SimEvent[]) {
  const reach = reachableSet(s);
  // 客群权重：各设施吸引的客群（不管有没有空位）
  const w: Record<Guest, number> = { member: 0, junior: 0, family: 0, fan: 0 };
  for (const p of s.placed) {
    const def = BY_ID[p.id];
    if (p.build < 1 || def.cap <= 0 || !reach.has(p.uid)) continue;
    const a = appealOf(s, p, reach) + 1;
    for (const g of def.guests) w[g] += a / def.guests.length;
  }
  const guest = pickWeighted(s, Object.keys(w) as Guest[], (g) => w[g]);
  if (!guest) return;
  const target = pickTarget(s, guest);
  if (!target) {
    s.today.turnedAway++;
    events.push({ type: 'turnedAway', guest });
    return;
  }
  const r = route(s, null, target.uid);
  if (!r) return;
  const v: Visitor = {
    vid: s.nextVid++,
    guest,
    stops: [target.uid],
    i: 0,
    stage: 'walk',
    t: Math.max(0.5, (r.length - 1 + ROAD_TILES) / WALK_TPS),
  };
  s.visitors.push(v);
  s.today.visitors++;
  s.totalVisitors++;
  events.push({ type: 'visitorArrive', vid: v.vid, guest, to: target.uid });
}

function settle(s: State, events: SimEvent[]) {
  for (const v of s.visitors) events.push({ type: 'visitorLeave', vid: v.vid });
  s.visitors = [];
  const built = s.placed.filter((p) => p.build >= 1);
  const upkeep = built.reduce((a, p) => a + BY_ID[p.id].upkeep, 0);
  s.money -= upkeep;
  const t = s.today;
  const reasons: string[] = [];
  // 赚得最多的
  const top = Object.entries(t.byUid)
    .map(([uid, st]) => ({ p: byUid(s, Number(uid)), ...st }))
    .filter((x) => x.p)
    .sort((a, b) => b.income - a.income);
  if (top[0]?.p) reasons.push(`${BY_ID[top[0].p.id].name}赚得最多：$${top[0].income}（${top[0].guests} 位）`);
  if (t.comboBonus > 0) reasons.push(`组合加成多赚了 $${t.comboBonus}`);
  if (t.turnedAway > 0) reasons.push(`${t.turnedAway} 位客人没位子，扭头走了 —— 多建几个能接客的地方`);
  const lost = unreachable(s);
  if (lost.length) {
    const names = [...new Set(lost.map((u) => BY_ID[byUid(s, u)?.id ?? '']?.name))].join('、');
    reasons.push(`${names}没有路通到大门，一分钱没赚`);
  }
  if (t.visitors === 0) reasons.push('今天没有客人：设施要连上步道，客人才进得来');
  reasons.push(`维护费 ${built.filter((p) => p.id !== 'path').length} 处设施共 $${upkeep}`);
  const net = t.income - upkeep;
  events.push({
    type: 'daySettled',
    day: s.day,
    income: t.income,
    upkeep,
    net,
    visitors: t.visitors,
    turnedAway: t.turnedAway,
    reasons,
  });
  log(s, `第 ${s.day} 天收盘：收入 $${t.income}，维护 $${upkeep}，客人 ${t.visitors} 位`);
  // 升星
  const sp = starProgress(s);
  if (sp?.done) {
    s.star = sp.goal.star;
    const unlocked = BUILDINGS.filter((b) => b.star === s.star).map((b) => b.id);
    events.push({ type: 'starUp', star: s.star, unlocked });
    log(s, `升到 ★${s.star}！解锁：${unlocked.map((id) => BY_ID[id].name).join('、')}`);
  }
  s.day++;
  s.time = 0;
  s.arrivalAcc = 0;
  s.today = emptyDay();
}

function log(s: State, text: string) {
  s.log.push({ day: s.day, text });
  if (s.log.length > LOG_MAX) s.log.splice(0, s.log.length - LOG_MAX);
}

function clone(s: State): State {
  return structuredClone(s);
}

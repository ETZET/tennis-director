// 红土拖场的规则（纯函数，不碰 three / DOM；rules.test.ts 测）：拖垫梳平一道、覆盖率、最大的一块没拖的、
// 白线扫出来多少、踩坏的脚印、分数和星级线、打完球的东半场怎么"弄脏"。
// 网格就是红土场面自己的状态网格（clubclay 的 ClayState：每格 0.18 米，dust < T_BRUSHED = 刚拖平）——
// 画面上看到的梳纹和算分的是同一份数据。坐标全是场地本地米（原点 = 远场中心，+x 东，+z 南；网在 x 0）。
import { type ClayState, NORMAL, T_BRUSHED } from '../../clubclay/assets/clay/state';

/** 一局几秒（两个阶段共用） */
export const DURATION = 120;
/** 星级线（bot 调的：见 main.ts 顶上的说明） */
export const STARS: [number, number, number] = [600, 900, 1150];

/** 拖垫：梳过的宽（横着）、垫子深（顺着） */
export const SWATH = 1.8;
export const MAT_LEN = 1.0;
/** 计分：每 1% 覆盖率几分、每条线几分、踩一脚扣几分、完工后每剩一秒几分 */
export const PTS_PER_PCT = 8;
export const LINE_PTS = 60;
export const STEP_PENALTY = 4;
export const TIME_BONUS = 8;
/** 覆盖率到这么多算拖完（完工条件之一）；一条线扫出这么多算扫完 */
export const DONE_COVER = 0.94;
export const LINE_DONE = 0.9;
/** 胶带采样多干净算"露出来了"（0 干净 … 1 盖满） */
export const TAPE_CLEAN = 0.5;
/** 离线中心这么近踩下去不算踩坏（走白线不扣分：扫线就得踩在线上） */
export const LINE_SAFE = 0.4;
/** 脚印踩坏的半径（米）、踩坏后的土况（起尘一档：和没拖的一个颜色） */
export const FOOT_R = 0.2;
export const FOOT_DUST = 0.8;

export interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/** 状态网格（ClayState 的这几样） */
export type Grid = Pick<ClayState, 'nx' | 'nz' | 'cx' | 'cz' | 'hw' | 'hd' | 'dust' | 'axis' | 'scuff'>;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** 本地矩形里的格子下标（算覆盖率的那一片） */
export function cellsIn(g: Grid, r: Rect): Int32Array {
  const out: number[] = [];
  for (let j = 0; j < g.nz; j++) {
    const z = -g.hd + (j + 0.5) * g.cz;
    if (z < r.z0 || z > r.z1) continue;
    for (let i = 0; i < g.nx; i++) {
      const x = -g.hw + (i + 0.5) * g.cx;
      if (x >= r.x0 && x <= r.x1) out.push(j * g.nx + i);
    }
  }
  return Int32Array.from(out);
}

/** 覆盖率：这些格子里刚拖平的占比 */
export function coverage(g: Grid, cells: Int32Array): number {
  let n = 0;
  for (let i = 0; i < cells.length; i++) if (g.dust[cells[i]] < T_BRUSHED) n++;
  return cells.length ? n / cells.length : 0;
}

/**
 * 拖垫压过一下：垫子中心 (x, z)，朝 (dx, dz) 走，宽 width、深 len。
 * 垫子下面：土况 → 0（刚拖平）、记下梳纹方向、擦痕清零。两边各一格还没拖的翻起一溜土（土况 1）——
 * 和 ClayState.drag 不同：已经拖平的格子不再翻土（相邻两道重叠一点就接得上，不留一条条土棱）。
 * 返回新拖平的格子数。
 */
export function comb(g: Grid, x: number, z: number, dx: number, dz: number, width = SWATH, len = MAT_LEN): number {
  const l = Math.hypot(dx, dz) || 1;
  const ux = dx / l;
  const uz = dz / l;
  const hw = width / 2;
  const cell = Math.max(g.cx, g.cz);
  const r = Math.hypot(hw + cell, len / 2) + cell;
  let ang = Math.atan2(uz, ux);
  if (ang < 0) ang += Math.PI;
  if (ang >= Math.PI) ang -= Math.PI;
  const outer = hw + cell;
  let fresh = 0;
  const i0 = Math.max(0, Math.floor((x - r + g.hw) / g.cx));
  const i1 = Math.min(g.nx - 1, Math.floor((x + r + g.hw) / g.cx));
  const j0 = Math.max(0, Math.floor((z - r + g.hd) / g.cz));
  const j1 = Math.min(g.nz - 1, Math.floor((z + r + g.hd) / g.cz));
  for (let j = j0; j <= j1; j++)
    for (let i = i0; i <= i1; i++) {
      const cx = -g.hw + (i + 0.5) * g.cx;
      const cz = -g.hd + (j + 0.5) * g.cz;
      const ax = (cx - x) * ux + (cz - z) * uz;
      if (Math.abs(ax) > len / 2) continue;
      const lat = Math.abs(-(cx - x) * uz + (cz - z) * ux);
      const k = j * g.nx + i;
      if (lat <= hw) {
        if (g.dust[k] >= T_BRUSHED) fresh++;
        g.dust[k] = 0;
        g.axis[k] = ang;
        g.scuff[k] = 0;
      } else if (lat <= outer && g.dust[k] >= T_BRUSHED) g.dust[k] = 1;
    }
  return fresh;
}

/** 一脚踩下去：半径 r 里刚拖平的格子踩回起尘。返回踩坏了几格 */
export function trample(g: Grid, x: number, z: number, r = FOOT_R, dust = FOOT_DUST): number {
  let n = 0;
  const i0 = Math.max(0, Math.floor((x - r + g.hw) / g.cx));
  const i1 = Math.min(g.nx - 1, Math.floor((x + r + g.hw) / g.cx));
  const j0 = Math.max(0, Math.floor((z - r + g.hd) / g.cz));
  const j1 = Math.min(g.nz - 1, Math.floor((z + r + g.hd) / g.cz));
  for (let j = j0; j <= j1; j++)
    for (let i = i0; i <= i1; i++) {
      const cx = -g.hw + (i + 0.5) * g.cx;
      const cz = -g.hd + (j + 0.5) * g.cz;
      if (Math.hypot(cx - x, cz - z) > r + Math.max(g.cx, g.cz) * 0.5) continue;
      const k = j * g.nx + i;
      if (g.dust[k] >= T_BRUSHED) continue;
      g.dust[k] = dust;
      g.scuff[k] = 0.7;
      n++;
    }
  return n;
}

/**
 * 最大的一块没拖的：把那一片切成 block 米的方块（一块里一半以上的格子没拖平 = 没拖），四邻连通，挑最大的一团。
 * 返回那一团里离它重心最近的方块中心（L 形的团重心可能落在外面）+ 方块数；没有 = null。
 */
export function largestPatch(
  g: Grid,
  r: Rect,
  block = 0.72,
  minBlocks = 2,
): { x: number; z: number; blocks: number; area: number } | null {
  const bx = Math.max(1, Math.round((r.x1 - r.x0) / block));
  const bz = Math.max(1, Math.round((r.z1 - r.z0) / block));
  const sx = (r.x1 - r.x0) / bx;
  const sz = (r.z1 - r.z0) / bz;
  const raw = new Uint8Array(bx * bz);
  const tot = new Uint16Array(bx * bz);
  const bad = new Uint16Array(bx * bz);
  for (let j = 0; j < g.nz; j++) {
    const z = -g.hd + (j + 0.5) * g.cz;
    if (z < r.z0 || z >= r.z1) continue;
    const b = Math.min(bz - 1, Math.floor((z - r.z0) / sz));
    for (let i = 0; i < g.nx; i++) {
      const x = -g.hw + (i + 0.5) * g.cx;
      if (x < r.x0 || x >= r.x1) continue;
      const a = Math.min(bx - 1, Math.floor((x - r.x0) / sx));
      tot[b * bx + a]++;
      if (g.dust[j * g.nx + i] >= T_BRUSHED) bad[b * bx + a]++;
    }
  }
  for (let k = 0; k < raw.length; k++) raw[k] = tot[k] > 0 && bad[k] * 2 > tot[k] ? 1 : 0;
  const seen = new Int32Array(bx * bz).fill(-1);
  let best: number[] = [];
  const stack: number[] = [];
  for (let k0 = 0; k0 < raw.length; k0++) {
    if (!raw[k0] || seen[k0] >= 0) continue;
    const comp: number[] = [];
    stack.push(k0);
    seen[k0] = k0;
    while (stack.length) {
      const k = stack.pop() as number;
      comp.push(k);
      const a = k % bx;
      const b = (k - a) / bx;
      const nb = [a > 0 ? k - 1 : -1, a < bx - 1 ? k + 1 : -1, b > 0 ? k - bx : -1, b < bz - 1 ? k + bx : -1];
      for (const n of nb)
        if (n >= 0 && raw[n] && seen[n] < 0) {
          seen[n] = k0;
          stack.push(n);
        }
    }
    if (comp.length > best.length) best = comp;
  }
  if (best.length < minBlocks) return null;
  const ctr = (k: number): [number, number] => {
    const a = k % bx;
    const b = (k - a) / bx;
    return [r.x0 + (a + 0.5) * sx, r.z0 + (b + 0.5) * sz];
  };
  let mx = 0;
  let mz = 0;
  for (const k of best) {
    const [x, z] = ctr(k);
    mx += x;
    mz += z;
  }
  mx /= best.length;
  mz /= best.length;
  let pick = best[0];
  let pd = Number.POSITIVE_INFINITY;
  for (const k of best) {
    const [x, z] = ctr(k);
    const d = Math.hypot(x - mx, z - mz);
    if (d < pd) {
      pd = d;
      pick = k;
    }
  }
  const [x, z] = ctr(pick);
  return { x, z, blocks: best.length, area: best.length * sx * sz };
}

// ── 白线 ──────────────────────────────────────────
/** 要扫的线：ClayState.lines 里的 id、中文名、沿线坐标从哪到哪（本地米；网下面那一截不算） */
export interface LineTask {
  id: string;
  name: string;
  /** ClayState.lines 的下标 */
  li: number;
  /** 胶带采样下标范围 [k0, k1] */
  k0: number;
  k1: number;
  /** 两端（本地米） */
  a: [number, number];
  b: [number, number];
}

export const LINE_NAMES: Record<string, string> = {
  baseE: '底线',
  svcE: '发球线',
  sideN: '北边线',
  sideS: '南边线',
  singleN: '北单打线',
  singleS: '南单打线',
  center: '中线',
};

/** 东半场的 7 条线（横线只要网东边 from 米以外的那一截） */
export function eastLines(s: Pick<ClayState, 'lines'>, tapeStep: number, from = 0.6): LineTask[] {
  const out: LineTask[] = [];
  s.lines.forEach((l, li) => {
    const name = LINE_NAMES[l.id];
    if (!name) return;
    const n = Math.ceil((l.a1 - l.a0) / tapeStep) + 1;
    let k0 = 0;
    const k1 = n - 1;
    if (l.kind === 'z') {
      // 横线（沿 x）：只要 x ≥ from
      k0 = Math.max(0, Math.ceil((from - l.a0) / tapeStep));
    }
    const at = (k: number) => Math.min(l.a1, l.a0 + k * tapeStep);
    const pt = (a: number): [number, number] => (l.kind === 'x' ? [l.c, a] : [a, l.c]);
    out.push({ id: l.id, name, li, k0, k1, a: pt(at(k0)), b: pt(at(k1)) });
  });
  return out;
}

/** 一条线扫出来多少（0..1） */
export function lineProgress(tape: Float32Array, t: Pick<LineTask, 'k0' | 'k1'>): number {
  let n = 0;
  for (let k = t.k0; k <= t.k1; k++) if (tape[k] < TAPE_CLEAN) n++;
  return n / (t.k1 - t.k0 + 1);
}

/** 点到线段的距离（本地米） */
export function distToSeg(x: number, z: number, a: [number, number], b: [number, number]): number {
  const ex = b[0] - a[0];
  const ez = b[1] - a[1];
  const t = clamp01(((x - a[0]) * ex + (z - a[1]) * ez) / (ex * ex + ez * ez || 1));
  return Math.hypot(x - a[0] - ex * t, z - a[1] - ez * t);
}

/** 离哪条线（全部 9 条，西半场的也算）最近有多远 */
export function nearLine(s: Pick<ClayState, 'lines'>, x: number, z: number): number {
  let best = Number.POSITIVE_INFINITY;
  for (const l of s.lines) {
    const a: [number, number] = l.kind === 'x' ? [l.c, l.a0] : [l.a0, l.c];
    const b: [number, number] = l.kind === 'x' ? [l.c, l.a1] : [l.a1, l.c];
    best = Math.min(best, distToSeg(x, z, a, b));
  }
  return best;
}

/** 还没扫完的线上，离 (x, z) 最近的一个盖着土的采样点（本地米）；全扫完 = null */
export function nearestDirty(
  s: Pick<ClayState, 'lines' | 'tape'>,
  tasks: LineTask[],
  tapeStep: number,
  x: number,
  z: number,
): { x: number; z: number; task: LineTask } | null {
  let best: { x: number; z: number; task: LineTask } | null = null;
  let bd = Number.POSITIVE_INFINITY;
  for (const t of tasks) {
    const tape = s.tape[t.li];
    if (lineProgress(tape, t) >= LINE_DONE) continue;
    const l = s.lines[t.li];
    for (let k = t.k0; k <= t.k1; k++) {
      if (tape[k] < TAPE_CLEAN) continue;
      const a = Math.min(l.a1, l.a0 + k * tapeStep);
      const px = l.kind === 'x' ? l.c : a;
      const pz = l.kind === 'x' ? a : l.c;
      const d = Math.hypot(px - x, pz - z);
      if (d < bd) {
        bd = d;
        best = { x: px, z: pz, task: t };
      }
    }
  }
  return best;
}

// ── 分数 ──────────────────────────────────────────
export interface Tally {
  /** 覆盖率 0..1 */
  cover: number;
  /** 扫完的线 */
  lines: number;
  totalLines: number;
  /** 没拖垫踩在刚拖平的土上的脚数 */
  steps: number;
  /** 完工时剩的秒数（没完工 = 0） */
  timeLeft: number;
}

/** 玩的时候顶栏上的分（覆盖率 + 线 − 脚印；时间奖励结算时才加） */
export function liveScore(t: Pick<Tally, 'cover' | 'lines' | 'steps'>): number {
  return Math.max(0, Math.floor(t.cover * 100) * PTS_PER_PCT + t.lines * LINE_PTS - t.steps * STEP_PENALTY);
}

/** 完工：拖完（≥ DONE_COVER）+ 线全扫完 */
export const isDone = (t: Pick<Tally, 'cover' | 'lines' | 'totalLines'>) =>
  t.cover >= DONE_COVER && t.lines >= t.totalLines;

/** 结算：明细（顶栏的分已经含覆盖率、线、脚印）+ 奖励（完工剩的秒数） */
export function settle(t: Tally): {
  lines: { label: string; value: string }[];
  bonus: { label: string; value: number }[];
} {
  const pct = Math.floor(t.cover * 100);
  const lines = [
    { label: `拖平 ${pct}% × ${PTS_PER_PCT}`, value: `${pct * PTS_PER_PCT}` },
    { label: `白线 ${t.lines}/${t.totalLines} × ${LINE_PTS}`, value: `${t.lines * LINE_PTS}` },
    { label: '踩坏的脚印', value: t.steps > 0 ? `${t.steps} 脚 −${t.steps * STEP_PENALTY}` : '0 ✓' },
  ];
  const bonus: { label: string; value: number }[] = [];
  const s = Math.floor(Math.max(0, t.timeLeft));
  if (isDone(t) && s > 0) bonus.push({ label: `提前完工 剩 ${s} 秒 × ${TIME_BONUS}`, value: s * TIME_BONUS });
  return { lines, bonus };
}

// ── 打完球的东半场 ────────────────────────────────────
/**
 * 把东半场（本地 x > edge）弄回"刚打完"：整片起尘、线上盖满土、脚印、滑步痕、球印、底线后磨得最狠。
 * 西半场照远场预设（拖完、扫完、浇过水）不动。rng 给 [0, 1)。dims = 场地尺寸（半长 L/2、半宽 DW/2）。
 */
export function scuffEast(s: ClayState, rng: () => number, dims: { L: number; DW: number; SW: number }, edge = 0.15) {
  const HL = dims.L / 2;
  const HW = dims.DW / 2;
  // 整片：起尘、擦痕、干
  for (let j = 0; j < s.nz; j++)
    for (let i = 0; i < s.nx; i++) {
      const [x] = s.center(i, j);
      if (x <= edge) continue;
      const k = j * s.nx + i;
      s.dust[k] = clamp01(0.8 + (rng() - 0.5) * 0.08);
      s.scuff[k] = 0.45 + rng() * 0.2;
      s.axis[k] = 0;
      s.wet[k] = 0;
    }
  // 线：东半场的采样盖满土
  s.forTape(edge, -s.hd, s.hw, s.hd, (li, k) => {
    s.tape[li][k] = 1;
  });
  // 记号：东半场的全清掉（预设里拖垫、总监的那串）
  s.marks = s.marks.filter((m) => m.x <= edge);
  // 底线后、发球区里磨得最狠（打球的人站的地方）：一团团起尘
  const spots: [number, number, number][] = [];
  for (let n = 0; n < 7; n++) spots.push([HL - 0.6 + rng() * 2.2, (rng() - 0.5) * dims.SW, 0.9 + rng() * 0.7]);
  for (let n = 0; n < 4; n++) spots.push([2 + rng() * 4.5, (rng() - 0.5) * dims.SW, 0.7 + rng() * 0.5]);
  for (const [x, z, r] of spots) s.wear(x, z, r, 0.25);
  // 脚印：底线后来回跑的、上网的、捡球的
  const trails: [number, number][][] = [];
  for (let n = 0; n < 3; n++) {
    const z0 = (rng() - 0.5) * dims.SW;
    trails.push([
      [HL + 0.6, z0],
      [HL - 1.5 - rng() * 2, z0 + (rng() - 0.5) * 3],
      [HL - 4 - rng() * 3, (rng() - 0.5) * dims.SW],
    ]);
  }
  trails.push([
    [1.6, -HW + 0.8 + rng() * 2],
    [4 + rng() * 2, (rng() - 0.5) * 4],
    [7 + rng() * 2, HW - 0.8 - rng() * 2],
  ]);
  for (const t of trails) s.trail(t, 0.72, 0.55 + rng() * 0.45);
  // 滑步痕（底线附近横着滑）、球印
  for (let n = 0; n < 4; n++) {
    const x = HL - 2.5 + rng() * 3;
    const z = (rng() - 0.5) * dims.SW;
    s.slide(x, z, (rng() - 0.5) * 0.4, rng() < 0.5 ? -1 : 1, 1.0 + rng() * 0.5);
  }
  for (let n = 0; n < 8; n++) {
    const a = (rng() - 0.5) * 0.8;
    s.ballMark(1.5 + rng() * (HL - 1.5), (rng() - 0.5) * dims.DW, Math.cos(a), Math.sin(a), 0.5 + rng() * 0.5);
  }
  s.dirtyGrid = s.dirtyTape = s.dirtyMarks = true;
}

/** 一脚的位置（左右交替：往两边各偏 0.09 米），给 ClayState.step 用之前算踩坏 */
export const footAt = (x: number, z: number, dx: number, dz: number, side: number): [number, number] => {
  const l = Math.hypot(dx, dz) || 1;
  return [x - (dz / l) * 0.09 * side, z + (dx / l) * 0.09 * side];
};

export { NORMAL, T_BRUSHED };

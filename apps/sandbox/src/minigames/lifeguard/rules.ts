// 泳池救生的规则（纯函数，不碰 three / DOM；rules.test.ts 测）：难度曲线、出事的节奏、救人的分、漂叶子、池边的站位、结算。

/** 一局几秒 */
export const DURATION = 120;
/** 机会（没救到一个 = −1） */
export const LIVES = 3;
/** 星级线（bot 跑整局调的：见 main.ts 顶上） */
export const STARS: [number, number, number] = [1500, 2800, 3800];

/** 开局多久出第一起事 */
export const FIRST_INCIDENT = 6;
/** 先只有乱扑腾的水花、举手（不出标记），这么久以后头顶才冒 "!"、出箭头和倒计时圈 */
export const TELL = 1.1;

/** 救起一个：底分 + 快的奖励（按剩下的那份时间） */
export const SAVE_BASE = 150;
export const SAVE_SPEED = 200;
/** 在 "!" 冒出来之前就救起：再 +50（盯得紧） */
export const SAVE_EARLY = 50;
/** 捞一片叶子 / 收一件（毛巾、杯子）/ 吹停一个乱跑的孩子 */
export const LEAF_PTS = 15;
export const LITTER_PTS = 25;
export const WHISTLE_PTS = 40;
/** 孩子滑倒（没吹哨、或者踩到地上的毛巾 / 洒的饮料） */
export const SLIP_PENALTY = 60;
/** 结算：剩下的每个 ♥ */
export const LIFE_BONUS = 100;
/** 结算：收尾干净（每剩一片叶子 −15、每件没收的 −30） */
export const CLEAN_BONUS = 150;

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/** 这一刻的难度（t = 这局玩了几秒） */
export interface Level {
  /** 池里几个人 */
  swimmers: number;
  /** 两起事之间隔多久（秒，基准；实际 ±20%） */
  gap: number;
  /** 同时最多几起 */
  maxActive: number;
  /** 从开始扑腾到撑不住（秒） */
  struggle: number;
  /** 多久飘来一片叶子 / 地上多一件东西 / 跑出来一个孩子 */
  leafEvery: number;
  litterEvery: number;
  kidEvery: number;
  /** 孩子跑多久没人管就滑倒（秒） */
  slipAfter: number;
}

export function level(t: number): Level {
  const k = clamp(t / DURATION, 0, 1);
  return {
    swimmers: Math.min(9, 4 + Math.floor(t / 20)),
    gap: lerp(13, 6, k),
    maxActive: t < 40 ? 1 : t < 80 ? 2 : 3,
    struggle: lerp(10, 6.5, k),
    leafEvery: lerp(4.5, 2.6, k),
    litterEvery: lerp(12, 7, k),
    kidEvery: lerp(17, 9, k),
    slipAfter: lerp(6.5, 4.5, k),
  };
}

/** 下一起事隔多久：基准 ±20%（r ∈ [0, 1)） */
export const nextGap = (t: number, r: number) => level(t).gap * (0.8 + 0.4 * r);

/**
 * 救起一个的分。since = 从开始扑腾到救起（秒），total = 这一起能撑多久。
 * 越快越多：150 底 + 200 × 剩下的那份，取整到 10；"!" 之前就救起再 +50。
 */
export function savePoints(since: number, total: number): number {
  const left = clamp(1 - since / total, 0, 1);
  const early = since < TELL ? SAVE_EARLY : 0;
  return Math.round((SAVE_BASE + SAVE_SPEED * left) / 10) * 10 + early;
}

/** 救起的评语（飘字） */
export function saveWord(since: number, total: number): string {
  if (since < TELL) return '神速！';
  const left = 1 - since / total;
  return left > 0.55 ? '漂亮！' : left > 0.25 ? '及时！' : '好险！';
}

export interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/** 点到矩形的平面距离（在里面 = 0） */
export function distToRect(x: number, z: number, r: Rect): number {
  const dx = Math.max(r.x0 - x, 0, x - r.x1);
  const dz = Math.max(r.z0 - z, 0, z - r.z1);
  return Math.hypot(dx, dz);
}

/** 池里一个点离最近的池边多远（在池外 = 0） */
export function edgeDist(x: number, z: number, r: Rect): number {
  return Math.max(0, Math.min(x - r.x0, r.x1 - x, z - r.z0, r.z1 - z));
}

/**
 * 池里一个点最近的池边、往外 off 米的站位（池畔上），和朝里的方向（单位向量，从池边指向池里）。
 * 池沿压顶 0.45 能走：off 0.6 = 站在压顶外沿，身子不碰水。
 */
export function edgePoint(
  x: number,
  z: number,
  r: Rect,
  off = 0.6,
): { at: [number, number]; inward: [number, number] } {
  const cx = clamp(x, r.x0, r.x1);
  const cz = clamp(z, r.z0, r.z1);
  const d = [cx - r.x0, r.x1 - cx, cz - r.z0, r.z1 - cz];
  const i = d.indexOf(Math.min(...d));
  if (i === 0) return { at: [r.x0 - off, cz], inward: [1, 0] };
  if (i === 1) return { at: [r.x1 + off, cz], inward: [-1, 0] };
  if (i === 2) return { at: [cx, r.z0 - off], inward: [0, 1] };
  return { at: [cx, r.z1 + off], inward: [0, -1] };
}

/** 站在池边多近算"在池边"（离池水的平面距离，米） */
export const RIM_NEAR = 1.4;
/** 救生圈扔得多远：离那个人 = 他离池边的距离 + 这么多 */
export const THROW_EXTRA = 1.9;
/** 总监在 (dx, dz)，人在 (sx, sz)：能不能扔救生圈救他 */
export function canReach(dx: number, dz: number, sx: number, sz: number, r: Rect): boolean {
  if (distToRect(dx, dz, r) > RIM_NEAR) return false;
  return Math.hypot(dx - sx, dz - sz) <= edgeDist(sx, sz, r) + THROW_EXTRA;
}

/** 风（米/秒）：方向慢慢转、大小慢慢变；phase 每局一个 */
export function windAt(t: number, phase: number): { x: number; z: number } {
  const a = phase + 1.7 * Math.sin(t * 0.05 + phase * 3) + 0.3 * Math.sin(t * 0.17);
  const m = 0.32 + 0.14 * Math.sin(t * 0.11 + phase);
  return { x: Math.cos(a) * m, z: Math.sin(a) * m };
}

export interface Drift {
  x: number;
  z: number;
  vx: number;
  vz: number;
}

/** 水面上漂的东西（叶子、浮床）跟着风走一步；碰到池壁弹回来（margin = 离池壁留多少） */
export function drift(l: Drift, wind: { x: number; z: number }, dt: number, r: Rect, margin = 0.25, follow = 0.6) {
  const k = 1 - Math.exp(-dt * follow);
  l.vx += (wind.x - l.vx) * k;
  l.vz += (wind.z - l.vz) * k;
  l.x += l.vx * dt;
  l.z += l.vz * dt;
  const x0 = r.x0 + margin;
  const x1 = r.x1 - margin;
  const z0 = r.z0 + margin;
  const z1 = r.z1 - margin;
  if (l.x < x0) {
    l.x = x0;
    l.vx = Math.abs(l.vx) * 0.4;
  } else if (l.x > x1) {
    l.x = x1;
    l.vx = -Math.abs(l.vx) * 0.4;
  }
  if (l.z < z0) {
    l.z = z0;
    l.vz = Math.abs(l.vz) * 0.4;
  } else if (l.z > z1) {
    l.z = z1;
    l.vz = -Math.abs(l.vz) * 0.4;
  }
}

/** 捞网：按住"捞"时，总监在池边，网能够到离他这么远的叶子（米，平面） */
export const NET_REACH = 2.6;

/**
 * 池边跑道（孩子乱跑的那一圈）：池子往外 off 米的矩形，从西北角顺时针，按弧长 s 取点。
 * 返回周长和取点函数（s 任意实数，绕圈）。
 */
export function rimLoop(r: Rect, off: number) {
  const x0 = r.x0 - off;
  const x1 = r.x1 + off;
  const z0 = r.z0 - off;
  const z1 = r.z1 + off;
  const W = x1 - x0;
  const D = z1 - z0;
  const len = 2 * (W + D);
  const at = (s0: number): { x: number; z: number; dx: number; dz: number } => {
    let s = ((s0 % len) + len) % len;
    if (s < W) return { x: x0 + s, z: z0, dx: 1, dz: 0 };
    s -= W;
    if (s < D) return { x: x1, z: z0 + s, dx: 0, dz: 1 };
    s -= D;
    if (s < W) return { x: x1 - s, z: z1, dx: -1, dz: 0 };
    s -= W;
    return { x: x0, z: z1 - s, dx: 0, dz: -1 };
  };
  /** 离 (x, z) 最近的那一点的弧长 */
  const nearest = (x: number, z: number): number => {
    let best = 0;
    let bd = Infinity;
    for (let s = 0; s < len; s += 0.25) {
      const p = at(s);
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  };
  return { len, at, nearest };
}

/** 一局的账 */
export interface Tally {
  saves: number;
  saveScore: number;
  missed: number;
  /** 最快的一次（秒，从开始扑腾算；没救过 = null） */
  fastest: number | null;
  leaves: number;
  litter: number;
  whistles: number;
  slips: number;
  lives: number;
  leavesLeft: number;
  litterLeft: number;
}

/** 收尾干净的奖励 */
export const cleanBonus = (leavesLeft: number, litterLeft: number) =>
  Math.max(0, CLEAN_BONUS - 15 * leavesLeft - 30 * litterLeft);

/** 结算：明细 + 奖励（救人、清洁、吹哨三块分开列） */
export function settle(t: Tally): {
  lines: { label: string; value: string }[];
  bonus: { label: string; value: number }[];
} {
  const lines = [
    { label: `救起 ${t.saves} 人`, value: `${t.saveScore}` },
    {
      label: `清洁：叶子 ${t.leaves} · 收拾 ${t.litter}`,
      value: `${t.leaves * LEAF_PTS + t.litter * LITTER_PTS}`,
    },
    { label: `吹哨 ${t.whistles} 次`, value: `${t.whistles * WHISTLE_PTS}` },
  ];
  if (t.slips > 0) lines.push({ label: `孩子滑倒 ${t.slips} 次`, value: `−${t.slips * SLIP_PENALTY}` });
  if (t.missed > 0) lines.push({ label: '没看住', value: `${t.missed} 人` });
  if (t.fastest !== null) lines.push({ label: '最快一次', value: `${t.fastest.toFixed(1)} 秒` });
  const bonus: { label: string; value: number }[] = [];
  if (t.lives > 0) bonus.push({ label: `剩 ${t.lives} ♥ × ${LIFE_BONUS}`, value: t.lives * LIFE_BONUS });
  const c = cleanBonus(t.leavesLeft, t.litterLeft);
  if (c > 0) bonus.push({ label: '收尾干净', value: c });
  return { lines, bonus };
}

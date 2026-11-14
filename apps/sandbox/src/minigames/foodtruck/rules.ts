// 餐车出餐的规则（纯函数，不碰 three / DOM；rules.test.ts 测）：四样吃的、出餐时间、小费、客人的耐心、来单的节奏、
// 窗口（灶台）的状态机、一次上菜的结果、结算。
//
// 一局 120 秒：桌上的客人冒出点单气泡（一样吃的）→ 总监去做这样东西的那个窗口"下单"，摊主做几秒（每样不一样）→ 拿到托盘上
// → 端到那桌"上菜"。耐心条绿 → 橙 → 红：绿/橙里送到 = 准时（小费 + 连击）；红了才送到 = 迟了（没小费）；等到 0 = 跑单（差评）；
// 送错 = 客人退回（这份白做、耐心再扣一截）。30 秒起托盘能一次端两份。窗口做好的放太久会凉（倒掉 = 浪费）。

/** 一局几秒 */
export const DURATION = 120;
/** 星级线（小费） */
export const STARS: [number, number, number] = [100, 200, 320];
/** 连击的时间窗（秒）：上一份准时送到之后这么久以内再准时送一份算连着 */
export const COMBO_WINDOW = 16;
/** 差评几个就收摊（提前结束） */
export const MAX_WALKOUTS = 5;
/** 托盘：开局一次端一份，这个时刻起一次端两份 */
export const TRAY2_AT = 30;
/** 窗口上做好的放多久会凉（秒） */
export const READY_KEEP = 25;
/** 耐心还剩这么多以下（红）才送到 = 迟了 */
export const LATE = 0.25;
/** 送错：客人退回，耐心再扣这么多（占整条的比例） */
export const WRONG_COST = 0.2;
/** 一桌刚吃上 / 刚走：这么久以内不再点单 */
export const TABLE_REST = 7;

export type ItemId = 'lemon' | 'smoothie' | 'wrap' | 'pizza';
export const ITEM_IDS: readonly ItemId[] = ['lemon', 'smoothie', 'wrap', 'pizza'];

export interface ItemDef {
  id: ItemId;
  /** 中文名（按钮、气泡） */
  name: string;
  /** 短名（按钮上 2 个字） */
  short: string;
  /** 哪个窗口做（clubfood 的车 / 小推车） */
  station: 'agua' | 'coffee' | 'taco' | 'pizza';
  /** 窗口里做几秒 */
  prep: number;
  /** 小费底数（准时送到 = 底数 + 底数 × 剩下的耐心） */
  tip: number;
  /** 这个时刻起才有人点 */
  from: number;
}

/** 四样：做得越久小费越高（先下单、再去送别的 = 提前备餐） */
export const ITEMS: Record<ItemId, ItemDef> = {
  lemon: { id: 'lemon', name: '冰柠檬水', short: '柠檬水', station: 'agua', prep: 1.5, tip: 6, from: 0 },
  wrap: { id: 'wrap', name: '卷饼', short: '卷饼', station: 'taco', prep: 3.5, tip: 11, from: 0 },
  smoothie: { id: 'smoothie', name: '冰沙', short: '冰沙', station: 'coffee', prep: 3, tip: 9, from: 18 },
  pizza: { id: 'pizza', name: '窑烤披萨', short: '披萨', station: 'pizza', prep: 5, tip: 15, from: 42 },
};

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const lerp = (a: number, b: number, k: number) => a + (b - a) * clamp(k, 0, 1);

/** 这个时刻有哪些能点 */
export const unlocked = (t: number): ItemId[] => ITEM_IDS.filter((id) => t >= ITEMS[id].from);

/** 托盘一次能端几份 */
export const trayCap = (t: number) => (t >= TRAY2_AT ? 2 : 1);

/** 下一单隔多久来（秒）：开局 5.5 秒一单 → 120 秒时 3.6 秒一单（同时等的单满了就不来） */
export const spawnGap = (t: number) => lerp(5.5, 3.6, t / DURATION);

/** 同时最多几单在等：开局 2 → 每 25 秒多一单，最多 5 */
export const maxOrders = (t: number) => Math.min(5, 2 + Math.floor(t / 25));

/** 客人能等多久（秒）：开局 42 秒 → 120 秒时 30 秒；做得久的东西客人也多等一点 */
export const patienceFor = (t: number, item: ItemId) => lerp(42, 30, t / DURATION) + ITEMS[item].prep * 1.5;

export type Tone = 'green' | 'orange' | 'red';
/** 耐心条的颜色（frac = 剩下的比例 1 → 0） */
export const toneOf = (frac: number): Tone => (frac > 0.55 ? 'green' : frac > LATE ? 'orange' : 'red');

/** 一单 */
export interface Order {
  id: number;
  /** 哪一桌（TABLES 的下标） */
  table: number;
  /** 哪个客人点的（SLOTS 的 id） */
  seat: string;
  item: ItemId;
  /** 下单的模拟时间、能等多久 */
  t0: number;
  patience: number;
  /** 送错扣掉的（秒） */
  lost: number;
}

/** 这一单的耐心还剩几成（1 → 0） */
export const fracOf = (o: Order, now: number) => clamp(1 - (now - o.t0 + o.lost) / o.patience, 0, 1);

/** 准时送到的小费：底数 + 底数 × 剩下的耐心 + 连击（第 2 个起每连一个 +2，最多 +10） */
export function tipFor(item: ItemId, frac: number, combo: number): number {
  const b = ITEMS[item].tip;
  return Math.round(b + b * clamp(frac, 0, 1)) + comboBonus(combo);
}
export const comboBonus = (combo: number) => 2 * Math.min(Math.max(combo - 1, 0), 5);

export type Outcome = 'ontime' | 'late' | 'wrong';
/** 上菜：手里这样东西送到这一单 → 结果 */
export function serve(o: Order, item: ItemId, now: number): Outcome {
  if (item !== o.item) return 'wrong';
  return fracOf(o, now) > LATE ? 'ontime' : 'late';
}

/** 送错：客人退回，耐心扣一截（返回新的 lost） */
export const wrongLost = (o: Order) => o.lost + o.patience * WRONG_COST;

/**
 * 来单：挑一桌、一样吃的。
 * free = 能点单的桌（没在等、过了休息时间）；spare = 手上 / 窗口上已经有、却没人点的东西（客人看见了也想要：权重 ×3）。
 * 刚解锁的新东西前 12 秒权重 ×2（让人注意到它）。rng 给 [0, 1)。没有空桌 = null。
 */
export function pickOrder(
  rng: () => number,
  t: number,
  free: readonly number[],
  spare: readonly ItemId[] = [],
): { table: number; item: ItemId } | null {
  if (!free.length) return null;
  const table = free[Math.floor(rng() * free.length)] as number;
  const ids = unlocked(t);
  const w = ids.map((id) => {
    let k = id === 'lemon' ? 1.1 : 1;
    if (spare.includes(id)) k *= 3;
    if (ITEMS[id].from > 0 && t - ITEMS[id].from < 12) k *= 2;
    return k;
  });
  let r = rng() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < ids.length; i++) {
    r -= w[i] as number;
    if (r <= 0) return { table, item: ids[i] as ItemId };
  }
  return { table, item: ids[ids.length - 1] as ItemId };
}

// ── 窗口（一个窗口一次做一份）──
export interface Station {
  item: ItemId;
  state: 'idle' | 'cook' | 'ready';
  /** cook：还要几秒；ready：已经放了几秒 */
  t: number;
}
export const newStation = (item: ItemId): Station => ({ item, state: 'idle', t: 0 });

/** 下单：空着才能开做 */
export function startCook(s: Station): boolean {
  if (s.state !== 'idle') return false;
  s.state = 'cook';
  s.t = ITEMS[s.item].prep;
  return true;
}

/** 一步：做好了 → 'done'；放凉了（倒掉）→ 'stale' */
export function stepStation(s: Station, dt: number): 'done' | 'stale' | null {
  if (s.state === 'cook') {
    s.t -= dt;
    if (s.t <= 0) {
      s.state = 'ready';
      s.t = 0;
      return 'done';
    }
  } else if (s.state === 'ready') {
    s.t += dt;
    if (s.t >= READY_KEEP) {
      s.state = 'idle';
      s.t = 0;
      return 'stale';
    }
  }
  return null;
}

/** 拿走做好的 */
export function takeReady(s: Station): boolean {
  if (s.state !== 'ready') return false;
  s.state = 'idle';
  s.t = 0;
  return true;
}

// ── 结算 ──
export interface Tally {
  ontime: number;
  late: number;
  wrong: number;
  walkouts: number;
  wasted: number;
  bestCombo: number;
  tips: number;
}

/** 零差评奖励（至少准时送了这么多份才算） */
export const CLEAN_BONUS = 40;
export const CLEAN_MIN = 10;

export function settle(t: Tally): {
  lines: { label: string; value: string }[];
  bonus: { label: string; value: number }[];
} {
  const lines = [
    { label: '准时上菜', value: `${t.ontime} 份` },
    { label: '最长连击', value: t.bestCombo >= 2 ? `×${t.bestCombo}` : '—' },
  ];
  if (t.late) lines.push({ label: '送晚了（没小费）', value: `${t.late}` });
  if (t.wrong) lines.push({ label: '送错被退', value: `${t.wrong}` });
  lines.push({ label: '等不及走了（差评）', value: `${t.walkouts}` });
  if (t.wasted) lines.push({ label: '放凉倒掉', value: `${t.wasted}` });
  const bonus: { label: string; value: number }[] = [];
  if (t.walkouts === 0 && t.ontime >= CLEAN_MIN) bonus.push({ label: '零差评', value: CLEAN_BONUS });
  return { lines, bonus };
}

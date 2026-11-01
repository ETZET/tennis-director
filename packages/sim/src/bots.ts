import { type Card, type ContentBundle, type Effect, minutes, type OptionKey } from '@td/content';
import { type OptionStatus, optionStatus } from './cards';
import { advance, type Command, type LoggedCommand, newGame } from './game';
import { canAssign, occupant, orderStatus, postDemand, postExists, skillOf, staffIds, working } from './staff';
import { DIRECTOR, type GameState, minuteOfDay, weekdayOf } from './state';
import { shortestRoute } from './walk';
import { type World, worldFor } from './world';

/**
 * 机器人：无头跑局用。每个机器人看当前状态，决定这一刻发什么命令。
 * 机器人自己的随机数和游戏的种子随机流分开，不影响模拟结果的确定性。
 */

export interface Bot {
  readonly name: string;
  decide(s: GameState, content: ContentBundle): Command[];
}

/** 机器人自己的小随机数（xorshift），不碰游戏状态 */
function botRand(seed: number) {
  let x = seed | 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}

/**
 * 随机型：每张卡随机挑一个选项，过一会儿才处理（有时干脆放着让它过期）；
 * 偶尔随手把一个人拖到随便一个岗位或工单上。
 */
export function randomBot(seed: number): Bot {
  const r = botRand(seed);
  const plan = new Map<number, { option: OptionKey | null; at: number }>();
  return {
    name: 'random',
    decide(s, content) {
      const w = worldFor(content, s.act, s.directorConfig);
      const cmds: Command[] = [];
      if (r() < 0.06) {
        const people = staffIds(s, w);
        const targets = [...w.posts.keys(), ...w.orders.keys()];
        const person = people[Math.floor(r() * people.length)];
        const target = targets[Math.floor(r() * targets.length)];
        if (person && target && canAssign(s, w, person, target) === null) cmds.push({ type: 'assign', person, target });
      }
      for (const o of s.cards.open) {
        let p = plan.get(o.uid);
        if (!p) {
          const keys = optionStatus(s, w, o.uid).map((x) => x.key);
          const ignore = r() < 0.15;
          p = { option: ignore ? null : (keys[Math.floor(r() * keys.length)] ?? null), at: s.t + Math.floor(r() * 90) };
          plan.set(o.uid, p);
        }
        if (!p.option || s.t < p.at) continue;
        const st = optionStatus(s, w, o.uid).find((x) => x.key === p.option);
        if (!st) continue;
        if (st.available) cmds.push({ type: 'chooseOption', uid: o.uid, option: p.option });
        else p.option = null;
      }
      return cmds;
    },
  };
}

/** 放置型（对照组）：什么都不做，卡全部过期走默认。检验准则 6：放着不管会慢慢变差，但不会一下崩掉。 */
export function idleBot(): Bot {
  return { name: 'idle', decide: () => [] };
}

/** "立刻能看到的好处"的权重 */
const WEIGHT: Record<string, number> = {
  quality: 3,
  members: 4,
  reputation: 2,
  cash: 0.01,
  board_support: 1,
  pickleball_pressure: -0.2,
};

/** 给一个选项按看得见的效果打分（成功率按期望算）；总监被叫走的时间按每小时 2 分扣 */
function scoreOption(w: World, c: Card, st: OptionStatus, expected: boolean): number {
  const opt = c.options[st.key];
  if (!opt) return Number.NEGATIVE_INFINITY;
  let score = -st.cost * (WEIGHT.cash ?? 0) - (st.errand ? (st.errand.minutes / 60) * 2 : 0);
  const p = st.chance ?? 1;
  const add = (effs: readonly Effect[], k: number) => {
    for (const e of effs) {
      const m = expected ? k * (typeof e.chance === 'number' ? e.chance : 1) : 1;
      if ('stat' in e && 'add' in e && typeof e.add === 'number') score += m * e.add * (WEIGHT[e.stat] ?? 0);
      if ('facility' in e) score += m * 12;
      if ('hire' in e) {
        const d = w.people.get(e.hire);
        // 多一个人手的价值，减去工资
        score += m * (8 + Math.max(d?.skill ?? 0, d?.upkeep ?? 0, d?.service ?? 0) / 8 - (d?.wage_week ?? 0) / 100);
      }
      if ('activity' in e) score += m * 6;
      if ('endAct' in e) score += m * (e.endAct === 'won' ? 100 : -100);
      if ('fire' in e) score -= m * 4;
    }
  };
  add(opt.effects, 1);
  if (st.chance !== null) {
    if (expected) {
      add(opt.onSuccess, p);
      add(opt.onFail, 1 - p);
    } else add(p >= 0.5 ? opt.onSuccess : opt.onFail, 1);
  }
  return score;
}

/** 最坏情况有多糟：谨慎型用（只看坏的一面，判定按失败算） */
function worstCase(c: Card, st: OptionStatus): number {
  const opt = c.options[st.key];
  if (!opt) return Number.NEGATIVE_INFINITY;
  let worst = -st.cost * (WEIGHT.cash ?? 0) - (st.errand ? 1 : 0);
  const effs = [...opt.effects, ...(st.chance === null ? [] : opt.onFail)];
  for (const e of effs) {
    if ('stat' in e && 'add' in e && typeof e.add === 'number') worst += Math.min(0, e.add * (WEIGHT[e.stat] ?? 0));
    if ('endAct' in e && e.endAct === 'lost') worst -= 100;
    if ('hire' in e) worst -= 1;
  }
  if (st.chance !== null) worst -= (1 - st.chance) * 4;
  return worst;
}

/** 一串效果"立刻能看到的好处"的期望分 */
function effectScore(effs: readonly Effect[], k = 1): number {
  let score = 0;
  for (const e of effs) {
    const m = k * (typeof e.chance === 'number' ? e.chance : 1);
    if ('stat' in e && 'add' in e && typeof e.add === 'number') score += m * e.add * (WEIGHT[e.stat] ?? 0);
    else if ('stat' in e && 'add' in e) score += m * 6 * (WEIGHT[e.stat] ?? 0);
    if ('facility' in e) score += m * 30;
    if ('activity' in e) score += m * 20;
    if ('flag' in e) score += m * 2;
    if ('person' in e) score += m * 2;
  }
  return score;
}

interface StaffStyle {
  /** 工单：留多少现金不动 */
  reserve: number;
  /** 不碰成功率低于这个的工单 */
  minChance: number;
  /** 有需求的岗位值多少分（每小时） */
  demandValue: number;
}

/**
 * 机器人怎么排人：每个人挑一个"值得去"的地方——
 * 有客人的岗位（马上开始的也算）、划算的工单、状况掉下来的维护岗位；总监爱站在上课的主教练旁边。
 * 正在转圈的岗位和开了工的工单不轻易拉走（拉走要丢一圈）。
 */
function staffCommands(s: GameState, w: World, st: StaffStyle): Command[] {
  const people = staffIds(s, w).filter((id) => !s.people[id]?.errand);
  const coach = s.headCoach ? s.people[s.headCoach] : undefined;
  const coachTeaching =
    !!coach && !!s.headCoach && working(s, w, s.headCoach) && !!coach.job && !!w.posts.get(coach.job)?.hours;
  const h = minuteOfDay(s.t) / 60;
  type Option = { target: string; at: string; skill: 'teach' | 'upkeep' | 'service'; value: number; crew: number };
  const options: Option[] = [];
  for (const p of w.posts.values()) {
    if (!postExists(s, w, p)) continue;
    let value = 0;
    if (p.hours) {
      // 今天有客人、而且现在是它的时段，或者 45 分钟内开始（先走过去）
      const today = !p.days || p.days.includes(weekdayOf(s.t));
      const soon = h >= p.hours[0] - 0.75 && h < p.hours[1] - 0.25;
      if (!today || !soon) continue;
      value = st.demandValue * (p.skill === 'teach' ? 1.4 : 1);
    } else if (p.restore) {
      const f = w.facilityAt.get(p.at);
      const c = f ? (s.condition[f] ?? 100) : 100;
      if (c > 85) continue;
      value = (100 - c) / 6;
    }
    options.push({ target: p.id, at: p.at, skill: p.skill, value, crew: 1 });
  }
  for (const o of w.orders.values()) {
    const os = orderStatus(s, w, o);
    if (!os.visible || os.blocked === 'cost') continue;
    if (!os.started && o.cost > 0 && (s.stats.cash ?? 0) - o.cost < st.reserve) continue;
    if (os.chance !== null && os.chance < st.minChance) continue;
    const p = os.chance ?? 1;
    let value = effectScore(o.effects) + effectScore(o.onSuccess, p) + effectScore(o.onFail, 1 - p) + o.restore / 4;
    value -= o.cost * (WEIGHT.cash ?? 0);
    // 按每小时折算：大工程也值得一点一点干
    value = value / Math.max(1, minutes(o.work) / 60) + (os.started ? 4 : 0);
    if (value < 1.5) continue;
    options.push({ target: o.id, at: o.at, skill: o.skill, value, crew: o.crew });
  }
  // 每个人对每个选项的分：价值 × 能力合适度 − 走路
  const pairs: { person: string; o: Option; score: number }[] = [];
  for (const id of people) {
    const pp = s.people[id];
    if (!pp) continue;
    const cur = pp.job;
    // 正在转圈的有需求岗位、开了工的工单：先别动
    if (cur && working(s, w, id)) {
      const post = w.posts.get(cur);
      if ((post && postDemand(s, w, post)) || s.orders[cur]) continue;
    }
    for (const o of options) {
      const fit = 0.4 + skillOf(pp, o.skill) / 80;
      const walk = shortestRoute(w, pp.walk?.to ?? pp.at, o.at)?.minutes ?? 60;
      let score = o.value * fit - walk / 30;
      if (id === DIRECTOR && coachTeaching && coach && o.at === coach.at) score += 6;
      if (o.target === cur) score += 2;
      pairs.push({ person: id, o, score });
    }
  }
  pairs.sort((a, b) => b.score - a.score || a.person.localeCompare(b.person) || a.o.target.localeCompare(b.o.target));
  const used = new Map<string, number>();
  const busy = new Set<string>();
  // 已经在干、不打算动的人占着自己的位子
  for (const id of staffIds(s, w)) {
    const job = s.people[id]?.job;
    if (job && !pairs.some((x) => x.person === id)) used.set(job, (used.get(job) ?? 0) + 1);
  }
  const cmds: Command[] = [];
  for (const x of pairs) {
    if (busy.has(x.person) || x.score <= 0) continue;
    const n = used.get(x.o.target) ?? 0;
    const taken = w.posts.has(x.o.target) ? occupant(s, x.o.target) : null;
    if (n >= x.o.crew) continue;
    if (taken && taken !== x.person && !pairs.some((p) => p.person === taken)) continue;
    busy.add(x.person);
    used.set(x.o.target, n + 1);
    if (s.people[x.person]?.job !== x.o.target && canAssign(s, w, x.person, x.o.target) === null)
      cmds.push({ type: 'assign', person: x.person, target: x.o.target });
  }
  return cmds;
}

function pickerBot(name: string, score: (w: World, c: Card, st: OptionStatus) => number, style: StaffStyle): Bot {
  return {
    name,
    decide(s, content) {
      const w = worldFor(content, s.act, s.directorConfig);
      const cmds: Command[] = [];
      for (const o of s.cards.open) {
        const c = w.cards.get(o.card);
        if (!c) continue;
        let best: { key: OptionKey; score: number } | null = null;
        for (const st of optionStatus(s, w, o.uid)) {
          if (!st.available) continue;
          const sc = score(w, c, st);
          if (!best || sc > best.score) best = { key: st.key, score: sc };
        }
        if (best) cmds.push({ type: 'chooseOption', uid: o.uid, option: best.key });
      }
      // 先处理卡（可能把总监叫走），下一眼再排人；排人每 15 分钟想一次
      if (cmds.length || minuteOfDay(s.t) % 15 !== 0) return cmds;
      return staffCommands(s, w, style);
    },
  };
}

/** 贪心型：卡按"立刻能看到的好处"选；排人时什么都愿意干，钱留得少。 */
export function greedyBot(): Bot {
  return pickerBot('greedy', (w, c, st) => scoreOption(w, c, st, false), {
    reserve: 300,
    minChance: 0.3,
    demandValue: 6,
  });
}

/** 谨慎型：卡选最坏情况最不坏的；不赌判定，钱留得多，不爱招人。 */
export function cautiousBot(): Bot {
  return pickerBot('cautious', (_w, c, st) => worstCase(c, st), {
    reserve: 1200,
    minChance: 0.7,
    demandValue: 6,
  });
}

export interface RunResult {
  bot: string;
  seed: number;
  outcome: GameState['outcome'];
  days: number;
  state: GameState;
  commands: LoggedCommand[];
}

/** 跑完一局（或跑到 maxDays）。机器人每 step 分钟看一眼。 */
export function runGame(
  content: ContentBundle,
  bot: Bot,
  seed: number,
  o: { act?: string; director?: string; maxDays?: number; step?: number } = {},
): RunResult {
  const s = newGame(content, {
    seed,
    ...(o.act ? { act: o.act } : {}),
    ...(o.director ? { director: o.director } : {}),
  });
  const limit = (o.maxDays ?? 60) * 1440;
  const stepMin = o.step ?? 5;
  const commands: LoggedCommand[] = [];
  while (!s.outcome && s.t < limit) {
    const r = advance(s, content, bot.decide(s, content), stepMin);
    commands.push(...r.accepted);
  }
  return { bot: bot.name, seed, outcome: s.outcome, days: Math.floor(s.t / 1440) + 1, state: s, commands };
}

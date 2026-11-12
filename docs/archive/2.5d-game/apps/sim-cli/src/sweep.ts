import type { ContentBundle } from '@td/sim';
import { advance, type Bot, type HumanProfile, humanBot, humanProfile, newGame } from '@td/sim';
import { type BotName, makeBot } from './report';

/**
 * 难度扫参（GM-7 / LG-9 实验）：在内容包的一份拷贝上改期限、起始资金、衰减、修复工时，跑一格机器人。
 * 不改 YAML；每一格是一份新的内容包（world 缓存按内容包对象分开）。
 */

export interface Variant {
  /** 期限（周）：期限卡在第 7×weeks 天 18 点，投资方在期限前 27 天 */
  weeks?: number;
  /** 投资方来看进度的那天（默认期限前 27 天） */
  investor?: number;
  /** 起始资金 */
  cash?: number;
  /** 设施衰减倍数（乘每个设施状态的 decay_day） */
  decay?: number;
  /** 修复工单工时倍数（只乘 once 的修复工单，不乘表演赛和清理） */
  work?: number;
  /** 修复工单材料费倍数（只乘 once 的修复工单，不乘表演赛） */
  costs?: number;
  /** 表演赛要的声望 */
  rep?: number;
}

export function variantContent(base: ContentBundle, v: Variant): ContentBundle {
  const c = structuredClone(base) as ContentBundle & { version: string };
  const act = c.acts[0];
  if (!act) return c;
  if (v.weeks) {
    const last = v.weeks * 7;
    for (const e of act.calendar) {
      if (e.card === 'iw_deadline') e.day = last;
      if (e.card === 'iw_investor_check') e.day = v.investor ?? last - 27;
    }
  }
  if (v.cash !== undefined) act.stats.cash = v.cash;
  if (v.decay !== undefined)
    for (const f of c.facilities) for (const st of Object.values(f.states)) if (st.decay_day) st.decay_day *= v.decay;
  if (v.work !== undefined)
    for (const o of c.orders ?? [])
      if (o.once && o.id !== 'st1_exhibition') {
        const m = /^(\d+(?:\.\d+)?)h$/.exec(String(o.work));
        if (m) o.work = `${Math.round(Number(m[1]) * v.work * 10) / 10}h` as typeof o.work;
      }
  if (v.costs !== undefined)
    for (const o of c.orders ?? []) if (o.once && o.id !== 'st1_exhibition') o.cost = Math.round(o.cost * v.costs);
  if (v.rep !== undefined) {
    const ex = (c.orders ?? []).find((o) => o.id === 'st1_exhibition');
    const all = ex?.when && 'all' in ex.when ? ex.when.all : [];
    for (const x of all) if ('stat' in x && x.stat === 'reputation') (x as { gte: number }).gte = v.rep;
  }
  c.version = `${c.version}+${JSON.stringify(v)}`;
  return c;
}

export interface GameRow {
  seed: number;
  ending: string;
  won: boolean;
  days: number;
  restored: number;
  reputation: number;
  cash: number;
  /** 第几天修好第 k 处（k = 1..8），没修到是 null */
  restoredDay: (number | null)[];
  exhibitions: number;
  hires: number;
  /** 修到"能用"那一级的设施数（外场 1 能打、Stadium 1 重建好……），0..8 */
  done: number;
  /** 里程碑的天数：会所开、Stadium 2 开、Stadium 1 清完、Stadium 1 重建好 */
  ms: Record<string, number | null>;
  /** 第 84、98、112、126 天收盘前修到能用的设施数（扫"宽限期"用） */
  doneAt: Record<string, number>;
}

/** 每个设施修到"能用"的状态 */
const DONE: Record<string, string[]> = {
  outer_1: ['playable', 'resurfaced'],
  outer_23: ['playable'],
  practice: ['open'],
  clubhouse: ['open'],
  plaza: ['open'],
  stadium_3: ['open'],
  stadium_2: ['open'],
  stadium_1: ['restored'],
};
const MILESTONES: [string, string, string][] = [
  ['clubhouse', 'clubhouse', 'open'],
  ['st3', 'stadium_3', 'open'],
  ['st2', 'stadium_2', 'open'],
  ['st1c', 'stadium_1', 'cleared'],
  ['st1', 'stadium_1', 'restored'],
];

/** bot 是机器人名；或者 human:<skill>[,checks=3,drags=2,...]（普通玩家，单项可以覆盖） */
export function botFor(spec: string, seed: number): Bot {
  if (!spec.startsWith('human:')) return makeBot(spec as BotName, seed);
  const [skill, ...kv] = spec.slice(6).split(',');
  const p: HumanProfile = humanProfile(Number(skill));
  for (const x of kv) {
    const [k, val] = x.split('=');
    if (k && k in p) (p as unknown as Record<string, number>)[k] = Number(val);
  }
  return humanBot(seed, p, spec);
}

export function runCell(base: ContentBundle, v: Variant, bot: string, games: number, seed0 = 1): GameRow[] {
  const content = variantContent(base, v);
  const weeks = v.weeks ?? 16;
  const rows: GameRow[] = [];
  for (let i = 0; i < games; i++) {
    const seed = seed0 + i;
    const b = botFor(bot, seed);
    const s = newGame(content, { seed });
    const limit = (weeks * 7 + 5) * 1440;
    const restoredDay: (number | null)[] = Array(8).fill(null);
    const ms: Record<string, number | null> = Object.fromEntries(MILESTONES.map(([k]) => [k, null]));
    const doneAt: Record<string, number> = {};
    const doneNow = () => Object.entries(DONE).filter(([f, sts]) => sts.includes(s.facilities[f] ?? '')).length;
    while (!s.outcome && s.t < limit) {
      advance(s, content, b.decide(s, content), 5);
      const d = Math.floor(s.t / 1440) + 1;
      const k = Math.round(s.stats.restoration ?? 0);
      for (let j = 0; j < k && j < 8; j++) if (restoredDay[j] === null) restoredDay[j] = d;
      for (const [key, f, st] of MILESTONES)
        if (ms[key] === null && (s.facilities[f] === st || (st === 'cleared' && s.facilities[f] === 'restored')))
          ms[key] = d;
      for (const snap of [84, 98, 112, 126])
        if (d === snap && s.t % 1440 >= 17 * 60 && !(snap in doneAt)) doneAt[snap] = doneNow();
    }
    rows.push({
      seed,
      ending: s.outcome?.ending ?? '(none)',
      won: s.outcome?.result === 'won',
      days: Math.floor(s.t / 1440) + 1,
      restored: Math.round(s.stats.restoration ?? 0),
      reputation: Math.round(s.stats.reputation ?? 0),
      cash: Math.round(s.stats.cash ?? 0),
      restoredDay,
      exhibitions: s.orderLog.done.st1_exhibition ?? 0,
      hires: Object.values(s.people).filter((p) => p.hired).length - 2,
      done: doneNow(),
      ms,
      doneAt,
    });
  }
  return rows;
}

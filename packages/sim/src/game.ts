import type { ContentBundle, OptionKey } from '@td/content';
import { fnv1a, stableStringify } from '@td/shared';
import { openCard, resolveCard } from './cards';
import { cancelGoing, startAction } from './director';
import { type Ctx, run, setStat } from './effects';
import type { SimEvent } from './events';
import { at, type GameState, SAVE_VERSION } from './state';
import { moveDirector, openDay, recomputeDerived, reschedulePlanToday, tick } from './systems';
import { type World, worldFor } from './world';

/**
 * 模拟的对外接口。
 *
 * 玩家的所有操作都是命令对象：先校验，再执行，执行结果追加到命令日志。
 * 初始种子加命令日志就能完整重放一局（replay）。
 */

export type Command =
  | { type: 'chooseOption'; uid: number; option: OptionKey }
  | { type: 'moveDirector'; to: string }
  /** 主动经营：做一个动作（点场景里的地点或人） */
  | { type: 'act'; action: string }
  /** 公告板：把一张便条钉到某个时段（null 表示拿掉） */
  | { type: 'setPlan'; part: string; weekday: number; activity: string | null }
  /** 公告板排好了 */
  | { type: 'lockPlan' }
  | { type: 'debugSetStat'; stat: string; value: number }
  | { type: 'debugSetFlag'; flag: string; value: boolean | number | string }
  | { type: 'debugForceCard'; card: string }
  | { type: 'debugSkip'; minutes: number };

export interface LoggedCommand {
  t: number;
  cmd: Command;
}

export interface NewGameOptions {
  act?: string;
  seed: number;
  /** 导演配置：稳健型、戏剧型、随机型 */
  director?: string;
}

export function newGame(content: ContentBundle, o: NewGameOptions): GameState {
  const actId = o.act ?? content.acts[0]?.id ?? '';
  const w = worldFor(content, actId, o.director);
  const a = w.act;
  const s: GameState = {
    version: SAVE_VERSION,
    contentVersion: content.version,
    seed: o.seed,
    act: a.id,
    directorConfig: w.director.id,
    t: at(a.start.day, a.start.hour),
    rng: o.seed | 0,
    stats: Object.fromEntries(content.stats.map((st) => [st.id, a.stats[st.id] ?? 0])),
    facilities: { ...a.facilities },
    people: {},
    headCoach: null,
    director: { at: a.director.at, leg: null, route: [], energy: 100, task: null },
    cards: { open: [], scheduled: [], cooldowns: {}, seen: {}, shown: {}, nextDraw: 0 },
    activities: [],
    actions: { cooldowns: {}, done: {} },
    plan: Object.fromEntries(
      Object.keys(a.schedule.parts).map((p) => [p, [...(a.schedule.start[p] ?? Array(7).fill(null))]]),
    ),
    planning: false,
    season: '',
    weather: 'sun',
    flags: {},
    log: [],
    legacy: [],
    outcome: null,
    nextUid: 1,
  };
  for (const p of content.people) {
    const placed = a.people.find((x) => x.id === p.id);
    s.people[p.id] = {
      id: p.id,
      hired: !!placed && p.role !== 'candidate' && p.role !== 'parent',
      at: placed?.at ?? a.director.at,
      skill: p.skill,
      morale: p.morale,
      fatigue: p.fatigue,
    };
    if (placed?.head_coach) s.headCoach = p.id;
  }
  const ctx: Ctx = { s, w, events: [] };
  s.cards.nextDraw = s.t + 60;
  run(ctx, { kind: 'start' }, null, [{ log: 'log.started' }]);
  for (const c of a.calendar) s.cards.scheduled.push({ card: c.card, at: at(c.day, c.hour), cause: null });
  for (const c of a.start_cards) s.cards.scheduled.push({ card: c, at: s.t, cause: null });
  openDay(ctx, a.start.day, 0);
  recomputeDerived(ctx);
  return s;
}

/** 季中改日程要花精力（总监得重新协调人和场地）；排日程的时候改是免费的 */
export const PLAN_CHANGE_ENERGY = 4;

function setPlan(ctx: Ctx, part: string, weekday: number, activity: string | null): boolean {
  const { s, w } = ctx;
  if (!(part in w.act.schedule.parts) || weekday < 0 || weekday > 6) return false;
  if (activity !== null && !w.activities.get(activity)?.program?.parts.includes(part)) return false;
  const row = s.plan[part] ?? (s.plan[part] = Array(7).fill(null));
  if (row[weekday] === activity) return false;
  if (!s.planning) {
    if (s.director.energy < PLAN_CHANGE_ENERGY) return false;
    s.director.energy -= PLAN_CHANGE_ENERGY;
  }
  row[weekday] = activity;
  if (!s.planning) reschedulePlanToday(ctx);
  return true;
}

function applyCommand(ctx: Ctx, cmd: Command): boolean {
  switch (cmd.type) {
    case 'chooseOption':
      return resolveCard(ctx, cmd.uid, cmd.option, 'player');
    case 'moveDirector':
      // 玩家点了别处：还在路上的事作废
      cancelGoing(ctx.s);
      return moveDirector(ctx, cmd.to);
    case 'act':
      return startAction(ctx, cmd.action, moveDirector);
    case 'setPlan':
      return setPlan(ctx, cmd.part, cmd.weekday, cmd.activity);
    case 'lockPlan':
      if (!ctx.s.planning) return false;
      ctx.s.planning = false;
      reschedulePlanToday(ctx);
      ctx.events.push({ type: 'planLocked', season: ctx.s.season });
      run(ctx, { kind: 'plan', season: ctx.s.season }, null, []);
      return true;
    case 'debugSetStat':
      setStat(ctx, cmd.stat, cmd.value);
      run(ctx, { kind: 'debug', what: `set ${cmd.stat} = ${cmd.value}` }, null, []);
      return true;
    case 'debugSetFlag':
      ctx.s.flags[cmd.flag] = cmd.value;
      run(ctx, { kind: 'debug', what: `set flag ${cmd.flag} = ${cmd.value}` }, null, []);
      return true;
    case 'debugForceCard':
      return openCard(ctx, cmd.card, null) !== null;
    case 'debugSkip':
      for (let i = 0; i < cmd.minutes && !ctx.s.outcome; i++) tick(ctx);
      return true;
  }
}

/**
 * 推进模拟（就地修改，速度快，机器人跑局和游戏主循环用这个）：
 * 先执行这一刻的命令，再走 ticks 分钟。返回领域事件和被接受的命令。
 */
export function advance(
  s: GameState,
  content: ContentBundle,
  commands: readonly Command[],
  ticks: number,
): { events: SimEvent[]; accepted: LoggedCommand[] } {
  const ctx: Ctx = { s, w: worldFor(content, s.act, s.directorConfig), events: [] };
  const accepted: LoggedCommand[] = [];
  for (const cmd of commands) {
    const t = s.t;
    if (applyCommand(ctx, cmd)) accepted.push({ t, cmd });
  }
  for (let i = 0; i < ticks && !s.outcome; i++) tick(ctx);
  return { events: ctx.events, accepted };
}

/** 纯函数版本：输入状态和命令，输出新状态和领域事件，不改动输入。 */
export function step(
  s: GameState,
  content: ContentBundle,
  commands: readonly Command[] = [],
  ticks = 1,
): { state: GameState; events: SimEvent[]; accepted: LoggedCommand[] } {
  const next = structuredClone(s);
  const r = advance(next, content, commands, ticks);
  return { state: next, ...r };
}

/** 用种子加命令日志重放到 untilT（不含）。 */
export function replay(
  content: ContentBundle,
  o: NewGameOptions,
  log: readonly LoggedCommand[],
  untilT: number,
): GameState {
  const s = newGame(content, o);
  let i = 0;
  const w = worldFor(content, s.act, s.directorConfig);
  const ctx: Ctx = { s, w, events: [] };
  while (s.t < untilT && !s.outcome) {
    while (i < log.length && (log[i] as LoggedCommand).t <= s.t) {
      applyCommand(ctx, (log[i] as LoggedCommand).cmd);
      i++;
    }
    tick(ctx);
    ctx.events.length = 0;
  }
  while (i < log.length && (log[i] as LoggedCommand).t <= s.t) applyCommand(ctx, (log[i++] as LoggedCommand).cmd);
  return s;
}

/** 状态哈希：同一种子加同一命令日志，跑完后必须一样（确定性测试）。 */
export const stateHash = (s: GameState): string => fnv1a(stableStringify(s));

export const worldOf = (s: GameState, content: ContentBundle): World => worldFor(content, s.act, s.directorConfig);

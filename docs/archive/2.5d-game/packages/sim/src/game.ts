import type { ContentBundle, OptionKey } from '@td/content';
import { fnv1a, stableStringify } from '@td/shared';
import { openCard, resolveCard } from './cards';
import { careFinish } from './care';
import { freshDay } from './day';
import { type Ctx, run, setStat } from './effects';
import { startSeason2 } from './ending';
import type { SimEvent } from './events';
import { addMess, initCare, messOf } from './mess';
import { assign } from './staff';
import { at, type CareResult, type GameState, type MessKind, SAVE_VERSION, type Weather } from './state';
import { openDay, recomputeDerived, tick } from './systems';
import { type World, worldFor } from './world';

/**
 * 模拟的对外接口。
 *
 * 玩家的所有操作都是命令对象：先校验，再执行，执行结果追加到命令日志。
 * 初始种子加命令日志就能完整重放一局（replay）。
 */

export type Command =
  | { type: 'chooseOption'; uid: number; option: OptionKey }
  /**
   * 把一个人（总监也算）拖到岗位或工单上；target 为 null 表示叫他停下来（ADR 0012）。
   * variant：拖到变体工单的哪一行（LG-14）；还没开工时改选变体，开了工只能是锁定的那个。
   */
  | { type: 'assign'; person: string; target: string | null; variant?: string }
  /** 结局（W4）：第一季结算以后开第二季（会所照旧，时钟回到第二季开局，目标占位） */
  | { type: 'startSeason2' }
  /**
   * 亲手扫做完：court 是 rules.care.courts 里的设施 id。小游戏期间游戏时间停着，
   * 回来时只发这一条（开始不发命令）；模拟按 result 清掉脏乱、把总监派去这块场离岗若干分钟（canCare 不通过就拒绝）
   */
  | { type: 'careFinish'; court: string; result: CareResult }
  /** 调试：把这块场的几项脏乱直接设成给的值（0..1）；不是球场什么都不做 */
  | { type: 'debugMess'; court: string; mess: Partial<Record<MessKind, number>> }
  /** 调试：把今天的天气换成 weather（酷热开关等；发 weather 事件，能重放） */
  | { type: 'debugWeather'; weather: Weather }
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
    posts: {},
    orders: {},
    orderLog: { cooldowns: {}, done: {} },
    condition: Object.fromEntries(content.facilities.map((f) => [f.id, a.condition[f.id] ?? 100])),
    variants: {},
    upgrades: {},
    remodels: {},
    picks: {},
    plaque: [],
    stars: 0,
    trophies: 0,
    routes: {},
    events: {},
    tournaments: {},
    unlocks: {},
    ending: { season: 1, exhibition: null, settlement: null, goal: null, land: {} },
    plots: {},
    decayMult: {},
    care: {},
    // 开局没有"上周"：服务率无从谈起，算 0，周结算的服务项不算（GM-1）
    week: {
      demand: 0,
      served: 0,
      last: 0,
      lastDemand: 0,
      missed: {},
      money: { dues: 0, income: 0, upkeep: 0, wages: 0 },
      traitRep: 0,
      q0: a.stats.quality ?? 0,
      walkouts: 0,
      unplayable: {},
    },
    // 每日结算：下面建好人以后按开局的状态重建今天的账
    today: {
      day: a.start.day,
      log0: 0,
      demand: 0,
      served: 0,
      missed: {},
      unplayable: {},
      walkouts: {},
      last: 0,
      lastDemand: 0,
      traitRep: 0,
      materials: {},
      cash0: 0,
      reputation0: 0,
      members0: 0,
      quality0: 0,
      morale0: {},
      work: {},
      idle: {},
    },
    memberCarry: 0,
    forecast: null,
    days: [],
    ledger: {},
    cards: { open: [], scheduled: [], cooldowns: {}, seen: {}, shown: {}, nextDraw: 0 },
    activities: [],
    season: '',
    weather: 'sun',
    flags: {},
    log: [],
    outcome: null,
    nextUid: 1,
  };
  const home = a.people.find((x) => content.people.find((p) => p.id === x.id)?.role === 'director')?.at ?? '';
  for (const p of content.people) {
    const placed = a.people.find((x) => x.id === p.id);
    s.people[p.id] = {
      id: p.id,
      hired: !!placed && p.role !== 'candidate' && p.role !== 'parent',
      at: placed?.at ?? home,
      skill: p.skill,
      upkeep: p.upkeep,
      service: p.service,
      play: p.play,
      morale: p.morale,
      fatigue: p.fatigue,
      job: placed?.job ?? null,
      walk: null,
      errand: null,
      // 开局就在岗位上的人（Dale 的青少年课）：这就是他的习惯
      routine: placed?.job && w.posts.has(placed.job) ? [placed.job] : [],
    };
    if (placed?.head_coach) s.headCoach = p.id;
  }
  s.today = freshDay(s, a.start.day);
  const ctx: Ctx = { s, w, events: [] };
  // 场地可用度：rules.care.courts 里的每处球场一条（全干净）；没写 rules.care 时什么都不加
  initCare(s, w);
  s.cards.nextDraw = s.t + 60;
  run(ctx, { kind: 'start' }, null, [{ log: 'log.started' }]);
  for (const c of a.calendar) s.cards.scheduled.push({ card: c.card, at: at(c.day, c.hour), cause: null });
  for (const c of a.start_cards) s.cards.scheduled.push({ card: c, at: s.t, cause: null });
  openDay(ctx, a.start.day, 0);
  recomputeDerived(ctx);
  s.termsWeek = structuredClone(s.terms ?? {});
  return s;
}

function applyCommand(ctx: Ctx, cmd: Command): boolean {
  switch (cmd.type) {
    case 'chooseOption':
      return resolveCard(ctx, cmd.uid, cmd.option, 'player');
    case 'assign':
      return assign(ctx, cmd.person, cmd.target, true, cmd.variant);
    case 'startSeason2':
      return startSeason2(ctx);
    case 'careFinish':
      return careFinish(ctx, cmd.court, cmd.result);
    case 'debugMess': {
      const m = messOf(ctx.s, cmd.court);
      const delta: Partial<Record<MessKind, number>> = {};
      for (const [k, v] of Object.entries(cmd.mess) as [MessKind, number][]) delta[k] = v - m[k];
      addMess(ctx.s, ctx.w, cmd.court, delta);
      run(ctx, { kind: 'debug', what: `mess ${cmd.court} ${JSON.stringify(cmd.mess)}` }, null, []);
      return true;
    }
    case 'debugWeather':
      ctx.s.weather = cmd.weather;
      ctx.events.push({ type: 'weather', weather: cmd.weather });
      run(ctx, { kind: 'debug', what: `weather ${cmd.weather}` }, null, []);
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

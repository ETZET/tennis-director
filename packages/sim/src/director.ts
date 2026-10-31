import { type Action, minutes } from '@td/content';
import { clamp } from '@td/shared';
import { type Ctx, logEntry, run, setStat } from './effects';
import { rand } from './rng';
import type { GameState } from './state';
import { num, test } from './vars';
import type { World } from './world';

/**
 * 总监的精力和"点了去做事"（经营循环 v2）。
 *
 * - 速度：精力满时走路和做事是 fast 倍速（跑着去），精力 0 时是 slow 倍速（慢慢挪）。
 * - 动作：不用到场的立刻生效；要到场的先走过去，到了以后在那儿忙 duration ÷ 速度，忙完才结算。
 *   钱和精力在开始忙的时候扣；还在路上时改主意（点了别的地方）就取消，不扣任何东西。
 */

export function speedFactor(s: GameState, w: World): number {
  const e = w.act.energy;
  return e.slow + ((e.fast - e.slow) * clamp(s.director.energy, 0, 100)) / 100;
}

export type ActionBlock = 'when' | 'cooldown' | 'cost' | 'energy' | 'busy' | 'once' | null;

export interface ActionStatus {
  id: string;
  available: boolean;
  blocked: ActionBlock;
  cost: number;
  energy: number;
  onsite: boolean;
  /** 在现场要忙多久（按现在的精力算） */
  minutes: number;
  /** 判定成功率（没有判定为 null） */
  chance: number | null;
}

function checkChance(s: GameState, w: World, a: Action): number | null {
  if (!a.check) return null;
  if ('stat' in a.check) return clamp(0.5 + ((s.stats[a.check.stat] ?? 0) - a.check.vs) / 50, 0.05, 0.95);
  const saved = s.rng;
  const v = clamp(num(s, w, a.check.chance), 0, 1);
  s.rng = saved;
  return v;
}

export function actionStatus(s: GameState, w: World, a: Action): ActionStatus {
  const working = s.director.task?.phase === 'working';
  const blocked: ActionBlock =
    a.when && !test(s, w, a.when)
      ? 'when'
      : a.once && (s.actions.done[a.id] ?? 0) > 0
        ? 'once'
        : (s.actions.cooldowns[a.id] ?? -1) > s.t
          ? 'cooldown'
          : a.cost > (s.stats.cash ?? 0)
            ? 'cost'
            : a.onsite && a.energy > s.director.energy
              ? 'energy'
              : a.onsite && working
                ? 'busy'
                : null;
  return {
    id: a.id,
    available: blocked === null,
    blocked,
    cost: a.cost,
    energy: a.onsite ? a.energy : 0,
    onsite: a.onsite,
    minutes: a.onsite ? Math.max(1, Math.round(minutes(a.duration) / speedFactor(s, w))) : 0,
    chance: checkChance(s, w, a),
  };
}

/** 某个地点现在能做的动作（when 不满足的不列出来；冷却中、钱不够的列出来但标明原因） */
export function actionsAt(s: GameState, w: World, anchor: string): ActionStatus[] {
  const out: ActionStatus[] = [];
  for (const a of w.actions.values()) {
    if (a.at !== anchor) continue;
    const st = actionStatus(s, w, a);
    if (st.blocked === 'when' || st.blocked === 'once') continue;
    out.push(st);
  }
  return out;
}

/** 命令：做一个动作。返回是否接受。要到场的会让总监出发（moveTo 由调用方传入，避免循环依赖）。 */
export function startAction(ctx: Ctx, id: string, moveTo: (ctx: Ctx, to: string) => boolean): boolean {
  const { s, w } = ctx;
  const a = w.actions.get(id);
  if (!a) return false;
  const st = actionStatus(s, w, a);
  if (!st.available) return false;
  if (!a.onsite) {
    finishAction(ctx, a, null);
    return true;
  }
  const cause = logEntry(ctx, { kind: 'action', action: a.id }, null, []).id;
  s.director.task = { action: a.id, at: a.at, phase: 'going', start: s.t, end: s.t, cause };
  if (s.director.at === a.at) beginWork(ctx);
  else if (!moveTo(ctx, a.at)) {
    s.director.task = null;
    return false;
  }
  return true;
}

function beginWork(ctx: Ctx): void {
  const { s, w } = ctx;
  const task = s.director.task;
  const a = task && w.actions.get(task.action);
  if (!task || !a) return;
  // 到了以后再看一次：钱和精力够不够（路上可能花掉了）
  const st = actionStatus(s, w, a);
  if (st.blocked && st.blocked !== 'busy') {
    s.director.task = null;
    return;
  }
  if (a.cost) setStat(ctx, 'cash', (s.stats.cash ?? 0) - a.cost);
  s.director.energy = clamp(s.director.energy - a.energy, 0, 100);
  task.phase = 'working';
  task.start = s.t;
  task.end = s.t + st.minutes;
  ctx.events.push({ type: 'actionStarted', action: a.id, at: a.at, performance: a.performance ?? null, end: task.end });
}

function finishAction(ctx: Ctx, a: Action, parent: number | null): void {
  const { s, w } = ctx;
  let success: boolean | undefined;
  if (a.check) success = rand(s) < (checkChance(s, w, a) ?? 1);
  const effects = [...a.effects, ...(success === undefined ? [] : success ? a.onSuccess : a.onFail)];
  if (!a.onsite && a.cost) effects.unshift({ stat: 'cash', add: -a.cost });
  run(ctx, { kind: 'action', action: a.id, ...(success === undefined ? {} : { success }) }, parent, effects);
  s.actions.done[a.id] = (s.actions.done[a.id] ?? 0) + 1;
  if (a.cooldown) s.actions.cooldowns[a.id] = s.t + minutes(a.cooldown);
  ctx.events.push({ type: 'actionFinished', action: a.id, ...(success === undefined ? {} : { success }) });
}

/** 每个 tick：到了就开始忙，忙完就结算 */
export function taskSystem(ctx: Ctx): void {
  const { s, w } = ctx;
  const task = s.director.task;
  if (!task) return;
  if (task.phase === 'going') {
    if (s.director.at === task.at && !s.director.leg) beginWork(ctx);
    return;
  }
  if (s.t >= task.end) {
    const a = w.actions.get(task.action);
    s.director.task = null;
    if (a) finishAction(ctx, a, task.cause);
  }
}

/** 玩家点了别处：还在路上的事取消；正在忙的事不能打断 */
export function cancelGoing(s: GameState): void {
  if (s.director.task?.phase === 'going') s.director.task = null;
}

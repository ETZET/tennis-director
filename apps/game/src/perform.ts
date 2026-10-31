import { activities, CourtFrame, hollowCreek, type PeopleWorld, type Person, type Scheduler } from '@td/render';
import { clamp } from '@td/shared';
import type * as THREE from 'three';

/**
 * 模拟的活动演出名（content 里的 performance）→ 活动动画库（ADR 0010）。
 *
 * 结果早已由模拟算好，这里只负责演：比赛不演胜负、拔河固定输（网球这边从来没赢过）。
 * 条件来自游戏给的一个小输入：天气、青少年的疲劳、主教练的球技；场地风格固定是 Hollow Creek。
 */

type Weather = activities.Weather;
type ParamValue = activities.ParamValue;

/** 演出在哪里：Hollow Creek 的场地坐标系 */
export type PerformArea = 'court_1' | 'court_2' | 'clay_court' | 'bubble_court' | 'terrace';

/** 借哪些现有人物：主教练、青少年 */
export type PerformCastUse = 'coach+juniors' | 'coach' | 'juniors' | 'none';

export interface PerformPlan {
  activity: activities.ActivityId;
  area: PerformArea;
  params: Readonly<Record<string, ParamValue>>;
  cast: PerformCastUse;
}

export const PERFORMANCE_PLANS: Readonly<Record<string, PerformPlan>> = {
  /** 青少年课：主教练在网前喂球，两个孩子轮流打 */
  lesson: { activity: 'feed', area: 'court_1', params: { players: 2 }, cast: 'coach+juniors' },
  /** 试训日 / 开放日：主教练喂球，来的人排队试打、评委举牌 */
  trial_day: { activity: 'tryout', area: 'court_1', params: { n: 6 }, cast: 'coach' },
  /** 社区对抗赛 vs 松冠：校内级别的场面，不演胜负（结果由模拟决定） */
  match: { activity: 'match', area: 'court_1', params: { tier: 1, fmt: 's', finale: 'none' }, cast: 'coach+juniors' },
  /** 社区劳动日：义工清理红土场 */
  workday: { activity: 'cleanup', area: 'clay_court', params: { crew: 'volunteers', n: 6 }, cast: 'juniors' },
  /** 外包施工：荧光背心的施工队 */
  contractor: { activity: 'cleanup', area: 'clay_court', params: { crew: 'pros', n: 4 }, cast: 'none' },
  /** 露台募捐晚会：露台旁边上层台地上的烧烤会，预算高 */
  fundraiser: { activity: 'bbq', area: 'terrace', params: { tier: 3 }, cast: 'juniors' },
  /** 和匹克球队拔河：网球这边从来没赢过 */
  tug_of_war: { activity: 'tug', area: 'court_2', params: { result: 'lose' }, cast: 'coach+juniors' },
  /** 日程上的开放场 / 红土场 / 气膜场：会员双打，不演胜负（在哪块场看活动的地点） */
  open_play: { activity: 'match', area: 'court_1', params: { tier: 1, fmt: 'd', finale: 'none' }, cast: 'none' },
  /** 开放日：带孩子的家庭在小场地上试打，主教练带 */
  open_day: { activity: 'openday', area: 'court_1', params: { n: 4 }, cast: 'coach' },
  /** 2 号场的匹克球（租场卡的舞台） */
  pickleball: { activity: 'pickleball', area: 'court_2', params: { players: 4 }, cast: 'none' },
};

/**
 * 演出名 → 计划。给了地点（活动的 anchor）而且是一块场地，就在那块场地上演：
 * 同一个"开放场"排在红土场就演在红土场。
 */
export function planPerformance(performance: string, anchor?: string): PerformPlan | null {
  const plan = PERFORMANCE_PLANS[performance];
  if (!plan) return null;
  const courts: readonly PerformArea[] = ['court_1', 'court_2', 'clay_court', 'bubble_court'];
  const at = courts.find((c) => c === anchor);
  return at && plan.area !== 'terrace' ? { ...plan, area: at } : plan;
}

export interface PerformInput {
  weather: Weather;
  /** 青少年的平均疲劳 0..100 */
  fatigue: number;
  /** 主教练球技 0..100（没有主教练时给 0） */
  coachSkill: number;
}

/** 游戏输入 → 动画库的全局条件（场地风格固定是 Hollow Creek） */
export function conditionsFrom(input: PerformInput): activities.Conditions {
  return {
    fatigue: clamp(input.fatigue / 100, 0, 1),
    weather: input.weather,
    // Dale 40 → 2 星，Jess 52 → 3，Walt 68 → 4，Nadia 86 → 5
    coach: clamp(Math.round(input.coachSkill / 18), 1, 5),
    venue: 'hollow',
  };
}

/** 上层台地：露台东边、步道北边的一块空地（20×13 米） */
const TERRACE = new CourtFrame(-13, hollowCreek.UP - 0.07, -29, 0, 10, 6.5);

const AREAS: Record<PerformArea, CourtFrame> = {
  court_1: hollowCreek.FA,
  court_2: hollowCreek.FB,
  clay_court: hollowCreek.FD,
  bubble_court: hollowCreek.FC,
  terrace: TERRACE,
};

export function areaFrame(a: PerformArea): CourtFrame {
  return AREAS[a];
}

export interface PerformerEnv {
  scene: THREE.Object3D;
  sched: Scheduler;
  world: PeopleWorld;
  lang: activities.Lang;
}

export interface Performance {
  stop(): void;
}

/**
 * 开演一个模拟的活动。不认识的演出名什么也不演（返回空的 stop）。
 * coach / juniors 是游戏里现成的人物，按演出需要借用，演完还回去。
 */
export function perform(
  env: PerformerEnv,
  performance: string,
  input: PerformInput,
  cast: { coach: Person | null; juniors: readonly Person[] },
  seed = 1,
  anchor?: string,
): Performance {
  const plan = planPerformance(performance, anchor);
  if (!plan) return { stop() {} };
  const use = plan.cast;
  const run = activities.startActivity(
    {
      scene: env.scene,
      sched: env.sched,
      world: env.world,
      groundY: hollowCreek.groundY,
      lang: env.lang,
      // 游戏的相机比动画库远得多，漫画字放大一些
      spriteScale: 2.4,
    },
    plan.activity,
    {
      area: AREAS[plan.area],
      conditions: conditionsFrom(input),
      params: plan.params,
      seed,
      cast: {
        coach: use === 'coach' || use === 'coach+juniors' ? cast.coach : null,
        players: use === 'juniors' || use === 'coach+juniors' ? cast.juniors : [],
      },
    },
  );
  return { stop: () => run.stop() };
}

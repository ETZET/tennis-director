import {
  activities,
  type CourtFrame,
  type Node,
  type PeopleWorld,
  type Person,
  type Scheduler,
  type Site,
} from '@td/iso';
import { clamp } from '@td/shared';

/**
 * 模拟的活动演出名（content 里的 performance）→ 活动动画库（ADR 0010）。
 *
 * 结果早已由模拟算好，这里只负责演：比赛不演胜负、拔河固定输。
 * 条件来自游戏给的一个小输入：天气、疲劳、主教练的球技；场地风格由地图决定。
 * 演在哪儿：演出发生的地点（岗位、工单、活动的 anchor）上的第一块球场；不是球场的演出（烧烤会）演在地点的空地上。
 */

type Weather = activities.Weather;
type ParamValue = activities.ParamValue;

/** 演出在哪儿：地点上的球场，或者地点上的空地 */
export type PerformArea = 'court' | 'ground';

/** 借哪些现有人物：主教练、球员 */
export type PerformCastUse = 'coach+juniors' | 'coach' | 'juniors' | 'none';

export interface PerformPlan {
  activity: activities.ActivityId;
  area: PerformArea;
  params: Readonly<Record<string, ParamValue>>;
  cast: PerformCastUse;
}

export const PERFORMANCE_PLANS: Readonly<Record<string, PerformPlan>> = {
  /** 上课：主教练在网前喂球，两个学生轮流打 */
  lesson: { activity: 'feed', area: 'court', params: { players: 2 }, cast: 'coach+juniors' },
  /** 试训日：主教练喂球，来的人排队试打、评委举牌 */
  trial_day: { activity: 'tryout', area: 'court', params: { n: 6 }, cast: 'coach' },
  /** 比赛（联赛、赛事日、表演赛）：不演胜负（结果由模拟决定） */
  match: { activity: 'match', area: 'court', params: { tier: 1, fmt: 's', finale: 'none' }, cast: 'none' },
  /** 动手修：一群人清理场地 */
  workday: { activity: 'cleanup', area: 'court', params: { crew: 'volunteers', n: 6 }, cast: 'none' },
  /** 外包施工：荧光背心的施工队 */
  contractor: { activity: 'cleanup', area: 'court', params: { crew: 'pros', n: 4 }, cast: 'none' },
  /** 烧烤会：广场上的空地 */
  fundraiser: { activity: 'bbq', area: 'ground', params: { tier: 3 }, cast: 'none' },
  /** 拔河 */
  tug_of_war: { activity: 'tug', area: 'court', params: { result: 'lose' }, cast: 'coach+juniors' },
  /** 开放场：会员双打，不演胜负 */
  open_play: { activity: 'match', area: 'court', params: { tier: 1, fmt: 'd', finale: 'none' }, cast: 'none' },
  /** 开放日：带孩子的家庭在小场地上试打，主教练带 */
  open_day: { activity: 'openday', area: 'court', params: { n: 4 }, cast: 'coach' },
  /** 匹克球 */
  pickleball: { activity: 'pickleball', area: 'court', params: { players: 4 }, cast: 'none' },
};

/** 演出名 → 计划；地点上没有合适的场地（例如会所里的岗位）时返回 null，由人站在那儿比划。 */
export function planPerformance(performance: string, anchor: string | undefined, site: Site): PerformPlan | null {
  const plan = PERFORMANCE_PLANS[performance];
  if (!plan || !anchor) return null;
  return areaFrame(site, plan.area, anchor) ? plan : null;
}

/** 演出的区域：地点上的第一块球场，或地点上的空地 */
export function areaFrame(site: Site, area: PerformArea, anchor: string): CourtFrame | null {
  return (area === 'court' ? site.courts[anchor]?.[0] : site.grounds[anchor]) ?? null;
}

export interface PerformInput {
  weather: Weather;
  /** 球员的平均疲劳 0..100 */
  fatigue: number;
  /** 主教练球技 0..100（没有主教练时给 0） */
  coachSkill: number;
}

/** 游戏输入 → 动画库的全局条件 */
export function conditionsFrom(input: PerformInput, venue: activities.Venue): activities.Conditions {
  return {
    fatigue: clamp(input.fatigue / 100, 0, 1),
    weather: input.weather,
    // Dale 45 → 3 星，Jess 58 → 3，Walt 70 → 4，Nadia 86 → 5
    coach: clamp(Math.round(input.coachSkill / 18), 1, 5),
    venue,
  };
}

export interface PerformerEnv {
  scene: Node;
  sched: Scheduler;
  world: PeopleWorld;
  lang: activities.Lang;
  site: Site;
}

export interface Performance {
  stop(): void;
}

/**
 * 开演一个模拟的活动。不认识的演出名、地点上没有场地，什么也不演（返回空的 stop）。
 * coach / juniors 是游戏里现成的人物，按演出需要借用，演完还回去。
 */
export function perform(
  env: PerformerEnv,
  performance: string,
  input: PerformInput,
  cast: { coach: Person | null; juniors: readonly Person[] },
  seed: number,
  anchor: string,
): Performance {
  const plan = planPerformance(performance, anchor, env.site);
  const area = plan && areaFrame(env.site, plan.area, anchor);
  if (!plan || !area) return { stop() {} };
  const use = plan.cast;
  const run = activities.startActivity(
    {
      scene: env.scene,
      sched: env.sched,
      world: env.world,
      groundY: env.site.groundY,
      lang: env.lang,
      // 游戏的相机比动画库远得多，漫画字放大一些
      spriteScale: 2.4,
    },
    plan.activity,
    {
      area,
      conditions: conditionsFrom(input, env.site.venue),
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

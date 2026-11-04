import {
  activities,
  type CourtFrame,
  type Node,
  type PeopleWorld,
  type Person,
  type Scheduler,
  type Site,
} from '@td/iso';
import { clamp, type XZ } from '@td/shared';

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
  // 地块上的新地点（W5）：没有球场的（绿洲草坪、赛事广场）施工、接待的演出落在那块空地上
  const land = !!site.land?.anchors[anchor];
  return (
    (area === 'court'
      ? (site.courts[anchor]?.[0] ?? (land ? site.grounds[anchor] : undefined))
      : site.grounds[anchor]) ?? null
  );
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
  /** graceful：收场（人走开、东西慢慢收走）；false 立刻清掉（热重载、读档重建时） */
  stop(graceful?: boolean): void;
  /** 演出途中改变量（到场人数 crewN、工单进度 progress） */
  setParams(p: Readonly<Record<string, ParamValue>>): void;
}

/** 演出生成的人从哪儿走进来：给一个落脚点，返回从场外沿步道走到它的折线（null = 原地出现） */
export interface PerformEntry {
  from(p: XZ): XZ[] | null;
}

/**
 * 地点的入场路线：从园区入口沿步道走到这个地点的站位，只取最后一小段（最多 tail 米），再走到落脚点。
 * 纯函数（node 里能测）。
 */
export function entryFor(site: Site, anchor: string, tail = 24): PerformEntry {
  const line = site.routeLine(anchor === 'entrance' ? 'parking' : 'entrance', anchor);
  return {
    from(p) {
      if (!line || line.length < 2) return null;
      // 从站位往回数，走满 tail 米为止
      const out: XZ[] = [line[line.length - 1] as XZ];
      let left = tail;
      for (let i = line.length - 2; i >= 0 && left > 0; i--) {
        const a = line[i] as XZ;
        const b = out[0] as XZ;
        const d = Math.hypot(a.x - b.x, a.z - b.z);
        if (d <= left) {
          out.unshift(a);
          left -= d;
        } else {
          const f = left / d;
          out.unshift({ x: b.x + (a.x - b.x) * f, z: b.z + (a.z - b.z) * f });
          left = 0;
        }
      }
      out.push({ x: p.x, z: p.z });
      return out;
    },
  };
}

/** 借来的人（cast）：主教练、球员；crew 是岗位或工单上已经到场的员工，按演出需要顶替生成的人 */
export interface PerformCast {
  coach: Person | null;
  juniors: readonly Person[];
}

export interface PerformExtra {
  /** 演出生成的人从哪儿走进来 */
  entry?: PerformEntry;
  /** 额外变量（到场人数 crewN、工单进度 progress） */
  params?: Readonly<Record<string, ParamValue>>;
}

/**
 * 开演一个模拟的活动。不认识的演出名、地点上没有场地，什么也不演（返回空的 stop）。
 * coach / juniors 是游戏里现成的人物，按演出需要借用，演完在原地还回去（之后由画面自己走回岗位）。
 */
export function perform(
  env: PerformerEnv,
  performance: string,
  input: PerformInput,
  cast: PerformCast,
  seed: number,
  anchor: string,
  extra: PerformExtra = {},
): Performance {
  const plan = planPerformance(performance, anchor, env.site);
  const area = plan && areaFrame(env.site, plan.area, anchor);
  if (!plan || !area) return { stop() {}, setParams() {} };
  const use = plan.cast;
  const opts: activities.StartOptions = {
    area,
    conditions: conditionsFrom(input, env.site.venue),
    // 计划里的变量优先（crew 是清场的施工队种类，不被人数覆盖）
    params: { ...extra.params, ...plan.params },
    seed,
    cast: {
      coach: use === 'coach' || use === 'coach+juniors' ? cast.coach : null,
      players: use === 'juniors' || use === 'coach+juniors' ? cast.juniors : castPlayers(plan) ? cast.juniors : [],
    },
    ...(extra.entry ? { entry: extra.entry } : {}),
  };
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
    opts,
  );
  return {
    stop: (graceful = false) => (graceful ? run.stop({ graceful: true }) : run.stop()),
    setParams: (p) => run.setParams({ ...p, ...plan.params }),
  };
}

/** 不借教练的演出里，哪些可以让到场的员工顶替生成的人（清场：员工就是干活的人） */
const castPlayers = (plan: PerformPlan): boolean => plan.activity === 'cleanup';

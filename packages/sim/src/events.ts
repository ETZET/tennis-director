import type { OptionKey, SkillKind } from '@td/content';
import type { CareLevel, CausalEntry, DayReport, OutcomeResult, PlaqueRow, Settlement, Weather } from './state';

/**
 * 领域事件：模拟每一步发出来，画面和界面订阅它们来演出、提示。
 * 它们只是通知；真正的数据都在 GameState 里。
 */
export type SimEvent =
  | { type: 'cardOpened'; uid: number; card: string; pause: boolean }
  | {
      type: 'cardResolved';
      uid: number;
      card: string;
      option: OptionKey | null;
      by: 'player' | 'default';
      success?: boolean;
    }
  | { type: 'requestPause'; reason: string }
  | { type: 'activityStarted'; uid: number; activity: string; anchor: string; performance: string; end: number }
  | { type: 'activityFinished'; uid: number; activity: string }
  | { type: 'personDeparted'; person: string; from: string; to: string; route: string[]; arrive: number }
  | { type: 'personArrived'; person: string; at: string }
  | { type: 'assigned'; person: string; target: string | null }
  /** 按习惯自己走去一个岗位（ADR 0014） */
  | { type: 'routine'; person: string; target: string }
  | { type: 'postCycle'; post: string; person: string }
  /** 总监的一项能力跨过了一个整十（核心玩法决定：总监没有情绪，能力随干活慢慢涨） */
  | { type: 'directorGrew'; skill: SkillKind; value: number }
  /**
   * 员工成长（W3，LG-12）：一项能力跨过了门槛（step 的整数倍、或者某条解锁的 gte）；value 是门槛本身。
   * 只在 growth.enabled 时发；总监照旧也发 directorGrew
   */
  | { type: 'skill_up'; person: string; skill: SkillKind; value: number }
  /** 成长解锁开出来了（W3）：key 是 growth.unlocks 的键，person 是开出它的人 */
  | { type: 'unlock'; person: string; key: string }
  /** 主教练换人：招来一名教练接任（hired），或者主教练走了由还在的教练接上 / 空着（left）。person 为 null = 空缺 */
  | { type: 'head_coach'; person: string | null; from: string | null; reason: 'hired' | 'left' }
  | { type: 'postInterrupted'; post: string; person: string; lost: number }
  | { type: 'orderStarted'; order: string; at: string; performance: string | null }
  | { type: 'orderFinished'; order: string; people: string[]; success?: boolean }
  | { type: 'orderCancelled'; order: string }
  /** 设施掉了一档（周日收盘，状况低于 grade_drop_below）：画面换层、快讯、岗位停开 */
  | { type: 'facilityWorn'; facility: string; from: string; to: string; condition: number }
  /** 修复变体锁定：第一个人到场、扣了材料费（LG-14） */
  | { type: 'variant_locked'; facility: string; variant: string; order: string }
  /** 升级装上了（LG-14） */
  | { type: 'upgrade_done'; facility: string; upgrade: string; order: string }
  /** 改造：工单做完、设施停用到 until；期满换成新变体 */
  | { type: 'remodel_started'; facility: string; variant: string; until: number }
  | { type: 'remodel_done'; facility: string; variant: string }
  /** 大门牌匾多了一行（修好一处设施） */
  | ({ type: 'plaque_added' } & PlaqueRow)
  /** 升星（LG-10）：画面转到大门，快讯列出开了什么 */
  | { type: 'star_up'; stars: number; opens: string[] }
  /** 赛事（LG-11）：主办赛事接下了（报名工单做完）；比赛日开赛（画面布置、临时岗位开出来）；下雨办不成；结算 */
  | { type: 'tournament_entered'; tournament: string; at: string; start: number; end: number }
  | { type: 'tournament_live'; tournament: string; at: string; posts: string[] }
  | { type: 'tournament_spoiled'; tournament: string; at: string; reason: 'rain' }
  | {
      type: 'tournament_done';
      tournament: string;
      at: string;
      goals: { id: string; met: boolean }[];
      /** 第几次参加（0 = 第一次）、奖励打几折 */
      repeat: number;
      scale: number;
    }
  /**
   * 赛事的附加目标因为临时岗位没人守而没达成（W2 试玩：两天的邀请赛第二天没人，目标悄悄失败）。
   * staffed 是这一期临时岗位的到岗率 0..1；posts 是空过的岗位和空了多少分钟（从多到少）。快讯用它讲"为什么没拿到"。
   */
  | {
      type: 'tournament_goal_missed';
      tournament: string;
      at: string;
      goal: string;
      staffed: number;
      posts: { post: string; minutes: number }[];
    }
  /** 选路（W2）：这一处选了哪条路（倒计时到了按默认的也发） */
  | { type: 'route_chosen'; slot: string; route: string }
  /** 地块（W5）：开工（清理工单冒出来；画面 land(plot, 'building', variant, 0)）、开地（画面 land(plot, 'open', variant)，镜头飞过去） */
  | { type: 'plot_building'; plot: string; variant: string; anchor: string; orders: string[] }
  | { type: 'plot_open'; plot: string; variant: string; anchor: string }
  /** 分期筹备（W2）：一期做完了，这一组做完了几期 */
  | { type: 'prep_done'; group: string; order: string; done: number; total: number }
  /**
   * 岗位没了，坐在上面的人放下来闲着（W2）：设施掉档（closed）、改造停用（remodel）、赛事的临时岗位收了或者
   * 比赛日占了场（event）。界面用它讲"为什么闲着"。
   */
  | { type: 'released'; person: string; post: string; facility: string | null; reason: 'closed' | 'remodel' | 'event' }
  /** 人-13（W2）：工单做完（或作废），回到派去之前的岗位 */
  | { type: 'returned'; person: string; post: string; order: string }
  | { type: 'errandStarted'; person: string; at: string; minutes: number }
  | { type: 'errandFinished'; person: string }
  | { type: 'log'; entry: CausalEntry }
  | { type: 'dayEnded'; day: number }
  /**
   * 每日结算（daily-settlement-contract.md，ADR 0024）：收盘结算完、明天的天气抽好以后发（closeDay 的最后一件事）。
   * 模拟从不等它：游戏收到就停自己的钟、弹结算卡，玩家点完再走（不是命令，不进命令日志，重放与它无关）
   */
  | { type: 'daySettled'; report: DayReport }
  | { type: 'actEnded'; result: OutcomeResult; ending: string }
  /** 结局（W4）：表演赛提前办成了（结局卡随后打开，如果内容写了）；结算打分（分项和评语，也存在 s.ending.settlement）；开了第二季 */
  | { type: 'ending_offered'; day: number; card: string | null }
  | ({ type: 'settlement' } & Settlement)
  | { type: 'season_two'; goal: string; land: Record<string, string[]> }
  | { type: 'seasonStarted'; season: string }
  | { type: 'weather'; weather: Weather }
  /**
   * 场地可用度（court-care-contract.md）。careLevel：一块场换了档（能打 / 勉强 / 不能打；usability 取整，只给测试和调试面板，
   * 界面不显示数）。careDone：亲手扫做完（总监离岗 minutes 分钟，含走过去）。
   */
  | { type: 'careLevel'; court: string; from: CareLevel; to: CareLevel; usability: number }
  | { type: 'careDone'; court: string; before: number; after: number; minutes: number }
  /** 不能打：门口开始有会员等、或者等的人数变了（n 是此刻的人数）；场地又能打了（或者收盘）就 waitingEnded */
  | { type: 'membersWaiting'; court: string; n: number }
  | { type: 'waitingEnded'; court: string; waited: number; reason: 'playable' | 'closed' }
  /** 等不及的会员走了一个（因果日志 walkout 一条、快讯一条） */
  | { type: 'memberWalkedOut'; court: string; waited: number }
  /** 勉强能打、有人在打：有人抱怨一句（只是画面和快讯，没有数） */
  | { type: 'careGrumble'; court: string }
  | {
      type: 'weekSettled';
      serviceRate: number;
      /** 拆成几项的派生量：周末的值和每项这一周的变化 */
      terms: Record<string, { total: number; delta: Record<string, number> }>;
    };

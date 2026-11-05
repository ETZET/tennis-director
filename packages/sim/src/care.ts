import { MESS_KINDS, type MessKind } from '@td/content';
import type { Ctx } from './effects';
import type { CareResult, GameState } from './state';
import type { World } from './world';

/**
 * 场地可用度（docs/design/court-care-contract.md，ADR 0022）：球场上的短期脏乱（积沙、积水、球和垃圾、线褪色、裂缝），
 * 和设施状况 condition（长期磨损、衰减、周日掉档）分开。天气和使用让它变脏，打扫岗位、打扫工单、总监亲手扫让它变干净。
 * 可用度不给玩家看数，只给三档（能打 / 勉强 / 不能打）。
 *
 * 这里是系统和命令（careSystem、careCloseDay、careFinish、canCare、careMinutes）；叶子工具在 mess.ts，
 * 读"场地开没开"的查询（careActive、usabilityOf、careLevelOf、careWorst、careWaiting、careBlocksPost）在 vars.ts。
 * care.ts 可以引用 staff、walk、effects、vars、mess；它们都不能反过来引用 care.ts（depcruise 不许循环）。
 *
 * Wave 0 只冻结了接口：这一页的函数还是桩（代理 A 按契约实现）。
 */

/**
 * 能不能亲手扫这块场（界面在打开小游戏之前问；careFinish 用同一条规则校验）：
 * court 不是球场；inactive 场地没开（废墟、停用、改造）；busy 总监在办事（errand）；rain 正在下雨（扫了也白扫）；
 * clean 没什么可扫（Σ mess < 0.03）；over 这一局结束了。
 */
export type CareBlock = 'court' | 'inactive' | 'busy' | 'rain' | 'clean' | 'over' | null;

export function canCare(_s: GameState, _w: World, _f: string): CareBlock {
  // Wave 0 桩：代理 A 按契约实现
  return 'court';
}

/** 亲手扫要总监离岗多久（游戏分钟）：work 在场上干的、walk 走过去的、total = work + walk */
export interface CareMinutes {
  work: number;
  walk: number;
  total: number;
}

/** 按小游戏的结果算总监离岗的分钟（契约"总监的工时"；careFinish 用同一个函数） */
export function careMinutes(_s: GameState, _w: World, _f: string, _r: CareResult): CareMinutes {
  // Wave 0 桩：代理 A 按契约实现
  return { work: 0, walk: 0, total: 0 };
}

/** 全扫干净要多久（地点清单上"亲手扫"按钮的代价提示）= careMinutes(每项都清掉 1) */
export function careEstimate(s: GameState, w: World, f: string): CareMinutes {
  const all = Object.fromEntries(MESS_KINDS.map((k) => [k, 1])) as Record<MessKind, number>;
  return careMinutes(s, w, f, { cleared: all });
}

/** 每分钟（systems.ts，staffSystem 之后）：天气和使用加脏乱、换档、门口等人、走人、抱怨 */
export function careSystem(_ctx: Ctx): void {
  // Wave 0 桩：代理 A 按契约实现
}

/** 收盘（closeDay，衰减之前）：门口等的人回家（waitingEnded closed，不算走掉），今天走掉的计数清零 */
export function careCloseDay(_ctx: Ctx): void {
  // Wave 0 桩：代理 A 按契约实现
}

/** 命令 careFinish：校验、清掉脏乱、把总监派去离岗、写一条 care 因果日志、发 careDone */
export function careFinish(_ctx: Ctx, _f: string, _r: CareResult): boolean {
  // Wave 0 桩：代理 A 按契约实现
  return false;
}

/**
 * 模拟核心：纯函数式的状态机。输入状态和玩家命令，输出新状态和一串领域事件。
 *
 * 规则：这个包不依赖 three.js、Preact 或任何浏览器 API。
 * 同一套模拟能在浏览器里跑，也能在 apps/sim-cli 里无头跑一千局。
 */

export type { Activity, Card, ContentBundle, Effect, OptionKey, Order, Post, SkillKind } from '@td/content';
export { CONTENT, minutes } from '@td/content';
export * from './bots';
export {
  directorPressure,
  eligibleCards,
  isOnce,
  type OptionBlock,
  type OptionStatus,
  optionStatus,
} from './cards';
export type { SimEvent } from './events';
export * from './game';
export * from './save';
export {
  type AssignBlock,
  canAssign,
  crewOf,
  eligible,
  meetsWorker,
  type OrderBlock,
  type OrderStatus,
  occupant,
  orderCost,
  orderFacility,
  orderLead,
  orderStatus,
  orderVariant,
  orderVariants,
  orderWork,
  type PostStatus,
  postDemand,
  postExists,
  postStatus,
  ROUTINE_MAX,
  remodelMinutes,
  routineTarget,
  skillOf,
  speedOf,
  staffIds,
  working,
  workSkill,
} from './staff';
export { type StarItem, type StarStatus, starStatus } from './stars';
export * from './state';
export { seasonOn } from './systems';
export {
  coachAttention,
  coachPresent,
  conditionFactor,
  facilityTotals,
  hasDemand,
  hiredWith,
  isStaff,
  num,
  qualityTarget,
  remodeling,
  servicePass,
  serviceRate,
  stateDef,
  test as testCond,
  wagesWeek,
} from './vars';
export { shortestRoute, walkEta } from './walk';
export { type World, worldFor } from './world';

export const SIM_VERSION = 2;

/**
 * 模拟核心：纯函数式的状态机。输入状态和玩家命令，输出新状态和一串领域事件。
 *
 * 规则：这个包不依赖 three.js、Preact 或任何浏览器 API。
 * 同一套模拟能在浏览器里跑，也能在 apps/sim-cli 里无头跑一千局。
 */

export type { Card, ContentBundle, OptionKey } from '@td/content';
export { CONTENT } from '@td/content';
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
export * from './state';
export { shortestRoute } from './systems';
export { coachAttention, facilityTotals, wagesWeek } from './vars';
export { type World, worldFor } from './world';

export const SIM_VERSION = 1;

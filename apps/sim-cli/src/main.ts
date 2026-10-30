import { SIM_VERSION } from '@td/sim';

/**
 * 无头跑局（M3）：机器人策略各跑上千局，统计通关率、平均时长、从未出现的卡、卡死的状态。
 * 规则：这里只能依赖 @td/sim 和 @td/shared，不能碰 three.js 或 DOM。
 */
export function main(): void {
  console.log(`sim-cli: simulation core v${SIM_VERSION}; bot runs arrive in M3.`);
}

main();

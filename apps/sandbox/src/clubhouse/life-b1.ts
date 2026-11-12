// 负一层（健身房 + 后场）的演出 + 总监的活 —— stage 3 的桩：B1 的 agent 在这里填（可以另加 play-b1.ts）。
// 摆好的人（slots-b1.ts）的健身姿势已经在循环（gymPerson loop），这里暂时什么都不加。
// 接口见 stage3.ts（FloorEnv / FloorModule）和 walker.ts；规矩见 docs/lab/2026-11-07-3d-pixel/clubhouse.md「stage 3 的框架」。
import type { FloorEnv, FloorModule } from './stage3';

export function createFloorLife(_env: FloorEnv): FloorModule {
  return {
    update() {},
    debug: {},
  };
}

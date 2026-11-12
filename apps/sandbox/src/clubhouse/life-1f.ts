// 一层（商店层）的演出 + 总监的活 —— stage 3 的桩：1F 的 agent 在这里填（可以另加 play-1f.ts）。
// 现在只有一个逛街的人沿 routes.ts 的 shopper 路线走一圈又一圈，证明框架（Walker、houseViews、让路）是通的。
// 接口见 stage3.ts（FloorEnv / FloorModule）和 walker.ts；规矩见 docs/lab/2026-11-07-3d-pixel/clubhouse.md「stage 3 的框架」。
import { ROUTES } from './routes';
import type { FloorEnv, FloorModule } from './stage3';

export function createFloorLife(env: FloorEnv): FloorModule {
  const route = ROUTES.find((r) => r.id === 'shopper')?.pts ?? [];
  const rnd = env.rng('1f-shopper');
  const obj = env.add(env.make('player', 2), { mode: null });
  obj.userData.setProp?.(null);
  const shopper = env.walker(obj);
  if (route.length) {
    shopper.place(route[0], -Math.PI / 2);
    shopper.run(function* (w) {
      while (true) {
        yield* w.go(route);
        yield* w.wait(2 + rnd() * 3);
      }
    });
  }
  return {
    update() {},
    debug: { shopper },
  };
}

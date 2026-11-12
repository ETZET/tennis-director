// 二层（会员层 + 后厨）的演出 + 总监的活 —— stage 3 的桩：2F 的 agent 在这里填（可以另加 play-2f.ts）。
// 现在只有一个互动点：钟楼二层的钟绳，按住 2 秒 → 提示。证明"互动点只在这一层生效"是通的（三层的 x、z 叠着）。
// 接口见 stage3.ts（FloorEnv / FloorModule）和 walker.ts；规矩见 docs/lab/2026-11-07-3d-pixel/clubhouse.md「stage 3 的框架」。
import * as THREE from 'three';
import { FLOOR_Y } from './layout';
import { SPOTS } from './routes';
import type { FloorEnv, FloorModule } from './stage3';

const RING_HOLD = 2;

export function createFloorLife(env: FloorEnv): FloorModule {
  const rope = env.slot('2f-bell-rope');
  const at = new THREE.Vector3(rope?.position.x ?? -48.6, FLOOR_Y[2] + 1.1, rope?.position.z ?? -16.6);
  const state = { rings: 0, held: 0 };
  return {
    update() {},
    attach(play) {
      play.add({
        id: 'bell',
        at: () => at,
        radius: 1.1,
        stand: () => [SPOTS.bellRope.at[0], SPOTS.bellRope.at[1]],
        label: '拉钟',
        onHold(dt, p) {
          state.held += dt;
          if (state.held < RING_HOLD) return;
          state.held = 0;
          state.rings++;
          p.toast('当——当——');
          return false;
        },
        onRelease() {
          state.held = 0;
        },
      });
      return null;
    },
    debug: { state },
  };
}

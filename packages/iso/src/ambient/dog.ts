import { mulberry32, range } from '@td/shared';
import { DOG, DOG_COATS } from '../art/creatures/dog';
import type { Node } from '../core/graph';
import { Critter } from './critter';

export interface Dog {
  readonly g: Node;
  update(dt: number, now: number): void;
}

/** 由巡游点推出一个种子：同一张地图、同一条路线的狗每次长得一样、走得一样。 */
function seedOf(waypoints: readonly (readonly [number, number])[]): number {
  let h = 0x9e3779b1;
  for (const [x, z] of waypoints) {
    h = Math.imul(h ^ Math.round(x * 16), 0x85ebca6b);
    h = Math.imul(h ^ Math.round(z * 16), 0xc2b2ae35);
    h ^= h >>> 13;
  }
  return h >>> 0;
}

/**
 * 一只沿固定巡游点闲逛的流浪狗：到点后停下嗅地面、摇尾巴，偶尔坐一会儿；
 * 下一个点远的时候小跑过去。演出里的随机只决定画面。
 */
export function createDog(
  scene: Node,
  groundY: (x: number, z: number) => number,
  waypoints: readonly (readonly [number, number])[],
  /** 毛色（main 槽位）；不给就按种子从 DOG_COATS 里挑一个 */
  coat?: string,
  /** 随机种子（毛色和闲逛节奏）；不给就由巡游点推出来，结果是确定的 */
  seed: number = seedOf(waypoints),
): Dog {
  const rand = mulberry32(seed);
  const rr = (a: number, b: number) => range(rand, a, b);
  coat ??= DOG_COATS[Math.floor(rand() * DOG_COATS.length)] ?? '#8a6440';
  const g = new Critter(DOG.idle, { main: coat });
  g.name = 'dog';
  scene.add(g);
  const first = waypoints[0] ?? [0, 0];
  let i = 0;
  const pos = { x: first[0], z: first[1] };
  let wait = 0;
  let rest: 'sniff' | 'sit' | 'idle' = 'sniff';
  let running = false;
  g.position.set(pos.x, groundY(pos.x, pos.z), pos.z);
  return {
    g,
    update(dt) {
      g.t += dt;
      if (wait > 0) {
        wait -= dt;
        g.play(DOG[rest]);
      } else {
        const tg = waypoints[i] ?? first;
        const dx = tg[0] - pos.x;
        const dz = tg[1] - pos.z;
        const d = Math.hypot(dx, dz);
        const sp = (running ? 3.6 : 1.5) * dt;
        if (d < Math.max(sp, 1e-3)) {
          pos.x = tg[0];
          pos.z = tg[1];
          i = (i + 1) % waypoints.length;
          const r = rand();
          rest = r < 0.55 ? 'sniff' : r < 0.8 ? 'idle' : 'sit';
          wait = rest === 'sit' ? rr(4, 8) : rr(1.5, 4);
          const nx = waypoints[i] ?? first;
          running = Math.hypot(nx[0] - pos.x, nx[1] - pos.z) > 14 && rand() < 0.5;
        } else {
          pos.x += (dx / d) * sp;
          pos.z += (dz / d) * sp;
          g.dir.x = dx;
          g.dir.z = dz;
          g.play(running ? DOG.run : DOG.walk);
        }
      }
      g.position.set(pos.x, groundY(pos.x, pos.z), pos.z);
    },
  };
}

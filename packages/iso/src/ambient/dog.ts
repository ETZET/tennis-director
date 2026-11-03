import { range } from '@td/shared';
import { DOG, DOG_COATS } from '../art/creatures/dog';
import type { Node } from '../core/graph';
import { Critter } from './critter';

export interface Dog {
  readonly g: Node;
  update(dt: number, now: number): void;
}

const rr = (a: number, b: number) => range(Math.random, a, b);

/**
 * 一只沿固定巡游点闲逛的流浪狗：到点后停下嗅地面、摇尾巴，偶尔坐一会儿；
 * 下一个点远的时候小跑过去。演出里的随机只决定画面。
 */
export function createDog(
  scene: Node,
  groundY: (x: number, z: number) => number,
  waypoints: readonly (readonly [number, number])[],
  /** 毛色（main 槽位）；不给就从 DOG_COATS 里随机挑一个 */
  coat: string = DOG_COATS[Math.floor(Math.random() * DOG_COATS.length)] ?? '#8a6440',
): Dog {
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
          const r = Math.random();
          rest = r < 0.55 ? 'sniff' : r < 0.8 ? 'idle' : 'sit';
          wait = rest === 'sit' ? rr(4, 8) : rr(1.5, 4);
          const nx = waypoints[i] ?? first;
          running = Math.hypot(nx[0] - pos.x, nx[1] - pos.z) > 14 && Math.random() < 0.5;
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

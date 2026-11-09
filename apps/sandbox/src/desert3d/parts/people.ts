// 球场上的人：球友来来去去打球，总监在分与分之间推扫帚扫沙。
// 子模块在 ./people/：pose（程序化姿势）、rig（骨骼 + 蒙皮网格）、person（走位和动作）、
// ball（弹道）、match（一次来访的脚本）、director（总监）、co（协程和寻路）。
import type { Build } from '../world';
import { Ball } from './people/ball';
import { Runner } from './people/co';
import { Director } from './people/director';
import { type CourtState, Match } from './people/match';

export const build: Build = (w) => {
  const ball = new Ball(w);
  ball.onBounce = (p, sp) => {
    if (sp > 1.5) w.fx?.puff(p.setY(w.groundY(p.x, p.z) + 0.05), 0.14, 2);
  };
  const cs: CourtState = { phase: 'idle', breakId: 0, breakKind: 'setup', doneBreak: 0, now: 0, ball };
  const match = new Match(w, cs);
  const director = new Director(w, cs);
  const runner = new Runner();
  runner.add(match.main());
  runner.add(director.main());
  // 调试 / 截图钩子
  Object.assign(window, { __people: { match, director, ball, cs } });
  return {
    update(dt, t) {
      cs.now = t;
      runner.step(dt);
      match.update(dt, t);
      director.update(dt, t);
      ball.update(t, dt);
      w.play.phase = cs.phase;
    },
  };
};

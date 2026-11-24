// 观察模式的"跟着事件走"的画面（第一轮评审「要补的画面」）：mount.ts 摆好每个人的身子和姿势以后，这里每帧再补一层。
//   food.ts  摊主做饭 / 摇饮料、点完单递出窗口（客人伸手接）、端着托盘 / 杯子走到桌边、桌上的托盘和吃饭的那一口
//   ball.ts  对打的球：每块有人对打的场一个球，跟着挥拍的节奏在两个击球点之间飞（过网的弧线 + 落地弹一下）
//   cars.ts  车来车去：每伙开车来的人一辆车（来之前开进车位、开门下车；走了以后倒出来开走；落客点停一下）；场景自己的车藏起来
//   pool.ts  游泳的人在泳道里来回游
//   mood.ts  排队等烦了（跺脚、张望、看表）、放弃的那一下回头看一眼再走
// 规矩：只读引擎的状态（agents、occupants、queues、log），不改；随机一律按人的 id 哈希；道具用各场景的素材（clubfood 的托盘、
// clubpark 的车、clubsite 的球），材质跟着场景的调色和天光（各场景的 kit，同一套 uniforms）。
import { createFoodKit } from '../../../clubfood/scene';
import { createParkKit } from '../../../clubpark/scene';
import type { PeopleCtx } from '../../../clubsite/people/props';
import type { SharedUniforms } from '../../../clubsite/render/ctx';
import { createBalls } from './ball';
import { createCars } from './cars';
import { createFood } from './food';
import { createMood } from './mood';
import { createPool } from './pool';
import type { FxFrame, FxHost, FxKits, FxPart, SimFx } from './util';

export type { FxFrame, SimFx } from './util';

export function createSimFx(host: FxHost): SimFx {
  let kits: FxKits | null = null;
  const parts: Record<string, FxPart> = {
    food: createFood(host.scene),
    ball: createBalls(host.scene),
    cars: createCars(host.scene),
    pool: createPool(),
    mood: createMood(),
  };
  const perf = { ms: 0, frames: 0, max: 0 };
  /** 每一部分平均每帧多少毫秒（最近 120 帧） */
  const partMs: Record<string, number> = {};
  /** 材质上下文从第一具身子上拿（clubsite/people 的 userData.peopleCtx = 总监那套 clubpark 的 ctx） */
  function kitsFrom(f: FxFrame): FxKits | null {
    if (kits) return kits;
    for (const a of f.actors.values()) {
      const ctx = a.body?.obj.userData.peopleCtx as
        | (PeopleCtx & { uniforms: SharedUniforms; texel: number })
        | undefined;
      if (!ctx) continue;
      const h = {
        uniforms: ctx.uniforms,
        params: ctx.params,
        texelMeters: () => host.pipe.rig.metersPerTexel,
        designTexel: ctx.texel,
      };
      kits = { people: ctx, food: createFoodKit(h), park: createParkKit(h) };
      return kits;
    }
    return null;
  }
  return {
    frame(f) {
      const t0 = performance.now();
      const k = kitsFrom(f);
      if (!k) return;
      for (const [n, p] of Object.entries(parts)) {
        const t = performance.now();
        p.frame(f, k);
        partMs[n] = (partMs[n] ?? 0) * 0.98 + (performance.now() - t) * 0.02;
      }
      const ms = performance.now() - t0;
      perf.ms += ms;
      perf.frames++;
      perf.max = Math.max(perf.max, ms);
    },
    off() {
      for (const p of Object.values(parts)) p.off();
    },
    stats() {
      const out: Record<string, unknown> = {
        avgMs: perf.frames ? +(perf.ms / perf.frames).toFixed(3) : 0,
        maxMs: +perf.max.toFixed(2),
        partMs: Object.fromEntries(Object.entries(partMs).map(([n, v]) => [n, +v.toFixed(3)])),
      };
      for (const [n, p] of Object.entries(parts)) if (p.stats) out[n] = p.stats();
      return out;
    },
  };
}

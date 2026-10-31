import type { ContentBundle, Effect } from '@td/content';
import type { GameState } from './state';
import { facilityTotals, num, test, wagesWeek } from './vars';
import { worldFor } from './world';

/**
 * 公告板预览：照这个日程排，一周大概会怎样（随拖动实时算，给界面看）。
 * 在状态的副本上算，随机数固定，不影响真正的模拟；带 chance 的效果按期望值算，下雨天不算。
 */
export interface PlanPreview {
  /** 每周现金净变化：会费 + 场地收入 + 日程活动 − 维护 − 工资 */
  cashWeek: number;
  /** 日程活动每周带来的会员（期望） */
  membersWeek: number;
  /** 照这个日程，项目质量最后会停在多少 */
  quality: number;
  /** 每周匹克球压力变化 */
  pressureWeek: number;
  /** 每周的课节数（演出是 lesson 的日程活动）：超过 5 节教练会累 */
  lessons: number;
  /** 这一周里因为条件不满足开不了的格子 */
  blocked: number;
}

function expected(s: GameState, content: ContentBundle, effs: readonly Effect[], stat: string): number {
  const w = worldFor(content, s.act, s.directorConfig);
  let v = 0;
  for (const e of effs) {
    if (!('stat' in e) || e.stat !== stat || !('add' in e)) continue;
    if (e.if && !test(s, w, e.if)) continue;
    const p = e.chance === undefined ? 1 : typeof e.chance === 'number' ? e.chance : num(s, w, e.chance);
    v += p * num(s, w, e.add);
  }
  return v;
}

export function planPreview(
  s0: GameState,
  content: ContentBundle,
  plan: Record<string, (string | null)[]>,
): PlanPreview {
  const s = structuredClone(s0);
  s.plan = structuredClone(plan);
  s.weather = 'sun';
  s.rng = 0x5eed;
  const w = worldFor(content, s.act, s.directorConfig);
  const fac = facilityTotals(s, w);
  let cash = (s.stats.members ?? 0) * w.act.rules.dues_week + fac.income - fac.upkeep - wagesWeek(s, w);
  let members = 0;
  let pressure = 0;
  let lessons = 0;
  let blocked = 0;
  for (const week of Object.values(plan))
    for (const id of week) {
      if (!id) continue;
      const a = w.activities.get(id);
      if (!a?.program) continue;
      if (a.program.requires && !test(s, w, a.program.requires)) {
        blocked++;
        continue;
      }
      if (a.performance === 'lesson') lessons++;
      cash += expected(s, content, a.effects, 'cash');
      members += expected(s, content, a.effects, 'members');
      pressure += expected(s, content, a.effects, 'pickleball_pressure');
    }
  return {
    cashWeek: Math.round(cash),
    membersWeek: Math.round(members * 10) / 10,
    quality: Math.round(num(s, w, w.act.rules.quality_target)),
    pressureWeek: Math.round(pressure),
    lessons,
    blocked,
  };
}

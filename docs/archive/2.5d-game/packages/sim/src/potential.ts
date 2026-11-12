import type { Growth, SkillKind } from '@td/content';
import { DIRECTOR } from './state';
import type { World } from './world';

/**
 * 员工成长（W3）的纯查表部分：潜力、开关、训练涨幅截在潜力上。不碰状态、不发事件（growth.ts 做那些），
 * 所以 effects.ts、vars.ts 可以直接用，不绕圈引用。
 */

export const ACCESS: Record<SkillKind, 'skill' | 'upkeep' | 'service' | 'play'> = {
  teach: 'skill',
  upkeep: 'upkeep',
  service: 'service',
  play: 'play',
};

/** 这张地图的成长配置；没写或关着是 null */
export const growthOf = (w: World): Growth | null => (w.act.growth?.enabled ? w.act.growth : null);

/** 某人某项能力的潜力（干活能涨到多少）。总监是 director_skill_cap */
export function potentialOf(w: World, id: string, k: SkillKind): number {
  if (id === DIRECTOR) return w.act.rules.director_skill_cap;
  const d = w.people.get(id);
  if (!d) return 100;
  const set = d.potential?.[k];
  if (set !== undefined) return set;
  const g = w.act.growth;
  const start = k === 'teach' ? d.skill : d[k];
  let extra = g?.headroom ?? 15;
  const bonus = g?.traits ?? { late_bloomer: 10 };
  for (const t of d.traits) extra += bonus[t] ?? 0;
  return Math.min(100, start + extra);
}

export const round2 = (v: number): number => Math.round(v * 100) / 100;

/**
 * 岗位和工单效果里 person: worker 涨了能力（球员的训练）：打开成长后截在潜力上（本来就高于潜力的不往下拉）。
 * 返回截过的值。
 */
export function capWorkerGain(w: World, id: string, k: SkillKind, before: number, after: number): number {
  if (!growthOf(w) || id === DIRECTOR || after <= before) return after;
  return round2(Math.max(before, Math.min(after, potentialOf(w, id, k))));
}

import type { Growth, GrowthUnlock, SkillKind } from '@td/content';
import { applyEffects, type Ctx, logEntry } from './effects';
import { ACCESS, growthOf, potentialOf, round2 } from './potential';
import { DIRECTOR, type EffectRecord, type GameState, type PersonState } from './state';
import { isStaff, tagged, test } from './vars';
import type { World } from './world';

/**
 * 员工成长（W3，LG-12；设计文档"五种钥匙 · 人是钥匙"）。
 *
 * - 地图配置 growth.enabled 打开以后：员工每干完一圈岗位或一张工单，那项能力（growth.skills 里的）+rate（默认 0.2），
 *   不超过他的潜力。总监不走这条：照旧 director_growth / director_skill_cap（staff.ts 的 grow），不重复算。
 * - 潜力：内容里写了 potential.<能力> 就用它；不写 = 起始值 + headroom（15），带 growth.traits 里的特质再加
 *   （大器晚成 late_bloomer +10），截在 100。
 * - 球技默认不在 growth.skills 里：球员靠训练岗位的效果（person: worker add play）涨；打开成长后这份涨幅截在潜力上。
 * - 跨过 step（5）的整数倍、或者某条解锁的 gte，发 skill_up；解锁的 need 都满足时发 unlock、写日志、执行效果（一局一次）。
 * - 关着时什么都不做：能力不涨、不截、不发事件（Wave 2 的校准不受影响）。
 *
 * 能力会是小数（存两位小数，避免 0.2 累加的浮点尾巴）；界面显示时自己取整，模拟里比较门槛用原值。
 */

/** 两个值之间跨过了哪些门槛：step 的整数倍，加上解锁的 gte（这项能力的） */
function crossed(g: Growth, k: SkillKind, before: number, after: number): number[] {
  if (after <= before) return [];
  const out = new Set<number>();
  for (let m = Math.floor(before / g.step + 1e-9) + 1; m * g.step <= after + 1e-9; m++) out.add(round2(m * g.step));
  for (const u of g.unlocks)
    for (const n of u.need) if (n.skill === k && before < n.gte && after >= n.gte) out.add(n.gte);
  return [...out].sort((a, b) => a - b);
}

/**
 * 一项能力从 before 变到了现在的值（干活涨的、效果加的）：跨过门槛发 skill_up，然后看一眼解锁。
 * 成长关着时什么都不做。
 */
export function noteSkill(ctx: Ctx, id: string, k: SkillKind, before: number): void {
  const g = growthOf(ctx.w);
  const p = ctx.s.people[id];
  if (!g || !p) return;
  const after = p[ACCESS[k]];
  for (const value of crossed(g, k, before, after)) ctx.events.push({ type: 'skill_up', person: id, skill: k, value });
  if (after > before) checkUnlocks(ctx, id);
}

/** 效果记录里涨了的能力（岗位、工单效果里的 person: worker，例如球员训练）：补发 skill_up、看一眼解锁 */
export function noteRecords(ctx: Ctx, recs: readonly EffectRecord[]): void {
  if (!growthOf(ctx.w)) return;
  for (const r of recs) {
    if (r.kind !== 'person' || r.delta <= 0 || r.attr === 'morale' || r.attr === 'fatigue') continue;
    const k: SkillKind = r.attr === 'skill' ? 'teach' : r.attr;
    const p = ctx.s.people[r.person];
    if (p) noteSkill(ctx, r.person, k, round2(p[ACCESS[k]] - r.delta));
  }
}

/**
 * 员工（不是总监）干完一圈岗位或一张工单：那项能力 +rate，不超过潜力。成长关着、这项能力不按干活涨时不动。
 */
export function growStaff(ctx: Ctx, id: string, k: SkillKind): void {
  const g = growthOf(ctx.w);
  if (!g || id === DIRECTOR || !g.skills.includes(k)) return;
  const p = ctx.s.people[id];
  if (!p) return;
  const cap = potentialOf(ctx.w, id, k);
  const before = p[ACCESS[k]];
  if (before >= cap) return;
  p[ACCESS[k]] = round2(Math.min(cap, before + g.rate));
  noteSkill(ctx, id, k, before);
}

/**
 * 解锁的 need 每一条由不同的人满足（小回溯：need 至多两三条）。返回各条对应的人；满足不了是 null。
 * prefer 排在最前（开出它的那个人优先算他）。
 */
function match(s: GameState, w: World, u: GrowthUnlock, prefer?: string): string[] | null {
  const staff = Object.keys(s.people)
    .filter((id) => isStaff(s, w, id))
    .sort((a, b) => (a === prefer ? -1 : b === prefer ? 1 : a.localeCompare(b)));
  const used = new Set<string>();
  const out: string[] = [];
  const go = (i: number): boolean => {
    const n = u.need[i];
    if (!n) return true;
    for (const id of staff) {
      if (used.has(id) || !tagged(w, id, n.who) || (s.people[id] as PersonState)[ACCESS[n.skill]] < n.gte) continue;
      used.add(id);
      out.push(id);
      if (go(i + 1)) return true;
      used.delete(id);
      out.pop();
    }
    return false;
  };
  return go(0) ? out : null;
}

/**
 * 看一眼还没开的解锁：need 都满足、when 也满足就开（一局一次）。成长涨了能力时、每天收盘时（招来的人、
 * 效果加的能力）各看一次。trigger 是刚涨了能力的人：解锁记在他名下（他在 need 里的话）。
 */
export function checkUnlocks(ctx: Ctx, trigger?: string): void {
  const { s, w } = ctx;
  const g = growthOf(w);
  if (!g?.unlocks.length) return;
  s.unlocks ??= {};
  for (const u of g.unlocks) {
    if (s.unlocks[u.key]) continue;
    const who = match(s, w, u, trigger);
    if (!who || !test(s, w, u.when)) continue;
    const person = trigger && who.includes(trigger) ? trigger : (who[0] as string);
    s.unlocks[u.key] = { person, t: s.t };
    const out: EffectRecord[] = [];
    const entry = logEntry(ctx, { kind: 'unlock', key: u.key, person, people: who }, null, out);
    ctx.events.push({ type: 'unlock', person, key: u.key });
    applyEffects({ ...ctx, worker: person }, u.effects, entry.id, out);
  }
}

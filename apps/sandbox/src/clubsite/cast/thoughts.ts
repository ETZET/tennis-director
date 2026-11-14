// "在干什么""在想什么"：按场景里那个人的姿势和手里的东西推断活动，再按活动挑一句心里话。
// 姿势名见 clubsite/people/index.ts 顶部的说明（rig 原有 + poses.ts 新加）和 clubhouse/people.ts 的健身姿势。纯函数。
import { GRUMBLES, type LineKey, ROLE_LINES } from './pools';
import { hashOf, pickBy } from './rng';
import { TRAITS } from './traits';
import type { Activity, CastPerson, PersonMem } from './types';

const POSE_ACTIVITY: Record<string, Activity> = {
  // rig 原有
  idle: 'idle',
  walk: 'walk',
  ready: 'play',
  forehand: 'play',
  backhand: 'play',
  serve: 'play',
  feed: 'play',
  sweep: 'work',
  blow: 'work',
  push: 'work',
  pickup: 'work',
  dump: 'work',
  // poses.ts
  sit: 'rest',
  clap: 'watch',
  sip: 'eat',
  drag: 'work',
  water: 'work',
  crank: 'work',
  skim: 'work',
  dink: 'play',
  dinkB: 'play',
  pour: 'work',
  call: 'work',
  squeegee: 'work',
  bkCrouch: 'work',
  bkStand: 'work',
  bkRoll: 'work',
  bkUmbrella: 'work',
  // 会所健身房（clubhouse/people.ts）
  run: 'gym',
  row: 'gym',
  cycle: 'gym',
  benchPress: 'gym',
  spot: 'gym',
  squat: 'gym',
  punch: 'gym',
  sledPush: 'gym',
  stretch: 'gym',
  coachLead: 'work',
  deskServe: 'work',
  swim: 'swim',
};

/** 干活用的道具：拿着它站着 = 在干活 */
const WORK_PROPS = /broom|blower|picker|skim|hose|crank|can|brush|squeegee|marker|towel|stock|tray|keys/;

/** 姿势 + 手里的东西 → 在干什么（不认识的姿势 = idle） */
export function activityOf(pose: string | undefined, prop: string | null | undefined): Activity {
  const base: Activity = (pose && POSE_ACTIVITY[pose]) || 'idle';
  if (prop === 'cup' && (base === 'idle' || base === 'rest')) return 'eat';
  if (prop && WORK_PROPS.test(prop) && (base === 'idle' || base === 'walk')) return base === 'idle' ? 'work' : 'walk';
  if ((prop === 'racket' || prop === 'paddle') && base === 'idle') return 'wait';
  return base;
}

/** 活动没有台词时退到哪个 */
const FALLBACK: Partial<Record<Activity, LineKey[]>> = {
  watch: ['watch', 'rest'],
  eat: ['eat', 'rest'],
  swim: ['swim', 'rest'],
  gym: ['gym', 'play'],
  wait: ['wait', 'idle'],
  walk: ['walk', 'idle'],
  work: ['work', 'idle'],
  play: ['play'],
  rest: ['rest', 'idle'],
  idle: ['idle', 'rest'],
};

/**
 * "在想什么"：一句话。顺序：他自己的 lines → 特质的 lines → 身份的默认；好感低（< 3）时偶尔是一句抱怨。
 * salt 换一句（同样的 salt 永远同一句：界面每隔一阵换 salt）。sceneTitle 用在兜底的那句里（"会员场人真多"）。
 */
export function thought(
  p: CastPerson,
  mem: PersonMem | undefined,
  activity: Activity,
  sceneTitle: string,
  salt: number | string = 0,
): string {
  const h = hashOf(0, p.id, activity, salt);
  const favor = mem?.favor ?? p.favor0;
  if (favor < 3 && h % 3 === 0) return pickBy(h >>> 3, GRUMBLES);
  const keys = FALLBACK[activity] ?? [activity];
  for (const k of keys) {
    const pool: string[] = [...(p.lines?.[k] ?? [])];
    for (const id of p.traits) pool.push(...(TRAITS[id]?.lines?.[k as Activity] ?? []));
    if (pool.length) return pickBy(h >>> 2, [...new Set(pool)]);
  }
  for (const k of keys) {
    const pool = ROLE_LINES[p.role]?.[k];
    if (pool?.length) return pickBy(h >>> 2, pool);
  }
  return sceneTitle ? `${sceneTitle}今天人真多` : '……';
}

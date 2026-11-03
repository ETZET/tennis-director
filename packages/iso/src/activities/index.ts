import { bbq } from './bbq';
import { ambient } from './choreo';
import { cleanup } from './cleanup';
import { fair } from './fair';
import { feed } from './feed';
import { match } from './match';
import { openday } from './openday';
import { pickleball } from './pickleball';
import { type ActivityId, activityMeta, resolveParams } from './registry';
import { Act, type Runner } from './runtime';
import { serve } from './serve';
import { sprint } from './sprint';
import { tryout } from './tryout';
import { tug } from './tug';
import type { ActivityEnv, ActivityHandle, StartOptions } from './types';

export { buildDiorama, type Diorama, dioramaArea } from './diorama';
export { coachLook, look, VENUE_STYLE, type VenueStyle } from './looks';
export * from './registry';
export { ACTIVITY_TEXT, textAt, textFor } from './text';
export * from './types';

/** 每个活动的演出实现 */
export const ACTIVITY_IMPLS: Record<ActivityId, (a: Act) => Runner | undefined> = {
  feed,
  serve,
  sprint,
  tryout,
  fair,
  openday,
  match,
  pickleball,
  bbq,
  tug,
  cleanup,
};

/** 活动句柄（动画库读画面震动） */
export interface ActivityRun extends ActivityHandle {
  /** 画面震动的剩余秒数（ACE、天才出现） */
  readonly shake: number;
}

/**
 * 在一块场地上开演一个活动。
 *
 *   const h = startActivity(env, 'feed', { area: FA, conditions, params: { players: 2 }, cast: { coach, players } });
 *   …
 *   h.stop();
 *
 * 宿主照常每帧推进时间轴、update 人物列表；活动每帧的逻辑、球、粒子、漫画字由时间轴上的 tick 推进。
 * 生成的人物从场外走到站位、借来的人物从原地走过去，都到位了才开演（opts.entry 给入场路线）。
 * stop() 马上清理；stop({ graceful: true }) 收场：人原路走出去、道具溶解，done 为 true 时清理完。
 * 借来的人物在原地还回去（位置不回原位，姿势和状态还原）。
 */
export function startActivity(env: ActivityEnv, id: string, opts: StartOptions): ActivityRun {
  const meta = activityMeta(id);
  if (!meta) throw new Error(`unknown activity '${id}'`);
  const impl = ACTIVITY_IMPLS[id as ActivityId];
  // 注册表里的变量收回范围；不认识的键（劳动日的 crewN、progress）原样收下
  const a = new Act(
    env,
    meta,
    opts.area,
    opts.conditions,
    { ...opts.params, ...resolveParams(meta, opts.params) },
    opts,
  );
  a.runner = impl(a) ?? undefined;
  ambient(
    a,
    meta.ground === 'plaza' ? 'plaza' : meta.ground === 'court' || meta.ground === 'minicourt' ? 'court' : 'field',
  );
  a.buildProps();
  // 生成的人物放到场外起点；没有要等的人就马上开演
  a.settleAll();
  a.startTicking();
  return {
    id,
    stop: (o) => a.stop(o),
    setParams: (p) => {
      const changed = Object.keys(p).filter((k) => a.P[k] !== p[k]);
      if (!changed.length) return;
      Object.assign(a.P, p, resolveParams(meta, { ...a.P, ...p }));
      if (a.alive) a.runner?.params?.(changed);
    },
    get finished() {
      return a.finished;
    },
    get done() {
      return a.done;
    },
    get ready() {
      return a.ready;
    },
    get shake() {
      return a.shake;
    },
  };
}

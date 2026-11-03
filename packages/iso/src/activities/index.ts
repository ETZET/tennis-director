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
 * 停下时生成的人物和道具删掉，借来的人物还回原来的位置和状态。
 */
export function startActivity(env: ActivityEnv, id: string, opts: StartOptions): ActivityRun {
  const meta = activityMeta(id);
  if (!meta) throw new Error(`unknown activity '${id}'`);
  const impl = ACTIVITY_IMPLS[id as ActivityId];
  const a = new Act(env, meta, opts.area, opts.conditions, resolveParams(meta, opts.params), opts);
  a.runner = impl(a) ?? undefined;
  ambient(
    a,
    meta.ground === 'plaza' ? 'plaza' : meta.ground === 'court' || meta.ground === 'minicourt' ? 'court' : 'field',
  );
  a.buildProps();
  a.startTicking();
  return {
    id,
    stop: () => a.stop(),
    get finished() {
      return a.finished;
    },
    get shake() {
      return a.shake;
    },
  };
}

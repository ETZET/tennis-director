// 演出用到的引擎、地点表、站位表都从这一处拿（换实现只改这里）。
import { CAST } from '../../clubsite/cast';
import type { CastPerson } from '../../clubsite/cast/types';
import {
  engine,
  personOf as enginePerson,
  type Place,
  POST_OF_SLOT,
  PLACES as REAL_PLACES,
  type SimConfig,
  type SimState,
} from '../../clubsite/sim';
import { SPOTS as REAL_SPOTS, seatWay as realSeatWay } from './spots';
import type { SpotTable } from './types';

export const PLACES: readonly Place[] = REAL_PLACES;
export const SPOTS: SpotTable = REAL_SPOTS;
export const POSTS = POST_OF_SLOT;
export const sim = engine;
/** 看台座位 ↔ 走道口（顺着座位排直着走的几个点）；不是看台 = null */
export const seatWay = realSeatWay;

/** 这个人是谁（named / regular 在演员表里；模拟生成的客人、顶岗的在状态的 people 里） */
export function personOf(cfg: SimConfig, id: string, s?: SimState | null): CastPerson | undefined {
  return CAST.get(id) ?? (s ? enginePerson(cfg, s, id) : undefined);
}

export { DAY_END, OPEN } from '../../clubsite/sim';
export { CAST };

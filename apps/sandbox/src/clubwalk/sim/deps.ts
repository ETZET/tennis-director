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
import { SPOTS as REAL_SPOTS } from './spots';
import type { SpotTable } from './types';

export const PLACES: readonly Place[] = REAL_PLACES;
export const SPOTS: SpotTable = REAL_SPOTS;
export const POSTS = POST_OF_SLOT;
export const sim = engine;

/** 这个人是谁（named / regular 在演员表里；模拟生成的客人、顶岗的在状态的 people 里） */
export function personOf(cfg: SimConfig, id: string, s?: SimState | null): CastPerson | undefined {
  return CAST.get(id) ?? (s ? enginePerson(cfg, s, id) : undefined);
}

export { CAST };

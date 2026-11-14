// 名册和卡片共用的接口（index.ts 实现）：读状态、找人、他现在在哪儿、互动、开别的面板。
import type {
  ActionId,
  Activity,
  ActResult,
  Cast,
  CastPerson,
  CastState,
  PersonMem,
  SceneId,
} from '../../clubsite/cast/types';
import type { Bound } from './bind';

export interface NowInfo {
  /** 今天在俱乐部 */
  here: boolean;
  scene: SceneId | null;
  activity: Activity;
  /** "在红土场 · 打球" / "今天在泳池" / "今天不在俱乐部" */
  text: string;
  /** 在想什么（看得见他的时候才有） */
  thought: string;
}

export interface CastCtx {
  cast: Cast;
  state(): CastState;
  person(id: string): CastPerson | undefined;
  mem(id: string): PersonMem;
  /** 场景里看得见的那个他 */
  bound(id: string): Bound | undefined;
  /** 总监就在他旁边（当面） */
  near(id: string): boolean;
  nowOf(id: string): NowInfo;
  /** 状态变了（互动、换天）→ 回调；返回取消 */
  onChange(fn: () => void): () => void;
  openCard(id: string, list?: string[]): void;
  openRoster(): void;
  /** 走到他跟前，到了自动打开卡片 */
  walkTo(id: string): boolean;
  doAct(id: string, action: ActionId): ActResult;
  nextDay(): void;
  clock(): string;
}

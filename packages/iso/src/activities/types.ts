import type { Rand } from '@td/shared';
import type { Node } from '../core/graph';
import type { Scheduler } from '../choreo/scheduler';
import type { PeopleWorld, Person } from '../people/person';
import type { CourtFrame } from '../world/frame';

/**
 * 活动动画库（ADR 0010）的公共类型。
 * 这一份只有类型，不碰画布，注册表和测试可以直接引用。
 */

export type Weather = 'sun' | 'cloud' | 'rain' | 'wind' | 'heat';
export type Venue = 'generic' | 'maple' | 'hollow';
export type Category = 'train' | 'recruit' | 'match' | 'team';
export type Lang = 'zh' | 'en';

export const WEATHERS: readonly Weather[] = ['sun', 'cloud', 'rain', 'wind', 'heat'];
export const VENUES: readonly Venue[] = ['generic', 'maple', 'hollow'];
export const CATEGORIES: readonly Category[] = ['train', 'recruit', 'match', 'team'];

/** 全局条件：每个活动都受它们影响。 */
export interface Conditions {
  /** 疲劳 0..1（酷热时演出里再加 0.22） */
  fatigue: number;
  weather: Weather;
  /** 教练水平 1..5 */
  coach: number;
  /** 场地风格：换配色、对手、道具，加专属桥段 */
  venue: Venue;
}

export const DEFAULT_CONDITIONS: Conditions = { fatigue: 0.25, weather: 'sun', coach: 3, venue: 'generic' };

export type ParamValue = number | string;

export type ParamDef =
  | {
      key: string;
      type: 'range';
      min: number;
      max: number;
      step: number;
      def: number;
      /** 改了要重建场景（道具、人数变了） */
      structural?: boolean;
      /** 文案键：标签、每个值的显示（{v} 占位） */
      labelKey: string;
      valueKey?: string;
    }
  | {
      key: string;
      type: 'seg';
      opts: readonly { v: ParamValue; labelKey: string }[];
      def: ParamValue;
      structural?: boolean;
      labelKey: string;
    };

/** 场地的大致样子：动画库的小岛按它铺地面，游戏里只用来挑合适的锚点。 */
export type GroundKind = 'court' | 'minicourt' | 'pickle' | 'clay' | 'track' | 'grass' | 'plaza';

export interface ActivityMeta {
  id: string;
  category: Category;
  titleKey: string;
  descKey: string;
  /** 受哪些条件 / 变量影响（标签的文案键） */
  tags: readonly string[];
  params: readonly ParamDef[];
  /**
   * 原生大小：动画库里小岛的宽（x）和深（z），单位米。
   * 球场类活动的坐标以球网为原点（局部 x=0 是球网），netX 是动画库小岛里球网的 x。
   */
  size: { W: number; D: number };
  ground: GroundKind;
  netX?: number;
  /** 动画库小岛上不放的角落装饰 */
  noCorner?: { L?: boolean; R?: boolean };
  /** 动画库的默认视角 */
  view?: { zoom?: number; yaw?: number; pitch?: number };
}

/** 演出要用的外部环境：场景、时间轴、人物世界、地面高度。 */
export interface ActivityEnv {
  /** 活动的东西挂在这里（世界坐标） */
  readonly scene: Node;
  /** 演出时间轴（暂停、变速都在这里） */
  readonly sched: Scheduler;
  /** 人物列表（宿主每帧 update 它们）和世界坐标的地面高度 */
  readonly world: PeopleWorld;
  groundY(x: number, z: number): number;
  /** 场景里的字用哪种语言；默认 en */
  readonly lang?: Lang;
  /** 种子随机流；默认 mulberry32(opts.seed) */
  readonly rand?: Rand;
  /** 漫画字和表情整体放大（游戏的相机远，用 2.5 左右）；默认 1 */
  readonly spriteScale?: number;
}

/** 借给演出的现有人物（游戏里的教练和青少年），演完原样还回去。 */
export interface ActivityCast {
  coach?: Person | null;
  players?: readonly Person[];
}

export interface StartOptions {
  /** 在哪块地方演：场地坐标系（局部 x=0 是球网 / 区域中心） */
  area: CourtFrame;
  /** 局部坐标的活动范围（默认 ±hx、±hz）：球滚到边上会弹回，人不会走出去 */
  bounds?: { x0: number; x1: number; z0: number; z1: number };
  conditions: Conditions;
  params?: Readonly<Record<string, ParamValue>>;
  cast?: ActivityCast;
  seed?: number;
  /** 动画库小岛才有的东西：路人、教练头顶的星级、围网上的乌鸦位置 */
  extras?: {
    passers?: boolean;
    badges?: boolean;
    /** 乌鸦停在哪里（局部坐标）；默认停在区域北边 */
    perches?: readonly { x: number; y: number; z: number }[];
  };
}

export interface ActivityHandle {
  readonly id: string;
  /** 停下并清理：生成的人物和道具删掉，借来的人物还回去 */
  stop(): void;
  /** 一轮演完、需要从头再来时为 true（比赛打完一盘后） */
  readonly finished: boolean;
}

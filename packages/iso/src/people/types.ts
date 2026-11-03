import type { PoseName } from './poses';

/** 人物的外观和初始状态（和旧的体素小人同一套参数）。 */
export type HairStyle = 'cap' | 'visor' | 'pony' | 'long' | 'bald' | 'curly' | 'short';

/** 一个像素小人的外观和初始状态。外观完全由数据决定。 */
export interface PersonOptions {
  name: string;
  x: number;
  z: number;
  /** 锁定朝向（例如击球时面向球网）；null 表示自由转身 */
  lock?: number | null;
  yaw?: number;
  base?: PoseName;
  /** 坐着时臀部的世界高度；null 表示站立 */
  seatY?: number | null;
  reach?: number;
  wide?: boolean;
  shirt: string;
  trim?: string;
  sleeve?: string;
  longSleeve?: boolean;
  shorts: string;
  pants?: boolean;
  socks?: string;
  skin: string;
  hair: string;
  hairStyle?: HairStyle;
  cap?: string;
  beard?: string;
  shoes: string;
  racket?: string;
  paddle?: string;
  phone?: boolean;
  clipboard?: boolean;
  box?: boolean;
  /** 整体缩放（小朋友 0.6 左右）；默认 1。小于 0.8 用小孩体型的精灵 */
  scale?: number;
}

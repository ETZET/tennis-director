// 练习场（practice）只读复用的资产：球筐（v0 翻倒一串球 / v1 满筐）、推式捡球器、散一地的网球（v1 = 5 × 3 米里 18 个成簇）。
import { build as hopper } from '../clubsite/assets/ball-hopper';
import { build as picker } from '../clubsite/assets/ball-picker';
import { build as balls } from '../clubsite/assets/tennis-ball';
import type { AssetBuild } from './ctx';

const as = (b: unknown) => b as AssetBuild;

export const REUSED: Record<string, AssetBuild> = {
  'practice:hopper': as(hopper),
  'practice:picker': as(picker),
  'practice:balls': as(balls),
};

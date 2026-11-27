// 到达（arrive）的复用表：旧内场停车场（clubpark）的车、车棚、代客亭、代客台、立牌、俱乐部石碑、行李车、代客员 —— 只读 import。
// clubvista 的调色板是 clubpark 的超集（carCream / carSilver / lotPaint / glass / tyre …），这些 build 能直接拿这里的 ctx 建。
// 代客亭的壁灯接进 daylight（userData.night：天黑自动开）。
import type * as THREE from 'three';
import { build as bagTrolley } from '../clubpark/assets/bag-trolley';
import { build as car } from '../clubpark/assets/car';
import { build as carport } from '../clubpark/assets/carport';
import { build as monument } from '../clubpark/assets/club-monument';
import { build as suv } from '../clubpark/assets/suv';
import { build as valet } from '../clubpark/assets/valet';
import { build as valetBooth } from '../clubpark/assets/valet-booth';
import { build as valetPodium } from '../clubpark/assets/valet-podium';
import { build as valetSign } from '../clubpark/assets/valet-sign';
import type { AssetBuild } from './ctx';

const as = (b: unknown) => b as AssetBuild;

/** 代客亭：壁灯天黑自动亮 */
const booth: AssetBuild = (ctx) => {
  const g = (valetBooth as unknown as AssetBuild)(ctx) as THREE.Object3D;
  const setLamp = g.userData.setLamp as ((on: boolean) => void) | undefined;
  g.userData.night = { setOn: (on: boolean) => setLamp?.(on) };
  return g;
};

export const REUSED: Record<string, AssetBuild> = {
  'arrive:car': as(car),
  'arrive:suv': as(suv),
  'arrive:carport': as(carport),
  'arrive:valet-booth': booth,
  'arrive:valet-podium': as(valetPodium),
  'arrive:valet-sign': as(valetSign),
  'arrive:monument': as(monument),
  'arrive:bag-trolley': as(bagTrolley),
  'arrive:valet': as(valet),
};

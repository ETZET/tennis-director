// 喷泉广场（plaza）只读复用的资产：棕榈喷泉 + 水花（clubplaza）、餐车和串灯（clubfood）、会所招牌（clubhouse）。
// id 都带 plaza: 前缀。clubvista 的调色板是这些场景调色板的超集，能直接拿这里的 ctx 建。
import type * as THREE from 'three';
import { build as cartChurros } from '../clubfood/assets/cart-churros';
import { build as festoon } from '../clubfood/assets/festoon';
import { build as truckPizza } from '../clubfood/assets/truck-pizza';
import { build as truckTaco } from '../clubfood/assets/truck-taco';
import { build as tuktukBoba } from '../clubfood/assets/tuktuk-boba';
import { build as clubSign } from '../clubhouse/assets/club-sign';
import { build as drinkFountain } from '../clubplaza/assets/drink-fountain';
import { build as drinksCart } from '../clubplaza/assets/drinks-cart';
import { build as fountainSpray } from '../clubplaza/assets/fountain-spray';
import { build as leafCart } from '../clubplaza/assets/leaf-cart';
import { build as palmFountain } from '../clubplaza/assets/palm-fountain';
import type { AssetBuild, AssetCtx } from './ctx';

const as = (b: unknown) => b as AssetBuild;

/** 串灯：原样是白天的暖白灯泡；加上 userData.night，天黑自动亮（daylight 调 setOn） */
const festoonLit: AssetBuild = (ctx: AssetCtx) => {
  const g = (festoon as unknown as AssetBuild)(ctx) as THREE.Object3D;
  const setLit = g.userData.setLit as (k: number) => void;
  g.userData.night = { setOn: (on: boolean) => setLit(on ? 1 : 0) };
  return g;
};

export const REUSED: Record<string, AssetBuild> = {
  'plaza:fountain': as(palmFountain),
  'plaza:spray': as(fountainSpray),
  'plaza:taco': as(truckTaco),
  'plaza:pizza': as(truckPizza),
  'plaza:boba': as(tuktukBoba),
  'plaza:churros': as(cartChurros),
  'plaza:festoon': festoonLit,
  'plaza:sign': as(clubSign),
  'plaza:drink-fountain': as(drinkFountain),
  'plaza:drinks-cart': as(drinksCart),
  'plaza:leaf-cart': as(leafCart),
};

/**
 * @td/iso：2.5D 等距像素画面（ADR 0019）。游戏和 sandbox 只从这里引用。
 */
export * as activities from './activities';
export * from './ambient';
export * from './art/creatures';
export { textArt } from './art/font';
export type { Facing, PersonSheet, PixelArt, SlotColors } from './art/format';
export { ICON_ART, type IconName } from './art/icons';
export * from './choreo/scheduler';
export * from './choreo/shots';
export * from './core';
export * from './fx/particles';
export * from './fx/sprites';
export * from './motion/ball';
export * from './motion/ballistics';
export * from './people/head';
export * from './people/parts';
export * from './people/person';
export * from './people/poses';
export * from './people/view';
export * from './site';
export * as indianWells from './site/indian-wells';
export { createStarSign, STAR_SIGN_AT, type StarSign } from './site/indian-wells/stars';
export * from './world/frame';

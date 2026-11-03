import type { PersonSheet } from '../format';
import { ADULT_BASE } from './adult';
import { ADULT_GESTURES } from './gestures';

/** 成人精灵表：移动 + 基础姿势 + 击球分段（adult.ts）+ 手势和摔倒（gestures.ts）。 */
export const ADULT: PersonSheet = { body: 'adult', anims: { ...ADULT_BASE, ...ADULT_GESTURES } };

export { ADULT_BASE } from './adult';
export { ADULT_GESTURES, BODY_OVERLAYS, HAIR_OVERLAYS } from './gestures';
export { KID, KID_BODY_OVERLAYS, KID_HAIR_OVERLAYS } from './kid';

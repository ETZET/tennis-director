// tease-clay：出口外露出的红土场一角（球场街：那条街上最显眼的是红土场）。同 tease-court，场面换成红土。
import type * as THREE from 'three';
import type { AssetCtx } from '../ctx';
import { buildTeaseCourt } from './tease-court';

export function build(ctx: AssetCtx): THREE.Object3D {
  return buildTeaseCourt(ctx, 'streetClay');
}

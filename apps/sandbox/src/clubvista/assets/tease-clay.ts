// tease-clay：出口外露出的红土场一角（球场街：那条街上最显眼的是红土场）。同 tease-court，场面换成红土。
import type * as THREE from 'three';
import type { AssetCtx } from '../ctx';
import { buildTeaseCourt } from './tease-court';

export function build(ctx: AssetCtx): THREE.Object3D {
  // 红土场不要挡风网（第 3 轮：深绿挡板压在橙色上读成长椅）
  return buildTeaseCourt(ctx, 'streetClay', false);
}

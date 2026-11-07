// 总监（Q 版）：青绿衬衫 + 金色滚边、卡其长裤、晒黑的皮肤、短黑发、宽檐草帽、推扫帚。骨骼和姿势在 player/rig.ts。
// 画廊：desert3d-v2.html?asset=director&pose=sweep&phase=0.25（不给 phase 自动播放）
import type * as THREE from 'three';
import type { AssetCtx } from '../world';
import { PERSON } from './player';
import { buildPerson } from './player/rig';

export function build(ctx: AssetCtx): THREE.Object3D {
  const m = (k: Parameters<AssetCtx['mat']>[0]) => ctx.mat(k, PERSON);
  return buildPerson(
    ctx,
    {
      skin: m('skinTan'),
      hair: ctx.mat('hair', { ...PERSON, edge: 0.25, convex: 0 }),
      shirt: m('clothTeal'),
      // 卡其裤：调色板里最接近卡其的是风化木（#d8b088 → 紫灰暗档）
      bottom: m('woodWeathered'),
      bottomKind: 'pants',
      shoes: m('branch'),
      hairStyle: 'short',
      trim: m('flowerYellow'),
      straw: {
        hat: ctx.mat('straw', { lightUp: 0.6, bands: [-0.3, 0.45], noShadowReceive: true }),
        band: ctx.mat('hair', { ...PERSON, edge: 0.25, convex: 0 }),
      },
      hold: { kind: 'broom', wood: m('wood'), head: m('dryGrass') },
    },
    'director',
  );
}

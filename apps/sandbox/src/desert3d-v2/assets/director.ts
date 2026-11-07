// 总监（Q 版）：青绿衬衫 + 金色滚边、卡其长裤、晒黑的皮肤、短黑发、宽檐草帽、推扫帚。骨骼和姿势在 player/rig.ts。
// 画廊：desert3d-v2.html?asset=director&pose=sweep&phase=0.25（不给 phase 自动播放）
//
// 道具：userData.setProp('broom' | 'picker' | null)，默认 broom。
// 捡球器是建在总监身上的（不是外挂）：assets/ball-picker.ts 的 buildPicker 建一个，挂在总监的 root 下，姿势负责摆放。
//   拿着它时 userData.picker = 捡球器对象：picker.userData.roll(dt, speed) 让笼子滚（演出里按总监走的速度调；
//   画廊自动播放时 rig 自己滚）、picker.userData.setCount(n) 0..60 笼子里的球。
// 姿势 push：推着捡球器走（双手低握 T 形横把，笼子在身前 1.5 米的地上），phase 像 walk 一样循环；
//   拿着捡球器时 walk 也是推着走，idle 是捡球器立在身侧、右手搭着。
//   ?asset=director&prop=picker&pose=push&phase=0.25
import type * as THREE from 'three';
import type { AssetCtx } from '../world';
import { buildPicker } from './ball-picker';
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
      picker: buildPicker(ctx),
    },
    'director',
  );
}

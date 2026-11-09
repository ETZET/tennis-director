// 总监（Q 版）：青绿衬衫 + 金色滚边、卡其长裤、晒黑的皮肤、短黑发、宽檐草帽、推扫帚。骨骼和姿势在 player/rig.ts。
// 画廊：desert3d-v2.html?asset=director&pose=sweep&phase=0.25（不给 phase 自动播放）
//
// 道具：userData.setProp('broom' | 'picker' | 'blower' | null)，默认 broom。
// 吹叶机（和教练同一台橙色的）：pose('blow') 左右扫；userData.setBlowSweep(false) 后管口固定朝正前下方（玩家按朝向瞄准）；
//   userData.nozzle() / nozzleDir() = 管口位置 / 吹的方向（世界坐标）。拿着它 walk/idle 是右手提在胯边、管子朝前下。
// pose('pickup', 0..1)：弯腰捡/放工具（0.5 秒一次，PICKUP_LOW = 0.5 手到地面，在这一刻 setProp）。
// pose('dump', 0..1)：拿着捡球器时把笼子抬到右前方腰高抖三下（0.3..0.75），userData.dumpPoint() = 那时笼子中心（世界坐标）。
//   ?asset=director&prop=blower&pose=blow&phase=0.25 · ?asset=director&prop=broom&pose=pickup&phase=0.5 · ?asset=director&prop=picker&pose=dump&phase=0.5
// 捡球器是建在总监身上的（不是外挂）：assets/ball-picker.ts 的 buildPicker 建一个，挂在总监的 root 下，姿势负责摆放。
//   拿着它时 userData.picker = 捡球器对象：picker.userData.roll(dt, speed) 让笼子滚（演出里按总监走的速度调；
//   画廊自动播放时 rig 自己滚）、picker.userData.setCount(n) 0..60 笼子里的球。
// 姿势 push：推着捡球器走（双手低握 T 形横把，笼子在身前 1.5 米的地上），phase 像 walk 一样循环；
//   拿着捡球器时 walk 也是推着走，idle 是捡球器立在身侧、右手搭着。
//   ?asset=director&prop=picker&pose=push&phase=0.25
import type * as THREE from 'three';
import { buildPicker } from '../../assets/ball-picker';
import type { BaseCtx as AssetCtx } from '../../render/ctx';
import { PERSON } from './player';
import { buildPerson } from './rig';

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
      blower: {
        body: ctx.mat('toolOrange', { ...PERSON, edge: 0.45, convex: 0.5 }),
        tube: ctx.mat('toolOrange', { ...PERSON, edge: 0.45, convex: 0.3 }),
        dark: ctx.mat('hair', { ...PERSON, edge: 0.3, convex: 0 }),
      },
    },
    'director',
  );
}

// 球员（Q 版）：骨骼和姿势在 player/rig.ts。变体 = 不同的衣服、肤色、发型、球拍颜色（?v=0..3）。
// 画廊：desert3d-v2.html?asset=player&v=1&pose=forehand&phase=0.5（不给 phase 自动播放）
import type * as THREE from 'three';
import type { BaseCtx as AssetCtx } from '../../render/ctx';
import type { Pal } from '../../render/palette-base';
import { buildPerson, type Look } from './rig';

interface Outfit {
  skin: keyof Pal;
  shirt: keyof Pal;
  bottom: keyof Pal;
  bottomKind: Look['bottomKind'];
  hairStyle: Look['hairStyle'];
  cap?: keyof Pal;
  frame: keyof Pal;
}

const OUTFITS: Outfit[] = [
  {
    skin: 'skinLight',
    shirt: 'clothWhite',
    bottom: 'clothBlue',
    bottomKind: 'shorts',
    hairStyle: 'short',
    frame: 'clothRed',
  },
  {
    skin: 'skinDark',
    shirt: 'clothRed',
    bottom: 'clothWhite',
    bottomKind: 'skirt',
    hairStyle: 'ponytail',
    frame: 'clothBlue',
  },
  {
    skin: 'skinTan',
    shirt: 'clothBlue',
    bottom: 'clothWhite',
    bottomKind: 'shorts',
    hairStyle: 'cap',
    cap: 'clothWhite',
    frame: 'clothRed',
  },
  {
    skin: 'skinLight',
    shirt: 'clothTeal',
    bottom: 'clothWhite',
    bottomKind: 'skirt',
    hairStyle: 'ponytail',
    frame: 'clothBlue',
  },
];

export function build(ctx: AssetCtx): THREE.Object3D {
  const o = OUTFITS[((ctx.variant % OUTFITS.length) + OUTFITS.length) % OUTFITS.length];
  const m = (k: keyof Pal) => ctx.mat(k, PERSON);
  const root = buildPerson(
    ctx,
    {
      skin: m(o.skin),
      hair: ctx.mat('hair', { ...PERSON, edge: 0.25, convex: 0 }),
      shirt: m(o.shirt),
      bottom: m(o.bottom),
      bottomKind: o.bottomKind,
      shoes: m('clothWhite'),
      hairStyle: o.hairStyle,
      cap: o.cap ? m(o.cap) : undefined,
      hold: { kind: 'racket', frame: m(o.frame), strings: m('clothWhite'), grip: m('hair'), ball: ctx.mat('ball') },
    },
    `player-v${ctx.variant}`,
  );
  // 哪一种人（clubwalk 的演员表按它挑人；clubsite/people 包一层时同样写）
  root.userData.personKind = 'player';
  root.userData.personVariant = ctx.variant;
  return root;
}

/** 人物的明暗：太阳在画面后方，光往上偏多一点 → 头顶、肩亮，朝镜头的脸和胸落中档而不是全黑 */
export const PERSON = { lightUp: 0.6, bands: [-0.45, 0.3] as [number, number], noShadowReceive: true, edge: 0.45 };

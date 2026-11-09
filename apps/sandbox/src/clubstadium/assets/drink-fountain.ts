// #12 drink-fountain：复用 clubplaza 的饮水点（陶砖底座 + 灰泥方柱 + 花砖带 + 水盘）。
// 它用到两种 clubplaza 自己的颜色（fountainWater 水盘里的水、talavera 花砖）这个场景的调色板里没有：
// 这里包一层 ctx，缺的名字从 clubplaza 的调色板拿（三档 + 描边参数原样），其余照这个场景的 ctx.mat。
// userData 同 clubplaza（setState('ok' | 'clogged')、setRunning(on)、spots.drink）。
import type * as THREE from 'three';
import { build as plazaBuild } from '../../clubplaza/assets/drink-fountain';
import { PAL as PLAZA_PAL } from '../../clubplaza/palette';
import type { AssetCtx } from '../world';

type PlazaCtx = Parameters<typeof plazaBuild>[0];

export function build(ctx: AssetCtx): THREE.Object3D {
  const mat = (key: keyof typeof PLAZA_PAL, extra?: Parameters<AssetCtx['mat']>[1]) => {
    if (key in ctx.pal) return ctx.mat(key as keyof AssetCtx['pal'], extra);
    const sw = PLAZA_PAL[key];
    return ctx.mats.toon(0xffffff, { ramp: sw.ramp, edge: sw.edge, convex: sw.convex, tones: sw.tones, ...extra });
  };
  return plazaBuild({ ...ctx, pal: PLAZA_PAL, mat } as unknown as PlazaCtx);
}

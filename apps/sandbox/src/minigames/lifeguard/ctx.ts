// 泳池场景调色板（clubpool/palette.ts：clubplaza 的整张表 + 池水、躺椅垫、浮床）的资产上下文。
// clubpool 的 Region 不把自己的 kit 交出来，这里照 clubpool/scene.ts 的 ctxBase 建一份（只读 import 那边的表），
// 用来建场景复用的资产（clubpool/reuse.ts 的落叶、捞网）和这个小游戏自己的小东西（毛巾、杯子、救生圈、水花）。
import type { AssetCtx as PoolCtx } from '../../clubpool/ctx';
import { PAL, type Pal, PROXY } from '../../clubpool/palette';
import type { SharedUniforms } from '../../clubsite/render/ctx';
import { rngFactory } from '../../clubsite/render/noise';
import { schemeById, schemeMats, schemeOpts } from '../../clubsite/render/palettes';
import { createMats, type ToonOpts } from '../../clubsite/render/toon';

export type { PoolCtx };

export function poolCtx(
  uniforms: SharedUniforms,
  params: URLSearchParams,
  texelMeters: () => number,
  designTexel: number,
): (variant: number) => PoolCtx {
  const scheme = schemeById(params.get('pal'));
  const mats = createMats(uniforms, texelMeters);
  const palOpts = (key: keyof Pal, extra?: ToonOpts): ToonOpts => {
    const sw = PAL[key];
    const o: ToonOpts = {
      ramp: sw.ramp,
      edge: sw.edge,
      convex: sw.convex,
      tones: sw.tones,
      ...('opts' in sw ? (sw.opts as ToonOpts) : {}),
      ...extra,
    };
    if (!scheme) return o;
    const via = PROXY[key] ?? key;
    // biome-ignore lint/suspicious/noExplicitAny: 泳池新加的材质名不在核心的 Pal 里，按 PROXY 借组调色（同 clubpool/scene.ts）
    return schemeOpts(scheme, via as any, o as any) as ToonOpts;
  };
  const base = {
    mats: scheme ? schemeMats(scheme, mats) : mats,
    pal: PAL,
    mat: (key: keyof Pal, extra?: ToonOpts) => mats.toon(0xffffff, palOpts(key, extra)),
    rng: rngFactory(params.has('seed') ? Number(params.get('seed')) : 17),
    uniforms,
    layers: { FX: 1 },
    texel: designTexel,
    params,
  };
  return (variant: number) => ({ ...base, variant }) as PoolCtx;
}

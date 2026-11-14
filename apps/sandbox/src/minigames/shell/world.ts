// 小游戏壳的 3D 小工具：俱乐部调色板的资产上下文（建 clubsite 的人、球、球车……）、地上的圈（FX 层，不描边、不受光）。
import * as THREE from 'three';
import type { AssetCtx, SharedUniforms } from '../../clubsite/render/ctx';
import { rngFactory } from '../../clubsite/render/noise';
import { PAL, type Pal } from '../../clubsite/render/palette';
import { schemeById, schemeMats, schemeOpts } from '../../clubsite/render/palettes';
import { createMats, type ToonOpts } from '../../clubsite/render/toon';

/**
 * 俱乐部底表（clubsite/render/palette.ts）的资产上下文，配色方案（?pal=）照各场景的 kit 一样套。
 * clubsite 的资产（people 的 director / player / kid、assets 的 tennis-ball / ball-cart / ball-hopper / bench……）都能直接拿它建：
 *   import { build as ballCart } from '../../clubsite/assets/ball-cart';  const cart = ballCart(mg.ctx as never);
 * 场景自己的资产用场景的 kit（region.kit.makeAsset，有 kit 的场景才有）。
 */
export function clubCtx(
  uniforms: SharedUniforms,
  params: URLSearchParams,
  texelMeters: () => number,
  designTexel: number,
): AssetCtx {
  const scheme = schemeById(params.get('pal'));
  const mats = createMats(uniforms, texelMeters);
  const palOpts = (key: keyof Pal, extra?: ToonOpts): ToonOpts => {
    const sw = PAL[key];
    const o: ToonOpts = {
      ramp: sw.ramp,
      edge: sw.edge,
      convex: sw.convex,
      tones: sw.tones,
      ...('opts' in sw ? sw.opts : {}),
      ...extra,
    };
    return scheme ? schemeOpts(scheme, key, o) : o;
  };
  const seed = params.has('seed') ? Number(params.get('seed')) : 17;
  return {
    mats: scheme ? schemeMats(scheme, mats) : mats,
    pal: PAL,
    mat: (key, extra) => mats.toon(0xffffff, palOpts(key, extra)),
    rng: rngFactory(seed),
    uniforms,
    layers: { FX: 1 },
    texel: designTexel,
    variant: 0,
    params,
  };
}

/** 地上的圈（目标区、落点）：FX 层（只进颜色 pass：不描边、不投影、不受光），按像素风是一圈实心色块 */
export function groundRing(r: number, color: number | string = 0xffd23c, width = 0.14): THREE.Mesh {
  const geo = new THREE.RingGeometry(Math.max(0.01, r - width), r, 32, 1).rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false });
  const m = new THREE.Mesh(geo, mat);
  m.layers.set(1);
  m.renderOrder = 2;
  m.frustumCulled = false;
  m.name = 'mg:ring';
  return m;
}

// clubbuild 的素材工具箱：材质（配色方案 ?pal=）、资产上下文、建模型（有模型用模型，没有用灰盒占位）。画廊和游戏共用。
import * as THREE from 'three';
import type { SharedUniforms } from '../clubsite/render/ctx';
import { box } from '../clubsite/render/geo';
import { rngFactory } from '../clubsite/render/noise';
import { schemeById, schemeMats, schemeOpts } from '../clubsite/render/palettes';
import { createMats, type ToonOpts } from '../clubsite/render/toon';
import { REUSED } from '../clubsite/reuse';
import { MODELS } from './assets';
import { BY_ID, TILE } from './catalog';
import type { AssetBuild, AssetCtx } from './ctx';
import { PAL, type Pal } from './palette';
import { PROXY } from './palette-grounds';

export type Kind = 'own' | 'reused' | 'placeholder';

export interface Kit {
  ctxFor(variant: number): AssetCtx;
  makeAsset(id: string, variant?: number): { obj: THREE.Object3D; kind: Kind };
  palOpts(key: keyof Pal, extra?: ToonOpts): ToonOpts;
}

export function createKit(opts: {
  uniforms: SharedUniforms;
  params: URLSearchParams;
  texelMeters: () => number;
  designTexel: number;
}): Kit {
  const { params } = opts;
  const num = (k: string, d: number) => (params.has(k) ? Number(params.get(k)) : d);
  const rng = rngFactory(num('seed', 23));
  const scheme = schemeById(params.get('pal'));
  const mats = createMats(opts.uniforms, opts.texelMeters);
  // 影子毛边：0.8 是按 0.045～0.09 米/纹素调的；这里 0.149 米/纹素，一纹素一个锯齿 → 影子边碎成麻点（美术 r1 第 5 条）
  mats.globals.uFur.value = num('fur', 0.3);
  function palOpts(key: keyof Pal, extra?: ToonOpts): ToonOpts {
    const sw = PAL[key] as (typeof PAL)[keyof Pal] & { opts?: ToonOpts };
    const o: ToonOpts = {
      ramp: sw.ramp,
      edge: sw.edge,
      convex: sw.convex,
      tones: sw.tones,
      ...('opts' in sw ? sw.opts : {}),
      ...extra,
    };
    // 新材质名不在配色方案的 GROUP 表里：PROXY 里的借同组的名字过调色（颜色还是自己的），别的按全局调色走
    const via = (PROXY[key as string] ?? key) as keyof Pal;
    // biome-ignore lint/suspicious/noExplicitAny: clubbuild 的表是渲染核心表的超集
    return scheme ? (schemeOpts(scheme, via as any, o as any) as ToonOpts) : o;
  }
  const ctxBase = {
    mats: scheme ? schemeMats(scheme, mats) : mats,
    pal: PAL,
    mat(key: keyof Pal, extra?: ToonOpts) {
      return mats.toon(0xffffff, palOpts(key, extra));
    },
    rng,
    uniforms: opts.uniforms,
    layers: { FX: 1 },
    texel: opts.designTexel,
    params,
  };
  const ctxFor = (variant: number): AssetCtx => ({ ...ctxBase, variant });
  function makeAsset(id: string, variant = 0): { obj: THREE.Object3D; kind: Kind } {
    const own = MODELS[id];
    if (own) return { obj: own(ctxFor(variant)), kind: 'own' };
    const reused = (REUSED as unknown as Record<string, AssetBuild>)[id];
    if (reused) return { obj: reused(ctxFor(variant)), kind: 'reused' };
    return { obj: placeholder(ctxFor(variant), id), kind: 'placeholder' };
  }
  return { ctxFor, makeAsset, palOpts };
}

/** 灰盒：按 catalog 的占地画一块（球场类矮、房子类高），不认识的 id 画 1 米方块 */
export function placeholder(ctx: AssetCtx, id: string): THREE.Object3D {
  const def = BY_ID[id];
  const g = new THREE.Group();
  g.name = `placeholder:${id}`;
  const w = def ? def.w * TILE - 0.4 : 1;
  const d = def ? def.d * TILE - 0.4 : 1;
  const h = !def ? 1 : def.cat === 'court' || def.cat === 'road' ? 0.15 : def.cat === 'deco' ? 1.5 : 4;
  const m = new THREE.Mesh(box(w, h, d, 0, 0, 0), ctx.mat('tile'));
  m.castShadow = m.receiveShadow = true;
  g.add(m);
  ctx.mats.prepare(g);
  return g;
}

// clubpark 的场景模块（clubsite/region.ts 的 Region）：资产、调色、地形、摆件、停车场的日常（life.ts）、总监的活（play.ts）。
// 独立页面（main.ts）和大世界（src/clubwalk）都从这里建；main.ts 只剩页面的壳。
import * as THREE from 'three';
import { director as clubDirector } from '../clubsite/people';
import type { Play } from '../clubsite/play';
import type { Region, RegionHost } from '../clubsite/region';
import type { BaseCtx as D3Ctx } from '../clubsite/render/ctx';
import { rngFactory } from '../clubsite/render/noise';
import type { Pal as ClubPal } from '../clubsite/render/palette';
import { schemeById, schemeMats, schemeOpts } from '../clubsite/render/palettes';
import { createMats, type Mats, type ToonOpts } from '../clubsite/render/toon';
import { DRIVE, GATE } from '../clubsite/world';
import type { AssetBuild, AssetCtx } from './ctx';
import { AISLE_Z, SLOTS, WALL_OUT } from './layout';
import { createParkLife, type ParkLife } from './life';
import { buildNav } from './nav';
import { PAL, type Pal } from './palette';
import { placeholder, SPECS } from './placeholders';
import { attachParkJobs, PARK_START, parkNav } from './play';
import { REUSED } from './reuse';
import { buildTerrain, type Terrain } from './terrain';

/** 这个场景自己画的资产（assets/<id>.ts，export function build）；同名的优先于复用的 */
const MODS = import.meta.glob<{ build: AssetBuild }>('./assets/*.ts', { eager: true });
export const OWN: Record<string, AssetBuild> = {};
for (const [path, mod] of Object.entries(MODS)) {
  const id = path.replace('./assets/', '').replace(/\.ts$/, '');
  if (typeof mod.build === 'function') OWN[id] = mod.build;
}

export type Kind = 'own' | 'reused' | 'placeholder';

/** 资产上下文、调色、建资产（画廊也用） */
export interface ParkKit {
  mats: Mats;
  ctxFor(variant: number): AssetCtx;
  makeAsset(asset: string, variant: number): { obj: THREE.Object3D; kind: Kind };
  palOpts(key: keyof Pal, extra?: ToonOpts): ToonOpts;
}

export function createParkKit(
  host: Pick<RegionHost, 'uniforms' | 'params' | 'texelMeters' | 'designTexel'>,
  opts: { gallery?: boolean } = {},
): ParkKit {
  const { params } = host;
  const num = (k: string, d: number) => (params.has(k) ? Number(params.get(k)) : d);
  const rng = rngFactory(num('seed', 17));
  /** 配色：不带 ?pal = 6 午后金光（golden）；pal=current = 原来的沙漠配色 */
  const scheme = schemeById(params.get('pal'));
  const mats = createMats(host.uniforms, host.texelMeters);
  /**
   * 调色板名字 → 材质参数；配色方案（默认 golden）在这里换色。
   * 停车场新加的名字不在 palettes/index.ts 的 GROUP 表里 → 只吃方案的全局 grade（见 palette.ts 开头）。
   */
  function palOpts(key: keyof Pal, extra?: ToonOpts): ToonOpts {
    const sw = PAL[key];
    const o: ToonOpts = {
      ramp: sw.ramp,
      edge: sw.edge,
      convex: sw.convex,
      tones: sw.tones,
      ...('opts' in sw ? sw.opts : {}),
      ...extra,
    };
    return scheme ? schemeOpts(scheme, key as keyof ClubPal, o) : o;
  }
  const ctxBase = {
    mats: scheme ? schemeMats(scheme, mats) : mats,
    pal: PAL,
    mat(key: keyof Pal, extra?: ToonOpts) {
      return mats.toon(0xffffff, palOpts(key, extra));
    },
    rng,
    uniforms: host.uniforms,
    layers: { FX: 1 },
    texel: host.designTexel,
    params,
  };
  const ctxFor = (variant: number): AssetCtx => ({ ...ctxBase, variant });
  function makeAsset(asset: string, variant: number): { obj: THREE.Object3D; kind: Kind } {
    // 总监：clubsite/people 的那个（玩法模块要它的 hold / handPoint）
    if (asset === 'director' && !opts.gallery)
      return { obj: clubDirector(ctxFor(variant) as unknown as D3Ctx), kind: 'reused' };
    const own = OWN[asset];
    if (own) return { obj: own(ctxFor(variant)), kind: 'own' };
    const reused = REUSED[asset];
    if (reused) return { obj: reused(ctxFor(variant)), kind: 'reused' };
    return { obj: placeholder(ctxFor(variant), asset), kind: 'placeholder' };
  }
  return { mats, ctxFor, makeAsset, palOpts };
}

/** life.ts 自己建、自己动的 SLOTS（白模里定格的车、人、停着的车） */
const LIFE_SLOTS = new Set([
  'car-dropoff',
  'member-driver',
  'valet',
  'doorman',
  'member-walk',
  'member-n',
  'member-lot',
  'car-arrive',
  'car-search',
  'car-leave',
]);

/** 区域名（米黄标签） */
const ZONES: [string, number, number, number][] = [
  ['大门（东墙）', GATE.x + 1.4, 6.6, -2.4],
  ['落客区', 63.0, 0.4, 0.6],
  ['车道 → 往东出画', 92, 0.4, (DRIVE.z0 + DRIVE.z1) / 2 + 0.2],
  ['北停车场', 70.5, 0.6, AISLE_Z.n + 2.6],
  ['南停车场', 70.5, 0.6, AISLE_Z.s + 2.2],
  ['墙里（clubdesk 场景）', WALL_OUT - 4.5, 0.4, 13.5],
  ['北台地 +1.2', 88, 1.6, -30.5],
  ['南低地 −1.0', 88, -0.6, 31.5],
];

export interface ParkRegion extends Region {
  readonly kit: ParkKit;
  readonly life: ParkLife | undefined;
  readonly terrain: Terrain;
}

export function createParkRegion(host: RegionHost, kit = createParkKit(host)): ParkRegion {
  const { parent, params } = host;
  const LIFE = host.life;
  const label = host.label;
  const { ctxFor, makeAsset } = kit;
  const updaters: ((dt: number, t: number) => void)[] = [];
  const collectUpdaters = (o: THREE.Object3D) =>
    o.traverse((c) => {
      const u = c.userData.update as ((dt: number, t: number) => void) | undefined;
      if (u) updaters.push(u);
    });
  const counts: Record<Kind, number> = { own: 0, reused: 0, placeholder: 0 };
  let life: ParkLife | undefined;
  let play: Play | null = null;

  // ── 建场景 ──
  const ctx = ctxFor(0);
  const terrain = buildTerrain(ctx);
  parent.add(terrain.root);
  const showPh = params.get('ph') !== '0';
  for (const s of SLOTS) {
    if (LIFE && (LIFE_SLOTS.has(s.id) || s.id.startsWith('park-'))) continue;
    // 大世界：总监只有一个（clubwalk 建的）
    if (s.id === 'director' && host.director) continue;
    const { obj, kind } = makeAsset(s.asset, s.variant ?? 0);
    if (kind === 'placeholder' && !showPh) continue;
    counts[kind]++;
    const x = s.x;
    const y = s.y ?? terrain.groundAt(x, s.z);
    obj.position.set(x, y, s.z);
    obj.rotation.y = s.rotY ?? 0;
    obj.scale.setScalar(s.s ?? 1);
    obj.name = `slot:${s.id}`;
    if (s.prop !== undefined) obj.userData.setProp?.(s.prop);
    if (s.pose) obj.userData.pose?.(s.pose[0], s.pose[1]);
    parent.add(obj);
    collectUpdaters(obj);
    if (!label) continue;
    const sp = SPECS[s.asset];
    // 停着的车太多：标签只给"一类"的第一辆，其余不标
    if (s.id.startsWith('park-') && s.id !== 'park-n-near-0') continue;
    label(s.id, new THREE.Vector3(x, y + (sp?.h ?? 1) * (s.s ?? 1) + 0.3, s.z), kind);
  }
  if (label) {
    for (const [text, x, y, z] of ZONES) label(text, new THREE.Vector3(x, y, z), 'zone');
    if (params.get('nav') !== '0') parent.add(buildNav(ctx, terrain.groundAt));
  }
  if (LIFE) {
    life = createParkLife({
      ctx,
      scene: parent,
      make: (asset, variant) => makeAsset(asset, variant).obj,
      groundAt: terrain.groundAt,
      find: (id) => (id === 'director' && host.director ? host.director : parent.getObjectByName(`slot:${id}`)),
      parked: SLOTS.filter((s) => s.id.startsWith('park-')).map((s) => ({
        id: s.id,
        asset: s.asset,
        x: s.x,
        z: s.z,
        rotY: s.rotY ?? 0,
        variant: s.variant ?? 0,
      })),
      play: host.play,
      director: () => play?.director ?? null,
      onSay: (obj, text, sec) => play?.say(obj, text, sec),
    });
  }

  return {
    id: 'clubpark',
    root: parent,
    kit,
    life,
    terrain,
    groundAt: terrain.groundAt,
    nav: parkNav,
    director: () => host.director ?? parent.getObjectByName('slot:director') ?? null,
    start: PARK_START,
    update(dt, t) {
      for (const u of updaters) u(dt, t);
      life?.update(dt);
    },
    attach(p) {
      play = p;
      return attachParkJobs(p, { scene: parent, ctx, life });
    },
    counts,
    debug: { own: Object.keys(OWN), reused: Object.keys(REUSED), palOpts: kit.palOpts, life, terrain },
  };
}

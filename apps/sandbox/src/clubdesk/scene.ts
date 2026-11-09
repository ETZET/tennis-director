// clubdesk 的场景模块（clubsite/region.ts 的 Region）：资产、调色、地形、摆件、前台日常（life.ts）、总监的活（play.ts）。
// 独立页面（main.ts）和大世界（src/clubwalk）都从这里建；main.ts 只剩页面的壳。
import type * as THREE from 'three';
import { Vector3 } from 'three';
import type { Region, RegionHost } from '../clubsite/region';
import { rngFactory } from '../clubsite/render/noise';
import { schemeById, schemeMats, schemeOpts } from '../clubsite/render/palettes';
import { createMats, type ToonOpts } from '../clubsite/render/toon';
import type { AssetBuild, AssetCtx } from './ctx';
import { AREA_LABELS, SLOTS, SPOTS } from './layout';
import { createDeskLife, type DeskLife } from './life';
import { buildNav, SPOT_NAMES } from './nav';
import { PAL, type Pal } from './palette';
import { NEW_SPECS, placeholder, SPECS } from './placeholders';
import { attachDeskJobs, DESK_START, deskNav } from './play';
import { REUSED } from './reuse';
import { buildTerrain } from './terrain';

/** 这个场景自己画的资产（assets/<id>.ts，export function build）；同名的优先于复用的 */
const MODS = import.meta.glob<{ build: AssetBuild }>('./assets/*.ts', { eager: true });
export const OWN: Record<string, AssetBuild> = {};
for (const [path, mod] of Object.entries(MODS)) {
  const id = path.replace('./assets/', '').replace(/\.ts$/, '');
  if (typeof mod.build === 'function') OWN[id] = mod.build;
}

export type Kind = 'own' | 'reused' | 'placeholder' | 'spot' | 'area' | 'propose';

/** 资产上下文、调色、建资产（画廊也用） */
export interface DeskKit {
  ctxFor(variant: number): AssetCtx;
  makeAsset(asset: string, variant: number): { obj: THREE.Object3D; kind: Kind };
  palOpts(key: keyof Pal, extra?: ToonOpts): ToonOpts;
}

export function createDeskKit(host: Pick<RegionHost, 'uniforms' | 'params' | 'texelMeters' | 'designTexel'>): DeskKit {
  const { params } = host;
  const num = (k: string, d: number) => (params.has(k) ? Number(params.get(k)) : d);
  const rng = rngFactory(num('seed', 17));
  /** 配色：不带 ?pal = 默认（6 午后金光 golden）；?pal=current = 原来的沙漠配色 */
  const scheme = schemeById(params.get('pal'));
  const mats = createMats(host.uniforms, host.texelMeters);
  /** 调色板名字 → 材质参数；配色（?pal=）在这里换色。新加的 granite / slate / brass 不在 clubfront 的 GROUP 表里 → 只吃全局调色 */
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
    // biome-ignore lint/suspicious/noExplicitAny: 这个场景新加的材质名不在 clubfront 的 Pal 里，按全局调色走
    return scheme ? (schemeOpts(scheme, key as any, o as any) as ToonOpts) : o;
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
    const own = OWN[asset];
    if (own) return { obj: own(ctxFor(variant)), kind: 'own' };
    const reused = REUSED[asset];
    if (reused) return { obj: reused(ctxFor(variant)), kind: 'reused' };
    return { obj: placeholder(ctxFor(variant), asset), kind: 'placeholder' };
  }
  return { ctxFor, makeAsset, palOpts };
}

/** 占位的标签："#编号 名字" */
const phText = (asset: string, id: string) => {
  const sp = NEW_SPECS[asset];
  return sp?.n ? `#${sp.n} ${sp.name ?? asset}` : id;
};

export interface DeskRegion extends Region {
  readonly kit: DeskKit;
  readonly life: DeskLife | null;
}

export function createDeskRegion(host: RegionHost, kit = createDeskKit(host)): DeskRegion {
  const { parent, params } = host;
  const label = host.label;
  const { ctxFor, makeAsset } = kit;
  const updaters: ((dt: number, t: number) => void)[] = [];
  const collectUpdaters = (o: THREE.Object3D) =>
    o.traverse((c) => {
      const u = c.userData.update as ((dt: number, t: number) => void) | undefined;
      if (u) updaters.push(u);
    });
  const slot = (id: string): THREE.Object3D | undefined =>
    id === 'director' && host.director ? host.director : parent.getObjectByName(`slot:${id}`);

  let groundAt: (x: number, z: number) => number = () => 0;
  const counts: Record<string, number> = { own: 0, reused: 0, placeholder: 0 };

  // ── 建场景 ──
  {
    const ctx = ctxFor(0);
    const terrain = buildTerrain(ctx);
    parent.add(terrain.root);
    groundAt = terrain.groundAt;
    const showPh = params.get('ph') !== '0';
    const labelled = new Set<string>();
    for (const s of SLOTS) {
      // 大世界：总监只有一个（clubwalk 建的）
      if (s.id === 'director' && host.director) continue;
      const { obj, kind } = makeAsset(s.asset, s.variant ?? 0);
      if (kind === 'placeholder' && !showPh) continue;
      counts[kind]++;
      const y = s.y ?? terrain.groundAt(s.x, s.z);
      obj.position.set(s.x, y, s.z);
      obj.rotation.y = s.rotY ?? 0;
      obj.scale.setScalar(s.s ?? 1);
      obj.name = `slot:${s.id}`;
      if (s.prop !== undefined) obj.userData.setProp?.(s.prop);
      if (s.pose) obj.userData.pose?.(s.pose[0], s.pose[1]);
      parent.add(obj);
      collectUpdaters(obj);
      if (!label) continue;
      const sp = SPECS[s.asset];
      const top = new Vector3(s.x, y + (sp?.h ?? 1) * (s.s ?? 1) + 0.3, s.z);
      if (kind === 'placeholder' || kind === 'own')
        label(phText(s.asset, s.id), s.labelBelow ? new Vector3(s.x, y, s.z) : top, kind, s.labelBelow);
      else if (s.label) label(s.label, top, kind);
      else if (!labelled.has(s.asset) && !['player', 'agave', 'brittlebush', 'creosote', 'bench'].includes(s.asset)) {
        labelled.add(s.asset);
        label(s.asset, top, kind);
      }
    }
    // 围网已经是真资产（assets/fence-screen），不再标占位
    if (label) {
      for (const a of AREA_LABELS) label(a.text, new Vector3(a.x, a.y, a.z), a.kind ?? 'area');
      if (params.get('nav') !== '0') {
        parent.add(buildNav(ctx, terrain.groundAt));
        for (const [k, name] of Object.entries(SPOT_NAMES)) {
          const [x, z] = SPOTS[k as keyof typeof SPOTS];
          label(name, new Vector3(x, terrain.groundAt(x, z) + 0.05, z + 0.3), 'spot');
        }
      }
    }
  }

  // ── 前台的日常（?life=0 = 白模定格）。life 把 slot:director 换成 clubsite/people 的总监（play 的 hold() 要它；大世界用共用的） ──
  const life = host.life
    ? createDeskLife({
        ctx: ctxFor(0),
        scene: parent,
        make: (a, v) => makeAsset(a, v).obj,
        groundAt,
        play: host.play,
        director: host.director,
      })
    : null;
  if (life) updaters.push((dt) => life.update(dt));

  return {
    id: 'clubdesk',
    root: parent,
    kit,
    life,
    groundAt: (x, z) => groundAt(x, z),
    nav: () => deskNav(parent),
    director: () => slot('director') ?? null,
    start: DESK_START,
    update(dt, t) {
      for (const u of updaters) u(dt, t);
    },
    attach(play) {
      const jobs = attachDeskJobs(play, { scene: parent, ctx: ctxFor(0) });
      // life 用同 id 替换 play.ts 的样板互动点
      if (life) life.attachPlay(play);
      return jobs;
    },
    counts,
    debug: { own: Object.keys(OWN), reused: Object.keys(REUSED), palOpts: kit.palOpts, life },
  };
}

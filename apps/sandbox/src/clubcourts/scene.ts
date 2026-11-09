// clubcourts 的场景模块（clubsite/region.ts 的 Region）：资产、调色（GROUP_AS 借组）、地形、摆件、会员场和青训的日常（life.ts）、总监的活（play.ts）。
// 独立页面（main.ts）和大世界（src/clubwalk）都从这里建；main.ts 只剩页面的壳。
import * as THREE from 'three';
import type { Play } from '../clubsite/play';
import type { Region, RegionHost } from '../clubsite/region';
import { rngFactory } from '../clubsite/render/noise';
import { schemeById, schemeMats, schemeOpts } from '../clubsite/render/palettes';
import { createMats, type ToonOpts } from '../clubsite/render/toon';
import type { AssetBuild, AssetCtx } from './ctx';
import { AREA_LABELS, SLOTS, SPOTS } from './layout';
import { type CourtsLife, createLife } from './life';
import { buildNav, SPOT_NAMES } from './nav';
import { GROUP_AS, PAL, type Pal } from './palette';
import { NEW_SPECS, placeholder, SPECS } from './placeholders';
import { COURTS_START, courtsNav, registerCourtsJobs } from './play';
import { REUSED } from './reuse';
import { buildTerrain } from './terrain';

/** 这个场景自己画的资产（assets/<id>.ts，export function build）；同名的优先于复用的 */
const MODS = import.meta.glob<{ build: AssetBuild }>('./assets/*.ts', { eager: true });
export const OWN: Record<string, AssetBuild> = {};
for (const [path, mod] of Object.entries(MODS)) {
  const id = path.replace('./assets/', '').replace(/\.ts$/, '');
  if (typeof mod.build === 'function') OWN[id] = mod.build;
}

export type Kind = 'own' | 'reused' | 'placeholder' | 'spot' | 'area' | 'propose' | 'state';

/** 资产上下文、调色、建资产（画廊也用） */
export interface CourtsKit {
  ctxFor(variant: number): AssetCtx;
  makeAsset(asset: string, variant: number): { obj: THREE.Object3D; kind: Kind };
  palOpts(key: keyof Pal, extra?: ToonOpts): ToonOpts;
}

export function createCourtsKit(
  host: Pick<RegionHost, 'uniforms' | 'params' | 'texelMeters' | 'designTexel'>,
): CourtsKit {
  const { params } = host;
  const num = (k: string, d: number) => (params.has(k) ? Number(params.get(k)) : d);
  const rng = rngFactory(num('seed', 17));
  /** 配色：不带 ?pal = 默认（6 午后金光 golden）；?pal=current = 原来的沙漠配色 */
  const scheme = schemeById(params.get('pal'));
  const mats = createMats(host.uniforms, host.texelMeters);
  /** 调色板名字 → 材质参数；配色（?pal=）在这里换色。新名字（湿的硬地）按 GROUP_AS 借同一家颜色的组（court / surround）调色 */
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
    // biome-ignore lint/suspicious/noExplicitAny: 这个场景新加的材质名不在 clubfront 的 Pal 里：借组（GROUP_AS），没借的按全局调色走
    return scheme ? (schemeOpts(scheme, (GROUP_AS[key] ?? key) as any, o as any) as ToonOpts) : o;
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

export interface CourtsRegion extends Region {
  readonly kit: CourtsKit;
  /** 日常：独立页面要先 mountPlay 再建（同 clubplaza），所以分开 */
  startLife(play: Play | null): CourtsLife | null;
  readonly life: CourtsLife | null;
  /** SLOTS 建出来的对象（id → 对象） */
  readonly objs: Map<string, THREE.Object3D>;
  post(dt: number, t: number): void;
}

export function createCourtsRegion(host: RegionHost, kit = createCourtsKit(host)): CourtsRegion {
  const { parent, params } = host;
  const label = host.label;
  const { ctxFor, makeAsset } = kit;
  const updaters: ((dt: number, t: number) => void)[] = [];
  const collectUpdaters = (o: THREE.Object3D) =>
    o.traverse((c) => {
      const u = c.userData.update as ((dt: number, t: number) => void) | undefined;
      if (u) updaters.push(u);
    });
  const objs = new Map<string, THREE.Object3D>();
  if (host.director) objs.set('director', host.director);
  let life: CourtsLife | null = null;
  let jobs: { update(dt: number): void } | null = null;
  const counts: Record<string, number> = { own: 0, reused: 0, placeholder: 0 };

  // ── 建场景 ──
  const ctx = ctxFor(0);
  const terrain = buildTerrain(ctx);
  parent.add(terrain.root);
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
    objs.set(s.id, obj);
    if (s.prop !== undefined) obj.userData.setProp?.(s.prop);
    if (s.pose) obj.userData.pose?.(s.pose[0], s.pose[1]);
    for (const [fn, ...args] of s.call ?? []) obj.userData[fn]?.(...args);
    parent.add(obj);
    collectUpdaters(obj);
    if (!label) continue;
    const sp = SPECS[s.asset];
    const top = new THREE.Vector3(s.x, y + (sp?.h ?? 1) * (s.s ?? 1) + 0.3, s.z);
    if (kind === 'placeholder' || kind === 'own') {
      // 同一种占位只贴一次编号（灯杆 16 根、球十几个……）
      if (labelled.has(s.asset)) continue;
      labelled.add(s.asset);
      label(phText(s.asset, s.id), s.labelBelow ? new THREE.Vector3(s.x, y, s.z) : top, kind, s.labelBelow);
    } else if (s.label) label(s.label, top, kind);
    else if (
      !labelled.has(s.asset) &&
      !['player', 'kid', 'agave', 'brittlebush', 'creosote', 'bench', 'court-light', 'smoke-tree'].includes(s.asset)
    ) {
      labelled.add(s.asset);
      label(s.asset, top, kind);
    }
  }
  if (label) {
    // 硬地场面（#1）在白模里是地形画的：标签贴在场角
    label('fence-screen（clubdesk）', new THREE.Vector3(-8.5, 2.8, 16.7), 'reused');
    for (const a of AREA_LABELS) label(a.text, new THREE.Vector3(a.x, a.y, a.z), a.kind ?? 'area');
    if (params.get('nav') !== '0') {
      parent.add(buildNav(ctx, terrain.groundAt));
      for (const [k, name] of Object.entries(SPOT_NAMES)) {
        const [x, z] = SPOTS[k as keyof typeof SPOTS];
        label(name, new THREE.Vector3(x, terrain.groundAt(x, z) + 0.05, z + 0.3), 'spot');
      }
    }
  }
  const make = (a: string, v: number) => makeAsset(a, v).obj;

  const region: CourtsRegion = {
    id: 'clubcourts',
    root: parent,
    kit,
    get life() {
      return life;
    },
    startLife() {
      if (!host.life || life) return life;
      life = createLife({ ctx: ctxFor(0), scene: parent, objs, make, play: host.play });
      return life;
    },
    objs,
    groundAt: terrain.groundAt,
    nav: () => courtsNav(objs),
    director: () => objs.get('director') ?? null,
    start: COURTS_START,
    update() {},
    // 原来的顺序：play.update → life.update → 总监的活 → 资产的 update
    post(dt, t) {
      life?.update(dt);
      jobs?.update(dt);
      for (const u of updaters) u(dt, t);
    },
    attach(play) {
      // 大世界：日常在第一次 attach 的时候建（play 早就有了）
      if (!life) region.startLife(play);
      if (!life) return null;
      jobs = registerCourtsJobs(play, life, { objs, make });
      return { step: () => {} };
    },
    counts,
    debug: { own: Object.keys(OWN), reused: Object.keys(REUSED), palOpts: kit.palOpts },
  };
  return region;
}

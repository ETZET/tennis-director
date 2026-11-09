// clubclay 的场景模块（clubsite/region.ts 的 Region）：资产、调色、地形、摆件、近场比赛的演出（life.ts）、远场维护（play.ts）。
// 独立页面（main.ts）和大世界（src/clubwalk）都从这里建；main.ts 只剩页面的壳。
import * as THREE from 'three';
import type { Region, RegionHost, RegionStart } from '../clubsite/region';
import { rngFactory } from '../clubsite/render/noise';
import { schemeById, schemeMats, schemeOpts } from '../clubsite/render/palettes';
import { createMats, type ToonOpts } from '../clubsite/render/toon';
import type { AssetBuild, AssetCtx } from './ctx';
import { AREA_LABELS, NAV_BOUNDS, PLAY_VIEW, SLOTS, type Slot, SPOTS } from './layout';
import { type ClayLife, createLife } from './life';
import { buildNav, SPOT_NAMES } from './nav';
import { PAL, type Pal } from './palette';
import { NEW_SPECS, placeholder, SPECS } from './placeholders';
import { type ClayPlay, type FarClay, navShapes, setupClayPlay } from './play';
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
export interface ClayKit {
  ctxFor(variant: number): AssetCtx;
  makeAsset(asset: string, variant: number): { obj: THREE.Object3D; kind: Kind };
  palOpts(key: keyof Pal, extra?: ToonOpts): ToonOpts;
}

export function createClayKit(host: Pick<RegionHost, 'uniforms' | 'params' | 'texelMeters' | 'designTexel'>): ClayKit {
  const { params } = host;
  const num = (k: string, d: number) => (params.has(k) ? Number(params.get(k)) : d);
  const rng = rngFactory(num('seed', 17));
  /** 配色：不带 ?pal = 默认（6 午后金光 golden）；?pal=current = 原来的沙漠配色 */
  const scheme = schemeById(params.get('pal'));
  const mats = createMats(host.uniforms, host.texelMeters);
  /** 调色板名字 → 材质参数；配色（?pal=）在这里换色。红土几种状态、胶带线不在 clubfront 的 GROUP 表里 → 只吃全局调色（底色已经按调完的样子挑） */
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

/** 独立页面的开局（main.ts 的 mountPlay） */
export const CLAY_START: RegionStart = {
  start: SPOTS.dragNow,
  yaw: -Math.PI / 2,
  camera: { lead: { portrait: 5, landscape: 4 }, view: PLAY_VIEW },
  hint: '拖动走路 · 点地面走过去 · 远场：拖垫、扫线刷、水管',
};

export interface ClayRegion extends Region {
  readonly kit: ClayKit;
  readonly life: ClayLife | null;
  readonly clayPlay: ClayPlay | null;
  /** SLOTS 建出来的对象（id → 对象） */
  readonly objs: Map<string, THREE.Object3D>;
}

export function createClayRegion(host: RegionHost, kit = createClayKit(host)): ClayRegion {
  const { parent, params } = host;
  const label = host.label;
  const { ctxFor, makeAsset } = kit;
  const updaters: ((dt: number, t: number) => void)[] = [];
  const collectUpdaters = (o: THREE.Object3D) =>
    o.traverse((c) => {
      const u = c.userData.update as ((dt: number, t: number) => void) | undefined;
      if (u) updaters.push(u);
    });
  /** SLOTS 建出来的对象（id → 对象）：演出和玩法按 id 接管 */
  const objs = new Map<string, THREE.Object3D>();
  if (host.director) objs.set('director', host.director);
  let life: ClayLife | null = null;
  let clayPlay: ClayPlay | null = null;
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
    parent.add(obj);
    applyPerson(obj, s);
    collectUpdaters(obj);
    if (!label) continue;
    const sp = SPECS[s.asset];
    const top = new THREE.Vector3(s.x, y + (sp?.h ?? 1) * (s.s ?? 1) + 0.3, s.z);
    if (kind === 'placeholder' || kind === 'own') {
      // 同一种占位只贴一次编号（灯杆 12 根、伞 3 把……）
      if (labelled.has(s.asset)) continue;
      labelled.add(s.asset);
      label(phText(s.asset, s.id), s.labelBelow ? new THREE.Vector3(s.x, y, s.z) : top, kind, s.labelBelow);
    } else if (s.label) label(s.label, top, kind);
    else if (
      !labelled.has(s.asset) &&
      !['player', 'agave', 'brittlebush', 'creosote', 'bench', 'court-light'].includes(s.asset)
    ) {
      labelled.add(s.asset);
      label(s.asset, top, kind);
    }
  }
  if (label) {
    // 红土场面（#1）和水管（#7 的一部分）在白模里是地形画的：标签贴在场角
    label('#7 水管', new THREE.Vector3(24.6, 0.1, 22.4), 'placeholder', true);
    label('fence-screen（clubdesk）', new THREE.Vector3(30.5, 2.8, 33.8), 'reused');
    for (const a of AREA_LABELS) label(a.text, new THREE.Vector3(a.x, a.y, a.z), a.kind ?? 'area');
    if (params.get('nav') !== '0') {
      parent.add(buildNav(ctx, terrain.groundAt));
      for (const [k, name] of Object.entries(SPOT_NAMES)) {
        const [x, z] = SPOTS[k as keyof typeof SPOTS];
        label(name, new THREE.Vector3(x, terrain.groundAt(x, z) + 0.05, z + 0.3), 'spot');
      }
    }
  }
  if (host.life) {
    life = createLife({ ctx, scene: parent, objs, near: objs.get('clay-near')?.userData.clay ?? null });
    const l = life;
    updaters.push((dt) => l.update(dt));
  }

  /** 人物的 SLOT 字段：坐（setSeat）、绞盘（setCrank，要世界坐标 → 放进场景以后）、看哪里（lookAt） */
  function applyPerson(obj: THREE.Object3D, s: Slot) {
    const ud = obj.userData;
    if (s.seat) ud.setSeat?.(s.seat[0], s.seat[1] ?? 0);
    obj.updateMatrixWorld(true);
    if (s.crank) ud.setCrank?.(new THREE.Vector3(...s.crank));
    if (s.look) ud.lookAt?.(new THREE.Vector3(...s.look));
  }

  const far = objs.get('clay-far')?.userData.clay as FarClay | undefined;
  return {
    id: 'clubclay',
    root: parent,
    kit,
    get life() {
      return life;
    },
    get clayPlay() {
      return clayPlay;
    },
    objs,
    groundAt: terrain.groundAt,
    nav: () => ({ bounds: NAV_BOUNDS, ...navShapes(objs) }),
    director: () => objs.get('director') ?? null,
    start: CLAY_START,
    // 原来的顺序：play.update → clayPlay.update → 资产的 update + life（都在总监动完以后）
    update() {},
    post(dt, t) {
      for (const u of updaters) u(dt, t);
    },
    attach(play) {
      if (!life || !far) return null;
      const cp = setupClayPlay({
        play,
        objs,
        life,
        far,
        near: objs.get('clay-near')?.userData.clay ?? null,
        ctx,
        scene: parent,
      });
      clayPlay = cp;
      return { step: (dt) => cp.update(dt) };
    },
    counts,
    debug: { own: Object.keys(OWN), reused: Object.keys(REUSED), palOpts: kit.palOpts },
  };
}

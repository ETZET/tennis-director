// clubstadium 的场景模块（clubsite/region.ts 的 Region）：资产、调色（PROXY 借组）、地形、看台、摆件、比赛演出（life.ts）、
// 总监的活（play.ts）。独立页面（main.ts）和大世界（src/clubwalk）都从这里建；main.ts 只剩页面的壳。
import * as THREE from 'three';
import type { Play } from '../clubsite/play';
import type { Region, RegionHost, RegionStart } from '../clubsite/region';
import { rngFactory } from '../clubsite/render/noise';
import { schemeById, schemeMats, schemeOpts } from '../clubsite/render/palettes';
import { createMats, type ToonOpts } from '../clubsite/render/toon';
import type { AssetBuild, AssetCtx } from './ctx';
import { AREA_LABELS, NAV_BOUNDS, PLAY_VIEW, PLAY_WALK, SLOTS, SPOTS, STAND_RAMPS } from './layout';
import { createLife, type StadiumLife } from './life';
import { buildNav, SPOT_NAMES } from './nav';
import { PAL, type Pal, PROXY } from './palette';
import { NEW_SPECS, placeholder, SPECS } from './placeholders';
import { type StadiumPlay, setupStadiumPlay, staticBlocked } from './play';
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
export interface StadiumKit {
  ctxFor(variant: number): AssetCtx;
  makeAsset(asset: string, variant: number): { obj: THREE.Object3D; kind: Kind };
  palOpts(key: keyof Pal, extra?: ToonOpts): ToonOpts;
}

export function createStadiumKit(
  host: Pick<RegionHost, 'uniforms' | 'params' | 'texelMeters' | 'designTexel'>,
): StadiumKit {
  const { params } = host;
  const num = (k: string, d: number) => (params.has(k) ? Number(params.get(k)) : d);
  const rng = rngFactory(num('seed', 17));
  /** 配色：不带 ?pal = 默认（6 午后金光 golden）；?pal=current = 原来的沙漠配色 */
  const scheme = schemeById(params.get('pal'));
  const mats = createMats(host.uniforms, host.texelMeters);
  /**
   * 调色板名字 → 材质参数；配色（?pal=）在这里换色。这个场景新加的走道水泥不在 clubfront 的 GROUP 表里：
   * 借 palette.ts 的 PROXY（concrete）过 grade，和看台台阶同一组调色。
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
    const via = PROXY[key] ?? key;
    // biome-ignore lint/suspicious/noExplicitAny: 这个场景新加的材质名不在 clubfront 的 Pal 里，按 PROXY 借组调色
    return scheme ? (schemeOpts(scheme, via as any, o as any) as ToonOpts) : o;
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

/** 独立页面的开局：竖屏对准西半场（U-8），总监在西南的沙堆东边，相机往北偏（lead 负 = 看台和记分牌在上半） */
export const STADIUM_START: RegionStart = {
  start: [SPOTS.blowSW[0] - 0.6, SPOTS.blowSW[1] + 0.3],
  yaw: -Math.PI / 2,
  camera: { lead: { portrait: -8.6, landscape: -12 }, view: PLAY_VIEW },
  hint: '拖动走路 · 点地面走过去 · 工具在西南角',
};

export interface StadiumRegion extends Region {
  readonly kit: StadiumKit;
  readonly life: StadiumLife | null;
  /** SLOTS 建出来的对象（id → 对象） */
  readonly objs: Map<string, THREE.Object3D>;
  /** 观众人数（看图模式左下角的字） */
  readonly crowd: number;
}

export function createStadiumRegion(host: RegionHost, kit = createStadiumKit(host)): StadiumRegion {
  const { parent, params } = host;
  const num = (k: string, d: number) => (params.has(k) ? Number(params.get(k)) : d);
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
  let life: StadiumLife | null = null;
  let play: Play | null = null;
  let jobs: StadiumPlay | null = null;
  const counts: Record<string, number> = { own: 0, reused: 0, placeholder: 0 };

  // ── 建场景 ──
  const ctx = ctxFor(0);
  // 看台：资产（stadium-stands）还没画时，terrain 里先用色块白模（看台的明暗横带要用真颜色才判断得了）
  const terrain = buildTerrain(ctx, { stands: !OWN['stadium-stands'] });
  parent.add(terrain.root);
  if (OWN['stadium-stands']) parent.add(OWN['stadium-stands'](ctx));
  const showPh = params.get('ph') !== '0';
  let crowdCount = 0;
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
    collectUpdaters(obj);
    if (s.asset === 'crowd')
      obj.traverse((o) => {
        if (o.userData.count) crowdCount = o.userData.count as number;
      });
    if (!label) continue;
    const sp = SPECS[s.asset];
    const top = new THREE.Vector3(s.x, y + (sp?.h ?? 1) * (s.s ?? 1) + 0.3, s.z);
    if (s.noLabel) continue;
    if (s.labelAt) label(phText(s.asset, s.id), new THREE.Vector3(...s.labelAt), kind, true);
    else if (kind === 'placeholder' || kind === 'own')
      label(phText(s.asset, s.id), s.labelBelow ? new THREE.Vector3(s.x, y, s.z) : top, kind, s.labelBelow);
    else if (s.label) label(s.label, top, kind);
    else if (
      !labelled.has(s.asset) &&
      !['player', 'agave', 'brittlebush', 'creosote', 'bench', 'smoke-tree', 'palo-verde', 'fan-palm'].includes(s.asset)
    ) {
      labelled.add(s.asset);
      label(s.asset, top, kind);
    }
  }
  if (label) {
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
    life = createLife({
      ctx,
      scene: parent,
      objs,
      say: (a, text, sec, dy) => play?.say(a, text, sec, dy),
      toast: (text, sec) => play?.toast(text, sec),
      games: num('games', 2),
      preSeconds: num('pre', 40),
      auto: !host.play,
    });
    const l = life;
    updaters.push((dt) => l.update(dt));
  }

  return {
    id: 'clubstadium',
    root: parent,
    kit,
    get life() {
      return life;
    },
    objs,
    crowd: crowdCount,
    groundAt: terrain.groundAt,
    nav: () => ({
      bounds: NAV_BOUNDS,
      walkable: PLAY_WALK,
      blocked: staticBlocked(objs),
      ramps: STAND_RAMPS,
      // 端梯（0.85 米/米）和走道（0.76）比一般的台阶陡：寻路每格 0.2 米最多升 stepUp / 2，默认 0.3 上不去
      stepUp: 0.36,
    }),
    director: () => objs.get('director') ?? null,
    start: STADIUM_START,
    // 原来的顺序：play.update → 总监的活 → 资产的 update + life（都在总监动完以后）
    update() {},
    post(dt, t) {
      for (const u of updaters) u(dt, t);
    },
    attach(p) {
      if (!life) return null;
      play = p;
      const j = setupStadiumPlay({ play: p, objs, life, ctx, scene: parent });
      jobs = j;
      return { step: (dt) => j.update(dt) };
    },
    counts,
    debug: { own: Object.keys(OWN), reused: Object.keys(REUSED), palOpts: kit.palOpts, jobs: () => jobs },
  };
}

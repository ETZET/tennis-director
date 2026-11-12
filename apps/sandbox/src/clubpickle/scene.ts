// clubpickle 的场景模块（clubsite/region.ts 的 Region）：资产、调色、地形、摆件、园区日常（life.ts）、总监的活（play.ts）。
// 独立页面（main.ts）和大世界（src/clubwalk）都从这里建；main.ts 只剩页面的壳。
import * as THREE from 'three';
import type { Play } from '../clubsite/play';
import type { Region, RegionHost } from '../clubsite/region';
import { rngFactory } from '../clubsite/render/noise';
import { schemeById, schemeMats, schemeOpts } from '../clubsite/render/palettes';
import { createMats, type ToonOpts } from '../clubsite/render/toon';
import type { AssetBuild, AssetCtx } from './ctx';
import { AREA_LABELS, NAV, SLOTS, type Slot, SPOTS } from './layout';
import { createLife, type Life } from './life';
import { buildNav, SPOT_NAMES } from './nav';
import { PAL, type Pal } from './palette';
import { NEW_SPECS, placeholder, SPECS } from './placeholders';
import { attachPickleJobs, PICKLE_START } from './play';
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
export interface PickleKit {
  ctxFor(variant: number): AssetCtx;
  makeAsset(asset: string, variant: number): { obj: THREE.Object3D; kind: Kind };
  palOpts(key: keyof Pal, extra?: ToonOpts): ToonOpts;
}

/**
 * 这个场景新加的材质不在 clubsite/render/palettes 的 GROUP 表里（那个文件不归这里改）：借同一家的现成名字过方案的分组调色
 * （同 clubdesk/terrain.ts 的 parkCtx 做法）。厨房跟场面一组（court：午后亮档只染 10%，蓝不发灰；只吃全局调色时成了灰石板色），
 * 球拍跟 club 组（珊瑚不被染成土橙，暗档留酒紫）。以后 GROUP 表加了这两行，这里就可以删。
 */
const GRADE_AS: Partial<Record<keyof Pal, keyof Pal>> = { kitchen: 'court', paddle: 'counter' };

export function createPickleKit(
  host: Pick<RegionHost, 'uniforms' | 'params' | 'texelMeters' | 'designTexel'>,
): PickleKit {
  const { params } = host;
  const num = (k: string, d: number) => (params.has(k) ? Number(params.get(k)) : d);
  const rng = rngFactory(num('seed', 17));
  /** 配色：不带 ?pal = 默认（6 午后金光 golden）；?pal=current = 原来的沙漠配色 */
  const scheme = schemeById(params.get('pal'));
  const mats = createMats(host.uniforms, host.texelMeters);
  /** 调色板名字 → 材质参数；配色（?pal=）在这里换色 */
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
    return scheme ? (schemeOpts(scheme, (GRADE_AS[key] ?? key) as any, o as any) as ToonOpts) : o;
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

export interface PickleRegion extends Region {
  readonly kit: PickleKit;
  readonly life: Life | null;
}

export function createPickleRegion(host: RegionHost, kit = createPickleKit(host)): PickleRegion {
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
  /** 按 slot id 找摆件（在这个区域里找；大世界里 director = 共用的总监） */
  const slot = (id: string): THREE.Object3D | undefined =>
    id === 'director' && host.director ? host.director : parent.getObjectByName(`slot:${id}`);

  let groundAt: (x: number, z: number) => number = () => 0;
  const counts: Record<string, number> = { own: 0, reused: 0, placeholder: 0 };

  // ── 建场景 ──
  {
    const ctx = ctxFor(0);
    const terrain = buildTerrain(ctx);
    groundAt = terrain.groundAt;
    parent.add(terrain.root);
    const showPh = params.get('ph') !== '0';
    const labelled = new Set<string>();
    /** 摇绞盘的人 → 网的摇把跟着右手转（网的 setCrank(rad)：绕 z，0 = 朝东） */
    const cranks: { who: THREE.Object3D; net: string; axis: THREE.Vector3 }[] = [];
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
      applySlot(obj, s);
      if (s.crankNet && s.crank) cranks.push({ who: obj, net: s.crankNet, axis: new THREE.Vector3(...s.crank) });
      collectUpdaters(obj);
      if (!label) continue;
      const sp = SPECS[s.asset];
      const top = new THREE.Vector3(s.x, y + (sp?.h ?? 1) * (s.s ?? 1) + 0.3, s.z);
      if (s.noLabel) continue;
      if (kind === 'placeholder' || kind === 'own')
        label(phText(s.asset, s.id), s.labelBelow ? new THREE.Vector3(s.x, y, s.z) : top, kind, s.labelBelow);
      else if (s.label) label(s.label, top, kind);
      else if (
        !labelled.has(s.asset) &&
        !['player', 'agave', 'brittlebush', 'creosote', 'fan-palm'].includes(s.asset)
      ) {
        labelled.add(s.asset);
        label(s.asset, top, kind);
      }
    }
    // 日常开着时网的摇把由 life 管（总监摇的时候才跟着手转）
    for (const c of LIFE ? [] : cranks) {
      const net = parent.getObjectByName(`slot:${c.net}`);
      if (net) linkCrank(c.who, net, c.axis);
    }
    // 围网是 clubdesk 画好的 fence-screen（地形里一次建好），不标
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
  }

  /** SLOT 的额外字段：人物坐（setSeat）、绞盘（setCrank，要世界坐标 → 放进场景以后）、看哪里（lookAt）；散一地的球（setBalls） */
  function applySlot(obj: THREE.Object3D, s: Slot) {
    const ud = obj.userData;
    if (s.seat) ud.setSeat?.(s.seat[0], s.seat[1] ?? 0);
    obj.updateMatrixWorld(true);
    if (s.crank) ud.setCrank?.(new THREE.Vector3(...s.crank));
    if (s.look) ud.lookAt?.(new THREE.Vector3(...s.look));
    if (s.balls) ud.setBalls?.(s.balls.map(([x, z]) => [x - s.x, z - s.z]));
  }

  /** 网的摇把指向人的右手（摇把组绕 z 轴转：0 = 朝东 +x，正 = 往上 +y）；axis = 转轴的世界坐标（SLOT 的 crank） */
  function linkCrank(who: THREE.Object3D, net: THREE.Object3D, axis: THREE.Vector3) {
    const sync = () => {
      const h = who.userData.handPoint?.('R') as THREE.Vector3 | undefined;
      if (h) net.userData.setCrank?.(Math.atan2(h.y - axis.y, h.x - axis.x));
    };
    sync();
    updaters.push(sync);
  }

  // ── 演出 ──
  let life: Life | null = null;
  let play: Play | null = null;
  if (LIFE) {
    const lifeCtx = ctxFor(0);
    life = createLife({
      ctx: lifeCtx,
      scene: parent,
      slot,
      make: (asset, variant) => {
        const { obj } = makeAsset(asset, variant);
        parent.add(obj);
        collectUpdaters(obj);
        return obj;
      },
      groundAt: (x, z) => groundAt(x, z),
      play: host.play,
      say: host.play ? (obj, text, secs, dy) => play?.say(obj, text, secs, dy) : undefined,
    });
    const lu = life.update;
    updaters.unshift((dt) => lu(dt));
  }

  return {
    id: 'clubpickle',
    root: parent,
    kit,
    life,
    groundAt: (x, z) => groundAt(x, z),
    nav: () => ({ bounds: NAV.bounds, walkable: NAV.walkable, blocked: NAV.blocked, ramps: NAV.ramps }),
    director: () => life?.jobs.director ?? slot('director') ?? null,
    start: PICKLE_START,
    update(dt, t) {
      for (const u of updaters) u(dt, t);
    },
    attach(p) {
      if (!life) return null;
      play = p;
      return attachPickleJobs(p, { scene: parent, groundAt: (x, z) => groundAt(x, z) }, life);
    },
    counts,
    debug: { own: Object.keys(OWN), reused: Object.keys(REUSED), palOpts: kit.palOpts, life },
  };
}

// clubfood 的场景模块（clubsite/region.ts 的 Region）：资产、调色（PROXY 借组、SUN_SKIP / unSun）、地形、摆件、
// 餐车院子的日常（life.ts）、总监的活（play.ts）。独立页面（main.ts）和大世界（src/clubwalk）都从这里建；main.ts 只剩页面的壳。
import * as THREE from 'three';
import type { Play } from '../clubsite/play';
import type { Region, RegionHost, RegionStart } from '../clubsite/region';
import { rngFactory } from '../clubsite/render/noise';
import { schemeById, schemeMats, schemeOpts } from '../clubsite/render/palettes';
import { createMats, type ToonOpts } from '../clubsite/render/toon';
import type { AssetBuild, AssetCtx } from './ctx';
import { AREA_LABELS, SLOTS, type Slot, SPOTS } from './layout';
import { createLife, type FoodLife } from './life';
import { buildNav, SPOT_NAMES } from './nav';
import { foodNavSpec } from './navspec';
import { PAL, type Pal, PROXY } from './palette';
import { festoonBetween, NEW_SPECS, placeholder, SPECS } from './placeholders';
import { registerFoodJobs } from './play';
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
export interface FoodKit {
  ctxFor(variant: number): AssetCtx;
  makeAsset(asset: string, variant: number): { obj: THREE.Object3D; kind: Kind };
  palOpts(key: keyof Pal, extra?: ToonOpts): ToonOpts;
}

export function createFoodKit(host: Pick<RegionHost, 'uniforms' | 'params' | 'texelMeters' | 'designTexel'>): FoodKit {
  const { params } = host;
  const num = (k: string, d: number) => (params.has(k) ? Number(params.get(k)) : d);
  const rng = rngFactory(num('seed', 17));
  /** 配色：不带 ?pal = 默认（6 午后金光 golden）；?pal=current = 原来的沙漠配色 */
  const scheme = schemeById(params.get('pal'));
  const mats = createMats(host.uniforms, host.texelMeters);
  /**
   * 调色板名字 → 材质参数；配色（?pal=）在这里换色。这个场景提议的主色（FOOD）和 clubplaza 的池水、花砖不在 clubfront 的 GROUP 表里：
   * 借 palette.ts 的 PROXY 过同组的 grade（冷色借 club、暖色借 accent、叶绿借 plants）。
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
    if (!scheme) return o;
    // biome-ignore lint/suspicious/noExplicitAny: 这个场景新加的材质名不在 clubfront 的 Pal 里，按 PROXY 借组调色
    const g = schemeOpts(scheme, via as any, o as any) as ToonOpts;
    const k = SUN_SKIP[key];
    return k ? unSun(g, scheme.sun, k) : g;
  }

  /**
   * toon shader 的亮档会乘太阳色（mix(1, 太阳色 / 最大分量, 0.35)；午后 0xffcf96 → 绿 ×0.93、蓝 ×0.86）。
   * 池水的亮档本来是青（#68d7d9），乘完变成薄荷绿 #68c9ba。水面亮的地方是反射的天光，不该被太阳染那么暖：
   * 这些材质的亮档先除掉太阳色的 k 份（k 1 = 一点不染），渲出来就是清的青绿。
   */
  const SUN_SKIP: Partial<Record<keyof Pal, number>> = { fountainWater: 0.75 };
  function unSun(o: ToonOpts, sunHex: number, k: number): ToonOpts {
    const sc = new THREE.Color(sunHex);
    const m = Math.max(sc.r, sc.g, sc.b, 1e-3);
    // 颜色管理是关的（clubsite/render/colors.ts）：Color(hex) 和 shader 里的太阳色都是 sRGB 原值，逐通道除就是精确的
    const f = [sc.r, sc.g, sc.b].map((c) => 1 / (1 + (c / m - 1) * 0.35 * k));
    const fix = (c: THREE.ColorRepresentation) => {
      const x = new THREE.Color(c);
      const h = x.getHex();
      const ch = [(h >> 16) & 255, (h >> 8) & 255, h & 255].map((v, i) => Math.min(255, Math.round(v * f[i])));
      return (ch[0] << 16) | (ch[1] << 8) | ch[2];
    };
    const out: ToonOpts = { ...o };
    if (o.ramp) out.ramp = [fix(o.ramp[0]), o.ramp[1], o.ramp[2]];
    if (o.tones) {
      const t = o.tones;
      out.tones = {
        bands: [t.bands[0].map(fix), t.bands[1], t.bands[2]] as typeof t.bands,
        seam: [fix(t.seam[0]), t.seam[1], t.seam[2]],
        hi: [fix(t.hi[0]), t.hi[1], t.hi[2]],
      };
    }
    return out;
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

const DIRECTOR = SLOTS.find((s) => s.id === 'director');
/** 独立页面的开局（main.ts 的 mountPlay）：总监站在 SLOTS 里摆的地方 */
export const FOOD_START: RegionStart = {
  start: [DIRECTOR?.x ?? -30, DIRECTOR?.z ?? -20],
  yaw: DIRECTOR?.rotY ?? 0,
  // 横屏的取景就是白模的横屏（左边会所、右边中心球场西头）：横屏相机基本不动，竖屏跟着总监
  camera: { lead: { portrait: 1.4, landscape: 0.5 }, view: { x0: -64, x1: -2, z0: -62, z1: 18 } },
  hint: '拖动走路 · 点地面走过去',
};

export interface FoodRegion extends Region {
  readonly kit: FoodKit;
  /** 日常：独立页面要先 mountPlay 再建（气泡交给 play.say / play.bubble），所以分开 */
  startLife(play: Play | null): FoodLife | null;
  readonly life: FoodLife | null;
  post(dt: number, t: number): void;
}

export function createFoodRegion(host: RegionHost, kit = createFoodKit(host)): FoodRegion {
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
  /** SLOTS 的 id → 场景里的对象（life.ts 接管客人、摊主、孩子、鸟……） */
  const slotObjs = new Map<string, THREE.Object3D>();
  if (host.director) slotObjs.set('director', host.director);
  let groundAt: (x: number, z: number) => number = () => 0;
  const counts: Record<string, number> = { own: 0, reused: 0, placeholder: 0 };

  // ── 建场景 ──
  {
    const ctx = ctxFor(0);
    const terrain = buildTerrain(ctx);
    parent.add(terrain.root);
    const showPh = params.get('ph') !== '0';
    const labelled = new Set<string>();
    for (const s of SLOTS) {
      // 大世界：总监只有一个（clubwalk 建的）
      if (s.id === 'director' && host.director) continue;
      const made = makeAsset(s.asset, s.variant ?? 0);
      const { kind } = made;
      let obj = made.obj;
      if (kind === 'placeholder' && !showPh) continue;
      // 串灯：两头都是世界坐标（占位 / 资产都按两头重建）
      if (s.to && kind === 'placeholder') {
        const y0 = s.y ?? 0;
        obj = festoonBetween(
          ctxFor(s.variant ?? 0),
          new THREE.Vector3(0, 0, 0),
          new THREE.Vector3(s.to[0] - s.x, s.to[1] - y0, s.to[2] - s.z),
        );
      } else if (s.to) obj.userData.setEnds?.(new THREE.Vector3(s.x, s.y ?? 0, s.z), new THREE.Vector3(...s.to));
      counts[kind]++;
      const y = s.y ?? terrain.groundAt(s.x, s.z);
      obj.position.set(s.x, y, s.z);
      obj.rotation.y = s.rotY ?? 0;
      obj.scale.setScalar(s.s ?? 1);
      obj.name = `slot:${s.id}`;
      obj.userData.asset = s.asset;
      slotObjs.set(s.id, obj);
      if (s.prop !== undefined) obj.userData.setProp?.(s.prop);
      if (s.pose) obj.userData.pose?.(s.pose[0], s.pose[1]);
      parent.add(obj);
      applyPerson(obj, s);
      collectUpdaters(obj);
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
        ![
          'player',
          'kid',
          'coach',
          'agave',
          'brittlebush',
          'creosote',
          'bench',
          'smoke-tree',
          'palo-verde',
          'fan-palm',
        ].includes(s.asset)
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
    groundAt = terrain.groundAt;
  }

  /** 人物的 SLOT 字段：坐（setSeat）、看哪里（lookAt，要世界坐标 → 放进场景以后） */
  function applyPerson(obj: THREE.Object3D, s: Slot) {
    const ud = obj.userData;
    if (s.seat) ud.setSeat?.(s.seat[0], s.seat[1] ?? 0);
    obj.updateMatrixWorld(true);
    if (s.look) ud.lookAt?.(new THREE.Vector3(...s.look));
  }

  let life: FoodLife | null = null;
  let jobs: { update(dt: number): void } | null = null;
  const region: FoodRegion = {
    id: 'clubfood',
    root: parent,
    kit,
    get life() {
      return life;
    },
    startLife(play) {
      if (!host.life || life) return life;
      life = createLife({
        scene: parent,
        ctx: ctxFor(0),
        slot: (id) => slotObjs.get(id),
        make: (asset, variant) => {
          const o = makeAsset(asset, variant).obj;
          o.userData.asset = asset;
          collectUpdaters(o);
          return o;
        },
        groundAt,
        play: host.play,
        rate: num('guests', 1),
        say: play ? (obj, text, sec, dy) => play?.say(obj, text, sec, dy) : undefined,
        bubble: play ? (key, anchor, text, dy) => play?.bubble(key, anchor, text, dy) : undefined,
      });
      return life;
    },
    groundAt: (x, z) => groundAt(x, z),
    nav: () => {
      const { groundAt: _g, ...n } = foodNavSpec(parent, groundAt, true);
      return n;
    },
    director: () => slotObjs.get('director') ?? null,
    start: FOOD_START,
    // 原来的顺序：资产的 update → life.update → play.update → life.post → 总监的活
    update(dt, t) {
      for (const u of updaters) u(dt, t);
      life?.update(dt);
    },
    post(dt) {
      life?.post();
      jobs?.update(dt);
    },
    attach(play) {
      // 大世界：日常在第一次 attach 的时候建（play 早就有了）
      if (!life) region.startLife(play);
      if (!life) return null;
      jobs = registerFoodJobs(play, life);
      return { step: () => {} };
    },
    counts,
    debug: { own: Object.keys(OWN), reused: Object.keys(REUSED), palOpts: kit.palOpts },
  };
  return region;
}

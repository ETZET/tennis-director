// clubhouse 的场景模块（clubsite/region.ts 的 Region）。给大世界（src/clubwalk）用。
// stage 3：演出 + 总监的活在 stage3.ts 的 createHouseLife（三层各一个模块），这里和 main.ts 接法一样（update / attach / setView）；host.life = false 或 ?life=0 关。
// 建场景的代码从 main.ts 的 buildScene 照搬（标签、导航调试层不要）；独立页面 main.ts 暂时没改成用这里（第二阶段的白模，先接进大世界），
// 两边改一处要同步另一处，等它们做到 stage 3 再把 main.ts 收成薄壳（照 clubpickle/scene.ts）。
import * as THREE from 'three';
import type { Region, RegionHost } from '../clubsite/region';
import { rngFactory } from '../clubsite/render/noise';
import { schemeById, schemeMats, schemeOpts } from '../clubsite/render/palettes';
import { createMats, type ToonOpts } from '../clubsite/render/toon';
import { CLUBHOUSE, GROUNDS } from '../clubsite/world';
import type { AssetBuild, AssetCtx } from './ctx';
import { FLOOR_NAME, FLOOR_Y, type Floor, GOODS_LIFT, LIFT } from './layout';
import { houseNav, liftNext } from './nav';
import { PAL, type Pal, PROXY } from './palette';
import { gymPerson } from './people';
import { placeholder, SPECS } from './placeholders';
import { REUSED } from './reuse';
import { SLOTS, type Slot } from './slots';
import { createHouseLife } from './stage3';
import { buildTerrain, setView as setHouseView } from './terrain';
import { viewOf, viewsFor } from './view';

/** 这个场景自己画的资产（assets/<id>.ts，export function build）；同名的优先于复用的 */
const MODS = import.meta.glob<{ build: AssetBuild }>('./assets/*.ts', { eager: true });
export const OWN: Record<string, AssetBuild> = {};
for (const [path, mod] of Object.entries(MODS)) {
  const id = path.replace('./assets/', '').replace(/\.ts$/, '');
  if (typeof mod.build === 'function') OWN[id] = mod.build;
}

export interface HouseRegion extends Region {
  /** 外观 ↔ 里面（剖面，当前这一层） */
  setInside(on: boolean): void;
  /** 看哪一层（−1 / 1 / 2）；导航也换成这一层的（nav() 读当前层：之后要重取 blocked、surface）。换了才通知 onFloor */
  setFloor(f: Floor): void;
  floor(): Floor;
  /**
   * 换层以后（setFloor 换了层、坐电梯）同步调 fn：用这个区域导航的一方（clubwalk）在里面重取 nav()、重建网格。
   * 坐电梯先换层（fn 里导航已经是新的一层）再传送，所以传送落地的高度是新那一层的。返回撤销函数。
   */
  onFloor(fn: (f: Floor) => void): () => void;
}

export function createHouseRegion(host: RegionHost): HouseRegion {
  const { parent, params, uniforms, designTexel } = host;
  const num = (k: string, d: number) => (params.has(k) ? Number(params.get(k)) : d);
  const rng = rngFactory(num('seed', 17));
  const scheme = schemeById(params.get('pal'));
  const noLabel = (..._a: unknown[]) => {};
  const phText = (_asset: string, id: string) => id;
  const mats = createMats(uniforms, host.texelMeters);
  /**
   * 调色板名字 → 材质参数；配色（?pal=）在这里换色。这个场景新加的材质（切墙、冷色瓷砖、橡木地板）和 clubplaza 的池水、花砖不在 GROUP 表里：
   * 借 palette.ts 的 PROXY 过同组的 grade。
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
    return schemeOpts(scheme, via as any, o as any) as ToonOpts;
  }
  const ctxBase = {
    mats: scheme ? schemeMats(scheme, mats) : mats,
    pal: PAL,
    mat(key: keyof Pal, extra?: ToonOpts) {
      return mats.toon(0xffffff, palOpts(key, extra));
    },
    rng,
    uniforms,
    layers: { FX: 1 },
    texel: designTexel,
    params,
  };
  const ctxFor = (variant: number): AssetCtx => ({ ...ctxBase, variant });

  const updaters: ((dt: number, t: number) => void)[] = [];
  const collectUpdaters = (o: THREE.Object3D) =>
    o.traverse((c) => {
      const u = c.userData.update as ((dt: number, t: number) => void) | undefined;
      if (u) updaters.push(u);
    });

  type Kind = 'own' | 'reused' | 'placeholder' | 'spot' | 'area' | 'propose';
  function makeAsset(asset: string, variant: number): { obj: THREE.Object3D; kind: Kind } {
    const own = OWN[asset];
    if (own) return { obj: own(ctxFor(variant)), kind: 'own' };
    const reused = REUSED[asset];
    if (reused) return { obj: reused(ctxFor(variant)), kind: 'reused' };
    return { obj: placeholder(ctxFor(variant), asset), kind: 'placeholder' };
  }

  let inside = false;
  let floor: Floor = 1;
  // biome-ignore lint/suspicious/noExplicitAny: 白模的建场景照搬 main.ts
  let terrain: any = null;
  const counts: Record<string, number> = {};
  {
    const ctx = ctxFor(0);
    terrain = buildTerrain(ctx);
    parent.add(terrain.root);
    const showPh = params.get('ph') !== '0';
    const labelled = new Set<string>();
    const QUIET = ['player', 'coach', 'agave', 'brittlebush', 'creosote', 'smoke-tree', 'palo-verde', 'fan-palm'];
    for (const s of SLOTS) {
      // 大世界：总监只有一个（clubwalk 建的）
      if (s.id === 'director') continue;
      const { obj, kind } = makeAsset(s.asset, s.variant ?? 0);
      if (kind === 'placeholder' && !showPh) continue;
      gymPerson(obj, ctxFor(s.variant ?? 0), { loop: true });
      const y = s.y ?? FLOOR_Y[s.level ?? 1];
      obj.position.set(s.x, y, s.z);
      obj.rotation.y = s.rotY ?? 0;
      obj.scale.setScalar(s.s ?? 1);
      obj.name = `slot:${s.id}`;
      obj.userData.houseViews = s.views ?? viewsFor(s.level ?? 1, s.mode);
      if (s.prop !== undefined) obj.userData.setProp?.(s.prop);
      if (s.pose) obj.userData.pose?.(s.pose[0], s.pose[1]);
      parent.add(obj);
      applyPerson(obj, s);
      collectUpdaters(obj);
      const sp = SPECS[s.asset];
      const top = new THREE.Vector3(s.x, y + (sp?.h ?? 1) * (s.s ?? 1) + 0.3, s.z);
      if (s.noLabel) continue;
      if (s.labelAt) noLabel(s.label ?? phText(s.asset, s.id), new THREE.Vector3(...s.labelAt), kind, true, s.mode);
      else if (kind === 'placeholder' || kind === 'own')
        noLabel(
          s.label ?? phText(s.asset, s.id),
          s.labelBelow ? new THREE.Vector3(s.x, y, s.z) : top,
          kind,
          s.labelBelow,
          s.mode,
        );
      else if (s.label) noLabel(s.label, top, kind, false, s.mode);
      else if (!labelled.has(s.asset) && !QUIET.includes(s.asset)) {
        labelled.add(s.asset);
        noLabel(s.asset, top, kind, false, s.mode);
      }
    }
  }

  /** 人物的 SLOT 字段：坐（setSeat）、看哪里（lookAt，要世界坐标 → 放进场景以后） */
  function applyPerson(obj: THREE.Object3D, s: Slot) {
    const ud = obj.userData;
    if (s.seat) ud.setSeat?.(s.seat[0], s.seat[1] ?? 0);
    obj.updateMatrixWorld(true);
    if (s.look) ud.lookAt?.(new THREE.Vector3(...s.look));
  }

  /** 演出 + 总监的活（stage 3） */
  const life =
    host.life && params.get('life') !== '0'
      ? createHouseLife({
          parent,
          ctxFor,
          rng,
          texel: designTexel,
          make: (asset, variant) => makeAsset(asset, variant).obj,
          playing: host.play,
          director: () => (host.play ? (host.director ?? null) : null),
        })
      : null;

  const floorFns = new Set<(f: Floor) => void>();
  const setFloor = (f: Floor) => {
    if (f === floor) return;
    floor = f;
    setHouseView(parent, viewOf(inside, floor));
    life?.setView(inside, floor);
    for (const fn of floorFns) fn(floor);
  };

  return {
    id: 'clubhouse',
    root: parent,
    groundAt: (x, z) => terrain.groundAt(x, z),
    nav: () => ({
      bounds: { x0: GROUNDS.x0, x1: CLUBHOUSE.x1 + 0.5, z0: GROUNDS.z0, z1: -1 },
      ...houseNav(floor),
    }),
    director: () => null,
    start: { start: [0, 0] },
    update(dt, t) {
      for (const u of updaters) u(dt, t);
      life?.update(dt, t);
    },
    /**
     * 总监的活：只有电梯（钟楼里，三层同一个门口 LIFT.door，门朝东）和货梯（东翼后门边上，GOODS_LIFT.door，门朝南）——
     * 站在门口按动作键 → 去下一层（liftNext：B1 → 1F → 2F → B1）。
     * 先 setFloor（onFloor 的回调把导航换成那一层），再原地传送（高度 = 那一层的地面）。只在剖面里、脚下就是当前这一层时能按。
     */
    attach(play) {
      const at = new THREE.Vector3();
      const at2 = new THREE.Vector3();
      play.add({
        id: 'lift',
        at: () => at.set(LIFT.x1, FLOOR_Y[floor] + 1.2, (LIFT.z0 + LIFT.z1) / 2),
        radius: 1.0,
        stand: () => LIFT.door,
        label: () => `坐电梯 → ${FLOOR_NAME[liftNext(floor)]}`,
        canUse: (s) => inside && Math.abs(s.y - FLOOR_Y[floor]) < 0.5,
        onUse: (p) => {
          setFloor(liftNext(floor));
          p.teleport(LIFT.door[0], LIFT.door[1]);
        },
      });
      play.add({
        id: 'goods-lift',
        at: () => at2.set((GOODS_LIFT.x0 + GOODS_LIFT.x1) / 2, FLOOR_Y[floor] + 1.2, GOODS_LIFT.z1),
        radius: 1.0,
        stand: () => GOODS_LIFT.door,
        label: () => `坐货梯 → ${FLOOR_NAME[liftNext(floor)]}`,
        canUse: (s) => inside && Math.abs(s.y - FLOOR_Y[floor]) < 0.5,
        onUse: (p) => {
          setFloor(liftNext(floor));
          p.teleport(GOODS_LIFT.door[0], GOODS_LIFT.door[1]);
        },
      });
      return life ? life.attach(play) : null;
    },
    setInside: (on: boolean) => {
      inside = on;
      setHouseView(parent, viewOf(inside, floor));
      life?.setView(inside, floor);
    },
    setFloor,
    floor: () => floor,
    onFloor: (fn) => {
      floorFns.add(fn);
      return () => floorFns.delete(fn);
    },
    counts,
    debug: { own: Object.keys(OWN), reused: Object.keys(REUSED), life },
  };
}

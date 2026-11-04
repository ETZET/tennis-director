import { type Custom, Group, type Node } from '../../core/graph';
import { buildStatics, type Lamp, type Weather } from './build';
import { type Cast, type GroundLike, paintGround } from './ground';
import { buildPlaque, type PlaqueRow } from './plaque';
import { buildPreviewGhost } from './preview';
import { createIndianWellsSky, type SkyLayer } from './sky';
import { FACILITIES, Facilities, type Facility, INITIAL_STATES, UPGRADES, VARIANTS } from './state';
import { createWear, type WearLayer } from './wear';

/**
 * 场景构建和设施状态的运行时（ADR 0015 / 0018 / 0019）。
 * 每个世界一份：当前每个设施的状态、静态节点组、动态节点组（棕榈、喷泉、旗子）、点亮的灯、磨损层。
 * 设施状态一变就按新的状态表从头重建这一份（地面贴图 + 节点，每段有自己的种子随机流，结果确定），
 * 同一轮里连着 set 好几个设施只重建一次（微任务里做）。
 *
 * 修复变体和升级（wave1-contract.md）也算进状态表：variant / upgrade 一变同样排一次重建。
 * 修复预览（幽灵）和大门牌匾是各自单独的一个静态节点，换了只换那一个节点，不重建整张图。
 */

/** 场景构建要用到的 IsoWorld 的部分 */
export interface SiteWorld {
  readonly statics: Node;
  readonly scene: Node;
  readonly ground: GroundLike;
  addLamp(l: Lamp): () => void;
  readonly view: { invalidate(): void };
}

interface Runtime {
  w: SiteWorld;
  states: Record<string, string>;
  key: string;
  statics: Group;
  dynamic: Group;
  lampOffs: (() => void)[];
  weather: Weather;
  wear: WearLayer;
  scheduled: boolean;
  sky: SkyLayer | null;
  /** 设施 → 变体（null / 没有 = 原来的样子） */
  variants: Record<string, string | null>;
  /** 设施 → 开着的升级 */
  upgrades: Record<string, string[]>;
  /** 正在预览的设施和变体 */
  preview: { facility: Facility; variant: string } | null;
  ghost: Custom | null;
  plaque: Custom | null;
  /** 上次重建的状态表和影子（预览要拿现在的地面比对） */
  fac: Facilities | null;
  casts: readonly Cast[];
}

const RUNTIMES = new WeakMap<SiteWorld, Runtime>();

function runtime(w: SiteWorld): Runtime {
  let rt = RUNTIMES.get(w);
  if (!rt) {
    const statics = new Group();
    statics.name = 'indian-wells';
    const dynamic = new Group();
    dynamic.name = 'indian-wells-anim';
    const wear = createWear();
    w.statics.add(statics, wear.root);
    w.scene.add(dynamic);
    rt = {
      w,
      states: { ...INITIAL_STATES },
      key: '',
      statics,
      dynamic,
      lampOffs: [],
      weather: { wind: 0.3, rain: 0 },
      wear,
      scheduled: false,
      sky: null,
      variants: {},
      upgrades: {},
      preview: null,
      ghost: null,
      plaque: null,
      fac: null,
      casts: [],
    };
    RUNTIMES.set(w, rt);
  }
  return rt;
}

/** 按当前状态表重建地面和节点（状态没变就什么也不做） */
function rebuild(rt: Runtime, force = false): void {
  rt.scheduled = false;
  const fac = new Facilities(rt.states, rt.variants, rt.upgrades);
  const key = fac.key();
  if (!force && key === rt.key) return;
  rt.key = key;
  const out = buildStatics(fac, rt.weather);
  rt.fac = fac;
  rt.casts = out.casts;
  rt.statics.remove(...rt.statics.children);
  rt.dynamic.remove(...rt.dynamic.children);
  rt.statics.add(...out.statics);
  rt.dynamic.add(...out.dynamic);
  for (const off of rt.lampOffs) off();
  rt.lampOffs = out.lamps.map((l) => rt.w.addLamp(l));
  paintGround(rt.w.ground, fac, out.casts);
  // 状态变了，预览要按新的"现在"重做；牌匾节点挂回去
  rt.ghost = null;
  refreshGhost(rt);
  if (rt.plaque) rt.statics.add(rt.plaque);
  rt.w.view.invalidate();
}

/** 按 rt.preview 重做预览幽灵（没有预览就拿掉） */
function refreshGhost(rt: Runtime): void {
  if (rt.ghost) rt.statics.remove(rt.ghost);
  rt.ghost = null;
  const p = rt.preview;
  if (p && rt.fac) {
    rt.ghost = buildPreviewGhost(rt.fac, p.facility, p.variant, rt.weather, rt.casts);
    if (rt.ghost) rt.statics.add(rt.ghost);
  }
}

/** 排一次重建（同一轮里的几次改动合成一次） */
function schedule(rt: Runtime): void {
  if (rt.scheduled) return;
  rt.scheduled = true;
  queueMicrotask(() => {
    if (rt.scheduled) rebuild(rt);
  });
}

const isFacility = (f: string): f is Facility => (FACILITIES as readonly string[]).includes(f);

/** 建静态场景（开局的状态：荒了十年） */
export function buildIndianWells(w: SiteWorld): void {
  rebuild(runtime(w), true);
}

/** 设施状态的画面层：set 换状态（下一个微任务里重建），wear 画磨损；variant / preview / upgrade / plaque 见 Site 接口 */
export function createFacilityOverlays(w: SiteWorld): {
  set(facility: string, state: string): void;
  wear(facility: string, amount: number): void;
  /** 立刻把排着的重建做掉（测试、截图用） */
  flush(): void;
  variant(facility: string, variant: string | null): void;
  preview(facility: string, variant: string | null): void;
  upgrade(facility: string, upgrade: string, on: boolean): void;
  plaque(rows: readonly PlaqueRow[]): void;
} {
  const rt = runtime(w);
  return {
    set(facility, state) {
      if (!isFacility(facility)) return;
      if (rt.states[facility] === state) return;
      rt.states[facility] = state;
      schedule(rt);
    },
    variant(facility, variant) {
      if (!isFacility(facility)) return;
      const v = variant && VARIANTS[facility]?.includes(variant) ? variant : null;
      if ((rt.variants[facility] ?? null) === v) return;
      rt.variants[facility] = v;
      schedule(rt);
    },
    upgrade(facility, upgrade, on) {
      if (!isFacility(facility) || !UPGRADES[facility]?.some((u) => u.id === upgrade)) return;
      const list = rt.upgrades[facility] ?? [];
      const has = list.includes(upgrade);
      if (has === on) return;
      rt.upgrades[facility] = on ? [...list, upgrade] : list.filter((u) => u !== upgrade);
      schedule(rt);
    },
    preview(facility, variant) {
      const next =
        isFacility(facility) && variant && VARIANTS[facility]?.includes(variant) ? { facility, variant } : null;
      // null 关掉：只关同一处设施的预览（别处的预览不动）；不认识的变体也当关掉
      if (!next && rt.preview && rt.preview.facility !== facility) return;
      const cur = rt.preview;
      if (cur?.facility === next?.facility && cur?.variant === next?.variant) return;
      rt.preview = next;
      if (rt.scheduled) return; // 重建时会一起做
      refreshGhost(rt);
      rt.w.view.invalidate();
    },
    plaque(rows) {
      if (rt.plaque) rt.statics.remove(rt.plaque);
      rt.plaque = buildPlaque(rows);
      if (rt.plaque) rt.statics.add(rt.plaque);
      rt.w.view.invalidate();
    },
    wear(facility, amount) {
      if (rt.wear.set(facility, amount)) rt.w.view.invalidate();
    },
    flush() {
      if (rt.scheduled) rebuild(rt);
    },
  };
}

/** 天空和环境动画；风力传给棕榈和旗子 */
export function createSky(w: SiteWorld): SkyLayer {
  const rt = runtime(w);
  rt.sky ??= createIndianWellsSky(rt.w.scene, rt.weather);
  return rt.sky;
}

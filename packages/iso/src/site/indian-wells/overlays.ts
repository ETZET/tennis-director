import { Group, type Node } from '../../core/graph';
import { buildStatics, type Lamp, type Weather } from './build';
import { type GroundLike, paintGround } from './ground';
import { createIndianWellsSky, type SkyLayer } from './sky';
import { FACILITIES, Facilities, INITIAL_STATES } from './state';
import { createWear, type WearLayer } from './wear';

/**
 * 场景构建和设施状态的运行时（ADR 0015 / 0018 / 0019）。
 * 每个世界一份：当前每个设施的状态、静态节点组、动态节点组（棕榈、喷泉、旗子）、点亮的灯、磨损层。
 * 设施状态一变就按新的状态表从头重建这一份（地面贴图 + 节点，每段有自己的种子随机流，结果确定），
 * 同一轮里连着 set 好几个设施只重建一次（微任务里做）。
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
    };
    RUNTIMES.set(w, rt);
  }
  return rt;
}

/** 按当前状态表重建地面和节点（状态没变就什么也不做） */
function rebuild(rt: Runtime, force = false): void {
  rt.scheduled = false;
  const fac = new Facilities(rt.states);
  const key = fac.key();
  if (!force && key === rt.key) return;
  rt.key = key;
  const out = buildStatics(fac, rt.weather);
  rt.statics.remove(...rt.statics.children);
  rt.dynamic.remove(...rt.dynamic.children);
  rt.statics.add(...out.statics);
  rt.dynamic.add(...out.dynamic);
  for (const off of rt.lampOffs) off();
  rt.lampOffs = out.lamps.map((l) => rt.w.addLamp(l));
  paintGround(rt.w.ground, fac, out.casts);
  rt.w.view.invalidate();
}

/** 建静态场景（开局的状态：荒了十年） */
export function buildIndianWells(w: SiteWorld): void {
  rebuild(runtime(w), true);
}

/** 设施状态的画面层：set 换状态（下一个微任务里重建），wear 画磨损 */
export function createFacilityOverlays(w: SiteWorld): {
  set(facility: string, state: string): void;
  wear(facility: string, amount: number): void;
  /** 立刻把排着的重建做掉（测试、截图用） */
  flush(): void;
} {
  const rt = runtime(w);
  return {
    set(facility, state) {
      if (!(FACILITIES as readonly string[]).includes(facility)) return;
      if (rt.states[facility] === state) return;
      rt.states[facility] = state;
      if (rt.scheduled) return;
      rt.scheduled = true;
      queueMicrotask(() => {
        if (rt.scheduled) rebuild(rt);
      });
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

import {
  BallPool,
  type ChoreoContext,
  Custom,
  contactPt,
  createDaylight,
  createRain,
  createStarSign,
  type DrawContext,
  type IsoWorld,
  type PeopleWorld,
  Person,
  type PersonOptions,
  type PoseName,
  Scheduler,
  type Site,
  type Sprite,
  STAR_SIGN_AT,
} from '@td/iso';
import { clamp, lerp, mulberry32, type XZ } from '@td/shared';
import {
  type ContentBundle,
  careActive,
  careCourts,
  careLevelOf,
  coachAttention,
  crewOf,
  DIRECTOR,
  dayOf,
  type GameState,
  isStaff,
  MESS_KINDS,
  orderStatus,
  placeOpen,
  plotStatus,
  postStatus,
  remodeling,
  type SimEvent,
  stateDef,
  tournamentStatus,
  type World,
  working,
  worldOf,
} from '@td/sim';
import { variantSite } from './courts';
import { idlePlan } from './idle';
import { createLife } from './life';
import { entryFor, type Performance, type PerformInput, perform, planPerformance } from './perform';
import { joinPoint, walkHeading, walkPoint, walkRate } from './walkpath';

/**
 * 游戏画面里的"活"的部分：员工（总监也是）沿路线走、站在岗位上干活、设施状态、活动演出、天气。
 * 地图（锚点、步道、球场、设施的画面层）全部来自 Site，这里不认识任何一张具体的地图。
 *
 * 规则（CLAUDE.md）：这里只读模拟状态、只订阅领域事件，从不改模拟。
 * 演出用自己的时间轴（暂停时停、变速时不跟着快进），结果早已由模拟算好。
 */

const SK = ['#f1c7a1', '#e8b896', '#d9a47c', '#c48a62', '#a86f4c', '#7a4a32', '#5f3a28', '#f1d0ae'] as const;

/** 总监的样子（地图上的小人和每日结算卡的像素头像共用） */
export const DIRECTOR_LOOK: Omit<PersonOptions, 'name' | 'x' | 'z'> = {
  base: 'director',
  shirt: '#2f5a55',
  trim: '#e6b03c',
  shorts: '#7d6f55',
  pants: true,
  skin: SK[2],
  hair: '#4a3020',
  hairStyle: 'short',
  shoes: '#3a2a20',
  clipboard: true,
};

/** 每个人物 id 的样子（内容里只有名字和数值，长相是画面的事）；总监另画。内容里每个人都要有（scene.test.ts 守着） */
export const LOOKS: Record<string, Omit<PersonOptions, 'name' | 'x' | 'z'>> = {
  dale: {
    wide: true,
    shirt: '#6b2e2a',
    shorts: '#4f5560',
    pants: true,
    skin: SK[0],
    hair: '#cfcac0',
    hairStyle: 'cap',
    cap: '#2b3440',
    beard: '#cfcac0',
    shoes: '#5a4a3a',
    racket: '#8a8f93',
  },
  jess_park: {
    shirt: '#2a8a86',
    shorts: '#f1ece0',
    skin: SK[2],
    hair: '#2a1d16',
    hairStyle: 'pony',
    shoes: '#f1ece0',
    racket: '#e8582c',
  },
  walt_hendricks: {
    wide: true,
    shirt: '#8a8f93',
    shorts: '#2e2e33',
    skin: SK[4],
    hair: '#cfcac0',
    hairStyle: 'visor',
    cap: '#1f3a5a',
    shoes: '#2a2a2a',
    racket: '#3a3f4a',
  },
  rosa_ortiz: {
    shirt: '#3d6b3a',
    shorts: '#4f5560',
    pants: true,
    skin: SK[4],
    hair: '#2a1d16',
    hairStyle: 'pony',
    cap: '#3d6b3a',
    shoes: '#5a4a3a',
  },
  ben_kim: {
    shirt: '#e6b03c',
    shorts: '#26262b',
    skin: SK[1],
    hair: '#2a1d16',
    hairStyle: 'short',
    shoes: '#f1ece0',
    racket: '#3a8fd9',
  },
  gus_moreno: {
    wide: true,
    shirt: '#7a5a3a',
    shorts: '#3a3f4a',
    pants: true,
    skin: SK[5],
    hair: '#9a9a96',
    hairStyle: 'cap',
    cap: '#c84a3a',
    beard: '#9a9a96',
    shoes: '#3a2a20',
  },
  lily_chen: {
    shirt: '#ffffff',
    trim: '#2fa3a8',
    shorts: '#2e2e33',
    skin: SK[0],
    hair: '#1d1d22',
    hairStyle: 'long',
    shoes: '#2e2e33',
  },
  marco_ruiz: {
    shirt: '#c84a3a',
    shorts: '#3a3f4a',
    skin: SK[3],
    hair: '#2a1d16',
    hairStyle: 'curly',
    shoes: '#f1ece0',
  },
  nadia_volkov: {
    shirt: '#1d1d22',
    trim: '#d6362f',
    shorts: '#1d1d22',
    skin: SK[0],
    hair: '#e0c48a',
    hairStyle: 'long',
    shoes: '#ffffff',
    racket: '#d6362f',
  },
  // 体能师：一身深绿的运动服
  kofi_mensah: {
    wide: true,
    shirt: '#2f6b4f',
    trim: '#f0a020',
    shorts: '#1d1d22',
    skin: SK[6],
    hair: '#1d1d22',
    hairStyle: 'bald',
    shoes: '#f1ece0',
  },
  // 大学球员：校队的白衣，拍子是橙色
  amara_okafor: {
    shirt: '#f1ece0',
    trim: '#3a8fd9',
    shorts: '#1f3a5a',
    skin: SK[5],
    hair: '#1d1d22',
    hairStyle: 'pony',
    shoes: '#ffffff',
    racket: '#f0a020',
  },
  // 穿线师：围裙色的上衣，手里抱着一箱拍子
  teo_ilic: {
    shirt: '#8a5ac4',
    shorts: '#3a3f4a',
    pants: true,
    skin: SK[0],
    hair: '#6a4a30',
    hairStyle: 'short',
    shoes: '#2e2e33',
    box: true,
  },
  // 前天才少年：黄绿配色的旧球衣
  luca_ferreira: {
    shirt: '#d9c35a',
    trim: '#3c7a5a',
    shorts: '#3c7a5a',
    skin: SK[3],
    hair: '#3b2a1e',
    hairStyle: 'curly',
    shoes: '#ffffff',
    racket: '#2a2a2a',
  },
  // 老场地主管：长裤、宽檐帽、白胡子
  ray_delgado: {
    wide: true,
    shirt: '#c9b48a',
    shorts: '#5a4a3a',
    pants: true,
    skin: SK[4],
    hair: '#d9d3c6',
    hairStyle: 'cap',
    cap: '#7a5a3a',
    beard: '#d9d3c6',
    shoes: '#3a2a20',
  },
  // 球童：比大人小一号，统一的球童衫
  mateo_salgado: {
    shirt: '#4a6fa8',
    trim: '#ffffff',
    shorts: '#2e2e33',
    skin: SK[4],
    hair: '#2a1d16',
    hairStyle: 'short',
    shoes: '#f1ece0',
    scale: 0.85,
  },
  // 本地球员（Indio 长大，在包装厂的墙上练出来的）：晒褪色的砖红 T 恤、挡沙漠太阳的旧帽子、一支便宜的旧拍子
  diego_ibarra: {
    shirt: '#b5563a',
    shorts: '#4a4f3a',
    skin: SK[5],
    hair: '#1d1d22',
    hairStyle: 'cap',
    cap: '#c9b48a',
    shoes: '#d9d3c6',
    racket: '#6a6f73',
  },
};

const SHIRTS = [
  '#e05a8f',
  '#2fa3a8',
  '#f0a020',
  '#8a5ac4',
  '#3c7a5a',
  '#c84a3a',
  '#4a6fa8',
  '#d9c35a',
  '#5a5a62',
  '#e8e2d2',
];
const HAIRS = ['#2a1d16', '#6a4a30', '#a7742f', '#d9d3c6', '#3b2a1e', '#9a9a96'];
const STYLES = ['short', 'pony', 'curly', 'visor', 'bald', 'long', 'cap'] as const;

/** 这个地点现在有几块能打的场地（设施状态里的 courts） */
export function courtsAt(w: World, s: GameState, anchor: string): number {
  const f = w.facilityAt.get(anchor);
  if (!f) return 0;
  // 变体、升级改了场地数的也算上（stateDef）；改造停用期间没有场地
  if (remodeling(s, f)) return 0;
  return stateDef(s, w, f)?.courts ?? 0;
}

/**
 * 状况 → 画面上的磨损量（ART-8 原型）：70 以上干净；往下开始长沙、草、垃圾；
 * 40 左右（"整理"工单冒出来的线）已经很明显，30（质量减半，conditionFactor）是 1，再往下继续堆。
 * 只是画面的换算，模拟的门槛不变。
 */
export const wearOf = (condition: number): number => clamp((70 - condition) / 40, 0, 1.75);

interface Perf {
  /** graceful：收场（人走开、东西慢慢收走）；读档、热重载时立刻清掉 */
  stop(graceful?: boolean): void;
  setParams?(p: Readonly<Record<string, number>>): void;
}

/** 卡片发生的地方：镜头慢慢移过去（不改缩放）；seq 每来一次新的焦点加一，玩家拖动画面后就不再跟 */
export interface CameraFocus {
  x: number;
  z: number;
  /** 要对准的高度（米，默认地面）：升星牌是立着的牌子，对准牌面中间 */
  y?: number;
  seq: number;
  /** 新地启用的镜头（停完镜头飞回原来的地方） */
  land?: boolean;
  /** 新地启用的镜头拉到多远（地图的 land.focus 给了的话） */
  zoom?: number;
}

/** 升星的镜头：先转过去（0.9 秒后点亮新星），亮了以后再停这么久，期间卡片不抢镜头（真实秒） */
const STAR_LIGHT_WAIT = 0.9;
const STAR_HOLD = 2.5;
/** 新地启用（plot_open）的镜头：飞过去停这么久（真实秒，含飞过去的一段），期间卡片不抢镜头；停完 main.ts 飞回来 */
const LAND_HOLD = 4.5;
/** 升星牌牌面中间离地多高（米） */
const STAR_SIGN_LIFT = 3;

/** 画面里员工走路的速度（米 / 真实秒）：从站位走到岗位上的位子、赶上路线；离得远就小跑 */
export const STAFF_WALK = 2.6;
export const STAFF_RUN = 4.4;

/** 总监头顶的小菱形（像素画：1 亮绿、2 深绿、0 描边），每行从中心往两边对称 */
const MARKER_ROWS = ['...0...', '..010..', '.01110.', '0111220', '.02220.', '..020..', '...0...'];
const MARKER_COL: Record<string, string> = { '0': '#1d3a2a', '1': '#62e08c', '2': '#38a860' };
/** 总监头顶的标记：一个上下浮动的像素菱形（夜里也亮，像个图标） */
function directorMarker(): Custom {
  return new Custom(
    (r: DrawContext, self: Custom) => {
      const m = self.matrixWorld;
      const [sx, sy0] = r.P(m[9] as number, m[10] as number, m[11] as number);
      let sy = sy0;
      const n = r.spriteScale;
      const h = MARKER_ROWS.length;
      // 挂在头顶挂点上，再往上留 3 个素材像素，上下浮动 1 像素
      sy -= (3 + Math.round(Math.sin(r.t * 3) + 1)) * n;
      for (let j = 0; j < h; j++) {
        const row = MARKER_ROWS[j] as string;
        for (let i = 0; i < row.length; i++) {
          const c = MARKER_COL[row[i] as string];
          if (c) r.rect(Math.round(sx) + (i - 3) * n, Math.round(sy) + (j - h) * n, n, n, r.em(c));
        }
      }
    },
    { x0: -0.2, x1: 0.2, y0: 0, y1: 0.4, z0: -0.2, z1: 0.2 },
  );
}

export interface GameScene {
  /** 每帧调用：time 是带零头的游戏分钟，dt 是真实秒数，paused 时演出也停 */
  update(s: GameState, time: number, dt: number, paused: boolean): void;
  onEvents(s: GameState, events: readonly SimEvent[]): void;
  /** 读档或新开局后把演出状态对齐到当前模拟状态 */
  sync(s: GameState): void;
  setContent(c: ContentBundle): void;
  /** 头顶"你"牌子的位置 */
  directorHead(): { x: number; y: number; z: number };
  /** 卡片发生的地方：给相机一个镜头 */
  focus(): CameraFocus | null;
  /**
   * 玩家此刻看得见画面吗（夜里黑屏淡入淡出时为 false）。升星在看不见的时候发生（夜里跳天、快进），
   * 先排着，等看得见了（第二天早上淡入以后）再演。
   */
  setWatching(on: boolean): void;
  /** 地点清单里点了变体行：在设施上叠这个变体修好后的预览；null 关掉（UI-11，只是画面） */
  preview(facility: string | null, variant: string | null): void;
  /** 选路卡（W2）：新地块按这条路长出来以后的半透明预览；null 关掉（Wave 5 的地图才有，没有就什么也不做） */
  landPreview(plot: string, variant: string | null): void;
  readonly showNow: () => number;
  /**
   * 扫场小游戏接管一块场（court-care-contract.md，代理 C 调）：给设施 → 那块场的脏乱叠层收起来（mess null）、
   * 藏起总监和场上的人、停下那块场上的演出和门口的会员；null → 整个重画地面（repaint）、全部还原。只是画面。
   */
  careStage(facility: string | null): void;
}

/**
 * 总监此刻是不是在亲手扫场（court-care-contract.md）：在一块球场上办事（errand），而最近一条"亲手扫了这块场"的
 * 因果日志还没过完它的工时。返回那块场的锚点（= 设施 id），不是返回 null。只读状态（读档以后也认得出来）。
 */
export function directorSweeping(s: GameState, w: World): string | null {
  const d = s.people[DIRECTOR];
  if (!d?.errand || d.walk || !careCourts(w).includes(d.at)) return null;
  for (let i = s.log.length - 1, n = 0; i >= 0 && n < 80; i--, n++) {
    const e = s.log[i] as GameState['log'][number];
    const c = e.cause;
    if (c.kind === 'care' && c.court === d.at) return e.t + c.minutes >= s.t ? d.at : null;
  }
  return null;
}

export function createGameScene(
  stage: IsoWorld,
  content0: ContentBundle,
  site0: Site,
  /** 文案（门口会员的抱怨气泡）；不给就不冒字，只比划 */
  tr?: (key: string) => string,
): GameScene {
  let content = content0;
  let state: GameState | null = null;
  // 球场按变体换（地图给了 courtsFor 时）：演出、路人、员工站位都读这个 site
  const site = variantSite(
    site0,
    () => state,
    () => content,
  );
  const sched = new Scheduler();
  const world: PeopleWorld = { scene: stage.scene, groundY: site.groundY, people: [] };
  const pool = new BallPool(stage.scene, site.groundY);
  const ctx: ChoreoContext = { sched, groundY: site.groundY };
  const overlays = site.createOverlays(stage);
  /*
   * 大门星级牌（ART-14）：地图的覆盖层还没给 stars 时，游戏自己立一块（createStarSign 是 @td/iso 的公共构件）。
   * 变体、升级、牌匾也走覆盖层（wave1-contract.md），覆盖层没提供的就跳过。
   */
  const ov = overlays as typeof overlays & {
    stars?(n: number, animate: boolean): void;
  };
  const starSign = ov.stars ? null : createStarSign(stage);
  const setStars = (n: number, animate: boolean) => (ov.stars ? ov.stars(n, animate) : starSign?.set(n, animate));
  /** 已经交给覆盖层的场地脏乱（court-care-contract.md）：设施 → 变体 + 各项按 1/100 取整；没开、被小游戏接管的是 '' */
  const messShown = new Map<string, string>();
  /** 扫场小游戏接管的那块场（careStage）、因此藏起来的员工 */
  let staged: string | null = null;
  const stageHidden = new Set<Person>();
  /** 酷热的画面量 0..1（天色、热浪慢慢淡入淡出） */
  let heatAmt = 0;
  /** 已经交给覆盖层的设施样子（变体 + 升级 + 状态），和模拟状态对不上就重设一次 */
  const looks = new Map<string, string>();
  let plaqueN = -1;
  let starsShown = -1;
  /** 升星：等镜头转到大门再点亮新星（真实秒，暂停时也走） */
  let starPending: { n: number; wait: number } | null = null;
  /** 排着还没演的升星（几星）：玩家看不见画面时发生的，等看得见了再演 */
  let starQueued: number | null = null;
  /** 结局时把星级牌定格过一次 */
  let starsFinal = false;
  let watching = true;
  /** 真实秒（暂停时也走）：升星镜头的计时 */
  let realNow = 0;
  /** 赛事日的布置（W2）：地点 → 交给覆盖层的赛事 id；筹备每一期交给覆盖层的样子（true 建好、false 挂出来了） */
  const dressed = new Map<string, string>();
  /** 交给覆盖层的地块样子（阶段 | 变体 | 进度按 1/40 取整）、第几周（伏笔） */
  const plotLooks = new Map<string, string>();
  let weekShown = -1;
  /**
   * 地块（W5）：只读模拟的 plotStatus，和交给覆盖层的对不上才重设（读档、开工、施工进度、开地都靠这一步跟上）。
   * 没写 plots 的内容：只按周画伏笔（高尔夫西段一周比一周荒）。
   */
  function applyLand(s: GameState, w: World, force: boolean): void {
    const week = Math.floor(s.t / (1440 * 7)) + 1;
    if (force || week !== weekShown) {
      weekShown = week;
      overlays.week?.(week);
    }
    for (const p of plotStatus(s, w)) {
      const key = `${p.state}|${p.variant ?? ''}|${Math.round(p.progress * 40)}`;
      if (!force && plotLooks.get(p.id) === key) continue;
      plotLooks.set(p.id, key);
      overlays.land?.(p.id, p.state, p.variant, p.progress);
    }
  }
  const preps = new Map<string, boolean>();
  let eventsT = -1;
  /**
   * 赛事日的布置和表演赛筹备：只读模拟状态，和交给覆盖层的对不上才重设（读档、开赛、收赛都靠这一步跟上）。
   * 主办赛事：接下了、今天是比赛日（整天，收赛以后撤掉）；外出赛事：比赛日有人在报名工单上、或者这一期刚打完。
   */
  function applyEvents(s: GameState, w: World, force: boolean): void {
    if (!force && s.t === eventsT) return;
    eventsT = s.t;
    const want = new Map<string, string>();
    for (const ts of tournamentStatus(s, w)) {
      if (!ts.days.includes(dayOf(s.t)) || s.t >= ts.end || want.has(ts.at)) continue;
      const on =
        ts.kind === 'host'
          ? ts.entered
          : crewOf(s, ts.order).length > 0 || (s.tournaments?.[ts.id]?.last ?? -1) >= ts.start;
      if (on) want.set(ts.at, ts.id);
    }
    for (const a of [...dressed.keys()])
      if (!want.has(a)) {
        overlays.event?.(a, null);
        dressed.delete(a);
      }
    for (const [a, k] of want)
      if (force || dressed.get(a) !== k) {
        overlays.event?.(a, k);
        dressed.set(a, k);
      }
    // 筹备：做完的画建好的样子；挂出来了（★3 起看得见）还没做的钉测量桩；从没挂出来的不调
    for (const ids of w.prep.values())
      for (const id of ids) {
        const o = w.orders.get(id);
        if (!o) continue;
        const done = (s.orderLog.done[id] ?? 0) > 0;
        if (!done && !orderStatus(s, w, o).visible) continue;
        if (!force && preps.get(id) === done) continue;
        preps.set(id, done);
        overlays.prep?.(id, done);
      }
  }
  /** 牌匾上刻的名字：内容里的原名（3×5 小字只排大写字母和数字） */
  const leaderName = (id: string) => content.people.find((p) => p.id === id)?.name ?? id;
  function applyLooks(s: GameState, force = false): void {
    const w = worldOf(s, content);
    for (const [f, st] of Object.entries(s.facilities)) {
      const v = s.variants?.[f] ?? null;
      const ups = s.upgrades?.[f] ?? [];
      const key = `${v ?? ''}|${ups.join(',')}|${st}`;
      if (!force && looks.get(f) === key) continue;
      looks.set(f, key);
      // 先变体、再升级、最后状态（覆盖层同一轮只重建一次）
      overlays.variant?.(f, v);
      for (const u of Object.keys(w.facilities.get(f)?.upgrades ?? {})) overlays.upgrade?.(f, u, ups.includes(u));
      overlays.set(f, st);
    }
    const rows = s.plaque ?? [];
    if (force || rows.length !== plaqueN) {
      plaqueN = rows.length;
      overlays.plaque?.(rows.map((r) => ({ facility: r.facility, leader: leaderName(r.leader), day: r.day })));
    }
    if (force || (starsShown !== (s.stars ?? 0) && !starPending && starQueued === null)) {
      starsShown = s.stars ?? 0;
      setStars(starsShown, false);
    }
    applyEvents(s, w, force);
    applyLand(s, w, force);
  }
  /**
   * 场地的脏乱（court-care-contract.md）：开着的球场把 s.care[f].mess 交给覆盖层画（沙、水洼、垃圾、褪色的线、裂缝）；
   * 没开的、小游戏接管的传 null。量变了（按 1/100）才再交一次。只读模拟状态。
   */
  function applyMess(s: GameState, w: World): void {
    for (const f of careCourts(w)) {
      const m = staged === f || !careActive(s, w, f) ? null : (s.care?.[f]?.mess ?? null);
      const key = m ? `${s.variants?.[f] ?? ''}|${MESS_KINDS.map((k) => Math.round(m[k] * 100)).join(',')}` : '';
      if (messShown.has(f) && messShown.get(f) === key) continue;
      messShown.set(f, key);
      overlays.mess?.(f, m ? { ...m } : null);
    }
  }
  const rain = createRain(
    stage,
    undefined,
    260,
    (x, z) => x > site.bounds.x0 && x < site.bounds.x1 && z > site.bounds.z0 && z < site.bounds.z1,
  );
  // 一天的光：画出来的天空和山，灯光跟着游戏时钟走（参考图 Palm Oasis）
  const daylight = createDaylight(stage);
  const sky = site.createSky(stage);
  const rnd = mulberry32(0x9a3e);
  const mk = (o: PersonOptions) => new Person(o, world);
  const STANDS = site.stands;

  /* ---------- 总监 ---------- */
  const home = (STANDS.entrance ?? Object.values(STANDS)[0] ?? { x: 0, z: 0 }) as XZ;
  const you = mk({ name: 'Director', x: home.x, z: home.z, ...DIRECTOR_LOOK });
  const marker = directorMarker();
  marker.renderOrder = 5;
  you.headTop.add(marker);

  /** 环境动画自己的时钟（暂停时停；暂停中游戏时间跳了就补一段） */
  let ambT = 0;

  /* ---------- 员工（Dale 和招聘日能招来的人）：没招的藏着 ---------- */
  const cast = new Map<string, Person>();
  for (const [id, look] of Object.entries(LOOKS)) {
    const def = content.people.find((p) => p.id === id);
    // 手机：闲着的时候掏出来看（手里抱着箱子的人不带）
    const p = mk({ name: def?.name ?? id, x: home.x, z: home.z, base: 'relaxed', phone: !look.box, ...look });
    p.root.visible = false;
    if (p.phone) p.phone.visible = false;
    cast.set(id, p);
  }

  /* ---------- 对打：一颗球在两人之间来回 ---------- */
  function rally(a: Person, b: Person, o: { pickle?: boolean; speed?: number; miss?: number } = {}): Perf {
    let alive = true;
    const speed = o.speed ?? 9;
    let ball = pool.get(a, !!o.pickle);
    const hit = (from: Person, to: Person, t: number) => {
      if (!alive) return;
      if (!ball.inUse) ball = pool.get(a, !!o.pickle);
      const P0 = contactPt(ctx, from, 1, 0.95);
      const side = rnd() < 0.6 ? 1 : -1;
      const P2 = contactPt(ctx, to, side, 0.9);
      const B = { x: lerp(P0.x, P2.x, 0.72), y: site.groundY(P0.x, P0.z) + 0.08, z: lerp(P0.z, P2.z, 0.72) };
      const d = Math.hypot(P2.x - P0.x, P2.z - P0.z);
      const T = clamp(d / speed, 0.5, 2.2);
      const tB = ball.arc(P0, B, t, T * 0.72);
      const tC = ball.arc(B, P2, tB, T * 0.28 + 0.12);
      if (rnd() < (o.miss ?? 0.12)) {
        // 没接到：球滚走，过一会儿换一颗新球
        ball.fadeOut(tC + 0.4);
        sched.at(tC + 1.6, (tt) => {
          ball = pool.get(a, !!o.pickle);
          hit(from, to, tt);
        });
        return;
      }
      to.setStroke(o.pickle ? 'dk' : side === 1 ? 'fh' : 'bh', tC);
      sched.at(tC, (tt) => hit(to, from, tt));
    };
    sched.at(sched.now + 0.5, (t) => hit(a, b, t));
    return {
      stop() {
        alive = false;
        ball.fadeOut(sched.now);
      },
    };
  }

  /* ---------- 演出：模拟的 performance 名字 → 活动动画库（perform.ts，ADR 0010） ---------- */
  const headCoach = () => (state?.headCoach ? (cast.get(state.headCoach) ?? null) : null);
  const performInput = (coachId = state?.headCoach): PerformInput => {
    return {
      weather:
        rain.amount() > 0.3 ? 'rain' : state?.weather === 'wind' ? 'wind' : state?.weather === 'heat' ? 'heat' : 'sun',
      fatigue: 25,
      coachSkill: coachId ? (state?.people[coachId]?.skill ?? 40) : 0,
    };
  };

  /* ---------- 活动 ---------- */
  const running = new Map<number, Perf>();
  /** 被演出借走的员工：这段时间不按岗位摆 */
  const borrowed = new Set<Person>();
  /** 演出把人还回来：就在他站的地方，之后由 placeStaff 按走路速度走回岗位（不瞬移） */
  function giveBack(p: Person): void {
    if (!borrowed.delete(p)) return;
    p.clearMoves();
    p.base = BASE0(p);
    p.lock = null;
    p.seatY = null;
  }
  /**
   * 开演：coach 和 crew 是借来的现成人物（主教练、岗位上已经到场的员工），没借到的由演出自己生成，
   * 生成的人沿步道从地点外面走进来（entry）。
   */
  function startActivity(
    uid: number,
    performance: string,
    anchor: string,
    who: { coach: Person | null; crew: readonly Person[]; coachId?: string | null } = {
      coach: null,
      crew: [],
    },
    params: Readonly<Record<string, number>> = {},
  ): void {
    running.get(uid)?.stop(true);
    running.delete(uid);
    const plan = planPerformance(performance, anchor, site);
    if (!plan) return;
    const lang = document.documentElement.lang.startsWith('zh') ? 'zh' : 'en';
    const lent = [who.coach, ...who.crew].filter((p): p is Person => !!p && !borrowed.has(p));
    for (const p of lent) borrowed.add(p);
    const coach = who.coach && lent.includes(who.coach) ? who.coach : null;
    const crew = who.crew.filter((p) => lent.includes(p));
    const p: Performance = perform(
      { scene: stage.scene, sched, world, lang, site },
      performance,
      performInput(who.coachId ?? undefined),
      { coach, juniors: crew },
      uid,
      anchor,
      { entry: entryFor(site, anchor), params },
    );
    running.set(uid, {
      stop(graceful = false) {
        p.stop(graceful);
        for (const q of lent) giveBack(q);
      },
      setParams: (x) => p.setParams(x),
    });
  }
  /** 卡片的活动（模拟的 activities）：借主教练 */
  function startCardActivity(uid: number, performance: string, anchor: string): void {
    const plan = planPerformance(performance, anchor, site);
    const coach = plan?.cast.startsWith('coach') ? headCoach() : null;
    startActivity(uid, performance, anchor, { coach, crew: [] });
  }

  /** 雨量直接到位（不淡入）：读档、快进以后不该先晴几秒再下（QA P2-7） */
  const snapRain = () => rain.update(60, 0, 0);
  function sync(s: GameState): void {
    state = s;
    if (s.weather === 'rain') rain.start();
    else rain.stop();
    snapRain();
    for (const p of running.values()) p.stop();
    running.clear();
    for (const p of [...borrowed]) giveBack(p);
    starPending = null;
    starQueued = null;
    starUntil = 0;
    landQueued = [];
    landAt = null;
    landUntil = 0;
    deferred = null;
    applyLooks(s, true);
    messShown.clear();
    heatAmt = s.weather === 'heat' ? 1 : 0;
    for (const who of stageHidden) who.root.visible = true;
    stageHidden.clear();
    staged = null;
    life.reset();
    const w = worldOf(s, content);
    for (const a of s.activities)
      if (a.started && s.t < a.end) startCardActivity(a.uid, w.activities.get(a.id)?.performance ?? '', a.anchor);
    jobShows.clear();
    idleSince.clear();
    slots.clear();
    motion.clear();
    for (const who of fades.keys()) setAlpha(who, 1);
    fades.clear();
    lastTime = null;
    // 读档、新开局：所有人直接站到该在的地方（下一帧 placeStaff 按 snap 处理）
    snapNext = true;
  }

  /* ---------- 员工：每个人按岗位站好，走在路上的沿画面路径走（ADR 0012） ---------- */
  const staffPerson = (id: string): Person | null => (id === DIRECTOR ? you : (cast.get(id) ?? null));
  /**
   * 同一个地点站着几个人：按顺序错开（QA P2-6：以前都挤在站位上，有的站进了柱子里）。
   * 站位本身常常贴着楼、柱子、门柱（会所的露台柱、大门的门柱），所以第一个人也不站在站位正中，
   * 而是往南（默认镜头这边、楼外面）挪一点，几个人前后左右错开 1.4 米以上。
   */
  const SPREAD = [
    { x: -1.2, z: 1.6 },
    { x: 0.2, z: 2.8 },
    { x: -1.6, z: 3.4 },
    { x: -0.6, z: 4.4 },
    { x: 1.4, z: 4.0 },
    { x: -2.8, z: 4.6 },
    { x: 0.8, z: 5.6 },
  ];
  /** 场上干活的人：在底线外沿着底线错开（x 是离网远近，z 是沿底线） */
  const COURT_SPREAD = [
    { x: 0, z: 0 },
    { x: 1.4, z: 2.4 },
    { x: -0.2, z: 4.6 },
    { x: 1.4, z: -2.4 },
    { x: 1.2, z: 6.8 },
    { x: -0.4, z: -4.4 },
    { x: -0.4, z: 8.8 },
  ];
  /**
   * 第 k 个在这个地点干活（或闲着溜达的中心）的人站哪儿（只是画面）：
   * 有球场的地点站在离站位最近的那块场地里、靠站位那头的底线外（围网里面的空地，不站在围网后面，
   * 也不和清场演出的垃圾箱叠在一起）；其他地点在站位旁边错开。
   */
  function workSpot(at: string, base: XZ, k: number): XZ {
    const frs = site.courts[at];
    if (frs?.length) {
      let f = frs[0] as (typeof frs)[number];
      for (const g of frs)
        if (Math.hypot(g.ox - base.x, g.oz - base.z) < Math.hypot(f.ox - base.x, f.oz - base.z)) f = g;
      const l = f.l(base);
      const sx = l.x >= 0 ? 1 : -1;
      const sz = l.z >= 0 ? 1 : -1;
      // 底线外那一条（清场演出的垃圾箱在 (±9.2, -4.6) 附近，球员站位在底线以内）
      const bx = sx * 12.6;
      const bz = l.z * 0.2;
      const o = COURT_SPREAD[k % COURT_SPREAD.length] as XZ;
      let x = clamp(bx + sx * o.x, -(f.hx - 1.2), f.hx - 1.2);
      // 不站在网上
      if (Math.abs(x) < 1.4) x = sx * 1.4;
      const z = clamp(bz - sz * o.z, -(f.hz - 1), f.hz - 1);
      const p = f.w({ x, z });
      return { x: p.x, z: p.z };
    }
    const o = SPREAD[k % SPREAD.length] as XZ;
    return { x: base.x + o.x, z: base.z + o.z };
  }
  /**
   * 每个人在一个地点上的位子（第几个）：先来的先占，一直留到他离开这个地点；走了位子空出来，后来的人补最小的空位。
   * 这样有人到了、走了，别人不会被挤着换位子（以前按名字排序，总监永远占 0 号，一来就把 Dale 挤开 2.8 米）。
   */
  const slots = new Map<string, { at: string; k: number }>();
  function slotOf(id: string, at: string): number {
    const mine = slots.get(id);
    if (mine?.at === at) return mine.k;
    const used = new Set<number>();
    for (const [o, x] of slots) if (o !== id && x.at === at) used.add(x.k);
    let k = 0;
    while (used.has(k)) k++;
    slots.set(id, { at, k });
    return k;
  }
  /**
   * 画面上的走法（只是画面）：lead 是先要走完的一段折线（新招的人从停车场走进来、辞退的人走出去），
   * exit 表示走完就藏起来；prev 是上一帧的目标点，用来估计目标移动的速度（追路线上的人用）。
   */
  interface Motion {
    lead: XZ[];
    exit: boolean;
    prev: XZ | null;
    /** 上一帧的模拟路线（起点、终点、出发时间；改道、到了都会换） */
    walk: string | null;
  }
  const motion = new Map<string, Motion>();
  const motionOf = (id: string): Motion => {
    let m = motion.get(id);
    if (!m) motion.set(id, (m = { lead: [], exit: false, prev: null, walk: null }));
    return m;
  };
  /** 读档、新开局、夜里跳到第二天：下一帧所有人直接站到该在的地方 */
  let snapNext = false;
  /** 从 a 沿步道走到 b 的折线（不认识的地点：直线） */
  const route = (a: string, b: string): XZ[] => site.routeLine(a, b) ?? [STANDS[a] ?? home, STANDS[b] ?? home];
  /** 闲着溜达的人离场地围网至少多远（米；两头的围网再多留 1 米，站在底线后面） */
  const FENCE_GAP = 2.8;
  /** 停车场（没有的地图用大门） */
  const LOT = STANDS.parking ? 'parking' : 'entrance';
  /**
   * 闲着溜达的点留在场地的围网里面、离围网至少 FENCE_GAP 米，也不过网（QA：outer_1 的站位贴着围网，
   * 溜达时人在围网两边来回，被挡住的剪影一秒闪四次）。围网有 3 米高，离得太近时人在被挡住和不被挡住之间来回，
   * 所以留得比 1 米宽。连续的夹取，路线不跳。
   */
  function insideCourt(at: string, pt: XZ, side: XZ): XZ {
    const frs = site.courts[at];
    if (!frs?.length) return pt;
    let f = frs[0] as (typeof frs)[number];
    for (const g of frs) if (Math.hypot(g.ox - side.x, g.oz - side.z) < Math.hypot(f.ox - side.x, f.oz - side.z)) f = g;
    const l = f.l(pt);
    const sx = f.l(side).x >= 0 ? 1 : -1;
    const x = sx * clamp(sx * l.x, 1.4, f.hx - FENCE_GAP - 1);
    const z = clamp(l.z, -(f.hz - FENCE_GAP), f.hz - FENCE_GAP);
    const w = f.w({ x, z });
    return { x: w.x, z: w.z };
  }
  /** 沿 lead 往前走：走到这一点就换下一点；返回此刻要去的点（走完了返回 null） */
  function leadStep(m: Motion, who: Person): XZ | null {
    while (m.lead.length) {
      const q = m.lead[0] as XZ;
      if (Math.hypot(q.x - who.pos.x, q.z - who.pos.z) > 0.15) return q;
      m.lead.shift();
    }
    return null;
  }
  const leadLeft = (m: Motion, who: Person): number => {
    let d = 0;
    let a: XZ = who.pos;
    for (const q of m.lead) {
      d += Math.hypot(q.x - a.x, q.z - a.z);
      a = q;
    }
    return d;
  };
  /**
   * 员工的像素溶解（只是画面）：新招的人在停车场溶解出现、辞退的人走到停车场溶解掉，和背景会员一样（life.ts），
   * 不再整个人一下子冒出来、消失。身体、发型、覆盖物、手里的东西一起溶解。
   */
  const fades = new Map<Person, { a: number; b: number; t: number; d: number }>();
  /** 溶解一次要多久（秒，真实时间；和 life.ts 一样） */
  const FADE = 0.6;
  function setAlpha(who: Person, a: number): void {
    who.root.traverse((n) => {
      if (n.kind === 'sprite') (n as Sprite).opacity = a;
    });
  }
  /** 从此刻的不透明度溶解到 to（已经在往 to 溶解就不重来） */
  function fadeTo(who: Person, to: number): void {
    const f = fades.get(who);
    if (f?.b === to) return;
    const from = f ? f.a + (f.b - f.a) * Math.min(1, f.t / Math.max(1e-6, f.d)) : who.root.visible ? 1 : 0;
    fades.set(who, { a: from, b: to, t: 0, d: FADE * Math.abs(to - from) });
    setAlpha(who, from);
  }
  /** 立刻到位（读档、跳时间） */
  function fadeNow(who: Person, to: number): void {
    fades.delete(who);
    setAlpha(who, to);
  }
  function tickFades(dt: number): void {
    for (const [who, f] of fades) {
      f.t += dt;
      if (f.t < f.d) {
        setAlpha(who, f.a + (f.b - f.a) * (f.t / f.d));
        continue;
      }
      fades.delete(who);
      if (f.b <= 0) {
        // 溶解完了：藏起来，不透明度还原（下次招回来从 0 溶解出现）
        who.root.visible = false;
        setAlpha(who, 1);
      } else setAlpha(who, f.b);
    }
  }
  /** 游戏分钟 / 真实秒（按最近几帧估；刚出发汇合路线时把走路速度换成米/游戏分钟） */
  let gmps = 6;
  /**
   * 汇合路线时比路线上的插值点快几倍（插值点 1× 时已经比小跑快；站位旁边的闲逛点常在出发方向的后面，
   * 慢了要追一秒多，QA：开走时落后 4~5 米）
   */
  const JOIN_K = 2.2;
  /** 小游戏接管着一块场：总监，和站在那块场上的员工，都藏起来（小游戏自己画总监） */
  function hideStaged(s: GameState): void {
    if (!staged) return;
    const w = worldOf(s, content);
    const a = w.facilities.get(staged)?.anchor ?? staged;
    for (const [id, p] of Object.entries(s.people)) {
      const who = staffPerson(id);
      if (!who || !p.hired || (id !== DIRECTOR && (p.walk || p.at !== a))) continue;
      if (who.root.visible) {
        who.root.visible = false;
        stageHidden.add(who);
      }
    }
  }
  function placeStaff(s: GameState, w: World, time: number, sdt: number, snap: boolean): void {
    for (const id of Object.keys(s.people).sort((a, b) =>
      a === DIRECTOR ? -1 : b === DIRECTOR ? 1 : a.localeCompare(b),
    )) {
      const p = s.people[id];
      const who = staffPerson(id);
      if (!p || !who) continue;
      // 扫场小游戏接管着这块场：这个人藏着（小游戏自己画总监），不按岗位摆
      if (stageHidden.has(who)) continue;
      const m = motionOf(id);
      if (!isStaff(s, w, id)) {
        slots.delete(id);
        idleSince.delete(id);
        // 辞退了：沿步道走回停车场再消失（读档、跳时间时直接藏起来）
        if (who.root.visible && !snap && !borrowed.has(who)) {
          if (!m.exit) {
            m.exit = true;
            m.lead = route(p.at, LOT);
            if (who.phone) who.phone.visible = false;
            who.base = BASE0(who);
            who.seatY = null;
            who.writing = false;
            idleAct.delete(id);
            busyT.delete(id);
          }
          const q = leadStep(m, who);
          who.clearMoves();
          if (q) {
            if (sdt > 0) who.go(q.x, q.z, leadLeft(m, who) > 14 ? STAFF_RUN : STAFF_WALK);
            continue;
          }
          // 走到停车场了：原地溶解掉（溶解完 tickFades 把人藏起来）
          fadeTo(who, 0);
          continue;
        }
        if (fades.has(who)) fadeNow(who, 1);
        who.root.visible = false;
        m.exit = false;
        m.lead = [];
        m.prev = null;
        continue;
      }
      if (borrowed.has(who)) {
        m.prev = null;
        continue;
      }
      if (m.exit) {
        // 走到一半又被招回来：接着按岗位走（溶解了一半的溶解回来）
        m.exit = false;
        m.lead = [];
        if (fades.has(who)) fadeTo(who, 1);
      }
      if (snap && fades.has(who)) fadeNow(who, 1);
      if (!who.root.visible) {
        who.root.visible = true;
        // 新招的人在停车场溶解出现，沿步道走进来，走到他该在的地方（读档、跳时间时直接站好）
        if (snap) fadeNow(who, 1);
        else {
          fades.set(who, { a: 0, b: 1, t: 0, d: FADE });
          setAlpha(who, 0);
          const line = route(LOT, p.walk ? p.walk.from : p.at);
          const start = line[0] ?? home;
          who.clearMoves();
          who.pos.x = start.x;
          who.pos.z = start.z;
          m.lead = line.slice(1);
        }
      }
      if (p.walk) slots.delete(id);
      const k = p.walk ? 0 : slotOf(id, p.at);
      const base = STANDS[p.at] ?? home;
      const fr = site.courts[p.at]?.[0];
      const center = fr ? { x: fr.ox, z: fr.oz } : (site.anchors[p.at] ?? null);
      // 闲着（没派活，或者岗位还没到时段、条件没了）：在站位附近溜达、看手机、坐下（idle.ts，只是画面）
      const post = p.job ? w.posts.get(p.job) : undefined;
      const pst = post ? postStatus(s, w, post) : null;
      const offHours = !!pst && !p.walk && !p.errand && (!pst.inHours || !pst.exists);
      const idle = !p.walk && !p.errand && (!p.job || offHours);
      if (!idle) idleSince.set(id, time);
      const court = !!site.courts[p.at]?.length;
      const plan0 = idle
        ? idlePlan(
            id,
            time,
            time - (idleSince.get(id) ?? time),
            court ? insideCourt(p.at, base, base) : workSpot(p.at, base, k),
            !!who.phone,
            offHours ? 3.5 : 6,
            center,
          )
        : null;
      const plan = plan0 && court ? { ...plan0, ...insideCourt(p.at, plan0, base) } : plan0;
      // 走在路上：面朝路线这一段的走向（不按追插值点剩下的零头转身，QA P1-1）
      const heading = p.walk ? walkHeading(site, w, p.walk, time) : null;
      // 总监亲手扫场（careFinish 以后在场上办事）：在场地上来回走着扫，弯腰起身（只是画面）
      const sweep = id === DIRECTOR ? directorSweeping(s, w) : null;
      const sfr = sweep ? site.courts[sweep]?.[0] : undefined;
      let target: XZ;
      if (p.walk) target = walkPoint(site, w, p.walk, time);
      else if (plan) target = { x: plan.x, z: plan.z };
      else if (sfr) {
        const q = sfr.w({ x: Math.sin(time * 0.045) * 9, z: Math.sin(time * 0.017 + 1) * 3.6 });
        target = { x: q.x, z: q.z };
      } else target = workSpot(p.at, base, k);
      if (p.walk) m.lead = [];
      // 目标这一帧沿路线挪了多远：只在上一帧也走在同一条路上时才算（刚出发、刚到时目标是跳过去的，不能拿来定速度）
      const wk = p.walk ? `${p.walk.from}>${p.walk.to}@${p.walk.start}` : null;
      const step = wk && m.prev && m.walk === wk ? Math.hypot(target.x - m.prev.x, target.z - m.prev.z) : 0;
      m.prev = target;
      m.walk = wk;
      who.clearMoves();
      if (snap) {
        // 跳时间（读档、暂停时快进、夜里黑屏的时候）：直接站到该在的地方
        m.lead = [];
        who.pos.x = target.x;
        who.pos.z = target.z;
        if (heading != null) who.yaw = heading;
      } else if (sdt > 0) {
        const lead = leadStep(m, who);
        if (lead) {
          // 先走完进场的那段路（远就小跑）
          who.go(lead.x, lead.z, leadLeft(m, who) > 14 ? STAFF_RUN : STAFF_WALK);
        } else {
          const dist = Math.hypot(target.x - who.pos.x, target.z - who.pos.z);
          if (p.walk && step > 0 && dist <= Math.max(0.35, step * 1.5)) {
            // 跟得上：正好走在模拟的路线上
            if (dist > 0.01) who.go(target.x, target.z, dist / sdt, heading != null ? { face: heading } : {});
          } else if (p.walk && dist > 0.01) {
            // 刚出发（人站在站位旁边，离路线起点几米）、演出刚还回来、走进场刚走完：不在插值点后面追，
            // 斜着走上路线，在插值点前面汇合（walkpath.joinPoint），汇合了就按上面那一支正好跟着走
            const line = walkRate(site, w, p.walk, time) * gmps;
            const v = Math.max(dist > 3 ? STAFF_RUN : STAFF_WALK, line * JOIN_K);
            const j = joinPoint(site, w, p.walk, time, who.pos, v / Math.max(0.1, gmps));
            const dj = Math.hypot(j.x - who.pos.x, j.z - who.pos.z);
            if (dj > 0.01) who.go(j.x, j.z, Math.min(v, dj / sdt));
          } else if (dist > 0.01) {
            // 跟不上（刚到、演出刚还回来、刚换了位子）：按走路速度走过去
            const v = dist > 8 ? STAFF_RUN : STAFF_WALK;
            who.go(target.x, target.z, Math.min(v, dist / sdt));
          }
        }
      }
      if (p.walk && heading != null && !m.lead.length) who.idleFace = heading;
      if (!p.walk) {
        // 站着的时候面朝地点的中心（球场、喷泉、会所）；闲着时东张西望
        who.idleFace = plan?.face ?? (center ? Math.atan2(center.x - who.pos.x, center.z - who.pos.z) : null);
        if (snap && who.idleFace != null) who.yaw = who.idleFace;
      }
      actIdle(id, who, plan);
      if (sweep) actWork(id, who, 'upkeep');
      else if (!plan && working(s, w, id) && (!pst || pst.exists))
        actWork(id, who, post?.skill ?? (p.job ? w.orders.get(p.job)?.skill : undefined));
      else if (busyT.has(id)) {
        busyT.delete(id);
        who.writing = false;
        if (!plan) who.base = BASE0(who);
      }
    }
  }

  /* ---------- 闲着和干活的小动作（ART-9 原型）：只是画面，不碰模拟 ---------- */
  /** 每个人什么时候开始闲着的（游戏分钟；画面自己记，读档后从零算） */
  const idleSince = new Map<string, number>();
  const idleAct = new Map<string, string>();
  const busyT = new Map<string, number>();
  let jumped = false;
  let lastTime: number | null = null;
  const BASE0 = (who: Person): PoseName => (who === you ? 'director' : 'relaxed');
  function actIdle(id: string, who: Person, plan: ReturnType<typeof idlePlan> | null): void {
    const key = plan ? `${plan.act}:${plan.block}` : '';
    if (idleAct.get(id) === key) return;
    const was = idleAct.get(id);
    idleAct.set(id, key);
    if (!plan) {
      idleAct.delete(id);
      if (was === undefined) return;
    }
    // 换了一件事：先还原，再摆新姿势
    who.base = BASE0(who);
    who.seatY = null;
    if (who.phone) who.phone.visible = false;
    if (!plan) return;
    if (plan.act === 'phone' && who.phone) {
      who.base = 'phoneStand';
      who.phone.visible = true;
    } else if (plan.act === 'sit') {
      who.base = 'sitGround';
      who.seatY = site.groundY(plan.x, plan.z) - 0.62 * who.root.scale.x;
    } else if (plan.act === 'fidget') {
      const g = (['shrug', 'facepalm', 'hand'] as const)[plan.block % 3] ?? 'shrug';
      who.gesture(g, sched.now + 0.3, 1.6);
    }
  }
  /** 在没有活动演出的岗位上按技能比划：维护的弯腰擦扫，接待的说话招手，教学的指点拍手 */
  function actWork(id: string, who: Person, skill: string | undefined): void {
    const t = busyT.get(id) ?? 0;
    if (sched.now < t) return;
    busyT.set(id, sched.now + 1.6 + rnd() * 1.4);
    if (skill === 'upkeep') {
      const down = who.base !== 'stoop';
      who.base = down ? 'stoop' : BASE0(who);
      who.writing = down;
      return;
    }
    const pool =
      skill === 'teach'
        ? (['point', 'clap', 'whistle', 'cheer'] as const)
        : (['talk', 'wave', 'hand', 'point'] as const);
    who.gesture(pool[Math.floor(rnd() * pool.length)] ?? 'talk', sched.now, 1.4);
  }

  /* ---------- 岗位和工单的演出：有人到场了才演，没人在干了就收场（演出只读状态） ---------- */
  /** 正在演的岗位、工单：演出 uid，借去演的员工 */
  const jobShows = new Map<string, { uid: number; cast: string[] }>();
  let nextShowUid = -1;
  function syncJobShows(s: GameState, w: World): void {
    const want = new Map<string, { performance: string; at: string; here: string[]; progress: number }>();
    /** 已经走到、在干这件事的人（模拟的 working）：主教练排前面 */
    const arrived = (job: string) =>
      Object.values(s.people)
        .filter((p) => p.hired && p.job === job && working(s, w, p.id))
        .map((p) => p.id)
        .sort((a, b) => (a === s.headCoach ? -1 : b === s.headCoach ? 1 : a.localeCompare(b)));
    for (const post of w.posts.values()) {
      if (!post.performance) continue;
      const st = postStatus(s, w, post);
      // 岗位的条件没了（例如设施坏了）、不在时段里：马上收场
      if (!st.exists || (st.demand && !st.inHours)) continue;
      const here = arrived(post.id);
      if (!here.length) continue;
      want.set(post.id, { performance: post.performance, at: post.at, here, progress: st.progress });
    }
    for (const o of w.orders.values()) {
      if (!o.performance || !s.orders[o.id]) continue;
      const here = arrived(o.id);
      if (!here.length) continue;
      want.set(o.id, { performance: o.performance, at: o.at, here, progress: orderStatus(s, w, o).progress });
    }
    for (const [id, show] of jobShows) {
      const x = want.get(id);
      // 借去演的人还在干这件事：接着演，只更新到场人数和进度
      if (x && show.cast.every((c) => x.here.includes(c))) {
        running.get(show.uid)?.setParams?.({ crewN: x.here.length, progress: clamp(x.progress, 0, 1) });
        continue;
      }
      running.get(show.uid)?.stop(true);
      running.delete(show.uid);
      jobShows.delete(id);
    }
    // 小游戏接管着的那块场：不演（停着的在 careStage 里收掉了）
    if (staged) for (const [id, x] of want) if (x.at === staged) want.delete(id);
    for (const [id, x] of want) {
      if (jobShows.has(id)) continue;
      const plan = planPerformance(x.performance, x.at, site);
      // 只在有场地的地点上演；会所、广场的活由人站在那儿比划
      if (!plan) continue;
      if ([...jobShows.keys()].some((k) => (w.posts.get(k)?.at ?? w.orders.get(k)?.at) === x.at)) continue;
      // 借到场的人：要教练的演出，到场的第一个人当教练；清场的演出，到场的人都下场干活
      const free = x.here.filter((pid) => {
        const q = staffPerson(pid);
        return !!q && !borrowed.has(q) && q.root.visible;
      });
      const wantsCoach = plan.cast.startsWith('coach');
      if (wantsCoach && !free.length) continue;
      const coachId = wantsCoach ? (free[0] as string) : null;
      const crewIds = plan.activity === 'cleanup' ? free : [];
      const cast = [...(coachId ? [coachId] : []), ...crewIds];
      const uid = nextShowUid--;
      jobShows.set(id, { uid, cast });
      startActivity(
        uid,
        x.performance,
        x.at,
        {
          coach: coachId ? staffPerson(coachId) : null,
          crew: crewIds.map((c) => staffPerson(c)).filter((q): q is Person => !!q),
          coachId,
        },
        { crewN: x.here.length, progress: clamp(x.progress, 0, 1) },
      );
    }
  }

  /* ---------- 园区的日常：来打球的会员、路人、风沙（准则 6） ---------- */
  const life = createLife({
    world: stage,
    site,
    // 地块上的新地点（W5）没有设施状态：开了，地图画的几块场地就都能打
    courtsAt: (s, a) => {
      const w = worldOf(s, content);
      return w.plotAt.has(a) ? (placeOpen(s, w, a) ? (site.courts[a]?.length ?? 0) : 0) : courtsAt(w, s, a);
    },
    placeOpen: (s, a) => placeOpen(s, worldOf(s, content), a),
    sched,
    rnd,
    person: (i) => {
      const p = mk({
        name: `Member ${i + 1}`,
        x: 0,
        z: 0,
        base: 'relaxed',
        shirt: SHIRTS[(i * 5 + 2) % SHIRTS.length] as string,
        shorts: i % 2 ? '#f1ece0' : '#3a3f4a',
        pants: i % 5 === 4,
        skin: SK[(i * 3 + 1) % SK.length] as string,
        hair: HAIRS[(i * 2 + 1) % HAIRS.length] as string,
        hairStyle: STYLES[(i + 2) % STYLES.length],
        cap: SHIRTS[(i + 5) % SHIRTS.length] as string,
        shoes: '#f1ece0',
        reach: 0.8,
        racket: ['#d6362f', '#3a8fd9', '#f0a020'][i % 3] as string,
      });
      p.root.visible = false;
      return p;
    },
    rally: (a, b, o) => rally(a, b, o),
    careLevel: (s, a) => {
      const w = worldOf(s, content);
      const f = w.facilityAt.get(a);
      return f && careActive(s, w, f) ? careLevelOf(s, w, f) : null;
    },
    gateQueue: (s) =>
      Object.entries(s.care ?? {})
        .filter(([, c]) => (c.waiting?.n ?? 0) > 0)
        .map(([f, c]) => ({ anchor: worldOf(s, content).facilities.get(f)?.anchor ?? f, n: c.waiting?.n ?? 0 })),
    ...(tr ? { tr } : {}),
    waiting: (s) => {
      const w = worldOf(s, content);
      const by = new Map<string, { anchor: string; served: boolean; unserved: number }>();
      for (const post of w.posts.values()) {
        const st = postStatus(s, w, post);
        if (!st.exists || !st.demand || !st.inHours) continue;
        const x = by.get(post.at) ?? { anchor: post.at, served: false, unserved: 0 };
        if (st.active) x.served = true;
        else x.unserved++;
        by.set(post.at, x);
      }
      return [...by.values()];
    },
    busy: (anchor) =>
      !!state &&
      (state.activities.some((x) => x.started && x.anchor === anchor && state && state.t < x.end) ||
        [...jobShows.keys()].some((k) => {
          const w = worldOf(state as GameState, content);
          return (w.posts.get(k)?.at ?? w.orders.get(k)?.at) === anchor;
        })),
  });

  /* ---------- 卡片的镜头 ---------- */
  let focusAnchor: string | null = null;
  let focusUntil = 0;
  let focusSeq = 0;
  let previewOn: string | null = null;
  /** 升星镜头停到什么时候（realNow）；这之前来的卡先记着，停完再转过去 */
  let starUntil = 0;
  /** 新地启用：排着的（锚点）、正在看的那一处、停到什么时候（realNow） */
  let landQueued: { anchor: string; plot: string; variant: string }[] = [];
  let landAt: { anchor: string; plot: string; variant: string } | null = null;
  let landUntil = 0;
  /** 升星、新地的镜头停到什么时候 */
  const holdUntil = () => Math.max(starUntil, landUntil);
  let deferred: { at: string; secs: number } | null = null;
  const focusOn = (at: string, secs: number) => {
    if (realNow < holdUntil()) {
      deferred = { at, secs };
      return;
    }
    focusAnchor = at;
    focusUntil = sched.now + secs;
    focusSeq++;
  };
  /** 开演升星：镜头转到星级牌，0.9 秒后点亮新星，再停 2.5 秒 */
  const playStar = (n: number) => {
    starPending = { n, wait: STAR_LIGHT_WAIT };
    starUntil = realNow + STAR_LIGHT_WAIT + STAR_HOLD;
    focusAnchor = null;
    focusSeq++;
  };

  /** 设施 id → 锚点（五块球场两者同名，契约这么定；对不上时按设施表找） */
  const anchorOf = (w: World, f: string) => w.facilities.get(f)?.anchor ?? f;

  return {
    showNow: () => sched.now,
    careStage(facility) {
      if (facility === staged) return;
      const s = state;
      const w = s ? worldOf(s, content) : null;
      const prev = staged;
      // 还原：藏起来的人露出来（就在原地，下一帧 placeStaff 接着摆）、地面整个重画、被停下的卡片活动重新开演
      for (const who of stageHidden) who.root.visible = true;
      stageHidden.clear();
      staged = facility;
      life.stage(facility ? (w ? anchorOf(w, facility) : facility) : null);
      if (!facility) {
        overlays.repaint?.();
        messShown.clear();
        if (s && w && prev) {
          const a = anchorOf(w, prev);
          for (const x of s.activities)
            if (x.started && s.t < x.end && x.anchor === a && !running.has(x.uid))
              startCardActivity(x.uid, w.activities.get(x.id)?.performance ?? '', x.anchor);
        }
        return;
      }
      overlays.mess?.(facility, null);
      messShown.set(facility, '');
      if (!s || !w) return;
      const a = anchorOf(w, facility);
      // 那块场上的演出停下（岗位、工单的演出由 syncJobShows 接管期间不再开）
      for (const [id, show] of jobShows)
        if ((w.posts.get(id)?.at ?? w.orders.get(id)?.at) === a) {
          running.get(show.uid)?.stop();
          running.delete(show.uid);
          jobShows.delete(id);
        }
      for (const x of s.activities)
        if (x.started && x.anchor === a) {
          running.get(x.uid)?.stop();
          running.delete(x.uid);
        }
      hideStaged(s);
    },
    setContent(c) {
      content = c;
    },
    sync,
    onEvents(s, events) {
      state = s;
      const w = worldOf(s, content);
      for (const e of events) {
        if (e.type === 'activityStarted') startCardActivity(e.uid, e.performance, e.anchor);
        else if (e.type === 'activityFinished') {
          running.get(e.uid)?.stop(true);
          running.delete(e.uid);
        } else if (e.type === 'log') {
          for (const x of e.entry.effects)
            if (x.kind === 'facility') {
              overlays.set(x.facility, x.state);
              // 修好了：镜头过去看一眼（ADR 0015：修好就是解锁，画面也跟着复原）
              const at = w.facilities.get(x.facility)?.anchor;
              if (at) focusOn(at, 4);
            }
        } else if (e.type === 'cardOpened') {
          const c = w.cards.get(e.card);
          const loc = c?.stage?.anchor ?? c?.location;
          if (loc) focusOn(loc, 6);
        } else if (e.type === 'star_up') {
          // 升星是一个时刻（game-design.md）：镜头转到星级牌，到了再点亮新星。
          // 先排着：夜里跳天、快进时发生的，等玩家看得见画面了再演（update 里开演）
          starQueued = Math.max(starQueued ?? 0, e.stars);
        } else if (e.type === 'plot_open') {
          // 新地启用（W5）：镜头飞过去停一拍再回来；和升星一样，看不见画面时先排着
          if (!landQueued.some((x) => x.anchor === e.anchor))
            landQueued.push({ anchor: e.anchor, plot: e.plot, variant: e.variant });
        } else if (e.type === 'memberWalkedOut') life.walkout(anchorOf(w, e.court));
        else if (e.type === 'waitingEnded') life.ended(anchorOf(w, e.court), e.reason);
        else if (e.type === 'careGrumble') life.grumble(anchorOf(w, e.court));
        else if (e.type === 'weather') {
          // 天气由模拟决定：雨天下雨，其他天放晴
          if (e.weather === 'rain') rain.start();
          else rain.stop();
        }
      }
    },
    update(s, time, dt, paused) {
      state = s;
      const sdt = paused ? 0 : dt;
      jumped = paused && lastTime !== null && Math.abs(time - lastTime) > 0.5;
      // 走着走着时间跳了一大段（夜里跳到第二天早上：main.ts 先黑屏再调这里）：人直接站到位
      const leap = lastTime !== null && Math.abs(time - lastTime) > 30;
      const snap = jumped || leap || snapNext;
      snapNext = false;
      // 时间跳了（快进、调试跳天）：天气按此刻的模拟状态直接到位
      if (jumped || leap) {
        if (s.weather === 'rain') rain.start();
        else rain.stop();
        snapRain();
      }
      // 游戏分钟 / 真实秒：按最近几帧平滑（倍速、没事时加速都会变）
      if (sdt > 0 && lastTime !== null && !snap) {
        const g = (time - lastTime) / sdt;
        if (g > 0 && g < 200) gmps += (g - gmps) * 0.2;
      }
      lastTime = time;
      sched.advance(sdt);
      tickFades(sdt);

      const w = worldOf(s, content);
      syncJobShows(s, w);
      placeStaff(s, w, time, sdt, snap);
      hideStaged(s);
      applyMess(s, w);

      // 主教练：总监不在场时专注度低（有的教练爱看手机）
      const coachId = s.headCoach;
      const coach = coachId ? cast.get(coachId) : null;
      if (coach && coachId && coach.base !== 'ready' && !borrowed.has(coach) && working(s, w, coachId)) {
        const distracted = coachAttention(s, w) < 0.6;
        coach.base = distracted ? 'phoneStand' : 'relaxed';
        if (coach.phone) coach.phone.visible = distracted;
      }

      // 暂停时游戏时间也跳了（试玩桥、调试快进）：路人、风沙这些按一小段时间补上，截图不再定格在同一帧
      const adv = sdt > 0 ? sdt : jumped ? 0.5 : 0;
      life.update(s, adv);
      // 变体、升级、牌匾、星级：和模拟状态对一下（读档、改造期满、解锁变体都靠这一步跟上）
      applyLooks(s);
      realNow += dt;
      // 局已经结束（★5 往往就在结局前一刻升）：结局卡停着画面时间，升星动画走不完会一直停在旧星数上。
      // 不再等镜头和夜里，也不播动画，牌子直接换成现在的星数（结局画面上不会少一颗）
      if (!s.outcome) starsFinal = false;
      else if (!starsFinal || starQueued !== null || starPending) {
        starsFinal = true;
        const n = Math.max(s.stars ?? 0, starQueued ?? 0, starPending?.n ?? 0);
        starQueued = null;
        starPending = null;
        starsShown = n;
        setStars(n, false);
      }
      if (starQueued !== null && watching && !starPending && realNow >= landUntil) {
        playStar(starQueued);
        starQueued = null;
      }
      // 新地启用：升星演完了（或者没有升星）再飞过去
      if (landQueued.length && watching && !starPending && starQueued === null && realNow >= holdUntil()) {
        landAt = landQueued.shift() ?? null;
        landUntil = realNow + LAND_HOLD;
        focusAnchor = null;
        focusSeq++;
      }
      // 升星、新地的镜头停完了：停的时候来的卡这才把镜头要过去
      if (deferred && realNow >= holdUntil()) {
        const d = deferred;
        deferred = null;
        focusOn(d.at, d.secs);
      }
      if (starPending) {
        starPending.wait -= dt;
        if (starPending.wait <= 0) {
          starsShown = starPending.n;
          setStars(starPending.n, true);
          starPending = null;
        }
      }
      starSign?.update(dt, sched.now);
      // 状况看得见（ART-8 原型）：修好的设施状况往下掉，先长沙、草、垃圾，再掉档
      for (const [f, st] of Object.entries(s.facilities)) {
        const decays = (w.facilities.get(f)?.states[st]?.decay_day ?? 0) > 0;
        overlays.wear?.(f, decays ? wearOf(s.condition[f] ?? 100) : 0);
      }

      for (const p of world.people) p.update(sdt, sched.now);
      pool.update(sched.now);
      rain.update(sdt, 0, 0);
      // 酷热（court-care-contract.md）：天色偏暖发白、地面热浪，慢慢淡入淡出；时间跳了直接到位
      const hot = s.weather === 'heat' ? 1 : 0;
      heatAmt = snap ? hot : heatAmt + (hot - heatAmt) * Math.min(1, dt * 0.6);
      daylight.update(time % 1440, rain.amount(), heatAmt);
      // 风力：大风天最大，春天风季次之（ambient 里风滚草和扬沙跟着变）
      const wind = s.weather === 'wind' ? 1 : s.season === 'spring' ? 0.55 : 0.25;
      if (sdt > 0) {
        ambT += sdt;
        sky.update(sdt, ambT, rain.amount(), wind, heatAmt);
      } else if (jumped)
        for (let i = 0; i < 40; i++) {
          ambT += 0.1;
          sky.update(0.1, ambT, rain.amount(), wind, heatAmt);
        }
    },
    directorHead: () => {
      const p = you.headTop.getWorldPosition();
      return { x: p.x, y: p.y, z: p.z };
    },
    preview(facility, variant) {
      if (facility !== previewOn && previewOn) overlays.preview?.(previewOn, null);
      previewOn = variant ? facility : null;
      if (facility) overlays.preview?.(facility, variant);
    },
    landPreview(plot, variant) {
      ov.landPreview?.(plot, variant);
    },
    setWatching(on) {
      watching = on;
    },
    focus() {
      if (realNow < starUntil) return { x: STAR_SIGN_AT.x, z: STAR_SIGN_AT.z, y: STAR_SIGN_LIFT, seq: focusSeq };
      if (realNow < landUntil && landAt) {
        // 地图给了这块地的镜头（整块新地的中间和缩放）就用它，不然对准锚点
        const lf = site.land?.focus?.(landAt.plot, landAt.variant);
        if (lf) return { x: lf.x, z: lf.z, seq: focusSeq, land: true, ...(lf.zoom ? { zoom: lf.zoom } : {}) };
        const p = site.anchors[landAt.anchor] ?? STANDS[landAt.anchor];
        if (p) return { x: p.x, z: p.z, seq: focusSeq, land: true };
      }
      if (!focusAnchor || sched.now > focusUntil) return null;
      const p = site.anchors[focusAnchor] ?? STANDS[focusAnchor];
      return p ? { x: p.x, z: p.z, seq: focusSeq } : null;
    },
  };
}

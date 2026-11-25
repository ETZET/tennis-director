// 俱乐部的一天：观察模式（docs/design/club-sim.md 第五节）。引擎（clubsite/sim）算每个人在哪、干什么；这里让人这么走、这么站、这么挥拍。
// - 打开（?sim=1，或 valley 调试面板"观察俱乐部的一天"）：场景演出里的人都藏起来（道具、车照旧），换成引擎的人；
//   时钟交给引擎（天光跟着引擎的分钟走：中午最亮、傍晚开灯）；底部出观察面板（hud.ts）。打开时先预热（身子一池子、fx 的道具和姿势）。
// - 引擎在固定步长里推（step：加速档位 × dt 攒够一分钟推一步）；画面每帧在两步之间插值（frame）。
// - 离镜头近的人才有身子（actors.ts 的池子，CAP 具：画面里坐着的先、近的先）；路上的人沿导航走（motion.ts：长路走干道的路口，
//   看台座位顺着排走到走道口），步子按走了多远推（motion.ts 的 stepGait：走 / 跑 / 冲，脚不溜）；到了按 doing 摆姿势（pose.ts）。
//   排队的一伙人只有一个站进队，同伙站旁边（queueSlot）。
// - 跟着一个人：镜头跟着他、头顶名字小牌、面板里他今天的日程；看一块场（跟着打球的人、look 到场上）镜头拉远到放得下整块场；
//   看全图：竖屏转过来（从东往西看，俱乐部竖着占满屏），区域细节收起来（底图顶着），每个人一个贴地的彩点（颜色 = 在干什么）；小地图上也是。
// - 总监：观察按钮把他放到前台柜台后面（朝着排队的人），引擎按"总监在前台"跑；面板里"总监离开前台"让他走开 / 走回来，用户也照样能把他走开。
//   镜头和总监分开：跟着一个人、look(x, z) 只挪镜头，不挪总监；不跟了 / 用户走总监，镜头回到总监。
// - 会所里的人（楼上楼下、屋顶下的一楼）：会所屋顶上一块小牌写人数；镜头看进会所（跟着的人进了会所）时会所切成剖面看一楼，镜头往下挪。
// - 跳时刻分几帧快进（每帧 JUMP_MS 毫秒），不卡一下；寻路用每帧剩下的时间（FRAME_MS）。
// 调试钩子 window.__clubsim：{ on, enable(on), jump(min), jumping, speed(x), view(), follow(id), look(x, z), overview(on), stats(), perf(), state() }。
import * as THREE from 'three';
import { SPOTS as DESK_SPOTS } from '../../clubdesk/layout';
import type { CastPerson } from '../../clubsite/cast/types';
import { SCENE_NAME } from '../../clubsite/cast/types';
import type { Daylight } from '../../clubsite/daylight';
import { setStride } from '../../clubsite/people';
import type { Play } from '../../clubsite/play';
import type {
  AgentId,
  AgentView,
  Intent,
  Minute,
  Place,
  PlaceId,
  SimConfig,
  SimEvent,
  SimState,
} from '../../clubsite/sim/types';
import type { Rect } from '../../clubsite/world';
import { COURTS, POOL } from '../../clubsite/world';
import { type Body, BodyPool, bodyKindOf, CAP, Dots, type Dresser } from './actors';
import { DEFAULT_SPEED, FAST, hhmm, periodOf, SimClock, SPEEDS } from './clock';
import { CAST, DAY_END, OPEN, PLACES, POSTS, personOf, SPOTS, seatWay, sim } from './deps';
import { createSimFx } from './fx';
import { gapLines, gapReport, noteGap } from './gaps';
import { type AgendaRow, createSimHud, type HudData } from './hud';
import {
  type Anchor,
  along,
  makeRoute,
  NO_PATH,
  type P2,
  PATH_BUDGET,
  PATH_MS,
  Planner,
  queueOf,
  type Route,
  spotOf,
  stepGait,
  trunk,
} from './motion';
import { type BodyKind, DOING_NAME, PERIOD, type PoseSpec, poseSpec } from './pose';
import type { PlaceSpots } from './types';

export interface SimHost {
  scene: THREE.Scene;
  pipe: {
    rig: { target: THREE.Vector3; metersPerTexel: number; pitch: number; yaw: number };
    px: number;
    lowSize: THREE.Vector2;
  };
  play: Play;
  director: THREE.Object3D;
  day: Daylight;
  params: URLSearchParams;
  viewRect(margin: number): Rect;
  /** 建一具 Q 版人（大人 / 孩子 / 少年），材质用总监那套 */
  make(kind: BodyKind): THREE.Object3D;
  dresser: Dresser | null;
  /** 预编着色器（颜色、法线、投影三套）：root 里的网格先编好，第一次画到时不卡；不给 = 不预编 */
  prewarm?(root: THREE.Object3D): Promise<unknown>;
  /** 场景演出里的人藏起来（true）/ 放回来 */
  suppressScene(on: boolean): void;
  /** 打开演员表的人物卡片 */
  openCard?(id: string): void;
  /** 这一点现在画不画得出来（总监在会所里时只画会所，外面是黑的：外面的人不给身子）；不给 = 都画 */
  visibleAt?(x: number, z: number): boolean;
  /** 会所现在是剖面（一楼看得见）还是外观（屋顶盖着） */
  houseOpen?(): boolean;
  /** 剖面看的是哪一层（总监下到负一层、上到二楼：−1 / 2；不给 = 1） */
  houseFloor?(): -1 | 1 | 2;
  /** 面板里点了"退出"（页面自己的按钮跟着变） */
  onExit?(): void;
}

export interface SimMount {
  readonly on: boolean;
  /** 引擎现在几点（游戏分钟）；还没开过 = null。退出再进接着看（valley 的调试按钮） */
  minute(): Minute | null;
  /** desk：总监站到前台柜台后面（朝排队的人），镜头先对着前院（看得到停车场、大门来的人） */
  enable(on: boolean, o?: { at?: Minute; speed?: number; panel?: boolean; desk?: boolean }): void;
  /** 固定步长（play.update 之后）：推引擎、管镜头 */
  step(dt: number): void;
  /** 每帧渲染前：摆人、名字小牌、面板 */
  frame(dt: number): void;
  /** 镜头在看哪（跟着人 / 看全图 / look 定住的地方）；null = 跟着总监 */
  focus(): { x: number; z: number } | null;
  /** 看全图：区域细节收起来 */
  overview(): boolean;
  /** 世界导航重建了：缓存的路作废 */
  navChanged(): void;
  openPanel(): void;
  /** 小地图上每个在场的人一个点（sx / sz：世界坐标 → 小地图像素） */
  drawMap(g: CanvasRenderingContext2D, sx: (x: number) => number, sz: (z: number) => number): void;
}

/** 取景外扩多少米以内的人给身子 */
const MARGIN = 5;
/** 到了以后走到站位的速度（米/真实秒）：走路的快步（长一点的路按 1.6 秒走完） */
const SETTLE_V = 1.6;
/** 顶上的按钮（像素、时间、小地图）占多高（CSS 像素）：跟着的人放在它和底部面板之间的正中 */
const TOP_UI = 120;
/** 跟着的人回家了，过几秒（真实秒）换一个 */
const GONE_S = 2.5;
/** 一伙人走路时左右让开多少米、前后两排隔多远 */
const SIDE = 0.38;
const ROW_BACK = 0.8;
/** 一伙人走路的队形（formationOf）：几个人 → 每个人 [往右手几米, 往后几米] */
const FORMATION: Record<number, readonly (readonly [number, number])[]> = {
  2: [
    [-SIDE, 0],
    [SIDE, 0.45],
  ],
  3: [
    [-SIDE, 0],
    [SIDE, 0.15],
    [0, ROW_BACK],
  ],
  4: [
    [-SIDE, 0],
    [SIDE, 0.15],
    [-SIDE, ROW_BACK],
    [SIDE, ROW_BACK + 0.15],
  ],
  5: [
    [0, 0],
    [-SIDE * 1.6, 0.2],
    [SIDE * 1.6, 0.2],
    [-SIDE, ROW_BACK + 0.1],
    [SIDE, ROW_BACK + 0.2],
  ],
};
const NO_OFFSET = [0, 0] as const;
/** 人人靠右走多少米（迎面过来的错开） */
const KEEP_RIGHT = 0.3;
/** 路的两头这么多米里队形慢慢收拢（从站位走出来、走到站位上） */
const LANE_FADE = 1.4;
/** 站着的人（排队、窗口边、柜台前、刚走到站位）身子至少隔多远（米）：近了互相推开一点（separate） */
const PERSONAL = 0.5;
/** 排队的一伙人：同伙站在排着的那个人旁边多远（米） */
const COMPANION = 1.2;
/** 没有门的地点：第 0 个站位离自己这么近（米）才拿它当路口（路按地点对缓存） */
const HUB_R = 5;
/** 演出一帧的预算（毫秒）：寻路只用剩下的（见 frame） */
const FRAME_MS = 3.4;
/** 预建身子：每种建几具、每帧最多花几毫秒（池子上限 POOL_MAX：大人够 CAP 用，孩子、少年另外有） */
const WARM_BODIES = { adult: CAP - 4, kid: 14, teen: 10 } as const;
const WARM_MS = 4;
/** 跳时刻：每帧最多快进多少毫秒（一步引擎 ~0.2 毫秒，一帧推 ~30 分钟） */
const JUMP_MS = 7;
/** 观察按钮：总监站柜台后面（clubdesk 的接待位），朝签到的人；镜头对着前院（柜台、排队、大门、停车场的入口） */
const DESK_STAND = DESK_SPOTS.deskStand;
const DESK_FACE = Math.atan2(DESK_SPOTS.serve[0] - DESK_STAND[0], DESK_SPOTS.serve[1] - DESK_STAND[1]);
const FORECOURT = { x: 62.3, z: 1.5 };
/** "总监离开前台"：走到前院北边的草坪边站着（前院的镜头里看得见他走开、柜台前的队排起来） */
const DESK_AWAY = { x: 58, z: 16 };
/** 会所人数小牌摆在哪（会所东半边的屋顶上，正门那一侧：从餐车院子、泳池那边看过来先看到）；会所在画面边上时贴着画面边 */
const HOUSE_BADGE = { x: -48.5, y: 10, z: -22 };
/** 会所剖面时画面上沿最多到这儿（会所北墙外一点，z） */
const HOUSE_NORTH = -42.5;
/**
 * 看一块场（第 2 轮评审：竖屏只放得下半块场，表演赛、红土只看得到一个人）：镜头看的地方在一块场上，或者跟着的人在打球 / 上课，
 * 画面宽度拉到 COURT_W 米（两条底线 23.8 米 + 两边底线后面站着发球、接发的人），平滑地推拉（每秒最多 COURT_RATE 倍）；离开场地推回来。
 * 前院、美食广场这些默认的地方不变。横屏本来就放得下，不动
 */
const COURT_W = 31;
const COURT_RATE = 1.8;
/** 场地（网球、匹克球）的范围：镜头看的点落在里面 = 在看这块场 */
const COURT_RECTS = COURTS.map((c) => ({ x0: c.x - c.hx, x1: c.x + c.hx, z0: c.z - c.hz, z1: c.z + c.hz }));
const PLAYING = new Set(['tennis', 'pickle', 'lesson', 'coach']);
/** 看全图放进画面的范围：围墙里（北墙到南墙）+ 东边的停车场、大门、落客点（高尔夫在南墙外，裁掉大半） */
const OV = { x0: -66, x1: 84, z0: -46, z1: 51 } as const;
/** 竖屏看全图：镜头在东边往西看（屏幕上 = 西、右 = 北），俯角 */
const OV_YAW = Math.PI / 2;
const OV_PITCH = (62 * Math.PI) / 180;

interface Leg {
  key: string;
  t0: number;
  t1: number;
  /** 路的拐点（起点、各地点的门、终点）：每两点之间一段，各自规划 */
  way: P2[];
  route: Route | null;
  /** 终点在室内（到了门口就藏起来） */
  hideEnd: boolean;
  /** 起点在室内（从门口冒出来） */
  hideStart: boolean;
  /** 有一段搜不到路：这段路不画（人藏起来，到了再出来），不直线穿墙 */
  failed: boolean;
  /** flat[i]：way[i − 1] → way[i] 这一段直着走、不寻路（泳池里游、看台座位排里挪：都不在导航里） */
  flat: boolean[];
}

interface Actor {
  id: AgentId;
  person: CastPerson | undefined;
  kind: BodyKind;
  body: Body | null;
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** 这一帧看不见（在室内、在路上但路还没规划好） */
  hidden: boolean;
  leg: Leg | null;
  settle: { route: Route; s: number; key: string } | null;
  /** 现在站的站位（变了 = 要走过去） */
  anchorKey: string;
  walkPh: number;
  /** 步态：0 走、1 跑、2 冲（见 RUN_V）；vs = 平滑过的速度（真实米 / 秒）；lift = 这一帧身子离地多高（跑的腾空、冲） */
  gait: number;
  vs: number;
  lift: number;
  /** 0..1：每个人的节奏错开 */
  hash: number;
  spec: PoseSpec | null;
  specKey: string;
  pace: { ax: number; az: number; bx: number; bz: number; len: number; s: number } | null;
  /** 这一帧在动（走路姿势） */
  moving: boolean;
  /** 站位给的高度（看台、高座、水里）；不给 = 导航的地面 */
  fixY: number | undefined;
  /** 地面高度是按哪个站位算的（站着不动不用每帧问导航） */
  yKey: string;
}

const esc = (t: string) =>
  t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);

/** 员工、教练（面板的名单排在后面） */
const isStaff = (role: string | undefined) => role === 'staff' || role === 'coach';

const hashOf = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10007) / 10007;
};

/**
 * 看全图、小地图上的人点按在干什么上色（面板里有图例，hud.ts 的 LEGEND 同一套颜色）：
 * 打球（网球、匹克球、上课、高尔夫）黄绿（绿场地上也看得出）、吃喝（点单、吃、喝）橙、排队红、路上白、泳池（游泳、躺椅、玩水）青、员工在岗紫、看球 / 歇着 / 聊天粉
 */
export type DotKind = 'play' | 'food' | 'queue' | 'walk' | 'pool' | 'staff' | 'idle';
const DOT_HEX: Record<DotKind, number> = {
  play: 0xc8f04a,
  food: 0xf59a2e,
  queue: 0xe0443c,
  walk: 0xfff3d6,
  pool: 0x45c8f0,
  staff: 0x8a6cf0,
  idle: 0xf07ab8,
};
export const DOT_CSS = Object.fromEntries(
  Object.entries(DOT_HEX).map(([k, v]) => [k, `#${v.toString(16).padStart(6, '0')}`]),
) as Record<DotKind, string>;
const DOT_OF: Partial<Record<string, DotKind>> = {
  tennis: 'play',
  pickle: 'play',
  lesson: 'play',
  coach: 'play',
  golf: 'play',
  warmup: 'play',
  order: 'food',
  eat: 'food',
  drink: 'food',
  swim: 'pool',
  sunbathe: 'pool',
  kidplay: 'pool',
  work: 'staff',
  break: 'staff',
  checkin: 'queue',
  queue: 'queue',
};
function dotKind(v: AgentView): DotKind {
  const w = v.where;
  if (w.kind === 'travel') return 'walk';
  if (w.kind === 'queue') return 'queue';
  return DOT_OF[v.doing] ?? 'idle';
}
const dotColor = (v: AgentView) => DOT_HEX[dotKind(v)];

export function mountSim(host: SimHost): SimMount {
  const { play, params, day } = host;
  const num = (k: string, d: number) => (params.has(k) && params.get(k) !== '' ? Number(params.get(k)) : d);
  const cfg: SimConfig = {
    seed: num('simseed', 1),
    places: PLACES,
    cast: CAST,
    posts: POSTS,
    // 走路速度用引擎的默认（WALK_M_PER_MIN = 12 米 / 游戏分钟：默认 2× 下画面上 24 米 / 秒）；?simwalk= 对照用
    ...(params.has('simwalk') ? { walk: num('simwalk', 12) } : {}),
  };
  const placeBy = new Map<PlaceId, Place>(PLACES.map((p) => [p.id, p]));
  const spotsOf = (id: PlaceId): PlaceSpots | undefined => {
    const ps = SPOTS[id];
    if (!ps) noteGap(`nospot:${id}`, `站位表里没有「${placeBy.get(id)?.name ?? id}」（${id}）：站在地点的估算坐标上`);
    return ps;
  };
  /**
   * 会所的地点在哪一层（第 3 轮用户：总监下到负一层，一楼的人按负一层的导航画在健身器械中间、站着不动）：
   * 藏着的（hidden）看站位的高度（≥ 2 二楼、≤ −2 负一层），别的会所地点一楼；不是会所的 = 0
   */
  const floorBy = new Map<PlaceId, number>();
  for (const p of PLACES) {
    if (p.scene !== 'clubhouse') continue;
    const ps = SPOTS[p.id];
    const y = ps?.hidden ? (ps.spots[0]?.y ?? 0) : 0;
    floorBy.set(p.id, y >= 2 ? 2 : y <= -2 ? -1 : 1);
  }
  const floorOf = (id: PlaceId) => floorBy.get(id) ?? 0;
  /** 剖面现在看哪一层（frame 开头取；外观 = 1：楼上楼下的照旧藏着） */
  let shownFloor = 1;
  /** 会所的脚印（同 walk.ts：L 形的外包框） */
  const inHouse = (x: number, z: number) => x > -64.5 && x < -39.5 && z > -43 && z < -1;
  /** ?dev=1：面板最下面给开发看的"画面缺口" */
  const devPanel = params.get('dev') === '1';
  let dayNo = num('simday', 3);
  const clock = new SimClock();
  clock.speed = num('simspeed', DEFAULT_SPEED);

  let on = false;
  let s: SimState | null = null;
  let views: AgentView[] = [];
  const viewBy = new Map<AgentId, AgentView>();
  const actors = new Map<AgentId, Actor>();
  const planner = new Planner(() => play.nav);
  const pool = new BodyPool(host.scene, host.make, host.dresser);
  const dots = new Dots(host.scene);
  /** fx/：在摆好的姿势上再补一层（递餐、托盘、球、车、游泳、等烦了） */
  const fx = createSimFx(host);
  let followId: AgentId | null = null;
  /** look(x, z) 定住的镜头（只挪镜头，不挪总监）；总监一动、跟人、看全图就放开 */
  let pin: { x: number; z: number } | null = null;
  /** 定镜头那一刻总监站在哪（他被挪开 = 用户在操控他，镜头回去） */
  const pinFrom = { x: 0, z: 0 };
  /** 正在分几帧快进到的时刻（跳时刻） */
  let jumpTo: Minute | null = null;
  let jumpMs = 0;
  let jumpedThisFrame = false;
  let overview = false;
  let mptSaved = 0;
  /** 看场时镜头拉远了几倍（1 = 没拉）：rig.metersPerTexel 里乘着它（看全图、关观察时先除掉） */
  let courtK = 1;
  let savedSpeed = 0;
  let savedWeather: Daylight['weather'] = 'auto';
  let dayBase = 0;
  /** 真实时间（秒）：挥拍、呼吸的节奏按它走，不跟着加速乱抖 */
  let rt = 0;
  const feed: { t: number; text: string }[] = [];
  /** 镜头（跟人 / 定住时）：x/z 现在看的地方，gx/gz 上一步的目标 */
  const cam = { x: 0, z: 0, gx: 0, gz: 0, has: false };
  const perf = {
    engine: 0,
    actors: 0,
    frames: 0,
    engineMax: 0,
    actorsMax: 0,
    steps: 0,
    win: [] as number[],
    /** 每帧（引擎 + 演出）最长的一帧、换天那一下、跳时刻最长的一片 */
    frameMax: 0,
    rollMs: 0,
    jumpSliceMax: 0,
    worst: {} as Record<string, number>,
    /** 引擎那边分开记：sim.step、事件流、快照 */
    stepMs: 0,
    feedMs: 0,
    viewMs: 0,
  };
  /** 演出各段的累计（毫秒；perf() 里按帧平均）：找平均、P95 花在哪 */
  const seg = { paths: 0, place: 0, bodies: 0, pose: 0, fx: 0, hud: 0 };
  /** 这一帧引擎花了多久（step 里累加，frame 里和演出加起来算一帧） */
  let engineFrame = 0;

  const nameOf = (id: AgentId) => {
    const a = s?.agents[id];
    const p = a ? personOf(cfg, a.person, s) : undefined;
    return p?.name ?? a?.person ?? id;
  };
  const placeName = (id?: PlaceId) => (id ? (placeBy.get(id)?.name ?? id) : '');

  // ── 引擎 ──
  function fresh() {
    s = sim.startDay(cfg, dayNo);
    feed.length = 0;
    clearActors();
    refreshViews();
  }
  function directorAt(): PlaceId | null {
    const d = host.director.position;
    for (const p of PLACES) {
      if (!p.director) continue;
      const a = spotOf(p, SPOTS[p.id], 0);
      if (Math.hypot(a.x - d.x, a.z - d.z) < 4 || Math.hypot(p.x - d.x, p.z - d.z) < 3) return p.id;
    }
    return null;
  }
  function advance(n: number, quiet = false) {
    if (!s || n <= 0) return;
    const input = { director: directorAt() };
    for (let i = 0; i < n; i++) {
      const t0 = performance.now();
      const r = sim.step(cfg, s, input);
      const t1 = performance.now();
      s = r.state;
      if (!quiet) onEvents(r.events);
      perf.stepMs += t1 - t0;
      perf.feedMs += performance.now() - t1;
    }
    const t2 = performance.now();
    refreshViews();
    perf.viewMs += performance.now() - t2;
  }
  function refreshViews() {
    views = s ? sim.view(s) : [];
    viewBy.clear();
    for (const v of views) viewBy.set(v.id, v);
  }
  /**
   * 跳到某个时刻：分几帧快进（jumpSlice 每帧推 JUMP_MS 毫秒），画面上的人停在原地等着，天光一路快进过去；
   * 往回跳 = 重新开这一天再往前推。sync = 一口气推完（测试、工具）。
   */
  function jump(m: Minute, sync = false) {
    if (!s) fresh();
    if (!s) return;
    if (m < s.minute) {
      s = sim.startDay(cfg, dayNo);
      feed.length = 0;
    }
    jumpTo = m;
    jumpMs = 0;
    frozenAt = nowMin();
    if (sync) jumpSlice(Number.POSITIVE_INFINITY);
    else if (s.minute >= m) jumpSlice(0);
  }
  /** 推一片快进；推到了就把画面换成新时刻 */
  function jumpSlice(budget: number) {
    if (!s || jumpTo === null) return;
    const t0 = performance.now();
    const input = { director: directorAt() };
    while (s.minute < jumpTo && performance.now() - t0 < budget) s = sim.step(cfg, s, input).state;
    const ms = performance.now() - t0;
    jumpMs += ms;
    perf.jumpSliceMax = Math.max(perf.jumpSliceMax, ms);
    if (s.minute < jumpTo) return;
    const m = jumpTo;
    jumpTo = null;
    clock.frac = 0;
    clearActors();
    refreshViews();
    pushFeed(m, `跳到 ${hhmm(m)}`);
    syncHud(true);
  }
  /** 快进时画面停在哪一刻（人不动，等新时刻） */
  let frozenAt = 0;

  // ── 事件 → 面板的"刚刚" ──
  function pushFeed(t: number, text: string) {
    feed.push({ t, text });
    if (feed.length > 40) feed.splice(0, feed.length - 40);
  }
  /**
   * 事件流只留看得出"俱乐部在过日子"的：一伙人到了 / 走了、午饭晚饭、等烦了走了、表演赛开打；
   * 单个客人来去、员工上下岗、换地方这些太碎，不进（named 的人除外）。
   */
  const FEED_START = new Set(['tennis', 'pickle', 'lesson']);
  let exhibitionFed = -1;
  const tierOf = (id: AgentId) => {
    const a = s?.agents[id];
    return a ? personOf(cfg, a.person, s)?.tier : undefined;
  };
  const mealOf = (t: number) => (t >= 11 * 60 && t < 14.5 * 60 ? '吃午饭' : t >= 17 * 60 ? '吃晚饭' : '吃东西');
  function onEvents(ev: readonly SimEvent[]) {
    if (!s) return;
    const arrivedParty = new Map<string, AgentId[]>();
    for (const e of ev) {
      const a = s.agents[e.agent];
      const pid = a?.party;
      const party = pid ? s.parties[pid] : undefined;
      const lead = party?.lead;
      const n = party?.members.length ?? 1;
      const isLead = !pid || lead === e.agent;
      const named = tierOf(e.agent) === 'named';
      if (e.kind === 'arrive') {
        const k = pid ?? e.agent;
        arrivedParty.set(k, [...(arrivedParty.get(k) ?? []), e.agent]);
      } else if (e.kind === 'leave') {
        if (isLead && (n > 1 || named)) pushFeed(e.t, `${nameOf(e.agent)}${n > 1 ? ` 一伙 ${n} 人` : ''} 回家了`);
      } else if (e.kind === 'gaveUp') {
        // 引擎的 note 是一句完整的话（"前台的队排满了，没签到就进去了"）：照写，不再套"等烦了走了"
        if (isLead)
          pushFeed(e.t, `${nameOf(e.agent)}${n > 1 ? ' 一伙' : ''}：${e.note ?? `不在${placeName(e.at)}等了`}`);
      } else if (e.kind === 'start' && e.at === 'post.stadium.pros' && e.t >= 18 * 60) {
        if (exhibitionFed !== s.dayNo) {
          exhibitionFed = s.dayNo;
          let stands = 0;
          for (const [id, occ] of Object.entries(s.occupants)) if (id.startsWith('stadium.stand')) stands += occ.length;
          pushFeed(e.t, `中心球场的表演赛开打了（看台上 ${stands} 人）`);
        }
      } else if (e.kind === 'start' && e.doing === 'eat' && isLead) {
        pushFeed(e.t, `${nameOf(e.agent)}${n > 1 ? ` 一伙 ${n} 人` : ''} 在${placeName(e.at)}${mealOf(e.t)}`);
      } else if (e.kind === 'start' && named && isLead && e.doing && FEED_START.has(e.doing)) {
        pushFeed(e.t, `${nameOf(e.agent)}${n > 1 ? ' 一伙' : ''} ${DOING_NAME[e.doing]}（${placeName(e.at)}）`);
      }
    }
    for (const [k, ids] of arrivedParty) {
      const a = s.agents[ids[0]];
      const n = a?.party ? (s.parties[k]?.members.length ?? ids.length) : 1;
      if (n < 2 && tierOf(ids[0]) !== 'named') continue;
      pushFeed(
        ev[0]?.t ?? s.minute,
        n > 1
          ? `${nameOf(ids[0])} 一伙 ${n} 人到了（${placeName(a?.entry)}）`
          : `${nameOf(ids[0])} 到了（${placeName(a?.entry)}）`,
      );
    }
  }
  // ── 演员 ──
  function clearActors() {
    pool.releaseAll();
    actors.clear();
    planner.drop();
  }
  function actorOf(v: AgentView): Actor {
    let a = actors.get(v.id);
    if (!a) {
      const p = personOf(cfg, v.person, s);
      a = {
        id: v.id,
        person: p,
        kind: bodyKindOf(p),
        body: null,
        x: 0,
        y: 0,
        z: 0,
        yaw: 0,
        hidden: false,
        leg: null,
        settle: null,
        anchorKey: '',
        walkPh: 0,
        gait: 0,
        vs: 0,
        lift: 0,
        hash: hashOf(v.id),
        spec: null,
        specKey: '',
        pace: null,
        moving: false,
        fixY: undefined,
        yKey: '',
      };
      // 第一次出现：站在他现在该在的地方
      const t = anchorFor(v, a);
      if (t) {
        a.x = t.x;
        a.z = t.z;
        a.yaw = t.yaw;
      }
      actors.set(v.id, a);
    }
    return a;
  }

  /** 在某处（at / queue）：站哪 */
  function anchorFor(v: AgentView, a: Actor): (Anchor & { key: string; hidden: boolean }) | null {
    const w = v.where;
    if (w.kind === 'at' || w.kind === 'queue') {
      const place = placeBy.get(w.at);
      const ps = spotsOf(w.at);
      if (w.kind === 'at' && ps?.hidden && floorOf(w.at) !== shownFloor) {
        const d = ps.door ?? { x: place?.x ?? 0, z: place?.z ?? 0 };
        return { x: d.x, z: d.z, yaw: a.yaw, key: `in:${w.at}`, hidden: true };
      }
      if (w.kind === 'queue') return { ...queueSlot(v, w.at, place, ps), hidden: false };
      const an = spotOf(place, ps, v.spot);
      return { ...an, key: `${w.kind}:${w.at}:${v.spot}`, hidden: false };
    }
    if (w.kind === 'travel') {
      const ps = spotsOf(w.from);
      if (ps?.hidden && ps.door) return { x: ps.door.x, z: ps.door.z, yaw: a.yaw, key: 'travel', hidden: true };
      const place = placeBy.get(w.from);
      return { ...spotOf(place, ps, v.spot), key: 'travel', hidden: false };
    }
    return null;
  }

  /**
   * 排队站哪（第 2 轮评审：一伙五个人同时站到柜台前叠在一起、窗口前一团）：一伙人只有排在最前面的那个站进队，
   * 同伙站在他旁边（左右各一个，再多的往后错半步，离队 COMPANION 米）；队里的位置按"伙"数（一伙算一个），后面的人不空出位子。
   * 旁边站不住（墙、柜台）就换另一边，两边都不行才排进队里自己的位置
   */
  function queueSlot(v: AgentView, at: PlaceId, place: Place | undefined, ps: PlaceSpots | undefined) {
    const q = s?.queues[at] ?? [];
    const me = q.indexOf(v.id);
    const party = s?.agents[v.id]?.party;
    if (me < 0 || !s) return { ...queueOf(place, ps, v.spot), key: `queue:${at}:${v.spot}` };
    let unit = -1;
    let leadUnit = -1;
    let rank = 0;
    const seen = new Set<string>();
    for (let k = 0; k <= me; k++) {
      const p = s.agents[q[k]]?.party;
      if (p && seen.has(p)) {
        if (p === party) rank++;
        continue;
      }
      if (p) seen.add(p);
      unit++;
      if (p && p === party) leadUnit = unit;
    }
    if (!party || rank === 0) return { ...queueOf(place, ps, unit), key: `queue:${at}:${unit}` };
    const base = queueOf(place, ps, leadUnit);
    const fx = Math.sin(base.yaw);
    const fz = Math.cos(base.yaw);
    const back = Math.floor((rank - 1) / 2) * 0.7;
    const first = rank % 2 ? 1 : -1;
    // 旁边 COMPANION 米站不住就近一点（0.65 米），再不行站到他斜后方
    for (const [w, b] of [
      [COMPANION, back],
      [COMPANION * 0.55, back],
      [COMPANION * 0.55, back + 0.55],
    ])
      for (const side of [first, -first]) {
        // 右手 = (−fz, fx)
        const x = base.x - fz * side * w - fx * b;
        const z = base.z + fx * side * w - fz * b;
        if (play.nav.standAt(x, z) !== null && play.nav.lineClear(base.x, base.z, x, z))
          return { x, z, y: base.y, yaw: base.yaw, key: `queue:${at}:${leadUnit}+${rank}${side}${w}` };
      }
    // 都站不住（窄道）：贴在他身后半步（第 3 轮：原来退回队里自己的号 —— 按人数数的号压在后面那伙人身上），挤的交给 separate 推开
    return {
      x: base.x - fx * 0.55 * rank,
      z: base.z - fz * 0.55 * rank,
      y: base.y,
      yaw: base.yaw,
      key: `queue:${at}:${leadUnit}+${rank}b`,
    };
  }

  /**
   * 新的一段路：起点（他现在在哪）→ 出发地的门 → 目的地的门 → 目的地的站位。
   * 没有门的地点用第 0 个站位当"路口"（离自己的站位 HUB_R 米以内才用）：中间那一大段按"地点对"缓存，
   * 两个地点之间来来回回的人共用一条（一次寻路），两头站位到路口的那一小段多半直线通、当场给
   */
  function newLeg(v: AgentView, a: Actor, w: Extract<AgentView['where'], { kind: 'travel' }>, key: string): Leg {
    const fromPs = spotsOf(w.from);
    const toPs = spotsOf(w.to);
    const toPlace = placeBy.get(w.to);
    // way 的每个点；flat[i] = 从 way[i − 1] 到 way[i] 这一段直着走（水里、看台的座位排里：不在导航里，不寻路）
    const way: P2[] = [];
    const flat: boolean[] = [];
    const add = (p: P2, straight: boolean) => {
      way.push(p);
      flat.push(straight);
    };
    const inWater = (ps: PlaceSpots | undefined) => {
      const q = ps?.spots[0];
      return !!q && q.x > POOL.x0 && q.x < POOL.x1 && q.z > POOL.z0 && q.z < POOL.z1;
    };
    if (fromPs?.hidden && fromPs.door) add([fromPs.door.x, fromPs.door.z], false);
    else {
      add([a.x, a.z], false);
      const wetFrom = inWater(fromPs);
      // 看台的座位：顺着这一排走到走道（或看台头上），再从那儿接导航（第 2 轮评审：座位到"路口"规划不到，人在座位上消失）
      const out = seatWay(w.from, a.x, a.z);
      if (out) {
        for (const p of out) add(p, true);
        // 看台的门（北看台：西头端梯脚下）：从走道口规划到这儿，再往外（一段长路从地面起算，寻路不从坡道上起步）
        if (fromPs?.door) add([fromPs.door.x, fromPs.door.z], false);
      } else if (fromPs?.door) add([fromPs.door.x, fromPs.door.z], wetFrom);
      else {
        const h = spotOf(placeBy.get(w.from), fromPs, 0);
        if (Math.hypot(h.x - a.x, h.z - a.z) < HUB_R) add([h.x, h.z], wetFrom);
      }
    }
    // 出发这头到此为止：下面接终点那头，中间（长路）插干道的路口
    const mid = way.length;
    if (toPs?.door) add([toPs.door.x, toPs.door.z], false);
    if (!toPs?.hidden) {
      const an = spotOf(toPlace, toPs, v.spot);
      const wetTo = inWater(toPs);
      const into = seatWay(w.to, an.x, an.z);
      if (into) {
        // 反过来：走到这一排的走道口（导航），再顺着排走到座位（直着）
        const back = [...into].reverse();
        back.forEach((p, i) => {
          add(p, i > 0);
        });
        add([an.x, an.z], true);
      } else {
        if (!toPs?.door) {
          const h = spotOf(toPlace, toPs, 0);
          if (Math.hypot(h.x - an.x, h.z - an.z) < HUB_R) add([h.x, h.z], false);
        }
        add([an.x, an.z], wetTo);
      }
    }
    if (mid > 0 && mid < way.length) {
      const [ax, az] = way[mid - 1];
      const [bx, bz] = way[mid];
      const js = trunk(ax, az, bx, bz);
      if (js.length) {
        way.splice(mid, 0, ...js);
        flat.splice(mid, 0, ...js.map(() => false));
      }
    }
    // 去掉挨得太近的点（直着走的标记跟着留下来的那一点）
    const clean: P2[] = [way[0]];
    const cleanFlat: boolean[] = [false];
    for (let i = 1; i < way.length; i++) {
      const p = way[i];
      const q = clean[clean.length - 1];
      if (Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.3) {
        clean.push(p);
        cleanFlat.push(flat[i]);
      } else if (flat[i]) cleanFlat[cleanFlat.length - 1] = true;
    }
    return {
      key,
      t0: w.t0,
      t1: w.t1,
      way: clean,
      route: clean.length === 1 ? makeRoute(clean) : null,
      hideEnd: !!toPs?.hidden,
      hideStart: !!fromPs?.hidden,
      failed: false,
      flat: cleanFlat,
    };
  }
  /** 路的每一段都规划好了才拼起来；pri 越小越先规划。有一段搜不到 → leg.failed（这段路不画） */
  function buildRoute(leg: Leg, pri: number): Route | null {
    if (leg.route) return leg.route;
    const pts: P2[] = [leg.way[0]];
    let ok = true;
    let failed = false;
    for (let i = 1; i < leg.way.length; i++) {
      const [ax, az] = leg.way[i - 1];
      const [bx, bz] = leg.way[i];
      // 水里、看台座位排里的那一段：直着走
      const seg = leg.flat[i] ? [[bx, bz] as P2] : planner.get(ax, az, bx, bz, pri);
      if (seg === NO_PATH) failed = true;
      if (!seg || seg === NO_PATH) {
        ok = false;
        continue;
      }
      for (const p of seg) pts.push(p);
    }
    leg.failed = failed;
    if (!ok) return null;
    leg.route = makeRoute(pts);
    return leg.route;
  }

  const tmp = { x: 0, z: 0, dx: 0, dz: 1 };
  const nowMin = () => (jumpTo !== null ? frozenAt : s ? s.minute + clock.frac : 0);

  /** 这一帧每个在场的人在哪（有没有身子都算：决定谁要身子） */
  function place(now: number, cx: number, cz: number) {
    const fastNow = clock.speed >= FAST;
    for (const v of views) {
      const a = actorOf(v);
      const w = v.where;
      a.moving = false;
      if (w.kind === 'travel') {
        a.settle = null;
        a.pace = null;
        a.fixY = undefined;
        const key = `${w.from}>${w.to}@${w.t0}`;
        if (a.leg?.key !== key) a.leg = newLeg(v, a, w, key);
        const leg = a.leg;
        const f = leg.t1 > leg.t0 ? Math.min(1, Math.max(0, (now - leg.t0) / (leg.t1 - leg.t0))) : 1;
        // 有身子的、离镜头近的才规划路（快进时只管更近的：路上的人几帧就到，远处的路规划了也看不见）
        const near = Math.abs(a.x - cx) + Math.abs(a.z - cz);
        const route = a.body || near < (fastNow ? 28 : 45) ? buildRoute(leg, near) : null;
        if (route) {
          // 一伙人走成一小队（第 3 轮评审问题 4：同一条路、同一个速度，四个人叠成一个）：按在一伙里的位置左右让开、往后错开
          // （两个人并排、三到五个人前后两排）；人人都靠右走一点（迎面走过来的不穿过去）。往后错开的沿着路退（不会退进墙里），
          // 左右让开的那一点站不住（门、窄道、围网边）就让一半，还不行就不让；两头 LANE_FADE 米里慢慢收拢（从站位走出来、走到站位上）
          const [lat0, back] = formationOf(v);
          const sAt = Math.max(0, f * route.len - back);
          along(route, sAt, tmp);
          let x = tmp.x;
          let z = tmp.z;
          const fade = Math.min(1, Math.max(0, Math.min(sAt, route.len - sAt) / LANE_FADE));
          const lat = (lat0 + KEEP_RIGHT) * fade;
          if (lat !== 0 && play.nav.standAt(x, z) !== null) {
            for (const k of [1, 0.5]) {
              // 右手 = (−dz, dx)
              const ox = x - tmp.dz * lat * k;
              const oz = z + tmp.dx * lat * k;
              if (play.nav.standAt(ox, oz) !== null && play.nav.standAt((x + ox) / 2, (z + oz) / 2) !== null) {
                x = ox;
                z = oz;
                break;
              }
            }
          }
          if (Math.hypot(x - a.x, z - a.z) > 1e-4) {
            a.moving = true;
            a.yaw = turn(a.yaw, Math.atan2(tmp.dx, tmp.dz), 0.5);
          }
          a.x = x;
          a.z = z;
          a.hidden = (leg.hideStart && f <= 0) || (leg.hideEnd && f >= 1);
        } else {
          // 路还没规划好：没身子的按直线估（只用来决定要不要身子），有身子的原地等一下（不穿墙）。
          // 搜不到路的（过几秒再试）：这段路不画，人藏起来，到了站位再出来
          if (!a.body || leg.failed) {
            const [ax, az] = leg.way[0];
            const [bx, bz] = leg.way[leg.way.length - 1];
            a.x = ax + (bx - ax) * f;
            a.z = az + (bz - az) * f;
          }
          a.hidden = !a.body || leg.failed;
        }
        a.anchorKey = '';
        continue;
      }
      a.leg = null;
      const an = anchorFor(v, a);
      if (!an) continue;
      a.hidden = an.hidden;
      if (an.hidden) {
        a.x = an.x;
        a.z = an.z;
        a.settle = null;
        continue;
      }
      if (an.key !== a.anchorKey) {
        const wasIn = a.anchorKey.startsWith('in:');
        a.anchorKey = an.key;
        a.pace = null;
        // 离站位还有一段：真实时间走过去（排队往前挪、到了以后找自己的位置）
        const d = Math.hypot(an.x - a.x, an.z - a.z);
        // 从"藏在里面"换成看得见的（剖面换到了他那一层）：直接站到位，不从楼梯口走过去
        if (a.body && d > 0.15 && d < 40 && !wasIn) a.settle = { route: makeRoute([[a.x, a.z]]), s: 0, key: '' };
        else {
          a.settle = null;
          a.x = an.x;
          a.z = an.z;
        }
        a.fixY = an.y;
      }
      if (a.settle) {
        const st = a.settle;
        const k = `${an.x},${an.z}`;
        if (st.key !== k) {
          const seg = planner.get(a.x, a.z, an.x, an.z, Math.abs(a.x - cx) + Math.abs(a.z - cz));
          if (seg === NO_PATH) {
            // 搜不到：直接站到站位上（不直线穿过柜台、围网）
            a.settle = null;
            a.x = an.x;
            a.z = an.z;
          } else if (seg) {
            st.route = makeRoute([[a.x, a.z], ...seg]);
            st.s = 0;
            st.key = k;
          }
        }
        if (a.settle && st.key === k) {
          const v0 = Math.max(SETTLE_V, st.route.len / 1.6);
          st.s += v0 * frameDt;
          along(st.route, st.s, tmp);
          a.x = tmp.x;
          a.z = tmp.z;
          a.moving = true;
          a.yaw = turn(a.yaw, Math.atan2(tmp.dx, tmp.dz), 0.5);
          if (st.s >= st.route.len) a.settle = null;
        }
      }
      if (!a.settle) {
        a.x = a.pace ? a.x : an.x;
        a.z = a.pace ? a.z : an.z;
        a.yaw = turn(a.yaw, an.yaw, 0.25);
      }
    }
  }
  let frameDt = 1 / 60;
  let frameNo = 0;
  /** 平均一帧多长（秒）：判断"冲"用（30 帧的手机上一帧走的路是 60 帧的两倍） */
  let dtAvg = 1 / 60;
  /** 身子还在预建（enable 打开以后的头几十帧） */
  let warmBodies = false;
  /** 导航这一帧刚重建 */
  let navFresh = false;
  /** 观察面板的上沿（CSS 像素；syncHud 里量） */
  let panelTop = innerHeight;

  /**
   * 一伙人走路的队形：[往右手让开几米, 往后错开几米]（按在一伙里的序号；带头的是 0 号）。
   * 两个人并排（右边那个错后半步）；三个人前两个、后一个；四个人两排；五个人前三后二；再多两个一排往后排
   */
  function formationOf(v: AgentView): readonly [number, number] {
    if (!v.party || !s) return NO_OFFSET;
    const ms = s.parties[v.party]?.members;
    if (!ms || ms.length < 2) return NO_OFFSET;
    const i = ms.indexOf(v.id);
    if (i < 0) return NO_OFFSET;
    const n = ms.length;
    const row = FORMATION[n];
    if (row) return row[i];
    return [i % 2 ? SIDE : -SIDE, Math.floor(i / 2) * ROW_BACK];
  }
  /**
   * 身子不叠（第 3 轮评审问题 4：柜台前、窗口前、排队的一伙人、一起走到站位上的叠成一团）：画面里站着 / 走着的身子
   * 两两近于 PERSONAL 米的，各往外让一半（重合的按 id 定一个方向）；让过去站不住（墙、柜台、桌子）的不让、另一个让全部。
   * 坐着的、高处的（看台、裁判椅、水里）不动。每帧从引擎给的位置重新算（不攒着），站着的人位置定了推开的结果也定了，不抖
   */
  const sepCells = new Map<number, Actor[]>();
  const sepList: Actor[] = [];
  let sepPushed = 0;
  function separate() {
    sepCells.clear();
    sepList.length = 0;
    sepPushed = 0;
    if (overview) return;
    const C = PERSONAL;
    const cell = (x: number, z: number) => Math.floor(x / C) * 4099 + Math.floor(z / C);
    for (const a of actors.values()) {
      if (!a.body || a.hidden || a.pace || a.fixY !== undefined || a.spec?.seat) continue;
      sepList.push(a);
      const k = cell(a.x, a.z);
      const l = sepCells.get(k);
      if (l) l.push(a);
      else sepCells.set(k, [a]);
    }
    const nav = play.nav;
    for (const a of sepList) {
      const cx = Math.floor(a.x / C);
      const cz = Math.floor(a.z / C);
      for (let i = -1; i <= 1; i++)
        for (let j = -1; j <= 1; j++) {
          const l = sepCells.get((cx + i) * 4099 + cz + j);
          if (!l) continue;
          for (const o of l) {
            if (o === a || o.id < a.id) continue;
            let dx = o.x - a.x;
            let dz = o.z - a.z;
            let d = Math.hypot(dx, dz);
            if (d >= C) continue;
            if (d < 1e-3) {
              const t = hashOf(a.id + o.id) * Math.PI * 2;
              dx = Math.cos(t);
              dz = Math.sin(t);
              d = 0;
            } else {
              dx /= d;
              dz /= d;
            }
            const need = C - d;
            const ax = a.x - dx * need * 0.5;
            const az = a.z - dz * need * 0.5;
            const ox = o.x + dx * need * 0.5;
            const oz = o.z + dz * need * 0.5;
            const aOk = nav.standAt(ax, az) !== null;
            const oOk = nav.standAt(ox, oz) !== null;
            if (aOk && oOk) {
              a.x = ax;
              a.z = az;
              o.x = ox;
              o.z = oz;
            } else if (aOk) {
              const bx = a.x - dx * need;
              const bz = a.z - dz * need;
              if (nav.standAt(bx, bz) === null) continue;
              a.x = bx;
              a.z = bz;
            } else if (oOk) {
              const bx = o.x + dx * need;
              const bz = o.z + dz * need;
              if (nav.standAt(bx, bz) === null) continue;
              o.x = bx;
              o.z = bz;
            } else continue;
            sepPushed++;
          }
        }
    }
  }

  function turn(a: number, b: number, k: number) {
    let d = b - a;
    d -= Math.round(d / (Math.PI * 2)) * Math.PI * 2;
    return a + d * k;
  }

  // ── 谁有身子 ──
  const wantList: { a: Actor; d: number }[] = [];
  /**
   * vr = 给身子的范围；keep = 已经有身子的人出了这个范围才收回（外扩一圈：在边上来回走的人不反复换装）；screen = 画面本身。
   * 身子不够（CAP）时先给谁（第 2 轮评审：周六看台 161 人只画得出 90，坐着的观众空着、画面里的人一闪一闪）：
   * 画面里的先于画面外那一圈的；场上打球的最先（表演赛看台坐满了也不能没有球员）；
   * 画面里坐着的（看台、长椅、桌边）比走路的先（坐着的一大片空座最显眼，走路的一晃而过）；
   * 离镜头中心近的先；已经有身子的再往前一点（别跟差不多远的人来回换：换了就是一闪）
   */
  function assignBodies(vr: Rect, keep: Rect, screen: Rect, cx: number, cz: number) {
    wantList.length = 0;
    const live = new Set<AgentId>();
    for (const v of views) {
      const a = actors.get(v.id);
      if (!a) continue;
      live.add(v.id);
      const r = a.body ? keep : vr;
      const inView = !a.hidden && a.x > r.x0 && a.x < r.x1 && a.z > r.z0 && a.z < r.z1;
      if (inView && !overview) {
        const onScreen = a.x > screen.x0 && a.x < screen.x1 && a.z > screen.z0 && a.z < screen.z1;
        const seated = !a.leg && (a.fixY !== undefined || !!a.spec?.seat);
        let d = Math.hypot(a.x - cx, a.z - cz);
        if (!onScreen) d += 80;
        else if (!a.leg && PLAYING.has(v.doing)) d *= 0.3;
        else if (seated) d *= 0.6;
        else if (a.leg) d += 6;
        if (a.body) d -= 4;
        wantList.push({ a, d });
      } else if (a.body) {
        pool.release(a.body);
        a.body = null;
      }
    }
    // 走了的人（不在场了）
    for (const [id, a] of actors) {
      if (live.has(id)) continue;
      if (a.body) pool.release(a.body);
      actors.delete(id);
    }
    wantList.sort((p, q) => p.d - q.d);
    const fast = clock.speed >= FAST && !clock.paused;
    for (let i = 0; i < wantList.length; i++) {
      const a = wantList[i].a;
      if (i >= CAP) {
        if (a.body) {
          pool.release(a.body);
          a.body = null;
        }
        continue;
      }
      // 快进时路上的人一晃而过：先借一具身子不换装，停下来再换（换装 ~0.3 毫秒一次，60× 下一秒几十个人进出画面）
      const passing = fast && !!a.leg;
      if (!a.body) {
        a.body = pool.acquire(a.id, a.person, a.kind, false, !passing);
        if (a.body) {
          a.spec = null;
          a.specKey = '';
          a.body.prop = undefined;
          a.body.seat = '';
        }
      } else if (!passing && a.body.dressed !== a.id) pool.redress(a.body, a.id, a.person);
    }
  }

  // ── 姿势 ──
  /** 场上的人按站位朝向分两边；每一拍一边的一个人击球 */
  function rallyPose(a: Actor, v: AgentView, at: PlaceId, pickle: boolean): { pose: string; phase: number } {
    const occ = s?.occupants[at] ?? [];
    const ch = hashOf(at) * 10;
    const T = pickle ? 0.8 : 1.3;
    const n = Math.floor((rt + ch) / T);
    const k = ((rt + ch) % T) / T;
    const mySide = Math.sin(a.yaw) >= 0 ? 1 : -1;
    const hitSide = n % 2 ? 1 : -1;
    if (mySide === hitSide && occ.length > 1) {
      const team = occ.filter((id) => {
        const b = actors.get(id);
        return b && (Math.sin(b.yaw) >= 0 ? 1 : -1) === mySide;
      });
      const hitter = team[Math.floor(n / 2) % Math.max(1, team.length)];
      if (hitter === v.id) {
        if (pickle) return { pose: hashOf(`${at}${n}`) < 0.5 ? 'dink' : 'dinkB', phase: Math.min(1, (k * T) / 0.6) };
        const serve = n % 14 === 0 || n % 14 === 1;
        const stroke = serve ? 'serve' : hashOf(`${at}${n}`) < 0.55 ? 'forehand' : 'backhand';
        return { pose: stroke, phase: Math.min(0.999, (k * T) / PERIOD[stroke]) };
      }
    }
    return { pose: pickle ? 'ready' : 'ready', phase: (rt / PERIOD.ready + a.hash) % 1 };
  }

  function poseActor(a: Actor, v: AgentView) {
    const b = a.body;
    if (!b) return;
    const ud = b.obj.userData;
    a.lift = 0;
    if (a.moving) {
      const keep = b.prop === 'racket' || b.prop === 'paddle' ? b.prop : null;
      setProp(b, keep);
      // 步子（motion.ts 的 stepGait）：腿的周期按身子这一帧真走了多远推，脚不溜；快了换跑、再快换冲（腾空）
      const lean = stepGait(a, Math.hypot(a.x - b.obj.position.x, a.z - b.obj.position.z), frameDt, dtAvg, rt, (st) =>
        setStride(b.obj, st),
      );
      setLean(b, lean);
      ud.pose?.('walk', a.walkPh);
      if (a.specKey) {
        ud.lookAt?.(null);
        a.specKey = '';
        a.spec = null;
      }
      return;
    }
    setLean(b, 0);
    a.vs = 0;
    if (a.gait) {
      a.gait = 0;
      setStride(b.obj);
    }
    const w = v.where;
    const at = w.kind === 'at' || w.kind === 'queue' ? w.at : undefined;
    const placeObj = at ? placeBy.get(at) : undefined;
    const key = `${v.doing}|${at}|${v.spot}|${w.kind}`;
    const fresh = key !== a.specKey;
    if (fresh) {
      a.specKey = key;
      const an = at
        ? w.kind === 'queue'
          ? queueOf(placeObj, SPOTS[at], v.spot)
          : spotOf(placeObj, SPOTS[at], v.spot)
        : undefined;
      const spec =
        w.kind === 'queue' ? poseSpec('queue', placeObj, undefined, a.kind) : poseSpec(v.doing, placeObj, an, a.kind);
      a.spec = spec;
      if (spec.gap) noteGap(spec.gap);
      setProp(b, spec.prop);
      const seatKey = spec.seat === undefined ? '' : `${spec.seat}:${spec.foot ?? 0}`;
      if (seatKey && seatKey !== b.seat) {
        const t0 = performance.now();
        b.seat = seatKey;
        ud.setSeat?.(spec.seat ?? null, spec.foot ?? 0);
        propMs += performance.now() - t0;
      }
      // 聊天：看着一起的人
      ud.lookAt?.(null);
      if (spec.lookWith && v.with.length) {
        const o = actors.get(v.with[0]);
        if (o) ud.lookAt?.(new THREE.Vector3(o.x, a.y + 1.5, o.z));
      }
      // 边走边干（拖红土）：沿朝向来回 3 米（两头站得住才走）
      a.pace = null;
      if (spec.anim === 'pace') {
        const dx = Math.sin(a.yaw);
        const dz = Math.cos(a.yaw);
        const ax = a.x - dx * 3;
        const az = a.z - dz * 3;
        const bx = a.x + dx * 3;
        const bz = a.z + dz * 3;
        if (play.nav.lineClear(ax, az, bx, bz)) a.pace = { ax, az, bx, bz, len: 6, s: 3 };
      }
    }
    const spec = a.spec as PoseSpec;
    // 站着 / 坐着慢慢动的（呼吸、吃、喝、看球拍手）：隔一帧摆一次（每人错开），省一半；对打、拖红土、刚换的姿势每帧摆
    if (!fresh && (spec.anim === 'loop' || spec.anim === 'watch') && (frameNo + (a.hash < 0.5 ? 0 : 1)) % 2) return;
    let pose = spec.pose;
    let phase = (rt / (PERIOD[pose] ?? 2) + a.hash) % 1;
    if (spec.anim === 'rally' && at) {
      const r = rallyPose(a, v, at, false);
      pose = r.pose;
      phase = r.phase;
    } else if (spec.anim === 'pickle' && at) {
      const r = rallyPose(a, v, at, true);
      pose = r.pose;
      phase = r.phase;
    } else if (spec.anim === 'watch') {
      // 看球：隔一会儿鼓几下掌
      const c = (rt + a.hash * 9) % 9;
      if (c < 1.5) {
        pose = 'clap';
        phase = (c / 0.5) % 1;
      }
    } else if (spec.anim === 'pace' && a.pace) {
      const p = a.pace;
      p.s += 0.8 * frameDt;
      const u = p.s % (p.len * 2);
      const fwd = u < p.len;
      const t = (fwd ? u : p.len * 2 - u) / p.len;
      a.x = p.ax + (p.bx - p.ax) * t;
      a.z = p.az + (p.bz - p.az) * t;
      a.yaw = Math.atan2((p.bx - p.ax) * (fwd ? 1 : -1), (p.bz - p.az) * (fwd ? 1 : -1));
      phase = (p.s / 0.55) % 1;
    }
    const tp = performance.now();
    ud.pose?.(pose, phase);
    const dp = performance.now() - tp;
    if (dp > 8) slow.push(`pose ${pose}${spec.seat !== undefined ? ' seat' : ''} ${dp.toFixed(0)}ms`);
  }
  /** 慢的一下（> 8 毫秒）：哪个姿势、哪个道具（找"第一次"的卡顿；perf().slow） */
  const slow: string[] = [];
  function setLean(b: Body, lean: number) {
    if (b.obj.rotation.x === lean) return;
    b.obj.rotation.order = 'YXZ';
    b.obj.rotation.x = lean;
  }
  function setProp(b: Body, p: string | null) {
    if (b.prop === p) return;
    const t0 = performance.now();
    b.prop = p;
    b.obj.userData.setProp?.(p);
    const dp = performance.now() - t0;
    propMs += dp;
    if (dp > 8) slow.push(`prop ${p} ${dp.toFixed(0)}ms`);
  }
  /** 这一帧换道具、换座花了多久（perf 的 worst 里看：第一次拿出某种道具要建网格） */
  let propMs = 0;

  // ── 镜头 ──
  function setOverview(v: boolean) {
    if (v === overview) return;
    overview = v;
    const rig = host.pipe.rig;
    if (v) {
      rig.metersPerTexel /= courtK;
      courtK = 1;
      mptSaved = rig.metersPerTexel;
      ovSaved.yaw = rig.yaw;
      ovSaved.pitch = rig.pitch;
      fitOverview();
      followId = null;
      pin = null;
    } else if (mptSaved) {
      rig.metersPerTexel = mptSaved;
      rig.yaw = ovSaved.yaw;
      rig.pitch = ovSaved.pitch;
      play.zoomBy(1);
    }
    dots.visible = v;
  }
  /**
   * 看全图怎么摆（第 2 轮评审：竖屏里俱乐部只占中间一条，上面山、下面空地）：竖屏时镜头转到东边往西看（俱乐部东西长、
   * 南北短：转过来长的那边竖着放），俯得更陡一点，按"顶上的按钮和面板之间"那一段的高度和屏幕宽度取大的那个缩放 ——
   * 俱乐部（围墙里 + 东边的停车场、大门）占满竖屏的七成。横屏照旧（不转），按宽高放下。
   */
  function fitOverview() {
    const rig = host.pipe.rig;
    const low = host.pipe.lowSize;
    const portrait = low.y > low.x * 1.1;
    rig.yaw = portrait ? OV_YAW : ovSaved.yaw;
    rig.pitch = OV_PITCH;
    const ew = OV.x1 - OV.x0;
    const ns = OV.z1 - OV.z0;
    const across = portrait ? ns : ew;
    const along = (portrait ? ew : ns) * Math.sin(rig.pitch);
    // 能用的高度（纹素）：去掉顶上的按钮、底下收起的面板
    const H = innerHeight;
    const usable = (low.y * Math.max(H * 0.4, Math.min(H, panelTop) - TOP_UI)) / H;
    rig.metersPerTexel = Math.max(across / low.x, along / usable) * 1.02;
  }
  const ovSaved = { yaw: 0, pitch: Math.PI / 4 };
  /** 镜头现在看的是不是一块场（跟着打球的人，或者定住的点在场地里） */
  function onCourt(): boolean {
    const a = followId ? actors.get(followId) : undefined;
    if (a) {
      const v = viewBy.get(a.id);
      if (!v || a.hidden) return false;
      if (PLAYING.has(v.doing)) return true;
      const w = v.where;
      if (w.kind !== 'at') return false;
      const k = placeBy.get(w.at)?.kind;
      return k === 'court' || k === 'pickle' || w.at === 'post.stadium.pros';
    }
    if (!pin) return false;
    const p = pin;
    return COURT_RECTS.some((r) => p.x > r.x0 && p.x < r.x1 && p.z > r.z0 && p.z < r.z1);
  }
  /** 看场时平滑地拉远到放得下一整块场，离开推回来 */
  function courtZoom(dt: number) {
    const rig = host.pipe.rig;
    const base = rig.metersPerTexel / courtK;
    const want = !overview && onCourt() ? Math.max(1, COURT_W / (host.pipe.lowSize.x * base)) : 1;
    if (Math.abs(want - courtK) < 1e-4) return;
    const step = Math.min(Math.abs(Math.log(want / courtK)), dt * Math.log(COURT_RATE));
    courtK *= Math.exp(Math.sign(want - courtK) * step);
    if (Math.abs(want - courtK) < 1e-3) courtK = want;
    rig.metersPerTexel = base * courtK;
  }
  function moveCamera(dt: number) {
    const t = host.pipe.rig.target;
    courtZoom(dt);
    if (overview) {
      // 俱乐部的中心放在"顶上的按钮和面板之间"的正中（面板展开、收起时跟着挪）：屏幕往上 = 地面上的 (−sin yaw, −cos yaw)
      const rig = host.pipe.rig;
      const H = innerHeight;
      const midPx = (TOP_UI + Math.min(H, panelTop)) / 2;
      const lead = ((H / 2 - midPx) * (rig.metersPerTexel / host.pipe.px)) / Math.sin(rig.pitch);
      t.set((OV.x0 + OV.x1) / 2 + Math.sin(rig.yaw) * lead, 0, (OV.z0 + OV.z1) / 2 + Math.cos(rig.yaw) * lead);
      return;
    }
    // 用户在走总监（按住、点地面）：镜头回到总监（面板让他走开 / 走回前台的那一趟不算）
    deskArrive();
    const d = host.director.position;
    if (
      pin &&
      !deskWalk &&
      (play.state().speed > 0.05 || play.pathLeft() > 0 || Math.hypot(d.x - pinFrom.x, d.z - pinFrom.z) > 1.5)
    )
      pin = null;
    const a = followId ? actors.get(followId) : undefined;
    const goal = a ?? pin;
    if (!goal) {
      cam.has = false;
      return;
    }
    const gx = goal.x;
    // 人放在"顶上的按钮和面板之间"的正中：面板展开时往上挪
    const H = innerHeight;
    const midPx = (TOP_UI + Math.min(H, panelTop)) / 2;
    const rig = host.pipe.rig;
    const lead = ((H / 2 - midPx) * (rig.metersPerTexel / host.pipe.px)) / Math.sin(rig.pitch);
    let gz = goal.z + lead;
    // 会所切成剖面、镜头看着会所里（第 2 轮评审：上面 40% 是一片空沙地）：画面上沿不超过会所北墙，镜头往下挪，让会所占满
    if (host.houseOpen?.() && goal.x > -64.5 && goal.x < -39.5 && goal.z > -43 && goal.z < -1) {
      const top = ((H / 2 - TOP_UI) * (rig.metersPerTexel / host.pipe.px)) / Math.sin(rig.pitch);
      gz = Math.max(gz, HOUSE_NORTH + top);
    }
    if (!cam.has) {
      cam.x = t.x;
      cam.z = t.z;
      cam.gx = gx;
      cam.gz = gz;
      cam.has = true;
    }
    // 跟着走路的人：先跟着他挪同样的一步（加速时一秒走二十多米，光靠平滑会落后一大截、人跑到画面边上），再把差的那点平滑补上
    const k = 1 - Math.exp(-dt * 6);
    const far = Math.hypot(gx - cam.x, gz - cam.z) > 60;
    const step = Math.hypot(gx - cam.gx, gz - cam.gz) < 8;
    if (step) {
      cam.x += gx - cam.gx;
      cam.z += gz - cam.gz;
    }
    cam.gx = gx;
    cam.gz = gz;
    cam.x = far ? gx : cam.x + (gx - cam.x) * k;
    cam.z = far ? gz : cam.z + (gz - cam.z) * k;
    t.x = cam.x;
    t.z = cam.z;
    t.y += ((a ? a.y : 0) - t.y) * (1 - Math.exp(-dt * 3));
  }

  // ── 面板 ──
  const hud = createSimHud({
    setSpeed(x) {
      clock.speed = x;
      clock.paused = false;
      syncHud(true);
    },
    togglePause() {
      clock.paused = !clock.paused;
      syncHud(true);
    },
    jump(m) {
      jump(m);
      syncHud(true);
    },
    follow(id) {
      follow(id);
    },
    followRandom() {
      const id = pickFollow(null, followId);
      if (!id) return;
      follow(id);
      // 点完收起面板（第 3 轮：跟人以后面板一直展开着占三分之二屏），镜头里看得见他
      hud.open(false);
    },
    openCard() {
      const a = followId ? s?.agents[followId] : undefined;
      if (a && host.openCard && CAST.get(a.person)) host.openCard(a.person);
    },
    toggleOverview() {
      setOverview(!overview);
      syncHud(true);
    },
    toggleDesk() {
      toggleDesk();
    },
    exit() {
      api.enable(false);
      host.onExit?.();
    },
    opened() {
      syncHud(true);
    },
  });
  /** 看着有意思的事（跟人时挑的、跟的人走了换人时挑的）：打球、上课、吃喝、游泳、看球、玩…… */
  const WORTH = new Set<string>([
    'tennis',
    'pickle',
    'lesson',
    'warmup',
    'watch',
    'chat',
    'order',
    'eat',
    'drink',
    'swim',
    'sunbathe',
    'golf',
    'kidplay',
    'rest',
    'queue',
  ]);
  let pickNo = 0;
  /**
   * 挑一个人跟（第 3 轮评审问题 6：随便跟到的人十分钟就回家、或者藏在会所里，镜头停在空落客点）：
   * 客人、会员（不挑员工教练），还要待一个小时以上、日程里还有不止"回家"，此刻看得见；在干有意思的事的、有名有姓的往前。
   * near = 换人时离他近的先（跟的人回家了：就近换一个）；skip = 不挑他。点几次"随便跟一个人"在前几名里轮着换
   */
  function pickFollow(near: { x: number; z: number } | null, skip: AgentId | null): AgentId | null {
    if (!s) return null;
    const now = s.minute;
    const scored: { id: AgentId; k: number }[] = [];
    for (const v of views) {
      const ag = s.agents[v.id];
      if (!ag || v.id === skip || v.where.kind === 'away' || isHiddenNow(v) || isStaff(ag.role)) continue;
      if (v.doing === 'leave' || ag.leaveBy - now < 60 || !ag.plan.some((q) => q.doing !== 'leave')) continue;
      const a = actors.get(v.id);
      if (a?.hidden) continue;
      let k = 0;
      if (!WORTH.has(v.doing) && v.where.kind !== 'travel') k += 40;
      if (personOf(cfg, ag.person, s)?.tier === 'named') k -= 15;
      k -= Math.min(4, (ag.leaveBy - now) / 60) * 3;
      if (near && a) k += Math.hypot(a.x - near.x, a.z - near.z) * 0.6;
      scored.push({ id: v.id, k: k + hashOf(v.id) * 6 });
    }
    if (!scored.length) return null;
    scored.sort((p, q) => p.k - q.k);
    if (near) return scored[0].id;
    return scored[pickNo++ % Math.min(5, scored.length)].id;
  }
  /** 跟着的人回家了：什么时候（真实秒）、最后在哪 */
  let goneAt = -1;
  const goneFrom = { x: 0, z: 0 };
  /** 跟着的人走了（离开俱乐部）：过 GONE_S 真实秒就近换一个，"刚刚"里写一句；没人可换就不跟了（镜头回总监） */
  function followWatch() {
    if (!followId || !s) return;
    const ag = s.agents[followId];
    const a = actors.get(followId);
    if (a && !a.hidden) {
      goneFrom.x = a.x;
      goneFrom.z = a.z;
    }
    if (ag && ag.where.kind !== 'away') {
      goneAt = -1;
      return;
    }
    if (goneAt < 0) goneAt = rt;
    if (rt - goneAt < GONE_S) return;
    goneAt = -1;
    const was = nameOf(followId);
    const next = pickFollow(goneFrom, followId);
    if (next) pushFeed(s.minute, `${was} 回家了，换着跟 ${nameOf(next)}`);
    follow(next);
  }
  function isHiddenNow(v: AgentView) {
    const w = v.where;
    return w.kind === 'at' && !!SPOTS[w.at]?.hidden;
  }
  function follow(id: AgentId | null) {
    followId = id;
    // 跟人时镜头从现在的地方平滑挪过去（不跳）；不跟了回到总监（play 的镜头接着跟他）
    if (id) setOverview(false);
    pin = null;
    cam.has = false;
    syncHud(true);
  }
  /** 只挪镜头（不挪总监）：定在 (x, z)，总监一动就回去 */
  function look(x: number, z: number) {
    followId = null;
    setOverview(false);
    pin = { x, z };
    pinFrom.x = host.director.position.x;
    pinFrom.z = host.director.position.z;
    cam.has = false;
  }
  /** 总监站到前台柜台后面，朝签到的人（引擎按"总监在前台"跑） */
  function toDesk() {
    play.teleport(DESK_STAND[0], DESK_STAND[1], DESK_FACE);
    deskWalk = null;
  }
  /** 面板的"总监离开前台"：正在走开（away）/ 走回来（back）；走的时候镜头不放开（定住的镜头照旧） */
  let deskWalk: 'away' | 'back' | null = null;
  const deskAway = () => (deskWalk ? deskWalk === 'away' : directorAt() !== 'desk.counter');
  function toggleDesk() {
    if (!s) return;
    if (deskAway()) {
      deskWalk = 'back';
      play.tapWorld(DESK_STAND[0], DESK_STAND[1]);
      pushFeed(s.minute, '总监回前台了');
    } else {
      deskWalk = 'away';
      play.tapWorld(DESK_AWAY.x, DESK_AWAY.z);
      pushFeed(s.minute, '总监离开了前台：来签到的人只能排队等');
    }
    syncHud(true);
  }
  /** 总监走到了：回前台的站回柜台后面的接待位、朝客人；定住的镜头从这儿算"总监没再动" */
  function deskArrive() {
    if (!deskWalk) return;
    if (play.pathLeft() > 0 || play.state().speed > 0.05) return;
    if (deskWalk === 'back') play.teleport(DESK_STAND[0], DESK_STAND[1], DESK_FACE);
    deskWalk = null;
    pinFrom.x = host.director.position.x;
    pinFrom.z = host.director.position.z;
    syncHud(true);
  }

  function nowText(id: AgentId): { text: string; gone: boolean } {
    const a = s?.agents[id];
    if (!a) return { text: '', gone: true };
    const w = a.where;
    if (w.kind === 'away')
      return { text: a.doing === 'leave' ? '回家了' : `还没来（${hhmm(a.arrive)} 到）`, gone: true };
    // 大白话：在哪、干什么、跟谁、到几点
    if (w.kind === 'travel') {
      if (a.doing === 'leave') return { text: `往外走，回家（${placeName(w.to)}）`, gone: false };
      const next = a.plan[0];
      const why = next && next.doing !== 'leave' ? `${DOING_NAME[next.doing]}` : '';
      return { text: `走去${placeName(w.to)}${why ? `${why}` : ''}（${hhmm(w.t1)} 到）`, gone: false };
    }
    if (w.kind === 'queue') {
      const k = viewBy.get(id)?.spot ?? 0;
      return { text: `在${placeName(w.at)}排队（前面 ${k} 个人）`, gone: false };
    }
    const n = viewBy.get(id)?.with.length ?? 0;
    const mates = n ? `，和 ${n} 个人一起` : '';
    return { text: `在${placeName(w.at)}${DOING_NAME[a.doing]}${mates}（到 ${hhmm(w.until)}）`, gone: false };
  }
  /** 名单里一行小字：在干什么、在哪（大白话、短） */
  function shortNow(v: AgentView): string {
    const w = v.where;
    if (w.kind === 'travel') return v.doing === 'leave' ? '往外走，回家' : `走去${placeName(w.to)}`;
    if (w.kind === 'queue') return `在${placeName(w.at)}排队`;
    if (w.kind === 'at') return `${DOING_NAME[v.doing]} · ${placeName(w.at)}`;
    return DOING_NAME[v.doing];
  }
  /** "干什么 · 在哪"：地点名里已经有这件事（"前台签到"）就只写地点 */
  function doingAt(doing: AgentView['doing'], at?: PlaceId) {
    const dn = DOING_NAME[doing];
    const pn = placeName(at);
    if (!pn) return dn;
    return pn.includes(dn) ? pn : `${dn} · ${pn}`;
  }
  function intentText(it: Intent) {
    if (it.at) return `${doingAt(it.doing, it.at)}（${it.minutes} 分钟）`;
    const where = it.kinds?.length ? `，去${it.kinds.map((k) => KIND_NAME[k] ?? k).join('或')}` : '';
    return `${DOING_NAME[it.doing]}${where}（${it.minutes} 分钟）`;
  }
  function agendaOf(id: AgentId): AgendaRow[] {
    if (!s) return [];
    const a = s.agents[id];
    if (!a) return [];
    const rows: AgendaRow[] = [];
    // 连着几条同一件事、同一个地方（引擎在同一张长椅上续了一段）合成一行，留第一次的时间（第 2 轮评审：一行写三遍）
    const push = (t: number, text: string) => {
      if (rows.length && rows[rows.length - 1].text === text) return;
      rows.push({ t: hhmm(t), text, state: 'past' });
    };
    for (const e of s.log) {
      if (e.agent !== id) continue;
      if (e.kind === 'arrive') {
        // 一伙人里不是带头的：签到、换衣服都是带头的去，他跟着走（第 2 轮评审：日程里少一步，看不出为什么）
        const lead = a.party ? s.parties[a.party]?.lead : undefined;
        const withLead = lead && lead !== id ? `，跟着 ${nameOf(lead)} 一起` : '';
        push(e.t, `到了（${placeName(e.at ?? a.entry)}${withLead}）`);
      } else if (e.kind === 'start' && e.doing && e.doing !== 'travel') push(e.t, doingAt(e.doing, e.at));
      else if (e.kind === 'gaveUp') push(e.t, e.note ?? `不在${placeName(e.at)}等了`);
      else if (e.kind === 'leave') push(e.t, '回家了');
    }
    const past = rows.slice(-6);
    const now = nowText(id);
    const out: AgendaRow[] = [...past];
    if (!now.gone) {
      // 正在做的那一项（最后一条 start 就是它）：标成现在
      const w = a.where;
      if (w.kind === 'at' && out.length && out[out.length - 1].text.includes(placeName(w.at)))
        out[out.length - 1].state = 'now';
      else out.push({ t: hhmm(s.minute), text: now.text, state: 'now' });
    } else if (a.where.kind === 'away' && a.doing !== 'leave')
      out.push({ t: hhmm(a.arrive), text: '到俱乐部', state: 'next' });
    for (const it of a.plan.slice(a.where.kind === 'at' ? 1 : 0, 6)) {
      const text = intentText(it);
      if (out.length && out[out.length - 1].state === 'next' && out[out.length - 1].text === text) continue;
      out.push({ t: it.after !== undefined ? hhmm(it.after) : '然后', text, state: 'next' });
    }
    if (!(a.where.kind === 'away' && a.doing === 'leave'))
      out.push({ t: hhmm(a.leaveBy), text: '最晚这时候回家', state: 'next' });
    return out;
  }

  let hudT = 0;
  let panelSig = '';
  function syncHud(force = false) {
    if (!on || !s) return;
    hudT -= frameDt;
    if (!force && hudT > 0) return;
    hudT = 0.25;
    const st = s;
    // 面板收起时只要底下两行（时间、人数、跟着谁）：名单、各区域、事件流、日程都不算（省得每 0.25 秒排一遍几百人、重写 DOM）
    const full = hud.isOpen();
    const areas = new Map<string, number>();
    let total = 0;
    for (const v of views) {
      if (v.where.kind === 'away') continue;
      total++;
      if (!full) continue;
      const w = v.where;
      const name = w.kind === 'travel' ? '路上' : (SCENE_NAME[placeBy.get(w.at)?.scene ?? 'clubdesk'] ?? '别处');
      areas.set(name, (areas.get(name) ?? 0) + 1);
    }
    const fa = followId ? st.agents[followId] : undefined;
    const fp = fa ? personOf(cfg, fa.person, s) : undefined;
    const nt = followId ? nowText(followId) : null;
    // 此刻在场、看得见的人：客人、会员（镜头附近的先，named 往前一点）在前；员工、教练排后面，只占两格
    const ct = host.pipe.rig.target;
    let staffN = 0;
    const ranked = (full ? views : [])
      .filter((v) => v.where.kind !== 'away' && !isHiddenNow(v))
      .map((v) => {
        const p = personOf(cfg, v.person, s);
        const a = actors.get(v.id);
        const staff = isStaff(st.agents[v.id]?.role ?? p?.role);
        if (staff) staffN++;
        const d = a ? Math.hypot(a.x - ct.x, a.z - ct.z) : 999;
        return { v, p, staff, k: d - (p?.tier === 'named' ? 12 : 0) };
      })
      .sort((x, y) => Number(x.staff) - Number(y.staff) || x.k - y.k);
    const guests = ranked.filter((r) => !r.staff).slice(0, 10);
    const present = [...guests, ...ranked.filter((r) => r.staff).slice(0, 12 - guests.length)];
    const d: HudData = {
      clock: hhmm(st.minute),
      period: jumpTo !== null ? `快进到 ${hhmm(jumpTo)}…` : periodOf(st.minute),
      speed: clock.speed,
      paused: clock.paused,
      total,
      areas: [...areas.entries()].sort((x, y) => y[1] - x[1]).slice(0, 10),
      follow:
        fa && nt
          ? {
              name: fp?.name ?? fa.person,
              title: fp ? `${fp.title} · ${fp.age} 岁` : '',
              now: nt.text,
              agenda: full ? agendaOf(fa.id) : [],
              gone: nt.gone,
              canCard: !!host.openCard && !!CAST.get(fa.person),
            }
          : null,
      picks: present.map(({ v, p, staff }) => ({
        id: v.id,
        name: p?.name ?? v.person,
        note: `${staff ? '员工 · ' : ''}${shortNow(v)}`,
      })),
      staff: staffN,
      feed: (full ? feed : [])
        .slice(-7)
        .reverse()
        .map((e) => ({ t: hhmm(e.t), text: e.text })),
      overview,
      desk: { away: deskAway(), moving: !!deskWalk },
      gaps: full && devPanel ? gapLines() : [],
    };
    hud.sync(d);
    countHouse();
    // 面板的上沿：展开、收起、多一行"跟着"时才变（量一次要排版，别每次都量）
    const sig = `${hud.el.hidden}|${hud.isOpen()}|${!!d.follow}|${innerHeight}|${innerWidth}`;
    if (sig !== panelSig || force) {
      panelSig = sig;
      panelTop = hud.el.hidden ? innerHeight : hud.el.getBoundingClientRect().top;
      if (overview) fitOverview();
    }
  }

  // ── 点画面里的人：跟着他 ──
  const origTap = play.tapScreen.bind(play);
  const hp = new THREE.Vector3();
  play.tapScreen = (x, y, W, H) => {
    if (on) {
      let best: AgentId | null = null;
      let bd = overview ? 26 : 34;
      for (const [id, a] of actors) {
        if (a.hidden) continue;
        if (!overview && !a.body?.obj.visible) continue;
        hp.set(a.x, a.y + (overview ? 1.3 : a.kind === 'kid' ? 0.7 : 1.1), a.z);
        const p = play.project(hp, W, H);
        const dd = Math.hypot(p.x - x, p.y - y);
        if (dd < bd) {
          bd = dd;
          best = id;
        }
      }
      if (best) {
        follow(best);
        return;
      }
    }
    origTap(x, y, W, H);
  };

  // ── 名字小牌（跟着的那个人） ──
  function drawTag() {
    const a = followId ? actors.get(followId) : undefined;
    const tag = hud.tag;
    if (!a || a.hidden || !a.body?.obj.visible) {
      tag.hidden = true;
      return;
    }
    hp.set(a.x, a.y + (a.kind === 'kid' ? 1.45 : a.kind === 'teen' ? 1.75 : 2.05), a.z);
    const p = play.project(hp, innerWidth, innerHeight);
    const v = viewBy.get(a.id);
    const name = (a.person?.name ?? a.id).split(' ')[0];
    // 小牌：名字 + 在干什么（路上的写去哪，太长截短）
    const what = v ? (v.where.kind === 'travel' ? shortNow(v) : DOING_NAME[v.doing]) : '';
    const html = `${esc(name)}<small>${esc(what.length > 9 ? `${what.slice(0, 8)}…` : what)}</small>`;
    if (tag.innerHTML !== html) tag.innerHTML = html;
    tag.hidden = false;
    // 小牌留在画面里、不压到顶上的按钮和底下的面板（人走到边上时贴着边）
    const tx = Math.min(innerWidth - 60, Math.max(60, p.x));
    const ty = Math.min(Math.min(innerHeight, panelTop) - 8, Math.max(TOP_UI - 40, p.y));
    tag.style.transform = `translate(${Math.round(tx)}px, ${Math.round(ty)}px) translate(-50%, -100%)`;
  }

  // ── 会所屋顶上的人数小牌：楼上楼下（健身房、更衣室、二楼酒吧、露台）的人看不见；屋顶盖着时一楼的也算 ──
  const badge = hud.badge;
  let badgeN = 0;
  let badgeOpen = false;
  function countHouse() {
    const open = host.houseOpen?.() ?? false;
    let n = 0;
    for (const v of views) {
      const w = v.where;
      if (w.kind !== 'at' && w.kind !== 'queue') continue;
      if (placeBy.get(w.at)?.scene !== 'clubhouse') continue;
      if (!open || floorOf(w.at) !== shownFloor) n++;
    }
    badgeN = n;
    badgeOpen = open;
  }
  function drawBadge() {
    if (!badgeN) {
      badge.hidden = true;
      return;
    }
    hp.set(HOUSE_BADGE.x, HOUSE_BADGE.y, HOUSE_BADGE.z);
    const p = play.project(hp, innerWidth, innerHeight);
    // 会所在画面外很远：不出；会所在画面边上（屋顶露一角）：小牌贴着画面边
    if (p.x < -260 || p.x > innerWidth + 260 || p.y < TOP_UI - 60 || p.y > Math.min(innerHeight, panelTop)) {
      badge.hidden = true;
      return;
    }
    p.x = Math.min(innerWidth - 50, Math.max(50, p.x));
    p.y = Math.max(TOP_UI, p.y);
    const html = `${badgeOpen ? '楼上楼下' : '会所'} <b>${badgeN}</b>`;
    if (badge.innerHTML !== html) badge.innerHTML = html;
    badge.hidden = false;
    badge.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px) translate(-50%, -100%)`;
  }

  // ── 天光跟着引擎 ──
  function syncDaylight() {
    if (!s) return;
    day.total = dayBase + (s.minute + clock.frac) / 60;
  }

  const api: SimMount = {
    get on() {
      return on;
    },
    minute: () => (s ? s.minute : null),
    enable(v, o = {}) {
      if (o.speed !== undefined) clock.speed = o.speed;
      if (v && o.desk) {
        toDesk();
        look(FORECOURT.x, FORECOURT.z);
      }
      if (v && !on) {
        on = true;
        if (!s) fresh();
        savedSpeed = day.speed;
        savedWeather = day.weather;
        day.speed = 0;
        dayBase = Math.floor(day.total / 24) * 24;
        const wth = s?.weather;
        day.weather = wth?.rain ? 'rain' : wth?.wind ? 'dust' : 'clear';
        host.suppressScene(true);
        // ── fx（补画面）：观察一打开就预热道具、车、姿势（分几十帧做，第一次出托盘、躺下不卡） ──
        fx.prewarm();
        // 身子也先建好一池子（每帧 ≤ WARM_MS 毫秒；第 2 轮评审：人一多时当场建，一帧卡几十毫秒）
        warmBodies = true;
        hud.show(true);
        clock.paused = false;
      } else if (!v && on) {
        on = false;
        deskWalk = null;
        host.pipe.rig.metersPerTexel /= courtK;
        courtK = 1;
        host.suppressScene(false);
        fx.off();
        clearActors();
        pool.hideAll();
        setOverview(false);
        followId = null;
        pin = null;
        jumpTo = null;
        hud.show(false);
        badge.hidden = true;
        day.speed = savedSpeed;
        day.weather = savedWeather;
      }
      if (v && o.at !== undefined) jump(o.at);
      if (v) hud.open(!!o.panel);
      if (v) {
        syncDaylight();
        syncHud(true);
      }
    },
    step(dt) {
      if (!on || !s) return;
      const t0 = performance.now();
      if (jumpTo !== null) {
        // 跳时刻：这一帧的第一个固定步长里推一片（一帧可能有两个固定步长，只推一次）
        if (!jumpedThisFrame) jumpSlice(JUMP_MS);
        jumpedThisFrame = true;
      } else {
        const n = clock.tick(dt);
        if (n) {
          advance(n);
          perf.steps += n;
        }
      }
      // 一天完了（关门后人走光了，或者过了午夜）：第二天，从开门前半小时看起（员工陆续到；半夜那几个小时快进过去）
      if (
        jumpTo === null &&
        (s.minute >= 24 * 60 - 1 || (s.minute >= DAY_END && views.every((v) => v.where.kind === 'away')))
      ) {
        const r0 = performance.now();
        dayNo++;
        dayBase += 24;
        fresh();
        jump(OPEN - 30);
        pushFeed(OPEN - 30, `新的一天（第 ${dayNo} 天）`);
        perf.rollMs = Math.max(perf.rollMs, performance.now() - r0);
      }
      moveCamera(dt);
      const ms = performance.now() - t0;
      perf.engine += ms;
      engineFrame += ms;
      perf.engineMax = Math.max(perf.engineMax, ms);
    },
    frame(dt) {
      if (!on || !s) return;
      const t0 = performance.now();
      frameDt = Math.min(0.1, dt);
      dtAvg += (frameDt - dtAvg) * 0.05;
      rt += frameDt;
      syncDaylight();
      const vr = host.viewRect(MARGIN);
      const ct = host.pipe.rig.target;
      frameNo++;
      const t1 = performance.now();
      shownFloor = host.houseOpen?.() ? (host.houseFloor?.() ?? 1) : 1;
      followWatch();
      place(nowMin(), ct.x, ct.z);
      // 画不出来的地方（总监在会所里：只画会所，外面是黑的）：那里的人不给身子，免得漂在黑底上
      const vis = host.visibleAt;
      if (vis) for (const a of actors.values()) if (!a.hidden && !vis(a.x, a.z)) a.hidden = true;
      // 剖面看的不是一楼（总监下到负一层 / 上到二楼）：一楼的人、会所里走着的人不画（导航是那一层的，画出来就站到别的层的器械中间去了）
      if (shownFloor !== 1)
        for (const v of views) {
          const a = actors.get(v.id);
          if (!a || a.hidden) continue;
          const w = v.where;
          if (w.kind === 'travel') {
            if (inHouse(a.x, a.z)) a.hidden = true;
          } else if ((w.kind === 'at' || w.kind === 'queue') && floorOf(w.at) !== shownFloor && inHouse(a.x, a.z))
            a.hidden = true;
        }
      const t2 = performance.now();
      // 建身子、换装的预算（毫秒）：快进时少给（人进出画面太快，换不过来也看不出来）
      pool.frame(clock.speed >= FAST ? 0.8 : 3);
      if (warmBodies && pool.prebuild(WARM_BODIES, WARM_MS)) warmBodies = false;
      assignBodies(vr, host.viewRect(MARGIN + 10), host.viewRect(0), ct.x, ct.z);
      separate();
      const t3 = performance.now();
      // 身子摆到位、摆姿势
      const nav = play.nav;
      for (const v of views) {
        const a = actors.get(v.id);
        const b = a?.body;
        if (!a || !b) continue;
        if (a.hidden) {
          b.obj.visible = false;
          continue;
        }
        poseActor(a, v);
        let y = a.y;
        if (!a.moving && !a.pace && a.fixY !== undefined) y = a.fixY;
        else if (a.moving || a.pace || a.yKey !== a.anchorKey) {
          const h = nav.height(a.x, a.z);
          if (h !== null) y = h;
          a.yKey = a.moving || a.pace ? '' : a.anchorKey;
        }
        const sink = !a.moving && a.spec?.sink ? a.spec.sink : 0;
        a.y = y;
        b.obj.position.set(a.x, y - sink + a.lift, a.z);
        b.obj.userData.simLift = a.lift;
        b.obj.rotation.y = a.yaw;
        b.obj.visible = true;
      }
      const t3b = performance.now();
      // ── fx（clubwalk/sim/fx）：姿势摆好以后再补一层 ──
      const tfx = performance.now();
      fx.frame({ dt: frameDt, rt, now: nowMin(), speed: clock.paused ? 0 : clock.speed, s, views, actors, view: vr });
      const dfx = performance.now() - tfx;
      if (dfx > 8)
        slow.push(`fx ${dfx.toFixed(0)}ms ${JSON.stringify((fx.stats() as { partMs?: unknown }).partMs ?? '')}`);
      if (overview) {
        dots.begin();
        for (const v of views) {
          const a = actors.get(v.id);
          if (!a || a.hidden) continue;
          dots.add(a.x, a.y, a.z, dotColor(v), a.kind === 'kid' ? 0.75 : 1);
        }
        dots.end();
      }
      // 寻路放在最后，用这一帧剩下的时间（第 2 轮：P95 超预算的帧都是"演出 + 一次 A*"）：演出已经花了多少，
      // 剩下的够规划一段才规划（按平均耗时估）；太久没规划过（2× 下 0.25 秒、快进 0.5 秒）就不管预算先规划一段。
      // 导航刚重建的那一帧不规划：重建后第一次寻路要先算连通分量（~0.1 秒），留给 walk.ts 下一帧的 prepare。
      // 路排得多（刚跳完时刻、刚换天、一伙人一下都出发）：上限放宽一倍
      const ta = performance.now();
      if (navFresh) navFresh = false;
      else {
        const cap = clock.speed >= FAST ? PATH_MS * 0.6 : planner.pending() > 12 ? PATH_MS * 2 : PATH_MS;
        planner.run(rt, PATH_BUDGET, Math.min(cap, FRAME_MS - (ta - t0)), clock.speed >= FAST ? 0.5 : 0.25);
      }
      const t4 = performance.now();
      seg.paths += t4 - ta;
      seg.place += t2 - t1;
      seg.bodies += t3 - t2;
      seg.pose += t3b - t3;
      seg.fx += ta - t3b;
      drawTag();
      drawBadge();
      syncHud();
      const t5 = performance.now();
      seg.hud += t5 - t4;
      const ms = t5 - t0;
      if (ms > 30)
        slow.push(
          `frame ${ms.toFixed(0)}ms paths ${(t4 - ta).toFixed(0)} place ${(t2 - t1).toFixed(0)} bodies ${(t3 - t2).toFixed(0)} pose ${(t3b - t3).toFixed(0)} fx ${(ta - t3b).toFixed(0)} hud ${(t5 - t4).toFixed(0)}`,
        );
      // 最慢的那一帧各段花了多久（找卡顿）
      if (ms > perf.actorsMax)
        perf.worst = {
          paths: +(t4 - ta).toFixed(1),
          place: +(t2 - t1).toFixed(1),
          bodies: +(t3 - t2).toFixed(1),
          pose: +(t3b - t3).toFixed(1),
          fx: +(ta - t3b).toFixed(1),
          props: +propMs.toFixed(1),
          hud: +(t5 - t4).toFixed(1),
        };
      propMs = 0;
      perf.actors += ms;
      perf.actorsMax = Math.max(perf.actorsMax, ms);
      perf.frames++;
      perf.win.push(ms);
      if (perf.win.length > 240) perf.win.shift();
      perf.frameMax = Math.max(perf.frameMax, ms + engineFrame);
      engineFrame = 0;
      jumpedThisFrame = false;
    },
    focus() {
      if (!on) return null;
      if (overview) return { x: (OV.x0 + OV.x1) / 2, z: (OV.z0 + OV.z1) / 2 };
      const a = followId ? actors.get(followId) : undefined;
      return a ? { x: a.x, z: a.z } : pin ? { ...pin } : null;
    },
    overview: () => on && overview,
    navChanged() {
      planner.clear();
      navFresh = true;
      // 正在走的路按新导航重新规划（下一帧）
      for (const a of actors.values()) if (a.leg) a.leg.route = a.leg.way.length === 1 ? a.leg.route : null;
    },
    openPanel() {
      hud.open(true);
    },
    drawMap(g, sx, sz) {
      if (!on) return;
      // 每个在场、看得见的人一个点（颜色同看全图的点：打球黄绿、吃喝橙、排队红、路上白……）；深色描一圈，浅色的沙地上也看得清
      const r = Math.max(1.5, Math.min(2, Math.abs(sx(1) - sx(0)) * 0.9));
      for (const v of views) {
        const a = actors.get(v.id);
        if (!a || a.hidden || v.where.kind === 'away') continue;
        const x = Math.round(sx(a.x));
        const y = Math.round(sz(a.z));
        g.fillStyle = '#2c2450';
        g.fillRect(x - r - 0.5, y - r - 0.5, r * 2 + 1, r * 2 + 1);
        g.fillStyle = DOT_CSS[dotKind(v)];
        g.fillRect(x - r, y - r, r * 2, r * 2);
      }
    },
  };

  const KIND_NAME: Record<string, string> = {
    court: '网球场',
    pickle: '匹克球场',
    table: '桌子',
    seat: '座位',
    stall: '摊位',
    cafe: '咖啡吧',
    bar: '酒吧',
    pool: '泳池',
    lounger: '躺椅',
    gym: '健身房',
    locker: '更衣室',
    shop: '店',
    stand: '看台',
    lesson: '课',
    play: '玩水的地方',
    golf: '高尔夫',
    desk: '前台',
  };

  // 调试钩子（simshot.mjs、测试用）
  (window as unknown as Record<string, unknown>).__clubsim = {
    get on() {
      return on;
    },
    enable: (v = true, o?: { at?: Minute; speed?: number; panel?: boolean; desk?: boolean }) => api.enable(v, o),
    /** 跳时刻（分几帧快进，同面板的按钮）；sync = 一口气推完 */
    jump: (m: Minute, sync = false) => {
      if (!on) api.enable(true);
      jump(m, sync);
      syncHud(true);
    },
    /** 还在快进（跳时刻没推完） */
    get jumping() {
      return jumpTo !== null;
    },
    speed: (x: number) => {
      clock.speed = x;
      clock.paused = x === 0;
    },
    pause: (p = true) => {
      clock.paused = p;
    },
    view: () => views,
    follow: (id: AgentId | null) => follow(id),
    /** 跟着某个地点里的一个人（截图：给地点 id 的前缀，例如 'food.' 'clay.'） */
    followAt: (prefix: string) => {
      const v = views.find((q) => (q.where.kind === 'at' || q.where.kind === 'queue') && q.where.at.startsWith(prefix));
      if (v) follow(v.id);
      return v?.id ?? null;
    },
    overview: (v = true) => {
      setOverview(v);
      syncHud(true);
    },
    /** 只挪镜头（不挪总监）；总监一动就回去 */
    look: (x: number, z: number) => look(x, z),
    /** 总监站到前台柜台后面 */
    toDesk: () => toDesk(),
    director: () => ({ x: host.director.position.x, z: host.director.position.z, at: directorAt() }),
    state: () => s,
    gaps: () => gapReport(),
    fx: () => fx.stats(),
    perf: () => {
      const w = [...perf.win].sort((p, q) => p - q);
      return {
        frames: perf.frames,
        engineAvg: perf.frames ? +(perf.engine / perf.frames).toFixed(3) : 0,
        /** 引擎每推一分钟（一步 + 快照 + 事件流）多久：慢机器一帧推好几步，按帧算的 engineAvg 会偏大 */
        enginePerStep: perf.steps ? +(perf.engine / perf.steps).toFixed(3) : 0,
        split: perf.steps
          ? {
              step: +(perf.stepMs / perf.steps).toFixed(3),
              feed: +(perf.feedMs / perf.steps).toFixed(3),
              view: +(perf.viewMs / perf.steps).toFixed(3),
            }
          : null,
        actorsAvg: perf.frames ? +(perf.actors / perf.frames).toFixed(3) : 0,
        engineMax: +perf.engineMax.toFixed(2),
        actorsMax: +perf.actorsMax.toFixed(2),
        actorsP95: +(w[Math.floor(w.length * 0.95)] ?? 0).toFixed(2),
        frameMax: +perf.frameMax.toFixed(2),
        rollMs: +perf.rollMs.toFixed(2),
        jumpSliceMax: +perf.jumpSliceMax.toFixed(2),
        lastJumpMs: +jumpMs.toFixed(1),
        worst: perf.worst,
        slow: slow.slice(-20),
        seg: Object.fromEntries(
          Object.entries(seg).map(([k, v]) => [k, perf.frames ? +(v / perf.frames).toFixed(3) : 0]),
        ),
        steps: perf.steps,
        paths: { ...planner.stats, pending: planner.pending(), lastFails: planner.lastFails, recent: planner.recent },
        pool: { ...pool.stats, size: pool.all.length, used: pool.used() },
      };
    },
    resetPerf: () => {
      Object.assign(perf, {
        engine: 0,
        actors: 0,
        frames: 0,
        engineMax: 0,
        actorsMax: 0,
        steps: 0,
        win: [],
        frameMax: 0,
        rollMs: 0,
        jumpSliceMax: 0,
        worst: {},
        stepMs: 0,
        feedMs: 0,
        viewMs: 0,
      });
      Object.assign(planner.stats, { calls: 0, ms: 0, hits: 0, fails: 0, snapped: 0 });
      for (const k of Object.keys(seg)) seg[k as keyof typeof seg] = 0;
      slow.length = 0;
    },
    stats: () => {
      const byArea: Record<string, number> = {};
      let present = 0;
      for (const v of views) {
        if (v.where.kind === 'away') continue;
        present++;
        const w = v.where;
        const k = w.kind === 'travel' ? 'travel' : (placeBy.get(w.at)?.scene ?? '?');
        byArea[k] = (byArea[k] ?? 0) + 1;
      }
      let bodies = 0;
      /** 画面里正在走路（在路上、有身子）的人：截图核对"看得见人走" */
      const walkers: { id: AgentId; x: number; z: number }[] = [];
      for (const a of actors.values())
        if (a.body?.obj.visible) {
          bodies++;
          if (a.moving && a.leg) walkers.push({ id: a.id, x: +a.x.toFixed(1), z: +a.z.toFixed(1) });
        }
      return {
        minute: s?.minute ?? 0,
        clock: hhmm(s?.minute ?? 0),
        present,
        bodies,
        walkers,
        byArea,
        follow: followId,
        overview,
        /** 这一帧身子挨太近、互相推开了几对（separate） */
        separated: sepPushed,
      };
    },
    speeds: SPEEDS,
    /** 调试（watch.mjs 量重叠、站位）：画面里每具身子 —— 谁、在哪、朝哪、走着没有、一伙、地点、站位号、姿势 */
    bodies: () => {
      const out: {
        id: AgentId;
        x: number;
        z: number;
        yaw: number;
        moving: boolean;
        party: string | null;
        at: string | null;
        spot: number;
        doing: string;
        pose: string;
      }[] = [];
      for (const a of actors.values()) {
        if (!a.body?.obj.visible) continue;
        const v = viewBy.get(a.id);
        const w = v?.where;
        out.push({
          id: a.id,
          x: +a.body.obj.position.x.toFixed(2),
          z: +a.body.obj.position.z.toFixed(2),
          yaw: +a.body.obj.rotation.y.toFixed(2),
          moving: a.moving,
          party: s?.agents[a.id]?.party ?? null,
          at: w && (w.kind === 'at' || w.kind === 'queue') ? `${w.kind === 'queue' ? 'q:' : ''}${w.at}` : null,
          spot: v?.spot ?? -1,
          doing: v?.doing ?? '',
          pose: (a.body.obj.userData.poseName?.() as string | undefined) ?? '',
        });
      }
      return out;
    },
    /** 调试：哪具身子给了谁（一具身子只该有一个人） */
    owners: () => {
      const m: Record<string, string[]> = {};
      for (const a of actors.values())
        if (a.body) (m[a.body.obj.uuid] ??= []).push(`${a.id}|g${a.gait}|${a.moving ? 'm' : 's'}`);
      return m;
    },
  };

  // ?sim=1：开局就打开（从 ?simat= 的时刻开始，默认 6:30）；总监站到前台柜台后面（?simdesk=0 不挪）
  if (params.get('sim') === '1')
    api.enable(true, { at: num('simat', 6.5 * 60), speed: clock.speed, desk: params.get('simdesk') !== '0' });
  return api;
}

// 在干什么 → 摆什么姿势、手里拿什么、坐多高。
// 引擎只说 doing（打球、吃、干活……）和在哪个地点；这里按地点的种类、站位表里写的姿势、员工岗位的名字挑一个现成的姿势
// （clubsite/people 的 ALL_POSES）。没有合适姿势的活用最接近的代替，每一种代替都记进 gaps.ts（以后补画面）。
// 打网球、匹克球的节奏（同一块场上的人对着打、轮流击球）在 mount.ts 里按场地排，这里只给"是对打"。
import type { Doing, Place } from '../../clubsite/sim/types';
import type { Anchor } from './motion';

export type BodyKind = 'adult' | 'kid' | 'teen';

/** 姿势怎么动 */
export type Anim =
  | 'loop' // 按姿势自己的一遍秒数循环（呼吸、喝、拖、捞……）
  | 'rally' // 网球对打（mount.ts 按场地排谁击球）
  | 'pickle' // 匹克球对打（dink / dinkB）
  | 'feed' // 教练喂球
  | 'watch' // 坐着 / 站着看，隔一会儿鼓掌
  | 'pace'; // 边走边干（拖红土：沿站位朝向来回走）

export interface PoseSpec {
  pose: string;
  prop: string | null;
  /** 座面高（米）；null = 站着；不给 = 站着的姿势不管 */
  seat?: number | null;
  /** 脚踩的高度（裁判椅的平台） */
  foot?: number;
  anim: Anim;
  /** 下沉多少米（站在泳池水里：腰以下在水下） */
  sink?: number;
  /** 看向一起干事的人（聊天） */
  lookWith?: boolean;
  /** 画面缺口（gaps.ts 的 key）：这个活还没有像样的姿势，用的是代替 */
  gap?: string;
}

const SEATED_KINDS = new Set(['seat', 'table', 'stand', 'lounger']);
/** 坐的座面高：站位表的约定 = 站位的 y 已经是"座面 − 0.52"，所以一律 setSeat(0.52)（长椅的高度） */
const BENCH = 0.52;

/** 姿势要拿的道具（站位表写了姿势时用） */
const PROP_OF: Record<string, string | null> = {
  ready: 'racket',
  forehand: 'racket',
  backhand: 'racket',
  serve: 'racket',
  feed: 'racket',
  dink: 'paddle',
  dinkB: 'paddle',
  sip: 'cup',
  pour: 'cup',
  skim: 'skim',
  blow: 'blower',
  sweep: 'broom',
  push: 'picker',
  pickup: 'picker',
  water: 'hose',
  squeegee: 'squeegee',
  crank: 'crank',
};

/** 站位表写了姿势：按姿势配道具和座 */
function fromSpotPose(pose: string): PoseSpec {
  // 站位写了 y 的高座（裁判椅、救生椅、吧凳）：根节点在 y，座面 0.52（同长椅）
  const sit = pose === 'sit' || pose === 'sip' || pose === 'clap';
  if (pose === 'call') return { pose, prop: null, seat: BENCH, foot: 0.29, anim: 'loop' };
  if (pose === 'drag') return { pose, prop: null, anim: 'pace' };
  if (pose === 'forehand' || pose === 'backhand' || pose === 'serve' || pose === 'ready')
    return { pose: 'ready', prop: 'racket', anim: 'rally' };
  if (pose === 'dink' || pose === 'dinkB') return { pose: 'dink', prop: 'paddle', anim: 'pickle' };
  return { pose, prop: PROP_OF[pose] ?? null, seat: sit ? BENCH : undefined, anim: 'loop' };
}

/** 员工在岗位上：按地点（id、种类、场景）挑活 */
function workAt(place: Place | undefined): PoseSpec {
  const id = place?.id ?? '';
  const scene = place?.scene ?? '';
  const has = (...ks: string[]) => ks.some((k) => id.includes(k));
  if (has('umpire', 'chair')) return { pose: 'call', prop: null, seat: BENCH, foot: 0.29, anim: 'loop' };
  if (has('ballkid', 'ball-kid', 'bk')) return { pose: 'bkCrouch', prop: null, anim: 'loop' };
  // 场地维护的人不在岗位上，在场地、座位、桌子上干活（引擎：grounds staff work at courts / seats / tables）
  const k = place?.kind;
  if (k === 'court' || k === 'lesson') {
    if (scene === 'clubclay') return { pose: 'drag', prop: null, anim: 'pace' };
    return { pose: 'squeegee', prop: 'squeegee', anim: 'loop' };
  }
  if (k === 'pickle') return { pose: 'sweep', prop: 'broom', anim: 'loop' };
  if (k === 'table' || k === 'seat' || k === 'stand' || k === 'lounger')
    return { pose: 'sweep', prop: 'broom', anim: 'loop', gap: 'work.tidy' };
  if (has('guard', 'lifeguard')) return { pose: 'sit', prop: null, seat: BENCH, anim: 'watch', gap: 'work.lifeguard' };
  if (place && (place.kind === 'stall' || place.kind === 'cafe' || place.kind === 'bar'))
    return { pose: 'pour', prop: 'cup', anim: 'loop', gap: 'work.vendor' };
  if (scene === 'clubfood' || has('food', 'cafe', 'bar', 'kitchen', 'stall', 'cart', 'lemon'))
    return { pose: 'pour', prop: 'cup', anim: 'loop', gap: 'work.vendor' };
  if (scene === 'clubpool') return { pose: 'skim', prop: 'skim', anim: 'loop' };
  if (scene === 'clubclay') return { pose: 'drag', prop: null, anim: 'pace' };
  if (scene === 'clubcourts' || scene === 'clubstadium')
    return {
      pose: has('blow', 'leaf') ? 'blow' : 'sweep',
      prop: has('blow', 'leaf') ? 'blower' : 'broom',
      anim: 'loop',
    };
  if (scene === 'clubplaza') return { pose: 'sweep', prop: 'broom', anim: 'loop' };
  if (scene === 'clubgolf') return { pose: 'water', prop: 'hose', anim: 'loop', gap: 'work.golf' };
  // 前台、代客泊车、大门、会所里：站着（前台的人对着柜台）
  return {
    pose: 'idle',
    prop: null,
    seat: null,
    anim: 'loop',
    gap: has('desk', 'valet', 'gate') ? undefined : 'work.idle',
  };
}

/**
 * doing + 地点 + 站位 → 姿势。spot.pose（站位表写的）优先于按 doing 推的默认（客人坐的长椅、看台写 sit 之类）；
 * 打球、喂球、干活这些"活"本身的节奏仍由 doing 决定。
 */
export function poseSpec(doing: Doing, place: Place | undefined, spot: Anchor | undefined, body: BodyKind): PoseSpec {
  const kind = place?.kind;
  const seated = !!kind && SEATED_KINDS.has(kind);
  switch (doing) {
    case 'tennis':
      return { pose: 'ready', prop: 'racket', anim: 'rally' };
    case 'pickle':
      return { pose: 'dink', prop: 'paddle', anim: 'pickle' };
    case 'lesson':
      return { pose: 'ready', prop: 'racket', anim: 'rally' };
    case 'coach':
      return { pose: 'feed', prop: 'racket', anim: 'feed' };
    case 'warmup':
      return { pose: 'ready', prop: 'racket', anim: 'loop', gap: 'warmup' };
    case 'golf':
      return { pose: 'idle', prop: null, seat: null, anim: 'loop', gap: 'golf' };
    case 'work':
      return spot?.pose ? fromSpotPose(spot.pose) : workAt(place);
    case 'break':
      return { pose: 'sip', prop: 'cup', seat: BENCH, anim: 'loop' };
    case 'eat':
      return { pose: 'sip', prop: 'cup', seat: BENCH, anim: 'loop', gap: 'eat' };
    case 'drink':
      return seated || kind === 'cafe'
        ? { pose: 'sip', prop: 'cup', seat: BENCH, anim: 'loop' }
        : { pose: 'idle', prop: 'cup', seat: null, anim: 'loop' };
    case 'watch':
      return seated || spot?.pose === 'sit'
        ? { pose: 'sit', prop: null, seat: BENCH, anim: 'watch' }
        : { pose: 'idle', prop: null, seat: null, anim: 'watch' };
    case 'rest':
      return seated || spot?.pose === 'sit' || kind === 'pool' || kind === 'lounger'
        ? { pose: 'sit', prop: null, seat: kind === 'lounger' ? 0.4 : BENCH, anim: 'loop' }
        : { pose: 'idle', prop: null, seat: null, anim: 'loop' };
    case 'sunbathe':
      return { pose: 'sit', prop: null, seat: 0.4, anim: 'loop', gap: 'sunbathe' };
    case 'swim':
      // 泳池水里的站位已经在水面下 1.1 米（孩子 0.75），姿势 idle；站位没给高度时自己往下沉
      return {
        pose: 'idle',
        prop: null,
        seat: null,
        anim: 'loop',
        sink: spot?.y === undefined ? (body === 'kid' ? 0.75 : 1.1) : 0,
        gap: 'swim',
      };
    case 'gym':
      return { pose: 'push', prop: null, seat: null, anim: 'loop', gap: 'gym' };
    case 'kidplay':
      return { pose: 'pickup', prop: null, seat: null, anim: 'loop', gap: 'kidplay' };
    case 'chat':
      return seated
        ? { pose: 'sit', prop: null, seat: BENCH, anim: 'loop', lookWith: true }
        : { pose: 'idle', prop: null, seat: null, anim: 'loop', lookWith: true };
    case 'shop':
      return { pose: 'idle', prop: null, seat: null, anim: 'loop', gap: 'shop' };
    case 'change':
      return { pose: 'idle', prop: null, seat: null, anim: 'loop', gap: 'change' };
    default:
      // arrive / leave / travel / queue / checkin / order：站着（朝站位 / 队头）
      if (spot?.pose) return fromSpotPose(spot.pose);
      return { pose: 'idle', prop: null, seat: null, anim: 'loop' };
  }
}

/** 一遍几秒（rig + poses.ts 的表；mount 推 phase 用） */
export const PERIOD: Record<string, number> = {
  idle: 3,
  walk: 0.9,
  ready: 1.2,
  forehand: 1.1,
  backhand: 1.1,
  serve: 1.6,
  sweep: 1.3,
  feed: 1.6,
  blow: 2.4,
  push: 0.9,
  pickup: 0.5,
  dump: 1.6,
  sit: 3.2,
  clap: 0.5,
  sip: 4,
  drag: 1.1,
  water: 2.4,
  crank: 0.6,
  skim: 1.2,
  dink: 0.6,
  dinkB: 0.6,
  pour: 1.2,
  call: 2.5,
  squeegee: 1.6,
  bkCrouch: 2.4,
  bkStand: 3.2,
  bkRoll: 1.2,
  bkUmbrella: 3.2,
};

/** 中文：在干什么（面板、名字小牌） */
export const DOING_NAME: Record<Doing, string> = {
  arrive: '刚到',
  leave: '回家',
  travel: '在路上',
  queue: '排队',
  checkin: '签到',
  tennis: '打网球',
  pickle: '打匹克球',
  lesson: '上课',
  coach: '教课',
  warmup: '热身',
  watch: '看球',
  rest: '歇着',
  chat: '聊天',
  order: '点单',
  eat: '吃饭',
  drink: '喝东西',
  shop: '逛店',
  gym: '健身',
  change: '更衣',
  swim: '游泳',
  sunbathe: '晒太阳',
  golf: '打高尔夫',
  kidplay: '玩水',
  work: '上班',
  break: '歇班',
};

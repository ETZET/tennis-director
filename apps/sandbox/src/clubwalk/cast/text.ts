// 名册和人物卡片的界面文字（集中在这里，以后搬进 i18n 键值表；sandbox 的 demo 先写死中文）。
import type { Activity, Role, TieKind } from '../../clubsite/cast/types';

export const TXT = {
  rosterBtn: '名册',
  rosterTitle: '会员名册',
  close: '关闭',
  nextDay: '下一天',
  nextDayToast: (day: number) => `第 ${day} 天 · 早上 8 点`,
  newDayToast: (day: number) => `第 ${day} 天开门了`,
  money: (n: number) => `$${n}`,
  search: '搜名字、身份、哪儿人…',
  tabs: {
    all: '全部',
    member: '会员',
    staff: '员工',
    kid: '孩子',
    today: '今天在场',
    guest: '见过的客人',
  },
  count: (n: number, met: number) => `${n} 人 · 说过话的 ${met}`,
  empty: '没有对得上的人',
  notToday: '今天不在',
  here: '在场',
  talkTo: (name: string) => `和 ${name} 说话`,
  age: (n: number) => `${n} 岁`,
  since: (y: number) => `${y} 年入会`,
  unmet: '还没说过话',
  unmetHint: '走过去聊几句，就知道是什么样的人了。',
  unknown: '？',
  sec: {
    now: '现在',
    favor: '好感',
    mood: '心情',
    attrs: '属性',
    traits: '性子',
    likes: '喜欢',
    dislikes: '讨厌',
    bio: '故事',
    quirk: '小习惯',
    ties: '牵连',
    week: '什么时候来',
    memory: '最近',
  },
  ntrp: 'NTRP',
  nowAt: (scene: string, what: string) => `在${scene} · ${what}`,
  notHereToday: '今天不在俱乐部',
  offScreen: (scenes: string) => `今天在${scenes}`,
  thinking: '在想：',
  everyday: '每天都在',
  daily: '每天',
  noMemory: '还没有什么事',
  memDay: (d: number) => `第 ${d} 天`,
  walkOver: '走过去',
  walkOverCost: '当面才能做',
  cantReach: '走不过去',
  absent: '今天不在俱乐部',
  findAt: (scene: string) => `今天在${scene}`,
  favorDelta: (d: number) => `${d >= 0 ? '+' : ''}${d.toFixed(1)} ♥`,
  prev: '上一个',
  next: '下一个',
} as const;

export const WEEKDAY = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

export const ACTIVITY_NAME: Record<Activity, string> = {
  play: '打球',
  watch: '看球',
  rest: '歇着',
  eat: '吃东西',
  walk: '走路',
  work: '干活',
  gym: '健身',
  swim: '泡在水里',
  wait: '等着',
  idle: '站着',
};

export const ROLE_NAME: Record<Role, string> = {
  member: '会员',
  guest: '客人',
  kid: '孩子',
  parent: '家长',
  coach: '教练',
  staff: '员工',
  vendor: '摊主',
  pro: '职业球员',
};

export const TIE_NAME: Record<TieKind, string> = {
  family: '家人',
  partner: '搭档',
  friend: '朋友',
  mentor: '师徒',
  rival: '较劲',
  crush: '好感',
  colleague: '同事',
  history: '旧事',
};

/** 0..6 的星期 → "周二、周四" */
export const daysText = (days: readonly number[]) => days.map((d) => WEEKDAY[d] ?? '').join('、');
export const hoursText = (h: readonly [number, number]) => `${fmtHour(h[0])}–${fmtHour(h[1])}`;
const fmtHour = (h: number) => `${Math.floor(h)}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;

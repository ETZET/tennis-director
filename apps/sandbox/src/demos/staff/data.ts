import type { PersonOptions } from '@td/iso';

/**
 * 08 拖人 2.0 的数据：五个真员工（长相照 apps/game/src/scene.ts 的 LOOKS 抄过来）、
 * Palm Oasis 上的六个岗位和休息区（坐标落在真实步道上，路网照 site/indian-wells/layout.ts 的节点和边，再加几条支路）。
 */

export type Skill = 'svc' | 'teach' | 'maint' | 'craft';
export const SKILL_NAME: Record<Skill, string> = { svc: '服务', teach: '教学', maint: '维护', craft: '手艺' };

export type PostId = 'desk' | 'court' | 'string' | 'junior' | 'clay' | 'pool' | 'guide';
export type WorkKind = 'desk' | 'rake' | 'string' | 'feed' | 'brush' | 'guard' | 'guide';

export interface PostDef {
  id: PostId;
  name: string;
  /** 场景里的英文小标（Silkscreen） */
  tag: string;
  skill: Skill;
  /** 每圈（60 游戏分钟）基础收入，乘需求档 */
  base: number;
  /** 每圈 +声望 */
  rep?: number;
  /** [开始小时, 结束小时, 需求档 0–3] */
  sched: [number, number, number][];
  /** 人站在哪（世界坐标，米） */
  spot: { x: number; z: number };
  /** 路网上的节点名 */
  node: string;
  work: WorkKind;
  /** 临时岗位（大巴导游）：平时不显示 */
  temp?: boolean;
}

export const POSTS: PostDef[] = [
  {
    id: 'desk',
    name: '前台接待',
    tag: '前台',
    skill: 'svc',
    base: 5,
    sched: [
      [6, 9, 3],
      [9, 12, 2],
      [12, 16, 1],
      [16, 20, 3],
      [20, 22, 1],
    ],
    spot: { x: -50, z: -8.2 },
    node: 'desk',
    work: 'desk',
  },
  {
    id: 'court',
    name: '会员场看场',
    tag: '会员场',
    skill: 'maint',
    base: 6,
    sched: [
      [6, 10, 3],
      [10, 17, 1],
      [17, 21, 3],
      [21, 22, 1],
    ],
    spot: { x: -24, z: 18.2 },
    node: 'court',
    work: 'rake',
  },
  {
    id: 'string',
    name: '穿线台',
    tag: '穿线',
    skill: 'craft',
    base: 7,
    sched: [
      [6, 12, 1],
      [12, 17, 1],
      [17, 21, 2],
      [21, 22, 0],
    ],
    spot: { x: -38.4, z: -13 },
    node: 'string',
    work: 'string',
  },
  {
    id: 'junior',
    name: '青训课',
    tag: '青训',
    skill: 'teach',
    base: 8,
    sched: [
      [6, 14, 0],
      [14, 15, 1],
      [15, 18, 3],
      [18, 20, 1],
      [20, 22, 0],
    ],
    spot: { x: -17, z: -2.8 },
    node: 'junior',
    work: 'feed',
  },
  {
    id: 'clay',
    name: '红土养护',
    tag: '红土',
    skill: 'maint',
    base: 3,
    rep: 1,
    sched: [[6, 22, 1]],
    spot: { x: 3.5, z: 19 },
    node: 'clay',
    work: 'brush',
  },
  {
    id: 'pool',
    name: '泳池救生',
    tag: '泳池',
    skill: 'svc',
    base: 5,
    sched: [
      [6, 10, 0],
      [10, 12, 2],
      [12, 17, 3],
      [17, 19, 1],
      [19, 22, 0],
    ],
    spot: { x: -41, z: 7 },
    node: 'pool',
    work: 'guard',
  },
  {
    id: 'guide',
    name: '大巴导游',
    tag: '导游',
    skill: 'svc',
    base: 6,
    sched: [[6, 22, 0]],
    spot: { x: -36.5, z: 0.5 },
    node: 'guide',
    work: 'guide',
    temp: true,
  },
];
export const PID = Object.fromEntries(POSTS.map((p) => [p.id, p])) as Record<PostId, PostDef>;

/** 休息区：中心球场西头、会所露台外的阴凉 */
export const LOUNGE = { x: -24, z: -11, node: 'lounge' };
/** 休息区里每个人的位置（看台脚下散开） */
export const LOUNGE_SLOTS = [
  { x: -27.5, z: -11.2 },
  { x: -25.2, z: -10.4 },
  { x: -22.8, z: -11.4 },
  { x: -20.6, z: -10.5 },
  { x: -18.4, z: -11.3 },
];

/** 搭档 / 冤家只算相邻的岗位（真实地图上离得近的） */
export const ADJ: [PostId, PostId][] = [
  ['pool', 'string'],
  ['pool', 'court'],
  ['desk', 'string'],
  ['junior', 'clay'],
  ['court', 'junior'],
  ['desk', 'guide'],
  ['pool', 'guide'],
];
export const nbrs = (id: PostId): PostId[] => ADJ.filter((a) => a.includes(id)).map((a) => (a[0] === id ? a[1] : a[0]));

/* ---------------- 路网：照 layout.ts 的步道节点，加上到每个岗位的支路 ---------------- */
export const NODES: Record<string, { x: number; z: number }> = {
  p_w: { x: -36.5, z: -6.5 },
  p_lo: { x: -24, z: -6.5 },
  p_p1: { x: -17, z: -6.5 },
  p_mid: { x: 0, z: -6.5 },
  p_e: { x: 35.5, z: -6.5 },
  e_q: { x: 35.5, z: 15.5 },
  q_o2: { x: 3.5, z: 15.5 },
  q_w: { x: -36.5, z: 15.5 },
  q_o1: { x: -24, z: 15.5 },
  q_mid: { x: 0, z: 15.5 },
  w_pool: { x: -36.5, z: 7 },
  desk: PID.desk.spot,
  court: PID.court.spot,
  string: PID.string.spot,
  junior: PID.junior.spot,
  clay: PID.clay.spot,
  pool: PID.pool.spot,
  guide: PID.guide.spot,
  lounge: { x: LOUNGE.x, z: LOUNGE.z },
};
const EDGES: [string, string][] = [
  ['p_w', 'p_lo'],
  ['p_lo', 'p_p1'],
  ['p_p1', 'p_mid'],
  ['p_mid', 'p_e'],
  ['p_w', 'desk'],
  ['p_w', 'guide'],
  ['guide', 'w_pool'],
  ['p_e', 'e_q'],
  ['e_q', 'q_o2'],
  ['q_o2', 'q_mid'],
  ['q_o2', 'clay'],
  ['q_mid', 'q_o1'],
  ['q_o1', 'q_w'],
  ['q_o1', 'court'],
  ['q_w', 'w_pool'],
  ['w_pool', 'p_w'],
  ['w_pool', 'pool'],
  ['p_w', 'string'],
  ['p_lo', 'lounge'],
  ['p_p1', 'junior'],
  ['p_mid', 'q_mid'],
];
const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
const GRAPH = new Map<string, [string, number][]>();
for (const [a, b] of EDGES) {
  const d = dist(NODES[a] as { x: number; z: number }, NODES[b] as { x: number; z: number });
  GRAPH.set(a, [...(GRAPH.get(a) ?? []), [b, d]]);
  GRAPH.set(b, [...(GRAPH.get(b) ?? []), [a, d]]);
}
const SPURS = new Set([...POSTS.map((p) => p.node), 'lounge']);
/** 两个节点之间沿步道的最短折线（世界坐标）；岗位节点不当路口穿过去 */
export function route(from: string, to: string): { x: number; z: number }[] {
  const d = new Map<string, number>([[from, 0]]);
  const prev = new Map<string, string>();
  const todo = new Set([from]);
  while (todo.size) {
    let cur = '';
    let best = Number.POSITIVE_INFINITY;
    for (const n of todo) {
      const v = d.get(n) ?? Number.POSITIVE_INFINITY;
      if (v < best) {
        best = v;
        cur = n;
      }
    }
    todo.delete(cur);
    if (cur === to) break;
    for (const [nb, m] of GRAPH.get(cur) ?? []) {
      if (SPURS.has(nb) && nb !== to) continue;
      const nd = best + m;
      if (nd < (d.get(nb) ?? Number.POSITIVE_INFINITY)) {
        d.set(nb, nd);
        prev.set(nb, cur);
        todo.add(nb);
      }
    }
  }
  const out: { x: number; z: number }[] = [];
  for (let n: string | undefined = to; n; n = prev.get(n)) out.unshift({ ...(NODES[n] as { x: number; z: number }) });
  return out;
}
export const lineLength = (pts: readonly { x: number; z: number }[]): number =>
  pts.reduce((s, p, i) => (i ? s + dist(p, pts[i - 1] as { x: number; z: number }) : 0), 0);
/** 步行速度：米 / 游戏分钟（和游戏的 WALK_METERS_PER_MINUTE 同一个量级） */
export const M_PER_MIN = 1.5;

/* ---------------- 员工 ---------------- */
const SK = ['#f1c7a1', '#e8b896', '#d9a47c', '#c48a62', '#a86f4c', '#7a4a32', '#5f3a28', '#f1d0ae'] as const;
export type Look = Omit<PersonOptions, 'name' | 'x' | 'z'>;

export interface StaffDef {
  id: string;
  name: string;
  role: string;
  /** 员工条头像底色 */
  color: string;
  look: Look;
  st: Record<Skill, number>;
  like: PostId[];
  hate: PostId[];
  friend: string[];
  foe: string[];
  /** 一行特点（≤ 14 字） */
  trait: string;
  say: { like: string[]; hate: string[]; storm: string; back: string };
}

export const STAFF: StaffDef[] = [
  {
    id: 'dale',
    name: 'Dale',
    role: '老教练',
    color: '#d8c08a',
    look: {
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
    st: { svc: 55, teach: 85, maint: 35, craft: 60 },
    like: ['junior'],
    hate: ['pool'],
    friend: ['jess'],
    foe: [],
    trait: '爱带孩子 · 怕晒',
    say: {
      like: ['孩子们排好队！', '这才是我的场子'],
      hate: ['我不会游泳啊…', '太晒了，老腰…'],
      storm: '老头子不干了！',
      back: '好多了，派我吧',
    },
  },
  {
    id: 'rosa',
    name: 'Rosa',
    role: '维护工',
    color: '#9be07f',
    look: {
      shirt: '#3d6b3a',
      shorts: '#4f5560',
      pants: true,
      skin: SK[4],
      hair: '#2a1d16',
      hairStyle: 'pony',
      cap: '#3d6b3a',
      shoes: '#5a4a3a',
    },
    st: { svc: 35, teach: 25, maint: 85, craft: 45 },
    like: ['court', 'clay'],
    hate: ['desk'],
    friend: ['ben'],
    foe: [],
    trait: '扫沙 ×1.6 · 怕生人',
    say: {
      like: ['沙子？小意思', '交给我'],
      hate: ['…欢、欢迎光临', '我不会说话啊'],
      storm: '我出去透口气！',
      back: '行，接着干',
    },
  },
  {
    id: 'ben',
    name: 'Ben',
    role: '前台',
    color: '#c9e8ff',
    look: {
      shirt: '#e6b03c',
      shorts: '#26262b',
      skin: SK[1],
      hair: '#2a1d16',
      hairStyle: 'short',
      shoes: '#f1ece0',
      racket: '#3a8fd9',
    },
    st: { svc: 85, teach: 30, maint: 30, craft: 25 },
    like: ['desk'],
    hate: ['junior'],
    friend: ['rosa'],
    foe: [],
    trait: '早起 ×1.2 · 怕小孩',
    say: {
      like: ['早上好！这边请', '欢迎来 Palm Oasis'],
      hate: ['别拽我衣服…', '小孩好可怕'],
      storm: '我需要静一静！',
      back: '我回来了',
    },
  },
  {
    id: 'jess',
    name: 'Jess',
    role: '教练',
    color: '#ffb35c',
    look: {
      shirt: '#2a8a86',
      shorts: '#f1ece0',
      skin: SK[2],
      hair: '#2a1d16',
      hairStyle: 'pony',
      shoes: '#f1ece0',
      racket: '#e8582c',
    },
    st: { svc: 60, teach: 75, maint: 25, craft: 30 },
    like: ['junior', 'pool'],
    hate: ['string'],
    friend: ['dale'],
    foe: [],
    trait: '心情掉得慢 · 坐不住',
    say: {
      like: ['冲冲冲！', '来比谁游得快'],
      hate: ['坐着好难受…', '线又缠住了！'],
      storm: '我去跑两圈！',
      back: '满血复活！',
    },
  },
  {
    id: 'gus',
    name: 'Gus',
    role: '维护工',
    color: '#c9a0e8',
    look: {
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
    st: { svc: 30, teach: 35, maint: 80, craft: 85 },
    like: ['string'],
    hate: ['pool'],
    friend: [],
    foe: ['jess'],
    trait: '完美主义 · 嫌 Jess 吵',
    say: {
      like: ['张力 52 磅，刚好', '安静，真好'],
      hate: ['吵死了…', '这水太浑了'],
      storm: '受够了，别找我！',
      back: '…行吧',
    },
  },
];
export const SID = Object.fromEntries(STAFF.map((s) => [s.id, s])) as Record<string, StaffDef>;

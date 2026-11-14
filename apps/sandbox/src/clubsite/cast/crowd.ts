// 按种子生成人（regular 熟面孔、crowd 当天的客人）：同样的种子 + 键 + 位置，永远是同一个人。
// 名字、年纪、哪儿人、做什么、会籍、属性、特质、喜好、故事、台词、样子都在这里拼（池子在 names.ts、pools.ts、bios.ts）。
// 族裔只影响名字和样子的分布；职业单独挑，和族裔无关（2.5D 评审时的教训）。
import { BIO, type BioCtx, type BioT } from './bios';
import { type FirstName, type Gender, type GroupId, NAME_GROUPS, parseFirst, parseLast } from './names';
import {
  CANADA,
  COACH_PAST,
  DISLIKES,
  DOGS,
  EUROPE,
  JOBS,
  KID_DISLIKES,
  KID_LIKES,
  LIKES,
  type LineKey,
  PRO_PAST,
  QUIRKS,
  ROLE_LINES,
  SOCAL,
  STAFF_PAST,
  STAYS,
  US_ELSE,
  VALLEY,
  VENDOR_PAST,
} from './pools';
import { chance, clamp, int, normal, pick, type Rng, range, rngOf, sample, weighted } from './rng';
import { TRAITS } from './traits';
import type {
  Attrs,
  Body,
  CastLook,
  CastPerson,
  Cloth,
  HairColor,
  HairStyle,
  Hat,
  Membership,
  Role,
  SkinTone,
  SlotInfo,
  Tier,
  TraitId,
} from './types';

export interface MakeOpts {
  /** 每周来的日子（0 = 周一）：故事里写"周二、周四来"（regular 由选角先定好） */
  days?: number[];
}

export const WEEKDAY_NAME = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
export const daysText = (days: readonly number[]) => days.map((d) => WEEKDAY_NAME[d]).join('、');

const CN = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];
/** 美国的年级（6 岁一年级）："小学三年级""七年级（初中）" */
export function gradeText(age: number): string {
  const g = clamp(age - 5, 1, 12);
  if (g <= 5) return `小学${CN[g]}年级`;
  if (g <= 8) return `${CN[g]}年级（初中）`;
  return `${CN[g]}年级（高中）`;
}

// ── 名字 ──────────────────────────────────────────────────────────────────────────

interface Fam {
  f: FirstName[];
  m: FirstName[];
  last: string[];
  from: string[];
}
const FAMS: Record<GroupId, Fam[]> = Object.fromEntries(
  (Object.keys(NAME_GROUPS) as GroupId[]).map((g) => [
    g,
    NAME_GROUPS[g].families.map((fam) => ({
      f: parseFirst(fam.f),
      m: parseFirst(fam.m),
      last: parseLast(fam.last),
      from: fam.from ? parseLast(fam.from) : [],
    })),
  ]),
) as Record<GroupId, Fam[]>;

function firstFor(r: Rng, fam: Fam, g: Gender, age: number): FirstName {
  const all = g === 'f' ? fam.f : fam.m;
  const ok = all.filter((n) => (n.era === 'old' ? age >= 45 : n.era === 'young' ? age < 40 : true));
  return pick(r, ok.length ? ok : all);
}

/** 族裔的权重（候鸟两组只给 55 岁以上的会员和客人） */
function groupWeights(snowbirdOk: boolean): [GroupId, number][] {
  const w: [GroupId, number][] = [
    ['anglo', 28],
    ['latino', 26],
    ['asian', 16],
    ['black', 13],
    ['mideast', 9],
  ];
  if (snowbirdOk) w.push(['euro', 10], ['canada', 14]);
  return w;
}

const SKIN_BY: Record<GroupId, [SkinTone, number][]> = {
  anglo: [
    ['pale', 40],
    ['light', 55],
    ['tan', 5],
  ],
  latino: [
    ['light', 20],
    ['tan', 40],
    ['olive', 30],
    ['brown', 10],
  ],
  asian: [
    ['light', 45],
    ['tan', 30],
    ['olive', 20],
    ['brown', 5],
  ],
  black: [
    ['tan', 10],
    ['brown', 50],
    ['deep', 40],
  ],
  mideast: [
    ['light', 25],
    ['olive', 45],
    ['tan', 30],
  ],
  euro: [
    ['pale', 55],
    ['light', 45],
  ],
  canada: [
    ['pale', 40],
    ['light', 45],
    ['tan', 10],
    ['brown', 5],
  ],
};
const SKIN_SOUTH_ASIAN: [SkinTone, number][] = [
  ['tan', 30],
  ['olive', 40],
  ['brown', 30],
];
const HAIR_BY: Record<GroupId, [HairColor, number][]> = {
  anglo: [
    ['brown', 30],
    ['darkBrown', 20],
    ['blonde', 25],
    ['auburn', 10],
    ['red', 5],
    ['black', 10],
  ],
  latino: [
    ['black', 50],
    ['darkBrown', 40],
    ['brown', 10],
  ],
  asian: [
    ['black', 85],
    ['darkBrown', 15],
  ],
  black: [
    ['black', 90],
    ['darkBrown', 10],
  ],
  mideast: [
    ['black', 60],
    ['darkBrown', 35],
    ['brown', 5],
  ],
  euro: [
    ['blonde', 35],
    ['brown', 35],
    ['darkBrown', 15],
    ['auburn', 8],
    ['red', 7],
  ],
  canada: [
    ['brown', 35],
    ['blonde', 25],
    ['darkBrown', 20],
    ['red', 10],
    ['black', 10],
  ],
};

// ── 年纪 ──────────────────────────────────────────────────────────────────────────

function ageFor(r: Rng, info: SlotInfo, body: Body): number {
  if (body === 'kid') return int(r, 6, 12);
  if (body === 'teen') return int(r, 13, 17);
  const t = info.title;
  switch (info.role) {
    case 'member':
      return weighted(r, [
        [int(r, 23, 39), 20],
        [int(r, 40, 59), 35],
        [int(r, 60, 86), 45],
      ]);
    case 'guest':
      return weighted(r, [
        [int(r, 18, 34), 30],
        [int(r, 35, 59), 40],
        [int(r, 60, 82), 30],
      ]);
    case 'parent':
      return int(r, 29, 49);
    case 'coach':
      return int(r, 24, 58);
    case 'pro':
      return int(r, 19, 33);
    case 'vendor':
      return int(r, 21, 66);
    default:
      if (t.includes('救生员')) return int(r, 17, 24);
      if (t.includes('泊车') || t.includes('门童')) return int(r, 19, 38);
      if (t.includes('裁判')) return int(r, 34, 70);
      return weighted(r, [
        [int(r, 18, 30), 35],
        [int(r, 31, 50), 40],
        [int(r, 51, 68), 25],
      ]);
  }
}

// ── 特质 ──────────────────────────────────────────────────────────────────────────

type W = [TraitId, number][];
const ROLE_TRAITS: Record<Role, W> = {
  member: [
    ['chatty', 8],
    ['shy', 4],
    ['focused', 6],
    ['competitive', 9],
    ['generous', 6],
    ['frugal', 4],
    ['oldguard', 7],
    ['gossip', 6],
    ['grumpy', 4],
    ['cheerful', 7],
    ['impatient', 5],
    ['earlybird', 7],
    ['nightowl', 4],
    ['perfectionist', 3],
    ['mentor', 4],
    ['sporty', 7],
    ['foodie', 5],
    ['local', 8],
    ['vip', 4],
    ['oldinjury', 5],
  ],
  guest: [
    ['curious', 14],
    ['cheerful', 8],
    ['foodie', 9],
    ['chatty', 6],
    ['shy', 5],
    ['impatient', 6],
    ['vip', 4],
    ['generous', 4],
    ['frugal', 4],
    ['sporty', 4],
    ['local', 4],
    ['grumpy', 3],
    ['gossip', 2],
    ['competitive', 3],
  ],
  kid: [
    ['kidplayful', 6],
    ['competitive', 8],
    ['shy', 8],
    ['sporty', 8],
    ['focused', 5],
    ['cheerful', 6],
    ['curious', 6],
    ['chatty', 4],
    ['impatient', 3],
  ],
  parent: [
    ['chatty', 7],
    ['impatient', 7],
    ['gossip', 7],
    ['generous', 5],
    ['frugal', 5],
    ['cheerful', 6],
    ['tired', 5],
    ['foodie', 4],
    ['competitive', 4],
    ['local', 6],
    ['shy', 3],
    ['sporty', 3],
  ],
  staff: [
    ['hardworking', 14],
    ['focused', 8],
    ['tired', 6],
    ['cheerful', 8],
    ['perfectionist', 6],
    ['shy', 5],
    ['chatty', 5],
    ['local', 8],
    ['earlybird', 5],
    ['nightowl', 3],
    ['grumpy', 3],
    ['gossip', 4],
    ['impatient', 2],
  ],
  vendor: [
    ['hardworking', 10],
    ['cheerful', 9],
    ['chatty', 8],
    ['foodie', 6],
    ['local', 8],
    ['generous', 5],
    ['tired', 4],
    ['perfectionist', 5],
    ['gossip', 5],
    ['grumpy', 3],
    ['earlybird', 5],
  ],
  coach: [
    ['mentor', 14],
    ['competitive', 8],
    ['focused', 8],
    ['sporty', 8],
    ['chatty', 4],
    ['perfectionist', 6],
    ['cheerful', 5],
    ['oldinjury', 3],
    ['impatient', 3],
  ],
  pro: [
    ['star', 10],
    ['competitive', 12],
    ['focused', 10],
    ['sporty', 6],
    ['shy', 3],
    ['cheerful', 3],
    ['vip', 4],
    ['impatient', 3],
  ],
};
/** 不能同时有的特质 */
const CLASH: [TraitId, TraitId][] = [
  ['chatty', 'shy'],
  ['earlybird', 'nightowl'],
  ['cheerful', 'grumpy'],
  ['generous', 'frugal'],
  ['cheerful', 'tired'],
  ['vip', 'frugal'],
  ['hardworking', 'tired'],
  ['sporty', 'oldinjury'],
];
const clashes = (a: TraitId, b: TraitId) =>
  a === b || CLASH.some(([x, y]) => (x === a && y === b) || (x === b && y === a));

interface Who {
  role: Role;
  body: Body;
  age: number;
  group: GroupId;
  local: boolean;
}

function traitsFor(r: Rng, w: Who): TraitId[] {
  const out: TraitId[] = [];
  const snow = w.group === 'euro' || w.group === 'canada';
  if (snow) out.push('snowbird');
  if (w.body === 'kid' && chance(r, 0.7)) out.push('kidplayful');
  const pool = ROLE_TRAITS[w.role].filter(([id]) => {
    if (id === 'kidplayful') return w.body === 'kid';
    if (id === 'local') return w.local;
    if (id === 'oldguard') return w.age >= 50;
    if (id === 'oldinjury') return w.age >= 40;
    if (id === 'vip' || id === 'generous') return w.body === 'adult';
    return TRAITS[id] !== undefined;
  });
  const n = chance(r, 0.55) ? 2 : 1;
  for (let tries = 0; out.length < n && tries < 12; tries++) {
    const t = weighted(r, pool);
    if (!out.some((o) => clashes(o, t))) out.push(t);
  }
  return out;
}

// ── 属性 ──────────────────────────────────────────────────────────────────────────

const half = (x: number) => Math.round(x * 2) / 2;

function ntrpFor(r: Rng, info: SlotInfo, body: Body, age: number, snow: boolean): number {
  const t = info.title;
  let x: number;
  if (body === 'kid') x = clamp(1 + (age - 6) * 0.25 + normal(r, 0, 0.3), 1, 3);
  else if (body === 'teen') x = clamp(normal(r, 3 + (age - 13) * 0.15, 0.4), 2, 4.5);
  else
    switch (info.role) {
      case 'member':
        x = clamp(normal(r, 3.6, 0.55) - (age >= 75 ? 0.4 : 0) - (snow ? 0.2 : 0), 2.5, 5);
        break;
      case 'guest':
        x = clamp(normal(r, 2.6, 0.6), 1, 4);
        break;
      case 'parent':
        x = clamp(normal(r, 2.8, 0.6), 1, 4);
        break;
      case 'coach':
        x = clamp(normal(r, 5, 0.3), 4.5, 5.5);
        break;
      case 'pro':
        x = clamp(normal(r, 6.4, 0.3), 6, 7);
        break;
      case 'vendor':
        x = chance(r, 0.65) ? 1 : clamp(normal(r, 2.8, 0.5), 2, 3.5);
        break;
      default:
        if (t.includes('裁判')) x = clamp(normal(r, 3.5, 0.3), 3, 4);
        else x = chance(r, 0.45) ? 1 : clamp(normal(r, 2.8, 0.6), 1.5, 4);
    }
  return half(x);
}

const BASE_SPEND: Record<Role, number> = {
  member: 60,
  guest: 50,
  kid: 20,
  parent: 55,
  staff: 30,
  vendor: 35,
  coach: 45,
  pro: 70,
};
const BASE_LOYAL: Record<Membership['kind'], number> = {
  founder: 82,
  annual: 62,
  monthly: 45,
  family: 60,
  junior: 55,
  day: 25,
  none: 58,
};

function attrsFor(
  r: Rng,
  info: SlotInfo,
  body: Body,
  age: number,
  snow: boolean,
  mem: Membership,
  traits: TraitId[],
): Attrs {
  const has = (t: TraitId) => traits.includes(t);
  let fitness =
    body === 'adult' ? normal(r, 86 - Math.max(0, age - 25) * 0.7, 9) : normal(r, 72 + (body === 'teen' ? 8 : 0), 10);
  if (info.role === 'pro') fitness = range(r, 90, 99);
  if (info.role === 'coach') fitness += 8;
  let social = normal(r, 50, 17);
  let patience = normal(r, body === 'kid' ? 35 : 55, 15);
  let spend = normal(r, BASE_SPEND[info.role], 14);
  let loyalty = normal(r, BASE_LOYAL[mem.kind], 10);
  if (has('chatty')) social += 25;
  if (has('shy')) social -= 25;
  if (has('gossip')) social += 12;
  if (has('impatient')) patience -= 25;
  if (has('grumpy')) patience -= 10;
  if (has('mentor')) patience += 15;
  if (has('generous') || has('vip')) spend += 20;
  if (has('frugal')) spend -= 20;
  if (has('sporty') || has('competitive')) fitness += 10;
  if (has('oldinjury')) fitness -= 15;
  if (has('local') || has('oldguard')) loyalty += 15;
  if (has('tired')) loyalty -= 12;
  if (has('hardworking')) loyalty += 8;
  if (snow) spend += 8;
  const c = (x: number) => Math.round(clamp(x, 0, 100));
  return {
    ntrp: ntrpFor(r, info, body, age, snow),
    fitness: c(fitness),
    social: c(social),
    patience: c(patience),
    spend: c(spend),
    loyalty: c(loyalty),
  };
}

// ── 会籍、身份 ────────────────────────────────────────────────────────────────────

function membershipFor(r: Rng, role: Role, age: number, tier: Tier, snow: boolean): Membership {
  switch (role) {
    case 'member': {
      if (age >= 50 && !snow && chance(r, 0.24)) return { kind: 'founder', since: int(r, 1979, 2015) };
      if (snow) return { kind: chance(r, 0.6) ? 'monthly' : 'annual', since: 2026 };
      const kind = weighted<Membership['kind']>(r, [
        ['annual', 45],
        ['monthly', 25],
        ['family', age >= 30 && age <= 58 ? 20 : 0],
      ]);
      return { kind, since: 2026 };
    }
    case 'kid':
      if (tier === 'crowd' && chance(r, 0.4)) return { kind: 'day' };
      return { kind: chance(r, 0.5) ? 'junior' : 'family', since: 2026 };
    case 'parent':
      return weighted<Membership>(r, [
        [{ kind: 'family', since: 2026 }, 70],
        [{ kind: 'annual', since: 2026 }, 15],
        [{ kind: 'day' }, 15],
      ]);
    case 'guest':
      return { kind: 'day' };
    default:
      return { kind: 'none' };
  }
}

function titleFor(info: SlotInfo, body: Body, mem: Membership, snow: boolean, away: boolean, tier: Tier): string {
  switch (info.role) {
    case 'member':
      if (mem.kind === 'founder') return '老会员';
      if (snow) return '候鸟会员';
      return mem.kind === 'family' ? '家庭会员' : mem.kind === 'monthly' ? '月卡会员' : '年卡会员';
    case 'guest':
      if (snow) return '过冬的候鸟';
      if (tier === 'regular') return '常来的客人';
      return away ? '度假客' : '今天的客人';
    case 'kid':
      if (body === 'teen') return mem.kind === 'day' ? '跟家里来的少年' : '青少年会员';
      if (mem.kind === 'day') return '跟大人来的孩子';
      return mem.kind === 'junior' ? '青训学员' : '会员的孩子';
    case 'parent':
      return mem.kind === 'day' ? '带孩子来的家长' : '会员家长';
    default:
      return info.title;
  }
}

// ── 样子 ──────────────────────────────────────────────────────────────────────────

type Pair = readonly [Cloth, Cloth];
const SPORTY: Pair[] = [
  ['white', 'white'],
  ['white', 'navy'],
  ['navy', 'white'],
  ['sky', 'white'],
  ['coral', 'white'],
  ['teal', 'white'],
  ['lavender', 'white'],
  ['yellow', 'navy'],
  ['pink', 'white'],
  ['red', 'white'],
  ['black', 'black'],
  ['gray', 'charcoal'],
  ['lime', 'charcoal'],
  ['orange', 'navy'],
  ['purple', 'white'],
  ['blue', 'white'],
  ['green', 'white'],
  ['white', 'black'],
  ['cream', 'khaki'],
  ['white', 'khaki'],
];
const CASUAL: Pair[] = [
  ['coral', 'khaki'],
  ['sky', 'tan'],
  ['white', 'blue'],
  ['cream', 'brown'],
  ['teal', 'khaki'],
  ['yellow', 'blue'],
  ['pink', 'white'],
  ['navy', 'khaki'],
  ['green', 'tan'],
  ['gray', 'blue'],
  ['black', 'khaki'],
  ['lavender', 'gray'],
  ['orange', 'cream'],
  ['red', 'charcoal'],
  ['white', 'charcoal'],
  ['brown', 'cream'],
  ['sky', 'navy'],
  ['cream', 'navy'],
];
const KIDWEAR: Pair[] = [
  ['yellow', 'blue'],
  ['red', 'navy'],
  ['lime', 'gray'],
  ['pink', 'white'],
  ['sky', 'navy'],
  ['orange', 'khaki'],
  ['teal', 'white'],
  ['purple', 'pink'],
  ['coral', 'white'],
  ['green', 'khaki'],
  ['lavender', 'navy'],
  ['white', 'red'],
];
const VENDOR_TOP: Cloth[] = ['white', 'cream', 'red', 'yellow', 'teal', 'black', 'coral', 'green', 'orange', 'sky'];
const VENDOR_BOTTOM: Cloth[] = ['khaki', 'charcoal', 'blue', 'black', 'navy'];

interface LookIn {
  info: SlotInfo;
  body: Body;
  age: number;
  gender: Gender;
  group: GroupId;
  southAsian: boolean;
  traits: TraitId[];
}

function hairFor(r: Rng, w: LookIn): { hair: HairColor; hairStyle: HairStyle } {
  const own = weighted(r, HAIR_BY[w.group]);
  let hair: HairColor = own;
  const a = w.age;
  if (a >= 70)
    hair = weighted<HairColor>(r, [
      ['gray', 40],
      ['white', 40],
      [own, 20],
    ]);
  else if (a >= 55)
    hair = weighted<HairColor>(r, [
      ['gray', 35],
      ['white', 10],
      [own, 55],
    ]);
  else if (a >= 42 && chance(r, 0.12)) hair = 'gray';
  let hairStyle: HairStyle;
  if (w.gender === 'f') {
    hairStyle =
      a >= 60
        ? weighted<HairStyle>(r, [
            ['bob', 35],
            ['short', 30],
            ['bun', 20],
            ['curly', 15],
          ])
        : weighted<HairStyle>(r, [
            ['ponytail', 25],
            ['bun', 14],
            ['long', 18],
            ['bob', 16],
            ['curly', 12],
            ['braids', w.body === 'adult' ? 6 : 14],
            ['short', 6],
          ]);
  } else {
    const bald = w.body !== 'adult' ? 0 : a >= 70 ? 35 : a >= 55 ? 20 : a >= 40 ? 8 : 0;
    hairStyle = weighted<HairStyle>(r, [
      ['short', 50],
      ['buzz', 18],
      ['curly', 14],
      ['long', a < 35 ? 4 : 0],
      ['bald', bald],
    ]);
  }
  return { hair, hairStyle };
}

function hatFor(r: Rng, kind: 'sporty' | 'casual' | 'kid', w: LookIn, shirt: Cloth): Hat | undefined {
  const color = (): Cloth => pick(r, ['white', 'white', 'navy', 'khaki', 'cream', 'black', shirt]);
  const old = w.age >= 60 ? 10 : 0;
  const k =
    kind === 'kid'
      ? weighted<Hat['kind'] | null>(r, [
          ['cap', 20],
          ['bucket', 15],
          [null, 65],
        ])
      : kind === 'sporty'
        ? weighted<Hat['kind'] | null>(r, [
            ['visor', w.gender === 'f' ? 20 : 4],
            ['headband', 6],
            ['cap', w.gender === 'f' ? 12 : 25],
            ['bucket', 4],
            ['straw', old],
            [null, 55],
          ])
        : weighted<Hat['kind'] | null>(r, [
            ['straw', 15 + old],
            ['bucket', 10],
            ['cap', 15],
            [null, 60],
          ]);
  if (!k) return undefined;
  return { kind: k, color: k === 'straw' ? 'tan' : color() };
}

function lookFor(r: Rng, w: LookIn): CastLook {
  const { info, body, age, gender } = w;
  const skin = weighted(r, w.southAsian ? SKIN_SOUTH_ASIAN : SKIN_BY[w.group]);
  const { hair, hairStyle } = hairFor(r, w);
  const look: CastLook = {
    body,
    skin,
    hair,
    hairStyle,
    shirt: 'white',
    bottom: 'navy',
    bottomKind: 'shorts',
    shoes: 'white',
  };
  if (body === 'adult') {
    look.height = Math.round(clamp(normal(r, gender === 'f' ? 0.97 : 1.03, 0.025), 0.92, 1.08) * 100) / 100;
    const fit = w.traits.includes('sporty') || info.role === 'pro' || info.role === 'coach' ? -0.05 : 0;
    look.stout = Math.round(clamp(normal(r, 1.05, 0.07) + (age > 45 ? 0.04 : 0) + fit, 0.92, 1.3) * 100) / 100;
    if (chance(r, 0.2)) look.eyes = 'shades';
    else if (chance(r, age >= 50 ? 0.25 : 0.08)) look.eyes = 'glasses';
    if (gender === 'm' && age >= 20 && chance(r, 0.3)) look.facial = chance(r, 0.55) ? 'beard' : 'mustache';
  } else if (body === 'teen' && chance(r, 0.12)) look.eyes = 'glasses';
  const shoes = (): Cloth =>
    weighted<Cloth>(r, [
      ['white', 60],
      ['gray', 15],
      ['black', 15],
      [look.shirt, body === 'kid' ? 20 : 8],
    ]);
  const t = info.title;

  // 制服（BRIEF 的统一约定）
  if (info.kind === 'ball-kid') {
    Object.assign(look, { shirt: 'blue', bottom: 'navy', bottomKind: 'shorts', shoes: 'white' });
    look.hat = { kind: 'cap', color: 'white' };
    look.keep = ['shirt', 'bottom', 'shoes', 'hat'];
    look.accent = 'blue';
    return look;
  }
  if (info.kind === 'umpire' || t.includes('裁判')) {
    Object.assign(look, { shirt: 'white', trim: 'navy', bottom: 'navy', bottomKind: 'pants', shoes: 'white' });
    look.keep = ['shirt', 'bottom', 'shoes', 'hat', 'trim'];
    look.accent = 'navy';
    return look;
  }
  if (info.role === 'coach' && info.kind === 'coach') {
    const [, bottom] = pick(r, SPORTY);
    Object.assign(look, {
      shirt: 'white',
      trim: 'navy',
      bottom,
      bottomKind: gender === 'f' && chance(r, 0.4) ? 'skirt' : 'shorts',
    });
    look.shoes = shoes();
    look.keep = ['shirt', 'trim', 'whistle'];
    if (chance(r, 0.35)) look.hat = { kind: chance(r, 0.6) ? 'cap' : 'visor', color: 'white' };
    return look;
  }
  if (info.role === 'staff') {
    if (t.includes('救生员')) {
      Object.assign(look, { shirt: 'red', bottom: 'red', bottomKind: 'shorts', shoes: 'white', accent: 'red' });
      if (chance(r, 0.5)) look.hat = { kind: 'visor', color: 'white' };
      look.eyes = chance(r, 0.6) ? 'shades' : look.eyes;
      return look;
    }
    if (t.includes('维护') || t.includes('场地') || t.includes('园丁')) {
      const shirt: Cloth = chance(r, 0.5) ? 'orange' : 'green';
      Object.assign(look, { shirt, bottom: chance(r, 0.5) ? 'khaki' : 'charcoal', bottomKind: 'pants', accent: shirt });
      look.shoes = chance(r, 0.6) ? 'brown' : 'black';
      look.hat = { kind: 'cap', color: chance(r, 0.5) ? shirt : 'khaki' };
      return look;
    }
    Object.assign(look, {
      shirt: 'navy',
      trim: 'white',
      bottom: 'khaki',
      bottomKind: chance(r, 0.6) ? 'pants' : gender === 'f' && chance(r, 0.3) ? 'skirt' : 'shorts',
      accent: 'navy',
    });
    look.shoes = chance(r, 0.6) ? 'white' : 'black';
    if (t.includes('泊车') || t.includes('门童'))
      look.hat = chance(r, 0.5) ? { kind: 'cap', color: 'navy' } : undefined;
    if (!look.hat) delete look.hat;
    return look;
  }
  if (info.role === 'vendor') {
    if (t.includes('酒保'))
      Object.assign(look, { shirt: 'black', bottom: 'black', bottomKind: 'pants', shoes: 'black' });
    else if (t.includes('厨师') || t.includes('师傅'))
      Object.assign(look, {
        shirt: 'white',
        bottom: chance(r, 0.5) ? 'charcoal' : 'black',
        bottomKind: 'pants',
        shoes: 'black',
      });
    else {
      Object.assign(look, {
        shirt: pick(r, VENDOR_TOP),
        bottom: pick(r, VENDOR_BOTTOM),
        bottomKind: chance(r, 0.65) ? 'pants' : 'shorts',
      });
      look.shoes = shoes();
      if (chance(r, 0.4))
        look.hat = { kind: chance(r, 0.6) ? 'cap' : 'bucket', color: pick(r, ['white', 'black', look.shirt, 'khaki']) };
    }
    return look;
  }

  // 便装、球服
  const style: 'sporty' | 'casual' | 'kid' =
    body === 'kid'
      ? 'kid'
      : info.role === 'member' || info.role === 'pro' || info.role === 'coach' || body === 'teen'
        ? chance(r, 0.85)
          ? 'sporty'
          : 'casual'
        : chance(r, info.role === 'parent' ? 0.3 : 0.25)
          ? 'sporty'
          : 'casual';
  const [shirt, bottom] = pick(r, style === 'kid' ? KIDWEAR : style === 'sporty' ? SPORTY : CASUAL);
  look.shirt = shirt;
  look.bottom = bottom;
  if (style === 'kid') look.bottomKind = gender === 'f' && chance(r, 0.35) ? 'skirt' : 'shorts';
  else if (style === 'sporty')
    look.bottomKind =
      gender === 'f'
        ? weighted(r, [
            ['skirt', 55],
            ['shorts', 40],
            ['pants', age >= 70 ? 20 : 5],
          ])
        : chance(r, age >= 70 ? 0.25 : 0.08)
          ? 'pants'
          : 'shorts';
  else
    look.bottomKind =
      gender === 'f'
        ? weighted(r, [
            ['skirt', 20],
            ['shorts', 40],
            ['pants', 40],
          ])
        : chance(r, 0.5)
          ? 'pants'
          : 'shorts';
  if (bottom === 'blue') look.bottomKind = 'pants';
  if (style === 'sporty' && chance(r, 0.3)) look.trim = shirt === 'white' ? 'navy' : 'white';
  if (style === 'casual' && age >= 65 && chance(r, 0.15)) look.longSleeves = true;
  look.shoes = shoes();
  const hat = hatFor(r, style, w, shirt);
  if (hat) look.hat = hat;
  return look;
}

// ── 喜好、故事、台词 ───────────────────────────────────────────────────────────────

function pickBio(r: Rng, ts: readonly BioT[], c: BioCtx): string {
  const ok = ts.filter((t) => !t.when || t.when(c));
  return pick(r, ok.length ? ok : ts).f(c);
}

function linesFor(role: Role, traits: TraitId[]): CastPerson['lines'] {
  const out: Partial<Record<LineKey, string[]>> = {};
  for (const id of traits) {
    const tl = TRAITS[id]?.lines;
    if (!tl) continue;
    for (const [k, v] of Object.entries(tl) as [LineKey, string[]][]) out[k] = [...(out[k] ?? []), ...v];
  }
  for (const [k, v] of Object.entries(ROLE_LINES[role]) as [LineKey, string[]][]) out[k] = [...(out[k] ?? []), ...v];
  return out;
}

function fromFor(r: Rng, role: Role, group: GroupId, fam: Fam): string {
  if (fam.from.length) return pick(r, fam.from);
  if (group === 'euro') return pick(r, EUROPE);
  if (group === 'canada') return pick(r, CANADA);
  const w: Record<Role, [number, number, number]> = {
    member: [55, 15, 30],
    guest: [30, 35, 35],
    kid: [75, 15, 10],
    parent: [70, 15, 15],
    staff: [75, 15, 10],
    vendor: [75, 15, 10],
    coach: [40, 20, 40],
    pro: [10, 30, 60],
  };
  const [a, b, c] = w[role];
  const src = weighted<string[]>(r, [
    [VALLEY, a],
    [SOCAL, b],
    [role === 'pro' ? [...US_ELSE, ...EUROPE] : US_ELSE, c],
  ]);
  return pick(r, src);
}

const STAFF_YOUNG = [
  '在 College of the Desert 读夜校',
  '高中刚毕业，在攒学费',
  '社区大学学酒店管理',
  '大学网球队打过两年',
  '暑假打工，开学回 UC Riverside',
];
const COLLEGE = [
  'College of the Desert 的学生',
  'UC Riverside 大二，放假回来',
  'UCLA 的学生，周末回家',
  'Cal State 棕榈沙漠校区的学生',
];

/**
 * 生成一个人。key 当 id 用（'reg:12'、'staff:clubplaza:vendor'、'guest:clubfood:d-0n1:3'）。
 * 同样的 seed、key、info、tier、opts → 一模一样的人。
 */
export function makePerson(
  seed: number,
  key: string,
  info: SlotInfo,
  tier: 'regular' | 'crowd',
  opts: MakeOpts = {},
): CastPerson {
  const r = rngOf(seed, 'person', key);
  const role = info.role;
  const body: Body = info.kind === 'kid' ? 'kid' : info.kind === 'ball-kid' || role === 'kid' ? 'teen' : 'adult';
  const age = ageFor(r, info, body);
  const gender: Gender = chance(r, 0.5) ? 'f' : 'm';
  const group = weighted(r, groupWeights((role === 'member' || role === 'guest') && age >= 55));
  const fams = FAMS[group];
  const famIdx = weighted(
    r,
    fams.map((f, i): [number, number] => [i, f.f.length + f.m.length]),
  );
  const fam = fams[famIdx];
  const first = firstFor(r, fam, gender, age);
  const last = pick(r, fam.last);
  const snow = group === 'euro' || group === 'canada';
  const from = fromFor(r, role, group, fam);
  const local = VALLEY.includes(from);
  const town = local ? from : pick(r, VALLEY);

  // 做什么
  const retired =
    body === 'adult' && (snow ? chance(r, 0.9) : age >= 66 ? chance(r, 0.85) : age >= 60 ? chance(r, 0.4) : false);
  const fixed = role === 'staff' || role === 'vendor' || role === 'coach' || role === 'pro';
  const student = body !== 'adult' || (!fixed && age <= 22 && chance(r, 0.7));
  let job: string;
  let does: string;
  if (body !== 'adult') {
    job = gradeText(age);
    does = role === 'staff' ? `${job}，周末和假期来打工` : job;
  } else if (role === 'staff') {
    job = pick(r, age < 25 ? STAFF_YOUNG : STAFF_PAST);
    does = job;
  } else if (role === 'vendor') {
    job = pick(r, VENDOR_PAST);
    does = job;
  } else if (role === 'coach') {
    job = pick(r, COACH_PAST);
    does = job;
  } else if (role === 'pro') {
    job = pick(r, PRO_PAST);
    does = job;
  } else if (student) {
    job = pick(r, COLLEGE);
    does = job;
  } else {
    const j = pick(r, JOBS);
    does = j.does.replace('{town}', town);
    job = retired ? `退休（以前是${j.job}）` : j.job;
  }

  const traits = traitsFor(r, { role, body, age, group, local });
  const member = membershipFor(r, role, age, tier, snow);
  const attrs = attrsFor(r, info, body, age, snow, member, traits);

  // 喜好
  const kidish = body === 'kid';
  const likes = sample(r, kidish ? KID_LIKES : LIKES, int(r, 2, 3));
  if (traits.includes('foodie') && !likes.some((l) => /塔可|吉事果|奶茶|披萨|烤肉/.test(l)))
    likes.push(pick(r, ['辣味塔可', '吉事果', '披萨窑的烟火味', '烤肉']));
  const dislikes = sample(
    r,
    (kidish ? KID_DISLIKES : DISLIKES).filter((d) => !likes.includes(d)),
    int(r, 1, 2),
  );

  // 故事
  const days = opts.days?.length ? opts.days : sample(r, [0, 1, 2, 3, 4, 5, 6], int(r, 1, 3)).sort((a, b) => a - b);
  const c: BioCtx = {
    zh: first.zh,
    ta: gender === 'f' ? '她' : '他',
    age,
    town,
    from,
    does,
    job,
    title: info.title,
    like: likes[0],
    dislike: dislikes[0],
    year: member.since ?? 2026,
    days: daysText(days),
    n: days.length,
    ntrp: attrs.ntrp,
    retired,
    snowbird: snow,
    student,
    founder: member.kind === 'founder',
    stay: pick(r, STAYS),
    dog: pick(r, DOGS),
  };
  const b = BIO[role];
  const s1 = pickBio(r, b.first, c);
  const head = b.habit ? `${s1}${pickBio(r, b.habit, c)}` : s1;
  const bio = `${head}。${pickBio(r, b.detail, c)}。`;

  const look = lookFor(r, { info, body, age, gender, group, southAsian: group === 'asian' && famIdx === 5, traits });

  let favor0 = role === 'staff' || role === 'vendor' ? 5 : role === 'guest' ? 3 : 4;
  if (traits.includes('cheerful')) favor0 += 1;
  if (traits.includes('grumpy')) favor0 -= 1.5;
  if (traits.includes('shy')) favor0 -= 0.5;
  if (traits.includes('local')) favor0 += 0.5;
  if (member.kind === 'founder') favor0 -= 0.5;
  favor0 = Math.round(clamp(favor0 + range(r, -0.5, 0.5), 1, 7) * 10) / 10;

  const p: CastPerson = {
    id: key,
    tier,
    role,
    title: titleFor(info, body, member, snow, !local, tier),
    name: `${first.en} ${last}`,
    nameZh: first.zh,
    age,
    from,
    job,
    member,
    attrs,
    traits,
    likes,
    dislikes,
    bio,
    lines: linesFor(role, traits),
    ties: [],
    homes: [],
    look,
    favor0,
  };
  if (chance(r, 0.45)) {
    const work = role === 'staff' || role === 'vendor';
    const ok = QUIRKS.filter((q) => work || !/围裙|钥匙串/.test(q));
    p.quirk = pick(r, body === 'adult' ? ok : ok.filter((q) => !/墨镜|薄荷糖|填字/.test(q)));
  }
  return p;
}

/** 这个人的体型能不能演这个位置（kid 槽位只放孩子，球童、少年槽位放少年……） */
export function bodyFits(body: Body, info: Pick<SlotInfo, 'kind' | 'role'>): boolean {
  if (info.kind === 'kid') return body === 'kid';
  if (info.kind === 'ball-kid') return body === 'teen';
  if (info.role === 'kid') return body === 'teen';
  return body === 'adult';
}

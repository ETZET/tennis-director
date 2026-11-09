import { pick, type Rand } from '@td/shared';
import type { HairStyle, PersonOptions } from '../people/person';
import type { Venue } from './types';

/**
 * 同一个活动在不同场地换一身打扮：配色、我方和对手的球衣、记分牌上的队名、横幅……
 * 文字（队名、头条）用文案键，见 text.ts。
 */

export interface Kit {
  shirt: string;
  trim?: string;
  shorts: string;
}

export interface VenueStyle {
  /** 场地外圈 / 内场 / 线的颜色 */
  out: readonly string[];
  inn: readonly string[];
  line: string;
  /** 线断断续续的比例（Hollow Creek 的线快磨没了） */
  gap: number;
  /** 磨秃的地方的颜色 */
  worn?: string;
  grass: readonly string[];
  /** 我方球衣；null 表示没有统一的球衣 */
  team: Kit | null;
  teamFans: readonly string[];
  opp: Kit;
  oppFans: readonly string[];
  /** 发球靶的球罐配色 */
  tube: readonly [string, string, string];
  /** 观众多少的倍率 */
  fanMul: number;
  /** 三星以上教练的配色 */
  coach?: readonly [string, string];
  /** 天色往这个颜色偏一点 */
  sky?: readonly [string, number];
}

export const VENUE_STYLE: Record<Venue, VenueStyle> = {
  generic: {
    out: ['#4f8a5e', '#538e61', '#4b855a'],
    inn: ['#3b6f9e', '#3f74a3', '#386a97'],
    line: '#f1efe6',
    gap: 0,
    grass: ['#6f9a48', '#76a04c', '#68913f', '#7ba552'],
    team: { shirt: '#2e86a6', trim: '#f2efe6', shorts: '#1f2a36' },
    teamFans: ['#2e86a6', '#3a96b6', '#f2efe6'],
    opp: { shirt: '#c8553d', trim: '#f2efe6', shorts: '#f2efe6' },
    oppFans: ['#c8553d', '#d8664d', '#f2efe6'],
    tube: ['#f4f1e8', '#e6b03c', '#2e86a6'],
    fanMul: 1,
  },
  maple: {
    out: ['#8a4c40', '#8f5144', '#844739'],
    inn: ['#4f8c5f', '#548f61', '#4a8459'],
    line: '#efeee4',
    gap: 0,
    grass: ['#6d9446', '#76a04c', '#68903f', '#80a756', '#8c9e4b'],
    team: { shirt: '#7c2232', trim: '#e6b03c', shorts: '#26262b' },
    teamFans: ['#7c2232', '#e6b03c', '#7c2232', '#f2efe6'],
    opp: { shirt: '#24456e', trim: '#f2efe6', shorts: '#f2efe6' },
    oppFans: ['#24456e', '#3a5a86', '#f2efe6'],
    tube: ['#f4f1e8', '#e6b03c', '#7c2232'],
    fanMul: 1,
    coach: ['#7c2232', '#e6b03c'],
    sky: ['#d9c7a0', 0.12],
  },
  hollow: {
    out: ['#5a7562', '#5f7966', '#556f5d'],
    inn: ['#4f6a86', '#536e89', '#4a6580'],
    worn: '#5a5b56',
    line: '#d3cdb9',
    gap: 0.14,
    grass: ['#7d8448', '#858a4c', '#6f7a40', '#8a8350', '#7a7246', '#6b6a3c'],
    team: null,
    teamFans: ['#7a7f86', '#8a7a5a', '#5a6a7a', '#9a6a5a'],
    opp: { shirt: '#f4f6f2', trim: '#2f8a4a', shorts: '#2f8a4a' },
    oppFans: ['#2f8a4a', '#f4f6f2', '#3f9a5a'],
    tube: ['#8a8f93', '#5a5f63', '#a8552a'],
    fanMul: 0.5,
    coach: ['#5b6f8a', '#8a8f93'],
    sky: ['#8e979a', 0.45],
  },
};

export const SKIN = ['#f1c7a1', '#e8b896', '#d9a47c', '#c48a62', '#a86f4c', '#7a4a32', '#5f3a28', '#f1d0ae'] as const;
export const HAIR = ['#1c1712', '#3b2a1e', '#5a3a22', '#a7742f', '#141210', '#7a4a2a', '#d9c27a', '#2a1d16'] as const;
export const CASUAL = [
  '#d65a5a',
  '#e8b03c',
  '#5a8fd6',
  '#7bc47f',
  '#b07ad6',
  '#ef8f5a',
  '#4fb3b3',
  '#e7e2d4',
  '#c94c7a',
] as const;
/** 没有统一球衣时的杂色 */
export const DULL = ['#7a7f86', '#8a7a5a', '#5a6a7a', '#9a6a5a', '#6a7a5a', '#b0a890', '#6b2e2a', '#4f5560'] as const;
export const UMBRELLAS = ['#d65a5a', '#3a7ad6', '#2f2f33', '#e8b03c', '#4fb3b3'] as const;
export const PICKLE_GREEN = '#7fcf6a';

type Look = Omit<PersonOptions, 'x' | 'z'>;

/** 1–5 星教练的样子：越高越职业。 */
const COACH_LOOKS: readonly Partial<Look>[] = [
  {
    shirt: '#8b8e8f',
    shorts: '#4f5560',
    pants: true,
    wide: true,
    hair: '#6a5a48',
    hairStyle: 'cap',
    cap: '#3a3a3a',
    beard: '#6a5a48',
    shoes: '#5a4a3a',
  },
  {
    shirt: '#6f7d5c',
    shorts: '#3f444c',
    wide: true,
    hair: '#3b2a1e',
    hairStyle: 'short',
    beard: '#3b2a1e',
    shoes: '#e8e4d8',
  },
  { shirt: '#2f6a8a', shorts: '#2a2f38', hair: '#1c1712', hairStyle: 'cap', cap: '#2f6a8a', shoes: '#f3f1ea' },
  {
    shirt: '#21506e',
    sleeve: '#21506e',
    longSleeve: true,
    trim: '#f2efe6',
    shorts: '#21506e',
    pants: true,
    hair: '#141210',
    hairStyle: 'visor',
    cap: '#f2efe6',
    shoes: '#f3f1ea',
  },
  {
    shirt: '#173a56',
    sleeve: '#173a56',
    longSleeve: true,
    trim: '#e6b03c',
    shorts: '#173a56',
    pants: true,
    hair: '#9a9a96',
    hairStyle: 'visor',
    cap: '#e6b03c',
    shoes: '#f3f1ea',
  },
];

export function coachLook(rand: Rand, venue: Venue, level: number, o: Partial<PersonOptions> = {}): Look {
  const L: Partial<Look> = { ...COACH_LOOKS[Math.max(0, Math.min(4, level - 1))] };
  const S = VENUE_STYLE[venue];
  if (S.coach && level >= 3) {
    L.shirt = S.coach[0];
    if (L.sleeve) L.sleeve = S.coach[0];
    if (L.pants) L.shorts = S.coach[0];
    L.cap = S.coach[1];
    if (L.trim) L.trim = S.coach[1];
  }
  if (venue === 'hollow' && level <= 2) {
    L.shirt = '#6b2e2a';
    L.wide = true;
    L.beard = '#6a5a48';
  }
  return {
    name: 'Coach',
    skin: pick(SKIN, rand),
    hair: '#1c1712',
    shorts: '#26262b',
    shoes: '#f3f1ea',
    shirt: '#2f6a8a',
    ...L,
    ...o,
  } as Look;
}

export interface LookOptions extends Partial<PersonOptions> {
  /** 我方：穿球衣（没有球衣的场地就穿杂色） */
  team?: boolean;
  /** 对手球衣 */
  opp?: boolean;
  /** 下雨时打伞（拿在右手） */
  umb?: boolean;
}

/** 随机路人 / 球员的样子。 */
export function look(rand: Rand, venue: Venue, rain: boolean, o: LookOptions = {}): Look & { umbrella?: string } {
  const { team, opp, umb, ...rest } = o;
  const base: Look & { umbrella?: string } = {
    name: '',
    skin: pick(SKIN, rand),
    hair: pick(HAIR, rand),
    hairStyle: pick<HairStyle>(['short', 'pony', 'short', 'curly', 'long', 'short'], rand),
    shirt: pick(CASUAL, rand),
    shorts: pick(['#26262b', '#2f3a4f', '#e3ded0', '#3a3f4a', '#5a4a3a'], rand),
    shoes: pick(['#f3f1ea', '#d24b3a', '#2a2a2a', '#3a7ad6'], rand),
  };
  const S = VENUE_STYLE[venue];
  if (team) {
    if (S.team) Object.assign(base, S.team);
    else {
      base.shirt = pick(DULL, rand);
      base.shorts = pick(['#3a3f4a', '#5a4a3a', '#26262b', '#7a6a5a'], rand);
    }
  }
  if (opp) Object.assign(base, S.opp);
  if (rain && umb) base.umbrella = pick(UMBRELLAS, rand);
  return Object.assign(base, rest);
}

/**
 * 阵容：每个人的体型、衣服、配饰、换色表、小动作。长相（头）在 heads.ts。
 * 换色表只给本色，受光 / 背光 / 最暗 / 描边由 format.ts 的 ramp 推出来，所以运行时换一个颜色整条色带跟着变。
 */
import type { BakedArt } from '@td/iso';
import { type Build, compose, type Facing, type Frame, type Look } from './body';
import { HEADS } from './heads';
import { type Anim, anims, type Carry, type Quirk } from './poses';

export interface CastMember {
  id: string;
  name: string;
  /** 一句话（≤14 字） */
  line: string;
  look: Look;
  quirk: Quirk;
  emo: 'cheer' | 'mad' | 'pump';
  carry?: Carry;
}

const ADULT: Build = { sh: 10, waist: 8, hip: 8, torso: 10, leg: 11 };
const WOMAN: Build = { sh: 8, waist: 6, hip: 8, torso: 9, leg: 12 };
const KID: Build = { kid: true, sh: 6, waist: 6, hip: 6, torso: 6, leg: 7 };

export const CAST: CastMember[] = [
  {
    id: 'dale',
    name: 'Dale',
    line: '六十多岁的老教练，腰不好',
    quirk: 'rubBack',
    emo: 'pump',
    carry: { hand: 'l', item: 'clipboard' },
    look: {
      head: HEADS.dale!,
      build: { sh: 12, waist: 12, hip: 10, torso: 10, leg: 11, belly: 4 },
      top: 'polo',
      sleeve: 'short',
      bottom: 'pants',
      shoe: 'sneaker',
      pal: {
        S: '#e3ad86',
        H: '#dcd6ca',
        K: '#ebe6dc',
        C: '#2b3a52',
        T: '#7a3530',
        U: '#e9e1cf',
        B: '#8c7c5c',
        F: '#6a5040',
        A: '#4a3426',
      },
    },
  },
  {
    id: 'rosa',
    name: 'Rosa',
    line: '沙漠长大，风沙要来先知道',
    quirk: 'shade',
    emo: 'cheer',
    look: {
      head: HEADS.rosa!,
      build: { sh: 10, waist: 8, hip: 10, torso: 9, leg: 10 },
      top: 'work',
      sleeve: 'long',
      bottom: 'pants',
      shoe: 'boot',
      extras: ['bandana', 'gloves'],
      pal: {
        S: '#a86f4c',
        H: '#1f1612',
        C: '#d9b36a',
        T: '#5f7a4a',
        U: '#b8432e',
        B: '#5a5045',
        F: '#6a4a30',
        A: '#c69a5a',
      },
    },
  },
  {
    id: 'ben',
    name: 'Ben',
    line: '早班最精神的大学生',
    quirk: 'sip',
    emo: 'cheer',
    look: {
      head: HEADS.ben!,
      build: ADULT,
      top: 'tee',
      sleeve: 'short',
      bottom: 'shorts',
      socks: 'low',
      shoe: 'sneaker',
      extras: ['lanyard'],
      pal: {
        S: '#e6b88c',
        H: '#17141a',
        T: '#2f5f9a',
        B: '#c9b48a',
        F: '#e8e4da',
        A: '#e8b83a',
        G: '#e9e5dc',
      },
    },
  },
  {
    id: 'jess',
    name: 'Jess',
    line: '干劲十足的年轻教练',
    quirk: 'bounce',
    emo: 'cheer',
    carry: { hand: 'r', item: 'racket', ang: 80 },
    look: {
      head: HEADS.jess!,
      build: WOMAN,
      top: 'tee',
      sleeve: 'short',
      bottom: 'skirt',
      socks: 'low',
      shoe: 'sneaker',
      extras: ['wristband'],
      pal: {
        S: '#d9a47c',
        H: '#2a1d16',
        U: '#f4f1e8',
        T: '#2a8a86',
        B: '#f1ece0',
        F: '#f1ece0',
        A: '#e8582c',
        M: '#b8604f',
        Q: '#e8582c',
      },
    },
  },
  {
    id: 'gus',
    name: 'Gus',
    line: '心累的老场地工，较真',
    quirk: 'sigh',
    emo: 'mad',
    carry: { hand: 'l', item: 'broom', ang: 100 },
    look: {
      head: HEADS.gus!,
      build: { sh: 10, waist: 10, hip: 10, torso: 10, leg: 10, hunch: 1 },
      top: 'work',
      sleeve: 'rolled',
      bottom: 'pants',
      shoe: 'boot',
      extras: ['towel', 'belt'],
      pal: {
        S: '#c48a62',
        H: '#b9b4aa',
        K: '#a9a49a',
        T: '#5a7088',
        U: '#4a5f78',
        B: '#4f5560',
        F: '#4a3a2c',
        W: '#e9e3d3',
        A: '#7a5a3a',
        D: '#a0784a',
      },
    },
  },
  {
    id: 'lily',
    name: 'Lily',
    line: '双语前台，越晚越来劲',
    quirk: 'phone',
    emo: 'cheer',
    look: {
      head: HEADS.lily!,
      build: { sh: 8, waist: 6, hip: 8, torso: 9, leg: 11 },
      top: 'blazer',
      sleeve: 'long',
      bottom: 'pants',
      shoe: 'boot',
      pal: {
        S: '#efc9a4',
        H: '#141018',
        M: '#c2404a',
        A: '#f0c43a',
        T: '#2c2a38',
        U: '#f3ece0',
        B: '#2c2a38',
        F: '#1c1a20',
        G: '#30323a',
      },
    },
  },
  {
    id: 'teodora',
    name: 'Teodora',
    line: '塞尔维亚穿线师，线不直不交',
    quirk: 'inspect',
    emo: 'mad',
    carry: { hand: 'l', item: 'pliers' },
    look: {
      head: HEADS.teodora!,
      build: { sh: 8, waist: 8, hip: 10, torso: 10, leg: 10 },
      top: 'tee',
      sleeve: 'short',
      bottom: 'pants',
      shoe: 'boot',
      extras: ['apron'],
      pal: {
        S: '#efc8a8',
        H: '#5a2820',
        G: '#1e1a1e',
        T: '#3c4a5c',
        U: '#b09068',
        A: '#c0392b',
        B: '#2c2c34',
        F: '#3a3030',
        Q: '#d8d4c8',
      },
    },
  },
  {
    id: 'nadia',
    name: 'Nadia',
    line: '退役明星，肩上还贴着胶布',
    quirk: 'shoulder',
    emo: 'cheer',
    carry: { hand: 'l', item: 'bottle' },
    look: {
      head: HEADS.nadia!,
      build: { sh: 8, waist: 6, hip: 8, torso: 10, leg: 13 },
      top: 'dress',
      sleeve: 'none',
      bottom: 'skirt',
      socks: 'low',
      shoe: 'sneaker',
      extras: ['tape', 'wristband'],
      pal: {
        S: '#f1d0ae',
        H: '#efe0a8',
        G: '#2a2a30',
        T: '#f6f3ea',
        U: '#d8b45a',
        A: '#ff5d8a',
        F: '#f6f3ea',
        M: '#c8505a',
        Q: '#2a2a30',
      },
    },
  },
  {
    id: 'ray',
    name: 'Ray',
    line: '老场地主管，膝盖不行了',
    quirk: 'knee',
    emo: 'mad',
    look: {
      head: HEADS.ray!,
      build: { sh: 12, waist: 12, hip: 10, torso: 10, leg: 10, belly: 5 },
      top: 'polo',
      sleeve: 'short',
      bottom: 'shorts',
      socks: 'high',
      shoe: 'sneaker',
      extras: ['kneebrace', 'radio'],
      pal: {
        S: '#b07a52',
        H: '#cfcac0',
        K: '#55504a',
        T: '#3d6b3a',
        U: '#e9e1cf',
        B: '#c8b48a',
        A: '#2a2a30',
        F: '#e8e4da',
        G: '#2a2e34',
      },
    },
  },
  {
    id: 'mateo',
    name: 'Mateo',
    line: '16 岁球童，放学就骑车来',
    quirk: 'toss',
    emo: 'cheer',
    look: {
      head: HEADS.mateo!,
      build: { sh: 8, waist: 8, hip: 8, torso: 9, leg: 12 },
      top: 'jersey',
      sleeve: 'short',
      bottom: 'shorts',
      socks: 'low',
      shoe: 'sneaker',
      extras: ['number'],
      pal: {
        S: '#c48a62',
        H: '#1d1410',
        T: '#5a3a8a',
        U: '#3fae5a',
        B: '#2a2a40',
        F: '#e8e4da',
      },
    },
  },
  {
    id: 'director',
    name: '总监（你）',
    line: '西装、挂牌、平板不离手',
    quirk: 'watch',
    emo: 'cheer',
    carry: { hand: 'l', item: 'tablet' },
    look: {
      head: HEADS.director!,
      build: ADULT,
      top: 'blazer',
      sleeve: 'long',
      bottom: 'pants',
      shoe: 'boot',
      extras: ['lanyard'],
      pal: {
        S: '#e8b896',
        H: '#3a2a20',
        T: '#22304a',
        U: '#f3ece0',
        B: '#4a4f5a',
        F: '#5a3a2a',
        A: '#ff8a6b',
        G: '#3a3f48',
      },
    },
  },
  {
    id: 'kidA',
    name: 'Leo（学员）',
    line: '8 岁，拍子比胳膊长',
    quirk: 'fidget',
    emo: 'cheer',
    carry: { hand: 'r', item: 'racket', ang: 70 },
    look: {
      head: HEADS.kidA!,
      build: KID,
      top: 'tee',
      sleeve: 'short',
      bottom: 'shorts',
      socks: 'low',
      shoe: 'sneaker',
      pal: {
        S: '#7a4a32',
        H: '#141010',
        A: '#e8582c',
        T: '#f0c43a',
        B: '#2a3a6a',
        F: '#e8e4da',
        Q: '#3a8ad8',
      },
    },
  },
  {
    id: 'kidB',
    name: 'Mia（学员）',
    line: '7 岁，雀斑和两个小辫',
    quirk: 'bounce',
    emo: 'cheer',
    carry: { hand: 'r', item: 'racket', ang: 70 },
    look: {
      head: HEADS.kidB!,
      build: KID,
      top: 'tee',
      sleeve: 'short',
      bottom: 'skirt',
      socks: 'low',
      shoe: 'sneaker',
      pal: {
        S: '#f1c7a1',
        H: '#c86a3a',
        A: '#3fae5a',
        T: '#e87aa6',
        B: '#f4f0e6',
        F: '#f4f0e6',
        M: '#e89a8a',
        Q: '#8a4ad8',
      },
    },
  },
  {
    id: 'retiree',
    name: '退休客人',
    line: 'Palm Desert 来的老会员',
    quirk: 'lean',
    emo: 'cheer',
    look: {
      head: HEADS.retiree!,
      build: { sh: 10, waist: 12, hip: 10, torso: 10, leg: 10, belly: 4 },
      top: 'polo',
      sleeve: 'short',
      bottom: 'shorts',
      socks: 'high',
      shoe: 'sneaker',
      pal: {
        S: '#efb49c',
        H: '#eeeae2',
        U: '#f6f3ea',
        T: '#8cc4c4',
        B: '#e6dcc4',
        F: '#f6f3ea',
        A: '#6a5a4a',
        Q: '#4a5a6a',
      },
    },
  },
  {
    id: 'mom',
    name: '网球妈妈',
    line: '墨镜、托特包、电话不停',
    quirk: 'call',
    emo: 'mad',
    look: {
      head: HEADS.mom!,
      build: WOMAN,
      top: 'zip',
      sleeve: 'long',
      bottom: 'leggings',
      shoe: 'sneaker',
      extras: ['tote'],
      pal: {
        S: '#efc9a4',
        H: '#8a5a34',
        G: '#1e1a1e',
        M: '#c2404a',
        T: '#e8708a',
        U: '#f6f3ea',
        B: '#24242c',
        F: '#f6f3ea',
        A: '#d8c08a',
      },
    },
  },
  {
    id: 'tourist',
    name: '游客',
    line: '晒伤的鼻子，见什么拍什么',
    quirk: 'photo',
    emo: 'cheer',
    look: {
      head: HEADS.tourist!,
      build: { sh: 10, waist: 10, hip: 10, torso: 10, leg: 11, belly: 5 },
      top: 'hawaii',
      sleeve: 'short',
      bottom: 'shorts',
      socks: 'high',
      shoe: 'sandal',
      extras: ['camera'],
      pal: {
        S: '#f2a88c',
        H: '#c8a070',
        C: '#c8b48a',
        M: '#f0786a',
        T: '#2a9ac8',
        A: '#ffd04a',
        U: '#3fae5a',
        B: '#9a8a60',
        F: '#6a4a30',
        G: '#2a2a30',
      },
    },
  },
];

export const CAST_BY_ID = new Map(CAST.map((c) => [c.id, c]));

/* ---------- 烘好的帧（按人、动画、朝向缓存） ---------- */

export interface BakedAnim {
  frames: BakedArt[];
  dts: number[];
  total: number;
  raw: Frame[];
}

const cache = new Map<string, BakedAnim>();

export function animOf(c: CastMember, name: string, facing: Facing, look: Look = c.look): BakedAnim {
  const key = `${c.id}|${name}|${facing}|${look === c.look ? '' : JSON.stringify(look.pal)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const A = anims(look.build, c.quirk, c.emo, c.carry);
  const a: Anim = A[name] ?? (A.idle as Anim);
  const raw = a.frames.map((p) => compose(look, p, facing));
  const dts = a.frames.map((_, i) => (typeof a.dt === 'number' ? a.dt : (a.dt[i] ?? 0.3)));
  const out = { frames: raw.map((r) => r.art), dts, total: dts.reduce((s, d) => s + d, 0), raw };
  cache.set(key, out);
  return out;
}

/** 动画在时刻 t（秒）的帧号 */
export function frameAt(a: BakedAnim, t: number): number {
  let u = ((t % a.total) + a.total) % a.total;
  for (let i = 0; i < a.dts.length; i++) {
    u -= a.dts[i] as number;
    if (u < 0) return i;
  }
  return a.dts.length - 1;
}

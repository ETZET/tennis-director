/**
 * 阵容：每个人的长相（换色表 + 部件）、一句话、有个性的 idle，以及共用的走路、挥拍、情绪动作。
 * 姿势全是数据（rig.ts 的 Pose）：每个人要画的只有头（正 / 背）和身上的贴花，其余按体型自动拼。
 */
import type { Look } from './paint';
import type { ArmPose, Build, Pose } from './rig';

export type AnimName = 'idle' | 'walk' | 'swing' | 'emote';

export interface Anim {
  frames: Pose[];
  /** 每帧秒数（一个数 = 每帧一样；数组 = 逐帧） */
  dt: number | number[];
  racket: boolean;
}

export interface Member {
  id: string;
  name: string;
  /** 一句话（≤14 字） */
  line: string;
  /** 角色（员工 / 客人 / 学员 / 玩家） */
  role: string;
  look: Look;
  build: Build;
  anims: Record<AnimName, Anim>;
  /** 走路时手里拿着拍子 */
  carry?: boolean;
}

/* ---------- 共用手臂姿势（相对肩：x 向外、y 向下） ---------- */
const REST: ArmPose = { el: [0.6, 6], hand: [0.8, 12] };
const SWING_F: ArmPose = { el: [0.2, 6], hand: [-0.6, 11.4] };
const SWING_B: ArmPose = { el: [1, 6], hand: [1.8, 11.4] };
const HIP: ArmPose = { el: [3, 5], hand: [1, 9] };
const UP: ArmPose = { el: [1.6, -4.5], hand: [2.4, -10.5] };
const RACKET_DOWN = { ang: 168 };

const walk = (o: { racket?: boolean; limp?: boolean; bounce?: number } = {}): Anim => {
  const b = o.bounce ?? 1;
  const lim = o.limp ? 1 : 0;
  const rk = o.racket ? RACKET_DOWN : null;
  return {
    frames: [
      {
        R: SWING_B,
        L: SWING_F,
        legR: { foot: [0.3, 1.5], knee: [0, 0.5] },
        legL: { foot: [-0.3, -2], knee: [0, -1.5] },
        racket: rk,
      },
      { dy: -b + lim, R: REST, L: REST, legL: { foot: [0, -0.5] }, racket: rk },
      {
        dy: lim,
        R: SWING_F,
        L: SWING_B,
        legL: { foot: [0.3, 1.5], knee: [0, 0.5] },
        legR: { foot: [-0.3, -2], knee: [0, -1.5] },
        racket: rk,
      },
      { dy: -b, R: REST, L: REST, legR: { foot: [0, -0.5] }, racket: rk },
    ],
    dt: o.limp ? [0.16, 0.22, 0.16, 0.12] : 0.15,
    racket: !!o.racket,
  };
};

/** 正手：引拍 → 击球 → 随挥（宽站位、屈膝） */
const swing = (kid = false): Anim => {
  const wideLegs = {
    legR: { foot: [1.5, 0] as const, knee: [1.5, 0] as const },
    legL: { foot: [1.5, 0] as const, knee: [1.5, 0] as const },
  };
  return {
    frames: [
      {
        dy: 1,
        lean: 0,
        R: { el: [0.4, 5], hand: [-1.5, 9] },
        L: { el: [0.2, 5], hand: [-2.5, 8.5] },
        racket: { ang: -70 },
        ...wideLegs,
      },
      {
        dy: 1,
        lean: -1,
        R: { el: [3, 3], hand: [7, 3.5] },
        L: { el: [-0.5, 4.5], hand: [-4, 6.5] },
        racket: { ang: 55 },
        ...wideLegs,
      },
      {
        dy: 1,
        R: { el: [2.6, 5.5], hand: [3.5, 9.5] },
        L: { el: [2, 4.5], hand: [5, 7] },
        racket: { ang: 95 },
        ...wideLegs,
        legL: { foot: [1.5, -1], knee: [1.5, -1] },
      },
      {
        dy: 0,
        lean: 1,
        hx: 1,
        R: { el: [-2.5, 2], hand: [-7, -2] },
        L: { el: [1.2, 5.5], hand: [-0.5, 9] },
        racket: { ang: -40, behind: true },
        legR: { foot: [0.5, -1.5], knee: [0.5, -1] },
        legL: { foot: [1.5, 0], knee: [1.5, 0] },
      },
    ],
    dt: kid ? [0.35, 0.2, 0.08, 0.4] : [0.4, 0.22, 0.08, 0.45],
    racket: true,
  };
};

const cheer = (racket = false): Anim => ({
  frames: [
    {
      dy: 2,
      R: { el: [1.5, 4], hand: [1, 8] },
      L: { el: [1.5, 4], hand: [1, 8] },
      racket: racket ? { ang: 20 } : null,
    },
    { lift: 3, R: UP, L: UP, racket: racket ? { ang: 10 } : null, mark: 'spark' },
    {
      lift: 1,
      R: UP,
      L: { el: [1.5, -3.5], hand: [2.8, -9.5] },
      racket: racket ? { ang: 0 } : null,
      mark: 'spark',
      markDy: -1,
    },
    {
      dy: 1,
      R: { el: [1.5, 4], hand: [1, 8] },
      L: { el: [1.5, 4], hand: [1, 8] },
      racket: racket ? { ang: 20 } : null,
    },
  ],
  dt: [0.18, 0.22, 0.22, 0.2],
  racket,
});

const angry = (): Anim => ({
  frames: [
    { R: HIP, L: HIP, lean: 0, mark: 'anger' },
    { R: HIP, L: HIP, lean: 1, hx: 0, mark: 'anger', markDy: -1 },
    { R: { el: [2, 4], hand: [-1, 7] }, L: HIP, lean: -1, mark: 'anger' },
    { R: HIP, L: HIP, lean: 0, mark: 'anger', markDy: -1 },
  ],
  dt: 0.12,
  racket: false,
});

const breathe = (p: Pose): Pose[] => [p, { ...p, hy: (p.hy ?? 0) + 1, dy: p.dy ?? 0 }];

/* ---------- 人物 ---------- */
const SK = ['#f1c7a1', '#e8b896', '#d9a47c', '#c48a62', '#a86f4c', '#7a4a32', '#5f3a28', '#f1d0ae'] as const;

export const CAST: Member[] = [
  {
    id: 'dale',
    name: 'Dale',
    role: '老教练',
    line: '腰不好，嘴更硬',
    look: {
      S: SK[0],
      H: '#d6d1c6',
      Y: '#eeeae0',
      M: '#ece8dd',
      P: '#2b3a52',
      C: '#d8c08a',
      T: '#7a2f2a',
      B: '#4f5560',
      F: '#5a4a3a',
      Q: '#8a8f93',
    },
    build: { head: 'dale', body: 'wide', decals: 'dale', bottoms: 'pants', sleeve: 0.6, shoe: 'boot' },
    carry: true,
    anims: {
      idle: {
        frames: [
          { R: REST, L: REST, props: [{ name: 'clipboardSide', at: 'L', dx: 0, dy: 1 }] },
          { R: REST, L: REST, hy: 1, props: [{ name: 'clipboardSide', at: 'L', dx: 0, dy: 1 }] },
          {
            lean: -1,
            hx: -1,
            R: { el: [3, 4], hand: [0.5, 9.5], behind: true },
            L: REST,
            props: [{ name: 'clipboardSide', at: 'L', dx: 0, dy: 1 }],
          },
          {
            lean: -1,
            hx: -1,
            hy: 1,
            R: { el: [3, 4.5], hand: [0.5, 10.5], behind: true },
            L: REST,
            mark: 'sweat',
            props: [{ name: 'clipboardSide', at: 'L', dx: 0, dy: 1 }],
          },
          {
            lean: -1,
            hx: -1,
            R: { el: [3, 4], hand: [0.5, 9.5], behind: true },
            L: REST,
            mark: 'sweat',
            props: [{ name: 'clipboardSide', at: 'L', dx: 0, dy: 1 }],
          },
        ],
        dt: [1.2, 0.8, 0.35, 0.35, 0.35],
        racket: false,
      },
      walk: walk({ racket: true, bounce: 0.6 }),
      swing: swing(),
      emote: cheer(true),
    },
  },
  {
    id: 'rosa',
    name: 'Rosa',
    role: '维护工',
    line: '沙漠长大，先知道风',
    look: {
      S: SK[4],
      H: '#221813',
      P: '#d8b46e',
      X: '#c23b30',
      T: '#4a7044',
      C: '#3c5c38',
      B: '#7a6e58',
      F: '#5a4232',
      Z: '#c9a46a',
    },
    build: { head: 'rosa', body: 'slim', decals: 'rosa', bottoms: 'pants', sleeve: 2, shoe: 'boot', gloves: true },
    anims: {
      idle: {
        frames: [
          { R: REST, L: REST },
          { R: REST, L: REST, hy: 1 },
          { R: { el: [2.5, 1], hand: [-1.5, -6.5] }, L: REST, hx: 0 },
          { R: { el: [2.5, 1], hand: [-1.5, -6.5] }, L: REST, hx: 1 },
          { R: { el: [2.5, 1], hand: [-1.5, -6.5] }, L: REST, hx: -1 },
        ],
        dt: [1, 0.8, 0.5, 0.9, 0.9],
        racket: false,
      },
      walk: walk(),
      swing: swing(),
      emote: cheer(),
    },
  },
  {
    id: 'ben',
    name: 'Ben',
    role: '前台',
    line: '早上最精神的大学生',
    look: {
      S: SK[1],
      H: '#1d1a1e',
      T: '#e6b03c',
      C: '#f1ece0',
      B: '#3a4152',
      F: '#f1ece0',
      G: '#7a4a32',
      Z: '#3a8fd9',
    },
    build: { head: 'ben', body: 'std', decals: 'ben', bottoms: 'shorts', sleeve: 0.55 },
    anims: {
      idle: {
        frames: [
          { R: REST, L: { el: [0.8, 5.5], hand: [-1.2, 8.5] }, props: [{ name: 'coffee', at: 'L', dx: 0, dy: -1 }] },
          {
            R: REST,
            L: { el: [0.8, 5.5], hand: [-1.2, 8.5] },
            hy: 1,
            props: [{ name: 'coffee', at: 'L', dx: 0, dy: -1 }],
          },
          {
            R: REST,
            L: { el: [1.6, 3], hand: [-2.5, -2.5] },
            hy: 0,
            props: [{ name: 'coffee', at: 'L', dx: 0, dy: -1 }],
          },
          {
            R: REST,
            L: { el: [1.6, 3], hand: [-2.5, -2.5] },
            hy: -1,
            props: [{ name: 'coffee', at: 'L', dx: 0, dy: -1 }],
            mark: 'note',
          },
        ],
        dt: [1, 0.8, 0.4, 0.8],
        racket: false,
      },
      walk: walk({ bounce: 1.2 }),
      swing: swing(),
      emote: cheer(),
    },
  },
  {
    id: 'jess',
    name: 'Jess',
    role: '年轻教练',
    line: '干劲十足，马尾甩起来',
    look: {
      S: SK[2],
      H: '#2a1d16',
      P: '#f4f0e6',
      T: '#2a8a86',
      C: '#f1ece0',
      B: '#f1ece0',
      F: '#f4f0e6',
      Q: '#e8582c',
    },
    build: { head: 'jess', body: 'slim', decals: 'jess', bottoms: 'shorts', sleeve: 0.45, wrist: true },
    carry: true,
    anims: {
      idle: {
        frames: [
          {
            dy: 1,
            R: { el: [0.4, 5], hand: [-1.5, 9] },
            L: { el: [0.2, 5], hand: [-2.5, 8.5] },
            racket: { ang: -70 },
            legR: { foot: [1, 0] },
            legL: { foot: [1, 0] },
          },
          {
            lift: 1,
            R: { el: [0.4, 5], hand: [-1.5, 9] },
            L: { el: [0.2, 5], hand: [-2.5, 8.5] },
            racket: { ang: -60 },
            legR: { foot: [1, 0] },
            legL: { foot: [1, 0] },
          },
          {
            dy: 1,
            R: { el: [0.4, 5], hand: [-1.5, 9] },
            L: { el: [0.2, 5], hand: [-2.5, 8.5] },
            racket: { ang: -80 },
            legR: { foot: [1, 0] },
            legL: { foot: [1, 0] },
          },
          {
            lift: 1,
            R: { el: [0.4, 5], hand: [-1.5, 9] },
            L: { el: [0.2, 5], hand: [-2.5, 8.5] },
            racket: { ang: -70 },
            legR: { foot: [1, 0] },
            legL: { foot: [1, 0] },
          },
        ],
        dt: 0.2,
        racket: true,
      },
      walk: walk({ racket: true, bounce: 1.4 }),
      swing: swing(),
      emote: cheer(true),
    },
  },
  {
    id: 'gus',
    name: 'Gus',
    role: '老场地工',
    line: '心累了，线还得画直',
    look: {
      S: SK[5],
      H: '#9a9a96',
      M: '#a2a29e',
      P: '#b8594a',
      T: '#7a5a3a',
      C: '#6a4a2e',
      B: '#3a3f4a',
      F: '#3a2a20',
    },
    build: { head: 'gus', body: 'wide', decals: 'gus', bottoms: 'pants', sleeve: 1, shoe: 'boot' },
    anims: {
      idle: {
        frames: [
          { R: REST, L: REST },
          { R: REST, L: REST, hy: 1 },
          { dy: 1, hy: 1, R: REST, L: REST },
          { dy: 1, hy: 2, R: { el: [2, 3], hand: [-1.5, -3.5] }, L: REST, mark: 'sigh' },
          { dy: 1, hy: 2, R: { el: [2, 3], hand: [-1.5, -3.5] }, L: REST, mark: 'sigh', markDy: -2 },
        ],
        dt: [1.2, 0.8, 0.4, 0.7, 0.9],
        racket: false,
      },
      walk: walk({ bounce: 0.5 }),
      swing: swing(),
      emote: angry(),
    },
  },
  {
    id: 'lily',
    name: 'Lily',
    role: '前台',
    line: '双语夜猫子，手机不离手',
    look: { S: SK[0], H: '#17171c', T: '#f4f1ea', C: '#2fa3a8', B: '#2e2e36', F: '#2e2e33' },
    build: { head: 'lily', body: 'slim', decals: 'lily', bottoms: 'pants', sleeve: 0.5 },
    anims: {
      idle: {
        frames: breathe({
          hy: 1,
          R: { el: [0.4, 5], hand: [-1.8, 7.5] },
          L: { el: [0.4, 5], hand: [-2.8, 7.5] },
          props: [{ name: 'phone', at: 'R', dx: -1, dy: -1 }],
        }).concat([
          {
            hy: 1,
            R: { el: [0.4, 5], hand: [-1.8, 7] },
            L: { el: [0.4, 5], hand: [-2.8, 7.5] },
            props: [{ name: 'phoneLit', at: 'R', dx: -1, dy: -1 }],
          },
          {
            hy: 1,
            R: { el: [0.4, 5], hand: [-1.8, 7.5] },
            L: { el: [0.4, 5], hand: [-2.8, 7.5] },
            props: [{ name: 'phoneLit', at: 'R', dx: -1, dy: -1 }],
            mark: 'heart',
          },
        ]),
        dt: [0.9, 0.9, 0.3, 0.8],
        racket: false,
      },
      walk: walk(),
      swing: swing(),
      emote: cheer(),
    },
  },
  {
    id: 'teodora',
    name: 'Teodora',
    role: '穿线师',
    line: '线不直，她不交拍',
    look: {
      S: SK[7],
      H: '#6a4a30',
      T: '#d9d3c6',
      C: '#c9c2b2',
      X: '#6e4aa6',
      B: '#3a3f4a',
      F: '#2e2e33',
      G: '#9a3a5a',
      Q: '#2a2a30',
    },
    build: { head: 'teodora', body: 'slim', decals: 'teodora', bottoms: 'pants', sleeve: 1.2 },
    anims: {
      idle: {
        frames: [
          {
            R: { el: [3, 3], hand: [3.5, -1.5] },
            L: { el: [-0.5, 4], hand: [-8.5, -0.5] },
            racket: { ang: 10 },
            props: [{ name: 'pliers', at: 'L', dx: 0, dy: 0 }],
          },
          {
            R: { el: [3, 3], hand: [3.5, -1.5] },
            L: { el: [-0.5, 4], hand: [-8.5, 0.5] },
            racket: { ang: 10 },
            props: [{ name: 'pliers', at: 'L', dx: 0, dy: 0 }],
            hy: 1,
          },
          {
            R: { el: [3, 3], hand: [3.5, -1.5] },
            L: { el: [-0.5, 4], hand: [-8, 1.5] },
            racket: { ang: 10 },
            props: [{ name: 'pliers', at: 'L', dx: 0, dy: 0 }],
            hx: -1,
          },
          {
            R: { el: [3, 3], hand: [3.5, -1.5] },
            L: { el: [-0.5, 4], hand: [-8.5, -0.5] },
            racket: { ang: 10 },
            mark: 'anger',
            props: [{ name: 'pliers', at: 'L', dx: 0, dy: 0 }],
          },
        ],
        dt: [0.8, 0.5, 0.5, 0.8],
        racket: true,
      },
      walk: walk(),
      swing: swing(),
      emote: angry(),
    },
  },
  {
    id: 'nadia',
    name: 'Nadia',
    role: '退役名将',
    line: '名字还能卖票，肩不行了',
    look: {
      S: SK[0],
      H: '#e6c98e',
      T: '#1d1d22',
      C: '#d6362f',
      B: '#1d1d22',
      F: '#f4f0e6',
      G: '#2a2630',
      X: '#e8487a',
      Q: '#d6362f',
    },
    build: { head: 'nadia', body: 'slim', decals: 'nadia', bottoms: 'skirt', sleeve: 0, wrist: true },
    carry: true,
    anims: {
      idle: {
        frames: [
          { R: REST, L: REST, racket: RACKET_DOWN },
          { R: { el: [3, 3], hand: [5, 7] }, L: REST, racket: { ang: 120 } },
          { R: { el: [3, -2.5], hand: [4, -8.5] }, L: REST, racket: { ang: 30 } },
          { R: { el: [1, -2], hand: [-1, -7] }, L: REST, racket: { ang: -10 }, hx: -1 },
          { R: REST, L: { el: [0.5, 4], hand: [-9, -0.5] }, racket: RACKET_DOWN, hx: -1, hy: 1, mark: 'sweat' },
        ],
        dt: [1, 0.3, 0.3, 0.3, 1],
        racket: true,
      },
      walk: walk({ racket: true }),
      swing: swing(),
      emote: cheer(true),
    },
  },
  {
    id: 'ray',
    name: 'Ray',
    role: '老场地主管',
    line: '记得每根水管，膝盖不行',
    look: {
      S: SK[4],
      H: '#ddd7ca',
      M: '#efebe2',
      Y: '#e6e1d6',
      P: '#7a5a3a',
      X: '#2a2a30',
      T: '#c9b48a',
      C: '#b09a6e',
      B: '#5a4a3a',
      F: '#3a2a20',
    },
    build: { head: 'ray', body: 'wide', decals: 'ray', bottoms: 'pants', sleeve: 1.1, shoe: 'boot', brace: 'R' },
    anims: {
      idle: {
        frames: [
          { R: REST, L: { el: [0.6, 6], hand: [1.6, 11.5] }, props: [{ name: 'cane', at: 'L', dx: 0, dy: 0 }] },
          { R: REST, L: { el: [0.6, 6], hand: [1.6, 11.5] }, hy: 1, props: [{ name: 'cane', at: 'L', dx: 0, dy: 0 }] },
          {
            dy: 3,
            lean: -1,
            R: { el: [1.5, 6], hand: [0.5, 12] },
            L: { el: [0.6, 6], hand: [1.6, 9] },
            props: [{ name: 'cane', at: 'L', dx: 0, dy: 0 }],
            legR: { knee: [0, 1] },
          },
          {
            dy: 3,
            lean: -1,
            hy: 1,
            R: { el: [1.5, 6], hand: [1, 12.5] },
            L: { el: [0.6, 6], hand: [1.6, 9] },
            props: [{ name: 'cane', at: 'L', dx: 0, dy: 0 }],
            legR: { knee: [0, 1] },
            mark: 'sweat',
          },
        ],
        dt: [1.2, 0.8, 0.45, 0.45],
        racket: false,
      },
      walk: walk({ limp: true, bounce: 0.5 }),
      swing: swing(),
      emote: cheer(),
    },
  },
  {
    id: 'mateo',
    name: 'Mateo',
    role: '球童',
    line: '16 岁，一放学就骑车来',
    look: { S: SK[4], H: '#2a1d16', T: '#4a6fa8', C: '#f4f0e6', B: '#2e2e33', F: '#f1ece0' },
    build: { head: 'mateo', body: 'teen', decals: 'mateo', bottoms: 'shorts', sleeve: 0.5 },
    anims: {
      idle: {
        frames: [
          { R: { el: [1, 5], hand: [-0.5, 8.5] }, L: REST, props: [{ name: 'ball', at: 'R', dx: 0, dy: -1 }] },
          { R: { el: [1.2, 3], hand: [-0.5, 2] }, L: REST, props: [{ name: 'ball', at: 'R', dx: 0, dy: -4 }] },
          { R: { el: [1.2, 3], hand: [-0.5, 3] }, L: REST, hy: -1, props: [{ name: 'ball', at: 'R', dx: 0, dy: -12 }] },
          { R: { el: [1.2, 3], hand: [-0.5, 3] }, L: REST, hy: -1, props: [{ name: 'ball', at: 'R', dx: 0, dy: -7 }] },
          { R: { el: [1, 5], hand: [-0.5, 8] }, L: REST, props: [{ name: 'ball', at: 'R', dx: 0, dy: -1 }] },
        ],
        dt: [0.6, 0.15, 0.3, 0.15, 0.6],
        racket: false,
      },
      walk: walk({ bounce: 1.2 }),
      swing: swing(),
      emote: cheer(),
    },
  },
  {
    id: 'director',
    name: '总监',
    role: '你',
    line: '你：拿着夹板的那个人',
    look: {
      S: SK[3],
      H: '#3b2a1e',
      T: '#24406a',
      C: '#d8c08a',
      B: '#c9b48a',
      F: '#f1ece0',
      G: '#1d1d22',
      Z: '#d8c08a',
      R: '#5a3a22',
    },
    build: { head: 'director', body: 'std', decals: 'director', bottoms: 'shorts', sleeve: 0.55 },
    anims: {
      idle: {
        frames: [
          { R: REST, L: { el: [0.6, 5.5], hand: [-1.5, 8.5] }, props: [{ name: 'clipboard', at: 'L', dx: -1, dy: 0 }] },
          {
            R: REST,
            L: { el: [0.6, 5.5], hand: [-1.5, 8.5] },
            hy: 1,
            props: [{ name: 'clipboard', at: 'L', dx: -1, dy: 0 }],
          },
          {
            R: { el: [0.4, 5.5], hand: [-3.5, 8] },
            L: { el: [0.6, 5.5], hand: [-1.5, 8.5] },
            hy: 1,
            props: [{ name: 'clipboard', at: 'L', dx: -1, dy: 0 }],
          },
          {
            R: REST,
            L: { el: [0.6, 5.5], hand: [-1.5, 8.5] },
            hx: 1,
            props: [{ name: 'clipboard', at: 'L', dx: -1, dy: 0 }],
          },
        ],
        dt: [1, 0.6, 0.6, 1],
        racket: false,
      },
      walk: walk(),
      swing: swing(),
      emote: cheer(),
    },
  },
  {
    id: 'kidA',
    name: 'Mia',
    role: '学员 · 8 岁',
    line: '拍子快比她高了',
    look: {
      S: SK[2],
      H: '#6a4a30',
      X: '#e05a8f',
      T: '#f08ab0',
      C: '#ffffff',
      B: '#f4f0e6',
      F: '#f4f0e6',
      Q: '#7a5ac4',
    },
    build: { head: 'kidA', body: 'kid', decals: 'kidA', bottoms: 'skirt', sleeve: 0.5 },
    carry: true,
    anims: {
      idle: {
        frames: [
          { R: { el: [0.4, 5], hand: [-1.5, 9] }, L: { el: [0.2, 5], hand: [-2.5, 8.5] }, racket: { ang: -70 } },
          {
            lift: 2,
            R: { el: [0.4, 5], hand: [-1.5, 9] },
            L: { el: [0.2, 5], hand: [-2.5, 8.5] },
            racket: { ang: -70 },
          },
          { R: { el: [0.4, 5], hand: [-1.5, 9] }, L: { el: [0.2, 5], hand: [-2.5, 8.5] }, racket: { ang: -70 } },
          { R: { el: [0.4, 5], hand: [-1.5, 9] }, L: { el: [0.2, 5], hand: [-2.5, 8.5] }, racket: { ang: -70 }, hy: 1 },
        ],
        dt: [0.25, 0.25, 0.25, 0.8],
        racket: true,
      },
      walk: walk({ racket: true, bounce: 1 }),
      swing: swing(true),
      emote: cheer(true),
    },
  },
  {
    id: 'kidB',
    name: 'Leo',
    role: '学员 · 9 岁',
    line: '只想扣杀',
    look: {
      S: SK[6],
      H: '#1d1d22',
      P: '#3c7a5a',
      T: '#f0a020',
      C: '#f4f0e6',
      B: '#2d3a5a',
      F: '#e8582c',
      Q: '#2a2a30',
    },
    build: { head: 'kidB', body: 'kid', decals: 'kidB', bottoms: 'shorts', sleeve: 0.5 },
    carry: true,
    anims: {
      idle: {
        frames: [
          { R: UP, L: REST, racket: { ang: 20 } },
          { lift: 1, R: { el: [-1, 2], hand: [-5, 4] }, L: REST, racket: { ang: -120 } },
          { R: REST, L: REST, racket: RACKET_DOWN },
          { R: REST, L: REST, racket: RACKET_DOWN, hy: 1 },
        ],
        dt: [0.35, 0.15, 0.6, 0.6],
        racket: true,
      },
      walk: walk({ racket: true, bounce: 1 }),
      swing: swing(true),
      emote: cheer(true),
    },
  },
  {
    id: 'retiree',
    name: 'Walt',
    role: '客人 · 退休',
    line: '每天第一场，防晒抹鼻尖',
    look: {
      S: SK[7],
      H: '#ebe7de',
      Y: '#f0ece4',
      P: '#f4f0e6',
      T: '#f2aebb',
      C: '#ffffff',
      B: '#f1ece0',
      K: '#ffffff',
      F: '#ffffff',
      Q: '#3a8fd9',
    },
    build: { head: 'retiree', body: 'wide', decals: 'retiree', bottoms: 'shorts', sleeve: 0.55, tallSocks: true },
    anims: {
      idle: {
        frames: [
          { R: REST, L: REST },
          { R: { el: [1.5, -4.5], hand: [-4.5, -10.5] }, L: { el: [1.5, -4.5], hand: [-4.5, -10.5] }, lift: 1 },
          { R: { el: [1.5, -4.5], hand: [-4.5, -10.5] }, L: { el: [1.5, -4.5], hand: [-4.5, -10.5] }, lean: 1, hx: 1 },
          {
            R: { el: [1.5, -4.5], hand: [-4.5, -10.5] },
            L: { el: [1.5, -4.5], hand: [-4.5, -10.5] },
            lean: -1,
            hx: -1,
          },
          { R: REST, L: REST, hy: 1 },
        ],
        dt: [1, 0.5, 0.6, 0.6, 0.8],
        racket: false,
      },
      walk: walk({ racket: true, bounce: 0.6 }),
      swing: swing(),
      emote: cheer(),
    },
  },
  {
    id: 'mom',
    name: 'Karen',
    role: '客人 · 网球妈妈',
    line: '一边等课一边约下一场',
    look: {
      S: SK[1],
      H: '#a8763c',
      T: '#7fc4e0',
      C: '#ffffff',
      B: '#f4f0e6',
      F: '#ffffff',
      G: '#3a2630',
      Z: '#2f7a49',
      Q: '#e05a8f',
    },
    build: { head: 'mom', body: 'slim', decals: 'mom', bottoms: 'skirt', sleeve: 0 },
    anims: {
      idle: {
        frames: [
          { R: REST, L: { el: [0.8, 5.5], hand: [-1, 8.5] }, props: [{ name: 'iced', at: 'L', dx: 0, dy: -1 }] },
          {
            R: { el: [2.5, -2], hand: [3, -8] },
            L: { el: [0.8, 5.5], hand: [-1, 8.5] },
            props: [{ name: 'iced', at: 'L', dx: 0, dy: -1 }],
          },
          {
            R: { el: [2.5, -2], hand: [5, -7.5] },
            L: { el: [0.8, 5.5], hand: [-1, 8.5] },
            props: [{ name: 'iced', at: 'L', dx: 0, dy: -1 }],
          },
          {
            R: { el: [2.5, -2], hand: [3, -8] },
            L: { el: [0.8, 5.5], hand: [-1, 8.5] },
            props: [{ name: 'iced', at: 'L', dx: 0, dy: -1 }],
          },
          { R: REST, L: { el: [0.8, 5.5], hand: [-1, 8.5] }, hy: 1, props: [{ name: 'iced', at: 'L', dx: 0, dy: -1 }] },
        ],
        dt: [1, 0.2, 0.2, 0.2, 1],
        racket: false,
      },
      walk: walk({ bounce: 1 }),
      swing: swing(),
      emote: cheer(true),
    },
  },
  {
    id: 'tourist',
    name: 'Hank',
    role: '客人 · 游客',
    line: '先拍照，再问门票',
    look: {
      S: '#f0bc98',
      H: '#a7742f',
      P: '#d9d3c6',
      T: '#2fa3a8',
      C: '#ffd04a',
      B: '#8a7a5a',
      F: '#6a4a30',
      Z: '#2a2a30',
    },
    build: { head: 'tourist', body: 'std', decals: 'tourist', bottoms: 'shorts', sleeve: 0.6, shoe: 'sandal' },
    anims: {
      idle: {
        frames: [
          { R: REST, L: REST },
          {
            R: { el: [2, 3], hand: [-1.5, -3] },
            L: { el: [2, 3], hand: [-3.5, -3] },
            props: [{ name: 'camera', at: 'R', dx: -1, dy: 0 }],
          },
          {
            R: { el: [2, 3], hand: [-1.5, -3] },
            L: { el: [2, 3], hand: [-3.5, -3] },
            props: [
              { name: 'camera', at: 'R', dx: -1, dy: 0 },
              { name: 'flash', at: 'R', dx: -2, dy: -3 },
            ],
          },
          {
            R: { el: [2, 3], hand: [-1.5, -3] },
            L: { el: [2, 3], hand: [-3.5, -3] },
            props: [{ name: 'camera', at: 'R', dx: -1, dy: 0 }],
          },
          { R: REST, L: REST, mark: 'note' },
        ],
        dt: [1, 0.5, 0.12, 0.4, 0.9],
        racket: false,
      },
      walk: walk({ bounce: 0.8 }),
      swing: swing(),
      emote: cheer(),
    },
  },
];

export const byId = (id: string): Member => {
  const m = CAST.find((c) => c.id === id);
  if (!m) throw new Error(`no member ${id}`);
  return m;
};

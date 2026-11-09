/**
 * 方向 D 的人物：每个主要人物一个体型模板（不是同一个身子换色），头是字符画，动作按各自的步态参数生成。
 * 字母是换色槽位（S 皮肤、H 头发、C 帽子、T 上衣、L 袖子、R 镶边、B 下装、K 袜子、F 鞋、N 包、W 白、E 眼睛），
 * 小写是暗面（光从左上来，右边暗）；数字是每个人自己的固定色（眼镜框、墨镜、口红、护具）。
 */
import type { SlotColors } from '@td/iso';
import { type Attachment, BASE_POSE, type Facing, type Head, type Pose, type Rig, type Template } from './rig';

export type ClipName = 'idle' | 'walk' | 'swing' | 'emote';

export interface Clip {
  readonly poses: readonly Pose[];
  readonly dts: readonly number[];
}

export interface CharDef {
  readonly id: string;
  readonly name: string;
  /** 一句话（≤14 字） */
  readonly line: string;
  /** 轮廓特征（说明用） */
  readonly sil: string;
  readonly rig: Rig;
  readonly slots: SlotColors;
  /** 走路速度（米/秒），场景用 */
  readonly speed: number;
  readonly clip: (name: ClipName, facing: Facing) => Clip;
  /** 每个朝向的帧数（预算用） */
}

const SKIN = ['#f1c9a5', '#e2b48c', '#c98e62', '#a86c45', '#7c4b2e'] as const;

/** 共用固定色 */
const PAL = {
  /** 眼镜框（Teodora 的红框） */
  '+': '#c8553d',
  '1': '#2c2a33',
  '2': '#bfe8ff',
  '3': '#a8743c',
  '4': '#d9786a',
  '5': '#3a2a24',
  '6': '#5a2a28',
  '7': '#9a4a3a',
  '8': '#2b3340',
  '9': '#3a7ad6',
};

type P = Partial<Pose>;
const pose = (o: P): Pose => ({ ...BASE_POSE, ...o });

/* ------------------------------------------------------------------ */
/* 通用动作：步态参数 → 4 帧走路；正手 4 帧；情绪 2 帧                     */
/* ------------------------------------------------------------------ */

interface Gait {
  stride: number;
  lift: number;
  bob: number;
  sway?: number;
  arm: number;
  /** 手抬高几格（跑步弯臂） */
  armUp?: number;
  dt: number | readonly number[];
  /** 一直保持的姿势（前倾、低头、手里的东西） */
  hold?: P;
  /** 跛：第三帧（坏腿着地）步子小、身子往下沉 */
  hitch?: boolean;
  /** 蹦跳：经过帧两脚离地 */
  skip?: boolean;
  /** 只摆远手（近手拿着东西） */
  nearFixed?: boolean;
  /** 每帧额外叠加 */
  per?: readonly P[];
}

function walk(A: number, g: Gait): Clip {
  const s = g.stride;
  const sw = g.sway ?? 0;
  const au = g.armUp ?? 0;
  const hy = (i: number) => (i % 2 ? -g.bob : 0);
  const hand = (x: number): Pose['hn'] => ({ x, y: A - au - (Math.abs(x) > 1 ? 1 : 0), ex: au ? -1 : 0 });
  const base = g.hold ?? {};
  const frames: P[] = [
    { fn: { x: s, lift: 0 }, ff: { x: -s, lift: 0 }, hn: hand(-g.arm), hf: hand(g.arm), hx: sw, hy: hy(0) },
    { fn: { x: 0, lift: 0 }, ff: { x: 0, lift: g.lift }, hn: hand(0), hf: hand(0), hy: hy(1) },
    { fn: { x: -s, lift: 0 }, ff: { x: s, lift: 0 }, hn: hand(g.arm), hf: hand(-g.arm), hx: -sw, hy: hy(2) },
    { fn: { x: 0, lift: g.lift }, ff: { x: 0, lift: 0 }, hn: hand(0), hf: hand(0), hy: hy(3) },
  ];
  if (g.hitch) {
    // 坏腿是近腿：近腿往前那一步小，身子往下一沉，头跟着点一下
    const f2 = frames[2] as P;
    f2.fn = { x: -1, lift: 0 };
    f2.ff = { x: 1, lift: 0 };
    f2.hy = 1;
    f2.headY = 1;
    (frames[3] as P).fn = { x: 0, lift: 0 };
  }
  if (g.skip) {
    for (const i of [1, 3]) {
      const f = frames[i] as P;
      f.fn = { x: 1, lift: 2 };
      f.ff = { x: -1, lift: 1 };
      f.hy = -2;
    }
  }
  const poses = frames.map((f, i) => {
    const o: P = { ...f, ...base, ...(g.per?.[i] ?? {}) };
    if (g.nearFixed && base.hn) o.hn = base.hn;
    // 弯臂的时候 hold 里的手不覆盖摆臂
    if (!g.nearFixed && base.hn === undefined) o.hn = f.hn;
    if (base.hy) o.hy = (f.hy ?? 0) + base.hy;
    return pose(o);
  });
  const dts = typeof g.dt === 'number' ? [g.dt, g.dt, g.dt, g.dt] : g.dt;
  return { poses, dts };
}

/** 正手：准备、引拍、击球、随挥 */
function swing(A: number, tw: number, facing: Facing, hold: P = {}): Clip {
  const f = facing === 'front';
  const poses: P[] = f
    ? [
        { hn: { x: -1, y: A - 3, ex: -1 }, hf: { x: 1, y: A - 3 }, racket: 'ul', knee: 1, hy: 1 },
        { hn: { x: -3, y: A - 4, ex: -1 }, hf: { x: 2, y: A - 3 }, racket: 'ul', lean: -1, fn: { x: -1, lift: 0 } },
        { hn: { x: 3, y: A - 3, ex: -1 }, hf: { x: 1, y: A - 2 }, racket: 'r', lean: 1, fn: { x: 1, lift: 0 } },
        { hn: { x: tw - 1, y: -1, ey: 1 }, hf: { x: 0, y: A - 2 }, racket: 'up', lean: 0, ff: { x: 1, lift: 1 } },
      ]
    : [
        { hn: { x: -1, y: A - 3, ex: 1 }, hf: { x: 1, y: A - 3 }, racket: 'up', knee: 1, hy: 1 },
        { hn: { x: 2, y: A - 3, ex: 1 }, hf: { x: -2, y: A - 3 }, racket: 'dr', lean: -1 },
        { hn: { x: 3, y: A - 4, ex: 1 }, hf: { x: -1, y: A - 2 }, racket: 'ur', lean: 1, fn: { x: 1, lift: 0 } },
        { hn: { x: -(tw - 1), y: -1, ey: 1 }, hf: { x: 0, y: A - 2 }, racket: 'ul', ff: { x: 1, lift: 1 } },
      ];
  return {
    poses: poses.map((p) => pose({ expr: 'focus', ...hold, ...p })),
    dts: [0.35, 0.18, 0.1, 0.35],
  };
}

function happy(A: number, hold: P = {}, oneArm = false): Clip {
  return {
    poses: [
      pose({
        ...hold,
        hn: { x: -1, y: -A + 1 },
        hf: oneArm ? { x: 0, y: A } : { x: 1, y: -A + 1 },
        hy: -2,
        fn: { x: 0, lift: 2 },
        ff: { x: 0, lift: 2 },
        expr: 'happy',
      }),
      pose({
        ...hold,
        hn: { x: -1, y: -2, ex: -1 },
        hf: oneArm ? { x: 0, y: A } : { x: 1, y: -2, ex: 1 },
        knee: 1,
        hy: 1,
        expr: 'happy',
      }),
    ],
    dts: [0.3, 0.25],
  };
}

function angry(A: number, hold: P = {}): Clip {
  // 双手叉腰、跺脚
  const hips: P = { hn: { x: -1, y: A - 3, ex: -2 }, hf: { x: 1, y: A - 3, ex: 2 } };
  return {
    poses: [
      pose({ ...hold, ...hips, fn: { x: 0, lift: 2 }, lean: 1, expr: 'angry' }),
      pose({ ...hold, ...hips, hy: 1, lean: 1, headY: 1, expr: 'angry' }),
    ],
    dts: [0.22, 0.4],
  };
}

/** 拿拍子站着：拍头立在身体外侧（不被身子挡住） */
const readyR = (A: number, f: Facing): P =>
  f === 'front'
    ? { hn: { x: -1, y: A - 3, ex: -1 }, racket: 'ul', hf: { x: 0, y: A - 2 } }
    : { hn: { x: 1, y: A - 3, ex: 1 }, racket: 'ur', hf: { x: 0, y: A - 2 } };

const still = (poses: P[], dts: number[]): Clip => ({ poses: poses.map(pose), dts });

/* ------------------------------------------------------------------ */
/* 附件                                                                */
/* ------------------------------------------------------------------ */

const ponytail: Attachment = {
  layer: 'mid',
  draw: (j) => {
    const up = j.pose.flags?.includes('pony-up');
    return up
      ? { rows: ['HHH.', '.HHh', '..h.'], x: j.head.x - 3, y: j.head.y + 1 }
      : { rows: ['.HH', 'HHh', 'Hh.', 'h..'], x: j.head.x - 2, y: j.head.y + 2 };
  },
};

/* ------------------------------------------------------------------ */
/* 人物                                                                */
/* ------------------------------------------------------------------ */

function mk(
  id: string,
  name: string,
  line: string,
  sil: string,
  rig: Rig,
  slots: SlotColors,
  speed: number,
  clip: CharDef['clip'],
): CharDef {
  return {
    id,
    name,
    line,
    sil,
    rig,
    slots: { outline: '#2a2238', eye: '#241c22', racket: '#3a3340', accent: '#dbe84a', ...slots },
    speed,
    clip,
  };
}

/* ---- Dale：宽身板、大肚子、短腿、帽子、白胡子；走路左右晃，闲着揉腰 ---- */
const DALE_T: Template = {
  id: 'broad',
  legLen: 6,
  legW: 2,
  hipHalf: 2,
  shoeW: 3,
  shorts: 6,
  torso: {
    front: ['.TTTWWTTt..', 'TTTTTTTTtt.', 'TTTTTTTTTtt', 'TTTTTTTTTTt', 'TTTTTTTTTTt', '.TTTTTTTTt.', '.RRRRRRRr..'],
    back: ['..TTTTTTt..', '.TTTTTTTtt.', 'TTTTTTTTTt.', 'TTTTTTTTTtt', 'TTTTTTTTTt.', '.TTTTTTTt..', '.BBBBBBBb..'],
  },
  shY: 1,
  shIn: 1,
  neck: 0,
  arm: 6,
  sleeve: 2,
};
const DALE_H: Head = {
  front: ['..CCCCC..', '.CCCCCCcc', '.HSSSSSS.', 'HsSSESES.', 'HsSSSSSSS', '.WWWW7WW.', '..WWWWW..'],
  back: ['..CCCCC..', '.CCCCCCcc', '.HHHHHHS.', 'HHHHHHHS.', 'HHHHHHSS.', '.HHHHWW..', '..hhhW...'],
  cx: 4,
};
const DALE = mk(
  'dale',
  'Dale',
  '老教练，腰不好',
  '宽、矮、肚子往前顶、帽檐',
  { tpl: DALE_T, head: DALE_H, pal: PAL },
  {
    skin: SKIN[0],
    hair: '#d8d2c6',
    white: '#ece8de',
    cap: '#4a6a94',
    shirt: '#7a2f2a',
    sleeve: '#7a2f2a',
    bottoms: '#4f5560',
    shoes: '#5a4a3a',
    racket: '#8a8f93',
  },
  0.9,
  (name, f) => {
    const A = DALE_T.arm;
    const hold: P = { lean: -1 };
    if (name === 'walk') return walk(A, { stride: 1, lift: 1, bob: 0, sway: 1, arm: 1, dt: 0.22, hold });
    if (name === 'swing') return swing(A, 11, f, hold);
    if (name === 'emote') return happy(A, hold, true);
    // 揉腰：手肘往后撑出去，身子往后仰
    const rub = (dy: number): P => ({
      lean: -2,
      headX: -1,
      hn: { x: -1, y: A - 3 + dy, ex: -2 },
      expr: 'sigh',
    });
    return still(
      [hold, { ...hold, expr: 'blink' }, rub(0), rub(-1), rub(0), rub(-1), hold],
      [1.2, 0.15, 0.5, 0.3, 0.3, 0.3, 0.6],
    );
  },
);

/* ---- Rosa：大草帽（帽檐比肩宽）、长袖、长裤、手套；结实；闲着抬手遮阳看天 ---- */
const ROSA_T: Template = {
  id: 'sturdy',
  legLen: 8,
  legW: 2,
  hipHalf: 1,
  shoeW: 3,
  shorts: 8,
  torso: {
    front: ['.RRRRr.', 'TTTTTTt', 'TTTTTTt', 'TTTTTTt', 'TTTTTTt', 'TTTTTTt', 'BBBBBBb'],
    back: ['.TTTTt.', 'TTTTTTt', 'TTTTTTt', 'TTTTTTt', 'TTTTTTt', 'TTTTTTt', 'BBBBBBb'],
  },
  shY: 1,
  shIn: 0,
  neck: 0,
  arm: 7,
  sleeve: 6,
};
const ROSA_H: Head = {
  front: ['...CCCC....', '..CcccCC...', 'CCCCCCCCCCc', '..HSSSSS...', '..HSESES...', '..sSSSSSS..', '...sSS7S...'],
  back: ['...CCCC....', '..CCCCCC...', 'cCCCCCCCCCc', '..HHHHHS...', '..HHHHHS...', '..HHHHHS...', '...hHHh....'],
  cx: 5,
};
const ROSA = mk(
  'rosa',
  'Rosa',
  '沙漠长大的维护工',
  '大草帽、长袖长裤、拄耙子',
  { tpl: ROSA_T, head: ROSA_H, pal: PAL },
  {
    skin: SKIN[3],
    hair: '#1c1712',
    cap: '#d9b56a',
    shirt: '#6f8a4a',
    sleeve: '#6f8a4a',
    trim: '#c8553d',
    bottoms: '#6a5440',
    shoes: '#5a3a22',
    wood: '#9a7448',
    metal: '#8c9298',
  },
  1.1,
  (name, f) => {
    const A = ROSA_T.arm;
    if (name === 'walk') return walk(A, { stride: 2, lift: 1, bob: 0, arm: 1, dt: 0.16 });
    if (name === 'swing') return swing(A, 7, f);
    if (name === 'emote') return happy(A);
    const rake: P = { pf: 'rake', hf: { x: 1, y: A - 1 } };
    // 抬手遮阳、看天：风沙要来她先知道
    const look = (hx: number): P => ({ ...rake, hn: { x: 3, y: -1, ex: -1 }, headY: -1, headX: hx, expr: 'focus' });
    return still([rake, { ...rake, expr: 'blink' }, look(0), look(1), look(0), rake], [1.4, 0.15, 0.6, 0.5, 0.5, 0.6]);
  },
);

/* ---- Ben：高、瘦、长胳膊长腿、连帽衫、乱翘的头发；端着咖啡，打哈欠伸懒腰 ---- */
const BEN_T: Template = {
  id: 'lanky',
  legLen: 10,
  legW: 2,
  hipHalf: 1,
  shoeW: 3,
  shorts: 10,
  torso: {
    front: ['TTTTt', 'TTRTt', 'TTRTt', 'TTTTt', 'TtttT', 'TTTTt', 'BBBBb'],
    back: ['TTTTt', 'TTTTt', 'TTTTt', 'TTTTt', 'TTTTt', 'TTTTt', 'BBBBb'],
  },
  shY: 0,
  shIn: 0,
  neck: 1,
  arm: 8,
  sleeve: 7,
};
const BEN_H: Head = {
  front: ['.H.H.H..', '.HHHHHH.', 'HHHHHHH.', 'HHSSSSS.', 'HSSESES.', 'HsSSSSSS', '.sSSS7S.', '..sSSS..'],
  back: ['.H.H.H..', '.HHHHHH.', 'HHHHHHH.', 'HHHHHHH.', 'HHHHHHS.', 'HHHHHHS.', '.hHHHhS.', '..sSSs..'],
  cx: 3,
};
const BEN = mk(
  'ben',
  'Ben',
  '早起的大学生前台',
  '最高最细、长胳膊、刺头',
  { tpl: BEN_T, head: BEN_H, pal: PAL },
  {
    skin: SKIN[1],
    hair: '#1f1a18',
    shirt: '#e6b03c',
    sleeve: '#e6b03c',
    trim: '#f3ecdc',
    bottoms: '#3a4760',
    shoes: '#f1ece0',
    racket: '#3a8fd9',
  },
  1.3,
  (name, f) => {
    const A = BEN_T.arm;
    if (name === 'walk') return walk(A, { stride: 2, lift: 1, bob: 1, arm: 2, dt: 0.15, hold: { headX: 1 } });
    if (name === 'swing') return swing(A, 5, f);
    if (name === 'emote') return happy(A);
    const cup: P = { pn: 'cup', hn: { x: 2, y: A - 3, ex: -1 } };
    const sip: P = { pn: 'cup', hn: { x: 4, y: -1, ex: -1 }, expr: 'blink', headX: -1 };
    const stretch: P = { hn: { x: 0, y: -A + 1 }, hf: { x: 0, y: -A + 1 }, hy: -1, expr: 'sigh', lean: -1 };
    return still(
      [cup, sip, cup, { ...cup, expr: 'blink' }, stretch, { ...stretch, hy: 0 }, cup],
      [0.9, 0.7, 0.6, 0.15, 0.6, 0.5, 0.4],
    );
  },
);

/* ---- Jess：运动身材、马尾、头带；走路是一蹦一蹦的小跑，闲着踮脚 ---- */
const JESS_T: Template = {
  id: 'athletic',
  legLen: 9,
  legW: 2,
  hipHalf: 1,
  shoeW: 3,
  shorts: 3,
  socks: 1,
  torso: {
    front: ['TTTTTt', 'TTTTTt', 'TTTTTt', '.TTTt.', '.TTTt.', 'BBBBBb'],
    back: ['TTTTTt', 'TTTTTt', 'TTTTTt', '.TTTt.', '.TTTt.', 'BBBBBb'],
  },
  shY: 0,
  shIn: 0,
  neck: 1,
  arm: 7,
  sleeve: 1,
};
const JESS_H: Head = {
  front: ['..HHHH..', '.RRRRRR.', 'HHHHSSS.', 'HHSESES.', 'HsSSSSSS', '.hSSS7S.', '..sSSS..'],
  back: ['..HHHH..', '.RRRRRR.', 'HHHHHHH.', 'HHHHHHH.', 'HHHHHHS.', '.hHHHhS.', '..sSSs..'],
  cx: 3,
};
const JESS = mk(
  'jess',
  'Jess',
  '干劲足的年轻教练',
  '马尾甩、弯臂小跑、踮脚',
  { tpl: JESS_T, head: JESS_H, pal: PAL, attach: [ponytail] },
  {
    skin: SKIN[2],
    hair: '#2a1d16',
    trim: '#f3f1ea',
    shirt: '#2a8a86',
    sleeve: '#2a8a86',
    bottoms: '#f1ece0',
    socks: '#ffffff',
    shoes: '#ffffff',
    racket: '#e8582c',
  },
  1.9,
  (name, f) => {
    const A = JESS_T.arm;
    const up = { flags: ['pony-up'] as const };
    if (name === 'walk')
      return walk(A, { stride: 2, lift: 2, bob: 2, arm: 2, armUp: 3, dt: 0.11, per: [{}, up, {}, up] });
    if (name === 'swing') return swing(A, 6, f);
    if (name === 'emote') return happy(A, up);
    const ready: P = readyR(A, f);
    return still(
      [ready, { ...ready, hy: -1, ...up }, ready, { ...ready, hy: -1, ...up }, { ...ready, expr: 'happy' }, ready],
      [0.25, 0.2, 0.25, 0.2, 0.6, 0.4],
    );
  },
);

/* ---- Gus：圆肩驼着、头缩进肩膀、胳膊垂得长、脖子上搭毛巾；拖着走，闲着叹气 ---- */
const GUS_T: Template = {
  id: 'slouch',
  legLen: 7,
  legW: 2,
  hipHalf: 1,
  shoeW: 3,
  shorts: 7,
  torso: {
    front: ['.TTTTTt.', 'TTTTTTTt', 'TTTTTTTt', 'TTTTTTTt', 'TTTTTTTt', '.TTTTTt.', '.BBBBBb.'],
    back: ['.TTTTTt.', 'TTTTTTTt', 'TTTTTTTt', 'TTTTTTTt', 'TTTTTTTt', '.TTTTTt.', '.BBBBBb.'],
  },
  shY: 1,
  shIn: 0,
  neck: 0,
  arm: 8,
  sleeve: 2,
};
const GUS_H: Head = {
  front: ['..CCCC..', '.CCCCCCc', 'HHSSSSS.', 'HsSESES.', 'HsSsSsSS', '.sHHHHs.', '..sS7s..'],
  back: ['..CCCC..', '.CCCCCCc', 'HHHHHHS.', 'HHHHHHS.', 'HhHHHhS.', '.sSSSSs.', '..sss...'],
  cx: 3,
};
const towel: Attachment = {
  layer: 'front',
  draw: (j) =>
    j.facing === 'front'
      ? { rows: ['WW', 'Ww', 'W.', 'w.'], x: j.shN.x, y: j.shN.y - 1 }
      : { rows: ['WW', 'wW', '.W', '.w'], x: j.shN.x - 1, y: j.shN.y - 1 },
};
const GUS = mk(
  'gus',
  'Gus',
  '心累的老场地工',
  '圆肩驼背、头缩着、毛巾',
  { tpl: GUS_T, head: GUS_H, pal: PAL, attach: [towel] },
  {
    skin: SKIN[3],
    hair: '#9a9a96',
    white: '#e8e2d2',
    cap: '#5a4a3a',
    shirt: '#7a6a4a',
    sleeve: '#7a6a4a',
    bottoms: '#3a3f4a',
    shoes: '#4a3a2a',
    wood: '#9a7448',
    main: '#c9a85a',
  },
  0.8,
  (name, f) => {
    const A = GUS_T.arm;
    const hold: P = { lean: 1, headY: 2, headX: 1 };
    if (name === 'walk')
      return walk(A, { stride: 1, lift: 0, bob: 0, arm: 0, dt: 0.24, hold: { ...hold, expr: 'blink' } });
    if (name === 'swing') return swing(A, 8, f, hold);
    if (name === 'emote') return angry(A, hold);
    const broom: P = { ...hold, pn: 'broom', hn: { x: 2, y: A - 2, ex: -1 } };
    return still(
      [
        broom,
        { ...broom, shUp: 1, headY: 1, expr: 'n' },
        { ...broom, shUp: 1, headY: 1, expr: 'blink' },
        { ...broom, shUp: -1, headY: 3, expr: 'sigh' },
        { ...broom, headY: 3, expr: 'sigh' },
        broom,
      ],
      [1.2, 0.5, 0.3, 0.7, 0.6, 0.5],
    );
  },
);

/* ---- Lily：苗条、长直发披到背上、齐刘海；走路也低头看手机，闲着歪着胯刷手机 ---- */
const LILY_T: Template = {
  id: 'slim',
  legLen: 8,
  legW: 2,
  hipHalf: 1,
  shoeW: 2,
  shorts: 4,
  torso: {
    front: ['TTTTt', 'TTTTt', 'TTTTt', '.TTt.', 'TTTTt', 'BBBBb'],
    back: ['TTTTt', 'TTTTt', 'TTTTt', '.TTt.', 'TTTTt', 'BBBBb'],
  },
  shY: 0,
  shIn: 0,
  neck: 1,
  arm: 7,
  sleeve: 1,
};
const LILY_H: Head = {
  front: ['..HHHH..', '.HHHHHH.', 'HHHHHHH.', 'HHSESES.', 'HHSSSSSS', 'HHsSS7S.', 'HHhsSS..', 'Hh......', 'h.......'],
  back: ['..HHHH..', '.HHHHHH.', 'HHHHHHH.', 'HHHHHHH.', 'HHHHHHH.', 'HHHHHHh.', 'HHHHHhh.', 'hHHHHh..', '.hhhh...'],
  cx: 3,
};
const LILY = mk(
  'lily',
  'Lily',
  '双语夜猫子前台',
  '长直发、低头、手机举在胸前',
  { tpl: LILY_T, head: LILY_H, pal: { ...PAL, '7': '#c44a5a' } },
  {
    skin: SKIN[0],
    hair: '#141016',
    shirt: '#3d3a6a',
    sleeve: '#3d3a6a',
    bottoms: '#20202a',
    shoes: '#d8d0c8',
  },
  1.0,
  (name, f) => {
    const A = LILY_T.arm;
    const phone: P = { pn: 'phoneUp', hn: { x: 3, y: 3, ex: -1 }, headX: 1, headY: 1 };
    if (name === 'walk') return walk(A, { stride: 1, lift: 1, bob: 0, arm: 1, dt: 0.18, hold: phone, nearFixed: true });
    if (name === 'swing') return swing(A, 5, f);
    if (name === 'emote') return happy(A);
    const lean: P = { ...phone, hx: -1, lean: 1, ff: { x: 1, lift: 0 }, hf: { x: 0, y: A - 2, ex: 1 } };
    return still(
      [
        lean,
        { ...lean, pn: 'phoneUp2' },
        lean,
        { ...lean, pn: 'phoneUp2', expr: 'blink' },
        { ...lean, expr: 'happy' },
        lean,
      ],
      [0.6, 0.3, 0.6, 0.3, 0.5, 0.5],
    );
  },
);

/* ---- Teodora：最娇小、头顶小发髻、眼镜、穿线围裙；步子小而快，闲着检查拍线 ---- */
const TEO_T: Template = {
  id: 'petite',
  legLen: 6,
  legW: 1,
  hipHalf: 1,
  shoeW: 2,
  shorts: 6,
  torso: {
    front: ['TTTt', 'NNNn', 'NNNn', 'NNNn', 'NNNn'],
    back: ['TTTt', 'TNTt', 'TTTt', 'TTTt', 'BBBb'],
  },
  shY: 0,
  shIn: 0,
  neck: 1,
  arm: 5,
  sleeve: 5,
};
const TEO_H: Head = {
  front: ['...HH...', '..HHHH..', '.HHHHHH.', 'HHHSSSS.', 'HS+E+E+.', 'HsSSSSSS', '.sSS7S..', '..sSS...'],
  back: ['...HH...', '..HHHH..', '.HHHHHH.', 'HHHHHHH.', 'HHHHHH+.', 'HHHHHHS.', '.hHHHs..', '..sSs...'],
  cx: 3,
};
const TEO = mk(
  'teodora',
  'Teodora',
  '挑剔的塞尔维亚穿线师',
  '最小个、发髻、眼镜、围裙',
  { tpl: TEO_T, head: TEO_H, pal: PAL },
  {
    skin: SKIN[0],
    hair: '#2a2024',
    shirt: '#e8e2d6',
    sleeve: '#e8e2d6',
    second: '#3a4a5a',
    bottoms: '#2a2a33',
    shoes: '#2a2a33',
    metal: '#a8b0b8',
    racket: '#c8553d',
  },
  1.2,
  (name, f) => {
    const A = TEO_T.arm;
    if (name === 'walk') return walk(A, { stride: 1, lift: 1, bob: 0, arm: 1, dt: 0.09 });
    if (name === 'swing') return swing(A, 4, f);
    if (name === 'emote') return angry(A);
    // 拍子举到眼前看线，另一只手拿穿线钳拽一下
    const look: P = { hn: { x: 6, y: 0, ex: -1 }, racket: 'ur', headX: 1, expr: 'focus' };
    const tug = (dy: number): P => ({ ...look, pf: 'pliers', hf: { x: 1, y: 1 + dy, ex: 1 } });
    return still(
      [look, tug(0), tug(1), tug(0), tug(1), { ...look, expr: 'blink' }, look],
      [0.8, 0.3, 0.2, 0.3, 0.2, 0.15, 0.6],
    );
  },
);

/* ---- Nadia：高、倒三角肩、发髻、无袖、右肩护具；大步走，闲着转肩 ---- */
const NADIA_T: Template = {
  id: 'pro',
  legLen: 10,
  legW: 2,
  hipHalf: 1,
  shoeW: 3,
  shorts: 3,
  socks: 1,
  torso: {
    front: ['TTTTTTTt', 'TTTTTTTt', '.TTTTTt.', '.TTTTTt.', '..TTTt..', '..TTTt..', '.BBBBBb.'],
    back: ['TTTTTTTt', 'TTTTTTTt', '.TTTTTt.', '.TTTTTt.', '..TTTt..', '..TTTt..', '.BBBBBb.'],
  },
  shY: 0,
  shIn: 0,
  neck: 1,
  arm: 8,
  sleeve: 0,
};
const NADIA_H: Head = {
  front: ['HH......', 'HHHHHH..', 'HHHHHHH.', 'HHSSSSS.', 'HSSESES.', 'HsSSSSSS', '.sSSS7S.', '..sSSS..'],
  back: ['.HH.....', 'HHHHHH..', 'HHHHHHH.', 'HHHHHHH.', 'HHHHHHS.', 'HhHHHhS.', '.hHHHsS.', '..sSSs..'],
  cx: 3,
};
const brace: Attachment = {
  layer: 'front',
  draw: (j) => ({ rows: ['99', '9.'], x: j.shN.x - (j.facing === 'front' ? 1 : 0), y: j.shN.y }),
};
const NADIA = mk(
  'nadia',
  'Nadia',
  '退役明星，肩有伤',
  '最高、倒三角、发髻、肩护具',
  { tpl: NADIA_T, head: NADIA_H, pal: PAL, attach: [brace] },
  {
    skin: SKIN[0],
    hair: '#d8b25a',
    shirt: '#f3f1ea',
    sleeve: '#f3f1ea',
    bottoms: '#22304a',
    socks: '#ffffff',
    shoes: '#22304a',
    racket: '#1f2a33',
  },
  1.5,
  (name, f) => {
    const A = NADIA_T.arm;
    if (name === 'walk')
      return walk(A, {
        stride: 3,
        lift: 1,
        bob: 1,
        arm: 2,
        dt: 0.15,
        hold: { lean: -1 },
        per: [{ shUpN: 1 }, {}, { shUpF: 1 }, {}],
      });
    if (name === 'swing') return swing(A, 8, f);
    if (name === 'emote') return happy(A, {}, true);
    // 转肩：远手扶着近肩，近肩一圈（抬、往后、落）
    const hold = (n: number, x: number): P => ({
      hf: f === 'front' ? { x: -6, y: 1, ex: 1 } : { x: 6, y: 1, ex: -1 },
      shUpN: n,
      hn: { x, y: A - n },
      expr: n ? 'focus' : 'n',
    });
    return still(
      [{ lean: -1 }, hold(0, 0), hold(1, -1), hold(2, 0), hold(1, 1), hold(0, 0), { lean: -1, expr: 'blink' }],
      [1.0, 0.3, 0.25, 0.25, 0.25, 0.3, 0.15],
    );
  },
);

/* ---- Ray：驼背、头往前探、拄拐杖、近腿护膝不弯；走路一瘸一沉 ---- */
const RAY_T: Template = {
  id: 'stooped',
  legLen: 7,
  legW: 2,
  hipHalf: 1,
  shoeW: 3,
  shorts: 7,
  braceNear: 'W',
  torso: {
    front: ['TTTTTt.', 'TTTTTTt', 'TTTTTTt', 'TTTTTTt', 'TTTTTTt', 'TTTTTt.', 'BBBBBb.'],
    back: ['TTTTTt.', 'TTTTTTt', 'TTTTTTt', 'TTTTTTt', 'TTTTTTt', 'TTTTTt.', 'BBBBBb.'],
  },
  shY: 1,
  shIn: 0,
  neck: 0,
  arm: 6,
  sleeve: 2,
};
const RAY_H: Head = {
  front: ['..SSSS..', '.SsSsSS.', 'HSSSSSS.', 'HHSESES.', 'HsSSSSSS', '.sSHHHS.', '..sS7S..'],
  back: ['..SSSS..', '.SSSSSS.', 'HSSSSSS.', 'HHHHHHS.', 'HHHHHHS.', '.hHHHhS.', '..hhhs..'],
  cx: 3,
};
const RAY = mk(
  'ray',
  'Ray',
  '膝盖不好的老主管',
  '驼背探头、拐杖、护膝',
  { tpl: RAY_T, head: RAY_H, pal: PAL },
  {
    skin: SKIN[2],
    hair: '#b8b4ac',
    white: '#e9e6dc',
    shirt: '#5a7a9a',
    sleeve: '#5a7a9a',
    bottoms: '#6a6a5a',
    shoes: '#3a2a22',
    metal: '#6a5a48',
  },
  0.7,
  (name, f) => {
    const A = RAY_T.arm;
    const hold: P = { lean: 2, headX: 1, headY: 1, knee: 1, pf: 'cane', hf: { x: 2, y: A } };
    if (name === 'walk')
      return walk(A, {
        stride: 2,
        lift: 1,
        bob: 0,
        arm: 1,
        dt: [0.2, 0.16, 0.34, 0.16],
        hitch: true,
        hold,
        per: [{ hf: { x: 3, y: A } }, {}, { hf: { x: 1, y: A } }, {}],
      });
    if (name === 'swing') return swing(A, 7, f, { lean: 1, headX: 1 });
    if (name === 'emote') return angry(A, { lean: 2, headX: 2 });
    // 揉膝盖：弯下去，近手按在护膝上
    const rub = (dy: number): P => ({
      ...hold,
      lean: 3,
      headX: 3,
      headY: 2,
      hn: { x: 1, y: A + 2 + dy, ex: -1 },
      expr: 'sigh',
    });
    return still(
      [hold, { ...hold, expr: 'blink' }, rub(0), rub(-1), rub(0), rub(-1), hold],
      [1.3, 0.15, 0.4, 0.3, 0.3, 0.3, 0.8],
    );
  },
);

/* ---- Mateo：16 岁、细长、大脚、一头乱卷毛；蹦着走，闲着抛球 ---- */
const MATEO_T: Template = {
  id: 'gangly',
  legLen: 10,
  legW: 1,
  hipHalf: 1,
  shoeW: 3,
  shorts: 4,
  socks: 2,
  torso: {
    front: ['TTTTt', 'TTTTt', 'TTTTt', 'TTTTt', 'TTTTt', 'BBBBb'],
    back: ['TTTTt', 'TTTTt', 'TTTTt', 'TTTTt', 'TTTTt', 'BBBBb'],
  },
  shY: 0,
  shIn: 0,
  neck: 1,
  arm: 8,
  sleeve: 2,
};
const MATEO_H: Head = {
  front: ['.H.HH.H.', 'HHHHHHH.', 'HHHHHHHH', 'HHHSSSS.', 'HHSESES.', '.sSSSSSS', '..sS7S..', '...ss...'],
  back: ['.H.HH.H.', 'HHHHHHH.', 'HHHHHHHH', 'HHHHHHH.', 'HHHHHHS.', '.hHHHhS.', '..hHHs..', '...ss...'],
  cx: 3,
};
const MATEO = mk(
  'mateo',
  'Mateo',
  '16 岁的球童',
  '细长腿、大脚、卷毛乱蓬',
  { tpl: MATEO_T, head: MATEO_H, pal: { ...PAL, '7': '#7a3a30' } },
  {
    skin: SKIN[3],
    hair: '#1a1210',
    shirt: '#c8553d',
    sleeve: '#c8553d',
    bottoms: '#2d3a5a',
    socks: '#ffffff',
    shoes: '#e8e2d6',
  },
  1.6,
  (name, f) => {
    const A = MATEO_T.arm;
    if (name === 'walk')
      return walk(A, {
        stride: 2,
        lift: 1,
        bob: 1,
        arm: 2,
        dt: 0.12,
        skip: true,
        per: [{}, { ball: { x: 0, y: -3 } }, {}, { ball: { x: 0, y: -6 } }],
      });
    if (name === 'swing') return swing(A, 5, f);
    if (name === 'emote') return happy(A);
    // 抛球：手往上一送，球飞高再落回手里
    const toss = (hy: number, by: number | null): P => ({
      hn: { x: 2, y: A - 3 - hy, ex: -1 },
      ...(by == null ? {} : { ball: { x: 0, y: -1 - by } }),
      headY: by != null && by > 4 ? -1 : 0,
    });
    return still(
      [toss(0, 0), toss(2, 0), toss(1, 4), toss(0, 8), toss(0, 10), toss(0, 8), toss(0, 4), toss(1, 0), toss(0, 0)],
      [0.5, 0.12, 0.1, 0.1, 0.14, 0.1, 0.1, 0.12, 0.5],
    );
  },
);

/* ---- 总监（玩家）：中等个子、整齐头发、Polo + 工牌、夹板；走路利索，闲着看夹板 ---- */
const DIR_T: Template = {
  id: 'average',
  legLen: 9,
  legW: 2,
  hipHalf: 1,
  shoeW: 3,
  shorts: 9,
  torso: {
    front: ['TWWTTt', 'TTRTTt', 'TTRTTt', 'TTWTTt', 'TTTTTt', 'TTTTTt', 'RRRRRr'],
    back: ['TTTTTt', 'TTTTTt', 'TTTTTt', 'TTTTTt', 'TTTTTt', 'TTTTTt', 'RRRRRr'],
  },
  shY: 0,
  shIn: 0,
  neck: 1,
  arm: 7,
  sleeve: 2,
};
const DIR_H: Head = {
  front: ['..HHHH..', '.HHHHHH.', 'HHhSSSS.', 'HSSESES.', 'HsSSSSSS', '.sSSS7S.', '..sSS...'],
  back: ['..HHHH..', '.HHHHHH.', 'HHHHHHH.', 'HHHHHHS.', 'HHHHHHS.', '.hHHHhS.', '..sSs...'],
  cx: 3,
};
const DIRECTOR = mk(
  'director',
  '总监',
  '你（可以拖到岗位上）',
  '中等身材、夹板、工牌',
  { tpl: DIR_T, head: DIR_H, pal: PAL },
  {
    skin: SKIN[1],
    hair: '#4a3020',
    shirt: '#22304a',
    sleeve: '#22304a',
    trim: '#d8c08a',
    bottoms: '#c9b48a',
    shoes: '#5a3a22',
  },
  1.4,
  (name, f) => {
    const A = DIR_T.arm;
    const clip: P = { pf: 'clip', hf: { x: -2, y: A - 3, ex: 1 } };
    if (name === 'walk')
      return walk(A, { stride: 2, lift: 1, bob: 1, arm: 1, dt: 0.14, hold: { pf: 'clip', hf: { x: 0, y: A - 1 } } });
    if (name === 'swing') return swing(A, 6, f);
    if (name === 'emote') return happy(A, {}, true);
    const read: P = { ...clip, headY: 1, headX: 1, hn: { x: 3, y: A - 3, ex: -1 } };
    return still(
      [clip, read, { ...read, hn: { x: 4, y: A - 4, ex: -1 } }, read, { ...clip, expr: 'blink' }],
      [0.9, 0.5, 0.3, 0.5, 0.15],
    );
  },
);

/* ---- 两个小孩：大头小身子，一高一矮 ---- */
const KID_S_T: Template = {
  id: 'kid-s',
  legLen: 3,
  legW: 1,
  hipHalf: 1,
  shoeW: 2,
  shorts: 1,
  torso: { front: ['TTTt', 'TTTt', 'TTTt', 'BBBb'], back: ['TTTt', 'TTTt', 'TTTt', 'BBBb'] },
  shY: 0,
  shIn: 0,
  neck: 0,
  arm: 3,
  sleeve: 1,
};
const KID_S_H: Head = {
  front: ['H.HHH.H', 'HHHHHHH', 'HHHSSSS', '.HSESES', '..SSSSS', '...S7S.'],
  back: ['H.HHH.H', 'HHHHHHH', 'HHHHHHH', '.HHHHHS', '..HHHhS', '...hs..'],
  cx: 4,
};
const KID_B_T: Template = {
  id: 'kid-b',
  legLen: 5,
  legW: 1,
  hipHalf: 1,
  shoeW: 2,
  shorts: 2,
  torso: { front: ['TTTTt', 'TTTTt', 'TTTTt', 'TTTTt', 'BBBBb'], back: ['TTTTt', 'TTTTt', 'TTTTt', 'TTTTt', 'BBBBb'] },
  shY: 0,
  shIn: 0,
  neck: 0,
  arm: 4,
  sleeve: 1,
};
const KID_B_H: Head = {
  front: ['.CCCC..', 'CCCCCCc', 'HSSSSS.', 'HSESES.', '.sSSSSS', '..s7S..'],
  back: ['.CCCC..', 'cCCCCCC', 'HHHHHS.', 'HHHHHS.', '.hHHHS.', '..hs...'],
  cx: 3,
};
const kidClip =
  (T: Template, tw: number, bouncy: boolean): CharDef['clip'] =>
  (name, f) => {
    const A = T.arm;
    if (name === 'walk') return walk(A, { stride: 1, lift: 1, bob: 1, arm: 1, dt: 0.1 });
    if (name === 'swing') return swing(A, tw, f);
    if (name === 'emote') return happy(A);
    const r: P = readyR(A, f);
    return bouncy
      ? still(
          [r, { ...r, hy: -1, fn: { x: 0, lift: 1 }, ff: { x: 0, lift: 1 } }, r, { ...r, expr: 'happy' }],
          [0.3, 0.2, 0.4, 0.4],
        )
      : still([r, { ...r, headX: 1 }, { ...r, expr: 'blink' }, { ...r, headX: -1 }], [0.6, 0.6, 0.15, 0.6]);
  };
const KID_S = mk(
  'kid_s',
  '小孩 · 6 岁',
  '青训最小的学员',
  '最矮、大头、两个小揪',
  { tpl: KID_S_T, head: KID_S_H, pal: PAL },
  {
    skin: SKIN[1],
    hair: '#2a1d16',
    shirt: '#e86a9a',
    sleeve: '#e86a9a',
    bottoms: '#f3ecdc',
    shoes: '#3a8fd9',
    racket: '#3a7ad6',
  },
  1.0,
  kidClip(KID_S_T, 4, true),
);
const KID_B = mk(
  'kid_b',
  '小孩 · 10 岁',
  '戴帽子的学员',
  '小个、帽子、拍子快够到头',
  { tpl: KID_B_T, head: KID_B_H, pal: PAL },
  {
    skin: SKIN[3],
    hair: '#1a1210',
    cap: '#3a8fd9',
    shirt: '#f2d23a',
    sleeve: '#f2d23a',
    bottoms: '#2d3a5a',
    shoes: '#f1ece0',
    racket: '#e8582c',
  },
  1.1,
  kidClip(KID_B_T, 5, false),
);

/* ---- 客人：退休老人、网球妈妈、游客 ---- */
const RET_T: Template = {
  id: 'round',
  legLen: 6,
  legW: 2,
  hipHalf: 1,
  shoeW: 3,
  shorts: 2,
  socks: 3,
  torso: {
    front: ['.TTTTt.', 'TTTTTTt', 'TTTTTTt', 'TTTTTTt', 'TTTTTTt', '.BBBBb.'],
    back: ['.TTTTt.', 'TTTTTTt', 'TTTTTTt', 'TTTTTTt', 'TTTTTTt', '.BBBBb.'],
  },
  shY: 1,
  shIn: 0,
  neck: 0,
  arm: 5,
  sleeve: 1,
};
const RET_H: Head = {
  front: ['..HHH...', '.HHHHH..', 'CCCCCCcc', 'HSSSSSS.', 'HsSESES.', 'HsSsSsSS', '.sSS7S..', '..sSS...'],
  back: ['..HHH...', '.HHHHH..', 'CCCCCCcc', 'HHHHHHS.', 'HHHHHHS.', 'HHHHHHS.', '.hHHHs..', '..sSs...'],
  cx: 3,
};
const RETIREE = mk(
  'retiree',
  '退休老人',
  '冬天来打球的会员',
  '矮圆、遮阳帽檐、高筒袜',
  { tpl: RET_T, head: RET_H, pal: PAL },
  {
    skin: SKIN[0],
    hair: '#f0ece4',
    cap: '#f3f1ea',
    shirt: '#e8a0a8',
    sleeve: '#e8a0a8',
    bottoms: '#f3f1ea',
    socks: '#ffffff',
    shoes: '#ffffff',
  },
  0.8,
  (name, f) => {
    const A = RET_T.arm;
    if (name === 'walk') return walk(A, { stride: 1, lift: 0, bob: 0, arm: 1, dt: 0.2 });
    if (name === 'swing') return swing(A, 7, f);
    if (name === 'emote') return angry(A);
    const cup: P = { pn: 'cup', hn: { x: 2, y: A - 2, ex: -1 } };
    return still(
      [cup, { ...cup, hn: { x: 4, y: -1, ex: -1 }, expr: 'blink' }, cup, { ...cup, headX: 1 }],
      [1.0, 0.8, 0.8, 0.8],
    );
  },
);
const MOM_T: Template = {
  id: 'tall-slim',
  legLen: 9,
  legW: 2,
  hipHalf: 1,
  shoeW: 2,
  shorts: 2,
  torso: {
    front: ['TTTTt', 'TTTTt', 'TTTTt', '.TTt.', 'BBBBb', 'BBBBb'],
    back: ['TTTTt', 'TTTTt', 'TTTTt', '.TTt.', 'BBBBb', 'BBBBb'],
  },
  shY: 0,
  shIn: 0,
  neck: 1,
  arm: 7,
  sleeve: 0,
};
const MOM_H: Head = {
  front: ['.HH.....', 'HHHHHH..', '.HHHHHH.', 'HHHSSSS.', 'HH88888.', 'HsSSSSSS', '.sSS7S..', '..sSS...'],
  back: ['.HH.....', 'HHHHHH..', '.HHHHHH.', 'HHHHHHH.', 'HHHHHH8.', 'HHHHHHS.', '.hHHHs..', '..sSs...'],
  cx: 3,
};
const tote: Attachment = {
  layer: 'front',
  draw: (j) => ({ rows: ['.N.N.', 'NNNNN', 'NNNNN', 'NNNNn', 'nnnnn'], x: j.shF.x - 2, y: j.hipY - 3 }),
};
const MOM = mk(
  'mom',
  '网球妈妈',
  '送孩子来上课',
  '大墨镜、高马尾、大托特包',
  { tpl: MOM_T, head: MOM_H, pal: { ...PAL, '7': '#c43a4a' }, attach: [tote] },
  {
    skin: SKIN[0],
    hair: '#b07a3a',
    shirt: '#f3f1ea',
    sleeve: '#f3f1ea',
    bottoms: '#e86a9a',
    shoes: '#f3f1ea',
    second: '#4fb3bf',
  },
  1.3,
  (name, f) => {
    const A = MOM_T.arm;
    if (name === 'walk') return walk(A, { stride: 2, lift: 1, bob: 0, arm: 1, dt: 0.13 });
    if (name === 'swing') return swing(A, 5, f);
    if (name === 'emote') return angry(A);
    const wave: P = { hn: { x: 1, y: -A + 1 }, expr: 'happy' };
    return still(
      [{ hn: { x: 1, y: A - 1 } }, { ...wave }, { ...wave, hn: { x: 2, y: -A + 1 } }, { ...wave }, { expr: 'blink' }],
      [1.2, 0.2, 0.2, 0.2, 0.2],
    );
  },
);
const TOUR_T: Template = {
  id: 'wide',
  legLen: 7,
  legW: 2,
  hipHalf: 2,
  shoeW: 3,
  shorts: 3,
  socks: 1,
  torso: {
    front: ['TTTTTTt', 'TTTTTTt', 'TTTTTTt', 'TTTTTTt', 'TTTTTTt', 'BBBBBBb'],
    back: ['TNTTTNt', 'TNNNNNt', 'TNNNNNt', 'TNNNNnt', 'TnnnnnT', 'BBBBBBb'],
  },
  shY: 0,
  shIn: 0,
  neck: 0,
  arm: 6,
  sleeve: 1,
};
const TOUR_H: Head = {
  front: ['..CCCC..', '.CCCCCC.', 'CCCCCCCC', '.HSSSSS.', '.SSESES.', '.sSSSSSS', '..sS7S..'],
  back: ['..CCCC..', '.CCCCCC.', 'CCCCCCCC', '.HHHHHS.', '.HHHHHS.', '.hHHHHS.', '..sss...'],
  cx: 3,
};
const pack: Attachment = {
  layer: 'back',
  draw: (j) => (j.facing === 'front' ? { rows: ['NN', 'NN', 'Nn', 'nn'], x: j.torso.x - 2, y: j.torso.y + 1 } : null),
};
const cam: Attachment = {
  layer: 'front',
  draw: (j) =>
    j.facing === 'front' && !j.pose.pn ? { rows: ['1..1', '.11.', '.12.'], x: j.torso.x + 2, y: j.torso.y } : null,
};
const TOURIST = mk(
  'tourist',
  '游客',
  '来看大赛场地的',
  '渔夫帽、背包、胸前相机',
  { tpl: TOUR_T, head: TOUR_H, pal: PAL, attach: [pack, cam] },
  {
    skin: SKIN[0],
    hair: '#8a5a3a',
    cap: '#c9c08a',
    shirt: '#4fb3bf',
    sleeve: '#4fb3bf',
    bottoms: '#c9b48a',
    socks: '#ffffff',
    shoes: '#5a4a3a',
    second: '#c8553d',
  },
  1.0,
  (name, f) => {
    const A = TOUR_T.arm;
    if (name === 'walk')
      return walk(A, {
        stride: 1,
        lift: 1,
        bob: 0,
        sway: 1,
        arm: 1,
        dt: 0.17,
        per: [{}, { headX: 1 }, {}, { headX: -1 }],
      });
    if (name === 'swing') return swing(A, 7, f);
    if (name === 'emote') return happy(A);
    const shoot: P = { pn: 'camera', hn: { x: 4, y: -2, ex: -1 }, hf: { x: -1, y: -2, ex: 1 }, headX: -1 };
    return still(
      [{ headX: 1 }, { headX: -1 }, shoot, { ...shoot, expr: 'blink' }, { expr: 'happy' }],
      [0.8, 0.8, 0.6, 0.15, 0.6],
    );
  },
);

export const CAST: readonly CharDef[] = [
  DALE,
  ROSA,
  BEN,
  JESS,
  GUS,
  LILY,
  TEO,
  NADIA,
  RAY,
  MATEO,
  DIRECTOR,
  KID_S,
  KID_B,
  RETIREE,
  MOM,
  TOURIST,
];

export const byId = (id: string): CharDef => CAST.find((c) => c.id === id) as CharDef;

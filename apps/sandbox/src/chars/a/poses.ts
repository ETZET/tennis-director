/**
 * 骨架姿势：每个动画是几帧 Pose（四肢相对肩、胯关节的像素偏移）+ 每帧时长。
 * 同一套姿势正面背面通用（compose 按朝向决定左右和前后层次），成人和小孩按臂长、腿长缩放。
 */
import type { Arm, Build, Item, Leg, Pose } from './body';

export interface Anim {
  frames: Pose[];
  /** 每帧秒数（一个数 = 每帧一样） */
  dt: number | number[];
}

export type Quirk =
  | 'rubBack'
  | 'shade'
  | 'sip'
  | 'bounce'
  | 'sigh'
  | 'phone'
  | 'inspect'
  | 'shoulder'
  | 'knee'
  | 'toss'
  | 'watch'
  | 'fidget'
  | 'lean'
  | 'call'
  | 'photo';

export interface Carry {
  hand: 'r' | 'l';
  item: Item;
  ang?: number;
}

/** 生成一个人的全部动画 */
export function anims(b: Build, quirk: Quirk, emo: 'cheer' | 'mad' | 'pump', carry?: Carry): Record<string, Anim> {
  const kid = !!b.kid;
  const q = (v: number) => (kid ? Math.round(v * 0.62) : v);
  const L = b.leg;
  const arm = (ex: number, ey: number, hx: number, hy: number, o: Partial<Arm> = {}): Arm => ({
    e: [q(ex), q(ey)],
    h: [q(hx), q(hy)],
    ...o,
  });
  const leg = (fx: number, fy: number, k?: [number, number]): Leg =>
    k ? { f: [fx, L + fy], k: [k[0], Math.round(L * 0.5) + k[1]] } : { f: [fx, L + fy] };
  const hang = (o: Partial<Arm> = {}) => arm(0, 5, 1, 9, o);
  // 举过头顶：小孩胳膊短、头大，竖直方向不缩
  const up = (hx: number, hy: number): Arm => ({ e: [q(hx), kid ? -3 : -4], h: [q(hx), kid ? hy + 1 : hy] });
  // 手里常拿的东西：没被这一帧别的动作占用就加上
  const withCarry = (p: Pose, busy: ('r' | 'l')[] = []): Pose => {
    if (!carry || busy.includes(carry.hand)) return p;
    const key = carry.hand === 'r' ? 'ar' : 'al';
    const a = p[key];
    if (a.item) return p;
    return { ...p, [key]: { ...a, item: carry.item, ang: carry.ang ?? a.ang } };
  };
  const racketR = (a: Arm, ang: number, behind?: boolean): Arm => ({ ...a, item: 'racket', ang, itemBehind: behind });

  const idle: Anim = {
    frames: [
      withCarry({ ar: hang(), al: hang() }),
      withCarry({ bob: 0, hy: 0, ar: arm(0, 5, 1, 8), al: arm(0, 5, 1, 8), face: 'n' }),
    ],
    dt: [1.4, 0.9],
  };

  const walk: Anim = {
    frames: [
      withCarry({ ar: arm(0, 5, -1, 8), al: arm(1, 4, 3, 8), ll: leg(0, 1), lr: leg(0, -2, [0, -1]) }),
      withCarry({ bob: -1, ar: hang(), al: hang(), ll: leg(0, 0), lr: leg(0, 0) }),
      withCarry({ ar: arm(1, 4, 3, 8), al: arm(0, 5, -1, 8), lr: leg(0, 1), ll: leg(0, -2, [0, -1]) }),
      withCarry({ bob: -1, ar: hang(), al: hang(), ll: leg(0, 0), lr: leg(0, 0) }),
    ],
    dt: 0.16,
  };

  const stance = { lr: leg(1, 0), ll: leg(1, 0) };
  const ready: Pose = {
    bob: 1,
    ...stance,
    ar: racketR(arm(-1, 4, -2, 7), -150),
    al: arm(-1, 4, -3, 7),
  };
  const fhB: Pose = {
    bob: 1,
    ...stance,
    ar: racketR(arm(3, 1, 6, -1), -150, true),
    al: arm(2, 3, 5, 3),
    face: 'look',
  };
  const fhC: Pose = {
    bob: 1,
    lr: leg(2, 0),
    ll: leg(0, 0),
    ar: racketR(arm(3, 4, 6, 6), 15),
    al: arm(1, 4, 0, 8),
    face: 'look',
  };
  const fhF: Pose = {
    bob: 0,
    lr: leg(1, -1, [0, -1]),
    ll: leg(1, 0),
    ar: racketR(arm(-1, 3, -7, 0), -120, true),
    al: arm(-1, 4, -3, 6),
  };
  const swing: Anim = { frames: [ready, fhB, fhC, fhF, ready], dt: [0.5, 0.28, 0.1, 0.4, 0.3] };

  const cheer: Anim =
    emo === 'mad'
      ? {
          frames: [
            { ar: arm(-1, 4, -5, 4), al: arm(-1, 5, -5, 5), face: 'mad' },
            { hx: 1, ar: arm(-1, 4, -5, 4), al: arm(-1, 5, -5, 5), face: 'mad', lr: leg(0, -2, [0, -1]) },
            { ar: arm(-1, 4, -5, 4), al: arm(-1, 5, -5, 5), face: 'mad' },
            { hx: -1, ar: arm(-1, 4, -5, 4), al: arm(-1, 5, -5, 5), face: 'mad', lr: leg(0, 0) },
          ],
          dt: [0.5, 0.18, 0.3, 0.18],
        }
      : emo === 'pump'
        ? {
            frames: [
              withCarry({ ar: arm(2, 2, 2, -2), al: hang(), face: 'happy' }, ['r']),
              withCarry({ bob: 1, ar: arm(2, 4, 1, 5), al: hang(), face: 'happy' }, ['r']),
            ],
            dt: [0.3, 0.3],
          }
        : {
            frames: [
              { ar: up(1, -9), al: up(1, -9), face: 'happy' },
              {
                bob: -2,
                ar: up(2, -10),
                al: up(2, -10),
                face: 'happy',
                lr: leg(0, -2),
                ll: leg(0, -2),
              },
            ],
            dt: [0.22, 0.22],
          };

  const quirks: Record<Quirk, () => Anim> = {
    // 揉老腰：右手背到身后，身子往后仰，皱眉
    rubBack: () => ({
      frames: [
        withCarry({ hx: -1, ar: arm(2, 4, -1, 8, { behind: true }), al: hang(), face: 'wince' }),
        withCarry({ hx: -1, ar: arm(2, 4, -1, 7, { behind: true }), al: hang(), face: 'wince' }),
        withCarry({ hx: -1, ar: arm(2, 4, -1, 9, { behind: true }), al: hang(), face: 'shut' }),
        withCarry({ ar: hang(), al: hang() }),
      ],
      dt: [0.35, 0.35, 0.35, 1.2],
    }),
    // 手搭凉棚看天边的风沙
    shade: () => ({
      frames: [
        withCarry({ ar: arm(3, 1, -2, -4), al: hang(), face: 'n' }, ['r']),
        withCarry({ hx: 1, ar: arm(3, 1, -1, -4), al: hang(), face: 'look' }, ['r']),
        withCarry({ ar: hang(), al: hang() }),
      ],
      dt: [0.9, 0.9, 1.0],
    }),
    // 喝一口咖啡
    sip: () => ({
      frames: [
        { ar: hang(), al: arm(1, 4, -2, 5, { item: 'cup' }) },
        { ar: hang(), al: arm(2, 3, -3, 0, { item: 'cup' }), face: 'shut' },
        { ar: hang(), al: arm(1, 4, -2, 5, { item: 'cup' }), face: 'happy' },
      ],
      dt: [1.0, 0.7, 0.9],
    }),
    // 踮脚蹦、转拍子
    bounce: () => ({
      frames: [
        withCarry({ ar: arm(1, 4, 0, 8), al: hang(), face: 'happy' }),
        withCarry({ bob: -1, ar: arm(1, 4, 0, 7), al: hang(), lr: leg(0, -1), ll: leg(0, -1), face: 'happy' }),
        withCarry({ ar: arm(1, 4, 0, 8), al: hang() }),
        withCarry({ bob: -1, ar: arm(1, 4, 0, 7), al: hang(), lr: leg(0, -1), ll: leg(0, -1) }),
      ],
      dt: 0.2,
    }),
    // 叹气：吸气耸肩，再垮下来，闭眼，嘴边一口白气
    sigh: () => ({
      frames: [
        withCarry({ ar: hang(), al: hang() }),
        withCarry({ bob: -1, ar: arm(0, 5, 1, 8), al: arm(0, 5, 1, 8), face: 'n' }),
        withCarry({
          bob: 1,
          hy: 1,
          ar: arm(0, 5, 1, 10),
          al: arm(0, 5, 1, 10),
          face: 'shut',
          fx: (g, at) => {
            if (at.facing !== 'front') return;
            g.set(at.mouth[0] + 2, at.mouth[1], 'W', 1);
            g.set(at.mouth[0] + 3, at.mouth[1] - 1, 'W', 1);
            g.set(at.mouth[0] + 3, at.mouth[1], 'W', 2);
          },
        }),
        withCarry({ bob: 1, hy: 1, ar: arm(0, 5, 1, 10), al: arm(0, 5, 1, 10), face: 'shut' }),
      ],
      dt: [1.0, 0.7, 0.5, 0.9],
    }),
    // 低头看手机，拇指点两下
    phone: () => ({
      frames: [
        { hy: 1, ar: arm(0, 5, -3, 6, { item: 'phone' }), al: arm(0, 5, -2, 7), face: 'down' },
        { hy: 1, ar: arm(0, 5, -3, 6, { item: 'phone' }), al: arm(0, 5, -2, 6), face: 'down' },
        { hy: 1, ar: arm(0, 5, -3, 6, { item: 'phone' }), al: arm(0, 5, -2, 7), face: 'happy' },
      ],
      dt: [0.8, 0.25, 0.9],
    }),
    // 把拍子举到眼前看拍线，另一只手捏着钳子
    inspect: () => ({
      frames: [
        withCarry({ ar: racketR(arm(2, 3, -1, -1), -95), al: hang(), face: 'mad' }),
        withCarry({ ar: racketR(arm(2, 3, -1, -2), -80), al: hang(), face: 'mad' }),
        withCarry({ ar: racketR(arm(2, 3, -1, -1), -100), al: hang(), face: 'look' }),
      ],
      dt: [0.7, 0.7, 0.9],
    }),
    // 抡一圈动过手术的肩膀，疼得一皱眉
    shoulder: () => ({
      frames: [
        withCarry({ ar: arm(1, -4, 1, -9), al: hang() }, ['r']),
        withCarry({ ar: arm(4, -1, 9, -1), al: hang(), face: 'wince' }, ['r']),
        withCarry({ ar: arm(2, 4, 3, 9), al: hang() }, ['r']),
        withCarry({ ar: hang(), al: arm(-1, 3, -6, 0), face: 'wince' }, ['r', 'l']),
      ],
      dt: [0.3, 0.3, 0.3, 1.0],
    }),
    // 弯腰揉膝盖
    knee: () => ({
      frames: [
        withCarry({ bob: 2, hy: 1, ar: arm(1, 4, 0, 10), al: arm(0, 5, -3, 10), lr: leg(0, 0, [0, 1]), face: 'wince' }),
        withCarry({ bob: 2, hy: 1, ar: arm(1, 4, 0, 11), al: arm(0, 5, -3, 11), lr: leg(0, 0, [0, 1]), face: 'shut' }),
        withCarry({ ar: hang(), al: hang() }),
      ],
      dt: [0.4, 0.4, 1.2],
    }),
    // 抛球：球在手上、往上、最高、落回来
    toss: () => {
      const ball = (dy: number) => (g: Parameters<NonNullable<Pose['fx']>>[0], at: { hr: [number, number] }) =>
        g.set(at.hr[0], at.hr[1] - 1 - dy, '7', 1);
      return {
        frames: [
          { ar: arm(1, 4, 0, 5), al: hang(), fx: ball(0) },
          { ar: arm(1, 4, 0, 4), al: hang(), fx: ball(5), face: 'up' },
          { ar: arm(1, 4, 0, 5), al: hang(), fx: ball(9), face: 'up' },
          { ar: arm(1, 4, 0, 5), al: hang(), fx: ball(5), face: 'up' },
        ],
        dt: 0.2,
      };
    },
    // 抬手看表
    watch: () => ({
      frames: [
        withCarry({ hy: 1, ar: hang(), al: arm(0, 5, -4, 4), face: 'down' }, ['l']),
        withCarry({ ar: hang(), al: hang() }),
      ],
      dt: [1.0, 1.4],
    }),
    // 小孩：拿拍子乱挥
    fidget: () => ({
      frames: [
        { ar: racketR(arm(1, 4, 1, 8), 70), al: hang() },
        { ar: racketR(arm(3, 2, 5, 3), -20), al: hang(), face: 'happy' },
        { ar: racketR(arm(-1, 3, -5, 2), -140), al: hang(), face: 'happy' },
        { ar: racketR(arm(1, 4, 1, 8), 70), al: hang() },
      ],
      dt: [0.6, 0.15, 0.3, 0.6],
    }),
    // 拄着拍子当拐棍，点头
    lean: () => ({
      frames: [
        { ar: racketR(arm(1, 4, 2, 8), 88), al: hang() },
        { hy: 1, ar: racketR(arm(1, 4, 2, 8), 88), al: hang(), face: 'shut' },
        { ar: racketR(arm(1, 4, 2, 8), 88), al: hang(), face: 'happy' },
      ],
      dt: [1.0, 0.5, 0.8],
    }),
    // 打电话：手机贴耳，另一只手叉腰
    call: () => ({
      frames: [
        { ar: arm(3, 4, 1, 7), al: arm(2, 2, -2, -4, { item: 'phone' }), face: 'talk' },
        { ar: arm(3, 4, 1, 7), al: arm(2, 2, -2, -4, { item: 'phone' }), face: 'n' },
        { hx: 1, ar: arm(3, 4, 1, 7), al: arm(2, 2, -2, -4, { item: 'phone' }), face: 'mad' },
      ],
      dt: [0.3, 0.3, 0.6],
    }),
    // 举相机拍照，闪一下
    photo: () => ({
      frames: [
        { ar: arm(1, 4, -3, 0, { item: 'camera' }), al: arm(1, 4, -3, 0), face: 'n' },
        {
          ar: arm(1, 4, -3, 0, { item: 'camera' }),
          al: arm(1, 4, -3, 0),
          fx: (g, at) => {
            if (at.facing !== 'front') return;
            const x = at.hr[0] + 3;
            const y = at.hr[1] - 1;
            g.set(x, y, 'Y', 1);
            g.set(x + 1, y - 1, 'Y', 1);
            g.set(x + 1, y + 1, 'Y', 1);
            g.set(x + 2, y, 'Y', 1);
          },
        },
        { ar: hang(), al: hang(), face: 'happy' },
      ],
      dt: [0.8, 0.12, 1.2],
    }),
  };

  return { idle, quirk: quirks[quirk](), walk, swing, emo: cheer };
}

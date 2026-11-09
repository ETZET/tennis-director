/**
 * 每个人的动作：按 Spec 的 idle / walk / emo 类型给出姿势序列，再拼成帧（body.ts 的 compose）。
 * 帧都是数据（姿势参数 → 字符画），没有图片。每帧烘焙一次后缓存。
 */
import type { BakedArt } from '@td/iso';
import type { Facing, Pose, Spec } from './body';
import { compose } from './body';
import { type Built, bake } from './grid';

export type AnimName = 'idle' | 'walk' | 'swing' | 'happy' | 'angry';
export const ANIMS: readonly AnimName[] = ['idle', 'walk', 'swing', 'happy', 'angry'];
export const ANIM_ZH: Record<AnimName, string> = {
  idle: '待机',
  walk: '走路',
  swing: '正手',
  happy: '高兴',
  angry: '生气',
};

export interface Anim {
  poses: readonly Pose[];
  /** 每帧秒数（可以每帧不同） */
  dt: readonly number[];
}

const still = (n: number, t: number) => new Array(n).fill(t) as number[];

function idle(s: Spec): Anim {
  const rk = s.racket ? 'down' : undefined;
  const base: Pose = { racket: rk };
  switch (s.idle) {
    case 'rubBack':
      // Dale：揉腰，皱一下眉
      return {
        poses: [
          { ...base },
          { ...base, bob: 0, fr: 'behind', face: 'n' },
          { ...base, bob: 1, fr: 'behind', face: 'wince' },
          { ...base, bob: 0, fr: 'behind', face: 'wince' },
          { ...base, fr: 'behind', face: 'n' },
        ],
        dt: [1.4, 0.3, 0.35, 0.35, 0.3],
      };
    case 'sigh':
      // Gus：长叹一口气，肩膀垮下去
      return {
        poses: [
          { face: 'n' },
          { face: 'oh', headDy: -1 },
          { face: 'sigh', bob: 1, headDy: 1 },
          { face: 'sigh', bob: 1, headDy: 1 },
          { face: 'blink' },
        ],
        dt: [1.4, 0.5, 0.5, 0.6, 0.2],
      };
    case 'phone':
      // Lily：低头看手机，偶尔抬眼
      return {
        poses: [
          { fr: 'chest', prop: 'fr', face: 'down' },
          { fr: 'chest', prop: 'fr', face: 'down', bob: 0 },
          { fr: 'chest', prop: 'fr', face: 'smile' },
          { fr: 'chest', prop: 'fr', face: 'down' },
        ],
        dt: [1.2, 0.6, 0.5, 0.8],
      };
    case 'toss':
      // Mateo：一只手抛球玩
      return {
        poses: [
          { fr: 'raise', ball: 0 },
          { fr: 'raise', ball: 2, face: 'n' },
          { fr: 'raise', ball: 4, face: 'oh' },
          { fr: 'raise', ball: 5, face: 'oh' },
          { fr: 'raise', ball: 4 },
          { fr: 'raise', ball: 2 },
          { fr: 'raise', ball: 0, bob: 1 },
        ],
        dt: [0.5, 0.1, 0.1, 0.14, 0.1, 0.1, 0.25],
      };
    case 'cane':
      // Ray：拄着拐杖，换一下重心，揉膝盖
      return {
        poses: [
          { rk: 'down', fr: 'cane' },
          { rk: 'down', fr: 'cane', bob: 1, face: 'squint' },
          { rk: 'down', fr: 'cane', bob: 1, face: 'squint', headDy: 1 },
          { rk: 'down', fr: 'cane' },
        ],
        dt: [1.2, 0.4, 0.6, 0.6],
      };
    case 'hips':
      // Nadia：叉腰，下巴抬起来，转一下肩
      return {
        poses: [
          { fr: 'hip', rk: 'down', racket: 'down', headDy: -1 },
          { fr: 'hip', rk: 'down', racket: 'down', headDy: -1, face: 'blink' },
          { fr: 'hip', rk: 'down', racket: 'down', headDy: -1 },
          { fr: 'hip', rk: 'down', racket: 'down', bob: 1, headDy: -1, face: 'smile' },
        ],
        dt: [1.5, 0.15, 0.9, 0.6],
      };
    case 'pliers':
      // Teodora：举起刚穿好的拍子对着光看线，另一只手拎着穿线钳；看不顺眼就皱眉
      return {
        poses: [
          { rk: 'raise', racket: 'up', fr: 'down', prop: 'fr', face: 'n' },
          { rk: 'raise', racket: 'up', fr: 'down', prop: 'fr', face: 'squint', headDy: 0 },
          { rk: 'raise', racket: 'up', fr: 'down', prop: 'fr', face: 'squint', bob: 1 },
          { rk: 'raise', racket: 'up', fr: 'down', prop: 'fr', face: 'angry' },
          { rk: 'down', racket: 'down', fr: 'down', prop: 'fr', face: 'blink' },
        ],
        dt: [0.9, 0.6, 0.6, 0.6, 0.5],
      };
    case 'coffee':
      // Ben：早上的咖啡，一口一口喝
      return {
        poses: [
          { fr: 'hold', prop: 'fr', face: 'smile' },
          { fr: 'chest', prop: 'fr', face: 'n' },
          { fr: 'face', prop: 'fr', face: 'blink' },
          { fr: 'chest', prop: 'fr', face: 'smile' },
        ],
        dt: [1, 0.3, 0.6, 0.6],
      };
    case 'bounce':
      // Jess / 小孩：原地弹两下，等不及上课
      return {
        poses: [{ ...base }, { ...base, bob: 1 }, { ...base, hop: 1, face: 'smile' }, { ...base, bob: 1 }],
        dt: [0.35, 0.15, 0.2, 0.15],
      };
    case 'clip':
      // 总监：看一眼夹板，再抬头
      return {
        poses: [
          { fr: 'chest', prop: 'fr', face: 'down' },
          { fr: 'chest', prop: 'fr', face: 'down' },
          { fr: 'chest', prop: 'fr', face: 'n' },
          { fr: 'chest', prop: 'fr', face: 'smile' },
        ],
        dt: [1, 0.4, 0.6, 0.6],
      };
    case 'photo':
      // 游客：举相机拍一张
      return {
        poses: [
          { face: 'smile' },
          { fr: 'face', face: 'wince' },
          { fr: 'face', face: 'wince', bob: 1 },
          { face: 'happy' },
        ],
        dt: [1, 0.5, 0.2, 0.6],
      };
    case 'fan':
      // 退休老人：拿手扇风，太热了
      return {
        poses: [
          { fr: 'raise', face: 'n' },
          { fr: 'raise', face: 'squint', headDy: 0 },
          { fr: 'raise', bob: 1 },
        ],
        dt: [0.3, 0.3, 0.3],
      };
    case 'rake':
      // Rosa：靠着耙子，看风
      return {
        poses: [
          { fr: 'hold', prop: 'fr' },
          { fr: 'hold', prop: 'fr', face: 'squint' },
          { fr: 'hold', prop: 'fr', face: 'squint', headDx: 0 },
          { fr: 'hold', prop: 'fr', face: 'blink' },
        ],
        dt: [1.2, 0.8, 0.6, 0.15],
      };
    default:
      return {
        poses: [{ ...base }, { ...base, bob: 1 }, { ...base }, { ...base, face: 'blink' }],
        dt: [0.7, 0.6, 0.9, 0.12],
      };
  }
}

function walk(s: Spec): Anim {
  const rk = s.racket ? 'down' : undefined;
  const hold = s.acc.includes('cane') ? 'cane' : s.idle === 'phone' ? 'chest' : s.idle === 'rake' ? 'hold' : null;
  const fr = (a: 'fwd' | 'back') => hold ?? a;
  const prop = hold && hold !== 'cane' ? ('fr' as const) : undefined;
  if (s.walk === 'limp') {
    // Ray：右膝不好，拐杖先点地，右腿拖一下
    return {
      poses: [
        { rk: 'fwd', fr: 'cane', caneDx: 1, legA: { lift: 0, dx: 0 }, legB: { lift: 1, dx: 0 } },
        { rk: 'down', fr: 'cane', caneDx: 0, bob: 1, legA: { lift: 0, dx: 0 }, legB: { lift: 0, dx: 0 } },
        { rk: 'back', fr: 'cane', caneDx: 0, legA: { lift: 1, dx: 0 }, legB: { lift: -1, dx: 0 }, face: 'wince' },
        { rk: 'down', fr: 'cane', caneDx: 0, bob: 1, legA: { lift: 0, dx: 0 }, legB: { lift: 0, dx: 0 } },
      ],
      dt: [0.24, 0.2, 0.34, 0.2],
    };
  }
  const k = s.walk === 'bouncy' || s.walk === 'kid' ? 1 : 0;
  const sh = s.walk === 'shuffle';
  const hd = sh ? 1 : 0;
  const rt = s.racket ? ('down' as const) : undefined;
  const back = sh ? 1 : 2;
  const fwdL = sh ? 0 : -1;
  return {
    poses: [
      {
        rk: 'back',
        fr: fr('fwd'),
        prop,
        racket: rt,
        headDy: hd,
        bob: 1,
        legA: { lift: fwdL, dx: 0 },
        legB: { lift: back, dx: 0 },
        face: sh ? 'down' : undefined,
      },
      {
        rk: 'down',
        fr: hold ?? 'down',
        prop,
        racket: rk,
        hop: k,
        headDy: hd,
        legA: { lift: 0, dx: 0 },
        legB: { lift: 1, dx: 0 },
        face: sh ? 'down' : undefined,
      },
      {
        rk: 'fwd',
        fr: fr('back'),
        prop,
        racket: rt,
        headDy: hd,
        bob: 1,
        legA: { lift: back, dx: 0 },
        legB: { lift: fwdL, dx: 0 },
        face: sh ? 'down' : undefined,
      },
      {
        rk: 'down',
        fr: hold ?? 'down',
        prop,
        racket: rk,
        hop: k,
        headDy: hd,
        legA: { lift: 1, dx: 0 },
        legB: { lift: 0, dx: 0 },
        face: sh ? 'blink' : undefined,
      },
    ],
    dt: still(4, sh ? 0.2 : s.walk === 'strut' ? 0.17 : 0.14),
  };
}

function swing(): Anim {
  // 正手：准备 → 引拍 → 击球 → 随挥 → 回位。平时不拿拍的人这一段也借一支拍子
  return {
    poses: [
      {
        forceRacket: true,
        rk: 'fwd',
        fr: 'fwd',
        racket: 'up',
        bob: 1,
        legA: { lift: 0, dx: -1 },
        legB: { lift: 0, dx: 1 },
      },
      {
        forceRacket: true,
        rk: 'outLow',
        fr: 'across',
        racket: 'back',
        lean: 1,
        legA: { lift: 0, dx: -1 },
        legB: { lift: 0, dx: 1 },
        face: 'squint',
      },
      {
        forceRacket: true,
        rk: 'across',
        fr: 'back',
        racket: 'across',
        lean: 0,
        bob: 1,
        legA: { lift: 0, dx: -1 },
        legB: { lift: 1, dx: 1 },
      },
      {
        forceRacket: true,
        rk: 'over',
        fr: 'down',
        racket: 'over',
        lean: -1,
        legA: { lift: 1, dx: -1 },
        legB: { lift: 0, dx: 1 },
      },
      {
        forceRacket: true,
        rk: 'fwd',
        fr: 'fwd',
        racket: 'up',
        bob: 0,
        legA: { lift: 0, dx: -1 },
        legB: { lift: 0, dx: 1 },
      },
    ],
    dt: [0.4, 0.3, 0.09, 0.3, 0.4],
  };
}

function happy(s: Spec): Anim {
  const r = s.racket ? 'up' : undefined;
  return {
    poses: [
      { rk: 'up', fr: 'up', racket: r, face: 'happy', bob: 1 },
      { rk: 'up', fr: 'up', racket: r, face: 'happy', hop: 2 },
      { rk: 'upOut', fr: 'upOut', racket: r, face: 'happy', hop: 1 },
      { rk: 'up', fr: 'up', racket: r, face: 'happy', bob: 1 },
    ],
    dt: [0.15, 0.18, 0.15, 0.2],
  };
}

function angry(s: Spec): Anim {
  const r = s.racket ? 'down' : undefined;
  return {
    poses: [
      { rk: 'fist', fr: 'fist', racket: r, face: 'angry' },
      { rk: 'fist', fr: 'fist', racket: r, face: 'angry', bob: 1, legA: { lift: 1, dx: 0 } },
      { rk: 'fist', fr: 'fist', racket: r, face: 'angry', bob: 1 },
      { rk: 'fist', fr: 'hip', racket: r, face: 'angry', headDy: 1 },
    ],
    dt: [0.25, 0.12, 0.18, 0.6],
  };
}

export function animOf(s: Spec, a: AnimName): Anim {
  switch (a) {
    case 'idle':
      return idle(s);
    case 'walk':
      return walk(s);
    case 'swing':
      return swing();
    case 'happy':
      return happy(s);
    case 'angry':
      return angry(s);
  }
}

/* ---------------- 帧缓存 ---------------- */

export interface Frames {
  readonly built: readonly Built[];
  readonly baked: readonly BakedArt[];
  readonly dt: readonly number[];
  readonly total: number;
}

const cache = new Map<string, Frames>();

export function frames(s: Spec, a: AnimName, f: Facing): Frames {
  const key = `${s.id}|${a}|${f}`;
  let v = cache.get(key);
  if (!v) {
    const an = animOf(s, a);
    const built = an.poses.map((p) => compose(s, f, p));
    const baked = built.map(bake);
    v = { built, baked, dt: an.dt, total: an.dt.reduce((x, y) => x + y, 0) };
    cache.set(key, v);
  }
  return v;
}

/** 时刻 t（秒）该放第几帧 */
export function frameAt(fr: Frames, t: number): number {
  let m = t % fr.total;
  for (let i = 0; i < fr.dt.length; i++) {
    m -= fr.dt[i];
    if (m < 0) return i;
  }
  return 0;
}

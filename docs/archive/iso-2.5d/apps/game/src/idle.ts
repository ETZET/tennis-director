import type { XZ } from '@td/shared';

/**
 * 闲着的人在画面上做什么（准则 6：没人派活时世界照样在动；也让玩家一眼看出"这个人闲着"）。
 *
 * 纯函数：同一个人、同一个游戏时刻永远给同样的结果，只读模拟（谁闲着、闲了多久由画面自己记），
 * 不进模拟、不决定任何数值。按游戏分钟分段：每段先在站位附近溜达到一个新地方，然后在那儿做一件小事；
 * 闲得越久越懒：先东张西望、伸懒腰，再掏手机，最后干脆坐在地上。
 */

export type IdleAct = 'stroll' | 'look' | 'phone' | 'fidget' | 'sit';

export interface IdlePlan {
  x: number;
  z: number;
  act: IdleAct;
  /** 站着时面朝哪儿（弧度）；走路时 null */
  face: number | null;
  /** 这一段的编号（换段时做一次手势） */
  block: number;
}

/** 一段多少游戏分钟（1× 下大约 7 秒） */
export const IDLE_BLOCK = 40;
/** 每段开头走路占多少 */
const WALK = 0.4;

function hash01(s: string, ...n: number[]): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  for (const x of n) {
    h ^= x | 0;
    h = Math.imul(h, 16777619);
    h ^= h >>> 13;
  }
  return ((h >>> 0) % 100000) / 100000;
}

const smooth = (u: number) => u * u * (3 - 2 * u);

/** 第 b 段溜达到哪儿：站位周围 radius 米以内（离站位至少 1.5 米），不往 away（地点中心：楼、球网）那边走 */
function spot(id: string, b: number, home: XZ, radius: number, away: XZ | null): XZ {
  const a = hash01(id, b, 1) * Math.PI * 2;
  const r = 1.5 + hash01(id, b, 2) * Math.max(0, radius - 1.5);
  let dx = Math.cos(a) * r;
  let dz = Math.sin(a) * r;
  if (away && dx * (away.x - home.x) + dz * (away.z - home.z) > 0) {
    dx = -dx;
    dz = -dz;
  }
  return { x: home.x + dx, z: home.z + dz };
}

/** 闲了 idleFor 分钟以后这一段做什么 */
function pickAct(id: string, b: number, idleFor: number, canPhone: boolean): IdleAct {
  const u = hash01(id, b, 3);
  const table: [IdleAct, number][] =
    idleFor < 90
      ? [
          ['look', 0.5],
          ['fidget', 0.25],
          ['phone', 0.25],
        ]
      : idleFor < 300
        ? [
            ['look', 0.25],
            ['phone', 0.4],
            ['fidget', 0.2],
            ['sit', 0.15],
          ]
        : [
            ['sit', 0.45],
            ['phone', 0.35],
            ['fidget', 0.2],
          ];
  let acc = 0;
  for (const [act, w] of table) {
    acc += w;
    if (u < acc) return act === 'phone' && !canPhone ? 'look' : act;
  }
  return 'look';
}

/**
 * time：带零头的游戏分钟；idleFor：已经闲了多少游戏分钟；home：站位；
 * radius：溜达的范围（闲着 6 米左右；在岗但岗位没到时段的人小一点）；away：别往那边走（地点中心）
 */
export function idlePlan(
  id: string,
  time: number,
  idleFor: number,
  home: XZ,
  canPhone: boolean,
  radius = 6,
  away: XZ | null = null,
): IdlePlan {
  const phase = hash01(id, 0) * IDLE_BLOCK;
  const k = (time + phase) / IDLE_BLOCK;
  const b = Math.floor(k);
  const f = k - b;
  // 刚闲下来的第一段从站位出发
  const fresh = idleFor < f * IDLE_BLOCK + 1;
  const from = fresh ? home : spot(id, b - 1, home, radius, away);
  const to = spot(id, b, home, radius, away);
  if (f < WALK) {
    const u = smooth(f / WALK);
    return { x: from.x + (to.x - from.x) * u, z: from.z + (to.z - from.z) * u, act: 'stroll', face: null, block: b };
  }
  const act = pickAct(id, b, idleFor, canPhone);
  // 东张西望：段中间换一次方向
  const turn = act === 'look' && f > 0.7 ? 4 : 0;
  return { x: to.x, z: to.z, act, face: hash01(id, b, 5 + turn) * Math.PI * 2, block: b };
}

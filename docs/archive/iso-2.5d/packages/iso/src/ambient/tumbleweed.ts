import { mulberry32, range } from '@td/shared';
import { TUMBLEWEED, TUMBLEWEED_SMALL } from '../art/creatures/tumbleweed';
import type { ArtAnim, Facing } from '../art/format';
import type { Node } from '../core/graph';
import { Critter } from './critter';

export interface TumbleBounds {
  readonly x0: number;
  readonly x1: number;
  readonly z0: number;
  readonly z1: number;
}

export interface Tumbleweed {
  readonly g: Node;
  /** wind 0 无风 .. 1 大风：决定滚多快、蹦多高；rain 0..1 压住（湿了滚不动） */
  update(dt: number, now: number, wind?: number, rain?: number): void;
}

export interface TumbleweedOptions {
  /** 风往哪吹（xz，默认西风往东 +x） */
  dir?: { x: number; z: number };
  /** 小一号的素材 */
  small?: boolean;
  /** 画面随机的种子（只决定画面） */
  seed?: number;
}

/** 滚动的四帧做成一个"动画"，两个朝向共用（乱枝团没有正反面） */
const rollAnim = (small: boolean): Record<Facing, ArtAnim> => {
  const a: ArtAnim = { frames: small ? TUMBLEWEED_SMALL : TUMBLEWEED, dt: 1 };
  return { front: a, back: a };
};
const ROLL = rollAnim(false);
const ROLL_SMALL = rollAnim(true);

/**
 * 一棵风滚草（荒了的区域用）：顺着风在 bounds 里滚，一蹦一蹦；滚出下风的边就缩小消失，
 * 再从上风的边随机一处冒出来。
 */
export function createTumbleweed(
  scene: Node,
  groundY: (x: number, z: number) => number,
  bounds: TumbleBounds,
  o: TumbleweedOptions = {},
): Tumbleweed {
  const rand = mulberry32(o.seed ?? 0x7b1e);
  const R = (a: number, b: number) => range(rand, a, b);
  const dl = Math.hypot(o.dir?.x ?? 1, o.dir?.z ?? 0) || 1;
  const dir = { x: (o.dir?.x ?? 1) / dl, z: (o.dir?.z ?? 0) / dl };
  const g = new Critter(o.small ? ROLL_SMALL : ROLL, undefined, 0.35);
  g.name = 'tumbleweed';
  g.dir.x = dir.x;
  g.dir.z = dir.z;
  scene.add(g);
  const pos = { x: R(bounds.x0, bounds.x1), z: R(bounds.z0, bounds.z1) };
  let v = R(0.8, 1.2);
  let phase = R(0, 6);
  let rolled = 0;
  let fade = 1;
  let dying = false;

  /** 从上风那条边冒出来 */
  const respawn = () => {
    if (Math.abs(dir.x) >= Math.abs(dir.z)) {
      pos.x = dir.x > 0 ? bounds.x0 : bounds.x1;
      pos.z = R(bounds.z0, bounds.z1);
    } else {
      pos.z = dir.z > 0 ? bounds.z0 : bounds.z1;
      pos.x = R(bounds.x0, bounds.x1);
    }
    v = R(0.8, 1.2);
    phase = R(0, 6);
    fade = 0;
    dying = false;
  };
  const inside = (x: number, z: number) => x >= bounds.x0 && x <= bounds.x1 && z >= bounds.z0 && z <= bounds.z1;

  return {
    g,
    update(dt, now, wind = 0.4, rain = 0) {
      const step = Math.min(dt, 0.1);
      const calm = 1 - Math.min(1, rain * 1.5);
      const W = Math.max(0, Math.min(1, wind)) * calm;
      const sp = v * (0.3 + 3.2 * W) * (0.3 + 0.7 * calm);
      const s = sp * step;
      // 走一点之字（侧风），不出界
      const side = Math.sin(now * 0.5 + phase) * 0.35;
      pos.x += dir.x * s - dir.z * side * s;
      pos.z += dir.z * s + dir.x * side * s;
      rolled += s;
      phase += s * 1.8;
      if (!dying && !inside(pos.x, pos.z)) dying = true;
      // 冒出来时由小变大、出界时缩小消失（整数档：size 只有 0 和 1）
      fade = dying ? fade - step * 3 : Math.min(1, fade + step * 3);
      if (dying && fade <= 0) respawn();
      g.size = fade > 0.5 ? 1 : 0;
      // 蹦：着地一下、弹起来，风越大蹦得越高
      g.lift = Math.abs(Math.sin(phase)) * (0.08 + 0.55 * W);
      // 每滚过约四分之一圈换一帧
      g.t = Math.floor(rolled / 0.45);
      g.position.set(pos.x, groundY(pos.x, pos.z), pos.z);
    },
  };
}

/** 一片荒地上的几棵风滚草，一起更新。 */
export function createTumbleweeds(
  scene: Node,
  groundY: (x: number, z: number) => number,
  bounds: TumbleBounds,
  count: number,
  o: TumbleweedOptions = {},
): Tumbleweed[] {
  const seed = o.seed ?? 0x7b1e;
  return Array.from({ length: count }, (_, i) =>
    createTumbleweed(scene, groundY, bounds, { ...o, seed: seed + i * 977, small: o.small ?? i % 3 === 2 }),
  );
}

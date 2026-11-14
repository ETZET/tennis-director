import { describe, expect, it } from 'vitest';
import { rngOf } from '../../clubsite/cast/rng';
import {
  arrowOf,
  BLOW,
  backTarget,
  blowForce,
  CLEAN_PTS,
  coverage,
  densest,
  FULL_BONUS,
  freshTargets,
  GRID,
  gustDir,
  gustPlan,
  inRect,
  LEAVES,
  LEAVES_GUTTER,
  type Leaf,
  launchTo,
  leafAt,
  PER_SEC,
  pickBack,
  scatterLeaves,
  settle,
  stepLeaves,
} from './rules';

const COURT = { x0: -11.885, x1: 11.885, z0: -26.485, z1: -15.515 };
const BOX = { x0: -25.5, x1: 17.7, z0: -29.75, z1: -12.25 };
const NET = { x: 0, z0: -27.4, z1: -14.6, h: 0.95 };
const still = () => 0.5;

/** 跑 sec 秒（每步 1/60） */
const run = (leaves: Leaf[], sec: number, env: Partial<Parameters<typeof stepLeaves>[2]> = {}) => {
  const exits: number[] = [];
  const enters: number[] = [];
  for (let t = 0; t < sec; t += 1 / 60) {
    const ev = stepLeaves(leaves, 1 / 60, { court: COURT, box: BOX, net: NET, blow: null, rng: still, ...env });
    exits.push(...ev.exits);
    enters.push(...ev.enters);
  }
  return { exits, enters };
};
const blowAt = (x: number, z: number, dx: number, dz: number) => ({ x, z, dx, dz, ...BLOW });

describe('blowForce', () => {
  it('锥里有力、越近越猛；锥外、身后没有', () => {
    const b = blowAt(0, 0, 0, 1);
    expect(blowForce(b, 0, 1).f).toBeGreaterThan(blowForce(b, 0, 3).f);
    expect(blowForce(b, 0, 3).f).toBeGreaterThan(0);
    expect(blowForce(b, 0, -1).f).toBe(0);
    expect(blowForce(b, 0, BLOW.range + 0.1).f).toBe(0);
    expect(blowForce(b, 3, 0.5).f).toBe(0);
    // 锥心比锥边猛
    const edge = Math.sin(BLOW.half * 0.95) * 2;
    expect(blowForce(b, 0, 2).f).toBeGreaterThan(blowForce(b, edge, Math.cos(BLOW.half * 0.95) * 2).f);
  });
});

describe('stepLeaves', () => {
  it('锥里的叶子顺着风走，停下来（摩擦）；身后的不动', () => {
    const ahead = leafAt(0, -21, 0, 0, COURT);
    const behind = leafAt(0, -23, 0, 0, COURT);
    const ls = [ahead, behind];
    run(ls, 0.5, { blow: blowAt(0.3, -22, 0, 1) });
    expect(ahead.z).toBeGreaterThan(-21);
    expect(behind.z).toBe(-23);
    run(ls, 4);
    expect(Math.hypot(ahead.vx, ahead.vz)).toBe(0);
    expect(ahead.y).toBe(0);
  });

  it('吹过边线（过线 0.3 米）才算出界，只算一次；再落回场里算进场', () => {
    const L = leafAt(3, -16.5, 0, 0, COURT);
    expect(L.on).toBe(true);
    const a = run([L], 2.5, { blow: blowAt(3, -18, 0, 1) });
    expect(L.z).toBeGreaterThan(COURT.z1 + 0.3);
    expect(a.exits).toEqual([0]);
    expect(L.on).toBe(false);
    // 扔回场里
    launchTo(L, 3, -20, 0.05, 2.2);
    const b = run([L], 3);
    expect(b.enters).toEqual([0]);
    expect(L.on).toBe(true);
  });

  it('贴地的叶子过不了网；墙挡住', () => {
    const L = leafAt(-1, -21, 0, 0, COURT);
    run([L], 2, { blow: blowAt(-2.2, -21, 1, 0) });
    expect(L.x).toBeLessThan(NET.x);
    const W = leafAt(15, -20, 0, 0, COURT);
    run([W], 3, { blow: blowAt(13.5, -20, 1, 0) });
    expect(W.x).toBeLessThanOrEqual(BOX.x1);
  });

  it('同样的种子同样的结果（随机只走传进来的流）', () => {
    const mk = () => [leafAt(0, -20, 0, 0, COURT), leafAt(0.4, -19.6, 1, 1, COURT)];
    const a = mk();
    const b = mk();
    run(a, 1, { blow: blowAt(0, -21.5, 0, 1), rng: rngOf(1, 't') });
    run(b, 1, { blow: blowAt(0, -21.5, 0, 1), rng: rngOf(1, 't') });
    expect(a).toEqual(b);
  });

  it('走过去的总监会把脚边的叶子踢开', () => {
    const L = leafAt(0, -20, 0, 0, COURT);
    stepLeaves([L], 1 / 60, {
      court: COURT,
      box: BOX,
      net: null,
      blow: null,
      kick: { x: 0, z: -20.2, vx: 0, vz: 3, r: 0.45 },
      rng: still,
    });
    expect(L.vz).toBeGreaterThan(0);
  });
});

describe('scatterLeaves', () => {
  it('同一个种子同样的叶子；场上 LEAVES 片都在线里，场边 LEAVES_GUTTER 片都在线外、墙里', () => {
    const a = scatterLeaves(rngOf(1, 'blower', 'leaves:1'), COURT, BOX, LEAVES, LEAVES_GUTTER, { netX: 0 });
    const b = scatterLeaves(rngOf(1, 'blower', 'leaves:1'), COURT, BOX, LEAVES, LEAVES_GUTTER, { netX: 0 });
    expect(a).toEqual(b);
    expect(a.filter((L) => L.on).length).toBe(LEAVES);
    expect(a.length).toBe(LEAVES + LEAVES_GUTTER);
    for (const L of a) {
      expect(inRect(BOX, L.x, L.z)).toBe(true);
      if (L.on) expect(Math.abs(L.x)).toBeGreaterThan(0.19);
      else expect(inRect(COURT, L.x, L.z, 0.6)).toBe(false);
    }
  });
});

describe('coverage', () => {
  it('没叶子 = 全干净；一片叶子脏一格；场外的不算；沙堆压的格子也脏', () => {
    const total = GRID.gx * GRID.gz;
    expect(coverage([], COURT).frac).toBe(1);
    const one = coverage([leafAt(0.5, -20, 0, 0, COURT)], COURT);
    expect(one.dirty).toBe(1);
    expect(one.frac).toBeCloseTo((total - 1) / total);
    expect(coverage([leafAt(14, -20, 0, 0, COURT)], COURT).frac).toBe(1);
    const sand = coverage([], COURT, [{ x: -7, z: -17.5, rx: 2, rz: 0.6 }]);
    expect(sand.dirty).toBeGreaterThanOrEqual(2);
  });
});

describe('densest', () => {
  it('找到叶子最多的那团', () => {
    const ls = [
      leafAt(-8, -20, 0, 0, COURT),
      leafAt(5, -22, 0, 0, COURT),
      leafAt(5.4, -22.3, 0, 0, COURT),
      leafAt(4.7, -21.6, 0, 0, COURT),
    ];
    const c = densest(ls);
    expect(c?.n).toBe(3);
    expect(c?.x).toBeCloseTo(5.03, 1);
    expect(densest([leafAt(14, -20, 0, 0, COURT)])).toBeNull();
  });
});

describe('阵风', () => {
  it('越往后越大', () => {
    const a = gustPlan(1);
    const b = gustPlan(5);
    expect(b.back).toBeGreaterThan(a.back);
    expect(b.fresh).toBeGreaterThan(a.fresh);
  });

  it('方向是单位向量；箭头字对得上屏幕', () => {
    const r = rngOf(3, 'g');
    for (let i = 0; i < 20; i++) {
      const d = gustDir(r);
      expect(Math.hypot(d.x, d.z)).toBeCloseTo(1);
    }
    expect(arrowOf(1, 0)).toBe('→');
    expect(arrowOf(0, 1)).toBe('↓');
    expect(arrowOf(-1, 0)).toBe('←');
    expect(arrowOf(0.7, 0.7)).toBe('↘');
  });

  it('吹回来的先挑上风那边场外的叶子，落在上风那条线里面', () => {
    const ls = [
      leafAt(-14, -20, 0, 0, COURT), // 西边场外（西风的上风）
      leafAt(14, -20, 0, 0, COURT), // 东边场外
      leafAt(0, -20, 0, 0, COURT), // 场上
    ];
    const west = { x: 1, z: 0 };
    expect(pickBack(ls, COURT, west, 1)).toEqual([0]);
    expect(pickBack(ls, COURT, west, 5)).toEqual([0, 1]);
    const [tx, tz] = backTarget(ls[0], COURT, west, 0.5);
    expect(inRect(COURT, tx, tz)).toBe(true);
    expect(tx).toBeLessThan(COURT.x0 + 4);
    expect(tz).toBeCloseTo(-20);
  });

  it('扔出去的叶子大约落在目标点；新叶子落在场里', () => {
    const L = leafAt(-14, -20, 0, 0, COURT);
    launchTo(L, -9, -19, 0.05, 2.4);
    run([L], 4);
    expect(Math.hypot(L.x + 9, L.z + 19)).toBeLessThan(1.0);
    const pts = freshTargets(rngOf(1, 'f'), COURT, { x: 0, z: 1 }, 12, 2);
    expect(pts.length).toBe(12);
    for (const [x, z] of pts) expect(inRect(COURT, x, z)).toBe(true);
  });
});

describe('settle', () => {
  it('干净度分总有；全干净才有全清奖励和提前开赛的分', () => {
    const full = settle({ cleared: 120, sand: 2, clean: 1, gusts: 3, timeLeft: 21.6 });
    expect(full.bonus.map((b) => b.value)).toEqual([100 * CLEAN_PTS, FULL_BONUS, 21 * PER_SEC]);
    const part = settle({ cleared: 80, sand: 1, clean: 0.834, gusts: 5, timeLeft: 0 });
    expect(part.bonus.map((b) => b.value)).toEqual([83 * CLEAN_PTS]);
    expect(part.lines[0].value).toContain('80');
  });
});

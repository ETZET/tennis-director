import { describe, expect, it } from 'vitest';
import {
  CLEAN_BONUS,
  canReach,
  cleanBonus,
  DURATION,
  distToRect,
  drift,
  edgeDist,
  edgePoint,
  LIFE_BONUS,
  level,
  nextGap,
  rimLoop,
  SAVE_BASE,
  SAVE_EARLY,
  SAVE_SPEED,
  savePoints,
  saveWord,
  settle,
  TELL,
} from './rules';

const POOL = { x0: -57, x1: -43, z0: 3, z1: 13 };

describe('level', () => {
  it('越到后面：人越多、事越密、能同时出好几起、撑的时间越短', () => {
    const a = level(0);
    const b = level(DURATION);
    expect(a.swimmers).toBe(4);
    expect(b.swimmers).toBeGreaterThan(a.swimmers);
    expect(b.swimmers).toBeLessThanOrEqual(9);
    expect(b.gap).toBeLessThan(a.gap);
    expect(a.maxActive).toBe(1);
    expect(b.maxActive).toBe(3);
    expect(b.struggle).toBeLessThan(a.struggle);
    // 撑的时间永远比 "!" 之前那段长得多（看到 "!" 以后还来得及跑）
    expect(b.struggle).toBeGreaterThan(TELL * 5);
  });
  it('间隔 ±20%', () => {
    expect(nextGap(0, 0)).toBeCloseTo(level(0).gap * 0.8);
    expect(nextGap(0, 0.999)).toBeLessThan(level(0).gap * 1.2 + 1e-9);
  });
});

describe('savePoints', () => {
  it('越快越多；"!" 之前就救起再加分；撑到最后也有底分', () => {
    expect(savePoints(0, 10)).toBe(SAVE_BASE + SAVE_SPEED + SAVE_EARLY);
    expect(savePoints(TELL + 0.1, 10)).toBeLessThan(savePoints(TELL - 0.1, 10));
    expect(savePoints(5, 10)).toBe(SAVE_BASE + SAVE_SPEED / 2);
    expect(savePoints(10, 10)).toBe(SAVE_BASE);
    expect(savePoints(12, 10)).toBe(SAVE_BASE);
    for (let s = 0; s < 10; s += 0.5) expect(savePoints(s + 0.5, 10)).toBeLessThanOrEqual(savePoints(s, 10));
  });
  it('评语', () => {
    expect(saveWord(0.5, 10)).toBe('神速！');
    expect(saveWord(2, 10)).toBe('漂亮！');
    expect(saveWord(9, 10)).toBe('好险！');
  });
});

describe('池边的几何', () => {
  it('离池子多远、离池边多远', () => {
    expect(distToRect(-50, 8, POOL)).toBe(0);
    expect(distToRect(-50, 1, POOL)).toBeCloseTo(2);
    expect(distToRect(-58, 2, POOL)).toBeCloseTo(Math.SQRT2);
    expect(edgeDist(-50, 8, POOL)).toBeCloseTo(5);
    expect(edgeDist(-56, 8, POOL)).toBeCloseTo(1);
    expect(edgeDist(-60, 8, POOL)).toBe(0);
  });
  it('最近的池边站位在池外、朝里', () => {
    const w = edgePoint(-56, 8, POOL);
    expect(w.at).toEqual([-57.6, 8]);
    expect(w.inward).toEqual([1, 0]);
    const s = edgePoint(-50, 12.5, POOL);
    expect(s.at[1]).toBeCloseTo(13.6);
    expect(s.inward).toEqual([0, -1]);
    expect(distToRect(...s.at, POOL)).toBeCloseTo(0.6);
  });
  it('能不能扔救生圈：要站在池边，离人不能太远', () => {
    // 人在西头离池边 1 米：西边池沿上正对着能救，对面（东边）不行，离开池边也不行
    expect(canReach(-57.6, 8, -56, 8, POOL)).toBe(true);
    expect(canReach(-42.4, 8, -56, 8, POOL)).toBe(false);
    expect(canReach(-59.5, 8, -56, 8, POOL)).toBe(false);
    // 池子正中间：南北两边正对着都够得着
    expect(canReach(-50, 2.4, -50, 8, POOL)).toBe(true);
    expect(canReach(-50, 13.6, -50, 8, POOL)).toBe(true);
  });
});

describe('drift', () => {
  it('顺着风漂，碰到池壁弹回来，不出池子', () => {
    const l = { x: -50, z: 8, vx: 0, vz: 0 };
    for (let i = 0; i < 60 * 60; i++) drift(l, { x: 0.4, z: 0.1 }, 1 / 60, POOL, 0.25);
    expect(l.x).toBeCloseTo(POOL.x1 - 0.25, 5);
    expect(l.z).toBeGreaterThan(8);
    expect(l.z).toBeLessThanOrEqual(POOL.z1 - 0.25);
  });
});

describe('rimLoop', () => {
  it('一圈的周长，按弧长取点绕回来，nearest 找得回去', () => {
    const r = rimLoop(POOL, 0.4);
    expect(r.len).toBeCloseTo(2 * (14.8 + 10.8));
    const p = r.at(3);
    expect(p.z).toBeCloseTo(2.6);
    expect(r.at(3 + r.len).x).toBeCloseTo(p.x);
    expect(r.at(-1).x).toBeCloseTo(POOL.x0 - 0.4);
    const s = r.nearest(-42.6, 8);
    const q = r.at(s);
    expect(Math.hypot(q.x + 42.6, q.z - 8)).toBeLessThan(0.3);
  });
});

describe('settle', () => {
  it('三块分开列；剩的 ♥ 和收尾干净是奖励', () => {
    const r = settle({
      saves: 6,
      saveScore: 1500,
      missed: 1,
      fastest: 0.8,
      leaves: 10,
      litter: 4,
      whistles: 3,
      slips: 1,
      lives: 2,
      leavesLeft: 2,
      litterLeft: 0,
    });
    expect(r.lines[0].value).toBe('1500');
    expect(r.lines[1].value).toBe(String(10 * 15 + 4 * 25));
    expect(r.lines[2].value).toBe('120');
    expect(r.lines.some((l) => l.label.includes('滑倒'))).toBe(true);
    expect(r.bonus.map((b) => b.value)).toEqual([2 * LIFE_BONUS, CLEAN_BONUS - 30]);
  });
  it('一塌糊涂就没有收尾奖励', () => {
    expect(cleanBonus(12, 3)).toBe(0);
    const r = settle({
      saves: 0,
      saveScore: 0,
      missed: 3,
      fastest: null,
      leaves: 0,
      litter: 0,
      whistles: 0,
      slips: 0,
      lives: 0,
      leavesLeft: 12,
      litterLeft: 4,
    });
    expect(r.bonus).toEqual([]);
  });
});

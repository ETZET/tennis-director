import { describe, expect, it } from 'vitest';
import { ClayState, T_BRUSHED, TAPE_STEP } from '../../clubclay/assets/clay/state';
import { rngOf } from '../../clubsite/cast/rng';
import {
  cellsIn,
  comb,
  coverage,
  DONE_COVER,
  eastLines,
  isDone,
  LINE_PTS,
  largestPatch,
  lineProgress,
  liveScore,
  nearestDirty,
  nearLine,
  PTS_PER_PCT,
  type Rect,
  STEP_PENALTY,
  scuffEast,
  settle,
  TIME_BONUS,
  trample,
} from './rules';

const DIMS = { L: 23.77, DW: 10.97, SW: 8.23, SVC: 6.4 };
const RECT: Rect = { x0: 0.4, x1: 12.5, z0: -6.3, z1: 6.3 };
const fresh = () => {
  const s = new ClayState(33, 16.6, DIMS);
  scuffEast(s, rngOf(1, 'claydrag', 'scuff:1'), DIMS);
  return s;
};

describe('scuffEast', () => {
  it('东半场起尘、线盖满；西半场不动', () => {
    const s = new ClayState(33, 16.6, DIMS);
    s.fill(0); // 西边当成拖平的
    scuffEast(s, rngOf(1, 'claydrag', 'scuff:1'), DIMS);
    expect(s.at(8, 2).state).toBe('dusty');
    expect(s.at(-8, 2).state).toBe('brushed');
    const cells = cellsIn(s, RECT);
    expect(coverage(s, cells)).toBe(0);
    for (const t of eastLines(s, TAPE_STEP)) expect(lineProgress(s.tape[t.li], t)).toBe(0);
    expect(s.marks.length).toBeGreaterThan(20);
    expect(s.marks.length).toBeLessThan(80);
  });
  it('同一个种子一样', () => {
    const a = fresh();
    const b = fresh();
    expect(Array.from(a.dust)).toEqual(Array.from(b.dust));
  });
});

describe('comb / coverage', () => {
  it('一道 1.8 米宽：只拖平垫子下面，旁边翻起一溜土', () => {
    const s = fresh();
    const cells = cellsIn(s, RECT);
    let got = 0;
    for (let x = 1; x <= 12; x += 0.05) got += comb(s, x, 0, 1, 0);
    expect(got).toBeGreaterThan(0);
    expect(s.at(6, 0).state).toBe('brushed');
    expect(s.at(6, 0.7).state).toBe('brushed');
    expect(s.at(6, 1.3).state).toBe('dusty');
    const c = coverage(s, cells);
    // 一道 ≈ 1.8 / 12.6 的宽、11.5 / 12.1 的长
    expect(c).toBeGreaterThan(0.11);
    expect(c).toBeLessThan(0.16);
  });
  it('重叠的那一道不加覆盖率、也不翻土棱', () => {
    const s = fresh();
    const cells = cellsIn(s, RECT);
    for (let x = 1; x <= 12; x += 0.05) comb(s, x, 0, 1, 0);
    const c1 = coverage(s, cells);
    let again = 0;
    for (let x = 12; x >= 1; x -= 0.05) again += comb(s, x, 0.2, -1, 0);
    expect(coverage(s, cells)).toBeGreaterThan(c1);
    expect(again).toBeLessThan(150);
    // 相邻一道（中心隔 1.6 米，重叠 0.2）：两道之间接得上
    for (let x = 1; x <= 12; x += 0.05) comb(s, x, 1.8, 1, 0);
    for (let z = -0.6; z < 2.4; z += 0.09) expect(s.at(6, z).dust).toBeLessThan(T_BRUSHED);
  });
  it('蛇形一道道拖满 ≈ 全覆盖', () => {
    const s = fresh();
    const cells = cellsIn(s, RECT);
    let dir = 1;
    for (let z = -5.4; z <= 5.5; z += 1.55) {
      for (let x = dir > 0 ? 0 : 13; dir > 0 ? x <= 13 : x >= 0; x += 0.05 * dir) comb(s, x, z, dir, 0);
      dir = -dir;
    }
    // 网边那一条用竖着的一道补
    for (let z = -7; z <= 7; z += 0.05) comb(s, 0.9, z, 0, 1);
    expect(coverage(s, cells)).toBeGreaterThanOrEqual(DONE_COVER);
  });
});

describe('trample', () => {
  it('只踩坏拖平的格子', () => {
    const s = fresh();
    expect(trample(s, 6, 0)).toBe(0);
    for (let x = 4; x <= 8; x += 0.05) comb(s, x, 0, 1, 0);
    const n = trample(s, 6, 0);
    expect(n).toBeGreaterThan(2);
    expect(s.at(6, 0).state).toBe('dusty');
    expect(trample(s, 6, 0)).toBe(0);
  });
});

describe('largestPatch', () => {
  it('指向最大的那块没拖的', () => {
    const s = fresh();
    // 拖平北边一大半，留南边一条（z 3..6.3）和网边一小块
    for (let z = -5.5; z <= 2; z += 1.6) for (let x = 0; x <= 13; x += 0.05) comb(s, x, z, 1, 0);
    const p = largestPatch(s, RECT);
    expect(p).not.toBeNull();
    expect(p?.z).toBeGreaterThan(2.5);
  });
  it('全拖完 = null', () => {
    const s = fresh();
    s.dust.fill(0);
    expect(largestPatch(s, RECT)).toBeNull();
  });
});

describe('白线', () => {
  it('东半场 7 条线；扫一条线进度到 1，最近的脏点换到别的线', () => {
    const s = fresh();
    const tasks = eastLines(s, TAPE_STEP);
    expect(tasks.map((t) => t.id).sort()).toEqual(
      ['baseE', 'center', 'sideN', 'sideS', 'singleN', 'singleS', 'svcE'].sort(),
    );
    const base = tasks.find((t) => t.id === 'baseE');
    expect(base).toBeDefined();
    if (!base) return;
    expect(nearestDirty(s, tasks, TAPE_STEP, 11.9, 0)?.task.id).toBe('baseE');
    for (let z = -6; z <= 6; z += 0.1) s.sweepAt(11.885, z, 0.4);
    expect(lineProgress(s.tape[base.li], base)).toBe(1);
    expect(nearestDirty(s, tasks, TAPE_STEP, 11.9, 0)?.task.id).not.toBe('baseE');
    // 横线：网西边那一截不归东半场
    const side = tasks.find((t) => t.id === 'sideN');
    expect(side?.a[0]).toBeGreaterThan(0.2);
  });
  it('离线多远', () => {
    const s = fresh();
    expect(nearLine(s, 11.885, 1)).toBeCloseTo(0, 5);
    expect(nearLine(s, 9, 2)).toBeGreaterThan(1.5);
  });
});

describe('分数', () => {
  it('顶栏的分 = 覆盖率 + 线 − 脚印', () => {
    expect(liveScore({ cover: 0.5, lines: 2, steps: 3 })).toBe(50 * PTS_PER_PCT + 2 * LINE_PTS - 3 * STEP_PENALTY);
    expect(liveScore({ cover: 0, lines: 0, steps: 10 })).toBe(0);
  });
  it('完工才有时间奖励', () => {
    const done = settle({ cover: 0.97, lines: 7, totalLines: 7, steps: 2, timeLeft: 14.6 });
    expect(done.bonus.map((b) => b.value)).toEqual([14 * TIME_BONUS]);
    expect(isDone({ cover: 0.97, lines: 7, totalLines: 7 })).toBe(true);
    const part = settle({ cover: 0.9, lines: 7, totalLines: 7, steps: 0, timeLeft: 14 });
    expect(part.bonus).toEqual([]);
    expect(part.lines[0].value).toBe(`${90 * PTS_PER_PCT}`);
  });
});

import { describe, expect, it } from 'vitest';
import { rngOf } from '../../clubsite/cast/rng';
import {
  award,
  ballAt,
  callOf,
  emptyTally,
  FENCE,
  feedQuality,
  inSight,
  meterAt,
  meterZone,
  NET_Z0,
  NET_Z1,
  onCourt,
  pathLen,
  planPoint,
  RUN,
  retrievePoints,
  STATION,
  STATION_R,
  serveDelay,
  serveSpot,
  settle,
  towelPoints,
} from './rules';

describe('ballAt', () => {
  it('飞的段两头对得上、滚的段减速；之前 null、之后停在终点', () => {
    const segs = [
      {
        kind: 'fly' as const,
        t0: 1,
        t1: 2,
        p0: [0, 1, 0] as [number, number, number],
        p1: [10, 0.1, 0] as [number, number, number],
      },
      {
        kind: 'roll' as const,
        t0: 2,
        t1: 3,
        p0: [10, 0.1, 0] as [number, number, number],
        p1: [12, 0.1, 0] as [number, number, number],
      },
    ];
    expect(ballAt(segs, 0.5)).toBeNull();
    expect(ballAt(segs, 1)?.[1]).toBeCloseTo(1);
    expect(ballAt(segs, 2)?.[0]).toBeCloseTo(10);
    expect(ballAt(segs, 1.5)?.[1]).toBeGreaterThan(1);
    // 减速：前一半走得比后一半多
    expect((ballAt(segs, 2.5)?.[0] ?? 0) - 10).toBeGreaterThan(1);
    expect(ballAt(segs, 9)).toEqual([12, 0.1, 0]);
  });
});

describe('planPoint', () => {
  it('同一个种子同一分；死球停在场边以内、不压着网；时间顺序对', () => {
    const kinds = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const o = { t0: 5, srv: (i % 2) as 0 | 1, sideA: i % 4 < 2 ? -1 : 1, deuce: i % 3 === 0, level: (i % 10) / 9 };
      const a = planPoint(rngOf(1, 'ballkid', `p${i}`), o);
      const b = planPoint(rngOf(1, 'ballkid', `p${i}`), o);
      expect(a).toEqual(b);
      kinds.add(a.end);
      expect(a.tDead).toBeGreaterThan(o.t0);
      expect(a.tRest).toBeGreaterThanOrEqual(a.tDead);
      for (let k = 1; k < a.segs.length; k++) expect(a.segs[k].t0).toBeCloseTo(a.segs[k - 1].t1, 5);
      if (a.end === 'stands') expect(a.rest).toBeNull();
      else {
        const [x, z] = a.rest as [number, number];
        expect(x).toBeGreaterThanOrEqual(FENCE.x0 - 0.01);
        expect(x).toBeLessThanOrEqual(FENCE.x1 + 0.01);
        expect(z).toBeGreaterThanOrEqual(FENCE.z0 - 0.01);
        expect(z).toBeLessThanOrEqual(FENCE.z1 + 0.01);
        if (a.end === 'net') {
          expect(Math.abs(x)).toBeGreaterThan(0.4);
          expect(z).toBeGreaterThan(NET_Z0);
          expect(z).toBeLessThan(NET_Z1);
        }
      }
      // 终点就是 rest
      if (a.rest) {
        const p = ballAt(a.segs, a.tRest + 1);
        expect(p?.[0]).toBeCloseTo(a.rest[0]);
        expect(p?.[2]).toBeCloseTo(a.rest[1]);
      }
    }
    expect(kinds.size).toBe(5);
  });
});

describe('一分的分布', () => {
  it('发球人七成赢；近处的死球（挂网、南边）占一半多；来回不长', () => {
    const n = 600;
    let srvWins = 0;
    let near = 0;
    let len = 0;
    for (let i = 0; i < n; i++) {
      const o = { t0: 0, srv: (i % 2) as 0 | 1, sideA: -1, deuce: true, level: 0.3 };
      const p = planPoint(rngOf(3, 'ballkid', `d${i}`), o);
      if (p.winner === o.srv) srvWins++;
      if (p.end === 'net' || p.end === 'wideS') near++;
      len += p.tDead;
    }
    expect(srvWins / n).toBeGreaterThan(0.6);
    expect(srvWins / n).toBeLessThan(0.76);
    expect(near / n).toBeGreaterThan(0.45);
    expect(len / n).toBeLessThan(5.5);
  });
});

describe('回收窗口', () => {
  it('隔着网要绕，窗口够跑一个来回', () => {
    expect(pathLen(STATION, [-5, -20])).toBeCloseTo(Math.hypot(-5 - STATION[0], -20 - STATION[1]));
    expect(pathLen(STATION, [5, -20])).toBeGreaterThan(Math.hypot(5 - STATION[0], -20 - STATION[1]));
    for (const rest of [
      [0.8, -21],
      [15, -28],
      [-15, -29.3],
      [5, -12.6],
    ] as [number, number][]) {
      const d = serveDelay({ rest, tDead: 0, tRest: 1, feed: false }, 1);
      expect(d).toBeGreaterThan((2 * pathLen(STATION, rest)) / RUN + 1);
    }
    expect(serveDelay({ rest: null, tDead: 0, tRest: 1, feed: true }, 0)).toBeGreaterThan(4);
  });
  it('岗位不在场上，也不在发球人眼前', () => {
    expect(onCourt(...STATION)).toBe(false);
    expect(onCourt(STATION[0], STATION[1] - STATION_R)).toBe(false);
    expect(onCourt(0, -21)).toBe(true);
    for (const side of [-1, 1])
      for (const deuce of [true, false]) {
        const s = serveSpot(side, deuce);
        expect(inSight(s, side, STATION)).toBe(false);
        // 对面底线后正中间 = 眼前
        expect(inSight(s, side, [-side * 15, -21])).toBe(true);
      }
  });
});

describe('递球的准星', () => {
  it('来回走；绿区中间 = 正好', () => {
    expect(meterAt(0, 1)).toBeCloseTo(0);
    expect(meterAt(0.5, 1)).toBeCloseTo(1);
    expect(meterAt(0.75, 1)).toBeCloseTo(0.5);
    const z = meterZone(0);
    expect(feedQuality(z.c, z)).toBe('perfect');
    expect(feedQuality(z.c + z.w * 0.8, z)).toBe('good');
    expect(feedQuality(0.1, z)).toBe('poor');
  });
});

describe('分数、比分', () => {
  it('快的、连着的多', () => {
    expect(retrievePoints(0, 1)).toBe(50);
    expect(retrievePoints(1, 1)).toBe(100);
    expect(retrievePoints(1, 9)).toBe(140);
    expect(towelPoints(0.5)).toBe(100);
  });
  it('无占先：先到 4 分赢一局；报分发球人在前', () => {
    let s: [number, number] = [0, 0];
    for (let i = 0; i < 3; i++) s = award(s, 1).score;
    expect(callOf(s, 0)).toBe('0–40');
    expect(callOf(s, 1)).toBe('40–0');
    expect(award([3, 3], 0)).toEqual({ score: [0, 0], game: true });
    expect(callOf([3, 3], 0)).toContain('平分');
  });
  it('结算：剩下的命是奖励', () => {
    const r = settle({ ...emptyTally(), lives: 2, clean: 5 });
    expect(r.bonus[0].value).toBe(120);
    expect(r.lines[1].value).toBe('5');
  });
});

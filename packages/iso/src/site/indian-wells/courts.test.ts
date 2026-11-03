import { describe, expect, it } from 'vitest';
import type { CourtFrame } from '../../world/frame';
import { PICK4 } from './ground';
import { INDIAN_WELLS } from './index';
import { F_PK4, PICKLE } from './layout';
import { FACILITIES, LAWNS, VARIANTS } from './state';

type Rect = { x0: number; x1: number; z0: number; z1: number };

/** 场地四个角（世界坐标） */
const corners = (f: CourtFrame) =>
  [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([a, b]) => f.w({ x: (a as number) * f.hx, z: (b as number) * f.hz }));

const inRect = (p: { x: number; z: number }, r: Rect, e = 1e-6) =>
  p.x >= r.x0 - e && p.x <= r.x1 + e && p.z >= r.z0 - e && p.z <= r.z1 + e;

/** 每处设施画出来的范围：匹克球场是围起来的那块场子，别的按修好后那块地（LAWNS） */
const drawn = (f: string): readonly Rect[] =>
  f === 'stadium_3' ? [PICKLE] : ((LAWNS as Record<string, readonly Rect[]>)[f] ?? []);

describe('Indian Wells courtsFor（变体的球场）', () => {
  const courtsFor = INDIAN_WELLS.courtsFor;
  if (!courtsFor) throw new Error('INDIAN_WELLS 没有 courtsFor');

  it('每个返回的场地都在设施画出来的范围里', () => {
    for (const f of FACILITIES) {
      const vs: (string | null)[] = [null, ...(VARIANTS[f] ?? [])];
      for (const v of vs)
        for (const fr of courtsFor(f, v))
          for (const c of corners(fr))
            expect(
              drawn(f).some((r) => inRect(c, r)),
              `${f}/${v} 的场地 (${fr.ox}, ${fr.oz}) 角 (${c.x.toFixed(2)}, ${c.z.toFixed(2)})`,
            ).toBe(true);
    }
  });

  it('没设变体、不认识的变体 = courts；不认识的地点 = 空表', () => {
    for (const [a, list] of Object.entries(INDIAN_WELLS.courts)) {
      expect(courtsFor(a, null)).toEqual(list);
      expect(courtsFor(a, 'nope')).toEqual(list);
    }
    expect(courtsFor('outer_23', 'hard')).toEqual(INDIAN_WELLS.courts.outer_23);
    expect(courtsFor('outer_23', 'clay')).toEqual(INDIAN_WELLS.courts.outer_23);
    expect(courtsFor('nowhere', 'pickle4')).toEqual([]);
  });

  it('pickle4 是四片，各对着 ground.ts 画的一格，网沿世界 x', () => {
    const l = courtsFor('stadium_3', 'pickle4');
    expect(l).toBe(F_PK4);
    expect(l).toHaveLength(4);
    l.forEach((fr, i) => {
      const [x, z] = PICK4[i] as readonly [number, number];
      expect([fr.ox, fr.oz]).toEqual([x, z]);
      // 画出来的那一格：x 方向半宽 4、z 方向半长 4.4
      for (const c of corners(fr)) expect(inRect(c, { x0: x - 4, x1: x + 4, z0: z - 4.4, z1: z + 4.4 })).toBe(true);
      // 局部 z（球网方向）朝世界 x
      const n = fr.w({ x: 0, z: 1 });
      expect(Math.abs(n.x - fr.ox)).toBeCloseTo(1);
      expect(Math.abs(n.z - fr.oz)).toBeCloseTo(0);
    });
  });

  it('tennis2 是两片，范围同画出来的两片小网球场', () => {
    const l = courtsFor('stadium_3', 'tennis2');
    expect(l).toHaveLength(2);
    const [a, b] = INDIAN_WELLS.courts.stadium_3 as readonly CourtFrame[];
    expect(l.map((f) => [f.ox, f.oz, f.a, f.hx, f.hz])).toEqual([a, b].map((f) => [f?.ox, f?.oz, f?.a, f?.hx, f?.hz]));
  });
});

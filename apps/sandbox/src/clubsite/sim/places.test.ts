// 地点表的规矩：id 不重复、needs 指到岗位、开门时间、每个场景都有地点；每个员工位置（SLOT_TABLE）都有岗位，岗位放得下指到它的人。
// 站位（clubwalk/sim/spots.ts）和地点表对不对得上在 clubwalk/sim/spots.test.ts。
import { describe, expect, it } from 'vitest';
import { isFixedRole, SLOT_TABLE, slotKey } from '../cast/slots';
import { SCENES } from '../cast/types';
import { PLACE_BY_ID, PLACES, POST_OF_SLOT } from './places';

/** 员工位置：SLOT_TABLE 里 role staff / vendor / coach / pro，或 kind umpire / ball-kid */
const STAFF_SLOTS = SLOT_TABLE.filter((s) => isFixedRole(s.role) || s.kind === 'umpire' || s.kind === 'ball-kid');

describe('地点表', () => {
  it('id 不重复、cap ≥ 1、名字是中文', () => {
    const ids = PLACES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of PLACES) {
      expect(p.cap, p.id).toBeGreaterThanOrEqual(1);
      expect(p.name, p.id).toMatch(/[一-鿿]/);
    }
  });

  it('needs 指到存在的 post；post / staff 只给员工', () => {
    for (const p of PLACES) {
      if (p.needs) expect(PLACE_BY_ID[p.needs]?.kind, `${p.id} needs ${p.needs}`).toBe('post');
      if (p.kind === 'post' || p.kind === 'staff') expect(p.for, p.id).toEqual(['staff']);
    }
  });

  it('开门时间在一天以内、开 < 关；待的时间 [少, 多]', () => {
    for (const p of PLACES) {
      if (p.open) {
        expect(p.open[0], p.id).toBeGreaterThanOrEqual(0);
        expect(p.open[1], p.id).toBeLessThanOrEqual(24 * 60);
        expect(p.open[0], p.id).toBeLessThan(p.open[1]);
      }
      if (p.stay) expect(p.stay[0], p.id).toBeLessThanOrEqual(p.stay[1]);
    }
  });

  it('每个场景都有地点；出入口、前台、员工休息处都有', () => {
    for (const scene of SCENES)
      expect(
        PLACES.some((p) => p.scene === scene),
        scene,
      ).toBe(true);
    for (const kind of ['entry', 'desk', 'court', 'pickle', 'lesson', 'stand', 'seat', 'stall', 'table'] as const)
      expect(
        PLACES.some((p) => p.kind === kind),
        kind,
      ).toBe(true);
    for (const kind of ['cafe', 'bar', 'shop', 'gym', 'locker', 'pool', 'lounger', 'golf', 'play', 'staff'] as const)
      expect(
        PLACES.some((p) => p.kind === kind),
        kind,
      ).toBe(true);
  });
});

describe('员工的岗位', () => {
  it('每个员工位置都有岗位', () => {
    const missing = STAFF_SLOTS.map((s) => slotKey(s.scene, s.slot)).filter((k) => !POST_OF_SLOT[k]);
    expect(missing).toEqual([]);
  });

  it('岗位表的键都在 SLOT_TABLE 里、值都是 post', () => {
    const keys = new Set(SLOT_TABLE.map((s) => slotKey(s.scene, s.slot)));
    for (const [k, v] of Object.entries(POST_OF_SLOT)) {
      expect(keys.has(k), k).toBe(true);
      expect(PLACE_BY_ID[v]?.kind, `${k} → ${v}`).toBe('post');
    }
  });

  it('一个岗位的 cap 够放下指到它的所有员工位置', () => {
    const n = new Map<string, number>();
    for (const v of Object.values(POST_OF_SLOT)) n.set(v, (n.get(v) ?? 0) + 1);
    for (const [post, k] of n) expect(PLACE_BY_ID[post].cap, post).toBeGreaterThanOrEqual(k);
  });

  it('每个 post 都有人（没有空着的岗位）', () => {
    const used = new Set(Object.values(POST_OF_SLOT));
    for (const p of PLACES) if (p.kind === 'post') expect(used.has(p.id), p.id).toBe(true);
  });
});

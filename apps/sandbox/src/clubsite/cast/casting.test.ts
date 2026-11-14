// 选角和生成：确定性、同一天同一位置稳定、一天里没有一人两地、位置的 kind / role 和人对得上、员工每天同一个人、池子够大。
import { describe, expect, it } from 'vitest';
import { BIO_TEMPLATE_COUNT } from './bios';
import { buildCast, castStats, parseGuestId, REGULAR_COUNT, weekdayOf } from './casting';
import { bodyFits, makePerson } from './crowd';
import { type GroupId, groupCounts, NAME_GROUPS } from './names';
import { isFixedRole, SLOT_TABLE, slotKey } from './slots';
import { TRAITS } from './traits';
import type { CastPerson, SlotInfo } from './types';

const DAYS = Array.from({ length: 14 }, (_, i) => i + 1);

/** 两个手写的 named（测试用）：一个每天在中心球场当裁判，一个周二周四在会员场打双打 */
function fakeNamed(): CastPerson[] {
  const base = (id: string, info: SlotInfo) => ({ ...makePerson(9, id, info, 'regular'), tier: 'named' as const });
  const ump = SLOT_TABLE.find((s) => s.scene === 'clubstadium' && s.slot === 'umpire') as SlotInfo;
  const m = SLOT_TABLE.find((s) => s.scene === 'clubcourts' && s.slot === 'm-e1') as SlotInfo;
  return [
    { ...base('n-ump', ump), homes: [{ scene: 'clubstadium', slot: 'umpire' }] },
    { ...base('n-mem', m), homes: [{ scene: 'clubcourts', slot: 'm-e1', days: [1, 3] }] },
  ];
}

describe('人位表', () => {
  it('每个 scene:slot 只有一行，没有总监', () => {
    const keys = SLOT_TABLE.map((s) => slotKey(s.scene, s.slot));
    expect(new Set(keys).size).toBe(keys.length);
    expect(SLOT_TABLE.some((s) => (s.kind as string) === 'director')).toBe(false);
    expect(SLOT_TABLE.length).toBeGreaterThan(200);
  });
  it('kind 和 role 对得上', () => {
    for (const s of SLOT_TABLE) {
      if (s.kind === 'kid') expect(s.role, s.slot).toBe('kid');
      if (s.kind === 'ball-kid' || s.kind === 'umpire') expect(s.role, s.slot).toBe('staff');
      if (s.kind === 'coach') expect(['coach', 'staff'], s.slot).toContain(s.role);
      expect(s.title.length).toBeGreaterThan(0);
    }
  });
});

describe('池子', () => {
  it('每组名字 ≥ 30 个名、≥ 30 个姓；故事模板 ≥ 40', () => {
    for (const g of Object.keys(NAME_GROUPS) as GroupId[]) {
      const c = groupCounts(g);
      expect(c.first, g).toBeGreaterThanOrEqual(30);
      expect(c.last, g).toBeGreaterThanOrEqual(30);
    }
    expect(BIO_TEMPLATE_COUNT).toBeGreaterThanOrEqual(40);
  });
});

describe('makePerson', () => {
  it('同样的输入永远同一个人', () => {
    for (const s of SLOT_TABLE.slice(0, 40)) {
      const a = makePerson(3, `k:${s.slot}`, s, 'crowd');
      const b = makePerson(3, `k:${s.slot}`, s, 'crowd');
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    }
  });
  it('属性在范围里、特质都在表里、台词 ≤ 16 字', () => {
    for (const s of SLOT_TABLE)
      for (let i = 0; i < 4; i++) {
        const p = makePerson(5, `t:${s.scene}:${s.slot}:${i}`, s, 'crowd');
        expect(p.attrs.ntrp).toBeGreaterThanOrEqual(1);
        expect(p.attrs.ntrp).toBeLessThanOrEqual(7);
        expect((p.attrs.ntrp * 2) % 1).toBe(0);
        for (const k of ['fitness', 'social', 'patience', 'spend', 'loyalty'] as const) {
          expect(p.attrs[k]).toBeGreaterThanOrEqual(0);
          expect(p.attrs[k]).toBeLessThanOrEqual(100);
        }
        expect(p.traits.length).toBeGreaterThanOrEqual(1);
        expect(p.traits.length).toBeLessThanOrEqual(3);
        for (const t of p.traits) expect(TRAITS[t], t).toBeDefined();
        for (const ls of Object.values(p.lines ?? {}))
          for (const l of ls ?? []) expect(l.length, l).toBeLessThanOrEqual(16);
        expect(p.bio).toMatch(/。.+。$/);
        expect(p.bio).not.toMatch(/undefined|NaN|\{/);
        expect(bodyFits(p.look.body, s), `${s.scene}:${s.slot}`).toBe(true);
        expect(p.favor0).toBeGreaterThanOrEqual(0);
        expect(p.favor0).toBeLessThanOrEqual(10);
      }
  });
  it('年纪和体型相称：孩子 6–12、少年 13–17', () => {
    for (const s of SLOT_TABLE) {
      const p = makePerson(8, `age:${s.scene}:${s.slot}`, s, 'crowd');
      if (p.look.body === 'kid') expect(p.age).toBeLessThanOrEqual(12);
      if (p.look.body === 'teen') expect(p.age).toBeGreaterThanOrEqual(13);
      if (p.look.body === 'teen') expect(p.age).toBeLessThanOrEqual(17);
      if (p.look.body === 'adult') expect(p.age).toBeGreaterThanOrEqual(17);
    }
  });
  it('制服：球童、裁判、教练保留场景原来的衣服，救生员红色，前台类员工藏青', () => {
    for (const s of SLOT_TABLE) {
      const p = makePerson(2, `u:${s.scene}:${s.slot}`, s, 'regular');
      if (s.kind === 'ball-kid') expect(p.look.keep).toEqual(['shirt', 'bottom', 'shoes', 'hat']);
      if (s.kind === 'umpire' || s.title.includes('裁判')) expect(p.look.keep).toContain('shirt');
      if (s.kind === 'coach' && s.role === 'coach') expect(p.look.keep).toContain('whistle');
      if (s.title === '救生员') expect([p.look.shirt, p.look.bottom]).toEqual(['red', 'red']);
      if (s.title.includes('店员') || s.title === '代客泊车') expect(p.look.shirt).toBe('navy');
    }
  });
});

describe('buildCast', () => {
  const named = fakeNamed();
  const cast = buildCast(1, named);

  it('同种子两次一模一样', () => {
    const b = buildCast(1, named);
    expect(JSON.stringify(b.roster())).toBe(JSON.stringify(cast.roster()));
    for (const d of DAYS)
      for (const s of SLOT_TABLE)
        expect(b.who(s.scene, s.slot, s.kind, d).id).toBe(cast.who(s.scene, s.slot, s.kind, d).id);
    const c = buildCast(2, named);
    expect(JSON.stringify(c.roster())).not.toBe(JSON.stringify(cast.roster()));
  });

  it('同一天同一位置稳定；客人每天换', () => {
    const s = SLOT_TABLE.find((x) => x.scene === 'clubfood' && x.slot === 'd-0n2') as SlotInfo;
    const a = cast.who(s.scene, s.slot, s.kind, 3);
    expect(cast.who(s.scene, s.slot, s.kind, 3)).toBe(a);
    const ids = new Set(DAYS.map((d) => cast.who(s.scene, s.slot, s.kind, d).id));
    expect(ids.size).toBeGreaterThan(7);
  });

  it('一天里没有一人两地；where() 和 who() 一致', () => {
    for (const d of DAYS) {
      const seen = new Map<string, string>();
      for (const s of SLOT_TABLE) {
        const p = cast.who(s.scene, s.slot, s.kind, d);
        const k = slotKey(s.scene, s.slot);
        expect(seen.has(p.id), `第 ${d} 天 ${p.id} 在 ${seen.get(p.id)} 和 ${k}`).toBe(false);
        seen.set(p.id, k);
        expect(cast.where(p.id, d)).toEqual([{ scene: s.scene, slot: s.slot }]);
      }
    }
  });

  it('位置的身份和人对得上', () => {
    for (const d of DAYS)
      for (const s of SLOT_TABLE) {
        const p = cast.who(s.scene, s.slot, s.kind, d);
        expect(p.role, `${s.scene}:${s.slot} ${p.id}`).toBe(s.role);
        expect(bodyFits(p.look.body, s), `${s.scene}:${s.slot} ${p.id}`).toBe(true);
      }
  });

  it('named 占自己的位置；没占的日子别人顶上', () => {
    expect(DAYS.every((d) => cast.who('clubstadium', 'umpire', 'umpire', d).id === 'n-ump')).toBe(true);
    for (const d of DAYS) {
      const id = cast.who('clubcourts', 'm-e1', 'player', d).id;
      expect(id === 'n-mem').toBe(weekdayOf(d) === 1 || weekdayOf(d) === 3);
    }
  });

  it('员工位置每天同一个人（不换人）', () => {
    for (const s of SLOT_TABLE.filter((x) => isFixedRole(x.role))) {
      const ids = new Set(DAYS.map((d) => cast.who(s.scene, s.slot, s.kind, d).id));
      expect(ids.size, slotKey(s.scene, s.slot)).toBe(1);
      expect([...ids][0].startsWith('guest:')).toBe(false);
    }
  });

  it('熟面孔：约 90 个，每人一周 1–5 天，名册里没有客人、没有重名', () => {
    const roster = cast.roster();
    const regs = roster.filter((p) => p.id.startsWith('reg:'));
    expect(regs.length).toBeGreaterThanOrEqual(REGULAR_COUNT - 10);
    for (const p of regs) {
      expect(p.week?.days.length).toBeGreaterThanOrEqual(1);
      expect(p.week?.days.length).toBeLessThanOrEqual(5);
      expect(p.homes.length).toBeGreaterThanOrEqual(1);
    }
    expect(roster.some((p) => p.tier === 'crowd')).toBe(false);
    expect(roster.slice(0, named.length).map((p) => p.id)).toEqual(named.map((p) => p.id));
    const names = roster.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
    const st = castStats(cast, 1);
    expect(st.regular).toBeGreaterThan(30);
    expect(st.crowd).toBeGreaterThan(50);
  });

  it('get() 能按客人 id 重新生成（换一份演员表也一样）', () => {
    const p = cast.who('clubpool', 'sun-2', 'player', 5);
    expect(p.id).toMatch(/^guest:/);
    expect(parseGuestId(p.id)).toEqual({ scene: 'clubpool', slot: 'sun-2', day: 5, kind: undefined });
    const fresh = buildCast(1, named);
    expect(JSON.stringify(fresh.get(p.id))).toBe(JSON.stringify(p));
    expect(cast.get(p.id)).toBe(p);
    expect(cast.where(p.id, 6)).toEqual([]);
    expect(cast.get('nobody')).toBeUndefined();
  });

  it('表里没有的位置按 kind 生成客人', () => {
    const k = cast.who('clubplaza', '#99', 'kid', 2);
    expect(k.look.body).toBe('kid');
    expect(cast.get(k.id)).toBe(k);
    expect(buildCast(1, named).get(k.id)?.look.body).toBe('kid');
  });
});

describe('真的演员表（NAMED + 生成的）', () => {
  it('一天里没有一人两地，体型对得上位置；named 自己的身份可以和位置不同（员工下了班坐在拱廊）', async () => {
    const { NAMED } = await import('./named');
    const cast = buildCast(1, NAMED);
    for (const d of DAYS) {
      const seen = new Set<string>();
      for (const s of SLOT_TABLE) {
        const p = cast.who(s.scene, s.slot, s.kind, d);
        expect(seen.has(p.id), `第 ${d} 天 ${p.id}`).toBe(false);
        seen.add(p.id);
        expect(bodyFits(p.look.body, s), `${s.scene}:${s.slot} ${p.id}`).toBe(true);
        if (p.tier !== 'named') expect(p.role).toBe(s.role);
      }
    }
  });
});

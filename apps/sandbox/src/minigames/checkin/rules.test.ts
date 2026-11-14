import { describe, expect, it } from 'vitest';
import { CAST } from '../../clubsite/cast';
import { rngOf } from '../../clubsite/cast/rng';
import {
  buildPools,
  CHECKIN,
  checkinPoints,
  dealCards,
  drainRate,
  judge,
  LIFE_BONUS,
  looksDistinct,
  OPENING_QUEUE,
  patienceAt,
  pickPerson,
  planArrivals,
  settle,
} from './rules';

const pools = buildPools(CAST.roster(), (i) => CAST.who('clubdesk', `walkin-${i}`, 'player', 1));

describe('buildPools', () => {
  it('会员都是有卡的大人，访客没有卡，VIP 是 named', () => {
    expect(pools.members.length).toBeGreaterThan(40);
    expect(pools.guests.length).toBeGreaterThan(10);
    expect(pools.vips.length).toBeGreaterThan(5);
    for (const p of pools.members) {
      expect(p.look.body).toBe('adult');
      expect(['founder', 'annual', 'monthly', 'family']).toContain(p.member.kind);
      expect(['staff', 'vendor', 'coach']).not.toContain(p.role);
    }
    for (const g of pools.guests) expect(['day', 'none']).toContain(g.member.kind);
    for (const v of pools.vips) expect(v.tier).toBe('named');
    // 例子：Linh Hoang 是年卡会员
    expect(pools.members.some((p) => p.name === 'Linh Hoang' && p.member.kind === 'annual')).toBe(true);
  });
});

describe('planArrivals', () => {
  it('同一个种子同一张表；开局排着几个会员、三个 VIP、越到后面越密', () => {
    const a = planArrivals(rngOf(1, 'checkin', 'plan:1'));
    expect(a).toEqual(planArrivals(rngOf(1, 'checkin', 'plan:1')));
    expect(a.filter((x) => x.t === 0)).toHaveLength(OPENING_QUEUE);
    expect(a.filter((x) => x.kind === 'vip')).toHaveLength(3);
    expect(a.some((x) => x.kind === 'guest')).toBe(true);
    expect(a.some((x) => x.kind === 'expired')).toBe(true);
    expect(a.filter((x) => x.t < 6).every((x) => x.kind === 'member')).toBe(true);
    const early = a.filter((x) => x.t > 0 && x.t < 30).length;
    const late = a.filter((x) => x.t >= 60 && x.t < 90).length;
    expect(late).toBeGreaterThan(early);
    expect(a.length).toBeGreaterThan(25);
  });
});

describe('pickPerson', () => {
  it('不重复；过期的一定是月卡；访客没有卡', () => {
    const rng = rngOf(1, 'checkin', 'who');
    const used = new Set<string>();
    const ids = Array.from({ length: 30 }, () => pickPerson(rng, 'member', pools, used).id);
    expect(new Set(ids).size).toBe(30);
    expect(pickPerson(rng, 'expired', pools, used).member.kind).toBe('monthly');
    expect(['day', 'none']).toContain(pickPerson(rng, 'guest', pools, used).member.kind);
    expect(pickPerson(rng, 'vip', pools, used).tier).toBe('named');
  });
});

describe('dealCards', () => {
  const rng = rngOf(1, 'checkin', 'deal');
  it('会员：本人的卡在里面一张，干扰项不重复、和本人看得出不一样', () => {
    for (let i = 0; i < 40; i++) {
      const who = pools.members[(i * 7) % pools.members.length];
      const cards = dealCards(rng, who, 'member', pools.members, 4, 0.85);
      expect(cards).toHaveLength(4);
      expect(cards.filter((c) => c.id === who.id)).toHaveLength(1);
      expect(new Set(cards.map((c) => c.id)).size).toBe(4);
      for (const c of cards) if (c.id !== who.id) expect(looksDistinct(c.look, who.look)).toBe(true);
      expect(cards.find((c) => c.id === who.id)?.expired).toBe(false);
    }
  });
  it('过期月卡：本人那张是过期的；访客：没有他的卡', () => {
    const monthly = pools.members.find((p) => p.member.kind === 'monthly');
    if (!monthly) throw new Error('没有月卡会员');
    const c = dealCards(rng, monthly, 'expired', pools.members, 3, 0.5);
    expect(c.find((x) => x.id === monthly.id)?.expired).toBe(true);
    const g = pools.guests[0];
    const gc = dealCards(rng, g, 'guest', pools.members, 4, 0.5);
    expect(gc).toHaveLength(4);
    expect(gc.some((x) => x.id === g.id)).toBe(false);
  });
  it('难了以后干扰项更像本人', () => {
    const sim = (hard: number) => {
      const r = rngOf(3, 'checkin', `sim:${hard}`);
      let s = 0;
      for (let i = 0; i < 60; i++) {
        const who = pools.members[(i * 5) % pools.members.length];
        for (const c of dealCards(r, who, 'member', pools.members, 4, hard))
          if (c.id !== who.id) s += c.look.shirt === who.look.shirt ? 1 : 0;
      }
      return s;
    };
    expect(sim(0.85)).toBeGreaterThan(sim(0));
  });
});

describe('judge', () => {
  it('会员点对 / 点错 / 点访客', () => {
    expect(judge('a', 'member', { type: 'card', id: 'a', renew: false }).checkin).toBe(true);
    expect(judge('a', 'member', { type: 'card', id: 'b', renew: false }).ok).toBe(false);
    expect(judge('a', 'vip', { type: 'guest' }).ok).toBe(false);
  });
  it('访客只能访客登记', () => {
    expect(judge('g', 'guest', { type: 'guest' }).checkin).toBe(true);
    expect(judge('g', 'guest', { type: 'card', id: 'x', renew: false }).ok).toBe(false);
  });
  it('过期：点续费 = 续费；点卡身 = 签到但漏了续费；续费点在别人卡上 = 错', () => {
    const r = judge('m', 'expired', { type: 'card', id: 'm', renew: true });
    expect(r.upsell && r.checkin).toBe(true);
    const s = judge('m', 'expired', { type: 'card', id: 'm', renew: false });
    expect(s.checkin && s.missedUpsell && !s.upsell).toBe(true);
    expect(judge('m', 'expired', { type: 'card', id: 'x', renew: true }).ok).toBe(false);
  });
});

describe('分和耐心', () => {
  it('连击加分封顶', () => {
    expect(checkinPoints(1)).toBe(CHECKIN);
    expect(checkinPoints(2)).toBe(CHECKIN + 20);
    expect(checkinPoints(20)).toBe(CHECKIN + 100);
  });
  it('越到后面越急；队伍长了掉得快', () => {
    expect(patienceAt(80)).toBeLessThan(patienceAt(0));
    expect(drainRate(3)).toBe(1);
    expect(drainRate(8)).toBeGreaterThan(drainRate(5));
  });
  it('结算：剩的命有奖励', () => {
    const base = {
      checkins: 20,
      guests: 3,
      upsells: 2,
      missedUpsells: 1,
      vipOk: 2,
      vipTotal: 3,
      mistakes: 2,
      walkouts: 1,
      bestCombo: 6,
    };
    expect(settle({ ...base, lives: 2 }).bonus.map((b) => b.value)).toEqual([2 * LIFE_BONUS]);
    expect(settle({ ...base, lives: 0 }).bonus).toEqual([]);
    expect(settle({ ...base, lives: 1 }).lines[0].value).toBe('17');
  });
});

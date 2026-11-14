// named.ts 的数据检查：id、特质、牵连成对、位置在清点表里、同一天同一位置不撞、孩子 / 球童 / 裁判的位置放对的人、字段长度。
import { describe, expect, it } from 'vitest';
import { NAMED } from './named';
import { NAMED_TIES } from './named-ties';
import { TRAITS } from './traits';
import { type PersonKind, SCENES, type SceneId } from './types';

/**
 * 场景里能给 named 的人位（2026-11-13 clubwalk 清点表 /tmp/castwork/inventory.tsv 抄下来的）：
 * 没藏着的 'slot:' 槽位；会所按楼层显隐、中心球场按比赛阶段显隐的槽位也算（同名槽位在别的区域可见的不算）；
 * 停车场两个没有槽位名的代客（'#0' 代客泊车、'#1' 门童，clubpark 自己的 valet 资产）。值 = 那个人位用哪种 Q 版人建的。
 */
type SlotKind = PersonKind | 'valet';
const SLOTS: Record<SceneId, Record<string, SlotKind>> = {
  clubpark: { '#0': 'valet', '#1': 'valet' },
  clubdesk: {
    'member-serve': 'player',
    'member-q1': 'player',
    'member-q2': 'player',
    'member-q3': 'player',
    'member-in': 'player',
    'member-out': 'player',
  },
  clubpickle: {
    'lawn-player': 'player',
    'rally-w1': 'player',
    'rally-w2': 'player',
    'rally-e1': 'player',
    'rally-e2': 'player',
    'wait-1': 'player',
    'fan-a1': 'player',
    'fan-a2': 'player',
    'prom-1': 'player',
    'prom-2': 'player',
    'path-w': 'player',
    'path-s': 'player',
  },
  clubplaza: {
    kid: 'kid',
    parent: 'player',
    'sit-w1': 'player',
    'sit-w2': 'player',
    'sit-n1': 'player',
    'sit-n2': 'player',
    vendor: 'player',
    'member-drinks': 'player',
    'member-up': 'player',
    'member-cross': 'player',
  },
  clubstadium: {
    umpire: 'umpire',
    'player-a': 'player',
    'player-b': 'player',
    'kid-net-n': 'ball-kid',
    'kid-net-s': 'ball-kid',
    'kid-nw': 'ball-kid',
    'kid-ne': 'ball-kid',
    'kid-sw': 'ball-kid',
    'kid-se': 'ball-kid',
    'spec-aisle-w': 'player',
    vendor: 'player',
    'spec-south': 'player',
    'member-drink': 'player',
    'member-prom-1': 'player',
    'member-prom-2': 'player',
    'spec-link-1': 'player',
    'spec-link-2': 'player',
  },
  clubcourts: {
    coach: 'coach',
    'kid-hit': 'kid',
    'kid-q1': 'kid',
    'kid-q2': 'kid',
    'kid-q3': 'kid',
    'parent-1': 'player',
    'parent-2': 'player',
    'parent-3': 'player',
    'member-wait-1': 'player',
    'member-wait-2': 'player',
    'member-wait-3': 'player',
    'm-e1': 'player',
    'm-e2': 'player',
    'm-w1': 'player',
    'm-w2': 'player',
    teen: 'player',
  },
  clubclay: {
    umpire: 'coach',
    'spectator-1': 'player',
    'spectator-2': 'player',
    'spectator-3': 'player',
    server: 'player',
    'net-e': 'player',
    'net-w': 'player',
    returner: 'player',
    walker: 'player',
  },
  clubhouse: {
    'loggia-sit-1': 'player',
    'loggia-sip-1': 'player',
    'pool-walker': 'player',
    'shop-clerk': 'player',
    'shop-queue': 'player',
    'shop-stringer': 'coach',
    'shop-barista': 'player',
    'merch-clerk': 'player',
    'nutri-clerk': 'player',
    'kiosk-clerk': 'player',
    'kiosk-buyer': 'player',
    delivery: 'player',
    '2f-lounge-a': 'player',
    '2f-lounge-b': 'player',
    '2f-bartender': 'player',
    '2f-bar-sit': 'player',
    '2f-bar-stand': 'player',
    '2f-cook': 'player',
    '2f-terrace-a': 'player',
    '2f-terrace-b': 'player',
    'gym-presser': 'player',
    'gym-spotter': 'player',
    'gym-squatter': 'player',
    'gym-sled-pusher': 'player',
    'gym-coach': 'coach',
    'gym-patient': 'player',
    'gym-physio': 'player',
    'gym-boxer': 'player',
    'gym-desk-clerk': 'player',
    'gym-runner': 'player',
    'gym-cyclist': 'player',
    'gym-rower': 'player',
    'gym-laundry': 'player',
  },
  clubpool: {
    'cabana-w-sit': 'player',
    lifeguard: 'player',
    'swim-lap': 'player',
    'swim-2': 'player',
    'swim-parent': 'player',
    'swim-kid': 'kid',
    'edge-sit': 'player',
    'sun-1': 'player',
    'sun-2': 'player',
    'sun-3': 'player',
    'sun-4': 'player',
    'sun-w1': 'player',
    'sun-w2': 'player',
    'kid-shower': 'kid',
  },
  clubgolf: {
    putter: 'player',
    'pin-tender': 'player',
    teer: 'player',
    'tee-wait': 'player',
    'cart-driver': 'player',
  },
  clubfood: {
    'vendor-coffee': 'player',
    'vendor-taco': 'player',
    'vendor-pizza': 'player',
    'q-coffee-1': 'player',
    'q-coffee-2': 'player',
    'q-taco-1': 'player',
    'q-taco-2': 'player',
    'q-taco-3': 'player',
    'q-taco-kid': 'kid',
    'q-pizza-1': 'player',
    'q-pizza-2': 'player',
    'vendor-agua': 'player',
    'q-agua': 'player',
    'vendor-paleta': 'player',
    'kid-paleta': 'kid',
    'parent-paleta': 'player',
    'vendor-burger': 'player',
    'q-burger': 'player',
    'd-0n2': 'player',
    'd-0n3': 'player',
    'd-0n4': 'player',
    'd-1n1': 'player',
    'd-1s1': 'player',
    'd-1s2': 'player',
    'd-1n2': 'player',
    'd-1n3': 'player',
    'd-2n1': 'player',
    'd-2s1': 'player',
    'd-2s2': 'player',
    'walk-tray-1': 'player',
    'walk-tray-2': 'player',
    'fam-1': 'player',
    'fam-kid1': 'kid',
    'fam-kid2': 'kid',
    'pic-1a': 'player',
    'pic-1b': 'player',
    'kid-throw': 'kid',
    'kid-wait': 'kid',
    'kid-jenga': 'kid',
    'parent-lawn': 'player',
    'vendor-boba': 'player',
    'q-boba': 'player',
    'vendor-churro': 'player',
    'q-churro': 'player',
    'prom-1': 'player',
    'prom-2': 'player',
    'stadium-walker': 'player',
  },
};

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const ids = new Set(NAMED.map((p) => p.id));

describe('named 演员表', () => {
  it('人数够、id 唯一、tier 都是 named', () => {
    expect(NAMED.length).toBeGreaterThanOrEqual(55);
    expect(ids.size).toBe(NAMED.length);
    for (const p of NAMED) expect(p.tier).toBe('named');
  });

  it('特质存在，每人 1–3 个', () => {
    for (const p of NAMED) {
      expect(p.traits.length, p.id).toBeGreaterThanOrEqual(1);
      expect(p.traits.length, p.id).toBeLessThanOrEqual(3);
      for (const t of p.traits) expect(TRAITS[t], `${p.id}: ${t}`).toBeDefined();
    }
  });

  it('牵连指向存在的人、双向、不连自己、不重复，平均每人 ≥ 3 条', () => {
    const pairs = new Set<string>();
    for (const [a, b] of NAMED_TIES) {
      expect(ids.has(a), a).toBe(true);
      expect(ids.has(b), b).toBe(true);
      expect(a, `${a} 连了自己`).not.toBe(b);
      const key = [a, b].sort().join('|');
      expect(pairs.has(key), `重复的一对 ${key}`).toBe(false);
      pairs.add(key);
    }
    let total = 0;
    for (const p of NAMED) {
      total += p.ties.length;
      expect(p.ties.length, `${p.id} 至少两条牵连`).toBeGreaterThanOrEqual(2);
      for (const t of p.ties) {
        const other = NAMED.find((q) => q.id === t.with);
        expect(other, `${p.id} → ${t.with}`).toBeDefined();
        expect(
          other?.ties.some((u) => u.with === p.id && u.kind === t.kind),
          `${t.with} 没有回连 ${p.id}`,
        ).toBe(true);
        expect(t.note.length, `${p.id} → ${t.with} 的 note`).toBeGreaterThan(0);
        expect(t.note.length, `${p.id} → ${t.with} 的 note 太长`).toBeLessThanOrEqual(16);
      }
    }
    expect(total / NAMED.length).toBeGreaterThanOrEqual(3);
  });

  it('位置都在清点表里，种类对得上', () => {
    for (const p of NAMED) {
      expect(p.homes.length, `${p.id} 没有位置`).toBeGreaterThan(0);
      for (const h of p.homes) {
        expect(SCENES).toContain(h.scene);
        const kind = SLOTS[h.scene][h.slot];
        expect(kind, `${p.id}: ${h.scene}/${h.slot} 不在清点表里`).toBeDefined();
        if (kind === 'kid') expect(p.look.body, `${p.id} 放在孩子位 ${h.slot}`).toBe('kid');
        else expect(p.look.body, `${p.id} 是孩子，不能放在 ${h.slot}`).not.toBe('kid');
        if (kind === 'ball-kid') expect(p.look.body, `${p.id} 放在球童位 ${h.slot}`).toBe('teen');
        if (kind === 'umpire') expect(p.title, `${p.id} 放在裁判位`).toContain('裁判');
        if (kind === 'coach') expect(['coach', 'staff'], `${p.id} 放在教练位 ${h.slot}`).toContain(p.role);
        for (const d of h.days ?? []) expect(ALL_DAYS).toContain(d);
      }
    }
  });

  it('同一天同一位置只有一个人；一个人一天只占一个位置', () => {
    const taken = new Map<string, string>();
    for (const p of NAMED) {
      const myDays = new Set<number>();
      for (const h of p.homes) {
        for (const d of h.days ?? ALL_DAYS) {
          const key = `${h.scene}/${h.slot}/${d}`;
          expect(taken.get(key), `${key}：${taken.get(key)} 和 ${p.id} 撞了`).toBeUndefined();
          taken.set(key, p.id);
          expect(myDays.has(d), `${p.id} 周${d} 占了两个位置`).toBe(false);
          myDays.add(d);
        }
      }
    }
  });

  it('有一部分人不是天天来', () => {
    const partTime = NAMED.filter((p) => p.homes.some((h) => h.days && h.days.length < 7));
    expect(partTime.length).toBeGreaterThan(NAMED.length / 3);
  });

  it('字段齐全、长度合适', () => {
    for (const p of NAMED) {
      expect(p.title.length, p.id).toBeGreaterThan(0);
      expect(p.nameZh.length, `${p.id} nameZh`).toBeGreaterThanOrEqual(1);
      expect(p.nameZh.length, `${p.id} nameZh`).toBeLessThanOrEqual(5);
      expect(p.likes.length, `${p.id} likes`).toBeGreaterThanOrEqual(2);
      expect(p.likes.length, `${p.id} likes`).toBeLessThanOrEqual(3);
      expect(p.dislikes.length, `${p.id} dislikes`).toBeGreaterThanOrEqual(2);
      expect(p.dislikes.length, `${p.id} dislikes`).toBeLessThanOrEqual(3);
      expect(p.bio.length, `${p.id} bio`).toBeGreaterThan(40);
      expect(p.quirk, `${p.id} quirk`).toBeTruthy();
      const lines = Object.entries(p.lines ?? {});
      expect(lines.length, `${p.id} 至少三种处境的台词`).toBeGreaterThanOrEqual(3);
      for (const [k, arr] of lines) {
        for (const s of arr ?? []) expect(s.length, `${p.id}.${k}: ${s}`).toBeLessThanOrEqual(16);
      }
      expect(p.favor0).toBeGreaterThanOrEqual(0);
      expect(p.favor0).toBeLessThanOrEqual(10);
      const a = p.attrs;
      expect(a.ntrp).toBeGreaterThanOrEqual(1);
      expect(a.ntrp).toBeLessThanOrEqual(7);
      expect((a.ntrp * 2) % 1, `${p.id} ntrp 0.5 一档`).toBe(0);
      if (p.role === 'pro') expect(a.ntrp, p.id).toBeGreaterThanOrEqual(6.5);
      for (const v of [a.fitness, a.social, a.patience, a.spend, a.loyalty]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
      if (p.member.kind !== 'none' && p.member.kind !== 'day') expect(p.member.since, p.id).toBeDefined();
      if (p.look.height !== undefined) {
        expect(p.look.height).toBeGreaterThanOrEqual(0.92);
        expect(p.look.height).toBeLessThanOrEqual(1.08);
      }
      if (p.look.stout !== undefined) {
        expect(p.look.stout).toBeGreaterThanOrEqual(0.92);
        expect(p.look.stout).toBeLessThanOrEqual(1.3);
      }
      if (p.week) for (const d of p.week.days) expect(ALL_DAYS).toContain(d);
    }
  });

  it('外观用满肤色、发色、发型', () => {
    const skins = new Set(NAMED.map((p) => p.look.skin));
    const hairs = new Set(NAMED.map((p) => p.look.hair));
    const styles = new Set(NAMED.map((p) => p.look.hairStyle));
    expect(skins.size).toBe(6);
    expect(hairs.size).toBe(8);
    expect(styles.size).toBe(9);
  });
});

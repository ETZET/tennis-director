// 选角：这一天、这个位置上是谁（设计文档「三层人」）。
//   1. named 的 homes（days 对得上）
//   2. 员工位置（staff / vendor / coach / pro）：named 没占的日子由一个固定的 regular 员工顶上（每天都是他，不换人）
//   3. regular 熟面孔：约 90 个，每人一周来 1–5 天、偏好一两个场景，来的那天占一个合适的位置（同一个位置优先 = 习惯）
//   4. 剩下的位置-天 = 当天的客人（crowd）：id 'guest:<scene>:<slot>:<day>'，按需生成、缓存，同一天同一位置永远是同一个人
// 不变式：同一天同一位置只有一个人；一个人一天只在一个位置；位置的 kind / role 和人的体型、身份对得上。
// day = 游戏第几天（从 1 开始，第 1 天是周一）；每周的安排按 weekday = (day − 1) mod 7 重复，客人每天不同。
import { bodyFits, makePerson } from './crowd';
import { chance, int, type Rng, rngOf, sample, shuffle, weighted } from './rng';
import { guessRole, isFixedRole, SLOT_TABLE, slotInfo, slotKey } from './slots';
import type { Cast, CastPerson, Home, PersonKind, SceneId, SlotInfo, Week } from './types';

/** 生成的熟面孔人数（不算员工） */
export const REGULAR_COUNT = 90;

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
export const weekdayOf = (day: number) => (((day - 1) % 7) + 7) % 7;

export const guestId = (scene: SceneId, slot: string, day: number) => `guest:${scene}:${slot}:${day}`;
/** 'guest:<scene>:<slot>:<day>[:<kind>]' → 各段（slot 里没有冒号） */
export function parseGuestId(id: string): { scene: SceneId; slot: string; day: number; kind?: PersonKind } | null {
  const m = /^guest:([a-z]+):([^:]+):(-?\d+)(?::([a-z-]+))?$/.exec(id);
  if (!m) return null;
  return { scene: m[1] as SceneId, slot: m[2], day: Number(m[3]), kind: m[4] as PersonKind | undefined };
}

/** 偏好的营业时段（按特质） */
function hoursFor(r: Rng, p: CastPerson): [number, number] {
  if (p.traits.includes('earlybird')) return [7, int(r, 10, 12)];
  if (p.traits.includes('nightowl')) return [int(r, 16, 18), 22];
  const a = int(r, 7, 17);
  return [a, Math.min(22, a + int(r, 2, 5))];
}

export function buildCast(seed: number, named: readonly CastPerson[]): Cast {
  /** 'scene:slot' → 周几 → 人 id */
  const occ = new Map<string, (string | undefined)[]>();
  /** 人 id → 周几 → 在哪 */
  const at = new Map<string, (Home | undefined)[]>();
  const byId = new Map<string, CastPerson>();
  const regulars: CastPerson[] = [];

  const free = (key: string, wd: number) => !occ.get(key)?.[wd];
  const busy = (id: string, wd: number) => !!at.get(id)?.[wd];
  const take = (id: string, scene: SceneId, slot: string, wd: number): boolean => {
    const key = slotKey(scene, slot);
    if (!free(key, wd) || busy(id, wd)) return false;
    let row = occ.get(key);
    if (!row) occ.set(key, (row = []));
    row[wd] = id;
    let mine = at.get(id);
    if (!mine) at.set(id, (mine = []));
    mine[wd] = { scene, slot };
    return true;
  };

  // 1. named（先到先得；同一天两处的只认第一处）
  for (const p of named) {
    byId.set(p.id, p);
    for (const h of p.homes) for (const wd of h.days ?? ALL_DAYS) take(p.id, h.scene, h.slot, wd);
  }

  // 2. 员工位置：named 没占的日子 → 固定的 regular 员工
  for (const info of SLOT_TABLE) {
    if (!isFixedRole(info.role)) continue;
    const key = slotKey(info.scene, info.slot);
    const days = ALL_DAYS.filter((wd) => free(key, wd));
    if (!days.length) continue;
    const id = `staff:${info.scene}:${info.slot}`;
    const p = makePerson(seed, id, info, 'regular', { days });
    p.homes = [
      days.length === 7 ? { scene: info.scene, slot: info.slot } : { scene: info.scene, slot: info.slot, days },
    ];
    p.week = { days, hours: [7, 22] };
    for (const wd of days) take(id, info.scene, info.slot, wd);
    regulars.push(p);
    byId.set(id, p);
  }

  // 3. 熟面孔：从客人能坐的位置里挑一个"锚"（他最常在的地方），按锚的身份生成
  const patron = SLOT_TABLE.filter((s) => !isFixedRole(s.role));
  const anchorW = (s: SlotInfo) => (s.role === 'guest' ? 0.3 : s.slot.startsWith('#') ? 0.5 : 1);
  const fits = (p: CastPerson, s: SlotInfo) => s.role === p.role && bodyFits(p.look.body, s);
  const names = new Set([...named.map((p) => p.name), ...regulars.map((p) => p.name)]);
  for (let i = 0; i < REGULAR_COUNT; i++) {
    const r = rngOf(seed, 'regular', i);
    const anchor = weighted(
      r,
      patron.map((s): [SlotInfo, number] => [s, anchorW(s)]),
    );
    // 一周几天：会员多来，客人少来；孩子、家长周末多
    const n = weighted(r, [
      [1, anchor.role === 'guest' ? 30 : 12],
      [2, 30],
      [3, 30],
      [4, anchor.role === 'member' ? 18 : 8],
      [5, anchor.role === 'member' ? 10 : 3],
    ]);
    const weekend = anchor.role === 'kid' || anchor.role === 'parent';
    const days: number[] = [];
    const pool = ALL_DAYS.map((d): [number, number] => [d, weekend && d >= 5 ? 4 : 1]);
    while (days.length < n) {
      const d = weighted(
        r,
        pool.filter(([x]) => !days.includes(x)),
      );
      days.push(d);
    }
    days.sort((a, b) => a - b);
    let id = `reg:${i}`;
    let p = makePerson(seed, id, anchor, 'regular', { days });
    // 名字撞了换一个（名册里不出现两个同名的人）
    for (let k = 1; names.has(p.name) && k < 6; k++) {
      id = `reg:${i}~${k}`;
      p = makePerson(seed, id, anchor, 'regular', { days });
    }
    names.add(p.name);
    // 偏好的场景：锚所在的场景 + 0–2 个有合适位置的别处
    const others = [...new Set(patron.filter((s) => s.scene !== anchor.scene && fits(p, s)).map((s) => s.scene))];
    const prefer = [anchor.scene, ...sample(r, others, chance(r, 0.6) ? int(r, 1, 2) : 0)];
    const placed: number[] = [];
    let last: SlotInfo | null = null;
    for (const wd of days) {
      const tryOne = (s: SlotInfo | null) => !!s && fits(p, s) && take(id, s.scene, s.slot, wd);
      let ok = tryOne(anchor) || tryOne(last);
      if (!ok) {
        const near = shuffle(
          r,
          patron.filter((s) => prefer.includes(s.scene) && fits(p, s)),
        );
        for (const s of near) if ((ok = tryOne(s))) break;
      }
      if (!ok) {
        const any = shuffle(
          r,
          patron.filter((s) => fits(p, s)),
        );
        for (const s of any) if ((ok = tryOne(s))) break;
      }
      if (ok) {
        placed.push(wd);
        const h = at.get(id)?.[wd];
        last = h ? (slotInfo(h.scene, h.slot) ?? null) : last;
      }
    }
    if (!placed.length) continue;
    // homes：同一个位置的日子并成一条
    const homes: Home[] = [];
    for (const wd of placed) {
      const h = at.get(id)?.[wd] as Home;
      const same = homes.find((x) => x.scene === h.scene && x.slot === h.slot);
      if (same) same.days?.push(wd);
      else homes.push({ scene: h.scene, slot: h.slot, days: [wd] });
    }
    p.homes = homes;
    const week: Week = { days: placed, hours: hoursFor(rngOf(seed, 'hours', id), p) };
    p.week = week;
    regulars.push(p);
    byId.set(id, p);
  }

  // 4. 客人：懒生成 + 缓存
  const guests = new Map<string, CastPerson>();
  const guestAt = (scene: SceneId, slot: string, kind: PersonKind, day: number): CastPerson => {
    const info = slotInfo(scene, slot);
    const id = info || kind === 'player' ? guestId(scene, slot, day) : `${guestId(scene, slot, day)}:${kind}`;
    let g = guests.get(id);
    if (!g) {
      const use: SlotInfo = info ?? { scene, slot, kind, role: guessRole(kind), title: '路过的人' };
      g = makePerson(seed, id, use, 'crowd');
      guests.set(id, g);
    }
    return g;
  };

  const roster = [...named, ...regulars];
  const homeAt = (id: string, wd: number) => at.get(id)?.[wd];

  return {
    seed,
    get(id) {
      const p = byId.get(id) ?? guests.get(id);
      if (p) return p;
      const g = parseGuestId(id);
      if (!g) return undefined;
      return guestAt(g.scene, g.slot, g.kind ?? slotInfo(g.scene, g.slot)?.kind ?? 'player', g.day);
    },
    roster: () => roster.slice(),
    who(scene, slot, kind, day) {
      const id = occ.get(slotKey(scene, slot))?.[weekdayOf(day)];
      const p = id ? byId.get(id) : undefined;
      return p ?? guestAt(scene, slot, kind, day);
    },
    where(id, day) {
      const g = parseGuestId(id);
      if (g) return g.day === day ? [{ scene: g.scene, slot: g.slot }] : [];
      const h = homeAt(id, weekdayOf(day));
      return h ? [{ ...h }] : [];
    },
  };
}

/** 选角的统计（测试、报告用）：这一天 named / regular / 客人各占几个位置 */
export function castStats(cast: Cast, day: number): { named: number; regular: number; crowd: number } {
  const out = { named: 0, regular: 0, crowd: 0 };
  for (const s of SLOT_TABLE) out[cast.who(s.scene, s.slot, s.kind, day).tier]++;
  return out;
}

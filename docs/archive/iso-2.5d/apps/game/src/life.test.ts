import { Group, type IsoWorld, indianWells, type PeopleWorld, Person, Scheduler } from '@td/iso';
import type { GameState } from '@td/sim';
import { describe, expect, it } from 'vitest';
import { createLife } from './life';

/**
 * 园区日常的走位（准则 6 的画面）：背景里的会员、路人、客人都是走进来、走出去的，
 * 不会在原地忽然出现或消失，也不会一帧跳出去好几米；要快的时候用像素溶解。
 */

const site = indianWells.INDIAN_WELLS;

function setup(waiting: (s: GameState) => { anchor: string; served: boolean; unserved: number }[]) {
  const pw: PeopleWorld = { scene: new Group(), groundY: (x, z) => site.groundY(x, z), people: [] };
  const sched = new Scheduler();
  let seed = 1;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  let rallies = 0;
  const people: Person[] = [];
  const life = createLife({
    world: { scene: pw.scene } as unknown as IsoWorld,
    site,
    courtsAt: (_s, a) => site.courts[a]?.length ?? 0,
    sched,
    rnd,
    person: (i) => {
      const p = new Person(
        {
          name: `Member ${i + 1}`,
          x: 0,
          z: 0,
          base: 'relaxed',
          shirt: '#3a8fd9',
          shorts: '#f1ece0',
          skin: '#e0b08a',
          hair: '#3a2a1a',
          shoes: '#f1ece0',
        },
        pw,
      );
      p.root.visible = false;
      people.push(p);
      return p;
    },
    rally: () => {
      rallies++;
      return {
        stop() {
          rallies--;
        },
      };
    },
    busy: () => false,
    waiting,
  });
  return { life, sched, people, rallies: () => rallies };
}

const state = (t: number, members: number): GameState =>
  ({ t, weather: 'sun', season: 'summer', stats: { members }, facilities: {} }) as unknown as GameState;

/** 按倍速跑一段时间，逐帧检查有没有"一下子出现 / 消失 / 跳走"的人 */
function run(gmps: number, minutes: number, members: number, t0 = 8 * 60, jump?: { at: number; to: number }) {
  // 客人：每半小时换一种局面（有人接待 / 没人接待几处）
  const env = setup((s) => {
    const k = Math.floor(s.t / 30) % 4;
    return [
      { anchor: 'clubhouse', served: k % 2 === 0, unserved: k },
      { anchor: 'outer_1', served: k === 3, unserved: k === 1 ? 2 : 0 },
    ];
  });
  const dt = 1 / 30;
  let frac = 0;
  let t = t0;
  const pops: string[] = [];
  const prev = env.people.map(() => ({ vis: false, op: 1, x: 0, z: 0 }));
  let maxRallies = 0;
  let visibleMax = 0;
  for (let f = 0; t < t0 + minutes; f++) {
    frac += gmps * dt;
    const n = Math.floor(frac);
    frac -= n;
    t += n;
    if (jump && t >= jump.at && t < jump.to) t = jump.to;
    const s = state(t, members);
    env.sched.advance(dt);
    env.life.update(s, dt);
    for (const p of env.people) p.update(dt, env.sched.now);
    let vis = 0;
    env.people.forEach((p, i) => {
      const q = prev[i] as (typeof prev)[number];
      const v = p.root.visible;
      const op = p.sprite.opacity;
      if (v) vis++;
      // 第一帧（读档后的摆位）不算；一帧走 1.5 米以上算跳（和试玩扫描用的门槛一样）
      if (f > 0) {
        if (!q.vis && v && op > 0.25) pops.push(`f${f} ${p.name} 出现 op=${op.toFixed(2)}`);
        if (q.vis && !v && q.op > 0.25) pops.push(`f${f} ${p.name} 消失 op=${q.op.toFixed(2)}`);
        const d = Math.hypot(p.pos.x - q.x, p.pos.z - q.z);
        if (q.vis && v && d > 1.5) pops.push(`f${f} ${p.name} 跳了 ${d.toFixed(2)} 米`);
      }
      prev[i] = { vis: v, op, x: p.pos.x, z: p.pos.z };
    });
    visibleMax = Math.max(visibleMax, vis);
    maxRallies = Math.max(maxRallies, env.rallies());
  }
  return { pops, maxRallies, visibleMax, env };
}

describe('园区日常的走位', () => {
  it('1× 速度下：会员从门口走到场上打球，打完走回去，没有凭空出现、消失、跳位', () => {
    const r = run(6, 6 * 60, 40);
    expect(r.pops.slice(0, 5)).toEqual([]);
    expect(r.maxRallies).toBeGreaterThan(0);
  });

  it('8× 速度下：路走不完就在半路溶解出现、消失，同样不跳', () => {
    const r = run(48, 14 * 60, 40);
    expect(r.pops.slice(0, 5)).toEqual([]);
    expect(r.maxRallies).toBeGreaterThan(0);
  });

  it('关门以后所有背景人物都走掉了（溶解掉，不在半路消失）', () => {
    const r = run(12, 15 * 60, 60, 9 * 60);
    expect(r.pops.slice(0, 5)).toEqual([]);
    expect(r.visibleMax).toBeGreaterThan(4);
    // 跑到 24:00：场上没人打球；路人走到出口后溶解掉
    expect(r.env.rallies()).toBe(0);
    const shown = r.env.people.filter((p) => p.root.visible && p.name.startsWith('Member')).length;
    // 客人（按 waiting 的局面）还可能在等，场地和路人那 20 个人都走了
    expect(shown).toBeLessThanOrEqual(10);
    expect(r.env.people.slice(0, 20).filter((p) => p.root.visible)).toEqual([]);
  });

  it('时间一下跳过去（夜里跳过、调试跳天）：直接在位置上溶解出现、原地溶解掉，不一帧冒出来', () => {
    const r = run(12, 30 * 60, 60, 10 * 60, { at: 13 * 60, to: 1440 + 9 * 60 });
    expect(r.pops.slice(0, 5)).toEqual([]);
    expect(r.maxRallies).toBeGreaterThan(0);
  });
});

import { indianWells } from '@td/iso';
import { CONTENT, newGame, worldOf } from '@td/sim';
import { describe, expect, it } from 'vitest';
import { joinPoint, walkHeading, walkPoint, walkRate } from './walkpath';

/**
 * 走路的画面（QA P1-1）：人沿画面路线走，面朝的是路线此处的走向，不按每帧追插值点的零头。
 */
describe('walkpath', () => {
  const site = indianWells.INDIAN_WELLS;
  const s = newGame(CONTENT, { seed: 7 });
  const w = worldOf(s, CONTENT);
  const minutes = (a: string, b: string) => w.nav.get(a)?.find(([n]) => n === b)?.[1] ?? 1;

  it('沿着路线一路走，朝向始终和这一小段的位移方向一致（不回头）', () => {
    const walk = { from: 'entrance', to: 'outer_1', route: ['outer_1'], start: 0, end: minutes('entrance', 'outer_1') };
    let prev = walkPoint(site, w, walk, 0);
    for (let t = 0.25; t < walk.end; t += 0.25) {
      const p = walkPoint(site, w, walk, t);
      const yaw = walkHeading(site, w, walk, t);
      expect(yaw).not.toBeNull();
      const dx = p.x - prev.x;
      const dz = p.z - prev.z;
      // 拐角那一小步可能跨两段，只看走得够远、方向清楚的一步
      if (Math.hypot(dx, dz) > 0.05) {
        const dot = Math.sin(yaw as number) * dx + Math.cos(yaw as number) * dz;
        expect(dot / Math.hypot(dx, dz), `t=${t}`).toBeGreaterThan(-0.2);
      }
      prev = p;
    }
  });

  it('走到头还是这一段的走向，起点和终点就是两边的站位', () => {
    const walk = {
      from: 'entrance',
      to: 'plaza',
      route: ['plaza'],
      start: 100,
      end: 100 + minutes('entrance', 'plaza'),
    };
    const a = walkPoint(site, w, walk, 100);
    const b = walkPoint(site, w, walk, walk.end);
    expect(Math.hypot(a.x - (site.stands.entrance?.x ?? 0), a.z - (site.stands.entrance?.z ?? 0))).toBeLessThan(0.01);
    expect(Math.hypot(b.x - (site.stands.plaza?.x ?? 0), b.z - (site.stands.plaza?.z ?? 0))).toBeLessThan(0.01);
    expect(walkHeading(site, w, walk, walk.end)).not.toBeNull();
  });

  it('刚出发站在站位旁边：汇合点在插值点前面，按给的速度直走过去正好赶上', () => {
    const walk = {
      from: 'clubhouse',
      to: 'outer_1',
      route: ['outer_1'],
      start: 0,
      end: minutes('clubhouse', 'outer_1'),
    };
    const a = walkPoint(site, w, walk, 0);
    const from = { x: a.x - 1.2, z: a.z + 4.5 };
    const rate = walkRate(site, w, walk, 0);
    expect(rate).toBeGreaterThan(0);
    const speed = rate * 1.5;
    const j = joinPoint(site, w, walk, 0, from, speed);
    // 在路线上、在起点前面
    let tau = -1;
    for (let t = 0; t <= walk.end; t += 0.05) {
      const p = walkPoint(site, w, walk, t);
      if (Math.hypot(p.x - j.x, p.z - j.z) < 0.05) {
        tau = t;
        break;
      }
    }
    expect(tau).toBeGreaterThan(0);
    // 直走过去不晚于插值点，也不早太多（最早能赶上的那一点）
    const d = Math.hypot(j.x - from.x, j.z - from.z);
    expect(d / speed).toBeLessThanOrEqual(tau + 0.06);
    expect(d / speed).toBeGreaterThan(tau - 0.3);
    // 已经在路线上的人：汇合点就是插值点附近
    const on = joinPoint(site, w, walk, 3, walkPoint(site, w, walk, 3), speed);
    const q = walkPoint(site, w, walk, 3);
    expect(Math.hypot(on.x - q.x, on.z - q.z)).toBeLessThan(0.5);
  });

  it('追不上（速度太慢）：汇合点是终点', () => {
    const walk = {
      from: 'clubhouse',
      to: 'outer_1',
      route: ['outer_1'],
      start: 0,
      end: minutes('clubhouse', 'outer_1'),
    };
    const a = walkPoint(site, w, walk, 0);
    const j = joinPoint(site, w, walk, 0, { x: a.x, z: a.z + 30 }, 0.01);
    const b = site.stands.outer_1 ?? { x: 0, z: 0 };
    expect(Math.hypot(j.x - b.x, j.z - b.z)).toBeLessThan(0.01);
  });
});

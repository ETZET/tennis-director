import { indianWells } from '@td/iso';
import { CONTENT, newGame, worldOf } from '@td/sim';
import { describe, expect, it } from 'vitest';
import { walkHeading, walkPoint } from './walkpath';

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
});

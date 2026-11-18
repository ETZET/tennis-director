// 台阶当坡道走：坡道要穿过每一级踏面的中点（脚离踏面上下不超过半级）。穿过台阶前沿的话每级后半截脚悬空一整级
// （2026-11-18 导航体检查出来的：广场两段台阶、下草坪、看台的端梯和走道）。
import { describe, expect, it } from 'vitest';
import { STAIRS } from '../clubdesk/layout';
import { STADIUM_LINK, STADIUM_LINK_RAMP } from '../clubplaza/layout';
import { NavMap, type Ramp, rampFromStairs } from '../clubsite/play';
import { STAND_RAMPS, STANDS } from '../clubstadium/layout';

/** 只有这些坡道的导航，地面 0：高度 = 坡道插值 */
const heightOn = (ramps: Ramp[]) => {
  const nav = new NavMap({ groundAt: () => 0, bounds: { x0: -100, x1: 100, z0: -100, z1: 100 }, ramps, cell: 1000 });
  return (x: number, z: number) => nav.height(x, z) as number;
};

describe('台阶的坡道穿过踏面中点', () => {
  it('rampFromStairs（clubdesk / clubplaza 的 stairsGeo：第 k 级踏面高 from − rise·(k + 1)）', () => {
    for (const s of STAIRS) {
      const h = heightOn([rampFromStairs(s)]);
      const rise = (s.from - s.to) / s.steps;
      const x = (s.x0 + s.x1) / 2;
      for (let k = 0; k < s.steps; k++) {
        const mid = s.z0 + (k + 0.5) * s.run;
        expect(h(x, mid)).toBeCloseTo(s.from - rise * (k + 1), 6);
      }
    }
  });

  it('广场西沿去看台的台阶（terrain.ts：第 k 级踏面 x1 − (k + 1)·run … x1 − k·run）', () => {
    const st = STADIUM_LINK.stairs;
    const h = heightOn([STADIUM_LINK_RAMP]);
    const rise = 1.2 / st.steps;
    for (let k = 0; k < st.steps; k++) {
      const mid = st.x1 - (k + 0.5) * st.run;
      expect(h(mid, (st.z0 + st.z1) / 2)).toBeCloseTo(1.2 - rise * (k + 1), 6);
    }
  });

  it('北看台：走道（半级 0.45 × 0.6）和西头端梯（12 步）离踏面不超过 0.05 米', () => {
    const h = heightOn(STAND_RAMPS);
    const N = STANDS.north;
    // 走道：第 j 个踏面 z −30 − 0.6j … −30.6 − 0.6j、高 0.9 + 0.45j（到第 9 个，再上去是横走道 5.4）
    for (const c of STANDS.aisles)
      for (let j = 0; j < 10; j++)
        expect(Math.abs(h(c, N.front - 0.3 - 0.6 * j) - (0.9 + 0.45 * j))).toBeLessThan(0.05);
    // 端梯：z −29.6 到后墙脚 −37.2 分 12 步，第 i 步高 0.45(i + 1)
    const run = (N.front + 0.4 - (N.front - N.n * N.deep)) / 12;
    for (let i = 0; i < 11; i++)
      expect(Math.abs(h(N.x0 - 0.6, N.front + 0.4 - run * (i + 0.5)) - 0.45 * (i + 1))).toBeLessThan(0.05);
  });
});

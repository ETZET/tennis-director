import { indianWells } from '@td/iso';
import { CONTENT } from '@td/sim';
import { describe, expect, it } from 'vitest';

/**
 * 归档（ADR 0027）：原来在 apps/game/src/game.test.ts 里，查 2.5D 地图（Indian Wells）的站位、步道长度
 * 和内容里的 nav 分钟数对得上。画面换成 3D 以后，新场景接回游戏时要有同样的检查。
 */

describe('Indian Wells map ↔ content nav', () => {
  const act = CONTENT.acts.find((a) => a.id === 'indian_wells');
  const site = indianWells.INDIAN_WELLS;
  /** 地块（W5）的新锚点：站位和中心在 LAND_STANDS / LAND_ANCHORS（没并进 Site.stands，免得闲逛的人走过去） */
  const land = indianWells.LAND_STANDS as Record<string, { x: number; z: number }>;
  const landCenters = indianWells.LAND_ANCHORS as Record<string, { x: number; z: number }>;
  const plotAnchors = new Set((act?.plots ?? []).flatMap((p) => Object.values(p.variants).map((v) => v.anchor)));
  it('every anchor has a stand and a center in the scene; every facility anchor is an anchor', () => {
    for (const a of act?.anchors ?? []) {
      expect(site.stands[a] ?? (plotAnchors.has(a) ? land[a] : undefined), a).toBeDefined();
      expect(site.anchors[a] ?? (plotAnchors.has(a) ? landCenters[a] : undefined), a).toBeDefined();
    }
    for (const f of CONTENT.facilities) expect(act?.anchors, f.id).toContain(f.anchor);
  });
  it('nav connects every pair, and minutes match the drawn route length at walking speed (±1 min)', () => {
    const n = act?.anchors.length ?? 0;
    expect(act?.nav).toHaveLength((n * (n - 1)) / 2);
    for (const [a, b, mins] of act?.nav ?? []) {
      const line = site.routeLine(a, b);
      expect(line, `${a}–${b}`).not.toBeNull();
      const want = indianWells.polylineLength(line ?? []) / indianWells.WALK_METERS_PER_MINUTE;
      expect(Math.abs(mins - want), `${a}–${b}: ${mins} vs ${want.toFixed(1)}`).toBeLessThanOrEqual(1);
    }
  });
  it("plots: every variant anchor is that plot's place in the scene, and its walks stay on the (grown) slab", () => {
    const B = indianWells.BRIDGE;
    const rects = [
      indianWells.SLAB,
      ...indianWells.SE_GROW,
      indianWells.ISLE_DOCK,
      { x0: B.x - B.w / 2, x1: B.x + B.w / 2, z0: B.z0, z1: B.z1 },
    ];
    // 离地台外沿至少 m 米（路的终点不能落在岛边上）
    const inside = (x: number, z: number, m: number) =>
      rects.some((r) => x >= r.x0 + m && x <= r.x1 - m && z >= r.z0 + m && z <= r.z1 - m);
    for (const p of act?.plots ?? [])
      for (const [variant, v] of Object.entries(p.variants))
        expect(indianWells.PLOT_ANCHORS[p.id]?.[variant], `${p.id}.${variant}`).toBe(v.anchor);
    // 画面里每块地的每个变体（内容还没写地块时也查）：站位不在岛边，从每个地点走过去都在地台上
    const places = [...Object.keys(site.stands), ...Object.keys(land)];
    for (const vs of Object.values(indianWells.PLOT_ANCHORS))
      for (const anchor of Object.values(vs)) {
        const stand = land[anchor];
        expect(stand, anchor).toBeDefined();
        if (stand) expect(inside(stand.x, stand.z, 2), `${anchor} stand is at the island edge`).toBe(true);
        for (const b of places) {
          if (b === anchor) continue;
          const line = site.routeLine(b, anchor) ?? [];
          expect(line.length, `${b}–${anchor}`).toBeGreaterThan(1);
          for (let i = 1; i < line.length; i++) {
            const a0 = line[i - 1] as { x: number; z: number };
            const a1 = line[i] as { x: number; z: number };
            const n = Math.ceil(Math.hypot(a1.x - a0.x, a1.z - a0.z));
            for (let k = 0; k <= n; k++) {
              const x = a0.x + ((a1.x - a0.x) * k) / Math.max(1, n);
              const z = a0.z + ((a1.z - a0.z) * k) / Math.max(1, n);
              expect(inside(x, z, 0), `${b}–${anchor} leaves the slab at (${x.toFixed(1)}, ${z.toFixed(1)})`).toBe(
                true,
              );
            }
          }
        }
      }
  });
  it('every facility with courts has as many court frames in the scene as its best state', () => {
    for (const f of CONTENT.facilities) {
      const most = Math.max(...Object.values(f.states).map((x) => x.courts));
      expect(site.courts[f.anchor]?.length ?? 0, f.id).toBeGreaterThanOrEqual(most);
    }
  });
});

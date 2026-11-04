import { describe, expect, it } from 'vitest';
import { GroundPainter, rectsBounds, slabOutline } from './ground';

/** 地台由几块矩形拼成（ADR 0021）：外轮廓、地面贴图的遮罩和长大 */
describe('slab union', () => {
  it('a single rect is its own four walls', () => {
    const w = slabOutline([{ x0: 0, x1: 10, z0: 0, z1: 6 }]);
    expect(w).toHaveLength(4);
    expect(w.map((s) => `${s.nx},${s.nz}`).sort()).toEqual(['-1,0', '0,-1', '0,1', '1,0']);
  });
  it('overlapping / touching rects merge: no wall on the seam, collinear walls joined', () => {
    // L 形：基础 + 东南角往南长出一块（西边和基础的南边相接）
    const w = slabOutline([
      { x0: 0, x1: 10, z0: 0, z1: 10 },
      { x0: 4, x1: 10, z0: 10, z1: 16 },
    ]);
    expect(w).toHaveLength(6);
    // 东边一整面墙 z 0..16（两块的东墙并成一面）
    expect(w).toContainEqual({ x0: 10, x1: 10, z0: 0, z1: 16, nx: 1, nz: 0 });
    // 接缝 z = 10 上只剩 x 0..4 那一段（朝南）
    expect(w).toContainEqual({ x0: 0, x1: 4, z0: 10, z1: 10, nx: 0, nz: 1 });
    expect(w.some((s) => s.nz !== 0 && s.z0 === 10 && s.x0 >= 4)).toBe(false);
    // 周长不变
    const per = w.reduce((a, s) => a + (s.x1 - s.x0) + (s.z1 - s.z0), 0);
    expect(per).toBe(10 + 16 + 6 + 6 + 4 + 10);
  });
  it('disjoint rects (a docked islet) keep their own outline', () => {
    const w = slabOutline([
      { x0: 0, x1: 10, z0: 0, z1: 10 },
      { x0: 2, x1: 6, z0: 14, z1: 18 },
    ]);
    expect(w).toHaveLength(8);
  });
  it('ground texture covers the union bounds, masks the rest, and grows keeping painted texels', () => {
    const base = { x0: -4, x1: 4, z0: -4, z1: 4 };
    const g = new GroundPainter(base, 7);
    g.paintRect(-4, 4, -4, 4, (_x, _z, _c, i, j) => 100 + i + j * 1000);
    const before = g.get(1.1, -2.3);
    const ext = { x0: 0, x1: 8, z0: 4, z1: 10 };
    g.setExtent([base, ext]);
    expect({ x0: g.x0, x1: g.x1, z0: g.z0, z1: g.z1 }).toEqual(rectsBounds([base, ext]));
    // 西北角没动：原来的纹素原样留着、下标不变
    expect(g.get(1.1, -2.3)).toBe(before);
    // 新地是底色，框里不在地台上的是 0，而且 paintRect 不会画到外面去
    expect(g.get(5, 7)).toBe(7);
    expect(g.get(-3, 7)).toBe(0);
    g.paintRect(-4, 8, -4, 10, () => 9);
    expect(g.get(-3, 7)).toBe(0);
    expect(g.onSlab(-3, 7)).toBe(false);
    expect(g.onSlab(5, 7)).toBe(true);
    // 缩回一块：多出来的地清成 0
    g.setExtent([base]);
    expect(g.TW).toBe(40);
    expect(g.get(1.1, -2.3)).toBe(9);
  });
});

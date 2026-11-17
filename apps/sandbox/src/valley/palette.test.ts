// valley 市中心的新材质（palette.ts）和资产表（assets/）的规矩：material-spec.md 的色阶差、PROXY 借组不漏参数、资产各归各的批。
import { describe, expect, it } from 'vitest';
import { PAL as MAP_PAL } from '../clubmap2/palette';
import { BY_BATCH, SPECS } from './assets';
import { gradeKey, PAL, PROXY, swatchOpts, TOWN_KEYS } from './palette';

const L = (c: number) => 0.2126 * ((c >> 16) & 255) + 0.7152 * ((c >> 8) & 255) + 0.0722 * (c & 255);

describe('valley 调色板（市中心的新材质）', () => {
  it('老材质原样：clubmap2 的表一条不少、一个值不变', () => {
    for (const k of Object.keys(MAP_PAL)) expect(PAL[k as keyof typeof PAL]).toBe(MAP_PAL[k as keyof typeof MAP_PAL]);
  });

  it('PROXY：每个新材质都借了一个老材质名归组，借的那条没有 opts（不漏 lightUp 之类）', () => {
    for (const k of TOWN_KEYS) {
      const p = PROXY[k];
      expect(p in MAP_PAL, `${k} → ${p}`).toBe(true);
      expect((MAP_PAL[p] as { opts?: unknown }).opts, `${k} → ${p} 有 opts`).toBeUndefined();
      expect(gradeKey(k)).toBe(p);
    }
  });

  it('swatchOpts 盖掉借的那条的 ramp / tones / edge / convex', () => {
    for (const k of TOWN_KEYS) {
      const o = swatchOpts(k);
      expect(o.ramp).toBe(PAL[k].ramp);
      expect(o.tones).toBe(PAL[k].tones);
      expect(o.edge).toBe(PAL[k].edge);
      expect(o.convex).toBe(PAL[k].convex);
    }
  });

  it('色阶（material-spec.md）：高一级 / 低一级差 6～14，缝和亮边差 < 60；暗档高一级 ≤ 120；暗档比中档暗', () => {
    for (const k of TOWN_KEYS) {
      const t = PAL[k].tones;
      expect(t, k).toBeDefined();
      if (!t) continue;
      t.bands.forEach((b, i) => {
        const [base, hi, lo] = b.map((c) => L(c as number));
        expect(hi - base, `${k} 档 ${i} 高一级`).toBeGreaterThanOrEqual(5.5);
        expect(hi - base, `${k} 档 ${i} 高一级`).toBeLessThanOrEqual(14);
        expect(base - lo, `${k} 档 ${i} 低一级`).toBeGreaterThanOrEqual(5.5);
        expect(base - lo, `${k} 档 ${i} 低一级`).toBeLessThanOrEqual(14);
        expect(Math.abs(L(t.seam[i] as number) - base), `${k} 缝 ${i}`).toBeLessThan(60);
        expect(Math.abs(L(t.hi[i] as number) - base), `${k} 亮边 ${i}`).toBeLessThan(60);
      });
      expect(L(t.bands[2][1] as number), `${k} 暗档高一级`).toBeLessThanOrEqual(120);
      expect(L(t.bands[2][0] as number), `${k} 暗档`).toBeLessThan(L(t.bands[1][0] as number));
    }
  });

  it('大面积的亮面（墙、屋面、纸、白车身）亮档低一级 ≥ 170', () => {
    for (const k of ['tiltup', 'breezeBlock', 'roofMetal', 'newsprint', 'pvc', 'truckWhite', 'kraft'] as const) {
      const t = PAL[k].tones;
      if (!t) throw new Error(`${k} 没有 tones`);
      expect(L(t.bands[0][2] as number), k).toBeGreaterThanOrEqual(170);
    }
  });

  it('五金大超市用芥末黄 + 深海军蓝（用户 2026-11-16），没有青绿的 parapetTeal', () => {
    expect('hwMustard' in PAL && 'hwNavy' in PAL).toBe(true);
    expect('parapetTeal' in PAL).toBe(false);
  });
});

describe('valley 资产表（assets/）', () => {
  it('清单（specs.ts）的提议主色都在调色板里', () => {
    for (const [id, s] of Object.entries(SPECS)) expect(s.key in PAL, `${id}: ${s.key}`).toBe(true);
  });

  it('各栋的资产文件只放自己批的资产（清单里有的 id 批要对得上），id 不重复', () => {
    const seen = new Set<string>();
    for (const [b, rec] of Object.entries(BY_BATCH))
      for (const id of Object.keys(rec)) {
        expect(seen.has(id), `${id} 重复`).toBe(false);
        seen.add(id);
        if (SPECS[id]) expect(SPECS[id].batch, id).toBe(b);
      }
  });
});

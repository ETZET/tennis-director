import { describe, expect, it } from 'vitest';
import { type PixelArt, SLOT } from '../format';
import { ICON_ART } from '../icons';
import { GROUND_ANIMS, GROUND_PROPS } from './ground';
import { HELD } from './held';

/** 每张图：各行等宽、锚点在图内、每个字符都是槽位（含小写暗面）或 pal 里的颜色。 */
function check(name: string, a: PixelArt): void {
  const w = a.rows[0]?.length ?? 0;
  expect(w, name).toBeGreaterThan(0);
  for (const r of a.rows) expect(r.length, `${name}: ${r}`).toBe(w);
  expect(a.ox >= 0 && a.ox < w && a.oy >= 0 && a.oy < a.rows.length, `${name} 锚点`).toBe(true);
  for (const r of a.rows)
    for (const c of r) {
      if (c === '.') continue;
      const ok = c in SLOT || c.toUpperCase() in SLOT || (a.pal !== undefined && c in a.pal);
      expect(ok, `${name}: '${c}'`).toBe(true);
    }
}

describe('道具和图标素材', () => {
  it('手持道具', () => {
    for (const [k, a] of Object.entries(HELD)) check(k, a);
  });
  it('地上道具', () => {
    for (const [k, a] of Object.entries(GROUND_PROPS)) check(k, a);
    for (const [k, an] of Object.entries(GROUND_ANIMS)) for (const f of an.frames) check(k, f);
  });
  it('图标', () => {
    for (const [k, a] of Object.entries(ICON_ART)) check(k, a);
  });
});

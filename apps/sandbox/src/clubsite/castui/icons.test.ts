import { describe, expect, it } from 'vitest';
import { DICT } from '../hud/i18n';
import { PLACES } from '../hud/places';
import { ACT_GLYPH, ATTR_ROWS, TIE_GLYPH } from './pxcard';

// 一图一义（redo-ui.md「第三轮」）：在干什么、牵连、属性三组图标互不重用，组里也不重用
describe('一图一义', () => {
  const groups: Record<string, string[]> = {
    activity: Object.values(ACT_GLYPH),
    tie: Object.values(TIE_GLYPH),
    attr: ATTR_ROWS.map((a) => a.g),
  };
  it('三组图标互不重用', () => {
    const seen = new Map<string, string>();
    for (const [name, ids] of Object.entries(groups))
      for (const id of ids) {
        expect(seen.get(id), `${id}: ${seen.get(id)} / ${name}`).toBeUndefined();
        seen.set(id, name);
      }
  });
  it('每个图标都有名字（中英文）', () => {
    for (const k of Object.keys(ACT_GLYPH)) expect(DICT.zh[`do_${k}` as keyof typeof DICT.zh], k).toBeTruthy();
    for (const k of Object.keys(TIE_GLYPH)) expect(DICT.zh[`tie_${k}` as keyof typeof DICT.zh], k).toBeTruthy();
    for (const a of ATTR_ROWS) expect(DICT.zh[`attr_${a.k}` as keyof typeof DICT.zh], a.k).toBeTruthy();
    for (const id of Object.keys(PLACES))
      if (id.startsWith('club') && id !== 'club') expect(DICT.en[`pl_${id}` as keyof typeof DICT.en], id).toBeTruthy();
  });
});

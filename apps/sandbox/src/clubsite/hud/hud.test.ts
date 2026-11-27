import { describe, expect, it } from 'vitest';
import { KEYS } from './colors';
import { ACT, GLYPH } from './glyphs';
import { DICT } from './i18n';
import { BUBBLE, ICONS, MOODS, type MoodId, moodSprite, WEATHER_ICONS } from './icons';
import { moodOf } from './mood';
import { PLACES } from './places';
import { CHROMA_MAX, tame } from './sheet';
import type { Sprite } from './sprite';
import { HUD_CSS } from './style';

describe('moodOf', () => {
  it('台词 → 心情泡', () => {
    expect(moodOf('网松了，打不了')).toBe('wrench');
    expect(moodOf('有人吗？')).toBe('?');
    expect(moodOf('谢谢总监！')).toBe('heart');
    expect(moodOf('没水了…')).toBe('drop');
    expect(moodOf('谁来捡一下球？')).toBe('ball');
    expect(moodOf('等好久了')).toBe('wait');
    expect(moodOf('桌子好脏')).toBe('grr');
    expect(moodOf('请离场')).toBe('…');
    expect(moodOf('重发！')).toBe('!');
  });
});

describe('像素图标', () => {
  const all = { ...ICONS, ...MOODS, bubble: BUBBLE };
  for (const [id, s] of Object.entries(all))
    it(`${id}：只用调色板里的键`, () => {
      for (const r of s.rows) for (const ch of r) if (ch !== '.') expect(KEYS[ch], `${id} ${ch}`).toBeDefined();
    });
  it('按钮图标里面不超过 18×18（加描边 20×20）', () => {
    for (const [id, s] of Object.entries(ICONS)) {
      expect(s.rows.length, id).toBeLessThanOrEqual(18);
      for (const r of s.rows) expect(r.length, id).toBeLessThanOrEqual(18);
    }
  });
  it('心情字形 9×9，叠进气泡以后还是 11 宽', () => {
    for (const [id, s] of Object.entries(MOODS)) {
      expect(s.rows.length, id).toBe(9);
      for (const r of s.rows) expect(r.length, id).toBe(9);
      for (const r of moodSprite(id as MoodId).rows) expect(r.length).toBe(11);
    }
  });
  it('天气小图标 11×9', () => {
    for (const [id, s] of Object.entries(WEATHER_ICONS)) {
      expect(s.rows.length, id).toBe(9);
      for (const r of s.rows) expect(r.length, id).toBe(11);
      for (const r of s.rows) for (const ch of r) if (ch !== '.') expect(KEYS[ch], `${id} ${ch}`).toBeDefined();
    }
  });
});

describe('卡片的图标、地点剪影', () => {
  const sets: Record<string, Record<string, Sprite>> = { ACT, GLYPH, PLACES };
  for (const [name, set] of Object.entries(sets))
    it(`${name}：只用调色板里的键，每行一样宽`, () => {
      for (const [id, s] of Object.entries(set)) {
        const w = s.rows[0].length;
        for (const r of s.rows) {
          expect(r.length, `${name}.${id}`).toBe(w);
          for (const ch of r) if (ch !== '.') expect(s.keys?.[ch] ?? KEYS[ch], `${name}.${id} ${ch}`).toBeDefined();
        }
      }
    });
  it('地点剪影都是 13×9', () => {
    for (const [id, s] of Object.entries(PLACES)) {
      expect(s.rows.length, id).toBe(9);
      expect(s.rows[0].length, id).toBe(13);
    }
  });
});

describe('界面不比草帽艳', () => {
  // 草帽 = 画面唯一的焦点色（straw 亮档）。常驻界面（右下按钮、金币、日钟的太阳）用到的颜色：彩度（max − min）和亮度（max）都不超过它
  const chroma = (c: number) => {
    const ch = [(c >> 16) & 255, (c >> 8) & 255, c & 255];
    return Math.max(...ch) - Math.min(...ch);
  };
  const hat = KEYS.X;
  it('常驻图标（名册、地图、说话、手、箱子、金币）', () => {
    for (const id of ['roster', 'map', 'talk', 'hand', 'box', 'coin'] as const) {
      const s: Sprite = ICONS[id];
      for (const r of s.rows)
        for (const ch of r) {
          if (ch === '.') continue;
          const c = s.keys?.[ch] ?? KEYS[ch];
          expect(chroma(c), `${id} ${ch} #${c.toString(16)}`).toBeLessThanOrEqual(chroma(hat));
        }
    }
  });
});

describe('卡片、名册、小地图的小图压过彩度', () => {
  it('tame 以后每个颜色的彩度都 ≤ CHROMA_MAX（低于草帽）', () => {
    const chroma = (c: number) => {
      const ch = [(c >> 16) & 255, (c >> 8) & 255, c & 255];
      return Math.max(...ch) - Math.min(...ch);
    };
    for (const set of [ACT, GLYPH, PLACES] as Record<string, Sprite>[])
      for (const [id, s] of Object.entries(set)) {
        const t = tame(s);
        for (const v of Object.values(t.keys ?? {})) expect(chroma(v), id).toBeLessThanOrEqual(CHROMA_MAX);
      }
    expect(CHROMA_MAX).toBeLessThan(chroma(KEYS.X));
  });
});

describe('locked：动作键的槽永远在', () => {
  it('没活的动作键不藏（只剩一圈细边）', () => {
    expect(HUD_CSS).not.toMatch(/\.pxh-act\.empty\s*\{[^}]*(visibility:\s*hidden|display:\s*none)/);
  });
  it('界面上所有图标压过彩度以后都 ≤ CHROMA_MAX', () => {
    const chroma = (c: number) => {
      const ch = [(c >> 16) & 255, (c >> 8) & 255, c & 255];
      return Math.max(...ch) - Math.min(...ch);
    };
    for (const set of [ICONS, MOODS, WEATHER_ICONS] as Record<string, Sprite>[])
      for (const [id, s] of Object.entries(set))
        for (const v of Object.values(tame(s).keys ?? {})) expect(chroma(v), id).toBeLessThanOrEqual(CHROMA_MAX);
  });
});

describe('i18n', () => {
  it('中英两种语言的键一样', () => {
    expect(Object.keys(DICT.en).sort()).toEqual(Object.keys(DICT.zh).sort());
  });
});

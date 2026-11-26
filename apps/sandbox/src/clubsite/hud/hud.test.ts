import { describe, expect, it } from 'vitest';
import { KEYS } from './colors';
import { DICT } from './i18n';
import { BUBBLE, ICONS, MOODS, type MoodId, moodSprite, WEATHER_ICONS } from './icons';
import { moodOf } from './mood';

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
  it('心情字形 9×9，叠进气泡以后还是 15 宽', () => {
    for (const [id, s] of Object.entries(MOODS)) {
      expect(s.rows.length, id).toBe(9);
      for (const r of s.rows) expect(r.length, id).toBe(9);
      for (const r of moodSprite(id as MoodId).rows) expect(r.length).toBe(15);
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

describe('i18n', () => {
  it('中英两种语言的键一样', () => {
    expect(Object.keys(DICT.en).sort()).toEqual(Object.keys(DICT.zh).sort());
  });
});

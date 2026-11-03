import { describe, expect, it } from 'vitest';
import { FONT3x5, FONT5x7, textArt } from './index';

describe('textArt', () => {
  it('按字宽、字间距和描边算宽高', () => {
    // 'AB'：5 + 1 + 5 = 11 宽，7 高；描边四周各 1
    const a = textArt('AB');
    expect(a?.rows[0]?.length).toBe(13);
    expect(a?.rows.length).toBe(9);
    expect(a?.ox).toBe(6);
    expect(a?.oy).toBe(8);
    const b = textArt('AB', { outline: '' });
    expect(b?.rows[0]?.length).toBe(11);
    expect(b?.rows.length).toBe(7);
  });

  it('有下伸部的小写字母多一行', () => {
    expect(textArt('ag', { outline: '' })?.rows.length).toBe(8);
  });

  it('底色和留白', () => {
    const a = textArt('1', { font: '3x5', outline: '', bg: '#000000', pad: 2 });
    expect(a?.rows[0]?.length).toBe(3 + 4);
    expect(a?.rows.length).toBe(5 + 4);
    expect(a?.pal?.['3']).toBe('#000000');
  });

  it('小号字把小写转成大写', () => {
    expect(textArt('ok', { font: '3x5' })).not.toBeNull();
  });

  it('多行居中', () => {
    const a = textArt('AB\nA', { outline: '' });
    expect(a?.rows.length).toBe(7 + 2 + 7);
    expect(a?.rows[0]?.length).toBe(11);
  });

  it('不支持的字（中文）返回 null', () => {
    expect(textArt('好球')).toBeNull();
    expect(textArt('ACE 好')).toBeNull();
    expect(textArt('')).toBeNull();
  });

  it('字形各行等宽', () => {
    for (const font of [FONT5x7, FONT3x5])
      for (const [ch, g] of Object.entries(font)) {
        const w = g[0]?.length;
        for (const r of g) expect(r.length, ch).toBe(w);
      }
  });
});

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

/** 两个字形差几个像素（宽度不同时按左对齐比较，多出来的算不同）。 */
function diff(a: readonly string[], b: readonly string[]): number {
  let n = 0;
  const h = Math.max(a.length, b.length);
  const w = Math.max(a[0]?.length ?? 0, b[0]?.length ?? 0);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) if (((a[y]?.[x] ?? '.') === '#') !== ((b[y]?.[x] ?? '.') === '#')) n++;
  return n;
}

describe('容易认错的字', () => {
  // 试玩反馈：HUD 里 2 像 8、5 像 S。数字和长得像的字母至少差 2 个像素。
  const pairs = ['0O', '0D', '08', 'O8', 'D8', '2Z', '28', '5S', '56', '6S', '1I', '38', '8B', '3B', '0Q'];
  for (const [name, font] of [
    ['5x7', FONT5x7],
    ['3x5', FONT3x5],
  ] as const)
    it(name, () => {
      for (const [a = '', b = ''] of pairs.map((p) => [...p])) {
        const ga = font[a];
        const gb = font[b];
        if (!ga || !gb) continue;
        expect(diff(ga, gb), `${name} ${a}/${b}`).toBeGreaterThanOrEqual(name === '3x5' && `${a}${b}` === '08' ? 1 : 2);
      }
      if (name === '5x7') expect(diff(FONT5x7['1'] ?? [], FONT5x7.l ?? [])).toBeGreaterThanOrEqual(2);
    });

  it('3x5：2、5 是方角（和 Z、S 分得开）', () => {
    expect(FONT3x5['2']?.[2]).toBe('###');
    expect(FONT3x5['5']?.[0]).toBe('###');
    expect(FONT3x5.S?.[0]).toBe('.##');
  });
});

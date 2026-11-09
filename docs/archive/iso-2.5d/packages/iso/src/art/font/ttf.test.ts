import { describe, expect, it } from 'vitest';
import { FONT5x7 } from './index';
import { pixelDigitsCss, pixelDigitsTtf } from './ttf';

const u32 = (b: Uint8Array, at: number) =>
  ((b[at] ?? 0) * 2 ** 24 + ((b[at + 1] ?? 0) << 16) + ((b[at + 2] ?? 0) << 8) + (b[at + 3] ?? 0)) >>> 0;

describe('pixelDigitsTtf', () => {
  for (const bold of [false, true])
    it(bold ? '粗体' : '常规', () => {
      const f = pixelDigitsTtf(FONT5x7, { family: 'TD Digits', bold });
      expect(u32(f, 0)).toBe(0x00010000);
      const n = ((f[4] ?? 0) << 8) | (f[5] ?? 0);
      expect(n).toBe(10);
      // 整个字体的校验和固定是 0xB1B0AFBA；每张表的校验和对得上
      let sum = 0;
      for (let i = 0; i < f.length; i += 4) sum = (sum + u32(f, i)) >>> 0;
      expect(sum).toBe(0xb1b0afba);
      for (let i = 0; i < n; i++) {
        const rec = 12 + i * 16;
        const tag = String.fromCharCode(...f.slice(rec, rec + 4));
        const off = u32(f, rec + 8);
        const len = u32(f, rec + 12);
        if (tag === 'head') continue;
        let s = 0;
        for (let k = 0; k < len; k += 4) s = (s + u32(f, off + k)) >>> 0;
        expect(s, tag).toBe(u32(f, rec + 4));
      }
    });

  it('确定性，CSS 只覆盖数字', () => {
    expect(pixelDigitsCss(FONT5x7)).toBe(pixelDigitsCss(FONT5x7));
    expect(pixelDigitsCss(FONT5x7)).toContain('unicode-range:U+30-39');
  });
});

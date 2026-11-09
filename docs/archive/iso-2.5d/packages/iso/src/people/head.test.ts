import { describe, expect, it } from 'vitest';
import { personHead } from './head';

const LOOK = { name: 'x', x: 0, z: 0, shirt: '#2a6', shorts: '#223', skin: '#c96', hair: '#321', shoes: '#111' };

describe('personHead（每日结算卡的像素头像）', () => {
  it('裁出头和肩：给定行数、有像素、不碰 DOM', () => {
    const h = personHead(LOOK);
    expect(h).not.toBeNull();
    expect(h?.h).toBe(9);
    expect(h?.px.some((c) => c !== 0)).toBe(true);
  });
  it('发型换了，头像跟着换；小孩用小孩的精灵表', () => {
    const a = personHead({ ...LOOK, hairStyle: 'long' });
    const b = personHead({ ...LOOK, hairStyle: 'bald' });
    expect(Array.from(a?.px ?? [])).not.toEqual(Array.from(b?.px ?? []));
    expect(personHead({ ...LOOK, scale: 0.6 }, 7)?.h).toBe(7);
  });
});

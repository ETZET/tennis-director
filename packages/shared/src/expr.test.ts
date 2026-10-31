import { describe, expect, it } from 'vitest';
import { compileExpr, type ExprEnv, evalBool, evalNumber } from './expr';
import { mulberry32 } from './rng';

const env = (vars: Record<string, number | string | boolean>, seed = 1): ExprEnv => {
  const r = mulberry32(seed);
  return { get: (p) => vars[p], rand: r };
};

describe('表达式语言', () => {
  it('四则运算、优先级、括号、一元负号', () => {
    expect(evalNumber(compileExpr('1 + 2 * 3'), env({}))).toBe(7);
    expect(evalNumber(compileExpr('(1 + 2) * 3'), env({}))).toBe(9);
    expect(evalNumber(compileExpr('-2 * -3 - 1'), env({}))).toBe(5);
    expect(evalNumber(compileExpr('7 % 4'), env({}))).toBe(3);
  });

  it('点号变量、函数、三元、字符串比较', () => {
    const e = env({ 'stat.reputation': 45, 'facility.court_2': 'rented_pickleball' });
    expect(evalNumber(compileExpr('round(2 + stat.reputation / 15)'), e)).toBe(5);
    expect(evalNumber(compileExpr("facility.court_2 == 'rented_pickleball' ? 300 : 0"), e)).toBe(300);
    expect(evalNumber(compileExpr('clamp(stat.reputation, 0, 40)'), e)).toBe(40);
    expect(evalBool(compileExpr('stat.reputation > 40 && !false'), e)).toBe(true);
  });

  it('rand() 用传入的种子随机流', () => {
    const a = compileExpr('rand()');
    expect(evalNumber(a, env({}, 9))).toBe(mulberry32(9)());
  });

  it('语法错误、未知函数、未知变量在编译时就报错', () => {
    expect(() => compileExpr('1 +')).toThrow(/unexpected end/);
    expect(() => compileExpr('foo(1)')).toThrow(/unknown function/);
    expect(() => compileExpr('stat.nope + 1', (p) => p !== 'stat.nope')).toThrow(/unknown variable/);
    expect(() => compileExpr('round(1, 2)')).toThrow(/takes/);
  });

  it('记录用到的变量', () => {
    expect(compileExpr('stat.cash / 100 + coach.skill').vars).toEqual(['stat.cash', 'coach.skill']);
  });

  it('算不出有限数时报错', () => {
    expect(() => evalNumber(compileExpr('1 / 0'), env({}))).toThrow(/finite/);
  });
});

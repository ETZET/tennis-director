/**
 * 内容数据里用的小表达式语言：活动结果公式、导演的压力和权重、日常漂移。
 *
 *   20 + coach.skill * 0.5 * coach.attention + courts_open * 3
 *   round(2 + stat.reputation / 15 + rand() * 3)
 *   facility.court_2 == 'rented_pickleball' ? 300 : 0
 *
 * 支持：数字、'字符串'、点号路径变量、+ - * / %、比较、&& || !、三元、
 * 函数 min max clamp round floor ceil abs rand。
 * 先解析成闭包（内容编译时就能报语法错和未知变量），求值时传入变量解析器和随机数。
 */

export type Value = number | string | boolean;

export interface ExprEnv {
  /** 点号路径变量 → 值；未知变量返回 undefined（会被当成错误） */
  get(path: string): Value | undefined;
  /** [0,1) 随机数，来自模拟状态里的种子随机流 */
  rand(): number;
}

export interface CompiledExpr {
  readonly src: string;
  /** 用到的变量路径（内容校验用） */
  readonly vars: readonly string[];
  eval(env: ExprEnv): Value;
}

type Node = (env: ExprEnv) => Value;

const FUNCS: Record<string, { arity: [number, number]; fn: (args: number[], env: ExprEnv) => number }> = {
  min: { arity: [1, 9], fn: (a) => Math.min(...a) },
  max: { arity: [1, 9], fn: (a) => Math.max(...a) },
  clamp: { arity: [3, 3], fn: ([v = 0, lo = 0, hi = 0]) => Math.max(lo, Math.min(hi, v)) },
  round: { arity: [1, 1], fn: ([v = 0]) => Math.round(v) },
  floor: { arity: [1, 1], fn: ([v = 0]) => Math.floor(v) },
  ceil: { arity: [1, 1], fn: ([v = 0]) => Math.ceil(v) },
  abs: { arity: [1, 1], fn: ([v = 0]) => Math.abs(v) },
  rand: { arity: [0, 0], fn: (_a, env) => env.rand() },
};

export class ExprError extends Error {
  constructor(
    message: string,
    readonly src: string,
    readonly at: number,
  ) {
    super(`${message} (at ${at} in "${src}")`);
  }
}

interface Tok {
  t: 'num' | 'str' | 'id' | 'op' | 'end';
  v: string;
  at: number;
}

function lex(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i] as string;
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    const at = i;
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j] as string)) j++;
      out.push({ t: 'num', v: src.slice(i, j), at });
      i = j;
    } else if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_.]/.test(src[j] as string)) j++;
      out.push({ t: 'id', v: src.slice(i, j), at });
      i = j;
    } else if (c === "'" || c === '"') {
      const j = src.indexOf(c, i + 1);
      if (j < 0) throw new ExprError('unterminated string', src, i);
      out.push({ t: 'str', v: src.slice(i + 1, j), at });
      i = j + 1;
    } else {
      const two = src.slice(i, i + 2);
      if (['<=', '>=', '==', '!=', '&&', '||'].includes(two)) {
        out.push({ t: 'op', v: two, at });
        i += 2;
      } else if ('+-*/%<>!?:(),'.includes(c)) {
        out.push({ t: 'op', v: c, at });
        i++;
      } else throw new ExprError(`unexpected character '${c}'`, src, i);
    }
  }
  out.push({ t: 'end', v: '', at: src.length });
  return out;
}

const num = (v: Value): number => (typeof v === 'number' ? v : typeof v === 'boolean' ? (v ? 1 : 0) : Number.NaN);
const truthy = (v: Value): boolean => (typeof v === 'string' ? v.length > 0 : Boolean(v));

/** 解析表达式。knownVar 返回 false 的变量会在这里就报错。 */
export function compileExpr(src: string, knownVar: (path: string) => boolean = () => true): CompiledExpr {
  const toks = lex(src);
  let p = 0;
  const vars: string[] = [];
  const peek = () => toks[p] as Tok;
  const next = () => toks[p++] as Tok;
  const expect = (v: string) => {
    const t = next();
    if (t.v !== v || t.t === 'str') throw new ExprError(`expected '${v}'`, src, t.at);
  };

  const primary = (): Node => {
    const t = next();
    if (t.t === 'num') {
      const v = Number(t.v);
      if (Number.isNaN(v)) throw new ExprError(`bad number '${t.v}'`, src, t.at);
      return () => v;
    }
    if (t.t === 'str') {
      const v = t.v;
      return () => v;
    }
    if (t.t === 'id') {
      if (t.v === 'true') return () => true;
      if (t.v === 'false') return () => false;
      if (peek().v === '(') {
        const f = FUNCS[t.v];
        if (!f) throw new ExprError(`unknown function '${t.v}'`, src, t.at);
        next();
        const args: Node[] = [];
        if (peek().v !== ')') {
          args.push(expr());
          while (peek().v === ',') {
            next();
            args.push(expr());
          }
        }
        expect(')');
        if (args.length < f.arity[0] || args.length > f.arity[1])
          throw new ExprError(`'${t.v}' takes ${f.arity.join('–')} arguments`, src, t.at);
        return (env) =>
          f.fn(
            args.map((a) => num(a(env))),
            env,
          );
      }
      if (!knownVar(t.v)) throw new ExprError(`unknown variable '${t.v}'`, src, t.at);
      vars.push(t.v);
      const path = t.v;
      return (env) => {
        const v = env.get(path);
        if (v === undefined) throw new ExprError(`unknown variable '${path}'`, src, t.at);
        return v;
      };
    }
    if (t.v === '(') {
      const e = expr();
      expect(')');
      return e;
    }
    throw new ExprError(t.t === 'end' ? 'unexpected end' : `unexpected '${t.v}'`, src, t.at);
  };
  const unary = (): Node => {
    const t = peek();
    if (t.t === 'op' && (t.v === '-' || t.v === '!')) {
      next();
      const a = unary();
      return t.v === '-' ? (env) => -num(a(env)) : (env) => !truthy(a(env));
    }
    return primary();
  };
  const bin = (sub: () => Node, ops: string[], f: (op: string, a: Value, b: Value) => Value) => (): Node => {
    let left = sub();
    while (peek().t === 'op' && ops.includes(peek().v)) {
      const op = next().v;
      const l = left;
      const r = sub();
      left = (env) => f(op, l(env), r(env));
    }
    return left;
  };
  const mul = bin(unary, ['*', '/', '%'], (op, a, b) =>
    op === '*' ? num(a) * num(b) : op === '/' ? num(a) / num(b) : num(a) % num(b),
  );
  const add = bin(mul, ['+', '-'], (op, a, b) => (op === '+' ? num(a) + num(b) : num(a) - num(b)));
  const cmp = bin(add, ['<', '<=', '>', '>=', '==', '!='], (op, a, b) => {
    if (op === '==') return a === b || (typeof a !== 'string' && typeof b !== 'string' && num(a) === num(b));
    if (op === '!=') return !(a === b || (typeof a !== 'string' && typeof b !== 'string' && num(a) === num(b)));
    const x = num(a);
    const y = num(b);
    return op === '<' ? x < y : op === '<=' ? x <= y : op === '>' ? x > y : x >= y;
  });
  const and = bin(cmp, ['&&'], (_o, a, b) => truthy(a) && truthy(b));
  const or = bin(and, ['||'], (_o, a, b) => truthy(a) || truthy(b));
  function expr(): Node {
    const c = or();
    if (peek().v === '?') {
      next();
      const a = expr();
      expect(':');
      const b = expr();
      return (env) => (truthy(c(env)) ? a(env) : b(env));
    }
    return c;
  }

  const root = expr();
  if (peek().t !== 'end') throw new ExprError(`unexpected '${peek().v}'`, src, peek().at);
  return { src, vars, eval: root };
}

/** 求一个数；结果不是有限数时报错（内容写错了比悄悄算出 NaN 好）。 */
export function evalNumber(e: CompiledExpr, env: ExprEnv): number {
  const v = num(e.eval(env));
  if (!Number.isFinite(v)) throw new ExprError('expression did not produce a finite number', e.src, 0);
  return v;
}

export const evalBool = (e: CompiledExpr, env: ExprEnv): boolean => truthy(e.eval(env));

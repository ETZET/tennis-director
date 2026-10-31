import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { compileContent } from './compile';
import { CONTENT } from './index';
import { minutes } from './schema';

const DATA = join(dirname(fileURLToPath(import.meta.url)), '../data');
const files = (): Record<string, string> => {
  const out: Record<string, string> = {};
  const walk = (d: string) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p);
      else out[relative(DATA, p).split('\\').join('/')] = readFileSync(p, 'utf8');
    }
  };
  walk(DATA);
  return out;
};
const msgs = (r: ReturnType<typeof compileContent>, kind: 'errors' | 'warnings' = 'errors') =>
  r[kind].map((e) => `${e.file}: ${e.message}`).join('\n');

describe('内容编译', () => {
  it('仓库里的内容没有错误，生成的 JSON 和 YAML 一致', () => {
    const r = compileContent(files());
    expect(msgs(r)).toBe('');
    expect(r.bundle?.version).toBe(CONTENT.version);
  });

  it('第一幕至少有切片要求的 15 张卡（M3 起策划可以继续加）', () => {
    const n = CONTENT.cards.filter((c) => c.act === 'hollow_creek').length;
    expect(n).toBeGreaterThanOrEqual(15);
  });

  it('引用不存在的卡、锚点、状态量都会报错', () => {
    const f = files();
    f['events/hollow_creek/hc_fix_court1.yaml'] = (f['events/hollow_creek/hc_fix_court1.yaml'] as string)
      .replace('location: court_1', 'location: court_9')
      .replace('{ stat: quality, add: 2 }', '{ stat: qualty, add: 2 }');
    f['events/hollow_creek/hc_bubble_quote.yaml'] = (f['events/hollow_creek/hc_bubble_quote.yaml'] as string).replace(
      'effects: []',
      'effects: [{ schedule: hc_nope, in: 1h }]',
    );
    const r = compileContent(f);
    expect(r.bundle).toBeNull();
    const m = msgs(r);
    expect(m).toMatch(/unknown anchor 'court_9'/);
    expect(m).toMatch(/unknown stat 'qualty'/);
    expect(m).toMatch(/unknown card 'hc_nope'/);
  });

  it('倒计时卡必须有默认后果；文案缺键报错；表达式写错报错', () => {
    const f = files();
    f['events/hollow_creek/hc_crow_ball.yaml'] = (f['events/hollow_creek/hc_crow_ball.yaml'] as string).replace(
      'default: { then: C }',
      '',
    );
    f['activities/fundraiser.yaml'] = (f['activities/fundraiser.yaml'] as string).replace(
      'stat.reputation * 12',
      'stat.reputashun * 12',
    );
    f['i18n/zh.yaml'] = (f['i18n/zh.yaml'] as string).replace('      B: 给球筐加个盖 · −$40\n', '');
    const m = msgs(compileContent(f));
    expect(m).toMatch(/countdown needs a default/);
    expect(m).toMatch(/unknown variable 'stat.reputashun'/);
    expect(m).toMatch(/missing text 'events.hc_crow_ball.options.B' in i18n\/zh.yaml/);
  });

  it('只被读、从未被写的标记给出警告；两个选项效果相同给出警告', () => {
    const f = files();
    f['events/hollow_creek/hc_ball_order.yaml'] = (f['events/hollow_creek/hc_ball_order.yaml'] as string)
      .replace('when: { hour: { lte: 12 } }', 'when: { flag: crow_friend }')
      .replace(
        '      - { stat: reputation, add: -1 }\n      - { stat: quality, add: 1 }',
        '      - { stat: quality, add: -1 }',
      );
    const r = compileContent(f);
    expect(msgs(r, 'warnings')).toMatch(/flag 'crow_friend' is read but never written/);
    expect(msgs(r, 'warnings')).toMatch(/options B and C have identical effects/);
  });

  it('只改暗处标记的选项给出警告（玩法准则 2）', () => {
    const f = files();
    f['events/hollow_creek/hc_dale_phone.yaml'] = (f['events/hollow_creek/hc_dale_phone.yaml'] as string).replace(
      '      - { stat: quality, add: 1 }\n      - { stat: reputation, add: -1 }\n',
      '',
    );
    expect(msgs(compileContent(f), 'warnings')).toMatch(/options\.B: only sets hidden flags/);
  });

  it('文件名必须和 id 一致', () => {
    const f = files();
    f['events/hollow_creek/hc_crow.yaml'] = f['events/hollow_creek/hc_crow_ball.yaml'] as string;
    delete f['events/hollow_creek/hc_crow_ball.yaml'];
    expect(msgs(compileContent(f))).toMatch(/must match the file name/);
  });

  it('时长换算成游戏分钟', () => {
    expect(minutes('30m')).toBe(30);
    expect(minutes('2h')).toBe(120);
    expect(minutes('1d')).toBe(1440);
    expect(minutes('1.5h')).toBe(90);
  });
});

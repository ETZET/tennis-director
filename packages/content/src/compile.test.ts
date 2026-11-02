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

  it('Indian Wells 有开局、招聘日、期限这几张必须的卡；每个设施都有修复工单', () => {
    const ids = CONTENT.cards.filter((c) => c.act === 'indian_wells').map((c) => c.id);
    for (const c of ['iw_arrival', 'iw_hiring_day_1', 'iw_deadline']) expect(ids).toContain(c);
    for (const f of CONTENT.facilities)
      expect(
        CONTENT.orders.some((o) => o.effects.some((e) => 'facility' in e && e.facility === f.id)),
        f.id,
      ).toBe(true);
  });

  it('引用不存在的卡、锚点、状态量、设施都会报错', () => {
    const f = files();
    f['events/indian_wells/iw_first_players.yaml'] = (f['events/indian_wells/iw_first_players.yaml'] as string)
      .replace('location: outer_1', 'location: outer_9')
      .replace('{ stat: reputation, add: 3 }', '{ stat: reputashun, add: 3 }');
    f['events/indian_wells/iw_sponsor.yaml'] = (f['events/indian_wells/iw_sponsor.yaml'] as string).replace(
      '      - { stat: reputation, add: 2 }\n',
      '      - { schedule: iw_nope, in: 1h }\n      - { condition: stadium_9, add: -5 }\n',
    );
    const r = compileContent(f);
    expect(r.bundle).toBeNull();
    const m = msgs(r);
    expect(m).toMatch(/unknown anchor 'outer_9'/);
    expect(m).toMatch(/unknown stat 'reputashun'/);
    expect(m).toMatch(/unknown card 'iw_nope'/);
    expect(m).toMatch(/unknown facility 'stadium_9'/);
  });

  it('倒计时卡必须有默认后果；文案缺键报错；表达式写错报错', () => {
    const f = files();
    f['events/indian_wells/iw_sponsor.yaml'] = (f['events/indian_wells/iw_sponsor.yaml'] as string).replace(
      'default: { then: B }',
      '',
    );
    f['posts/o1_rental.yaml'] = (f['posts/o1_rental.yaml'] as string).replace(
      'stat.reputation / 120',
      'stat.reputashun / 120',
    );
    f['i18n/zh.yaml'] = (f['i18n/zh.yaml'] as string).replace('      B: 婉拒\n', '');
    const m = msgs(compileContent(f));
    expect(m).toMatch(/countdown needs a default/);
    expect(m).toMatch(/unknown variable 'stat.reputashun'/);
    expect(m).toMatch(/missing text 'events.iw_sponsor.options.B' in i18n\/zh.yaml/);
  });

  it('只被读、从未被写的标记给出警告；两个选项效果相同给出警告', () => {
    const g = files();
    g['events/indian_wells/iw_first_players.yaml'] = (g['events/indian_wells/iw_first_players.yaml'] as string)
      .replace('when: { any: [', 'when: { any: [{ flag: crow_friend }, ')
      .replace(
        / {2}B:\n {4}# 照价收：钱是钱\n {4}effects:\n[\s\S]*?default/,
        '  B:\n    effects:\n      - { stat: reputation, add: 3 }\n      - { stat: members, add: 2 }\ndefault',
      );
    const rg = compileContent(g);
    expect(msgs(rg, 'warnings')).toMatch(/flag 'crow_friend' is read but never written/);
    expect(msgs(rg, 'warnings')).toMatch(/options A and B have identical effects/);
  });

  it('只改暗处标记的选项给出警告（玩法准则 2）', () => {
    const f = files();
    f['events/indian_wells/iw_arrival.yaml'] = (f['events/indian_wells/iw_arrival.yaml'] as string).replace(
      '      - { person: dale, add: { morale: 5 } }\n',
      '',
    );
    expect(msgs(compileContent(f), 'warnings')).toMatch(/options\.A: only sets hidden flags/);
  });

  it('人物：候选人要有作用和一句话背景；only 只能写作用或特质；person: worker 只能用在岗位和工单里', () => {
    const f = files();
    f['people/indian_wells.yaml'] = (f['people/indian_wells.yaml'] as string).replace('    kind: crew,\n', '');
    f['i18n/en.yaml'] = (f['i18n/en.yaml'] as string).replace(/ {2}ben_kim: A UC Riverside[^\n]*\n/, '');
    f['posts/pr_training.yaml'] = (f['posts/pr_training.yaml'] as string).replace('only: [player]', 'only: [plaier]');
    f['events/indian_wells/iw_sponsor.yaml'] = (f['events/indian_wells/iw_sponsor.yaml'] as string).replace(
      '      - { stat: reputation, add: 2 }\n',
      '      - { person: worker, add: { morale: 1 } }\n',
    );
    const m = msgs(compileContent(f));
    expect(m).toMatch(/rosa_ortiz: candidates need a kind/);
    expect(m).toMatch(/missing text 'bios.ben_kim' in i18n\/en.yaml/);
    expect(m).toMatch(/only: 'plaier' is neither a person kind nor a trait/);
    expect(m).toMatch(/'person: worker' only works in post and order effects/);
  });

  it('表达式里的 hired.<作用或特质> 要认识', () => {
    const f = files();
    f['posts/ch_stringing.yaml'] = (f['posts/ch_stringing.yaml'] as string).replace('hired.stringer', 'hired.stringr');
    expect(msgs(compileContent(f))).toMatch(/unknown variable 'hired.stringr'/);
  });

  it('文件名必须和 id 一致', () => {
    const f = files();
    f['events/indian_wells/iw_spons.yaml'] = f['events/indian_wells/iw_sponsor.yaml'] as string;
    delete f['events/indian_wells/iw_sponsor.yaml'];
    expect(msgs(compileContent(f))).toMatch(/must match the file name/);
  });

  it('时长换算成游戏分钟', () => {
    expect(minutes('30m')).toBe(30);
    expect(minutes('2h')).toBe(120);
    expect(minutes('1d')).toBe(1440);
    expect(minutes('1.5h')).toBe(90);
  });
});

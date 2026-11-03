import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse, stringify } from 'yaml';
import { compileContent, VARIANT_VAR } from './compile';
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
// biome-ignore lint/suspicious/noExplicitAny: test fixtures poke at parsed YAML of any shape
type Yaml = any;
/** 读一个 YAML 文件、改一下、写回去（不靠字符串替换，内容改了格式也不怕） */
function editYaml(f: Record<string, string>, file: string, fn: (y: Yaml) => void): void {
  const y = parse(f[file] as string);
  fn(y);
  f[file] = stringify(y);
}
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

  it('掉档（准则 6）：drops_to 指向不存在的状态、绕圈、掉下去没有工单修得回来，都报错', () => {
    const f = files();
    f['facilities.yaml'] = (f['facilities.yaml'] as string)
      .replace('decay_day: 4, drops_to: worn }', 'decay_day: 4, drops_to: rubble }')
      .replace('    worn: { upkeep_week: 25 }', '    worn: { upkeep_week: 25, drops_to: open }');
    delete f['orders/st2_reopen.yaml'];
    const m = msgs(compileContent(f));
    expect(m).toMatch(/practice\.open: drops_to unknown state 'rubble'/);
    expect(m).toMatch(/stadium_3\.open: drops_to loops back/);
    expect(m).toMatch(/stadium_2\.open: no order brings 'stadium_2' back from 'worn'/);
  });

  /**
   * 修复变体、升级、改造（LG-14）和星级、内赛（LG-10）的一份最小示例：红土场 clay / hard、只给 clay 的升级（维护 ≥ 75）、
   * 改成硬地的改造、只在硬地开的岗位、两星的清单（第二星带橡皮筋）、月度内赛（奖杯 +1）。
   */
  const buildFiles = (): Record<string, string> => {
    const f = files();
    const edit = (file: string, fn: (y: Yaml) => void) => editYaml(f, file, fn);
    edit('facilities.yaml', (y) => {
      const o23 = y.find((x: { id: string }) => x.id === 'outer_23');
      o23.variants = { clay: {}, hard: { states: { playable: { decay_day: 2, quality: 12 } } } };
      o23.upgrades = { tournament_clay: { variant: 'clay', states: { playable: { quality: 3 } } } };
    });
    edit('orders/o23_repair.yaml', (y) => {
      y.variants = { clay: {}, hard: { cost: 1200, work: '14h', effects: [{ stat: 'reputation', add: 1 }] } };
    });
    const order = (id: string, extra: Record<string, unknown>) => {
      f[`orders/${id}.yaml`] = stringify({
        id,
        act: 'indian_wells',
        at: 'outer_23',
        skill: 'upkeep',
        work: '2h',
        cost: 100,
        when: { facility: 'outer_23', is: 'playable' },
        ...extra,
      });
    };
    order('o23_pro', { upgrade: 'tournament_clay', worker: { upkeep: 75 } });
    order('o23_remodel', { remodel: 'hard', closed_for: '7d' });
    order('cup', {
      at: 'outer_1',
      skill: 'service',
      cooldown: '28d',
      when: { expr: 'stars >= 1' },
      effects: [{ trophy: 1 }, { flag: 'hosted_cup', set: true }],
    });
    f['posts/o23_hard_league.yaml'] = stringify({
      id: 'o23_hard_league',
      act: 'indian_wells',
      at: 'outer_23',
      skill: 'service',
      cycle: '1h',
      hours: [8, 17],
      when: {
        all: [
          { facility: 'outer_23', is: 'playable' },
          { variant: 'outer_23', is: 'hard' },
        ],
      },
      effects: [{ stat: 'cash', add: 'variant.outer_23 == "hard" ? 6 : 0' }],
    });
    edit('acts/indian_wells.yaml', (y) => {
      y.stars = [
        { requires: { members_5: { stat: 'members', gte: 5 } }, opens: ['internal_cup'] },
        {
          requires: {
            hosted_cup: { flag: 'hosted_cup' },
            trophy_1: { expr: 'trophies >= 1 && stars >= 1' },
            members_20: { expr: 'stat.members >= (day >= 78 ? 16 : 20)' },
          },
          opens: ['regional'],
        },
      ];
    });
    for (const l of ['en', 'zh'])
      edit(`i18n/${l}.yaml`, (y) => {
        y.variants = { outer_23: { clay: 'Clay', hard: 'Hard' } };
        y.upgrades = { outer_23: { tournament_clay: 'Tournament clay' } };
        y.stars = {
          items: { members_5: '5 members', hosted_cup: 'Host a cup', trophy_1: '1 trophy', members_20: '20 members' },
          opens: { internal_cup: 'Monthly cup', regional: 'Regionals' },
        };
        for (const id of ['o23_pro', 'o23_remodel', 'cup']) y.orders[id] = { title: id, note: id };
        y.posts.o23_hard_league = { title: 'League', note: 'League' };
      });
    return f;
  };

  it('修复变体、升级、改造、星级、内赛的示例能编译', () => {
    const r = compileContent(buildFiles());
    expect(msgs(r)).toBe('');
    const o = r.bundle?.orders.find((x) => x.id === 'o23_repair');
    expect(Object.keys(o?.variants ?? {})).toEqual(['clay', 'hard']);
    expect(r.bundle?.acts[0]?.stars?.[1]?.opens).toEqual(['regional']);
    expect(VARIANT_VAR.test('variant.outer_23')).toBe(true);
  });

  it('变体、升级、改造、星级写错都报错', () => {
    const f = buildFiles();
    const edit = (file: string, fn: (y: Yaml) => void) => editYaml(f, file, fn);
    edit('orders/o23_repair.yaml', (y) => {
      y.variants.grass = {};
    });
    edit('orders/o23_pro.yaml', (y) => {
      y.upgrade = 'gold_clay';
    });
    edit('orders/o23_remodel.yaml', (y) => {
      y.remodel = 'grass';
      y.upgrade = 'tournament_clay';
    });
    edit('posts/o23_hard_league.yaml', (y) => {
      y.when.all[1] = { variant: 'outer_23', is: 'carpet' };
      y.effects[0].add = 'variant.outer_1 == "x" ? 1 : 0';
    });
    edit('facilities.yaml', (y) => {
      y.find((x: { id: string }) => x.id === 'outer_23').variants.hard.states.paved = { quality: 1 };
    });
    edit('acts/indian_wells.yaml', (y) => {
      y.stars[0].requires.members_5 = { upgrade: 'outer_23', has: 'nope' };
      y.stars[1].opens.push('sponsor');
    });
    const m = msgs(compileContent(f));
    expect(m).toMatch(/variants: facility 'outer_23' has no variant 'grass'/);
    expect(m).toMatch(/upgrade: facility 'outer_23' has no upgrade 'gold_clay'/);
    expect(m).toMatch(/at most one of: variants, upgrade, remodel/);
    expect(m).toMatch(/remodel: facility 'outer_23' has no variant 'grass'/);
    expect(m).toMatch(/facility 'outer_23' has no variant 'carpet'/);
    expect(m).toMatch(/unknown variable 'variant.outer_1'/);
    expect(m).toMatch(/outer_23.variants.hard: unknown state 'paved'/);
    expect(m).toMatch(/facility 'outer_23' has no upgrade 'nope'/);
    expect(m).toMatch(/missing text 'stars.opens.sponsor'/);
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

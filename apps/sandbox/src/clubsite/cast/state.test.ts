// 互动和状态：act() 的取舍（钱、正忙、说多了烦、一周一次礼物、打一局按水平差、老伤、孩子的冰棍、消息要先见面）、
// 纯函数（不改旧状态）、JSON 往返、tick 过夜；"在想什么"和姿势 → 活动；源码里没有 Math.random / Date.now / three。
import { describe, expect, it } from 'vitest';
import { ACTIONS, actionsFor } from './actions';
import { buildCast } from './casting';
import { makePerson } from './crowd';
import { SLOT_TABLE } from './slots';
import { act, clockText, initState, MEMORY_KEEP, memOf, tick } from './state';
import { activityOf, thought } from './thoughts';
import type { ActCtx, CastPerson, CastState, SlotInfo } from './types';

const cast = buildCast(1, []);
const slot = (scene: string, s: string) => SLOT_TABLE.find((x) => x.scene === scene && x.slot === s) as SlotInfo;
/** 一个可控的人：先生成，再改特质和水平 */
function person(id: string, traits: string[], ntrp = 3.5, info = slot('clubcourts', 'm-e1')): CastPerson {
  const p = makePerson(1, id, info, 'regular');
  return { ...p, traits, attrs: { ...p.attrs, ntrp }, lines: undefined };
}
const near = (activity: ActCtx['activity'] = 'rest', scene: ActCtx['scene'] = 'clubcourts'): ActCtx => ({
  near: true,
  activity,
  scene,
});

describe('状态', () => {
  it('开局：$120、第 1 天周一 8:00', () => {
    const s = initState(cast, 1);
    expect(s).toMatchObject({ day: 1, minute: 480, money: 120 });
    expect(clockText(s)).toBe('周一 8:00');
    expect(clockText({ day: 9, minute: 9 * 60 + 5 })).toBe('周二 9:05');
  });
  it('memOf 没有就按 favor0 建', () => {
    const p = person('a', []);
    expect(memOf(initState(cast, 1), p.id, p).favor).toBe(p.favor0);
  });
  it('tick 过了 22:00 进下一天：说话次数清零、心情往 60 回落', () => {
    let s: CastState = initState(cast, 1);
    s = { ...s, minute: 21 * 60 + 50, people: { x: { ...memOf(s, 'x'), mood: 100, talksToday: 3 } } };
    const t = tick(s, 20);
    expect(t.day).toBe(2);
    expect(t.minute).toBe(7 * 60 + 10);
    expect(t.people.x.talksToday).toBe(0);
    expect(t.people.x.mood).toBe(80);
    expect(s.people.x.talksToday).toBe(3);
    expect(tick(s, 5).day).toBe(1);
  });
});

describe('act 的取舍', () => {
  it('聊几句：好感涨、写记忆、花时间、见过面；旧状态不变', () => {
    const p = person('a', []);
    const s0 = initState(cast, 1);
    const before = JSON.stringify(s0);
    const { state, result } = act(s0, p, 'chat', near());
    expect(JSON.stringify(s0)).toBe(before);
    expect(result.ok).toBe(true);
    expect(result.favor).toBeGreaterThan(0);
    expect(result.note).toMatch(/^好感 \+/);
    expect(result.line.length).toBeGreaterThan(0);
    expect(result.line.length).toBeLessThanOrEqual(16);
    expect(state.minute).toBe(480 + result.minutes);
    expect(state.people.a.met).toBe(true);
    expect(state.people.a.memory[0].text).toMatch(/^第 1 天 · 总监/);
  });
  it('不当面不行；发消息要先见过面', () => {
    const p = person('a', []);
    const s0 = initState(cast, 1);
    const far = { ...near(), near: false };
    expect(act(s0, p, 'chat', far).result.ok).toBe(false);
    expect(act(s0, p, 'message', far).result.ok).toBe(false);
    const met = act(s0, p, 'chat', near()).state;
    const r = act(met, p, 'message', far);
    expect(r.result.ok).toBe(true);
    expect(r.result.favor).toBeLessThan(act(s0, p, 'chat', near()).result.favor + 0.01);
  });
  it('钱不够不能请', () => {
    const p = person('a', []);
    const s0 = { ...initState(cast, 1), money: 3 };
    const r = act(s0, p, 'treat', near());
    expect(r.result.ok).toBe(false);
    expect(r.result.reason).toMatch(/钱不够/);
    expect(r.state).toBe(s0);
    const ok = act({ ...s0, money: 20 }, p, 'treat', near());
    expect(ok.state.money).toBe(14);
  });
  it('正忙时被打扰扣好感（专注的人打球时）', () => {
    const p = person('a', ['focused']);
    const s0 = initState(cast, 1);
    expect(act(s0, p, 'chat', near('play')).result.favor).toBeLessThan(0);
    expect(act(s0, p, 'chat', near('rest')).result.favor).toBeGreaterThan(0);
  });
  it('同一天说话次数递减，第 3 次起烦', () => {
    const p = person('a', []);
    let s = initState(cast, 1);
    const ds: number[] = [];
    for (let i = 0; i < 4; i++) {
      const r = act(s, p, 'chat', near());
      ds.push(r.result.favor);
      s = r.state;
    }
    expect(ds[1]).toBeLessThan(ds[0]);
    expect(ds[2]).toBeLessThan(0);
    expect(ds[3]).toBeLessThan(ds[2]);
    // 过一夜又好了
    const next = act(tick(s, 24 * 60), p, 'chat', near());
    expect(next.result.favor).toBeGreaterThan(0);
  });
  it('礼物一周一次', () => {
    const p = person('a', []);
    const s1 = act(initState(cast, 1), p, 'gift', near()).state;
    const again = act({ ...s1, day: 3 }, p, 'gift', near());
    expect(again.result.ok).toBe(false);
    expect(again.result.reason).toMatch(/这周送过了/);
    expect(act({ ...s1, day: 8 }, p, 'gift', near()).result.ok).toBe(true);
  });
  it('打一局：水平差不多最开心，差太多无聊或被虐；老伤推掉；不打球的不能约', () => {
    const s0 = initState(cast, 1);
    const even = act(s0, person('a', [], 3.5), 'rally', near()).result.favor;
    const strong = act(s0, person('b', [], 6), 'rally', near()).result.favor;
    const weak = act(s0, person('c', [], 1.5), 'rally', near()).result.favor;
    expect(even).toBeGreaterThan(strong);
    expect(even).toBeGreaterThan(weak);
    expect(strong).toBeLessThanOrEqual(0);
    const hurt = act(s0, person('d', ['oldinjury'], 3.5), 'rally', near());
    expect(hurt.result.favor).toBeLessThan(0);
    expect(hurt.state.people.d.rallies).toBe(0);
    const ok = act(s0, person('e', [], 3.5), 'rally', near());
    expect(ok.state.people.e.rallies).toBe(1);
    expect(act(s0, person('f', [], 1), 'rally', near()).result.ok).toBe(false);
    expect(actionsFor(person('f', [], 1)).some((a) => a.id === 'rally')).toBe(false);
  });
  it('特质倍率：吃货请吃翻倍，讲排场的嫌聊天敷衍', () => {
    const s0 = initState(cast, 1);
    const plain = act(s0, person('a', []), 'treat', near()).result.favor;
    const foodie = act(s0, person('b', ['foodie']), 'treat', near()).result.favor;
    expect(foodie).toBeGreaterThan(plain);
    const vip = act(s0, person('c', ['vip']), 'chat', near()).result.favor;
    expect(vip).toBeLessThan(act(s0, person('d', []), 'chat', near()).result.favor);
  });
  it('孩子不能请酒：变成冰棍，不发消息', () => {
    const kid = person('k', ['kidplayful'], 2, slot('clubplaza', 'kid'));
    const acts = actionsFor(kid, near());
    const treat = acts.find((a) => a.id === 'treat');
    expect(treat?.label).toMatch(/冰棍/);
    expect(acts.some((a) => a.id === 'message')).toBe(false);
    const r = act(initState(cast, 1), kid, 'treat', near('idle', 'clubplaza'));
    expect(r.state.money).toBe(117);
    expect(r.state.people.k.memory[0].text).toMatch(/冰棍/);
  });
  it('记忆只留最近 8 条；状态能 JSON 往返', () => {
    const p = person('a', ['chatty']);
    let s = initState(cast, 1);
    for (let i = 0; i < 12; i++) s = act(tick(s, 24 * 60), p, 'chat', near()).state;
    expect(s.people.a.memory.length).toBe(MEMORY_KEEP);
    expect(s.people.a.memory[MEMORY_KEEP - 1].day).toBe(s.day);
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });
  it('每个动作都有代价', () => {
    for (const a of ACTIONS) expect(a.minutes + a.money).toBeGreaterThan(0);
  });
});

describe('在想什么', () => {
  it('姿势 → 活动', () => {
    expect(activityOf('ready', 'racket')).toBe('play');
    expect(activityOf('dink', 'paddle')).toBe('play');
    expect(activityOf('sip', 'cup')).toBe('eat');
    expect(activityOf('sit', 'cup')).toBe('eat');
    expect(activityOf('sit', null)).toBe('rest');
    expect(activityOf('clap', null)).toBe('watch');
    expect(activityOf('sweep', 'broom')).toBe('work');
    expect(activityOf('squeegee', undefined)).toBe('work');
    expect(activityOf('benchPress', null)).toBe('gym');
    expect(activityOf('bkStand', null)).toBe('work');
    expect(activityOf('walk', null)).toBe('walk');
    expect(activityOf('idle', 'racket')).toBe('wait');
    expect(activityOf(undefined, undefined)).toBe('idle');
    expect(activityOf('nonsense', null)).toBe('idle');
  });
  it('一句话、确定、换 salt 会换', () => {
    const p = cast.roster().find((x) => x.id.startsWith('reg:')) as CastPerson;
    const a = thought(p, undefined, 'play', '会员场', 1);
    expect(a.length).toBeGreaterThan(0);
    expect(thought(p, undefined, 'play', '会员场', 1)).toBe(a);
    const all = new Set(Array.from({ length: 30 }, (_, i) => thought(p, undefined, 'rest', '会员场', i)));
    expect(all.size).toBeGreaterThan(1);
    const bare = { ...person('z', []), lines: undefined };
    for (const act of ['play', 'watch', 'rest', 'eat', 'walk', 'work', 'gym', 'swim', 'wait', 'idle'] as const)
      expect(thought(bare, undefined, act, '泳池', 3).length).toBeGreaterThan(0);
  });
});

describe('纯', () => {
  it('源码里没有 Math.random / Date.now / three / DOM', () => {
    const src = import.meta.glob<string>('./*.ts', { query: '?raw', import: 'default', eager: true });
    const files = Object.entries(src).filter(([f]) => !f.endsWith('.test.ts'));
    expect(files.length).toBeGreaterThan(8);
    for (const [f, text] of files) {
      const code = text.replace(/\/\/.*$/gm, '');
      expect(code, f).not.toMatch(/Math\.random|Date\.now|performance\.now/);
      expect(code, f).not.toMatch(/from ['"]three['"]|from ['"]\.\.\/(render|people|play)\//);
      expect(code, f).not.toMatch(/\b(document|window)\./);
    }
  });
});

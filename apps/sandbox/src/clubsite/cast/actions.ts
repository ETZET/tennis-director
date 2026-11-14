// 总监能和一个人做的事（名册、点人弹出的卡片上的按钮）。每个都有代价：钱、游戏分钟（玩法准则 2：选择要有取舍）。
// 规则（好感怎么变）在 state.ts 的 act()；这里只有按钮和"对这个人能做哪几个"。
import type { ActCtx, ActionDef, ActionId, CastPerson, PersonMem } from './types';

export const ACTIONS: readonly ActionDef[] = [
  { id: 'chat', label: '聊几句', cost: '2 分钟', inPerson: true, minutes: 2, money: 0 },
  { id: 'treat', label: '请喝一杯', cost: '$6 · 5 分钟', inPerson: true, minutes: 5, money: 6 },
  { id: 'rally', label: '打一局', cost: '30 分钟', inPerson: true, minutes: 30, money: 0 },
  { id: 'ask', label: '听听意见', cost: '6 分钟', inPerson: true, minutes: 6, money: 0 },
  { id: 'gift', label: '送个小礼物', cost: '$15 · 1 分钟 · 一周一次', inPerson: true, minutes: 1, money: 15 },
  { id: 'message', label: '发条消息', cost: '1 分钟 · 不用当面', inPerson: false, minutes: 1, money: 0 },
];

export const actionDef = (id: ActionId): ActionDef => ACTIONS.find((a) => a.id === id) as ActionDef;

/** 孩子请不了酒：请客变成一根冰棍（便宜一点） */
const KID_TREAT: ActionDef = {
  id: 'treat',
  label: '请一根冰棍',
  cost: '$3 · 3 分钟',
  inPerson: true,
  minutes: 3,
  money: 3,
};

/** 话多的人聊几句停不下来（聊天多花时间） */
const CHATTY_CHAT: ActionDef = {
  id: 'chat',
  label: '聊几句',
  cost: '5 分钟（停不下来）',
  inPerson: true,
  minutes: 5,
  money: 0,
};

/**
 * 对这个人能做哪几个（按钮顺序同 ACTIONS），代价按人调整过（孩子的冰棍、话多的人聊得久、餐车院子里请吃的）。
 * 不能做的不在这里：发消息要先见过面、留过联系方式（mem.met），孩子不发消息；不打球的人不能约打一局；
 * 当面的按钮在不当面时仍然列出来（界面把它变成"走过去"），act() 再拦。
 */
export function actionsFor(p: CastPerson, ctx?: Partial<ActCtx>, mem?: PersonMem): ActionDef[] {
  const kid = p.look.body !== 'adult';
  const out: ActionDef[] = [];
  for (const a of ACTIONS) {
    if (a.id === 'treat') {
      if (kid) out.push(KID_TREAT);
      else if (ctx?.scene === 'clubfood') out.push({ ...a, label: '请吃一份' });
      else out.push(a);
    } else if (a.id === 'chat' && p.traits.includes('chatty')) out.push(CHATTY_CHAT);
    else if (a.id === 'rally') {
      // 不打球的人（NTRP 1.0）没有这个按钮
      if (p.attrs.ntrp > 1) out.push(a);
    } else if (a.id === 'message') {
      if (kid || (mem && !mem.met)) continue;
      out.push(a);
    } else out.push(a);
  }
  return out;
}

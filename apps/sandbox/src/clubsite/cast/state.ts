// 会变的东西（存档）：总监的零用钱、今天几点、每个人对总监的好感 / 心情 / 记忆。
// 全是纯函数：act()、tick() 返回新状态，不改旧的；可以 JSON 往返。随机只用种子哈希（台词挑哪句）。
//
// act() 的取舍（玩法准则 2；原型可以先找好玩，冲突在设计文档里提）：
//   - 特质的 likes 倍率（吃货请吃翻倍、讲排场的嫌随口聊天敷衍、老伤的人推掉打球……）
//   - 他正忙（特质的 busyWhen：专注的人打球时、急性子排队时）被打扰 → 扣好感；员工干活、别人打球时搭话 → 效果打折
//   - 同一天说话次数递减：第 2 次打折，第 3 次起烦（聊天、听意见、发消息扣分；请客、打球、送礼越来越不值）
//   - 礼物一周一次；钱不够不能请；孩子不能请酒（变成冰棍，actions.ts）
//   - 打一局按 NTRP 差：总监 3.5，差不多最开心，差太多无聊（他强）或被虐（他弱；孩子除外）
//   - 发消息不用当面，但效果小，而且要先见过面
//   - 早起的人上午聊天好、下午犯困；夜猫子反过来；心情好的时候什么都更管用
import { actionDef, actionsFor } from './actions';
import { WEEKDAY_NAME } from './crowd';
import { ROLE_LINES } from './pools';
import { hashOf, pickBy } from './rng';
import { TRAITS } from './traits';
import type {
  ActCtx,
  ActionDef,
  ActionId,
  ActResult,
  Cast,
  CastPerson,
  CastState,
  MemoryEntry,
  PersonMem,
} from './types';

/** 营业时间（分钟）：7:00–22:00 */
export const OPEN = 7 * 60;
export const CLOSE = 22 * 60;
/** 总监的网球水平 */
export const DIRECTOR_NTRP = 3.5;
/** 记忆只留最近几条 */
export const MEMORY_KEEP = 8;
/** 心情回落到的值 */
export const MOOD_REST = 60;

export function initState(_cast: Cast, seed: number): CastState {
  return { seed, day: 1, minute: 8 * 60, money: 120, people: {} };
}

/** 这个人的状态（没有就按 favor0 建一份新的；不写进 s） */
export function memOf(s: CastState, id: string, p?: CastPerson): PersonMem {
  return (
    s.people[id] ?? {
      favor: p?.favor0 ?? 4,
      mood: MOOD_REST,
      met: false,
      talksToday: 0,
      giftDay: 0,
      rallies: 0,
      memory: [],
    }
  );
}

export const weekday = (s: Pick<CastState, 'day'>) => (((s.day - 1) % 7) + 7) % 7;

/** "周一 9:20" */
export function clockText(s: Pick<CastState, 'day' | 'minute'>): string {
  const h = Math.floor(s.minute / 60);
  const m = s.minute % 60;
  return `${WEEKDAY_NAME[weekday(s)]} ${h}:${String(m).padStart(2, '0')}`;
}

/** 推进时间；过了 22:00 进下一天 7:00（今天说话的次数清零，心情往 60 回落一半） */
export function tick(s: CastState, minutes: number): CastState {
  let day = s.day;
  let minute = s.minute + Math.max(0, Math.round(minutes));
  let nights = 0;
  while (minute >= CLOSE) {
    minute = OPEN + (minute - CLOSE);
    day++;
    nights++;
  }
  if (!nights) return { ...s, minute };
  const people: Record<string, PersonMem> = {};
  for (const [id, m] of Object.entries(s.people)) {
    let mood = m.mood;
    for (let i = 0; i < Math.min(nights, 8); i++) mood += (MOOD_REST - mood) * 0.5;
    people[id] = { ...m, talksToday: 0, mood: Math.round(mood) };
  }
  return { ...s, day, minute, people };
}

// ── act ──────────────────────────────────────────────────────────────────────────

const BASE: Record<ActionId, number> = { chat: 0.4, treat: 0.8, rally: 1.0, ask: 0.5, gift: 1.2, message: 0.2 };
const TALKY: ActionId[] = ['chat', 'ask', 'message'];
const r1 = (x: number) => Math.round(x * 10) / 10;
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const sign = (x: number) => (x > 0 ? `+${x.toFixed(1)}` : x < 0 ? `−${Math.abs(x).toFixed(1)}` : '±0');

const DRINKS = ['冰柠檬水', '鲜果水', '冰美式', '椰枣奶昔', '珍珠奶茶'];
const GIFTS = ['一罐新球', '一顶遮阳帽', '一盒椰枣', '一条吸汗带', '一瓶防晒霜', '一本球场的老相册复印本'];
const KID_GIFTS = ['一个签名球', '一张球童贴纸', '一顶小遮阳帽', '一个荧光网球'];

const ACTIVITY_NAME: Record<ActCtx['activity'], string> = {
  play: '打球',
  watch: '看球',
  rest: '歇着',
  eat: '吃东西',
  walk: '走路',
  work: '干活',
  gym: '健身',
  swim: '游泳',
  wait: '排队',
  idle: '站着',
};

type Tone = 'happy' | 'upset' | 'busy' | 'greet';

function lineOf(p: CastPerson, tone: Tone, h: number): string {
  const own = p.lines?.[tone];
  if (own?.length) return pickBy(h, own);
  if (tone === 'greet')
    for (const id of p.traits) {
      const tl = TRAITS[id]?.lines?.greet;
      if (tl?.length) return pickBy(h, tl);
    }
  const role = ROLE_LINES[p.role]?.[tone];
  if (role?.length) return pickBy(h, role);
  const fallback: Record<Tone, string[]> = {
    happy: ['谢谢！', '你真好'],
    upset: ['……嗯', '现在不太方便'],
    busy: ['等一下！'],
    greet: ['你好'],
  };
  return pickBy(h, fallback[tone]);
}

/**
 * 做一件事。纯函数：返回新状态和结果（界面照着演：气泡 line、note、好感变化）。
 * action 可以是 id（按 actionsFor 调整过的代价算）或者 actionsFor 给的那个 ActionDef。
 * 结果的 favor / mood 是变化量；不能做（ok false）时状态不变。
 */
export function act(
  s: CastState,
  p: CastPerson,
  action: ActionId | ActionDef,
  ctx: ActCtx,
): { state: CastState; result: ActResult } {
  const mem = memOf(s, p.id, p);
  const def =
    typeof action === 'string' ? (actionsFor(p, ctx).find((a) => a.id === action) ?? actionDef(action)) : action;
  const zh = p.nameZh;
  const h = hashOf(s.seed, p.id, s.day, s.minute, def.id, mem.talksToday);
  const fail = (reason: string, tone: Tone = 'greet') => ({
    state: s,
    result: {
      ok: false,
      reason,
      line: tone === 'greet' ? '' : lineOf(p, tone, h),
      note: reason,
      favor: 0,
      mood: 0,
      minutes: 0,
      money: 0,
    },
  });
  if (def.inPerson && !ctx.near) return fail('要走到跟前才行');
  if (def.money > s.money) return fail(`钱不够（还剩 $${s.money}）`);
  if (def.id === 'gift' && mem.giftDay > 0 && s.day - mem.giftDay < 7)
    return fail(`这周送过了（第 ${mem.giftDay} 天），下次第 ${mem.giftDay + 7} 天`);
  if (def.id === 'message' && !mem.met) return fail('还没当面说过话，没有联系方式');
  if (def.id === 'message' && p.look.body !== 'adult') return fail('不给孩子发消息');
  if (def.id === 'rally' && p.attrs.ntrp <= 1) return fail(`${zh}不打网球`);

  const has = (t: string) => p.traits.includes(t);
  const traits = p.traits.map((id) => TRAITS[id]).filter((t) => t !== undefined);
  let delta = BASE[def.id];
  let tone: Tone = 'happy';
  let why = '';
  let minutes = def.minutes;
  let line = '';
  let memo = '';
  let rallied = false;

  // 特质倍率（最显眼的那个写进 note）
  let mult = 1;
  let strong: { name: string; k: number } | null = null;
  for (const t of traits) {
    const k = t.likes?.[def.id];
    if (k === undefined) continue;
    mult *= k;
    if (!strong || Math.abs(Math.log(Math.abs(k) || 0.01)) > Math.abs(Math.log(Math.abs(strong.k) || 0.01)))
      strong = { name: t.name, k };
  }

  // 打一局
  if (def.id === 'rally') {
    if (has('oldinjury')) {
      delta = -0.3;
      minutes = 2;
      tone = 'upset';
      line = '膝盖不行，下次吧';
      why = '老伤：约打球被推掉了，坐着聊更好';
      memo = `总监约${zh}打球，${zh}说老伤又犯了`;
    } else {
      rallied = true;
      const gap = p.attrs.ntrp - DIRECTOR_NTRP;
      if (Math.abs(gap) <= 0.5) {
        delta = 1.2;
        why = `水平差不多（NTRP ${p.attrs.ntrp.toFixed(1)}），打得过瘾`;
        memo = `总监和${zh}打了一局，打得难分难解`;
      } else if (Math.abs(gap) <= 1) {
        delta = 0.7;
        why = `水平差一点（NTRP ${p.attrs.ntrp.toFixed(1)}），还算有意思`;
        memo = `总监和${zh}打了一局`;
      } else if (gap > 0) {
        delta = has('mentor') ? 0.6 : -0.2;
        why = has('mentor')
          ? `${zh}比总监强太多，但爱带人，教得挺开心`
          : `${zh}比总监强太多（NTRP ${p.attrs.ntrp.toFixed(1)}），没意思`;
        memo = `总监和${zh}打了一局，${has('mentor') ? `${zh}顺手教了几招` : `${zh}打得有点无聊`}`;
        if (delta < 0) line = '下次找个对手吧';
      } else if (p.look.body === 'kid') {
        delta = 0.9;
        why = '孩子跟总监打球，玩得很开心';
        memo = `总监陪${zh}打了一会儿球`;
      } else {
        delta = -0.3;
        why = `${zh}差太多（NTRP ${p.attrs.ntrp.toFixed(1)}），被总监虐了`;
        memo = `总监和${zh}打了一局，${zh}输得很难看`;
        line = '我今天状态不好';
      }
      if (delta > 0) delta *= mult;
    }
  } else {
    delta *= mult;
    if (mult < 0) tone = 'upset';
  }

  // 正忙：特质的 busyWhen 扣分；员工干活、别人打球时效果打折（发消息不当面，不算）
  const busyTrait = def.id === 'message' ? undefined : traits.find((t) => t.busyWhen?.includes(ctx.activity));
  const working =
    def.id !== 'message' &&
    ((ctx.activity === 'work' && (p.role === 'staff' || p.role === 'vendor' || p.role === 'coach')) ||
      ctx.activity === 'play' ||
      ctx.activity === 'gym');
  if (busyTrait && !(def.id === 'rally' && ctx.activity === 'play')) {
    delta = -0.5;
    tone = 'busy';
    why = `${busyTrait.name}：${ACTIVITY_NAME[ctx.activity]}的时候被打扰了`;
    memo = `总监在${zh}${ACTIVITY_NAME[ctx.activity]}的时候来打扰`;
    line = '';
    rallied = false;
  } else if (working && delta > 0) {
    delta *= 0.4;
    tone = 'busy';
    why = `正${ACTIVITY_NAME[ctx.activity]}，没怎么顾得上`;
  }

  // 今天第几次了
  const n = mem.talksToday;
  if (n >= 1 && delta > 0) {
    if (TALKY.includes(def.id)) {
      if (n === 1) delta *= 0.6;
      else {
        delta = -0.2 * (n - 1);
        tone = 'upset';
        why = `今天第 ${n + 1} 次了，有点烦`;
      }
    } else delta *= 0.7 ** n;
  }

  // 早起 / 夜猫子；心情
  if (delta > 0) {
    if (has('earlybird')) delta *= s.minute < 11 * 60 ? 1.3 : s.minute >= 15 * 60 ? 0.8 : 1;
    if (has('nightowl')) delta *= s.minute >= 17 * 60 ? 1.3 : s.minute < 12 * 60 ? 0.8 : 1;
    if (def.id === 'treat' && ctx.scene === 'clubfood') delta *= 1.15;
    delta *= 0.6 + mem.mood / 125;
  }

  const favor = r1(clamp(mem.favor + r1(delta), 0, 10));
  const dFavor = r1(favor - mem.favor);
  let dMood = Math.round(dFavor >= 0 ? dFavor * 8 : dFavor * 12);
  if (dMood < 0 && has('cheerful')) dMood = Math.round(dMood / 2);
  if (rallied && dFavor > 0) dMood += 4;
  const mood = clamp(mem.mood + dMood, 0, 100);

  // 说明
  if (!why) {
    if (strong && strong.k >= 1.4) why = `${strong.name}：${zh}很吃这一套`;
    else if (strong && strong.k <= 0.6) why = `${strong.name}：${zh}不太领情`;
    else
      why = {
        chat: '聊得挺好',
        treat: `${zh}喜欢被请客`,
        rally: '一起打了一局',
        ask: `${zh}说了不少想法`,
        gift: `${zh}收到礼物很开心`,
        message: `${zh}回了个表情`,
      }[def.id];
  }
  if (def.id === 'ask' && has('gossip') && dFavor > 0) why += '（顺便讲了别人的八卦）';
  if (dFavor < 0 && tone === 'happy') tone = 'upset';
  if (dFavor > 0 && dFavor < 0.3 && tone === 'happy') tone = 'greet';

  // 记忆
  if (!memo) {
    const kid = p.look.body !== 'adult';
    switch (def.id) {
      case 'chat':
        memo = `总监和${zh}聊了几句`;
        break;
      case 'treat': {
        const drink = p.likes.find((l) => DRINKS.includes(l)) ?? pickBy(h, DRINKS);
        memo = kid
          ? `总监请${zh}吃了一根冰棍`
          : ctx.scene === 'clubfood'
            ? `总监请${zh}吃了一份${has('foodie') ? '吉事果' : '塔可'}`
            : `总监请${zh}喝了${drink}`;
        break;
      }
      case 'rally':
        memo = `总监和${zh}打了一局`;
        break;
      case 'ask':
        memo = `总监问了${zh}对俱乐部的意见`;
        break;
      case 'gift':
        memo = `总监送了${zh}${pickBy(h, kid ? KID_GIFTS : GIFTS)}`;
        break;
      case 'message':
        memo = `总监给${zh}发了条消息`;
        break;
    }
    if (tone === 'upset' && dFavor < 0) memo += `（${zh}有点烦）`;
  }
  const entry: MemoryEntry = { day: s.day, minute: s.minute, text: `第 ${s.day} 天 · ${memo}`, favor: dFavor };

  const next: PersonMem = {
    ...mem,
    favor,
    mood,
    met: mem.met || def.inPerson,
    talksToday: mem.talksToday + 1,
    giftDay: def.id === 'gift' ? s.day : mem.giftDay,
    rallies: mem.rallies + (rallied ? 1 : 0),
    memory: [...mem.memory, entry].slice(-MEMORY_KEEP),
  };
  const money = def.money;
  const state = tick({ ...s, money: s.money - money, people: { ...s.people, [p.id]: next } }, minutes);
  if (!line) line = lineOf(p, tone, h);
  return {
    state,
    result: {
      ok: true,
      line,
      note: `好感 ${sign(dFavor)} · ${why}`,
      favor: dFavor,
      mood: mood - mem.mood,
      minutes,
      money,
    },
  };
}

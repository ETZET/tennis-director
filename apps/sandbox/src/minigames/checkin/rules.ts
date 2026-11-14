// 前台签到的规则（纯函数，不碰 three / DOM；rules.test.ts 测）：谁来排队、什么时候来、柜台上发哪几张会员卡、
// 点对点错怎么算、队伍的耐心怎么掉、分数和星级线。
// 人全部来自演员表（clubsite/cast 的 CAST）：会员 = 名册里有会籍的大人（named + regular），访客 = 当天生成的客人（crowd）。
import type { CastLook, CastPerson, Membership } from '../../clubsite/cast/types';

/** 一局几秒 */
export const DURATION = 90;
/** 几条命（有人等不及走掉 / VIP 没接待好 = 掉一条） */
export const LIVES = 3;
/** 连击时间窗（秒）：上一个签完之后这么快签下一个算连着（下一位走上来要 0.6 秒） */
export const COMBO_WINDOW = 4.5;
/**
 * 星级线（无头 bot 按四种手速各打两局调的）：新手（2.6 秒认一个人、点错 20%）2900–3600 分、60 多秒命就没了；
 * 一般（1.9 秒、12%）6400 上下；熟练（1.3 秒、7%）和高手（0.9 秒、3%）7200–7800 —— 来的人全接住了，差在点错和漏的续费。
 */
export const STARS: [number, number, number] = [2500, 5000, 7000];

/** 签到一位（会员或访客登记）：底分 + 连击（第 2 个起每多连一个 +20，最多 +100） */
export const CHECKIN = 100;
export const COMBO_STEP = 20;
export const COMBO_CAP = 5;
/** 续费（过期月卡当场续上） */
export const UPSELL = 150;
/** VIP 在时限内接待好 */
export const VIP_BONUS = 100;
/** VIP 走到柜台以后几秒内要接待 */
export const VIP_LIMIT = 6;
/** 点错一次 */
export const MISTAKE = -60;
/** 点错一次，排队的每个人耐心少几秒 */
export const MISTAKE_PATIENCE = 3;
/** 结算：剩一条命 +80 */
export const LIFE_BONUS = 80;
/** 队伍最多几个人（再来的人看一眼就走了，不算命） */
export const QUEUE_CAP = 10;

export type ArrivalKind = 'member' | 'guest' | 'expired' | 'vip';
export type CardKind = Exclude<Membership['kind'], 'none' | 'day' | 'junior'>;

/** 会员卡上的会籍名（短） */
export const KIND_LABEL: Record<CardKind, string> = {
  founder: '创始',
  annual: '年卡',
  monthly: '月卡',
  family: '家庭卡',
};

const CARD_KINDS: readonly CardKind[] = ['founder', 'annual', 'monthly', 'family'];
const isCardKind = (k: Membership['kind']): k is CardKind => (CARD_KINDS as readonly string[]).includes(k);

export interface Pools {
  /** 有会员卡的大人（名册里的 named + regular） */
  members: CastPerson[];
  /** 其中 named 的（VIP 从这里挑） */
  vips: CastPerson[];
  /** 今天的客人（没有卡） */
  guests: CastPerson[];
}

/**
 * 从演员表分池：会员 = 大人、有会籍（创始 / 年卡 / 月卡 / 家庭）、是会员 / 家长 / 球员 / 常来的客人（员工、摊主不算）；
 * 访客 = guest(i) 生成的客人里，没有会籍的大人。
 */
export function buildPools(roster: readonly CastPerson[], guest: (i: number) => CastPerson, nGuests = 40): Pools {
  const members = roster.filter(
    (p) =>
      p.look.body === 'adult' &&
      isCardKind(p.member.kind) &&
      (p.role === 'member' || p.role === 'parent' || p.role === 'pro' || p.role === 'guest'),
  );
  const vips = members.filter((p) => p.tier === 'named');
  const guests: CastPerson[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < nGuests * 6 && guests.length < nGuests; i++) {
    const g = guest(i);
    if (seen.has(g.id) || g.look.body !== 'adult') continue;
    if (g.member.kind !== 'day' && g.member.kind !== 'none') continue;
    seen.add(g.id);
    guests.push(g);
  }
  return { members, vips, guests };
}

// ── 来人的时间表 ──────────────────────────────────────────────────────────────────

export interface Arrival {
  /** 第几秒走进大门（开局排着的 = 0） */
  t: number;
  kind: ArrivalKind;
}

/** 开局已经排着几个人（早高峰） */
export const OPENING_QUEUE = 3;

/** 两个人之间隔几秒（越到后面越密）：3.6 → 2.2 */
export const gapAt = (t: number) => 3.6 + (2.2 - 3.6) * Math.min(1, Math.max(0, t / 80));

/**
 * 这一局谁什么时候来：开局排着 3 个会员，之后越来越密；6 秒后开始有访客，12 秒后有过期的月卡，
 * VIP 三个（25、50、72 秒左右，各抖 ±3 秒）。rng 给 [0, 1)。
 */
export function planArrivals(rng: () => number, duration = DURATION): Arrival[] {
  const out: Arrival[] = [];
  for (let i = 0; i < OPENING_QUEUE; i++) out.push({ t: 0, kind: 'member' });
  let t = 1.5;
  while (t < duration - 3) {
    const r = rng();
    const kind: ArrivalKind = t > 6 && r < 0.2 ? 'guest' : t > 12 && r < 0.4 ? 'expired' : 'member';
    out.push({ t: +t.toFixed(2), kind });
    t += gapAt(t) * (0.75 + rng() * 0.5);
  }
  for (const base of [25, 50, 72]) {
    if (base > duration - 8) continue;
    out.push({ t: +(base + (rng() * 2 - 1) * 3).toFixed(2), kind: 'vip' });
  }
  return out.sort((a, b) => a.t - b.t);
}

/** 挑这一位是谁（同一局不重复；池子用完了就允许重复）。expired 只能是月卡会员 */
export function pickPerson(rng: () => number, kind: ArrivalKind, pools: Pools, used: Set<string>): CastPerson {
  const base =
    kind === 'guest'
      ? pools.guests
      : kind === 'vip'
        ? pools.vips
        : kind === 'expired'
          ? pools.members.filter((p) => p.member.kind === 'monthly')
          : pools.members;
  let free = base.filter((p) => !used.has(p.id));
  if (!free.length) free = base;
  const p = free[Math.floor(rng() * free.length)];
  used.add(p.id);
  return p;
}

// ── 会员卡 ────────────────────────────────────────────────────────────────────────

export interface Card {
  id: string;
  name: string;
  nameZh: string;
  age: number;
  look: CastLook;
  kind: CardKind;
  /** "年卡" */
  label: string;
  /** 今天的预约："10:00 2号场" */
  booking: string;
  /** 月卡过期了（卡上有"续费"） */
  expired: boolean;
}

const TIMES = ['8:00', '8:30', '9:00', '9:30', '10:00', '10:30', '11:00', '11:30'];
const PLACES = [
  '1号场',
  '2号场',
  '3号场',
  '4号场',
  '5号场',
  '6号场',
  '红土 1号场',
  '红土 2号场',
  '匹克球 2号',
  '匹克球 4号',
  '私教课',
  '中心球场',
];
/** 今天的预约（只是卡上的字） */
export function bookingFor(rng: () => number): string {
  return `${TIMES[Math.floor(rng() * TIMES.length)]} ${PLACES[Math.floor(rng() * PLACES.length)]}`;
}

/** 两个人看上去像不像（分越高越像；会员卡的干扰项按这个挑） */
export function lookSim(a: CastLook, b: CastLook): number {
  let s = 0;
  if (a.shirt === b.shirt) s += 3;
  if ((a.hat?.kind ?? '') === (b.hat?.kind ?? '')) s += 2;
  if ((a.eyes ?? '') === (b.eyes ?? '')) s += 2;
  if (a.hairStyle === b.hairStyle) s += 1;
  if (a.hair === b.hair) s += 1;
  if (a.skin === b.skin) s += 1;
  if (a.bottom === b.bottom) s += 1;
  return s;
}

/** 发色按深浅分组（黑和深棕、棕和红褐在 45° 俯视的小人头上分不出来） */
const HAIR_GROUP: Record<CastLook['hair'], number> = {
  black: 0,
  darkBrown: 0,
  brown: 1,
  auburn: 1,
  red: 2,
  blonde: 3,
  gray: 4,
  white: 4,
};

/**
 * 一眼看得出不一样：衣服颜色、帽子（种类 / 颜色）、眼镜、发型、胡子至少一样不同，或者发色差一个深浅组（光头、寸头的发色不算）。
 * 干扰项不能和本人只差在裤子、肤色这种肖像上看不到 / 小人身上分不清的地方。
 */
export function looksDistinct(a: CastLook, b: CastLook): boolean {
  const hat = (l: CastLook) => (l.hat ? `${l.hat.kind}:${l.hat.color}` : '');
  const shortHair = (l: CastLook) => l.hairStyle === 'bald' || l.hairStyle === 'buzz' || !!l.hat;
  return (
    a.shirt !== b.shirt ||
    hat(a) !== hat(b) ||
    (a.eyes ?? '') !== (b.eyes ?? '') ||
    a.hairStyle !== b.hairStyle ||
    (a.facial ?? '') !== (b.facial ?? '') ||
    (!shortHair(a) && !shortHair(b) && HAIR_GROUP[a.hair] !== HAIR_GROUP[b.hair])
  );
}

export const cardOf = (p: CastPerson, rng: () => number, expired: boolean): Card => {
  const kind = isCardKind(p.member.kind) ? p.member.kind : 'annual';
  return {
    id: p.id,
    name: p.name,
    nameZh: p.nameZh,
    age: p.age,
    look: p.look,
    kind,
    label: KIND_LABEL[kind],
    booking: bookingFor(rng),
    expired,
  };
};

/** 这一刻发几张卡、干扰项多像：前 20 秒 3 张，之后 4 张；像的程度 0 → 0.85 */
export const cardCountAt = (t: number) => (t < 20 ? 3 : 4);
export const hardnessAt = (t: number) => Math.min(0.85, Math.max(0, (t - 8) / 60));

/**
 * 柜台上发的卡：会员 = 本人那张 + 干扰项；访客 = 全是干扰项（都不是他）。
 * 干扰项每张按 hard 的概率从"最像他的 8 个人"里挑，不然随便挑；和本人看上去一模一样的不要。
 * 月卡干扰项 30% 是过期的（续费按钮不只出现在对的那张上）。本人那张：kind = expired 才过期。洗过牌。
 */
export function dealCards(
  rng: () => number,
  who: CastPerson,
  kind: ArrivalKind,
  members: readonly CastPerson[],
  n: number,
  hard: number,
): Card[] {
  const cards: Card[] = [];
  const taken = new Set<string>([who.id]);
  if (kind !== 'guest') cards.push(cardOf(who, rng, kind === 'expired'));
  const cand = members.filter((p) => p.id !== who.id && looksDistinct(p.look, who.look));
  const near = [...cand].sort((a, b) => lookSim(b.look, who.look) - lookSim(a.look, who.look)).slice(0, 8);
  let guard = 0;
  while (cards.length < n && guard++ < 200) {
    const from = rng() < hard && near.length ? near : cand;
    const p = from[Math.floor(rng() * from.length)];
    if (!p || taken.has(p.id)) continue;
    taken.add(p.id);
    cards.push(cardOf(p, rng, p.member.kind === 'monthly' && rng() < 0.3));
  }
  // 洗牌（Fisher–Yates）
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

// ── 判定 ──────────────────────────────────────────────────────────────────────────

export type Action = { type: 'card'; id: string; renew: boolean } | { type: 'guest' };

export interface Verdict {
  ok: boolean;
  /** 签到成功（会员签到 / 访客登记） */
  checkin: boolean;
  /** 续费成功 */
  upsell: boolean;
  /** 过期月卡签到了、没续费（错过了） */
  missedUpsell: boolean;
  /** 柜台前那位说的一句 */
  line: string;
}

/** 柜台前这位（who，kind）、玩家点了什么 → 对不对 */
export function judge(whoId: string, kind: ArrivalKind, a: Action): Verdict {
  const no = (line: string): Verdict => ({ ok: false, checkin: false, upsell: false, missedUpsell: false, line });
  if (kind === 'guest') {
    if (a.type === 'guest') return { ok: true, checkin: true, upsell: false, missedUpsell: false, line: '第一次来！' };
    return no('我不是会员…');
  }
  if (a.type === 'guest') return no('我是会员！');
  if (a.id !== whoId) return no('不是我！');
  if (kind === 'expired') {
    if (a.renew) return { ok: true, checkin: true, upsell: true, missedUpsell: false, line: '续一年！' };
    return { ok: true, checkin: true, upsell: false, missedUpsell: true, line: '下次再续吧' };
  }
  return { ok: true, checkin: true, upsell: false, missedUpsell: false, line: kind === 'vip' ? '谢谢总监！' : '✓' };
}

/** 签到一位的分（combo = 这一位是连着的第几个，1 起） */
export const checkinPoints = (combo: number) => CHECKIN + COMBO_STEP * Math.min(Math.max(combo - 1, 0), COMBO_CAP);

// ── 耐心 ──────────────────────────────────────────────────────────────────────────

/** 刚来的人能等几秒（越到后面越急）：24 → 18 */
export const patienceAt = (t: number) => 24 + (18 - 24) * Math.min(1, Math.max(0, t / DURATION));
/** 队伍长了耐心掉得快：前 4 个人 1 倍，之后每多一个人快 25% */
export const drainRate = (queueLen: number) => 1 + Math.max(0, queueLen - 4) * 0.25;

// ── 结算 ──────────────────────────────────────────────────────────────────────────

export interface Tally {
  checkins: number;
  guests: number;
  upsells: number;
  missedUpsells: number;
  vipOk: number;
  vipTotal: number;
  mistakes: number;
  walkouts: number;
  bestCombo: number;
  lives: number;
}

export function settle(t: Tally): {
  lines: { label: string; value: string }[];
  bonus: { label: string; value: number }[];
} {
  const lines = [
    { label: '会员签到', value: `${t.checkins - t.guests}` },
    { label: '访客登记', value: `${t.guests}` },
    { label: '续费', value: t.missedUpsells ? `${t.upsells}（漏 ${t.missedUpsells}）` : `${t.upsells}` },
    { label: 'VIP 接待', value: `${t.vipOk} / ${t.vipTotal}` },
    { label: '点错', value: t.mistakes ? `${t.mistakes}（${t.mistakes * MISTAKE}）` : '0' },
    { label: '等不及走掉', value: `${t.walkouts}` },
    { label: '最长连击', value: t.bestCombo >= 2 ? `×${t.bestCombo}` : '—' },
  ];
  const bonus: { label: string; value: number }[] = [];
  if (t.lives > 0) bonus.push({ label: `剩 ${t.lives} ♥ × ${LIFE_BONUS}`, value: t.lives * LIFE_BONUS });
  return { lines, bonus };
}

import { type Ctx, logEntry, run, setStat } from './effects';
import type { EffectRecord, WeekSettlement } from './state';
import { facilityMoney, makeEnv, qualityTarget, servicePass, wagesWeek } from './vars';

/**
 * 钱的日账和周日的本周回顾（GM-1：放着不管时，数字的变化要讲得清）。
 * 每天收盘只记钱（bookDay），声望和会员由每日结算（day.ts 的 settleDay，ADR 0024）按今天算；
 * 周日收盘写一条周结算因果日志（settleWeek）：只是把这一周七天的每日结算加起来讲，不改任何数（review: true）。
 */

const round1 = (x: number) => Math.round(x * 10) / 10 || 0; // -0 统一成 0
const round2 = (x: number) => Math.round(x * 100) / 100 || 0;

/**
 * 每天收盘：钱按天折算记进现金（不取整，一周加起来正好是周薪和会费），记在今天的账上（today.book，
 * 每日结算再卷进本周）；这些是每天都一样的流水，不各写一条日志、不刷快讯。老写法的每日会员、声望表达式（Indian Wells 不用）照旧写日志。
 */
export function bookDay(ctx: Ctx, day: number): void {
  const { s, w } = ctx;
  const facilities = facilityMoney(s, w);
  let income = 0;
  let upkeep = 0;
  for (const f of Object.values(facilities)) {
    income += f.income;
    upkeep += f.upkeep;
  }
  const dues = ((s.stats.members ?? 0) * w.act.rules.dues_week) / 7;
  const wages = wagesWeek(s, w) / 7;
  const daily: Record<string, { income: number; upkeep: number }> = {};
  for (const [id, f] of Object.entries(facilities)) daily[id] = { income: f.income / 7, upkeep: f.upkeep / 7 };
  s.today.book = { dues, wages, facilities: daily };
  setStat(ctx, 'cash', (s.stats.cash ?? 0) + dues + income / 7 - upkeep / 7 - wages);
  const env = makeEnv(s, w);
  const members = Math.round(Number(w.expr(w.act.rules.member_drift).eval(env)));
  const rep = Number(w.expr(w.act.rules.reputation_drift).eval(env));
  if (members || rep)
    run(ctx, { kind: 'day', day }, null, [
      { stat: 'members', add: members },
      { stat: 'reputation', add: round1(rep) },
    ]);
}

/**
 * 周日收盘的本周回顾（ADR 0024）：每天收盘已经把今天卷进了本周的账（s.week），这里把七天之和写成一条 week 因果日志，
 * 讲清楚这一周的服务率、缺人最多的岗位、钱，以及声望、会员、质量一共变了多少——只讲，不改任何数（review: true）；然后本周清零。
 */
export function settleWeek(ctx: Ctx, day: number): void {
  const { s, w } = ctx;
  const wk = s.week;
  const rate = wk.demand > 0 ? wk.served / wk.demand : 0;
  const rep: Record<string, number> = {};
  for (const [k, v] of Object.entries(wk.rep ?? {})) rep[k] = round2(v);
  let top: WeekSettlement['missed'] = null;
  for (const [post, minutes] of Object.entries(wk.missed))
    if (minutes > 0 && (!top || minutes > top.minutes || (minutes === top.minutes && post < top.post)))
      top = { post, minutes };
  // 场地可用度：走掉的会员、不能打挡掉分钟最多的那块场（按岗位所在的设施合计；同分取 id 小的）
  const careOn = !!w.act.rules.care;
  let unplayable: WeekSettlement['unplayable'] = null;
  if (careOn) {
    const byCourt: Record<string, number> = {};
    for (const [post, m] of Object.entries(wk.unplayable ?? {})) {
      const f = w.facilityAt.get(w.posts.get(post)?.at ?? '');
      if (f && m > 0) byCourt[f] = (byCourt[f] ?? 0) + m;
    }
    for (const [court, minutes] of Object.entries(byCourt))
      if (!unplayable || minutes > unplayable.minutes || (minutes === unplayable.minutes && court < unplayable.court))
        unplayable = { court, minutes };
  }
  const q = qualityTarget(s, w);
  const terms: Record<string, number> = {};
  for (const [k, v] of Object.entries(q.terms)) terms[k] = round1(v);
  const money = {
    dues: Math.round(wk.money.dues),
    income: Math.round(wk.money.income),
    upkeep: Math.round(wk.money.upkeep),
    wages: Math.round(wk.money.wages),
  };
  const out: EffectRecord[] = [];
  logEntry(
    ctx,
    {
      kind: 'week',
      week: Math.ceil(day / 7),
      demand: wk.demand,
      served: wk.served,
      pass: servicePass(w),
      missed: top,
      money,
      rep,
      members: { gain: wk.members ?? 0, cap: null },
      quality: { target: round1(q.total), terms },
      ...(careOn ? { walkouts: wk.walkouts ?? 0, unplayable } : {}),
      review: true,
    },
    null,
    out,
  );
  // 只讲不改：现金、会员、声望、质量每天已经变过了，这里只把一周的合计讲出来
  const cash = Math.round(wk.money.dues + wk.money.income - wk.money.upkeep - wk.money.wages);
  if (cash) out.push({ kind: 'stat', stat: 'cash', delta: cash });
  if (wk.members) out.push({ kind: 'stat', stat: 'members', delta: wk.members });
  const dr = round2(Object.values(wk.rep ?? {}).reduce((a, b) => a + b, 0));
  if (dr) out.push({ kind: 'stat', stat: 'reputation', delta: dr });
  const dq = round1((s.stats.quality ?? 0) - wk.q0);
  if (dq) out.push({ kind: 'stat', stat: 'quality', delta: dq });
  s.week = {
    demand: 0,
    served: 0,
    last: rate,
    lastDemand: wk.demand,
    missed: {},
    money: { dues: 0, income: 0, upkeep: 0, wages: 0 },
    traitRep: 0,
    q0: s.stats.quality ?? 0,
    walkouts: 0,
    unplayable: {},
    rep: {},
    members: 0,
  };
}

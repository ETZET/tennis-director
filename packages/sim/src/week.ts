import { applyEffects, type Ctx, logEntry, run, setStat } from './effects';
import type { EffectRecord, WeekSettlement } from './state';
import { facilityTotals, makeEnv, num, qualityTarget, servicePass, wagesWeek } from './vars';

/**
 * 周结算（GM-1：放着不管时，数字的变化要讲得清）。
 * 每天收盘只记账（bookDay），周日收盘写一条周结算因果日志（settleWeek）：服务率、及格线、缺人最多的岗位、
 * 这一周的钱，以及声望、会员、质量各自为什么变。systems.ts 的 closeDay 只调用这两个函数。
 */

const round1 = (x: number) => Math.round(x * 10) / 10 || 0; // -0 统一成 0

/**
 * 每天收盘：钱按天折算记进现金（不取整，一周加起来正好是周薪和会费），记进本周的账；
 * 这些是每天都一样的流水，不各写一条日志、不刷快讯。老写法的每日会员、声望表达式（Indian Wells 不用）照旧写日志。
 */
export function bookDay(ctx: Ctx, day: number): void {
  const { s, w } = ctx;
  const fac = facilityTotals(s, w);
  const m = s.week.money;
  const dues = ((s.stats.members ?? 0) * w.act.rules.dues_week) / 7;
  const wages = wagesWeek(s, w) / 7;
  m.dues += dues;
  m.income += fac.income / 7;
  m.upkeep += fac.upkeep / 7;
  m.wages += wages;
  setStat(ctx, 'cash', (s.stats.cash ?? 0) + dues + fac.income / 7 - fac.upkeep / 7 - wages);
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
 * 周日收盘的周结算（准则 6）：会员和声望按这一周的服务率结算，写成一条因果日志，
 * 讲清楚服务率、及格线、缺人最多的岗位、这一周的钱，以及声望、会员、质量各自为什么变；然后本周清零。
 * 这一周没有需求（还没有开放的岗位）时 service_demand 是 0：服务率无从谈起，规则里的服务项不算。
 */
export function settleWeek(ctx: Ctx, day: number): void {
  const { s, w } = ctx;
  const wk = s.week;
  const rate = wk.demand > 0 ? wk.served / wk.demand : 0;
  const extra = { service_rate: rate, service_demand: wk.demand > 0 ? 1 : 0 };
  const rules = w.act.rules.week;
  const rep: Record<string, number> = {};
  let repTotal = wk.traitRep;
  let gain = 0;
  let cap: number | null = null;
  let lossMax: number | null = null;
  if (rules) {
    for (const [k, src] of Object.entries(rules.reputation)) {
      const v = num(s, w, src, extra);
      repTotal += v;
      rep[k] = round1(v);
    }
    gain = Math.round(num(s, w, rules.members, extra));
    if (rules.member_cap !== undefined) cap = Math.round(num(s, w, rules.member_cap, extra));
    if (rules.member_loss_max !== undefined) lossMax = Math.max(0, Math.round(num(s, w, rules.member_loss_max, extra)));
  }
  if (wk.traitRep) rep.traits = round1(wk.traitRep);
  const members = s.stats.members ?? 0;
  // 超出上限的会员周末不续了（可以是负数）；一周最多走掉 member_loss_max 个（准则 6：不一次崩掉，下周接着走）
  const raw = cap === null ? gain : Math.min(gain, cap - members);
  const dm = lossMax === null ? raw : Math.max(raw, -lossMax);
  let top: WeekSettlement['missed'] = null;
  for (const [post, minutes] of Object.entries(wk.missed))
    if (minutes > 0 && (!top || minutes > top.minutes || (minutes === top.minutes && post < top.post)))
      top = { post, minutes };
  // 场地可用度（court-care-contract.md）：走掉的会员、不能打挡掉分钟最多的那块场（按岗位所在的设施合计；同分取 id 小的）
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
  const entry = logEntry(
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
      members: { gain, cap, ...(dm > raw && lossMax !== null ? { loss_max: lossMax } : {}) },
      quality: { target: round1(q.total), terms },
      ...(careOn ? { walkouts: wk.walkouts ?? 0, unplayable } : {}),
    },
    null,
    out,
  );
  // 现金每天已经记过了，这里只把一周的合计讲出来
  const cash = Math.round(wk.money.dues + wk.money.income - wk.money.upkeep - wk.money.wages);
  if (cash) out.push({ kind: 'stat', stat: 'cash', delta: cash });
  applyEffects(
    ctx,
    [
      { stat: 'members', add: dm },
      { stat: 'reputation', add: round1(repTotal) },
    ],
    entry.id,
    out,
  );
  // 质量每 10 分钟走一点，不各写日志；这里讲这一周一共走了多少
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
  };
}

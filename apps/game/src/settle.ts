import {
  type ContentBundle,
  type DayCalendarItem,
  type DayMoneyLine,
  type DayPerson,
  type DayReport,
  type GameState,
  type MessKind,
  type WeekReview,
  type World,
  worldOf,
} from '@td/sim';
import type { SettlementCardData, SettlementPage, SettlementPerson, SettlementRow, SettlementSection } from '@td/ui';
import { signed2, type Text } from './text';

/**
 * 每日结算卡（daily-settlement-contract.md，ADR 0024）：DayReport → SettlementCardData。
 * 全部文字在这里拼好（界面不读 i18n 键）；数怎么滚由界面按 format 写，滚完显示这里给的 text。
 */

/** 钱一节最多显示几行（其余合进"其他"） */
const MONEY_ROWS = 6;
const MINUS = '−';
const money = (n: number) => {
  const r = Math.round(n);
  return `${r < 0 ? MINUS : r > 0 ? '+' : ''}$${Math.abs(r).toLocaleString('en-US')}`;
};
const cashText = (n: number) => `${n < 0 ? MINUS : ''}$${Math.abs(Math.round(n)).toLocaleString('en-US')}`;
const signedInt = (n: number) => {
  const r = Math.round(n);
  return r > 0 ? `+${r}` : r < 0 ? `${MINUS}${-r}` : '0';
};
const round2 = (n: number) => Math.round(n * 100) / 100 || 0;

/** 投影借给结算卡的几样东西（Projector 实现；不直接引用 project.ts，免得循环依赖） */
export interface Projector {
  readonly contentNow: ContentBundle;
  face(id: string): { name: string; initials: string; color: string };
  tourTitle(s: GameState, id: string): string;
  careKindName(s: GameState, w: World, f: string, k: MessKind): string;
}

export interface SettleDeps {
  /** 人的像素头像（data URL，由 Projector.headOf 给；画面迁移中暂时不接，画首字母） */
  headOf?: ((id: string) => string | undefined) | undefined;
}

export function settlementCard(
  p: Projector,
  T: Text,
  s: GameState,
  r: DayReport,
  deps: SettleDeps = {},
): SettlementCardData {
  const pages: SettlementPage[] = [dayPage(p, T, s, r, deps)];
  if (r.review) pages.push(weekPage(p, T, s, r.review, r.service.pass));
  return {
    id: `day-${r.day}`,
    pages,
    hint: {
      skip: T.tr('ui.daily.tap_skip'),
      next: T.tr('ui.daily.tap_next'),
      week: T.tr('ui.daily.tap_week'),
      done: T.tr('ui.daily.tap_next'),
    },
    continueLabel: T.tr('ui.daily.continue'),
  };
}

/** 钱的一行叫什么：岗位、设施、工单、卡、赛事按名字说 */
function moneyLabel(p: Projector, T: Text, s: GameState, l: DayMoneyLine): string {
  const id = l.id ?? '';
  switch (l.kind) {
    case 'facility':
      return T.fmt('ui.daily.money.facility', { place: T.facility(id) });
    case 'upkeep':
      return T.fmt('ui.daily.money.upkeep', { place: T.facility(id) });
    case 'post':
      return T.fmt('ui.daily.money.post', { post: T.tr(`posts.${id}.title`, id) });
    case 'materials':
      return T.fmt('ui.daily.money.materials', { order: T.tr(`orders.${id}.title`, id) });
    case 'card':
      return T.fmt('ui.daily.money.card', { card: T.cardTitle(id) });
    case 'event':
      return T.fmt('ui.daily.money.event', { title: p.tourTitle(s, id) });
    default:
      return T.tr(`ui.daily.money.${l.kind}`);
  }
}

/** 钱的各行：最多 MONEY_ROWS 行，多的（和原本的"其他"）合成一行"其他" */
function moneyRows(p: Projector, T: Text, s: GameState, lines: readonly DayMoneyLine[]): SettlementRow[] {
  const real = lines.filter((l) => l.kind !== 'other' && l.amount);
  let other = lines.filter((l) => l.kind === 'other').reduce((a, l) => a + l.amount, 0);
  // 放不下时留下数额最大的几行（收入、花销都可能大），按原来的顺序（收入在前）显示
  let keep = real;
  if (real.length + (Math.round(other) ? 1 : 0) > MONEY_ROWS) {
    const big = new Set([...real].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)).slice(0, MONEY_ROWS - 1));
    keep = real.filter((l) => big.has(l));
    for (const l of real) if (!big.has(l)) other += l.amount;
  }
  const rows = keep.map((l, i) => row(`${l.kind}-${l.id ?? i}`, moneyLabel(p, T, s, l), l.amount));
  if (Math.round(other)) rows.push(row('other', T.tr('ui.daily.money.other'), other));
  return rows;
}

function row(id: string, label: string, amount: number): SettlementRow {
  return {
    id,
    label,
    value: Math.round(amount),
    format: 'money',
    text: money(amount),
    ...(amount > 0 ? { tone: 'good' as const } : amount < 0 ? { tone: 'bad' as const } : {}),
  };
}

function dayPage(p: Projector, T: Text, s: GameState, r: DayReport, deps: SettleDeps): SettlementPage {
  return {
    id: 'day',
    title: T.fmt('ui.daily.title', { n: r.day, d: T.tr(`ui.days.${r.weekday}`) }),
    subtitle: `${T.tr(`ui.daily.weather.${r.weather}`)} · ${T.tr('ui.daily.money.cash')} ${cashText(r.money.cash)}`,
    sections: [
      moneySection(p, T, s, r),
      standingSection(T, r),
      peopleSection(p, T, r, deps),
      tomorrowSection(p, T, s, r),
    ],
  };
}

function moneySection(p: Projector, T: Text, s: GameState, r: DayReport): SettlementSection {
  const vs = r.money.vsYesterday;
  const total: SettlementRow = {
    ...row('total', T.tr('ui.daily.money.total'), r.money.total),
    ...(vs === null
      ? {}
      : {
          note: Math.round(vs)
            ? T.fmt('ui.daily.money.vs_yesterday', { d: money(vs) })
            : T.tr('ui.daily.money.same_yesterday'),
        }),
  };
  return { id: 'money', title: T.tr('ui.daily.sections.money'), rows: moneyRows(p, T, s, r.money.lines), total };
}

function standingSection(T: Text, r: DayReport): SettlementSection {
  const title = T.tr('ui.daily.sections.standing');
  const rep = r.reputation;
  const mem = r.members;
  if (rep.skipped && mem.skipped) return { id: 'standing', title, rows: [], empty: T.tr('ui.daily.standing.none') };
  const sep = T.lang === 'zh' ? '、' : ', ';
  const tone = (d: number) => (d > 0 ? { tone: 'good' as const } : d < 0 ? { tone: 'bad' as const } : {});
  const terms = (t: Record<string, number>) =>
    Object.entries(t)
      .filter(([, v]) => round2(v))
      .map(([k, v]) => `${T.tr(`ui.terms.${k}`, k)} ${signed2(v)}`);
  const rows: SettlementRow[] = [];
  const before = round2(rep.before);
  const after = round2(rep.after);
  const repWhy = terms(rep.terms);
  // 今天别的事（卡、赛事）也动了声望：各项之外的差额单写一项"其他"，让为什么加起来对得上
  const rest = round2(after - before - Object.values(rep.terms).reduce((a, b) => a + b, 0));
  if (Math.abs(rest) >= 0.01) repWhy.push(`${T.tr('ui.daily.money.other')} ${signed2(rest)}`);
  rows.push({
    id: 'reputation',
    label: T.tr('ui.daily.standing.reputation'),
    from: before,
    value: after,
    format: 'int',
    digits: 2,
    text: after.toFixed(2),
    ...(repWhy.length ? { note: repWhy.join(sep) } : {}),
    ...tone(after - before),
  });
  const memWhy = terms(mem.terms);
  if (mem.capped && mem.cap !== null) memWhy.push(T.fmt('ui.daily.standing.capped', { cap: mem.cap }));
  if (mem.limited && mem.lossMax !== null)
    memWhy.push(T.fmt('ui.daily.standing.limited', { n: Math.max(1, Math.round(mem.lossMax)) }));
  if (mem.carry >= 0.5) memWhy.push(T.tr('ui.daily.standing.carry'));
  rows.push({
    id: 'members',
    label: T.tr('ui.daily.standing.members'),
    from: Math.round(mem.before),
    value: Math.round(mem.after),
    format: 'int',
    text: String(Math.round(mem.after)),
    ...(memWhy.length ? { note: memWhy.join(sep) } : {}),
    ...tone(mem.delta),
  });
  const sv = r.service;
  if (sv.rate !== null) {
    const n = Math.round(sv.rate * 100);
    const vs = sv.vsYesterday === null ? 0 : Math.round(sv.vsYesterday * 100);
    rows.push({
      id: 'service',
      label: T.fmt('ui.daily.standing.service', { n }),
      value: n,
      format: 'text',
      text: T.fmt('ui.daily.standing.pass', { n: Math.round(sv.pass * 100) }),
      ...(sv.vsYesterday !== null && vs ? { note: T.fmt('ui.daily.standing.vs_yesterday', { d: signedInt(vs) }) } : {}),
      ...(sv.rate < sv.pass ? { tone: 'bad' as const } : {}),
    });
  }
  if (sv.missed)
    rows.push(
      text(
        'missed',
        T.fmt('ui.daily.standing.missed', {
          post: T.tr(`posts.${sv.missed.post}.title`, sv.missed.post),
          time: T.duration(sv.missed.minutes),
        }),
        'bad',
      ),
    );
  if (sv.unplayable)
    rows.push(
      text(
        'unplayable',
        T.fmt('ui.daily.standing.unplayable', {
          place: T.facility(sv.unplayable.court),
          time: T.duration(sv.unplayable.minutes),
        }),
        'bad',
      ),
    );
  if (sv.walkouts) rows.push(text('walkouts', T.fmt('ui.daily.standing.walkouts', { n: sv.walkouts }), 'bad'));
  return { id: 'standing', title, rows };
}

/** 只是一句话的一行（不滚数） */
function text(id: string, label: string, tone?: 'good' | 'bad', right = ''): SettlementRow {
  return { id, label, value: 0, format: 'text', text: right, ...(tone ? { tone } : {}) };
}

function peopleSection(p: Projector, T: Text, r: DayReport, deps: SettleDeps): SettlementSection {
  const person = (x: DayPerson, note: string, tone?: 'bad'): SettlementPerson => {
    const f = p.face(x.id);
    const head = deps.headOf?.(x.id);
    return {
      id: x.id,
      name: f.name,
      initials: f.initials,
      color: f.color,
      ...(head ? { head } : {}),
      note,
      ...(tone ? { tone } : {}),
    };
  };
  const groups: NonNullable<SettlementSection['groups']> = [];
  const { top, idle, morale } = r.people;
  if (top.length)
    groups.push({
      id: 'top',
      label: T.tr('ui.daily.people.top'),
      people: top.map((x) => person(x, T.fmt('ui.daily.people.work', { time: T.duration(x.work) }))),
    });
  if (idle.length)
    groups.push({
      id: 'idle',
      label: T.tr('ui.daily.people.idle'),
      people: idle.map((x) => person(x, T.fmt('ui.daily.people.idle_for', { time: T.duration(x.idle) }))),
    });
  if (morale.length)
    groups.push({
      id: 'morale',
      label: T.tr('ui.daily.people.morale'),
      people: morale.map((x) =>
        person(
          x,
          T.fmt('ui.daily.people.morale_drop', { from: Math.round(x.morale0), to: Math.round(x.morale) }),
          'bad',
        ),
      ),
    });
  return {
    id: 'people',
    title: T.tr('ui.daily.sections.people'),
    rows: [],
    ...(groups.length ? { groups } : { empty: T.tr('ui.daily.people.none') }),
  };
}

function calendarLine(p: Projector, T: Text, s: GameState, c: DayCalendarItem): { label: string; at: number } {
  switch (c.kind) {
    case 'tournament': {
      const title = p.tourTitle(s, c.id);
      const key = c.signup ? 'tournament_signup' : c.first ? 'tournament_first' : 'tournament';
      return { label: T.fmt(`ui.daily.tomorrow.${key}`, { title }), at: c.start };
    }
    case 'hiring':
      return { label: T.tr('ui.daily.tomorrow.hiring'), at: c.at };
    case 'card':
      return {
        label: T.fmt('ui.daily.tomorrow.card', { card: T.tr(`ui.beat.cards.${c.card}`, T.cardTitle(c.card)) }),
        at: c.at,
      };
    default:
      return { label: T.tr('ui.daily.tomorrow.settle'), at: c.at };
  }
}

function tomorrowSection(p: Projector, T: Text, s: GameState, r: DayReport): SettlementSection {
  const tm = r.tomorrow;
  const w = worldOf(s, p.contentNow);
  const rows: SettlementRow[] = [
    {
      ...text('weather', T.fmt('ui.daily.tomorrow.weather', { weather: T.tr(`ui.daily.weather.${tm.weather}`) })),
      icon: tm.weather,
    },
  ];
  if (tm.seasonStarts)
    rows.push(text('season', T.fmt('ui.daily.tomorrow.season', { season: T.tr(`seasons.${tm.season}`, tm.season) })));
  for (const d of tm.dirty)
    rows.push(
      text(
        `dirty-${d.court}`,
        T.fmt('ui.daily.tomorrow.dirty', { place: T.facility(d.court), level: T.tr(`ui.care.level.${d.level}`) }) +
          T.fmt('ui.daily.tomorrow.dirty_why', { why: p.careKindName(s, w, d.court, d.why) }),
        d.level === 'no' ? 'bad' : undefined,
      ),
    );
  tm.calendar.forEach((c, i) => {
    const x = calendarLine(p, T, s, c);
    rows.push(text(`cal-${i}`, x.label, undefined, T.fmt('ui.daily.tomorrow.at', { time: T.clock(x.at) })));
  });
  if (!tm.dirty.length && !tm.calendar.length && !tm.seasonStarts)
    rows.push(text('nothing', T.tr('ui.daily.tomorrow.nothing')));
  if (tm.daysLeft !== null)
    rows.push(
      text(
        'days_left',
        tm.daysLeft === 0
          ? T.tr('ui.daily.tomorrow.last_day')
          : T.fmt('ui.daily.tomorrow.days_left', { n: tm.daysLeft }),
        tm.daysLeft <= 3 ? 'bad' : undefined,
      ),
    );
  return { id: 'tomorrow', title: T.tr('ui.daily.sections.tomorrow'), rows };
}

/** 周日第二页：本周回顾（只讲，不算数） */
function weekPage(p: Projector, T: Text, s: GameState, wk: WeekReview, pass: number): SettlementPage {
  const day = (d: number) => T.tr(`ui.days.${(d - 1) % 7}`);
  // 收入从大到小在前，花销从大到小在后，其他最后（和每天的排法一样）
  const rank = (l: DayMoneyLine) => (l.kind === 'other' ? 2 : l.amount >= 0 ? 0 : 1);
  const sorted = [...wk.money.lines].sort((a, b) => rank(a) - rank(b) || Math.abs(b.amount) - Math.abs(a.amount));
  const moneyRowsW = moneyRows(p, T, s, sorted);
  if (wk.best)
    moneyRowsW.push(
      text('best', T.fmt('ui.daily.week.best', { d: day(wk.best.day), money: money(wk.best.money) }), 'good'),
    );
  if (wk.worst && wk.worst.day !== wk.best?.day)
    moneyRowsW.push(
      text(
        'worst',
        T.fmt('ui.daily.week.worst', { d: day(wk.worst.day), money: money(wk.worst.money) }),
        wk.worst.money < 0 ? 'bad' : undefined,
      ),
    );
  const rep = round2(wk.reputation);
  const standing: SettlementRow[] = [
    {
      id: 'reputation',
      label: T.tr('ui.daily.week.reputation'),
      value: rep,
      format: 'signed',
      digits: 2,
      text: signed2(rep),
      ...(rep > 0 ? { tone: 'good' as const } : rep < 0 ? { tone: 'bad' as const } : {}),
    },
    {
      id: 'members',
      label: T.tr('ui.daily.week.members'),
      value: Math.round(wk.members),
      format: 'signed',
      text: signedInt(wk.members),
      ...(wk.members > 0 ? { tone: 'good' as const } : wk.members < 0 ? { tone: 'bad' as const } : {}),
    },
  ];
  if (wk.service.rate !== null)
    standing.push(text('service', T.fmt('ui.daily.week.service', { n: Math.round(wk.service.rate * 100) })));
  if (wk.walkouts) standing.push(text('walkouts', T.fmt('ui.daily.week.walkouts', { n: wk.walkouts }), 'bad'));
  return {
    id: 'week',
    title: T.fmt('ui.daily.title_week', { n: wk.week }),
    subtitle: T.fmt('ui.daily.week.days', { n: wk.days.length }),
    sections: [
      {
        id: 'week_money',
        title: T.tr('ui.daily.sections.week_money'),
        rows: moneyRowsW,
        total: row('total', T.tr('ui.daily.week.total'), wk.money.total),
      },
      { id: 'week_standing', title: T.tr('ui.daily.sections.week_standing'), rows: standing },
      {
        id: 'week_trend',
        title: T.tr('ui.daily.sections.week_trend'),
        rows: [],
        bars: wk.days.map((d, i) => {
          const v = wk.service.trend[i] ?? null;
          return {
            label: day(d),
            value: v,
            text: v === null ? T.tr('ui.daily.week.no_demand') : `${Math.round(v * 100)}%`,
          };
        }),
        pass,
      },
    ],
  };
}

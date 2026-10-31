import {
  actionStatus,
  at,
  type CausalEntry,
  type ContentBundle,
  facilityTotals,
  type GameState,
  type OpenCard,
  optionStatus,
  PLAN_CHANGE_ENERGY,
  planPreview,
  type SimEvent,
  shortestRoute,
  speedFactor,
  wagesWeek,
  worldOf,
} from '@td/sim';
import {
  type CardAnswer,
  type Chip,
  type EventCardData,
  grade,
  type HudSnapshot,
  type PlannerData,
  type RingAction,
  type RingData,
  type SeasonInfo,
  type StatRow,
  type StoryItem,
  trend,
  type WireItem,
} from '@td/ui';
import { effectChips, thenLine } from './chips';
import type { Session } from './session';
import { entryTone, type Text } from './text';

/**
 * 模拟状态 → HUD 快照。界面只看快照；这里决定"给玩家看什么、怎么说"。
 * 快讯带和质量曲线是投影自己攒的（不进模拟状态，读档后从头攒）。
 */

const KEYS = [1, 2, 3] as const;
const HISTORY = 48;

export class Projector {
  private readonly wire: WireItem[] = [];
  private wireId = 0;
  private readonly history: number[] = [];
  private lastSample = -1;

  constructor(
    private content: ContentBundle,
    private text: Text,
  ) {}

  /** 内容热重载：换内容和文案，快讯和曲线保留 */
  setContent(c: ContentBundle, text: Text): void {
    this.content = c;
    this.text = text;
  }

  /** 吃掉这一帧的领域事件：攒快讯 */
  onEvents(s: GameState, events: readonly SimEvent[]): void {
    const T = this.text;
    for (const e of events) {
      if (e.type === 'cardOpened') this.push(s.t, T.cardTitle(e.card), false);
      else if (e.type === 'log') {
        const so = T.so(e.entry);
        if (!so || e.entry.cause.kind === 'start') continue;
        const hot = e.entry.effects.some((x) => x.kind === 'fire' || x.kind === 'hire' || x.kind === 'end');
        this.push(s.t, so, hot);
      } else if (e.type === 'activityStarted') {
        this.push(s.t, T.tr(`activities.${e.activity}.title`), false);
      }
    }
  }

  private push(t: number, text: string, hot: boolean): void {
    this.wire.unshift({ id: this.wireId++, time: this.text.clock(t).replace(/ [AP]M$/, ''), text, hot });
    if (this.wire.length > 10) this.wire.length = 10;
  }

  /** 玩家现在该看的那张卡：要紧的（会暂停的：董事会、比赛、人事）排最前；同一级里最快过期的在前 */
  static focusCard(s: GameState, content: ContentBundle): OpenCard | null {
    const w = worldOf(s, content);
    const rank = (o: OpenCard) => (w.cards.get(o.card)?.pause ? 0 : 1);
    const open = [...s.cards.open].sort(
      (a, b) =>
        rank(a) - rank(b) ||
        (a.expires ?? Number.POSITIVE_INFINITY) - (b.expires ?? Number.POSITIVE_INFINITY) ||
        a.opened - b.opened,
    );
    return open[0] ?? null;
  }

  /** 本幕的最后一个日程（第一幕是董事会表决）：状态条上倒数 */
  private deadline(s: GameState): number | null {
    const act = worldOf(s, this.content).act;
    const last = act.calendar[act.calendar.length - 1];
    return last ? at(last.day, last.hour) : null;
  }

  /** 走到某处还要几分钟（正在路上就从这一段的终点算起） */
  walkMinutes(s: GameState, to: string): number {
    const w = worldOf(s, this.content);
    const d = s.director;
    const from = d.leg ? d.leg.to : (d.at ?? to);
    const rest = d.leg ? d.leg.end - s.t : 0;
    // 导航图的分钟是"精力一般"时的；现在跑得快还是走得慢看精力
    return Math.round(rest + (shortestRoute(w, from, to)?.minutes ?? 0) / speedFactor(s, w));
  }

  snapshot(session: Session): HudSnapshot {
    const { s } = session;
    const T = this.text;
    const w = worldOf(s, this.content);
    const q = s.stats.quality ?? 0;
    if (s.t - this.lastSample >= 30 || this.lastSample < 0) {
      this.lastSample = s.t;
      this.history.push(q);
      if (this.history.length > HISTORY) this.history.shift();
    }
    const fac = facilityTotals(s, w);
    let totalCourts = 0;
    for (const f of w.facilities.values()) totalCourts += Math.max(0, ...Object.values(f.states).map((x) => x.courts));
    const cash = s.stats.cash ?? 0;
    const coach = s.headCoach;

    const details: StatRow[] = [
      { label: T.tr('stats.reputation'), value: String(Math.round(s.stats.reputation ?? 0)) },
      {
        label: T.tr('stats.board_support'),
        value: `${Math.round(s.stats.board_support ?? 0)}`,
        ...((s.stats.board_support ?? 0) < 40 ? { tone: 'bad' as const } : {}),
      },
      {
        label: T.tr('stats.pickleball_pressure'),
        value: String(Math.round(s.stats.pickleball_pressure ?? 0)),
        ...((s.stats.pickleball_pressure ?? 0) > 50 ? { tone: 'pickle' as const } : {}),
      },
      { label: T.tr('ui.details.courts'), value: `${fac.courts}/${totalCourts}` },
      { label: T.tr('ui.details.wages'), value: `$${wagesWeek(s, w)}` },
      ...Object.entries(s.facilities)
        .filter(([id]) => id !== 'pool')
        .map(([id, st]) => {
          const [name, state] = T.tr(`facilities.${id}.${st}`).split(' · ');
          return { label: name ?? id, value: state ?? st };
        }),
    ];

    const story: StoryItem[] = [];
    for (let i = s.log.length - 1; i >= 0 && story.length < 14; i--) {
      const e = s.log[i] as CausalEntry;
      if (e.cause.kind === 'start') continue;
      const so = T.so(e);
      if (!so) continue;
      const tone = entryTone(e);
      story.push({
        id: e.id,
        time: T.clock(e.t).replace(/ [AP]M$/, ''),
        because: T.because(e),
        so,
        ...(tone ? { tone } : {}),
      });
    }

    return {
      club: { badge: T.tr('ui.club.badge'), name: T.tr('ui.club.name'), clock: `${T.day(s.t)} · ${T.clock(s.t)}` },
      quality: { value: q, grade: grade(q), trend: trend(this.history, false), history: this.history },
      members: Math.round(s.stats.members ?? 0),
      courts: { open: fac.courts, total: totalCourts },
      board: this.board(s),
      salary: {
        text: `${cash < 0 ? '−' : ''}$${Math.abs(cash) >= 1000 ? `${(Math.abs(cash) / 1000).toFixed(1)}K` : Math.round(Math.abs(cash))}`,
        label: T.tr('ui.cash'),
        ...(cash < 0 ? { tone: 'bad' as const } : {}),
      },
      headCoach: { name: coach ? T.personName(coach) : '', vacant: !coach },
      details,
      wire: this.wire,
      card: this.card(session),
      status: this.status(session),
      story,
      season: this.season(s),
      planner: s.planning || session.plannerOpen ? this.planner(session) : null,
      ring: session.ring ? this.ring(session, session.ring.anchor, session.ring.x, session.ring.y) : null,
      controls: { paused: session.paused, speed: `${session.speed}×` },
    };
  }

  /** 状态条上的董事会信心：决定表决的那个数，加上还有几天表决 */
  private board(s: GameState): NonNullable<HudSnapshot['board']> {
    const v = Math.round(s.stats.board_support ?? 0);
    const end = this.deadline(s);
    const days = end === null ? null : Math.max(0, Math.ceil((end - s.t) / 1440));
    return {
      value: v,
      label:
        days === null || s.outcome
          ? this.text.tr('ui.board')
          : days === 0
            ? this.text.tr('ui.board_today')
            : this.text.fmt('ui.board_in', { days }),
      ...(v < 40 ? { tone: 'bad' as const } : {}),
    };
  }

  /** 谁来找你：人物用名字和身份，群体用文案表里的名字 */
  private who(id: string): NonNullable<EventCardData['who']> {
    const T = this.text;
    const p = this.content.people.find((x) => x.id === id);
    const name = p ? p.name : T.tr(`who.${id}.name`);
    const role = p ? T.tr(`roles.${p.role}`) : T.tr(`who.${id}.role`);
    const initials = name
      .replace(/^(Coach|Ms\.|Mr\.)\s+/, '')
      .split(/\s+/)
      .map((x) => x[0] ?? '')
      .join('')
      .slice(0, 2)
      .toUpperCase();
    const COLORS = ['#d7ff3c', '#9be07f', '#ffc8b5', '#c9e8ff', '#fff7a8', '#e6d0ff'];
    let h = 0;
    for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return { name, role, initials, color: COLORS[h % COLORS.length] as string };
  }

  /** 卡片上的"此刻的局面"：董事会、现金、会员、精力 */
  private context(s: GameState): Chip[] {
    const T = this.text;
    const b = Math.round(s.stats.board_support ?? 0);
    const end = this.deadline(s);
    const days = end === null ? 0 : Math.max(0, Math.ceil((end - s.t) / 1440));
    return [
      { text: T.fmt('ui.ctx.board', { n: b, days }), tone: b < 40 ? 'loss' : 'info' },
      {
        text: T.fmt('ui.ctx.cash', { n: Math.round(s.stats.cash ?? 0) }),
        tone: (s.stats.cash ?? 0) < 0 ? 'loss' : 'info',
      },
      { text: T.fmt('ui.ctx.members', { n: Math.round(s.stats.members ?? 0) }) },
      {
        text: T.fmt('ui.ctx.energy', { n: Math.round(s.director.energy) }),
        tone: s.director.energy < 30 ? 'loss' : 'info',
      },
    ];
  }

  /** 季节、天气、精力 */
  private season(s: GameState): SeasonInfo {
    const T = this.text;
    const week = Math.floor(Math.floor(s.t / 1440) / 7) + 1;
    return {
      label: `${T.tr(`seasons.${s.season}`, '')} · ${T.fmt('ui.week', { n: week })}`,
      weather: s.weather,
      weatherLabel: T.tr(`ui.weather.${s.weather}`),
      energy: s.director.energy,
      energyLabel: T.fmt('ui.ctx.energy', { n: Math.round(s.director.energy) }),
    };
  }

  /** 动作圈：点了某个地点以后能做的事 */
  ring(session: Session, anchor: string, x: number, y: number): RingData {
    const { s } = session;
    const T = this.text;
    const w = worldOf(s, this.content);
    const acts: RingAction[] = [];
    const ICON: Record<string, RingAction['icon']> = {
      watch: 'eye',
      talk: 'talk',
      rally: 'racket',
      feed: 'racket',
      fundraiser: 'coins',
      workday: 'spade',
    };
    if (s.director.at !== anchor)
      acts.push({
        id: `walk:${anchor}`,
        title: T.tr('ui.ring.walk'),
        note: T.tr('ui.ring.walk_note'),
        chips: [{ text: T.fmt('ui.chip.walk', { time: T.duration(this.walkMinutes(s, anchor)) }), tone: 'time' }],
        icon: 'walk',
      });
    if (anchor === 'deck')
      acts.push({
        id: 'plan',
        title: T.tr('ui.ring.board'),
        note: T.tr('ui.ring.board_note'),
        chips: [],
        icon: 'board',
      });
    for (const a of w.actions.values()) {
      if (a.at !== anchor) continue;
      const st = actionStatus(s, w, a);
      if (st.blocked === 'when' || st.blocked === 'once') continue;
      const chips: Chip[] = [];
      if (a.cost) chips.push({ text: T.fmt('ui.chip.cost', { n: a.cost }), tone: 'cost' });
      if (st.onsite) {
        chips.push({ text: T.fmt('ui.chip.energy', { n: `−${a.energy}` }), tone: 'energy' });
        if (s.director.at !== anchor)
          chips.push({ text: T.fmt('ui.chip.walk', { time: T.duration(this.walkMinutes(s, anchor)) }), tone: 'time' });
        chips.push({ text: T.fmt('ui.chip.work', { time: T.duration(st.minutes) }), tone: 'time' });
      }
      if (st.chance !== null)
        chips.push({ text: T.fmt('ui.chip.chance', { p: Math.round(st.chance * 100) }), tone: 'risk' });
      chips.push(...effectChips(T, a.effects));
      if (st.chance !== null) chips.push(...effectChips(T, a.onSuccess, st.chance));
      const cd = st.blocked === 'cooldown' ? (s.actions.cooldowns[a.id] ?? s.t) - s.t : 0;
      acts.push({
        id: a.id,
        title: T.tr(`actions.${a.id}.title`),
        note: T.tr(`actions.${a.id}.note`),
        chips,
        icon: a.onsite ? (ICON[a.performance ?? ''] ?? 'spark') : a.cost ? 'wrench' : 'sign',
        ...(st.blocked
          ? {
              disabled:
                st.blocked === 'cooldown'
                  ? T.fmt('ui.chip.cooldown', { time: T.duration(cd) })
                  : T.tr(`ui.ring.why.${st.blocked}`),
            }
          : {}),
      });
    }
    return {
      x,
      y,
      title: T.anchor(anchor),
      ...(acts.length <= (s.director.at !== anchor ? 1 : 0) ? { subtitle: T.tr('ui.ring.empty') } : {}),
      actions: acts.slice(0, 6),
      goLabel: T.tr('ui.ring.go'),
    };
  }

  /** 公告板：便条、格子、"这样排每周会怎样" */
  planner(session: Session): PlannerData {
    const { s } = session;
    const T = this.text;
    const w = worldOf(s, this.content);
    const parts = Object.keys(w.act.schedule.parts);
    const notes = [...w.activities.values()]
      .filter((a) => a.program)
      .map((a, i) => {
        const COLORS = ['#fff7a8', '#c9e8ff', '#d6f5c4', '#ffffff', '#ffc8b5', '#e6d0ff', '#ffe0a8', '#d0f0ec'];
        const label = T.tr(`activities.${a.id}.title`);
        return {
          id: a.id,
          label,
          short: T.tr(`activities.${a.id}.short`, label),
          color: COLORS[i % COLORS.length] as string,
          parts: a.program?.parts ?? [],
        };
      });
    const pv = planPreview(s, this.content, s.plan);
    const seasons = w.act.seasons;
    const idx = Math.max(
      0,
      seasons.findIndex((x) => x.id === s.season),
    );
    const from = Math.floor(((seasons[idx]?.from_day ?? 1) - 1) / 7) + 1;
    const lastDay = (seasons[idx + 1]?.from_day ?? (w.act.calendar.at(-1)?.day ?? 42) + 1) - 1;
    const to = Math.floor((lastDay - 1) / 7) + 1;
    const money = (n: number) => `${n < 0 ? '−' : '+'}$${Math.abs(n)}`;
    return {
      title: T.tr('ui.plan.title'),
      subtitle: T.fmt('ui.plan.subtitle', { season: T.tr(`seasons.${s.season}`, ''), from, to }),
      parts: parts.map((p) => ({ id: p, label: T.tr(`parts.${p}`) })),
      days: [0, 1, 2, 3, 4, 5, 6].map((d) => T.tr(`ui.days.${d}`)),
      grid: Object.fromEntries(parts.map((p) => [p, [...(s.plan[p] ?? Array(7).fill(null))]])),
      notes,
      projection: [
        {
          label: T.tr('ui.plan.cash'),
          value: money(pv.cashWeek),
          ...(pv.cashWeek < 0 ? { tone: 'bad' as const } : {}),
        },
        { label: T.tr('ui.plan.members'), value: `+${pv.membersWeek}` },
        {
          label: T.tr('ui.plan.quality'),
          value: String(pv.quality),
          ...(pv.quality < 40 ? { tone: 'bad' as const } : {}),
        },
        {
          label: T.tr(pv.lessons > 5 ? 'ui.plan.lessons_over' : 'ui.plan.lessons'),
          value: String(pv.lessons),
          ...(pv.lessons > 5 ? { tone: 'bad' as const } : {}),
        },
        { label: T.tr('ui.plan.pressure'), value: `${pv.pressureWeek > 0 ? '+' : ''}${pv.pressureWeek}` },
        ...(pv.blocked ? [{ label: T.tr('ui.plan.blocked'), value: String(pv.blocked), tone: 'bad' as const }] : []),
      ],
      costNote: s.planning ? T.tr('ui.plan.free') : T.fmt('ui.plan.costs', { n: PLAN_CHANGE_ENERGY }),
      trayLabel: T.tr('ui.plan.tray'),
      lockLabel: T.tr(s.planning ? 'ui.plan.lock' : 'ui.plan.lock_mid'),
      required: s.planning,
    };
  }

  private status(session: Session): string | null {
    const { s } = session;
    const T = this.text;
    const d = s.director;
    if (d.task?.phase === 'working')
      return T.fmt('ui.work', { what: T.tr(`actions.${d.task.action}.title`), time: T.duration(d.task.end - s.t) });
    if (d.leg) {
      const dest = d.route.length ? (d.route[d.route.length - 1] as string) : d.leg.to;
      return T.fmt('ui.walking', { place: T.anchor(dest), time: T.duration(this.walkMinutes(s, dest)) });
    }
    return d.at ? T.fmt('ui.standing', { place: T.anchor(d.at) }) : null;
  }

  private card(session: Session): EventCardData | null {
    const { s } = session;
    const T = this.text;
    if (s.outcome) {
      const o = s.outcome;
      const legacy = s.legacy.map((p) => T.personName(p)).join(', ');
      return {
        id: `end-${o.ending}`,
        kind: 'news',
        topic: T.tr(o.result === 'won' ? 'ui.end.won' : 'ui.end.lost'),
        location: T.tr('ui.club.name'),
        headline: T.tr(`endings.${o.ending}.title`),
        body: T.tr(`endings.${o.ending}.body`),
        ...(legacy ? { note: T.fmt('ui.end.legacy', { names: legacy }) } : {}),
        action: { id: 'replay', label: T.tr('ui.end.again') },
      };
    }
    const o = Projector.focusCard(s, this.content);
    if (!o) return null;
    const w = worldOf(s, this.content);
    const c = w.cards.get(o.card);
    if (!c) return null;
    const statuses = optionStatus(s, w, o.uid);
    const it = session.intent?.uid === o.uid ? session.intent : null;
    const answers: CardAnswer[] = statuses.slice(0, 3).map((st, i) => {
      const opt = c.options[st.key];
      const chips: Chip[] = [];
      if (st.cost) chips.push({ text: T.fmt('ui.chip.cost', { n: st.cost }), tone: 'cost' });
      if (opt) {
        chips.push(...effectChips(T, opt.effects));
        if (st.chance !== null) {
          chips.push({ text: T.fmt('ui.chip.chance', { p: Math.round(st.chance * 100) }), tone: 'risk' });
          chips.push(...effectChips(T, opt.onSuccess, st.chance));
        }
      }
      const then = opt ? thenLine(T, [...opt.effects, ...opt.onSuccess]) : undefined;
      const hints: string[] = [];
      if (st.blocked === 'director' && st.requiresDirectorAt)
        hints.push(
          T.fmt('ui.hint.walk', {
            place: T.anchor(st.requiresDirectorAt),
            time: T.duration(this.walkMinutes(s, st.requiresDirectorAt)),
          }),
        );
      if (st.blocked === 'requires') hints.push(T.tr('ui.hint.requires'));
      if (st.blocked === 'cost') hints.push(T.tr('ui.hint.cash'));
      // 代价和收益由标签讲，选项文字只留"做什么"（去掉文案里 " · " 后面手写的代价）
      const text = T.option(o.card, st.key).split(' · ')[0] ?? '';
      return {
        key: KEYS[i] ?? 1,
        text,
        ...(chips.length ? { chips } : {}),
        ...(then ? { then } : {}),
        ...(st.blocked === 'requires' || st.blocked === 'cost' ? { disabled: true } : {}),
        ...(st.blocked === 'director' ? { walk: true } : {}),
        ...(it?.option === st.key ? { chosen: true } : {}),
        ...(hints.length ? { hint: hints.join(' · ') } : {}),
      };
    });
    const loc = c.location ?? c.stage?.anchor;
    const card: EventCardData = {
      id: `c${o.uid}`,
      kind: answers.length ? 'decision' : 'news',
      topic: T.tr(`events.${o.card}.topic`, ''),
      location: loc ? T.anchor(loc) : T.tr('ui.club.name'),
      headline: T.cardTitle(o.card),
      body: T.tr(`events.${o.card}.body`, ''),
      answers,
      ...(s.cards.open.length > 1 ? { more: s.cards.open.length - 1 } : {}),
      ...(c.who ? { who: this.who(c.who) } : {}),
      context: this.context(s),
    };
    if (o.expires !== null) {
      const total = Math.max(1, o.expires - o.opened);
      const left = Math.max(0, o.expires - session.time);
      card.countdown = { ratio: left / total, label: T.fmt('ui.left', { time: T.duration(left) }) };
    }
    return card;
  }
}

import {
  type CausalEntry,
  type ContentBundle,
  facilityTotals,
  type GameState,
  type OpenCard,
  optionStatus,
  type SimEvent,
  shortestRoute,
  wagesWeek,
  worldOf,
} from '@td/sim';
import {
  type CardAnswer,
  type EventCardData,
  grade,
  type HudSnapshot,
  type StatRow,
  type StoryItem,
  trend,
  type WireItem,
} from '@td/ui';
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
    private readonly text: Text,
  ) {}

  setContent(c: ContentBundle): void {
    this.content = c;
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

  /** 玩家现在该看的那张卡：最快过期的排前面，不会过期的按打开先后 */
  static focusCard(s: GameState): OpenCard | null {
    const open = [...s.cards.open].sort(
      (a, b) =>
        (a.expires ?? Number.POSITIVE_INFINITY) - (b.expires ?? Number.POSITIVE_INFINITY) || a.opened - b.opened,
    );
    return open[0] ?? null;
  }

  /** 走到某处还要几分钟（正在路上就从这一段的终点算起） */
  walkMinutes(s: GameState, to: string): number {
    const w = worldOf(s, this.content);
    const d = s.director;
    const from = d.leg ? d.leg.to : (d.at ?? to);
    const rest = d.leg ? d.leg.end - s.t : 0;
    return rest + (shortestRoute(w, from, to)?.minutes ?? 0);
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
      quality: { value: q, grade: grade(q), trend: trend(this.history, !!s.outcome), history: this.history },
      members: Math.round(s.stats.members ?? 0),
      courts: { open: fac.courts, total: totalCourts },
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
      controls: { paused: session.paused, speed: `${session.speed}×` },
    };
  }

  private status(session: Session): string | null {
    const { s } = session;
    const T = this.text;
    const d = s.director;
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
    const o = Projector.focusCard(s);
    if (!o) return null;
    const w = worldOf(s, this.content);
    const c = w.cards.get(o.card);
    if (!c) return null;
    const statuses = optionStatus(s, w, o.uid);
    const it = session.intent?.uid === o.uid ? session.intent : null;
    const answers: CardAnswer[] = statuses.slice(0, 3).map((st, i) => {
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
      // 选项文字里已经写了价钱就不再重复
      else if (st.cost && !T.option(o.card, st.key).includes(`$${st.cost}`))
        hints.push(T.fmt('ui.hint.cost', { n: st.cost }));
      if (st.chance !== null) hints.push(T.fmt('ui.hint.chance', { p: Math.round(st.chance * 100) }));
      return {
        key: KEYS[i] ?? 1,
        text: T.option(o.card, st.key),
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
    };
    if (o.expires !== null) {
      const total = Math.max(1, o.expires - o.opened);
      const left = Math.max(0, o.expires - session.time);
      card.countdown = { ratio: left / total, label: T.fmt('ui.left', { time: T.duration(left) }) };
    }
    return card;
  }
}

export const KEY_INDEX = KEYS;

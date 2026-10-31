import { clamp } from '@td/shared';
import {
  type CardAnswer,
  type EventCardData,
  grade,
  type HudSnapshot,
  mmss,
  type StatRow,
  trend,
  type WireItem,
} from '@td/ui';

/**
 * Hollow Creek 演示的 HUD 状态：写死剧情往这里记事、扣分、发事件卡，
 * 每 0.25 秒拼成一份快照交给 @td/ui 的转播 HUD 去画。
 * M1 起这些数字来自模拟核心，这个类只剩演出部分。
 */

export interface DemoStats {
  /** 项目质量 0..100 */
  q: number;
  hist: number[];
  members: number;
  complaints: number;
  phoneMin: number;
  ins: number;
  shots: number;
  fired: boolean;
  ended: boolean;
  pbBest: number;
}

/** 演出 1 秒 = 游戏内 15 秒 */
const GAME_PER_SHOW = 15;

interface DecisionCard {
  card: Omit<EventCardData, 'countdown' | 'answers'>;
  answers: CardAnswer[];
  /** 剧情会走的那个选项 */
  pick: 1 | 2 | 3;
  t0: number;
  t1: number;
  chosen: (1 | 2 | 3) | null;
}

interface ActiveCard {
  card: EventCardData | DecisionCard;
  from: number;
  until: number;
}

const isDecision = (c: EventCardData | DecisionCard): c is DecisionCard => 'pick' in c;

export class Hud {
  readonly S: DemoStats = {
    q: 58,
    hist: [58],
    members: 47,
    complaints: 3,
    phoneMin: 0,
    ins: 0,
    shots: 0,
    fired: false,
    ended: false,
    pbBest: 0,
  };
  private readonly wire: WireItem[] = [];
  private wireId = 0;
  private readonly lastLog: Record<string, number> = {};
  private active: ActiveCard | null = null;

  /** now() 返回演出时间（秒）。 */
  constructor(private readonly now: () => number) {}

  /** 游戏内时钟：周六 16:10 开始。 */
  private minutes(): number {
    return Math.floor(16 * 60 + 10 + (this.now() * GAME_PER_SHOW) / 60);
  }

  clockStr(withAmPm = true): string {
    const m = this.minutes();
    const h = Math.floor(m / 60) % 12 || 12;
    return `${h}:${String(m % 60).padStart(2, '0')}${withAmPm ? (m >= 720 ? ' PM' : ' AM') : ''}`;
  }

  log(text: string, hot?: boolean): void {
    this.wire.unshift({ id: this.wireId++, time: this.clockStr(false), text, hot: !!hot });
    if (this.wire.length > 8) this.wire.length = 8;
  }

  /** 同一类事件至少隔 gap 秒才记一次。 */
  maybeLog(key: string, text: string, gap = 9): void {
    if (this.S.ended) return;
    if (this.now() - (this.lastLog[key] ?? -99) < gap) return;
    this.lastLog[key] = this.now();
    this.log(text);
  }

  hitQ(d: number): void {
    this.S.q = clamp(this.S.q + d, 6, 100);
  }

  private vacant = false;
  setVacantCoach(): void {
    this.vacant = true;
  }

  /** 新闻快讯卡：dur 秒（演出时间）后自动收起；dur 为 0 表示一直留着。 */
  news(card: Omit<EventCardData, 'kind' | 'id'>, dur: number): void {
    const t = this.now();
    this.active = {
      card: { ...card, kind: 'news', id: `n${t}` },
      from: t,
      until: dur ? t + dur : Number.POSITIVE_INFINITY,
    };
  }

  /**
   * 要你拍板的事件卡：倒计时 dur 秒（演出时间）。演示的剧情是写死的，
   * 倒计时走完就按 pick 选定，再停留 hold 秒。
   */
  decision(
    card: Omit<EventCardData, 'kind' | 'id' | 'countdown' | 'answers'>,
    answers: readonly { text: string }[],
    pick: 1 | 2 | 3,
    dur: number,
    hold = 2.5,
  ): void {
    const t = this.now();
    const keys = [1, 2, 3] as const;
    this.active = {
      card: {
        card: { ...card, kind: 'decision', id: `d${t}` },
        answers: answers.slice(0, 3).map((a, i) => ({ key: keys[i] ?? 1, text: a.text, disabled: keys[i] !== pick })),
        pick,
        t0: t,
        t1: t + dur,
        chosen: null,
      },
      from: t,
      until: t + dur + hold,
    };
  }

  /** 数字键或点击选项：演示里只有剧情要走的那一项能选，选了就立刻定下来。 */
  answer(key: 1 | 2 | 3): void {
    const c = this.active?.card;
    if (c && isDecision(c) && key === c.pick && c.chosen === null) c.chosen = key;
  }

  private cardSnapshot(): EventCardData | null {
    const a = this.active;
    const t = this.now();
    if (!a) return null;
    if (t > a.until) {
      this.active = null;
      return null;
    }
    if (!isDecision(a.card)) {
      // 会自动收起的快讯卡底部有一条细线倒数
      if (!Number.isFinite(a.until)) return a.card;
      return { ...a.card, timer: Math.max(0, (a.until - t) / (a.until - a.from)) };
    }
    const d = a.card;
    if (t >= d.t1 && d.chosen === null) d.chosen = d.pick;
    const left = Math.max(0, d.t1 - t);
    return {
      ...d.card,
      countdown: {
        ratio: d.chosen ? 0 : left / (d.t1 - d.t0),
        label: d.chosen ? 'Decided' : `${mmss(left * GAME_PER_SHOW)} left`,
      },
      answers: d.answers.map((x) => ({ ...x, chosen: x.key === d.chosen })),
    };
  }

  /** 拼一份给 @td/ui 的快照。lessonBalls 是 1 号场上散落的课程用球数。 */
  snapshot(lessonBalls: number, controls: HudSnapshot['controls']): HudSnapshot {
    const { S } = this;
    const details: StatRow[] = [
      { label: 'Court 2', value: 'Rented · pickleball', tone: 'pickle' },
      {
        label: 'Balls left lying on court 1',
        value: String(lessonBalls),
        ...(lessonBalls > 12 ? { tone: 'bad' } : {}),
      },
      { label: 'Coach phone time', value: `${Math.floor(S.phoneMin)} min` },
      { label: 'Lesson shots that went in', value: S.shots ? `${Math.round((S.ins / S.shots) * 100)}%` : '' },
      { label: 'Member complaints', value: String(S.complaints), ...(S.complaints > 3 ? { tone: 'bad' } : {}) },
      { label: 'Longest pickleball rally', value: String(S.pbBest) },
    ];
    return {
      club: { badge: 'HC', name: 'Hollow Creek TC', clock: `Sat ${this.clockStr()}` },
      quality: { value: S.q, grade: grade(S.q), trend: trend(S.hist, S.ended), history: S.hist },
      members: S.members,
      courts: { open: 1, total: 4 },
      salary: { text: '$29K', change: '▼30%' },
      headCoach: { name: 'Dale Pruitt', vacant: this.vacant },
      details,
      wire: this.wire,
      card: this.cardSnapshot(),
      controls,
    };
  }
}

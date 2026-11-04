import {
  type AssignBlock,
  at,
  type CausalEntry,
  type ContentBundle,
  canAssign,
  currentEdition,
  DIRECTOR,
  dayOf,
  type Effect,
  type EndingStatus,
  endingStatus,
  facilityTotals,
  type GameState,
  goalsFor,
  growthOf,
  hasDemand,
  minuteOfDay,
  minutes,
  num,
  type OpenCard,
  type Order,
  optionStatus,
  orderCost,
  orderStatus,
  orderWork,
  type Post,
  postExists,
  postStatus,
  potentialOf,
  prepStatus,
  type SimEvent,
  type SkillKind,
  servicePass,
  serviceRate,
  shortestRoute,
  speedOf,
  staffIds,
  starStatus,
  type TournamentStatus,
  testCond,
  tournamentStatus,
  wagesWeek,
  walkEta,
  weekdayOf,
  working,
  workSkill,
  worldOf,
} from '@td/sim';
import {
  type BeatItem,
  type CardAnswer,
  type Chip,
  type EventCardData,
  grade,
  type HudSnapshot,
  type PlaceRow,
  type PlaceSheetData,
  type RecapData,
  type ScoreCard,
  type SeasonInfo,
  type StaffToken,
  type StarInfo,
  type StatRow,
  type StoryItem,
  type TargetSheetData,
  trend,
  type VariantRow,
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
  /** 已经在快讯里提醒过"快撑不住了"的设施（回到 40 以上再清掉） */
  private readonly worn = new Set<string>();
  private lastSample = -1;
  /** 上一批事件处理完时每个人手上的活：习惯把人调走时，好说出他放下了什么 */
  private readonly lastJob = new Map<string, string | null>();
  /** 员工成长（W3）：今天开工时每个人的能力（员工条上"今天长进了"的小 ▲） */
  private growDay = -1;
  private readonly dayStart = new Map<string, Record<SkillKind, number>>();

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
      if (e.type === 'skill_up' || e.type === 'unlock' || e.type === 'settlement' || e.type === 'season_two') {
        this.growthWire(s, e, events);
        continue;
      }
      if (e.type === 'dayEnded') {
        // 设施状况跌破 30 提醒一次（第二轮试玩 S3：状况悄悄掉到 0 没人发现）；周六收盘再提醒一次"明天掉档"。
        // 只提醒会变旧、会掉档的设施：废墟和停用的设施不会再往下掉，也不挂提醒（GM-1：废墟天天刷屏）
        const w = worldOf(s, this.content);
        const limit = w.act.rules.grade_drop_below;
        const saturday = e.day % 7 === 6;
        for (const [f, c] of Object.entries(s.condition)) {
          const st = w.facilities.get(f)?.states[s.facilities[f] ?? ''];
          if (!st?.decay_day) {
            this.worn.delete(f);
            continue;
          }
          const place = T.tr(`ui.fac.${f}`, f);
          const n = Math.round(c);
          if (c >= 40) this.worn.delete(f);
          else if (c < 30 && !this.worn.has(f)) {
            this.worn.add(f);
            if (!(saturday && st.drops_to && c < limit + st.decay_day))
              this.push(s.t, T.fmt('ui.wire.worn', { place, n, limit }), true);
          }
          // 明天收盘就要掉：按一天的衰减估一下，够不着阈值的才提醒
          if (saturday && st.drops_to && limit && c < limit + st.decay_day)
            this.push(s.t, T.fmt('ui.wire.dropping', { place, n }), true);
        }
      } else if (e.type === 'cardOpened') this.push(s.t, T.cardTitle(e.card), false);
      else if (e.type === 'log' && e.entry.cause.kind === 'week') {
        // 周结算一周一条（GM-1）：服务率 + 这一周动了哪些数；细节（为什么）在"我们怎么走到这一步"里
        const c = e.entry.cause;
        const what = e.entry.effects
          .map((x) => (x.kind === 'stat' ? T.effect(x) : null))
          .filter((x): x is string => !!x)
          .join(' · ');
        const rate = c.demand ? c.served / c.demand : 0;
        const hot =
          (c.demand > 0 && rate < c.pass) ||
          e.entry.effects.some((x) => x.kind === 'stat' && x.stat !== 'cash' && x.stat !== 'quality' && x.delta < 0);
        this.push(
          s.t,
          T.fmt('ui.wire.week', {
            n: c.week,
            rate: c.demand ? T.fmt('ui.wire.week_rate', { n: Math.round(rate * 100) }) : T.tr('ui.wire.week_none'),
            what,
          }),
          hot,
        );
      } else if (e.type === 'log') {
        // 升星、改造期满由各自的领域事件讲（下面），日志这条不再重复
        const kind = e.entry.cause.kind;
        // 成长解锁、结算、第二季由各自的领域事件讲（growthWire）
        if (kind === 'star' || kind === 'remodel' || kind === 'unlock' || kind === 'settlement' || kind === 'season')
          continue;
        if (kind === 'tournament') {
          this.tournamentWire(s, e.entry);
          continue;
        }
        const so = T.so(e.entry);
        if (!so || kind === 'start') continue;
        const hot =
          e.entry.cause.kind === 'wear' ||
          e.entry.effects.some((x) => x.kind === 'fire' || x.kind === 'hire' || x.kind === 'end');
        this.push(s.t, so, hot);
      } else if (e.type === 'activityStarted') {
        this.push(s.t, T.tr(`activities.${e.activity}.title`), false);
      } else if (e.type === 'star_up') {
        // 升星是一个时刻（game-design.md）：快讯里说几星、开出了什么
        const opens = e.opens.map((k) => T.tr(`stars.opens.${k}`, k)).join(T.lang === 'zh' ? '、' : ', ');
        this.push(
          s.t,
          T.fmt('ui.wire.star_up', { n: e.stars, opens: opens ? T.fmt('ui.wire.star_opens', { list: opens }) : '' }),
          false,
        );
      } else if (e.type === 'variant_locked') {
        this.push(
          s.t,
          T.fmt('ui.wire.variant_locked', {
            place: T.tr(`ui.fac.${e.facility}`, e.facility),
            variant: this.variantName(e.facility, e.variant),
          }),
          false,
        );
      } else if (e.type === 'plaque_added') {
        // 牌匾：谁带的头、第几天；比一个人干快了多少（work − minutes）
        const faster = e.work - e.minutes;
        this.push(
          s.t,
          T.fmt('ui.wire.plaque', {
            name: T.personName(e.leader),
            place: T.tr(`ui.fac.${e.facility}`, e.facility),
            day: e.day,
            faster: faster >= 60 ? T.fmt('ui.wire.plaque_faster', { time: T.duration(faster) }) : '',
          }),
          false,
        );
      } else if (e.type === 'remodel_started') {
        this.push(
          s.t,
          T.fmt('ui.wire.remodel_started', {
            place: T.tr(`ui.fac.${e.facility}`, e.facility),
            variant: this.variantName(e.facility, e.variant),
            time: T.duration(e.until - s.t),
          }),
          true,
        );
      } else if (e.type === 'remodel_done') {
        this.push(
          s.t,
          T.fmt('ui.wire.remodel_done', {
            place: T.tr(`ui.fac.${e.facility}`, e.facility),
            variant: this.variantName(e.facility, e.variant),
          }),
          false,
        );
      } else if (e.type === 'directorGrew') {
        // 总监在长进：让玩家看见（核心玩法决定）
        this.push(s.t, T.fmt('ui.wire.grew', { skill: T.tr(`ui.skill.${e.skill}`), n: e.value }), false);
      } else if (e.type === 'routine') {
        // 习惯（ADR 0014）把人从不限时段的岗位调回他的班。人-13 起派去工单的人做完以前不被拉走，
        // 所以这里只剩"放下了一个随时可干的岗位"这一种
        const w = worldOf(s, this.content);
        const prev = this.lastJob.get(e.person) ?? null;
        const left = prev ? w.posts.get(prev) : undefined;
        if (left && !left.hours && left.id !== e.target)
          this.push(
            s.t,
            T.fmt('ui.wire.routine_post', {
              name: T.personName(e.person),
              post: T.tr(`posts.${e.target}.title`, e.target),
              from: this.targetTitle(left.id),
            }),
            false,
          );
      } else if (e.type === 'returned') {
        // 人-13：工单做完（或作废），回到派去之前的岗位
        this.push(
          s.t,
          T.fmt('ui.wire.returned', {
            name: T.personName(e.person),
            order: this.targetTitle(e.order),
            post: this.targetTitle(e.post),
          }),
          false,
        );
      } else if (e.type === 'released') {
        // 岗位没了，人放下来闲着：讲清楚为什么（掉档、改造、赛事）
        const w = worldOf(s, this.content);
        const at = w.posts.get(e.post)?.at;
        const place = e.facility ? T.tr(`ui.fac.${e.facility}`, e.facility) : at ? T.anchor(at) : '';
        const key =
          e.reason === 'event'
            ? w.eventPosts.has(e.post)
              ? 'ui.wire.released_event_end'
              : 'ui.wire.released_event'
            : e.reason === 'remodel'
              ? 'ui.wire.released_remodel'
              : 'ui.wire.released_closed';
        this.push(
          s.t,
          T.fmt(key, { name: T.personName(e.person), place, post: this.short(e.post) }),
          e.reason === 'closed',
        );
      } else if (e.type === 'tournament_entered') {
        this.push(
          s.t,
          T.fmt('ui.wire.tour_entered', { title: this.tourTitle(s, e.tournament), when: this.when(s, e.start) }),
          false,
        );
      } else if (e.type === 'tournament_live') {
        const posts = e.posts.map((p) => this.short(p)).join(T.lang === 'zh' ? '、' : ', ');
        this.push(
          s.t,
          posts
            ? T.fmt('ui.wire.tour_live', { title: this.tourTitle(s, e.tournament), posts })
            : T.fmt('ui.wire.tour_live_none', { title: this.tourTitle(s, e.tournament) }),
          true,
        );
      } else if (e.type === 'prep_done') {
        this.push(
          s.t,
          T.fmt(e.done >= e.total ? 'ui.wire.prep_all' : 'ui.wire.prep_done', {
            group: T.tr(`prep.${e.group}`, e.group),
            what: this.short(e.order),
            done: e.done,
            total: e.total,
          }),
          false,
        );
      } else if (e.type === 'postInterrupted') {
        // 拉走持续岗位的代价要让玩家看见
        this.push(
          s.t,
          T.fmt('ui.wire.interrupted', { name: T.personName(e.person), post: T.tr(`posts.${e.post}.title`) }),
          true,
        );
      }
    }
    for (const [id, p] of Object.entries(s.people)) this.lastJob.set(id, p.hired ? (p.job ?? null) : null);
  }

  /**
   * 员工成长（W3）和结局（W4）的快讯：
   * - 跨过门槛（5 的整数倍）一条；同一批里这个人还开出了东西，就并成一条"到了 75——开出了夜间红土养护"。
   * - 总监的成长已经由 directorGrew 讲，单独的 skill_up 不再重复。
   */
  private growthWire(
    s: GameState,
    e: Extract<SimEvent, { type: 'skill_up' | 'unlock' | 'settlement' | 'season_two' }>,
    batch: readonly SimEvent[],
  ): void {
    const T = this.text;
    if (e.type === 'skill_up') {
      if (e.person === DIRECTOR) return;
      if (batch.some((x) => x.type === 'unlock' && x.person === e.person)) return;
      this.push(
        s.t,
        T.fmt('ui.grow.skill_up', { name: T.personName(e.person), skill: T.tr(`ui.skill.${e.skill}`), n: e.value }),
        false,
      );
    } else if (e.type === 'unlock') {
      const what = T.tr(`unlocks.${e.key}`, e.key);
      const up = [...batch].reverse().find((x) => x.type === 'skill_up' && x.person === e.person);
      this.push(
        s.t,
        up?.type === 'skill_up'
          ? T.fmt('ui.grow.unlock', {
              name: T.personName(e.person),
              skill: T.tr(`ui.skill.${up.skill}`),
              n: up.value,
              what,
            })
          : T.fmt('ui.grow.unlock_plain', { what, names: T.personName(e.person) }),
        false,
      );
    } else if (e.type === 'settlement') {
      this.push(s.t, T.fmt('ui.ending.wire_settled', { total: e.total, grade: e.grade }), true);
    } else {
      this.lastSample = -1;
      this.push(s.t, T.fmt('ui.ending.wire_season_two', { goal: this.goalName(e.goal) }), true);
    }
  }

  /** 第二季目标的名字（内容 ending.goals.<目标>；没写是"新目标还在路上"） */
  private goalName(goal: string): string {
    return this.text.tr(`ending.goals.${goal}`, this.text.tr('ui.ending.goal_tbd'));
  }

  /** 赛事结算（LG-11）的快讯：办完了（附加目标逐个打勾、奖杯和奖励），或者下雨办不成、报名费白花 */
  private tournamentWire(s: GameState, entry: CausalEntry): void {
    const T = this.text;
    const c = entry.cause;
    if (c.kind !== 'tournament') return;
    const title = this.tourTitle(s, c.tournament);
    if (c.result === 'spoiled') {
      const fee = worldOf(s, this.content).tournaments.get(c.tournament)?.fee ?? 0;
      this.push(s.t, T.fmt('ui.wire.tour_spoiled', { title, fee }), true);
      return;
    }
    const goals = Object.entries(c.goals)
      .map(([g, met]) => `${met ? '✓' : '✗'} ${T.tr(`tournaments.${c.tournament}.goals.${g}`, g)}`)
      .join(' ');
    const what = entry.effects
      .map((x) => T.effect(x))
      .filter((x): x is string => !!x)
      .join(' · ');
    const again = c.repeat > 0 ? T.fmt('ui.wire.tour_again', { n: c.repeat + 1, k: c.scale }) : '';
    this.push(s.t, [T.fmt('ui.wire.tour_done', { title }), goals, what, again].filter(Boolean).join(' · '), false);
  }

  /** 赛事的名字；认场地的赛事按这一期的场地叫（tournaments.<id>.variants.<变体>） */
  tourTitle(s: GameState, id: string): string {
    const T = this.text;
    const base = T.tr(`tournaments.${id}.title`, id);
    const of = worldOf(s, this.content).tournaments.get(id)?.variant_of;
    const v = of ? s.variants?.[of] : undefined;
    return v ? T.tr(`tournaments.${id}.variants.${v}`, base) : base;
  }

  /** 某个时刻离现在多远的说法："今天 9:00"、"明天 9:00"、"周六 9:00"、"第 24 天 9:00" */
  when(s: GameState, t: number): string {
    const T = this.text;
    const d = dayOf(t) - dayOf(s.t);
    const time = T.clock(t).replace(':00 ', ' ');
    if (d <= 0) return T.fmt('ui.beat.today', { time });
    if (d === 1) return T.fmt('ui.beat.tomorrow', { time });
    if (d < 7) return T.fmt('ui.beat.weekday', { d: T.tr(`ui.days.${weekdayOf(t)}`), time });
    return T.fmt('ui.beat.day', { n: dayOf(t), time });
  }

  /**
   * 季节栏上接下来的两个日历节拍（UI-9）：招聘日（排着的招聘卡）、赛事（这一期参赛条件够、或者已经报上名的）、
   * 日程上的投资方来访和期限。只读；点一下镜头转到那一处的地点牌。
   */
  beats(s: GameState): BeatItem[] {
    const T = this.text;
    const w = worldOf(s, this.content);
    const out: (BeatItem & { t: number })[] = [];
    for (const ts of tournamentStatus(s, w)) {
      if (!this.beatOpen(s, ts)) continue;
      const live = ts.live || (ts.entered && s.t >= ts.start);
      out.push({
        id: `tour:${ts.id}:${ts.start}`,
        t: live ? s.t : ts.start,
        label: this.tourTitle(s, ts.id),
        when: live ? T.tr('ui.beat.live') : this.when(s, ts.start),
        place: ts.at,
        ...(live ? { live: true } : {}),
      });
    }
    for (const x of s.cards.scheduled) {
      const c = w.cards.get(x.card);
      if (c?.who !== 'applicants' || x.at <= s.t) continue;
      out.push({
        id: `card:${x.card}:${x.at}`,
        t: x.at,
        label: T.tr('ui.beat.hiring'),
        when: this.when(s, x.at),
        place: c.location ?? c.stage?.anchor ?? 'clubhouse',
      });
    }
    // 日历（投资方、期限）是第一季的；第二季（W4）不再挂出来
    for (const x of (s.ending?.season ?? 1) > 1 ? [] : w.act.calendar) {
      const t = at(x.day, x.hour);
      if (t <= s.t) continue;
      const c = w.cards.get(x.card);
      out.push({
        id: `cal:${x.card}:${t}`,
        t,
        label: T.tr(`ui.beat.cards.${x.card}`, T.cardTitle(x.card)),
        when: this.when(s, t),
        place: c?.location ?? c?.stage?.anchor ?? 'entrance',
      });
    }
    return out
      .sort((a, b) => a.t - b.t || a.id.localeCompare(b.id))
      .slice(0, 2)
      .map(({ t: _, ...b }) => b);
  }

  /** 这一期赛事还算不算一个"接下来的节拍"：参赛条件够或已经报上名；主办没报上名、已经开赛的不算；外出打完的不算 */
  private beatOpen(s: GameState, ts: TournamentStatus): boolean {
    if (!ts.eligible && !ts.entered) return false;
    if (s.t >= ts.end) return false;
    if (ts.kind === 'host') return ts.entered || s.t < ts.start;
    return (s.tournaments?.[ts.id]?.last ?? -1) < ts.start;
  }

  /** 变体的名字（文案 variants.<设施>.<变体>，" · " 后面是取舍一句话） */
  variantName(facility: string, variant: string): string {
    return this.text.tr(`variants.${facility}.${variant}`, variant).split(' · ')[0] ?? variant;
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

  /** 日程上的最后一项（投资方给的期限）：状态条上倒数 */
  private deadline(s: GameState): number | null {
    // 第二季没有期限（W4）
    if ((s.ending?.season ?? 1) > 1) return null;
    const act = worldOf(s, this.content).act;
    const last = act.calendar[act.calendar.length - 1];
    return last ? at(last.day, last.hour) : null;
  }

  /** 某人走到某处还要几分钟（和模拟改派时的走法一致：路上可以半路掉头，见 walkEta） */
  walkMinutes(s: GameState, person: string, to: string): number {
    const w = worldOf(s, this.content);
    if (!s.people[person]) return 0;
    return Math.round(walkEta(s, w, person, to) ?? 0);
  }

  /**
   * 派到某处的人分成两拨：已经到场在干的（和模拟的 working() 一致），和还在路上（或先办着别的事）的，带几分钟后到。
   * 界面上只把到场的人说成"在干/在这儿"，路上的说"在路上 · N 分钟"。
   */
  private split(
    s: GameState,
    ids: readonly string[],
    at: string,
  ): { here: string[]; coming: { id: string; eta: number }[] } {
    const w = worldOf(s, this.content);
    const here: string[] = [];
    const coming: { id: string; eta: number }[] = [];
    for (const id of ids) {
      if (working(s, w, id)) {
        here.push(id);
        continue;
      }
      const p = s.people[id];
      let eta = this.walkMinutes(s, id, at);
      if (p?.errand) {
        const left =
          p.errand.until === null ? (p.walk ? p.walk.end - s.t : 0) + p.errand.minutes : p.errand.until - s.t;
        eta = left + (shortestRoute(w, p.errand.at, at)?.minutes ?? 0);
      }
      coming.push({ id, eta: Math.max(1, Math.round(eta)) });
    }
    return { here, coming };
  }

  /** "在路上：Dale 22 分钟、总监 35 分钟" */
  private comingLine(coming: readonly { id: string; eta: number }[]): string {
    const T = this.text;
    const list = coming
      .map((c) => T.fmt('ui.place.coming_one', { name: T.personName(c.id), time: T.duration(c.eta) }))
      .join(T.lang === 'zh' ? '、' : ', ');
    return T.fmt('ui.place.coming', { list });
  }

  /** 工单的一行状态：到场的人在干几成；没人到场就是"等人到场"；路上的人跟在后面 */
  private orderLine(s: GameState, o: Order, crew: readonly string[], progress: number): string {
    const T = this.text;
    const { here, coming } = this.split(s, crew, o.at);
    const p = Math.round(progress * 100);
    const head = here.length
      ? T.fmt('ui.place.order_on', { names: here.map((x) => T.personName(x)).join(T.lang === 'zh' ? '、' : ', '), p })
      : T.fmt('ui.place.order_wait', { p });
    return coming.length ? `${head} · ${this.comingLine(coming)}` : head;
  }

  snapshot(session: Session): HudSnapshot {
    const { s } = session;
    const T = this.text;
    const w = worldOf(s, this.content);
    const q = s.stats.quality ?? 0;
    // 第二季开局时钟往回走（W4）：也重新采样
    if (s.t - this.lastSample >= 30 || this.lastSample < 0 || s.t < this.lastSample) {
      this.lastSample = s.t;
      this.history.push(q);
      if (this.history.length > HISTORY) this.history.shift();
    }
    const fac = facilityTotals(s, w);
    let totalCourts = 0;
    for (const f of w.facilities.values()) totalCourts += Math.max(0, ...Object.values(f.states).map((x) => x.courts));
    const cash = s.stats.cash ?? 0;
    const coach = s.headCoach;

    const low = hasDemand(s) && serviceRate(s) < servicePass(w);
    const details: StatRow[] = [
      { label: T.tr('stats.reputation'), value: String(Math.round(s.stats.reputation ?? 0)) },
      {
        label: T.tr('stats.service'),
        value: hasDemand(s) ? `${Math.round(serviceRate(s) * 100)}%` : '—',
        ...(low ? { tone: 'bad' as const } : {}),
      },
      { label: T.tr('stats.restoration'), value: `${Math.round(s.stats.restoration ?? 0)}/${w.facilities.size}` },
      { label: T.tr('ui.details.courts'), value: `${fac.courts}/${totalCourts}` },
      { label: T.tr('ui.details.wages'), value: `$${wagesWeek(s, w)}` },
      ...Object.entries(s.facilities).map(([id, st]) => {
        const [name, state] = T.tr(`facilities.${id}.${st}`).split(' · ');
        const c = Math.round(s.condition[id] ?? 100);
        // 红色只给会掉档的低状况和已经停用的；废墟本来就是这样，不算坏消息
        const def = w.facilities.get(id);
        const decays = !!def?.states[st]?.decay_day;
        const worn = !decays && !!def && Object.values(def.states).some((x) => x.drops_to === st);
        return {
          label: name ?? id,
          value: `${state ?? st} · ${c}`,
          ...((decays && c < 30) || worn ? { tone: 'bad' as const } : {}),
        };
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
      ...(w.act.stars?.length ? { stars: this.stars(s) } : {}),
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
      staff: this.staff(session),
      hint: session.picked && !session.place ? T.fmt('ui.staff.hint', { name: T.personName(session.picked) }) : null,
      sheet: session.sheet ? this.sheet(session, session.sheet) : null,
      place: session.place ? this.placeSheet(session, session.place) : null,
      controls: { paused: session.paused, speed: `${session.speed}×` },
    };
  }

  /** 状态条上的复原进度：八处设施修好了几处，加上离投资方的期限还有几天 */
  private board(s: GameState): NonNullable<HudSnapshot['board']> {
    const v = Math.round(s.stats.restoration ?? 0);
    const total = worldOf(s, this.content).facilities.size;
    const end = this.deadline(s);
    const days = end === null ? null : Math.max(0, Math.ceil((end - s.t) / 1440));
    // 落后于进度：剩下的天数里平均每处设施不到 10 天
    const behind = days !== null && total - v > 0 && days / (total - v) < 10;
    return {
      value: v,
      label:
        days === null || s.outcome
          ? this.text.fmt('ui.restore', { total })
          : this.text.fmt(days === 0 ? 'ui.restore_today' : 'ui.restore_in', { total, days }),
      ...(behind ? { tone: 'bad' as const } : {}),
    };
  }

  /**
   * 状态条的星级格（UI-8）：几颗星、下一星还差几项；点开是下一星清单的每一条（只读，数据来自 starStatus）。
   * 能读出数的条件（会员 ≥ 20、restored >= 3 这种）写上"现在 / 要多少"。
   */
  private stars(s: GameState): StarInfo {
    const T = this.text;
    const w = worldOf(s, this.content);
    const st = starStatus(s, w);
    const next = st.next;
    const lv = next ? w.act.stars?.[next.level - 1] : undefined;
    const end = this.deadline(s);
    const days = end === null ? null : Math.max(0, Math.ceil((end - s.t) / 1440));
    const restored = Math.round(s.stats.restoration ?? 0);
    const sep = T.lang === 'zh' ? '、' : ', ';
    const opens = next?.opens.map((k) => T.tr(`stars.opens.${k}`, k)).join(sep);
    return {
      n: st.stars,
      max: st.max,
      label: next ? T.fmt('ui.stars.label', { n: next.missing }) : T.tr('ui.stars.full'),
      title: [
        next ? T.fmt('ui.stars.title', { n: next.level }) : T.fmt('ui.stars.title_full', { n: st.stars }),
        T.tr(`stars.names.${next?.level ?? st.stars}`, ''),
      ]
        .filter(Boolean)
        .join(' · '),
      items: (next?.items ?? []).map((x) => {
        const value = lv ? this.starValue(s, lv.requires[x.id]) : undefined;
        return { id: x.id, text: T.tr(`stars.items.${x.id}`, x.id), met: x.met, ...(value ? { value } : {}) };
      }),
      ...(opens ? { opens: T.fmt('ui.stars.opens', { list: opens }) } : {}),
      foot:
        days === null || s.outcome
          ? T.fmt('ui.stars.restored', { n: restored, total: w.facilities.size })
          : T.fmt('ui.stars.foot', { n: restored, total: w.facilities.size, days }),
    };
  }

  /** 星级清单一条的"现在 / 要多少"：数值条件和形如 `x >= y` 的表达式读得出；别的不写 */
  private starValue(s: GameState, c: unknown): string | undefined {
    const w = worldOf(s, this.content);
    const r = (n: number) => String(Math.round(n));
    try {
      if (!c || typeof c !== 'object') return undefined;
      const o = c as Record<string, unknown>;
      if (typeof o.stat === 'string') {
        const t = [o.gte, o.gt, o.eq, o.lte, o.lt].find((x) => typeof x === 'number') as number | undefined;
        return t === undefined ? undefined : `${r(s.stats[o.stat] ?? 0)}/${t}`;
      }
      if (typeof o.facility === 'string' && typeof o.is === 'string') {
        const now = s.facilities[o.facility];
        return now ? this.text.tr(`facilities.${o.facility}.${now}`, now).split(' · ')[1] : undefined;
      }
      if (typeof o.expr === 'string') {
        const m = /^\s*([\w.]+)\s*(>=|>|==)\s*(.+?)\s*$/.exec(o.expr);
        if (!m) return undefined;
        return `${r(num(s, w, m[1] as string))}/${r(num(s, w, m[3] as string))}`;
      }
    } catch {
      return undefined;
    }
    return undefined;
  }

  /**
   * 选项里设的旗标会不会动董事会信心（第二轮试玩 S6："董事会会不耐烦"只在选完以后才看得到）：
   * 把旗标代进董事会信心的各项算一遍，差值就是这个选项对董事会的影响。
   */
  private flagChips(s: GameState, effs: readonly Effect[], prob: number): Chip[] {
    const act = this.content.acts.find((a) => a.id === s.act);
    if (!act) return [];
    const w = worldOf(s, this.content);
    const out: Chip[] = [];
    for (const [stat, terms] of Object.entries(act.rules.derived_terms)) {
      const extra: Record<string, boolean> = {};
      for (const e of effs) if ('flag' in e && 'set' in e) extra[`flag.${e.flag}`] = !!e.set;
      if (!Object.keys(extra).length) continue;
      let d = 0;
      for (const src of Object.values(terms)) d += num(s, w, src, extra) - num(s, w, src);
      if (Math.abs(d) < 1) continue;
      const maybe = prob < 1 ? ` (${Math.round(prob * 100)}%)` : '';
      out.push({
        text: `${this.text.tr(`stats.${stat}`)} ${d > 0 ? '+' : '−'}${Math.abs(Math.round(d))}${maybe}`,
        tone: d > 0 ? 'gain' : 'loss',
      });
    }
    return out;
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

  /** 卡片上的"此刻的局面"：复原进度、现金、会员、服务率 */
  private context(s: GameState): Chip[] {
    const T = this.text;
    const b = Math.round(s.stats.restoration ?? 0);
    const end = this.deadline(s);
    const days = end === null ? 0 : Math.max(0, Math.ceil((end - s.t) / 1440));
    return [
      { text: T.fmt('ui.ctx.restore', { n: b, total: worldOf(s, this.content).facilities.size, days }), tone: 'info' },
      {
        text: T.fmt('ui.ctx.cash', { n: Math.round(s.stats.cash ?? 0) }),
        tone: (s.stats.cash ?? 0) < 0 ? 'loss' : 'info',
      },
      { text: T.fmt('ui.ctx.members', { n: Math.round(s.stats.members ?? 0) }) },
      hasDemand(s)
        ? {
            text: T.fmt('ui.ctx.service', { n: Math.round(serviceRate(s) * 100) }),
            tone: serviceRate(s) < servicePass(worldOf(s, this.content)) ? 'loss' : 'info',
          }
        : { text: T.tr('ui.ctx.service_none'), tone: 'info' },
    ];
  }

  /** 季节、天气、本周服务率 */
  private season(s: GameState): SeasonInfo {
    const T = this.text;
    const week = Math.floor(Math.floor(s.t / 1440) / 7) + 1;
    const service = hasDemand(s) ? Math.round(serviceRate(s) * 100) : null;
    return {
      label: `${T.tr(`seasons.${s.season}`, '')} · ${T.fmt('ui.week', { n: week })}`,
      // 晴天入夜（画面 18:15 起转黄昏，18:45 以后天黑）画月亮，不画太阳（QA P3）
      weather: s.weather === 'sun' && (s.t % 1440 >= 18.75 * 60 || s.t % 1440 < 6 * 60) ? 'night' : s.weather,
      weatherLabel: T.tr(`ui.weather.${s.weather}`),
      service,
      serviceLabel: service === null ? T.tr('ui.ctx.service_none') : T.fmt('ui.ctx.service', { n: service }),
      beats: this.beats(s),
      ...(this.goalLine(s) ? { goal: this.goalLine(s) as string } : {}),
    };
  }

  /** 第二季的目标（W4 占位）：结局打开、开了第二季才有 */
  private goalLine(s: GameState): string | null {
    const st = s.ending;
    if (!st?.goal || st.season < 2 || !endingStatus(s, worldOf(s, this.content))) return null;
    return this.text.fmt('ui.ending.goal', { n: st.season, goal: this.goalName(st.goal) });
  }

  /** 派到活上的人的头像：还没到场的标上 coming */
  private faceAt(s: GameState, id: string): { initials: string; color: string; coming?: boolean } {
    const f = this.face(id);
    return working(s, worldOf(s, this.content), id) ? f : { ...f, coming: true };
  }

  /** 头像：名字的首字母（中文名取第一个字）和一个固定的颜色 */
  face(id: string): { name: string; initials: string; color: string } {
    const name = this.text.personName(id);
    // 首字母取内容里的原名（"Dale 教练"也是 DP）；只有中文名的人（总监）取第一个字
    const raw = this.content.people.find((p) => p.id === id)?.name ?? name;
    const clean = (/^[A-Za-z]/.test(name) || id !== DIRECTOR ? raw : name).replace(/^(Coach|Ms\.|Mr\.)\s+/, '');
    const initials = /^[A-Za-z0-9]/.test(clean)
      ? clean
          .split(/\s+/)
          .map((x) => x[0] ?? '')
          .join('')
          .slice(0, 2)
          .toUpperCase()
      : clean.slice(0, 1);
    const COLORS = ['#d7ff3c', '#9be07f', '#ffc8b5', '#c9e8ff', '#fff7a8', '#e6d0ff'];
    let h = 0;
    for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return { name, initials, color: id === DIRECTOR ? '#62e08c' : (COLORS[h % COLORS.length] as string) };
  }

  /**
   * 此刻能开工、又没人在做的工单（钱够、人数没满）：修复类（做完换设施状态）在前，便宜的在前。
   * 员工条和地点牌的"下一步"提示用（只读状态，不改任何东西）。
   */
  readyOrders(s: GameState): Order[] {
    const w = worldOf(s, this.content);
    const repair = (o: Order) => o.effects.some((e) => 'facility' in e && 'set' in e);
    return [...w.orders.values()]
      .filter((o) => {
        const st = orderStatus(s, w, o);
        return st.visible && st.blocked === null && st.crew.length === 0;
      })
      .sort((a, b) => Number(repair(b)) - Number(repair(a)) || a.cost - b.cost || a.id.localeCompare(b.id));
  }

  /** 有没有在职的人手上没活（没岗位没工单、没在走路、没在办事） */
  anyIdle(s: GameState): boolean {
    const w = worldOf(s, this.content);
    return staffIds(s, w).some((id) => {
      const p = s.people[id];
      return !!p && !p.job && !p.walk && !p.errand;
    });
  }

  /** 岗位或工单的名字 */
  targetTitle(id: string): string {
    return this.text.tr(`posts.${id}.title`, this.text.tr(`orders.${id}.title`, id));
  }

  /** 这个人在干什么（员工条上的一行小字） */
  doing(s: GameState, id: string): { text: string; state: StaffToken['state'] } {
    const T = this.text;
    const w = worldOf(s, this.content);
    const p = s.people[id];
    if (!p) return { text: '', state: 'idle' };
    if (p.errand) {
      const left = p.errand.until === null ? (p.walk ? p.walk.end - s.t : 0) + p.errand.minutes : p.errand.until - s.t;
      return {
        text: T.fmt('ui.staff.errand', { place: T.anchor(p.errand.at), time: T.duration(left) }),
        state: 'errand',
      };
    }
    if (p.walk && p.job)
      return {
        text: T.fmt('ui.staff.walking', { what: this.targetTitle(p.job), time: T.duration(p.walk.end - s.t) }),
        state: 'walking',
      };
    if (p.walk)
      return {
        text: T.fmt('ui.staff.walking', { what: T.anchor(p.walk.to), time: T.duration(p.walk.end - s.t) }),
        state: 'walking',
      };
    // 闲着或在等客人：有下一班就说下一班几点（ADR 0014：到点他自己会去）
    const next = this.nextShift(s, id);
    if (!p.job) {
      if (next) return { text: T.fmt('ui.staff.next', next), state: 'waiting' };
      // 闲着、手边又有能开工的活：员工条上直接说下一步是什么（e7：放置对照里没人告诉你下一步）
      const ready = this.readyOrders(s).find((o) => canAssign(s, w, id, o.id) === null);
      return ready
        ? { text: T.fmt('ui.staff.idle_next', { what: this.targetTitle(ready.id) }), state: 'idle' }
        : { text: T.fmt('ui.staff.idle', { place: T.anchor(p.at) }), state: 'idle' };
    }
    const post = w.posts.get(p.job);
    if (post) {
      const st = postStatus(s, w, post);
      if (st.active) return { text: this.targetTitle(p.job), state: 'working' };
      return next && next.what !== this.short(p.job)
        ? { text: T.fmt('ui.staff.next', next), state: 'waiting' }
        : { text: T.fmt('ui.staff.waiting', { what: this.targetTitle(p.job) }), state: 'waiting' };
    }
    const order = w.orders.get(p.job);
    if (order) {
      const st = orderStatus(s, w, order);
      return { text: `${this.targetTitle(p.job)} · ${Math.round(st.progress * 100)}%`, state: 'working' };
    }
    return { text: this.targetTitle(p.job), state: 'working' };
  }

  /** 这个人今天接下来的第一个班（习惯里还没开始的有时段岗位） */
  private nextShift(s: GameState, id: string): { time: string; what: string } | null {
    const w = worldOf(s, this.content);
    const h = minuteOfDay(s.t) / 60;
    let best: Post | null = null;
    for (const x of s.people[id]?.routine ?? []) {
      const post = w.posts.get(x);
      if (!post?.hours || post.hours[0] <= h || (post.days && !post.days.includes(weekdayOf(s.t)))) continue;
      if (!best || post.hours[0] < (best.hours?.[0] ?? 99)) best = post;
    }
    return best?.hours ? { time: `${best.hours[0]}:00`, what: this.short(best.id) } : null;
  }

  /** 底部员工条：总监在最前，然后按招来的顺序 */
  staff(session: Session): StaffToken[] {
    const { s } = session;
    const w = worldOf(s, this.content);
    const grows = !!growthOf(w);
    if (grows && dayOf(s.t) !== this.growDay) {
      this.growDay = dayOf(s.t);
      this.dayStart.clear();
    }
    return staffIds(s, w)
      .sort((a, b) => (a === DIRECTOR ? -1 : b === DIRECTOR ? 1 : 0))
      .map((id) => {
        const p = s.people[id];
        const d = this.doing(s, id);
        const player = this.content.people.find((x) => x.id === id)?.kind === 'player';
        // 员工成长（W3）：潜力是条上淡淡的一截；今天有能力涨过一个整数，名字旁一个小 ▲
        let growth: Pick<StaffToken, 'potential' | 'rose'> = {};
        if (grows && p) {
          const now: Record<SkillKind, number> = { teach: p.skill, upkeep: p.upkeep, service: p.service, play: p.play };
          const start = this.dayStart.get(id) ?? now;
          this.dayStart.set(id, start);
          const keys: SkillKind[] = player ? ['teach', 'upkeep', 'service', 'play'] : ['teach', 'upkeep', 'service'];
          growth = {
            potential: {
              teach: potentialOf(w, id, 'teach'),
              upkeep: potentialOf(w, id, 'upkeep'),
              service: potentialOf(w, id, 'service'),
              ...(player ? { play: potentialOf(w, id, 'play') } : {}),
            },
            ...(keys.some((k) => Math.floor(now[k] + 1e-6) > Math.floor(start[k] + 1e-6)) ? { rose: true } : {}),
          };
        }
        return {
          id,
          ...this.face(id),
          doing: d.text,
          state: d.state,
          skills: {
            teach: p?.skill ?? 0,
            upkeep: p?.upkeep ?? 0,
            service: p?.service ?? 0,
            ...(player ? { play: p?.play ?? 0 } : {}),
          },
          ...growth,
          ...(session.picked === id ? { picked: true } : {}),
          ...(p?.errand ? { locked: true } : {}),
        };
      });
  }

  /** 每圈大概带来什么：把岗位效果里的数折成标签（表达式按在岗这个人的能力估） */
  private postChips(post: Post): Chip[] {
    const T = this.text;
    const chips: Chip[] = [];
    chips.push({ text: T.tr(`ui.skill.${post.skill}`), tone: 'info' });
    // 能力门槛（W3，成长解锁的岗位）：只有底子够的人能坐，和工单一样
    for (const [k, n] of Object.entries(post.worker ?? {}))
      chips.push({ text: T.fmt('ui.chip.needs', { skill: T.tr(`ui.skill.${k}`), n: n ?? 0 }), tone: 'risk' });
    if (post.hours) {
      const ds = post.days ?? [];
      const run = ds.length > 2 && ds.every((d, i) => i === 0 || d === (ds[i - 1] as number) + 1);
      const days = !post.days
        ? T.tr('ui.sheet.daily')
        : run
          ? `${T.tr(`ui.days.${ds[0]}`)}–${T.tr(`ui.days.${ds[ds.length - 1]}`)}`
          : ds.map((d) => T.tr(`ui.days.${d}`)).join(T.lang === 'zh' ? '' : '/');
      chips.push({ text: `${days} ${post.hours[0]}–${post.hours[1]}`, tone: 'time' });
    } else chips.push({ text: T.tr('ui.sheet.anytime'), tone: 'time' });
    chips.push({ text: T.fmt('ui.sheet.cycle', { time: T.duration(minutes(post.cycle)) }), tone: 'time' });
    // 收入随能力和会员数变：表达式不出具体数字，只说"有收入"
    const variable = (e: (typeof post.effects)[number]) => 'stat' in e && 'add' in e && typeof e.add !== 'number';
    chips.push(
      ...effectChips(
        T,
        post.effects.filter((e) => !variable(e)),
      ),
    );
    if (post.effects.some((e) => variable(e) && 'stat' in e && e.stat === 'cash'))
      chips.push({ text: T.tr('ui.sheet.income'), tone: 'gain' });
    if (post.restore) chips.push({ text: T.fmt('ui.sheet.restore', { n: post.restore }), tone: 'gain' });
    if (post.wear) chips.push({ text: T.fmt('ui.sheet.wear', { n: post.wear }), tone: 'loss' });
    return chips;
  }

  private orderChips(s: GameState, o: Order): Chip[] {
    const T = this.text;
    const w = worldOf(s, this.content);
    const st = orderStatus(s, w, o);
    const chips: Chip[] = [{ text: T.tr(`ui.skill.${o.skill}`), tone: 'info' }];
    // 能力门槛（升级工单）：只有底子够的人能干
    for (const [k, n] of Object.entries(st.worker ?? {}))
      chips.push({ text: T.fmt('ui.chip.needs', { skill: T.tr(`ui.skill.${k}`), n: n ?? 0 }), tone: 'risk' });
    // 材料费、工作量按当前变体算（锁定的 / 拖向的 / 默认的）
    if (st.cost && !st.started) chips.push({ text: T.fmt('ui.chip.cost', { n: st.cost }), tone: 'cost' });
    chips.push({
      text: T.fmt('ui.sheet.work', { time: T.duration(st.work * (1 - st.progress)) }),
      tone: 'time',
    });
    if (o.remodel)
      chips.push({ text: T.fmt('ui.chip.closed', { time: T.duration(minutes(o.closed_for ?? '7d')) }), tone: 'loss' });
    if (o.upgrade) {
      const f = w.facilityAt.get(o.at) ?? '';
      chips.push({ text: this.upgradeName(f, o.upgrade), tone: 'gain' });
    }
    if (o.crew > 1) chips.push({ text: T.fmt('ui.sheet.crew', { n: o.crew }), tone: 'info' });
    if (st.minCrew > 1) chips.push({ text: T.fmt('ui.chip.min_crew', { n: st.minCrew }), tone: 'risk' });
    // 赛事的报名工单：办完给什么（奖励按这一期的折扣；附加目标在地点清单顶上那一格）
    const tour = st.tournament ? w.tournaments.get(st.tournament) : undefined;
    if (tour) {
      const k = (s.tournaments?.[tour.id]?.entries ?? 0) > 0 ? tour.repeat.scale : 1;
      const live = tour.reward.filter((e) => !e.if || testCond(s, w, e.if));
      chips.push(
        ...effectChips(
          T,
          live.map((e) =>
            'stat' in e && 'add' in e && typeof e.add === 'number' ? { ...e, add: Math.round(e.add * k) } : e,
          ),
        ),
      );
    }
    if (st.chance !== null)
      chips.push({ text: T.fmt('ui.chip.chance', { p: Math.round(st.chance * 100) }), tone: 'risk' });
    chips.push(...effectChips(T, o.effects));
    if (st.chance !== null) chips.push(...effectChips(T, o.onSuccess, st.chance));
    if (o.restore) chips.push({ text: T.fmt('ui.sheet.restore_done', { n: o.restore }), tone: 'gain' });
    return chips;
  }

  /** 升级的名字（文案 upgrades.<设施>.<升级>） */
  upgradeName(facility: string, upgrade: string): string {
    return this.text.tr(`upgrades.${facility}.${upgrade}`, upgrade).split(' · ')[0] ?? upgrade;
  }

  /** 派不过去的原因；能力门槛写出要哪项、多少（canAssign 的 'skill'） */
  private why(block: AssignBlock, target: string, s?: GameState): string {
    const T = this.text;
    // 外出赛事开赛以前：报名工单挂出来了，但要等比赛那天才能出发
    if (block === 'early' && s) {
      const t = worldOf(s, this.content).tournamentOf.get(target);
      const e = t ? currentEdition(worldOf(s, this.content), t.id, s.t) : null;
      if (e) return T.fmt('ui.why.early', { when: this.when(s, e.start) });
    }
    if (block === 'skill') {
      const o = this.content.orders.find((x) => x.id === target) ?? this.content.posts.find((x) => x.id === target);
      const [k, n] = Object.entries(o?.worker ?? {})[0] ?? [];
      if (k) return T.fmt('ui.why.skill_min', { skill: T.tr(`ui.skill.${k}`), n: n ?? 0 });
    }
    return T.tr(`ui.why.${block}`);
  }

  /** 点了场景里的岗位或工单：它是什么、现在怎样、派谁去会怎样 */
  sheet(session: Session, target: string): TargetSheetData | null {
    const { s } = session;
    const T = this.text;
    const w = worldOf(s, this.content);
    const post = w.posts.get(target);
    const order = w.orders.get(target);
    const def = post ?? order;
    if (!def) return null;
    let status: string;
    let progress: number | undefined;
    let chips: Chip[];
    if (post) {
      const st = postStatus(s, w, post);
      chips = this.postChips(post);
      progress = st.progress;
      status = st.person
        ? st.active
          ? T.fmt('ui.sheet.post_on', {
              name: T.personName(st.person),
              time: T.duration((1 - st.progress) * st.cycle),
            })
          : working(s, w, st.person)
            ? T.fmt('ui.sheet.post_wait', { name: T.personName(st.person) })
            : T.fmt('ui.sheet.post_coming', {
                name: T.personName(st.person),
                time: T.duration(this.split(s, [st.person], post.at).coming[0]?.eta ?? 0),
              })
        : st.demand && st.inHours
          ? T.tr('ui.sheet.post_empty_now')
          : T.tr('ui.sheet.post_empty');
    } else {
      const o = order as Order;
      const st = orderStatus(s, w, o);
      chips = this.orderChips(s, o);
      progress = st.progress;
      status = st.crew.length
        ? this.orderLine(s, o, st.crew, st.progress)
        : st.started
          ? T.fmt('ui.sheet.order_paused', { p: Math.round(st.progress * 100) })
          : T.tr('ui.sheet.order_new');
    }
    const skill: SkillKind = def.skill;
    const people = staffIds(s, w)
      .sort((a, b) => (a === DIRECTOR ? -1 : b === DIRECTOR ? 1 : 0))
      .map((id) => {
        const p = s.people[id];
        const here = p?.job === target;
        const block: AssignBlock = canAssign(s, w, id, target);
        const walk = this.walkMinutes(s, id, def.at);
        // 员工成长（W3）：能力后面带上潜力（"教学 58/73"）
        const cap = growthOf(w) ? `/${Math.round(potentialOf(w, id, skill))}` : '';
        const fit = [
          `${T.tr(`ui.skill.${skill}`)} ${Math.round(workSkill(s, w, id, skill))}${cap}`,
          walk ? T.fmt('ui.sheet.walk', { time: T.duration(walk) }) : T.tr('ui.sheet.here'),
          p?.job && !here ? T.fmt('ui.sheet.leaves', { what: this.targetTitle(p.job) }) : '',
        ]
          .filter(Boolean)
          .join(' · ');
        const coming = here && !working(s, w, id);
        return {
          id,
          ...this.face(id),
          fit: coming
            ? T.fmt('ui.sheet.you_coming', { time: T.duration(this.split(s, [id], def.at).coming[0]?.eta ?? 0) })
            : here && p
              ? T.fmt('ui.sheet.speed', { n: Math.round(speedOf(workSkill(s, w, id, skill)) * 100) })
              : fit,
          ...(here ? { here: true } : {}),
          ...(coming ? { coming: true } : {}),
          ...(block && block !== 'same' ? { disabled: this.why(block, target, s) } : {}),
        };
      });
    return {
      id: target,
      kind: post ? 'post' : 'order',
      title: this.targetTitle(target),
      note: T.tr(`${post ? 'posts' : 'orders'}.${target}.note`, ''),
      status,
      chips,
      ...(progress !== undefined ? { progress } : {}),
      people,
    };
  }

  /**
   * 一个地点此刻在场景里露出来的工作（ADR 0013）：存在的岗位（有人、在时段里、或设施该维护了），看得见的工单。
   * 拿着人的时候，所有存在的岗位都算（好让他能被派去等客人）。
   */
  placeTargets(session: Session, anchor: string): { posts: Post[]; orders: Order[] } {
    const { s } = session;
    const w = worldOf(s, this.content);
    const posts = [...w.posts.values()].filter((p) => {
      if (p.at !== anchor) return false;
      const st = postStatus(s, w, p);
      if (!st.exists) return false;
      const low = !!p.restore && (s.condition[w.facilityAt.get(p.at) ?? ''] ?? 100) < 70;
      const h = minuteOfDay(s.t) / 60;
      const soon = !!p.hours && !st.inHours && p.hours[0] > h && p.hours[0] - h <= 2;
      return !!st.person || (st.demand && st.inHours) || soon || low || !!session.picked || session.place === anchor;
    });
    const orders = [...w.orders.values()].filter((o) => o.at === anchor && orderStatus(s, w, o).visible);
    return { posts, orders };
  }

  /** 地点牌上的内容：要人的岗位一格一格，工单合成一格（ADR 0013） */
  hub(
    session: Session,
    anchor: string,
  ): {
    /** coming：岗位上的人还在路上 */
    posts: {
      initials: string;
      color: string;
      coming: boolean;
      progress: number;
      need: boolean;
      on: boolean;
      soon: boolean;
    }[];
    orders: { n: number; skills: SkillKind[]; progress: number | null; crew: number };
    fit: 'none' | 'fit' | 'nofit';
    /** 这儿的设施状况低于 30 时的值（地点牌上挂红色 !） */
    worn: number | null;
    /** 有人闲着、"下一步"的活就在这儿：工单格亮起来（e7 的轻提示） */
    ready: boolean;
  } | null {
    const { s } = session;
    const w = worldOf(s, this.content);
    const { posts, orders } = this.placeTargets(session, anchor);
    if (!posts.length && !orders.length) return null;
    const pp = posts
      .map((p) => {
        const st = postStatus(s, w, p);
        const face = st.person ? this.face(st.person) : null;
        // 还在路上的人：头像变淡（牌上的颜色带透明度），到了才是实心的
        const coming = !!st.person && !working(s, w, st.person);
        // 两小时内就要开门、还没人管的班：地点牌上提前露出来（第二轮试玩 S8：没人告诉你泳池 11 点要人）
        const h = minuteOfDay(s.t) / 60;
        const owned = Object.values(s.people).some((x) => x.hired && x.routine?.includes(p.id));
        const soon =
          !st.person && !owned && p.hours && !st.inHours && p.hours[0] > h && p.hours[0] - h <= 2 ? p.hours[0] : null;
        return {
          initials: face?.initials ?? (soon !== null ? `${soon}` : '+'),
          color: face ? (coming ? `${face.color}66` : face.color) : '',
          coming,
          progress: st.progress,
          need: st.demand && st.inHours && !st.person,
          on: st.active,
          soon: soon !== null,
          show: !!st.person || (st.demand && st.inHours) || soon !== null,
        };
      })
      // 地点牌只放此刻要紧的岗位格；拿着人时空岗位也露出来（是个落点）
      .filter((p) => p.show || session.picked)
      .map(({ show: _, ...p }) => p);
    let best: number | null = null;
    let crew = 0;
    for (const o of orders) {
      const st = orderStatus(s, w, o);
      if (st.started) best = Math.max(best ?? 0, st.progress);
      // 牌上的工单格只在有人到场开工时亮（路上的人不算）
      crew += st.crew.filter((x) => working(s, w, x)).length;
    }
    const picked = session.picked;
    const fit = !picked
      ? 'none'
      : [...posts, ...orders].some((t) => canAssign(s, w, picked, t.id) === null)
        ? 'fit'
        : 'nofit';
    return {
      posts: pp,
      orders: { n: orders.length, skills: [...new Set(orders.map((o) => o.skill))], progress: best, crew },
      fit,
      worn: this.lowAt(s, anchor),
      // 只亮"下一步"那一处（修复优先、便宜的优先），不把所有能干的活都点亮
      ready: !picked && this.anyIdle(s) && this.readyOrders(s)[0]?.at === anchor,
    };
  }

  /** 这个地点的设施掉过档、正停用着（准则 6）：状态是别的状态的 drops_to，自己不再变旧 */
  wornAt(s: GameState, anchor: string): boolean {
    const w = worldOf(s, this.content);
    const f = w.facilityAt.get(anchor);
    const st = f ? s.facilities[f] : undefined;
    const def = f ? w.facilities.get(f) : undefined;
    if (!def || !st || def.states[st]?.decay_day) return false;
    return Object.values(def.states).some((x) => x.drops_to === st);
  }

  /** 这个地点的设施状况（没有设施、或者设施还废着不会再变旧时为 null：废墟上不挂"快撑不住了"） */
  conditionAt(s: GameState, anchor: string): number | null {
    const w = worldOf(s, this.content);
    const f = w.facilityAt.get(anchor);
    if (!f || !(f in s.facilities)) return null;
    if (!w.facilities.get(f)?.states[s.facilities[f] ?? '']?.decay_day) return null;
    return Math.round(s.condition[f] ?? 100);
  }
  private lowAt(s: GameState, anchor: string): number | null {
    const c = this.conditionAt(s, anchor);
    return c !== null && c < 30 ? c : null;
  }

  /** 拿着这个人落到地点上：能接的活（只有一项就直接派） */
  placeFits(session: Session, anchor: string, person: string): string[] {
    const { s } = session;
    const w = worldOf(s, this.content);
    const { posts, orders } = this.placeTargets(session, anchor);
    return [...posts, ...orders].filter((t) => canAssign(s, w, person, t.id) === null).map((t) => t.id);
  }

  /** 地点清单（ADR 0013）：这个地点的每项工作一行；缺人的、开了工的排前面 */
  placeSheet(session: Session, anchor: string): PlaceSheetData {
    const { s } = session;
    const T = this.text;
    const w = worldOf(s, this.content);
    const { posts, orders } = this.placeTargets(session, anchor);
    const picked = session.picked;
    const fitOf = (id: string, at: string, skill: SkillKind): PlaceRow['fit'] => {
      if (!picked) return undefined;
      const p = s.people[picked];
      const here = p?.job === id;
      const block = canAssign(s, w, picked, id);
      if (here) return { text: T.tr('ui.sheet.here'), here: true };
      if (block && block !== 'same') return { text: this.why(block, id, s), blocked: true };
      const walk = this.walkMinutes(s, picked, at);
      const lv = (k: SkillKind) => (p ? workSkill(s, w, picked, k) : 0);
      const best = lv(skill) >= Math.max(lv('teach'), lv('upkeep'), lv('service'), lv('play'));
      return {
        ...(best ? { best: true } : {}),
        text: [
          `${T.tr(`ui.skill.${skill}`)} ${Math.round(lv(skill))}`,
          walk ? T.fmt('ui.sheet.walk', { time: T.duration(walk) }) : T.tr('ui.sheet.here'),
          p?.job ? T.fmt('ui.sheet.leaves', { what: this.short(p.job) }) : '',
        ]
          .filter(Boolean)
          .join(' · '),
      };
    };
    // 清单一行只放"换来什么、花什么"：能力、时长这些在说明里看
    const income = T.tr('ui.sheet.income');
    const payoff = (cs: Chip[]) =>
      [
        ...cs.filter((c) => c.tone === 'cost'),
        ...cs.filter((c) => c.tone === 'gain' || c.tone === 'loss' || c.tone === 'risk'),
      ]
        .slice(0, 3)
        .map((c) => (c.text === income ? { ...c, text: T.tr('ui.place.income') } : c));
    const cond = this.conditionAt(s, anchor);
    const fac = w.facilityAt.get(anchor);
    const remodel = fac ? s.remodels?.[fac] : undefined;
    const rows: (PlaceRow & { rank: number })[] = [];
    const tours = tournamentStatus(s, w);
    for (const p of posts) {
      const st = postStatus(s, w, p);
      const need = st.demand && st.inHours && !st.person;
      // 这是谁的班（ADR 0014）：空着的时候告诉玩家谁会自己来
      const owner = Object.values(s.people).find((x) => x.hired && x.routine?.includes(p.id))?.id ?? null;
      const line = st.person
        ? st.active
          ? T.fmt('ui.place.on', { name: T.personName(st.person), p: Math.round(st.progress * 100) })
          : working(s, w, st.person)
            ? T.fmt('ui.place.wait', { name: T.personName(st.person) })
            : this.comingLine(this.split(s, [st.person], p.at).coming)
        : owner && p.hours
          ? T.fmt('ui.place.owner', { name: T.personName(owner), hours: `${p.hours[0]}–${p.hours[1]}` })
          : need
            ? T.tr('ui.place.need')
            : p.hours
              ? T.fmt('ui.place.hours', { hours: `${p.hours[0]}–${p.hours[1]}` })
              : T.tr('ui.place.anytime');
      const fit = fitOf(p.id, p.at, p.skill);
      rows.push({
        id: p.id,
        kind: 'post',
        skill: p.skill,
        title: this.short(p.id),
        line,
        // 赛事的临时岗位（W2）：只在比赛日有，标一下"今天"
        ...(w.eventPosts.has(p.id) ? { badge: T.tr('ui.place.badge_temp') } : {}),
        ...(need ? { need: true } : {}),
        ...(st.active ? { progress: st.progress } : {}),
        faces: st.person ? [this.faceAt(s, st.person)] : [],
        chips: payoff(this.postChips(p)),
        ...(fit ? { fit } : {}),
        // 状况低于 30 时维护岗位排到最前（第二轮试玩 S3）
        rank: need ? 0 : p.restore && (cond ?? 100) < 30 && !st.person ? 0.5 : st.person ? 2 : st.inHours ? 3 : 5,
      });
    }
    for (const o of orders) {
      const st = orderStatus(s, w, o);
      const ts = st.tournament ? tours.find((x) => x.id === st.tournament) : undefined;
      const short = st.minCrew > 1 && st.crew.length < st.minCrew;
      const line = st.crew.length
        ? short
          ? `${this.orderLine(s, o, st.crew, st.progress)} · ${T.fmt('ui.place.min_crew', { n: st.crew.length, need: st.minCrew })}`
          : this.orderLine(s, o, st.crew, st.progress)
        : st.started
          ? T.fmt('ui.place.order_paused', { p: Math.round(st.progress * 100) })
          : ts
            ? this.tourLine(s, ts)
            : st.variants && !picked
              ? T.tr('ui.variant.hint')
              : T.fmt('ui.place.order_new', {
                  cost: st.cost ? `$${st.cost} · ` : '',
                  time: T.duration(st.work),
                });
      let fit = fitOf(o.id, o.at, o.skill);
      // 变体工单的标题行也能直接派：写明按哪个变体（玩家最后选的那行，没选过就是第一个）
      if (fit && !fit.blocked && !fit.here && st.variants && !st.locked && st.variant && fac)
        fit = {
          ...fit,
          text: `${T.fmt('ui.place.sends_variant', { variant: this.variantName(fac, st.variant) })} · ${fit.text}`,
        };
      const variants = st.variants ? this.variantRows(session, o) : null;
      rows.push({
        id: o.id,
        kind: 'order',
        skill: o.skill,
        title: this.targetTitle(o.id),
        line,
        ...(ts ? { badge: T.tr(ts.kind === 'host' ? 'ui.place.badge_host' : 'ui.place.badge_away') } : {}),
        ...(st.started ? { progress: st.progress } : {}),
        faces: st.crew.map((x) => this.faceAt(s, x)),
        // 变体工单：换来、付出写在每一个变体行上，工单这一行不再重复
        ...(variants ? { variants } : { chips: payoff(this.orderChips(s, o)) }),
        ...(fit ? { fit } : {}),
        rank: st.crew.length ? 1 : st.started ? 1.5 : 4,
      });
    }
    // 还没开出来的工单（ADR 0015）：告诉玩家修好什么就能开出它，排在最后
    for (const o of w.orders.values()) {
      if (o.at !== anchor || orderStatus(s, w, o).visible) continue;
      if (o.once && (s.orderLog.done[o.id] ?? 0) > 0) continue;
      if ((s.orderLog.cooldowns[o.id] ?? -1) > s.t) continue;
      // 已经装上的升级、和现在的变体对不上的升级、已经改成的样子：不是"还没开出来"，不再挂一行（改造期满后也按新变体重看）
      if (fac && o.upgrade) {
        if (s.upgrades?.[fac]?.includes(o.upgrade)) continue;
        const only = w.facilities.get(fac)?.upgrades?.[o.upgrade]?.variant;
        if (only && s.variants?.[fac] && s.variants[fac] !== only) continue;
      }
      if (fac && o.remodel && s.variants?.[fac] === o.remodel) continue;
      const how = T.tr(`orders.${o.id}.locked`, '');
      if (!how) continue;
      rows.push({
        id: o.id,
        kind: 'order',
        skill: o.skill,
        title: this.targetTitle(o.id),
        line: how,
        faces: [],
        locked: true,
        rank: 9,
      });
    }
    // 下雨关掉的户外岗位：留一行说明，免得拖过去没反应还不知道为什么（第二轮试玩 S11）
    if (s.weather === 'rain')
      for (const p of w.posts.values()) {
        if (p.at !== anchor || postExists(s, w, p) || !postExists({ ...s, weather: 'sun' }, w, p)) continue;
        rows.push({
          id: p.id,
          kind: 'post',
          skill: p.skill,
          title: this.short(p.id),
          line: T.tr('ui.place.rain'),
          faces: [],
          locked: true,
          rank: 8,
        });
      }
    // 比赛日占了场的岗位：留一行说明（和下雨一样）
    for (const p of w.posts.values()) {
      if (p.at !== anchor || !w.closedBy.get(p.id)?.some((t) => this.eventToday(s, t.id))) continue;
      rows.push({
        id: p.id,
        kind: 'post',
        skill: p.skill,
        title: this.short(p.id),
        line: T.tr('ui.place.event_closed'),
        faces: [],
        locked: true,
        rank: 8,
      });
    }
    rows.sort((a, b) => a.rank - b.rank || (a.fit?.blocked ? 1 : 0) - (b.fit?.blocked ? 1 : 0));
    const event = this.eventPanel(s, anchor, tours);
    const prep = this.prepPanel(s, anchor);
    return {
      id: anchor,
      title: T.anchor(anchor),
      ...(remodel && fac
        ? {
            condition: {
              value: 0,
              label: T.fmt('ui.place.remodel', {
                variant: this.variantName(fac, remodel.variant),
                time: T.duration(remodel.until - s.t),
              }),
            },
          }
        : cond !== null
          ? {
              condition: {
                value: cond,
                label: T.fmt(cond < 30 ? 'ui.place.condition_low' : 'ui.place.condition', {
                  n: cond,
                  limit: w.act.rules.grade_drop_below,
                }),
              },
            }
          : this.wornAt(s, anchor)
            ? { condition: { value: 0, label: T.tr('ui.place.worn') } }
            : {}),
      ...(picked ? { prompt: T.fmt('ui.place.pick', { name: T.personName(picked), place: T.anchor(anchor) }) } : {}),
      ...(event ? { event } : {}),
      ...(prep ? { prep } : {}),
      rows: rows.map(({ rank: _, ...r }) => r),
      empty: T.tr('ui.place.empty'),
    };
  }

  /** 接下的主办赛事今天是不是比赛日（closes 里的岗位整天不开） */
  private eventToday(s: GameState, id: string): boolean {
    const run = s.events?.[id];
    if (!run || s.t >= run.end) return false;
    return !!currentEdition(worldOf(s, this.content), id, s.t)?.days.includes(dayOf(s.t));
  }

  /** 报名工单还没开工时的一行：什么时候开赛 / 出发、报名费多少 */
  private tourLine(s: GameState, ts: TournamentStatus): string {
    const T = this.text;
    const when = this.when(s, ts.start);
    if (ts.kind === 'host') return T.fmt('ui.place.tour_host', { when, fee: ts.fee });
    return T.fmt(s.t < ts.start ? 'ui.place.tour_away_early' : 'ui.place.tour_away_now', { when, fee: ts.fee });
  }

  /**
   * 地点清单顶上的赛事格（W2）：这儿接下了一期主办赛事，写开赛 / 收赛时间和附加目标此刻的进度。
   * 进度按结算时的同一套 event.* 变量现算（模拟里这些变量只在结算时有值）。
   */
  private eventPanel(s: GameState, anchor: string, tours: readonly TournamentStatus[]): PlaceSheetData['event'] {
    const T = this.text;
    const w = worldOf(s, this.content);
    const ts = tours.find((x) => x.at === anchor && x.entered && s.events?.[x.id]);
    const t = ts ? w.tournaments.get(ts.id) : undefined;
    const run = ts ? s.events?.[ts.id] : undefined;
    if (!ts || !t || !run) return undefined;
    const vars = {
      'event.service_rate': run.demand > 0 ? run.served / run.demand : 0,
      'event.staffed': run.need > 0 ? run.staffed / run.need : t.posts.length ? 0 : 1,
      'event.skill': run.skill,
      'event.crew': run.crew.length,
      'event.repeat': ts.repeat,
    };
    const started = s.t >= ts.start;
    const goals = goalsFor(t, ts.repeat).map((g) => {
      let met = false;
      let value: string | undefined;
      try {
        if (g.if) {
          met = started && num(s, w, g.if, vars) > 0;
          const m = /^\s*([\w.]+)\s*(>=|>)\s*([\d.]+)\s*$/.exec(g.if);
          if (m && started) {
            const v = num(s, w, m[1] as string, vars);
            const need = Number(m[3]);
            const rate = (m[1] as string).endsWith('_rate') || m[1] === 'event.staffed';
            value = rate ? `${Math.round(v * 100)}%/${Math.round(need * 100)}%` : `${Math.round(v)}/${need}`;
          }
        } else if (g.chance !== undefined) {
          const p = Math.max(0, Math.min(1, num(s, w, g.chance, vars)));
          value = T.fmt('ui.chip.chance', { p: Math.round(p * 100) });
        }
      } catch {
        // 表达式读不出来就只写目标本身
      }
      return { id: g.id, text: T.tr(`tournaments.${t.id}.goals.${g.id}`, g.id), met, ...(value ? { value } : {}) };
    });
    const again = ts.repeat > 0 ? ` · ${T.fmt('ui.wire.tour_again', { n: ts.repeat + 1, k: ts.scale })}` : '';
    return {
      title: this.tourTitle(s, ts.id),
      line:
        (started
          ? T.fmt('ui.place.event_live', { when: this.when(s, ts.end) })
          : T.fmt('ui.place.event_soon', { when: this.when(s, ts.start) })) + again,
      goals,
    };
  }

  /** 分期筹备（W2，表演赛四期）：这儿挂着的那一组每一期的花费、做完没有；一期都还没挂出来（★3 以前）就不显示 */
  private prepPanel(s: GameState, anchor: string): PlaceSheetData['prep'] {
    const T = this.text;
    const w = worldOf(s, this.content);
    for (const [group, ids] of w.prep) {
      const orders = ids.map((id) => w.orders.get(id)).filter((o): o is Order => !!o && o.at === anchor);
      if (!orders.length) continue;
      const st = prepStatus(s, w, group);
      if (!st.done && !orders.some((o) => orderStatus(s, w, o).visible)) continue;
      return {
        title: T.fmt('ui.place.prep_title', { group: T.tr(`prep.${group}`, group), done: st.done, total: st.total }),
        phases: st.phases.map((x) => ({ id: x.order, name: this.short(x.order), cost: `$${x.cost}`, done: x.done })),
        foot:
          st.done >= st.total
            ? T.tr('ui.place.prep_all')
            : T.fmt('ui.place.prep_left', { n: st.total - st.done, cost: st.costLeft }),
      };
    }
    return undefined;
  }

  /**
   * 修复变体的一行一个（UI-11）：名字、取舍一句话、换来（修好以后那一档的数值，各变体不一样的才写）、付出（材料费、工时）。
   * 锁定以后只留锁定的那一行。拿着人时每一行写这个人按这个变体去会怎样。
   */
  private variantRows(session: Session, o: Order): VariantRow[] {
    const { s } = session;
    const T = this.text;
    const w = worldOf(s, this.content);
    const st = orderStatus(s, w, o);
    const f = w.facilityAt.get(o.at) ?? '';
    const def = w.facilities.get(f);
    const all = st.variants ?? [];
    const ids = st.locked && st.variant ? [st.variant] : all;
    // 修好以后到哪一档：工单效果里给这处设施设的状态
    let to: string | undefined;
    for (const e of o.effects) if ('facility' in e && 'set' in e && e.facility === f) to = String(e.set);
    const base = to ? def?.states[to] : undefined;
    const look = (v: string) => (base && to ? { ...base, ...(def?.variants?.[v]?.states?.[to] ?? {}) } : null);
    const FIELDS = [
      ['courts', 'ui.variant.courts', 1],
      ['quality', 'ui.variant.quality', 1],
      ['income_week', 'ui.variant.income', 1],
      ['upkeep_week', 'ui.variant.upkeep', -1],
      ['decay_day', 'ui.variant.decay', -1],
    ] as const;
    const picked = session.picked;
    return ids.map((v) => {
      const [name, line0] = T.tr(`variants.${f}.${v}`, v).split(' · ');
      const when = o.variants?.[v]?.when;
      const shut = !!st.openVariants && !st.openVariants.includes(v);
      const line =
        shut && when && 'route' in when
          ? T.fmt('ui.variant.route', { route: this.routeName(when.route, when.is) })
          : shut
            ? T.tr('ui.variant.closed')
            : line0;
      // 换来、付出（内容文案 variant_notes.<设施>.<变体>.gives / costs）；没写就按数值自动出标签
      const gives = T.tr(`variant_notes.${f}.${v}.gives`, '');
      const costs = T.tr(`variant_notes.${f}.${v}.costs`, '');
      const chips: Chip[] = [];
      const cost = orderCost(s, o, v);
      if (cost && !st.started) chips.push({ text: T.fmt('ui.chip.cost', { n: cost }), tone: 'cost' });
      const work = orderWork(s, o, v);
      if (all.some((x) => orderWork(s, o, x) !== work)) chips.push({ text: T.duration(work), tone: 'time' });
      const me = look(v);
      if (me && !gives && !costs)
        for (const [k, key, dir] of FIELDS) {
          const vals = all.map((x) => Number(look(x)?.[k] ?? 0));
          const n = Number(me[k] ?? 0);
          if (vals.every((x) => x === n)) continue;
          const best = dir > 0 ? Math.max(...vals) : Math.min(...vals);
          chips.push({ text: T.fmt(key, { n }), tone: n === best ? 'gain' : 'loss' });
        }
      if (me && !gives && !costs && all.some((x) => !!look(x)?.rain_ok !== !!me.rain_ok))
        chips.push({
          text: T.tr(me.rain_ok ? 'ui.variant.rain_ok' : 'ui.variant.rain_no'),
          tone: me.rain_ok ? 'gain' : 'loss',
        });
      if (!gives && !costs) chips.push(...effectChips(T, o.variants?.[v]?.effects ?? []));
      let fit: VariantRow['fit'];
      if (picked) {
        const block = canAssign(s, w, picked, o.id, v);
        if (block && block !== 'same')
          fit = { text: block === 'variant' && shut && line ? line : this.why(block, o.id, s), blocked: true };
        else {
          const walk = this.walkMinutes(s, picked, o.at);
          fit = {
            text: [
              `${T.tr(`ui.skill.${o.skill}`)} ${Math.round(workSkill(s, w, picked, o.skill))}`,
              walk ? T.fmt('ui.sheet.walk', { time: T.duration(walk) }) : T.tr('ui.sheet.here'),
            ].join(' · '),
          };
        }
      }
      const pv = session.preview;
      return {
        id: v,
        name: name ?? v,
        ...(st.locked ? { line: T.tr('ui.variant.locked') } : line ? { line } : {}),
        ...(gives ? { gives } : {}),
        ...(costs ? { costs } : {}),
        chips,
        ...(st.locked ? { locked: true } : s.picks?.[o.id] === v ? { picked: true } : {}),
        ...(pv?.order === o.id && pv.variant === v ? { previewing: true } : {}),
        ...(fit ? { fit } : {}),
      };
    });
  }

  /** 选项里的选路效果（W2：{ route: s2, set: youth }）：这一项选的是哪一处的哪条路 */
  routeOf(card: string, key: string): { slot: string; route: string } | null {
    const c = this.content.cards.find((x) => x.id === card);
    const opt = c?.options[key as 'A' | 'B' | 'C'];
    for (const e of opt?.effects ?? []) if ('route' in e && 'set' in e) return { slot: e.route, route: String(e.set) };
    return null;
  }

  /** 路的名字（文案 routes.<处>.<路>，" · " 后面是一句话说明） */
  routeName(slot: string, route: string): string {
    return this.text.tr(`routes.${slot}.${route}`, route).split(' · ')[0] ?? route;
  }

  /**
   * 按这条路先开的变体：修复工单的变体 when、改造工单自己的 when 里提到了 { route: 处, is: 路 }（可以套在 any / all 里）。
   * 返回 [设施, 变体]。
   */
  routeVariants(s: GameState, slot: string, route: string): [string, string][] {
    const w = worldOf(s, this.content);
    const names = (c: unknown): boolean => {
      if (!c || typeof c !== 'object') return false;
      const o = c as Record<string, unknown>;
      if (o.route === slot && o.is === route) return true;
      for (const k of ['all', 'any'] as const) if (Array.isArray(o[k]) && (o[k] as unknown[]).some(names)) return true;
      return false;
    };
    const out: [string, string][] = [];
    const add = (f: string | undefined, v: string) => {
      if (f && !out.some(([a, b]) => a === f && b === v)) out.push([f, v]);
    };
    for (const o of w.orders.values()) {
      const f = w.facilityAt.get(o.at);
      for (const [v, def] of Object.entries(o.variants ?? {})) if (names(def?.when)) add(f, v);
      if (o.remodel && names(o.when)) add(f, o.remodel);
    }
    return out;
  }

  /**
   * 选路卡的一项（W2）：路名、开出什么、付出什么（内容 route_notes.<处>.<路>.opens / costs，没写就按"先开哪些变体"自动说），
   * 点一下镜头先转过去、叠上预览，再点一下才定（main.ts）。
   */
  private routeAnswer(
    session: Session,
    uid: number,
    key: string,
    rt: { slot: string; route: string },
    n: 1 | 2 | 3,
    blocked: boolean,
  ): CardAnswer {
    const T = this.text;
    const sep = T.lang === 'zh' ? '、' : ', ';
    const routes = worldOf(session.s, this.content).act.routes?.[rt.slot] ?? [];
    const others = routes.filter((r) => r !== rt.route);
    const list = (r: string) =>
      this.routeVariants(session.s, rt.slot, r)
        .map(([f, v]) => this.variantName(f, v))
        .join(sep);
    const [, about] = T.tr(`routes.${rt.slot}.${rt.route}`, '').split(' · ');
    const mine = list(rt.route);
    const theirs = others.map(list).filter(Boolean).join(sep);
    // 选项文案"路名：开出什么……"冒号后面就是这条路开出什么
    const full = T.option(this.cardOf(uid, session) ?? '', key);
    const m = /^[^：:]+[：:]\s*(.+)$/.exec(full);
    const opens =
      T.tr(`route_notes.${rt.slot}.${rt.route}.opens`, '') ||
      m?.[1] ||
      (mine ? T.fmt('ui.route.opens', { list: mine }) : (about ?? ''));
    const costs =
      T.tr(`route_notes.${rt.slot}.${rt.route}.costs`, '') ||
      (theirs
        ? T.fmt('ui.route.costs', { list: theirs })
        : others.length
          ? T.fmt('ui.route.other', { route: others.map((r) => this.routeName(rt.slot, r)).join(sep) })
          : '');
    const on = session.routePick?.uid === uid && session.routePick.option === key;
    // 选项里别的效果（测量费、会员、声望）照常出标签
    const s = session.s;
    const w = worldOf(s, this.content);
    const opt = this.content.cards.find((x) => x.id === this.cardOf(uid, session))?.options[key as 'A' | 'B' | 'C'];
    const chips = effectChips(
      T,
      (opt?.effects ?? []).filter((e) => !e.if || testCond(s, w, e.if)),
      1,
      this.content.people,
      this.content.orders,
    );
    return {
      key: n,
      text: this.routeName(rt.slot, rt.route),
      ...(opens ? { opens } : {}),
      ...(costs ? { costs } : {}),
      ...(chips.length ? { chips } : {}),
      ...(on ? { previewing: true } : {}),
      hint: T.tr(
        blocked
          ? 'ui.hint.requires'
          : on
            ? 'ui.route.confirm'
            : this.canShow(this.routeTarget(session.s, rt).anchor ?? '')
              ? 'ui.route.look'
              : 'ui.route.pick',
      ),
      ...(blocked ? { disabled: true } : {}),
    };
  }

  private cardOf(uid: number, session: Session): string | undefined {
    return session.s.cards.open.find((x) => x.uid === uid)?.card;
  }

  /**
   * 选路卡上点过的那一项该把镜头转到哪儿、叠什么预览：★2 的路是先开的第一个变体（设施预览）；
   * ★3、★4 的路是新地块（W5 的 landPreview；新锚点和路同名，W5 以前没有）。
   */
  routeFocus(session: Session): {
    key: string;
    anchor: string | null;
    facility: string | null;
    variant: string;
    slot: string;
  } | null {
    const p = session.routePick;
    if (!p) return null;
    const o = Projector.focusCard(session.s, this.content);
    if (!o || o.uid !== p.uid) return null;
    const rt = this.routeOf(o.card, p.option);
    if (!rt) return null;
    return { key: `${p.uid}:${p.option}`, ...this.routeTarget(session.s, rt), slot: rt.slot };
  }

  /** 一条路落在哪儿：先开的第一个变体所在的设施；没有变体的路（★3、★4）是和路同名的新锚点（W5） */
  private routeTarget(
    s: GameState,
    rt: { slot: string; route: string },
  ): { anchor: string | null; facility: string | null; variant: string } {
    const w = worldOf(s, this.content);
    const [first] = this.routeVariants(s, rt.slot, rt.route);
    if (first) return { anchor: w.facilities.get(first[0])?.anchor ?? null, facility: first[0], variant: first[1] };
    return { anchor: rt.route, facility: null, variant: rt.route };
  }

  /** 镜头能不能转到这个锚点（地图有它的坐标；main.ts 设）：转不过去时选路卡的提示不说"看看在哪儿" */
  canShow: (anchor: string) => boolean = () => true;

  /** 岗位名去掉地点前缀（"1 号场 · 青少年课" → "青少年课"）：清单的标题已经是地点了 */
  private short(id: string): string {
    const t = this.targetTitle(id);
    return t.includes(' · ') ? (t.split(' · ').slice(1).join(' · ') as string) : t;
  }

  /** 记分牌下面一行：有客人却没人管的岗位有几个（最要紧的提醒） */
  private status(session: Session): string | null {
    const { s } = session;
    const T = this.text;
    const w = worldOf(s, this.content);
    let empty = 0;
    let busy = 0;
    for (const post of w.posts.values()) {
      const st = postStatus(s, w, post);
      if (st.exists && st.demand && st.inHours) {
        busy++;
        if (!st.person) empty++;
      }
    }
    // 没有岗位在时段里时不说"都有人"（第二轮试玩 S12：服务率 17% 时还写着"都有人"）
    return empty ? T.fmt('ui.status.empty', { n: empty }) : T.tr(busy ? 'ui.status.covered' : 'ui.status.quiet');
  }

  private card(session: Session): EventCardData | null {
    const { s } = session;
    const T = this.text;
    if (s.outcome) {
      const o = s.outcome;
      // 结局方案 A（W4）：结算打分的结局卡
      const es = o.result === 'settled' ? endingStatus(s, worldOf(s, this.content)) : null;
      if (es?.settlement) return this.endingCard(session, es);
      return {
        id: `end-${o.ending}`,
        kind: 'news',
        topic: T.tr(o.result === 'won' ? 'ui.end.won' : 'ui.end.lost'),
        location: T.tr('ui.club.name'),
        headline: T.tr(`endings.${o.ending}.title`),
        body: T.tr(`endings.${o.ending}.body`),
        action: { id: 'replay', label: T.tr('ui.end.again') },
      };
    }
    const o = Projector.focusCard(s, this.content);
    if (!o) return null;
    const w = worldOf(s, this.content);
    const c = w.cards.get(o.card);
    if (!c) return null;
    const statuses = optionStatus(s, w, o.uid);
    const routeCard = statuses.some((st) => this.routeOf(o.card, st.key));
    // 表演赛提前办成的结局卡（W4）：每个选项讲清是"马上结算（+提前奖励）"还是"接着经营到第 112 天"
    const es = endingStatus(s, w);
    const endCard = es?.deciding && w.act.ending?.card === o.card ? es : null;
    const answers: CardAnswer[] = statuses.slice(0, 3).map((st, i) => {
      const opt = c.options[st.key];
      const rt = this.routeOf(o.card, st.key);
      if (rt) return this.routeAnswer(session, o.uid, st.key, rt, KEYS[i] ?? 1, !!st.blocked);
      const chips: Chip[] = [];
      if (st.cost) chips.push({ text: T.fmt('ui.chip.cost', { n: st.cost }), tone: 'cost' });
      // 要总监亲自去办：他放下手上的岗位，走过去待一段时间（代价是总监的工时）
      if (st.errand)
        chips.push({
          text: T.fmt('ui.chip.errand', {
            name: T.personName(DIRECTOR),
            time: T.duration(this.walkMinutes(s, DIRECTOR, st.errand.at) + st.errand.minutes),
          }),
          tone: 'time',
        });
      if (opt && endCard) chips.push(...this.endingChips(endCard, opt.effects));
      if (opt) {
        // 只讲此刻会生效的效果（带 if 的效果按现在的状态筛一遍，例如 Dale 只会接下一件修复）
        const live = (effs: readonly Effect[]) => effs.filter((e) => !e.if || testCond(s, w, e.if));
        const { people, orders } = this.content;
        chips.push(...effectChips(T, live(opt.effects), 1, people, orders));
        chips.push(...this.flagChips(s, opt.effects, 1));
        if (st.chance !== null) {
          chips.push({ text: T.fmt('ui.chip.chance', { p: Math.round(st.chance * 100) }), tone: 'risk' });
          chips.push(
            ...effectChips(T, live(opt.onSuccess), st.chance, people, orders),
            ...this.flagChips(s, opt.onSuccess, st.chance),
          );
          // 没成会怎样也要写出来（第二轮试玩 S6：抗议失败扣声望，卡上没提示）
          chips.push(
            ...effectChips(T, live(opt.onFail), 1 - st.chance, people, orders),
            ...this.flagChips(s, opt.onFail, 1 - st.chance),
          );
        }
      }
      const then = opt ? thenLine(T, [...opt.effects, ...opt.onSuccess]) : undefined;
      const hints: string[] = [];
      if (st.errand) {
        const job = s.people[DIRECTOR]?.job;
        if (job) hints.push(T.fmt('ui.hint.leaves', { what: this.targetTitle(job) }));
      }
      if (st.blocked === 'busy') hints.push(T.tr('ui.hint.busy'));
      if (st.blocked === 'requires') hints.push(T.tr('ui.hint.requires'));
      if (st.blocked === 'cost') hints.push(T.tr('ui.hint.cash'));
      // 招聘选项：这个人的一句话背景（docs/design/people.md）
      const bios = (opt?.effects ?? []).map((e) => ('hire' in e ? T.tr(`bios.${e.hire}`, '') : ''));
      hints.push(...bios.filter(Boolean));
      // 代价和收益由标签讲，选项文字只留"做什么"（去掉文案里 " · " 后面手写的代价）
      // 招聘选项留下人物的一句介绍（"维护好手"），周薪由标签讲
      const full = T.option(o.card, st.key);
      const hires = !!opt?.effects.some((e) => 'hire' in e);
      // 员工成长（W3）：招聘选项多一行"潜力"
      const potential = (opt?.effects ?? [])
        .map((e) => ('hire' in e ? this.potentialLine(s, e.hire) : null))
        .find((x): x is string => !!x);
      const text = hires ? full.replace(/[，,]\s*(每周|\$|per week|\/week).*$/i, '') : (full.split(' · ')[0] ?? '');
      return {
        key: KEYS[i] ?? 1,
        text,
        ...(potential ? { potential } : {}),
        ...(chips.length ? { chips } : {}),
        ...(then ? { then } : {}),
        ...(st.blocked ? { disabled: true } : {}),
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
    // 选路卡：倒计时到了由谁来定、定哪条（默认是路 A）
    const def = c.default?.then ? this.routeOf(o.card, c.default.then) : null;
    if (routeCard && def)
      card.note = T.fmt('ui.route.default', {
        name: c.who ? this.who(c.who).name : T.personName('dale'),
        route: this.routeName(def.slot, def.route),
      });
    // 点过一项：卡收起来，让出上面的画面看这条路落在哪儿
    if (routeCard && session.routePick?.uid === o.uid) card.compact = true;
    if (o.expires !== null) {
      const total = Math.max(1, o.expires - o.opened);
      const left = Math.max(0, o.expires - session.time);
      card.countdown = { ratio: left / total, label: T.fmt('ui.left', { time: T.duration(left) }) };
    }
    return card;
  }

  /**
   * 招聘卡上候选人的"潜力"（W3）：最能长的两项，"教学 58 → 73"。成长关着时没有。
   * 按潜力从高到低挑（一样高时先看能长多少），已经到顶的不写。
   */
  private potentialLine(s: GameState, id: string): string | null {
    const w = worldOf(s, this.content);
    if (!growthOf(w)) return null;
    const d = this.content.people.find((x) => x.id === id);
    if (!d) return null;
    const T = this.text;
    const keys: SkillKind[] =
      d.kind === 'player' ? ['teach', 'upkeep', 'service', 'play'] : ['teach', 'upkeep', 'service'];
    const rows = keys
      .map((k) => ({ k, from: Math.round(k === 'teach' ? d.skill : d[k]), to: Math.round(potentialOf(w, id, k)) }))
      .filter((x) => x.to > x.from)
      .sort((a, b) => b.to - a.to || b.to - b.from - (a.to - a.from))
      .slice(0, 2);
    if (!rows.length) return null;
    const list = rows.map((x) => T.fmt('ui.grow.pair', { skill: T.tr(`ui.skill.${x.k}`), from: x.from, to: x.to }));
    return T.fmt('ui.grow.potential', { list: list.join(' · ') });
  }

  /** 结局卡（W4）的选项标签：马上结算拿多少提前奖励、现在结算是几分；接着经营到第几天、要担什么 */
  private endingChips(es: EndingStatus, effs: readonly Effect[]): Chip[] {
    const T = this.text;
    const day = es.deadline?.day ?? 112;
    if (effs.some((e) => 'settle' in e)) {
      // 现在的预估里 early 已经按今天算了提前天数（ending.days_early）
      const early = es.preview.items.find((x) => x.id === 'early')?.points ?? 0;
      return [
        { text: T.fmt('ui.ending.settle_now', { n: Math.round(early) }), tone: 'gain' },
        { text: T.fmt('ui.ending.settle_score', { total: es.preview.total, grade: es.preview.grade }), tone: 'info' },
      ];
    }
    return [
      { text: T.fmt('ui.ending.keep', { day }), tone: 'time' },
      { text: T.tr('ui.ending.keep_risk'), tone: 'risk' },
    ];
  }

  /** 结算打分的结局卡（W4，UI-10）：分项、总分、评语；"开第二季 / 看总结" */
  private endingCard(session: Session, es: EndingStatus): EventCardData {
    const { s } = session;
    const T = this.text;
    const st = es.settlement as NonNullable<EndingStatus['settlement']>;
    const summary = session.endView === 'summary';
    const actions: { label: string; id: string }[] = [];
    if (es.canStartSeason2) actions.push({ id: 'season2', label: T.tr('ui.ending.season2') });
    actions.push(
      summary ? { id: 'score', label: T.tr('ui.ending.score') } : { id: 'summary', label: T.tr('ui.ending.summary') },
    );
    const body = T.tr('endings.score.body', '');
    return {
      id: 'end-score',
      kind: 'news',
      topic: T.tr('ui.ending.topic'),
      location: T.tr('ui.club.name'),
      headline: T.tr('endings.score.title', T.tr('ui.ending.title')),
      ...(summary || !body ? {} : { body }),
      ...(summary ? { recap: this.recap(s, st) } : { score: this.scoreCard(st) }),
      actions,
    };
  }

  /** 分项打分：每项"多少 × 每个几分"和得分；钱按 $ 写 */
  scoreCard(st: NonNullable<EndingStatus['settlement']>): ScoreCard {
    const T = this.text;
    const n = (v: number) => (Math.round(v * 10) / 10).toLocaleString(T.lang === 'zh' ? 'zh-CN' : 'en-US');
    const signed = (v: number) => (v < 0 ? `−${n(-v)}` : n(v));
    const early = st.items.find((x) => x.id === 'early');
    const days = early && early.points > 0 ? Math.round(early.points / (early.per || 1)) : 0;
    const gradeName = T.tr(`ending.grades.${st.grade}`, '');
    return {
      rows: st.items.map((x) => ({
        id: x.id,
        label: T.tr(`ending.items.${x.id}`, T.tr(`ui.ending.item.${x.id}`, x.id)),
        detail: T.fmt('ui.ending.detail', {
          value: x.id === 'cash' ? `${x.value < 0 ? '−' : ''}$${n(Math.abs(x.value))}` : signed(x.value),
          per: n(x.per),
        }),
        points: signed(x.points),
        ...(x.points < 0 ? { negative: true } : {}),
      })),
      total: signed(st.total),
      totalLabel: T.tr('ui.ending.total'),
      grade: st.grade,
      ...(gradeName ? { gradeName } : {}),
      verdict: T.tr(`ui.ending.verdict.${st.grade}`, gradeName),
      line:
        st.reason === 'early' && days > 0
          ? T.fmt('ui.ending.line_early', { day: st.day, n: days })
          : T.fmt('ui.ending.line_deadline', { day: st.day }),
    };
  }

  /**
   * "看总结"：第一季的大事，按时间排（只读，全部来自因果日志和结局状态）。
   * 升星（第几天）、选的路、修复选的变体、赛事拿的奖杯、成长解锁、表演赛、结算。
   */
  recap(s: GameState, st: NonNullable<EndingStatus['settlement']>): RecapData {
    const T = this.text;
    const sep = T.lang === 'zh' ? '、' : ', ';
    const rows: { t: number; id: string; text: string }[] = [];
    const add = (e: CausalEntry, i: number, text: string) => rows.push({ t: e.t, id: `${e.id}-${i}`, text });
    for (const e of s.log) {
      if (e.t > st.t) continue;
      const c = e.cause;
      if (c.kind === 'star') add(e, 0, T.fmt('ui.ending.recap.star', { n: c.stars }));
      if (c.kind === 'unlock')
        add(
          e,
          0,
          T.fmt('ui.ending.recap.unlock', {
            what: T.tr(`unlocks.${c.key}`, c.key),
            names: (c.people.length ? c.people : [c.person]).map((x) => T.personName(x)).join(sep),
          }),
        );
      e.effects.forEach((x, i) => {
        if (x.kind === 'route')
          add(
            e,
            i + 1,
            T.fmt('ui.ending.recap.route', {
              route: T.tr(`routes.${x.slot}.${x.route}`, x.route).split(' · ')[0] ?? x.route,
            }),
          );
        else if (x.kind === 'variant')
          add(
            e,
            i + 1,
            T.fmt('ui.ending.recap.variant', {
              place: T.tr(`ui.fac.${x.facility}`, x.facility),
              variant: this.variantName(x.facility, x.variant),
            }),
          );
        else if (x.kind === 'trophy' && x.delta > 0 && c.kind === 'tournament')
          add(
            e,
            i + 1,
            T.fmt('ui.ending.recap.trophy', { title: T.tr(`tournaments.${c.tournament}.title`, c.tournament) }),
          );
      });
    }
    const ex = s.ending?.exhibition;
    if (ex !== null && ex !== undefined && ex <= st.t)
      rows.push({ t: ex, id: 'exhibition', text: T.tr('ui.ending.recap.exhibition') });
    // 稳定排序：同一时刻按日志顺序
    rows.sort((a, b) => a.t - b.t);
    const lines: RecapData['lines'] = rows.map((r) => ({ id: r.id, when: T.day(r.t), text: r.text }));
    lines.push({
      id: 'settled',
      when: T.day(st.t),
      text: T.fmt('ui.ending.recap.settled', { total: st.total, grade: st.grade }),
    });
    return { title: T.tr('ui.ending.recap_title'), lines, empty: T.tr('ui.ending.recap_empty') };
  }
}

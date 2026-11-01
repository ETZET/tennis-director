import {
  type AssignBlock,
  at,
  type CausalEntry,
  type ContentBundle,
  canAssign,
  DIRECTOR,
  facilityTotals,
  type GameState,
  minutes,
  type OpenCard,
  type Order,
  optionStatus,
  orderStatus,
  type Post,
  postStatus,
  type SimEvent,
  type SkillKind,
  serviceRate,
  shortestRoute,
  skillOf,
  speedOf,
  staffIds,
  wagesWeek,
  working,
  worldOf,
} from '@td/sim';
import {
  type CardAnswer,
  type Chip,
  type EventCardData,
  grade,
  type HudSnapshot,
  type SeasonInfo,
  type StaffToken,
  type StatRow,
  type StoryItem,
  type TargetSheetData,
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
      } else if (e.type === 'postInterrupted') {
        // 拉走持续岗位的代价要让玩家看见
        this.push(
          s.t,
          T.fmt('ui.wire.interrupted', { name: T.personName(e.person), post: T.tr(`posts.${e.post}.title`) }),
          true,
        );
      } else if (e.type === 'weekSettled') {
        this.push(s.t, T.fmt('ui.wire.week', { n: Math.round(e.serviceRate * 100) }), e.serviceRate < 0.5);
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

  /** 某人走到某处还要几分钟（正在路上就从这一段的终点算起） */
  walkMinutes(s: GameState, person: string, to: string): number {
    const w = worldOf(s, this.content);
    const p = s.people[person];
    if (!p) return 0;
    const from = p.walk ? p.walk.to : p.at;
    const rest = p.walk ? p.walk.end - s.t : 0;
    return Math.round(rest + (shortestRoute(w, from, to)?.minutes ?? 0));
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
        label: T.tr('stats.service'),
        value: `${Math.round(serviceRate(s) * 100)}%`,
        ...(serviceRate(s) < 0.5 ? { tone: 'bad' as const } : {}),
      },
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
          const c = Math.round(s.condition[id] ?? 100);
          return {
            label: name ?? id,
            value: `${state ?? st} · ${c}`,
            ...(c < 30 ? { tone: 'bad' as const } : {}),
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
      hint: session.picked ? T.fmt('ui.staff.hint', { name: T.personName(session.picked) }) : null,
      sheet: session.sheet ? this.sheet(session, session.sheet) : null,
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
        text: T.fmt('ui.ctx.service', { n: Math.round(serviceRate(s) * 100) }),
        tone: serviceRate(s) < 0.5 ? 'loss' : 'info',
      },
    ];
  }

  /** 季节、天气、本周服务率 */
  private season(s: GameState): SeasonInfo {
    const T = this.text;
    const week = Math.floor(Math.floor(s.t / 1440) / 7) + 1;
    const service = Math.round(serviceRate(s) * 100);
    return {
      label: `${T.tr(`seasons.${s.season}`, '')} · ${T.fmt('ui.week', { n: week })}`,
      weather: s.weather,
      weatherLabel: T.tr(`ui.weather.${s.weather}`),
      service,
      serviceLabel: T.fmt('ui.ctx.service', { n: service }),
    };
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
    if (!p.job) return { text: T.fmt('ui.staff.idle', { place: T.anchor(p.at) }), state: 'idle' };
    const post = w.posts.get(p.job);
    if (post) {
      const st = postStatus(s, w, post);
      return st.active
        ? { text: this.targetTitle(p.job), state: 'working' }
        : { text: T.fmt('ui.staff.waiting', { what: this.targetTitle(p.job) }), state: 'waiting' };
    }
    const order = w.orders.get(p.job);
    if (order) {
      const st = orderStatus(s, w, order);
      return { text: `${this.targetTitle(p.job)} · ${Math.round(st.progress * 100)}%`, state: 'working' };
    }
    return { text: this.targetTitle(p.job), state: 'working' };
  }

  /** 底部员工条：总监在最前，然后按招来的顺序 */
  staff(session: Session): StaffToken[] {
    const { s } = session;
    const w = worldOf(s, this.content);
    return staffIds(s, w)
      .sort((a, b) => (a === DIRECTOR ? -1 : b === DIRECTOR ? 1 : 0))
      .map((id) => {
        const p = s.people[id];
        const d = this.doing(s, id);
        return {
          id,
          ...this.face(id),
          doing: d.text,
          state: d.state,
          skills: { teach: p?.skill ?? 0, upkeep: p?.upkeep ?? 0, service: p?.service ?? 0 },
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
    if (o.cost && !st.started) chips.push({ text: T.fmt('ui.chip.cost', { n: o.cost }), tone: 'cost' });
    chips.push({
      text: T.fmt('ui.sheet.work', { time: T.duration(minutes(o.work) * (1 - st.progress)) }),
      tone: 'time',
    });
    if (o.crew > 1) chips.push({ text: T.fmt('ui.sheet.crew', { n: o.crew }), tone: 'info' });
    if (st.chance !== null)
      chips.push({ text: T.fmt('ui.chip.chance', { p: Math.round(st.chance * 100) }), tone: 'risk' });
    chips.push(...effectChips(T, o.effects));
    if (st.chance !== null) chips.push(...effectChips(T, o.onSuccess, st.chance));
    if (o.restore) chips.push({ text: T.fmt('ui.sheet.restore_done', { n: o.restore }), tone: 'gain' });
    return chips;
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
          : T.fmt('ui.sheet.post_wait', { name: T.personName(st.person) })
        : st.demand && st.inHours
          ? T.tr('ui.sheet.post_empty_now')
          : T.tr('ui.sheet.post_empty');
    } else {
      const o = order as Order;
      const st = orderStatus(s, w, o);
      chips = this.orderChips(s, o);
      progress = st.progress;
      status = st.crew.length
        ? T.fmt('ui.sheet.order_on', {
            names: st.crew.map((x) => T.personName(x)).join(T.lang === 'zh' ? '、' : ', '),
            p: Math.round(st.progress * 100),
          })
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
        const fit = [
          `${T.tr(`ui.skill.${skill}`)} ${Math.round(p ? skillOf(p, skill) : 0)}`,
          walk ? T.fmt('ui.sheet.walk', { time: T.duration(walk) }) : T.tr('ui.sheet.here'),
          p?.job && !here ? T.fmt('ui.sheet.leaves', { what: this.targetTitle(p.job) }) : '',
        ]
          .filter(Boolean)
          .join(' · ');
        return {
          id,
          ...this.face(id),
          fit:
            here && p && working(s, w, id)
              ? T.fmt('ui.sheet.speed', { n: Math.round(speedOf(skillOf(p, skill)) * 100) })
              : fit,
          ...(here ? { here: true } : {}),
          ...(block && block !== 'same' ? { disabled: T.tr(`ui.why.${block}`) } : {}),
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

  /** 记分牌下面一行：有客人却没人管的岗位有几个（最要紧的提醒） */
  private status(session: Session): string | null {
    const { s } = session;
    const T = this.text;
    const w = worldOf(s, this.content);
    let empty = 0;
    for (const post of w.posts.values()) {
      const st = postStatus(s, w, post);
      if (st.exists && st.demand && st.inHours && !st.person) empty++;
    }
    return empty ? T.fmt('ui.status.empty', { n: empty }) : T.tr('ui.status.covered');
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
    const answers: CardAnswer[] = statuses.slice(0, 3).map((st, i) => {
      const opt = c.options[st.key];
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
      if (opt) {
        chips.push(...effectChips(T, opt.effects));
        if (st.chance !== null) {
          chips.push({ text: T.fmt('ui.chip.chance', { p: Math.round(st.chance * 100) }), tone: 'risk' });
          chips.push(...effectChips(T, opt.onSuccess, st.chance));
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
      // 代价和收益由标签讲，选项文字只留"做什么"（去掉文案里 " · " 后面手写的代价）
      const text = T.option(o.card, st.key).split(' · ')[0] ?? '';
      return {
        key: KEYS[i] ?? 1,
        text,
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
    if (o.expires !== null) {
      const total = Math.max(1, o.expires - o.opened);
      const left = Math.max(0, o.expires - session.time);
      card.countdown = { ratio: left / total, label: T.fmt('ui.left', { time: T.duration(left) }) };
    }
    return card;
  }
}

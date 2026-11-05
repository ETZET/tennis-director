import type { CausalEntry, ContentBundle, EffectRecord } from '@td/sim';

/**
 * 文案：所有游戏内文字都从内容包的 i18n 表里取（en / zh），这里只负责拼。
 * 拼法本身（"因为……所以……"、"+3"）是界面规则，不进内容。
 */

export type Lang = 'en' | 'zh';

export interface Text {
  readonly lang: Lang;
  tr(key: string, fallback?: string): string;
  /** 带占位符的文案：fmt('ui.left', { time: '12 min' }) */
  fmt(key: string, vars: Record<string, string | number>): string;
  personName(id: string): string;
  /** 地点名：那一处设施现在是什么变体，先找 anchors.<id>.<变体>（硬地场、二号网球场……），没有再用 anchors.<id> */
  anchor(id: string): string;
  /** 设施名（ui.fac.<设施>）：同样先找 ui.fac.<设施>.<变体> */
  facility(id: string): string;
  /** 设施某一档的名字（facilities.<设施>.<状态>）：先找 facilities.<设施>.<状态>.<变体> */
  facilityState(id: string, state: string, fallback?: string): string;
  /** 告诉文案每处设施现在的变体（模拟状态的 variants；每帧由投影调一次） */
  setVariants(v: Readonly<Record<string, string>> | undefined): void;
  cardTitle(card: string): string;
  option(card: string, key: string): string;
  effect(e: EffectRecord): string | null;
  /** 因果日志一条的"因为"部分 */
  because(e: CausalEntry): string;
  /** 因果日志一条的"所以"部分；没有可讲的效果时返回 null */
  so(e: CausalEntry): string | null;
  /** 时间到了、由卡上的那个人替你选的那一条（"Dale 选了“南场”（时间到了）"）；不是这种情况返回 null */
  defaultPick(e: CausalEntry): string | null;
  clock(t: number): string;
  day(t: number): string;
  duration(min: number): string;
}

// 负号用 −（和现金的 −$150 一致）
const signed = (n: number) => {
  const r = Math.round(n * 10) / 10 || 0;
  return r > 0 ? `+${r}` : r < 0 ? `−${-r}` : '0';
};

export function createText(content: ContentBundle, lang: Lang): Text {
  const table = content.i18n[lang] ?? content.i18n.en ?? {};
  const people = new Map(content.people.map((p) => [p.id, p.name]));
  const zh = lang === 'zh';
  const tr = (key: string, fallback?: string) => table[key] ?? content.i18n.en?.[key] ?? fallback ?? key;
  // 人名：文案表里有译名就用（总监、中文版的教练称呼），没有就用内容里的名字
  const personName = (id: string) => table[`people.${id}`] ?? people.get(id) ?? id;
  const cardTitle = (card: string) => tr(`events.${card}.title`, card);
  // 地点名：没写 anchors.<id> 的新地点（地块的锚点和路同名，W5）借选路的路名（"南场 · …" 只取前半）
  const slots = Object.keys(content.acts[0]?.routes ?? {});
  // 变体名（W2）：锚点 → 设施；每处设施现在的变体由 setVariants 告诉
  const facilityOf = new Map(content.facilities.map((f) => [f.anchor, f.id]));
  let variants: Readonly<Record<string, string>> = {};
  const setVariants = (v: Readonly<Record<string, string>> | undefined) => {
    variants = v ?? {};
  };
  /** 先试 <key>.<变体>，没有就是空串 */
  const byVariant = (key: string, facility: string | undefined) => {
    const v = facility ? variants[facility] : undefined;
    return v ? tr(`${key}.${v}`, '') : '';
  };
  const facility = (f: string) => byVariant(`ui.fac.${f}`, f) || tr(`ui.fac.${f}`, f);
  const facilityState = (f: string, state: string, fallback?: string) =>
    byVariant(`facilities.${f}.${state}`, f) || tr(`facilities.${f}.${state}`, fallback);
  const anchor = (id: string) => {
    const own = byVariant(`anchors.${id}`, facilityOf.get(id)) || tr(`anchors.${id}`, '');
    if (own) return own;
    for (const slot of slots) {
      const r = tr(`routes.${slot}.${id}`, '');
      if (r) return r.split(' · ')[0] ?? r;
    }
    return id;
  };
  const option = (card: string, key: string) => tr(`events.${card}.options.${key}`, key);
  const cardWho = new Map(content.cards.map((c) => [c.id, c.who]));
  // 时间到了由卡上的那个人（不是"应聘者"这类角色）替你选：说是谁、选了哪一项；选路的说路名
  const defaultPick = (e: CausalEntry): string | null => {
    const c = e.cause;
    if (c.kind !== 'default' || !c.option) return null;
    const who = cardWho.get(c.card);
    if (!who || !people.has(who)) return null;
    const r = e.effects.find((x) => x.kind === 'route');
    const what =
      r && r.kind === 'route'
        ? (tr(`routes.${r.slot}.${r.route}`, r.route).split(' · ')[0] ?? r.route)
        : (option(c.card, c.option).split(/[:：·]/)[0] ?? '').trim();
    return fmt('ui.because.default_pick', { name: personName(who), option: what });
  };
  const fmt = (key: string, vars: Record<string, string | number>) =>
    tr(key).replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));

  const duration = (min: number) => {
    const m = Math.max(0, Math.round(min));
    // 一天以上按天说（"停用 7 天"，不说"168 小时"）：天数 + 不满一天的整小时，分钟不再细说
    if (m >= 1440) {
      let d = Math.floor(m / 1440);
      let hr = Math.round((m % 1440) / 60);
      if (hr === 24) {
        d++;
        hr = 0;
      }
      if (zh) return hr ? `${d} 天 ${hr} 小时` : `${d} 天`;
      return hr ? `${d}d ${hr}h` : `${d}d`;
    }
    const h = Math.floor(m / 60);
    if (zh) return h ? (m % 60 ? `${h} 小时 ${m % 60} 分` : `${h} 小时`) : `${m} 分钟`;
    return h ? (m % 60 ? `${h}h ${String(m % 60).padStart(2, '0')}m` : `${h}h`) : `${m} min`;
  };
  /** 脏乱的名字：红土上（按现在的变体换面）用红土的叫法 */
  const careCourts = content.acts[0]?.rules.care?.courts ?? {};
  const messName = (f: string, k: string) => {
    const c = careCourts[f];
    const v = variants[f];
    const clay = (v && c?.variants[v]) || c?.surface;
    return tr(clay === 'clay' ? `ui.care.kinds_clay.${k}` : `ui.care.kinds.${k}`, k);
  };
  const effect = (e: EffectRecord): string | null => {
    switch (e.kind) {
      case 'stat': {
        const d = e.stat === 'cash' ? `${e.delta < 0 ? '−' : '+'}$${Math.abs(Math.round(e.delta))}` : signed(e.delta);
        return `${tr(`stats.${e.stat}`)} ${d}`;
      }
      case 'cost':
        return zh ? `花了 $${e.amount}` : `spent $${e.amount}`;
      case 'facility':
        return facilityState(e.facility, e.state);
      case 'hire':
        return zh ? `${personName(e.person)} 上任` : `${personName(e.person)} hired`;
      case 'fire':
        return zh ? `${personName(e.person)} 离开` : `${personName(e.person)} let go`;
      case 'person':
        if (Math.abs(e.delta) < 0.5) return null;
        return `${personName(e.person)} ${tr(`ui.attr.${e.attr}`, e.attr)} ${signed(e.delta)}`;
      case 'text':
        return tr(e.key);
      case 'end':
        return tr(`endings.${e.ending}.title`);
      case 'activity':
        return zh ? `安排了${tr(`activities.${e.activity}.title`)}` : `${tr(`activities.${e.activity}.title`)} booked`;
      case 'errand':
        return tr('ui.errand_log')
          .replace('{name}', personName(e.person))
          .replace('{place}', tr(`anchors.${e.at}`, e.at))
          .replace('{time}', duration(e.minutes));
      case 'task':
        return tr('ui.task_log')
          .replace('{name}', personName(e.person))
          .replace('{what}', tr(`orders.${e.order}.title`, e.order));
      case 'condition': {
        if (Math.abs(e.delta) < 1) return null;
        return `${facility(e.facility)} ${tr('ui.condition')} ${signed(e.delta)}`;
      }
      case 'upgrade':
        return fmt('ui.log.upgrade', {
          what: tr(`upgrades.${e.facility}.${e.upgrade}`, e.upgrade).split(' · ')[0] ?? e.upgrade,
          place: facility(e.facility),
        });
      case 'remodel':
        return fmt('ui.log.remodel', {
          place: facility(e.facility),
          what: tr(`variants.${e.facility}.${e.variant}`, e.variant).split(' · ')[0] ?? e.variant,
        });
      case 'trophy':
        return fmt('ui.log.trophy', { n: signed(e.delta) });
      case 'route':
        return fmt('ui.log.route', { route: tr(`routes.${e.slot}.${e.route}`, e.route).split(' · ')[0] ?? e.route });
      case 'mess': {
        // 场地可用度（court-care-contract.md）：扫掉了哪几种脏乱（ui.care.log_mess），落上了的写 +名字；不写数
        const sep = zh ? '、' : ', ';
        const ks = Object.entries(e.delta).filter(([, v]) => Math.abs(v ?? 0) >= 0.01);
        const cleared = ks.filter(([, v]) => (v ?? 0) < 0).map(([k]) => messName(e.facility, k));
        const added = ks.filter(([, v]) => (v ?? 0) > 0).map(([k]) => `+${messName(e.facility, k)}`);
        const parts = [
          ...(cleared.length
            ? [fmt('ui.care.log_mess', { place: facility(e.facility), list: cleared.join(sep) })]
            : []),
          ...(added.length ? [`${facility(e.facility)} ${added.join(sep)}`] : []),
        ];
        return parts.length ? parts.join(sep) : null;
      }
      default:
        // flag、schedule 是幕后的账，不讲给玩家；变体锁定、牌匾由快讯单独讲
        return null;
    }
  };

  const because = (e: CausalEntry): string => {
    const c = e.cause;
    switch (c.kind) {
      case 'option': {
        const o = `“${option(c.card, c.option)}”`;
        const r =
          c.success === undefined
            ? ''
            : c.success
              ? zh
                ? '（成了）'
                : ' (it worked)'
              : zh
                ? '（没成）'
                : " (it didn't work)";
        return zh ? `你选了${o}${r}` : `you went with ${o}${r}`;
      }
      case 'default':
        if (defaultPick(e)) return defaultPick(e) as string;
        return zh ? `没人处理“${cardTitle(c.card)}”` : `nobody handled “${cardTitle(c.card)}”`;
      case 'activity':
        return zh
          ? `${tr(`activities.${c.activity}.title`)}结束了`
          : `the ${tr(`activities.${c.activity}.title`).toLowerCase()} wrapped up`;
      case 'day':
        return zh ? `第 ${c.day} 天收工` : `day ${c.day} closed`;
      case 'post':
        return tr('ui.because.post')
          .replace('{name}', personName(c.person))
          .replace('{post}', tr(`posts.${c.post}.title`, c.post))
          .replace('{n}', String(c.cycles));
      case 'order': {
        const r = c.success === undefined ? '' : tr(c.success ? 'ui.because.worked' : 'ui.because.failed');
        return (
          tr('ui.because.order')
            .replace('{names}', c.people.map(personName).join(zh ? '、' : ' & ') || tr('ui.nobody'))
            .replace('{order}', tr(`orders.${c.order}.title`, c.order)) + r
        );
      }
      case 'week': {
        // 周结算（GM-1）：服务率、及格线、缺人最多的岗位
        if (!c.demand) return fmt('ui.settle.none', { n: c.week });
        const base = fmt('ui.settle.because', {
          n: c.week,
          rate: Math.round((c.served / c.demand) * 100),
          pass: Math.round(c.pass * 100),
        });
        if (!c.missed) return base;
        return (
          base +
          fmt('ui.settle.missed', {
            post: tr(`posts.${c.missed.post}.title`, c.missed.post),
            time: duration(c.missed.minutes),
          })
        );
      }
      case 'wear':
        return tr('ui.because.wear').replace('{place}', facility(c.facility)).replace('{n}', String(c.condition));
      case 'star':
        return fmt('ui.because.star', { n: c.stars });
      case 'remodel':
        return fmt('ui.because.remodel', {
          place: facility(c.facility),
          what: tr(`variants.${c.facility}.${c.variant}`, c.variant).split(' · ')[0] ?? c.variant,
        });
      case 'tournament':
        // 赛事结算（LG-11）：办完了，或者下雨办不成
        return fmt(c.result === 'spoiled' ? 'ui.because.tournament_spoiled' : 'ui.because.tournament', {
          title: tr(`tournaments.${c.tournament}.title`, c.tournament),
        });
      case 'unlock':
        // 成长解锁（W3）：满足各条门槛的人
        return fmt('ui.grow.because', {
          names: c.people.map(personName).join(zh ? '、' : ' & ') || personName(c.person),
        });
      case 'settlement':
        // 结算打分（W4）
        return fmt('ui.ending.because_settled', { total: c.total, grade: c.grade });
      case 'season':
        return tr('ui.ending.because_season');
      case 'care':
        // 总监亲手扫了场（court-care-contract.md）
        return fmt('ui.care.because_care', { place: anchor(c.court), time: duration(c.minutes) });
      case 'walkout':
        return fmt('ui.care.because_walkout', { place: anchor(c.court) });
      case 'debug':
        return zh ? `调试：${c.what}` : `debug: ${c.what}`;
      default:
        return zh ? '开局' : 'the season started';
    }
  };

  /** 周结算的"所以"：钱、声望、会员、质量各一句，每句带上为什么（各项、上限、目标） */
  const settled = (e: CausalEntry): string | null => {
    const c = e.cause;
    if (c.kind !== 'week') return null;
    const sep = zh ? '、' : ', ';
    const money = (n: number) => `${n < 0 ? '−' : '+'}$${Math.abs(Math.round(n))}`;
    const get = (stat: string) =>
      e.effects.find((x): x is Extract<EffectRecord, { kind: 'stat' }> => x.kind === 'stat' && x.stat === stat);
    const part = (rec: EffectRecord, why: string[]) => {
      const what = effect(rec) ?? '';
      return why.length ? fmt('ui.settle.part', { what, parts: why.join(sep) }) : what;
    };
    const out: string[] = [];
    const cash = get('cash');
    if (cash) {
      const why = (['wages', 'upkeep', 'dues', 'income'] as const)
        .filter((k) => c.money[k])
        .map(
          (k) => `${tr(`ui.settle.money.${k}`)} ${money(k === 'wages' || k === 'upkeep' ? -c.money[k] : c.money[k])}`,
        );
      out.push(part(cash, why));
    }
    const rep = get('reputation');
    if (rep)
      out.push(
        part(
          rep,
          Object.entries(c.rep)
            .filter(([, v]) => v)
            .map(([k, v]) => `${tr(`ui.terms.${k}`, k)} ${signed(v)}`),
        ),
      );
    const members = get('members');
    if (members) {
      // 撞了上限：多的人不续了（变少），或者还有人想来却进不来（变多但没那么多）
      const cap = c.members.cap ?? 0;
      const why =
        c.members.cap === null || members.delta >= c.members.gain
          ? []
          : members.delta < 0
            ? [fmt('ui.settle.capped', { cap })]
            : [fmt('ui.settle.full', { cap, n: Math.round(c.members.gain - members.delta) })];
      out.push(part(members, why));
    }
    const q = get('quality');
    if (q) {
      const terms = Object.entries(c.quality.terms)
        .filter(([, v]) => v)
        .sort(([, a], [, b]) => Math.abs(b) - Math.abs(a))
        .slice(0, 4)
        .map(([k, v]) => `${tr(`ui.terms.${k}`, k)} ${signed(v)}`);
      out.push(
        part(q, [fmt('ui.settle.target', { n: Math.round(c.quality.target * 10) / 10, parts: terms.join(sep) })]),
      );
    }
    // 场地可用度（court-care-contract.md）：这周走掉的会员、挡掉分钟最多的那块场（有才写）
    if (c.walkouts) out.push(fmt('ui.care.week_walkouts', { n: c.walkouts }));
    if (c.unplayable)
      out.push(
        fmt('ui.care.week_unplayable', { place: anchor(c.unplayable.court), time: duration(c.unplayable.minutes) }),
      );
    return out.length ? out.join(zh ? '；' : '; ') : null;
  };

  const so = (e: CausalEntry): string | null => {
    if (e.cause.kind === 'week') return settled(e);
    // 升星这条日志没有数值变动：讲开出了什么
    if (e.cause.kind === 'star') {
      const list = e.cause.opens.map((k) => tr(`stars.opens.${k}`, k)).join(zh ? '、' : ', ');
      return list ? fmt('ui.stars.opens', { list }) : tr('ui.stars.sign');
    }
    // 时间到了替你选的路：路名已经在"因为"那半句里，这里不再说一遍没有主语的"走上了……"
    const picked = defaultPick(e) !== null;
    const parts = e.effects
      .map((x) => (picked && x.kind === 'route' ? null : effect(x)))
      .filter((x): x is string => !!x);
    // 成长解锁（W3）：效果可能是幕后的旗标，至少讲开出了什么
    if (e.cause.kind === 'unlock') parts.unshift(tr(`unlocks.${e.cause.key}`, e.cause.key));
    return parts.length ? parts.join(zh ? '，' : ', ') : null;
  };

  const clock = (t: number) => {
    const m = t % 1440;
    const h = Math.floor(m / 60);
    const mm = String(m % 60).padStart(2, '0');
    if (zh) return `${h}:${mm}`;
    return `${h % 12 || 12}:${mm} ${h >= 12 ? 'PM' : 'AM'}`;
  };
  const day = (t: number) => (zh ? `第 ${Math.floor(t / 1440) + 1} 天` : `Day ${Math.floor(t / 1440) + 1}`);

  return {
    lang,
    tr,
    fmt,
    personName,
    anchor,
    cardTitle,
    option,
    effect,
    because,
    so,
    defaultPick,
    facility,
    facilityState,
    setVariants,
    clock,
    day,
    duration,
  };
}

/** 一条日志的语气：有坏消息就算坏，有好消息就算好 */
export function entryTone(e: CausalEntry): 'bad' | 'good' | undefined {
  let good = 0;
  let bad = 0;
  for (const x of e.effects) {
    if (x.kind === 'stat') {
      if (x.delta > 0) good++;
      else if (x.delta < 0) bad++;
    }
    if (x.kind === 'end') return x.result === 'lost' ? 'bad' : 'good';
  }
  // 掉档（准则 6）、会员等不及走了是坏消息；亲手扫干净是好消息
  if (e.cause.kind === 'wear' || e.cause.kind === 'walkout') return 'bad';
  if (e.cause.kind === 'care') return 'good';
  return bad > good ? 'bad' : good > bad ? 'good' : undefined;
}

import { compileExpr, fnv1a, stableStringify } from '@td/shared';
import { parse as parseYaml } from 'yaml';
import type { z } from 'zod';
import {
  type Act,
  act,
  activity,
  type Card,
  type Cond,
  type ContentBundle,
  card,
  director,
  type Effect,
  facility,
  minutes,
  OPTION_KEYS,
  type Order,
  order,
  PERSON_KINDS,
  PLOT_STATES,
  person,
  post,
  stat,
  type Tournament,
  trait,
} from './schema';

/**
 * 内容编译器：YAML 文件 → 校验过的内容包（JSON）。
 *
 * 只吃 { 相对路径: 文本 }，不碰文件系统，所以同一份代码在命令行编译、Vite 插件热更新、
 * 测试里都能用。错误带着文件路径，Vite 插件会把它们显示在浏览器的错误浮层上。
 */

export interface ContentIssue {
  file: string;
  message: string;
}

export interface CompileResult {
  bundle: ContentBundle | null;
  errors: ContentIssue[];
  warnings: ContentIssue[];
}

/** 表达式里除了 stat.* / flag.* / facility.* / person.*.* 之外可以用的计算变量（模拟按同一张表提供） */
export const COMPUTED_VARS = [
  'coach.skill',
  'coach.attention',
  'coach.morale',
  'coach.present',
  'coach.hired',
  'director.at',
  'courts_open',
  'facility_quality',
  'facility_income_week',
  'facility_upkeep_week',
  'wages_week',
  'open_cards',
  'day',
  'hour',
  'pressure',
  'weather',
  'season',
  'weekday',
  /** 岗位效果里：在岗这个人对应能力的值 */
  'worker.skill',
  /** 在职、能指派的人数（含总监） */
  'staff',
  /** 修好了几处设施：状态和开局不一样、而且给园区加分（扫完沙这种中间状态不算，ADR 0015） */
  'restored',
  /** 本周到现在的服务率 0..1（有需求的岗位分钟里，有人在岗的比例） */
  'service_rate',
  /** 这一周（或者上一周）有没有需求：0 或 1。没有需求的一周，服务率无从谈起（GM-1） */
  'service_demand',
  /** 周结算里声望服务项的及格线（rules.week.service_pass） */
  'service_pass',
  /** 修好、能打的场地数，不管今天下不下雨（会员上限按这个算） */
  'courts_built',
  /** 在职的人里闲得最久的那个，连续闲了几个营业日（没岗位没工单、没在走路办事；720 营业分钟 = 1 天） */
  'idle_days',
  /** 离上一张卡打开过了几天（任何来源的卡；导演在长时间没卡时用） */
  'quiet_days',
  /** 星级 0..5（LG-10）：已经达到的最高星，不往回掉 */
  'stars',
  /** 奖杯数（LG-10）：效果 { trophy: n } 加 */
  'trophies',
  /**
   * 赛事（LG-11）：只在赛事结算（奖励和附加目标的 if、chance）时有值，别处读到 0。
   * service_rate：赛事那几天时段里全园的服务率；staffed：临时岗位有人的比例；skill：报名工单上那项能力最高的人的值；
   * crew：报名工单上干过的人数；repeat：这是第几次再参加（第一次是 0）。
   */
  'event.service_rate',
  'event.staffed',
  'event.skill',
  'event.crew',
  'event.repeat',
  /**
   * 员工成长（W3）：在职、能指派的人里（含总监）这项能力底子最高的值（不算特质）。
   * 内容里"有没有一个维护 ≥ 75 的人"用条件 { skilled: upkeep, gte: 75 } 更直白，要比大小、算概率时用它
   */
  'best.teach',
  'best.upkeep',
  'best.service',
  'best.play',
  /**
   * 结局（W4，LG-13）：exhibition 表演赛办成过没有（0/1，ending.exhibition 条件第一次满足时记下）；
   * days_early 结算那天离 ending.day 还有几天（还没结算时按今天算；不小于 0）；season 第几季（1、2）；settled 结算过没有（0/1）。
   * 没写 ending 的地图读到 0（season 读到 1）。
   */
  'ending.exhibition',
  'ending.days_early',
  'ending.season',
  'ending.settled',
] as const;
/** 设施状况变量：condition.<设施 id> = 0..100 */
export const CONDITION_VAR = /^condition\.([a-z][a-z0-9_]*)$/;
/** 变体变量：variant.<设施 id> = 修成（或者正在修成）的变体 id，没选过是 ''（LG-14） */
export const VARIANT_VAR = /^variant\.([a-z][a-z0-9_]*)$/;
/** 选路变量（W2）：route.<处> = 选了哪条路，没选是 '' */
export const ROUTE_VAR = /^route\.([a-z][a-z0-9_]*)$/;
/** 地块变量（W5）：plot.<地块> = locked / building / open */
export const PLOT_VAR = /^plot\.([a-z][a-z0-9_]*)$/;
/** 分期筹备变量（W2）：prep.<组> = 这一组工单做完的比例 0..1 */
export const PREP_VAR = /^prep\.([a-z][a-z0-9_]*)$/;
/** 岗位这一周转了几圈（W2）：cycles.<岗位> */
export const CYCLES_VAR = /^cycles\.([a-z][a-z0-9_]*)$/;
/** 成长解锁变量（W3）：unlocked.<键> = 1（开出来了）或 0 */
export const UNLOCKED_VAR = /^unlocked\.([a-z][a-z0-9_]*)$/;
/** 在职人数变量：hired.<作用或特质> = 在职的人里作用是它、或者带着这个特质的有几个 */
export const HIRED_VAR = /^hired\.([a-z][a-z0-9_]*)$/;
export const PERSON_ATTRS = ['skill', 'upkeep', 'service', 'play', 'morale', 'fatigue', 'talent', 'hired'] as const;
/** 岗位和工单效果里代表"在岗的那个人"的 person */
export const WORKER = 'worker';

const ONE_PER_FILE = /^(events\/[a-z0-9_]+|activities|posts|orders|directors|acts)\/([a-z0-9_]+)\.ya?ml$/;

function flatten(o: unknown, prefix: string, out: Record<string, string>): void {
  if (o && typeof o === 'object' && !Array.isArray(o)) {
    for (const [k, v] of Object.entries(o)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  } else if (o !== undefined && o !== null) out[prefix] = String(o);
}

export function compileContent(files: Record<string, string>): CompileResult {
  const errors: ContentIssue[] = [];
  const warnings: ContentIssue[] = [];
  const err = (file: string, message: string) => errors.push({ file, message });
  const warn = (file: string, message: string) => warnings.push({ file, message });

  const b: ContentBundle = {
    version: '',
    stats: [],
    facilities: [],
    people: [],
    traits: [],
    directors: [],
    activities: [],
    posts: [],
    orders: [],
    acts: [],
    cards: [],
    i18n: {},
  };
  /** 每条内容来自哪个文件（报错用） */
  const origin = new Map<string, string>();

  const take = <S extends z.ZodType>(file: string, schema: S, raw: unknown): z.infer<S> | null => {
    const r = schema.safeParse(raw);
    if (r.success) return r.data;
    for (const i of r.error.issues) err(file, `${i.path.join('.') || '(root)'}: ${i.message}`);
    return null;
  };
  const list = <S extends z.ZodType>(file: string, schema: S, raw: unknown, into: z.infer<S>[], kind: string) => {
    if (!Array.isArray(raw)) return err(file, `expected a list of ${kind}`);
    raw.forEach((item, i) => {
      const v = take(`${file}[${i}]`, schema, item);
      if (v) into.push(v);
    });
  };

  for (const [file, text] of Object.entries(files).sort(([a], [b2]) => a.localeCompare(b2))) {
    let raw: unknown;
    try {
      raw = parseYaml(text);
    } catch (e) {
      err(file, `YAML: ${(e as Error).message}`);
      continue;
    }
    const one = ONE_PER_FILE.exec(file);
    if (file === 'stats.yaml') list(file, stat, raw, b.stats, 'stats');
    else if (file === 'facilities.yaml') list(file, facility, raw, b.facilities, 'facilities');
    else if (file === 'traits.yaml') list(file, trait, raw, b.traits, 'traits');
    else if (/^people\/[a-z0-9_]+\.ya?ml$/.test(file)) list(file, person, raw, b.people, 'people');
    else if (/^i18n\/[a-z]{2}\.ya?ml$/.test(file)) {
      const lang = file.slice(5, 7);
      const flat: Record<string, string> = {};
      flatten(raw, '', flat);
      b.i18n[lang] = flat;
    } else if (one) {
      const [, dir = '', fileId = ''] = one;
      const schema = dir.startsWith('events/')
        ? card
        : dir === 'activities'
          ? activity
          : dir === 'posts'
            ? post
            : dir === 'orders'
              ? order
              : dir === 'directors'
                ? director
                : act;
      const v = take(file, schema, raw) as { id: string } | null;
      if (!v) continue;
      if (v.id !== fileId) err(file, `id '${v.id}' must match the file name '${fileId}'`);
      if (dir.startsWith('events/')) {
        const c = v as Card;
        if (`events/${c.act}` !== dir) err(file, `card act '${c.act}' must match its folder '${dir}'`);
        b.cards.push(c);
      } else if (dir === 'activities') b.activities.push(v as z.infer<typeof activity>);
      else if (dir === 'posts') b.posts.push(v as z.infer<typeof post>);
      else if (dir === 'orders') b.orders.push(v as z.infer<typeof order>);
      else if (dir === 'directors') b.directors.push(v as z.infer<typeof director>);
      else b.acts.push(v as Act);
      origin.set(`${dir}:${v.id}`, file);
    } else warn(file, 'file is not part of any content type and was ignored');
  }

  /* ---------- 唯一性 ---------- */
  const index = <T extends { id: string }>(kind: string, items: T[], file: string) => {
    const m = new Map<string, T>();
    for (const it of items) {
      if (m.has(it.id)) err(origin.get(`${kind}:${it.id}`) ?? file, `duplicate ${kind} id '${it.id}'`);
      m.set(it.id, it);
    }
    return m;
  };
  const stats = index('stat', b.stats, 'stats.yaml');
  const facilities = index('facility', b.facilities, 'facilities.yaml');
  const people = index('person', b.people, 'people/');
  const traits = index('trait', b.traits, 'traits.yaml');
  const directors = index('directors', b.directors, 'directors/');
  const activities = index('activities', b.activities, 'activities/');
  // 岗位和工单共用一个 id 空间（指派命令只带一个 id）
  index('targets', [...b.posts, ...b.orders], 'posts/');
  const acts = index('acts', b.acts, 'acts/');
  const cards = new Map<string, Card>();
  for (const c of b.cards) {
    if (cards.has(c.id)) err(`events/${c.act}/${c.id}.yaml`, `duplicate card id '${c.id}'`);
    cards.set(c.id, c);
  }
  const anchors = new Set(b.acts.flatMap((a) => a.anchors));
  /** 选路的处 → 可选的路（W2）；分期筹备的组（W2） */
  const routeSlots = new Map<string, Set<string>>();
  for (const a of b.acts)
    for (const [k, v] of Object.entries(a.routes ?? {}))
      routeSlots.set(k, new Set([...(routeSlots.get(k) ?? []), ...v]));
  const prepGroups = new Set(b.orders.flatMap((o) => (o.prep ? [o.prep] : [])));
  /** 地块（W5）：地块 id → 变体 id */
  const plotDefs = new Map<string, Set<string>>();
  for (const a of b.acts) for (const p of a.plots ?? []) plotDefs.set(p.id, new Set(Object.keys(p.variants)));
  /** 成长解锁的键（W3） */
  const unlockKeys = new Set(b.acts.flatMap((a) => (a.growth?.unlocks ?? []).map((u) => u.key)));
  const isTag = (k: string) => (PERSON_KINDS as readonly string[]).includes(k) || traits.has(k);
  const langs = Object.keys(b.i18n);
  if (!langs.length) err('i18n/', 'no language files');

  /* ---------- 标记：谁写、谁读 ---------- */
  const flagWrites = new Set<string>();
  const flagReads = new Map<string, string>();
  const walkEffects = (effs: readonly Effect[], f: (e: Effect) => void) => effs.forEach(f);
  for (const c of b.cards)
    for (const o of Object.values(c.options))
      for (const effs of [o?.effects ?? [], o?.onSuccess ?? [], o?.onFail ?? []])
        walkEffects(effs, (e) => {
          if ('flag' in e) flagWrites.add(e.flag);
        });
  for (const c of b.cards)
    walkEffects(c.default?.extra ?? [], (e) => {
      if ('flag' in e) flagWrites.add(e.flag);
    });
  for (const a of b.activities)
    walkEffects(a.effects, (e) => {
      if ('flag' in e) flagWrites.add(e.flag);
    });
  const orderEffects = (o: Order): (readonly Effect[])[] => [
    o.effects,
    o.onSuccess,
    o.onFail,
    ...Object.values(o.variants ?? {}).map((v) => v.effects ?? []),
  ];
  for (const a of [...b.posts, ...b.orders])
    for (const effs of 'onSuccess' in a ? orderEffects(a) : [a.effects])
      walkEffects(effs, (e) => {
        if ('flag' in e) flagWrites.add(e.flag);
      });
  const tournamentEffects = (t: Tournament): (readonly Effect[])[] => [
    t.reward,
    ...[...t.goals, ...(t.repeat.goals ?? [])].map((g) => g.reward),
  ];
  for (const a of b.acts)
    for (const u of a.growth?.unlocks ?? [])
      walkEffects(u.effects, (e) => {
        if ('flag' in e) flagWrites.add(e.flag);
      });
  for (const a of b.acts)
    for (const p of a.plots ?? [])
      for (const v of Object.values(p.variants))
        walkEffects([...v.start, ...v.opens.effects], (e) => {
          if ('flag' in e) flagWrites.add(e.flag);
        });
  const allTournaments = b.acts.flatMap((a) => a.tournaments ?? []);
  const tournamentOrders = new Set(allTournaments.map((t) => t.order));
  /** 地块的清理工单（W5）：做完它本身就是效果（开地） */
  const clearanceOrders = new Set(
    b.acts.flatMap((a) => (a.plots ?? []).flatMap((p) => Object.values(p.variants).flatMap((v) => v.orders))),
  );
  for (const t of allTournaments)
    for (const effs of tournamentEffects(t))
      walkEffects(effs, (e) => {
        if ('flag' in e) flagWrites.add(e.flag);
      });

  /* ---------- 表达式 ---------- */
  const knownVar = (p: string): boolean => {
    if ((COMPUTED_VARS as readonly string[]).includes(p)) return true;
    const cv = CONDITION_VAR.exec(p);
    if (cv) return facilities.has(cv[1] as string);
    const vv = VARIANT_VAR.exec(p);
    if (vv) return !!facilities.get(vv[1] as string)?.variants;
    const rv = ROUTE_VAR.exec(p);
    if (rv) return routeSlots.has(rv[1] as string);
    const lv = PLOT_VAR.exec(p);
    if (lv) return plotDefs.has(lv[1] as string);
    const pv = PREP_VAR.exec(p);
    if (pv) return prepGroups.has(pv[1] as string);
    const yv = CYCLES_VAR.exec(p);
    if (yv) return b.posts.some((x) => x.id === yv[1]);
    const uv = UNLOCKED_VAR.exec(p);
    if (uv) return unlockKeys.has(uv[1] as string);
    const hv = HIRED_VAR.exec(p);
    if (hv) return (PERSON_KINDS as readonly string[]).includes(hv[1] as string) || traits.has(hv[1] as string);
    const [head, a, attr] = p.split('.');
    if (head === 'stat') return !!a && stats.has(a) && attr === undefined;
    if (head === 'flag') return !!a && flagWrites.has(a) && attr === undefined;
    if (head === 'facility') return !!a && facilities.has(a) && attr === undefined;
    if (head === 'person') return !!a && people.has(a) && (PERSON_ATTRS as readonly string[]).includes(attr ?? '');
    return false;
  };
  const checkExpr = (file: string, src: string | number | undefined, what: string) => {
    if (typeof src !== 'string') return;
    try {
      compileExpr(src, knownVar);
    } catch (e) {
      err(file, `${what}: ${(e as Error).message}`);
    }
  };

  /* ---------- 文案 ---------- */
  const needText = (file: string, key: string) => {
    for (const l of langs) if (!(key in (b.i18n[l] ?? {}))) err(file, `missing text '${key}' in i18n/${l}.yaml`);
  };

  /* ---------- 条件和效果的引用 ---------- */
  const checkCond = (file: string, c: Cond | undefined, where: string): void => {
    if (!c) return;
    if ('all' in c || 'any' in c) {
      for (const x of 'all' in c ? c.all : c.any) checkCond(file, x, where);
      return;
    }
    if ('not' in c) {
      checkCond(file, c.not, where);
      return;
    }
    if ('stat' in c && !stats.has(c.stat)) err(file, `${where}: unknown stat '${c.stat}'`);
    if ('flag' in c && !flagReads.has(c.flag)) flagReads.set(c.flag, file);
    if ('facility' in c) {
      const f = facilities.get(c.facility);
      if (!f) err(file, `${where}: unknown facility '${c.facility}'`);
      else if (!(c.is in f.states)) err(file, `${where}: facility '${c.facility}' has no state '${c.is}'`);
    }
    if ('variant' in c) {
      const f = facilities.get(c.variant);
      if (!f) err(file, `${where}: unknown facility '${c.variant}'`);
      else if (!f.variants) err(file, `${where}: facility '${c.variant}' has no variants`);
      else if (c.is !== 'none' && !(c.is in f.variants))
        err(file, `${where}: facility '${c.variant}' has no variant '${c.is}'`);
    }
    if ('upgrade' in c) {
      const f = facilities.get(c.upgrade);
      if (!f) err(file, `${where}: unknown facility '${c.upgrade}'`);
      else if (!(c.has in (f.upgrades ?? {}))) err(file, `${where}: facility '${c.upgrade}' has no upgrade '${c.has}'`);
    }
    if ('route' in c) {
      const r = routeSlots.get(c.route);
      if (!r) err(file, `${where}: unknown route slot '${c.route}'`);
      else if (c.is !== 'none' && !r.has(c.is)) err(file, `${where}: route slot '${c.route}' has no route '${c.is}'`);
    }
    if ('plot' in c) {
      const v = plotDefs.get(c.plot);
      if (!v) err(file, `${where}: unknown plot '${c.plot}'`);
      else if (!(PLOT_STATES as readonly string[]).includes(c.is) && !v.has(c.is))
        err(file, `${where}: plot '${c.plot}' is locked / building / open or one of its variants, not '${c.is}'`);
    }
    if ('prep' in c && !prepGroups.has(c.prep)) err(file, `${where}: no order has prep '${c.prep}'`);
    if ('skilled' in c && c.who && !isTag(c.who))
      err(file, `${where}: who '${c.who}' is neither a person kind nor a trait`);
    if ('unlocked' in c && !unlockKeys.has(c.unlocked)) err(file, `${where}: no growth unlock '${c.unlocked}'`);
    if ('assigned' in c) {
      if (!people.has(c.assigned)) err(file, `${where}: unknown person '${c.assigned}'`);
      if (c.at && !anchors.has(c.at)) err(file, `${where}: unknown anchor '${c.at}'`);
    }
    if ('seen' in c && !cards.has(c.seen)) err(file, `${where}: unknown card '${c.seen}'`);
    if ('open' in c && !cards.has(c.open)) err(file, `${where}: unknown card '${c.open}'`);
    if ('coach' in c && c.coach !== 'none' && !people.has(c.coach)) err(file, `${where}: unknown person '${c.coach}'`);
    if ('activity' in c && !activities.has(c.activity)) err(file, `${where}: unknown activity '${c.activity}'`);
    if ('season' in c && !b.acts.some((a) => a.seasons.some((x) => x.id === c.season)))
      err(file, `${where}: unknown season '${c.season}'`);
    if ('expr' in c) checkExpr(file, c.expr, where);
  };
  /** worker：岗位和工单的效果里可以用 person: worker 指在岗的人 */
  const checkEffects = (file: string, effs: readonly Effect[], where: string, worker = false) =>
    effs.forEach((e, i) => {
      const w = `${where}[${i}]`;
      checkCond(file, e.if, w);
      checkExpr(file, e.chance, `${w}.chance`);
      if ('stat' in e) {
        if (!stats.has(e.stat)) err(file, `${w}: unknown stat '${e.stat}'`);
        checkExpr(file, 'add' in e ? e.add : e.set, w);
      }
      if ('facility' in e) {
        const f = facilities.get(e.facility);
        if (!f) err(file, `${w}: unknown facility '${e.facility}'`);
        else if (!(e.set in f.states)) err(file, `${w}: facility '${e.facility}' has no state '${e.set}'`);
      }
      if ('condition' in e) {
        if (!facilities.has(e.condition)) err(file, `${w}: unknown facility '${e.condition}'`);
        checkExpr(file, e.add, w);
      }
      if ('schedule' in e && !cards.has(e.schedule)) err(file, `${w}: unknown card '${e.schedule}'`);
      if ('activity' in e && !activities.has(e.activity)) err(file, `${w}: unknown activity '${e.activity}'`);
      for (const k of ['hire', 'fire', 'person', 'errand'] as const) {
        const who = (e as unknown as Record<string, string>)[k];
        if (!(k in e) || people.has(who as string)) continue;
        if (k === 'person' && who === WORKER) {
          if (!worker) err(file, `${w}: 'person: ${WORKER}' only works in post and order effects`);
          continue;
        }
        err(file, `${w}: unknown person '${who}'`);
      }
      if ('person' in e) for (const v of Object.values(e.add)) checkExpr(file, v, w);
      if ('errand' in e) {
        if (!anchors.has(e.at)) err(file, `${w}: unknown anchor '${e.at}'`);
        minutes(e.for);
      }
      if ('task' in e) {
        if (!people.has(e.who)) err(file, `${w}: unknown person '${e.who}'`);
        if (!b.orders.some((o) => o.id === e.task)) err(file, `${w}: unknown order '${e.task}'`);
      }
      if ('route' in e) {
        const r = routeSlots.get(e.route);
        if (!r) err(file, `${w}: unknown route slot '${e.route}'`);
        else if (!r.has(e.set)) err(file, `${w}: route slot '${e.route}' has no route '${e.set}'`);
      }
      if ('build' in e) {
        const v = plotDefs.get(e.plot);
        if (!v) err(file, `${w}: unknown plot '${e.plot}'`);
        else if (!v.has(e.build)) err(file, `${w}: plot '${e.plot}' has no variant '${e.build}'`);
      }
      if ('log' in e) needText(file, e.log);
      if ('endAct' in e) {
        needText(file, `endings.${e.ending}.title`);
        needText(file, `endings.${e.ending}.body`);
      }
    });

  /* ---------- 卡 ---------- */
  for (const c of b.cards) {
    const file = `events/${c.act}/${c.id}.yaml`;
    const a = acts.get(c.act);
    if (!a) err(file, `unknown act '${c.act}'`);
    const actAnchors = new Set(a?.anchors ?? []);
    if (!actAnchors.has(c.location)) err(file, `location: unknown anchor '${c.location}'`);
    if (c.stage && !actAnchors.has(c.stage.anchor)) err(file, `stage.anchor: unknown anchor '${c.stage.anchor}'`);
    if ((c.source === 'threshold' || c.source === 'random') && !c.when)
      err(file, `${c.source} cards need a 'when' condition`);
    checkCond(file, c.when, 'when');
    checkExpr(file, c.weight, 'weight');
    const keys = OPTION_KEYS.filter((k) => c.options[k]);
    if (!keys.length) err(file, 'a card needs at least one option');
    if (c.countdown && !c.default) err(file, 'a card with a countdown needs a default outcome');
    if (c.countdown) minutes(c.countdown);
    if (c.default?.then && !c.options[c.default.then]) err(file, `default.then: no option '${c.default.then}'`);
    checkEffects(file, c.default?.extra ?? [], 'default.extra');
    needText(file, `events.${c.id}.title`);
    needText(file, `events.${c.id}.body`);
    if (c.who && !people.has(c.who)) {
      needText(file, `who.${c.who}.name`);
      needText(file, `who.${c.who}.role`);
    } else if (c.who) needText(file, `roles.${people.get(c.who)?.role}`);
    const seen = new Map<string, string>();
    for (const k of keys) {
      const o = c.options[k];
      if (!o) continue;
      const w = `options.${k}`;
      needText(file, `events.${c.id}.options.${k}`);
      checkCond(file, o.requires, `${w}.requires`);
      if (o.errand && !actAnchors.has(o.errand.at)) err(file, `${w}.errand.at: unknown anchor '${o.errand.at}'`);
      if (o.check && 'stat' in o.check && !stats.has(o.check.stat)) err(file, `${w}.check: unknown stat`);
      if (o.check && 'chance' in o.check) checkExpr(file, o.check.chance, `${w}.check`);
      if (o.check && !o.onSuccess.length && !o.onFail.length)
        warn(file, `${w}: has a check but no onSuccess/onFail effects`);
      checkEffects(file, o.effects, `${w}.effects`);
      checkEffects(file, o.onSuccess, `${w}.onSuccess`);
      checkEffects(file, o.onFail, `${w}.onFail`);
      // 玩法准则 2：选了以后玩家什么也看不到（只改了暗处的标记）的选项，是一个哑选项
      const all = [...o.effects, ...o.onSuccess, ...o.onFail];
      if (all.length && all.every((e) => 'flag' in e) && !o.cost)
        warn(
          file,
          `${w}: only sets hidden flags; the player sees no result (tenet 2: every option gains and costs something)`,
        );
      const sig = stableStringify({ e: o.effects, s: o.onSuccess, f: o.onFail, c: o.cost, k: o.check, r: o.errand });
      const dup = seen.get(sig);
      if (dup && keys.length > 1)
        warn(file, `options ${dup} and ${k} have identical effects (not an interesting choice)`);
      seen.set(sig, k);
    }
  }

  /* ---------- 活动、人物、导演 ---------- */
  for (const a of b.activities) {
    const file = `activities/${a.id}.yaml`;
    if (!anchors.has(a.anchor)) err(file, `anchor: unknown anchor '${a.anchor}'`);
    minutes(a.duration);
    checkEffects(file, a.effects, 'effects');
    needText(file, `activities.${a.id}.title`);
  }

  /* ---------- 岗位和工单 ---------- */
  for (const x of [...b.posts.map((p) => ['posts', p] as const), ...b.orders.map((o) => ['orders', o] as const)]) {
    const [dir, a] = x;
    const file = `${dir}/${a.id}.yaml`;
    const ac = acts.get(a.act);
    if (!ac) err(file, `unknown act '${a.act}'`);
    else if (!ac.anchors.includes(a.at)) err(file, `at: unknown anchor '${a.at}'`);
    checkCond(file, a.when, 'when');
    checkEffects(file, a.effects, 'effects', true);
    for (const k of a.only ?? [])
      if (!(PERSON_KINDS as readonly string[]).includes(k) && !traits.has(k))
        err(file, `only: '${k}' is neither a person kind nor a trait`);
    if (a.only && !b.people.some((p) => p.kind && a.only?.some((k) => k === p.kind || p.traits.includes(k))))
      warn(file, `only: nobody in people/ can take this ${dir === 'posts' ? 'post' : 'order'}`);
    needText(file, `${dir}.${a.id}.title`);
    needText(file, `${dir}.${a.id}.note`);
    if (dir === 'posts') {
      const p = a as z.infer<typeof post>;
      minutes(p.cycle);
      if (p.hours && p.hours[0] >= p.hours[1]) err(file, 'hours: start must be before end');
      if (!p.effects.length && !p.restore) warn(file, 'post has no effects and restores nothing');
      if (p.restore && !b.facilities.some((f) => f.anchor === p.at)) err(file, 'restore: no facility at this anchor');
      for (const [k, v] of Object.entries(p.worker ?? {}))
        if (v !== undefined && (v < 0 || v > 100)) err(file, `worker.${k}: ${v} is outside 0..100`);
    } else {
      const o = a as z.infer<typeof order>;
      minutes(o.work);
      if (o.check && 'stat' in o.check && !stats.has(o.check.stat)) err(file, 'check: unknown stat');
      if (o.check && 'chance' in o.check) checkExpr(file, o.check.chance, 'check');
      checkEffects(file, o.onSuccess, 'onSuccess', true);
      checkEffects(file, o.onFail, 'onFail', true);
      if (o.restore && !b.facilities.some((f) => f.anchor === o.at)) err(file, 'restore: no facility at this anchor');
      if (
        !o.effects.length &&
        !o.onSuccess.length &&
        !o.restore &&
        !o.upgrade &&
        !o.remodel &&
        !o.variants &&
        !tournamentOrders.has(o.id) &&
        !clearanceOrders.has(o.id)
      )
        warn(file, 'order has no effects');
      // 修复变体、升级、改造（LG-14）：都落在这个地点的设施上
      const kinds = [o.variants, o.upgrade, o.remodel].filter((x) => x !== undefined).length;
      if (kinds > 1) err(file, 'an order is at most one of: variants, upgrade, remodel');
      const fac = b.facilities.find((f) => f.anchor === o.at);
      if (kinds && !fac) err(file, 'variants/upgrade/remodel: no facility at this anchor');
      if (o.variants && fac) {
        if (!Object.keys(o.variants).length) err(file, 'variants: list at least one variant');
        for (const [v, x] of Object.entries(o.variants)) {
          if (!fac.variants || !(v in fac.variants)) err(file, `variants: facility '${fac.id}' has no variant '${v}'`);
          if (x.work) minutes(x.work);
          checkEffects(file, x.effects ?? [], `variants.${v}.effects`, true);
          checkCond(file, x.when, `variants.${v}.when`);
        }
      }
      if (o.upgrade && fac && !(o.upgrade in (fac.upgrades ?? {})))
        err(file, `upgrade: facility '${fac.id}' has no upgrade '${o.upgrade}'`);
      if (o.remodel && fac && !(o.remodel in (fac.variants ?? {})))
        err(file, `remodel: facility '${fac.id}' has no variant '${o.remodel}'`);
      if (o.closed_for) {
        minutes(o.closed_for);
        if (!o.remodel) warn(file, 'closed_for only matters on a remodel order');
      }
      for (const [k, v] of Object.entries(o.worker ?? {}))
        if (v !== undefined && (v < 0 || v > 100)) err(file, `worker.${k}: ${v} is outside 0..100`);
      checkExpr(file, o.min_crew, 'min_crew');
      if (typeof o.min_crew === 'number' && o.min_crew > o.crew)
        err(file, `min_crew ${o.min_crew} is more than crew ${o.crew}`);
      // 分期筹备（W2）：每一期只做一次，文案 prep.<组>
      if (o.prep) {
        if (o.cooldown) warn(file, 'prep orders are done once; cooldown is ignored');
        needText(file, `prep.${o.prep}`);
      }
    }
  }
  for (const p of b.people) {
    for (const t of p.traits) if (!traits.has(t)) err('people/', `${p.id}: unknown trait '${t}'`);
    if (p.id === WORKER) err('people/', `'${WORKER}' is reserved for "the person on this post"`);
    // 招聘日的人要有作用和一句话背景（docs/design/people.md：让玩家记住一个人）
    if (p.role === 'candidate') {
      if (!p.kind) err('people/', `${p.id}: candidates need a kind (${PERSON_KINDS.join(', ')})`);
      needText('people/', `bios.${p.id}`);
    }
    if (p.kind === 'player' && !p.play) warn('people/', `${p.id}: a player with play 0`);
    // 潜力（W3）：低于起始值的那一项永远不涨，多半是写错了
    for (const [k, v] of Object.entries(p.potential ?? {})) {
      const start = k === 'teach' ? p.skill : (p as unknown as Record<string, number>)[k];
      if (v !== undefined && start !== undefined && v < start)
        warn('people/', `${p.id}: potential.${k} ${v} is below the starting value ${start}`);
    }
  }
  for (const k of PERSON_KINDS) needText('people/', `kinds.${k}`);
  for (const t of b.traits) {
    needText('traits.yaml', `traits.${t.id}.name`);
    checkCond('traits.yaml', t.when, `${t.id}.when`);
  }
  for (const s of b.stats) needText('stats.yaml', `stats.${s.id}`);
  for (const f of b.facilities) {
    if (!anchors.has(f.anchor)) err('facilities.yaml', `${f.id}: unknown anchor '${f.anchor}'`);
    // 变体和升级（LG-14）：覆盖和加成只能落在已有的状态上；文案 variants.<设施>.<变体>、upgrades.<设施>.<升级>
    for (const [v, x] of Object.entries(f.variants ?? {})) {
      needText('facilities.yaml', `variants.${f.id}.${v}`);
      for (const [st, o] of Object.entries(x.states ?? {})) {
        if (!(st in f.states)) err('facilities.yaml', `${f.id}.variants.${v}: unknown state '${st}'`);
        if (o.drops_to && !(o.drops_to in f.states))
          err('facilities.yaml', `${f.id}.variants.${v}.${st}: drops_to unknown state '${o.drops_to}'`);
      }
    }
    for (const [u, x] of Object.entries(f.upgrades ?? {})) {
      needText('facilities.yaml', `upgrades.${f.id}.${u}`);
      if (x.variant && !(x.variant in (f.variants ?? {})))
        err('facilities.yaml', `${f.id}.upgrades.${u}: no variant '${x.variant}'`);
      for (const st of Object.keys(x.states ?? {}))
        if (!(st in f.states)) err('facilities.yaml', `${f.id}.upgrades.${u}: unknown state '${st}'`);
      if (!b.orders.some((o) => o.upgrade === u && o.at === f.anchor))
        warn('facilities.yaml', `${f.id}.upgrades.${u}: no order installs it`);
    }
    for (const st of Object.keys(f.states)) needText('facilities.yaml', `facilities.${f.id}.${st}`);
    // 掉档（准则 6）：drops_to 指向同一设施的另一个状态；顺着掉下去不能绕回来；
    // 掉到的状态要有一张工单能把它修回来（不然掉一次就永远关着）
    for (const [st, x] of Object.entries(f.states)) {
      if (!x.drops_to) continue;
      if (!(x.drops_to in f.states)) err('facilities.yaml', `${f.id}.${st}: drops_to unknown state '${x.drops_to}'`);
      else if (x.drops_to === st) err('facilities.yaml', `${f.id}.${st}: drops_to itself`);
      if (!x.decay_day) warn('facilities.yaml', `${f.id}.${st}: has drops_to but no decay_day, so it never drops`);
      const seen = new Set([st]);
      for (let cur: string | undefined = x.drops_to; cur; cur = f.states[cur]?.drops_to) {
        if (seen.has(cur)) {
          err('facilities.yaml', `${f.id}.${st}: drops_to loops back to '${cur}'`);
          break;
        }
        seen.add(cur);
      }
      const mentions = (c: Cond | undefined, state: string): boolean =>
        !!c &&
        ('all' in c
          ? c.all.some((y) => mentions(y, state))
          : 'any' in c
            ? c.any.some((y) => mentions(y, state))
            : 'facility' in c && c.facility === f.id && c.is === state);
      const back = b.orders.some(
        (o) =>
          mentions(o.when, x.drops_to as string) &&
          [...o.effects, ...o.onSuccess].some((e) => 'facility' in e && e.facility === f.id && e.set !== x.drops_to),
      );
      if (x.drops_to in f.states && !back)
        err('facilities.yaml', `${f.id}.${st}: no order brings '${f.id}' back from '${x.drops_to}'`);
    }
  }
  for (const d of b.directors) {
    const file = `directors/${d.id}.yaml`;
    checkExpr(file, d.pressure, 'pressure');
    for (const [k, v] of Object.entries(d.weights)) checkExpr(file, v, `weights.${k}`);
  }

  /* ---------- 地块（W5，LG-15） ---------- */
  /**
   * 每块地的每个变体走一遍：锚点在地图里、直接连着旧的地点（地块的锚点只当终点，不当中转站）、
   * 不当旧地点之间的近路（导航只加不挪）、清理工单和开出来的岗位都在这块地或者旧地点上。
   * 路断不断在岛边是画面的事（game.test 按 Site 的折线查）。
   */
  const checkPlots = (file: string, a: Act) => {
    const plots = a.plots ?? [];
    if (!plots.length) return;
    const aAnchors = new Set(a.anchors);
    const plotAnchor = new Map<string, string>();
    for (const p of plots) for (const v of Object.values(p.variants)) plotAnchor.set(v.anchor, p.id);
    const base = a.anchors.filter((n) => !plotAnchor.has(n));
    const edge = new Map<string, number>();
    for (const [x, y, m] of a.nav) {
      const k = x < y ? `${x}|${y}` : `${y}|${x}`;
      if (edge.has(k)) err(file, `nav: duplicate edge ${x}–${y}`);
      edge.set(k, m);
    }
    const mins = (x: string, y: string) => edge.get(x < y ? `${x}|${y}` : `${y}|${x}`);
    const ids = new Set<string>();
    const used = new Map<string, string>();
    const tOrders = new Set((a.tournaments ?? []).map((t) => t.order));
    const facilityAnchors = new Set(b.facilities.map((f) => f.anchor));
    for (const p of plots) {
      const w = `plots '${p.id}'`;
      if (ids.has(p.id)) err(file, `${w}: duplicate plot id`);
      ids.add(p.id);
      const routes = a.routes?.[p.route];
      if (!routes) err(file, `${w}.route: unknown route slot '${p.route}'`);
      if (!Object.keys(p.variants).length) err(file, `${w}: needs at least one variant`);
      const avg: number[] = [];
      for (const [vid, v] of Object.entries(p.variants)) {
        const wv = `${w}.variants.${vid}`;
        if (routes && !routes.includes(vid)) err(file, `${wv}: route slot '${p.route}' has no route '${vid}'`);
        if (!aAnchors.has(v.anchor)) {
          err(file, `${wv}.anchor: '${v.anchor}' is not in anchors (new places stay in content from the start)`);
          continue;
        }
        if (plotAnchor.get(v.anchor) !== p.id) err(file, `${wv}.anchor: '${v.anchor}' is used by another plot`);
        if (facilityAnchors.has(v.anchor)) err(file, `${wv}.anchor: '${v.anchor}' already has a facility`);
        if (a.people.some((x) => x.at === v.anchor)) err(file, `${wv}.anchor: someone starts on '${v.anchor}'`);
        // 走得到：直接连着旧的地点（地块的锚点不当中转站），分钟数是正的
        const links = base.map((n) => mins(n, v.anchor));
        if (!links.some((m) => m !== undefined))
          err(file, `${wv}.anchor: '${v.anchor}' has no nav edge to an existing place`);
        const known = links.filter((m): m is number => m !== undefined);
        if (known.length) avg.push(known.reduce((x, y) => x + y, 0) / known.length);
        // 导航只加不挪：新地不能成为两个旧地点之间的近路
        for (const [i, x] of base.entries())
          for (const y of base.slice(i + 1)) {
            const direct = mins(x, y);
            const mx = mins(x, v.anchor);
            const my = mins(v.anchor, y);
            if (direct !== undefined && mx !== undefined && my !== undefined && mx + my < direct - 1)
              err(file, `${wv}: going ${x} → ${v.anchor} → ${y} (${mx + my} min) beats the old path (${direct} min)`);
          }
        if (v.orders.length < 3 || v.orders.length > 5)
          warn(file, `${wv}.orders: ${v.orders.length} clearance orders (the design asks for 3–5)`);
        const placed = (kind: string, at: string, tid: string) => {
          if (at !== v.anchor && plotAnchor.has(at))
            err(file, `${wv}.${kind}: '${tid}' is at '${at}', another plot's place`);
        };
        for (const oid of v.orders) {
          const o = b.orders.find((x) => x.id === oid);
          if (!o) {
            err(file, `${wv}.orders: unknown order '${oid}'`);
            continue;
          }
          if (o.act !== a.id) err(file, `${wv}.orders: '${oid}' belongs to act '${o.act}'`);
          if (used.has(oid)) err(file, `${wv}.orders: '${oid}' is already used by ${used.get(oid)}`);
          used.set(oid, wv);
          if (tOrders.has(oid)) err(file, `${wv}.orders: '${oid}' is a tournament's order`);
          if (o.cooldown) warn(file, `${wv}.orders: clearance orders are done once; '${oid}' cooldown is ignored`);
          placed('orders', o.at, oid);
        }
        for (const pid of v.opens.posts) {
          const post = b.posts.find((x) => x.id === pid);
          if (!post) err(file, `${wv}.opens.posts: unknown post '${pid}'`);
          else {
            if (post.act !== a.id) err(file, `${wv}.opens.posts: '${pid}' belongs to act '${post.act}'`);
            placed('opens.posts', post.at, pid);
          }
          if (used.has(pid)) err(file, `${wv}.opens.posts: '${pid}' is already used by ${used.get(pid)}`);
          used.set(pid, wv);
        }
        for (const oid of v.opens.orders) {
          const o = b.orders.find((x) => x.id === oid);
          if (!o) err(file, `${wv}.opens.orders: unknown order '${oid}'`);
          else {
            if (o.act !== a.id) err(file, `${wv}.opens.orders: '${oid}' belongs to act '${o.act}'`);
            placed('opens.orders', o.at, oid);
          }
          if (used.has(oid)) err(file, `${wv}.opens.orders: '${oid}' is already used by ${used.get(oid)}`);
          used.set(oid, wv);
        }
        checkEffects(file, v.start, `${wv}.start`);
        checkEffects(file, v.opens.effects, `${wv}.opens.effects`);
      }
      // ADR 0021：同一块地的各个变体，到旧地点的平均步行分钟差在 ±10% 以内（只提醒，平衡交给机器人）
      if (avg.length > 1) {
        const lo = Math.min(...avg);
        const hi = Math.max(...avg);
        if (hi > lo * 1.1)
          warn(
            file,
            `${w}: variants differ in average walk (${lo.toFixed(0)}–${hi.toFixed(0)} min, more than ±10%); check the bots`,
          );
      }
    }
  };

  /* ---------- 幕 ---------- */
  for (const a of b.acts) {
    const file = `acts/${a.id}.yaml`;
    const aAnchors = new Set(a.anchors);
    for (const [k, v] of Object.entries(a.stats)) {
      const s = stats.get(k);
      if (!s) err(file, `stats: unknown stat '${k}'`);
      else if (v < s.min || v > s.max) err(file, `stats.${k}: ${v} is outside ${s.min}..${s.max}`);
    }
    for (const [k, v] of Object.entries(a.facilities)) {
      const f = facilities.get(k);
      if (!f) err(file, `facilities: unknown facility '${k}'`);
      else if (!(v in f.states)) err(file, `facilities.${k}: no state '${v}'`);
    }
    for (const p of a.people) {
      if (!people.has(p.id)) err(file, `people: unknown person '${p.id}'`);
      if (!aAnchors.has(p.at)) err(file, `people.${p.id}: unknown anchor '${p.at}'`);
      if (p.job) {
        const t = b.posts.find((x) => x.id === p.job) ?? b.orders.find((x) => x.id === p.job);
        if (!t) err(file, `people.${p.id}.job: unknown post or order '${p.job}'`);
        else if (t.at !== p.at) err(file, `people.${p.id}.job: '${p.job}' is at '${t.at}', not '${p.at}'`);
      }
    }
    if (a.people.filter((p) => p.head_coach).length > 1) err(file, 'only one head coach at the start');
    const boss = a.people.filter((p) => people.get(p.id)?.role === 'director');
    if (boss.length !== 1) err(file, 'people: exactly one person with role director');
    const start = boss[0]?.at ?? a.anchors[0] ?? '';
    for (const k of Object.keys(a.condition)) if (!facilities.has(k)) err(file, `condition: unknown facility '${k}'`);
    for (const [x, y] of a.nav) for (const n of [x, y]) if (!aAnchors.has(n)) err(file, `nav: unknown anchor '${n}'`);
    // 导航图必须连通：总监要能走到每个锚点
    const adj = new Map<string, string[]>();
    for (const [x, y] of a.nav) {
      adj.set(x, [...(adj.get(x) ?? []), y]);
      adj.set(y, [...(adj.get(y) ?? []), x]);
    }
    const reach = new Set([start]);
    const q = [start];
    while (q.length) for (const n of adj.get(q.shift() as string) ?? []) if (!reach.has(n) && reach.add(n)) q.push(n);
    for (const n of a.anchors) if (!reach.has(n)) err(file, `nav: anchor '${n}' cannot be reached`);
    for (const c of a.start_cards) if (!cards.has(c)) err(file, `start_cards: unknown card '${c}'`);
    for (const c of a.calendar) if (!cards.has(c.card)) err(file, `calendar: unknown card '${c.card}'`);
    for (const d of a.daily) {
      if (!activities.has(d.activity)) err(file, `daily: unknown activity '${d.activity}'`);
      checkCond(file, d.if, 'daily.if');
    }
    for (const n of a.anchors) needText(file, `anchors.${n}`);
    // 季节、天气、日程
    if (a.seasons.length && a.seasons[0]?.from_day !== 1) err(file, 'seasons: the first season must start on day 1');
    for (const s of a.seasons) {
      needText(file, `seasons.${s.id}`);
      if (Object.keys(a.weather).length && !a.weather[s.id]) err(file, `weather: no weights for season '${s.id}'`);
    }
    for (const k of Object.keys(a.weather))
      if (!a.seasons.some((s) => s.id === k)) err(file, `weather: unknown season '${k}'`);
    if (!directors.has(a.director_config)) err(file, `director_config: unknown director '${a.director_config}'`);
    for (const k of ['member_drift', 'reputation_drift'] as const) checkExpr(file, a.rules[k], `rules.${k}`);
    if (typeof a.rules.quality_target === 'string') checkExpr(file, a.rules.quality_target, 'rules.quality_target');
    else
      for (const [t, v] of Object.entries(a.rules.quality_target)) {
        checkExpr(file, v, `rules.quality_target.${t}`);
        needText(file, `ui.terms.${t}`);
      }
    if (a.rules.week) {
      for (const [t, v] of Object.entries(a.rules.week.reputation)) {
        checkExpr(file, v, `rules.week.reputation.${t}`);
        needText(file, `ui.terms.${t}`);
      }
      checkExpr(file, a.rules.week.members, 'rules.week.members');
      checkExpr(file, a.rules.week.member_cap, 'rules.week.member_cap');
      checkExpr(file, a.rules.week.member_loss_max, 'rules.week.member_loss_max');
    }
    for (const [k, v] of Object.entries(a.rules.derived)) {
      if (!stats.has(k)) err(file, `rules.derived: unknown stat '${k}'`);
      checkExpr(file, v, `rules.derived.${k}`);
    }
    for (const [k, terms] of Object.entries(a.rules.derived_terms)) {
      if (!stats.has(k)) err(file, `rules.derived_terms: unknown stat '${k}'`);
      if (k in a.rules.derived) err(file, `rules.derived_terms: '${k}' is also in rules.derived`);
      for (const [t, v] of Object.entries(terms)) {
        checkExpr(file, v, `rules.derived_terms.${k}.${t}`);
        needText(file, `ui.terms.${t}`);
      }
    }
    checkExpr(file, a.rules.vote_odds, 'rules.vote_odds');
    // 星级（LG-10）：每一星一张清单，每条一个条件
    for (const [i, lv] of (a.stars ?? []).entries()) {
      if (!Object.keys(lv.requires).length) err(file, `stars[${i}]: requires needs at least one item`);
      for (const [k, c] of Object.entries(lv.requires)) {
        checkCond(file, c, `stars[${i}].requires.${k}`);
        needText(file, `stars.items.${k}`);
      }
      for (const k of lv.opens) needText(file, `stars.opens.${k}`);
      if (lv.card && !cards.has(lv.card)) err(file, `stars[${i}].card: unknown card '${lv.card}'`);
    }
    // 选路（W2）：每一处的每条路要有文案
    for (const [k, v] of Object.entries(a.routes ?? {})) {
      if (new Set(v).size !== v.length) err(file, `routes.${k}: duplicate route`);
      for (const r of v) needText(file, `routes.${k}.${r}`);
    }
    // 赛事日历（LG-11）
    const tids = new Set<string>();
    const tOrders = new Set<string>();
    for (const [i, t] of (a.tournaments ?? []).entries()) {
      const w = `tournaments[${i}] '${t.id}'`;
      if (tids.has(t.id)) err(file, `${w}: duplicate tournament id`);
      tids.add(t.id);
      if (!aAnchors.has(t.at)) err(file, `${w}.at: unknown anchor '${t.at}'`);
      if (!t.weeks === !t.every) err(file, `${w}: give exactly one of weeks or every`);
      if (t.hours[0] >= t.hours[1]) err(file, `${w}.hours: start must be before end`);
      if (t.hours[0] < a.hours.open || t.hours[1] > a.hours.close)
        err(file, `${w}.hours: must be inside opening hours ${a.hours.open}–${a.hours.close}`);
      minutes(t.lead);
      const o = b.orders.find((x) => x.id === t.order);
      if (!o) err(file, `${w}.order: unknown order '${t.order}'`);
      else {
        if (o.act !== a.id) err(file, `${w}.order: '${t.order}' belongs to act '${o.act}'`);
        if (o.at !== t.at) err(file, `${w}.order: '${t.order}' is at '${o.at}', not '${t.at}'`);
        if (tOrders.has(o.id)) err(file, `${w}.order: '${o.id}' is already another tournament's order`);
        if (o.cooldown || o.once)
          warn(file, `${w}.order: the calendar decides when '${o.id}' shows; cooldown/once are ignored`);
        if (t.fee && o.cost) warn(file, `${w}: both fee and order cost are set; the fee wins`);
        tOrders.add(o.id);
      }
      for (const p of t.posts) {
        const post = b.posts.find((x) => x.id === p);
        if (!post) err(file, `${w}.posts: unknown post '${p}'`);
        else if (!post.hours) err(file, `${w}.posts: temporary post '${p}' needs hours`);
      }
      if (t.kind === 'away' && t.posts.length) err(file, `${w}: away tournaments have no temporary posts`);
      for (const p of t.closes) if (!b.posts.some((x) => x.id === p)) err(file, `${w}.closes: unknown post '${p}'`);
      checkCond(file, t.when, `${w}.when`);
      checkEffects(file, t.reward, `${w}.reward`);
      const goals = [...t.goals, ...(t.repeat.goals ?? [])];
      const gids = new Set<string>();
      for (const g of goals) {
        checkExpr(file, g.if, `${w}.goals.${g.id}.if`);
        checkExpr(file, g.chance, `${w}.goals.${g.id}.chance`);
        checkEffects(file, g.reward, `${w}.goals.${g.id}.reward`);
        if (!gids.has(g.id)) needText(file, `tournaments.${t.id}.goals.${g.id}`);
        gids.add(g.id);
      }
      if (t.variant_of) {
        const f = facilities.get(t.variant_of);
        if (!f?.variants) err(file, `${w}.variant_of: facility '${t.variant_of}' has no variants`);
        else for (const v of Object.keys(f.variants)) needText(file, `tournaments.${t.id}.variants.${v}`);
      }
      needText(file, `tournaments.${t.id}.title`);
    }
    checkPlots(file, a);
    // 员工成长（W3）
    if (a.growth) {
      for (const t of Object.keys(a.growth.traits))
        if (!traits.has(t)) err(file, `growth.traits: unknown trait '${t}'`);
      const keys = new Set<string>();
      for (const [i, u] of a.growth.unlocks.entries()) {
        const w = `growth.unlocks[${i}] '${u.key}'`;
        if (keys.has(u.key)) err(file, `${w}: duplicate unlock key`);
        keys.add(u.key);
        for (const n of u.need)
          if (n.who && !isTag(n.who)) err(file, `${w}.need: who '${n.who}' is neither a person kind nor a trait`);
        checkCond(file, u.when, `${w}.when`);
        checkEffects(file, u.effects, `${w}.effects`, true);
        needText(file, `unlocks.${u.key}`);
      }
    }
    // 结局（W4，LG-13）
    if (a.ending) {
      const en = a.ending;
      checkCond(file, en.exhibition, 'ending.exhibition');
      if (en.card && !cards.has(en.card)) err(file, `ending.card: unknown card '${en.card}'`);
      if (!Object.keys(en.score).length) err(file, 'ending.score: needs at least one item');
      for (const [k, v] of Object.entries(en.score)) {
        checkExpr(file, v.of, `ending.score.${k}`);
        needText(file, `ending.items.${k}`);
      }
      const gs = en.grades.map((g) => g.grade);
      if (new Set(gs).size !== gs.length) err(file, 'ending.grades: duplicate grade');
      for (let i = 1; i < en.grades.length; i++)
        if ((en.grades[i]?.gte ?? 0) > (en.grades[i - 1]?.gte ?? 0))
          err(file, 'ending.grades: list grades from the highest threshold down');
      for (const g of gs) needText(file, `ending.grades.${g}`);
      needText(file, `ending.goals.${en.season2.goal}`);
      for (const c of en.season2.start_cards)
        if (!cards.has(c)) err(file, `ending.season2.start_cards: unknown card '${c}'`);
      needText(file, 'endings.score.title');
      needText(file, 'endings.score.body');
    }
    if (a.rules.lose_if) {
      checkCond(file, a.rules.lose_if.when, 'rules.lose_if');
      needText(file, `endings.${a.rules.lose_if.ending}.title`);
      needText(file, `endings.${a.rules.lose_if.ending}.body`);
    }
  }

  /* ---------- 标记：只被读、从未被写，多半是拼错了 ---------- */
  for (const [f, file] of flagReads) if (!flagWrites.has(f)) warn(file, `flag '${f}' is read but never written`);

  /* ---------- 从来不会出现的卡 ---------- */
  const reachable = new Set<string>();
  for (const a of b.acts) {
    for (const c of a.start_cards) reachable.add(c);
    for (const c of a.calendar) reachable.add(c.card);
  }
  for (const c of b.cards) if (c.source === 'threshold' || c.source === 'random') reachable.add(c.id);
  const scheduleTargets = (effs: readonly Effect[]) => {
    for (const e of effs) if ('schedule' in e) reachable.add(e.schedule);
  };
  for (const c of b.cards) {
    for (const o of Object.values(c.options))
      if (o) for (const effs of [o.effects, o.onSuccess, o.onFail]) scheduleTargets(effs);
    scheduleTargets(c.default?.extra ?? []);
  }
  for (const a of b.activities) scheduleTargets(a.effects);
  for (const a of b.posts) scheduleTargets(a.effects);
  for (const a of b.orders) for (const effs of orderEffects(a)) scheduleTargets(effs);
  for (const t of allTournaments) for (const effs of tournamentEffects(t)) scheduleTargets(effs);
  for (const a of b.acts) for (const lv of a.stars ?? []) if (lv.card) reachable.add(lv.card);
  for (const a of b.acts) {
    if (a.ending?.card) reachable.add(a.ending.card);
    for (const c of a.ending?.season2.start_cards ?? []) reachable.add(c);
  }
  for (const c of b.cards)
    if (!reachable.has(c.id)) warn(`events/${c.act}/${c.id}.yaml`, `card '${c.id}' is never scheduled by anything`);

  /* ---------- 各语言的键对齐：一种语言有、另一种没有的文案 ---------- */
  const allKeys = new Set(langs.flatMap((l) => Object.keys(b.i18n[l] ?? {})));
  for (const l of langs) {
    const missing = [...allKeys].filter((k) => !(k in (b.i18n[l] ?? {})));
    if (missing.length)
      warn(
        `i18n/${l}.yaml`,
        `missing ${missing.length} key(s) other languages have: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ', …' : ''}`,
      );
  }

  if (errors.length) return { bundle: null, errors, warnings };
  b.version = fnv1a(stableStringify({ ...b, version: '' }));
  return { bundle: b, errors, warnings };
}

/** 把问题列表排成人读的文字（命令行和错误浮层用）。 */
export function formatIssues(issues: readonly ContentIssue[]): string {
  return issues.map((i) => `${i.file}: ${i.message}`).join('\n');
}

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
  order,
  PERSON_KINDS,
  person,
  post,
  stat,
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
  /** 状态和开局不一样的设施有几处（修好了几处，ADR 0015） */
  'restored',
  /** 本周到现在的服务率 0..1（有需求的岗位分钟里，有人在岗的比例） */
  'service_rate',
  /** 这一周（或者上一周）有没有需求：0 或 1。没有需求的一周，服务率无从谈起（GM-1） */
  'service_demand',
  /** 周结算里声望服务项的及格线（rules.week.service_pass） */
  'service_pass',
  /** 修好、能打的场地数，不管今天下不下雨（会员上限按这个算） */
  'courts_built',
] as const;
/** 设施状况变量：condition.<设施 id> = 0..100 */
export const CONDITION_VAR = /^condition\.([a-z][a-z0-9_]*)$/;
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
  for (const a of [...b.posts, ...b.orders])
    for (const effs of [a.effects, 'onSuccess' in a ? a.onSuccess : [], 'onFail' in a ? a.onFail : []])
      walkEffects(effs, (e) => {
        if ('flag' in e) flagWrites.add(e.flag);
      });

  /* ---------- 表达式 ---------- */
  const knownVar = (p: string): boolean => {
    if ((COMPUTED_VARS as readonly string[]).includes(p)) return true;
    const cv = CONDITION_VAR.exec(p);
    if (cv) return facilities.has(cv[1] as string);
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
    } else {
      const o = a as z.infer<typeof order>;
      minutes(o.work);
      if (o.check && 'stat' in o.check && !stats.has(o.check.stat)) err(file, 'check: unknown stat');
      if (o.check && 'chance' in o.check) checkExpr(file, o.check.chance, 'check');
      checkEffects(file, o.onSuccess, 'onSuccess', true);
      checkEffects(file, o.onFail, 'onFail', true);
      if (o.restore && !b.facilities.some((f) => f.anchor === o.at)) err(file, 'restore: no facility at this anchor');
      if (!o.effects.length && !o.onSuccess.length && !o.restore) warn(file, 'order has no effects');
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
  }
  for (const k of PERSON_KINDS) needText('people/', `kinds.${k}`);
  for (const t of b.traits) {
    needText('traits.yaml', `traits.${t.id}.name`);
    checkCond('traits.yaml', t.when, `${t.id}.when`);
  }
  for (const s of b.stats) needText('stats.yaml', `stats.${s.id}`);
  for (const f of b.facilities) {
    if (!anchors.has(f.anchor)) err('facilities.yaml', `${f.id}: unknown anchor '${f.anchor}'`);
    for (const st of Object.keys(f.states)) needText('facilities.yaml', `facilities.${f.id}.${st}`);
  }
  for (const d of b.directors) {
    const file = `directors/${d.id}.yaml`;
    checkExpr(file, d.pressure, 'pressure');
    for (const [k, v] of Object.entries(d.weights)) checkExpr(file, v, `weights.${k}`);
  }

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
  for (const a of b.orders) for (const effs of [a.effects, a.onSuccess, a.onFail]) scheduleTargets(effs);
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

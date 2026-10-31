import { compileExpr, fnv1a, stableStringify } from '@td/shared';
import { parse as parseYaml } from 'yaml';
import type { z } from 'zod';
import {
  type Act,
  act,
  action,
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
  person,
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
  'director.energy',
] as const;
/** 日程变量：plan.<活动 id> = 本季日程里这一项每周排了几次 */
export const PLAN_VAR = /^plan\.([a-z][a-z0-9_]*)$/;
export const PERSON_ATTRS = ['skill', 'morale', 'fatigue', 'talent', 'hired'] as const;

const ONE_PER_FILE = /^(events\/[a-z0-9_]+|activities|actions|directors|acts)\/([a-z0-9_]+)\.ya?ml$/;

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
    actions: [],
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
          : dir === 'actions'
            ? action
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
      else if (dir === 'actions') b.actions.push(v as z.infer<typeof action>);
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
  index('actions', b.actions, 'actions/');
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
  for (const a of b.actions)
    for (const effs of [a.effects, a.onSuccess, a.onFail])
      walkEffects(effs, (e) => {
        if ('flag' in e) flagWrites.add(e.flag);
      });

  /* ---------- 表达式 ---------- */
  const knownVar = (p: string): boolean => {
    if ((COMPUTED_VARS as readonly string[]).includes(p)) return true;
    const pv = PLAN_VAR.exec(p);
    if (pv) return activities.has(pv[1] as string);
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
    if ('directorAt' in c && !anchors.has(c.directorAt)) err(file, `${where}: unknown anchor '${c.directorAt}'`);
    if ('seen' in c && !cards.has(c.seen)) err(file, `${where}: unknown card '${c.seen}'`);
    if ('open' in c && !cards.has(c.open)) err(file, `${where}: unknown card '${c.open}'`);
    if ('coach' in c && c.coach !== 'none' && !people.has(c.coach)) err(file, `${where}: unknown person '${c.coach}'`);
    if ('activity' in c && !activities.has(c.activity)) err(file, `${where}: unknown activity '${c.activity}'`);
    if ('season' in c && !b.acts.some((a) => a.seasons.some((x) => x.id === c.season)))
      err(file, `${where}: unknown season '${c.season}'`);
    if ('expr' in c) checkExpr(file, c.expr, where);
  };
  const checkEffects = (file: string, effs: readonly Effect[], where: string) =>
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
      if ('schedule' in e && !cards.has(e.schedule)) err(file, `${w}: unknown card '${e.schedule}'`);
      if ('activity' in e && !activities.has(e.activity)) err(file, `${w}: unknown activity '${e.activity}'`);
      for (const k of ['hire', 'fire', 'person', 'follow'] as const)
        if (k in e && !people.has((e as unknown as Record<string, string>)[k] as string))
          err(file, `${w}: unknown person '${(e as unknown as Record<string, string>)[k]}'`);
      if ('person' in e) for (const v of Object.values(e.add)) checkExpr(file, v, w);
      if ('energy' in e) checkExpr(file, e.energy, w);
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
    const seen = new Map<string, string>();
    for (const k of keys) {
      const o = c.options[k];
      if (!o) continue;
      const w = `options.${k}`;
      needText(file, `events.${c.id}.options.${k}`);
      checkCond(file, o.requires, `${w}.requires`);
      if (o.requiresDirectorAt && !actAnchors.has(o.requiresDirectorAt))
        err(file, `${w}.requiresDirectorAt: unknown anchor '${o.requiresDirectorAt}'`);
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
      const sig = stableStringify({ e: o.effects, s: o.onSuccess, f: o.onFail, c: o.cost, k: o.check });
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
    if (a.program) {
      for (const p of a.program.parts)
        if (!b.acts.some((x) => p in x.schedule.parts)) err(file, `program.parts: unknown day part '${p}'`);
      checkCond(file, a.program.requires, 'program.requires');
    }
  }

  /* ---------- 主动经营的动作 ---------- */
  for (const a of b.actions) {
    const file = `actions/${a.id}.yaml`;
    const ac = acts.get(a.act);
    if (!ac) err(file, `unknown act '${a.act}'`);
    else if (!ac.anchors.includes(a.at)) err(file, `at: unknown anchor '${a.at}'`);
    checkCond(file, a.when, 'when');
    if (a.check && 'stat' in a.check && !stats.has(a.check.stat)) err(file, 'check: unknown stat');
    if (a.check && 'chance' in a.check) checkExpr(file, a.check.chance, 'check');
    checkEffects(file, a.effects, 'effects');
    checkEffects(file, a.onSuccess, 'onSuccess');
    checkEffects(file, a.onFail, 'onFail');
    if (!a.onsite && a.energy) warn(file, 'energy only applies to onsite actions');
    if (a.onsite && !a.energy) warn(file, 'an onsite action costs no energy (tenet 2: every choice costs something)');
    if (!a.effects.length && !a.onSuccess.length && !a.onFail.length) warn(file, 'action has no effects');
    needText(file, `actions.${a.id}.title`);
    needText(file, `actions.${a.id}.note`);
  }
  for (const p of b.people)
    for (const t of p.traits) if (!traits.has(t)) err('people/', `${p.id}: unknown trait '${t}'`);
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
    }
    if (a.people.filter((p) => p.head_coach).length > 1) err(file, 'only one head coach at the start');
    if (!aAnchors.has(a.director.at)) err(file, `director.at: unknown anchor '${a.director.at}'`);
    for (const [x, y] of a.nav) for (const n of [x, y]) if (!aAnchors.has(n)) err(file, `nav: unknown anchor '${n}'`);
    // 导航图必须连通：总监要能走到每个锚点
    const adj = new Map<string, string[]>();
    for (const [x, y] of a.nav) {
      adj.set(x, [...(adj.get(x) ?? []), y]);
      adj.set(y, [...(adj.get(y) ?? []), x]);
    }
    const reach = new Set([a.director.at]);
    const q = [a.director.at];
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
    for (const p of Object.keys(a.schedule.parts)) needText(file, `parts.${p}`);
    for (const [p, week] of Object.entries(a.schedule.start)) {
      if (!(p in a.schedule.parts)) err(file, `schedule.start: '${p}' is not in schedule.parts`);
      for (const x of week) {
        if (x === null) continue;
        const act2 = activities.get(x);
        if (!act2) err(file, `schedule.start.${p}: unknown activity '${x}'`);
        else if (!act2.program?.parts.includes(p)) err(file, `schedule.start.${p}: '${x}' cannot be scheduled then`);
      }
    }
    if (!directors.has(a.director_config)) err(file, `director_config: unknown director '${a.director_config}'`);
    for (const k of ['quality_target', 'member_drift', 'reputation_drift'] as const)
      checkExpr(file, a.rules[k], `rules.${k}`);
    for (const [k, v] of Object.entries(a.rules.derived)) {
      if (!stats.has(k)) err(file, `rules.derived: unknown stat '${k}'`);
      checkExpr(file, v, `rules.derived.${k}`);
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
  for (const a of b.actions) for (const effs of [a.effects, a.onSuccess, a.onFail]) scheduleTargets(effs);
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

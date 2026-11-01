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
  anchor(id: string): string;
  cardTitle(card: string): string;
  option(card: string, key: string): string;
  effect(e: EffectRecord): string | null;
  /** 因果日志一条的"因为"部分 */
  because(e: CausalEntry): string;
  /** 因果日志一条的"所以"部分；没有可讲的效果时返回 null */
  so(e: CausalEntry): string | null;
  clock(t: number): string;
  day(t: number): string;
  duration(min: number): string;
}

const signed = (n: number) => (n > 0 ? `+${Math.round(n * 10) / 10}` : `${Math.round(n * 10) / 10}`);

export function createText(content: ContentBundle, lang: Lang): Text {
  const table = content.i18n[lang] ?? content.i18n.en ?? {};
  const people = new Map(content.people.map((p) => [p.id, p.name]));
  const zh = lang === 'zh';
  const tr = (key: string, fallback?: string) => table[key] ?? content.i18n.en?.[key] ?? fallback ?? key;
  // 人名：文案表里有译名就用（总监、中文版的教练称呼），没有就用内容里的名字
  const personName = (id: string) => table[`people.${id}`] ?? people.get(id) ?? id;
  const cardTitle = (card: string) => tr(`events.${card}.title`, card);
  const option = (card: string, key: string) => tr(`events.${card}.options.${key}`, key);

  const duration = (min: number) => {
    const m = Math.max(0, Math.round(min));
    const h = Math.floor(m / 60);
    if (zh) return h ? (m % 60 ? `${h} 小时 ${m % 60} 分` : `${h} 小时`) : `${m} 分钟`;
    return h ? (m % 60 ? `${h}h ${String(m % 60).padStart(2, '0')}m` : `${h}h`) : `${m} min`;
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
        return tr(`facilities.${e.facility}.${e.state}`);
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
      case 'condition': {
        if (Math.abs(e.delta) < 1) return null;
        return `${tr(`ui.fac.${e.facility}`, e.facility)} ${tr('ui.condition')} ${signed(e.delta)}`;
      }
      default:
        // flag、schedule 是幕后的账，不讲给玩家
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
      case 'debug':
        return zh ? `调试：${c.what}` : `debug: ${c.what}`;
      default:
        return zh ? '开局' : 'the season started';
    }
  };

  const so = (e: CausalEntry): string | null => {
    const parts = e.effects.map(effect).filter((x): x is string => !!x);
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

  const fmt = (key: string, vars: Record<string, string | number>) =>
    tr(key).replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));

  return {
    lang,
    tr,
    fmt,
    personName,
    anchor: (id) => tr(`anchors.${id}`, id),
    cardTitle,
    option,
    effect,
    because,
    so,
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
    if (x.kind === 'end') return x.result === 'won' ? 'good' : 'bad';
  }
  return bad > good ? 'bad' : good > bad ? 'good' : undefined;
}

import { useEffect, useRef, useState } from 'preact/hooks';
import type {
  HudActions,
  SeasonInfo,
  SettlementCardData,
  SettlementPage,
  SettlementPerson,
  SettlementRow,
  SettlementSection,
} from './types';
import './settle.css';

/**
 * 每日结算卡（ADR 0024）：全屏夜色遮罩 + 一张像素风的卡。
 * 各节依次出现，钱一行一行滚进来、合计跟着跳；点卡上任何地方（或 Space / Enter）先跳到结尾，再点翻页 / 进入明天。
 * 卡上只报告，不让玩家选。动画状态放在组件里（Hud 用 key={id} 挂它：换了一天才从头播，每帧重建快照不打断）。
 */

/** 每个数滚多久、钱的行隔多久进来一行、节与节之间至少隔多久、整页最长多久（毫秒） */
const ROLL = 400;
const STAGGER = 110;
const GAP = 250;
const PAGE_MAX = 2400;
const FADE_OUT = 300;

const WX: Record<SeasonInfo['weather'], string> = {
  sun: 'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 1v3M12 20v3M1 12h3M20 12h3M4 4l2 2M18 18l2 2M4 20l2-2M18 6l2-2',
  night: 'M15 3a9 9 0 1 0 6 15.5A7.5 7.5 0 0 1 15 3z',
  cloud: 'M7 18h10a4 4 0 0 0 0-8 6 6 0 0 0-11.5 1.5A3.3 3.3 0 0 0 7 18z',
  rain: 'M7 14h10a4 4 0 0 0 0-8 6 6 0 0 0-11.5 1.5A3.3 3.3 0 0 0 7 14zM8 17l-1 3M12 17l-1 3M16 17l-1 3',
  wind: 'M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h8',
  heat: 'M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 0v1M5 7H4M20 7h-1M4 15q2-2 4 0t4 0 4 0 4 0M4 19q2-2 4 0t4 0 4 0 4 0',
};

const MINUS = '−';
const group = (n: number) => Math.round(n).toLocaleString('en-US');
const money = (n: number) => {
  const r = Math.round(n);
  return `${r < 0 ? MINUS : r > 0 ? '+' : ''}$${group(Math.abs(r))}`;
};
const signed = (n: number, digits: number) => {
  const r = Number(n.toFixed(digits));
  const s = Math.abs(r).toFixed(digits);
  return r > 0 ? `+${s}` : r < 0 ? `${MINUS}${s}` : (0).toFixed(digits);
};
const plain = (n: number, digits: number) => (digits ? n.toFixed(digits) : group(n));

/** 按 format 写一个滚动中的数 */
export function settleNumber(r: Pick<SettlementRow, 'format' | 'digits' | 'text'>, v: number): string {
  const d = r.digits ?? 0;
  switch (r.format) {
    case 'money':
      return money(v);
    case 'signed':
      return signed(v, d);
    case 'int':
      return plain(v, d);
    case 'pct':
      return `${Math.round(v)}%`;
    default:
      return r.text;
  }
}

/** 一页的时间轴：每节什么时候出现、每一行什么时候开始滚（毫秒），整页多久播完；压到 PAGE_MAX 以内 */
export function pageTimeline(p: SettlementPage): {
  sections: number[];
  rows: number[][];
  totals: (number | null)[];
  end: number;
} {
  const sections: number[] = [];
  const rows: number[][] = [];
  const totals: (number | null)[] = [];
  let cur = 0;
  let end = 0;
  for (const sec of p.sections) {
    const start = cur;
    sections.push(start);
    // 钱一行一行进来；别的节一起进来、一起滚
    const step = sec.id === 'money' || sec.id === 'week_money' ? STAGGER : 40;
    const rs = sec.rows.map((_, i) => start + 80 + i * step);
    rows.push(rs);
    const last = rs.length ? (rs[rs.length - 1] as number) : start;
    const tot = sec.total ? last + (rs.length ? 160 : 80) : null;
    totals.push(tot);
    const finish = Math.max(tot ?? last, start + (sec.groups?.length || sec.bars?.length ? 120 : 0)) + ROLL;
    end = Math.max(end, finish);
    cur = Math.max(start + GAP, finish - ROLL * 0.6);
  }
  if (end > PAGE_MAX) {
    const k = PAGE_MAX / end;
    const sc = (x: number) => x * k;
    return {
      sections: sections.map(sc),
      rows: rows.map((r) => r.map(sc)),
      totals: totals.map((x) => (x === null ? null : sc(x))),
      end: PAGE_MAX,
    };
  }
  return { sections, rows, totals, end };
}

const ease = (u: number) => 1 - (1 - u) ** 3;
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** 一个会滚的数：t 是这一页播了多久，start 是这个数开始滚的时刻；done 时直接写最终文字 */
function Roll({
  r,
  t,
  start,
  done,
  from,
  value,
}: {
  r: SettlementRow;
  t: number;
  start: number;
  done: boolean;
  from: number;
  value: number;
}) {
  if (done || r.format === 'text') return <>{settleNumber(r, value)}</>;
  const u = Math.max(0, Math.min(1, (t - start) / ROLL));
  return <>{settleNumber(r, from + (value - from) * ease(u))}</>;
}

const toneClass = (tone: SettlementRow['tone']) => (tone ? ` td-st-${tone}` : '');

function Row({
  r,
  t,
  start,
  done,
  total,
}: {
  r: SettlementRow;
  t: number;
  start: number;
  done: boolean;
  total?: boolean;
}) {
  const shown = done || t >= start;
  const rolling = !done && t >= start && t < start + ROLL && r.format !== 'text';
  const cls = `td-st-row${total ? ' td-st-total' : ''}${r.from !== undefined && r.format !== 'money' ? ' td-st-big' : ''}${shown ? ' td-st-on' : ''}${rolling ? ' td-st-rolling' : ''}${toneClass(r.tone)}`;
  // 大数一行（声望、会员）：from → value，旁边是变化
  if (r.from !== undefined && r.format !== 'money' && r.format !== 'text') {
    const d = r.digits ?? 0;
    const delta = r.value - r.from;
    const dRow: SettlementRow = { ...r, format: 'signed', text: signed(delta, d) };
    return (
      <li class={cls}>
        <span class="td-st-label">{r.label}</span>
        <span class="td-st-val">
          <span class="td-st-from">{settleNumber(r, r.from)}</span>
          <span class="td-st-arrow" aria-hidden="true">
            →
          </span>
          <b>
            <Roll r={r} t={t} start={start} done={done} from={r.from} value={r.value} />
          </b>
          <span class={`td-st-delta${delta > 0 ? ' td-st-good' : delta < 0 ? ' td-st-bad' : ''}`}>
            <Roll r={dRow} t={t} start={start} done={done} from={0} value={delta} />
          </span>
        </span>
        {r.note ? <span class="td-st-note">{r.note}</span> : null}
      </li>
    );
  }
  return (
    <li class={cls}>
      <span class="td-st-label">
        {r.icon ? (
          <svg
            class="td-st-icon"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.4"
            aria-hidden="true"
          >
            <path d={WX[r.icon]} />
          </svg>
        ) : null}
        {r.label}
      </span>
      {r.text || r.format !== 'text' ? (
        <span class="td-st-val">
          <Roll r={r} t={t} start={start} done={done} from={r.from ?? 0} value={r.value} />
        </span>
      ) : null}
      {r.note ? <span class="td-st-note">{r.note}</span> : null}
    </li>
  );
}

function Person({ p, actions }: { p: SettlementPerson; actions: HudActions }) {
  return (
    <li>
      <button
        type="button"
        class={`td-st-person${toneClass(p.tone)}`}
        aria-label={`${p.name} · ${p.note}`}
        onClick={(e) => {
          // 点人不翻页：在地图上亮一下他（卡不关）
          e.stopPropagation();
          actions.settlementPerson?.(p.id);
        }}
      >
        {p.head ? (
          <img class="td-st-head" src={p.head} alt="" width="32" height="32" />
        ) : (
          <span class="td-st-head td-st-initials" style={{ background: p.color }} aria-hidden="true">
            {p.initials}
          </span>
        )}
        <span class="td-st-name">{p.name}</span>
        <span class="td-st-pnote">{p.note}</span>
      </button>
    </li>
  );
}

function Bars({ sec, on }: { sec: SettlementSection; on: boolean }) {
  const pass = sec.pass;
  return (
    <div
      class={`td-st-bars${on ? ' td-st-on' : ''}`}
      role="img"
      aria-label={sec.bars?.map((b) => `${b.label} ${b.text}`).join(', ')}
    >
      <div class="td-st-plot">
        {pass !== undefined ? <i class="td-st-pass" style={{ bottom: `${Math.round(pass * 100)}%` }} /> : null}
        {sec.bars?.map((b, i) => (
          <span key={`${b.label}-${i}`} class="td-st-bar">
            <i
              class={b.value === null ? 'td-st-none' : pass !== undefined && b.value < pass ? 'td-st-low' : ''}
              style={{ height: on ? `${b.value === null ? 8 : Math.max(4, Math.round(b.value * 100))}%` : '0%' }}
            />
          </span>
        ))}
      </div>
      <div class="td-st-axis" aria-hidden="true">
        {sec.bars?.map((b, i) => (
          <span key={`${b.label}-${i}`}>
            <b>{b.label}</b>
            <small>{b.text}</small>
          </span>
        ))}
      </div>
    </div>
  );
}

function Section({
  sec,
  t,
  start,
  rows,
  total,
  done,
  actions,
}: {
  sec: SettlementSection;
  t: number;
  start: number;
  rows: number[];
  total: number | null;
  done: boolean;
  actions: HudActions;
}) {
  const on = done || t >= start;
  return (
    <section class={`td-st-sec td-st-sec-${sec.id}${on ? ' td-st-on' : ''}`}>
      <h3>{sec.title}</h3>
      {sec.rows.length ? (
        <ul class="td-st-rows">
          {sec.rows.map((r, i) => (
            <Row key={r.id} r={r} t={t} start={rows[i] ?? start} done={done} />
          ))}
        </ul>
      ) : null}
      {sec.total ? (
        <ul class="td-st-rows">
          <Row r={sec.total} t={t} start={total ?? start} done={done} total />
        </ul>
      ) : null}
      {sec.groups?.map((g) => (
        <div key={g.id} class={`td-st-group td-st-group-${g.id}`}>
          <h4>{g.label}</h4>
          <ul class="td-st-people">
            {g.people.map((p) => (
              <Person key={p.id} p={p} actions={actions} />
            ))}
          </ul>
        </div>
      ))}
      {sec.bars?.length ? <Bars sec={sec} on={on} /> : null}
      {sec.empty && !sec.rows.length && !sec.groups?.length && !sec.bars?.length ? (
        <p class="td-st-empty">{sec.empty}</p>
      ) : null}
    </section>
  );
}

export function SettlementCard({ c, actions }: { c: SettlementCardData; actions: HudActions }) {
  const [page, setPage] = useState(0);
  const [t0, setT0] = useState(now);
  const [t, setT] = useState(0);
  const [done, setDone] = useState(reduced);
  const [closing, setClosing] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const p = c.pages[page] ?? c.pages[0];
  const tl = p ? pageTimeline(p) : null;
  const last = page >= c.pages.length - 1;

  // 播动画：每帧记一下这一页播了多久，播完就停
  useEffect(() => {
    if (done || !tl) return;
    let raf = 0;
    const step = () => {
      const dt = now() - t0;
      if (dt >= tl.end) setDone(true);
      else {
        setT(dt);
        raf = requestAnimationFrame(step);
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [done, t0, page]);

  const advance = () => {
    if (closing) return;
    if (!done) {
      setDone(true);
      return;
    }
    if (!last) {
      setPage(page + 1);
      setT(0);
      setT0(now());
      setDone(reduced());
      scroller.current?.scrollTo?.({ top: 0 });
      return;
    }
    setClosing(true);
    setTimeout(() => actions.settlementDone?.(), reduced() ? 0 : FADE_OUT);
  };
  const ref = useRef(advance);
  ref.current = advance;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== ' ' && e.key !== 'Enter') return;
      e.preventDefault();
      e.stopPropagation();
      ref.current();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  if (!p || !tl) return null;
  const hint = !done ? c.hint.skip : last ? c.hint.done : c.pages[page + 1]?.id === 'week' ? c.hint.week : c.hint.next;
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: Space / Enter 由上面的窗口监听处理（整张卡都是"下一步"）
    <div
      class={`td-st-veil${closing ? ' td-st-closing' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={p.title}
      onClick={advance}
    >
      <div class={`td-st-card td-st-page-${p.id}`} key={`${c.id}-${page}`}>
        <header class="td-st-head-bar">
          <h2>{p.title}</h2>
          {c.pages.length > 1 ? (
            <span class="td-st-page">
              {page + 1}/{c.pages.length}
            </span>
          ) : null}
          {p.subtitle ? <p>{p.subtitle}</p> : null}
        </header>
        <div class="td-st-body" ref={scroller}>
          {p.sections.map((sec, i) => (
            <Section
              key={sec.id}
              sec={sec}
              t={t}
              start={tl.sections[i] ?? 0}
              rows={tl.rows[i] ?? []}
              total={tl.totals[i] ?? null}
              done={done}
              actions={actions}
            />
          ))}
        </div>
        <footer class="td-st-foot">
          {/* 最后一页播完：主按钮就是下一步，提示收起来（让出一行给内容） */}
          <span class={`td-st-hint${done && last ? ' td-sr' : ''}`} aria-live="polite">
            {hint}
          </span>
          {done && last ? (
            <button
              type="button"
              class="td-st-go"
              onClick={(e) => {
                e.stopPropagation();
                advance();
              }}
            >
              {c.continueLabel}
            </button>
          ) : null}
        </footer>
      </div>
    </div>
  );
}

import { render } from 'preact';
import { useState } from 'preact/hooks';
import { Chips } from '../staff/Chips';
import { PlaceSheet } from '../staff/PlaceSheet';
import { StaffBar } from '../staff/StaffBar';
import { TargetSheet } from '../staff/TargetSheet';
import { GRADE_COLOR, sparkPoints } from './format';
import { STR } from './strings';
import type { EventCardData, HudActions, HudSnapshot, SeasonInfo, StarInfo } from './types';
import './hud.css';

/**
 * HUD（参考图 Palm Oasis，2026-11-02；布局沿用 Interface Directions 方向 B）：
 * 左上标题卡（徽章、园区名、时钟和天气小牌）、右上俱乐部报告（点开看明细）、下三分之一事件卡、
 * 底部滚动的俱乐部快讯带着视角控制。
 */

const WX: Record<SeasonInfo['weather'], string> = {
  sun: 'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 1v3M12 20v3M1 12h3M20 12h3M4 4l2 2M18 18l2 2M4 20l2-2M18 6l2-2',
  night: 'M15 3a9 9 0 1 0 6 15.5A7.5 7.5 0 0 1 15 3z',
  cloud: 'M7 18h10a4 4 0 0 0 0-8 6 6 0 0 0-11.5 1.5A3.3 3.3 0 0 0 7 18z',
  rain: 'M7 14h10a4 4 0 0 0 0-8 6 6 0 0 0-11.5 1.5A3.3 3.3 0 0 0 7 14zM8 17l-1 3M12 17l-1 3M16 17l-1 3',
  wind: 'M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h8',
  // 酷热（court-care-contract.md）：太阳下面三道热浪（代理 D 可以换图）
  heat: 'M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 0v1M5 7H4M20 7h-1M4 15q2-2 4 0t4 0 4 0 4 0M4 19q2-2 4 0t4 0 4 0 4 0',
};

/** 徽章：像素棕榈（参考图 Palm Oasis） */
const Crest = () => (
  <span class="td-crest" aria-hidden="true">
    <svg viewBox="0 0 10 10" shape-rendering="crispEdges" aria-hidden="true">
      <rect x="4" y="3" width="2" height="7" fill="#d8c08a" />
      <rect x="1" y="1" width="3" height="1" fill="#7fbf6a" />
      <rect x="6" y="1" width="3" height="1" fill="#7fbf6a" />
      <rect x="2" y="2" width="6" height="1" fill="#7fbf6a" />
      <rect x="0" y="2" width="1" height="2" fill="#7fbf6a" />
      <rect x="9" y="2" width="1" height="2" fill="#7fbf6a" />
      <rect x="3" y="0" width="4" height="1" fill="#7fbf6a" />
    </svg>
  </span>
);

/** 标题卡下面的一排小牌：时钟、季节天气、本周服务率、此刻状况 */
function Chips2({
  club,
  paused,
  status,
  s,
  actions,
}: {
  club: HudSnapshot['club'];
  paused: boolean;
  status?: string | null | undefined;
  s?: SeasonInfo | undefined;
  actions?: HudActions | undefined;
}) {
  const none = s?.service === null;
  const pct = Math.max(0, Math.min(100, s?.service ?? 0));
  return (
    <div class="td-bug-status" aria-live="polite">
      <span class={`td-chip td-chip-clock${paused ? ' td-paused' : ''}`} title={paused ? STR.paused : undefined}>
        {paused ? (
          <>
            <span class="td-pause-mark" aria-hidden="true" />
            <span class="td-sr">{STR.paused}</span>
          </>
        ) : null}
        {club.clock}
      </span>
      {s ? (
        <>
          <span class="td-chip td-season" title={s.weatherLabel}>
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.4"
              aria-hidden="true"
            >
              <path d={WX[s.weather]} />
            </svg>
            {s.label}
          </span>
          <span class="td-chip td-energy" title={s.serviceLabel}>
            <span class="td-energy-bar" aria-hidden="true">
              <i style={{ width: `${pct}%` }} class={!none && pct < 50 ? 'td-low' : ''} />
            </span>
            <span class="td-sr">{s.serviceLabel}</span>
            {none ? '—' : `${Math.round(pct)}%`}
          </span>
        </>
      ) : null}
      {status ? (
        <span class="td-chip td-where" title={status}>
          {status}
        </span>
      ) : null}
      {s?.goal ? (
        <span class="td-chip td-goal" title={s.goal}>
          {s.goal}
        </span>
      ) : null}
      {s?.beats?.length ? <Beats beats={s.beats} actions={actions} /> : null}
    </div>
  );
}

/** 接下来的两个日历节拍（UI-9）：只读的小牌，点一下镜头转到那一处的地点牌（不开面板） */
function Beats({ beats, actions }: { beats: NonNullable<SeasonInfo['beats']>; actions?: HudActions | undefined }) {
  return (
    <span class="td-beats" title={STR.next}>
      {beats.map((b) => (
        <button
          type="button"
          key={b.id}
          class={`td-chip td-beat${b.live ? ' td-beat-live' : ''}`}
          title={b.full ?? `${b.label} · ${b.when}`}
          aria-label={b.full ?? `${b.label} · ${b.when}`}
          onClick={(e) => {
            actions?.beat?.(b.place);
            if (e.detail > 0) (e.currentTarget as HTMLElement).blur();
          }}
        >
          <b>{b.when}</b>
          <span>{b.label}</span>
        </button>
      ))}
    </span>
  );
}

function ScoreBug({
  club,
  paused,
  status,
  season,
  actions,
}: {
  club: HudSnapshot['club'];
  paused: boolean;
  status?: string | null | undefined;
  season?: SeasonInfo | undefined;
  actions?: HudActions | undefined;
}) {
  return (
    <header class="td-bug">
      <Crest />
      <div class="td-bug-col">
        <h1 class="td-bug-name">{club.name}</h1>
        <Chips2 club={club} paused={paused} status={status} s={season} actions={actions} />
      </div>
    </header>
  );
}

function Cell({
  value,
  label,
  extra,
  tone,
}: {
  value: string;
  label: string;
  extra?: string | undefined;
  tone?: string | undefined;
}) {
  return (
    <span class={`td-cell${tone ? ` td-cell-${tone}` : ''}`}>
      <span class="td-num">
        {value}
        {extra ? <span class="td-down"> {extra}</span> : null}
      </span>
      <span class="td-lab">{label}</span>
    </span>
  );
}

function Spark({ history }: { history: readonly number[] }) {
  // 横向拉伸铺满面板宽度；线宽不随拉伸变化。刻度和图例用 HTML 叠在旁边，不跟着拉伸变形
  const W = 260;
  const H = 64;
  const y = (v: number) => H - 4 - (v / 100) * (H - 8);
  const pct = (v: number) => `${(y(v) / H) * 100}%`;
  const pts = sparkPoints(history, W, H);
  const last = pts.split(' ').pop()?.split(',').map(Number) ?? [0, 0];
  return (
    <div class="td-chart">
      <div class="td-chart-plot">
        <svg
          class="td-spark"
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={STR.qualityChart}
        >
          <rect x="0" y={y(40)} width={W} height={H - y(40)} class="td-spark-fail" />
          {[40, 55, 70].map((v) => (
            <line key={v} x1="0" x2={W} y1={y(v)} y2={y(v)} class="td-spark-grid" />
          ))}
          <polyline points={pts} class="td-spark-line" />
        </svg>
        <span
          class="td-chart-dot"
          style={{ left: `${((last[0] ?? 0) / W) * 100}%`, top: `${((last[1] ?? 0) / H) * 100}%` }}
        />
        <span class="td-chart-zone" style={{ top: pct(40) }}>
          {STR.failZone}
        </span>
      </div>
      <div class="td-chart-axis" aria-hidden="true">
        {[100, 50, 0].map((v) => (
          <span key={v} style={{ top: pct(v) }}>
            {v}
          </span>
        ))}
      </div>
    </div>
  );
}

/** 星级格：几颗星（实心 / 空心）+ 下一星还差几项（UI-8） */
function StarCell({ st, open, onTap }: { st: StarInfo; open: boolean; onTap: (e: MouseEvent) => void }) {
  return (
    <button
      type="button"
      class={`td-cell td-cell-stars${st.tone ? ` td-cell-${st.tone}` : ''}`}
      aria-expanded={open}
      aria-controls="td-stars"
      aria-label={`${st.n}/${st.max} ★ · ${st.label}`}
      onClick={onTap}
    >
      <span class="td-num td-stars" aria-hidden="true">
        {Array.from({ length: st.max }, (_, i) => (
          <i key={i} class={i < st.n ? 'td-star-on' : 'td-star-off'}>
            {i < st.n ? '★' : '☆'}
          </i>
        ))}
      </span>
      <span class="td-lab">{st.label}</span>
    </button>
  );
}

/** 星级明细：下一星清单的每一条，满足没有、现在多少 / 要多少（只读，不放按钮） */
function StarSheet({ st }: { st: StarInfo }) {
  return (
    <section class="td-starsheet" id="td-stars" aria-label={st.title}>
      <div class="td-details-head">
        <span>{st.title}</span>
        <span class="td-stars-count">
          {st.n}/{st.max} ★
        </span>
      </div>
      {st.items.length ? (
        <ul class="td-star-items">
          {st.items.map((x) => (
            <li key={x.id} class={x.met ? 'td-star-met' : ''}>
              <span class="td-star-mark" aria-hidden="true">
                {x.met ? '✓' : '○'}
              </span>
              <span class="td-star-text">{x.text}</span>
              {x.value ? <span class="td-star-val">{x.value}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {st.opens ? <p class="td-star-opens">{st.opens}</p> : null}
      {st.foot ? <p class="td-star-foot">{st.foot}</p> : null}
      {st.score ? (
        <div class="td-star-score">
          <h3>{st.score.title}</h3>
          <ScoreTable sc={st.score} />
        </div>
      ) : null}
    </section>
  );
}

function StatStrip({ s }: { s: HudSnapshot }) {
  const [open, setOpen] = useState<null | 'details' | 'stars'>(null);
  const g = s.quality.grade;
  const toggle = (what: 'details' | 'stars') => (e: MouseEvent) => {
    setOpen(open === what ? null : what);
    // 鼠标点开后不留键盘焦点框（键盘操作仍然有）
    if (e.detail > 0) (e.currentTarget as HTMLElement).blur();
  };
  const main = {
    type: 'button' as const,
    'aria-expanded': open === 'details',
    'aria-controls': 'td-details',
    title: STR.details,
    onClick: toggle('details'),
  };
  return (
    <div class="td-strip-wrap">
      {/* 星级格自己是一个按钮（点开星级明细，放在最右）；其余格子点开俱乐部报告 */}
      <div class="td-strip">
        <button {...main} class="td-strip-main">
          <span class="td-cell td-cell-q">
            <span class="td-grade" style={{ background: GRADE_COLOR[g] }}>
              {g}
            </span>
            <span class="td-cell-col">
              <span class="td-num">{Math.round(s.quality.value)}</span>
              <span class="td-lab">{STR.quality}</span>
            </span>
          </span>
          <Cell value={String(s.members)} label={STR.members} />
          {s.stars ? null : s.board ? (
            <Cell value={String(s.board.value)} label={s.board.label} tone={s.board.tone} />
          ) : (
            <Cell value={`${s.courts.open}/${s.courts.total}`} label={STR.courtsOpen} />
          )}
          <Cell value={s.salary.text} label={s.salary.label ?? STR.salary} extra={s.salary.change} />
          <span class="td-chev" aria-hidden="true">
            {open === 'details' ? '▴' : '▾'}
          </span>
        </button>
        {s.stars ? <StarCell st={s.stars} open={open === 'stars'} onTap={toggle('stars')} /> : null}
      </div>
      {open === 'stars' && s.stars ? <StarSheet st={s.stars} /> : null}
      {open === 'details' ? (
        <section class="td-details" id="td-details" aria-label={STR.details}>
          <div class="td-details-head">
            <span>{STR.qualityChart}</span>
            <span class={`td-trend td-trend-${s.quality.trend}`}>{STR.trend[s.quality.trend]}</span>
          </div>
          <Spark history={s.quality.history} />
          <dl class="td-rows">
            <dt>{STR.headCoach}</dt>
            <dd class={s.headCoach.vacant ? 'td-bad' : ''}>{s.headCoach.vacant ? STR.vacant : s.headCoach.name}</dd>
            {s.details.map((r) => [
              <dt key={`${r.label}-t`}>{r.label}</dt>,
              <dd key={`${r.label}-d`} class={r.tone ? `td-${r.tone}` : r.value ? '' : 'td-none'}>
                {r.value || STR.notYet}
              </dd>,
            ])}
          </dl>
          {s.story?.length ? (
            <div class="td-story">
              <div class="td-details-head">
                <span>{STR.story}</span>
              </div>
              <ol>
                {s.story.map((x) => (
                  <li key={x.id} class={x.tone ? `td-${x.tone}` : ''}>
                    <b>{x.time}</b> {STR.because} {x.because}, {STR.so} {x.so}
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function EventCard({ c, actions }: { c: EventCardData; actions: HudActions }) {
  return (
    <section class={`td-card td-card-${c.kind}${c.compact ? ' td-card-compact' : ''}`} key={c.id} aria-live="polite">
      {c.who ? (
        <div class="td-who">
          <span class="td-face" style={{ background: c.who.color }} aria-hidden="true">
            {c.who.initials}
          </span>
          <span class="td-who-col">
            <b>{c.who.name}</b>
            <span>{c.who.role}</span>
          </span>
        </div>
      ) : null}
      <div class="td-card-tags">
        {c.topic ? <span class="td-tag-topic">{c.topic}</span> : null}
        <span class="td-tag-loc">{c.location}</span>
        {c.more ? <span class="td-tag-more">{STR.more(c.more)}</span> : null}
      </div>
      <div class="td-card-body">
        <h2 class="td-card-head">{c.headline}</h2>
        {c.body ? <p class="td-card-text">{c.body}</p> : null}
        {c.context?.length ? (
          <div class="td-ctx">
            {c.context.map((x) => (
              <span key={x.text} class={x.tone === 'loss' ? 'td-bad' : x.tone === 'gain' ? 'td-good' : ''}>
                {x.text}
              </span>
            ))}
          </div>
        ) : null}
        {c.countdown ? (
          <div class="td-count">
            <div class="td-count-track">
              <div class="td-count-fill" style={{ width: `${Math.round(c.countdown.ratio * 1000) / 10}%` }} />
            </div>
            <span class="td-count-label">{c.countdown.label}</span>
          </div>
        ) : null}
        {c.timer !== undefined ? (
          <div class="td-timer" aria-hidden="true">
            <div style={{ width: `${Math.round(c.timer * 1000) / 10}%` }} />
          </div>
        ) : null}
        {c.answers ? (
          <div class="td-answers">
            {c.answers.map((a) => (
              <button
                type="button"
                key={a.key}
                class={`td-answer${a.chosen ? ' td-chosen' : ''}${a.walk ? ' td-walk' : ''}${a.previewing ? ' td-answer-on' : ''}`}
                aria-disabled={a.disabled ? 'true' : undefined}
                aria-pressed={a.chosen ? 'true' : 'false'}
                title={a.walk ? STR.walkThere : undefined}
                onClick={() => {
                  if (!a.disabled) actions.answer(a.key);
                }}
              >
                <span class="td-key">{a.key}</span>
                <span class="td-answer-col">
                  <span class="td-answer-text">{a.text}</span>
                  {a.opens ? <span class="td-answer-opens">＋ {a.opens}</span> : null}
                  {a.costs ? <span class="td-answer-costs">－ {a.costs}</span> : null}
                  {a.chips?.length ? <Chips chips={a.chips} /> : null}
                  {a.potential ? <span class="td-answer-potential">{a.potential}</span> : null}
                  {a.hint ? <span class="td-answer-hint">{a.hint}</span> : null}
                  {a.then ? <span class="td-answer-then">{a.then}</span> : null}
                </span>
                {a.disabled ? <LockIcon /> : a.walk ? <WalkIcon /> : null}
              </button>
            ))}
          </div>
        ) : null}
        {c.score ? <ScoreTable sc={c.score} /> : null}
        {c.recap ? <Recap r={c.recap} /> : null}
        {c.note || c.action ? (
          <div class="td-card-foot">
            {c.note ? <span class="td-card-note">{c.note}</span> : <span />}
            {c.action ? (
              <button type="button" class="td-card-action" onClick={() => c.action && actions.cardAction(c.action.id)}>
                {c.action.label}
              </button>
            ) : null}
          </div>
        ) : null}
        {c.actions?.length ? (
          <div class="td-card-actions">
            {c.actions.map((a, i) => (
              <button
                type="button"
                key={a.id}
                class={i === 0 ? 'td-card-action' : 'td-card-action td-card-action-2'}
                onClick={() => actions.cardAction(a.id)}
              >
                {a.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

/** 结局卡（W4）：分项一行一行，最后是总分、评语档和一句评语 */
function ScoreTable({ sc }: { sc: NonNullable<EventCardData['score']> }) {
  return (
    <div class="td-score">
      {sc.line ? <p class="td-score-line">{sc.line}</p> : null}
      <ol class="td-score-rows">
        {sc.rows.map((r) => (
          <li key={r.id} class={r.negative ? 'td-bad' : ''}>
            <span class="td-score-label">{r.label}</span>
            <span class="td-score-detail">{r.detail}</span>
            <b>{r.points}</b>
          </li>
        ))}
      </ol>
      <div class="td-score-total">
        <span class={`td-score-grade td-grade-${sc.grade}`}>{sc.grade}</span>
        <span class="td-score-verdict">
          {sc.gradeName ? <b>{sc.gradeName}</b> : null}
          <span>{sc.verdict}</span>
        </span>
        <span class="td-score-sum">
          <span>{sc.totalLabel}</span>
          <b>{sc.total}</b>
        </span>
      </div>
    </div>
  );
}

/** 结局卡"看总结"：这一季的大事，按时间排 */
function Recap({ r }: { r: NonNullable<EventCardData['recap']> }) {
  return (
    <div class="td-recap">
      <h3>{r.title}</h3>
      {r.lines.length ? (
        <ol>
          {r.lines.map((x) => (
            <li key={x.id}>
              <b>{x.when}</b> {x.text}
            </li>
          ))}
        </ol>
      ) : r.empty ? (
        <p>{r.empty}</p>
      ) : null}
    </div>
  );
}

const LockIcon = () => (
  <svg
    class="td-lock"
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2.2"
    aria-hidden="true"
  >
    <rect x="5" y="11" width="14" height="10" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
);

const WalkIcon = () => (
  <svg
    class="td-lock"
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2.2"
    aria-hidden="true"
  >
    <circle cx="13" cy="4" r="2" />
    <path d="M9 21l3-7 3 3v4M12 14l-1-5 4 2 3 1M11 9l-4 2-1 3" />
  </svg>
);

const RotL = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2.2"
    aria-hidden="true"
  >
    <path d="M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4" />
  </svg>
);
const RotR = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2.2"
    aria-hidden="true"
  >
    <path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v4h-4" />
  </svg>
);
const PauseIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <rect x="5" y="4" width="5" height="16" />
    <rect x="14" y="4" width="5" height="16" />
  </svg>
);
const PlayIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M6 4l14 8-14 8z" />
  </svg>
);

/** 回到会所：一座小房子 */
const HomeIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 3l9 8h-3v9h-5v-6h-2v6H6v-9H3z" />
  </svg>
);

function ClubWire({ s, actions }: { s: HudSnapshot; actions: HudActions }) {
  const { paused, speed } = s.controls;
  return (
    <footer class="td-wire">
      <span class="td-wire-tag">{STR.wire}</span>
      <ol class="td-wire-items" aria-label={STR.wire}>
        {s.wire.map((w) => (
          <li key={w.id} class={w.hot ? 'td-hot' : ''} title={w.text}>
            <b>{w.time}</b> {w.text}
          </li>
        ))}
      </ol>
      <div class="td-ctrl" role="toolbar" aria-label="View controls">
        <button type="button" aria-label={STR.rotateLeft} title={STR.rotateLeft} onClick={() => actions.rotate(-1)}>
          <RotL />
        </button>
        <button type="button" aria-label={STR.rotateRight} title={STR.rotateRight} onClick={() => actions.rotate(1)}>
          <RotR />
        </button>
        {actions.home ? (
          <button
            type="button"
            class="td-ctrl-home"
            aria-label={STR.home}
            title={STR.home}
            onClick={() => actions.home?.()}
          >
            <HomeIcon />
          </button>
        ) : null}
        <button
          type="button"
          class="td-ctrl-main"
          aria-label={paused ? STR.resume : STR.pause}
          title={paused ? STR.resume : STR.pause}
          aria-pressed={paused}
          onClick={() => actions.togglePause()}
        >
          {paused ? <PlayIcon /> : <PauseIcon />}
        </button>
        <button type="button" class="td-ctrl-speed" title={STR.speed} onClick={() => actions.cycleSpeed()}>
          {speed}
        </button>
      </div>
    </footer>
  );
}

export function Hud({ s, actions }: { s: HudSnapshot; actions: HudActions }) {
  return (
    <div class="td-hud">
      {/* 左上标题卡、右上俱乐部报告（手机上上下叠着） */}
      <div class="td-top">
        <ScoreBug club={s.club} paused={s.controls.paused} status={s.status} season={s.season} actions={actions} />
        <StatStrip s={s} />
      </div>
      {s.card ? <EventCard c={s.card} actions={actions} /> : null}
      {/* 卡开着的时候先拍板，员工条让开 */}
      {s.staff && !s.card ? <StaffBar staff={s.staff} hint={s.hint} actions={actions} /> : null}
      <ClubWire s={s} actions={actions} />
      {/* 地点清单（ADR 0013）在员工条上面，员工条仍然能拖；点开一项说明时清单先收起 */}
      {s.place && !s.sheet && !s.card ? <PlaceSheet p={s.place} actions={actions} /> : null}
      {s.sheet && !s.card ? <TargetSheet t={s.sheet} actions={actions} back={!!s.place} /> : null}
    </div>
  );
}

export interface HudHandle {
  update(s: HudSnapshot): void;
}

/** 把 HUD 挂到一个容器上；之后每次有新快照就调 update。 */
export function mountHud(el: HTMLElement, actions: HudActions): HudHandle {
  return {
    update(s) {
      render(<Hud s={s} actions={actions} />, el);
    },
  };
}

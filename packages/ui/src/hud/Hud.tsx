import { render } from 'preact';
import { useState } from 'preact/hooks';
import { GRADE_COLOR, sparkPoints } from './format';
import { STR } from './strings';
import type { EventCardData, HudActions, HudSnapshot } from './types';
import './hud.css';

/**
 * 「场边转播」HUD（Interface Directions 方向 B）：
 * 左上记分牌、右上状态条（点开看明细）、下三分之一事件卡、底部滚动的俱乐部快讯带着视角控制。
 */

function ScoreBug({ club }: { club: HudSnapshot['club'] }) {
  return (
    <header class="td-bug">
      <span class="td-bug-badge" aria-hidden="true">
        {club.badge}
      </span>
      <h1 class="td-bug-name">{club.name}</h1>
      <span class="td-bug-clock">{club.clock}</span>
    </header>
  );
}

function Cell({ value, label, extra }: { value: string; label: string; extra?: string | undefined }) {
  return (
    <span class="td-cell">
      <span class="td-num">
        {value}
        {extra ? <span class="td-down"> {extra}</span> : null}
      </span>
      <span class="td-lab">{label}</span>
    </span>
  );
}

function Spark({ history }: { history: readonly number[] }) {
  // 横向拉伸铺满面板宽度；线宽不随拉伸变化
  const W = 260;
  const H = 56;
  const y = (v: number) => H - 4 - (v / 100) * (H - 8);
  return (
    <svg class="td-spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={STR.qualityChart}>
      <rect x="0" y={y(40)} width={W} height={H - y(40)} class="td-spark-fail" />
      {[40, 55, 70].map((v) => (
        <line key={v} x1="0" x2={W} y1={y(v)} y2={y(v)} class="td-spark-grid" />
      ))}
      <polyline points={sparkPoints(history, W, H)} class="td-spark-line" />
    </svg>
  );
}

function StatStrip({ s }: { s: HudSnapshot }) {
  const [open, setOpen] = useState(false);
  const g = s.quality.grade;
  return (
    <div class="td-strip-wrap">
      <button
        type="button"
        class="td-strip"
        aria-expanded={open}
        aria-controls="td-details"
        title={STR.details}
        onClick={() => setOpen(!open)}
      >
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
        <Cell value={`${s.courts.open}/${s.courts.total}`} label={STR.courtsOpen} />
        <Cell value={s.salary.text} label={STR.salary} extra={s.salary.change} />
        <span class="td-chev" aria-hidden="true">
          {open ? '▴' : '▾'}
        </span>
      </button>
      {open ? (
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
              <dd key={`${r.label}-d`} class={r.tone ? `td-${r.tone}` : ''}>
                {r.value}
              </dd>,
            ])}
          </dl>
        </section>
      ) : null}
    </div>
  );
}

function EventCard({ c, actions }: { c: EventCardData; actions: HudActions }) {
  return (
    <section class={`td-card td-card-${c.kind}`} key={c.id} aria-live="polite">
      <div class="td-card-tags">
        <span class="td-tag-topic">{c.topic}</span>
        <span class="td-tag-loc">{c.location}</span>
      </div>
      <div class="td-card-body">
        <h2 class="td-card-head">{c.headline}</h2>
        {c.body ? <p class="td-card-text">{c.body}</p> : null}
        {c.countdown ? (
          <div class="td-count">
            <div class="td-count-track">
              <div class="td-count-fill" style={{ width: `${Math.round(c.countdown.ratio * 1000) / 10}%` }} />
            </div>
            <span class="td-count-label">{c.countdown.label}</span>
          </div>
        ) : null}
        {c.answers ? (
          <div class="td-answers">
            {c.answers.map((a) => (
              <button
                type="button"
                key={a.key}
                class={`td-answer${a.chosen ? ' td-chosen' : ''}`}
                aria-disabled={a.disabled ? 'true' : undefined}
                aria-pressed={a.chosen ? 'true' : 'false'}
                onClick={() => {
                  if (!a.disabled) actions.answer(a.key);
                }}
              >
                <span class="td-key">{a.key}</span>
                {a.text}
              </button>
            ))}
          </div>
        ) : null}
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
      </div>
    </section>
  );
}

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

function ClubWire({ s, actions }: { s: HudSnapshot; actions: HudActions }) {
  const { paused, speed } = s.controls;
  return (
    <footer class="td-wire">
      <span class="td-wire-tag">{STR.wire}</span>
      <ol class="td-wire-items" aria-label={STR.wire}>
        {s.wire.map((w) => (
          <li key={w.id} class={w.hot ? 'td-hot' : ''}>
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
      <ScoreBug club={s.club} />
      <StatStrip s={s} />
      {s.card ? <EventCard c={s.card} actions={actions} /> : null}
      <ClubWire s={s} actions={actions} />
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

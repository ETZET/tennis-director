import { useEffect, useRef, useState } from 'preact/hooks';
import type { HudActions, PlannerData, PlannerNote } from '../hud/types';
import './planner.css';

/**
 * 会所公告板（经营循环 v2，方案 A）：把便条拖进一周的格子排一季的日程。
 *
 * 手机优先：整屏的软木板，格子 7 列 × 3 个时段，下面是便条托盘（拇指够得着），最下面是"钉好了"。
 * 全程拖动：从托盘拖进格子是新排；从格子拖到别的格子是挪；拖出格子是拿掉。右边（手机上是下面）的
 * "每周会怎样"随拖动实时变，不用点任何按钮。用 Pointer Events，鼠标和手指一样。
 */

interface Drag {
  note: PlannerNote;
  from: { part: string; day: number } | null;
  x: number;
  y: number;
  /** 指针移过一点才算拖（避免轻点就拿掉） */
  moved: boolean;
  over: { part: string; day: number } | null;
}

function cellAt(x: number, y: number): { part: string; day: number } | null {
  const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-cell]');
  if (!el) return null;
  const [part = '', day = '0'] = (el.dataset.cell ?? '').split(':');
  return { part, day: Number(day) };
}

function Note({
  note,
  short,
  onDown,
  ghost,
}: {
  note: PlannerNote;
  short?: boolean;
  onDown?: (e: PointerEvent) => void;
  ghost?: boolean;
}) {
  return (
    <span
      class={`tdp-note${ghost ? ' tdp-ghost' : ''}`}
      style={{ background: note.color }}
      onPointerDown={onDown}
      title={note.label}
    >
      {short ? note.short : note.label}
    </span>
  );
}

export function Planner({ p, actions }: { p: PlannerData; actions: HudActions }) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  dragRef.current = drag;
  const byId = new Map(p.notes.map((n) => [n.id, n]));

  const start = (note: PlannerNote, from: Drag['from']) => (e: PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    setDrag({ note, from, x: e.clientX, y: e.clientY, moved: false, over: from });
  };

  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const moved = d.moved || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6;
      setDrag({ ...d, x: e.clientX, y: e.clientY, moved, over: cellAt(e.clientX, e.clientY) });
    };
    const up = (e: PointerEvent) => {
      const d = dragRef.current;
      setDrag(null);
      if (!d) return;
      const to = cellAt(e.clientX, e.clientY);
      if (!d.moved && d.from) return; // 轻点格子里的便条：什么也不做
      const fits = to && d.note.parts.includes(to.part);
      if (to && fits && !(d.from && d.from.part === to.part && d.from.day === to.day)) {
        if (d.from) actions.plan?.(d.from.part, d.from.day, null);
        actions.plan?.(to.part, to.day, d.note.id);
      } else if (!to && d.from) actions.plan?.(d.from.part, d.from.day, null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [drag !== null]);

  return (
    <div class="tdp" role="dialog" aria-label={p.title}>
      <div class="tdp-board">
        <header class="tdp-head">
          <div>
            <h2>{p.title}</h2>
            <span>{p.subtitle}</span>
          </div>
          {p.required ? null : (
            <button type="button" class="tdp-x" aria-label="Close" onClick={() => actions.closePlanner?.()}>
              ×
            </button>
          )}
        </header>
        <div class="tdp-grid" style={{ gridTemplateColumns: `2.6em repeat(${p.days.length}, minmax(0, 1fr))` }}>
          <span />
          {p.days.map((d) => (
            <span key={d} class="tdp-day">
              {d}
            </span>
          ))}
          {p.parts.map((part) => [
            <span key={`${part.id}-l`} class="tdp-part">
              {part.label}
            </span>,
            ...(p.grid[part.id] ?? []).map((id, day) => {
              const note = id ? byId.get(id) : undefined;
              const fits = drag?.note.parts.includes(part.id);
              const over = drag?.over?.part === part.id && drag.over.day === day;
              const hidden = drag?.moved && drag.from?.part === part.id && drag.from.day === day;
              return (
                <span
                  key={`${part.id}-${day}`}
                  data-cell={`${part.id}:${day}`}
                  class={`tdp-cell${drag ? (fits ? ' tdp-ok' : ' tdp-no') : ''}${over && fits ? ' tdp-over' : ''}`}
                >
                  {note && !hidden ? <Note note={note} short onDown={start(note, { part: part.id, day })} /> : null}
                </span>
              );
            }),
          ])}
        </div>
        <div class="tdp-tray">
          <span class="tdp-tray-l">{p.trayLabel}</span>
          <div class="tdp-tray-notes">
            {p.notes.map((n) => (
              <Note key={n.id} note={n} short onDown={start(n, null)} />
            ))}
          </div>
        </div>
      </div>
      <aside class="tdp-proj">
        <dl>
          {p.projection.map((r) => [
            <dt key={`${r.label}-t`}>{r.label}</dt>,
            <dd key={`${r.label}-d`} class={r.tone ? `td-${r.tone}` : ''}>
              {r.value}
            </dd>,
          ])}
        </dl>
        <p class="tdp-cost">{p.costNote}</p>
        <button type="button" class="tdp-lock" onClick={() => actions.lockPlan?.()}>
          {p.lockLabel}
        </button>
      </aside>
      {drag?.moved ? (
        <span class="tdp-float" style={{ left: `${drag.x}px`, top: `${drag.y}px` }}>
          <Note note={drag.note} ghost />
        </span>
      ) : null}
    </div>
  );
}

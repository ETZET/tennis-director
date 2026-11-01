import { useRef, useState } from 'preact/hooks';
import { STR } from '../hud/strings';
import type { HudActions, StaffToken } from '../hud/types';
import './staff.css';

/**
 * 底部员工条（ADR 0012）：拇指够得着的一排人。
 *
 * - 点一下：拿起来（再点岗位或工单就派过去；再点自己放下）。
 * - 按住拖：头像跟着手指走，松手的地方是岗位或工单就派过去（由游戏层按屏幕坐标找目标）。
 * 不依赖悬停和键盘；每个头像至少 48 px。
 */

const SKILL_KEYS = ['teach', 'upkeep', 'service'] as const;

function Token({ t, actions }: { t: StaffToken; actions: HudActions }) {
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const onDown = (e: PointerEvent) => {
    if (t.locked) return;
    start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent) => {
    const s0 = start.current;
    if (!s0 || s0.id !== e.pointerId) return;
    if (drag || Math.hypot(e.clientX - s0.x, e.clientY - s0.y) > 8) setDrag({ x: e.clientX, y: e.clientY });
  };
  const onUp = (e: PointerEvent) => {
    const s0 = start.current;
    start.current = null;
    if (!s0 || s0.id !== e.pointerId) return;
    if (drag) {
      setDrag(null);
      actions.drop?.(t.id, e.clientX, e.clientY);
    } else actions.pick?.(t.picked ? null : t.id);
  };
  const onCancel = () => {
    start.current = null;
    setDrag(null);
  };
  return (
    <li class={`td-tok td-tok-${t.state}${t.picked ? ' td-tok-picked' : ''}${t.locked ? ' td-tok-locked' : ''}`}>
      <button
        type="button"
        aria-pressed={!!t.picked}
        aria-label={`${t.name} · ${t.doing}`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onCancel}
      >
        <span class="td-tok-face" style={{ background: t.color }}>
          {t.initials}
        </span>
        <span class="td-tok-text">
          <b>{t.name}</b>
          <span class="td-tok-doing">{t.doing}</span>
          <span class="td-tok-skills" aria-hidden="true">
            {SKILL_KEYS.map((k) => (
              <span key={k} class={`td-sk td-sk-${k}`} title={STR[`skill_${k}`]}>
                <i style={{ width: `${Math.round(t.skills[k])}%` }} />
              </span>
            ))}
          </span>
        </span>
      </button>
      {drag ? (
        <span class="td-tok-ghost" style={{ left: `${drag.x}px`, top: `${drag.y}px`, background: t.color }}>
          {t.initials}
        </span>
      ) : null}
    </li>
  );
}

export function StaffBar({
  staff,
  hint,
  actions,
}: {
  staff: readonly StaffToken[];
  hint?: string | null | undefined;
  actions: HudActions;
}) {
  return (
    <div class="td-staff">
      {hint ? (
        <div class="td-staff-hint" role="status">
          <span>{hint}</span>
          <button type="button" aria-label={STR.cancel} onClick={() => actions.pick?.(null)}>
            ×
          </button>
        </div>
      ) : null}
      <ul class="td-staff-row" aria-label={STR.staff}>
        {staff.map((t) => (
          <Token key={t.id} t={t} actions={actions} />
        ))}
      </ul>
    </div>
  );
}

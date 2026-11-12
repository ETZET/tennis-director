import { useEffect, useRef, useState } from 'preact/hooks';
import { STR } from '../hud/strings';
import type { HudActions, StaffToken } from '../hud/types';
import './staff.css';

/**
 * 底部员工条（ADR 0012）：拇指够得着的一排人。
 *
 * - 点一下：拿起来（再点岗位或工单就派过去；再点自己放下）。
 * - 按住拖：头像跟着手指走，松手的地方是岗位或工单就派过去（由游戏层按屏幕坐标找目标）。
 * - 人多了一排放不下：左右滑滚动这一排，往上拖才拿人（名字不截断）。
 * 不依赖悬停和键盘；每个头像至少 48 px。
 */

const SKILL_KEYS = ['teach', 'upkeep', 'service'] as const;
/** 球员多一条球技 */
const PLAYER_KEYS = ['teach', 'upkeep', 'service', 'play'] as const;

function Token({ t, actions, scroll }: { t: StaffToken; actions: HudActions; scroll: boolean }) {
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
    const dx = e.clientX - s0.x;
    const dy = e.clientY - s0.y;
    // 人多一排放不下时（scroll）：手指左右滑是滚动这一排（浏览器接管，随后 pointercancel），往上拖才拿人
    if (!drag && scroll && e.pointerType !== 'mouse' && Math.abs(dx) > Math.abs(dy)) return;
    if (drag || Math.hypot(dx, dy) > 8) {
      // 一开始拖就算拿起来：场景里能去的岗位和工单亮起来
      if (!drag && !t.picked) actions.pick?.(t.id);
      setDrag({ x: e.clientX, y: e.clientY });
    }
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
  // 拖到一半被打断（系统手势、来电、指针丢了捕获）：影子头像收掉，拿起的人放下（W5 门：pointercancel 后影子留在屏幕上）
  const onCancel = () => {
    const was = !!drag;
    start.current = null;
    setDrag(null);
    if (was) actions.pick?.(null);
  };
  const dragging = !!drag;
  useEffect(() => {
    if (!dragging) return;
    // 指针事件没回到按钮上（按钮重画、捕获丢了）也要收：窗口上兜底
    const end = () => {
      start.current = null;
      setDrag(null);
    };
    window.addEventListener('pointercancel', end);
    window.addEventListener('pointerup', end);
    window.addEventListener('blur', end);
    return () => {
      window.removeEventListener('pointercancel', end);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('blur', end);
    };
  }, [dragging]);
  return (
    <li class={`td-tok td-tok-${t.state}${t.picked ? ' td-tok-picked' : ''}${t.locked ? ' td-tok-locked' : ''}`}>
      <button
        type="button"
        aria-pressed={!!t.picked}
        aria-label={`${t.name} · ${t.doing}${t.rose ? ` · ${STR.rose}` : ''}`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onCancel}
        onLostPointerCapture={(e: PointerEvent) => {
          if (start.current?.id === e.pointerId) onCancel();
        }}
      >
        <span class="td-tok-face" style={{ background: t.color }}>
          {t.initials}
        </span>
        <span class="td-tok-text">
          <b>
            {t.name}
            {t.rose ? (
              <span class="td-tok-rose" aria-hidden="true">
                ▲
              </span>
            ) : null}
          </b>
          <span class="td-tok-doing">{t.doing}</span>
          <span class="td-tok-skills" aria-hidden="true">
            {(t.skills.play === undefined ? SKILL_KEYS : PLAYER_KEYS).map((k) => (
              <span key={k} class={`td-sk td-sk-${k}`} title={STR[`skill_${k}`]}>
                {/* 员工成长（W3）：潜力是条上淡淡的一截，能力往那儿长 */}
                {t.potential ? <em style={{ width: `${Math.round(t.potential[k] ?? t.skills[k] ?? 0)}%` }} /> : null}
                <i style={{ width: `${Math.round(t.skills[k] ?? 0)}%` }} />
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
    // 人多了（4 个以上）换成紧凑的头像，一屏放得下更多人（第二轮试玩 S10）
    <div class={`td-staff${staff.length >= 4 ? ' td-staff-many' : ''}`}>
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
          <Token key={t.id} t={t} actions={actions} scroll={staff.length >= 4} />
        ))}
      </ul>
    </div>
  );
}

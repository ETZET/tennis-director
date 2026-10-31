import { useEffect, useState } from 'preact/hooks';
import type { Chip, HudActions, RingAction, RingData } from '../hud/types';
import './ring.css';

/**
 * 动作圈（经营循环 v2，方案 A）：点场景里的地点或人，几个圆形动作围着它展开。
 *
 * 手机上手指会挡住标签，所以是"点一下选中、再确认"：选中的动作在屏幕底部（拇指够得着的地方）
 * 显示说明、全部代价和"去做"按钮。点圈外关掉。圆按钮 56 px，圈的位置夹在屏幕里，不会伸到边外。
 */

const ICONS: Record<RingAction['icon'], string> = {
  wrench: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  talk: 'M4 5h16v10H9l-5 4z',
  racket: 'M14 3a6 6 0 1 1-4 10l-6 6-1-1 6-6A6 6 0 0 1 14 3z',
  coins:
    'M12 3c4 0 7 1.3 7 3s-3 3-7 3-7-1.3-7-3 3-3 7-3zM5 6v6c0 1.7 3 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3 3 7 3s7-1.3 7-3v-6',
  spade: 'M12 3v12M8 15h8l-1 6H9zM12 3l4 4M12 3L8 7',
  sign: 'M5 3h14v9H5zM12 12v9',
  board: 'M3 4h18v14H3zM7 8h4M7 12h6M14 8h3v4h-3z',
  walk: 'M13 4a2 2 0 1 0 0 .1M9 21l3-7 3 3v4M12 14l-1-5 4 2 3 1M11 9l-4 2-1 3',
  spark: 'M12 2v6M12 16v6M2 12h6M16 12h6M5 5l4 4M15 15l4 4M5 19l4-4M15 9l4-4',
};

export function Chips({ chips, limit }: { chips: readonly Chip[]; limit?: number }) {
  const list = limit ? chips.slice(0, limit) : chips;
  return (
    <span class="td-chips">
      {list.map((c) => (
        <span key={c.text} class={`td-chip td-chip-${c.tone ?? 'info'}`}>
          {c.text}
        </span>
      ))}
    </span>
  );
}

export function ActionRing({ r, actions }: { r: RingData; actions: HudActions }) {
  const [sel, setSel] = useState<string | null>(null);
  useEffect(() => setSel(null), [r.title]);
  const W = typeof window === 'undefined' ? 400 : window.innerWidth;
  const H = typeof window === 'undefined' ? 800 : window.innerHeight;
  const R = Math.min(96, W * 0.24);
  const cx = Math.min(Math.max(r.x, R + 44), W - R - 44);
  const cy = Math.min(Math.max(r.y, R + 120), H - R - 150);
  const n = r.actions.length;
  const chosen = r.actions.find((a) => a.id === sel) ?? null;
  return (
    <div
      class="tdr"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) actions.closeRing?.();
      }}
    >
      <div class="tdr-ring" style={{ left: `${cx}px`, top: `${cy}px` }}>
        {r.actions.map((a, i) => {
          const ang = -Math.PI / 2 + (n === 1 ? 0 : (i / n) * Math.PI * 2);
          const x = Math.cos(ang) * R;
          const y = Math.sin(ang) * R;
          return (
            <button
              type="button"
              key={a.id}
              class={`tdr-btn${sel === a.id ? ' tdr-sel' : ''}${a.disabled ? ' tdr-off' : ''}`}
              style={{ transform: `translate(${x}px, ${y}px)`, animationDelay: `${i * 40}ms` }}
              aria-pressed={sel === a.id}
              onClick={() => setSel(sel === a.id ? null : a.id)}
            >
              <span class="tdr-o">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                  <path d={ICONS[a.icon]} />
                </svg>
              </span>
              <span class="tdr-l">{a.title}</span>
            </button>
          );
        })}
        <div class="tdr-hub">
          <b>{r.title}</b>
          {r.subtitle ? <span class="tdr-note">{r.subtitle}</span> : null}
        </div>
      </div>
      {chosen ? (
        <div class="tdr-sheet">
          <b>{chosen.title}</b>
          <span class="tdr-note">{chosen.note}</span>
          <Chips chips={chosen.chips} />
          {chosen.disabled ? (
            <span class="tdr-why">{chosen.disabled}</span>
          ) : (
            <button type="button" class="tdr-go" onClick={() => actions.act?.(chosen.id)}>
              {r.goLabel}
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}

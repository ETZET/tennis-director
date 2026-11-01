import { STR } from '../hud/strings';
import type { HudActions, TargetSheetData as Sheet } from '../hud/types';
import { Chips } from './Chips';
import './staff.css';

/**
 * 点了场景里的岗位或工单（手上没拿人）：底部弹出它是什么、现在怎样、每个人去了会怎样。
 * 点一个人就派过去；已经在这儿的人可以叫停。点外面关掉。
 */
export function TargetSheet({ t, actions }: { t: Sheet; actions: HudActions }) {
  return (
    <div class="td-sheet-wrap">
      {/* 点说明外面关掉（键盘用户用 Esc 或右上角的 ×） */}
      <button type="button" class="td-sheet-scrim" aria-label={STR.close} onClick={() => actions.closeSheet?.()} />
      <section class={`td-sheet td-sheet-${t.kind}`} aria-label={t.title}>
        <header>
          <b>{t.title}</b>
          <button type="button" class="td-sheet-x" aria-label={STR.close} onClick={() => actions.closeSheet?.()}>
            ×
          </button>
        </header>
        <p class="td-sheet-note">{t.note}</p>
        <p class="td-sheet-status">{t.status}</p>
        {t.progress !== undefined ? (
          <span class="td-sheet-bar" aria-hidden="true">
            <i style={{ width: `${Math.round(t.progress * 100)}%` }} />
          </span>
        ) : null}
        {t.chips.length ? <Chips chips={t.chips} /> : null}
        <ul class="td-sheet-people">
          {t.people.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                disabled={!!p.disabled && !p.here}
                onClick={() => actions.assign?.(p.id, p.here ? null : t.id)}
              >
                <span class="td-tok-face" style={{ background: p.color }}>
                  {p.initials}
                </span>
                <span class="td-sheet-who">
                  <b>{p.name}</b>
                  <span>{p.disabled && !p.here ? p.disabled : p.fit}</span>
                </span>
                <span class="td-sheet-go">{p.here ? STR.stop : STR.send}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

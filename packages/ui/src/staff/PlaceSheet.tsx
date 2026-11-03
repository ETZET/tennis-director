import { STR } from '../hud/strings';
import type { HudActions, PlaceSheetData } from '../hud/types';
import { Chips } from './Chips';
import './staff.css';

/**
 * 地点清单（ADR 0013）：点了场景里的地点牌，或者拿着人落到一个有好几项活的地点上，拇指区弹出这个地点的每项工作。
 * 一行就是一处落点：拿着人点它（或把人拖到它上面）派过去；没拿人点它看说明。
 */
export function PlaceSheet({ p, actions }: { p: PlaceSheetData; actions: HudActions }) {
  return (
    <div class="td-sheet-wrap td-place-wrap">
      <button type="button" class="td-sheet-scrim" aria-label={STR.close} onClick={() => actions.closeSheet?.(true)} />
      <section class="td-sheet td-place" aria-label={p.title}>
        <header>
          <b>{p.title}</b>
          <button type="button" class="td-sheet-x" aria-label={STR.close} onClick={() => actions.closeSheet?.(true)}>
            ×
          </button>
        </header>
        {p.condition ? (
          <div class={`td-place-cond${p.condition.value < 30 ? ' td-place-cond-low' : ''}`}>
            <span>{p.condition.label}</span>
            <span class="td-sheet-bar" aria-hidden="true">
              <i style={{ width: `${p.condition.value}%` }} />
            </span>
          </div>
        ) : null}
        {p.prompt ? <p class="td-sheet-status">{p.prompt}</p> : null}
        {p.rows.length ? (
          <ul class="td-place-rows">
            {p.rows.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  disabled={!!r.locked}
                  {...(r.locked ? {} : { 'data-target': r.id })}
                  class={`td-row td-row-${r.kind} td-row-${r.skill}${r.need ? ' td-row-need' : ''}${
                    r.locked ? ' td-row-locked' : r.fit ? (r.fit.blocked ? ' td-row-blocked' : ' td-row-fit') : ''
                  }`}
                  onClick={() => actions.target?.(r.id)}
                >
                  <span class="td-row-icon" aria-hidden="true">
                    {r.locked ? '🔒' : r.kind === 'order' ? '⚒' : r.faces.length ? '' : '+'}
                    {r.kind === 'post' && r.faces[0] ? (
                      <span
                        class={`td-row-face${r.faces[0].coming ? ' td-face-coming' : ''}`}
                        style={{ background: r.faces[0].color }}
                      >
                        {r.faces[0].initials}
                      </span>
                    ) : null}
                  </span>
                  <span class="td-row-text">
                    <b>{r.title}</b>
                    <span>
                      {r.fit?.best && !r.fit.blocked ? <em class="td-row-best">{STR.best}</em> : null}
                      {r.fit && !r.locked ? r.fit.text : r.line}
                    </span>
                    {r.chips?.length && !r.fit?.blocked ? <Chips chips={r.chips} /> : null}
                    {r.progress !== undefined && r.progress > 0 ? (
                      <span class="td-row-bar">
                        <i style={{ width: `${Math.round(r.progress * 100)}%` }} />
                      </span>
                    ) : null}
                  </span>
                  {r.kind === 'order' && r.faces.length ? (
                    <span class="td-row-crew" aria-hidden="true">
                      {r.faces.map((f, i) => (
                        <span
                          key={i}
                          class={`td-row-face${f.coming ? ' td-face-coming' : ''}`}
                          style={{ background: f.color }}
                        >
                          {f.initials}
                        </span>
                      ))}
                    </span>
                  ) : null}
                  <span class="td-row-go">
                    {r.locked ? '' : r.fit && !r.fit.blocked ? (r.fit.here ? STR.stop : STR.send) : '›'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p class="td-sheet-note">{p.empty}</p>
        )}
      </section>
    </div>
  );
}

import { useEffect, useRef } from 'preact/hooks';
import { STR } from '../hud/strings';
import type { HudActions, PlaceSheetData } from '../hud/types';
import { Chips } from './Chips';
import './staff.css';

/**
 * 地点清单（ADR 0013）：点了场景里的地点牌，或者拿着人落到一个有好几项活的地点上，拇指区弹出这个地点的每项工作。
 * 一行就是一处落点：拿着人点它（或把人拖到它上面）派过去；没拿人点它看说明。
 */
export function PlaceSheet({ p, actions }: { p: PlaceSheetData; actions: HudActions }) {
  // 正在预览一个变体：清单收矮一点，让场景里的预览露出来（镜头也会把设施挪到清单上面，main.ts）
  const previewing = p.rows.some((r) => r.variants?.some((v) => v.previewing));
  return (
    // 外层不接指针（.td-hud>* 默认接），只有点空白关清单的遮罩和清单本身接：员工条露在外面，能从那儿把人拖到一行上
    <div class="td-sheet-wrap td-place-wrap">
      <button type="button" class="td-sheet-scrim" aria-label={STR.close} onClick={() => actions.closeSheet?.(true)} />
      <section class={`td-sheet td-place${previewing ? ' td-place-preview' : ''}`} aria-label={p.title}>
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
                {r.variants?.length ? <Variants r={r} actions={actions} /> : null}
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

/**
 * 修复变体（UI-11）：工单下面一个变体一行（名字、取舍一句话、换来和付出）。
 * 没拿人时点一行在场景里叠预览、再点关掉；拿着人点它（或把人拖到它上面）就按这个变体开工。
 * 锁定以后只剩锁定的那一行。不加面板：清单本身就是落点。
 */
function Variants({ r, actions }: { r: PlaceSheetData['rows'][number]; actions: HudActions }) {
  // 清单收矮以后，把正在预览的那一行滚到看得见的地方
  const on = useRef<HTMLButtonElement>(null);
  const pv = r.variants?.find((v) => v.previewing)?.id ?? null;
  useEffect(() => {
    if (pv) on.current?.scrollIntoView({ block: 'nearest' });
  }, [pv]);
  return (
    <ul class="td-variants">
      {(r.variants ?? []).map((v) => (
        <li key={v.id}>
          <button
            type="button"
            ref={v.previewing ? on : undefined}
            data-target={r.id}
            data-variant={v.id}
            aria-pressed={v.previewing ? 'true' : 'false'}
            class={`td-variant${v.picked ? ' td-variant-picked' : ''}${v.locked ? ' td-variant-locked' : ''}${
              v.previewing ? ' td-variant-on' : ''
            }${v.fit ? (v.fit.blocked ? ' td-row-blocked' : ' td-row-fit') : ''}`}
            onClick={() => actions.variant?.(r.id, v.id)}
          >
            <span class="td-variant-mark" aria-hidden="true">
              {v.locked ? '✓' : v.picked ? '●' : '○'}
            </span>
            <span class="td-row-text">
              <b>{v.name}</b>
              {v.fit ? <span>{v.fit.text}</span> : v.line ? <span>{v.line}</span> : null}
              {v.gives && !v.fit?.blocked ? <span class="td-variant-gives">＋ {v.gives}</span> : null}
              {v.costs && !v.fit?.blocked ? <span class="td-variant-costs">－ {v.costs}</span> : null}
              {v.chips?.length && !v.fit?.blocked ? <Chips chips={v.chips} /> : null}
            </span>
            <span class="td-row-go">{v.fit && !v.fit.blocked ? STR.send : v.previewing ? '◉' : '◌'}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

import { render } from 'preact';
import { useState } from 'preact/hooks';
import type { DebugActions, DebugSnapshot } from './types';
import './debug.css';

/**
 * 调试面板（技术文档 M3）：改状态量和标记、看导演此刻会抽哪些卡并强制打开、跳时间、导出存档和命令日志。
 * 开发者工具，文案不走 i18n。
 */

function parseFlag(v: string): boolean | number | string {
  if (v === 'true') return true;
  if (v === 'false') return false;
  const n = Number(v);
  return v.trim() !== '' && Number.isFinite(n) ? n : v;
}

function Section({
  title,
  children,
  open = true,
}: {
  title: string;
  children: preact.ComponentChildren;
  open?: boolean;
}) {
  return (
    <details class="tdd-sec" open={open}>
      <summary>{title}</summary>
      {children}
    </details>
  );
}

export function DebugPanel({ s, actions }: { s: DebugSnapshot; actions: DebugActions }) {
  const [force, setForce] = useState('');
  const [seed, setSeed] = useState('');
  const [flagId, setFlagId] = useState('');
  const [flagVal, setFlagVal] = useState('true');
  return (
    <aside class="tdd" aria-label="Debug panel">
      <header class="tdd-head">
        <b>Debug</b>
        <span>
          {s.fps} fps · seed {s.seed} · {s.time}
        </span>
        <button type="button" class="tdd-x" aria-label="Close debug panel" onClick={() => actions.close()}>
          ×
        </button>
      </header>
      <div class="tdd-meta">
        content {s.contentVersion} · director {s.director} · pressure {s.pressure.toFixed(2)} · {s.commands} commands
      </div>
      {s.notes.length ? (
        <ul class="tdd-notes">
          {s.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      ) : null}

      <Section title="Time">
        <div class="tdd-row">
          {[
            ['+15m', 15],
            ['+1h', 60],
            ['+4h', 240],
            ['+1d', 1440],
          ].map(([l, m]) => (
            <button type="button" key={l} onClick={() => actions.skip(m as number)}>
              {l}
            </button>
          ))}
        </div>
      </Section>

      {s.care ? <CareSection care={s.care} actions={actions} /> : null}

      <Section title="Stats">
        <table class="tdd-table">
          <tbody>
            {s.stats.map((st) => (
              <tr key={st.id}>
                <th>{st.label}</th>
                <td>
                  <input
                    type="number"
                    value={Math.round(st.value * 10) / 10}
                    min={st.min}
                    max={st.max}
                    aria-label={st.label}
                    onChange={(e) => actions.setStat(st.id, Number((e.currentTarget as HTMLInputElement).value))}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title={`Flags (${s.flags.length})`} open={false}>
        <table class="tdd-table">
          <tbody>
            {s.flags.map((f) => (
              <tr key={f.id}>
                <th>{f.id}</th>
                <td>
                  <input
                    value={String(f.value)}
                    aria-label={f.id}
                    onChange={(e) => actions.setFlag(f.id, parseFlag((e.currentTarget as HTMLInputElement).value))}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <form
          class="tdd-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (flagId) actions.setFlag(flagId, parseFlag(flagVal));
            setFlagId('');
          }}
        >
          <input
            placeholder="flag"
            value={flagId}
            onInput={(e) => setFlagId((e.currentTarget as HTMLInputElement).value)}
          />
          <input value={flagVal} onInput={(e) => setFlagVal((e.currentTarget as HTMLInputElement).value)} />
          <button type="submit">Set</button>
        </form>
      </Section>

      <Section title={`Director would draw (${s.eligible.length})`}>
        {s.eligible.length ? (
          <table class="tdd-table">
            <tbody>
              {s.eligible.map((c) => (
                <tr key={c.id}>
                  <th title={c.id}>{c.title}</th>
                  <td class="tdd-num">{Math.round(c.share * 100)}%</td>
                  <td>
                    <button type="button" onClick={() => actions.forceCard(c.id)}>
                      Open
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p class="tdd-dim">Nothing eligible right now.</p>
        )}
      </Section>

      <Section title={`Scheduled (${s.scheduled.length})`} open={false}>
        <ul class="tdd-list">
          {s.scheduled.map((c) => (
            <li key={`${c.id}@${c.at}`}>
              <b>{c.at}</b> {c.title}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Force a card" open={false}>
        <form
          class="tdd-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (force) actions.forceCard(force);
          }}
        >
          <select value={force} onChange={(e) => setForce((e.currentTarget as HTMLSelectElement).value)}>
            <option value="">Choose…</option>
            {s.cards.map((c) => (
              <option key={c.id} value={c.id}>
                {c.id} — {c.title}
              </option>
            ))}
          </select>
          <button type="submit">Open</button>
        </form>
      </Section>

      <Section title="Game">
        <div class="tdd-row">
          <button type="button" onClick={() => actions.exportSave()}>
            Export save + log
          </button>
        </div>
        <form
          class="tdd-row"
          onSubmit={(e) => {
            e.preventDefault();
            actions.newGame(seed ? Number(seed) : null);
          }}
        >
          <input
            placeholder="seed (blank = random)"
            inputMode="numeric"
            value={seed}
            onInput={(e) => setSeed((e.currentTarget as HTMLInputElement).value)}
          />
          <button type="submit">New game</button>
        </form>
      </Section>
    </aside>
  );
}

const KINDS = ['sand', 'water', 'litter', 'lines', 'cracks'] as const;

/** 场地可用度（court-care-contract.md）：一块场一行，五项各一键设到 0.8、一键清空、一键"不能打"（门口会来人等）；酷热开关 */
function CareSection({ care, actions }: { care: NonNullable<DebugSnapshot['care']>; actions: DebugActions }) {
  return (
    <Section title={`Court care · ${care.weather}`}>
      <div class="tdd-row">
        {['sun', 'wind', 'rain', 'heat'].map((w) => (
          <button type="button" key={w} aria-pressed={care.weather === w} onClick={() => actions.weather?.(w)}>
            {w}
          </button>
        ))}
      </div>
      <table class="tdd-table">
        <tbody>
          {care.courts.map((c) => (
            <tr key={c.id}>
              <th title={c.id}>
                {c.title}
                <br />
                <span class="tdd-dim">
                  {c.active ? `${c.level} ${Math.round(c.usability)}` : 'closed'}
                  {c.waiting ? ` · wait ${c.waiting}` : ''}
                </span>
              </th>
              <td>
                <div class="tdd-row">
                  {KINDS.map((k) => (
                    <button
                      type="button"
                      key={k}
                      title={`${k} = ${(c.mess[k] ?? 0).toFixed(2)}`}
                      onClick={() => actions.mess?.(c.id, { [k]: 0.8 })}
                    >
                      {k} {Math.round((c.mess[k] ?? 0) * 100)}
                    </button>
                  ))}
                  <button type="button" onClick={() => actions.mess?.(c.id, { water: 1, sand: 0.6 })}>
                    unplayable
                  </button>
                  <button
                    type="button"
                    onClick={() => actions.mess?.(c.id, Object.fromEntries(KINDS.map((k) => [k, 0])))}
                  >
                    clear
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

export interface DebugHandle {
  update(s: DebugSnapshot | null): void;
}

export function mountDebug(el: HTMLElement, actions: DebugActions): DebugHandle {
  return {
    update(s) {
      render(s ? <DebugPanel s={s} actions={actions} /> : null, el);
    },
  };
}

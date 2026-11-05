import {
  type Command,
  type ContentBundle,
  careActive,
  careCourts,
  careLevelOf,
  directorPressure,
  eligibleCards,
  MESS_KINDS,
  usabilityOf,
  type Weather,
  worldOf,
} from '@td/sim';
import { type DebugActions, type DebugSnapshot, mountDebug } from '@td/ui';
import type { Session } from './session';
import type { Text } from './text';

/**
 * 调试面板的投影和命令（开发版，或 URL 带 ?debug）。按 ` 键开关。
 * 所有改动都走模拟的 debug* 命令，进命令日志，能重放。
 */

export interface DebugHost {
  session(): Session;
  content(): ContentBundle;
  text(): Text;
  exportSave(): void;
  newGame(seed: number | null): void;
  /** 命令发出去以后立刻推进一下，让画面跟上 */
  pump(): void;
}

export interface DebugUi {
  toggle(): void;
  readonly open: boolean;
  /** 每帧调用；面板开着时大约每 0.25 秒刷新一次 */
  frame(dt: number): void;
  note(lines: readonly string[]): void;
}

export function createDebug(el: HTMLElement, host: DebugHost, startOpen: boolean): DebugUi {
  let open = startOpen;
  let notes: readonly string[] = [];
  let acc = 0;
  let frames = 0;
  let fps = 0;
  let fpsT = 0;
  const send = (cmd: Command) => {
    host.session().send(cmd);
    host.pump();
    draw();
  };
  const actions: DebugActions = {
    setStat: (stat, value) => send({ type: 'debugSetStat', stat, value }),
    setFlag: (flag, value) => send({ type: 'debugSetFlag', flag, value }),
    forceCard: (card) => send({ type: 'debugForceCard', card }),
    skip: (minutes) => send({ type: 'debugSkip', minutes }),
    exportSave: () => host.exportSave(),
    newGame: (seed) => host.newGame(seed),
    close: () => ui.toggle(),
    mess: (court, mess) => send({ type: 'debugMess', court, mess }),
    weather: (weather) => send({ type: 'debugWeather', weather: weather as Weather }),
  };
  const handle = mountDebug(el, actions);

  function snapshot(): DebugSnapshot {
    const session = host.session();
    const s = session.s;
    const c = host.content();
    const T = host.text();
    const w = worldOf(s, c);
    const el = eligibleCards(s, w);
    const total = el.reduce((a, x) => a + x.weight, 0) || 1;
    return {
      fps,
      seed: s.seed,
      time: `${T.day(s.t)} ${T.clock(s.t)}`,
      contentVersion: c.version,
      director: s.directorConfig,
      pressure: directorPressure(s, w),
      stats: c.stats.map((st) => ({
        id: st.id,
        label: T.tr(`stats.${st.id}`),
        value: s.stats[st.id] ?? 0,
        min: st.min,
        max: st.max,
      })),
      flags: Object.entries(s.flags)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([id, value]) => ({ id, value })),
      eligible: el
        .sort((a, b) => b.weight - a.weight)
        .map((x) => ({ id: x.card, title: T.cardTitle(x.card), weight: x.weight, share: x.weight / total })),
      scheduled: [...s.cards.scheduled]
        .sort((a, b) => a.at - b.at)
        .map((x) => ({ id: x.card, title: T.cardTitle(x.card), at: `${T.day(x.at)} ${T.clock(x.at)}` })),
      cards: c.cards.filter((x) => x.act === s.act).map((x) => ({ id: x.id, title: T.cardTitle(x.id) })),
      notes,
      commands: session.log.length,
      care: {
        weather: s.weather,
        courts: careCourts(w).map((f) => ({
          id: f,
          title: T.facility(f),
          active: careActive(s, w, f),
          level: careLevelOf(s, w, f),
          usability: usabilityOf(s, w, f),
          mess: Object.fromEntries(MESS_KINDS.map((k) => [k, s.care?.[f]?.mess[k] ?? 0])),
          waiting: s.care?.[f]?.waiting?.n ?? 0,
        })),
      },
    };
  }
  const draw = () => handle.update(open ? snapshot() : null);

  const ui: DebugUi = {
    get open() {
      return open;
    },
    toggle() {
      open = !open;
      draw();
    },
    frame(dt) {
      frames++;
      fpsT += dt;
      if (fpsT >= 1) {
        fps = Math.round(frames / fpsT);
        frames = 0;
        fpsT = 0;
      }
      if (!open) return;
      acc += dt;
      if (acc > 0.25) {
        acc = 0;
        draw();
      }
    },
    note(lines) {
      notes = lines;
      draw();
    },
  };
  draw();
  return ui;
}

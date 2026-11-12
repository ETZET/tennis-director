import { clamp } from '@td/shared';
import { CONTENT, type ContentBundle, canAssign, placeAvailable, type SimEvent, worldOf } from '@td/sim';
import { type HudActions, mountHud, setHudStrings } from '@td/ui';
import { createDebug } from './debug';
import { clearAutosave, downloadSave, readAutosave, writeAutosave } from './persist';
import { Projector } from './project';
import { Session } from './session';
import { createText, type Lang } from './text';

/**
 * 正式游戏入口：模拟（@td/sim）+ 界面（@td/ui），暂时没有画面。
 *
 * 2.5D 等距画面已归档（docs/archive/iso-2.5d，ADR 0027）；3D 像素场景在 apps/sandbox 的 club* 页面里做，
 * 接回游戏时另写 ADR 定新的场景接口。这期间舞台上只有一行说明和一排地点按钮（代替地图上的地点牌），
 * 整局照样能玩：拿人、派活、选卡、每日结算、自动存档、调试面板、试玩桥（window.__td）。
 *
 *   真实时间 → Session.frame() → advance() → 领域事件 → Projector（HUD 快照、快讯）
 *   玩家拖人 / 点地点按钮 → HudActions → Session.assign → assign 命令（ADR 0012）
 */

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} missing`);
  return el as T;
};
const params = new URLSearchParams(location.search);
/** 默认中文；?lang=en 换成英文 */
const lang: Lang = params.get('lang') === 'en' ? 'en' : 'zh';
document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';

let content: ContentBundle = CONTENT;
let text = createText(content, lang);
const applyHudStrings = () => setHudStrings((k) => text.tr(`ui.hud.${k}`, '') || undefined);
applyHudStrings();

/* ---------- 一局 ---------- */
let session: Session;
let projector: Projector;

function begin(s: Session): void {
  session = s;
  projector = new Projector(content, text);
  draw();
}

function freshSession(): Session {
  const seed = Number(params.get('seed')) || Math.floor(Math.random() * 2 ** 31);
  const director = params.get('director') ?? undefined;
  const s = Session.fresh(content, seed, director);
  const skip = Number(params.get('skip')) || 0;
  if (skip) s.send({ type: 'debugSkip', minutes: skip });
  return s;
}

/* ---------- 舞台占位：说明 + 地点按钮（代替地图上的地点牌） ---------- */
const stage = $('stage');
const note = document.createElement('p');
note.className = 'stage-note';
const placesEl = document.createElement('div');
placesEl.className = 'stage-places';
stage.append(note, placesEl);
const placeButtons = new Map<string, HTMLButtonElement>();
function buildPlaces(c: ContentBundle): void {
  note.textContent = text.tr('ui.stage_placeholder');
  for (const a of c.acts[0]?.anchors ?? []) {
    let b = placeButtons.get(a);
    if (!b) {
      b = document.createElement('button');
      b.type = 'button';
      b.dataset.place = a;
      b.addEventListener('click', () => tapPlace(a));
      placesEl.append(b);
      placeButtons.set(a, b);
    }
    b.textContent = text.anchor(a);
  }
}
function syncPlaces(): void {
  const w = worldOf(session.s, content);
  for (const [a, b] of placeButtons) {
    b.hidden = !placeAvailable(session.s, w, a);
    b.classList.toggle('on', session.place === a);
  }
}
buildPlaces(content);

/* ---------- 界面 ---------- */
const hudActions: HudActions = {
  // 没有镜头：转角、回到会所什么都不做
  rotate: () => {},
  home: () => {},
  togglePause: () => {
    session.paused = !session.paused;
    draw();
  },
  cycleSpeed: () => {
    session.cycleSpeed();
    draw();
  },
  answer: (key) => answer(key),
  cardAction: (id) => {
    if (id === 'replay') {
      void clearAutosave();
      begin(freshSession());
    } else if (id === 'summary' || id === 'score') {
      session.endView = id;
      draw();
    } else if (id === 'season2') {
      session.endView = 'score';
      session.send({ type: 'startSeason2' });
      pump([]);
      if (!session.s.outcome) {
        session.paused = false;
        draw();
      }
    }
  },
  pick: (person) => {
    session.picked = person;
    session.sheet = null;
    draw();
  },
  drop: (person, x, y) => {
    if (session.settlement) return;
    const t = targetAt(x, y);
    if (t && 'target' in t) assignTo(person, t.target, t.variant);
    else if (t) tapPlace(t.place, person);
    else {
      session.picked = null;
      draw();
    }
  },
  assign: (person, target) => {
    session.assign(person, target);
    pump([]);
  },
  closeSheet: (all = true) => {
    session.sheet = null;
    if (all) session.place = null;
    draw();
  },
  target: (id) => tapTarget(id),
  variant: (order, v) => tapVariant(order, v),
  // 季节栏上的节拍：没有地图可以对准，直接打开那一处的地点清单
  beat: (place) => tapPlace(place, null),
  settlementDone: () => {
    session.ackSettlement();
    draw();
  },
};
/** 屏幕上 (x, y) 那儿是地点清单的哪一行，或者哪个地点按钮 */
function targetAt(x: number, y: number): { target: string; variant?: string } | { place: string } | null {
  for (const el of document.elementsFromPoint(x, y)) {
    const h = el as HTMLElement;
    const row = h.closest?.<HTMLElement>('[data-target]');
    const t = row?.dataset.target;
    if (t) return row?.dataset.variant ? { target: t, variant: row.dataset.variant } : { target: t };
    const a = h.closest?.<HTMLElement>('[data-place]')?.dataset.place;
    if (a) return { place: a };
  }
  return null;
}
function assignTo(person: string, target: string, variant?: string): void {
  const w = worldOf(session.s, content);
  if (canAssign(session.s, w, person, target, variant) === null) {
    session.assign(person, target, variant);
    pump([]);
  } else {
    // 派不过去（例如钱不够买料）：打开说明，让玩家看到为什么
    session.picked = null;
    session.sheet = target;
    session.place = w.posts.get(target)?.at ?? w.orders.get(target)?.at ?? session.place;
    draw();
  }
}
const ui = mountHud($('hud'), hudActions);

/** 卡片选项。选路卡（W2）要点两下：第一下记下选了哪条路，第二下才定（direct：试玩桥直接定） */
function answer(key: 1 | 2 | 3, direct = false): void {
  const o = Projector.focusCard(session.s, content);
  if (!o || session.s.outcome) return;
  const c = worldOf(session.s, content).cards.get(o.card);
  if (!c) return;
  const keys = (['A', 'B', 'C'] as const).filter((k) => c.options[k]);
  const opt = keys[key - 1];
  if (!opt) return;
  const p = session.routePick;
  if (!direct && projector.routeOf(o.card, opt) && !(p?.uid === o.uid && p.option === opt)) {
    session.routePick = { uid: o.uid, option: opt };
    draw();
    return;
  }
  if (session.choose(o.uid, opt)) pump([]);
}

const draw = () => {
  // 变体预览、选路预览只是画面：没有画面时只把过期的记号收掉
  const p = session.preview;
  if (p && (session.place !== worldOf(session.s, content).orders.get(p.order)?.at || session.sheet))
    session.preview = null;
  if (session.routePick && !session.s.cards.open.some((x) => x.uid === session.routePick?.uid))
    session.routePick = null;
  syncPlaces();
  ui.update(projector.snapshot(session));
};

/** 点地点按钮（或拿着人落到它上面） */
function tapPlace(a: string, person: string | null = session.picked): void {
  if (session.settlement) return;
  if (person) {
    const fits = projector.placeFits(session, a, person);
    // 只有一项能接的活就直接派；但还没定变体的修复工单要先在清单里挑一行（UI-11）
    const o = fits[0] ? worldOf(session.s, content).orders.get(fits[0]) : undefined;
    const choose = !!o?.variants && !session.s.orders[o.id]?.variant;
    if (fits.length === 1 && fits[0] && !choose) {
      assignTo(person, fits[0]);
      return;
    }
    session.picked = person;
  } else if (session.place === a) {
    session.place = null;
    session.sheet = null;
    draw();
    return;
  }
  session.place = a;
  session.sheet = null;
  draw();
}
/** 点地点清单里的变体行：拿着人就按这个变体开工，没拿就开 / 关这个变体的预览 */
function tapVariant(order: string, variant: string): void {
  if (session.picked) {
    assignTo(session.picked, order, variant);
    return;
  }
  const p = session.preview;
  session.preview = p?.order === order && p.variant === variant ? null : { order, variant };
  draw();
}
function tapTarget(id: string): void {
  if (session.picked) assignTo(session.picked, id);
  else {
    session.sheet = session.sheet === id ? null : id;
    draw();
  }
}

/* ---------- 键盘 ---------- */
window.addEventListener('keydown', (e) => {
  const t = e.target as HTMLElement | null;
  if (t?.closest?.('button,summary,input,select') && (e.key === ' ' || e.key === 'Enter')) return;
  if (t?.closest?.('.tdd') && e.key !== '`') return;
  // 结算卡开着：Space / Enter 由卡自己接，别的快捷键都不响应
  if (session.settlement && e.key !== '`') return;
  if (e.key === '`' && debug) debug.toggle();
  else if (e.key === 'f' || e.key === 'F') {
    session.cycleSpeed();
    draw();
  } else if (e.key === '1' || e.key === '2' || e.key === '3') answer(Number(e.key) as 1 | 2 | 3);
  else if (e.key === 'Escape') {
    session.picked = null;
    session.sheet = null;
    session.place = null;
    draw();
  } else if (e.key === ' ') {
    e.preventDefault();
    session.paused = !session.paused;
    draw();
  }
});

/* ---------- 主循环 ---------- */
let saveT = 0;
function pump(events: readonly SimEvent[]): void {
  const all = [...events, ...session.frame(0)];
  if (!all.length) return;
  projector.onEvents(session.s, all);
  if (all.some((e) => e.type === 'dayEnded' || e.type === 'actEnded')) void writeAutosave(session);
  draw();
}

let last = performance.now();
let uiT = 0;
function frame(ts: number) {
  requestAnimationFrame(frame);
  const dt = clamp((ts - last) / 1000, 0, 0.05);
  last = ts;
  pump(session.frame(dt));
  uiT += dt;
  if (uiT > 0.2) {
    uiT = 0;
    draw();
  }
  debug?.frame(dt);
  saveT += dt;
  if (saveT > 30 && !session.s.outcome) {
    saveT = 0;
    void writeAutosave(session);
  }
}

/* ---------- 开局：有自动存档就接着玩（?new 或 ?seed= 开新局） ---------- */
async function boot(): Promise<void> {
  const save = params.has('new') || params.has('seed') ? null : await readAutosave(content.version);
  begin(save ? new Session(content, save.state, save.commands).holdForCards() : freshSession());
  requestAnimationFrame(frame);
}
void boot();

/* ---------- 开发用：调试面板（` 键）和内容热重载 ---------- */
function setContent(c: ContentBundle): void {
  content = c;
  text = createText(c, lang);
  applyHudStrings();
  session.content = c;
  projector.setContent(c, text);
  buildPlaces(c);
  draw();
}

const debug =
  import.meta.env.DEV || params.has('debug')
    ? createDebug(
        $('debug'),
        {
          session: () => session,
          content: () => content,
          text: () => text,
          exportSave: () => downloadSave(session),
          newGame: (seed) => {
            void clearAutosave();
            const s = Session.fresh(content, seed ?? Math.floor(Math.random() * 2 ** 31), session.s.directorConfig);
            begin(s);
          },
          pump: () => pump([]),
        },
        params.has('debug'),
      )
    : null;

if (import.meta.hot)
  import.meta.hot.on('td:content', (data: { bundle: ContentBundle; warnings: string[] }) => {
    document.querySelector('vite-error-overlay')?.remove();
    setContent(data.bundle);
    debug?.note(data.warnings);
    console.info(`[content] hot-reloaded ${data.bundle.version}`);
  });

/**
 * 试玩桥（tools/playtest 用）：一分钟一分钟地快进，直到有新卡打开、要求暂停、本幕结束、工单做完，或走满 max 分钟。
 * 走完停在暂停状态，像回合制一样把决定交还给试玩者。
 */
function fastForward(max: number): { minutes: number; stop: string } {
  const t0 = session.s.t;
  session.paused = false;
  // 开着的结算卡当作已经点过（试玩桥一次走一段，不看卡）
  session.ackSettlement();
  let stop = 'time';
  for (let i = 0; i < max; i++) {
    const ev = session.stepMinute();
    pump(ev);
    if (session.s.outcome) stop = 'actEnded';
    else if (session.settlement) stop = 'daySettled';
    else if (ev.some((e) => e.type === 'cardOpened')) stop = 'cardOpened';
    else if (session.paused) stop = 'pause';
    else if (ev.some((e) => e.type === 'orderFinished')) stop = 'orderFinished';
    else continue;
    break;
  }
  session.paused = true;
  draw();
  return { minutes: session.s.t - t0, stop };
}

declare global {
  interface Window {
    __td?: {
      session: () => Session;
      setContent: (c: ContentBundle) => void;
      fastForward: (max: number) => { minutes: number; stop: string };
      answer: (key: 1 | 2 | 3) => void;
      /** 把人派到岗位或工单上（null 叫他停下来；variant：变体工单的哪一行）；返回 null，或者为什么没成 */
      assign: (person: string, target: string | null, variant?: string) => string | null;
      /** 点地点清单里的变体行（和手指点一样：拿着人就派，没拿就开 / 关预览） */
      tapVariant: (order: string, variant: string) => void;
      /** 员工条的数据 */
      staff: () => unknown;
      /** 某个岗位或工单的说明（和点开时看到的一样） */
      sheet: (target: string) => unknown;
      /** 现在看得见的地点按钮和打开的地点清单里的行 */
      targets: () => unknown;
      /** 点一个地点或一行（和手指点一样：拿着人就派，没拿就打开说明） */
      tap: (target: string) => void;
      pick: (person: string | null) => void;
      close: () => void;
      /** 复原进度、第几天、离投资方期限还有几天（试玩桥的 /state 用） */
      progress: () => {
        day: number;
        restored: number;
        total: number;
        daysLeft: number | null;
        deadlineDay: number | null;
        anchors: readonly string[];
      };
    };
  }
}
window.__td = {
  session: () => session,
  setContent,
  fastForward,
  answer: (key) => answer(key, true),
  assign: (person, target, variant) => {
    const w = worldOf(session.s, content);
    const why = canAssign(session.s, w, person, target, variant);
    if (why !== null) return `rejected: ${why}`;
    session.assign(person, target, variant);
    pump([]);
    return null;
  },
  staff: () => projector.staff(session),
  sheet: (t) => projector.sheet(session, t),
  targets: () => [
    ...[...placesEl.querySelectorAll<HTMLElement>('[data-place]')]
      .filter((el) => !el.hidden)
      .map((el) => ({ target: el.dataset.place, text: el.textContent, cls: el.className })),
    ...[...document.querySelectorAll<HTMLElement>('.td-place [data-target]')].map((el) => ({
      target: el.dataset.target,
      text: el.textContent,
      cls: el.className,
    })),
  ],
  tap: (t) => ((content.acts[0]?.anchors ?? []).includes(t) ? tapPlace(t) : tapTarget(t)),
  tapVariant,
  pick: (p) => hudActions.pick?.(p),
  close: () => {
    session.picked = null;
    session.sheet = null;
    session.place = null;
    draw();
  },
  progress: () => {
    const s = session.s;
    const w = worldOf(s, content);
    const end = w.act.calendar[w.act.calendar.length - 1];
    const endT = end ? (end.day - 1) * 1440 + end.hour * 60 : null;
    return {
      day: Math.floor(s.t / 1440) + 1,
      restored: Math.round(s.stats.restoration ?? 0),
      total: w.facilities.size,
      daysLeft: endT === null ? null : Math.max(0, Math.ceil((endT - s.t) / 1440)),
      deadlineDay: end?.day ?? null,
      anchors: w.act.anchors,
    };
  },
};

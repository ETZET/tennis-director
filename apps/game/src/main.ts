import { createStage, hollowCreek, OrbitCamera } from '@td/render';
import { clamp } from '@td/shared';
import {
  CONTENT,
  type ContentBundle,
  canAssign,
  DIRECTOR,
  type GameState,
  orderStatus,
  postStatus,
  type SimEvent,
  worldOf,
} from '@td/sim';
import { type HudActions, mountHud, setHudStrings } from '@td/ui';
import type * as THREE from 'three';
import { createDebug } from './debug';
import { GameLabels } from './labels';
import { clearAutosave, downloadSave, readAutosave, writeAutosave } from './persist';
import { Projector } from './project';
import { createGameScene } from './scene';
import { Session } from './session';
import { createText, type Lang } from './text';

/**
 * 正式游戏入口：模拟（@td/sim）+ 画面（@td/render）+ 界面（@td/ui）。
 *
 *   真实时间 → Session.frame() → advance() → 领域事件
 *                                       ├→ Projector（HUD 快照、快讯）
 *                                       └→ GameScene（员工走位、演出、设施）
 *   玩家拖人 / 点标记 → HudActions / 岗位标记 → Session.assign → assign 命令（ADR 0012）
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

/* ---------- 舞台 ---------- */
const container = $('stage');
const stage = createStage(container, hollowCreek.HOLLOW_CREEK_LIGHTING);
hollowCreek.buildHollowCreekStage(stage);
const scene = createGameScene(stage, content);
const HOME =
  container.clientWidth / Math.max(1, container.clientHeight) < 0.8
    ? hollowCreek.HOLLOW_CREEK_CAMERA_PORTRAIT
    : hollowCreek.HOLLOW_CREEK_CAMERA.overview;
const camera = new OrbitCamera(stage, HOME, hollowCreek.HOLLOW_CREEK_CAMERA_LIMITS);
window.addEventListener('resize', () => camera.resize());
camera.resize();
camera.bindPointer(stage.renderer.domElement);

// 朝相机那一侧的围网隐藏，场地不像隔着一层玻璃
const fenceBays: { m: THREE.Object3D; nx: number; nz: number }[] = [];
stage.scene.traverse((o) => {
  const n = o.userData.fenceNormal as { x: number; z: number } | undefined;
  if (n) fenceBays.push({ m: o, nx: n.x, nz: n.z });
});
function cutAwayNearFences() {
  const dx = Math.sin(camera.smooth.yaw);
  const dz = Math.cos(camera.smooth.yaw);
  for (const b of fenceBays) b.m.visible = b.nx * dx + b.nz * dz < 0.3;
}

/* ---------- 一局 ---------- */
let session: Session;
let projector: Projector;

function begin(s: Session): void {
  session = s;
  projector = new Projector(content, text);
  scene.sync(s.s);
  camera.reset();
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

/* ---------- 界面 ---------- */
const hudActions: HudActions = {
  rotate: (dir) => camera.rotate(-dir),
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
    }
  },
  // 员工条：点一下拿起来，再点场景里的岗位或工单；或者按住直接拖过去
  pick: (person) => {
    session.picked = person;
    session.sheet = null;
    draw();
  },
  drop: (person, x, y) => {
    const t = targetAt(x, y);
    if (t && 'target' in t) assignTo(person, t.target);
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
};
/** 屏幕上 (x, y) 那儿是地点清单的哪一行，或者哪块地点牌 */
function targetAt(x: number, y: number): { target: string } | { place: string } | null {
  for (const el of document.elementsFromPoint(x, y)) {
    const h = el as HTMLElement;
    const t = h.closest?.<HTMLElement>('[data-target]')?.dataset.target;
    if (t) return { target: t };
    const a = h.closest?.<HTMLElement>('[data-place]')?.dataset.place;
    if (a) return { place: a };
  }
  return null;
}
function assignTo(person: string, target: string): void {
  const w = worldOf(session.s, content);
  if (canAssign(session.s, w, person, target) === null) {
    session.assign(person, target);
    pump([]);
  } else {
    // 派不过去（例如钱不够买料）：打开说明，让玩家看到为什么
    session.picked = null;
    session.sheet = target;
    session.place = worldOf(session.s, content).posts.get(target)?.at ?? w.orders.get(target)?.at ?? session.place;
    draw();
  }
}
const ui = mountHud($('hud'), hudActions);

function answer(key: 1 | 2 | 3): void {
  const o = Projector.focusCard(session.s, content);
  if (!o || session.s.outcome) return;
  const w = worldOf(session.s, content);
  const c = w.cards.get(o.card);
  if (!c) return;
  const keys = (['A', 'B', 'C'] as const).filter((k) => c.options[k]);
  const opt = keys[key - 1];
  if (opt && session.choose(o.uid, opt)) pump([]);
}

const draw = () => ui.update(projector.snapshot(session));

/* ---------- 地点牌、岗位和工单的标记 ---------- */
const labels = new GameLabels($('labels'), stage.cam);
labels.occluders = () =>
  [...document.querySelectorAll('.td-bug,.td-strip-wrap,.td-card,.td-wire,.td-bug-status,.td-staff,.td-sheet')].map(
    (el) => el.getBoundingClientRect(),
  );
// 红土场的站位就在桥头，牌子挪到场地北边线上，不和"人行桥"叠在一起
const LABEL_AT: Record<string, { x: number; z: number }> = { clay_court: hollowCreek.FD.w({ x: 0, z: -10.4 }) };
const ground = (a: string, dy: number) => () => {
  const p = LABEL_AT[a] ?? hollowCreek.STANDS[a] ?? { x: 0, z: 0 };
  return { x: p.x, y: hollowCreek.groundY(p.x, p.z) + dy, z: p.z };
};
const director = () => session.s.people[DIRECTOR];
/** 拉远看整座岛时（手机默认视角），只给总监所在、正要去、有事的地方挂名字；其余缩成小圆点 */
const placeFlags = (a: string) => {
  const s = session.s;
  const d = director();
  const here = !d?.walk && d?.at === a;
  const dest = d?.walk?.to === a;
  const card = s.cards.open.some((o) => {
    const c = worldOf(s, content).cards.get(o.card);
    return (c?.stage?.anchor ?? c?.location) === a;
  });
  return { here, dest, card, dot: labels.compact && !here && !dest && !card };
};
for (const a of content.acts[0]?.anchors ?? []) {
  const placeLabel = labels.add({
    get: ground(a, 0.2),
    lift: () => (placeFlags(a).dot ? 10 : 34),
    // 缩成小圆点的地方如果立着地点牌，圆点就不画了（地点牌本身能点）
    // 立着地点牌的地方，名字和状态（总监在这儿、正要去、有卡）都画在地点牌上（一个地点只有一块牌）
    text: () => (hubOf(a) ? null : text.anchor(a)),
    cls: () => {
      const f = placeFlags(a);
      return `pl${f.here ? ' pl-here' : ''}${f.dest ? ' pl-dest' : ''}${f.card ? ' pl-card' : ''}${f.dot ? ' pl-dot' : ''}`;
    },
  });
  placeLabel.el.dataset.anchor = a;
  const center = (hollowCreek.ANCHORS as Record<string, { x: number; z: number }>)[a];
  labels.add({
    // 活动牌挂在场地中央（地点牌在门口），两块牌子不叠在一起
    get: center
      ? () => ({ x: center.x, y: hollowCreek.groundY(center.x, center.z) + 0.2, z: center.z })
      : ground(a, 0.2),
    lift: 20,
    cls: () => 'act',
    text: () => {
      const s = session.s;
      const r = s.activities.find((x) => x.started && x.anchor === a && s.t < x.end);
      return r
        ? text.fmt('ui.activity', { title: text.tr(`activities.${r.id}.title`), time: text.duration(r.end - s.t) })
        : null;
    },
  });
}

/**
 * 地点牌（ADR 0013）：一个地点一块牌，和这个地点有多少岗位、工单无关。
 * 牌上是此刻要人的岗位（头像带环形进度，空着是红色 +）和一格工单数（按能力上色）。
 * 点它打开拇指区的地点清单；拿着人点它（或拖上去松手）：只有一项能接的活就直接派，有好几项就在清单里选。
 */
const hubCache = new Map<string, ReturnType<Projector['hub']>>();
const hubOf = (a: string) => {
  if (!hubCache.has(a)) hubCache.set(a, projector ? projector.hub(session, a) : null);
  return hubCache.get(a) ?? null;
};
const esc = (x: string) => x.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
function addHubs(c: ContentBundle): void {
  for (const a of c.acts[0]?.anchors ?? []) {
    const m = labels.add(
      {
        get: ground(a, 1.2),
        lift: 6,
        text: () => (hubOf(a) ? text.anchor(a) : null),
        html: () => {
          const h = hubOf(a);
          if (!h) return '';
          const posts = h.posts
            .map(
              (p) =>
                `<span class="hb-p${p.need ? ' hb-need' : ''}${p.on ? ' hb-on' : ''}" style="--p:${Math.round(p.progress * 100)}%${p.color ? `;--c:${p.color}` : ''}">${esc(p.initials)}</span>`,
            )
            .join('');
          const o = h.orders;
          const orders = o.n
            ? `<span class="hb-o${o.crew ? ' hb-on' : ''}">${o.skills.map((k) => `<i class="hb-${k}"></i>`).join('')}⚒${o.progress !== null ? `${Math.round(o.progress * 100)}%` : o.n > 1 ? o.n : ''}</span>`
            : '';
          const name = `<b>${esc(text.anchor(a))}</b>`;
          return `${name}${posts}${orders}`;
        },
        cls: () => {
          const h = hubOf(a);
          const need = h?.posts.some((p) => p.need);
          const f = placeFlags(a);
          return `hub${f.here ? ' hub-here' : ''}${f.dest ? ' hub-dest' : ''}${f.card ? ' hub-card' : ''}${need ? ' hub-need' : ''}${h?.fit === 'fit' ? ' tg-fit' : h?.fit === 'nofit' ? ' tg-nofit' : ''}${session.place === a ? ' hub-open' : ''}`;
        },
      },
      () => tapPlace(a),
    );
    m.el.dataset.place = a;
  }
}
/** 点地点牌（或拿着人落到它上面） */
function tapPlace(a: string, person: string | null = session.picked): void {
  if (person) {
    const fits = projector.placeFits(session, a, person);
    if (fits.length === 1 && fits[0]) return assignTo(person, fits[0]);
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
function tapTarget(id: string): void {
  if (session.picked) assignTo(session.picked, id);
  else {
    session.sheet = session.sheet === id ? null : id;
    draw();
  }
}
const newState = (c: ContentBundle): GameState => Session.fresh(c, 1).s;
addHubs(content);

// 总监走在路上时头顶挂个"你"
labels.add({
  get: () => scene.directorHead(),
  lift: 0,
  cls: () => 'you',
  text: () => (director()?.walk ? text.tr('ui.you') : null),
});

/* ---------- 拖人时手指下面的落点亮起来 ---------- */
let hoverEl: HTMLElement | null = null;
const setHover = (el: HTMLElement | null) => {
  if (el === hoverEl) return;
  hoverEl?.classList.remove('drop-hover');
  hoverEl = el;
  hoverEl?.classList.add('drop-hover');
};
document.addEventListener('pointermove', (e) => {
  // 只在按住拖人时（员工条拿起了人、手指没松开）
  if (!session.picked || !e.buttons) return setHover(null);
  let el: HTMLElement | null = null;
  for (const x of document.elementsFromPoint(e.clientX, e.clientY)) {
    el = (x as HTMLElement).closest?.<HTMLElement>('[data-target],[data-place]') ?? null;
    if (el) break;
  }
  setHover(el);
});
document.addEventListener('pointerup', () => setHover(null));
document.addEventListener('pointercancel', () => setHover(null));

/* ---------- 键盘 ---------- */
window.addEventListener('keydown', (e) => {
  const t = e.target as HTMLElement | null;
  if (t?.closest?.('button,summary,input,select') && (e.key === ' ' || e.key === 'Enter')) return;
  if (t?.closest?.('.tdd') && e.key !== '`') return;
  if (e.key === '`' && debug) debug.toggle();
  else if (e.key === 'q' || e.key === 'Q') camera.rotate(1);
  else if (e.key === 'e' || e.key === 'E') camera.rotate(-1);
  else if (e.key === '+' || e.key === '=') camera.zoomIn();
  else if (e.key === '-' || e.key === '_') camera.zoomOut();
  else if (e.key === 'r' || e.key === 'R') camera.reset();
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
  scene.onEvents(session.s, all);
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
  scene.update(session.s, session.time, dt, session.paused);
  camera.update(dt, scene.focus());
  stage.renderer.render(stage.scene, stage.cam);
  cutAwayNearFences();
  const card = document.querySelector('.td-card');
  camera.occludedBottomPx = card ? container.clientHeight - card.getBoundingClientRect().top : 0;
  const pxPerM = container.clientHeight / (stage.cam.top - stage.cam.bottom);
  labels.compact = pxPerM < 4;
  hubCache.clear();
  labels.place(container.clientWidth, container.clientHeight);
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
  begin(save ? new Session(content, save.state, save.commands) : freshSession());
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
  scene.setContent(c);
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
  let stop = 'time';
  // 按营业分钟数走（夜里跳过的时间不算），每次正好一分钟（R10：/wait/1440 不会走成两天）
  for (let i = 0; i < max; i++) {
    const ev = session.stepMinute();
    pump(ev);
    if (session.s.outcome) stop = 'actEnded';
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
      resync: () => void;
      fastForward: (max: number) => { minutes: number; stop: string };
      answer: (key: 1 | 2 | 3) => void;
      /** 把人派到岗位或工单上（null 叫他停下来）；返回 null，或者为什么没成 */
      assign: (person: string, target: string | null) => string | null;
      /** 员工条的数据 */
      staff: () => unknown;
      /** 某个岗位或工单的说明（和点开时看到的一样） */
      sheet: (target: string) => unknown;
      /** 现在场景里看得见的岗位和工单标记 */
      targets: () => unknown;
      /** 点一个标记（和手指点一样：拿着人就派，没拿就打开说明） */
      tap: (target: string) => void;
      pick: (person: string | null) => void;
      close: () => void;
    };
  }
}
window.__td = {
  session: () => session,
  setContent,
  resync: () => scene.sync(session.s),
  fastForward,
  answer,
  assign: (person, target) => {
    const w = worldOf(session.s, content);
    const why = canAssign(session.s, w, person, target);
    if (why !== null) return `rejected: ${why}`;
    session.assign(person, target);
    pump([]);
    return null;
  },
  staff: () => projector.staff(session),
  sheet: (t) => projector.sheet(session, t),
  // 场景里的地点牌（target 是锚点 id）和打开的地点清单里的行
  targets: () => [
    ...[...document.querySelectorAll<HTMLElement>('#labels [data-place]')]
      .filter((el) => !el.hidden)
      .map((el) => ({ target: el.dataset.place, text: el.textContent, cls: el.className })),
    ...[...document.querySelectorAll<HTMLElement>('.td-place [data-target]')].map((el) => ({
      target: el.dataset.target,
      text: el.textContent,
      cls: el.className,
    })),
  ],
  tap: (t) => ((content.acts[0]?.anchors ?? []).includes(t) ? tapPlace(t) : tapTarget(t)),
  pick: (p) => hudActions.pick?.(p),
  close: () => {
    session.picked = null;
    session.sheet = null;
    session.place = null;
    draw();
  },
};

import { createStage, hollowCreek, OrbitCamera } from '@td/render';
import { clamp, PACE } from '@td/shared';
import { CONTENT, type ContentBundle, type GameState, type SimEvent, worldOf } from '@td/sim';
import { type HudActions, mountHud, setHudStrings } from '@td/ui';
import type * as THREE from 'three';
import { createDebug } from './debug';
import { GameLabels } from './labels';
import { clearAutosave, downloadSave, readAutosave, writeAutosave } from './persist';
import { Projector } from './project';
import { createGameScene } from './scene';
import { MINUTES_PER_SECOND, Session } from './session';
import { createText, type Lang } from './text';

/**
 * 正式游戏入口：模拟（@td/sim）+ 画面（@td/render）+ 界面（@td/ui）。
 *
 *   真实时间 → Session.frame() → advance() → 领域事件
 *                                       ├→ Projector（HUD 快照、快讯）
 *                                       └→ GameScene（总监走位、演出、设施）
 *   玩家点击 → HudActions / 地点牌 → Session.send(命令)
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
  // 公告板：拖一下就改，"每周会怎样"马上跟着变
  plan: (part, weekday, note) => {
    session.send({ type: 'setPlan', part, weekday, activity: note });
    pump([]);
  },
  lockPlan: () => {
    if (session.s.planning) session.send({ type: 'lockPlan' });
    session.plannerOpen = false;
    pump([]);
  },
  closePlanner: () => {
    session.plannerOpen = false;
    draw();
  },
  // 动作圈：走过去、打开公告板，或者去做一件事
  act: (id) => {
    session.ring = null;
    if (id.startsWith('walk:')) session.walkTo(id.slice(5));
    else if (id === 'plan') session.plannerOpen = true;
    else session.send({ type: 'act', action: id });
    session.paused = false;
    pump([]);
  },
  closeRing: () => {
    session.ring = null;
    draw();
  },
};
const ui = mountHud($('hud'), hudActions);

function answer(key: 1 | 2 | 3): void {
  const o = Projector.focusCard(session.s, content);
  if (!o || session.s.outcome) return;
  const w = worldOf(session.s, content);
  const c = w.cards.get(o.card);
  if (!c) return;
  const keys = (['A', 'B', 'C'] as const).filter((k) => c.options[k]);
  const opt = keys[key - 1];
  if (opt && session.choose(o.uid, opt)) {
    // 选了要走过去的选项：继续走时间，不然总监永远走不到
    if (session.intent) session.paused = false;
    pump([]);
  }
}

const draw = () => ui.update(projector.snapshot(session));

/* ---------- 地点牌：点一下总监就走过去 ---------- */
const labels = new GameLabels($('labels'), stage.cam);
labels.occluders = () =>
  [...document.querySelectorAll('.td-bug,.td-strip-wrap,.td-card,.td-wire,.td-bug-status')].map((el) =>
    el.getBoundingClientRect(),
  );
// 红土场的站位就在桥头，牌子挪到场地北边线上，不和"人行桥"叠在一起
const LABEL_AT: Record<string, { x: number; z: number }> = { clay_court: hollowCreek.FD.w({ x: 0, z: -10.4 }) };
const ground = (a: string, dy: number) => () => {
  const p = LABEL_AT[a] ?? hollowCreek.STANDS[a] ?? { x: 0, z: 0 };
  return { x: p.x, y: hollowCreek.groundY(p.x, p.z) + dy, z: p.z };
};
const destination = (s: GameState) =>
  s.director.leg ? (s.director.route[s.director.route.length - 1] ?? s.director.leg.to) : null;
/** 拉远看整座岛时（手机默认视角），只给总监所在、正要去、有事的地方挂名字；其余缩成能点的小圆点 */
const placeFlags = (a: string) => {
  const s = session.s;
  const here = s.director.at === a;
  const dest = destination(s) === a;
  const card = s.cards.open.some((o) => {
    const c = worldOf(s, content).cards.get(o.card);
    return (c?.stage?.anchor ?? c?.location) === a;
  });
  return { here, dest, card, dot: labels.compact && !here && !dest && !card };
};
for (const a of content.acts[0]?.anchors ?? []) {
  const placeLabel = labels.add(
    {
      get: ground(a, 0.2),
      lift: () => (placeFlags(a).dot ? 10 : 34),
      text: () => text.anchor(a),
      cls: () => {
        const f = placeFlags(a);
        return `pl${f.here ? ' pl-here' : ''}${f.dest ? ' pl-dest' : ''}${f.card ? ' pl-card' : ''}${f.dot ? ' pl-dot' : ''}`;
      },
    },
    (el) => {
      // 点地点牌：围着它展开这个地方能做的事
      const r = el.getBoundingClientRect();
      session.ring = { anchor: a, x: r.left + r.width / 2, y: r.bottom + 40 };
      draw();
    },
  );
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
// 站定时地点牌已经变绿，"你"只在路上显示
labels.add({
  get: () => scene.directorHead(),
  lift: 0,
  cls: () => 'you',
  text: () => (session.s.director.leg ? text.tr('ui.you') : null),
});

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
    session.ring = null;
    session.plannerOpen = false;
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
  // 公告板和动作圈打开时，地点牌收起来，不和它们抢位置
  $('labels').style.visibility = session.held ? 'hidden' : '';
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
 * 试玩桥（tools/playtest 用）：一分钟一分钟地快进，直到有新卡打开、要求暂停、本幕结束，或走满 max 分钟。
 * 走完停在暂停状态，像回合制一样把决定交还给试玩者。
 */
function fastForward(max: number): { minutes: number; stop: string } {
  const t0 = session.s.t;
  session.paused = false;
  let stop = 'time';
  for (let i = 0; i < max; i++) {
    if (session.held) {
      stop = 'held';
      break;
    }
    const ev = session.frame(1 / (MINUTES_PER_SECOND * session.speed * (session.idle ? PACE.idleSpeedup : 1)));
    pump(ev);
    if (session.s.outcome) stop = 'actEnded';
    else if (ev.some((e) => e.type === 'cardOpened')) stop = 'cardOpened';
    else if (session.paused) stop = 'pause';
    else if (ev.some((e) => e.type === 'actionFinished')) stop = 'actionFinished';
    else if (session.held) stop = 'held';
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
      walk: (anchor: string) => void;
      /** 试玩桥：点一个地点会弹出的动作圈（数据） */
      ring: (anchor: string) => unknown;
      act: (id: string) => void;
      /** 返回 null，或者这一步为什么没成（例如这张便条不能放在这一格） */
      plan: (part: string, weekday: number, note: string | null) => string | null;
      tap: (anchor: string) => void;
      close: () => void;
      ringData: () => unknown;
      lockPlan: () => void;
      openPlanner: () => void;
      planner: () => unknown;
    };
  }
}
window.__td = {
  session: () => session,
  setContent,
  resync: () => scene.sync(session.s),
  fastForward,
  answer,
  walk: (a) => {
    session.walkTo(a);
    pump([]);
  },
  ring: (a) => projector.ring(session, a, 0, 0),
  act: (id) => hudActions.act?.(id),
  plan: (part, weekday, note) => {
    const n = session.log.length;
    hudActions.plan?.(part, weekday, note);
    return session.log.length > n
      ? null
      : 'rejected (that note cannot go in that slot, or no energy to change the plan)';
  },
  tap: (a) => {
    const el = [...document.querySelectorAll<HTMLElement>('#labels .pl')].find((x) => x.dataset.anchor === a);
    if (el) el.click();
  },
  close: () => {
    session.ring = null;
    session.plannerOpen = false;
    draw();
  },
  ringData: () => (session.ring ? projector.ring(session, session.ring.anchor, 0, 0) : null),
  lockPlan: () => hudActions.lockPlan?.(),
  openPlanner: () => {
    session.plannerOpen = true;
    draw();
  },
  planner: () => (session.s.planning || session.plannerOpen ? projector.planner(session) : null),
};

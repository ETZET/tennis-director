import { createStage, hollowCreek, OrbitCamera } from '@td/render';
import { clamp } from '@td/shared';
import { CONTENT, type ContentBundle, type GameState, type SimEvent, worldOf } from '@td/sim';
import { mountHud } from '@td/ui';
import type * as THREE from 'three';
import { GameLabels } from './labels';
import { clearAutosave, readAutosave, writeAutosave } from './persist';
import { Projector } from './project';
import { createGameScene } from './scene';
import { Session } from './session';
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
const lang: Lang = params.get('lang') === 'zh' ? 'zh' : 'en';
document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';

let content: ContentBundle = CONTENT;
let text = createText(content, lang);

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
const ui = mountHud($('hud'), {
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
});

function answer(key: 1 | 2 | 3): void {
  const o = Projector.focusCard(session.s);
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
const ground = (a: string, dy: number) => () => {
  const p = hollowCreek.STANDS[a] ?? { x: 0, z: 0 };
  return { x: p.x, y: hollowCreek.groundY(p.x, p.z) + dy, z: p.z };
};
const destination = (s: GameState) =>
  s.director.leg ? (s.director.route[s.director.route.length - 1] ?? s.director.leg.to) : null;
for (const a of content.acts[0]?.anchors ?? []) {
  labels.add(
    {
      get: ground(a, 0.2),
      lift: 34,
      text: () => text.anchor(a),
      cls: () => {
        const s = session.s;
        const here = s.director.at === a;
        const dest = destination(s) === a;
        const card = s.cards.open.some((o) => {
          const c = worldOf(s, content).cards.get(o.card);
          return (c?.stage?.anchor ?? c?.location) === a;
        });
        return `pl${here ? ' pl-here' : ''}${dest ? ' pl-dest' : ''}${card ? ' pl-card' : ''}`;
      },
    },
    () => {
      session.walkTo(a);
      if (session.paused) session.paused = false;
      pump([]);
    },
  );
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
  if (e.key === 'q' || e.key === 'Q') camera.rotate(1);
  else if (e.key === 'e' || e.key === 'E') camera.rotate(-1);
  else if (e.key === '+' || e.key === '=') camera.zoomIn();
  else if (e.key === '-' || e.key === '_') camera.zoomOut();
  else if (e.key === 'r' || e.key === 'R') camera.reset();
  else if (e.key === 'f' || e.key === 'F') {
    session.cycleSpeed();
    draw();
  } else if (e.key === '1' || e.key === '2' || e.key === '3') answer(Number(e.key) as 1 | 2 | 3);
  else if (e.key === ' ') {
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
  labels.place(container.clientWidth, container.clientHeight);
  uiT += dt;
  if (uiT > 0.2) {
    uiT = 0;
    draw();
  }
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

/* ---------- 开发用 ---------- */
declare global {
  interface Window {
    __td?: { session: () => Session; setContent: (c: ContentBundle) => void };
  }
}
window.__td = {
  session: () => session,
  setContent(c) {
    content = c;
    text = createText(c, lang);
    session.content = c;
    projector = new Projector(c, text);
    scene.setContent(c);
    draw();
  },
};

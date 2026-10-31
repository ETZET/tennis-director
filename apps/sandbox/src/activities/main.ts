import { activities, type PeopleWorld, Scheduler } from '@td/render';
import { clamp, mulberry32 } from '@td/shared';
import * as THREE from 'three';
import { CATEGORY_INFO, effectsFor, SCENE_NOTES, VENUE_NAMES, WEATHER_NAMES } from './effects';

/**
 * 活动动画库（sandbox）：总览按分类排开，每张卡是一座正在演的小岛；点开进入大舞台，
 * 调全局条件和本活动变量，看当前效果。演出全部来自 @td/render 的 activities（游戏用的同一套）。
 * 一个渲染器、一张全屏画布，每张卡画在自己的矩形里（剪裁）。始终按屏幕原生像素渲染。
 */

const { ACTIVITY_META, buildDiorama, startActivity, resolveParams, textFor, textAt, CATEGORIES, WEATHERS, VENUES } =
  activities;
type Meta = activities.ActivityMeta;
type Conditions = activities.Conditions;
type ParamValue = activities.ParamValue;

const params = new URLSearchParams(location.search);
const LANG: activities.Lang = params.get('lang') === 'en' ? 'en' : 'zh';
const T = (k: string, v?: Record<string, string | number>) => textFor(LANG, k, Math.random, v);
const REDUCED = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

const $ = <E extends HTMLElement = HTMLElement>(id: string): E => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} missing`);
  return el as E;
};

/* ---------------- 全局状态 ---------------- */
const ST = {
  C: { fatigue: 0.25, weather: 'sun', coach: 3, venue: 'generic' } as Conditions,
  speed: 1,
  paused: false,
  focus: null as Card | null,
};
// 截图 / 调试：?venue=hollow&wx=rain&fat=60&coach=2
const qv = params.get('venue');
if (qv && (VENUES as readonly string[]).includes(qv)) ST.C.venue = qv as Conditions['venue'];
const qw = params.get('wx');
if (qw && (WEATHERS as readonly string[]).includes(qw)) ST.C.weather = qw as Conditions['weather'];
if (params.get('fat')) ST.C.fatigue = clamp(Number(params.get('fat')) / 100, 0, 1);
if (params.get('coach')) ST.C.coach = clamp(Math.round(Number(params.get('coach'))), 1, 5);
const CAT_COL: Record<activities.Category, string> = {
  train: 'var(--train)',
  recruit: 'var(--recruit)',
  match: 'var(--match)',
  team: 'var(--team)',
};

/* ---------------- 一张卡 = 一座小岛 + 一个活动 ---------------- */
let seedN = 1;
class Card {
  readonly vars: Record<string, ParamValue>;
  view = { yaw: 0, pitch: 0, zoom: 1 };
  dirty = true;
  scene: THREE.Scene | null = null;
  sky = new THREE.Color('#a9d0e3');
  readonly cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 900);
  el: HTMLElement | null = null;
  noteEl: HTMLElement | null = null;
  private sched = new Scheduler();
  private world: PeopleWorld | null = null;
  private dio: activities.Diorama | null = null;
  private run: activities.ActivityRun | null = null;
  private now = 0;
  constructor(readonly meta: Meta) {
    this.vars = resolveParams(meta);
  }
  build(): void {
    this.dispose();
    const seed = seedN++;
    const dio = buildDiorama(this.meta, ST.C, seed);
    this.dio = dio;
    this.scene = dio.scene;
    this.sky = dio.sky;
    this.sched = new Scheduler();
    this.world = { scene: dio.scene, groundY: dio.groundY, people: [] };
    this.run = startActivity(
      {
        scene: dio.scene,
        sched: this.sched,
        world: this.world,
        groundY: dio.groundY,
        lang: LANG,
        rand: mulberry32(seed * 7919),
      },
      this.meta.id,
      {
        area: dio.area,
        bounds: dio.bounds,
        conditions: { ...ST.C },
        params: this.vars,
        seed,
        extras: { passers: true, badges: true, perches: dio.perches },
      },
    );
    this.now = 0;
    this.dirty = false;
  }
  dispose(): void {
    this.run?.stop();
    this.dio?.dispose();
    this.run = null;
    this.dio = null;
    this.scene = null;
  }
  update(dt: number): void {
    if (this.dirty || this.run?.finished) this.build();
    if (!this.world || !this.dio) return;
    this.now += dt;
    this.sched.advance(dt);
    for (const p of [...this.world.people]) p.update(dt, this.sched.now);
    this.dio.update(dt);
  }
  /** 正交相机取景：stage 模式用拖动和缩放 */
  fit(aspect: number, stage: boolean): void {
    const { W, D } = this.meta.size;
    const R = Math.hypot(W, D) / 2;
    const v = this.view;
    const vw = this.meta.view ?? {};
    // 竖屏手机：岛宽占满屏幕宽
    const zoom = (stage ? v.zoom : 1) * (vw.zoom ?? 1);
    const vh = Math.max(R * 1.22, (R * 1.72) / aspect) / zoom;
    const c = this.cam;
    c.left = (-vh * aspect) / 2;
    c.right = (vh * aspect) / 2;
    c.top = vh / 2;
    c.bottom = -vh / 2;
    const yaw = (vw.yaw ?? 0.7) + (stage ? v.yaw : REDUCED ? 0 : Math.sin(this.now * 0.12) * 0.08);
    const pitch = clamp((vw.pitch ?? 0.6) + (stage ? v.pitch : 0), 0.28, 1.35);
    const sh = this.run?.shake ?? 0;
    const sx = sh > 0 ? (Math.random() * 2 - 1) * sh * 0.4 : 0;
    const sz = sh > 0 ? (Math.random() * 2 - 1) * sh * 0.4 : 0;
    const Dd = 260;
    const cp = Math.cos(pitch);
    c.position.set(sx + Dd * cp * Math.sin(yaw), 0.2 + Dd * Math.sin(pitch), sz + Dd * cp * Math.cos(yaw));
    c.lookAt(sx, 0.2, sz);
    c.updateProjectionMatrix();
  }
}

const CARDS = ACTIVITY_META.map((m) => new Card(m));
const BY_ID = new Map(CARDS.map((c) => [c.meta.id, c]));

/* ---------------- 总览 ---------------- */
const catsEl = $('cats');
for (const cat of CATEGORIES) {
  const info = CATEGORY_INFO[cat];
  const list = CARDS.filter((c) => c.meta.category === cat);
  const sec = document.createElement('section');
  sec.className = 'cat';
  sec.style.setProperty('--cc', CAT_COL[cat]);
  const head = document.createElement('div');
  head.className = 'cat-h';
  head.append(el('h2', info.name), el('span', info.en, 'en'), el('p', info.desc));
  const grid = document.createElement('div');
  grid.className = 'cards';
  for (const c of list) {
    const a = document.createElement('a');
    a.className = 'card';
    a.href = `#${c.meta.id}`;
    a.style.setProperty('--cc', CAT_COL[cat]);
    const view = el('div', '', 'view');
    view.append(el('span', info.en, 'chip'));
    const meta = el('div', '', 'meta');
    const h3 = document.createElement('h3');
    h3.append(el('span', T(c.meta.titleKey)), el('small', textFor('en', c.meta.titleKey)));
    const tags = el('div', '', 'tags');
    c.meta.tags.forEach((t, i) => {
      tags.append(el('span', T(t), i >= 3 ? 'tag sp' : 'tag'));
    });
    const note = el('p', '', 'sn');
    meta.append(h3, el('p', T(c.meta.descKey)), note, tags);
    a.append(view, meta);
    grid.append(a);
    c.el = view;
    c.noteEl = note;
  }
  sec.append(head, grid);
  catsEl.append(sec);
}
function el(tag: string, text: string, cls?: string): HTMLElement {
  const e = document.createElement(tag);
  if (text) e.textContent = text;
  if (cls) e.className = cls;
  return e;
}

/* ---------------- 活动列表（舞台） ---------------- */
const side = $('side');
{
  const back = el('a', '← 总览', 'back') as HTMLAnchorElement;
  back.href = '#';
  side.append(back);
  for (const cat of CATEGORIES) {
    const g = el('div', CATEGORY_INFO[cat].name, 'grp');
    g.style.setProperty('--cc', CAT_COL[cat]);
    side.append(g);
    for (const c of CARDS.filter((x) => x.meta.category === cat)) {
      const l = el('a', T(c.meta.titleKey)) as HTMLAnchorElement;
      l.href = `#${c.meta.id}`;
      l.dataset.id = c.meta.id;
      l.style.setProperty('--cc', CAT_COL[cat]);
      side.append(l);
    }
  }
}

/* ---------------- 全局条件 ---------------- */
const allDirty = () => {
  for (const c of CARDS) c.dirty = true;
};
const sumEl = $('sum');
const paintSummary = () => {
  sumEl.textContent = `${VENUE_NAMES[ST.C.venue]} · ${WEATHER_NAMES[ST.C.weather]} · 疲劳 ${Math.round(ST.C.fatigue * 100)}% · ${'★'.repeat(ST.C.coach)}`;
  for (const c of CARDS) {
    const n = SCENE_NOTES[ST.C.venue]?.[c.meta.id];
    if (!c.noteEl) continue;
    c.noteEl.hidden = !n;
    c.noteEl.textContent = n ? `${VENUE_NAMES[ST.C.venue]}：${n}` : '';
  }
  if (ST.focus) buildPanel(ST.focus);
};
const sumBtn = $('sumBtn');
const condsEl = $('conds');
sumBtn.addEventListener('click', () => {
  const open = !condsEl.classList.contains('open');
  condsEl.classList.toggle('open', open);
  sumBtn.setAttribute('aria-expanded', String(open));
});
const seg = <K extends string>(
  host: HTMLElement,
  items: readonly K[],
  name: (k: K) => string,
  get: () => K,
  set: (k: K) => void,
) => {
  const paint = () => {
    for (const b of host.children) b.setAttribute('aria-pressed', String((b as HTMLElement).dataset.k === get()));
  };
  for (const k of items) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = name(k);
    b.dataset.k = k;
    b.addEventListener('click', () => {
      set(k);
      paint();
    });
    host.append(b);
  }
  paint();
};
seg(
  $('venue'),
  VENUES,
  (k) => VENUE_NAMES[k],
  () => ST.C.venue,
  (k) => {
    ST.C.venue = k;
    allDirty();
    paintSummary();
  },
);
seg(
  $('wx'),
  WEATHERS,
  (k) => WEATHER_NAMES[k],
  () => ST.C.weather,
  (k) => {
    ST.C.weather = k;
    allDirty();
    paintSummary();
  },
);
const fat = $<HTMLInputElement>('fat');
const fatV = $('fatV');
fat.value = String(Math.round(ST.C.fatigue * 100));
fatV.textContent = `${fat.value}%`;
// 疲劳不重建场景，演出每次读取时生效（和原型一致）；只是放手时才重建，避免拖动中反复重建
fat.addEventListener('input', () => {
  fatV.textContent = `${fat.value}%`;
  ST.C.fatigue = Number(fat.value) / 100;
  paintSummary();
});
fat.addEventListener('change', allDirty);
const coachEl = $('coach');
const paintPips = () => {
  [...coachEl.children].forEach((b, i) => {
    b.classList.toggle('on', i < ST.C.coach);
    b.setAttribute('aria-pressed', String(i + 1 === ST.C.coach));
  });
};
for (let i = 1; i <= 5; i++) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = '★';
  b.setAttribute('aria-label', `教练 ${i} 星`);
  b.addEventListener('click', () => {
    ST.C.coach = i;
    paintPips();
    allDirty();
    paintSummary();
  });
  coachEl.append(b);
}
paintPips();

/* ---------------- 舞台面板 ---------------- */
const sParams = $('sParams');
const sFx = $('sFx');
const stageEl = $('stage');
function buildPanel(c: Card): void {
  const cat = CATEGORY_INFO[c.meta.category];
  stageEl.style.setProperty('--cc', CAT_COL[c.meta.category]);
  $('sName').textContent = T(c.meta.titleKey);
  $('sCat').textContent =
    `${cat.name} · ${textFor('en', c.meta.titleKey)}${ST.C.venue !== 'generic' ? ` · ${VENUE_NAMES[ST.C.venue]}` : ''}`;
  $('sDesc').textContent = T(c.meta.descKey);
  sParams.textContent = '';
  if (!c.meta.params.length) sParams.append(el('p', '这个活动只受顶部的疲劳、天气、教练和场景影响。', 'none'));
  for (const p of c.meta.params) {
    const w = el('div', '', 'pctl');
    const row = el('div', '', 'row');
    const out = document.createElement('output');
    row.append(el('span', T(p.labelKey)), out);
    w.append(row);
    const setOut = () => {
      const v = c.vars[p.key] as ParamValue;
      if (p.type === 'range')
        out.textContent =
          p.valueKey === 'val.strength'
            ? textAt(LANG, p.valueKey, Number(v) - p.min)
            : p.valueKey
              ? T(p.valueKey, { v })
              : String(v);
      else out.textContent = T(p.opts.find((o) => o.v === v)?.labelKey ?? '');
    };
    if (p.type === 'range') {
      const r = document.createElement('input');
      r.type = 'range';
      r.className = 'plain';
      r.min = String(p.min);
      r.max = String(p.max);
      r.step = String(p.step);
      r.value = String(c.vars[p.key]);
      r.setAttribute('aria-label', T(p.labelKey));
      r.addEventListener('input', () => {
        c.vars[p.key] = Number(r.value);
        setOut();
        drawFx(c);
      });
      r.addEventListener('change', () => {
        c.dirty = true;
      });
      w.append(r);
    } else {
      const s = el('div', '', 'seg');
      for (const o of p.opts) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = T(o.labelKey);
        b.setAttribute('aria-pressed', String(c.vars[p.key] === o.v));
        b.addEventListener('click', () => {
          c.vars[p.key] = o.v;
          for (const x of s.children) x.setAttribute('aria-pressed', String(x === b));
          setOut();
          drawFx(c);
          c.dirty = true;
        });
        s.append(b);
      }
      w.append(s);
    }
    setOut();
    sParams.append(w);
  }
  for (const l of side.querySelectorAll<HTMLAnchorElement>('a[data-id]')) {
    l.setAttribute('aria-current', String(l.dataset.id === c.meta.id));
    if (l.dataset.id === c.meta.id) l.scrollIntoView({ block: 'nearest', inline: 'center' });
  }
  drawFx(c);
}
function drawFx(c: Card): void {
  const items = effectsFor(c.meta.id, ST.C, c.vars);
  const sn = SCENE_NOTES[ST.C.venue]?.[c.meta.id];
  sFx.textContent = '';
  if (sn) sFx.append(el('li', `场景 · ${VENUE_NAMES[ST.C.venue]}：${sn}`, 'scene'));
  for (const it of items) sFx.append(el('li', it.t, it.warn ? 'warn' : ''));
}

/* ---------------- 播放控制 ---------------- */
const bPause = $('bPause');
const setPaused = (p: boolean) => {
  ST.paused = p;
  bPause.textContent = p ? '▶' : '❚❚';
  bPause.setAttribute('aria-pressed', String(p));
};
bPause.addEventListener('click', () => setPaused(!ST.paused));
const SPEEDS = [1, 2, 0.5];
const bSpeed = $('bSpeed');
bSpeed.addEventListener('click', () => {
  ST.speed = SPEEDS[(SPEEDS.indexOf(ST.speed) + 1) % SPEEDS.length] as number;
  bSpeed.textContent = `${ST.speed === 0.5 ? '½' : ST.speed}×`;
});
$('bReplay').addEventListener('click', () => {
  if (ST.focus) ST.focus.dirty = true;
});
$('bView').addEventListener('click', () => {
  if (ST.focus) ST.focus.view = { yaw: 0, pitch: 0, zoom: 1 };
});
window.addEventListener('keydown', (e) => {
  const t = e.target as HTMLElement | null;
  if (t?.closest?.('button,input,a')) return;
  if (e.key === ' ' && ST.focus) {
    e.preventDefault();
    setPaused(!ST.paused);
  }
});

/* ---------------- 舞台相机：拖动旋转、双指 / 滚轮缩放（指针事件） ---------------- */
const sview = $('sview');
{
  const ptr = new Map<number, { x: number; y: number }>();
  let pinch: { d: number; z: number } | null = null;
  sview.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).closest('button')) return;
    sview.setPointerCapture(e.pointerId);
    ptr.set(e.pointerId, { x: e.clientX, y: e.clientY });
    sview.classList.add('drag');
    if (ptr.size === 2 && ST.focus) {
      const [p, q] = [...ptr.values()] as [{ x: number; y: number }, { x: number; y: number }];
      pinch = { d: Math.hypot(p.x - q.x, p.y - q.y), z: ST.focus.view.zoom };
    }
  });
  sview.addEventListener('pointermove', (e) => {
    const p = ptr.get(e.pointerId);
    if (!p || !ST.focus) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    const v = ST.focus.view;
    if (ptr.size === 2 && pinch) {
      const [a, b] = [...ptr.values()] as [{ x: number; y: number }, { x: number; y: number }];
      v.zoom = clamp((pinch.z * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.d, 0.6, 3);
      return;
    }
    v.yaw -= dx * 0.008;
    v.pitch = clamp(v.pitch + dy * 0.005, -0.3, 0.7);
  });
  const end = (e: PointerEvent) => {
    ptr.delete(e.pointerId);
    if (ptr.size < 2) pinch = null;
    if (!ptr.size) sview.classList.remove('drag');
  };
  sview.addEventListener('pointerup', end);
  sview.addEventListener('pointercancel', end);
  sview.addEventListener(
    'wheel',
    (e) => {
      if (!ST.focus) return;
      e.preventDefault();
      const v = ST.focus.view;
      v.zoom = clamp(v.zoom * Math.exp(-e.deltaY * 0.0013), 0.6, 3);
    },
    { passive: false },
  );
}

/* ---------------- 路由 ---------------- */
const ovEl = $('overview');
function route(): void {
  const c = BY_ID.get(location.hash.slice(1));
  if (c) {
    ST.focus = c;
    ovEl.hidden = true;
    stageEl.hidden = false;
    condsEl.classList.remove('open');
    sumBtn.setAttribute('aria-expanded', 'false');
    buildPanel(c);
    $('sheet').scrollTop = 0;
  } else {
    ST.focus = null;
    ovEl.hidden = false;
    stageEl.hidden = true;
  }
  // 只留当前看得见的卡的场景，其余释放
  for (const x of CARDS) if (c && x !== c) x.dispose();
}
window.addEventListener('hashchange', route);

/* ---------------- 渲染 ---------------- */
const canvas = $<HTMLCanvasElement>('gl');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false,
  alpha: true,
  powerPreference: 'high-performance',
});
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.BasicShadowMap;
renderer.setClearColor(0x000000, 0);
function resize(): void {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', resize);
resize();

const barEl = $('bar');
function draw(c: Card, r: DOMRect, stage: boolean, clipTop: number): void {
  if (!c.scene) return;
  const W = window.innerWidth;
  const H = window.innerHeight;
  const x0 = Math.max(r.left, 0);
  const x1 = Math.min(r.right, W);
  const y0 = Math.max(r.top, clipTop);
  const y1 = Math.min(r.bottom, H);
  if (x1 - x0 < 2 || y1 - y0 < 2) return;
  c.fit(r.width / r.height, stage);
  const cam = c.cam;
  const { left: L, right: R, top: Tp, bottom: B } = cam;
  cam.left = L + ((R - L) * (x0 - r.left)) / r.width;
  cam.right = L + ((R - L) * (x1 - r.left)) / r.width;
  cam.top = Tp - ((Tp - B) * (y0 - r.top)) / r.height;
  cam.bottom = Tp - ((Tp - B) * (y1 - r.top)) / r.height;
  cam.updateProjectionMatrix();
  renderer.setViewport(x0, H - y1, x1 - x0, y1 - y0);
  renderer.setScissor(x0, H - y1, x1 - x0, y1 - y0);
  renderer.setClearColor(c.sky, 1);
  renderer.render(c.scene, cam);
}

let last = performance.now();
function frame(ts: number): void {
  requestAnimationFrame(frame);
  const rdt = clamp((ts - last) / 1000, 0, 0.05);
  last = ts;
  renderer.setScissorTest(false);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  renderer.setScissorTest(true);
  const clipTop = Math.max(barEl.getBoundingClientRect().bottom, condsEl.getBoundingClientRect().bottom);
  if (ST.focus) {
    const c = ST.focus;
    c.update(ST.paused ? 0 : rdt * ST.speed);
    draw(c, sview.getBoundingClientRect(), true, 0);
  } else {
    for (const c of CARDS) {
      if (!c.el) continue;
      const r = c.el.getBoundingClientRect();
      if (r.bottom < clipTop || r.top > window.innerHeight) continue;
      c.update(rdt);
      draw(c, r, false, clipTop);
    }
  }
}

paintSummary();
route();
requestAnimationFrame(frame);
// 调试：控制台里看各卡
(window as unknown as { __cards: Card[] }).__cards = CARDS;

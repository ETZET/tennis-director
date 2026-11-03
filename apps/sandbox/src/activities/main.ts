import {
  activities,
  type Box,
  createIsoWorld,
  daylightAt,
  type IsoCameraPose,
  type IsoWorld,
  type Node,
  type PeopleWorld,
  Scheduler,
  setPeopleView,
} from '@td/iso';
import { clamp, mulberry32 } from '@td/shared';
import { CATEGORY_INFO, effectsFor, SCENE_NOTES, VENUE_NAMES, WEATHER_NAMES } from './effects';

/**
 * 活动动画库（sandbox）：总览按分类排开，每张卡是一座正在演的小岛；点开进入大舞台，
 * 调全局条件和本活动变量，看当前效果。演出全部来自 @td/iso 的 activities（游戏用的同一套）。
 * 每张卡（和舞台）各有一个 IsoWorld（Canvas 2D 等距像素画面），只推进和绘制看得见的卡。
 * 小岛的地面画进 IsoWorld 的地面贴图、换不掉，所以重建一座小岛就是重建一个 IsoWorld。
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
/** 天气 → 光照：雨天、阴天压暗（daylight 的 rain 参数），中午的光 */
const WX_DIM: Record<Conditions['weather'], number> = { sun: 0, cloud: 0.35, rain: 0.8, wind: 0.1, heat: 0 };
/** 地台侧面算进取景的高度（米）：只露出上面一截 */
const SLAB_SHOW = 2.5;

/**
 * 临时绕开（已报给 iso）：diorama 的"岛体"方块整个在地面以下（顶面 y = -0.06），作为静态节点画在地面贴图上面，
 * 把球场、草地全盖住了；地台侧面 IsoView 已经画了，这里把整个埋在地下的方块藏掉。
 */
function hideBuried(n: Node): void {
  for (const c of n.children) {
    if (c.kind === 'box' && c.position.y + (c as Box).h / 2 < -0.03) c.visible = false;
    hideBuried(c);
  }
}

let seedN = 1;
class Card {
  readonly vars: Record<string, ParamValue>;
  dirty = true;
  /** 当前画在哪个元素里（总览的卡片或舞台），换了就重建 */
  host: HTMLElement | null = null;
  el: HTMLElement | null = null;
  noteEl: HTMLElement | null = null;
  world: IsoWorld | null = null;
  /** 舞台上用户调过的镜头：重建时保留 */
  private pose: IsoCameraPose | null = null;
  private sched = new Scheduler();
  private people: PeopleWorld | null = null;
  private dio: activities.Diorama | null = null;
  private run: activities.ActivityRun | null = null;
  private now = 0;
  constructor(readonly meta: Meta) {
    this.vars = resolveParams(meta);
  }
  /** 把画面挪到另一个元素（舞台 / 卡片）；null = 拆掉 */
  attach(host: HTMLElement | null): void {
    if (host === this.host) return;
    this.dispose();
    this.pose = null;
    this.host = host;
    this.dirty = true;
  }
  build(): void {
    const keep = this.world ? { ...this.world.camera.target } : this.pose;
    this.dispose();
    const host = this.host;
    if (!host) return;
    const seed = seedN++;
    const { W, D } = this.meta.size;
    const island = { x0: -W / 2, x1: W / 2, z0: -D / 2, z1: D / 2 };
    const stage = host === sview;
    const world = createIsoWorld(host, { sky: '#a9d0e3', bounds: island, slab: island });
    // 画布垫在标题、按钮下面
    host.prepend(world.view.canvas);
    if (!stage) {
      // 总览：画布不吃指针，点卡片进舞台、上下滑动滚页面
      world.camera.enabled = false;
      world.view.canvas.style.pointerEvents = 'none';
    }
    const dio = buildDiorama(world, this.meta, ST.C, seed);
    hideBuried(dio.root);
    world.view.invalidate();
    host.style.background = dio.sky;
    world.view.setLight(daylightAt(12 * 60 + 30, WX_DIM[ST.C.weather]));
    // 取景：等距下小岛横向占 (W + D)·k，纵向 (W + D)·k/2 加地台侧面和人的高度
    const vw = this.meta.view ?? {};
    const BW = world.view.BW;
    const BH = world.view.BH;
    const fitK = Math.min((BW * 0.94) / (W + D), (BH * 0.92) / ((W + D) / 2 + (SLAB_SHOW + 2.6) * 1.225));
    const k = clamp(fitK * (vw.zoom ?? 1), 2, 15.6);
    const home: IsoCameraPose = { tx: 0.6, tz: 0.6, zoom: k, rot: 0 };
    world.camera.limits = { zoom: [Math.min(2, k), 15.6], tx: [-W / 2, W / 2], tz: [-D / 2, D / 2] };
    world.camera.home = home;
    world.camera.setPose(stage && keep ? keep : home);
    this.world = world;
    this.dio = dio;
    this.sched = new Scheduler();
    this.people = { scene: dio.scene, groundY: dio.groundY, people: [] };
    this.run = startActivity(
      {
        scene: dio.scene,
        sched: this.sched,
        world: this.people,
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
    if (this.world) this.pose = { ...this.world.camera.target };
    this.run?.stop();
    this.dio?.dispose();
    this.world?.dispose();
    this.run = null;
    this.dio = null;
    this.world = null;
    this.people = null;
  }
  /** 推进 dt（演出时间，暂停时 0），rdt 是真实时间（镜头缓动） */
  frame(dt: number, rdt: number): void {
    if (this.dirty || this.run?.finished) this.build();
    const w = this.world;
    if (!w || !this.people || !this.dio) return;
    // 先定镜头，再按镜头的转角和缩放更新人物（朝向、挂点）
    w.camera.update(rdt, null);
    const pr = w.view.proj;
    setPeopleView(pr.ang, pr.k, pr.spriteScale);
    this.now += dt;
    this.sched.advance(dt);
    for (const p of [...this.people.people]) p.update(dt, this.sched.now);
    this.dio.update(dt);
    w.render(rdt, this.now);
    // 画面震动（ACE、天才出现）：挪画布
    const sh = this.run?.shake ?? 0;
    const cv = w.view.canvas;
    if (sh > 0 && !REDUCED) {
      const a = sh * 6;
      cv.style.transform = `translate(${Math.round((Math.random() * 2 - 1) * a)}px,${Math.round((Math.random() * 2 - 1) * a)}px)`;
    } else if (cv.style.transform) cv.style.transform = '';
  }
  rotate(steps: number): void {
    this.world?.camera.rotate(steps);
  }
  zoom(dir: 1 | -1): void {
    if (dir > 0) this.world?.camera.zoomIn();
    else this.world?.camera.zoomOut();
  }
  resetView(): void {
    const c = this.world?.camera;
    if (c) c.setPose({ ...c.home, rot: c.target.rot }, false);
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
$('bView').addEventListener('click', () => ST.focus?.resetView());
$('bRot').addEventListener('click', () => ST.focus?.rotate(1));
$('bIn').addEventListener('click', () => ST.focus?.zoom(1));
$('bOut').addEventListener('click', () => ST.focus?.zoom(-1));
window.addEventListener('keydown', (e) => {
  const t = e.target as HTMLElement | null;
  if (t?.closest?.('button,input,a')) return;
  if (!ST.focus) return;
  if (e.key === ' ') {
    e.preventDefault();
    setPaused(!ST.paused);
  } else if (e.key === 'q' || e.key === 'Q') ST.focus.rotate(1);
  else if (e.key === 'e' || e.key === 'E') ST.focus.rotate(-1);
});

/* ---------------- 舞台：拖动平移、双指 / 滚轮缩放由 IsoWorld 的镜头处理（画布上的指针事件） ---------------- */
const sview = $('sview');

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
  // 舞台上只留当前活动的画面；回到总览时每张卡画回自己的卡片里（看得见时才建）
  for (const x of CARDS) x.attach(c ? (x === c ? sview : null) : x.el);
}
window.addEventListener('hashchange', route);

/* ---------------- 渲染 ---------------- */
const barEl = $('bar');
let last = performance.now();
function frame(ts: number): void {
  requestAnimationFrame(frame);
  const rdt = clamp((ts - last) / 1000, 0, 0.05);
  last = ts;
  if (ST.focus) {
    ST.focus.frame(ST.paused ? 0 : rdt * ST.speed, rdt);
    return;
  }
  const clipTop = Math.max(barEl.getBoundingClientRect().bottom, condsEl.getBoundingClientRect().bottom);
  for (const c of CARDS) {
    if (!c.el) continue;
    const r = c.el.getBoundingClientRect();
    if (r.bottom < clipTop || r.top > window.innerHeight) continue;
    c.frame(rdt, rdt);
  }
}

paintSummary();
route();
requestAnimationFrame(frame);
// 调试 / 截图：控制台里看各卡
(window as unknown as { __cards: Card[] }).__cards = CARDS;

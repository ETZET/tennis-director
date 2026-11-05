import './care.css';
import {
  type Custom,
  createTumbleweed,
  type IsoCamera,
  type IsoCameraLimits,
  type IsoCameraPose,
  type IsoWorld,
  Particles,
  type PeopleWorld,
  Person,
  type Site,
  SpriteLayer,
  type Tumbleweed,
} from '@td/iso';
import { mulberry32, type Rand } from '@td/shared';
import {
  type CareResult,
  type ContentBundle,
  canCare,
  careMinutes,
  type MessKind,
  messOf,
  surfaceOf,
  worldOf,
} from '@td/sim';
import type { Session } from '../session';
import type { Text } from '../text';
import { artCanvas } from './art';
import {
  createNet,
  createOverlay,
  createReticle,
  createTool,
  hideAround,
  type NetView,
  type OverlayState,
  type Reticle,
  type ToolView,
} from './draw';
import { buzz, flash, floatText, makeEvery, retrigger, SND } from './juice';
import { CareModel, clearedPercent, FINISH_AT, type Tool, workable } from './model';

/**
 * 亲手扫（court-care-contract.md「小游戏」，ADR 0022）：总监亲手扫一块球场。从 sandbox demo 06 第二轮搬进正式游戏：
 * 在游戏自己的 IsoWorld 和镜头里跑（镜头对准这块场、拖工具时不平移，完了还原），只给场上真有的脏乱配工具，
 * 扫把推沙像推雪、压路滚、画线车（笔尖在手指上方、30 像素吸住、16 像素内算画正）、球网张力计、总监跟着手指跑、扬尘粒子、
 * 剩 8% 一口气收尾、阵风把沙吹回来。小游戏期间游戏时间停着（session.care），收工发一条 careFinish（每项清掉的比例），
 * 不扫了什么都不发。数由模拟算，这里只报"清掉了什么"。
 */

export interface CareDeps {
  /** main.ts 的 stage */
  world: IsoWorld;
  /** stage.camera */
  camera: IsoCamera;
  site: Site;
  /** 读档会换 Session、热重载会换内容和文案，这三样用 getter */
  session: () => Session;
  content: () => ContentBundle;
  text: () => Text;
  /** main.ts 的 container（#stage）：小游戏在里面挂自己的全屏 DOM 层，挡住地图的指针事件 */
  host: HTMLElement;
  /** = scene.careStage（代理 D 实现）：给设施 → 场景藏起这块场的脏乱叠层、真总监、门口的会员和打球的人；null → 还原 */
  stage(facility: string | null): void;
}

export interface CareGame {
  /** 正在扫的设施 */
  readonly active: string | null;
  /** canCare 不是 null 就返回 false、什么都不做 */
  open(facility: string): boolean;
  /** 每帧，真实秒（游戏时间停着） */
  update(dt: number): void;
  /** 放弃：不发命令、还原 */
  close(): void;
}

/** 画线时笔尖在手指上方多少 CSS 像素 */
const PEN = 46;
/** 画线的容差（CSS 像素，不随缩放变）：吸住、画正、手抖 */
const GRAB_PX = 30;
const GOOD_PX = 16;
const WOB_PX = 30;
/** 捡东西：手指多少 CSS 像素以内算碰到 */
const PICK_PX = 24;
/** 挂网的目标张力 */
const NET_TARGET = 0.72;

/** 总监的样子（和 scene.ts 的总监一样） */
const DIRECTOR_LOOK = {
  shirt: '#2f5a55',
  trim: '#e6b03c',
  shorts: '#7d6f55',
  pants: true,
  skin: '#c68642',
  hair: '#4a3020',
  hairStyle: 'short',
  shoes: '#3a2a20',
} as const;

const clamp = (v: number, a: number, b: number) => (v < a ? a : Math.min(v, b));
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

interface SavedView {
  pose: IsoCameraPose;
  limits: IsoCameraLimits;
  enabled: boolean;
  follow: boolean;
  occluded: number;
  pixelSize: number | undefined;
}

/**
 * 换每个缓冲像素多少 CSS 像素（手机上 1 → 2：人 28 像素高、沙粒看得清，3× 手机上是 6 个物理像素，整数倍不糊）。
 * 用 IsoView.setPixelSize，再让镜头 resize。
 */
function setPixelSize(cam: IsoCamera, n: number | undefined): void {
  cam.view.setPixelSize(n);
  cam.resize();
}

interface Stroke {
  id: number;
  /** 上一个工具点（局部） */
  u: number;
  v: number;
  du: number;
  dv: number;
  y0: number;
  lock: number;
  lastP: number;
  first: boolean;
}

interface Run {
  f: string;
  m: CareModel;
  rnd: Rand;
  saved: SavedView;
  root: HTMLElement;
  $: (sel: string) => HTMLElement;
  nodes: Custom[];
  hidden: { visible: boolean }[];
  pw: PeopleWorld;
  you: Person;
  parts: Particles;
  fx: SpriteLayer;
  ost: OverlayState;
  nv: NetView | null;
  tv: ToolView;
  rt: Reticle;
  toolNode: Custom;
  retNode: Custom;
  tool: Tool;
  stroke: Stroke | null;
  phase: 'intro' | 'work' | 'done';
  now: number;
  elapsed: number;
  done: { sand: boolean; water: boolean; cracks: boolean; all: boolean };
  gusts: { at: number; warned: boolean; done: boolean; side: 1 | -1 }[];
  gustNow: number;
  gustSide: 1 | -1;
  tumble: Tumbleweed | null;
  tumbleT: number;
  net: { drag: boolean; t: number; lastTick: number; target: number };
  lastLeft: Partial<Record<MessKind, number>>;
  meterT: number;
  every: (key: string, ms: number) => boolean;
  unbind: () => void;
  commitT: number;
  result: CareResult | null;
  /** 镜头底部被拇指区挡住的 CSS 像素（每帧按这个重设：main 每帧按卡片改它） */
  occ: number;
}

/** 开发用的钩子（dev.ts、截图脚本）：不属于契约 */
export interface CareDebug {
  model(): CareModel | null;
  begin(): void;
  tool(t: Tool): void;
  finish(): void;
}

/** opts.force：跳过 canCare（只给开发钩子用；模拟收到 careFinish 照样按 canCare 校验） */
export function createCare(d: CareDeps, opts: { force?: boolean } = {}): CareGame & { readonly debug: CareDebug } {
  let run: Run | null = null;
  const tr = (k: string) => d.text().tr(k, '');
  const fxText = (k: string) => tr(`ui.care.game.fx.${k}`);

  function kindName(k: MessKind, clay: boolean): string {
    return (clay && tr(`ui.care.kinds_clay.${k}`)) || tr(`ui.care.kinds.${k}`) || k;
  }

  /* ---------------- 打开 ---------------- */

  function open(f: string): boolean {
    if (run) return false;
    const ses = d.session();
    const s = ses.s;
    const w = worldOf(s, d.content());
    if (!opts.force && canCare(s, w, f) !== null) return false;
    const surface = surfaceOf(s, w, f) ?? 'hard';
    const variant = s.variants?.[f] ?? null;
    const frames = d.site.courtsFor?.(f, variant) ?? d.site.courts[f] ?? [];
    const F = frames[0] ?? d.site.courts[f]?.[0];
    if (!F) return false;
    ses.care = f;
    d.stage(f);
    const cam = d.camera;
    const view = d.world.view;
    const saved: SavedView = {
      pose: { ...cam.target },
      limits: { zoom: [...cam.limits.zoom], tx: [...cam.limits.tx], tz: [...cam.limits.tz] },
      enabled: cam.enabled,
      follow: cam.following,
      occluded: cam.occludedBottomPx,
      pixelSize: view.pixelSize,
    };
    cam.enabled = false;
    cam.setFollow(false);
    if (view.PS < 2) setPixelSize(cam, 2);
    document.body.classList.add('td-care');

    // 布局只决定画面（契约：mulberry32(seed ^ t ^ hash(f))）
    const rnd = mulberry32((s.seed ^ s.t ^ hashStr(f)) >>> 0);
    const m = new CareModel({
      geom: { ox: F.ox, oz: F.oz, hx: F.hx, hz: F.hz, c: Math.cos(F.a), s: Math.sin(F.a) },
      surface,
      mess: messOf(s, f),
      rnd,
      texel: { x0: view.slab.x0, z0: view.slab.z0 },
    });
    const straight = Math.abs(Math.sin(F.a)) < 1e-6;
    const hid = hideAround(d.world, m, straight && m.tools.includes('net'));
    if (!hid.net) m.dropNet();

    const ost: OverlayState = { tool: null, lock: -1, t: 0, guide: false };
    const nv: NetView | null = hid.net ? { t: m.net.t, wob: 0 } : null;
    const pw: PeopleWorld = { scene: d.world.scene, groundY: d.site.groundY, people: [] };
    const gate = d.site.stands[f] ?? m.world(m.G.hx - 1.5, 0);
    const you = new Person({ name: 'Director', x: gate.x, z: gate.z, base: 'relaxed', ...DIRECTOR_LOOK }, pw);
    const start = m.world(m.G.hx * 0.55, 0);
    you.go(start.x, start.z, 3.2);
    const parts = new Particles(d.world.scene, () => rnd(), { groundY: d.site.groundY, n: 900 });
    const fx = new SpriteLayer(d.world.scene);
    const tv: ToolView = { tool: null, x: 0, z: 0, dx: 1, dz: 0, who: you, on: false, r: 1.6 };
    const rt: Reticle = { on: false, x: 0, z: 0, fx: 0, fy: 0, q: 0 };
    const toolNode = createTool(tv);
    const retNode = createReticle(rt);
    const overlay = createOverlay(m, ost);
    const nodes: Custom[] = [overlay, toolNode, retNode];
    if (nv) nodes.push(createNet(m, nv));
    d.world.scene.add(...nodes);

    const root = buildDom(m, f);
    d.host.appendChild(root);
    const $ = (sel: string) => root.querySelector(sel) as HTMLElement;
    const r: Run = {
      f,
      m,
      rnd,
      saved,
      root,
      $,
      nodes,
      hidden: hid.nodes,
      pw,
      you,
      parts,
      fx,
      ost,
      nv,
      tv,
      rt,
      toolNode,
      retNode,
      tool: m.tools[0] ?? 'broom',
      stroke: null,
      phase: 'intro',
      now: 0,
      elapsed: 0,
      done: { sand: false, water: false, cracks: false, all: false },
      gusts: [],
      gustNow: 0,
      gustSide: 1,
      tumble: null,
      tumbleT: 0,
      net: { drag: false, t: 0, lastTick: 0, target: NET_TARGET },
      lastLeft: m.left(),
      meterT: 0,
      every: makeEvery(),
      unbind: () => {},
      commitT: -1,
      result: null,
      occ: 0,
    };
    // 阵风：场上有沙才有；大风天两阵
    if (m.start.sand >= 0.03) {
      const windy = s.weather === 'wind';
      r.gusts.push({ at: 12 + rnd() * 6, warned: false, done: false, side: rnd() < 0.5 ? 1 : -1 });
      if (windy) r.gusts.push({ at: 30 + rnd() * 8, warned: false, done: false, side: rnd() < 0.5 ? 1 : -1 });
    }
    run = r;
    r.unbind = bindInput(r);
    frameCourt(r);
    return true;
  }

  /** 镜头对准这块场、铺满屏宽（转角归 0，底部拇指区挡住的那段不算） */
  function frameCourt(r: Run): void {
    const cam = d.camera;
    const G = r.m.G;
    const BW = d.world.view.BW;
    const k = Math.min(
      7.8,
      (BW * 0.97) / (2 * G.hx * Math.abs(G.c) + 2 * G.hz * Math.abs(G.c) + 2 * (G.hx + G.hz) * Math.abs(G.s)),
    );
    const dockH = r.$('.tdc-dock').offsetHeight + 10;
    const topH = r.$('.tdc-top').offsetHeight + 8;
    r.root.style.setProperty('--dockH', `${dockH}px`);
    cam.limits = { zoom: [1, 16], tx: [-400, 400], tz: [-400, 400] };
    r.occ = Math.max(0, dockH - topH);
    cam.occludedBottomPx = r.occ;
    cam.setPose({ tx: G.ox, tz: G.oz, zoom: k, rot: 0 }, true);
  }

  /* ---------------- DOM ---------------- */

  function buildDom(m: CareModel, f: string): HTMLElement {
    const t = d.text();
    const root = document.createElement('div');
    root.className = 'tdc';
    root.dataset.phase = 'intro';
    const kinds = workable(m.start);
    root.innerHTML = `
<div class="tdc-hit"></div>
<div class="tdc-fx"></div>
<div class="tdc-wind"></div>
<div class="tdc-top tdc-panel">
  <div class="tdc-name"><b class="tdc-title"></b></div>
  <div class="tdc-clock"><b class="tdc-sec">0</b><i>s</i></div>
  <button class="tdc-quit tdc-btn ghost" type="button"></button>
</div>
<div class="tdc-banner"></div>
<div class="tdc-hint"></div>
<div class="tdc-gauge tdc-panel"><div class="tdc-gbar"><div class="tdc-gz"></div><div class="tdc-gn"></div></div><b class="tdc-gv">0</b></div>
<div class="tdc-dock tdc-panel">
  <div class="tdc-meters">${kinds
    .map((k) => `<div class="tdc-mt" data-k="${k}"><span></span><div class="tdc-bar"><i></i></div></div>`)
    .join('')}</div>
  <div class="tdc-tools"></div>
  <button class="tdc-finish tdc-btn go" type="button"><b></b><small></small></button>
</div>
<div class="tdc-card tdc-panel"><div class="tdc-label"></div><h2></h2><p class="tdc-left"></p><button class="tdc-start tdc-btn go big" type="button"></button></div>`;
    const q = (s: string) => root.querySelector(s) as HTMLElement;
    const place = t.anchor(f);
    const title = t.fmt('ui.care.game.title', { place });
    q('.tdc-top .tdc-title').textContent = title;
    q('.tdc-quit').textContent = tr('ui.care.game.quit');
    q('.tdc-finish b').textContent = tr('ui.care.game.finish');
    q('.tdc-card .tdc-label').textContent = place;
    q('.tdc-card h2').textContent = title;
    q('.tdc-card .tdc-left').textContent = leftText(m, m.left());
    q('.tdc-start').textContent = tr('ui.care.game.start');
    for (const k of kinds) {
      const el = root.querySelector<HTMLElement>(`.tdc-mt[data-k="${k}"] span`);
      if (el) el.textContent = kindName(k, m.clay);
    }
    const tools = q('.tdc-tools');
    for (const id of m.tools) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tdc-tool';
      b.dataset.t = id;
      b.appendChild(artCanvas(id, 3));
      const s = document.createElement('span');
      s.textContent = tr(`ui.care.game.tools.${id}`);
      b.appendChild(s);
      b.setAttribute('aria-label', s.textContent || id);
      tools.appendChild(b);
    }
    return root;
  }

  /** "还剩：积沙、线褪了"（剩下超过一成的项） */
  function leftText(m: CareModel, left: Partial<Record<MessKind, number>>): string {
    const list = workable(m.start)
      .filter((k) => (left[k] ?? 0) > 0.1)
      .map((k) => kindName(k, m.clay));
    if (!list.length) return tr('ui.care.game.clean');
    return d.text().fmt('ui.care.game.left', { list: list.join(d.text().lang === 'zh' ? '、' : ', ') });
  }

  /* ---------------- 输入 ---------------- */

  function bindInput(r: Run): () => void {
    const hit = r.$('.tdc-hit');
    const canvasRect = () => d.world.view.canvas.getBoundingClientRect();
    const cssOf = (e: PointerEvent) => {
      const b = canvasRect();
      return { x: e.clientX - b.left, y: e.clientY - b.top };
    };
    const localAt = (x: number, y: number) => {
      const p = d.camera.unproject(x, y, 0);
      return r.m.local(p.x, p.z);
    };
    const clampIn = (p: { u: number; v: number }, mg: number) => ({
      u: clamp(p.u, -r.m.G.hx + mg, r.m.G.hx - mg),
      v: clamp(p.v, -r.m.G.hz + mg, r.m.G.hz - mg),
    });
    const down = (e: PointerEvent) => {
      if (r.phase !== 'work' || r.stroke) return;
      try {
        hit.setPointerCapture(e.pointerId);
      } catch {
        // 合成事件没有真的指针
      }
      const c = cssOf(e);
      buzz(8);
      const tool = r.tool;
      if (tool === 'net') {
        r.stroke = { id: e.pointerId, u: 0, v: 0, du: 1, dv: 0, y0: c.y, lock: -1, lastP: 0, first: true };
        netDown(r);
        return;
      }
      const pen = tool === 'paint';
      const raw = localAt(c.x, pen ? c.y - PEN : c.y);
      const p = clampIn(raw, pen ? 0.1 : 0.6);
      r.stroke = { id: e.pointerId, u: p.u, v: p.v, du: 1, dv: 0, y0: c.y, lock: -1, lastP: 0, first: true };
      SND.pick();
      const wp = r.m.world(p.u, p.v);
      r.tv.on = true;
      r.tv.tool = tool;
      r.tv.x = wp.x;
      r.tv.z = wp.z;
      r.you.base = tool === 'pick' ? 'stoop' : 'carry';
      if (Math.hypot(r.you.pos.x - wp.x, r.you.pos.z - wp.z) > 3) r.parts.dust(r.you.pos.x, 0, r.you.pos.z, 6);
      if (pen) {
        r.rt.on = true;
        r.rt.fx = c.x / d.world.view.PS;
        r.rt.fy = c.y / d.world.view.PS;
        paintMove(r, raw.u, raw.v);
      } else if (tool === 'pick') pickAt(r, raw.u, raw.v);
      else applyTool(r, p.u, p.v, p.u, p.v);
    };
    const move = (e: PointerEvent) => {
      const s = r.stroke;
      if (!s || e.pointerId !== s.id || r.phase !== 'work') return;
      const c = cssOf(e);
      const tool = r.tool;
      if (tool === 'net') {
        netMove(r, c.y);
        return;
      }
      const pen = tool === 'paint';
      const raw = localAt(c.x, pen ? c.y - PEN : c.y);
      const p = clampIn(raw, pen ? 0.1 : 0.6);
      if (pen) {
        r.rt.fx = c.x / d.world.view.PS;
        r.rt.fy = c.y / d.world.view.PS;
        paintMove(r, raw.u, raw.v);
        return;
      }
      if (tool === 'pick') {
        pickAt(r, raw.u, raw.v);
        return;
      }
      applyTool(r, s.u, s.v, p.u, p.v);
    };
    const up = (e: PointerEvent) => {
      const s = r.stroke;
      if (!s || e.pointerId !== s.id) return;
      if (r.tool === 'net' && r.phase === 'work') netUp(r);
      else if (r.phase === 'work') SND.drop();
      r.stroke = null;
      r.tv.on = false;
      r.rt.on = false;
      r.ost.lock = -1;
      r.you.base = 'relaxed';
    };
    hit.addEventListener('pointerdown', down);
    hit.addEventListener('pointermove', move);
    hit.addEventListener('pointerup', up);
    hit.addEventListener('pointercancel', up);
    const tools = r.$('.tdc-tools');
    const onTool = (e: Event) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('.tdc-tool');
      if (!b || r.phase !== 'work') return;
      e.stopPropagation();
      selectTool(r, b.dataset.t as Tool);
      buzz(8);
    };
    tools.addEventListener('pointerdown', onTool);
    const onQuit = (e: Event) => {
      e.stopPropagation();
      close();
    };
    const onFinish = (e: Event) => {
      e.stopPropagation();
      if (r.phase === 'work') finish(r);
      else if (r.phase === 'done') commit(r);
    };
    const onStart = (e: Event) => {
      e.stopPropagation();
      if (r.phase === 'intro') begin(r);
      else if (r.phase === 'done') commit(r);
    };
    r.$('.tdc-quit').addEventListener('click', onQuit);
    r.$('.tdc-finish').addEventListener('click', onFinish);
    r.$('.tdc-start').addEventListener('click', onStart);
    const onResize = () => {
      if (run === r) frameCourt(r);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }

  function toUi(r: Run, x: number, y: number, z: number): { x: number; y: number } {
    const p = d.camera.project(x, y, z);
    const cr = d.world.view.canvas.getBoundingClientRect();
    const ur = r.root.getBoundingClientRect();
    return { x: p.x + cr.left - ur.left, y: p.y + cr.top - ur.top };
  }
  function floatAt(r: Run, x: number, z: number, text: string, kind: '' | 'good' | 'bad' | 'gold' = '', y = 1.2): void {
    const p = toUi(r, x, y, z);
    floatText(r.$('.tdc-fx'), p.x, p.y, text, kind);
  }
  function hint(r: Run, text: string): void {
    const h = r.$('.tdc-hint');
    h.textContent = text;
    if (text) retrigger(h, 'on');
    else h.classList.remove('on');
  }
  function banner(r: Run, text: string, cls = ''): void {
    if (!text) return;
    const b = r.$('.tdc-banner');
    b.textContent = text;
    b.className = `tdc-banner on ${cls}`;
    window.setTimeout(() => {
      if (b.textContent === text) b.className = 'tdc-banner';
    }, 1300);
  }

  /* ---------------- 流程 ---------------- */

  function begin(r: Run): void {
    r.phase = 'work';
    r.root.dataset.phase = 'work';
    SND.tap();
    selectTool(r, r.tool);
    r.fx.emote(r.you.headTop, 'broom', 1.4);
    updateMeters(r, true);
  }

  function selectTool(r: Run, id: Tool): void {
    r.tool = id;
    SND.tap();
    for (const b of r.root.querySelectorAll<HTMLElement>('.tdc-tool')) {
      const on = b.dataset.t === id;
      b.classList.toggle('on', on);
      if (on) retrigger(b, 'tdc-pop');
    }
    r.ost.tool = id;
    r.ost.guide = id === 'paint';
    const clayKey = r.m.clay && (id === 'roller' || id === 'paint') ? tr(`ui.care.game.hint.${id}_clay`) : '';
    hint(r, clayKey || tr(`ui.care.game.hint.${id}`));
    if (id === 'net') {
      const G = r.m.G;
      r.you.clearMoves();
      r.you.go(G.ox + 0.6, G.oz + r.m.dims.Wd + 1.4, 4);
      r.you.idleFace = Math.PI;
    } else r.you.idleFace = null;
    r.root.classList.toggle('tdc-net', id === 'net');
  }

  /** 收工：底部卡片预告"清掉了 p% · 总监还要在场上忙 {time}"，一会儿（或再点一下）就交给模拟 */
  function finish(r: Run): void {
    r.phase = 'done';
    r.root.dataset.phase = 'done';
    r.stroke = null;
    r.tv.on = false;
    r.rt.on = false;
    r.ost.guide = false;
    const cleared = r.m.cleared();
    r.result = { cleared };
    const card = r.$('.tdc-card');
    card.querySelector('.tdc-label')!.textContent = d.text().anchor(r.f);
    const pv = preview(r, r.result);
    card.querySelector('h2')!.textContent = pv.line;
    card.querySelector('.tdc-left')!.textContent = `${pv.cost} · ${leftText(r.m, r.m.left())}`;
    r.$('.tdc-start').textContent = tr('ui.care.game.finish');
    hint(r, '');
    SND.fanfare();
    flash(r.root, '#fff4c8');
    buzz([20, 40, 60]);
    r.parts.confetti(r.m.G.ox, 2, r.m.G.oz, 40, 4);
    r.fx.emote(r.you.headTop, 'star', 1.4);
    r.commitT = 1.6;
  }

  /**
   * 预告：和模拟收 careFinish 时用同一个 careMinutes、同一份结果（交给 session 的就是 r.result 这个对象，
   * 中间游戏时间停着，状态不变）。"在场上忙"是 work（errand 的工时），"离岗约"是 total = work + 走过去（careDone / 因果日志）。
   */
  function preview(r: Run, res: CareResult): { line: string; cost: string; work: number; total: number } {
    const s = d.session().s;
    const w = worldOf(s, d.content());
    const t = d.text();
    const surface = surfaceOf(s, w, r.f) ?? 'hard';
    const p = clearedPercent(r.m.start, res.cleared, w.act.rules.care?.weights[surface] ?? {});
    const mins = careMinutes(s, w, r.f, res);
    return {
      line: t.fmt('ui.care.game.done', { p, time: t.duration(mins.work) }),
      cost: t.fmt('ui.care.hand_cost', { time: t.duration(mins.total) }),
      work: mins.work,
      total: mins.total,
    };
  }

  function commit(r: Run): void {
    if (run !== r || !r.result) return;
    const res = r.result;
    r.result = null;
    d.session().careFinish(r.f, res);
    restore(r);
  }

  function close(): void {
    if (run) restore(run);
  }

  function restore(r: Run): void {
    run = null;
    r.unbind();
    for (const n of r.nodes) n.removeFromParent();
    for (const p of [...r.pw.people]) {
      p.removed = true;
      p.clearMoves();
      p.root.removeFromParent();
    }
    r.pw.people.length = 0;
    r.parts.dispose();
    r.fx.dispose();
    r.tumble?.g.removeFromParent();
    for (const n of r.hidden) n.visible = true;
    d.world.view.invalidate();
    d.stage(null);
    const cam = d.camera;
    const sv = r.saved;
    if (d.world.view.PS !== (sv.pixelSize ?? d.world.view.PS) || sv.pixelSize === undefined)
      setPixelSize(cam, sv.pixelSize);
    cam.limits = sv.limits;
    cam.occludedBottomPx = sv.occluded;
    cam.setPose(sv.pose, true);
    cam.enabled = sv.enabled;
    cam.setFollow(sv.follow);
    document.body.classList.remove('td-care');
    r.root.remove();
    const ses = d.session();
    if (ses.care === r.f) ses.care = null;
  }

  /* ---------------- 工具 ---------------- */

  /** 扫、推水、压、洒水：从 (u0, v0) 拖到 (u1, v1)，每 0.2 米做一次 */
  function applyTool(r: Run, u0: number, v0: number, u1: number, v1: number): void {
    const s = r.stroke;
    if (!s) return;
    const m = r.m;
    const tool = r.tool;
    const du = u1 - u0;
    const dv = v1 - v0;
    const dist = Math.hypot(du, dv);
    if (dist > 0.05) {
      s.du = s.du * 0.5 + (du / dist) * 0.5;
      s.dv = s.dv * 0.5 + (dv / dist) * 0.5;
      const l = Math.hypot(s.du, s.dv) || 1;
      s.du /= l;
      s.dv /= l;
    }
    const steps = Math.max(1, Math.ceil(dist / 0.2));
    // 工具的大小按屏幕算（手指大约 30 像素宽），镜头远近变了也一样好推
    const ppm = d.camera.pxPerM;
    const R =
      tool === 'broom' || tool === 'squeegee'
        ? clamp(13 / ppm, 1, 2.2)
        : tool === 'roller'
          ? clamp(11 / ppm, 0.9, 1.8)
          : clamp(15 / ppm, 1.1, 2.2);
    r.tv.r = R;
    let moved = 0;
    let out = 0;
    for (let k = 1; k <= steps; k++) {
      const u = u0 + (du * k) / steps;
      const v = v0 + (dv * k) / steps;
      const wp = m.world(u, v);
      if (tool === 'broom' || tool === 'squeegee') {
        if (dist < 0.05) continue;
        const res = m.push(tool === 'broom' ? 'sand' : 'wet', u, v, s.du, s.dv, R);
        moved += res.moved;
        out += res.out;
      } else if (tool === 'roller') {
        if (dist < 0.05 && k > 1) continue;
        const res = m.roll(u, v, R);
        if (res.crack && r.every('crk', 120)) {
          SND.crunch();
          buzz(6);
        }
        if (res.done && r.rnd() < 0.25) r.parts.sparkle(wp.x, 0.1, wp.z, 3, m.clay ? '#e9a27a' : '#f6f3ea');
        if (m.clay && res.work > 0.02 && r.every('mudfx', 140)) r.parts.mud(wp.x, 0.1, wp.z, 2);
        if (res.sandy && r.every('sandy', 2600)) floatAt(r, wp.x, wp.z, fxText('sandy'), 'gold');
        if (res.dry && r.every('dry', 2400)) floatAt(r, wp.x, wp.z, fxText('dry'), 'gold');
      } else if (tool === 'water') {
        const res = m.sprinkle(u, v, R);
        if (r.every('spl', 110)) {
          SND.splash();
          r.parts.splash(wp.x, 0.2, wp.z, 3);
        }
        if (res.puddle && r.every('pud', 1600)) floatAt(r, wp.x, wp.z, fxText('puddle'), 'bad');
      }
    }
    const p = m.world(u1, v1);
    const dw = m.dirWorld(s.du, s.dv);
    if ((tool === 'broom' || tool === 'squeegee') && moved > 0.25) {
      if (r.every('sw', 85)) (tool === 'broom' ? SND.sweep : SND.squeegee)();
      if (r.every('swd', 50)) {
        if (tool === 'broom')
          r.parts.dust(p.x + dw.x * 0.8, 0.05, p.z + dw.z * 0.8, 2, r.rnd() < 0.5 ? '#e9c999' : '#f2d8ad');
        else r.parts.splash(p.x + dw.x * 0.8, 0.05, p.z + dw.z * 0.8, 2);
      }
    }
    if (out > 0.4 && r.every('out', 120)) {
      if (tool === 'broom') r.parts.dust(p.x + dw.x * 1.4, 0.4, p.z + dw.z * 1.4, 4, '#f2d8ad');
      else if (tool === 'squeegee') r.parts.splash(p.x + dw.x * 1.4, 0.2, p.z + dw.z * 1.4, 5);
    }
    if (tool === 'roller' && dist > 0.05 && r.every('roll', 95)) SND.roll();
    s.u = u1;
    s.v = v1;
    r.tv.x = p.x;
    r.tv.z = p.z;
    r.tv.dx = dw.x;
    r.tv.dz = dw.z;
  }

  /** 捡：手指碰到的球、瓶子、落叶飞到总监手里 */
  function pickAt(r: Run, u: number, v: number): void {
    const s = r.stroke;
    if (!s) return;
    const p = r.m.world(u, v);
    r.tv.x = p.x;
    r.tv.z = p.z;
    const dd = Math.hypot(u - s.u, v - s.v);
    if (dd > 0.05) {
      const dw = r.m.dirWorld((u - s.u) / dd, (v - s.v) / dd);
      r.tv.dx = dw.x;
      r.tv.dz = dw.z;
    }
    s.u = u;
    s.v = v;
    const got = r.m.pick(u, v, PICK_PX / d.camera.pxPerM);
    got.forEach((it, i) => {
      const w = r.m.world(it.u, it.v);
      r.parts.sparkle(w.x, 0.2, w.z, 4, it.kind === 0 ? '#d8e04a' : it.kind === 1 ? '#7fd0ea' : '#a8853a');
      SND.plink(r.m.litter.filter((x) => x.taken).length + i);
      buzz(6);
    });
  }

  /** 画线：碰到发亮的线就吸住，顺着线画；离线太远才算歪 */
  function paintMove(r: Run, u: number, v: number): void {
    const s = r.stroke;
    if (!s) return;
    const m = r.m;
    const ppm = d.camera.pxPerM;
    const good = GOOD_PX / ppm;
    const wob = WOB_PX / ppm;
    const grab = (s.first ? GRAB_PX : 18) / ppm;
    s.first = false;
    const p = m.world(u, v);
    r.rt.x = p.x;
    r.rt.z = p.z;
    r.tv.x = p.x;
    r.tv.z = p.z;
    const pd = Math.hypot(u - s.u, v - s.v);
    if (pd > 0.05) {
      const dw = m.dirWorld((u - s.u) / pd, (v - s.v) / pd);
      r.tv.dx = dw.x;
      r.tv.dz = dw.z;
    }
    s.u = u;
    s.v = v;
    if (s.lock >= 0) {
      let n = m.nearest(u, v, s.lock);
      const g = m.segs[s.lock];
      const par = g?.axis === 'u' ? u : v;
      const past = g ? Math.max(g.a - par, par - g.b) : 0;
      // 过了线头：拐到最近的另一条线上（描一圈不用松手）
      if (past > 0.35 || n.d > good) {
        const alt = m.nearest(u, v);
        if (alt.s !== s.lock && alt.d < good) {
          s.lock = alt.s;
          s.lastP = alt.p;
          n = alt;
          SND.tap();
        }
      }
      if (n.d <= wob) {
        const q = n.d <= good ? 2 : 3;
        const res = m.paintSeg(s.lock, s.lastP, n.p, q);
        s.lastP = n.p;
        r.rt.q = q === 2 ? 0 : 1;
        if (res.fresh && r.every('hiss', 70)) SND.hiss();
        if (res.fresh && r.rnd() < 0.3) r.parts.dust(p.x, 0.05, p.z, 1, '#f6f3ea');
        if (q === 3 && res.fresh && r.every('wob', 1400)) floatAt(r, p.x, p.z, fxText('wobble'), 'gold');
        if (res.dirty && r.every('pdirt', 1800)) {
          floatAt(r, p.x, p.z, fxText('dirty'), 'gold');
          SND.buzz();
        }
        r.ost.lock = s.lock;
        return;
      }
      // 歪了：点一块擦不掉的白，断开，等手指回到线边再接上
      if (m.inCourt(u, v)) m.strayAt(u, v);
      s.lock = -1;
      r.ost.lock = -1;
      r.rt.q = 2;
      floatAt(r, p.x, p.z, fxText('stray'), 'bad');
      SND.bad();
      buzz([15, 30, 15]);
      retrigger(d.world.view.canvas, 'tdc-shake');
      return;
    }
    const n = m.nearest(u, v);
    if (n.d < grab) {
      s.lock = n.s;
      s.lastP = n.p;
      r.ost.lock = n.s;
      r.rt.q = 0;
      SND.tap();
      buzz(6);
    } else r.rt.q = 1;
  }

  /* ---------------- 挂网 ---------------- */

  function netDown(r: Run): void {
    if (!r.nv) return;
    r.net.drag = true;
    r.net.t = 0;
    r.net.lastTick = 0;
    r.nv.t = 0;
    r.you.base = 'pull';
    SND.pick();
  }
  function netMove(r: Run, y: number): void {
    const s = r.stroke;
    if (!r.net.drag || !s || !r.nv) return;
    r.net.t = clamp((s.y0 - y) / 230, 0, 1.05);
    r.nv.t = r.net.t;
    const tick = Math.floor(r.net.t * 20);
    if (tick > r.net.lastTick) {
      r.net.lastTick = tick;
      SND.tick(tick);
      if (tick % 4 === 0) buzz(5);
    }
    if (r.net.t > 1.0) {
      // 拉太狠：绳断了，网回到原来的样子
      r.net.drag = false;
      r.nv.t = r.m.net.t;
      SND.snap();
      retrigger(d.world.view.canvas, 'tdc-shake');
      flash(r.root, '#ff8a6b');
      buzz([30, 40, 30]);
      floatAt(r, r.m.G.ox, r.m.G.oz, fxText('net_snap'), 'bad', 1.6);
      r.you.base = 'relaxed';
    }
  }
  function netUp(r: Run): void {
    r.you.base = 'relaxed';
    if (!r.net.drag || !r.nv) return;
    r.net.drag = false;
    const G = r.m.G;
    if (r.net.t < 0.15) {
      r.nv.t = r.m.net.t;
      return;
    }
    const off = Math.abs(r.net.t - r.net.target);
    r.m.setNet(r.net.t, r.net.target);
    r.nv.t = r.net.t;
    r.nv.wob = 1;
    SND.twang(0.7 + r.net.t * 0.6);
    buzz(20);
    const W = r.m.dims.Wd + 0.9;
    r.parts.sparkle(G.ox, 1, G.oz - W, 6, '#f6f3ea');
    r.parts.sparkle(G.ox, 1, G.oz + W, 6, '#f6f3ea');
    if (off < 0.03) {
      floatAt(r, G.ox, G.oz, fxText('net_perfect'), 'gold', 1.6);
      SND.coin();
      flash(r.root, '#fff4c8');
      r.fx.emote(r.you.headTop, 'star', 1.4);
    } else if (off < 0.08) floatAt(r, G.ox, G.oz, fxText('net_ok'), 'good', 1.6);
    else floatAt(r, G.ox, G.oz, fxText(r.net.t < r.net.target ? 'net_loose' : 'net_tight'), 'gold', 1.6);
  }
  function drawGauge(r: Run): void {
    if (r.tool !== 'net' || r.phase !== 'work') return;
    r.net.target = NET_TARGET + Math.sin(r.elapsed * 1.7) * (r.gustNow > 0 ? 0.06 : 0.02);
    const t = r.net.drag ? r.net.t : r.m.net.t;
    const gz = r.$('.tdc-gz');
    gz.style.bottom = `${(r.net.target - 0.07) * 100}%`;
    r.$('.tdc-gn').style.bottom = `${Math.min(1, t) * 100}%`;
    r.$('.tdc-gv').textContent = String(r.net.drag ? Math.round(t * 100) : r.m.net.score);
    r.$('.tdc-gauge').classList.toggle('hot', r.net.drag && t > 0.9);
  }

  /* ---------------- 读数、收尾 ---------------- */

  function updateMeters(r: Run, force = false): void {
    const m = r.m;
    const left = m.left();
    for (const k of workable(m.start)) {
      const v = Math.round(100 * (1 - (left[k] ?? 0)));
      const el = r.root.querySelector<HTMLElement>(`.tdc-mt[data-k="${k}"]`);
      const bar = el?.querySelector<HTMLElement>('i');
      if (bar) {
        bar.style.width = `${v}%`;
        bar.style.background = v >= 85 ? 'var(--tdc-green)' : v >= 55 ? 'var(--tdc-amber)' : 'var(--tdc-coral)';
      }
      const lv = Math.round(100 * (1 - (r.lastLeft[k] ?? 0)));
      if (!force && el && v >= 98 && lv < 98) {
        SND.coin();
        retrigger(el, 'tdc-pop');
      } else if (!force && el && Math.floor(v / 25) > Math.floor(lv / 25)) SND.tap();
      el?.classList.toggle('done', v >= 95);
    }
    for (const b of r.root.querySelectorAll<HTMLElement>('.tdc-tool')) {
      const id = b.dataset.t as Tool;
      const kind: MessKind | null =
        id === 'broom'
          ? 'sand'
          : id === 'squeegee'
            ? 'water'
            : id === 'roller'
              ? m.clay
                ? 'water'
                : 'cracks'
              : id === 'water'
                ? 'cracks'
                : id === 'pick'
                  ? 'litter'
                  : null;
      const done =
        id === 'paint'
          ? m.paintLeft() <= 0.05
          : id === 'net'
            ? m.net.score >= 85
            : kind
              ? (left[kind] ?? 0) <= 0.05
              : false;
      b.classList.toggle('done', done);
    }
    const all = workable(m.start).every((k) => (left[k] ?? 0) <= 0.02);
    r.$('.tdc-finish small').textContent = r.phase === 'work' ? preview(r, { cleared: m.cleared() }).line : '';
    if (r.phase === 'work') {
      // 收尾：剩不到 8% 一口气清光（阵风吹回来以后可以再来一次）
      if (left.sand !== undefined) {
        if (!r.done.sand && left.sand <= FINISH_AT && left.sand > 0) finishField(r, 'sand');
        if (r.done.sand && left.sand > FINISH_AT * 2) r.done.sand = false;
      }
      if (left.water !== undefined && !r.done.water && left.water <= FINISH_AT && left.water > 0) finishField(r, 'wet');
      if (left.cracks !== undefined && !r.done.cracks && left.cracks <= FINISH_AT && left.cracks > 0)
        finishField(r, 'rough');
      if (all && !r.done.all) {
        r.done.all = true;
        banner(r, tr('ui.care.game.clean'), 'gold');
        SND.fanfare();
        retrigger(r.$('.tdc-finish'), 'tdc-pop');
      }
      if (!all) r.done.all = false;
    }
    r.lastLeft = left;
  }

  function finishField(r: Run, field: 'sand' | 'wet' | 'rough'): void {
    const m = r.m;
    if (field === 'sand') r.done.sand = true;
    else if (field === 'wet') r.done.water = true;
    else r.done.cracks = true;
    const cells = m.finish(field);
    for (let i = 0; i < cells.length; i += 3) {
      const c = cells[i] as number;
      const p = m.world(m.cu(c % m.nx), m.cv(Math.floor(c / m.nx)));
      if (field === 'sand') r.parts.dust(p.x, 0.05, p.z, 1, r.rnd() < 0.5 ? '#e9c999' : '#f2d8ad');
      else if (field === 'wet') r.parts.splash(p.x, 0.05, p.z, 1);
      else r.parts.sparkle(p.x, 0.1, p.z, 2, '#f6f3ea');
    }
    floatAt(r, r.you.pos.x, r.you.pos.z, fxText(`finish_${field === 'wet' ? 'water' : field}`), 'gold', 2);
    SND.whoosh();
    SND.coin();
    r.fx.emote(r.you.headTop, 'star', 1.2);
  }

  /* ---------------- 阵风 ---------------- */

  function windFx(r: Run, side: 1 | -1): void {
    const w = r.$('.tdc-wind');
    w.innerHTML = '';
    for (let i = 0; i < 16; i++) {
      const b = document.createElement('i');
      b.style.top = `${12 + r.rnd() * 62}%`;
      b.style.width = `${30 + r.rnd() * 70}px`;
      b.style.animationDelay = `${r.rnd() * 1.2}s`;
      b.style.animationDuration = `${0.5 + r.rnd() * 0.35}s`;
      w.appendChild(b);
    }
    w.className = side > 0 ? 'tdc-wind on r' : 'tdc-wind on l';
    window.setTimeout(() => {
      w.className = 'tdc-wind';
    }, 2000);
  }

  function updateGust(r: Run, dt: number): void {
    const m = r.m;
    const G = m.G;
    for (const g of r.gusts) {
      if (!g.warned && r.elapsed >= g.at - 1.5) {
        g.warned = true;
        r.gustSide = g.side;
        const t = fxText('gust');
        banner(r, t ? (g.side > 0 ? `${t} →` : `← ${t}`) : g.side > 0 ? '→' : '←', 'gold');
        SND.tap();
        buzz(10);
      }
      if (!g.done && r.elapsed >= g.at) {
        g.done = true;
        r.gustNow = 1.8;
        SND.wind();
        retrigger(d.world.view.canvas, 'tdc-shake');
        buzz([20, 20, 20]);
        const a = m.dirWorld(r.gustSide, 0.15);
        r.tumble?.g.removeFromParent();
        r.tumble = createTumbleweed(
          d.world.scene,
          d.site.groundY,
          { x0: G.ox - G.hx - 4, x1: G.ox + G.hx + 4, z0: G.oz - 3, z1: G.oz + 3 },
          { dir: { x: a.x, z: a.z }, seed: (r.rnd() * 1e6) | 0 },
        );
        r.tumbleT = 3.5;
        if (r.nv) r.nv.wob = 1;
        windFx(r, r.gustSide);
      }
    }
    if (r.gustNow > 0) {
      r.gustNow -= dt;
      m.gust(r.gustSide, r.rnd, dt * 60);
      const dw = m.dirWorld(r.gustSide, 0);
      for (let k = 0; k < 6; k++) {
        const u = r.gustSide > 0 ? -G.hx + r.rnd() * 8 : G.hx - r.rnd() * 8;
        const p = m.world(u, -G.hz + r.rnd() * G.hz * 2);
        r.parts.add({
          x: p.x,
          y: 0.2 + r.rnd() * 0.8,
          z: p.z,
          vx: dw.x * (9 + r.rnd() * 6),
          vy: 0,
          vz: dw.z * (9 + r.rnd() * 6) + r.rnd() - 0.5,
          max: 0.9,
          s: 0.16,
          sx: 3,
          col: r.rnd() < 0.5 ? '#f2d8ad' : '#e9c999',
          drag: 0.99,
        });
      }
    }
  }

  /* ---------------- 每帧 ---------------- */

  function followDirector(r: Run): void {
    if (r.phase !== 'work' || !r.stroke || r.tool === 'net') return;
    const back = r.tool === 'paint' ? 0.7 : r.tool === 'pick' ? 0.4 : 0.85;
    const tx = r.tv.x - r.tv.dx * back;
    const tz = r.tv.z - r.tv.dz * back;
    const dd = Math.hypot(tx - r.you.pos.x, tz - r.you.pos.z);
    r.you.clearMoves();
    if (dd > 0.03) r.you.go(tx, tz, Math.max(2.5, dd * 13), { face: Math.atan2(r.tv.dx, r.tv.dz) });
    if (dd > 2.5 && r.every('dash', 200)) r.parts.speed(r.you.pos.x, 0.9, r.you.pos.z, Math.atan2(r.tv.dx, r.tv.dz));
  }

  function update(dt: number): void {
    const r = run;
    if (!r) return;
    const step = Math.min(0.05, Math.max(0, dt));
    r.now += step;
    r.ost.t = r.now;
    if (r.phase === 'work') {
      r.elapsed += step;
      updateGust(r, step);
      r.meterT -= step;
      if (r.meterT <= 0) {
        r.meterT = 0.22;
        updateMeters(r);
      }
      const sec = String(Math.floor(r.elapsed));
      const el = r.$('.tdc-sec');
      if (el.textContent !== sec) el.textContent = sec;
    } else if (r.phase === 'done' && r.commitT > 0) {
      r.commitT -= step;
      if (r.commitT <= 0) {
        commit(r);
        return;
      }
    }
    followDirector(r);
    for (const p of [...r.pw.people]) p.update(step, r.now);
    if (r.nv) r.nv.wob = Math.max(0, r.nv.wob - step * 1.2);
    if (r.tumble) {
      r.tumble.update(step, r.now, 1, 0);
      r.tumbleT -= step;
      if (r.tumbleT <= 0) {
        r.tumble.g.removeFromParent();
        r.tumble = null;
      }
    }
    if (d.camera.occludedBottomPx !== r.occ) d.camera.occludedBottomPx = r.occ;
    r.toolNode.position.set(r.tv.x, 0, r.tv.z);
    r.retNode.position.set(r.rt.x, 0, r.rt.z);
    r.fx.update(r.now);
    r.parts.update(step);
    drawGauge(r);
  }

  return {
    get active() {
      return run?.f ?? null;
    },
    open,
    update,
    close,
    debug: {
      model: () => run?.m ?? null,
      begin: () => {
        if (run?.phase === 'intro') begin(run);
      },
      tool: (t) => {
        if (run?.phase === 'work' && run.m.tools.includes(t)) selectTool(run, t);
      },
      finish: () => {
        if (run?.phase === 'work') finish(run);
      },
    },
  };
}

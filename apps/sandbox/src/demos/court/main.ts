import '../kit/kit.css';
import './court.css';
import {
  activities,
  type Custom,
  createDaylight,
  createIsoWorld,
  createTumbleweed,
  type IconName,
  INDIAN_WELLS,
  INDIAN_WELLS_WORLD,
  indianWells,
  Particles,
  type PeopleWorld,
  Person,
  type PersonOptions,
  Scheduler,
  SpriteLayer,
  setPeopleView,
  type Tumbleweed,
} from '@td/iso';
import { mulberry32, type Rand } from '@td/shared';
import { buzz, flash, floatText, isMuted, pop, SFX, setMuted, sfx, shake, tween } from '../kit/juice';
import { artCanvas } from './art';
import {
  createNet,
  createOverlay,
  createReticle,
  createTool,
  hideFrontFence,
  hideSiteNet,
  type NetView,
  type OverlayState,
  paintCourtBase,
  type Reticle,
  type ToolView,
} from './draw';
import { type CourtCfg, CourtModel, type Measure, type Tier, type Tool, tierOf } from './model';

/**
 * 06 场地养护（第二轮）：在 Palm Oasis 的真地图上亲手扫沙、压平、描线、挂网。
 * 画面全是 @td/iso：地图是 INDIAN_WELLS，场面的沙和线是逐像素画在真地面上的叠层；总监、Dale、客人是 Person；
 * 第一场是活动库的 match。数值逻辑在 model.ts，这里是流程、输入、反馈和 HUD。
 */

/* ---------------- 参数 ---------------- */
const QS = new URLSearchParams(location.search);
const FAST = Math.max(0.25, Number(QS.get('fast')) || 1);
let SEED = QS.get('seed') ? Number(QS.get('seed')) : Date.now() % 1e9;
// 每个缓冲像素 2 个 CSS 像素（3× 手机上是 6 个物理像素，整数倍、不糊）：人和沙都看得清
const PX = QS.get('px') ? Number(QS.get('px')) : 2;
/** 画线时笔尖在手指上方多少 CSS 像素 */
const PEN = 46;

const $ = <E extends HTMLElement = HTMLElement>(id: string): E => document.getElementById(id) as E;
const clamp = (v: number, a = 0, b = 100) => (v < a ? a : Math.min(v, b));
const site = INDIAN_WELLS;
const { F_O1, F_O2, F_P1, INITIAL_STATES } = indianWells;

/* ---------------- 三块场 ---------------- */
const COURTS: CourtCfg[] = [
  {
    facility: 'outer_1',
    frame: F_O1,
    kind: 'member',
    name: '会员场',
    label: '硬地',
    T: 42,
    pat: 22,
    guests: 2,
    fee: 1,
    cracks: 7,
    bumps: 6,
    patches: 5,
    weeds: 6,
    sand: 1,
    gusts: 1,
    story: '沙埋了一半，网倒在地上。',
    tools: ['broom', 'roller', 'paint', 'net'],
    ruinState: 'sanded',
    freshState: 'resurfaced',
    gateOut: { x: F_O1.ox + 0.4, z: F_O1.oz - F_O1.hz - 1.2 },
    gateIn: { x: F_O1.ox, z: F_O1.oz - F_O1.hz + 1 },
    from: { x: F_O1.ox - 19, z: 15.5 },
    minute: 9 * 60 + 40,
  },
  {
    facility: 'outer_23',
    frame: F_O2,
    kind: 'clay',
    name: '红土场',
    label: '红土',
    T: 52,
    pat: 20,
    guests: 2,
    fee: 1,
    cracks: 0,
    bumps: 11,
    patches: 6,
    weeds: 5,
    sand: 0.85,
    gusts: 1,
    story: '红土干成砖，先洒水再压。',
    tools: ['broom', 'water', 'roller', 'paint', 'net'],
    ruinState: 'ruined',
    freshState: 'playable',
    gateOut: { x: F_O2.ox - 0.4, z: F_O2.oz - F_O2.hz - 1.2 },
    gateIn: { x: F_O2.ox, z: F_O2.oz - F_O2.hz + 1 },
    from: { x: F_O2.ox + 20, z: 15.5 },
    minute: 12 * 60 + 50,
  },
  {
    facility: 'practice',
    frame: F_P1,
    kind: 'practice',
    name: '青训场',
    label: '贵宾试打',
    T: 42,
    pat: 15,
    guests: 2,
    fee: 2,
    cracks: 10,
    bumps: 6,
    patches: 6,
    weeds: 8,
    sand: 1.15,
    gusts: 2,
    story: '贵宾场：订金翻倍，风大。',
    tools: ['broom', 'roller', 'paint', 'net'],
    ruinState: 'ruined',
    freshState: 'open',
    gateOut: { x: F_P1.ox + 0.4, z: F_P1.oz + F_P1.hz + 1.2 },
    gateIn: { x: F_P1.ox, z: F_P1.oz + F_P1.hz - 1 },
    from: { x: F_P1.ox - 19, z: 15.5 },
    minute: 16 * 60 + 10,
  },
];
const TOOL_NAME: Record<Tool, string> = {
  broom: '扫把',
  roller: '压路滚',
  paint: '画线车',
  net: '挂网',
  water: '洒水',
};
const TOOL_HINT: Record<string, string> = {
  broom: '来回推，把沙推出围栏',
  roller: '在裂缝和鼓包上来回压',
  roller_clay: '红土半湿才压得实',
  paint: '按住金线附近，顺着拖',
  paint_clay: '按住金线附近，顺着贴',
  water: '抹一抹，别洒成水坑',
  net: '往上拉，在绿区松手',
};

/* ---------------- 世界 ---------------- */
const stage = $('stage');
const ui = $('ui');
const world = createIsoWorld(stage, { ...INDIAN_WELLS_WORLD, pixelSize: PX });
site.build(world);
const ov = site.createOverlays(world);
const sky = site.createSky(world);
const daylight = createDaylight(world);
world.camera.enabled = false;
const sched = new Scheduler();
const pw: PeopleWorld = { scene: world.scene, groundY: site.groundY, people: [] };
let fxRand: Rand = mulberry32(SEED ^ 0x5eed);
const fx = new SpriteLayer(world.scene);
const parts = new Particles(world.scene, () => fxRand(), { groundY: site.groundY, n: 900 });

/* ---------------- HUD ---------------- */
ui.innerHTML = `
<div id="top">
  <button class="cb k-panel" id="mute" aria-label="静音"><span id="muteI">♪</span></button>
  <div class="k-panel" id="info">
    <div class="nm"><span class="k-label" id="cnum">COURT 1/3</span><span class="k-title" id="cname">场地养护</span></div>
    <div class="tm" id="timer">—</div>
    <div class="k-num cash" id="cash">$0</div>
  </div>
  <button class="cb k-panel" id="help" aria-label="设计说明">?</button>
</div>
<div id="tags"></div>
<div id="fxl"></div>
<div id="banner"></div>
<div id="wind"></div>
<div id="hint"></div>
<div id="gauge" class="k-panel"><div class="k-label">张力</div><div class="gbar"><div class="gz" id="gz"></div><div class="gn" id="gn"></div></div><div class="gv k-num" id="gv">0%</div></div>
<div id="dock" class="k-panel">
  <div id="meters"></div>
  <div id="tools"></div>
  <button class="k-btn go" id="open"><b>开场</b><small id="openS">D 档 · $10/h</small></button>
</div>
<div id="mbar" class="k-panel">
  <div class="k-label">第一场 · 场子的毛病会被打出来</div>
  <div class="mc"><span data-k="good">好球 <b>0</b></span><span data-k="bad">坏弹跳 <b>0</b></span><span data-k="slip">打滑 <b>0</b></span><span data-k="line">压线 <b>0</b></span><span data-k="net">挂网 <b>0</b></span></div>
</div>
<div id="modal" class="k-modal" hidden><div class="k-card" id="card"></div></div>
<div id="helpov" class="k-modal" hidden><div class="k-card">
  <div class="k-label">设计说明 · 06</div>
  <h2>场地养护：亲手修一块场</h2>
  <p><b>在测：</b>"总监亲手干"能不能成为 20–40 秒一次的爽点。地图、人物、第一场都是游戏里的真东西。</p>
  <p><b>取舍：</b>客人按时到门口。赶工准点 → 订金全拿、档位低（以后每小时都卖得便宜）；精修 → 档位高，但客人越等越火，要么免单、要么放走。</p>
  <p><b>顺序：</b>沙上画的线是脏的；先压后扫压不实；红土太干压不动、太湿压出泥坑；风会把沙吹回来。</p>
  <p><b>手感：</b>描线时笔尖在手指上方，碰到金线就吸住，手抖一点也画在线上，离太远才算歪；沙子扫到只剩一成会自动收尾。</p>
  <button class="k-btn primary" id="helpX">知道了</button>
</div></div>`;
const fxl = $('fxl');
const tags = $('tags');
const meterDefs: [keyof Measure, string][] = [
  ['F', '平整'],
  ['L', '线条'],
  ['C', '干净'],
  ['N', '球网'],
];
$('meters').innerHTML = meterDefs
  .map(
    ([k, n]) =>
      `<div class="mt"><span class="k-label">${n}</span><div class="bar"><i id="mf${k}"></i></div><b class="k-num" id="mv${k}">0</b></div>`,
  )
  .join('');

/* ---------------- 音效（kit 的 sfx 是方波；沙沙声、嘶嘶声用噪声） ---------------- */
let actx: AudioContext | null = null;
let noiseBuf: AudioBuffer | null = null;
function noise(dur = 0.08, freq = 2000, vol = 0.05, q = 1): void {
  if (isMuted()) return;
  try {
    actx ??= new AudioContext();
  } catch {
    return;
  }
  const a = actx;
  if (a.state === 'suspended') void a.resume();
  if (!noiseBuf) {
    noiseBuf = a.createBuffer(1, a.sampleRate * 0.5, a.sampleRate);
    const ch = noiseBuf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
  }
  const s = a.createBufferSource();
  const f = a.createBiquadFilter();
  const g = a.createGain();
  s.buffer = noiseBuf;
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = q;
  g.gain.setValueAtTime(vol, a.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
  s.connect(f).connect(g).connect(a.destination);
  s.start();
  s.stop(a.currentTime + dur + 0.02);
}
const throttle: Record<string, number> = {};
function every(key: string, ms: number): boolean {
  const n = performance.now();
  if ((throttle[key] ?? 0) > n) return false;
  throttle[key] = n + ms;
  return true;
}
const SND = {
  sweep: () => noise(0.09, 3200, 0.05, 0.8),
  roll: () => sfx({ f: 55 + Math.random() * 15, dur: 0.08, vol: 0.06 }),
  crunch: () => noise(0.05, 500, 0.1, 1.5),
  hiss: () => noise(0.06, 6000, 0.03, 2),
  splash: () => noise(0.1, 1500, 0.05, 0.7),
  wind: () => {
    noise(0.6, 400, 0.1, 0.4);
    noise(0.6, 800, 0.06, 0.4);
  },
  snap: () => {
    noise(0.2, 900, 0.14, 0.6);
    sfx({ f: 300, f2: 50, dur: 0.3, type: 'sawtooth', vol: 0.1 });
  },
  twang: (p: number) => sfx({ f: 180 * p, f2: 240 * p, dur: 0.35, type: 'triangle', vol: 0.18 }),
  tick: (i: number) => sfx({ f: 200 + i * 30, dur: 0.03, vol: 0.06 }),
  pullWeed: () => sfx({ f: 500, f2: 900, dur: 0.06, vol: 0.1 }),
};

/* ---------------- 人物 ---------------- */
const SKINS = ['#f1c27d', '#c68642', '#8d5524', '#ffdbac'];
const HAIRS = ['#2a1f2b', '#6a4228', '#e0b050', '#a8453a', '#d8d0c0'];
const TOPS = ['#f2b134', '#d94a3a', '#4fc3d9', '#f4f1e8', '#3c7d3a', '#9a5ab0'];
const BOTTOMS = ['#3f6fb0', '#2a1f2b', '#f4f1e8', '#5a3d2b'];
const STYLES: PersonOptions['hairStyle'][] = ['short', 'pony', 'curly', 'long', 'visor', 'bald'];

function mkPerson(o: Partial<PersonOptions> & { name: string; x: number; z: number }): Person {
  return new Person(
    {
      shirt: '#f4f1e8',
      shorts: '#3f6fb0',
      skin: SKINS[0],
      hair: HAIRS[0],
      shoes: '#f6f3ea',
      hairStyle: 'short',
      ...o,
    },
    pw,
  );
}
function removePerson(p: Person | null): void {
  if (!p || p.removed) return;
  p.removed = true;
  p.clearMoves();
  p.root.removeFromParent();
  const i = pw.people.indexOf(p);
  if (i >= 0) pw.people.splice(i, 1);
}
const director = mkPerson({
  name: '总监',
  x: COURTS[0].gateIn.x,
  z: COURTS[0].gateIn.z,
  shirt: '#14223a',
  trim: '#d8c08a',
  shorts: '#c9b083',
  skin: '#f1c27d',
  hair: '#3a2a1e',
  hairStyle: 'short',
  shoes: '#f6f3ea',
});
const dale = mkPerson({
  name: 'Dale',
  x: COURTS[0].gateOut.x - 2.4,
  z: COURTS[0].gateOut.z,
  shirt: '#3f6fb0',
  shorts: '#5a3d2b',
  pants: true,
  skin: '#ffdbac',
  hair: '#d8d0c0',
  hairStyle: 'cap',
  cap: '#c4462b',
  shoes: '#5a3d2b',
});
dale.idleFace = 0.6;
let guests: Person[] = [];
let extras: Person[] = [];

/* ---------------- 游戏状态 ---------------- */
type Phase = 'title' | 'intro' | 'work' | 'choice' | 'opening' | 'match' | 'result' | 'end';
interface Result {
  cfg: CourtCfg;
  m: Measure;
  tier: Tier;
  fee: number;
  stars: number;
  note: string;
  waited: number;
  waitFrac: number;
  left: boolean;
  comp: boolean;
}
let phase: Phase = 'title';
let courtIdx = 0;
let results: Result[] = [];
let cash = 0;
let rnd: Rand = mulberry32(SEED);
let cfg = COURTS[0];
let model = new CourtModel(cfg, rnd);
let tool: Tool = 'broom';
let timeLeft = 0;
let waited = 0;
let patLeft = 0;
let extra = 0;
let elapsed = 0;
let flags = {
  patMax: 1,
  spawned: false,
  arrived: false,
  left: false,
  comp: false,
  forced: false,
  walkin: false,
  sandDone: false,
  roughDone: false,
};
let gusts: { at: number; warned: boolean; done: boolean; side: 1 | -1 }[] = [];
let gustNow = 0;
let gustSide: 1 | -1 = 1;
let windLevel = 0.3;
let lastM: Measure | null = null;
let tumble: Tumbleweed | null = null;
let tumbleT = 0;
let run: activities.ActivityRun | null = null;
let matchT = -1;
let matchNext = 0;
let matchCount = 0;

const ost: OverlayState = { tool: null, lock: -1, t: 0, guide: false };
const nv: NetView = { t: 0, up: false, wob: 0 };
const tv: ToolView = { tool: null, x: 0, z: 0, dx: 1, dz: 0, who: director, on: false, r: 1.6 };
const rt: Reticle = { on: false, x: 0, z: 0, fx: 0, fy: 0, q: 0 };
let overlay: Custom | null = null;
let netNode: Custom | null = null;
const toolNode = createTool(tv);
const retNode = createReticle(rt);
world.scene.add(toolNode, retNode);

/* ---------------- 坐标 ---------------- */
const canvasRect = () => world.view.canvas.getBoundingClientRect();
/** 世界点 → #ui 里的 CSS 坐标 */
function toUi(x: number, y: number, z: number): { x: number; y: number } {
  const p = world.camera.project(x, y, z);
  const cr = canvasRect();
  const ur = ui.getBoundingClientRect();
  return { x: p.x + cr.left - ur.left, y: p.y + cr.top - ur.top };
}
function floatAt(x: number, z: number, text: string, kind: 'good' | 'bad' | 'gold' | '' = '', y = 1.2): void {
  const p = toUi(x, y, z);
  floatText(fxl, p.x, p.y, text, { kind });
}
const W = (u: number, v: number) => ({ x: model.F.ox + u, z: model.F.oz + v });

/* ---------------- 镜头 ---------------- */
function frameCourt(instant: boolean): void {
  const F = model.F;
  const BW = world.view.BW;
  const k = Math.min(7.8, (BW * 0.97) / (2 * F.hx + 2 * F.hz));
  const dockH = $('dock').offsetHeight + 10;
  ui.style.setProperty('--dockH', `${dockH}px`);
  const topH = $('top').offsetHeight + 8;
  world.camera.limits = { zoom: [1, 16], tx: [-200, 200], tz: [-200, 200] };
  world.camera.occludedBottomPx = Math.max(0, dockH - topH);
  world.camera.setPose({ tx: F.ox, tz: F.oz, zoom: k, rot: 0 }, instant);
}

/* ---------------- 输入 ---------------- */
interface Stroke {
  id: number;
  /** 上一个工具点（局部） */
  u: number;
  v: number;
  du: number;
  dv: number;
  y0: number;
  /** 画线 */
  lock: number;
  lastP: number;
  first: boolean;
}
let stroke: Stroke | null = null;

function localAt(cssX: number, cssY: number): { u: number; v: number } {
  const w = world.camera.unproject(cssX, cssY, 0);
  return { u: w.x - model.F.ox, v: w.z - model.F.oz };
}
function clampIn(p: { u: number; v: number }, m = 0.5): { u: number; v: number } {
  const F = model.F;
  return { u: clamp(p.u, -F.hx + m, F.hx - m), v: clamp(p.v, -F.hz + m, F.hz - m) };
}
function cssOf(e: PointerEvent): { x: number; y: number } {
  const r = canvasRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

stage.addEventListener('pointerdown', (e) => {
  if (phase !== 'work' || stroke) return;
  stage.setPointerCapture(e.pointerId);
  const c = cssOf(e);
  buzz(8);
  if (tool === 'net') {
    stroke = { id: e.pointerId, u: 0, v: 0, du: 1, dv: 0, y0: c.y, lock: -1, lastP: 0, first: true };
    netDown();
    return;
  }
  const pen = tool === 'paint';
  const raw = localAt(c.x, pen ? c.y - PEN : c.y);
  const p = clampIn(raw, pen ? 0.1 : 0.6);
  stroke = { id: e.pointerId, u: p.u, v: p.v, du: 1, dv: 0, y0: c.y, lock: -1, lastP: 0, first: true };
  SFX.pick();
  tv.on = true;
  tv.tool = tool;
  tv.x = model.F.ox + p.u;
  tv.z = model.F.oz + p.v;
  director.base = 'carry';
  if (Math.hypot(director.pos.x - tv.x, director.pos.z - tv.z) > 3) parts.dust(director.pos.x, 0, director.pos.z, 6);
  if (pen) {
    rt.on = true;
    rt.fx = c.x / world.view.PS;
    rt.fy = c.y / world.view.PS;
    paintMove(raw.u, raw.v);
  } else applyTool(p.u, p.v, p.u, p.v);
});
stage.addEventListener('pointermove', (e) => {
  if (!stroke || e.pointerId !== stroke.id || phase !== 'work') return;
  const c = cssOf(e);
  if (tool === 'net') {
    netMove(c.y);
    return;
  }
  const pen = tool === 'paint';
  const raw = localAt(c.x, pen ? c.y - PEN : c.y);
  const p = clampIn(raw, pen ? 0.1 : 0.6);
  if (pen) {
    rt.fx = c.x / world.view.PS;
    rt.fy = c.y / world.view.PS;
    paintMove(raw.u, raw.v);
    return;
  }
  applyTool(stroke.u, stroke.v, p.u, p.v);
});
function endStroke(e: PointerEvent): void {
  if (!stroke || e.pointerId !== stroke.id) return;
  if (tool === 'net' && phase === 'work') netUp();
  else if (phase === 'work') SFX.drop();
  stroke = null;
  tv.on = false;
  rt.on = false;
  ost.lock = -1;
  director.base = 'relaxed';
}
stage.addEventListener('pointerup', endStroke);
stage.addEventListener('pointercancel', endStroke);

/** 扫、压、洒水：从 (u0, v0) 拖到 (u1, v1)，每 0.2 米做一次 */
function applyTool(u0: number, v0: number, u1: number, v1: number): void {
  const s = stroke;
  if (!s) return;
  const du = u1 - u0;
  const dv = v1 - v0;
  const d = Math.hypot(du, dv);
  if (d > 0.05) {
    s.du = s.du * 0.5 + (du / d) * 0.5;
    s.dv = s.dv * 0.5 + (dv / d) * 0.5;
    const l = Math.hypot(s.du, s.dv) || 1;
    s.du /= l;
    s.dv /= l;
  }
  const steps = Math.max(1, Math.ceil(d / 0.2));
  // 工具的大小按屏幕算（手指大约 30 像素宽），镜头远近变了也一样好推
  const ppm = world.camera.pxPerM;
  const R =
    tool === 'broom'
      ? clamp(13 / ppm, 1, 2.2)
      : tool === 'roller'
        ? clamp(11 / ppm, 0.9, 1.8)
        : clamp(15 / ppm, 1.1, 2.2);
  tv.r = R;
  let moved = 0;
  let out = 0;
  for (let k = 1; k <= steps; k++) {
    const u = u0 + (du * k) / steps;
    const v = v0 + (dv * k) / steps;
    if (tool === 'broom') {
      if (d < 0.05) continue;
      const r = model.sweep(u, v, s.du, s.dv, R);
      moved += r.moved;
      out += r.out;
      if (r.hit.length && every('weed', 160)) SND.crunch();
      for (const w of r.pulled) {
        const p = W(w.u, w.v);
        parts.debris(p.x, 0.1, p.z, 10, ['#8fbf4a', '#5a8a2e', '#6a4a2a']);
        floatAt(p.x, p.z, '拔掉！', 'good');
        SND.pullWeed();
        buzz(12);
        shake(stage);
      }
    } else if (tool === 'roller') {
      if (d < 0.05 && k > 1) continue;
      const r = model.roll(u, v, R);
      const p = W(u, v);
      if (r.crack && every('crk', 120)) {
        SND.crunch();
        buzz(6);
      }
      if (r.done && fxRand() < 0.25) parts.sparkle(p.x, 0.1, p.z, 3, '#f6f3ea');
      if (r.sandy && every('sandy', 2600)) {
        floatAt(p.x, p.z, '沙子垫着，压不实', 'gold');
        daleSay('先扫沙，不然压进去一层', 'sandy');
      }
      if (r.dry && every('dry', 2400)) {
        floatAt(p.x, p.z, '太干，压不动', 'gold');
        daleSay('红土干成砖了，先洒水', 'dry');
      }
      if (r.mud && every('mud', 1300)) {
        floatAt(p.x, p.z, '压出泥坑了！', 'bad');
        SFX.bad();
        shake(stage);
        buzz([20, 30, 20]);
        daleSay('水太多！等它干一点', 'mud');
        parts.mud(p.x, 0.1, p.z, 8);
      }
    } else if (tool === 'water') {
      const pud = model.water(u, v, R);
      const p = W(u, v);
      if (every('spl', 110)) {
        SND.splash();
        parts.splash(p.x, 0.2, p.z, 3);
      }
      if (pud && every('pud', 1600)) floatAt(p.x, p.z, '积水了', 'bad');
    }
  }
  const p = W(u1, v1);
  if (tool === 'broom' && moved > 0.25) {
    if (every('sw', 85)) SND.sweep();
    if (every('swd', 50))
      parts.dust(p.x + s.du * 0.8, 0.05, p.z + s.dv * 0.8, 2, fxRand() < 0.5 ? '#e9c999' : '#f2d8ad');
  }
  if (out > 0.4 && every('out', 120)) {
    parts.dust(p.x + s.du * 1.4, 0.4, p.z + s.dv * 1.4, 4, '#f2d8ad');
  }
  if (tool === 'roller' && d > 0.05 && every('roll', 95)) SND.roll();
  s.u = u1;
  s.v = v1;
  tv.x = p.x;
  tv.z = p.z;
  tv.dx = s.du;
  tv.dz = s.dv;
}

/** 画线：碰到金线就吸住，顺着线画；离线太远才算歪 */
function paintMove(u: number, v: number): void {
  const s = stroke;
  if (!s) return;
  const ppm = world.camera.pxPerM;
  const good = 16 / ppm;
  const wob = 30 / ppm;
  const grab = (s.first ? 30 : 18) / ppm;
  s.first = false;
  const p = W(u, v);
  rt.x = p.x;
  rt.z = p.z;
  tv.x = p.x;
  tv.z = p.z;
  const pd = Math.hypot(u - s.u, v - s.v);
  if (pd > 0.05) {
    tv.dx = (u - s.u) / pd;
    tv.dz = (v - s.v) / pd;
  }
  s.u = u;
  s.v = v;
  if (s.lock >= 0) {
    let n = model.nearest(u, v, s.lock);
    const g = model.segs[s.lock];
    const par = g.axis === 'u' ? u : v;
    const past = Math.max(g.a - par, par - g.b);
    // 过了线头：拐到最近的另一条线上（描一圈不用松手）
    if (past > 0.35 || n.d > good) {
      const alt = model.nearest(u, v);
      if (alt.s !== s.lock && alt.d < good) {
        s.lock = alt.s;
        s.lastP = alt.p;
        n = alt;
        SFX.tap();
      }
    }
    if (n.d <= wob) {
      const q = n.d <= good ? 1 : 2;
      const r = model.paintSeg(s.lock, s.lastP, n.p, q);
      s.lastP = n.p;
      rt.q = q === 1 ? 0 : 1;
      if (r.fresh && every('hiss', 70)) SND.hiss();
      if (r.fresh && fxRand() < 0.3) parts.dust(p.x, 0.05, p.z, 1, '#f6f3ea');
      if (q === 2 && r.fresh && every('wob', 1400)) floatAt(p.x, p.z, '手抖了', 'gold');
      if (r.dirty && every('pdirt', 1800)) {
        floatAt(p.x, p.z, '沙上画线，脏了', 'gold');
        SFX.buzz();
      }
      ost.lock = s.lock;
      return;
    }
    // 歪了：点一块擦不掉的白，断开，等手指回到线边再接上
    if (model.inCourt(u, v)) model.strayAt(u, v);
    s.lock = -1;
    ost.lock = -1;
    rt.q = 2;
    floatAt(p.x, p.z, '歪了！擦不掉', 'bad');
    SFX.bad();
    buzz([15, 30, 15]);
    shake(stage);
    return;
  }
  const n = model.nearest(u, v);
  if (n.d < grab) {
    s.lock = n.s;
    s.lastP = n.p;
    ost.lock = n.s;
    rt.q = 0;
    SFX.tap();
    buzz(6);
  } else rt.q = 1;
}

/* ---------------- 挂网 ---------------- */
const net = { drag: false, t: 0, lastTick: 0, target: 0.72 };
function netDown(): void {
  net.drag = true;
  net.t = 0;
  net.lastTick = 0;
  model.net.hung = false;
  nv.up = true;
  nv.t = 0;
  director.base = 'pull';
  SFX.pick();
}
function netMove(y: number): void {
  if (!net.drag || !stroke) return;
  net.t = clamp((stroke.y0 - y) / 230, 0, 1.05);
  nv.t = net.t;
  const tick = Math.floor(net.t * 20);
  if (tick > net.lastTick) {
    net.lastTick = tick;
    SND.tick(tick);
    if (tick % 4 === 0) buzz(5);
  }
  if (net.t > 1.0) netSnap();
}
function netSnap(): void {
  net.drag = false;
  net.t = 0;
  model.net.hung = false;
  nv.up = false;
  nv.t = 0;
  SND.snap();
  shake(stage);
  flash(ui, '#ff8a6b');
  buzz([30, 40, 30]);
  floatAt(model.F.ox, model.F.oz, '绳断了！', 'bad', 1.6);
  daleSay('拉太狠了，换根绳再来', null);
  director.base = 'relaxed';
}
function netUp(): void {
  director.base = 'relaxed';
  if (!net.drag) return;
  net.drag = false;
  const F = model.F;
  if (net.t < 0.15) {
    net.t = 0;
    nv.up = model.net.hung;
    nv.t = model.net.t;
    return;
  }
  const off = Math.abs(net.t - net.target);
  model.net.hung = true;
  model.net.t = net.t;
  model.net.score = Math.round(clamp(100 - off * 280, 15, 100));
  nv.t = net.t;
  nv.wob = 1;
  SND.twang(0.7 + net.t * 0.6);
  buzz(20);
  parts.sparkle(F.ox, 1, F.oz - 6.4, 6, '#f6f3ea');
  parts.sparkle(F.ox, 1, F.oz + 6.4, 6, '#f6f3ea');
  if (off < 0.03) {
    floatAt(F.ox, F.oz, '完美张力！', 'gold', 1.6);
    SFX.coin();
    flash(ui, '#fff4c8');
    fx.emote(director.headTop, 'star', 1.4);
  } else if (off < 0.08) floatAt(F.ox, F.oz, '挂好了', 'good', 1.6);
  else if (net.t < net.target) floatAt(F.ox, F.oz, '网太松，软塌塌', 'gold', 1.6);
  else floatAt(F.ox, F.oz, '太紧了，有点悬', 'gold', 1.6);
}
function drawGauge(): void {
  const g = $('gauge');
  const show = phase === 'work' && tool === 'net';
  g.classList.toggle('on', show);
  if (!show) return;
  net.target = 0.72 + Math.sin(elapsed * 1.7) * (gustNow > 0 ? 0.06 : 0.02);
  const t = net.drag ? net.t : model.net.hung ? model.net.t : 0;
  const gz = $('gz');
  gz.style.bottom = `${(net.target - 0.07) * 100}%`;
  gz.style.height = '14%';
  $('gn').style.bottom = `${Math.min(1, t) * 100}%`;
  $('gv').textContent = net.drag ? `${Math.round(t * 100)}%` : model.net.hung ? `${model.net.score}分` : '拉！';
  g.classList.toggle('hot', net.drag && t > 0.9);
}

/* ---------------- Dale 和提示 ---------------- */
const said = new Set<string>();
function daleSay(text: string, key: string | null): void {
  if (key) {
    if (said.has(key)) return;
    said.add(key);
  }
  fx.say(dale.headTop, text, 2.6);
}
function hint(text: string): void {
  const h = $('hint');
  h.textContent = text;
  h.classList.remove('on');
  void h.offsetWidth;
  h.classList.add('on');
}
function banner(text: string, ms = 1300, cls = ''): void {
  const b = $('banner');
  b.textContent = text;
  b.className = `on ${cls}`;
  clearTimeout((banner as unknown as { t?: number }).t);
  (banner as unknown as { t?: number }).t = window.setTimeout(() => {
    b.className = '';
  }, ms);
}

/* ---------------- 工具栏 ---------------- */
function buildTools(): void {
  const t = $('tools');
  t.innerHTML = '';
  for (const id of cfg.tools) {
    const b = document.createElement('button');
    b.className = 'tool';
    b.dataset.t = id;
    b.appendChild(artCanvas(id, 3));
    const s = document.createElement('span');
    s.textContent = model.clay && id === 'paint' ? '贴胶带' : TOOL_NAME[id];
    b.appendChild(s);
    b.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      if (phase !== 'work') return;
      selectTool(id);
      buzz(8);
    });
    t.appendChild(b);
  }
}
function selectTool(id: Tool): void {
  tool = id;
  SFX.tap();
  for (const b of document.querySelectorAll<HTMLElement>('.tool')) {
    const on = b.dataset.t === id;
    b.classList.toggle('on', on);
    if (on) pop(b);
  }
  ost.tool = id;
  ost.guide = id === 'paint';
  const key = model.clay && (id === 'roller' || id === 'paint') ? `${id}_clay` : id;
  hint(TOOL_HINT[key] ?? '');
  if (id === 'net') {
    const F = model.F;
    director.clearMoves();
    director.go(F.ox + 0.6, F.oz + 6.385 + 0.5, 4);
    director.idleFace = Math.PI;
  } else director.idleFace = null;
}

/* ---------------- 计分 ---------------- */
const barCol = (v: number) => (v >= 85 ? 'var(--green-2)' : v >= 55 ? 'var(--amber)' : 'var(--coral)');
function updateMeters(): Measure {
  const m = model.measure();
  for (const [k, nm] of meterDefs) {
    const v = m[k] as number;
    const f = $(`mf${k}`);
    const t = $(`mv${k}`);
    f.style.width = `${v}%`;
    f.style.background = barCol(v);
    const lv = lastM ? (lastM[k] as number) : v;
    if (v !== lv) {
      t.textContent = String(v);
      if (v > lv && Math.floor(v / 10) > Math.floor(lv / 10)) pop(t);
      if (v >= 98 && lv < 98) {
        SFX.coin();
        hint(`${nm}满分！`);
        flash(ui, '#fff8dc');
      } else if (Math.floor(v / 25) > Math.floor(lv / 25) && v < 98) SFX.tap();
      else if (v < lv - 3) {
        const p = toUi(model.F.ox, 0, model.F.oz);
        floatText(fxl, p.x, p.y, `${nm} −${lv - v}`, { kind: 'bad' });
      }
    } else t.textContent = String(v);
  }
  const tier = tierOf(m.Q);
  const lt = lastM ? tierOf(lastM.Q) : tier;
  if (tier.g !== lt.g && tier.p > lt.p) {
    banner(`升到 ${tier.g} 档！$${tier.p}/h`, 1300, 'gold');
    SFX.fanfare();
    buzz([10, 40, 10]);
  }
  for (const b of document.querySelectorAll<HTMLElement>('.tool')) {
    const id = b.dataset.t;
    const done =
      id === 'broom'
        ? m.C >= 90
        : id === 'roller'
          ? m.F >= 90
          : id === 'paint'
            ? m.L >= 85
            : id === 'net'
              ? m.N >= 85
              : id === 'water'
                ? m.F >= 90
                : false;
    b.classList.toggle('done', done);
  }
  $('openS').textContent = `现在 ${tier.g} 档 · $${tier.p}/h`;
  $('open').dataset.g = tier.g;
  // 收尾：沙子只剩一成、坑只剩一点，一口气清掉（最后的边角不用一格格磨）
  if (phase === 'work') {
    if (!flags.sandDone && m.sandLeft <= 0.08) finishSand();
    if (flags.sandDone && m.sandLeft > 0.16) flags.sandDone = false;
    if (!flags.roughDone && m.roughLeft <= 0.08) finishRough();
  }
  lastM = m;
  return m;
}
function finishSand(): void {
  flags.sandDone = true;
  const cells = model.finishSand();
  for (let i = 0; i < cells.length; i += 3) {
    const c = cells[i];
    const p = W(model.cu(c % model.nx), model.cv(Math.floor(c / model.nx)));
    parts.dust(p.x, 0.05, p.z, 1, fxRand() < 0.5 ? '#e9c999' : '#f2d8ad');
  }
  floatAt(director.pos.x, director.pos.z, '收尾！沙子清光', 'gold', 2);
  SFX.whoosh();
  SFX.coin();
  fx.emote(director.headTop, 'star', 1.2);
}
function finishRough(): void {
  flags.roughDone = true;
  const cells = model.finishRough();
  for (let i = 0; i < cells.length; i += 4) {
    const c = cells[i];
    const p = W(model.cu(c % model.nx), model.cv(Math.floor(c / model.nx)));
    parts.sparkle(p.x, 0.1, p.z, 2, '#f6f3ea');
  }
  floatAt(director.pos.x, director.pos.z, '收尾！场子压平了', 'gold', 2);
  SFX.coin();
}

/* ---------------- 阵风 ---------------- */
function scheduleGusts(): void {
  gusts = [];
  for (let k = 0; k < cfg.gusts; k++)
    gusts.push({
      at: cfg.T * (cfg.gusts === 1 ? 0.4 + rnd() * 0.2 : k === 0 ? 0.25 + rnd() * 0.15 : 0.65 + rnd() * 0.2),
      warned: false,
      done: false,
      side: rnd() < 0.5 ? 1 : -1,
    });
}
/** 屏幕上的风线（像素条，顺着风横扫过去） */
function windFx(side: 1 | -1): void {
  const w = $('wind');
  w.innerHTML = '';
  for (let i = 0; i < 16; i++) {
    const b = document.createElement('i');
    b.style.top = `${12 + fxRand() * 62}%`;
    b.style.width = `${30 + fxRand() * 70}px`;
    b.style.animationDelay = `${fxRand() * 1.2}s`;
    b.style.animationDuration = `${0.5 + fxRand() * 0.35}s`;
    w.appendChild(b);
  }
  w.className = side > 0 ? 'on r' : 'on l';
  window.setTimeout(() => {
    w.className = '';
  }, 2000);
}
function updateGust(dt: number): void {
  for (const g of gusts) {
    if (!g.warned && elapsed >= g.at - 1.5) {
      g.warned = true;
      gustSide = g.side;
      banner(gustSide > 0 ? '起风了！ →' : '← 起风了！', 1500, 'gold');
      SFX.tap();
      buzz(10);
    }
    if (!g.done && elapsed >= g.at) {
      g.done = true;
      gustNow = 1.8;
      SND.wind();
      shake(stage);
      buzz([20, 20, 20]);
      daleSay('风把沙吹回来了！', null);
      const F = model.F;
      tumble = createTumbleweed(
        world.scene,
        site.groundY,
        {
          x0: F.ox - F.hx - 4,
          x1: F.ox + F.hx + 4,
          z0: F.oz - 3,
          z1: F.oz + 3,
        },
        { dir: { x: gustSide, z: 0.15 }, seed: (rnd() * 1e6) | 0 },
      );
      tumbleT = 3.5;
      nv.wob = 1;
      windFx(gustSide);
    }
  }
  if (gustNow > 0) {
    gustNow -= dt;
    model.gust(gustSide, rnd, dt * 60);
    const F = model.F;
    for (let k = 0; k < 6; k++) {
      const x = gustSide > 0 ? F.ox - F.hx + fxRand() * 8 : F.ox + F.hx - fxRand() * 8;
      parts.add({
        x,
        y: 0.2 + fxRand() * 0.8,
        z: F.oz - F.hz + fxRand() * F.hz * 2,
        vx: gustSide * (9 + fxRand() * 6),
        vy: 0,
        vz: fxRand() - 0.5,
        max: 0.9,
        s: 0.16,
        sx: 3,
        col: fxRand() < 0.5 ? '#f2d8ad' : '#e9c999',
        drag: 0.99,
      });
    }
  }
  windLevel += ((gustNow > 0 ? 1 : cfg.gusts > 1 ? 0.5 : 0.3) - windLevel) * Math.min(1, dt * 3);
}

/* ---------------- 客人 ---------------- */
function guestLook(i: number, vip: boolean): Partial<PersonOptions> {
  const r = () => rnd();
  const pick = <T>(a: readonly T[]) => a[Math.floor(r() * a.length)];
  return {
    shirt: vip ? (i % 2 ? '#d8c08a' : '#f2b134') : pick(TOPS),
    shorts: pick(BOTTOMS),
    skin: pick(SKINS),
    hair: pick(HAIRS),
    hairStyle: pick(STYLES),
    racket: vip ? '#14223a' : '#2c5fbf',
  };
}
function waitSpot(i: number): { x: number; z: number } {
  const g = cfg.gateOut;
  return { x: g.x + 1.2 + i * 0.9, z: g.z + (i % 2) * 0.3 };
}
function spawnGuests(placed: boolean): void {
  for (const p of guests) removePerson(p);
  guests = [];
  for (let i = 0; i < cfg.guests; i++) {
    const s = waitSpot(i);
    const start = placed ? s : { x: cfg.from.x - i * 1.1, z: cfg.from.z + (i % 2) * 0.4 };
    const p = mkPerson({ name: `客人${i}`, x: start.x, z: start.z, ...guestLook(i, cfg.fee > 1) });
    if (!placed) p.go(s.x, s.z, 2.2);
    p.idleFace = Math.atan2(cfg.gateIn.x - s.x, cfg.gateIn.z - s.z);
    guests.push(p);
  }
}

/* ---------------- 流程 ---------------- */
function card(html: string): HTMLElement {
  const c = $('card');
  c.innerHTML = html;
  $('modal').hidden = false;
  return c;
}
function closeCard(): void {
  $('modal').hidden = true;
}
function onTap(id: string, fn: () => void): void {
  const el = document.getElementById(id);
  el?.addEventListener('click', (e) => {
    e.stopPropagation();
    fn();
  });
}

function showTitle(): void {
  phase = 'title';
  card(`<div class="k-label">PALM OASIS · 06</div>
    <h1>场地养护</h1>
    <p>荒了十年的球场，埋在沙里。</p>
    <p class="hl">扫沙 · 压平 · 描线 · 挂网</p>
    <p class="sm">早开便宜，晚开客人冒火。</p>
    <button class="k-btn primary big" id="go">开始</button>`);
  onTap('go', () => {
    SFX.coin();
    startGame();
  });
}
function startGame(): void {
  rnd = mulberry32(SEED);
  fxRand = mulberry32(SEED ^ 0x5eed);
  courtIdx = 0;
  results = [];
  cash = 0;
  $('cash').textContent = '$0';
  for (const c of COURTS) ov.set(c.facility, INITIAL_STATES[c.facility as keyof typeof INITIAL_STATES]);
  setupCourt();
}
function setupCourt(): void {
  cfg = COURTS[courtIdx];
  run?.stop();
  run = null;
  for (const p of [...guests, ...extras]) removePerson(p);
  guests = [];
  extras = [];
  // 换场：上一块的叠层、网拿掉，地图上这块场回到荒废的样子
  if (overlay) world.scene.remove(overlay);
  if (netNode) world.scene.remove(netNode);
  model = new CourtModel(cfg, rnd);
  ov.set(cfg.facility, cfg.ruinState);
  ov.flush?.();
  paintCourtBase(world, model);
  hideSiteNet(world, model);
  hideFrontFence(world, model);
  ost.tool = null;
  ost.guide = false;
  ost.lock = -1;
  overlay = createOverlay(model, ost);
  nv.up = false;
  nv.t = 0;
  nv.wob = 0;
  netNode = createNet(model, nv);
  world.scene.add(overlay, netNode);
  daylight.update(cfg.minute, 0);
  director.clearMoves();
  director.pos.set(cfg.gateIn.x, 0, cfg.gateIn.z);
  director.base = 'relaxed';
  dale.clearMoves();
  dale.pos.set(cfg.gateOut.x - 2.4, 0, cfg.gateOut.z);
  dale.idleFace = Math.atan2(model.F.ox - dale.pos.x, model.F.oz - dale.pos.z);
  lastM = null;
  said.clear();
  buildTools();
  frameCourt(courtIdx === 0);
  showIntro();
}
function showIntro(): void {
  phase = 'intro';
  $('cnum').textContent = `COURT ${courtIdx + 1}/3`;
  $('cname').textContent = `${cfg.name} · ${cfg.label}`;
  $('timer').textContent = '—';
  card(`<div class="k-label">COURT ${courtIdx + 1}/3 · ${cfg.label}</div>
    <h2>${cfg.name}</h2>
    <p>${cfg.story}</p>
    <div class="facts"><span>客人 <b>${cfg.guests}</b> 位</span><span><b>${cfg.T}s</b> 后到</span><span>最多等 <b>${cfg.pat}s</b></span>${cfg.fee > 1 ? '<span class="g">订金 ×2</span>' : ''}</div>
    <button class="k-btn go big" id="go">开工！</button>`);
  onTap('go', () => {
    SFX.tap();
    closeCard();
    beginWork();
  });
}
function beginWork(): void {
  phase = 'work';
  timeLeft = cfg.T;
  waited = 0;
  elapsed = 0;
  extra = 0;
  patLeft = cfg.pat;
  gustNow = 0;
  flags = {
    patMax: cfg.pat,
    spawned: false,
    arrived: false,
    left: false,
    comp: false,
    forced: false,
    walkin: false,
    sandDone: false,
    roughDone: false,
  };
  scheduleGusts();
  $('dock').classList.add('on');
  selectTool('broom');
  daleSay(
    courtIdx === 0 ? '先扫沙，再压，再画线' : courtIdx === 1 ? '红土：洒水、压实、贴线' : '贵宾场，风大，手要稳',
    null,
  );
  fx.emote(director.headTop, 'broom', 1.4);
  updateMeters();
}

function openCourt(): void {
  if (phase !== 'work') return;
  stroke = null;
  tv.on = false;
  rt.on = false;
  const m = model.measure();
  if (!flags.spawned) {
    spawnGuests(true);
    flags.spawned = true;
  }
  if (flags.left && !flags.walkin) {
    spawnGuests(false);
    flags.walkin = true;
  }
  const waitFrac = flags.left ? 1 : clamp(waited / cfg.pat, 0, 1.6);
  const tier = tierOf(m.Q);
  let fee: number;
  let stars = 1 + m.Q / 25;
  let note: string;
  if (flags.left) {
    fee = tier.p;
    stars -= 1.5;
    note = '第一批客人走了，路人随便打打';
  } else if (flags.comp) {
    fee = 0;
    stars -= 0.5 + waitFrac * 0.4;
    note = '免单了，客人倒也没说啥';
  } else if (flags.forced) {
    fee = Math.round(tier.p * 2 * cfg.fee * 0.5);
    stars -= 1.2;
    note = '客人憋着火开打';
  } else if (waited <= 0) {
    fee = tier.p * 2 * cfg.fee;
    stars += 0.5;
    note = '准点开场';
  } else {
    fee = Math.round(tier.p * 2 * cfg.fee * (1 - 0.4 * waitFrac));
    stars -= waitFrac;
    note = `客人等了 ${Math.round(waited)} 秒`;
  }
  stars = Math.round(clamp(stars, 1, 5) * 2) / 2;
  results.push({
    cfg,
    m,
    tier,
    fee,
    stars,
    note,
    waited: Math.round(waited),
    waitFrac,
    left: flags.left,
    comp: flags.comp,
  });
  phase = 'opening';
  $('dock').classList.remove('on');
  $('gauge').classList.remove('on');
  ost.guide = false;
  // 高光：围网补上、灯亮、新网（真地图上这块设施切到修好的状态），白线还是你画的
  ov.set(cfg.facility, cfg.freshState);
  ov.flush?.();
  paintCourtBase(world, model, true);
  hideSiteNet(world, model);
  if (!model.net.hung) {
    nv.up = true;
    nv.t = 0.25;
    daleSay('没网？拿绳子凑合吧', null);
  }
  SFX.fanfare();
  flash(ui, '#fff4c8');
  buzz([20, 40, 60]);
  banner('开场！', 1200, 'gold');
  parts.confetti(model.F.ox, 2, model.F.oz, 50, 4);
  fx.emote(dale.headTop, 'excl', 1.2);
  // 客人进门，总监和 Dale 让到场边
  guests.forEach((p, i) => {
    p.clearMoves();
    p.path(
      [
        { x: cfg.gateOut.x, z: cfg.gateOut.z },
        { x: cfg.gateIn.x + (i - 0.5) * 0.8, z: cfg.gateIn.z },
      ],
      2.4,
    );
  });
  director.clearMoves();
  director.go(cfg.gateIn.x - 2.5, cfg.gateIn.z, 3);
  director.idleFace = Math.atan2(model.F.ox - (cfg.gateIn.x - 2.5), model.F.oz - cfg.gateIn.z);
  $('hint').classList.remove('on');
  openWait = 0;
  window.setTimeout(startMatch, 1200);
}

let openWait = 0;
function startMatch(): void {
  if (phase !== 'opening') return;
  // 等客人走进门（借给比赛的人从原地走到站位，别穿过围网）
  const inside = guests.every((p) => Math.hypot(p.pos.x - cfg.gateIn.x, p.pos.z - cfg.gateIn.z) < 2.5);
  if (!inside && openWait++ < 30) {
    window.setTimeout(startMatch, 300);
    return;
  }
  phase = 'match';
  const m = results[results.length - 1].m;
  const Q = m.Q;
  run = activities.startActivity(
    { scene: world.scene, sched, world: pw, groundY: site.groundY, lang: 'zh', rand: mulberry32(SEED + courtIdx) },
    'match',
    {
      area: model.F,
      conditions: {
        fatigue: clamp(0.85 - Q / 120, 0.05, 0.85),
        weather: cfg.gusts > 1 ? 'wind' : 'sun',
        coach: 3,
        venue: 'hollow',
      },
      params: { tier: 1, diff: Q >= 85 ? 2 : Q >= 70 ? 1 : Q >= 50 ? 0 : Q >= 35 ? -1 : -2, fmt: 'd', finale: 'none' },
      cast: { players: guests.slice(0, 2) },
      seed: SEED + courtIdx * 31,
      // 对手从门口冒出来（像素溶解），直接走到站位
      entry: { from: (p) => [{ x: cfg.gateIn.x, z: cfg.gateIn.z }, p] },
    },
  );
  matchT = -1;
  matchCount = 0;
  for (const el of document.querySelectorAll<HTMLElement>('#mbar [data-k]')) {
    el.classList.remove('hit');
    const b = el.querySelector('b');
    if (b) b.textContent = '0';
  }
  $('mbar').classList.add('on');
  banner('第一场开打！', 1300);
}

/** 第一场：按场地的毛病演出来（坏弹跳、打滑、压线吵架、挂网），场子好就"好球" */
function matchTick(dt: number): void {
  if (!run) return;
  if (matchT < 0) {
    if (!run.ready) return;
    matchT = 0;
    matchNext = 1.2;
  }
  matchT += dt;
  if (matchT >= matchNext && matchCount < 6) {
    matchNext = matchT + 1.2 + fxRand() * 0.5;
    matchCount++;
    matchEvent();
  }
  if (matchT > 8.5 && phase === 'match') {
    phase = 'result';
    run.stop({ graceful: true });
    $('mbar').classList.remove('on');
    window.setTimeout(showResult, 900);
  }
}
function matchPlayers(): Person[] {
  // 借给比赛的人换到了活动的局部坐标系里：按节点的世界位置判断在不在场上
  const F = model.F;
  return pw.people.filter((p) => {
    if (p === director || p === dale || p.removed || !p.root.parent) return false;
    const w = p.root.getWorldPosition();
    return F.inside(w.x, w.z, 0);
  });
}
function matchEvent(): void {
  const m = results[results.length - 1].m;
  const ps = matchPlayers();
  if (!ps.length) return;
  const p = ps[Math.floor(fxRand() * ps.length)];
  const w = [
    ['bad', (100 - m.F) * 1.1],
    ['slip', (100 - m.C) * 1.1],
    ['line', m.L < 75 ? (100 - m.L) * 0.9 : 0],
    ['net', m.N < 45 ? 60 : 0],
    ['good', m.Q * 0.7],
  ] as const;
  const tot = w.reduce((s, [, v]) => s + v, 0);
  let x = fxRand() * tot;
  let kind: (typeof w)[number][0] = 'good';
  for (const [k, v] of w) {
    x -= v;
    if (x <= 0) {
      kind = k;
      break;
    }
  }
  const F = model.F;
  const now = sched.now;
  const chip = document.querySelector<HTMLElement>(`#mbar [data-k="${kind}"]`);
  const cb = chip?.querySelector('b');
  if (chip && cb) {
    cb.textContent = String(Number(cb.textContent) + 1);
    chip.classList.add('hit');
    pop(chip);
  }
  // 世界坐标里的人（借来的人被换到活动的局部坐标系里，用节点的世界位置）
  const wp = p.root.getWorldPosition();
  if (kind === 'bad') {
    let spot = { u: wp.x - F.ox, v: wp.z - F.oz };
    for (let k = 0; k < 300; k++) {
      const c = Math.floor(fxRand() * model.N);
      if (model.rough[c] > 0.3) {
        spot = { u: model.cu(c % model.nx), v: model.cv(Math.floor(c / model.nx)) };
        break;
      }
    }
    const s = W(spot.u, spot.v);
    parts.dust(s.x, 0.05, s.z, 6, '#9a8a72');
    floatAt(s.x, s.z, '坏弹跳！', 'bad', 0.6);
    fx.emote(p.headTop, 'anger', 1.4);
    SFX.bad();
    shake(stage);
  } else if (kind === 'slip') {
    parts.dust(wp.x, 0.05, wp.z, 10, '#e9c999');
    floatAt(wp.x, wp.z, '打滑！满地沙', 'bad');
    fx.emote(p.headTop, 'sweat', 1.4);
    p.hop(now, 0.12, 0.3);
    SND.crunch();
  } else if (kind === 'line') {
    floatAt(wp.x, wp.z, fxRand() < 0.5 ? '出界！' : '压线了！', 'bad');
    for (const q of ps.slice(0, 2)) {
      q.gesture('argue', now, 1.6);
      fx.emote(q.headTop, 'anger', 1.6);
    }
    SFX.buzz();
  } else if (kind === 'net') {
    floatAt(F.ox, F.oz, '网太松，球挂网', 'bad', 1.3);
    nv.wob = 1;
    fx.emote(p.headTop, 'ques', 1.4);
    SFX.buzz();
  } else {
    floatAt(wp.x, wp.z, m.Q >= 75 && fxRand() < 0.5 ? '这场子真平' : '好球！', 'good');
    fx.emote(p.headTop, fxRand() < 0.5 ? 'heart' : 'thumb', 1.4);
    if (fxRand() < 0.4) dale.gesture('clap', now, 1.2);
    SFX.coin();
  }
}

function showChoice(): void {
  phase = 'choice';
  SFX.bad();
  shake(stage);
  buzz([30, 40, 30]);
  const m = model.measure();
  const tier = tierOf(m.Q);
  const fee = tier.p * 2 * cfg.fee;
  card(`<div class="k-label warn">PATIENCE · 0</div>
    <h2>客人等不下去了</h2>
    <p>"我们订的是现在！"</p>
    <p class="sm">现在 ${m.Q} 分 · ${tier.g} 档 $${tier.p}/h</p>
    <button class="opt" id="o1"><b>现在就开场</b><span><i class="g">订金一半 $${Math.round(fee / 2)}</i><i class="r">口碑 −1★</i></span></button>
    <button class="opt" id="o2"><b>免单，再等 15 秒</b><span><i class="r">订金 $0</i><i class="g">多 15 秒干活</i></span></button>
    <button class="opt" id="o3"><b>让他们走吧</b><span><i class="r">口碑 −1.5★</i><i class="g">再给你 15 秒</i></span></button>`);
  const go = (fn: () => void) => () => {
    closeCard();
    SFX.tap();
    fn();
  };
  onTap(
    'o1',
    go(() => {
      flags.forced = true;
      phase = 'work';
      openCourt();
    }),
  );
  onTap(
    'o2',
    go(() => {
      flags.comp = true;
      flags.patMax = 15;
      patLeft = 15;
      phase = 'work';
      const p = guests[0];
      if (p) {
        const q = toUi(p.pos.x, 2, p.pos.z);
        floatText(fxl, q.x, q.y, `免单 −$${fee}`, { kind: 'bad' });
        fx.emote(p.headTop, 'sweat', 1.6);
      }
      SFX.bad();
    }),
  );
  onTap(
    'o3',
    go(() => {
      flags.left = true;
      extra = 15;
      phase = 'work';
      guestsLeave();
      const p = guests[0];
      if (p) {
        const q = toUi(p.pos.x, 2, p.pos.z);
        floatText(fxl, q.x, q.y, '口碑 −1.5★', { kind: 'bad' });
      }
      shake(stage);
    }),
  );
}
function guestsLeave(): void {
  for (const p of guests) {
    p.clearMoves();
    p.go(cfg.from.x, cfg.from.z, 2.6);
    fx.emote(p.headTop, 'anger', 2.4);
  }
  const gone = guests;
  guests = [];
  extras.push(...gone);
  window.setTimeout(() => {
    for (const p of gone) removePerson(p);
  }, 6000);
}

function starStr(s: number): string {
  let o = '';
  for (let k = 1; k <= 5; k++) o += s >= k ? '★' : s >= k - 0.5 ? '⯪' : '☆';
  return o;
}
function reviewLine(r: Result): string {
  const m = r.m;
  const low = (
    [
      ['F', m.F],
      ['L', m.L],
      ['C', m.C],
      ['N', m.N],
    ] as const
  )
    .slice()
    .sort((a, b) => a[1] - b[1])[0];
  let q: string;
  if (m.Q >= 90) q = '"比我家客厅还平！"';
  else if (low[0] === 'N' && m.N === 0) q = '"连网都没有？"';
  else if (low[1] >= 75) q = '"挑不出大毛病。"';
  else if (low[0] === 'F') q = '"球落地乱蹦。"';
  else if (low[0] === 'L') q = '"线歪得像蛇。"';
  else if (low[0] === 'C') q = '"跑一步滑一步。"';
  else q = '"网软塌塌的。"';
  if (r.left) q = `"再也不来了。" ${q}`;
  else if (r.waited > 8 && !r.comp) q = `"等了半天！" ${q}`;
  return q;
}
function gradeCol(g: string): string {
  return g === 'S' || g === 'A' ? 'var(--money)' : g === 'B' ? 'var(--amber)' : 'var(--coral)';
}
function showResult(): void {
  phase = 'result';
  const r = results[results.length - 1];
  const m = r.m;
  const c = card(`<div class="k-label">${r.cfg.name} · 场地评分</div>
    <div class="rows">${(
      [
        ['平整', m.F],
        ['线条', m.L],
        ['干净', m.C],
        ['球网', m.N],
      ] as const
    )
      .map(
        ([n, v], k) =>
          `<div class="row"><span>${n}</span><div class="bar"><i id="rf${k}" style="background:${barCol(v)}"></i></div><b class="k-num">${v}</b></div>`,
      )
      .join('')}</div>
    <div class="gradeRow"><div class="grade" id="grd" style="color:${gradeCol(r.tier.g)}">${r.tier.g}</div>
      <div><div class="k-num">${m.Q} 分</div><div class="sm">以后每小时 <b>$${r.tier.p}</b></div></div></div>
    <p class="sm">${r.note}：${r.fee > 0 ? `<b class="g">订金 +$${r.fee}</b>` : '<b class="r">订金 $0</b>'}</p>
    <div class="quote"><div class="stars">${starStr(r.stars)}</div>${reviewLine(r)}</div>
    <button class="k-btn primary big" id="go">${courtIdx < 2 ? '下一块场 →' : '看总成绩'}</button>`);
  [m.F, m.L, m.C, m.N].forEach((v, k) => {
    window.setTimeout(
      () => {
        const f = c.querySelector<HTMLElement>(`#rf${k}`);
        if (f) f.style.width = `${v}%`;
        sfx({ f: 400 + v * 6, dur: 0.06, vol: 0.08 });
      },
      150 + k * 240,
    );
  });
  window.setTimeout(() => {
    const gd = c.querySelector<HTMLElement>('#grd');
    if (!gd) return;
    gd.classList.add('in');
    if (r.tier.p >= 45) {
      SFX.fanfare();
      flash(ui, '#fff4c8');
    } else if (r.tier.p <= 20) SFX.bad();
    else SFX.coin();
    if (r.fee > 0) {
      SFX.bigCoin();
      const from = cash;
      cash += r.fee;
      tween(from, cash, 700, (v) => {
        $('cash').textContent = `$${Math.round(v)}`;
      });
      pop($('cash'));
      const rc = $('cash').getBoundingClientRect();
      const ur = ui.getBoundingClientRect();
      floatText(fxl, rc.left - ur.left + rc.width / 2, rc.bottom - ur.top + 6, `+$${r.fee}`, {
        kind: 'good',
        rise: -30,
      });
    }
  }, 1250);
  onTap('go', () => {
    SFX.tap();
    closeCard();
    if (courtIdx < 2) {
      courtIdx++;
      setupCourt();
    } else showEnd();
  });
}
function showEnd(): void {
  phase = 'end';
  const n = results.length;
  const avgStars = results.reduce((a, r) => a + r.stars, 0) / n;
  const avgQ = results.reduce((a, r) => a + r.m.Q, 0) / n;
  const avgWait = results.reduce((a, r) => a + Math.min(1, r.waitFrac), 0) / n;
  const lefts = results.filter((r) => r.left).length;
  const hours = 6 + 4 * avgStars;
  const weekly = results.reduce((a, r) => a + r.tier.p * hours, 0) | 0;
  const fees = results.reduce((a, r) => a + r.fee, 0);
  let title: string;
  let line: string;
  if (avgQ >= 82 && avgWait < 0.3) {
    title = '神仙总监';
    line = '又快又好，Dale 把帽子都摘了。';
  } else if (lefts >= 2) {
    title = '放鸽子总监';
    line = '场是修好了，客人去了隔壁。';
  } else if (avgQ >= 80) {
    title = '强迫症总监';
    line = '线必须直，客人可以等。';
  } else if (avgQ < 58 && avgWait < 0.25) {
    title = '快手总监';
    line = '先开张再说，差评明天再管。';
  } else if (avgQ < 50) {
    title = '糊弄总监';
    line = '又慢又糙，Dale 默默拿起扫把。';
  } else {
    title = '务实总监';
    line = '该糊弄的糊弄，该较真的较真。';
  }
  SFX.fanfare();
  // 镜头拉远看三块修好的场
  world.camera.setPose({ tx: -2, tz: 14, zoom: Math.min(4, (world.view.BW * 0.95) / 75), rot: 0 }, false);
  card(`<div class="k-label">第一周 · 开张</div>
    <table class="tbl">${results
      .map(
        (r) =>
          `<tr><td>${r.cfg.name}</td><td><b style="color:${gradeCol(r.tier.g)}">${r.tier.g}</b> ${r.m.Q}分</td><td>$${r.tier.p}/h</td><td class="${r.fee ? 'g' : 'r'}">+$${r.fee}</td><td class="st">${r.stars}★</td></tr>`,
      )
      .join('')}</table>
    <div class="sum"><div><span class="k-label">订金</span><b class="k-num g">$${fees}</b></div><div><span class="k-label">口碑</span><b class="k-num">${avgStars.toFixed(1)}★</b></div><div><span class="k-label">本周场租</span><b class="k-num g">$${weekly}</b></div></div>
    <div class="title">${title}</div><p>${line}</p>
    <button class="k-btn primary big" id="go">再来一局</button>`);
  onTap('go', () => {
    SFX.tap();
    SEED = (SEED * 7 + 13) % 1e9;
    closeCard();
    startGame();
  });
}

/* ---------------- 每帧 ---------------- */
function setInfo(): void {
  const t = $('timer');
  let txt = '—';
  let warn = false;
  if (phase === 'work') {
    if (flags.left) {
      txt = `路人 ${Math.ceil(extra)}s`;
      warn = extra < 6;
    } else if (!flags.arrived) {
      txt = `客人 ${Math.ceil(timeLeft)}s 到`;
      warn = timeLeft < 10;
    } else {
      txt = `已等 ${Math.floor(waited)}s`;
      warn = true;
    }
  }
  if (t.textContent !== txt) t.textContent = txt;
  t.classList.toggle('warn', warn);
}

/** 客人头上的耐心牌（照游戏的地点牌：海军蓝小牌 + 细竖线） */
const ptag = document.createElement('div');
ptag.className = 'ptag';
ptag.innerHTML = '<span id="ptT">等</span><div class="pb"><i id="ptB"></i></div>';
tags.appendChild(ptag);
function updateTags(): void {
  const lead = guests[0];
  const show = phase === 'work' && !!lead && flags.arrived && !flags.left;
  ptag.style.display = show ? 'flex' : 'none';
  if (!show || !lead) return;
  const p = toUi(lead.pos.x, 2.6, lead.pos.z);
  ptag.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px) translate(-50%, -100%)`;
  const f = clamp(patLeft / flags.patMax, 0, 1);
  $('ptT').textContent = flags.comp ? `免单 ${Math.ceil(patLeft)}s` : `等 ${Math.ceil(patLeft)}s`;
  const b = $('ptB');
  b.style.width = `${f * 100}%`;
  b.style.background = f > 0.5 ? 'var(--green-2)' : f > 0.25 ? 'var(--amber)' : 'var(--coral)';
}

let emoteT = 0;
function workTick(dt: number): void {
  const tdt = dt * FAST;
  elapsed += tdt;
  if (flags.left) {
    extra -= tdt;
    if (extra <= 0) openCourt();
  } else if (!flags.arrived) {
    timeLeft -= tdt;
    if (timeLeft <= 7 && !flags.spawned) {
      flags.spawned = true;
      spawnGuests(false);
      daleSay('客人来了！', null);
      fx.emote(dale.headTop, 'excl', 1.2);
    }
    if (timeLeft <= 0) {
      flags.arrived = true;
      timeLeft = 0;
      banner('客人到了！', 1100);
      SFX.coin();
      if (guests[0]) fx.emote(guests[0].headTop, 'note', 1.4);
    }
  } else {
    waited += tdt;
    patLeft -= tdt;
    emoteT -= dt;
    const f = patLeft / flags.patMax;
    if (emoteT <= 0 && guests[0]) {
      emoteT = 2.2;
      const icon: IconName = f > 0.66 ? 'note' : f > 0.33 ? 'sweat' : 'anger';
      for (const g of guests) fx.emote(g.headTop, icon, 1.6);
      if (f < 0.5) guests[0].gesture(f < 0.25 ? 'argue' : 'point', sched.now, 1.2);
    }
    if (f < 0.33 && every('hurry', 3000) && guests[0]) {
      fx.say(guests[0].headTop, ['快点！', '还要多久？', '我们订的是现在！'][Math.floor(fxRand() * 3)], 1.8);
      buzz(10);
      SFX.buzz();
    }
    if (patLeft <= 0) {
      if (flags.comp) {
        flags.comp = false;
        flags.left = true;
        extra = 10;
        const p = guests[0];
        if (p) {
          const q = toUi(p.pos.x, 2, p.pos.z);
          floatText(fxl, q.x, q.y, '他们还是走了', { kind: 'bad' });
        }
        guestsLeave();
        SFX.bad();
      } else showChoice();
    }
  }
  if (phase === 'work') updateGust(dt);
  model.dry(dt);
  if (every('meters', 220)) updateMeters();
}

function followDirector(dt: number): void {
  if (phase !== 'work' || !stroke || tool === 'net') return;
  const back = tool === 'paint' ? 0.7 : 0.85;
  const tx = tv.x - tv.dx * back;
  const tz = tv.z - tv.dz * back;
  const d = Math.hypot(tx - director.pos.x, tz - director.pos.z);
  director.clearMoves();
  if (d > 0.03) director.go(tx, tz, Math.max(2.5, d * 13), { face: Math.atan2(tv.dx, tv.dz) });
  if (d > 2.5 && every('dash', 200)) parts.speed(director.pos.x, 0.9, director.pos.z, Math.atan2(tv.dx, tv.dz));
  void dt;
}

let last = performance.now();
function tick(t: number): void {
  const dt = Math.min(0.05, (t - last) / 1000);
  last = t;
  world.camera.update(dt, null);
  const pr = world.view.proj;
  setPeopleView(pr.ang, pr.k, pr.spriteScale);
  // 第一场的入场快进（等人走到站位的那几秒不让人干等）
  const ff = phase === 'match' && run && !run.ready ? 2.5 : 1;
  sched.advance(dt * ff);
  ost.t = sched.now;
  if (phase === 'work') workTick(dt);
  if (phase === 'match' || phase === 'result') matchTick(dt);
  followDirector(dt);
  for (const p of [...pw.people]) p.update(dt * ff, sched.now);
  for (const w of model.weeds) if (w.shake > 0) w.shake -= dt;
  nv.wob = Math.max(0, nv.wob - dt * 1.2);
  if (tumble) {
    tumble.update(dt, sched.now, 1, 0);
    tumbleT -= dt;
    if (tumbleT <= 0) {
      tumble.g.removeFromParent();
      tumble = null;
    }
  }
  toolNode.position.set(tv.x, 0, tv.z);
  retNode.position.set(rt.x, 0, rt.z);
  fx.update(sched.now);
  parts.update(dt);
  sky.update(dt, sched.now, 0, windLevel);
  setInfo();
  drawGauge();
  updateTags();
  world.render(dt, sched.now);
  requestAnimationFrame(tick);
}

/* ---------------- 按钮 ---------------- */
$('open').addEventListener('click', () => {
  if (phase === 'work') openCourt();
});
$('open').addEventListener('pointerdown', () => buzz(8));
$('mute').addEventListener('click', () => {
  setMuted(!isMuted());
  $('muteI').textContent = isMuted() ? '×' : '♪';
  $('mute').classList.toggle('off', isMuted());
});
$('help').addEventListener('click', () => {
  $('helpov').hidden = false;
});
$('helpov').addEventListener('click', () => {
  $('helpov').hidden = true;
});
$('helpX').addEventListener('click', () => {
  $('helpov').hidden = true;
});
addEventListener('resize', () => {
  if (phase !== 'end') frameCourt(true);
});

/* ---------------- 测试钩子（截图脚本用） ---------------- */
declare global {
  interface Window {
    __demo: unknown;
  }
}
window.__demo = {
  phase: () => phase,
  measure: () => model.measure(),
  cheat: (q = 1) => {
    model.cheat(q, rnd);
    nv.up = model.net.hung;
    nv.t = model.net.t;
  },
  open: () => openCourt(),
  tool: (id: Tool) => selectTool(id),
  /** 屏幕上（CSS，相对画布）场地局部点的位置 */
  screen: (u: number, v: number) => {
    const p = world.camera.project(model.F.ox + u, 0, model.F.oz + v);
    const r = canvasRect();
    return { x: p.x + r.left, y: p.y + r.top };
  },
  results: () => results.map((r) => ({ q: r.m.Q, fee: r.fee, stars: r.stars, note: r.note, left: r.left })),
  stats: () => world.view.stats,
  gust: () => gustNow,
};

setupCourtPreview();
requestAnimationFrame(tick);

/** 开始画面：先摆好第一块场（荒着），镜头对着它 */
function setupCourtPreview(): void {
  model = new CourtModel(cfg, mulberry32(SEED));
  ov.set(cfg.facility, cfg.ruinState);
  ov.flush?.();
  paintCourtBase(world, model);
  hideSiteNet(world, model);
  hideFrontFence(world, model);
  buildTools();
  frameCourt(true);
  overlay = createOverlay(model, ost);
  netNode = createNet(model, nv);
  world.scene.add(overlay, netNode);
  daylight.update(cfg.minute, 0);
  showTitle();
}

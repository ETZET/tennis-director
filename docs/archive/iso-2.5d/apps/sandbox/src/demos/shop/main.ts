import '../kit/kit.css';
import './shop.css';
import { type IconName, Person, type PersonOptions } from '@td/iso';
import { clamp, mulberry32 } from '@td/shared';
import { buzz, flash, floatText, pop, SFX, setMuted, sfx, shake } from '../kit/juice';
import { artCanvas, BUSTS, bustArt, GOOD_ART, iconCanvas, WX_ART } from './art';
import {
  type CustType,
  DAY_SEC,
  DAYHINT,
  DAYNAME,
  DAYS,
  type Day,
  type DayKind,
  DOOR_IN,
  DOOR_OUT,
  GOODS,
  type GoodId,
  HUB,
  ICE_AT,
  LINES,
  ORDER,
  PRO,
  SLOTS,
  START_CASH,
  TYPE_ORDER,
  TYPES,
  VISIT_AT,
} from './data';
import { createShopScene } from './scene';

/**
 * 01 球具店（第二轮）：Palm Oasis 会所里的球具店，用游戏的 @td/iso 像素引擎画。
 * 从底部托盘把货拖上货架（吸附高亮、落下弹跳），点场景里的价签在拇指区改价（−/+ 按住连发、横向拖条），
 * 客人（真 Person 精灵）走到货架前看价，头顶冒像素表情。每天中午一件事（大巴、热浪、校队、散场）。
 * 数值逻辑直接写在这里（不走 sim）；演出里的随机只决定画面。
 */

/* ================= 参数 ================= */
const Q = new URLSearchParams(location.search);
const FAST = Math.max(1, Number(Q.get('fast')) || 1);
let SEED = Number(Q.get('seed')) || Date.now() % 1e9;
let rnd = mulberry32(SEED);
const pick = <T>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)] as T;
const fmt = (p: number) => `$${Math.round(p * 10) % 10 ? p.toFixed(1) : Math.round(p)}`;
const bell = (h: number, c: number, w: number) => Math.exp(-(((h - c) / w) ** 2));
const $ = <E extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as E;
const vrand = Math.random; // 只给画面用

/* ================= 状态 ================= */
interface Slot {
  goods: GoodId[];
  qty: number;
  price: number;
  lim: number;
  limFake: boolean;
  warned: boolean;
}
interface Cust {
  p: Person;
  type: CustType;
  plan: number[];
  buys: number;
  angry: number;
  at: number;
  gone: boolean;
  sawFake: boolean;
  visitor?: boolean;
}
interface DayStats {
  rev: number;
  spend: number;
  sold: number;
  rage: number;
  gouge: number;
  lim: number;
  trust0: number;
  cash0: number;
  evDone: boolean;
  evOn: boolean;
  gougeMode: boolean;
  ice: boolean;
  worst: { r: number; g: GoodId; p: number; bundle: boolean } | null;
  pmDone: boolean;
  hotBan: boolean;
  busQ: number;
  busAcc: number;
  saleUntil: number;
  crowdBoost: number;
}
type Phase = 'start' | 'prep' | 'open' | 'modal' | 'end';
interface State {
  phase: Phase;
  day: number;
  min: number;
  cash: number;
  trust: number;
  slots: (Slot | null)[];
  supply: Record<GoodId, number>;
  days: Day[];
  speed: number;
  spawnAcc: number;
  sel: number;
  lastHour: number;
  closing: boolean;
  closeT: number;
  limCd: number;
  tot: {
    rev: number;
    spend: number;
    sold: number;
    rage: number;
    gouge: number;
    papers: number;
    bigSales: number;
    fakes: number;
    happy: number;
  };
  ds: DayStats;
}
let S: State;
const zeroSupply = (): Record<GoodId, number> => Object.fromEntries(ORDER.map((g) => [g, 0])) as Record<GoodId, number>;

function genDays(): Day[] {
  const rest: DayKind[] = ['heat', 'wind', 'match'];
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [rest[i], rest[j]] = [rest[j] as DayKind, rest[i] as DayKind];
  }
  return (['sunny', ...rest] as DayKind[]).map((t) => {
    const d: Day = {
      t,
      hotBase: 0.2,
      hotAmp: 0.35,
      wind: new Array(12).fill(false),
      match: false,
      am: zeroSupply(),
      pm: zeroSupply(),
    };
    if (t === 'heat') {
      d.hotBase = 0.35;
      d.hotAmp = 0.72;
    }
    if (t === 'wind') {
      d.hotBase = 0.25;
      d.hotAmp = 0.2;
      for (let k = 0; k < 2; k++) {
        const s = Math.floor(rnd() * 9);
        const l = 2 + Math.floor(rnd() * 3);
        for (let h = s; h < Math.min(12, s + l); h++) d.wind[h] = true;
      }
    }
    if (t === 'match') {
      d.match = true;
      d.hotAmp = rnd() < 0.5 ? 0.62 : 0.3;
      d.hotBase = 0.3;
    }
    const base: Record<GoodId, number> = { water: 3, balls: 3, energy: 2, sunscreen: 2, hat: 2, grip: 2, racket: 1 };
    if (t === 'heat') base.water = 2;
    if (t === 'match') {
      base.balls = 4;
      base.racket = 2;
    }
    if (t === 'wind') base.balls = 4;
    for (const g of ORDER) {
      let n = base[g];
      if (g !== 'racket') n = Math.max(1, n + Math.floor(rnd() * 3) - 1);
      d.am[g] = Math.ceil(n * 0.6);
      d.pm[g] = n - d.am[g];
    }
    return d;
  });
}
function newDS(): DayStats {
  return {
    rev: 0,
    spend: 0,
    sold: 0,
    rage: 0,
    gouge: 0,
    lim: 0,
    trust0: 60,
    cash0: START_CASH,
    evDone: false,
    evOn: false,
    gougeMode: false,
    ice: false,
    worst: null,
    pmDone: false,
    hotBan: false,
    busQ: 0,
    busAcc: 0,
    saleUntil: -1,
    crowdBoost: 1,
  };
}
function newGame(): void {
  rnd = mulberry32(SEED);
  S = {
    phase: 'start',
    day: 0,
    min: 0,
    cash: START_CASH,
    trust: 60,
    slots: SLOTS.map(() => null),
    supply: zeroSupply(),
    days: genDays(),
    speed: 1,
    spawnAcc: 0,
    sel: -1,
    lastHour: -1,
    closing: false,
    closeT: 0,
    limCd: 0,
    tot: { rev: 0, spend: 0, sold: 0, rage: 0, gouge: 0, papers: 0, bigSales: 0, fakes: 0, happy: 0 },
    ds: newDS(),
  };
}
newGame();

interface Cond {
  hot: number;
  wind: boolean;
  crowd: number;
  temp: number;
}
function cond(): Cond {
  if (S.phase === 'start') return { hot: 0.3, wind: false, crowd: 0, temp: 30 };
  const d = S.days[S.day] as Day;
  const h = 8 + S.min / 60;
  const hi = clamp(Math.floor(S.min / 60), 0, 11);
  const hot = clamp(d.hotBase + d.hotAmp * bell(h, 14, 3), 0, 1.1);
  const crowd = d.match ? Math.max(bell(h, 11.5, 1.1), bell(h, 17, 1.1)) : 0;
  return { hot, wind: d.wind[hi] as boolean, crowd, temp: Math.round(24 + hot * 20) };
}
function gmod(g: GoodId, cd: Cond): number {
  switch (g) {
    case 'water':
      return 1 + 2.2 * cd.hot;
    case 'sunscreen':
      return (1 + 1.6 * cd.hot) * (cd.wind ? 0.7 : 1);
    case 'hat':
      return (1 + 1.2 * cd.hot) * (cd.wind ? 0.25 : 1);
    case 'energy':
      return 1 + 0.4 * cd.hot + 0.9 * cd.crowd;
    case 'balls':
      return 1 + 0.9 * cd.crowd;
    case 'grip':
      return 1 + 0.6 * cd.crowd;
    case 'racket':
      return 1 + cd.crowd;
  }
}
function tolFor(type: CustType, g: GoodId, cd: Cond): number {
  const T = TYPES[type];
  let t = type === 'fan' && PRO.has(g) ? (T.tolPro ?? T.tol) : T.tol;
  if (g === 'water') t *= 1 + 2.3 * Math.max(0, cd.hot - 0.3);
  if (g === 'sunscreen') t *= 1 + 0.3 * cd.hot;
  return t;
}
const slotFair = (s: Slot) => s.goods.reduce((a, g) => a + GOODS[g].fair, 0);
const slotCost = (s: Slot) => s.goods.reduce((a, g) => a + GOODS[g].cost, 0);
const stepFor = (p: number) => (p < 10 ? 0.5 : p < 50 ? 1 : 5);
const saleOn = () => S.ds.saleUntil > S.min;
const effPrice = (s: Slot) => (saleOn() ? Math.round(s.price * 0.8 * 10) / 10 : s.price);
const isDrinks = (gs: readonly GoodId[]) => gs.every((g) => GOODS[g].drink);
type Band = 'cheap' | 'norm' | 'dear' | 'gouge';
const bandOf = (r: number): Band => (r <= 0.85 ? 'cheap' : r <= 1.3 ? 'norm' : r <= 2 ? 'dear' : 'gouge');
const BAND_NAME: Record<Band, string> = { cheap: '划算', norm: '正常', dear: '偏贵', gouge: '宰人' };

/** 某类客人在这格面对这个价的反应强度：x = 价/市价 ÷ 忍耐 */
function reactX(type: CustType, i: number, s: Slot, cd: Cond): number {
  const ratio = effPrice(s) / slotFair(s);
  let tol = s.goods.reduce((a, g) => a + tolFor(type, g, cd), 0) / s.goods.length;
  if (s.goods.length > 1) tol *= type === 'mom' || type === 'tourist' ? 1.15 : 0.88;
  tol *= 0.95 + S.trust / 1000;
  if (s.lim > 0 && type !== 'fan') tol *= 1.3;
  tol *= 1 + 0.15 * cd.crowd;
  if (SLOTS[i]?.cooler && isDrinks(s.goods)) tol *= 1 + 0.25 * cd.hot;
  return ratio / tol;
}
const faceOf = (x: number): IconName =>
  x <= 0.7 ? 'heart' : x <= 1 ? 'money' : x <= 1.3 ? 'ques' : x <= 1.7 ? 'anger' : 'fire';
const VERDICT: Partial<Record<IconName, [string, string]>> = {
  heart: ['抢着买', 'var(--money)'],
  money: ['会买', 'var(--money)'],
  ques: ['犹豫', 'var(--amber)'],
  anger: ['嫌贵', 'var(--coral)'],
  fire: ['骂人', 'var(--coral)'],
};
let hinted = false;

/* ================= 画面 ================= */
const stage = $('stage');
const phoneEl = $('phone');
const ui = $('ui');
const SC = createShopScene(stage, mulberry32(SEED ^ 0x5a5a));
const { people, fx, director } = SC;

/* ================= DOM ================= */
ui.innerHTML = `
<div id="wui"></div>
<div id="heat"></div>
<button class="k-topbtn" id="mute">♪</button>
<button class="k-topbtn" id="help">?</button>
<div id="hud" class="k-panel">
  <span id="cash">$120</span>
  <div id="trustBox"><span class="k-label"><span>口碑</span><span id="trustNum">60</span></span><div id="trustBar"><i></i></div></div>
  <div id="clock"><canvas class="px"></canvas><span id="clockT">08:00</span><small id="clockW">30°</small></div>
</div>
<div id="banner"></div>
<div id="dock">
  <div class="view" id="trayView">
    <div class="dhead"><div id="status"></div><button class="k-btn ghost" id="speedBtn" hidden>×1</button><button class="k-btn go" id="openBtn">开门 ▶</button></div>
    <div id="tray"></div>
  </div>
  <div class="view" id="priceView" hidden>
    <div class="pvh"><span id="pvIcon"></span><div class="nm"><span id="pvName"></span><small id="pvSub"></small></div>
      <button class="k-btn ghost" id="pvPull">撤下</button><button class="k-btn primary" id="pvDone">✓ 好</button></div>
    <div class="pvm"><button class="k-btn big" id="minus">−</button>
      <div class="pvp"><span id="pvPrice">$2</span><span class="row"><span id="pvBand">正常</span><span id="pvProfit">每件 +$1.5</span></span></div>
      <button class="k-btn big" id="plus">+</button></div>
    <div id="pvBar"></div>
    <div id="strip"><div class="ticks"></div><div class="notch"></div><div class="lbl"><span>◀ 便宜</span><span>拖动改价</span><span>贵 ▶</span></div></div>
    <div class="faces" id="faces"></div>
  </div>
</div>
<div id="ghost"><div class="gi"></div><div class="gl"></div></div>
<div id="floats"></div>
<div class="k-modal" id="modal" hidden><div class="k-card" id="card"></div></div>
<div id="paper" hidden></div>`;
const wui = $('wui');
const floats = $('floats');
const fxHost = phoneEl;
artCanvas(WX_ART.sun, 3, document.querySelector('#clock canvas') as HTMLCanvasElement);

/* ---- 横幅 ---- */
let banT = 0;
function banner(txt: string, cls = ''): void {
  const b = $('banner');
  b.textContent = txt;
  b.className = `on ${cls}`;
  clearTimeout(banT);
  banT = window.setTimeout(() => {
    b.className = cls;
  }, 2300);
}
/** 一行原因（拇指区上方的状态行） */
let whyText = '拖货上架，点价签改价';
let whyCls = '';
function why(t: string, cls = ''): void {
  whyText = t;
  whyCls = cls;
  paintStatus();
}

/* ---- 坐标 ---- */
const proj = (x: number, y: number, z: number) => SC.proj(x, y, z);
function headPt(p: Person): { x: number; y: number } {
  return SC.headCss(p);
}
function tagScreen(i: number): { x: number; y: number } {
  return SC.tagCss(i);
}

/* ---- 钱、口碑 ---- */
let cashShown = START_CASH;
function addCash(v: number): void {
  S.cash = Math.round((S.cash + v) * 10) / 10;
}
function addTrust(v: number, at?: { x: number; y: number }): void {
  const old = S.trust;
  S.trust = clamp(S.trust + v, 0, 100);
  if (Math.abs(S.trust - old) < 0.05) return;
  if (at && Math.abs(v) >= 1)
    floatText(floats, at.x, at.y - 18, `${v > 0 ? '+' : ''}${Math.round(v)} 口碑`, { kind: v > 0 ? 'good' : 'bad' });
  if (v <= -1) {
    const tb = $('trustBar');
    tb.classList.remove('hit');
    void tb.offsetWidth;
    tb.classList.add('hit');
  }
  if (v >= 1) pop($('trustNum'));
}
/** 钱从 (x, y) 飞到左上角的现金 */
function flyMoney(txt: string, x: number, y: number, gold = false): void {
  const e = document.createElement('div');
  e.className = `k-float ${gold ? 'gold' : 'good'}`;
  e.textContent = txt;
  floats.appendChild(e);
  const c = $('cash').getBoundingClientRect();
  const ph = phoneEl.getBoundingClientRect();
  const tx = c.left - ph.left + 20;
  const ty = c.top - ph.top + 6;
  const w = e.offsetWidth;
  e.animate(
    [
      { transform: `translate(${x - w / 2}px,${y}px) scale(.6)`, opacity: 0 },
      { transform: `translate(${x - w / 2}px,${y - 22}px) scale(1.25)`, opacity: 1, offset: 0.25 },
      { transform: `translate(${x - w / 2}px,${y - 26}px) scale(1)`, opacity: 1, offset: 0.45 },
      { transform: `translate(${tx - w / 2}px,${ty}px) scale(.7)`, opacity: 0.2 },
    ],
    { duration: 900, easing: 'cubic-bezier(.5,0,.7,1)' },
  ).onfinish = () => {
    e.remove();
    pop($('cash'));
  };
}

/* ---- HUD ---- */
let lastWx = '';
function hud(): void {
  cashShown += (S.cash - cashShown) * 0.25;
  if (Math.abs(S.cash - cashShown) < 0.05) cashShown = S.cash;
  $('cash').textContent = fmt(Math.round(cashShown * 10) / 10);
  const tr = Math.round(S.trust);
  $('trustNum').textContent = String(tr);
  const bar = $('trustBar').firstElementChild as HTMLElement;
  bar.style.width = `${tr}%`;
  bar.style.background = tr < 30 ? 'var(--coral)' : tr < 55 ? 'var(--amber)' : 'var(--money)';
  const m = Math.min(720, S.min);
  const hh = 8 + Math.floor(m / 60);
  const mm = Math.floor((m % 60) / 10) * 10;
  $('clockT').textContent =
    S.phase === 'prep' || S.phase === 'start'
      ? `D${S.day + 1}`
      : `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  const cd = cond();
  $('clockW').textContent = `${cd.temp}°`;
  const wx = cd.wind ? 'wind' : cd.hot > 0.75 ? 'heat' : cd.crowd > 0.35 ? 'ball' : 'sun';
  if (wx !== lastWx) {
    lastWx = wx;
    artCanvas(WX_ART[wx as keyof typeof WX_ART], 3, document.querySelector('#clock canvas') as HTMLCanvasElement);
  }
  $('heat').classList.toggle('on', S.phase !== 'start' && cd.hot > 0.8);
}
function paintStatus(): void {
  const st = $('status');
  if (!S) return;
  const ds = S.ds;
  const empties = S.slots.filter((s) => !s).length;
  const top =
    S.phase === 'prep'
      ? `第 ${S.day + 1} 天备货 · ${DAYNAME[(S.days[S.day] as Day).t]}${empties ? ` · ${empties} 格空` : ''}`
      : `今日 <b>${fmt(ds.rev)}</b> · 卖 ${ds.sold} · 被骂 ${ds.rage}${saleOn() ? ' · 八折中' : ''}`;
  st.innerHTML = `${top}<span class="why ${whyCls}">${whyText}</span>`;
}

/* ================= 价签 ================= */
const TAGS: HTMLElement[] = [];
function buildTags(): void {
  wui.innerHTML = '';
  TAGS.length = 0;
  SLOTS.forEach((d, i) => {
    const e = document.createElement('div');
    e.className = `tag${d.gold ? ' gold' : ''}`;
    e.innerHTML = '<i></i><b></b><small></small>';
    wui.appendChild(e);
    TAGS.push(e);
    tagInput(e, i);
  });
}
function refreshTag(i: number): void {
  const e = TAGS[i] as HTMLElement;
  const s = S.slots[i];
  const d = SLOTS[i]!;
  e.classList.toggle('sel', i === S.sel);
  for (const k of ['cheap', 'norm', 'dear', 'gouge', 'empty']) e.classList.remove(k);
  e.querySelector('.lim')?.remove();
  e.querySelector('.sale')?.remove();
  const b = e.querySelector('b') as HTMLElement;
  const sm = e.querySelector('small') as HTMLElement;
  if (!s) {
    e.classList.add('empty');
    b.textContent = d.cooler ? '冰柜' : '空';
    sm.innerHTML = d.gold ? '<span class="st">★</span>' : '+';
    return;
  }
  e.classList.add(bandOf(effPrice(s) / slotFair(s)));
  b.textContent = fmt(s.price);
  sm.textContent = `×${s.qty}`;
  if (s.lim > 0) e.insertAdjacentHTML('beforeend', '<span class="lim">限量</span>');
  if (saleOn()) e.insertAdjacentHTML('beforeend', '<span class="sale">−20%</span>');
}
function refreshTags(): void {
  for (let i = 0; i < SLOTS.length; i++) refreshTag(i);
}
function tagFx(i: number, cls: 'joy' | 'rage'): void {
  const e = TAGS[i] as HTMLElement;
  e.classList.remove('joy', 'rage');
  void e.offsetWidth;
  e.classList.add(cls);
}
const tagPos: string[] = [];
/** 价签跟着货架（镜头固定，所以只在位置或宽度变了才写样式；先读完再写，不来回排版） */
function placeTags(): void {
  const pw = phoneEl.clientWidth;
  const ws = TAGS.map((e) => e.offsetWidth);
  SLOTS.forEach((_, i) => {
    const e = TAGS[i] as HTMLElement;
    const p = tagScreen(i);
    const w = ws[i] as number;
    const x = Math.round(clamp(p.x - w / 2, 4, pw - w - 4));
    const key = `translate(${x}px,${Math.round(p.y - 17)}px)`;
    if (tagPos[i] === key) return;
    tagPos[i] = key;
    e.style.left = `${x}px`;
    e.style.top = `${Math.round(p.y - 17)}px`;
  });
}

/* ---- 选中、改价 ---- */
function select(i: number): void {
  S.sel = i;
  SC.hl.fill('');
  if (i >= 0) SC.hl[i] = 'sel';
  refreshTags();
  showPrice(i >= 0 && !!S.slots[i]);
}
function showPrice(on: boolean): void {
  $('priceView').hidden = !on;
  $('trayView').hidden = on;
  if (on) paintPrice();
}
const FACE_EL: { type: CustType; cv: HTMLCanvasElement; el: HTMLElement; vb: HTMLElement }[] = [];
function buildFaces(): void {
  const box = $('faces');
  box.innerHTML = '';
  FACE_EL.length = 0;
  for (const t of TYPE_ORDER) {
    const el = document.createElement('div');
    el.className = 'face';
    const cv = document.createElement('canvas');
    cv.className = 'px';
    const vb = document.createElement('b');
    el.append(TYPES[t].n, cv, vb);
    box.appendChild(el);
    FACE_EL.push({ type: t, cv, el, vb });
  }
}
let lastBand: Band | '' = '';
function paintPrice(): void {
  const i = S.sel;
  const s = i >= 0 ? S.slots[i] : null;
  if (!s) return;
  const d = SLOTS[i]!;
  const fair = slotFair(s);
  const r = effPrice(s) / fair;
  const band = bandOf(r);
  const icon = $('pvIcon');
  icon.innerHTML = '';
  for (const g of s.goods) icon.appendChild(artCanvas(GOOD_ART[g], 3));
  $('pvName').textContent = s.goods.map((g) => GOODS[g].n).join('+') + (s.goods.length > 1 ? ' 套装' : '');
  $('pvSub').textContent =
    `${d.n}${d.gold ? ' ★ 客流×1.7' : d.vis < 1 ? ' 客流×0.5' : ''}${d.cooler ? ' 冰镇' : ''} · 市价 ${fmt(fair)} · 剩 ${s.qty}`;
  $('pvPrice').textContent = saleOn() ? `${fmt(effPrice(s))}` : fmt(s.price);
  const bandEl = $('pvBand');
  bandEl.textContent = BAND_NAME[band];
  bandEl.className = band;
  if (lastBand && band !== lastBand) {
    bandEl.classList.add('flash');
    buzz(10);
  }
  lastBand = band;
  const pf = effPrice(s) - slotCost(s);
  const pr = $('pvProfit');
  pr.textContent = `每件 ${pf >= 0 ? '+' : '−'}${fmt(Math.abs(pf))}`;
  pr.className = pf < 0 ? 'neg' : '';
  // 刻度条：0–3 倍市价
  const bar = $('pvBar');
  if (!bar.childElementCount)
    bar.innerHTML =
      '<span style="width:28.3%;background:var(--money)"></span><span style="width:15%;background:var(--paper)"></span><span style="width:23.4%;background:var(--amber)"></span><span style="width:33.3%;background:var(--coral)"></span><em></em>';
  (bar.querySelector('em') as HTMLElement).style.left = `${clamp(r / 3, 0, 1) * 100}%`;
  const cd = cond();
  for (const f of FACE_EL) {
    const x = reactX(f.type, i, s, cd);
    iconCanvas(faceOf(x), 2, f.cv);
    f.el.classList.toggle('no', x > 1.3);
    const v = VERDICT[faceOf(x)] as [string, string];
    f.vb.textContent = v[0];
    f.vb.style.color = v[1];
  }
}
function changePrice(dir: number): void {
  const i = S.sel;
  const s = i >= 0 ? S.slots[i] : null;
  if (!s) return;
  const fair = slotFair(s);
  const st = stepFor(dir > 0 ? s.price : s.price - 0.01);
  const np = clamp(Math.round((s.price + dir * st) * 10) / 10, 0.5, fair * 6);
  if (np === s.price) {
    SFX.buzz();
    return;
  }
  s.price = np;
  const r = s.price / fair;
  sfx({ f: 420 + 260 * clamp(r, 0, 3), dur: 0.03, vol: 0.06 });
  if (r > 2 && dir > 0 && !s.warned) {
    s.warned = true;
    const t = tagScreen(i);
    floatText(floats, t.x, t.y - 40, '宰!', { kind: 'bad' });
    buzz(20);
  }
  if (r <= 2) s.warned = false;
  refreshTag(i);
  paintPrice();
  if (S.phase === 'prep') paintStatus();
}
function holdBtn(el: HTMLElement, fn: () => void): void {
  let to = 0;
  let n = 0;
  const stop = () => {
    clearTimeout(to);
    to = 0;
    el.classList.remove('press');
  };
  const rep = () => {
    fn();
    n++;
    to = window.setTimeout(rep, n < 6 ? 120 : n < 14 ? 70 : 40);
  };
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    buzz(6);
    fn();
    n = 0;
    stop();
    to = window.setTimeout(rep, 340);
  });
  for (const t of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) el.addEventListener(t, stop);
}
holdBtn($('plus'), () => changePrice(1));
holdBtn($('minus'), () => changePrice(-1));
{
  const strip = $('strip');
  const ticks = strip.querySelector('.ticks') as HTMLElement;
  let id = -1;
  let last = 0;
  let acc = 0;
  let off = 0;
  strip.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    id = e.pointerId;
    strip.setPointerCapture(id);
    last = e.clientX;
    acc = 0;
    strip.classList.add('on');
    buzz(6);
    SFX.tap();
  });
  strip.addEventListener('pointermove', (e) => {
    if (e.pointerId !== id) return;
    const dx = e.clientX - last;
    last = e.clientX;
    acc += dx;
    off += dx;
    ticks.style.transform = `translateX(${((off % 18) + 18) % 18}px)`;
    while (acc >= 18) {
      changePrice(1);
      acc -= 18;
    }
    while (acc <= -18) {
      changePrice(-1);
      acc += 18;
    }
  });
  const up = (e: PointerEvent) => {
    if (e.pointerId !== id) return;
    id = -1;
    strip.classList.remove('on');
  };
  strip.addEventListener('pointerup', up);
  strip.addEventListener('pointercancel', up);
}
$('pvDone').addEventListener('click', () => {
  SFX.tap();
  select(-1);
});
$('pvPull').addEventListener('click', () => {
  const i = S.sel;
  const s = S.slots[i];
  if (!s) return;
  const back = Math.round(s.qty * slotCost(s) * 0.5 * 10) / 10;
  addCash(back);
  S.ds.spend -= back;
  const t = tagScreen(i);
  floatText(floats, t.x, t.y - 30, `退货 +${fmt(back)}`, { kind: 'good' });
  S.slots[i] = null;
  SC.setGoods(i, null, 0, false);
  fx.dust(SLOTS[i]!.x, 0.5, SLOTS[i]!.z, 8);
  SFX.drop();
  why(`撤下退一半：+${fmt(back)}`);
  select(-1);
});

/* ================= 托盘和拖动 ================= */
type DragInfo = { kind: 'good'; g: GoodId } | { kind: 'lim' } | { kind: 'move'; from: number };
const CARDS: Partial<Record<GoodId, HTMLElement>> = {};
let limCard: HTMLElement;
function buildTray(): void {
  const t = $('tray');
  t.innerHTML = '';
  for (const g of ORDER) {
    const G = GOODS[g];
    const e = document.createElement('div');
    e.className = 'card';
    e.appendChild(artCanvas(GOOD_ART[g], 3));
    e.insertAdjacentHTML(
      'beforeend',
      `<span class="nm">${G.n}</span><span class="pk">${fmt(G.cost * G.cs)}/${G.cs}${G.u}</span><span class="left"></span>`,
    );
    t.appendChild(e);
    CARDS[g] = e;
    dragSrc(e, () => ({ kind: 'good', g }));
  }
  limCard = document.createElement('div');
  limCard.className = 'card lim';
  limCard.innerHTML =
    '<span class="nm" style="font-size:16px">限量!</span><span class="pk" style="color:var(--paper)">拖到货架</span>';
  t.appendChild(limCard);
  dragSrc(limCard, () => ({ kind: 'lim' }));
}
function refreshTray(): void {
  for (const g of ORDER) {
    const n = S.supply[g] || 0;
    const e = CARDS[g] as HTMLElement;
    (e.querySelector('.left') as HTMLElement).textContent = n ? `×${n}` : '没了';
    e.classList.toggle('out', !n);
  }
  limCard.classList.toggle('cd', S.limCd > 0);
}

/** 能不能放：返回 ok 和一句原因 */
function canDrop(info: DragInfo, i: number): { ok: boolean; why: string } {
  const s = S.slots[i];
  const d = SLOTS[i]!;
  if (info.kind === 'lim') {
    if (S.limCd > 0) return { ok: false, why: '限量刚用过' };
    if (!s) return { ok: false, why: '空架贴不了' };
    if (s.lim > 0) return { ok: false, why: '已经贴了' };
    return { ok: true, why: s.qty > 6 ? '限量!（货多会穿帮）' : '限量!' };
  }
  if (info.kind === 'move') {
    if (i === info.from) return { ok: false, why: '原位' };
    const src = S.slots[info.from];
    if (!src) return { ok: false, why: '' };
    if (d.cooler && !isDrinks(src.goods)) return { ok: false, why: '冰柜只放饮料' };
    if (s && SLOTS[info.from]?.cooler && !isDrinks(s.goods)) return { ok: false, why: '换过去进不了冰柜' };
    if (!s) return { ok: true, why: `挪到${d.n}` };
    if (s.goods.join() === src.goods.join())
      return s.qty + src.qty > 24 ? { ok: false, why: '堆不下' } : { ok: true, why: '合并' };
    return { ok: true, why: '两格对调' };
  }
  const g = info.g;
  const G = GOODS[g];
  if (!(S.supply[g] > 0)) return { ok: false, why: '这货今天没了' };
  if (d.cooler && !G.drink) return { ok: false, why: '冰柜只放饮料' };
  if (s && s.goods.length > 1) return { ok: false, why: '已经是套装' };
  if (s && s.goods[0] !== g) {
    if (d.cooler && !isDrinks([...s.goods, g])) return { ok: false, why: '冰柜只放饮料' };
    const pairs = Math.min(s.qty, G.cs);
    const cost = Math.round(G.cost * pairs * 10) / 10;
    if (S.cash < cost) return { ok: false, why: '钱不够' };
    return { ok: true, why: `捆绑 ${GOODS[s.goods[0] as GoodId].n.slice(0, 2)}+${G.n.slice(0, 2)} −${fmt(cost)}` };
  }
  if (s && s.qty + G.cs > 24) return { ok: false, why: '堆不下了' };
  const cost = G.cost * G.cs;
  if (S.cash < cost) return { ok: false, why: '钱不够' };
  return { ok: true, why: `${s ? '补货' : '上架'} −${fmt(cost)}` };
}

let drag: {
  info: DragInfo;
  el: HTMLElement;
  id: number;
  x0: number;
  y0: number;
  moved: boolean;
  hover: number;
  ok: boolean;
} | null = null;
const ghost = $('ghost');
function phonePt(e: PointerEvent): { x: number; y: number } {
  const r = phoneEl.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}
const GHOST_UP = 64;
function ghostAt(x: number, y: number): void {
  ghost.style.transform = `translate3d(${x - 24}px,${y - GHOST_UP - 24}px,0)`;
}
function ghostArt(info: DragInfo): void {
  const gi = ghost.querySelector('.gi') as HTMLElement;
  gi.innerHTML = '';
  if (info.kind === 'good') gi.appendChild(artCanvas(GOOD_ART[info.g], 3));
  else if (info.kind === 'move') {
    const s = S.slots[info.from];
    if (s) for (const g of s.goods) gi.appendChild(artCanvas(GOOD_ART[g], s.goods.length > 1 ? 2 : 3));
  } else gi.innerHTML = '<b style="color:#d94a3a;font:800 16px/1 var(--f-cond)">限量!</b>';
}
/** 吸附：离货架的投影点最近、70 px 以内 */
function hoverAt(x: number, y: number): number {
  let best = -1;
  let bd = 72;
  SLOTS.forEach((_s, i) => {
    const q = SC.slotCss(i);
    const dd = Math.hypot(q.x - x, q.y - y);
    if (dd < bd) {
      bd = dd;
      best = i;
    }
  });
  return best;
}
function markCands(info: DragInfo | null): void {
  SLOTS.forEach((_, i) => {
    SC.hl[i] = info && canDrop(info, i).ok ? 'cand' : '';
    TAGS[i]?.classList.remove('drop-ok', 'drop-bad');
  });
}
function beginDrag(info: DragInfo, el: HTMLElement, e: PointerEvent): void {
  const p = phonePt(e);
  drag = { info, el, id: e.pointerId, x0: p.x, y0: p.y, moved: info.kind === 'move', hover: -1, ok: false };
  ghostArt(info);
  ghost.className = '';
  (ghost.querySelector('.gl') as HTMLElement).textContent =
    info.kind === 'good'
      ? `${GOODS[info.g].n} ${fmt(GOODS[info.g].cost * GOODS[info.g].cs)}`
      : info.kind === 'lim'
        ? '拖到货架'
        : '挪货';
  ghost.style.display = 'flex';
  for (const a of ghost.getAnimations()) a.cancel();
  ghostAt(p.x, p.y);
  el.classList.add('lift');
  SFX.pick();
  buzz(8);
  markCands(info);
}
function moveDrag(e: PointerEvent): void {
  if (!drag || drag.id !== e.pointerId) return;
  const p = phonePt(e);
  if (!drag.moved && Math.hypot(p.x - drag.x0, p.y - drag.y0) > 8) drag.moved = true;
  ghostAt(p.x, p.y);
  const h = drag.moved ? hoverAt(p.x, p.y - GHOST_UP) : -1;
  if (h !== drag.hover) {
    if (drag.hover >= 0) {
      SC.hl[drag.hover] = canDrop(drag.info, drag.hover).ok ? 'cand' : '';
      TAGS[drag.hover]?.classList.remove('drop-ok', 'drop-bad');
    }
    drag.hover = h;
    const gl = ghost.querySelector('.gl') as HTMLElement;
    if (h >= 0) {
      const c = canDrop(drag.info, h);
      drag.ok = c.ok;
      SC.hl[h] = c.ok ? 'ok' : 'bad';
      TAGS[h]?.classList.add(c.ok ? 'drop-ok' : 'drop-bad');
      ghost.className = c.ok ? 'ok' : 'bad';
      gl.textContent = c.why || '不行';
      sfx({ f: c.ok ? 880 : 260, dur: 0.03, vol: 0.07 });
      buzz(c.ok ? 6 : [4, 30, 4]);
    } else {
      drag.ok = false;
      ghost.className = '';
      gl.textContent =
        drag.info.kind === 'good'
          ? `${GOODS[drag.info.g].n} ${fmt(GOODS[drag.info.g].cost * GOODS[drag.info.g].cs)}`
          : drag.info.kind === 'lim'
            ? '拖到货架'
            : '挪货';
    }
  }
}
function endDrag(e: PointerEvent): void {
  if (!drag || drag.id !== e.pointerId) return;
  const d = drag;
  drag = null;
  d.el.classList.remove('lift');
  markCands(null);
  const p = phonePt(e);
  const back = (msg: string) => {
    // 弹回原处
    const r = d.el.getBoundingClientRect();
    const ph = phoneEl.getBoundingClientRect();
    const bx = r.left - ph.left + r.width / 2;
    const by = r.top - ph.top + r.height / 2 + GHOST_UP;
    ghost
      .animate(
        [
          { transform: `translate3d(${p.x - 24}px,${p.y - GHOST_UP - 24}px,0)` },
          { transform: `translate3d(${bx - 24}px,${by - GHOST_UP - 24}px,0) scale(.6)`, opacity: 0.4 },
        ],
        { duration: 200, easing: 'cubic-bezier(.3,0,.6,1)' },
      )
      .finished.then(() => {
        ghost.style.display = 'none';
      });
    if (msg) {
      SFX.buzz();
      buzz([10, 40, 10]);
      d.el.classList.remove('shake');
      void d.el.offsetWidth;
      d.el.classList.add('shake');
      why(msg, 'bad');
    }
  };
  if (!d.moved) {
    // 点了一下：选中货架时直接补到那一格
    ghost.style.display = 'none';
    if (d.info.kind === 'good' && S.sel >= 0) {
      const c = canDrop(d.info, S.sel);
      if (c.ok) drop(d.info, S.sel);
      else back(c.why);
    } else if (d.info.kind === 'move') select(d.info.from);
    else why(d.info.kind === 'lim' ? '把「限量!」拖到货架上' : '按住拖到货架上');
    return;
  }
  if (d.hover < 0) {
    back('');
    return;
  }
  const c = canDrop(d.info, d.hover);
  if (!c.ok) {
    back(c.why);
    return;
  }
  // 落下：幽灵飞进货架
  const t = tagScreen(d.hover);
  const tgt = d.hover;
  ghost
    .animate(
      [
        { transform: `translate3d(${p.x - 24}px,${p.y - GHOST_UP - 24}px,0)` },
        { transform: `translate3d(${t.x - 24}px,${t.y + 10}px,0) scale(.45)`, opacity: 0.6 },
      ],
      { duration: 130, easing: 'cubic-bezier(.5,0,.9,.6)' },
    )
    .finished.then(() => {
      ghost.style.display = 'none';
    });
  window.setTimeout(() => drop(d.info, tgt), 110);
}
function dragSrc(el: HTMLElement, info: () => DragInfo): void {
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (S.phase !== 'open' && S.phase !== 'prep') return;
    const inf = info();
    if (inf.kind === 'lim' && S.limCd > 0) {
      SFX.buzz();
      why('限量要过一阵才能再用', 'bad');
      return;
    }
    el.setPointerCapture(e.pointerId);
    beginDrag(inf, el, e);
  });
  el.addEventListener('pointermove', moveDrag);
  el.addEventListener('pointerup', endDrag);
  el.addEventListener('pointercancel', endDrag);
}
/** 价签：点一下改价；按住拖走 = 挪货 */
function tagInput(e: HTMLElement, i: number): void {
  let id = -1;
  let x0 = 0;
  let y0 = 0;
  let dragging = false;
  e.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    if (S.phase !== 'open' && S.phase !== 'prep') return;
    id = ev.pointerId;
    e.setPointerCapture(id);
    const p = phonePt(ev);
    x0 = p.x;
    y0 = p.y;
    dragging = false;
    e.classList.add('press');
    SFX.tap();
    buzz(6);
  });
  e.addEventListener('pointermove', (ev) => {
    if (ev.pointerId !== id) return;
    if (dragging) return moveDrag(ev);
    const p = phonePt(ev);
    if (S.slots[i] && Math.hypot(p.x - x0, p.y - y0) > 12) {
      dragging = true;
      e.classList.remove('press');
      beginDrag({ kind: 'move', from: i }, e, ev);
      moveDrag(ev);
    }
  });
  const up = (ev: PointerEvent) => {
    if (ev.pointerId !== id) return;
    id = -1;
    e.classList.remove('press');
    if (dragging) return endDrag(ev);
    if (!S.slots[i]) {
      select(-1);
      SC.hl[i] = 'sel';
      window.setTimeout(() => {
        if (S.sel < 0 && SC.hl[i] === 'sel') SC.hl[i] = '';
      }, 900);
      why(`${SLOTS[i]!.n}空着：从下面拖货`);
      return;
    }
    select(S.sel === i ? -1 : i);
  };
  e.addEventListener('pointerup', up);
  e.addEventListener('pointercancel', up);
}

/** 真正放下 */
function drop(info: DragInfo, i: number): void {
  const c = canDrop(info, i);
  if (!c.ok) return;
  const d = SLOTS[i]!;
  const t = tagScreen(i);
  if (info.kind === 'lim') {
    const s = S.slots[i] as Slot;
    s.lim = 14;
    s.limFake = s.qty > 6;
    S.limCd = 8;
    S.ds.lim++;
    floatText(floats, t.x, t.y - 30, '限量!', { kind: 'bad', rise: 50 });
    fx.sparkle(d.x, d.h, d.z, 14, '#ff5a6a');
    SFX.bigCoin();
    shake(stage);
    buzz(14);
    why('14 秒里看的人更多、更肯掏钱');
    if (S.ds.lim >= 3)
      window.setTimeout(() => {
        floatText(floats, t.x, t.y, '又限量?老套路', { kind: 'bad' });
        addTrust(-3, t);
        why('一天贴第三次：口碑 −3', 'bad');
        SFX.bad();
      }, 500);
  } else if (info.kind === 'move') {
    const src = S.slots[info.from] as Slot;
    const s = S.slots[i];
    if (!s) {
      S.slots[i] = src;
      S.slots[info.from] = null;
    } else if (s.goods.join() === src.goods.join()) {
      s.qty += src.qty;
      S.slots[info.from] = null;
    } else {
      S.slots[i] = src;
      S.slots[info.from] = s;
    }
    paintShelf(info.from);
    SC.bounce(info.from);
    why(c.why);
  } else {
    const g = info.g;
    const G = GOODS[g];
    const s = S.slots[i];
    if (s && s.goods[0] !== g) {
      const pairs = Math.min(s.qty, G.cs);
      const cost = Math.round(G.cost * pairs * 10) / 10;
      addCash(-cost);
      S.ds.spend += cost;
      S.supply[g]--;
      s.goods = [s.goods[0] as GoodId, g];
      s.qty = pairs;
      s.price = Math.round(slotFair(s) * 0.9 * 2) / 2;
      s.lim = 0;
      floatText(floats, t.x, t.y - 10, `−${fmt(cost)}`, { kind: 'bad' });
      floatText(floats, t.x, t.y - 40, '捆绑!', { kind: 'gold', rise: 50 });
      fx.confetti(d.x, d.h, d.z, 24, 0.6);
      SFX.fanfare();
      why('套装：妈妈游客爱，老人球迷嫌');
    } else {
      const cost = G.cost * G.cs;
      addCash(-cost);
      S.ds.spend += cost;
      S.supply[g]--;
      if (s) s.qty += G.cs;
      else {
        let p = G.fair;
        if (g === 'water' && S.ds.gougeMode) p *= 3;
        S.slots[i] = { goods: [g], qty: G.cs, price: p, lim: 0, limFake: false, warned: false };
      }
      floatText(floats, t.x, t.y - 10, `−${fmt(cost)}`, { kind: 'bad' });
      why(`${G.n}${s ? '补货' : '上架'}：${fmt(G.fair)} 市价起`);
    }
    SFX.drop();
  }
  buzz(14);
  fx.dust(d.x, 0.1, d.z, 7, '#c9a36a');
  paintShelf(i);
  SC.bounce(i);
  refreshTray();
  refreshTags();
  if (S.sel === i) paintPrice();
  if (info.kind === 'good' && !hinted) {
    hinted = true;
    window.setTimeout(() => {
      const tt = tagScreen(i);
      floatText(floats, tt.x, tt.y + 40, '点价签改价', { kind: 'gold', ms: 1600 });
      tagFx(i, 'joy');
    }, 250);
  }
  paintStatus();
}
function paintShelf(i: number): void {
  const s = S.slots[i];
  SC.setGoods(i, s ? s.goods : null, s ? s.qty : 0, !!s && s.lim > 0);
  refreshTag(i);
}

/* ================= 客人 ================= */
const CUST: Cust[] = [];
let simNow = 0;
const SKIN = ['#f1c7a1', '#e8b896', '#d9a47c', '#c48a62', '#a86f4c', '#7a4a32'];
function lookFor(type: CustType): Omit<PersonOptions, 'name' | 'x' | 'z'> {
  const skin = pick(SKIN);
  switch (type) {
    case 'retiree':
      return {
        skin,
        hair: pick(['#d8d4cc', '#bdb8b0', '#e8e4dc']),
        hairStyle: pick(['visor', 'short', 'bald'] as const),
        cap: '#f3ecdc',
        shirt: pick(['#7fb3c9', '#9fc7a0', '#c9b48a']),
        shorts: '#c9b48a',
        pants: true,
        shoes: '#f3f1ea',
        wide: true,
      };
    case 'mom':
      return {
        skin,
        hair: pick(['#2a1d16', '#5a3a22', '#e8c070']),
        hairStyle: 'pony',
        shirt: pick(['#e27aa8', '#f2a0b8', '#c48aff']),
        shorts: '#f3f1ea',
        shoes: '#f3f1ea',
        phone: true,
      };
    case 'fan':
      return {
        skin,
        hair: '#2a1d16',
        hairStyle: 'cap',
        cap: pick(['#d94a3a', '#2f7fd8', '#14223a']),
        shirt: pick(['#3fae5a', '#f2d23a', '#2a8a86']),
        shorts: '#26262b',
        shoes: '#d24b3a',
        racket: '#e8582c',
      };
    case 'tourist':
      return {
        skin,
        hair: pick(['#c8643c', '#e8c070', '#5a3a22']),
        hairStyle: 'cap',
        cap: '#e8d08a',
        shirt: pick(['#f2b134', '#ff8a6b', '#4fc3d9']),
        trim: '#f3ecdc',
        shorts: '#8a5a35',
        shoes: '#5a4a3a',
        phone: true,
      };
  }
}
const VISITOR_LOOK: Record<string, Omit<PersonOptions, 'name' | 'x' | 'z'>> = {
  dale: {
    wide: true,
    shirt: '#6b2e2a',
    shorts: '#4f5560',
    pants: true,
    skin: '#f1c7a1',
    hair: '#cfcac0',
    hairStyle: 'cap',
    cap: '#2b3440',
    beard: '#cfcac0',
    shoes: '#5a4a3a',
  },
  guide: {
    shirt: '#f2b134',
    trim: '#a8453a',
    shorts: '#5a4a3a',
    skin: '#c48a62',
    hair: '#5a3a22',
    hairStyle: 'cap',
    cap: '#e8d08a',
    shoes: '#2a2a2a',
    clipboard: true,
  },
  coach: {
    shirt: '#2f7a49',
    shorts: '#26262b',
    skin: '#a86f4c',
    hair: '#2a1d16',
    hairStyle: 'cap',
    cap: '#1f3a5a',
    shoes: '#f3f1ea',
    clipboard: true,
  },
  jess: {
    shirt: '#2a8a86',
    shorts: '#f1ece0',
    skin: '#d9a47c',
    hair: '#2a1d16',
    hairStyle: 'pony',
    shoes: '#f1ece0',
    racket: '#e8582c',
  },
};

function standOf(i: number) {
  const s = SLOTS[i]!;
  return { x: s.sx, z: s.sz };
}
function routeFrom(at: number): { x: number; z: number }[] {
  if (at < 0) return [{ x: DOOR_IN.x, z: -2.6 }, HUB];
  return [...SLOTS[at]!.via].reverse().concat([HUB]);
}
function routeTo(at: number, to: number): { x: number; z: number }[] {
  return [...routeFrom(at), ...SLOTS[to]!.via, standOf(to)];
}
function exitRoute(at: number): { x: number; z: number }[] {
  const r = at < 0 ? [] : routeFrom(at);
  return [...r, { x: DOOR_IN.x, z: -2.6 }, DOOR_IN, DOOR_OUT];
}
function removeCust(c: Cust): void {
  if (c.gone) return;
  c.gone = true;
  c.p.removed = true;
  SC.carry(c.p, null);
  c.p.clearMoves();
  c.p.root.removeFromParent();
  const k = people.people.indexOf(c.p);
  if (k >= 0) people.people.splice(k, 1);
  const j = CUST.indexOf(c);
  if (j >= 0) CUST.splice(j, 1);
}
function speedOf(c: Cust) {
  return TYPES[c.type].sp * (S.closing ? 1.5 : 1);
}
function spawn(forced?: CustType): void {
  const cd = cond();
  const h = 8 + S.min / 60;
  let type: CustType = 'mom';
  if (forced) type = forced;
  else {
    const w: Record<CustType, number> = {
      retiree: 3 * (h < 12 ? 1.5 : 1),
      mom: 3,
      fan: 2 + cd.crowd * 4,
      tourist: 2 + cd.crowd * 3 + (cd.hot > 0.6 ? 1 : 0),
    };
    let tot = 0;
    for (const k of TYPE_ORDER) tot += w[k];
    let r = rnd() * tot;
    for (const k of TYPE_ORDER) {
      r -= w[k];
      if (r <= 0) {
        type = k;
        break;
      }
    }
  }
  const T = TYPES[type];
  const n = 2 + Math.floor(rnd() * 3);
  const cand = SLOTS.map((d, i) => {
    const s = S.slots[i];
    let wt = d.vis * (s ? 0.5 + Math.max(...s.goods.map((g) => T.pref[g] * gmod(g, cd))) / 3 : 0.25);
    if (s && s.lim > 0) wt *= 1.7;
    return { i, wt };
  });
  const plan: number[] = [];
  for (let k = 0; k < n && cand.length; k++) {
    const tw = cand.reduce((a, c) => a + c.wt, 0);
    let rr = rnd() * tw;
    let j = 0;
    for (; j < cand.length - 1; j++) {
      rr -= (cand[j] as { wt: number }).wt;
      if (rr <= 0) break;
    }
    plan.push((cand[j] as { i: number }).i);
    cand.splice(j, 1);
  }
  const p = new Person(
    { ...lookFor(type), name: `c${simNow.toFixed(2)}`, x: DOOR_IN.x + (vrand() - 0.5) * 0.3, z: -3.7 },
    people,
  );
  const c: Cust = { p, type, plan, buys: 0, angry: 0, at: -1, gone: false, sawFake: false };
  CUST.push(c);
  SC.openDoor();
  fx.puff(DOOR_IN.x, 0.3, -3.6);
  if (vrand() < 0.4)
    sfx(
      { f: 1568, dur: 0.12, type: 'triangle', vol: 0.04 },
      { f: 2093, dur: 0.16, type: 'triangle', vol: 0.03, at: 0.07 },
    );
  next(c);
}
function next(c: Cust): void {
  if (c.gone) return;
  if (c.plan.length && c.buys < TYPES[c.type].buys && c.angry < 2 && !S.closing) {
    const i = c.plan.shift() as number;
    c.p.path(routeTo(c.at, i), speedOf(c)).call(() => arrive(c, i));
  } else leave(c);
}
function leave(c: Cust, sp?: number): void {
  c.p.path(exitRoute(c.at), sp ?? speedOf(c)).call(() => removeCust(c));
  c.at = -1;
  if (vrand() < 0.5) SC.openDoor();
  window.setTimeout(() => SC.openDoor(), 400);
}
function arrive(c: Cust, i: number): void {
  c.at = i;
  const s = SLOTS[i]!;
  c.p.idleFace = Math.atan2(s.x - c.p.pos.x, s.z - c.p.pos.z);
  const look = TYPES[c.type].look;
  c.p.wait(look * 0.55).call(() => evaluate(c, i));
}
/** DOM 气泡（像素字气泡在 2 倍精灵下太大）：跟着头走，挂在头的右上 */
const BUBS: { el: HTMLElement; p: Person; t: number; w: number }[] = [];
const BUB_CLS: Record<string, string> = { '#2f7a49': 'good', '#b5452e': 'bad', '#d94a3a': 'rage', '#2f7fc4': 'cold' };
function say(c: Cust, text: string, col?: string, dur = 1.6): void {
  for (const b of BUBS) if (b.p === c.p) b.t = 0;
  const el = document.createElement('div');
  el.className = `bub ${col ? (BUB_CLS[col] ?? '') : ''}`;
  el.textContent = text;
  floats.appendChild(el);
  BUBS.push({ el, p: c.p, t: dur, w: el.offsetWidth });
  // 最多同时 4 个，旧的先散
  if (BUBS.length > 4) for (const b of BUBS.slice(0, BUBS.length - 4)) b.t = Math.min(b.t, 0.2);
  placeBub(BUBS[BUBS.length - 1]!);
}
function placeBub(b: { el: HTMLElement; p: Person; w: number }): void {
  const q = SC.headCss(b.p);
  const w = b.w;
  const x = clamp(q.x + 14, 4, phoneEl.clientWidth - w - 4);
  b.el.style.transform = `translate(${x}px,${q.y - 4}px)`;
}
function updBubs(dt: number): void {
  for (let i = BUBS.length - 1; i >= 0; i--) {
    const b = BUBS[i]!;
    b.t -= dt;
    if (b.t <= 0 || b.p.removed) {
      b.el.remove();
      BUBS.splice(i, 1);
      continue;
    }
    placeBub(b);
    b.el.style.opacity = b.t < 0.25 ? String(b.t / 0.25) : '1';
  }
}
function evaluate(c: Cust, i: number): void {
  if (c.gone) return;
  const s = S.slots[i];
  const T = TYPES[c.type];
  const cd = cond();
  const cont = (d: number): void => {
    c.p.wait(d).call(() => next(c));
  };
  if (!s) {
    SC.emote(c.p, 'sad', 1.2);
    if (rnd() < 0.5) say(c, pick(LINES.empty));
    addTrust(-0.15);
    why(`${T.n}走到${SLOTS[i]!.n}，空的`, 'bad');
    cont(0.5);
    return;
  }
  if (s.goods.length === 1 && s.goods[0] === 'hat' && cd.wind && rnd() < 0.6) {
    SC.emote(c.p, 'sweat', 1.2);
    say(c, LINES.wind[0] as string);
    why('起风了，帽子没人要');
    cont(0.5);
    return;
  }
  let pref = Math.max(...s.goods.map((g) => T.pref[g] * gmod(g, cd)));
  if (s.goods.length > 1) pref *= 1.15;
  if (s.lim > 0) pref *= 1.5;
  const cold = !!SLOTS[i]!.cooler && isDrinks(s.goods);
  if (cold) pref *= 1 + 1.2 * cd.hot;
  const pInt = clamp((pref / 2.6) * (0.75 + 0.25 * SLOTS[i]!.vis), 0.08, 0.95);
  if (rnd() > pInt) {
    if (vrand() < 0.4) SC.emote(c.p, 'zzz', 0.8);
    cont(0.3);
    return;
  }
  const x = reactX(c.type, i, s, cd);
  const nm = GOODS[s.goods[0] as GoodId].n;
  const ratio = effPrice(s) / slotFair(s);
  const hp = () => headPt(c.p);
  if (x <= 0.7) {
    const u = Math.min(s.qty, T.buys === 1 ? 2 : 3);
    SC.emote(c.p, 'heart', 1.3);
    c.p.hop(simNow, 0.25, 0.35);
    say(c, pick(LINES.wow), '#2f7a49');
    sell(c, i, u);
    addTrust(0.5);
    tagFx(i, 'joy');
    SFX.fanfare();
    why(`${T.n}：${nm}划算！买 ${u} 件`, 'good');
    cont(0.7);
    return;
  }
  if (x <= 1) {
    SC.emote(c.p, 'money', 1.1);
    if (cold && rnd() < 0.6) say(c, pick(LINES.cold), '#2f7fc4');
    else if (rnd() < 0.4) say(c, pick(LINES.ok));
    sell(c, i, 1);
    if (ratio <= 1.05) addTrust(0.25);
    why(`${T.n}买了${nm} ${fmt(effPrice(s))}`, 'good');
    cont(0.5);
    return;
  }
  if (x <= 1.3) {
    SC.emote(c.p, 'ques', 1.2);
    say(c, pick(LINES.hes));
    sfx(
      { f: 420, dur: 0.07, type: 'triangle', vol: 0.05 },
      { f: 400, dur: 0.07, type: 'triangle', vol: 0.05, at: 0.12 },
    );
    const pr = (1.3 - x) / 0.3;
    why(`${T.n}在犹豫：${nm} ${ratio.toFixed(1)}× 市价`);
    c.p.wait(0.9).call(() => {
      const s2 = S.slots[i];
      if (!s2 || c.gone) return next(c);
      if (rnd() < pr) {
        SC.emote(c.p, 'sweat', 0.9);
        say(c, pick(LINES.hesYes));
        sell(c, i, 1);
      } else {
        if (rnd() < 0.5) say(c, pick(LINES.hesNo));
        c.angry += 0.5;
      }
      cont(0.5);
    });
    return;
  }
  if (x <= 1.7) {
    SC.emote(c.p, 'anger', 1.3);
    say(c, pick(LINES.frown), '#b5452e');
    fx.steam(c.p.pos.x, 1.7, c.p.pos.z);
    SFX.bad();
    addTrust(-0.5);
    c.angry++;
    tagFx(i, 'rage');
    why(`${T.n}嫌贵：${nm} ${fmt(effPrice(s))}（市价 ${fmt(slotFair(s))}）`, 'bad');
    cont(0.4);
    return;
  }
  // 抢钱啊
  SC.emote(c.p, 'fire', 1.8);
  say(c, pick(T.rage).replace('$P', fmt(effPrice(s))), '#d94a3a', 2);
  c.p.gesture('argue', simNow, 0.9);
  fx.steam(c.p.pos.x, 1.7, c.p.pos.z);
  fx.steam(c.p.pos.x, 1.8, c.p.pos.z);
  addTrust(-1.8, hp());
  S.ds.rage++;
  S.tot.rage++;
  tagFx(i, 'rage');
  shake(stage);
  flash(fxHost, 'rgba(217,74,58,.5)');
  sfx({ f: 190, f2: 80, dur: 0.4, type: 'sawtooth', vol: 0.1 }, { f: 95, f2: 55, dur: 0.35, at: 0.04, vol: 0.07 });
  buzz([30, 40, 30]);
  why(`${T.n}气走了：${nm} ${ratio.toFixed(1)}× 市价`, 'bad');
  c.plan = [];
  c.angry = 9;
  c.p.wait(0.9).call(() => leave(c, 3.0));
}
function sell(c: Cust, i: number, units: number): void {
  const s = S.slots[i];
  if (!s) return;
  units = Math.min(units, s.qty);
  if (units <= 0) return;
  const price = effPrice(s);
  const rev = Math.round(price * units * 10) / 10;
  const prof = (price - slotCost(s)) * units;
  s.qty -= units;
  addCash(rev);
  S.ds.rev += rev;
  S.ds.sold += units;
  S.tot.sold += units;
  c.buys += units > 1 ? 2 : 1;
  director.hop(dirNow, 0.15, 0.3);
  const t = tagScreen(i);
  flyMoney(`+${fmt(rev)}`, t.x, t.y - 14, prof >= 30);
  const g = s.goods[0] as GoodId;
  SC.carry(c.p, g);
  const d = SLOTS[i]!;
  if (prof >= 30) {
    S.tot.bigSales++;
    shake(stage);
    flash(fxHost, 'rgba(255,192,74,.55)');
    fx.confetti(d.x, d.h + 0.4, d.z, 50, 1.2);
    SFX.fanfare();
    buzz([20, 30, 20, 30, 40]);
    banner(`大单！${GOODS[g].n} ${fmt(rev)}`, 'gold');
  } else {
    fx.sparkle(d.x, d.h * 0.7, d.z, 6, '#ffd84a');
    sfx(
      { f: 988 * (1 + Math.min(0.5, prof / 20)), dur: 0.05 },
      { f: 1319 * (1 + Math.min(0.5, prof / 20)), dur: 0.12, at: 0.05 },
    );
  }
  const fr = price / slotFair(s);
  if (fr >= 2) {
    window.setTimeout(() => !c.gone && say(c, pick(LINES.gouge), '#b5452e'), 380);
    addTrust(-1);
    S.ds.gouge++;
    S.tot.gouge++;
    if (!S.ds.worst || fr > S.ds.worst.r) S.ds.worst = { r: fr, g, p: price, bundle: s.goods.length > 1 };
  } else S.tot.happy++;
  if (s.lim > 0 && s.limFake && !c.sawFake && rnd() < 0.3) {
    c.sawFake = true;
    window.setTimeout(() => {
      if (c.gone) return;
      say(c, pick(LINES.fake), '#d94a3a');
      addTrust(-2, headPt(c.p));
      SFX.bad();
      S.tot.fakes++;
      why('假限量被拆穿：口碑 −2', 'bad');
    }, 700);
  }
  if (s.qty <= 0) {
    S.slots[i] = null;
    window.setTimeout(() => floatText(floats, t.x, t.y + 10, '卖空了!', { kind: 'bad' }), 300);
    if (S.sel === i) select(-1);
  }
  paintShelf(i);
  if (S.sel === i) paintPrice();
  paintStatus();
}

/* ---- 来找你的人（事件卡之前先走进来） ---- */
let visitor: Cust | null = null;
function visitorIn(key: string, onArrive: () => void): void {
  const p = new Person({ ...VISITOR_LOOK[key]!, name: `v-${key}`, x: DOOR_IN.x, z: -3.7 }, people);
  const c: Cust = { p, type: 'mom', plan: [], buys: 0, angry: 0, at: -1, gone: false, sawFake: false, visitor: true };
  visitor = c;
  SC.openDoor();
  SFX.whoosh();
  p.path([{ x: DOOR_IN.x, z: -2.6 }, VISIT_AT], 1.8).call(() => {
    p.idleFace = Math.atan2(director.pos.x - p.pos.x, director.pos.z - p.pos.z);
    SC.emote(p, 'excl', 1.2);
    p.gesture('wave', simNow, 0.8);
    onArrive();
  });
}
function visitorOut(icon: IconName): void {
  const c = visitor;
  if (!c) return;
  visitor = null;
  SC.emote(c.p, icon, 1.4);
  c.p
    .wait(0.8)
    .path([{ x: DOOR_IN.x, z: -2.6 }, DOOR_IN, DOOR_OUT], 1.8)
    .call(() => {
      c.p.root.removeFromParent();
      const k = people.people.indexOf(c.p);
      if (k >= 0) people.people.splice(k, 1);
    });
  SC.openDoor();
}

/* ================= 卡片 ================= */
interface Opt {
  label: string;
  gain?: string;
  cost?: string;
  cls?: string;
  disabled?: boolean;
  fn: () => void;
}
function showCard(o: {
  who?: { key: string; name: string };
  title: string;
  say?: string;
  html?: string;
  opts: Opt[];
}): void {
  const card = $('card');
  card.innerHTML = '';
  if (o.who) {
    const w = document.createElement('div');
    w.className = 'who';
    const cv = artCanvas(bustArt(BUSTS[o.who.key] ?? BUSTS.dale!), 4);
    cv.className = 'px';
    w.appendChild(cv);
    w.insertAdjacentHTML(
      'beforeend',
      `<div><div class="k-label">${o.who.name}</div><div class="k-title" style="font-size:20px">${o.title}</div></div>`,
    );
    card.appendChild(w);
  } else
    card.insertAdjacentHTML(
      'beforeend',
      `<div class="k-title" style="font-size:20px;margin-bottom:6px">${o.title}</div>`,
    );
  if (o.say) card.insertAdjacentHTML('beforeend', `<p class="say">${o.say}</p>`);
  if (o.html) card.insertAdjacentHTML('beforeend', o.html);
  const box = document.createElement('div');
  box.className = 'opts';
  for (const op of o.opts) {
    const b = document.createElement('button');
    b.className = `opt ${op.cls ?? ''}`;
    b.disabled = !!op.disabled;
    b.innerHTML = `<b>${op.label}</b>${op.gain ? `<span class="g">+ ${op.gain}</span>` : '<span></span>'}${op.cost ? `<span class="c">− ${op.cost}</span>` : '<span></span>'}`;
    b.addEventListener('click', () => {
      if (b.disabled) return;
      SFX.tap();
      buzz(10);
      $('modal').hidden = true;
      op.fn();
    });
    box.appendChild(b);
  }
  card.appendChild(box);
  $('modal').hidden = false;
  select(-1);
}

function shelvesWith(g: GoodId): number[] {
  return S.slots.map((s, i) => (s && s.goods.length === 1 && s.goods[0] === g ? i : -1)).filter((i) => i >= 0);
}
function resume(): void {
  S.phase = 'open';
  S.ds.evOn = false;
}

function heatCard(cd: Cond): void {
  S.phase = 'modal';
  SFX.whoosh();
  const ws = shelvesWith('water');
  const wp = ws.length ? fmt((S.slots[ws[0] as number] as Slot).price) : '$2';
  showCard({
    who: { key: 'dale', name: 'DALE · 老教练' },
    title: `热浪 ${cd.temp}°`,
    say: `门口游客快渴晕了。\n水现在 ${wp}，你说了算。`,
    opts: [
      {
        label: '水价 ×3',
        gain: '每瓶多赚 $4',
        cost: '掉口碑 · 可能上报',
        cls: 'hot',
        fn: () => {
          S.ds.gougeMode = true;
          for (const i of ws) {
            const s = S.slots[i] as Slot;
            s.price = Math.round(s.price * 3 * 2) / 2;
            tagFx(i, 'rage');
            const t = tagScreen(i);
            floatText(floats, t.x, t.y - 30, '×3', { kind: 'gold', rise: 50 });
          }
          refreshTags();
          SFX.bigCoin();
          shake(stage);
          why('水价 ×3：热的时候大多照买', 'bad');
          visitorOut('money');
          resume();
        },
      },
      {
        label: '免费冰水桶',
        gain: '口碑 +6 · 客流 +30%',
        cost: '$10',
        disabled: S.cash < 10,
        fn: () => {
          addCash(-10);
          S.ds.spend += 10;
          S.ds.ice = true;
          SC.setIce(true);
          const t = proj(ICE_AT.x, 0.6, ICE_AT.z);
          addTrust(6, t);
          fx.splash(ICE_AT.x, 0.5, ICE_AT.z, 16);
          SFX.fanfare();
          why('冰水桶：热天进店的人多三成', 'good');
          visitorOut('heart');
          resume();
        },
      },
      {
        label: '照常卖',
        gain: '不担风险',
        cost: '错过一波',
        fn: () => {
          visitorOut('sad');
          resume();
        },
      },
    ],
  });
}

function busCard(): void {
  S.phase = 'modal';
  const hats = shelvesWith('hat');
  showCard({
    who: { key: 'guide', name: 'MARCO · 导游' },
    title: '旅游大巴',
    say: '车上 12 个游客。\n给点好处，我带他们进来。',
    opts: [
      {
        label: '给回扣 $25',
        gain: '10 个游客进店',
        cost: '$25',
        disabled: S.cash < 25,
        fn: () => {
          addCash(-25);
          S.ds.spend += 25;
          S.ds.busQ = 10;
          floatText(floats, 195, 120, '−$25', { kind: 'bad' });
          banner('游客下车了！', 'gold');
          why('游客：最不在乎价，爱帽子防晒', 'good');
          visitorOut('money');
          resume();
        },
      },
      {
        label: '送他一顶帽子',
        gain: '6 个游客进店',
        cost: hats.length ? '架上少一顶' : '架上没帽子',
        disabled: !hats.length,
        fn: () => {
          const i = hats[0] as number;
          const s = S.slots[i] as Slot;
          s.qty--;
          if (s.qty <= 0) S.slots[i] = null;
          paintShelf(i);
          S.ds.busQ = 6;
          banner('导游戴上帽子，招手叫人', 'gold');
          visitorOut('heart');
          resume();
        },
      },
      {
        label: '不给',
        gain: '省钱',
        cost: '只来 2 个',
        fn: () => {
          S.ds.busQ = 2;
          SC.win.bus = 1.01;
          visitorOut('anger');
          why('导游把车开去隔壁了');
          resume();
        },
      },
    ],
  });
}

function teamCard(): void {
  S.phase = 'modal';
  const shelf = shelvesWith('balls');
  const avail = shelf.reduce((a, i) => a + (S.slots[i] as Slot).qty, 0) + S.supply.balls * GOODS.balls.cs;
  const take = (n: number, price: number) => {
    let left = n;
    for (const i of shelf) {
      const s = S.slots[i] as Slot;
      const u = Math.min(left, s.qty);
      s.qty -= u;
      left -= u;
      if (s.qty <= 0) S.slots[i] = null;
      paintShelf(i);
    }
    while (left > 0 && S.supply.balls > 0) {
      S.supply.balls--;
      left -= GOODS.balls.cs;
      addCash(-GOODS.balls.cost * GOODS.balls.cs);
      S.ds.spend += GOODS.balls.cost * GOODS.balls.cs;
    }
    const sold = n - Math.max(0, left);
    const rev = Math.round(sold * price * 10) / 10;
    addCash(rev);
    S.ds.rev += rev;
    S.ds.sold += sold;
    S.tot.sold += sold;
    flyMoney(`+${fmt(rev)}`, 195, 330, rev >= 40);
    SFX.bigCoin();
    refreshTray();
    return sold;
  };
  if (!avail) {
    showCard({
      who: { key: 'coach', name: 'RIVERA · 校队教练' },
      title: '校队订货',
      say: '要 12 罐球……\n你们一罐都没有？',
      opts: [
        {
          label: '下次一定',
          cost: '口碑 −1',
          fn: () => {
            addTrust(-1);
            visitorOut('sad');
            resume();
          },
        },
      ],
    });
    return;
  }
  const n = Math.min(12, avail);
  showCard({
    who: { key: 'coach', name: 'RIVERA · 校队教练' },
    title: '校队订货',
    say: `要 ${n} 罐球。\n八折行不行？`,
    opts: [
      {
        label: `八折 ${fmt(4.8)}`,
        gain: `马上卖 ${n} 罐 · 口碑+4`,
        cost: '每罐少赚 $1.2',
        fn: () => {
          take(n, 4.8);
          addTrust(4, { x: 195, y: 300 });
          why('校队：薄利多销，口碑 +4', 'good');
          visitorOut('heart');
          resume();
        },
      },
      {
        label: `原价 ${fmt(6)}`,
        gain: '每罐赚满',
        cost: '可能只买一半',
        fn: () => {
          const all = rnd() < 0.45;
          const sold = take(all ? n : Math.ceil(n / 2), 6);
          why(all ? `校队全要了：${sold} 罐` : `教练只买一半：${sold} 罐`, all ? 'good' : '');
          visitorOut(all ? 'money' : 'sweat');
          resume();
        },
      },
      {
        label: `"最后几罐" ${fmt(9)}`,
        gain: '每罐多赚 $3',
        cost: '只买 4 罐 · 口碑 −3',
        cls: 'hot',
        fn: () => {
          take(Math.min(4, n), 9);
          addTrust(-3, { x: 195, y: 300 });
          why('教练在群里吐槽：口碑 −3', 'bad');
          visitorOut('anger');
          resume();
        },
      },
    ],
  });
}

function matchCard(): void {
  S.phase = 'modal';
  showCard({
    who: { key: 'coach', name: 'JESS · 教练' },
    title: '比赛散场',
    say: '两场刚打完，\n人马上涌过来！',
    opts: [
      {
        label: '门口特价车',
        gain: '客流 ×2 · 口碑 +3',
        cost: '90 分钟全场八折',
        fn: () => {
          S.ds.saleUntil = S.min + 90;
          S.ds.crowdBoost = 2;
          addTrust(3, { x: 195, y: 300 });
          refreshTags();
          banner('特价车推出去了！', 'go');
          why('八折：人多，每件赚得少', 'good');
          visitorOut('heart');
          resume();
        },
      },
      {
        label: '全场涨三成',
        gain: '每件多赚',
        cost: '被骂会更多',
        cls: 'hot',
        fn: () => {
          S.slots.forEach((s, i) => {
            if (!s) return;
            s.price = Math.round(s.price * 1.3 * 2) / 2;
            tagFx(i, 'rage');
          });
          refreshTags();
          SFX.bigCoin();
          why('全场 +30%：人潮里肯掏钱的多', 'bad');
          visitorOut('money');
          resume();
        },
      },
      {
        label: '照常',
        gain: '稳',
        cost: '错过一波',
        fn: () => {
          visitorOut('sweat');
          resume();
        },
      },
    ],
  });
}

/* ================= 一天 ================= */
function startDay(d: number): void {
  S.day = d;
  S.min = 0;
  S.closing = false;
  S.closeT = 0;
  S.lastHour = -1;
  S.spawnAcc = 0;
  S.limCd = 0;
  S.ds = newDS();
  S.ds.trust0 = S.trust;
  S.ds.cash0 = S.cash;
  for (const g of ORDER) S.supply[g] = (S.supply[g] || 0) + (S.days[d] as Day).am[g];
  for (const s of S.slots) if (s) s.lim = 0;
  for (const c of [...CUST]) removeCust(c);
  SC.setIce(false);
  SC.win.bus = 0;
  S.phase = 'prep';
  for (let i = 0; i < SLOTS.length; i++) paintShelf(i);
  refreshTray();
  select(-1);
  $('openBtn').hidden = false;
  $('speedBtn').hidden = true;
  why(d === 0 ? '把货拖到货架上 · 门口两格★客流×1.7' : DAYHINT[(S.days[d] as Day).t]);
  banner(`第 ${d + 1} 天 · ${DAYNAME[(S.days[d] as Day).t]}`);
}
function openShop(): void {
  if (S.phase !== 'prep') return;
  if (!S.slots.some(Boolean)) {
    why('货架全空：先拖点货上去', 'bad');
    SFX.buzz();
    shake($('tray'));
    return;
  }
  S.phase = 'open';
  $('openBtn').hidden = true;
  $('speedBtn').hidden = false;
  sfx(
    { f: 1568, dur: 0.25, type: 'triangle', vol: 0.06 },
    { f: 2093, dur: 0.3, type: 'triangle', vol: 0.04, at: 0.08 },
  );
  banner('开门啦！', 'go');
  S.spawnAcc = 0.6;
  why(DAYHINT[(S.days[S.day] as Day).t]);
}
$('openBtn').addEventListener('click', openShop);
$('speedBtn').addEventListener('click', () => {
  S.speed = S.speed === 1 ? 2 : 1;
  $('speedBtn').textContent = `×${S.speed}`;
  SFX.tap();
});

const EV_AT: Record<DayKind, number> = { sunny: 225, heat: -1, wind: 180, match: 200 };
function tick(dt: number): void {
  const gdt = dt * S.speed * FAST;
  S.min += (gdt * 720) / DAY_SEC;
  const ds = S.ds;
  const d = S.days[S.day] as Day;
  if (S.limCd > 0) S.limCd -= gdt;
  SLOTS.forEach((_, i) => {
    const s = S.slots[i];
    if (s && s.lim > 0) {
      s.lim -= gdt;
      if (s.lim <= 0) paintShelf(i);
    }
  });
  const cd = cond();
  const hr = Math.floor(S.min / 60);
  if (hr !== S.lastHour && S.min < 720) {
    const prev = S.lastHour;
    S.lastHour = hr;
    if (prev >= 0) {
      if (d.wind[hr] && !d.wind[prev]) banner('起风了！帽子卖不动', 'blue');
      else if (!d.wind[hr] && d.wind[prev]) banner('风停了');
      if (d.match && (hr === 3 || hr === 8)) banner('比赛散场，人潮来了！', 'gold');
      if (cd.hot > 0.75 && !ds.hotBan) {
        ds.hotBan = true;
        banner(`${cd.temp}°！大家都在找水`, 'bad');
      }
    }
  }
  if (!ds.pmDone && S.min >= 300) {
    ds.pmDone = true;
    let any = 0;
    for (const g of ORDER) {
      S.supply[g] += d.pm[g];
      any += d.pm[g];
    }
    if (any) {
      banner('13:00 下午的货到了', 'blue');
      SFX.whoosh();
      refreshTray();
    }
  }
  // 每天中午一件事：先有人走进来，到了柜台再出卡
  if (!ds.evDone) {
    let go = false;
    if (d.t === 'heat') go = cd.hot >= 0.85;
    else go = S.min >= EV_AT[d.t];
    if (go) {
      ds.evDone = true;
      ds.evOn = true;
      if (d.t === 'heat') {
        banner('Dale 擦着汗进来了', 'bad');
        visitorIn('dale', () => heatCard(cond()));
      } else if (d.t === 'sunny') {
        SC.win.bus = 0.001;
        banner('旅游大巴停在门口！', 'gold');
        sfx(
          { f: 330, dur: 0.18, type: 'square', vol: 0.06 },
          { f: 330, dur: 0.25, type: 'square', vol: 0.06, at: 0.24 },
        );
        visitorIn('guide', busCard);
      } else if (d.t === 'wind') {
        banner('校队教练来了', 'blue');
        visitorIn('coach', teamCard);
      } else {
        banner('Jess 跑进来报信', 'gold');
        visitorIn('jess', matchCard);
      }
    }
  }
  // 窗外
  SC.win.hot = cd.hot;
  SC.win.wind = cd.wind;
  SC.win.crowd = cd.crowd;
  if (SC.win.bus > 0 && SC.win.bus < 1) SC.win.bus = Math.min(1, SC.win.bus + gdt / 1.6);
  else if (SC.win.bus >= 1 && ds.busQ <= 0 && !ds.evOn) SC.win.bus += gdt / 2.4;
  if (SC.win.bus > 2) SC.win.bus = 0;
  // 大巴下来的游客
  if (ds.busQ > 0 && !ds.evOn) {
    ds.busAcc += gdt;
    if (ds.busAcc >= 1.1) {
      ds.busAcc = 0;
      ds.busQ--;
      if (CUST.length < 16) spawn('tourist');
    }
  }
  if (S.min < 700) {
    const rate =
      0.8 *
      (0.4 + S.trust / 100) *
      (1 + 1.6 * cd.crowd * ds.crowdBoost) *
      (cd.wind ? 0.7 : 1) *
      (cd.hot > 0.8 ? 1.1 : 1) *
      (ds.ice && cd.hot > 0.6 ? 1.3 : 1) *
      (saleOn() ? 1.4 : 1);
    S.spawnAcc += gdt * rate;
    while (S.spawnAcc >= 1) {
      S.spawnAcc -= 1;
      if (CUST.length < 13 && !ds.evOn) spawn();
    }
  } else if (!S.closing) {
    S.closing = true;
    banner('打烊了');
    for (const c of CUST) c.plan = [];
  }
  if (saleOn() !== lastSale) {
    lastSale = saleOn();
    refreshTags();
    if (!lastSale && S.sel >= 0) paintPrice();
  }
  if (S.closing) {
    S.closeT += gdt;
    if (!CUST.length || S.closeT > 8) {
      for (const c of [...CUST]) removeCust(c);
      endDay();
      return;
    }
  }
  paintStatus();
}
let lastSale = false;

function endDay(): void {
  S.phase = 'modal';
  const ds = S.ds;
  S.tot.rev += ds.rev;
  S.tot.spend += ds.spend;
  for (const s of S.slots) if (s) s.lim = 0;
  for (let i = 0; i < SLOTS.length; i++) paintShelf(i);
  if (ds.gouge >= 3 && ds.worst && rnd() < Math.min(0.95, 0.3 + ds.gouge * 0.08)) {
    S.tot.papers++;
    const w = ds.worst;
    const what = w.bundle ? `${fmt(w.p)} 一套` : `${fmt(w.p)} 一${GOODS[w.g].u}${GOODS[w.g].n.replace('罐装', '')}`;
    const quotes = [
      '游客：“比赌城还黑。”',
      '退休的 Hank：“打了三十年球，没见过这么抢钱的。”',
      '网球妈妈群已经在转发截图。',
    ];
    const pe = $('paper');
    pe.innerHTML = `<div class="mast">沙漠日报</div><div class="ed">INDIAN WELLS · DAY ${S.day + 1}</div><div class="hl">Palm Oasis 卖 ${what}</div><p>${pick(quotes)}</p><p class="pen">口碑 −12 · 明天进店的人少</p><button class="k-btn primary wide" id="paperOk">……知道了</button>`;
    pe.hidden = false;
    sfx(
      { f: 90, f2: 50, dur: 0.5, type: 'sawtooth', vol: 0.08 },
      { f: 70, dur: 0.1, at: 0.15 },
      { f: 70, dur: 0.1, at: 0.3 },
    );
    shake(phoneEl);
    flash(fxHost, 'rgba(20,20,30,.6)');
    buzz([60, 60, 60]);
    $('paperOk').addEventListener('click', () => {
      pe.hidden = true;
      addTrust(-12);
      summary();
    });
  } else summary();
}
function summary(): void {
  const ds = S.ds;
  const last = S.day >= DAYS - 1;
  const net = S.cash - ds.cash0;
  const tr0 = Math.round(ds.trust0);
  const tr1 = Math.round(S.trust);
  let html = `<div class="stats">
    <span>营业额</span><span class="v good">${fmt(ds.rev)}</span>
    <span>进货</span><span class="v bad">−${fmt(Math.max(0, ds.spend))}</span>
    <span>净赚</span><span class="v ${net >= 0 ? 'good' : 'bad'}">${net >= 0 ? '+' : '−'}${fmt(Math.abs(net))}</span>
    <span>卖出 / 被骂 / 被宰</span><span class="v">${ds.sold} / ${ds.rage} / ${ds.gouge}</span>
    <span>口碑</span><span class="v ${tr1 >= tr0 ? 'good' : 'bad'}">${tr0} → ${tr1}</span></div>`;
  if (!last) {
    const d = S.days[S.day + 1] as Day;
    const sup = ORDER.map((g) => `<span data-g="${g}">×${d.am[g] + d.pm[g]}</span>`).join('');
    html += `<div class="k-label">明天 · ${DAYNAME[d.t]}</div><p>${DAYHINT[d.t]}</p><div class="sup">${sup}</div>`;
  }
  showCard({
    title: `第 ${S.day + 1} 天打烊`,
    html,
    opts: [
      {
        label: last ? '看结果' : '开始备货 ▶',
        gain: last ? '' : '剩货留在架上',
        fn: () => {
          last ? endGame() : startDay(S.day + 1);
        },
      },
    ],
  });
  for (const sp of document.querySelectorAll<HTMLElement>('.sup span')) {
    const g = sp.dataset.g as GoodId;
    sp.prepend(artCanvas(GOOD_ART[g], 2));
  }
}
function endGame(): void {
  S.phase = 'end';
  const P = Math.round(S.cash - START_CASH);
  const T = Math.round(S.trust);
  let title: string;
  let line: string;
  if (T < 35 && P >= 550) [title, line] = ['沙漠吸血鬼', '钱是真赚到了。全城都知道你——以不太好的方式。'];
  else if (T < 35) [title, line] = ['又黑又亏', '骂也挨了，钱也没赚到。'];
  else if (T >= 70 && P >= 850) [title, line] = ['沙漠精明掌柜', '会算账又不招骂，很少见。'];
  else if (T >= 70) [title, line] = ['良心小店', '客人都爱你，账本不太爱你。'];
  else if (P >= 850) [title, line] = ['会算账的老板', '偶尔宰一刀，大部分时候讲理。'];
  else [title, line] = ['老实买卖人', '稳，就是有点闷。试试热浪天的水价？'];
  if (S.tot.papers >= 2) [title, line] = ['上报专业户', '沙漠日报给你开了专栏。'];
  showCard({
    title: '四天结束 · 你是',
    html: `<div class="stamp" id="endTitle">「${title}」</div><p style="text-align:center">${line}</p>
    <div class="stats">
    <span>总利润</span><span class="v ${P >= 0 ? 'good' : 'bad'}">${P >= 0 ? '+' : '−'}${fmt(Math.abs(P))}</span>
    <span>口碑</span><span class="v">${T}</span>
    <span>卖出</span><span class="v">${S.tot.sold} 件</span>
    <span>被骂"抢钱"</span><span class="v">${S.tot.rage} 次</span>
    <span>宰成功（≥2×）</span><span class="v">${S.tot.gouge} 次</span>
    <span>大单 / 拆穿 / 上报</span><span class="v">${S.tot.bigSales} / ${S.tot.fakes} / ${S.tot.papers}</span></div>`,
    opts: [
      {
        label: '再来一局',
        gain: '换一组天气',
        fn: () => {
          SEED = (SEED * 7 + 13) % 1e9;
          restart();
        },
      },
    ],
  });
  SFX.fanfare();
  fx.confetti(0, 2, 0, 80, 3);
}
function restart(): void {
  newGame();
  cashShown = S.cash;
  for (let i = 0; i < SLOTS.length; i++) paintShelf(i);
  startDay(0);
}

/* ================= 开始、说明、静音 ================= */
function startScreen(): void {
  showCard({
    title: '球具店 · 你来定价',
    html: `<p>把货<b>拖上货架</b>，点<b>价签</b>改价。<br>客人走到货架前，当场给你脸色。<br>四天后，看你是哪种老板。</p>`,
    opts: [{ label: '开张 ▶', gain: '第 1 天 · 晴', fn: () => startDay(0) }],
  });
}
$('help').addEventListener('click', () => {
  const was = S.phase;
  if (was !== 'start' && !$('modal').hidden) {
    why('先把眼前这张卡选了');
    SFX.buzz();
    return;
  }
  if (was === 'open') S.phase = 'modal';
  showCard({
    title: '在测什么',
    html: `<div class="help">
      <h3>假设</h3><p>价签是一个随时想动、动之前会犹豫的动词。天气一变、货一空、一个老人骂一句，你就想去改价。</p>
      <h3>取舍</h3><ul>
      <li>高价：每件多赚 / 皱眉、"抢钱"、口碑掉了客流少</li>
      <li>门口★：客流 ×1.7 / 只有两格</li>
      <li>冰柜：热天饮料好卖 / 只放饮料</li>
      <li>限量：14 秒更好卖 / 货多会被拆穿</li>
      <li>捆绑：清滞销 / 老人球迷嫌硬塞</li>
      <li>中午的事：大巴回扣、热浪水价、校队砍价、散场特价</li></ul>
      <h3>操作</h3><p>拖货上架（门口★两格最显眼）；点价签改价，按住价签拖走是挪货 / 对调；托盘里的「限量!」拖到货架上。<br>?fast=4 加速，?seed=N 固定天气。</p></div>`,
    opts: [
      {
        label: '知道了',
        fn: () => {
          was === 'open' ? (S.phase = 'open') : was === 'start' ? startScreen() : null;
        },
      },
    ],
  });
});
let muted = Q.has('mute');
setMuted(muted);
$('mute').textContent = muted ? '×' : '♪';
$('mute').addEventListener('click', () => {
  muted = !muted;
  setMuted(muted);
  $('mute').textContent = muted ? '×' : '♪';
  if (!muted) SFX.tap();
});

/* ================= 主循环 ================= */
buildTags();
buildTray();
buildFaces();
refreshTags();
refreshTray();
paintStatus();
startScreen();
let last = performance.now();
let fxNow = 0;
let dirNow = 0;
function frame(ts: number): void {
  requestAnimationFrame(frame);
  const dt = clamp((ts - last) / 1000, 0, 0.05);
  last = ts;
  fxNow += dt;
  dirNow += dt;
  if (S.phase === 'open') tick(dt);
  const simDt = S.phase === 'open' ? dt * S.speed * FAST : 0;
  simNow += simDt;
  for (const p of [...people.people]) {
    if (p === director) p.update(dt, dirNow);
    else p.update(simDt, simNow);
  }
  const minute = S.phase === 'start' ? 600 : S.phase === 'prep' ? 470 : 480 + Math.min(720, S.min);
  SC.update(dt, fxNow, minute);
  SC.render();
  placeTags();
  updBubs(dt);
  hud();
}
requestAnimationFrame(frame);

// 测试 / 截图用的钩子
(window as unknown as { __shop: unknown }).__shop = {
  get S() {
    return S;
  },
  drop: (g: GoodId, i: number) => drop({ kind: 'good', g }, i),
  lim: (i: number) => drop({ kind: 'lim' }, i),
  select,
  price: (dir: number, n = 1) => {
    for (let k = 0; k < n; k++) changePrice(dir);
  },
  open: openShop,
  start: () => startDay(0),
  pickOpt: (n: number) => (document.querySelectorAll<HTMLButtonElement>('#card .opt')[n] ?? null)?.click(),
  tagAt: (i: number) => tagScreen(i),
  slotAt: (i: number) => SC.slotCss(i),
  emo: (n: IconName) => SC.emote(director, n, 30),
};

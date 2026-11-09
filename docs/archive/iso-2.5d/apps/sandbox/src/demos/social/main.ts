import '../kit/kit.css';
import './style.css';
import type { IconName } from '@td/iso';
import { mulberry32, type Rand } from '@td/shared';
import { buzz, flash, floatText, isMuted, pop, SFX, setMuted, sfx, shake, tween } from '../kit/juice';
import {
  ART,
  type ArtName,
  artCanvas,
  bubbleArt,
  faceArt,
  faceSlots,
  HAND_L,
  iconCanvas,
  type Mood,
  sized,
  starsCanvas,
} from './art';
import {
  type Act,
  arriveRate,
  COST,
  convOf,
  type Entry,
  endTitle,
  type GenSpec,
  genReview,
  KIND_NAME,
  type Kind,
  type Outcome,
  outcome,
  type Review,
  ratingOf,
  type Spot,
  type Stats,
  type Tag,
  TOPIC_STAND,
  TRAIT_ICON,
  TRAIT_NAME,
  type World,
} from './game';
import { type Actor, Scene } from './scene';

/**
 * 11 社交媒体（第二轮）：上半屏是真的 Palm Oasis，评论从场景里的人头上冒出来、飞进下半屏的像素手机；
 * 拖卡到四个图标（回复 → 语气贴纸 / 体验课 / 举报 / 无视），左右滑；每个结果带一句"因为"。
 * 📷 在场景上拖取景框拍照，手机里是渲染器的实时画面；点场景里的牌子派 Rosa 去修沙场、喷泉。
 * ?fast=N 加速，?seed=N 固定随机，?auto=1 自动玩（截图、跑通用）。
 */

const Q = new URLSearchParams(location.search);
const FAST = Math.max(0.25, Number(Q.get('fast')) || 1);
const AUTO = Q.get('auto') === '1';
const AUTO_STOP = Q.get('autostop');
const DAY_LEN = 70;
const DAYS = 4;
const PATIENCE = 30;
const INBOX_MAX = 3;
/** 正在写、正在飞进手机的评论（算进收件箱上限） */
let inflight = 0;

const $ = <E extends HTMLElement = HTMLElement>(id: string): E => document.getElementById(id) as E;
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};

const phone = $('phone');
const ui = $('ui');
const stage = $('stage');

/* ---------------- 状态 ---------------- */

interface DayStats {
  in: number;
  out: number;
  income: number;
  spent: number;
  fans0: number;
  rating0: number;
  fixes: string[];
}
interface Sched {
  t: number;
  f: () => void;
}
const S = {
  phase: 'title' as 'title' | 'play' | 'summary' | 'end',
  day: 1,
  t: 0,
  seed: 1,
  rand: mulberry32(1) as Rand,
  entries: [] as Entry[],
  fans: 150,
  money: 100,
  heat: 0,
  inbox: [] as Review[],
  mode: 'cards' as 'cards' | 'tone' | 'photo' | 'busy',
  posted: false,
  shill: 0,
  exposed: false,
  disasters: 0,
  sched: [] as Sched[],
  stats: {} as Stats,
  ds: {} as DayStats,
  nid: 1,
  acc: 0,
  shown: { rating: 3.2, fans: 150, money: 100 },
};

const rating = () => ratingOf(S.entries);
const world = (): World => ({
  rand: S.rand,
  fans: S.fans,
  fixed: scene.fixed,
  shill: S.shill,
  exposed: S.exposed,
  disasters: S.disasters,
  day: S.day,
});
const minute = () => 7 * 60 + Math.min(1, S.t / DAY_LEN) * 690;

/* ---------------- 场景 ---------------- */

const seed0 = Number(Q.get('seed')) || (Math.random() * 1e9) | 0;
const scene = new Scene(
  stage,
  {
    decide: () => S.rand() < convOf(rating()),
    rating,
    entered: (a, at) => {
      if (S.phase !== 'play') return;
      S.money += COST.visitor;
      S.ds.in++;
      S.ds.income += COST.visitor;
      S.stats.visitors++;
      floatText(ui, at.x, at.y - 6, `+$${COST.visitor}`, { kind: 'good', rise: 24 });
      if (a.regular) floatText(ui, at.x, at.y - 24, '回头客', { kind: 'gold', rise: 20 });
      SFX.coin();
    },
    turned: (_a, at) => {
      if (S.phase !== 'play') return;
      S.ds.out++;
      S.stats.turned++;
      floatText(ui, at.x, at.y - 6, '评分低，走了', { kind: 'bad', rise: 22 });
    },
    fixTap: (spot) => fixTap(spot),
  },
  seed0,
);

/* ---------------- HUD ---------------- */

const hud = el('div', '', '');
hud.id = 'hud';
hud.innerHTML = `
  <button id="mute" class="k-topbtn" aria-label="静音"></button>
  <div class="h-row r1">
    <div class="h-rate"><span class="n" id="hRate">3.2</span><span id="hStars"></span></div>
    <div class="h-fans" id="hFansW"><span id="hHeart"></span><span id="hFans">150</span></div>
  </div>
  <div class="h-row r2">
    <div class="h-money"><span id="hCoin"></span><span id="hMoney">100</span></div>
    <div class="h-heat" id="hHeat"><span id="hFire"></span><span class="bar"><u id="hHeatBar"></u></span></div>
    <div class="h-day"><span id="hDay">D1</span><i>/4</i><span class="h-clock"><u id="hClock"></u></span></div>
  </div>
  <button id="help" class="k-topbtn" aria-label="说明">?</button>`;
ui.append(hud);
$('hHeart').append(artCanvas(ART.heart, 2));
$('hCoin').append(artCanvas(ART.coin, 2));
$('hFire').append(iconCanvas('fire', 1));
const paintMute = () => {
  const b = $('mute');
  b.textContent = '';
  b.append(artCanvas(isMuted() ? ART.speakerOff : ART.speaker, 3));
};
paintMute();
$('mute').addEventListener('click', () => {
  setMuted(!isMuted());
  paintMute();
  SFX.tap();
});
let starsKey = -1;
function paintHud(): void {
  const r = S.shown.rating;
  $('hRate').textContent = r.toFixed(1);
  const half = Math.round(r * 2) / 2;
  if (half !== starsKey) {
    starsKey = half;
    const h = $('hStars');
    h.textContent = '';
    h.append(starsCanvas(half, 2));
    pop(h);
  }
  const f = Math.round(S.shown.fans);
  $('hFans').textContent = f >= 10000 ? `${(f / 1000).toFixed(1)}k` : String(f);
  $('hMoney').textContent = `$${Math.round(S.shown.money)}`;
  $('hHeatBar').style.width = `${Math.round(S.heat * 100)}%`;
  $('hHeat').classList.toggle('hot', S.heat > 0.5);
  $('hDay').textContent = `D${S.day}`;
  $('hClock').style.left = `${Math.round(Math.min(1, S.t / DAY_LEN) * 69)}px`;
}
/** 数字滚到新值（跳一下） */
function bump(k: 'rating' | 'fans' | 'money', id: string): void {
  const to = k === 'rating' ? rating() : k === 'fans' ? S.fans : S.money;
  const from = S.shown[k];
  if (Math.abs(to - from) < 0.001) return;
  tween(from, to, 600, (v) => {
    S.shown[k] = v;
  });
  pop($(id));
}

/* ---------------- 取景框 ---------------- */

const vf = el('div', '', '<i></i><i></i><i></i><i></i><b></b><em>拖动取景</em>');
vf.id = 'vf';
ui.append(vf);
const VF = { x: 120, y: 120, w: 150, h: 66 };
function placeVf(): void {
  const H = scene.host.clientHeight;
  VF.x = Math.max(0, Math.min(scene.host.clientWidth - VF.w, VF.x));
  VF.y = Math.max(64, Math.min(H - VF.h - 4, VF.y));
  vf.style.transform = `translate(${Math.round(VF.x)}px,${Math.round(VF.y)}px)`;
}
{
  let d: { px: number; py: number; x: number; y: number } | null = null;
  vf.addEventListener('pointerdown', (e) => {
    d = { px: e.clientX, py: e.clientY, x: VF.x, y: VF.y };
    vf.setPointerCapture(e.pointerId);
    vf.classList.add('drag');
    SFX.pick();
    buzz(8);
  });
  vf.addEventListener('pointermove', (e) => {
    if (!d) return;
    VF.x = d.x + e.clientX - d.px;
    VF.y = d.y + e.clientY - d.py;
    placeVf();
  });
  const up = () => {
    if (!d) return;
    d = null;
    vf.classList.remove('drag');
    SFX.drop();
  };
  vf.addEventListener('pointerup', up);
  vf.addEventListener('pointercancel', up);
  // 在场景空白处按下：取景框直接跳过去（拇指不用先找框）
  scene.host.addEventListener('pointerdown', (e) => {
    if (S.mode !== 'photo' || e.target !== scene.world.view.canvas) return;
    const r = scene.host.getBoundingClientRect();
    VF.x = e.clientX - r.left - VF.w / 2;
    VF.y = e.clientY - r.top - VF.h / 2;
    placeVf();
    d = { px: e.clientX, py: e.clientY, x: VF.x, y: VF.y };
    vf.setPointerCapture(e.pointerId);
    vf.classList.add('drag');
    SFX.pick();
    buzz(8);
  });
}

/* ---------------- 手机 ---------------- */

const ph = el('div');
ph.id = 'ph';
ph.innerHTML = `
  <canvas id="phF" width="195" height="235"></canvas>
  <div id="scr">
    <div id="pHead">
      <button class="pbtn" id="bCam" aria-label="拍照"><small>1/天</small></button>
      <div id="inbox"></div>
      <button class="pbtn" id="bShill" aria-label="买水军"><small>$60</small></button>
    </div>
    <div id="pArea"></div>
    <div id="chip"></div>
    <div id="dock"></div>
    <div id="hint"></div>
  </div>`;
ui.append(ph);
const area = $('pArea');
const dock = $('dock');
const hint = $('hint');
const chipEl = $('chip');
$('bCam').prepend(artCanvas(ART.camera, 3));
$('bShill').prepend(artCanvas(ART.bag, 3));
const handSlots = { skin: '#e8b896', sleeve: '#3a5a8a', outline: '#0b0f1a' };
const handL = artCanvas(HAND_L, 4, handSlots);
handL.className = 'hand l';
const handR = artCanvas(HAND_L, 4, handSlots, true);
handR.className = 'hand r';
ph.append(handL, handR);
drawPhoneFrame();

/** 像素手机外壳（195×235 缓冲，CSS 放大 2 倍） */
function drawPhoneFrame(): void {
  const c = $<HTMLCanvasElement>('phF');
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const R = (x: number, y: number, w: number, h: number, col: string) => {
    g.fillStyle = col;
    g.fillRect(x, y, w, h);
  };
  const ink = '#0b0f1a';
  // 外壳（上角切两级）
  R(9, 0, 177, 235, ink);
  R(7, 1, 181, 234, ink);
  R(6, 3, 183, 232, ink);
  R(9, 1, 177, 234, '#262d44');
  R(7, 3, 181, 232, '#262d44');
  R(8, 2, 179, 1, '#3d4766');
  R(7, 4, 1, 230, '#3d4766');
  R(187, 4, 1, 230, '#1a1f30');
  // 侧键
  R(4, 40, 2, 16, ink);
  R(4, 62, 2, 10, ink);
  R(189, 48, 2, 22, ink);
  // 听筒、前摄
  R(82, 3, 30, 2, ink);
  R(118, 3, 2, 2, '#4a5a8a');
  // 屏幕
  R(12, 7, 171, 228, ink);
  R(13, 8, 169, 227, '#101b30');
  // 屏幕上的反光
  for (let i = 0; i < 12; i++) R(150 + i, 9 + i, 1, 1, 'rgba(255,255,255,.06)');
}

/* ---------------- 卡片 ---------------- */

interface CardView {
  r: Review;
  el: HTMLElement;
  av: HTMLElement;
  st: HTMLElement;
  pat: HTMLElement;
  res: HTMLElement;
  photo: HTMLCanvasElement | null;
}
let card: CardView | null = null;
const photos = new Map<number, HTMLCanvasElement | null>();

function faceFor(r: Review, mood: Mood, scale: number): HTMLCanvasElement {
  const a = faceArt(r.look, mood, { hood: r.kind === 'troll', shades: r.kind === 'fake' });
  return artCanvas(a, scale, faceSlots(r.look));
}

function buildCard(r: Review): CardView {
  const c = el('div', `card${r.kind === 'blogger' ? ' blog' : ''}`);
  const av = el('div', `av k-${r.kind}`);
  av.append(faceFor(r, r.mood, 4));
  const nm = el('div', 'nm');
  nm.textContent = r.name;
  const tags = el('div', 'tags');
  const kindChip = el('span', `chipT${r.kind === 'blogger' ? ' t-blog' : ''}`);
  kindChip.textContent = r.kind === 'blogger' ? '博主 12k' : KIND_NAME[r.kind];
  tags.append(kindChip);
  if (r.kind !== 'troll') {
    const t = el('span', 'chipT');
    t.append(iconCanvas(TRAIT_ICON[r.trait] as IconName, 1));
    t.append(TRAIT_NAME[r.trait]);
    tags.append(t);
  }
  const wh = el('span', `chipT t-where${r.where ? '' : ' t-q'}`);
  wh.append(artCanvas(r.where ? ART.pin : ART.pinQ, 1));
  wh.append(r.where ? '在场里' : '场外');
  tags.append(wh);
  const st = el('div', 'st');
  st.append(starsCanvas(r.stars, 3, r.stars <= 2));
  const phEl = el('div', 'ph');
  const photo = photos.get(r.id) ?? null;
  if (photo) phEl.append(photo);
  else phEl.classList.add('none');
  const tx = el('div', 'tx');
  tx.textContent = r.text;
  const pt = el('div', 'pt', '<u></u><em>耐心</em>');
  const res = el('div', 'res');
  const sl = el('div', 'swipe l');
  sl.append(artCanvas(ART.trash, 2));
  const sr = el('div', 'swipe r');
  sr.append(artCanvas(ART.reply, 2));
  c.append(av, nm, tags, st, phEl, tx, pt, res, sl, sr);
  const v: CardView = { r, el: c, av, st, pat: pt, res, photo };
  bindDrag(v);
  return v;
}

function showFront(enter = true): void {
  if (card) card.el.remove();
  card = null;
  area.querySelector('.empty')?.remove();
  const r = S.inbox[0];
  if (!r) {
    const e = el('div', 'empty');
    e.innerHTML = '<span>没有新评论</span><span style="font-size:11px">看看场里，或者拍张照</span>';
    e.prepend(artCanvas(ART.reply, 3));
    area.append(e);
    scene.focus(null, '');
    paintInbox();
    return;
  }
  card = buildCard(r);
  area.append(card.el);
  scene.focus(r.personId, r.name.split('·').pop() ?? '');
  if (enter)
    card.el.animate(
      [
        { transform: 'translateY(-40px) scale(.9)', opacity: 0 },
        { transform: 'none', opacity: 1 },
      ],
      {
        duration: 260,
        easing: 'cubic-bezier(.2,1.4,.4,1)',
      },
    );
  paintInbox();
}

/** 收件箱里排着的卡（除了最前面那张）：头像 + 耐心条，点一下换到前面 */
function paintInbox(): void {
  const box = $('inbox');
  box.textContent = '';
  const rest = S.inbox.slice(1);
  if (!rest.length) {
    const l = el('span', 'lab');
    l.textContent = S.inbox.length ? '收件 1' : '收件 0';
    box.append(l);
    return;
  }
  for (const r of rest) {
    const b = el('button', `tab${r.kind === 'blogger' ? ' blog' : ''}`);
    b.type = 'button';
    (b as HTMLElement & { _r?: Review })._r = r;
    b.append(faceFor(r, r.mood, 2));
    const p = el('span', 'pat', '<u></u>');
    b.append(p);
    b.addEventListener('click', () => {
      if (S.mode !== 'cards' || drag) return;
      const i = S.inbox.indexOf(r);
      if (i <= 0) return;
      S.inbox.splice(i, 1);
      S.inbox.unshift(r);
      SFX.tap();
      buzz(6);
      showFront();
    });
    box.append(b);
  }
}
function paintPatience(): void {
  if (card) {
    const r = card.r;
    const k = Math.max(0, r.patience / r.maxPatience);
    (card.pat.firstElementChild as HTMLElement).style.width = `${Math.round(k * 100)}%`;
    card.pat.classList.toggle('low', k < 0.3);
  }
  for (const b of $('inbox').children) {
    const r = (b as HTMLElement & { _r?: Review })._r;
    if (!r) continue;
    const k = Math.max(0, r.patience / r.maxPatience);
    const u = b.querySelector('.pat u') as HTMLElement | null;
    if (u) u.style.width = `${Math.round(k * 100)}%`;
    b.classList.toggle('low', k < 0.3);
  }
}

/* ---------------- 底部图标 ---------------- */

interface DockItem {
  id: string;
  art: ArtName | IconName;
  label: string;
  cost?: number;
  act: () => void;
}
let dockItems: { d: DockItem; b: HTMLButtonElement }[] = [];
function setDock(items: DockItem[], hintHtml: string, back?: () => void): void {
  dock.textContent = '';
  dockItems = items.map((d, i) => {
    const b = el('button', `dk pop${d.id === 'shutter' ? ' shut' : ''}${d.id === 'cancel' ? ' ghost' : ''}`);
    b.type = 'button';
    b.style.animationDelay = `${i * 40}ms`;
    b.append(d.art in ART ? artCanvas(ART[d.art as ArtName], 3) : iconCanvas(d.art as IconName, 3));
    const s = el('span', '', d.label + (d.cost ? ` <b>$${d.cost}</b>` : ''));
    b.append(s);
    b.addEventListener('pointerdown', () => {
      b.classList.add('down');
      SFX.tap();
      buzz(6);
    });
    const off = () => b.classList.remove('down');
    b.addEventListener('pointerup', off);
    b.addEventListener('pointerleave', off);
    b.addEventListener('click', () => {
      if (drag) return;
      d.act();
    });
    dock.append(b);
    return { d, b };
  });
  hint.innerHTML = hintHtml;
  if (back) {
    const bb = el('button', '', '← 返回');
    bb.type = 'button';
    bb.addEventListener('click', () => {
      SFX.tap();
      back();
    });
    hint.append(bb);
  }
}

const ACTS: DockItem[] = [
  { id: 'reply', art: 'reply', label: '回复', act: () => openTones() },
  { id: 'trial', art: 'gift', label: '体验课', cost: COST.trial, act: () => act('trial') },
  { id: 'report', art: 'flag', label: '举报', act: () => act('report') },
  { id: 'ignore', art: 'trash', label: '无视', act: () => act('ignore') },
];
const TONES: DockItem[] = [
  { id: 'sorry', art: 'ticket', label: '道歉券', cost: COST.sorry, act: () => act('sorry') },
  { id: 'explain', art: 'heartTalk', label: '真诚', act: () => act('explain') },
  { id: 'sass', art: 'fist', label: '怼回去', act: () => act('sass') },
  { id: 'cute', art: 'cat', label: '卖萌', act: () => act('cute') },
];
function cardsDock(): void {
  S.mode = 'cards';
  setDock(ACTS, '拖卡到图标 · 右滑回复 · 左滑无视');
}
function openTones(): void {
  if (!card || S.mode !== 'cards') return;
  S.mode = 'tone';
  SFX.whoosh();
  setDock(TONES, '', () => cardsDock());
}

/* ---------------- 拖卡 ---------------- */

let drag: { v: CardView; id: number; x0: number; y0: number; dx: number; dy: number; hot: number } | null = null;
function bindDrag(v: CardView): void {
  const c = v.el;
  c.addEventListener('pointerdown', (e) => {
    if (drag || (S.mode !== 'cards' && S.mode !== 'tone') || S.phase !== 'play') return;
    drag = { v, id: e.pointerId, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0, hot: -1 };
    c.setPointerCapture(e.pointerId);
    c.classList.add('lift');
    c.style.transition = 'none';
    c.style.transform = 'scale(1.04) rotate(-1deg)';
    SFX.pick();
    buzz(8);
  });
  c.addEventListener('pointermove', (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    drag.dx = e.clientX - drag.x0;
    drag.dy = e.clientY - drag.y0;
    const rot = Math.max(-12, Math.min(12, drag.dx / 12));
    const near = hotAt(e.clientX, e.clientY);
    const k = near >= 0 ? 0.42 : 1.04;
    // 停在图标上方时卡缩小、浮到图标上面，不挡住亮起来的图标
    const lift = near >= 0 ? -78 : 0;
    c.style.transform = `translate(${drag.dx}px,${drag.dy + lift}px) rotate(${near >= 0 ? 0 : rot}deg) scale(${k})`;
    if (near !== drag.hot) {
      if (drag.hot >= 0) dockItems[drag.hot]?.b.classList.remove('hot');
      if (near >= 0) {
        dockItems[near]?.b.classList.add('hot');
        sfx({ f: 880, dur: 0.03, vol: 0.06 });
        buzz(5);
      }
      drag.hot = near;
    }
    const sw = near < 0 && drag.dy > -60 ? drag.dx : 0;
    (c.querySelector('.swipe.l') as HTMLElement).style.opacity = String(Math.max(0, Math.min(1, -sw / 90)));
    (c.querySelector('.swipe.r') as HTMLElement).style.opacity = String(
      S.mode === 'cards' ? Math.max(0, Math.min(1, sw / 90)) : 0,
    );
  });
  const end = (e: PointerEvent) => {
    if (!drag || drag.id !== e.pointerId) return;
    const d = drag;
    drag = null;
    c.classList.remove('lift');
    for (const it of dockItems) it.b.classList.remove('hot');
    (c.querySelector('.swipe.l') as HTMLElement).style.opacity = '0';
    (c.querySelector('.swipe.r') as HTMLElement).style.opacity = '0';
    if (e.type === 'pointerup' && d.hot >= 0) {
      const it = dockItems[d.hot] as { d: DockItem; b: HTMLButtonElement };
      dropInto(v, it.b, () => it.d.act());
      return;
    }
    if (e.type === 'pointerup' && Math.abs(d.dx) > 90 && Math.abs(d.dy) < 110) {
      if (d.dx < 0) {
        flyOff(v, -1, () => act('ignore'));
        return;
      }
      if (S.mode === 'cards') {
        springBack(v);
        openTones();
        return;
      }
    }
    springBack(v);
  };
  c.addEventListener('pointerup', end);
  c.addEventListener('pointercancel', end);
}
function hotAt(x: number, y: number): number {
  for (let i = 0; i < dockItems.length; i++) {
    const r = dockItems[i]?.b.getBoundingClientRect();
    if (r && x > r.left - 10 && x < r.right + 10 && y > r.top - 18 && y < r.bottom + 10) return i;
  }
  return -1;
}
function springBack(v: CardView): void {
  v.el.style.transition = 'transform .28s cubic-bezier(.2,1.5,.4,1)';
  v.el.style.transform = 'none';
  SFX.drop();
}
function dropInto(v: CardView, b: HTMLElement, then: () => void): void {
  const r = b.getBoundingClientRect();
  const cr = v.el.getBoundingClientRect();
  const m = (v.el.style.transform.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/) ?? []) as string[];
  const tx = Number(m[1] ?? 0) + (r.left + r.width / 2 - (cr.left + cr.width / 2));
  const ty = Number(m[2] ?? 0) + (r.top + r.height / 2 - (cr.top + cr.height / 2));
  v.el.style.transition = 'transform .12s ease-in';
  v.el.style.transform = `translate(${tx}px,${ty}px) scale(.3)`;
  SFX.drop();
  buzz(12);
  pop(b);
  setTimeout(() => {
    v.el.style.transition = 'transform .2s cubic-bezier(.2,1.4,.4,1)';
    v.el.style.transform = 'none';
    then();
  }, 120);
}
function flyOff(v: CardView, dir: number, then: () => void): void {
  v.el.style.transition = 'transform .2s ease-in';
  v.el.style.transform = `translate(${dir * 420}px,30px) rotate(${dir * 20}deg)`;
  SFX.whoosh();
  setTimeout(then, 160);
}

/* ---------------- 处理评论 ---------------- */

function act(a: Act): void {
  if (!card || (S.mode !== 'cards' && S.mode !== 'tone') || S.phase !== 'play') return;
  resolve(card.r, a);
}

function resolve(r: Review, a: Act): boolean {
  const o = outcome(world(), r, a);
  if (o.cost > S.money) {
    floatText(ui, 195, 600, '钱不够！', { kind: 'bad' });
    shake(ph);
    SFX.bad();
    buzz([20, 40, 20]);
    return false;
  }
  const idx = S.inbox.indexOf(r);
  if (idx < 0) return false;
  const isFront = idx === 0 && card?.r === r && S.mode !== 'photo';
  S.inbox.splice(idx, 1);
  if (isFront) S.mode = 'busy';
  // 数值
  if (o.cost) {
    S.money -= o.cost;
    S.ds.spent += o.cost;
    floatText(ui, 96, 78, `-$${o.cost}`, { kind: 'bad', rise: 20 });
    bump('money', 'hMoney');
  }
  if (a === 'sorry') S.stats.coupons++;
  if (a === 'trial') S.stats.trials++;
  if (a === 'sass') S.stats.sass++;
  if (a === 'ignore') S.stats.ignores++;
  if (a === 'sorry' || a === 'explain' || a === 'sass' || a === 'cute') S.stats.replies++;
  const before = r.stars;
  if (o.remove) S.entries = S.entries.filter((e) => e !== r.entry);
  else r.entry.stars = o.stars;
  for (let i = 0; i < (o.extra ?? 0); i++) S.entries.push({ stars: 1, w: 1 });
  if (o.fans) {
    S.fans = Math.max(10, S.fans + o.fans);
    floatText(ui, 300, 78, `${o.fans > 0 ? '+' : ''}${o.fans}粉`, {
      kind: o.fans > 0 ? 'gold' : 'bad',
      rise: 26,
    });
    bump('fans', 'hFans');
  }
  bump('rating', 'hRate');
  if (o.caught) {
    S.stats.caught++;
    if (S.stats.caught === 2)
      later(1.2, () => {
        S.fans += 500;
        S.heat = 1;
        bump('fans', 'hFans');
        news('La Quinta 雇托刷差评', '总监连抓两个托儿，粉丝 +500', false);
      });
  }
  if (o.wrongReport) S.stats.wrongReports++;
  if (o.again)
    later(10, () => {
      const t = genReview(world(), rating(), { kind: 'troll' }, S.nid++);
      t.text = S.rand() < 0.5 ? '总监你急了' : '券呢？券呢？';
      offScene(t);
    });
  if (o.regulars) for (let i = 0; i < o.regulars; i++) later(2 + i * 1.5, () => scene.spawnVisitor({ regular: true }));
  if (o.tone === 'viral') {
    S.stats.viral++;
    S.heat = 1;
    banner('爆了！', false);
    SFX.fanfare();
    flash(phone, '#ffe08a');
  } else if (o.tone === 'boom') {
    S.stats.disasters++;
    S.disasters++;
    banner('搞砸了…', true);
    shake(phone);
    SFX.bad();
    buzz([30, 30, 60]);
  } else if (o.tone === 'good') SFX.coin();
  else if (o.tone === 'bad') {
    SFX.bad();
    shake(ph);
  } else SFX.tap();
  if (o.headline) {
    const hl = o.headline;
    later(0.8, () => news(hl[0], hl[1], true));
  }
  scene.react(r.personId, o.tone);
  const actor = scene.byId(r.personId);
  if (r.kind === 'blogger' && actor) scene.leave(actor);
  r.stars = o.stars;
  r.mood = o.mood;
  showChip(o, o.stars - before, a);
  // 画面：卡上换脸、翻星、结果条，然后飞走
  if (isFront && card) {
    const v = card;
    v.av.textContent = '';
    v.av.append(faceFor(r, o.mood, 4));
    pop(v.av);
    v.st.textContent = '';
    v.st.append(starsCanvas(o.remove ? 0 : o.stars, 3, o.stars <= 2));
    if (o.stars !== before) {
      pop(v.st);
      for (let i = 0; i < Math.abs(o.stars - before); i++)
        sfx({ f: o.stars > before ? 1046 + i * 120 : 300 - i * 40, dur: 0.05, at: 0.08 * i, vol: 0.08 });
    }
    v.res.className = `res on ${o.tone}`;
    v.res.textContent = o.remove ? '已删除' : a === 'expire' ? '没回' : o.tone === 'viral' ? '爆了！' : resultWord(o);
    if (o.tone === 'viral') v.el.classList.add('viral');
    const hold = a === 'ignore' || a === 'expire' ? 650 : 1100;
    setTimeout(() => {
      const dir = o.tone === 'good' || o.tone === 'viral' ? 'up' : o.tone === 'meh' ? 'side' : 'down';
      v.el.style.transition = 'transform .25s ease-in, opacity .25s';
      v.el.style.transform =
        dir === 'up'
          ? 'translateY(-160px) scale(.6)'
          : dir === 'side'
            ? 'translateX(-380px)'
            : 'translateY(220px) rotate(8deg)';
      v.el.style.opacity = '0';
      setTimeout(() => {
        if (S.mode === 'busy') cardsDock();
        showFront();
      }, 230);
    }, hold);
  } else paintInbox();
  return true;
}
function resultWord(o: Outcome): string {
  return o.tone === 'good' ? '改观了' : o.tone === 'bad' ? '更气了' : o.tone === 'boom' ? '翻车' : '没变化';
}

/** 原因条：因为什么 → 结果 */
let chipTimer = 0;
function showChip(o: Outcome, dStars: number, a: Act): void {
  const c = el('div', `c ${o.tone}`);
  const ic: IconName = o.tone === 'viral' ? 'fire' : o.tone === 'good' ? 'heart' : o.tone === 'meh' ? 'ques' : 'anger';
  c.append(iconCanvas(a === 'expire' ? 'zzz' : ic, 2));
  c.append(o.why);
  const parts: string[] = [];
  if (o.remove) parts.push('<b class="pos">删除</b>');
  else if (dStars) parts.push(`<b class="${dStars > 0 ? 'pos' : 'neg'}">${dStars > 0 ? '+' : ''}${dStars}★</b>`);
  if (o.fans) parts.push(`<b class="${o.fans > 0 ? 'pos' : 'neg'}">${o.fans > 0 ? '+' : ''}${o.fans}粉</b>`);
  if (o.extra) parts.push(`<b class="neg">+${o.extra}条一星</b>`);
  if (o.regulars) parts.push(`<b class="pos">+${o.regulars}回头客</b>`);
  if (!parts.length) parts.push('<b>没变化</b>');
  c.insertAdjacentHTML('beforeend', ` → ${parts.slice(0, 2).join(' ')}`);
  chipEl.textContent = '';
  chipEl.append(c);
  clearTimeout(chipTimer);
  chipTimer = window.setTimeout(() => {
    chipEl.textContent = '';
  }, 2600);
}

/* ---------------- 评论从场景里冒出来 ---------------- */

function spawnReview(spec: GenSpec): void {
  if (S.phase !== 'play') return;
  if (S.inbox.length + inflight >= INBOX_MAX) {
    later(5, () => spawnReview(spec));
    return;
  }
  const r = genReview(world(), rating(), spec, S.nid++);
  if (r.kind === 'troll' || r.kind === 'fake') {
    offScene(r);
    return;
  }
  const stand = TOPIC_STAND[r.topic] ?? null;
  const good = r.stars >= 4;
  inflight++;
  const go = (a: Actor) => {
    r.look = a.look;
    r.personId = a.id;
    r.where = stand ?? a.stand;
    scene.write(a, r.topic === 'dog' ? null : stand, good, (at) => deliver(r, at));
  };
  if (r.kind === 'blogger') {
    const b = scene.spawnVisitor({ blogger: true, regular: true });
    b.onArrive = () => go(b);
    floatText(ui, 195, 110, '博主来了！12k 粉丝', { kind: 'gold', ms: 1600, rise: 20 });
    sfx({ f: 660, dur: 0.08 }, { f: 990, dur: 0.12, at: 0.09 });
    return;
  }
  const a = scene.writer(stand) ?? scene.spawnVisitor({ inside: true, at: stand ?? undefined });
  go(a);
}

/** 托儿、喷子：场里没这个人，评论从岛外飞进来 */
function offScene(r: Review): void {
  if (S.inbox.length + inflight >= INBOX_MAX) {
    later(5, () => offScene(r));
    return;
  }
  const look = {
    skin: (['#f1c7a1', '#c48a62', '#e8b896', '#7a4a32'] as const)[Math.floor(S.rand() * 4)] as string,
    hair: (['#1c1712', '#a7742f', '#3b2a1e'] as const)[Math.floor(S.rand() * 3)] as string,
    shirt: (['#7a7f86', '#c8553d', '#2e86a6'] as const)[Math.floor(S.rand() * 3)] as string,
    hairStyle: (['short', 'cap', 'long', 'curly'] as const)[Math.floor(S.rand() * 4)],
    cap: '#2a2a2a',
  };
  r.look = look;
  r.personId = null;
  r.where = null;
  const fromLeft = r.kind === 'fake';
  const at = { x: fromLeft ? -20 : 410, y: 90 + S.rand() * 80 };
  inflight++;
  deliver(r, at);
}

function deliver(r: Review, at: { x: number; y: number }): void {
  if (S.phase !== 'play' && S.phase !== 'summary') {
    inflight = Math.max(0, inflight - 1);
    return;
  }
  // 照片：照的就是场景里那个地方（渲染器的实时画面）
  let photo: HTMLCanvasElement | null = null;
  if (r.kind === 'fake') {
    if (S.rand() < 0.7) photo = artCanvas(ART.grassCourt, 4);
  } else if (r.kind !== 'troll') {
    const c = r.topic === 'fake' ? null : scene.topicAt(r.topic);
    if (c) {
      photo = document.createElement('canvas');
      photo.width = 76;
      photo.height = 48;
      // 缓冲 76×48 像素（屏幕上 152×96），显示也是 2 倍，和场景同样大的像素
      scene.drawCrop(photo.getContext('2d') as CanvasRenderingContext2D, c.x, c.y, 152, 96, 76, 48);
      sized(photo, 2);
    }
  }
  photos.set(r.id, photo);
  r.maxPatience = r.kind === 'blogger' ? PATIENCE * 0.8 : PATIENCE;
  r.patience = r.maxPatience;
  // 小卡沿弧线飞进手机
  const f = artCanvas(bubbleArt(r.stars >= 4), 3);
  f.className = 'flyer';
  ui.append(f);
  const box = $('inbox').getBoundingClientRect();
  const pr = phone.getBoundingClientRect();
  const tx = box.left - pr.left + box.width / 2 - 21;
  const ty = box.top - pr.top + 4;
  const mx = (at.x + tx) / 2 + (at.x < 195 ? 60 : -60);
  const my = Math.min(at.y, ty) - 60;
  f.animate(
    [
      { transform: `translate(${at.x - 21}px,${at.y - 30}px) scale(.6)` },
      { transform: `translate(${mx}px,${my}px) scale(1.1)`, offset: 0.45 },
      { transform: `translate(${tx}px,${ty}px) scale(.7)` },
    ],
    { duration: 650, easing: 'cubic-bezier(.4,0,.6,1)' },
  ).onfinish = () => {
    f.remove();
    inflight = Math.max(0, inflight - 1);
    S.inbox.push(r);
    S.entries.push(r.entry);
    bump('rating', 'hRate');
    if (r.expose) exposeShill();
    SFX.buzz();
    buzz([10, 30, 10]);
    shake(ph);
    if (!card && S.mode === 'cards') showFront();
    else {
      paintInbox();
      const tabs = $('inbox').querySelectorAll('.tab');
      tabs[tabs.length - 1]?.classList.add('in');
    }
  };
  SFX.whoosh();
}

/** 博主扒出水军：水军好评全删、+6 条一星、粉丝掉四成、上报纸 */
function exposeShill(): void {
  S.exposed = true;
  S.entries = S.entries.filter((e) => !e.shill);
  for (let i = 0; i < 6; i++) S.entries.push({ stars: 1, w: 1 });
  S.fans = Math.round(S.fans * 0.6);
  bump('fans', 'hFans');
  bump('rating', 'hRate');
  S.disasters++;
  S.stats.disasters++;
  later(0.3, () => news('Palm Oasis 刷好评被扒！', '水军好评全下架，粉丝掉了四成', true));
}

/* ---------------- 照片 ---------------- */

let prevCanvas: HTMLCanvasElement | null = null;
let liveTags: Tag[] = [];
function openPhoto(): void {
  if (S.posted || S.phase !== 'play' || (S.mode !== 'cards' && S.mode !== 'tone')) {
    if (S.posted) floatText(ui, 50, 420, '今天拍过了', { kind: 'bad', rise: 20 });
    return;
  }
  S.mode = 'photo';
  SFX.whoosh();
  if (card) card.el.style.visibility = 'hidden';
  area.querySelector('.empty')?.remove();
  vf.classList.add('on');
  scene.world.camera.enabled = false;
  scene.setMarkersHidden(true);
  placeVf();
  prevCanvas = document.createElement('canvas');
  // 取景框 150×66 CSS = 75×33 缓冲像素，手机里放大 4 倍（300×132）
  prevCanvas.width = VF.w / 2;
  prevCanvas.height = VF.h / 2;
  prevCanvas.id = 'pPrev';
  const tags = el('div');
  tags.id = 'pTags';
  area.append(prevCanvas, tags);
  setDock(
    [
      { id: 'cancel', art: 'trash', label: '不拍了', act: () => closePhoto() },
      { id: 'shutter', art: 'shutter', label: '拍！发帖', act: () => shoot() },
    ],
    '拖取景框 · 日落、狗、小孩加分',
  );
}
function closePhoto(): void {
  vf.classList.remove('on');
  scene.world.camera.enabled = true;
  scene.setMarkersHidden(false);
  prevCanvas = null;
  $('pPrev')?.remove();
  $('pTags')?.remove();
  $('pPost')?.remove();
  if (card) card.el.style.visibility = '';
  cardsDock();
  showFront(false);
}
function paintPreview(): void {
  if (!prevCanvas) return;
  const g = prevCanvas.getContext('2d') as CanvasRenderingContext2D;
  scene.drawCrop(g, VF.x + VF.w / 2, VF.y + VF.h / 2, VF.w, VF.h, prevCanvas.width, prevCanvas.height);
  const t = scene.photoTags({ x: VF.x, y: VF.y, w: VF.w, h: VF.h }, minute());
  const key = t.map((x) => x.id).join();
  if (key !== liveTags.map((x) => x.id).join()) {
    liveTags = t;
    const box = $('pTags');
    if (!box) return;
    box.textContent = '';
    if (!t.length) box.append(el('span', 'tagP zero', '空镜头 0'));
    for (const x of t)
      box.append(el('span', `tagP${x.pts < 0 ? ' neg' : ''}`, `${x.label} ${x.pts > 0 ? '+' : ''}${x.pts}`));
    const sum = t.reduce((s, x) => s + x.pts, 0);
    box.append(el('span', 'tagP sum', `= ${sum}`));
    if (t.length) sfx({ f: sum >= 0 ? 1320 : 220, dur: 0.03, vol: 0.05 });
  }
}
function shoot(): void {
  if (S.mode !== 'photo' || !prevCanvas) return;
  const tags = liveTags;
  const s = tags.reduce((a, x) => a + x.pts, 0);
  S.posted = true;
  S.stats.posts++;
  S.stats.best = Math.max(S.stats.best, s);
  flash(phone, '#ffffff');
  sfx({ f: 2000, dur: 0.02, vol: 0.08 }, { f: 400, f2: 200, dur: 0.06, type: 'triangle', at: 0.02 });
  buzz(20);
  const shot = prevCanvas;
  prevCanvas = null;
  vf.classList.remove('on');
  scene.setMarkersHidden(false);
  $('pPrev')?.remove();
  $('pTags')?.remove();
  const tagsTxt = tags.filter((t) => t.pts > 0).map((t) => t.label);
  const bad = tags.some((t) => t.pts < 0);
  let likes: number;
  let fans: number;
  let line: string;
  if (s >= 7) {
    likes = 800 + Math.floor(S.rand() * 700);
    fans = 500 + Math.floor(S.rand() * 500);
    line = tags.some((t) => t.id === 'dog') ? '狗狗！求地址' : '这日落我哭了';
  } else if (s >= 3) {
    likes = 60 + Math.floor(S.rand() * 140);
    fans = 60 + Math.floor(S.rand() * 120);
    line = tags.some((t) => t.id === 'kids') ? '小朋友好认真' : '好想去打球';
  } else if (s >= 0) {
    likes = 5 + Math.floor(S.rand() * 25);
    fans = 5;
    line = '拍的啥？';
  } else {
    likes = 1 + Math.floor(S.rand() * 5);
    fans = -Math.round(Math.max(20, S.fans * 0.08));
    line = tags.some((t) => t.id === 'sand') ? '这是沙滩吧？' : '喷泉能养鱼了';
  }
  S.fans = Math.max(10, S.fans + fans);
  bump('fans', 'hFans');
  floatText(ui, 300, 78, `${fans > 0 ? '+' : ''}${fans}粉`, { kind: fans > 0 ? 'gold' : 'bad', rise: 26 });
  const post = el('div');
  post.id = 'pPost';
  shot.style.width = `${shot.width * 3}px`;
  shot.style.height = `${shot.height * 3}px`;
  shot.style.imageRendering = 'pixelated';
  shot.removeAttribute('id');
  post.append(shot);
  const lk = el('div', 'lk');
  lk.append(artCanvas(ART.heart, 3));
  const n = el('span', '', '0');
  lk.append(n);
  post.append(lk);
  post.append(el('div', 'cm', line));
  area.append(post);
  tween(0, likes, 1200, (v) => {
    n.textContent = String(Math.round(v));
  });
  const o: Outcome = {
    stars: 0,
    fans,
    cost: 0,
    mood: 'happy',
    tone: s >= 7 ? 'viral' : s >= 3 ? 'good' : s >= 0 ? 'meh' : 'bad',
    why:
      s < 0
        ? bad
          ? '拍到了脏东西'
          : '没拍好'
        : tagsTxt.length
          ? `${tagsTxt.slice(0, 2).join('+')}好看`
          : '没什么看头',
  };
  showChip(o, 0, 'explain');
  if (s >= 7) {
    S.heat = 1;
    S.stats.viral++;
    banner('爆了！', false);
    SFX.fanfare();
  } else if (s < 0) {
    SFX.bad();
    shake(ph);
  } else SFX.coin();
  S.mode = 'busy';
  dock.textContent = '';
  later(
    2.2 / FAST,
    () => {
      $('pPost')?.remove();
      closePhoto();
    },
    true,
  );
}

/* ---------------- 水军、修设施 ---------------- */

let shillArmed = 0;
$('bShill').addEventListener('click', () => {
  if (S.phase !== 'play') return;
  const b = $('bShill');
  if (!shillArmed) {
    shillArmed = window.setTimeout(() => {
      shillArmed = 0;
      b.classList.remove('armed');
      (b.querySelector('small') as HTMLElement).textContent = '$60';
    }, 2200);
    b.classList.add('armed');
    (b.querySelector('small') as HTMLElement).textContent = '再点';
    SFX.tap();
    buzz(6);
    return;
  }
  clearTimeout(shillArmed);
  shillArmed = 0;
  b.classList.remove('armed');
  (b.querySelector('small') as HTMLElement).textContent = '$60';
  if (S.money < COST.shill) {
    floatText(ui, 340, 420, '钱不够', { kind: 'bad' });
    SFX.bad();
    return;
  }
  S.money -= COST.shill;
  S.ds.spent += COST.shill;
  S.shill++;
  for (let i = 0; i < 6; i++) S.entries.push({ stars: 5, w: 1, shill: true });
  bump('money', 'hMoney');
  bump('rating', 'hRate');
  floatText(ui, 96, 78, `-$${COST.shill}`, { kind: 'bad' });
  floatText(ui, 130, 100, '+6 条五星', { kind: 'gold' });
  showChip({ stars: 0, fans: 0, cost: 60, mood: 'smug', tone: 'meh', why: '博主可能扒出来' }, 0, 'explain');
  SFX.bigCoin();
  buzz(15);
});
$('bCam').addEventListener('click', () => openPhoto());

function fixTap(spot: Spot): void {
  if (S.phase !== 'play') return;
  const at = scene.topicAt(spot) ?? { x: 195, y: 200 };
  if (scene.fixing) {
    floatText(ui, at.x, at.y - 50, 'Rosa 在忙', { kind: 'bad', rise: 18 });
    SFX.bad();
    return;
  }
  if (S.money < COST.fix) {
    floatText(ui, at.x, at.y - 50, '钱不够', { kind: 'bad', rise: 18 });
    SFX.bad();
    return;
  }
  S.money -= COST.fix;
  S.ds.spent += COST.fix;
  bump('money', 'hMoney');
  floatText(ui, at.x, at.y - 50, `-$${COST.fix}`, { kind: 'bad', rise: 18 });
  SFX.pick();
  buzz(10);
  scene.startFix(spot, 14, (s) => {
    S.stats.fixes++;
    S.ds.fixes.push(s === 'sand' ? '匹克球场挖出来了' : '喷泉清好了');
    const p = scene.topicAt(s) ?? at;
    floatText(ui, p.x, p.y - 40, s === 'sand' ? '沙扫干净了！' : '喷泉清好了！', { kind: 'gold', rise: 24 });
    SFX.fanfare();
    showChip(
      { stars: 0, fans: 0, cost: 0, mood: 'happy', tone: 'good', why: s === 'sand' ? '沙没了' : '喷泉清了' },
      0,
      'explain',
    );
    chipEl.querySelector('.c')?.insertAdjacentHTML('beforeend', ' <b class="pos">少差评</b>');
  });
}

/* ---------------- 新闻、大字 ---------------- */

const newsEl = el('div', '', '<div class="m">沙 漠 日 报</div><div class="h"></div><div class="s"></div>');
newsEl.id = 'news';
ui.append(newsEl);
let newsT = 0;
function news(h: string, s: string, bad: boolean): void {
  (newsEl.querySelector('.h') as HTMLElement).textContent = h;
  (newsEl.querySelector('.s') as HTMLElement).textContent = s;
  newsEl.classList.remove('on');
  void newsEl.offsetWidth;
  newsEl.classList.add('on');
  clearTimeout(newsT);
  newsT = window.setTimeout(() => newsEl.classList.remove('on'), 2800);
  if (bad) {
    shake(phone);
    SFX.bad();
  } else SFX.fanfare();
}
const bannerEl = el('div', '', '<div></div>');
bannerEl.id = 'banner';
ui.append(bannerEl);
let bannerT = 0;
function banner(t: string, bad: boolean): void {
  (bannerEl.firstElementChild as HTMLElement).textContent = t;
  bannerEl.className = bad ? 'bad' : '';
  void bannerEl.offsetWidth;
  bannerEl.classList.add('on');
  clearTimeout(bannerT);
  bannerT = window.setTimeout(() => bannerEl.classList.remove('on'), 1300);
}

/* ---------------- 日程 ---------------- */

/** 游戏时间里延后执行（暂停时不走）；real = 按真实秒 */
const realLater: { at: number; f: () => void }[] = [];
function later(sec: number, f: () => void, real = false): void {
  if (real) realLater.push({ at: performance.now() / 1000 + sec, f });
  else S.sched.push({ t: S.t + sec, f });
}

function rk(): GenSpec {
  const x = S.rand();
  const kind: Kind = x < 0.42 ? 'member' : x < 0.76 ? 'tourist' : x < 0.88 ? 'troll' : 'fake';
  return { kind };
}
function worstSpot(): GenSpec {
  if (!scene.fixed.sand) return { kind: 'blogger', sent: 'bad', topic: 'sand' };
  if (!scene.fixed.fountain) return { kind: 'blogger', sent: 'bad', topic: 'fountain' };
  return { kind: 'blogger', sent: 'bad', topic: 'slow' };
}
function startDay(d: number): void {
  S.day = d;
  S.t = 0;
  S.posted = false;
  S.phase = 'play';
  S.ds = { in: 0, out: 0, income: 0, spent: 0, fans0: S.fans, rating0: rating(), fixes: [] };
  S.sched = S.sched.filter(() => false);
  const add = (t: number, f: () => void) => S.sched.push({ t: t + (S.rand() - 0.5) * 2, f });
  const R = (spec: GenSpec | (() => GenSpec)) => () => spawnReview(typeof spec === 'function' ? spec() : spec);
  if (d === 1) {
    add(4, R({ kind: 'member', sent: 'bad', topic: 'sand' }));
    add(18, R({ kind: 'tourist', sent: 'good' }));
    add(32, R({ kind: 'troll' }));
    add(46, R({ kind: 'member', sent: 'bad', topic: 'heat' }));
    add(60, R({ kind: 'tourist', sent: 'bad', topic: 'price' }));
  } else if (d === 2) {
    add(4, R(rk));
    add(14, R(worstSpot));
    add(30, R({ kind: 'fake' }));
    add(36, R({ kind: 'fake' }));
    add(50, R(rk));
    add(62, R(rk));
  } else if (d === 3) {
    add(5, R(rk));
    add(
      18,
      R(() => ({ kind: S.rand() < 0.5 ? 'troll' : 'fake' })),
    );
    add(31, R(rk));
    add(44, R({ kind: 'tourist', sent: 'good', topic: 'sunset' }));
    add(56, R({ kind: 'fake' }));
    add(64, R(rk));
  } else {
    add(4, R(rk));
    add(
      12,
      R(() => (scene.fixed.sand && S.disasters === 0 ? { kind: 'blogger', sent: 'good' } : worstSpot())),
    );
    add(28, R(rk));
    add(42, R({ kind: 'fake' }));
    add(56, R(rk));
  }
  paintHud();
}

/* ---------------- 浮层：开始、每日小结、结束、说明 ---------------- */

const modal = el('div', 'k-modal');
modal.hidden = true;
const mcard = el('div', 'k-card');
modal.append(mcard);
ui.append(modal);
function showModal(html: string, btn: string, go: () => void, top = false): void {
  mcard.innerHTML = html;
  const b = el('button', 'k-btn go primary', btn);
  b.type = 'button';
  b.addEventListener('click', () => {
    SFX.tap();
    modal.hidden = true;
    go();
  });
  mcard.append(b);
  hydrate(mcard);
  modal.style.alignItems = top ? 'flex-start' : 'flex-end';
  modal.hidden = false;
}
function row(icon: HTMLCanvasElement, label: string, val: string, why = ''): HTMLElement {
  const r = el('div', 'row');
  r.append(icon);
  r.append(el('span', 'k-label', label));
  r.append(el('span', '', val));
  if (why) r.append(el('span', 'why', why));
  return r;
}

function titleScreen(): void {
  showModal(
    `<h2>Palm Oasis 的评论区</h2>
     <p>场里的人会掏出手机写评论。<br>把卡拖到图标上回他们。</p>
     <p class="sm"><span data-art="camera"></span> 拍照发帖 · 点场景里的牌子修问题 · 4 天</p>`,
    '开工',
    () => {
      SFX.fanfare();
      startDay(1);
      cardsDock();
      showFront();
    },
  );
}
function endDay(): void {
  S.phase = 'summary';
  if (S.mode === 'photo') closePhoto();
  const ds = S.ds;
  const r1 = rating();
  const conv = Math.round(convOf(r1) * 100);
  const df = S.fans - ds.fans0;
  const more = Math.round((arriveRate(S.fans, 0) - arriveRate(ds.fans0, 0)) * DAY_LEN);
  mcard.textContent = '';
  const h = el('h2', '', `第 ${S.day} 天 · 收工`);
  const box = el('div');
  box.append(
    row(artCanvas(ART.doorIn, 2), '门口', `进 <b>${ds.in}</b> · 走 <b>${ds.out}</b>`, ''),
    row(
      starsCanvas(Math.round(r1 * 2) / 2, 1),
      '评分',
      `${ds.rating0.toFixed(1)} → <b>${r1.toFixed(1)}</b>`,
      `进门率 ${conv}%`,
    ),
    row(
      artCanvas(ART.heart, 2),
      '粉丝',
      `${df >= 0 ? '+' : ''}<b>${df}</b>`,
      more > 0 ? `明天多来 ${more} 人` : more < 0 ? `明天少来 ${-more} 人` : '来人不变',
    ),
    row(artCanvas(ART.coin, 2), '钱', `+$${ds.income} · -$${ds.spent}`, `余 $${S.money}`),
  );
  for (const fx of ds.fixes) box.append(row(iconCanvas('broom', 1), '修好', fx));
  mcard.append(h, box);
  const last = S.day >= DAYS;
  const b = el('button', 'k-btn go primary', last ? '看结果' : `第 ${S.day + 1} 天 →`);
  b.type = 'button';
  b.addEventListener('click', () => {
    SFX.tap();
    modal.hidden = true;
    if (last) endGame();
    else {
      startDay(S.day + 1);
      if (S.mode !== 'busy') cardsDock();
      showFront(false);
    }
  });
  mcard.append(b);
  modal.style.alignItems = 'flex-end';
  modal.hidden = false;
  SFX.bigCoin();
}
function endGame(): void {
  S.phase = 'end';
  const r = rating();
  const t = endTitle(S.stats, S.shill, S.exposed, r, S.fans);
  mcard.innerHTML = `<p class="k-label">四天结束 · 你的称号</p><h2>${t.title}</h2><p>${t.line}</p>
    <div class="big"><div><b>${r.toFixed(1)}</b><span>评分</span></div><div><b>${S.fans}</b><span>粉丝</span></div><div><b>$${S.money}</b><span>现金</span></div></div>
    <p class="sm">进门 ${S.stats.visitors} · 回复 ${S.stats.replies} · 爆红 ${S.stats.viral} · 翻车 ${S.stats.disasters} · 抓托 ${S.stats.caught} · 修好 ${S.stats.fixes}</p>`;
  const b = el('button', 'k-btn go primary', '再来一局');
  b.type = 'button';
  b.addEventListener('click', () => location.reload());
  mcard.append(b);
  modal.hidden = false;
  SFX.fanfare();
}
const helpEl = el('div', 'k-modal');
helpEl.hidden = true;
helpEl.style.alignItems = 'flex-start';
helpEl.style.zIndex = '90';
ui.append(helpEl);
let helpPrev: typeof S.phase = 'play';
$('help').addEventListener('click', () => {
  SFX.tap();
  if (!helpEl.hidden) {
    closeHelp();
    return;
  }
  helpPrev = S.phase;
  if (S.phase === 'play') S.phase = 'summary';
  helpEl.innerHTML = `<div class="k-card"><h2>在测什么</h2>
     <p class="sm">口碑能不能做成"看人下菜碟"的像素小判断。评论都是场景里的人写的：照片拍的就是他抱怨的地方，修好了再回最管用。</p>
     <div class="lg">
     <span data-ic="bulb"></span><span>爱讲理：真诚回复管用</span>
     <span data-ic="money"></span><span>爱实惠：道歉券最香</span>
     <span data-ic="music"></span><span>爱玩梗：怼、卖萌都接得住</span>
     <span data-ic="sweat"></span><span>玻璃心：别怼，哄</span>
     <span data-art="pinQ"></span><span>场外＝场里没这人：托儿或喷子</span>
     <span data-art="grassCourt"></span><span>草地场照片是假的</span></div>
     <p class="sm">取舍：券花钱、怼是赌、举报真人会被骂、无视让博主记仇。水军马上涨分，博主来了可能扒出来。评分决定门口进不进，粉丝决定来多少人。</p>
     <button class="k-btn go primary" type="button">知道了</button></div>`;
  hydrate(helpEl);
  (helpEl.querySelector('button') as HTMLElement).addEventListener('click', () => {
    SFX.tap();
    closeHelp();
  });
  helpEl.hidden = false;
});
function closeHelp(): void {
  helpEl.hidden = true;
  if (helpPrev === 'play' && S.phase === 'summary' && modal.hidden) S.phase = 'play';
}
/** 把 data-ic / data-art 占位换成像素图 */
function hydrate(root: HTMLElement): void {
  for (const e of root.querySelectorAll<HTMLElement>('[data-ic]')) e.append(iconCanvas(e.dataset.ic as IconName, 2));
  for (const e of root.querySelectorAll<HTMLElement>('[data-art]'))
    e.append(artCanvas(ART[e.dataset.art as ArtName], e.dataset.art === 'grassCourt' ? 1 : 2));
}

/* ---------------- 新局 ---------------- */

function newGame(): void {
  S.seed = seed0;
  S.rand = mulberry32(seed0);
  S.entries = [];
  for (const st of [1, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 3, 2, 4]) S.entries.push({ stars: st, w: 1 });
  S.fans = 150;
  S.money = 100;
  S.stats = {
    caught: 0,
    wrongReports: 0,
    viral: 0,
    disasters: 0,
    coupons: 0,
    trials: 0,
    posts: 0,
    best: 0,
    replies: 0,
    sass: 0,
    ignores: 0,
    fixes: 0,
    visitors: 0,
    turned: 0,
  };
  S.shown = { rating: rating(), fans: S.fans, money: S.money };
  for (let i = 0; i < 5; i++) scene.spawnVisitor({ inside: true });
  paintHud();
  showFront(false);
  setDock(ACTS, '拖卡到图标 · 右滑回复 · 左滑无视');
}

/* ---------------- 主循环 ---------------- */

let last = performance.now();
let now = 0;
function frame(ts: number): void {
  requestAnimationFrame(frame);
  const rdt = Math.min(0.05, (ts - last) / 1000);
  last = ts;
  const dt = rdt * FAST;
  now += dt;
  if (S.phase === 'play') {
    S.t += dt;
    for (let i = S.sched.length - 1; i >= 0; i--) {
      const e = S.sched[i] as Sched;
      if (e.t <= S.t) {
        S.sched.splice(i, 1);
        e.f();
      }
    }
    // 门口来人
    if (S.t < DAY_LEN * 0.94) {
      S.acc += dt * arriveRate(S.fans, S.heat);
      if (S.acc >= 1) {
        S.acc -= 1;
        if (scene.actors.length < 18) scene.spawnVisitor();
      }
    }
    S.heat = Math.max(0, S.heat - dt * 0.02);
    // 耐心
    for (const r of [...S.inbox]) {
      r.patience -= dt;
      if (r.patience > 0) continue;
      const front = S.inbox[0] === r;
      if (front && (S.mode === 'busy' || drag)) continue;
      resolve(r, 'expire');
    }
    if (S.t >= DAY_LEN && S.mode !== 'busy' && !drag) endDay();
  }
  const tr = performance.now() / 1000;
  for (let i = realLater.length - 1; i >= 0; i--) {
    const e = realLater[i] as { at: number; f: () => void };
    if (e.at <= tr) {
      realLater.splice(i, 1);
      e.f();
    }
  }
  scene.update(dt, now, S.phase === 'title' ? 9 * 60 : minute());
  paintPreview();
  paintPatience();
  paintHud();
  if (AUTO) auto(rdt);
}

/* ---------------- 自动玩（截图、跑通） ---------------- */

let autoT = 0;
function auto(dt: number): void {
  autoT += dt;
  if (autoT < 0.5) return;
  autoT = 0;
  if (AUTO_STOP && S.phase === AUTO_STOP) return;
  const btn = mcard.querySelector('button');
  if (!modal.hidden && btn && S.phase !== 'end') {
    (btn as HTMLButtonElement).click();
    return;
  }
  if (S.phase !== 'play') return;
  if (S.day === 1 && !scene.fixing && !scene.fixed.sand && S.t > 8) fixTap('sand');
  if (S.mode === 'photo') {
    const c = scene.topicAt('sunset');
    if (c) {
      VF.x = c.x - VF.w / 2;
      VF.y = c.y - VF.h / 2;
      placeVf();
    }
    if (liveTags.length) shoot();
    return;
  }
  if (!S.posted && minute() > 17 * 60 && S.mode === 'cards') {
    openPhoto();
    return;
  }
  if (!card || (S.mode !== 'cards' && S.mode !== 'tone')) return;
  const r = card.r;
  const a: Act =
    r.kind === 'fake'
      ? 'report'
      : r.kind === 'troll'
        ? 'ignore'
        : r.stars <= 2
          ? r.real && !scene.fixed[r.topic as Spot]
            ? 'sorry'
            : 'explain'
          : 'cute';
  act(a);
}

newGame();
titleScreen();
requestAnimationFrame(frame);
(window as unknown as { __social: unknown }).__social = { S, scene, act, openPhoto, shoot, fixTap, VF, placeVf };

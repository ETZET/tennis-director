import '../kit/kit.css';
import './style.css';
import { bakeArt, ICON_ART, type IconName } from '@td/iso';
import { mulberry32 } from '@td/shared';
import { buzz, flash, floatText, pop, SFX, setMuted, sfx, shake } from '../kit/juice';
import { LOUNGE, PID, POSTS, type PostId, SKILL_NAME, STAFF } from './data';
import { DAY_END, DAY_START, DAYS, EVT, Game, type GameEvent, type Pp, type Preview, pick } from './model';
import { createStage, type HeldState } from './stage';

/**
 * 08 拖人 2.0（第二轮）：在真的 Palm Oasis 上拖真员工。
 * 拿起来：人挂在手指上方晃，所有岗位亮 ★ / $/h / 表情；手指停在一块上：拇指区写原因、地上画路线和分钟、白干多少。
 * 松手：人沿步道走过去，到了按岗位演活。搭档、冤家、心情、罢工、每天一件急事。顶上可以切"旧手感"对比。
 * ?fast=N 加速  ?seed=N 固定种子  ?old=1 旧手感开局  ?mute 静音
 */

const Q = new URLSearchParams(location.search);
const FAST = Math.max(0.2, Number(Q.get('fast') ?? 1) || 1);
const seed = Number(Q.get('seed')) || (Date.now() % 999983) | 1;
const rnd = mulberry32(seed);
const DAY_REAL = 72;
const GPS = (DAY_END - DAY_START) / DAY_REAL;
let juicy = Q.get('old') !== '1';
let muted = Q.has('mute');
setMuted(muted);

const $ = <E extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document): E => {
  const el = root.querySelector(sel);
  if (!el) throw new Error(`${sel} missing`);
  return el as E;
};
const phone = $('#phone');
const stageEl = $('#stage');
const ui = $('#ui');

/* ---------------- 像素图标 → 小图（DOM 里用） ---------------- */
const iconCache = new Map<string, string>();
function iconURL(name: IconName): string {
  let u = iconCache.get(name);
  if (u) return u;
  const b = bakeArt(ICON_ART[name]);
  const c = document.createElement('canvas');
  c.width = b.w;
  c.height = b.h;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const img = g.createImageData(b.w, b.h);
  new Uint32Array(img.data.buffer).set(b.px);
  g.putImageData(img, 0, 0);
  u = c.toDataURL();
  iconCache.set(name, u);
  return u;
}
const moodIcon = (m: number): IconName => (m >= 70 ? 'heart' : m >= 45 ? 'note' : m >= 25 ? 'sweat' : 'anger');
const initials = (n: string) => n.slice(0, 2).toUpperCase();
const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(3 - n);
const hhmm = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

/* ---------------- 界面骨架 ---------------- */
ui.innerHTML = `
<div class="s-top">
  <div class="s-chip clock"><i></i><span><small>D</small><span id="dayN">1</span></span><span id="clock">6:00</span></div>
  <div class="s-chip money" id="money">$0</div>
  <div class="s-chip rep" id="rep">⭐20</div>
  <div class="s-sp"></div>
  <button class="s-ab" id="ab" type="button"><span>新手感</span><small>A / B</small></button>
  <button class="s-btn" id="mute" type="button" aria-label="静音">♪</button>
  <button class="s-btn" id="help" type="button" aria-label="说明">?</button>
</div>
<div class="s-ev" id="ev"><b id="evT"></b><span id="evL"></span><em id="evX"></em><div class="bar"><i></i></div></div>
<div id="marks"></div>
<div class="mins" id="mins"></div>
<div class="s-ghost" id="ghost"></div>
<div class="s-dock" id="dock">
  <div class="s-card" id="card"></div>
  <div class="s-strip" id="strip"></div>
</div>
<div class="k-modal" id="startOv"><div class="k-card">
  <div class="k-label">Palm Oasis · 第二轮 demo 08</div>
  <h1>拖人 2.0</h1>
  <p>按住员工往场景里拖：每个岗位亮出 ★ 和 $/小时。<br>放对人赚钱，搭档加成，放错会抱怨、罢工。<br>三天，每天一件急事。</p>
  <div class="btns"><button class="k-btn go" id="startBtn" type="button">开始第 1 天</button></div>
</div></div>
<div class="k-modal hidden" id="dayOv"><div class="k-card" id="dayCard"></div></div>
<div class="k-modal hidden" id="endOv"><div class="k-card" id="endCard"></div></div>
<div class="k-modal hidden" id="helpOv"><div class="k-card help">
  <h1>这个 demo 在测什么</h1>
  <p>动词还是"把人拖到岗位上"。假设：拖人无聊不是因为它是拖动，而是拖之前不用想、拖之后没感觉。加上匹配度、搭档、心情和松手前的预览，同一个动作变成一次小计算。</p>
  <h2>取舍</h2>
  <table>
  <tr><td>把干活的人拉走</td><td>接住新需求 / 急事；这一圈白干、路上不出钱</td></tr>
  <tr><td>放最会的人 ★★★</td><td>单人最赚；常常拆掉搭档</td></tr>
  <tr><td>搭档挨着</td><td>×1.25 四圈；之后聊上了 ×0.9，得拆开</td></tr>
  <tr><td>派讨厌的活</td><td>填上空位；×0.6，心情狂掉会罢工</td></tr>
  <tr><td>拖回休息区</td><td>回心情；不出钱，岗位空着掉声望</td></tr>
  </table>
  <h2>急事</h2>
  <p>大巴：前台和临时导游都要人 3 小时。积沙：会员场停摆，维护好的扫得快（Rosa ×1.6）。急单拍线：90 分钟内手艺 ≥70。</p>
  <h2>A / B</h2>
  <p>顶上"新手感 / 旧手感"只换看得见的反馈（旧 = 现在游戏的手感），数值完全一样。</p>
  <div class="btns"><button class="k-btn primary" id="helpClose" type="button">知道了</button></div>
</div></div>`;

const card = $('#card');
const strip = $('#strip');
const marksEl = $('#marks');
const minsEl = $('#mins');
const ghostEl = $('#ghost');
const dock = $('#dock');

/* ---------------- 模型 + 场景 ---------------- */
const game = new Game(rnd);
/** 画布按偶数 CSS 像素铺：缓冲 1 像素 = 2 CSS 像素，整数放大（3× 手机上 6 个物理像素），不会糊 */
function fitStage(): void {
  const r = phone.getBoundingClientRect();
  stageEl.style.right = 'auto';
  stageEl.style.bottom = 'auto';
  stageEl.style.width = `${Math.floor(r.width / 2) * 2}px`;
  stageEl.style.height = `${Math.floor(r.height / 2) * 2}px`;
}
fitStage();
window.addEventListener('resize', fitStage);
const stage = createStage(stageEl, () => dock.offsetHeight + 10, rnd);

/* ---------------- 岗位牌 ---------------- */
type MarkId = PostId | 'lounge';
interface Mark {
  id: MarkId;
  el: HTMLElement;
  f: HTMLElement;
  pips: HTMLElement;
  sd: HTMLElement;
  pv: HTMLElement;
  at: { x: number; z: number };
  /** 上一帧牌子的屏幕位置（命中测试） */
  sx: number;
  sy: number;
  gx: number;
  gy: number;
  /** 牌子宽度（内容变了才重新量，免得每帧强制排版） */
  w: number;
  html: Record<string, string>;
}
const marks: Mark[] = [];
/** 牌子竖线的起始长度（撞上别的牌子时再往上挪） */
const STEMS: Partial<Record<MarkId, number>> = {
  string: 46,
  pool: 20,
  court: 22,
  junior: 24,
  lounge: 34,
  clay: 24,
  desk: 28,
  guide: 50,
};
const MARK_IDS: MarkId[] = [...POSTS.map((p) => p.id), 'lounge'];
for (const id of MARK_IDS) {
  const el = document.createElement('div');
  el.className = `tg${id === 'lounge' ? ' lounge' : ''}${id !== 'lounge' && PID[id].temp ? ' temp hide' : ''}`;
  el.innerHTML = `<span class="f"></span><span class="nm">${id === 'lounge' ? '休息' : PID[id].tag}</span><span class="pips"></span><span class="sd"></span><span class="pv"></span>`;
  marksEl.append(el);
  marks.push({
    id,
    el,
    f: $('.f', el),
    pips: $('.pips', el),
    sd: $('.sd', el),
    pv: $('.pv', el),
    at: id === 'lounge' ? { x: LOUNGE.x, z: LOUNGE.z - 3 } : PID[id].spot,
    sx: 0,
    sy: 0,
    gx: 0,
    gy: 0,
    w: 0,
    html: {},
  });
}
const markOf = (id: MarkId) => marks.find((m) => m.id === id) as Mark;
function setH(m: Mark, k: string, el: HTMLElement, h: string): void {
  if (m.html[k] !== h) {
    m.html[k] = h;
    el.innerHTML = h;
    m.w = 0;
  }
}
const nameOf = (id: MarkId) => (id === 'lounge' ? '休息区' : PID[id].name);

/* ---------------- 员工条 ---------------- */
interface Tok {
  el: HTMLElement;
  dz: HTMLElement;
  mb: HTMLElement;
  em: HTMLImageElement;
  last: string;
}
const toks = new Map<string, Tok>();
for (const s of STAFF) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 's-tok';
  el.innerHTML = `<span class="fc" style="background:${s.color}">${initials(s.name)}<img alt=""></span><b>${s.name}</b><span class="dz"></span><span class="mb"><i></i></span>`;
  strip.append(el);
  toks.set(s.id, { el, dz: $('.dz', el), mb: $('.mb i', el), em: $('img', el), last: '' });
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    press(s.id, e, 'strip');
  });
}

/* ---------------- 状态 ---------------- */
let running = false;
let paused = false;
const modeTime = { new: 0, old: 0 };
let evClearAt = 0;
let lastPreview = 0;
let previews = new Map<MarkId, Preview>();

/* ---------------- 反馈（模型事件 → 画面） ---------------- */
/** 岗位上飘字的起点：牌子的上沿（字不压在牌子和人身上） */
const spotScreen = (id: PostId, _y = 0) => {
  const m = markOf(id);
  return { x: m.sx, y: m.sy - 26 };
};
function float(x: number, y: number, text: string, kind: 'good' | 'bad' | 'gold' | '' = '', big = false): void {
  if (!juicy) return;
  floatText(ui, x + (rnd() * 12 - 6), y, text, { kind, rise: big ? 52 : 36, ms: big ? 1500 : 1000 });
}
const bump = (sel: string) => juicy && pop($(sel));
const shakeStage = () => juicy && shake(stageEl);
const cardMsg = (html: string, cls = '') => {
  if (drag) return;
  msgUntil = performance.now() + 2600;
  card.className = `s-card ${cls}`;
  card.innerHTML = html;
};
let msgUntil = 0;

game.on((e: GameEvent) => {
  switch (e.k) {
    case 'arrive': {
      const s = spotScreen(e.post, 2.6);
      markOf(e.post).el.classList.add('flash');
      setTimeout(() => markOf(e.post).el.classList.remove('flash'), 500);
      if (!juicy) break;
      sfx({ f: 600, f2: 800, dur: 0.06, type: 'triangle', vol: 0.1 });
      float(s.x, s.y - 10, stars(e.stars), e.stars === 3 ? 'gold' : e.stars === 1 ? 'bad' : '');
      if (e.like) {
        stage.emote(e.p.id, 'heart');
        stage.say(e.p.id, pick(e.p.s.say.like, rnd));
      } else if (e.hate) {
        stage.emote(e.p.id, 'anger', 2.4);
        stage.say(e.p.id, pick(e.p.s.say.hate, rnd), true);
        SFX.bad();
        shakeStage();
      } else if (e.stars === 1) {
        stage.emote(e.p.id, 'sweat');
        stage.say(e.p.id, '这我不太会…', true);
      } else stage.emote(e.p.id, 'thumb');
      for (const m of e.mates) {
        if (m.rel > 0) {
          stage.emote(m.p.id, 'heart');
          stage.sparkle((e.p.x + m.p.x) / 2, (e.p.z + m.p.z) / 2, '#ffd24a', 18);
          const a = stage.project((e.p.x + m.p.x) / 2, 2.6, (e.p.z + m.p.z) / 2);
          float(a.x, a.y, '搭档！×1.25', 'gold', true);
          sfx(
            ...[660, 830, 990, 1320].map((f, i) => ({
              f,
              dur: 0.08,
              type: 'triangle' as const,
              vol: 0.08,
              at: i * 0.06,
            })),
          );
        } else {
          stage.emote(m.p.id, 'anger');
          stage.say(e.p.id, '怎么又是你', true);
        }
      }
      break;
    }
    case 'rest':
      if (juicy) stage.emote(e.p.id, 'zzz', 1.2);
      break;
    case 'pay': {
      const s = spotScreen(e.post);
      if (game.posts.court.sand > 0 && e.post === 'court') {
        float(s.x, s.y, '扫沙中…', '');
        break;
      }
      if (juicy) {
        const kind = e.pay >= 30 ? 'gold' : e.combo > 1.01 ? 'gold' : e.idle ? '' : 'good';
        float(s.x, s.y, `+$${e.pay}`, kind, e.pay >= 30);
        if (e.pay >= 30) SFX.bigCoin();
        else SFX.coin();
        bump('#money');
        if (e.rep > 0) setTimeout(() => float(s.x + 18, s.y + 6, `+${e.rep}⭐`, 'gold'), 260);
        if (e.rep > 0) bump('#rep');
        if (e.combo > 1.01) float(s.x, s.y - 18, '搭档 ×1.25', 'gold');
        if (e.chat) float(s.x, s.y - 18, '聊上了 ×0.9', 'bad');
        if (e.idle && rnd() < 0.5) stage.say(e.p.id, '没人来…');
      }
      break;
    }
    case 'lost': {
      const s = spotScreen(e.post, 2.6);
      float(s.x, s.y, `白干 ${Math.round(e.frac * 100)}%  −$${Math.round(e.money)}`, 'bad', true);
      if (juicy) {
        sfx({ f: 500, f2: 120, dur: 0.25, type: 'square', vol: 0.08 });
        stage.sparkle(PID[e.post].spot.x, PID[e.post].spot.z, '#ff5a4a', 10);
        if (e.why === 'drag') stage.say(e.p.id, '啊？干一半了…', true);
      }
      break;
    }
    case 'bumped':
      if (juicy) stage.say(e.p.id, '那我去歇会');
      break;
    case 'grumble':
      if (juicy) {
        stage.emote(e.p.id, 'anger', 2);
        stage.say(e.p.id, e.line, true);
      }
      break;
    case 'storm': {
      const h = stage.headOf(e.p.id);
      const t = toks.get(e.p.id) as Tok;
      t.el.classList.add('shake');
      setTimeout(() => t.el.classList.remove('shake'), 350);
      if (juicy) {
        stage.emote(e.p.id, 'anger', 3);
        stage.say(e.p.id, e.p.s.say.storm, true);
        sfx(
          { f: 220, f2: 140, dur: 0.12, type: 'sawtooth', vol: 0.12 },
          { f: 150, f2: 80, dur: 0.3, type: 'sawtooth', vol: 0.1, at: 0.1 },
        );
        shakeStage();
        buzz([30, 40, 30]);
        float(h.x, h.y - 10, '甩手不干了', 'bad', true);
      }
      cardMsg(
        `<div class="h"><b>${e.p.s.name} 罢工 2 小时</b></div><div class="warn">心情掉光了${e.post ? `，${PID[e.post].name}空了` : ''}</div><div class="dim">到时间自己回来，期间拖不动</div>`,
        'bad',
      );
      break;
    }
    case 'calm':
      if (juicy) {
        stage.emote(e.p.id, 'thumb');
        stage.say(e.p.id, e.p.s.say.back);
      }
      break;
    case 'uncovered': {
      const s = spotScreen(e.post, 0.5);
      float(s.x, s.y + 8, `没人管 −${e.loss}⭐`, 'bad');
      bump('#rep');
      if (juicy && e.loss >= 2) SFX.bad();
      break;
    }
    case 'evStart': {
      evClearAt = 0;
      if (e.ev.kind === 'bus') stage.bus(true);
      if (e.ev.kind === 'sand') stage.sand('sanded');
      if (juicy) {
        sfx(
          ...[0, 1, 2].flatMap((i) => [
            { f: 740, dur: 0.12, vol: 0.08, at: i * 0.26 },
            { f: 520, dur: 0.12, vol: 0.08, at: i * 0.26 + 0.13 },
          ]),
        );
        flash(phone, '#fff4dc');
        shakeStage();
        buzz([20, 60, 20]);
      }
      const d = EVT[e.ev.kind];
      cardMsg(
        `<div class="h"><b>${d.title}</b></div><div class="warn">${d.line}</div><div class="dim">${e.ev.kind === 'bus' ? '派两个服务好的：前台 + 导游' : e.ev.kind === 'sand' ? '维护好的去扫，Rosa 最快' : '手艺 ≥70 的去穿线台'}</div>`,
        'bad',
      );
      break;
    }
    case 'evEnd': {
      evClearAt = performance.now() + 3500;
      if (e.ev.kind === 'bus') stage.bus(false);
      if (e.ev.kind === 'sand') stage.sand('clean');
      const s = spotScreen(EVT[e.ev.kind].post, 3);
      const good = e.ev.res === 'ok';
      const parts = [e.money ? `+$${e.money}` : '', e.rep ? `${e.rep > 0 ? '+' : ''}${e.rep}⭐` : '']
        .filter(Boolean)
        .join(' ');
      float(
        s.x,
        s.y - 16,
        `${good ? '搞定！' : e.ev.res === 'fail' ? '搞砸了' : '凑合'} ${parts}`,
        good ? 'gold' : 'bad',
        true,
      );
      if (juicy) {
        if (good) {
          SFX.fanfare();
          stage.confetti(PID[EVT[e.ev.kind].post].spot.x, PID[EVT[e.ev.kind].post].spot.z);
        } else SFX.bad();
        if (e.ev.res === 'fail') shakeStage();
      }
      bump('#money');
      bump('#rep');
      break;
    }
    case 'chat':
      if (juicy) {
        stage.emote(e.a.id, 'note', 2);
        stage.emote(e.b.id, 'note', 2);
        stage.say(e.a.id, '诶你听说了吗…');
        const a = stage.project((e.a.x + e.b.x) / 2, 2.6, (e.a.z + e.b.z) / 2);
        float(a.x, a.y, '聊上了 ×0.9  拆开吧', 'bad', true);
      }
      break;
    case 'swept':
      break;
  }
});

/* ---------------- 拖人 ---------------- */
interface Drag {
  id: string;
  src: 'strip' | 'scene';
  pid: number;
  sx: number;
  sy: number;
  x: number;
  y: number;
  vx: number;
  moved: boolean;
  hover: MarkId | null;
  g: { x: number; z: number };
}
let drag: Drag | null = null;
const local = (e: { clientX: number; clientY: number }) => {
  const r = stageEl.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
};
function press(id: string, e: PointerEvent, src: 'strip' | 'scene'): void {
  if (!running || paused || drag) return;
  const pp = game.person(id);
  sfx({ f: 660, dur: 0.03, vol: 0.06 });
  if (!game.canPick(pp)) {
    refuse(pp);
    return;
  }
  const p = local(e);
  drag = {
    id,
    src,
    pid: e.pointerId,
    sx: p.x,
    sy: p.y,
    x: p.x,
    y: p.y,
    vx: 0,
    moved: false,
    hover: null,
    g: stage.unproject(p.x, p.y),
  };
  game.held = id;
  stage.world.camera.enabled = false;
  (toks.get(id) as Tok).el.classList.add('lift');
  buzz(8);
  // 按下就抬起来（0 延迟）：新手感是挂在手指上的小人，旧手感是游戏现在的方块头像
  if (juicy) {
    SFX.pick();
    stage.emote(id, 'ques', 99);
    showHeld();
  }
  previews = new Map();
  lastPreview = 0;
  phone.classList.toggle('dragging', juicy);
  for (const m of marks) m.w = 0;
  renderCard();
}
function refuse(pp: Pp): void {
  const t = toks.get(pp.id) as Tok;
  t.el.classList.add('shake');
  setTimeout(() => t.el.classList.remove('shake'), 350);
  SFX.buzz();
  buzz([20, 30, 20]);
  if (juicy) {
    stage.say(pp.id, '别烦我！', true);
    stage.emote(pp.id, 'anger');
  }
  cardMsg(
    `<div class="h"><b>${pp.s.name} 在罢工</b></div><div class="warn">还要 ${Math.ceil(pp.storm)} 分钟才肯回来</div>`,
    'bad',
  );
}
function showHeld(): void {
  if (!drag) return;
  const h: HeldState = { id: drag.id, fx: drag.x, fy: drag.y, vx: drag.vx, g: drag.g };
  if (juicy) stage.setHeld(h);
  else stage.setHeld(null);
  ghostEl.style.display = juicy ? 'none' : 'flex';
  const s = game.staff(drag.id);
  ghostEl.textContent = initials(s.name);
  ghostEl.style.background = s.color;
  ghostEl.style.left = `${drag.x}px`;
  ghostEl.style.top = `${drag.y}px`;
}
/** 手指底下（或者附近）是哪块牌子：按牌子和地面点到手指的距离，近的吸住 */
function hitMark(x: number, y: number): MarkId | null {
  let best: MarkId | null = null;
  let bd = 58;
  for (const m of marks) {
    if (m.el.classList.contains('hide')) continue;
    const dg = Math.hypot(x - m.gx, (y - m.gy) * 1.2);
    const dm = Math.hypot(x - m.sx, y - m.sy);
    const d = Math.min(dg, dm + 6);
    if (d < bd) {
      bd = d;
      best = m.id;
    }
  }
  return best;
}
window.addEventListener(
  'pointermove',
  (e) => {
    if (!drag || e.pointerId !== drag.pid) return;
    e.preventDefault();
    const p = local(e);
    drag.vx = drag.vx * 0.6 + (p.x - drag.x) * 0.4;
    drag.x = p.x;
    drag.y = p.y;
    if (!drag.moved && Math.hypot(p.x - drag.sx, p.y - drag.sy) > 6) drag.moved = true;
    const overStrip = p.y > stageEl.clientHeight - strip.offsetHeight;
    const h = drag.moved && !overStrip ? hitMark(p.x, p.y) : null;
    if (h !== drag.hover) {
      drag.hover = h;
      onHover(h);
    }
    // 吸附：停在岗位上时人吸到岗位上方
    const g = stage.unproject(p.x, p.y);
    if (h) {
      const at = h === 'lounge' ? markOf('lounge').at : PID[h].spot;
      drag.g = { x: at.x, z: at.z };
    } else drag.g = g;
    showHeld();
  },
  { passive: false },
);
function onHover(h: MarkId | null): void {
  if (!drag) return;
  renderCard();
  if (!juicy) return;
  const pp = game.person(drag.id);
  if (!h) {
    stage.setPreview(null);
    stage.emote(drag.id, 'ques', 99);
    return;
  }
  sfx({ f: 880, dur: 0.025, vol: 0.05 });
  buzz(4);
  const pv = game.preview(pp, h === 'lounge' ? null : h);
  stage.setPreview(pv.path);
  if (h === 'lounge') stage.emote(drag.id, 'zzz', 99);
  else {
    stage.emote(drag.id, pv.like ? 'heart' : pv.hate ? 'anger' : pv.stars === 1 ? 'sweat' : 'thumb', 99);
    if (pv.hate && rnd() < 0.7) stage.say(drag.id, pick(pp.s.say.hate, rnd), true);
  }
}
function endDrag(e: PointerEvent): void {
  if (!drag || e.pointerId !== drag.pid) return;
  const d = drag;
  drag = null;
  game.held = null;
  phone.classList.remove('dragging');
  for (const m of marks) m.w = 0;
  (toks.get(d.id) as Tok).el.classList.remove('lift');
  ghostEl.style.display = 'none';
  minsEl.style.display = 'none';
  stage.setPreview(null);
  for (const m of marks) m.el.classList.remove('hot', 'drop-hover', 's1', 's2', 's3');
  const pp = game.person(d.id);
  if (!d.moved) {
    // 点一下：看这个人
    stage.land(d.id, null);
    stage.emote(d.id, moodIcon(pp.mood), 1.2);
    showPerson(pp);
    return;
  }
  const h = d.hover;
  const target: PostId | null = h === 'lounge' ? null : h;
  const same = h && (h === 'lounge' ? !pp.post && pp.state !== 'walk' : pp.post === h);
  if (h && !same && game.assign(pp, target)) {
    const at = target ? PID[target].spot : markOf('lounge').at;
    if (juicy) {
      stage.land(d.id, at);
      SFX.drop();
      sfx({ f: 140, f2: 60, dur: 0.16, type: 'sine', vol: 0.25 });
      stage.dust(at.x, at.z, 16);
      shakeStage();
      stage.emote(d.id, 'thumb', 0.8);
    } else stage.land(d.id, null);
    buzz(15);
    const m = markOf(h);
    m.el.classList.add('flash');
    setTimeout(() => m.el.classList.remove('flash'), 500);
    renderCard();
    return;
  }
  // 放回原处 / 无效位置：弹回
  stage.land(d.id, null);
  if (juicy) {
    sfx({ f: 300, f2: 200, dur: 0.08, type: 'triangle', vol: 0.08 });
    stage.emote(d.id, same ? 'thumb' : 'ques', 0.8);
  }
  renderCard();
}
window.addEventListener('pointerup', endDrag);
window.addEventListener('pointercancel', (e) => {
  if (!drag || e.pointerId !== drag.pid) return;
  drag.moved = false;
  drag.hover = null;
  endDrag(e);
});
// 捕获阶段先看按到的是不是人：是人就拿起来、这一下不给镜头；按在空地上才交给镜头平移
stageEl.addEventListener(
  'pointerdown',
  (e) => {
    e.preventDefault();
    const p = local(e);
    const id = drag ? null : stage.personAt(p.x, p.y);
    stage.world.camera.enabled = !drag && !id;
    if (id) press(id, e, 'scene');
  },
  { capture: true },
);
const camBack = () => {
  if (!drag) stage.world.camera.enabled = true;
};
window.addEventListener('pointerup', camBack);
window.addEventListener('pointercancel', camBack);

/* ---------------- 拇指区面板 ---------------- */
function chipsFor(pp: Pp, h: PostId, pv: Preview): string {
  const c: string[] = [];
  const sk = PID[h].skill;
  c.push(`<span class="${pv.skill >= 70 ? 'g' : pv.skill < 40 ? 'b' : ''}">${SKILL_NAME[sk]} ${pv.skill}</span>`);
  if (pv.like) c.push('<span class="g">喜欢这活</span>');
  if (pv.hate) c.push('<span class="b">讨厌 · 心情狂掉</span>');
  for (const m of pv.mates)
    c.push(
      m.rel < 0
        ? `<span class="b">挨着 ${m.name} ×0.8</span>`
        : m.chat
          ? `<span class="b">和 ${m.name} 聊上了 ×0.9</span>`
          : `<span class="w">搭档 ${m.name} ×1.25 · ${m.left} 圈</span>`,
    );
  if (pv.early) c.push('<span class="g">早起 ×1.2</span>');
  if (pv.sweep !== null) c.push(`<span class="t">扫沙 ${pv.sweep}%/时</span>`);
  if (pv.demand === 0) c.push(`<span class="b">没需求${pv.next ? ` · ${pv.next} 点忙` : ''}</span>`);
  c.push(`<span class="t">走 ${pv.walk} 分</span>`);
  void pp;
  return c.join('');
}
function renderCard(): void {
  if (drag) {
    msgUntil = 0;
    const pp = game.person(drag.id);
    const s = pp.s;
    const h = drag.hover;
    const face = `<span class="fc" style="--c:${s.color}">${initials(s.name)}</span>`;
    if (!juicy) {
      card.className = 's-card';
      card.innerHTML = `<div class="h">${face}<b>${h ? `松手：派 ${s.name} 去${nameOf(h)}` : `拖到岗位上松手`}</b></div><div class="dim">${s.role}</div>`;
      return;
    }
    if (!h) {
      const pv = game.preview(pp, pp.post);
      card.className = 's-card';
      card.innerHTML = `<div class="h">${face}<b>${s.name} · ${s.role}</b><img src="${iconURL(moodIcon(pp.mood))}" width="16" height="16" style="image-rendering:pixelated"></div>
        <div class="s-chips"><span>服务 ${s.st.svc}</span><span>教学 ${s.st.teach}</span><span>维护 ${s.st.maint}</span><span>手艺 ${s.st.craft}</span></div>
        <div class="dim">${s.trait}${pp.dayState ? ` · ${pp.dayState}` : ''}</div>${pv.loss ? `<div class="warn">拉走：${pv.loss.post}白干 ${Math.round(pv.loss.frac * 100)}%（−$${Math.round(pv.loss.money)}）</div>` : ''}`;
      return;
    }
    const pv = previews.get(h) ?? game.preview(pp, h === 'lounge' ? null : h);
    if (h === 'lounge') {
      card.className = 's-card good';
      card.innerHTML = `<div class="h">${face}<b>${s.name} → 休息区</b><span class="r lo">$0</span></div>
        <div class="s-chips"><span class="g">心情 +10/时</span><span class="t">走 ${pv.walk} 分</span></div>${lossLine(pv)}`;
      return;
    }
    card.className = `s-card ${pv.stars === 3 ? 'good' : pv.stars === 1 || pv.hate ? 'bad' : ''}`;
    card.innerHTML = `<div class="h">${face}<b>${s.name} → ${PID[h].name}</b><span class="st">${stars(pv.stars)}</span><span class="r${pv.rate < 6 ? ' lo' : ''}">+$${Math.round(pv.rate)}<small>/时</small></span></div>
      <div class="s-chips">${chipsFor(pp, h, pv)}</div>${lossLine(pv)}`;
    return;
  }
  if (performance.now() < msgUntil) return;
  // 平时：哪儿缺人
  const need = POSTS.filter(
    (p) => game.posts[p.id].active && game.demand(p.id) >= 2 && !game.working(game.posts[p.id].occ),
  );
  const busy = POSTS.filter((p) => game.posts[p.id].active && game.demand(p.id) >= 2);
  card.className = `s-card${need.length ? ' bad' : ''}`;
  card.innerHTML = `<div class="h"><b>${need.length ? `缺人：${need.map((p) => p.name).join('、')}` : '都有人管'}</b><span class="lbl">${game.hour < 12 ? 'MORNING' : game.hour < 17 ? 'AFTERNOON' : 'EVENING'}</span></div>
    <div class="s-chips">${busy.map((p) => `<span class="${game.working(game.posts[p.id].occ) ? 'g' : 'b'}">${p.name} ${'▮'.repeat(Math.min(game.demand(p.id), 5))}</span>`).join('') || '<span class="t">现在不忙</span>'}</div>
    <div class="dim">按住员工拖到岗位上</div>`;
}
function lossLine(pv: Preview): string {
  const w: string[] = [];
  if (pv.loss) w.push(`${pv.loss.post}白干 ${Math.round(pv.loss.frac * 100)}%（−$${Math.round(pv.loss.money)}）`);
  if (pv.bump)
    w.push(`换下 ${pv.bump.name}${pv.bump.frac > 0.04 ? `，他白干 ${Math.round(pv.bump.frac * 100)}%` : ''}`);
  return w.length ? `<div class="warn">${w.join(' · ')}</div>` : '';
}
function showPerson(pp: Pp): void {
  const s = pp.s;
  cardMsg(
    `<div class="h"><span class="fc" style="--c:${s.color}">${initials(s.name)}</span><b>${s.name} · ${s.role}</b><img src="${iconURL(moodIcon(pp.mood))}" width="16" height="16" style="image-rendering:pixelated"></div>
    <div class="s-chips"><span>服务 ${s.st.svc}</span><span>教学 ${s.st.teach}</span><span>维护 ${s.st.maint}</span><span>手艺 ${s.st.craft}</span></div>
    <div class="dim">${s.trait} · 心情 ${Math.round(pp.mood)}</div>`,
  );
}

/* ---------------- 每帧刷新界面 ---------------- */
function placeMarks(): void {
  const W = stageEl.clientWidth;
  const hot = drag?.hover ?? null;
  const pp = drag ? game.person(drag.id) : null;
  const now = performance.now();
  if (drag && juicy && now - lastPreview > 120) {
    lastPreview = now;
    for (const m of marks) previews.set(m.id, game.preview(pp as Pp, m.id === 'lounge' ? null : m.id));
  }
  // 先摆屏幕上靠下的牌子；后摆的撞上已经摆好的就往上挪（竖线拉长、斜着指回地面），牌子不叠
  const placed: { x0: number; x1: number; y0: number; y1: number }[] = [];
  for (const m of marks) {
    const g = stage.project(m.at.x, 0, m.at.z);
    m.gx = g.x;
    m.gy = g.y;
  }
  const order = [...marks].sort((a, b) => b.gy - a.gy);
  for (const m of order) {
    const id = m.id;
    const post = id === 'lounge' ? null : game.posts[id];
    if (post) m.el.classList.toggle('hide', !post.active);
    if (post && !post.active) continue;
    const g = { x: m.gx, y: m.gy };
    let stem = STEMS[id] ?? 24;
    let x = g.x;
    let y = g.y - stem;
    // 手指停着的那块：挪到挂着的小人旁边（不被人和手指挡住）
    if (drag && hot === id && juicy) {
      // 手指停着的那块：挂到拎着的小人头顶上（人在手指上方，牌子在人上方，谁也不挡谁）
      x = drag.x;
      y = Math.max(64, drag.y - 100);
    }
    if (!m.w) m.w = m.el.offsetWidth;
    const w = m.w || 80;
    const cx = Math.max(w / 2 + 4, Math.min(W - w / 2 - 4, x));
    const isHot = !!drag && hot === id && juicy;
    if (!isHot)
      for (let k = 0; k < 6; k++) {
        const hit = placed.find(
          (r) => cx - w / 2 < r.x1 + 3 && cx + w / 2 > r.x0 - 3 && y - 30 < r.y1 + 3 && y > r.y0 - 3,
        );
        if (!hit) break;
        y = hit.y0 - 4;
      }
    placed.push({ x0: cx - w / 2, x1: cx + w / 2, y0: y - 30, y1: y });
    m.sx = cx;
    m.sy = y - 15;
    const dx = g.x - cx;
    const dy = Math.max(0, g.y - y);
    stem = Math.hypot(dx, dy);
    m.el.style.transform = `translate(${Math.round(cx - w / 2)}px, ${Math.round(y - 30)}px)`;
    m.el.style.setProperty('--sx', '0px');
    m.el.style.setProperty('--rot', `${(-Math.atan2(dx, dy) * 180) / Math.PI}deg`);
    m.el.style.setProperty('--stem', `${Math.round(isHot ? 0 : stem)}px`);
    // 内容：在岗的人（环形进度）、需求、积沙
    if (id === 'lounge') {
      const n = game.people.filter((q) => !q.post && q.state !== 'walk').length;
      setH(m, 'f', m.f, `${n}`);
    } else if (post) {
      const occ = post.occ;
      const dem = game.demand(id);
      if (occ) {
        m.f.className = `f${occ.state === 'walk' ? ' walk' : ''}`;
        m.f.style.setProperty('--c', occ.s.color);
        m.f.style.setProperty('--p', `${Math.round((occ.state === 'work' ? occ.prog : 0) * 100)}%`);
        setH(m, 'f', m.f, initials(occ.s.name));
      } else {
        m.f.className = 'f empty';
        setH(m, 'f', m.f, '+');
      }
      setH(
        m,
        'pips',
        m.pips,
        Array.from({ length: Math.max(3, Math.min(dem, 5)) }, (_, i) => `<i class="${i < dem ? 'on' : ''}"></i>`).join(
          '',
        ),
      );
      m.el.classList.toggle('need', dem >= 2 && !game.working(occ) && !drag);
      const ev = game.ev;
      m.el.classList.toggle(
        'alarm',
        !!ev && !ev.res && (EVT[ev.kind].post === id || (ev.kind === 'bus' && id === 'guide')),
      );
      m.el.classList.toggle('sand', id === 'court' && post.sand > 0);
      if (id === 'court') setH(m, 'sd', m.sd, post.sand > 0 ? `沙 ${Math.ceil(post.sand)}%` : '');
    }
    // 拿着人：预览
    if (drag && juicy) {
      const pv = previews.get(id);
      if (pv) {
        if (id === 'lounge') {
          setH(m, 'pv', m.pv, `<img src="${iconURL('zzz')}" alt=""><span class="r">♥+10</span>`);
          m.el.classList.remove('s1', 's2', 's3');
        } else {
          const ic: IconName = pv.like ? 'heart' : pv.hate ? 'anger' : pv.stars === 1 ? 'sweat' : 'thumb';
          setH(
            m,
            'pv',
            m.pv,
            `<span class="st">${stars(pv.stars)}</span><span class="r">$${Math.round(pv.rate)}</span><img src="${iconURL(ic)}" alt="">`,
          );
          for (const k of [1, 2, 3]) m.el.classList.toggle(`s${k}`, pv.stars === k);
        }
      }
      m.el.classList.toggle('hot', hot === id);
    } else if (drag) m.el.classList.toggle('drop-hover', hot === id);
  }
  // 走几分钟：路线中点一块小牌
  if (drag && juicy && hot) {
    const pv = previews.get(hot);
    if (pv && pv.path.length > 1) {
      // 分钟数挂在起点脚下（人现在站的地方；牌子在他头上，字在脚下），不压在落点上
      const st = pv.path[0] as { x: number; z: number };
      const s = stage.project(st.x, 0, st.z);
      minsEl.style.display = 'block';
      minsEl.textContent = `走 ${pv.walk} 分`;
      minsEl.style.transform = `translate(${Math.round(Math.max(4, Math.min(stageEl.clientWidth - minsEl.offsetWidth - 4, s.x - minsEl.offsetWidth / 2)))}px, ${Math.round(s.y + 8)}px)`;
    }
  } else minsEl.style.display = 'none';
}
function updateStrip(): void {
  for (const pp of game.people) {
    const t = toks.get(pp.id) as Tok;
    let dz: string;
    if (pp.storm > 0) dz = `罢工 ${Math.ceil(pp.storm)}分`;
    else if (pp.state === 'walk') dz = `→${pp.post ? PID[pp.post].name : '休息'}`;
    else if (pp.state === 'work' && pp.post) dz = `${PID[pp.post].name.slice(0, 2)} ${Math.floor(pp.prog * 100)}%`;
    else dz = '休息中';
    const key = `${dz}|${Math.round(pp.mood)}|${juicy}`;
    if (key === t.last) continue;
    t.last = key;
    t.dz.textContent = dz;
    t.mb.style.width = `${Math.round(pp.mood)}%`;
    t.mb.style.background = pp.mood >= 55 ? 'var(--green-2)' : pp.mood >= 28 ? 'var(--amber)' : 'var(--red)';
    t.em.src = iconURL(moodIcon(pp.mood));
    t.em.style.display = juicy ? '' : 'none';
    t.el.classList.toggle('storm', pp.storm > 0);
    t.el.classList.toggle('idle', !pp.post && pp.storm <= 0 && pp.state !== 'walk');
  }
}
let hudKey = '';
function updateHud(): void {
  const k = `${game.day}|${Math.floor(game.t)}|${game.money}|${game.rep}`;
  if (k === hudKey) return;
  hudKey = k;
  $('#dayN').textContent = String(game.day);
  $('#clock').textContent = hhmm(game.t);
  ($('.s-chip.clock i') as HTMLElement).style.setProperty(
    '--d',
    `${Math.round(((game.t - DAY_START) / (DAY_END - DAY_START)) * 100)}%`,
  );
  $('#money').textContent = `$${game.money}`;
  $('#rep').textContent = `⭐${game.rep}`;
}
function updateEvBar(): void {
  const bar = $('#ev');
  const ev = game.ev;
  if (!ev) {
    bar.classList.remove('on');
    return;
  }
  bar.classList.add('on');
  bar.classList.toggle('pulse', !ev.res && juicy);
  bar.classList.toggle('ok', ev.res === 'ok');
  bar.classList.toggle('fail', ev.res === 'fail');
  $('#evT').textContent = EVT[ev.kind].title;
  let x = '';
  let p = 0;
  if (ev.res) {
    $('#evL').textContent = ev.text;
    x = ev.res === 'ok' ? '搞定' : ev.res === 'fail' ? '搞砸' : '凑合';
    p = 1;
  } else if (ev.kind === 'sand') {
    const s = game.posts.court.sand;
    $('#evL').textContent = game.working(game.posts.court.occ)
      ? `${game.posts.court.occ?.s.name} 在扫`
      : '没人扫，每小时 −2⭐';
    x = `沙 ${Math.ceil(s)}%`;
    p = 1 - s / 100;
  } else {
    const left = Math.max(0, ev.deadline - game.t);
    if (ev.kind === 'bus') {
      const cov = ev.tot ? Math.round((ev.cov / ev.tot) * 100) : 0;
      const n = (game.working(game.posts.desk.occ) ? 1 : 0) + (game.working(game.posts.guide.occ) ? 1 : 0);
      $('#evL').textContent = `接待 ${cov}% · 在岗 ${n}/2`;
    } else
      $('#evL').textContent = game.working(game.posts.string.occ)
        ? `${game.posts.string.occ?.s.name} 在穿`
        : '穿线台没人';
    x = `${Math.ceil(left)}分`;
    p = 1 - left / (ev.kind === 'bus' ? 180 : 90);
  }
  $('#evX').textContent = x;
  ($('.bar i', bar) as HTMLElement).style.setProperty('--p', `${Math.round(p * 100)}%`);
}

/* ---------------- 一天 / 一局 ---------------- */
function endDay(): void {
  running = false;
  if (drag) {
    stage.land(drag.id, null);
    drag = null;
    game.held = null;
  }
  game.endDay();
  const d = game.dayStats;
  const cov = d.dem ? d.cov / d.dem : 0;
  const ev = d.ev[0];
  $('#dayCard').innerHTML = `<div class="k-label">DAY ${game.day} · 收工</div><h1>第 ${game.day} 天收工</h1>
    <div class="row"><span>收入</span><b class="good">$${d.rev}</b></div>
    <div class="row"><span>需求覆盖</span><b>${Math.round(cov * 100)}%</b></div>
    <div class="row"><span>搭档加成</span><b>${Math.round(d.combos)} 次</b></div>
    <div class="row"><span>白干的圈</span><b class="${d.lostCyc ? 'bad' : ''}">${d.lostCyc}</b></div>
    <div class="row"><span>罢工</span><b class="${d.storms ? 'bad' : ''}">${d.storms}</b></div>
    ${ev ? `<div class="row"><span>急事</span><b class="${ev === 'ok' ? 'good' : ev === 'fail' ? 'bad' : ''}">${ev === 'ok' ? '搞定' : ev === 'fail' ? '搞砸' : '凑合'}</b></div>` : ''}
    <p style="margin-top:8px">一夜过去，大家心情 +15。${game.day < DAYS ? '明天需求时间会变，还有一件急事。' : ''}</p>
    <div class="btns"><button class="k-btn go" id="dayBtn" type="button">${game.day < DAYS ? `第 ${game.day + 1} 天 →` : '看结果'}</button></div>`;
  $('#dayOv').classList.remove('hidden');
  if (juicy) SFX.fanfare();
  $('#dayBtn').addEventListener('click', () => {
    $('#dayOv').classList.add('hidden');
    if (game.day >= DAYS) {
      showEnd();
      return;
    }
    game.nextDay();
    running = true;
  });
}
function showEnd(): void {
  const st = game.stats;
  const cov = st.dem ? st.cov / st.dem : 0;
  const mood = game.people.reduce((a, p) => a + p.mood, 0) / game.people.length;
  const ok = st.ev.filter((e) => e === 'ok').length;
  const r = st.rev;
  let title: string;
  let line: string;
  if (st.storms >= 3 && r >= 2200) [title, line] = ['铁腕总监', `钱赚到了，可有人甩手 ${st.storms} 次`];
  else if (st.storms >= 3) [title, line] = ['救火队长', '人一个个甩手，你一直在补位'];
  else if (st.combos >= 24 && mood >= 50) [title, line] = ['红娘总监', '你知道谁和谁站一起最来劲'];
  else if (cov >= 0.85) [title, line] = ['滴水不漏总监', '哪儿要人哪儿就有人'];
  else if (mood >= 72) [title, line] = ['暖心总监', '大家都爱来上班，钱少了点'];
  else if (ok >= 3) [title, line] = ['临危不乱总监', '三件急事全接住了'];
  else if (r >= 2400) [title, line] = ['精算总监', '每个人都在最赚钱的地方'];
  else [title, line] = ['随缘总监', '有空就派，没空就算了'];
  const tot = modeTime.new + modeTime.old || 1;
  $('#endCard').innerHTML =
    `<div class="k-label">3 DAYS · RESULT</div><h1>三天结束</h1><div class="title">「${title}」</div><p>${line}</p>
    <div class="row"><span>总收入</span><b class="good" style="font-size:22px">$${r}</b></div>
    <div class="row"><span>声望</span><b>⭐${game.rep}</b></div>
    <div class="row"><span>需求覆盖</span><b>${Math.round(cov * 100)}%</b></div>
    <div class="row"><span>团队心情</span><b>${Math.round(mood)}</b></div>
    <div class="row"><span>搭档 / 白干 / 罢工</span><b>${Math.round(st.combos)} / ${st.lostCyc} / ${st.storms}</b></div>
    <div class="row"><span>急事</span><b>${st.ev.map((e) => (e === 'ok' ? '✓' : e === 'fail' ? '✗' : '–')).join(' ')}</b></div>
    <div class="row"><span>手感用时</span><b>新 ${Math.round((modeTime.new / tot) * 100)}% · 旧 ${Math.round((modeTime.old / tot) * 100)}%</b></div>
    <div class="btns"><button class="k-btn go" id="againNew" type="button">再来（新手感）</button><button class="k-btn ghost" id="againOld" type="button">再来（旧）</button></div>`;
  $('#endOv').classList.remove('hidden');
  if (juicy) SFX.fanfare();
  const again = (j: boolean) => {
    const u = new URL(location.href);
    u.searchParams.delete('seed');
    if (j) u.searchParams.delete('old');
    else u.searchParams.set('old', '1');
    u.searchParams.set('go', '1');
    location.href = u.toString();
  };
  $('#againNew').addEventListener('click', () => again(true));
  $('#againOld').addEventListener('click', () => again(false));
}

/* ---------------- 顶栏 ---------------- */
function syncMode(): void {
  const b = $('#ab');
  b.classList.toggle('old', !juicy);
  ($('span', b) as HTMLElement).textContent = juicy ? '新手感' : '旧手感';
  for (const t of toks.values()) t.last = '';
}
$('#ab').addEventListener('click', () => {
  juicy = !juicy;
  syncMode();
  sfx({ f: 520, dur: 0.05, vol: 0.08 });
  cardMsg(
    juicy
      ? '<div class="h"><b>新手感</b></div><div class="dim">拿起来晃、岗位亮预览、放下有声音、每圈飘数字</div>'
      : '<div class="h"><b>旧手感（现在的游戏）</b></div><div class="dim">只有方块头像和环形进度，数值完全一样</div>',
  );
});
$('#mute').addEventListener('click', () => {
  muted = !muted;
  setMuted(muted);
  $('#mute').textContent = muted ? '×' : '♪';
});
$('#help').addEventListener('click', () => {
  paused = true;
  $('#helpOv').classList.remove('hidden');
});
const closeHelp = () => {
  paused = false;
  $('#helpOv').classList.add('hidden');
};
$('#helpClose').addEventListener('click', closeHelp);
$('#helpOv').addEventListener('click', (e) => {
  if (e.target === $('#helpOv')) closeHelp();
});
const start = () => {
  $('#startOv').classList.add('hidden');
  running = true;
  if (juicy) SFX.fanfare();
};
$('#startBtn').addEventListener('click', start);
if (Q.get('go') === '1') start();
syncMode();
if (muted) $('#mute').textContent = '×';

/* ---------------- 主循环 ---------------- */
let last = performance.now();
function frame(ts: number): void {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (ts - last) / 1000);
  last = ts;
  if (running && !paused) {
    const gdt = dt * FAST;
    modeTime[juicy ? 'new' : 'old'] += gdt;
    game.tick(gdt * GPS);
    if (game.posts.court.sand > 0 && game.posts.court.sand < 50 && !sweptHalf) {
      sweptHalf = true;
      stage.sand('swept');
    }
    if (game.posts.court.sand === 0) sweptHalf = false;
    if (evClearAt && performance.now() > evClearAt) {
      evClearAt = 0;
      game.clearEv();
    }
    if (game.t >= DAY_END) endDay();
  }
  stage.update(dt, game, juicy);
  placeMarks();
  updateStrip();
  updateHud();
  updateEvBar();
  if (!drag && performance.now() >= msgUntil && Math.floor(ts / 500) !== cardTick) {
    cardTick = Math.floor(ts / 500);
    renderCard();
  }
}
let sweptHalf = false;
let cardTick = -1;
renderCard();
requestAnimationFrame(frame);

/* 调试 / 脚本：控制台里摸状态，脚本直接派人 */
(window as unknown as { __staff: unknown }).__staff = {
  game,
  stage,
  assign: (id: string, post: PostId | null) => game.assign(game.person(id), post),
  get running() {
    return running;
  },
};

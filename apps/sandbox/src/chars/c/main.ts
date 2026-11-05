import '../../demos/kit/kit.css';
import './style.css';
import { CAST, type Member } from './cast';
import { createHud } from './hud';
import { NOTES_HTML } from './notes';
import { Grid, toCanvas } from './pix';
import { crop32, EXPR_ZH, EXPRS, type Expr, portrait } from './portrait';
import { createRoster } from './roster';
import { createScene } from './scene';
import { type AnimId, anim, compose, EMOTES, type EmoteId, type Facing, FH, FW } from './sprite';

/**
 * 人物方向 C「双层：场景小人 + 大肖像」。
 * 第二版（制作人：地图上说话不显示大头照，大头照只在菜单里的花名册）：气泡、员工条、事件卡都不放肖像，肖像只在花名册。
 * ?view=scene 直接滚到"放进游戏"那块；?view=roster 打开花名册，&who=gus 直接看某人的详情；?zoom=7.8 换镜头档位；?ps=1 用游戏手机的 1 倍像素（默认 2 倍，和玩法 demo 一致）。
 */

const Q = new URLSearchParams(location.search);
const $ = (sel: string) => document.querySelector(sel) as HTMLElement;
const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};

/* ---------------- 肖像缓存 ---------------- */
const pGrid = new Map<string, Grid>();
function pg(m: Member, e: Expr): Grid {
  const k = `${m.id}|${e}`;
  let g = pGrid.get(k);
  if (!g) {
    g = portrait(m.portrait, e);
    pGrid.set(k, g);
  }
  return g;
}
function face(m: Member, e: Expr, size: 48 | 32, scale: number): HTMLCanvasElement {
  const g = size === 48 ? pg(m, e) : crop32(pg(m, e), m.portrait);
  const cv = toCanvas(g, m.look, scale, true);
  cv.className = 'c-px';
  return cv;
}

/** 员工条格子：场景小人 idle 第一帧的头（裁 12×11，3×），和地图上那个人一模一样 */
function spriteHead(m: Member): HTMLCanvasElement {
  const g = compose(m.sprite, anim(m.sprite, 'idle').poses[0] as Parameters<typeof compose>[1], 'front');
  let y0 = 0;
  while (y0 < g.h && g.d.slice(y0 * g.w, (y0 + 1) * g.w).every((c) => c === '.')) y0++;
  const out = new Grid(12, 11);
  for (let y = 0; y < 11; y++) for (let x = 0; x < 12; x++) out.set(x, y, g.get(x + 3, y0 + y));
  const cv = toCanvas(out, m.look, 3);
  cv.className = 'c-px';
  return cv;
}
/** 像素表情图标 */
function emoteCv(id: EmoteId, scale: number): HTMLCanvasElement {
  const e = EMOTES[id];
  const cv = document.createElement('canvas');
  cv.width = Math.max(...e.rows.map((r) => r.length));
  cv.height = e.rows.length;
  cv.style.width = `${cv.width * scale}px`;
  cv.style.height = `${cv.height * scale}px`;
  cv.className = 'c-px';
  const ctx = cv.getContext('2d') as CanvasRenderingContext2D;
  e.rows.forEach((r, y) => {
    for (let x = 0; x < r.length; x++) {
      const c = e.pal[r[x] as string];
      if (!c) continue;
      ctx.fillStyle = c;
      ctx.fillRect(x, y, 1, 1);
    }
  });
  return cv;
}

/* ---------------- 会动的小人画布 ---------------- */
interface Live {
  cv: HTMLCanvasElement;
  m: Member;
  a: AnimId;
  f: Facing;
  last: number;
  emote: boolean;
}
const lives: Live[] = [];
const EMO_H = 6;
function live(m: Member, a: AnimId, f: Facing, scale: number, emote = true): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = FW;
  cv.height = FH + (emote ? EMO_H : 0);
  cv.style.width = `${cv.width * scale}px`;
  cv.style.height = `${cv.height * scale}px`;
  cv.className = 'c-px';
  lives.push({ cv, m, a, f, last: -1, emote });
  return cv;
}
const frameCache = new Map<string, ImageData>();
function drawLive(L: Live, t: number): void {
  const an = anim(L.m.sprite, L.a);
  const i = ((Math.floor(t / an.dt) % an.poses.length) + an.poses.length) % an.poses.length;
  if (i === L.last) return;
  L.last = i;
  const key = `${L.m.id}|${L.a}|${L.f}|${i}`;
  let img = frameCache.get(key);
  if (!img) {
    const g = compose(L.m.sprite, an.poses[i] as (typeof an.poses)[number], L.f);
    const tmp = toCanvas(g, L.m.look, 1);
    img = (tmp.getContext('2d') as CanvasRenderingContext2D).getImageData(0, 0, g.w, g.h);
    frameCache.set(key, img);
  }
  const ctx = L.cv.getContext('2d') as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, L.cv.width, L.cv.height);
  const oy = L.emote ? EMO_H : 0;
  ctx.putImageData(img, 0, oy);
  const em = L.emote ? an.emote?.[i] : null;
  if (em) {
    const e = EMOTES[em];
    e.rows.forEach((r, j) => {
      for (let x = 0; x < r.length; x++) {
        const c = e.pal[r[x] as string];
        if (!c) continue;
        ctx.fillStyle = c;
        ctx.fillRect(10 + x, 1 + j, 1, 1);
      }
    });
  }
}

/* ---------------- 页面 ---------------- */
const app = $('#app');
app.className = 'c-page';

const top = h('header', 'c-top');
top.innerHTML = `<div><div class="k-label">人物方向 · C</div><h1>双层：场景小人 + 大肖像</h1></div>`;
const help = h('button', 'c-help', '?');
help.setAttribute('aria-label', '说明');
top.append(help);
app.append(top);
const nav = h('nav', 'c-nav');
for (const [id, t] of [
  ['lineup', '阵容'],
  ['faces', '表情'],
  ['moves', '动作'],
  ['close', '近看'],
  ['scene', '放进游戏'],
  ['roster', '花名册'],
  ['notes', '规格'],
] as const) {
  const a = h('a', 'k-chip', t);
  a.href = `#${id}`;
  nav.append(a);
}
app.append(nav);
app.append(
  h(
    'p',
    'c-lede',
    '第二版：<b>地图上只有小人</b>（10×18：轮廓、发型、一块招牌色、一件随身道具），说话用地图气泡、情绪由小人自己演；<b>48×48 大肖像只在菜单里的花名册出现</b>。两层用同一份换色表，颜色一一对得上。',
  ),
);

const section = (id: string, title: string, sub = '') => {
  const s = h('section', 'c-sec');
  s.id = id;
  s.append(h('h2', 'c-h2', title));
  if (sub) s.append(h('p', 'c-sub', sub));
  app.append(s);
  return s;
};

// 1. 阵容
const sLine = section(
  'lineup',
  '全体阵容',
  '左：花名册里的 48×48 肖像（2×）；右：地图上的小人（3×，在演自己的 idle，拿着自己的道具）。',
);
const grid = h('div', 'c-lineup');
for (const m of CAST) {
  const c = h('div', 'c-card');
  const pf = h('div', 'c-pface');
  pf.style.background = m.tint;
  pf.append(face(m, 'neutral', 48, 2));
  const sp = h('div', 'c-spr');
  sp.append(live(m, 'idle', 'front', 3));
  const row = h('div', 'c-card-art');
  row.append(pf, sp);
  c.append(row, h('div', 'c-name', `<b>${m.name}</b><span>${m.role}</span>`), h('div', 'c-line', m.line));
  grid.append(c);
}
sLine.append(grid);

// 2. 表情
const sFace = section(
  'faces',
  '表情（每人五张）',
  '平常 · 高兴 · 生气 · 累/难过 · 吃惊。眼睛、眉毛、嘴三个部件换，脸和头发不动。1×。',
);
const head = h('div', 'c-exhead');
head.append(h('span', '', ''));
for (const e of EXPRS) head.append(h('span', '', EXPR_ZH[e]));
sFace.append(head);
for (const m of CAST) {
  const r = h('div', 'c-exrow');
  r.append(h('span', 'c-exname', m.name));
  for (const e of EXPRS) {
    const b = h('span', 'c-exface');
    b.style.background = m.tint;
    b.append(face(m, e, 48, 1));
    r.append(b);
  }
  sFace.append(r);
}

// 3. 动作
const sMove = section(
  'moves',
  '动作',
  '每人自己的 idle（Dale 揉腰、Gus 叹气、Lily 看手机、Mateo 抛球……），3×。点名字看全套：idle / 走路 4 帧 / 正手 / 高兴 / 生气，正面和背面（左右由翻转得到）。',
);
const idles = h('div', 'c-idles');
for (const m of CAST) {
  const b = h('button', 'c-idle');
  b.append(live(m, 'idle', 'front', 3), h('span', '', m.name));
  b.addEventListener('click', () => showSet(m));
  idles.append(b);
}
sMove.append(idles);
const setBox = h('div', 'c-set');
sMove.append(setBox);
function showSet(m: Member): void {
  for (let i = lives.length - 1; i >= 0; i--) if (setBox.contains((lives[i] as Live).cv)) lives.splice(i, 1);
  setBox.innerHTML = '';
  setBox.append(h('div', 'c-set-title', `${m.name} 的全套`));
  const tbl = h('div', 'c-set-grid');
  tbl.append(h('span', ''), h('span', 'c-set-h', '正面'), h('span', 'c-set-h', '背面'));
  const names: [AnimId, string][] = [
    ['idle', 'idle'],
    ['walk', '走路'],
    ['swing', '正手'],
    ['happy', '高兴'],
    ['angry', '生气'],
  ];
  for (const [a, t] of names) {
    tbl.append(h('span', 'c-set-l', `${t}<i>${anim(m.sprite, a).poses.length} 帧</i>`));
    for (const f of ['front', 'back'] as const) {
      const cell = h('span', 'c-set-c');
      cell.append(live(m, a, f, 4));
      tbl.append(cell);
    }
  }
  setBox.append(tbl);
}
showSet((CAST.find((c) => c.id === Q.get('set')) ?? CAST[0]) as Member);

// 4. 近看
const sClose = section('close', '近看', '肖像 4×、小人 8×，看清每个像素。');
const close = h('div', 'c-close');
for (const id of (Q.get('close') ?? 'dale,gus,teo,mateo').split(',')) {
  const m = CAST.find((c) => c.id === id) as Member;
  const b = h('div', 'c-close-item');
  const pf = h('div', 'c-pface');
  pf.style.background = m.tint;
  pf.append(face(m, (Q.get('expr') as Expr) || 'neutral', 48, 4));
  b.append(pf, h('div', 'c-name', `<b>${m.name}</b><span>48×48 · 32×32 小号 ↓</span>`));
  const small = h('div', 'c-close-small');
  const s1 = h('div', 'c-pface');
  s1.style.background = m.tint;
  s1.append(face(m, 'neutral', 32, 2));
  const s2 = h('div', 'c-pface');
  s2.style.background = m.tint;
  s2.append(face(m, 'neutral', 32, 1));
  small.append(s1, s2);
  b.append(small);
  close.append(b);
}
sClose.append(close);
const closeSpr = h('div', 'c-close-spr');
for (const id of ['dale', 'gus', 'lily', 'ray', 'nadia', 'mia']) {
  const m = CAST.find((c) => c.id === id) as Member;
  const b = h('div', 'c-close-sp');
  b.append(live(m, 'idle', 'front', 8, false), h('span', '', m.name));
  closeSpr.append(b);
}
sClose.append(closeSpr);

// 5. 放进游戏
const sScene = section(
  'scene',
  '放进游戏',
  '真的 Palm Oasis，镜头 = 游戏手机竖屏的默认档（zoom 4）。地图上没有肖像：气泡是一句话 + 像素表情 + 名字小牌 + 招牌色边，说话的人自己跳一下/跺脚；员工条是小人的头；事件卡是 Gus 的小人，地图上他头顶冒 ▼ Gus。左下一排是现在的 8×14 Person，右边一排是 C 的小人。员工条最左边的「花名册」打开菜单，肖像只在那里。',
);
const phone = h('div', 'c-phone');
const stageEl = h('div', 'c-stage');
phone.append(stageEl);
sScene.append(phone);
const zoomBar = h('div', 'c-zoom');
const ZOOMS: [number, string][] = [
  [4, '游戏默认'],
  [7.8, '近一档'],
  [3, '远一档'],
];
const ps = Number(Q.get('ps')) || 2;
const scene = createScene(stageEl, { zoom: Number(Q.get('zoom')) || 4, pixelSize: ps });
for (const [z, t] of ZOOMS) {
  const b = h('button', 'k-btn ghost', t);
  b.addEventListener('click', () => scene.setZoom(z));
  zoomBar.append(b);
}
sScene.append(zoomBar);
const roster = createRoster(face, (m, sc) => live(m, 'idle', 'front', sc, false));
const hud = createHud({
  head: spriteHead,
  sprite: (m, sc) => live(m, 'idle', 'front', sc, false),
  emote: emoteCv,
  openRoster: (id) => roster.open(id),
});
(window as unknown as { cScene: typeof scene }).cScene = scene;
phone.append(hud.root, roster.root);
const tagOld = h('div', 'c-tag', '↑ 现在 8×14');
const tagNew = h('div', 'c-tag c-tag-new', '↑ C 10×18');
phone.append(tagOld, tagNew);

// 6. 花名册
const sRoster = section(
  'roster',
  '花名册（菜单）',
  '肖像只在这里：从员工条最左边的「花名册」打开。列表一行一个人（肖像按士气换表情、岗位、最强两项能力、特质、周薪、士气），点进去是详情：2× 大肖像、背景、四项能力和潜力、特质、喜欢/讨厌、五张表情（点一张换大图），◀ ▶ 或左右滑切人。',
);
const ob = h('button', 'k-btn primary', '打开花名册');
ob.addEventListener('click', () => {
  phone.scrollIntoView({ block: 'start' });
  roster.open();
});
const od = h('button', 'k-btn ghost', '看 Gus 的详情');
od.addEventListener('click', () => {
  phone.scrollIntoView({ block: 'start' });
  roster.open('gus');
});
const ow = h('div', 'c-zoom');
ow.append(ob, od);
sRoster.append(ow);

// 7. 规格
const sNotes = section('notes', '规格和说明');
sNotes.append(h('div', 'c-notes', NOTES_HTML));

// "?" 浮层
const modal = h('div', 'k-modal c-modal');
modal.hidden = true;
const mc = h('div', 'k-card c-modal-card');
const x = h('button', 'k-btn ghost c-modal-x', '关闭');
mc.append(h('div', 'c-notes', NOTES_HTML), x);
modal.append(mc);
document.body.append(modal);
help.addEventListener('click', () => {
  modal.hidden = false;
});
x.addEventListener('click', () => {
  modal.hidden = true;
});

/* ---------------- 每帧 ---------------- */
const t0 = performance.now();
const tick = () => {
  const t = (performance.now() - t0) / 1000;
  for (const L of lives) drawLive(L, t);
  // 气泡跟着小人头顶
  for (const b of hud.bubbles) {
    const m = scene.minis.get(b.id);
    if (!m) continue;
    const p = scene.project(m.pos.x, 0, m.pos.z);
    b.el.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y - 22 * ps * scene.world.view.proj.spriteScale)}px)`;
    // 每 5 秒说一次：气泡弹一下，小人同时做动作（情绪由小人演）
    const k = Math.floor((t + hud.bubbles.indexOf(b) * 2.5) / 5);
    if (k !== Number(b.el.dataset.k ?? -1)) {
      b.el.dataset.k = String(k);
      b.el.classList.remove('c-say');
      void b.el.offsetWidth;
      b.el.classList.add('c-say');
      if (!m.once) m.play(b.act, scene.now());
    }
  }
  {
    const m = scene.minis.get(hud.pointer.id);
    if (m) {
      const p = scene.project(m.pos.x, 0, m.pos.z);
      const bob = Math.round(Math.abs(Math.sin(t * 4)) * -4);
      hud.pointer.el.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y - 22 * ps * scene.world.view.proj.spriteScale) + bob}px)`;
    }
  }
  const a = scene.project(scene.compareAt.x, 0, scene.compareAt.z);
  const c = scene.project(scene.oursAt.x, 0, scene.oursAt.z);
  tagOld.style.transform = `translate(${Math.round(a.x)}px, ${Math.round(a.y + 8)}px)`;
  tagNew.style.transform = `translate(${Math.round(c.x)}px, ${Math.round(c.y + 8)}px)`;
  requestAnimationFrame(tick);
};
requestAnimationFrame(tick);

if (Q.get('view') === 'scene' || Q.get('view') === 'roster')
  requestAnimationFrame(() => phone.scrollIntoView({ block: 'start' }));
if (Q.get('view') === 'roster') roster.open(Q.get('who') ?? undefined);

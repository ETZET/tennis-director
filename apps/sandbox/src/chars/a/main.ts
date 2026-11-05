import '../../demos/kit/kit.css';
import './style.css';
import { animOf, CAST, type CastMember, frameAt } from './cast';
import { blit, ground, shadow } from './draw2d';
import { NOTES_HTML } from './notes';
import { mountScenes } from './scene';

/**
 * 人物方向 A「写实比例 16×32」：阵容、动作、近看、放进游戏、说明。
 * 页面上的小画布都按素材像素画，CSS 整数倍放大（pixelated）。
 */

const q = new URLSearchParams(location.search);
const app = document.getElementById('app') as HTMLElement;

type Tick = (t: number) => void;
const ticks: { el: HTMLElement; fn: Tick; on: boolean }[] = [];
const io = new IntersectionObserver((es) => {
  for (const e of es) {
    const t = ticks.find((k) => k.el === e.target);
    if (t) t.on = e.isIntersecting;
  }
});
function onTick(el: HTMLElement, fn: Tick): void {
  ticks.push({ el, fn, on: true });
  io.observe(el);
}

/** 一块画着一个人动画的小画布 */
function spriteCanvas(
  c: CastMember,
  anim: string,
  facing: 'front' | 'back',
  o: { w: number; h: number; scale: number; flip?: boolean; phase?: number; kind?: 'sand' | 'court' },
): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = o.w;
  cv.height = o.h;
  cv.style.width = `${o.w * o.scale}px`;
  cv.style.height = `${o.h * o.scale}px`;
  cv.className = 'px';
  const ctx = cv.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
  const A = animOf(c, anim, facing);
  let last = -1;
  onTick(cv, (t) => {
    const i = frameAt(A, t + (o.phase ?? 0));
    if (i === last) return;
    last = i;
    ground(ctx, o.w, o.h, o.kind);
    const fx = Math.floor(o.w / 2);
    const fy = o.h - 3;
    shadow(ctx, fx, fy, c.look.build.kid ? 4 : 6);
    blit(ctx, A.frames[i] as never, fx, fy, o.flip);
  });
  return cv;
}

function h(tag: string, cls = '', html = ''): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

/* ---------- 页头 ---------- */
const head = h(
  'header',
  'top',
  `<div><div class="k-label">人物方向 A</div><h1>写实比例 16×32</h1>
<p class="lead">成人 16×32（小孩 12×22），约 5 头身；五官、皱纹、胡子、衣褶都画得出来。下面依次是阵容、动作、近看、放进球场里的样子。</p></div>`,
);
const help = h('button', 'k-topbtn help', '?');
help.setAttribute('aria-label', '说明');
document.body.append(help);
app.append(head);

/* ---------- 1. 阵容 ---------- */
const s1 = h('section', 'sec', '<h2><span>1</span>全体阵容</h2>');
const grid = h('div', 'lineup');
CAST.forEach((c, i) => {
  const card = h('div', 'card');
  card.append(
    spriteCanvas(c, q.get('lineup') ?? 'quirk', q.get('back') ? 'back' : 'front', {
      w: 26,
      h: 38,
      scale: 3,
      phase: i * 0.37,
    }),
  );
  card.append(h('div', 'nm', c.name), h('div', 'ln', c.line));
  grid.append(card);
});
s1.append(grid);
app.append(s1);

/* ---------- 2. 动作 ---------- */
const s2 = h(
  'section',
  'sec',
  '<h2><span>2</span>动作</h2><p class="sub">点名字换人。正面、背面各一套，朝左是水平翻转。</p>',
);
const chips = h('div', 'chips');
const actBox = h('div', 'acts');
s2.append(chips, actBox);
app.append(s2);
const ACTS: [string, string, 'front' | 'back', boolean?][] = [
  ['idle', '呼吸', 'front'],
  ['quirk', '小动作', 'front'],
  ['walk', '走路 正', 'front'],
  ['walk', '走路 背', 'back'],
  ['walk', '走路 左', 'front', true],
  ['walk', '走路 背左', 'back', true],
  ['swing', '正手 正', 'front'],
  ['swing', '正手 背', 'back'],
  ['emo', '情绪', 'front'],
];
function showActs(c: CastMember): void {
  actBox.innerHTML = '';
  for (const [a, label, f, flip] of ACTS) {
    const cell = h('div', 'act');
    cell.append(spriteCanvas(c, a, f, { w: 32, h: 42, scale: 3, flip }), h('div', 'al', label));
    actBox.append(cell);
  }
  for (const b of chips.children) b.classList.toggle('on', (b as HTMLElement).dataset.id === c.id);
}
for (const c of CAST) {
  const b = h('button', 'chip', c.name.replace(/（.*）/, ''));
  b.dataset.id = c.id;
  b.onclick = () => showActs(c);
  chips.append(b);
}

/* ---------- 3. 近看 ---------- */
const s3 = h(
  'section',
  'sec',
  '<h2><span>3</span>近看</h2><p class="sub">4 倍放大（手机上约 2.3 cm 高），看得清每个像素。</p>',
);
const close = h('div', 'close');
for (const id of ['dale', 'gus', 'teodora', 'nadia', 'lily', 'ray', 'mateo', 'tourist']) {
  const c = CAST.find((k) => k.id === id) as CastMember;
  const cell = h('div', 'cl');
  cell.append(spriteCanvas(c, 'idle', 'front', { w: 20, h: 36, scale: 4 }), h('div', 'al', c.name));
  close.append(cell);
}
s3.append(close);
app.append(s3);

/* ---------- 4. 放进游戏 ---------- */
const s4 = h('section', 'sec scene-sec', '<h2><span>4</span>放进游戏</h2>');
app.append(s4);
mountScenes(s4, onTick);

/* ---------- 5. 说明 ---------- */
const s5 = h('section', 'sec notes', `<h2><span>5</span>说明</h2>${NOTES_HTML}`);
app.append(s5);

const modal = h('div', 'k-modal hidden');
modal.innerHTML = `<div class="k-card notes">${NOTES_HTML}<button class="k-btn primary close-btn">知道了</button></div>`;
document.body.append(modal);
help.onclick = () => modal.classList.remove('hidden');
(modal.querySelector('.close-btn') as HTMLElement).onclick = () => modal.classList.add('hidden');

showActs(CAST.find((c) => c.id === (q.get('who') ?? 'dale')) ?? (CAST[0] as CastMember));

if (q.get('view') === 'scene') for (const ms of [300, 900, 1600]) setTimeout(() => s4.scrollIntoView(), ms);
if (q.get('view') === 'acts') requestAnimationFrame(() => s2.scrollIntoView());
if (q.get('view') === 'close') requestAnimationFrame(() => s3.scrollIntoView());

const t0 = performance.now();
function loop(): void {
  const t = (performance.now() - t0) / 1000;
  for (const k of ticks) if (k.on) k.fn(t);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// 截图用：?at=元素 id 直接滚到那里（scene-1 / scene-2 / scene-3）
if (q.get('at'))
  for (const ms of [300, 900, 1600])
    setTimeout(() => document.getElementById(q.get('at') as string)?.scrollIntoView(), ms);

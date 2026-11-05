import '../../demos/kit/kit.css';
import './style.css';
import { type AnimName, byId, CAST, type Member } from './cast';
import { DOC_HTML } from './doc';
import { paletteFor } from './paint';
import type { Facing } from './rig';
import { mountScenes } from './scene';
import { blit, boxOf, type Frame, frameAt, frames } from './sheet';

/**
 * E 方向「高清像素 24×40：有光影的插画感」的展示页。
 * 1 阵容 · 2 动作 · 3 近看和换色 · 4 放进游戏（三档镜头）· 5 说明。?view=scene 直接滚到第 4 块。
 */

const app = document.getElementById('app') as HTMLElement;
const Q = new URLSearchParams(location.search);
const SAND = '#cfae7e';
const SAND_D = '#bf9c6c';

/* ---------- 一个会动的小画布 ---------- */
interface Cell {
  cv: HTMLCanvasElement;
  draw(t: number): void;
  visible: boolean;
}
const cells: Cell[] = [];
const io = new IntersectionObserver((es) => {
  for (const e of es) {
    const c = cells.find((q) => q.cv === e.target);
    if (c) c.visible = e.isIntersecting;
  }
});

function spriteCanvas(
  get: () => { m: Member; anim: AnimName; facing: Facing; flip?: boolean; racket?: boolean; offset?: number },
  scale: number,
  box: { w: number; h: number; ox: number; oy: number },
  bg = SAND,
): Cell {
  const cv = document.createElement('canvas');
  cv.width = box.w;
  cv.height = box.h;
  cv.style.width = `${box.w * scale}px`;
  cv.style.height = `${box.h * scale}px`;
  const ctx = cv.getContext('2d') as CanvasRenderingContext2D;
  const img = ctx.createImageData(box.w, box.h);
  const bgc = Number.parseInt(bg.slice(1), 16);
  const bgd = Number.parseInt(SAND_D.slice(1), 16);
  const pack = (n: number) => (255 << 24) | ((n & 255) << 16) | (n & 0xff00) | ((n >> 16) & 255);
  let last = '';
  const cell: Cell = {
    cv,
    visible: false,
    draw(t) {
      const g = get();
      const fs = frames(g.m, g.anim, g.facing, g.flip, g.racket);
      const i = frameAt(g.m, g.anim, t + (g.offset ?? 0));
      const key = `${g.m.id}${g.anim}${g.facing}${g.flip}${i}`;
      if (key === last) return;
      last = key;
      const d = new Uint32Array(img.data.buffer);
      d.fill(pack(bgc));
      // 影子：脚下一块压暗的椭圆，往右偏（光从左来）
      const sx = box.ox + 1;
      const sy = box.oy;
      const kid = g.m.build.body === 'kid';
      const rx = kid ? 5 : 7;
      for (let y = sy - 2; y <= sy + 2; y++)
        for (let x = sx - rx - 1; x <= sx + rx + 1; x++) {
          const dx = (x + 0.5 - sx) / rx;
          const dy = (y + 0.5 - sy) / 2.2;
          if (x >= 0 && y >= 0 && x < box.w && y < box.h && dx * dx + dy * dy <= 1) d[y * box.w + x] = pack(bgd);
        }
      blit(img, fs[i] as Frame, box.ox, box.oy);
      ctx.putImageData(img, 0, 0);
    },
  };
  cells.push(cell);
  io.observe(cv);
  return cell;
}

/** 所有人所有动作的统一格子（锚点对齐），格子一样大页面才整齐 */
function unionBox(ms: Member[], anims: AnimName[], facings: Facing[] = ['front', 'back']) {
  const all: Frame[] = [];
  for (const m of ms) for (const a of anims) for (const f of facings) all.push(...frames(m, a, f));
  const b = boxOf(all);
  return { w: b.w + 4, h: b.h + 3, ox: b.ox + 2, oy: b.oy + 1 };
}

const el = (tag: string, cls?: string, html?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};

/* ---------- 检查用：?sheet=dale,rosa&anim=idle&s=5 只画一张大的联系表（每帧一格，正 / 背两行） ---------- */
const sheetQ = Q.get('sheet');
if (sheetQ) {
  const ids = sheetQ === 'all' ? CAST.map((m) => m.id) : sheetQ.split(',');
  const anim = (Q.get('anim') ?? 'idle') as AnimName;
  const sc = Number(Q.get('s') ?? 5);
  const wrap = el('div', '');
  wrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:2px';
  for (const id of ids) {
    const m = byId(id);
    const fsF = frames(m, anim, 'front');
    const box = unionBox([m], [anim]);
    for (const facing of (Q.get('back') ? ['front', 'back'] : ['front']) as Facing[])
      for (let i = 0; i < fsF.length; i++) {
        const cv = document.createElement('canvas');
        cv.width = box.w;
        cv.height = box.h;
        cv.style.width = `${box.w * sc}px`;
        const ctx = cv.getContext('2d') as CanvasRenderingContext2D;
        const img = ctx.createImageData(box.w, box.h);
        new Uint32Array(img.data.buffer).fill(0xff7eaecf);
        blit(img, frames(m, anim, facing)[i] as Frame, box.ox, box.oy);
        ctx.putImageData(img, 0, 0);
        wrap.append(cv);
      }
  }
  document.body.style.background = '#14223a';
  app.style.maxWidth = 'none';
  app.append(wrap);
  throw new Error('sheet only');
}

/* ---------- 头 ---------- */
const head = el('div', 'e-head');
head.append(
  el(
    'div',
    '',
    '<h1>E · 高清像素 24×40：有光影的插画感</h1><p>成人约 24×40 像素、小孩约 18×28；每种材质 5 级色阶（暗部偏冷、亮部偏暖），左边沙漠太阳的轮廓光，几乎不描边。换色还是运行时按色阶生成。</p>',
  ),
);
const help = el('button', 'e-help', '?') as HTMLButtonElement;
help.setAttribute('aria-label', '说明');
head.append(help);
app.append(head);

/* ---------- 1 阵容 ---------- */
const s1 = el('section', 'e-sec');
s1.innerHTML = '<h2>1 · 全体阵容<span class="k-label">2× · idle</span></h2>';
const grid = el('div', 'e-grid');
const lineupBox = unionBox(CAST, ['idle'], ['front']);
CAST.forEach((m, i) => {
  const c = el('div', 'e-cell');
  const cell = spriteCanvas(() => ({ m, anim: 'idle', facing: 'front', offset: i * 0.37 }), 2, lineupBox);
  c.append(cell.cv, el('div', 'e-name', m.name), el('div', 'e-role', m.role), el('div', 'e-line', m.line));
  grid.append(c);
});
s1.append(grid);
app.append(s1);

/* ---------- 2 动作 ---------- */
const s2 = el('section', 'e-sec');
s2.innerHTML =
  '<h2>2 · 动作<span class="k-label">2× · 正面 / 背面</span></h2><p class="e-note">每人：有个性的 idle、走路 4 帧、正手挥拍 4 帧、一个情绪。左右两个朝向用翻转（翻转后重新打光，光一直从左边来）。点名字换人。</p>';
const chips = el('div', 'e-chips');
let sel = byId('dale');
const ANIMS: [AnimName, string][] = [
  ['idle', 'idle'],
  ['walk', '走路'],
  ['swing', '正手'],
  ['emote', '情绪'],
];
const actBox = unionBox(CAST, ['idle', 'walk', 'swing', 'emote']);
for (const m of CAST) {
  const b = el('button', `e-chip${m === sel ? ' on' : ''}`, m.name) as HTMLButtonElement;
  b.onclick = () => {
    sel = m;
    for (const q of chips.children) q.classList.toggle('on', q === b);
  };
  chips.append(b);
}
const acts = el('div', 'e-acts');
for (const facing of ['front', 'back'] as Facing[])
  for (const [a, label] of ANIMS) {
    const c = el('div', 'e-cell');
    const cell = spriteCanvas(() => ({ m: sel, anim: a, facing }), 2, actBox);
    cell.cv.style.width = '100%';
    cell.cv.style.height = 'auto';
    c.append(cell.cv, el('div', 'e-role', `${label} · ${facing === 'front' ? '正' : '背'}`));
    acts.append(c);
  }
s2.append(chips, acts);
app.append(s2);

/* ---------- 3 近看 + 换色 ---------- */
const s3 = el('section', 'e-sec');
s3.innerHTML =
  '<h2>3 · 近看<span class="k-label">3× · 手机上约 2 cm 高</span></h2><p class="e-note">脸：眼睛高光、眼角纹、胡茬、腮红；衣服：polo 领、门襟扣子、1–2 像素的 logo、裤缝；手臂压在身上的地方有一格环境光遮蔽。</p>';
const close = el('div', 'e-close');
const closeIds = ['dale', 'teodora', 'ray'];
const closeBox = unionBox(closeIds.map(byId), ['idle'], ['front']);
for (const id of closeIds) {
  const m = byId(id);
  const c = el('div', 'e-cell');
  const cell = spriteCanvas(() => ({ m, anim: 'idle', facing: 'front' }), 3, { ...closeBox, w: closeBox.w - 2 });
  c.append(cell.cv, el('div', 'e-name', m.name));
  close.append(c);
}
s3.append(close);
// 色阶
const ramps = el('div', 'e-ramps');
const dale = paletteFor(byId('dale').look).ramps;
for (const [k, label] of [
  ['S', '皮肤'],
  ['T', '上衣'],
  ['M', '胡子'],
  ['P', '帽子'],
  ['B', '裤子'],
] as const) {
  const r = el('div', 'e-ramp');
  for (const c of dale[k]) {
    const i = el('i');
    i.style.background = `rgb(${c[0]},${c[1]},${c[2]})`;
    r.append(i);
  }
  ramps.append(el('span', '', `Dale · ${label}`), r);
}
s3.append(el('p', 'e-note', '色阶（暗边 → 暗部 → 本色 → 受光 → 轮廓光）：只给一个基色，其余四级自动推。'), ramps);
// 换色
s3.append(el('p', 'e-note', '换色：同一套部件，运行时换基色（客人随机配色仍然可行）。'));
const variety = el('div', 'e-grid');
const RAND_T = ['#e05a8f', '#2fa3a8', '#f0a020', '#8a5ac4', '#3c7a5a', '#c84a3a', '#4a6fa8', '#d9c35a'];
const RAND_S = ['#f1c7a1', '#d9a47c', '#a86f4c', '#5f3a28'];
const RAND_H = ['#2a1d16', '#a7742f', '#d9d3c6', '#6a4a30'];
const tour = byId('tourist');
const varBox = unionBox([tour], ['idle'], ['front']);
for (let i = 0; i < 4; i++) {
  const m: Member = {
    ...tour,
    id: `tourist-v${i}`,
    look: {
      ...tour.look,
      T: RAND_T[(i * 3 + 1) % 8],
      C: RAND_T[(i * 5 + 2) % 8],
      S: RAND_S[i],
      H: RAND_H[(i + 1) % 4],
    },
  };
  const c = el('div', 'e-cell');
  c.append(spriteCanvas(() => ({ m, anim: 'idle', facing: 'front', offset: i * 0.5 }), 2, varBox).cv);
  variety.append(c);
}
s3.append(variety);
app.append(s3);

/* ---------- 4 放进游戏 ---------- */
const s4 = el('section', 'e-sec');
s4.id = 'scene';
s4.innerHTML =
  '<h2>4 · 放进游戏<span class="k-label">真的 Palm Oasis · 外场 1</span></h2><p class="e-note">同一块球场三档镜头。红牌 = 现在的人（Person），蓝牌 = E 方向。</p>';
app.append(s4);
const scenes = mountScenes(s4);

/* ---------- 5 说明 ---------- */
const s5 = el('section', 'e-sec');
s5.id = 'doc';
s5.innerHTML = `<h2>5 · 说明</h2><div class="e-doc">${DOC_HTML}</div>`;
app.append(s5);
help.onclick = () => s5.scrollIntoView({ behavior: 'smooth' });

/* ---------- 循环 ---------- */
const t0 = performance.now();
let prev = t0;
function loop(now: number): void {
  const t = (now - t0) / 1000;
  const dt = Math.min(0.05, (now - prev) / 1000);
  prev = now;
  for (const c of cells) if (c.visible) c.draw(t);
  scenes.update(dt, t);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

if (new URLSearchParams(location.search).get('view') === 'scene') {
  const go = () => (s4.querySelector('.e-scene') ?? s4).scrollIntoView();
  requestAnimationFrame(go);
  setTimeout(go, 300);
}

// 半屏卡（点开以后的东西：人物卡、名册看板）：从底下升起来的一张奶油纸卡，和常驻界面一套（墨色 1 纹素描边、
// 下面一纹素深影、点阵数字、平滑字只用在名字和一句话上）。手机竖屏占底部，不盖画面中间；横屏是底部正中一张窄卡。
// 能画就不写：这里给卡片用的像素小部件 —— 字形、好感心、短进度条、一天的时间带、代价一行（小时钟 / 金币 + 点阵数字）。
// 点卡片外面 = 收起（不穿透到场景，不会顺手让总监走过去）；往下滑 = 收起。
// 打开卡片的那一下（界面按钮的 pointerup）之后，手机会再补一个 click 落在新卡片上（"幽灵点击"）：卡片里的点按只认
// 在卡片里按下、又在同一个东西上抬起的（tap()），不认裸 click。
import { CREAM, hex, INK, INK_SHADOW, KEYS } from './colors';
import { textCanvas } from './font';
import { ACT, type ActIcon, DIGITS, GLYPH, type GlyphId, TINY } from './glyphs';
import { ICONS } from './icons';
import { hudScale } from './scale';
import { type Sprite, spriteCanvas } from './sprite';

const ink = hex(INK);
const shadow = hex(INK_SHADOW);
const cream = hex(CREAM);
/** 卡纸暗一档（分隔、空槽） */
export const PAPER_DARK = KEYS.w;
const paperDark = hex(PAPER_DARK);

/** 1 纹素墨边 + 下面 1 纹素深影（同 hud 的奶油牌子），按纹素 --s 走 */
const FRAME = (s: number) =>
  `box-shadow: ${s}px 0 0 0 ${ink}, -${s}px 0 0 0 ${ink}, 0 ${s}px 0 0 ${ink}, 0 -${s}px 0 0 ${ink}, 0 ${s * 2}px 0 0 ${shadow}, ${s}px ${s}px 0 0 ${shadow}, -${s}px ${s}px 0 0 ${shadow};`;

export const SHEET_CSS = `
.pxs-shade { --s: 2; position: fixed; inset: 0; z-index: 20; pointer-events: auto; touch-action: none; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
.pxs-shade[hidden] { display: none !important; }
.pxs-sheet { position: absolute; left: 50%; bottom: max(calc(var(--s) * 3px), env(safe-area-inset-bottom)); width: calc(100vw - var(--s) * 6px); max-width: 420px;
  transform: translateX(-50%); background: ${cream}; ${FRAME(hudScale())} color: ${ink};
  padding: calc(var(--s) * 5px) calc(var(--s) * 5px) calc(var(--s) * 5px); box-sizing: border-box; animation: pxs-rise 0.24s steps(4, end); }
@keyframes pxs-rise { from { transform: translate(-50%, 60%); } to { transform: translate(-50%, 0); } }
/* 横屏：贴右下角一张窄卡（不压画面中间；总监在正中） */
@media (orientation: landscape) {
  .pxs-sheet { left: auto; right: max(calc(var(--s) * 4px), env(safe-area-inset-right)); width: 360px; max-width: 360px; transform: none; animation-name: pxs-rise-r; }
}
@keyframes pxs-rise-r { from { transform: translateY(60%); } to { transform: none; } }
/* 卡顶上浮的一行字（同参考：一行白字黑边，过一会儿消失）：按了哪个按钮、得了什么 */
.pxs-say { position: absolute; left: 0; right: 0; bottom: calc(100% + var(--s) * 28px); display: flex; justify-content: center; pointer-events: none; transition: opacity 0.4s steps(3, end); }
.pxs-say.gone { opacity: 0; }
.pxs-say:not(.gone) { transition: none; }
/* 好感变了：心旁边一颗心闪三下 */
.pxs-blink { position: absolute; pointer-events: none; animation: pxs-blink 1.2s steps(1, end) forwards; }
@keyframes pxs-blink { 0%, 33%, 66% { opacity: 1; } 16%, 50%, 83% { opacity: 0; } 100% { opacity: 0; } }
.pxs-say span { font: 600 15px/1.25 "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", system-ui, sans-serif; color: ${cream}; letter-spacing: 0.5px; white-space: nowrap;
  text-shadow: 1px 0 0 ${ink}, -1px 0 0 ${ink}, 0 1px 0 ${ink}, 0 -1px 0 ${ink}, 1px 1px 0 ${ink}, -1px 1px 0 ${ink}, 1px -1px 0 ${ink}, -1px -1px 0 ${ink}, 0 2px 0 ${shadow}; }
.pxs-sheet .pxh-px, .pxs-px { display: block; image-rendering: pixelated; image-rendering: crisp-edges; flex: none; }
.pxs-sheet button { border: 0; margin: 0; padding: 0; background: none; color: inherit; font: inherit; cursor: pointer; touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
.pxs-sheet button:focus-visible { outline: 2px solid ${ink}; outline-offset: 1px; }
.pxs-btn { min-width: 48px; min-height: 48px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: calc(var(--s) * 1px); }
.pxs-btn.down > .pxs-px:first-child, .pxs-btn:active > .pxs-px:first-child { transform: translateY(calc(var(--s) * 1px)); }
.pxs-btn:disabled, .pxs-btn.off { opacity: 0.38; }
/* 卡顶探出来的小纸条（右上的关、正中的展开）：和卡片同一张纸，三边描边 */
.pxs-tab { background: ${cream}; padding: calc(var(--s) * 2px) calc(var(--s) * 3px); box-shadow: calc(var(--s) * 1px) 0 0 0 ${ink}, calc(var(--s) * -1px) 0 0 0 ${ink}, 0 calc(var(--s) * -1px) 0 0 ${ink}; }
.pxs-x { position: absolute; right: calc(var(--s) * 3px); top: calc(var(--s) * -14px); width: 52px; height: 52px; justify-content: flex-start !important; }
.pxs-tab { box-sizing: border-box; height: calc(var(--s) * 22px); display: flex; align-items: center; justify-content: center; padding: 0 calc(var(--s) * 6px) !important; }
.pxs-x { top: calc(var(--s) * -22px); }
/* 大按钮（不当面时的走过去、发消息）：同一张纸凸起来一块，墨边 + 底下一纹素深影 */
.pxs-big { background: ${cream}; ${FRAME(hudScale())} min-height: 60px; margin: 0 2px 4px; }
/* 名字和一句话：卡片上仅有的两种字（平滑系统字，墨色） */
.pxs-name { font: 700 17px/1.15 "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", system-ui, sans-serif; letter-spacing: 0.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pxs-line { font: 500 14px/1.35 "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", system-ui, sans-serif; color: ${ink}; opacity: 0.86; }
.pxs-line.bad { color: #8a3a4e; opacity: 1; }
.pxs-chip { font: 600 12px/1 "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", system-ui, sans-serif; padding: calc(var(--s) * 2px) calc(var(--s) * 3px); background: ${paperDark}; color: ${ink}; white-space: nowrap; box-shadow: 2px 0 0 0 ${ink}, -2px 0 0 0 ${ink}, 0 2px 0 0 ${ink}, 0 -2px 0 0 ${ink}, 0 4px 0 0 ${shadow}; margin: 2px; }
/* 分隔：一纹素的暗纸色虚线 */
.pxs-rule { height: calc(var(--s) * 1px); margin: calc(var(--s) * 3px) 0; background: repeating-linear-gradient(90deg, ${paperDark} 0 calc(var(--s) * 2px), transparent calc(var(--s) * 2px) calc(var(--s) * 4px)); }
/* 往上飘的心（好感变了） */
.pxs-float { position: absolute; pointer-events: none; animation: pxs-up 1.4s steps(7, end) forwards; }
@keyframes pxs-up { 0% { transform: translateY(0); opacity: 1; } 75% { opacity: 1; } 100% { transform: translateY(calc(var(--s) * -14px)); opacity: 0; } }
`;

let cssDone = false;
function injectCss() {
  if (cssDone || document.getElementById('pxs-css')) return;
  cssDone = true;
  const st = document.createElement('style');
  st.id = 'pxs-css';
  st.textContent = SHEET_CSS;
  document.head.appendChild(st);
}

// ── 像素小部件（都返回 1 纹素 = 1 像素的 canvas；px() 按纹素放大放进页面） ──

/** 像素图放进页面：k 倍纹素（默认 1 = hudScale） */
export function px(src: HTMLCanvasElement, k = 1, cls = ''): HTMLCanvasElement {
  const s = hudScale() * k;
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  (c.getContext('2d') as CanvasRenderingContext2D).drawImage(src, 0, 0);
  c.className = `pxs-px ${cls}`.trim();
  c.style.width = `${src.width * s}px`;
  c.style.height = `${src.height * s}px`;
  if (src.dataset.chars) c.dataset.chars = src.dataset.chars;
  return c;
}

export const glyph = (id: GlyphId) => spriteCanvas(GLYPH[id], `g-${id}`);
export const actIcon = (id: ActIcon) => spriteCanvas(ACT[id], `a-${id}`);

function cv(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d') as CanvasRenderingContext2D];
}

/** 把一个不描边的小精灵画进 g（x, y） */
function stamp(g: CanvasRenderingContext2D, s: Sprite, x: number, y: number) {
  s.rows.forEach((row, yy) => {
    for (let xx = 0; xx < row.length; xx++) {
      const ch = row[xx];
      if (ch === '.') continue;
      const c = s.keys?.[ch] ?? KEYS[ch];
      g.fillStyle = hex(c);
      g.fillRect(x + xx, y + yy, 1, 1);
    }
  });
}

/**
 * 代价一行 / 数字：小图（'clock' 'coin'）和点阵数字串排成一行，墨色，高 5 纹素。
 * dataset.chars = 里面的数字个数（量字数时算进去）。
 */
export function tinyRow(parts: string[], color = INK): HTMLCanvasElement {
  const items: { w: number; draw(g: CanvasRenderingContext2D, x: number): void }[] = [];
  let chars = 0;
  for (const p of parts) {
    const t = TINY[p];
    if (t) {
      items.push({ w: 5, draw: (g, x) => stamp(g, t, x, 0) });
      continue;
    }
    for (const ch of p) {
      const d = DIGITS[ch];
      if (!d) continue;
      chars++;
      items.push({
        w: 3,
        draw: (g, x) => {
          g.fillStyle = hex(color);
          d.split('|').forEach((row, y) => {
            for (let k = 0; k < 3; k++) if (row[k] === '#') g.fillRect(x + k, y, 1, 1);
          });
        },
      });
    }
  }
  const w = Math.max(
    1,
    items.reduce((a, it) => a + it.w + 1, -1),
  );
  const [c, g] = cv(w, 5);
  let x = 0;
  for (const it of items) {
    it.draw(g, x);
    x += it.w + 1;
  }
  c.dataset.chars = String(chars);
  return c;
}

/**
 * 代价 / 数量：一个图标（金币 = HUD 右上那枚；时间 = 小钟）+ 5×7 点阵数字（同 HUD 的钱），墨色。
 * dataset.chars = 数字个数。
 */
export function costChip(kind: 'coin' | 'clock' | null, n: number | string, color = INK): HTMLCanvasElement {
  const ic = kind === 'coin' ? spriteCanvas(ICONS.coin, 'coin') : kind === 'clock' ? glyph('clock') : null;
  const txt = String(n);
  const tc = textCanvas(txt, { color, outline: null });
  const gap = ic ? 1 : 0;
  const w = (ic ? ic.width : 0) + gap + tc.width;
  const h = Math.max(ic ? ic.height : 0, tc.height);
  const [c, g] = cv(w, h);
  if (ic) g.drawImage(ic, 0, Math.floor((h - ic.height) / 2));
  g.drawImage(tc, (ic ? ic.width : 0) + gap, Math.floor((h - tc.height) / 2));
  c.dataset.chars = String(txt.replace(/\s/g, '').length);
  return c;
}

/** 好感 0..10 → 5 颗心（满 / 半 / 空），心之间 1 纹素 */
export function hearts(f: number): HTMLCanvasElement {
  const ids: GlyphId[] = [];
  for (let i = 0; i < 5; i++) {
    const v = f / 2 - i;
    ids.push(v >= 0.75 ? 'heart' : v >= 0.25 ? 'heartHalf' : 'heartOff');
  }
  const parts = ids.map(glyph);
  const w = parts.reduce((a, p) => a + p.width, 0) - (parts.length - 1);
  const [c, g] = cv(w, parts[0].height);
  let x = 0;
  for (const p of parts) {
    g.drawImage(p, x, 0);
    x += p.width - 1;
  }
  return c;
}

/** 短进度条：w 纹素宽、3 纹素高的槽 + 1 纹素墨边；v 0..1；notch = 每几格一个刻度 */
export function bar(v: number, w: number, fill: number, notch = 0): HTMLCanvasElement {
  const [c, g] = cv(w + 2, 5);
  g.fillStyle = hex(INK);
  g.fillRect(0, 0, w + 2, 5);
  g.fillStyle = hex(KEYS.v);
  g.fillRect(1, 1, w, 3);
  const n = Math.round(Math.max(0, Math.min(1, v)) * w);
  g.fillStyle = hex(fill);
  g.fillRect(1, 1, n, 3);
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.fillRect(1, 1, n, 1);
  if (notch) {
    g.fillStyle = hex(INK);
    for (let x = notch; x < w; x += notch) g.fillRect(1 + x, 3, 1, 1);
  }
  return c;
}

/**
 * 一天的时间带（营业 from..to 点）：左边一个太阳、右边一个月亮，中间一条槽；segs = 这个人在的时段（填他的招牌色），
 * now = 现在几点（一根墨色小竖线 + 上面一个字形：他在干什么）。w = 槽宽（纹素）。
 */
export function dayBand(o: {
  from: number;
  to: number;
  w: number;
  segs: [number, number][];
  color: number;
  now: number | null;
  mark?: GlyphId | null;
  dim?: boolean;
}): HTMLCanvasElement {
  const sun = glyph('sun');
  const moon = glyph('moon');
  const mark = o.mark ? glyph(o.mark) : null;
  const top = mark ? mark.height + 1 : 3;
  const bandY = top;
  const H = bandY + 7;
  const x0 = sun.width + 2;
  const W = x0 + o.w + 2 + 2 + moon.width;
  const [c, g] = cv(W, H);
  g.drawImage(sun, 0, bandY + 3 - Math.floor(sun.height / 2));
  g.drawImage(moon, x0 + o.w + 4, bandY + 3 - Math.floor(moon.height / 2));
  // 槽
  g.fillStyle = hex(INK);
  g.fillRect(x0, bandY, o.w + 2, 7);
  g.fillStyle = hex(PAPER_DARK);
  g.fillRect(x0 + 1, bandY + 1, o.w, 5);
  const X = (h: number) => x0 + 1 + Math.round(((h - o.from) / (o.to - o.from)) * o.w);
  g.globalAlpha = o.dim ? 0.45 : 1;
  for (const [a, b] of o.segs) {
    const xa = X(Math.max(o.from, a));
    const xb = X(Math.min(o.to, b));
    g.fillStyle = hex(o.color);
    g.fillRect(xa, bandY + 1, Math.max(1, xb - xa), 5);
    g.fillStyle = 'rgba(255,255,255,0.3)';
    g.fillRect(xa, bandY + 1, Math.max(1, xb - xa), 1);
  }
  g.globalAlpha = 1;
  // 每 3 小时一个刻度（槽底一纹素）
  g.fillStyle = hex(INK);
  for (let h = Math.ceil(o.from / 3) * 3; h < o.to; h += 3) if (h > o.from) g.fillRect(X(h), bandY + 5, 1, 1);
  if (o.now !== null && o.now >= o.from && o.now <= o.to) {
    const xn = X(o.now);
    g.fillStyle = hex(INK);
    g.fillRect(xn - 2, bandY - 2, 5, 11);
    // "现在"：一根 3 纹素宽、墨边的草帽色针（这张卡上唯一的暖色）
    g.fillStyle = hex(KEYS.X);
    g.fillRect(xn - 1, bandY - 1, 3, 9);
    if (mark) g.drawImage(mark, Math.max(0, Math.min(W - mark.width, xn - Math.floor(mark.width / 2))), 0);
  }
  return c;
}

/** 一周 7 格（周一起）：来的日子填色，今天下面一个墨点 */
export function weekPips(days: readonly number[] | null, today: number, color: number): HTMLCanvasElement {
  const [c, g] = cv(7 * 6 + 1, 9);
  for (let d = 0; d < 7; d++) {
    const x = d * 6;
    g.fillStyle = hex(INK);
    g.fillRect(x, 0, 6, 6);
    g.fillStyle = hex(!days || days.includes(d) ? color : PAPER_DARK);
    g.fillRect(x + 1, 1, 4, 4);
    if (d === today) {
      g.fillStyle = hex(INK);
      g.fillRect(x + 2, 7, 2, 2);
    }
  }
  return c;
}

/** 一周 7 个小太阳（周一起）：来的日子亮，不来的只剩一圈墨边（空心）；今天下面一条 3 纹素高的草帽色底座 */
export function weekSuns(days: readonly number[] | null, today: number): HTMLCanvasElement {
  const on = glyph('sun');
  const sw = on.width;
  const [c, g] = cv(7 * (sw + 1) - 1, on.height + 4);
  // 空心：同一张图只留墨色描边
  const [off, og] = cv(on.width, on.height);
  og.drawImage(on, 0, 0);
  const im = og.getImageData(0, 0, on.width, on.height);
  const ir = (INK >> 16) & 255;
  const ig = (INK >> 8) & 255;
  const ib = INK & 255;
  for (let i = 0; i < im.data.length; i += 4)
    if (!(im.data[i] === ir && im.data[i + 1] === ig && im.data[i + 2] === ib)) im.data[i + 3] = 0;
  og.putImageData(im, 0, 0);
  for (let d = 0; d < 7; d++) {
    const x = d * (sw + 1);
    if (d === today) {
      g.fillStyle = hex(INK);
      g.fillRect(x, on.height, sw, 4);
      g.fillStyle = hex(KEYS.X);
      g.fillRect(x + 1, on.height, sw - 2, 3);
    }
    g.drawImage(!days || days.includes(d) ? on : off, x, 0);
  }
  return c;
}

/** 按住 → 按下去的样子；在同一个按钮上按下又抬起 = 点（挡掉打开卡片那一下补来的幽灵 click） */
export function tap(el: HTMLElement, fn: (e: PointerEvent) => void) {
  let down = -1;
  let x0 = 0;
  let y0 = 0;
  el.addEventListener('pointerdown', (e) => {
    down = e.pointerId;
    x0 = e.clientX;
    y0 = e.clientY;
    el.classList.add('down');
  });
  const off = () => {
    down = -1;
    el.classList.remove('down');
  };
  el.addEventListener('pointerup', (e) => {
    const ok = down === e.pointerId && Math.hypot(e.clientX - x0, e.clientY - y0) < 14;
    off();
    if (ok && !(el as HTMLButtonElement).disabled) fn(e);
  });
  el.addEventListener('pointercancel', off);
  el.addEventListener('pointerleave', off);
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fn(new PointerEvent('pointerup'));
    }
  });
}

export interface Sheet {
  /** 外层（全屏透明一层，点它 = 收起） */
  shade: HTMLElement;
  /** 卡片本身 */
  el: HTMLElement;
  /** 卡片内容放这里（重画 = body.replaceChildren(...)；右上的关、上浮的字在外面不受影响） */
  body: HTMLElement;
  /** 卡顶上浮一行字（1.6 秒） */
  say(text: string, sec?: number): void;
  open(): void;
  close(): void;
  isOpen(): boolean;
}

/** 一张半屏卡。panel = 量图用的名字（data-panel）；onClose = 收起以后 */
export function createSheet(panel: string, onClose?: () => void): Sheet {
  injectCss();
  const shade = document.createElement('div');
  shade.className = 'pxs-shade';
  shade.hidden = true;
  const el = document.createElement('div');
  el.className = `pxs-sheet pxs-${panel}`;
  el.dataset.panel = panel;
  shade.appendChild(el);
  document.body.appendChild(shade);
  shade.style.setProperty('--s', String(hudScale()));
  const x = document.createElement('button');
  x.type = 'button';
  x.className = 'pxs-btn pxs-x';
  x.setAttribute('aria-label', 'close');
  const xt = document.createElement('div');
  xt.className = 'pxs-tab';
  xt.appendChild(px(actIcon('close')));
  x.appendChild(xt);
  // 点卡片外面：收起，不让这一下落到场景上
  shade.addEventListener('pointerdown', (e) => {
    if (e.target === shade) {
      e.stopPropagation();
      api.close();
    }
  });
  // 往下滑收起
  let sy: { y: number; x: number; id: number } | null = null;
  el.addEventListener('pointerdown', (e) => {
    sy = { y: e.clientY, x: e.clientX, id: e.pointerId };
  });
  el.addEventListener('pointerup', (e) => {
    if (!sy || sy.id !== e.pointerId) return;
    const dy = e.clientY - sy.y;
    const dx = e.clientX - sy.x;
    sy = null;
    if (dy > 70 && Math.abs(dx) < 50) api.close();
  });
  tap(x, () => api.close());
  const sayEl = document.createElement('div');
  sayEl.className = 'pxs-say gone';
  let sayT = 0;
  const body = document.createElement('div');
  body.className = 'pxs-body';
  el.append(body, x, sayEl);
  const api: Sheet = {
    shade,
    el,
    body,
    say(text, sec = 1.6) {
      sayEl.replaceChildren();
      const sp = document.createElement('span');
      sp.textContent = text;
      sayEl.appendChild(sp);
      sayEl.classList.remove('gone');
      clearTimeout(sayT);
      sayT = window.setTimeout(() => sayEl.classList.add('gone'), sec * 1000);
    },
    open() {
      shade.hidden = false;
    },
    close() {
      if (shade.hidden) return;
      sayEl.classList.add('gone');
      shade.hidden = true;
      onClose?.();
    },
    isOpen: () => !shade.hidden,
  };
  return api;
}

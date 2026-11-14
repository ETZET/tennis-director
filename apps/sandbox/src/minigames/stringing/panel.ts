// 穿线台的操作面板（DOM + 两块像素画布）：画面下半截。上面一排排队的客人卡（点一位 = 接他的拍子），
// 中间左边是拍面（竖线一根根长出来、横线一上一下地编进去），右边是这一步的仪表（扫的光标 / 拉力表 / 节拍道），
// 最下面拇指够得着的大按钮（穿 / 按住拉线 / 左 右）。
// 像素风同壳（shell/style.ts）：深靛底 #2c2450 + 奶油描边 #fff3d6 + 方块投影 #171230，金 #ffd23c、绿 #8fe36a、珊瑚 #ff6a58、青 #48d0bc。
// 只管画和收指针；规则、计时在 main.ts / rules.ts。
import type { Grade, Side } from './rules';

const CSS = `
.st-block { position: fixed; inset: 0; z-index: 3; touch-action: none; }
.st-on .play-buttons, .st-on .play-joy, .st-on .play-hint { display: none !important; }
.st-panel { position: fixed; left: 0; right: 0; bottom: 0; top: 50%; z-index: 5; box-sizing: border-box; display: flex; flex-direction: column; gap: 10px;
  padding: 12px max(12px, env(safe-area-inset-right)) calc(max(14px, env(safe-area-inset-bottom)) + 4px) max(12px, env(safe-area-inset-left));
  background: #2c2450; box-shadow: 0 -3px 0 0 #fff3d6, 0 -6px 0 0 #171230; touch-action: none;
  font: 700 13px/1.2 "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", ui-monospace, monospace; color: #fff3d6; letter-spacing: 1px;
  -webkit-font-smoothing: none; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
.st-panel[hidden] { display: none; }
.st-panel button { font: inherit; color: inherit; letter-spacing: inherit; -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
@media (orientation: landscape) { .st-panel { top: auto; left: 50%; width: min(460px, 100vw); transform: translateX(-50%); height: min(400px, 62vh); } }

/* 排队的客人 */
.st-queue { display: flex; gap: 8px; min-height: 64px; align-items: stretch; }
.st-qhead { display: flex; flex-direction: column; justify-content: center; font-size: 10px; opacity: 0.75; width: 24px; text-align: center; line-height: 1.15; }
.st-card { position: relative; flex: 0 0 auto; width: 62px; min-height: 64px; padding: 5px 4px 9px; box-sizing: border-box; border: 0; cursor: pointer;
  display: flex; flex-direction: column; align-items: center; gap: 2px; background: #3d3468;
  box-shadow: 2px 0 0 0 #fff3d6, -2px 0 0 0 #fff3d6, 0 2px 0 0 #fff3d6, 0 -2px 0 0 #fff3d6, 0 5px 0 0 #171230; }
.st-card:active { transform: translateY(2px); }
.st-card .av { width: 18px; height: 18px; box-shadow: 0 0 0 2px #171230; }
.st-card .nm { font-size: 11px; white-space: nowrap; overflow: hidden; max-width: 56px; }
.st-card .rq { font-size: 12px; color: #ffd23c; }
.st-card .tg { position: absolute; top: -9px; right: -6px; padding: 1px 3px; font-size: 9px; background: #2f6ad0; box-shadow: 0 0 0 2px #171230; }
.st-card.pro .tg { background: #ffd23c; color: #2c2450; }
.st-card.pro { box-shadow: 2px 0 0 0 #ffd23c, -2px 0 0 0 #ffd23c, 0 2px 0 0 #ffd23c, 0 -2px 0 0 #ffd23c, 0 5px 0 0 #171230; }
.st-card .bar { position: absolute; left: 4px; right: 4px; bottom: 3px; height: 4px; background: #171230; }
.st-card .bar i { display: block; height: 100%; background: #8fe36a; }
.st-card.warn .bar i { background: #ffb43c; }
.st-card.urgent .bar i { background: #ff5a5a; }
.st-card.urgent { animation: st-shake 0.5s steps(2, end) infinite; }
.st-card.next { background: #5a4c94; }
.st-card:disabled { cursor: default; }
.st-qempty { align-self: center; font-size: 12px; opacity: 0.7; padding-left: 4px; }
@keyframes st-shake { 50% { transform: translateX(1px); } }

/* 中间：拍面 + 这一步 */
.st-work { flex: 1 1 auto; display: flex; gap: 12px; min-height: 0; }
.st-racket { flex: 0 0 auto; width: 140px; height: 170px; image-rendering: pixelated; align-self: center; }
.st-side { flex: 1 1 auto; display: flex; flex-direction: column; gap: 6px; min-width: 0; justify-content: center; }
.st-who { font-size: 13px; display: flex; gap: 6px; align-items: baseline; flex-wrap: wrap; }
.st-who b { color: #ffd23c; font-size: 15px; }
.st-who span { opacity: 0.85; }
.st-step { display: flex; gap: 6px; font-size: 12px; }
.st-step span { white-space: nowrap; padding: 2px 5px; background: #171230; opacity: 0.55; }
.st-step span.on { opacity: 1; background: #c0545a; }
.st-step span.ok { opacity: 0.85; background: #2f7a54; }
.st-meter { width: 100%; height: 60px; image-rendering: pixelated; }
.st-read { font-size: 13px; min-height: 18px; display: flex; justify-content: space-between; gap: 6px; }
.st-read b { color: #ffd23c; font-size: 16px; font-variant-numeric: tabular-nums; }
.st-read .g-perfect { color: #ffd23c; } .st-read .g-good { color: #8fe36a; } .st-read .g-miss { color: #ff7a7a; }

/* 按钮（拇指区） */
.st-ctrl { flex: 0 0 auto; display: flex; gap: 14px; padding: 0 3px 6px; }
.st-btn { flex: 1 1 0; min-height: 76px; border: 0; cursor: pointer; font-size: 22px !important; letter-spacing: 3px !important; background: #c0545a;
  box-shadow: 3px 0 0 0 #fff3d6, -3px 0 0 0 #fff3d6, 0 3px 0 0 #fff3d6, 0 -3px 0 0 #fff3d6, 0 6px 0 0 #171230, 3px 3px 0 0 #171230, -3px 3px 0 0 #171230; }
.st-btn small { display: block; font-size: 11px; letter-spacing: 1px; opacity: 0.85; margin-top: 3px; }
.st-btn.down, .st-btn:active { transform: translateY(3px); box-shadow: 3px 0 0 0 #fff3d6, -3px 0 0 0 #fff3d6, 0 3px 0 0 #fff3d6, 0 -3px 0 0 #fff3d6, 0 3px 0 0 #171230; }
.st-btn.l { background: #2a8a80; } .st-btn.r { background: #c0545a; }
.st-btn.pull { background: #b4572a; }
.st-btn.go { background: #2f7a54; }
.st-btn.off { background: #4a4270; color: #b9b0d8; }
.st-btn[hidden] { display: none; }
.st-btn.cue { animation: st-cue 0.18s steps(1, end); }
@keyframes st-cue { 0% { background: #ffd23c; color: #2c2450; } }
`;

export interface QueueItem {
  id: number;
  name: string;
  /** 「52磅」 */
  req: string;
  /** 「混穿」「职业·急」，'' = 没有 */
  tag: string;
  pro: boolean;
  /** 时限还剩几成 0..1 */
  frac: number;
  /** 头像色 */
  color: string;
  /** 闲着时排第一个（按大按钮就接他） */
  next: boolean;
}

export type BtnMode = 'idle' | 'wait' | 'tap' | 'pull' | 'lr';

export interface PanelHandlers {
  /** 大按钮按下 / 松开（拉力是按住） */
  down(): void;
  up(): void;
  side(s: Side): void;
  pick(id: number): void;
  /** 点上半截的 3D 画面（CSS 坐标） */
  tapScene(x: number, y: number): void;
}

export interface Panel {
  root: HTMLDivElement;
  setQueue(items: readonly QueueItem[]): void;
  setWho(html: string): void;
  setSteps(steps: readonly { label: string; state: 'on' | 'ok' | '' }[]): void;
  setRead(left: string, right: string): void;
  setButton(mode: BtnMode, label: string, sub?: string): void;
  /** 按钮闪一下（节拍提示） */
  cue(which: 'main' | Side): void;
  racket: CanvasRenderingContext2D;
  meter: CanvasRenderingContext2D;
  show(on: boolean): void;
}

export function createPanel(h: PanelHandlers): Panel {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  document.body.classList.add('st-on');

  // 上半截：挡住画布（不让点地面走路），点到客人 = 选他
  const block = document.body.appendChild(document.createElement('div'));
  block.className = 'st-block';
  block.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    h.tapScene(e.clientX, e.clientY);
  });

  const root = document.body.appendChild(document.createElement('div'));
  root.className = 'st-panel';
  root.innerHTML = `
    <div class="st-queue"><div class="st-qhead">排<br>队</div><div class="st-qempty">等客人…</div></div>
    <div class="st-work">
      <canvas class="st-racket" width="56" height="68"></canvas>
      <div class="st-side">
        <div class="st-who"></div>
        <div class="st-step"></div>
        <canvas class="st-meter" width="112" height="30"></canvas>
        <div class="st-read"><span class="a"></span><span class="b"></span></div>
      </div>
    </div>
    <div class="st-ctrl">
      <button class="st-btn main" type="button"></button>
      <button class="st-btn l" type="button" hidden>◀ 左<small>上</small></button>
      <button class="st-btn r" type="button" hidden>右 ▶<small>下</small></button>
    </div>`;
  const $ = <T extends Element>(s: string) => root.querySelector(s) as T;
  const queue = $<HTMLDivElement>('.st-queue');
  const empty = $<HTMLDivElement>('.st-qempty');
  const who = $<HTMLDivElement>('.st-who');
  const steps = $<HTMLDivElement>('.st-step');
  const readA = $<HTMLSpanElement>('.st-read .a');
  const readB = $<HTMLSpanElement>('.st-read .b');
  const main = $<HTMLButtonElement>('.st-btn.main');
  const bl = $<HTMLButtonElement>('.st-btn.l');
  const br = $<HTMLButtonElement>('.st-btn.r');
  const racket = ($<HTMLCanvasElement>('.st-racket').getContext('2d') as CanvasRenderingContext2D) ?? null;
  const meter = ($<HTMLCanvasElement>('.st-meter').getContext('2d') as CanvasRenderingContext2D) ?? null;
  root.addEventListener('pointerdown', (e) => e.preventDefault());

  // 大按钮：按下就算（不等 click，节拍才准）；松开 = 拉力松手
  let mainDown = false;
  main.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    main.setPointerCapture?.(e.pointerId);
    mainDown = true;
    main.classList.add('down');
    h.down();
  });
  const mainUp = () => {
    if (!mainDown) return;
    mainDown = false;
    main.classList.remove('down');
    h.up();
  };
  main.addEventListener('pointerup', mainUp);
  main.addEventListener('pointercancel', mainUp);
  main.addEventListener('lostpointercapture', mainUp);
  for (const [b, s] of [
    [bl, 'L'],
    [br, 'R'],
  ] as const) {
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      b.classList.add('down');
      h.side(s);
    });
    const off = () => b.classList.remove('down');
    b.addEventListener('pointerup', off);
    b.addEventListener('pointercancel', off);
    b.addEventListener('pointerleave', off);
  }
  // 键盘（桌面的额外）：空格 / 回车 = 大按钮，← → / A D = 左右
  addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      if (!mainDown) {
        mainDown = true;
        main.classList.add('down');
        h.down();
      }
    } else if (e.code === 'ArrowLeft' || e.code === 'KeyA') h.side('L');
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') h.side('R');
  });
  addEventListener('keyup', (e) => {
    if (e.code === 'Space' || e.code === 'Enter') mainUp();
  });

  // 客人卡：同一批人（id 一样）只改字和条，不重建（不然按下的那一刻卡被换掉）
  let cards: { id: number; el: HTMLButtonElement; bar: HTMLElement }[] = [];
  const setQueue = (items: readonly QueueItem[]) => {
    const same = cards.length === items.length && cards.every((c, i) => c.id === items[i].id);
    if (!same) {
      for (const c of cards) c.el.remove();
      cards = items.map((it) => {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'st-card';
        el.innerHTML = `<i class="av"></i><span class="nm"></span><span class="rq"></span><span class="tg"></span><span class="bar"><i></i></span>`;
        el.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          h.pick(it.id);
        });
        queue.insertBefore(el, empty);
        return { id: it.id, el, bar: el.querySelector('.bar i') as HTMLElement };
      });
    }
    empty.hidden = items.length > 0;
    items.forEach((it, i) => {
      const { el, bar } = cards[i];
      const q = (s: string) => el.querySelector(s) as HTMLElement;
      q('.av').style.background = it.color;
      q('.nm').textContent = it.name;
      q('.rq').textContent = it.req;
      const tg = q('.tg');
      tg.textContent = it.tag;
      tg.hidden = !it.tag;
      el.classList.toggle('pro', it.pro);
      el.classList.toggle('next', it.next);
      el.classList.toggle('warn', it.frac < 0.5 && it.frac >= 0.25);
      el.classList.toggle('urgent', it.frac < 0.25);
      bar.style.width = `${Math.max(0, Math.min(1, it.frac)) * 100}%`;
    });
  };

  let lastMode: BtnMode | null = null;
  let lastLabel = '';
  return {
    root,
    racket,
    meter,
    setQueue,
    setWho(html) {
      if (who.innerHTML !== html) who.innerHTML = html;
    },
    setSteps(list) {
      const html = list.map((s) => `<span class="${s.state}">${s.label}</span>`).join('');
      if (steps.innerHTML !== html) steps.innerHTML = html;
    },
    setRead(a, b) {
      if (readA.innerHTML !== a) readA.innerHTML = a;
      if (readB.innerHTML !== b) readB.innerHTML = b;
    },
    setButton(mode, label, sub) {
      const full = `${label}${sub ? `<small>${sub}</small>` : ''}`;
      if (mode === lastMode && full === lastLabel) return;
      lastMode = mode;
      lastLabel = full;
      const lr = mode === 'lr';
      main.hidden = lr;
      bl.hidden = br.hidden = !lr;
      main.innerHTML = full;
      main.className = `st-btn main${mode === 'pull' ? ' pull' : mode === 'idle' ? ' go' : mode === 'wait' ? ' off' : ''}`;
    },
    cue(which) {
      const b = which === 'main' ? main : which === 'L' ? bl : br;
      b.classList.remove('cue');
      void b.offsetWidth;
      b.classList.add('cue');
    },
    show(on) {
      root.hidden = !on;
      block.hidden = !on;
    },
  };
}

// ════════════════════════════════════════════════════════════════════════════════════════
// 画布：拍面（56 × 68 像素，CSS 放大 2.5 倍）、仪表（112 × 30）
// ════════════════════════════════════════════════════════════════════════════════════════

const C = {
  ink: '#171230',
  deep: '#2c2450',
  mid: '#3d3468',
  cream: '#fff3d6',
  gold: '#ffd23c',
  green: '#8fe36a',
  greenD: '#2f7a54',
  coral: '#ff6a58',
  red: '#c0545a',
  teal: '#48d0bc',
  frame: '#e8484e',
  frameHi: '#ff8a6a',
  frameD: '#7a2862',
  grip: '#5c5490',
};

export interface RacketView {
  /** 竖线：每根的判定（null = 还没穿） */
  mains: readonly (Grade | null)[];
  crosses: readonly (Grade | null)[];
  mainColor: string;
  crossColor: string;
  /** 下一根要穿的（虚线预告）：'m' 竖线 / 'c' 横线 + 第几根；null = 没有 */
  next: { kind: 'm' | 'c'; i: number } | null;
  /** 拉力已拉好（线床亮一点） */
  taut: boolean;
  /** 空拍框（没有活） */
  empty: boolean;
  /** 闪的（刚穿好的那根）：0..1 */
  flash: { kind: 'm' | 'c'; i: number; k: number } | null;
}

/** 拍面画布的高 */
const RH = 68;
const HX = 28;
const HY = 27;
const RX = 23;
const RY = 25;
/** 框里（线能走的范围）：椭圆缩 3 像素 */
const inner = (x: number, y: number) => ((x - HX) / (RX - 3)) ** 2 + ((y - HY) / (RY - 3)) ** 2 <= 1;
const onFrame = (x: number, y: number) => {
  const o = ((x - HX) / RX) ** 2 + ((y - HY) / RY) ** 2;
  return o <= 1 && !inner(x, y);
};
export const mainX = (i: number, n: number) => Math.round(HX - 16 + (i * 32) / (n - 1));
export const crossY = (j: number, n: number) => Math.round(HY - 18 + (j * 36) / (n - 1));

const shade = (hex: string, k: number) => {
  const n = Number.parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
};

export function drawRacket(g: CanvasRenderingContext2D, v: RacketView) {
  g.clearRect(0, 0, 56, RH);
  const px = (x: number, y: number, c: string) => {
    g.fillStyle = c;
    g.fillRect(x, y, 1, 1);
  };
  // 拍框里面（暗底：线床没穿时看得出空）
  for (let y = 0; y < 56; y++) for (let x = 0; x < 56; x++) if (inner(x, y)) px(x, y, v.taut ? '#3a3070' : '#332a5e');
  // 框：亮边在左上，暗边在右下，外一圈描黑
  for (let y = 0; y < 56; y++)
    for (let x = 0; x < 56; x++) {
      if (!onFrame(x, y)) continue;
      const lit = (x - HX) / RX + (y - HY) / RY < -0.35;
      const dark = (x - HX) / RX + (y - HY) / RY > 0.55;
      px(x, y, lit ? C.frameHi : dark ? C.frameD : C.frame);
    }
  // 拍喉 + 握把
  g.fillStyle = C.frame;
  g.fillRect(HX - 4, HY + RY - 1, 3, 6);
  g.fillRect(HX + 1, HY + RY - 1, 3, 6);
  g.fillStyle = C.frameD;
  g.fillRect(HX - 2, HY + RY + 4, 4, 3);
  g.fillStyle = C.grip;
  g.fillRect(HX - 3, HY + RY + 6, 6, RH - (HY + RY + 6) - 1);
  g.fillStyle = C.ink;
  for (let y = HY + RY + 8; y < RH - 2; y += 3) g.fillRect(HX - 3, y, 6, 1);
  g.fillRect(HX - 3, RH - 2, 6, 1);
  if (v.empty) return;

  const nm = v.mains.length;
  const nc = v.crosses.length;
  const missC = '#d0405a';
  // 竖线：从上到下（漏的那根歪一下、发红）
  const mainCol = (i: number) => {
    const gr = v.mains[i];
    const fl = v.flash?.kind === 'm' && v.flash.i === i ? v.flash.k : 0;
    if (fl > 0) return C.cream;
    return gr === 'miss' ? missC : gr === 'perfect' ? v.mainColor : shade(v.mainColor, 0.86);
  };
  for (let i = 0; i < nm; i++) {
    const gr = v.mains[i];
    const x = mainX(i, nm);
    if (gr === null) {
      if (v.next?.kind === 'm' && v.next.i === i)
        for (let y = 0; y < 56; y += 2) if (inner(x, y)) px(x, y, 'rgba(255,243,214,0.45)');
      continue;
    }
    for (let y = 0; y < 56; y++) {
      if (!inner(x, y)) continue;
      const dx = gr === 'miss' && y > HY - 6 && y < HY + 6 ? 1 : 0;
      px(x + dx, y, mainCol(i));
    }
  }
  // 横线：一上一下（(i + j) 偶数 = 横线在上，奇数 = 竖线在上 → 横线那一格画暗）
  for (let j = 0; j < nc; j++) {
    const gr = v.crosses[j];
    const y = crossY(j, nc);
    if (gr === null) {
      if (v.next?.kind === 'c' && v.next.i === j)
        for (let x = 0; x < 56; x += 2) if (inner(x, y)) px(x, y, 'rgba(255,243,214,0.45)');
      continue;
    }
    const fl = v.flash?.kind === 'c' && v.flash.i === j ? v.flash.k : 0;
    const base = fl > 0 ? C.cream : gr === 'miss' ? missC : gr === 'perfect' ? v.crossColor : shade(v.crossColor, 0.86);
    for (let x = 0; x < 56; x++) {
      if (!inner(x, y)) continue;
      const mi = v.mains.findIndex((_, i) => mainX(i, nm) === x);
      const yy = gr === 'miss' && x > HX - 5 && x < HX + 5 ? y + 1 : y;
      if (mi >= 0 && v.mains[mi] !== null && (mi + j) % 2 === 1) {
        // 竖线在上：横线这一格藏在下面（只露两边的暗边）
        continue;
      }
      px(x, yy, base);
      // 在上面的那一格下边投一点影
      if (mi >= 0 && v.mains[mi] !== null) px(x, yy + 1, shade(v.mainColor, 0.5));
    }
  }
}

export type MeterView =
  | { kind: 'none' }
  | { kind: 'sweep'; pos: number; zone: number; good: number; perfect: number; flash: Grade | null }
  | {
      kind: 'gauge';
      value: number;
      target: number;
      min: number;
      max: number;
      good: number;
      perfect: number;
      snapped: boolean;
      flash: Grade | null;
    }
  | { kind: 'lane'; now: number; beats: { t: number; side: Side; grade: Grade | null }[]; flash: Grade | null };

const GRADE_C: Record<Grade, string> = { perfect: C.gold, good: C.green, miss: C.coral };

export function drawMeter(g: CanvasRenderingContext2D, v: MeterView) {
  const W = 112;
  const H = 30;
  g.clearRect(0, 0, W, H);
  if (v.kind === 'none') return;
  const rect = (x: number, y: number, w: number, h: number, c: string) => {
    g.fillStyle = c;
    g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  };
  // 槽：黑底 + 奶油边（判定后闪一下边的颜色）
  const edge = v.flash ? GRADE_C[v.flash] : C.cream;
  rect(0, 7, W, 16, edge);
  rect(1, 8, W - 2, 14, C.ink);
  const X0 = 2;
  const XW = W - 4;
  if (v.kind === 'sweep') {
    const zx = (p: number) => X0 + p * XW;
    rect(zx(v.zone - v.good), 9, zx(v.zone + v.good) - zx(v.zone - v.good), 12, C.greenD);
    rect(zx(v.zone - v.good), 9, 1, 12, C.green);
    rect(zx(v.zone + v.good) - 1, 9, 1, 12, C.green);
    rect(zx(v.zone - v.perfect), 9, Math.max(2, zx(v.zone + v.perfect) - zx(v.zone - v.perfect)), 12, C.gold);
    // 光标：一根奶油色的竖条 + 上面一个小三角
    const cx = Math.round(zx(v.pos));
    rect(cx - 1, 5, 2, 20, C.cream);
    rect(cx - 2, 2, 4, 2, C.cream);
    rect(cx - 1, 4, 2, 1, C.cream);
    rect(cx - 1, 25, 2, 1, C.ink);
  } else if (v.kind === 'gauge') {
    const gx = (lb: number) => X0 + ((lb - v.min) / (v.max - v.min)) * XW;
    // 刻度：每 5 磅一格
    for (let lb = Math.ceil(v.min / 5) * 5; lb <= v.max; lb += 5) rect(gx(lb), 22, 1, lb % 10 === 0 ? 4 : 2, C.cream);
    // 已经拉到的（填充）
    rect(X0, 10, gx(v.value) - X0, 10, v.snapped ? C.coral : '#b4572a');
    // 目标区
    rect(gx(v.target - v.good), 9, gx(v.target + v.good) - gx(v.target - v.good), 2, C.green);
    rect(gx(v.target - v.good), 19, gx(v.target + v.good) - gx(v.target - v.good), 2, C.green);
    rect(gx(v.target - v.perfect), 8, gx(v.target + v.perfect) - gx(v.target - v.perfect), 3, C.gold);
    rect(gx(v.target - v.perfect), 19, gx(v.target + v.perfect) - gx(v.target - v.perfect), 3, C.gold);
    rect(gx(v.target), 9, 1, 12, 'rgba(255,210,60,0.55)');
    // 指针
    const nx = Math.round(gx(v.value));
    rect(nx - 1, 4, 2, 21, C.cream);
    rect(nx - 2, 1, 4, 3, C.cream);
  } else {
    // 节拍道：拍子从右往左滑到金色的判定线
    const HIT = 14;
    const PPS = 62; // 像素 / 秒
    rect(HIT - 1, 4, 3, 22, C.gold);
    for (const b of v.beats) {
      const x = HIT + (b.t - v.now) * PPS;
      if (x < -8 || x > W + 8) continue;
      if (b.grade) {
        // 判过的：在判定线上闪一下就没了
        if (v.now - b.t > 0.25 || b.grade === 'miss') continue;
        rect(HIT - 4, 9, 9, 12, GRADE_C[b.grade]);
        continue;
      }
      const col = b.side === 'L' ? C.teal : C.coral;
      rect(x - 5, 9, 11, 12, C.ink);
      rect(x - 4, 10, 9, 10, col);
      // 箭头
      g.fillStyle = C.ink;
      if (b.side === 'L') {
        g.fillRect(Math.round(x) - 2, 14, 1, 2);
        g.fillRect(Math.round(x) - 1, 13, 1, 4);
        g.fillRect(Math.round(x), 12, 1, 6);
        g.fillRect(Math.round(x) + 1, 14, 2, 2);
      } else {
        g.fillRect(Math.round(x) + 2, 14, 1, 2);
        g.fillRect(Math.round(x) + 1, 13, 1, 4);
        g.fillRect(Math.round(x), 12, 1, 6);
        g.fillRect(Math.round(x) - 2, 14, 2, 2);
      }
    }
  }
}

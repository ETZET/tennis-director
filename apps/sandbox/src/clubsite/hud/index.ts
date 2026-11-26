// 像素界面（所有俱乐部场景都能用；clubwalk 先接）。参考《垂钓手记》：界面只占三个角，画面中间没有字。
// - 左上：日钟（clock.ts，画着这一刻的天，外圈一天的进度，网球是"现在"）+ 一行日期。点它只冒一个小牌子（星期几 + 天气图标），
//   一两秒自己消失；原来调时刻和天气的面板是调试工具，只在调试里（?debug=1 或左下角的小点）点日钟才开。
// - 右上：金币 + 数字。
// - 右下（拇指区）：像素图标按钮，位置固定。底下一排常驻的（名册、地图……由场景给）；上面一排是这里能干的活
//   （动作键：按住干活；拿 / 放），没有活的时候槽位空着，别的按钮不跳。图标就是说明；字只在长按、或者这个活第一次出现时，
//   在按钮正上方的小奶油牌子里亮 1.5 秒（不飘在场景上）。
// - 场景里：人头上只画心情泡（icons.ts 的 MOODS，mood.ts 按台词挑），点泡才看整句；点人显示名字和他自己的一句话（peek）。
// - 反馈：画面上方一行白字黑边 + 弹出来的东西（toast → pop），过一会儿消失。开局的操作提示几秒后消失。
// - 调试牌（像素级别、模拟状态条、调时间面板）默认藏着：?debug=1 或者点左下角的小点。
// - 转场：iris.ts 的圆形遮罩（收拢 → 黑 → 展开）。
// 界面纹素：手机 2 CSS 像素；短边 ≥ 600 的屏（平板、桌面横屏）3 CSS 像素。字用系统字体切成实心（font.ts），字号 = 6 × 纹素。
// 不做"面板 → 子菜单 → 按钮"（玩法准则 1）：按钮直接是动作。
//
// 接入（场景 main，在 mountPlay、mountDaylight({ panelOnly: true }) 之后）：
//   const hud = mountPixelHud({ play, canvas, day, money: () => cast.money(), buttons: [...] });
//   每帧 render 之后：hud.frame()（play.hud.frame() 照常调：它管画面上的指针输入）
import * as THREE from 'three';
import type { Daylight } from '../daylight';
import { dayLook, type Weather } from '../daylight/sky';
import type { Anchor, Play } from '../play';
import { drawClock } from './clock';
import { CREAM, INK } from './colors';
import { textCanvas } from './font';
import { type TKey, t, weekday } from './i18n';
import { ICONS, type IconId, MOODS, type MoodId, moodSprite, WEATHER_ICONS } from './icons';
import { createIris, type Iris } from './iris';
import { moodOf } from './mood';
import { blit, spriteCanvas } from './sprite';
import { HUD_CSS } from './style';

export { lang, t } from './i18n';
export type { IconId, MoodId } from './icons';
export type { Iris } from './iris';
export { createIris } from './iris';
export { moodOf } from './mood';

/** 界面纹素 → CSS 像素：手机 2；短边 ≥ 600（平板、桌面横屏）3 */
export const hudScale = () => (Math.min(innerWidth, innerHeight) >= 600 ? 3 : 2);

export interface HudButton {
  id: string;
  icon: IconId;
  label: TKey;
  onTap(): void;
  /** 按下的样子（开着的东西：地图开着时地图键按下去） */
  pressed?(): boolean;
}

export interface PixelHudOpts {
  play: Play;
  canvas: HTMLCanvasElement;
  day: Daylight;
  /** 右上的钱；null = 不显示 */
  money?: () => number | null;
  /** 右下常驻的图标按钮（从右往左排） */
  buttons?: HudButton[];
  params?: URLSearchParams;
}

export interface Peek {
  anchor: Anchor;
  /** 头顶上方多高（米） */
  dy?: number;
  title: string;
  line: string;
  /** 点气泡 */
  onTap?(): void;
  sec?: number;
}

export interface PixelHud {
  frame(): void;
  iris: Iris;
  /** 点人：头上一个奶油色小框，名字 + 一句话 */
  peek(p: Peek | null): void;
  /** 反馈：弹出来的东西（可选）+ 一行字 */
  pop(text: string, icon?: IconId | null, sec?: number): void;
  /** 地点名（进一个区域时上方淡出） */
  place(name: string): void;
  setDebug(on: boolean): void;
  readonly root: HTMLElement;
}

/** 活的名字 → 图标（场景的互动点只给中文名字；挑不出来就是球拍） */
export function actionIcon(label: string): IconId {
  if (/说话|聊|签到/.test(label)) return 'talk';
  if (/电梯|货梯/.test(label)) return 'lift';
  if (/钥匙|代客|接车|停车|交车/.test(label)) return 'key';
  if (/扫|落叶|吹沙|刮水|捞|垃圾/.test(label)) return 'broom';
  if (/推|球车|球包车/.test(label)) return 'cart';
  if (/水|浇|喷雾/.test(label)) return 'drop';
  if (/网|摇|修|伞/.test(label)) return 'wrench';
  if (/球/.test(label)) return 'ball';
  return 'racket';
}

/** 拿 / 放的图标：要拿的东西（扫帚、水壶……），挑不出来就是纸箱 */
export function pickIcon(label: string): IconId {
  const a = actionIcon(label);
  return a === 'racket' || a === 'talk' || a === 'lift' ? 'box' : a;
}

const LONG_MS = 420;

/** 圆底板（动作键）：直径 d 纹素，fill 本色、下沿一圈深一档 */
function plateRows(d: number, fill: string, low: string): string[] {
  const rows: string[] = [];
  const c = d / 2;
  for (let y = 0; y < d; y++) {
    let r = '';
    for (let x = 0; x < d; x++) {
      const q = Math.hypot(x + 0.5 - c, y + 0.5 - c);
      // 下半圈靠边的两纹素：深一档（立体）
      r += q > c - 0.3 ? '.' : q > c - 2.2 && y + 0.5 > c + 2 ? low : fill;
    }
    rows.push(r);
  }
  return rows;
}

export function mountPixelHud(o: PixelHudOpts): PixelHud {
  if (!document.getElementById('pxh-css')) {
    const st = document.createElement('style');
    st.id = 'pxh-css';
    st.textContent = HUD_CSS;
    document.head.appendChild(st);
  }
  const { play, canvas, day } = o;
  const params = o.params ?? new URLSearchParams(location.search);
  document.body.classList.add('pxh-on');
  const root = document.createElement('div');
  root.className = 'pxh-root';
  document.body.appendChild(root);
  let S = hudScale();
  root.style.setProperty('--s', String(S));
  const icon = (id: IconId) => spriteCanvas(ICONS[id], id);
  /** 字：系统字体切实心，字号 6 × 纹素，按 1 倍显示 */
  const txt = (s: string, color = CREAM, maxW?: number, outline: number | null = INK) =>
    textCanvas(s, { color, px: 6 * S, maxW, outline });

  /** 像素图 → 页面上的 canvas。k = 放大倍数相对纹素（图标 1 = S 倍；字 0 = 1 倍）。换了纹素（转屏）时 rescale() 重设大小 */
  const view = (src: HTMLCanvasElement, k: 0 | 1 | 2 = 1, cls = '') => {
    const c = document.createElement('canvas');
    c.className = `pxh-px ${cls}`.trim();
    c.dataset.k = String(k);
    put(c, src);
    return c;
  };
  const put = (c: HTMLCanvasElement, src: HTMLCanvasElement) => {
    blit(c, src, Number(c.dataset.k) ? S * Number(c.dataset.k) : 1);
  };
  const rescale = () => {
    for (const c of root.querySelectorAll<HTMLCanvasElement>('canvas.pxh-px')) {
      const k = Number(c.dataset.k ?? 1);
      if (!k) continue;
      c.style.width = `${c.width * S * k}px`;
      c.style.height = `${c.height * S * k}px`;
    }
  };

  // ── 左上：日钟 + 日期 ──
  const clockBtn = document.createElement('button');
  clockBtn.type = 'button';
  clockBtn.className = 'pxh-clock';
  clockBtn.setAttribute('aria-label', t('clock'));
  const clockCv = document.createElement('canvas');
  clockCv.className = 'pxh-px';
  clockCv.dataset.k = '1';
  const dateCv = document.createElement('canvas');
  dateCv.className = 'pxh-px';
  dateCv.dataset.k = '0';
  clockBtn.append(clockCv, dateCv);
  root.appendChild(clockBtn);
  // 点日钟：小牌子（星期几 + 天气图标），1.8 秒；调试里 = 调时间面板
  const tip = document.createElement('div');
  tip.className = 'pxh-tip gone';
  root.appendChild(tip);
  let tipTimer = 0;
  const panel = day.panel;
  let debug = false;
  clockBtn.addEventListener('click', () => {
    if (debug && panel) {
      panel.toggle();
      placePanel();
      return;
    }
    const hour = ((day.total % 24) + 24) % 24;
    const dayN = Math.floor(day.total / 24) + 1;
    const hh = Math.floor(hour);
    const mm = Math.floor((hour - hh) * 60);
    tip.replaceChildren(
      view(spriteCanvas(WEATHER_ICONS[day.current], `w-${day.current}`)),
      view(
        txt(
          `${weekday(dayN)} ${hh}:${String(mm).padStart(2, '0')} ${t(`w_${day.current}` as TKey)}`,
          INK,
          undefined,
          null,
        ),
        0,
      ),
    );
    tip.classList.remove('gone');
    clearTimeout(tipTimer);
    tipTimer = window.setTimeout(() => tip.classList.add('gone'), 1800);
  });
  function placePanel() {
    if (!panel?.isOpen()) return;
    const r = clockBtn.getBoundingClientRect();
    panel.panel.style.top = `${Math.round(r.bottom) + 10}px`;
  }
  let clockKey = '';
  let dateKey = '';
  function drawClockNow() {
    const hour = ((day.total % 24) + 24) % 24;
    const look = day.look;
    const weather = day.current;
    // 6 游戏分钟画一次（外圈的进度一格 ≈ 一刻钟）
    const key = `${Math.floor(hour * 10)}|${weather}|${look.moon}|${look.skyTop}|${look.skyHorizon}|${S}`;
    if (key !== clockKey) {
      clockKey = key;
      const { w, h, px } = drawClock({ hour, look, weather });
      clockCv.width = w;
      clockCv.height = h;
      (clockCv.getContext('2d') as CanvasRenderingContext2D).putImageData(new ImageData(px, w, h), 0, 0);
      clockCv.style.width = `${w * S}px`;
      clockCv.style.height = `${h * S}px`;
    }
    const dayN = Math.floor(day.total / 24) + 1;
    const ds = `${t('date', { wd: weekday(dayN), d: dayN })}|${S}`;
    if (ds !== dateKey) {
      dateKey = ds;
      put(dateCv, txt(t('date', { wd: weekday(dayN), d: dayN })));
    }
  }

  // ── 右上：钱 ──
  const moneyEl = document.createElement('div');
  moneyEl.className = 'pxh-money';
  moneyEl.setAttribute('aria-label', t('money'));
  const moneyCv = document.createElement('canvas');
  moneyCv.className = 'pxh-px';
  moneyCv.dataset.k = '0';
  moneyEl.append(view(icon('coin')), moneyCv);
  root.appendChild(moneyEl);
  let moneyKey = '';

  // ── 右下：按钮（固定槽位） ──
  const dock = document.createElement('div');
  dock.className = 'pxh-dock';
  const sign = document.createElement('div');
  sign.className = 'pxh-sign gone';
  const actRow = document.createElement('div');
  actRow.className = 'pxh-row';
  const fixRow = document.createElement('div');
  fixRow.className = 'pxh-row';
  dock.append(sign, actRow, fixRow);
  root.appendChild(dock);

  /** 按钮正上方的小奶油牌子：长按 / 第一次出现时亮一下 */
  let signTimer = 0;
  let signText = '';
  const showSign = (s: string, ms = 0) => {
    if (s !== signText) {
      signText = s;
      sign.replaceChildren(view(txt(s, INK, undefined, null), 0));
    }
    sign.classList.remove('gone');
    clearTimeout(signTimer);
    if (ms > 0) signTimer = window.setTimeout(() => sign.classList.add('gone'), ms);
  };
  const hideSign = () => {
    clearTimeout(signTimer);
    sign.classList.add('gone');
  };

  /** 常驻按钮：轻点 = 做，按住 = 看名字 */
  for (const bd of o.buttons ?? []) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pxh-btn pxh-fixed';
    b.dataset.id = bd.id;
    b.setAttribute('aria-label', t(bd.label));
    b.appendChild(view(icon(bd.icon)));
    let t0 = 0;
    let timer = 0;
    b.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      t0 = performance.now();
      b.classList.add('down');
      timer = window.setTimeout(() => showSign(t(bd.label)), LONG_MS);
    });
    const up = (fire: boolean) => {
      clearTimeout(timer);
      if (!b.classList.contains('down')) return;
      b.classList.remove('down');
      const long = performance.now() - t0 >= LONG_MS;
      if (long) showSign(t(bd.label), 600);
      if (fire && !long) bd.onTap();
    };
    b.addEventListener('pointerup', () => up(true));
    b.addEventListener('pointercancel', () => up(false));
    b.addEventListener('pointerleave', () => up(false));
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    b.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        bd.onTap();
      }
    });
    fixRow.prepend(b);
  }

  // 动作键（按住干活）、拿 / 放：奶油色圆底板 + 图标；槽位固定，没活时空着（visibility）
  const PLATE = 26;
  const plate = {
    idle: spriteCanvas({ rows: plateRows(PLATE, 'W', 'w') }, 'plate-idle'),
    on: spriteCanvas({ rows: plateRows(PLATE, 'Y', 'y') }, 'plate-on'),
  };
  const mkAct = (cls: string) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `pxh-btn pxh-act ${cls} empty`;
    const pl = view(plate.idle, 1, 'pxh-plate');
    const ic = document.createElement('canvas');
    ic.className = 'pxh-px pxh-icon';
    ic.dataset.k = '1';
    // 空的 canvas 默认 300×150：先给个 1×1，免得没活时把槽位撑大
    ic.width = 1;
    ic.height = 1;
    b.append(pl, ic);
    return { b, pl, ic };
  };
  const use = mkAct('pxh-use');
  const pick = mkAct('pxh-pick');
  actRow.append(pick.b, use.b);
  const press = (b: HTMLButtonElement, down: () => void, upFn?: () => void) => {
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (b.classList.contains('empty')) return;
      try {
        b.setPointerCapture(e.pointerId);
      } catch {}
      b.classList.add('down');
      down();
    });
    const release = () => {
      if (!b.classList.contains('down')) return;
      b.classList.remove('down');
      upFn?.();
    };
    b.addEventListener('pointerup', release);
    b.addEventListener('pointercancel', release);
    b.addEventListener('lostpointercapture', release);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
  };
  let useLabel = '';
  let useT0 = 0;
  let useTimer = 0;
  press(
    use.b,
    () => {
      play.setUse(true);
      useT0 = performance.now();
      useTimer = window.setTimeout(() => useLabel && showSign(useLabel), LONG_MS);
    },
    () => {
      play.setUse(false);
      clearTimeout(useTimer);
      if (performance.now() - useT0 >= LONG_MS) showSign(useLabel, 500);
    },
  );
  let pickLabel = '';
  press(pick.b, () => play.pick());
  /** 见过的活：第一次出现时字亮 1.5 秒，之后只在长按时 */
  const seen = new Set<string>();

  // ── 左下：调试小点 ──
  const dbgBtn = document.createElement('button');
  dbgBtn.type = 'button';
  dbgBtn.className = 'pxh-dbg';
  dbgBtn.setAttribute('aria-label', t('debug'));
  dbgBtn.appendChild(view(icon('dots')));
  root.appendChild(dbgBtn);
  const setDebug = (on: boolean) => {
    debug = on;
    document.body.classList.toggle('pxh-debug', on);
    if (!on) panel?.toggle(false);
  };
  dbgBtn.addEventListener('click', () => setDebug(!debug));
  if (params.get('debug') === '1') setDebug(true);

  // ── 场景里：心情泡、点开的一句话、点人 ──
  const moodsEl = document.createElement('div');
  moodsEl.className = 'pxh-moods';
  root.appendChild(moodsEl);
  interface MoodEl {
    el: HTMLButtonElement;
    cv: HTMLCanvasElement;
    key: string;
    text: string;
  }
  const moodEls: MoodEl[] = [];
  const balloon = document.createElement('div');
  balloon.className = 'pxh-balloon';
  balloon.hidden = true;
  moodsEl.appendChild(balloon);
  /** 点开的：哪个泡（按 key）/ 点的人 */
  let open: { key: string; until: number } | null = null;
  let peekV: (Peek & { until: number }) | null = null;
  let balloonKey = '';
  function fillBalloon(key: string, title: string | null, line: string) {
    if (key === balloonKey) return;
    balloonKey = key;
    balloon.replaceChildren();
    if (title) balloon.appendChild(view(txt(title, INK, undefined, null), 0, 'pxh-name'));
    balloon.appendChild(view(txt(line, INK, 100 * S, null), 0));
  }
  balloon.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    const f = peekV?.onTap;
    open = null;
    peekV = null;
    balloon.hidden = true;
    f?.();
  });

  // ── 上方一行字 + 弹出来的东西 ──
  const toastEl = document.createElement('div');
  toastEl.className = 'pxh-toast gone';
  root.appendChild(toastEl);
  let toastTimer = 0;
  function pop(text: string, ic: IconId | null = null, sec = 1.8) {
    toastEl.replaceChildren();
    if (ic) toastEl.appendChild(view(icon(ic), 2, 'pxh-item'));
    toastEl.appendChild(view(txt(text, CREAM, Math.min(innerWidth - 40, 520)), 0));
    toastEl.classList.remove('gone');
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toastEl.classList.add('gone'), sec * 1000);
  }

  // ── 地点名 ──
  const placeEl = document.createElement('div');
  placeEl.className = 'pxh-place';
  root.appendChild(placeEl);
  function place(name: string) {
    placeEl.replaceChildren(view(txt(name), 0));
    placeEl.classList.remove('show');
    void placeEl.offsetWidth;
    placeEl.classList.add('show');
  }

  // ── 开局的操作提示：5 秒，或者第一次碰画面就淡掉 ──
  const hintEl = document.createElement('div');
  hintEl.className = 'pxh-hint';
  hintEl.appendChild(view(txt(t('hint')), 0));
  root.appendChild(hintEl);
  const hideHint = () => hintEl.classList.add('gone');
  const hintTimer = window.setTimeout(hideHint, 5000);
  canvas.addEventListener('pointerdown', () => {
    clearTimeout(hintTimer);
    window.setTimeout(hideHint, 600);
    // 点画面别的地方：收起点开的一句话
    open = null;
  });

  // ── 转场 ──
  const dirV = new THREE.Vector3();
  const iris = createIris({
    center: () => {
      play.director.getWorldPosition(dirV);
      dirV.y += 0.9;
      return play.project(dirV, canvas.clientWidth, canvas.clientHeight);
    },
  });

  // ── 每帧 ──
  const tmp = new THREE.Vector3();
  const anchorAt = (a: Anchor, dy: number): THREE.Vector3 | null => {
    if (typeof a === 'function') return a();
    if ((a as THREE.Vector3).isVector3) return a as THREE.Vector3;
    const ob = a as THREE.Object3D;
    if (!ob.parent || !ob.visible) return null;
    ob.getWorldPosition(tmp);
    tmp.y += dy;
    return tmp;
  };
  let lastToast = 0;
  let wasUse = '';
  let wasPick = '';
  let wasOn = false;
  const setAct = (a: { b: HTMLButtonElement; ic: HTMLCanvasElement }, label: string, id: IconId) => {
    a.b.classList.toggle('empty', !label);
    a.b.setAttribute('aria-label', label);
    if (label) put(a.ic, icon(id));
    if (label && !seen.has(label)) {
      seen.add(label);
      showSign(label, 1500);
    }
  };
  const hud: PixelHud = {
    root,
    iris,
    pop,
    place,
    setDebug,
    peek(p) {
      peekV = p ? { ...p, until: performance.now() + (p.sec ?? 5) * 1000 } : null;
      open = null;
      if (p) balloonKey = '';
    },
    frame() {
      // 转屏 / 改窗口：纹素倍数变了就重设所有像素图的大小、重画字
      const s2 = hudScale();
      if (s2 !== S) {
        S = s2;
        root.style.setProperty('--s', String(S));
        rescale();
        moneyKey = '';
        signText = '';
        balloonKey = '';
      }
      drawClockNow();
      placePanel();
      // 钱
      const m = o.money?.() ?? null;
      const mk = `${m}|${S}`;
      if (mk !== moneyKey) {
        moneyKey = mk;
        moneyEl.hidden = m === null;
        if (m !== null) put(moneyCv, txt(m.toLocaleString('en-US')));
      }
      const ui = play.ui();
      // 动作键
      if (ui.use !== wasUse) {
        wasUse = ui.use;
        useLabel = ui.use;
        setAct(use, ui.use, actionIcon(ui.use));
        if (!ui.use && use.b.classList.contains('down')) {
          use.b.classList.remove('down');
          play.setUse(false);
        }
      }
      if (ui.usingNow !== wasOn) {
        wasOn = ui.usingNow;
        use.b.classList.toggle('on', ui.usingNow);
        put(use.pl, ui.usingNow ? plate.on : plate.idle);
      }
      if (ui.pick !== wasPick) {
        wasPick = ui.pick;
        pickLabel = ui.pick;
        setAct(pick, pickLabel, pickIcon(pickLabel));
      }
      for (const b of fixRow.querySelectorAll<HTMLElement>('.pxh-btn')) {
        const bd = o.buttons?.find((x) => x.id === b.dataset.id);
        b.classList.toggle('on', !!bd?.pressed?.());
      }
      // 心情泡：画面里的才画（画面外不贴边：中间和边上都不放字）
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      while (moodEls.length < ui.bubbles.length) {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'pxh-mood';
        const cv = document.createElement('canvas');
        cv.className = 'pxh-px';
        cv.dataset.k = '1';
        el.appendChild(cv);
        const me: MoodEl = { el, cv, key: '', text: '' };
        el.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          peekV = null;
          open = { key: me.key, until: performance.now() + 3500 };
          balloonKey = '';
        });
        moodsEl.insertBefore(el, balloon);
        moodEls.push(me);
      }
      const now = performance.now();
      if (open && open.until < now) open = null;
      if (peekV && peekV.until < now) peekV = null;
      let balloonAt: { x: number; y: number } | null = null;
      const pad = 7;
      moodEls.forEach((me, i) => {
        const b = ui.bubbles[i];
        const wp = b ? anchorAt(b.anchor, b.dy) : null;
        const p = wp ? play.project(wp, w, h) : null;
        const on = !!p && p.x > 8 && p.x < w - 8 && p.y > 24 && p.y < h - 8;
        me.el.hidden = !on;
        if (!b || !p || !on) return;
        if (me.text !== b.text) {
          me.text = b.text;
          const id = moodOf(b.text);
          put(me.cv, spriteCanvas(moodSprite(id), `mood-${id}`));
          me.el.classList.remove('pop');
          void me.el.offsetWidth;
          me.el.classList.add('pop');
        }
        me.key = b.key;
        // 泡的尾巴尖（左下）对着头顶
        const ch = me.cv.height * S;
        me.el.style.transform = `translate(${Math.round(p.x - pad - 3 * S)}px, ${Math.round(p.y - pad - ch)}px)`;
        if (open && open.key === b.key) {
          fillBalloon(`m:${b.key}:${b.text}`, null, b.text);
          balloonAt = { x: p.x, y: p.y - ch - 2 };
        }
      });
      if (open && !balloonAt) open = null;
      if (peekV) {
        const wp = anchorAt(peekV.anchor, peekV.dy ?? 2.1);
        const p = wp ? play.project(wp, w, h) : null;
        if (p) {
          fillBalloon(`p:${peekV.title}:${peekV.line}`, peekV.title, peekV.line);
          balloonAt = p;
        } else peekV = null;
      }
      balloon.hidden = !balloonAt;
      if (balloonAt) {
        const bw = balloon.offsetWidth;
        const bh = balloon.offsetHeight;
        const at = balloonAt as { x: number; y: number };
        // 尾巴（左边 10 px 处）对着锚点；贴边时整块挪，尾巴跟着挪
        const x = Math.round(Math.min(Math.max(at.x - 13, 8), w - bw - 8));
        const y = Math.round(Math.max(at.y - bh - 10, 8));
        balloon.style.transform = `translate(${x}px, ${y}px)`;
        balloon.style.setProperty('--tail', `${Math.round(Math.min(Math.max(at.x - x - 3, 6), bw - 14))}px`);
      }
      // 提示 → 上方一行字（挑得出东西就弹一个图标）
      if (ui.toast && ui.toast.id !== lastToast) {
        lastToast = ui.toast.id;
        const ic = actionIcon(ui.toast.text);
        pop(ui.toast.text, ic === 'racket' ? null : ic);
      }
    },
  };
  (window as unknown as Record<string, unknown>).__hud = hud;
  if (params.get('hudsheet') === '1') showSheet();
  return hud;
}

/** ?hudsheet=1：所有图标、心情泡、几个时刻的日钟摆成一张（3 倍），看素材用 */
function showSheet() {
  const box = document.createElement('div');
  Object.assign(box.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '50',
    background: '#8a7fa8',
    display: 'flex',
    flexWrap: 'wrap',
    alignContent: 'flex-start',
    gap: '12px',
    padding: '12px',
  });
  const add = (src: HTMLCanvasElement, k = 3) => {
    const c = document.createElement('canvas');
    c.className = 'pxh-px';
    blit(c, src, k);
    c.style.imageRendering = 'pixelated';
    box.appendChild(c);
  };
  for (const id of Object.keys(ICONS) as IconId[]) add(spriteCanvas(ICONS[id], id));
  for (const id of Object.keys(MOODS) as MoodId[]) add(spriteCanvas(moodSprite(id), `mood-${id}`));
  for (const id of Object.keys(WEATHER_ICONS) as Weather[]) add(spriteCanvas(WEATHER_ICONS[id], `w-${id}`));
  const base = { sky: { top: 0x58a8e6, horizon: 0xbfe2f2 } };
  for (const [hour, weather] of [
    [7.5, 'clear'],
    [12, 'clear'],
    [12, 'cloudy'],
    [18.1, 'clear'],
    [18.1, 'rain'],
    [22, 'clear'],
  ] as [number, Weather][]) {
    const { w, h, px } = drawClock({ hour, weather, look: dayLook(hour, weather, base) });
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    (c.getContext('2d') as CanvasRenderingContext2D).putImageData(new ImageData(px, w, h), 0, 0);
    add(c);
  }
  add(textCanvas('周三 第3天 · 12,480', { px: 12 }), 2);
  add(textCanvas('WED DAY 3 · 12,480', { px: 12 }), 2);
  add(textCanvas('和 Harper 说话', { px: 18 }), 1);
  document.body.appendChild(box);
}

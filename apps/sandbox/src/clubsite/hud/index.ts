// 像素界面（所有俱乐部场景都能用；clubwalk 先接）。参考《垂钓手记》：界面只占三个角，画面中间没有字。
// - 左上：日钟（clock.ts，画着这一刻的天，外圈一天的进度）+ 一行日期；点它展开原来的时刻和天气面板（daylight/hud.ts）。
// - 右上：金币 + 数字。
// - 右下：像素图标按钮（≥ 48 px）。常驻的一排（名册、地图……由场景给），上面是这里能干的活（大的动作键：按住干活；拿 / 放）。
//   字只在长按、或者这个活第一次出现的时候在按钮左边亮一下。
// - 场景里：人头上只画心情泡（icons.ts 的 MOODS，mood.ts 按台词挑），点泡才看整句；点人显示名字和一句话（peek）。
// - 反馈：画面上方一行白字黑边 + 弹出来的东西（toast → pop），过一会儿消失。开局的操作提示几秒后消失。
// - 调试牌（像素级别、模拟状态条）默认藏着：?debug=1 或者点左下角的小点。
// - 转场：iris.ts 的圆形遮罩（收拢 → 黑 → 展开）。
// 不做"面板 → 子菜单 → 按钮"（玩法准则 1）：按钮直接是动作，面板只有日钟点开的那一个（原来就有的调时间工具）。
//
// 接入（场景 main，在 mountPlay、mountDaylight 之后）：
//   const hud = mountPixelHud({ play, canvas, day, money: () => cast.money(), buttons: [...] });
//   每帧 render 之后：hud.frame()（play.hud.frame() 照常调：它管画面上的指针输入）
import * as THREE from 'three';
import type { Daylight } from '../daylight';
import { dayLook, type Weather } from '../daylight/sky';
import type { Anchor, Play } from '../play';
import { type ClockData, drawClock } from './clock';
import { CREAM, GOLD, INK } from './colors';
import { textCanvas } from './font';
import { type TKey, t, weekday } from './i18n';
import { ICONS, type IconId, MOODS, type MoodId, moodSprite } from './icons';
import { createIris, type Iris } from './iris';
import { moodOf } from './mood';
import { blit, pixelCanvas, spriteCanvas } from './sprite';
import { HUD_CSS } from './style';

export { lang, t } from './i18n';
export type { IconId, MoodId } from './icons';
export type { Iris } from './iris';
export { createIris } from './iris';
export { moodOf } from './mood';

/** 界面纹素 → CSS 像素 */
export const HUD_SCALE = 2;

export interface HudButton {
  id: string;
  icon: IconId;
  label: TKey;
  onTap(): void;
  /** 按下的样子（开着的面板：地图开着时地图键按下去） */
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

const LONG_MS = 420;

export function mountPixelHud(o: PixelHudOpts): PixelHud {
  if (!document.getElementById('pxh-css')) {
    const st = document.createElement('style');
    st.id = 'pxh-css';
    st.textContent = HUD_CSS;
    document.head.appendChild(st);
  }
  const S = HUD_SCALE;
  const { play, canvas, day } = o;
  const params = o.params ?? new URLSearchParams(location.search);
  document.body.classList.add('pxh-on');
  const root = document.createElement('div');
  root.className = 'pxh-root';
  document.body.appendChild(root);
  const icon = (id: IconId) => spriteCanvas(ICONS[id], id);
  /** 字：高密度（汉字 12 px、点阵字 2 倍粗），按 1 倍显示 */
  const txt = (s: string, color = CREAM, maxW?: number) => textCanvas(s, { color, hi: true, maxW });

  // ── 左上：日钟 + 日期 ──
  const clockBtn = document.createElement('button');
  clockBtn.type = 'button';
  clockBtn.className = 'pxh-clock';
  clockBtn.setAttribute('aria-label', t('clock'));
  const clockCv = document.createElement('canvas');
  clockCv.className = 'pxh-px';
  const dateCv = document.createElement('canvas');
  dateCv.className = 'pxh-px';
  clockBtn.append(clockCv, dateCv);
  root.appendChild(clockBtn);
  const panel = day.panel;
  clockBtn.addEventListener('click', () => {
    if (!panel) return;
    panel.toggle();
    placePanel();
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
    const key = `${Math.floor(hour * 10)}|${weather}|${look.moon}|${look.skyTop}|${look.skyHorizon}`;
    if (key !== clockKey) {
      clockKey = key;
      const d: ClockData = { hour, look, weather };
      const { w, h, px } = drawClock(d);
      clockCv.width = w;
      clockCv.height = h;
      (clockCv.getContext('2d') as CanvasRenderingContext2D).putImageData(new ImageData(px, w, h), 0, 0);
      clockCv.style.width = `${w * S}px`;
      clockCv.style.height = `${h * S}px`;
    }
    const dayN = Math.floor(day.total / 24) + 1;
    const ds = t('date', { wd: weekday(dayN), d: dayN });
    if (ds !== dateKey) {
      dateKey = ds;
      blit(dateCv, txt(ds), 1);
    }
  }

  // ── 右上：钱 ──
  const moneyEl = document.createElement('div');
  moneyEl.className = 'pxh-money';
  moneyEl.setAttribute('aria-label', t('money'));
  const coin = pixelCanvas(icon('coin'), S);
  const moneyCv = document.createElement('canvas');
  moneyCv.className = 'pxh-px';
  moneyEl.append(coin, moneyCv);
  root.appendChild(moneyEl);
  let moneyKey: number | null | undefined;

  // ── 右下：按钮 ──
  const dock = document.createElement('div');
  dock.className = 'pxh-dock';
  const actRow = document.createElement('div');
  actRow.className = 'pxh-row';
  const fixRow = document.createElement('div');
  fixRow.className = 'pxh-row';
  dock.append(actRow, fixRow);
  root.appendChild(dock);

  /** 按钮左边的字（长按 / 第一次出现） */
  function labelFor(b: HTMLElement) {
    const l = document.createElement('canvas');
    l.className = 'pxh-px pxh-label gone';
    b.appendChild(l);
    let timer = 0;
    let cur = '';
    return {
      show(s: string, ms = 0) {
        if (s !== cur) {
          cur = s;
          blit(l, txt(s), 1);
        }
        l.classList.remove('gone');
        clearTimeout(timer);
        if (ms > 0) timer = window.setTimeout(() => l.classList.add('gone'), ms);
      },
      hide() {
        clearTimeout(timer);
        l.classList.add('gone');
      },
    };
  }

  /** 常驻按钮：轻点 = 做，按住 = 看名字 */
  for (const bd of o.buttons ?? []) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pxh-btn';
    b.dataset.id = bd.id;
    b.setAttribute('aria-label', t(bd.label));
    b.appendChild(pixelCanvas(icon(bd.icon), S));
    const lab = labelFor(b);
    let t0 = 0;
    let timer = 0;
    b.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      t0 = performance.now();
      b.classList.add('down');
      timer = window.setTimeout(() => lab.show(t(bd.label)), LONG_MS);
    });
    const up = (fire: boolean) => {
      clearTimeout(timer);
      b.classList.remove('down');
      const long = performance.now() - t0 >= LONG_MS;
      lab.hide();
      if (fire && !long) bd.onTap();
    };
    b.addEventListener('pointerup', () => up(true));
    b.addEventListener('pointercancel', () => up(false));
    b.addEventListener('pointerleave', () => {
      if (b.classList.contains('down')) up(false);
    });
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    // 键盘（桌面）：回车 / 空格
    b.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        bd.onTap();
      }
    });
    fixRow.prepend(b);
  }

  // 动作键（按住干活）：圆形底板 + 图标；拿 / 放：手
  const plate = (() => {
    // 24×24 的圆底板：靛蓝 + 奶油内圈（按着时换金色）
    const mk = (fill: string, rim: string) => {
      const rows: string[] = [];
      for (let y = 0; y < 30; y++) {
        let r = '';
        for (let x = 0; x < 30; x++) {
          const d = Math.hypot(x + 0.5 - 15, y + 0.5 - 15);
          r += d <= 13.2 ? fill : d <= 14.4 ? rim : '.';
        }
        rows.push(r);
      }
      return rows;
    };
    return {
      idle: spriteCanvas({ rows: mk('n', 'W') }, 'plate-idle'),
      on: spriteCanvas({ rows: mk('y', 'W') }, 'plate-on'),
    };
  })();
  const useBtn = document.createElement('button');
  useBtn.type = 'button';
  useBtn.className = 'pxh-btn pxh-use';
  useBtn.hidden = true;
  const usePlate = pixelCanvas(plate.idle, S, 'pxh-plate');
  const useIcon = document.createElement('canvas');
  useIcon.className = 'pxh-px pxh-icon';
  useBtn.append(usePlate, useIcon);
  const useLab = labelFor(useBtn);
  const pickBtn = document.createElement('button');
  pickBtn.type = 'button';
  pickBtn.className = 'pxh-btn pxh-pick';
  pickBtn.hidden = true;
  pickBtn.appendChild(pixelCanvas(icon('hand'), S));
  const pickLab = labelFor(pickBtn);
  actRow.append(pickBtn, useBtn);
  const press = (b: HTMLButtonElement, down: () => void, upFn?: () => void) => {
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
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
  press(
    useBtn,
    () => {
      play.setUse(true);
      if (useLabel) useLab.show(useLabel);
    },
    () => {
      play.setUse(false);
      useLab.hide();
    },
  );
  let pickLabel = '';
  press(pickBtn, () => {
    play.pick();
    if (pickLabel) pickLab.show(pickLabel, 1200);
  });
  /** 见过的活：第一次出现时字亮 2 秒，之后只在长按时 */
  const seenUse = new Set<string>();
  const seenPick = new Set<string>();

  // ── 左下：调试小点 ──
  const dbgBtn = document.createElement('button');
  dbgBtn.type = 'button';
  dbgBtn.className = 'pxh-dbg';
  dbgBtn.setAttribute('aria-label', t('debug'));
  dbgBtn.appendChild(pixelCanvas(icon('dots'), S));
  root.appendChild(dbgBtn);
  let debug = false;
  const setDebug = (on: boolean) => {
    debug = on;
    document.body.classList.toggle('pxh-debug', on);
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
    if (title) balloon.appendChild(pixelCanvas(txt(title, GOLD), 1));
    balloon.appendChild(pixelCanvas(textCanvas(line, { color: INK, outline: null, maxW: 200, hi: true }), 1));
  }
  balloon.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    if (peekV?.onTap) {
      const f = peekV.onTap;
      peekV = null;
      balloon.hidden = true;
      f();
    } else {
      open = null;
      peekV = null;
      balloon.hidden = true;
    }
  });

  // ── 上方一行字 + 弹出来的东西 ──
  const toastEl = document.createElement('div');
  toastEl.className = 'pxh-toast gone';
  root.appendChild(toastEl);
  let toastTimer = 0;
  let toastId = 0;
  function pop(text: string, ic: IconId | null = null, sec = 1.8) {
    toastEl.replaceChildren();
    if (ic) toastEl.appendChild(pixelCanvas(icon(ic), S * 2, 'pxh-item'));
    toastEl.appendChild(pixelCanvas(txt(text, CREAM, Math.min(innerWidth - 40, 520)), 1));
    toastEl.classList.remove('gone');
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toastEl.classList.add('gone'), sec * 1000);
  }

  // ── 地点名 ──
  const placeEl = document.createElement('div');
  placeEl.className = 'pxh-place';
  root.appendChild(placeEl);
  function place(name: string) {
    placeEl.replaceChildren(pixelCanvas(txt(name), 1));
    placeEl.classList.remove('show');
    void placeEl.offsetWidth;
    placeEl.classList.add('show');
  }

  // ── 开局的操作提示：5 秒，或者第一次碰画面就淡掉 ──
  const hintEl = document.createElement('div');
  hintEl.className = 'pxh-hint';
  hintEl.appendChild(pixelCanvas(txt(t('hint')), 1));
  root.appendChild(hintEl);
  const hideHint = () => hintEl.classList.add('gone');
  const hintTimer = window.setTimeout(hideHint, 5000);
  canvas.addEventListener(
    'pointerdown',
    () => {
      clearTimeout(hintTimer);
      window.setTimeout(hideHint, 600);
      // 点画面别的地方：收起点开的一句话
      open = null;
    },
    { once: false },
  );

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
      drawClockNow();
      placePanel();
      // 钱
      const m = o.money?.() ?? null;
      if (m !== moneyKey) {
        moneyKey = m;
        moneyEl.hidden = m === null;
        if (m !== null) blit(moneyCv, txt(m.toLocaleString('en-US')), 1);
      }
      const ui = play.ui();
      // 动作键
      if (ui.use !== wasUse) {
        wasUse = ui.use;
        useLabel = ui.use;
        useBtn.hidden = !ui.use;
        if (ui.use) {
          blit(useIcon, icon(actionIcon(ui.use)), S);
          if (!seenUse.has(ui.use)) {
            seenUse.add(ui.use);
            useLab.show(ui.use, 2200);
          }
        } else {
          useLab.hide();
          if (useBtn.classList.contains('down')) {
            useBtn.classList.remove('down');
            play.setUse(false);
          }
        }
      }
      useBtn.classList.toggle('on', ui.usingNow);
      const plateNow = ui.usingNow ? plate.on : plate.idle;
      if (usePlate.dataset.k !== String(ui.usingNow)) {
        usePlate.dataset.k = String(ui.usingNow);
        blit(usePlate, plateNow, S);
      }
      if (ui.pick !== wasPick) {
        wasPick = ui.pick;
        pickLabel = ui.pick;
        pickBtn.hidden = !ui.pick;
        if (ui.pick && !seenPick.has(ui.pick)) {
          seenPick.add(ui.pick);
          pickLab.show(ui.pick, 2200);
        }
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
      moodEls.forEach((me, i) => {
        const b = ui.bubbles[i];
        const wp = b ? anchorAt(b.anchor, b.dy) : null;
        const p = wp ? play.project(wp, w, h) : null;
        const on = !!p && p.x > 8 && p.x < w - 8 && p.y > 24 && p.y < h - 8;
        me.el.hidden = !on;
        if (!b || !p || !on) return;
        if (me.text !== b.text) {
          me.text = b.text;
          blit(me.cv, spriteCanvas(moodSprite(moodOf(b.text)), `mood-${moodOf(b.text)}`), S);
          me.el.classList.remove('pop');
          void me.el.offsetWidth;
          me.el.classList.add('pop');
        }
        me.key = b.key;
        // 泡的尾巴尖对着头顶：左下角 = 锚点
        me.el.style.transform = `translate(${Math.round(p.x - 7 - 4)}px, ${Math.round(p.y - 7 - me.cv.height * S)}px)`;
        if (open && open.key === b.key) {
          fillBalloon(`m:${b.key}:${b.text}`, null, b.text);
          balloonAt = { x: p.x, y: p.y - me.cv.height * S - 4 };
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
        const x = Math.round(Math.min(Math.max(at.x - 14, 8), w - bw - 8));
        const y = Math.round(Math.max(at.y - bh - 8, 8));
        balloon.style.transform = `translate(${x}px, ${y}px)`;
      }
      // 提示 → 上方一行字（挑得出东西就弹一个图标）
      if (ui.toast && ui.toast.id !== lastToast && ui.toast.id !== toastId) {
        lastToast = toastId = ui.toast.id;
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
  const add = (c: HTMLCanvasElement, k = 3) => box.appendChild(pixelCanvas(c, k));
  for (const id of Object.keys(ICONS) as IconId[]) add(spriteCanvas(ICONS[id], id));
  for (const id of Object.keys(MOODS) as MoodId[]) add(spriteCanvas(moodSprite(id), `mood-${id}`));
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
  add(textCanvas('周三 第3天', { hi: true }), 2);
  add(textCanvas('WED DAY 3  12,480', { hi: true }), 2);
  document.body.appendChild(box);
}

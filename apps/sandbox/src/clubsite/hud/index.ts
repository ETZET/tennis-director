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
import { CREAM, hex, INK } from './colors';
import { textCanvas } from './font';
import { type TKey, t, weekday } from './i18n';
import { ICONS, type IconId, MOODS, type MoodId, moodSprite, WEATHER_ICONS } from './icons';
import { createIris, type Iris } from './iris';
import { moodOf } from './mood';
import { hudScale } from './scale';
import { blit, spriteCanvas } from './sprite';
import { HUD_CSS } from './style';

export type { ActIcon, GlyphId } from './glyphs';
export { lang, type TKey, t } from './i18n';
export type { IconId, MoodId } from './icons';
export type { Iris } from './iris';
export { createIris } from './iris';
export { moodOf } from './mood';
export { hudScale } from './scale';
export * from './sheet';
export { createWaySigns, type WaySign, type WaySigns } from './waysign';

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
  /** 场景里说话的是谁（点心情泡时，上方那行字前面带名字和小人头）；不给 = 只有那句话 */
  who?: (anchor: Anchor) => Who | null;
  params?: URLSearchParams;
  /** false = 不出开局的操作提示（同一页里第二个世界的界面：玩家已经看过了） */
  hint?: boolean;
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
  /** 说话的人的颜色（上方那行字前面的小人头） */
  who?: Who | null;
}

/** 说话的人：发色、肤色、衣服色（0xRRGGBB） */
export interface Who {
  name: string;
  hair: number;
  skin: number;
  shirt: number;
}

export interface PixelHud {
  frame(): void;
  iris: Iris;
  /** 点人：头上一个奶油色小框，名字 + 一句话 */
  peek(p: Peek | null): void;
  /** 反馈：弹出来的东西（可选）+ 一行字 */
  pop(text: string, icon?: IconId | null, sec?: number, who?: Who | null): void;
  /** 地点名（进一个区域时上方淡出） */
  place(name: string): void;
  setDebug(on: boolean): void;
  /** 人物卡开着：这个人头顶一个草帽色的小箭头（卡讲的是画面里的谁）；null = 收起 */
  focus(anchor: Anchor | null, dy?: number): void;
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

/** 说话的人的小人头（9×9）：头发、脸、两只眼、脖子、衣服 */
function headSprite(w: Who) {
  return {
    rows: [
      '..HHHHH..',
      '.HHHHHHH.',
      '.HFFFFFH.',
      '.FFKFKFF.',
      '.FFFFFFF.',
      '..FFFFF..',
      '...FFF...',
      '.CCCCCCC.',
      'CCCCCCCCC',
    ],
    keys: { H: w.hair, F: w.skin, C: w.shirt },
  };
}

/** 动作键的底：直径 d 纹素的实心圆，墨 55%（场景隐约透过来但不脏），外面一圈 1 纹素的奶油细环（按住干活时变白） */
function ringCanvas(d: number, color: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = d;
  c.height = d;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const r = d / 2;
  for (let y = 0; y < d; y++)
    for (let x = 0; x < d; x++) {
      const q = Math.hypot(x + 0.5 - r, y + 0.5 - r);
      if (q > r) continue;
      g.fillStyle = q > r - 1 ? hex(color) : 'rgba(44, 40, 72, 0.55)';
      g.fillRect(x, y, 1, 1);
    }
  return c;
}

/** 角标用的 3×5 小点阵（数字和斜杠） */
const G3: Record<string, string> = {
  '0': '###|#.#|#.#|#.#|###',
  '1': '.#.|##.|.#.|.#.|###',
  '2': '##.|..#|.#.|#..|###',
  '3': '##.|..#|.#.|..#|##.',
  '4': '#.#|#.#|###|..#|..#',
  '5': '###|#..|##.|..#|##.',
  '6': '.##|#..|###|#.#|###',
  '7': '###|..#|.#.|.#.|.#.',
  '8': '###|#.#|###|#.#|###',
  '9': '###|#.#|###|..#|##.',
  '/': '..#|..#|.#.|#..|#..',
};

/** 动作键右下角的小角标（同参考的快捷键小键帽）：奶油底、1 纹素墨边、3×5 墨色点阵（计数 "1/4"），≤ 13×9 纹素 */
function keyCanvas(text: string): HTMLCanvasElement {
  const glyphs = [...text].map((ch) => G3[ch]).filter(Boolean);
  const w = glyphs.length * 4 - 1 + 4;
  const h = 9;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = hex(INK);
  g.fillRect(0, 0, w, h);
  g.fillStyle = hex(CREAM);
  g.fillRect(1, 1, w - 2, h - 2);
  g.fillStyle = hex(INK);
  glyphs.forEach((gl, k) => {
    gl.split('|').forEach((row, y) => {
      for (let x = 0; x < 3; x++) if (row[x] === '#') g.fillRect(2 + k * 4 + x, 2 + y, 1, 1);
    });
  });
  return c;
}

/** 心情泡：11×11 的奶油圆角小方块（78% 不透明），只描下沿和右沿 1 纹素墨，字形墨色单色（不是 App 图标那种整圈框） */
function moodCanvas(id: MoodId): HTMLCanvasElement {
  const n = 11;
  const c = document.createElement('canvas');
  c.width = n;
  c.height = n;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const corner = (x === 0 || x === n - 1) && (y === 0 || y === n - 1);
      if (corner) continue;
      const edge = x === n - 1 || y === n - 1;
      g.fillStyle = edge ? hex(INK) : 'rgba(255, 240, 196, 0.78)';
      g.fillRect(x, y, 1, 1);
    }
  g.fillStyle = hex(INK);
  MOODS[id].rows.forEach((row, y) => {
    // 字形里的描边（d）和高光（W）不画：单色时只留形状本身
    for (let x = 0; x < row.length; x++) if (!'.dW'.includes(row[x])) g.fillRect(x + 1, y + 1, 1, 1);
  });
  return c;
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
  /** 图标：墨色描边外面再 1 纹素奶油贴纸边（任何背景上都分得开，不用底板） */
  const icon = (id: IconId, ring = CREAM) => spriteCanvas(ICONS[id], id, true, ring);
  /**
   * 字：两种，不混中间态（第 3 轮评判）。固定的数字（钱、第几天）= 5×7 点阵字，和图标同一个纹素网格；
   * 浮动的话（上方一行、小牌子、地点名、提示）= 平滑的系统字 + 1 px 墨色细描边（同参考的浮动中文），不假装像素。
   */
  const label = (s: string, color = CREAM, cls = '') => {
    const e = document.createElement('span');
    e.className = `pxh-txt ${cls}`.trim();
    e.style.color = hex(color);
    e.textContent = s;
    return e;
  };

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
  // 日期：一个 7×7 的小日历 + 点阵数字（第几天），不用汉字
  const dateEl = document.createElement('div');
  dateEl.className = 'pxh-date';
  const dateCv = document.createElement('canvas');
  dateCv.className = 'pxh-px';
  dateCv.dataset.k = '1';
  dateEl.append(dateCv);
  clockBtn.append(clockCv, dateEl);
  root.appendChild(clockBtn);
  // 点日钟：小牌子（星期几 + 天气图标），1.8 秒；调试里 = 调时间面板
  const tip = document.createElement('div');
  tip.className = 'pxh-tip gone';
  root.appendChild(tip);
  let tipTimer = 0;
  const panel = day.panel;
  let debug = false;
  // 调试的入口：3 秒内连点日钟 5 下（玩家看不见、碰不到），或者 ?debug=1
  let taps: number[] = [];
  clockBtn.addEventListener('click', () => {
    const now = performance.now();
    taps = [...taps.filter((x) => now - x < 3000), now];
    if (taps.length >= 5) {
      taps = [];
      setDebug(!debug);
      tip.classList.add('gone');
      return;
    }
    if (debug && panel) {
      panel.toggle();
      placePanel();
      return;
    }
    const dayN = Math.floor(day.total / 24) + 1;
    tip.replaceChildren(view(spriteCanvas(WEATHER_ICONS[day.current], `w-${day.current}`)), label(weekday(dayN)));
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
      put(dateCv, textCanvas(t('dayN', { d: dayN })));
      clockBtn.setAttribute('aria-label', `${t('clock')} · ${t('date', { d: dayN })}`);
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
  actRow.className = 'pxh-row pxh-acts';
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
      sign.replaceChildren(label(s, INK, 'ink'));
    }
    sign.classList.remove('gone');
    clearTimeout(signTimer);
    if (ms > 0) signTimer = window.setTimeout(() => sign.classList.add('gone'), ms);
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

  // 动作键（按住干活）、拿 / 放：和名册、地图一样只有图标 + 奶油贴纸边，不要底板。有活的靠右排：
  // 动作键永远在最右（最顺手），拿 / 放在它左边；只有一个活时它就在最右格。按着干活时贴纸边变金、图标两格一跳
  const mkAct = (cls: string) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `pxh-btn pxh-act ${cls} empty`;
    const ic = document.createElement('canvas');
    ic.className = 'pxh-px pxh-icon';
    ic.dataset.k = '1';
    // 空的 canvas 默认 300×150：先给个 1×1，免得没活时把槽位撑大
    ic.width = 1;
    ic.height = 1;
    // 动作键：外面一圈 26 纹素的细环（墨 + 奶油，里面透明，不是底板）—— 一眼看出"这是按的"，也比常驻图标大一号；
    // 右下角一个小角标（同参考的快捷键角标）：活的名字里有"1/4"这种计数就写计数
    const ring = view(ringCanvas(26, CREAM), 1, 'pxh-ring');
    const key = document.createElement('canvas');
    key.className = 'pxh-px pxh-key';
    key.dataset.k = '1';
    key.width = 1;
    key.height = 1;
    b.append(ring, ic, key);
    return { b, ic, ring, key, id: '' as IconId | '' };
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

  // ── 调试：?debug=1，或者连点日钟 5 下（见上）；玩家看不见入口 ──
  function setDebug(on: boolean) {
    debug = on;
    document.body.classList.toggle('pxh-debug', on);
    if (!on) panel?.toggle(false);
  }
  if (params.get('debug') === '1') setDebug(true);

  // ── 场景里：心情泡、点开的一句话、点人 ──
  // 互动点头上的小箭头（代替 clubsite/play 的 CSS 三角）
  const markEl = document.createElement('div');
  markEl.className = 'pxh-mark';
  markEl.hidden = true;
  markEl.appendChild(view(spriteCanvas(ICONS.arrow, 'arrow')));
  root.appendChild(markEl);
  // 人物卡开着时那个人头顶的箭头：草帽色（这一屏唯一的暖色），比互动点的奶油小箭头大一号
  const focusEl = document.createElement('div');
  focusEl.className = 'pxh-mark pxh-focus';
  focusEl.hidden = true;
  focusEl.appendChild(view(spriteCanvas(ICONS.focus, 'focus', true, CREAM), 2));
  root.appendChild(focusEl);
  let focusV: { a: Anchor; dy: number } | null = null;
  const moodsEl = document.createElement('div');
  moodsEl.className = 'pxh-moods';
  root.appendChild(moodsEl);
  interface MoodEl {
    el: HTMLButtonElement;
    cv: HTMLCanvasElement;
    key: string;
    text: string;
    who: Who | null;
  }
  /** 点过的泡（key|台词）：这句话没换之前不再出 */
  const read = new Set<string>();
  const moodEls: MoodEl[] = [];
  /** 同屏最多几个心情泡（离总监近的先） */
  const MOOD_MAX = 1;
  /** 正在上方那行字里说话的人（点人）：再点他一次 / 点这行字 = 开他的卡片 */
  let peekV: (Peek & { until: number }) | null = null;

  // ── 上方一行字 + 弹出来的东西 ──
  const toastEl = document.createElement('div');
  toastEl.className = 'pxh-toast gone';
  root.appendChild(toastEl);
  let toastTimer = 0;
  function pop(text: string, ic: IconId | null = null, sec = 1.8, who: Who | null = null) {
    toastEl.replaceChildren();
    if (ic) toastEl.appendChild(view(icon(ic), 2, 'pxh-item'));
    const row = document.createElement('div');
    row.className = 'pxh-line';
    // 别人说的话：小人头 + 名字（金）+ 一句话，一眼知道是谁说的
    if (who) {
      row.appendChild(view(spriteCanvas(headSprite(who), `head-${who.name}-${who.shirt}`), 1, 'pxh-head'));
      row.appendChild(label(`${who.name}${t('colon')}`, CREAM, 'name'));
    }
    row.appendChild(label(text, CREAM));
    toastEl.appendChild(row);
    toastEl.classList.remove('gone');
    toastEl.classList.toggle('tap', !!peekV?.onTap && !!who && peekV.title === who.name);
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toastEl.classList.add('gone');
      toastEl.classList.remove('tap');
    }, sec * 1000);
  }
  toastEl.addEventListener('pointerdown', (e) => {
    if (!toastEl.classList.contains('tap')) return;
    e.stopPropagation();
    const f = peekV?.onTap;
    peekV = null;
    toastEl.classList.add('gone');
    toastEl.classList.remove('tap');
    f?.();
  });

  // ── 地点名 ──
  const placeEl = document.createElement('div');
  placeEl.className = 'pxh-place';
  root.appendChild(placeEl);
  function place(name: string) {
    placeEl.replaceChildren(label(name));
    placeEl.classList.remove('show');
    void placeEl.offsetWidth;
    placeEl.classList.add('show');
  }

  // ── 开局的操作提示：5 秒，或者第一次碰画面就淡掉 ──
  const hintEl = document.createElement('div');
  hintEl.className = 'pxh-hint';
  hintEl.appendChild(label(t('hint')));
  root.appendChild(hintEl);
  const hideHint = () => hintEl.classList.add('gone');
  if (o.hint === false) hideHint();
  const hintTimer = window.setTimeout(hideHint, 5000);
  canvas.addEventListener('pointerdown', () => {
    clearTimeout(hintTimer);
    window.setTimeout(hideHint, 600);
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
  const setAct = (a: ReturnType<typeof mkAct>, text: string, id: IconId) => {
    a.b.classList.toggle('empty', !text);
    a.b.setAttribute('aria-label', text);
    a.id = text ? id : '';
    // 动作键在墨色小盘上：图标不要奶油贴纸边（只有墨描边），四周留出空，不碰环
    if (text) put(a.ic, spriteCanvas(ICONS[id], id));
    const n = /(\d+\s*\/\s*\d+)/.exec(text)?.[1]?.replace(/\s/g, '');
    a.key.hidden = !n;
    if (n) put(a.key, keyCanvas(n));
    if (text && !seen.has(text)) {
      seen.add(text);
      showSign(text, 1500);
    }
  };
  const hud: PixelHud = {
    root,
    iris,
    pop,
    place,
    setDebug,
    focus(a, dy = 2.2) {
      focusV = a ? { a, dy } : null;
      if (!a) focusEl.hidden = true;
    },
    peek(p) {
      const now = performance.now();
      // 同一个人、那行字还在：第二次点他 = 开卡片
      if (p && peekV && peekV.title === p.title && peekV.until > now && p.onTap) {
        peekV = null;
        toastEl.classList.add('gone');
        p.onTap();
        return;
      }
      // 收起（开了人物卡：卡上已经有这句话了）
      if (!p) {
        peekV = null;
        toastEl.classList.add('gone');
        toastEl.classList.remove('tap');
        return;
      }
      peekV = { ...p, until: now + (p.sec ?? 2.6) * 1000 };
      pop(p.line, null, p.sec ?? 2.6, p.who ?? { name: p.title, hair: INK, skin: CREAM, shirt: INK });
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
      }
      drawClockNow();
      placePanel();
      // 钱
      const m = o.money?.() ?? null;
      const mk = `${m}|${S}`;
      if (mk !== moneyKey) {
        moneyKey = mk;
        moneyEl.hidden = m === null;
        if (m !== null) put(moneyCv, textCanvas(m.toLocaleString('en-US'), { px: 7 * S }));
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
        put(use.ring, ringCanvas(26, ui.usingNow ? 0xffffff : CREAM));
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
      // 心情泡：分得出类的台词才出泡（"…"不出），画面里的、离总监近的最多 MOOD_MAX 个；点泡 = 那句话上方一行字
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      while (moodEls.length < MOOD_MAX) {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'pxh-mood';
        el.hidden = true;
        const cv = document.createElement('canvas');
        cv.className = 'pxh-px';
        cv.dataset.k = '1';
        el.appendChild(cv);
        const me: MoodEl = { el, cv, key: '', text: '', who: null };
        el.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          peekV = null;
          pop(me.text, null, 2.4, me.who);
          // 点过的泡：弹一下就收起（"已读"），这句话没换之前不再出
          read.add(`${me.key}|${me.text}`);
          me.el.classList.remove('pop');
          void me.el.offsetWidth;
          me.el.classList.add('pop', 'read');
        });
        moodsEl.appendChild(el);
        moodEls.push(me);
      }
      if (peekV && peekV.until < performance.now()) peekV = null;
      play.director.getWorldPosition(dirV);
      const cands: { b: (typeof ui.bubbles)[number]; p: { x: number; y: number }; d: number }[] = [];
      for (const b of ui.bubbles) {
        if (moodOf(b.text) === '…' || read.has(`${b.key}|${b.text}`)) continue;
        const wp = anchorAt(b.anchor, b.dy);
        if (!wp) continue;
        const d = Math.hypot(wp.x - dirV.x, wp.z - dirV.z);
        const p = play.project(wp, w, h);
        if (p.x > 8 && p.x < w - 8 && p.y > 24 && p.y < h - 8) cands.push({ b, p, d });
      }
      cands.sort((a, b) => a.d - b.d);
      const pad = 11;
      moodEls.forEach((me, i) => {
        const c = cands[i];
        me.el.hidden = !c;
        if (!c) return;
        if (me.text !== c.b.text || me.key !== c.b.key) {
          me.text = c.b.text;
          me.key = c.b.key;
          me.who = o.who?.(c.b.anchor) ?? null;
          me.el.classList.remove('read');
          const id = moodOf(c.b.text);
          put(me.cv, moodCanvas(id));
          // 新的一句：重新亮起来，3.5 秒后再淡到一半
          me.el.style.animation = 'none';
          void me.el.offsetWidth;
          me.el.style.animation = '';
          me.el.classList.remove('pop');
          void me.el.offsetWidth;
          me.el.classList.add('pop');
        }
        // 泡的尾巴尖（左下）对着头顶
        const ch = me.cv.height * S;
        const cw = me.cv.width * S;
        me.el.style.transform = `translate(${Math.round(c.p.x - pad - cw / 2)}px, ${Math.round(c.p.y - pad - ch)}px)`;
      });
      // 小箭头
      // 小箭头只给"还够不着"的东西：动作键已经亮了（总监站到能干活的地方）就不画，不和动作键说同一件事
      markEl.hidden = !ui.mark || !!ui.use || !!ui.pick;
      if (ui.mark) {
        const p = play.project(ui.mark, w, h);
        const aw = markEl.offsetWidth;
        markEl.style.transform = `translate(${Math.round(p.x - aw / 2)}px, ${Math.round(p.y - markEl.offsetHeight)}px)`;
      }
      // 人物卡的那个人
      const fp = focusV ? anchorAt(focusV.a, focusV.dy) : null;
      focusEl.hidden = !fp;
      if (fp) {
        const p = play.project(fp, w, h);
        focusEl.style.transform = `translate(${Math.round(p.x - focusEl.offsetWidth / 2)}px, ${Math.round(p.y - focusEl.offsetHeight)}px)`;
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

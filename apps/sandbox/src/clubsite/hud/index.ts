// 像素界面（所有俱乐部场景都能用；clubwalk 先接）。参考《垂钓手记》：界面只占三个角，画面中间没有字。
// - 左上：日钟（clock.ts，画着这一刻的天，外圈一天的进度，网球是"现在"）+ 底下一行几点（12:12）。"第几天"只在换天时亮 3 秒；
//   点日钟 = 这一行换成"第几天 星期几"、画面上沿亮一下现在的地名，1.6 秒自己消失（第四轮：进图不再出地名）。
//   原来调时刻和天气的面板是调试工具，只在调试里（?debug=1 或连点日钟 5 下）点日钟才开。
// - 右上：金币 + 数字。
// - 右下（拇指区）：像素图标按钮，位置固定。底下一排常驻的（名册、地图……由场景给）；上面一排是这里能干的活
//   （动作键：按住干活；拿 / 放），没有活的时候槽位空着，别的按钮不跳。图标就是说明；字只在长按、或者这个活第一次出现时，
//   在按钮正上方的小奶油牌子里亮 1.5 秒（不飘在场景上）。
// - 场景里：人头上只画心情泡（icons.ts 的 MOODS，mood.ts 按台词挑），点泡才看整句；点人显示名字和他自己的一句话（peek）。
// - 反馈：干活的进账 = 钱下面一行"图标 + 数字"（gain：金币 +5、小钟 3、心 +0.3），不写整句；点人 = 上方一行（小人头 + 名字 + 一句话，
//   一行放不下就截断，2 秒）。开局的操作提示 = 一只手指点一下地面的小动画，只第一次开局出一次（localStorage 记住），不写字。
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
import { CREAM, hex, INK, INK_SHADOW, KEYS } from './colors';
import { textCanvas } from './font';
import { ACT, GLYPH } from './glyphs';
import { type TKey, t, weekday } from './i18n';
import { ICONS, type IconId, MOODS, type MoodId } from './icons';
import { createIris, type Iris } from './iris';
import { moodOf } from './mood';
import { PLACES } from './places';
import { ensurePixelFont } from './pxfont';
import { hudScale } from './scale';
import { seekersOf } from './seek';
import { setSheetAvoid, tame, tameColor } from './sheet';
import { blit, type Sprite, spriteCanvas } from './sprite';
import { HUD_CSS } from './style';

export type { ActIcon, GlyphId } from './glyphs';
export { lang, type TKey, t } from './i18n';
export type { IconId, MoodId } from './icons';
export type { Iris } from './iris';
export { createIris } from './iris';
export { createMiniMap, type MiniGraph, type MiniMap, type MiniNode } from './minimap';
export { moodOf } from './mood';
export { hudScale } from './scale';
export { provideSeekers, type Seeker, type SeekSource, seekScenes } from './seek';
export * from './sheet';
export { createWaySigns, type WaySign, type WaySigns } from './waysign';

export interface HudButton {
  id: string;
  icon: IconId;
  label: TKey;
  onTap(): void;
  /** 按下的样子（开着的东西：地图开着时地图键按下去） */
  pressed?(): boolean;
  /** 右上角的小点（有人在找你）：不吵的常驻提示 */
  dot?(): boolean;
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
  /** 现在的地名（点日钟时在画面上沿亮一下）；不给 = 不亮 */
  placeName?: () => string;
}

/**
 * 进账反馈的一格：小图标 + 数字（'+5'、'3'、'+0.3'、'−0.5'）；text 空 = 只有图标（干的是哪件活：球、扫帚、水壶、杯子……，排在最前面）
 */
export interface Gain {
  icon: 'coin' | 'clock' | 'heart' | 'heartOff' | IconId | MoodId;
  text: string;
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
  /** 进账 / 代价：钱下面一行"图标 + 数字"，不写字（who = 跟谁有关：前面带他的小人头）；at = 在哪儿挣的（那里冒一枚金币往上飘） */
  gain(items: Gain[], who?: Who | null, at?: THREE.Vector3 | null): void;
  /** 地点名：画面上沿亮一下（第四轮起只在点日钟时；进图不出） */
  place(name: string): void;
  setDebug(on: boolean): void;
  /** 人物卡开着：这个人头顶一个草帽色的小箭头（卡讲的是画面里的谁）；null = 收起 */
  focus(anchor: Anchor | null, dy?: number): void;
  readonly root: HTMLElement;
}

/** 活的名字 → 图标（场景的互动点只给中文名字；挑不出来就是一只手 = 动手） */
export function actionIcon(label: string): IconId {
  if (/说话|聊|签到/.test(label)) return 'talk';
  if (/电梯|货梯/.test(label)) return 'lift';
  if (/钥匙|代客|接车|停车|交车/.test(label)) return 'key';
  if (/扫|落叶|吹沙|刮水|捞|垃圾/.test(label)) return 'broom';
  if (/推|球车|球包车/.test(label)) return 'cart';
  if (/水|浇|喷雾/.test(label)) return 'can';
  if (/网|摇|修|伞/.test(label)) return 'wrench';
  if (/球/.test(label)) return 'ball';
  return 'hand';
}

/** 拿 / 放的图标：要拿的东西（扫帚、水壶……），挑不出来就是纸箱 */
export function pickIcon(label: string): IconId {
  const a = actionIcon(label);
  return a === 'hand' || a === 'talk' || a === 'lift' ? 'box' : a;
}

const LONG_MS = 420;
/** 草帽色（画面的焦点色）：界面上只给"现在 / 这个人 / 在找你" */
const STRAW = KEYS.X;

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

/**
 * 按钮的底板（第三轮定死，三个按钮同一种）：d×d 纹素的圆角方块，实心墨色（不透明：不和地面混出调色板外的脏色），
 * 外面一圈 1 纹素奶油细边（暗地面上分得开），再往下 1 纹素深影。亮的东西（白色公交车）上靠墨底，暗的东西上靠奶油边。
 * hollow = 空槽（这里现在没有活）：只剩那圈细边，里面透明。rim = 细边的颜色（按着干活时变白）。
 */
function plateCanvas(d: number, hollow = false, rim = CREAM): HTMLCanvasElement {
  const n = d + 2;
  const c = document.createElement('canvas');
  c.width = n;
  c.height = n + 1;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  /** 圆角：四个角各切掉 cut 纹素的台阶 */
  const inside = (x: number, y: number, m: number, cut: number) => {
    const lo = m;
    const hi = n - 1 - m;
    if (x < lo || y < lo || x > hi || y > hi) return false;
    const dx = Math.min(x - lo, hi - x);
    const dy = Math.min(y - lo, hi - y);
    return dx + dy >= cut;
  };
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      if (!inside(x, y, 0, 3)) continue;
      const body = inside(x, y, 1, 2);
      if (!body) g.fillStyle = hex(rim);
      else if (hollow) {
        if (inside(x, y, 2, 2)) continue;
        g.fillStyle = hex(INK);
      } else g.fillStyle = hex(INK);
      g.fillRect(x, y, 1, 1);
    }
  // 深影：最下面一排往下 1 纹素
  g.fillStyle = hex(INK_SHADOW);
  for (let x = 0; x < n; x++) if (inside(x, n - 1, 0, 3)) g.fillRect(x, n, 1, 1);
  for (const x of [1, 2, n - 2, n - 3])
    if (inside(x, n - 2, 0, 3) && !inside(x, n - 1, 0, 3)) g.fillRect(x, n - 1, 1, 1);
  return c;
}
/** 常驻按钮（名册、地图）的底板边长；动作键大一号、占最右下角 */
const PLATE = 22;
const PLATE_ACT = 26;

/** 按钮右上角的点（有人在找你）：7×7 —— 墨边、奶油环、3×3 草帽芯（任何底上都看得见，常驻界面上唯一的暖色点） */
function dotCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 9;
  c.height = 9;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = hex(INK);
  g.fillRect(1, 0, 7, 9);
  g.fillRect(0, 1, 9, 7);
  g.fillStyle = hex(CREAM);
  g.fillRect(1, 1, 7, 7);
  g.fillStyle = hex(STRAW);
  g.fillRect(2, 2, 5, 5);
  return c;
}

/**
 * 场景里"他在找你"：9×9 的奶油小泡（墨边）+ 3×3 草帽金点 + 朝下的尾巴，和"这儿有活"的泡一家（小一号）。
 * left = 他还会等多久（1 → 0）：泡里面一格草帽色从下往上，剩得越少越矮（null = 不知道：中间一个 3×3 金点）
 */
function seekBubble(left: number | null = null): HTMLCanvasElement {
  const n = 9;
  // 外面留 1 纹素给倒计时环
  const o = 1;
  const c = document.createElement('canvas');
  c.width = n + o * 2;
  c.height = n + 3 + o * 2;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const put1 = (x: number, y: number, col: number) => {
    g.fillStyle = hex(col);
    g.fillRect(x + o, y + o, 1, 1);
  };
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      if ((x === 0 || x === n - 1) && (y === 0 || y === n - 1)) continue;
      put1(x, y, x === 0 || y === 0 || x === n - 1 || y === n - 1 ? INK : CREAM);
    }
  for (let y = 3; y < 6; y++) for (let x = 3; x < 6; x++) put1(x, y, STRAW);
  // 尾巴
  put1(3, n - 1, INK);
  put1(5, n - 1, INK);
  put1(4, n - 1, CREAM);
  put1(3, n, INK);
  put1(4, n, CREAM);
  put1(5, n, INK);
  put1(4, n + 1, INK);
  put1(4, n + 2, INK_SHADOW);
  if (left !== null) {
    // 倒计时：泡外面一圈（-1 … n）从正上方顺时针，剩多少亮多少草帽色，其余是墨（环永远是完整的一圈，只是金的那段变短）
    const ring: [number, number][] = [];
    const m = Math.floor(n / 2);
    for (let x = m; x <= n; x++) ring.push([x, -1]);
    for (let y = 0; y <= n - 1; y++) ring.push([n, y]);
    for (let x = n - 1; x >= -1; x--) if (x < 3 || x > 5) ring.push([x, n]);
    for (let y = n - 1; y >= -1; y--) ring.push([-1, y]);
    for (let x = 0; x < m; x++) ring.push([x, -1]);
    const k = Math.round(Math.max(0, Math.min(1, left)) * ring.length);
    ring.forEach(([x, y], i) => {
      put1(x, y, i < k ? STRAW : INK);
    });
  }
  return c;
}

/** 屏幕边小人头旁边的箭头（草帽色、墨边），朝 dir（r / l / u / d） */
function arrowCanvas(dir: string): HTMLCanvasElement {
  const base = ['K....', 'KXK..', 'KXXK.', 'KXXXK', 'KXXK.', 'KXK..', 'K....'];
  const c = document.createElement('canvas');
  const vert = dir === 'u' || dir === 'd';
  c.width = vert ? 7 : 5;
  c.height = vert ? 5 : 7;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  base.forEach((row, i) => {
    for (let j = 0; j < 5; j++) {
      const ch = row[j];
      if (ch === '.') continue;
      g.fillStyle = hex(ch === 'K' ? INK : STRAW);
      const [x, y] = dir === 'r' ? [j, i] : dir === 'l' ? [4 - j, i] : dir === 'd' ? [i, j] : [i, 4 - j];
      g.fillRect(x, y, 1, 1);
    }
  });
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

/** 心情泡（闲话）：13×13 的奶油圆角小方块，四边 1 纹素墨、下面一纹素深影，字形墨色单色，不跳（第三轮：11 纹素在手机上太小） */
function moodCanvas(id: MoodId): HTMLCanvasElement {
  const n = 13;
  const c = document.createElement('canvas');
  c.width = n;
  c.height = n + 1;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const corner = (x === 0 || x === n - 1) && (y === 0 || y === n - 1);
      if (corner) continue;
      const edge = x === 0 || y === 0 || x === n - 1 || y === n - 1;
      g.fillStyle = edge ? hex(INK) : hex(CREAM);
      g.fillRect(x, y, 1, 1);
    }
  g.fillStyle = hex(INK_SHADOW);
  g.fillRect(1, n, n - 2, 1);
  g.fillStyle = hex(INK);
  MOODS[id].rows.forEach((row, y) => {
    // 字形里的描边（d）和高光（W）不画：单色时只留形状本身
    for (let x = 0; x < row.length; x++) if (!'.dW'.includes(row[x])) g.fillRect(x + 2, y + 2, 1, 1);
  });
  return c;
}

/**
 * 这儿有活（坏了、空了、脏了、有人等着）：15×15 的奶油牌子 + 往下 3 纹素的尖尾巴，四边墨、深影，字形带自己的颜色（扳手、水滴……）。
 * 比心情泡大一号、慢慢上下跳（style.ts 的 .pxh-job）；颜色都是低彩度的中档，不比草帽艳。
 */
function jobCanvas(id: MoodId): HTMLCanvasElement {
  const n = 15;
  const c = document.createElement('canvas');
  c.width = n;
  c.height = n + 4;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const put1 = (x: number, y: number, col: number) => {
    g.fillStyle = hex(col);
    g.fillRect(x, y, 1, 1);
  };
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const corner = (x === 0 || x === n - 1) && (y === 0 || y === n - 1);
      if (corner) continue;
      const edge = x === 0 || y === 0 || x === n - 1 || y === n - 1;
      put1(x, y, edge ? INK : CREAM);
    }
  // 尾巴：正下方一个 5 → 1 的墨边小三角
  const m = Math.floor(n / 2);
  for (let k = 0; k < 3; k++)
    for (let x = m - 2 + k; x <= m + 2 - k; x++) put1(x, n - 1 + k, x === m - 2 + k || x === m + 2 - k ? INK : CREAM);
  put1(m, n + 2, INK);
  put1(m, n + 3, INK_SHADOW);
  MOODS[id].rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.') continue;
      put1(x + 3, y + 3, tameColor(KEYS[ch]));
    }
  });
  return c;
}

/** 开局提示的手指（指尖朝上，奶油色，墨描边）：指尖在 (4, 1)（描边以后） */
function fingerCanvas(): HTMLCanvasElement {
  return spriteCanvas(
    {
      rows: [
        '...W.....',
        '..WWW....',
        '..WWW....',
        '..WWW....',
        '..WWWWW..',
        '..WWWWWWW',
        'WWWWWWWWW',
        'WWWWWWWWW',
        '.WWWWWWWW',
        '..WWWWWW.',
        '...WWWWW.',
        '...WWWWW.',
      ],
    },
    'hint-finger',
  );
}

/** 指尖点地的波纹：一个扁的椭圆环（地面上的透视），墨 + 奶油两圈，15 × 9 */
function ringCanvas(): HTMLCanvasElement {
  const w = 15;
  const h = 9;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const d = Math.hypot((x - 7) / 7.2, (y - 4) / 4.2);
      if (d > 1.02) continue;
      if (d > 0.8) g.fillStyle = hex(INK);
      else if (d > 0.58) g.fillStyle = hex(CREAM);
      else continue;
      g.fillRect(x, y, 1, 1);
    }
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
  ensurePixelFont();
  const root = document.createElement('div');
  root.className = 'pxh-root';
  document.body.appendChild(root);
  let S = hudScale();
  root.style.setProperty('--s', String(S));
  /** 不在底板上的图标（金币、弹出来的东西）：墨色描边外面再 1 纹素奶油贴纸边 */
  const icon = (id: IconId, ring = CREAM) => spriteCanvas(tame(ICONS[id]), id, true, ring);
  /** 底板上的图标：墨底就是它的描边，不再加边 */
  const bare = (id: IconId) => spriteCanvas(tame(ICONS[id]), id, false);
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
  const dateTx = document.createElement('span');
  dateTx.className = 'pxh-txt';
  dateTx.style.color = hex(CREAM);
  dateEl.append(dateTx);
  const timeTx = document.createElement('span');
  timeTx.className = 'pxh-txt pxh-time';
  timeTx.style.color = hex(CREAM);
  dateEl.append(timeTx);
  clockBtn.append(clockCv, dateEl);
  /** 显示的时刻（游戏分钟，一天里）：跟着 day.total 走；一下跳了好几分钟就花 0.6 秒数上去 */
  let shownMin = -1;
  let jumpFrom = 0;
  let jumpTo = 0;
  let jumpT0 = 0;
  root.appendChild(clockBtn);
  // 点日钟：几点那一行上面亮"第几天 星期几"、画面上沿亮现在的地名，1.6 秒；调试里 = 调时间面板。换天时"第几天"自己亮 3 秒
  let weekdayUntil = 0;
  let dayShowUntil = 0;
  let lastDayN = -1;
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
      weekdayUntil = 0;
      dateKey = '';
      return;
    }
    if (debug && panel) {
      panel.toggle();
      placePanel();
      return;
    }
    weekdayUntil = now + 1600;
    dateKey = '';
    const pn = o.placeName?.();
    if (pn) place(pn, 1.6);
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
    const weather = day.current;
    // 室内图（day.override 固定的室内光，天是黑的）：日钟照样画外面这一刻的天（第四轮：大堂里正午画成夜空）
    const look = day.override ? dayLook(hour, weather, { sky: { top: 0x58a8e6, horizon: 0xbfe2f2 } }) : day.look;
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
    const pnow = performance.now();
    // 换天：第一次读到的那天不算（开局不亮），之后天数变了亮 3 秒
    if (lastDayN >= 0 && dayN !== lastDayN) dayShowUntil = pnow + 3000;
    lastDayN = dayN;
    const wdShow = pnow < weekdayUntil;
    const dayShow = wdShow || pnow < dayShowUntil;
    const ds = `${t('date', { wd: weekday(dayN), d: dayN })}|${S}|${wdShow}|${dayShow}`;
    if (ds !== dateKey) {
      dateKey = ds;
      dateTx.textContent = wdShow ? `${t('dayN', { d: dayN })} ${weekday(dayN)}` : t('dayN', { d: dayN });
      dateTx.hidden = !dayShow;
      clockBtn.setAttribute('aria-label', `${t('clock')} · ${t('date', { d: dayN })}`);
    }
    // 几点：整 1 分钟走一格
    const nowMin = Math.floor((((day.total % 24) + 24) % 24) * 60);
    const tnow = performance.now();
    if (shownMin < 0 || nowMin < shownMin - 60) shownMin = nowMin;
    else if (nowMin - shownMin > 3 && tnow - jumpT0 > 650) {
      jumpFrom = shownMin;
      jumpTo = nowMin;
      jumpT0 = tnow;
      timeTx.classList.add('jump');
    }
    const k = Math.min(1, (tnow - jumpT0) / 600);
    const show = k < 1 ? Math.round(jumpFrom + (jumpTo - jumpFrom) * k) : nowMin;
    if (k >= 1) timeTx.classList.remove('jump');
    if (show !== shownMin || !timeTx.textContent) {
      shownMin = show;
      timeTx.textContent = `${Math.floor(show / 60)}:${String(show % 60).padStart(2, '0')}`;
    }
  }

  // ── 右上：钱 ──
  const moneyEl = document.createElement('div');
  moneyEl.className = 'pxh-money';
  moneyEl.setAttribute('aria-label', t('money'));
  const moneyTx = document.createElement('span');
  moneyTx.className = 'pxh-txt';
  moneyTx.style.color = hex(CREAM);
  moneyEl.append(view(icon('coin')), moneyTx);
  root.appendChild(moneyEl);
  let moneyKey = '';

  /** 进账：钱的数字正下方一行"图标 + 数字"（金币 +5 · 小钟 3），右对齐，往上飘一点就消失 */
  const cpopEl = document.createElement('div');
  cpopEl.className = 'pxh-cpop gone';
  root.appendChild(cpopEl);
  let cpopT = 0;
  const GAIN_ICON: Partial<Record<Gain['icon'], () => HTMLCanvasElement>> = {
    coin: () => icon('coin'),
    clock: () => spriteCanvas(tame(GLYPH.clock), 'gain-clock', true, CREAM),
    heart: () => spriteCanvas(tame(GLYPH.heart), 'gain-heart', true, CREAM),
    heartOff: () => spriteCanvas(tame(GLYPH.heartOff), 'gain-heartOff', true, CREAM),
  };
  const gainIcon = (id: Gain['icon']): HTMLCanvasElement =>
    GAIN_ICON[id]?.() ??
    (id in ICONS
      ? icon(id as IconId)
      : spriteCanvas(tame(MOODS[id as MoodId] ?? MOODS['!']), `gain-${id}`, true, CREAM));
  /** 在哪儿挣的：那里冒一枚小金币，往上飘 1 秒就没（不写数） */
  const burstEl = document.createElement('div');
  burstEl.className = 'pxh-burst';
  burstEl.hidden = true;
  burstEl.appendChild(view(icon('coin')));
  root.appendChild(burstEl);
  let burstT = 0;
  function gain(items: Gain[], who: Who | null = null, at: THREE.Vector3 | null = null) {
    if (at) {
      const p = play.project(at, canvas.clientWidth, canvas.clientHeight);
      burstEl.style.left = `${Math.round(p.x)}px`;
      burstEl.style.top = `${Math.round(p.y)}px`;
      burstEl.hidden = false;
      burstEl.classList.remove('up');
      void burstEl.offsetWidth;
      burstEl.classList.add('up');
      clearTimeout(burstT);
      burstT = window.setTimeout(() => {
        burstEl.hidden = true;
      }, 1100);
    }
    const kids: HTMLElement[] = [];
    if (who) kids.push(view(spriteCanvas(headSprite(who), `head-${who.name}-${who.shirt}`), 1, 'pxh-head'));
    for (const it of items) {
      const cell = document.createElement('span');
      cell.className = 'pxh-gcell';
      cell.append(view(gainIcon(it.icon)));
      if (it.text) cell.append(view(textCanvas(it.text, { color: CREAM })));
      kids.push(cell);
    }
    cpopEl.replaceChildren(...kids);
    cpopEl.setAttribute('aria-label', items.map((i) => i.text).join(' '));
    cpopEl.classList.remove('gone', 'up');
    void cpopEl.offsetWidth;
    cpopEl.classList.add('up');
    clearTimeout(cpopT);
    cpopT = window.setTimeout(() => cpopEl.classList.add('gone'), 2600);
  }
  function coinPop(text: string) {
    cpopEl.replaceChildren(label(text));
    cpopEl.classList.remove('gone', 'up');
    void cpopEl.offsetWidth;
    cpopEl.classList.add('up');
    clearTimeout(cpopT);
    cpopT = window.setTimeout(() => cpopEl.classList.add('gone'), 2600);
  }

  // ── 右下：按钮（固定槽位） ──
  const dock = document.createElement('div');
  dock.className = 'pxh-dock';
  const sign = document.createElement('div');
  sign.className = 'pxh-sign gone';
  // 一行：[名册][地图][动作键]，动作键在最右下角（最常按）；拿 / 放叠在动作键正上方（有东西可拿才出现，别的按钮不跳）
  const pickRow = document.createElement('div');
  pickRow.className = 'pxh-row pxh-picks';
  const fixRow = document.createElement('div');
  fixRow.className = 'pxh-row';
  dock.append(sign, pickRow, fixRow);
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
    b.appendChild(view(plateCanvas(PLATE), 1, 'pxh-plate'));
    b.appendChild(view(bare(bd.icon), 1, 'pxh-icon'));
    // 小点：有人在找你（bd.dot，或者人物界面报来的 seek.ts）
    const dot = view(dotCanvas(), 1, 'pxh-dot');
    dot.hidden = true;
    b.appendChild(dot);
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
    const ring = view(plateCanvas(cls === 'pxh-use' ? PLATE_ACT : PLATE, true), 1, 'pxh-plate');
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
  pickRow.append(pick.b);
  fixRow.append(use.b);
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
  focusEl.appendChild(view(spriteCanvas(ICONS.focus, 'focus', true), 1));
  root.appendChild(focusEl);
  let focusV: { a: Anchor; dy: number } | null = null;
  // 点了一个人（上方那行字亮着）：他头顶一个奶油小箭头（不是草帽色：卡还没开），那行字收起就没有
  const selEl = document.createElement('div');
  selEl.className = 'pxh-mark pxh-sel';
  selEl.hidden = true;
  selEl.appendChild(view(spriteCanvas(ICONS.arrow, 'arrow')));
  root.appendChild(selEl);
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

  // ── 屏幕边的指示（画面外的东西）：一块墨底小牌 + 里面一个小图 + 朝它的草帽色箭头，贴着它那一边 ──
  // 两个：有人在找你（他的小人头，点了总监走过去）、这儿有活（活的心情字形，比如扳手、水滴；只指路，点不了）
  const edgeV = new THREE.Vector3();
  function makeEdge(tap?: (id: string) => void) {
    const el = document.createElement(tap ? 'button' : 'div');
    if (tap) (el as HTMLButtonElement).type = 'button';
    el.className = `pxh-btn pxh-edge${tap ? '' : ' pxh-edge-job'}`;
    el.hidden = true;
    const ic = document.createElement('canvas');
    ic.className = 'pxh-px pxh-icon';
    ic.dataset.k = '1';
    const ar = document.createElement('canvas');
    ar.className = 'pxh-px pxh-earrow';
    ar.dataset.k = '1';
    el.append(view(plateCanvas(18), 1, 'pxh-plate'), ic, ar);
    root.appendChild(el);
    const st = { id: '', key: '', dir: '' };
    if (tap)
      el.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (st.id) tap(st.id);
      });
    return {
      hide() {
        el.hidden = true;
        st.id = '';
        st.dir = '';
      },
      /** 放到屏幕点 (x, y)（在屏幕外）那一边；avoid = 另一个指示已经占了的那一边（同一边就往里挪开 60 px） */
      show(
        id: string,
        x: number,
        y: number,
        w: number,
        h: number,
        art: () => HTMLCanvasElement,
        label: string,
        avoid = '',
      ) {
        const cx = w / 2;
        const cy = h / 2;
        const dx = x - cx;
        const dy = y - cy;
        const m = 30;
        const top = 130;
        const bottom = h - 150;
        const kx = Math.abs(dx) > 0.01 ? (cx - m) / Math.abs(dx) : 1e9;
        const ky = Math.abs(dy) > 0.01 ? (dy < 0 ? cy - top : bottom - cy) / Math.abs(dy) : 1e9;
        const k = Math.min(kx, ky);
        const dir = kx <= ky ? (dx > 0 ? 'r' : 'l') : dy > 0 ? 'd' : 'u';
        st.id = id;
        el.hidden = false;
        const key = `${label}|${dir}`;
        if (key !== st.key) {
          st.key = key;
          put(ic, art());
          put(ar, arrowCanvas(dir));
          el.dataset.dir = dir;
          el.setAttribute('aria-label', label);
        }
        let ex = cx + dx * k;
        let ey = cy + dy * k;
        if (avoid === dir) {
          if (dir === 'l' || dir === 'r') ey += ey > cy ? -60 : 60;
          else ex += ex > cx ? -60 : 60;
        }
        st.dir = dir;
        el.style.transform = `translate(${Math.round(ex - el.offsetWidth / 2)}px, ${Math.round(ey - el.offsetHeight / 2)}px)`;
      },
      get dir() {
        return st.dir;
      },
    };
  }
  const seekEdge = makeEdge((id) => seekersOf(play)?.go(id));
  const jobEdge = makeEdge();
  // 有人在找你，他在画面里：头顶一个草帽色小点；在别的图：名册键上的点（seekAway）
  const seekDot = document.createElement('div');
  seekDot.className = 'pxh-mark pxh-seekdot';
  seekDot.hidden = true;
  const seekCv = view(seekBubble(), 1);
  seekDot.appendChild(seekCv);
  root.appendChild(seekDot);
  let seekLeftKey = '';
  let seekAway = false;
  function seekFrame(w: number, h: number) {
    const list = seekersOf(play)?.list() ?? [];
    let away = false;
    let edge: { id: string; who: Who; x: number; y: number } | null = null;
    let inView: { x: number; y: number; id: string } | null = null;
    play.director.getWorldPosition(edgeV);
    const dx0 = edgeV.x;
    const dz0 = edgeV.z;
    let best = Number.POSITIVE_INFINITY;
    for (const s of list) {
      if (!s.obj?.parent || !s.obj.visible) {
        away = true;
        continue;
      }
      s.obj.getWorldPosition(edgeV);
      const d = Math.hypot(edgeV.x - dx0, edgeV.z - dz0);
      edgeV.y += s.dy;
      const p = play.project(edgeV, w, h);
      if (p.x > 0 && p.x < w && p.y > 0 && p.y < h) {
        if (!inView) inView = { x: p.x, y: p.y, id: s.id };
        continue;
      }
      if (d < best) {
        best = d;
        edge = { id: s.id, who: s.who, x: p.x, y: p.y };
      }
    }
    seekAway = away;
    seekDot.hidden = !inView || !!focusV;
    if (inView) {
      // 还剩多久：每 1/16 重画一次
      const left = seekersOf(play)?.left?.(inView.id) ?? null;
      const lk = left === null ? 'x' : String(Math.round(left * 16));
      if (lk !== seekLeftKey) {
        seekLeftKey = lk;
        put(seekCv, seekBubble(left));
      }
    }
    if (inView)
      seekDot.style.transform = `translate(${Math.round(inView.x - seekDot.offsetWidth / 2)}px, ${Math.round(inView.y - seekDot.offsetHeight)}px)`;
    if (!edge) seekEdge.hide();
    else {
      const who = edge.who;
      seekEdge.show(
        edge.id,
        edge.x,
        edge.y,
        w,
        h,
        () => spriteCanvas(headSprite(who), `head-${who.name}-${who.shirt}`, false),
        `${who.name} · ${t('seeking')}`,
      );
    }
  }
  /** 这儿有活的泡（演出 / life 的 play.bubble，key 以这些开头）：大一号、实心、带尾巴、慢慢跳；画面外 = 屏幕边的指示 */
  const isJob = (key: string) => /^(chore:|machine:|luggage)/.test(key);
  const isSeek = (key: string) => key.startsWith('seek:');
  const JOB_MAX = 3;
  const jobsEl = document.createElement('div');
  jobsEl.className = 'pxh-moods pxh-jobs';
  root.appendChild(jobsEl);
  const jobEls: { el: HTMLDivElement; cv: HTMLCanvasElement; id: string }[] = [];
  for (let i = 0; i < JOB_MAX; i++) {
    const el = document.createElement('div');
    el.className = 'pxh-job';
    el.hidden = true;
    const cv = document.createElement('canvas');
    cv.className = 'pxh-px';
    cv.dataset.k = '1';
    el.appendChild(cv);
    jobsEl.appendChild(el);
    jobEls.push({ el, cv, id: '' });
  }

  // ── 上方一行字 + 弹出来的东西 ──
  const toastEl = document.createElement('div');
  toastEl.className = 'pxh-toast gone';
  root.appendChild(toastEl);
  let toastTimer = 0;
  function pop(text: string, ic: IconId | null = null, sec = 1.8, who: Who | null = null) {
    // 进账：不在画面中间弹大金币（钱是在干活的地方挣的，那里已经有一行 +$n）—— 金币右上那块下面浮一枚小金币 + 这行字
    if (ic === 'coin' && !who) {
      coinPop(text);
      return;
    }
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
  function place(name: string, sec = 1.6) {
    placeEl.replaceChildren(label(name));
    placeEl.style.setProperty('--dur', `${sec}s`);
    placeEl.classList.remove('show');
    void placeEl.offsetWidth;
    placeEl.classList.add('show');
  }

  // ── 开局的操作提示：一只手指在总监前面点两下地面（每下一圈波纹），不写字；只第一次开局出（localStorage 记住），
  //    碰一下画面就收。?hint=1 每次都出（截图），?hint=0 不出 ──
  const hintEl = document.createElement('div');
  hintEl.className = 'pxh-hint';
  hintEl.setAttribute('aria-label', t('hint'));
  hintEl.hidden = true;
  hintEl.append(view(ringCanvas(), 1, 'pxh-ripple'), view(fingerCanvas(), 1, 'pxh-finger'));
  root.appendChild(hintEl);
  const HINT_KEY = 'td.hint.finger';
  let hintSeen = false;
  try {
    hintSeen = localStorage.getItem(HINT_KEY) === '1';
  } catch {}
  const hintOn = params.get('hint') === '1' || (o.hint !== false && params.get('hint') !== '0' && !hintSeen);
  let hintUntil = 0;
  const hideHint = () => {
    hintEl.classList.add('gone');
    hintUntil = 0;
  };
  if (hintOn) {
    window.setTimeout(() => {
      hintEl.hidden = false;
      hintUntil = performance.now() + 4200;
      try {
        localStorage.setItem(HINT_KEY, '1');
      } catch {}
    }, 900);
    window.setTimeout(hideHint, 5100);
  }
  canvas.addEventListener('pointerdown', () => window.setTimeout(hideHint, 300));

  // ── 转场 ──
  const dirV = new THREE.Vector3();
  // 半屏卡躲开总监：他头顶在屏幕上的 y
  const headV = new THREE.Vector3();
  setSheetAvoid(() => {
    if (!root.isConnected || root.classList.contains('world-off')) return null;
    play.director.getWorldPosition(headV);
    headV.y += 1.9;
    return play.project(headV, canvas.clientWidth, canvas.clientHeight).y;
  });
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
    put(a.ring, plateCanvas(a === use ? PLATE_ACT : PLATE, !text));
    a.b.setAttribute('aria-label', text);
    a.id = text ? id : '';
    // 底板上的图标不加边
    if (text) put(a.ic, bare(id));
    a.ic.hidden = !text;
    const n = /(\d+\s*\/\s*\d+)/.exec(text)?.[1]?.replace(/\s/g, '');
    a.key.hidden = !n;
    if (n) put(a.key, keyCanvas(n));
    // 第四轮：活第一次出现也不亮名字（图标就是说明）；名字只在长按时
  };
  const hud: PixelHud = {
    root,
    iris,
    pop,
    gain,
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
      peekV = { ...p, until: now + (p.sec ?? 2) * 1000 };
      pop(p.line, null, p.sec ?? 2, p.who ?? { name: p.title, hair: INK, skin: CREAM, shirt: INK });
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
        if (m !== null) moneyTx.textContent = m.toLocaleString('en-US');
      }
      const ui = play.ui();
      // 动作键
      if (ui.use !== wasUse) {
        // 活换了：按钮上方还亮着旧活的名字就马上收掉（不多留一拍）
        if (wasUse && signText === wasUse) sign.classList.add('gone');
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
        put(use.ring, plateCanvas(PLATE_ACT, !ui.use, ui.usingNow ? 0xffffff : CREAM));
      }
      if (ui.pick !== wasPick) {
        wasPick = ui.pick;
        pickLabel = ui.pick;
        setAct(pick, pickLabel, pickIcon(pickLabel));
      }
      for (const b of fixRow.querySelectorAll<HTMLElement>('.pxh-fixed')) {
        const bd = o.buttons?.find((x) => x.id === b.dataset.id);
        b.classList.toggle('on', !!bd?.pressed?.());
        const dot = b.querySelector<HTMLElement>('.pxh-dot');
        if (dot) dot.hidden = !(bd?.dot?.() || (b.dataset.id === 'roster' && seekAway));
      }
      seekFrame(canvas.clientWidth, canvas.clientHeight);
      {
        // 总监走到右下三个按钮底下：按钮淡到一半，看得见他和他脚下的门（第四轮：南边的出口门在画面最下面）
        play.director.getWorldPosition(dirV);
        dirV.y += 0.9;
        const p = play.project(dirV, canvas.clientWidth, canvas.clientHeight);
        const r = dock.getBoundingClientRect();
        dock.classList.toggle('dim', p.x > r.left - 16 && p.y > r.top - 24);
      }
      if (hintUntil) {
        // 手指点在总监右下方 1.6 米的地面上（"点地面走过去"）
        // 落在右下按钮那块、或者太靠下：换到总监左下 / 左上 / 右上（第四轮第 3 轮：手指点在地图键上，读成"去点地图"）
        const r = dock.getBoundingClientRect();
        const W = canvas.clientWidth;
        const H = canvas.clientHeight;
        let p = { x: 0, y: 0 };
        for (const [ox, oz] of [
          [1.2, 1.4],
          [-1.2, 1.4],
          [-1.4, -1.2],
          [1.4, -1.2],
        ]) {
          play.director.getWorldPosition(dirV);
          dirV.x += ox;
          dirV.z += oz;
          p = play.project(dirV, W, H);
          if (p.y < r.top - 40 && p.y > 140 && p.x > 30 && p.x < W - 30) break;
        }
        hintEl.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px)`;
      }
      // 心情泡：分得出类的台词才出泡（"…"不出），画面里的、离总监近的最多 MOOD_MAX 个；点泡 = 那句话上方一行字
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      // 这儿有活：画面里的大泡（离总监近的先，最多 JOB_MAX 个），画面外离得最近的一个 = 屏幕边的指示
      {
        play.director.getWorldPosition(dirV);
        const inV: { p: { x: number; y: number }; d: number; id: MoodId }[] = [];
        let off: { p: { x: number; y: number }; d: number; id: MoodId; key: string } | null = null;
        for (const b of ui.bubbles) {
          if (!isJob(b.key) || isSeek(b.key)) continue;
          const wp = anchorAt(b.anchor, b.dy);
          if (!wp) continue;
          const d = Math.hypot(wp.x - dirV.x, wp.z - dirV.z);
          const p = play.project(wp, w, h);
          const mid = moodOf(b.text);
          const id: MoodId = mid === '…' ? '!' : mid;
          if (p.x > 8 && p.x < w - 8 && p.y > 24 && p.y < h - 8) inV.push({ p, d, id });
          else if (!off || d < off.d) off = { p, d, id, key: b.key };
        }
        inV.sort((a, b) => a.d - b.d);
        jobEls.forEach((je, i) => {
          const c = inV[i];
          je.el.hidden = !c;
          if (!c) return;
          if (je.id !== c.id) {
            je.id = c.id;
            put(je.cv, jobCanvas(c.id));
          }
          je.el.style.transform = `translate(${Math.round(c.p.x - (je.cv.width * S) / 2)}px, ${Math.round(c.p.y - je.cv.height * S)}px)`;
        });
        if (!off) jobEdge.hide();
        else {
          const mid = off.id;
          jobEdge.show(
            off.key,
            off.p.x,
            off.p.y,
            w,
            h,
            () => spriteCanvas(tame(MOODS[mid]), `job-${mid}`, false),
            mid,
            seekEdge.dir,
          );
        }
      }
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
          pop(me.text, null, 2, me.who);
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
        if (isJob(b.key) || isSeek(b.key) || moodOf(b.text) === '…' || read.has(`${b.key}|${b.text}`)) continue;
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
      // 点了的那个人（卡开着时让给草帽色的大箭头）
      const sp = peekV && !focusV ? anchorAt(peekV.anchor, (peekV.dy ?? 1.8) + 0.25) : null;
      selEl.hidden = !sp;
      if (sp) {
        const p = play.project(sp, w, h);
        selEl.style.transform = `translate(${Math.round(p.x - selEl.offsetWidth / 2)}px, ${Math.round(p.y - selEl.offsetHeight)}px)`;
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
        pop(ui.toast.text, ic === 'hand' ? null : ic);
      }
    },
  };
  (window as unknown as Record<string, unknown>).__hud = hud;
  if (params.has('hudsheet')) showSheet(params.get('hudsheet') ?? '1');
  return hud;
}

/**
 * ?hudsheet=1：所有图标编上号摆成一张（4 倍，奶油纸底），不带名字 —— 给"猜图标"的评判用（每个图标只有一个意思，第一次看能猜对七八成）。
 * ?hudsheet=clock：几个时刻的日钟摆在亮沙地 / 暗沥青 / 白车三种底上。对照表在 window.__hudsheet（编号 → 组 / id）。
 */
function showSheet(kind = '1') {
  const box = document.createElement('div');
  Object.assign(box.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '50',
    background: kind === 'clock' ? '#f2b869' : hex(CREAM),
    display: 'flex',
    flexWrap: 'wrap',
    alignContent: 'flex-start',
    gap: '6px 4px',
    padding: '8px',
    overflow: 'auto',
  });
  const add = (src: HTMLCanvasElement, k = 4, num = '', bg = '') => {
    const cell = document.createElement('div');
    Object.assign(cell.style, {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '2px',
      width: `${Math.max(56, src.width * k + 8)}px`,
      background: bg,
      padding: bg ? '6px' : '0',
    });
    const c = document.createElement('canvas');
    c.className = 'pxh-px';
    blit(c, src, k);
    c.style.imageRendering = 'pixelated';
    cell.appendChild(c);
    if (num) {
      const n = document.createElement('div');
      n.textContent = num;
      Object.assign(n.style, { font: '600 11px/1 system-ui, sans-serif', color: hex(INK) });
      cell.appendChild(n);
    }
    box.appendChild(cell);
  };
  if (kind === 'clock') {
    const base = { sky: { top: 0x58a8e6, horizon: 0xbfe2f2 } };
    for (const bg of ['#f2b869', '#4a4a6a', '#f4ead8'])
      for (const [hour, weather] of [
        [7.5, 'clear'],
        [12, 'clear'],
        [15, 'cloudy'],
        [18.1, 'clear'],
        [18.1, 'rain'],
        [22.5, 'clear'],
      ] as [number, Weather][]) {
        const { w, h, px } = drawClock({ hour, weather, look: dayLook(hour, weather, base) });
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        (c.getContext('2d') as CanvasRenderingContext2D).putImageData(new ImageData(px, w, h), 0, 0);
        add(c, 2, '', bg);
      }
    document.body.appendChild(box);
    return;
  }
  const key: Record<string, string> = {};
  let n = 0;
  const seen = new Set<Sprite>();
  // 同一个意思在两处、两种尺寸（右下按钮的大图 / 卡片和泡里的小字形）只摆一次：说话 = 聊几句、扳手 = 修、网球 = 球、金币 = 钱、脚印 = 走
  const SAME = ['act/chat', 'glyph/wrench', 'glyph/ball', 'glyph/coin', 'glyph/feet'];
  const group = (name: string, set: Record<string, Sprite>, skip: string[] = []) => {
    for (const id of Object.keys(set)) {
      // 别名（同一张图的两个 id）只摆一次
      if (skip.includes(id) || seen.has(set[id]) || SAME.includes(`${name}/${id}`)) continue;
      seen.add(set[id]);
      n++;
      key[n] = `${name}/${id}`;
      add(spriteCanvas(tame(set[id]), `sheet-${name}-${id}`), 4, String(n));
    }
  };
  group('hud', ICONS, ['dots', 'cal', 'arrow', 'focus']);
  group('act', ACT, ['close', 'up', 'down']);
  group('glyph', GLYPH, ['heartHalf', 'heartOff', '…']);
  group('place', PLACES);
  (window as unknown as Record<string, unknown>).__hudsheet = key;
  document.body.appendChild(box);
}

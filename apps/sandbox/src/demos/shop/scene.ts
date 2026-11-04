import {
  type BakedArt,
  bakeArt,
  daylightAt,
  flipArt,
  Group,
  ICON_ART,
  type IconName,
  type PeopleWorld,
  Person,
  type PixelArt,
  Sprite,
  setPeopleView,
  textArt,
} from '@td/iso';
import type { Rand } from '@td/shared';
import { goodBaked } from './art';
import { COUNTER, DIRECTOR_AT, type GoodId, ICE_AT, SLOTS } from './data';

/**
 * 店内画面（第二轮返工）：3/4 正俯视，铺满顶栏和拇指区之间。
 * 自己画一张低分辨率画布（宽 130 逻辑像素，每米 16 像素），整数倍放大、按 devicePixelRatio 出备份缓冲，
 * 最近邻、不平滑，所以手机上每个像素都是方的。
 * 人物用 @td/iso 的 Person（走路、动作队列、取帧、换色），只是不交给 IsoView 画：每帧取它当前的精灵帧，2 倍画在这里。
 * 商品、表情、字都是字符画（bakeArt / ICON_ART / textArt）。只画画面，不决定数值。
 */

export const LW = 130;
const PPM = 16;
/** 高度：1 米画多少像素（3/4 视角压扁） */
const HPX = 12;
/** 人物精灵放大倍数（逻辑像素） */
const PSC = 2;
const TOP_CSS = 56;
const DOCK_CSS = 256;

export type Hl = '' | 'cand' | 'ok' | 'bad' | 'sel';

export interface WindowState {
  minute: number;
  hot: number;
  wind: boolean;
  crowd: number;
  /** 大巴：0 不在，0..1 开进来，1 停着，>1 开走 */
  bus: number;
}

export interface Fx {
  dust(x: number, y: number, z: number, n?: number, col?: string): void;
  sparkle(x: number, y: number, z: number, n?: number, col?: string): void;
  confetti(x: number, y: number, z: number, n?: number, spread?: number): void;
  steam(x: number, y: number, z: number): void;
  puff(x: number, y: number, z: number): void;
  splash(x: number, y: number, z: number, n?: number): void;
}

export interface ShopScene {
  people: PeopleWorld;
  director: Person;
  fx: Fx;
  hl: Hl[];
  win: WindowState;
  /** 画布左上角（CSS）和放大倍数 */
  readonly box: { left: number; top: number; s: number };
  setGoods(i: number, goods: readonly GoodId[] | null, qty: number, lim: boolean): void;
  bounce(i: number): void;
  openDoor(): void;
  setIce(on: boolean): void;
  emote(p: Person, name: IconName, dur?: number): void;
  carry(p: Person, g: GoodId | null): void;
  /** 世界（米，y 是高度米）→ CSS 坐标 */
  proj(x: number, y: number, z: number): { x: number; y: number };
  tagCss(i: number): { x: number; y: number };
  slotCss(i: number): { x: number; y: number };
  headCss(p: Person): { x: number; y: number };
  update(dt: number, now: number, minute: number): void;
  render(): void;
}

/* ---------- 小工具 ---------- */
const cvCache = new WeakMap<BakedArt, HTMLCanvasElement>();
function bakedCanvas(b: BakedArt): HTMLCanvasElement {
  let c = cvCache.get(b);
  if (!c) {
    c = document.createElement('canvas');
    c.width = b.w;
    c.height = b.h;
    const g = c.getContext('2d') as CanvasRenderingContext2D;
    const img = g.createImageData(b.w, b.h);
    new Uint32Array(img.data.buffer).set(b.px);
    g.putImageData(img, 0, 0);
    cvCache.set(b, c);
  }
  return c;
}
const hash = (i: number, j: number, s = 0) => {
  let h = (Math.imul(i | 0, 374761393) + Math.imul(j | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

const PALM: PixelArt = {
  rows: [
    '..g...g..g..',
    '.ggg.ggg.gg.',
    'gg.gggggggg.',
    '...g2g2gg..g',
    '..gg.ww.gg..',
    '.g...ww...g.',
    '.....ww.....',
    '.....ww.....',
    '...cccccc...',
    '...c3333c...',
    '...cccccc...',
    '....cccc....',
  ],
  ox: 6,
  oy: 11,
  pal: { g: '#3c7d3a', 2: '#4f8a4b', w: '#8a6a45', c: '#c8643c', 3: '#a8453a' },
};
const CACTUS: PixelArt = {
  rows: ['...gg...', 'g..gg...', 'g..gg..g', 'gggggggg', '...gg...', '...gg...', '..cccc..', '..c33c..', '..cccc..'],
  ox: 4,
  oy: 8,
  pal: { g: '#4f8a4b', c: '#c8643c', 3: '#a8453a' },
};
const ICE: PixelArt = {
  rows: ['.oooooooo.', 'owwiwwiwwo', 'oiwwwiwwio', 'obbbbbbbbo', 'ob2bbbb2bo', 'obbbbbbbbo', '.oooooooo.'],
  ox: 5,
  oy: 6,
  pal: { o: '#2a2238', w: '#e8fbff', i: '#bfe6f2', b: '#4fc3d9', 2: '#2f9fc0' },
};

export function createShopScene(stage: HTMLElement, rand: Rand): ShopScene {
  /* ---- 画布：低分辨率 → 整数倍放大 ---- */
  const lo = document.createElement('canvas');
  const g = lo.getContext('2d') as CanvasRenderingContext2D;
  const bgC = document.createElement('canvas');
  const bg = bgC.getContext('2d') as CanvasRenderingContext2D;
  const ntC = document.createElement('canvas');
  const nt = ntC.getContext('2d') as CanvasRenderingContext2D;
  const cv = document.createElement('canvas');
  cv.className = 'shop-cv';
  const out = cv.getContext('2d') as CanvasRenderingContext2D;
  stage.appendChild(cv);
  const box = { left: 0, top: TOP_CSS, s: 3 };
  let H = 177;
  let WB = 41;
  let N = 3;
  const X = (x: number) => Math.round(1 + (x + 4) * PPM);
  const Y = (z: number) => Math.round(WB + (z + 4) * PPM);

  function layout(): void {
    const pw = stage.clientWidth || 390;
    const ph = stage.clientHeight || 844;
    box.s = Math.max(1, Math.floor(pw / LW));
    const avail = ph - TOP_CSS - DOCK_CSS;
    H = Math.max(150, Math.floor(avail / box.s));
    WB = H - 128 - 8;
    box.left = Math.floor((pw - LW * box.s) / 2);
    box.top = TOP_CSS;
    N = box.s * Math.max(1, Math.round(window.devicePixelRatio || 1));
    for (const c of [lo, bgC, ntC]) {
      c.width = LW;
      c.height = H;
    }
    cv.width = LW * N;
    cv.height = H * N;
    Object.assign(cv.style, {
      position: 'absolute',
      left: `${box.left}px`,
      top: `${box.top}px`,
      width: `${LW * box.s}px`,
      height: `${H * box.s}px`,
      imageRendering: 'pixelated',
    });
    paintBg();
  }

  const rect = (c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, col: string) => {
    c.fillStyle = col;
    c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  };
  const blit = (c: CanvasRenderingContext2D, b: BakedArt, ax: number, ay: number, flip = false, sc = 1) => {
    const f = flip ? flipArt(b) : b;
    const ox = flip ? b.w - b.ox : b.ox;
    c.drawImage(bakedCanvas(f), Math.round(ax - ox * sc), Math.round(ay - b.oy * sc), b.w * sc, b.h * sc);
  };

  /* ---- 静态底：墙、地板、地毯 ---- */
  const win = { x0: 0, x1: 0, y0: 4, y1: 0 };
  const door = { x0: 0, x1: 0, y0: 0, y1: 0 };
  function paintBg(): void {
    const c = bg;
    c.clearRect(0, 0, LW, H);
    // 北墙
    rect(c, 0, 0, LW, WB, '#f4e7d1');
    for (let x = 0; x < LW; x += 8) rect(c, x, 2, 1, WB - 14, '#ecdcc2');
    rect(c, 0, 0, LW, 2, '#d8c3a0');
    rect(c, 0, WB - 12, LW, 12, '#8a6a45');
    for (let x = 0; x < LW; x += 6) rect(c, x, WB - 11, 1, 11, '#7a5c3a');
    rect(c, 0, WB - 13, LW, 2, '#d8c08a');
    rect(c, 0, WB - 1, LW, 1, '#5a3d2b');
    // 地板：横木条
    for (let y = WB; y < WB + 128; y += 5) {
      const row = (y - WB) / 5;
      let x = 1 - Math.floor(hash(row, 1) * 20);
      let k = 0;
      while (x < LW) {
        const len = 16 + Math.floor(hash(row, k, 3) * 22);
        const col = hash(row, k, 5) < 0.5 ? '#b07a4a' : '#a87246';
        rect(c, x, y, len, 5, col);
        rect(c, x, y + 4, len, 1, '#94603a');
        rect(c, x + len - 1, y, 1, 5, '#8a5a35');
        if (hash(row, k, 7) < 0.35) rect(c, x + 4 + Math.floor(hash(row, k, 9) * (len - 8)), y + 2, 1, 1, '#7a4e2e');
        x += len;
        k++;
      }
    }
    // 门口红毯
    const rx0 = X(-0.25);
    const rx1 = X(0.92);
    rect(c, rx0, WB, rx1 - rx0, 26, '#d8c08a');
    rect(c, rx0 + 1, WB, rx1 - rx0 - 2, 25, '#a8453a');
    for (let y = WB + 3; y < WB + 24; y += 4) rect(c, rx0 + 3, y, rx1 - rx0 - 6, 1, '#963c33');
    // 黄金位前的金线
    for (const s of SLOTS)
      if (s.gold) for (let x = X(s.x0); x < X(s.x1); x += 3) rect(c, x, Y(s.z1) + 3, 2, 1, '#f2b134');
    // 中岛下的绿地毯
    rect(c, X(-1.6), Y(-0.15), X(1.6) - X(-1.6), Y(1.0) - Y(-0.15), '#2f7a49');
    rect(c, X(-1.6) + 1, Y(-0.15) + 1, X(1.6) - X(-1.6) - 2, Y(1.0) - Y(-0.15) - 2, '#3a8a55');
    // 侧墙（只露出墙顶）
    rect(c, 0, WB - 13, 2, 128 + 13, '#d8c3a0');
    rect(c, LW - 2, WB - 13, 2, 128 + 13, '#d8c3a0');
    rect(c, 2, WB, 1, 128, '#6a4628');
    rect(c, LW - 3, WB, 1, 128, '#c08a55');
    // 前墙：墙顶 + 一截墙面
    const fy = WB + 128;
    rect(c, 0, fy, LW, 2, '#d8c3a0');
    rect(c, 0, fy + 2, LW, H - fy - 2, '#b89a74');
    for (let x = 4; x < LW; x += 8) rect(c, x, fy + 3, 1, H - fy - 3, '#a88a64');
    // 窗框（柜台上方）
    win.x0 = X(-3.8);
    win.x1 = X(-2.3);
    win.y0 = 4;
    win.y1 = WB - 16;
    rect(c, win.x0 - 2, win.y0 - 2, win.x1 - win.x0 + 4, win.y1 - win.y0 + 4, '#5a3d2b');
    rect(c, win.x0 - 3, win.y1 + 1, win.x1 - win.x0 + 6, 2, '#f3ecdc');
    // 门框
    door.x0 = X(-0.25);
    door.x1 = X(0.92);
    door.y0 = WB - 30;
    door.y1 = WB;
    rect(c, door.x0 - 2, door.y0 - 2, door.x1 - door.x0 + 4, door.y1 - door.y0 + 2, '#5a3d2b');
    // 招牌
    const sign = textArt('PRO SHOP', { font: '3x5', color: '#d8c08a', outline: '' });
    if (sign) {
      const b = bakeArt(sign);
      const sx = Math.round((door.x0 + door.x1) / 2 - b.w / 2);
      rect(c, sx - 2, door.y0 - 11, b.w + 4, b.h + 4, '#14223a');
      c.drawImage(bakedCanvas(b), sx, door.y0 - 9);
    }
    // 墙上的海报（冰柜和门口货架之间的墙上留不出地方，挂在窗右边）
    rect(c, X(-2.0), 4, 18, 9, '#3f6fb0');
    rect(c, X(-2.0) + 2, 6, 14, 2, '#f2b134');
    rect(c, X(-2.0) + 2, 9, 9, 1, '#f4f1e8');
  }

  /* ---- 人 ---- */
  const scene = new Group();
  const people: PeopleWorld = { scene, groundY: () => 0, people: [] };
  setPeopleView(0, 7.78, 1);
  const director = new Person(
    {
      name: 'director',
      x: DIRECTOR_AT.x,
      z: DIRECTOR_AT.z,
      shirt: '#1f3a5a',
      trim: '#d8c08a',
      shorts: '#c9b48a',
      skin: '#e8b896',
      hair: '#3a2a22',
      hairStyle: 'short',
      shoes: '#5a4a3a',
      base: 'relaxed',
    },
    people,
  );
  director.idleFace = 0;
  const heads = new Map<Person, { x: number; y: number }>();
  const carried = new Map<Person, GoodId>();

  /* ---- 货 ---- */
  const goods: { g: readonly GoodId[] | null; qty: number; lim: boolean }[] = SLOTS.map(() => ({
    g: null,
    qty: 0,
    lim: false,
  }));
  const bounceT = SLOTS.map(() => -9);
  const hl: Hl[] = SLOTS.map(() => '');
  const winS: WindowState = { minute: 480, hot: 0.3, wind: false, crowd: 0, bus: 0 };
  let doorT = 0;
  let doorO = 0;
  let iceOn = false;
  let now = 0;
  let light = daylightAt(480);

  /* ---- 粒子（逻辑像素） ---- */
  interface P {
    x: number;
    y: number;
    vx: number;
    vy: number;
    g: number;
    l: number;
    col: string;
    s: number;
  }
  const parts: P[] = [];
  const at = (x: number, y: number, z: number) => ({ x: X(x), y: Y(z) - y * HPX });
  const emit = (
    x: number,
    y: number,
    z: number,
    n: number,
    cols: readonly string[],
    sp: number,
    gg: number,
    l: number,
  ) => {
    const p0 = at(x, y, z);
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2;
      const v = sp * (0.4 + rand() * 0.8);
      parts.push({
        x: p0.x + (rand() - 0.5) * 4,
        y: p0.y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - sp * 0.5,
        g: gg,
        l: l * (0.6 + rand() * 0.6),
        col: cols[i % cols.length] as string,
        s: rand() < 0.3 ? 2 : 1,
      });
    }
  };
  const fx: Fx = {
    dust: (x, y, z, n = 6, col = '#c9a36a') => emit(x, y, z, n, [col, '#e8c88a'], 18, 30, 0.5),
    sparkle: (x, y, z, n = 8, col = '#ffd84a') => emit(x, y, z, n, [col, '#fff6c0'], 26, 10, 0.6),
    confetti: (x, y, z, n = 30) =>
      emit(x, y, z, n, ['#ff5a6a', '#ffd84a', '#5fd1ff', '#8af08a', '#ffffff'], 55, 70, 1.3),
    steam: (x, y, z) => emit(x, y, z, 4, ['#f4f1e8', '#d8d4cc'], 8, -25, 0.8),
    puff: (x, y, z) => emit(x, y, z, 6, ['#e8c88a', '#f4f1e8'], 14, -4, 0.5),
    splash: (x, y, z, n = 12) => emit(x, y, z, n, ['#5fc3e4', '#e8fbff'], 30, 70, 0.7),
  };

  /* ---- 表情 ---- */
  const emos: { p: Person; b: BakedArt; age: number; dur: number }[] = [];

  /* ---- 画：可排序的东西 ---- */
  type D = { z: number; draw: () => void };

  function shelfBox(i: number) {
    const s = SLOTS[i]!;
    const x0 = X(s.x0);
    const x1 = X(s.x1);
    const base = Y(s.z1);
    const td = Math.max(5, Math.round((s.z1 - s.z0) * PPM));
    return { x0, x1, base, top: base - s.fh - td, td };
  }
  function drawShelf(i: number): void {
    const s = SLOTS[i]!;
    const { x0, x1, base, td } = shelfBox(i);
    const w = x1 - x0;
    const fh = s.fh;
    const ft = base - fh;
    // 影子
    rect(g, x0 + 1, base, w, 2, 'rgba(40,20,10,.25)');
    if (s.cooler) {
      rect(g, x0, ft - td, w, td, '#f3f7f8');
      rect(g, x0, ft - td, w, 1, '#ffffff');
      rect(g, x0, ft, w, fh, '#d8e0e4');
      rect(g, x0 + 2, ft + 5, w - 4, fh - 9, '#bfe6f2');
      rect(g, x0 + 3, ft + 1, w - 6, 3, '#4fc3d9');
      rect(g, x0, base - 3, w, 3, '#3a3f4a');
      for (const y of [ft + 17, ft + 29]) rect(g, x0 + 2, y, w - 4, 1, '#8c9298');
    } else {
      const wood = s.island ? '#c08a55' : '#a87246';
      rect(g, x0, ft - td, w, td, s.island ? '#d29a62' : '#c08a55');
      rect(g, x0, ft - td, w, 1, '#e0b07a');
      rect(g, x0, ft, w, fh, wood);
      rect(g, x0 + 2, ft + 2, w - 4, fh - 5, '#5a3d2b');
      rect(g, x0 + 2, ft + 15, w - 4, 2, wood);
      rect(g, x0, base - 3, w, 3, '#6a4628');
      if (s.gold) {
        rect(g, x0, ft - td, w, 1, '#f2b134');
        rect(g, x0, ft, w, 1, '#f2b134');
      }
    }
    // 货
    const st = goods[i]!;
    if (st.g && st.qty > 0) {
      const arts = st.g.map((gg) => goodBaked(gg));
      const iw = Math.max(...arts.map((a) => a.w));
      const rows = s.cooler ? [ft + 16, ft + 28, base - 3] : [ft + 15, base - 3];
      const per = Math.max(1, Math.floor((w - 4 + 1) / (iw + 1)));
      const cap = per * rows.length;
      const show = Math.min(st.qty, cap);
      const a = now - (bounceT[i] as number);
      const up = a >= 0 && a < 0.35 ? Math.round(Math.sin((a / 0.35) * Math.PI) * 3 * (1 - a / 0.35)) : 0;
      for (let k = 0; k < show; k++) {
        const r = Math.floor(k / per);
        const c = k % per;
        const inRow = Math.min(per, show - r * per);
        const span = inRow * (iw + 1) - 1;
        const cx = Math.round(x0 + (w - span) / 2 + c * (iw + 1) + iw / 2);
        const b = arts[k % arts.length] as BakedArt;
        blit(g, b, cx, (rows[r] as number) - up);
      }
      if (st.g.length > 1) rect(g, x0, ft + Math.round(fh / 2) - 1, w, 2, '#d94a3a');
      if (st.lim) {
        rect(g, x1 - 8, ft - td - 5, 8, 6, '#d94a3a');
        rect(g, x1 - 5, ft - td - 4, 2, 2, '#ffffff');
        rect(g, x1 - 5, ft - td - 1, 2, 1, '#ffffff');
      }
    }
  }
  function drawCounter(): void {
    const x0 = X(COUNTER.x0);
    const x1 = X(COUNTER.x1);
    const base = Y(COUNTER.z1);
    const td = Math.round((COUNTER.z1 - COUNTER.z0) * PPM);
    const fh = 14;
    rect(g, x0 + 1, base, x1 - x0, 2, 'rgba(40,20,10,.25)');
    rect(g, x0, base - fh - td, x1 - x0, td, '#a87246');
    rect(g, x0, base - fh - td, x1 - x0, 1, '#c08a55');
    rect(g, x0, base - fh, x1 - x0, fh, '#8a5a35');
    rect(g, x0, base - fh + 4, x1 - x0, 1, '#d8c08a');
    for (let x = x0 + 3; x < x1; x += 6) rect(g, x, base - fh + 6, 1, fh - 7, '#6a4628');
    // 收银机、小票
    const rx = x1 - 10;
    const ry = base - fh - td + 1;
    rect(g, rx, ry - 6, 8, 7, '#3a3f4a');
    rect(g, rx + 1, ry - 5, 6, 2, '#7be08f');
    rect(g, x0 + 3, ry - 2, 5, 3, '#f3ecdc');
  }
  function drawPerson(p: Person): void {
    const b = p.sprite.frame;
    const fp = p.frame;
    if (!b || !fp?.art) return;
    const ax = X(p.pos.x);
    const lift = Math.round((p.root.position.y + p.body.position.y) * 14);
    const ay = Y(p.pos.z) - lift;
    // 影子
    g.fillStyle = 'rgba(40,20,10,.28)';
    g.fillRect(ax - 5, Y(p.pos.z) - 1, 10, 2);
    g.fillRect(ax - 4, Y(p.pos.z) + 1, 8, 1);
    blit(g, b, ax, ay, p.sprite.flipX, PSC);
    const art = fp.art;
    const sgn = fp.flip ? -1 : 1;
    const ht = art.pts?.head_top ?? [art.ox, art.oy - art.rows.length];
    const hx = ax + (ht[0] - art.ox) * sgn * PSC;
    const hy = ay + (ht[1] - art.oy) * PSC;
    for (const c of p.body.children)
      if (c instanceof Sprite && c !== p.sprite && c.visible && c.frame) blit(g, c.frame, hx, hy, c.flipX, PSC);
    heads.set(p, { x: hx, y: hy });
    const cg = carried.get(p);
    if (cg) blit(g, goodBaked(cg), ax + 8 * sgn, ay - 6);
  }
  function drawWindow(): void {
    const { x0, x1, y0, y1 } = win;
    const w = x1 - x0;
    const h = y1 - y0;
    const L = light;
    rect(g, x0, y0, w, Math.ceil(h * 0.4), L.sky[0]);
    rect(g, x0, y0 + Math.ceil(h * 0.4), w, h - Math.ceil(h * 0.4), L.sky[1]);
    rect(g, x0, y1 - 9, w, 3, L.sky[2]);
    if (winS.hot > 0.7) {
      g.fillStyle = 'rgba(255,190,110,.35)';
      g.fillRect(x0, y0, w, h);
    }
    // 太阳 / 月亮
    const sp = (winS.minute - 420) / 840;
    if (sp > 0 && sp < 1) {
      const sx = Math.round(x1 - 4 - sp * (w - 8));
      const sy = Math.round(y1 - 9 - Math.sin(sp * Math.PI) * (h - 13));
      rect(g, sx - 1, sy - 2, 3, 5, L.disc[0]);
      rect(g, sx - 2, sy - 1, 5, 3, L.disc[0]);
    }
    for (let i = 0; i < w; i++) {
      const m = Math.round(3 + 2 * Math.sin(i * 0.35) + 1.5 * Math.sin(i * 0.9 + 1));
      rect(g, x0 + i, y1 - 6 - m, 1, m, L.mtn[1]);
    }
    rect(g, x0, y1 - 6, w, 6, L.plain[0]);
    // 棕榈
    rect(g, x1 - 6, y1 - 14, 1, 9, '#5a3d2b');
    rect(g, x1 - 9, y1 - 15, 7, 1, '#3c7d3a');
    rect(g, x1 - 8, y1 - 16, 2, 1, '#3c7d3a');
    rect(g, x1 - 5, y1 - 16, 2, 1, '#3c7d3a');
    const t = now;
    if (winS.hot > 0.75)
      for (let i = 0; i < 3; i++)
        rect(g, x0 + ((i * 9 + Math.floor(t * 8)) % w), y1 - 7 + (Math.floor(t * 6 + i) % 2), 6, 1, '#ffe0a0');
    if (winS.wind) {
      for (let i = 0; i < 4; i++) {
        const xx = x0 + ((Math.floor(t * 40) + i * 7) % (w + 10)) - 8;
        if (xx >= x0 && xx + 6 <= x1) rect(g, xx, y0 + 3 + i * 3, 6, 1, '#f3ecdc');
      }
      const tx = x0 + (Math.floor(t * 14) % w);
      const hop = Math.round(Math.abs(Math.sin(t * 6)) * 2);
      if (tx + 3 <= x1) rect(g, tx, y1 - 4 - hop, 3, 3, '#a87a3a');
    }
    if (winS.crowd > 0.25) {
      const n = Math.round(winS.crowd * 8);
      const cols = ['#3f6fb0', '#d94a3a', '#f2b134', '#3fae5a'];
      for (let i = 0; i < n; i++) {
        const xx = x0 + 1 + ((i * 5) % (w - 2));
        const bob = Math.floor(t * 7 + i) % 2;
        rect(g, xx, y1 - 3 - bob, 2, 3, cols[i % 4] as string);
        rect(g, xx, y1 - 4 - bob, 2, 1, '#e8b896');
      }
    }
    if (winS.bus > 0) {
      const b = winS.bus;
      const bx = Math.round(b <= 1 ? x0 - 18 + b * (w * 0.5 + 9) : x0 + w * 0.5 - 9 + (b - 1) * (w + 18));
      const by = y1 - 9;
      g.save();
      g.beginPath();
      g.rect(x0, y0, w, h);
      g.clip();
      rect(g, bx, by, 18, 7, '#f2b134');
      rect(g, bx, by + 5, 18, 1, '#a8453a');
      for (let i = 0; i < 4; i++) rect(g, bx + 2 + i * 4, by + 1, 3, 2, '#bfe6f2');
      rect(g, bx + 2, by + 7, 3, 2, '#2a2238');
      rect(g, bx + 13, by + 7, 3, 2, '#2a2238');
      g.restore();
    }
    rect(g, Math.round((x0 + x1) / 2), y0, 1, h, '#5a3d2b');
  }
  function drawDoor(): void {
    const { x0, x1, y0, y1 } = door;
    const w = x1 - x0;
    const h = y1 - y0;
    rect(g, x0, y0, w, h - 9, light.sky[1]);
    rect(g, x0, y1 - 9, w, 9, light.plain[0]);
    rect(g, x0, y1 - 10, w, 1, light.mtn[1]);
    // 门扇：开的时候往里转（看上去变窄）
    const lw = Math.max(2, Math.round(w * (1 - doorO * 0.85)));
    rect(g, x0, y0, lw, h, '#3f6b55');
    rect(g, x0, y0, lw, 1, '#2f5a45');
    if (lw > 8) {
      rect(g, x0 + 3, y0 + 4, lw - 6, 9, '#bfe6f2');
      rect(g, x0 + lw - 4, y0 + 16, 2, 2, '#d8c08a');
    }
    rect(g, x0 + lw - 1, y0, 1, h, '#2a4a3a');
  }

  function render(): void {
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, LW, H);
    g.drawImage(bgC, 0, 0);
    drawWindow();
    drawDoor();
    const list: D[] = [];
    SLOTS.forEach((s, i) => {
      list.push({ z: s.z1, draw: () => drawShelf(i) });
    });
    list.push({ z: COUNTER.z1, draw: drawCounter });
    for (const p of people.people) list.push({ z: p.pos.z, draw: () => drawPerson(p) });
    if (iceOn) list.push({ z: ICE_AT.z, draw: () => blit(g, bakeArt(ICE), X(ICE_AT.x), Y(ICE_AT.z)) });
    list.push({ z: 3.7, draw: () => blit(g, bakeArt(PALM), X(3.45), Y(3.55)) });
    list.push({ z: 3.7, draw: () => blit(g, bakeArt(CACTUS), X(-3.5), Y(3.55)) });
    list.sort((a, b) => a.z - b.z);
    for (const d of list) d.draw();
    // 高亮
    SLOTS.forEach((_, i) => {
      const h = hl[i];
      if (!h) return;
      if (h === 'cand' && Math.floor(now * 4) % 2) return;
      const { x0, x1, base, top } = shelfBox(i);
      const col = h === 'ok' ? '#ffd84a' : h === 'bad' ? '#ff8a6b' : h === 'sel' ? '#d8c08a' : '#f3ecdc';
      const l = x0 - 2;
      const t = top - 2;
      const w = x1 - x0 + 4;
      const hh = base - top + 4;
      if (h === 'cand') {
        for (let x = l; x < l + w; x += 3) {
          rect(g, x, t, 2, 1, col);
          rect(g, x, t + hh - 1, 2, 1, col);
        }
        for (let y = t; y < t + hh; y += 3) {
          rect(g, l, y, 1, 2, col);
          rect(g, l + w - 1, y, 1, 2, col);
        }
      } else {
        g.strokeStyle = col;
        g.lineWidth = 1;
        g.strokeRect(l + 0.5, t + 0.5, w - 1, hh - 1);
        if (h !== 'sel') g.strokeRect(l - 0.5, t - 0.5, w + 1, hh + 1);
      }
    });
    // 粒子
    for (const p of parts) rect(g, p.x, p.y, p.s, p.s, p.col);
    // 表情
    for (const e of emos) {
      if (e.age > e.dur - 0.3 && Math.floor((e.dur - e.age) / 0.06) % 2) continue;
      const hp = heads.get(e.p);
      if (!hp) continue;
      const pop = e.age < 0.2 ? Math.round(Math.sin((e.age / 0.2) * Math.PI) * 3) : 0;
      blit(g, e.b, hp.x, hp.y - 3 - pop - Math.round(Math.min(1, e.age / 0.5) * 2));
    }
    // 夜色：压暗，灯下留亮
    const night = light.night;
    if (night > 0.05) {
      nt.globalCompositeOperation = 'source-over';
      nt.clearRect(0, 0, LW, H);
      nt.fillStyle = `rgba(28,22,64,${(night * 0.55).toFixed(3)})`;
      nt.fillRect(0, 0, LW, H);
      nt.globalCompositeOperation = 'destination-out';
      for (const [cx, cy] of [
        [X(-1.5), Y(-1.5)],
        [X(1.5), Y(1.5)],
      ] as const)
        for (const [r, a] of [
          [40, 0.25],
          [28, 0.35],
          [16, 0.45],
        ] as const) {
          nt.fillStyle = `rgba(0,0,0,${a * light.lamps})`;
          for (let y = -r; y <= r; y++) {
            const half = Math.round(Math.sqrt(r * r - y * y) * 1.1);
            nt.fillRect(cx - half, cy + Math.round(y * 0.7), half * 2, 1);
          }
        }
      g.drawImage(ntC, 0, 0);
    }
    out.imageSmoothingEnabled = false;
    out.clearRect(0, 0, cv.width, cv.height);
    out.drawImage(lo, 0, 0, LW * N, H * N);
  }

  layout();
  window.addEventListener('resize', layout);

  const css = (px: number, py: number) => ({ x: box.left + px * box.s, y: box.top + py * box.s });
  return {
    people,
    director,
    fx,
    hl,
    win: winS,
    box,
    setGoods(i, gs, qty, lim) {
      goods[i] = { g: gs ? [...gs] : null, qty, lim };
    },
    bounce(i) {
      bounceT[i] = now;
    },
    openDoor() {
      doorT = 1.0;
    },
    setIce(on) {
      iceOn = on;
    },
    emote(p, name, dur = 1.4) {
      for (const e of emos) if (e.p === p) e.age = e.dur;
      emos.push({ p, b: bakeArt(ICON_ART[name]), age: 0, dur });
    },
    carry(p, gg) {
      if (gg) carried.set(p, gg);
      else carried.delete(p);
    },
    proj(x, y, z) {
      return css(X(x), Y(z) - y * HPX);
    },
    tagCss(i) {
      const b = shelfBox(i);
      return css((b.x0 + b.x1) / 2, b.top + b.td / 2);
    },
    slotCss(i) {
      const b = shelfBox(i);
      return css((b.x0 + b.x1) / 2, (b.top + b.base) / 2);
    },
    headCss(p) {
      const h = heads.get(p);
      return h ? css(h.x, h.y) : css(X(p.pos.x), Y(p.pos.z) - 30);
    },
    update(dt, t, minute) {
      now = t;
      winS.minute = minute;
      light = daylightAt(minute);
      doorT = Math.max(0, doorT - dt);
      doorO += ((doorT > 0 ? 1 : 0) - doorO) * Math.min(1, dt * 10);
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i] as P;
        p.vy += p.g * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.l -= dt;
        if (p.l <= 0) parts.splice(i, 1);
      }
      for (let i = emos.length - 1; i >= 0; i--) {
        const e = emos[i]!;
        e.age += dt;
        if (e.age >= e.dur || e.p.removed) emos.splice(i, 1);
      }
      for (const p of [...heads.keys()]) if (p.removed) heads.delete(p);
    },
    render,
  };
}

import type { XYZ } from '@td/shared';
import { textArt } from '../art/font';
import { applyMat, type BakedArt, Box, Custom, type DrawContext, Group, type Mat, type Node, V3 } from '../core/graph';
import { HV, K1 } from '../core/proj';
import { type IconName, INK, iconArt, packHex } from './icons';

/**
 * 场景里的漫画字和表情：飘字（"好球!"）、对话气泡、举牌、头顶表情、眩晕星星、闪光。
 * 像素版：都是拼好的像素图（BakedArt），挂成排在最前面的 Custom 节点，跟着目标节点的世界位置走。
 * 字优先用 art/font 的像素字；像素字里没有的字（中文）在浏览器里用画布写小字再二值化成像素，node 里退化成方块。
 */

/** 画布兜底写字用的字体（中文落到系统黑体） */
export const SPRITE_FONT = "'Noto Sans SC','PingFang SC','Microsoft YaHei',sans-serif";

/** 一张漫画字 / 图标的像素图（旧版的贴图 + 宽高比） */
export interface SpriteTex {
  art: BakedArt;
  aspect: number;
}

export interface TextTexOptions {
  fg?: string;
  stroke?: string;
  /** 对话气泡（白底黑框带尖角） */
  bubble?: boolean;
  /** 举牌（方卡片） */
  card?: boolean;
  bg?: string;
}

/** 字的二值图：1 = 有墨 */
interface Mask {
  w: number;
  h: number;
  m: Uint8Array;
}

const maskCache = new Map<string, Mask>();

/** 画布兜底：写 11px 的字，按 alpha 阈值转成像素。node 里没有画布就画成一排方块。 */
function canvasMask(text: string, keepRows = false): Mask {
  const size = 11;
  type Ctx = {
    font: string;
    textBaseline: string;
    fillStyle: string;
    measureText(t: string): { width: number };
    fillText(t: string, x: number, y: number): void;
    getImageData(x: number, y: number, w: number, h: number): { data: Uint8ClampedArray };
  };
  let mk: ((w: number, h: number) => Ctx | null) | null = null;
  const g = globalThis as unknown as {
    OffscreenCanvas?: new (w: number, h: number) => { getContext(k: '2d'): Ctx | null };
    document?: { createElement(t: 'canvas'): { width: number; height: number; getContext(k: '2d'): Ctx | null } };
  };
  if (g.OffscreenCanvas) {
    const OC = g.OffscreenCanvas;
    mk = (w, h) => new OC(w, h).getContext('2d');
  } else if (g.document) {
    const d = g.document;
    mk = (w, h) => {
      const c = d.createElement('canvas');
      c.width = w;
      c.height = h;
      return c.getContext('2d');
    };
  }
  const probe = mk?.(4, 4);
  if (!mk || !probe) {
    // 没有画布：每个字一个 4×6 的方块
    const w = Math.max(1, text.length * 5 - 1);
    const m = new Uint8Array(w * 6);
    for (let i = 0; i < text.length; i++)
      if (text[i] !== ' ') for (let y = 0; y < 6; y++) for (let x = 0; x < 4; x++) m[y * w + i * 5 + x] = 1;
    return { w, h: 6, m };
  }
  const font = `700 ${size}px ${SPRITE_FONT}`;
  probe.font = font;
  const w = Math.max(1, Math.ceil(probe.measureText(text).width) + 2);
  const h = size + 4;
  const c = mk(w, h) as Ctx;
  c.font = font;
  c.textBaseline = 'middle';
  c.fillStyle = '#000';
  c.fillText(text, 1, h / 2 + 0.5);
  const d = c.getImageData(0, 0, w, h).data;
  const m = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) m[i] = (d[i * 4 + 3] as number) > 110 ? 1 : 0;
  return trim({ w, h, m }, keepRows);
}

/** 裁掉四周空行空列（keepRows 时只裁左右，留住字框的上下，混排时好对齐） */
function trim(k: Mask, keepRows = false): Mask {
  let x0 = k.w;
  let x1 = -1;
  let y0 = k.h;
  let y1 = -1;
  for (let y = 0; y < k.h; y++)
    for (let x = 0; x < k.w; x++)
      if (k.m[y * k.w + x]) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) return { w: 1, h: 1, m: new Uint8Array(1) };
  if (keepRows) {
    y0 = 0;
    y1 = k.h - 1;
  }
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const m = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) m[y * w + x] = k.m[(y + y0) * k.w + x + x0] as number;
  return { w, h, m };
}

/** 像素字排一段字的二值图（不描边）；有字体里没有的字返回 null */
function fontMask(text: string): Mask | null {
  const a = textArt(text, { outline: '' });
  if (!a) return null;
  const h = a.rows.length;
  const w = Math.max(1, ...a.rows.map((r) => r.length));
  const m = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) m[y * w + x] = (a.rows[y]?.[x] ?? '.') !== '.' ? 1 : 0;
  return { w, h, m };
}

/**
 * 中文夹着像素字里有的字（"二!"、"3 人"）：中文段走画布，其余段走像素字，像素字竖直居中对齐中文字框。
 * 整段都交给画布时，小号的 "!" "?" 和数字会糊成一团。
 */
function mixedMask(text: string): Mask {
  const runs: { s: string; px: boolean }[] = [];
  for (const ch of text) {
    const px = ch === ' ' || !!textArt(ch, { outline: '' });
    const last = runs[runs.length - 1];
    if (last && last.px === px) last.s += ch;
    else runs.push({ s: ch, px });
  }
  if (!runs.some((r) => r.px && r.s.trim())) return canvasMask(text);
  const parts = runs.map((r) => {
    if (r.px) return r.s.trim() ? fontMask(r.s) : null;
    return canvasMask(r.s, true);
  });
  const H = Math.max(...parts.map((k) => (k && k.h > 9 ? k.h : 0)), 9);
  const W = parts.reduce((s, k) => s + (k ? k.w + 1 : 3), -1);
  const m = new Uint8Array(Math.max(1, W) * H);
  let x0 = 0;
  for (const k of parts) {
    if (!k) {
      x0 += 3;
      continue;
    }
    // 像素字（7 行）放在字框正中，中文字框原样
    const y0 = k.h >= H ? 0 : Math.round((H - 7) / 2);
    for (let y = 0; y < k.h; y++)
      for (let x = 0; x < k.w; x++) if (k.m[y * k.w + x] && y + y0 < H) m[(y + y0) * W + x0 + x] = 1;
    x0 += k.w + 1;
  }
  return trim({ w: Math.max(1, W), h: H, m });
}

/** 字 → 二值图：像素字优先，有中文时中文走画布、其余仍用像素字。 */
export function textMask(text: string): Mask {
  const hit = maskCache.get(text);
  if (hit) return hit;
  // 不要字体自己的描边，由这里统一描边、配底色
  const k = text ? (fontMask(text) ?? mixedMask(text)) : { w: 1, h: 1, m: new Uint8Array(1) };
  maskCache.set(text, k);
  return k;
}

const texCache = new Map<string, SpriteTex>();

/**
 * 漫画字的像素图（按内容缓存）：普通飘字是彩色字描一圈深色边；气泡是白底黑框带尖角；举牌是方卡片。
 * 锚点在底边中间。
 */
export function spriteTextTexture(text: string, o: TextTexOptions = {}): SpriteTex {
  const fg = o.fg || '#ffffff';
  const st = o.stroke || INK;
  const key = [text, fg, st, !!o.bubble, !!o.card, o.bg || ''].join('|');
  const hit = texCache.get(key);
  if (hit) return hit;
  const k = textMask(text);
  const paper = packHex(o.bg || '#fbf7ea');
  const ink = packHex(st);
  let W: number;
  let H: number;
  let px: Uint32Array;
  const put = (x: number, y: number, c: number) => {
    if (x >= 0 && y >= 0 && x < W && y < H) px[y * W + x] = c;
  };
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < k.w && y < k.h && k.m[y * k.w + x] === 1;
  if (o.bubble || o.card) {
    const pad = o.card ? 3 : 2;
    const tail = o.bubble ? 3 : 0;
    W = k.w + pad * 2 + 2;
    const boxH = k.h + pad * 2 + 2;
    H = boxH + tail;
    px = new Uint32Array(W * H);
    for (let y = 0; y < boxH; y++)
      for (let x = 0; x < W; x++) {
        const edge = x === 0 || y === 0 || x === W - 1 || y === boxH - 1;
        const corner = (x === 0 || x === W - 1) && (y === 0 || y === boxH - 1);
        if (corner && o.bubble) continue;
        put(x, y, edge ? ink : paper);
      }
    if (o.card) for (let x = 1; x < W - 1; x++) put(x, boxH - 2, ink); // 卡片下沿加厚
    // 尖角
    const cx = W >> 1;
    for (let t = 0; t < tail; t++) {
      const half = tail - 1 - t;
      for (let x = cx - half - 1; x <= cx + half + 1; x++)
        put(x, boxH - 1 + t, x === cx - half - 1 || x === cx + half + 1 ? ink : paper);
    }
    if (tail) put(cx, boxH - 1 + tail, ink);
    const tc = packHex(o.bubble && fg === '#ffffff' ? INK : fg);
    for (let y = 0; y < k.h; y++) for (let x = 0; x < k.w; x++) if (on(x, y)) put(x + pad + 1, y + pad + 1, tc);
  } else {
    W = k.w + 2;
    H = k.h + 3;
    px = new Uint32Array(W * H);
    const fc = packHex(fg);
    // 描边（四邻）+ 往下一像素的投影
    for (let y = -1; y <= k.h + 1; y++)
      for (let x = -1; x <= k.w; x++) {
        if (on(x, y)) continue;
        if (on(x + 1, y) || on(x - 1, y) || on(x, y + 1) || on(x, y - 1) || on(x, y - 2)) put(x + 1, y + 1, ink);
      }
    for (let y = 0; y < k.h; y++) for (let x = 0; x < k.w; x++) if (on(x, y)) put(x + 1, y + 1, fc);
  }
  const r: SpriteTex = { art: { w: W, h: H, ox: W >> 1, oy: H - 1, px }, aspect: W / H };
  texCache.set(key, r);
  return r;
}

/** 图标的像素图 */
export function iconTexture(name: IconName): SpriteTex {
  const a = iconArt(name);
  return { art: a, aspect: a.w / a.h };
}

/* ---------------- 牌子（横幅、招牌、记分牌、测速牌） ---------------- */

/** 牌子上的一段字 */
export interface SignText {
  /**
   * 候选字，按优先级排（长的在前）：当前精灵档位下放不下就换下一个；都放不下就画 icon（给了的话），否则什么也不写。
   * 牌子上永远不出现糊成一团的像素。支持 '\n' 多行。
   */
  text: string | readonly string[];
  color: string;
  /** 字的格子（米，牌子中心为原点，u 向右、v 向上），默认整块牌子 */
  u?: number;
  v?: number;
  w?: number;
  h?: number;
  /** 描一圈深色边（浅色底上的亮字用）；默认不描 */
  outline?: string;
  /** 字都放不下时画的图标 */
  icon?: IconName;
}

/** 牌面：底色（null = 不画底色，例如底板是方块）、要不要自发光（LED 屏）、几段字 */
export interface SignFace {
  bg: string | null;
  /** LED：底色和字都不受夜色压暗 */
  glow?: boolean;
  texts: readonly SignText[];
}

type SignFont = '5x7' | '3x5';

const signArtCache = new Map<string, BakedArt | null>();

/** 一行字的二值图：5x7 走 textMask（像素字没有的字退回画布字）；3x5 只认像素字，没有的字返回 null。 */
function lineMask(line: string, font: SignFont): Mask | null {
  if (font === '5x7') return textMask(line);
  const a = textArt(line, { font: '3x5', outline: '' });
  if (!a) return null;
  const h = a.rows.length;
  const w = Math.max(1, ...a.rows.map((r) => r.length));
  const m = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) m[y * w + x] = (a.rows[y]?.[x] ?? '.') !== '.' ? 1 : 0;
  return { w, h, m };
}

/** 牌子上的一段字（多行居中排，行距 2 像素）→ 像素图，锚点在正中。按 字+字体+颜色+描边 缓存。 */
function signArt(text: string, font: SignFont, color: string, outline: string): BakedArt | null {
  const key = [text, font, color, outline].join('\u0000');
  const hit = signArtCache.get(key);
  if (hit !== undefined) return hit;
  let out: BakedArt | null = null;
  const lines: Mask[] = [];
  for (const l of text.split('\n')) {
    const k = lineMask(l, font);
    if (!k) {
      lines.length = 0;
      break;
    }
    lines.push(k);
  }
  if (lines.length) {
    const o = outline ? 1 : 0;
    const iw = Math.max(...lines.map((k) => k.w));
    const ih = lines.reduce((s, k) => s + k.h, 0) + (lines.length - 1) * 2;
    const W = iw + o * 2;
    const H = ih + o * 2;
    const ink = new Uint8Array(W * H);
    let y0 = o;
    for (const k of lines) {
      const x0 = o + ((iw - k.w) >> 1);
      for (let y = 0; y < k.h; y++) for (let x = 0; x < k.w; x++) if (k.m[y * k.w + x]) ink[(y0 + y) * W + x0 + x] = 1;
      y0 += k.h + 2;
    }
    const px = new Uint32Array(W * H);
    const fc = packHex(color);
    const oc = outline ? packHex(outline) : 0;
    const on = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && ink[y * W + x] === 1;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if (on(x, y)) px[y * W + x] = fc;
        else if (oc && (on(x + 1, y) || on(x - 1, y) || on(x, y + 1) || on(x, y - 1))) px[y * W + x] = oc;
      }
    out = { w: W, h: H, ox: W >> 1, oy: H >> 1, px };
  }
  signArtCache.set(key, out);
  return out;
}

const _sp = new V3();

/**
 * 写字的牌子（所有活动的横幅、摊位招牌、记分牌、测速牌都用它）：节点局部的 xy 平面（正面朝 +z），
 * w×h 米的一块底色面加几段像素字。字按整数倍放大，最大到精灵档位；每段字在自己的格子里挑放得下的
 * 最大写法（5x7 字、3x5 小字、更短的候选字、图标），都放不下就不写——牌子上不出现糊成一团的像素。
 * face 可以是函数，每帧调用一次（比分、球速这类随时变的字）。背面朝镜头时只画底色。
 */
export function signBoard(w: number, h: number, face: SignFace | (() => SignFace)): Custom {
  const hw = w / 2;
  const hh = h / 2;
  const pt = (m: Mat, u: number, v: number, z = 0): [number, number, number] => {
    _sp.set(u, v, z);
    applyMat(m, _sp);
    return [_sp.x, _sp.y, _sp.z];
  };
  return new Custom(
    (r: DrawContext, self: Custom) => {
      const f = typeof face === 'function' ? face() : face;
      const m = self.matrixWorld;
      const c = pt(m, 0, 0);
      const lit = f.glow ? 1 : (self.lit ?? r.litAt(c[0], c[2]));
      if (f.bg) {
        const col = f.glow ? r.em(f.bg) : r.col(f.bg, 1, lit);
        r.wpoly([pt(m, -hw, -hh), pt(m, hw, -hh), pt(m, hw, hh), pt(m, -hw, hh)], col);
      }
      // 正面法线 = 局部 +z 轴的世界方向
      if (!r.vis(m[6] as number, m[8] as number)) return;
      for (const t of f.texts) {
        const u = t.u ?? 0;
        const v = t.v ?? 0;
        const cw = (t.w ?? w) / 2;
        const ch = (t.h ?? h) / 2;
        // 格子在屏幕上的宽（左右两边中点的横向距离）和高（一条竖边的纵向长度），留一点边
        const [lx] = r.P(...pt(m, u - cw, v));
        const [rx] = r.P(...pt(m, u + cw, v));
        const [, ty] = r.P(...pt(m, u - cw, v + ch));
        const [, by] = r.P(...pt(m, u - cw, v - ch));
        const roomW = Math.abs(rx - lx) * 0.94;
        const roomH = Math.abs(by - ty) * 0.94;
        const art = pickSignArt(t, roomW, roomH, r.spriteScale);
        if (!art) continue;
        const q = pt(m, u, v, 0.01);
        r.art(art.a, q[0], q[1], q[2], { scale: art.k, lit });
      }
    },
    { x0: -hw, x1: hw, y0: -hh, y1: hh, z0: -0.02, z1: 0.02 },
  );
}

/** 挑一段字在 roomW×roomH 像素的格子里能画的最大写法；都放不下返回 null。 */
function pickSignArt(t: SignText, roomW: number, roomH: number, maxK: number): { a: BakedArt; k: number } | null {
  const fit = (a: BakedArt | null) => (a ? Math.min(maxK, Math.floor(roomW / a.w), Math.floor(roomH / a.h)) : 0);
  // "选拔试训 · TRYOUTS" 这种中英两段的招牌：整段放不下时依次试每一段（英文段用像素字，小牌子也放得下）
  const cands = (typeof t.text === 'string' ? [t.text] : t.text).flatMap((s) =>
    s.includes(' · ') ? [s, ...s.split(' · ')] : [s],
  );
  for (const s of cands) {
    if (!s) continue;
    let best: { a: BakedArt; k: number } | null = null;
    for (const font of ['5x7', '3x5'] as const) {
      const a = signArt(s, font, t.color, t.outline ?? '');
      const k = fit(a);
      if (a && k >= 1 && (!best || a.h * k > best.a.h * best.k)) best = { a, k };
    }
    if (best) return best;
  }
  if (t.icon) {
    const a = iconArt(t.icon);
    const k = fit(a);
    if (k >= 1) return { a: { ...a, oy: a.h >> 1 }, k };
  }
  return null;
}

/**
 * 一块写着字的牌子（横幅、摊位招牌）：w×h 米的薄板（正面朝 +z），字画在正中，放不下时不写。
 * px 是旧版的字号，像素版里只用来决定要不要描边：px ≥ 20 时字描一圈底色的深色。
 */
export function labelPlane(text: string, w: number, h: number, bg: string, fg: string, px: number): Group {
  const g = new Group();
  g.add(new Box(w, h, 0.04, bg, { edge: false }));
  if (text) {
    const s = signBoard(w, h, { bg: null, texts: [{ text, color: fg, outline: px >= 20 ? shade(bg) : undefined }] });
    s.position.set(0, 0, 0.025);
    s.renderOrder = 0.05;
    g.add(s);
  }
  g.userData.disposable = true;
  return g;
}

function shade(hex: string): string {
  const n = Number.parseInt(hex.slice(1, 7), 16);
  const c = (v: number) =>
    Math.round(v * 0.55)
      .toString(16)
      .padStart(2, '0');
  return `#${c((n >> 16) & 0xff)}${c((n >> 8) & 0xff)}${c(n & 0xff)}`;
}

/** 小星星（5×4），给头顶的教练星级徽章用 */
const MINI_STAR = ['..#..', '#####', '.###.', '.#.#.'];
const starCache = new Map<number, SpriteTex>();

/** n 颗小星星排成一行、描深色边的像素图（锚点在底边中间）。 */
export function starsTexture(n: number): SpriteTex {
  const hit = starCache.get(n);
  if (hit) return hit;
  const rows = MINI_STAR.map((r) => Array.from({ length: Math.max(1, n) }, () => r).join('.'));
  const k: Mask = { w: rows[0]?.length ?? 1, h: rows.length, m: new Uint8Array((rows[0]?.length ?? 1) * rows.length) };
  rows.forEach((r, y) => {
    for (let x = 0; x < r.length; x++) k.m[y * k.w + x] = r[x] === '#' ? 1 : 0;
  });
  const W = k.w + 2;
  const H = k.h + 2;
  const px = new Uint32Array(W * H);
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < k.w && y < k.h && k.m[y * k.w + x] === 1;
  const fc = packHex('#ffd84a');
  const ink = packHex(INK);
  for (let y = -1; y <= k.h; y++)
    for (let x = -1; x <= k.w; x++) {
      if (on(x, y)) px[(y + 1) * W + x + 1] = fc;
      else if (on(x + 1, y) || on(x - 1, y) || on(x, y + 1) || on(x, y - 1)) px[(y + 1) * W + x + 1] = ink;
    }
  const t: SpriteTex = { art: { w: W, h: H, ox: W >> 1, oy: H - 1, px }, aspect: W / H };
  starCache.set(n, t);
  return t;
}

export interface SpriteOptions {
  /** 高度（米）：像素版里只用来分档，≥ 1 时放大一倍（闪光） */
  h?: number;
  /** 存在多久（秒）；Infinity 一直在 */
  dur?: number;
  /** 跟着某个节点（头顶、手） */
  follow?: Node | null;
  /** 不跟节点时的位置（图层父节点的局部坐标） */
  pos?: XYZ | null;
  /** 在目标上方多高（米，按人物素材比例换成像素：屏幕上的间距跟精灵档位走，不跟缩放走） */
  off?: number;
  /** 一边存在一边往上飘多高（同上） */
  rise?: number;
  /** 出现时弹一下 */
  pop?: boolean;
  /** 绕目标转圈的半径（眩晕星星，同上） */
  orbit?: number;
  ph?: number;
}

interface SpriteRec {
  node: Custom;
  art: BakedArt;
  mult: number;
  t0: number;
  /** 出现了多久（update 算，画的时候用） */
  age: number;
  dur: number;
  follow: Node | null;
  /** 在目标上方多少素材像素 */
  off: number;
  pos: XYZ | null;
  /** 往上飘多少素材像素 */
  rise: number;
  pop: boolean;
  /** 转圈半径（素材像素） */
  orbit: number;
  ph: number;
  /** 这一帧要不要画（快消失时闪烁） */
  show: boolean;
}

export interface PopOptions {
  fg?: string;
  h?: number;
  dur?: number;
  rise?: number;
  bg?: string;
}

const _v = new V3();
/** 漫画字排在最前面画 */
const TOP = 1000;
/**
 * 偏移（off、rise、orbit，选项里按米给）换成素材像素：按人物素材的比例，1.8 米 = 14 像素。
 * 画的时候再乘精灵档位、按当前 k 换回米，所以头顶的间距在屏幕上只跟精灵档位走，跟 k 无关。
 */
const PX_PER_M = K1;
/** 出现时弹起的高度（素材像素） */
const POP_PX = 1;

/** 一组漫画字和表情，挂在某个父节点下（活动的场地坐标系）。 */
export class SpriteLayer {
  private readonly recs: SpriteRec[] = [];
  private now = 0;

  constructor(
    private readonly parent: Node,
    /** 旧版的整体放大（相机远近）；像素版的字和偏移都按精灵档位放大，这个只留着兼容 */
    readonly scale = 1,
  ) {}

  spr(info: SpriteTex, o: SpriteOptions = {}): void {
    const rec: SpriteRec = {
      node: new Custom((r: DrawContext, self: Custom) => {
        if (!rec.show) return;
        const m = self.matrixWorld;
        // 节点停在目标点上；偏移按素材像素 × 精灵档位换成当前 k 下的米，屏幕上的间距不随缩放变
        const s = r.spriteScale;
        const age = rec.age;
        let up = rec.off + rec.rise * Math.min(1, age / Math.max(0.3, Math.min(rec.dur, 3)));
        // 出现时往上弹一下
        if (rec.pop && age < 0.22) up += Math.sin((age / 0.22) * Math.PI) * POP_PX;
        let x = m[9] as number;
        let z = m[11] as number;
        if (rec.orbit) {
          const rad = (rec.orbit * s) / r.k;
          x += Math.cos(rec.ph + age * 7) * rad;
          z += Math.sin(rec.ph + age * 7) * rad;
        }
        r.art(rec.art, x, (m[10] as number) + (up * s) / (r.k * HV), z, { scale: s * rec.mult });
      }),
      art: info.art,
      mult: (o.h ?? 0.6) >= 1 ? 2 : 1,
      t0: this.now,
      age: 0,
      dur: o.dur ?? 1.4,
      follow: o.follow ?? null,
      off: (o.off ?? 0.45) * PX_PER_M,
      pos: o.pos ? { ...o.pos } : null,
      rise: (o.rise ?? 0.7) * PX_PER_M,
      pop: o.pop !== false,
      orbit: (o.orbit ?? 0) * PX_PER_M,
      ph: o.ph ?? 0,
      show: false,
    };
    rec.node.renderOrder = TOP;
    rec.node.lit = 1;
    rec.node.visible = false;
    // 偏移在画的时候才加：远景（k 小）时同样的像素合更多米，包围盒往上留够
    rec.node.bounds = { x0: -0.5, x1: 0.5, y0: 0, y1: 5, z0: -0.5, z1: 0.5 };
    this.parent.add(rec.node);
    this.recs.push(rec);
  }

  /** 头顶表情图标 */
  emote(head: Node, name: IconName, dur = 1.5): void {
    this.spr(iconTexture(name), { follow: head, off: 0.18, h: 0.5, dur, rise: 0.12 });
  }

  icon(name: IconName, o: SpriteOptions): void {
    this.spr(iconTexture(name), o);
  }

  /** 飘字：跟着节点（头顶）或停在某个位置 */
  pop(text: string, target: Node | XYZ, o: PopOptions = {}): void {
    const info = spriteTextTexture(text, { fg: o.fg || '#ffffff' });
    const isObj = isNode(target);
    this.spr(info, {
      follow: isObj ? target : null,
      pos: isObj ? null : target,
      off: isObj ? 0.45 : 0,
      h: o.h || 0.5,
      dur: o.dur || 1.5,
      rise: o.rise ?? 0.75,
    });
  }

  /** 对话气泡 */
  say(head: Node, text: string, dur = 2.2, o: PopOptions = {}): void {
    this.spr(spriteTextTexture(text, { bubble: true, fg: o.fg || INK, bg: o.bg }), {
      follow: head,
      off: 0.3,
      h: o.h || 0.5,
      dur,
      rise: 0,
    });
  }

  /** 头上转圈的眩晕星星 */
  dizzy(head: Node, dur = 1.6): void {
    for (let i = 0; i < 3; i++)
      this.icon('star', { follow: head, off: 0.05, h: 0.22, dur, rise: 0, orbit: 0.32, ph: i * 2.09, pop: false });
  }

  flash(pos: XYZ, h = 1.3): void {
    this.icon('flash', { pos, h, dur: 0.32, rise: 0 });
  }

  /** 头顶一直挂着的星级徽章（n 颗小星星） */
  badge(head: Node, n: number): void {
    // 比飘字（从 0.45 起往上飘）低一点，飘字飘起来后不叠在一起
    this.spr(starsTexture(n), { follow: head, off: 0.28, h: 0.3, dur: Number.POSITIVE_INFINITY, rise: 0 });
  }

  /** 举起的分数牌 */
  card(hand: Node, text: string, col?: string): void {
    this.spr(spriteTextTexture(text, { card: true, fg: col || INK }), {
      follow: hand,
      off: 0.2,
      h: 0.42,
      dur: 2.3,
      rise: 0,
    });
  }

  /** 还在的漫画字个数 */
  get count(): number {
    return this.recs.length;
  }

  update(now: number): void {
    this.now = now;
    for (let i = this.recs.length - 1; i >= 0; i--) {
      const r = this.recs[i] as SpriteRec;
      const age = now - r.t0;
      if (age > r.dur || (r.follow && !r.follow.parent)) {
        this.parent.remove(r.node);
        this.recs.splice(i, 1);
        continue;
      }
      let p: XYZ | null = r.pos;
      if (r.follow) {
        r.follow.getWorldPosition(_v);
        this.parent.worldToLocal(_v);
        p = _v;
      }
      if (!p) continue;
      r.age = age;
      r.node.position.set(p.x, p.y, p.z);
      r.node.visible = true;
      // 快消失时闪烁（像素画面不做半透明）
      const left = r.dur - age;
      r.show = !(Number.isFinite(r.dur) && left < 0.3 && Math.floor(left / 0.06) % 2 === 1);
    }
  }

  dispose(): void {
    for (const r of this.recs) this.parent.remove(r.node);
    this.recs.length = 0;
  }
}

function isNode(t: Node | XYZ): t is Node {
  return typeof (t as Node).getWorldPosition === 'function';
}

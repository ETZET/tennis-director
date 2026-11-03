import type { XYZ } from '@td/shared';
import { textArt } from '../art/font';
import { type BakedArt, Box, Custom, type DrawContext, Group, type Node, V3 } from '../core/graph';
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
function canvasMask(text: string): Mask {
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
  return trim({ w, h, m });
}

/** 裁掉四周空行空列 */
function trim(k: Mask): Mask {
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
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const m = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) m[y * w + x] = k.m[(y + y0) * k.w + x + x0] as number;
  return { w, h, m };
}

/** 字 → 二值图：像素字优先，没有就画布兜底。 */
export function textMask(text: string): Mask {
  const hit = maskCache.get(text);
  if (hit) return hit;
  let k: Mask | null = null;
  const a = text ? textArt(text, { outline: '' }) : null;
  if (a) {
    const h = a.rows.length;
    const w = Math.max(1, ...a.rows.map((r) => r.length));
    const m = new Uint8Array(w * h);
    // 不要字体自己的描边，由这里统一描边、配底色
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) m[y * w + x] = (a.rows[y]?.[x] ?? '.') !== '.' ? 1 : 0;
    k = { w, h, m };
  } else k = text ? canvasMask(text) : { w: 1, h: 1, m: new Uint8Array(1) };
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

/**
 * 一块写着字的牌子（横幅、摊位招牌）：w×h 米的薄板（正面朝 +z），字画在正中。
 * px 是旧版的字号，像素版里字号固定（像素字），只用来决定要不要加粗：px ≥ 20 时字下面加一道投影。
 */
export function labelPlane(text: string, w: number, h: number, bg: string, fg: string, px: number): Group {
  const g = new Group();
  const board = new Box(w, h, 0.04, bg, { edge: false });
  g.add(board);
  if (text) {
    const tex = spriteTextTexture(text, { fg, stroke: px >= 20 ? shade(bg) : bg });
    const t = new Custom(
      (r: DrawContext, self: Custom) => {
        const m = self.matrixWorld;
        // 牌子正面不朝镜头时不写字
        if (!r.vis(m[6] as number, m[8] as number)) return;
        r.art(tex.art, m[9] as number, m[10] as number, m[11] as number);
      },
      { x0: -w / 2, x1: w / 2, y0: -h / 2, y1: h / 2, z0: 0, z1: 0.05 },
    );
    // 锚点在字的底边：往下挪半个字高（按 1 档像素估）
    t.position.set(0, -h * 0.25, 0.03);
    t.renderOrder = 0.05;
    g.add(t);
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

export interface SpriteOptions {
  /** 高度（米）：像素版里只用来分档，≥ 1 时放大一倍（闪光） */
  h?: number;
  /** 存在多久（秒）；Infinity 一直在 */
  dur?: number;
  /** 跟着某个节点（头顶、手） */
  follow?: Node | null;
  /** 不跟节点时的位置（图层父节点的局部坐标） */
  pos?: XYZ | null;
  /** 在目标上方多高（米） */
  off?: number;
  /** 一边存在一边往上飘多高（米） */
  rise?: number;
  /** 出现时弹一下 */
  pop?: boolean;
  /** 绕目标转圈的半径（眩晕星星） */
  orbit?: number;
  ph?: number;
}

interface SpriteRec {
  node: Custom;
  art: BakedArt;
  mult: number;
  t0: number;
  dur: number;
  follow: Node | null;
  off: number;
  pos: XYZ | null;
  rise: number;
  pop: boolean;
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

/** 一组漫画字和表情，挂在某个父节点下（活动的场地坐标系）。 */
export class SpriteLayer {
  private readonly recs: SpriteRec[] = [];
  private now = 0;

  constructor(
    private readonly parent: Node,
    /** 旧版的整体放大（相机远近）；像素版的字按精灵档位放大，这个只放大偏移量 */
    readonly scale = 1,
  ) {}

  spr(info: SpriteTex, o: SpriteOptions = {}): void {
    const k = Math.sqrt(this.scale);
    const rec: SpriteRec = {
      node: new Custom((r: DrawContext, self: Custom) => {
        if (!rec.show) return;
        const m = self.matrixWorld;
        r.art(rec.art, m[9] as number, m[10] as number, m[11] as number, { scale: r.spriteScale * rec.mult });
      }),
      art: info.art,
      mult: (o.h ?? 0.6) >= 1 ? 2 : 1,
      t0: this.now,
      dur: o.dur ?? 1.4,
      follow: o.follow ?? null,
      off: (o.off ?? 0.45) * k,
      pos: o.pos ? { ...o.pos } : null,
      rise: (o.rise ?? 0.7) * k,
      pop: o.pop !== false,
      orbit: (o.orbit ?? 0) * k,
      ph: o.ph ?? 0,
      show: false,
    };
    rec.node.renderOrder = TOP;
    rec.node.lit = 1;
    rec.node.visible = false;
    rec.node.bounds = { x0: -0.1, x1: 0.1, y0: 0, y1: 0.4, z0: -0.1, z1: 0.1 };
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
      let x = p.x;
      let y = p.y + r.off + r.rise * Math.min(1, age / Math.max(0.3, Math.min(r.dur, 3)));
      let z = p.z;
      if (r.orbit) {
        x += Math.cos(r.ph + age * 7) * r.orbit;
        z += Math.sin(r.ph + age * 7) * r.orbit;
      }
      // 出现时往上弹一下
      if (r.pop && age < 0.22) y += Math.sin((age / 0.22) * Math.PI) * 0.12;
      r.node.position.set(x, y, z);
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

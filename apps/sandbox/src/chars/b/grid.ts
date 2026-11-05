/**
 * 方向 B 的拼帧器：把字符画部件（头、发型、脸、衣服、配饰）按姿势拼到一张材质格子上，
 * 自动描边（选择性描边：描边色取挨着的材质的暗面再压暗）、自动补左上光的暗面，最后烘焙成 @td/iso 的 BakedArt。
 *
 * 材质字母（大写亮面、小写暗面；颜色由每个人的调色板给，等于"换色槽位"）：
 *   S 皮肤  H 头发  Z 眉毛  E 眼珠  W 眼白/白色  M 嘴唇  R 腮红/雀斑  Y 胡子
 *   T 上衣  U 上衣第二色（领口、条纹、镶边）  B 下装  K 袜子  F 鞋  C 帽子
 *   A 配饰一（护膝、肌贴、围裙带、头巾）  G 配饰二（手套、钳子、相机）  D 木头（拐杖、耙子）
 *   X 眼镜框/墨镜  V 镜片  P 手机/杯子  I 球（黄绿）  Q 球拍框  J 拍线
 *   O 描边（显式）  . 透明
 */
import type { BakedArt } from '@td/iso';
import { hx, mixP, pk } from '@td/iso';

/** 不参与描边的材质（球拍、球、拍线画在描边之后，不压身体） */
const NO_OUTLINE = new Set(['Q', 'J', 'I', 'q', 'j', 'i']);
/** 不自动补暗面的材质（五官、小配饰本来就只有 1 格） */
const NO_SHADE = new Set(['E', 'W', 'Z', 'M', 'R', 'X', 'V', 'O', 'Q', 'J', 'I', 'P', 'Y']);

export type Pal = Readonly<Record<string, string>>;

export class Grid {
  readonly c: string[];
  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.c = new Array(w * h).fill('.');
  }
  get(x: number, y: number): string {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return '.';
    return this.c[y * this.w + x];
  }
  set(x: number, y: number, ch: string): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || ch === '.' || ch === ' ') return;
    this.c[y * this.w + x] = ch;
  }
  /** 强制写（'.' 会擦掉） */
  put(x: number, y: number, ch: string): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.c[y * this.w + x] = ch;
  }
  rect(x: number, y: number, w: number, h: number, ch: string): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, ch);
  }
  /** 盖一张字符画（'.' 跳过；'_' 擦成透明）；flip = 左右镜像着盖 */
  stamp(rows: readonly string[], x: number, y: number, flip = false): void {
    for (let j = 0; j < rows.length; j++) {
      const r = rows[j];
      for (let i = 0; i < r.length; i++) {
        const ch = flip ? r[r.length - 1 - i] : r[i];
        if (ch === '_') this.put(x + i, y + j, '.');
        else this.set(x + i, y + j, ch);
      }
    }
  }
  /** 只在已有身体像素上盖（脸部细节用：不会画到头外面） */
  paintOn(rows: readonly string[], x: number, y: number): void {
    for (let j = 0; j < rows.length; j++) {
      const r = rows[j];
      for (let i = 0; i < r.length; i++) {
        const ch = r[i];
        if (ch === '.' || ch === ' ') continue;
        if (this.get(x + i, y + j) !== '.') this.put(x + i, y + j, ch);
      }
    }
  }
}

export interface Built {
  /** 字符画（描边后的最终帧，描边按挨着的材质写成 0–9） */
  readonly rows: string[];
  readonly ox: number;
  readonly oy: number;
  readonly pal: Record<string, string>;
  readonly pts: Record<string, readonly [number, number]>;
}

const OUTLINE_BASE = '#2a2238';
/** 描边按挨着的材质分几种（选择性描边）：数字 → 材质 */
const OUT_OF: Record<string, string> = {
  S: '1',
  H: '2',
  T: '3',
  U: '3',
  B: '4',
  F: '5',
  K: '4',
  C: '6',
  Y: '7',
  A: '8',
  G: '8',
  D: '8',
};

export function shade(hex: string, f = 0.74): string {
  const [r, g, b] = hx(hex);
  // 暗面往冷紫偏一点（和场景的阴影同向）
  const to = (v: number, t: number) => Math.round(Math.max(0, Math.min(255, v * f + t)));
  return `#${[to(r, 4), to(g, 2), to(b, 14)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** 皮肤的暗面往暖红偏（不然腿和脸的暗面发灰） */
export function skinShade(hex: string): string {
  const [r, g, b] = hx(hex);
  const to = (v: number) =>
    Math.round(Math.max(0, Math.min(255, v)))
      .toString(16)
      .padStart(2, '0');
  return `#${to(r * 0.84)}${to(g * 0.7)}${to(b * 0.66)}`;
}

function packHex(h: string): number {
  const c = hx(h);
  return pk(c[0], c[1], c[2]);
}

/**
 * 收尾：自动补暗面（右边缘、帽檐下）、描边、裁剪。
 * g 的锚点 (ax, ay) 是两脚之间缝右边那一格、鞋底那一行（描边后在描边行）。
 */
export function finish(
  g: Grid,
  ax: number,
  ay: number,
  pal: Pal,
  pts: Record<string, readonly [number, number]> = {},
): Built {
  const W = g.w;
  const H = g.h;
  // 1. 左上来光：材质右边缘是空的 → 暗面；帽檐、头发正下方的皮肤 → 暗面
  const out = g.c.slice();
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const ch = g.get(x, y);
      if (ch === '.' || ch !== ch.toUpperCase() || NO_SHADE.has(ch) || NO_OUTLINE.has(ch)) continue;
      const r = g.get(x + 1, y);
      const up = g.get(x, y - 1);
      if (r === '.' || NO_OUTLINE.has(r)) out[y * W + x] = ch.toLowerCase();
      else if (ch === 'S' && (up === 'c' || up === 'C')) out[y * W + x] = 's';
    }
  // 2. 描边：身体外一圈（4 邻接），描边色看挨着的材质
  const body = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return false;
    const ch = out[y * W + x];
    return ch !== '.' && !NO_OUTLINE.has(ch);
  };
  const fin = out.slice();
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const ch = out[y * W + x];
      if (ch !== '.' && !NO_OUTLINE.has(ch)) {
        if (ch === 'O') fin[y * W + x] = '0';
        continue;
      }
      let n = '';
      for (const [dx, dy] of [
        [0, 1],
        [1, 0],
        [-1, 0],
        [0, -1],
      ] as const)
        if (body(x + dx, y + dy)) {
          n = out[(y + dy) * W + x + dx];
          break;
        }
      if (!n) continue;
      if (ch !== '.' && NO_OUTLINE.has(ch)) continue; // 球拍盖在描边位置上：留着球拍
      fin[y * W + x] = y === ay ? '0' : (OUT_OF[n.toUpperCase()] ?? '0');
    }
  // 3. 裁剪
  let x0 = W;
  let y0 = H;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (fin[y * W + x] !== '.') {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) return { rows: ['.'], ox: 0, oy: 0, pal: { ...pal }, pts: {} };
  // 锚点要在包围盒里（左右对称裁，翻转时不跳）
  const rows: string[] = [];
  for (let y = y0; y <= Math.max(y1, ay); y++) {
    let s = '';
    for (let x = x0; x <= x1; x++) s += fin[y * W + x];
    rows.push(s);
  }
  // 调色板：亮面、暗面、描边色
  const p: Record<string, string> = {};
  for (const [k, v] of Object.entries(pal)) {
    p[k] = v;
    const lo = k.toLowerCase();
    if (lo !== k && !(lo in pal)) p[lo] = k === 'S' ? skinShade(v) : shade(v);
  }
  const ob = packHex(OUTLINE_BASE);
  p['0'] = OUTLINE_BASE;
  for (const [mat, dig] of Object.entries(OUT_OF)) {
    const src = pal[mat];
    if (!src) continue;
    if (p[dig]) continue;
    const m = mixP(ob, packHex(shade(src, 0.55)), 0.32);
    p[dig] = `#${[m & 255, (m >>> 8) & 255, (m >>> 16) & 255].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  }
  for (const d of '12345678') p[d] ??= OUTLINE_BASE;
  const opts: Record<string, readonly [number, number]> = {};
  for (const [k, v] of Object.entries(pts)) opts[k] = [v[0] - x0, v[1] - y0];
  return { rows, ox: ax - x0, oy: ay - y0, pal: p, pts: opts };
}

/** 字符画 → @td/iso 的烘焙图（自己烘焙：字母全部查这张图自己的调色板） */
export function bake(b: Built): BakedArt {
  const h = b.rows.length;
  const w = b.rows[0].length;
  const px = new Uint32Array(w * h);
  const memo = new Map<string, number>();
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const ch = b.rows[j][i];
      if (ch === '.') continue;
      let v = memo.get(ch);
      if (v === undefined) {
        const hex = b.pal[ch];
        v = hex ? packHex(hex) : packHex('#ff00ff');
        memo.set(ch, v);
      }
      px[j * w + i] = v;
    }
  return { w, h, ox: b.ox, oy: b.oy, px, pts: b.pts };
}

/** 把烘焙图画到 2D 画布上（整数倍放大由调用方用 CSS 或 drawImage 做） */
export function toCanvas(b: BakedArt, flip = false): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = b.w;
  cv.height = b.h;
  const ctx = cv.getContext('2d') as CanvasRenderingContext2D;
  const img = ctx.createImageData(b.w, b.h);
  const u = new Uint32Array(img.data.buffer);
  for (let j = 0; j < b.h; j++) for (let i = 0; i < b.w; i++) u[j * b.w + (flip ? b.w - 1 - i : i)] = b.px[j * b.w + i];
  ctx.putImageData(img, 0, 0);
  return cv;
}

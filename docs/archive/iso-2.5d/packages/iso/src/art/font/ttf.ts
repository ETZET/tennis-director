import type { Glyph } from './index';

/**
 * 把像素字形表打成一个极小的 TrueType 字体（纯函数，浏览器和 node 都能跑）。
 *
 * 用途：HUD 的 Pixelify Sans 在小字号下 5 像 S、8 像 S、2 像 Z；packages/ui 的 hud.css 用
 * unicode-range 只把数字 0–9 换成 FONT5x7 的数字（data: URI 内嵌），其余字照旧。
 * 改了 FONT5x7 的数字要重新生成 hud.css 里的两行 @font-face（见 pixelDigitsCss）。
 *
 * 度量按 Pixelify Sans 对齐（1100 单位/em，一个像素 100 单位，数字 7 像素高、等宽 645），
 * 换字体后数字的宽度和基线不变，排版不跳。
 */
export interface PixelTtfOptions {
  family: string;
  /** 粗体：每段竖笔往右加宽 boldGrow 单位，字宽跟着变大（Pixelify Sans 700 的数字宽 663） */
  bold?: boolean;
}

const UPM = 1100;
const PX = 100;
const ASC = 1012;
const DESC = 308;
const ADV = { regular: 645, bold: 663 };
const BOLD_GROW = 40;

type Rect = [x0: number, y0: number, x1: number, y1: number];

/** 字形 → 矩形（每行的连续段，上下相同的段合并成一个高矩形）。y 向上，基线在第 7 行底边。 */
function rects(g: Glyph, x0: number, grow: number): Rect[] {
  const out: Rect[] = [];
  let open: { a: number; b: number; top: number }[] = [];
  const h = g.length;
  for (let r = 0; r <= h; r++) {
    const row = g[r] ?? '';
    const runs: { a: number; b: number }[] = [];
    for (let x = 0; x < row.length; x++) {
      if (row[x] !== '#') continue;
      let e = x;
      while (row[e + 1] === '#') e++;
      runs.push({ a: x, b: e + 1 });
      x = e;
    }
    const next: typeof open = [];
    for (const o of open) {
      const same = runs.findIndex((u) => u.a === o.a && u.b === o.b);
      if (same >= 0) {
        next.push(o);
        runs.splice(same, 1);
      } else out.push([x0 + o.a * PX, (7 - r) * PX, x0 + o.b * PX + grow, (7 - o.top) * PX]);
    }
    for (const u of runs) next.push({ ...u, top: r });
    open = next;
  }
  return out;
}

class Buf {
  b: number[] = [];
  u8(v: number) {
    this.b.push(v & 0xff);
  }
  u16(v: number) {
    this.u8(v >> 8);
    this.u8(v);
  }
  u32(v: number) {
    this.u16(v >>> 16);
    this.u16(v & 0xffff);
  }
  pad4() {
    while (this.b.length % 4) this.b.push(0);
  }
}

function checksum(b: readonly number[]): number {
  let s = 0;
  for (let i = 0; i < b.length; i += 4)
    s = (s + (((b[i] ?? 0) << 24) | ((b[i + 1] ?? 0) << 16) | ((b[i + 2] ?? 0) << 8) | (b[i + 3] ?? 0))) >>> 0;
  return s;
}

/** 只含数字 0–9 的字体（外加空的 .notdef），字形取自 glyphs['0'..'9']。 */
export function pixelDigitsTtf(glyphs: Readonly<Record<string, Glyph>>, o: PixelTtfOptions): Uint8Array {
  const bold = !!o.bold;
  const adv = bold ? ADV.bold : ADV.regular;
  const grow = bold ? BOLD_GROW : 0;
  const digits = [...'0123456789'].map((c) => {
    const g = glyphs[c];
    if (!g) throw new Error(`字形表里没有 ${c}`);
    const w = (g[0]?.length ?? 0) * PX + grow;
    // 窄字（1）在等宽格里稍微靠右，"10" 不会读成 "1 0"
    return rects(g, Math.round((adv - w) / 2 + Math.max(0, 5 * PX + grow - w) / 4), grow);
  });

  // glyf + loca
  const glyf = new Buf();
  const loca: number[] = [0, 0]; // .notdef 是空字形
  let maxPts = 0;
  let maxCtr = 0;
  const bbox = [Infinity, Infinity, -Infinity, -Infinity];
  const lsb: number[] = [0];
  for (const rs of digits) {
    const xs = rs.flatMap((r) => [r[0], r[2]]);
    const ys = rs.flatMap((r) => [r[1], r[3]]);
    const bb = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] as const;
    bbox[0] = Math.min(bbox[0] ?? 0, bb[0]);
    bbox[1] = Math.min(bbox[1] ?? 0, bb[1]);
    bbox[2] = Math.max(bbox[2] ?? 0, bb[2]);
    bbox[3] = Math.max(bbox[3] ?? 0, bb[3]);
    lsb.push(bb[0]);
    glyf.u16(rs.length);
    for (const v of bb) glyf.u16(v);
    for (let i = 0; i < rs.length; i++) glyf.u16(i * 4 + 3);
    glyf.u16(0); // 没有 hinting 指令
    const pts: [number, number][] = rs.flatMap(([x0, y0, x1, y1]): [number, number][] => [
      [x0, y0],
      [x0, y1],
      [x1, y1],
      [x1, y0],
    ]); // 顺时针 = 外轮廓
    for (let i = 0; i < pts.length; i++) glyf.u8(1); // 都在曲线上，坐标用 int16 增量
    let px = 0;
    let py = 0;
    for (const [x] of pts) {
      glyf.u16(x - px);
      px = x;
    }
    for (const [, y] of pts) {
      glyf.u16(y - py);
      py = y;
    }
    glyf.pad4();
    loca.push(glyf.b.length);
    maxPts = Math.max(maxPts, pts.length);
    maxCtr = Math.max(maxCtr, rs.length);
  }
  const nGlyphs = 11;
  const locaB = new Buf();
  for (const v of loca) locaB.u32(v);

  const head = new Buf();
  head.u32(0x00010000);
  head.u32(0x00010000);
  head.u32(0); // checkSumAdjustment，最后填
  head.u32(0x5f0f3cf5);
  head.u16(0b1001); // 基线 y=0、整数 ppem
  head.u16(UPM);
  for (let i = 0; i < 4; i++) head.u32(0); // created / modified
  for (const v of bbox) head.u16(v);
  head.u16(bold ? 1 : 0);
  head.u16(8);
  head.u16(2);
  head.u16(1); // long loca
  head.u16(0);

  const hhea = new Buf();
  hhea.u32(0x00010000);
  hhea.u16(ASC);
  hhea.u16(-DESC);
  hhea.u16(0);
  hhea.u16(adv);
  hhea.u16(Math.min(...lsb.slice(1)));
  hhea.u16(adv - (bbox[2] ?? 0));
  hhea.u16(bbox[2] ?? 0);
  hhea.u16(1);
  hhea.u16(0);
  hhea.u16(0);
  for (let i = 0; i < 4; i++) hhea.u16(0);
  hhea.u16(0);
  hhea.u16(nGlyphs);

  const hmtx = new Buf();
  for (let i = 0; i < nGlyphs; i++) {
    hmtx.u16(adv);
    hmtx.u16(lsb[i] ?? 0);
  }

  const maxp = new Buf();
  maxp.u32(0x00010000);
  maxp.u16(nGlyphs);
  maxp.u16(maxPts);
  maxp.u16(maxCtr);
  maxp.u16(0);
  maxp.u16(0);
  maxp.u16(2);
  for (let i = 0; i < 8; i++) maxp.u16(0);

  const os2 = new Buf();
  os2.u16(4);
  os2.u16(adv);
  os2.u16(bold ? 700 : 400);
  os2.u16(5);
  os2.u16(0);
  for (const v of [650, 700, 0, 140, 650, 700, 0, 480, 100, 300]) os2.u16(v);
  os2.u16(0);
  for (let i = 0; i < 10; i++) os2.u8(0);
  os2.u32(1); // Basic Latin
  for (let i = 0; i < 3; i++) os2.u32(0);
  for (const c of 'TDPX') os2.u8(c.charCodeAt(0));
  os2.u16(bold ? 0x20 : 0x40);
  os2.u16(0x30);
  os2.u16(0x39);
  os2.u16(ASC);
  os2.u16(-DESC);
  os2.u16(0);
  os2.u16(ASC);
  os2.u16(DESC);
  os2.u32(1);
  os2.u32(0);
  os2.u16(500);
  os2.u16(700);
  os2.u16(0);
  os2.u16(0x30);
  os2.u16(0);

  const cmap = new Buf();
  cmap.u16(0);
  cmap.u16(1);
  cmap.u16(3);
  cmap.u16(1);
  cmap.u32(12);
  for (const v of [4, 32, 0, 4, 4, 1, 0]) cmap.u16(v);
  for (const v of [0x39, 0xffff, 0, 0x30, 0xffff, (1 - 0x30) & 0xffff, 1, 0, 0]) cmap.u16(v);

  const sub = bold ? 'Bold' : 'Regular';
  const names: [number, string][] = [
    [1, o.family],
    [2, sub],
    [3, `${o.family} ${sub}`],
    [4, `${o.family} ${sub}`],
    [5, 'Version 1.0'],
    [6, `${o.family.replace(/[^A-Za-z0-9]/g, '')}-${sub}`],
  ];
  const name = new Buf();
  name.u16(0);
  name.u16(names.length);
  name.u16(6 + names.length * 12);
  let off = 0;
  for (const [id, s] of names) {
    for (const v of [3, 1, 0x409, id, s.length * 2, off]) name.u16(v);
    off += s.length * 2;
  }
  for (const [, s] of names) for (const c of s) name.u16(c.charCodeAt(0));

  const post = new Buf();
  post.u32(0x00030000);
  post.u32(0);
  post.u16(-100);
  post.u16(100);
  post.u32(1);
  for (let i = 0; i < 4; i++) post.u32(0);

  const tables: [string, Buf][] = [
    ['OS/2', os2],
    ['cmap', cmap],
    ['glyf', glyf],
    ['head', head],
    ['hhea', hhea],
    ['hmtx', hmtx],
    ['loca', locaB],
    ['maxp', maxp],
    ['name', name],
    ['post', post],
  ];
  const n = tables.length;
  const font = new Buf();
  font.u32(0x00010000);
  font.u16(n);
  font.u16(128); // searchRange = 16 * 8
  font.u16(3);
  font.u16(n * 16 - 128);
  let at = 12 + n * 16;
  const placed: number[] = [];
  for (const [tag, t] of tables) {
    for (const c of tag) font.u8(c.charCodeAt(0));
    font.u32(checksum(t.b));
    font.u32(at);
    font.u32(t.b.length);
    placed.push(at);
    at += Math.ceil(t.b.length / 4) * 4;
  }
  let headAt = 0;
  tables.forEach(([tag, t], i) => {
    if (tag === 'head') headAt = placed[i] ?? 0;
    font.b.push(...t.b);
    font.pad4();
  });
  const adj = (0xb1b0afba - checksum(font.b)) >>> 0;
  font.b[headAt + 8] = adj >>> 24;
  font.b[headAt + 9] = (adj >>> 16) & 0xff;
  font.b[headAt + 10] = (adj >>> 8) & 0xff;
  font.b[headAt + 11] = adj & 0xff;
  return Uint8Array.from(font.b);
}

const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));

/** hud.css 里那两行 @font-face（常规 100–599、粗 600–900），只覆盖数字 U+0030–0039。 */
export function pixelDigitsCss(glyphs: Readonly<Record<string, Glyph>>, family = 'TD Digits'): string {
  const face = (bold: boolean, w: string) =>
    `@font-face{font-family:'${family}';font-weight:${w};font-display:block;unicode-range:U+30-39;src:url(data:font/ttf;base64,${b64(pixelDigitsTtf(glyphs, { family, bold }))}) format('truetype')}`;
  return `${face(false, '100 599')}\n${face(true, '600 900')}`;
}

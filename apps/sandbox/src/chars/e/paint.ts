/**
 * E 方向的上色：每个材质一条 5 级色阶（ramp），由一个基色按"暗部偏冷、亮部偏暖"自动推出来。
 * 字符画只写材质（字母），明暗在拼好整帧以后按光照自动算（光从画面左上来，和场景 LX/LZ 一致）：
 *   0 = 暗边（代替黑描边，用本色最深一级）  1 = 暗部 / 夹缝里的环境光遮蔽  2 = 本色  3 = 受光  4 = 沙漠太阳的轮廓光
 * 小写字母 = 同材质压暗一级（衣褶、裤缝、帽檐下的阴影）。符号是不参与明暗的细节色（眼睛高光、腮红、胡茬、logo……）。
 * 换色 = 换基色，色阶在运行时重新推，所以每个客人仍然可以随机配色。
 */

export type RGB = [number, number, number];

export const hex = (h: string): RGB => {
  const n = Number.parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));

function toHsl([r, g, b]: RGB): [number, number, number] {
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const mx = Math.max(R, G, B);
  const mn = Math.min(R, G, B);
  const l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h = mx === R ? (G - B) / d + (G < B ? 6 : 0) : mx === G ? (B - R) / d + 2 : (R - G) / d + 4;
  h *= 60;
  return [h, s, l];
}
function fromHsl(h: number, s: number, l: number): RGB {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}
/** 色相朝 target 转 amt 度（走近的一边） */
function towards(h: number, target: number, amt: number): number {
  let d = target - h;
  d = ((d + 540) % 360) - 180;
  return h + Math.sign(d) * Math.min(Math.abs(d), amt);
}
export const mix = (a: RGB, b: RGB, t: number): RGB => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t),
];

/** 沙漠太阳的颜色（轮廓光往这里靠） */
const SUN: RGB = hex('#ffe2a4');

/**
 * 一条色阶。kind：skin 的暗部往红走（皮肤下的血色），其余往蓝紫走（沙漠里阴影是天光照的，偏冷）。
 */
export function ramp(base: string, kind: 'cloth' | 'skin' | 'hair' = 'cloth'): RGB[] {
  const c = hex(base);
  const [h, s, l] = toHsl(c);
  const cool = kind === 'skin' ? 345 : 250;
  const sh = kind === 'skin' ? 14 : 22;
  const t0 = fromHsl(towards(h, cool, sh), clamp(s * (kind === 'skin' ? 1.05 : 1.15) + 0.06), clamp(l * 0.45));
  const t1 = fromHsl(towards(h, cool, sh * 0.5), clamp(s * 1.05 + 0.03), clamp(l * 0.72));
  const t3 = fromHsl(towards(h, 48, 7), clamp(s * 1.02), clamp(l * 1.1 + 0.04));
  const t4 = mix(fromHsl(towards(h, 48, 12), clamp(s * 0.95), clamp(l * 1.12 + 0.06)), SUN, 0.2);
  return [t0, t1, c, t3, t4];
}

/** 人物的换色表：槽位字母 → 基色 */
export interface Look {
  /** 皮肤 */
  S: string;
  /** 头发 */
  H: string;
  /** 眉毛（默认 = 头发） */
  Y?: string;
  /** 胡子（默认 = 头发） */
  M?: string;
  /** 眼睛（默认按肤色给深棕） */
  E?: string;
  /** 帽子 */
  P?: string;
  /** 上衣 */
  T: string;
  /** 袖子（默认 = 上衣） */
  L?: string;
  /** 领子、滚边、logo */
  C?: string;
  /** 下装 */
  B: string;
  /** 袜子 */
  K?: string;
  /** 鞋 */
  F: string;
  /** 球拍 */
  Q?: string;
  /** 配饰 1（护膝、肌贴、围裙、头巾……） */
  X?: string;
  /** 配饰 2（包带、相机、挂绳……） */
  Z?: string;
  /** 眼镜框 */
  G?: string;
  /** 腰带 */
  R?: string;
}

/** 可以换色的材质字母（大写）。其余字母不用。 */
const SLOTS = 'SHYMEPTLCBKFQXZGR';

/** 不参与明暗的细节色：符号 → 颜色（有的从换色表推出来） */
function fixed(look: Look): Record<string, RGB> {
  const skin = hex(look.S);
  const [, , sl] = toHsl(skin);
  const beard = hex(look.M ?? look.H);
  const trim = hex(look.C ?? '#ffffff');
  return {
    '*': [255, 250, 238],
    '+': mix(skin, [222, 96, 92], sl > 0.5 ? 0.32 : 0.22),
    ':': mix(skin, beard, 0.45),
    '~': mix(skin, [90, 40, 50], 0.28),
    '=': mix(skin, [160, 64, 78], 0.4),
    '#': trim,
    '1': mix(trim, [255, 255, 255], 0.3),
    '%': [214, 244, 255],
    '@': [196, 202, 210],
    '&': [246, 242, 230],
    $: [122, 84, 52],
    '^': [140, 236, 240],
    '!': [38, 34, 52],
    '?': [222, 240, 60],
    '<': [236, 232, 220],
    '"': [220, 240, 255],
    '-': [70, 58, 66],
    '/': [232, 72, 56],
    '|': [60, 110, 190],
  };
}

/** 一个人的全部色阶：材质字母 → 5 级 */
export function paletteFor(look: Look): { ramps: Record<string, RGB[]>; fixed: Record<string, RGB> } {
  const ramps: Record<string, RGB[]> = {};
  const get = (k: string): string | undefined => (look as unknown as Record<string, string | undefined>)[k];
  const skinL = toHsl(hex(look.S))[2];
  const eye = look.E ?? (skinL < 0.42 ? '#1c1418' : '#3a2620');
  for (const k of SLOTS) {
    const v =
      get(k) ??
      (k === 'Y' || k === 'M'
        ? look.H
        : k === 'L'
          ? look.T
          : k === 'E'
            ? eye
            : k === 'K'
              ? '#f2efe6'
              : k === 'Q'
                ? '#3a3f4a'
                : k === 'C'
                  ? '#f2efe6'
                  : k === 'G'
                    ? '#2a2630'
                    : k === 'R'
                      ? '#3a2a20'
                      : '#888888');
    ramps[k] = ramp(v, k === 'S' ? 'skin' : k === 'H' || k === 'Y' || k === 'M' ? 'hair' : 'cloth');
  }
  return { ramps, fixed: fixed(look) };
}

/**
 * 拼好的一帧（材质图）：每个像素一个材质字符，加上它来自哪个部件（z 越大越靠前），给环境光遮蔽用。
 */
export interface MatMap {
  w: number;
  h: number;
  /** 材质字符，'.' 透明 */
  m: string[];
  /** 部件层号（越大越在前） */
  z: Int16Array;
  /** 锚点（两脚中间的地面像素） */
  ox: number;
  oy: number;
}

export function newMap(w: number, h: number, ox: number, oy: number): MatMap {
  return { w, h, m: new Array(w * h).fill('.'), z: new Int16Array(w * h), ox, oy };
}

const isSlot = (c: string) => c !== '.' && /[A-Za-z]/.test(c);

/**
 * 明暗：按位置给每个材质像素一个 0..4 的级。
 * - 左边挨着空白：轮廓光 4；左边第二格：受光 3
 * - 右边挨着空白：暗边 0；右边第二格：暗部 1
 * - 上面挨着空白：至少 3（顶光）；下面挨着空白：至多 1
 * - 挨着一个更靠前的部件（手臂压在身上、下巴压在脖子上）：至多 1（环境光遮蔽）
 * - 小写字母：再压一级
 */
export function shade(mm: MatMap, mirrorLight = false): Int8Array {
  const { w, h, m, z } = mm;
  const t = new Int8Array(w * h);
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? '.' : m[y * w + x]);
  const zt = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? -1 : z[y * w + x]);
  // 光从左来；镜像（朝左的帧画好以后翻过去）时不用，因为我们在翻转后的图上重新算
  const L = mirrorLight ? 1 : -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = m[y * w + x];
      if (!isSlot(c)) continue;
      let v = 2;
      const up = c.toUpperCase();
      const sameish = (q: string) => q.toUpperCase() === up;
      if (at(x + L, y) === '.') v = 4;
      else if (at(x + 2 * L, y) === '.') v = 3;
      if (at(x - L, y) === '.') v = 0;
      else if (at(x - 2 * L, y) === '.' && v === 2) v = 1;
      if (at(x, y - 1) === '.' && v >= 1 && v < 3) v = 3;
      if (at(x, y + 1) === '.' && v > 1) v = 1;
      // 夹缝：相邻像素来自更靠前的另一个部件
      const zz = z[y * w + x];
      let ao = false;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, -1],
        [0, 1],
      ] as const) {
        const q = at(x + dx, y + dy);
        if (q === '.' || !isSlot(q)) continue;
        if (zt(x + dx, y + dy) > zz && !(sameish(q) && up === 'S' && dy !== 0)) ao = true;
      }
      if (ao && v > 1) v = 1;
      if (c !== up) v -= 1;
      t[y * w + x] = Math.max(0, Math.min(4, v));
    }
  return t;
}

/** 材质图 + 换色 → RGBA（Uint32，ABGR，和 ImageData / @td/iso 的 BakedArt 一致） */
export function bake(mm: MatMap, look: Look, mirrorLight = false): Uint32Array {
  const { ramps, fixed: fx } = paletteFor(look);
  const t = shade(mm, mirrorLight);
  const out = new Uint32Array(mm.w * mm.h);
  for (let i = 0; i < out.length; i++) {
    const c = mm.m[i];
    if (c === '.') continue;
    let rgb: RGB | undefined;
    if (isSlot(c)) {
      const r = ramps[c.toUpperCase()];
      rgb = r ? r[t[i]] : undefined;
    } else rgb = fx[c];
    if (!rgb) continue;
    out[i] = (255 << 24) | (rgb[2] << 16) | (rgb[1] << 8) | rgb[0];
  }
  return out;
}

/** 水平翻转材质图（朝左的两个方向）；翻转后重新算明暗，光还是从左边来 */
export function flipMap(mm: MatMap): MatMap {
  const o = newMap(mm.w, mm.h, mm.w - mm.ox, mm.oy);
  for (let y = 0; y < mm.h; y++)
    for (let x = 0; x < mm.w; x++) {
      o.m[y * mm.w + (mm.w - 1 - x)] = mm.m[y * mm.w + x];
      o.z[y * mm.w + (mm.w - 1 - x)] = mm.z[y * mm.w + x];
    }
  return o;
}

/** 裁到包围盒（锚点跟着挪） */
export function cropMap(mm: MatMap, pad = 1): MatMap {
  let x0 = mm.w;
  let y0 = mm.h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < mm.h; y++)
    for (let x = 0; x < mm.w; x++)
      if (mm.m[y * mm.w + x] !== '.') {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) return mm;
  x0 = Math.max(0, x0 - pad);
  y0 = Math.max(0, y0 - pad);
  x1 = Math.min(mm.w - 1, x1 + pad);
  y1 = Math.max(y1, mm.oy);
  const w = x1 - x0 + 1;
  const h = Math.min(mm.h, y1 + 1) - y0;
  const o = newMap(w, h, mm.ox - x0, mm.oy - y0);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      o.m[y * w + x] = mm.m[(y + y0) * mm.w + x + x0];
      o.z[y * w + x] = mm.z[(y + y0) * mm.w + x + x0];
    }
  return o;
}

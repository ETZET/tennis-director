// 像素肖像：按 CastLook 画 32×32 的胸像（canvas → dataURL，按 id 缓存；界面里按 2×/3×/4× 放大，image-rendering: pixelated）。
// 色阶同 3D（clubsite/cast/colors.ts 的 [亮, 中, 暗]）：光从左上来，左上用亮档、身子主体中档、右边和下面暗档（暗档偏紫）。
// 发型 9 种、帽子 5 种和 dress.ts 的 3D 对得上；孩子头大身子小，老人两道皱纹、鬓角白。同一个人永远同一张（只读 look 和 age，不随机）。
import { CLOTH, EYE, HAIR, hex, type Ramp3, SKIN } from '../../clubsite/cast/colors';
import type { CastLook, Cloth } from '../../clubsite/cast/types';

const N = 32;
/** 描边（深紫，同场景的描边色调） */
const LINE = 0x1a1224;

interface Spec {
  look: CastLook;
  age: number;
}

const cache = new Map<string, string>();

/** 这个人的肖像（dataURL）；key = 人的 id（同一个 id 永远同一张） */
export function portraitURL(key: string, look: CastLook, age: number): string {
  let u = cache.get(key);
  if (!u) {
    u = draw({ look, age }).toDataURL();
    cache.set(key, u);
  }
  return u;
}

/** 招牌色（不给 = 衣服色） */
export const accentOf = (look: CastLook): Cloth => look.accent ?? look.shirt;

/** 招牌色压暗（肖像底色、名册行的色条） */
export function accentDark(look: CastLook, k = 0.55): string {
  return hex(mul(CLOTH[accentOf(look)][2], k));
}
export function accentMid(look: CastLook): string {
  return hex(CLOTH[accentOf(look)][1]);
}
/** 招牌色的亮档够不够亮（上面写深色字） */
export function isLight(look: CastLook): boolean {
  const c = CLOTH[accentOf(look)][0];
  const y = 0.3 * ((c >> 16) & 255) + 0.59 * ((c >> 8) & 255) + 0.11 * (c & 255);
  return y > 150;
}
export function accentLight(look: CastLook): string {
  return hex(CLOTH[accentOf(look)][0]);
}

function mul(c: number, k: number): number {
  const r = Math.round(((c >> 16) & 255) * k);
  const g = Math.round(((c >> 8) & 255) * k);
  const b = Math.round((c & 255) * k);
  return (r << 16) | (g << 8) | b;
}

function draw(sp: Spec): HTMLCanvasElement {
  const { look, age } = sp;
  const px = new Int32Array(N * N).fill(-1);
  const set = (x: number, y: number, c: number) => {
    if (x < 0 || y < 0 || x >= N || y >= N) return;
    px[y * N + x] = c;
  };
  const get = (x: number, y: number) => (x < 0 || y < 0 || x >= N || y >= N ? -1 : px[y * N + x]);
  const rect = (x0: number, y0: number, w: number, h: number, c: number) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) set(x, y, c);
  };

  const kid = look.body === 'kid';
  const teen = look.body === 'teen';
  const old = age >= 62;
  const skin = SKIN[look.skin];
  const hair = HAIR[look.hair];
  const shirt = keepAware(look, 'shirt');
  const trimC = look.trim ? CLOTH[look.trim] : null;

  // ── 尺寸：头（左上角 hx, hy，宽 hw，高 hh），身子从 by 开始 ──
  const hw = kid ? 16 : teen ? 14 : 12;
  const hh = kid ? 15 : teen ? 14 : 13;
  const hx = 16 - hw / 2;
  const hy = kid ? 6 : teen ? 7 : 8;
  const by = hy + hh + (kid ? 1 : 2);
  const stout = look.stout ?? 1;
  const halfW = Math.round((kid ? 8 : teen ? 10 : 11) * Math.min(1.25, Math.max(0.9, stout)));

  // ── 身子（肩膀圆角、左亮右暗）──
  const sx0 = 16 - halfW;
  const sx1 = 16 + halfW; // 不含
  for (let y = by; y < N; y++) {
    const inset = y === by ? 3 : y === by + 1 ? 1 : 0;
    for (let x = sx0 + inset; x < sx1 - inset; x++) {
      const t = (x - sx0) / (sx1 - sx0);
      const c = t < 0.22 || y === by ? shirt[0] : t > 0.8 ? shirt[2] : shirt[1];
      set(x, y, c);
    }
  }
  // 胳膊和身子的分界（暗线）；短袖 = 袖口下面露手臂
  const armX0 = sx0 + 3;
  const armX1 = sx1 - 4;
  for (let y = by + 3; y < N; y++) {
    set(armX0, y, shirt[2]);
    set(armX1, y, shirt[2]);
  }
  if (!look.longSleeves) {
    const sl = by + 6;
    for (let y = sl; y < N; y++) {
      for (let x = sx0 + (y === sl ? 1 : 0); x < armX0; x++) set(x, y, x === sx0 ? skin[1] : skin[0]);
      for (let x = armX1 + 1; x < sx1 - (y === sl ? 1 : 0); x++) set(x, y, x >= sx1 - 2 ? skin[2] : skin[1]);
    }
    if (trimC) {
      for (let x = sx0 + 1; x < armX0; x++) set(x, sl - 1, trimC[1]);
      for (let x = armX1 + 1; x < sx1 - 1; x++) set(x, sl - 1, trimC[1]);
    }
  }
  // 脖子
  const nw = kid ? 4 : 4;
  rect(16 - nw / 2, by - 2, nw, 3, skin[1]);
  set(16 + nw / 2 - 1, by - 2, skin[2]);
  set(16 + nw / 2 - 1, by - 1, skin[2]);
  // 领口：有滚边 = Polo 领（两片翻领），没有 = 圆领
  if (trimC) {
    set(16 - 3, by, trimC[0]);
    set(16 - 2, by, trimC[0]);
    set(16 - 2, by + 1, trimC[0]);
    set(16 + 1, by, trimC[1]);
    set(16 + 2, by, trimC[1]);
    set(16 + 1, by + 1, trimC[1]);
    set(16 - 1, by + 1, shirt[2]);
    set(16, by + 1, shirt[2]);
    set(16, by + 2, trimC[1]);
    set(16, by + 3, trimC[1]);
  } else {
    set(16 - 2, by, skin[1]);
    set(16 - 1, by, skin[1]);
    set(16, by, skin[1]);
    set(16 + 1, by, skin[2]);
  }
  // 哨子（教练）
  if (look.keep?.includes('whistle')) {
    for (let y = by; y < by + 5; y++) set(16 - 3 + Math.floor((y - by) / 2), y, 0xf4f0e8);
    for (let y = by; y < by + 5; y++) set(16 + 2 - Math.floor((y - by) / 2), y, 0xf4f0e8);
    rect(15, by + 5, 2, 2, 0xc6bcd4);
    set(15, by + 5, 0xf4f0e8);
  }

  // ── 头（圆角矩形，左上亮、右侧和下巴暗）──
  for (let y = hy; y < hy + hh; y++) {
    const fromTop = y - hy;
    const fromBot = hy + hh - 1 - y;
    const inset = fromTop === 0 ? 3 : fromTop === 1 ? 1 : fromBot === 0 ? 3 : fromBot === 1 ? 1 : 0;
    for (let x = hx + inset; x < hx + hw - inset; x++) {
      const right = x >= hx + hw - 2 - (fromBot <= 2 ? 1 : 0);
      set(x, y, right || fromBot === 0 ? skin[1] : skin[0]);
    }
  }
  // 耳朵
  const earY = hy + Math.round(hh * 0.45);
  rect(hx - 1, earY, 1, 3, skin[1]);
  rect(hx + hw, earY, 1, 3, skin[2]);

  // 眼睛、眉毛、嘴
  const eyeY = hy + Math.round(hh * (kid ? 0.55 : 0.52));
  const eyeDx = kid ? 4 : 3;
  const eL = 16 - eyeDx - 1;
  const eR = 16 + eyeDx;
  const eh = kid ? 2 : 2;
  rect(eL, eyeY, 1, eh, EYE[1]);
  rect(eR, eyeY, 1, eh, EYE[1]);
  if (kid) {
    set(eL - 1, eyeY, EYE[1]);
    set(eR + 1, eyeY, EYE[1]);
    set(eL, eyeY, 0xf4f0e8);
    set(eR + 1, eyeY, 0xf4f0e8);
  }
  if (!kid) {
    const browC = old ? HAIR.gray[1] : hair[1];
    rect(eL - 1, eyeY - 2, 2, 1, browC);
    rect(eR, eyeY - 2, 2, 1, browC);
  }
  // 鼻子（一点暗）、嘴
  set(16, eyeY + 2, skin[1]);
  const mouthY = eyeY + (kid ? 4 : 4);
  rect(15, mouthY, 2, 1, mul(skin[2], 1.1));
  if (kid) {
    // 红脸蛋
    set(eL - 1, eyeY + 2, CLOTH.coral[0]);
    set(eR + 1, eyeY + 2, CLOTH.coral[1]);
  }
  // 老人：两道皱纹（眼角、额头）
  if (old) {
    set(eL - 2, eyeY + 1, skin[1]);
    set(eR + 2, eyeY + 1, skin[2]);
    rect(14, hy + 3, 4, 1, skin[1]);
  }
  // 胡子
  if (look.facial === 'mustache') {
    rect(14, mouthY - 1, 4, 1, hair[1]);
    set(13, mouthY, hair[2]);
    set(18, mouthY, hair[2]);
  } else if (look.facial === 'beard') {
    for (let y = mouthY - 1; y < hy + hh; y++) {
      const edge = y >= hy + hh - 1 ? 3 : y >= hy + hh - 2 ? 1 : 0;
      for (let x = hx + 1 + edge; x < hx + hw - 1 - edge; x++) {
        if (y === mouthY && x >= 15 && x <= 16) continue;
        set(x, y, x > 18 ? hair[2] : hair[1]);
      }
    }
    for (let y = eyeY + 2; y < mouthY - 1; y++) {
      set(hx, y, hair[1]);
      set(hx + hw - 1, y, hair[2]);
    }
    rect(15, mouthY, 2, 1, mul(skin[2], 1.1));
  }
  // 眼镜 / 太阳镜
  if (look.eyes === 'glasses') {
    const fc = 0x3a3444;
    for (const ex of [eL, eR]) {
      rect(ex - 1, eyeY - 1, 3, 1, fc);
      rect(ex - 1, eyeY + 2, 3, 1, fc);
      set(ex - 2, eyeY, fc);
      set(ex - 2, eyeY + 1, fc);
      set(ex + 2, eyeY, fc);
      set(ex + 2, eyeY + 1, fc);
    }
    for (let x = eL + 2; x < eR - 1; x++) set(x, eyeY, fc);
  } else if (look.eyes === 'shades') {
    rect(eL - 2, eyeY - 1, 4, 3, 0x28243a);
    rect(eR - 1, eyeY - 1, 4, 3, 0x28243a);
    for (let x = eL + 2; x < eR - 1; x++) set(x, eyeY - 1, 0x28243a);
    set(eL - 1, eyeY - 1, 0x5e5a6e);
    set(eR, eyeY - 1, 0x5e5a6e);
  }

  // ── 头发 ──
  drawHair(look, hair, { hx, hy, hw, hh, eyeY, set, get, rect, kid });
  // 老人鬓角白
  if (old && look.hair !== 'white' && look.hair !== 'gray' && look.hairStyle !== 'bald') {
    set(hx, eyeY - 1, HAIR.gray[0]);
    set(hx + hw - 1, eyeY - 1, HAIR.gray[1]);
  }

  // ── 帽子 ──
  if (look.hat) drawHat(look.hat.kind, CLOTH[look.hat.color], { hx, hy, hw, set, rect });

  // ── 描边：空格子挨着画了的格子 → 描边色 ──
  const out = new Int32Array(px);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      if (get(x, y) !== -1) continue;
      if (get(x - 1, y) !== -1 || get(x + 1, y) !== -1 || get(x, y - 1) !== -1 || get(x, y + 1) !== -1)
        out[y * N + x] = LINE;
    }

  // ── 合成：底色 = 招牌色压暗，左上一块稍亮（光） ──
  const bgD = mul(CLOTH[accentOf(look)][2], 0.62);
  const bgL = mul(CLOTH[accentOf(look)][2], 0.8);
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const img = g.createImageData(N, N);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      let v = out[y * N + x];
      if (v === -1) v = x + y < 22 || (x + y < 26 && (x + y) % 2 === 0) ? bgL : bgD;
      const i = (y * N + x) * 4;
      img.data[i] = (v >> 16) & 255;
      img.data[i + 1] = (v >> 8) & 255;
      img.data[i + 2] = v & 255;
      img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  return c;
}

/** 制服里保留场景原样的部位：肖像照样按 look 的颜色画（数据层给的颜色就是制服色） */
function keepAware(look: CastLook, _part: 'shirt'): Ramp3 {
  return CLOTH[look.shirt];
}

interface HairCtx {
  hx: number;
  hy: number;
  hw: number;
  hh: number;
  eyeY: number;
  kid: boolean;
  set(x: number, y: number, c: number): void;
  get(x: number, y: number): number;
  rect(x0: number, y0: number, w: number, h: number, c: number): void;
}

function drawHair(look: CastLook, H: Ramp3, k: HairCtx) {
  const { hx, hy, hw, hh, eyeY, set, rect } = k;
  const x1 = hx + hw - 1;
  /** 头顶一片（rows 行），左亮右暗 */
  const top = (rows: number, over = 1) => {
    for (let r = -over; r < rows; r++) {
      const y = hy + r;
      const inset = r === -over ? 3 : r === -over + 1 ? 1 : 0;
      for (let x = hx + inset; x <= x1 - inset; x++) {
        const t = (x - hx) / hw;
        set(x, y, r <= -over + 1 && t < 0.5 ? H[0] : t > 0.75 ? H[2] : H[1]);
      }
    }
  };
  /** 两侧垂下来（从 y0 到 y1，宽 w） */
  const sides = (y0: number, y1: number, w: number, out = 1) => {
    for (let y = y0; y <= y1; y++) {
      for (let i = 0; i < w; i++) {
        set(hx - out + i, y, H[1]);
        set(x1 + out - i, y, H[2]);
      }
    }
  };
  /** 刘海（额头上一排，偶数格往下多一格） */
  const bangs = (rows: number) => {
    for (let x = hx + 1; x < x1; x++) {
      const extra = (x * 7) % 3 === 0 ? 1 : 0;
      for (let y = hy + 1; y < hy + 1 + rows + extra; y++) set(x, y, x > x1 - 3 ? H[2] : H[1]);
    }
  };
  switch (look.hairStyle) {
    case 'bald': {
      // 只剩两侧一圈
      rect(hx, eyeY - 2, 1, 4, H[1]);
      rect(x1, eyeY - 2, 1, 4, H[2]);
      rect(hx + 1, eyeY - 2, 1, 2, H[1]);
      rect(x1 - 1, eyeY - 2, 1, 2, H[2]);
      break;
    }
    case 'buzz': {
      for (let r = 0; r < 3; r++) {
        const inset = r === 0 ? 3 : r === 1 ? 1 : 0;
        for (let x = hx + inset; x <= x1 - inset; x++) set(x, hy + r, (x + r) % 2 === 0 ? H[1] : H[2]);
      }
      rect(hx, hy + 3, 1, eyeY - hy - 3, H[1]);
      rect(x1, hy + 3, 1, eyeY - hy - 3, H[2]);
      break;
    }
    case 'short': {
      top(3);
      bangs(1);
      sides(hy + 3, eyeY - 1, 1, 0);
      break;
    }
    case 'ponytail': {
      top(3);
      bangs(1);
      sides(hy + 3, eyeY, 1, 0);
      // 马尾从右后方甩出来
      for (let y = hy + 3; y < hy + hh + 3; y++) {
        const x = x1 + 1 + (y > hy + 6 ? 1 : 0);
        set(x, y, H[1]);
        set(x + 1, y, y > hy + 5 ? H[2] : H[1]);
      }
      set(x1 + 1, hy + 2, CLOTH.red[1]);
      break;
    }
    case 'bun': {
      top(3);
      bangs(1);
      sides(hy + 3, eyeY - 1, 1, 0);
      // 头顶发髻
      rect(14, hy - 5, 4, 4, H[1]);
      rect(14, hy - 5, 2, 2, H[0]);
      set(17, hy - 3, H[2]);
      set(17, hy - 2, H[2]);
      break;
    }
    case 'long': {
      top(3);
      bangs(2);
      // 披肩：两侧一直垂到肩下
      for (let y = hy + 2; y < hy + hh + 7; y++) {
        const w = y > hy + hh ? 3 : 2;
        for (let i = 0; i < w; i++) {
          set(hx - 1 + i - (y > hy + hh ? 1 : 0), y, i === 0 ? H[0] : H[1]);
          set(x1 + 1 - i + (y > hy + hh ? 1 : 0), y, H[2]);
        }
      }
      break;
    }
    case 'bob': {
      top(3);
      bangs(2);
      for (let y = hy + 2; y <= hy + hh - 2; y++) {
        set(hx - 1, y, H[1]);
        set(hx, y, H[0]);
        set(x1, y, H[2]);
        set(x1 + 1, y, H[2]);
      }
      rect(hx - 1, hy + hh - 2, 3, 1, H[1]);
      rect(x1 - 1, hy + hh - 2, 3, 1, H[2]);
      break;
    }
    case 'curly': {
      // 蓬松：外圈比头大两格，格子交错有卷的质感
      for (let r = -3; r < 4; r++) {
        const y = hy + r;
        const inset = r === -3 ? 4 : r === -2 ? 2 : r === -1 ? 1 : 0;
        for (let x = hx - 2 + inset; x <= x1 + 2 - inset; x++) {
          const t = (x - hx) / hw;
          const tone = (x + y) % 3 === 0 ? H[2] : t < 0.45 && r < 0 ? H[0] : H[1];
          set(x, y, t > 0.8 && tone !== H[2] ? H[2] : tone);
        }
      }
      for (let y = hy + 4; y <= eyeY + 2; y++) {
        set(hx - 2, y, y % 2 === 0 ? H[1] : H[2]);
        set(hx - 1, y, H[1]);
        set(x1 + 1, y, H[2]);
        set(x1 + 2, y, y % 2 === 0 ? H[2] : H[1]);
      }
      break;
    }
    case 'braids': {
      top(3);
      bangs(1);
      sides(hy + 3, eyeY, 1, 0);
      // 两条辫子垂到胸前
      for (let y = eyeY - 1; y < hy + hh + 8; y++) {
        const c = y % 2 === 0 ? H[1] : H[2];
        set(hx - 2, y, c);
        set(hx - 1, y, y % 2 === 0 ? H[0] : H[1]);
        set(x1 + 1, y, c);
        set(x1 + 2, y, H[2]);
      }
      set(hx - 2, hy + hh + 8, CLOTH.yellow[0]);
      set(hx - 1, hy + hh + 8, CLOTH.yellow[1]);
      set(x1 + 1, hy + hh + 8, CLOTH.yellow[1]);
      set(x1 + 2, hy + hh + 8, CLOTH.yellow[2]);
      break;
    }
  }
}

function drawHat(
  kind: NonNullable<CastLook['hat']>['kind'],
  C: Ramp3,
  k: {
    hx: number;
    hy: number;
    hw: number;
    set(x: number, y: number, c: number): void;
    rect(x0: number, y0: number, w: number, h: number, c: number): void;
  },
) {
  const { hx, hy, hw, set, rect } = k;
  const x1 = hx + hw - 1;
  const crown = (rows: number, lift: number) => {
    for (let r = 0; r < rows; r++) {
      const y = hy - lift + r;
      const inset = r === 0 ? 2 : r === 1 ? 1 : 0;
      for (let x = hx - 1 + inset; x <= x1 + 1 - inset; x++) {
        const t = (x - hx) / hw;
        set(x, y, t < 0.4 && r < 2 ? C[0] : t > 0.78 ? C[2] : C[1]);
      }
    }
  };
  switch (kind) {
    case 'cap': {
      crown(5, 2);
      // 帽檐朝前：额头上一条，比头宽一点，下面一排暗
      rect(hx - 1, hy + 3, hw + 3, 1, C[0]);
      rect(hx, hy + 4, hw + 2, 1, C[2]);
      set(16, hy - 1, C[2]);
      break;
    }
    case 'visor': {
      rect(hx - 1, hy + 1, hw + 2, 2, C[1]);
      rect(hx - 1, hy + 1, 5, 1, C[0]);
      rect(hx - 2, hy + 3, hw + 4, 1, C[0]);
      rect(hx - 1, hy + 4, hw + 2, 1, C[2]);
      break;
    }
    case 'bucket': {
      crown(5, 3);
      // 帽檐往两边垂
      rect(hx - 3, hy + 2, hw + 6, 1, C[1]);
      rect(hx - 3, hy + 2, 6, 1, C[0]);
      rect(hx - 4, hy + 3, 3, 1, C[1]);
      rect(x1 + 2, hy + 3, 3, 1, C[2]);
      rect(hx - 1, hy + 3, hw + 2, 1, C[2]);
      break;
    }
    case 'straw': {
      crown(4, 4);
      rect(hx - 1, hy - 1, hw + 2, 1, CLOTH.red[1]); // 帽带
      rect(hx - 6, hy, hw + 12, 2, C[1]);
      rect(hx - 6, hy, 9, 1, C[0]);
      rect(hx - 5, hy + 2, hw + 10, 1, C[2]);
      break;
    }
    case 'headband': {
      rect(hx, hy + 2, hw, 2, C[1]);
      rect(hx, hy + 2, 4, 1, C[0]);
      rect(x1 - 1, hy + 2, 2, 2, C[2]);
      break;
    }
  }
}

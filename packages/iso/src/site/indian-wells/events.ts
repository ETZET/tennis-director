import { mulberry32 } from '@td/shared';
import { CLIPBOARD, CLUB_GOLD, CLUB_GREEN, DRAW_BOARD, LUCK_BOARD, MENU_BOARD } from '../../art/events';
import type { PixelArt, SlotColors } from '../../art/format';
import { ADULT } from '../../art/people';
import { bakeArt } from '../../core/art';
import { hash } from '../../core/color';
import { type BakedArt, Custom, type DrawContext, type Node } from '../../core/graph';
import { HV } from '../../core/proj';
import { type Bounds, type Draw, dark, type Lamp, type Weather } from './common';
import type { Cast } from './ground';
import { box, cyl, faceF, fq, type Pt, stripeSh, wp } from './kit';
import { F_O1, F_O2, F_O3, F_P1, F_P2, F_S1 } from './layout';
import type { Facilities } from './state';

/**
 * 赛事日的布置（wave2-5-contract.md 的 `event(anchor, kind)`；ART-15）。
 * 演出（比赛、开放日）是活动动画库的事；这里是演出四周那一套静态、半静态的东西：彩旗、签到桌、签表板、
 * 看台上的观众、拱门、赞助牌、餐饮摊、送行的小巴。表演赛的四期筹备（`prep`）在 prep.ts，两边共用这里的小工具。
 *
 * 每种赛事按地点拆成几"块"（part），几处同时有赛事时同一块只建一次：
 * - cup_monthly 月度杯（会员场 / 红土场）：场边彩旗、签到桌和夹板、签表板、长凳上几个观众。
 * - invitational 邀请赛（红土场 + 会所 + 棕榈喷泉）：场边临时看台坐满人、赞助牌、俱乐部色的彩旗、
 *   大门外的充气拱门、会所门前一排旗杆和塔楼上的长条幅、喷泉边的餐饮帐篷。挂在球场地点上时整套都摆出来；
 *   单独挂在 clubhouse / plaza / entrance 上时只摆那一块。红土变体是红土色点缀，硬地变体是藏青。
 * - regional_open / junior_regional 外出赛（大门）：门外一块"祝好运"牌、车道上一辆等着出发的小巴
 *   （青少年赛牌子上再系三个气球）。
 * - exhibition 表演赛（中心球场，最大的一套）：几面看台坐满人（会掀人浪）、拱门、长廊上的彩旗、
 *   天上一艘小飞艇、夜里两道探照灯；筹备做完的那几期（加建的看台、灯塔、转播）一起用上。
 *
 * 会动的（旗子、观众、飞艇、气球、探照灯）放动态层，每帧只画不重建；其余是静态节点。
 * 设、撤赛事时整层重建一次（各块用自己的种子随机流，结果确定）。没有赛事、没有筹备时什么也不建，默认画面不变。
 * 观众、小巴只是布景，不是模拟里的人；演出随机只决定画面。
 */

/* ---------------- 布置层的构建工具 ---------------- */

export interface ShowOut {
  statics: Node[];
  dynamic: Node[];
  lamps: Lamp[];
  casts: Cast[];
}

export interface ShowKit {
  add(b: Bounds, draw: Draw): Custom;
  addDyn(b: Bounds, draw: Draw): Custom;
  lampAt(l: Lamp): void;
  cast(c: Cast): void;
  readonly wx: Weather;
}

export function showKit(wx: Weather, out: ShowOut): ShowKit {
  const mk = (b: Bounds, draw: Draw) => new Custom((r) => draw(r), { ...b });
  return {
    add(b, draw) {
      const n = mk(b, draw);
      out.statics.push(n);
      return n;
    },
    addDyn(b, draw) {
      const n = mk(b, draw);
      out.dynamic.push(n);
      return n;
    },
    lampAt: (l) => out.lamps.push(l),
    cast: (c) => out.casts.push(c),
    wx,
  };
}

/** 世界里一米高是多少缓冲像素 */
const pxM = (r: DrawContext) => r.k * HV;

/** 立着朝镜头的小招牌 / 小道具（精灵，按 spriteScale 放大） */
export function sprite(K: ShowKit, art: PixelArt, x: number, y: number, z: number, e = 0.4): void {
  const baked = bakeArt(art);
  K.add({ x0: x - e, x1: x + e, z0: z - e, z1: z + e, y0: y, y1: y + 2 }, (r) =>
    r.art(baked, x, y, z, { lit: r.litAt(x, z) }),
  );
}

/** 一根木桩，顶上一截橙色测量带（筹备"已挂出、还没做"的记号） */
export function stake(K: ShowKit, x: number, z: number): void {
  K.add({ x0: x - 0.1, x1: x + 0.1, z0: z - 0.1, z1: z + 0.1, y0: 0, y1: 1.3 }, (r) => {
    const lit = r.litAt(x, z);
    const b = r.P(x, 0, z);
    const t = r.P(x, 1.1, z);
    const s = r.spriteScale;
    r.line(b[0], b[1], t[0], t[1], r.col('#a8743c', 1, lit), s);
    r.rect(Math.round(t[0]), Math.round(t[1]) - s, s, s, r.col('#f6f3ea', 1, lit));
    // 一面橙色小旗（3×2 像素），下面再缠一道测量带
    const c = r.col('#ff7a2e', 1, lit);
    r.rect(Math.round(t[0]) + s, Math.round(t[1]), 3 * s, 2 * s, c);
    r.rect(Math.round(t[0]) + s, Math.round(t[1]) + 2 * s, 2 * s, s, r.col('#ff7a2e', 0.75, lit));
  });
}

/** 长凳（ax 'x' 沿 x 放、'z' 沿 z 放），h 座面高 */
export function bench(K: ShowKit, x: number, z: number, half: number, ax: 'x' | 'z', h = 0.45, c = '#8a5a32'): void {
  const w = ax === 'x' ? half : 0.25;
  const d = ax === 'x' ? 0.25 : half;
  K.add({ x0: x - w, x1: x + w, z0: z - d, z1: z + d, y0: 0, y1: h }, (r) => {
    const lit = r.litAt(x, z);
    const lc = r.col('#3a3a42', 1, lit);
    for (const [dx, dz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as const)
      r.wline([x + dx * (w - 0.1), 0, z + dz * (d - 0.08)], [x + dx * (w - 0.1), h - 0.1, z + dz * (d - 0.08)], lc);
    box(r, x - w, x + w, z - d, z + d, h - 0.12, h, c, { lit, top: '#b07a48', edge: false });
  });
}

/** 旗杆和一面旗（动态：随风飘，画法同 build.ts 的 flag） */
export function flag(K: ShowKit, x: number, z: number, h: number, c1: string, c2: string): void {
  const wx = K.wx;
  K.addDyn({ x0: x - 0.1, x1: x + 0.1, z0: z - 0.1, z1: z + 0.1, y0: 0, y1: h + 1 }, (r) => {
    const lit = r.litAt(x, z);
    const b = r.P(x, 0, z);
    const t = r.P(x, h, z);
    r.line(b[0], b[1], t[0], t[1], r.col('#d8d8d8', 0.8, lit));
    r.pix(t[0], t[1] - 1, r.col(CLUB_GOLD, 1, lit));
    const fw = Math.max(4, Math.round(r.k * 1.6));
    const fh = Math.max(3, Math.round(r.k * 0.9));
    const A = r.col(c1, 1, lit);
    const B = r.col(c2, 1, lit);
    const wind = 0.4 + wx.wind;
    for (let i = 1; i <= fw; i++) {
      const dy = Math.round(Math.sin(r.t * (3 + 4 * wx.wind) - i * 0.7 + x + z) * r.k * 0.3 * wind * (i / fw));
      for (let j = 0; j < fh; j++) r.pix(t[0] + i, t[1] + j + dy, j < fh / 2 ? A : B);
    }
  });
}

/**
 * 一串三角彩旗：pts 是挂点（世界 x, z），y 挂点高，每段中间往下兜 sag 米。
 * 小旗按屏幕像素画（3 像素宽，随 spriteScale 放大），远看也是一串彩点；颜色按 cols 轮换。
 * yb 见下。
 */
export function bunting(
  K: ShowKit,
  pts: readonly (readonly [number, number])[],
  y: number,
  cols: readonly string[],
  sag = 0.6,
  yb?: number,
): void {
  let x0 = 1e9;
  let x1 = -1e9;
  let z0 = 1e9;
  let z1 = -1e9;
  for (const p of pts) {
    x0 = Math.min(x0, p[0]);
    x1 = Math.max(x1, p[0]);
    z0 = Math.min(z0, p[1]);
    z1 = Math.max(z1, p[1]);
  }
  // yb：包围盒的底（排序用）。挂在围网、路灯上时设得比它们高一点，排序才分得清前后（小旗照样往下画）
  K.add({ x0, x1, z0, z1, y0: yb ?? y - sag - 0.6, y1: y + 0.1 }, (r) => {
    const lit = r.litAt((x0 + x1) / 2, (z0 + z1) / 2);
    const wc = r.col('#5a4a40', 1, lit);
    const s = r.spriteScale;
    const fw = 3 * s;
    let n = 0;
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i] as readonly [number, number];
      const b = pts[i + 1] as readonly [number, number];
      const pa = r.P(a[0], y, a[1]);
      const pb = r.P(b[0], y, b[1]);
      const L = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]);
      const N = Math.max(2, Math.round(L / (fw + s)));
      let prev: [number, number] | null = null;
      for (let q = 0; q <= N; q++) {
        const u = q / N;
        const p = r.P(a[0] + (b[0] - a[0]) * u, y - Math.sin(u * Math.PI) * sag, a[1] + (b[1] - a[1]) * u);
        if (prev) r.line(prev[0], prev[1], p[0], p[1], wc);
        prev = p;
        if (q === 0 || q === N) continue;
        const c = r.col(cols[n++ % cols.length] as string, 1, lit);
        const px = Math.round(p[0]) - Math.floor(fw / 2);
        const py = Math.round(p[1]) + 1;
        for (let j = 0; j < fw; j++) {
          const w = Math.max(1, Math.round(fw * (1 - j / fw)));
          r.rect(px + Math.floor((fw - w) / 2), py + j, w, 1, c);
        }
      }
    }
  });
}

/* ---------------- 观众 ---------------- */

const SKIN = ['#f1c7a1', '#e8b896', '#d9a47c', '#c48a62', '#a86f4c', '#7a4a32', '#5f3a28', '#f1d0ae'] as const;
const HAIR = ['#1c1712', '#3b2a1e', '#5a3a22', '#a7742f', '#141210', '#7a4a2a', '#d9c27a', '#9a9a96'] as const;
const SHIRTS = [
  '#d65a5a',
  '#e8b03c',
  '#5a8fd6',
  '#7bc47f',
  '#b07ad6',
  '#ef8f5a',
  '#4fb3b3',
  '#e7e2d4',
  '#c94c7a',
  '#f6f3ea',
] as const;
const BOTTOMS = ['#2d3a5a', '#5a5048', '#e7e2d4', '#3a3f47', '#6a7a5a', '#8a6a45'] as const;
/** 沙漠里的遮阳帽 */
const CAPS = ['#f6f3ea', '#e8d6a8', '#d65a5a', CLUB_GREEN, '#5a8fd6'] as const;

interface FanLook {
  /** [脸朝镜头, 背朝镜头] */
  seat: readonly [BakedArt, BakedArt];
  stand: readonly [BakedArt, BakedArt];
  cheer: readonly [readonly [BakedArt, BakedArt], readonly [BakedArt, BakedArt]];
}

let LOOKS: FanLook[] | null = null;

const eyeFor = (skin: string): string => {
  const n = Number.parseInt(skin.slice(1, 7), 16);
  const l = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return l < 150 ? '#100b16' : '#2a2238';
};

function frameOf(name: string, facing: 'front' | 'back', i: number): PixelArt {
  const anim = ADULT.anims[name]?.[facing] ?? ADULT.anims.idle?.[facing];
  const f = anim?.frames[Math.min(i, (anim?.frames.length ?? 1) - 1)];
  if (!f) throw new Error(`adult frame ${name} missing`);
  return f;
}

/** 观众的几种外观（固定种子；四个里有一个穿俱乐部的绿或金） */
function fanLooks(): FanLook[] {
  if (LOOKS) return LOOKS;
  const R = mulberry32(0xfa45);
  const pick = <T>(a: readonly T[]): T => a[Math.floor(R() * a.length)] as T;
  const out: FanLook[] = [];
  for (let i = 0; i < 24; i++) {
    const skin = pick(SKIN);
    const hair = pick(HAIR);
    const shirt = i % 4 === 0 ? (i % 8 === 0 ? CLUB_GREEN : CLUB_GOLD) : pick(SHIRTS);
    const slots: SlotColors = {
      skin,
      hair,
      shirt,
      trim: shirt,
      sleeve: shirt,
      bottoms: pick(BOTTOMS),
      socks: '#e6e2d6',
      shoes: '#f3f1ea',
      cap: R() < 0.4 ? pick(CAPS) : hair,
      racket: 'none',
      eye: eyeFor(skin),
    };
    const two = (name: string, j = 0) =>
      [bakeArt(frameOf(name, 'front', j), slots), bakeArt(frameOf(name, 'back', j), slots)] as const;
    out.push({ seat: two('seated'), stand: two('idle'), cheer: [two('cheer', 0), two('cheer', 1)] });
  }
  LOOKS = out;
  return out;
}

/** 一个观众：站在 floor 高的地面上，坐在 seat 高的座面上（seat 为 null 是站着看），脸朝 (fx, fz) */
export interface Fan {
  x: number;
  z: number;
  floor: number;
  seat: number | null;
  fx: number;
  fz: number;
  /** 人浪的位置（0..1，绕场一圈） */
  u: number;
  look: number;
}

/**
 * 一群观众（一个动态节点）：每帧按屏幕上的前后排序画；朝向按镜头转角自己挑（脸朝镜头 / 背朝镜头，左右翻转）。
 * 时不时有人跳起来欢呼，有人点头；wave 时一道人浪绕着场子走（表演赛）。
 */
export function crowd(K: ShowKit, fans: readonly Fan[], o: { seed: number; wave?: boolean; cheer?: number }): void {
  if (!fans.length) return;
  let x0 = 1e9;
  let x1 = -1e9;
  let z0 = 1e9;
  let z1 = -1e9;
  let y1 = 0;
  for (const f of fans) {
    x0 = Math.min(x0, f.x - 0.4);
    x1 = Math.max(x1, f.x + 0.4);
    z0 = Math.min(z0, f.z - 0.4);
    z1 = Math.max(z1, f.z + 0.4);
    y1 = Math.max(y1, (f.seat ?? f.floor) + 2);
  }
  const looks = fanLooks();
  const rate = o.cheer ?? 0.025;
  const order = fans.map((f, i) => ({ f, i, sy: 0 }));
  K.addDyn({ x0, x1, z0, z1, y0: 0, y1 }, (r) => {
    const s = r.spriteScale;
    const m = 1 / pxM(r);
    const t = r.t;
    for (const e of order) e.sy = r.P(e.f.x, 0, e.f.z)[1] - (e.f.seat ?? e.f.floor) * 0.001;
    order.sort((a, b) => a.sy - b.sy);
    // 人浪：一圈走 8 秒，走完歇 3 秒
    const w = o.wave ? ((t * 0.125) % 1.4) - 0.05 : -9;
    for (const { f, i } of order) {
      const a = r.P(f.x, 0, f.z);
      const b = r.P(f.x + f.fx, 0, f.z + f.fz);
      const k = b[1] > a[1] ? 0 : 1;
      const flipX = b[0] < a[0];
      const L = looks[f.look % looks.length] as FanLook;
      const inWave = !!o.wave && Math.abs(f.u - w) < 0.035;
      const cheer = inWave || hash(i, Math.floor(t * 1.3 + f.u * 7), o.seed) < rate;
      let img: BakedArt;
      let y: number;
      if (cheer) {
        img = L.cheer[Math.floor(t * 5 + i) & 1]?.[k] as BakedArt;
        y = f.floor;
      } else {
        img = (f.seat === null ? L.stand : L.seat)[k];
        y = f.seat === null ? f.floor : f.seat - 4 * s * m;
        if (hash(i, Math.floor(t * 2 + f.u * 13), o.seed + 1) > 0.8) y += s * m;
      }
      r.art(img, f.x, y, f.z, { flipX, lit: r.litAt(f.x, f.z) });
    }
  });
}

/** 一排座位上的观众：从 (ax, az) 到 (bx, bz) 每 gap 米一个，空座 empty 成 */
function row(
  R: () => number,
  a: readonly [number, number],
  b: readonly [number, number],
  gap: number,
  o: { floor: number; seat: number | null; fx: number; fz: number; empty?: number; cx?: number; cz?: number },
): Fan[] {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n = Math.max(1, Math.floor(len / gap) + 1);
  const out: Fan[] = [];
  for (let i = 0; i < n; i++) {
    const u = n === 1 ? 0.5 : i / (n - 1);
    const jit = (R() - 0.5) * gap * 0.3;
    const x = a[0] + (b[0] - a[0]) * u + (b[0] !== a[0] ? jit : 0);
    const z = a[1] + (b[1] - a[1]) * u + (b[1] !== a[1] ? jit : 0);
    const look = Math.floor(R() * 1000);
    if (R() < (o.empty ?? 0.1)) continue;
    const ang = Math.atan2(z - (o.cz ?? z), x - (o.cx ?? x));
    out.push({ x, z, floor: o.floor, seat: o.seat, fx: o.fx, fz: o.fz, u: (ang + Math.PI) / (Math.PI * 2), look });
  }
  return out;
}

/* ---------------- 赞助牌 ---------------- */

/** 几家虚构赞助商的配色：底色、标志色（不画字） */
const SPONSORS = [
  { bg: '#f6f3ea', fg: '#d6362f' },
  { bg: '#1d2a4a', fg: '#f6e27a' },
  { bg: '#2fa3a0', fg: '#ffffff' },
  { bg: '#ef8f5a', fg: '#2a2238' },
  { bg: '#6a3fa0', fg: '#f6f3ea' },
  { bg: CLUB_GREEN, fg: CLUB_GOLD },
] as const;

/**
 * 一块赞助牌，贴在一个竖直平面上（ax 'z'：平面 z = c，横跨 x u0..u1；'x'：平面 x = c，横跨 z），两面都画。
 * 左头一个标志方块、右边两道"字"（色条）；led 时夜里自己亮。
 */
export function sponsorBoard(
  K: ShowKit,
  ax: 'x' | 'z',
  c: number,
  u0: number,
  u1: number,
  y0: number,
  y1: number,
  idx: number,
  o: { led?: boolean; legs?: boolean; t?: number } = {},
): void {
  const sp = SPONSORS[idx % SPONSORS.length] as (typeof SPONSORS)[number];
  const P = (u: number, y: number): Pt => (ax === 'z' ? [u, y, c] : [c, y, u]);
  const q = (ua: number, ub: number, ya: number, yb: number): Pt[] => [P(ua, ya), P(ub, ya), P(ub, yb), P(ua, yb)];
  const t = o.t ?? 0.06;
  const b =
    ax === 'z'
      ? { x0: u0, x1: u1, z0: c - t, z1: c + t, y0: 0, y1: y1 + 0.05 }
      : { x0: c - t, x1: c + t, z0: u0, z1: u1, y0: 0, y1: y1 + 0.05 };
  const mx = ax === 'z' ? (u0 + u1) / 2 : c;
  const mz = ax === 'z' ? c : (u0 + u1) / 2;
  K.add(b, (r) => {
    const lit = r.litAt(mx, mz);
    const glow = !!o.led && dark(r);
    const C = (hex: string, f = 1) => (glow ? r.em(hex, f * 0.9) : r.col(hex, f, lit));
    if (o.legs) {
      const lc = r.col('#596069', 1, lit);
      for (const u of [u0 + 0.3, u1 - 0.3]) r.wline(P(u, 0), P(u, y0), lc);
    }
    const L = u1 - u0;
    const H = y1 - y0;
    r.wpoly(q(u0, u1, y0, y1), C(sp.bg));
    // 上下一道细边
    r.wpoly(q(u0, u1, y1 - H * 0.12, y1), C(sp.bg, 0.8));
    const la = u0 + L * 0.06;
    const lb = la + Math.min(L * 0.22, H * 1.1);
    r.wpoly(q(la, lb, y0 + H * 0.18, y1 - H * 0.24), C(sp.fg));
    const ta = lb + L * 0.06;
    const tb = u1 - L * 0.08;
    r.wpoly(q(ta, tb, y0 + H * 0.52, y0 + H * 0.68), C(sp.fg));
    r.wpoly(q(ta, ta + (tb - ta) * 0.62, y0 + H * 0.26, y0 + H * 0.38), C(sp.fg, 0.85));
  });
}

/* ---------------- 各块布置 ---------------- */

type Frame = { ox: number; oz: number; hx: number; hz: number };

const CUP_COLS = ['#d65a5a', '#f6e27a', '#5a8fd6', '#7bc47f', '#f6f3ea', '#ef8f5a'] as const;
const CLUB_COLS = [CLUB_GREEN, CLUB_GOLD, '#f6f3ea'] as const;

/** 沿一块场地的南北两道围网顶挂彩旗（每 1/4 长一个挂点） */
function fenceBunting(K: ShowKit, F: Frame, cols: readonly string[]): void {
  for (const z of [F.oz - F.hz, F.oz + F.hz]) {
    const pts: [number, number][] = [];
    for (let i = 0; i <= 4; i++) pts.push([F.ox - F.hx + (i * F.hx) / 2, z]);
    bunting(K, pts, 3.05, cols, 0.55, 3.02);
  }
}

/** 签到桌：俱乐部绿的桌布、一块夹板、一壶水 */
function signInTable(K: ShowKit, x: number, z: number): void {
  const clip = bakeArt(CLIPBOARD);
  K.cast({ x0: x - 0.9, x1: x + 0.9, z0: z - 0.35, z1: z + 0.35, h: 0.8 });
  K.add({ x0: x - 0.95, x1: x + 0.95, z0: z - 0.4, z1: z + 0.4, y0: 0, y1: 1.2 }, (r) => {
    const lit = r.litAt(x, z);
    box(r, x - 0.9, x + 0.9, z - 0.35, z + 0.35, 0.1, 0.78, CLUB_GREEN, { lit, top: '#f6f3ea', edge: false });
    // 桌布下摆一道金边
    for (const [nx, nz] of [
      [0, 1],
      [1, 0],
      [-1, 0],
      [0, -1],
    ] as const) {
      if (nx === 0) fq(r, 'z', z + 0.35 * nz, 0, nz, x - 0.9, x + 0.9, 0.62, 0.7, r.col(CLUB_GOLD, 1, lit));
      else fq(r, 'x', x + 0.9 * nx, nx, 0, z - 0.35, z + 0.35, 0.62, 0.7, r.col(CLUB_GOLD, 1, lit));
    }
    cyl(r, x + 0.55, z, 0.1, 0.78, 1.05, '#9fd8ee', { lit, top: '#d8f4ff' });
    r.art(clip, x - 0.25, 0.8, z, { lit });
  });
}

/** 月度杯：彩旗、签到桌、签表板、长凳上的观众（main 是有签到桌的那块场） */
function cupCourt(K: ShowKit, F: Frame, main: boolean, seed: number): void {
  const R = mulberry32(seed);
  fenceBunting(K, F, CUP_COLS);
  const zn = F.oz - F.hz + 1.0;
  if (main) {
    // 进门两边各一面月度杯的彩旗
    flag(K, F.ox - 2.6, F.oz - F.hz - 0.4, 4.6, '#d65a5a', '#f6e27a');
    flag(K, F.ox + 2.6, F.oz - F.hz - 0.4, 4.6, '#5a8fd6', '#f6f3ea');
    signInTable(K, F.ox - 4.8, zn);
    sprite(K, DRAW_BOARD, F.ox + 4.6, 0, zn - 0.1, 0.5);
  }
  const fans: Fan[] = [];
  for (const dx of main ? [-10, 10] : [-7, 8]) {
    bench(K, F.ox + dx, zn, 1.4, 'x');
    fans.push(
      ...row(R, [F.ox + dx - 1, zn], [F.ox + dx + 1, zn], 0.95, { floor: 0, seat: 0.45, fx: 0, fz: 1, empty: 0.3 }),
    );
  }
  const zs = F.oz + F.hz - 1.0;
  bench(K, F.ox - 6, zs, 1.4, 'x');
  fans.push(...row(R, [F.ox - 6.8, zs], [F.ox - 5.2, zs], 1.0, { floor: 0, seat: 0.45, fx: 0, fz: -1, empty: 0.2 }));
  crowd(K, fans, { seed });
}

/** 场边临时看台（铝合金两级）：沿 x 从 xa 到 xb，背靠 zBack，脸朝 dir（+1 朝 +z） */
function bleacher(K: ShowKit, R: () => number, xa: number, xb: number, zBack: number, dir: 1 | -1): Fan[] {
  const tiers = [
    { a: 0, b: 1, h: 0.95 },
    { a: 1, b: 2, h: 0.5 },
  ];
  const fans: Fan[] = [];
  for (const t of tiers) {
    const za = zBack + dir * t.a;
    const zb = zBack + dir * t.b;
    const z0 = Math.min(za, zb);
    const z1 = Math.max(za, zb);
    K.cast({ x0: xa, x1: xb, z0, z1, h: t.h });
    K.add({ x0: xa, x1: xb, z0, z1, y0: 0, y1: t.h + 0.05 }, (r) => {
      const lit = r.litAt((xa + xb) / 2, (z0 + z1) / 2);
      box(r, xa, xb, z0, z1, 0, t.h, '#9aa3ad', {
        lit,
        top: '#c8d0d8',
        topSh: (tc) => {
          const d = r.col('#aab3bc', 1, lit);
          return (x) => ((x >> 1) & 1 ? tc : d);
        },
        sideSh: (_nx, _nz, _p, cc) => {
          const d = r.col('#7f8790', 1, lit);
          return (_x, y) => (y % 3 === 0 ? d : cc);
        },
      });
    });
    const zf = dir > 0 ? z1 - 0.2 : z0 + 0.2;
    fans.push(...row(R, [xa + 0.5, zf], [xb - 0.5, zf], 1.25, { floor: t.h, seat: t.h, fx: 0, fz: dir, empty: 0.15 }));
  }
  return fans;
}

/** 邀请赛的场地：两边临时看台坐满、围网上的赞助牌、俱乐部色彩旗 */
function invCourt(K: ShowKit, F: Frame, seed: number, sp0: number): void {
  const R = mulberry32(seed);
  fenceBunting(K, F, CLUB_COLS);
  const zb = F.oz - F.hz + 0.15;
  const fans = [...bleacher(K, R, F.ox - 12.5, F.ox - 4, zb, 1), ...bleacher(K, R, F.ox + 4, F.ox + 12.5, zb, 1)];
  crowd(K, fans, { seed, cheer: 0.035 });
  // 南边围网、东西两头底线后面的围网
  let n = sp0;
  // 牌子离围网 15 厘米（包围盒和围网分开，排序才稳）
  const zs = F.oz + F.hz - 0.15;
  for (const x of [F.ox - 10, F.ox, F.ox + 10])
    sponsorBoard(K, 'z', zs, x - 1.9, x + 1.9, 0.15, 1.05, n++, { t: 0.04 });
  for (const sx of [-1, 1])
    for (const dz of [-3.2, 3.2]) {
      const x = F.ox + sx * (F.hx - 0.15);
      sponsorBoard(K, 'x', x, F.oz + dz - 1.8, F.oz + dz + 1.8, 0.15, 1.05, n++, { t: 0.04 });
    }
}

/**
 * 车道上的充气拱门（大门外 9 米，进门的人从下面过）：两根绿柱子三道金圈，拱顶是一根绿金相间的粗气管，
 * 下面吊一块白横幅画着网球和两道缎带；夜里拱顶一圈小灯。
 */
function arch(K: ShowKit, accent: string): void {
  const X = 68.8;
  const Z = 4.3;
  const H = 5.0;
  const RISE = 2.8;
  K.lampAt({ x: X, z: 0, r: 7, i: 0.55 });
  for (const z of [-Z, Z]) K.cast({ x: X, z, h: H, r: 0.7, tw: 0.55 });
  K.add({ x0: X - 0.8, x1: X + 0.8, z0: -Z - 0.8, z1: Z + 0.8, y0: 0, y1: H + RISE + 1 }, (r) => {
    const lit = r.litAt(X, 0);
    const night = dark(r);
    const ol = r.col('#1e3a28', 1, lit);
    for (const z of [-Z, Z]) {
      cyl(r, X, z, 0.75, 0, 0.35, '#245c34', { lit });
      cyl(r, X, z, 0.62, 0.35, H, CLUB_GREEN, { lit, noTop: true });
      for (const y of [1.2, 2.6, 4.0]) cyl(r, X, z, 0.66, y, y + 0.4, CLUB_GOLD, { lit, noTop: true });
    }
    // 拱顶：沿弧一串圆点叠成一根粗气管（先描边、再上色、再一道高光），绿金分段
    const tube = Math.max(1.5, 0.62 * r.k * 1.3);
    const seg = 10;
    const at = (u: number): [number, number] => {
      const th = u * Math.PI;
      return r.P(X, H + Math.sin(th) * RISE, -Z * Math.cos(th));
    };
    const a0 = at(0);
    const a1 = at(0.5);
    const n = Math.max(12, Math.round((Math.hypot(a1[0] - a0[0], a1[1] - a0[1]) * 2.4) / 1));
    for (let i = 0; i <= n; i++) {
      const p = at(i / n);
      r.ell(p[0], p[1], tube + 1, tube + 1, ol);
    }
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const p = at(u);
      const c = Math.floor(u * seg) & 1 ? CLUB_GOLD : CLUB_GREEN;
      r.ell(p[0], p[1], tube, tube, r.col(c, 1, lit));
      r.ell(p[0] - tube * 0.3, p[1] - tube * 0.35, tube * 0.35, tube * 0.3, r.col(c, 1.18, lit));
    }
    // 横幅：两根吊绳 + 绿边白底，下沿一道 accent 色
    const by0 = H - 0.5;
    const by1 = H + 1.3;
    const zb = 2.9;
    const q = (za: number, zz: number, ya: number, yb: number): Pt[] => [
      [X, ya, za],
      [X, ya, zz],
      [X, yb, zz],
      [X, yb, za],
    ];
    const rope = r.col('#5a4a40', 1, lit);
    for (const z of [-zb + 0.4, zb - 0.4]) r.wline([X, by1, z], [X, H + Math.sin(Math.acos(z / Z)) * RISE, z], rope);
    r.wpoly(q(-zb, zb, by0, by1), r.col(CLUB_GREEN, 1, lit));
    r.wpoly(q(-zb + 0.15, zb - 0.15, by0 + 0.15, by1 - 0.15), r.col('#f6f3ea', 1, lit));
    r.wpoly(q(-zb + 0.15, zb - 0.15, by0 + 0.15, by0 + 0.38), r.col(accent, 1, lit));
    // 正中一个网球（屏幕上画圆，好认），两边两道缎带
    const c = r.P(X, (by0 + by1) / 2 + 0.1, 0);
    const rad = Math.max(2, r.k * 0.55);
    r.ell(c[0], c[1], rad + 1, rad + 1, r.col('#2a2238', 1, lit));
    r.ell(c[0], c[1], rad, rad, r.col('#d7e64a', 1, lit));
    const sc = r.col('#f6f3ea', 1, lit);
    for (let i = -2; i <= 2; i++) {
      const yy = Math.round(c[1] + (i * rad) / 2.6);
      const dx = Math.round(rad * 0.45 * (1 - (i * i) / 6));
      r.pix(Math.round(c[0] - rad * 0.55 + dx), yy, sc);
      r.pix(Math.round(c[0] + rad * 0.55 - dx), yy, sc);
    }
    for (const zz of [-1.6, 1.6]) {
      const a = r.P(X, (by0 + by1) / 2 + 0.25, zz - 0.7);
      const b = r.P(X, (by0 + by1) / 2 + 0.25, zz + 0.7);
      const w = Math.max(1, Math.round(r.k * 0.18));
      for (let j = 0; j < w * 2; j++) r.line(a[0], a[1] + j, b[0], b[1] + j, r.col(j < w ? accent : CLUB_GOLD, 1, lit));
    }
    if (night)
      for (let i = 1; i < 12; i++) {
        const p = at(i / 12);
        r.rect(Math.round(p[0]) - 1, Math.round(p[1] - tube) - 1, 2, 2, r.em(i & 1 ? '#fff1c4' : '#ffd27a'));
        r.glow(p[0], p[1] - tube, 4, [255, 210, 140], 0.5);
      }
  });
}

/** 会所门前一排旗杆（俱乐部的绿金），塔楼东面、南面各挂一条长条幅 */
function clubFlags(K: ShowKit): void {
  for (const [i, z] of [-34, -29, -24, -19, -14].entries())
    flag(K, -38.7, z, 7.5, i & 1 ? CLUB_GOLD : CLUB_GREEN, i & 1 ? CLUB_GREEN : '#f6f3ea');
  // 塔楼（x -45.5..-40.5，z -14..-9.5，高 13）：东面、南面各一个贴着墙面外侧的薄节点（和塔楼的包围盒分开）
  const drop = (ax: 'x' | 'z', c: number, nx: number, nz: number, u0: number, u1: number) => {
    const o = 0.08 * (nx + nz);
    const b =
      ax === 'x'
        ? { x0: Math.min(c, c + o), x1: Math.max(c, c + o), z0: u0, z1: u1 }
        : { x0: u0, x1: u1, z0: Math.min(c, c + o), z1: Math.max(c, c + o) };
    K.add({ ...b, y0: 4.2, y1: 12 }, (r) => {
      const lit = r.litAt(-41, -11);
      const g = r.col(CLUB_GREEN, 1, lit);
      const gd = r.col(CLUB_GOLD, 1, lit);
      const w = r.col('#f6f3ea', 1, lit);
      fq(r, ax, c, nx, nz, u0, u1, 4.2, 12, gd);
      fq(r, ax, c + 0.01 * (nx + nz), nx, nz, u0 + 0.12, u1 - 0.12, 4.5, 11.85, g);
      const um = (u0 + u1) / 2;
      fq(r, ax, c + 0.02 * (nx + nz), nx, nz, um - 0.45, um + 0.45, 9.4, 10.6, w);
      fq(r, ax, c + 0.03 * (nx + nz), nx, nz, um - 0.25, um + 0.25, 9.65, 10.35, gd);
      // 下摆剪成燕尾
      for (const du of [-0.5, 0.5])
        fq(r, ax, c + 0.02 * (nx + nz), nx, nz, um + du - 0.25, um + du + 0.25, 4.5, 4.8, gd);
    });
  };
  drop('x', -40.5, 1, 0, -12.9, -10.6);
  drop('z', -9.5, 0, 1, -44.3, -41.8);
}

/** 棕榈喷泉东南的餐饮帐篷：绿白条纹的尖顶、柜台上的吃食、人字黑板、两张高脚桌；夜里帐篷里亮着 */
function catering(K: ShowKit): void {
  const cx = 52.4;
  const cz = -15.6;
  const hx = 2.2;
  const hz = 1.6;
  const eave = 2.5;
  const apex = 3.8;
  K.lampAt({ x: cx, z: cz + 1, r: 6.5, i: 0.85 });
  K.cast({ x0: cx - hx, x1: cx + hx, z0: cz - hz, z1: cz + hz, h: 3 });
  // 柜台和后面的箱子（矮，先画）
  K.add({ x0: cx - hx, x1: cx + hx, z0: cz - hz, z1: cz + hz, y0: 0, y1: 1.1 }, (r) => {
    const lit = dark(r) ? 0.9 : r.litAt(cx, cz);
    box(r, cx - 1.7, cx - 0.9, cz - 1.3, cz - 0.6, 0, 0.6, '#c89a5a', { lit, edge: false });
    box(r, cx - 0.8, cx - 0.1, cz - 1.3, cz - 0.7, 0, 0.5, '#3a7ad6', { lit, top: '#f6f3ea', edge: false });
    box(r, cx - hx + 0.3, cx + hx - 0.3, cz + 0.8, cz + 1.4, 0, 1.0, '#f6f3ea', {
      lit,
      top: '#c8955a',
      face: (nx, nz) => {
        if (nz === 1) {
          fq(r, 'z', cz + 1.4, 0, 1, cx - hx + 0.3, cx + hx - 0.3, 0.15, 0.85, r.col(CLUB_GREEN, 1, lit));
          fq(r, 'z', cz + 1.4, 0, 1, cx - hx + 0.3, cx + hx - 0.3, 0.45, 0.55, r.col(CLUB_GOLD, 1, lit));
        }
        if (nx !== 0)
          fq(r, 'x', cx + nx * (hx - 0.3), nx, 0, cz + 0.8, cz + 1.4, 0.15, 0.85, r.col(CLUB_GREEN, 1, lit));
      },
    });
    // 柜台上：几样吃的（屏幕像素点）
    const food = ['#ef8f5a', '#f6e27a', '#ff8fb8', '#d65a5a', '#7bc47f'];
    for (let i = 0; i < 5; i++) {
      const p = r.P(cx - 1.4 + i * 0.7, 1.0, cz + 1.1);
      r.rect(Math.round(p[0]) - 1, Math.round(p[1]) - 2, 2, 2, r.col(food[i] as string, 1, lit));
    }
  });
  // 帐篷：四根柱子 + 尖顶 + 一圈垂边
  K.add(
    { x0: cx - hx - 0.1, x1: cx + hx + 0.1, z0: cz - hz - 0.1, z1: cz + hz + 0.1, y0: 1.1, y1: apex + 0.2 },
    (r) => {
      const lit = dark(r) ? 0.6 : r.litAt(cx, cz);
      const pc = r.col('#e8e2d2', 1, lit);
      for (const [dx, dz] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ] as const)
        r.wline(
          [cx + dx * hx, 0, cz + dz * hz],
          [cx + dx * hx, eave, cz + dz * hz],
          pc,
          Math.max(1, Math.round(r.k * 0.15)),
        );
      const A: Pt = [cx - hx, eave, cz - hz];
      const B: Pt = [cx + hx, eave, cz - hz];
      const C: Pt = [cx + hx, eave, cz + hz];
      const D: Pt = [cx - hx, eave, cz + hz];
      const T: Pt = [cx, apex, cz];
      const faces: [number, number, Pt[], Pt, Pt][] = [
        [0, -1, [A, B, T], A, B],
        [1, 0, [B, C, T], B, C],
        [0, 1, [C, D, T], C, D],
        [-1, 0, [D, A, T], D, A],
      ];
      faces.sort((a, b) => (r.vis(a[0], a[1]) ? 1 : 0) - (r.vis(b[0], b[1]) ? 1 : 0));
      for (const [nx, nz, pts, e0, e1] of faces) {
        const f = faceF(nx, nz) + 0.15;
        const c1 = r.col(CLUB_GREEN, f, lit);
        const c2 = r.col('#f6f3ea', f, lit);
        const s0 = r.P(...e0);
        const s1 = r.P(...e1);
        // 条纹从檐口往顶上收：按沿檐口的位置分条（period 随缩放）
        const ex = s1[0] - s0[0];
        const ey = s1[1] - s0[1];
        const L = Math.hypot(ex, ey) || 1;
        const per = Math.max(2, Math.round(r.k * 0.6));
        r.wpoly(pts, c1, (x, y) => {
          const along = ((x - s0[0]) * ex + (y - s0[1]) * ey) / L;
          return Math.floor(along / per) & 1 ? c2 : c1;
        });
        // 垂边（只画朝镜头的两面）
        if (r.vis(nx, nz)) {
          const v: Pt[] = [e0, e1, [e1[0], eave - 0.35, e1[2]], [e0[0], eave - 0.35, e0[2]]];
          wp(r, v, c2, stripeSh(s0[0], s0[1], s0[0] + ey, s0[1] - ex, per, c1, c2));
        }
      }
      if (dark(r)) {
        for (let i = 0; i <= 6; i++) {
          const p = r.P(cx - hx + (i * 2 * hx) / 6, eave - 0.4, cz + hz);
          r.rect(Math.round(p[0]), Math.round(p[1]), 2, 2, r.em(i & 1 ? '#ffd27a' : '#fff1c4'));
        }
        const p = r.P(cx, 1.6, cz + 0.6);
        r.glow(p[0], p[1], 6 * r.k * 0.55 + 2, [255, 200, 130], 0.6);
      }
    },
  );
  sprite(K, MENU_BOARD, cx - hx - 0.9, 0, cz + hz + 0.8, 0.4);
  // 两张高脚桌
  for (const [x, z] of [
    [cx - 4.2, cz + 2.6],
    [cx + 0.6, cz + 3.6],
  ] as const)
    K.add({ x0: x - 0.4, x1: x + 0.4, z0: z - 0.4, z1: z + 0.4, y0: 0, y1: 1.15 }, (r) => {
      const lit = r.litAt(x, z);
      cyl(r, x, z, 0.06, 0, 1.05, '#596069', { lit, noTop: true });
      cyl(r, x, z, 0.38, 1.02, 1.1, '#f6f3ea', { lit });
    });
}

/** 外出比赛：大门外一块"祝好运"牌，车道上一辆等着出发的小巴（junior：牌子上系三个气球） */
function farewell(K: ShowKit, junior: boolean): void {
  const bx = 62.8;
  const bz = -8.8;
  sprite(K, LUCK_BOARD, bx, 0, bz, 0.5);
  if (junior) {
    const wx = K.wx;
    const cols = ['#d65a5a', '#5a8fd6', '#f6e27a'];
    K.addDyn({ x0: bx - 0.3, x1: bx + 0.3, z0: bz - 0.3, z1: bz + 0.3, y0: 0, y1: 5 }, (r) => {
      const lit = r.litAt(bx, bz);
      const s = r.spriteScale;
      const top = r.P(bx, 0, bz);
      // 牌子顶边（精灵 16 行高）往上挂
      const ty = top[1] - 15 * s;
      for (let i = 0; i < 3; i++) {
        const sway = Math.round(Math.sin(r.t * (1.6 + i * 0.3) + i * 2) * (1 + wx.wind * 2) * s);
        const ax = top[0] + (i - 1) * 6 * s;
        const hx = ax + (i - 1) * 3 * s + sway;
        const hy = ty - (10 + (i === 1 ? 4 : 0)) * s;
        r.line(ax, ty, hx, hy + 3 * s, r.col('#f6f3ea', 0.8, lit));
        r.ell(hx + 0.5, hy, 2.6 * s, 3.2 * s, r.col('#2a2238', 1, lit));
        r.ell(hx + 0.5, hy, 2 * s, 2.6 * s, r.col(cols[i] as string, 1, lit));
        r.pix(hx - s + 1, hy - s, r.col('#ffffff', 1, lit));
      }
    });
  }
  // 小巴：车头朝外（+x），白车身一道俱乐部绿，车顶行李架
  const x0 = 67.2;
  const x1 = 74.4;
  const z0 = -3.5;
  const z1 = -1.1;
  K.cast({ x0, x1, z0, z1, h: 2.4 });
  K.lampAt({ x: x1 + 1.5, z: (z0 + z1) / 2, r: 4, i: 0.5 });
  K.add({ x0, x1: x1 + 0.1, z0, z1, y0: 0, y1: 2.9 }, (r) => {
    const lit = r.litAt((x0 + x1) / 2, (z0 + z1) / 2);
    const night = dark(r);
    const glass = night ? r.em('#ffe2a0', 0.75) : r.col('#3b5874', 1, lit);
    box(r, x0, x1, z0, z1, 0.35, 2.35, '#f3f1ea', {
      lit,
      face: (nx, nz) => {
        if (nz !== 0) {
          const c = nz > 0 ? z1 : z0;
          fq(r, 'z', c, 0, nz, x0 + 0.2, x1 - 0.2, 0.85, 1.1, r.col(CLUB_GREEN, 1, lit));
          for (let i = 0; i < 5; i++) {
            const a = x0 + 0.5 + i * 1.3;
            fq(r, 'z', c, 0, nz, a, a + 1.05, 1.35, 2.0, glass);
          }
          for (const wxp of [x0 + 1.3, x1 - 1.3])
            fq(r, 'z', c, 0, nz, wxp - 0.45, wxp + 0.45, 0.02, 0.62, r.col('#22252c', 1, lit));
        }
        if (nx === 1) {
          fq(r, 'x', x1, 1, 0, z0 + 0.15, z1 - 0.15, 1.3, 2.1, night ? r.em('#9ab8d0', 0.5) : r.col('#5a7a98', 1, lit));
          fq(r, 'x', x1, 1, 0, z0 + 0.15, z1 - 0.15, 0.85, 1.1, r.col(CLUB_GREEN, 1, lit));
          for (const z of [z0 + 0.35, z1 - 0.35])
            fq(r, 'x', x1, 1, 0, z - 0.18, z + 0.18, 0.5, 0.72, night ? r.em('#fff4c8') : r.col('#f6e27a', 1, lit));
        }
        if (nx === -1) fq(r, 'x', x0, -1, 0, z0 + 0.2, z1 - 0.2, 1.3, 2.1, glass);
      },
    });
    // 行李架上两件行李
    box(r, x0 + 1.2, x0 + 2.4, z0 + 0.4, z1 - 0.4, 2.35, 2.8, '#d65a5a', { lit, edge: false });
    box(r, x0 + 2.8, x0 + 3.6, z0 + 0.5, z1 - 0.6, 2.35, 2.7, '#5a8fd6', { lit, edge: false });
    if (night) {
      const p = r.P(x1 + 0.1, 0.6, (z0 + z1) / 2);
      r.glow(p[0], p[1], 3 * r.k * 0.55 + 2, [255, 240, 190], 0.7);
    }
  });
}

/* ---------------- 中心球场的表演赛 ---------------- */

/** 中心球场看台上坐满的观众（看台几何同 build.ts；加建了看台就把加建那两级也坐满） */
function stadiumCrowd(K: ShowKit, extended: boolean): void {
  const R = mulberry32(0xe4b1);
  const cx = F_S1.ox;
  const cz = F_S1.oz;
  const north: Fan[] = [];
  for (let i = 0; i < 4; i++) {
    const z1 = -30 - 2 * i;
    const h = 1.4 * (i + 1);
    north.push(...row(R, [-17.2, z1 - 0.2], [17.2, z1 - 0.2], 1.45, { floor: h, seat: h, fx: 0, fz: 1, cx, cz }));
  }
  const east: Fan[] = [];
  const nEast = extended ? 5 : 3;
  for (let j = 0; j < nEast; j++) {
    const x0 = 18.5 + 2 * j;
    const h = 1.2 * (j + 1);
    east.push(...row(R, [x0 + 0.2, -28.8], [x0 + 0.2, -13.2], 1.45, { floor: h, seat: h, fx: -1, fz: 0, cx, cz }));
  }
  const south: Fan[] = [];
  for (const [a, b] of [
    [-17, -3],
    [3, 17],
  ] as const)
    for (const [z0, h] of [
      [-11.6, 0.7],
      [-10.4, 1.4],
    ] as const)
      south.push(...row(R, [a, z0 + 0.2], [b, z0 + 0.2], 1.45, { floor: h, seat: h, fx: 0, fz: -1, cx, cz }));
  crowd(K, north, { seed: 11, wave: true });
  crowd(K, east, { seed: 12, wave: true });
  crowd(K, south, { seed: 13, wave: true });
}

/** 天上绕着中心球场慢慢转的小飞艇（白身一道绿、尾翼） */
function blimp(K: ShowKit): void {
  const n = K.addDyn({ x0: -1, x1: 1, z0: -22, z1: -20, y0: 30, y1: 34 }, (r) => {
    const a = r.t * 0.05;
    const x = Math.cos(a) * 26;
    const z = -21 + Math.sin(a) * 14;
    const p = r.P(x, 32 + Math.sin(r.t * 0.7) * 0.4, z);
    // 往屏幕哪边飞：车头朝那边
    const q = r.P(Math.cos(a + 0.05) * 26, 32, -21 + Math.sin(a + 0.05) * 14);
    const dir = q[0] >= p[0] ? 1 : -1;
    const s = r.spriteScale;
    const lit = 0;
    const L = 11 * s;
    const H = 4 * s;
    const cx = Math.round(p[0]);
    const cy = Math.round(p[1]);
    const ol = r.col('#2a2238', 1, lit);
    // 尾翼
    const tx = cx - dir * (L - s);
    r.rect(Math.min(tx, tx - dir * 3 * s), cy - H - s, 3 * s, 2 * H + 2 * s, ol);
    r.rect(Math.min(tx, tx - dir * 3 * s) + (dir > 0 ? 0 : s), cy - H, 2 * s, 2 * H, r.col(CLUB_GREEN, 1, lit));
    r.ell(cx, cy, L + 1, H + 1, ol);
    r.ell(cx, cy, L, H, r.col('#e8e6e0', 1, lit));
    r.ell(cx, cy - s, L - s, H - s, r.col('#f8f7f2', 1, lit));
    r.rect(cx - L + 2 * s, cy - Math.floor(s / 2), 2 * L - 4 * s, s + 1, r.col(CLUB_GREEN, 1, lit));
    r.rect(cx - 2 * s, cy + H, 4 * s, 2 * s, ol);
    r.rect(cx - 2 * s + 1, cy + H, 4 * s - 2, s, r.col('#5a6070', 1, lit));
    if (dark(r))
      r.rect(cx + dir * (L - 2 * s), cy - s, s + 1, s + 1, r.em(Math.sin(r.t * 4) > 0 ? '#ff4a3a' : '#5a1a1a'));
  });
  n.renderOrder = 60;
}

/** 夜里两道探照灯，从北看台背后往天上扫（棋盘格抖动的光柱，被前面的房子挡住） */
function searchlights(K: ShowKit): void {
  const n = K.addDyn({ x0: -11, x1: 11, z0: -42, z1: -41, y0: 0, y1: 40 }, (r) => {
    if (!dark(r)) return;
    const edge = r.em('#b8c8f0');
    for (const [i, x] of [-10, 10].entries()) {
      const b = r.P(x, 0.8, -41.5);
      const ang = -Math.PI / 2 + Math.sin(r.t * 0.3 + i * 2.4) * 0.5;
      const dx = Math.cos(ang);
      const dy = Math.sin(ang);
      const len = Math.round(r.k * 40);
      // 光柱：一串叠起来的柔光（越往上越宽越淡），两边一道抖动的亮边
      for (let q = 3; q < len; q += 2) {
        const u = q / len;
        const w = 2 + u * r.k * 3;
        r.glow(b[0] + dx * q, b[1] + dy * q, w + 1, [150, 170, 220], 0.4 * (1 - u * 0.8));
        if (q % 4 === 1 && hash(q, i, 78) < 0.8 - u * 0.6)
          for (const sd of [-1, 1]) r.pix(b[0] + dx * q - dy * sd * w, b[1] + dy * q + dx * sd * w, edge);
      }
      r.rect(Math.round(b[0]) - 2, Math.round(b[1]) - 1, 4, 2, r.em('#ffffff'));
      r.glow(b[0], b[1], 5, [220, 230, 255], 0.9);
    }
  });
  n.renderOrder = 50;
}

/** 表演赛：看台坐满、长廊上的彩旗、飞艇、夜里的探照灯（拱门另算一块） */
function exhibition(K: ShowKit, prep: ReadonlyMap<string, boolean>): void {
  stadiumCrowd(K, prep.get('prep_stands') === true);
  // 长廊路灯之间挂彩旗（路灯在 z -8.9，x -30..54 每 12 米一盏）
  const pts: [number, number][] = [];
  for (let x = -30; x <= 30; x += 12) pts.push([x, -8.9]);
  bunting(K, pts, 3.4, ['#d65a5a', CLUB_GOLD, '#5a8fd6', CLUB_GREEN, '#f6f3ea'], 0.7, 3.62);
  blimp(K);
  searchlights(K);
  if (prep.get('prep_media')) {
    // 转播平台上有人扛着机器（平台和机器在 prep.ts）
    const looks = fanLooks();
    for (const [x, y, z] of [
      [-20.6, 2.3, -27.2],
      [-20.6, 2.3, -14.0],
      [0, 7.4, -40.5],
    ] as const)
      K.addDyn({ x0: x - 0.3, x1: x + 0.3, z0: z - 0.3, z1: z + 0.3, y0: y, y1: y + 2 }, (r) => {
        const L = looks[5] as FanLook;
        const a = r.P(x, 0, z);
        const b = r.P(x + 1, 0, z);
        r.art(L.stand[b[1] > a[1] ? 0 : 1], x, y, z, { flipX: b[0] < a[0], lit: r.litAt(x, z) });
      });
  }
}

/* ---------------- 赛事 → 各块 ---------------- */

/** 球场地点 → 那儿的场地（同 index.ts 的 COURTS） */
const COURT_FRAMES: Readonly<Record<string, readonly Frame[]>> = {
  outer_1: [F_O1],
  outer_23: [F_O2, F_O3],
  practice: [F_P1, F_P2],
};

export const EVENT_KINDS = ['cup_monthly', 'invitational', 'regional_open', 'junior_regional', 'exhibition'] as const;

/** 一处赛事要摆哪几块（块名 → 种子）；不认识的赛事或地点没有布置 */
function partsFor(anchor: string, kind: string): string[] {
  const courts = anchor in COURT_FRAMES;
  switch (kind) {
    case 'cup_monthly':
      return courts ? [`cup:${anchor}`] : [];
    case 'invitational':
      if (courts) return [`inv:${anchor}`, 'arch', 'club', 'plaza'];
      if (anchor === 'clubhouse') return ['club'];
      if (anchor === 'plaza') return ['plaza'];
      if (anchor === 'entrance') return ['arch'];
      return [];
    case 'regional_open':
      return ['farewell'];
    case 'junior_regional':
      return ['farewell:junior'];
    case 'exhibition':
      if (anchor === 'stadium_1') return ['exhibition', 'arch'];
      return courts ? [`inv:${anchor}`, 'arch'] : [];
    default:
      return [];
  }
}

/**
 * 按"地点 → 赛事"建赛事布置（K 是 showKit；prep 是筹备各期做完没有，表演赛要知道看台加建了没有；
 * fac 用来认红土 / 硬地变体）。同一块只建一次；块按名字排序，每块自己的种子，结果确定。
 */
export function buildEvents(
  K: ShowKit,
  events: ReadonlyMap<string, string>,
  prep: ReadonlyMap<string, boolean>,
  fac: Facilities | null,
): void {
  const parts = new Set<string>();
  for (const [anchor, kind] of events) for (const p of partsFor(anchor, kind)) parts.add(p);
  const hard = fac?.variant('outer_23') === 'hard';
  const accent = hard ? '#2c3f7a' : '#d36b3d';
  for (const p of [...parts].sort()) {
    const [kind, arg] = p.split(':');
    const frames = COURT_FRAMES[arg ?? ''] ?? [];
    if (kind === 'cup') for (const [i, F] of frames.entries()) cupCourt(K, F, i === 0, 0xc0 + i);
    else if (kind === 'inv') for (const [i, F] of frames.entries()) invCourt(K, F, 0x1f0 + i, i * 7);
    else if (kind === 'arch') arch(K, accent);
    else if (kind === 'club') clubFlags(K);
    else if (kind === 'plaza') catering(K);
    else if (kind === 'farewell') farewell(K, arg === 'junior');
    else if (kind === 'exhibition') exhibition(K, prep);
  }
}

import { mulberry32 } from '@td/shared';
import { fbm, hash } from '../../core/color';
import { Custom, type DrawContext, type Node } from '../../core/graph';
import type { CourtFrame } from '../../world/frame';
import { type Bounds, type Draw, dark, type Kit, type Lamp, type Weather } from './common';
import type { Cast } from './ground';
import { box, cyl, drawText, ellSh, faceF, fq, hipRoof, type Pt, unprojector } from './kit';
import { F_O1, F_O2, F_O3, F_P1, F_P2, F_PB1, F_PB2, F_S1, FOUNTAIN, GROUNDS, PICKLE, POOL, TERRACE } from './layout';
import type { Facilities } from './state';

export { type Bounds, type Draw, dark, type Kit, type Lamp, type Weather };

import {
  cabanaRow,
  clubVariant,
  misters,
  outer23Extras,
  plazaVariant,
  poolIceColors,
  poolVariant,
  practiceVariant,
  proShop,
  resortLounger,
  stadium3Variant,
  videoWall,
} from './variants';

/**
 * Palm Oasis 的静态场景（照样片 index.html 的 build）：围墙和大门、中心球场看台、会所、露台、泳池和小木屋、
 * 喷泉和棕榈、各块球场的网和围网、匹克球场、草坪橡树、灯杆、停车场、高尔夫。
 * 每样东西是一个 Custom 节点（世界包围盒用于深度排序）；会动的（棕榈、喷泉、旗子、池水闪光）放动态层。
 * 每段有自己的种子随机流，一个设施换了状态不会改动别的设施的画面。
 */

export interface BuildOut {
  statics: Node[];
  dynamic: Node[];
  casts: Cast[];
  lamps: Lamp[];
}

export function buildStatics(fac: Facilities, wx: Weather): BuildOut {
  const out: BuildOut = { statics: [], dynamic: [], casts: [], lamps: [] };
  /** 正在建哪处设施的东西（节点记在 userData.fac 上，修复预览只取这一处的节点） */
  let curFac: string | null = null;
  const mk = (b: Bounds, draw: Draw): Custom => {
    const n = new Custom((r) => draw(r), { ...b });
    if (curFac) n.userData.fac = curFac;
    return n;
  };
  const add = (b: Bounds, draw: Draw): Custom => {
    const n = mk(b, draw);
    out.statics.push(n);
    return n;
  };
  const addDyn = (b: Bounds, draw: Draw) => {
    out.dynamic.push(mk(b, draw));
  };
  const cast = (c: Cast) => out.casts.push(c);
  const lampAt = (l: Lamp) => out.lamps.push(l);
  const lv = fac.level;

  /* ---------------- 共用的小物件 ---------------- */

  /** 棕榈（动态：随风摆）。dead 枯死、half 半枯、stump 只剩树桩、up 夜里有地灯照着 */
  const palm = (
    x: number,
    z: number,
    h: number,
    o: { dead?: boolean; half?: boolean; stump?: boolean; up?: boolean } = {},
  ) => {
    const ph0 = hash((x * 10) | 0, (z * 10) | 0, 3) * 6.28;
    const lean: [number, number] = [(hash(x | 0, z | 0, 4) - 0.5) * 1.2, (hash(z | 0, x | 0, 5) - 0.5) * 1.2];
    cast({ x, z, h: h * 0.95, r: 2.6 * (o.dead ? 0.5 : 1) * (o.stump ? 0 : 1) + (o.stump ? 0.3 : 0) });
    addDyn({ x0: x - 0.3, x1: x + 0.3, z0: z - 0.3, z1: z + 0.3, y0: 0, y1: h + 1 }, (r) =>
      drawPalm(r, x, z, o.stump ? 1.2 : h, lean, ph0, o, wx),
    );
  };

  /** 橡树（草坪上的两棵）：几团叶子，枯了是稀疏的黄绿 */
  const tree = (x: number, z: number, h: number, rad: number, dry: boolean) => {
    cast({ x, z, h: h * 0.8, r: rad * 1.1, tw: 0.3 });
    const R = mulberry32(((x * 31 + z * 17) | 0) >>> 0);
    const blobs: [number, number, number, number][] = [];
    for (let i = 0; i < 7; i++)
      blobs.push([
        (R() - 0.5) * rad * 1.2,
        h - rad * 0.3 + (R() - 0.2) * rad * 0.9,
        (R() - 0.5) * rad * 1.2,
        rad * (0.45 + R() * 0.3),
      ]);
    const e = rad * 0.6;
    add({ x0: x - e, x1: x + e, z0: z - e, z1: z + e, y0: h * 0.3, y1: h + rad }, (r) => {
      const lit = r.litAt(x, z);
      const b = r.P(x, 0, z);
      const t = r.P(x, h - rad * 0.5, z);
      r.rect(b[0] - 1, t[1], Math.max(2, Math.round(r.k * 0.6)), Math.round(b[1] - t[1]), r.col('#6b4a30', 1, lit));
      const c1 = r.col(dry ? '#9b9a62' : '#4e9a3f', 1, lit);
      const c2 = r.col(dry ? '#b5b376' : '#6cbc4f', 1, lit);
      const c3 = r.col(dry ? '#77744a' : '#3a7c33', 1, lit);
      const c4 = r.col(dry ? '#cfcb8e' : '#8fd463', 1, lit);
      // 按当前转角从后往前画叶团
      const order = blobs
        .map((bl) => ({ bl, d: r.P(x + bl[0], 0, z + bl[2])[1] }))
        .sort((a, b2) => a.d - b2.d)
        .map((o) => o.bl);
      for (const bl of order) {
        const p = r.P(x + bl[0], bl[1], z + bl[2]);
        const rr = bl[3] * r.k * 1.25;
        ellSh(r, p[0], p[1], rr, rr * 0.85, (px, py) => {
          const dx = (px + 0.5 - p[0]) / rr;
          const dy = (py + 0.5 - p[1]) / (rr * 0.85);
          const l = -dx * 0.6 - dy * 0.8 + bayer(px, py) * 0.5 - 0.25;
          if (dry && hash(px, py, (bl[0] * 9) | 0) > 0.7) return 0;
          return l > 0.55 ? c4 : l > 0.1 ? c2 : l > -0.45 ? c1 : c3;
        });
      }
    });
  };

  /** 铁丝网的一段 */
  const fenceSeg = (
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    h: number,
    o: { missing?: boolean; lean?: number; c?: string } = {},
  ) => {
    const X0 = Math.min(x0, x1);
    const X1 = Math.max(x0, x1);
    const Z0 = Math.min(z0, z1);
    const Z1 = Math.max(z0, z1);
    add(
      {
        x0: X0 - (x0 === x1 ? 0.05 : 0),
        x1: X1 + (x0 === x1 ? 0.05 : 0),
        z0: Z0 - (z0 === z1 ? 0.05 : 0),
        z1: Z1 + (z0 === z1 ? 0.05 : 0),
        y0: 0,
        y1: h,
      },
      (r) => {
        const lit = r.litAt((x0 + x1) / 2, (z0 + z1) / 2);
        const pw = Math.max(1, Math.round(r.k * 0.3));
        if (o.missing) {
          r.wline([x0, 0, z0], [x0, h * 0.9, z0], r.col('#3b4a42', 1, lit), pw);
          return;
        }
        const lean = o.lean ?? 0;
        const mc = r.col(o.c ?? '#2f4a3c', 1, lit);
        r.wpoly(
          [
            [x0, 0, z0],
            [x1, 0, z1],
            [x1 + lean, h, z1 + lean * 0.3],
            [x0 + lean, h, z0 + lean * 0.3],
          ],
          0,
          (x, y) => (((x + y) & 3) === 0 || ((x - y) & 3) === 0 ? mc : 0),
        );
        const pc = r.col('#3b4a42', 1, lit);
        r.wline([x0, 0, z0], [x0 + lean, h, z0 + lean * 0.3], pc, pw);
        r.wline([x1, 0, z1], [x1 + lean, h, z1 + lean * 0.3], pc, pw);
        r.wline([x0 + lean, h, z0 + lean * 0.3], [x1 + lean, h, z1 + lean * 0.3], pc);
      },
    );
  };

  /** 一圈围网（gaps 是门口；ruin 时缺几段、歪几段；screen 修好的场挂深绿挡风布） */
  const fenceRect = (
    x0: number,
    x1: number,
    z0: number,
    z1: number,
    h: number,
    gaps: readonly (readonly [number, number])[],
    ruin: boolean,
    seed: number,
    screen = false,
  ) => {
    const R = mulberry32(seed >>> 0);
    const run = (ax: number, az: number, bx: number, bz: number) => {
      const len = Math.hypot(bx - ax, bz - az);
      const n = Math.max(1, Math.round(len / 4));
      for (let i = 0; i < n; i++) {
        const a = i / n;
        const b = (i + 1) / n;
        const sx = ax + (bx - ax) * a;
        const sz = az + (bz - az) * a;
        const ex = ax + (bx - ax) * b;
        const ez = az + (bz - az) * b;
        const mx = (sx + ex) / 2;
        const mz = (sz + ez) / 2;
        if (gaps.some((g) => Math.hypot(g[0] - mx, g[1] - mz) < 2.2)) continue;
        const rr = R();
        fenceSeg(sx, sz, ex, ez, h, { missing: ruin && rr < 0.22, lean: ruin && rr > 0.85 ? (rr - 0.85) * 12 : 0 });
        if (screen) {
          const t = 0.04;
          add(
            {
              x0: Math.min(sx, ex) - (sx === ex ? t : 0),
              x1: Math.max(sx, ex) + (sx === ex ? t : 0),
              z0: Math.min(sz, ez) - (sz === ez ? t : 0),
              z1: Math.max(sz, ez) + (sz === ez ? t : 0),
              y0: 0,
              y1: 1.3,
            },
            (r) => {
              const lit = r.litAt(mx, mz);
              const c = r.col('#24402e', 1, lit);
              r.wpoly(
                [
                  [sx, 0.05, sz],
                  [ex, 0.05, ez],
                  [ex, 1.3, ez],
                  [sx, 1.3, sz],
                ],
                c,
              );
            },
          );
        }
      }
    };
    run(x0, z0, x1, z0);
    run(x1, z0, x1, z1);
    run(x0, z1, x1, z1);
    run(x0, z0, x0, z1);
  };

  /** 球网：missing 倒在地上（只剩两根柱子）、sag 塌着 */
  const net = (F: Pick<CourtFrame, 'ox' | 'oz'>, o: { pick?: boolean; missing?: boolean; sag?: boolean } = {}) => {
    const W = (o.pick ? 3.05 : 5.485) + (o.pick ? 0.3 : 0.9);
    const h = o.pick ? 0.86 : 1.0;
    const x = F.ox;
    const za = F.oz - W;
    const zb = F.oz + W;
    add({ x0: x - 0.05, x1: x + 0.05, z0: za, z1: zb, y0: 0, y1: h + 0.1 }, (r) => {
      const lit = r.litAt(x, F.oz);
      const pc = r.col('#2a2d33', 1, lit);
      const pw = Math.max(1, Math.round(r.k * 0.25));
      r.wline([x, 0, za], [x, h, za], pc, pw);
      r.wline([x, 0, zb], [x, h, zb], pc, pw);
      if (o.missing) {
        // 倒在地上的网：一条深色的皱布
        const nc = r.col('#2c2f2c', 1, lit);
        for (let i = 0; i < 6; i++) {
          const z = za + 0.6 + i * ((zb - za - 1.2) / 5);
          const dx = (hash(i, (x * 3) | 0, 61) - 0.5) * 0.9;
          r.wline([x + dx, 0.03, z], [x - dx * 0.6, 0.03, z + (zb - za) / 6], nc, 1);
        }
        return;
      }
      const sag = o.sag ? 0.55 : 0.1;
      const N = 8;
      const top: Pt[] = [];
      for (let i = 0; i <= N; i++) {
        const u = i / N;
        top.push([x, h - sag * Math.sin(u * Math.PI) - (o.sag && u > 0.5 ? 0.3 * (u - 0.5) : 0), za + (zb - za) * u]);
      }
      const nc = r.col('#1d2026', 1, lit);
      const pts: Pt[] = [[x, 0.05, za], [x, 0.05, zb], ...top.slice().reverse()];
      r.wpoly(pts, 0, (px, py) => ((px + py) & 1 ? nc : 0));
      const tc = r.col('#f6f3ea', 1, lit);
      for (let i = 0; i < N; i++) {
        if (o.sag && i % 3 === 2) continue;
        r.wline(top[i] as Pt, top[i + 1] as Pt, tc);
      }
    });
  };

  /** 球场灯杆：on 夜里亮（灯光池 + 灯头光晕），broken 灯头没了 */
  const lightPole = (
    x: number,
    z: number,
    h: number,
    o: { on?: boolean; broken?: boolean; lx?: number; lz?: number; r?: number; i?: number } = {},
  ) => {
    const on = !!o.on && !o.broken;
    if (on) lampAt({ x: o.lx ?? x, z: o.lz ?? z, r: o.r ?? 13, i: o.i ?? 0.9 });
    add({ x0: x - 0.2, x1: x + 0.2, z0: z - 0.2, z1: z + 0.2, y0: 0, y1: h + 0.6 }, (r) => {
      const lit = r.litAt(x, z);
      r.wline([x, 0, z], [x, h, z], r.col('#596069', 1, lit), Math.max(1, Math.round(r.k * 0.3)));
      if (o.broken) return;
      const hp = r.P(x, h, z);
      const w = Math.max(2, Math.round(r.k * 0.9));
      const night = dark(r) && on;
      r.rect(
        hp[0] - w / 2,
        hp[1] - 1,
        w,
        Math.max(2, Math.round(r.k * 0.5)),
        night ? r.em('#fffbe6') : r.col('#3a3f47', 1, lit),
      );
      if (night) {
        const p = r.P(x, h + 0.3, z);
        r.glow(p[0], p[1], 6 * 0.6 * r.k * 0.55 + 2, [255, 250, 225], 1.1);
        r.rect(p[0] - 1, p[1] - 1, 3, 2, r.em('#ffffff'));
      }
    });
  };

  /** 步道路灯 */
  const lamp = (x: number, z: number, on: boolean, broken = false) => {
    if (on) lampAt({ x, z, r: 6.5, i: 0.75 });
    add({ x0: x - 0.15, x1: x + 0.15, z0: z - 0.15, z1: z + 0.15, y0: 0, y1: 3.6 }, (r) => {
      const lit = r.litAt(x, z);
      const p = r.P(x, 0, z);
      const t = r.P(x, 3.2, z);
      r.line(p[0], p[1], t[0], t[1], r.col('#3a3a42', 1, lit));
      const night = dark(r) && on;
      r.rect(t[0] - 1, t[1] - 2, 3, 3, night ? r.em('#ffe6a8') : r.col(broken ? '#55504a' : '#2d3038', 1, lit));
      r.pix(t[0], t[1] - 3, r.col('#3a3a42', 1, lit));
      if (night) r.glow(t[0], t[1], 4.5 * r.k * 0.55 + 2, [255, 214, 140], 1);
    });
  };

  /** 遮阳伞 */
  const umbrella = (x: number, z: number, rad: number, c1: string, c2: string, h = 2.4) => {
    cast({ x, z, h: h * 0.8, r: rad * 0.9, tw: 0.05 });
    // 包围盒只包伞面那一截：桌椅（矮）先画、伞面盖在上面
    const e = rad * 0.75;
    add({ x0: x - e, x1: x + e, z0: z - e, z1: z + e, y0: h * 0.6, y1: h + 0.6 }, (r) => {
      const lit = r.litAt(x, z);
      const b = r.P(x, 0, z);
      const t = r.P(x, h, z);
      r.line(b[0], b[1], t[0], t[1], r.col('#e8e2d2', 0.8, lit));
      const rx = rad * r.k * Math.SQRT2;
      const ry = rx * 0.5;
      const A = r.col(c1, 1, lit);
      const B = r.col(c2, 1, lit);
      const A2 = r.col(c1, 0.8, lit);
      const B2 = r.col(c2, 0.8, lit);
      const seg = (px: number, py: number) =>
        Math.floor((Math.atan2((py + 0.5 - t[1]) * 2, px + 0.5 - t[0]) + Math.PI) / (Math.PI / 4)) & 1;
      ellSh(r, t[0], t[1], rx, ry, (px, py) => {
        const dn = py + 0.5 > t[1];
        return seg(px, py) ? (dn ? A2 : A) : dn ? B2 : B;
      });
      const ty = t[1] - Math.max(1, ry * 0.35);
      ellSh(r, t[0], ty, rx * 0.55, ry * 0.55, (px, py) => (seg(px, py) ? A : B));
      r.pix(t[0], ty - ry * 0.55, r.col('#ffffff', 1, lit));
    });
  };

  /** 旗子（动态：随风飘） */
  const flag = (x: number, z: number, h: number, c1: string, c2: string) => {
    addDyn({ x0: x - 0.1, x1: x + 0.1, z0: z - 0.1, z1: z + 0.1, y0: 0, y1: h + 1 }, (r) => {
      const lit = r.litAt(x, z);
      const b = r.P(x, 0, z);
      const t = r.P(x, h, z);
      r.line(b[0], b[1], t[0], t[1], r.col('#d8d8d8', 0.8, lit));
      const fw = Math.max(4, Math.round(r.k * 2));
      const fh = Math.max(3, Math.round(r.k * 1.1));
      const A = r.col(c1, 1, lit);
      const B = r.col(c2, 1, lit);
      const wind = 0.4 + wx.wind;
      for (let i = 1; i <= fw; i++) {
        const dy = Math.round(Math.sin(r.t * (3 + 4 * wx.wind) - i * 0.7 + x) * r.k * 0.3 * wind * (i / fw));
        for (let j = 0; j < fh; j++) r.pix(t[0] + i, t[1] + j + dy, j < fh / 2 ? A : B);
      }
    });
  };

  const car = (x: number, z: number, c: string, rust: boolean) => {
    const L = 1;
    const Wd = 2.2;
    add({ x0: x - L, x1: x + L, z0: z - Wd, z1: z + Wd, y0: 0, y1: 1.6 }, (r) => {
      const lit = r.litAt(x, z);
      box(r, x - L, x + L, z - Wd, z + Wd, 0.15, 0.85, c, { lit });
      box(r, x - 0.85, x + 0.85, z - 1.2, z + 1.2, 0.85, 1.45, rust ? '#7a6a5a' : '#2a3a4c', { lit, top: c });
    });
  };

  /** 串灯（露台、广场） */
  const stringLights = (pts: readonly (readonly [number, number])[], on: boolean, y = 3.2) => {
    if (on) for (const p of pts) lampAt({ x: p[0], z: p[1], r: 3.5, i: 0.35 });
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
    const pal = ['#ffe08a', '#ff9f6a', '#a8f0ff', '#ffd0f0', '#c8ff9a'];
    add({ x0, x1, z0, z1, y0: y - 1.2, y1: y + 0.2 }, (r) => {
      const wc = r.col('#6a5a50', 1, 0);
      const bulbs: [number, number][] = [];
      for (let i = 0; i + 1 < pts.length; i++) {
        const a = pts[i] as readonly [number, number];
        const b = pts[i + 1] as readonly [number, number];
        const N = Math.max(4, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) * r.k * 0.6));
        let prev: [number, number] | null = null;
        for (let s = 0; s <= N; s++) {
          const u = s / N;
          const p = r.P(a[0] + (b[0] - a[0]) * u, y - Math.sin(u * Math.PI) * 0.8, a[1] + (b[1] - a[1]) * u);
          if (prev) r.line(prev[0], prev[1], p[0], p[1], wc);
          prev = p;
          if (s % 2 === 1) bulbs.push(p);
        }
      }
      const night = dark(r) && on;
      bulbs.forEach((p, i) => {
        const c = pal[i % 5] as string;
        if (night) r.rect(p[0], p[1] + 1, 2, 2, r.em(c));
        else r.pix(p[0], p[1] + 1, r.col(on ? c : '#8a8a8a', 0.8, 0));
      });
      if (night) for (const p of bulbs) r.glow(p[0], p[1] + 1, 3.2, [90, 70, 30], 0.8);
    });
    for (const p of [pts[0], pts[pts.length - 1]] as (readonly [number, number])[])
      add({ x0: p[0] - 0.1, x1: p[0] + 0.1, z0: p[1] - 0.1, z1: p[1] + 0.1, y0: 0, y1: y }, (r) =>
        r.wline([p[0], 0, p[1]], [p[0], y, p[1]], r.col('#5a4636', 1, r.litAt(p[0], p[1]))),
      );
  };

  const sack = (x: number, z: number, h: number, c: string, w = 0.7) =>
    add({ x0: x - w, x1: x + w, z0: z - w, z1: z + w, y0: 0, y1: h }, (r) =>
      box(r, x - w, x + w, z - w, z + w, 0, h, c, { lit: r.litAt(x, z) }),
    );
  const planks = (x: number, z: number) =>
    add({ x0: x - 2, x1: x + 2, z0: z - 0.8, z1: z + 0.8, y0: 0, y1: 0.8 }, (r) => {
      const lit = r.litAt(x, z);
      for (let i = 0; i < 3; i++)
        box(r, x - 2, x + 2, z - 0.8, z + 0.8, i * 0.25, i * 0.25 + 0.22, i & 1 ? '#c89a5a' : '#d6aa68', {
          lit,
          edge: false,
        });
    });
  const cone = (x: number, z: number) =>
    add({ x0: x - 0.2, x1: x + 0.2, z0: z - 0.2, z1: z + 0.2, y0: 0, y1: 0.7 }, (r) => {
      const lit = r.litAt(x, z);
      const p = r.P(x, 0, z);
      const s = Math.max(1, Math.round(r.k * 0.3));
      r.rect(p[0] - s, p[1] - 1, s * 2 + 1, 1, r.col('#e2552a', 0.8, lit));
      r.rect(p[0] - s + 1, p[1] - 2 * s - 1, s * 2 - 1, 2 * s, r.col('#ff6a2e', 1, lit));
      r.pix(p[0], p[1] - 2 * s - 1, r.col('#ffffff', 1, lit));
      r.rect(p[0] - s + 1, p[1] - s - 1, s * 2 - 1, 1, r.col('#ffffff', 1, lit));
    });
  const sandPile = (x: number, z: number, rad: number) =>
    add({ x0: x - rad, x1: x + rad, z0: z - rad * 0.6, z1: z + rad * 0.6, y0: 0, y1: 1.2 }, (r) => {
      const p = r.P(x, 0, z);
      const lit = r.litAt(x, z);
      const top = p[1] - r.k * 0.5;
      ellSh(r, p[0], p[1] - r.k * 0.4, rad * r.k * 1.3, rad * r.k * 0.55, (_px, py) =>
        r.col(py < top ? '#e8cfa0' : '#d4b47e', 1, lit),
      );
    });
  /** 风滚草（静态的，荒废的地方） */
  const tumble = (x: number, z: number, rad = 0.7) =>
    add({ x0: x - rad, x1: x + rad, z0: z - rad, z1: z + rad, y0: 0, y1: rad * 2 }, (r) =>
      drawTumble(r, x, 0, z, rad, 0),
    );
  const bush = (x: number, z: number, s: number) =>
    add({ x0: x - 0.4, x1: x + 0.4, z0: z - 0.4, z1: z + 0.4, y0: 0, y1: 0.8 }, (r) => {
      const lit = r.litAt(x, z);
      const p = r.P(x, 0, z);
      const rr = Math.max(1.5, r.k * 0.6 * s);
      const hi = r.col('#8fa057', 1, lit);
      const lo = r.col('#6b7a3f', 1, lit);
      ellSh(r, p[0], p[1] - rr * 0.6, rr, rr * 0.7, (px, py) =>
        hash(px, py, 7) > 0.25 ? (py < p[1] - rr * 0.6 ? hi : lo) : 0,
      );
    });

  const K: Kit = { add, addDyn, cast, lampAt, umbrella, lightPole, stringLights, fenceSeg, cone, wx };

  /* ---------------- 中心球场（stadium_1） ---------------- */
  curFac = 'stadium_1';
  {
    const look = fac.look('stadium_1');
    const cf = look === 'fresh';
    const ok = look === 'fresh' || look === 'worn';
    const seatC = cf ? '#3d6fb6' : look === 'worn' ? '#6a85a8' : '#8c9299';
    const conc = cf ? '#e0d8ca' : ok ? '#d2c8b6' : '#b9ae9c';
    const tiers: { x0: number; x1: number; z0: number; z1: number; h: number }[] = [];
    for (let i = 0; i < 4; i++) tiers.push({ x0: -18, x1: 18, z0: -32 - 2 * i, z1: -30 - 2 * i, h: 1.4 * (i + 1) });
    for (let j = 0; j < 3; j++)
      tiers.push({ x0: 18.5 + 2 * j, x1: 20.5 + 2 * j, z0: -29.5, z1: -12.5, h: 1.2 * (j + 1) });
    for (const [a, b] of [
      [-17.5, -2.4],
      [2.4, 17.5],
    ] as const) {
      tiers.push({ x0: a, x1: b, z0: -11.6, z1: -10.4, h: 0.7 });
      tiers.push({ x0: a, x1: b, z0: -10.4, z1: -9.2, h: 1.4 });
    }
    // 荒废时东看台北头塌了一截（只剩矮的一层）
    const broken = (t: (typeof tiers)[number]) => look === 'ruin' && t.x0 >= 18.5 && t.x0 > 19;
    for (const t of tiers) {
      const h = broken(t) ? t.h * 0.35 : t.h;
      cast({ x0: t.x0, x1: t.x1, z0: t.z0, z1: t.z1, h });
      add({ ...t, y0: 0, y1: h + 0.2 }, (r) => {
        const lit = r.litAt((t.x0 + t.x1) / 2, (t.z0 + t.z1) / 2);
        box(r, t.x0, t.x1, t.z0, t.z1, 0, h, conc, {
          lit,
          top: seatC,
          topSh: (tc) => {
            const d = r.col(seatC, 0.78, lit);
            const hole = r.col(conc, 0.9, lit);
            return (x, y) => {
              if (!cf && hash(x >> 1, y, 5) > (ok ? 0.93 : 0.8)) return hole;
              return x & 1 ? tc : d;
            };
          },
        });
      });
    }
    // 看台背墙（修好了挂绿色横幅）
    cast({ x0: -18.5, x1: 18.5, z0: -39, z1: -38.2, h: 6.6 });
    add({ x0: -18.5, x1: 18.5, z0: -39, z1: -38.2, y0: 0, y1: 7 }, (r) =>
      box(r, -18.5, 18.5, -39, -38.2, 0, 6.6, conc, {
        lit: r.litAt(0, -38),
        face: (_nx, nz) => {
          if (nz === 1)
            fq(r, 'z', -38.2, 0, 1, -14, 14, 4.6, 6.2, r.col(cf ? '#2f6b48' : '#6f7a70', 1, r.litAt(0, -36)));
        },
      }),
    );
    if (cf)
      for (let i = -16; i <= 16; i += 8)
        flag(
          i,
          -38.6,
          9.5,
          ['#e2463c', '#2f7fd8', '#f0c53c', '#3fb37f', '#ffffff'][((i + 16) / 8) | 0] as string,
          '#ffffff',
        );
    // 记分牌
    add({ x0: -21.6, x1: -20.8, z0: -24, z1: -18, y0: 0, y1: 3.6 }, (r) => {
      const lit = r.litAt(-21, -21);
      box(r, -21.6, -20.8, -24, -18, 0, 1.2, '#3b3f46', { lit });
      box(r, -21.6, -20.8, -24, -18, 1.2, 3.4, '#22262c', {
        lit,
        face: (nx) => {
          if (nx !== 1) return;
          fq(r, 'x', -20.8, 1, 0, -23.6, -18.4, 1.5, 3.2, dark(r) && cf ? r.em('#141a10') : r.col('#1a1d22', 1, lit));
          if (cf)
            for (let i = 0; i < 6; i++)
              fq(
                r,
                'x',
                -20.8,
                1,
                0,
                -23.2 + i * 0.8,
                -22.8 + i * 0.8,
                1.9,
                2.9,
                dark(r) ? r.em(i % 3 ? '#ffcf5a' : '#7dff8a') : r.col('#ffcf5a', 1, lit),
              );
        },
      });
    });
    net(F_S1, { missing: look === 'ruin', sag: look === 'mid' || look === 'worn' });
    for (const [x, z] of [
      [-18.8, -37],
      [18.8, -37],
      [-18.8, -11],
      [18.8, -11],
    ] as const) {
      const brk = look === 'ruin' && x > 0 && z > -20;
      lightPole(x, z, brk ? 6 : 13, { on: ok, lx: x * 0.6, lz: -21 + (z + 21) * 0.4, r: 17, i: 0.85, broken: brk });
    }
    if (look === 'ruin') {
      // 塌下来的看台碎块
      const R = mulberry32(0x51a);
      for (let q = 0; q < 14; q++) {
        const x = 19 + R() * 5.5;
        const z = -28 + R() * 9;
        const w = 0.4 + R() * 0.7;
        const d = 0.3 + R() * 0.6;
        const hh = 0.3 + R() * 0.6;
        add({ x0: x - w, x1: x + w, z0: z - d, z1: z + d, y0: 0, y1: hh }, (r) =>
          box(r, x - w, x + w, z - d, z + d, 0, hh, q % 3 ? '#b9ae9c' : '#8c9299', { lit: r.litAt(x, z), edge: false }),
        );
      }
    }
    if (look === 'mid') {
      // 北看台搭着脚手架，场边堆着建材，夜里有一盏工作灯
      add({ x0: -14, x1: 8, z0: -30.6, z1: -29.6, y0: 0, y1: 6.5 }, (r) => {
        const lit = r.litAt(-3, -29);
        const pc = r.col('#a8b0ba', 1, lit);
        const z = -30.1;
        for (let x = -14; x <= 8; x += 2.2) r.wline([x, 0, z], [x, 6.2, z], pc);
        for (const y of [2, 4, 6.2]) r.wline([-14, y, z], [8, y, z], pc);
        for (let x = -14; x < 8; x += 4.4) r.wline([x, 0, z], [x + 2.2, 2, z], pc);
        for (const y of [2, 4]) box(r, -14, 8, -30.5, -29.7, y - 0.15, y, '#c99a58', { lit, edge: false });
      });
      for (let i = 0; i < 3; i++) cone(-12 + i * 6, -28);
      sack(10, -27, 0.9, '#efe7d6');
      sack(11.6, -27.4, 0.6, '#efe7d6');
      planks(-10, -14);
      lightPole(-3, -28.5, 7, { on: true, lx: -3, lz: -25, r: 12, i: 1 });
    }
  }

  /* ---------------- 青训（practice） ---------------- */
  curFac = 'practice';
  {
    const look = fac.look('practice');
    const ok = look === 'fresh' || look === 'worn';
    for (const F of [F_P1, F_P2]) {
      fenceRect(
        F.ox - F.hx,
        F.ox + F.hx,
        F.oz - F.hz,
        F.oz + F.hz,
        3,
        [
          [F.ox, F.oz + F.hz],
          [F.ox + (F.ox < 0 ? F.hx : -F.hx), F.oz + 5],
        ],
        look === 'ruin',
        (F.ox * 13) | 0,
        look === 'fresh',
      );
      net(F, { missing: look === 'ruin' && F.ox > 0, sag: !ok || look === 'worn' });
      for (const [dx, dz] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ] as const)
        lightPole(F.ox + dx * (F.hx + 0.4), F.oz + dz * (F.hz + 0.4), 10, {
          on: look === 'fresh',
          lx: F.ox + dx * F.hx * 0.5,
          lz: F.oz + dz * F.hz * 0.4,
          r: 12,
          i: 0.8,
          broken: look === 'ruin' && dx > 0 && dz < 0,
        });
    }
    const pv = ok ? fac.variant('practice') : null;
    if (pv) practiceVariant(fac, K, pv);
    else if (look === 'fresh') {
      // 发球机和球筐
      const mx = F_P1.ox + 10.6;
      const mz = F_P1.oz;
      add({ x0: mx - 0.45, x1: mx + 0.45, z0: mz - 0.4, z1: mz + 0.4, y0: 0, y1: 1.1 }, (r) => {
        const lit = r.litAt(mx, mz);
        box(r, mx - 0.42, mx + 0.42, mz - 0.35, mz + 0.35, 0.1, 0.65, '#2f5d8a', { lit });
        box(r, mx - 0.4, mx + 0.4, mz - 0.4, mz + 0.4, 0.65, 0.97, '#1e1e1e', { lit, top: '#d7e64a' });
      });
      const bx = F_P2.ox + 12.5;
      const bz = F_P2.oz + 6.5;
      add({ x0: bx - 0.5, x1: bx + 0.5, z0: bz - 0.5, z1: bz + 0.5, y0: 0, y1: 1 }, (r) =>
        box(r, bx - 0.5, bx + 0.5, bz - 0.5, bz + 0.5, 0, 0.9, '#3a6fb0', { lit: r.litAt(bx, bz), top: '#d7e64a' }),
      );
    }
    if (fac.up('practice', 'video_wall')) videoWall(K, look === 'worn');
  }

  /* ---------------- 会员双打（outer_1） ---------------- */
  curFac = 'outer_1';
  {
    const look = fac.look('outer_1');
    const st = fac.state('outer_1');
    const F = F_O1;
    const ok = look === 'fresh' || look === 'worn';
    fenceRect(
      F.ox - F.hx,
      F.ox + F.hx,
      F.oz - F.hz,
      F.oz + F.hz,
      3,
      [
        [F.ox, F.oz - F.hz],
        [F.ox + F.hx, F.oz],
      ],
      look === 'ruin' || look === 'mid',
      77,
      st === 'resurfaced',
    );
    net(F, { sag: !ok || look === 'worn', missing: look === 'ruin' });
    for (const [dx, dz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as const)
      lightPole(F.ox + dx * (F.hx + 0.4), F.oz + dz * (F.hz + 0.4), 10, {
        on: look === 'fresh',
        lx: F.ox + dx * F.hx * 0.5,
        lz: F.oz + dz * F.hz * 0.4,
        r: 12,
        i: 0.8,
      });
    if (st === 'resurfaced') {
      // 西头的遮阳帆
      const x = F.ox - F.hx - 1.6;
      add({ x0: F.ox - F.hx - 3, x1: F.ox - F.hx - 0.5, z0: F.oz - 6, z1: F.oz + 6, y0: 0, y1: 4.5 }, (r) => {
        const lit = r.litAt(F.ox - F.hx, F.oz);
        for (const z of [F.oz - 6, F.oz + 6, F.oz])
          r.wline(
            [x - (z === F.oz ? 1 : 0), 0, z],
            [x - (z === F.oz ? 1 : 0), z === F.oz ? 3 : 4.3, z],
            r.col('#d8d8d8', 0.8, lit),
          );
        r.wpoly(
          [
            [x, 4.2, F.oz - 6],
            [x - 1, 2.9, F.oz],
            [x, 4.2, F.oz + 6],
            [x + 1.6, 3.6, F.oz],
          ],
          r.col('#f3efe4', 1, lit),
        );
        r.wpoly(
          [
            [x, 4.2, F.oz - 6],
            [x + 1.6, 3.6, F.oz],
            [x, 4.2, F.oz + 6],
          ],
          r.col('#e05a3a', 1, lit),
        );
      });
    }
    if (look === 'mid') {
      // 扫完沙、等着翻修：一堆木板和几袋料
      planks(F.ox - 6, F.oz + F.hz + 1.3);
      sack(F.ox + 4, F.oz + F.hz + 1.2, 0.9, '#efe7d6');
      sack(F.ox + 5.5, F.oz + F.hz + 1.4, 0.7, '#d9cdb6');
      for (let i = 0; i < 3; i++) cone(F.ox - 2 + i * 1.6, F.oz - F.hz - 0.9);
    }
  }

  /* ---------------- 红土（outer_23） ---------------- */
  curFac = 'outer_23';
  {
    const look = fac.look('outer_23');
    const ok = look === 'fresh' || look === 'worn';
    for (const Fc of [F_O2, F_O3]) {
      fenceRect(
        Fc.ox - Fc.hx,
        Fc.ox + Fc.hx,
        Fc.oz - Fc.hz,
        Fc.oz + Fc.hz,
        3,
        [[Fc.ox, Fc.oz - Fc.hz]],
        !ok,
        (Fc.oz * 7) | 0,
        look === 'fresh',
      );
      net(Fc, { missing: !ok && Fc.oz > 30, sag: !ok || look === 'worn' });
      for (const [dx, dz] of [
        [-1, -1],
        [1, 1],
      ] as const)
        lightPole(Fc.ox + dx * (Fc.hx + 0.4), Fc.oz + dz * (Fc.hz + 0.4), 10, {
          on: look === 'fresh',
          lx: Fc.ox + dx * Fc.hx * 0.4,
          lz: Fc.oz,
          r: 15,
          i: 0.9,
        });
    }
    if (ok) outer23Extras(fac, K);
  }

  /* ---------------- 匹克球（stadium_3） ---------------- */
  curFac = 'stadium_3';
  {
    const look = fac.look('stadium_3');
    const ok = look === 'fresh' || look === 'worn';
    const sv = ok ? fac.variant('stadium_3') : null;
    if (sv) {
      // 变体（四片匹克球 / 两片网球场）：围网、网、灯都在 variants.ts
      fenceRect(
        PICKLE.x0,
        PICKLE.x1,
        PICKLE.z0,
        PICKLE.z1,
        sv === 'tennis2' ? 3 : 2.6,
        [[PICKLE.x0, 6]],
        false,
        99,
        sv === 'tennis2' && look === 'fresh',
      );
      stadium3Variant(fac, K, sv);
    } else {
      fenceRect(PICKLE.x0, PICKLE.x1, PICKLE.z0, PICKLE.z1, 2.6, [[PICKLE.x0, 6]], !ok, 99);
      if (look !== 'ruin') {
        net(F_PB1, { pick: true, missing: !ok });
        net(F_PB2, { pick: true, missing: !ok, sag: look === 'worn' });
      }
    }
    if (sv) {
      // 同上
    } else if (look === 'fresh') {
      lampAt({ x: 44, z: 6, r: 12, i: 0.8 });
      lightPole(36.2, -2.8, 8, { on: true, r: 5, i: 0.4 });
      lightPole(51.8, 14.8, 8, { on: true, r: 5, i: 0.4 });
    } else {
      lightPole(36.2, -2.8, 8, { broken: look === 'ruin' });
      if (look === 'ruin') {
        tumble(40, 4, 0.6);
        sandPile(47, 9, 2.4);
        sandPile(41, 12, 1.8);
      }
      if (look === 'mid') {
        // 刚挖出来：场边一堆沙、几个锥桶
        sandPile(50, 13.2, 1.6);
        for (let i = 0; i < 3; i++) cone(38 + i * 1.6, -2);
      }
    }
  }

  /* ---------------- 会所和露台（clubhouse） ---------------- */
  curFac = 'clubhouse';
  {
    const look = fac.look('clubhouse');
    const cb = look === 'fresh';
    const ruin = look === 'ruin';
    const wallC = cb ? '#f4e7d1' : ruin ? '#c9b598' : '#e6d6bd';
    const roofC = cb ? '#c9563a' : ruin ? '#97604a' : '#b05a40';
    cast({ x0: -60, x1: -42, z0: -38, z1: -14, h: 9.5 });
    cast({ x0: -60, x1: -46, z0: -14, z1: -10.5, h: 4.4 });
    cast({ x0: -45.5, x1: -40.5, z0: -14, z1: -9.5, h: 13 });
    /** 一扇窗：fresh 夜里大多亮灯；worn 一半钉木板、灯不亮；ruin 钉木板或碎了 */
    const winC = (r: DrawContext, seed: number, lit: number): number => {
      if (cb) return dark(r) ? (hash(seed, 3, 1) > 0.25 ? r.em('#ffd27a') : r.em('#3a3550')) : r.col('#3b5874', 1, 0);
      return r.col('#3b4a54', 1, lit);
    };
    const windows =
      (
        r: DrawContext,
        x0: number,
        x1: number,
        z0: number,
        z1: number,
        floors: readonly number[],
        lit: number,
        seedB: number,
      ) =>
      (nx: number, nz: number) => {
        const ax = nx !== 0 ? 'x' : 'z';
        const c = ax === 'x' ? (nx > 0 ? x1 : x0) : nz > 0 ? z1 : z0;
        const a = ax === 'x' ? z0 : x0;
        const b = ax === 'x' ? z1 : x1;
        const n = Math.floor((b - a) / 3);
        for (let f = 0; f < floors.length; f++)
          for (let i = 0; i < n; i++) {
            const u = a + ((b - a) * (i + 0.5)) / n;
            const fy = floors[f] as number;
            const seed = seedB + i * 7 + f * 31 + nx * 3 + nz * 5;
            const boarded = ruin ? hash(seed, 1, 2) > 0.3 : !cb && hash(seed, 1, 4) < 0.5;
            if (boarded || ruin) {
              const wc = boarded ? r.col('#8b6a45', 1, lit) : r.col('#2a2430', 1, lit);
              const p = fq(r, ax, c, nx, nz, u - 0.7, u + 0.7, fy, fy + 1.6, wc);
              if (p && boarded) {
                const bc = r.col('#6a4e30', 1, lit);
                r.line(p[0] as number, p[1] as number, p[4] as number, p[5] as number, bc);
                r.line(p[2] as number, p[3] as number, p[6] as number, p[7] as number, bc);
              }
            } else {
              const wc = winC(r, seed, lit);
              fq(r, ax, c, nx, nz, u - 0.7, u + 0.7, fy, fy + 1.6, wc);
              fq(r, ax, c, nx, nz, u - 0.85, u + 0.85, fy - 0.25, fy, r.col('#ffffff', 0.95, lit));
              if (cb && dark(r) && hash(seed, 3, 1) > 0.25) {
                const pp = r.P(ax === 'x' ? c : u, fy + 0.8, ax === 'x' ? u : c);
                r.glow(pp[0], pp[1], r.k * 2.2, [60, 40, 10], 0.7);
              }
            }
          }
      };
    if (cb) {
      lampAt({ x: -40, z: -26, r: 8, i: 0.5 });
      lampAt({ x: -43, z: -9, r: 7, i: 0.6 });
    }
    add({ x0: -60, x1: -42, z0: -38, z1: -14, y0: 0, y1: 11 }, (r) => {
      const lit = r.litAt(-50, -26);
      box(r, -60, -42, -38, -14, 0, 7.5, wallC, {
        lit,
        noTop: true,
        face: windows(r, -60, -42, -38, -14, [1.3, 4.6], lit, 1),
      });
      if (r.vis(1, 0))
        fq(
          r,
          'x',
          -42,
          1,
          0,
          -24,
          -20.5,
          0,
          3,
          cb ? (dark(r) ? r.em('#ffbf5a') : r.col('#5a3a26', 1, lit)) : r.col('#6e5a44', 1, lit),
        );
      hipRoof(r, -60.7, -41.3, -38.7, -13.3, 7.5, 3.6, roofC, {
        lit,
        holes: ruin
          ? (nx, nz, pts) => {
              if (!r.vis(nx, nz)) return;
              const R2 = mulberry32((nx * 5 + nz * 9 + 20) >>> 0);
              for (let q = 0; q < 4; q++) {
                const u = R2();
                const v = 0.2 + R2() * 0.5;
                const a = pts[0] as Pt;
                const b = pts[1] as Pt;
                const c = pts[2] as Pt;
                const px = a[0] + (b[0] - a[0]) * u + (c[0] - a[0] - (b[0] - a[0]) * u) * v * 0.5;
                const pz = a[2] + (b[2] - a[2]) * u + (c[2] - a[2] - (b[2] - a[2]) * u) * v * 0.5;
                const py = a[1] + (c[1] - a[1]) * v * 0.5;
                const s = r.P(px, py, pz);
                r.ell(s[0], s[1], r.k * 0.9, r.k * 0.5, r.col('#2c2124', 1, lit));
              }
            }
          : null,
      });
    });
    add({ x0: -60, x1: -46, z0: -14, z1: -10.5, y0: 0, y1: 4.8 }, (r) => {
      const lit = r.litAt(-53, -12);
      const arch = cb ? (dark(r) ? r.em('#e8a85a', 0.8) : r.col('#6a4632', 1, lit)) : r.col('#4a3a32', 1, lit);
      box(r, -60, -46, -14, -10.5, 0, 4.2, wallC, {
        lit,
        face: (_nx, nz) => {
          if (nz !== 1) return;
          for (let x = -59; x < -46.5; x += 2.6) {
            fq(r, 'z', -10.5, 0, 1, x + 0.5, x + 2.1, 0, 2.9, arch);
            fq(r, 'z', -10.5, 0, 1, x + 0.8, x + 1.8, 2.9, 3.3, arch);
          }
        },
      });
      box(r, -60.2, -45.8, -14.2, -10.3, 4.2, 4.6, cb ? '#e9d6b8' : '#b8a487', { lit });
    });
    add({ x0: -45.5, x1: -40.5, z0: -14, z1: -9.5, y0: 0, y1: 16 }, (r) => {
      const lit = r.litAt(-43, -12);
      box(r, -45.5, -40.5, -14, -9.5, 0, 12, wallC, {
        lit,
        noTop: true,
        face: (nx, nz) => {
          const ax = nx !== 0 ? 'x' : 'z';
          const c = ax === 'x' ? (nx > 0 ? -40.5 : -45.5) : nz > 0 ? -9.5 : -14;
          const m = ax === 'x' ? -11.75 : -43;
          fq(
            r,
            ax,
            c,
            nx,
            nz,
            m - 0.9,
            m + 0.9,
            9.4,
            11.2,
            cb ? (dark(r) ? r.em('#ffe2a0') : r.col('#2a2a36', 1, lit)) : r.col('#1f1a22', 1, lit),
          );
          fq(
            r,
            ax,
            c,
            nx,
            nz,
            m - 0.6,
            m + 0.6,
            4.5,
            6.2,
            cb ? winC(r, 91 + nx + nz * 2, lit) : r.col('#8b6a45', 1, lit),
          );
          if (nz === 1 && cb) fq(r, ax, c, nx, nz, m - 1.6, m + 1.6, 7.2, 8.2, r.col('#2f7a4a', 1, lit));
        },
      });
      hipRoof(r, -45.9, -40.1, -14.4, -9.1, 12, 3, roofC, { lit });
      if (cb && dark(r)) {
        const p = r.P(-43, 10.3, -11.75);
        r.glow(p[0], p[1], 7 * r.k * 0.55 + 2, [255, 200, 120], 0.9);
      }
    });
    if (cb) flag(-43, -11.75, 17.5, '#2f7a4a', '#f0c53c');

    // 露台：柱子、藤架、桌子和伞、串灯
    for (const x of [-36.6, -26.4])
      for (let z = -35.5; z <= -11; z += 6) {
        if (ruin && hash(x | 0, z | 0, 4) < 0.3) continue;
        add({ x0: x - 0.2, x1: x + 0.2, z0: z - 0.2, z1: z + 0.2, y0: 0, y1: 3.3 }, (r) =>
          box(r, x - 0.18, x + 0.18, z - 0.18, z + 0.18, 0, 3.2, '#f2eadc', { lit: r.litAt(x, z), edge: false }),
        );
      }
    add({ x0: TERRACE.x0, x1: TERRACE.x1, z0: TERRACE.z0, z1: TERRACE.z1, y0: 3.0, y1: 3.5 }, (r) => {
      const lit = r.litAt(-31, -23);
      const bc = ruin ? '#a99880' : '#f2eadc';
      const c = r.col(bc, 1, lit);
      for (const x of [-36.6, -26.4]) box(r, x - 0.2, x + 0.2, -35.7, -10.8, 3.1, 3.4, bc, { lit, edge: false });
      for (let z = -35; z < -11; z += 2.2) {
        if (ruin && hash((z * 10) | 0, 1, 3) < 0.45) continue;
        r.wline([-36.8, 3.45, z], [-26.2, 3.45, z], c);
      }
    });
    const cv = ruin ? null : fac.variant('clubhouse');
    if (cv) clubVariant(fac, K, cv);
    else if (!ruin) {
      const ucols = [
        ['#ff8a3d', '#ffffff'],
        ['#17a2b8', '#ffffff'],
        ['#e2463c', '#fff3d6'],
      ] as const;
      let u = 0;
      for (const x of [-34, -29])
        for (const z of [-32, -26, -20, -14.5]) {
          const c = ucols[u++ % 3] as readonly [string, string];
          add({ x0: x - 0.7, x1: x + 0.7, z0: z - 0.7, z1: z + 0.7, y0: 0, y1: 0.9 }, (r) => {
            const lit = r.litAt(x, z);
            const p = r.P(x, 0.85, z);
            const b = r.P(x, 0, z);
            r.line(b[0], b[1], p[0], p[1], r.col('#999999', 1, lit));
            r.ell(p[0], p[1], 0.8 * r.k * 1.41, 0.8 * r.k * 0.7, r.col('#ffffff', 1, lit));
          });
          if (cb) umbrella(x, z, 1.5, c[0], c[1], 2.6);
        }
      stringLights(
        [
          [-36.6, -35.5],
          [-26.4, -29.5],
          [-36.6, -23.5],
          [-26.4, -17.5],
          [-36.6, -11.5],
        ],
        cb,
        3.3,
      );
    } else {
      const R = mulberry32(0x7e44);
      for (let i = 0; i < 4; i++) {
        const x = -35 + R() * 7;
        const z = -33 + R() * 20;
        add({ x0: x - 0.5, x1: x + 0.5, z0: z - 0.3, z1: z + 0.3, y0: 0, y1: 0.5 }, (r) =>
          box(r, x - 0.5, x + 0.5, z - 0.3, z + 0.3, 0, 0.45, '#a59a88', { lit: r.litAt(x, z) }),
        );
      }
      tumble(-30, -20, 0.7);
      for (let k = 0; k < 3; k++) sandPile(-38.5 + R() * 1.5, -34 + R() * 20, 1.2 + R());
    }
    if (fac.up('clubhouse', 'pro_shop')) proShop(K, look === 'worn');
  }

  /* ---------------- 泳池和小木屋（stadium_2） ---------------- */
  curFac = 'stadium_2';
  {
    const look = fac.look('stadium_2');
    const pf = look === 'fresh';
    const ok = look === 'fresh' || look === 'worn';
    /** 变体：resort 度假（躺椅全打伞、彩色浴巾、游泳圈、草棚吧）/ recovery 冷水恢复池（冰桶、毛巾架、计时钟） */
    const pv = ok ? fac.variant('stadium_2') : null;
    for (let i = 0; i < 3; i++) {
      const x0 = -59 + i * 6.5;
      const x1 = x0 + 4;
      cast({ x0, x1, z0: -0.8, z1: 2.4, h: 3 });
      add({ x0, x1, z0: -0.8, z1: 2.4, y0: 0, y1: 3.2 }, (r) => {
        const lit = r.litAt(x0 + 2, 1);
        const c1 = ok ? '#ffffff' : '#bdb3a4';
        const c2 = ok
          ? pv === 'recovery'
            ? look === 'worn'
              ? '#6a7f96'
              : '#2f5d8a'
            : (['#17a2b8', '#ff8a3d', '#3fb37f'][i] as string)
          : '#8f857a';
        box(r, x0, x1, -0.8, 2.4, 0, 2.5, c1, {
          lit,
          noTop: true,
          sideSh: (nx, nz, _pts, cc) => {
            const a = r.col(c2, faceF(nx, nz), lit);
            const w = Math.max(2, Math.round(r.k * 0.6));
            return (x) => (Math.floor(x / w) & 1 ? a : cc);
          },
          face: (_nx, nz) => {
            if (nz === 1) fq(r, 'z', 2.4, 0, 1, x0 + 0.8, x1 - 0.8, 0, 2.1, r.col(ok ? '#3a2a2a' : '#2a2420', 1, lit));
          },
        });
        hipRoof(r, x0 - 0.2, x1 + 0.2, -1, 2.6, 2.5, 1.0, ok ? '#ffffff' : '#a69c8e', { lit });
      });
    }
    for (let i = 0; i < 6; i++) {
      const x = -59 + i * 3.4;
      const z = 15.2;
      if (!ok && i % 2) continue;
      if (pv === 'recovery') continue;
      const lc = ok ? '#ffffff' : '#a8a092';
      add({ x0: x - 0.4, x1: x + 0.4, z0: z - 1, z1: z + 1, y0: 0, y1: 0.7 }, (r) => {
        const lit = r.litAt(x, z);
        box(r, x - 0.4, x + 0.4, z - 0.9, z + 0.9, 0, 0.3, lc, { lit, edge: false });
        box(r, x - 0.4, x + 0.4, z + 0.4, z + 0.9, 0.3, 0.7, lc, { lit, edge: false });
      });
      if (pf && i % 2 === 0) umbrella(x + 1.7, z + 0.4, 1.3, '#ffcf3a', '#ffffff');
      if (pv === 'resort') resortLounger(K, x, z, i, look === 'worn');
    }
    if (pv) poolVariant(fac, K, pv);
    if (ok) lampAt({ x: -50, z: 8, r: 10, i: 0.6 });
    if (!ok) tumble(-47, 7.5, 0.6);
    // 池子：挖下去的坑，只在洞口里看得见（静态）；水面的闪光放动态层
    const pd = ok ? 0.35 : 2.0;
    const { x0, x1, z0, z1 } = POOL;
    add({ x0, x1, z0, z1, y0: -pd, y1: 0 }, (r) => drawPoolPit(r, look, pd, pv));
    if (ok) addDyn({ x0, x1, z0, z1, y0: -pd, y1: 0.05 }, (r) => drawPoolShimmer(r, look, pd, pv));
    if (fac.up('stadium_2', 'cabanas')) cabanaRow(K, look === 'worn');
  }

  /* ---------------- 棕榈喷泉和球员草坪（plaza） ---------------- */
  curFac = 'plaza';
  {
    const look = fac.look('plaza');
    const fo = look === 'fresh' || look === 'worn';
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * (Math.PI * 2) + 0.39;
      const x = FOUNTAIN.x + Math.cos(a) * 9.2;
      const z = FOUNTAIN.z + Math.sin(a) * 9.2;
      palm(x, z, 8.5 + hash(i, 4, 4) * 2, {
        dead: look === 'ruin' && i % 3 === 0,
        half: look === 'ruin' && i % 3 !== 0,
        up: look === 'fresh',
      });
      if (look === 'fresh') lampAt({ x, z, r: 3, i: 0.6 });
    }
    addDyn({ x0: FOUNTAIN.x - 5, x1: FOUNTAIN.x + 5, z0: FOUNTAIN.z - 5, z1: FOUNTAIN.z + 5, y0: 0, y1: 3.2 }, (r) =>
      drawFountain(r, look, wx),
    );
    if (fo) lampAt({ x: FOUNTAIN.x, z: FOUNTAIN.z, r: 9, i: 0.75 });
    const zv = fo ? fac.variant('plaza') : null;
    if (zv) plazaVariant(fac, K, zv);
    else if (look === 'fresh') {
      for (const a of [0.4, 2, 3.6, 5.2]) {
        const x = FOUNTAIN.x + Math.cos(a) * 11;
        const z = FOUNTAIN.z + Math.sin(a) * 11;
        add({ x0: x - 0.6, x1: x + 0.6, z0: z - 0.25, z1: z + 0.25, y0: 0, y1: 0.6 }, (r) =>
          box(r, x - 0.6, x + 0.6, z - 0.25, z + 0.25, 0.25, 0.5, '#8a5a32', { lit: r.litAt(x, z) }),
        );
      }
      stringLights(
        [
          [32.5, -35],
          [32.5, -29],
          [32.5, -24],
          [32.5, -18.5],
          [32.5, -13],
        ],
        true,
        3.2,
      );
      // 草坪上的野餐毯
      add({ x0: 43.3, x1: 47, z0: 27.6, z1: 30, y0: 0, y1: 0.05 }, (r) => {
        const a = r.col('#e2463c', 1, 0);
        const b = r.col('#ffffff', 1, 0);
        r.wpoly(
          [
            [43.3, 0.02, 27.6],
            [47, 0.02, 27.6],
            [47, 0.02, 30],
            [43.3, 0.02, 30],
          ],
          0,
          (x, y) => (((x >> 1) + (y >> 1)) & 1 ? a : b),
        );
      });
    }
    if (look === 'ruin') {
      const R = mulberry32(0x9a2);
      for (let k = 0; k < 4; k++) sandPile(FOUNTAIN.x + (R() - 0.5) * 18, FOUNTAIN.z + 6 + R() * 4, 1 + R() * 1.2);
      tumble(FOUNTAIN.x - 6, FOUNTAIN.z + 8, 0.6);
    }
    tree(41.5, 22, 5.5, 2.8, look !== 'fresh');
    // 遮阳观赛坡占了东南那棵橡树的地方
    if (zv !== 'shade_lawn') tree(51, 29, 6, 3.2, look === 'ruin');
    if (fac.up('plaza', 'misters')) misters(K, look === 'worn');
  }

  curFac = null;

  /* ---------------- 园区四周的棕榈 ---------------- */
  {
    const spots = [
      [-62, -6],
      [-62, 20],
      [-62, 34],
      [-62, 48],
      [-40, 48],
      [-25, 50],
      [-8, 50],
      [8, 50],
      [28, 50],
      [44, 50],
      [58, 40],
      [58, 26],
      [58, -14],
      [58, -30],
      [48, -41],
      [30, -41],
      [-24, -41],
      [-30, -6],
      [30, -12],
      [-38, -2],
      [-38, 22],
      [-38, 34],
    ] as const;
    for (const [x, z] of spots) {
      const zoneOk = fac.grassAmt(x, z) > 0.4;
      palm(x, z, 8 + hash(x | 0, z | 0, 6) * 3, {
        dead: !zoneOk && hash(x | 0, z | 0, 8) < 0.45,
        half: !zoneOk,
        stump: lv === 1 && !zoneOk && hash(x | 0, z | 0, 9) < 0.12,
      });
    }
  }

  /* ---------------- 围墙和大门（全园的复原程度） ---------------- */
  {
    const fresh = lv === 3;
    const c = fresh ? '#ecd2ac' : '#cdb18c';
    const wallRun = (x0: number, z0: number, x1: number, z1: number) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const n = Math.max(1, Math.round(len / 6));
      for (let i = 0; i < n; i++) {
        const a = i / n;
        const b = (i + 1) / n;
        const ax = x0 + (x1 - x0) * a;
        const az = z0 + (z1 - z0) * a;
        const bx = x0 + (x1 - x0) * b;
        const bz = z0 + (z1 - z0) * b;
        const t = 0.3;
        const X0 = Math.min(ax, bx) - (ax === bx ? t : 0);
        const X1 = Math.max(ax, bx) + (ax === bx ? t : 0);
        const Z0 = Math.min(az, bz) - (az === bz ? t : 0);
        const Z1 = Math.max(az, bz) + (az === bz ? t : 0);
        const hsh = hash(Math.round(ax), Math.round(az), 77);
        let h = 2.3;
        let broken = false;
        if (lv === 1 && hsh < 0.3) {
          broken = true;
          h = hsh < 0.1 ? 0 : 0.5 + hsh * 2.5;
        }
        if (lv === 2 && hsh < 0.14) {
          broken = true;
          h = hsh < 0.05 ? 0 : 0.6 + hsh * 4;
        }
        if (h > 0) cast({ x0: X0, x1: X1, z0: Z0, z1: Z1, h });
        add({ x0: X0, x1: X1, z0: Z0, z1: Z1, y0: 0, y1: h + 0.3 }, (r) => {
          const lit = r.litAt((X0 + X1) / 2, (Z0 + Z1) / 2);
          if (h > 0) {
            box(r, X0, X1, Z0, Z1, 0, h, c, {
              lit,
              sideSh: (nx, nz, _pts, cc) => {
                const d = r.col(c, faceF(nx, nz) * 0.9, lit);
                return (x, y) => (y % 5 === 0 && !fresh && hash(x, y, 1) > 0.5 ? d : cc);
              },
            });
            if (!broken)
              box(r, X0 - 0.12, X1 + 0.12, Z0 - 0.12, Z1 + 0.12, h, h + 0.25, fresh ? '#f6e2c2' : '#d8c09e', { lit });
          }
          if (broken) {
            const R2 = mulberry32(Math.round(ax * 7 + az * 3) >>> 0);
            for (let q = 0; q < 5; q++) {
              const rx = X0 + R2() * (X1 - X0);
              const rz = Z0 + R2() * (Z1 - Z0) + (R2() - 0.2) * 1.5;
              box(r, rx - 0.4, rx + 0.4, rz - 0.3, rz + 0.3, 0, 0.35, c, { lit, edge: false });
            }
          }
        });
      }
    };
    const G = GROUNDS;
    wallRun(G.x0, G.z0, G.x1, G.z0);
    wallRun(G.x0, G.z1, G.x1, G.z1);
    wallRun(G.x0, G.z0, G.x0, G.z1);
    wallRun(G.x1, G.z0, G.x1, -5.5);
    wallRun(G.x1, 5.5, G.x1, G.z1);
    for (const z of [-6.2, 6.2]) {
      cast({ x0: 59.3, x1: 60.7, z0: z - 0.7, z1: z + 0.7, h: 5.4 });
      add({ x0: 59.3, x1: 60.7, z0: z - 0.7, z1: z + 0.7, y0: 0, y1: 6 }, (r) => {
        const lit = r.litAt(60, z);
        box(r, 59.3, 60.7, z - 0.7, z + 0.7, 0, 5.4, lv === 1 ? '#b59f80' : '#ecd2ac', { lit });
        box(r, 59.1, 60.9, z - 0.9, z + 0.9, 5.4, 5.8, lv === 1 ? '#9a8a70' : '#f6e2c2', { lit });
        if (dark(r) && (lv > 1 || z > 0)) {
          const p = r.P(60.5, 5.6, z);
          const flick = lv === 1 ? (Math.sin(r.t * 23) > 0.3 || Math.sin(r.t * 3.1) > 0.6 ? 0.8 : 0.08) : 1;
          r.glow(p[0], p[1], (lv === 1 ? 4 : 5) * r.k * 0.55 + 2, lv === 1 ? [255, 180, 90] : [255, 210, 140], flick);
        }
      });
    }
    if (lv > 1) lampAt({ x: 61, z: 0, r: 7, i: 0.8 });
    // 门楣和招牌
    add({ x0: 59.6, x1: 60.4, z0: -5.5, z1: 5.5, y0: 4.3, y1: 5.3 }, (r) => {
      const lit = r.litAt(60, 0);
      const tilt = lv === 1 ? 0.6 : 0;
      r.wpoly(
        [
          [60.2, 4.3 - tilt, -5.5],
          [60.2, 4.3, 5.5],
          [60.2, 5.4, 5.5],
          [60.2, 5.4 - tilt, -5.5],
        ],
        r.col(lv === 1 ? '#56705e' : '#2f7a4a', 0.9, lit),
      );
      if (r.vis(1, 0) || r.vis(-1, 0)) {
        const sx = r.vis(1, 0) ? 60.25 : 59.75;
        drawText(
          r,
          'PALM OASIS',
          sx,
          4.55 - tilt * 0.5,
          -4.6,
          0.95,
          dark(r) && lv > 1 ? r.em('#ffe27a') : r.col(lv === 1 ? '#c9b77a' : '#ffe27a', 1, lit),
        );
      }
    });
    if (lv === 1)
      for (const y of [0.8, 1.7])
        add({ x0: 59.8, x1: 60.2, z0: -5.5, z1: 5.5, y0: y - 0.2, y1: y + 0.2 }, (r) =>
          box(r, 59.8, 60.2, -5.5, 5.5, y - 0.2, y + 0.15, '#8b6a45', { lit: 0, edge: false }),
        );
  }

  /* ---------------- 停车场和车道 ---------------- */
  {
    const carCols = ['#e2463c', '#ffffff', '#2f7fd8', '#f0c53c', '#3a3f47', '#c0c4cc', '#3fb37f', '#7a4fd0', '#ff8a3d'];
    const LOTS = [
      { x0: 64, z0: -26, z1: -6 },
      { x0: 64, z0: 6, z1: 26 },
    ];
    const p = fac.progress;
    for (const L of LOTS)
      for (const row of [L.z0 + 2.6, L.z1 - 2.6])
        for (let i = 0; i < 8; i++) {
          const x = L.x0 + 1.4 + i * 2.8 + 0.2;
          const h = hash(i, row | 0, 31);
          const rusty = lv === 1 && i === 3 && row === -26 + 2.6;
          if (rusty || (lv > 1 && h < 0.05 + 0.67 * p))
            car(x, row, rusty ? '#8a6a4a' : (carCols[Math.floor(h * 97) % carCols.length] as string), rusty);
        }
    for (let x = 64; x <= 90; x += 6.5) {
      palm(x, -5.6, 9 + hash(x, 1, 1) * 2, { dead: lv === 1 && x % 13 < 6, half: lv < 3, up: lv === 3 });
      palm(x + 3, 5.6, 9 + hash(x, 2, 1) * 2, { dead: lv === 1 && x % 13 > 6, half: lv < 3, up: lv === 3 });
    }
    for (const L of LOTS) lightPole(L.x0 + 12, (L.z0 + L.z1) / 2, 8, { on: lv > 1, r: 12, i: 0.75, broken: lv === 1 });
    if (lv === 3) umbrella(62.5, -2.8, 1.2, '#2f7a4a', '#ffffff');
  }

  /* ---------------- 步道路灯 ---------------- */
  for (let x = -30; x <= 54; x += 12) lamp(x, -8.9, lv > 1 && fac.grassAmt(x, -8.9) > 0.3, lv === 1);
  if (lv > 1) for (let x = -28; x <= 28; x += 14) lamp(x, 16.9, fac.grassAmt(x, 16.9) > 0.3);
  for (let z = 0; z <= 48; z += 12) lamp(-38.9, z, lv > 1 && fac.grassAmt(-38.9, z) > 0.3, lv === 1);

  /* ---------------- 高尔夫和沙漠 ---------------- */
  flag(20, 64, 2.2, '#e2463c', '#e2463c');
  flag(60, 67, 2.2, '#e2463c', '#e2463c');
  {
    const RD = mulberry32(55);
    for (let i = 0; i < 70; i++) {
      const x = -80 + RD() * 184;
      const z = -56 + RD() * 138;
      const s = 0.7 + RD() * 0.8;
      const inG = x > GROUNDS.x0 - 2 && x < GROUNDS.x1 + 2 && z > GROUNDS.z0 - 2 && z < GROUNDS.z1 + 2;
      const inL = x > 58 && x < 92 && z > -28 && z < 28;
      const inGolf = z > 55 && z < 77 && x > -64 && x < 96;
      if (!inG && !inL && !inGolf) bush(x, z, s);
    }
    for (let i = 0; i < 8; i++) palm(-75 + i * 4.5, -50 + hash(i, 2, 2) * 6, 10 + hash(i, 3, 3) * 3);
  }

  /* ---------------- 荒废的地方：灌木和风滚草 ---------------- */
  if (lv < 3) {
    const R = mulberry32(0xb05);
    for (let i = 0; i < 40; i++) {
      const x = GROUNDS.x0 + 3 + R() * (GROUNDS.x1 - GROUNDS.x0 - 6);
      const z = GROUNDS.z0 + 3 + R() * (GROUNDS.z1 - GROUNDS.z0 - 6);
      const s = 0.5 + R() * 0.6;
      if (fac.grassAmt(x, z) < 0.1 && !inFacility(fac, x, z)) bush(x, z, s);
    }
    for (const [x, z] of [
      [-10, 10],
      [25, -8],
      [5, 30],
      [-20, -14],
      [48, 28],
    ] as const)
      if (fac.grassAmt(x, z) < 0.1 && !inFacility(fac, x, z)) tumble(x, z, 0.5 + hash(x, z, 3) * 0.3);
  }
  if (lv === 2) {
    // 修复中：西边路口一个黄色垃圾箱
    add({ x0: -41, x1: -38, z0: 20, z1: 24, y0: 0, y1: 2 }, (r) =>
      box(r, -41, -38, 20, 24, 0, 1.6, '#e8b22a', { lit: r.litAt(-39, 22) }),
    );
  }
  return out;
}

/** 清理过（不荒废）的设施范围里不放灌木和风滚草 */
function inFacility(fac: Facilities, x: number, z: number): boolean {
  const rs: [boolean, { ox: number; oz: number; hx: number; hz: number }][] = [
    [fac.look('stadium_1') !== 'ruin', F_S1],
    [fac.look('practice') !== 'ruin', F_P1],
    [fac.look('practice') !== 'ruin', F_P2],
    [fac.look('outer_1') !== 'ruin', F_O1],
    [fac.look('outer_23') !== 'ruin', F_O2],
    [fac.look('outer_23') !== 'ruin', F_O3],
  ];
  for (const [clean, F] of rs) if (clean && Math.abs(x - F.ox) < F.hx && Math.abs(z - F.oz) < F.hz) return true;
  return false;
}

const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const bayer = (x: number, y: number) => BAY[((y & 3) << 2) | (x & 3)] as number;

/* ---------------- 会动的东西 ---------------- */

/** 棕榈：一根弯的树干、一圈下垂的叶子；风越大摆得越厉害 */
function drawPalm(
  r: DrawContext,
  x: number,
  z: number,
  h: number,
  lean: readonly [number, number],
  ph0: number,
  o: { dead?: boolean; half?: boolean; stump?: boolean; up?: boolean },
  wx: Weather,
): void {
  const T = r.t;
  const lit = dark(r) && o.up ? 0.75 : r.litAt(x, z);
  const b = r.P(x, 0, z);
  const t = r.P(x + lean[0], h, z + lean[1]);
  const W = 0.4 + 1.6 * wx.wind;
  t[0] += Math.sin(T * (0.8 + wx.wind) + ph0) * 0.22 * r.k * W;
  const n = Math.max(2, Math.round(b[1] - t[1]));
  const tw = Math.max(1, Math.round(r.k * 0.42));
  const c1 = r.col(o.dead ? '#8a7560' : '#9a7653', 1, lit);
  const c2 = r.col(o.dead ? '#76634f' : '#7f5f40', 1, lit);
  const c3 = r.col('#5e4733', 1, lit);
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const xx = b[0] + (t[0] - b[0]) * u + Math.sin(u * Math.PI) * r.k * 0.5 * (lean[0] > 0 ? 1 : -1);
    const yy = b[1] - i;
    r.rect(Math.round(xx - tw / 2), yy, tw, 1, (i >> 1) & 1 ? c1 : c2);
    r.pix(Math.round(xx - tw / 2) + tw, yy, c3);
  }
  if (o.stump) return;
  const dead = !!o.dead;
  const half = !!o.half;
  const fg = r.col(dead ? '#a18456' : half ? '#9aa04a' : '#3f9a3c', 1, lit);
  const fl = r.col(dead ? '#c4a46c' : half ? '#b8bb5a' : '#68c24a', 1, lit);
  const fd = r.col(dead ? '#7a6440' : half ? '#7c7f36' : '#2a7230', 1, lit);
  const N = dead ? 6 : 8;
  const L = (dead ? 2.6 : 3.8) * r.k;
  const fr: [number, number][] = [];
  for (let j = 0; j < N; j++) {
    const a = (j / N) * (Math.PI * 2) + ph0 + Math.sin(T * 1.3 + ph0 + j) * 0.05 * W;
    fr.push([a, Math.sin(a)]);
  }
  fr.sort((p, q) => p[1] - q[1]);
  if (dead || half)
    for (let i = 0; i < Math.round(r.k * 1.8); i++)
      for (let s = -2; s <= 2; s++) r.pix(t[0] + s * Math.max(1, r.k * 0.4) + (i & 1), t[1] + i + 1, i % 3 ? fd : fg);
  for (const [a] of fr) {
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const steps = Math.round(L * 1.3);
    for (let s = 0; s <= steps; s++) {
      const u = s / steps;
      const fx = ca * L * u;
      const fy =
        sa * L * u * 0.5 +
        (dead ? L * (0.05 * u + 0.95 * u * u) : L * (-0.42 * u + 0.85 * u * u) * 0.6) +
        Math.sin(T * (1.4 + wx.wind * 2) + ph0 + a * 3) * u * u * r.k * 0.25 * W;
      const X = Math.round(t[0] + fx);
      const Y = Math.round(t[1] + fy);
      r.pix(X, Y, sa < 0 ? fd : fg);
      if (u > 0.15) {
        const ll = Math.max(1, Math.round(r.k * 0.35 * (1 - u * 0.5)));
        for (let q = 1; q <= ll; q++) r.pix(X, Y + q, q === ll ? fd : fg);
        if (!dead && (s & 1) === 0) r.pix(X, Y - 1, fl);
      }
    }
  }
  if (!dead) {
    const nut = r.col('#7a4e2a', 1, lit);
    r.pix(t[0], t[1], nut);
    r.pix(t[0] + 1, t[1] + 1, nut);
  }
}

/** 风滚草（一团带辐条纹的枯枝） */
export function drawTumble(r: DrawContext, x: number, y: number, z: number, rad: number, ang: number): void {
  const lit = r.litAt(x, z);
  const p = r.P(x, y + rad, z);
  const R = Math.max(2, rad * r.k * 1.3);
  const c1 = r.col('#a8875a', 1, lit);
  const c2 = r.col('#7d6340', 1, lit);
  ellSh(r, p[0], p[1], R, R * 0.9, (px, py) => {
    const a = Math.atan2(py + 0.5 - p[1], px + 0.5 - p[0]) + ang;
    const d = Math.hypot(px + 0.5 - p[0], py + 0.5 - p[1]) / R;
    return (Math.floor(a * 3 + d * 5) & 1 && hash(px, py, 3) > 0.35) || d > 0.8 ? (d > 0.7 ? c2 : c1) : 0;
  });
  const g = r.P(x, 0, z);
  r.rect(g[0] - 1, g[1], 3, 1, r.col('#5a4a36', 0.7, lit));
}

/** 喷泉：圆池、中间的柱子和小盆；有水时水面有波纹、顶上冒水 */
function drawFountain(r: DrawContext, look: string, wx: Weather): void {
  const T = r.t;
  const fo = look === 'fresh' || look === 'worn';
  const murky = look === 'worn';
  const { x, z } = FOUNTAIN;
  const lit = fo && dark(r) ? 0.75 : r.litAt(x, z);
  const R0 = 5;
  const stone = fo ? '#e9d8b8' : '#c7b392';
  cyl(r, x, z, R0, 0, 0.7, stone, { lit, noTop: true });
  const t = r.P(x, 0.7, z);
  const rx = R0 * r.k * Math.SQRT2;
  const ry = rx * 0.5;
  r.ell(t[0], t[1], rx, ry, r.col(fo ? '#f6ead2' : '#d2c09f', 1, lit));
  const N = dark(r);
  const wl = fo
    ? murky
      ? r.col('#6f8a5a', 1, lit)
      : N
        ? r.em('#3fc0d8', 0.9)
        : r.col('#47b9dc', 1, 0)
    : r.col('#c9ae80', 1, lit);
  const wl2 = fo
    ? murky
      ? r.col('#8aa070', 1, lit)
      : N
        ? r.em('#8fe8f5')
        : r.col('#9fe2f2', 1, 0)
    : r.col('#a58d68', 1, lit);
  const cr = r.col('#7f6a4c', 1, lit);
  ellSh(r, t[0], t[1] + 0.5, rx - 1.6 * r.k, ry - 0.8 * r.k, (px, py) => {
    if (!fo) return Math.abs(fbm(px * 0.15, py * 0.3, 3) - 0.5) < 0.03 ? cr : wl;
    const d = Math.hypot((px - t[0]) / rx, (py - t[1]) / ry);
    return Math.sin(d * 22 - T * 4 + Math.sin(px * 0.3) * 0.5) > (murky ? 0.9 : 0.75) ? wl2 : wl;
  });
  cyl(r, x, z, 0.6, 0.5, 2.0, stone, { lit });
  const b = r.P(x, 2.0, z);
  r.ell(b[0], b[1], 1.7 * r.k * Math.SQRT2, 1.7 * r.k * Math.SQRT1_2, r.col(fo ? '#f6ead2' : '#cdbb98', 0.95, lit));
  r.ell(b[0], b[1] - 1, 1.3 * r.k * Math.SQRT2, 1.3 * r.k * Math.SQRT1_2, fo ? wl : r.col('#a58d68', 1, lit));
  cyl(r, x, z, 0.25, 2.0, 2.8, stone, { lit });
  if (!fo || murky) return;
  const top = r.P(x, 2.9, z);
  const wc = N ? r.em('#c8f8ff') : r.col('#e6fbff', 1, 0);
  const drift = wx.wind * 0.6;
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * (Math.PI * 2);
    const u = (T * 0.9 + i * 0.37) % 1;
    const rr = 0.2 + u * 1.6;
    const y = 2.9 + u * 1.0 - u * u * 1.8;
    const p = r.P(x + Math.cos(a) * rr + drift * u, y, z + Math.sin(a) * rr);
    r.pix(p[0], p[1], wc);
  }
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * (Math.PI * 2) + 0.13;
    const u = (T * 1.3 + i * 0.53) % 1;
    const rr = 1.7 + u * 0.4;
    const y = 1.95 - u * 1.4;
    const p = r.P(x + Math.cos(a) * rr, y, z + Math.sin(a) * rr);
    r.pix(p[0], p[1], wc);
  }
  r.pix(top[0], top[1] - 1, wc);
  r.pix(top[0], top[1] - 2, wc);
}

/** 池底和池壁：只画从地面洞口里看得见的部分（反投影到地面判断是否在池口里） */
function drawPoolPit(r: DrawContext, look: string, d: number, v: string | null = null): void {
  const ok = look === 'fresh' || look === 'worn';
  const { x0, x1, z0, z1 } = POOL;
  const unP = unprojector(r);
  const inside = (px: number, py: number) => {
    const w = unP(px + 0.5, py + 0.5, 0);
    return w[0] >= x0 && w[0] <= x1 && w[1] >= z0 && w[1] <= z1;
  };
  const flp: Pt[] = [
    [x0, -d, z0],
    [x1, -d, z0],
    [x1, -d, z1],
    [x0, -d, z1],
  ];
  if (ok) {
    const murky = look === 'worn';
    const N = dark(r) && !murky;
    if (v === 'recovery') {
      // 冷水恢复池：发白的冰蓝色水、浮着的碎冰、红白浮标的泳道线
      const ice = poolIceColors(r, murky, N);
      r.wpoly(flp, 0, (px, py) => {
        if (!inside(px, py)) return 0;
        const w = unP(px + 0.5, py + 0.5, -d);
        const lane = Math.abs(w[1] - 5.5) < 0.14 || Math.abs(w[1] - 8) < 0.14 || Math.abs(w[1] - 10.5) < 0.14;
        if (lane) return Math.floor(w[0] * 1.4) & 1 ? ice.red : ice.white;
        if (!murky && hash(Math.floor(w[0] * 2.5), Math.floor(w[1] * 2.5), 71) > 0.93) return ice.chunk;
        const s = Math.sin(w[0] * 1.6) + Math.sin(w[1] * 2.1 + w[0] * 0.5);
        return s < -1.2 ? ice.w3 : ice.w1;
      });
    } else {
      const w1 = murky ? r.col('#5f8a6a', 1, 0) : N ? r.em('#1f9fc4') : r.col('#38b4dc', 1, 0);
      const w3 = murky ? r.col('#55785a', 1, 0) : N ? r.em('#178ab0') : r.col('#2a9ccc', 1, 0);
      const ln = murky ? r.col('#4a6a52', 1, 0) : N ? r.em('#16749a') : r.col('#2a7fb0', 1, 0);
      r.wpoly(flp, 0, (px, py) => {
        if (!inside(px, py)) return 0;
        const w = unP(px + 0.5, py + 0.5, -d);
        if (Math.abs(w[1] - 8) < 0.15 || Math.abs(w[1] - 5.5) < 0.12 || Math.abs(w[1] - 10.5) < 0.12) return ln;
        const s = Math.sin(w[0] * 1.6) + Math.sin(w[1] * 2.1 + w[0] * 0.5);
        return s < -1.2 ? w3 : w1;
      });
    }
  } else {
    const tile = r.col('#a9c7cc', 1, 0);
    const sc = r.col('#7a8f3a', 1, 0);
    const sc2 = r.col('#5f7230', 1, 0);
    const lf = r.col('#8a6a3a', 1, 0);
    const cr = r.col('#6f8288', 1, 0);
    r.wpoly(flp, 0, (px, py) => {
      if (!inside(px, py)) return 0;
      const w = unP(px + 0.5, py + 0.5, -d);
      const n = fbm(w[0] * 0.25, w[1] * 0.25, 3);
      if (hash(px, py, 9) > 0.97) return lf;
      if (Math.abs(fbm(w[0] * 0.3, w[1] * 0.3, 8) - 0.5) < 0.015) return cr;
      return n > 0.6 ? sc2 : n > 0.5 ? sc : tile;
    });
  }
  const walls: [number, number, Pt[]][] = [
    [
      1,
      0,
      [
        [x0, 0, z0],
        [x0, 0, z1],
        [x0, -d, z1],
        [x0, -d, z0],
      ],
    ],
    [
      -1,
      0,
      [
        [x1, 0, z0],
        [x1, 0, z1],
        [x1, -d, z1],
        [x1, -d, z0],
      ],
    ],
    [
      0,
      1,
      [
        [x0, 0, z0],
        [x1, 0, z0],
        [x1, -d, z0],
        [x0, -d, z0],
      ],
    ],
    [
      0,
      -1,
      [
        [x0, 0, z1],
        [x1, 0, z1],
        [x1, -d, z1],
        [x0, -d, z1],
      ],
    ],
  ];
  for (const [nx, nz, pts] of walls) {
    if (!r.vis(nx, nz)) continue;
    const c = r.col(ok ? '#9fd6e2' : '#b9cfd2', faceF(nx, nz) * 0.95, 0);
    const c2 = r.col('#6f8a6a', faceF(nx, nz), 0);
    r.wpoly(pts, 0, (px, py) => (!inside(px, py) ? 0 : !ok && hash(px, py >> 1, 4) > 0.85 ? c2 : c));
  }
  if (!ok) {
    // 空池子里的梯子
    const lc = r.col('#c0c6cc', 1, 0);
    r.wline([x1 - 1, 0.6, z0 + 0.1], [x1 - 1, -1.6, z0 + 0.1], lc);
    r.wline([x1 - 1.6, 0.6, z0 + 0.1], [x1 - 1.6, -1.6, z0 + 0.1], lc);
  }
}

/** 池水的闪光（动态）：一些亮色碎点随波纹移动 */
function drawPoolShimmer(r: DrawContext, look: string, d: number, v: string | null = null): void {
  if (look !== 'fresh') return;
  const { x0, x1, z0, z1 } = POOL;
  const N = dark(r);
  const c =
    v === 'recovery' ? (N ? r.em('#d8f8ff') : r.col('#ffffff', 1, 0)) : N ? r.em('#5fd8ef') : r.col('#7ad6ee', 1, 0);
  const T = r.t;
  for (let x = x0 + 0.4; x < x1; x += 0.7)
    for (let z = z0 + 0.4; z < z1; z += 0.7) {
      const s = Math.sin(x * 1.6 + T * 1.8) + Math.sin(z * 2.1 - T * 1.4 + x * 0.5);
      if (s < 1.35) continue;
      const p = r.P(x, -d, z);
      r.pix(p[0], p[1], c);
      if (r.k > 3) r.pix(p[0] + 1, p[1], c);
    }
}

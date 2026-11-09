import { bay, hash, vnoise } from '../../core/color';
import type { DrawContext } from '../../core/graph';
import { box, ellSh, faceF, fq, hipRoof, type Pt, type Shader } from '../../site/indian-wells/kit';

/**
 * 地图长大（ADR 0021）用到的立体小件：砌死的南门、浮空小岛、旧网柱、小屋、宿舍、遮阳棚、大屏、桥、
 * 脚手架、挖掘机、材料垛、施工围挡。都只画画面（参数里的 built / p 是施工进度 0..1），不碰模拟。
 * 画法和 Palm Oasis 的 build.ts 一样：kit 的 box / hipRoof / fq 拼，光从西北偏上来。
 */

const H = (x: number) => Math.max(1, Math.round(x));

/** 天黑了没有（同 site/indian-wells/common.ts 的 dark：门槛按节点深度错开，灯一盏盏亮；这里不引 common，免得成环） */
const dark = (r: DrawContext): boolean =>
  r.night > 0.38 + 0.2 * hash(Math.round(((r as { zcur?: number }).zcur ?? 0) * 4), 5, 41);

/** 地台侧面的土层（和 IsoView 画地台侧面一样的五道颜色，按"离上沿多深"取） */
export function strataSh(r: DrawContext, nx: number, nz: number, pts: readonly Pt[]): Shader {
  const a = r.P(...(pts[3] as Pt));
  const b = r.P(...(pts[2] as Pt));
  const sl = (b[1] - a[1]) / (b[0] - a[0] || 1);
  const f = faceF(nx, nz);
  const L = [r.col('#d9b07a', f), r.col('#c0905c', f), r.col('#a8784a', f), r.col('#8e623e', f), r.col('#74503a', f)];
  // 每米的竖直像素：投影里竖直方向压了 HV（≈ 0.82），这里从 P 量出来
  const kv = Math.abs(r.P(0, 1, 0)[1] - r.P(0, 0, 0)[1]) || 1;
  return (x, y) => {
    const top = a[1] + (x + 0.5 - a[0]) * sl;
    const d = (y + 0.5 - top) / kv + Math.sin(x * 0.13) * 0.35 + (bay(x, y) - 0.5) * 0.4;
    return (d < 0.6 ? L[0] : d < 2.2 ? L[1] : d < 4 ? L[2] : d < 5.6 ? L[3] : L[4]) as number;
  };
}

/* ---------------- 南门 ---------------- */

export interface GateOpts {
  /** 全园复原程度（1 荒、2 修复中、3 修好） */
  lv: number;
  /** 砌死的砖还剩几成（1 = 整面砌死，0 = 拆光） */
  bricks: number;
  /** 新铁门装上了没有（门开着） */
  iron: boolean;
  /** 门柱上的灯（启用以后夜里亮） */
  lamps: boolean;
}

/**
 * 南墙上的旧门：两根粗门柱、门楣，门洞里后砌的一面红砖（和土黄的围墙一眼不一样），钉着两条木板打的叉。
 * 拆的时候砖从上往下少；拆完装一扇往外开的新铁门。门洞 x0..x1，墙线 z。
 */
export function southGate(r: DrawContext, x0: number, x1: number, z: number, o: GateOpts): void {
  const lit = r.litAt((x0 + x1) / 2, z);
  const fresh = o.lv === 3;
  const wallC = fresh ? '#ecd2ac' : '#cdb18c';
  const capC = fresh ? '#f6e2c2' : '#d8c09e';
  const pw = 0.95;
  const ix0 = x0 + pw;
  const ix1 = x1 - pw;
  const PH = 3.9;
  const LT = 3.1;
  const pillar = (a: number) => {
    box(r, a, a + pw, z - 0.55, z + 0.55, 0, PH, wallC, {
      lit,
      sideSh: (nx, nz, _p, cc) => {
        const d = r.col(wallC, faceF(nx, nz) * 0.88, lit);
        return (x, y) => (y % 6 === 0 && hash(x, y, 3) > 0.4 ? d : cc);
      },
    });
    box(r, a - 0.12, a + pw + 0.12, z - 0.67, z + 0.67, PH, PH + 0.3, '#b9653e', { lit });
    box(r, a + 0.25, a + pw - 0.25, z - 0.15, z + 0.15, PH + 0.3, PH + 0.6, '#b9653e', { lit });
  };
  // 门楣
  const lintel = () => {
    box(r, ix0, ix1, z - 0.4, z + 0.4, LT, LT + 0.45, wallC, { lit });
    box(r, ix0 - 0.05, ix1 + 0.05, z - 0.5, z + 0.5, LT + 0.45, LT + 0.62, capC, { lit });
    // 门楣正中一段高起来的山墙（老会所的西班牙式门头），红瓦压顶：远远就认得出这里是一道门
    const cx2 = (ix0 + ix1) / 2;
    box(r, cx2 - 1.3, cx2 + 1.3, z - 0.35, z + 0.35, LT + 0.62, LT + 1.35, wallC, { lit });
    box(r, cx2 - 1.45, cx2 + 1.45, z - 0.48, z + 0.48, LT + 1.35, LT + 1.55, '#b9653e', { lit });
    box(r, cx2 - 0.5, cx2 + 0.5, z - 0.3, z + 0.3, LT + 1.55, LT + 1.9, '#b9653e', { lit });
  };
  // 后砌的红砖：一皮一皮错缝，砖色深浅不一，灰缝浅
  const bh = o.bricks * LT;
  const brickWall = () => {
    if (bh <= 0.05) return;
    const mort = r.col('#d9c3a3', 0.95, lit);
    const shades = ['#a65a3c', '#b4643f', '#97503a', '#bb7048'];
    box(r, ix0, ix1, z - 0.32, z + 0.32, 0, bh, '#a65a3c', {
      lit,
      edge: false,
      sideSh: (nx, nz) => {
        const f = faceF(nx, nz);
        const cs = shades.map((c) => r.col(c, f, lit));
        const rowH = Math.max(2, Math.round(r.k * 0.32));
        const brW = Math.max(3, Math.round(r.k * 0.9));
        return (x, y) => {
          const row = Math.floor(y / rowH);
          if (y % rowH === 0) return mort;
          const off = row & 1 ? brW >> 1 : 0;
          const col = Math.floor((x + off) / brW);
          if ((x + off) % brW === 0) return mort;
          return cs[Math.floor(hash(col, row, 17) * 4)] as number;
        };
      },
    });
    // 门洞原来的拱：一圈浅色的立砖（砌死以后还看得出这里本来是一道门）
    const archC = r.col('#e0b48a', 0.95, lit);
    const span = (ix1 - ix0) / 2;
    const acx = (ix0 + ix1) / 2;
    for (const zz of [z - 0.33, z + 0.33]) {
      const vis = zz < z ? r.vis(0, -1) : r.vis(0, 1);
      if (!vis) continue;
      let prev: Pt | null = null;
      for (let i = 0; i <= 12; i++) {
        const a2 = Math.PI * (i / 12);
        const pt: Pt = [
          acx - Math.cos(a2) * span,
          Math.min(bh, LT - 0.05 - span * 0.55 + Math.sin(a2) * span * 0.55),
          zz,
        ];
        if (prev) r.wline(prev, pt, archC, H(r.k * 0.3));
        prev = pt;
      }
    }
    // 两条木板钉成叉（门砌死以后又钉上的，"别进"）
    if (o.bricks > 0.6) {
      const wc = r.col('#8b6a45', 1, lit);
      const wd = r.col('#6e5235', 1, lit);
      const w = H(r.k * 0.35);
      for (const zz of [z - 0.36, z + 0.36]) {
        const vis = zz < z ? r.vis(0, -1) : r.vis(0, 1);
        if (!vis) continue;
        r.wline([ix0 + 0.2, 0.4, zz], [ix1 - 0.2, Math.min(bh, LT) - 0.3, zz], wc, w);
        r.wline([ix0 + 0.2, Math.min(bh, LT) - 0.3, zz], [ix1 - 0.2, 0.4, zz], wd, w);
        // 一条锈铁链挂着把锁
        const ch = r.col('#5a4a40', 1, lit);
        const mid: Pt = [acx, 1.0, zz];
        r.wline([ix0 + 0.1, 1.5, zz], mid, ch, 1);
        r.wline(mid, [ix1 - 0.1, 1.5, zz], ch, 1);
        const lp = r.P(...mid);
        r.rect(lp[0] - 1, lp[1], 3, 3, r.col('#c9a24a', 1, lit));
      }
    }
  };
  // 新铁门：两扇往外（+z）开着，黑铁栏杆，顶上一道弧
  const ironGate = () => {
    const ic = r.col('#2b2a30', 1, lit);
    const ig = r.col('#c9a24a', 1, lit);
    const leaf = (hx: number, dir: number) => {
      const L = (ix1 - ix0) / 2 - 0.05;
      const ang = 1.15;
      const ex = hx + dir * Math.cos(ang) * L;
      const ez = z + Math.sin(ang) * L;
      const n = 7;
      for (let i = 0; i <= n; i++) {
        const u = i / n;
        const px = hx + (ex - hx) * u;
        const pz = z + (ez - z) * u;
        const top = 2.2 + Math.sin(u * Math.PI) * 0.25 * (dir > 0 ? 1 - u : u) + 0.1;
        r.wline([px, 0.05, pz], [px, top, pz], ic, 1);
        if (i % 2 === 0) r.pix(...r.P(px, top + 0.08, pz), ig);
      }
      r.wline([hx, 2.25, z], [ex, 2.25, ez], ic, H(r.k * 0.2));
      r.wline([hx, 0.35, z], [ex, 0.35, ez], ic, H(r.k * 0.2));
    };
    leaf(ix0, 1);
    leaf(ix1, -1);
  };
  // 从后往前：镜头在北边（看得见 -z 面）时铁门在墙后
  const back = r.vis(0, -1);
  if (o.iron && back) ironGate();
  pillar(x0);
  pillar(ix1);
  brickWall();
  lintel();
  if (o.iron && !back) ironGate();
  // 门柱上的灯
  for (const a of [x0 + pw / 2, ix1 + pw / 2]) {
    const p = r.P(a, LT + 0.2, z + 0.62);
    const night = o.lamps && dark(r);
    r.rect(p[0] - 1, p[1] - 2, 3, 3, night ? r.em('#ffe6a8') : r.col(o.lamps ? '#2d3038' : '#5a4a3a', 1, lit));
    if (night) r.glow(p[0], p[1], 4 * r.k * 0.55 + 2, [255, 214, 140], 1);
  }
}

/* ---------------- 旧网柱、浮空小岛 ---------------- */

/** 一对网柱（锈的旧柱子挂着破网，或者新网）。网沿 z 拉在 x 处，z0..z1 是两根柱子 */
export function netPosts(
  r: DrawContext,
  x: number,
  z0: number,
  z1: number,
  y: number,
  o: { net: 'torn' | 'new'; big?: number },
): void {
  const lit = r.litAt(x, (z0 + z1) / 2);
  const rust = o.net === 'torn';
  const pc = r.col(rust ? '#7a4a30' : '#2a2d33', 1, lit);
  // big：远远看的时候（浮空小岛）柱子放大，一眼认得出是网柱
  const S = o.big ?? 1;
  const pw = H(r.k * 0.28 * S);
  const h = 1.07 * S;
  r.wline([x, y, z0], [x, y + h, z0], pc, pw);
  r.wline([x, y, z1], [x, y + h, z1], pc, pw);
  if (rust) {
    // 锈斑、柱头的摇把
    r.pix(...r.P(x, y + h * 0.6, z0), r.col('#a86a3a', 1, lit));
    r.pix(...r.P(x, y + h * 0.3, z1), r.col('#a86a3a', 1, lit));
  }
  const N = 10;
  const top: Pt[] = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const sag = rust ? 0.75 * Math.sin(u * Math.PI) + (u > 0.6 ? 0.25 : 0) : 0.08 * Math.sin(u * Math.PI);
    top.push([x, y + (0.93 - sag) * S, z0 + (z1 - z0) * u]);
  }
  const nc = r.col(rust ? '#3a3530' : '#1d2026', 1, lit);
  const pts: Pt[] = [[x, y + 0.05, z0], [x, y + 0.05, z1], ...top.slice().reverse()];
  if (rust) {
    // 破网：只剩靠两头的几片，中间大洞
    r.wpoly(pts, 0, (px, py) => {
      if ((px + py) & 1) return 0;
      return hash(px >> 2, py >> 1, 9) > 0.45 ? nc : 0;
    });
  } else r.wpoly(pts, 0, (px, py) => ((px + py) & 1 ? nc : 0));
  const tc = r.col(rust ? '#bdb6a6' : '#f6f3ea', 1, lit);
  for (let i = 0; i < N; i++) if (!rust || i < 3 || i > 7) r.wline(top[i] as Pt, top[i + 1] as Pt, tc);
}

/**
 * 浮空小岛的岛体：顶面（tex 给的颜色，按 0.2 米一格反投影取）、四面土层、底下一层层收进去的岩块和挂着的根。
 * 矩形 x0..x1 × z0..z1，顶面高 y，土层厚 depth。
 */
export function floatingIsle(
  r: DrawContext,
  R: { x0: number; x1: number; z0: number; z1: number },
  y: number,
  depth: number,
  top: (x: number, z: number) => number,
  unP: (sx: number, sy: number, y: number) => [number, number],
): void {
  const { x0, x1, z0, z1 } = R;
  const lit = 0;
  // 底下的岩块：从土层底边收到一个尖（四面三角，按朝向分明暗，越往下越暗），尖下面挂几块碎石
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const yb = y - depth;
  const room = Math.max(0, yb - 0.3);
  const full = Math.min(x1 - x0, z1 - z0) * 0.7;
  const drop = Math.min(room, full);
  const sc = drop / Math.max(1e-6, full);
  if (drop > 0.4) {
    // 尖偏向朝镜头的那个角（不然尖藏在岛身后面，从哪个角度看都要露出来）
    let fx = x0;
    let fz = z0;
    let best = -1e9;
    for (const [qx, qz] of [
      [x0, z0],
      [x1, z0],
      [x1, z1],
      [x0, z1],
    ] as const) {
      const sy = r.P(qx, 0, qz)[1];
      if (sy > best) {
        best = sy;
        fx = qx;
        fz = qz;
      }
    }
    const tip: Pt = [cx + (fx - cx) * 0.45, yb - drop, cz + (fz - cz) * 0.45];
    const faces: [number, number, Pt, Pt][] = [
      [0, -1, [x0, yb, z0], [x1, yb, z0]],
      [1, 0, [x1, yb, z0], [x1, yb, z1]],
      [0, 1, [x1, yb, z1], [x0, yb, z1]],
      [-1, 0, [x0, yb, z1], [x0, yb, z0]],
    ];
    const pTip = r.P(...tip);
    const order = faces
      .map((f) => ({ f, d: r.P((f[2][0] + f[3][0]) / 2, yb, (f[2][2] + f[3][2]) / 2)[1] }))
      .sort((a, b) => a.d - b.d);
    for (const { f } of order) {
      const [nx, nz, a, b] = f;
      if (!r.vis(nx, nz)) continue;
      const ff = faceF(nx, nz) * 0.9;
      const cs = [
        r.col('#a8784a', ff, lit),
        r.col('#8e623e', ff, lit),
        r.col('#74503a', ff, lit),
        r.col('#5c3e2c', ff, lit),
      ];
      const hi = r.col('#c0905c', ff, lit);
      const pa = r.P(...a);
      const span = Math.max(1, pTip[1] - Math.min(pa[1], r.P(...b)[1]));
      r.wpoly([a, b, tip], 0, (px, py) => {
        // 越往下越暗，横着几道不规则的岩层，零星几个亮点
        const t = (py - pa[1]) / span + (vnoise(px * 0.15, py * 0.3, 77) - 0.5) * 0.35;
        const v = hash(px >> 1, py >> 1, 33);
        if (v < 0.05) return hi;
        return cs[t < 0.25 ? 0 : t < 0.5 ? 1 : t < 0.75 ? 2 : 3] as number;
      });
    }
    // 尖下面的碎石
    const rc0 = r.col('#4a3226', 1, lit);
    for (let i = 0; i < 3; i++) {
      const s2 = (0.8 + hash(i, 9, 72) * 0.8) * sc;
      const px = tip[0] + (hash(i, 7, 72) - 0.5) * 6 * sc;
      const pz = tip[2] + (hash(i, 8, 72) - 0.5) * 6 * sc;
      const py = tip[1] - (1.5 + i * 1.6) * sc;
      if (py - s2 < 0.1) continue;
      const q = r.P(px, py, pz);
      const w = Math.max(1, Math.round(s2 * r.k));
      r.rect(q[0] - w / 2, q[1] - w / 2, w, w, rc0);
      r.rect(q[0] - w / 2, q[1] - w / 2, w, 1, r.col('#6f4a33', 1, lit));
    }
  }
  // 挂着的根
  const rc = r.col('#5a4030', 1, lit);
  for (let i = 0; i < 7; i++) {
    const u = hash(i, 4, 71);
    const ex = x0 + 1 + u * (x1 - x0 - 2);
    const ez = r.vis(0, 1) ? z1 : z0;
    const len = (2 + hash(i, 5, 71) * 5) * sc;
    if (len < 0.3) break;
    const a = r.P(ex, y - depth, ez);
    const b = r.P(ex + 0.3, y - depth - len, ez);
    r.line(a[0], a[1], b[0], b[1], rc);
  }
  // 土层侧面
  box(r, x0, x1, z0, z1, y - depth, y, '#b98a58', {
    noTop: true,
    edge: false,
    sideSh: (nx, nz, p) => strataSh(r, nx, nz, p),
  });
  // 顶面
  r.wpoly(
    [
      [x0, y, z0],
      [x1, y, z0],
      [x1, y, z1],
      [x0, y, z1],
    ],
    0,
    (px, py) => {
      const p = unP(px + 0.5, py + 0.5, y);
      if (p[0] < x0 || p[0] >= x1 || p[1] < z0 || p[1] >= z1) return 0;
      return top(p[0], p[1]);
    },
  );
}

/* ---------------- 建筑：小屋、宿舍 ---------------- */

/**
 * 绿洲草坪的小屋（casita）：白灰泥墙、红瓦四坡顶、木门、一扇窗、门口一小片陶砖。
 * built < 1 时是工地：墙砌到一半、顶上是木头框架。门朝 +z（南，朝水塘那边看）时 face = 1。
 */
export function cabin(
  r: DrawContext,
  x: number,
  z: number,
  w: number,
  d: number,
  o: { built: number; face: 1 | -1 },
): void {
  const lit = r.litAt(x, z);
  const x0 = x - w / 2;
  const x1 = x + w / 2;
  const z0 = z - d / 2;
  const z1 = z + d / 2;
  const WH = 2.6;
  const wh = WH * Math.min(1, o.built / 0.6);
  const wallC = '#f3e6cf';
  const night = dark(r);
  if (wh > 0.1)
    box(r, x0, x1, z0, z1, 0, wh, wallC, {
      lit,
      top: o.built < 0.6 ? '#d9c6a6' : wallC,
      face: (nx, nz) => {
        if (o.built < 0.6) return;
        const zf = nz > 0 ? z1 : z0;
        if (nz === o.face) {
          fq(r, 'z', zf, 0, nz, x - 0.5, x + 0.5, 0, 1.9, r.col('#7a4e2e', 1, lit));
          fq(r, 'z', zf, 0, nz, x + 1, x + 2.1, 1.0, 1.9, night ? r.em('#ffd98a') : r.col('#3e5a72', 1, lit));
        }
        if (nx !== 0) {
          const xf = nx > 0 ? x1 : x0;
          fq(r, 'x', xf, nx, 0, z - 0.6, z + 0.6, 1.0, 1.9, night ? r.em('#ffd98a') : r.col('#3e5a72', 1, lit));
        }
      },
    });
  if (o.built >= 0.85) {
    hipRoof(r, x0 - 0.35, x1 + 0.35, z0 - 0.35, z1 + 0.35, WH, 1.4, '#c4583a', { lit });
    // 烟囱（壁炉，沙漠的冬夜冷）
    box(r, x1 - 1.2, x1 - 0.6, z0 + 0.6, z0 + 1.2, WH + 0.6, WH + 1.9, wallC, { lit });
  } else if (o.built >= 0.35) {
    // 屋架：木头椽子
    const wc = r.col('#c89a5a', 1, lit);
    const n = 5;
    for (let i = 0; i <= n; i++) {
      const xx = x0 + (i / n) * w;
      r.wline([xx, wh, z0], [xx, wh + 1.3, (z0 + z1) / 2], wc, 1);
      r.wline([xx, wh, z1], [xx, wh + 1.3, (z0 + z1) / 2], wc, 1);
    }
    r.wline([x0, wh + 1.3, (z0 + z1) / 2], [x1, wh + 1.3, (z0 + z1) / 2], wc, H(r.k * 0.2));
  }
}

/**
 * 学院岛的宿舍：两层，浅灰泥墙、蓝瓦四坡顶、一排窗（夜里一格格亮）、门口雨棚。built < 1 时墙在长、外面围脚手架。
 */
export function dorm(r: DrawContext, R: { x0: number; x1: number; z0: number; z1: number }, built: number): void {
  const { x0, x1, z0, z1 } = R;
  const lit = r.litAt((x0 + x1) / 2, (z0 + z1) / 2);
  const WH = 5.6;
  const wh = WH * Math.min(1, built / 0.7);
  const wallC = '#eef0ea';
  const night = dark(r);
  if (wh > 0.1)
    box(r, x0, x1, z0, z1, 0, wh, wallC, {
      lit,
      face: (nx, nz) => {
        if (built < 0.7) return;
        const win = (on: boolean) => (night && on ? r.em('#ffe3a0') : r.col('#4a6a86', 1, lit));
        if (nz !== 0) {
          const zf = nz > 0 ? z1 : z0;
          const n = Math.floor((x1 - x0) / 1.8);
          for (let i = 0; i < n; i++) {
            const u0 = x0 + 0.6 + i * 1.8;
            for (const [v0, v1] of [
              [1.0, 2.1],
              [3.6, 4.7],
            ] as const)
              fq(r, 'z', zf, 0, nz, u0, u0 + 0.9, v0, v1, win(hash(i, v0 | 0, 23) > 0.35));
          }
          if (nz > 0) fq(r, 'z', zf, 0, nz, (x0 + x1) / 2 - 0.7, (x0 + x1) / 2 + 0.7, 0, 2.2, r.col('#5a3a28', 1, lit));
        } else {
          const xf = nx > 0 ? x1 : x0;
          for (let i = 0; i < 2; i++)
            fq(r, 'x', xf, nx, 0, z0 + 1 + i * 2.4, z0 + 1.9 + i * 2.4, 3.6, 4.7, win(i === 0));
        }
        // 两层之间一道线脚
        if (nz !== 0) fq(r, 'z', nz > 0 ? z1 : z0, 0, nz, x0, x1, 2.8, 3.0, r.col('#d6d2c6', 1, lit));
      },
    });
  if (built >= 0.9) {
    hipRoof(r, x0 - 0.4, x1 + 0.4, z0 - 0.4, z1 + 0.4, WH, 1.8, '#3f6fb0', { lit });
    // 雨棚
    const cx = (x0 + x1) / 2;
    box(r, cx - 1.4, cx + 1.4, z1, z1 + 1.2, 2.4, 2.6, '#3f6fb0', { lit });
  }
  if (built < 1) scaffold(r, x0 - 0.8, x1 + 0.8, z0 - 0.8, z1 + 0.8, Math.max(2.4, wh + 1));
}

/* ---------------- 赛事广场：遮阳棚、大屏、观赛坡 ---------------- */

/**
 * 大遮阳棚：几根桅杆撑起一张白色张拉膜（四个角高低错开，像帆）。sail = 0..1 膜挂上去多少（0 只有桅杆）。
 */
export function canopy(
  r: DrawContext,
  R: { x0: number; x1: number; z0: number; z1: number },
  masts: number,
  sail: number,
): void {
  const { x0, x1, z0, z1 } = R;
  const lit = r.litAt((x0 + x1) / 2, (z0 + z1) / 2);
  const corners: Pt[] = [
    [x0, 7.2, z0],
    [x1, 5.4, z0],
    [x1, 7.6, z1],
    [x0, 5.6, z1],
  ];
  const mc = r.col('#5c636e', 1, lit);
  const cc = r.col('#8a909a', 1, lit);
  const shown = Math.ceil(masts * 4);
  for (let i = 0; i < shown; i++) {
    const c = corners[i] as Pt;
    const h = c[1] + 0.6;
    r.wline([c[0], 0, c[2]], [c[0], h, c[2]], mc, H(r.k * 0.3));
    // 拉索
    const out = [c[0] + (c[0] === x0 ? -2 : 2), 0, c[2] + (c[2] === z0 ? -1.5 : 1.5)] as const;
    r.wline([c[0], h, c[2]], out, cc, 1);
  }
  if (sail <= 0) return;
  // 膜：四边形，每个点按到中心的距离往下垂一点；朝光的一边亮
  const cxs = (x0 + x1) / 2;
  const czs = (z0 + z1) / 2;
  const mid: Pt = [cxs, 5.9, czs];
  const s = Math.min(1, sail);
  const lerp = (a: Pt, b: Pt, t: number): Pt => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
  const wc = r.col('#fbf8f0', 1, lit);
  const wcs = r.col('#e2ded4', 1, lit);
  const wcd = r.col('#cfcabd', 1, lit);
  // 四块三角（四角到中心）：两块亮两块暗，看起来是一张有起伏的膜
  for (let i = 0; i < 4; i++) {
    const a = lerp(mid, corners[i] as Pt, s);
    const b = lerp(mid, corners[(i + 1) % 4] as Pt, s);
    const c = i === 0 || i === 3 ? wc : i === 1 ? wcs : wcd;
    r.wpoly([mid, a, b], c);
  }
  // 膜边：深一点的缝线
  const ec = r.col('#b8b2a4', 1, lit);
  for (let i = 0; i < 4; i++) r.wline(lerp(mid, corners[i] as Pt, s), lerp(mid, corners[(i + 1) % 4] as Pt, s), ec, 1);
}

/** 观赛坡前的大屏（朝 +z）：两条腿、黑框、屏上一块蓝场地（夜里自发光） */
export function bigScreen(r: DrawContext, x0: number, x1: number, z: number, on: boolean): void {
  const lit = r.litAt((x0 + x1) / 2, z);
  const y0 = 2.2;
  const y1 = 6.2;
  const lc = r.col('#3a3f47', 1, lit);
  for (const x of [x0 + 1, x1 - 1]) r.wline([x, 0, z - 0.2], [x, y0, z - 0.2], lc, H(r.k * 0.4));
  box(r, x0, x1, z - 0.5, z, y0, y1, '#2a2d33', { lit });
  if (!r.vis(0, 1)) return;
  const night = r.night > 0.3;
  const scr = (h: string) => (on ? (night ? r.em(h) : r.col(h, 1.05, 0)) : r.col('#20242a', 1, lit));
  const blue = scr('#3a6fd8');
  const green = scr('#2f8a6e');
  const white = scr('#f6f3ea');
  const m = 0.25;
  const pts: Pt[] = [
    [x1 - m, y0 + m, z + 0.02],
    [x0 + m, y0 + m, z + 0.02],
    [x0 + m, y1 - m, z + 0.02],
    [x1 - m, y1 - m, z + 0.02],
  ];
  const a = r.P(x0 + m, y1 - m, z);
  const b = r.P(x1 - m, y0 + m, z);
  r.wpoly(pts, 0, (px, py) => {
    if (!on) return blue === green ? blue : r.col('#20242a', 1, lit);
    const u = (px - a[0]) / (b[0] - a[0] || 1);
    const v = (py - a[1]) / (b[1] - a[1] || 1);
    if (u < 0.12 || u > 0.88 || v < 0.15 || v > 0.85) return green;
    if (Math.abs(u - 0.5) < 0.012 || Math.abs(v - 0.5) < 0.03 || u < 0.135 || u > 0.865) return white;
    return blue;
  });
  if (on && night) {
    const c = r.P((x0 + x1) / 2, (y0 + y1) / 2, z + 0.5);
    r.glow(c[0], c[1], (x1 - x0) * r.k * 0.45, [120, 160, 255], 0.5);
  }
}

/**
 * 观赛坡的一级台阶：草顶、混凝土立面（朝北的一面，看大屏的人坐在草上）。台阶沿 x 拉开。
 * grass = false 时是还没铺草的土台（施工）。
 */
export function terrace(
  r: DrawContext,
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  h: number,
  grass: boolean,
): void {
  const lit = r.litAt((x0 + x1) / 2, (z0 + z1) / 2);
  const top = grass ? '#77c452' : '#c9a676';
  box(r, x0, x1, z0, z1, 0, h, '#d8d0c0', {
    lit,
    top,
    edge: grass,
    topSh: (tc) => {
      if (!grass) return (x, y) => (hash(x, y, 5) > 0.9 ? r.col('#b8945f', 1, lit) : tc);
      const g2 = r.col('#6ab748', 1, lit);
      return (x, y) => ((x + (y >> 1)) % 7 === 0 ? g2 : tc);
    },
    sideSh: (nx, nz, _p, cc) => {
      if (grass) return null;
      const d = r.col('#b08a58', faceF(nx, nz), lit);
      return (x, y) => (hash(x, y, 6) > 0.7 ? d : cc);
    },
  });
}

/* ---------------- 桥 ---------------- */

/**
 * 去学院岛的桥：木板桥面、两边绳栏和木柱、下面几根桥墩伸进雾里。沿 z 从 z0 到 z1，len = 0..1 已经铺到哪儿。
 */
export function bridge(
  r: DrawContext,
  x: number,
  z0: number,
  z1: number,
  w: number,
  len: number,
  lamps: boolean,
): void {
  const lit = r.litAt(x, (z0 + z1) / 2);
  const hw = w / 2;
  const ze = z0 + (z1 - z0) * Math.max(0, Math.min(1, len));
  // 桥墩（往下伸 9 米，看起来是从岛下的岩块里撑出来的）
  const pc = r.col('#6e5235', 1, lit);
  for (let zz = z0 + 3; zz < z1 - 1; zz += 4.5)
    if (zz < ze) {
      for (const sx of [-1, 1]) r.wline([x + sx * (hw - 0.2), -9, zz], [x + sx * (hw - 0.2), 0, zz], pc, H(r.k * 0.35));
      r.wline([x - hw + 0.2, -3, zz], [x + hw - 0.2, -1.2, zz], pc, 1);
    }
  if (ze <= z0) return;
  // 桥面：一块块横木板，深浅交替
  const p1 = r.col('#c89a5a', 1, lit);
  const p2 = r.col('#b48650', 1, lit);
  const gap = r.col('#7a5a3a', 1, lit);
  const a = r.P(x, 0.15, z0);
  const b = r.P(x, 0.15, ze);
  const len2 = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const ux = (b[0] - a[0]) / len2;
  const uy = (b[1] - a[1]) / len2;
  const plank = Math.max(2, Math.round(r.k * 0.55));
  box(r, x - hw, x + hw, z0, ze, -0.25, 0.15, '#b48650', {
    lit,
    edge: false,
    topSh: () => (px, py) => {
      const t = Math.floor(((px - a[0]) * ux + (py - a[1]) * uy) / plank);
      const fr = ((px - a[0]) * ux + (py - a[1]) * uy) / plank - t;
      if (fr < 0.18) return gap;
      return t & 1 ? p1 : p2;
    },
  });
  // 栏杆柱和绳
  const post = r.col('#8b6a45', 1, lit);
  const rope = r.col('#e6d6b0', 1, lit);
  for (const sx of [-1, 1]) {
    const xx = x + sx * (hw - 0.1);
    let prev: Pt | null = null;
    for (let zz = z0; zz <= ze + 0.01; zz += 2) {
      r.wline([xx, 0.15, zz], [xx, 1.2, zz], post, H(r.k * 0.22));
      const top: Pt = [xx, 1.15, zz];
      if (prev) {
        const m: Pt = [xx, 0.85, (prev[2] + zz) / 2];
        r.wline(prev, m, rope, 1);
        r.wline(m, top, rope, 1);
      }
      prev = top;
    }
  }
  // 两头的灯柱
  if (lamps && len >= 1)
    for (const zz of [z0 + 0.4, z1 - 0.4])
      for (const sx of [-1, 1]) {
        const t = r.P(x + sx * (hw + 0.1), 2.2, zz);
        const bt = r.P(x + sx * (hw + 0.1), 0, zz);
        r.line(bt[0], bt[1], t[0], t[1], r.col('#3a3a42', 1, lit));
        const night = dark(r);
        r.rect(t[0] - 1, t[1] - 2, 3, 3, night ? r.em('#ffe6a8') : r.col('#2d3038', 1, lit));
        if (night) r.glow(t[0], t[1], 4 * r.k * 0.55 + 2, [255, 214, 140], 1);
      }
}

/* ---------------- 工地 ---------------- */

/** 脚手架：钢管框、几层木板、斜撑 */
export function scaffold(r: DrawContext, x0: number, x1: number, z0: number, z1: number, h: number): void {
  const lit = r.litAt((x0 + x1) / 2, (z0 + z1) / 2);
  const pc = r.col('#8a8f98', 1, lit);
  const bc = r.col('#d6aa68', 1, lit);
  const levels = Math.max(1, Math.floor(h / 1.8));
  const front: [number, number][] = [];
  const nx = Math.max(2, Math.round((x1 - x0) / 2.4));
  const nz = Math.max(2, Math.round((z1 - z0) / 2.4));
  // 只画朝镜头的两面（背面被建筑挡住），四个角都立管
  const zf = r.vis(0, 1) ? z1 : z0;
  const xf = r.vis(1, 0) ? x1 : x0;
  for (let i = 0; i <= nx; i++) front.push([x0 + ((x1 - x0) * i) / nx, zf]);
  for (let j = 0; j <= nz; j++) front.push([xf, z0 + ((z1 - z0) * j) / nz]);
  for (const [x, z] of front) r.wline([x, 0, z], [x, h, z], pc, 1);
  for (let l = 1; l <= levels; l++) {
    const y = Math.min(h, l * 1.8);
    r.wline([x0, y, zf], [x1, y, zf], bc, H(r.k * 0.25));
    r.wline([xf, y, z0], [xf, y, z1], bc, H(r.k * 0.25));
  }
  // 斜撑
  r.wline([x0, 0, zf], [Math.min(x1, x0 + 3), Math.min(h, 3.6), zf], pc, 1);
  r.wline([xf, 0, z1], [xf, Math.min(h, 3.6), Math.max(z0, z1 - 3)], pc, 1);
}

/** 小挖掘机（黄车身、黑履带、一条折臂，铲斗落地），dir = 臂朝 ±x */
export function excavator(r: DrawContext, x: number, z: number, dir: 1 | -1): void {
  const lit = r.litAt(x, z);
  box(r, x - 1.4, x + 1.4, z - 1.1, z - 0.5, 0, 0.6, '#2a2a2e', { lit, edge: false });
  box(r, x - 1.4, x + 1.4, z + 0.5, z + 1.1, 0, 0.6, '#2a2a2e', { lit, edge: false });
  box(r, x - 1.1, x + 1.1, z - 0.9, z + 0.9, 0.6, 1.5, '#f0b429', { lit });
  box(r, dir > 0 ? x - 1.0 : x - 0.1, dir > 0 ? x + 0.1 : x + 1.0, z - 0.8, z + 0.1, 1.5, 2.6, '#f0b429', { lit });
  const ac = r.col('#e0a020', 1, lit);
  const w = H(r.k * 0.35);
  const s: Pt = [x + 0.9 * dir, 1.4, z + 0.4];
  const e: Pt = [x + 2.6 * dir, 2.8, z + 0.4];
  const b: Pt = [x + 3.6 * dir, 0.4, z + 0.4];
  r.wline(s, e, ac, w);
  r.wline(e, b, ac, w);
  const bp = r.P(...b);
  r.rect(bp[0] - w, bp[1] - w, w * 2 + 1, w + 1, r.col('#4a4a50', 1, lit));
  // 驾驶室的窗
  const wp = r.P(x - 0.45 * dir, 2.2, z + 0.12);
  r.rect(wp[0] - 1, wp[1] - 1, 3, 2, r.col('#5a7a90', 1, lit));
}

/** 材料垛：bricks 一垛砖、pipes 一捆管子、roll 一卷围网、pallet 一托袋装水泥 */
export function materials(r: DrawContext, x: number, z: number, kind: 'bricks' | 'pipes' | 'roll' | 'pallet'): void {
  const lit = r.litAt(x, z);
  box(r, x - 0.8, x + 0.8, z - 0.6, z + 0.6, 0, 0.15, '#b08a58', { lit, edge: false });
  if (kind === 'bricks') {
    box(r, x - 0.7, x + 0.7, z - 0.5, z + 0.5, 0.15, 0.95, '#b4643f', {
      lit,
      sideSh: (_nx, _nz, _p, cc) => {
        const m = r.col('#d9c3a3', 1, lit);
        return (px, py) => (py % 2 === 0 || (px + (py & 2)) % 4 === 0 ? m : cc);
      },
    });
  } else if (kind === 'pipes') {
    const pc = r.col('#9aa0a8', 1, lit);
    const pd = r.col('#6e747c', 1, lit);
    for (let i = 0; i < 4; i++)
      r.wline(
        [x - 1.6, 0.3 + (i % 2) * 0.2, z - 0.4 + i * 0.25],
        [x + 1.6, 0.3 + (i % 2) * 0.2, z - 0.4 + i * 0.25],
        i & 1 ? pd : pc,
        H(r.k * 0.2),
      );
  } else if (kind === 'roll') {
    r.cyl(x, z, 0.55, 0.15, 1.3, '#2f4a3c', { lit, top: '#3c5c4a' });
  } else {
    for (let i = 0; i < 2; i++)
      box(r, x - 0.65, x + 0.65, z - 0.5, z + 0.5, 0.15 + i * 0.35, 0.48 + i * 0.35, i ? '#d8d0bc' : '#cfc6b0', {
        lit,
      });
  }
}

/** 施工围挡的一段：橙色塑料网、几根桩（沿直线 a → b） */
export function siteFence(r: DrawContext, ax: number, az: number, bx: number, bz: number): void {
  const lit = r.litAt((ax + bx) / 2, (az + bz) / 2);
  const oc = r.col('#ff7a2e', 1, lit);
  const od = r.col('#d85a1e', 1, lit);
  const h = 1.1;
  r.wpoly(
    [
      [ax, 0.1, az],
      [bx, 0.1, bz],
      [bx, h, bz],
      [ax, h, az],
    ],
    0,
    (x, y) => (((x + y) & 3) === 0 || ((x - y) & 3) === 0 ? (y & 2 ? oc : od) : 0),
  );
  const pc = r.col('#7a6a58', 1, lit);
  const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / 3));
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const x = ax + (bx - ax) * u;
    const z = az + (bz - az) * u;
    r.wline([x, 0, z], [x, h + 0.1, z], pc, 1);
  }
}

/** 测量桩（新地上还没开工的时候插的小旗） */
export function stake(r: DrawContext, x: number, z: number): void {
  const lit = r.litAt(x, z);
  const b = r.P(x, 0, z);
  const t = r.P(x, 0.9, z);
  r.line(b[0], b[1], t[0], t[1], r.col('#d6aa68', 1, lit));
  r.rect(t[0], t[1], 2, 2, r.col('#ff5a8a', 1, lit));
}

/** 倒了的旧旗杆（高尔夫西段关掉的洞）：lean 0..1 倒了多少 */
export function oldPin(r: DrawContext, x: number, z: number, lean: number): void {
  const lit = r.litAt(x, z);
  const a = lean * 1.3;
  const h = 2.2;
  const tx = x + Math.sin(a) * h;
  const ty = Math.cos(a) * h;
  r.wline([x, 0, z], [tx, ty, z], r.col('#d8d8d8', 0.8, lit), 1);
  const t = r.P(tx, ty, z);
  const fw = Math.max(3, Math.round(r.k * 1.4));
  const fh = Math.max(2, Math.round(r.k * 0.8));
  const fc = r.col(lean > 0.5 ? '#b88a7a' : '#d06050', 1, lit);
  for (let i = 1; i <= fw; i++)
    for (let j = 0; j < fh; j++)
      if (hash(i, j, 4) > lean * 0.4) r.pix(t[0] + i, t[1] + j + Math.round(i * lean * 0.5), fc);
}

/** 一段泳池边的躺椅（小泳池庭院） */
export function lounger(r: DrawContext, x: number, z: number): void {
  const lit = r.litAt(x, z);
  box(r, x - 0.35, x + 0.35, z - 0.9, z + 0.9, 0.2, 0.35, '#f6f3ea', { lit });
  box(r, x - 0.35, x + 0.35, z - 0.9, z - 0.4, 0.35, 0.8, '#f6f3ea', { lit });
}

/** 岛上、坡上的小长凳 */
export function bench(r: DrawContext, x: number, z: number, along: 'x' | 'z', broken = false): void {
  const lit = r.litAt(x, z);
  const [hx, hz] = along === 'x' ? [0.9, 0.25] : [0.25, 0.9];
  const c = broken ? '#8a7258' : '#b07a48';
  if (broken) {
    box(r, x - hx, x + hx * 0.2, z - hz, z + hz, 0, 0.25, c, { lit, edge: false });
    return;
  }
  box(r, x - hx, x + hx, z - hz, z + hz, 0.4, 0.5, c, { lit });
  for (const s of [-0.8, 0.8])
    box(
      r,
      x + (along === 'x' ? s * hx : -hx),
      x + (along === 'x' ? s * hx + 0.1 : hx),
      z + (along === 'z' ? s * hz : -hz),
      z + (along === 'z' ? s * hz + 0.1 : hz),
      0,
      0.4,
      '#5a4a3a',
      { lit, edge: false },
    );
}

/** 夜里屋里透出来的一团暖光（给小屋、宿舍门口）；白天什么也不画 */
export function porchGlow(r: DrawContext, x: number, y: number, z: number): void {
  if (!dark(r)) return;
  const p = r.P(x, y, z);
  r.glow(p[0], p[1], 3 * r.k * 0.55 + 2, [255, 200, 120], 0.8);
}

/** 一小团草（岛上） */
export function tuft(r: DrawContext, x: number, z: number, dry: boolean): void {
  const lit = r.litAt(x, z);
  const p = r.P(x, 0, z);
  const rr = Math.max(1.5, r.k * 0.5);
  const hi = r.col(dry ? '#a8a05a' : '#7fbf52', 1, lit);
  const lo = r.col(dry ? '#857c42' : '#5a9a3e', 1, lit);
  ellSh(r, p[0], p[1] - rr * 0.5, rr, rr * 0.6, (px, py) =>
    hash(px, py, 8) > 0.3 ? (py < p[1] - rr * 0.5 ? hi : lo) : 0,
  );
}

/** 一小团云（浮空小岛底下、旁边飘着的；画法同 sky.ts 的云，静止不动） */
export function puff(r: DrawContext, x: number, y: number, z: number, w: number, seed: number): void {
  const top = r.col('#fffaf0', 1, 0);
  const mid = r.col('#f4e8de', 1, 0);
  const bot = r.col('#dccecc', 1, 0);
  const p = r.P(x, y, z);
  const W = w * r.k * 0.7;
  const Hh = W * 0.22;
  for (let i = 0; i < 4; i++) {
    const u = (i / 3 - 0.5) * 1.3;
    const rr = (0.3 + hash(seed, i, 5) * 0.25) * W;
    const cx = p[0] + u * W * 0.55;
    const cy = p[1] - hash(seed, i, 6) * Hh - (1 - Math.abs(u)) * Hh;
    r.ell(cx, cy + rr * 0.15, rr, rr * 0.5, bot);
    r.ell(cx, cy, rr, rr * 0.45, mid);
    r.ell(cx - rr * 0.1, cy - rr * 0.12, rr * 0.75, rr * 0.3, top);
  }
}

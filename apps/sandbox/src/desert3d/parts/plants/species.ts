// Indian Wells / Coachella Valley 低地沙漠原生植物的造型（池塘配方：几大团球面法线的叶团 + 手挑三档色阶）。
// 每个物种几种变体；每种变体按材质分块（叶、枝、花），每块是一个顶点色几何体（顶点色只当接近白的明暗用）。
// 根部在原点（略埋进地里），按实例摆到岛上。尺寸单位米。
import * as THREE from 'three';
import { addGeo, blob, curve, deflect, dirAE, Parts, type Rnd, rr, sweep, tone, tri2, type V3, v3 } from './kit';

/** 一块的材质：三档 [亮, 中, 暗]；foliage = 叶团（lightUp + 档位噪声） */
export interface PartMat {
  ramp: [number, number, number];
  foliage?: boolean;
  edge?: number;
  convex?: number;
}

export interface Species {
  id: string;
  variants: number;
  make(rnd: Rnd, vi: number): Parts;
  sway: number;
  swayH: number;
  scale: [number, number];
  tint: number;
}

// ---------------------------------------------------------------- 调色板（暗档换冷色相）

export const MATS: Record<string, PartMat> = {
  palmFrond: { ramp: [0xa8c44a, 0x6a9040, 0x345a4e], foliage: true },
  straw: { ramp: [0xd4ae6c, 0x9c7650, 0x5a4256], foliage: true },
  palmTrunk: { ramp: [0xa89480, 0x7a6a64, 0x4a4258] },
  pvLeaf: { ramp: [0xc8d66a, 0x8eac4e, 0x3e7468], foliage: true },
  pvBark: { ramp: [0xb8d070, 0x80a058, 0x44685a] },
  yellow: { ramp: [0xffe060, 0xe0a838, 0x8a6650], foliage: true },
  smoke: { ramp: [0xdde2e8, 0xa6b2c4, 0x5e6890], foliage: true },
  greyStem: { ramp: [0xb0aca8, 0x7e7a84, 0x4e4a62] },
  mesquite: { ramp: [0xaed05c, 0x6c9c48, 0x346a5e], foliage: true },
  bark: { ramp: [0x9a7a5a, 0x6a5048, 0x3e3248] },
  creosote: { ramp: [0xbcc062, 0x82924e, 0x3e625a], foliage: true },
  silver: { ramp: [0xdcdcbc, 0xa6ae94, 0x5e6c78], foliage: true },
  jojoba: { ramp: [0xaebe86, 0x768e6a, 0x3c5c62], foliage: true },
  lavLeaf: { ramp: [0xc6c8ac, 0x909c8a, 0x54627a], foliage: true },
  lavender: { ramp: [0xcab6ec, 0x9a84c8, 0x5a4a8a], foliage: true },
  cane: { ramp: [0xa8a270, 0x767058, 0x46445a] },
  caneLeaf: { ramp: [0xa8cc56, 0x6c9a44, 0x34625a], foliage: true },
  red: { ramp: [0xf4703c, 0xc8422e, 0x6a2a42] },
  barrel: { ramp: [0xd8a05e, 0xa0643e, 0x4e3a4c], convex: 0.4 },
  cholla: { ramp: [0xfcf4cc, 0xd6ca94, 0x7e7c90], foliage: true },
  pad: { ramp: [0xbcb8d8, 0x8a88b2, 0x4c4878], convex: 0.4 },
  magenta: { ramp: [0xf674ac, 0xc44882, 0x6a2a60] },
  agave: { ramp: [0xc4d4c2, 0x8aa49c, 0x46626e], convex: 0.4 },
  grass: { ramp: [0xe4d088, 0xb09a62, 0x6a5e62] },
  orange: { ramp: [0xfa9a4c, 0xd06a34, 0x7a4048] },
  pink: { ramp: [0xe896e4, 0xb462c2, 0x5c3a80] },
  verbLeaf: { ramp: [0xa8c470, 0x709a58, 0x3c6260], foliage: true },
  deadwood: { ramp: [0xc0a47e, 0x8a725c, 0x504658] },
};

// ---------------------------------------------------------------- 通用

/** 池塘配方的树冠：中心一大团 + 一圈几团 + 顶上一两团；每团自己的球面法线 */
function canopy(
  P: Parts,
  key: string,
  rnd: Rnd,
  c: V3,
  R: number,
  o: { ring?: number; flatY?: number; spread?: number; top?: number; alt?: string; altP?: number } = {},
) {
  const fy = o.flatY ?? 0.85;
  const sp = o.spread ?? 1;
  const put = (p: V3, r: number) => {
    const k = o.alt && rnd() < (o.altP ?? 0) ? o.alt : key;
    blob(P.get(k), rnd, {
      c: p,
      r: v3(r, r * fy, r),
      detail: 1,
      jitter: 0.07,
      color: tone(rnd, 0.94, 1),
      shade: c,
      mix: 0.15,
      ao: 0.12,
    });
  };
  put(c.clone(), R * 0.7);
  const ring = o.ring ?? 4;
  for (let i = 0; i < ring; i++) {
    const a = (i / ring) * Math.PI * 2 + rnd() * 0.8;
    put(
      c.clone().add(v3(Math.cos(a) * R * 0.55 * sp, -R * 0.15 + rnd() * R * 0.2, Math.sin(a) * R * 0.5 * sp)),
      R * rr(rnd, 0.45, 0.56),
    );
  }
  const top = o.top ?? 1;
  for (let i = 0; i < top; i++)
    put(c.clone().add(v3(rr(rnd, -0.25, 0.25) * R, R * 0.45, rr(rnd, -0.25, 0.25) * R)), R * rr(rnd, 0.42, 0.5));
}

/** 分枝骨架：返回枝梢；木头放进 P.get(key) */
function branches(
  P: Parts,
  key: string,
  rnd: Rnd,
  cfg: {
    trunks: number;
    trunkLen: number;
    r: number;
    lean: number;
    depth: number;
    len: number;
    spread: number;
    bendY: number;
    out: number;
  },
): V3[] {
  const m = P.get(key);
  const tips: V3[] = [];
  const go = (p: V3, d: V3, len: number, r: number, lv: number) => {
    const pts = curve(p, d, len, v3((rnd() - 0.5) * 0.2, cfg.bendY, (rnd() - 0.5) * 0.2), 2);
    const r1 = Math.max(0.06, r * 0.62);
    sweep(m, pts, [r, (r + r1) / 2, r1], 5, tone(rnd, 0.92, 1));
    const end = pts[2];
    if (lv >= cfg.depth) {
      tips.push(end);
      return;
    }
    const ed = end.clone().sub(pts[1]).normalize();
    for (let k = 0; k < 2; k++)
      go(
        end,
        deflect(rnd, ed, cfg.spread * rr(rnd, 0.7, 1.2), end, cfg.out),
        (lv === 0 ? cfg.len : len * 0.72) * rr(rnd, 0.85, 1.1),
        r1,
        lv + 1,
      );
  };
  for (let i = 0; i < cfg.trunks; i++) {
    const az = (i / cfg.trunks) * Math.PI * 2 + rnd() * 1.2;
    const lean = cfg.trunks === 1 ? cfg.lean * rnd() : cfg.lean * rr(rnd, 0.7, 1.1);
    go(
      v3(Math.cos(az) * 0.08, -0.25, Math.sin(az) * 0.08),
      dirAE(az, Math.PI / 2 - lean),
      cfg.trunkLen + 0.25,
      cfg.r,
      0,
    );
  }
  return tips;
}

function centerOf(ps: V3[]): V3 {
  const c = v3();
  for (const p of ps) c.add(p);
  return c.multiplyScalar(1 / Math.max(1, ps.length));
}

function spanOf(ps: V3[], c: V3): number {
  let r = 0;
  for (const p of ps) r = Math.max(r, Math.hypot(p.x - c.x, p.z - c.z));
  return r;
}

// ---------------------------------------------------------------- 加州蒲葵 Washingtonia filifera

const PALM_H = 8.4;

function palm(rnd: Rnd, vi: number): Parts {
  const P = new Parts();
  const H = PALM_H;
  const lean = v3(rr(rnd, -0.45, 0.45), 0, rr(rnd, -0.45, 0.45));
  const axis = (y: number) => v3(lean.x * (Math.max(0, y) / H) ** 1.6, y, lean.z * (Math.max(0, y) / H) ** 1.6);
  // 主干：叶痕环 = 半径一段段起伏
  const segs = 12;
  const pts: V3[] = [];
  const radii: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const y = -0.3 + ((H - 0.2) * i) / segs;
    pts.push(axis(y));
    const flare = y < 0.7 ? 0.2 * (1 - y / 0.7) ** 2 : 0;
    radii.push(0.42 - 0.05 * (y / H) + flare + (i % 2 ? 0.04 : 0));
  }
  sweep(P.get('palmTrunk'), pts, radii, 7, (t) => tone(() => 0.5, 0.88 + 0.12 * t, 1));

  // 枯叶裙：一列列下垂的枯叶，深浅交替成竖纹，下沿参差
  const skirt = P.get('straw');
  const skirtTop = H - 0.25;
  const skirtBot = [1.4, 3.6, 4.8, 2.6][vi % 4];
  const cols = 14;
  const rows = 4;
  const colR: number[] = [];
  const colBot: number[] = [];
  const colK: number[] = [];
  for (let j = 0; j < cols; j++) {
    colR.push((j % 2 ? -0.1 : 0.06) + rr(rnd, -0.05, 0.05));
    colBot.push(skirtBot + rr(rnd, -0.5, 0.35));
    colK.push(j % 2 ? 0.84 : rr(rnd, 0.95, 1));
  }
  const ring = (j: number, i: number) => {
    const jj = j % cols;
    const t = i / rows;
    const y = THREE.MathUtils.lerp(skirtTop, colBot[jj], t);
    const r = 0.88 + colR[jj] + Math.sin(Math.PI * Math.min(1, t * 1.3)) * 0.1 - 0.14 * t + (i === 0 ? -0.12 : 0);
    const a = (jj / cols) * Math.PI * 2;
    const c = axis(y);
    return {
      p: v3(c.x + Math.cos(a) * r, y, c.z + Math.sin(a) * r),
      n: v3(Math.cos(a), 0.75 - 0.35 * t, Math.sin(a)).normalize(),
      c: tone(() => 0, colK[jj] * (1 - 0.12 * t), 1),
    };
  };
  for (let j = 0; j < cols; j++) {
    for (let i = 0; i < rows; i++) {
      const a = ring(j, i);
      const b = ring(j + 1, i);
      const c = ring(j + 1, i + 1);
      const d = ring(j, i + 1);
      skirt.v(a.p, a.n, a.c);
      skirt.v(b.p, b.n, b.c);
      skirt.v(c.p, c.n, c.c);
      skirt.v(a.p, a.n, a.c);
      skirt.v(c.p, c.n, c.c);
      skirt.v(d.p, d.n, d.c);
    }
  }
  const C = axis(H);
  blob(skirt, rnd, { c: C.clone().setY(H - 0.05), r: v3(0.75, 0.5, 0.75), color: tone(rnd, 0.8, 0.85), jitter: 0.1 });

  // 扇叶冠：12 片掌状扇叶，上新下老，最下面几片已经枯黄
  const shade = C.clone().setY(H - 0.4);
  const n = 12;
  for (let k = 0; k < n; k++) {
    const az = k * 2.39996 + rr(rnd, -0.15, 0.15);
    const f = (k + rnd() * 0.7) / n;
    const el = THREE.MathUtils.lerp(0.9, -0.65, f);
    const dead = f > 0.86;
    const m = P.get(dead ? 'straw' : 'palmFrond');
    const d = dirAE(az, el);
    const p0 = C.clone().addScaledVector(d, 0.3);
    const Pm = p0.clone().addScaledVector(d, rr(rnd, 1.1, 1.4));
    sweep(m, [p0, Pm], [0.1, 0.07], 3, tone(rnd, 0.8, 0.85));
    const bd = dirAE(az, el - (dead ? 0.6 : 0.3));
    const s = v3(-Math.sin(az), 0, Math.cos(az));
    const nb = v3().crossVectors(s, bd).normalize();
    const R = rr(rnd, 1.1, 1.35) * (dead ? 0.85 : 1);
    const A = 1.2;
    const lobes = 5;
    const droop = dead ? 0.55 : 0.32 + 0.3 * f;
    const rim: { p: V3; c: THREE.Color }[] = [];
    for (let i = 0; i <= lobes * 2; i++) {
      const a = -A + (2 * A * i) / (lobes * 2);
      const tip = i % 2 === 0;
      const rad = R * (tip ? rr(rnd, 0.92, 1.06) : 0.64);
      const q = Pm.clone()
        .addScaledVector(bd, Math.cos(a) * rad)
        .addScaledVector(s, Math.sin(a) * rad)
        .addScaledVector(nb, (tip ? ((i / 2) % 2 === 0 ? 0.08 : -0.05) : 0) * R + 0.26 * R * Math.abs(Math.sin(a)));
      q.y -= droop * R * (rad / R) ** 2;
      rim.push({ p: q, c: tone(() => 0, tip ? 1 : 0.9, 1) });
    }
    const pc = tone(() => 0, 0.85, 1);
    for (let i = 0; i < rim.length - 1; i++) {
      const a = rim[i];
      const b = rim[i + 1];
      const mid = Pm.clone()
        .add(a.p)
        .add(b.p)
        .multiplyScalar(1 / 3);
      const fn = v3().crossVectors(a.p.clone().sub(Pm), b.p.clone().sub(Pm)).normalize();
      if (fn.y < 0) fn.negate();
      tri2(m, Pm, a.p, b.p, mid.sub(shade).normalize().lerp(fn, 0.4).normalize(), pc, a.c, b.c);
    }
  }
  return P;
}

// ---------------------------------------------------------------- 树

function paloVerde(rnd: Rnd, vi: number): Parts {
  const P = new Parts();
  const tips = branches(P, 'pvBark', rnd, {
    trunks: 2,
    trunkLen: 1.4,
    r: 0.17,
    lean: 0.3,
    depth: 2,
    len: 1.5,
    spread: 0.5,
    bendY: 0.2,
    out: 0.35,
  });
  const c = centerOf(tips);
  const R = Math.max(1.3, spanOf(tips, c) * 0.9);
  // 透气的树冠：团分得开一点，能看见绿枝
  canopy(P, 'pvLeaf', rnd, c.clone().add(v3(0, 0.1, 0)), R, {
    ring: 5,
    flatY: 0.7,
    spread: 1.25,
    top: 1,
    alt: 'yellow',
    altP: vi === 1 ? 0.75 : 0.08,
  });
  return P;
}

function smokeTree(rnd: Rnd): Parts {
  const P = new Parts();
  const tips = branches(P, 'greyStem', rnd, {
    trunks: 4,
    trunkLen: 0.8,
    r: 0.08,
    lean: 0.4,
    depth: 1,
    len: 1.1,
    spread: 0.4,
    bendY: 0.05,
    out: 0.3,
  });
  const c = centerOf(tips);
  canopy(P, 'smoke', rnd, c.clone().add(v3(0, 0.15, 0)), Math.max(1.2, spanOf(tips, c) + 0.3), {
    ring: 4,
    flatY: 0.85,
    top: 2,
  });
  return P;
}

function mesquite(rnd: Rnd): Parts {
  const P = new Parts();
  const tips = branches(P, 'bark', rnd, {
    trunks: 2,
    trunkLen: 0.8,
    r: 0.2,
    lean: 0.35,
    depth: 2,
    len: 1.7,
    spread: 0.7,
    bendY: -0.08,
    out: 0.6,
  });
  const c = centerOf(tips);
  canopy(P, 'mesquite', rnd, c.clone().add(v3(0, 0.05, 0)), Math.max(1.6, spanOf(tips, c) + 0.2), {
    ring: 5,
    flatY: 0.6,
    spread: 1.15,
    top: 1,
  });
  return P;
}

// ---------------------------------------------------------------- 灌木

/** 一丛灌木：一大团 + 一圈 + 顶上一团 */
function bush(P: Parts, key: string, rnd: Rnd, R: number, H: number, ring = 3, fy = 0.8) {
  const m = P.get(key);
  const c = v3(0, H * 0.45, 0);
  // 中心团细一点（轮廓圆），小团用 20 面（球面法线照样圆润）
  const put = (p: V3, r: number, d = 0) =>
    blob(m, rnd, {
      c: p,
      r: v3(r, r * fy, r),
      detail: d,
      jitter: 0.07,
      color: tone(rnd, 0.94, 1),
      shade: c,
      mix: 0.15,
      ao: 0.15,
    });
  put(c.clone(), R * 0.75, 1);
  for (let i = 0; i < ring; i++) {
    const a = (i / ring) * Math.PI * 2 + rnd() * 0.7;
    put(v3(Math.cos(a) * R * 0.5, H * 0.32, Math.sin(a) * R * 0.45), R * rr(rnd, 0.5, 0.6));
  }
  put(v3(rr(rnd, -0.1, 0.1) * R, H * 0.72, rr(rnd, -0.1, 0.1) * R), R * 0.5);
}

function creosote(rnd: Rnd): Parts {
  const P = new Parts();
  const h = rr(rnd, 1.2, 1.6);
  // 灰褐细枝从团缝里露出来
  for (let i = 0; i < 4; i++) {
    const az = (i / 4) * Math.PI * 2 + rnd() * 0.6;
    sweep(
      P.get('bark'),
      curve(v3(0, -0.1, 0), dirAE(az, Math.PI / 2 - rr(rnd, 0.3, 0.6)), h * 0.75, v3(), 1),
      [0.07, 0.05],
      3,
      tone(rnd),
    );
  }
  bush(P, 'creosote', rnd, 0.75, h, 3, 0.85);
  return P;
}

function brittlebush(rnd: Rnd, vi: number): Parts {
  const P = new Parts();
  const R = rr(rnd, 0.55, 0.7);
  bush(P, 'silver', rnd, R, 0.75, 3, 0.75);
  // 黄色雏菊举在叶丛上面，成一片
  const fl = P.get('yellow');
  const nf = vi === 0 ? 3 : 6;
  for (let i = 0; i < nf; i++) {
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd()) * R * 0.7;
    blob(fl, rnd, {
      c: v3(Math.cos(a) * r, 0.85 + rr(rnd, 0.05, 0.2), Math.sin(a) * r),
      r: v3(0.13, 0.09, 0.13),
      color: tone(rnd),
      jitter: 0.1,
    });
  }
  return P;
}

function lavender(rnd: Rnd): Parts {
  const P = new Parts();
  bush(P, 'lavLeaf', rnd, 0.6, 1.2, 3, 1.05);
  const fl = P.get('lavender');
  for (let i = 0; i < 4; i++) {
    const a = rnd() * Math.PI * 2;
    blob(fl, rnd, {
      c: v3(Math.cos(a) * 0.35, rr(rnd, 1.0, 1.25), Math.sin(a) * 0.3),
      r: v3(0.12, 0.17, 0.12),
      color: tone(rnd),
      jitter: 0.12,
    });
  }
  return P;
}

function jojoba(rnd: Rnd): Parts {
  const P = new Parts();
  bush(P, 'jojoba', rnd, rr(rnd, 0.85, 1.0), rr(rnd, 1.0, 1.2), 4, 0.75);
  return P;
}

// ---------------------------------------------------------------- 仙人掌和多肉

function ocotillo(rnd: Rnd, vi: number): Parts {
  const P = new Parts();
  const leafed = vi === 0;
  const n = Math.round(rr(rnd, 9, 12));
  for (let i = 0; i < n; i++) {
    const az = (i / n) * Math.PI * 2 + rnd() * 0.5;
    const d = dirAE(az, Math.PI / 2 - rr(rnd, 0.1, 0.42));
    const len = rr(rnd, 2.6, 3.8);
    const pts = curve(
      v3(Math.cos(az) * 0.06, -0.1, Math.sin(az) * 0.06),
      d,
      len,
      v3(Math.cos(az), 0, Math.sin(az)).multiplyScalar(0.06),
      2,
    );
    // 雨后长叶的杆整根是绿的（叶子贴着杆，粗一点），干季是灰杆
    sweep(
      P.get(leafed ? 'caneLeaf' : 'cane'),
      pts,
      leafed ? [0.13, 0.12, 0.1] : [0.1, 0.09, 0.075],
      4,
      tone(rnd, 0.92, 1),
    );
    if (rnd() < 0.7) {
      const tip = pts[2];
      const dd = tip.clone().sub(pts[1]).normalize();
      sweep(
        P.get('red'),
        [
          tip.clone().addScaledVector(dd, -0.05),
          tip.clone().addScaledVector(dd, 0.25),
          tip.clone().addScaledVector(dd, 0.5),
        ],
        [0.14, 0.12, 0],
        4,
        tone(rnd),
      );
    }
  }
  return P;
}

/** 车床旋转体，带棱（棱和沟交替） */
function lathe(profile: [number, number][], sides: number, rib: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  for (const [y, r] of profile) {
    for (let j = 0; j <= sides; j++) {
      const a = (j / sides) * Math.PI * 2;
      const k = j % 2 === 0 ? 1 + rib : 1 - rib;
      pos.push(Math.cos(a) * r * k, y, Math.sin(a) * r * k);
    }
  }
  const w = sides + 1;
  for (let i = 0; i < profile.length - 1; i++) {
    for (let j = 0; j < sides; j++) {
      const a = i * w + j;
      idx.push(a, a + w, a + w + 1, a, a + w + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function barrel(rnd: Rnd, vi: number): Parts {
  const P = new Parts();
  const h = [0.8, 1.3][vi % 2];
  const r = rr(rnd, 0.34, 0.4);
  const g = lathe(
    [
      [-0.12, r * 0.92],
      [0.15, r],
      [h * 0.5, r * 1.04],
      [h * 0.82, r * 0.95],
      [h, r * 0.5],
      [h + 0.04, 0.02],
    ],
    16,
    0.1,
  );
  // 棱上红刺亮一点，沟里暗一点（ramp 是刺的颜色）
  addGeo(P.get('barrel'), g, (p) => tone(() => 0, Math.cos(Math.atan2(p.z, p.x) * 8) > 0 ? 1 : 0.78, 1));
  const fl = P.get('yellow');
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + rnd() * 0.3;
    blob(fl, rnd, {
      c: v3(Math.cos(a) * r * 0.32, h + 0.02, Math.sin(a) * r * 0.32),
      r: v3(0.1, 0.08, 0.1),
      color: tone(rnd),
      jitter: 0.1,
    });
  }
  return P;
}

function cholla(rnd: Rnd): Parts {
  const P = new Parts();
  const h = rr(rnd, 0.8, 1.1);
  sweep(
    P.get('bark'),
    curve(v3(0, -0.1, 0), dirAE(rnd() * 6, Math.PI / 2 - 0.08), h, v3(), 1),
    [0.13, 0.1],
    5,
    tone(rnd, 0.75, 0.85),
  );
  // 毛茸茸发亮的节：顶上一大团 + 三四个侧团
  const m = P.get('cholla');
  const top = v3(0, h + 0.15, 0);
  blob(m, rnd, { c: top, r: v3(0.3, 0.34, 0.3), detail: 1, jitter: 0.12, color: tone(rnd), ao: 0.1 });
  const k = Math.round(rr(rnd, 3, 4));
  for (let i = 0; i < k; i++) {
    const a = (i / k) * Math.PI * 2 + rnd() * 0.6;
    blob(m, rnd, {
      c: v3(Math.cos(a) * 0.32, h - rr(rnd, 0.05, 0.3), Math.sin(a) * 0.32),
      r: v3(0.17, 0.22, 0.17),
      jitter: 0.2,
      color: tone(rnd, 0.9, 1),
    });
  }
  // 掉在地上的一节
  const a = rnd() * Math.PI * 2;
  blob(m, rnd, {
    c: v3(Math.cos(a) * 0.55, 0.06, Math.sin(a) * 0.55),
    r: v3(0.12, 0.09, 0.15),
    color: tone(rnd, 0.85, 0.9),
    jitter: 0.2,
  });
  return P;
}

function pricklyPear(rnd: Rnd, vi: number): Parts {
  const P = new Parts();
  const pads = P.get('pad');
  const pad = (c: V3, yaw: number, tilt: number, s: number) => {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, tilt, 'YXZ'));
    blob(pads, rnd, { c, r: v3(0.38 * s, 0.46 * s, 0.1), q, color: tone(rnd, 0.9, 1), jitter: 0.05, ao: 0.2 });
    return q;
  };
  const n = vi === 0 ? 4 : 5;
  const first: { c: V3; q: THREE.Quaternion }[] = [];
  for (let i = 0; i < n; i++) {
    const az = (i / n) * Math.PI * 2 + rnd() * 0.5;
    const c = v3(Math.cos(az) * 0.32, 0.3, Math.sin(az) * 0.32);
    first.push({ c, q: pad(c, -az + Math.PI / 2, rr(rnd, 0.2, 0.8) * (rnd() < 0.5 ? 1 : -1), rr(rnd, 0.9, 1.1)) });
  }
  for (let i = 0; i < 2; i++) {
    const p = first[i];
    const c = p.c
      .clone()
      .add(v3(0, 0.42, 0).applyQuaternion(p.q))
      .add(v3(0, 0.3, 0));
    const q = pad(c, rnd() * Math.PI, rr(rnd, -0.4, 0.4), 0.8);
    blob(P.get('magenta'), rnd, {
      c: v3(0, 0.38, 0).applyQuaternion(q).add(c),
      r: v3(0.14, 0.11, 0.14),
      color: tone(rnd),
      jitter: 0.1,
    });
  }
  return P;
}

function agave(rnd: Rnd, vi: number): Parts {
  const P = new Parts();
  const m = P.get('agave');
  const n = 11;
  for (let i = 0; i < n; i++) {
    const az = i * 2.39996;
    const f = i / n;
    const len = THREE.MathUtils.lerp(0.55, 0.95, f) * rr(rnd, 0.9, 1.1);
    const pts = curve(v3(), dirAE(az, THREE.MathUtils.lerp(1.25, 0.25, f)), len, v3(0, -0.18 * f, 0), 2);
    sweep(m, pts, [0.2, 0.13, 0], 4, (t) => tone(() => 0, t > 0.8 ? 0.7 : 1, 1), { flatten: 0.55 });
  }
  if (vi === 1) {
    // 开花的那株：高花茎，顶上几簇黄花
    const pts = curve(v3(), v3(0.05, 1, 0.03), 3.2, v3(0.04, 0, 0.02), 2);
    sweep(P.get('cane'), pts, [0.1, 0.08, 0.06], 4, tone(rnd));
    for (let k = 0; k < 3; k++) {
      const az = k * 2.1;
      blob(P.get('yellow'), rnd, {
        c: pts[0]
          .clone()
          .lerp(pts[2], 0.7 + k * 0.12)
          .add(v3(Math.cos(az) * 0.25, 0, Math.sin(az) * 0.25)),
        r: v3(0.22, 0.16, 0.22),
        color: tone(rnd),
        jitter: 0.12,
      });
    }
  }
  return P;
}

// ---------------------------------------------------------------- 地面：草丛、野花、枯枝（少而成簇）

function grass(rnd: Rnd): Parts {
  const P = new Parts();
  const m = P.get('grass');
  blob(m, rnd, { c: v3(0, 0.06, 0), r: v3(0.22, 0.14, 0.22), color: tone(rnd, 0.82, 0.88), jitter: 0.15 });
  const n = 6;
  for (let i = 0; i < n; i++) {
    const az = (i / n) * Math.PI * 2 + rnd() * 0.5;
    const tilt = rr(rnd, 0.2, 0.7);
    const pts = curve(
      v3(Math.cos(az) * 0.06, 0, Math.sin(az) * 0.06),
      dirAE(az, Math.PI / 2 - tilt),
      rr(rnd, 0.35, 0.55),
      v3(Math.cos(az), -1.2, Math.sin(az)).multiplyScalar(0.12 * tilt),
      1,
    );
    sweep(m, pts, [0.09, 0], 3, (t) => tone(() => 0, 0.88 + 0.12 * t, 1));
  }
  return P;
}

function globemallow(rnd: Rnd): Parts {
  const P = new Parts();
  bush(P, 'silver', rnd, 0.42, 0.45, 2, 0.8);
  const fl = P.get('orange');
  for (let i = 0; i < 4; i++) {
    const a = rnd() * Math.PI * 2;
    blob(fl, rnd, {
      c: v3(Math.cos(a) * 0.2, rr(rnd, 0.5, 0.75), Math.sin(a) * 0.2),
      r: v3(0.11, 0.14, 0.11),
      color: tone(rnd),
      jitter: 0.12,
    });
  }
  return P;
}

function verbena(rnd: Rnd): Parts {
  const P = new Parts();
  for (let i = 0; i < 3; i++) {
    const a = rnd() * Math.PI * 2;
    const r = rr(rnd, 0.1, 0.4);
    blob(P.get('verbLeaf'), rnd, {
      c: v3(Math.cos(a) * r, 0.05, Math.sin(a) * r),
      r: v3(0.32, 0.12, 0.32),
      color: tone(rnd),
      jitter: 0.12,
      rotY: rnd() * 3,
    });
  }
  for (let i = 0; i < 3; i++) {
    const a = rnd() * Math.PI * 2;
    const r = rr(rnd, 0.1, 0.45);
    blob(P.get('pink'), rnd, {
      c: v3(Math.cos(a) * r, 0.17, Math.sin(a) * r),
      r: v3(0.14, 0.1, 0.14),
      color: tone(rnd),
      jitter: 0.1,
    });
  }
  return P;
}

function deadBrush(rnd: Rnd): Parts {
  const P = new Parts();
  const m = P.get('deadwood');
  const n = 7;
  for (let i = 0; i < n; i++) {
    const az = rnd() * Math.PI * 2;
    const d = dirAE(az, rr(rnd, 0.5, 1.3));
    const len = rr(rnd, 0.5, 0.9);
    const pts = curve(
      v3(rr(rnd, -0.1, 0.1), -0.05, rr(rnd, -0.1, 0.1)),
      d,
      len,
      v3(rr(rnd, -0.3, 0.3), -0.25, rr(rnd, -0.3, 0.3)),
      2,
    );
    sweep(m, pts, [0.09, 0.075, 0.06], 3, tone(rnd, 0.85, 1));
  }
  return P;
}

// ---------------------------------------------------------------- 目录

export const SPECIES: Record<string, Species> = {
  palm: { id: 'palm', variants: 4, make: palm, sway: 0.3, swayH: PALM_H, scale: [0.85, 1.12], tint: 0.03 },
  paloVerde: { id: 'paloVerde', variants: 2, make: paloVerde, sway: 0.2, swayH: 4.5, scale: [0.9, 1.15], tint: 0.03 },
  smokeTree: {
    id: 'smokeTree',
    variants: 1,
    make: (r) => smokeTree(r),
    sway: 0.16,
    swayH: 3.2,
    scale: [0.9, 1.15],
    tint: 0.03,
  },
  mesquite: {
    id: 'mesquite',
    variants: 1,
    make: (r) => mesquite(r),
    sway: 0.18,
    swayH: 3.5,
    scale: [0.9, 1.1],
    tint: 0.03,
  },
  creosote: {
    id: 'creosote',
    variants: 2,
    make: (r) => creosote(r),
    sway: 0.12,
    swayH: 1.4,
    scale: [0.7, 1.2],
    tint: 0.04,
  },
  brittlebush: {
    id: 'brittlebush',
    variants: 2,
    make: brittlebush,
    sway: 0.06,
    swayH: 1.0,
    scale: [0.75, 1.15],
    tint: 0.03,
  },
  lavender: {
    id: 'lavender',
    variants: 1,
    make: (r) => lavender(r),
    sway: 0.1,
    swayH: 1.3,
    scale: [0.8, 1.1],
    tint: 0.03,
  },
  jojoba: { id: 'jojoba', variants: 1, make: (r) => jojoba(r), sway: 0.05, swayH: 1.1, scale: [0.8, 1.2], tint: 0.03 },
  ocotillo: { id: 'ocotillo', variants: 2, make: ocotillo, sway: 0.3, swayH: 3.6, scale: [0.85, 1.15], tint: 0.03 },
  barrel: { id: 'barrel', variants: 2, make: barrel, sway: 0, swayH: 1, scale: [0.85, 1.15], tint: 0.03 },
  cholla: { id: 'cholla', variants: 2, make: (r) => cholla(r), sway: 0, swayH: 1, scale: [0.85, 1.2], tint: 0.03 },
  pricklyPear: { id: 'pricklyPear', variants: 2, make: pricklyPear, sway: 0, swayH: 1, scale: [0.85, 1.2], tint: 0.03 },
  agave: { id: 'agave', variants: 2, make: agave, sway: 0.03, swayH: 3, scale: [0.85, 1.2], tint: 0.03 },
  grass: { id: 'grass', variants: 2, make: (r) => grass(r), sway: 0.1, swayH: 0.5, scale: [0.8, 1.3], tint: 0.05 },
  globemallow: {
    id: 'globemallow',
    variants: 1,
    make: (r) => globemallow(r),
    sway: 0.08,
    swayH: 0.8,
    scale: [0.8, 1.2],
    tint: 0.03,
  },
  verbena: {
    id: 'verbena',
    variants: 1,
    make: (r) => verbena(r),
    sway: 0.03,
    swayH: 0.3,
    scale: [0.8, 1.3],
    tint: 0.03,
  },
  deadBrush: {
    id: 'deadBrush',
    variants: 2,
    make: (r) => deadBrush(r),
    sway: 0.05,
    swayH: 0.6,
    scale: [0.8, 1.3],
    tint: 0.04,
  },
};

import { clamp, fbm, hash, mixP, mulP, ph, vnoise } from '../../core/color';
import type { CourtFrame } from '../../world/frame';
import {
  DRIVE,
  F_O1,
  F_O2,
  F_O3,
  F_P1,
  F_P2,
  F_PB1,
  F_PB2,
  F_S1,
  FOUNTAIN,
  GOLF,
  GROUNDS,
  LAWN,
  LOT_N,
  LOT_S,
  PATHS,
  PICKLE,
  PLAZA,
  POOL,
  POOL_DECK,
  TERRACE,
} from './layout';
import type { Facilities, Facility } from './state';

/**
 * 地面贴图（样片的 paintGround）：0.2 m/texel 的俯视贴图，画沙漠、高尔夫、车道和停车场、园区的草和土、
 * 露台、广场、池畔、步道、草坪、各块球场、风吹来的积沙、建筑和树的影子。
 * 每个设施按自己的档位画（state.ts）。
 */

/** 地面画笔（core 的 GroundPainter 里场景构建要用的部分） */
export interface GroundLike {
  paintRect(
    x0: number,
    x1: number,
    z0: number,
    z1: number,
    fn: (x: number, z: number, c: number, i: number, j: number) => number,
  ): void;
}

/** 整块浮空岛（地层侧面、地面贴图的范围；比 SITE 大一圈，样片的 SL） */
export const SLAB = { x0: -80, x1: 104, z0: -56, z1: 82 } as const;

/** 投到地上的影子：方块（x0..z1 + 高 h）或树冠（中心 x,z、高 h、半径 r，tw 树干宽） */
export type Cast =
  | { x0: number; x1: number; z0: number; z1: number; h: number }
  | { x: number; z: number; h: number; r: number; tw?: number };

export const C = {
  sand: ph('#e9c999'),
  sand2: ph('#dfba86'),
  sand3: ph('#f2d8ad'),
  peb: ph('#c9a676'),
  dirt: ph('#d5b07a'),
  dead: ph('#b59757'),
  dead2: ph('#a3874c'),
  grass: ph('#77c452'),
  grass2: ph('#6ab748'),
  grassD: ph('#5aa53e'),
  path: ph('#e6cfa4'),
  path2: ph('#dcc394'),
  pathOld: ph('#d6bb8e'),
  asph: ph('#4c525c'),
  asph2: ph('#464b54'),
  asphOld: ph('#8a8378'),
  white: ph('#f6f3ea'),
  crack: ph('#5e574d'),
  weed: ph('#7d8f3e'),
  deck: ph('#efe3cb'),
  deck2: ph('#e2d3b6'),
  terr: ph('#d08c63'),
  terr2: ph('#c37e57'),
  plaza: ph('#ead6b0'),
  plaza2: ph('#dcc49c'),
  golf: ph('#82c85b'),
  golf2: ph('#78bf53'),
  rough: ph('#6aa94b'),
  green: ph('#9bdc70'),
  bunk: ph('#f0dfb2'),
  pond: ph('#4fb6d8'),
  pond2: ph('#7fd0ea'),
  faded: ph('#b3aa9a'),
  pickle: ph('#2f5f8f'),
} as const;

type CourtKind = 'center' | 'practice' | 'member' | 'clay' | 'pickle';
/** 场面的样子：fresh 新、faded 能打的旧场、worn 掉档、cleared 清理过的旧场（不积沙）、ruin 荒废 */
export type CourtLook = 'fresh' | 'faded' | 'worn' | 'cleared' | 'ruin';

const CP: Record<CourtKind, { i: string; o: string }> = {
  center: { i: '#4b67d1', o: '#3a8a5f' },
  practice: { i: '#4fa760', o: '#3b7f8c' },
  member: { i: '#3f86c9', o: '#3e9c86' },
  clay: { i: '#d36b3d', o: '#c45d34' },
  pickle: { i: '#34a3ad', o: '#2f5f8f' },
};

/** 设施的场面档位 */
export function courtLook(fac: Facilities, f: Facility): CourtLook {
  const l = fac.look(f);
  if (f === 'outer_1' && fac.state(f) === 'playable') return 'faded';
  return l === 'fresh' ? 'fresh' : l === 'worn' ? 'worn' : l === 'mid' ? 'cleared' : 'ruin';
}

type FrameLike = Pick<CourtFrame, 'ox' | 'oz' | 'hx' | 'hz'>;

function paintCourt(g: GroundLike, F: FrameLike, kind: CourtKind, look: CourtLook): void {
  const pick = kind === 'pickle';
  const pal = CP[kind];
  const ci = ph(pal.i);
  const co = ph(pal.o);
  const L = pick ? 6.705 : 11.885;
  const Wd = pick ? 3.05 : 5.485;
  const Ws = 4.115;
  const sv = 6.4;
  const lw = 0.16;
  const seed = (F.ox * 7 + F.oz * 13) | 0;
  const clay = kind === 'clay';
  g.paintRect(F.ox - F.hx, F.ox + F.hx, F.oz - F.hz, F.oz + F.hz, (x, z) => {
    const u = x - F.ox;
    const v = z - F.oz;
    const au = Math.abs(u);
    const av = Math.abs(v);
    const inside = au <= L && av <= Wd;
    let c = inside ? ci : co;
    if (pick && inside && au < 2.13) c = mulP(ci, 0.88);
    let ln = (Math.abs(au - L) < lw && av <= Wd + lw) || (Math.abs(av - Wd) < lw && au <= L + lw);
    if (!pick)
      ln =
        ln ||
        (Math.abs(av - Ws) < lw && au <= L) ||
        (Math.abs(au - sv) < lw && av <= Ws) ||
        (av < lw && au <= sv) ||
        (av < lw && au > L - 0.45 && au <= L);
    else ln = ln || (Math.abs(au - 2.13) < lw && av <= Wd) || (av < lw && au >= 2.13 && au <= L);
    const n = hash(Math.floor(x * 5), Math.floor(z * 5), seed);
    if (look === 'fresh') {
      c = clay ? mulP(c, 0.95 + n * 0.1) : mulP(c, 0.97 + n * 0.05);
      return ln ? C.white : c;
    }
    if (look === 'faded' || look === 'worn') {
      // 能打但旧：颜色发灰、线发暗；掉档的再多几道细裂缝
      let base = mixP(c, C.faded, look === 'faded' ? 0.22 : clay ? 0.32 : 0.4);
      base = mulP(base, 0.94 + n * 0.08);
      if (ln) base = mixP(base, C.white, look === 'faded' ? 0.85 : 0.6);
      if (look === 'worn' && Math.abs(fbm(x * 0.18, z * 0.18, seed) - 0.5) < 0.007) base = C.crack;
      return base;
    }
    // 荒废 / 清理过：褪色开裂，线一段段掉了
    let base = mixP(c, C.faded, clay ? 0.45 : 0.6);
    base = mulP(base, 0.9 + n * 0.12);
    if (ln && fbm(x * 0.4, z * 0.4, seed + 3) > 0.38) base = mixP(base, C.white, 0.55);
    const cr = fbm(x * 0.18, z * 0.18, seed);
    const cr2 = fbm(x * 0.3 + 9, z * 0.3, seed + 5);
    if (Math.abs(cr - 0.5) < 0.012 || Math.abs(cr2 - 0.5) < 0.009)
      base = look === 'ruin' && hash(Math.floor(x * 3), Math.floor(z * 3), seed + 9) > 0.7 ? C.weed : C.crack;
    if (look === 'ruin') {
      const dr = fbm(x * 0.07, z * 0.07, seed + 11);
      if (dr > 0.6) base = mixP(base, C.sand, clamp((dr - 0.6) * 7, 0, 1));
    }
    return base;
  });
}

type Rect = { x0: number; x1: number; z0: number; z1: number };
const inR = (r: Rect, x: number, z: number) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
const frameRect = (F: FrameLike): Rect => ({ x0: F.ox - F.hx, x1: F.ox + F.hx, z0: F.oz - F.hz, z1: F.oz + F.hz });

export function paintGround(g: GroundLike, fac: Facilities, casts: readonly Cast[]): void {
  const lv = fac.level;
  const grass = (x: number, z: number) => fac.grassAmt(x, z);
  // 沙漠
  g.paintRect(SLAB.x0, SLAB.x1, SLAB.z0, SLAB.z1, (x, z, _c, i, j) => {
    const n = fbm(x * 0.05, z * 0.05, 1);
    const h = hash(i, j, 2);
    let v: number = n < 0.42 ? C.sand2 : n > 0.6 ? C.sand3 : C.sand;
    if (h > 0.985) v = C.peb;
    return v;
  });
  // 高尔夫
  g.paintRect(GOLF.x0, GOLF.x1 + 4, GOLF.z0 + 3, GOLF.z1 + 2, (x, z, _c, i, j) => {
    const edge = fbm(x * 0.08, z * 0.08, 4);
    const fair = Math.abs(z - 66 + Math.sin(x * 0.05) * 4) < 5 + edge * 3;
    if (Math.hypot(x - 20, z - 64) < 4) return C.green;
    if (Math.hypot((x - 60) * 0.7, z - 67) < 4) return C.green;
    if (Math.hypot(x - 5, z - 68) < 2.6 + edge || Math.hypot(x - 70, z - 62) < 2.2 + edge) return C.bunk;
    if (Math.hypot((x + 30) * 0.6, z - 66) < 4.5 + edge * 2) return hash(i >> 1, j >> 1, 5) > 0.92 ? C.pond2 : C.pond;
    if (z < 56 + 1.5 + edge * 3 || z > 76 - 1 - edge * 3) return 0;
    return fair ? (Math.floor(x / 3) & 1 ? C.golf : C.golf2) : C.rough;
  });
  // 车道和停车场（跟着全园的复原程度）
  const pfresh = lv === 3;
  const asph = (x: number, z: number, _c: number, i: number, j: number) => {
    const n = hash(i, j, 6);
    if (pfresh) return n > 0.5 ? C.asph : C.asph2;
    let v = mulP(C.asphOld, 0.92 + n * 0.12);
    if (lv === 2) v = mixP(v, C.asph, 0.45);
    if (Math.abs(fbm(x * 0.15, z * 0.15, 7) - 0.5) < 0.012) v = C.crack;
    const d = fbm(x * 0.06, z * 0.06, 8);
    if (lv === 1 && d > 0.58) v = mixP(v, C.sand, clamp((d - 0.58) * 6, 0, 1));
    return v;
  };
  g.paintRect(DRIVE.x0 - 2, DRIVE.x1 + 2, DRIVE.z0, DRIVE.z1, asph);
  for (const L of [LOT_N, LOT_S]) {
    g.paintRect(L.x0, L.x1, L.z0, L.z1, asph);
    g.paintRect(L.x0, L.x1, L.z0, L.z1, (x, z) => {
      const u = (x - L.x0) % 2.8;
      const inRow = z < L.z0 + 5.2 || z > L.z1 - 5.2;
      if (inRow && u < 0.2 && x > L.x0 + 0.5)
        return pfresh ? C.white : fbm(x, z, 9) > (lv === 2 ? 0.3 : 0.45) ? mixP(C.asphOld, C.white, 0.4) : 0;
      return 0;
    });
  }
  // 园区里的地：修好的设施周围长草，其余是土和枯草
  g.paintRect(GROUNDS.x0, GROUNDS.x1, GROUNDS.z0, GROUNDS.z1, (x, z, _c, i, j) => {
    const gr = grass(x, z);
    const n = fbm(x * 0.12, z * 0.12, 10);
    if (gr + (n - 0.5) * 0.7 > 0.5) {
      const s = Math.floor(z / 2.6) & 1;
      let v: number = s ? C.grass : C.grass2;
      if (hash(i, j, 11) > 0.93) v = C.grassD;
      return v;
    }
    const h = hash(i, j, 12);
    let v: number = n > 0.55 ? C.dead : n < 0.38 ? C.sand2 : C.dirt;
    if (h > 0.97) v = C.dead2;
    if (Math.abs(fbm(x * 0.2, z * 0.2, 13) - 0.5) < 0.01) v = mulP(v, 0.82);
    return v;
  });
  // 露台（会所）、广场（喷泉）、池畔（泳池）
  const club = fac.look('clubhouse');
  g.paintRect(TERRACE.x0, TERRACE.x1, TERRACE.z0, TERRACE.z1, (x, z, _c, i, j) => {
    let v = (Math.floor(x / 1.2) + Math.floor(z / 1.2)) & 1 ? C.terr : C.terr2;
    if (club !== 'fresh') {
      const ruin = club === 'ruin';
      v = mixP(v, C.faded, ruin ? 0.45 : 0.25);
      if (ruin && fbm(x * 0.2, z * 0.2, 14) > 0.6) v = mixP(v, C.sand, 0.6);
      if (hash(i, j, 15) > (ruin ? 0.96 : 0.985)) v = C.crack;
    }
    return v;
  });
  const plz = fac.look('plaza');
  g.paintRect(PLAZA.x0, PLAZA.x1, PLAZA.z0, PLAZA.z1, (x, z) => {
    const d = Math.hypot(x - FOUNTAIN.x, z - FOUNTAIN.z);
    if (d > 12.5) return 0;
    let v = Math.floor(d / 1.5) & 1 ? C.plaza : C.plaza2;
    if (Math.abs(d - 12.3) < 0.25) v = C.terr2;
    if (plz !== 'fresh') {
      v = mixP(v, C.faded, plz === 'ruin' ? 0.3 : 0.15);
      if (plz === 'ruin' && fbm(x * 0.1, z * 0.1, 16) > 0.55) v = mixP(v, C.sand, 0.7);
    }
    return v;
  });
  const pool = fac.look('stadium_2');
  g.paintRect(POOL_DECK.x0, POOL_DECK.x1, POOL_DECK.z0, POOL_DECK.z1, (x, z, _c, i, j) => {
    let v = (Math.floor(x) + Math.floor(z)) & 1 ? C.deck : C.deck2;
    if (x > POOL.x0 - 0.5 && x < POOL.x1 + 0.5 && z > POOL.z0 - 0.5 && z < POOL.z1 + 0.5) v = C.white;
    if (pool !== 'fresh') {
      const ruin = pool === 'ruin';
      v = mixP(v, C.faded, ruin ? 0.35 : 0.18);
      if (ruin && fbm(x * 0.15, z * 0.15, 17) > 0.57) v = mixP(v, C.sand, 0.6);
      if (hash(i, j, 18) > (ruin ? 0.975 : 0.99)) v = C.crack;
    }
    return v;
  });
  // 步道
  for (const p of PATHS)
    g.paintRect(p.x0, p.x1, p.z0, p.z1, (x, z, _c, i, j) => {
      const n = hash(i, j, 19);
      let v: number = n > 0.8 ? C.path2 : C.path;
      if (grass(x, z) < 0.5) {
        v = mixP(v, C.pathOld, 0.6);
        const d = fbm(x * 0.09, z * 0.09, 20);
        if (d > 0.55) v = mixP(v, C.sand, clamp((d - 0.55) * 5, 0, 1));
        if (hash(i, j, 21) > 0.985) v = C.weed;
      }
      return v;
    });
  // 大门前的一片铺地
  g.paintRect(56, 60, -5, 5, (_x, _z, _c, i, j) => (hash(i, j, 22) > 0.8 ? C.path2 : C.path));
  // 球员草坪（归喷泉广场）
  g.paintRect(LAWN.x0, LAWN.x1, LAWN.z0, LAWN.z1, (x, z) => {
    if (plz === 'fresh') return Math.floor((x - z) / 2.4) & 1 ? C.grass : C.grass2;
    const n = fbm(x * 0.15, z * 0.15, 23);
    if (plz === 'worn') return n > 0.55 ? C.dead : Math.floor((x - z) / 2.4) & 1 ? C.grass2 : C.grassD;
    return n > 0.5 ? C.dead : C.dead2;
  });
  // 球场
  const s1 = courtLook(fac, 'stadium_1');
  const pr = courtLook(fac, 'practice');
  const o1 = courtLook(fac, 'outer_1');
  const o23 = courtLook(fac, 'outer_23');
  const pb = courtLook(fac, 'stadium_3');
  paintCourt(g, F_S1, 'center', s1);
  paintCourt(g, F_P1, 'practice', pr);
  paintCourt(g, F_P2, 'practice', pr);
  paintCourt(g, F_O1, 'member', o1);
  paintCourt(g, F_O2, 'clay', o23);
  paintCourt(g, F_O3, 'clay', o23);
  g.paintRect(PICKLE.x0, PICKLE.x1, PICKLE.z0, PICKLE.z1, (x, z) => {
    let v: number = C.pickle;
    if (pb !== 'fresh') {
      v = mixP(v, C.faded, pb === 'faded' || pb === 'worn' ? 0.35 : 0.6);
      if (pb === 'ruin' && fbm(x * 0.2, z * 0.2, 24) > 0.58) v = mixP(v, C.sand, 0.6);
    }
    return v;
  });
  paintCourt(g, F_PB1, 'pickle', pb);
  paintCourt(g, F_PB2, 'pickle', pb);
  // 匹克球场埋在沙里（buried）：大半个场子是沙丘
  if (pb === 'ruin')
    g.paintRect(PICKLE.x0, PICKLE.x1, PICKLE.z0, PICKLE.z1, (x, z, c) => {
      const d = fbm(x * 0.09, z * 0.09, 41) + (x - PICKLE.x0) * -0.008;
      if (d > 0.42) return mixP(c, d > 0.5 ? C.sand3 : C.sand, clamp((d - 0.42) * 5, 0, 0.95));
      return 0;
    });

  // 风吹来的积沙：没长草、也不是清理过的设施的地方
  const clean: Rect[] = [];
  const addClean = (ok: boolean, ...rs: Rect[]) => {
    if (ok) clean.push(...rs);
  };
  addClean(s1 !== 'ruin', frameRect(F_S1));
  addClean(pr !== 'ruin', frameRect(F_P1), frameRect(F_P2));
  addClean(o1 !== 'ruin', frameRect(F_O1));
  addClean(o23 !== 'ruin', frameRect(F_O2), frameRect(F_O3));
  addClean(pb !== 'ruin', PICKLE);
  addClean(club !== 'ruin', TERRACE);
  addClean(plz !== 'ruin', PLAZA, LAWN);
  addClean(pool !== 'ruin', POOL_DECK);
  if (lv < 3)
    g.paintRect(GROUNDS.x0, GROUNDS.x1, GROUNDS.z0, GROUNDS.z1, (x, z, c) => {
      if (grass(x, z) > 0.4) return 0;
      for (const r of clean) if (inR(r, x, z)) return 0;
      const d = fbm(x * 0.045, z * 0.045, 25) + (x < -50 ? 0.08 : 0) + (lv === 2 ? -0.04 : 0);
      if (d > 0.62) return mixP(c, C.sand3, clamp((d - 0.62) * 4, 0, 0.9));
      if (d > 0.6 && Math.abs(fbm(x * 0.5, z * 0.5, 26) - 0.5) < 0.05) return mixP(c, C.sand2, 0.5);
      return 0;
    });

  // 影子：太阳在东北偏上（样片的 SDX/SDZ），方块投平行四边形，树冠投一团
  const SDX = 0.5;
  const SDZ = -0.62;
  const shade = (c: number) => mulP(c, 0.7, 0.72, 0.84);
  for (const s of casts) {
    if ('r' in s) {
      const cx = s.x + s.h * SDX;
      const cz = s.z + s.h * SDZ;
      const tw = s.tw ?? 0.25;
      const L2 = (cx - s.x) ** 2 + (cz - s.z) ** 2 || 1;
      g.paintRect(
        Math.min(s.x, cx) - s.r,
        Math.max(s.x, cx) + s.r,
        Math.min(s.z, cz) - s.r,
        Math.max(s.z, cz) + s.r,
        (x, z, c) => {
          const blob = Math.hypot(x - cx, z - cz) < s.r * (0.8 + 0.3 * vnoise(x * 1.3, z * 1.3, 27));
          const t = clamp(((x - s.x) * (cx - s.x) + (z - s.z) * (cz - s.z)) / L2, 0, 0.85);
          const trunk = Math.hypot(x - (s.x + t * (cx - s.x)), z - (s.z + t * (cz - s.z))) < tw;
          return blob || trunk ? shade(c) : 0;
        },
      );
      continue;
    }
    const h = s.h;
    g.paintRect(s.x0, s.x1 + h * SDX, s.z0 + h * SDZ, s.z1, (x, z, c) => {
      let t0 = 0;
      let t1 = 1;
      t0 = Math.max(t0, (x - s.x1) / (h * SDX));
      t1 = Math.min(t1, (x - s.x0) / (h * SDX));
      const az = (z - s.z0) / (h * SDZ);
      const bz = (z - s.z1) / (h * SDZ);
      t0 = Math.max(t0, Math.min(az, bz));
      t1 = Math.min(t1, Math.max(az, bz));
      return t0 <= t1 ? shade(c) : 0;
    });
  }
}

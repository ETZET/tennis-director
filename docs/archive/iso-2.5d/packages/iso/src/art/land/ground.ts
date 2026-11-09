import { clamp, fbm, hash, mixP, mulP, ph, vnoise } from '../../core/color';
import { C, type Cast, type GroundLike } from '../../site/indian-wells/ground';

/**
 * 新地的地面画法（ADR 0021）：球场、旧场的残迹、混凝土垫层、影子。按 0.2 米一格的地面贴图画，
 * 和 Palm Oasis 的 ground.ts 同一套颜色（C），新地和老地接得上。
 */

export type Rect = { x0: number; x1: number; z0: number; z1: number };
type FrameLike = { ox: number; oz: number; hx: number; hz: number };

export const LC = {
  hardI: ph('#3a6fd8'),
  hardO: ph('#2f8a6e'),
  pracI: ph('#4fa760'),
  pracO: ph('#3b7f8c'),
  line: ph('#f6f3ea'),
  pad: ph('#b9b4a8'),
  pad2: ph('#aaa498'),
  joint: ph('#8f897e'),
  mud: ph('#9c8a62'),
  mud2: ph('#8a7a56'),
  straw: ph('#c8b36a'),
  tired: ph('#a9b65a'),
  dry: ph('#bba765'),
  lawn: ph('#7ccc58'),
  lawn2: ph('#70c04e'),
  flag: ph('#d9c8a4'),
  flag2: ph('#c9b690'),
  tile: ph('#f1e6d2'),
  tile2: ph('#e4d6bc'),
  water: ph('#5ac4e6'),
  water2: ph('#86daf0'),
  lily: ph('#5fa84a'),
  terra: ph('#c9805a'),
  terra2: ph('#bb7550'),
  asph: ph('#4c525c'),
  asph2: ph('#464b54'),
  curb: ph('#d8d2c4'),
  plank: ph('#b48650'),
} as const;

/** 底色沙漠（和 ground.ts 开头那一遍一样的公式：hash(i, j) 用贴图下标，新地接上老地不出缝） */
export function desertAt(x: number, z: number, i: number, j: number): number {
  const n = fbm(x * 0.05, z * 0.05, 1);
  const h = hash(i, j, 2);
  let v: number = n < 0.42 ? C.sand2 : n > 0.6 ? C.sand3 : C.sand;
  if (h > 0.985) v = C.peb;
  return v;
}

/** 碎花岗岩步道的颜色（和墙里的步道一样）；old = 刚清出来、还带着沙 */
export function pathAt(x: number, z: number, i: number, j: number, old = false): number {
  let v: number = hash(i, j, 19) > 0.8 ? C.path2 : C.path;
  if (old) {
    v = mixP(v, C.pathOld, 0.6);
    const d = fbm(x * 0.09, z * 0.09, 20);
    if (d > 0.55) v = mixP(v, C.sand, clamp((d - 0.55) * 5, 0, 1));
  }
  return v;
}

/** 草坪条纹（沿 z 一条条修剪过） */
export function lawnAt(x: number, z: number, i: number, j: number, stripe = 2.6): number {
  let v: number = Math.floor(z / stripe) & 1 ? LC.lawn : LC.lawn2;
  if (hash(i, j, 11) > 0.95) v = C.grassD;
  if (vnoise(x * 0.4, z * 0.4, 61) > 0.8) v = mulP(v, 0.95);
  return v;
}

export type CourtLookL = 'new' | 'old' | 'pad' | 'raw';

/**
 * 一块网球场的场面：外场 + 场心 + 白线（双打、单打边线，底线，发球线，中线）。
 * rot = true：场地沿 z 打（局部 u 朝世界 z）。look：new 新铺、old 旧场残迹（褪色、裂缝、积沙）、
 * pad 只浇了混凝土垫层、raw 刚平整的土。fill 0..1：new 只铺了一部分（从西往东）。
 */
export function paintCourtL(
  g: GroundLike,
  F: FrameLike,
  o: { inner: number; outer: number; look: CourtLookL; rot?: boolean; fill?: number; L?: number; Wd?: number },
): void {
  const L = o.L ?? 11.885;
  const Wd = o.Wd ?? 5.485;
  const Ws = 4.115;
  const SV = 6.4;
  const lw = 0.11;
  const fill = o.fill ?? 1;
  const ext = o.rot ? { x: F.hz, z: F.hx } : { x: F.hx, z: F.hz };
  g.paintRect(F.ox - ext.x, F.ox + ext.x, F.oz - ext.z, F.oz + ext.z, (x, z, _c, i, j) => {
    const u = o.rot ? z - F.oz : x - F.ox;
    const v = o.rot ? x - F.ox : z - F.oz;
    const au = Math.abs(u);
    const av = Math.abs(v);
    if (o.look === 'raw') {
      const n = hash(i, j, 81);
      return n > 0.7 ? C.dirt : n > 0.4 ? C.sand2 : mixP(C.dirt, C.sand, 0.5);
    }
    if (o.look === 'pad') {
      // 混凝土垫层：浅灰，每 4 米一道伸缩缝
      if (Math.abs(((u + 100) % 4) - 2) > 1.92 || Math.abs(((v + 100) % 4) - 2) > 1.92) return LC.joint;
      return hash(i, j, 82) > 0.6 ? LC.pad2 : LC.pad;
    }
    const along = (x - (F.ox - ext.x)) / (2 * ext.x);
    if (o.look === 'new' && along > fill) return hash(i, j, 83) > 0.5 ? LC.pad : LC.pad2;
    const inC = au <= L && av <= Wd;
    let col = inC ? o.inner : o.outer;
    const onLine =
      (au <= L + lw && (Math.abs(av - Wd) < lw || Math.abs(av - Ws) < lw)) ||
      (av <= Wd + lw && Math.abs(au - L) < lw) ||
      (av <= Ws && Math.abs(au - SV) < lw) ||
      (au <= SV && av < lw) ||
      (Math.abs(au - L) < lw * 3 && av < lw);
    if (onLine) col = LC.line;
    if (o.look === 'old') {
      col = mixP(col, C.faded, 0.55);
      const d = fbm(x * 0.12, z * 0.12, 84);
      if (d > 0.55) col = mixP(col, C.sand, clamp((d - 0.55) * 4, 0, 0.9));
      if (Math.abs(fbm(x * 0.25, z * 0.25, 85) - 0.5) < 0.012) col = C.crack;
      if (hash(i, j, 86) > 0.985) col = C.weed;
    }
    return col;
  });
}

/** 影子（和 ground.ts 末尾同一套：太阳在东北偏上，方块投平行四边形，树冠投一团） */
export function paintCasts(g: GroundLike, casts: readonly Cast[]): void {
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
          return (blob || trunk) && c ? shade(c) : 0;
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
      return t0 <= t1 && c ? shade(c) : 0;
    });
  }
}

/** 停车位的白线（沿 x 一格 2.8 米，两排车头对车头） */
export function paintStalls(g: GroundLike, L: Rect, fresh: boolean): void {
  g.paintRect(L.x0, L.x1, L.z0, L.z1, (x, z, _c, i, j) => {
    const u = (x - L.x0) % 2.8;
    const inRow = z < L.z0 + 5.2 || z > L.z1 - 5.2;
    if (inRow && u < 0.2 && x > L.x0 + 0.5) return fresh ? LC.line : mixP(LC.asph, LC.line, 0.5);
    return hash(i, j, 6) > 0.5 ? LC.asph : LC.asph2;
  });
}

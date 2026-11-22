// valley 的导航：俱乐部外面哪些地方能站、多高（clubwalk 的 outerSurface 钩子）、挡路的形状、出俱乐部的寻路。
// - 平地（FLOOR）里能走；锁着的区域不能进（路口有路障）；山上不能走。
// - 开车：球车、汽车都能下路（除了锁着的地方）；下了路是沙地，慢（vehicles.ts 的 DRIVE.offroad），不是撞墙。
// - 俱乐部围墙那一圈不能穿（墙里面归 clubwalk 管，门在东墙）。

import type { NavMap, Shape } from '../clubsite/play';
import { GATE, GROUNDS } from '../clubsite/world';
import { bldgPoly } from './build';
import { INTERIORS } from './interiors/all';
import { interiorWalk, ORIGIN } from './interiors/index';
import { BUILDINGS, HOTEL_BLDGS, houses, REGIONS, regionAt } from './layout';
import { parkDeckAt } from './parkdeck';
import { inClubBox, inFloor } from './terrain';

export type Mode = 'walk' | 'cart' | 'car';

export interface ValleyNav {
  mode: Mode;
  locked: Set<string>;
  hotel: boolean;
  /** 白模细节登记的挡路形状（build 完以后 main 填） */
  extra: Shape[];
  surface(x: number, z: number): number | null;
  blocked(): Shape[];
  farPath(nav: NavMap, ax: number, az: number, bx: number, bz: number): [number, number][] | null;
}

/** 出俱乐部的口子：寻路网格（clubwalk 的 NAV_BOUNDS）东边、车道中间 */
const EXIT: [number, number] = [116, 0];

const INTERIOR_WALK = INTERIORS.flatMap(interiorWalk);

export function createValleyNav(locked: Set<string>): ValleyNav {
  const HOUSES = houses();
  const wallBand = { x0: GROUNDS.x0 - 1.5, x1: GROUNDS.x1 + 1.5, z0: GROUNDS.z0 - 1.5, z1: GROUNDS.z1 + 1.5 };
  const v: ValleyNav = {
    mode: 'walk',
    locked,
    hotel: false,
    extra: [],
    surface(x, z) {
      // 店内（地图外面）：地板上能走（开车进不去）
      if (x > 2900)
        return v.mode === 'walk' && INTERIOR_WALK.some((r) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1)
          ? 0
          : null;
      // 围墙那一圈（门洞归 clubwalk 的 BASE_WALK）
      if (x >= wallBand.x0 && x <= wallBand.x1 && z >= wallBand.z0 && z <= wallBand.z1) return null;
      if (!inFloor(x, z)) return null;
      if (!inClubBox(x, z)) {
        const r = regionAt(x, z);
        if (r && v.locked.has(r.id)) return null;
      }
      // 日出公园的台地（parkdeck.ts）：台面、台阶上站的高度；开车上不去（墙沿、台阶）
      const deck = parkDeckAt(x, z);
      if (deck !== null) return v.mode === 'walk' ? deck : null;
      return 0;
    },
    blocked() {
      const out: Shape[] = [];
      for (const o of [...BUILDINGS, ...HOUSES]) out.push({ poly: bldgPoly(o) });
      if (v.hotel) for (const o of HOTEL_BLDGS) out.push({ poly: bldgPoly(o) });
      out.push(...v.extra);
      // 开着车：俱乐部的门不让进
      if (v.mode !== 'walk') out.push({ a: [GATE.x + 0.6, GATE.z0 - 1], b: [GATE.x + 0.6, GATE.z1 + 1], r: 0.5 });
      return out;
    },
    farPath(nav, ax, az, bx, bz) {
      // 店内：两头在同一间店里 → 店内的小网格上寻路（绕开货架、柜台）；不在同一间 → 走不过去（要走门）
      const ia = interiorBox(ax, az);
      const ib = interiorBox(bx, bz);
      if (ia || ib) return ia && ia === ib ? interiorPath(nav, ia, ax, az, bx, bz) : null;
      const aIn = nav.inGrid(ax, az);
      const bIn = nav.inGrid(bx, bz);
      if (nav.standAt(bx, bz) === null && !bIn) return null;
      if (aIn && !bIn) {
        const p = nav.findPath(ax, az, EXIT[0], EXIT[1]);
        return p ? [...p, [bx, bz]] : [[bx, bz]];
      }
      if (!aIn && bIn) {
        const p = nav.findPath(EXIT[0], EXIT[1], bx, bz);
        return p ? [EXIT, ...p] : null;
      }
      return [[bx, bz]];
    },
  };
  return v;
}

// ── 店内寻路：每间店一张 0.4 米的小网格（第一次用到时按 nav.standAt 建，店里的东西不会动），8 邻 A* + 拉直 ──
type Box = { x0: number; x1: number; z0: number; z1: number };
const INTERIOR_BOXES: Box[] = INTERIORS.map((d) => {
  const [ox, oz] = ORIGIN[d.id];
  return { x0: ox - 1, x1: ox + d.w + 1, z0: oz - 1, z1: oz + d.d + 4 };
});
const interiorBox = (x: number, z: number) =>
  INTERIOR_BOXES.find((b) => x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1) ?? null;
const CELL = 0.4;
const grids = new Map<Box, { nx: number; nz: number; ok: Uint8Array }>();
function gridOf(nav: NavMap, b: Box) {
  let g = grids.get(b);
  if (!g) {
    const nx = Math.ceil((b.x1 - b.x0) / CELL);
    const nz = Math.ceil((b.z1 - b.z0) / CELL);
    const ok = new Uint8Array(nx * nz);
    for (let j = 0; j < nz; j++)
      for (let i = 0; i < nx; i++)
        ok[j * nx + i] = nav.standAt(b.x0 + (i + 0.5) * CELL, b.z0 + (j + 0.5) * CELL) === null ? 0 : 1;
    g = { nx, nz, ok };
    grids.set(b, g);
  }
  return g;
}
/** 两点之间直着走得通（每 0.2 米查一次能站） */
function clear(nav: NavMap, ax: number, az: number, bx: number, bz: number): boolean {
  const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.2));
  for (let k = 1; k <= n; k++)
    if (nav.standAt(ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n) === null) return false;
  return true;
}
function interiorPath(nav: NavMap, b: Box, ax: number, az: number, bx: number, bz: number): [number, number][] | null {
  if (clear(nav, ax, az, bx, bz)) return [[bx, bz]];
  const { nx, nz, ok } = gridOf(nav, b);
  const ci = (x: number) => Math.min(nx - 1, Math.max(0, Math.floor((x - b.x0) / CELL)));
  const cj = (z: number) => Math.min(nz - 1, Math.max(0, Math.floor((z - b.z0) / CELL)));
  const near = (i0: number, j0: number) => {
    for (let r = 0; r < 8; r++)
      for (let dj = -r; dj <= r; dj++)
        for (let di = -r; di <= r; di++) {
          const i = i0 + di;
          const j = j0 + dj;
          if (i >= 0 && j >= 0 && i < nx && j < nz && ok[j * nx + i]) return j * nx + i;
        }
    return -1;
  };
  const s = near(ci(ax), cj(az));
  const t = near(ci(bx), cj(bz));
  if (s < 0 || t < 0) return null;
  const gs = new Float32Array(nx * nz).fill(Number.POSITIVE_INFINITY);
  const from = new Int32Array(nx * nz).fill(-1);
  const open: number[] = [s];
  gs[s] = 0;
  const h = (k: number) => Math.hypot((k % nx) - (t % nx), Math.floor(k / nx) - Math.floor(t / nx));
  const f = new Float32Array(nx * nz).fill(Number.POSITIVE_INFINITY);
  f[s] = h(s);
  const closed = new Uint8Array(nx * nz);
  while (open.length) {
    let bi = 0;
    for (let q = 1; q < open.length; q++) if (f[open[q]] < f[open[bi]]) bi = q;
    const k = open[bi];
    open[bi] = open[open.length - 1];
    open.pop();
    if (k === t) break;
    if (closed[k]) continue;
    closed[k] = 1;
    const i = k % nx;
    const j = (k - i) / nx;
    for (const [di, dj] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ]) {
      const i2 = i + di;
      const j2 = j + dj;
      if (i2 < 0 || j2 < 0 || i2 >= nx || j2 >= nz) continue;
      const k2 = j2 * nx + i2;
      if (!ok[k2] || closed[k2]) continue;
      if (di && dj && (!ok[j * nx + i2] || !ok[j2 * nx + i])) continue;
      const g2 = gs[k] + (di && dj ? Math.SQRT2 : 1);
      if (g2 < gs[k2]) {
        gs[k2] = g2;
        f[k2] = g2 + h(k2);
        from[k2] = k;
        open.push(k2);
      }
    }
  }
  if (from[t] < 0 && t !== s) return null;
  const cells: [number, number][] = [];
  for (let k = t; k >= 0 && k !== s; k = from[k])
    cells.push([b.x0 + ((k % nx) + 0.5) * CELL, b.z0 + (Math.floor(k / nx) + 0.5) * CELL]);
  cells.reverse();
  cells.push([bx, bz]);
  // 拉直：从当前点跳到最远的直着走得通的点
  const out: [number, number][] = [];
  let cur: [number, number] = [ax, az];
  let idx = 0;
  while (idx < cells.length) {
    let far = idx;
    for (let m = cells.length - 1; m > idx; m--)
      if (clear(nav, cur[0], cur[1], cells[m][0], cells[m][1])) {
        far = m;
        break;
      }
    cur = cells[far];
    out.push(cur);
    idx = far + 1;
  }
  return out;
}

/** 锁着的区域名（地名、路障牌子用） */
export const regionName = (id: string) => REGIONS.find((r) => r.id === id)?.name ?? id;

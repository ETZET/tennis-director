// valley 的导航：俱乐部外面哪些地方能站、多高（clubwalk 的 outerSurface 钩子）、挡路的形状、出俱乐部的寻路。
// - 平地（FLOOR）里能走；锁着的区域不能进（路口有路障）；山上只有美术馆步道和观景台能走。
// - 开车：球车、汽车都能下路（除了山上的步道和锁着的地方）；下了路是沙地，慢（vehicles.ts 的 DRIVE.offroad），不是撞墙。
// - 俱乐部围墙那一圈不能穿（墙里面归 clubwalk 管，门在东墙）。

import type { NavMap, Shape } from '../clubsite/play';
import { GATE, GROUNDS } from '../clubsite/world';
import { bldgPoly } from './build';
import { BUILDINGS, HOTEL_BLDGS, houses, REGIONS, regionAt } from './layout';
import { inClubBox, inFloor, trailSurface } from './terrain';

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

export function createValleyNav(locked: Set<string>): ValleyNav {
  const HOUSES = houses();
  const wallBand = { x0: GROUNDS.x0 - 1.5, x1: GROUNDS.x1 + 1.5, z0: GROUNDS.z0 - 1.5, z1: GROUNDS.z1 + 1.5 };
  const v: ValleyNav = {
    mode: 'walk',
    locked,
    hotel: false,
    extra: [],
    surface(x, z) {
      // 围墙那一圈（门洞归 clubwalk 的 BASE_WALK）
      if (x >= wallBand.x0 && x <= wallBand.x1 && z >= wallBand.z0 && z <= wallBand.z1) return null;
      if (!inFloor(x, z)) {
        if (v.mode !== 'walk' || v.locked.has('mountain')) return null;
        return trailSurface(x, z);
      }
      if (!inClubBox(x, z)) {
        const r = regionAt(x, z);
        if (r && v.locked.has(r.id)) return null;
      }
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

/** 锁着的区域名（地名、路障牌子用） */
export const regionName = (id: string) => REGIONS.find((r) => r.id === id)?.name ?? id;

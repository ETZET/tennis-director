// valley（地图扩张 demo，2026-11-21 压紧成小镇）的数：平面图摆得对不对、导航（走路 / 球车 / 汽车、锁着的区域、围墙）、
// 南边的山挡不挡人、寻路网格只铺俱乐部时网格外的寻路。纯数，不要 WebGL。
import { describe, expect, it } from 'vitest';
import { NavMap } from '../clubsite/play/nav';
import { GATE, GROUNDS } from '../clubsite/world';
import { bldgPoly } from './build';
import {
  along,
  BUILDINGS,
  distToLine,
  FLOOR,
  HOTEL_BLDGS,
  houses,
  inPoly,
  POIS,
  REGIONS,
  ROADS,
  regionAt,
  SITES,
  SPEED,
  TRIPS,
  VIEW,
} from './layout';
import { createValleyNav } from './nav';
import { MOD_OLD_BOX, type ModuleId, mvRect } from './relocate';
import { CLUB_BOX, inClubBox, inFloor, mountainY, onRoad } from './terrain';

const ALL_LOCKED = () => new Set(REGIONS.filter((r) => !r.open).map((r) => r.id));

/** 离 FLOOR 边的距离（在外面才有意义） */
function distToFloor(x: number, z: number): number {
  return distToLine([...FLOOR, FLOOR[0]], x, z);
}

describe('valley 平面图', () => {
  it('有名字的楼、酒店都在平地里（中心在里面；四个角出平地不超过 0.5 米）', () => {
    const out: string[] = [];
    for (const o of [...BUILDINGS, ...HOTEL_BLDGS]) {
      if (!inFloor(o.x, o.z)) out.push(`${o.id} 中心`);
      for (const [x, z] of bldgPoly(o, 0))
        if (!inFloor(x, z) && distToFloor(x, z) > 0.5) out.push(`${o.id} (${x.toFixed(0)},${z.toFixed(0)})`);
    }
    expect(out).toEqual([]);
  });

  it('POI 都在平地里', () => {
    expect(POIS.filter((p) => !inFloor(p.x, p.z)).map((p) => p.id)).toEqual([]);
  });

  it('压紧：模块（平移以后）互不相压；院子不压别家的楼', () => {
    const ids = Object.keys(MOD_OLD_BOX) as ModuleId[];
    const box = (id: ModuleId) => mvRect(id, MOD_OLD_BOX[id]);
    const hits: string[] = [];
    // 模块的框只是大概的（含院子、停车场），用楼和 SITES 查实的
    for (const s of SITES)
      for (const o of BUILDINGS)
        if (o.mod !== s.of) {
          const P = bldgPoly(o, 0);
          if (P.some(([x, z]) => x > s.x0 && x < s.x1 && z > s.z0 && z < s.z1)) hits.push(`${s.id} × ${o.id}`);
        }
    expect(hits).toEqual([]);
    for (const a of ids) for (const b of ids) if (a < b) expect(box(a)).toBeDefined();
  });

  it('压紧：主街一条走完半分钟；俱乐部门口到店 1 分半以内，到主街东头的五金、学校（选拔日的报名桌）、公园 2 分 40 秒以内（沿路）', () => {
    const len = (pts: readonly (readonly [number, number])[]) =>
      pts.slice(1).reduce((a, p, i) => a + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);
    const door = (id: string) => POIS.find((p) => p.id === id) as { x: number; z: number };
    // 报社 → 主街最东的店（餐馆）；市政厅 → 选拔日的报名桌（横街、后街走过去）≤ 35 秒
    const [a, b] = [door('p_paper'), door('p_diner')];
    expect(Math.abs(b.x - a.x) / SPEED.walk).toBeLessThan(35);
    const c = door('p_cityhall');
    const e = door('p_school_event');
    const toEvent: [number, number][] = [
      [c.x, c.z],
      [274.4, -51.7],
      [326, -51.7],
      [336, -45],
      [336, -42],
      [e.x, e.z],
    ];
    expect(len(toEvent) / SPEED.walk).toBeLessThan(35);
    for (const t of TRIPS)
      expect(len(t.pts) / SPEED.walk, t.name).toBeLessThan(/学校|公园|五金/.test(t.name) ? 160 : 90);
  });

  it('俱乐部那块（CLUB_BOX）以外的平地每一处都归某个区域（10 米采样）', () => {
    const gaps: string[] = [];
    for (let x = VIEW.x0; x <= VIEW.x1; x += 10)
      for (let z = VIEW.z0; z <= VIEW.z1; z += 10) {
        if (!inFloor(x, z) || inClubBox(x, z)) continue;
        if (!regionAt(x, z)) gaps.push(`(${x},${z})`);
      }
    expect(gaps).toEqual([]);
  });

  it('区域 id 不重复，开局开着的有俱乐部', () => {
    const ids = REGIONS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(REGIONS.find((r) => r.id === 'club')?.open).toBe(true);
  });

  /** 楼（四边形里 11×11 采样）压进路面（中线 ± 半宽）最深多少米 */
  const intrude = (o: Parameters<typeof bldgPoly>[0], r: (typeof ROADS)[number]) => {
    const P = bldgPoly(o, 0);
    let worst = Number.NEGATIVE_INFINITY;
    for (let a = 0; a <= 10; a++)
      for (let b = 0; b <= 10; b++) {
        const x = P[0][0] + ((P[1][0] - P[0][0]) * a) / 10 + ((P[3][0] - P[0][0]) * b) / 10;
        const z = P[0][1] + ((P[1][1] - P[0][1]) * a) / 10 + ((P[3][1] - P[0][1]) * b) / 10;
        worst = Math.max(worst, r.w / 2 - distToLine(r.pts, x, z));
      }
    return worst;
  };

  it('路（不算步道）不穿有名字的楼：路的中线不进楼（尽头开进楼门口的车道除外）', () => {
    const hits: string[] = [];
    for (const r of ROADS) {
      if (r.kind === 'trail') continue;
      for (const o of [...BUILDINGS, ...HOTEL_BLDGS]) {
        const poly = bldgPoly(o, 0);
        // 中线每米一个点；路的两头 12 米以内不算（车道开到楼门口）
        const L = along(r.pts, 1);
        const n = L.length;
        if (L.some(([, p], i) => i > 12 && i < n - 12 && inPoly(poly, p[0], p[1]))) hits.push(`${r.id} × ${o.id}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it('小区的房子、铺面压进路面不超过 1.5 米（人行道），开车过得去', () => {
    const hits: string[] = [];
    for (const r of ROADS) {
      if (r.kind === 'trail') continue;
      for (const o of houses()) {
        const d = intrude(o, r);
        if (d > 1.5) hits.push(`${r.id} × ${o.id} ${d.toFixed(1)}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it('路的中线都在平地里', () => {
    const out: string[] = [];
    for (const r of ROADS)
      for (const [x, z] of r.pts) if (!inFloor(x, z) && !inClubBox(x, z)) out.push(`${r.id} (${x},${z})`);
    expect(out).toEqual([]);
  });

  it('小区的房子不压着别的房子、不在锁着的平地外', () => {
    const hs = houses();
    expect(hs.length).toBeGreaterThan(30);
    for (const h of hs) expect(inPoly(FLOOR, h.x, h.z)).toBe(true);
  });
});

describe('valley 导航（createValleyNav）', () => {
  it('路上能走（俱乐部门口的车道往东、主街、横街）', () => {
    const v = createValleyNav(new Set());
    expect(v.surface(150, 2)).toBe(0);
    expect(v.surface(300, 0)).toBe(0);
    expect(v.surface(274.4, -80)).toBe(0);
  });

  it('锁着的区域不能进，开了就能进', () => {
    const locked = ALL_LOCKED();
    const v = createValleyNav(locked);
    expect(regionAt(300, 0)?.id).toBe('town');
    expect(v.surface(300, 0)).toBeNull();
    // 学校（主街北边）、公园（主街南边）；主街本身不归它们（锁着也开得到东头的五金）
    expect(regionAt(470, -30)?.id).toBe('school');
    expect(v.surface(470, -30)).toBeNull();
    expect(regionAt(400, 60)?.id).toBe('park');
    expect(v.surface(400, 60)).toBeNull();
    expect(regionAt(470, 0)?.id).toBe('town');
    // 俱乐部门外那段车道开着
    expect(v.surface(190, 0)).toBe(0);
    locked.delete('town');
    expect(v.surface(300, 0)).toBe(0);
  });

  it('平地上走路、球车、汽车都能去（汽车下路是慢，不是撞墙：vehicles.ts 的 DRIVE.offroad）', () => {
    const v = createValleyNav(new Set());
    const off: [number, number] = [180, -30]; // 俱乐部和镇子之间的空地
    expect(onRoad(...off)).toBe(false);
    expect(onRoad(300, 0)).toBe(true);
    v.mode = 'walk';
    expect(v.surface(...off)).toBe(0);
    v.mode = 'cart';
    expect(v.surface(...off)).toBe(0);
    v.mode = 'car';
    expect(v.surface(...off)).toBe(0);
    expect(v.surface(300, 0)).toBe(0);
  });

  it('汽车停的地方（大门外车道北边）开出去能上路', () => {
    // vehicles.ts：汽车停在 (110, −8)，球车 (100, −7.5)
    const v = createValleyNav(new Set());
    v.mode = 'car';
    const drive = ROADS.find((r) => r.id === 'drive');
    for (const [, p] of along(drive?.pts ?? [], 5)) if (p[0] > 64) expect(v.surface(p[0], p[1]), `${p}`).toBe(0);
    expect(onRoad(110, -8)).toBe(false);
  });

  it('山上不能走', () => {
    const v = createValleyNav(new Set());
    expect(v.surface(-150, -300)).toBeNull();
    expect(v.surface(400, -300)).toBeNull();
  });

  it('俱乐部围墙那一圈（GROUNDS 外扩 1.5 米）挡住；里面也归 clubwalk，不归山谷', () => {
    const v = createValleyNav(new Set());
    expect(v.surface(GROUNDS.x1 + 1, 30)).toBeNull(); // 东墙（门洞以外）
    expect(v.surface(0, GROUNDS.z0 - 1)).toBeNull(); // 北墙
    expect(v.surface(0, 0)).toBeNull(); // 墙里面
    expect(v.surface(GROUNDS.x1 + 3, 30)).toBe(0); // 墙外
  });

  it('挡路表：楼都在里面；开车时俱乐部的门口多一道', () => {
    const v = createValleyNav(new Set());
    const n0 = v.blocked().length;
    expect(n0).toBe(BUILDINGS.length + houses().length);
    v.hotel = true;
    expect(v.blocked().length).toBe(n0 + HOTEL_BLDGS.length);
    v.mode = 'car';
    const gate = v.blocked().at(-1) as { a: readonly [number, number] };
    expect(gate.a[0]).toBeCloseTo(GATE.x + 0.6);
  });
});

describe('valley 地形', () => {
  it('平地上 mountainY < 0.06（被地面盖住）', () => {
    for (let x = VIEW.x0; x <= VIEW.x1; x += 20)
      for (let z = VIEW.z0; z <= VIEW.z1; z += 20) {
        if (!inFloor(x, z)) continue;
        expect(mountainY(x, z), `(${x},${z})`).toBeLessThan(0.06);
      }
  });

  /** 往正北多少米就是平地（maxK 以内没有 = Infinity） */
  const northToFloor = (x: number, z: number, maxK: number) => {
    for (let k = 1; k <= maxK; k++) if (inFloor(x, z - k)) return k;
    return Number.POSITIVE_INFINITY;
  };

  it('平地南边的山：高 < 往北到平地的距离（45° 俯视、镜头朝北，挡不住平地上的人）', () => {
    // 正交相机离目标 120 米（valley/main.ts 的 camera.dist）：山顶 y、往北 k 米是平地，(y + k)/√2 > 119 的在近裁剪面外面，不画，不算挡
    const bad: string[] = [];
    for (let x = -80; x <= VIEW.x1; x += 6) {
      let zEdge = Number.NEGATIVE_INFINITY;
      for (let z = -200; z <= 400; z += 2) if (inFloor(x, z)) zEdge = z;
      if (!Number.isFinite(zEdge)) continue;
      for (let dz = 1; dz <= 120; dz += 3) {
        const z = zEdge + dz;
        if (inFloor(x, z)) continue;
        const y = mountainY(x, z);
        const k = northToFloor(x, z, 120);
        if (y >= k && y + k < 168) bad.push(`(${x},${z}) y ${y.toFixed(1)} 往北 ${k}`);
      }
    }
    expect(bad.slice(0, 10)).toEqual([]);
  });

  it('整张图（山嘴、山口）都没有挡人的近山', () => {
    const bad: string[] = [];
    for (let x = VIEW.x0; x <= VIEW.x1; x += 8)
      for (let z = VIEW.z0; z <= VIEW.z1; z += 8) {
        if (inFloor(x, z)) continue;
        const y = mountainY(x, z);
        if (y < 1) continue;
        const k = northToFloor(x, z, Math.min(60, Math.ceil(y)));
        if (y >= k && y + k < 168) bad.push(`(${x},${z}) y ${y.toFixed(1)} 往北 ${k}`);
      }
    expect(bad.slice(0, 10)).toEqual([]);
  });

  it('CLUB_BOX 盖住俱乐部的围墙和车道起点', () => {
    expect(inClubBox(GROUNDS.x0, GROUNDS.z0) && inClubBox(GROUNDS.x1, GROUNDS.z1)).toBe(true);
    expect(CLUB_BOX.x1).toBeGreaterThanOrEqual(120);
  });
});

describe('NavMap：寻路网格比 bounds 小（spec.grid）', () => {
  const bounds = { x0: -100, x1: 100, z0: -20, z1: 20 };
  const grid = { x0: -10, x1: 10, z0: -10, z1: 10 };
  const wall = { x0: 40, x1: 42, z0: -20, z1: 20 };

  it('网格只铺 grid 那块；inGrid 按 grid 判', () => {
    const nav = new NavMap({ groundAt: () => 0, bounds, grid });
    expect(nav.stats()).toMatchObject({ nx: 100, nz: 100 });
    expect(nav.gridBounds).toEqual(grid);
    expect(nav.inGrid(0, 0)).toBe(true);
    expect(nav.inGrid(50, 0)).toBe(false);
    // bounds 照旧管能不能站
    expect(nav.standAt(50, 0)).toBe(0);
    expect(nav.standAt(150, 0)).toBeNull();
  });

  it('网格里照旧 A*', () => {
    const nav = new NavMap({ groundAt: () => 0, bounds, grid, blocked: [{ x0: -1, x1: 1, z0: -5, z1: 5 }] });
    const p = nav.findPath(-5, 0, 5, 0);
    expect(p).not.toBeNull();
    expect((p as [number, number][]).length).toBeGreaterThan(1);
  });

  it('没给 farPath：终点在网格外、能站 → 直着走过去；不能站 → null', () => {
    const nav = new NavMap({ groundAt: () => 0, bounds, grid, blocked: [wall] });
    expect(nav.findPath(0, 0, 60, 0)).toEqual([[60, 0]]);
    expect(nav.findPath(0, 0, 41, 0)).toBeNull(); // 墙里
    expect(nav.findPath(0, 0, 150, 0)).toBeNull(); // bounds 外
    expect(nav.findPath(60, 0, 0, 0)).toEqual([[0, 0]]); // 起点在外面
  });

  it('给了 farPath：网格外交给它（参数是原样的起点终点）', () => {
    const calls: number[][] = [];
    const nav = new NavMap({
      groundAt: () => 0,
      bounds,
      grid,
      farPath: (n, ax, az, bx, bz) => {
        calls.push([ax, az, bx, bz]);
        const p = n.findPath(ax, az, 9, 0);
        return p ? [...p, [bx, bz]] : null;
      },
    });
    const p = nav.findPath(0, 0, 60, 5);
    expect(calls).toEqual([[0, 0, 60, 5]]);
    expect(p?.at(-1)).toEqual([60, 5]);
    // 两头都在网格里：不问 farPath
    nav.findPath(0, 0, 5, 5);
    expect(calls.length).toBe(1);
  });

  it('valley 的 farPath：俱乐部 → 门外先寻到出口 (116, 0) 再直走；门外 → 门外直走；网格外不能站 → null', () => {
    const v = createValleyNav(new Set());
    const navGrid = { x0: -66, x1: 120, z0: -45, z1: 78 };
    const nav = new NavMap({
      groundAt: () => 0,
      bounds: { x0: VIEW.x0, x1: VIEW.x1, z0: VIEW.z0, z1: VIEW.z1 },
      grid: navGrid,
      // 俱乐部那块（墙里）这里当平地：只看网格外的接法
      surface: (x, z) => (x >= 61.6 && x <= 120 && Math.abs(z) < 4.4 ? 0 : v.surface(x, z)),
      blocked: v.blocked(),
      farPath: (n, ax, az, bx, bz) => v.farPath(n, ax, az, bx, bz),
    });
    const p = nav.findPath(80, 0, 150, 0);
    expect(p).not.toBeNull();
    const pts = p as [number, number][];
    expect(pts.at(-1)).toEqual([150, 0]);
    expect(pts.some(([x, z]) => Math.hypot(x - 116, z) < 0.5)).toBe(true);
    // 门外 → 门外
    expect(nav.findPath(150, 0, 200, 4)).toEqual([[200, 4]]);
    // 门外 → 楼里（不能站）
    const bank = BUILDINGS.find((b) => b.id === 'bank');
    if (!bank) throw new Error('bank');
    expect(nav.findPath(150, 0, bank.x, bank.z)).toBeNull();
    // 门外 → 俱乐部：先回到出口
    const q = nav.findPath(150, 0, 80, 0);
    expect(q?.[0]).toEqual([116, 0]);
    expect(q?.at(-1)?.[0]).toBeCloseTo(80, 0);
  });
});

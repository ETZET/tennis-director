// 地点表（clubsite/sim/places.ts）和站位表（spots.ts）对得上：每个地点都有站位、个数 = cap、站位不叠、在自己场景的区域范围里；
// 会所楼上 / 地下、泳池水里的站位另查。地点表自己的规矩（岗位、开门时间……）在 clubsite/sim/places.test.ts。在世界导航里站不站得住由 docs/lab/2026-11-24-clubsim/tools/spotcheck.mjs 查。
import { describe, expect, it } from 'vitest';
import type { Floor } from '../../clubhouse/layout';
import { houseNav } from '../../clubhouse/nav';
import type { SceneId } from '../../clubsite/cast/types';
import { NavMap } from '../../clubsite/play/nav';
import { PLACE_BY_ID, PLACES } from '../../clubsite/sim/places';
import { POOL, type Rect } from '../../clubsite/world';
import { SPOTS } from './spots';

/**
 * 各区域的范围（照抄 clubwalk/regions.ts 的 rects：那边 import 了所有场景模块和 three，测试里不拉进来）。
 * regions.ts 改了范围，这里跟着改。
 */
const REGION_RECTS: Record<SceneId, Rect[]> = {
  clubpark: [{ x0: 61, x1: 140, z0: -45, z1: 45 }],
  clubdesk: [{ x0: 52, x1: 61, z0: -8.6, z1: 34 }],
  clubpickle: [
    { x0: 33.6, x1: 52, z0: -8.6, z1: 16.6 },
    { x0: 36, x1: 52, z0: 16.6, z1: 34 },
  ],
  clubplaza: [{ x0: 31, x1: 61, z0: -44, z1: -8.6 }],
  clubstadium: [
    { x0: -21.4, x1: 31, z0: -44, z1: -8.6 },
    { x0: -22.6, x1: -21.4, z0: -30, z1: -8.6 },
    { x0: -21.4, x1: 33.6, z0: -8.6, z1: -4.4 },
  ],
  clubcourts: [
    { x0: -38.5, x1: 27, z0: -4.4, z1: 16.6 },
    { x0: -38.5, x1: -1, z0: 16.6, z1: 47 },
  ],
  clubclay: [{ x0: -1, x1: 36, z0: 16.6, z1: 53 }],
  clubhouse: [
    { x0: -64.5, x1: -46, z0: -44, z1: -1 },
    { x0: -46, x1: -40, z0: -44, z1: -27 },
  ],
  clubpool: [
    { x0: -64.5, x1: -38.5, z0: -1, z1: 20 },
    { x0: -46, x1: -38.5, z0: -9.4, z1: -1 },
  ],
  clubgolf: [
    { x0: -64.5, x1: -1, z0: 51.4, z1: 78 },
    { x0: -1, x1: 36, z0: 53, z1: 78 },
    { x0: 36, x1: 96, z0: 51.4, z1: 78 },
  ],
  clubfood: [
    { x0: -40, x1: -21.4, z0: -44, z1: -30 },
    { x0: -40, x1: -22.6, z0: -30, z1: -9.4 },
    { x0: -46, x1: -40, z0: -27, z1: -9.4 },
  ],
};
/** 坐的位置可以压过区域的边一点（长椅横跨两个区域的缝：前台草坪边的长椅西头 x 51.95，区域边 x 52） */
const EDGE = 0.6;
const inScene = (scene: SceneId, x: number, z: number) =>
  REGION_RECTS[scene].some((r) => x >= r.x0 - EDGE && x <= r.x1 + EDGE && z >= r.z0 - EDGE && z <= r.z1 + EDGE);

describe('站位表', () => {
  it('每个地点都有站位，没有多出来的', () => {
    for (const p of PLACES) expect(SPOTS[p.id], p.id).toBeDefined();
    for (const id of Object.keys(SPOTS)) expect(PLACE_BY_ID[id], id).toBeDefined();
  });

  it('站位个数 = cap；排队的点 = queue（有队的地点）', () => {
    for (const p of PLACES) {
      expect(SPOTS[p.id].spots.length, p.id).toBe(p.cap);
      if (p.queue) expect(SPOTS[p.id].queue?.length, p.id).toBe(p.queue);
      else expect(SPOTS[p.id].queue, p.id).toBeUndefined();
    }
  });

  it('坐标是有限数，yaw 在 [−2π, 2π]', () => {
    for (const [id, s] of Object.entries(SPOTS))
      for (const p of [...s.spots, ...(s.queue ?? [])]) {
        expect(Number.isFinite(p.x) && Number.isFinite(p.z) && Number.isFinite(p.yaw), id).toBe(true);
        expect(Math.abs(p.yaw), id).toBeLessThanOrEqual(2 * Math.PI);
      }
  });

  it('同一个地点里的站位、排队的点不叠在一起（隔 ≥ 0.45 米）', () => {
    for (const [id, s] of Object.entries(SPOTS)) {
      const pts = [...s.spots, ...(s.queue ?? [])];
      for (let i = 0; i < pts.length; i++)
        for (let j = i + 1; j < pts.length; j++) {
          const d = Math.hypot(pts[i].x - pts[j].x, pts[i].z - pts[j].z) + Math.abs((pts[i].y ?? 0) - (pts[j].y ?? 0));
          expect(d, `${id} ${i}/${j}`).toBeGreaterThanOrEqual(0.45);
        }
    }
  });

  it('不同地点的站位不叠在一起（隔 ≥ 0.4 米；同一层）', () => {
    const all = Object.entries(SPOTS).flatMap(([id, s]) =>
      [...s.spots, ...(s.queue ?? [])].map((p) => ({ id, x: p.x, z: p.z, y: p.y ?? 0 })),
    );
    const clash: string[] = [];
    for (let i = 0; i < all.length; i++)
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i];
        const b = all[j];
        if (a.id === b.id || Math.abs(a.y - b.y) > 1) continue;
        if (Math.hypot(a.x - b.x, a.z - b.z) < 0.4) clash.push(`${a.id} × ${b.id} @ ${a.x},${a.z}`);
      }
    expect(clash).toEqual([]);
  });

  it('站位、排队的点、门都在自己场景的区域范围里', () => {
    const out: string[] = [];
    for (const p of PLACES) {
      const s = SPOTS[p.id];
      for (const q of [...s.spots, ...(s.queue ?? []), ...(s.door ? [s.door] : [])])
        if (!inScene(p.scene, q.x, q.z)) out.push(`${p.id} (${q.x}, ${q.z})`);
    }
    expect(out).toEqual([]);
  });

  it('藏起来的地点有门；地点的 x / z 离它的站位不远（估路程用）', () => {
    for (const p of PLACES) {
      const s = SPOTS[p.id];
      if (s.hidden) expect(s.door, p.id).toBeDefined();
      const near = Math.min(...s.spots.map((q) => Math.hypot(q.x - p.x, q.z - p.z)));
      expect(near, p.id).toBeLessThan(25);
    }
  });
});

describe('看不见的地方（世界导航之外）', () => {
  /** 会所每一层自己的导航（同 clubhouse/nav.test.ts） */
  const BOUNDS = { x0: -64, x1: -38, z0: -43, z1: -1 };
  const NAV: Partial<Record<Floor, NavMap>> = {
    2: new NavMap({ groundAt: () => 0, bounds: BOUNDS, ...houseNav(2) }),
    [-1]: new NavMap({ groundAt: () => 0, bounds: BOUNDS, ...houseNav(-1) }),
  };
  const nearFree = (nav: NavMap, x: number, z: number) => {
    for (let r = 0.1; r <= 1.2; r += 0.1)
      for (let k = 0; k < 24; k++) {
        const a = (k / 24) * 2 * Math.PI;
        if (nav.standAt(x + Math.cos(a) * r, z + Math.sin(a) * r) !== null) return true;
      }
    return false;
  };

  it('会所二楼、负一层的站位在那一层的导航里站得住（坐的、器械上的、柜台后的：旁边 1.2 米内能站）', () => {
    const bad: string[] = [];
    for (const p of PLACES) {
      const s = SPOTS[p.id];
      if (p.scene !== 'clubhouse' || !s.hidden) continue;
      expect(s.door, p.id).toBeDefined();
      s.spots.forEach((q, i) => {
        const f: Floor = (q.y ?? 0) > 2 ? 2 : -1;
        const nav = NAV[f] as NavMap;
        // 坐的、在器械上的（健身房）、柜台后面的员工（岗位）：人在家具的脚印里，旁边能站就行
        const onProp = q.pose === 'sit' || p.kind === 'gym' || p.kind === 'post';
        const ok = onProp ? nearFree(nav, q.x, q.z) : nav.standAt(q.x, q.z) !== null;
        if (!ok) bad.push(`${p.id} ${i} ${f}F (${q.x}, ${q.z})`);
      });
    }
    expect(bad).toEqual([]);
  });

  it('泳池水里的站位在池子里（离池壁 ≥ 0.8 米），浅水台阶上的孩子不在台阶上', () => {
    for (const id of ['pool.water', 'pool.kids']) {
      for (const q of SPOTS[id].spots) {
        expect(q.x > POOL.x0 + 0.8 && q.x < POOL.x1 - 0.8 && q.z > POOL.z0 + 0.8 && q.z < POOL.z1 - 0.8, id).toBe(true);
        expect(q.y ?? 0, id).toBeLessThan(0);
      }
    }
    // 浅水台阶 x −44.05…−42.55（clubpool POOL_STEPS）
    for (const q of SPOTS['pool.water'].spots) expect(q.x, 'pool.water').toBeLessThan(-44.6);
  });
});

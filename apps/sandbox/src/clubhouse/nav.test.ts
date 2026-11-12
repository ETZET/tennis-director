// 会所三层的导航：每层一张 NavMap（houseNav(层)），门、楼梯、每间房走得到；floorFor 的滞回；站位、路线都站得住。
// 第二版（final2.md）：1F 商店层、2F 会员层 + 后厨、B1 一整层健身房 + 后场；电梯（钟楼）+ 货梯（东翼）三层同一个门口。
// 家具（slots-*.ts）挡住门的话这里会红：失败信息里写着是哪个摆件（blockersNear）。
import { describe, expect, it } from 'vitest';
import { NavMap } from '../clubsite/play/nav';
import { DOORS, FLOOR_Y, type Floor, GOODS_LIFT, LIFT, roomsOn } from './layout';
import { floorFor, houseNav } from './nav';
import { SPECS } from './placeholders';
import { type P3, ROUTES, SPOTS } from './routes';
import { SLOTS } from './slots';

const BOUNDS = { x0: -64, x1: -38, z0: -43, z1: -1 };
const NAV: Record<Floor, NavMap> = {
  1: new NavMap({ groundAt: () => 0, bounds: BOUNDS, ...houseNav(1) }),
  2: new NavMap({ groundAt: () => 0, bounds: BOUNDS, ...houseNav(2) }),
  [-1]: new NavMap({ groundAt: () => 0, bounds: BOUNDS, ...houseNav(-1) }),
};

/** 点的高度 → 用哪一层的导航（同 floorFor 从一层出发：过 ±1.7 换层） */
const floorOfY = (y: number): Floor => floorFor(1, y);
const yOf = (p: P3) => (p.length > 2 ? (p[2] as number) : 0);

/** 调试：(x, z) 附近 r 米以内这一层挡路的摆件 id（失败信息用） */
function blockersNear(f: Floor, x: number, z: number, r = 1.2): string[] {
  return SLOTS.filter((s) => (s.level ?? 1) === f && SPECS[s.asset] && Math.hypot(s.x - x, s.z - z) < r + 1).map(
    (s) => `${s.id}(${s.asset} @ ${s.x},${s.z})`,
  );
}

/** 房间里离中心最近的能站的格子（必须在房间里面） */
function freeIn(nav: NavMap, r: { x0: number; x1: number; z0: number; z1: number }): [number, number] | null {
  const cx = (r.x0 + r.x1) / 2;
  const cz = (r.z0 + r.z1) / 2;
  const R = Math.min(r.x1 - r.x0, r.z1 - r.z0) / 2;
  const p = nav.nearestFree(cx, cz, R);
  if (p && p[0] > r.x0 && p[0] < r.x1 && p[1] > r.z0 && p[1] < r.z1) return p;
  // 中心一圈都被家具占了：整间房扫一遍
  let best: [number, number] | null = null;
  let bd = Infinity;
  for (let x = r.x0 + 0.3; x < r.x1 - 0.3; x += 0.2)
    for (let z = r.z0 + 0.3; z < r.z1 - 0.3; z += 0.2) {
      if (nav.standAt(x, z) === null) continue;
      const d = Math.hypot(x - cx, z - cz);
      if (d < bd) {
        bd = d;
        best = [x, z];
      }
    }
  return best;
}

/** 从 a 走到 b：有路、终点就是 b（不是 b 附近的替身）；返回终点脚下的高度 */
function reach(f: Floor, a: readonly [number, number], b: readonly [number, number], what: string): number {
  const nav = NAV[f];
  const p = nav.findPath(a[0], a[1], b[0], b[1]);
  const msg = `${what}：${f}F (${a}) → (${b})；附近的摆件 ${blockersNear(f, b[0], b[1]).join(', ') || '无'}`;
  expect(p, msg).not.toBeNull();
  const end = (p as [number, number][]).at(-1) as [number, number];
  expect(Math.hypot(end[0] - b[0], end[1] - b[1]), msg).toBeLessThan(0.35);
  return nav.height(end[0], end[1]) as number;
}

/** 每间房（ROOMS）：里面找一格能站的，从 from 走得到，脚下是这一层的地面 */
function everyRoom(f: Floor, from: readonly [number, number], skip: string[]) {
  for (const room of roomsOn(f).filter((r) => !r.hole && !skip.includes(r.id))) {
    it(`→ ${room.id}（${room.name}）`, () => {
      const p = freeIn(NAV[f], room.r);
      const c: [number, number] = [(room.r.x0 + room.r.x1) / 2, (room.r.z0 + room.r.z1) / 2];
      expect(p, `${room.id} 里没有能站的地方：${blockersNear(f, ...c, 4).join(', ') || '无'}`).not.toBeNull();
      expect(reach(f, from, p as [number, number], room.id)).toBeCloseTo(FLOOR_Y[f], 1);
    });
  }
}

const CORE_MOUTH: [number, number] = [-52.2, -23.2];
const LANDING: [number, number] = [-52.2, -28.4];
const KIOSK_YARD: [number, number] = [-43, -26.1];
/** 后门外（−39.4, −35.6）是 clubfood 的地，不在会所的导航里：从门里起 */
const BACK_DOOR = DOORS.kitchenBack.in;

describe('clubhouse nav · 1F（商店层）', () => {
  const f: Floor = 1;
  it('四扇外门的门外（后门外归 clubfood）、门里站得住', () => {
    for (const d of Object.values(DOORS)) {
      if (d !== DOORS.kitchenBack) expect(NAV[f].standAt(...d.out), `${d.name} 门外`).toBe(0);
      expect(NAV[f].standAt(...d.in), `${d.name} 门里`).toBe(0);
    }
  });
  it('正门里 → 楼梯口、南门外、电梯门口、货梯门口', () => {
    reach(f, DOORS.main.in, CORE_MOUTH, '楼梯口');
    reach(f, DOORS.main.in, DOORS.south.out, '南门外');
    reach(f, DOORS.main.in, LIFT.door, '电梯门口');
    reach(f, DOORS.main.in, GOODS_LIFT.door, '货梯门口');
  });
  it('便利店：从小院的门（−43, −26.1）进', () => {
    const p = freeIn(NAV[f], { x0: -46, x1: -40, z0: -33, z1: -27 }) as [number, number];
    expect(p).not.toBeNull();
    reach(f, KIOSK_YARD, DOORS.kitchen.in, '便利店门里');
    reach(f, KIOSK_YARD, p, '便利店');
  });
  it('货梯厅：从后门里（−41, −35.6）进 → 货梯门口', () => {
    const p = freeIn(NAV[f], { x0: -46, x1: -40, z0: -40, z1: -33 }) as [number, number];
    expect(p).not.toBeNull();
    reach(f, BACK_DOOR, p, '货梯厅');
    reach(f, BACK_DOOR, GOODS_LIFT.door, '货梯门口');
  });
  describe('正门里 → 每间店、过道', () => {
    everyRoom(f, DOORS.main.in, ['stairCore']);
  });
  it('楼梯口 → up1 → 平台（y 2）', () => {
    const h = reach(f, CORE_MOUTH, LANDING, '上楼平台');
    expect(h).toBeCloseTo(2, 1);
  });
  it('楼梯口 → down1 往下（y 过 −1.7，换到 B1）', () => {
    const h = reach(f, CORE_MOUTH, [-51.3, -26.7], '下楼梯段底');
    expect(h).toBeLessThan(-1.7);
    expect(floorFor(1, h)).toBe(-1);
  });
});

describe('clubhouse nav · 2F（会员层）', () => {
  const f: Floor = 2;
  const bar = freeIn(NAV[f], { x0: -54, x1: -46, z0: -24, z1: -19.6 }) as [number, number];
  it('平台（y 2）站得住', () => {
    expect(NAV[f].standAt(...LANDING)).toBeCloseTo(2, 1);
  });
  it('平台 → up2 → 酒吧（y 4）', () => {
    expect(bar).not.toBeNull();
    expect(reach(f, LANDING, bar, '酒吧')).toBeCloseTo(FLOOR_Y[2], 1);
  });
  describe('酒吧 → 每间房', () => {
    everyRoom(f, bar ?? LANDING, ['bar']);
  });
  it('酒吧 → 露台转角、电梯门口、货梯门口（后厨里）', () => {
    expect(reach(f, bar, [-48.1, -13.0], '露台转角')).toBeCloseTo(FLOOR_Y[2], 1);
    expect(reach(f, bar, LIFT.door, '电梯门口')).toBeCloseTo(FLOOR_Y[2], 1);
    expect(reach(f, bar, GOODS_LIFT.door, '货梯门口')).toBeCloseTo(FLOOR_Y[2], 1);
  });
  it('楼梯井栏板挡着：酒吧和 up1 的上半段之间不能直接跨过去', () => {
    // up1 上半段（y ≈ 1）就在栏板（z −24）北边一步，直线跨过去的高差 3 米：lineClear 不通
    expect(NAV[f].lineClear(-53.1, -23.0, -53.1, -25.5)).toBe(false);
  });
});

describe('clubhouse nav · B1（健身房）', () => {
  const f: Floor = -1;
  it('平台（y −2）站得住', () => {
    expect(NAV[f].standAt(...LANDING)).toBeCloseTo(-2, 1);
  });
  const lobby = freeIn(NAV[f], { x0: -54, x1: -46, z0: -24, z1: -17 }) as [number, number];
  it('平台 → down2 → 前台大厅（y −4）', () => {
    expect(lobby).not.toBeNull();
    expect(reach(f, LANDING, lobby, '前台大厅')).toBeCloseTo(FLOOR_Y[-1], 1);
  });
  describe('前台大厅 → 每个区、更衣、后场', () => {
    everyRoom(f, lobby ?? LANDING, ['stairB1']);
  });
  it('前台大厅 → 电梯门口、货梯门口（洗衣房里）', () => {
    expect(reach(f, lobby, LIFT.door, '电梯门口')).toBeCloseTo(FLOOR_Y[-1], 1);
    expect(reach(f, lobby, GOODS_LIFT.door, '货梯门口')).toBeCloseTo(FLOOR_Y[-1], 1);
  });
});

describe('电梯（钟楼）、货梯（东翼）：三层同一个门口', () => {
  for (const [what, L] of [
    ['电梯', LIFT],
    ['货梯', GOODS_LIFT],
  ] as const) {
    for (const f of L.levels) {
      it(`${f}F 的${what}门口站得住（高度 ${FLOOR_Y[f]}）`, () => {
        const h = NAV[f].standAt(...L.door);
        expect(h, `附近的摆件 ${blockersNear(f, ...L.door).join(', ') || '无'}`).not.toBeNull();
        expect(h as number).toBeCloseTo(FLOOR_Y[f], 5);
      });
    }
  }
  it('1F 钟楼门厅：北门 → 南门（电梯门口前那条路）', () => {
    reach(1, [-47.4, -20.4], DOORS.south.in, '南门里');
    reach(1, DOORS.south.in, DOORS.south.out, '南门外');
  });
});

describe('floorFor（滞回）', () => {
  it.each([
    [1, 0, 1],
    [1, 1.69, 1],
    [1, 1.71, 2],
    [1, -1.69, 1],
    [1, -1.71, -1],
    [2, 2.0, 2],
    [2, 1.65, 2],
    [2, 1.59, 1],
    [2, 4, 2],
    [-1, -2.0, -1],
    [-1, -1.65, -1],
    [-1, -1.59, 1],
    [-1, -4, -1],
  ] as [Floor, number, Floor][])('floorFor(%d, %d) = %d', (cur, y, want) => {
    expect(floorFor(cur, y)).toBe(want);
  });
  it('上楼 → 下楼来回在 1.6～1.7 之间不抖', () => {
    let f: Floor = 1;
    const seen: Floor[] = [];
    for (const y of [1.5, 1.65, 1.72, 1.65, 1.62, 1.68, 1.55, 1.65]) {
      f = floorFor(f, y);
      seen.push(f);
    }
    expect(seen).toEqual([1, 1, 2, 2, 2, 2, 1, 1]);
  });
});

/** 原地换层（坐电梯 / 货梯）只能在两个门口 */
const LIFT_DOORS = [LIFT.door, GOODS_LIFT.door];

describe('站位、路线', () => {
  for (const [id, s] of Object.entries(SPOTS)) {
    it(`站位 ${id} 站得住`, () => {
      const y = yOf(s.at);
      const f = floorOfY(y);
      const h = NAV[f].standAt(s.at[0], s.at[1]);
      expect(
        h,
        `${id} @ ${s.at}（${f}F）；附近的摆件 ${blockersNear(f, s.at[0], s.at[1]).join(', ') || '无'}`,
      ).not.toBeNull();
      expect(Math.abs((h as number) - y)).toBeLessThan(0.3);
    });
  }
  for (const r of ROUTES) {
    it(`路线 ${r.id}：每个点站得住，每段直着走得通`, () => {
      for (let i = 0; i < r.pts.length; i++) {
        const a = r.pts[i];
        const ya = yOf(a);
        const fa = floorOfY(ya);
        const h = NAV[fa].standAt(a[0], a[1]);
        expect(
          h,
          `${r.id}[${i}] @ ${a}（${fa}F）；附近 ${blockersNear(fa, a[0], a[1]).join(', ') || '无'}`,
        ).not.toBeNull();
        expect(Math.abs((h as number) - ya), `${r.id}[${i}] 高度`).toBeLessThan(0.3);
        if (i + 1 >= r.pts.length) continue;
        const b = r.pts[i + 1];
        const yb = yOf(b);
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (L < 1e-6) {
          // 坐电梯 / 货梯：只在门口
          expect(
            Math.min(...LIFT_DOORS.map((d) => Math.hypot(a[0] - d[0], a[1] - d[1]))),
            `${r.id}[${i}] 原地换层只能在电梯 / 货梯门口`,
          ).toBeLessThan(0.01);
          continue;
        }
        const n = Math.ceil(L / 0.1);
        for (let k = 1; k < n; k++) {
          const t = k / n;
          const x = a[0] + (b[0] - a[0]) * t;
          const z = a[1] + (b[1] - a[1]) * t;
          const y = ya + (yb - ya) * t;
          const f = floorOfY(y);
          const nav = NAV[f];
          const g = nav.clearAt(x, z);
          const where = `${r.id} 段 ${i}→${i + 1} 在 (${x.toFixed(2)}, ${z.toFixed(2)}, y ${y.toFixed(2)}, ${f}F)`;
          expect(g, `${where} 站不住`).not.toBeNull();
          expect(Math.abs((g as number) - y), `${where} 高度对不上（${g}）`).toBeLessThan(0.3);
          expect(
            nav.hitsBlocked(x, z, nav.body - 0.03),
            `${where} 穿墙 / 家具；附近 ${blockersNear(f, x, z).join(', ') || '无'}`,
          ).toBe(false);
        }
      }
    });
  }
});

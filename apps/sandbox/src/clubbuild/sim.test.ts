// clubbuild 模拟的测试：摆放校验、组合、走得到、收盘、升星。pnpm vitest run apps/sandbox/src/clubbuild
import { describe, expect, it } from 'vitest';
import { BY_ID, DAY_SECONDS, LOT_D, LOT_W, STAR_GOALS, START_MONEY } from './catalog';
import {
  apply,
  canPlace,
  comboPreview,
  doorTile,
  GATE_COLS,
  GATE_ROW,
  newState,
  occupancy,
  pathLine,
  reachableSet,
  route,
  type SimEvent,
  STARTER,
  type State,
  tick,
  unreachable,
  visitorsPerDay,
  withLayout,
} from './sim';

/** 一直 tick 到收盘（或 maxSec 秒），收集事件 */
function runDay(s: State, step = 0.05): { state: State; events: SimEvent[] } {
  const events: SimEvent[] = [];
  const day = s.day;
  for (let t = 0; t < DAY_SECONDS * 1.2 && s.day === day; t += step) {
    const r = tick(s, step);
    s = r.state;
    events.push(...r.events);
  }
  return { state: s, events };
}

const placeOk = (s: State, id: string, col: number, row: number, rot: 0 | 1 | 2 | 3 = 0) => {
  const r = apply(s, { type: 'place', id, col, row, rot });
  expect(r.events[0]?.type).toBe('placed');
  return r.state;
};

/** 建造跑完（不进入营业时段太多） */
const finishBuild = (s: State) => tick(s, 2.5).state;

describe('摆放', () => {
  it('在界内、不重叠、钱够、星级够才能放，当场扣钱', () => {
    const s = newState(1);
    expect(canPlace(s, 'court-hard', 0, 0)).toBeNull();
    expect(canPlace(s, 'court-hard', LOT_W - 5, 0)).toBe('bounds');
    expect(canPlace(s, 'court-hard', 0, LOT_D - 11)).toBe('bounds');
    expect(canPlace(s, 'clubhouse', 0, 0)).toBe('locked');
    expect(canPlace(s, 'nope', 0, 0)).toBe('unknown');
    const s2 = placeOk(s, 'court-hard', 0, 0);
    expect(s2.money).toBe(START_MONEY - BY_ID['court-hard'].cost);
    expect(canPlace(s2, 'cafe', 5, 11)).toBe('overlap');
    expect(canPlace(s2, 'cafe', 6, 11)).toBeNull();
    // 原状态没被改（纯函数）
    expect(s.placed.length).toBe(0);
    expect(s.money).toBe(START_MONEY);
  });

  it('转 90° 时占地对调', () => {
    const s = newState(1);
    // 6×12 转一下 = 12×6
    expect(canPlace(s, 'court-hard', 0, 0, 1)).toBeNull();
    expect(canPlace(s, 'court-hard', LOT_W - 12, 0, 1)).toBeNull();
    expect(canPlace(s, 'court-hard', LOT_W - 11, 0, 1)).toBe('bounds');
  });

  it('钱不够不能放，大门上不能放', () => {
    const s = newState(1, { money: 100 });
    expect(canPlace(s, 'court-hard', 0, 0)).toBe('money');
    const s2 = newState(1);
    expect(canPlace(s2, 'path', GATE_COLS[0], GATE_ROW)).toBe('overlap');
  });

  it('拆除退一半', () => {
    let s = placeOk(newState(1), 'cafe', 0, 0);
    const uid = s.placed[0].uid;
    const r = apply(s, { type: 'remove', uid });
    s = r.state;
    expect(s.placed.length).toBe(0);
    expect(s.money).toBe(START_MONEY - BY_ID.cafe.cost + Math.floor(BY_ID.cafe.cost / 2));
  });

  it('门格跟着转', () => {
    // 咖啡车 2×2，门 (1,1)：rot 0 右下，rot 2 左上
    expect(doorTile({ id: 'cafe', col: 4, row: 4, rot: 0 })).toEqual([5, 5]);
    expect(doorTile({ id: 'cafe', col: 4, row: 4, rot: 2 })).toEqual([4, 4]);
    // 硬地 6×12 门 (3,11)：rot 1 → 门转到东边（+x）
    const [c, r] = doorTile({ id: 'court-hard', col: 0, row: 0, rot: 1 });
    expect(c).toBe(11);
    expect(r).toBeGreaterThanOrEqual(2);
    expect(r).toBeLessThanOrEqual(3);
  });

  it('开局布局都摆得下', () => {
    const s = withLayout(newState(1), STARTER);
    expect(s.placed.length).toBe(STARTER.length);
    expect(s.money).toBe(START_MONEY);
  });
});

describe('走得到', () => {
  it('门口的步道连到大门才算走得到', () => {
    // 咖啡车放在大门正上方，门格 (9, 23)；先不铺路
    let s = finishBuild(placeOk(newState(1), 'cafe', 8, 22));
    const uid = s.placed[0].uid;
    expect(reachableSet(s).has(uid)).toBe(false);
    expect(unreachable(s)).toEqual([uid]);
    expect(visitorsPerDay(s)).toBe(0);
    // 门格 (9,23) 下面 (9,24) 铺一格路，挨着大门 (9,25)
    s = placeOk(s, 'path', 9, 24);
    expect(reachableSet(s).has(uid)).toBe(true);
    expect(unreachable(s)).toEqual([]);
    const r = route(s, null, uid);
    expect(r).not.toBeNull();
    expect(r?.[r.length - 1]).toEqual([9, 23]);
    expect(visitorsPerDay(s)).toBeGreaterThan(0);
  });

  it('断开的路走不到', () => {
    let s = finishBuild(placeOk(newState(1), 'cafe', 2, 2));
    for (const p of pathLine(3, 4, 3, 10)) s = placeOk(s, p.id, p.col, p.row);
    const uid = s.placed[0].uid;
    expect(reachableSet(s).has(uid)).toBe(false);
    for (const p of pathLine(4, 10, 8, 10)) s = placeOk(s, p.id, p.col, p.row);
    for (const p of pathLine(8, 11, 8, 24)) s = placeOk(s, p.id, p.col, p.row);
    expect(reachableSet(s).has(uid)).toBe(true);
  });

  it('开局布局的球场和咖啡车都走得到', () => {
    const s = withLayout(newState(1), STARTER);
    expect(unreachable(s)).toEqual([]);
  });

  it('占用表标出大门', () => {
    const occ = occupancy(newState(1));
    expect(occ[GATE_ROW * LOT_W + GATE_COLS[0]]).toBe(-1);
  });
});

describe('组合', () => {
  it('咖啡车挨着球场：建好时发现"打完来一杯"，第二对不算新发现', () => {
    let s = withLayout(newState(1), STARTER);
    // 球场 (2..7, 2..13)；咖啡车转 180°放在 (2,15)：隔一行步道
    const pv = comboPreview(s, 'cafe', 2, 15, 2);
    expect(pv.map((x) => x.combo.id)).toContain('cafe-court');
    s = placeOk(s, 'cafe', 2, 15, 2);
    const r = tick(s, 2.5);
    const found = r.events.filter((e) => e.type === 'comboFound');
    expect(found.length).toBe(1);
    expect(found[0]).toMatchObject({ combo: 'cafe-court', first: true });
    expect(r.state.combos).toContain('cafe-court');
    // 第二辆咖啡车在球场另一边：同一组合，first = false；两辆咖啡车挨着 → 美食街
    s = placeOk(r.state, 'cafe', 4, 15, 2);
    const r2 = tick(s, 2.5);
    const f2 = r2.events.filter((e) => e.type === 'comboFound');
    expect(f2.find((e) => e.type === 'comboFound' && e.combo === 'cafe-court')).toMatchObject({ first: false });
    expect(f2.find((e) => e.type === 'comboFound' && e.combo === 'food-food')).toMatchObject({ first: true });
  });

  it('隔太远不成组合', () => {
    const s = withLayout(newState(1), STARTER);
    expect(comboPreview(s, 'cafe', 14, 2, 0).filter((x) => x.combo.id === 'cafe-court')).toEqual([]);
  });

  it('拆掉一边，那一对组合就没了（发现过的还记着）', () => {
    let s = withLayout(newState(1), STARTER);
    s = tick(placeOk(s, 'cafe', 2, 15, 2), 2.5).state;
    expect(s.pairs.length).toBeGreaterThan(0);
    const uid = s.placed[s.placed.length - 1].uid;
    s = apply(s, { type: 'remove', uid }).state;
    expect(s.pairs.some((k) => k.includes(`:${uid}`))).toBe(false);
    expect(s.combos).toContain('cafe-court');
  });
});

describe('一天', () => {
  it('客人来、花钱、收盘扣维护费', () => {
    const s0 = withLayout(newState(7), STARTER);
    const { state, events } = runDay(s0);
    const arrive = events.filter((e) => e.type === 'visitorArrive').length;
    const spend = events.filter((e) => e.type === 'visitorSpend');
    const settled = events.find((e) => e.type === 'daySettled');
    expect(arrive).toBeGreaterThan(5);
    expect(spend.length).toBeGreaterThanOrEqual(arrive * 0.8);
    expect(settled).toBeDefined();
    if (settled?.type !== 'daySettled') throw new Error();
    const income = spend.reduce((a, e) => a + (e.type === 'visitorSpend' ? e.amount : 0), 0);
    expect(settled.income).toBe(income);
    expect(settled.upkeep).toBe(BY_ID['court-hard'].upkeep + BY_ID.cafe.upkeep);
    expect(state.money).toBe(s0.money + income - settled.upkeep);
    expect(state.day).toBe(s0.day + 1);
    expect(state.time).toBe(0);
    expect(state.visitors.length).toBe(0);
    expect(settled.reasons.length).toBeGreaterThan(0);
    // 每位客人最后都走了
    const leave = events.filter((e) => e.type === 'visitorLeave').length;
    expect(leave).toBe(arrive);
  });

  it('同样的种子同样的一天（不用 Math.random）', () => {
    const a = runDay(withLayout(newState(5), STARTER)).state;
    const b = runDay(withLayout(newState(5), STARTER)).state;
    expect(a.money).toBe(b.money);
    expect(a.totalVisitors).toBe(b.totalVisitors);
  });

  it('客满会有人走掉，容量从不超', () => {
    let s = withLayout(newState(3), STARTER);
    let maxOcc = 0;
    for (let t = 0; t < DAY_SECONDS; t += 0.05) {
      s = tick(s, 0.05).state;
      const court = s.placed.find((p) => p.id === 'court-hard');
      const n = s.visitors.filter((v) => v.stage !== 'out' && v.stops[v.i] === court?.uid).length;
      maxOcc = Math.max(maxOcc, n);
    }
    expect(maxOcc).toBeLessThanOrEqual(BY_ID['court-hard'].cap);
  });

  it('没路的设施：不来客人，收盘说明原因', () => {
    const s = finishBuild(placeOk(newState(1), 'cafe', 2, 2));
    const { events } = runDay(s);
    const settled = events.find((e) => e.type === 'daySettled');
    if (settled?.type !== 'daySettled') throw new Error();
    expect(settled.visitors).toBe(0);
    expect(settled.reasons.join()).toContain('没有路');
  });
});

describe('升星', () => {
  it('目标都够了，收盘时升星并解锁', () => {
    const g = STAR_GOALS[0];
    let s = withLayout(newState(1), STARTER);
    s = tick(placeOk(s, 'cafe', 2, 15, 2), 2.5).state; // 一个组合 + 设施数
    s = tick(placeOk(s, 'practice-wall', 14, 2, 0), 2.5).state;
    s = { ...s, totalVisitors: g.visitors };
    const { events, state } = runDay(s);
    const up = events.find((e) => e.type === 'starUp');
    expect(up).toMatchObject({ star: 1 });
    if (up?.type !== 'starUp') throw new Error();
    expect(up.unlocked).toContain('clubhouse');
    expect(state.star).toBe(1);
    expect(canPlace(state, 'clubhouse', 9, 6)).toBeNull();
  });

  it('目标不够不升', () => {
    const s = withLayout(newState(1), STARTER);
    const { events } = runDay(s);
    expect(events.some((e) => e.type === 'starUp')).toBe(false);
  });
});

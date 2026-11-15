// clubbuild 模拟的测试：摆放校验、地块开放、地形、组合（含拆掉就掉）、光环、停车场、预计客人、走得到、收盘（和昨天比、挡不挡）、
// 会员、升级、一周日历、升星。pnpm vitest run apps/sandbox/src/clubbuild
import { describe, expect, it } from 'vitest';
import { BY_ID, DAY_SECONDS, DEFS, LOT_D, LOT_W, STAR_GOALS, START_MONEY, TERRAIN } from './catalog';
import {
  activeComboKinds,
  appealOf,
  apply,
  canPlace,
  capOf,
  comboPreview,
  dayInfo,
  demandPerDay,
  doorTile,
  forecast,
  GATE_COLS,
  GATE_ROW,
  MEMBER_FEE,
  newState,
  nextGoalHint,
  occupancy,
  openRowStart,
  pathLine,
  placeError,
  reachableSet,
  route,
  type SimEvent,
  STARTER,
  type State,
  spendOf,
  starProgress,
  TERRAIN_VARIANTS,
  terrainVariant,
  tick,
  unreachable,
  upgradeInfo,
  visitorsPerDay,
  withLayout,
} from './sim';

/** 一直 tick 到收盘，收集事件 */
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

const settledOf = (events: SimEvent[]) => {
  const e = events.find((x) => x.type === 'daySettled');
  if (e?.type !== 'daySettled') throw new Error('没收盘');
  return e;
};

const placeOk = (s: State, id: string, col: number, row: number, rot: 0 | 1 | 2 | 3 = 0) => {
  const r = apply(s, { type: 'place', id, col, row, rot });
  expect(r.events[0]?.type).toBe('placed');
  return r.state;
};

/** 建造跑完（不进入营业时段太多） */
const finishBuild = (s: State) => tick(s, 2.5).state;
/** 没有地形的空地（老测试的坐标用） */
const bare = (seed = 1, opts: Parameters<typeof newState>[1] = {}) => newState(seed, { terrain: false, ...opts });
const starter = (seed = 1) => withLayout(bare(seed), STARTER);
const uidOf = (s: State, id: string, k = 0) => s.placed.filter((p) => p.id === id)[k].uid;

describe('摆放', () => {
  it('在开放的地里、不重叠、钱够、星级够才能放，当场扣钱', () => {
    const s = bare();
    expect(openRowStart(s)).toBe(LOT_D - 16);
    expect(canPlace(s, 'court-hard', 0, 10)).toBeNull();
    expect(canPlace(s, 'court-hard', LOT_W - 5, 10)).toBe('bounds');
    expect(canPlace(s, 'court-hard', 0, LOT_D - 11)).toBe('bounds');
    expect(canPlace(s, 'court-hard', 0, 9)).toBe('parcel');
    expect(canPlace(s, 'clubhouse', 0, 10)).toBe('locked');
    expect(canPlace(s, 'nope', 0, 10)).toBe('unknown');
    expect(canPlace(s, 'oasis', 0, 10)).toBe('terrain');
    const s2 = placeOk(s, 'court-hard', 0, 10);
    expect(s2.money).toBe(START_MONEY - BY_ID['court-hard'].cost);
    expect(canPlace(s2, 'cafe', 5, 21)).toBe('overlap');
    expect(canPlace(s2, 'cafe', 6, 21)).toBeNull();
    // 原状态没被改（纯函数）
    expect(s.placed.length).toBe(0);
    expect(s.money).toBe(START_MONEY);
  });

  it('placeError 给中文短句', () => {
    const s = placeOk(bare(1, { money: 2000 }), 'cafe', 0, 20);
    const t = (id: string, c: number, r: number) => placeError(s, DEFS[id], c, r, 0);
    expect(t('cafe', 0, 20)).toBe('被占了');
    expect(t('court-hard', 6, 10)).toBe('钱不够 $3000');
    expect(s.money).toBe(1100);
    expect(t('clubhouse', 6, 10)).toBe('★2 解锁');
    expect(t('cafe', 6, 7)).toBe('这块地还没开放 · ★2');
    expect(t('cafe', 6, 1)).toBe('这块地还没开放 · ★3');
    expect(t('cafe', 6, 12)).toBeNull();
    // 被拒的命令也带中文
    const r = apply(s, { type: 'place', id: 'cafe', col: 6, row: 7 });
    expect(r.events[0]).toMatchObject({ type: 'rejected', reason: 'bounds', text: '这块地还没开放 · ★2' });
  });

  it('转 90° 时占地对调', () => {
    const s = bare();
    // 6×12 转一下 = 12×6
    expect(canPlace(s, 'court-hard', 0, 10, 1)).toBeNull();
    expect(canPlace(s, 'court-hard', LOT_W - 12, 10, 1)).toBeNull();
    expect(canPlace(s, 'court-hard', LOT_W - 11, 10, 1)).toBe('bounds');
  });

  it('钱不够不能放，大门上不能放', () => {
    expect(canPlace(bare(1, { money: 100 }), 'court-hard', 0, 10)).toBe('money');
    expect(canPlace(bare(), 'path', GATE_COLS[0], GATE_ROW)).toBe('overlap');
  });

  it('拆除退一半', () => {
    let s = placeOk(bare(), 'cafe', 0, 12);
    const uid = s.placed[0].uid;
    s = apply(s, { type: 'remove', uid }).state;
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

  it('开局布局在每套地形上都摆得下、都在开放的地里、走得到', () => {
    for (let seed = 0; seed < TERRAIN_VARIANTS.length; seed++) {
      const s0 = newState(seed);
      const s = withLayout(s0, STARTER);
      expect(s.placed.length).toBe(TERRAIN_VARIANTS[terrainVariant(seed)].length + STARTER.length);
      expect(s.money).toBe(START_MONEY);
      for (const it of STARTER) expect(it.row).toBeGreaterThanOrEqual(openRowStart(s));
      expect(unreachable(s)).toEqual([]);
    }
  });
});

describe('地形', () => {
  it('按 seed 选一套，同一个 seed 永远一样；大多在北边锁着的地里', () => {
    expect(terrainVariant(3)).toBe(terrainVariant(3));
    expect(newState(3).placed.map((p) => `${p.id}@${p.col},${p.row}`)).toEqual(
      newState(3).placed.map((p) => `${p.id}@${p.col},${p.row}`),
    );
    for (const v of TERRAIN_VARIANTS) {
      const locked = v.filter((f) => f.row < LOT_D - 16).length;
      expect(locked).toBeGreaterThan(v.length / 2);
      expect(new Set(v.map((f) => f.id))).toEqual(new Set(TERRAIN.map((t) => t.id)));
    }
  });

  it('绿洲、老棕榈拆不掉；大石头清理要 $400，没开放的地里清不了', () => {
    const s = newState(3); // 第 0 套：石头 (12,12) 在开局地里，(6,1) 在 ★3 地里
    expect(terrainVariant(3)).toBe(0);
    const oasis = uidOf(s, 'oasis');
    expect(apply(s, { type: 'remove', uid: oasis }).events[0]).toMatchObject({ type: 'rejected', reason: 'gate' });
    expect(apply(s, { type: 'remove', uid: uidOf(s, 'old-palm') }).events[0]?.type).toBe('rejected');
    const rock = s.placed.find((p) => p.id === 'boulder' && p.row === 12)?.uid ?? 0;
    const far = s.placed.find((p) => p.id === 'boulder' && p.row === 1)?.uid ?? 0;
    expect(apply(s, { type: 'clear', uid: far }).events[0]).toMatchObject({ type: 'rejected', reason: 'bounds' });
    const r = apply(s, { type: 'clear', uid: rock });
    expect(r.events[0]).toMatchObject({ type: 'removed', refund: -400 });
    expect(r.state.money).toBe(s.money - 400);
    expect(r.state.placed.some((p) => p.uid === rock)).toBe(false);
    // 普通设施不用"清理"
    const s2 = placeOk(s, 'cafe', 0, 12);
    expect(apply(s2, { type: 'clear', uid: s2.placed[s2.placed.length - 1].uid }).events[0]?.type).toBe('rejected');
    // remove 大石头 = 清理
    expect(apply(s, { type: 'remove', uid: rock }).events[0]).toMatchObject({ type: 'removed', refund: -400 });
    // 钱不够清不了
    expect(apply({ ...s, money: 100 }, { type: 'clear', uid: rock }).events[0]).toMatchObject({ reason: 'money' });
  });

  it('球场挨着绿洲成"绿洲"组合，挨着老棕榈成"场边树荫"（地形带标签，现成的组合系统直接用）', () => {
    let s = newState(3, { star: 2, money: 20000 }); // 第 0 套：绿洲 (12..14, 6..8)，老棕榈 (2..4, 8)
    expect(openRowStart(s)).toBe(6);
    const pv = comboPreview(s, 'court-hard', 6, 6, 0);
    const ids = pv.map((x) => x.combo.id);
    expect(ids).toContain('oasis-court');
    expect(ids).toContain('shade-court');
    expect(pv.every((x) => x.name === '？？？' && !x.known)).toBe(true);
    s = finishBuild(placeOk(s, 'court-hard', 6, 6, 0));
    expect(s.combos).toContain('oasis-court');
    expect(s.combos).toContain('shade-court');
    const pv2 = comboPreview(s, 'cafe', 9, 18, 0); // 球场下沿，打完来一杯：还没发现
    expect(pv2.find((x) => x.combo.id === 'cafe-court')?.name).toBe('？？？');
  });
});

describe('走得到', () => {
  it('门口的步道连到大门才算走得到', () => {
    // 咖啡车放在大门正上方，门格 (9, 23)；先不铺路
    let s = finishBuild(placeOk(bare(), 'cafe', 8, 22));
    const uid = s.placed[0].uid;
    expect(reachableSet(s).has(uid)).toBe(false);
    expect(unreachable(s)).toEqual([uid]);
    s = placeOk(s, 'path', 9, 24);
    expect(reachableSet(s).has(uid)).toBe(true);
    expect(unreachable(s)).toEqual([]);
    const r = route(s, null, uid);
    expect(r).not.toBeNull();
    expect(r?.[r.length - 1]).toEqual([9, 23]);
  });

  it('断开的路走不到', () => {
    let s = finishBuild(placeOk(bare(), 'cafe', 2, 12));
    for (const p of pathLine(3, 14, 3, 18)) s = placeOk(s, p.id, p.col, p.row);
    const uid = s.placed[0].uid;
    expect(reachableSet(s).has(uid)).toBe(false);
    for (const p of pathLine(4, 18, 8, 18)) s = placeOk(s, p.id, p.col, p.row);
    for (const p of pathLine(8, 19, 8, 24)) s = placeOk(s, p.id, p.col, p.row);
    expect(reachableSet(s).has(uid)).toBe(true);
  });

  it('占用表标出大门和地形', () => {
    const occ = occupancy(bare());
    expect(occ[GATE_ROW * LOT_W + GATE_COLS[0]]).toBe(-1);
    const s = newState(3);
    expect(occupancy(s)[12 * LOT_W + 12]).toBe(s.placed.find((p) => p.id === 'boulder' && p.row === 12)?.uid);
  });
});

describe('组合', () => {
  it('咖啡车挨着球场：建好时发现"打完来一杯"，第二对不算新发现；没发现过的预览是"？？？"', () => {
    let s = starter(); // 球场 (1..6, 11..22)
    const pv = comboPreview(s, 'cafe', 7, 11, 0);
    expect(pv.map((x) => x.combo.id)).toContain('cafe-court');
    expect(pv.find((x) => x.combo.id === 'cafe-court')).toMatchObject({ name: '？？？', known: false });
    s = placeOk(s, 'cafe', 7, 11, 0);
    const r = tick(s, 2.5);
    const found = r.events.filter((e) => e.type === 'comboFound');
    expect(found[0]).toMatchObject({ combo: 'cafe-court', first: true });
    expect(r.state.combos).toContain('cafe-court');
    expect(r.state.today.found).toBe(1);
    // 发现过了，预览就显示名字
    expect(comboPreview(r.state, 'cafe', 7, 14, 0).find((x) => x.combo.id === 'cafe-court')).toMatchObject({
      name: '打完来一杯',
      known: true,
    });
    // 第二辆咖啡车挨着：同一组合 first = false；两辆咖啡车挨着 → 美食街
    s = placeOk(r.state, 'cafe', 7, 13, 0);
    const f2 = tick(s, 2.5).events.filter((e) => e.type === 'comboFound');
    expect(f2.find((e) => e.type === 'comboFound' && e.combo === 'cafe-court')).toMatchObject({ first: false });
    expect(f2.find((e) => e.type === 'comboFound' && e.combo === 'food-food')).toMatchObject({ first: true });
  });

  it('位置不合法时没有预览；钱不够照样预览', () => {
    const s = starter();
    expect(comboPreview(s, 'cafe', 5, 12, 0)).toEqual([]); // 压着球场
    expect(comboPreview(s, 'cafe', 7, 8, 0)).toEqual([]); // 没开放
    expect(comboPreview({ ...s, money: 0 }, 'cafe', 7, 11, 0).length).toBeGreaterThan(0);
  });

  it('隔太远不成组合', () => {
    expect(comboPreview(starter(), 'cafe', 14, 12, 0).filter((x) => x.combo.id === 'cafe-court')).toEqual([]);
  });

  it('拆掉一边，那一对组合就没了；星级清单的组合数跟着掉（放了再拆的漏洞堵上了）', () => {
    let s = starter();
    expect(activeComboKinds(s)).toEqual([]);
    s = finishBuild(placeOk(s, 'shade', 7, 11));
    expect(activeComboKinds(s)).toContain('shade-court');
    expect(starProgress(s)?.next.find((i) => i.key === 'combos')?.have).toBe(activeComboKinds(s).length);
    const uid = s.placed[s.placed.length - 1].uid;
    s = apply(s, { type: 'remove', uid }).state;
    expect(s.pairs.some((k) => k.includes(`:${uid}`))).toBe(false);
    expect(activeComboKinds(s)).toEqual([]);
    expect(starProgress(s)?.next.find((i) => i.key === 'combos')?.have).toBe(0);
    expect(s.combos).toContain('shade-court'); // 发现过的名字还记着（预览用）
  });
});

describe('吸引力、客流', () => {
  it('装饰是光环：自己 0，给 2 格内能接客的设施加，每座最多 +4', () => {
    const s0 = starter();
    const court = s0.placed.find((p) => p.id === 'court-hard');
    if (!court) throw new Error();
    const base = appealOf(s0, court);
    // 开局有一棵棕榈 (7,20) 贴着球场
    let s = finishBuild(placeOk(s0, 'palm', 0, 12));
    expect(appealOf(s, court)).toBe(base + 1);
    const palm = s.placed[s.placed.length - 1];
    expect(appealOf(s, palm)).toBe(0);
    // 远处的棕榈不算
    s = finishBuild(placeOk(s, 'palm', 14, 12));
    expect(appealOf(s, court)).toBe(base + 1);
    // 一圈棕榈：封顶 +4
    for (const r of [13, 14, 15, 16, 17]) s = finishBuild(placeOk(s, 'palm', 0, r));
    expect(appealOf(s, court)).toBe(6 + 4);
  });

  it('停车场不带客，放大客流：每个 ×1.08', () => {
    const s0 = withLayout(bare(), [
      { id: 'court-hard', col: 0, row: 10 },
      ...pathLine(0, 24, 17, 24),
      ...pathLine(3, 22, 3, 23),
    ]);
    const d0 = demandPerDay(s0);
    expect(d0).toBeGreaterThan(0);
    // 停车场 4×5，门 (2,4) 朝南，正好落在 row 24 的步道上
    const s1 = withLayout(s0, [{ id: 'parking', col: 6, row: 19 }]);
    expect(unreachable(s1)).toEqual([]);
    expect(demandPerDay(s1)).toBeCloseTo(d0 * 1.08);
    const s3 = withLayout(s1, [
      { id: 'parking', col: 10, row: 19 },
      { id: 'parking', col: 14, row: 19 },
    ]);
    expect(demandPerDay(s3)).toBeCloseTo(d0 * 1.24);
    // 停车场自己不带客
    expect(appealOf(s3, s3.placed[s3.placed.length - 1])).toBe(0);
  });

  it('客人第一站只去球场：只有咖啡车的俱乐部没人来，收盘说清楚', () => {
    let s = finishBuild(placeOk(bare(), 'cafe', 8, 22));
    s = placeOk(s, 'path', 9, 24);
    expect(visitorsPerDay(s)).toBe(0);
    const e = settledOf(runDay(s).events);
    expect(e.visitors).toBe(0);
    expect(e.reasons.join()).toContain('先建一座球场');
  });

  it('预计客人 = min(吸引来的, 接得下的)；客满走掉太多，明天口碑 −10%', () => {
    const s = { ...starter(9), members: 300 };
    const f = forecast(s);
    expect(f.demand).toBeGreaterThan(f.capacity);
    expect(f.visitors).toBe(f.capacity);
    expect(f.away).toBe(f.demand - f.capacity);
    expect(visitorsPerDay(s)).toBe(f.visitors);
    const { state, events } = runDay(s);
    const e = settledOf(events);
    expect(e.turnedAway).toBeGreaterThan(e.visitors * 0.3);
    expect(state.buzz).toBeCloseTo(0.9);
    expect(e.reasons.join()).toContain('口碑');
    expect(e.forecast.visitors).toBe(forecast(state).visitors);
  });

  it('没客满的日子口碑正常', () => {
    const { state } = runDay(starter(4));
    expect(state.buzz).toBe(1);
  });
});

describe('一天', () => {
  it('客人来、花钱、收盘扣维护费', () => {
    const s0 = starter(7);
    const { state, events } = runDay(s0);
    const arrive = events.filter((e) => e.type === 'visitorArrive').length;
    const spend = events.filter((e) => e.type === 'visitorSpend');
    const settled = settledOf(events);
    expect(arrive).toBeGreaterThan(5);
    expect(spend.length).toBeGreaterThanOrEqual(arrive * 0.8);
    const income = spend.reduce((a, e) => a + (e.type === 'visitorSpend' ? e.amount : 0), 0);
    expect(settled.income).toBe(income + settled.dues);
    expect(settled.dues).toBe(0);
    expect(settled.upkeep).toBe(BY_ID['court-hard'].upkeep + BY_ID.cafe.upkeep);
    expect(state.money).toBe(s0.money + settled.income - settled.upkeep);
    expect(state.day).toBe(s0.day + 1);
    expect(state.time).toBe(0);
    expect(state.visitors.length).toBe(0);
    expect(settled.reasons.length).toBeGreaterThan(0);
    expect(state.bestNet).toBe(Math.max(0, settled.net));
    // 每位客人最后都走了
    expect(events.filter((e) => e.type === 'visitorLeave').length).toBe(arrive);
    // 接过的客人记在设施上（升级用）
    const court = state.placed.find((p) => p.id === 'court-hard');
    expect(court?.served).toBe(spend.filter((e) => e.type === 'visitorSpend' && e.uid === court?.uid).length);
  });

  it('同样的种子同样的一天（不用 Math.random）', () => {
    const a = runDay(withLayout(newState(5), STARTER)).state;
    const b = runDay(withLayout(newState(5), STARTER)).state;
    expect(a.money).toBe(b.money);
    expect(a.totalVisitors).toBe(b.totalVisitors);
    expect(a.members).toBe(b.members);
  });

  it('客满会有人走掉，容量从不超（等级加了也不超）', () => {
    let s = { ...starter(3), members: 100 };
    s.placed = s.placed.map((p) => (p.id === 'court-hard' ? { ...p, lv: 2 } : p));
    let maxOcc = 0;
    const court = s.placed.find((p) => p.id === 'court-hard');
    if (!court) throw new Error();
    for (let t = 0; t < DAY_SECONDS; t += 0.05) {
      s = tick(s, 0.05).state;
      const n = s.visitors.filter((v) => v.stage !== 'out' && v.stops[v.i] === court.uid).length;
      maxOcc = Math.max(maxOcc, n);
    }
    expect(maxOcc).toBeLessThanOrEqual(capOf(court));
    expect(capOf(court)).toBe(BY_ID['court-hard'].cap + 1);
  });

  it('没路的设施：不来客人，收盘说明原因；"没有客人"只在真的没路时说', () => {
    const s = finishBuild(placeOk(bare(), 'court-hard', 0, 10));
    const e = settledOf(runDay(s).events);
    expect(e.visitors).toBe(0);
    expect(e.reasons.join()).toContain('没有路');
    // 营业时段过了才开始的一天：没客人，但布局是通的 → 不说"要连上步道"
    const late = { ...starter(), time: 0.9 };
    const e2 = settledOf(runDay(late).events);
    expect(e2.visitors).toBe(0);
    expect(e2.reasons.join()).not.toContain('步道');
  });
});

describe('收盘卡：和昨天比、挡不挡游戏', () => {
  it('第一天没有 diff；平常的日子不挡；发现新组合的日子挡，diff 写出新设施', () => {
    const r1 = runDay(starter(11));
    const e1 = settledOf(r1.events);
    expect(e1.diff).toBeNull();
    expect(e1.blocking).toBe(false);
    expect(e1.hint).toBe(nextGoalHint(r1.state));
    const r2 = runDay(r1.state);
    const e2 = settledOf(r2.events);
    expect(e2.diff).not.toBeNull();
    expect(e2.blocking).toBe(false);
    // 第 3 天早上放一面练习墙贴着球场：发现组合 → 挡
    let s3 = finishBuild(placeOk(r2.state, 'practice-wall', 7, 11));
    for (const p of pathLine(9, 14, 9, 15)) s3 = placeOk(s3, p.id, p.col, p.row);
    expect(unreachable(s3)).toEqual([]);
    const e3 = settledOf(runDay(s3).events);
    expect(e3.blocking).toBe(true);
    expect(e3.diff?.items.length).toBeGreaterThan(0);
    expect(e3.diff?.items.length).toBeLessThanOrEqual(3);
    expect(e3.diff?.items.map((i) => i.text).join()).toMatch(/新的练习墙|维护费/);
  });

  it('每 7 天、亏钱的日子挡', () => {
    expect(settledOf(runDay({ ...starter(), day: 7 }).events).blocking).toBe(true);
    // 球场没路：没收入、有维护费 → 亏钱
    const s = finishBuild(placeOk(bare(), 'court-hard', 0, 10));
    const e = settledOf(runDay(s).events);
    expect(e.net).toBeLessThan(0);
    expect(e.blocking).toBe(true);
  });
});

describe('会员', () => {
  it('逛满两处的客人有机会办卡；会员收盘时加进来、交会费、每天流失 2%', () => {
    let s = finishBuild(placeOk(starter(2), 'cafe', 7, 11));
    s = { ...s, members: 50 };
    const { state, events } = runDay(s);
    const joined = events.filter((e) => e.type === 'memberJoined').length;
    const e = settledOf(events);
    expect(e.dues).toBe(50 * MEMBER_FEE);
    expect(e.members.joined).toBe(joined);
    expect(e.members.left).toBe(1);
    expect(state.members).toBe(50 - 1 + joined);
    // 办卡的人一定是逛了第二处的
    const vids = new Set(
      events.filter((x) => x.type === 'memberJoined').map((x) => (x.type === 'memberJoined' ? x.vid : 0)),
    );
    for (const vid of vids) {
      const spends = events.filter((x) => x.type === 'visitorSpend' && x.vid === vid).length;
      expect(spends).toBe(2);
    }
  });

  it('几天下来会员会涨起来，会员多了来的人也多', () => {
    // 练习墙 + 球具店：青少年和会员打完都有第二处可去
    let s = withLayout(bare(6), [
      ...STARTER,
      { id: 'practice-wall', col: 7, row: 11 },
      ...pathLine(9, 14, 9, 15),
      { id: 'pro-shop', col: 10, row: 22 },
    ]);
    expect(unreachable(s)).toEqual([]);
    const d0 = forecast(s).demand;
    for (let d = 0; d < 6; d++) s = runDay(s).state;
    expect(s.members).toBeGreaterThan(0);
    expect(forecast({ ...s, members: s.members + 20 }).demand).toBeGreaterThan(forecast(s).demand);
    expect(d0).toBeGreaterThan(0);
  });
});

describe('升级', () => {
  it('接够客人才能升；花建造价的 60% / 120%；容量 +1、收费 ×1.2、吸引力 +2；满级不能再升', () => {
    let s = { ...starter(), money: 10000 };
    const uid = uidOf(s, 'court-hard');
    expect(upgradeInfo(s, uidOf(s, 'palm'))).toBeNull();
    expect(upgradeInfo(s, uidOf(s, 'path'))).toBeNull();
    expect(upgradeInfo(s, 999)).toBeNull();
    expect(upgradeInfo(s, uid)).toMatchObject({ can: false, cost: 1800, nextLv: 2, need: '再接 60 位客人' });
    expect(apply(s, { type: 'upgrade', uid }).events[0]).toMatchObject({ type: 'rejected', reason: 'locked' });
    s.placed = s.placed.map((p) => (p.uid === uid ? { ...p, served: 60 } : p));
    expect(upgradeInfo(s, uid)).toMatchObject({ can: true, cost: 1800, nextLv: 2 });
    const before = s.placed.find((p) => p.uid === uid);
    if (!before) throw new Error();
    const a0 = appealOf(s, before);
    const r = apply(s, { type: 'upgrade', uid });
    expect(r.events[0]).toMatchObject({ type: 'upgraded', uid, lv: 2, cost: 1800 });
    s = r.state;
    const p = s.placed.find((q) => q.uid === uid);
    if (!p) throw new Error();
    expect(s.money).toBe(10000 - 1800);
    expect(capOf(p)).toBe(5);
    expect(spendOf(s, p).amount).toBe(Math.round(50 * 1.2));
    expect(appealOf(s, p)).toBe(a0 + 2);
    expect(upgradeInfo(s, uid)).toMatchObject({ can: false, cost: 3600, nextLv: 3 });
    s.placed = s.placed.map((q) => (q.uid === uid ? { ...q, served: 150 } : q));
    expect(apply({ ...s, money: 100 }, { type: 'upgrade', uid }).events[0]).toMatchObject({ reason: 'money' });
    s = apply(s, { type: 'upgrade', uid }).state;
    expect(s.placed.find((q) => q.uid === uid)?.lv).toBe(3);
    expect(upgradeInfo(s, uid)).toBeNull();
  });
});

describe('一周', () => {
  it('周三青训日、周末家庭日、周日俱乐部赛', () => {
    const s = starter();
    expect(dayInfo(s, 3)).toMatchObject({ name: '周三', tag: '青训日', cup: false });
    expect(dayInfo(s, 6).tag).toBe('家庭日');
    expect(dayInfo(s, 7)).toMatchObject({ name: '周日', tag: '俱乐部赛', cup: true, cupReady: false });
    expect(dayInfo(s, 8).name).toBe('周一');
  });

  it('两片球场 + 看台：周日办成俱乐部赛，发奖金、名气 +1；不够就没办成，说缺什么', () => {
    const fail = runDay({ ...starter(), day: 7 }).events.find((e) => e.type === 'clubCup');
    expect(fail).toMatchObject({ held: false });
    if (fail?.type !== 'clubCup') throw new Error();
    expect(fail.need).toContain('看台');
    const s = withLayout(bare(5, { star: 2, day: 7 }), [
      ...STARTER,
      { id: 'court-hard', col: 11, row: 10 },
      ...pathLine(14, 22, 14, 23),
      { id: 'bleachers', col: 7, row: 10 },
    ]);
    expect(dayInfo(s).cupReady).toBe(true);
    expect(unreachable(s)).toEqual([]);
    const m0 = s.money;
    const { state, events } = runDay(s);
    const cup = events.find((e) => e.type === 'clubCup');
    expect(cup).toMatchObject({ held: true, fame: 1 });
    if (cup?.type !== 'clubCup') throw new Error();
    expect(cup.prize).toBeGreaterThan(0);
    const e = settledOf(events);
    expect(state.money).toBe(m0 + e.income - e.upkeep + cup.prize);
    expect(state.fame).toBe(1);
  });
});

describe('升星、地块开放', () => {
  it('目标都够了，收盘时升星并解锁', () => {
    const g = STAR_GOALS[0];
    let s = starter();
    s = finishBuild(placeOk(s, 'practice-wall', 7, 11)); // 第 3 座设施 + 组合
    s = { ...s, totalVisitors: g.visitors };
    const { events, state } = runDay(s);
    const up = events.find((e) => e.type === 'starUp');
    expect(up).toMatchObject({ star: 1 });
    if (up?.type !== 'starUp') throw new Error();
    expect(up.unlocked).toContain('pro-shop');
    expect(state.star).toBe(1);
    expect(canPlace(state, 'pro-shop', 12, 12)).toBeNull();
    expect(settledOf(events).blocking).toBe(true);
  });

  it('装饰不算设施，目标不够不升', () => {
    let s = starter();
    for (const r of [12, 13, 14]) s = finishBuild(placeOk(s, 'palm', 0, r));
    expect(starProgress(s)?.next.find((i) => i.key === 'buildings')?.have).toBe(2);
    expect(runDay({ ...s, totalVisitors: 999 }).events.some((e) => e.type === 'starUp')).toBe(false);
  });

  it('升到 ★2：地块往北开放 4 行，露出那片地里的地形', () => {
    // 第 0 套地形：绿洲 (12,6)、老棕榈 (2..4, 8) 在 rows 6..9
    let s = withLayout(newState(3, { star: 1 }), [
      ...STARTER,
      { id: 'practice-wall', col: 7, row: 11 },
      { id: 'cafe', col: 7, row: 14 },
      { id: 'pickle', col: 14, row: 10 },
      { id: 'pro-shop', col: 11, row: 15 },
      { id: 'cafe', col: 11, row: 18 },
    ]);
    s = { ...s, totalVisitors: 999, members: 99, bestNet: 9999 };
    expect(openRowStart(s)).toBe(10);
    expect(starProgress(s)?.done).toBe(true);
    const { state, events } = runDay(s);
    expect(state.star).toBe(2);
    expect(state.lotRows).toBe(20);
    expect(openRowStart(state)).toBe(6);
    const po = events.find((e) => e.type === 'parcelOpened');
    expect(po).toMatchObject({ rows: [6, 9] });
    if (po?.type !== 'parcelOpened') throw new Error();
    const ids = po.features.map((u) => state.placed.find((p) => p.uid === u)?.id).sort();
    expect(ids).toEqual(['oasis', 'old-palm', 'old-palm', 'old-palm']);
    expect(events.findIndex((e) => e.type === 'starUp')).toBeGreaterThan(
      events.findIndex((e) => e.type === 'daySettled'),
    );
    expect(canPlace(state, 'cafe', 0, 6)).toBeNull();
    expect(canPlace(state, 'cafe', 0, 5)).toBe('parcel');
  });

  it('starProgress 的各项、nextGoalHint 给一句能照做的话', () => {
    const s = starter();
    const sp = starProgress(s);
    expect(sp?.star).toBe(1);
    expect(sp?.next.map((i) => i.key)).toEqual(['visitors', 'buildings', 'combos']);
    expect(sp?.items).toBe(sp?.next);
    expect(nextGoalHint(s)).toContain('还差 30 位客人');
    // 客人够了 → 下一项是设施
    expect(nextGoalHint({ ...s, totalVisitors: 30 })).toMatch(/还差 1 座设施.*练习墙/);
    // 设施也够了 → 组合，说出能凑的一对（不报组合名）
    const s2 = finishBuild(placeOk({ ...s, totalVisitors: 30 }, 'practice-wall', 12, 12));
    expect(nextGoalHint(s2)).toMatch(/还差 1 个组合：把.+放在.+旁边试试/);
    // 满星
    expect(starProgress({ ...s, star: STAR_GOALS.length })).toBeNull();
    expect(nextGoalHint({ ...s, star: STAR_GOALS.length })).toContain('满星');
  });
});

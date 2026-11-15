// clubbuild 模拟的测试：摆放校验、地块开放、地形、组合（含拆掉就掉）、光环、停车场、预计客人、走得到、收盘（和昨天比、挡不挡）、
// 会员、升级、一周日历、升星。pnpm vitest run apps/sandbox/src/clubbuild
import { describe, expect, it } from 'vitest';
import {
  BY_ID,
  COACH,
  CUPS,
  DAY_SECONDS,
  DEFS,
  LIGHTS,
  LOT_D,
  LOT_W,
  LV_MUL,
  STAR_GOALS,
  START_MONEY,
  TERRAIN,
} from './catalog';
import {
  activeComboKinds,
  appealOf,
  apply,
  bestCup,
  canFullRefund,
  canPlace,
  capOf,
  clockHour,
  coachInfo,
  comboPreview,
  dayEndHour,
  dayInfo,
  demandPerDay,
  doorTile,
  forecast,
  GATE_COLS,
  GATE_ROW,
  landInfo,
  lightsInfo,
  MEMBER_FEE,
  moveError,
  newState,
  nextGoalHint,
  occupancy,
  offerInfo,
  openColRange,
  openRowStart,
  pathLine,
  placeError,
  reachableSet,
  removeRefund,
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
  upkeepOf,
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
    expect(canPlace(s, 'court-hard', 4, 15)).toBeNull();
    expect(canPlace(s, 'court-hard', LOT_W - 5, 15)).toBe('bounds');
    expect(canPlace(s, 'court-hard', 4, LOT_D - 11)).toBe('bounds');
    // 东西两边的地还没买
    expect(canPlace(s, 'court-hard', 3, 15)).toBe('land');
    expect(canPlace(s, 'court-hard', 17, 15)).toBe('land');
    expect(canPlace(s, 'court-hard', 15, 15)).toBeNull();
    expect(canPlace(s, 'court-hard', 4, 14)).toBe('parcel');
    expect(canPlace(s, 'clubhouse', 4, 15)).toBe('locked');
    expect(canPlace(s, 'nope', 4, 15)).toBe('unknown');
    expect(canPlace(s, 'oasis', 4, 15)).toBe('terrain');
    const s2 = placeOk(s, 'court-hard', 4, 15);
    expect(s2.money).toBe(START_MONEY - BY_ID['court-hard'].cost);
    expect(canPlace(s2, 'cafe', 9, 26)).toBe('overlap');
    expect(canPlace(s2, 'cafe', 10, 26)).toBeNull();
    // 原状态没被改（纯函数）
    expect(s.placed.length).toBe(0);
    expect(s.money).toBe(START_MONEY);
  });

  it('placeError 给中文短句', () => {
    const s = placeOk(bare(1, { money: 2000 }), 'cafe', 4, 25);
    const t = (id: string, c: number, r: number) => placeError(s, DEFS[id], c, r, 0);
    expect(t('cafe', 4, 25)).toBe('被占了');
    expect(t('court-hard', 10, 15)).toBe('钱不够 $3000');
    expect(s.money).toBe(1100);
    expect(t('clubhouse', 10, 15)).toBe('★2 解锁');
    expect(t('cafe', 10, 12)).toBe('✕ 北边没开放 · ★2');
    expect(t('cafe', 10, 6)).toBe('✕ 北边没开放 · ★3');
    expect(t('cafe', 10, 17)).toBeNull();
    expect(t('cafe', 2, 17)).toBe('✕ 这块地还没买 · ★4 以后');
    expect(placeError({ ...s, star: 4, money: 99999 }, DEFS.cafe, 2, 17, 0)).toBe('✕ 这块地还没买 · $15k');
    // 被拒的命令也带中文
    const r = apply(s, { type: 'place', id: 'cafe', col: 10, row: 12 });
    expect(r.events[0]).toMatchObject({ type: 'rejected', reason: 'bounds', text: '✕ 北边没开放 · ★2' });
  });

  it('转 90° 时占地对调', () => {
    const s = bare();
    // 6×12 转一下 = 12×6
    expect(canPlace(s, 'court-hard', 4, 15, 1)).toBeNull();
    expect(canPlace(s, 'court-hard', 10, 15, 1)).toBeNull();
    expect(canPlace(s, 'court-hard', 11, 15, 1)).toBe('land');
    expect(canPlace({ ...s, lotCols: [0, LOT_W - 1] }, 'court-hard', LOT_W - 11, 15, 1)).toBe('bounds');
  });

  it('钱不够不能放，大门上不能放', () => {
    expect(canPlace(bare(1, { money: 100 }), 'court-hard', 4, 15)).toBe('money');
    expect(canPlace(bare(), 'path', GATE_COLS[0], GATE_ROW)).toBe('overlap');
  });

  it('拆除退一半', () => {
    let s = placeOk(bare(), 'cafe', 4, 17);
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

describe('挪动、反悔', () => {
  it('挪动免费，uid/等级/接客数不变；校验不算自己原来的占地；地形和步道挪不动', () => {
    const s = finishBuild(placeOk(starter(), 'practice-wall', 16, 17));
    const uid = s.placed[s.placed.length - 1].uid;
    s.placed = s.placed.map((p) => (p.uid === uid ? { ...p, lv: 2, served: 70 } : p));
    const m0 = s.money;
    // 挪一格（新旧占地重叠）也行
    expect(moveError(s, uid, 16, 18, 0)).toBeNull();
    expect(moveError(s, uid, 9, 17, 0)).toBe('被占了');
    expect(moveError(s, uid, 16, 13, 0)).toBe('✕ 北边没开放 · ★2');
    expect(moveError(s, uid, 20, 17, 0)).toBe('✕ 这块地还没买 · ★4 以后');
    expect(moveError({ ...s, lotCols: [0, LOT_W - 1] }, uid, 23, 17, 0)).toBe('超出地块');
    expect(moveError(s, uidOf(s, 'path'), 12, 18, 0)).toContain('步道');
    expect(moveError(newState(3), uidOf(newState(3), 'boulder'), 0, 12, 0)).toContain('挪不动');
    expect(moveError({ ...s, money: 0 }, uid, 16, 18, 0)).toBeNull();
    const r = apply(s, { type: 'move', uid, col: 16, row: 18, rot: 0 });
    expect(r.events[0]).toMatchObject({
      type: 'moved',
      uid,
      from: { col: 16, row: 17, rot: 0 },
      to: { col: 16, row: 18, rot: 0 },
    });
    const p = r.state.placed.find((q) => q.uid === uid);
    expect(p).toMatchObject({ col: 16, row: 18, lv: 2, served: 70 });
    expect(r.state.money).toBe(m0);
    expect(apply(s, { type: 'move', uid, col: 9, row: 17, rot: 0 }).events[0]).toMatchObject({
      type: 'rejected',
      reason: 'overlap',
      text: '被占了',
    });
  });

  it('挪到球场旁边：重算组合，第一次凑成算发现；挪走组合就掉', () => {
    let s = finishBuild(placeOk(starter(), 'shade', 16, 17));
    const uid = s.placed[s.placed.length - 1].uid;
    expect(activeComboKinds(s)).toEqual([]);
    const r = apply(s, { type: 'move', uid, col: 11, row: 16, rot: 0 });
    expect(r.events.find((e) => e.type === 'comboFound')).toMatchObject({ combo: 'shade-court', first: true });
    s = r.state;
    expect(activeComboKinds(s)).toContain('shade-court');
    expect(s.today.found).toBe(1);
    s = apply(s, { type: 'move', uid, col: 16, row: 17, rot: 0 }).state;
    expect(activeComboKinds(s)).toEqual([]);
  });

  it('挪走后门口没路 → 走不到；客人正往那里走的回家', () => {
    let s = placeOk(starter(), 'cafe', 12, 19); // 门 (13,20)，下面 (13,21) 是主路
    s = finishBuild(s);
    const uid = s.placed[s.placed.length - 1].uid;
    expect(unreachable(s)).toEqual([]);
    s = apply(s, { type: 'move', uid, col: 16, row: 17, rot: 0 }).state;
    expect(unreachable(s)).toEqual([uid]);
  });

  it('反悔：今天放下、没接过客人的全额退（步道也行）；不然一半', () => {
    let s = placeOk(starter(), 'cafe', 16, 17);
    const uid = s.placed[s.placed.length - 1].uid;
    expect(canFullRefund(s, uid)).toBe(true);
    expect(removeRefund(s, uid, true)).toBe(900);
    expect(removeRefund(s, uid)).toBe(450);
    const m0 = s.money;
    const r = apply(s, { type: 'remove', uid, refund: 'full' });
    expect(r.events[0]).toMatchObject({ type: 'removed', refund: 900 });
    expect(r.state.money).toBe(m0 + 900);
    // 步道
    s = placeOk(s, 'path', 16, 25);
    const pu = s.placed[s.placed.length - 1].uid;
    expect(apply(s, { type: 'remove', uid: pu, refund: 'full' }).events[0]).toMatchObject({ refund: 20 });
    // 接过客人 / 过了一天：只退一半
    const used = { ...s, placed: s.placed.map((p) => (p.uid === uid ? { ...p, served: 1 } : p)) };
    expect(canFullRefund(used, uid)).toBe(false);
    expect(removeRefund(used, uid, true)).toBe(450);
    expect(apply(used, { type: 'remove', uid, refund: 'full' }).events[0]).toMatchObject({ refund: 450 });
    expect(canFullRefund({ ...s, day: s.day + 1 }, uid)).toBe(false);
    // 开局布局不是今天放的（builtAt = 第 1 天，但……）地形：清理费
    const t = newState(3);
    expect(removeRefund(t, uidOf(t, 'boulder'), true)).toBe(-400);
    expect(removeRefund(t, uidOf(t, 'oasis'))).toBe(0);
  });
});

describe('地形', () => {
  it('按 seed 选一套，同一个 seed 永远一样；大多在北边锁着的地里', () => {
    expect(terrainVariant(3)).toBe(terrainVariant(3));
    expect(newState(3).placed.map((p) => `${p.id}@${p.col},${p.row}`)).toEqual(
      newState(3).placed.map((p) => `${p.id}@${p.col},${p.row}`),
    );
    for (const v of TERRAIN_VARIANTS) {
      const locked = v.filter((f) => f.row < LOT_D - 16 || f.col < 4 || f.col > LOT_W - 5).length;
      expect(locked).toBeGreaterThan(v.length / 2);
      expect(new Set(v.map((f) => f.id))).toEqual(new Set(TERRAIN.map((t) => t.id)));
    }
  });

  it('绿洲、老棕榈拆不掉；大石头清理要 $400，没开放的地里清不了', () => {
    const s = newState(3); // 第 0 套：石头 (16,17) 在开局地里，(10,6) 在 ★3 地里，(1,20) 在西边没买的地里
    expect(terrainVariant(3)).toBe(0);
    const oasis = uidOf(s, 'oasis');
    expect(apply(s, { type: 'remove', uid: oasis }).events[0]).toMatchObject({ type: 'rejected', reason: 'gate' });
    expect(apply(s, { type: 'remove', uid: uidOf(s, 'old-palm') }).events[0]?.type).toBe('rejected');
    const rock = s.placed.find((p) => p.id === 'boulder' && p.row === 17)?.uid ?? 0;
    const far = s.placed.find((p) => p.id === 'boulder' && p.row === 6)?.uid ?? 0;
    const west = s.placed.find((p) => p.id === 'boulder' && p.col === 1)?.uid ?? 0;
    expect(apply(s, { type: 'clear', uid: west }).events[0]).toMatchObject({
      type: 'rejected',
      reason: 'bounds',
      text: '✕ 这块地还没买 · ★4 以后',
    });
    expect(apply(s, { type: 'clear', uid: far }).events[0]).toMatchObject({ type: 'rejected', reason: 'bounds' });
    const r = apply(s, { type: 'clear', uid: rock });
    expect(r.events[0]).toMatchObject({ type: 'removed', refund: -400 });
    expect(r.state.money).toBe(s.money - 400);
    expect(r.state.placed.some((p) => p.uid === rock)).toBe(false);
    // 普通设施不用"清理"
    const s2 = placeOk(s, 'cafe', 4, 17);
    expect(apply(s2, { type: 'clear', uid: s2.placed[s2.placed.length - 1].uid }).events[0]?.type).toBe('rejected');
    // remove 大石头 = 清理
    expect(apply(s, { type: 'remove', uid: rock }).events[0]).toMatchObject({ type: 'removed', refund: -400 });
    // 钱不够清不了
    expect(apply({ ...s, money: 100 }, { type: 'clear', uid: rock }).events[0]).toMatchObject({ reason: 'money' });
  });

  it('球场挨着绿洲成"绿洲"组合，挨着老棕榈成"场边树荫"（地形带标签，现成的组合系统直接用）', () => {
    let s = newState(3, { star: 2, money: 20000 }); // 第 0 套：绿洲 (16..18, 11..13)，老棕榈 (6..8, 13)
    expect(openRowStart(s)).toBe(11);
    const pv = comboPreview(s, 'court-hard', 10, 11, 0);
    const ids = pv.map((x) => x.combo.id);
    expect(ids).toContain('oasis-court');
    expect(ids).toContain('shade-court');
    expect(pv.every((x) => x.name === '？？？' && !x.known)).toBe(true);
    s = finishBuild(placeOk(s, 'court-hard', 10, 11, 0));
    expect(s.combos).toContain('oasis-court');
    expect(s.combos).toContain('shade-court');
    const pv2 = comboPreview(s, 'cafe', 13, 23, 0); // 球场下沿，打完来一杯：还没发现
    expect(pv2.find((x) => x.combo.id === 'cafe-court')?.name).toBe('？？？');
  });
});

describe('走得到', () => {
  it('门口的步道连到大门才算走得到', () => {
    // 咖啡车放在大门正上方，门格 (9, 23)；先不铺路
    let s = finishBuild(placeOk(bare(), 'cafe', 12, 27));
    const uid = s.placed[0].uid;
    expect(reachableSet(s).has(uid)).toBe(false);
    expect(unreachable(s)).toEqual([uid]);
    s = placeOk(s, 'path', 13, 29);
    expect(reachableSet(s).has(uid)).toBe(true);
    expect(unreachable(s)).toEqual([]);
    const r = route(s, null, uid);
    expect(r).not.toBeNull();
    expect(r?.[r.length - 1]).toEqual([13, 28]);
  });

  it('断开的路走不到', () => {
    let s = finishBuild(placeOk(bare(), 'cafe', 6, 17));
    for (const p of pathLine(7, 19, 7, 23)) s = placeOk(s, p.id, p.col, p.row);
    const uid = s.placed[0].uid;
    expect(reachableSet(s).has(uid)).toBe(false);
    for (const p of pathLine(8, 23, 12, 23)) s = placeOk(s, p.id, p.col, p.row);
    for (const p of pathLine(12, 24, 12, 29)) s = placeOk(s, p.id, p.col, p.row);
    expect(reachableSet(s).has(uid)).toBe(true);
  });

  it('占用表标出大门和地形', () => {
    const occ = occupancy(bare());
    expect(occ[GATE_ROW * LOT_W + GATE_COLS[0]]).toBe(-1);
    const s = newState(3);
    expect(occupancy(s)[17 * LOT_W + 16]).toBe(s.placed.find((p) => p.id === 'boulder' && p.row === 17)?.uid);
  });
});

describe('组合', () => {
  it('咖啡车挨着球场：建好时发现"打完来一杯"，第二对不算新发现；没发现过的预览是"？？？"', () => {
    let s = starter(); // 球场 (1..6, 11..22)
    const pv = comboPreview(s, 'cafe', 11, 16, 0);
    expect(pv.map((x) => x.combo.id)).toContain('cafe-court');
    expect(pv.find((x) => x.combo.id === 'cafe-court')).toMatchObject({ name: '？？？', known: false });
    s = placeOk(s, 'cafe', 11, 16, 0);
    const r = tick(s, 2.5);
    const found = r.events.filter((e) => e.type === 'comboFound');
    expect(found[0]).toMatchObject({ combo: 'cafe-court', first: true });
    expect(r.state.combos).toContain('cafe-court');
    expect(r.state.today.found).toBe(1);
    // 发现过了，预览就显示名字
    expect(comboPreview(r.state, 'cafe', 11, 19, 0).find((x) => x.combo.id === 'cafe-court')).toMatchObject({
      name: '打完来一杯',
      known: true,
    });
    // 第二辆咖啡车挨着：同一组合 first = false；两辆咖啡车挨着 → 美食街
    s = placeOk(r.state, 'cafe', 11, 18, 0);
    const f2 = tick(s, 2.5).events.filter((e) => e.type === 'comboFound');
    expect(f2.find((e) => e.type === 'comboFound' && e.combo === 'cafe-court')).toMatchObject({ first: false });
    expect(f2.find((e) => e.type === 'comboFound' && e.combo === 'food-food')).toMatchObject({ first: true });
  });

  it('位置不合法时没有预览；钱不够照样预览', () => {
    const s = starter();
    expect(comboPreview(s, 'cafe', 9, 17, 0)).toEqual([]); // 压着球场
    expect(comboPreview(s, 'cafe', 11, 13, 0)).toEqual([]); // 没开放
    expect(comboPreview({ ...s, money: 0 }, 'cafe', 11, 16, 0).length).toBeGreaterThan(0);
  });

  it('隔太远不成组合', () => {
    expect(comboPreview(starter(), 'cafe', 18, 17, 0).filter((x) => x.combo.id === 'cafe-court')).toEqual([]);
  });

  it('拆掉一边，那一对组合就没了；星级清单的组合数跟着掉（放了再拆的漏洞堵上了）', () => {
    let s = starter();
    expect(activeComboKinds(s)).toEqual([]);
    s = finishBuild(placeOk(s, 'shade', 11, 16));
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
    let s = finishBuild(placeOk(s0, 'palm', 4, 17));
    expect(appealOf(s, court)).toBe(base + 1);
    const palm = s.placed[s.placed.length - 1];
    expect(appealOf(s, palm)).toBe(0);
    // 远处的棕榈不算
    s = finishBuild(placeOk(s, 'palm', 18, 17));
    expect(appealOf(s, court)).toBe(base + 1);
    // 一圈棕榈：封顶 +4
    for (const r of [18, 19, 20, 21, 22]) s = finishBuild(placeOk(s, 'palm', 4, r));
    expect(appealOf(s, court)).toBe(6 + 4);
  });

  it('停车场不带客，放大客流：每个 ×1.08', () => {
    const s0 = withLayout(bare(), [
      { id: 'court-hard', col: 4, row: 15 },
      ...pathLine(4, 29, 21, 29),
      ...pathLine(7, 27, 7, 28),
    ]);
    const d0 = demandPerDay(s0);
    expect(d0).toBeGreaterThan(0);
    // 停车场 4×5，门 (2,4) 朝南，正好落在 row 24 的步道上
    const s1 = withLayout(s0, [{ id: 'parking', col: 10, row: 24 }]);
    expect(unreachable(s1)).toEqual([]);
    expect(demandPerDay(s1)).toBeCloseTo(d0 * 1.08);
    const s3 = withLayout(s1, [
      { id: 'parking', col: 14, row: 24 },
      { id: 'parking', col: 18, row: 24 },
    ]);
    expect(demandPerDay(s3)).toBeCloseTo(d0 * 1.24);
    // 停车场自己不带客
    expect(appealOf(s3, s3.placed[s3.placed.length - 1])).toBe(0);
  });

  it('客人第一站只去球场：只有咖啡车的俱乐部没人来，收盘说清楚', () => {
    let s = finishBuild(placeOk(bare(), 'cafe', 12, 27));
    s = placeOk(s, 'path', 13, 29);
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
    const s = finishBuild(placeOk(bare(), 'court-hard', 4, 15));
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
    let s3 = finishBuild(placeOk(r2.state, 'practice-wall', 11, 16));
    for (const p of pathLine(13, 19, 13, 20)) s3 = placeOk(s3, p.id, p.col, p.row);
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
    const s = finishBuild(placeOk(bare(), 'court-hard', 4, 15));
    const e = settledOf(runDay(s).events);
    expect(e.net).toBeLessThan(0);
    expect(e.blocking).toBe(true);
  });
});

describe('会员', () => {
  it('逛满两处的客人有机会办卡；会员收盘时加进来、交会费、每天流失 2%', () => {
    let s = finishBuild(placeOk(starter(2), 'cafe', 11, 16));
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
      { id: 'practice-wall', col: 11, row: 16 },
      ...pathLine(13, 19, 13, 20),
      { id: 'pro-shop', col: 14, row: 27 },
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
    expect(spendOf(s, p).amount).toBe(Math.round(50 * LV_MUL[1]));
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

  it('比赛邀请周四来；承办扣报名费；周日条件够就办成，发奖金、名气；附加目标达成奖金 ×1.5', () => {
    // ★2、两片球场 + 看台
    const base = withLayout(bare(5, { star: 2, day: 3 }), [
      ...STARTER,
      { id: 'court-hard', col: 15, row: 15 },
      ...pathLine(18, 27, 18, 28),
      { id: 'bleachers', col: 11, row: 15 },
    ]);
    expect(unreachable(base)).toEqual([]);
    expect(dayInfo(base, 7)).toMatchObject({ cup: true, cupName: '俱乐部赛', cupReady: true });
    // 周三收盘 → 周四来邀请
    let { state: s, events } = runDay(base);
    const offer = events.find((e) => e.type === 'cupOffer');
    expect(offer).toMatchObject({ offer: { id: 'club', day: 7, fee: 0, missing: '', entered: false } });
    expect(offerInfo(s)?.name).toBe('俱乐部赛');
    const r = apply(s, { type: 'enterCup' });
    expect(r.events[0]).toMatchObject({ type: 'cupEntered', id: 'club', day: 7 });
    s = r.state;
    expect(offerInfo(s)?.entered).toBe(true);
    expect(apply(s, { type: 'enterCup' }).events[0]?.type).toBe('rejected');
    s = runDay(runDay(runDay(s).state).state).state; // 周四、五、六
    expect(s.day).toBe(7);
    const m0 = s.money;
    const f0 = s.fame;
    const day7 = runDay(s);
    const res = day7.events.find((e) => e.type === 'cupResult');
    if (res?.type !== 'cupResult') throw new Error('没有比赛结果');
    expect(res).toMatchObject({ id: 'club', held: true, fameGain: 1 });
    const c = CUPS[0];
    expect(res.prize).toBe(Math.round((c.prize + c.perFan * res.fans) * (res.bonus ? c.bonus.mul : 1)));
    expect(res.bonus).toBe(settledOf(day7.events).turnedAway === 0);
    expect(day7.state.fame).toBe(f0 + 1);
    expect(day7.state.cupsWon).toEqual(['club']);
    const e = settledOf(day7.events);
    expect(day7.state.money).toBe(m0 + e.income - e.upkeep + res.prize);
    expect(e.blocking).toBe(true);
    expect(e.diff?.weekday).toContain('周日俱乐部赛');
    // 兼容的旧事件
    expect(day7.events.some((x) => x.type === 'clubCup')).toBe(true);
    expect(day7.state.cup).toBeNull();
  });

  it('承办了但周日条件不够：比赛取消，报名费不退；不接邀请就没有比赛', () => {
    const s0 = { ...starter(), star: 2, fame: 3, day: 7, cup: { id: 'region', day: 7 }, money: 9000 };
    const { events, state } = runDay(s0);
    const res = events.find((e) => e.type === 'cupResult');
    expect(res).toMatchObject({ id: 'region', held: false, prize: 0 });
    if (res?.type !== 'cupResult') throw new Error();
    expect(res.why).toContain('红土');
    expect(state.fame).toBe(3);
    // ★2 以前没有邀请
    const early = runDay({ ...starter(), day: 3 });
    expect(early.events.some((e) => e.type === 'cupOffer')).toBe(false);
    expect(dayInfo(early.state, 7).need).toBe('★2 开放');
    // 拒绝
    const o = { ...starter(), star: 2, offer: { id: 'club', day: 7 } };
    const d = apply(o, { type: 'declineCup' });
    expect(d.events[0]).toMatchObject({ type: 'cupDeclined', id: 'club' });
    expect(d.state.offer).toBeNull();
  });

  it('邀请挑条件够的最高一档；一档都不够就给开放了的最高一档', () => {
    const s = withLayout(bare(5, { star: 3 }), [
      ...STARTER,
      { id: 'court-hard', col: 15, row: 15 },
      ...pathLine(18, 27, 18, 28),
      { id: 'bleachers', col: 11, row: 15 },
    ]);
    expect(bestCup({ ...s, fame: 0 })?.id).toBe('club');
    expect(bestCup({ ...s, fame: 3 })?.id).toBe('club'); // 地区赛要红土，不够 → 退回俱乐部赛
    expect(bestCup({ ...starter(), star: 3, fame: 3 })?.id).toBe('region'); // 都不够 → 最高一档
    expect(bestCup(starter())).toBeNull();
  });
});

describe('后期：夜场灯、买地、教练', () => {
  it('★3 起能给球场装灯：一天拉长到 21:00，钟点不跳；有灯的球场 16 点以后还接客；维护费 +60', () => {
    let s = { ...starter(), star: 3, money: 9999, time: 0.5 };
    const court = uidOf(s, 'court-hard');
    expect(lightsInfo(s, uidOf(s, 'cafe'))).toBeNull();
    expect(lightsInfo({ ...s, star: 2 }, court)).toMatchObject({ can: false, need: '★3 以后能装' });
    expect(lightsInfo(s, court)).toMatchObject({ can: true, cost: LIGHTS.cost['court-hard'] });
    expect(dayEndHour(s)).toBe(18);
    const h0 = clockHour(s);
    const r = apply(s, { type: 'lights', uid: court });
    expect(r.events[0]).toMatchObject({ type: 'lightsOn', uid: court });
    s = r.state;
    expect(s.money).toBe(9999 - LIGHTS.cost['court-hard']);
    expect(dayEndHour(s)).toBe(21);
    expect(clockHour(s)).toBeCloseTo(h0);
    expect(lightsInfo(s, court)).toBeNull();
    // 跑完这一天：16 点以后还有客人来，都去有灯的球场
    const events: SimEvent[] = [];
    let late = 0;
    for (let i = 0; i < 2000 && s.day === 1; i++) {
      const t = tick(s, 0.05);
      if (clockHour(t.state) > 16.2)
        for (const e of t.events)
          if (e.type === 'visitorArrive') {
            late++;
            expect(e.to).toBe(court);
          }
      s = t.state;
      events.push(...t.events);
    }
    expect(late).toBeGreaterThan(0);
    const e = settledOf(events);
    expect(e.upkeep).toBe(BY_ID['court-hard'].upkeep + BY_ID.cafe.upkeep + LIGHTS.upkeep);
    expect(s.dayHours).toBe(14);
  });

  it('★4 起能买东西两边的地：第一块 $15k、第二块 $30k；买了就能建', () => {
    const s = { ...starter(), star: 4, money: 50000 };
    expect(landInfo({ ...s, star: 3 }, 'west')).toMatchObject({ can: false, need: '★4 以后能买' });
    expect(openColRange(s)).toEqual([4, 21]);
    expect(canPlace(s, 'cafe', 0, 17)).toBe('land');
    const r = apply(s, { type: 'buyLand', side: 'west' });
    expect(r.events[0]).toMatchObject({ type: 'landBought', side: 'west', cols: [0, 3], cost: 15000 });
    expect(openColRange(r.state)).toEqual([0, 21]);
    expect(canPlace(r.state, 'cafe', 0, 17)).toBeNull();
    expect(landInfo(r.state, 'west')).toBeNull();
    expect(apply(r.state, { type: 'buyLand', side: 'west' }).events[0]?.type).toBe('rejected');
    expect(landInfo(r.state, 'east')).toMatchObject({ cost: 30000, can: true });
    const r2 = apply(r.state, { type: 'buyLand', side: 'east' });
    expect(openColRange(r2.state)).toEqual([0, LOT_W - 1]);
    expect(r2.state.money).toBe(50000 - 15000 - 30000);
  });

  it('会所 Lv3 以后能给正式球场请教练：收费 ×1.25，维护费 +60', () => {
    let s = withLayout({ ...starter(), star: 2, money: 9999 }, [{ id: 'clubhouse', col: 15, row: 16 }]);
    const court = uidOf(s, 'court-hard');
    expect(coachInfo(s, uidOf(s, 'cafe'))).toBeNull();
    expect(coachInfo(s, court)).toMatchObject({ can: false, need: '会所升到 Lv3 以后才有教练肯来' });
    s.placed = s.placed.map((p) => (p.id === 'clubhouse' ? { ...p, lv: 3 } : p));
    expect(coachInfo(s, court)).toMatchObject({ can: true, cost: COACH.cost });
    const p0 = s.placed.find((p) => p.uid === court);
    if (!p0) throw new Error();
    const a0 = spendOf(s, p0).amount;
    s = apply(s, { type: 'hireCoach', uid: court }).state;
    const p1 = s.placed.find((p) => p.uid === court);
    if (!p1) throw new Error();
    expect(p1.coach).toBe(true);
    expect(spendOf(s, p1).amount).toBe(Math.round(a0 * COACH.spend));
    expect(upkeepOf(p1)).toBe(BY_ID['court-hard'].upkeep + COACH.upkeep);
  });
});

describe('客流：三处、等场', () => {
  it('客人最多逛三处；第一站客满时先去顺路设施等场，不直接走掉', () => {
    // 会员多 → 客满；球场边有咖啡车、球具店可以等场
    const s = withLayout({ ...starter(8), members: 150 }, [
      { id: 'cafe', col: 11, row: 19 },
      { id: 'pro-shop', col: 14, row: 27 },
      ...pathLine(12, 20, 12, 20),
    ]);
    const { events } = runDay(s);
    const spends = new Map<number, number>();
    for (const e of events) if (e.type === 'visitorSpend') spends.set(e.vid, (spends.get(e.vid) ?? 0) + 1);
    expect(Math.max(...spends.values())).toBe(3);
    const side = new Set(s.placed.filter((p) => p.id === 'cafe' || p.id === 'pro-shop').map((p) => p.uid));
    expect(events.some((e) => e.type === 'visitorArrive' && side.has(e.to))).toBe(true);
    const e = settledOf(events);
    // 走掉的理由说能做什么
    if (e.turnedAway > 0) expect(e.reasons.join()).toMatch(/走了 —— /);
    expect(e.reasons.join()).not.toContain('离 ★');
  });
});

describe('一个月', () => {
  it('第 30 天收盘出评分卡（PLS 式），之后照样经营', () => {
    const { state, events } = runDay({ ...starter(), day: 30, members: 10, fame: 2, cupsWon: ['club'] });
    const sc = events.find((e) => e.type === 'seasonScore');
    if (sc?.type !== 'seasonScore') throw new Error();
    expect(sc.parts.find((p) => p.label.startsWith('会员'))?.points).toBeGreaterThanOrEqual(18);
    expect(sc.total).toBe(sc.parts.reduce((a, p) => a + p.points, 0));
    expect(settledOf(events).blocking).toBe(true);
    expect(state.day).toBe(31);
  });

  it('收盘理由：星期的原因放第一条；没变化时说"和昨天差不多"', () => {
    const r1 = runDay(starter(11)); // 周一
    const r2 = runDay(r1.state); // 周二
    const e2 = settledOf(r2.events);
    expect(e2.diff?.weekday).toBeNull();
    expect(e2.reasons[0]).toMatch(/和昨天差不多|比昨天/);
    const e3 = settledOf(runDay(r2.state).events); // 周三青训日
    expect(e3.diff?.weekday).toContain('周三青训日');
    expect(e3.reasons[0]).toContain('周三青训日');
  });
});

describe('升星、地块开放', () => {
  it('目标都够了，收盘时升星并解锁', () => {
    const g = STAR_GOALS[0];
    let s = starter();
    s = finishBuild(placeOk(s, 'practice-wall', 11, 16)); // 第 3 座设施 + 组合
    s = { ...s, totalVisitors: g.visitors };
    const { events, state } = runDay(s);
    const up = events.find((e) => e.type === 'starUp');
    expect(up).toMatchObject({ star: 1 });
    if (up?.type !== 'starUp') throw new Error();
    expect(up.unlocked).toContain('pro-shop');
    expect(state.star).toBe(1);
    expect(canPlace(state, 'pro-shop', 16, 17)).toBeNull();
    expect(settledOf(events).blocking).toBe(true);
  });

  it('装饰不算设施，目标不够不升', () => {
    let s = starter();
    for (const r of [17, 18, 19]) s = finishBuild(placeOk(s, 'palm', 4, r));
    expect(starProgress(s)?.next.find((i) => i.key === 'buildings')?.have).toBe(2);
    expect(runDay({ ...s, totalVisitors: 999 }).events.some((e) => e.type === 'starUp')).toBe(false);
  });

  it('升到 ★2：地块往北开放 4 行，露出那片地里的地形', () => {
    // 第 0 套地形：绿洲 (16,11)、老棕榈 (6..8, 13) 在 rows 11..14
    let s = withLayout(newState(3, { star: 1 }), [
      ...STARTER,
      { id: 'practice-wall', col: 11, row: 16 },
      { id: 'cafe', col: 11, row: 19 },
      { id: 'pickle', col: 18, row: 15 },
      { id: 'pro-shop', col: 15, row: 20 },
      { id: 'cafe', col: 15, row: 23 },
    ]);
    s = { ...s, totalVisitors: 999, members: 99, bestNet: 9999 };
    expect(openRowStart(s)).toBe(15);
    expect(starProgress(s)?.done).toBe(true);
    const { state, events } = runDay(s);
    expect(state.star).toBe(2);
    expect(state.lotRows).toBe(20);
    expect(openRowStart(state)).toBe(11);
    const po = events.find((e) => e.type === 'parcelOpened');
    expect(po).toMatchObject({ rows: [11, 14] });
    if (po?.type !== 'parcelOpened') throw new Error();
    const ids = po.features.map((u) => state.placed.find((p) => p.uid === u)?.id).sort();
    expect(ids).toEqual(['oasis', 'old-palm', 'old-palm', 'old-palm']);
    expect(events.findIndex((e) => e.type === 'starUp')).toBeGreaterThan(
      events.findIndex((e) => e.type === 'daySettled'),
    );
    expect(canPlace(state, 'cafe', 4, 11)).toBeNull();
    expect(canPlace(state, 'cafe', 4, 10)).toBe('parcel');
    expect(state.fame).toBe(1); // 升 ★2 起每升一星名气 +1
  });

  it('starProgress 的各项、nextGoalHint 给一句能照做的话', () => {
    const s = starter();
    const sp = starProgress(s);
    expect(sp?.star).toBe(1);
    expect(sp?.next.map((i) => i.key)).toEqual(['visitors', 'buildings', 'combos']);
    expect(sp?.items).toBe(sp?.next);
    // 先说要动手的（设施），客人放最后（它自己会涨）
    expect(nextGoalHint(s)).toMatch(/还差 1 座设施.*练习墙/);
    // 设施够了 → 组合，说出能凑的一对（不报组合名）
    const s2 = finishBuild(placeOk(s, 'practice-wall', 16, 17));
    expect(nextGoalHint(s2)).toMatch(/还差 1 个组合：把.+放在.+旁边试试/);
    expect(nextGoalHint({ ...s2, pairs: ['shade-court:1:2'] })).toContain('还差 30 位客人');
    // 放不下的不推荐：地块塞满时说"拆掉小的换大的"
    const full = withLayout(
      s,
      [...Array(LOT_W * LOT_D).keys()].map((k) => ({ id: 'palm', col: k % LOT_W, row: Math.floor(k / LOT_W) })),
    );
    expect(nextGoalHint(full)).toContain('地块满了');
    // ★4 要建过红土
    const s4 = { ...s, star: 3 };
    expect(starProgress(s4)?.next.find((i) => i.key === 'has')).toMatchObject({ id: 'court-clay', have: 0, need: 1 });
    // 满星
    expect(starProgress({ ...s, star: STAR_GOALS.length })).toBeNull();
    expect(nextGoalHint({ ...s, star: STAR_GOALS.length })).toContain('满星');
  });
});

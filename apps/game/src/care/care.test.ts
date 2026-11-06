import { Group, indianWells, type MessCourtSnapshot } from '@td/iso';
import { mulberry32 } from '@td/shared';
import { CONTENT } from '@td/sim';
import { describe, expect, it } from 'vitest';
import { Session } from '../session';
import {
  CareModel,
  type CourtGeom,
  clearedFrom,
  clearedPercent,
  facilityLeft,
  lineDims,
  litterCount,
  MESS_MIN,
  netScore,
  toolsFor,
  workable,
} from './model';

const CLEAN = { sand: 0, water: 0, litter: 0, lines: 0, cracks: 0 };
/** 会员场 outer_1 的场地（layout.ts 的 F_O1）、地台西北角 */
const O1: CourtGeom = { ox: -17, oz: 25, hx: 16.5, hz: 8.3, c: 1, s: 0 };
const TEXEL = { x0: -80, z0: -56 };
const model = (mess: Partial<typeof CLEAN>, surface: 'hard' | 'clay' | 'pickleball' = 'hard', seed = 7) =>
  new CareModel({ geom: O1, surface, mess: { ...CLEAN, ...mess }, rnd: mulberry32(seed), texel: TEXEL });

describe('亲手扫：配哪些工具', () => {
  it('只给场上有的脏乱配工具（契约「五种脏乱」的工具列）', () => {
    expect(toolsFor('hard', { ...CLEAN, sand: 0.5 })).toEqual(['broom']);
    expect(toolsFor('hard', { ...CLEAN, water: 0.5, cracks: 0.4 })).toEqual(['squeegee', 'roller']);
    expect(toolsFor('clay', { ...CLEAN, water: 0.5, cracks: 0.4 })).toEqual(['roller', 'water']);
    expect(toolsFor('hard', { ...CLEAN, litter: 0.2 })).toEqual(['pick']);
    expect(toolsFor('pickleball', { ...CLEAN, lines: 0.3 })).toEqual(['paint', 'net']);
    expect(toolsFor('hard', { ...CLEAN, sand: MESS_MIN - 0.001 })).toEqual([]);
  });
  it('同一种工具不重复（红土的积水和硬地的裂缝都用压路滚）', () => {
    const t = toolsFor('clay', { sand: 1, water: 1, litter: 1, lines: 1, cracks: 1 });
    expect(new Set(t).size).toBe(t.length);
    expect(t).toEqual(['broom', 'roller', 'water', 'pick', 'paint', 'net']);
  });
});

describe('亲手扫：结果', () => {
  it('cleared = 1 − 剩下的 / 开始的，截在 0..1，开始没有的项不写', () => {
    const start = { ...CLEAN, sand: 0.6, water: 0.02, litter: 0.3 };
    expect(clearedFrom(start, { sand: 0.25, litter: 1 })).toEqual({ sand: 0.75, litter: 0 });
    expect(clearedFrom(start, { sand: -1, litter: 2 })).toEqual({ sand: 1, litter: 0 });
    // 没给剩多少、或者不是有限数：当一点没动
    expect(clearedFrom(start, { sand: Number.NaN })).toEqual({ sand: 0, litter: 0 });
    expect(clearedFrom(CLEAN, {})).toEqual({});
  });
  it('清掉了 p%：按可用度权重 × 开始的量加权', () => {
    const start = { ...CLEAN, sand: 0.5, litter: 0.5 };
    expect(clearedPercent(start, { sand: 1, litter: 0 })).toBe(50);
    expect(clearedPercent(start, { sand: 1, litter: 0 }, { sand: 0.6, litter: 0.3 })).toBe(67);
    expect(clearedPercent(CLEAN, {})).toBe(100);
  });
  it('可捡的东西 round(litter × 24)，有就至少一个', () => {
    expect(litterCount(0)).toBe(0);
    expect(litterCount(0.03)).toBe(1);
    expect(litterCount(0.5)).toBe(12);
    expect(litterCount(1)).toBe(24);
  });
  it('球网：目标张力满分，偏得越多分越低，最低 15', () => {
    expect(netScore(0.72)).toBe(100);
    expect(netScore(0.62)).toBe(72);
    expect(netScore(0)).toBe(15);
  });
  it('线：标准网球场、tennis2、匹克球场（13.41 × 6.10）、四片小匹克球场', () => {
    expect(lineDims('hard', { hx: 16.5 })).toMatchObject({ L: 11.885, Wd: 5.485 });
    expect(lineDims('hard', { hx: 8 })).toMatchObject({ L: 7.3, Wd: 3.35 });
    expect(lineDims('pickleball', { hx: 8 })).toMatchObject({ L: 6.705, Wd: 3.05, kit: 2.13 });
    expect(lineDims('pickleball', { hx: 4.4 })).toMatchObject({ L: 3.7, Wd: 1.75 });
  });
});

describe('亲手扫：模型', () => {
  it('开工时每项都还剩 1、结果全是 0；只算开始时有的项', () => {
    const m = model({ sand: 0.6, litter: 0.3, lines: 0.4 });
    expect(m.left()).toEqual({ sand: 1, litter: 1, lines: 1 });
    expect(m.cleared()).toEqual({ sand: 0, litter: 0, lines: 0 });
    expect(workable(m.start)).toEqual(['sand', 'litter', 'lines']);
    expect(m.litter).toHaveLength(7);
  });
  it('同一个种子画出同样的场；量越大铺得越开', () => {
    const a = model({ sand: 0.4 }, 'hard', 3);
    const b = model({ sand: 0.4 }, 'hard', 3);
    expect(Array.from(a.sand)).toEqual(Array.from(b.sand));
    const cells = (m: CareModel) => m.sand.reduce((n, v) => n + (v > 0.05 ? 1 : 0), 0);
    expect(cells(model({ sand: 0.9 }, 'hard', 3))).toBeGreaterThan(cells(model({ sand: 0.2 }, 'hard', 3)));
    const faded = (m: CareModel) => m.fadedInit;
    expect(faded(model({ lines: 0.8 }))).toBeGreaterThan(faded(model({ lines: 0.2 })));
  });
  it('扫把把沙推出场外；收尾一口气清光', () => {
    const m = model({ sand: 0.7 });
    for (let v = -7.6; v <= 7.6; v += 1.2) for (let u = -15; u <= 16; u += 0.2) m.push('sand', u, v, 1, 0, 1.6);
    const after = m.left().sand ?? 1;
    expect(after).toBeLessThan(1);
    m.finish('sand');
    expect(m.cleared().sand).toBe(1);
  });
  it('捡光、画满线、挂好网：线和垃圾都清掉 100%', () => {
    const m = model({ litter: 0.4, lines: 0.5 });
    for (const it of m.litter) m.pick(it.u, it.v, 0.3);
    m.segs.forEach((g, s) => {
      m.paintSeg(s, g.a, g.b, 2);
    });
    expect(m.cleared()).toEqual({ litter: 1, lines: 0.8 });
    m.setNet(0.72);
    expect(m.cleared()).toEqual({ litter: 1, lines: 1 });
  });
  it('网接管不了（dropNet）时线那一项只看画线', () => {
    const m = model({ lines: 0.5 });
    m.dropNet();
    expect(m.tools).not.toContain('net');
    m.segs.forEach((g, s) => {
      m.paintSeg(s, g.a, g.b, 2);
    });
    expect(m.cleared().lines).toBe(1);
  });
  it('沙上画线是脏的（算没画），扫掉沙以后要重画', () => {
    const m = model({ sand: 1, lines: 1 });
    m.segs.forEach((g, s) => {
      m.paintSeg(s, g.a, g.b, 2);
    });
    expect(m.cleared().lines ?? 0).toBeLessThan(0.8);
  });
  it('红土：压路滚压实湿泥，干裂要洒水（压不动）', () => {
    const m = model({ water: 0.6, cracks: 0.6 }, 'clay');
    const pass = (fn: (u: number, v: number) => void) => {
      for (let v = -7.6; v <= 7.6; v += 0.6) for (let u = -15.6; u <= 15.6; u += 0.2) fn(u, v);
    };
    pass((u, v) => m.roll(u, v, 1.2));
    const l = m.left();
    expect(l.water ?? 1).toBeLessThan(0.2);
    expect(l.cracks).toBe(1);
    pass((u, v) => m.sprinkle(u, v, 1.5));
    expect(m.left().cracks ?? 1).toBeLessThan(0.3);
  });
  it('硬地：压路滚压裂缝，沙上压不实', () => {
    const roll = (sand: number) => {
      const m = model({ sand, cracks: 0.6 }, 'hard', 11);
      for (let v = -7.6; v <= 7.6; v += 0.6) for (let u = -15.6; u <= 15.6; u += 0.2) m.roll(u, v, 1.2);
      return m.left().cracks ?? 1;
    };
    expect(roll(0)).toBeLessThan(roll(1));
  });
  it('局部 ↔ 世界：转了 90° 的场地（四片小匹克球场）来回换一致', () => {
    const m = new CareModel({
      geom: { ox: 40, oz: 1.6, hx: 4.4, hz: 4, c: Math.cos(Math.PI / 2), s: Math.sin(Math.PI / 2) },
      surface: 'pickleball',
      mess: { ...CLEAN, lines: 0.5 },
      rnd: mulberry32(1),
    });
    const w = m.world(1.5, -2);
    const l = m.local(w.x, w.z);
    expect(l.u).toBeCloseTo(1.5);
    expect(l.v).toBeCloseTo(-2);
    expect(m.segs.length).toBe(8);
  });
});

describe('Session：小游戏开着时游戏时间停着', () => {
  it('care 不为空时 frame() 不走时间；careFinish 以后接着走', () => {
    const s = Session.fresh(CONTENT, 5);
    s.frame(0);
    const t0 = s.s.t;
    s.care = 'outer_1';
    s.frame(10);
    s.stepMinute();
    expect(s.s.t).toBe(t0);
    expect(s.paused).toBe(false);
    s.careFinish('outer_1', { cleared: { sand: 1 } });
    expect(s.care).toBeNull();
    s.frame(10);
    expect(s.s.t).toBeGreaterThan(t0);
  });
});

describe('亲手扫：和外面同步（照地图的快照摆）', () => {
  /** 地图的叠层（假的 IsoWorld：只要静态层和失效计数），五处球场修好 */
  function overlays() {
    const w = {
      statics: new Group(),
      scene: new Group(),
      ground: { paintRect: () => {} },
      addLamp: () => () => {},
      view: { invalidate: () => {} },
    };
    const ov = indianWells.createFacilityOverlays(w as never);
    ov.repaint();
    for (const f of ['outer_1', 'outer_23', 'practice', 'stadium_1', 'stadium_3'])
      ov.set(f, indianWells.RESTORED_STATES[f as 'outer_1'] as string);
    ov.flush();
    return ov;
  }
  const ALL = { sand: 0.5, water: 0.4, litter: 0.5, lines: 0.6, cracks: 0.5 };
  const fromSnap = (snap: MessCourtSnapshot, surface: 'hard' | 'clay' = 'hard') =>
    new CareModel({
      geom: { ox: snap.ox, oz: snap.oz, hx: snap.hx, hz: snap.hz, c: 1, s: 0 },
      surface,
      mess: ALL,
      rnd: mulberry32(1),
      texel: TEXEL,
      from: snap,
    });

  it('进去：每一格、每一件垃圾都和外面一样', () => {
    const ov = overlays();
    ov.mess('outer_1', ALL);
    const [snap] = ov.messSnapshot('outer_1', null);
    if (!snap) throw new Error('没有快照');
    const m = fromSnap(snap);
    let mapped = 0;
    for (let c = 0; c < m.N; c++) {
      if (!m.inside[c]) continue;
      const w = m.wcell[c] as number;
      expect(w).toBeGreaterThanOrEqual(0);
      mapped++;
      expect(m.sand[c]).toBe(snap.sand[w]);
      expect(m.wet[c]).toBe(snap.wet[w]);
    }
    expect(mapped).toBe(snap.inside.reduce((n, v) => n + v, 0));
    expect(m.litter.map((it) => it.id)).toEqual(snap.pieces.map((p) => p.id));
    for (const it of m.litter) {
      const p = snap.pieces.find((q) => q.id === it.id)!;
      const w = m.world(it.u, it.v);
      expect(w.x).toBeCloseTo(p.x);
      expect(w.z).toBeCloseTo(p.z);
    }
    expect(m.fadedInit).toBeGreaterThan(0);
    expect(m.tools).toEqual(['broom', 'squeegee', 'roller', 'pick', 'paint', 'net']);
  });

  it('没动就交回：和进去时一样；捡掉的垃圾、扫掉的沙不再画', () => {
    const ov = overlays();
    ov.mess('outer_1', ALL);
    const [snap] = ov.messSnapshot('outer_1', null);
    if (!snap) throw new Error('没有快照');
    const m = fromSnap(snap);
    const same = m.residual()!;
    for (const k of ['sand', 'wet', 'crack', 'dry', 'grey', 'fade'] as const)
      expect(Array.from(same[k]), k).toEqual(Array.from(snap[k]));
    expect(same.pieces).toEqual(snap.pieces);
    const half = m.litter.slice(0, Math.floor(m.litter.length / 2));
    for (const it of half) it.taken = true;
    m.finish('sand');
    const res = m.residual()!;
    expect(res.pieces.map((p) => p.id)).toEqual(m.litter.filter((it) => !it.taken).map((it) => it.id));
    expect(res.sand.some((v) => v > 0)).toBe(false);
    // 交回地图：外面照剩下的画
    const left = m.left();
    const after = { ...ALL, sand: ALL.sand * (left.sand ?? 1), litter: ALL.litter * (left.litter ?? 1) };
    ov.messRebase('outer_1', [res], after);
    const [now] = ov.messSnapshot('outer_1', null);
    expect(now?.pieces.map((p) => p.id).sort()).toEqual(res.pieces.map((p) => p.id).sort());
    expect(now?.sand.some((v) => v > 0.05)).toBe(false);
  });

  it('两片场的设施只扫一片：按画面上的多少折算，另一片原样', () => {
    const focus = { sand: 10, water: 0, litter: 4, lines: 0, cracks: 0 };
    const other = { sand: 30, water: 0, litter: 0, lines: 0, cracks: 0 };
    const l = facilityLeft({ sand: 0, litter: 0 }, focus, [other]);
    expect(l.sand).toBeCloseTo(0.75);
    // 这块场上没有的项按别的场算：一点没动
    expect(facilityLeft({ water: 0 }, focus, [{ ...other, water: 5 }]).water).toBe(1);
    expect(l.litter).toBe(0);
  });
});

describe('Session：收工当场交给模拟', () => {
  it('careFinish 返回收没收；事件下一帧交出去', () => {
    const s = Session.fresh(CONTENT, 5);
    s.frame(0);
    expect(s.careFinish('clubhouse', { cleared: { sand: 1 } })).toBe(false);
  });
});

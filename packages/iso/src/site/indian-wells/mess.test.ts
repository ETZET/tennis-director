import { describe, expect, it } from 'vitest';
import { daylightAt } from '../../core/daylight';
import { Group } from '../../core/graph';
import { Projection } from '../../core/proj';
import { Raster } from '../../core/raster';
import { MESS_DAY, type MessCourtSnapshot, messCell, messCellIn, snapshotCellIn } from '../mess-look';
import type { CourtMessLook } from '../site';
import { INDIAN_WELLS } from './index';
import { F_O1, FRAMES, PATHS } from './layout';
import {
  createMess,
  MESS_FACILITIES,
  MessGrid,
  messCells,
  messCourts,
  messRebase,
  messSnapshot,
  quantMess,
} from './mess';
import { createFacilityOverlays, type SiteWorld } from './overlays';
import { Facilities, INITIAL_STATES, RESTORED_STATES } from './state';

const ZERO: CourtMessLook = { sand: 0, water: 0, litter: 0, lines: 0, cracks: 0 };
const mess = (o: Partial<CourtMessLook>): CourtMessLook => ({ ...ZERO, ...o });
const FRESH = new Facilities(RESTORED_STATES);
/** 调色板替身：每种颜色一个不一样的不透明打包色 */
const P = new Proxy({} as Record<string, number>, { get: (_t, k) => (0xff000000 | (String(k).length * 977)) >>> 0 });

function cells(g: MessGrid, m: CourtMessLook) {
  const col = new Uint32Array(g.N);
  const amt = new Float32Array(g.N);
  const n = messCells(g, m, P as never, (c) => g.base[c] as number, col, amt);
  return { n, amt };
}

describe('mess：量化和设施', () => {
  it('quantMess：null、全 0 → null；截在 0..1、按 0.02 取整、非有限数当 0', () => {
    expect(quantMess(null)).toBeNull();
    expect(quantMess(ZERO)).toBeNull();
    expect(quantMess(mess({ sand: 0.004 }))).toBeNull();
    const q = quantMess(mess({ sand: 0.333, water: 2, lines: Number.NaN, cracks: -1 }));
    expect(q?.sand).toBeCloseTo(0.34);
    expect(q?.water).toBe(1);
    expect(q?.lines).toBe(0);
    expect(q?.cracks).toBe(0);
  });

  it('只有五处球场修好时有场地；面和场地数按变体', () => {
    expect(messCourts(FRESH, 'clubhouse')).toEqual([]);
    expect(messCourts(new Facilities(INITIAL_STATES), 'outer_1')).toEqual([]);
    expect(messCourts(FRESH, 'outer_1')).toHaveLength(1);
    expect(messCourts(FRESH, 'outer_23').every((s) => s.clay)).toBe(true);
    const hard = new Facilities(RESTORED_STATES, { outer_23: 'hard', stadium_3: 'pickle4' });
    expect(messCourts(hard, 'outer_23').some((s) => s.clay)).toBe(false);
    expect(messCourts(hard, 'stadium_3')).toHaveLength(4);
    expect(messCourts(new Facilities(RESTORED_STATES, { stadium_3: 'tennis2' }), 'stadium_3')).toHaveLength(2);
    for (const f of MESS_FACILITIES) expect(messCourts(FRESH, f).length, f).toBeGreaterThan(0);
  });
});

describe('mess：格子', () => {
  const g = new MessGrid(messCourts(FRESH, 'outer_1')[0]!);
  const clay = new MessGrid(messCourts(FRESH, 'outer_23')[0]!);

  it('量为 0 时没有像素', () => {
    expect(cells(g, ZERO).n).toBe(0);
    expect(cells(clay, ZERO).n).toBe(0);
  });

  it('每一项都画得出来，量越大铺得越开（大的量盖住小的量画到的格子）', () => {
    for (const k of ['sand', 'water', 'lines', 'cracks'] as const)
      for (const grid of [g, clay]) {
        const lo = cells(grid, mess({ [k]: 0.3 }));
        const hi = cells(grid, mess({ [k]: 0.8 }));
        expect(lo.n, `${k} 0.3`).toBeGreaterThan(0);
        // 线是整条先发灰（格子数不变），再一段段褪
        if (k === 'lines') expect(hi.n).toBeGreaterThanOrEqual(lo.n);
        else expect(hi.n, `${k} 0.8`).toBeGreaterThan(lo.n);
        for (let c = 0; c < grid.N; c++) if ((lo.amt[c] as number) > 0) expect(hi.amt[c]).toBeGreaterThan(0);
      }
  });

  it('褪色的线只画在白线格上；垃圾件数随量增长', () => {
    const { amt } = cells(g, mess({ lines: 1 }));
    let on = 0;
    for (let c = 0; c < g.N; c++)
      if ((amt[c] as number) > 0) {
        expect(g.line[c]).toBe(1);
        on++;
      }
    expect(on).toBeGreaterThan(200);
    const count = (a: number) => g.pieces.filter((p) => p.thr < a).length;
    expect(count(0)).toBe(0);
    expect(count(0.5)).toBeGreaterThan(5);
    expect(count(1)).toBe(g.pieces.length);
    expect(count(0.5)).toBeLessThan(count(1));
  });

  it('同一块场的分布每次一样（种子固定）', () => {
    const g2 = new MessGrid(messCourts(FRESH, 'outer_1')[0]!);
    expect(g2.pieces).toEqual(g.pieces);
    expect(Array.from(g2.sandT.slice(0, 500))).toEqual(Array.from(g.sandT.slice(0, 500)));
  });
});

describe('mess：叠层运行时', () => {
  it('不认识的设施、没修好的设施、重复同样的值、没跨档的变化都不重烘', () => {
    const L = createMess();
    L.sync(new Facilities(INITIAL_STATES));
    expect(L.set('clubhouse', mess({ sand: 1 }))).toBe(false);
    // 没修好：记下量，不画
    expect(L.set('outer_1', mess({ sand: 0.5 }))).toBe(false);
    // 修好：重建时画出来
    expect(L.sync(FRESH)).toBe(true);
    expect(L.set('outer_1', mess({ sand: 0.5 }))).toBe(false);
    expect(L.set('outer_1', mess({ sand: 0.505 }))).toBe(false);
    expect(L.set('outer_1', mess({ sand: 0.56 }))).toBe(true);
    expect(L.set('outer_1', null)).toBe(true);
    expect(L.set('outer_1', null)).toBe(false);
    expect(L.set('outer_1', ZERO)).toBe(false);
    expect(L.sync(FRESH)).toBe(false);
  });

  it('画进光栅：0 不动缓冲，有量时改了场地上的像素', () => {
    const L = createMess();
    L.sync(FRESH);
    const W = 160;
    const H = 120;
    const buf = new Uint32Array(W * H).fill(0xff336699);
    const pr = new Projection();
    pr.cx = F_O1.ox;
    pr.cz = F_O1.oz;
    pr.k = 4;
    pr.setAngle(0);
    pr.ox = W / 2;
    pr.oy = H / 2;
    const r = new Raster(buf, W, H, pr);
    const draw = () => {
      for (const n of L.root.children)
        if (n.visible && n.kind === 'custom') (n as never as { draw: (r: Raster, n: unknown) => void }).draw(r, n);
    };
    const changed = () => buf.reduce((s, v) => s + (v === 0xff336699 ? 0 : 1), 0);
    draw();
    expect(changed()).toBe(0);
    L.set('outer_1', mess({ sand: 0.7, litter: 0.6 }));
    draw();
    expect(changed()).toBeGreaterThan(500);
  });

  it('createOverlays().mess 接上：跨档才 invalidate，没修好不画', () => {
    let inv = 0;
    const w: SiteWorld = {
      statics: new Group(),
      scene: new Group(),
      ground: { paintRect: () => {} },
      addLamp: () => () => {},
      view: { invalidate: () => void inv++ },
    };
    const ov = createFacilityOverlays(w);
    ov.repaint();
    for (const [f, s] of Object.entries(RESTORED_STATES)) ov.set(f, s);
    ov.flush();
    inv = 0;
    ov.mess('outer_1', mess({ water: 0.6 }));
    ov.mess('outer_1', mess({ water: 0.601 }));
    ov.mess('nowhere', mess({ water: 1 }));
    expect(inv).toBe(1);
    ov.mess('outer_1', null);
    expect(inv).toBe(2);
  });
});

describe('mess：和亲手扫小游戏同步（快照、交回）', () => {
  const ALL = mess({ sand: 0.5, water: 0.4, litter: 0.5, lines: 0.6, cracks: 0.5 });
  const fresh = (f = 'outer_1', i = 0) => new MessGrid(messCourts(FRESH, f)[i]!);
  /** 每格的颜色（照快照画） */
  const paintSnap = (q: MessCourtSnapshot) => {
    const v = messCellIn();
    const out = { col: 0, amt: 0 };
    const col = new Uint32Array(q.nx * q.nz);
    const amt = new Float32Array(q.nx * q.nz);
    for (let c = 0; c < col.length; c++) {
      if (!q.inside[c]) continue;
      messCell(snapshotCellIn(q, c, v), c % q.nx, Math.floor(c / q.nx), MESS_DAY, out);
      col[c] = out.col;
      amt[c] = out.amt;
    }
    return { col, amt };
  };
  const paintGrid = (g: MessGrid, m: CourtMessLook) => {
    const col = new Uint32Array(g.N);
    const amt = new Float32Array(g.N);
    messCells(g, m, MESS_DAY, (c) => g.base[c] as number, col, amt);
    return { col, amt };
  };
  const same = (a: { col: Uint32Array; amt: Float32Array }, b: { col: Uint32Array; amt: Float32Array }) => {
    let diff = 0;
    for (let c = 0; c < a.amt.length; c++) {
      const on = (a.amt[c] as number) > 0;
      if (
        on !== (b.amt[c] as number) > 0 ||
        (on && (a.col[c] !== b.col[c] || Math.abs((a.amt[c] as number) - (b.amt[c] as number)) > 1e-3))
      )
        diff++;
    }
    return diff;
  };

  it('照快照画和地图自己画一模一样（小游戏进去不跳）', () => {
    for (const [f, i] of [
      ['outer_1', 0],
      ['outer_23', 1],
      ['stadium_3', 0],
    ] as const) {
      const g = fresh(f, i);
      const snap = messSnapshot(g, ALL);
      expect(same(paintSnap(snap), paintGrid(g, ALL)), f).toBe(0);
      expect(snap.pieces.length, f).toBe(g.pieces.filter((p) => p.thr < ALL.litter).length);
    }
  });

  it('原样交回、量变小：画面一格不差（没扫的那块场不会跟着变干净）', () => {
    for (const f of ['outer_1', 'outer_23'] as const) {
      const g = fresh(f);
      const before = messSnapshot(g, ALL);
      const q = mess({ sand: 0.3, water: 0.2, litter: 0.26, lines: 0.36, cracks: 0.3 });
      messRebase(g, before, q);
      const after = messSnapshot(g, q);
      expect(same(paintSnap(after), paintSnap(before)), f).toBe(0);
      expect(after.pieces.map((p) => p.id).sort()).toEqual(before.pieces.map((p) => p.id).sort());
    }
  });

  it('扫掉的不再画、剩下的留在原地；量再涨，扫掉的地方先回来', () => {
    const g = fresh();
    const before = messSnapshot(g, ALL);
    // 西半边扫干净、捡掉一半垃圾
    const sand = before.sand.slice();
    for (let c = 0; c < sand.length; c++) if (c % before.nx < before.nx / 2) sand[c] = 0;
    const pieces = before.pieces.filter((_, i) => i % 2 === 0);
    const res = { ...before, sand, pieces };
    const q = mess({ ...ALL, sand: 0.3, litter: 0.26 });
    messRebase(g, res, q);
    const after = messSnapshot(g, q);
    expect(same(paintSnap(after), paintSnap(res))).toBe(0);
    expect(after.pieces.map((p) => p.id).sort()).toEqual(pieces.map((p) => p.id).sort());
    // 垃圾再多一点：多出来的先是刚捡掉的那几件
    const more = messSnapshot(g, mess({ ...q, litter: 0.3 })).pieces.map((p) => p.id);
    const gone = new Set(before.pieces.map((p) => p.id).filter((id) => !pieces.some((p) => p.id === id)));
    const extra = more.filter((id) => !pieces.some((p) => p.id === id));
    expect(extra.length).toBeGreaterThan(0);
    for (const id of extra) expect(gone.has(id)).toBe(true);
  });

  it('叠层：snapshot / focus / rebase 接上', () => {
    const L = createMess();
    L.sync(FRESH);
    L.set('outer_23', mess({ litter: 0.5, sand: 0.4 }));
    const snaps = L.snapshot('outer_23', null);
    expect(snaps).toHaveLength(2);
    expect(L.focus('outer_23', snaps[0]!.key)).toBe(true);
    const vis = L.root.children.filter((n) => n.visible).map((n) => n.name);
    expect(vis).toContain(`mess:${snaps[1]!.key}`);
    expect(vis).not.toContain(`mess:${snaps[0]!.key}`);
    L.focus('outer_23', null);
    const res = { ...snaps[0]!, pieces: [], sand: new Float32Array(snaps[0]!.sand.length) };
    expect(L.rebase('outer_23', [res, snaps[1]!], mess({ litter: 0.24, sand: 0.2 }))).toBe(true);
    expect(L.get('outer_23')).toEqual(quantMess(mess({ litter: 0.24, sand: 0.2 })));
    const now = L.snapshot('outer_23', null);
    expect(now[0]!.pieces).toHaveLength(0);
    expect(now[0]!.sand.some((v) => v > 0.05)).toBe(false);
    expect(now[1]!.pieces.map((p) => p.id)).toEqual(snaps[1]!.pieces.map((p) => p.id));
    // 没快照时按 fallback 量
    expect(L.snapshot('outer_1', mess({ sand: 0.5 }))[0]?.amounts.sand).toBeCloseTo(0.5);
  });
});

describe('Site.gates 和酷热天色', () => {
  it('五处球场都有门外点：在步道上、不在任何球场里', () => {
    const gates = INDIAN_WELLS.gates ?? {};
    for (const f of MESS_FACILITIES) {
      const p = gates[f];
      expect(p, f).toBeDefined();
      if (!p) continue;
      expect(
        PATHS.some((r) => p.x >= r.x0 && p.x <= r.x1 && p.z >= r.z0 && p.z <= r.z1),
        `${f} 在步道上`,
      ).toBe(true);
      expect(
        FRAMES.some((fr) => fr.inside(p.x, p.z)),
        `${f} 不在球场里`,
      ).toBe(false);
    }
  });

  it('酷热：白天地平线更白，夜里不变', () => {
    const lum = (h: string) => [1, 3, 5].reduce((s, i) => s + Number.parseInt(h.slice(i, i + 2), 16), 0);
    const noon = daylightAt(12 * 60);
    const hot = daylightAt(12 * 60, 0, 1);
    expect(lum(hot.sky[2])).toBeGreaterThan(lum(noon.sky[2]));
    expect(hot.night).toBe(noon.night);
    expect(daylightAt(0, 0, 1)).toEqual(daylightAt(0));
  });
});

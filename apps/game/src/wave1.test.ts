import { CONTENT, DIRECTOR, orderStatus, worldOf } from '@td/sim';
import { describe, expect, it } from 'vitest';
import { Projector } from './project';
import { Session } from './session';
import { createText } from './text';

/**
 * Wave 1 的界面投影（UI-8 星级格、UI-11 变体行）：快照里该有的东西都在，文案都从 i18n 来。
 */

const setup = (lang: 'en' | 'zh' = 'en') => {
  const session = Session.fresh(CONTENT, 7);
  const text = createText(CONTENT, lang);
  return { session, text, projector: new Projector(CONTENT, text) };
};

/** 看得见、有变体的修复工单（会员场修好了、钱够：红土场的修复就开出来了） */
const variantOrder = (session: Session) => {
  session.s.facilities.outer_1 = 'playable';
  session.s.stats.cash = 5000;
  const w = worldOf(session.s, CONTENT);
  return [...w.orders.values()].find((o) => o.variants && orderStatus(session.s, w, o).visible);
};

describe('star cell (UI-8)', () => {
  it('shows the stars, how many items are left, and every item of the next star', () => {
    const { session, projector } = setup();
    const st = projector.snapshot(session).stars;
    expect(st).toBeDefined();
    expect(st?.n).toBe(0);
    expect(st?.max).toBe(worldOf(session.s, CONTENT).act.stars?.length);
    expect(st?.items.length).toBeGreaterThan(0);
    expect(st?.label).toMatch(/\d/);
    // 文案都翻出来了（不是键名）
    for (const x of st?.items ?? []) expect(x.text).not.toMatch(/^stars\.items\./);
    // 数值条件写出"现在 / 要多少"
    const members = st?.items.find((x) => x.id.startsWith('members'));
    if (members) expect(members.value).toMatch(/^\d+\/\d+$/);
  });

  it('every ui.* key it uses exists in both languages', () => {
    for (const lang of ['en', 'zh'] as const) {
      const { session, projector } = setup(lang);
      const st = projector.snapshot(session).stars;
      expect(`${st?.label} ${st?.title} ${st?.foot}`).not.toMatch(/ui\.stars\./);
    }
  });
});

describe('variant rows (UI-11)', () => {
  it('a repair with variants lists one row per variant with what it gives and costs', () => {
    const { session, projector } = setup();
    const o = variantOrder(session);
    expect(o).toBeDefined();
    if (!o) return;
    session.place = o.at;
    const row = projector.snapshot(session).place?.rows.find((r) => r.id === o.id);
    expect(row?.variants?.map((v) => v.id)).toEqual(Object.keys(o.variants ?? {}));
    for (const v of row?.variants ?? []) {
      expect(v.name).not.toMatch(/^variants\./);
      expect(v.gives || v.chips?.length).toBeTruthy();
    }
  });

  it('tapping a row marks it as previewing; holding someone shows the fit per variant', () => {
    const { session, projector } = setup();
    const o = variantOrder(session);
    expect(o).toBeDefined();
    if (!o) return;
    const [a, b] = Object.keys(o.variants ?? {});
    session.place = o.at;
    session.preview = { order: o.id, variant: b as string };
    let row = projector.snapshot(session).place?.rows.find((r) => r.id === o.id);
    expect(row?.variants?.find((v) => v.id === b)?.previewing).toBe(true);
    expect(row?.variants?.find((v) => v.id === a)?.previewing).toBeUndefined();
    session.picked = DIRECTOR;
    row = projector.snapshot(session).place?.rows.find((r) => r.id === o.id);
    for (const v of row?.variants ?? []) expect(v.fit?.text).toBeTruthy();
  });

  it('dragging onto a variant row sends assign with that variant (picked until work starts)', () => {
    const { session } = setup();
    const o = variantOrder(session);
    if (!o) return;
    const v = Object.keys(o.variants ?? {})[1] as string;
    session.assign(DIRECTOR, o.id, v);
    session.frame(0);
    expect(session.log.at(-1)?.cmd).toMatchObject({ type: 'assign', target: o.id, variant: v });
    expect(session.s.picks[o.id] ?? session.s.orders[o.id]?.variant).toBe(v);
  });
});

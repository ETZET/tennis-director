// 名册的像素版：一块"今天的人"看板（clubsite/hud 的半屏卡；?hud=old 还是 roster.ts 的全屏表格）。
// 不是表：今天来俱乐部的人按地点分簇，每簇一行 —— 打头一个地点小图（车 = 停车场、铃 = 前台、喷泉 = 广场……），
// 后面是这儿的人的像素头像，多的收成 "+N"（点了这一簇展开）。离总监近的簇在前、簇里近的在前。
// 没有页签、搜索、字；点一个头像 = 开他的人物卡（卡上能走过去、能互动）。左上探出来一张工牌（同 HUD 的名册图标）。
import type { CastPerson, SceneId } from '../cast/types';
import { actIcon, costChip, createSheet, type GlyphId, glyph, px, t, tap } from '../hud';
import { ICONS } from '../hud/icons';
import { spriteCanvas } from '../hud/sprite';
import type { CastCtx } from './ctx';
import { headCrop, shortName } from './pxcard';
import type { Roster } from './roster';

const CSS = `
.pxs-board { padding-top: calc(var(--s) * 4px); }
.pxb-head { display: flex; align-items: flex-end; height: 22px; padding-left: 4px; }
.pxb-badge { margin-top: calc(var(--s) * -16px); }
.pxb-list { max-height: min(38vh, 330px); overflow-y: auto; overscroll-behavior: contain; touch-action: pan-y; scrollbar-width: none;
  display: flex; flex-direction: column; gap: calc(var(--s) * 3px); padding: calc(var(--s) * 2px) calc(var(--s) * 1px) calc(var(--s) * 3px); }
.pxb-list::-webkit-scrollbar { display: none; }
.pxb-row { display: flex; align-items: center; gap: calc(var(--s) * 2px); flex-wrap: wrap; }
.pxb-row .where { width: 46px; display: flex; justify-content: center; flex: none; }
.pxb-tile { position: relative; min-width: 48px; min-height: 50px; }
.pxb-tile.low::after { content: ''; position: absolute; left: 6px; right: 6px; bottom: 0; height: 4px; background: #c0545a; box-shadow: 0 0 0 2px #2c2848; }
.pxb-tile .face { box-shadow: 2px 0 0 0 #2c2848, -2px 0 0 0 #2c2848, 0 2px 0 0 #2c2848, 0 -2px 0 0 #2c2848, 0 4px 0 0 #171230; }
.pxb-more { min-width: 48px; min-height: 50px; }
/* 还能往下滑：底边正中一个小纸条箭头（滑到底就收起） */
.pxb-down { position: absolute; right: calc(var(--s) * 5px); bottom: calc(var(--s) * 5px); min-height: 0 !important; margin: 0 !important; padding: calc(var(--s) * 2px) calc(var(--s) * 3px); pointer-events: none; transition: opacity 0.2s steps(2, end); }
.pxb-down.gone { opacity: 0; }
@media (orientation: landscape) { .pxb-list { max-height: min(62vh, 420px); } }
`;

/** 地点 → 打头的小图 */
const SCENE_GLYPH: Record<SceneId, GlyphId> = {
  clubpark: 'car',
  clubdesk: 'bell',
  clubpickle: 'paddle',
  clubplaza: 'fountain',
  clubstadium: 'trophy',
  clubcourts: 'racket',
  clubclay: 'clay',
  clubhouse: 'house',
  clubpool: 'drop',
  clubgolf: 'flag',
  clubfood: 'cup',
};
/** 每簇一行最多几个头像，多的收成 "+N"（点了这一簇展开） */
const PER_ROW = 5;

export function createPxBoard(ctx: CastCtx): Roster {
  if (!document.getElementById('pxb-css')) {
    const st = document.createElement('style');
    st.id = 'pxb-css';
    st.textContent = CSS;
    document.head.appendChild(st);
  }
  const sheet = createSheet('board', () => open.clear());
  const el = sheet.el;
  el.setAttribute('aria-label', t('board'));
  /** 展开了的簇 */
  const open = new Set<SceneId>();

  /** 今天的人按地点分簇：看得见的在他所在的区域，没看见的在他今天排班的第一个地方；离总监近的簇在前 */
  const clusters = (): { scene: SceneId; people: CastPerson[]; d: number }[] => {
    const s = ctx.state();
    const by = new Map<SceneId, { people: CastPerson[]; d: number }>();
    const add = (p: CastPerson, scene: SceneId, d: number) => {
      let c = by.get(scene);
      if (!c) {
        c = { people: [], d: Number.POSITIVE_INFINITY };
        by.set(scene, c);
      }
      c.people.push(p);
      c.d = Math.min(c.d, d);
    };
    const seen = new Set<string>();
    for (const p of ctx.cast.roster()) {
      const b = ctx.bound(p.id);
      const homes = ctx.cast.where(p.id, s.day);
      if (b) add(p, b.scene, b.d2);
      else if (homes.length) add(p, homes[0].scene, 1e9);
      else continue;
      seen.add(p.id);
    }
    // 场景里看得见的路人（演员表里生成的人）也算今天的人
    for (const id of Object.keys(s.people)) {
      if (seen.has(id)) continue;
      const b = ctx.bound(id);
      const p = ctx.person(id);
      if (b && p) add(p, b.scene, b.d2);
    }
    const out = [...by.entries()].map(([scene, c]) => {
      const d2 = (p: CastPerson) => ctx.bound(p.id)?.d2 ?? 1e9;
      c.people.sort((a, b) => d2(a) - d2(b));
      return { scene, people: c.people, d: c.d };
    });
    return out.sort((a, b) => a.d - b.d);
  };

  function render() {
    const cs = clusters();
    const ids = cs.flatMap((c) => c.people.map((p) => p.id));
    const head = document.createElement('div');
    head.className = 'pxb-head';
    head.appendChild(px(spriteCanvas(ICONS.roster, 'roster', true, 0xfff0c4), 1, 'pxb-badge'));
    const list = document.createElement('div');
    list.className = 'pxb-list';
    for (const c of cs) {
      const row = document.createElement('div');
      row.className = 'pxb-row';
      const wh = document.createElement('div');
      wh.className = 'where';
      wh.appendChild(px(glyph(SCENE_GLYPH[c.scene]), 2));
      row.appendChild(wh);
      const all = open.has(c.scene);
      const shown = all ? c.people : c.people.slice(0, c.people.length > PER_ROW ? PER_ROW - 1 : PER_ROW);
      for (const p of shown) {
        const b = document.createElement('button');
        b.type = 'button';
        // 心情很差的人：头像底下一道红线（该去看看谁）
        b.className = `pxs-btn pxb-tile${ctx.mem(p.id).mood < 33 ? ' low' : ''}`;
        b.dataset.id = p.id;
        b.setAttribute('aria-label', shortName(p));
        b.appendChild(px(headCrop(p.id, p), 1, 'face'));
        tap(b, () => {
          sheet.close();
          ctx.openCard(p.id, ids);
        });
        row.appendChild(b);
      }
      const rest = c.people.length - shown.length;
      if (rest > 0) {
        const m = document.createElement('button');
        m.type = 'button';
        m.className = 'pxs-btn pxb-more';
        m.setAttribute('aria-label', t('more'));
        m.appendChild(px(costChip(null, `+${rest}`)));
        tap(m, () => {
          open.add(c.scene);
          render();
        });
        row.appendChild(m);
      }
      list.appendChild(row);
    }
    const down = document.createElement('div');
    down.className = 'pxb-down pxs-big gone';
    down.appendChild(px(actIcon('down')));
    const upd = () => down.classList.toggle('gone', list.scrollTop + list.clientHeight >= list.scrollHeight - 4);
    list.addEventListener('scroll', upd, { passive: true });
    sheet.body.replaceChildren(head, list, down);
    requestAnimationFrame(upd);
  }

  ctx.onChange(() => {
    if (!sheet.isOpen()) return;
    const g = el.querySelector('.pxb-list');
    const top = g?.scrollTop ?? 0;
    render();
    const g2 = el.querySelector('.pxb-list');
    if (g2) g2.scrollTop = top;
  });

  return {
    open() {
      sheet.open();
      render();
    },
    close() {
      sheet.close();
    },
    isOpen: () => sheet.isOpen(),
    tickClock() {},
  };
}

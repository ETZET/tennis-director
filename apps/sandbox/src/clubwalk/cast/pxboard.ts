// 名册的像素版：一块"今天的人"看板（clubsite/hud 的半屏卡；?hud=old 还是 roster.ts 的全屏表格）。
// 不是表：今天来俱乐部的人一人一个像素头像，看得见的（就在附近）排最前、头像右上一个绿点；没说过话的头像暗一点。
// 没有页签、搜索、字；点一个头像 = 开他的人物卡（卡上能走过去、能互动）。
// 左上探出来一张工牌（同 HUD 的名册图标），旁边点阵数字 = 今天来了几个人 / 就在附近几个。
import type { CastPerson } from '../../clubsite/cast/types';
import { createSheet, glyph, px, t, tap, tinyRow } from '../../clubsite/hud';
import { ICONS } from '../../clubsite/hud/icons';
import { spriteCanvas } from '../../clubsite/hud/sprite';
import type { CastCtx } from './ctx';
import { headCrop, shortName } from './pxcard';
import type { Roster } from './roster';

const CSS = `
.pxs-board { padding-top: calc(var(--s) * 4px); }
.pxb-head { display: flex; align-items: flex-end; gap: calc(var(--s) * 4px); height: 30px; padding-left: 4px; }
.pxb-badge { margin-top: calc(var(--s) * -14px); }
.pxb-count { display: flex; align-items: center; gap: calc(var(--s) * 2px); margin-bottom: 4px; }
.pxb-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(52px, 1fr)); gap: calc(var(--s) * 2px); max-height: min(46vh, 330px); overflow-y: auto; overscroll-behavior: contain;
  padding: calc(var(--s) * 3px) calc(var(--s) * 2px) calc(var(--s) * 2px); margin-top: calc(var(--s) * 3px); touch-action: pan-y; scrollbar-width: none; }
.pxb-grid::-webkit-scrollbar { display: none; }
.pxb-tile { position: relative; min-height: 52px; }
.pxb-tile .face { background: #f0d8a8; box-shadow: 2px 0 0 0 #2c2848, -2px 0 0 0 #2c2848, 0 2px 0 0 #2c2848, 0 -2px 0 0 #2c2848, 0 4px 0 0 #171230; }
.pxb-tile.unmet .face { filter: brightness(0.62) saturate(0.6); }
.pxb-tile .dot { position: absolute; right: 2px; top: 0; }
@media (orientation: landscape) { .pxb-grid { max-height: min(52vh, 330px); } }
`;

/** 绿点（就在附近）：5×5 */
function dotCanvas(): HTMLCanvasElement {
  return spriteCanvas({ rows: ['.PP.', 'PPPp', 'PPpp', '.pp.'] }, 'pxb-dot');
}

export function createPxBoard(ctx: CastCtx): Roster {
  if (!document.getElementById('pxb-css')) {
    const st = document.createElement('style');
    st.id = 'pxb-css';
    st.textContent = CSS;
    document.head.appendChild(st);
  }
  const sheet = createSheet('board');
  const el = sheet.el;
  el.setAttribute('aria-label', t('board'));

  const people = (): CastPerson[] => {
    const s = ctx.state();
    const out: CastPerson[] = [];
    const seen = new Set<string>();
    for (const p of ctx.cast.roster()) {
      if (ctx.bound(p.id) || ctx.cast.where(p.id, s.day).length) {
        out.push(p);
        seen.add(p.id);
      }
    }
    // 场景里看得见的路人（演员表里的生成人物）也算今天的人
    for (const id of Object.keys(s.people)) {
      if (seen.has(id) || !ctx.bound(id)) continue;
      const p = ctx.person(id);
      if (p) out.push(p);
    }
    const rank = (p: CastPerson) => {
      const b = ctx.bound(p.id);
      return b ? b.d2 / 1e6 : 1;
    };
    return out.sort((a, b) => rank(a) - rank(b));
  };

  function render() {
    const list = people();
    const ids = list.map((p) => p.id);
    const nearN = list.filter((p) => ctx.bound(p.id)).length;
    const head = document.createElement('div');
    head.className = 'pxb-head';
    head.appendChild(px(spriteCanvas(ICONS.roster, 'roster', true, 0xfff0c4), 1, 'pxb-badge'));
    const cnt = document.createElement('div');
    cnt.className = 'pxb-count';
    cnt.append(px(tinyRow([String(list.length)]), 2), px(glyph('eye')), px(tinyRow([String(nearN)]), 2));
    head.appendChild(cnt);
    const grid = document.createElement('div');
    grid.className = 'pxb-grid';
    for (const p of list) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `pxs-btn pxb-tile${ctx.mem(p.id).met ? '' : ' unmet'}`;
      b.dataset.id = p.id;
      b.setAttribute('aria-label', shortName(p));
      b.appendChild(px(headCrop(p.id, p), 1, 'face'));
      if (ctx.bound(p.id)) b.appendChild(px(dotCanvas(), 1, 'dot'));
      tap(b, () => {
        sheet.close();
        ctx.openCard(p.id, ids);
      });
      grid.appendChild(b);
    }
    el.replaceChildren(head, grid, sheet.x);
  }

  ctx.onChange(() => {
    if (!sheet.isOpen()) return;
    const g = el.querySelector('.pxb-grid');
    const top = g?.scrollTop ?? 0;
    render();
    const g2 = el.querySelector('.pxb-grid');
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

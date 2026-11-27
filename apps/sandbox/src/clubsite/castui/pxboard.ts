// 名册的像素版：一块"今天的人"看板（clubsite/hud 的半屏卡；?hud=old 还是 roster.ts 的全屏表格）。
// 不是表：今天来俱乐部的人按地点分簇，每簇一行 —— 打头一个地点小图（车 = 停车场、铃 = 前台、喷泉 = 广场……），
// 后面是这儿的人的像素头像（最多 4 个），第 5 格固定放 "+N"（点了这一簇展开）。离总监近的簇在前、簇里近的在前；
// 有人在找你（演员表的 seeking）：他那一簇排最前，他排簇里第一个，头像右上角一个草帽色小点（同 HUD 名册键上的点）。
// 没有页签、搜索、字；点一个头像 = 开他的人物卡（卡上能走过去、能互动）。
import type { CastPerson, SceneId } from '../cast/types';
import { actIcon, costChip, createSheet, hudScale, named, placeIcon, px, type TKey, t, tap } from '../hud';
import { INK, KEYS } from '../hud/colors';
import type { CastCtx } from './ctx';
import { headCrop, shortName } from './pxcard';
import type { Roster } from './roster';

const ink = '#2c2848';
const CSS = `
.pxs-board { padding-top: calc(var(--s) * 3px); }
/* 高度：整张卡不超过屏高 35% */
.pxb-list { max-height: 260px; overflow-y: auto; overscroll-behavior: contain; touch-action: pan-y; scrollbar-width: none;
  display: flex; flex-direction: column; gap: calc(var(--s) * 2px); padding: calc(var(--s) * 1px); }
.pxb-list::-webkit-scrollbar { display: none; }
/* 一行：地点剪影 + 4 个头像 + 第 5 格 "+N"，列对齐（网格） */
.pxb-row { display: grid; grid-template-columns: calc(var(--s) * 30px) repeat(5, minmax(44px, 1fr)); align-items: center; column-gap: calc(var(--s) * 2px); }
.pxb-row .where { display: flex; justify-content: center; }
.pxb-row.open { grid-auto-rows: auto; }
.pxb-row.open > .pxb-tile:nth-child(6n + 7) { grid-column-start: 2; }
.pxb-tile { position: relative; min-width: 44px; min-height: 48px; }
/* 心情很差：头像底下一道短墨线 + 红（不和衣服色混：墨在外） */
.pxb-tile.low::after { content: ''; position: absolute; left: 30%; right: 30%; bottom: 2px; height: 4px; background: #c0545a; box-shadow: 0 0 0 2px ${ink}; }
.pxb-tile .seek { position: absolute; right: 4px; top: 2px; animation: pxb-bob 0.9s steps(2, end) infinite; }
@keyframes pxb-bob { 50% { transform: translateY(-2px); } }
.pxb-more { min-width: 44px; min-height: 48px; }
/* 还能往下滑：卡顶外面的一张小纸条（和右上的关并排），滑到底就收起 */
.pxb-down { position: absolute; right: calc(var(--s) * 34px); top: calc(var(--s) * -22px); width: 52px; height: 52px; justify-content: flex-start !important; pointer-events: none; transition: opacity 0.2s steps(2, end); }
.pxb-down.gone { opacity: 0; }
@media (orientation: landscape) { .pxb-list { max-height: min(62vh, 420px); } }
`;

/** 每簇一行最多几个头像，多的收成 "+N"（点了这一簇展开） */
const PER_ROW = 4;

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
    // 在找你的人：簇里排第一；有这样的人的簇排最前
    const seek = (p: CastPerson) => (ctx.seeking(p.id) ? 0 : 1);
    for (const c of out) c.people.sort((a, b) => seek(a) - seek(b));
    const has = (c: { people: CastPerson[] }) => (c.people.some((p) => ctx.seeking(p.id)) ? 0 : 1);
    return out.sort((a, b) => has(a) - has(b) || a.d - b.d);
  };

  function render() {
    const cs = clusters();
    const ids = cs.flatMap((c) => c.people.map((p) => p.id));
    const list = document.createElement('div');
    list.className = 'pxb-list';
    for (const c of cs) {
      const row = document.createElement('div');
      row.className = 'pxb-row';
      const wh = document.createElement('div');
      wh.className = 'where';
      wh.appendChild(named(px(placeIcon(c.scene), 2), `pl_${c.scene}` as TKey));
      row.appendChild(wh);
      const all = open.has(c.scene);
      const shown = all ? c.people : c.people.slice(0, PER_ROW);
      row.classList.toggle('open', all);
      for (const p of shown) {
        const b = document.createElement('button');
        b.type = 'button';
        // 心情很差的人：头像底下一道红线（该去看看谁）
        b.className = `pxs-btn pxb-tile${ctx.mem(p.id).mood < 33 ? ' low' : ''}`;
        b.dataset.id = p.id;
        b.setAttribute('aria-label', shortName(p));
        b.appendChild(px(headCrop(p.id, p), 1, 'face'));
        if (ctx.seeking(p.id)) b.appendChild(named(px(seekDot(), 1, 'seek'), 'seeking'));
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
    down.className = 'pxb-down pxs-btn gone';
    const dt = document.createElement('div');
    dt.className = 'pxs-tab';
    dt.appendChild(px(actIcon('down')));
    down.appendChild(dt);
    const upd = () => down.classList.toggle('gone', list.scrollTop + list.clientHeight >= list.scrollHeight - 4);
    list.addEventListener('scroll', upd, { passive: true });
    sheet.body.replaceChildren(list, down);
    // 能放几整行（整张卡不超过屏高 35%）：量第一行的真高度，列表高 = 整数行 + 上下留边，不裁半张脸
    requestAnimationFrame(() => {
      const r0 = list.querySelector<HTMLElement>('.pxb-row');
      if (r0) {
        const gap = hudScale() * 2;
        const rh = r0.offsetHeight + gap;
        const n = Math.max(2, Math.min(5, Math.floor((innerHeight * 0.35 - 30) / rh)));
        list.style.maxHeight = `${n * rh - gap + hudScale()}px`;
      }
      upd();
    });
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

/** 草帽色小点（同 HUD 名册键上的"有人在找你"） */
function seekDot(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 5;
  c.height = 5;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = `#${INK.toString(16).padStart(6, '0')}`;
  g.fillRect(1, 0, 3, 5);
  g.fillRect(0, 1, 5, 3);
  g.fillStyle = `#${KEYS.X.toString(16).padStart(6, '0')}`;
  g.fillRect(1, 1, 3, 3);
  return c;
}

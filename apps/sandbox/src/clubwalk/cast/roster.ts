// 名册：HUD 右上"名册"按钮点开的全屏面板（手机竖屏）。顶上时钟、零用钱、"下一天"（demo）；页签 + 搜索；
// 一行一人：像素肖像、名字 + 中文叫法、身份、好感格子、今天在不在（在哪儿）。点一行 → 人物卡片。
import type { CastPerson } from '../../clubsite/cast/types';
import { MEMBERSHIP_NAME, SCENE_NAME } from '../../clubsite/cast/types';
import type { CastCtx } from './ctx';
import { accentMid, portraitURL } from './portrait';
import { ROLE_NAME, TXT } from './text';

type Tab = keyof typeof TXT.tabs;
const TABS: Tab[] = ['all', 'member', 'staff', 'kid', 'today', 'guest'];

export interface Roster {
  open(): void;
  close(): void;
  isOpen(): boolean;
  /** 时钟变了（每游戏分钟） */
  tickClock(): void;
}

export function createRoster(ctx: CastCtx, host: HTMLElement): Roster {
  const ov = document.createElement('div');
  ov.className = 'cast-overlay';
  ov.hidden = true;
  ov.innerHTML = `
    <div class="cast-sheet cast-roster">
      <div class="cast-head">
        <h2>${TXT.rosterTitle}</h2>
        <div class="cast-clock"><b class="ck"></b><span class="mn"></span></div>
        <button type="button" class="cast-pbtn cast-nextday">${TXT.nextDay}</button>
        <button type="button" class="cast-pbtn cast-x" aria-label="${TXT.close}">✕</button>
      </div>
      <div class="cast-tabs">${TABS.map(
        (t) => `<button type="button" class="cast-pbtn cast-tab" data-tab="${t}">${TXT.tabs[t]}</button>`,
      ).join('')}</div>
      <input class="cast-search" type="search" enterkeyhint="search" placeholder="${TXT.search}">
      <div class="cast-count"></div>
      <div class="cast-list"></div>
    </div>`;
  host.appendChild(ov);
  const q = <T extends HTMLElement>(s: string) => ov.querySelector(s) as T;
  const el = {
    ck: q('.ck'),
    mn: q('.mn'),
    next: q<HTMLButtonElement>('.cast-nextday'),
    x: q<HTMLButtonElement>('.cast-x'),
    tabs: q('.cast-tabs'),
    search: q<HTMLInputElement>('.cast-search'),
    count: q('.cast-count'),
    list: q('.cast-list'),
  };

  let tab: Tab = 'all';
  let query = '';
  let ids: string[] = [];

  const people = (): CastPerson[] => {
    const s = ctx.state();
    const base = ctx.cast.roster();
    const inRoster = new Set(base.map((p) => p.id));
    // 见过面的客人（不在名册里的生成人物）
    const guests: CastPerson[] = [];
    for (const [id, m] of Object.entries(s.people)) {
      if (!m.met || inRoster.has(id)) continue;
      const p = ctx.person(id);
      if (p) guests.push(p);
    }
    return [...base, ...guests];
  };
  const presentToday = (p: CastPerson) => !!ctx.bound(p.id) || ctx.cast.where(p.id, ctx.state().day).length > 0;
  const match = (p: CastPerson): boolean => {
    switch (tab) {
      case 'member':
        return p.member.kind !== 'none' && p.member.kind !== 'day' && p.role !== 'kid';
      case 'staff':
        return p.role === 'staff' || p.role === 'coach' || p.role === 'vendor';
      case 'kid':
        return p.role === 'kid' || p.look.body !== 'adult';
      case 'today':
        return presentToday(p);
      case 'guest':
        return p.tier === 'crowd' && ctx.mem(p.id).met;
      default:
        return true;
    }
  };
  const searchHit = (p: CastPerson) => {
    if (!query) return true;
    const hay = `${p.name} ${p.nameZh} ${p.title} ${p.from} ${p.job}`.toLowerCase();
    return query
      .toLowerCase()
      .split(/\s+/)
      .every((w) => hay.includes(w));
  };

  function render() {
    for (const b of el.tabs.querySelectorAll<HTMLButtonElement>('.cast-tab'))
      b.setAttribute('aria-pressed', String(b.dataset.tab === tab));
    const all = people();
    const list = all.filter((p) => match(p) && searchHit(p));
    // 看得见的排最前（近的在前），再是今天在场的，最后今天不在的
    const day = ctx.state().day;
    const rank = (p: CastPerson) => {
      const b = ctx.bound(p.id);
      return b ? Math.min(0.99, b.d2 / 1e5) : ctx.cast.where(p.id, day).length ? 1 : 2;
    };
    list.sort((a, b) => rank(a) - rank(b));
    ids = list.map((p) => p.id);
    const met = all.filter((p) => ctx.mem(p.id).met).length;
    el.count.textContent = TXT.count(list.length, met);
    const frag = document.createDocumentFragment();
    for (const p of list) frag.appendChild(row(p));
    el.list.replaceChildren(frag);
    if (!list.length) {
      const e = document.createElement('div');
      e.className = 'cast-empty';
      e.textContent = TXT.empty;
      el.list.appendChild(e);
    }
    tickClock();
  }

  function row(p: CastPerson): HTMLElement {
    const m = ctx.mem(p.id);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cast-row';
    b.dataset.id = p.id;
    const bar = document.createElement('div');
    bar.className = 'bar';
    bar.style.background = accentMid(p.look);
    const img = new Image(64, 64);
    img.className = 'cast-px pic';
    img.alt = '';
    img.src = portraitURL(p.id, p.look, p.age);
    const txt = document.createElement('div');
    txt.className = 'txt';
    const nm = document.createElement('div');
    nm.className = 'nm';
    nm.textContent = p.name;
    const zh = document.createElement('small');
    zh.textContent = p.nameZh;
    nm.appendChild(zh);
    const ti = document.createElement('div');
    ti.className = 'ti';
    const title = p.title || ROLE_NAME[p.role];
    const mn = p.member.kind !== 'none' && p.member.kind !== 'day' ? MEMBERSHIP_NAME[p.member.kind] : '';
    // 熟面孔的身份常常就是会籍（"月卡会员"）：一样就不重复
    ti.textContent = mn && !title.includes(mn) ? `${title} · ${mn}` : title;
    const wh = document.createElement('div');
    wh.className = 'wh';
    const bd = ctx.bound(p.id);
    const homes = ctx.cast.where(p.id, ctx.state().day);
    if (bd) {
      wh.textContent = `● ${SCENE_NAME[bd.scene]}`;
      wh.classList.add('on');
    } else if (homes.length) {
      wh.textContent = `${TXT.here} · ${[...new Set(homes.map((h) => SCENE_NAME[h.scene]))].join('、')}`;
      wh.classList.add('on');
    } else wh.textContent = TXT.notToday;
    txt.append(nm, ti, wh);
    const side = document.createElement('div');
    side.className = 'side';
    side.appendChild(favorCells(m.favor));
    if (!m.met) {
      const n = document.createElement('span');
      n.className = 'new';
      n.textContent = TXT.unmet;
      side.appendChild(n);
    }
    b.append(bar, img, txt, side);
    return b;
  }

  el.list.addEventListener('click', (e) => {
    const r = (e.target as HTMLElement).closest<HTMLElement>('.cast-row');
    if (r?.dataset.id) ctx.openCard(r.dataset.id, ids);
  });
  el.tabs.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('.cast-tab');
    if (!b?.dataset.tab) return;
    tab = b.dataset.tab as Tab;
    render();
    el.list.scrollTop = 0;
  });
  el.search.addEventListener('input', () => {
    query = el.search.value.trim();
    render();
  });
  el.x.addEventListener('click', () => api.close());
  el.next.addEventListener('click', () => ctx.nextDay());
  ctx.onChange(() => {
    if (ov.hidden) return;
    const top = el.list.scrollTop;
    render();
    el.list.scrollTop = top;
  });

  function tickClock() {
    if (ov.hidden) return;
    el.ck.textContent = ctx.clock();
    el.mn.textContent = TXT.money(ctx.state().money);
  }

  const api: Roster = {
    open() {
      ov.hidden = false;
      render();
    },
    close() {
      ov.hidden = true;
      el.search.blur();
    },
    isOpen: () => !ov.hidden,
    tickClock,
  };
  return api;
}

/** 好感 0..10 → 10 格 */
export function favorCells(f: number, big = false): HTMLElement {
  const d = document.createElement('div');
  d.className = big ? 'cast-favor big' : 'cast-favor';
  setFavorCells(d, f);
  return d;
}
export function setFavorCells(d: HTMLElement, f: number) {
  while (d.children.length < 10) d.appendChild(document.createElement('i'));
  for (let i = 0; i < 10; i++) {
    const c = d.children[i] as HTMLElement;
    const v = f - i;
    c.className = v >= 0.75 ? 'on' : v >= 0.25 ? 'half' : '';
  }
  d.title = f.toFixed(1);
}

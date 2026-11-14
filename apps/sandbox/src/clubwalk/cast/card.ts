// 人物卡片：大像素肖像、身份、属性、特质、喜好、故事、牵连（点了跳到那个人）、每周什么时候来、现在在哪儿干什么 + 在想什么、
// 好感和心情、最近的记忆；底部互动按钮（actionsFor，写着代价）。不当面时当面的动作变成"走过去"（到了自动打开，当面）。
// 没见过面的人：只给外观、身份和"还没说过话"，属性、故事打问号 —— 聊过一次以后解开。◀ ▶ 或左右滑切人。
import { actionsFor } from '../../clubsite/cast';
import { TRAITS } from '../../clubsite/cast/traits';
import type { ActionDef, ActResult, CastPerson } from '../../clubsite/cast/types';
import { ATTR_NAMES, MEMBERSHIP_NAME, SCENE_NAME } from '../../clubsite/cast/types';
import type { CastCtx } from './ctx';
import { accentDark, accentLight, isLight, portraitURL } from './portrait';
import { favorCells } from './roster';
import { daysText, hoursText, ROLE_NAME, TIE_NAME, TXT } from './text';

export interface Card {
  open(id: string, list?: string[]): void;
  close(): void;
  isOpen(): boolean;
  /** 每 0.5 秒：当面不当面变了 → 换按钮；"现在"那一段刷新 */
  tickNear(): void;
}

export function createCard(ctx: CastCtx, host: HTMLElement): Card {
  const ov = document.createElement('div');
  ov.className = 'cast-overlay';
  ov.hidden = true;
  ov.innerHTML = `
    <div class="cast-sheet cast-card">
      <div class="cast-head">
        <button type="button" class="cast-pbtn cast-nav prev" aria-label="${TXT.prev}">◀</button>
        <h2></h2>
        <button type="button" class="cast-pbtn cast-nav next" aria-label="${TXT.next}">▶</button>
        <button type="button" class="cast-pbtn cast-x" aria-label="${TXT.close}">✕</button>
      </div>
      <div class="cast-body"></div>
      <div class="cast-acts"></div>
    </div>`;
  host.appendChild(ov);
  const q = <T extends HTMLElement>(s: string) => ov.querySelector(s) as T;
  const el = {
    title: q('h2'),
    prev: q<HTMLButtonElement>('.prev'),
    next: q<HTMLButtonElement>('.next'),
    x: q<HTMLButtonElement>('.cast-x'),
    body: q('.cast-body'),
    acts: q('.cast-acts'),
  };

  let id = '';
  let list: string[] = [];
  let near = false;
  let openTrait = '';
  let result: { id: string; r: ActResult } | null = null;
  let favorShown = -1;

  function nav(d: number) {
    const i = list.indexOf(id);
    if (i < 0 || list.length < 2) return;
    const j = (i + d + list.length) % list.length;
    show(list[j], true);
  }

  function show(nid: string, resetScroll: boolean) {
    if (nid !== id) {
      openTrait = '';
      result = null;
      favorShown = -1;
    }
    id = nid;
    render();
    if (resetScroll) el.body.scrollTop = 0;
  }

  function render() {
    const p = ctx.person(id);
    if (!p) return;
    const m = ctx.mem(id);
    near = ctx.near(id);
    el.title.textContent = p.name;
    el.prev.disabled = el.next.disabled = list.length < 2;
    const top = el.body.scrollTop;
    el.body.replaceChildren(hero(p), ...sections(p, m.met));
    el.body.scrollTop = top;
    renderActs(p);
    // 好感变了：飘一个 +0.8 ♥
    if (favorShown >= 0 && Math.abs(m.favor - favorShown) > 0.01) floatDelta(m.favor - favorShown);
    favorShown = m.favor;
  }

  function hero(p: CastPerson): HTMLElement {
    const m = ctx.mem(p.id);
    const d = div('cast-hero');
    const img = new Image(128, 128);
    img.className = 'cast-px pic';
    img.alt = '';
    img.src = portraitURL(p.id, p.look, p.age);
    img.style.background = accentDark(p.look);
    const idb = div('id');
    const nm = div('nm', p.name);
    const zh = div('zh', p.nameZh);
    const ti = div('ti', `${p.title || ROLE_NAME[p.role]}`);
    ti.style.background = accentLight(p.look);
    ti.style.color = isLight(p.look) ? '#2c2450' : '#fff3d6';
    idb.append(nm, zh, ti);
    if (m.met) {
      idb.append(div('ln', `${TXT.age(p.age)} · ${p.from}`), div('ln', p.job));
      const mk =
        p.member.kind === 'none'
          ? ROLE_NAME[p.role]
          : `${MEMBERSHIP_NAME[p.member.kind]}${p.member.since ? ` · ${TXT.since(p.member.since)}` : ''}`;
      idb.append(div('ln', mk));
    } else {
      idb.append(div('ln', ROLE_NAME[p.role]));
    }
    d.append(img, idb);
    return d;
  }

  function sections(p: CastPerson, met: boolean): HTMLElement[] {
    const m = ctx.mem(p.id);
    const out: HTMLElement[] = [];
    // 现在
    {
      const s = sec(TXT.sec.now);
      s.appendChild(nowBox());
      out.push(s);
    }
    if (!met) {
      const u = div('cast-unmet');
      u.append(el2('b', TXT.unmet), el2('span', TXT.unmetHint));
      out.push(u);
    }
    // 好感、心情
    {
      const s = sec(`${TXT.sec.favor} · ${TXT.sec.mood}`);
      const g = div('cast-meters');
      g.style.position = 'relative';
      const fc = favorCells(m.favor, true);
      fc.classList.add('fv');
      g.append(el2('span', TXT.sec.favor), fc, el2('em', m.favor.toFixed(1)));
      g.append(el2('span', TXT.sec.mood), meter(m.mood, 'mood'), el2('em', String(Math.round(m.mood))));
      s.appendChild(g);
      out.push(s);
    }
    // 属性
    {
      const s = sec(TXT.sec.attrs);
      const g = div('cast-meters');
      g.append(el2('span', TXT.ntrp), meter(met ? ((p.attrs.ntrp - 1) / 6) * 100 : 0, 'attr'));
      g.append(el2('em', met ? p.attrs.ntrp.toFixed(1) : TXT.unknown));
      for (const k of Object.keys(ATTR_NAMES) as (keyof typeof ATTR_NAMES)[]) {
        g.append(
          el2('span', ATTR_NAMES[k]),
          meter(met ? p.attrs[k] : 0, 'attr'),
          el2('em', met ? String(p.attrs[k]) : TXT.unknown),
        );
      }
      s.appendChild(g);
      out.push(s);
    }
    // 性子
    {
      const s = sec(TXT.sec.traits);
      const c = div('cast-chips');
      if (met) {
        for (const tid of p.traits) {
          const t = TRAITS[tid];
          if (!t) continue;
          const b = document.createElement('button');
          b.type = 'button';
          b.className = `cast-pbtn cast-chip${t.bad ? ' bad' : ''}`;
          b.textContent = t.name;
          b.dataset.trait = tid;
          b.setAttribute('aria-pressed', String(openTrait === tid));
          c.appendChild(b);
        }
      } else c.appendChild(q3());
      s.appendChild(c);
      if (met && openTrait && TRAITS[openTrait]) s.appendChild(div('cast-note', TRAITS[openTrait].note));
      out.push(s);
    }
    if (met) {
      // 喜欢 / 讨厌
      const s = sec(`${TXT.sec.likes} / ${TXT.sec.dislikes}`);
      s.appendChild(para(`♥ ${p.likes.join('、') || '—'}`));
      s.appendChild(para(`✕ ${p.dislikes.join('、') || '—'}`));
      out.push(s);
      const b = sec(TXT.sec.bio);
      b.appendChild(para(p.bio));
      out.push(b);
      if (p.quirk) {
        const qk = sec(TXT.sec.quirk);
        qk.appendChild(para(p.quirk));
        out.push(qk);
      }
    } else {
      const b = sec(TXT.sec.bio);
      b.appendChild(q3());
      out.push(b);
    }
    // 牵连
    if (p.ties.length) {
      const s = sec(TXT.sec.ties);
      const box = div('cast-ties');
      if (met) {
        for (const t of p.ties) {
          const o = ctx.person(t.with);
          if (!o) continue;
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'cast-tie';
          b.dataset.to = o.id;
          const img = new Image(32, 32);
          img.className = 'cast-px pic';
          img.alt = '';
          img.src = portraitURL(o.id, o.look, o.age);
          const tx = div('tx');
          tx.append(el2('b', `${o.name}  ${o.nameZh}`), el2('small', t.note));
          b.append(img, tx, div('k', TIE_NAME[t.kind]), div('go', '▶'));
          box.appendChild(b);
        }
      } else box.appendChild(q3());
      s.appendChild(box);
      out.push(s);
    }
    // 什么时候来
    {
      const s = sec(TXT.sec.week);
      const w = p.week;
      s.appendChild(
        para(
          w
            ? `${w.days.length === 7 ? TXT.daily : daysText(w.days)} · ${hoursText(w.hours)}`
            : p.tier === 'crowd'
              ? '偶尔来'
              : TXT.everyday,
        ),
      );
      out.push(s);
    }
    // 最近
    {
      const s = sec(TXT.sec.memory);
      const box = div('cast-mem');
      const mem = m.memory.slice(-6).reverse();
      if (!mem.length) box.appendChild(el2('div', TXT.noMemory));
      for (const e of mem) {
        const r = document.createElement('div');
        const t = document.createElement('time');
        t.textContent = `${TXT.memDay(e.day)} ${fmtMin(e.minute)}`;
        const tx = el2('span', e.text);
        if (e.favor > 0) tx.className = 'up';
        r.append(t, tx);
        box.appendChild(r);
      }
      s.appendChild(box);
      out.push(s);
    }
    return out;
  }

  function nowBox(): HTMLElement {
    const n = ctx.nowOf(id);
    const box = div('cast-now');
    const wh = div('wh', n.text);
    if (!n.here) wh.classList.add('off');
    box.appendChild(wh);
    if (n.thought) box.appendChild(div('th', `${TXT.thinking}「${n.thought}」`));
    return box;
  }

  function renderActs(p: CastPerson) {
    const n = ctx.nowOf(p.id);
    const defs: ActionDef[] = actionsFor(p, { near, activity: n.activity, scene: n.scene }, ctx.mem(p.id));
    const frag = document.createDocumentFragment();
    const bound = !!ctx.bound(p.id);
    let walk = false;
    for (const a of defs) {
      if (a.inPerson && !near) {
        if (walk) continue;
        walk = true;
        const where = n.here && n.scene ? SCENE_NAME[n.scene] : '';
        const b = actBtn(TXT.walkOver, bound ? TXT.walkOverCost : where ? TXT.findAt(where) : TXT.absent, 'walk');
        b.classList.add('walk');
        b.disabled = !bound && !where;
        frag.appendChild(b);
        continue;
      }
      frag.appendChild(actBtn(a.label, a.cost, a.id));
    }
    const r = div('cast-result');
    if (result && result.id === p.id) {
      r.textContent = result.r.ok ? result.r.note : (result.r.reason ?? result.r.note);
      r.classList.toggle('bad', !result.r.ok);
    }
    frag.appendChild(r);
    el.acts.replaceChildren(frag);
  }

  function actBtn(label: string, cost: string, act: string): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cast-pbtn cast-act';
    b.dataset.act = act;
    b.append(el2('b', label), el2('small', cost));
    return b;
  }

  function floatDelta(d: number) {
    const fv = el.body.querySelector('.cast-meters');
    if (!fv) return;
    const f = div(`cast-delta${d < 0 ? ' neg' : ''}`, TXT.favorDelta(d));
    f.style.top = '-20px';
    fv.appendChild(f);
  }

  // ── 事件 ──
  el.x.addEventListener('click', () => api.close());
  el.prev.addEventListener('click', () => nav(-1));
  el.next.addEventListener('click', () => nav(1));
  el.body.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const chip = t.closest<HTMLElement>('.cast-chip');
    if (chip?.dataset.trait) {
      openTrait = openTrait === chip.dataset.trait ? '' : chip.dataset.trait;
      render();
      return;
    }
    const tie = t.closest<HTMLElement>('.cast-tie');
    if (tie?.dataset.to) {
      const to = tie.dataset.to;
      if (!list.includes(to)) {
        const p = ctx.person(id);
        list = [id, ...(p?.ties.map((x) => x.with) ?? [])].filter((x, i, a) => a.indexOf(x) === i && ctx.person(x));
      }
      show(to, true);
    }
  });
  el.acts.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.cast-act');
    if (!b || b.disabled || !b.dataset.act) return;
    if (b.dataset.act === 'walk') {
      ctx.walkTo(id);
      return;
    }
    acting = true;
    const r = ctx.doAct(id, b.dataset.act as ActionDef['id']);
    acting = false;
    result = { id, r };
    render();
  });
  // 左右滑切人
  let sw: { x: number; y: number; id: number } | null = null;
  el.body.addEventListener('pointerdown', (e) => {
    sw = { x: e.clientX, y: e.clientY, id: e.pointerId };
  });
  el.body.addEventListener('pointerup', (e) => {
    if (!sw || sw.id !== e.pointerId) return;
    const dx = e.clientX - sw.x;
    const dy = e.clientY - sw.y;
    sw = null;
    if (Math.abs(dx) > 70 && Math.abs(dy) < 40) nav(dx < 0 ? 1 : -1);
  });
  el.body.addEventListener('pointercancel', () => {
    sw = null;
  });
  let acting = false;
  ctx.onChange(() => {
    if (!ov.hidden && !acting) render();
  });

  const api: Card = {
    open(nid, l) {
      if (l?.includes(nid)) list = l;
      else if (!list.includes(nid)) list = [nid];
      ov.hidden = false;
      show(nid, true);
    },
    close() {
      ov.hidden = true;
    },
    isOpen: () => !ov.hidden,
    tickNear() {
      if (ov.hidden || !id) return;
      const p = ctx.person(id);
      if (!p) return;
      const nn = ctx.near(id);
      if (nn !== near) {
        near = nn;
        renderActs(p);
      }
      const now = el.body.querySelector('.cast-now');
      if (now) now.replaceWith(nowBox());
    },
  };
  return api;
}

// ── 小工具 ──
function div(cls: string, text?: string): HTMLDivElement {
  const d = document.createElement('div');
  d.className = cls;
  if (text !== undefined) d.textContent = text;
  return d;
}
function el2<K extends keyof HTMLElementTagNameMap>(tag: K, text: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.textContent = text;
  return e;
}
function sec(title: string): HTMLElement {
  const s = document.createElement('section');
  s.className = 'cast-sec';
  s.appendChild(el2('h3', title));
  return s;
}
function para(t: string): HTMLElement {
  const p = el2('p', t);
  p.className = 'cast-p';
  return p;
}
function q3(): HTMLElement {
  const p = el2('p', '？ ？ ？');
  p.className = 'cast-p cast-q';
  return p;
}
function meter(v: number, kind: string): HTMLElement {
  const d = div(`cast-meter ${kind}`);
  const i = document.createElement('i');
  i.style.width = `${Math.max(0, Math.min(100, v)).toFixed(0)}%`;
  d.appendChild(i);
  return d;
}
const fmtMin = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;

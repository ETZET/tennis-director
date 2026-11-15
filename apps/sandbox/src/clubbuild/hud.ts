// clubbuild 的界面（DOM，#hud）：上面一条（钱、第几天 + 时钟、★ 星级进度、速度）、下面拇指区（建造 / 拆除 / 全图，
// 建造托盘：分类页签 + 设施卡片；摆放中：旋转 / 取消 / 建造）、飘字（"+$40"、"+组合"、"没有路"）、组合大横幅、
// 卡片（收盘、升星、星级清单）。界面只发意图（回调），不碰模拟；文字是 sandbox 调试文字，不走 i18n。
// 样式按字符串引进来、自己插进 <head>：打成单文件页面（pixel-scene 的 single-file.sh 只内联 JS）时样式也跟着走
import HUD_CSS from './hud.css?inline';

if (!document.getElementById('clubbuild-hud-css')) {
  const st = document.createElement('style');
  st.id = 'clubbuild-hud-css';
  st.textContent = HUD_CSS;
  document.head.appendChild(st);
}

import type * as THREE from 'three';
import { BUILDINGS, type BuildingDef, BY_ID, type Category, STAR_GOALS } from './catalog';
import { hourOf, type SimEvent, type State, starProgress, visitorsPerDay } from './sim';

export type Mode = 'idle' | 'tray' | 'place' | 'path' | 'remove';
export type Speed = 0 | 1 | 2;

export interface HudCallbacks {
  build(): void;
  remove(): void;
  fit(): void;
  closeTray(): void;
  tab(cat: Category): void;
  card(id: string): void;
  rotate(): void;
  cancel(): void;
  confirm(): void;
  done(): void;
  speed(s: Speed): void;
}

export const TABS: { cat: Category; name: string }[] = [
  { cat: 'court', name: '球场' },
  { cat: 'facility', name: '设施' },
  { cat: 'deco', name: '装饰' },
  { cat: 'road', name: '步道' },
];

const CAT_COLOR: Record<Category, string> = {
  court: '#5aa0d8',
  facility: '#e88a4a',
  deco: '#6cc070',
  road: '#d8a070',
};

interface Float {
  el: HTMLDivElement;
  p: THREE.Vector3;
  t: number;
  life: number;
  rise: number;
}

export type Project = (p: THREE.Vector3) => { x: number; y: number } | null;

const money = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(Math.round(n)).toLocaleString('en-US')}`;
const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] ?? c);

export class Hud {
  private top: HTMLDivElement;
  private bottom: HTMLDivElement;
  private float: HTMLDivElement;
  private modal: HTMLDivElement;
  private floats: Float[] = [];
  private tags = new Map<string, HTMLDivElement>();
  private el: Record<string, HTMLElement> = {};
  private mode: Mode | null = null;
  private cardsKey = '';
  private cat: Category = 'court';
  private sel: string | null = null;
  private bannerEl: HTMLDivElement | null = null;
  private bannerT = 0;
  /** 卡片开着（收盘 / 升星）：游戏暂停 */
  modalOpen = false;
  private queue: (() => void)[] = [];

  constructor(
    root: HTMLElement,
    private cb: HudCallbacks,
    private project: Project,
  ) {
    root.innerHTML = '';
    this.float = div('cb-float');
    this.top = div('cb-top');
    this.bottom = div('cb-bottom');
    this.modal = div('cb-modal');
    this.modal.hidden = true;
    root.append(this.float, this.top, this.bottom, this.modal);
    this.top.innerHTML = `
      <div class="cb-row">
        <div class="cb-chip cb-panel cb-money" data-k="money"></div>
        <div class="cb-chip cb-panel cb-clock"><span data-k="clock"></span><div class="cb-bar"><i data-k="dayBar"></i></div></div>
        <button class="cb-star" data-k="star" type="button"></button>
      </div>
      <div class="cb-row cb-row2">
        <div class="cb-ticker" data-k="ticker"></div>
        <div class="cb-speed" data-k="speed">
          <button type="button" data-s="0">暂停</button><button type="button" data-s="1">1×</button><button type="button" data-s="2">2×</button>
        </div>
      </div>`;
    for (const e of this.top.querySelectorAll<HTMLElement>('[data-k]')) this.el[e.dataset.k as string] = e;
    for (const b of this.top.querySelectorAll<HTMLButtonElement>('[data-s]'))
      b.addEventListener('click', () => this.cb.speed(Number(b.dataset.s) as Speed));
    this.el.star.addEventListener('click', () => this.starCard(this.lastState));
  }

  private lastState!: State;

  // ── 上面一条 ──────────────────────────────────────────
  setTop(s: State, speed: Speed) {
    this.lastState = s;
    const m = this.el.money;
    setHtml(m, `${money(s.money)}<small>今天 +${money(s.today.income)} · ${s.today.visitors} 位</small>`);
    m.classList.toggle('neg', s.money < 0);
    const h = hourOf(s.time);
    const hh = Math.floor(h);
    const mm = Math.floor((h - hh) * 6) * 10;
    const clock = `第 ${s.day} 天 · ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    if (this.el.clock.textContent !== clock) this.el.clock.textContent = clock;
    this.el.dayBar.style.width = `${(s.time * 100).toFixed(1)}%`;
    const sp = starProgress(s);
    const k = sp ? sp.items.filter((i) => i.done).length / sp.items.length : 1;
    setHtml(
      this.el.star,
      `<span>★${s.star}${sp ? ` <small>→ ★${sp.goal.star}</small>` : ' <small>满星</small>'}</span><div class="cb-bar"><i style="width:${(k * 100).toFixed(0)}%"></i></div>`,
    );
    for (const b of this.top.querySelectorAll<HTMLButtonElement>('[data-s]'))
      b.setAttribute('aria-pressed', String(Number(b.dataset.s) === speed));
    const last = s.log[s.log.length - 1];
    const tk = last ? last.text : '';
    if (this.el.ticker.textContent !== tk) this.el.ticker.textContent = tk;
  }

  // ── 下面：按模式换 ──────────────────────────────────────
  setMode(mode: Mode, s: State) {
    if (mode === this.mode) {
      if (mode === 'tray') this.renderCards(s);
      return;
    }
    this.mode = mode;
    this.cardsKey = '';
    const b = this.bottom;
    b.innerHTML = '';
    const hint = div('cb-hint');
    hint.dataset.k = 'hint';
    this.el.hint = hint;
    if (mode === 'idle') {
      const row = div('cb-actions');
      row.append(
        btn('建造', () => this.cb.build(), 'big'),
        btn('拆除', () => this.cb.remove()),
        btn('回到全图', () => this.cb.fit()),
      );
      b.append(hint, row);
    } else if (mode === 'tray') {
      const tray = div('cb-tray cb-panel');
      const tabs = div('cb-tabs');
      for (const t of TABS) {
        const x = btn(t.name, () => this.cb.tab(t.cat));
        x.dataset.cat = t.cat;
        tabs.append(x);
      }
      const x = btn('✕', () => this.cb.closeTray(), 'x');
      x.setAttribute('aria-label', '关上');
      tabs.append(x);
      const cards = div('cb-cards');
      this.el.cards = cards;
      tray.append(tabs, cards);
      b.append(hint, tray);
      this.renderCards(s);
    } else if (mode === 'place') {
      const row = div('cb-place');
      const ok = btn('✓ 建造', () => this.cb.confirm(), 'grow go');
      this.el.ok = ok;
      row.append(
        btn('旋转', () => this.cb.rotate()),
        btn('✕ 取消', () => this.cb.cancel()),
        ok,
      );
      b.append(hint, row);
    } else if (mode === 'path' || mode === 'remove') {
      const row = div('cb-place');
      if (mode === 'remove') {
        const ok = btn('拆除', () => this.cb.confirm(), 'grow warn');
        ok.disabled = true;
        this.el.ok = ok;
        row.append(ok);
      }
      row.append(btn('完成', () => this.cb.done(), mode === 'path' ? 'grow' : ''));
      b.append(hint, row);
    }
  }

  setTab(cat: Category, sel: string | null) {
    this.cat = cat;
    this.sel = sel;
    this.cardsKey = '';
  }

  private renderCards(s: State) {
    const cards = this.el.cards;
    if (!cards) return;
    const key = `${this.cat}|${this.sel}|${s.star}|${BUILDINGS.filter((d) => d.cat === this.cat)
      .map((d) => (s.money >= d.cost ? 1 : 0))
      .join('')}`;
    if (key === this.cardsKey) return;
    this.cardsKey = key;
    for (const t of this.bottom.querySelectorAll<HTMLButtonElement>('[data-cat]'))
      t.setAttribute('aria-pressed', String(t.dataset.cat === this.cat));
    cards.innerHTML = '';
    // 解锁了的排前面（同一组里按价钱）
    const list = BUILDINGS.filter((x) => x.cat === this.cat).sort(
      (a, b) => Number(a.star > s.star) - Number(b.star > s.star) || a.star - b.star,
    );
    for (const d of list) {
      const c = document.createElement('button');
      c.type = 'button';
      c.className = `cb-card${d.id === this.sel ? ' sel' : ''}`;
      c.dataset.id = d.id;
      const locked = d.star > s.star;
      c.innerHTML = `<span class="nm">${esc(d.name)}</span>${shape(d)}<span class="fp">${d.w}×${d.d} 格${d.spend ? ` · $${d.spend}/位` : d.appeal ? ` · 吸引 +${d.appeal}` : ''}</span><span class="cost${s.money < d.cost ? ' poor' : ''}">${money(d.cost)}${d.cat === 'road' ? '/格' : ''}</span>${locked ? `<span class="lock">★${d.star}<small>升星解锁</small></span>` : ''}`;
      c.disabled = locked;
      c.addEventListener('click', () => this.cb.card(d.id));
      cards.append(c);
    }
  }

  hint(html: string) {
    if (this.el.hint && this.el.hint.innerHTML !== html) this.el.hint.innerHTML = html;
  }

  setOk(enabled: boolean, label?: string) {
    const ok = this.el.ok as HTMLButtonElement | undefined;
    if (!ok) return;
    ok.disabled = !enabled;
    if (label !== undefined && ok.textContent !== label) ok.textContent = label;
  }

  // ── 飘字 ──────────────────────────────────────────────
  floatText(p: THREE.Vector3, text: string, cls: string, life = 1.3, rise = 36) {
    if (this.floats.length > 28) this.floats.shift()?.el.remove();
    const el = div(`cb-f ${cls}`);
    el.textContent = text;
    this.float.append(el);
    this.floats.push({ el, p: p.clone(), t: 0, life, rise });
  }

  /** 每帧：飘字往上飘、淡出，跟着镜头 */
  frame(dt: number) {
    for (const f of this.floats) {
      f.t += dt;
      const s = this.project(f.p);
      const k = f.t / f.life;
      if (!s || k >= 1) {
        f.el.style.opacity = '0';
        continue;
      }
      // 一纹素一纹素地往上（像素感）：按 2 像素取整
      const y = s.y - Math.round((f.rise * Math.min(1, k * 1.6)) / 2) * 2;
      f.el.style.transform = `translate(${s.x.toFixed(0)}px, ${y.toFixed(0)}px) translate(-50%, -100%)`;
      f.el.style.opacity = k > 0.7 ? String(1 - (k - 0.7) / 0.3) : '1';
    }
    for (const f of this.floats) if (f.t >= f.life) f.el.remove();
    this.floats = this.floats.filter((f) => f.t < f.life);
    if (this.bannerEl) {
      this.bannerT -= dt;
      if (this.bannerT < 0.3 && !this.bannerEl.classList.contains('out')) this.bannerEl.classList.add('out');
      if (this.bannerT <= 0) {
        this.bannerEl.remove();
        this.bannerEl = null;
      }
    }
  }

  /** 常驻的头顶标签（没有路、组合预览）：每帧给全量，没给的藏掉 */
  setTags(list: { key: string; p: THREE.Vector3; text: string; cls: string }[]) {
    const seen = new Set<string>();
    for (const t of list) {
      seen.add(t.key);
      let el = this.tags.get(t.key);
      if (!el) {
        el = div(`cb-f tag ${t.cls}`);
        this.float.append(el);
        this.tags.set(t.key, el);
      }
      if (el.textContent !== t.text) el.textContent = t.text;
      const s = this.project(t.p);
      el.style.display = s ? '' : 'none';
      if (s) el.style.transform = `translate(${s.x.toFixed(0)}px, ${s.y.toFixed(0)}px) translate(-50%, -100%)`;
    }
    for (const [k, el] of this.tags)
      if (!seen.has(k)) {
        el.remove();
        this.tags.delete(k);
      }
  }

  /** 开罗式组合大横幅 */
  banner(title: string, sub: string) {
    this.bannerEl?.remove();
    const el = div('cb-banner');
    el.innerHTML = `<b>${esc(title)}</b><small>${esc(sub)}</small>`;
    this.float.append(el);
    this.bannerEl = el;
    this.bannerT = 2.6;
  }

  // ── 卡片 ──────────────────────────────────────────────
  private open(html: string, onClose?: () => void, label = '好的') {
    const show = () => {
      this.modalOpen = true;
      this.modal.hidden = false;
      this.modal.innerHTML = '';
      const card = div('cb-card-big');
      card.innerHTML = html;
      const ok = btn(label, () => {
        this.modal.hidden = true;
        this.modalOpen = false;
        onClose?.();
        const next = this.queue.shift();
        if (next) next();
      });
      card.append(ok);
      this.modal.append(card);
    };
    if (this.modalOpen) this.queue.push(show);
    else show();
  }

  settlement(e: Extract<SimEvent, { type: 'daySettled' }>, s: State) {
    const net = e.net;
    this.open(
      `<h2>第 ${e.day} 天 收盘</h2>
      <div class="cb-lines">
        <span>客人</span><span>${e.visitors} 位${e.turnedAway ? `（走掉 ${e.turnedAway}）` : ''}</span>
        <span>收入</span><span class="pos">+${money(e.income)}</span>
        <span>维护费</span><span class="neg">-${money(e.upkeep)}</span>
        <span class="sum">今天</span><span class="sum ${net >= 0 ? 'pos' : 'neg'}">${net >= 0 ? '+' : ''}${money(net)}</span>
        <span>手上</span><span>${money(s.money)}</span>
      </div>
      <div class="cb-why-t">为什么</div>
      <ul class="cb-why">${e.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
      <div class="cb-sub">明天预计 ${visitorsPerDay(s)} 位客人</div>`,
      undefined,
      `开始第 ${e.day + 1} 天`,
    );
  }

  starUp(e: Extract<SimEvent, { type: 'starUp' }>, onGo?: () => void) {
    this.open(
      `<h2 class="star">★${e.star} 升星！</h2>
      <div class="cb-sub">俱乐部名气更大了，解锁了新设施</div>
      <div class="cb-unlock">${e.unlocked
        .map((id) => BY_ID[id])
        .map((d) => `<span>${esc(d.name)}<small>${money(d.cost)}</small></span>`)
        .join('')}</div>`,
      onGo,
      '去建造',
    );
  }

  starCard(s: State) {
    if (!s) return;
    const sp = starProgress(s);
    if (!sp) {
      this.open(`<h2 class="star">★${s.star} 满星</h2><div class="cb-sub">所有设施都解锁了</div>`);
      return;
    }
    const next = BUILDINGS.filter((b) => b.star === sp.goal.star).map((b) => b.name);
    this.open(
      `<h2>★${sp.goal.star} 的目标</h2>
      ${sp.items
        .map(
          (i) =>
            `<div class="cb-goal"><span>${i.done ? '✓' : '·'}</span><span>${esc(i.label)}</span><span>${i.key === 'money' ? `${money(i.have)} / ${money(i.need)}` : `${i.have} / ${i.need}`}</span><div class="meter"><i style="width:${Math.min(100, (i.have / i.need) * 100).toFixed(0)}%"></i></div></div>`,
        )
        .join('')}
      <div class="cb-sub">每天收盘时检查 · 解锁：${esc(next.join('、'))}</div>
      <div class="cb-sub">${STAR_GOALS.length} 颗星封顶</div>`,
    );
  }
}

/** 内容变了才写（每帧调，省得 DOM 一直重排） */
const lastHtml = new WeakMap<HTMLElement, string>();
function setHtml(el: HTMLElement, html: string) {
  if (lastHtml.get(el) === html) return;
  lastHtml.set(el, html);
  el.innerHTML = html;
}

function div(cls: string): HTMLDivElement {
  const d = document.createElement('div');
  d.className = cls;
  return d;
}

function btn(text: string, on: () => void, cls = ''): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = text;
  if (cls) b.className = cls;
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    on();
  });
  return b;
}

/** 卡片上的占地小图（一格一个小方块） */
function shape(d: BuildingDef): string {
  const sc = Math.max(d.w, d.d) > 8 ? 2 : 1;
  const w = Math.ceil(d.w / sc);
  const h = Math.ceil(d.d / sc);
  const cells = Array.from({ length: w * h }, () => `<i style="background:${CAT_COLOR[d.cat]}"></i>`).join('');
  return `<span class="shape" style="grid-template-columns:repeat(${w},5px)">${cells}</span>`;
}

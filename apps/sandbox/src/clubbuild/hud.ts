// clubbuild 的界面（DOM，#hud）。手机竖屏优先（390×844），横屏（≥700 宽）换成右侧栏：
//
//   竖屏                                         横屏（1280×720）
//   ┌ .cb-top 一行 48 px：钱 | 第 N 天 时钟 | ★ ┐   ┌ .cb-top（只在地图区）──────┐┌ .cb-side 320 ┐
//   │                                          │   │                            ││ 页签 │ 卡片  │
//   │ 地图（game.ts 的 fit 用 insets() 量出来的   │   │ 地图（宽 W − 336）          ││ 竖排 │ 两列  │
//   │ 上下沿取景，地块永远不被抽屉盖住）           │   │                            ││      │ 纵滚  │
//   │ .cb-hint 胶囊（贴在抽屉 / 底栏上沿）         │   │                            ││ hint         │
//   ├ .cb-sheet 抽屉 188 px（只在托盘态滑出）      │   │                            ││ .cb-dock     │
//   └ .cb-dock 底栏 76 px：按模式换按钮           ┘   └────────────────────────────┘└──────────────┘
//
// 底栏：待机/托盘 [速度循环][建造/收起][拆除][全图]；摆放 [⟳][↶][✕/完成][✓ 建造 $X]；
//       步道 [↶][完成/清掉][✓ 铺 N 格 $X]；拆除 [↶][完成][✓ 拆除 退$X]（没选中时 ✓ 收起）。
// 摆放时影子头顶还浮一条小工具条 [⟳][✓][✕]（.cb-gbar，game 每帧给位置）。
// 飘字（"+$40"、"完工！"）同时最多 4 条、夹在屏幕里；组合第一次出现走大横幅，以后只飘一条字；日志点时钟打开。
// 卡片（收盘、升星、星级目标、日志）贴在下面拇指区；信息卡点背景就关，收盘/升星卡要点按钮。
// 界面只发意图（回调），不碰模拟；文字是 sandbox 调试文字，不走 i18n。
// 样式按字符串引进来、自己插进 <head>：打成单文件页面（pixel-scene 的 single-file.sh 只内联 JS）时样式也跟着走
import HUD_CSS from './hud.css?inline';

if (!document.getElementById('clubbuild-hud-css')) {
  const st = document.createElement('style');
  st.id = 'clubbuild-hud-css';
  st.textContent = HUD_CSS;
  document.head.appendChild(st);
}

import type * as THREE from 'three';
import { BUILDINGS, type BuildingDef, BY_ID, type Category, type Guest, STAR_GOALS, WEEKDAYS } from './catalog';
import { dayInfo, hourOf, type SimEvent, type State, starProgress } from './sim';

export type Mode = 'idle' | 'tray' | 'place' | 'path' | 'remove';
export type Speed = 0 | 1 | 2;

export interface HudCallbacks {
  /** 建造键：托盘开 / 关 */
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
  undo(): void;
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

/** 客群小徽章：一个字 + 颜色 */
const GUEST: Record<Guest, { ch: string; c: string; name: string }> = {
  member: { ch: '会', c: '#5aa0d8', name: '会员' },
  junior: { ch: '青', c: '#5fd068', name: '青少年' },
  family: { ch: '家', c: '#e88a4a', name: '家庭' },
  fan: { ch: '迷', c: '#e070b0', name: '球迷' },
};

const SPEED_LABEL: Record<Speed, string> = { 0: '❚❚ 停', 1: '▶ 1×', 2: '▶▶ 2×' };
const NEXT_SPEED: Record<Speed, Speed> = { 1: 2, 2: 0, 0: 1 };

interface Float {
  el: HTMLDivElement;
  p: THREE.Vector3;
  t: number;
  life: number;
  rise: number;
  coin: boolean;
}

/** 地图可用区（CSS 像素）：上沿、下沿（现在的模式）、托盘开着时的下沿、右边被侧栏占的宽 */
export interface Insets {
  top: number;
  bottom: number;
  bottomTray: number;
  right: number;
  landscape: boolean;
}

export type Project = (p: THREE.Vector3) => { x: number; y: number } | null;

/** 同时最多几条飘字（再多就丢：金币字先丢） */
const MAX_FLOATS = 4;

const money = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(Math.round(n)).toLocaleString('en-US')}`;
const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] ?? c);
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

const LANDSCAPE = '(orientation: landscape) and (min-width: 700px)';

export class Hud {
  private root: HTMLElement;
  private top: HTMLDivElement;
  private side: HTMLDivElement;
  private sheet: HTMLDivElement;
  private dock: HTMLDivElement;
  private float: HTMLDivElement;
  private gbar: HTMLDivElement;
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
  private hintErrT = 0;
  private stripEl: HTMLElement | null = null;
  private stripT = 0;
  private lastState!: State;
  /** 卡片开着（收盘 / 升星 / 目标 / 日志）：游戏暂停 */
  modalOpen = false;
  /** 开着的是哪种卡 */
  modalKind: '' | 'settle' | 'star' | 'info' = '';
  private queue: (() => void)[] = [];
  private mq = matchMedia(LANDSCAPE);

  constructor(
    root: HTMLElement,
    private cb: HudCallbacks,
    private project: Project,
  ) {
    this.root = root;
    root.innerHTML = '';
    this.float = div('cb-float');
    this.top = div('cb-top');
    this.side = div('cb-side');
    this.sheet = div('cb-sheet cb-panel');
    this.dock = div('cb-dock');
    this.gbar = div('cb-gbar');
    this.gbar.hidden = true;
    this.modal = div('cb-modal');
    this.modal.hidden = true;
    const hint = div('cb-hint');
    this.el.hint = hint;
    this.side.append(hint, this.sheet, this.dock);
    root.append(this.float, this.top, this.gbar, this.side, this.modal);

    // ── 上面一行：钱 | 第几天 + 时钟（点开日志）| ★ 星级（点开目标） ──
    this.top.innerHTML = `
      <div class="cb-chip cb-panel cb-money" data-k="money"></div>
      <button class="cb-clock" data-k="clockBtn" type="button" aria-label="日志和一周"><span data-k="clock"></span><span class="cb-week" data-k="week"></span></button>
      <button class="cb-star" data-k="star" type="button" aria-label="星级目标"></button>`;
    for (const e of this.top.querySelectorAll<HTMLElement>('[data-k]')) this.el[e.dataset.k as string] = e;
    this.el.star.addEventListener('click', () => this.starCard(this.lastState));
    this.el.clockBtn.addEventListener('click', () => this.logCard(this.lastState));

    // ── 抽屉：页签 + 卡片 ──
    const tabs = div('cb-tabs');
    for (const t of TABS) {
      const x = btn(t.name, () => this.cb.tab(t.cat));
      x.dataset.cat = t.cat;
      tabs.append(x);
    }
    const cards = div('cb-cards');
    this.el.cards = cards;
    this.sheet.append(tabs, cards);

    // ── 影子工具条 ──
    const gRot = btn('⟳', () => this.cb.rotate());
    gRot.setAttribute('aria-label', '旋转');
    const gOk = btn('✓', () => this.cb.confirm(), 'go');
    gOk.setAttribute('aria-label', '建造');
    const gX = btn('✕', () => this.cb.cancel());
    gX.setAttribute('aria-label', '取消');
    this.el.gOk = gOk;
    this.el.gX = gX;
    this.gbar.append(gRot, gOk, gX);

    this.mq.addEventListener('change', () => {
      this.root.classList.toggle('land', this.mq.matches);
    });
    this.root.classList.toggle('land', this.mq.matches);
  }

  get landscape(): boolean {
    return this.mq.matches;
  }

  /** 地图可用区（game.ts 的 fit 用）：量真实的 DOM 高度 */
  insets(): Insets {
    const H = innerHeight;
    const top = this.top.getBoundingClientRect().bottom + 6;
    if (this.mq.matches) {
      const right = this.side.offsetWidth + 16;
      return { top, bottom: 12, bottomTray: 12, right, landscape: true };
    }
    // 底栏不动画，抽屉有滑入动画：抽屉高按 offsetHeight / CSS 定高算
    const dockTop = this.dock.getBoundingClientRect().top;
    const bottom = H - dockTop + 6;
    const sheetH = 188 + 6;
    const trayOpen = this.mode === 'tray';
    // 不开托盘时给提示胶囊留一行（30 px），地块下沿不被"目标……"压着
    return { top, bottom: bottom + (trayOpen ? sheetH : 30), bottomTray: bottom + sheetH, right: 0, landscape: false };
  }

  // ── 上面一行 ──────────────────────────────────────────
  setTop(s: State, speed: Speed) {
    this.lastState = s;
    const m = this.el.money;
    setHtml(m, `<b>${money(s.money)}</b><small>会员${s.members ?? 0} · +${money(s.today.income)}</small>`);
    m.classList.toggle('neg', s.money < 0);
    const h = hourOf(s.time);
    const hh = Math.floor(h);
    const mm = Math.floor((h - hh) * 6) * 10;
    const di = dayInfo(s);
    const clock = `第${s.day}天 ${di.name} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    if (this.el.clock.textContent !== clock) this.el.clock.textContent = clock;
    // 一周小条：7 格，今天那格按时刻填；青训日 / 家庭日 / 俱乐部赛有颜色；后面写今天的名目
    const tag = di.cup ? (di.cupReady ? '俱乐部赛 ✓' : '俱乐部赛 ✕') : (di.tag ?? '');
    const cells = WEEKDAYS.map((_, i) => {
      const k = i < di.dow ? 1 : i === di.dow ? s.time : 0;
      const c = i === 2 ? 'jr' : i === 5 ? 'fam' : i === 6 ? 'cup' : '';
      return `<i class="${c}${i === di.dow ? ' now' : ''}"><b style="width:${(k * 100).toFixed(0)}%"></b></i>`;
    }).join('');
    setHtml(this.el.week, `<span class="cells">${cells}</span>${tag ? `<em>${tag}</em>` : ''}`);
    const sp = starProgress(s);
    const nDone = sp ? sp.next.filter((i) => i.done).length : 0;
    const k = sp ? nDone / Math.max(1, sp.next.length) : 1;
    setHtml(
      this.el.star,
      `<span>★${s.star} <small>${sp ? `${nDone}/${sp.next.length}→${sp.star}` : '满星'}</small></span><span class="cb-bar"><i style="width:${(k * 100).toFixed(0)}%"></i></span>`,
    );
    const sb = this.el.speed as HTMLButtonElement | undefined;
    if (sb) {
      const lb = SPEED_LABEL[speed];
      if (sb.textContent !== lb) {
        sb.textContent = lb;
        sb.dataset.s = String(speed);
        sb.setAttribute('aria-label', `速度 ${speed === 0 ? '暂停' : `${speed}×`}，点一下换`);
        sb.classList.toggle('paused', speed === 0);
      }
    }
    this.renderCards(s);
  }

  // ── 底栏：按模式换 ──────────────────────────────────────
  setMode(mode: Mode, s: State) {
    this.lastState = s;
    if (mode === this.mode) {
      this.renderCards(s);
      return;
    }
    const wasTray = this.mode === 'tray';
    this.mode = mode;
    this.side.dataset.mode = mode;
    this.side.classList.toggle('tray', mode === 'tray');
    if (mode === 'tray' && !wasTray) {
      // 抽屉滑出（3 帧的像素动画）
      this.sheet.classList.remove('slide');
      void this.sheet.offsetWidth;
      this.sheet.classList.add('slide');
    }
    const d = this.dock;
    d.innerHTML = '';
    for (const k of ['ok', 'undo', 'done', 'speed']) delete this.el[k];
    if (mode === 'idle' || mode === 'tray') {
      const sp = btn('', () => {
        const cur = Number((this.el.speed as HTMLElement).dataset.s ?? 1) as Speed;
        this.cb.speed(NEXT_SPEED[cur]);
      });
      sp.className = 'speed';
      sp.dataset.s = '1';
      this.el.speed = sp;
      const build = btn(
        mode === 'tray' ? '收起' : '建造',
        () => this.cb.build(),
        `build grow${mode === 'tray' ? ' on' : ''}`,
      );
      build.setAttribute('aria-expanded', String(mode === 'tray'));
      const rm = btn('拆除', () => this.cb.remove(), 'w64');
      const fit = btn('全图', () => this.cb.fit(), 'w64');
      fit.setAttribute('aria-label', '回到全图');
      d.append(sp, build, rm, fit);
    } else {
      const undo = btn('↶', () => this.cb.undo(), 'undo');
      undo.setAttribute('aria-label', '撤销');
      undo.disabled = true;
      this.el.undo = undo;
      if (mode === 'place') {
        const rot = btn('⟳', () => this.cb.rotate(), 'sq');
        rot.setAttribute('aria-label', '旋转');
        const x = btn('✕ 取消', () => this.cb.cancel(), 'w72');
        this.el.done = x;
        const ok = btn('✓ 建造', () => this.cb.confirm(), 'grow go');
        this.el.ok = ok;
        d.append(rot, undo, x, ok);
      } else {
        const x = btn('完成', () => this.cb.done(), 'w72');
        this.el.done = x;
        const ok = btn('✓', () => this.cb.confirm(), `grow ${mode === 'remove' ? 'warn' : 'go'}`);
        ok.disabled = true;
        this.el.ok = ok;
        d.append(undo, x, ok);
      }
    }
    this.renderCards(s);
  }

  setTab(cat: Category, sel: string | null) {
    this.cat = cat;
    this.sel = sel;
    this.cardsKey = '';
  }

  private renderCards(s: State) {
    const cards = this.el.cards;
    if (!cards || !s) return;
    const sp = starProgress(s);
    const key = `${this.cat}|${this.sel}|${s.star}|${sp ? sp.next.map((i) => (i.done ? 1 : 0)).join('') : ''}|${BUILDINGS.filter(
      (d) => d.cat === this.cat,
    )
      .map((d) => (s.money >= d.cost ? 1 : 0))
      .join('')}`;
    if (key === this.cardsKey) return;
    this.cardsKey = key;
    for (const t of this.sheet.querySelectorAll<HTMLButtonElement>('[data-cat]'))
      t.setAttribute('aria-pressed', String(t.dataset.cat === this.cat));
    cards.innerHTML = '';
    // 解锁了的排前面
    const list = BUILDINGS.filter((x) => x.cat === this.cat).sort(
      (a, b) => Number(a.star > s.star) - Number(b.star > s.star) || a.star - b.star,
    );
    for (const d of list) {
      const c = document.createElement('button');
      c.type = 'button';
      const locked = d.star > s.star;
      c.className = `cb-card${d.id === this.sel ? ' sel' : ''}${locked ? ' locked' : ''}`;
      c.dataset.id = d.id;
      c.setAttribute('aria-disabled', String(locked));
      c.innerHTML = cardHtml(d, s, locked ? lockText(d, s) : null);
      c.addEventListener('click', () => this.cb.card(d.id));
      cards.append(c);
    }
  }

  // ── 提示胶囊 ──────────────────────────────────────────
  /** err = 报错（红底抖一下，1.5 秒后恢复） */
  hint(html: string, err = false) {
    const h = this.el.hint;
    if (h.innerHTML !== html) h.innerHTML = html;
    if (err) {
      h.classList.remove('err');
      void h.offsetWidth;
      h.classList.add('err');
      this.hintErrT = 1.5;
    }
  }

  /** ✓ 键：能不能按 + 文字（不能按时写原因） */
  setOk(enabled: boolean, label: string) {
    const ok = this.el.ok as HTMLButtonElement | undefined;
    if (ok) {
      ok.disabled = !enabled;
      if (ok.textContent !== label) ok.textContent = label;
      ok.classList.toggle('none', !enabled && label === '');
    }
    const g = this.el.gOk as HTMLButtonElement;
    g.disabled = !enabled;
    g.title = label;
  }

  setUndo(n: number) {
    const u = this.el.undo as HTMLButtonElement | undefined;
    if (u) u.disabled = n <= 0;
  }

  /** 摆放态的"取消 / 完成"、步道态的"完成 / 清掉" */
  setDone(label: string) {
    const x = this.el.done;
    if (x && x.textContent !== label) x.textContent = label;
    const g = this.el.gX;
    g.setAttribute('aria-label', label);
  }

  /** 影子工具条：pos = 工具条下沿中点（屏幕像素），null = 藏起来 */
  ghostBar(pos: { x: number; y: number } | null) {
    if (!pos || this.modalOpen) {
      this.gbar.hidden = true;
      return;
    }
    this.gbar.hidden = false;
    const w = this.gbar.offsetWidth;
    const h = this.gbar.offsetHeight;
    const x = clamp(pos.x - w / 2, 6, innerWidth - w - 6);
    const y = clamp(pos.y - h, 6, innerHeight - h - 6);
    this.gbar.style.transform = `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px)`;
  }

  // ── 飘字 ──────────────────────────────────────────────
  floatText(p: THREE.Vector3, text: string, cls: string, life = 1.3, rise = 36) {
    const coin = cls.includes('coin');
    if (this.floats.length >= MAX_FLOATS) {
      // 满了：新来的是金币字就不飘；否则顶掉最老的金币字（没有就最老的）
      if (coin) return;
      const i = Math.max(
        0,
        this.floats.findIndex((f) => f.coin),
      );
      this.floats[i].el.remove();
      this.floats.splice(i, 1);
    }
    const el = div(`cb-f ${cls}`);
    el.textContent = text;
    this.float.append(el);
    this.floats.push({ el, p: p.clone(), t: 0, life, rise, coin });
  }

  /** 每帧：飘字往上飘、淡出，跟着镜头；横幅倒计时；报错胶囊恢复 */
  frame(dt: number) {
    const W = innerWidth;
    const top = this.top.getBoundingClientRect().bottom;
    for (const f of this.floats) {
      f.t += dt;
      const s = this.project(f.p);
      const k = f.t / f.life;
      if (!s || k >= 1) {
        f.el.style.opacity = '0';
        continue;
      }
      // 一纹素一纹素地往上（像素感）：按 2 像素取整；夹在屏幕里（别贴边被裁）
      const hw = f.el.offsetWidth / 2;
      const x = clamp(s.x, hw + 6, W - hw - 6);
      const y = Math.max(top + f.el.offsetHeight + 4, s.y - Math.round((f.rise * Math.min(1, k * 1.6)) / 2) * 2);
      f.el.style.transform = `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px) translate(-50%, -100%)`;
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
    if (this.stripEl) {
      this.stripT -= dt;
      if (this.stripT <= 0) {
        this.stripEl.remove();
        this.stripEl = null;
      }
    }
    if (this.hintErrT > 0) {
      this.hintErrT -= dt;
      if (this.hintErrT <= 0) this.el.hint.classList.remove('err');
    }
  }

  /** 常驻的头顶标签（没有路、组合预览、步道预览价钱）：每帧给全量，没给的藏掉 */
  setTags(list: { key: string; p: THREE.Vector3; text: string; cls: string }[]) {
    const seen = new Set<string>();
    const W = innerWidth;
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
      if (s) {
        const hw = el.offsetWidth / 2;
        const x = clamp(s.x, hw + 6, W - hw - 6);
        el.style.transform = `translate(${x.toFixed(0)}px, ${s.y.toFixed(0)}px) translate(-50%, -100%)`;
      }
    }
    for (const [k, el] of this.tags)
      if (!seen.has(k)) {
        el.remove();
        this.tags.delete(k);
      }
  }

  /** 开罗式组合大横幅（同一时间只一条） */
  banner(title: string, sub: string) {
    this.bannerEl?.remove();
    // 同一个位置只留一条：横幅优先，通知条收起
    this.stripEl?.remove();
    this.stripEl = null;
    const el = div('cb-banner');
    el.innerHTML = `<b>${esc(title)}</b><small>${esc(sub)}</small>`;
    this.float.append(el);
    this.bannerEl = el;
    this.bannerT = 2.6;
  }

  // ── 卡片 ──────────────────────────────────────────────
  /**
   * kind 'info' 点背景就关；'settle' / 'star' 只能点按钮。
   * actions = 主按钮上面的几个动作键（升级、清理）：点了先关卡再做
   */
  private open(
    html: string,
    kind: 'settle' | 'star' | 'info',
    onClose?: () => void,
    label = '好的',
    actions: CardAction[] = [],
  ) {
    const show = () => {
      this.modalOpen = true;
      this.modalKind = kind;
      this.modal.hidden = false;
      this.modal.innerHTML = '';
      this.gbar.hidden = true;
      const card = div('cb-card-big');
      card.innerHTML = html;
      const close = () => {
        this.modal.hidden = true;
        this.modalOpen = false;
        this.modalKind = '';
        this.modal.onpointerdown = null;
        onClose?.();
        const next = this.queue.shift();
        if (next) next();
      };
      if (actions.length) {
        const row = div('cb-acts');
        for (const a of actions) {
          const b = btn(
            a.label,
            () => {
              close();
              a.on();
            },
            a.cls ?? 'go',
          );
          b.disabled = !!a.disabled;
          row.append(b);
        }
        card.append(row);
      }
      card.append(btn(label, close, actions.length ? 'plain' : ''));
      this.modal.append(card);
      this.modal.onpointerdown =
        kind === 'info'
          ? (e) => {
              if (e.target === this.modal) close();
            }
          : null;
    };
    if (this.modalOpen) this.queue.push(show);
    else show();
  }

  /** 收盘：blocking = 整张卡（周报、升星、亏钱、新组合）；否则上面一条日报，3 秒自己收起，点它打开整张卡 */
  settlement(e: Extract<SimEvent, { type: 'daySettled' }>, s: State) {
    const full = () => this.settleCard(e, s);
    if (e.blocking === false) {
      const net = e.net;
      this.strip(
        `第${e.day}天 收盘 <b class="${net >= 0 ? 'pos' : 'neg'}">${net >= 0 ? '+' : ''}${money(net)}</b> · ${e.visitors}位${e.members?.joined ? ` · 新会员 ${e.members.joined}` : ''} <u>详情 ›</u>`,
        full,
      );
    } else full();
  }

  private settleCard(e: Extract<SimEvent, { type: 'daySettled' }>, s: State) {
    const net = e.net;
    const sign = (n: number) => `${n >= 0 ? '+' : ''}${money(n)}`;
    const mem = e.members;
    const diff = e.diff?.items?.length
      ? `<div class="cb-why-t">和昨天比</div><ul class="cb-why">${e.diff.items.map((d) => `<li>${esc(d.text)}</li>`).join('')}</ul>`
      : '';
    const why = e.reasons.length
      ? `<div class="cb-why-t">为什么</div><ul class="cb-why">${e.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>`
      : '';
    const fc = e.forecast;
    this.open(
      `<h2>第 ${e.day} 天 收盘</h2>
      <div class="cb-lines">
        <span>客人</span><span>${e.visitors} 位${e.turnedAway ? `（走掉 ${e.turnedAway}）` : ''}</span>
        <span>收入</span><span class="pos">+${money(e.income)}</span>
        ${e.dues ? `<span>　其中会费</span><span>${money(e.dues)}</span>` : ''}
        <span>维护费</span><span class="neg">-${money(e.upkeep)}</span>
        <span class="sum">今天</span><span class="sum ${net >= 0 ? 'pos' : 'neg'}">${sign(net)}</span>
        ${e.prize ? `<span>俱乐部赛奖金</span><span class="pos">+${money(e.prize)}</span>` : ''}
        ${mem ? `<span>会员</span><span>${mem.total} 位（+${mem.joined} / -${mem.left}）</span>` : ''}
        <span>手上</span><span>${money(s.money)}</span>
      </div>
      ${diff}${why}
      ${fc ? `<div class="cb-sub">明天预计 ${fc.visitors} 位客人${fc.away > 0 ? `（客满会走掉 ~${fc.away}）` : ''}</div>` : ''}
      ${e.hint ? `<div class="cb-next">下一步：${esc(e.hint)}</div>` : ''}`,
      'settle',
      undefined,
      `开始第 ${e.day + 1} 天`,
    );
  }

  /** 上面一条不挡游戏的通知（日报、俱乐部赛没办成）：3 秒自己收起，onTap 有的话点它打开 */
  strip(html: string, onTap?: () => void, life = 3.2) {
    this.stripEl?.remove();
    const el = document.createElement(onTap ? 'button' : 'div');
    el.className = 'cb-strip';
    el.innerHTML = html;
    if (onTap)
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        el.remove();
        this.stripEl = null;
        onTap();
      });
    this.root.append(el);
    this.stripEl = el;
    this.stripT = life;
  }

  /** 俱乐部赛（周日收盘）：办成了 = 庆祝卡；没办成 = 一条通知写缺什么 */
  clubCup(e: Extract<SimEvent, { type: 'clubCup' }>) {
    if (e.held)
      this.open(
        `<h2 class="star">俱乐部赛办成了！</h2>
        <div class="cb-lines">
          <span>来看球的球迷</span><span>${e.fans} 位</span>
          <span>奖金</span><span class="pos">+${money(e.prize)}</span>
          <span>名气</span><span class="pos">+${e.fame}</span>
        </div>
        <div class="cb-sub">名气越高，平常每天来的客人越多</div>`,
        'star',
        undefined,
        '太好了',
      );
    else this.strip(`俱乐部赛没办成：<b>缺${esc(e.need || '条件')}</b>`, undefined, 4);
  }

  starUp(e: Extract<SimEvent, { type: 'starUp' }>, onGo?: () => void) {
    this.open(
      `<h2 class="star">★${e.star} 升星！</h2>
      <div class="cb-sub">俱乐部名气更大了，解锁了新设施</div>
      <div class="cb-unlock">${e.unlocked
        .map((id) => BY_ID[id])
        .filter(Boolean)
        .map((d) => `<span>${esc(d.name)}<small>${money(d.cost)}</small></span>`)
        .join('')}</div>
      ${e.rows ? `<div class="cb-sub">地块往北开放了：现在能建 ${e.rows} 行</div>` : ''}`,
      'star',
      onGo,
      '去建造',
    );
  }

  /** 星级目标卡；unlockId = 从锁着的卡点进来的（卡顶写"解锁 X"） */
  starCard(s: State, unlockId?: string) {
    if (!s) return;
    const sp = starProgress(s);
    const want = unlockId ? BY_ID[unlockId] : undefined;
    const head = want
      ? `<div class="cb-want">解锁 <b>${esc(want.name)}</b> 要 ★${want.star}${want.star > (sp?.star ?? 0) ? `（先到 ★${sp?.star}）` : ''}</div>`
      : '';
    if (!sp) {
      this.open(`<h2 class="star">★${s.star} 满星</h2><div class="cb-sub">所有设施都解锁了</div>`, 'info');
      return;
    }
    const next = BUILDINGS.filter((b) => b.star === sp.star).map((b) => b.name);
    const fmt = (key: string, n: number) => (key === 'net' || key === 'money' ? money(n) : String(n));
    this.open(
      `${head}<h2>★${sp.star} 的目标</h2>
      ${sp.next
        .map(
          (i) =>
            `<div class="cb-goal${i.done ? ' done' : ''}"><span>${i.done ? '✓' : '·'}</span><span>${esc(i.label)}</span><span>${fmt(i.key, i.have)} / ${fmt(i.key, i.need)}</span><div class="meter"><i style="width:${Math.min(100, (i.have / Math.max(1, i.need)) * 100).toFixed(0)}%"></i></div></div>`,
        )
        .join('')}
      <div class="cb-sub">每天收盘时检查 · 解锁：${esc(next.join('、') || '—')}</div>
      <div class="cb-sub">${STAR_GOALS.length} 颗星封顶</div>`,
      'info',
    );
  }

  /** 点设施的信息卡：几行字 + 动作键（升级 / 清理） */
  infoCard(title: string, lines: [string, string][], note: string, actions: CardAction[]) {
    this.open(
      `<h2>${esc(title)}</h2>
      <div class="cb-lines">${lines.map(([a, b]) => `<span>${esc(a)}</span><span>${esc(b)}</span>`).join('')}</div>
      ${note ? `<div class="cb-sub">${esc(note)}</div>` : ''}`,
      'info',
      undefined,
      '关上',
      actions,
    );
  }

  /** 日志卡（点时钟）：这一周 + 最近的事，新的在上 */
  logCard(s: State) {
    if (!s) return;
    const di = dayInfo(s);
    const week = WEEKDAYS.map(
      (n, i) =>
        `<span class="${i === di.dow ? 'now' : ''}">${n}${i === 2 ? '<small>青训日</small>' : i === 5 ? '<small>家庭日</small>' : i === 6 ? '<small>俱乐部赛</small>' : '<small>　</small>'}</span>`,
    ).join('');
    const items = s.log.slice(-14).reverse();
    this.open(
      `<h2>这一周</h2><div class="cb-weekfull">${week}</div>
      <div class="cb-sub">${di.cupReady ? '周日俱乐部赛：条件够了 ✓' : `周日俱乐部赛：还要${esc(di.need)}`}</div>
      <h2>日志</h2>${
        items.length
          ? `<ul class="cb-log">${items.map((l) => `<li><span>第${l.day}天</span>${esc(l.text)}</li>`).join('')}</ul>`
          : '<div class="cb-sub">还没有事</div>'
      }`,
      'info',
    );
  }
}

export interface CardAction {
  label: string;
  on: () => void;
  disabled?: boolean;
  cls?: string;
}

/** 卡片：名字、占地小图、占地 + 客位、收费 / 吸引、客群 + 维护费、价钱；锁着的盖一层写第一个没完成的目标 */
function cardHtml(d: BuildingDef, s: State, lock: string | null): string {
  const l1 = `${d.w}×${d.d}格${d.cap ? ` · ${d.cap}人` : ''}`;
  const l2 = [d.spend ? `$${d.spend}/位` : '', d.appeal ? `吸引+${d.appeal}` : ''].filter(Boolean).join(' ');
  const gs = (d.guests ?? [])
    .map((g) => GUEST[g])
    .filter(Boolean)
    .map((g) => `<i style="background:${g.c}" title="${g.name}">${g.ch}</i>`)
    .join('');
  const up = d.upkeep ? `<em>-$${d.upkeep}/天</em>` : '';
  return `<span class="nm">${esc(d.name)}</span>${shape(d)}<span class="ln">${l1}</span>${l2 ? `<span class="ln">${l2}</span>` : ''}${gs || up ? `<span class="ln gs">${gs}${up}</span>` : ''}<span class="cost${s.money < d.cost ? ' poor' : ''}">${money(d.cost)}${d.cat === 'road' ? '/格' : ''}</span>${lock !== null ? `<span class="lock">★${d.star}<small>${esc(lock)}</small></span>` : ''}`;
}

/** 锁着的卡上写什么：下一颗星就是它 → 第一个没完成的目标；更远 → "先到 ★N" */
function lockText(d: BuildingDef, s: State): string {
  const sp = starProgress(s);
  if (!sp) return '升星解锁';
  if (d.star > sp.star) return `先到 ★${sp.star}`;
  const i = sp.next.find((x) => !x.done);
  if (!i) return '今天收盘升星';
  const n = Math.max(0, Math.ceil(i.need - i.have));
  if (i.key === 'visitors') return `还差 ${n} 位客人`;
  if (i.key === 'buildings') return `再建 ${n} 座设施`;
  if (i.key === 'combos') return `再凑 ${n} 个组合`;
  if (i.key === 'net') return `日净收入差 ${money(n)}`;
  if (i.key === 'members') return `还差 ${n} 位会员`;
  return `${i.label} ${i.have}/${i.need}`;
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
  // 最长边压到 ≤ 4 个小方块（卡片高度有限）
  const sc = Math.max(1, Math.ceil(Math.max(d.w, d.d) / 4));
  const w = Math.ceil(d.w / sc);
  const h = Math.ceil(d.d / sc);
  const cells = Array.from({ length: w * h }, () => `<i style="background:${CAT_COLOR[d.cat]}"></i>`).join('');
  return `<span class="shape" style="grid-template-columns:repeat(${w},4px)">${cells}</span>`;
}

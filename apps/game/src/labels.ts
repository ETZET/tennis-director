import type { XYZ } from '@td/shared';

/**
 * 场景上的 DOM 叠层：地点牌、岗位和工单的标记（拖人上去、点开说明）、总监头顶的"你"、正在进行的活动。
 * 每帧把世界坐标投影到屏幕上（IsoCamera.project，CSS 像素）；文字变了才改 DOM。
 *
 * 摆放（QA P1-2）：按优先级从高到低摆，后摆的和已经摆好的牌子叠住就往上、往两边让；
 * 实在让不开的低优先级牌子缩成小圆点（或者不画）。所有牌子都夹在上下两条 HUD 之间；
 * 牌子和它指的点之间画一条引线（可以斜），指的点被 HUD 挡住时不画引线。
 */

export interface Marker {
  el: HTMLElement;
  get: () => XYZ;
  /** 直接给屏幕上指的点（CSS 像素）；给了就不用 get 投影。返回 null 表示这一帧不显示 */
  screen?: () => { x: number; y: number } | null;
  /** 返回 null 表示这一帧不显示 */
  text: () => string | null;
  /** 有就用这段 HTML 画牌子（text 只当无障碍名字）；调用方负责转义 */
  html?: () => string;
  cls: () => string;
  /** 牌子离地面的高度（像素），可以随状态变（例如拉远时缩成小圆点） */
  lift: number | (() => number);
  /** 每帧更新的 CSS 变量（例如进度 --p） */
  vars?: () => Record<string, string>;
  /** 整块牌子留在屏幕里（地点牌：拇指要点得到；第二轮试玩 S10） */
  keepOnScreen?: boolean;
  /** 摆放优先级：大的先摆、不给别人让位（默认 0） */
  prio?: () => number;
  /** 让不开时：缩成小圆点（dot）或者这一帧不画（hide）；不给就叠着画 */
  crowded?: 'dot' | 'hide';
  /** 是否有引线（::after） */
  stem?: boolean;
  last?: string;
  /** 完整大小（没缩成圆点时量的） */
  size?: { key: string; w: number; h: number };
}

/** 世界点 → 容器里的 CSS 像素（IsoCamera 满足这个接口） */
export interface LabelProjector {
  project(x: number, y: number, z: number): { x: number; y: number };
}

interface Box {
  l: number;
  r: number;
  t: number;
  b: number;
}

const hits = (a: Box, b: Box, pad = 2) => a.l < b.r + pad && a.r > b.l - pad && a.t < b.b + pad && a.b > b.t - pad;

/** 让位的候选：（横向几个半宽，纵向几个高），先往上、再往两边；再远引线就太长了，宁可缩成圆点 */
const TRIES: readonly (readonly [number, number])[] = [
  [0, 0],
  [0, -1],
  [-1, 0],
  [1, 0],
  [-1, -1],
  [1, -1],
];

/** 圆点的大小（CSS 里 .lbl-dot 一致） */
const DOT = 16;

export class GameLabels {
  private readonly items: Marker[] = [];
  occluders: () => readonly DOMRect[] = () => [];
  compact = false;

  constructor(
    private readonly layer: HTMLElement,
    private readonly cam: LabelProjector,
  ) {
    // 像素字体晚到：字体换了，牌子的大小全部重新量
    document.fonts?.addEventListener?.('loadingdone', () => {
      for (const m of this.items) m.size = undefined;
    });
  }

  add(m: Omit<Marker, 'el'>, onClick?: (el: HTMLElement) => void): Marker {
    const el = document.createElement(onClick ? 'button' : 'div');
    if (onClick) {
      (el as HTMLButtonElement).type = 'button';
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        onClick(el);
      });
    }
    this.layer.appendChild(el);
    const item: Marker = { ...m, el };
    this.items.push(item);
    return item;
  }

  place(W: number, H: number): void {
    this.layer.classList.toggle('compact', this.compact);
    // HUD：横贯屏幕的（手机上的标题卡、状态条、员工条、事件卡）切出上下边界；小块的（桌面四角）当障碍
    let top = 0;
    let bottom = H;
    const placed: Box[] = [];
    for (const r of this.occluders()) {
      if (r.width <= 0 || r.height <= 0) continue;
      if (r.width >= W * 0.6) {
        if (r.top + r.height / 2 < H / 2) top = Math.max(top, r.bottom);
        else bottom = Math.min(bottom, r.top);
      } else placed.push({ l: r.left, r: r.right, t: r.top, b: r.bottom });
    }
    top += 4;
    bottom -= 4;

    // 先更新文字、算指的点，再按优先级摆
    const todo: { m: Marker; q: { x: number; y: number }; prio: number; i: number }[] = [];
    this.items.forEach((m, i) => {
      const text = m.text();
      const q = text === null ? null : this.anchor(m);
      // 指的点远在屏幕外：不画（keepOnScreen 的牌子在屏幕外半屏以内还贴边留着：拇指要点得到）
      const mx = m.keepOnScreen ? W * 0.6 : 100;
      const my = m.keepOnScreen ? H * 0.3 : 40;
      const far = !q || q.x < -mx || q.x > W + mx || q.y < -my || q.y > H + my;
      if (text === null || far || !q) {
        m.el.hidden = true;
        return;
      }
      const cls = m.cls();
      const html = m.html?.();
      const key = `${cls}|${text}|${html ?? ''}`;
      if (key !== m.last) {
        m.last = key;
        m.el.className = cls;
        if (html !== undefined) m.el.innerHTML = html;
        else m.el.textContent = text;
        m.el.setAttribute('aria-label', text);
      }
      if (m.vars) for (const [k, v] of Object.entries(m.vars())) m.el.style.setProperty(k, v);
      m.el.hidden = false;
      todo.push({ m, q, prio: m.prio?.() ?? 0, i });
    });
    todo.sort((a, b) => b.prio - a.prio || a.i - b.i);

    for (const { m, q } of todo) {
      const inside = q.x >= 0 && q.x <= W && q.y >= top && q.y <= bottom;
      // 指的点被 HUD 挡住（或在屏幕外）：只有要留在屏幕里的牌子还画，贴着边、不画引线
      if (!inside && !m.keepOnScreen) {
        m.el.hidden = true;
        continue;
      }
      // 完整大小：内容变了才重新量（量的时候先去掉圆点样式）
      const sizeKey = `${m.last}|${this.compact}`;
      if (m.size?.key !== sizeKey) {
        m.el.classList.remove('lbl-dot');
        m.size = { key: sizeKey, w: m.el.offsetWidth || 80, h: m.el.offsetHeight || 24 };
      }
      const { w, h } = m.size;
      const lift = typeof m.lift === 'function' ? m.lift() : m.lift;
      const fit = (cx: number, by: number): Box => {
        const x = Math.min(Math.max(cx, w / 2 + 12), W - w / 2 - 12);
        const b = Math.min(Math.max(by, top + h), bottom);
        return { l: x - w / 2, r: x + w / 2, t: b - h, b };
      };
      let box: Box | null = null;
      for (const [kx, ky] of TRIES) {
        const c = fit(q.x + kx * (w / 2 + 6), q.y - lift + ky * (h + 4));
        if (!placed.some((p) => hits(c, p))) {
          box = c;
          break;
        }
      }
      let dot = false;
      if (!box) {
        if (m.crowded === 'hide') {
          m.el.hidden = true;
          continue;
        }
        if (m.crowded === 'dot') {
          // 缩成小圆点，钉在指的点上方（点击范围仍有 44 px，CSS 里补）
          dot = true;
          const x = Math.min(Math.max(q.x, DOT / 2 + 6), W - DOT / 2 - 6);
          const b = Math.min(Math.max(q.y - 6, top + DOT), bottom);
          box = { l: x - DOT / 2, r: x + DOT / 2, t: b - DOT, b };
        } else box = fit(q.x, q.y - lift);
      }
      m.el.classList.toggle('lbl-dot', dot);
      // 指的点在屏幕外或被 HUD 挡住：牌子贴边，加一个小箭头指向那边（不画引线）
      const off = inside ? '' : q.x < 0 ? 'l' : q.x > W ? 'r' : q.y < top ? 'u' : 'd';
      for (const d of ['l', 'r', 'u', 'd']) m.el.classList.toggle(`lbl-off-${d}`, off === d && !dot);
      placed.push(box);
      const cx = (box.l + box.r) / 2;
      m.el.style.transform = `translate(${Math.round(cx)}px,${Math.round(box.b)}px) translate(-50%,-100%)`;
      // 引线：从牌子底边（离指的点最近的位置）连到指的点；指的点被挡住、在牌子上面、或贴得很近就不画
      const half = (box.r - box.l) / 2;
      const sx = Math.max(-half + 4, Math.min(half - 4, q.x - cx));
      const dx = q.x - (cx + sx);
      const dy = q.y - box.b;
      const len = Math.hypot(dx, dy);
      if (m.stem !== false && inside && !dot && dy > 3 && len < Math.max(160, H * 0.25)) {
        m.el.style.setProperty('--stem', `${Math.round(len)}px`);
        m.el.style.setProperty('--sx', `${Math.round(sx)}px`);
        m.el.style.setProperty('--rot', `${Math.round((Math.atan2(-dx, dy) * 180) / Math.PI)}deg`);
      } else m.el.style.setProperty('--stem', '0px');
    }
  }

  private anchor(m: Marker): { x: number; y: number } | null {
    if (m.screen) return m.screen();
    const p = m.get();
    return this.cam.project(p.x, p.y, p.z);
  }
}

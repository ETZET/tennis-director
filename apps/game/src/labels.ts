import type { XYZ } from '@td/shared';
import * as THREE from 'three';

/**
 * 场景上的 DOM 叠层：地点牌、岗位和工单的标记（拖人上去、点开说明）、总监头顶的"你"、正在进行的活动。
 * 每帧把世界坐标投影到屏幕上；文字变了才改 DOM。
 */

export interface Marker {
  el: HTMLElement;
  get: () => XYZ;
  /** 返回 null 表示这一帧不显示 */
  text: () => string | null;
  /** 有就用这段 HTML 画牌子（text 只当无障碍名字）；调用方负责转义 */
  html?: () => string;
  cls: () => string;
  /** 牌子离地面的高度（像素），可以随状态变（例如拉远时缩成小圆点） */
  lift: number | (() => number);
  /** 每帧更新的 CSS 变量（例如进度 --p） */
  vars?: () => Record<string, string>;
  last?: string;
}

export class GameLabels {
  private readonly items: Marker[] = [];
  private readonly pv = new THREE.Vector3();
  occluders: () => readonly DOMRect[] = () => [];
  compact = false;

  constructor(
    private readonly layer: HTMLElement,
    private readonly cam: THREE.Camera,
  ) {}

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
    const occ = this.occluders();
    /** 已经摆好的牌子（屏幕矩形）：后摆的和它们叠住就往上让 */
    const placed: { l: number; r: number; t: number; b: number }[] = [];
    for (const m of this.items) {
      const text = m.text();
      if (text === null) {
        m.el.hidden = true;
        continue;
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
      const p = m.get();
      this.pv.set(p.x, p.y, p.z).project(this.cam);
      const x = (this.pv.x * 0.5 + 0.5) * W;
      const y = (-this.pv.y * 0.5 + 0.5) * H;
      let off = x < -100 || x > W + 100 || y < -40 || y > H + 40;
      const base = typeof m.lift === 'function' ? m.lift() : m.lift;
      if (!off) off = occ.some((r) => x + 60 > r.left && x - 60 < r.right && y > r.top && y - base - 24 < r.bottom);
      m.el.hidden = off;
      if (off) continue;
      // 手机上地点挤在一起：和已经摆好的牌子叠住就往上让（最多让三次）
      const w = m.el.offsetWidth || 80;
      const h = m.el.offsetHeight || 24;
      let lift = base;
      for (let k = 0; k < 3; k++) {
        const box = { l: x - w / 2, r: x + w / 2, t: y - lift - h, b: y - lift };
        const hit = placed.find((p) => box.l < p.r && box.r > p.l && box.t < p.b && box.b > p.t);
        if (!hit) break;
        lift += box.b - hit.t + 3;
      }
      placed.push({ l: x - w / 2, r: x + w / 2, t: y - lift - h, b: y - lift });
      m.el.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px) translate(-50%,-100%) translateY(-${Math.round(lift)}px)`;
      m.el.style.setProperty('--stem', `${Math.round(lift)}px`);
    }
  }
}

import type { XYZ } from '@td/shared';
import * as THREE from 'three';

/**
 * 场景上的 DOM 叠层：地点牌（点一下总监就走过去）、总监头顶的"你"、正在进行的活动、卡片发生的地方。
 * 每帧把世界坐标投影到屏幕上；文字变了才改 DOM。
 */

export interface Marker {
  el: HTMLElement;
  get: () => XYZ;
  /** 返回 null 表示这一帧不显示 */
  text: () => string | null;
  cls: () => string;
  lift: number;
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
      const key = `${cls}|${text}`;
      if (key !== m.last) {
        m.last = key;
        m.el.className = cls;
        m.el.textContent = text;
      }
      const p = m.get();
      this.pv.set(p.x, p.y, p.z).project(this.cam);
      const x = (this.pv.x * 0.5 + 0.5) * W;
      const y = (-this.pv.y * 0.5 + 0.5) * H;
      let off = x < -100 || x > W + 100 || y < -40 || y > H + 40;
      if (!off) off = occ.some((r) => x + 60 > r.left && x - 60 < r.right && y > r.top && y - m.lift - 24 < r.bottom);
      m.el.hidden = off;
      if (off) continue;
      // 手机上地点挤在一起：和已经摆好的牌子叠住就往上让（最多让三次）
      const w = m.el.offsetWidth || 80;
      const h = m.el.offsetHeight || 24;
      let lift = m.lift;
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

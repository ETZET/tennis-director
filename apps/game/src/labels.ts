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

  add(m: Omit<Marker, 'el'>, onClick?: () => void): Marker {
    const el = document.createElement(onClick ? 'button' : 'div');
    if (onClick) {
      (el as HTMLButtonElement).type = 'button';
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        onClick();
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
      if (!off)
        m.el.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px) translate(-50%,-100%) translateY(-${m.lift}px)`;
    }
  }
}

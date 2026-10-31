import type { Person } from '@td/render';
import type { XYZ } from '@td/shared';
import * as THREE from 'three';

/**
 * 名字标签和对话气泡：DOM 叠层，每帧把锚点投影到屏幕上。
 * （技术文档：标签和气泡继续用 DOM 叠层，由界面层负责。M1 起移到 @td/ui。）
 */

interface Label {
  el: HTMLElement;
  get: () => XYZ;
  kind: 'lbl' | 'say';
  until?: number;
  /** 每帧刷新内容（场地编号牌的状态） */
  refresh?: () => void;
  /** 牌子画在锚点上方多少像素（中间一根竖线连到场地上） */
  lift?: number;
}

export interface CourtStatus {
  text: string;
  /** open：亮黄编号；rented：琥珀色（租出去了，不算可用的网球场）；closed：灰色 */
  state: 'open' | 'rented' | 'closed';
}

export class LabelLayer {
  private readonly labels: Label[] = [];
  private readonly pv = new THREE.Vector3();
  show = true;
  /** 远景：场地编号牌只留编号方块 */
  compact = false;
  /** 近景：场地看得清楚，编号牌收起来，不挡人 */
  hideMarkers = false;
  /** 界面面板的屏幕矩形：编号牌落在面板下面就不画，免得透过面板露出来 */
  occluders: () => readonly DOMRect[] = () => [];

  constructor(
    private readonly layer: HTMLElement,
    private readonly cam: THREE.Camera,
    private readonly now: () => number,
  ) {}

  /** 一块小牌子（例如头顶的"你"）。 */
  tag(text: string, get: () => XYZ, cls?: string): Label {
    const el = document.createElement('div');
    el.className = `lbl${cls ? ` ${cls}` : ''}`;
    el.textContent = text;
    this.layer.appendChild(el);
    const l: Label = { el, get, kind: 'lbl' };
    this.labels.push(l);
    return l;
  }

  /** 场地编号牌：编号方块 + 一个词的状态。status 每帧取一次，变了才改 DOM。 */
  court(n: number, status: () => CourtStatus, get: () => XYZ): Label {
    const el = document.createElement('div');
    const num = document.createElement('span');
    num.className = 'mk-n';
    num.textContent = String(n);
    const txt = document.createElement('span');
    txt.className = 'mk-t';
    el.append(num, txt);
    this.layer.appendChild(el);
    let last = '';
    const refresh = () => {
      const s = status();
      const key = `${s.state}|${s.text}`;
      if (key === last) return;
      last = key;
      el.className = `lbl mk mk-${s.state}`;
      txt.textContent = s.text;
      el.setAttribute('aria-label', `Court ${n}: ${s.text}`);
    };
    refresh();
    const l: Label = { el, get, kind: 'lbl', refresh, lift: 26 };
    this.labels.push(l);
    return l;
  }

  /** 人物头顶的对话气泡，dur 秒后消失。 */
  say(p: Person, text: string, dur: number, t?: number, cls?: string): Label {
    const el = document.createElement('div');
    el.className = `say${cls ? ` ${cls}` : ''}`;
    const b = document.createElement('b');
    b.textContent = p.name;
    el.append(b, document.createTextNode(text));
    this.layer.appendChild(el);
    const l: Label = {
      el,
      get: () => ({ x: p.root.position.x, y: p.root.position.y + 2.35, z: p.root.position.z }),
      kind: 'say',
      until: (t ?? this.now()) + dur,
    };
    this.labels.push(l);
    return l;
  }

  place(W: number, H: number): void {
    const now = this.now();
    this.layer.classList.toggle('compact', this.compact);
    const occ = this.occluders();
    for (let i = this.labels.length - 1; i >= 0; i--) {
      const l = this.labels[i] as Label;
      if (l.kind === 'say' && now > (l.until ?? 0)) {
        l.el.remove();
        this.labels.splice(i, 1);
        continue;
      }
      if (l.kind === 'lbl' && !this.show) {
        l.el.hidden = true;
        continue;
      }
      if (l.refresh && this.hideMarkers) {
        l.el.hidden = true;
        continue;
      }
      l.refresh?.();
      const p = l.get();
      this.pv.set(p.x, p.y, p.z).project(this.cam);
      const x = (this.pv.x * 0.5 + 0.5) * W;
      const y = (-this.pv.y * 0.5 + 0.5) * H;
      const lift = l.lift ?? 0;
      let off = x < -100 || x > W + 100 || y < -40 || y > H + 40;
      // 编号牌的锚点在竖线底端；牌子大约 140×24，画在锚点上方 lift 像素
      if (!off && l.kind === 'lbl')
        off = occ.some((r) => x + 70 > r.left && x - 70 < r.right && y > r.top && y - lift - 26 < r.bottom);
      l.el.hidden = off;
      if (!off)
        l.el.style.transform =
          `translate(${Math.round(x)}px,${Math.round(y)}px) translate(-50%,-100%)` +
          (l.kind === 'say' ? ' translateY(-10px)' : lift ? ` translateY(-${lift}px)` : '');
    }
  }
}

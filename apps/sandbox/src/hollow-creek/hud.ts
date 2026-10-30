import { clamp } from '@td/shared';

/**
 * Hollow Creek 演示的 HUD：顶栏、项目报告、事件日志、提示条。
 * M0 原样保留原型的 DOM；M1 起换成 @td/ui 的 Preact 组件，数据来自模拟快照。
 */

export interface DemoStats {
  /** 项目质量 0..100 */
  q: number;
  hist: number[];
  members: number;
  complaints: number;
  phoneMin: number;
  ins: number;
  shots: number;
  fired: boolean;
  ended: boolean;
  pbBest: number;
}

const $ = (id: string): HTMLElement => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} missing`);
  return el;
};

export const grade = (q: number): 'A' | 'B' | 'C' | 'D' | 'F' =>
  q >= 85 ? 'A' : q >= 70 ? 'B' : q >= 55 ? 'C' : q >= 40 ? 'D' : 'F';
const GCOL = { A: '#93c27a', B: '#b6c76a', C: '#e3b21a', D: '#e08a2a', F: '#d6532e' } as const;

export class Hud {
  readonly S: DemoStats = {
    q: 58,
    hist: [58],
    members: 47,
    complaints: 3,
    phoneMin: 0,
    ins: 0,
    shots: 0,
    fired: false,
    ended: false,
    pbBest: 0,
  };
  private readonly logEl = $('log');
  private readonly toastEl = $('toast');
  private toastTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly lastLog: Record<string, number> = {};
  private readonly spark = $('spark') as HTMLCanvasElement;
  private readonly sctx = this.spark.getContext('2d') as CanvasRenderingContext2D;

  /** now() 返回演出时间（秒）。 */
  constructor(private readonly now: () => number) {}

  /** 游戏内时钟：周六 16:10 开始，演出 1 秒 = 15 秒。 */
  clockStr(): string {
    const m = Math.floor(16 * 60 + 10 + this.now() / 4);
    const h = Math.floor(m / 60) % 12 || 12;
    return `${h}:${String(m % 60).padStart(2, '0')} PM`;
  }

  log(text: string, hot?: boolean): void {
    const li = document.createElement('li');
    if (hot) li.className = 'hot';
    const tm = document.createElement('time');
    tm.textContent = this.clockStr();
    const sp = document.createElement('span');
    sp.textContent = text;
    li.append(tm, sp);
    this.logEl.prepend(li);
    while (this.logEl.children.length > 7) this.logEl.lastChild?.remove();
  }

  /** 同一类事件至少隔 gap 秒才记一次。 */
  maybeLog(key: string, text: string, gap = 9): void {
    if (this.S.ended) return;
    if (this.now() - (this.lastLog[key] ?? -99) < gap) return;
    this.lastLog[key] = this.now();
    this.log(text);
  }

  hitQ(d: number): void {
    this.S.q = clamp(this.S.q + d, 6, 100);
  }

  toast(head: string, text: string, dur: number, dark?: boolean): void {
    const el = this.toastEl;
    el.innerHTML = '';
    const b = document.createElement('b');
    b.textContent = head;
    el.append(b, document.createTextNode(text));
    el.className = `toast${dark ? ' dark' : ''}`;
    el.hidden = false;
    clearTimeout(this.toastTimer);
    if (dur)
      this.toastTimer = setTimeout(() => {
        el.hidden = true;
      }, dur * 1000);
  }

  setVacantCoach(): void {
    const hc = $('hcChip');
    hc.textContent = 'Head coach: Vacant';
    hc.classList.add('vacant');
  }

  showReplay(): void {
    $('replay').hidden = false;
  }

  collapseOnPhone(): void {
    if (window.innerWidth <= 760) ($('report') as HTMLDetailsElement).open = false;
  }

  private drawSpark(): void {
    const { spark, sctx, S } = this;
    const W = spark.width;
    const H = spark.height;
    sctx.clearRect(0, 0, W, H);
    sctx.fillStyle = '#262522';
    sctx.fillRect(0, 0, W, H);
    const y = (v: number) => Math.round(H - 4 - (v / 100) * (H - 8));
    sctx.fillStyle = 'rgba(214,83,46,.18)';
    sctx.fillRect(0, y(40), W, H - y(40));
    for (const v of [40, 55, 70]) {
      sctx.fillStyle = 'rgba(232,226,210,.18)';
      for (let x = 0; x < W; x += 6) sctx.fillRect(x, y(v), 3, 1);
    }
    sctx.fillStyle = 'rgba(232,226,210,.45)';
    sctx.font = '9px Silkscreen, monospace';
    sctx.fillText('F', W - 10, y(40) + 11);
    sctx.fillText('D', W - 10, y(55) + 11);
    const h = S.hist;
    const n = Math.max(60, h.length);
    const step = (W - 14) / (n - 1);
    sctx.fillStyle = '#e3b21a';
    for (let i = 0; i < h.length; i++)
      sctx.fillRect(Math.round(i * step), y(h[i] as number) - 1, Math.ceil(step) + 1, 3);
    const lx = Math.round((h.length - 1) * step);
    const ly = y(h[h.length - 1] as number);
    sctx.fillStyle = '#f7f3e8';
    sctx.fillRect(lx - 3, ly - 3, 7, 7);
  }

  /** 刷新报告面板。lessonBalls 是 1 号场上散落的课程用球数。 */
  draw(lessonBalls: number): void {
    const { S } = this;
    const q = Math.round(S.q);
    const g = grade(S.q);
    const ge = $('grade');
    ge.textContent = g;
    ge.style.color = GCOL[g];
    $('qnum').textContent = String(q);
    const h = S.hist;
    const d = h.length > 10 ? (h[h.length - 1] as number) - (h[h.length - 11] as number) : 0;
    $('trend').textContent = S.ended ? '▼ bottomed out' : d < -0.2 ? '▼ falling' : d > 0.2 ? '▲ recovering' : '■ flat';
    $('mem').textContent = String(S.members);
    const sb = $('sBalls');
    sb.textContent = String(lessonBalls);
    sb.className = lessonBalls > 12 ? 'bad' : '';
    $('sPhone').textContent = `${Math.floor(S.phoneMin)} min`;
    $('sIn').textContent = S.shots ? `${Math.round((S.ins / S.shots) * 100)}%` : '—';
    $('sComp').textContent = String(S.complaints);
    $('clock').textContent = `Sat ${this.clockStr()}`;
    this.drawSpark();
  }
}

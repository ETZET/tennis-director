/**
 * 玩法 demo 共用的"手感"小工具：飞字、抖屏、闪屏、合成音效、震动。
 * 只做反馈，不碰数值。各 demo 直接 import，不要改这里的签名（四个 demo 共用）。
 */

let ctx: AudioContext | null = null;
let muted = new URLSearchParams(location.search).has('mute');

export function setMuted(m: boolean): void {
  muted = m;
}
export function isMuted(): boolean {
  return muted;
}

function ac(): AudioContext | null {
  if (muted) return null;
  if (!ctx) {
    try {
      ctx = new AudioContext();
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

export interface Tone {
  /** 起始频率 Hz */
  f: number;
  /** 结束频率（滑音），默认等于 f */
  f2?: number;
  /** 秒，默认 0.08 */
  dur?: number;
  type?: OscillatorType;
  /** 0–1，默认 0.15 */
  vol?: number;
  /** 延迟秒 */
  at?: number;
}

/** 合成一个或几个短音 */
export function sfx(...tones: Tone[]): void {
  const a = ac();
  if (!a) return;
  for (const t of tones) {
    const t0 = a.currentTime + (t.at ?? 0);
    const dur = t.dur ?? 0.08;
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = t.type ?? 'square';
    o.frequency.setValueAtTime(t.f, t0);
    if (t.f2) o.frequency.exponentialRampToValueAtTime(t.f2, t0 + dur);
    g.gain.setValueAtTime(t.vol ?? 0.15, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g).connect(a.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }
}

/** 常用音效 */
export const SFX = {
  tap: () => sfx({ f: 660, dur: 0.04, vol: 0.08 }),
  pick: () => sfx({ f: 440, f2: 880, dur: 0.09, type: 'triangle' }),
  drop: () => sfx({ f: 220, f2: 110, dur: 0.1, type: 'triangle', vol: 0.2 }),
  coin: () => sfx({ f: 988, dur: 0.05 }, { f: 1319, dur: 0.12, at: 0.05 }),
  bigCoin: () => sfx({ f: 784, dur: 0.06 }, { f: 988, dur: 0.06, at: 0.06 }, { f: 1319, dur: 0.18, at: 0.12 }),
  bad: () => sfx({ f: 160, f2: 90, dur: 0.22, type: 'sawtooth', vol: 0.12 }),
  buzz: () => sfx({ f: 110, dur: 0.18, type: 'square', vol: 0.1 }),
  whoosh: () => sfx({ f: 300, f2: 1200, dur: 0.12, type: 'sine', vol: 0.08 }),
  fanfare: () =>
    sfx(
      { f: 523, dur: 0.1 },
      { f: 659, dur: 0.1, at: 0.1 },
      { f: 784, dur: 0.1, at: 0.2 },
      { f: 1047, dur: 0.3, at: 0.3 },
    ),
};

/** 手机震动（支持的设备），毫秒 */
export function buzz(ms: number | number[] = 12): void {
  if (muted) return;
  navigator.vibrate?.(ms);
}

export interface FloatOpts {
  kind?: 'good' | 'bad' | 'gold' | '';
  /** 往上飘多少像素，默认 36 */
  rise?: number;
  /** 毫秒，默认 900 */
  ms?: number;
}

/** 在容器里 (x, y)（相对容器的 CSS 像素）飘一个字 */
export function floatText(host: HTMLElement, x: number, y: number, text: string, o: FloatOpts = {}): void {
  const el = document.createElement('div');
  el.className = `k-float ${o.kind ?? ''}`;
  el.textContent = text;
  host.appendChild(el);
  const w = el.offsetWidth;
  const rise = o.rise ?? 36;
  const ms = o.ms ?? 900;
  el.animate(
    [
      { transform: `translate(${x - w / 2}px, ${y}px) scale(.6)`, opacity: 0 },
      { transform: `translate(${x - w / 2}px, ${y - 10}px) scale(1.15)`, opacity: 1, offset: 0.15 },
      { transform: `translate(${x - w / 2}px, ${y - rise}px) scale(1)`, opacity: 1, offset: 0.7 },
      { transform: `translate(${x - w / 2}px, ${y - rise - 8}px) scale(1)`, opacity: 0 },
    ],
    { duration: ms, easing: 'cubic-bezier(.2,.8,.3,1)' },
  ).onfinish = () => el.remove();
}

/** 抖一下元素 */
export function shake(el: HTMLElement): void {
  el.classList.remove('k-shake');
  void el.offsetWidth;
  el.classList.add('k-shake');
}

/** 弹一下元素（数字跳动） */
export function pop(el: HTMLElement): void {
  el.classList.remove('k-pop');
  void el.offsetWidth;
  el.classList.add('k-pop');
}

/** 全屏闪一下颜色 */
export function flash(host: HTMLElement, color = '#fff'): void {
  const el = document.createElement('div');
  el.className = 'k-flash';
  el.style.background = color;
  host.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}

/** 数字滚动到目标值 */
export function tween(from: number, to: number, ms: number, on: (v: number) => void): void {
  const t0 = performance.now();
  const step = (t: number) => {
    const k = Math.min(1, (t - t0) / ms);
    on(from + (to - from) * (1 - (1 - k) ** 3));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/**
 * 亲手扫的"手感"小工具（照 sandbox demo 的 kit/juice.ts，游戏不引用 sandbox）：合成音效、噪声音、震动、飞字、抖屏、闪屏。
 * 只做反馈，不碰数值。?mute 关掉声音和震动。
 */

const muted = typeof location !== 'undefined' && new URLSearchParams(location.search).has('mute');
let ctx: AudioContext | null = null;
let noiseBuf: AudioBuffer | null = null;

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

interface Tone {
  f: number;
  f2?: number;
  dur?: number;
  type?: OscillatorType;
  vol?: number;
  at?: number;
}

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

/** 带通噪声（沙沙、嘶嘶、水声） */
export function noise(dur = 0.08, freq = 2000, vol = 0.05, q = 1): void {
  const a = ac();
  if (!a) return;
  if (!noiseBuf) {
    noiseBuf = a.createBuffer(1, a.sampleRate * 0.5, a.sampleRate);
    const ch = noiseBuf.getChannelData(0);
    // 音色用的白噪声（只是声音，和模拟无关）
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
  }
  const s = a.createBufferSource();
  const f = a.createBiquadFilter();
  const g = a.createGain();
  s.buffer = noiseBuf;
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = q;
  g.gain.setValueAtTime(vol, a.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
  s.connect(f).connect(g).connect(a.destination);
  s.start();
  s.stop(a.currentTime + dur + 0.02);
}

export const SND = {
  tap: () => sfx({ f: 660, dur: 0.04, vol: 0.08 }),
  pick: () => sfx({ f: 440, f2: 880, dur: 0.09, type: 'triangle' }),
  drop: () => sfx({ f: 220, f2: 110, dur: 0.1, type: 'triangle', vol: 0.2 }),
  coin: () => sfx({ f: 988, dur: 0.05 }, { f: 1319, dur: 0.12, at: 0.05 }),
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
  sweep: () => noise(0.09, 3200, 0.05, 0.8),
  squeegee: () => noise(0.09, 1200, 0.05, 1.2),
  roll: () => sfx({ f: 60, dur: 0.08, vol: 0.06 }),
  crunch: () => noise(0.05, 500, 0.1, 1.5),
  hiss: () => noise(0.06, 6000, 0.03, 2),
  splash: () => noise(0.1, 1500, 0.05, 0.7),
  plink: (i: number) => sfx({ f: 880 + (i % 5) * 110, dur: 0.05, vol: 0.09, type: 'triangle' }),
  wind: () => {
    noise(0.6, 400, 0.1, 0.4);
    noise(0.6, 800, 0.06, 0.4);
  },
  snap: () => {
    noise(0.2, 900, 0.14, 0.6);
    sfx({ f: 300, f2: 50, dur: 0.3, type: 'sawtooth', vol: 0.1 });
  },
  twang: (p: number) => sfx({ f: 180 * p, f2: 240 * p, dur: 0.35, type: 'triangle', vol: 0.18 }),
  tick: (i: number) => sfx({ f: 200 + i * 30, dur: 0.03, vol: 0.06 }),
};

export function buzz(ms: number | number[] = 12): void {
  if (muted) return;
  navigator.vibrate?.(ms);
}

/** 节流：key 这一类反馈 ms 毫秒内只来一次 */
export function makeEvery(): (key: string, ms: number) => boolean {
  const next: Record<string, number> = {};
  return (key, ms) => {
    const n = performance.now();
    if ((next[key] ?? 0) > n) return false;
    next[key] = n + ms;
    return true;
  };
}

/** 在容器里 (x, y)（相对容器的 CSS 像素）飘一个字；空字不飘 */
export function floatText(
  host: HTMLElement,
  x: number,
  y: number,
  text: string,
  kind: '' | 'good' | 'bad' | 'gold' = '',
): void {
  if (!text) return;
  const el = document.createElement('div');
  el.className = `tdc-float ${kind}`;
  el.textContent = text;
  host.appendChild(el);
  const w = el.offsetWidth;
  el.animate(
    [
      { transform: `translate(${x - w / 2}px, ${y}px) scale(.6)`, opacity: 0 },
      { transform: `translate(${x - w / 2}px, ${y - 10}px) scale(1.15)`, opacity: 1, offset: 0.15 },
      { transform: `translate(${x - w / 2}px, ${y - 36}px) scale(1)`, opacity: 1, offset: 0.7 },
      { transform: `translate(${x - w / 2}px, ${y - 44}px) scale(1)`, opacity: 0 },
    ],
    { duration: 900, easing: 'cubic-bezier(.2,.8,.3,1)' },
  ).onfinish = () => el.remove();
}

export function retrigger(el: HTMLElement, cls: string): void {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

export function flash(host: HTMLElement, color = '#fff'): void {
  const el = document.createElement('div');
  el.className = 'tdc-flash';
  el.style.background = color;
  host.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}

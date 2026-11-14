// 时间面板（左上角，像素级别那一栏下面）：一个小牌子"12:00 中午 · 晴"，点开 = 拖时刻的滑条、四个时段、天气、时间快慢。
// 手机优先：所有按钮 ≥ 44 px，滑条整条 44 px 高（Pointer Events，拇指拖）。按钮外观跟 .pxsel button（各页面 html 里）同一套。
import { clockText, periodName, WEATHER_NAME, WEATHERS, type Weather } from './sky';

export interface DayHudHost {
  /** current = 现在实际的天气（自动时是抽到的那种） */
  get(): { total: number; weather: Weather | 'auto'; speed: number; current: Weather };
  setHour(h: number): void;
  setWeather(w: Weather | 'auto'): void;
  setSpeed(s: number): void;
}

const CSS = `
.daysel { z-index: 6; }
.day-panel { position: fixed; left: max(15px, calc(env(safe-area-inset-left) + 7px)); top: 80px; display: flex; flex-direction: column; gap: 10px; padding: 10px; width: min(300px, calc(100vw - 36px)); box-sizing: border-box; background: rgba(44, 36, 80, 0.92); box-shadow: 3px 0 0 0 #fff3d6, -3px 0 0 0 #fff3d6, 0 3px 0 0 #fff3d6, 0 -3px 0 0 #fff3d6, 0 6px 0 0 #171230; }
.day-panel[hidden] { display: none; }
.day-row { display: flex; flex-wrap: wrap; gap: 10px 8px; }
.day-row button { flex: 1 1 0; min-width: 0; min-height: 44px; padding: 0 4px; }
.day-row.w3 button { flex: 1 1 28%; }
.day-row button[aria-pressed="true"] { background: #fff3d6; color: #2c2450; }
.day-title { font-size: 12px; opacity: 0.8; }
.day-slider { position: relative; height: 44px; touch-action: none; cursor: pointer; }
.day-slider .track { position: absolute; left: 0; right: 0; top: 18px; height: 8px; background: linear-gradient(90deg, #232c58 0%, #232c58 20%, #f2aa8c 27%, #8cc4ec 38%, #8cc4ec 70%, #f29462 76%, #4a3a7a 82%, #232c58 86%, #232c58 100%); box-shadow: 0 0 0 2px #171230; }
.day-slider .knob { position: absolute; top: 8px; width: 14px; height: 28px; margin-left: -7px; background: #fff3d6; box-shadow: 0 0 0 2px #171230, 0 3px 0 2px #171230; }
`;

export function mountDayHud(host: HTMLElement, h: DayHudHost): { sync(): void } {
  if (!document.getElementById('day-hud-css')) {
    const st = document.createElement('style');
    st.id = 'day-hud-css';
    st.textContent = CSS;
    document.head.appendChild(st);
  }
  const chip = document.createElement('button');
  chip.className = 'px-chip day-chip';
  chip.type = 'button';
  chip.setAttribute('aria-haspopup', 'true');
  chip.setAttribute('aria-expanded', 'false');
  const panel = document.createElement('div');
  panel.className = 'day-panel';
  panel.hidden = true;
  chip.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    chip.setAttribute('aria-expanded', String(!panel.hidden));
  });

  // 滑条：0..24 点，15 分钟一格
  const title = document.createElement('div');
  title.className = 'day-title';
  const slider = document.createElement('div');
  slider.className = 'day-slider';
  slider.setAttribute('role', 'slider');
  slider.setAttribute('aria-valuemin', '0');
  slider.setAttribute('aria-valuemax', '24');
  slider.tabIndex = 0;
  const track = document.createElement('div');
  track.className = 'track';
  const knob = document.createElement('div');
  knob.className = 'knob';
  slider.append(track, knob);
  const hourAt = (e: PointerEvent) => {
    const r = slider.getBoundingClientRect();
    const t = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    return Math.round(t * 24 * 4) / 4;
  };
  let dragging = false;
  slider.addEventListener('pointerdown', (e) => {
    dragging = true;
    slider.setPointerCapture(e.pointerId);
    h.setHour(Math.min(23.75, hourAt(e)));
    e.preventDefault();
  });
  slider.addEventListener('pointermove', (e) => {
    if (dragging) h.setHour(Math.min(23.75, hourAt(e)));
  });
  const stop = () => {
    dragging = false;
  };
  slider.addEventListener('pointerup', stop);
  slider.addEventListener('pointercancel', stop);
  slider.addEventListener('keydown', (e) => {
    const cur = h.get().total % 24;
    if (e.key === 'ArrowRight') h.setHour(cur + 0.25);
    else if (e.key === 'ArrowLeft') h.setHour(cur - 0.25);
  });

  const row = (items: [string, () => void, () => boolean][], cls = '') => {
    const r = document.createElement('div');
    r.className = `day-row ${cls}`;
    const btns = items.map(([label, on, pressed]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.addEventListener('click', on);
      r.appendChild(b);
      return { b, pressed };
    });
    return {
      el: r,
      sync: () => {
        for (const { b, pressed } of btns) b.setAttribute('aria-pressed', String(pressed()));
      },
    };
  };
  const hourNow = () => ((h.get().total % 24) + 24) % 24;
  const near = (x: number) => Math.abs(hourNow() - x) < 0.13;
  const times = row([
    ['清晨', () => h.setHour(6.5), () => near(6.5)],
    ['中午', () => h.setHour(12), () => near(12)],
    ['傍晚', () => h.setHour(18.1), () => near(18.1)],
    ['夜里', () => h.setHour(22), () => near(22)],
  ]);
  const weathers = row(
    [
      ['自动', () => h.setWeather('auto'), () => h.get().weather === 'auto'],
      ...WEATHERS.map(
        (w) =>
          [WEATHER_NAME[w], () => h.setWeather(w), () => h.get().weather === w] as [string, () => void, () => boolean],
      ),
    ],
    'w3',
  );
  const speeds = row([
    ['停', () => h.setSpeed(0), () => h.get().speed === 0],
    ['慢', () => h.setSpeed(120), () => h.get().speed === 120],
    ['快', () => h.setSpeed(720), () => h.get().speed === 720],
  ]);
  const lab = (t: string) => {
    const d = document.createElement('div');
    d.className = 'day-title';
    d.textContent = t;
    return d;
  };
  panel.append(title, slider, times.el, lab('天气'), weathers.el, lab('时间（慢 = 半分钟一小时）'), speeds.el);
  // 自己一个容器（同 .pxsel 的样子），摆在像素级别牌子的右边：竖着排会压到玩法 HUD 顶上的状态条
  const box = document.createElement('div');
  box.className = 'pxsel daysel';
  box.append(chip, panel);
  document.body.appendChild(box);
  const anchor = host.firstElementChild as HTMLElement | null;
  let anchorRight = -1;
  const place = () => {
    // 面板：从屏幕左边、牌子下面展开（不跟着牌子往右挤出屏幕）
    if (!panel.hidden) panel.style.top = `${Math.round(chip.getBoundingClientRect().bottom) + 12}px`;
    const r = anchor?.getBoundingClientRect();
    const right = r && r.width > 0 ? Math.round(r.right) : -1;
    if (right === anchorRight) return;
    anchorRight = right;
    if (right < 0) {
      // 没有像素牌子（或藏着）：就放在左上角
      box.style.left = '';
      box.style.top = '';
      return;
    }
    box.style.left = `${right + 12}px`;
    box.style.top = `${Math.round(r!.top) - 3}px`;
  };

  let last = '';
  return {
    sync() {
      place();
      const s = h.get();
      const hr = hourNow();
      const wName = WEATHER_NAME[s.current] + (s.weather === 'auto' ? '' : '·定');
      const text = `${clockText(hr)} ${periodName(hr)} · ${wName}`;
      const key = `${text}|${s.speed}`;
      if (key === last) return;
      last = key;
      chip.textContent = `${clockText(hr)} ${wName}`;
      title.textContent = text;
      knob.style.left = `${(hr / 24) * 100}%`;
      slider.setAttribute('aria-valuenow', hr.toFixed(2));
      times.sync();
      weathers.sync();
      speeds.sync();
    },
  };
}

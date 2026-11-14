// 代客泊车的界面（DOM 叠层，壳的 HUD 下面、play 的按钮上面）：
//   开车摇杆   开车时整个画面是一块触摸板：按下的地方出摇杆，拖 = 往哪开（拖向车尾 = 倒车），松手 = 刹车
//   挡位牌     摇杆旁边一块 "D 前进" / "R 倒车"
//   停车仪表   离派的车位近了出来：角度、入位多少、现在差什么
//   耐心条     排队的车顶上一条（在画面外就贴着画面边），见底变红
// 像素风同壳：深靛底 #2c2450 + 奶油描边 #fff3d6 + 方块投影 #171230。
const CSS = `
.vl-pad { position: fixed; inset: 0; z-index: 5; pointer-events: none; touch-action: none; }
.vl-pad.on { pointer-events: auto; }
.vl-joy { position: absolute; left: 0; top: 0; width: 0; height: 0; pointer-events: none; }
.vl-joy[hidden] { display: none; }
.vl-joy::before { content: ""; position: absolute; left: -62px; top: -62px; width: 124px; height: 124px; border-radius: 50%; background: rgba(44, 36, 80, 0.42); box-shadow: inset 0 0 0 3px rgba(255, 243, 214, 0.85); }
.vl-knob { position: absolute; left: -26px; top: -26px; width: 52px; height: 52px; border-radius: 50%; background: #fff3d6; box-shadow: inset 0 -5px 0 0 #d8b088, 0 4px 0 0 #171230; display: flex; align-items: center; justify-content: center; font: 700 18px/1 ui-monospace, monospace; color: #2c2450; }
.vl-knob.rev { background: #ff8a7a; box-shadow: inset 0 -5px 0 0 #c0545a, 0 4px 0 0 #171230; color: #fff3d6; }
.vl-ui { position: fixed; inset: 0; z-index: 5; pointer-events: none; font: 700 13px/1.2 "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", ui-monospace, monospace; color: #fff3d6; letter-spacing: 1px; -webkit-font-smoothing: none; user-select: none; -webkit-user-select: none; }
.vl-px { background: #2c2450; box-shadow: 3px 0 0 0 #fff3d6, -3px 0 0 0 #fff3d6, 0 3px 0 0 #fff3d6, 0 -3px 0 0 #fff3d6, 0 6px 0 0 #171230, 3px 3px 0 0 #171230, -3px 3px 0 0 #171230; }
.vl-gear { position: absolute; right: max(18px, calc(env(safe-area-inset-right) + 10px)); bottom: calc(max(26px, env(safe-area-inset-bottom) + 14px)); display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 8px 12px 9px; min-width: 64px; }
.vl-gear b { font-size: 26px; color: #8fe36a; line-height: 1; }
.vl-gear.rev b { color: #ff8a7a; }
.vl-gear small { font-size: 11px; opacity: 0.85; }
.vl-gear[hidden], .vl-help[hidden], .vl-gauge[hidden] { display: none; }
.vl-help { position: absolute; left: max(16px, env(safe-area-inset-left)); right: 110px; bottom: calc(max(24px, env(safe-area-inset-bottom) + 12px)); padding: 7px 10px; font-size: 12px; line-height: 1.45; opacity: 0.93; }
.vl-help b { color: #ffd23c; }
.vl-gauge { position: absolute; left: 50%; top: max(150px, calc(env(safe-area-inset-top) + 142px)); transform: translateX(-50%); padding: 8px 12px 9px; display: grid; grid-template-columns: auto 92px auto; gap: 5px 8px; align-items: center; font-size: 12px; white-space: nowrap; }
.vl-gauge .bar { position: relative; height: 10px; background: #171230; box-shadow: 0 0 0 2px #4a4270; }
.vl-gauge .bar i { position: absolute; left: 0; top: 0; bottom: 0; background: #ffd23c; }
.vl-gauge .bar i.ok { background: #8fe36a; }
.vl-gauge .bar i.bad { background: #f07c4c; }
.vl-gauge .tick { position: absolute; top: -3px; bottom: -3px; width: 2px; background: #fff3d6; }
.vl-gauge em { font-style: normal; color: #ffd23c; min-width: 34px; text-align: right; }
.vl-gauge .st { grid-column: 1 / -1; text-align: center; font-size: 14px; color: #fff3d6; padding-top: 2px; }
.vl-gauge .st.ok { color: #8fe36a; }
.vl-gauge .st.bad { color: #ffb08a; }
.vl-pat { position: absolute; left: 0; top: 0; width: 46px; height: 9px; margin: -4px 0 0 -23px; background: #171230; box-shadow: 0 0 0 2px #fff3d6, 0 4px 0 0 rgba(23, 18, 48, 0.6); }
.vl-pat i { position: absolute; left: 0; top: 0; bottom: 0; background: #8fe36a; }
.vl-pat.mid i { background: #ffd23c; }
.vl-pat.low i { background: #ff7a7a; }
.vl-pat.low { animation: vl-blink 0.5s steps(2, end) infinite; }
.vl-pat.angry { box-shadow: 0 0 0 2px #ff7a7a, 0 4px 0 0 rgba(23, 18, 48, 0.6); }
.vl-pat span { position: absolute; left: 50%; top: -19px; transform: translateX(-50%); font-size: 11px; white-space: nowrap; color: #fff3d6; text-shadow: 2px 0 0 #171230, -2px 0 0 #171230, 0 2px 0 #171230, 0 -2px 0 #171230; }
.vl-pat.edge { opacity: 0.9; }
@keyframes vl-blink { 50% { opacity: 0.45; } }
.mg-paused .vl-pad, .mg-paused .vl-ui { display: none; }
`;

export interface GaugeView {
  /** 角度差（度） */
  angle: number;
  /** 入位（0..1） */
  fill: number;
  ok: boolean;
  /** 一句话：现在差什么 */
  status: string;
  tone: 'ok' | 'bad' | '';
}

export interface PatBar {
  id: number;
  /** 屏幕 CSS 坐标（null = 不画） */
  x: number;
  y: number;
  frac: number;
  angry: boolean;
  label?: string;
  edge?: boolean;
}

export interface DriveUi {
  /** 开车时的摇杆（屏幕方向，−1..1）；键盘 WASD / 方向键也算 */
  stick(): { x: number; y: number };
  /** 外面（机器人、测试）直接给摇杆；null = 交还给手指 */
  forceStick(v: { x: number; y: number } | null): void;
  setDriving(on: boolean): void;
  setGear(g: 1 | -1): void;
  gauge(v: GaugeView | null): void;
  bars(list: readonly PatBar[]): void;
}

export function createDriveUi(): DriveUi {
  if (!document.getElementById('vl-css')) {
    const st = document.createElement('style');
    st.id = 'vl-css';
    st.textContent = CSS;
    document.head.appendChild(st);
  }
  const pad = document.body.appendChild(document.createElement('div'));
  pad.className = 'vl-pad';
  pad.innerHTML = '<div class="vl-joy" hidden><div class="vl-knob">D</div></div>';
  const joy = pad.querySelector('.vl-joy') as HTMLDivElement;
  const knob = pad.querySelector('.vl-knob') as HTMLDivElement;
  const ui = document.body.appendChild(document.createElement('div'));
  ui.className = 'vl-ui';
  ui.innerHTML = `
    <div class="vl-gauge vl-px" hidden>
      <span>角度</span><div class="bar"><i></i><div class="tick"></div></div><em class="a">0°</em>
      <span>入位</span><div class="bar"><i></i></div><em class="f">0%</em>
      <div class="st"></div>
    </div>
    <div class="vl-help vl-px" hidden>按住画面拖：<b>往哪拖车就往哪开</b>；拖向车尾 = <b>倒车</b>；松手 = 刹车</div>
    <div class="vl-gear vl-px" hidden><b>D</b><small>前进</small></div>
    <div class="vl-pats"></div>`;
  const q = <T extends HTMLElement>(s: string) => ui.querySelector(s) as T;
  const gaugeEl = q<HTMLDivElement>('.vl-gauge');
  const [aBar, fBar] = [...gaugeEl.querySelectorAll('.bar i')] as HTMLElement[];
  const aTick = q<HTMLDivElement>('.vl-gauge .tick');
  const aTxt = q<HTMLElement>('.vl-gauge .a');
  const fTxt = q<HTMLElement>('.vl-gauge .f');
  const stTxt = q<HTMLDivElement>('.vl-gauge .st');
  const help = q<HTMLDivElement>('.vl-help');
  const gearEl = q<HTMLDivElement>('.vl-gear');
  const pats = q<HTMLDivElement>('.vl-pats');

  // ── 摇杆 ──
  const R = 62;
  let ptr: number | null = null;
  let ox = 0;
  let oy = 0;
  const touch = { x: 0, y: 0 };
  let forced: { x: number; y: number } | null = null;
  const keys = new Set<string>();
  let driving = false;
  const placeKnob = (dx: number, dy: number) => {
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
  };
  pad.addEventListener('pointerdown', (e) => {
    if (!driving || ptr !== null) return;
    ptr = e.pointerId;
    try {
      pad.setPointerCapture(e.pointerId);
    } catch {
      // 测试环境里合成的事件没有真指针
    }
    ox = e.clientX;
    oy = e.clientY;
    joy.hidden = false;
    joy.style.transform = `translate(${ox}px, ${oy}px)`;
    placeKnob(0, 0);
    touch.x = touch.y = 0;
    e.preventDefault();
  });
  pad.addEventListener('pointermove', (e) => {
    if (e.pointerId !== ptr) return;
    let dx = e.clientX - ox;
    let dy = e.clientY - oy;
    const l = Math.hypot(dx, dy);
    if (l > R) {
      dx = (dx / l) * R;
      dy = (dy / l) * R;
    }
    placeKnob(dx, dy);
    touch.x = dx / R;
    touch.y = dy / R;
  });
  const up = (e: PointerEvent) => {
    if (e.pointerId !== ptr) return;
    ptr = null;
    joy.hidden = true;
    touch.x = touch.y = 0;
  };
  pad.addEventListener('pointerup', up);
  pad.addEventListener('pointercancel', up);
  pad.addEventListener('lostpointercapture', up);
  pad.addEventListener('contextmenu', (e) => e.preventDefault());
  const KEYS: Record<string, [number, number]> = {
    KeyW: [0, -1],
    ArrowUp: [0, -1],
    KeyS: [0, 1],
    ArrowDown: [0, 1],
    KeyA: [-1, 0],
    ArrowLeft: [-1, 0],
    KeyD: [1, 0],
    ArrowRight: [1, 0],
  };
  addEventListener('keydown', (e) => {
    if (KEYS[e.code]) keys.add(e.code);
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());

  let lastGear: 1 | -1 = 1;
  let patEls = new Map<number, HTMLDivElement>();

  return {
    stick() {
      if (forced) return forced;
      let kx = 0;
      let ky = 0;
      for (const k of keys) {
        kx += KEYS[k][0];
        ky += KEYS[k][1];
      }
      const x = touch.x + kx;
      const y = touch.y + ky;
      const l = Math.hypot(x, y);
      return l > 1 ? { x: x / l, y: y / l } : { x, y };
    },
    forceStick(v) {
      forced = v;
    },
    setDriving(on) {
      driving = on;
      pad.classList.toggle('on', on);
      help.hidden = !on;
      gearEl.hidden = !on;
      if (!on) {
        ptr = null;
        joy.hidden = true;
        touch.x = touch.y = 0;
      }
    },
    setGear(g) {
      if (g === lastGear) return;
      lastGear = g;
      gearEl.classList.toggle('rev', g < 0);
      gearEl.innerHTML = g < 0 ? '<b>R</b><small>倒车</small>' : '<b>D</b><small>前进</small>';
      knob.classList.toggle('rev', g < 0);
      knob.textContent = g < 0 ? 'R' : 'D';
    },
    gauge(v) {
      gaugeEl.hidden = !v;
      if (!v) return;
      // 角度：0° 在中间刻度，满格 = 20°
      const a = Math.min(1, v.angle / 20);
      aBar.style.width = `${Math.round((1 - a) * 100)}%`;
      aBar.className = v.angle <= 10 ? 'ok' : 'bad';
      aTick.style.left = `${50}%`;
      aTxt.textContent = `${Math.round(v.angle)}°`;
      fBar.style.width = `${Math.round(v.fill * 100)}%`;
      fBar.className = v.fill >= 0.999 ? 'ok' : v.fill > 0.5 ? '' : 'bad';
      fTxt.textContent = `${Math.round(v.fill * 100)}%`;
      stTxt.textContent = v.status;
      stTxt.className = `st ${v.tone}`;
    },
    bars(list) {
      const next = new Map<number, HTMLDivElement>();
      for (const b of list) {
        let el = patEls.get(b.id);
        if (!el) {
          el = pats.appendChild(document.createElement('div'));
          el.className = 'vl-pat';
          el.innerHTML = '<i></i><span></span>';
        }
        next.set(b.id, el);
        el.style.transform = `translate(${Math.round(b.x)}px, ${Math.round(b.y)}px)`;
        (el.firstChild as HTMLElement).style.width = `${Math.round(Math.max(0, b.frac) * 100)}%`;
        el.className = `vl-pat${b.frac < 0.3 ? ' low' : b.frac < 0.6 ? ' mid' : ''}${b.angry ? ' angry' : ''}${b.edge ? ' edge' : ''}`;
        (el.lastChild as HTMLElement).textContent = b.label ?? '';
      }
      for (const [id, el] of patEls) if (!next.has(id)) el.remove();
      patEls = next;
    },
  };
}

// 玩法界面（DOM 叠层，样式 style.ts 自动塞进页面）：
// - 画面上按住 = 往手指下面走（开车 = 往手指那边开，手指离车越远越快；没有虚拟摇杆）；
//   轻点 = 走过去（点到互动点 / 地上的东西 = 走过去用它）；两指捏 / 滚轮 = 缩放。
// - 右下：大的动作键（按住干活），它上面是拿/放键；都 ≥ 56 px。只在有事可做时出现，字就是要做的事。
// - 顶栏（场景给的数：play.stat）、气泡（play.say / bubble，按相机投影摆，人在画面外就贴着画面边）、提示（play.toast）、
//   互动点头上的小箭头。
// - 键盘（桌面）：WASD/方向键走，空格/E 按住干活，F/回车 拿放。
import * as THREE from 'three';
import type { Anchor, Play } from './control';
import { PLAY_CSS } from './style';

export interface Hud {
  /** 每帧（渲染后）刷新 */
  frame(): void;
  readonly root: HTMLElement;
}

/** 轻点：多短、挪多少以内 */
const TAP_MS = 300;
const TAP_PX = 12;
/** 按着不动多久算"按住"（开始往手指走） */
const HOLD_MS = 140;

export function createHud(
  play: Play,
  canvas: HTMLCanvasElement,
  opts: { root?: HTMLElement; hint?: string } = {},
): Hud {
  if (!document.getElementById('club-play-css')) {
    const st = document.createElement('style');
    st.id = 'club-play-css';
    st.textContent = PLAY_CSS;
    document.head.appendChild(st);
  }
  const root = opts.root ?? document.body.appendChild(document.createElement('div'));
  root.classList.add('play-root');
  root.innerHTML = `
    <div class="play-bar"></div>
    <div class="play-hint">${opts.hint ?? '按住画面往手指走 · 点地面走过去'}</div>
    <div class="play-mark" hidden></div>
    <div class="play-bubbles"></div>
    <div class="play-toast gone"></div>
    <div class="play-buttons">
      <button class="play-btn play-pick" type="button" hidden></button>
      <button class="play-btn play-use" type="button" hidden></button>
    </div>`;
  const q = <T extends HTMLElement>(sel: string) => root.querySelector(sel) as T;
  const el = {
    bar: q('.play-bar'),
    hint: q('.play-hint'),
    mark: q('.play-mark'),
    bubbles: q('.play-bubbles'),
    toast: q('.play-toast'),
    pick: q<HTMLButtonElement>('.play-pick'),
    use: q<HTMLButtonElement>('.play-use'),
  };
  const W = () => canvas.clientWidth;
  const Hh = () => canvas.clientHeight;

  // ── 画面上的指针：按住走 / 轻点 / 两指缩放 ──
  // 没有虚拟摇杆（同《Sneaky Sasquatch》）：手指按住画面，总监往手指下面走、车往手指那边开（play.setPointer）。
  // 按下以后挪过 TAP_PX 或按满 HOLD_MS 才算"按住"（不然轻点也会先蹭一步）；第二根手指落下 = 缩放，不走了。
  type P = { x0: number; y0: number; x: number; y: number; t0: number };
  const ptrs = new Map<number, P>();
  /** 正在按住走的那根手指；steering = 已经过了轻点的门槛、在走了 */
  let steerId: number | null = null;
  let steering = false;
  let pinch0 = 0;
  let hintGone = false;
  const hideHint = () => {
    if (hintGone) return;
    hintGone = true;
    el.hint.classList.add('gone');
  };
  const steerTo = (p: P) => play.setPointer({ x: p.x, y: p.y, w: W(), h: Hh() });
  const startSteer = (p: P) => {
    steering = true;
    steerTo(p);
    hideHint();
  };
  const endSteer = () => {
    steerId = null;
    steering = false;
    play.setPointer(null);
  };
  const pinchDist = () => {
    const pts = [...ptrs.values()];
    return pts.length >= 2 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0;
  };

  canvas.addEventListener('pointerdown', (e) => {
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {}
    const p: P = { x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, t0: performance.now() };
    ptrs.set(e.pointerId, p);
    if (ptrs.size >= 2) {
      // 第二根手指：缩放
      endSteer();
      pinch0 = pinchDist();
      return;
    }
    steerId = e.pointerId;
    steering = false;
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = ptrs.get(e.pointerId);
    if (!p) return;
    p.x = e.clientX;
    p.y = e.clientY;
    if (e.pointerId === steerId) {
      if (steering) steerTo(p);
      else if (Math.hypot(p.x - p.x0, p.y - p.y0) > TAP_PX) startSteer(p);
      return;
    }
    const d = pinchDist();
    if (d > 0) {
      if (pinch0 > 0) play.zoomBy(pinch0 / Math.max(d, 1));
      pinch0 = d;
    }
  });
  const up = (e: PointerEvent) => {
    const p = ptrs.get(e.pointerId);
    ptrs.delete(e.pointerId);
    if (!p) return;
    const tap = performance.now() - p.t0 < TAP_MS && Math.hypot(p.x - p.x0, p.y - p.y0) < TAP_PX;
    if (e.pointerId === steerId) endSteer();
    if (ptrs.size < 2) pinch0 = 0;
    if (tap && e.type === 'pointerup' && ptrs.size === 0 && pinchDist() === 0) {
      play.tapScreen(p.x, p.y, W(), Hh());
      hideHint();
    }
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      play.zoomBy(Math.exp(e.deltaY * 0.001));
    },
    { passive: false },
  );

  // ── 按钮 ──
  const press = (b: HTMLButtonElement, down: () => void, upFn?: () => void) => {
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        b.setPointerCapture(e.pointerId);
      } catch {}
      b.classList.add('down');
      down();
    });
    const release = () => {
      if (!b.classList.contains('down')) return;
      b.classList.remove('down');
      upFn?.();
    };
    b.addEventListener('pointerup', release);
    b.addEventListener('pointercancel', release);
    b.addEventListener('lostpointercapture', release);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
  };
  press(
    el.use,
    () => play.setUse(true),
    () => play.setUse(false),
  );
  press(el.pick, () => play.pick());

  // ── 键盘（桌面第二布局） ──
  const MOVE = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
  addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement | null)?.closest?.('input, textarea, select')) return;
    if (MOVE.has(e.code)) {
      play.setKey(e.code, true);
      hideHint();
      e.preventDefault();
    } else if ((e.code === 'Space' || e.code === 'KeyE') && !e.repeat) {
      play.setUse(true);
      el.use.classList.add('down');
      e.preventDefault();
    } else if ((e.code === 'KeyF' || e.code === 'Enter') && !e.repeat) {
      play.pick();
      e.preventDefault();
    }
  });
  addEventListener('keyup', (e) => {
    if (MOVE.has(e.code)) play.setKey(e.code, false);
    else if (e.code === 'Space' || e.code === 'KeyE') {
      play.setUse(false);
      el.use.classList.remove('down');
    }
  });
  addEventListener('blur', () => {
    for (const k of MOVE) play.setKey(k, false);
    play.setUse(false);
    endSteer();
  });

  // ── 每帧 ──
  const bubbleEls: HTMLDivElement[] = [];
  let lastUse = '';
  let lastPick = '';
  let lastStats = '';
  let toastId = 0;
  return {
    root,
    frame() {
      // 按着不动满 HOLD_MS：开始往手指走
      if (steerId !== null && !steering) {
        const p = ptrs.get(steerId);
        if (p && performance.now() - p.t0 >= HOLD_MS) startSteer(p);
      }
      const ui = play.ui();
      const w = W();
      const h = Hh();
      if (ui.use !== lastUse) {
        lastUse = ui.use;
        el.use.textContent = ui.use;
        el.use.hidden = !ui.use;
        if (!ui.use && el.use.classList.contains('down')) {
          el.use.classList.remove('down');
          play.setUse(false);
        }
      }
      el.use.classList.toggle('on', ui.usingNow);
      if (ui.pick !== lastPick) {
        lastPick = ui.pick;
        el.pick.textContent = ui.pick;
        el.pick.hidden = !ui.pick;
      }
      const sk = ui.stats.map((s) => `${s.label}\u0001${s.value}`).join('\u0002');
      if (sk !== lastStats) {
        lastStats = sk;
        el.bar.replaceChildren(
          ...ui.stats.map((s) => {
            const sp = document.createElement('span');
            sp.append(s.label);
            const b = document.createElement('b');
            b.textContent = s.value;
            sp.append(b);
            return sp;
          }),
        );
      }
      // 头上的小箭头
      el.mark.hidden = !ui.mark;
      if (ui.mark) {
        const p = play.project(ui.mark, w, h);
        el.mark.style.transform = `translate(${p.x.toFixed(0)}px, ${p.y.toFixed(0)}px)`;
      }
      // 气泡（复用 DOM）
      while (bubbleEls.length < ui.bubbles.length) {
        const b = document.createElement('div');
        b.className = 'play-bubble';
        el.bubbles.appendChild(b);
        bubbleEls.push(b);
      }
      bubbleEls.forEach((b, i) => {
        const a = ui.bubbles[i];
        const wp = a ? anchorPoint(a.anchor, a.dy) : null;
        b.hidden = !wp;
        if (!a || !wp) return;
        if (b.textContent !== a.text) b.textContent = a.text;
        const p = play.project(wp, w, h);
        // 人在画面外：贴着画面边（顶栏下面、按钮左边）
        const x = Math.min(Math.max(p.x, 48), w - 48);
        const y = Math.min(Math.max(p.y, 100), h - 24);
        b.classList.toggle('edge', x !== p.x || y !== p.y);
        b.style.transform = `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px) translate(-50%, -100%)`;
      });
      // 提示
      if (ui.toast && ui.toast.id !== toastId) {
        toastId = ui.toast.id;
        el.toast.textContent = ui.toast.text;
      }
      el.toast.classList.toggle('gone', !ui.toast);
    },
  };
}

const tmp = new THREE.Vector3();
function anchorPoint(a: Anchor, dy: number): THREE.Vector3 | null {
  if (typeof a === 'function') return a();
  if ((a as THREE.Vector3).isVector3) return a as THREE.Vector3;
  const o = a as THREE.Object3D;
  if (!o.parent || !o.visible) return null;
  o.getWorldPosition(tmp);
  tmp.y += dy;
  return tmp.clone();
}

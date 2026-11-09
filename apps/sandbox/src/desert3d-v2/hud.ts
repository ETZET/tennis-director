// 玩法模式的界面（DOM 叠层，样式在 desert3d-v2.html 的 .play-*）：
// - 顶上一条小栏：场地清洁度 %、散落的球（拿着捡球器时多一格"笼里"）。
// - 画面上拖动 = 浮动摇杆（从按下的地方出来；左下角一按下就出现）；轻点地面 = 走过去；两指捏 / 滚轮 = 缩放。
// - 右下：大的动作键（按住干活：扫 / 吹；倒球），它上面是拿/放键（拿起 吹风机 / 放下）。都 ≥ 56 px，拇指够得着。
// - 球员头顶的"有沙！""有球！"、教练的"没球了！"气泡按相机投影摆；人在画面外就贴着画面边（.edge）。
// - 键盘（桌面）：WASD/方向键走，空格/E 按住干活，F/回车 拿放。
import * as THREE from 'three';
import type { PixelPipeline } from '../clubsite/render/pipeline';
import type { Control } from './control';
import type { Alert } from './life';

export interface Hud {
  /** 每帧（渲染后）刷新文字、按钮、气泡 */
  frame(alerts: Alert[]): void;
}

const ZOOM_MIN = 0.06;
const ZOOM_MAX = 0.14;
// 上面两个是每纹素 2 像素时的范围；像素级别变了，按比例换算（取景范围不变）
/** 摇杆最大半径（CSS 像素） */
const JOY_R = 52;
/** 轻点：多短、挪多少以内 */
const TAP_MS = 280;
const TAP_PX = 12;

export function createHud(root: HTMLElement, canvas: HTMLCanvasElement, pipe: PixelPipeline, ctl: Control): Hud {
  root.classList.add('play-root');
  root.innerHTML = `
    <div class="play-bar">
      <span>场地清洁度 <b data-k="clean">0%</b></span>
      <span>散落的球 <b data-k="loose">0</b></span>
      <span data-k="cagebox" hidden>笼里 <b data-k="cage">0</b></span>
    </div>
    <div class="play-hint">拖动走路 · 点地面走过去</div>
    <div class="play-joy" hidden><div class="play-knob"></div></div>
    <div class="play-bubbles"></div>
    <div class="play-buttons">
      <button class="play-btn play-ctx" type="button" hidden></button>
      <button class="play-btn play-act" type="button" hidden></button>
    </div>`;
  const q = <T extends HTMLElement>(sel: string) => root.querySelector(sel) as T;
  const el = {
    clean: q('[data-k="clean"]'),
    loose: q('[data-k="loose"]'),
    cagebox: q('[data-k="cagebox"]'),
    cage: q('[data-k="cage"]'),
    hint: q('.play-hint'),
    joy: q('.play-joy'),
    knob: q('.play-knob'),
    bubbles: q('.play-bubbles'),
    ctx: q<HTMLButtonElement>('.play-ctx'),
    act: q<HTMLButtonElement>('.play-act'),
  };

  // ── 画面上的指针：摇杆 / 轻点 / 两指缩放 ──
  type P = { x0: number; y0: number; x: number; y: number; t0: number };
  const ptrs = new Map<number, P>();
  let joyId: number | null = null;
  let pinch0 = 0;
  let zoom0 = pipe.rig.metersPerTexel;
  let hintGone = false;
  const W = () => canvas.clientWidth;
  const Hh = () => canvas.clientHeight;
  /** 左下角：一按下摇杆就出来（拇指区） */
  const inThumbZone = (x: number, y: number) => x < W() * 0.55 && y > Hh() * 0.5;
  const showJoy = (p: P) => {
    el.joy.hidden = false;
    el.joy.style.transform = `translate(${p.x0}px, ${p.y0}px)`;
    updateJoy(p);
  };
  const updateJoy = (p: P) => {
    let dx = p.x - p.x0;
    let dy = p.y - p.y0;
    const d = Math.hypot(dx, dy);
    if (d > JOY_R) {
      dx = (dx / d) * JOY_R;
      dy = (dy / d) * JOY_R;
    }
    el.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    // 一点死区，满半径 = 全速
    const m = Math.min(1, d / JOY_R);
    const k = m < 0.12 ? 0 : m;
    ctl.setStick(d > 0 ? (dx / Math.min(d, JOY_R)) * k : 0, d > 0 ? (dy / Math.min(d, JOY_R)) * k : 0);
  };
  const endJoy = () => {
    joyId = null;
    el.joy.hidden = true;
    ctl.setStick(0, 0);
  };
  const hideHint = () => {
    if (hintGone) return;
    hintGone = true;
    el.hint.classList.add('gone');
  };

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    const p: P = { x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, t0: performance.now() };
    ptrs.set(e.pointerId, p);
    const others = [...ptrs.keys()].filter((id) => id !== joyId);
    if (others.length === 2) {
      // 两指（不算摇杆那根）：缩放
      const [a, b] = others.map((id) => ptrs.get(id)!);
      pinch0 = Math.hypot(a.x - b.x, a.y - b.y);
      zoom0 = pipe.rig.metersPerTexel;
      if (joyId === null) return;
    }
    if (joyId === null && ptrs.size === 1 && inThumbZone(p.x0, p.y0)) {
      joyId = e.pointerId;
      showJoy(p);
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = ptrs.get(e.pointerId);
    if (!p) return;
    p.x = e.clientX;
    p.y = e.clientY;
    if (e.pointerId === joyId) {
      updateJoy(p);
      if (Math.hypot(p.x - p.x0, p.y - p.y0) > TAP_PX) hideHint();
      return;
    }
    const others = [...ptrs.keys()].filter((id) => id !== joyId);
    if (others.length >= 2) {
      const [a, b] = others.map((id) => ptrs.get(id)!);
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      pipe.rig.metersPerTexel = THREE.MathUtils.clamp(
        (zoom0 * pinch0) / Math.max(d, 1),
        (ZOOM_MIN * pipe.px) / 2,
        (ZOOM_MAX * pipe.px) / 2,
      );
      return;
    }
    // 单指拖动（不在拇指区按下的）：也当摇杆
    if (joyId === null && ptrs.size === 1 && Math.hypot(p.x - p.x0, p.y - p.y0) > TAP_PX) {
      joyId = e.pointerId;
      showJoy(p);
      hideHint();
    }
  });
  const up = (e: PointerEvent) => {
    const p = ptrs.get(e.pointerId);
    ptrs.delete(e.pointerId);
    if (!p) return;
    const tap = performance.now() - p.t0 < TAP_MS && Math.hypot(p.x - p.x0, p.y - p.y0) < TAP_PX;
    if (e.pointerId === joyId) endJoy();
    if (tap && e.type === 'pointerup' && ptrs.size === 0) {
      ctl.tapScreen(p.x, p.y, W(), Hh());
      hideHint();
    }
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      pipe.rig.metersPerTexel = THREE.MathUtils.clamp(
        pipe.rig.metersPerTexel * Math.exp(e.deltaY * 0.001),
        (ZOOM_MIN * pipe.px) / 2,
        (ZOOM_MAX * pipe.px) / 2,
      );
    },
    { passive: false },
  );

  // ── 按钮 ──
  const press = (b: HTMLButtonElement, down: () => void, upFn?: () => void) => {
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      b.setPointerCapture(e.pointerId);
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
    el.act,
    () => ctl.setAction(true),
    () => ctl.setAction(false),
  );
  press(el.ctx, () => ctl.context());

  // ── 键盘（桌面第二布局） ──
  const MOVE = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
  addEventListener('keydown', (e) => {
    if (MOVE.has(e.code)) {
      ctl.setKey(e.code, true);
      hideHint();
      e.preventDefault();
    } else if ((e.code === 'Space' || e.code === 'KeyE') && !e.repeat) {
      ctl.setAction(true);
      el.act.classList.add('down');
      e.preventDefault();
    } else if ((e.code === 'KeyF' || e.code === 'Enter') && !e.repeat) {
      ctl.context();
      e.preventDefault();
    }
  });
  addEventListener('keyup', (e) => {
    if (MOVE.has(e.code)) ctl.setKey(e.code, false);
    else if (e.code === 'Space' || e.code === 'KeyE') {
      ctl.setAction(false);
      el.act.classList.remove('down');
    }
  });
  addEventListener('blur', () => {
    for (const k of MOVE) ctl.setKey(k, false);
    ctl.setAction(false);
    endJoy();
  });

  // ── 气泡（复用 DOM） ──
  const bubbleEls: HTMLDivElement[] = [];
  const v3 = new THREE.Vector3();
  const project = (p: THREE.Vector3) => {
    const low = pipe.lowSize;
    const lowW = low.x * pipe.px;
    const lowH = low.y * pipe.px;
    v3.copy(p).project(pipe.camera);
    return {
      x: ((v3.x + 1) / 2) * lowW - (lowW - W()) / 2,
      y: ((1 - v3.y) / 2) * lowH - (lowH - Hh()) / 2,
    };
  };

  let lastCtx = '';
  let lastAct = '';
  return {
    frame(alerts) {
      const s = ctl.state();
      el.clean.textContent = `${s.clean}%`;
      el.loose.textContent = String(s.loose);
      el.cagebox.hidden = s.held !== 'picker';
      el.cage.textContent = String(s.pickerCount);
      if (s.context !== lastCtx) {
        lastCtx = s.context;
        el.ctx.textContent = s.context;
        el.ctx.hidden = !s.context;
      }
      if (s.action !== lastAct) {
        lastAct = s.action;
        el.act.textContent = s.action;
        el.act.hidden = !s.action;
        if (!s.action) {
          el.act.classList.remove('down');
          ctl.setAction(false);
        }
      }
      el.act.classList.toggle('on', s.acting);
      while (bubbleEls.length < alerts.length) {
        const b = document.createElement('div');
        b.className = 'play-bubble';
        el.bubbles.appendChild(b);
        bubbleEls.push(b);
      }
      bubbleEls.forEach((b, i) => {
        const a = alerts[i];
        b.hidden = !a;
        if (!a) return;
        if (b.textContent !== a.text) b.textContent = a.text;
        // 人在画面外：气泡贴着画面边（顶栏下面、按钮左边），让人知道有人在等
        const p = project(a.p);
        const x = Math.min(Math.max(p.x, 48), W() - 48);
        const y = Math.min(Math.max(p.y, 92), Hh() - 24);
        b.classList.toggle('edge', x !== p.x || y !== p.y);
        b.style.transform = `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px) translate(-50%, -100%)`;
      });
    },
  };
}

/**
 * IsoCamera（取代 OrbitCamera，契约见 docs/design/iso-architecture.md）：平移、离散档位缩放、
 * Q/E 90° 旋转（约 0.45 秒缓动，静止时只停在 4 个等距角）、跟随，指针事件（拖动平移、双指缩放、滚轮）。
 *
 * 位姿里的 zoom 就是 k（每米多少缓冲像素），档位见 ZOOM_STEPS；精灵档位由目标档位决定（spriteScaleFor），
 * 缩放动画一开始就换好、途中不变；双指缩放时按当前 k 带回差换档。
 * project / unproject 用 CSS 像素（相对画布左上角）。
 */
import { spriteScaleFor, spriteScaleHyst } from './proj';
import type { IsoView } from './view';

export interface IsoCameraPose {
  tx: number;
  tz: number;
  zoom: number;
  rot: 0 | 1 | 2 | 3;
}

export interface IsoCameraLimits {
  zoom: [number, number];
  tx: [number, number];
  tz: [number, number];
}

/**
 * 缩放档位（k，每米缓冲像素）：7.8 时人 1 倍，15.6 时 2 倍，23.4 时 3 倍。
 * 人相对世界的大小（精灵档位 / k）随放大只减不增：换精灵档位的那一步 k 正好翻同样的倍数，
 * 所以 7.8 和 15.6 之间不放档位（例如 11.7 配 2 倍会让人在放大时反而变大一截）。
 */
export const ZOOM_STEPS: readonly number[] = [2, 3, 4, 5.2, 7.8, 15.6, 23.4];

/** 旋转缓动时长（秒） */
const ROT_DUR = 0.45;
const HALF_PI = Math.PI / 2;

const clamp = (v: number, a: number, b: number) => (v < a ? a : Math.min(v, b));

export class IsoCamera {
  readonly target: IsoCameraPose;
  readonly smooth: { tx: number; tz: number; zoom: number; ang: number };
  limits: IsoCameraLimits;
  /** reset() 回到的位姿 */
  home: IsoCameraPose;
  /** false 时不响应指针（例如游戏里正拖着人） */
  enabled = true;
  private follow = false;
  private rotFrom = 0;
  private rotTo = 0;
  private rotT = -1;
  private pinching = false;
  /** 当前的精灵档位（交给 Projection.sprite） */
  private sprite = 0;
  private occluded = 0;
  private updated = false;

  constructor(
    readonly view: IsoView,
    pose: IsoCameraPose = { tx: view.proj.cx, tz: view.proj.cz, zoom: 4, rot: 0 },
    limits: IsoCameraLimits = {
      zoom: [ZOOM_STEPS[0] as number, ZOOM_STEPS[ZOOM_STEPS.length - 1] as number],
      tx: [-1e9, 1e9],
      tz: [-1e9, 1e9],
    },
  ) {
    this.target = { ...pose };
    this.home = { ...pose };
    this.limits = limits;
    this.smooth = { tx: pose.tx, tz: pose.tz, zoom: pose.zoom, ang: pose.rot * HALF_PI };
    this.rotTo = this.smooth.ang;
    this.apply();
  }

  /** 直接跳到某个位姿（不缓动） */
  setPose(p: IsoCameraPose, instant = true): void {
    const dr = (((p.rot - this.target.rot) % 4) + 4) % 4;
    Object.assign(this.target, p);
    this.clampTarget();
    if (instant) {
      this.smooth.tx = this.target.tx;
      this.smooth.tz = this.target.tz;
      this.smooth.zoom = this.target.zoom;
      this.rotTo += dr * HALF_PI;
      this.smooth.ang = this.rotTo;
      this.rotT = -1;
    } else if (dr) this.rotate(dr === 3 ? -1 : dr);
    this.apply();
  }

  /** 转 steps 个 90°（Q = +1，E = -1） */
  rotate(steps: number): void {
    if (!steps) return;
    this.target.rot = ((((this.target.rot + steps) % 4) + 4) % 4) as 0 | 1 | 2 | 3;
    this.rotFrom = this.smooth.ang;
    this.rotTo += steps * HALF_PI;
    this.rotT = 0;
  }

  zoomIn(): void {
    const z = this.target.zoom;
    const next = ZOOM_STEPS.find((s) => s > z + 1e-6);
    if (next !== undefined) this.target.zoom = clamp(next, this.limits.zoom[0], this.limits.zoom[1]);
  }

  zoomOut(): void {
    const z = this.target.zoom;
    let prev: number | undefined;
    for (const s of ZOOM_STEPS) if (s < z - 1e-6) prev = s;
    if (prev !== undefined) this.target.zoom = clamp(prev, this.limits.zoom[0], this.limits.zoom[1]);
  }

  /** 回到 home（转角不变） */
  reset(): void {
    this.target.tx = this.home.tx;
    this.target.tz = this.home.tz;
    this.target.zoom = this.home.zoom;
    this.clampTarget();
  }

  /** 拖动平移（CSS 像素）：手指下的地面跟着手指走 */
  pan(dxPx: number, dyPx: number): void {
    const pr = this.view.proj;
    const ps = this.view.PS;
    const a = pr.unP(0, 0);
    const b = pr.unP(-dxPx / ps, -dyPx / ps);
    this.target.tx += b[0] - a[0];
    this.target.tz += b[1] - a[1];
    this.clampTarget();
    this.smooth.tx = this.target.tx;
    this.smooth.tz = this.target.tz;
    this.apply();
  }

  /**
   * 以某个 CSS 点为中心缩放到 zoom：那个点下的地面位置保持不动。
   * instant = true（双指）时立刻生效，否则缓动过去。
   */
  zoomAt(zoom: number, cssX: number, cssY: number, instant = false): void {
    const z = clamp(zoom, this.limits.zoom[0], this.limits.zoom[1]);
    const w = this.unproject(cssX, cssY);
    const ratio = this.smooth.zoom / z;
    // 屏幕中心对应的地面点（目标点）绕 w 按比例缩
    const c = { x: this.smooth.tx, z: this.smooth.tz };
    this.target.tx = w.x - (w.x - c.x) * ratio;
    this.target.tz = w.z - (w.z - c.z) * ratio;
    this.target.zoom = z;
    this.clampTarget();
    if (instant) {
      this.smooth.tx = this.target.tx;
      this.smooth.tz = this.target.tz;
      this.smooth.zoom = this.target.zoom;
      this.apply();
    }
  }

  /** 最近的缩放档位 */
  static nearestStep(z: number): number {
    let best = ZOOM_STEPS[0] as number;
    for (const s of ZOOM_STEPS) if (Math.abs(Math.log(s / z)) < Math.abs(Math.log(best / z))) best = s;
    return best;
  }

  setFollow(on: boolean): void {
    this.follow = on;
  }

  get following(): boolean {
    return this.follow;
  }

  /** 每帧：跟随、缓动、把位姿交给 IsoView */
  update(dt: number, focus: { x: number; z: number } | null): void {
    this.updated = true;
    const s = this.smooth;
    const t = this.target;
    if (this.follow && focus) {
      const f = 1 - Math.exp(-dt * 3);
      t.tx += (focus.x - t.tx) * f;
      t.tz += (focus.z - t.tz) * f;
      this.clampTarget();
    }
    const fp = 1 - Math.exp(-dt * 12);
    s.tx += (t.tx - s.tx) * fp;
    s.tz += (t.tz - s.tz) * fp;
    if (Math.abs(t.tx - s.tx) < 0.01) s.tx = t.tx;
    if (Math.abs(t.tz - s.tz) < 0.01) s.tz = t.tz;
    if (!this.pinching) {
      const fz = 1 - Math.exp(-dt * 14);
      s.zoom = Math.exp(Math.log(s.zoom) + (Math.log(t.zoom) - Math.log(s.zoom)) * fz);
      if (Math.abs(s.zoom / t.zoom - 1) < 0.004) s.zoom = t.zoom;
    }
    if (this.rotT >= 0) {
      this.rotT += dt / ROT_DUR;
      const u = Math.min(1, this.rotT);
      const e = u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2;
      s.ang = this.rotFrom + (this.rotTo - this.rotFrom) * e;
      if (u >= 1) {
        s.ang = this.rotTo;
        this.rotT = -1;
      }
    }
    this.apply();
  }

  /** 本帧有没有调过 update（IsoWorld 没看到就自己补一次） */
  takeUpdated(): boolean {
    const u = this.updated;
    this.updated = false;
    return u;
  }

  /** 转动或缩放动画中（静态层实时画） */
  get moving(): boolean {
    return this.rotT >= 0 || this.pinching || this.smooth.zoom !== this.target.zoom;
  }

  private apply(): void {
    const s = this.smooth;
    // 精灵档位：平时跟目标档位（缩放动画开始时就换好，途中不变）；双指缩放时跟手指下的 k，带回差
    this.sprite = this.pinching
      ? spriteScaleHyst(s.zoom, this.sprite || spriteScaleFor(s.zoom))
      : spriteScaleFor(this.target.zoom);
    this.view.setPose(s.tx, s.tz, s.zoom, s.ang, !this.moving);
    this.view.proj.sprite = this.sprite;
  }

  /** 当前的精灵档位 */
  get spriteScale(): number {
    return this.sprite;
  }

  private clampTarget(): void {
    const L = this.limits;
    this.target.zoom = clamp(this.target.zoom, L.zoom[0], L.zoom[1]);
    this.target.tx = clamp(this.target.tx, L.tx[0], L.tx[1]);
    this.target.tz = clamp(this.target.tz, L.tz[0], L.tz[1]);
  }

  /* ---------- 投影（CSS 像素） ---------- */

  project(x: number, y: number, z: number): { x: number; y: number; depth: number } {
    const pr = this.view.proj;
    const ps = this.view.PS;
    return { x: pr.sx(x, z) * ps, y: pr.sy(x, y, z) * ps, depth: pr.depth(x, z) };
  }

  unproject(cssX: number, cssY: number, y = 0): { x: number; z: number } {
    const ps = this.view.PS;
    const w = this.view.proj.unP(cssX / ps, cssY / ps, y);
    return { x: w[0], z: w[1] };
  }

  /** CSS 像素每米 */
  get pxPerM(): number {
    return this.view.proj.k * this.view.PS;
  }

  /** 屏幕底部被 HUD 挡住的 CSS 像素：镜头目标放在剩下部分的中间 */
  get occludedBottomPx(): number {
    return this.occluded;
  }
  set occludedBottomPx(px: number) {
    this.occluded = px;
    this.view.occludedBottom = Math.round(px / this.view.PS);
    this.apply();
  }

  resize(): void {
    this.view.resize();
    this.view.occludedBottom = Math.round(this.occluded / this.view.PS);
    this.apply();
  }

  /* ---------- 指针 ---------- */

  /** 拖动平移、双指缩放、滚轮缩放。只在 el 上监听，不拦截 HUD 的事件 */
  bindPointer(el: HTMLElement): () => void {
    const ptrs = new Map<number, { x: number; y: number }>();
    let pinch0 = 0;
    let wheelAcc = 0;
    const rel = (e: { clientX: number; clientY: number }) => {
      const b = el.getBoundingClientRect();
      return { x: e.clientX - b.left, y: e.clientY - b.top };
    };
    const down = (e: PointerEvent) => {
      if (!this.enabled) return;
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // 合成事件没有真的指针
      }
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()] as [{ x: number; y: number }, { x: number; y: number }];
        pinch0 = Math.hypot(a.x - b.x, a.y - b.y);
        this.pinching = true;
      }
    };
    const move = (e: PointerEvent) => {
      const p = ptrs.get(e.pointerId);
      if (!p || !this.enabled) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (ptrs.size === 1) this.pan(dx, dy);
      else if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()] as [{ x: number; y: number }, { x: number; y: number }];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch0 > 0) {
          const c = rel({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 });
          this.zoomAt(this.smooth.zoom * (d / pinch0), c.x, c.y, true);
        }
        pinch0 = d;
      }
    };
    const up = (e: PointerEvent) => {
      if (!ptrs.has(e.pointerId)) return;
      const wasPinch = ptrs.size === 2;
      const last = ptrs.get(e.pointerId) as { x: number; y: number };
      ptrs.delete(e.pointerId);
      pinch0 = 0;
      if (wasPinch) {
        this.pinching = false;
        const other = [...ptrs.values()][0] ?? last;
        const c = rel({ clientX: (other.x + last.x) / 2, clientY: (other.y + last.y) / 2 });
        this.zoomAt(IsoCamera.nearestStep(this.smooth.zoom), c.x, c.y);
      }
    };
    const wheel = (e: WheelEvent) => {
      if (!this.enabled) return;
      e.preventDefault();
      wheelAcc += e.deltaY;
      if (Math.abs(wheelAcc) < 40) return;
      const c = rel(e);
      const z = this.target.zoom;
      const i = ZOOM_STEPS.indexOf(IsoCamera.nearestStep(z));
      const j = clamp(i + (wheelAcc < 0 ? 1 : -1), 0, ZOOM_STEPS.length - 1);
      wheelAcc = 0;
      this.zoomAt(ZOOM_STEPS[j] as number, c.x, c.y);
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', wheel, { passive: false });
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('wheel', wheel);
    };
  }
}

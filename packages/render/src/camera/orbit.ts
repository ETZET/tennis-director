import { clamp, lerp } from '@td/shared';
import type { Stage } from '../world/stage';

/** 相机姿态：绕目标点的水平角、俯角、缩放和目标点。 */
export interface CameraPose {
  yaw: number;
  pitch: number;
  zoom: number;
  tx: number;
  tz: number;
}

/** 剧情镜头：相机目标点和缩放（水平角和俯角由玩家决定）。 */
export interface CameraFocus {
  x: number;
  z: number;
  zoom: number;
}

export interface OrbitLimits {
  zoom: readonly [number, number];
  pitch: readonly [number, number];
  tx: readonly [number, number];
  tz: readonly [number, number];
}

const KEYS = ['yaw', 'pitch', 'zoom', 'tx', 'tz'] as const;

/**
 * 上帝视角的正交相机：拖拽旋转、右键/Shift 平移、滚轮和双指缩放。
 * target 是目标姿态，smooth 每帧向它缓动；剧情镜头在玩家 5 秒没操作后接管目标点。
 */
export class OrbitCamera {
  readonly target: CameraPose;
  readonly smooth: CameraPose;
  followStory = true;
  private lastUser = -1e9;

  constructor(
    private readonly stage: Stage,
    readonly home: CameraPose,
    private readonly limits: OrbitLimits = {
      zoom: [0.5, 3.2],
      pitch: [0.4, 1.3],
      tx: [-55, 60],
      tz: [-55, 55],
    },
  ) {
    this.target = { ...home };
    this.smooth = { ...home };
  }

  private get el(): HTMLElement {
    return this.stage.container;
  }

  /** 按 smooth 姿态摆相机。 */
  apply(): void {
    const { cam } = this.stage;
    const W = this.el.clientWidth || 1;
    const H = this.el.clientHeight || 1;
    const asp = W / H;
    const vh = Math.max(46, 74 / asp) / this.smooth.zoom;
    cam.left = (-vh * asp) / 2;
    cam.right = (vh * asp) / 2;
    cam.top = vh / 2;
    cam.bottom = -vh / 2;
    const R = 220;
    const cp = Math.cos(this.smooth.pitch);
    const s = this.smooth;
    cam.position.set(s.tx + R * cp * Math.sin(s.yaw), 1.2 + R * Math.sin(s.pitch), s.tz + R * cp * Math.cos(s.yaw));
    cam.lookAt(s.tx, 1.2, s.tz);
    cam.updateProjectionMatrix();
  }

  /** 始终按屏幕原生分辨率渲染（Fine），高清屏最多 2 倍。原型的像素化档位已经去掉。 */
  resize(): void {
    const { renderer } = this.stage;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(this.el.clientWidth, this.el.clientHeight);
    this.apply();
  }

  touched(): void {
    this.lastUser = performance.now();
  }

  setFollow(on: boolean): void {
    this.followStory = on;
    this.lastUser = -1e9;
  }

  /** 按 45° 一档旋转。 */
  rotate(steps: number): void {
    this.target.yaw += (steps * Math.PI) / 4;
    this.touched();
  }

  zoomIn(): void {
    this.target.zoom = clamp(this.target.zoom * 1.25, ...this.limits.zoom);
    this.touched();
  }

  zoomOut(): void {
    this.target.zoom = clamp(this.target.zoom / 1.25, ...this.limits.zoom);
    this.touched();
  }

  /** 回到初始视角，但保持已经转过的整圈数，避免相机倒转一大圈。 */
  reset(): void {
    const turns = Math.round((this.target.yaw - this.home.yaw) / (Math.PI * 2));
    Object.assign(this.target, this.home, { yaw: this.home.yaw + turns * Math.PI * 2 });
    this.touched();
  }

  pan(dx: number, dy: number): void {
    const { cam } = this.stage;
    const t = this.target;
    const wpp = (cam.top - cam.bottom) / this.el.clientHeight;
    const rx = Math.cos(t.yaw);
    const rz = -Math.sin(t.yaw);
    const fx = -Math.sin(t.yaw);
    const fz = -Math.cos(t.yaw);
    const k = 1 / Math.max(0.4, Math.sin(t.pitch));
    t.tx = clamp(t.tx - rx * dx * wpp + fx * dy * wpp * k, ...this.limits.tx);
    t.tz = clamp(t.tz - rz * dx * wpp + fz * dy * wpp * k, ...this.limits.tz);
  }

  /** 绑定指针和滚轮。 */
  bindPointer(cv: HTMLCanvasElement): void {
    const ptrs = new Map<number, { x: number; y: number }>();
    let dragMode: 'pan' | 'rot' | null = null;
    let pinch0: { d: number; z: number; mx: number; my: number } | null = null;
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('pointerdown', (e) => {
      cv.setPointerCapture(e.pointerId);
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      dragMode = e.button === 2 || e.button === 1 || e.shiftKey ? 'pan' : 'rot';
      cv.classList.add('drag');
      this.touched();
      if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()] as [{ x: number; y: number }, { x: number; y: number }];
        pinch0 = { d: Math.hypot(a.x - b.x, a.y - b.y), z: this.target.zoom, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      }
    });
    cv.addEventListener('pointermove', (e) => {
      const p = ptrs.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      this.touched();
      if (ptrs.size === 2 && pinch0) {
        const [a, b] = [...ptrs.values()] as [{ x: number; y: number }, { x: number; y: number }];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        this.target.zoom = clamp((pinch0.z * d) / pinch0.d, ...this.limits.zoom);
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        this.pan(mx - pinch0.mx, my - pinch0.my);
        pinch0.mx = mx;
        pinch0.my = my;
        return;
      }
      if (dragMode === 'pan') this.pan(dx, dy);
      else {
        this.target.yaw -= dx * 0.008;
        this.target.pitch = clamp(this.target.pitch + dy * 0.005, ...this.limits.pitch);
      }
    });
    const endPtr = (e: PointerEvent) => {
      ptrs.delete(e.pointerId);
      if (ptrs.size < 2) pinch0 = null;
      if (!ptrs.size) {
        dragMode = null;
        cv.classList.remove('drag');
      }
    };
    cv.addEventListener('pointerup', endPtr);
    cv.addEventListener('pointercancel', endPtr);
    cv.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.touched();
        this.target.zoom = clamp(this.target.zoom * Math.exp(-e.deltaY * 0.0013), ...this.limits.zoom);
      },
      { passive: false },
    );
  }

  /** 每帧：剧情镜头接管（玩家 5 秒没操作时），然后缓动并摆相机。dt 是真实时间。 */
  update(dt: number, focus: CameraFocus | null): void {
    if (this.followStory && focus && performance.now() - this.lastUser > 5000) {
      this.target.tx = focus.x;
      this.target.tz = focus.z;
      this.target.zoom = focus.zoom;
    }
    const k = 1 - Math.exp(-dt * (this.followStory && focus ? 2.6 : 9));
    for (const key of KEYS) this.smooth[key] = lerp(this.smooth[key], this.target[key], k);
    this.apply();
  }
}

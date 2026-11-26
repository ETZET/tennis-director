// 圆形遮罩转场（参考里坐车换图：圆收拢到主角身上 → 黑屏"加载中" → 再从主角身上展开）。
// 一张全屏 canvas，按 3 CSS 像素一格的低分辨率画（圆边是像素台阶，不糊）：黑底，挖掉半径 r 的圆（逐行算半宽）。
// 用法：iris.run(() => { 换场景 }) —— 收拢完、全黑的那一刻调回调（可以返回 Promise，等它完再展开）。
// 进出会所剖面、坐电梯换层（clubwalk）；地图代理以后换图也用它。
export interface IrisOpts {
  /** 圆心（CSS 像素）：一般是总监在屏幕上的位置；null = 屏幕中心 */
  center?: () => { x: number; y: number } | null;
  /** 一格多少 CSS 像素（默认 3） */
  cell?: number;
  /** 收拢 / 全黑 / 展开 各多少毫秒 */
  ms?: [number, number, number];
  color?: string;
}

export interface Iris {
  run(onBlack?: () => void | Promise<void>): Promise<void>;
  busy(): boolean;
  /** 截图 / 调试：定格在某一步（phase 收拢 'close' / 全黑 'black' / 展开 'open'，k = 0..1）；null = 收起 */
  pose(phase: 'close' | 'black' | 'open' | null, k?: number): void;
  readonly el: HTMLCanvasElement;
}

export function createIris(o: IrisOpts = {}): Iris {
  const cell = o.cell ?? 3;
  const [msClose, msBlack, msOpen] = o.ms ?? [420, 320, 460];
  const color = o.color ?? '#120e24';
  const c = document.createElement('canvas');
  c.className = 'pxh-iris';
  // 样式写在元素上（不靠 style.ts）：别的页面单独用它也行
  Object.assign(c.style, {
    position: 'fixed',
    left: '0',
    top: '0',
    zIndex: '40',
    imageRendering: 'pixelated',
    pointerEvents: 'auto',
    touchAction: 'none',
  });
  c.hidden = true;
  c.style.display = 'none';
  document.body.appendChild(c);
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  let running = false;
  let cx = 0;
  let cy = 0;

  function size() {
    const W = Math.ceil(innerWidth / cell);
    const H = Math.ceil(innerHeight / cell);
    if (c.width !== W || c.height !== H) {
      c.width = W;
      c.height = H;
    }
    c.style.width = `${W * cell}px`;
    c.style.height = `${H * cell}px`;
    return { W, H };
  }
  function aim() {
    const p = o.center?.() ?? null;
    cx = (p ? p.x : innerWidth / 2) / cell;
    cy = (p ? p.y : innerHeight / 2) / cell;
  }
  /** r = 0..1（相对盖住整屏的半径）；dots = 黑屏上的"…"（第几个点亮） */
  function draw(r01: number, dots = -1) {
    const { W, H } = size();
    const rMax =
      Math.max(Math.hypot(cx, cy), Math.hypot(W - cx, cy), Math.hypot(cx, H - cy), Math.hypot(W - cx, H - cy)) + 1;
    const r = r01 * rMax;
    g.clearRect(0, 0, W, H);
    g.fillStyle = color;
    for (let y = 0; y < H; y++) {
      const dy = y + 0.5 - cy;
      const hw = r > Math.abs(dy) ? Math.sqrt(r * r - dy * dy) : -1;
      if (hw < 0) {
        g.fillRect(0, y, W, 1);
        continue;
      }
      const x0 = Math.round(cx - hw);
      const x1 = Math.round(cx + hw);
      if (x0 > 0) g.fillRect(0, y, x0, 1);
      if (x1 < W) g.fillRect(x1, y, W - x1, 1);
    }
    // 黑屏上的三个点（"加载中"）：屏幕右下，同参考
    if (dots >= 0) {
      const bx = W - 14;
      const by = H - 8;
      for (let i = 0; i < 3; i++) {
        g.fillStyle = i <= dots ? '#fff0c4' : '#4a4670';
        g.fillRect(bx + i * 3, by, 2, 2);
      }
    }
  }

  const frame = () => new Promise<number>((res) => requestAnimationFrame(res));
  async function tween(ms: number, f: (k: number) => void) {
    const t0 = performance.now();
    for (;;) {
      const now = await frame();
      const k = Math.min(1, (now - t0) / ms);
      f(k);
      if (k >= 1) return;
    }
  }

  return {
    el: c,
    busy: () => running,
    async run(onBlack) {
      if (running) {
        await onBlack?.();
        return;
      }
      running = true;
      c.hidden = false;
      c.style.display = 'block';
      try {
        aim();
        // 收拢：先快后慢地收到 0（像素台阶，圆心跟着总监）
        await tween(msClose, (k) => {
          aim();
          draw((1 - k) ** 1.6);
        });
        draw(0, 0);
        const t0 = performance.now();
        await onBlack?.();
        // 至少黑这么久；三个点一个一个亮
        for (;;) {
          const now = await frame();
          const e = now - t0;
          draw(0, Math.min(2, Math.floor((e / msBlack) * 3)));
          if (e >= msBlack) break;
        }
        aim();
        await tween(msOpen, (k) => draw(k ** 0.7));
      } finally {
        c.hidden = true;
        c.style.display = 'none';
        running = false;
      }
    },
    pose(phase, k = 0.5) {
      if (!phase) {
        c.hidden = true;
        c.style.display = 'none';
        return;
      }
      c.hidden = false;
      c.style.display = 'block';
      aim();
      if (phase === 'black') draw(0, Math.floor(k * 3));
      else draw(phase === 'close' ? (1 - k) ** 1.6 : k ** 0.7);
    },
  };
}

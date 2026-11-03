import { clamp, lerp, type XYZ } from '@td/shared';
import { type BakedArt, Custom, type DrawContext, type Node, Sprite } from '../core/graph';
import type { CourtFrame } from '../world/frame';
import { arcVelocity, type Bounds, G, simulateBounce } from './ballistics';

type Seg =
  | { k: 'arc'; t0: number; t1: number; p0: XYZ; v: XYZ; d?: { x: number; z: number } }
  | { k: 'sim'; t0: number; t1: number; pts: number[] };

/** 换一种球：颜色和大小（水球、红色小球）。 */
export interface BallLook {
  color?: string;
  size?: number;
}

/** '#rrggbb' → ImageData 的 ABGR 打包色 */
function pack(hex: string): number {
  const n = Number.parseInt(hex.slice(1, 7), 16);
  return (0xff000000 | ((n & 0xff) << 16) | (n & 0xff00) | ((n >> 16) & 0xff)) >>> 0;
}

const dim = (hex: string, f: number): string => {
  const n = Number.parseInt(hex.slice(1, 7), 16);
  const c = (v: number) =>
    Math.round(v * f)
      .toString(16)
      .padStart(2, '0');
  return `#${c((n >> 16) & 0xff)}${c((n >> 8) & 0xff)}${c(n & 0xff)}`;
};

const ballArts = new Map<string, BakedArt>();

/**
 * 球的像素图：n×n（2 或 3），右下角压暗一点做体积。锚点在底边中间。
 * 直接拼 BakedArt（不走字符画烘焙，颜色是任意的）。
 */
export function ballArt(hex: string, n = 2): BakedArt {
  const key = `${hex}|${n}`;
  let a = ballArts.get(key);
  if (!a) {
    const px = new Uint32Array(n * n);
    const hi = pack(hex);
    const lo = pack(dim(hex, 0.72));
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) px[j * n + i] = i + j >= n ? lo : hi;
    if (n === 3) {
      px[0] = 0;
      px[2] = 0;
      px[6] = 0;
      px[8] = 0;
      px[4] = hi;
    }
    a = { w: n, h: n, ox: n >> 1, oy: n - 1, px };
    ballArts.set(key, a);
  }
  return a;
}

const TENNIS = '#d6e04e';
const PICKLE = '#f4d23a';
const TRAIL = '#eef2a8';
const SHADOW = '#3a3040';

/**
 * 球池：网球和匹克球共用。球的轨迹是预先排好的一段段（抛物线或预积分的弹跳），
 * update(now) 只是按时间取位置，所以变速和暂停不会改变轨迹。
 * 画法：球是 2×2 的像素精灵，地上一个影子点，飞得快时身后拖几个淡色像素。
 */
export class BallPool {
  readonly balls: Ball[] = [];

  constructor(
    readonly scene: Node,
    readonly groundY: (x: number, z: number) => number,
  ) {}

  /** 取一颗空闲的球（没有就新建）。owner 用来统计"谁的球"。 */
  get(owner: unknown, pickleball = false, look?: BallLook): Ball {
    let b = this.balls.find((x) => !x.inUse);
    if (!b) {
      b = new Ball(this);
      this.balls.push(b);
    }
    b.inUse = true;
    b.owner = owner;
    b.segs = [];
    b.hold = null;
    b.fadeT = null;
    b.hist.length = 0;
    b.size = look?.size ?? 1;
    b.color = look?.color ?? (pickleball ? PICKLE : TENNIS);
    b.m.frame = ballArt(b.color, b.size >= 1.4 || pickleball ? 3 : 2);
    b.m.opacity = 1;
    b.vis(true);
    return b;
  }

  update(now: number): void {
    for (const b of this.balls) b.update(now);
  }
}

export class Ball {
  /** 球本身（位置就是球心，演出读 m.position） */
  readonly m: Sprite;
  /** 地上的影子 */
  readonly sh: Custom;
  /** 拖尾的几个像素 */
  readonly tr: Sprite[];
  segs: Seg[] = [];
  hist: number[] = [];
  inUse = false;
  owner: unknown = null;
  hold: Node | null = null;
  fadeT: number | null = null;
  /** 缩放（默认 1；≥1.4 画成 3×3） */
  size = 1;
  color = TENNIS;
  /** 上一段抛物线的终点（有风偏时和目标点不同） */
  lastEnd: XYZ = { x: 0, y: 0, z: 0 };
  /** 球离地高度（影子大小用） */
  private alt = 0;

  constructor(private readonly pool: BallPool) {
    this.m = new Sprite(ballArt(TENNIS));
    this.m.renderOrder = 0.05;
    this.m.lit = 1;
    pool.scene.add(this.m);
    this.sh = new Custom(
      (r: DrawContext, self: Custom) => {
        const w = self.matrixWorld;
        const [sx, sy] = r.P(w[9] as number, w[10] as number, w[11] as number);
        const c = r.col(SHADOW, 1);
        const big = this.alt < 1.2;
        const s = r.spriteScale;
        const x0 = Math.round(sx) - (big ? s : 0);
        const y0 = Math.round(sy);
        r.rect(x0, y0, big ? 2 * s : s, s, c);
      },
      { x0: -0.05, x1: 0.05, y0: 0, y1: 0.02, z0: -0.05, z1: 0.05 },
    );
    this.sh.renderOrder = -0.2;
    pool.scene.add(this.sh);
    this.tr = [0, 1, 2].map(() => {
      const s = new Sprite(ballArt(TRAIL, 1));
      s.opacity = 0.5;
      s.lit = 1;
      pool.scene.add(s);
      return s;
    });
    this.vis(false);
  }

  vis(v: boolean): void {
    this.m.visible = v;
    this.sh.visible = v;
    if (!v) for (const t of this.tr) t.visible = false;
  }

  release(): void {
    this.inUse = false;
    this.owner = null;
    this.hold = null;
    this.segs = [];
    this.fadeT = null;
    this.size = 1;
    this.m.opacity = 1;
    this.vis(false);
  }

  /** 球拿在某只手里。 */
  holdAt(obj: Node): void {
    this.hold = obj;
    this.segs = [];
  }

  /**
   * 排一段抛物线（世界坐标），返回到达时刻。
   * drift 是水平方向的恒定加速度（风），终点会偏开 drift·dur²，偏开后的终点记在 lastEnd。
   */
  arc(p0: XYZ, p1: XYZ, t0: number, dur: number, drift?: { x: number; z: number }): number {
    this.hold = null;
    const seg: Seg = { k: 'arc', t0, t1: t0 + dur, p0: { x: p0.x, y: p0.y, z: p0.z }, v: arcVelocity(p0, p1, dur) };
    if (drift && (drift.x || drift.z)) seg.d = { x: drift.x, z: drift.z };
    this.segs.push(seg);
    this.lastEnd = seg.d
      ? { x: p1.x + seg.d.x * dur * dur, y: p1.y, z: p1.z + seg.d.z * dur * dur }
      : { x: p1.x, y: p1.y, z: p1.z };
    return t0 + dur;
  }

  /** 排一段在场地局部坐标里积分的弹跳/滚动，返回停下的时刻。 */
  simLocal(fr: CourtFrame, p0: XYZ, v0: XYZ, t0: number, b?: Bounds | null): number {
    const pl = simulateBounce(p0, v0, b);
    const pts: number[] = [];
    for (let i = 0; i < pl.length; i += 3) {
      const w = fr.w({ x: pl[i] as number, y: pl[i + 1] as number, z: pl[i + 2] as number });
      pts.push(w.x, w.y, w.z);
    }
    const t1 = t0 + (pts.length / 3 - 1) / 60;
    this.hold = null;
    this.segs.push({ k: 'sim', t0, t1, pts });
    return t1;
  }

  fadeOut(t: number): void {
    this.fadeT = t;
  }

  update(now: number): void {
    if (!this.inUse) return;
    const p = this.m.position;
    if (this.hold) {
      this.hold.getWorldPosition(p);
    } else if (this.segs.length) {
      while (this.segs.length > 1 && now >= (this.segs[1] as Seg).t0) this.segs.shift();
      const s = this.segs[0] as Seg;
      const t = Math.max(s.t0, Math.min(now, s.t1));
      if (s.k === 'arc') {
        const u = t - s.t0;
        if (s.d)
          p.set(
            s.p0.x + s.v.x * u + s.d.x * u * u,
            s.p0.y + s.v.y * u - 0.5 * G * u * u,
            s.p0.z + s.v.z * u + s.d.z * u * u,
          );
        else p.set(s.p0.x + s.v.x * u, s.p0.y + s.v.y * u - 0.5 * G * u * u, s.p0.z + s.v.z * u);
      } else {
        const pts = s.pts;
        const n = pts.length / 3;
        const f = (t - s.t0) * 60;
        const i = Math.min(n - 1, Math.floor(f));
        const j = Math.min(n - 1, i + 1);
        const a = f - i;
        p.set(
          lerp(pts[i * 3] as number, pts[j * 3] as number, a),
          lerp(pts[i * 3 + 1] as number, pts[j * 3 + 1] as number, a),
          lerp(pts[i * 3 + 2] as number, pts[j * 3 + 2] as number, a),
        );
      }
    }
    const gy = this.pool.groundY(p.x, p.z);
    this.alt = p.y - gy;
    this.sh.position.set(p.x, gy + 0.012, p.z);
    // 拿在手里时不画影子（人自己有影子）
    this.sh.visible = this.m.visible && !this.hold;
    if (this.fadeT != null) {
      const k = (now - this.fadeT) / 0.7;
      if (k >= 1) {
        this.release();
        return;
      }
      this.m.opacity = clamp(1 - k, 0, 1);
    }
    this.hist.unshift(p.x, p.y, p.z);
    if (this.hist.length > 24) this.hist.length = 24;
    const h = this.hist;
    const moving =
      !this.hold &&
      h.length >= 21 &&
      Math.hypot(
        (h[0] as number) - (h[9] as number),
        (h[1] as number) - (h[10] as number),
        (h[2] as number) - (h[11] as number),
      ) > 0.3;
    this.tr.forEach((m, k) => {
      const o = (k + 1) * 3;
      m.visible = moving && this.m.visible;
      m.opacity = 0.6 - k * 0.15;
      if (moving) m.position.set(h[o] as number, h[o + 1] as number, h[o + 2] as number);
    });
  }
}

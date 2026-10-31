import { clamp, lerp, type XYZ } from '@td/shared';
import * as THREE from 'three';
import { boxGeo } from '../people/parts';
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

/**
 * 球池：网球和匹克球共用。球的轨迹是预先排好的一段段（抛物线或预积分的弹跳），
 * update(now) 只是按时间取位置，所以变速和暂停不会改变轨迹。
 */
export class BallPool {
  readonly balls: Ball[] = [];
  readonly geo = boxGeo(0.16, 0.16, 0.16);
  readonly tennisMat = new THREE.MeshLambertMaterial({ color: '#c9d24e', emissive: '#202408' });
  readonly pickleMat = new THREE.MeshLambertMaterial({ color: '#f0d24a', emissive: '#3a2f08' });
  readonly trailMat = new THREE.MeshBasicMaterial({
    color: '#dfe57a',
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
  });
  readonly blobGeo: THREE.PlaneGeometry;
  readonly blobMat = new THREE.MeshBasicMaterial({
    color: '#000',
    transparent: true,
    opacity: 0.26,
    depthWrite: false,
  });

  constructor(
    readonly scene: THREE.Object3D,
    readonly groundY: (x: number, z: number) => number,
  ) {
    this.blobGeo = new THREE.PlaneGeometry(0.24, 0.24);
    this.blobGeo.rotateX(-Math.PI / 2);
  }

  private readonly colorMats = new Map<string, THREE.MeshLambertMaterial>();

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
    b.m.scale.setScalar(b.size);
    b.m.material = look?.color ? this.colorMat(look.color) : pickleball ? this.pickleMat : this.tennisMat;
    b.vis(true);
    return b;
  }

  private colorMat(hex: string): THREE.MeshLambertMaterial {
    let m = this.colorMats.get(hex);
    if (!m) {
      m = new THREE.MeshLambertMaterial({ color: hex });
      this.colorMats.set(hex, m);
    }
    return m;
  }

  update(now: number): void {
    for (const b of this.balls) b.update(now);
  }
}

export class Ball {
  readonly m: THREE.Mesh;
  readonly sh: THREE.Mesh;
  readonly tr: THREE.Mesh[];
  segs: Seg[] = [];
  hist: number[] = [];
  inUse = false;
  owner: unknown = null;
  hold: THREE.Object3D | null = null;
  fadeT: number | null = null;
  /** 缩放（默认 1） */
  size = 1;
  /** 上一段抛物线的终点（有风偏时和目标点不同） */
  lastEnd: XYZ = { x: 0, y: 0, z: 0 };

  constructor(private readonly pool: BallPool) {
    this.m = new THREE.Mesh(pool.geo, pool.tennisMat);
    pool.scene.add(this.m);
    this.sh = new THREE.Mesh(pool.blobGeo, pool.blobMat);
    pool.scene.add(this.sh);
    this.tr = [0.72, 0.5, 0.32].map((s) => {
      const m = new THREE.Mesh(pool.geo, pool.trailMat);
      m.scale.setScalar(s);
      pool.scene.add(m);
      return m;
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
    this.m.scale.setScalar(1);
    this.vis(false);
  }

  /** 球拿在某只手里。 */
  holdAt(obj: THREE.Object3D): void {
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
      const w = fr.w({ x: pl[i], y: pl[i + 1], z: pl[i + 2] });
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
      while (this.segs.length > 1 && now >= this.segs[1].t0) this.segs.shift();
      const s = this.segs[0];
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
          lerp(pts[i * 3], pts[j * 3], a),
          lerp(pts[i * 3 + 1], pts[j * 3 + 1], a),
          lerp(pts[i * 3 + 2], pts[j * 3 + 2], a),
        );
      }
    }
    const gy = this.pool.groundY(p.x, p.z);
    this.sh.position.set(p.x, gy + 0.012, p.z);
    this.sh.scale.setScalar(clamp(1.1 - (p.y - gy) * 0.2, 0.35, 1));
    if (this.fadeT != null) {
      const k = (now - this.fadeT) / 0.7;
      if (k >= 1) {
        this.release();
        return;
      }
      this.m.scale.setScalar(Math.max(0.01, 1 - k) * this.size);
    }
    this.hist.unshift(p.x, p.y, p.z);
    if (this.hist.length > 24) this.hist.length = 24;
    const h = this.hist;
    const moving = !this.hold && h.length >= 21 && Math.hypot(h[0] - h[9], h[1] - h[10], h[2] - h[11]) > 0.3;
    this.tr.forEach((m, k) => {
      const o = (k + 1) * 6;
      m.visible = moving;
      if (moving) m.position.set(h[o], h[o + 1], h[o + 2]);
    });
  }
}

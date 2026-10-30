import { clamp, lerp, type XYZ } from '@td/shared';
import * as THREE from 'three';
import { boxGeo } from '../people/parts';
import type { CourtFrame } from '../world/frame';
import { arcVelocity, type Bounds, G, simulateBounce } from './ballistics';

type Seg = { k: 'arc'; t0: number; t1: number; p0: XYZ; v: XYZ } | { k: 'sim'; t0: number; t1: number; pts: number[] };

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

  /** 取一颗空闲的球（没有就新建）。owner 用来统计"谁的球"。 */
  get(owner: unknown, pickleball = false): Ball {
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
    b.m.scale.setScalar(1);
    b.m.material = pickleball ? this.pickleMat : this.tennisMat;
    b.vis(true);
    return b;
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
    this.m.scale.setScalar(1);
    this.vis(false);
  }

  /** 球拿在某只手里。 */
  holdAt(obj: THREE.Object3D): void {
    this.hold = obj;
    this.segs = [];
  }

  /** 排一段抛物线（世界坐标），返回到达时刻。 */
  arc(p0: XYZ, p1: XYZ, t0: number, dur: number): number {
    this.hold = null;
    this.segs.push({ k: 'arc', t0, t1: t0 + dur, p0: { x: p0.x, y: p0.y, z: p0.z }, v: arcVelocity(p0, p1, dur) });
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
        p.set(s.p0.x + s.v.x * u, s.p0.y + s.v.y * u - 0.5 * G * u * u, s.p0.z + s.v.z * u);
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
      this.m.scale.setScalar(Math.max(0.01, 1 - k));
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

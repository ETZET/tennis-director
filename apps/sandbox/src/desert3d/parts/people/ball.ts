// 网球：解析弹道（抛物线段 + 落地反弹），规划击球用同一套公式，所以"算好的接球点"球一定会到。
import * as THREE from 'three';
import { COURT, FENCE } from '../../layout';
import type { World } from '../../world';

export const G = 9.8;
export const R = 0.06;
/** 反弹：竖直保留、水平保留 */
export const E = 0.66;
export const F = 0.78;
const NET_X = COURT.hw + 0.95;

export interface V3 {
  x: number;
  y: number;
  z: number;
}

export interface Shot {
  v: V3;
  /** 从出手到第一次落地的时间 */
  T: number;
  bounce: V3;
}

/** 从 S 打到落点 (tx, tz)：水平速度约 speed，自动抬高弧线保证过网 clr 米 */
export function planShot(S: V3, tx: number, tz: number, speed: number, clr: number): Shot {
  const dx = tx - S.x;
  const dz = tz - S.z;
  const D = Math.hypot(dx, dz);
  let T = D / speed;
  const f = dz !== 0 ? -S.z / dz : -1;
  if (f > 0.05 && f < 0.95 && clr > -5) {
    const need = (2 * (COURT.netH + clr - S.y - (R - S.y) * f)) / (G * f * (1 - f));
    if (need > T * T) T = Math.sqrt(need);
  }
  const v = { x: dx / T, y: (R - S.y) / T + 0.5 * G * T, z: dz / T };
  return { v, T, bounce: { x: tx, y: R, z: tz } };
}

/** 落地之后，在高度 h 附近（下落段）接球：返回接球点和离落地的时间 */
export function contactAfterBounce(shot: Shot, h: number, maxDepth: number): { C: V3; dt: number } {
  const vyLand = shot.v.y - G * shot.T;
  const u = -vyLand * E;
  const vx = shot.v.x * F;
  const vz = shot.v.z * F;
  const disc = u * u - 2 * G * (h - R);
  let dt: number;
  let y: number;
  if (disc >= 0) {
    dt = (u + Math.sqrt(disc)) / G;
    y = h;
    const zc = shot.bounce.z + vz * dt;
    if (Math.abs(zc) > maxDepth) {
      // 太深：上升段就接
      dt = (u - Math.sqrt(disc)) / G;
      if (Math.abs(shot.bounce.z + vz * dt) > maxDepth)
        dt = Math.max(0.12, (maxDepth - Math.abs(shot.bounce.z)) / Math.max(0.1, Math.abs(vz)));
      y = R + u * dt - 0.5 * G * dt * dt;
    }
  } else {
    dt = u / G;
    y = R + (u * u) / (2 * G);
  }
  return { C: { x: shot.bounce.x + vx * dt, y, z: shot.bounce.z + vz * dt }, dt };
}

export class Ball {
  mesh: THREE.Mesh;
  shadow: THREE.Mesh;
  trail: THREE.Mesh[] = [];
  mode: 'hidden' | 'fly' | 'held' = 'hidden';
  p0 = new THREE.Vector3();
  v0 = new THREE.Vector3();
  t0 = 0;
  tLand = Infinity;
  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  bounces = 0;
  netted = false;
  rolling = false;
  restT = 0;
  onBounce?: (p: THREE.Vector3, speed: number) => void;
  private hist: THREE.Vector3[] = [new THREE.Vector3(), new THREE.Vector3()];

  private w: World;
  constructor(w: World) {
    this.w = w;
    // 稍微放大（0.12 米）、亮黄绿，自带一点自发光，阴影里也读得出
    this.mesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(R, 1),
      w.mats.toon(0xffffff, {
        ramp: [0xeeff58, 0xc8e040, 0x88a858],
        edge: 0.6,
        convex: 0.3,
        lightUp: 0.5,
        emissive: 0x202800,
      }),
    );
    w.mats.prepare(this.mesh, { cast: true, receive: false });
    // 正下方的小圆影：读高度用（太阳投影是斜的）
    const sm = new THREE.MeshBasicMaterial({ color: 0x3a2a20, transparent: true, opacity: 0.45, depthWrite: false });
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.07, 8).rotateX(-Math.PI / 2), sm);
    this.shadow.layers.set(w.layers.FX);
    // 拖尾：两颗淡一些的小球
    for (let i = 0; i < 2; i++) {
      const m = new THREE.Mesh(
        new THREE.IcosahedronGeometry(R * (0.8 - i * 0.2), 0),
        new THREE.MeshBasicMaterial({ color: 0xe8f8a0, transparent: true, opacity: 0.55 - i * 0.2, depthWrite: false }),
      );
      m.layers.set(w.layers.FX);
      this.trail.push(m);
    }
    w.scene.add(this.mesh, this.shadow, ...this.trail);
    this.hide();
  }

  hide() {
    this.mode = 'hidden';
    this.mesh.visible = this.shadow.visible = false;
    for (const m of this.trail) m.visible = false;
  }

  hold(p: THREE.Vector3) {
    this.mode = 'held';
    this.pos.copy(p);
    this.mesh.visible = this.shadow.visible = true;
    for (const m of this.trail) m.visible = false;
    this.place();
  }

  /** 弹道按 y=0 算；画面抬到球场表面（court 的面约 0.05 米，有沙更高） */
  private place() {
    const g = this.w.groundY(this.pos.x, this.pos.z);
    this.mesh.position.set(this.pos.x, this.pos.y + Math.max(0.05, g), this.pos.z);
    this.shadow.position.set(this.pos.x, g + 0.025, this.pos.z);
  }

  launch(p: V3, v: V3, t: number) {
    this.mode = 'fly';
    this.p0.set(p.x, p.y, p.z);
    this.v0.set(v.x, v.y, v.z);
    this.t0 = t;
    this.bounces = 0;
    this.netted = false;
    this.rolling = false;
    this.restT = 0;
    this.tLand = t + this.landTime();
    this.pos.copy(this.p0);
    this.hist[0].copy(this.p0);
    this.hist[1].copy(this.p0);
    this.mesh.visible = this.shadow.visible = true;
  }

  private landTime() {
    const y0 = this.p0.y - R;
    const vy = this.v0.y;
    return (vy + Math.sqrt(Math.max(0, vy * vy + 2 * G * y0))) / G;
  }

  private evalAt(t: number, out: THREE.Vector3) {
    const d = t - this.t0;
    out.set(this.p0.x + this.v0.x * d, this.p0.y + this.v0.y * d - 0.5 * G * d * d, this.p0.z + this.v0.z * d);
  }

  get stopped() {
    return this.mode !== 'fly' || this.restT > 0;
  }

  update(t: number, dt: number) {
    if (this.mode !== 'fly') return;
    const prev = this.hist[0];
    this.hist[1].copy(this.hist[0]);
    prev.copy(this.pos);
    if (this.rolling) {
      // 滚：减速直到停
      const sp = Math.hypot(this.vel.x, this.vel.z);
      const ns = Math.max(0, sp - 2.5 * dt);
      if (sp > 0) {
        this.vel.x *= ns / sp;
        this.vel.z *= ns / sp;
      }
      this.pos.x += this.vel.x * dt;
      this.pos.z += this.vel.z * dt;
      this.pos.y = R;
      if (ns === 0) this.restT += dt;
    } else {
      while (t >= this.tLand) {
        // 落地反弹
        this.evalAt(this.tLand, this.pos);
        const d = this.tLand - this.t0;
        const vyL = this.v0.y - G * d;
        const sp = Math.hypot(this.v0.x, this.v0.z);
        this.onBounce?.(this.pos.clone(), sp);
        this.bounces++;
        this.p0.set(this.pos.x, R, this.pos.z);
        this.v0.set(this.v0.x * F, -vyL * E, this.v0.z * F);
        this.t0 = this.tLand;
        if (this.v0.y < 0.9) {
          this.rolling = true;
          this.vel.copy(this.v0);
          this.vel.y = 0;
          this.tLand = Infinity;
          break;
        }
        this.tLand = this.t0 + this.landTime();
      }
      if (!this.rolling) this.evalAt(t, this.pos);
      // 撞网
      if (
        !this.netted &&
        Math.sign(prev.z) !== Math.sign(this.pos.z) &&
        prev.z !== 0 &&
        Math.abs(this.pos.x) < NET_X &&
        this.pos.y < COURT.netH + R
      ) {
        this.netted = true;
        const vy = this.v0.y - G * (t - this.t0);
        this.p0.set(this.pos.x, this.pos.y, -Math.sign(this.pos.z) * 0.12);
        this.v0.set(this.v0.x * 0.1, Math.min(vy, 0) * 0.2, -this.v0.z * 0.12);
        this.t0 = t;
        this.tLand = t + this.landTime();
        this.pos.copy(this.p0);
      }
    }
    // 围栏：弹回来，没劲了
    const lim = (v: number, m: number) => Math.abs(v) > m;
    if (lim(this.pos.x, FENCE.hw - 0.15) || lim(this.pos.z, FENCE.hl - 0.15)) {
      const bx = lim(this.pos.x, FENCE.hw - 0.15);
      const sx = Math.sign(this.pos.x);
      const sz = Math.sign(this.pos.z);
      const vy = this.rolling ? 0 : this.v0.y - G * (t - this.t0);
      const v = this.rolling ? this.vel.clone() : new THREE.Vector3(this.v0.x, vy, this.v0.z);
      if (bx) {
        this.pos.x = sx * (FENCE.hw - 0.2);
        v.x = -v.x * 0.25;
      } else {
        this.pos.z = sz * (FENCE.hl - 0.2);
        v.z = -v.z * 0.25;
      }
      v.x *= 0.5;
      v.z *= 0.5;
      if (this.rolling) this.vel.copy(v);
      else {
        this.p0.copy(this.pos);
        this.v0.set(v.x, Math.min(v.y, 0), v.z);
        this.t0 = t;
        this.tLand = t + this.landTime();
      }
    }
    this.place();
    const s = Math.max(0.5, 1.2 - this.pos.y * 0.25);
    this.shadow.scale.setScalar(s);
    const fast = !this.rolling && prev.distanceTo(this.pos) > 0.08;
    this.trail[0].visible = this.trail[1].visible = fast;
    this.trail[0].position.lerpVectors(this.pos, prev, 0.9);
    this.trail[1].position.lerpVectors(prev, this.hist[1], 0.8);
  }
}

// 一个人：走位（路点 + 速度）、朝向、站姿、叠加动作、脚步扬沙。只管画面，没有数值。
import * as THREE from 'three';
import { FENCE } from '../../layout';
import type { World } from '../../world';
import { ACT_LEGS, type ActKind, action, blend, idle, NEUTRAL, type Pose, ready, rest, sit, sweep, walk } from './pose';
import { buildRig, type Look, type Rig } from './rig';

export interface Pt {
  x: number;
  z: number;
}

export type Stance = 'idle' | 'ready' | 'rest' | 'sweep' | 'sit';

const tmp = new THREE.Vector3();

export class Person {
  rig: Rig;
  x = 0;
  z = 0;
  yaw = 0;
  speed = 0;
  path: Pt[] = [];
  maxSpeed = 1.8;
  /** 站着（或横移）时朝这个方向；null 就朝走的方向 */
  faceYaw: number | null = null;
  /** 横移：移动时也保持 faceYaw（打球中） */
  shuffle = false;
  stance: Stance = 'idle';
  /** 推扫帚的进度 0..1 */
  sweepU = 0;
  act: { kind: ActKind; t: number; dur: number } | null = null;
  lookAt: THREE.Vector3 | null = null;
  carryBroom = false;
  phase = 0;
  private seed: number;
  private pose: Pose = { ...NEUTRAL };
  private base: Pose = { ...NEUTRAL };
  private tmpA: Pose = { ...NEUTRAL };
  private tmpB: Pose = { ...NEUTRAL };
  private w: World;
  private rnd: () => number;

  constructor(w: World, look: Look, opts: { racket?: boolean; seed: number }) {
    this.w = w;
    this.rig = buildRig(w, look, opts);
    this.seed = opts.seed;
    this.rnd = w.rng(`people:steps:${opts.seed}`);
    w.scene.add(this.rig.mesh);
  }

  get visible() {
    return this.rig.mesh.visible;
  }
  set visible(v: boolean) {
    this.rig.mesh.visible = v;
  }

  place(p: Pt, yaw = this.yaw) {
    this.x = p.x;
    this.z = p.z;
    this.yaw = yaw;
    this.path = [];
    this.speed = 0;
  }

  go(pts: Pt[], maxSpeed = 1.8) {
    this.path = pts.slice();
    this.maxSpeed = maxSpeed;
  }

  get arrived() {
    return this.path.length === 0 && this.speed < 0.05;
  }

  doAct(kind: ActKind, dur: number) {
    this.act = { kind, t: 0, dur };
  }

  /** 本地点 → 世界坐标（人物朝向 yaw，脸朝 +z） */
  toWorld(lx: number, ly: number, lz: number, out = new THREE.Vector3()) {
    const c = Math.cos(this.yaw);
    const s = Math.sin(this.yaw);
    return out.set(this.x + lx * c + lz * s, ly, this.z - lx * s + lz * c);
  }

  update(dt: number, t: number) {
    // —— 走位 ——
    let vx = 0;
    let vz = 0;
    if (this.path.length) {
      const p = this.path[0];
      const dx = p.x - this.x;
      const dz = p.z - this.z;
      const d = Math.hypot(dx, dz);
      const last = this.path.length === 1;
      const want = last ? Math.min(this.maxSpeed, d * 3) : this.maxSpeed;
      this.speed += THREE.MathUtils.clamp(want - this.speed, -10 * dt, 6 * dt);
      const step = Math.min(d, this.speed * dt);
      if (d > 1e-4) {
        vx = (dx / d) * this.speed;
        vz = (dz / d) * this.speed;
        this.x += (dx / d) * step;
        this.z += (dz / d) * step;
      }
      if (d < (last ? 0.03 : 0.35)) {
        this.path.shift();
        if (last) {
          this.x = p.x;
          this.z = p.z;
          this.speed = 0;
        }
      }
    } else {
      this.speed = Math.max(0, this.speed - 10 * dt);
    }

    // —— 朝向 ——
    let wantYaw = this.yaw;
    const moving = this.speed > 0.25;
    if (moving && !(this.shuffle && this.faceYaw !== null)) wantYaw = Math.atan2(vx, vz);
    else if (this.faceYaw !== null) wantYaw = this.faceYaw;
    let dy = wantYaw - this.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.yaw += dy * Math.min(1, dt * 9);

    // —— 姿势 ——
    const base = this.base;
    switch (this.stance) {
      case 'ready':
        ready(t + this.seed, base);
        break;
      case 'rest':
        rest(t + this.seed, base);
        break;
      case 'sweep':
        sweep(this.sweepU, base);
        break;
      case 'sit':
        sit(t + this.seed, base);
        break;
      default:
        idle(t, base, this.seed);
    }
    // 走路：步幅 ~0.7 米一步，跑起来步子大
    const run = THREE.MathUtils.clamp((this.speed - 2.2) / 2, 0, 1);
    const stride = 0.72 + 0.5 * run;
    const prevStep = Math.floor(this.phase / Math.PI);
    this.phase += (this.speed * dt * Math.PI) / stride;
    if (this.speed > 0.05) {
      const a = Math.min(1, this.speed / 1.4);
      walk(this.phase, a, run, this.tmpA, this.carryBroom);
      // 横移时上半身保持准备姿势
      if (this.shuffle && this.stance === 'ready') {
        blend(this.tmpA, base, 0.6, this.tmpA);
        for (const k of ['llF', 'llK', 'rlF', 'rlK'] as const) this.tmpA[k] = this.tmpA[k] * 0.7 + base[k] * 0.3;
        this.tmpA.lean = base.lean;
      }
      blend(base, this.tmpA, Math.min(1, this.speed / 0.5), base);
      if (Math.floor(this.phase / Math.PI) !== prevStep) this.footstep(run);
    }
    // 叠加动作
    if (this.act) {
      const a = this.act;
      a.t += dt;
      const u = Math.min(1, a.t / a.dur);
      action(a.kind, u, t, this.tmpB);
      const env = Math.min(1, u / 0.08, (1 - u) / 0.1);
      blend(base, this.tmpB, Math.max(0, env), base, ACT_LEGS[a.kind] || this.speed < 0.3);
      if (a.t >= a.dur) this.act = null;
    }
    // 看球 / 看人
    if (this.lookAt) {
      const ly = Math.atan2(this.lookAt.x - this.x, this.lookAt.z - this.z) - this.yaw - base.twist;
      const yy = Math.atan2(Math.sin(ly), Math.cos(ly));
      base.hY = THREE.MathUtils.clamp(yy, -1.1, 1.1);
      const d = Math.hypot(this.lookAt.x - this.x, this.lookAt.z - this.z);
      base.hP += THREE.MathUtils.clamp(-Math.atan2(this.lookAt.y - 1.5, Math.max(1, d)), -0.6, 0.4);
    }
    // 低通：切换站姿不跳
    const k = Math.min(1, dt * 18);
    for (const key in base) {
      const kk = key as keyof Pose;
      this.pose[kk] += (base[kk] - this.pose[kk]) * k;
    }
    this.rig.apply(this.pose);
    this.rig.mesh.position.set(this.x, this.w.groundY(this.x, this.z), this.z);
    this.rig.mesh.rotation.y = this.yaw;
  }

  private footstep(run: number) {
    const w = this.w;
    if (!w.fx) return;
    const outside = Math.abs(this.x) > FENCE.hw || Math.abs(this.z) > FENCE.hl;
    const sand = outside ? 0.6 : (w.dirt?.at(this.x, this.z) ?? 0);
    if (sand < 0.2) return;
    if (this.rnd() > 0.35 + sand * 0.4 + run * 0.3) return;
    const side = Math.floor(this.phase / Math.PI) % 2 ? 0.1 : -0.1;
    const fp = this.toWorld(side, 0, 0.05, tmp);
    fp.y = w.groundY(fp.x, fp.z) + 0.05;
    w.fx.puff(fp, 0.18 + run * 0.12, 2 + Math.round(run * 2));
  }
}

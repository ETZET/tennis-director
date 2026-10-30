import { clamp, ease, lerp, type XZ } from '@td/shared';
import * as THREE from 'three';
import { boxGeo, part } from './parts';
import {
  GESTURES,
  type GestureName,
  type KeyPose,
  POSE_KEYS,
  POSES,
  type Pose,
  type PoseName,
  STROKES,
  type StrokeName,
} from './poses';

export type HairStyle = 'cap' | 'visor' | 'pony' | 'long' | 'bald' | 'curly' | 'short';

/** 一个体素小人的外观和初始状态。外观完全由数据决定。 */
export interface PersonOptions {
  name: string;
  x: number;
  z: number;
  /** 锁定朝向（例如击球时面向球网）；null 表示自由转身 */
  lock?: number | null;
  yaw?: number;
  base?: PoseName;
  /** 坐着时臀部的世界高度；null 表示站立 */
  seatY?: number | null;
  reach?: number;
  wide?: boolean;
  shirt: string;
  trim?: string;
  sleeve?: string;
  longSleeve?: boolean;
  shorts: string;
  pants?: boolean;
  socks?: string;
  skin: string;
  hair: string;
  hairStyle?: HairStyle;
  cap?: string;
  beard?: string;
  shoes: string;
  racket?: string;
  paddle?: string;
  phone?: boolean;
  clipboard?: boolean;
  box?: boolean;
}

/** 人物所在的世界：场景图、地面高度函数，以及登记所有人物的列表。 */
export interface PeopleWorld {
  readonly scene: THREE.Object3D;
  groundY(x: number, z: number): number;
  readonly people: Person[];
}

type GoTask = { k: 'go'; x: number; z: number; speed: number; face?: number; stepMul?: number; t0?: number };
type WaitTask = { k: 'wait'; d: number; t0?: number };
type CallTask = { k: 'call'; fn: (now: number) => void; t0?: number };
type Task = GoTask | WaitTask | CallTask;

let stringMat: THREE.MeshLambertMaterial | null = null;

/**
 * 体素小人：程序化动画（走、跑、击球、手势、坐下）。
 * 动作排成队列：go / wait / call，每帧 update 推进。
 */
export class Person {
  readonly o: PersonOptions;
  readonly name: string;
  readonly root: THREE.Group;
  readonly body: THREE.Group;
  readonly legL: THREE.Group;
  readonly legR: THREE.Group;
  readonly upper: THREE.Group;
  readonly head: THREE.Group;
  readonly armL: THREE.Group;
  readonly armR: THREE.Group;
  readonly handL: THREE.Object3D;
  readonly handR: THREE.Object3D;
  /** 手里的辞退信（总监递给教练） */
  readonly slip: THREE.Group;
  phone: THREE.Group | null = null;
  boxMesh: THREE.Group | null = null;

  readonly pos: THREE.Vector3;
  lock: number | null;
  yaw: number;
  idleFace: number | null = null;
  moveYaw: number;
  watch: Person | null = null;
  base: PoseName;
  seatY: number | null;
  reach: number;
  hopT = -9;
  writing = false;

  private queue: Task[] = [];
  private task: Task | null = null;
  private phase = 0;
  private stepMul = 1;
  private speedNow = 0;
  stroke: { type: StrokeName; tc: number } | null = null;
  private gest: { name: GestureName; t0: number; dur: number } | null = null;

  constructor(
    o: PersonOptions,
    private readonly world: PeopleWorld,
  ) {
    this.o = o;
    this.name = o.name;
    const root = new THREE.Group();
    this.root = root;
    world.scene.add(root);
    const body = new THREE.Group();
    this.body = body;
    root.add(body);

    const legs: THREE.Group[] = [];
    for (const s of [1, -1]) {
      const g = new THREE.Group();
      g.position.set(0.13 * s, 0.85, 0);
      body.add(g);
      part(g, 0.22, 0.34, 0.26, 0, -0.17, 0, o.shorts);
      part(g, 0.16, 0.36, 0.17, 0, -0.52, 0, o.pants ? o.shorts : o.skin);
      part(g, 0.17, 0.08, 0.18, 0, -0.72, 0, o.pants ? o.shorts : o.socks || '#e6e2d6');
      part(g, 0.2, 0.11, 0.32, 0, -0.795, 0.04, o.shoes);
      legs.push(g);
    }
    this.legL = legs[0] as THREE.Group;
    this.legR = legs[1] as THREE.Group;

    const up = new THREE.Group();
    this.upper = up;
    up.position.y = 0.85;
    up.rotation.order = 'YXZ';
    body.add(up);
    part(up, o.wide ? 0.6 : 0.5, 0.6, o.wide ? 0.36 : 0.28, 0, 0.3, 0, o.shirt);
    if (o.trim) part(up, 0.52, 0.07, 0.3, 0, 0.42, 0, o.trim);

    const hd = new THREE.Group();
    this.head = hd;
    hd.position.y = 0.6;
    up.add(hd);
    part(hd, 0.36, 0.36, 0.34, 0, 0.19, 0, o.skin);
    part(hd, 0.06, 0.06, 0.02, 0.08, 0.22, 0.175, '#1a1a1a');
    part(hd, 0.06, 0.06, 0.02, -0.08, 0.22, 0.175, '#1a1a1a');
    buildHair(hd, o);
    if (o.beard) part(hd, 0.37, 0.12, 0.06, 0, 0.06, 0.16, o.beard);

    const arms: THREE.Group[] = [];
    const hands: THREE.Object3D[] = [];
    for (const s of [1, -1]) {
      const g = new THREE.Group();
      g.position.set((o.wide ? 0.38 : 0.33) * s, 0.55, 0);
      up.add(g);
      part(g, 0.16, 0.22, 0.17, 0, -0.11, 0, o.sleeve || o.shirt);
      part(g, 0.13, 0.44, 0.14, 0, -0.43, 0, o.longSleeve ? o.sleeve || o.shirt : o.skin);
      const h = new THREE.Object3D();
      h.position.y = -0.66;
      g.add(h);
      arms.push(g);
      hands.push(h);
    }
    this.armL = arms[0] as THREE.Group;
    this.armR = arms[1] as THREE.Group;
    this.handL = hands[0] as THREE.Object3D;
    this.handR = hands[1] as THREE.Object3D;

    if (o.racket) {
      const r = new THREE.Group();
      r.position.set(0, -0.62, 0.02);
      this.armR.add(r);
      part(r, 0.05, 0.26, 0.05, 0, -0.1, 0, '#222');
      part(r, 0.04, 0.38, 0.05, 0.14, -0.44, 0, o.racket);
      part(r, 0.04, 0.38, 0.05, -0.14, -0.44, 0, o.racket);
      part(r, 0.32, 0.04, 0.05, 0, -0.64, 0, o.racket);
      part(r, 0.32, 0.04, 0.05, 0, -0.24, 0, o.racket);
      stringMat ??= new THREE.MeshLambertMaterial({ color: '#f4f1e4', transparent: true, opacity: 0.5 });
      const st = new THREE.Mesh(boxGeo(0.24, 0.36, 0.01), stringMat);
      st.position.set(0, -0.44, 0);
      r.add(st);
    }
    if (o.paddle) {
      const r = new THREE.Group();
      r.position.set(0, -0.62, 0.02);
      this.armR.add(r);
      part(r, 0.05, 0.16, 0.05, 0, -0.06, 0, '#222');
      part(r, 0.22, 0.27, 0.04, 0, -0.28, 0, o.paddle);
    }
    if (o.phone) {
      const p = new THREE.Group();
      this.phone = p;
      p.position.set(0, -0.68, 0.06);
      this.armL.add(p);
      part(p, 0.09, 0.15, 0.025, 0, 0, 0, '#151515');
      part(p, 0.07, 0.12, 0.012, 0, 0, 0.016, '#8fc8ee');
    }
    if (o.clipboard) {
      const b = new THREE.Group();
      b.position.set(0, -0.7, 0.06);
      this.armL.add(b);
      part(b, 0.3, 0.38, 0.03, 0, 0, 0, '#8a6a45');
      part(b, 0.25, 0.3, 0.035, 0, -0.01, 0, '#f6f3ea');
    }
    const slip = new THREE.Group();
    this.slip = slip;
    slip.position.set(0, -0.7, 0.05);
    this.armR.add(slip);
    part(slip, 0.2, 0.26, 0.02, 0, 0, 0, '#ef9cc0');
    slip.visible = false;
    if (o.box) {
      const b = new THREE.Group();
      this.boxMesh = b;
      b.position.set(0, 0.2, 0.42);
      up.add(b);
      part(b, 0.55, 0.4, 0.36, 0, 0, 0, '#a9824f');
      part(b, 0.56, 0.06, 0.37, 0, 0.12, 0, '#c9b083');
      part(b, 0.12, 0.12, 0.04, -0.12, 0.3, 0, '#cfd3d6');
      b.visible = false;
    }

    this.pos = new THREE.Vector3(o.x, 0, o.z);
    this.lock = o.lock != null ? o.lock : null;
    this.yaw = o.yaw != null ? o.yaw : this.lock != null ? this.lock : 0;
    this.moveYaw = this.yaw;
    this.base = o.base || 'relaxed';
    this.reach = o.reach || 1;
    this.seatY = o.seatY != null ? o.seatY : null;
    world.people.push(this);
  }

  go(x: number, z: number, speed = 2.5, opt: { face?: number; stepMul?: number } = {}): this {
    this.queue.push(Object.assign({ k: 'go' as const, x, z, speed }, opt));
    return this;
  }

  path(pts: readonly XZ[], speed?: number): this {
    for (const p of pts) this.go(p.x, p.z, speed);
    return this;
  }

  wait(d: number): this {
    this.queue.push({ k: 'wait', d });
    return this;
  }

  call(fn: (now: number) => void): this {
    this.queue.push({ k: 'call', fn });
    return this;
  }

  clearMoves(): void {
    this.queue.length = 0;
    this.task = null;
  }

  setStroke(type: StrokeName, tc: number): void {
    this.stroke = { type, tc };
  }

  gesture(name: GestureName, t: number, dur: number): void {
    this.gest = { name, t0: t, dur };
  }

  private resolve(n: KeyPose): Pose {
    return n === 'BASE' ? POSES[this.base] : POSES[n];
  }

  /** 当前击球姿势；null 表示击球已结束，空对象表示还没开始。 */
  private strokePose(now: number): (Partial<Pose> & { active?: true }) | null {
    if (!this.stroke) return null;
    const fr = STROKES[this.stroke.type];
    const t = now - this.stroke.tc;
    if (t < fr[0][0]) return {};
    if (t >= fr[fr.length - 1][0]) return null;
    let i = 0;
    while (i < fr.length - 2 && t >= fr[i + 1][0]) i++;
    const a = this.resolve(fr[i][1]);
    const b = this.resolve(fr[i + 1][1]);
    const w = ease((t - fr[i][0]) / (fr[i + 1][0] - fr[i][0]));
    const out: Partial<Pose> & { active?: true } = {};
    for (const k of POSE_KEYS) out[k] = lerp(a[k] || 0, b[k] || 0, w);
    out.active = true;
    return out;
  }

  update(dt: number, now: number): void {
    let moved = 0;
    let guard = 0;
    while (guard++ < 6) {
      if (!this.task) {
        this.task = this.queue.shift() || null;
        if (this.task) this.task.t0 = now;
      }
      const k = this.task;
      if (!k) break;
      if (k.k === 'call') {
        this.task = null;
        k.fn(now);
        continue;
      }
      if (k.k === 'wait') {
        if (now - (k.t0 ?? now) >= k.d) {
          this.task = null;
          continue;
        }
        break;
      }
      this.stepMul = k.stepMul || 1;
      const dx = k.x - this.pos.x;
      const dz = k.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      const step = k.speed * dt;
      if (d > 0.001) this.moveYaw = Math.atan2(dx, dz);
      if (d <= step || d < 1e-6) {
        this.pos.x = k.x;
        this.pos.z = k.z;
        moved += d;
        this.task = null;
        if (dt === 0) break;
        continue;
      }
      this.pos.x += (dx / d) * step;
      this.pos.z += (dz / d) * step;
      moved += step;
      break;
    }
    if (dt > 0) this.speedNow = lerp(this.speedNow, moved / dt, 1 - Math.exp(-dt * 12));
    const k = this.task;
    const moving = k?.k === 'go';
    if (this.watch && !moving) this.idleFace = Math.atan2(this.watch.pos.x - this.pos.x, this.watch.pos.z - this.pos.z);
    const ty =
      k?.k === 'go'
        ? k.face != null
          ? k.face
          : this.lock != null
            ? this.lock
            : this.moveYaw
        : this.lock != null
          ? this.lock
          : this.idleFace != null
            ? this.idleFace
            : this.yaw;
    let dy = ty - this.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.yaw += dy * Math.min(1, dt * 7);

    const P: Pose = Object.assign({ hx: 0 }, POSES[this.base]);
    let inStroke = false;
    if (this.stroke) {
      const r = this.strokePose(now);
      if (r === null) this.stroke = null;
      else if (r.active) {
        Object.assign(P, r);
        inStroke = true;
      }
    }
    if (this.gest) {
      const g = this.gest;
      const t = now - g.t0;
      if (t > g.dur) this.gest = null;
      else if (t >= 0) GESTURES[g.name](P, now, clamp(Math.min(1, t / 0.25, (g.dur - t) / 0.25), 0, 1));
    }
    if (this.writing) P.rx += Math.sin(now * 11) * 0.08;
    const runAmt = clamp(this.speedNow / 2.6, 0, 1);
    this.phase += moved * 2.9 * this.stepMul;
    const sw = Math.sin(this.phase);
    if (this.seatY != null) {
      this.legL.rotation.set(-1.45, 0, 0.06);
      this.legR.rotation.set(-1.45, 0, -0.06);
    } else {
      const amp = runAmt * 0.8;
      const spl = P.crouch * 2.2;
      this.legL.rotation.set(sw * amp, 0, spl);
      this.legR.rotation.set(-sw * amp, 0, -spl);
    }
    if (!inStroke && runAmt > 0.05 && this.base !== 'carry' && this.base !== 'phoneStand') {
      P.lx += -sw * 0.7 * runAmt;
      P.rx += sw * 0.7 * runAmt;
    }
    this.upper.rotation.set(P.ux, P.uy, 0);
    this.head.rotation.x = P.hx || 0;
    this.armL.rotation.set(P.lx, 0, P.lz);
    this.armR.rotation.set(P.rx, 0, P.rz);
    let by = -P.crouch * 0.6 + Math.abs(Math.cos(this.phase)) * 0.05 * runAmt;
    const ht = now - this.hopT;
    if (ht >= 0 && ht < 0.3) by += Math.sin((ht / 0.3) * Math.PI) * 0.1;
    this.body.position.y = by;
    const gy = this.seatY != null ? this.seatY : this.world.groundY(this.pos.x, this.pos.z);
    this.root.position.set(this.pos.x, gy, this.pos.z);
    this.root.rotation.y = this.yaw;
  }
}

function buildHair(hd: THREE.Group, o: PersonOptions): void {
  const c = o.hair;
  const cap = o.cap ?? c;
  switch (o.hairStyle) {
    case 'cap':
      part(hd, 0.4, 0.12, 0.38, 0, 0.42, 0, cap);
      part(hd, 0.36, 0.04, 0.2, 0, 0.37, 0.26, cap);
      part(hd, 0.38, 0.12, 0.06, 0, 0.28, -0.16, c);
      break;
    case 'visor':
      part(hd, 0.38, 0.1, 0.36, 0, 0.41, 0, c);
      part(hd, 0.39, 0.07, 0.37, 0, 0.34, 0, cap);
      part(hd, 0.36, 0.03, 0.2, 0, 0.33, 0.26, cap);
      part(hd, 0.38, 0.16, 0.06, 0, 0.31, -0.16, c);
      break;
    case 'pony':
      part(hd, 0.38, 0.1, 0.36, 0, 0.41, 0, c);
      part(hd, 0.38, 0.22, 0.06, 0, 0.28, -0.16, c);
      part(hd, 0.12, 0.32, 0.12, 0, 0.2, -0.24, c);
      break;
    case 'long':
      part(hd, 0.38, 0.1, 0.36, 0, 0.41, 0, c);
      part(hd, 0.4, 0.44, 0.08, 0, 0.16, -0.17, c);
      part(hd, 0.05, 0.3, 0.3, 0.2, 0.24, -0.02, c);
      part(hd, 0.05, 0.3, 0.3, -0.2, 0.24, -0.02, c);
      break;
    case 'bald':
      part(hd, 0.385, 0.14, 0.08, 0, 0.27, -0.15, c);
      part(hd, 0.05, 0.12, 0.2, 0.19, 0.27, -0.05, c);
      part(hd, 0.05, 0.12, 0.2, -0.19, 0.27, -0.05, c);
      break;
    case 'curly':
      part(hd, 0.44, 0.16, 0.42, 0, 0.42, -0.01, c);
      part(hd, 0.44, 0.24, 0.08, 0, 0.27, -0.18, c);
      part(hd, 0.06, 0.2, 0.3, 0.21, 0.3, -0.04, c);
      part(hd, 0.06, 0.2, 0.3, -0.21, 0.3, -0.04, c);
      break;
    default:
      part(hd, 0.38, 0.1, 0.36, 0, 0.41, 0, c);
      part(hd, 0.38, 0.16, 0.06, 0, 0.31, -0.16, c);
  }
}

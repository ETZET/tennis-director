// 总监：分与分之间推着扫帚上场扫最脏的地方，扫完下场，球员等他；没人打球时继续扫，扫干净了去凉棚下坐着。
import * as THREE from 'three';
import { COURT, FENCE } from '../../layout';
import type { World } from '../../world';
import { type Co, route, until, wait } from './co';
import { DIRECTOR } from './looks';
import type { CourtState } from './match';
import { Person, type Pt } from './person';
import { buildBroom } from './rig';

/** 打球时站着等的地方：东侧网柱和长椅之间，场外 */
const WAIT: Pt = { x: FENCE.hw - 1.75, z: 1.5 };
/** 凉棚（structures 的 shade：x 12.6..15.6，z 4.2..8；木凳在 (14.1, 6.4)） */
const SHADE_WAY: Pt = { x: 11.6, z: 6.1 };
const SHADE_FRONT: Pt = { x: 14.3, z: 7.25 };
const SEAT: Pt = { x: 14.2, z: 6.5 };

const tmp = new THREE.Vector3();

export class Director {
  d: Person;
  broom: THREE.Mesh;
  private inShade = true;
  private rnd: () => number;

  constructor(
    private w: World,
    private cs: CourtState,
  ) {
    this.d = new Person(w, DIRECTOR, { seed: 4.2 });
    this.broom = buildBroom(w);
    w.scene.add(this.broom);
    this.rnd = w.rng('people:director');
    this.d.place(SEAT, 0);
    this.d.stance = 'sit';
    cs.director = this.d;
  }

  private onCourt() {
    const d = this.d;
    return Math.abs(d.x) < COURT.hw + 0.6 && Math.abs(d.z) < COURT.hl + 1.0;
  }

  *main(): Co {
    const cs = this.cs;
    const d = this.d;
    yield* wait(0.5);
    for (;;) {
      if (cs.phase === 'break' && cs.doneBreak !== cs.breakId) {
        const id = cs.breakId;
        if (cs.breakKind === 'point' || this.onCourt()) {
          const spot = this.pickSpot(0.03, cs.breakKind === 'point');
          if (spot) yield* this.sweepAt(spot, 6, () => false);
          if (this.onCourt() || !this.inShade) yield* this.goTo(WAIT);
          this.standBy();
        }
        cs.doneBreak = id;
        continue;
      }
      if (cs.phase !== 'idle') {
        // 打球中：场外拄着扫帚看
        if (!this.inShade && Math.hypot(d.x - WAIT.x, d.z - WAIT.z) > 0.3) yield* this.goTo(WAIT);
        if (!this.inShade) this.standBy();
        yield;
        continue;
      }
      // 没人打：找最脏的地方扫；干净了就去凉棚坐会儿
      const spot = this.pickSpot(0.12, false);
      if (spot) {
        yield* this.sweepAt(spot, 8 + Math.floor(this.rnd() * 5), () => cs.phase !== 'idle');
        // 扫一阵也要歇一会儿（沙一直在吹，总扫不完）
        if (cs.phase !== 'idle' || this.rnd() > 0.25) continue;
      }
      yield* this.goShade();
      yield* until(() => cs.phase !== 'idle', 5 + this.rnd() * 5);
    }
  }

  private standBy() {
    const d = this.d;
    d.stance = 'rest';
    d.carryBroom = false;
    d.faceYaw = -Math.PI / 2;
    d.lookAt = this.cs.ball.mesh.visible ? this.cs.ball.pos : null;
  }

  private pickSpot(thr: number, force: boolean): Pt | null {
    const dirt = this.w.dirt;
    const lim = (p: Pt) => Math.abs(p.x) < FENCE.hw - 1.4 && Math.abs(p.z) < FENCE.hl - 1.4 && Math.abs(p.z) > 1.4;
    if (dirt && force) {
      // 分与分之间时间紧：在离总监近的地方挑最脏的（脏度减去距离代价）
      const d = this.d;
      let best: Pt | null = null;
      let score = -Infinity;
      let amt = 0;
      for (let x = -COURT.hw; x <= COURT.hw + 0.01; x += 1) {
        for (let z = -COURT.hl; z <= COURT.hl + 0.01; z += 1) {
          if (Math.abs(z) < 1.4) continue; // 网边上扫不了
          const a = dirt.at(x, z);
          const sc = a - Math.hypot(x - d.x, z - d.z) * 0.025;
          if (sc > score) {
            score = sc;
            best = { x, z };
            amt = a;
          }
        }
      }
      if (best && amt >= thr) return best;
    }
    if (dirt) {
      const s = dirt.dirtiest();
      if (s && s.amount >= thr && lim(s)) return { x: s.x, z: s.z };
      if (!force) return null;
    } else if (!force && this.rnd() < 0.5) return null;
    // 没有沙土服务（或场上都干净）：在场内随便找一处扫两下
    return { x: (this.rnd() - 0.5) * 2 * COURT.hw, z: (this.rnd() - 0.5) * 2 * COURT.hl };
  }

  private *goTo(p: Pt): Co {
    const d = this.d;
    d.stance = 'idle';
    d.carryBroom = true;
    d.lookAt = null;
    d.faceYaw = null;
    const pts = this.inShade ? [SHADE_FRONT, SHADE_WAY, ...route(SHADE_WAY, p)] : route(d, p);
    if (this.inShade) {
      // 先站起来
      d.stance = 'idle';
      yield* wait(0.5);
    }
    this.inShade = false;
    d.go(pts, 2.8);
    yield* until(() => d.arrived, 40);
  }

  private *goShade(): Co {
    if (this.inShade) return;
    const d = this.d;
    d.stance = 'idle';
    d.carryBroom = true;
    d.faceYaw = null;
    d.lookAt = null;
    d.go([...route(d, SHADE_WAY), SHADE_FRONT, SEAT], 1.6);
    yield* until(() => d.arrived, 40);
    d.faceYaw = 0;
    yield* wait(0.5);
    this.inShade = true;
    d.stance = 'sit';
  }

  private *sweepAt(spot: Pt, strokes: number, abort: () => boolean): Co {
    const d = this.d;
    const wv = this.w.uniforms.uWind.value;
    const wl = wv.length();
    // 顺着风推，沙往下风走
    const dir = wl > 0.05 ? { x: wv.x / wl, z: wv.y / wl } : { x: 1, z: 0 };
    const stand = { x: spot.x - dir.x * 1.33, z: spot.z - dir.z * 1.33 };
    // 别跨到网那边去
    if (Math.sign(stand.z) !== Math.sign(spot.z) || Math.abs(stand.z) < 1.0)
      stand.z = Math.sign(spot.z) * Math.max(1.0, Math.abs(stand.z));
    yield* this.goTo(stand);
    d.faceYaw = Math.atan2(dir.x, dir.z);
    d.carryBroom = false;
    yield* wait(0.35);
    d.stance = 'sweep';
    for (let i = 0; i < strokes && !abort(); i++) {
      // 推
      let t = 0;
      while (t < 0.38) {
        t += yield;
        const u = Math.min(1, t / 0.38);
        d.sweepU = u * u * (3 - 2 * u);
      }
      const head = this.headWorld(1, tmp);
      head.y = this.w.groundY(head.x, head.z);
      const got = this.w.dirt?.sweep(head.x, head.z, 0.6, 0.55) ?? 0.2;
      this.w.fx?.puff(head.setY(head.y + 0.1), 0.3 + got * 0.4, 3 + Math.round(got * 10));
      // 收回来；挪到附近最脏的地方，下一推落在那（一片沙一推一推地推干净）
      const next = this.nextHead(head, spot);
      const reach = 0.78 + 0.55;
      if (next) {
        const st = { x: next.x - dir.x * reach, z: next.z - dir.z * reach };
        if (Math.sign(st.z) === Math.sign(spot.z) && Math.abs(st.z) > 1.0) d.go([st], 1.6);
      }
      t = 0;
      while (t < 0.3 || (d.path.length && t < 0.9)) {
        t += yield;
        const u = Math.min(1, t / 0.3);
        d.sweepU = 1 - u * u * (3 - 2 * u);
      }
      if (!next) break;
    }
    d.sweepU = 0;
    d.stance = 'idle';
    d.carryBroom = true;
  }

  /** 下一推的落点：离上一推不远、离起点不远的最脏处；都干净了返回 null */
  private nextHead(head: THREE.Vector3, spot: Pt): Pt | null {
    const dirt = this.w.dirt;
    if (!dirt) return { x: head.x + 0.3, z: head.z };
    let best: Pt | null = null;
    let score = 0.06;
    for (let dx = -1.25; dx <= 1.26; dx += 0.25) {
      for (let dz = -1.25; dz <= 1.26; dz += 0.25) {
        const x = head.x + dx;
        const z = head.z + dz;
        if (Math.hypot(x - spot.x, z - spot.z) > 2.6 || Math.abs(z) < 1.3) continue;
        const sc = dirt.at(x, z) - Math.hypot(dx, dz) * 0.04;
        if (sc > score) {
          score = sc;
          best = { x, z };
        }
      }
    }
    return best;
  }

  /** 扫帚头（推到 u 时）的世界位置 */
  private headWorld(u: number, out: THREE.Vector3) {
    return this.d.toWorld(-0.12, 0, 0.78 + 0.55 * u, out);
  }

  update(dt: number, t: number) {
    const d = this.d;
    d.update(dt, t);
    // 扫帚：头在地上（或拎着），杆指向右手
    const b = this.broom;
    if (d.stance === 'sit') {
      b.position.set(SEAT.x + 0.95, this.w.groundY(SEAT.x + 0.95, SEAT.z + 0.2), SEAT.z + 0.2);
      b.rotation.set(-0.12, 0.3, -0.28, 'YXZ');
      return;
    }
    d.rig.mesh.updateMatrixWorld(true);
    const hand = d.rig.handR.getWorldPosition(tmp);
    const dx = hand.x - d.x;
    const dz = hand.z - d.z;
    const c = Math.cos(d.yaw);
    const s = Math.sin(d.yaw);
    const lx = dx * c - dz * s;
    const lz = dx * s + dz * c;
    let hx = lx;
    let hy = 0;
    let hz: number;
    if (d.stance === 'sweep') hz = 0.78 + 0.55 * d.sweepU;
    else if (d.stance === 'rest') {
      hz = lz + 0.12;
      hx = lx - 0.05;
    } else {
      hz = lz + 0.95;
      hy = 0.12;
    }
    const th = Math.atan2(lz - hz, hand.y - d.rig.mesh.position.y - hy);
    b.position.copy(d.toWorld(hx, hy, hz, tmp));
    b.position.y += this.w.groundY(b.position.x, b.position.z);
    b.rotation.set(th, d.yaw, 0, 'YXZ');
  }
}

// clubbuild 的小人（演出）：模拟里每位客人（state.visitors）一个骨骼 Q 版人（clubsite/people），按客群换样子：
// 会员 = 大人拿球拍、青少年 = 孩子拿球拍、家庭 = 孩子或空手的大人、球迷 = 端杯子的大人。
// 每帧读模拟状态（只读）：客人在哪一段（walk / stay / out）、这一段还剩几秒 → 沿模拟同一条路线（sim.route）走，
// 速度 = 剩下的路 / 剩下的秒，所以到门口正好赶上花钱。在球场上挥拍、在餐车前端杯子、进房子（会所、球具店、泳池、看台）就看不见。
// 同时最多 CAP 个人（手机性能）；超出的客人照样在模拟里花钱，只是不画。动画永远不决定数值。
import * as THREE from 'three';
import { kid, player, strideOf } from '../clubsite/people';
import type { BaseCtx } from '../clubsite/render/ctx';
import { BY_ID, type Guest, TILE } from './catalog';
import type { AssetCtx } from './ctx';
import { DROP, GATE_X, GATE_Z, RAMP, RAMP_Z0, ROAD_FAR } from './lot';
import { footprint, type Placed, placedCenter, rotXZ, route, type State, tileCenter, type Visitor } from './sim';

/** 同时最多画几个人 */
export const CAP = 24;
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** 地面高：地块 0，路上低一级，坡道线性 */
export function groundAt(_x: number, z: number): number {
  if (z <= RAMP_Z0) return 0;
  if (z >= RAMP_Z0 + RAMP) return -DROP;
  return (-(z - RAMP_Z0) / RAMP) * DROP;
}

type Look = 'member' | 'junior' | 'kid' | 'adult' | 'fan';
type Mode = 'play' | 'wall' | 'hide' | 'cup' | 'stand';

interface Actor {
  vid: number;
  obj: THREE.Object3D;
  look: Look;
  pts: THREE.Vector3[];
  k: number;
  key: string;
  yaw: number;
  walkPh: number;
  /** 这一段的模式（到了以后做什么） */
  mode: Mode;
  /** 到了以后朝哪 */
  faceYaw: number | null;
  /** 姿势的循环（挥拍） */
  ph: number;
  swing: 'forehand' | 'backhand' | 'ready' | 'idle';
  leaving: boolean;
  paddle: boolean;
}

function modeOf(p: Placed): Mode {
  const t = BY_ID[p.id].tags;
  if (t.includes('training')) return 'wall';
  if (t.includes('court')) return 'play';
  if (t.includes('food')) return 'cup';
  if (t.includes('house') || t.includes('shop') || t.includes('pool') || t.includes('stand')) return 'hide';
  return 'stand';
}

export class Crowd {
  readonly root = new THREE.Group();
  private actors = new Map<number, Actor>();
  private skipped = new Set<number>();
  private pool = new Map<Look, THREE.Object3D[]>();

  constructor(private ctxFor: (v: number) => AssetCtx) {
    this.root.name = 'crowd';
  }

  get count() {
    return this.actors.size;
  }

  private make(look: Look, vid: number): THREE.Object3D {
    const list = this.pool.get(look);
    const o0 = list?.pop();
    if (o0) {
      o0.visible = true;
      return o0;
    }
    const v = vid % 4;
    const ctx = { ...this.ctxFor(v), params: new URLSearchParams() } as unknown as BaseCtx;
    const o = look === 'junior' || look === 'kid' ? kid(ctx) : player(ctx);
    o.userData.lookKind = look;
    // 开罗式的小人走得快：步子迈大一点，腿不至于抡成一团
    o.userData.stride = 1.5;
    return o;
  }

  private release(a: Actor) {
    a.obj.removeFromParent();
    const list = this.pool.get(a.look) ?? [];
    list.push(a.obj);
    this.pool.set(a.look, list);
  }

  private lookOf(g: Guest, vid: number): Look {
    if (g === 'member') return 'member';
    if (g === 'junior') return 'junior';
    if (g === 'fan') return 'fan';
    return vid % 2 ? 'kid' : 'adult';
  }

  private propFor(a: Actor) {
    const set = a.obj.userData.setProp as ((n: string | null) => void) | undefined;
    if (!set) return;
    if (a.look === 'member' || a.look === 'junior') set(a.paddle ? 'paddle' : 'racket');
    else if (a.look === 'fan') set('cup');
    else set(null);
  }

  /** 每帧：dt = 游戏秒（乘过速度） */
  update(state: State, dt: number) {
    const byVid = new Map<number, Visitor>();
    for (const v of state.visitors) byVid.set(v.vid, v);
    // 新来的客人（刚进门那一段才接；中途的不接）
    for (const v of state.visitors) {
      if (this.actors.has(v.vid) || this.skipped.has(v.vid)) continue;
      if (this.actors.size >= CAP || v.stage !== 'walk' || v.i !== 0) {
        this.skipped.add(v.vid);
        continue;
      }
      const look = this.lookOf(v.guest, v.vid);
      const obj = this.make(look, v.vid);
      const x = GATE_X + ((v.vid % 5) - 2) * 0.7;
      obj.position.set(x, -DROP, ROAD_FAR);
      obj.rotation.y = Math.PI;
      this.root.add(obj);
      const a: Actor = {
        vid: v.vid,
        obj,
        look,
        pts: [],
        k: 0,
        key: '',
        yaw: Math.PI,
        walkPh: 0,
        mode: 'stand',
        faceYaw: null,
        ph: 0,
        swing: 'idle',
        leaving: false,
        paddle: false,
      };
      this.propFor(a);
      this.actors.set(v.vid, a);
    }
    if (this.skipped.size > 400) for (const vid of [...this.skipped]) if (!byVid.has(vid)) this.skipped.delete(vid);

    for (const a of [...this.actors.values()]) {
      const v = byVid.get(a.vid);
      const key = v ? `${v.stage}:${v.i}` : 'gone';
      if (key !== a.key) {
        a.key = key;
        this.plan(a, state, v);
      }
      // 速度：剩下的路 / 剩下的秒
      let rem = 0;
      let prev = a.obj.position;
      for (let i = a.k; i < a.pts.length; i++) {
        rem += Math.hypot(a.pts[i].x - prev.x, a.pts[i].z - prev.z);
        prev = a.pts[i];
      }
      let speed: number;
      if (!v) speed = 5;
      else if (v.stage === 'stay') speed = 3.2;
      else speed = THREE.MathUtils.clamp(rem / Math.max(0.25, v.t), 1.6, 11);
      this.walk(a, dt, speed);
      if (!v && a.k >= a.pts.length) {
        this.actors.delete(a.vid);
        this.release(a);
      }
    }
  }

  /** 新的一段：算路线和到了以后做什么 */
  private plan(a: Actor, state: State, v: Visitor | undefined) {
    a.obj.visible = true;
    a.pts = [];
    a.k = 0;
    a.faceYaw = null;
    a.mode = 'stand';
    const toRoad = () => [
      V(GATE_X + ((a.vid % 3) - 1) * 0.8, 0, GATE_Z + 4),
      V(GATE_X + ((a.vid % 5) - 2) * 0.7, 0, ROAD_FAR),
    ];
    if (!v) {
      // 模拟里已经走了（收盘 / 走出大门）：从这里直接往大门、往路上走
      const r = this.nearestRoute(state, a);
      a.pts = [...r, ...toRoad()];
      a.leaving = true;
      return;
    }
    const cur = v.stops[v.i];
    const p = state.placed.find((q) => q.uid === cur);
    if (v.stage === 'walk') {
      const from = v.i === 0 ? null : v.stops[v.i - 1];
      const r = route(state, from, cur);
      a.pts = r ? r.map(([c, w]) => tileV(c, w)) : p ? [V(...xz(placedCenter(p)))] : [];
      if (v.i === 0) a.pts.unshift(V(GATE_X + ((a.vid % 3) - 1) * 0.8, 0, GATE_Z + 3.5));
      if (p?.id.startsWith('pickle') !== a.paddle) {
        a.paddle = !!p?.id.startsWith('pickle');
        this.propFor(a);
      }
    } else if (v.stage === 'stay' && p) {
      a.mode = modeOf(p);
      const spot = this.spotOf(a, p, state);
      a.pts = [spot.p];
      a.faceYaw = spot.yaw;
      a.ph = (a.vid * 0.37) % 1;
      a.swing = a.vid % 2 ? 'forehand' : 'ready';
    } else {
      const r = route(state, cur ?? null, null);
      a.pts = r ? r.map(([c, w]) => tileV(c, w)) : [];
      a.pts.push(...toRoad());
    }
  }

  /** 从现在的位置附近找一条去大门的路（模拟里这位客人已经没了） */
  private nearestRoute(state: State, a: Actor): THREE.Vector3[] {
    let best: THREE.Vector3[] = [];
    let bestD = Infinity;
    for (const p of state.placed) {
      if (p.id === 'path' || BY_ID[p.id].cap <= 0) continue;
      const [x, z] = placedCenter(p);
      const d = Math.hypot(x - a.obj.position.x, z - a.obj.position.z);
      if (d < bestD) {
        const r = route(state, p.uid, null);
        if (r) {
          bestD = d;
          best = r.map(([c, w]) => tileV(c, w));
        }
      }
    }
    // 路线起点离人太远（人在路上 / 在大门附近）：直接走
    if (best.length && bestD > 6) {
      const first = best.findIndex((q) => Math.hypot(q.x - a.obj.position.x, q.z - a.obj.position.z) < 4);
      if (first > 0) best = best.slice(first);
    }
    return best;
  }

  /** 到了设施以后站哪、朝哪 */
  private spotOf(a: Actor, p: Placed, state: State): { p: THREE.Vector3; yaw: number } {
    const def = BY_ID[p.id];
    const [cx, cz] = placedCenter(p);
    const slot = state.visitors.filter((v) => v.stage === 'stay' && v.stops[v.i] === p.uid && v.vid < a.vid).length;
    const at = (lx: number, lz: number, faceX: number, faceZ: number) => {
      const [x, z] = rotXZ(lx, lz, p.rot);
      const [fx, fz] = rotXZ(faceX, faceZ, p.rot);
      return { p: V(cx + x, 0, cz + z), yaw: Math.atan2(fx, fz) };
    };
    if (a.mode === 'play') {
      // 球场：两边底线，各两个人（双打站位），面朝球网
      const W = def.w * TILE;
      const D = def.d * TILE;
      const side = slot % 2 ? 1 : -1;
      const lane = slot >= 2 ? 1 : -1;
      return at(lane * W * 0.17, side * D * 0.34, 0, -side);
    }
    if (a.mode === 'wall') {
      const W = def.w * TILE;
      return at((slot - 0.5) * W * 0.3, def.d * TILE * 0.12, 0, -1);
    }
    // 其余：门口（门格往外半格），面朝设施
    const door = route(state, null, p.uid);
    const d = door?.[door.length - 1];
    const e = door?.[door.length - 2];
    if (d && e) {
      const [dx, dz] = tileCenter(d[0], d[1]);
      const [ex, ez] = tileCenter(e[0], e[1]);
      const k = a.mode === 'hide' ? 0.2 : 0.75;
      const jitter = ((slot % 3) - 1) * 0.7;
      const nx = ex - dx;
      const nz = ez - dz;
      const L = Math.hypot(nx, nz) || 1;
      return {
        p: V(dx + nx * k + (-nz / L) * jitter, 0, dz + nz * k + (nx / L) * jitter),
        yaw: Math.atan2(-nx, -nz),
      };
    }
    const fp = footprint(def, p.rot);
    return { p: V(cx, 0, cz + (fp.d * TILE) / 2 + 0.5), yaw: Math.PI };
  }

  private walk(a: Actor, dt: number, speed: number) {
    const pose = a.obj.userData.pose as ((n: string, ph?: number) => void) | undefined;
    const pos = a.obj.position;
    let step = speed * dt;
    let moved = false;
    while (step > 0 && a.k < a.pts.length) {
      const t = a.pts[a.k];
      const dx = t.x - pos.x;
      const dz = t.z - pos.z;
      const L = Math.hypot(dx, dz);
      if (L <= step) {
        pos.x = t.x;
        pos.z = t.z;
        step -= L;
        a.k++;
      } else {
        pos.x += (dx / L) * step;
        pos.z += (dz / L) * step;
        a.yaw = turnTo(a.yaw, Math.atan2(dx, dz), dt * 12);
        step = 0;
      }
      moved = true;
    }
    pos.y = groundAt(pos.x, pos.z);
    if (moved && a.k <= a.pts.length) {
      a.walkPh = (a.walkPh + (speed * dt) / strideOf(a.obj)) % 1;
      pose?.('walk', a.walkPh);
    }
    if (a.k >= a.pts.length && !moved) {
      // 到了
      if (a.faceYaw !== null) a.yaw = turnTo(a.yaw, a.faceYaw, dt * 10);
      if (a.mode === 'hide' && !a.leaving) a.obj.visible = false;
      else if (a.mode === 'play' || a.mode === 'wall') {
        const per = a.swing === 'ready' ? 1.2 : 1.1;
        a.ph += dt / per;
        if (a.ph >= 1) {
          a.ph -= 1;
          // 正手、反手、准备轮着来
          const r = (a.vid * 7 + Math.floor(a.walkPh * 10 + a.ph * 100)) % 3;
          a.swing = r === 0 ? 'forehand' : r === 1 ? 'backhand' : 'ready';
          if (a.mode === 'wall') a.swing = a.swing === 'ready' ? 'forehand' : a.swing;
        }
        pose?.(a.swing, a.ph);
      } else pose?.('idle');
    }
    a.obj.rotation.y = a.yaw;
    (a.obj.userData.update as ((dt: number) => void) | undefined)?.(dt);
  }

  /** 所有人身上的头顶点（飘字用）：vid → 世界坐标 */
  headOf(vid: number): THREE.Vector3 | null {
    const a = this.actors.get(vid);
    if (!a?.obj.visible) return null;
    return a.obj.position.clone().add(V(0, 2.2, 0));
  }
}

const xz = ([x, z]: [number, number]): [number, number, number] => [x, 0, z];
const tileV = (c: number, r: number) => {
  const [x, z] = tileCenter(c, r);
  return V(x, 0, z);
};

function turnTo(a: number, b: number, k: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * Math.min(1, k);
}

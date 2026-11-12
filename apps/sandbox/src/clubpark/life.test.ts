// clubpark 演出的无画面探针：替身物件（不要渲染器），按 1/60 秒推 12 分钟，量车和人的物理：
//   车：每帧从位姿差分出速度、横摆角速度 → 横向加速度 v·ω、后轴中点的横向速度（后轮侧滑）、纵向加速度；
//       开着的车和别的车（矩形对矩形）、和人（矩形对圆）压进去多深；
//   人：一帧起步 / 一帧停、人和人的距离。
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { AssetCtx } from './ctx';
import { SLOTS } from './layout';
import { createParkLife } from './life';

const DT = 1 / 60;

function rngOf(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

function stub(kind: string): THREE.Object3D {
  const o = new THREE.Group();
  o.userData.kind = kind;
  for (const f of ['setPaint', 'setDoor', 'setSpeed', 'setBrake', 'update', 'pose', 'setProp', 'setBags', 'setMotion'])
    o.userData[f] = () => {};
  return o;
}

interface Pose {
  x: number;
  z: number;
  rot: number;
}
const HALF: Record<string, number> = { car: 2.17, suv: 2.42 };
const HALF_W = 0.92;

/** 矩形（中心、朝向、半长、半宽）的四个角 */
function corners(p: Pose, hl: number, hw: number): [number, number][] {
  const nx = -Math.sin(p.rot);
  const nz = -Math.cos(p.rot);
  const sx = Math.cos(p.rot);
  const sz = -Math.sin(p.rot);
  return [
    [p.x + nx * hl + sx * hw, p.z + nz * hl + sz * hw],
    [p.x + nx * hl - sx * hw, p.z + nz * hl - sz * hw],
    [p.x - nx * hl - sx * hw, p.z - nz * hl - sz * hw],
    [p.x - nx * hl + sx * hw, p.z - nz * hl + sz * hw],
  ];
}
/** 两个矩形压进去多深（分离轴；不相交 = 0） */
function obbPen(a: [number, number][], b: [number, number][]): number {
  let pen = Infinity;
  for (const poly of [a, b])
    for (let i = 0; i < 2; i++) {
      const ex = poly[i + 1][0] - poly[i][0];
      const ez = poly[i + 1][1] - poly[i][1];
      const l = Math.hypot(ex, ez);
      const ax = -ez / l;
      const az = ex / l;
      const pr = (q: [number, number][]) => q.map(([x, z]) => x * ax + z * az);
      const pa = pr(a);
      const pb = pr(b);
      const o = Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb));
      if (o <= 0) return 0;
      pen = Math.min(pen, o);
    }
  return pen;
}
/** 圆压进矩形多深 */
function circPen(p: Pose, hl: number, hw: number, cx: number, cz: number, r: number): number {
  const dx = cx - p.x;
  const dz = cz - p.z;
  const along = dx * -Math.sin(p.rot) + dz * -Math.cos(p.rot);
  const side = dx * Math.cos(p.rot) + dz * -Math.sin(p.rot);
  const qx = Math.max(Math.abs(along) - hl, 0);
  const qz = Math.max(Math.abs(side) - hw, 0);
  return Math.max(0, r - Math.hypot(qx, qz));
}

export function probe(minutes: number, play = false, seed = 11, dumpStuck = 0) {
  const made: THREE.Object3D[] = [];
  const scene = new THREE.Group();
  const ctx = {
    rng: () => rngOf(seed),
    mat: () => new THREE.MeshBasicMaterial(),
    mats: { prepare() {} },
    params: new URLSearchParams(),
  } as unknown as AssetCtx;
  const life = createParkLife({
    ctx,
    scene,
    make: (asset) => {
      const o = stub(asset);
      made.push(o);
      return o;
    },
    groundAt: () => 0,
    find: () => undefined,
    parked: SLOTS.filter((s) => s.id.startsWith('park-')).map((s) => ({
      id: s.id,
      asset: s.asset,
      x: s.x,
      z: s.z,
      rotY: s.rotY ?? 0,
      variant: s.variant ?? 0,
    })),
    play,
    director: () => null,
  });
  const isCar = (o: THREE.Object3D) => o.userData.kind === 'car' || o.userData.kind === 'suv';
  const prev = new Map<THREE.Object3D, Pose & { v: number; vis: boolean }>();
  const m = {
    maxLat: 0,
    latOver4: 0,
    maxSlip: 0,
    slipOver02: 0,
    maxAcc: 0,
    carCarFrames: 0,
    carCarMax: 0,
    carPersonFrames: 0,
    carPersonMax: 0,
    pplClose: 0,
    pplSnapStart: 0,
    pplSnapStop: 0,
    carFrames: 0,
    served: 0,
    maxQueue: 0,
    maxStill: 0,
  };
  const steps = Math.round((minutes * 60) / DT);
  for (let i = 0; i < steps; i++) {
    life.update(DT);
    const carsNow = made.filter((o) => isCar(o) && o.visible);
    const pplNow = made.filter((o) => !isCar(o) && o.visible);
    const moving: THREE.Object3D[] = [];
    for (const o of made) {
      const p = { x: o.position.x, z: o.position.z, rot: o.rotation.y };
      const q = prev.get(o);
      let v = 0;
      if (q?.vis && o.visible) {
        const dx = p.x - q.x;
        const dz = p.z - q.z;
        const d = Math.hypot(dx, dz);
        v = d / DT;
        if (isCar(o)) {
          // 传送（回池子、摆到画外）不算
          if (d < 1) {
            let w = p.rot - q.rot;
            w -= Math.round(w / (Math.PI * 2)) * Math.PI * 2;
            w /= DT;
            if (v > 0.02) {
              m.carFrames++;
              moving.push(o);
              const lat = Math.abs(v * w);
              m.maxLat = Math.max(m.maxLat, lat);
              if (lat > 4) m.latOver4++;
              // 后轴中点（车中心往车尾 0.62·半长）的横向速度
              const hl = HALF[o.userData.kind];
              const rear = (r: Pose) => [r.x + Math.sin(r.rot) * hl * 0.62, r.z + Math.cos(r.rot) * hl * 0.62];
              const [ax, az] = rear(q);
              const [bx, bz] = rear(p);
              const mid = (p.rot + q.rot) / 2;
              const slip = Math.abs(((bx - ax) * Math.cos(mid) + (bz - az) * -Math.sin(mid)) / DT);
              m.maxSlip = Math.max(m.maxSlip, slip);
              if (slip > 0.2) m.slipOver02++;
            }
            m.maxAcc = Math.max(m.maxAcc, Math.abs(v - q.v) / DT);
          }
        } else if (d < 0.5) {
          if (q.v < 0.05 && v > 0.9) m.pplSnapStart++;
          if (q.v > 0.9 && v < 0.05) m.pplSnapStop++;
        }
      }
      prev.set(o, { ...p, v, vis: o.visible });
    }
    for (const a of moving) {
      const ca = corners({ x: a.position.x, z: a.position.z, rot: a.rotation.y }, HALF[a.userData.kind], HALF_W);
      let worst = 0;
      for (const b of carsNow) {
        if (a === b) continue;
        const cb = corners({ x: b.position.x, z: b.position.z, rot: b.rotation.y }, HALF[b.userData.kind], HALF_W);
        worst = Math.max(worst, obbPen(ca, cb));
      }
      if (worst > 0.05) m.carCarFrames++;
      m.carCarMax = Math.max(m.carCarMax, worst);
      let wp = 0;
      for (const p of pplNow)
        wp = Math.max(
          wp,
          circPen(
            { x: a.position.x, z: a.position.z, rot: a.rotation.y },
            HALF[a.userData.kind],
            HALF_W,
            p.position.x,
            p.position.z,
            0.25,
          ),
        );
      if (wp > 0.05) m.carPersonFrames++;
      m.carPersonMax = Math.max(m.carPersonMax, wp);
    }
    for (let a = 0; a < pplNow.length; a++)
      for (let b = a + 1; b < pplNow.length; b++)
        if (pplNow[a].position.distanceTo(pplNow[b].position) < 0.45) m.pplClose++;
    const s = life.stats();
    m.served = s.served;
    m.maxQueue = Math.max(m.maxQueue, s.queue);
    m.maxStill = Math.max(m.maxStill, s.stuck);
    if (dumpStuck && s.stuck > dumpStuck) {
      const d = life.debug() as { cars: { live: boolean }[] };
      console.log(JSON.stringify({ ...d, cars: d.cars.filter((c) => c.live), stalls: undefined }));
      break;
    }
  }
  return m;
}

describe('clubpark 的车和人', () => {
  const runs: [string, number, boolean, number][] = [
    ['12 分钟', 12, false, 11],
    ['12 分钟（种子 5）', 12, false, 5],
    ['12 分钟（种子 23）', 12, false, 23],
    ['30 分钟', 30, false, 11],
    ['玩法模式 12 分钟（没人帮忙）', 12, true, 11],
  ];
  for (const [name, minutes, play, seed] of runs)
    it(name, () => {
      const m = probe(minutes, play, seed, Number(process.env.DUMP ?? 0));
      if (process.env.SHOW) console.log(name, JSON.stringify(m));
      // 车：后轮不侧滑、过弯不甩、不穿车、不压人
      expect(m.maxLat).toBeLessThan(4);
      expect(m.maxSlip).toBeLessThan(0.4);
      expect(m.maxAcc).toBeLessThan(60);
      expect(m.carCarFrames).toBe(0);
      expect(m.carPersonFrames).toBe(0);
      // 人：不一帧起步 / 一帧停
      expect(m.pplSnapStart + m.pplSnapStop).toBeLessThan(minutes * 2);
      // 车流：没有卡死的车，会员送得走
      expect(m.maxStill).toBeLessThan(90);
      expect(m.served).toBeGreaterThanOrEqual(Math.floor(minutes / 3));
    });
});

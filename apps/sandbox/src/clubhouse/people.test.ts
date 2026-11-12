// 健身姿势的数字探针（无画面：替身材质）：臀落在座面上、脚在跑带 / 脚蹬 / 地上、手在把手 / 杠铃 / 沙袋上，保护的手托着卧推的杠铃。
// 跑：pnpm vitest run apps/sandbox/src/clubhouse/people.test.ts（PROBE=1 打印读数）
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { coach, player } from '../clubsite/people';
import type { AssetCtx } from './ctx';
import {
  BAG_DIST,
  BAG_R,
  BAG_Y,
  BENCH_BAR_Z,
  BENCH_PAD,
  benchBarY,
  CYCLE_BARS,
  CYCLE_SEAT,
  DESK_TOP,
  GYM_PERIOD,
  GYM_POSES,
  gymPerson,
  PUNCH_HITS,
  ROW_FOOT,
  ROW_SEAT,
  RUN_BELT,
  SLED_HANDLE,
} from './people';
import { SLOTS_B1 } from './slots-b1';

const LOG = !!process.env.PROBE;
const log = (...a: unknown[]) => LOG && console.log(...a);

function ctxFor(variant = 0, q = ''): AssetCtx {
  const mk = () => new THREE.MeshBasicMaterial();
  return {
    variant,
    params: new URLSearchParams(q),
    pal: {},
    mat: mk,
    mats: { prepare() {}, toon: mk },
    rng: () => () => 0.5,
    texel: 0.09,
  } as unknown as AssetCtx;
}

type Ud = Record<string, (...a: unknown[]) => unknown>;
const ud = (o: THREE.Object3D) => o.userData as Ud;
function parts(o: THREE.Object3D) {
  const hips = o.children[0];
  const torso = hips.children[0];
  const head = torso.children[0];
  const [a, b] = [torso.children[1], torso.children[2]];
  const [shR, shL] = a.position.x < b.position.x ? [a, b] : [b, a];
  const [la, lb] = [hips.children[1], hips.children[2]];
  const [legR, legL] = la.position.x < lb.position.x ? [la, lb] : [lb, la];
  return { hips, torso, head, handR: shR.children[0], handL: shL.children[0], legR, legL };
}
const W = (o: THREE.Object3D, x = 0, y = 0, z = 0) => {
  o.updateWorldMatrix(true, false);
  return o.localToWorld(new THREE.Vector3(x, y, z));
};
/** 看得见的网格（可以按名字 / 祖先过滤）里最低的顶点（世界 y） */
function lowest(o: THREE.Object3D, keep: (m: THREE.Mesh) => boolean = () => true) {
  o.updateMatrixWorld(true);
  let lo = Infinity;
  const v = new THREE.Vector3();
  o.traverseVisible((c) => {
    const m = c as THREE.Mesh;
    if (!m.isMesh || !keep(m)) return;
    const p = m.geometry.getAttribute('position');
    for (let i = 0; i < p.count; i++) lo = Math.min(lo, v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld).y);
  });
  return lo;
}
/** 膝盖腿（legs.ts）：腿组里的 Group（alt）→ knee → [shin, ankle] */
const ankleOf = (leg: THREE.Object3D) => {
  const alt = leg.children.find((c) => (c as THREE.Group).isGroup)!;
  const knee = alt.children.find((c) => (c as THREE.Group).isGroup)!;
  return knee.children[1];
};
/** 鞋底（踝组下的鞋网格的最低点） */
const soleY = (leg: THREE.Object3D) => lowest(ankleOf(leg));
const PH = Array.from({ length: 21 }, (_, i) => i / 20);
const f2 = (x: number) => x.toFixed(3);

function gym(pose: string, ph: number, o: { variant?: number; seat?: number; asset?: 'coach' } = {}) {
  const p = (o.asset === 'coach' ? coach : player)(ctxFor(o.variant ?? 0));
  gymPerson(p, ctxFor(o.variant ?? 0));
  if (o.seat !== undefined) ud(p).setSeat(o.seat, 0);
  ud(p).pose(pose, ph);
  return p;
}

describe('gym poses', () => {
  it('gymPerson is idempotent, adds the poses, unknown names fall through', () => {
    const p = player(ctxFor(1));
    gymPerson(p);
    const upd = p.userData.update;
    gymPerson(p);
    expect(p.userData.update).toBe(upd);
    for (const n of GYM_POSES) expect((p.userData.poses as string[]).includes(n)).toBe(true);
    for (const n of GYM_POSES) expect(ud(p).period(n)).toBe(GYM_PERIOD[n]);
    ud(p).pose('walk', 0.3);
    expect(ud(p).gymPose()).toBe(null);
    ud(p).pose('run');
    expect(ud(p).gymPose()).toBe('run');
    expect(ud(p).period()).toBe(GYM_PERIOD.run);
    // 不是人：原样返回
    const g = new THREE.Group();
    expect(gymPerson(g)).toBe(g);
    expect(g.userData.__gym).toBeUndefined();
  });

  it('loop: pose(name, phase) keeps playing from that phase; without loop it freezes', () => {
    const a = player(ctxFor(0));
    gymPerson(a, ctxFor(0), { loop: true });
    ud(a).pose('punch', 0.1);
    const h0 = W(parts(a).handL).clone();
    ud(a).update(0.06);
    expect(W(parts(a).handL).distanceTo(h0)).toBeGreaterThan(0.01);
    const b = player(ctxFor(0));
    gymPerson(b, ctxFor(0));
    ud(b).pose('punch', 0.1);
    const g0 = W(parts(b).handL).clone();
    ud(b).update(0.06);
    expect(W(parts(b).handL).distanceTo(g0)).toBeLessThan(1e-6);
  });

  it('leaving a gym pose restores the knee legs (no stretched thighs left behind)', () => {
    const p = gym('row', 0.4);
    ud(p).pose('idle', 0);
    const { legR } = parts(p);
    let k = 0;
    legR.traverse((c) => {
      if ((c as THREE.Mesh).isMesh && c.scale.y !== 1) k++;
    });
    expect(k).toBe(0);
  });

  it('run: feet on the belt (never below), stance foot touches it', () => {
    let lo = Infinity;
    for (const ph of PH) {
      const p = gym('run', ph);
      const { legR, legL } = parts(p);
      lo = Math.min(lo, soleY(legR), soleY(legL));
    }
    log('run lowest sole', f2(lo));
    expect(lo).toBeGreaterThan(RUN_BELT - 0.03);
    expect(lo).toBeLessThan(RUN_BELT + 0.03);
  });

  it('row: butt on the seat, feet at the foot plate, hands on the handle through the stroke', () => {
    for (const ph of PH) {
      const p = gym('row', ph);
      const { hips, legR, handR, handL } = parts(p);
      const butt = lowest(p, (m) => m.parent === hips);
      expect(Math.abs(butt - ROW_SEAT)).toBeLessThan(0.05);
      const toe = lowest(legR);
      expect(toe).toBeGreaterThan(0);
      // 鞋在脚蹬那儿（root 前 ROW_FOOT ± 0.2）
      let shoeZ = -Infinity;
      legR.traverseVisible((c) => {
        if ((c as THREE.Mesh).isMesh) shoeZ = Math.max(shoeZ, W(c).z);
      });
      expect(Math.abs(shoeZ - ROW_FOOT)).toBeLessThan(0.2);
      const hr = W(handR);
      const hl = W(handL);
      expect(Math.abs(hr.y - hl.y)).toBeLessThan(0.02);
      if (ph === 0 || ph === 0.4) log('row', ph, 'butt', f2(butt), 'shoeZ', f2(shoeZ), 'hand', f2(hr.y), f2(hr.z));
    }
  });

  it('cycle: butt on the saddle, hands on the bars', () => {
    for (const ph of PH) {
      const p = gym('cycle', ph);
      const { hips, handR, handL } = parts(p);
      const butt = lowest(p, (m) => m.parent === hips);
      expect(Math.abs(butt - CYCLE_SEAT)).toBeLessThan(0.05);
      expect(W(handR).distanceTo(new THREE.Vector3(-CYCLE_BARS.x, CYCLE_BARS.y, CYCLE_BARS.z))).toBeLessThan(0.04);
      expect(W(handL).distanceTo(new THREE.Vector3(CYCLE_BARS.x, CYCLE_BARS.y, CYCLE_BARS.z))).toBeLessThan(0.04);
    }
  });

  it('benchPress: lying on the pad (back on it, not through it), hands on the bar', () => {
    for (const ph of PH) {
      const p = gym('benchPress', ph);
      const { torso, handR, handL } = parts(p);
      const back = lowest(p, (m) => m.parent === torso);
      expect(back).toBeGreaterThan(BENCH_PAD - 0.04);
      expect(back).toBeLessThan(BENCH_PAD + 0.06);
      const y = benchBarY(ph);
      expect(Math.abs(W(handR).y - y)).toBeLessThan(0.03);
      expect(Math.abs(W(handL).z - BENCH_BAR_Z)).toBeLessThan(0.03);
      const bar = p.getObjectByName('gym-bar');
      expect(bar?.visible).toBe(true);
      if (ph === 0 || ph === 0.5)
        log('bench', ph, 'back', f2(back), 'bar', f2(y), 'hands x', f2(W(handR).x), f2(W(handL).x));
    }
  });

  it('spot: at the slot positions, the spotter hands sit just under the presser bar all the way', () => {
    const slot = (id: string) => SLOTS_B1.find((s) => s.id === id)!;
    const ps = slot('gym-presser');
    const ss = slot('gym-spotter');
    expect(ps.pose?.[0]).toBe('benchPress');
    expect(ss.pose?.[0]).toBe('spot');
    expect(ss.pose?.[1]).toBe(ps.pose?.[1]);
    expect(ss.z).toBe(ps.z);
    expect(ss.x).toBe(ps.x);
    let worst = 0;
    for (const ph of PH) {
      const a = gym('benchPress', ph);
      a.position.set(ps.x, 0, ps.z);
      a.rotation.y = ps.rotY ?? 0;
      const b = gym('spot', ph);
      b.position.set(ss.x, 0, ss.z);
      b.rotation.y = ss.rotY ?? 0;
      const bar = a.getObjectByName('gym-bar')!;
      const c = W(bar);
      const { handR, handL } = parts(b);
      for (const h of [handR, handL]) {
        const w = W(h);
        // 托在下面：比杠低 0.06..0.14，横向在杠的范围里，前后在杠上
        expect(c.y - w.y).toBeGreaterThan(0.05);
        expect(c.y - w.y).toBeLessThan(0.15);
        expect(Math.abs(w.z - c.z)).toBeLessThan(0.05);
        worst = Math.max(worst, Math.abs(w.z - c.z));
      }
    }
    log('spot worst z', f2(worst));
  });

  it('squat: bar on the upper back, hands on it, feet planted', () => {
    for (const ph of PH) {
      const p = gym('squat', ph);
      const { legR, legL, handR, handL } = parts(p);
      expect(Math.abs(soleY(legR))).toBeLessThan(0.02);
      expect(Math.abs(soleY(legL))).toBeLessThan(0.02);
      const bar = p.getObjectByName('gym-bar')!;
      const c = W(bar);
      const ax = W(bar, 0, 1, 0).sub(c);
      // 两只手都在杠上（离杠的轴 < 0.1）
      for (const h of [handR, handL]) {
        const v = W(h).sub(c);
        const off = v.clone().sub(ax.clone().multiplyScalar(v.dot(ax)));
        expect(off.length()).toBeLessThan(0.1);
      }
    }
    const top = gym('squat', 0);
    const deep = gym('squat', 0.5);
    expect(W(parts(top).hips).y - W(parts(deep).hips).y).toBeGreaterThan(0.12);
  });

  it('punch: jab and cross land on the bag front, guard otherwise', () => {
    const face = BAG_DIST - BAG_R;
    const a = gym('punch', PUNCH_HITS[0]);
    const l = W(parts(a).handL);
    const b = gym('punch', PUNCH_HITS[1]);
    const r = W(parts(b).handR);
    log('punch jab', f2(l.z), f2(l.y), 'cross', f2(r.z), f2(r.y), 'bag face', f2(face));
    expect(Math.abs(l.z + 0.06 - face)).toBeLessThan(0.08);
    expect(Math.abs(r.z + 0.06 - face)).toBeLessThan(0.08);
    expect(Math.abs(l.y - BAG_Y)).toBeLessThan(0.2);
    const g = gym('punch', 0.42);
    expect(W(parts(g).handL).z).toBeLessThan(face - 0.15);
  });

  it('sledPush: hands on the handles, feet on the ground', () => {
    let lo = Infinity;
    for (const ph of PH) {
      const p = gym('sledPush', ph);
      const { legR, legL, handR, handL } = parts(p);
      lo = Math.min(lo, soleY(legR), soleY(legL));
      expect(W(handR).distanceTo(new THREE.Vector3(-SLED_HANDLE.x, SLED_HANDLE.y, SLED_HANDLE.z))).toBeLessThan(0.04);
      expect(W(handL).distanceTo(new THREE.Vector3(SLED_HANDLE.x, SLED_HANDLE.y, SLED_HANDLE.z))).toBeLessThan(0.04);
    }
    expect(Math.abs(lo)).toBeLessThan(0.03);
  });

  it('stretch: seated (setSeat) butt on the seat; standing holds the right ankle', () => {
    const p = gym('stretch', 0.3, { seat: 0.75 });
    const { hips } = parts(p);
    expect(Math.abs(lowest(p, (m) => m.parent === hips) - 0.75)).toBeLessThan(0.05);
    const s = gym('stretch', 0.3);
    const { legL, legR, handR } = parts(s);
    expect(Math.abs(soleY(legL))).toBeLessThan(0.02);
    expect(soleY(legR)).toBeGreaterThan(0.3);
    const ank = W(ankleOf(legR));
    log('quad', 'hand→ankle', f2(W(handR).distanceTo(ank)));
    expect(W(handR).distanceTo(ank)).toBeLessThan(0.2);
  });

  it('deskServe: towel goes over the counter top and comes back empty', () => {
    const out = gym('deskServe', 0.55);
    const t = out.getObjectByName('gym-towel')!;
    expect(t.visible).toBe(true);
    const w = W(t);
    log('desk towel', f2(w.y), f2(w.z));
    expect(w.y).toBeGreaterThan(DESK_TOP + 0.1);
    expect(w.z).toBeGreaterThan(0.4);
    const back = gym('deskServe', 0.9);
    expect(back.getObjectByName('gym-towel')?.visible).toBe(false);
    // 扶在台面上时手在台面上方
    const { handR } = parts(back);
    expect(W(handR).y).toBeGreaterThan(DESK_TOP);
  });

  it('coachLead: arms out at the side, up in a V, feet on the stage', () => {
    const p = gym('coachLead', 0.2, { asset: 'coach' });
    const { handL, legL, legR } = parts(p);
    expect(W(handL).x).toBeGreaterThan(0.55);
    const u = gym('coachLead', 0.45, { asset: 'coach' });
    expect(W(parts(u).handL).y).toBeGreaterThan(1.25);
    expect(Math.abs(soleY(legL))).toBeLessThan(0.1);
    expect(Math.abs(soleY(legR))).toBeLessThan(0.1);
  });
});

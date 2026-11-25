// 球（第一轮评审「要补的画面」3、第二轮问题 1 / 要补的画面 1、7）：引擎说"在打球"的地方都有球，球和挥拍对得上。
//   对打：网球场、匹克球场、中心球场的表演赛（post.stadium.pros）—— 场上站着的人按站位朝向分两边，每一拍一边的一个人击球，
//     球在两个击球点之间飞（过网的弧线 + 在接球的人前面落地弹一下），正好在他挥拍碰到球的那一刻到他的拍子上。
//   喂球：青训课（教练在教练位喂、站在击球点上的孩子轮流接）、私教课（场上有个 doing 'coach' 的教练）—— 教练 feed 一下
//     （FEED_RELEASE 拍子碰球）→ 球落地弹到学员面前 → 学员挥拍打回去 → 球落在教练那半场、弹一下就没了（下一个球已经在路上）。
//   对着墙打（courts.wall：Tommy 等 Sofía 下课）：一个人一下一下打到挡风布上，弹回来落地一下再接。
// 姿势也在这里摆（覆盖 mount.ts 的 rallyPose）：球和挥拍出自同一张时间表，坐在场边椅子上的（表演赛换边歇着的）不算在两边里。
// 网球：clubsite 的 tennis-ball（⌀ 0.2，荧光黄绿，InstancedMesh 一个 draw call）；匹克球：clubsite 的 pickleball（亮黄带孔）。
// 两种球都投真影子（cast），影子跟着太阳走。只在取景附近演（远处的场 mount 自己的 rallyPose 顶着，没有球）。
import * as THREE from 'three';
import type { NetCtx } from '../../../clubsite/assets/nets/kit';
import { build as pickleBall } from '../../../clubsite/assets/pickleball';
import { ballKit } from '../../../clubsite/assets/tennis-ball';
import type { AgentView, PlaceId } from '../../../clubsite/sim/types';
import { PLACES, SPOTS } from '../deps';
import { type FxActor, type FxFrame, type FxKits, type FxPart, hashOf, inRect } from './util';

/** 同 mount.ts rallyPose：一拍几秒 */
const T_TENNIS = 1.3;
const T_PICKLE = 0.8;
/** 喂球一下几秒（rig 的 feed 一遍）、拍子碰球在第几秒（FEED_RELEASE 0.6 × 1.6） */
const T_FEED = 1.6;
const FEED_HIT = 0.96;
/** 对着墙打一下几秒 */
const T_WALL = 1.25;
/** 每拍开始到拍子碰到球（秒）：正反手 phase 0.485 × 1.1；发球 hit 0.6 × 1.6；dink DINK_HIT 0.55 × 0.6 */
const HIT_STROKE = 0.53;
const HIT_SERVE = 0.96;
const HIT_DINK = 0.33;
/** 正反手一遍几秒（pose.ts 的 PERIOD） */
const P_STROKE = 1.1;
const P_SERVE = 1.6;
const P_READY = 1.2;
const RALLY_POSES = new Set(['ready', 'forehand', 'backhand', 'serve', 'dink', 'dinkB']);
const PLAYS = new Set(['tennis', 'pickle', 'lesson']);
const MAX = 32;
/** 青训场北边的挡风布（courts.wall 的人朝南对着它打）：z */
const WALL_Z = -2.3;

const RALLY_AT: PlaceId[] = PLACES.filter(
  (p) => p.kind === 'court' || p.kind === 'pickle' || (p.kind === 'post' && p.doing === 'tennis'),
).map((p) => p.id);
const PICKLE = new Set(PLACES.filter((p) => p.kind === 'pickle').map((p) => p.id));
/** 青训课：上课的地点 → 教练的岗位（needs） */
const LESSONS = PLACES.filter((p) => p.kind === 'lesson' && p.needs).map((p) => ({
  at: p.id,
  post: p.needs as PlaceId,
}));
const WALLS: PlaceId[] = PLACES.filter((p) => p.kind === 'play' && p.doing === 'tennis').map((p) => p.id);
/** 地点的第几个站位是击球点（站位表写了 ready 的）：青训课排着的孩子不挥拍 */
const hitSpot = (at: PlaceId, spot: number) => SPOTS[at]?.spots[spot]?.pose === 'ready';

interface Hit {
  id: string;
  /** 击球点（世界） */
  p: THREE.Vector3;
  t: number;
}

const pose = (a: FxActor, name: string, ph: number) => a.body?.obj.userData.pose?.(name, ((ph % 1) + 1) % 1);
const sideOf = (a: FxActor) => (Math.sin(a.yaw) >= 0 ? 1 : -1);
/** 人本地的一点（右手在 −x，脸朝 +z；孩子 / 少年缩）→ 世界 */
function localPt(a: FxActor, lx: number, ly: number, lz: number, out = new THREE.Vector3()) {
  const c = Math.cos(a.yaw);
  const s = Math.sin(a.yaw);
  const k = a.kind === 'kid' ? 0.7 : a.kind === 'teen' ? 0.85 : 1;
  return out.set(a.x + (lx * c + lz * s) * k, a.y + ly * k, a.z + (-lx * s + lz * c) * k);
}
/** 转过身朝着 (x, z)：身子转过去，返回一个改了朝向的演员（只给这里算击球点用） */
function face(a: FxActor, x: number, z: number): FxActor {
  const yaw = Math.atan2(x - a.x, z - a.z);
  const o = a.body?.obj;
  if (o) o.rotation.y = yaw;
  return { ...a, yaw };
}
/** 正反手拍子碰球的地方（人本地） */
const strokePt = (a: FxActor, fh: boolean, out = new THREE.Vector3()) => localPt(a, fh ? -0.78 : 0.78, 0.95, 0.3, out);
/** 一段抛物线：a → b，最高比直线高 h */
function arc(a: THREE.Vector3, b: THREE.Vector3, u: number, h: number, out: THREE.Vector3) {
  out.lerpVectors(a, b, u);
  out.y += 4 * h * u * (1 - u);
  return out;
}

export function createBalls(scene: THREE.Scene): FxPart & { prewarm(k: FxKits): THREE.Object3D[] } {
  let tennis: THREE.InstancedMesh | null = null;
  let pickle: THREE.Object3D | null = null;
  const m4 = new THREE.Matrix4();
  const tmp = new THREE.Vector3();
  const v1 = new THREE.Vector3();
  const v2 = new THREE.Vector3();
  const v3 = new THREE.Vector3();
  const pts: [number, number, number][] = [];
  const viewOf = new Map<string, AgentView>();
  let nt = 0;
  const st = { courts: 0, balls: 0, skipped: 0, feeds: 0, walls: 0 };

  function ensure(k: FxKits) {
    if (tennis) return;
    const kit = ballKit(k.people as unknown as NetCtx);
    tennis = new THREE.InstancedMesh(kit.geo, kit.mat, MAX);
    tennis.name = 'sim:fx:balls';
    tennis.count = 0;
    tennis.frustumCulled = false;
    k.people.mats.prepare(tennis, { cast: true, receive: false });
    scene.add(tennis);
    pickle = pickleBall(k.people as unknown as NetCtx);
    pickle.name = 'sim:fx:pickleballs';
    pickle.userData.setBalls([], []);
    k.people.mats.prepare(pickle, { cast: true, receive: false });
    scene.add(pickle);
  }
  const putTennis = (p: THREE.Vector3) => {
    if (nt >= MAX || !tennis) return;
    tennis.setMatrixAt(nt++, m4.makeTranslation(p.x, p.y, p.z));
    st.balls++;
  };

  /** 站定了、有身子、看得见、在打球（不是坐在场边的） */
  function standing(f: FxFrame, id: string): FxActor | null {
    const a = f.actors.get(id);
    if (!a || a.moving || a.hidden || !a.body?.obj.visible) return null;
    const d = f.s.agents[id]?.doing;
    return d && PLAYS.has(d) ? a : null;
  }

  // ── 对打 ──
  /** 第 n 拍：谁打、什么球、什么时候碰到球、在哪（同 rallyPose 的排法，只算站在场上的人） */
  function hitOf(at: PlaceId, P: readonly FxActor[], n: number, isPickle: boolean): Hit | null {
    const T = isPickle ? T_PICKLE : T_TENNIS;
    const ch = hashOf(at) * 10;
    const side = n % 2 ? 1 : -1;
    const team = P.filter((b) => sideOf(b) === side);
    if (!team.length) return null;
    const a = team[Math.floor(n / 2) % team.length];
    const serve = !isPickle && (n % 14 === 0 || n % 14 === 1);
    const fh = isPickle ? hashOf(`${at}${n}`) < 0.5 : hashOf(`${at}${n}`) < 0.55;
    const off = isPickle ? HIT_DINK : serve ? HIT_SERVE : HIT_STROKE;
    // 拍子碰球的地方（人的本地：右手在 −x，脸朝 +z）
    const lx = serve ? -0.15 : isPickle ? (fh ? -0.32 : 0.08) : fh ? -0.78 : 0.78;
    const ly = serve ? 2.4 : isPickle ? 0.55 : 0.95;
    const lz = serve ? 0.35 : isPickle ? 0.62 : 0.3;
    return { id: a.id, p: localPt(a, lx, ly, lz), t: n * T - ch + off };
  }
  /** 一段球：从 h0 击出 → 在 bounce（水平比例）处落地 → 弹到 h1 */
  function flight(a: Hit, b: Hit, t: number, isPickle: boolean, out: THREE.Vector3) {
    const u = THREE.MathUtils.clamp((t - a.t) / (b.t - a.t), 0, 1);
    const bounce = isPickle ? 0.8 : 0.72;
    return bounced(a.p, b.p, u, bounce, isPickle ? 0.55 : 0.9 + 0.25 * Math.min(1, a.p.distanceTo(b.p) / 20), out);
  }
  /** a → 落地（水平比例 bounce，地面 = 两头的人脚下高度插值）→ 弹起来正好到 b */
  function bounced(a: THREE.Vector3, b: THREE.Vector3, u: number, bounce: number, arcH: number, out: THREE.Vector3) {
    const g = THREE.MathUtils.lerp(a.y - 0.95, b.y - 0.95, bounce) + 0.1;
    out.lerpVectors(a, b, u);
    if (u < bounce) {
      const v = u / bounce;
      out.y = THREE.MathUtils.lerp(a.y, g, v) + 4 * arcH * v * (1 - v);
    } else {
      const v = (u - bounce) / (1 - bounce);
      // 弹起来：先快后慢往上（抛物线的后半段），正好到接球的拍子
      const top = Math.max(b.y, g + 0.3);
      out.y = g + (top - g) * (1 - (1 - v) * (1 - v)) - Math.max(0, top - b.y) * v * v;
    }
    return out;
  }

  function rally(f: FxFrame, at: PlaceId, P: readonly FxActor[]) {
    const isPickle = PICKLE.has(at);
    if (!P.some((a) => sideOf(a) > 0) || !P.some((a) => sideOf(a) < 0)) return;
    st.courts++;
    const T = isPickle ? T_PICKLE : T_TENNIS;
    const ch = hashOf(at) * 10;
    const n = Math.floor((f.rt + ch) / T);
    const k = ((f.rt + ch) % T) / T;
    // 姿势：这一拍该打的人挥拍，别的人准备
    const cur = hitOf(at, P, n, isPickle);
    for (const a of P) {
      if (cur && a.id === cur.id) {
        if (isPickle) pose(a, hashOf(`${at}${n}`) < 0.5 ? 'dink' : 'dinkB', Math.min(1, (k * T) / 0.6));
        else {
          const serve = n % 14 === 0 || n % 14 === 1;
          const stroke = serve ? 'serve' : hashOf(`${at}${n}`) < 0.55 ? 'forehand' : 'backhand';
          pose(a, stroke, Math.min(0.999, (k * T) / (serve ? P_SERVE : P_STROKE)));
        }
      } else pose(a, 'ready', f.rt / P_READY + a.hash);
    }
    // 球在第 m 拍的击球点和第 m + 1 拍的击球点之间
    let a = cur;
    if (!a) return;
    let m = n;
    if (f.rt < a.t) {
      m = n - 1;
      a = hitOf(at, P, m, isPickle);
    }
    const b = hitOf(at, P, m + 1, isPickle);
    if (!a || !b || a.id === b.id) {
      st.skipped++;
      return;
    }
    flight(a, b, f.rt, isPickle, tmp);
    if (isPickle) {
      pts.push([tmp.x, tmp.y, tmp.z]);
      st.balls++;
    } else putTennis(tmp);
  }

  // ── 喂球（青训课、私教课） ──
  function feed(f: FxFrame, at: PlaceId, coach0: FxActor, H0: readonly FxActor[]) {
    st.feeds++;
    const ch = hashOf(at) * 10;
    // 教练朝着学员、学员朝着教练（私教课两个人可能分到同一边的站位：转过身来）
    let mx = 0;
    let mz = 0;
    for (const R of H0) {
      mx += R.x / H0.length;
      mz += R.z / H0.length;
    }
    const coach = face(coach0, mx, mz);
    const H = H0.map((R) => face(R, coach.x, coach.z));
    pose(coach, 'feed', (f.rt + ch) / T_FEED);
    const cHit = localPt(coach, -0.4, 0.78, 0.62, v1);
    const ground = coach.y + 0.1;
    const n0 = Math.floor((f.rt + ch) / T_FEED);
    const swing = new Set<string>();
    for (let n = n0 - 3; n <= n0; n++) {
      const R = H[((n % H.length) + H.length) % H.length];
      const tF = n * T_FEED - ch + FEED_HIT;
      const dist = Math.hypot(R.x - coach.x, R.z - coach.z);
      const fly = THREE.MathUtils.clamp(dist / 8, 0.75, 1.35);
      const tK = tF + fly;
      const fh = hashOf(`${at}f${n}`) < 0.62;
      const tS = tK - HIT_STROKE;
      if (f.rt >= tS && f.rt < tS + P_STROKE && !swing.has(R.id)) {
        swing.add(R.id);
        pose(R, fh ? 'forehand' : 'backhand', Math.min(0.999, (f.rt - tS) / P_STROKE));
      }
      if (f.rt < tF) continue;
      const rHit = strokePt(R, fh);
      if (f.rt < tK) {
        // 喂过去：低低的一下，在学员面前一米多落地弹起来
        const u = (f.rt - tF) / fly;
        putTennis(bounced(cHit, rHit, u, 0.68, 0.45, tmp));
        continue;
      }
      // 打回去：落在教练那半场（离教练两三米，左右按球错开），弹一下就没了
      const back = 1.15;
      if (f.rt > tK + back) continue;
      const dx = coach.x - R.x;
      const dz = coach.z - R.z;
      const len = Math.hypot(dx, dz) || 1;
      const side = (hashOf(`${at}s${n}`) - 0.5) * 3.2;
      const lx = coach.x - (dx / len) * 2.6 + (-dz / len) * side;
      const lz = coach.z - (dz / len) * 2.6 + (dx / len) * side;
      v2.set(lx, ground, lz);
      const u = (f.rt - tK) / back;
      if (u < 0.72) putTennis(arc(rHit, v2, u / 0.72, 0.9, tmp));
      else {
        tmp.set(lx + (dx / len) * 1.4, ground, lz + (dz / len) * 1.4);
        putTennis(arc(v2, tmp, (u - 0.72) / 0.28, 0.22, tmp));
      }
    }
    for (const R of H) if (!swing.has(R.id)) pose(R, 'ready', f.rt / P_READY + R.hash);
  }

  // ── 对着墙打 ──
  function wall(f: FxFrame, a: FxActor) {
    st.walls++;
    const ch = hashOf(a.id) * 10;
    const n = Math.floor((f.rt + ch) / T_WALL);
    const k = (f.rt + ch) % T_WALL;
    const fhOf = (i: number) => hashOf(`${a.id}w${i}`) < 0.6;
    pose(a, fhOf(n) ? 'forehand' : 'backhand', Math.min(0.999, k / P_STROKE));
    // 第 m 下碰球 → 打到挡风布上 → 弹回来落地 → 第 m + 1 下碰球
    const tc = (i: number) => i * T_WALL - ch + HIT_STROKE;
    let m = n;
    if (f.rt < tc(m)) m--;
    const u = (f.rt - tc(m)) / T_WALL;
    const p0 = strokePt(a, fhOf(m), v1);
    const p1 = strokePt(a, fhOf(m + 1), v2);
    const fz = Math.cos(a.yaw);
    const fx = Math.sin(a.yaw);
    const dWall = Math.max(0.6, Math.abs(WALL_Z - a.z) - 0.1);
    const w = v3.set((p0.x + p1.x) / 2, a.y + 1.15, a.z + fz * dWall);
    if (Math.abs(fz) < 0.5) w.set(a.x + fx * 1.6, a.y + 1.15, a.z);
    if (u < 0.35) putTennis(arc(p0, w, u / 0.35, 0.18, tmp));
    else putTennis(bounced(w, p1, (u - 0.35) / 0.65, 0.55, 0.12, tmp));
  }

  return {
    frame(f, k) {
      ensure(k);
      const tm = tennis as THREE.InstancedMesh;
      nt = 0;
      pts.length = 0;
      st.courts = st.balls = st.skipped = st.feeds = st.walls = 0;
      viewOf.clear();
      const occAny = (at: PlaceId) => (f.s.occupants[at]?.length ?? 0) > 0;
      const near = (P: readonly FxActor[]) => {
        let cx = 0;
        let cz = 0;
        for (const a of P) {
          cx += a.x / P.length;
          cz += a.z / P.length;
        }
        return inRect(f.view, cx, cz, 8);
      };
      for (const at of RALLY_AT) {
        const occ = f.s.occupants[at];
        if (!occ || occ.length < 2) continue;
        // 私教课：场上有个在教课的教练 → 喂球
        const coachId = occ.find((id) => f.s.agents[id]?.doing === 'coach');
        if (coachId) {
          const c = f.actors.get(coachId);
          if (!c || c.moving || c.hidden || !c.body?.obj.visible) continue;
          const H = occ.map((id) => (id === coachId ? null : standing(f, id))).filter((a): a is FxActor => !!a);
          if (H.length && near([c, ...H])) feed(f, at, c, H);
          continue;
        }
        // 对打：站在场上、摆着打球姿势的人（坐在场边椅子上的不算）
        const P: FxActor[] = [];
        for (const id of occ) {
          const a = standing(f, id);
          if (!a) continue;
          const pn = a.body?.obj.userData.poseName?.() as string | undefined;
          if (pn && RALLY_POSES.has(pn)) P.push(a);
        }
        if (P.length < 2 || !near(P)) continue;
        rally(f, at, P);
      }
      for (const L of LESSONS) {
        if (!occAny(L.at)) continue;
        const cid = (f.s.occupants[L.post] ?? []).find((id) => f.s.agents[id]?.doing === 'coach');
        const c = cid ? f.actors.get(cid) : undefined;
        if (!c || c.moving || c.hidden || !c.body?.obj.visible) continue;
        if (!viewOf.size) for (const v of f.views) viewOf.set(v.id, v);
        const H: FxActor[] = [];
        for (const id of f.s.occupants[L.at] ?? []) {
          const a = standing(f, id);
          const v = viewOf.get(id);
          if (a && v && hitSpot(L.at, v.spot)) H.push(a);
        }
        if (H.length && near([c, ...H])) feed(f, L.at, c, H);
      }
      for (const at of WALLS)
        for (const id of f.s.occupants[at] ?? []) {
          const a = standing(f, id);
          if (a && inRect(f.view, a.x, a.z, 6)) wall(f, a);
        }
      tm.count = nt;
      tm.instanceMatrix.needsUpdate = true;
      tm.visible = nt > 0;
      if (pickle) {
        pickle.visible = pts.length > 0;
        if (pts.length || pickle.userData.count?.())
          pickle.userData.setBalls(
            pts,
            pts.map(() => false),
          );
      }
    },
    off() {
      if (tennis) tennis.visible = false;
      if (pickle) pickle.visible = false;
    },
    stats() {
      return { ...st };
    },
    /** 预热：球的网格先建好（给 fx 的 prewarm 摆到画面里渲染一次；画完藏起来，frame 里按需要再显示） */
    prewarm(k) {
      ensure(k);
      const t = tennis as THREE.InstancedMesh;
      t.count = 1;
      t.setMatrixAt(0, m4.identity());
      t.instanceMatrix.needsUpdate = true;
      return [t, pickle as THREE.Object3D];
    },
  };
}

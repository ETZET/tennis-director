// 对打的球（第一轮评审「要补的画面」3）：每块有人对打的场（网球 / 匹克球）一个球，在两个击球点之间飞 —— 过网的弧线、
// 在接球的人前面落地弹一下、正好在他挥拍碰到球的那一刻到他的拍子上。
// 节奏照 mount.ts 的 rallyPose（同一个公式：每 T 秒一拍，两边轮流，一边的人按顺序打；第 0、1 拍发球），
// 再按身子上的姿势核对一遍（userData.poseName 是不是击球）：对不上的场（rallyPose 改了、喂球的课）不画球，宁缺不假。
// 网球：clubsite 的 tennis-ball（⌀ 0.2，荧光黄绿，InstancedMesh 一个 draw call）；匹克球：clubsite 的 pickleball（亮黄带孔）。
// 两种球都投真影子（cast），影子跟着太阳走。
import * as THREE from 'three';
import type { NetCtx } from '../../../clubsite/assets/nets/kit';
import { build as pickleBall } from '../../../clubsite/assets/pickleball';
import { ballKit } from '../../../clubsite/assets/tennis-ball';
import type { PlaceId } from '../../../clubsite/sim/types';
import { PLACES } from '../deps';
import { type FxActor, type FxFrame, type FxKits, type FxPart, hashOf, inRect } from './util';

/** 同 mount.ts rallyPose：一拍几秒 */
const T_TENNIS = 1.3;
const T_PICKLE = 0.8;
/** 每拍开始到拍子碰到球（秒）：正反手 phase 0.485 × 1.1；发球 hit 0.6 × 1.6；dink DINK_HIT 0.55 × 0.6 */
const HIT_STROKE = 0.53;
const HIT_SERVE = 0.96;
const HIT_DINK = 0.33;
const STROKES = new Set(['forehand', 'backhand', 'serve', 'dink', 'dinkB']);
const MAX = 12;

const COURTS = new Set(PLACES.filter((p) => p.kind === 'court' || p.kind === 'pickle').map((p) => p.id));
const PICKLE = new Set(PLACES.filter((p) => p.kind === 'pickle').map((p) => p.id));

interface Hit {
  id: string;
  /** 击球点（世界） */
  p: THREE.Vector3;
  t: number;
}

export function createBalls(scene: THREE.Scene): FxPart {
  let tennis: THREE.InstancedMesh | null = null;
  let pickle: THREE.Object3D | null = null;
  const m4 = new THREE.Matrix4();
  const tmp = new THREE.Vector3();
  const pts: [number, number, number][] = [];
  const st = { courts: 0, balls: 0, skipped: 0 };

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

  const sideOf = (a: FxActor) => (Math.sin(a.yaw) >= 0 ? 1 : -1);

  /** 第 n 拍：谁打、什么球、什么时候碰到球、在哪（同 rallyPose 的排法） */
  function hitOf(f: FxFrame, at: PlaceId, occ: readonly string[], n: number, isPickle: boolean): Hit | null {
    const T = isPickle ? T_PICKLE : T_TENNIS;
    const ch = hashOf(at) * 10;
    const side = n % 2 ? 1 : -1;
    const team = occ.filter((id) => {
      const b = f.actors.get(id);
      return b && sideOf(b) === side;
    });
    if (!team.length) return null;
    const id = team[Math.floor(n / 2) % team.length];
    const a = f.actors.get(id);
    if (!a) return null;
    const serve = !isPickle && (n % 14 === 0 || n % 14 === 1);
    const fh = isPickle ? hashOf(`${at}${n}`) < 0.5 : hashOf(`${at}${n}`) < 0.55;
    const off = isPickle ? HIT_DINK : serve ? HIT_SERVE : HIT_STROKE;
    // 拍子碰球的地方（人的本地：右手在 −x，脸朝 +z）
    const lx = serve ? -0.15 : isPickle ? (fh ? -0.32 : 0.08) : fh ? -0.78 : 0.78;
    const ly = serve ? 2.4 : isPickle ? 0.55 : 0.95;
    const lz = serve ? 0.35 : isPickle ? 0.62 : 0.3;
    const c = Math.cos(a.yaw);
    const s = Math.sin(a.yaw);
    const k = a.kind === 'kid' ? 0.7 : a.kind === 'teen' ? 0.85 : 1;
    const p = new THREE.Vector3(a.x + (lx * c + lz * s) * k, a.y + ly * k, a.z + (-lx * s + lz * c) * k);
    return { id, p, t: n * T - ch + off };
  }

  /** 一段球：从 h0 击出 → 在 bounce（水平比例）处落地 → 弹到 h1；arc = 第一段弧线最高比直线高多少 */
  function flight(a: Hit, b: Hit, t: number, isPickle: boolean, out: THREE.Vector3) {
    const u = THREE.MathUtils.clamp((t - a.t) / (b.t - a.t), 0, 1);
    const bounce = isPickle ? 0.8 : 0.72;
    out.lerpVectors(a.p, b.p, u);
    if (u < bounce) {
      const v = u / bounce;
      const arc = isPickle ? 0.55 : 0.9 + 0.25 * Math.min(1, a.p.distanceTo(b.p) / 20);
      out.y = THREE.MathUtils.lerp(a.p.y, groundAt(a, b, bounce), v) + 4 * arc * v * (1 - v);
    } else {
      const v = (u - bounce) / (1 - bounce);
      const g = groundAt(a, b, bounce);
      // 弹起来：先快后慢往上（抛物线的后半段），正好到接球的拍子
      const top = Math.max(b.p.y, g + 0.3);
      out.y = g + (top - g) * (1 - (1 - v) * (1 - v)) - Math.max(0, top - b.p.y) * v * v;
    }
    return out;
  }
  /** 落地点的地面（两边的人脚下高度插值；场地是平的） */
  const groundAt = (a: Hit, b: Hit, k: number) => THREE.MathUtils.lerp(a.p.y - 0.95, b.p.y - 0.95, k) + 0.1;

  return {
    frame(f, k) {
      ensure(k);
      const tm = tennis as THREE.InstancedMesh;
      let nt = 0;
      pts.length = 0;
      st.courts = st.balls = st.skipped = 0;
      for (const at of COURTS) {
        const occ = f.s.occupants[at];
        if (!occ || occ.length < 2) continue;
        const isPickle = PICKLE.has(at);
        // 场上的人都在打（不是在等人凑、教练喂球）、站定了、有身子、在取景里
        let ok = true;
        let cx = 0;
        let cz = 0;
        for (const id of occ) {
          const a = f.actors.get(id);
          const d = f.s.agents[id]?.doing;
          if (!a || a.moving || a.hidden || !a.body?.obj.visible || (d !== 'tennis' && d !== 'pickle')) {
            ok = false;
            break;
          }
          cx += a.x / occ.length;
          cz += a.z / occ.length;
        }
        if (!ok || !inRect(f.view, cx, cz, 6)) continue;
        st.courts++;
        const T = isPickle ? T_PICKLE : T_TENNIS;
        const ch = hashOf(at) * 10;
        const n = Math.floor((f.rt + ch) / T);
        // 球在第 m 拍的击球点和第 m + 1 拍的击球点之间
        let a = hitOf(f, at, occ, n, isPickle);
        if (!a) continue;
        let m = n;
        if (f.rt < a.t) {
          m = n - 1;
          a = hitOf(f, at, occ, m, isPickle);
        }
        const b = hitOf(f, at, occ, m + 1, isPickle);
        if (!a || !b || a.id === b.id) continue;
        // 核对：这一拍（第 n 拍）该打球的人身上真的是击球的姿势（rallyPose 改了 / 对不上就不画）
        const cur = n === m ? a : b;
        const pn = f.actors.get(cur.id)?.body?.obj.userData.poseName?.() as string | undefined;
        if (!pn || !STROKES.has(pn)) {
          st.skipped++;
          continue;
        }
        flight(a, b, f.rt, isPickle, tmp);
        if (isPickle) pts.push([tmp.x, tmp.y, tmp.z]);
        else if (nt < MAX) tm.setMatrixAt(nt++, m4.makeTranslation(tmp.x, tmp.y, tmp.z));
        st.balls++;
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
  };
}

// 等烦了（第一轮评审「要补的画面」6）：
//   排队的人等的时间过了耐心的一半 → 不再干站着：抱着胳膊、脚尖点地、左右张望、抬手看表（tap）；
//   放弃的那一下（引擎的 gaveUp 事件）→ 他（和他那一伙）转身走开，走的头一秒半回头看一眼刚才排的地方。
// 耐心：引擎的 agent.patience 是"还能等几分钟"，进队时给满（plan.ts 的 patienceOf），剩一半以下就是烦了。
import * as THREE from 'three';
import { patienceOf } from '../../../clubsite/sim/plan';
import type { AgentId, PlaceId } from '../../../clubsite/sim/types';
import { CAST, PLACES } from '../deps';
import { bodyOf, type FxPart, inRect } from './util';

/** 回头看多久（真实秒）、等他起步最多等多久 */
const LOOK_S = 1.5;
const WAIT_S = 4;

const placeBy = new Map<PlaceId, { x: number; z: number }>(PLACES.map((p) => [p.id, p]));

export function createMood(): FxPart {
  /** 排队的人：哪个队（地点 + 几点开始排）、那时还能等几分钟 */
  const start = new Map<AgentId, { key: string; full: number }>();
  /** 刚放弃的：看哪、从什么时候开始回头（真实时间；还没起步 = null） */
  const gave = new Map<AgentId, { at: PlaceId; rt: number; since: number | null; obj: THREE.Object3D | null }>();
  let logN = 0;
  let day = -1;
  const look = new THREE.Vector3();
  const st = { impatient: 0, lookBack: 0, gaveUp: 0, who: [] as AgentId[] };

  return {
    frame(f) {
      const { s } = f;
      if (s.dayNo !== day || s.log.length < logN) {
        day = s.dayNo;
        logN = s.log.length;
        start.clear();
        gave.clear();
      }
      // 新的放弃：一伙人一起
      for (let i = logN; i < s.log.length; i++) {
        const e = s.log[i];
        if (e.kind !== 'gaveUp' || !e.at || e.t < f.now - 3) continue;
        st.gaveUp++;
        const a = s.agents[e.agent];
        const ids = a?.party ? (s.parties[a.party]?.members ?? [e.agent]) : [e.agent];
        for (const id of ids) gave.set(id, { at: e.at, rt: f.rt, since: null, obj: null });
      }
      logN = s.log.length;

      st.impatient = 0;
      st.who = [];
      for (const v of f.views) {
        if (v.where.kind !== 'queue') {
          start.delete(v.id);
          continue;
        }
        const ag = s.agents[v.id];
        if (!ag) continue;
        const key = `${v.where.at}@${v.where.since}`;
        let q = start.get(v.id);
        if (!q || q.key !== key) {
          // 满的耐心 = 引擎进队时给的（plan.ts 的 patienceOf）
          q = { key, full: patienceOf(s.people?.[ag.person] ?? CAST.get(ag.person)) };
          start.set(v.id, q);
        }
        if (q.full < 4 || ag.patience > q.full / 2) continue;
        const a = f.actors.get(v.id);
        const o = bodyOf(a);
        if (!a || !o || a.moving || !inRect(f.view, a.x, a.z, 3)) continue;
        st.impatient++;
        if (st.who.length < 4) st.who.push(v.id);
        o.userData.pose?.('tap', (f.rt / 3.2 + a.hash) % 1);
      }

      // 回头看一眼
      st.lookBack = 0;
      for (const [id, g] of gave) {
        const a = f.actors.get(id);
        const o = bodyOf(a);
        if (!a || !o) {
          if (f.rt - g.rt > WAIT_S) gave.delete(id);
          continue;
        }
        if (g.since === null) {
          if (a.moving) g.since = f.rt;
          else if (f.rt - g.rt > WAIT_S) {
            gave.delete(id);
            continue;
          } else continue;
        }
        const t = f.rt - (g.since ?? f.rt);
        if (t > LOOK_S || !a.moving) {
          o.userData.lookAt?.(null);
          gave.delete(id);
          continue;
        }
        const p = placeBy.get(g.at);
        if (!p) continue;
        st.lookBack++;
        g.obj = o;
        // 头先转过去、停一下、再转回来
        look.set(p.x, a.y + 1.4, p.z);
        o.userData.lookAt?.(t < LOOK_S * 0.85 ? look : null);
      }
    },
    off() {
      for (const g of gave.values()) g.obj?.userData.lookAt?.(null);
      gave.clear();
      start.clear();
    },
    stats: () => ({ ...st, who: [...st.who] }),
  };
}

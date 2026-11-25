// 等烦了（第一轮评审「要补的画面」6、第二轮问题 5.1 / 要补的画面 5）：
//   在等的人等过了耐心的一半（或者干等了 10 分钟以上）→ 不再干站 / 干坐着：
//     站着的（排队、拍架边排着等下一局）→ 抱着胳膊、脚尖点地、左右张望、抬手看表（tap）；
//     坐着的（场边长椅上等人凑场、等空场）→ 往前探着身子抱胳膊、腿一下一下抖、东张西望、看表（tapSit）。
//   放弃的那一下（引擎的 gaveUp，或者"先去喝点东西、过会儿再来"的那一下）→ 他（和他那一伙）转身走开，
//   走的头一秒半回头看一眼刚才等的地方。
// 耐心：引擎的 agent.patience 是"还能等几分钟"，只扣带头的那个（一伙人跟着他烦）；进队时给满（plan.ts 的 patienceOf），
// 拍架边排队多给一刻钟（知道是轮换）—— 满的耐心按"这一回开始等时看到的最大值"算。
import * as THREE from 'three';
import { patienceOf } from '../../../clubsite/sim/plan';
import type { Agent, AgentId, Intent, PlaceId, SimState } from '../../../clubsite/sim/types';
import { CAST, PLACES } from '../deps';
import { bodyOf, type FxPart, inRect } from './util';

/** 回头看多久（真实秒）、等他起步最多等多久 */
const LOOK_S = 1.5;
const WAIT_S = 4;
/** 干等多少游戏分钟算烦（耐心还没用到一半的长耐心的人也会烦） */
const BORED_MIN = 10;
/** 坐着的姿势（mount 摆成这些的就是坐着等） */
const SEATED = new Set(['sit', 'clap', 'sip', 'tapSit']);

const placeBy = new Map<PlaceId, { x: number; z: number }>(PLACES.map((p) => [p.id, p]));
const isCourtPlay = (i: Intent | undefined) => !!i && (i.doing === 'tennis' || i.doing === 'pickle');
/** 坐在场边等凑人 / 等场（同 engine.ts 的 isSeeking）：日程第一项是看 / 排队（有指定位置），第二项是还没定场的打球 */
const isSeeking = (plan: readonly Intent[]) =>
  plan.length >= 2 &&
  (plan[0].doing === 'watch' || plan[0].doing === 'queue') &&
  !!plan[0].at &&
  isCourtPlay(plan[1]) &&
  !plan[1].at;
/** "先去喝点东西，过会儿再来"（引擎记成 end，不是 gaveUp）：也是放弃的那一下 */
const RETRY = /没轮上|没凑|没等到/;

/** 一伙人的带头的（耐心只扣他的） */
const leadOf = (s: SimState, a: Agent): Agent => (a.party ? (s.agents[s.parties[a.party]?.lead ?? ''] ?? a) : a);

export function createMood(): FxPart {
  /** 在等的人：等的哪一回（地点 + 几点开始）、满的耐心 */
  const start = new Map<AgentId, { key: string; full: number }>();
  /** 刚放弃的：看哪、从什么时候开始回头（真实时间；还没起步 = null） */
  const gave = new Map<AgentId, { at: PlaceId; rt: number; since: number | null; obj: THREE.Object3D | null }>();
  let logN = 0;
  let day = -1;
  const look = new THREE.Vector3();
  const st = { impatient: 0, seated: 0, waiting: 0, lookBack: 0, gaveUp: 0, who: [] as AgentId[] };

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
        const give = e.kind === 'gaveUp' || (e.kind === 'end' && !!e.note && RETRY.test(e.note));
        if (!give || !e.at || e.t < f.now - 3) continue;
        st.gaveUp++;
        const a = s.agents[e.agent];
        const ids = a?.party ? (s.parties[a.party]?.members ?? [e.agent]) : [e.agent];
        for (const id of ids) gave.set(id, { at: e.at, rt: f.rt, since: null, obj: null });
      }
      logN = s.log.length;

      st.impatient = st.seated = st.waiting = 0;
      st.who = [];
      for (const v of f.views) {
        const w = v.where;
        if (w.kind !== 'queue' && w.kind !== 'at') {
          start.delete(v.id);
          continue;
        }
        const ag = s.agents[v.id];
        if (!ag) continue;
        const L = leadOf(s, ag);
        // 在等：排队，或者坐在场边等凑人 / 等场
        const seeking = isSeeking(L.plan) && L.plan[0].at === w.at;
        if (w.kind === 'at' && !seeking) {
          start.delete(v.id);
          continue;
        }
        st.waiting++;
        const key = `${w.at}@${w.since}`;
        let q = start.get(v.id);
        if (!q || q.key !== key) {
          q = { key, full: patienceOf(s.people?.[L.person] ?? CAST.get(L.person)) };
          start.set(v.id, q);
        }
        q.full = Math.max(q.full, L.patience);
        const waited = f.now - w.since;
        const bored = (q.full >= 4 && L.patience <= q.full / 2) || waited >= BORED_MIN;
        if (!bored) continue;
        const a = f.actors.get(v.id);
        const o = bodyOf(a);
        if (!a || !o || a.moving || !inRect(f.view, a.x, a.z, 3)) continue;
        const sat = SEATED.has(o.userData.poseName?.() as string);
        st.impatient++;
        if (sat) st.seated++;
        if (st.who.length < 4) st.who.push(v.id);
        o.userData.pose?.(sat ? 'tapSit' : 'tap', (f.rt / 3.2 + a.hash) % 1);
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

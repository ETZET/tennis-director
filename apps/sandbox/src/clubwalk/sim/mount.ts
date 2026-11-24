// 俱乐部的一天：观察模式（docs/design/club-sim.md 第五节）。引擎（clubsite/sim）算每个人在哪、干什么；这里让人这么走、这么站、这么挥拍。
// - 打开（?sim=1，或 valley 调试面板"观察俱乐部的一天"）：场景演出里的人都藏起来（道具、车照旧），换成引擎的人；
//   时钟交给引擎（天光跟着引擎的分钟走：中午最亮、傍晚开灯）；底部出观察面板（hud.ts）。
// - 引擎在固定步长里推（step：加速档位 × dt 攒够一分钟推一步）；画面每帧在两步之间插值（frame）。
// - 离镜头近的人才有身子（actors.ts 的池子）；路上的人沿导航走（motion.ts），到了按 doing 摆姿势（pose.ts）。
// - 跟着一个人：镜头跟着他、头顶名字小牌、面板里他今天的日程；看全图：镜头拉远，区域细节收起来（底图顶着），每个人一根彩色小柱。
// 调试钩子 window.__clubsim：{ on, enable(on), jump(min), speed(x), view(), follow(id), overview(on), stats(), state() }。
import * as THREE from 'three';
import type { CastPerson } from '../../clubsite/cast/types';
import { SCENE_NAME } from '../../clubsite/cast/types';
import type { Daylight } from '../../clubsite/daylight';
import { setStride } from '../../clubsite/people';
import type { Play } from '../../clubsite/play';
import type {
  AgentId,
  AgentView,
  Intent,
  Minute,
  Place,
  PlaceId,
  SimConfig,
  SimEvent,
  SimState,
} from '../../clubsite/sim/types';
import type { Rect } from '../../clubsite/world';
import { SITE } from '../../clubsite/world';
import { type Body, BodyPool, bodyKindOf, CAP, type Dresser, Pawns } from './actors';
import { hhmm, periodOf, SimClock, SPEEDS } from './clock';
import { CAST, PLACES, POSTS, personOf, SPOTS, sim } from './deps';
import { gapLines, gapReport, noteGap } from './gaps';
import { type AgendaRow, createSimHud, type HudData } from './hud';
import { type Anchor, along, makeRoute, type P2, Planner, queueOf, type Route, spotOf } from './motion';
import { type BodyKind, DOING_NAME, PERIOD, type PoseSpec, poseSpec } from './pose';
import type { PlaceSpots } from './types';

export interface SimHost {
  scene: THREE.Scene;
  pipe: { rig: { target: THREE.Vector3; metersPerTexel: number; pitch: number }; px: number; lowSize: THREE.Vector2 };
  play: Play;
  director: THREE.Object3D;
  day: Daylight;
  params: URLSearchParams;
  viewRect(margin: number): Rect;
  /** 建一具 Q 版人（大人 / 孩子 / 少年），材质用总监那套 */
  make(kind: BodyKind): THREE.Object3D;
  dresser: Dresser | null;
  /** 远景小柱的材质（衣服色 → CLOTH 三档 + 人物参数） */
  pawnMat(cloth: string): THREE.Material;
  /** 场景演出里的人藏起来（true）/ 放回来 */
  suppressScene(on: boolean): void;
  /** 打开演员表的人物卡片 */
  openCard?(id: string): void;
}

export interface SimMount {
  readonly on: boolean;
  enable(on: boolean, o?: { at?: Minute; speed?: number; panel?: boolean }): void;
  /** 固定步长（play.update 之后）：推引擎、管镜头 */
  step(dt: number): void;
  /** 每帧渲染前：摆人、名字小牌、面板 */
  frame(dt: number): void;
  /** 镜头在看哪（跟着人 / 看全图）；null = 跟着总监 */
  focus(): { x: number; z: number } | null;
  /** 看全图：区域细节收起来 */
  overview(): boolean;
  /** 世界导航重建了：缓存的路作废 */
  navChanged(): void;
  openPanel(): void;
  /** 小地图上每个在场的人一个点（sx / sz：世界坐标 → 小地图像素） */
  drawMap(g: CanvasRenderingContext2D, sx: (x: number) => number, sz: (z: number) => number): void;
}

/** 取景外扩多少米以内的人给身子 */
const MARGIN = 5;
/** 到了以后走到站位的速度（米/真实秒） */
const SETTLE_V = 2.6;
/** 腿最多一秒摆几遍（加速时人一帧挪好几米，腿不跟着乱抖） */
const MAX_CYCLES = 2.4;
/** 顶上的按钮（像素、时间、小地图）占多高（CSS 像素）：跟着的人放在它和底部面板之间的正中 */
const TOP_UI = 120;
/** 一伙人走路时左右让开多少米 */
const SIDE = 0.38;

interface Leg {
  key: string;
  t0: number;
  t1: number;
  /** 路的拐点（起点、各地点的门、终点）：每两点之间一段，各自规划 */
  way: P2[];
  route: Route | null;
  /** 终点在室内（到了门口就藏起来） */
  hideEnd: boolean;
  /** 起点在室内（从门口冒出来） */
  hideStart: boolean;
}

interface Actor {
  id: AgentId;
  person: CastPerson | undefined;
  kind: BodyKind;
  body: Body | null;
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** 这一帧看不见（在室内、在路上但路还没规划好） */
  hidden: boolean;
  leg: Leg | null;
  settle: { route: Route; s: number; key: string } | null;
  /** 现在站的站位（变了 = 要走过去） */
  anchorKey: string;
  walkPh: number;
  /** 0..1：每个人的节奏错开 */
  hash: number;
  spec: PoseSpec | null;
  specKey: string;
  pace: { ax: number; az: number; bx: number; bz: number; len: number; s: number } | null;
  /** 这一帧在动（走路姿势） */
  moving: boolean;
  /** 站位给的高度（看台、高座、水里）；不给 = 导航的地面 */
  fixY: number | undefined;
  /** 地面高度是按哪个站位算的（站着不动不用每帧问导航） */
  yKey: string;
}

const hashOf = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10007) / 10007;
};

export function mountSim(host: SimHost): SimMount {
  const { play, params, day } = host;
  const num = (k: string, d: number) => (params.has(k) && params.get(k) !== '' ? Number(params.get(k)) : d);
  const cfg: SimConfig = { seed: num('simseed', 1), places: PLACES, cast: CAST, posts: POSTS };
  const placeBy = new Map<PlaceId, Place>(PLACES.map((p) => [p.id, p]));
  const spotsOf = (id: PlaceId): PlaceSpots | undefined => {
    const ps = SPOTS[id];
    if (!ps) noteGap(`nospot:${id}`, `站位表里没有「${placeBy.get(id)?.name ?? id}」（${id}）：站在地点的估算坐标上`);
    return ps;
  };
  let dayNo = num('simday', 3);
  const clock = new SimClock();
  clock.speed = num('simspeed', 30);

  let on = false;
  let s: SimState | null = null;
  let views: AgentView[] = [];
  const viewBy = new Map<AgentId, AgentView>();
  const actors = new Map<AgentId, Actor>();
  const planner = new Planner(() => play.nav);
  const pool = new BodyPool(host.scene, host.make, host.dresser);
  const pawns = new Pawns(host.scene, host.pawnMat);
  let followId: AgentId | null = null;
  let overview = false;
  let mptSaved = 0;
  let savedSpeed = 0;
  let savedWeather: Daylight['weather'] = 'auto';
  let dayBase = 0;
  /** 真实时间（秒）：挥拍、呼吸的节奏按它走，不跟着加速乱抖 */
  let rt = 0;
  const feed: { t: number; text: string }[] = [];
  const cam = { x: 0, z: 0, has: false };
  const perf = { engine: 0, actors: 0, frames: 0, engineMax: 0, actorsMax: 0, steps: 0, win: [] as number[] };

  const nameOf = (id: AgentId) => {
    const a = s?.agents[id];
    const p = a ? personOf(cfg, a.person, s) : undefined;
    return p?.name ?? a?.person ?? id;
  };
  const placeName = (id?: PlaceId) => (id ? (placeBy.get(id)?.name ?? id) : '');

  // ── 引擎 ──
  function fresh() {
    s = sim.startDay(cfg, dayNo);
    feed.length = 0;
    clearActors();
    refreshViews();
  }
  function directorAt(): PlaceId | null {
    const d = host.director.position;
    for (const p of PLACES) {
      if (!p.director) continue;
      const a = spotOf(p, SPOTS[p.id], 0);
      if (Math.hypot(a.x - d.x, a.z - d.z) < 4 || Math.hypot(p.x - d.x, p.z - d.z) < 3) return p.id;
    }
    return null;
  }
  function advance(n: number, quiet = false) {
    if (!s || n <= 0) return;
    const input = { director: directorAt() };
    for (let i = 0; i < n; i++) {
      const r = sim.step(cfg, s, input);
      s = r.state;
      if (!quiet) onEvents(r.events);
    }
    refreshViews();
  }
  function refreshViews() {
    views = s ? sim.view(s) : [];
    viewBy.clear();
    for (const v of views) viewBy.set(v.id, v);
  }
  function jump(m: Minute) {
    if (!s) fresh();
    if (!s) return;
    const t0 = performance.now();
    if (m < s.minute) {
      s = sim.startDay(cfg, dayNo);
      feed.length = 0;
    }
    const input = { director: directorAt() };
    while (s.minute < m) s = sim.step(cfg, s, input).state;
    clock.frac = 0;
    clearActors();
    refreshViews();
    pushFeed(m, `跳到 ${hhmm(m)}（快进 ${(performance.now() - t0).toFixed(0)} 毫秒）`);
  }

  // ── 事件 → 面板的"刚刚" ──
  function pushFeed(t: number, text: string) {
    feed.push({ t, text });
    if (feed.length > 40) feed.splice(0, feed.length - 40);
  }
  const FEED_START = new Set(['tennis', 'pickle', 'lesson', 'eat', 'swim', 'coach']);
  function onEvents(ev: readonly SimEvent[]) {
    if (!s) return;
    const arrivedParty = new Map<string, AgentId[]>();
    for (const e of ev) {
      const a = s.agents[e.agent];
      const pid = a?.party;
      const lead = pid ? s.parties[pid]?.lead : undefined;
      if (e.kind === 'arrive') {
        const k = pid ?? e.agent;
        arrivedParty.set(k, [...(arrivedParty.get(k) ?? []), e.agent]);
      } else if (e.kind === 'leave') {
        if (!pid || lead === e.agent) pushFeed(e.t, `${nameOf(e.agent)}${pid ? ' 一伙' : ''}回家了`);
      } else if (e.kind === 'gaveUp') {
        pushFeed(e.t, `${nameOf(e.agent)} 等不下去了${e.note ? `：${e.note}` : `（${placeName(e.at)}）`}`);
      } else if (e.kind === 'full') {
        if (!pid || lead === e.agent) pushFeed(e.t, `${placeName(e.at)} 满了，${nameOf(e.agent)} 换地方`);
      } else if (e.kind === 'shift') {
        pushFeed(e.t, `${nameOf(e.agent)} ${e.note ?? '换班'}`);
      } else if (e.kind === 'start' && e.doing && FEED_START.has(e.doing) && (!pid || lead === e.agent)) {
        pushFeed(e.t, `${nameOf(e.agent)}${pid ? ' 一伙' : ''} ${DOING_NAME[e.doing]}（${placeName(e.at)}）`);
      } else if (e.note && e.kind !== 'start' && e.kind !== 'end' && e.kind !== 'served') {
        pushFeed(e.t, `${nameOf(e.agent)}：${e.note}`);
      }
    }
    for (const [k, ids] of arrivedParty) {
      const a = s.agents[ids[0]];
      const n = a?.party ? (s.parties[k]?.members.length ?? ids.length) : 1;
      pushFeed(
        ev[0]?.t ?? s.minute,
        n > 1
          ? `${nameOf(ids[0])} 一伙 ${n} 人到了（${placeName(a?.entry)}）`
          : `${nameOf(ids[0])} 到了（${placeName(a?.entry)}）`,
      );
    }
  }

  // ── 演员 ──
  function clearActors() {
    pool.releaseAll();
    actors.clear();
    planner.drop();
  }
  function actorOf(v: AgentView): Actor {
    let a = actors.get(v.id);
    if (!a) {
      const p = personOf(cfg, v.person, s);
      a = {
        id: v.id,
        person: p,
        kind: bodyKindOf(p),
        body: null,
        x: 0,
        y: 0,
        z: 0,
        yaw: 0,
        hidden: false,
        leg: null,
        settle: null,
        anchorKey: '',
        walkPh: 0,
        hash: hashOf(v.id),
        spec: null,
        specKey: '',
        pace: null,
        moving: false,
        fixY: undefined,
        yKey: '',
      };
      // 第一次出现：站在他现在该在的地方
      const t = anchorFor(v, a);
      if (t) {
        a.x = t.x;
        a.z = t.z;
        a.yaw = t.yaw;
      }
      actors.set(v.id, a);
    }
    return a;
  }

  /** 在某处（at / queue）：站哪 */
  function anchorFor(v: AgentView, a: Actor): (Anchor & { key: string; hidden: boolean }) | null {
    const w = v.where;
    if (w.kind === 'at' || w.kind === 'queue') {
      const place = placeBy.get(w.at);
      const ps = spotsOf(w.at);
      if (w.kind === 'at' && ps?.hidden) {
        const d = ps.door ?? { x: place?.x ?? 0, z: place?.z ?? 0 };
        return { x: d.x, z: d.z, yaw: a.yaw, key: `in:${w.at}`, hidden: true };
      }
      const an = w.kind === 'at' ? spotOf(place, ps, v.spot) : queueOf(place, ps, v.spot);
      return { ...an, key: `${w.kind}:${w.at}:${v.spot}`, hidden: false };
    }
    if (w.kind === 'travel') {
      const ps = spotsOf(w.from);
      if (ps?.hidden && ps.door) return { x: ps.door.x, z: ps.door.z, yaw: a.yaw, key: 'travel', hidden: true };
      const place = placeBy.get(w.from);
      return { ...spotOf(place, ps, v.spot), key: 'travel', hidden: false };
    }
    return null;
  }

  /** 新的一段路：起点（他现在在哪）→ 出发地的门 → 目的地的门 → 目的地的站位 */
  function newLeg(v: AgentView, a: Actor, w: Extract<AgentView['where'], { kind: 'travel' }>, key: string): Leg {
    const fromPs = spotsOf(w.from);
    const toPs = spotsOf(w.to);
    const toPlace = placeBy.get(w.to);
    const way: P2[] = [];
    if (fromPs?.hidden && fromPs.door) way.push([fromPs.door.x, fromPs.door.z]);
    else {
      way.push([a.x, a.z]);
      if (fromPs?.door) way.push([fromPs.door.x, fromPs.door.z]);
    }
    if (toPs?.door) way.push([toPs.door.x, toPs.door.z]);
    if (!toPs?.hidden) {
      const an = spotOf(toPlace, toPs, v.spot);
      way.push([an.x, an.z]);
    }
    // 去掉挨得太近的点
    const clean: P2[] = [way[0]];
    for (const p of way.slice(1)) {
      const q = clean[clean.length - 1];
      if (Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.3) clean.push(p);
    }
    return {
      key,
      t0: w.t0,
      t1: w.t1,
      way: clean,
      route: clean.length === 1 ? makeRoute(clean) : null,
      hideEnd: !!toPs?.hidden,
      hideStart: !!fromPs?.hidden,
    };
  }
  /** 路的每一段都规划好了才拼起来；pri 越小越先规划 */
  function buildRoute(leg: Leg, pri: number): Route | null {
    if (leg.route) return leg.route;
    const pts: P2[] = [leg.way[0]];
    let ok = true;
    for (let i = 1; i < leg.way.length; i++) {
      const [ax, az] = leg.way[i - 1];
      const [bx, bz] = leg.way[i];
      const seg = planner.get(ax, az, bx, bz, pri);
      if (!seg) {
        ok = false;
        continue;
      }
      for (const p of seg) pts.push(p);
    }
    if (!ok) return null;
    leg.route = makeRoute(pts);
    return leg.route;
  }

  const tmp = { x: 0, z: 0, dx: 0, dz: 1 };
  const nowMin = () => (s ? s.minute + clock.frac : 0);

  /** 这一帧每个在场的人在哪（有没有身子都算：决定谁要身子） */
  function place(now: number, cx: number, cz: number) {
    for (const v of views) {
      const a = actorOf(v);
      const w = v.where;
      a.moving = false;
      if (w.kind === 'travel') {
        a.settle = null;
        a.pace = null;
        a.fixY = undefined;
        const key = `${w.from}>${w.to}@${w.t0}`;
        if (a.leg?.key !== key) a.leg = newLeg(v, a, w, key);
        const leg = a.leg;
        const f = leg.t1 > leg.t0 ? Math.min(1, Math.max(0, (now - leg.t0) / (leg.t1 - leg.t0))) : 1;
        const near = Math.abs(a.x - cx) + Math.abs(a.z - cz);
        const route = a.body || near < 45 ? buildRoute(leg, near) : null;
        if (route) {
          along(route, f * route.len, tmp);
          let x = tmp.x;
          let z = tmp.z;
          // 一伙人并排走：按在一伙里的位置左右让开（站不住就不让）
          const off = sideOf(v);
          if (off && f > 0.02 && f < 0.98) {
            const ox = x - tmp.dz * off;
            const oz = z + tmp.dx * off;
            if (play.nav.height(ox, oz) !== null) {
              x = ox;
              z = oz;
            }
          }
          if (Math.hypot(x - a.x, z - a.z) > 1e-4) {
            a.moving = true;
            a.yaw = turn(a.yaw, Math.atan2(tmp.dx, tmp.dz), 0.5);
          }
          a.x = x;
          a.z = z;
          a.hidden = (leg.hideStart && f <= 0) || (leg.hideEnd && f >= 1);
        } else {
          // 路还没规划好：没身子的按直线估（只用来决定要不要身子），有身子的原地等一下（不穿墙）
          if (!a.body) {
            const [ax, az] = leg.way[0];
            const [bx, bz] = leg.way[leg.way.length - 1];
            a.x = ax + (bx - ax) * f;
            a.z = az + (bz - az) * f;
          }
          a.hidden = !a.body;
        }
        a.anchorKey = '';
        continue;
      }
      a.leg = null;
      const an = anchorFor(v, a);
      if (!an) continue;
      a.hidden = an.hidden;
      if (an.hidden) {
        a.x = an.x;
        a.z = an.z;
        a.settle = null;
        continue;
      }
      if (an.key !== a.anchorKey) {
        a.anchorKey = an.key;
        a.pace = null;
        // 离站位还有一段：真实时间走过去（排队往前挪、到了以后找自己的位置）
        const d = Math.hypot(an.x - a.x, an.z - a.z);
        if (a.body && d > 0.15 && d < 40) a.settle = { route: makeRoute([[a.x, a.z]]), s: 0, key: '' };
        else {
          a.settle = null;
          a.x = an.x;
          a.z = an.z;
        }
        a.fixY = an.y;
      }
      if (a.settle) {
        const st = a.settle;
        const k = `${an.x},${an.z}`;
        if (st.key !== k) {
          const seg = planner.get(a.x, a.z, an.x, an.z, Math.abs(a.x - cx) + Math.abs(a.z - cz));
          if (seg) {
            st.route = makeRoute([[a.x, a.z], ...seg]);
            st.s = 0;
            st.key = k;
          }
        }
        if (st.key === k) {
          const v0 = Math.max(SETTLE_V, st.route.len / 1.6);
          st.s += v0 * frameDt;
          along(st.route, st.s, tmp);
          a.x = tmp.x;
          a.z = tmp.z;
          a.moving = true;
          a.yaw = turn(a.yaw, Math.atan2(tmp.dx, tmp.dz), 0.5);
          if (st.s >= st.route.len) a.settle = null;
        }
      }
      if (!a.settle) {
        a.x = a.pace ? a.x : an.x;
        a.z = a.pace ? a.z : an.z;
        a.yaw = turn(a.yaw, an.yaw, 0.25);
      }
    }
  }
  let frameDt = 1 / 60;
  /** 导航这一帧刚重建 */
  let navFresh = false;
  /** 观察面板的上沿（CSS 像素；syncHud 里量） */
  let panelTop = innerHeight;

  /** 一伙人里第几个：左右让开的距离（2 人 ±，3–4 人再往外） */
  function sideOf(v: AgentView): number {
    if (!v.party || !s) return 0;
    const ms = s.parties[v.party]?.members;
    if (!ms || ms.length < 2) return 0;
    const i = ms.indexOf(v.id);
    const n = ms.length;
    return (i - (n - 1) / 2) * SIDE * 2 * (n > 2 ? 0.75 : 1);
  }

  function turn(a: number, b: number, k: number) {
    let d = b - a;
    d -= Math.round(d / (Math.PI * 2)) * Math.PI * 2;
    return a + d * k;
  }

  // ── 谁有身子 ──
  const wantList: { a: Actor; d: number }[] = [];
  /** vr = 给身子的范围；keep = 已经有身子的人出了这个范围才收回（外扩一圈：在边上来回走的人不反复换装） */
  function assignBodies(vr: Rect, keep: Rect, cx: number, cz: number) {
    wantList.length = 0;
    const live = new Set<AgentId>();
    for (const v of views) {
      const a = actors.get(v.id);
      if (!a) continue;
      live.add(v.id);
      const r = a.body ? keep : vr;
      const inView = !a.hidden && a.x > r.x0 && a.x < r.x1 && a.z > r.z0 && a.z < r.z1;
      if (inView && !overview) wantList.push({ a, d: Math.hypot(a.x - cx, a.z - cz) });
      else if (a.body) {
        pool.release(a.body);
        a.body = null;
      }
    }
    // 走了的人（不在场了）
    for (const [id, a] of actors) {
      if (live.has(id)) continue;
      if (a.body) pool.release(a.body);
      actors.delete(id);
    }
    wantList.sort((p, q) => p.d - q.d);
    for (let i = 0; i < wantList.length; i++) {
      const a = wantList[i].a;
      if (i >= CAP) {
        if (a.body) {
          pool.release(a.body);
          a.body = null;
        }
        continue;
      }
      if (!a.body) {
        a.body = pool.acquire(a.id, a.person, a.kind);
        if (a.body) {
          a.spec = null;
          a.specKey = '';
          a.body.prop = undefined;
          a.body.seat = '';
        }
      }
    }
  }

  // ── 姿势 ──
  /** 场上的人按站位朝向分两边；每一拍一边的一个人击球 */
  function rallyPose(a: Actor, v: AgentView, at: PlaceId, pickle: boolean): { pose: string; phase: number } {
    const occ = s?.occupants[at] ?? [];
    const ch = hashOf(at) * 10;
    const T = pickle ? 0.8 : 1.3;
    const n = Math.floor((rt + ch) / T);
    const k = ((rt + ch) % T) / T;
    const mySide = Math.sin(a.yaw) >= 0 ? 1 : -1;
    const hitSide = n % 2 ? 1 : -1;
    if (mySide === hitSide && occ.length > 1) {
      const team = occ.filter((id) => {
        const b = actors.get(id);
        return b && (Math.sin(b.yaw) >= 0 ? 1 : -1) === mySide;
      });
      const hitter = team[Math.floor(n / 2) % Math.max(1, team.length)];
      if (hitter === v.id) {
        if (pickle) return { pose: hashOf(`${at}${n}`) < 0.5 ? 'dink' : 'dinkB', phase: Math.min(1, (k * T) / 0.6) };
        const serve = n % 14 === 0 || n % 14 === 1;
        const stroke = serve ? 'serve' : hashOf(`${at}${n}`) < 0.55 ? 'forehand' : 'backhand';
        return { pose: stroke, phase: Math.min(0.999, (k * T) / PERIOD[stroke]) };
      }
    }
    return { pose: pickle ? 'ready' : 'ready', phase: (rt / PERIOD.ready + a.hash) % 1 };
  }

  function poseActor(a: Actor, v: AgentView) {
    const b = a.body;
    if (!b) return;
    const ud = b.obj.userData;
    if (a.moving) {
      const keep = b.prop === 'racket' || b.prop === 'paddle' ? b.prop : null;
      setProp(b, keep);
      const stride = setStride(b.obj);
      const dist = Math.hypot(a.x - b.obj.position.x, a.z - b.obj.position.z);
      a.walkPh = (a.walkPh + Math.min(dist / stride, MAX_CYCLES * frameDt)) % 1;
      ud.pose?.('walk', a.walkPh);
      if (a.specKey) {
        ud.lookAt?.(null);
        a.specKey = '';
        a.spec = null;
      }
      return;
    }
    const w = v.where;
    const at = w.kind === 'at' || w.kind === 'queue' ? w.at : undefined;
    const placeObj = at ? placeBy.get(at) : undefined;
    const key = `${v.doing}|${at}|${v.spot}|${w.kind}`;
    if (key !== a.specKey) {
      a.specKey = key;
      const an = at
        ? w.kind === 'queue'
          ? queueOf(placeObj, SPOTS[at], v.spot)
          : spotOf(placeObj, SPOTS[at], v.spot)
        : undefined;
      const spec =
        w.kind === 'queue' ? poseSpec('queue', placeObj, undefined, a.kind) : poseSpec(v.doing, placeObj, an, a.kind);
      a.spec = spec;
      if (spec.gap) noteGap(spec.gap);
      setProp(b, spec.prop);
      const seatKey = spec.seat === undefined ? '' : `${spec.seat}:${spec.foot ?? 0}`;
      if (seatKey && seatKey !== b.seat) {
        b.seat = seatKey;
        ud.setSeat?.(spec.seat ?? null, spec.foot ?? 0);
      }
      // 聊天：看着一起的人
      ud.lookAt?.(null);
      if (spec.lookWith && v.with.length) {
        const o = actors.get(v.with[0]);
        if (o) ud.lookAt?.(new THREE.Vector3(o.x, a.y + 1.5, o.z));
      }
      // 边走边干（拖红土）：沿朝向来回 3 米（两头站得住才走）
      a.pace = null;
      if (spec.anim === 'pace') {
        const dx = Math.sin(a.yaw);
        const dz = Math.cos(a.yaw);
        const ax = a.x - dx * 3;
        const az = a.z - dz * 3;
        const bx = a.x + dx * 3;
        const bz = a.z + dz * 3;
        if (play.nav.lineClear(ax, az, bx, bz)) a.pace = { ax, az, bx, bz, len: 6, s: 3 };
      }
    }
    const spec = a.spec as PoseSpec;
    let pose = spec.pose;
    let phase = (rt / (PERIOD[pose] ?? 2) + a.hash) % 1;
    if (spec.anim === 'rally' && at) {
      const r = rallyPose(a, v, at, false);
      pose = r.pose;
      phase = r.phase;
    } else if (spec.anim === 'pickle' && at) {
      const r = rallyPose(a, v, at, true);
      pose = r.pose;
      phase = r.phase;
    } else if (spec.anim === 'watch') {
      // 看球：隔一会儿鼓几下掌
      const c = (rt + a.hash * 9) % 9;
      if (c < 1.5) {
        pose = 'clap';
        phase = (c / 0.5) % 1;
      }
    } else if (spec.anim === 'pace' && a.pace) {
      const p = a.pace;
      p.s += 0.8 * frameDt;
      const u = p.s % (p.len * 2);
      const fwd = u < p.len;
      const t = (fwd ? u : p.len * 2 - u) / p.len;
      a.x = p.ax + (p.bx - p.ax) * t;
      a.z = p.az + (p.bz - p.az) * t;
      a.yaw = Math.atan2((p.bx - p.ax) * (fwd ? 1 : -1), (p.bz - p.az) * (fwd ? 1 : -1));
      phase = (p.s / 0.55) % 1;
    }
    ud.pose?.(pose, phase);
  }
  function setProp(b: Body, p: string | null) {
    if (b.prop === p) return;
    b.prop = p;
    b.obj.userData.setProp?.(p);
  }

  // ── 镜头 ──
  function setOverview(v: boolean) {
    if (v === overview) return;
    overview = v;
    const rig = host.pipe.rig;
    if (v) {
      mptSaved = rig.metersPerTexel;
      const low = host.pipe.lowSize;
      const w = SITE.x1 - SITE.x0;
      const d = (SITE.z1 - SITE.z0) * Math.sin(rig.pitch);
      rig.metersPerTexel = Math.max(w / low.x, d / low.y) * 1.04;
      followId = null;
    } else if (mptSaved) {
      rig.metersPerTexel = mptSaved;
      play.zoomBy(1);
    }
    pawns.visible = v;
  }
  function moveCamera(dt: number) {
    const t = host.pipe.rig.target;
    if (overview) {
      // 顶上的按钮和底部的面板差不多一样高：俱乐部放在画面正中
      t.set((SITE.x0 + SITE.x1) / 2, 0, (SITE.z0 + SITE.z1) / 2);
      return;
    }
    const a = followId ? actors.get(followId) : undefined;
    if (!followId || !a) {
      cam.has = false;
      return;
    }
    const gx = a.x;
    // 人放在"顶上的按钮和面板之间"的正中：面板展开时往上挪
    const H = innerHeight;
    const midPx = (TOP_UI + Math.min(H, panelTop)) / 2;
    const rig = host.pipe.rig;
    const lead = ((H / 2 - midPx) * (rig.metersPerTexel / host.pipe.px)) / Math.sin(rig.pitch);
    const gz = a.z + lead;
    if (!cam.has) {
      cam.x = t.x;
      cam.z = t.z;
      cam.has = true;
    }
    const k = 1 - Math.exp(-dt * 5);
    const far = Math.hypot(gx - cam.x, gz - cam.z) > 60;
    cam.x = far ? gx : cam.x + (gx - cam.x) * k;
    cam.z = far ? gz : cam.z + (gz - cam.z) * k;
    t.x = cam.x;
    t.z = cam.z;
    t.y += (a.y - t.y) * (1 - Math.exp(-dt * 3));
  }

  // ── 面板 ──
  const hud = createSimHud({
    setSpeed(x) {
      clock.speed = x;
      clock.paused = false;
      syncHud(true);
    },
    togglePause() {
      clock.paused = !clock.paused;
      syncHud(true);
    },
    jump(m) {
      jump(m);
      syncHud(true);
    },
    follow(id) {
      follow(id);
    },
    followRandom() {
      const cands = views.filter((v) => v.where.kind !== 'away' && !isHiddenNow(v));
      if (!cands.length) return;
      const pick = cands[Math.floor((rt * 7919) % cands.length)];
      follow(pick.id);
    },
    openCard() {
      const a = followId ? s?.agents[followId] : undefined;
      if (a && host.openCard && CAST.get(a.person)) host.openCard(a.person);
    },
    toggleOverview() {
      setOverview(!overview);
      syncHud(true);
    },
  });
  function isHiddenNow(v: AgentView) {
    const w = v.where;
    return w.kind === 'at' && !!SPOTS[w.at]?.hidden;
  }
  function follow(id: AgentId | null) {
    followId = id;
    cam.has = false;
    if (id) setOverview(false);
    syncHud(true);
  }

  function nowText(id: AgentId): { text: string; gone: boolean } {
    const a = s?.agents[id];
    if (!a) return { text: '', gone: true };
    const w = a.where;
    if (w.kind === 'away')
      return { text: a.doing === 'leave' ? '回家了' : `还没来（${hhmm(a.arrive)} 到）`, gone: true };
    if (w.kind === 'travel') return { text: `在路上 → ${placeName(w.to)}（${hhmm(w.t1)} 到）`, gone: false };
    if (w.kind === 'queue') return { text: `排队 · ${placeName(w.at)}`, gone: false };
    return { text: `${DOING_NAME[a.doing]} · ${placeName(w.at)}（到 ${hhmm(w.until)}）`, gone: false };
  }
  function intentText(it: Intent) {
    const where = it.at
      ? placeName(it.at)
      : it.kinds?.length
        ? `找${it.kinds.map((k) => KIND_NAME[k] ?? k).join('/')}`
        : '';
    return `${DOING_NAME[it.doing]}${where ? ` · ${where}` : ''}（${it.minutes} 分钟）`;
  }
  function agendaOf(id: AgentId): AgendaRow[] {
    if (!s) return [];
    const a = s.agents[id];
    if (!a) return [];
    const rows: AgendaRow[] = [];
    for (const e of s.log) {
      if (e.agent !== id) continue;
      if (e.kind === 'arrive')
        rows.push({ t: hhmm(e.t), text: `到了（${placeName(e.at ?? a.entry)}）`, state: 'past' });
      else if (e.kind === 'start' && e.doing && e.doing !== 'travel')
        rows.push({ t: hhmm(e.t), text: `${DOING_NAME[e.doing]} · ${placeName(e.at)}`, state: 'past' });
      else if (e.kind === 'gaveUp')
        rows.push({ t: hhmm(e.t), text: `放弃了：${e.note ?? placeName(e.at)}`, state: 'past' });
      else if (e.kind === 'leave') rows.push({ t: hhmm(e.t), text: '回家了', state: 'past' });
    }
    const past = rows.slice(-6);
    const now = nowText(id);
    const out: AgendaRow[] = [...past];
    if (!now.gone) {
      // 正在做的那一项（最后一条 start 就是它）：标成现在
      const w = a.where;
      if (w.kind === 'at' && out.length && out[out.length - 1].text.includes(placeName(w.at)))
        out[out.length - 1].state = 'now';
      else out.push({ t: hhmm(s.minute), text: now.text, state: 'now' });
    } else if (a.where.kind === 'away' && a.doing !== 'leave')
      out.push({ t: hhmm(a.arrive), text: '到俱乐部', state: 'next' });
    for (const it of a.plan.slice(a.where.kind === 'at' ? 1 : 0, 6))
      out.push({ t: it.after !== undefined ? hhmm(it.after) : '之后', text: intentText(it), state: 'next' });
    if (!(a.where.kind === 'away' && a.doing === 'leave'))
      out.push({ t: hhmm(a.leaveBy), text: '最晚这时候回家', state: 'next' });
    return out;
  }

  let hudT = 0;
  function syncHud(force = false) {
    if (!on || !s) return;
    hudT -= frameDt;
    if (!force && hudT > 0) return;
    hudT = 0.25;
    const st = s;
    const areas = new Map<string, number>();
    let total = 0;
    for (const v of views) {
      if (v.where.kind === 'away') continue;
      total++;
      const w = v.where;
      const name = w.kind === 'travel' ? '路上' : (SCENE_NAME[placeBy.get(w.at)?.scene ?? 'clubdesk'] ?? '别处');
      areas.set(name, (areas.get(name) ?? 0) + 1);
    }
    const fa = followId ? st.agents[followId] : undefined;
    const fp = fa ? personOf(cfg, fa.person, s) : undefined;
    const nt = followId ? nowText(followId) : null;
    // 此刻在场、看得见的人：named 先，按名字
    const present = views
      .filter((v) => v.where.kind !== 'away' && !isHiddenNow(v))
      .map((v) => ({ v, p: personOf(cfg, v.person, s) }))
      .sort(
        (x, y) =>
          (x.p?.tier === 'named' ? 0 : x.p?.tier === 'regular' ? 1 : 2) -
            (y.p?.tier === 'named' ? 0 : y.p?.tier === 'regular' ? 1 : 2) ||
          (x.p?.name ?? '').localeCompare(y.p?.name ?? ''),
      )
      .slice(0, 12);
    const d: HudData = {
      clock: hhmm(st.minute),
      period: periodOf(st.minute),
      speed: clock.speed,
      paused: clock.paused,
      total,
      areas: [...areas.entries()].sort((x, y) => y[1] - x[1]).slice(0, 10),
      follow:
        fa && nt
          ? {
              name: fp?.name ?? fa.person,
              title: fp ? `${fp.title} · ${fp.age} 岁` : '',
              now: nt.text,
              agenda: agendaOf(fa.id),
              gone: nt.gone,
              canCard: !!host.openCard && !!CAST.get(fa.person),
            }
          : null,
      picks: present.map(({ v, p }) => ({
        id: v.id,
        name: p?.name ?? v.person,
        note: `${DOING_NAME[v.doing]}${v.where.kind === 'at' ? ` · ${placeName(v.where.at)}` : ''}`,
      })),
      feed: feed
        .slice(-7)
        .reverse()
        .map((e) => ({ t: hhmm(e.t), text: e.text })),
      overview,
      gaps: gapLines(),
    };
    hud.sync(d);
    panelTop = hud.el.hidden ? innerHeight : hud.el.getBoundingClientRect().top;
  }

  // ── 点画面里的人：跟着他 ──
  const origTap = play.tapScreen.bind(play);
  const hp = new THREE.Vector3();
  play.tapScreen = (x, y, W, H) => {
    if (on) {
      let best: AgentId | null = null;
      let bd = overview ? 26 : 34;
      for (const [id, a] of actors) {
        if (a.hidden) continue;
        if (!overview && !a.body?.obj.visible) continue;
        hp.set(a.x, a.y + (overview ? 1.3 : a.kind === 'kid' ? 0.7 : 1.1), a.z);
        const p = play.project(hp, W, H);
        const dd = Math.hypot(p.x - x, p.y - y);
        if (dd < bd) {
          bd = dd;
          best = id;
        }
      }
      if (best) {
        follow(best);
        return;
      }
    }
    origTap(x, y, W, H);
  };

  // ── 名字小牌（跟着的那个人） ──
  function drawTag() {
    const a = followId ? actors.get(followId) : undefined;
    const tag = hud.tag;
    if (!a || a.hidden || !a.body?.obj.visible) {
      tag.hidden = true;
      return;
    }
    hp.set(a.x, a.y + (a.kind === 'kid' ? 1.45 : a.kind === 'teen' ? 1.75 : 2.05), a.z);
    const p = play.project(hp, innerWidth, innerHeight);
    const v = viewBy.get(a.id);
    const name = (a.person?.name ?? a.id).split(' ')[0];
    const html = `${name}<small>${v ? DOING_NAME[v.doing] : ''}</small>`;
    if (tag.innerHTML !== html) tag.innerHTML = html;
    tag.hidden = false;
    tag.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px) translate(-50%, -100%)`;
  }

  // ── 天光跟着引擎 ──
  function syncDaylight() {
    if (!s) return;
    day.total = dayBase + (s.minute + clock.frac) / 60;
  }

  const api: SimMount = {
    get on() {
      return on;
    },
    enable(v, o = {}) {
      if (o.speed !== undefined) clock.speed = o.speed;
      if (v && !on) {
        on = true;
        if (!s) fresh();
        savedSpeed = day.speed;
        savedWeather = day.weather;
        day.speed = 0;
        dayBase = Math.floor(day.total / 24) * 24;
        const wth = s?.weather;
        day.weather = wth?.rain ? 'rain' : wth?.wind ? 'dust' : 'clear';
        host.suppressScene(true);
        hud.show(true);
        clock.paused = false;
      } else if (!v && on) {
        on = false;
        host.suppressScene(false);
        clearActors();
        pool.hideAll();
        setOverview(false);
        followId = null;
        hud.show(false);
        day.speed = savedSpeed;
        day.weather = savedWeather;
      }
      if (v && o.at !== undefined) jump(o.at);
      if (v && o.panel) hud.open(true);
      if (v) {
        syncDaylight();
        syncHud(true);
      }
    },
    step(dt) {
      if (!on || !s) return;
      const t0 = performance.now();
      const n = clock.tick(dt);
      if (n) {
        advance(n);
        perf.steps += n;
      }
      // 一天完了（过了午夜）：第二天
      if (s.minute >= 24 * 60 - 1) {
        dayNo++;
        dayBase += 24;
        fresh();
      }
      moveCamera(dt);
      const ms = performance.now() - t0;
      perf.engine += ms;
      perf.engineMax = Math.max(perf.engineMax, ms);
    },
    frame(dt) {
      if (!on || !s) return;
      const t0 = performance.now();
      frameDt = Math.min(0.1, dt);
      rt += frameDt;
      syncDaylight();
      const vr = host.viewRect(MARGIN);
      const ct = host.pipe.rig.target;
      // 导航刚重建的那一帧不规划：重建后第一次寻路要先算连通分量（~0.1 秒），留给 walk.ts 下一帧的 prepare
      if (navFresh) navFresh = false;
      else planner.run();
      place(nowMin(), ct.x, ct.z);
      pool.frame(4);
      assignBodies(vr, host.viewRect(MARGIN + 10), ct.x, ct.z);
      // 身子摆到位、摆姿势
      const nav = play.nav;
      for (const v of views) {
        const a = actors.get(v.id);
        const b = a?.body;
        if (!a || !b) continue;
        if (a.hidden) {
          b.obj.visible = false;
          continue;
        }
        poseActor(a, v);
        let y = a.y;
        if (!a.moving && !a.pace && a.fixY !== undefined) y = a.fixY;
        else if (a.moving || a.pace || a.yKey !== a.anchorKey) {
          const h = nav.height(a.x, a.z);
          if (h !== null) y = h;
          a.yKey = a.moving || a.pace ? '' : a.anchorKey;
        }
        const sink = !a.moving && a.spec?.sink ? a.spec.sink : 0;
        a.y = y;
        b.obj.position.set(a.x, y - sink, a.z);
        b.obj.rotation.y = a.yaw;
        b.obj.visible = true;
      }
      if (overview) {
        pawns.begin();
        for (const v of views) {
          const a = actors.get(v.id);
          if (!a || a.hidden) continue;
          pawns.add(a.person?.look, a.x, a.y, a.z, a.kind === 'kid' ? 0.75 : 1);
        }
        pawns.end();
      }
      drawTag();
      syncHud();
      const ms = performance.now() - t0;
      perf.actors += ms;
      perf.actorsMax = Math.max(perf.actorsMax, ms);
      perf.frames++;
      perf.win.push(ms);
      if (perf.win.length > 240) perf.win.shift();
    },
    focus() {
      if (!on) return null;
      if (overview) return { x: (SITE.x0 + SITE.x1) / 2, z: (SITE.z0 + SITE.z1) / 2 };
      const a = followId ? actors.get(followId) : undefined;
      return a ? { x: a.x, z: a.z } : null;
    },
    overview: () => on && overview,
    navChanged() {
      planner.clear();
      navFresh = true;
      // 正在走的路按新导航重新规划（下一帧）
      for (const a of actors.values()) if (a.leg) a.leg.route = a.leg.way.length === 1 ? a.leg.route : null;
    },
    openPanel() {
      hud.open(true);
    },
    drawMap(g, sx, sz) {
      if (!on) return;
      g.fillStyle = '#2c2450';
      for (const a of actors.values()) {
        if (a.hidden) continue;
        g.fillRect(Math.round(sx(a.x)) - 1, Math.round(sz(a.z)) - 1, 2, 2);
      }
    },
  };

  const KIND_NAME: Record<string, string> = {
    court: '网球场',
    pickle: '匹克球场',
    table: '桌子',
    seat: '座位',
    stall: '摊位',
    cafe: '咖啡吧',
    bar: '酒吧',
    pool: '泳池',
    lounger: '躺椅',
    gym: '健身房',
    locker: '更衣室',
    shop: '店',
    stand: '看台',
    lesson: '课',
    play: '玩水的地方',
    golf: '高尔夫',
    desk: '前台',
  };

  // 调试钩子（simshot.mjs、测试用）
  (window as unknown as Record<string, unknown>).__clubsim = {
    get on() {
      return on;
    },
    enable: (v = true, o?: { at?: Minute; speed?: number; panel?: boolean }) => api.enable(v, o),
    jump: (m: Minute) => {
      if (!on) api.enable(true);
      jump(m);
      syncHud(true);
    },
    speed: (x: number) => {
      clock.speed = x;
      clock.paused = x === 0;
    },
    pause: (p = true) => {
      clock.paused = p;
    },
    view: () => views,
    follow: (id: AgentId | null) => follow(id),
    /** 跟着某个地点里的一个人（截图：给地点 id 的前缀，例如 'food.' 'clay.'） */
    followAt: (prefix: string) => {
      const v = views.find((q) => (q.where.kind === 'at' || q.where.kind === 'queue') && q.where.at.startsWith(prefix));
      if (v) follow(v.id);
      return v?.id ?? null;
    },
    overview: (v = true) => {
      setOverview(v);
      syncHud(true);
    },
    look: (x: number, z: number) => {
      followId = null;
      setOverview(false);
      play.teleport(x, z);
    },
    state: () => s,
    gaps: () => gapReport(),
    perf: () => {
      const w = [...perf.win].sort((p, q) => p - q);
      return {
        frames: perf.frames,
        engineAvg: perf.frames ? +(perf.engine / perf.frames).toFixed(3) : 0,
        actorsAvg: perf.frames ? +(perf.actors / perf.frames).toFixed(3) : 0,
        engineMax: +perf.engineMax.toFixed(2),
        actorsMax: +perf.actorsMax.toFixed(2),
        actorsP95: +(w[Math.floor(w.length * 0.95)] ?? 0).toFixed(2),
        steps: perf.steps,
        paths: { ...planner.stats, pending: planner.pending() },
        pool: { ...pool.stats, size: pool.all.length, used: pool.used() },
      };
    },
    resetPerf: () => {
      Object.assign(perf, { engine: 0, actors: 0, frames: 0, engineMax: 0, actorsMax: 0, steps: 0, win: [] });
      Object.assign(planner.stats, { calls: 0, ms: 0, hits: 0, fails: 0 });
    },
    stats: () => {
      const byArea: Record<string, number> = {};
      let present = 0;
      for (const v of views) {
        if (v.where.kind === 'away') continue;
        present++;
        const w = v.where;
        const k = w.kind === 'travel' ? 'travel' : (placeBy.get(w.at)?.scene ?? '?');
        byArea[k] = (byArea[k] ?? 0) + 1;
      }
      let bodies = 0;
      for (const a of actors.values()) if (a.body?.obj.visible) bodies++;
      return {
        minute: s?.minute ?? 0,
        clock: hhmm(s?.minute ?? 0),
        present,
        bodies,
        byArea,
        follow: followId,
        overview,
      };
    },
    speeds: SPEEDS,
  };

  // ?sim=1：开局就打开（从 ?simat= 的时刻开始，默认 6:30）
  if (params.get('sim') === '1') api.enable(true, { at: num('simat', 6.5 * 60), speed: clock.speed });
  return api;
}

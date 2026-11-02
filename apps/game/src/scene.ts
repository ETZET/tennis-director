import {
  BallPool,
  type CameraFocus,
  type ChoreoContext,
  contactPt,
  createDaylight,
  createRain,
  type PeopleWorld,
  Person,
  type PersonOptions,
  type PoseName,
  pointAlong,
  Scheduler,
  type Site,
  type Stage,
} from '@td/render';
import { clamp, lerp, mulberry32, type XZ } from '@td/shared';
import {
  type ContentBundle,
  coachAttention,
  DIRECTOR,
  type GameState,
  isStaff,
  postStatus,
  type SimEvent,
  type Walk,
  type World,
  working,
  worldOf,
} from '@td/sim';
import * as THREE from 'three';
import { idlePlan } from './idle';
import { createLife } from './life';
import { type PerformInput, perform, planPerformance } from './perform';

/**
 * 游戏画面里的"活"的部分：员工（总监也是）沿路线走、站在岗位上干活、设施状态、活动演出、天气。
 * 地图（锚点、步道、球场、设施的画面层）全部来自 Site，这里不认识任何一张具体的地图。
 *
 * 规则（CLAUDE.md）：这里只读模拟状态、只订阅领域事件，从不改模拟。
 * 演出用自己的时间轴（暂停时停、变速时不跟着快进），结果早已由模拟算好。
 */

const SK = ['#f1c7a1', '#e8b896', '#d9a47c', '#c48a62', '#a86f4c', '#7a4a32', '#5f3a28', '#f1d0ae'] as const;

/** 每个人物 id 的样子（内容里只有名字和数值，长相是画面的事） */
const LOOKS: Record<string, Omit<PersonOptions, 'name' | 'x' | 'z'>> = {
  dale: {
    wide: true,
    shirt: '#6b2e2a',
    shorts: '#4f5560',
    pants: true,
    skin: SK[0],
    hair: '#cfcac0',
    hairStyle: 'cap',
    cap: '#2b3440',
    beard: '#cfcac0',
    shoes: '#5a4a3a',
    racket: '#8a8f93',
  },
  jess_park: {
    shirt: '#2a8a86',
    shorts: '#f1ece0',
    skin: SK[2],
    hair: '#2a1d16',
    hairStyle: 'pony',
    shoes: '#f1ece0',
    racket: '#e8582c',
  },
  walt_hendricks: {
    wide: true,
    shirt: '#8a8f93',
    shorts: '#2e2e33',
    skin: SK[4],
    hair: '#cfcac0',
    hairStyle: 'visor',
    cap: '#1f3a5a',
    shoes: '#2a2a2a',
    racket: '#3a3f4a',
  },
  rosa_ortiz: {
    shirt: '#3d6b3a',
    shorts: '#4f5560',
    pants: true,
    skin: SK[4],
    hair: '#2a1d16',
    hairStyle: 'pony',
    cap: '#3d6b3a',
    shoes: '#5a4a3a',
  },
  ben_kim: {
    shirt: '#e6b03c',
    shorts: '#26262b',
    skin: SK[1],
    hair: '#2a1d16',
    hairStyle: 'short',
    shoes: '#f1ece0',
    racket: '#3a8fd9',
  },
  gus_moreno: {
    wide: true,
    shirt: '#7a5a3a',
    shorts: '#3a3f4a',
    pants: true,
    skin: SK[5],
    hair: '#9a9a96',
    hairStyle: 'cap',
    cap: '#c84a3a',
    beard: '#9a9a96',
    shoes: '#3a2a20',
  },
  lily_chen: {
    shirt: '#ffffff',
    trim: '#2fa3a8',
    shorts: '#2e2e33',
    skin: SK[0],
    hair: '#1d1d22',
    hairStyle: 'long',
    shoes: '#2e2e33',
  },
  marco_ruiz: {
    shirt: '#c84a3a',
    shorts: '#3a3f4a',
    skin: SK[3],
    hair: '#2a1d16',
    hairStyle: 'curly',
    shoes: '#f1ece0',
  },
  nadia_volkov: {
    shirt: '#1d1d22',
    trim: '#d6362f',
    shorts: '#1d1d22',
    skin: SK[0],
    hair: '#e0c48a',
    hairStyle: 'long',
    shoes: '#ffffff',
    racket: '#d6362f',
  },
  // 体能师：一身深绿的运动服
  kofi_mensah: {
    wide: true,
    shirt: '#2f6b4f',
    trim: '#f0a020',
    shorts: '#1d1d22',
    skin: SK[6],
    hair: '#1d1d22',
    hairStyle: 'bald',
    shoes: '#f1ece0',
  },
  // 大学球员：校队的白衣，拍子是橙色
  amara_okafor: {
    shirt: '#f1ece0',
    trim: '#3a8fd9',
    shorts: '#1f3a5a',
    skin: SK[5],
    hair: '#1d1d22',
    hairStyle: 'pony',
    shoes: '#ffffff',
    racket: '#f0a020',
  },
  // 穿线师：围裙色的上衣，手里抱着一箱拍子
  teo_ilic: {
    shirt: '#8a5ac4',
    shorts: '#3a3f4a',
    pants: true,
    skin: SK[0],
    hair: '#6a4a30',
    hairStyle: 'short',
    shoes: '#2e2e33',
    box: true,
  },
  // 前天才少年：黄绿配色的旧球衣
  luca_ferreira: {
    shirt: '#d9c35a',
    trim: '#3c7a5a',
    shorts: '#3c7a5a',
    skin: SK[3],
    hair: '#3b2a1e',
    hairStyle: 'curly',
    shoes: '#ffffff',
    racket: '#2a2a2a',
  },
  // 老场地主管：长裤、宽檐帽、白胡子
  ray_delgado: {
    wide: true,
    shirt: '#c9b48a',
    shorts: '#5a4a3a',
    pants: true,
    skin: SK[4],
    hair: '#d9d3c6',
    hairStyle: 'cap',
    cap: '#7a5a3a',
    beard: '#d9d3c6',
    shoes: '#3a2a20',
  },
  // 球童：比大人小一号，统一的球童衫
  mateo_salgado: {
    shirt: '#4a6fa8',
    trim: '#ffffff',
    shorts: '#2e2e33',
    skin: SK[4],
    hair: '#2a1d16',
    hairStyle: 'short',
    shoes: '#f1ece0',
    scale: 0.85,
  },
};

const SHIRTS = [
  '#e05a8f',
  '#2fa3a8',
  '#f0a020',
  '#8a5ac4',
  '#3c7a5a',
  '#c84a3a',
  '#4a6fa8',
  '#d9c35a',
  '#5a5a62',
  '#e8e2d2',
];
const HAIRS = ['#2a1d16', '#6a4a30', '#a7742f', '#d9d3c6', '#3b2a1e', '#9a9a96'];
const STYLES = ['short', 'pony', 'curly', 'visor', 'bald', 'long', 'cap'] as const;

/** 导航图上一段路要走几分钟 */
const edgeMinutes = (w: World, a: string, b: string): number => w.nav.get(a)?.find(([n]) => n === b)?.[1] ?? 1;

/** 走在路上的人此刻在画面上的哪儿：按导航图每段的分钟数，在画面路径上插值 */
function walkPoint(site: Site, w: World, walk: Walk, time: number): XZ {
  let prev = walk.from;
  let t0 = walk.start;
  for (const n of walk.route) {
    const m = edgeMinutes(w, prev, n);
    if (time <= t0 + m || n === walk.route[walk.route.length - 1]) {
      const pts = site.routeLine(prev, n) ?? [site.stands[prev] ?? { x: 0, z: 0 }, site.stands[n] ?? { x: 0, z: 0 }];
      return pointAlong(pts, clamp((time - t0) / Math.max(1, m), 0, 1));
    }
    prev = n;
    t0 += m;
  }
  return site.stands[walk.to] ?? { x: 0, z: 0 };
}

/** 这个地点现在有几块能打的场地（设施状态里的 courts） */
export function courtsAt(w: World, s: GameState, anchor: string): number {
  const f = w.facilityAt.get(anchor);
  if (!f) return 0;
  return w.facilities.get(f)?.states[s.facilities[f] ?? '']?.courts ?? 0;
}

/**
 * 状况 → 画面上的磨损量（ART-8 原型）：70 以上干净；往下开始长沙、草、垃圾；
 * 40 左右（"整理"工单冒出来的线）已经很明显，30（质量减半，conditionFactor）是 1，再往下继续堆。
 * 只是画面的换算，模拟的门槛不变。
 */
export const wearOf = (condition: number): number => clamp((70 - condition) / 40, 0, 1.75);

interface Perf {
  stop(): void;
}

export interface GameScene {
  /** 每帧调用：time 是带零头的游戏分钟，dt 是真实秒数，paused 时演出也停 */
  update(s: GameState, time: number, dt: number, paused: boolean): void;
  onEvents(s: GameState, events: readonly SimEvent[]): void;
  /** 读档或新开局后把演出状态对齐到当前模拟状态 */
  sync(s: GameState): void;
  setContent(c: ContentBundle): void;
  /** 头顶"你"牌子的位置 */
  directorHead(): { x: number; y: number; z: number };
  /** 卡片发生的地方：给相机一个镜头 */
  focus(): CameraFocus | null;
  readonly showNow: () => number;
}

export function createGameScene(stage: Stage, content0: ContentBundle, site: Site): GameScene {
  let content = content0;
  const sched = new Scheduler();
  const world: PeopleWorld = { scene: stage.scene, groundY: site.groundY, people: [] };
  const pool = new BallPool(stage.scene, site.groundY);
  const ctx: ChoreoContext = { sched, groundY: site.groundY };
  const overlays = site.createOverlays(stage);
  const rain = createRain(stage, site.rain);
  // 一天的光：画出来的天空和山，灯光跟着游戏时钟走（参考图 Palm Oasis）
  const daylight = createDaylight(stage);
  const sky = site.createSky(stage);
  const rnd = mulberry32(0x9a3e);
  const mk = (o: PersonOptions) => new Person(o, world);
  const STANDS = site.stands;

  /* ---------- 总监 ---------- */
  const home = (STANDS.entrance ?? Object.values(STANDS)[0] ?? { x: 0, z: 0 }) as XZ;
  const you = mk({
    name: 'Director',
    x: home.x,
    z: home.z,
    base: 'director',
    shirt: '#2f5a55',
    trim: '#e6b03c',
    shorts: '#7d6f55',
    pants: true,
    skin: SK[2],
    hair: '#4a3020',
    hairStyle: 'short',
    shoes: '#3a2a20',
    clipboard: true,
  });
  const marker = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.26, 0),
    new THREE.MeshBasicMaterial({ color: '#62e08c' }),
  );
  marker.position.y = 2.75;
  you.root.add(marker);

  /** 环境动画自己的时钟（暂停时停；暂停中游戏时间跳了就补一段） */
  let ambT = 0;

  /* ---------- 员工（Dale 和招聘日能招来的人）：没招的藏着 ---------- */
  const cast = new Map<string, Person>();
  for (const [id, look] of Object.entries(LOOKS)) {
    const def = content.people.find((p) => p.id === id);
    // 手机：闲着的时候掏出来看（手里抱着箱子的人不带）
    const p = mk({ name: def?.name ?? id, x: home.x, z: home.z, base: 'relaxed', phone: !look.box, ...look });
    p.root.visible = false;
    if (p.phone) p.phone.visible = false;
    cast.set(id, p);
  }

  /* ---------- 对打：一颗球在两人之间来回 ---------- */
  function rally(a: Person, b: Person, o: { pickle?: boolean; speed?: number; miss?: number } = {}): Perf {
    let alive = true;
    const speed = o.speed ?? 9;
    let ball = pool.get(a, !!o.pickle);
    const hit = (from: Person, to: Person, t: number) => {
      if (!alive) return;
      if (!ball.inUse) ball = pool.get(a, !!o.pickle);
      const P0 = contactPt(ctx, from, 1, 0.95);
      const side = rnd() < 0.6 ? 1 : -1;
      const P2 = contactPt(ctx, to, side, 0.9);
      const B = { x: lerp(P0.x, P2.x, 0.72), y: site.groundY(P0.x, P0.z) + 0.08, z: lerp(P0.z, P2.z, 0.72) };
      const d = Math.hypot(P2.x - P0.x, P2.z - P0.z);
      const T = clamp(d / speed, 0.5, 2.2);
      const tB = ball.arc(P0, B, t, T * 0.72);
      const tC = ball.arc(B, P2, tB, T * 0.28 + 0.12);
      if (rnd() < (o.miss ?? 0.12)) {
        // 没接到：球滚走，过一会儿换一颗新球
        ball.fadeOut(tC + 0.4);
        sched.at(tC + 1.6, (tt) => {
          ball = pool.get(a, !!o.pickle);
          hit(from, to, tt);
        });
        return;
      }
      to.setStroke(o.pickle ? 'dk' : side === 1 ? 'fh' : 'bh', tC);
      sched.at(tC, (tt) => hit(to, from, tt));
    };
    sched.at(sched.now + 0.5, (t) => hit(a, b, t));
    return {
      stop() {
        alive = false;
        ball.fadeOut(sched.now);
      },
    };
  }

  /* ---------- 演出：模拟的 performance 名字 → 活动动画库（perform.ts，ADR 0010） ---------- */
  let state: GameState | null = null;
  const headCoach = () => (state?.headCoach ? (cast.get(state.headCoach) ?? null) : null);
  const performInput = (): PerformInput => {
    const coachId = state?.headCoach;
    return {
      weather: rain.amount() > 0.3 ? 'rain' : state?.weather === 'wind' ? 'wind' : 'sun',
      fatigue: 25,
      coachSkill: coachId ? (state?.people[coachId]?.skill ?? 40) : 0,
    };
  };

  /* ---------- 活动 ---------- */
  const running = new Map<number, Perf>();
  /** 被演出借走的员工：这段时间不按岗位摆 */
  const borrowed = new Set<Person>();
  function releaseCoach(): void {
    for (const p of borrowed) {
      p.clearMoves();
      p.base = 'relaxed';
      p.lock = null;
      p.seatY = null;
    }
    borrowed.clear();
  }
  function startActivity(uid: number, performance: string, anchor: string): void {
    running.get(uid)?.stop();
    running.delete(uid);
    const plan = planPerformance(performance, anchor, site);
    if (!plan) return;
    const lang = document.documentElement.lang.startsWith('zh') ? 'zh' : 'en';
    const coach = plan.cast.startsWith('coach') ? headCoach() : null;
    if (coach) borrowed.add(coach);
    const p = perform(
      { scene: stage.scene, sched, world, lang, site },
      performance,
      performInput(),
      { coach, juniors: [] },
      uid,
      anchor,
    );
    running.set(uid, {
      stop() {
        p.stop();
        if (coach && borrowed.has(coach)) releaseCoach();
      },
    });
  }

  function sync(s: GameState): void {
    state = s;
    for (const p of running.values()) p.stop();
    running.clear();
    releaseCoach();
    for (const [f, st] of Object.entries(s.facilities)) overlays.set(f, st);
    life.reset();
    const w = worldOf(s, content);
    for (const a of s.activities)
      if (a.started && s.t < a.end) startActivity(a.uid, w.activities.get(a.id)?.performance ?? '', a.anchor);
    jobShows.clear();
    idleSince.clear();
    lastTime = null;
    for (const [id, p] of Object.entries(s.people)) {
      const who = staffPerson(id);
      if (!who || !p.hired) continue;
      const at = STANDS[p.at] ?? home;
      who.clearMoves();
      who.pos.x = at.x;
      who.pos.z = at.z;
    }
  }

  /* ---------- 员工：每个人按岗位站好，走在路上的沿画面路径走（ADR 0012） ---------- */
  const staffPerson = (id: string): Person | null => (id === DIRECTOR ? you : (cast.get(id) ?? null));
  /** 同一个地点站着几个人：按顺序错开一点，不叠在一起 */
  const SPREAD = [
    { x: 0, z: 0 },
    { x: 1.3, z: 0.6 },
    { x: -1.3, z: 0.6 },
    { x: 0.6, z: -1.2 },
    { x: -0.6, z: -1.2 },
    { x: 2.4, z: -0.4 },
    { x: -2.4, z: -0.4 },
  ];
  function placeStaff(s: GameState, w: World, time: number, sdt: number): void {
    const count = new Map<string, number>();
    for (const id of Object.keys(s.people).sort((a, b) =>
      a === DIRECTOR ? -1 : b === DIRECTOR ? 1 : a.localeCompare(b),
    )) {
      const p = s.people[id];
      const who = staffPerson(id);
      if (!p || !who) continue;
      if (!isStaff(s, w, id)) {
        who.root.visible = false;
        continue;
      }
      if (borrowed.has(who)) continue;
      who.root.visible = true;
      let target: XZ;
      const k = p.walk ? 0 : (count.get(p.at) ?? 0);
      if (!p.walk) count.set(p.at, k + 1);
      const base = STANDS[p.at] ?? home;
      const fr = site.courts[p.at]?.[0];
      const center = fr ? { x: fr.ox, z: fr.oz } : (site.anchors[p.at] ?? null);
      // 闲着（没派活，或者岗位还没到时段）：在站位附近溜达、看手机、坐下（idle.ts，只是画面）
      const post = p.job ? w.posts.get(p.job) : undefined;
      const offHours = !!post && !p.walk && !p.errand && !postStatus(s, w, post).inHours;
      const idle = !p.walk && !p.errand && (!p.job || offHours);
      if (!idle) idleSince.set(id, time);
      const plan = idle
        ? idlePlan(id, time, time - (idleSince.get(id) ?? time), base, !!who.phone, offHours ? 3.5 : 6, center)
        : null;
      if (p.walk) target = walkPoint(site, w, p.walk, time);
      else if (plan) target = { x: plan.x, z: plan.z };
      else {
        const o = SPREAD[k % SPREAD.length] as XZ;
        target = { x: base.x + o.x, z: base.z + o.z };
      }
      const dist = Math.hypot(target.x - who.pos.x, target.z - who.pos.z);
      who.clearMoves();
      if (sdt > 0 && dist > 0.01)
        who.go(target.x, target.z, plan ? Math.min(2.6, Math.max(0.9, dist / sdt)) : Math.max(1.2, dist / sdt));
      else if (jumped) {
        // 暂停时游戏时间跳了（试玩桥、调试快进）：直接站到该在的地方
        who.pos.x = target.x;
        who.pos.z = target.z;
      }
      if (!p.walk) {
        // 站着的时候面朝地点的中心（球场、喷泉、会所）；闲着时东张西望
        who.idleFace = plan?.face ?? (center ? Math.atan2(center.x - who.pos.x, center.z - who.pos.z) : null);
        if (jumped && who.idleFace != null) who.yaw = who.idleFace;
      }
      actIdle(id, who, plan);
      if (!plan && working(s, w, id)) actWork(id, who, post?.skill ?? (p.job ? w.orders.get(p.job)?.skill : undefined));
      else if (busyT.has(id)) {
        busyT.delete(id);
        who.writing = false;
        if (!plan) who.base = BASE0(who);
      }
    }
  }

  /* ---------- 闲着和干活的小动作（ART-9 原型）：只是画面，不碰模拟 ---------- */
  /** 每个人什么时候开始闲着的（游戏分钟；画面自己记，读档后从零算） */
  const idleSince = new Map<string, number>();
  const idleAct = new Map<string, string>();
  const busyT = new Map<string, number>();
  let jumped = false;
  let lastTime: number | null = null;
  const BASE0 = (who: Person): PoseName => (who === you ? 'director' : 'relaxed');
  function actIdle(id: string, who: Person, plan: ReturnType<typeof idlePlan> | null): void {
    const key = plan ? `${plan.act}:${plan.block}` : '';
    if (idleAct.get(id) === key) return;
    const was = idleAct.get(id);
    idleAct.set(id, key);
    if (!plan) {
      idleAct.delete(id);
      if (was === undefined) return;
    }
    // 换了一件事：先还原，再摆新姿势
    who.base = BASE0(who);
    who.seatY = null;
    if (who.phone) who.phone.visible = false;
    if (!plan) return;
    if (plan.act === 'phone' && who.phone) {
      who.base = 'phoneStand';
      who.phone.visible = true;
    } else if (plan.act === 'sit') {
      who.base = 'sitGround';
      who.seatY = site.groundY(plan.x, plan.z) - 0.62 * who.root.scale.x;
    } else if (plan.act === 'fidget') {
      const g = (['shrug', 'facepalm', 'hand'] as const)[plan.block % 3] ?? 'shrug';
      who.gesture(g, sched.now + 0.3, 1.6);
    }
  }
  /** 在没有活动演出的岗位上按技能比划：维护的弯腰擦扫，接待的说话招手，教学的指点拍手 */
  function actWork(id: string, who: Person, skill: string | undefined): void {
    const t = busyT.get(id) ?? 0;
    if (sched.now < t) return;
    busyT.set(id, sched.now + 1.6 + rnd() * 1.4);
    if (skill === 'upkeep') {
      const down = who.base !== 'stoop';
      who.base = down ? 'stoop' : BASE0(who);
      who.writing = down;
      return;
    }
    const pool =
      skill === 'teach'
        ? (['point', 'clap', 'whistle', 'cheer'] as const)
        : (['talk', 'wave', 'hand', 'point'] as const);
    who.gesture(pool[Math.floor(rnd() * pool.length)] ?? 'talk', sched.now, 1.4);
  }

  /* ---------- 岗位和工单的演出：有人在干就演，停了就收（演出只读状态） ---------- */
  const jobShows = new Map<string, number>();
  let nextShowUid = -1;
  function syncJobShows(s: GameState, w: World): void {
    const want = new Map<string, { performance: string; at: string }>();
    for (const post of w.posts.values()) {
      if (!post.performance) continue;
      const id = Object.values(s.people).find((p) => p.hired && p.job === post.id)?.id;
      if (!id || !working(s, w, id)) continue;
      if (!(post.hours ? isOn(s, post) : true)) continue;
      want.set(post.id, { performance: post.performance, at: post.at });
    }
    for (const o of w.orders.values()) {
      if (!o.performance || !s.orders[o.id]) continue;
      if (!Object.values(s.people).some((p) => p.hired && p.job === o.id && working(s, w, p.id))) continue;
      want.set(o.id, { performance: o.performance, at: o.at });
    }
    for (const [id, uid] of jobShows) {
      if (want.has(id)) continue;
      running.get(uid)?.stop();
      running.delete(uid);
      jobShows.delete(id);
    }
    for (const [id, x] of want) {
      if (jobShows.has(id)) continue;
      const plan = planPerformance(x.performance, x.at, site);
      // 只在有场地的地点上演；会所、广场的活由人站在那儿比划
      if (!plan) continue;
      // 要借主教练的演出：只有主教练本人在干这件事时才演
      if (plan.cast.startsWith('coach')) {
        const coachJob = s.headCoach ? s.people[s.headCoach]?.job : null;
        if (coachJob !== id) continue;
      }
      if ([...jobShows.keys()].some((k) => (w.posts.get(k)?.at ?? w.orders.get(k)?.at) === x.at)) continue;
      const uid = nextShowUid--;
      jobShows.set(id, uid);
      startActivity(uid, x.performance, x.at);
    }
  }
  const isOn = (s: GameState, post: { hours?: [number, number] | undefined; days?: number[] | undefined }) => {
    const h = (s.t % 1440) / 60;
    const wd = (Math.floor(s.t / 1440) % 7) as number;
    return (!post.days || post.days.includes(wd)) && !!post.hours && h >= post.hours[0] && h < post.hours[1];
  };

  /* ---------- 园区的日常：来打球的会员、路人、风沙（准则 6） ---------- */
  const life = createLife({
    stage,
    site,
    courtsAt: (s, a) => courtsAt(worldOf(s, content), s, a),
    sched,
    rnd,
    person: (i) => {
      const p = mk({
        name: `Member ${i + 1}`,
        x: 0,
        z: 0,
        base: 'relaxed',
        shirt: SHIRTS[(i * 5 + 2) % SHIRTS.length] as string,
        shorts: i % 2 ? '#f1ece0' : '#3a3f4a',
        pants: i % 5 === 4,
        skin: SK[(i * 3 + 1) % SK.length] as string,
        hair: HAIRS[(i * 2 + 1) % HAIRS.length] as string,
        hairStyle: STYLES[(i + 2) % STYLES.length],
        cap: SHIRTS[(i + 5) % SHIRTS.length] as string,
        shoes: '#f1ece0',
        reach: 0.8,
        racket: ['#d6362f', '#3a8fd9', '#f0a020'][i % 3] as string,
      });
      p.root.visible = false;
      return p;
    },
    rally: (a, b, o) => rally(a, b, o),
    waiting: (s) => {
      const w = worldOf(s, content);
      const by = new Map<string, { anchor: string; served: boolean; unserved: number }>();
      for (const post of w.posts.values()) {
        const st = postStatus(s, w, post);
        if (!st.exists || !st.demand || !st.inHours) continue;
        const x = by.get(post.at) ?? { anchor: post.at, served: false, unserved: 0 };
        if (st.active) x.served = true;
        else x.unserved++;
        by.set(post.at, x);
      }
      return [...by.values()];
    },
    busy: (anchor) =>
      !!state &&
      (state.activities.some((x) => x.started && x.anchor === anchor && state && state.t < x.end) ||
        [...jobShows.keys()].some((k) => {
          const w = worldOf(state as GameState, content);
          return (w.posts.get(k)?.at ?? w.orders.get(k)?.at) === anchor;
        })),
  });

  /* ---------- 卡片的镜头 ---------- */
  let focusAnchor: string | null = null;
  let focusUntil = 0;

  return {
    showNow: () => sched.now,
    setContent(c) {
      content = c;
    },
    sync,
    onEvents(s, events) {
      state = s;
      const w = worldOf(s, content);
      for (const e of events) {
        if (e.type === 'activityStarted') startActivity(e.uid, e.performance, e.anchor);
        else if (e.type === 'activityFinished') {
          running.get(e.uid)?.stop();
          running.delete(e.uid);
        } else if (e.type === 'log') {
          for (const x of e.entry.effects)
            if (x.kind === 'facility') {
              overlays.set(x.facility, x.state);
              // 修好了：镜头过去看一眼（ADR 0015：修好就是解锁，画面也跟着复原）
              const at = w.facilities.get(x.facility)?.anchor;
              if (at) {
                focusAnchor = at;
                focusUntil = sched.now + 4;
              }
            }
        } else if (e.type === 'cardOpened') {
          const c = w.cards.get(e.card);
          const loc = c?.stage?.anchor ?? c?.location;
          if (loc) {
            focusAnchor = loc;
            focusUntil = sched.now + 6;
          }
        } else if (e.type === 'weather') {
          // 天气由模拟决定：雨天下雨，其他天放晴
          if (e.weather === 'rain') rain.start();
          else rain.stop();
        }
      }
    },
    update(s, time, dt, paused) {
      state = s;
      const sdt = paused ? 0 : dt;
      jumped = paused && lastTime !== null && Math.abs(time - lastTime) > 0.5;
      lastTime = time;
      sched.advance(sdt);

      const w = worldOf(s, content);
      syncJobShows(s, w);
      placeStaff(s, w, time, sdt);

      // 主教练：总监不在场时专注度低（有的教练爱看手机）
      const coachId = s.headCoach;
      const coach = coachId ? cast.get(coachId) : null;
      if (coach && coachId && coach.base !== 'ready' && !borrowed.has(coach) && working(s, w, coachId)) {
        const distracted = coachAttention(s, w) < 0.6;
        coach.base = distracted ? 'phoneStand' : 'relaxed';
        if (coach.phone) coach.phone.visible = distracted;
      }

      // 暂停时游戏时间也跳了（试玩桥、调试快进）：路人、风沙这些按一小段时间补上，截图不再定格在同一帧
      const adv = sdt > 0 ? sdt : jumped ? 0.5 : 0;
      life.update(s, adv);
      // 状况看得见（ART-8 原型）：修好的设施状况往下掉，先长沙、草、垃圾，再掉档
      for (const [f, st] of Object.entries(s.facilities)) {
        const decays = (w.facilities.get(f)?.states[st]?.decay_day ?? 0) > 0;
        overlays.wear?.(f, decays ? wearOf(s.condition[f] ?? 100) : 0);
      }

      for (const p of world.people) p.update(sdt, sched.now);
      pool.update(sched.now);
      marker.rotation.y += dt * 2;
      marker.position.y = 2.75 + Math.sin(sched.now * 3) * 0.08;
      rain.update(sdt, 0, 0);
      daylight.update(time % 1440, rain.amount());
      // 风力：大风天最大，春天风季次之（ambient 里风滚草和扬沙跟着变）
      const wind = s.weather === 'wind' ? 1 : s.season === 'spring' ? 0.55 : 0.25;
      if (sdt > 0) {
        ambT += sdt;
        sky.update(sdt, ambT, rain.amount(), wind);
      } else if (jumped)
        for (let i = 0; i < 40; i++) {
          ambT += 0.1;
          sky.update(0.1, ambT, rain.amount(), wind);
        }
    },
    directorHead: () => ({ x: you.pos.x, y: you.root.position.y + 3.3, z: you.pos.z }),
    focus() {
      if (!focusAnchor || sched.now > focusUntil) return null;
      const p = STANDS[focusAnchor];
      return p ? { x: p.x, z: p.z, zoom: 1.2 } : null;
    },
  };
}

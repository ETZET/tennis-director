import {
  BallPool,
  type CameraFocus,
  type ChoreoContext,
  contactPt,
  createRain,
  EAST,
  hollowCreek,
  type PeopleWorld,
  Person,
  type PersonOptions,
  Scheduler,
  type Stage,
  WEST,
} from '@td/render';
import { clamp, lerp, mulberry32, type XZ } from '@td/shared';
import {
  type ContentBundle,
  coachAttention,
  DIRECTOR,
  type GameState,
  isStaff,
  type SimEvent,
  type Walk,
  type World,
  working,
  worldOf,
} from '@td/sim';
import * as THREE from 'three';
import { createLife } from './life';
import { type PerformInput, perform, planPerformance } from './perform';

/**
 * 游戏画面里的"活"的部分：员工（总监也是）沿路线走、站在岗位上干活、教练和孩子们、设施状态、活动演出、下雨。
 *
 * 规则（CLAUDE.md）：这里只读模拟状态、只订阅领域事件，从不改模拟。
 * 演出用自己的时间轴（暂停时停、变速时不跟着快进），结果早已由模拟算好。
 */

const { FA, FB, FC, FD, STANDS, routeLine, pointAlong } = hollowCreek;
const SK = ['#f1c7a1', '#e8b896', '#d9a47c', '#c48a62', '#a86f4c', '#7a4a32', '#5f3a28', '#f1d0ae'] as const;
const A = (x: number, z: number) => FA.w({ x, z });

/** 每个人物 id 的样子（内容里只有名字和数值，长相是画面的事） */
const LOOKS: Record<string, Omit<PersonOptions, 'name' | 'x' | 'z'>> = {
  dale: {
    wide: true,
    shirt: '#6b2e2a',
    shorts: '#4f5560',
    pants: true,
    skin: SK[0],
    hair: '#6a5a48',
    hairStyle: 'cap',
    cap: '#2b3440',
    beard: '#6a5a48',
    shoes: '#5a4a3a',
    racket: '#8a8f93',
    phone: true,
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
  tyler: {
    shirt: '#5b6f8a',
    shorts: '#26262b',
    skin: SK[3],
    hair: '#3b2a1e',
    hairStyle: 'short',
    shoes: '#d0ccc0',
    racket: '#d6362f',
  },
  mason: {
    shirt: '#9a8a5a',
    shorts: '#3a3f4a',
    skin: SK[1],
    hair: '#a7742f',
    hairStyle: 'short',
    shoes: '#2a2a2a',
    racket: '#1f1f1f',
  },
};

const COACHES = ['dale', 'jess_park', 'walt_hendricks', 'nadia_volkov'];
/** 招聘日能招来的员工（长相在 LOOKS 里） */
const CREW = ['rosa_ortiz', 'ben_kim', 'gus_moreno', 'lily_chen'];

/** 导航图上一段路要走几分钟 */
const edgeMinutes = (w: World, a: string, b: string): number => w.nav.get(a)?.find(([n]) => n === b)?.[1] ?? 1;

/** 走在路上的人此刻在画面上的哪儿：按导航图每段的分钟数，在画面路径上插值 */
function walkPoint(w: World, walk: Walk, time: number): XZ {
  let prev = walk.from;
  let t0 = walk.start;
  for (const n of walk.route) {
    const m = edgeMinutes(w, prev, n);
    if (time <= t0 + m || n === walk.route[walk.route.length - 1]) {
      const pts = routeLine(prev, n) ?? [STANDS[prev] ?? { x: 0, z: 0 }, STANDS[n] ?? { x: 0, z: 0 }];
      return pointAlong(pts, clamp((time - t0) / Math.max(1, m), 0, 1));
    }
    prev = n;
    t0 += m;
  }
  return STANDS[walk.to] ?? { x: 0, z: 0 };
}
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

export function createGameScene(stage: Stage, content0: ContentBundle): GameScene {
  let content = content0;
  const sched = new Scheduler();
  const world: PeopleWorld = { scene: stage.scene, groundY: hollowCreek.groundY, people: [] };
  const pool = new BallPool(stage.scene, hollowCreek.groundY);
  const ctx: ChoreoContext = { sched, groundY: hollowCreek.groundY };
  const overlays = hollowCreek.createFacilityOverlays(stage);
  const rain = createRain(stage, hollowCreek.HOLLOW_CREEK_RAIN);
  const sky = hollowCreek.createHollowCreekSky(stage);
  const rnd = mulberry32(0x9a3e);
  const mk = (o: PersonOptions) => new Person(o, world);

  /* ---------- 总监 ---------- */
  const home = STANDS.deck as XZ;
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

  let workT = 0;

  /* ---------- 教练和孩子 ---------- */
  const COACH_SPOT = A(3.6, -1.6);
  const cast = new Map<string, Person>();
  for (const id of [...COACHES, ...CREW, 'tyler', 'mason']) {
    const look = LOOKS[id];
    if (!look) continue;
    const def = content.people.find((p) => p.id === id);
    const p = mk({ name: def?.name ?? id, x: COACH_SPOT.x, z: COACH_SPOT.z, base: 'relaxed', ...look });
    p.root.visible = false;
    cast.set(id, p);
  }
  const JR_IDLE: Record<string, XZ> = { tyler: A(-10.8, 0), mason: A(-13.4, -6.6) };
  for (const [id, at] of Object.entries(JR_IDLE)) {
    const p = cast.get(id);
    if (!p) continue;
    p.pos.x = at.x;
    p.pos.z = at.z;
    p.root.visible = true;
  }
  const mason = cast.get('mason') as Person;
  mason.base = 'sitGround';
  mason.seatY = FA.oy + 0.12 - 0.85;
  mason.yaw = FA.yaw(0.7);

  /* ---------- 路人：试训日、义工、观众、匹克球队 ---------- */
  const extras: Person[] = [];
  for (let i = 0; i < 12; i++) {
    const p = mk({
      name: `Guest ${i + 1}`,
      x: 0,
      z: 0,
      base: 'relaxed',
      shirt: SHIRTS[i % SHIRTS.length] as string,
      shorts: i % 3 ? '#3a3f4a' : '#f1ece0',
      pants: i % 4 === 0,
      skin: SK[Math.floor(rnd() * SK.length)] as string,
      hair: HAIRS[Math.floor(rnd() * HAIRS.length)] as string,
      hairStyle: STYLES[i % STYLES.length],
      cap: SHIRTS[(i + 3) % SHIRTS.length] as string,
      shoes: '#f1ece0',
      reach: 0.8,
      ...(i < 4 ? { paddle: ['#3a8fd9', '#e8582c', '#7fcf6a', '#d63a6a'][i] as string } : { racket: '#d6362f' }),
    });
    p.root.visible = false;
    extras.push(p);
  }
  const taken = new Set<Person>();
  const place = (p: Person, at: XZ, base: Person['base'] = 'relaxed', lock: number | null = null) => {
    p.clearMoves();
    p.pos.x = at.x;
    p.pos.z = at.z;
    p.base = base;
    p.lock = lock;
    p.seatY = null;
    p.root.visible = true;
  };
  const giveBack = (ps: readonly Person[]) => {
    for (const p of ps) {
      p.clearMoves();
      p.root.visible = false;
      p.watch = null;
      p.idleFace = null;
      taken.delete(p);
    }
  };

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
      const B = { x: lerp(P0.x, P2.x, 0.72), y: hollowCreek.groundY(P0.x, P0.z) + 0.08, z: lerp(P0.z, P2.z, 0.72) };
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
    const ps = state?.people ?? {};
    const jr = ['tyler', 'mason'].map((id) => ps[id]?.fatigue ?? 0);
    const coachId = state?.headCoach;
    return {
      weather: rain.amount() > 0.3 ? 'rain' : 'cloud',
      fatigue: jr.reduce((a, b) => a + b, 0) / jr.length,
      coachSkill: coachId ? (ps[coachId]?.skill ?? 40) : 0,
    };
  };

  /* ---------- 2 号场的匹克球：设施状态决定他们在不在 ---------- */
  let pickleRallies: Perf[] = [];
  let pickleOn = false;
  const PB_HOMES = [
    { x: -2.5, z: -1.5, team: 0 },
    { x: 2.5, z: -1.5, team: 1 },
    { x: -2.5, z: 1.5, team: 0 },
    { x: 2.5, z: 1.5, team: 1 },
  ] as const;
  function syncPickleball(force = false): void {
    const want = !!state && state.facilities.court_2 !== 'tennis';
    if (!force && want === pickleOn) return;
    const pb = extras.slice(0, 4);
    for (const r of pickleRallies) r.stop();
    pickleRallies = [];
    pickleOn = want;
    giveBack(pb);
    if (!want) return;
    pb.forEach((p, i) => {
      taken.add(p);
      const h = PB_HOMES[i] as (typeof PB_HOMES)[number];
      place(p, FB.w(h), 'pbReady', FB.yaw(h.team ? WEST : EAST));
    });
    pickleRallies = [
      rally(pb[0] as Person, pb[1] as Person, { pickle: true, speed: 5, miss: 0.1 }),
      rally(pb[2] as Person, pb[3] as Person, { pickle: true, speed: 5, miss: 0.1 }),
    ];
  }

  /* ---------- 1 号场平时的样子：孩子们（员工由 placeStaff 每帧摆） ---------- */
  function idleCourt1(): void {
    const coach = headCoach();
    if (coach && borrowed.has(coach)) {
      borrowed.delete(coach);
      coach.clearMoves();
      coach.base = 'relaxed';
      coach.lock = null;
      coach.seatY = null;
    }
    const ty = cast.get('tyler') as Person;
    place(ty, JR_IDLE.tyler as XZ, 'ready', FA.yaw(EAST));
    place(mason, JR_IDLE.mason as XZ, 'sitGround');
    mason.seatY = FA.oy + 0.12 - 0.85;
    mason.lock = null;
    mason.idleFace = FA.yaw(0.7);
  }

  /* ---------- 活动 ---------- */
  const running = new Map<number, Perf>();
  /** 被演出借走的员工：这段时间不按岗位摆 */
  const borrowed = new Set<Person>();
  function startActivity(uid: number, performance: string, anchor?: string): void {
    running.get(uid)?.stop();
    running.delete(uid);
    const plan = planPerformance(performance, anchor);
    if (!plan) return;
    // 2 号场上的演出：先把正在打匹克球的四位请下场，演完再回来
    const court2 = plan.area === 'court_2';
    if (court2) {
      for (const r of pickleRallies) r.stop();
      pickleRallies = [];
      giveBack(extras.slice(0, 4));
    }
    const lang = document.documentElement.lang.startsWith('zh') ? 'zh' : 'en';
    const coach = plan.cast.startsWith('coach') ? headCoach() : null;
    if (coach) borrowed.add(coach);
    const p = perform(
      { scene: stage.scene, sched, world, lang },
      performance,
      performInput(),
      {
        coach: headCoach(),
        juniors: [cast.get('tyler') as Person, mason],
      },
      uid,
      anchor,
    );
    running.set(uid, {
      stop() {
        p.stop();
        if (court2) syncPickleball(true);
        idleCourt1();
      },
    });
  }

  function sync(s: GameState): void {
    state = s;
    for (const p of running.values()) p.stop();
    running.clear();
    for (const [f, st] of Object.entries(s.facilities)) overlays.set(f, st);
    giveBack(extras.slice(4));
    life.reset();
    idleCourt1();
    syncPickleball(true);
    const w = worldOf(s, content);
    for (const a of s.activities)
      if (a.started && s.t < a.end) startActivity(a.uid, w.activities.get(a.id)?.performance ?? '', a.anchor);
    jobShows.clear();
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
        // 没招的、走了的人不在场上（孩子们由 idleCourt1 管）
        if (COACHES.includes(id) || CREW.includes(id)) who.root.visible = false;
        continue;
      }
      if (borrowed.has(who)) continue;
      who.root.visible = true;
      let target: XZ;
      if (p.walk) target = walkPoint(w, p.walk, time);
      else {
        const k = count.get(p.at) ?? 0;
        count.set(p.at, k + 1);
        const base = STANDS[p.at] ?? home;
        const o = SPREAD[k % SPREAD.length] as XZ;
        target = { x: base.x + o.x, z: base.z + o.z };
      }
      const dist = Math.hypot(target.x - who.pos.x, target.z - who.pos.z);
      who.clearMoves();
      if (sdt > 0 && dist > 0.01) who.go(target.x, target.z, Math.max(1.2, dist / sdt));
      if (!p.walk) {
        const look = ({ deck: FA, court_1: FA, court_2: FB, bubble_court: FC, clay_court: FD } as const)[
          p.at as 'deck'
        ];
        who.idleFace = look ? Math.atan2(look.ox - who.pos.x, look.oz - who.pos.z) : null;
      }
    }
  }

  /* ---------- 岗位和工单的演出：有人在干就演，停了就收（演出只读状态） ---------- */
  const jobShows = new Map<string, number>();
  let nextShowUid = -1;
  const COURTS = ['court_1', 'court_2', 'bubble_court', 'clay_court'];
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
      const plan = planPerformance(x.performance, x.at);
      // 只在场地上（或露台旁的台地上）演；会所、停车场的活由人站在那儿比划
      if (!plan || !(COURTS.includes(x.at) || (plan.area === 'terrace' && x.at === 'deck'))) continue;
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

  /* ---------- 会所的日常：来打球的会员、路人、落叶（准则 6） ---------- */
  const locals: Person[] = [];
  const life = createLife({
    stage,
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
        ...(i < 6 ? { racket: ['#d6362f', '#3a8fd9', '#f0a020'][i % 3] as string } : {}),
      });
      p.root.visible = false;
      locals.push(p);
      return p;
    },
    rally: (a, b, o) => rally(a, b, o),
    busy: (anchor) =>
      !!state && state.activities.some((x) => x.started && x.anchor === anchor && state && state.t < x.end),
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
          for (const x of e.entry.effects) {
            if (x.kind === 'facility') {
              overlays.set(x.facility, x.state);
              if (x.facility === 'court_2') syncPickleball();
            }
            if (x.kind === 'hire' || x.kind === 'fire') idleCourt1();
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
      sched.advance(sdt);

      const w = worldOf(s, content);
      syncJobShows(s, w);
      placeStaff(s, w, time, sdt);

      // 爱玩手机的教练：总监不在场就低头看手机
      const coachId = s.headCoach;
      const coach = coachId ? cast.get(coachId) : null;
      if (coach && coach.base !== 'ready') {
        const distracted = coachAttention(s, w) < 0.6;
        coach.base = distracted ? 'phoneStand' : 'relaxed';
        if (coach.phone) coach.phone.visible = distracted;
      }

      life.update(s, sdt);
      // 总监在岗位上干活的时候：比划、说话、指点
      if (working(s, w, DIRECTOR) && sdt > 0) {
        workT -= sdt;
        if (workT <= 0) {
          workT = 1.6 + rnd() * 1.2;
          const g = (['talk', 'point', 'cheer', 'wave'] as const)[Math.floor(rnd() * 4)] ?? 'talk';
          you.gesture(g, sched.now, 1.4);
        }
      }

      for (const p of world.people) p.update(sdt, sched.now);
      pool.update(sched.now);
      marker.rotation.y += dt * 2;
      marker.position.y = 2.75 + Math.sin(sched.now * 3) * 0.08;
      rain.update(sdt, 0, 0);
      sky.update(sdt, sched.now, rain.amount());
    },
    directorHead: () => ({ x: you.pos.x, y: you.root.position.y + 3.3, z: you.pos.z }),
    focus() {
      if (!focusAnchor || sched.now > focusUntil) return null;
      const p = STANDS[focusAnchor];
      return p ? { x: p.x, z: p.z, zoom: 0.62 } : null;
    },
  };
}

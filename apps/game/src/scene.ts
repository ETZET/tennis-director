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
import { type ContentBundle, coachAttention, type GameState, type SimEvent, worldOf } from '@td/sim';
import * as THREE from 'three';

/**
 * 游戏画面里的"活"的部分：总监沿路线走、教练和孩子们、设施状态、活动演出、下雨。
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

  /* ---------- 跑步冒的烟（精力足的时候） ---------- */
  const puffGeo = new THREE.BoxGeometry(0.3, 0.3, 0.3);
  const puffs: { m: THREE.Mesh; life: number }[] = [];
  let puffT = 0;
  let workT = 0;
  function spawnPuff(x: number, z: number): void {
    let p = puffs.find((q) => q.life <= 0);
    if (!p) {
      const m = new THREE.Mesh(
        puffGeo,
        new THREE.MeshLambertMaterial({ color: '#efe9da', transparent: true, opacity: 0.8, depthWrite: false }),
      );
      stage.scene.add(m);
      p = { m, life: 0 };
      puffs.push(p);
    }
    p.life = 0.6;
    p.m.visible = true;
    p.m.position.set(x + (rnd() - 0.5) * 0.4, hollowCreek.groundY(x, z) + 0.15, z + (rnd() - 0.5) * 0.4);
  }
  function updatePuffs(dt: number): void {
    for (const p of puffs) {
      if (p.life <= 0) continue;
      p.life -= dt;
      const k = Math.max(0, p.life / 0.6);
      p.m.scale.setScalar(0.6 + (1 - k) * 1.4);
      p.m.position.y += dt * 0.8;
      (p.m.material as THREE.MeshLambertMaterial).opacity = 0.8 * k;
      if (p.life <= 0) p.m.visible = false;
    }
  }

  /* ---------- 教练和孩子 ---------- */
  const COACH_SPOT = A(3.6, -1.6);
  const cast = new Map<string, Person>();
  for (const id of [...COACHES, 'tyler', 'mason']) {
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
  const borrow = (n: number, from = 4): Person[] => {
    const out: Person[] = [];
    for (let i = from; i < extras.length && out.length < n; i++) {
      const p = extras[i] as Person;
      if (taken.has(p)) continue;
      taken.add(p);
      out.push(p);
    }
    return out;
  };
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

  /** 人群在一块地方转悠、说话、欢呼 */
  function mill(
    ps: readonly Person[],
    spots: () => XZ,
    gestures: readonly ('talk' | 'cheer' | 'wave' | 'point')[],
  ): Perf {
    let alive = true;
    const loop = (p: Person, t: number) => {
      if (!alive) return;
      const r = rnd();
      if (r < 0.45) {
        const s = spots();
        p.go(s.x, s.z, 1.1 + rnd() * 0.6);
      } else p.gesture(gestures[Math.floor(rnd() * gestures.length)] ?? 'talk', t, 1.6 + rnd());
      sched.at(t + 2.5 + rnd() * 3, (tt) => loop(p, tt));
    };
    for (const p of ps) sched.at(sched.now + rnd() * 2, (t) => loop(p, t));
    return {
      stop() {
        alive = false;
      },
    };
  }

  const inFrame = (fr: typeof FA, x0: number, x1: number, z0: number, z1: number) => () =>
    fr.w({ x: lerp(x0, x1, rnd()), z: lerp(z0, z1, rnd()) });

  /* ---------- 演出库：模拟的 performance 名字 → 画面 ---------- */
  let state: GameState | null = null;
  const headCoach = () => (state?.headCoach ? (cast.get(state.headCoach) ?? null) : null);

  const PERFS: Record<string, () => Perf> = {
    lesson() {
      const coach = headCoach();
      const ty = cast.get('tyler') as Person;
      if (!coach) return { stop() {} };
      place(coach, A(9, 0), 'ready', FA.yaw(WEST));
      place(ty, A(-9.5, -1.5), 'ready', FA.yaw(EAST));
      place(mason, A(-9.5, 2.5), 'ready', FA.yaw(EAST));
      const r1 = rally(coach, ty, { miss: 0.18 });
      const r2 = rally(coach, mason, { miss: 0.3, speed: 7 });
      return {
        stop() {
          r1.stop();
          r2.stop();
          idleCourt1();
        },
      };
    },
    trial_day() {
      const coach = headCoach();
      const guests = borrow(6);
      for (const [i, g] of guests.entries()) place(g, A(-6 + i * 2.4, 7.4));
      const m = mill(guests, inFrame(FA, -12, 12, 6, 8.4), ['talk', 'cheer', 'wave']);
      let r: Perf | null = null;
      const kid = guests[0];
      if (coach && kid) {
        place(coach, A(9, 0), 'ready', FA.yaw(WEST));
        place(kid, A(-9, 0), 'ready', FA.yaw(EAST));
        r = rally(coach, kid, { miss: 0.35, speed: 6 });
      }
      return {
        stop() {
          r?.stop();
          m.stop();
          giveBack(guests);
          idleCourt1();
        },
      };
    },
    match() {
      const ty = cast.get('tyler') as Person;
      const [rival, ...fans] = borrow(5);
      if (!rival) return { stop() {} };
      place(ty, A(-10, 0), 'ready', FA.yaw(EAST));
      place(rival, A(10, 0), 'ready', FA.yaw(WEST));
      for (const [i, f] of fans.entries()) place(f, A(-8 + i * 4, -8.2));
      const r = rally(ty, rival, { speed: 11, miss: 0.15 });
      const m = mill(fans, inFrame(FA, -12, 12, -8.6, -7.6), ['cheer', 'point']);
      return {
        stop() {
          r.stop();
          m.stop();
          giveBack([rival, ...fans]);
          idleCourt1();
        },
      };
    },
    workday() {
      const crew = borrow(5);
      for (const c of crew) place(c, inFrame(FD, -12, 12, -7, 7)(), 'carry');
      const m = mill(crew, inFrame(FD, -14, 14, -8, 8), ['point', 'talk']);
      return {
        stop() {
          m.stop();
          giveBack(crew);
        },
      };
    },
    contractor() {
      const crew = borrow(3);
      for (const c of crew) place(c, inFrame(FD, -10, 10, -6, 6)(), 'carry');
      const m = mill(crew, inFrame(FD, -14, 14, -8, 8), ['point']);
      return {
        stop() {
          m.stop();
          giveBack(crew);
        },
      };
    },
    fundraiser() {
      const d = hollowCreek.DECK;
      const guests = borrow(7);
      const spot = () => ({ x: lerp(d.x0 + 1.5, d.x1 - 1.5, rnd()), z: lerp(d.z0 + 1, d.z1 - 1, rnd()) });
      for (const g of guests) place(g, spot());
      const m = mill(guests, spot, ['talk', 'cheer', 'wave']);
      return {
        stop() {
          m.stop();
          giveBack(guests);
        },
      };
    },
    tug_of_war() {
      const tennis = borrow(4);
      // 匹克球那一队就是 2 号场上打球的那四位
      for (const r of pickleRallies) r.stop();
      pickleRallies = [];
      const pickle = extras.slice(0, 4);
      for (const p of pickle) taken.add(p);
      for (const [i, p] of tennis.entries()) place(p, FB.w({ x: -2 - i * 1.4, z: 0 }), 'carry', FB.yaw(EAST));
      for (const [i, p] of pickle.entries()) place(p, FB.w({ x: 2 + i * 1.4, z: 0 }), 'carry', FB.yaw(WEST));
      let alive = true;
      const tug = (t: number) => {
        if (!alive) return;
        const off = (rnd() - 0.5) * 1.6;
        tennis.forEach((p, i) => {
          const w = FB.w({ x: -2 - i * 1.4 + off, z: 0 });
          p.go(w.x, w.z, 0.8);
        });
        pickle.forEach((p, i) => {
          const w = FB.w({ x: 2 + i * 1.4 + off, z: 0 });
          p.go(w.x, w.z, 0.8);
        });
        sched.at(t + 1.4, tug);
      };
      sched.at(sched.now + 0.3, tug);
      return {
        stop() {
          alive = false;
          giveBack([...tennis, ...pickle]);
          syncPickleball(true);
        },
      };
    },
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

  /* ---------- 1 号场平时的样子 ---------- */
  function idleCourt1(): void {
    const coach = headCoach();
    for (const id of COACHES) {
      const p = cast.get(id) as Person;
      if (p !== coach) p.root.visible = false;
    }
    if (coach) {
      place(coach, COACH_SPOT, 'relaxed');
      coach.idleFace = FA.yaw(WEST);
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
  function startActivity(uid: number, performance: string): void {
    running.get(uid)?.stop();
    const f = PERFS[performance];
    if (f) running.set(uid, f());
  }

  function sync(s: GameState): void {
    state = s;
    for (const p of running.values()) p.stop();
    running.clear();
    for (const [f, st] of Object.entries(s.facilities)) overlays.set(f, st);
    giveBack(extras.slice(4));
    idleCourt1();
    syncPickleball(true);
    const w = worldOf(s, content);
    for (const a of s.activities)
      if (a.started && s.t < a.end) startActivity(a.uid, w.activities.get(a.id)?.performance ?? '');
    const d = s.director;
    const at = STANDS[d.at ?? d.leg?.from ?? 'deck'] ?? home;
    you.clearMoves();
    you.pos.x = at.x;
    you.pos.z = at.z;
  }

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
        if (e.type === 'activityStarted') startActivity(e.uid, e.performance);
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

      // 总监：在路上就沿画面里的路径插值，站定就回到那个地点的站位
      const d = s.director;
      let target: XZ;
      if (d.leg) {
        const pts = routeLine(d.leg.from, d.leg.to) ?? [STANDS[d.leg.from] ?? home, STANDS[d.leg.to] ?? home];
        const u = clamp((time - d.leg.start) / Math.max(1, d.leg.end - d.leg.start), 0, 1);
        target = pointAlong(pts, u);
      } else target = STANDS[d.at ?? 'deck'] ?? home;
      const dist = Math.hypot(target.x - you.pos.x, target.z - you.pos.z);
      you.clearMoves();
      if (sdt > 0 && dist > 0.01) you.go(target.x, target.z, Math.max(1.2, dist / sdt));
      if (!d.leg && d.at) {
        const look =
          d.at === 'deck' ? FA : ({ court_1: FA, court_2: FB, bubble_court: FC, clay_court: FD } as const)[d.at];
        you.idleFace = look ? Math.atan2(look.ox - you.pos.x, look.oz - you.pos.z) : null;
      }

      // 爱玩手机的教练：总监不在场就低头看手机
      const coachId = s.headCoach;
      const coach = coachId ? cast.get(coachId) : null;
      if (coach && coach.base !== 'ready') {
        const distracted = coachAttention(s, worldOf(s, content)) < 0.6;
        coach.base = distracted ? 'phoneStand' : 'relaxed';
        if (coach.phone) coach.phone.visible = distracted;
      }

      // 精力足的时候总监是跑着去的，脚下冒烟；累了就慢慢走，不冒烟
      if (d.leg && sdt > 0 && s.director.energy > 65) {
        puffT -= sdt;
        if (puffT <= 0) {
          puffT = 0.08;
          spawnPuff(you.pos.x, you.pos.z);
        }
      }
      updatePuffs(sdt);
      // 在现场忙的时候：比划、说话、指点
      if (d.task?.phase === 'working' && sdt > 0) {
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

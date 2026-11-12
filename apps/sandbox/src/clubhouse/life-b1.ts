// 负一层（健身房 + 后场）的演出 + 总监的活（stage 3）。互动点在 play-b1.ts；这里是 NPC 和信号的状态机（看图模式也照样转）。
// 接口见 stage3.ts（FloorEnv / FloorModule）和 walker.ts；规矩见 docs/lab/2026-11-07-3d-pixel/clubhouse.md「stage 3 的框架」。
//
// ── 演出 ──
//   来健身的人（7 个：摆好的跑步 / 单车 / 划船 / 打沙袋 / 深蹲 5 个 + 2 个新来的）一圈一圈地过：
//     在器械上练 45～95 秒 → 下来 → 前台把毛巾扔进脏筐 → 走（上楼梯出正门，或者进更衣室）→ 过一会儿回来 →
//     前台签到（前台递一条毛巾：台面上那摞少一条）→ 挑一台空着的器械（跑步机 ×3、单车 ×3、划船机 ×2、沙袋、深蹲架 ×2、
//     团课房的两张垫子、拉伸垫）→ 接着练。器械用不了了（跑步机亮红灯、跳闸）就下来换一台。
//   人在器械上时不在导航上（器械是挡路的），所以 Walker 带的是一个看不见的"脚"（rig）：走路时人跟着脚；上了器械，脚停在器械边上
//     能站的那一点（总监走不穿），人自己挪到器械上。走了的人藏起来（houseViews = []），脚停在正门外 / 更衣室里不挡路的地方。
//   洗衣工：洗衣机闪灯（洗完了）→ 掏出来 → 叠 → 抱着一摞毛巾走 linen 路线去女更衣 → 换回脏的 → 回洗衣房塞进洗衣机（过一阵又闪灯）。
//   教练：领操一阵（coachLead）→ 歇一会儿；垫子上的人跟着教练的拍子。前台：平时站着，有人签到才弯腰递毛巾（deskServe 一遍）。
//
// ── 信号 → 总监的活（7 个；每个：idle → signal → 干完 → cooldown → idle）──
//   treadmill  一台跑步机亮红灯（开局是 3 号，同摆好的样子；以后随机一台，上面的人下来）→ 按住修 3 秒
//   dumbbells  哑铃散在架前地上 → 按住收 2.5 秒            plates  杠铃片丢在片树脚下 → 按住挂回去 2 秒
//   towels     前台的干净毛巾发完了、脏筐冒尖（签到的人一条一条拿走的）→ 去洗衣房的毛巾车拿一摞（towel…）送到前台
//   water      饮水机的桶一格一格见底 → 去储藏的货架扛一桶（water-jug…）换上
//   breaker    配电柜跳闸：三台跑步机的屏全灭、上面的人下来、洗衣机的灯不闪 → 按住合闸 1.5 秒
//   ice        冰浴桶的冰化了 → 二楼后厨拿冰（ice-bucket…，2F 的 agent 给货源）倒进去
//   定时的信号（除了 towels / water）同时最多亮 3 个；没人管就一直亮着，别的照常（准则 5）。
//   没做：卧推凳的汗（凳子上一直躺着人）、洗衣机闪灯（留给洗衣工当演出）。
//   调试：debug.jobs() → { id, state }[]、debug.force(id) 马上亮、debug.clear(id) 当作总监干完了、debug.members()、debug.stations()。
import * as THREE from 'three';
import type { Anchor, Play } from '../clubsite/play';
import { FLOOR_Y } from './layout';
import { attachB1Play, towelStack } from './play-b1';
import { type P3, ROUTES } from './routes';
import type { FloorEnv, FloorModule } from './stage3';
import type { Co, Walker } from './walker';

const F = FLOOR_Y[-1];
const N = Math.PI;

export type JobId = 'treadmill' | 'dumbbells' | 'plates' | 'towels' | 'water' | 'breaker' | 'ice';
export type JobState = 'idle' | 'signal' | 'cooldown';
export const JOB_IDS: JobId[] = ['treadmill', 'dumbbells', 'plates', 'towels', 'water', 'breaker', 'ice'];
interface Job {
  id: JobId;
  state: JobState;
  /** idle：再过多久亮（Infinity = 不按时间：towels / water）；cooldown：再过多久回 idle */
  t: number;
  /** 干完过几次 */
  count: number;
}
/** 定时的信号：[第一次最早, 第一次最晚, 以后最早, 以后最晚]（秒）；cooldown 另算 */
const TIMING: Partial<Record<JobId, [number, number, number, number]>> = {
  treadmill: [0, 0, 70, 130],
  dumbbells: [20, 40, 70, 130],
  plates: [50, 80, 80, 140],
  ice: [70, 110, 100, 160],
  breaker: [100, 160, 120, 200],
};
const COOLDOWN = 30;
/** 定时的信号同时最多亮几个 */
const MAX_UP = 3;
/** 饮水机：一格水喝多久 */
const WATER_STEP: [number, number] = [28, 46];

/** play-b1.ts 用的接口 */
export interface B1Api {
  env: FloorEnv;
  state(id: JobId): JobState;
  /** 马上亮（调试 / 测试） */
  force(id: JobId): void;
  /** 总监干完了：信号灭、小回报；不在亮着 = false */
  done(id: JobId): boolean;
  /** 亮红灯的是第几台跑步机（0…2；没有 = −1） */
  faulty(): number;
  /** 按住的活的进度 0…1（play 写，调试看） */
  progress: Partial<Record<JobId, number>>;
  /** 东西在哪（世界 x、z） */
  points: {
    treadmills: [number, number][];
    dumbbells: [number, number];
    plates: [number, number];
    desk: [number, number];
    water: [number, number];
    panel: [number, number];
    iceBath: [number, number];
    cart: [number, number];
    shelves: [number, number];
    firewood: [number, number];
  };
  /** play 挂上来的：气泡 / 提示（看图模式是空的） */
  hooks: {
    say?(a: Anchor, text: string, sec?: number): void;
    toast?(text: string): void;
    bubble?(key: string, a: Anchor | null, text?: string): void;
  };
}

interface Station {
  id: string;
  /** 人在器械上的位置、朝向 */
  at: [number, number];
  yaw: number;
  pose: string;
  /** 器械边上能站的点（脚停在这） */
  park: [number, number];
  user: Member | null;
  /** 哪台跑步机（0…2） */
  tm?: number;
  /** 团课房的垫子（跟着教练的拍子） */
  mat?: boolean;
}
interface Member {
  id: string;
  person: THREE.Object3D;
  rig: THREE.Object3D;
  w: Walker;
  st: Station | null;
  /** 人在器械上（或者正在上 / 下）：不跟着脚 */
  mounted: boolean;
  away: boolean;
  /** 从哪走的：楼梯（正门）/ 男更衣 / 女更衣 */
  via: 'stairs' | 'lockerM' | 'lockerW';
  what: string;
  last: string;
  /** 走了几趟（回来签到的次数） */
  visits: number;
  co: Co;
}

const xz = (o: THREE.Object3D | null, x: number, z: number): [number, number] =>
  o ? [o.position.x, o.position.z] : [x, z];
const call = (o: THREE.Object3D | null, fn: string, ...a: unknown[]) =>
  (o?.userData[fn] as ((...a: unknown[]) => unknown) | undefined)?.(...a);
const poseOf = (o: THREE.Object3D | null, name: string, phase?: number) => call(o, 'pose', name, phase);

export function createFloorLife(env: FloorEnv): FloorModule {
  const rnd = env.rng('b1-life');
  const between = (a: number, b: number) => a + (b - a) * rnd();
  const free = (x: number, z: number, r = 1.2): [number, number] => env.nav.nearestFree(x, z, r) ?? [x, z];
  const pB = (p: readonly [number, number]): P3 => [p[0], p[1], F];
  const hooks: B1Api['hooks'] = {};
  let now = 0;

  // ── 摆好的东西 ──
  const tms = [1, 2, 3].map((i) => env.slot(`gym-treadmill-${i}`));
  const dumbbells = env.slot('gym-dumbbell-rack');
  const plates = env.slot('gym-plate-tree');
  const desk = env.slot('gym-desk');
  const water = env.slot('gym-water');
  const panel = env.slot('gym-panel');
  const iceBath = env.slot('gym-ice-bath');
  const blink = env.slot('gym-wash-blink');
  const clerk = env.slot('gym-desk-clerk');
  const coach = env.slot('gym-coach');
  const patient = env.slot('gym-patient');
  const points: B1Api['points'] = {
    treadmills: [xz(tms[0], -55.0, -8.2), xz(tms[1], -53.85, -8.2), xz(tms[2], -52.7, -8.2)],
    dumbbells: xz(dumbbells, -56.3, -41.3),
    plates: xz(plates, -60.15, -37.6),
    desk: xz(desk, -51.8, -21.2),
    water: xz(water, -46.85, -23.2),
    panel: xz(panel, -45.1, -34.95),
    iceBath: xz(iceBath, -55.0, -18.6),
    cart: xz(env.slot('gym-towel-cart'), -41.2, -37.0),
    shelves: xz(env.slot('gym-store-shelves'), -44.75, -30.5),
    firewood: xz(env.slot('gym-firewood-kegs'), -41.4, -30.35),
  };

  // ── 信号的状态 ──
  const jobs = {} as Record<JobId, Job>;
  for (const id of JOB_IDS) {
    const tm = TIMING[id];
    jobs[id] = { id, state: 'idle', t: tm ? between(tm[0], tm[1]) : Infinity, count: 0 };
  }
  /** 亮红灯的跑步机（−1 = 都好的） */
  let fault = -1;
  let power = true;
  /** 前台台面上的干净毛巾（0…3） */
  let stack = 3;
  /** 饮水机的水（0…2）和下一格什么时候喝完 */
  let level = 2;
  let drink = between(...WATER_STEP);
  /** 洗衣机洗完了（闪灯）；washT = 再洗多久（< 0 = 没在洗） */
  let washDone = true;
  let washT = -1;

  const showTreadmills = () => {
    tms.forEach((o, i) => {
      call(o, 'setFault', i === fault);
      call(o, 'setPower', power);
    });
  };
  const showTowels = () => {
    call(desk, 'setStack', stack);
    call(desk, 'setBin', jobs.towels.state === 'signal');
    hooks.bubble?.('towels', jobs.towels.state === 'signal' ? clerk : null, '毛巾发完了');
  };
  const showBlink = () => call(blink, 'setActive', washDone && power);
  const showAll = () => {
    showTreadmills();
    call(dumbbells, 'setLoose', jobs.dumbbells.state === 'signal');
    call(plates, 'setLoose', jobs.plates.state === 'signal');
    showTowels();
    call(water, 'setLevel', level);
    call(panel, 'setTripped', !power);
    call(iceBath, 'setMelted', jobs.ice.state === 'signal');
    showBlink();
  };

  /** 信号亮起来 */
  function raise(id: JobId) {
    const j = jobs[id];
    if (j.state === 'signal') return;
    j.state = 'signal';
    j.t = 0;
    if (id === 'treadmill') {
      // 挑一台：一半的时候挑有人在跑的（他会下来）
      const used = stations.filter((s) => s.tm !== undefined && s.user).map((s) => s.tm as number);
      fault = used.length && rnd() < 0.5 ? used[Math.floor(rnd() * used.length)] : Math.floor(rnd() * 3);
    } else if (id === 'breaker') power = false;
    else if (id === 'towels') stack = 0;
    else if (id === 'water') level = 0;
    showAll();
  }
  /** 总监干完了 */
  function done(id: JobId): boolean {
    const j = jobs[id];
    if (j.state !== 'signal') return false;
    j.state = 'cooldown';
    j.t = COOLDOWN;
    j.count++;
    if (id === 'treadmill') {
      fault = -1;
      hooks.toast?.('跑步机修好了 ✓');
    } else if (id === 'breaker') {
      power = true;
      hooks.toast?.('合上闸了：来电 ✓');
    } else if (id === 'towels') {
      stack = 3;
      hooks.toast?.('干净毛巾补上了 ✓');
      if (clerk) hooks.say?.(clerk, '谢谢！', 2);
    } else if (id === 'water') {
      level = 2;
      drink = between(...WATER_STEP);
      hooks.toast?.('饮水机换好桶了 ✓');
    } else if (id === 'ice') {
      hooks.toast?.('冰浴桶加满冰了 ✓');
      if (patient) hooks.say?.(patient, '嘶——舒服', 2.5);
    } else if (id === 'dumbbells') hooks.toast?.('哑铃归位 ✓');
    else if (id === 'plates') hooks.toast?.('杠铃片挂好了 ✓');
    showAll();
    return true;
  }
  function stepJobs(dt: number) {
    let up = 0;
    for (const id of JOB_IDS) if (TIMING[id] && jobs[id].state === 'signal') up++;
    for (const id of JOB_IDS) {
      const j = jobs[id];
      if (j.state === 'signal') continue;
      if (j.state === 'cooldown') {
        j.t -= dt;
        if (j.t <= 0) {
          const tm = TIMING[id];
          j.state = 'idle';
          j.t = tm ? between(tm[2], tm[3]) : Infinity;
        }
        continue;
      }
      if (j.t === Infinity || up >= MAX_UP) continue;
      j.t -= dt;
      if (j.t <= 0) {
        raise(id);
        up++;
      }
    }
    // 饮水机：一格一格喝掉，见底 = 信号
    if (jobs.water.state === 'idle' && level > 0) {
      drink -= dt;
      if (drink <= 0) {
        level--;
        drink = between(...WATER_STEP);
        if (level === 0) raise('water');
        else call(water, 'setLevel', level);
      }
    }
    // 洗衣机：洗完了闪灯（等洗衣工来掏）
    if (washT >= 0) {
      washT -= dt;
      if (washT < 0) {
        washDone = true;
        showBlink();
      }
    }
  }

  // ── 器械 ──
  const stations: Station[] = [];
  const station = (id: string, pose: string, at: [number, number], yaw: number, hint: [number, number], more = {}) => {
    const st: Station = { id, pose, at, yaw, park: free(at[0] + hint[0], at[1] + hint[1]), user: null, ...more };
    stations.push(st);
    return st;
  };
  points.treadmills.forEach(([x, z], i) => {
    station(`treadmill-${i + 1}`, 'run', [x, z - 0.2], 0, [0, -1.2], { tm: i });
  });
  const bikes = xz(env.slot('gym-bikes'), -57.6, -8.3);
  for (const [k, dx] of [-0.95, 0, 0.95].entries())
    station(`bike-${k + 1}`, 'cycle', [bikes[0] + dx, bikes[1] - 0.27], 0, [0, -0.95]);
  const rowers = xz(env.slot('gym-rowers'), -51.3, -8.3);
  for (const [k, dx] of [-0.4, 0.4].entries())
    station(`rower-${k + 1}`, 'row', [rowers[0] + dx, rowers[1] - 0.3], 0, [0, -1.3]);
  const bags = xz(env.slot('gym-bag-rack'), -56.8, -11.4);
  station('bag', 'punch', [bags[0], bags[1] + 0.8], N, [0, 0]);
  for (const k of [1, 2]) {
    const r = xz(env.slot(`gym-rack-${k}`), k === 1 ? -61.4 : -58.9, -39.9);
    station(`rack-${k}`, 'squat', [r[0], r[1] + 0.1], 0, [0, 1.3]);
  }
  const mats = xz(env.slot('gym-mats'), -56.6, -28.4);
  station('mat-1', 'coachLead', [mats[0] - 0.52, mats[1] - 0.855], N, [0, 0], { mat: true });
  station('mat-2', 'coachLead', [mats[0] + 0.52, mats[1] + 0.855], N, [0, 0], { mat: true });
  const smats = xz(env.slot('gym-stretch-mats'), -58.0, -18.1);
  station('stretch', 'stretch', smats, 0, [0, 0]);
  const usable = (st: Station) => st.tm === undefined || (power && st.tm !== fault);

  // ── 教练的课 ──
  let classOn = true;
  let classT = between(40, 70);
  /** 摆好的教练从 phase 0.4 开始循环 */
  let classStart = -0.4 * 1.6;
  const classPhase = () => ((now - classStart) / 1.6) % 1;
  function stepClass(dt: number) {
    classT -= dt;
    if (classT > 0) return;
    classOn = !classOn;
    classT = classOn ? between(45, 75) : between(10, 18);
    classStart = now;
    poseOf(coach, classOn ? 'coachLead' : 'idle', classOn ? 0 : undefined);
    for (const st of stations)
      if (st.mat && st.user?.mounted && st.user.what === 'exercise') setStationPose(st.user, st);
  }
  const setStationPose = (m: Member, st: Station) => {
    if (st.mat) poseOf(m.person, classOn ? 'coachLead' : 'idle', classOn ? classPhase() : undefined);
    else poseOf(m.person, st.pose);
  };

  // ── 前台 ──
  let serveT = 0;
  const deskSpots = [0.1, -0.9, 0.9].map((dx) => ({
    at: free(points.desk[0] + dx, points.desk[1] + 0.9, 0.6),
    by: null as Member | null,
  }));
  /** 脏毛巾筐前面 */
  const binSpot = free(points.desk[0] + 1.4, points.desk[1] + 0.9, 0.6);
  function serve() {
    serveT = 3.5;
    poseOf(clerk, 'deskServe', 0);
  }

  // ── 来健身的人 ──
  const members: Member[] = [];
  const stats = { teleports: 0, checkins: 0, aborted: 0 };
  const downRoute = (ROUTES.find((r) => r.id === 'gymGoer')?.pts ?? []).slice(0, 14);
  const upRoute = [...downRoute].reverse();
  /** 走了的人的脚停在哪（不挡路的地方） */
  const HIDE = {
    stairs: [
      [-43.3, -21.1],
      [-43.3, -20.1],
      [-43.3, -22.1],
      [-44.1, -19.5],
      [-44.1, -22.5],
      [-44.1, -18.1],
      [-44.1, -24.1],
    ],
    lockerM: [
      [-50.7, -13.1],
      [-50.7, -13.9],
    ],
    lockerW: [
      [-46.9, -13.1],
      [-46.9, -12.9],
    ],
  } as const;
  const hideAt = (m: Member): P3 => {
    const list = HIDE[m.via];
    const p = list[members.indexOf(m) % list.length];
    return m.via === 'stairs' ? [p[0], p[1], 0] : [p[0], p[1], F];
  };
  const NONE: string[] = [];
  function hide(m: Member) {
    m.away = true;
    m.rig.userData.houseViews = NONE;
    m.rig.visible = false;
    m.person.userData.houseViews = NONE;
    m.person.visible = false;
  }
  /** 人跟着脚（位置、朝向、在哪几种看法里显示） */
  function follow(m: Member) {
    if (m.away) return;
    const p = m.person;
    const vs = m.rig.userData.houseViews as string[] | undefined;
    p.userData.houseViews = vs;
    p.visible = !vs || vs.includes(env.view());
    // 在器械上：脚（停在器械边的过道上）不挡总监的路（框架只登记看得见的 Walker）—— 有氧区北边的过道只有 1 米宽
    m.rig.visible = !m.mounted && p.visible;
    if (m.mounted) return;
    p.position.copy(m.rig.position);
    p.rotation.y = m.rig.rotation.y;
  }
  function* wait(sec: number): Co {
    let t = 0;
    while (t < sec) t += yield;
  }
  /** 走到一个点（导航找路）；找不到路 = 直接放过去（记一笔，测试守着是 0） */
  function* goTo(m: Member, to: readonly [number, number]): Co {
    yield* m.w.goTo(pB(to));
    if (Math.hypot(m.w.x - to[0], m.w.z - to[1]) > 0.4) {
      stats.teleports++;
      m.w.place(pB(to));
    }
  }
  /** 人从脚的位置挪到 (x, z)（上 / 下器械的那一步） */
  function* slide(m: Member, x: number, z: number, sec = 0.35): Co {
    const p = m.person.position;
    const x0 = p.x;
    const z0 = p.z;
    if (Math.hypot(x - x0, z - z0) > 0.02) m.person.rotation.y = Math.atan2(x - x0, z - z0);
    let t = 0;
    while (t < sec) {
      t += yield;
      const k = Math.min(1, t / sec);
      p.x = x0 + (x - x0) * k;
      p.z = z0 + (z - z0) * k;
      poseOf(m.person, 'walk', (k * 0.5) % 1);
    }
  }
  function* mount(m: Member, st: Station): Co {
    m.mounted = true;
    yield* slide(m, st.at[0], st.at[1]);
    m.person.rotation.y = st.yaw;
    setStationPose(m, st);
  }
  function* dismount(m: Member): Co {
    const st = m.st;
    poseOf(m.person, 'idle');
    yield* slide(m, m.rig.position.x, m.rig.position.z);
    m.mounted = false;
    if (st) st.user = null;
    m.st = null;
  }
  /** 在器械上练 sec 秒；器械用不了了就提前下来（返回 false） */
  function* exercise(m: Member, sec: number): Co {
    const st = m.st;
    m.what = 'exercise';
    let t = 0;
    while (t < sec && st && usable(st)) t += yield;
    if (st && !usable(st)) {
      stats.aborted++;
      hooks.say?.(m.person, power ? '跑步机坏了！' : '停电了？', 2.2);
      m.last = `!${st.id}`;
    }
  }
  function pick(m: Member): Station | null {
    const open = stations.filter((s) => !s.user && usable(s) && s.id !== m.last && (!s.mat || classOn));
    if (!open.length) return null;
    const st = open[Math.floor(rnd() * open.length)];
    st.user = m;
    m.st = st;
    m.last = st.id;
    return st;
  }
  function* useStation(m: Member, st: Station): Co {
    m.what = `to ${st.id}`;
    yield* goTo(m, st.park);
    if (!usable(st)) {
      // 走到跟前才发现用不了
      st.user = null;
      m.st = null;
      return;
    }
    yield* mount(m, st);
    yield* exercise(m, between(45, 95));
    yield* dismount(m);
  }
  function* atDesk(m: Member, act: (spot: [number, number]) => Co): Co {
    let spot = deskSpots.find((s) => !s.by);
    while (!spot) {
      yield* wait(1);
      spot = deskSpots.find((s) => !s.by);
    }
    spot.by = m;
    yield* goTo(m, spot.at);
    yield* m.w.face(spot.at[0], points.desk[1]);
    yield* act(spot.at);
    spot.by = null;
  }
  function* leave(m: Member): Co {
    m.what = 'leave';
    // 毛巾扔进脏筐
    yield* goTo(m, binSpot);
    yield* m.w.face(binSpot[0], points.desk[1]);
    yield* m.w.act('pickup', 0.5);
    m.via = rnd() < 0.45 ? 'stairs' : rnd() < 0.5 ? 'lockerM' : 'lockerW';
    if (m.via === 'stairs' && upRoute.length) {
      yield* m.w.go(upRoute);
      hide(m);
      m.w.place(hideAt(m));
      hide(m);
    } else {
      const h = hideAt(m);
      yield* goTo(m, [h[0], h[1]]);
      hide(m);
    }
    m.what = 'away';
  }
  function* arrive(m: Member): Co {
    m.what = 'arrive';
    // 从藏着的地方出来（place 重新打 houseViews）
    m.w.place(hideAt(m), m.via === 'stairs' ? -Math.PI / 2 : 0);
    m.away = false;
    follow(m);
    poseOf(m.person, 'idle');
    if (m.via === 'stairs' && downRoute.length) yield* m.w.go(downRoute);
    m.visits++;
    yield* atDesk(m, function* () {
      stats.checkins++;
      // 前台递毛巾（有的人自己带了）；递完最后一条 = 信号
      if (stack > 0 && rnd() < 0.6) {
        serve();
        yield* wait(1.6);
        yield* m.w.act('pickup', 0.5);
        stack--;
        if (stack === 0) raise('towels');
        else showTowels();
        yield* wait(0.6);
      } else yield* wait(1.2);
    });
  }
  /** 挑一台空着的器械去练（没有空的：等几次，还没有就算了） */
  function* work(m: Member): Co {
    let st = pick(m);
    for (let tries = 0; !st && tries < 4; tries++) {
      m.what = 'waiting';
      yield* wait(3);
      st = pick(m);
    }
    if (st) yield* useStation(m, st);
    else m.last = '';
  }
  function* memberLife(m: Member, first: number): Co {
    if (m.st) {
      yield* exercise(m, first);
      yield* dismount(m);
    } else {
      yield* wait(first);
      yield* arrive(m);
      yield* work(m);
    }
    while (true) {
      // 器械坏了下来的：直接换一台；别的：走了，过一会儿再来
      if (!m.last.startsWith('!')) {
        yield* leave(m);
        yield* wait(between(10, 26));
        yield* arrive(m);
      }
      yield* work(m);
    }
  }
  function addMember(id: string, person: THREE.Object3D, st: Station | null, first: number) {
    const rig = env.add(new THREE.Group());
    rig.name = `b1-rig:${id}`;
    rig.userData.pose = (n: string, ph?: number) => poseOf(person, n, ph);
    const m: Member = {
      id,
      person,
      rig,
      w: null as unknown as Walker,
      st,
      mounted: !!st,
      away: false,
      via: 'stairs',
      what: st ? 'exercise' : 'away',
      last: st?.id ?? '',
      visits: 0,
      co: null as unknown as Co,
    };
    if (st) {
      // 摆好的人：原地不动（姿势照旧循环着），器械的位置按他站的地方
      st.at = [person.position.x, person.position.z];
      st.yaw = person.rotation.y;
      st.user = m;
      rig.position.set(st.park[0], F, st.park[1]);
    } else rig.position.set(HIDE.stairs[0][0], 0, HIDE.stairs[0][1]);
    m.w = env.walker(rig);
    members.push(m);
    if (!st) {
      m.w.place(hideAt(m));
      hide(m);
    }
    m.co = memberLife(m, first);
  }
  const byId = (id: string) => stations.find((s) => s.id === id) ?? null;
  const placed: [string, string, number][] = [
    ['gym-boxer', 'bag', between(14, 24)],
    ['gym-runner', 'treadmill-2', between(40, 55)],
    ['gym-rower', 'rower-1', between(70, 85)],
    ['gym-cyclist', 'bike-2', between(100, 115)],
    ['gym-squatter', 'rack-1', between(128, 140)],
  ];
  for (const [slot, st, first] of placed) {
    const person = env.slot(slot);
    if (person) addMember(slot.replace('gym-', ''), person, byId(st), first);
  }
  for (const [k, first] of [between(3, 6), between(28, 36)].entries()) {
    const person = env.add(env.make('player', k === 0 ? 2 : 1));
    call(person, 'setProp', null);
    addMember(`goer-${k + 1}`, person, null, first);
  }

  // ── 洗衣工 ──
  const laundry = env.slot('gym-laundry');
  const linen = ROUTES.find((r) => r.id === 'linen')?.pts ?? [];
  let worker: Walker | null = null;
  const bundle = towelStack(env.ctxFor(0));
  bundle.visible = false;
  if (laundry && linen.length) {
    const home: [number, number] = [laundry.position.x, laundry.position.z];
    const washer = free(home[0], home[1] - 0.8, 0.6);
    const out = [...linen].reverse();
    try {
      call(laundry, 'hold', bundle, bundle.userData.grip);
    } catch {
      // 拿不上就空着手走
    }
    bundle.visible = false;
    worker = env.walker(laundry, { speed: 1.1 });
    worker.run(function* (w) {
      while (true) {
        if (washDone) {
          // 洗完了：掏出来
          yield* w.goTo(pB(washer));
          yield* w.face(washer[0], washer[1] - 1);
          yield* w.act('pickup', 1.5, { loop: true });
          washDone = false;
          showBlink();
          bundle.visible = true;
          yield* w.goTo(pB(home));
        }
        // 叠毛巾（叠衣台在南边）
        yield* w.face(home[0], home[1] + 1);
        yield* w.act('pickup', between(3, 5), { loop: true });
        bundle.visible = true;
        // 干净的送去女更衣，换回脏的
        yield* w.go(out);
        yield* w.act('pickup', 0.6);
        yield* w.wait(between(1.5, 3));
        yield* w.go(linen);
        // 塞进洗衣机
        yield* w.goTo(pB(washer));
        yield* w.face(washer[0], washer[1] - 1);
        yield* w.act('pickup', 1.2, { loop: true });
        bundle.visible = false;
        washT = between(22, 40);
        yield* w.goTo(pB(home));
        yield* w.face(home[0], home[1] + 1);
        yield* w.wait(between(4, 9));
      }
    });
  }

  // ── 开局：只有 3 号跑步机亮着红灯（摆好的样子），别的信号都还没出 ──
  poseOf(clerk, 'idle');
  jobs.treadmill.state = 'signal';
  fault = 2;
  showAll();

  const api: B1Api = {
    env,
    state: (id) => jobs[id].state,
    force: raise,
    done,
    faulty: () => fault,
    progress: {},
    points,
    hooks,
  };

  return {
    update(dt, t) {
      now = t;
      stepJobs(dt);
      stepClass(dt);
      if (serveT > 0) {
        serveT -= dt;
        if (serveT <= 0) poseOf(clerk, 'idle');
      }
      for (const m of members) {
        m.co.next(dt);
        follow(m);
      }
    },
    attach(play: Play) {
      const r = attachB1Play(play, api);
      showTowels();
      return r;
    },
    debug: {
      api,
      jobs: () => JOB_IDS.map((id) => ({ id, state: jobs[id].state, t: jobs[id].t, count: jobs[id].count })),
      force: (id: JobId) => raise(id),
      clear: (id: JobId) => done(id),
      members: () =>
        members.map((m) => ({
          id: m.id,
          what: m.what,
          station: m.st?.id ?? null,
          away: m.away,
          visits: m.visits,
          x: m.person.position.x,
          z: m.person.position.z,
          walker: m.w,
          person: m.person,
        })),
      stations: () => stations.map((s) => ({ id: s.id, user: s.user?.id ?? null, usable: usable(s), park: s.park })),
      state: () => ({ fault, power, stack, level, washDone, classOn }),
      stats,
      worker: () => worker,
    },
  };
}

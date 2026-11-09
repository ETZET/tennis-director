// clubdesk 的日常（演出，没有模拟）：会员从门外进来 → 沿石板引导道排队 → 柜台转角签到（铃 + 对勾）+ 从台面上递一条毛巾 →
// 自助水站接一杯水 → 小路往下、草坪边往西出画。clubdesk.md「玩法计划」。
//
// 排队：一条折线 QUEUE_LINE（柜台转角的签到位 → 引导道 → 门洞 → 门外落客区 → 车道南沿往东到画外），每个会员在线上有一个
// 弧长 s（0 = 签到位）；排在第 i 个的目标是 s = i·1.25 米，走到了就站着（idle），前面的人走了整队往前挪一位。
// 新来的会员从画外（车道东头）沿这条线走进来，排到队尾 —— 门外的会员就是 clubpark 那边下车的人：进门时刻照 clubpark 的
// GATE_TIMING（两个场景在大门交接，各自的页面独立跑，时间表一样），另外每轮还有几个走路来的（种子随机的时刻）。
// 出门的会员（clubpark 那边取车的人，GATE_TIMING.outAt）从长廊西头走过来，出大门、沿车道北沿往东，进北停车场出画。
//
// 签到 = 一下：总监站在柜台转角里（deskStand）→ 按铃 → 会员头上冒对勾 → 台面那叠毛巾少一条（setTowels），一条毛巾飞过柜台
// 搭到会员肩上。台面上没毛巾了：签过到的会员站着等（"毛巾？"），总监去毛巾车拿一摞（3 条）放回台面（或直接递给他）。
// 水站：每人接一杯掉一档（setLevel），空了会员皱眉走过（"没水了…"）；总监从员工口出来换桶（2 秒）。
// 总监不在柜台：队伍越排越长；签到位上的人等久了自己按铃（ding()），队尾的人原地跺脚（rig 的 ready 姿势）冒"排好长…"。
//
// 玩法模式（play.ts 的 clubsite/play）：总监归玩家，这里用 attachPlay(play) 登记互动点（同 id 替换 play.ts 的样板）：
//   desk-serve 签到 · towel-cart 拿毛巾 · desk-handover 放毛巾/递毛巾 · water-swap 换水桶；顶栏：队伍、台面毛巾、水、已签到。
// 只看模式（?play=0）：总监由这里演（签到、去毛巾车拿毛巾、去换水桶）。?life=0 = 白模定格（main 不建 life）。
// 随机只用种子随机流（ctx.rng('desk:life')）。
import * as THREE from 'three';
import { GATE_TIMING, LOOP } from '../clubpark/layout';
import { director as clubDirector } from '../clubsite/people';
import type { Play } from '../clubsite/play';
import type { BaseCtx as D3Ctx } from '../clubsite/render/ctx';
import type { AssetCtx } from './ctx';
import { COUNTER, SPOTS, type V2 } from './layout';
import { buildTowel } from './play';

type Co = Generator<void, void, number>;
const P = Math.PI;
const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
const turnTo = (a: number, b: number, k: number) => {
  let d = b - a;
  d -= Math.round(d / (P * 2)) * P * 2;
  return a + d * Math.min(1, k);
};
const yawOf = (dx: number, dz: number) => Math.atan2(dx, dz);

/** 排队的线：签到位 → 引导道（queue1..3）→ 门洞 → 门外 → 车道南沿往东（画外） */
const QUEUE_LINE: V2[] = [
  SPOTS.serve,
  SPOTS.queue1,
  SPOTS.queue2,
  SPOTS.queue3,
  [58.9, 3.6],
  SPOTS.gateIn,
  [61.2, 0.5],
  SPOTS.gateOut,
  [66.0, 1.6],
  [72.0, 3.6],
  [82.0, 3.6],
];
/** 排队间距（米） */
const GAP = 1.25;
/** 走路速度（米/秒） */
const WALK = 1.3;
/** 签完到以后：柜台南边 → 水站 → 小路 → 草坪边往西出画 */
const TO_WATER: V2[] = [[57.0, 10.2], [55.4, 10.55], SPOTS.water];
const TO_EXIT: V2[] = [SPOTS.pathTop, SPOTS.lawnPath, [48.0, 16.0], SPOTS.exitWest, [12.0, 16.0]];
/** 出门的会员：长廊西头 → 门洞（排队那条线的南边）→ 车道北沿往东 → 北停车场（画外） */
const OUT_ROUTE: V2[] = [
  [40.0, -6.5],
  [52.5, -6.4],
  [57.4, -2.6],
  [59.5, -1.6],
  [62.0, -1.0],
  [66.0, -3.5],
  [77.4, -3.6],
  [77.4, -26.0],
];
/** 每轮走路来的会员（clubpark 来的之外）：[进门时刻（秒，再加 0～2 秒抖动）, 几个人一起（前后差 1.4 秒）] */
const WALK_INS: [number, number][] = [
  [5, 2],
  [33, 3],
  [48, 1],
  [72, 2],
];
/** 台面毛巾最多几条 */
const STACK_MAX = 5;
/** 毛巾车一次拿几条 */
const ARMFUL = 3;

interface Path {
  pts: V2[];
  cum: number[];
  len: number;
}
function mkPath(pts: V2[]): Path {
  const cum = [0];
  for (let i = 1; i < pts.length; i++)
    cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, cum, len: cum[cum.length - 1] };
}
function pathAt(p: Path, s: number): V2 {
  s = clamp(s, 0, p.len);
  let i = 1;
  while (i < p.cum.length - 1 && p.cum[i] < s) i++;
  const k = (s - p.cum[i - 1]) / Math.max(1e-6, p.cum[i] - p.cum[i - 1]);
  return [lerp(p.pts[i - 1][0], p.pts[i][0], k), lerp(p.pts[i - 1][1], p.pts[i][1], k)];
}
const LINE = mkPath(QUEUE_LINE);
/** 从画外走到门洞要多久（进门时刻往前推这么多秒出现） */
const GATE_S = LINE.cum[5];
const WALK_TO_GATE = (LINE.len - GATE_S) / WALK;

interface Person {
  obj: THREE.Object3D;
  x: number;
  z: number;
  yaw: number;
  ph: number;
  posed: string;
}
interface Member extends Person {
  state: 'queue' | 'serve' | 'after' | 'out';
  /** 排队线上的弧长 */
  s: number;
  checked: boolean;
  hasTowel: boolean;
  waitT: number;
  /** 搭在肩上的毛巾 */
  towel: THREE.Object3D | null;
  /** 下一次扭头看黑板 / 跺脚的时刻 */
  fidget: number;
}

export interface DeskLife {
  update(dt: number): void;
  /** 玩法模式：登记互动点、顶栏、气泡 */
  attachPlay(play: Play): void;
  stats(): { queue: number; towels: number; water: number; served: number; cart: number };
  /** 截图诊断 */
  debug(): unknown;
}

export interface DeskLifeOpts {
  ctx: AssetCtx;
  scene: THREE.Object3D;
  make(asset: string, variant: number): THREE.Object3D;
  groundAt(x: number, z: number): number;
  /** 玩法模式（总监归玩家；这里不演他） */
  play: boolean;
  /** 大世界（clubwalk）：共用的总监，用它，不换 slot:director、不自己建 */
  director?: THREE.Object3D;
}

export function createDeskLife(o: DeskLifeOpts): DeskLife {
  const { ctx, scene } = o;
  const rnd = ctx.rng('desk:life');
  const find = (id: string) => scene.getObjectByName(`slot:${id}`);
  let now = 0;
  let play: Play | null = null;

  // ── 物件 ──
  const counter = find('desk-counter');
  const cart = find('towel-cart');
  const station = find('water-station');
  const board = find('checkin-board');
  const local = (obj: THREE.Object3D | undefined, p: readonly number[] | undefined, fb: [number, number, number]) => {
    if (!obj || !p) return new THREE.Vector3(...fb);
    obj.updateMatrixWorld(true);
    return obj.localToWorld(new THREE.Vector3(p[0], p[1], p[2]));
  };
  const cspots = counter?.userData.spots as
    | { handover: number[]; bell: number[]; towels: number[]; towelH: number }
    | undefined;
  const BELL = local(counter, cspots?.bell, [56.3, 1.2, 9.0]);
  const STACK = local(counter, cspots?.towels, [55.6, 1.05, 9.4]);
  const towelH = cspots?.towelH ?? 0.08;
  const JUG = station
    ? new THREE.Vector3(station.position.x, 1.05, station.position.z)
    : new THREE.Vector3(53.4, 1, 10.55);
  const towels = () => (counter?.userData.towels?.() as number | undefined) ?? 0;
  const setTowels = (n: number) => counter?.userData.setTowels?.(clamp(n, 0, STACK_MAX));
  const stock = () => (cart?.userData.stock as number | undefined) ?? 9;
  const setStock = (n: number) => cart?.userData.setStock?.(clamp(n, 0, 9));
  const water = () => (station?.userData.level as number | undefined) ?? 1;
  const levels = (station?.userData.levels as number | undefined) ?? 6;
  const setWater = (l: number) => station?.userData.setLevel?.(l);
  setTowels(4);

  // ── 总监：换成 clubsite/people 的那个（play 的 hold() 要它）；play 在这之后建，拿到的是这个 ──
  const oldDir = o.director ? undefined : find('director');
  const dirObj = o.director ?? clubDirector(ctx as unknown as D3Ctx);
  if (o.director) {
    // 大世界：总监已经在场景里，由 play 管
  } else if (oldDir) {
    dirObj.position.copy(oldDir.position);
    dirObj.rotation.copy(oldDir.rotation);
    dirObj.name = oldDir.name;
    oldDir.parent?.remove(oldDir);
  } else {
    dirObj.position.set(SPOTS.deskStand[0], 0, SPOTS.deskStand[1]);
    dirObj.rotation.y = 1.25;
    dirObj.name = 'slot:director';
  }
  if (!o.director) {
    dirObj.userData.setProp?.(null);
    dirObj.userData.pose?.('idle');
    scene.add(dirObj);
  }
  const director: Person = {
    obj: dirObj,
    x: dirObj.position.x,
    z: dirObj.position.z,
    yaw: dirObj.rotation.y,
    ph: 0,
    posed: '',
  };

  // ── 会员：SLOTS 里摆好的那几个先拿来用，不够再建 ──
  const pool: Member[] = [];
  const members: Member[] = [];
  const mkMember = (obj: THREE.Object3D): Member => ({
    obj,
    x: 0,
    z: 0,
    yaw: 0,
    ph: 0,
    posed: '',
    state: 'queue',
    s: 0,
    checked: false,
    hasTowel: false,
    waitT: 0,
    towel: null,
    fidget: 0,
  });
  for (const id of ['member-serve', 'member-q1', 'member-q2', 'member-q3', 'member-in', 'member-out']) {
    const obj = find(id);
    if (!obj) continue;
    obj.visible = false;
    pool.push(mkMember(obj));
  }
  const place = (p: Person) => {
    p.obj.position.set(p.x, o.groundAt(p.x, p.z), p.z);
    p.obj.rotation.y = p.yaw;
  };
  const pose = (p: Person, name: string, ph?: number) => {
    if (ph === undefined) {
      if (p.posed === name) return;
      p.posed = name;
      p.obj.userData.pose?.(name);
    } else {
      p.posed = '';
      p.obj.userData.pose?.(name, ph);
    }
  };
  const say = (p: Person, text: string, sec = 2.2) => {
    play?.say(p.obj, text, sec);
  };
  const spawnMember = (x: number, z: number): Member => {
    let m = pool.pop();
    if (!m) {
      const obj = o.make('player', Math.floor(rnd() * 4));
      scene.add(obj);
      m = mkMember(obj);
    }
    Object.assign(m, { x, z, yaw: -P / 2, ph: rnd(), posed: '', checked: false, hasTowel: false, waitT: 0 });
    m.fidget = now + 3 + rnd() * 5;
    m.obj.visible = true;
    m.obj.userData.setProp?.(rnd() < 0.55 ? 'racket' : null);
    if (m.towel) {
      m.towel.parent?.remove(m.towel);
      m.towel = null;
    }
    members.push(m);
    place(m);
    return m;
  };
  const dropMember = (m: Member) => {
    m.obj.visible = false;
    members.splice(members.indexOf(m), 1);
    if (m.towel) m.towel.visible = false;
    pool.push(m);
  };

  // ── 协程 ──
  let live: Co[] = [];
  const spawn = (c: Co) => {
    if (!c.next(0).done) live.push(c);
  };
  function* wait(s: number): Co {
    let t = 0;
    while (t < s) t += yield;
  }
  /** 沿折线走；碰到总监挡路就停一下（1.2 秒以后侧身挤过去） */
  function* walk(p: Person, pts: V2[], speed = WALK, poseName = 'walk', stride = 1.25): Co {
    let held = 0;
    for (const t of pts) {
      while (true) {
        const dt = yield;
        const dx = t[0] - p.x;
        const dz = t[1] - p.z;
        const L = Math.hypot(dx, dz);
        if (L < 0.02) break;
        if (p !== director && blockedByDirector(p, dx / L, dz / L)) {
          held += dt;
          if (held < 1.2) {
            pose(p, 'idle');
            continue;
          }
        } else held = 0;
        const step = Math.min(L, speed * dt);
        p.x += (dx / L) * step;
        p.z += (dz / L) * step;
        p.yaw = turnTo(p.yaw, yawOf(dx, dz), dt * 10);
        p.ph = (p.ph + step / stride) % 1;
        pose(p, poseName, p.ph);
        place(p);
      }
    }
    pose(p, 'idle');
  }
  function* face(p: Person, yaw: number, s = 0.35): Co {
    let t = 0;
    while (t < s) {
      const dt = yield;
      t += dt;
      p.yaw = turnTo(p.yaw, yaw, dt * 9);
      place(p);
    }
  }
  function* act(p: Person, name: string, dur: number, at = 0.5, cb?: () => void): Co {
    let t = 0;
    let fired = false;
    while (t < dur) {
      const dt = yield;
      t += dt;
      const ph = Math.min(1, t / dur);
      if (cb && !fired && ph >= at) {
        fired = true;
        cb();
      }
      pose(p, name, ph);
    }
    if (cb && !fired) cb();
    pose(p, 'idle');
  }
  const dirXZ = (): V2 => (play ? [play.director.position.x, play.director.position.z] : [director.x, director.z]);
  const blockedByDirector = (p: Person, ux: number, uz: number) => {
    const [x, z] = dirXZ();
    const rx = x - p.x;
    const rz = z - p.z;
    const al = rx * ux + rz * uz;
    return al > 0 && al < 0.85 && Math.abs(rx * uz - rz * ux) < 0.55;
  };

  // ── 队伍 ──
  const queue = (): Member[] => members.filter((m) => m.state === 'queue' || m.state === 'serve');
  /** 总监在不在柜台转角里（能签到） */
  const atDesk = () => {
    const [x, z] = dirXZ();
    return x < COUNTER.east.x0 && Math.hypot(x - SPOTS.deskStand[0], z - SPOTS.deskStand[1]) < 0.9;
  };
  const stepQueue = (dt: number) => {
    const q = queue().sort((a, b) => a.s - b.s);
    let prevS = -GAP;
    q.forEach((m, i) => {
      const target = i * GAP;
      // 不追上前面的人（前面的人可能还在往前走）
      const want = Math.max(target, prevS + GAP * 0.85);
      if (m.s > want + 0.01) {
        const step = Math.min(m.s - want, WALK * dt);
        m.s -= step;
        const [x, z] = pathAt(LINE, m.s);
        const dx = x - m.x;
        const dz = z - m.z;
        if (Math.hypot(dx, dz) > 1e-4) m.yaw = turnTo(m.yaw, yawOf(dx, dz), dt * 10);
        m.x = x;
        m.z = z;
        m.ph = (m.ph + step / 1.25) % 1;
        pose(m, 'walk', m.ph);
        place(m);
      } else {
        // 站着：签到位上的侧身朝总监，排队的朝着前面的人（偶尔扭头看黑板、跺脚）
        if (i === 0 && m.s < 0.05) {
          m.state = 'serve';
          m.yaw = turnTo(m.yaw, -P / 2, dt * 6);
          if (m.posed !== 'ready') pose(m, 'idle');
        } else {
          const [ax, az] = pathAt(LINE, Math.max(0, m.s - 0.5));
          let yaw = yawOf(ax - m.x, az - m.z);
          if (board && now > m.fidget - 1.6 && now < m.fidget)
            yaw = yawOf(board.position.x - m.x, board.position.z - m.z);
          m.yaw = turnTo(m.yaw, yaw, dt * 5);
          // 队伍长了：队尾的人原地跺脚（ready 是球员的弹跳准备姿势），时不时冒一句
          if (i === q.length - 1 && q.length >= 5 && i > 0) {
            pose(m, 'ready');
            if (now > m.fidget) {
              m.fidget = now + 6 + rnd() * 4;
              say(m, q.length >= 7 ? '还要多久？' : '排好长…', 2.2);
            }
          } else {
            pose(m, 'idle');
            if (now > m.fidget) m.fidget = now + 5 + rnd() * 6;
          }
        }
        place(m);
      }
      m.waitT += dt;
      prevS = m.s;
    });
    // 签到位上等太久：自己按铃
    const s0 = q[0];
    if (s0?.state === 'serve' && !s0.checked && !atDesk() && s0.waitT > 6 && now > s0.fidget) {
      s0.fidget = now + 7;
      counter?.userData.ding?.();
      say(s0, '有人吗？', 2);
    }
  };

  // ── 签到 + 递毛巾 ──
  let served = 0;
  const flying: { obj: THREE.Object3D; from: THREE.Vector3; m: Member; t: number }[] = [];
  const shoulder = new THREE.Vector3(0.2, 1.22, -0.02);
  /** 台面上一条毛巾飞过柜台搭到会员肩上 */
  const handTowel = (m: Member) => {
    const obj = buildTowel(ctx);
    obj.scale.setScalar(0.85);
    scene.add(obj);
    const from = STACK.clone();
    from.y += towels() * towelH;
    flying.push({ obj, from, m, t: 0 });
    m.hasTowel = true;
  };
  const stepFlying = (dt: number) => {
    for (const f of [...flying]) {
      f.t += dt / 0.45;
      const to = f.m.obj.localToWorld(shoulder.clone());
      const k = Math.min(1, f.t);
      f.obj.position.lerpVectors(f.from, to, k);
      f.obj.position.y += Math.sin(k * P) * 0.35;
      f.obj.rotation.y = f.m.yaw + P / 2;
      if (k >= 1) {
        flying.splice(flying.indexOf(f), 1);
        f.m.obj.add(f.obj);
        f.obj.position.copy(shoulder);
        f.obj.rotation.set(0, P / 2, 0.25);
        f.m.towel = f.obj;
      }
    }
  };
  /** 签到（一下）：按铃、对勾；台面有毛巾就递一条。返回做了什么 */
  const serveNow = (): string => {
    const m = queue().find((q) => q.state === 'serve');
    if (!m) return '';
    let what = '';
    if (!m.checked) {
      m.checked = true;
      counter?.userData.ding?.();
      served++;
      what = '签到';
      say(m, '✓', 1.4);
    }
    if (!m.hasTowel && towels() > 0) {
      setTowels(towels() - 1);
      handTowel(m);
      what = what ? '签到 + 毛巾' : '毛巾';
      spawn(afterServe(m));
    } else if (!m.hasTowel) say(m, '毛巾？', 2.4);
    return what;
  };
  /** 等着要毛巾的（签过到、台面没毛巾） */
  const towelWaiter = () => queue().find((q) => q.state === 'serve' && q.checked && !q.hasTowel) ?? null;
  /** 一摞毛巾放回台面（有人等就先递给他） */
  const putTowels = (n: number) => {
    const w = towelWaiter();
    let k = n;
    if (w) {
      handTowel(w);
      spawn(afterServe(w));
      k--;
    }
    const before = towels();
    setTowels(before + k);
    // 台面放不下的（> 5 条）塞回毛巾车
    const over = before + k - STACK_MAX;
    if (over > 0) setStock(stock() + over);
  };

  // ── 签完：接水 → 出画 ──
  function* afterServe(m: Member): Co {
    yield* wait(0.55);
    m.state = 'after';
    say(m, '谢谢', 1.2);
    yield* walk(m, TO_WATER);
    yield* face(m, -P / 2);
    if (water() > 0.01) {
      yield* act(m, 'pickup', 0.9, 0.45, () => setWater(water() - 1 / levels));
    } else {
      say(m, '没水了…', 2);
      yield* wait(0.6);
    }
    yield* walk(m, TO_EXIT);
    dropMember(m);
  }
  /** 从画外沿排队线进来 */
  const arrive = () => {
    if (queue().length >= 9) return;
    const [x, z] = QUEUE_LINE[QUEUE_LINE.length - 1];
    const m = spawnMember(x, z);
    m.s = LINE.len;
    m.state = 'queue';
  };
  /** 出门（clubpark 取车的人）：长廊 → 大门 → 车道北沿 → 北停车场 */
  function* leave(): Co {
    const m = spawnMember(OUT_ROUTE[0][0], OUT_ROUTE[0][1]);
    m.state = 'out';
    m.yaw = P / 2;
    yield* walk(m, OUT_ROUTE.slice(1));
    dropMember(m);
  }

  // ── 只看模式：总监由这里演 ──
  function* directorAI(): Co {
    const home = SPOTS.deskStand;
    while (true) {
      const m = queue().find((q) => q.state === 'serve' && (!q.checked || (!q.hasTowel && towels() > 0)));
      if (m && atDesk()) {
        yield* face(director, yawOf(m.x - director.x, m.z - director.z), 0.3);
        // 只看模式：低头写一下再按铃（1.6 秒，比玩家按键慢一点，队伍才排得起来）
        yield* act(director, 'idle', 1.6, 0.6, () => serveNow());
        yield* wait(0.3);
        continue;
      }
      // 台面没毛巾 / 快没了（没人在签到位）：去毛巾车
      if ((towels() === 0 || (towels() < 2 && !m)) && stock() > 0) {
        yield* walk(director, [SPOTS.towels], 1.6);
        yield* face(director, -P / 2);
        let got = 0;
        yield* act(director, 'pickup', 0.6, 0.5, () => {
          got = Math.min(ARMFUL, stock());
          setStock(stock() - got);
        });
        yield* walk(director, [home], 1.6);
        yield* face(director, 1.25);
        yield* act(director, 'pickup', 0.5, 0.5, () => putTowels(got));
        continue;
      }
      // 水桶空了、签到位上没人：出去换桶
      if (water() < 0.01 && !m) {
        yield* walk(director, [[55.0, 8.9], SPOTS.staffGap, [54.6, 10.9]], 1.7);
        yield* face(director, -P / 2);
        yield* act(director, 'pickup', 1.8, 0.6, () => {
          setWater(1);
        });
        yield* walk(director, [SPOTS.staffGap, [55.0, 8.9], home], 1.7);
        yield* face(director, 1.25);
        continue;
      }
      if (Math.hypot(director.x - home[0], director.z - home[1]) > 0.05) {
        yield* walk(director, [home], 1.6);
        yield* face(director, 1.25);
      }
      director.yaw = turnTo(director.yaw, m ? yawOf(m.x - director.x, m.z - director.z) : 1.25, 0.1);
      place(director);
      pose(director, 'idle');
      yield;
    }
  }
  if (!o.play) spawn(directorAI());

  // ── 时间表 ──
  const fired = new Set<string>();
  const sched = (k: number): [string, number, () => void][] => {
    const out: [string, number, () => void][] = [];
    // clubpark 来的：进门时刻往前推走路时间
    GATE_TIMING.inAt.forEach((t, i) => {
      out.push([`p${i}`, t - WALK_TO_GATE, arrive]);
    });
    WALK_INS.forEach(([t, n], i) => {
      const j = Math.abs((Math.sin((k + 1) * 12.9898 + i * 78.233) * 43758.5453) % 1) * 2;
      for (let g = 0; g < n; g++) out.push([`w${i}.${g}`, t + j + g * 1.4 - WALK_TO_GATE, arrive]);
    });
    GATE_TIMING.outAt.forEach((t, i) => {
      // 从长廊西头走到门洞约 22 米
      out.push([`o${i}`, t - 22 / WALK, () => spawn(leave())]);
    });
    return out;
  };
  // 开局：队里已经有三个人（截图第一帧就有队伍）
  for (let i = 0; i < 3; i++) {
    const m = spawnMember(0, 0);
    m.s = (i + 0.0) * GAP;
    const [x, z] = pathAt(LINE, m.s);
    m.x = x;
    m.z = z;
    m.state = 'queue';
    place(m);
  }
  let cartT = 0;

  const update = (dt: number) => {
    now += dt;
    const k = Math.floor(now / LOOP);
    for (const kk of [k, k + 1]) {
      // 下一轮里时刻是负的（提前出现的）在这一轮末尾触发
      for (const [id, t, f] of sched(kk)) {
        const at = kk * LOOP + t;
        const key = `${kk}:${id}`;
        if (now >= at && !fired.has(key) && at > -1) {
          fired.add(key);
          f();
        }
      }
    }
    stepQueue(dt);
    const cur = live;
    live = [];
    for (const c of cur) if (!c.next(dt).done) live.push(c);
    stepFlying(dt);
    // 洗衣房慢慢补毛巾车（每 10 秒一卷）
    cartT += dt;
    if (cartT > 10) {
      cartT = 0;
      if (stock() < 9) setStock(stock() + 1);
    }
    for (const m of members) m.obj.userData.update?.(dt);
    if (!play) director.obj.userData.update?.(dt);
  };

  // ── 玩法模式的互动点（同 id 替换 play.ts 的样板） ──
  const attachPlay = (p: Play) => {
    play = p;
    const stats = () => {
      p.stat('queue', '队伍', `${queue().length} 人`);
      p.stat('towels', '毛巾', `${towels()}/${STACK_MAX}`);
      p.stat('water', '水', `${Math.round(water() * 100)}%`);
      p.stat('served', '已签到', served);
    };
    stats();
    let statT = 0;
    const tick = p.update.bind(p);
    p.update = (dt: number, t: number) => {
      tick(dt, t);
      statT -= dt;
      if (statT <= 0) {
        statT = 0.25;
        stats();
      }
    };
    // 签到 / 递毛巾：站在柜台转角里
    p.add({
      id: 'desk-serve',
      at: () => BELL,
      // 铃在东段台面上（离接待位 ≈ 1 米）
      radius: 1.3,
      stand: () => SPOTS.deskStand,
      label: () => {
        const m = queue().find((q) => q.state === 'serve');
        if (!m) return '';
        if (!m.checked) return '签到';
        return !m.hasTowel && towels() > 0 ? '递毛巾' : '';
      },
      canUse: (s) => s.x < COUNTER.east.x0 && !s.held,
      onUse: (pp) => {
        const m = queue().find((q) => q.state === 'serve');
        if (!m) return;
        pp.busy({
          name: 'serve',
          dur: 1.0,
          pose: 'idle',
          face: m.obj.position,
          mid: () => {
            const w = serveNow();
            if (w) pp.toast(`${w} ✓ 今天第 ${served} 位`);
          },
        });
      },
    });
    // 毛巾车：拿一摞（3 条）
    let towelN = 0;
    const armful = new Map<string, number>();
    p.add({
      id: 'towel-cart',
      at: () => local(cart, [0.45, 0.95, 0], [53.9, 0.95, 8.7]),
      radius: 1.1,
      stand: () => SPOTS.towels,
      pickLabel: () => `拿毛巾（车上 ${stock()}）`,
      canPickUp: (s) => stock() > 0 && !s.held,
      onPickUp: (pp) => {
        const n = Math.min(ARMFUL, stock());
        setStock(stock() - n);
        const obj = new THREE.Group();
        for (let i = 0; i < n; i++) {
          const t = buildTowel(ctx);
          t.position.y = i * 0.13;
          obj.add(t);
        }
        obj.userData.grip = { at: [0, 0.08, 0], axis: [0, -1, 0], up: [0, 0, 1] };
        const it = pp.addItem({ id: `towel-${towelN++}`, name: `毛巾 ×${n}`, obj, radius: 0.9 });
        armful.set(it.id, n);
        pp.give(it);
      },
      accepts: (item) => item.id.startsWith('towel-'),
      putLabel: '放回车上',
      onPutDown: (item) => {
        item.remove();
        setStock(stock() + (armful.get(item.id) ?? 1));
      },
    });
    // 柜台台面：放毛巾（有人等就直接递给他）
    p.add({
      id: 'desk-handover',
      at: () => STACK,
      // 毛巾叠在南段东头（离接待位 ≈ 1.1 米）
      radius: 1.4,
      stand: () => SPOTS.deskStand,
      priority: 1,
      accepts: (item, s) => item.id.startsWith('towel-') && s.x < COUNTER.east.x0,
      putLabel: () => (towelWaiter() ? '递毛巾' : '放毛巾'),
      pickBusy: { pose: 'pickup', dur: 0.5 },
      onPutDown: (item, pp) => {
        item.remove();
        const waiting = !!towelWaiter();
        putTowels(armful.get(item.id) ?? 1);
        pp.toast(waiting ? '递过去了' : `台面毛巾 ${towels()} 条`);
      },
    });
    // 水站：换水桶（从员工口出来，站在水站东边）
    p.add({
      id: 'water-swap',
      at: () => JUG,
      radius: 1.3,
      stand: () => [54.6, 10.9],
      label: () => (water() < 0.5 ? '换水桶' : ''),
      canUse: (s) => !s.held,
      onUse: (pp) => {
        pp.busy({
          name: 'water',
          dur: 1.8,
          pose: 'pickup',
          face: JUG,
          mid: () => {
            setWater(1);
            pp.toast('换了一桶水');
          },
        });
      },
    });
  };

  return {
    update,
    attachPlay,
    stats: () => ({ queue: queue().length, towels: towels(), water: water(), served, cart: stock() }),
    debug: () => ({
      now,
      queue: queue().map((m) => ({
        s: +m.s.toFixed(2),
        st: m.state,
        ck: m.checked,
        tw: m.hasTowel,
        w: +m.waitT.toFixed(1),
      })),
      after: members
        .filter((m) => m.state === 'after' || m.state === 'out')
        .map((m) => [m.state, +m.x.toFixed(1), +m.z.toFixed(1)]),
      towels: towels(),
      water: water(),
      cart: stock(),
      served,
      director: [+director.x.toFixed(2), +director.z.toFixed(2)],
    }),
  };
}

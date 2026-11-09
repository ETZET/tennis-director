// clubpickle 的园区日常（演出，没有模拟）：一份确定的循环（种子随机流，不用 Math.random），总监交给玩家（play.ts），
// 别的人都按这里的协程演。演出只读写画面对象（人、球、网、记分牌、拍架、水站、伞），不碰别的场景。
//
//  · 2 号场双打：叫分（"4-2-1" 气泡）→ 下手发球 → 回球 → 第三拍放小球 → 四个人压到厨房线上 4～8 拍 dink（dink / dinkB 姿势，
//    球过网落进对面厨房、弹一下，正好在 DINK_HIT 那一刻碰到拍面）→ 收尾：突然抽一拍（forehand，球出界 / 打穿）、
//    或者一拍挑高了、对面踩进厨房截击（"厨房！"，违例）、或者 dink 下网。打完一分：离记分牌最近的人走过去翻牌（flip），
//    离球最近的人去捡球，观众鼓掌。每 3 分换一组：输的那组去水站接水（水位掉一档），从西门、南边小路回前台；
//    拍架上排在最前的两个人拿起拍子（setPaddles −1）上场。
//  · 排队：来打球的人从长廊西头来，沿南北步道进西门，在拍架前弯腰插拍子（setPaddles +1），站在旁边等；
//    拍架插满 6 把以后再来的人站在门外跺脚（"还要等多久？"）。1 号场一直停着 → 队越排越长。
//  · 1 号场：网松了，停用。总监把网绷紧（setTension → 1）以后开放：队里最前的两个人上去打单打（同一套对打，每人一边）。
//    地上还有散球的时候，发球的人会抱怨一句。
//  · 观众：坐在伞下的长椅上，头跟着球转（lookAt），一分打完拍手。伞 B 开始是收着的：总监撑开以后才有两个人过来坐。
//  · 长廊上来回走的人、南边小路上走的人。
//
// 击球不等球：每一拍出手时就算好整条弧线（过网 → 落地 → 弹起到接球人的拍面），接球人马上走到站位，
// 挥拍按"拍面到击球点的那一刻 = 球到的那一刻"倒推开始时间；球在那一刻直接从拍面换方向飞走（1/30 秒连拍里没有停顿）。
//
// 总监的活（jobs，play.ts 注册成可交互的东西；?play=0&life=1 时由 autopilot 自己做一遍）：
//   撑伞 · 去器材箱拿摇把 → 1 号场南网柱摇绞盘（crank，4 秒 0→1）→ 还摇把 · 拿捡球器在 1 号场推（笼子 0.4 米内的球收进去）→ 到捡球篮倒球
//   · 水站空了 → 从员工小门出去拿备用水桶 → 换上。
import * as THREE from 'three';
import { DINK_HIT, NEW_PERIOD, RIG_PERIOD } from '../clubsite/people';
import { buildStandIn, PADDLE_FACE_Y } from '../clubsite/people/props';
import { buildPicker } from '../desert3d-v2/assets/ball-picker';
import {
  ARRIVE,
  COURT1,
  COURT2,
  type Court,
  LEAVE,
  PICKLE,
  PK,
  PROM_X,
  QUEUE_DOOR,
  QUEUE_IN,
  RACK_MAX,
  SPOTS,
  STRIP_LANE,
  type V2,
} from './layout';
import type { AssetCtx } from './world';

type V3 = THREE.Vector3;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const Y = V(0, 1, 0);
const P = Math.PI;
const E = P / 2;
const W = -P / 2;
const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
const smooth01 = (u: number) => {
  const k = clamp(u, 0, 1);
  return k * k * (3 - 2 * k);
};
const turnTo = (a: number, b: number, k: number) => {
  let d = b - a;
  d -= Math.round(d / (P * 2)) * P * 2;
  return a + d * Math.min(1, k);
};
const flat = (a: V3, b: V3) => Math.hypot(b.x - a.x, b.z - a.z);

/** 演出里的重力（比 9.8 大一点：弧线更快，一拍 ≈ 0.9 秒，读起来干脆） */
const G = 12;
/** 球半径（pickleball 资产：⌀ 0.18） */
const R = 0.09;
/** 挥拍时长和击球相位：dink（新姿势，DINK_HIT）、forehand / backhand（rig；拍面到身侧的相位同 desert3d-v2 的 C_STROKE） */
const SWING: Record<string, { dur: number; hit: number }> = {
  dink: { dur: NEW_PERIOD.dink, hit: DINK_HIT },
  dinkB: { dur: NEW_PERIOD.dinkB, hit: DINK_HIT },
  forehand: { dur: 0.72, hit: 0.485 },
  backhand: { dur: 0.72, hit: 0.485 },
};
/** 走一步的长度：walk 一遍 = 两步 ≈ 1.25 米（1.4 米/秒 → 0.9 秒一遍，和 rig 的 walk 周期一样） */
const STRIDE = 1.25;
/** 站位：厨房线后 0.35（脚尖不进厨房）、底线后 0.25；双打两条线 ±1.45，单打 ±0.85 */
const KITCHEN_STAND = PK.NVZ + 0.35;
const BASE_STAND = PK.L / 2 + 0.25;
const PERIOD: Record<string, number> = { ...RIG_PERIOD, ...NEW_PERIOD };
const PICKUP_LOW = 0.5;
/** 2 号场北网柱（44, 7.05）的北边：场边带上东西来回走的人从这两个点之间过（不穿网、不碰记分牌） */
const CROSS_E = [V(43.3, 0, 6.72), V(44.7, 0, 6.72)];
const CROSS_W = [V(44.7, 0, 6.72), V(43.3, 0, 6.72)];

// ── 对外的接口 ─────────────────────────────────────────────

/** 头顶的字（hud 按相机投影摆）：say = 白底说话、shout = 黄底大字（"厨房！"）、score = 叫分 */
export interface Bubble {
  p: V3;
  text: string;
  kind: 'say' | 'shout' | 'score';
}

/** 总监的活：只改画面上的东西（网、器材箱、伞、水站、散球、捡球器的笼子），不碰总监的姿势和手
 * （玩法模式下姿势和手里的东西归 clubsite/play 管：play.ts 用互动点 + 手里的东西接；autopilot 自己摆姿势） */
export interface Jobs {
  director: THREE.Object3D;
  /** 1 号场南网柱上绞盘的转轴（世界） */
  winch: V3;
  /** 地上 / 器材箱里的工具：摇把（代用工具，有 grip）、靠在捡球篮边的捡球器、备用水桶 */
  crankObj: THREE.Object3D;
  pickerObj: THREE.Object3D;
  jugObj: THREE.Object3D | null;
  jugGrip: Record<string, unknown>;
  /** 网的松紧（1 号场）0..1；1 = 开放 */
  tension(): number;
  ballsLeft(): number;
  pickerCount(): number;
  water(): number;
  umbrella(): number;
  queue(): number;
  /** 器材箱里的摇把显示 / 藏起 */
  gearCrank(present: boolean): void;
  /** 摇一步：总监已经摆成 crank 姿势、手里拿着摇把；网身收紧、网上的摇把跟着手转。返回 true = 绷好了 */
  crankStep(dt: number): boolean;
  /** 撑伞一步（0→1 要 1.4 秒）。返回 true = 撑开了 */
  umbrellaStep(dt: number): boolean;
  /** 捡球器的笼子压过的球收进去（拿着捡球器走路时每步调；speed = 走路速度，笼子跟着滚） */
  sweep(dt: number, speed: number): void;
  /** 倒进捡球篮：笼子清空，返回倒了几个 */
  dumpPicker(): number;
  /** 换上新水桶：水位满；备用水桶 25 秒后从前台再送一个过来（jugBack 调） */
  refill(): void;
  /** 备用水桶拿走了 / 用掉了：spareGone()；life 到时间会放回原处 */
  spareUsed(): void;
  /** 备用水桶该在的地方 */
  spareAt: V3;
}

export interface Life {
  update(dt: number): void;
  bubbles(): Bubble[];
  /** 场景的读数（hud 顶栏）：1 号场、队伍、水、2 号场比分 */
  stats(): { court1: string; queue: number; water: number; score: string; balls: number };
  /** 一句短提示（toast）：取走以后清空 */
  takeToast(): string | null;
  jobs: Jobs;
  /** 会动的人（导航当圆挡路） */
  people(): { x: number; z: number; r: number }[];
  /** 调试 / 截图 */
  debug(): unknown;
  /** 2 号场的球和第 i 个双打球员的拍面（1/30 秒连拍检查击球用） */
  ball(): { x: number; y: number; z: number; on: boolean };
  paddle(i: number): { x: number; y: number; z: number } | null;
}

export interface LifeEnv {
  ctx: AssetCtx;
  scene: THREE.Scene;
  /** 场景里按 SLOTS 建好的对象（slot id） */
  slot(id: string): THREE.Object3D | undefined;
  /** 新建一个资产（加进场景、登记 update） */
  make(asset: string, variant: number): THREE.Object3D;
  groundAt(x: number, z: number): number;
  /** 玩法模式：总监交给玩家；false = autopilot 自己做活 */
  play: boolean;
  /** 头顶冒字（玩法模式交给 play.say；不给 = life 自己存着，bubbles() 读） */
  say?(obj: THREE.Object3D, text: string, secs: number, dy: number, kind: Bubble['kind']): void;
}

// ── 人 ─────────────────────────────────────────────────────

interface Clip {
  name: string;
  t0: number;
  dur: number;
  /** phase 从 a 播到 b（b > 1 = 循环几遍） */
  a: number;
  b: number;
}
interface Move {
  t0: number;
  t1: number;
  from: V3;
  to: V3;
}
interface Actor {
  id: string;
  obj: THREE.Object3D;
  // biome-ignore lint/suspicious/noExplicitAny: 人物模块的 userData 接口（clubsite/people/index.ts）
  ud: any;
  pos: V3;
  yaw: number;
  /** 站着时转向这个朝向（null = 保持） */
  face: number | null;
  path: V3[];
  speed: number;
  move: Move | null;
  clip: Clip | null;
  /** 站着时的姿势（循环） */
  rest: string;
  restPh: number;
  walkPh: number;
  look: V3 | null;
  on: boolean;
  /** 最近一帧的速度（米/秒） */
  vel: number;
}

export function createLife(env: LifeEnv): Life {
  const { ctx, scene } = env;
  const rnd = ctx.rng('pickle-life');
  const pick = <T>(a: readonly T[]): T => a[Math.floor(rnd() * a.length) % a.length];
  const range = (a: number, b: number) => a + (b - a) * rnd();
  let now = 0;
  let toast: string | null = null;
  const say0: { who: Actor | null; p?: V3; text: string; t1: number; kind: Bubble['kind'] }[] = [];
  const say = (who: Actor, text: string, secs = 1.6, kind: Bubble['kind'] = 'say') => {
    if (env.say) {
      env.say(who.obj, text, secs, who.rest === 'sit' ? 1.75 : 2.2, kind);
      return;
    }
    for (let i = say0.length - 1; i >= 0; i--) if (say0[i].who === who) say0.splice(i, 1);
    say0.push({ who, text, t1: now + secs, kind });
  };

  const ground = (x: number, z: number) => env.groundAt(x, z);
  const actors: Actor[] = [];
  const actor = (id: string, obj: THREE.Object3D): Actor => {
    const a: Actor = {
      id,
      obj,
      ud: obj.userData,
      pos: obj.position.clone(),
      yaw: obj.rotation.y,
      face: null,
      path: [],
      speed: 1.4,
      move: null,
      clip: null,
      rest: 'idle',
      restPh: rnd(),
      walkPh: rnd(),
      look: null,
      on: true,
      vel: 0,
    };
    actors.push(a);
    return a;
  };
  const fromSlot = (id: string) => {
    const o = env.slot(id);
    return o ? actor(id, o) : null;
  };
  const show = (a: Actor, on: boolean) => {
    a.on = on;
    a.obj.visible = on;
  };
  const place = (a: Actor, p: V2 | V3, yaw?: number) => {
    if (Array.isArray(p)) a.pos.set(p[0], 0, p[1]);
    else a.pos.copy(p as V3);
    a.pos.y = ground(a.pos.x, a.pos.z);
    a.path.length = 0;
    a.move = null;
    if (yaw !== undefined) a.yaw = yaw;
  };
  const toV3 = (p: V2 | V3) => (Array.isArray(p) ? V(p[0], 0, p[1]) : (p as V3).clone());
  /** 沿一串点走（不等） */
  const go = (a: Actor, pts: (V2 | V3)[], speed = 1.4, face: number | null = null) => {
    a.path = pts.map(toV3);
    a.speed = speed;
    a.move = null;
    a.face = face;
  };
  /** 定时走到：t1 时正好在 to（对打用：接球人必须准时到） */
  const moveBy = (a: Actor, to: V3, t1: number) => {
    a.path.length = 0;
    a.move = { t0: now, t1: Math.max(now + 0.05, t1), from: a.pos.clone(), to: to.clone() };
  };
  const clipAt = (a: Actor, name: string, t0: number, dur: number, from = 0, to = 1) => {
    a.clip = { name, t0, dur, a: from, b: to };
    return t0 + dur;
  };
  const arrived = (a: Actor) => !a.path.length && !a.move;
  const busyClip = (a: Actor) => !!a.clip && now < a.clip.t0 + a.clip.dur;

  /** 每帧：走路（按路径或定时）、朝向、姿势 */
  const drive = (a: Actor, dt: number) => {
    if (!a.on) return;
    const px = a.pos.x;
    const pz = a.pos.z;
    if (a.move) {
      const m = a.move;
      const u = (now - m.t0) / Math.max(1e-3, m.t1 - m.t0);
      a.pos.lerpVectors(m.from, m.to, smooth01(u));
      if (u >= 1) a.move = null;
    } else if (a.path.length) {
      let step = a.speed * dt;
      while (step > 0 && a.path.length) {
        const t = a.path[0];
        const d = flat(a.pos, t);
        if (d <= step) {
          a.pos.x = t.x;
          a.pos.z = t.z;
          a.path.shift();
          step -= d;
        } else {
          a.pos.x += ((t.x - a.pos.x) / d) * step;
          a.pos.z += ((t.z - a.pos.z) / d) * step;
          step = 0;
        }
      }
    }
    const d = Math.hypot(a.pos.x - px, a.pos.z - pz);
    a.vel = d / Math.max(1e-4, dt);
    a.pos.y = ground(a.pos.x, a.pos.z);
    const clip = a.clip && now >= a.clip.t0 && now < a.clip.t0 + a.clip.dur ? a.clip : null;
    if (a.clip && now >= a.clip.t0 + a.clip.dur) a.clip = null;
    // 朝向：走的时候朝前（对打时横着挪步不转身），站着时转向 face
    const walking = a.vel > 0.35 && !clip;
    if (walking && !a.move) a.yaw = turnTo(a.yaw, Math.atan2(a.pos.x - px, a.pos.z - pz), dt * 10);
    else if (a.face !== null) a.yaw = turnTo(a.yaw, a.face, dt * 8);
    a.obj.position.copy(a.pos);
    a.obj.rotation.y = a.yaw;
    if (a.look) a.ud.lookAt?.(a.look);
    if (clip) {
      const ph = lerp(clip.a, clip.b, clamp((now - clip.t0) / clip.dur, 0, 1));
      a.ud.pose?.(clip.name, ph >= 1 && clip.b <= 1 ? 0.999 : ph % 1);
    } else if (walking) {
      a.walkPh = (a.walkPh + d / STRIDE) % 1;
      a.ud.pose?.('walk', a.walkPh);
    } else {
      a.ud.pose?.(a.rest, (now / (PERIOD[a.rest] ?? 2) + a.restPh) % 1);
    }
  };

  // ── 场景里的东西 ──────────────────────────────────────────
  const net1 = env.slot('net-1');
  const rack = env.slot('paddle-rack');
  const board = env.slot('scoreboard');
  const station = env.slot('water-court');
  const gearBox = env.slot('gear-box');
  const scatter = env.slot('balls-court1');
  const umbrellaB = env.slot('umbrella-b');
  const directorObj = env.slot('director') as THREE.Object3D;
  /** 1 号场南网柱上绞盘的转轴（世界）：同 layout 的 WINCH1 */
  const winch = V(COURT1.x, 0.5, COURT1.z + PK.W / 2 + PK.postOut + 0.135 + 0.126);

  // ── 球：每片场一个对打球（段 = 抛物线；最后一段走完交给简单的物理：弹、滚、撞网、撞围场） ──
  interface Seg {
    t0: number;
    t1: number;
    p0: V3;
    v0: V3;
    /** 段末落地（反弹） */
    bounce: boolean;
  }
  interface Ball {
    obj: THREE.Object3D;
    p: V3;
    v: V3;
    on: boolean;
    segs: Seg[];
    free: boolean;
    rest: number;
    held: (() => V3) | null;
    court: Court;
    box: { x0: number; x1: number; z0: number; z1: number };
  }
  const launch = (p0: V3, p1: V3, T: number) =>
    V((p1.x - p0.x) / T, (p1.y - p0.y + 0.5 * G * T * T) / T, (p1.z - p0.z) / T);
  /** 弧顶高 apex：从 y0 起、落到 y1 要多久 */
  const flightTime = (y0: number, y1: number, apex: number) => {
    const top = Math.max(apex, y0 + 0.02, y1 + 0.02);
    const vy = Math.sqrt(2 * G * (top - y0));
    return (vy + Math.sqrt(Math.max(0, 2 * G * (top - y1)))) / G;
  };
  const seg = (t0: number, p0: V3, p1: V3, T: number, bounce: boolean): Seg => ({
    t0,
    t1: t0 + T,
    p0: p0.clone(),
    v0: launch(p0, p1, T),
    bounce,
  });
  const segAt = (s: Seg, t: number, out: V3) => {
    const u = t - s.t0;
    return out.set(s.p0.x + s.v0.x * u, s.p0.y + s.v0.y * u - 0.5 * G * u * u, s.p0.z + s.v0.z * u);
  };
  const mkBall = (obj: THREE.Object3D | undefined, court: Court): Ball => {
    const o = obj ?? env.make('pickleball', 0);
    o.visible = false;
    return {
      obj: o,
      p: o.position.clone(),
      v: V(),
      on: false,
      segs: [],
      free: false,
      rest: 0,
      held: null,
      court,
      box: {
        x0: PICKLE.x0 + 0.25,
        x1: PICKLE.x1 - 0.25,
        z0: court.z - PK.W / 2 - 0.25,
        z1: court === COURT2 ? 12.7 : court.z + PK.W / 2 + 0.25,
      },
    };
  };
  const tmp = V();
  const stepBall = (b: Ball, dt: number) => {
    if (!b.on) {
      b.obj.visible = false;
      return;
    }
    if (b.held) b.p.copy(b.held());
    else if (b.segs.length) {
      while (b.segs.length && now >= b.segs[0].t1) {
        const s = b.segs.shift() as Seg;
        if (!b.segs.length) {
          segAt(s, s.t1, b.p);
          b.v.set(s.v0.x, s.v0.y - G * (s.t1 - s.t0), s.v0.z);
          if (s.bounce) b.v.set(b.v.x * 0.8, -b.v.y * 0.55, b.v.z * 0.8);
          b.free = true;
          b.rest = 0;
        }
      }
      if (b.segs.length && now >= b.segs[0].t0) segAt(b.segs[0], now, b.p);
    } else if (b.free) {
      // 物理：重力、网、围场、地面
      const sub = 2;
      const h = dt / sub;
      for (let i = 0; i < sub; i++) {
        b.v.y -= 9.8 * h;
        const px = b.p.x;
        b.p.addScaledVector(b.v, h);
        const cx = b.court.x;
        if (
          Math.sign(px - cx) !== Math.sign(b.p.x - cx) &&
          Math.abs(b.p.z - b.court.z) < PK.W / 2 + PK.postOut &&
          b.p.y < PK.netH
        ) {
          b.p.x = cx + Math.sign(px - cx) * 0.12;
          b.v.set(-b.v.x * 0.15, b.v.y * 0.3, b.v.z * 0.5);
        }
        const bx = b.box;
        if (b.p.x < bx.x0 || b.p.x > bx.x1) {
          b.p.x = clamp(b.p.x, bx.x0, bx.x1);
          b.v.x *= -0.35;
        }
        if (b.p.z < bx.z0 || b.p.z > bx.z1) {
          b.p.z = clamp(b.p.z, bx.z0, bx.z1);
          b.v.z *= -0.35;
        }
        const gy = ground(b.p.x, b.p.z) + R;
        if (b.p.y < gy) {
          b.p.y = gy;
          if (b.v.y < -0.8) b.v.set(b.v.x * 0.8, -b.v.y * 0.55, b.v.z * 0.8);
          else {
            b.v.y = 0;
            const f = Math.exp(-1.6 * h);
            b.v.x *= f;
            b.v.z *= f;
          }
        }
      }
      const sp = b.v.length();
      if (sp < 0.06 && b.p.y <= ground(b.p.x, b.p.z) + R + 0.01) {
        b.v.set(0, 0, 0);
        b.rest += dt;
      } else b.rest = 0;
    }
    b.obj.position.copy(b.p);
    b.obj.visible = true;
  };

  // ── 拍面的击球点：在一个人身上量一次（人站在原点、朝 +z），所有球员一样的骨骼 ──
  const contact = new Map<string, V3>();
  {
    const o = env.slot('rally-w1');
    if (o) {
      const p0 = o.position.clone();
      const r0 = o.rotation.y;
      o.position.set(0, 0, 0);
      o.rotation.y = 0;
      o.userData.setProp?.('racket');
      for (const [name, sw] of Object.entries(SWING)) {
        o.userData.pose?.(name, sw.hit);
        o.updateMatrixWorld(true);
        const pad = findPaddle(o);
        contact.set(name, pad ? pad.localToWorld(V(0, PADDLE_FACE_Y, 0)) : V(-0.4, 0.55, 0.9));
      }
      o.position.copy(p0);
      o.rotation.y = r0;
    }
  }
  const contactAt = (name: string, stand: V3, yaw: number) =>
    (contact.get(name) ?? V(-0.4, 0.55, 0.9)).clone().applyAxisAngle(Y, yaw).add(stand);

  // ── 对打 ─────────────────────────────────────────────────
  interface Team {
    pl: Actor[];
    /** 站在右边（发球区按自己的朝向）的是 pl[right] */
    right: number;
  }
  interface Rally {
    id: string;
    c: Court;
    teams: [Team, Team];
    ball: Ball;
    doubles: boolean;
    serving: 0 | 1;
    server: Actor | null;
    n: 1 | 2;
    score: [number, number];
    points: number;
    /** 一局几分（演示：2 号场 3 分、1 号场 4 分） */
    game: number;
    running: boolean;
    shown: [number, number, number];
    last: string;
  }
  const sxOf = (t: number) => (t === 0 ? -1 : 1);
  const yawOf = (t: number) => (t === 0 ? E : W);
  const teamOf = (r: Rally, a: Actor) => (r.teams[0].pl.includes(a) ? 0 : 1);
  const laneZ = (r: Rally, t: number, side: 'R' | 'L') =>
    r.c.z + (side === 'R' ? 1 : -1) * (t === 0 ? 1 : -1) * (r.doubles ? 1.45 : 0.85);
  const stand = (r: Rally, t: number, side: 'R' | 'L', deep: boolean) => {
    const x = r.c.x + sxOf(t) * (deep ? BASE_STAND : KITCHEN_STAND);
    const z = laneZ(r, t, side);
    return V(x, ground(x, z), z);
  };
  /** 一个人现在站哪边（双打按 team.right，单打按发球方的分数单双） */
  const sideOf = (r: Rally, a: Actor): 'R' | 'L' => {
    if (!r.doubles) return r.score[r.serving] % 2 === 0 ? 'R' : 'L';
    const t = r.teams[teamOf(r, a)];
    return t.pl[t.right] === a ? 'R' : 'L';
  };
  const scoreText = (r: Rally) =>
    r.doubles
      ? `${r.score[r.serving]}-${r.score[1 - r.serving]}-${r.n}`
      : `${r.score[r.serving]}-${r.score[1 - r.serving]}`;

  /** 一拍：from 在 fromPose 的击球点出手，球落在 bounceBack 米之前（0 = 不落地，截击），到 to 在 toPose 的击球点；返回到达时刻 */
  const shoot = (
    r: Rally,
    from: Actor,
    fromPose: string,
    to: Actor,
    toPose: string,
    at: V3,
    o: { apex: number; back: number },
  ) => {
    const t = teamOf(r, to);
    const p0 = contactAt(fromPose, from.pos, from.yaw);
    const p1 = contactAt(toPose, at, yawOf(t));
    const segs: Seg[] = [];
    let T = 0;
    if (o.back > 0) {
      const dir = V(p1.x - p0.x, 0, p1.z - p0.z).normalize();
      const b = p1.clone().addScaledVector(dir, -o.back);
      b.y = ground(b.x, b.z) + R;
      const T1 = flightTime(p0.y, b.y, o.apex);
      const h1 = flat(p0, b) / T1;
      const T2 = clamp(o.back / (h1 * 0.75), 0.18, 0.6);
      segs.push(seg(now, p0, b, T1, true), seg(now + T1, b, p1, T2, false));
      T = T1 + T2;
    } else {
      T = flightTime(p0.y, p1.y, o.apex);
      segs.push(seg(now, p0, p1, T, false));
    }
    r.ball.segs = segs;
    r.ball.free = false;
    r.ball.held = null;
    const tArr = now + T;
    const sw = SWING[toPose];
    const t0 = tArr - sw.hit * sw.dur;
    to.face = yawOf(t);
    moveBy(to, at, t0 - 0.04);
    clipAt(to, toPose, t0, sw.dur);
    return tArr;
  };
  /** 打死的一拍（不给人接）：落到 p1（地面或网），之后交给物理 */
  const shootDead = (r: Rally, from: Actor, fromPose: string, p1: V3, apex: number, bounce: boolean) => {
    const p0 = contactAt(fromPose, from.pos, from.yaw);
    const T = apex > 0 ? flightTime(p0.y, p1.y, apex) : 0.38;
    r.ball.segs = [seg(now, p0, p1, T, bounce)];
    r.ball.free = false;
    r.ball.held = null;
    return now + T;
  };

  function* wait(s: number) {
    const t = now + s;
    while (now < t) yield;
  }
  function* untilT(t: number) {
    while (now < t) yield;
  }
  function* until(f: () => boolean, max = 30) {
    const t = now + max;
    while (!f() && now < t) yield;
  }
  const cos: Generator[] = [];
  const spawn = (g: Generator) => cos.push(g);

  const settled = (r: Rally, a: Actor) =>
    !a.path.length && !a.move && Math.abs(Math.abs(a.pos.x - r.c.x) - KITCHEN_STAND) < 0.6;

  /** 下一分开始时每个人站哪（发球方两个人都在底线后；接发球的人在底线后，他的搭档已经在厨房线上） */
  const nextStands = (r: Rally) => {
    const S = r.serving;
    const T = (1 - S) as 0 | 1;
    const ts = r.teams[S];
    const tr = r.teams[T];
    const server = r.server ?? ts.pl[ts.right];
    const side = sideOf(r, server);
    const other: 'R' | 'L' = side === 'R' ? 'L' : 'R';
    const partner = ts.pl.find((p) => p !== server);
    const recv = r.doubles ? tr.pl[side === 'R' ? tr.right : 1 - tr.right] : tr.pl[0];
    const rpart = tr.pl.find((p) => p !== recv);
    const m = new Map<Actor, { p: V3; face: number }>();
    m.set(server, { p: stand(r, S, side, true), face: yawOf(S) });
    if (partner) m.set(partner, { p: stand(r, S, other, true), face: yawOf(S) });
    m.set(recv, { p: stand(r, T, side, true), face: yawOf(T) });
    if (rpart) m.set(rpart, { p: stand(r, T, other, false), face: yawOf(T) });
    return m;
  };
  const goStand = (r: Rally, a: Actor) => {
    const st = nextStands(r).get(a);
    if (st) go(a, [st.p], 1.9, st.face);
  };

  /** 一分：站位 → 叫分 → 发球 → 回球 → 放小球 → dink → 收尾；返回赢的那队 */
  function* point(r: Rally): Generator<void, number> {
    const S = r.serving;
    const T = (1 - S) as 0 | 1;
    const ts = r.teams[S];
    const tr = r.teams[T];
    const server = r.server ?? ts.pl[ts.right];
    r.server = server;
    const side = sideOf(r, server);
    const partner = ts.pl.find((p) => p !== server);
    const recv = r.doubles ? tr.pl[side === 'R' ? tr.right : 1 - tr.right] : tr.pl[0];
    const rpart = tr.pl.find((p) => p !== recv);
    const lane = (a: Actor) => (r.doubles ? sideOf(r, a) : side);
    // 站位（上一分打完时大多数人已经在往这儿走了）
    for (const [a, st] of nextStands(r)) if (arrived(a) && flat(a.pos, st.p) > 0.05) go(a, [st.p], 1.9, st.face);
    for (const a of [...ts.pl, ...tr.pl]) a.rest = 'ready';
    yield* until(() => [...ts.pl, ...tr.pl].every(arrived), 12);
    if (r === court1 && scatter && (scatter.userData.count?.() ?? 0) > 3 && rnd() < 0.5)
      say(server, pick(['地上全是球…', '谁来捡一下球？']), 1.8);
    else say(server, scoreText(r), 1.3, 'score');
    r.ball.on = true;
    r.ball.free = false;
    r.ball.segs = [];
    r.ball.held = () => server.ud.handPoint?.('L') ?? server.pos;
    yield* wait(0.9);

    // 发球：下手（dink 的挥拍），球从左手落到拍面
    const sw = SWING.dink;
    const tServe = now + sw.hit * sw.dur;
    clipAt(server, 'dink', now, sw.dur);
    const c0 = contactAt('dink', server.pos, server.yaw);
    const h0 = server.ud.handPoint?.('L')?.clone() ?? c0.clone();
    const tDrop = now;
    r.ball.held = () => {
      const u = smooth01((now - tDrop) / (tServe - tDrop));
      return tmp.copy(h0).lerp(c0, u);
    };
    yield* untilT(tServe);
    let hitter = server;
    let pose = 'dink';
    // 1. 发球 → 接发球的人（底线后，正手或反手）
    let toPose = pick(['forehand', 'backhand']);
    let at = stand(r, T, side, true).add(V(sxOf(T) * range(0, 0.3), 0, range(-0.35, 0.35)));
    let tArr = shoot(r, hitter, pose, recv, toPose, at, { apex: 1.7, back: 1.4 });
    yield* untilT(tArr);
    // 2. 回球 → 发球方（还在底线后），深球；回完球的人跟着上到厨房线
    hitter = recv;
    pose = toPose;
    let tgt = partner && rnd() < 0.5 ? partner : server;
    toPose = 'dink';
    at = stand(r, S, lane(tgt), true).add(V(sxOf(S) * range(0, 0.25), 0, range(-0.3, 0.3)));
    tArr = shoot(r, hitter, pose, tgt, toPose, at, { apex: 1.9, back: 1.3 });
    go(recv, [stand(r, T, lane(recv), false)], 2.0, yawOf(T));
    yield* untilT(tArr);
    // 3. 第三拍放小球（落进对面厨房）；发球方两个人上网
    hitter = tgt;
    pose = toPose;
    let opp = tr.pl.filter((a) => settled(r, a));
    tgt = opp.length ? pick(opp) : (rpart ?? recv);
    toPose = pick(['dink', 'dinkB']);
    at = stand(r, T, lane(tgt), false).add(V(sxOf(T) * range(0, 0.15), 0, range(-0.3, 0.3)));
    tArr = shoot(r, hitter, pose, tgt, toPose, at, { apex: 1.35, back: 0.62 });
    for (const a of ts.pl) go(a, [stand(r, S, lane(a), false)], 2.2, yawOf(S));
    yield* untilT(tArr);

    // 4. dink：N 拍以后收尾
    const N = 4 + Math.floor(rnd() * 5);
    const fin = rnd() < 0.45 ? 'drive' : rnd() < 0.55 ? 'kitchen' : 'net';
    let won: number;
    for (let k = 1; ; k++) {
      hitter = tgt;
      pose = toPose;
      const ht = teamOf(r, hitter);
      const ot = 1 - ht;
      if (k === N) {
        const opps = r.teams[ot].pl;
        if (fin === 'drive') {
          // 抽一拍：平快地往对面一个人身边打，落在底线附近（界内 = 打穿，界外 = 出界）；对面的人挥拍晚了
          const o = pick(opps);
          const inside = rnd() < 0.55;
          const lx = r.c.x + sxOf(ot) * (inside ? range(4.6, 6.2) : range(7.0, 7.6));
          const lz = clamp(o.pos.z + range(-0.9, 0.9), r.c.z - PK.W / 2 + 0.3, r.c.z + PK.W / 2 - 0.3);
          const tEnd = shootDead(
            r,
            hitter,
            pose,
            V(lx, ground(lx, lz) + R, lz),
            contactAt(pose, hitter.pos, hitter.yaw).y + 0.3,
            true,
          );
          const late = SWING.backhand;
          clipAt(o, pick(['forehand', 'backhand']), now + (tEnd - now) * 0.45 - late.hit * late.dur * 0.6, late.dur);
          yield* untilT(tEnd);
          won = inside ? ht : ot;
          if (inside && rnd() < 0.6) say(pick(r.teams[ht].pl), pick(['好球！', '漂亮！']), 1.3);
          else if (!inside) say(o, '出界！', 1.3, 'shout');
        } else if (fin === 'kitchen') {
          // 截击的人踩在厨房里（上一拍挑高了）：往对面脚下扣下去 → "厨房！" 违例
          const o = pick(opps);
          const lx = r.c.x + sxOf(ot) * range(1.2, 2.2);
          const lz = clamp(o.pos.z + range(-0.5, 0.5), r.c.z - PK.W / 2 + 0.3, r.c.z + PK.W / 2 - 0.3);
          const tEnd = shootDead(r, hitter, pose, V(lx, ground(lx, lz) + R, lz), 0, true);
          say(hitter, '厨房！', 1.8, 'shout');
          yield* untilT(tEnd);
          won = ot;
        } else {
          // dink 下网
          const nz = clamp(hitter.pos.z + range(-0.4, 0.4), r.c.z - 2.6, r.c.z + 2.6);
          const tEnd = shootDead(r, hitter, pose, V(r.c.x - sxOf(ot) * 0.12, 0.48, nz), 0.78, false);
          yield* untilT(tEnd);
          r.ball.free = true;
          r.ball.segs = [];
          r.ball.v.set(-sxOf(ot) * 0.5, 0, 0);
          say(hitter, pick(['哎呀', '下网了']), 1.2);
          won = ot;
        }
        break;
      }
      // 普通的 dink：给对面一个已经站好的人；最后一拍之前按收尾的方式安排接球人的姿势和站位
      opp = r.teams[ot].pl.filter((a) => settled(r, a));
      tgt = opp.length ? pick(opp) : pick(r.teams[ot].pl);
      const last = k === N - 1;
      if (last && fin === 'drive') {
        toPose = 'forehand';
        at = stand(r, ot, lane(tgt), false).add(V(sxOf(ot) * range(0.05, 0.2), 0, range(-0.2, 0.2)));
        tArr = shoot(r, hitter, pose, tgt, toPose, at, { apex: 1.45, back: 0.7 });
      } else if (last && fin === 'kitchen') {
        // 挑高了：接球的人往前一步踩进厨房，不等落地就截击
        toPose = 'forehand';
        at = V(r.c.x + sxOf(ot) * 1.45, 0, tgt.pos.z + range(-0.2, 0.2));
        at.y = ground(at.x, at.z);
        tArr = shoot(r, hitter, pose, tgt, toPose, at, { apex: 2.0, back: 0 });
      } else {
        toPose = pick(['dink', 'dinkB']);
        at = stand(r, ot, lane(tgt), false).add(V(sxOf(ot) * range(0, 0.15), 0, range(-0.35, 0.35)));
        tArr = shoot(r, hitter, pose, tgt, toPose, at, { apex: range(1.15, 1.35), back: 0.62 });
      }
      yield* untilT(tArr);
    }
    return won;
  }

  /** 一分打完：分数、发球权；翻牌、捡球、鼓掌 */
  function* afterPoint(r: Rally, won: number) {
    const S = r.serving;
    const ts = r.teams[S];
    if (won === S) {
      r.score[S]++;
      if (r.doubles) ts.right = 1 - ts.right;
    } else if (r.doubles && r.n === 1) {
      r.n = 2;
      r.server = ts.pl.find((p) => p !== r.server) ?? r.server;
    } else {
      r.serving = (1 - S) as 0 | 1;
      r.n = 1;
      const nt = r.teams[r.serving];
      r.server = nt.pl[nt.right];
    }
    r.points++;
    r.last = won === 0 ? '西' : '东';
    yield* until(() => r.ball.rest > 0.2, 1.2);
    if (r === court2)
      for (const f of fans) if (f.on && f.rest === 'sit') clipAt(f, 'clap', now + rnd() * 0.25, 1.5, 0, 3);
    const all = [...r.teams[0].pl, ...r.teams[1].pl];
    const jobs: Generator[] = [];
    const busy = new Set<Actor>();
    // 翻牌（只有 2 号场有记分牌）：离记分牌最近的人
    let flipper: Actor | null = null;
    if (r === court2 && board) {
      const target: [number, number, number] = [r.score[r.serving], r.score[1 - r.serving], r.n];
      const spot = V(SPOTS.scoreFlip[0], 0, SPOTS.scoreFlip[1] + 0.35);
      // 东边那队的人（记分牌在网东边，西边的人过去要绕网柱）
      flipper = r.teams[1].pl.reduce((a, b) => (flat(a.pos, spot) < flat(b.pos, spot) ? a : b));
      const f = flipper;
      busy.add(f);
      jobs.push(
        (function* () {
          go(f, [V(f.pos.x, 0, 7.6), spot], 1.8, P);
          yield* until(() => arrived(f), 8);
          yield* wait(0.25);
          clipAt(f, 'pickup', now, 0.9, 0.05, 0.32);
          yield* wait(0.3);
          for (let i = 0; i < 3; i++) {
            if (r.shown[i] !== target[i]) {
              board.userData.flip?.(i, target[i]);
              yield* wait(0.2);
            }
          }
          r.shown = target;
          yield* wait(0.35);
          goStand(r, f);
        })(),
      );
    }
    // 捡球：离球最近的人（翻牌的人除外）走过去，弯腰，球揣进兜里
    const b = r.ball;
    if (b.on) {
      const same = all.filter((a) => a !== flipper && Math.sign(a.pos.x - r.c.x) === Math.sign(b.p.x - r.c.x));
      const cand = same.length ? same : all.filter((a) => a !== flipper);
      const g = cand.reduce((a, c) => (flat(a.pos, b.p) < flat(c.pos, b.p) ? a : c));
      busy.add(g);
      jobs.push(
        (function* () {
          const d = flat(g.pos, b.p);
          const to = d > 0.5 ? b.p.clone().lerp(g.pos, 0.42 / d) : g.pos.clone();
          go(g, [to], 1.8, Math.atan2(b.p.x - to.x, b.p.z - to.z));
          yield* until(() => arrived(g), 8);
          clipAt(g, 'pickup', now, 0.6);
          yield* wait(0.6 * PICKUP_LOW);
          b.on = false;
          b.free = false;
          yield* wait(0.3);
          goStand(r, g);
        })(),
      );
    }
    // 别的人先走到下一分的位置（一局打完要换人的话 rotate 会改）
    if (r.points < r.game) for (const a of all) if (!busy.has(a)) goStand(r, a);
    while (jobs.length) {
      for (let i = jobs.length - 1; i >= 0; i--) if (jobs[i].next().done) jobs.splice(i, 1);
      if (jobs.length) yield;
    }
  }

  /** 一片场的循环：打分、每局换人 */
  function* courtLoop(r: Rally) {
    for (;;) {
      if (!r.running) {
        yield;
        continue;
      }
      const won = yield* point(r);
      yield* afterPoint(r, won);
      if (r.points >= r.game) yield* rotate(r);
    }
  }

  // ── 观众 ──
  const fans: Actor[] = [];
  for (const id of ['fan-a1', 'fan-a2', 'fan-b1']) {
    const a = fromSlot(id);
    if (!a) continue;
    a.rest = 'sit';
    a.look = V(COURT2.x, 1, COURT2.z);
    a.face = 0;
    fans.push(a);
  }
  const fanB1 = fans.find((f) => f.id === 'fan-b1') ?? null;
  const seatB1 = fanB1 ? fanB1.pos.clone() : null;

  // ── 人的池子：排队的、上场的、走的 ──
  const pool: Actor[] = [];
  const free = () => pool.find((a) => !a.on) ?? null;
  for (let i = 0; i < 10; i++) {
    const a = actor(`pool-${i}`, env.make('player', i % 4));
    a.ud.setProp?.(null);
    show(a, false);
    pool.push(a);
  }
  const extra = (id: string) => {
    const a = fromSlot(id);
    if (a) pool.push(a);
    return a;
  };

  // ── 2 号场的四个人、1 号场 ──
  const pl2 = ['rally-w1', 'rally-w2', 'rally-e1', 'rally-e2'].map((id) => fromSlot(id)).filter(Boolean) as Actor[];
  for (const a of pl2) {
    a.ud.setProp?.('racket');
    a.rest = 'ready';
  }
  const court2: Rally = {
    id: 'c2',
    c: COURT2,
    teams: [
      { pl: pl2.slice(0, 2), right: 1 },
      { pl: pl2.slice(2, 4), right: 0 },
    ],
    ball: mkBall(env.slot('ball-rally'), COURT2),
    doubles: true,
    serving: 0,
    server: null,
    n: 1,
    score: [4, 2],
    points: 0,
    game: 3,
    running: pl2.length === 4,
    shown: [4, 2, 1],
    last: '',
  };
  board?.userData.setScore?.(4, 2, 1);
  const court1: Rally = {
    id: 'c1',
    c: COURT1,
    teams: [
      { pl: [], right: 0 },
      { pl: [], right: 0 },
    ],
    ball: mkBall(undefined, COURT1),
    doubles: false,
    serving: 0,
    server: null,
    n: 1,
    score: [0, 0],
    points: 0,
    game: 4,
    running: false,
    shown: [0, 0, 1],
    last: '',
  };

  // ── 排队（拍架） ──
  interface Q {
    a: Actor;
    racked: boolean;
    busy: boolean;
  }
  const queue: Q[] = [];
  let paddles = 0;
  const setPaddles = (n: number) => {
    paddles = clamp(n, 0, RACK_MAX);
    rack?.userData.setPaddles?.(paddles);
  };
  const qSpot = (i: number): V2 =>
    i < QUEUE_IN.length ? QUEUE_IN[i] : QUEUE_DOOR[(i - QUEUE_IN.length) % QUEUE_DOOR.length];
  /** 队里的人各就各位：没插拍子而拍架有空的去插，插好的站到自己的位置 */
  function* queueKeeper() {
    let nag = now + 8;
    for (;;) {
      queue.forEach((q, i) => {
        if (q.busy) return;
        const spot = qSpot(i);
        const inside = i < QUEUE_IN.length;
        if (!q.racked && paddles < RACK_MAX) {
          q.busy = true;
          spawn(insertPaddle(q));
          return;
        }
        const target = V(spot[0], 0, spot[1]);
        if (flat(q.a.pos, target) > 0.15 && arrived(q.a)) {
          const via: V3[] = [];
          const out = q.a.pos.x < 36;
          if (inside && out) via.push(toV3(SPOTS.doorOut), toV3(SPOTS.doorIn));
          if (!inside && !out) via.push(toV3(SPOTS.doorIn), toV3(SPOTS.doorOut));
          go(q.a, [...via, target], 1.3, inside ? P * 0.85 : E);
        }
        q.a.rest = q.racked ? 'idle' : 'ready';
      });
      // 门外没地方插拍子的人跺脚、抱怨
      if (now > nag) {
        nag = now + range(7, 12);
        const stuck = queue.filter((q) => !q.racked && !q.busy && arrived(q.a));
        if (stuck.length) say(pick(stuck).a, pick(['还要等多久？', '架子都插满了', '1 号场什么时候开？']), 2);
        else if (!court1.running && queue.length >= 3)
          say(pick(queue).a, pick(['1 号场还没修好？', '网松了，打不了', '等好久了']), 2);
      }
      yield;
    }
  }
  function* insertPaddle(q: Q) {
    const a = q.a;
    const via: V3[] = a.pos.x < 36 ? [toV3(SPOTS.doorOut), toV3(SPOTS.doorIn)] : [];
    go(a, [...via, toV3(SPOTS.rackDrop)], 1.4, P);
    yield* until(() => arrived(a), 25);
    yield* wait(0.2);
    clipAt(a, 'pickup', now, 0.7);
    yield* wait(0.7 * PICKUP_LOW);
    a.ud.setProp?.(null);
    setPaddles(paddles + 1);
    q.racked = true;
    yield* wait(0.45);
    q.busy = false;
  }
  /** 有人来：从长廊西头进来 */
  function* arrive(a: Actor) {
    show(a, true);
    place(a, ARRIVE[0], E);
    a.ud.setProp?.('racket');
    a.rest = 'idle';
    a.look = null;
    const q: Q = { a, racked: false, busy: true };
    queue.push(q);
    go(a, ARRIVE.slice(1), range(1.35, 1.6));
    yield* until(() => arrived(a), 60);
    q.busy = false;
  }
  function* arrivals() {
    yield* wait(range(3, 6));
    for (;;) {
      const a = queue.length < 9 ? free() : null;
      if (a) spawn(arrive(a));
      yield* wait(range(11, 16));
    }
  }

  /** 换人：输的那组下场（接水 → 走），队里最前的两个（单打一个一边）拿起拍子上场 */
  function* rotate(r: Rally) {
    const lose = r.doubles ? (r.score[0] < r.score[1] ? 0 : 1) : r.score[0] < r.score[1] ? 0 : 1;
    const need = r.doubles ? 2 : 2;
    const ready = queue.filter((q) => q.racked && !q.busy);
    if (ready.length < need) {
      r.points = 0;
      return;
    }
    r.running = false;
    const goingOut = r.doubles ? r.teams[lose].pl : [...r.teams[0].pl, ...r.teams[1].pl];
    goingOut.forEach((a, i) => {
      spawn(leave(a, i * 1.2, r));
    });
    const comers = ready.slice(0, need);
    for (const q of comers) queue.splice(queue.indexOf(q), 1);
    const newTeam: Actor[] = [];
    for (const q of comers) {
      q.busy = true;
      newTeam.push(q.a);
      spawn(takeCourt(q.a, r, r.doubles ? lose === 1 : newTeam.length === 2));
    }
    if (r.doubles) r.teams[lose] = { pl: newTeam, right: 0 };
    else
      r.teams = [
        { pl: [newTeam[0]], right: 0 },
        { pl: [newTeam[1]], right: 0 },
      ];
    r.score = [0, 0];
    r.points = 0;
    r.serving = r.doubles ? ((1 - lose) as 0 | 1) : 0;
    r.n = r.doubles ? 2 : 1;
    r.server = r.teams[r.serving].pl[r.teams[r.serving].right];
    yield* until(() => newTeam.every((a) => arrived(a) && !busyClip(a)), 40);
    if (r === court2 && board) {
      const target: [number, number, number] = [0, 0, 2];
      for (let i = 0; i < 3; i++) if (r.shown[i] !== target[i]) board.userData.flip?.(i, target[i]);
      r.shown = target;
    }
    r.running = true;
  }
  /** 拿起拍子，走到场上 */
  function* takeCourt(a: Actor, r: Rally, east: boolean) {
    go(a, [toV3(SPOTS.rackDrop)], 1.5, P);
    yield* until(() => arrived(a), 20);
    clipAt(a, 'pickup', now, 0.7);
    yield* wait(0.7 * PICKUP_LOW);
    a.ud.setProp?.('racket');
    setPaddles(paddles - 1);
    yield* wait(0.4);
    // 绕开网柱：2 号场东边的人沿场边带走到网柱北边再下去；1 号场东边的人从网柱南边、记分牌北边穿过去
    const toward =
      r === court2
        ? east
          ? [V(38.9, 0, STRIP_LANE), V(41.6, 0, 6.85), ...CROSS_E, V(46.0, 0, 7.6)]
          : [V(38.9, 0, STRIP_LANE), V(39.6, 0, 7.6)]
        : east
          ? [
              V(38.9, 0, STRIP_LANE),
              V(41.6, 0, 6.85),
              V(44.0, 0, 6.6),
              V(44.6, 0, 5.75),
              V(46.6, 0, 5.6),
              V(47.0, 0, 4.3),
            ]
          : [V(38.9, 0, 4.6)];
    go(a, [...toward, V(r.c.x + (east ? 3 : -3), 0, r.c.z)], 1.6);
    a.rest = 'ready';
  }
  /** 下场：（2 号场）去水站接水 → 西门 → 南边小路 → 前台 → 大门出去 */
  let waterBusy = false;
  function* leave(a: Actor, delay: number, r: Rally) {
    yield* wait(delay);
    a.rest = 'idle';
    const west = a.pos.x < r.c.x;
    if (r === court2 && station) {
      const out = west ? [V(a.pos.x, 0, 7.6), V(42.0, 0, 6.85), ...CROSS_E] : [V(a.pos.x, 0, 7.6)];
      go(a, [...out, V(48.9, 0, STRIP_LANE), toV3(SPOTS.waterNext)], 1.4, E);
      yield* until(() => arrived(a), 20);
      yield* until(() => !waterBusy, 15);
      waterBusy = true;
      go(a, [toV3(SPOTS.water)], 1.2, E);
      yield* until(() => arrived(a), 6);
      const lv = station.userData.level ?? 1;
      if (lv > 0.01) {
        a.ud.setProp?.('cup');
        clipAt(a, 'sip', now, 2.4);
        yield* wait(0.6);
        station.userData.setLevel?.(lv - 1 / (station.userData.levels ?? 8));
        yield* wait(1.8);
        a.ud.setProp?.('racket');
      } else {
        say(a, pick(['没水了…', '水桶空了！']), 2);
        yield* wait(1.0);
      }
      waterBusy = false;
    }
    const back =
      r === court2
        ? a.pos.x > r.c.x
          ? [V(a.pos.x - 0.6, 0, STRIP_LANE), V(46.5, 0, 6.85), ...CROSS_W, V(41.6, 0, 6.85), V(39.0, 0, STRIP_LANE)]
          : [V(a.pos.x, 0, 7.6), V(39.0, 0, STRIP_LANE)]
        : west
          ? [V(a.pos.x, 0, 4.3), V(38.9, 0, 4.5), V(38.7, 0, 6.0)]
          : [
              V(a.pos.x, 0, 4.3),
              V(46.6, 0, 5.6),
              V(44.6, 0, 5.75),
              V(44.0, 0, 6.6),
              V(41.6, 0, 6.85),
              V(39.0, 0, STRIP_LANE),
            ];
    go(a, [...back, ...LEAVE.map(toV3)], 1.4);
    yield* until(() => arrived(a), 120);
    show(a, false);
    if (!pool.includes(a)) pool.push(a);
  }

  // ── 走来走去的人 ──
  function* promenade(a: Actor, z: number, dir: number) {
    a.ud.setProp?.(rnd() < 0.5 ? 'racket' : null);
    for (;;) {
      const [x0, x1] = PROM_X;
      go(a, [V(dir > 0 ? x1 : x0, 0, z)], range(1.1, 1.4));
      yield* until(() => arrived(a), 90);
      dir = -dir;
      yield* wait(range(1, 4));
    }
  }
  const prom1 = fromSlot('prom-1');
  const prom2 = fromSlot('prom-2');
  if (prom1) spawn(promenade(prom1, -6.7, -1));
  if (prom2) spawn(promenade(prom2, -5.9, 1));
  const pathS = fromSlot('path-s');
  if (pathS)
    spawn(
      (function* () {
        for (;;) {
          go(pathS, [V(56.2, 0, 15.95)], 1.25);
          yield* until(() => arrived(pathS), 60);
          place(pathS, [12, 15.95], E);
          go(pathS, [V(34.8, 0, 15.95), V(35.0, 0, 15.95)], 1.3);
          yield* until(() => arrived(pathS), 60);
        }
      })(),
    );
  // 南北步道上那个人 = 第一个来排队的
  const pathW = extra('path-w');
  if (pathW) {
    pathW.ud.setProp?.('racket');
    const q: Q = { a: pathW, racked: false, busy: true };
    queue.push(q);
    go(pathW, [V(35.2, 0, 2.0)], 1.4);
    spawn(
      (function* () {
        yield* until(() => arrived(pathW), 20);
        q.busy = false;
      })(),
    );
  }
  // 拍架旁边已经在等的：wait-1 + 池子里的两个（拍子都插在架上）
  {
    const w1 = extra('wait-1');
    const first: Actor[] = [];
    for (let i = 0; i < 3; i++) {
      // free() 每次现取（上一个 show 了才不会重复）
      const a = i === 0 ? w1 : free();
      if (!a) continue;
      show(a, true);
      first.push(a);
    }
    first.forEach((a, i) => {
      a.ud.setProp?.(null);
      place(a, qSpot(i), P * 0.85);
      a.face = P * 0.85;
      queue.splice(i, 0, { a, racked: true, busy: false });
    });
    setPaddles(first.length);
  }

  // ── 1 号场：网绷紧以后开放 ──
  function* court1Opener() {
    yield* until(() => tension >= 1, 1e9);
    toast = '1 号场的网绷好了：开放';
    court1.running = false;
    const ready = queue.filter((q) => q.racked && !q.busy);
    for (const q of ready.slice(0, 2)) {
      queue.splice(queue.indexOf(q), 1);
      q.busy = true;
      spawn(takeCourt(q.a, court1, ready.indexOf(q) === 1));
    }
    const pl = ready.slice(0, 2).map((q) => q.a);
    if (pl.length < 2) {
      // 队里没人：等两个人插好拍子
      yield* until(() => queue.filter((q) => q.racked && !q.busy).length >= 2, 1e9);
      const more = queue.filter((q) => q.racked && !q.busy).slice(0, 2 - pl.length);
      for (const q of more) {
        queue.splice(queue.indexOf(q), 1);
        spawn(takeCourt(q.a, court1, pl.length === 1));
        pl.push(q.a);
      }
    }
    court1.teams = [
      { pl: [pl[0]], right: 0 },
      { pl: [pl[1]], right: 0 },
    ];
    court1.server = pl[0];
    yield* until(() => pl.every((a) => arrived(a) && !busyClip(a)), 40);
    court1.running = true;
  }

  // ── 伞 B：开始收着；撑开以后两个人过来坐 ──
  let umbrella = 1;
  const setUmbrella = (k: number) => {
    umbrella = clamp(k, 0, 1);
    umbrellaB?.userData.setOpen?.(0.12 + 0.88 * umbrella);
  };
  let fanB2: Actor | null = null;
  if (umbrellaB) {
    setUmbrella(0);
    if (fanB1) show(fanB1, false);
  }
  function* shadeSeekers() {
    yield* until(() => umbrella >= 1, 1e9);
    toast = '伞撑开了：有人过来坐';
    const b2 = free();
    const seats: [Actor | null, V3 | null][] = [
      [fanB1, seatB1],
      [b2, seatB1 ? seatB1.clone().add(V(-0.9, 0, 0)) : null],
    ];
    fanB2 = b2;
    seats.forEach(([a, seat], i) => {
      if (!a || !seat) return;
      spawn(
        (function* () {
          yield* wait(i * 2.5);
          show(a, true);
          a.ud.setProp?.(null);
          a.ud.setSeat?.(0.52, 0);
          place(a, [44.2 - i * 1.3, 15.95], W);
          a.rest = 'idle';
          go(
            a,
            [
              V(35.1, 0, 15.95),
              toV3(SPOTS.doorOut),
              toV3(SPOTS.doorIn),
              V(38.9, 0, STRIP_LANE),
              V(41.6, 0, 6.85),
              ...CROSS_E,
              V(seat.x, 0, 6.85),
              seat,
            ],
            1.5,
            0,
          );
          yield* until(() => arrived(a), 80);
          a.rest = 'sit';
          a.face = 0;
          a.look = V(COURT2.x, 1, COURT2.z);
          if (!fans.includes(a)) fans.push(a);
        })(),
      );
    });
  }

  // ── 总监 ──
  const dir = actor('director', directorObj);
  dir.rest = 'idle';
  let tension = (net1?.userData.tension as number | undefined) ?? 0;
  let pickerN = 0;
  // 摇把：器材箱里那个只是画面（setItems）；拿在手里的是人物模块的代用摇把（有 grip，crank 姿势会让它指着转轴）
  const crankObj = buildStandIn(ctx as never, 'crank');
  crankObj.name = 'crank';
  crankObj.visible = false;
  scene.add(crankObj);
  // 捡球器：不拿的时候靠在捡球篮西边（单独建一个；总监身上 rig 自己有一个，setProp('picker') 显示）
  const pickerObj = buildPicker(ctx as never);
  pickerObj.position.set(SPOTS.pickerRest[0], ground(SPOTS.pickerRest[0], SPOTS.pickerRest[1]), SPOTS.pickerRest[1]);
  pickerObj.rotation.y = 0.35;
  pickerObj.userData.setCount?.(0);
  pickerObj.userData.setTilt?.(-0.25);
  scene.add(pickerObj);
  // 备用水桶：另建一个水站，把它的水桶拿下来放在前台北边（满的）
  const spareSrc = env.make('water-station', 0);
  const spareJug: THREE.Object3D | null = (spareSrc.userData.jug as THREE.Object3D) ?? null;
  spareSrc.visible = false;
  const spareAt = V(SPOTS.jugSpare[0], ground(SPOTS.jugSpare[0], SPOTS.jugSpare[1]), SPOTS.jugSpare[1]);
  if (spareJug) {
    spareJug.removeFromParent();
    spareJug.position.copy(spareAt);
    scene.add(spareJug);
  }
  let spareBack = Number.POSITIVE_INFINITY;
  const JUG_GRIP = { at: [0, 0.5, 0], axis: [0, -1, 0], up: [0, 0, 1] };
  const dirPicker = () => directorObj.userData.picker as THREE.Object3D | undefined;

  const jobs: Jobs = {
    director: directorObj,
    winch,
    crankObj,
    pickerObj,
    jugObj: spareJug,
    jugGrip: JUG_GRIP,
    spareAt,
    tension: () => tension,
    ballsLeft: () => (scatter?.userData.count?.() as number) ?? 0,
    pickerCount: () => pickerN,
    water: () => (station?.userData.level as number) ?? 1,
    umbrella: () => umbrella,
    queue: () => queue.length,
    gearCrank(present) {
      gearBox?.userData.setItems?.({ crank: present });
    },
    crankStep(dt) {
      if (tension >= 1) return true;
      directorObj.userData.setCrank?.(winch);
      const h = directorObj.userData.handPoint?.('R') as V3 | undefined;
      if (h) net1?.userData.setCrank?.(Math.atan2(h.y - winch.y, h.x - winch.x));
      tension = Math.min(1, tension + dt / 4);
      net1?.userData.setTension?.(tension);
      return tension >= 1;
    },
    umbrellaStep(dt) {
      setUmbrella(umbrella + dt / 1.4);
      return umbrella >= 1;
    },
    sweep(dt, speed) {
      if (!scatter) return;
      const pk = dirPicker();
      if (!pk?.visible) return;
      pk.userData.roll?.(dt, speed);
      const c = pk.getWorldPosition(tmp);
      const n = scatter.userData.count?.() ?? 0;
      for (let i = n - 1; i >= 0; i--) {
        const p = scatter.userData.ballAt?.(i) as V3 | undefined;
        if (p && Math.hypot(p.x - c.x, p.z - c.z) < 0.4) {
          scatter.userData.remove?.(i);
          pickerN++;
          pk.userData.setCount?.(Math.min(60, pickerN * 4));
        }
      }
    },
    dumpPicker() {
      const n = pickerN;
      pickerN = 0;
      dirPicker()?.userData.setCount?.(0);
      return n;
    },
    refill() {
      station?.userData.setLevel?.(1);
    },
    spareUsed() {
      spareBack = now + 25;
    },
  };

  /** autopilot（?play=0&life=1）：撑伞 → 绷网 → 捡球 → 换水（空了再换）。总监的姿势、手里的东西由这里摆 */
  function* autopilot() {
    let holdingPicker = false;
    const walk = function* (pts: (V2 | V3)[], face: number | null = null, speed = 1.7) {
      go(dir, pts, speed, face);
      while (!arrived(dir)) {
        if (holdingPicker) jobs.sweep(1 / 60, dir.vel);
        yield;
      }
    };
    /** 站着干活：姿势按 period 循环，每步调 f，f 返回 true 停 */
    const work = function* (pose: string, f: (dt: number) => boolean) {
      dir.rest = '__job';
      let ph = 0;
      for (;;) {
        ph = (ph + 1 / 60 / (PERIOD[pose] ?? 1)) % 1;
        directorObj.userData.pose?.(pose, ph);
        if (f(1 / 60)) break;
        yield;
      }
      dir.rest = 'idle';
    };
    const bend = function* (fn: () => void) {
      clipAt(dir, 'pickup', now, 0.6);
      yield* wait(0.3);
      fn();
      yield* wait(0.35);
    };
    yield* wait(1.5);
    yield* walk([V(46.6, 0, 5.6), SPOTS.umbrellaB], E);
    yield* work('pickup', jobs.umbrellaStep);
    yield* walk([V(49.6, 0, 5.75), SPOTS.gearBox], P);
    yield* bend(() => {
      jobs.gearCrank(false);
      directorObj.userData.setProp?.('crank');
    });
    yield* walk([V(47.0, 0, 5.75), SPOTS.netCrank1], P - 0.75);
    yield* wait(0.2);
    yield* work('crank', jobs.crankStep);
    toast = '网绷好了';
    yield* walk([V(47.0, 0, 5.75), SPOTS.gearBox], P);
    yield* bend(() => {
      directorObj.userData.setProp?.(null);
      jobs.gearCrank(true);
    });
    yield* walk([V(46.6, 0, 5.75), V(42.2, 0, 4.95), SPOTS.pickerRest], W);
    yield* bend(() => {
      pickerObj.visible = false;
      directorObj.userData.setProp?.('picker');
      dirPicker()?.userData.setCount?.(0);
      holdingPicker = true;
    });
    // 推捡球器：笼子在身前 ≈ 1.5 米，所以每次走到"最近那个球往回 1.45 米"的地方，笼子正好压过它
    for (let guard = 0; guard < 40 && jobs.ballsLeft() > 0; guard++) {
      const pk = dirPicker();
      const c = pk ? pk.getWorldPosition(V()) : dir.pos.clone();
      let best: V3 | null = null;
      let bd = 1e9;
      const n = jobs.ballsLeft();
      for (let i = 0; i < n; i++) {
        const q = scatter?.userData.ballAt?.(i) as V3 | undefined;
        if (!q) continue;
        const d = flat(q, c);
        if (d < bd) {
          bd = d;
          best = q.clone();
        }
      }
      if (!best) break;
      const away = V(best.x - dir.pos.x, 0, best.z - dir.pos.z);
      if (away.length() < 0.3) away.set(0, 0, -1);
      away.normalize();
      const to = best.clone().addScaledVector(away, -1.45);
      to.x = clamp(to.x, PICKLE.x0 + 0.4, PICKLE.x1 - 0.4);
      to.z = clamp(to.z, PICKLE.z0 + 0.4, COURT1.z + PK.W / 2 + 0.3);
      yield* walk([to, best.clone().addScaledVector(away, -1.2)], null, 1.5);
    }
    yield* walk([V(43.2, 0, 4.6), V(42.5, 0, 4.75)], null, 1.5);
    dir.face = P;
    yield* wait(0.3);
    clipAt(dir, 'dump', now, RIG_PERIOD.dump);
    yield* wait(RIG_PERIOD.dump * 0.75);
    const n = jobs.dumpPicker();
    if (n) toast = `倒进捡球篮：${n} 个`;
    yield* wait(RIG_PERIOD.dump * 0.3);
    holdingPicker = false;
    yield* walk([SPOTS.pickerRest], W);
    yield* bend(() => {
      directorObj.userData.setProp?.(null);
      pickerObj.visible = true;
    });
    yield* walk([V(46.0, 0, 5.6)], 0);
    for (;;) {
      yield* until(() => (station?.userData.level ?? 1) <= 0.01, 1e9);
      yield* walk([V(50.6, 0, 5.0), V(51.4, 0, -1.4), SPOTS.serviceGate, V(52.95, 0, 0.6)], 0);
      yield* bend(() => {
        if (spareJug) directorObj.userData.hold?.(spareJug, JUG_GRIP, 'jug');
      });
      yield* walk([SPOTS.serviceGate, V(51.4, 0, -1.4), V(50.6, 0, 4.8), SPOTS.water], E);
      yield* bend(() => {
        directorObj.userData.release?.(scene);
        if (spareJug) spareJug.visible = false;
        jobs.refill();
        jobs.spareUsed();
        toast = '换上新水桶';
      });
      yield* walk([V(46.0, 0, 5.6)], 0);
    }
  }

  // ── 开场 ──
  spawn(courtLoop(court2));
  spawn(courtLoop(court1));
  spawn(queueKeeper());
  spawn(arrivals());
  spawn(court1Opener());
  spawn(shadeSeekers());
  if (!env.play) spawn(autopilot());
  else {
    // 玩法模式：总监从站位开始、空手站着（摇把在器材箱里）
    dir.ud.setProp?.(null);
    directorObj.userData.pose?.('idle', 0);
    actors.splice(actors.indexOf(dir), 1);
  }
  if (!env.play) {
    dir.ud.setProp?.(null);
    place(dir, [46.0, 5.6], 0);
  }

  const bubbleOut: Bubble[] = [];
  return {
    update(dt) {
      now += dt;
      for (let i = cos.length - 1; i >= 0; i--) if (cos[i].next().done) cos.splice(i, 1);
      // 观众看球：头跟着球慢慢转
      const b2 = court2.ball;
      for (const f of fans) {
        if (!f.look) continue;
        const tgt = b2.on ? b2.p : tmp.set(COURT2.x, 0.8, COURT2.z);
        f.look.lerp(tgt, Math.min(1, dt * 5));
      }
      for (const a of actors) if (a.rest !== '__job') drive(a, dt);
      stepBall(court2.ball, dt);
      stepBall(court1.ball, dt);
      if (spareJug && !spareJug.visible && now > spareBack) {
        spareJug.visible = true;
        if (spareJug.parent !== scene) scene.attach(spareJug);
        spareJug.position.copy(spareAt);
        spareJug.rotation.set(0, 0, 0);
        spareJug.userData.respawned = true;
        spareBack = Number.POSITIVE_INFINITY;
      }
      for (let i = say0.length - 1; i >= 0; i--) if (now > say0[i].t1) say0.splice(i, 1);
    },
    bubbles() {
      bubbleOut.length = 0;
      for (const s of say0) {
        const a = s.who;
        if (a && !a.on) continue;
        const p = a ? a.pos.clone().add(V(0, a.rest === 'sit' ? 1.75 : 2.25, 0)) : (s.p as V3);
        bubbleOut.push({ p, text: s.text, kind: s.kind });
      }
      return bubbleOut;
    },
    stats() {
      return {
        court1:
          tension >= 1
            ? court1.running
              ? '在打'
              : '开放'
            : tension > 0
              ? `绷网 ${Math.round(tension * 100)}%`
              : '停用',
        queue: queue.length,
        water: Math.round(((station?.userData.level as number) ?? 1) * 100),
        score: `${court2.shown[0]}-${court2.shown[1]}-${court2.shown[2]}`,
        balls: (scatter?.userData.count?.() as number) ?? 0,
      };
    },
    takeToast() {
      const t = toast;
      toast = null;
      return t;
    },
    jobs,
    people() {
      return actors.filter((a) => a.on && a !== dir).map((a) => ({ x: a.pos.x, z: a.pos.z, r: 0.3 }));
    },
    debug() {
      return {
        now,
        queue: queue.map((q) => [q.a.id, q.racked, q.busy]),
        paddles,
        court2: {
          score: court2.score,
          serving: court2.serving,
          n: court2.n,
          points: court2.points,
          run: court2.running,
          pl: court2.teams.map((t) => t.pl.map((a) => `${a.id}@${a.pos.x.toFixed(1)},${a.pos.z.toFixed(1)}`)),
        },
        court1: { run: court1.running, pl: court1.teams.map((t) => t.pl.map((a) => a.id)) },
        tension,
        fanB2: fanB2?.id,
      };
    },
    ball() {
      const b = court2.ball;
      return { x: b.p.x, y: b.p.y, z: b.p.z, on: b.on };
    },
    paddle(i) {
      const a = pl2[i];
      const pad = a && findPaddle(a.obj);
      if (!pad) return null;
      const p = pad.localToWorld(V(0, PADDLE_FACE_Y, 0));
      return { x: p.x, y: p.y, z: p.z };
    },
  };
}

/** 人手里的匹克球拍（clubsite/people 的 buildPaddle：名字 'paddle'，挂在右拳上） */
function findPaddle(o: THREE.Object3D): THREE.Object3D | null {
  let best: THREE.Object3D | null = null;
  o.traverse((c) => {
    if (!best && c.name === 'paddle' && c.visible) best = c;
  });
  return best;
}

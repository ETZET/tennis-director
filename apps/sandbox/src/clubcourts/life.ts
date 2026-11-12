// clubcourts 的演出（stage 3）：三片硬地上的日常。没有模拟：一切按演出时钟（固定 1/60 秒一步）+ 种子随机流（ctx.rng），不用 Math.random。
//
// - 青训西场：教练隔网喂球（feed 姿势，FEED_RELEASE 那一刻球离拍），排头的孩子跑到位、正 / 反手打回教练那半场（瞄着锥和呼啦圈，
//   打中了教练喊"好球"、家长鼓掌）；打完 3 球绕到队尾，队伍往前挪一格。每一球落在教练那半场滚停 → 留在地上（总监捡球的理由）。
//   球车里的球一个一个少（setCount）；空了 = 训练停（教练"没球了"，孩子干站着，抱怨 +1）。
//   球车挪到教练西北、留一道缝（白模那个位置两个影子连成一大块，lessons「动画与新角色评审」3）；孩子侧对镜头打（不背对）。
// - 家长：两个坐着看（头跟着球），好球鼓掌；站着的那个隔一阵举起手机拍一张（一下白闪）。
// - 会员场：双打，四个人都在网前截击（不落地的快球来回，4～9 拍），一分打完报分；4 分一局（无占先），记分牌翻牌；
//   每打完单数局换边：四个人走到南网柱外歇一会儿（≈ 8 秒）再换到对面 —— 这是总监进场刮水、吹沙不打扰人的窗口。
//   截击的落脚点踩在水洼（waterAt = puddle）或积沙（sand.at = drift）上 → 可能滑一下，这一分丢了，抱怨 +1。
//   比赛中总监走进双打那一块 → 这一分作废、四个人等他出去（等太久 = 抱怨）；比赛中在附近开吹叶机 = 太吵（抱怨）。
// - 等下一场的会员坐在帆下长椅上（两个拿杯子喝），头跟着球、好球鼓掌；喷雾关掉 20 秒以后喊热（抱怨）。
// - 喷雾开着：帆前那几团水洼每秒长一点（hard-court wet）；风从南边慢慢把沙补回会员场南沿（sand.drift）。
// - 青训东场：发球机每 2.6 秒出一球（fire），少年跑位打回去（两成没接到，滚到西围网脚下）；机器空了少年干等（抱怨）。
// - 北边长廊上两个路人来回走。
// - 看戏模式（?play=0&life=1，没有玩家）：总监自己沿南边从东往西吹沙。玩法模式下总监归 play.ts。
// 调试钩子：window.__courts.life（state、debug()）。
import * as THREE from 'three';
import { BALL_R, ballKit } from '../clubsite/assets/tennis-ball';
import { CLAP_HIT, strideOf } from '../clubsite/people';
import { FEED_RELEASE } from '../clubsite/people/rig/rig';
import type { AssetCtx } from './ctx';
import {
  CART_LIVE,
  CHANGE_REST,
  DIM,
  MEMBER,
  MEMBER_STATE,
  PRACTICE_E,
  PRACTICE_W,
  QUEUE,
  ROTATE_PATH,
  ROUTES,
  SPOTS,
  type V2,
} from './layout';

type V3 = THREE.Vector3;
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const Y = new THREE.Vector3(0, 1, 0);
const lerp = THREE.MathUtils.lerp;
const clamp = THREE.MathUtils.clamp;
const TAU = Math.PI * 2;
const smooth01 = (u: number) => {
  const k = clamp(u, 0, 1);
  return k * k * (3 - 2 * k);
};
const turnTo = (a: number, b: number, k: number) => {
  let d = b - a;
  d -= Math.round(d / TAU) * TAU;
  return a + d * Math.min(1, k);
};
const flat = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(b.x - a.x, b.z - a.z);
const E = Math.PI / 2;
const W = -Math.PI / 2;

const G = 9.8;
/** 场面（硬地板子）比地面高 2 厘米，球心落地高度 */
const GROUND = 0.02 + BALL_R;
/** 挥拍（rig 的 forehand / backhand：拍面到击球点的相位 C_STROKE，整个挥拍 SWING 秒）—— 同 clubclay */
const SWING = 0.72;
const C_STROKE = 0.485;
/** 教练喂一球的姿势时长（rig 的 feed 周期） */
const FEED_DUR = 1.6;
const NET_H = 0.95;
const NET_HZ = DIM.netLen / 2;
const HL = DIM.L / 2;
const HW = DIM.DW / 2;

/** 会员场：比赛中不让进的那一块（网两边各 7.5 米、双打边线外 0.4 米）—— 截击都在这里面 */
const MX = MEMBER.x;
const MZ = MEMBER.z;
const MATCH_RECT = { x0: MX - 7.5, x1: MX + 7.5, z0: MZ - HW - 0.4, z1: MZ + HW + 0.4 };

/** hard-court 资产的 API（assets/hard-court.ts 的 root.userData） */
export interface HardApi {
  sand: {
    at(x: number, z: number): { depth: number; state: 'clean' | 'thin' | 'drift' };
    blow(x: number, z: number, dirX: number, dirZ: number, r?: number, amount?: number): number;
    drift(dt: number, wind?: V2, rate?: number): void;
  };
  wet(x: number, z: number, r: number, amount?: number, aspect?: number): void;
  squeegee(x: number, z: number, dirX: number, dirZ: number, width?: number): number;
  dryStep(dt: number, secondsToDry?: number): void;
  waterAt(x: number, z: number): { wet: number; state: 'dry' | 'damp' | 'puddle' };
  stats(): { drift: number; thin: number; puddle: number; damp: number; sandVolume: number };
}

interface Move {
  t0: number;
  t1: number;
  from: V3;
  to: V3;
}
interface Swing {
  name: string;
  t0: number;
  dur: number;
}
interface Ctl {
  netYaw: number;
  move: Move | null;
  swings: Swing[];
  /** 不挥拍、不跑的时候的姿势 */
  rest: 'ready' | 'idle';
  restPh: number;
}
interface Actor {
  id: string;
  obj: THREE.Object3D;
  pos: V3;
  yaw: number;
  walkPh: number;
  /** 走路一步多长（孩子短） */
  stride: number;
  pose(name: string, ph?: number): void;
  ctl: Ctl | null;
  contact: Map<string, V3>;
  rigBalls: THREE.Object3D[];
}
const actor = (id: string, obj: THREE.Object3D): Actor => ({
  id,
  obj,
  pos: obj.position.clone(),
  yaw: obj.rotation.y,
  walkPh: 0,
  // walk 一个周期走多远（孩子的腿短，走得也短）
  stride: strideOf(obj),
  pose: (n, ph) => obj.userData.pose?.(n, ph),
  ctl: null,
  contact: new Map(),
  rigBalls: [],
});

/** 找球拍的拍面网格（rig：拍头几何体中心在握点下方 0.5 米）—— 同 clubclay */
function findRacketHead(obj: THREE.Object3D): THREE.Mesh | null {
  let best: THREE.Mesh | null = null;
  const c = new THREE.Vector3();
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || m.parent === obj) return;
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    m.geometry.boundingBox?.getCenter(c);
    if (Math.abs(c.x) < 0.02 && Math.abs(c.y + 0.5) < 0.03 && Math.abs(c.z) < 0.02) best = m;
  });
  return best;
}
function headWorld(m: THREE.Mesh, out = new THREE.Vector3()) {
  m.geometry.boundingBox?.getCenter(out);
  m.updateWorldMatrix(true, false);
  return out.applyMatrix4(m.matrixWorld);
}

type Co = Generator<void, void, number>;

export interface Bubble {
  text: string;
  /** 谁说的（同一个人一个） */
  who: string;
  obj: THREE.Object3D;
  /** 头顶上方多高 */
  dy: number;
}

export interface CourtsLife {
  update(dt: number): void;
  state: {
    /** 抱怨（总监顾不上的代价：球车空、机器空、水洼滑、打断比赛、太吵、太热） */
    complaints: number;
    cart: number;
    machine: number;
    hopper: number;
    feeds: number;
    goodShots: number;
    points: number;
    games: [number, number];
    score: [number, number];
    /** A 队在哪边：1 = 东，−1 = 西 */
    sideA: number;
    phase: string;
    lets: number;
    slips: number;
    mist: boolean;
  };
  /** 头顶气泡（play 摆） */
  bubbles(): Bubble[];
  /** 走动的人（总监导航当挡路的圆） */
  people(): { x: number; z: number; r: number }[];
  /** 总监在哪（玩法模式每步给：闯进比赛 = 打断） */
  setDirector(p: V3 | null): void;
  /** 吹叶机：喷口 n、方向 d 这一步吹 dt 秒（推沙 + 尘团；比赛中离场近 = 吵） */
  blowAt(n: V3, d: V3, dt: number): void;
  /** 捡球器经过 (x, z)：r 米内的散球收走，返回几个 */
  collect(x: number, z: number, r: number, max: number): number;
  /** 地上还有几个散球（西场、东场） */
  loose(): { w: number; e: number };
  cart: { count(): number; add(n: number): number; obj: THREE.Object3D };
  machine: { count(): number; add(n: number): number; obj: THREE.Object3D };
  hopper: { count(): number; set(n: number): void; obj: THREE.Object3D };
  mist: { on(): boolean; set(on: boolean): void };
  member: HardApi;
  /** 会员场现在能不能进（不在一分里） */
  matchFree(): boolean;
  phase(): string;
  /** 一串球从 from 飞到 to（倒球、加球的样子） */
  pourBalls(from: V3, to: V3, n: number, dur: number): void;
  /** 顶栏：会员场的沙、水（相对开局的比例） */
  courtReport(): { sand: number; water: number };
  debug(): unknown;
}

export interface LifeOpts {
  ctx: AssetCtx;
  scene: THREE.Object3D;
  /** SLOTS 建出来的对象（id → 对象） */
  objs: Map<string, THREE.Object3D>;
  make(asset: string, variant: number): THREE.Object3D;
  /** 玩法模式：总监归玩家（这里不摆他） */
  play: boolean;
}

export function createLife({ ctx, scene, objs, make, play }: LifeOpts): CourtsLife {
  const rnd = ctx.rng('courts-life');
  const get = (id: string) => objs.get(id) ?? null;
  const need = (id: string) => {
    const o = get(id);
    if (!o) throw new Error(`clubcourts life: 缺 ${id}`);
    return o;
  };
  let now = 0;
  let directorAt: V3 | null = null;
  let blowing = false;

  const memberObj = need('hard-m');
  const member = memberObj.userData as unknown as HardApi;
  const st0 = member.stats();
  const state: CourtsLife['state'] = {
    complaints: 0,
    cart: 40,
    machine: 8,
    hopper: 40,
    feeds: 0,
    goodShots: 0,
    points: 0,
    games: [2, 1],
    score: [0, 0],
    sideA: 1,
    phase: 'start',
    lets: 0,
    slips: 0,
    mist: true,
  };

  // ── 气泡 ──
  const bubbles = new Map<string, { a: THREE.Object3D; text: string; until: number; h: number }>();
  const say = (who: string, obj: THREE.Object3D | null, text: string, secs = 1.8, h = 2.1) => {
    if (obj) bubbles.set(who, { a: obj, text, until: now + secs, h });
  };
  const complain = (who: string, obj: THREE.Object3D | null, text: string, h = 2.1) => {
    state.complaints++;
    say(who, obj, text, 2.6, h);
  };

  // ── 散在地上的球（西场教练那半场 / 东场）：一个 tennis-ball 组一个场；SLOTS 里摆的单个球换成它 ──
  const looseW = make('tennis-ball', 0);
  const looseE = make('tennis-ball', 0);
  looseW.name = 'courts-life:loose-w';
  looseE.name = 'courts-life:loose-e';
  const takeSlots = (prefix: string): V2[] => {
    const pts: V2[] = [];
    for (const [id, o] of objs)
      if (id.startsWith(prefix)) {
        pts.push([o.position.x, o.position.z]);
        o.removeFromParent();
      }
    return pts;
  };
  looseW.userData.setBalls(takeSlots('ball-w'));
  looseE.userData.setBalls(takeSlots('ball-e'));
  get('ball-m')?.removeFromParent();
  scene.add(looseW, looseE);
  const addLoose = (g: THREE.Object3D, x: number, z: number) => g.userData.add(x, BALL_R, z);

  // ── 飞的球：一个球 + 地上一个小暗点（太阳 44° 偏东 8°：影子落在球正南 ≈ 1 × 高、略偏西）──
  const kit = ballKit(ctx as unknown as Parameters<typeof ballKit>[0]);
  const shadowGeo = new THREE.CircleGeometry(ctx.texel * 1.2, 8).rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({
    color: 0x1c2452,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
  });
  interface Seg {
    t0: number;
    t1: number;
    p0: V3;
    v0: V3;
  }
  interface Area {
    x0: number;
    x1: number;
    z0: number;
    z1: number;
    netX: number;
    netZ: number;
  }
  interface Flyer {
    mesh: THREE.Mesh;
    shadow: THREE.Mesh;
    on: boolean;
    free: boolean;
    segs: Seg[];
    p: V3;
    v: V3;
    rest: number;
    freeT: number;
    area: Area;
    onRest: ((p: V3) => void) | null;
    /** 段走完就消失（倒球的那一串） */
    vanish: boolean;
  }
  const areaOf = (c: { x: number; z: number; hx: number; hz: number }, open = false): Area => ({
    x0: c.x - c.hx + 0.3,
    x1: c.x + c.hx - 0.3,
    z0: c.z - c.hz + 0.3,
    z1: open ? c.z + c.hz + 6 : c.z + c.hz - 0.3,
    netX: c.x,
    netZ: c.z,
  });
  const AREA_W = areaOf(PRACTICE_W);
  const AREA_E = areaOf(PRACTICE_E);
  const AREA_M = areaOf(MEMBER, true);
  const flyers: Flyer[] = [];
  const flyer = (area: Area, onRest: ((p: V3) => void) | null = null): Flyer => {
    let f = flyers.find((q) => !q.on);
    if (!f) {
      const mesh = new THREE.Mesh(kit.geo, kit.mat);
      mesh.castShadow = false;
      mesh.frustumCulled = false;
      const shadow = new THREE.Mesh(shadowGeo, shadowMat);
      shadow.layers.set(ctx.layers.FX);
      scene.add(mesh, shadow);
      f = {
        mesh,
        shadow,
        on: false,
        free: false,
        segs: [],
        p: v(0, 0, 0),
        v: v(0, 0, 0),
        rest: 0,
        freeT: 0,
        area,
        onRest: null,
        vanish: false,
      };
      flyers.push(f);
    }
    Object.assign(f, { on: true, free: false, segs: [], rest: 0, freeT: 0, area, onRest, vanish: false });
    return f;
  };
  const launch = (p0: V3, p1: V3, T: number) =>
    v((p1.x - p0.x) / T, (p1.y - p0.y + 0.5 * G * T * T) / T, (p1.z - p0.z) / T);
  const seg = (t0: number, p0: V3, p1: V3, T: number): Seg => ({
    t0,
    t1: t0 + T,
    p0: p0.clone(),
    v0: launch(p0, p1, T),
  });
  const segAt = (s: Seg, t: number, out: V3) => {
    const u = t - s.t0;
    return out.set(s.p0.x + s.v0.x * u, s.p0.y + s.v0.y * u - 0.5 * G * u * u, s.p0.z + s.v0.z * u);
  };
  const segVel = (s: Seg, t: number, out: V3) => out.set(s.v0.x, s.v0.y - G * (t - s.t0), s.v0.z);
  /** 自由飞的球：重力、硬地反弹 0.62、滚动摩擦、网、围网 */
  const physics = (f: Flyer, dt: number) => {
    f.freeT += dt;
    const A = f.area;
    const h = dt / 3;
    for (let s = 0; s < 3; s++) {
      if (f.rest > 0.3) break;
      f.v.y -= G * h;
      const px = f.p.x;
      f.p.addScaledVector(f.v, h);
      if (Math.sign(px - A.netX) !== Math.sign(f.p.x - A.netX) && Math.abs(f.p.z - A.netZ) < NET_HZ && f.p.y < NET_H) {
        f.p.x = A.netX + Math.sign(px - A.netX) * (BALL_R + 0.03);
        f.v.x = -f.v.x * 0.15;
        f.v.z *= 0.5;
        f.v.y *= 0.3;
      }
      if (f.p.x < A.x0 || f.p.x > A.x1) {
        f.p.x = clamp(f.p.x, A.x0, A.x1);
        f.v.x = -f.v.x * 0.3;
      }
      if (f.p.z < A.z0 || f.p.z > A.z1) {
        f.p.z = clamp(f.p.z, A.z0, A.z1);
        f.v.z = -f.v.z * 0.3;
      }
      if (f.p.y < GROUND) {
        f.p.y = GROUND;
        if (f.v.y < -1.2) {
          f.v.y = -f.v.y * 0.62;
          f.v.x *= 0.82;
          f.v.z *= 0.82;
        } else {
          f.v.y = 0;
          const k = Math.exp(-1.3 * h);
          f.v.x *= k;
          f.v.z *= k;
        }
      }
    }
    if (f.p.y <= GROUND + 0.002 && Math.hypot(f.v.x, f.v.z) < 0.12) {
      f.v.set(0, 0, 0);
      f.rest += dt;
    } else f.rest = 0;
  };
  const updateFlyers = (dt: number) => {
    for (const f of flyers) {
      if (!f.on) {
        f.mesh.visible = f.shadow.visible = false;
        continue;
      }
      if (!f.free) {
        while (f.segs.length && now >= f.segs[0].t1) {
          const s = f.segs.shift() as Seg;
          if (!f.segs.length) {
            segAt(s, s.t1, f.p);
            segVel(s, s.t1, f.v);
            if (f.vanish) {
              f.on = false;
              break;
            }
            if (f.p.y <= GROUND + 0.05 && f.v.y < 0) {
              // 落地的那一段：弹起来交给物理
              f.v.y = -f.v.y * 0.62;
              f.v.x *= 0.82;
              f.v.z *= 0.82;
            }
            f.free = true;
          }
        }
        if (f.on && !f.free && f.segs.length && now >= f.segs[0].t0) segAt(f.segs[0], now, f.p);
      }
      if (f.on && f.free) {
        physics(f, dt);
        if (f.rest > 0.3 || f.freeT > 7) {
          f.on = false;
          f.onRest?.(f.p.clone());
        }
      }
      f.mesh.visible = f.shadow.visible = f.on;
      if (f.on) {
        f.mesh.position.copy(f.p);
        const hgt = Math.max(0, f.p.y - GROUND);
        f.shadow.position.set(f.p.x - hgt * 0.14, 0.03, f.p.z + hgt);
      }
    }
  };

  // ── 尘团（吹沙）：路的浅色小块，顺着吹的方向飘出去（lessons「组装经验」9：尘要比沙浅）──
  const DUSTS = 48;
  const dustMesh = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 0),
    ctx.mat('granite', { noShadowReceive: true, lightUp: 0.6, bands: [-0.4, 0.3], edge: 0, convex: 0 }),
    DUSTS,
  );
  dustMesh.layers.set(ctx.layers.FX);
  dustMesh.castShadow = false;
  dustMesh.frustumCulled = false;
  scene.add(dustMesh);
  const dusts = Array.from({ length: DUSTS }, () => ({ life: 1, max: 1, p: v(0, 0, 0), vel: v(0, 0, 0), s: 0.1 }));
  let dustNext = 0;
  const m4 = new THREE.Matrix4();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const puff = (p: V3, dir: V3, size: number) => {
    const P = dusts[dustNext];
    dustNext = (dustNext + 1) % DUSTS;
    P.life = 0;
    P.max = 0.5 + rnd() * 0.4;
    P.s = size * (0.6 + rnd() * 0.6);
    P.p.set(p.x + (rnd() - 0.5) * 0.3, 0.08, p.z + (rnd() - 0.5) * 0.3);
    P.vel.set(
      dir.x * (1.2 + rnd()) + (rnd() - 0.5) * 0.5,
      0.3 + rnd() * 0.3,
      dir.z * (1.2 + rnd()) + (rnd() - 0.5) * 0.5,
    );
  };
  const updateDust = (dt: number) => {
    dusts.forEach((P, i) => {
      if (P.life >= P.max) {
        dustMesh.setMatrixAt(i, zero);
        return;
      }
      P.life += dt;
      P.p.addScaledVector(P.vel, dt);
      P.vel.multiplyScalar(Math.exp(-2 * dt));
      const u = P.life / P.max;
      const s = P.s * Math.sin(Math.min(1, u) * Math.PI) * (1 + u * 0.8);
      m4.makeScale(s * 1.4, s * 0.8, s).setPosition(P.p.x, P.p.y + s * 0.4, P.p.z);
      dustMesh.setMatrixAt(i, m4);
    });
    dustMesh.instanceMatrix.needsUpdate = true;
  };
  let dustAcc = 0;
  const blowAt = (n: V3, d: V3, dt: number) => {
    blowing = true;
    const h = Math.hypot(d.x, d.z) || 1;
    const dir = v(d.x / h, 0, d.z / h);
    const moved = member.sand.blow(n.x, n.z, dir.x, dir.z, 2.2, dt * 14);
    // 尘团：前面 0.5～1.6 米有沙（或刚吹走了一些）才起
    const ahead = v(n.x + dir.x * 0.9, 0, n.z + dir.z * 0.9);
    const sandy = member.sand.at(ahead.x, ahead.z).depth;
    dustAcc += dt * (moved > 1e-4 || sandy > 0.08 ? 22 : 0);
    while (dustAcc > 1) {
      dustAcc--;
      const k = 0.5 + rnd() * 1.1;
      puff(v(n.x + dir.x * k, 0, n.z + dir.z * k), dir, 0.12 + sandy * 0.1);
    }
  };

  // ── 人 ──
  const coachObj = need('coach');
  const coach = actor('coach', coachObj);
  const kids = ['kid-hit', 'kid-q1', 'kid-q2', 'kid-q3'].map((id) => actor(id, need(id)));
  const parents = ['parent-1', 'parent-2'].map(need);
  const photographer = actor('parent-3', need('parent-3'));
  const teams: Actor[][] = [
    [actor('m-e1', need('m-e1')), actor('m-e2', need('m-e2'))],
    [actor('m-w1', need('m-w1')), actor('m-w2', need('m-w2'))],
  ];
  const players = teams.flat();
  const waiting = ['member-wait-1', 'member-wait-2', 'member-wait-3'].map(need);
  const teen = actor('teen', need('teen'));
  const walkers = ['walker', 'walker-2'].map((id) => actor(id, need(id)));
  const directorObj = get('director');
  const director = directorObj ? actor('director', directorObj) : null;
  const cartObj = need('ball-cart');
  const machineObj = need('ball-machine');
  const hopperObj = need('hopper-machine');
  const scoreboard = get('scoreboard');
  const mistObj = need('mist-line');
  /** 捡球篮里那团球（ball-hopper：root → g → [篮子, 球]） */
  const hopperBalls = hopperObj.children[0]?.children[1] ?? null;

  const sync = (a: Actor) => {
    a.obj.position.copy(a.pos);
    a.obj.rotation.y = a.yaw;
  };
  /** 量拍面中心（人本地，朝向 0）在正手 / 反手击球相位上的位置（同 clubclay） */
  const measure = (a: Actor) => {
    const head = findRacketHead(a.obj);
    const fallback: Record<string, V3> = { forehand: v(-0.85, 0.85, 0.35), backhand: v(0.85, 0.85, 0.35) };
    const p0 = a.obj.position.clone();
    const r0 = a.obj.rotation.y;
    a.obj.position.set(0, 0, 0);
    a.obj.rotation.y = 0;
    a.obj.userData.setProp?.('racket');
    for (const name of ['forehand', 'backhand'] as const) {
      if (head) {
        a.pose(name, C_STROKE);
        a.obj.updateMatrixWorld(true);
        a.contact.set(name, headWorld(head));
      } else a.contact.set(name, fallback[name].clone().multiplyScalar(a.obj.scale.x));
    }
    a.obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.parent === a.obj && m.geometry.type === 'SphereGeometry') a.rigBalls.push(m);
    });
    a.obj.position.copy(p0);
    a.obj.rotation.y = r0;
    a.pose('ready', 0);
  };
  for (const a of [...kids, ...players, teen]) measure(a);
  const contactAt = (a: Actor, name: string, stand: V3, yaw: number) =>
    (a.contact.get(name) as V3).clone().applyAxisAngle(Y, yaw).add(stand);
  const rightOf = (yaw: number) => v(-1, 0, 0).applyAxisAngle(Y, yaw);

  /** 时间轴驱动：位置按 move 插值，挥拍按排好的时刻放，其余时间跑动 / 准备姿势（同 clubclay） */
  const drive = (a: Actor, dt: number) => {
    const c = a.ctl as Ctl;
    let speed = 0;
    let heading = a.yaw;
    let far = false;
    if (c.move && now >= c.move.t0) {
      const m = c.move;
      const u = (now - m.t0) / Math.max(1e-3, m.t1 - m.t0);
      const px = a.pos.x;
      const pz = a.pos.z;
      a.pos.lerpVectors(m.from, m.to, smooth01(u));
      const d = Math.hypot(a.pos.x - px, a.pos.z - pz);
      speed = d / Math.max(1e-4, dt);
      if (d > 1e-4) heading = Math.atan2(a.pos.x - px, a.pos.z - pz);
      far = flat(m.from, m.to) > 2.6 && m.t1 - now > 0.35;
      if (u >= 1) c.move = null;
    }
    while (c.swings.length && now >= c.swings[0].t0 + c.swings[0].dur) c.swings.shift();
    const sw = c.swings[0];
    const inSwing = !!sw && now >= sw.t0;
    if (inSwing) a.yaw = turnTo(a.yaw, c.netYaw, dt * 22);
    else a.yaw = turnTo(a.yaw, far && speed > 1.5 ? heading : c.netYaw, dt * 10);
    if (inSwing && sw) {
      a.pose(sw.name, Math.min(0.995, (now - sw.t0) / sw.dur));
      for (const b of a.rigBalls) b.visible = false;
    } else if (speed > 0.6) {
      a.walkPh = (a.walkPh + (speed * dt) / (a.stride * 1.3)) % 1;
      a.pose('walk', a.walkPh);
    } else if (c.rest === 'ready') {
      c.restPh = (c.restPh + dt / 0.55) % 1;
      a.pose('ready', c.restPh);
    } else {
      c.restPh = (c.restPh + dt / 3) % 1;
      a.pose('idle', c.restPh);
    }
  };
  const ctlOf = (a: Actor, netYaw: number, rest: Ctl['rest'] = 'ready'): Ctl => {
    a.ctl = { netYaw, move: null, swings: [], rest, restPh: rnd() };
    return a.ctl;
  };
  /** 在 [t0, t1] 里挪到 to（太紧就按 6 米/秒拉长，但不晚于 latest） */
  const moveTo = (a: Actor, to: V3, t0: number, t1: number, latest = t1) => {
    const d = flat(a.pos, to);
    const end = Math.min(latest, Math.max(t1, t0 + d / 6));
    (a.ctl as Ctl).move = { t0, t1: Math.max(t0 + 0.05, end), from: a.pos.clone(), to: to.clone() };
  };

  // ── 协程 ──
  const bg: Co[] = [];
  const spawn = (c: Co) => {
    c.next(0);
    bg.push(c);
  };
  function* wait(s: number): Co {
    let t = 0;
    while (t < s) t += yield;
  }
  function* until(cond: () => boolean, max = 1e9): Co {
    let t = 0;
    while (!cond() && t < max) t += yield;
  }
  function* walk(a: Actor, pts: V3[], speed = 1.5): Co {
    a.ctl = null;
    for (const p of pts) {
      while (true) {
        const dt = yield;
        const dx = p.x - a.pos.x;
        const dz = p.z - a.pos.z;
        const L = Math.hypot(dx, dz);
        const step = speed * dt;
        if (L <= step) {
          a.pos.x = p.x;
          a.pos.z = p.z;
          break;
        }
        a.pos.x += (dx / L) * step;
        a.pos.z += (dz / L) * step;
        a.yaw = turnTo(a.yaw, Math.atan2(dx, dz), dt * 10);
        a.walkPh = (a.walkPh + step / a.stride) % 1;
        a.pose('walk', a.walkPh);
      }
    }
  }
  function* face(a: Actor, yaw: number, s = 0.3): Co {
    let t = 0;
    while (t < s) {
      const dt = yield;
      t += dt;
      a.yaw = turnTo(a.yaw, yaw, dt * 8);
    }
    a.yaw = yaw;
  }
  function* all(...cos: Co[]): Co {
    for (const c of cos) c.next(0);
    let live = cos.slice();
    while (live.length) {
      const dt = yield;
      live = live.filter((c) => !c.next(dt).done);
    }
  }
  const at = (p: V2, y = 0) => v(p[0], y, p[1]);

  // ════════════════════════════════════════════════════════════════════
  // 青训西场：教练喂球、孩子轮换
  // ════════════════════════════════════════════════════════════════════
  const CART_MAX = 60;
  cartObj.position.set(CART_LIVE[0], cartObj.position.y, CART_LIVE[1]);
  cartObj.userData.setCount?.(state.cart);
  const setCart = (n: number) => {
    state.cart = clamp(Math.round(n), 0, CART_MAX);
    cartObj.userData.setCount?.(state.cart);
    return state.cart;
  };
  coach.yaw = E;
  sync(coach);
  coachObj.userData.setProp?.('racket');
  /** 孩子们瞄的目标：两组锥、呼啦圈（drill-kit 的中心） */
  const TARGETS: V3[] = [v(-22.4, 0, 2.7), v(-22.4, 0, 9.3), v(-21.0, 0, 4.6), v(-25.5, 0, 6.2)];
  /** line[0] = 正在打的，line[1..3] = 排队（QUEUE 0..2） */
  let line = kids.slice();
  const kidRest = W + 0.45; // 排队时侧身、略朝镜头
  line.forEach((k, i) => {
    if (i === 0) {
      k.pos.copy(at(SPOTS.kidHit));
      k.yaw = W;
      ctlOf(k, W, 'ready');
    } else {
      k.pos.copy(at(QUEUE[i - 1]));
      k.yaw = kidRest;
      ctlOf(k, kidRest, 'idle');
    }
    sync(k);
  });
  /** 教练这一刻的姿势（feed 的相位由协程给） */
  let coachFeed = -1;
  let coachPh = 0;
  let lastGood = -10;
  let parentsClap = 0;
  let waitingClap = 0;
  let trainingStopped = false;

  function* feedOnce(kid: Actor): Co {
    const t0 = now;
    coachFeed = t0;
    const stroke = rnd() < 0.68 ? 'forehand' : 'backhand';
    const stand = v(SPOTS.kidHit[0] + (rnd() - 0.5) * 0.8, 0, SPOTS.kidHit[1] + (rnd() - 0.5) * 1.6);
    const P1 = contactAt(kid, stroke, stand, W);
    yield* until(() => now >= t0 + FEED_RELEASE * FEED_DUR);
    const P0 = (coachObj.userData.feedPoint?.() as V3 | undefined) ?? v(coach.pos.x + 0.5, 0.6, coach.pos.z);
    // 喂球：慢、弧高（过网 > 1 米），在孩子前面 1.5 米弹一下，弹到拍面
    const B = v(lerp(P0.x, P1.x, 0.72), GROUND, lerp(P0.z, P1.z, 0.72));
    const T1 = Math.max(0.62, flat(P0, B) / 6);
    const T2 = Math.max(0.32, flat(B, P1) / 4.6);
    const tc = now + T1 + T2;
    const f = flyer(AREA_W);
    f.p.copy(P0);
    f.segs = [seg(now, P0, B, T1), seg(now + T1, B, P1, T2)];
    setCart(state.cart - 1);
    state.feeds++;
    const c = kid.ctl as Ctl;
    c.netYaw = W;
    c.rest = 'ready';
    moveTo(kid, stand, now + 0.05, tc - 0.3, tc - 0.05);
    c.swings.push({ name: stroke, t0: tc - C_STROKE * SWING, dur: SWING });
    yield* until(() => now >= tc);
    // 打回去：多半瞄着锥 / 圈；一成下网，一成出界
    const r = rnd();
    const tg = TARGETS[Math.floor(rnd() * TARGETS.length)];
    let B2: V3;
    if (r < 0.1) B2 = v(PRACTICE_W.x + 0.12, 0.45, lerp(P1.z, PRACTICE_W.z, 0.3));
    else if (r < 0.2) B2 = v(-30 - rnd() * 2.4, GROUND, P1.z + (rnd() - 0.5) * 5);
    else B2 = v(tg.x + (rnd() - 0.5) * 2.4, GROUND, tg.z + (rnd() - 0.5) * 2.0);
    const T3 = flat(P1, B2) / (r < 0.1 ? 9 : 10 + rnd() * 2);
    f.free = false;
    f.segs = [seg(now, P1, B2, T3)];
    f.onRest = (p) => addLoose(looseW, p.x, p.z);
    const good = r >= 0.2 && TARGETS.some((q) => flat(q, B2) < 0.85);
    // 落地那一刻的反应另开一条（下一球不用等这一球落地）
    spawn(
      (function* (): Co {
        yield* wait(T3);
        if (good) {
          state.goodShots++;
          lastGood = now;
          say('coach', coachObj, '好球！', 1.4, 2.3);
          parentsClap = now + 1.2;
        } else if (r < 0.1) say(kid.id, kid.obj, '哎…', 1.0, 1.6);
      })(),
    );
  }
  function* rotate(): Co {
    const old = line[0];
    const q = line.slice(1);
    line = [q[0], q[1], q[2], old];
    for (const k of line) k.ctl = null;
    yield* all(
      (function* (): Co {
        yield* walk(old, [...ROTATE_PATH.map((p) => at(p)), at(QUEUE[2])], 1.7);
        yield* face(old, kidRest, 0.3);
        ctlOf(old, kidRest, 'idle');
      })(),
      (function* (): Co {
        yield* wait(0.3);
        yield* walk(q[0], [at(SPOTS.kidHit)], 1.7);
        yield* face(q[0], W, 0.3);
        ctlOf(q[0], W, 'ready');
      })(),
      (function* (): Co {
        yield* wait(0.5);
        yield* walk(q[1], [at(QUEUE[0])], 1.2);
        yield* face(q[1], kidRest, 0.3);
        ctlOf(q[1], kidRest, 'idle');
      })(),
      (function* (): Co {
        yield* wait(0.8);
        yield* walk(q[2], [at(QUEUE[1])], 1.2);
        yield* face(q[2], kidRest, 0.3);
        ctlOf(q[2], kidRest, 'idle');
      })(),
    );
  }
  function* training(): Co {
    yield* wait(0.6);
    while (true) {
      for (let k = 0; k < 3; k++) {
        if (state.cart <= 0) {
          trainingStopped = true;
          complain('coach', coachObj, '球车空了！', 2.3);
          let t = 0;
          while (state.cart <= 0) {
            t += yield;
            if (t > 25) {
              t = 0;
              complain('coach', coachObj, '还没有球…', 2.3);
            }
          }
          trainingStopped = false;
          say('coach', coachObj, '谢谢！接着练', 1.8, 2.3);
          yield* wait(1.0);
        }
        yield* feedOnce(line[0]);
        yield* wait(0.25 + rnd() * 0.3);
      }
      yield* rotate();
    }
  }
  spawn(training());
  const updateCoach = (dt: number) => {
    if (coachFeed >= 0 && now - coachFeed < FEED_DUR) {
      coach.pose('feed', Math.min(0.999, (now - coachFeed) / FEED_DUR));
    } else {
      coachPh = (coachPh + dt / 3) % 1;
      coach.pose(trainingStopped ? 'idle' : 'ready', coachPh);
    }
    coachObj.userData.lookAt?.(
      trainingStopped ? cartObj.position.clone().setY(0.8) : line[0].obj.position.clone().setY(1),
    );
    sync(coach);
  };

  // ── 家长：看、鼓掌、拍照 ──
  let sitPh = 0;
  const watchW = v(0, 0, 0);
  const phone = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.15, 0.04), ctx.mat('hair', { noShadowReceive: true }));
  phone.castShadow = false;
  phone.visible = false;
  scene.add(phone);
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.22, 0.22),
    ctx.mat('clothWhite', { bands: [-2, -1.5], edge: 0, convex: 0, noShadowReceive: true }),
  );
  flash.layers.set(ctx.layers.FX);
  flash.visible = false;
  scene.add(flash);
  let photoUntil = -1;
  let flashAt = -1;
  photographer.obj.userData.setSeat?.(null);
  spawn(
    (function* (): Co {
      yield* wait(4);
      while (true) {
        yield* wait(8 + rnd() * 8);
        const tgt = line[0].pos;
        yield* face(photographer, Math.atan2(tgt.x - photographer.pos.x, tgt.z - photographer.pos.z), 0.4);
        photoUntil = now + 2.2;
        flashAt = now + 1.1;
        yield* wait(2.2);
        if (rnd() < 0.4) say('parent-3', photographer.obj, '拍到了！', 1.4, 2.2);
        yield* face(photographer, -0.5, 0.4);
      }
    })(),
  );
  const updateParents = (dt: number) => {
    sitPh = (sitPh + dt / 3.2) % 1;
    const fl = flyers.find((f) => f.on && f.area === AREA_W);
    if (fl) watchW.copy(fl.p);
    else watchW.copy(line[0].pos).setY(0.9);
    const clapping = now < parentsClap;
    parents.forEach((o, i) => {
      if (clapping) o.userData.pose?.('clap', (now * 2 + i * 0.17) % 1);
      else o.userData.pose?.('sit', (sitPh + i * 0.37) % 1);
      o.userData.lookAt?.(watchW);
    });
    const ph = photographer;
    const shooting = now < photoUntil;
    if (shooting) {
      const k = 1 - Math.abs((photoUntil - now) / 2.2 - 0.5) * 2;
      ph.pose('clap', clamp(0.15 + k * 0.6, 0, CLAP_HIT));
    } else if (clapping) ph.pose('clap', (now * 2) % 1);
    else ph.pose('idle', (sitPh * 0.9 + 0.3) % 1);
    ph.obj.userData.lookAt?.(watchW);
    sync(ph);
    phone.visible = shooting;
    if (shooting) {
      ph.obj.updateMatrixWorld(true);
      const r = ph.obj.userData.handPoint?.('R') as V3 | undefined;
      const l = ph.obj.userData.handPoint?.('L') as V3 | undefined;
      if (r && l) {
        phone.position.copy(r).add(l).multiplyScalar(0.5);
        phone.position.y += 0.06;
        phone.rotation.set(0, ph.yaw, 0);
      }
    }
    flash.visible = flashAt >= 0 && now >= flashAt && now < flashAt + 0.12;
    if (flash.visible)
      flash.position.copy(phone.position).add(v(Math.sin(ph.yaw) * 0.06, 0.04, Math.cos(ph.yaw) * 0.06));
  };

  // ════════════════════════════════════════════════════════════════════
  // 会员场：双打网前截击、换边
  // ════════════════════════════════════════════════════════════════════
  const sideOf = (t: number) => (t === 0 ? state.sideA : -state.sideA);
  const teamOf = (a: Actor) => (teams[0].includes(a) ? 0 : 1);
  const netYaw = (side: number) => (side > 0 ? W : E);
  const inMatch = (p: V3 | null) =>
    !!p && p.x > MATCH_RECT.x0 && p.x < MATCH_RECT.x1 && p.z > MATCH_RECT.z0 && p.z < MATCH_RECT.z1;
  let interrupted = false;
  let serveTeam = 0;
  const serverIdx = [0, 0];
  /** 落脚点滑不滑：水洼 / 积沙 */
  const slippery = (p: V3): string => {
    for (const [dx, dz] of [
      [0, 0],
      [0.3, 0],
      [-0.3, 0],
      [0, 0.3],
      [0, -0.3],
    ]) {
      if (member.waterAt(p.x + dx, p.z + dz).state === 'puddle') return '水';
      if (member.sand.at(p.x + dx, p.z + dz).state === 'drift') return '沙';
    }
    return '';
  };

  interface Shot {
    recv: Actor;
    t1: number;
    P1: V3;
    /** 接球的人在 t1 滑倒（'水' | '沙'） */
    slip: string;
  }
  /** 截击：定接球（挑正反手、在网前 2.4～5.5 米之间站好），返回拍面位置 */
  const planVolley = (r: Actor, target: V3, tc: number): { P1: V3; slip: string } => {
    const c = r.ctl as Ctl;
    const yaw = c.netYaw;
    const side = rightOf(yaw);
    const rel = (target.x - r.pos.x) * side.x + (target.z - r.pos.z) * side.z;
    const stroke = rel > -0.4 ? 'forehand' : 'backhand';
    const off = (r.contact.get(stroke) as V3).clone().applyAxisAngle(Y, yaw);
    const s = Math.sign(r.pos.x - MX) || 1;
    const du = Math.abs(target.x - off.x - MX);
    const stand = v(MX + s * clamp(du, 2.4, 5.5), 0, clamp(target.z - off.z, MZ - HW - 0.6, MZ + HW + 0.6));
    const P1 = contactAt(r, stroke, stand, yaw);
    moveTo(r, stand, now + 0.08, tc - 0.25, tc - 0.04);
    const slick = slippery(stand);
    const slip = slick && rnd() < 0.65 ? slick : '';
    if (!slip) c.swings.push({ name: stroke, t0: tc - C_STROKE * SWING, dur: SWING });
    return { P1, slip };
  };
  type Kind = 'rally' | 'winner' | 'out' | 'net';
  /** 一拍：球现在在 P0 离开 hitter 的拍面 */
  const volley = (f: Flyer, hitter: Actor, P0: V3, kind: Kind): Shot | null => {
    const rt = 1 - teamOf(hitter);
    const rs = sideOf(rt);
    for (const a of teams[rt]) if (a.ctl) a.ctl.restPh = 0.25;
    f.free = false;
    if (kind === 'net') {
      const tgt = v(MX + rs * 0.12, 0.45, lerp(P0.z, MZ, 0.3) + (rnd() - 0.5) * 2);
      f.segs = [seg(now, P0, tgt, flat(P0, tgt) / 10)];
      return null;
    }
    if (kind === 'out' || kind === 'winner') {
      const B =
        kind === 'out'
          ? v(MX + rs * (5 + rnd() * 6), GROUND, MZ + (rnd() < 0.5 ? -1 : 1) * (HW + 0.4 + rnd() * 1.2))
          : v(MX + rs * (6.5 + rnd() * 4), GROUND, MZ + (rnd() * 2 - 1) * (HW - 1.2));
      f.segs = [seg(now, P0, B, flat(P0, B) / (11 + rnd() * 2))];
      // 追两步，追不上
      for (const a of teams[rt])
        if (a.ctl) moveTo(a, v(a.pos.x + rs * 0.6, 0, lerp(a.pos.z, B.z, 0.35)), now + 0.15, now + 0.8);
      return null;
    }
    // 对打：打给对面一个人身边（截击，不落地）
    const [a, b] = teams[rt];
    const tz = MZ + (rnd() * 2 - 1) * (HW - 1.0);
    const recv = Math.abs(a.pos.z - tz) < Math.abs(b.pos.z - tz) ? a : b;
    const target = v(recv.pos.x - rs * (rnd() - 0.3) * 1.0, 0.95, clamp(tz, MZ - HW + 0.4, MZ + HW - 0.4));
    const T = Math.max(0.55, flat(P0, target) / (10.5 + rnd() * 2));
    const tc = now + T;
    const { P1, slip } = planVolley(recv, target, tc);
    f.segs = [seg(now, P0, P1, T)];
    // 搭档往另一边让一让
    const mate = recv === a ? b : a;
    if (mate.ctl && !mate.ctl.swings.length) {
      const z = clamp(MZ + (mate.pos.z > P1.z ? 1 : -1) * (1.8 + rnd()), MZ - HW + 0.5, MZ + HW - 0.5);
      moveTo(mate, v(mate.pos.x, 0, z), now + 0.2, now + 0.2 + Math.abs(z - mate.pos.z) / 3.5);
    }
    return { recv, t1: tc, P1, slip };
  };
  /** 站位：每队两个人都在网前（离网 3.6～4.4 米），一北一南 */
  const placements = () =>
    new Map<Actor, V3>(
      teams.flatMap((tm, t) =>
        tm.map((a, k) => {
          const s = sideOf(t);
          return [a, v(MX + s * (3.6 + rnd() * 0.8), 0, MZ + (k === 0 ? -2.4 : 2.4) + (rnd() - 0.5) * 0.6)] as [
            Actor,
            V3,
          ];
        }),
      ),
    );
  let blockedT = 0;
  function* point(): Generator<void, number, number> {
    state.phase = 'walk';
    for (const a of players) a.ctl = null;
    yield* all(...[...placements()].map(([a, p]) => walk(a, [p], 2.2)));
    for (const a of players) {
      a.yaw = netYaw(Math.sign(a.pos.x - MX));
      sync(a);
    }
    // 总监在场上：等他出去（等太久 = 抱怨）
    if (inMatch(directorAt)) {
      state.phase = 'blocked';
      blockedT = 0;
      let said = false;
      while (inMatch(directorAt)) {
        const dt = yield;
        blockedT += dt;
        for (const a of players) a.pose('idle', (now / 3) % 1);
        if (blockedT > 1.5 && !said) {
          say(players[0].id, players[0].obj, '等一下，有人', 2.4);
          said = true;
        }
        if (blockedT > 9) {
          blockedT = 0;
          complain(players[2].id, players[2].obj, '还打不打了？');
        }
      }
    }
    for (const a of players) {
      ctlOf(a, a.yaw, 'ready');
      a.pose('ready', 0);
    }
    yield* wait(0.5);
    state.phase = 'rally';
    interrupted = false;
    // 开球：发球队的一个人自己抛一下、正手送出去（截击练习式的开球）
    const srv = teams[serveTeam][serverIdx[serveTeam]];
    const sc = srv.ctl as Ctl;
    const tHit = now + 0.55;
    const P0 = contactAt(srv, 'forehand', srv.pos, sc.netYaw);
    sc.swings.push({ name: 'forehand', t0: tHit - C_STROKE * SWING, dur: SWING });
    const f = flyer(AREA_M);
    const toss = P0.clone()
      .add(v(0, -0.35, 0))
      .addScaledVector(rightOf(sc.netYaw), -0.25);
    f.p.copy(toss);
    f.segs = [seg(now + 0.1, toss, P0, tHit - now - 0.1)];
    yield* until(() => now >= tHit);
    let shots = 3 + Math.floor(rnd() * 6);
    const ending = (): Kind => {
      if (shots > 0) return 'rally';
      const r = rnd();
      return r < 0.3 ? 'out' : r < 0.5 ? 'net' : 'winner';
    };
    let k = ending();
    let hitter: Actor = srv;
    let shot = volley(f, srv, P0, k);
    let slipped = '';
    while (shot) {
      const s = shot;
      yield* until(() => now >= s.t1 || interrupted);
      if (interrupted) break;
      if (s.slip) {
        // 滑一下：球从身边过去，这一分丢了
        slipped = s.slip;
        s.recv.ctl = null;
        s.recv.pose('pickup', 0.5);
        f.free = true;
        f.segs = [];
        segVel(seg(now - 0.01, s.P1, s.P1.clone().add(v(-sideOf(teamOf(s.recv)) * 1.5, -0.8, 0)), 0.2), now, f.v);
        state.slips++;
        complain(s.recv.id, s.recv.obj, s.slip === '水' ? '哇，水洼！滑' : '沙！滑了一下');
        hitter = s.recv;
        k = 'out';
        break;
      }
      shots--;
      hitter = s.recv;
      k = ending();
      shot = volley(f, s.recv, s.P1, k);
    }
    if (interrupted) {
      state.lets++;
      f.free = true;
      f.segs = [];
      f.v.set(0, 0, 0);
      for (const a of players) {
        a.ctl = null;
        a.pose('idle');
        say(a.id, a.obj, '！', 1.6);
      }
      complain(players[1].id, players[1].obj, '打着呢！');
      yield* wait(1.4);
      return -1;
    }
    // 滑倒的那个慢慢站起来
    const winTeam = slipped ? 1 - teamOf(hitter) : k === 'winner' ? teamOf(hitter) : 1 - teamOf(hitter);
    yield* until(() => !f.on || f.free, 3);
    yield* wait(slipped ? 1.4 : 0.9);
    for (const a of players) {
      a.ctl = null;
      a.pose('idle');
    }
    return winTeam;
  }
  const PTS = ['0', '15', '30', '40'];
  scoreboard?.userData.setScore?.([6, 3, null, state.games[0]], [4, 6, null, state.games[1]]);
  /** 赢一分；返回这一局是不是结束了（无占先：40–40 下一分定局） */
  const award = (t: number): boolean => {
    state.score[t]++;
    const [a, b] = state.score;
    const done = a >= 4 || b >= 4;
    const caller = teams[serveTeam][serverIdx[serveTeam]];
    if (!done) {
      const s = state.score;
      const call = s[0] === 3 && s[1] === 3 ? '平分，决胜分' : `${PTS[s[serveTeam]]}–${PTS[s[1 - serveTeam]]}`;
      say(caller.id, caller.obj, call, 1.6);
      return false;
    }
    state.games[t]++;
    state.score = [0, 0];
    say(caller.id, caller.obj, `局！${state.games[0]}–${state.games[1]}`, 2.0);
    scoreboard?.userData.flip?.(t * 4 + 3, state.games[t]);
    const [ga, gb] = state.games;
    if ((Math.max(ga, gb) >= 6 && Math.abs(ga - gb) >= 2) || Math.max(ga, gb) >= 7) {
      scoreboard?.userData.setScore?.([ga, null, null, 0], [gb, null, null, 0]);
      state.games = [0, 0];
    }
    serverIdx[serveTeam] = 1 - serverIdx[serveTeam];
    serveTeam = 1 - serveTeam;
    return true;
  };
  /** 换边：走到南网柱外歇一会儿（场上空着 = 刮水、吹沙的窗口），再换到对面 */
  function* changeover(): Co {
    state.phase = 'changeover';
    say(players[0].id, players[0].obj, '换边', 1.6);
    yield* all(
      ...players.map((a, i) =>
        (function* (): Co {
          a.ctl = null;
          const s = Math.sign(a.pos.x - MX) || 1;
          const rest = at(CHANGE_REST[s < 0 ? i % 2 : 2 + (i % 2)]);
          yield* walk(a, [v(a.pos.x, 0, 30.9), rest], 1.6);
          yield* face(a, s < 0 ? E * 0.6 : W * 0.6, 0.4);
          let t = 0;
          const off = rnd();
          while (t < 7.5) {
            t += yield;
            a.pose('idle', (t / 3 + off) % 1);
          }
          // 绕过南网柱到对面
          yield* walk(a, [v(MX - s * 1.2, 0, rest.z)], 1.4);
        })(),
      ),
    );
    state.sideA = -state.sideA;
    // 场上有沙 / 水：换边时有人提一句（这一盘的状况）
    const bad = courtTrouble();
    if (bad) complain(players[3].id, players[3].obj, bad);
  }
  /** 双打那一块里有没有积沙 / 水洼（每 0.6 米查一点） */
  const courtTrouble = (): string => {
    let sand = 0;
    let water = 0;
    for (let x = MX - HL; x <= MX + HL; x += 0.6)
      for (let z = MZ - HW; z <= MZ + HW; z += 0.6) {
        if (member.sand.at(x, z).state === 'drift') sand++;
        if (member.waterAt(x, z).state === 'puddle') water++;
      }
    if (water > 6) return '场上好多水';
    if (sand > 6) return '沙都吹到场上了';
    return '';
  };
  function* match(): Co {
    // 开局四个人已经摆在网前（SLOTS），直接开打
    for (const a of players) {
      a.yaw = netYaw(Math.sign(a.pos.x - MX));
      sync(a);
    }
    while (true) {
      const w = yield* point();
      state.points++;
      if (w < 0) continue;
      waitingClap = now + 1.0;
      const gameOver = award(w);
      yield* wait(0.8);
      if (gameOver && (state.games[0] + state.games[1]) % 2 === 1) yield* changeover();
    }
  }
  const main = match();
  main.next(0);

  // ── 等下一场的会员：坐着看、喝水、鼓掌；喷雾关了就喊热 ──
  waiting[1].userData.setProp?.('cup');
  waiting[2].userData.setProp?.('cup');
  let mistOffT = 0;
  let hotT = 0;
  const watchM = v(MX, 1, MZ);
  const updateWaiting = (dt: number) => {
    const fl = flyers.find((f) => f.on && f.area === AREA_M);
    if (fl) watchM.copy(fl.p);
    else watchM.set(MX, 1, MZ);
    const clapping = now < waitingClap;
    waiting.forEach((o, i) => {
      const ph = (sitPh + i * 0.29) % 1;
      if (clapping && i !== 1) o.userData.pose?.('clap', (now * 2 + i * 0.21) % 1);
      else if (i > 0 && Math.floor(now / 7 + i * 0.5) % 2 === 0) o.userData.pose?.('sip', (now / 4 + i * 0.3) % 1);
      else o.userData.pose?.('sit', ph);
      o.userData.lookAt?.(watchM);
    });
    if (!state.mist) {
      mistOffT += dt;
      hotT += dt;
      if (mistOffT > 20 && hotT > 22) {
        hotT = 0;
        const i = Math.floor(rnd() * 3);
        complain(`wait-${i}`, waiting[i], i === 0 ? '好热…喷雾呢？' : '热死了', 1.6);
      }
    } else {
      mistOffT = 0;
      hotT = 0;
    }
  };

  // ── 喷雾：帆前那几团水洼每秒长一点；风从南边慢慢补沙；水慢慢干 ──
  const setMist = (on: boolean) => {
    state.mist = on;
    mistObj.userData.setOn?.(on);
  };
  let envAcc = 0;
  const updateEnv = (dt: number) => {
    envAcc += dt;
    if (envAcc < 0.5) return;
    const k = envAcc;
    envAcc = 0;
    if (state.mist)
      for (const [x, z, rx, rz] of MEMBER_STATE.puddles)
        member.wet(x + (rnd() - 0.5) * 0.5, z + (rnd() - 0.5) * 0.3, (rx / 0.9) * 0.75, 0.011 * k, rz / rx);
    member.dryStep(k, 1800);
    member.sand.drift(k, [0, -1], 1 / 900);
  };

  // ════════════════════════════════════════════════════════════════════
  // 青训东场：发球机 + 少年
  // ════════════════════════════════════════════════════════════════════
  const MACHINE_MAX = 80;
  machineObj.userData.setCount?.(state.machine);
  const setMachine = (n: number) => {
    state.machine = clamp(Math.round(n), 0, MACHINE_MAX);
    machineObj.userData.setCount?.(state.machine);
    machineObj.userData.setOn?.(state.machine > 0);
    return state.machine;
  };
  const setHopper = (n: number) => {
    state.hopper = clamp(Math.round(n), 0, 60);
    if (hopperBalls) hopperBalls.visible = state.hopper > 0;
  };
  setHopper(state.hopper);
  teen.yaw = E;
  ctlOf(teen, E, 'ready');
  const TEEN_HOME = at(SPOTS.teen);
  function* machineDrill(): Co {
    yield* wait(1.2);
    while (true) {
      if (state.machine <= 0) {
        machineObj.userData.setOn?.(false);
        complain('teen', teen.obj, '机器没球了', 1.9);
        (teen.ctl as Ctl).rest = 'idle';
        let t = 0;
        while (state.machine <= 0) {
          t += yield;
          if (t > 30) {
            t = 0;
            complain('teen', teen.obj, '还没加球吗？', 1.9);
          }
        }
        (teen.ctl as Ctl).rest = 'ready';
        say('teen', teen.obj, '来了！', 1.4, 1.9);
        yield* wait(1.2);
      }
      const shot = machineObj.userData.fire?.() as { from: V3; dir: V3 } | null;
      if (!shot) {
        setMachine(0);
        continue;
      }
      state.machine = (machineObj.userData.count?.() as number | undefined) ?? state.machine - 1;
      const t0 = now;
      const stroke = rnd() < 0.62 ? 'forehand' : 'backhand';
      const stand = v(TEEN_HOME.x + (rnd() - 0.5) * 1.2, 0, TEEN_HOME.z + (rnd() - 0.5) * 3.2);
      const P1 = contactAt(teen, stroke, stand, E);
      const P0 = shot.from.clone();
      const B = v(8 + rnd() * 2.5, GROUND, lerp(P0.z, P1.z, 0.8));
      const T1 = Math.max(0.7, flat(P0, B) / 12);
      const T2 = Math.max(0.36, flat(B, P1) / 7);
      const tc = now + T1 + T2;
      const f = flyer(AREA_E);
      f.p.copy(P0);
      const miss = rnd() < 0.2;
      f.onRest = (p) => addLoose(looseE, p.x, p.z);
      const c = teen.ctl as Ctl;
      if (miss) {
        // 没接到：球从身边过去，滚到西围网脚下
        const past = v(P1.x - 2.2, 0.35, P1.z + (rnd() - 0.5));
        f.segs = [seg(now, P0, B, T1), seg(now + T1, B, past, T2 + 0.3)];
        moveTo(teen, stand.clone().lerp(TEEN_HOME, 0.5), now + 0.2, tc);
      } else {
        f.segs = [seg(now, P0, B, T1), seg(now + T1, B, P1, T2)];
        moveTo(teen, stand, now + 0.1, tc - 0.3, tc - 0.05);
        c.swings.push({ name: stroke, t0: tc - C_STROKE * SWING, dur: SWING });
        yield* until(() => now >= tc);
        const tg = v(22 + rnd() * 6, GROUND, 1.5 + rnd() * 9);
        f.free = false;
        f.segs = [seg(now, P1, tg, flat(P1, tg) / (14 + rnd() * 2))];
      }
      yield* until(() => now >= t0 + 2.6);
    }
  }
  spawn(machineDrill());

  // ── 北边长廊的两个路人 ──
  for (const [i, w] of walkers.entries()) {
    w.obj.userData.setProp?.(i === 0 ? 'racket' : null);
    spawn(
      (function* (): Co {
        const zs = w.pos.z;
        while (true) {
          const x = -36 + rnd() * 34;
          yield* walk(w, [v(x, 0, zs + (rnd() - 0.5) * 0.8)], 1.2 + rnd() * 0.3);
          let t = 0;
          const stay = 1 + rnd() * 4;
          while (t < stay) {
            t += yield;
            w.pose('idle', (t / 3) % 1);
          }
        }
      })(),
    );
  }

  // ── 看戏模式（没有玩家）：总监自己沿南边吹沙 ──
  if (director && !play) {
    director.obj.userData.setProp?.('blower');
    director.obj.userData.setBlowSweep?.(false);
    const route = (ROUTES.find((r) => r.id === 'blow')?.pts ?? []).map((p) => at(p));
    spawn(
      (function* (): Co {
        while (true) {
          for (let i = 1; i < route.length; i++) {
            const a = route[i - 1];
            const b = route[i];
            const L = flat(a, b);
            let t = 0;
            while (t < L / 0.55) {
              const dt = yield;
              t += dt;
              director.pos.lerpVectors(a, b, t / (L / 0.55));
              director.yaw = turnTo(director.yaw, 0.15 * Math.sin(now * 0.7), dt * 4);
              director.pose('blow', (now / 2.4) % 1);
              sync(director);
              director.obj.updateMatrixWorld(true);
              const n = director.obj.userData.nozzle?.() as V3 | undefined;
              const d = director.obj.userData.nozzleDir?.() as V3 | undefined;
              if (n && d) blowAt(n, d, dt);
            }
          }
          yield* walk(director, [...route].reverse().slice(1), 1.6);
        }
      })(),
    );
  }

  // ── 一串球（倒进球车 / 发球机）──
  const pourBalls = (from: V3, to: V3, n: number, dur: number) => {
    const k = Math.min(n, 12);
    for (let i = 0; i < k; i++) {
      const f = flyer(AREA_W);
      f.vanish = true;
      const t0 = now + (i / k) * dur * 0.7;
      const a = from.clone().add(v((rnd() - 0.5) * 0.2, 0, (rnd() - 0.5) * 0.2));
      const b = to.clone().add(v((rnd() - 0.5) * 0.2, 0, (rnd() - 0.5) * 0.2));
      f.p.copy(a);
      f.segs = [seg(t0, a, b, 0.35 + rnd() * 0.1)];
      f.mesh.visible = false;
    }
  };

  let noiseT = 0;
  let noisedPoint = -1;
  const update = (dt: number) => {
    now += dt;
    if (state.phase === 'rally' && inMatch(directorAt)) interrupted = true;
    // 比赛中在附近开吹叶机：吵
    if (blowing && state.phase === 'rally' && directorAt && flat(directorAt, v(MX, 0, MZ)) < 15) noiseT += dt;
    if (noiseT > 3 && noisedPoint !== state.points) {
      noiseT = 0;
      noisedPoint = state.points;
      complain(players[0].id, players[0].obj, '好吵！');
    }
    blowing = false;
    main.next(dt);
    for (let i = bg.length - 1; i >= 0; i--) if (bg[i].next(dt).done) bg.splice(i, 1);
    for (const a of [...kids, ...players, teen]) {
      if (a.ctl) drive(a, dt);
      sync(a);
    }
    for (const w of walkers) sync(w);
    updateCoach(dt);
    updateParents(dt);
    updateWaiting(dt);
    updateEnv(dt);
    updateFlyers(dt);
    updateDust(dt);
    for (const [k, b] of bubbles) if (now > b.until) bubbles.delete(k);
  };

  const bubbleOut: Bubble[] = [];
  return {
    update,
    state,
    bubbles: () => {
      bubbleOut.length = 0;
      for (const [who, b] of bubbles) bubbleOut.push({ text: b.text, who, obj: b.a, dy: b.h });
      return bubbleOut;
    },
    people: () => [...players, teen, coach, ...walkers].map((a) => ({ x: a.pos.x, z: a.pos.z, r: 0.34 })),
    setDirector: (p) => {
      directorAt = p ? p.clone() : null;
    },
    blowAt,
    collect: (x, z, r, max) => {
      let n = 0;
      for (const g of [looseW, looseE]) {
        while (n < max) {
          const i = g.userData.nearest(x, z, r) as number;
          if (i < 0) break;
          g.userData.remove(i);
          n++;
        }
      }
      return n;
    },
    loose: () => ({ w: looseW.userData.count() as number, e: looseE.userData.count() as number }),
    cart: { count: () => state.cart, add: (n) => setCart(state.cart + n), obj: cartObj },
    machine: { count: () => state.machine, add: (n) => setMachine(state.machine + n), obj: machineObj },
    hopper: { count: () => state.hopper, set: setHopper, obj: hopperObj },
    mist: { on: () => state.mist, set: setMist },
    member,
    matchFree: () => state.phase !== 'rally',
    phase: () => state.phase,
    pourBalls,
    courtReport: () => {
      const s = member.stats();
      return {
        sand: st0.sandVolume > 0 ? s.sandVolume / st0.sandVolume : 0,
        water: st0.puddle > 0 ? s.puddle / st0.puddle : 0,
      };
    },
    debug: () => ({
      now: +now.toFixed(2),
      phase: state.phase,
      cart: state.cart,
      machine: state.machine,
      hopper: state.hopper,
      complaints: state.complaints,
      score: state.score,
      games: state.games,
      loose: { w: looseW.userData.count(), e: looseE.userData.count() },
      line: line.map((k) => k.id),
      flyers: flyers.filter((f) => f.on).length,
      lastGood: +lastGood.toFixed(1),
    }),
  };
}

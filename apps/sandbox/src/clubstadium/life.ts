// clubstadium 的演出（stage 3）：一场表演赛从进场到散场，一圈一圈地循环。
// 没有模拟：一切按演出时钟（固定 1/60 秒一步）+ 种子随机流（ctx.rng('stadium-life')）推，不用 Math.random。
//
// 一圈（≈ 4 分钟）：
//   开场前（pre）  倒计时；观众按块从座位下面冒出来（crowd.setFill，一块一块地进场），找座位的人沿西头端梯 → 横走道 → 走道下去；
//                  球员、裁判、球童在西头球员通道外等着。倒计时到了还有沙堆盖着场边（sandMax ≥ SAND_BLOCK）→ 推迟开场：
//                  裁判冒"场边有沙，推迟"，看台嘘、一块一块走掉一些人（这一场的上座率掉下去）。
//   出场（walkout） 球员、裁判、球童从拱门走进来（看台站起来欢呼），裁判从北边爬上椅子，球童蹲到网柱旁、站到四个底线角。
//   比赛（point）   单打，抢 GAMES 局（无占先）。击球不等球（同 clubclay / desert3d-v2）：出手那一刻算好整条轨迹，
//                  接球的人立刻起动，挥拍按"拍面到击球点的时刻 = 球到的时刻"倒推。看台的头跟着球。
//                  一分打完：全场举手鼓掌（帽子跟着一抖一抖）、前几排一半人站起来；好球（制胜分、6 拍以上）全场起立欢呼。
//                  球童跑去把停住的球捡回来。记分牌翻分，裁判举手报分。
//                  底线被踩出的磨损（lines）：出界的球落在磨淡的线附近 → "压线了！"争议，耽误一会儿、看台嘘。
//   换边（changeover） 单数局以后：两人走到各自的球员席坐下；球童撑伞站在旁边、另一个递毛巾；冰箱补过水的喝水，没补的冒"没水了！"；
//                  伞没撑开的冒"好晒"。第一次换边看台起一圈人浪。换边的时候场地放开（总监能进场吹沙）。
//   散场（end → exit） 全场起立欢呼，两人到网前握手、朝看台挥手、从拱门走掉；球童收伞；看台一块一块走空，座位前留下杯子（cups）。
// 场地在比赛中关着（state.courtClosed：play.ts 照它挡导航）；只在总监不在 MATCH_RECT 里的时候才关（在里面 → 裁判冒"请离场"，等他出去）。
// 截图 / 调试钩子：window.__stadium.life = { state, ball(), debug(), skip(phase) }
import * as THREE from 'three';
import { seatList } from './assets/stands/seats';
import type { AssetCtx } from './ctx';
import { DIM, MATCH_RECT, northTread, S, SPOTS, STANDS, standY, type V2 } from './layout';

type V3 = THREE.Vector3;
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const Y = new THREE.Vector3(0, 1, 0);
const lerp = THREE.MathUtils.lerp;
const clamp = THREE.MathUtils.clamp;
const smooth01 = (u: number) => {
  const k = clamp(u, 0, 1);
  return k * k * (3 - 2 * k);
};
const turnTo = (a: number, b: number, k: number) => {
  let d = b - a;
  d -= Math.round(d / (Math.PI * 2)) * Math.PI * 2;
  return a + d * Math.min(1, k);
};
const flat = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(b.x - a.x, b.z - a.z);

// ── 场地本地坐标（u 沿长边、东 +；w 横、南 +）──
const NX = S.x;
const NZ = S.z;
const HL = DIM.L / 2;
const HW = DIM.SW / 2;
const HDW = DIM.DW / 2;
const SVC = DIM.SVC;
const W = (u: number, w: number, y = 0) => v(NX + u, y, NZ + w);
const NET_HZ = DIM.DW / 2 + DIM.post;
const NET_H = 0.95;

const G = 9.8;
const SWING = 0.72;
const C_STROKE = 0.485;
const SERVE_DUR = 1.35;
const TOSS_AT = 0.1;

/** 球员席：长椅中心、座位（本地 x，靠外那把在伞底下）、坐下时的 z（座面中心）和起身站的 z */
const BENCH = [
  { x: SPOTS.benchW[0], z: SPOTS.benchW[1], out: -1 },
  { x: SPOTS.benchE[0], z: SPOTS.benchE[1], out: 1 },
];
/** 球员从场上去球员席：网柱和裁判椅之间那一条（z −27.95） */
const WALK_Z = -27.95;
/** 沙堆盖到这么厚 = 比赛不能开始 */
export const SAND_BLOCK = 0.55;
/** 杯子最多攒多少（不收就一场一场地堆） */
const CUPS_MAX = 90;

interface Swing {
  name: string;
  t0: number;
  dur: number;
}
interface Ctl {
  netYaw: number;
  move: { t0: number; t1: number; from: V3; to: V3 } | null;
  swings: Swing[];
  readyPh: number;
}
interface Actor {
  id: string;
  obj: THREE.Object3D;
  pos: V3;
  yaw: number;
  walkPh: number;
  /** 不是走路时的姿势（站定以后回到它） */
  rest: [string, number];
  restPh: number;
  pose(name: string, ph?: number): void;
  ctl: Ctl | null;
  contact: Map<string, V3>;
  serveC: number;
  rigBalls: THREE.Object3D[];
  /** 正在被协程摆弄（走路、坐下、递东西）：rest 姿势不自己播 */
  busy: boolean;
}
function actor(id: string, obj: THREE.Object3D, rest: [string, number] = ['idle', 3]): Actor {
  return {
    id,
    obj,
    pos: obj.position.clone(),
    yaw: obj.rotation.y,
    walkPh: 0,
    rest,
    restPh: 0,
    pose: (n, ph) => obj.userData.pose?.(n, ph),
    ctl: null,
    contact: new Map(),
    serveC: 0.68,
    rigBalls: [],
    busy: false,
  };
}

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

/** crowd 资产的接口（assets/crowd.ts 的 userData.crowd） */
interface CrowdApi {
  setMode(m: 'idle' | 'clap' | 'cheer' | 'wave'): void;
  cheer(strength?: number, seconds?: number, x?: number, r?: number): void;
  wave(dir?: number): void;
  lookAt(p: THREE.Vector3 | { x: number; y?: number; z?: number } | number | null): void;
  fill(f: number, seconds?: number): void;
  setFill(block: number, f: number, seconds?: number): void;
  count: number;
  blocks: number[];
  mode: string;
}

export type Phase = 'pre' | 'delay' | 'walkout' | 'point' | 'between' | 'changeover' | 'end' | 'exit';

export interface StadiumLife {
  update(dt: number): void;
  state: {
    phase: Phase;
    /** 开场倒计时（秒） */
    countdown: number;
    /** 第几场 */
    match: number;
    games: [number, number];
    score: [number, number];
    /** 谁发球（0 = A） */
    serve: 0 | 1;
    /** A 在哪边：−1 西、1 东 */
    sideA: number;
    points: number;
    shots: number;
    lastPoint: number;
    /** 推迟开场的秒数（这一场） */
    delayed: number;
    /** 压线争议次数 */
    disputes: number;
    /** 换边时没水喝、晒着的次数 */
    complaints: number;
    /** 比赛中：场地不让进（play.ts 挡导航） */
    courtClosed: boolean;
    /** 这一场的上座率（0..1） */
    attendance: number;
    /** 看台上的杯子 */
    cups: number;
    /** 两个球员席：伞撑开了没、冰箱补了没 */
    benches: { umbrella: boolean; cooler: boolean }[];
  };
  ball(): { x: number; y: number; z: number; on: boolean };
  /** 走动的人（总监导航时当挡路的圆） */
  people(): { x: number; z: number; r: number }[];
  scoreText(): string;
  setDirector(p: V3 | null): void;
  /** 三个沙堆（assets/sand-drift.ts） */
  drifts: { id: string; obj: THREE.Object3D }[];
  sandMax(): number;
  /** 底线（磨损）：线好的比例；在 (x, z) 处刷一下（划线车的出漆嘴）→ 那里的线段变回新的，返回刷新了几段 */
  lineGood(): number;
  paintAt(x: number, z: number): number;
  /** 吹叶机在 (x, z, 高度 y) 往看台上吹：附近几排的杯子往走道滑、到走道就收走；返回这一步收了几个 */
  blowCups(x: number, y: number, z: number, dt: number): number;
  /** 离 (x, z) 最近的杯子的水平距离（没有 = Infinity）：给按钮判断"附近有没有杯子" */
  nearestCup(x: number, z: number): number;
  /** 球员席 i 撑伞补水（总监做完一次性的活） */
  prepBench(i: number): void;
  debug(): unknown;
  /** 调试：跳到某一段（截图用）：'match' = 直接开打，'changeover'、'exit' */
  skip(what: 'match' | 'changeover' | 'exit'): void;
}

export interface LifeOpts {
  ctx: AssetCtx;
  scene: THREE.Object3D;
  objs: Map<string, THREE.Object3D>;
  /** 气泡（play.say）；看戏模式没有 */
  say?: (anchor: THREE.Object3D | THREE.Vector3, text: string, sec?: number, dy?: number) => void;
  toast?: (text: string, sec?: number) => void;
  /** 一场抢几局 */
  games?: number;
  /** 开场前倒计时（秒） */
  preSeconds?: number;
  /** 看戏模式：没有总监，沙堆、伞、冰箱、杯子都自己好 */
  auto?: boolean;
}

export function createLife(o: LifeOpts): StadiumLife {
  const { ctx, scene, objs } = o;
  const rnd = ctx.rng('stadium-life');
  const GAMES = Math.max(1, o.games ?? 2);
  const PRE = o.preSeconds ?? 40;
  const auto = !!o.auto;
  const get = (id: string) => objs.get(id) ?? null;
  const say = (a: THREE.Object3D | THREE.Vector3 | null, text: string, sec = 1.8, dy?: number) => {
    if (a) o.say?.(a, text, sec, dy);
  };
  const toast = (t: string, sec?: number) => o.toast?.(t, sec);

  const state: StadiumLife['state'] = {
    phase: 'pre',
    countdown: PRE,
    match: 1,
    games: [0, 0],
    score: [0, 0],
    serve: 0,
    sideA: -1,
    points: 0,
    shots: 0,
    lastPoint: 0,
    delayed: 0,
    disputes: 0,
    complaints: 0,
    courtClosed: false,
    attendance: 1,
    cups: 0,
    benches: [
      { umbrella: auto, cooler: auto },
      { umbrella: auto, cooler: auto },
    ],
  };
  let now = 0;
  let directorAt: V3 | null = null;
  const inMatchRect = (p: { x: number; z: number } | null) =>
    !!p && p.x > MATCH_RECT.x0 && p.x < MATCH_RECT.x1 && p.z > MATCH_RECT.z0 && p.z < MATCH_RECT.z1;

  // ── 球（一个）+ 地上的小影子 ──
  const R = ctx.texel * 1.1;
  const ballMesh = new THREE.Mesh(
    new THREE.IcosahedronGeometry(R, 1),
    ctx.mat('ball', { noShadowReceive: true, bands: [-2, -1] }),
  );
  ballMesh.castShadow = false;
  ballMesh.visible = false;
  ballMesh.name = 'stadium-life:ball';
  scene.add(ballMesh);
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(ctx.texel * 1.3, 8).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x24305a, transparent: true, opacity: 0.45, depthWrite: false }),
  );
  shadow.layers.set(ctx.layers.FX);
  shadow.visible = false;
  scene.add(shadow);
  const COURT_Y = 0.024;
  const GROUND = COURT_Y + R;
  // 白模里定格的那颗球（ball-fly 占位）不要了
  const still = get('ball');
  if (still) still.visible = false;

  interface Seg {
    t0: number;
    t1: number;
    p0: V3;
    v0: V3;
    bounce: boolean;
  }
  const ball = {
    p: new THREE.Vector3(),
    v: new THREE.Vector3(),
    on: false,
    free: false,
    segs: [] as Seg[],
    rest: 0,
    freeT: 0,
  };
  const launch = (p0: V3, p1: V3, T: number) =>
    v((p1.x - p0.x) / T, (p1.y - p0.y + 0.5 * G * T * T) / T, (p1.z - p0.z) / T);
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
  const segVel = (s: Seg, t: number, out: V3) => out.set(s.v0.x, s.v0.y - G * (t - s.t0), s.v0.z);
  /** 最近一次落地点（争议用） */
  const lastBounce = new THREE.Vector3(1e4, 0, 1e4);
  const physics = (dt: number) => {
    if (!ball.on || !ball.free) return;
    ball.freeT += dt;
    const h = dt / 3;
    for (let s = 0; s < 3; s++) {
      if (ball.rest > 0.4) break;
      ball.v.y -= G * h;
      const px = ball.p.x;
      ball.p.addScaledVector(ball.v, h);
      if (Math.sign(px - NX) !== Math.sign(ball.p.x - NX) && Math.abs(ball.p.z - NZ) < NET_HZ && ball.p.y < NET_H) {
        ball.p.x = NX + Math.sign(px - NX) * (R + 0.03);
        ball.v.x = -ball.v.x * 0.15;
        ball.v.z *= 0.5;
        ball.v.y *= 0.3;
      }
      // 场地四周：西头敞口外是沙地（球滚过去也停在场边），北边广告板、南看台、东看台
      if (ball.p.x < -17.8 || ball.p.x > 17.8) {
        ball.p.x = clamp(ball.p.x, -17.8, 17.8);
        ball.v.x = -ball.v.x * 0.3;
      }
      if (ball.p.z < -29.75 || ball.p.z > -12.2) {
        ball.p.z = clamp(ball.p.z, -29.75, -12.2);
        ball.v.z = -ball.v.z * 0.3;
      }
      if (ball.p.y < GROUND) {
        ball.p.y = GROUND;
        if (ball.v.y < -1.2) {
          ball.v.y = -ball.v.y * 0.68;
          ball.v.x *= 0.85;
          ball.v.z *= 0.85;
        } else {
          ball.v.y = 0;
          const f = Math.exp(-1.2 * h);
          ball.v.x *= f;
          ball.v.z *= f;
        }
      }
    }
    if (ball.p.y <= GROUND + 0.002 && Math.hypot(ball.v.x, ball.v.z) < 0.1) {
      ball.v.set(0, 0, 0);
      ball.rest += dt;
    } else ball.rest = 0;
  };
  let lastNow = 0;
  const updateBall = (dt: number) => {
    if (ball.on && !ball.free && ball.segs.length) {
      while (ball.segs.length && now >= ball.segs[0].t1) {
        const s = ball.segs.shift() as Seg;
        if (s.bounce && s.t1 > lastNow) segAt(s, s.t1, lastBounce);
        if (!ball.segs.length) {
          segAt(s, s.t1, ball.p);
          segVel(s, s.t1, ball.v);
          if (s.bounce) {
            ball.v.y = -ball.v.y * 0.68;
            ball.v.x *= 0.85;
            ball.v.z *= 0.85;
          }
          ball.free = true;
          ball.rest = 0;
          ball.freeT = 0;
        }
      }
      if (ball.segs.length && now >= ball.segs[0].t0) segAt(ball.segs[0], now, ball.p);
    }
    physics(dt);
    ballMesh.visible = shadow.visible = ball.on;
    if (ball.on) {
      ballMesh.position.copy(ball.p);
      shadow.position.set(ball.p.x, COURT_Y + 0.012, ball.p.z + Math.max(0, ball.p.y - COURT_Y) * 0.35);
    }
  };

  // ── 底线的磨损（两条底线，每 0.27 米一段）：盖一块和内场同色的小片 = 线断了一截 ──
  const SEG_L = 0.27;
  const LW = 0.18;
  const NSEG = Math.ceil((HDW * 2) / SEG_L);
  const lineSegs: { x: number; z: number; wear: number; thr: number }[] = [];
  for (const s of [-1, 1])
    for (let i = 0; i < NSEG; i++) {
      const z = NZ - HDW + (i + 0.5) * SEG_L;
      // 中间（发球、底线对打站的地方）磨得最厉害
      const near = Math.max(Math.exp(-(((z - NZ - 1.6) / 1.6) ** 2)), Math.exp(-(((z - NZ + 1.6) / 1.6) ** 2)));
      lineSegs.push({ x: s * HL, z, wear: 0.15 + 0.85 * near * (0.7 + rnd() * 0.3), thr: 0.18 + rnd() * 0.72 });
    }
  const patchMesh = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(LW + 0.04, SEG_L + 0.01).rotateX(-Math.PI / 2),
    ctx.mat('courtShow'),
    lineSegs.length,
  );
  patchMesh.name = 'stadium-life:line-wear';
  patchMesh.castShadow = false;
  patchMesh.receiveShadow = true;
  patchMesh.frustumCulled = false;
  ctx.mats.prepare(patchMesh);
  scene.add(patchMesh);
  const m4 = new THREE.Matrix4();
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  let patchDirty = true;
  const drawPatches = () => {
    if (!patchDirty) return;
    patchDirty = false;
    lineSegs.forEach((sg, i) => {
      patchMesh.setMatrixAt(i, sg.wear > sg.thr ? m4.makeTranslation(sg.x, 0.034, sg.z) : ZERO);
    });
    patchMesh.instanceMatrix.needsUpdate = true;
  };
  const wearAt = (x: number, z: number, r: number, amount: number) => {
    for (const sg of lineSegs) {
      if (Math.abs(sg.x - x) > 0.7 || Math.abs(sg.z - z) > r) continue;
      const before = sg.wear > sg.thr;
      sg.wear = Math.min(1, sg.wear + amount);
      if (sg.wear > sg.thr !== before) patchDirty = true;
    }
  };
  const segAtPt = (x: number, z: number) => {
    let best: (typeof lineSegs)[number] | null = null;
    let d = 1e9;
    for (const sg of lineSegs) {
      if (Math.abs(sg.x - x) > 1.0) continue;
      const dd = Math.abs(sg.z - z);
      if (dd < d) {
        d = dd;
        best = sg;
      }
    }
    return d < SEG_L ? best : null;
  };

  // ── 杯子：散场后留在北看台座位前的踏面上（InstancedMesh，白 / 红两种）──
  const cupGeo = new THREE.BoxGeometry(0.16, 0.22, 0.16).translate(0, 0.11, 0);
  const cupMats = [
    ctx.mat('clothWhite', { noShadowReceive: true, lightUp: 0.6, bands: [-0.45, 0.3], edge: 0.3 }),
    ctx.mat('clothRed', { noShadowReceive: true, lightUp: 0.6, bands: [-0.45, 0.3], edge: 0.3 }),
  ];
  const cupMeshes = cupMats.map((m, k) => {
    const im = new THREE.InstancedMesh(cupGeo, m, CUPS_MAX);
    im.name = `stadium-life:cups:${k}`;
    im.castShadow = false;
    im.receiveShadow = false;
    im.frustumCulled = false;
    ctx.mats.prepare(im);
    scene.add(im);
    return im;
  });
  interface Cup {
    x: number;
    y: number;
    z: number;
    row: number;
    color: number;
    /** 被吹着往哪条走道滑（null = 没在动） */
    to: number | null;
    yaw: number;
  }
  const cups: Cup[] = [];
  let cupsDirty = true;
  const northSeats = seatList().filter((s) => s.stand === 'north' && s.block >= 0);
  const spawnCups = (block: number, n: number) => {
    const pool = northSeats.filter((s) => s.block === block);
    for (let k = 0; k < n && cups.length < CUPS_MAX && pool.length; k++) {
      const s = pool[Math.floor(rnd() * pool.length)];
      const t = northTread(s.row);
      cups.push({
        x: s.x + (rnd() - 0.5) * 0.3,
        y: t.y,
        z: s.z + 0.4 + rnd() * 0.12,
        row: s.row,
        color: rnd() < 0.3 ? 1 : 0,
        to: null,
        yaw: rnd() * Math.PI,
      });
    }
    cupsDirty = true;
  };
  const drawCups = () => {
    if (!cupsDirty) return;
    cupsDirty = false;
    const n = [0, 0];
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    for (const c of cups) {
      const im = cupMeshes[c.color];
      m4.compose(v(c.x, c.y, c.z), q.setFromAxisAngle(Y, c.yaw), one);
      im.setMatrixAt(n[c.color]++, m4);
    }
    cupMeshes.forEach((im, k) => {
      im.count = n[k];
      im.instanceMatrix.needsUpdate = true;
    });
    state.cups = cups.length;
  };
  /** 一团小尘（收走杯子、吹沙的时候；FX 层） */
  const PUFFS = 18;
  const puffMesh = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 0),
    ctx.mat('sandHigh', { noShadowReceive: true, lightUp: 0.6, bands: [-0.4, 0.3] }),
    PUFFS,
  );
  puffMesh.layers.set(ctx.layers.FX);
  puffMesh.castShadow = false;
  puffMesh.frustumCulled = false;
  scene.add(puffMesh);
  const puffs = Array.from({ length: PUFFS }, () => ({ life: 1, max: 1, p: new THREE.Vector3(), s: 0.1 }));
  let puffNext = 0;
  const puff = (p: V3, size = 0.16) => {
    const P = puffs[puffNext];
    puffNext = (puffNext + 1) % PUFFS;
    P.life = 0;
    P.max = 0.35 + rnd() * 0.25;
    P.s = size * (0.7 + rnd() * 0.5);
    P.p.copy(p);
  };
  const updatePuffs = (dt: number) => {
    puffs.forEach((P, i) => {
      if (P.life >= P.max) {
        puffMesh.setMatrixAt(i, ZERO);
        return;
      }
      P.life += dt;
      const u = P.life / P.max;
      const s = P.s * Math.sin(Math.min(1, u) * Math.PI) * (1 + u * 0.6);
      m4.makeScale(s * 1.4, s * 0.8, s).setPosition(P.p.x, P.p.y + s * 0.4 + u * 0.15, P.p.z);
      puffMesh.setMatrixAt(i, m4);
    });
    puffMesh.instanceMatrix.needsUpdate = true;
  };

  // ── 人 ──
  const need = (id: string) => {
    const x = get(id);
    if (!x) throw new Error(`clubstadium life: 缺 ${id}`);
    return x;
  };
  const A = actor('player-a', need('player-a'));
  const B = actor('player-b', need('player-b'));
  const players = [A, B];
  const umpObj = get('umpire');
  const ump = umpObj ? actor('umpire', umpObj, ['sit', 3.2]) : null;
  const KID_IDS = ['kid-net-n', 'kid-net-s', 'kid-nw', 'kid-ne', 'kid-sw', 'kid-se'] as const;
  const KID_SPOT: Record<string, V2> = {
    'kid-net-n': SPOTS.kidNetN,
    'kid-net-s': SPOTS.kidNetS,
    'kid-nw': SPOTS.kidNW,
    'kid-ne': SPOTS.kidNE,
    'kid-sw': SPOTS.kidSW,
    'kid-se': SPOTS.kidSE,
  };
  const kids = KID_IDS.map((id) => {
    const obj = need(id);
    // 球童是少年比例（clubsite/people 的 TEEN），玩法模式里不再缩小（白模里的 0.74 是球员缩出来的占位）
    obj.scale.setScalar(1);
    obj.userData.setProp?.(null);
    return actor(id, obj, id.startsWith('kid-net') ? ['bkCrouch', 2.4] : ['bkStand', 3.2]);
  });
  const kid = (id: (typeof KID_IDS)[number]) => kids[KID_IDS.indexOf(id)];
  const crowdObj = get('crowd');
  const crowd = (crowdObj?.userData.crowd as CrowdApi | undefined) ?? null;
  const NBLOCKS = crowd?.blocks.length ?? 0;
  const board = get('scoreboard');
  const umbrellas = [get('umbrella-w'), get('umbrella-e')];
  const benchObjs = [get('bench-w'), get('bench-e')];
  const drifts = ['sand-sw', 'sand-nw', 'sand-ne'].map((id) => ({ id, obj: need(id) }));
  // NPC：找座位的、卖水的、长廊上走的
  const seeker = get('spec-aisle-w') ? actor('seeker', need('spec-aisle-w')) : null;
  const vendor = get('vendor') ? actor('vendor', need('vendor')) : null;
  const strollers = ['member-prom-1', 'member-prom-2']
    .map(get)
    .filter(Boolean)
    .map((x, i) => actor(`walk-${i}`, x as THREE.Object3D));
  const watchers = ['spec-south', 'member-drink'].map(get).filter(Boolean) as THREE.Object3D[];
  const everyone = [
    ...players,
    ...(ump ? [ump] : []),
    ...kids,
    ...(seeker ? [seeker] : []),
    ...(vendor ? [vendor] : []),
    ...strollers,
  ];

  // 伞：开局收着（总监开场前撑开）；看戏模式撑开
  const umbOpen = umbrellas.map((): number => (auto ? 1 : 0));
  const umbShown = umbrellas.map((): number => -1);
  const syncUmbrellas = (dt: number) => {
    umbrellas.forEach((u, i) => {
      if (!u) return;
      const want = state.benches[i].umbrella ? 1 : 0;
      umbOpen[i] = want > umbOpen[i] ? Math.min(want, umbOpen[i] + dt * 1.2) : Math.max(want, umbOpen[i] - dt * 1.2);
      const q = Math.round(umbOpen[i] * 8) / 8;
      if (q !== umbShown[i]) {
        umbShown[i] = q;
        u.userData.setOpen?.(0.06 + q * 0.94);
      }
    });
  };

  const sync = (a: Actor) => {
    a.obj.position.copy(a.pos);
    a.obj.rotation.y = a.yaw;
  };

  // 量拍面（同 clubclay）
  const measure = (a: Actor) => {
    const head = findRacketHead(a.obj);
    const fallback: Record<string, V3> = {
      forehand: v(-0.85, 0.85, 0.35),
      backhand: v(0.85, 0.85, 0.35),
      serve: v(-0.4, 1.95, 0.15),
    };
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
      } else a.contact.set(name, fallback[name]);
    }
    a.contact.set('serve', fallback.serve);
    if (head) {
      let best = -1;
      for (let ph = 0.5; ph <= 0.8; ph += 0.01) {
        a.pose('serve', ph);
        a.obj.updateMatrixWorld(true);
        const h = headWorld(head);
        if (h.y > best + 0.005) {
          best = h.y;
          a.serveC = ph;
          a.contact.set('serve', h);
        }
      }
    }
    a.obj.traverse((x) => {
      const m = x as THREE.Mesh;
      if (m.isMesh && m.parent === a.obj && m.geometry.type === 'SphereGeometry') a.rigBalls.push(m);
    });
    a.obj.position.copy(p0);
    a.obj.rotation.y = r0;
    a.pose('idle', 0);
  };
  for (const a of players) measure(a);
  const contactAt = (a: Actor, name: string, stand: V3, yaw: number) =>
    (a.contact.get(name) as V3).clone().applyAxisAngle(Y, yaw).add(stand);
  const rightOf = (yaw: number) => v(-1, 0, 0).applyAxisAngle(Y, yaw);
  const sideOf = (i: number) => (i === 0 ? state.sideA : -state.sideA);
  const idx = (a: Actor) => (a === A ? 0 : 1);
  const netYaw = (side: number) => (side > 0 ? -Math.PI / 2 : Math.PI / 2);

  /** 比赛的时间轴驱动（同 clubclay） */
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
    } else if (speed > 0.7) {
      a.walkPh = (a.walkPh + (speed * dt) / 1.6) % 1;
      a.pose('walk', a.walkPh);
    } else {
      c.readyPh = (c.readyPh + dt / 0.55) % 1;
      a.pose('ready', c.readyPh);
    }
    // 踩线：站在底线附近的人慢慢把线磨淡
    if (Math.abs(Math.abs(a.pos.x - NX) - HL) < 0.7 && Math.abs(a.pos.z - NZ) < HDW)
      wearAt(a.pos.x, a.pos.z, 0.45, dt * 0.012);
  };
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
  function* until(cond: () => boolean, max = 60): Co {
    let t = 0;
    while (!cond() && t < max) t += yield;
  }
  /** 走一串点（高度：看台上的走道 / 端梯 / 横走道按 standY，别处 0） */
  function* walk(a: Actor, pts: (V3 | V2)[], speed = 1.5, stride = 1.25): Co {
    a.busy = true;
    for (const q of pts) {
      const p = Array.isArray(q) ? v(q[0], 0, q[1]) : (q as V3);
      while (true) {
        const dt = yield;
        const dx = p.x - a.pos.x;
        const dz = p.z - a.pos.z;
        const L = Math.hypot(dx, dz);
        const step = speed * dt;
        if (L <= step) {
          a.pos.x = p.x;
          a.pos.z = p.z;
          a.pos.y = standY(a.pos.x, a.pos.z) ?? 0;
          break;
        }
        a.pos.x += (dx / L) * step;
        a.pos.z += (dz / L) * step;
        a.pos.y = standY(a.pos.x, a.pos.z) ?? 0;
        a.yaw = turnTo(a.yaw, Math.atan2(dx, dz), dt * 10);
        a.walkPh = (a.walkPh + step / stride) % 1;
        a.pose('walk', a.walkPh);
      }
    }
    a.busy = false;
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
  /** 站定以后回到自己的姿势（循环），朝 yaw */
  const settle = (a: Actor, rest: [string, number], yaw?: number) => {
    a.rest = rest;
    a.restPh = rnd();
    if (yaw !== undefined) a.yaw = yaw;
    a.busy = false;
  };

  // ── 球童 ──
  const kidHome = (k: Actor) => {
    const [x, z] = KID_SPOT[k.id];
    return v(x, 0, z);
  };
  const kidYaw = (k: Actor) => {
    // 网柱旁的朝场地中间，底线角的朝网
    if (k.id === 'kid-net-n') return 0;
    if (k.id === 'kid-net-s') return Math.PI;
    const [x, z] = KID_SPOT[k.id];
    return Math.atan2(NX - x, NZ - z) + (x < 0 ? 0.4 : -0.4) * Math.sign(z - NZ);
  };
  let fetching: Actor | null = null;
  function* fetchBall(): Co {
    const p = ball.p.clone();
    let best: Actor | null = null;
    let d = 1e9;
    for (const k of kids) {
      if (k.busy) continue;
      const dd = flat(k.pos, p);
      if (dd < d) {
        d = dd;
        best = k;
      }
    }
    if (!best) return;
    const k = best;
    fetching = k;
    const home = kidHome(k);
    yield* walk(k, [v(p.x + (k.pos.x > p.x ? 0.35 : -0.35), 0, p.z)], 3.4, 1.05);
    k.busy = true;
    let t = 0;
    while (t < 0.5) {
      t += yield;
      k.pose('pickup', Math.min(1, t / 0.5));
      if (t > 0.25) ball.on = false;
    }
    yield* walk(k, [home], 3.0, 1.05);
    fetching = null;
    settle(k, k.rest, kidYaw(k));
  }

  // ── 击球 ──
  interface Shot {
    hitter: Actor;
    recv: Actor;
    t1: number;
    P1: V3;
  }
  const planReceive = (r: Actor, target: V3, tc: number) => {
    const yaw = (r.ctl as Ctl).netYaw;
    const side = rightOf(yaw);
    const rel = (target.x - r.pos.x) * side.x + (target.z - r.pos.z) * side.z;
    const stroke = rel > -0.5 ? 'forehand' : 'backhand';
    const off = (r.contact.get(stroke) as V3).clone().applyAxisAngle(Y, yaw);
    const s = Math.sign(r.pos.x - NX) || 1;
    const du = Math.abs(target.x - off.x - NX);
    const stand = v(NX + s * clamp(du, HL - 2.4, HL + 2.8), 0, clamp(target.z - off.z, NZ - HDW - 1.3, NZ + HDW + 1.3));
    const P1 = contactAt(r, stroke, stand, yaw);
    moveTo(r, stand, now + 0.1, tc - 0.32, tc - 0.04);
    (r.ctl as Ctl).swings.push({ name: stroke, t0: tc - C_STROKE * SWING, dur: SWING });
    return P1;
  };
  const recover = (a: Actor, t0: number) => {
    const s = Math.sign(a.pos.x - NX) || 1;
    const to = v(NX + s * (HL + 0.6), 0, NZ + (a.pos.z - NZ) * 0.3);
    (a.ctl as Ctl).move = {
      t0: t0 + 0.25,
      t1: t0 + 0.25 + Math.max(0.6, flat(a.pos, to) / 3.2),
      from: a.pos.clone(),
      to,
    };
  };
  type Kind = 'rally' | 'winner' | 'out' | 'net';
  let outLong = false;
  const hit = (hitter: Actor, P0: V3, kind: Kind, tHit: number, serve: boolean): Shot | null => {
    state.shots++;
    const recv = hitter === A ? B : A;
    const rs = sideOf(idx(recv));
    ball.on = true;
    ball.rest = 0;
    if (recv.ctl) recv.ctl.readyPh = 0.25;
    if (kind === 'net') {
      const tgt = v(NX + rs * 0.12, 0.4, lerp(P0.z, NZ, 0.4) + (rnd() - 0.5) * 2);
      const T = flat(P0, tgt) / 12;
      ball.free = true;
      ball.segs = [];
      ball.p.copy(P0);
      ball.v.copy(launch(P0, tgt, T));
      ball.p.addScaledVector(ball.v, now - tHit);
      return null;
    }
    const vh = serve ? 18 + rnd() * 2 : 14 + rnd() * 3;
    if (kind === 'out' || kind === 'winner') {
      // 出界：六成是长了（落在底线后面一点 —— 磨淡的线附近就有争议），其余是边线外
      outLong = kind === 'out' && rnd() < 0.65;
      const B0 =
        kind === 'out'
          ? outLong
            ? v(NX + rs * (HL + 0.12 + rnd() * 0.5), GROUND, NZ + (rnd() * 2 - 1) * 2.8)
            : v(NX + rs * (5 + rnd() * 5), GROUND, NZ + (rnd() < 0.5 ? -1 : 1) * (HW + 0.25 + rnd() * 0.8))
          : v(NX + rs * (6 + rnd() * 4), GROUND, NZ + (recv.pos.z > NZ ? -1 : 1) * (HW - 0.4 - rnd() * 1.0));
      ball.free = false;
      ball.segs = [seg(tHit, P0, B0, flat(P0, B0) / vh, true)];
      if (kind === 'winner' && recv.ctl) {
        const sx = Math.sign(recv.pos.x - NX) || 1;
        moveTo(
          recv,
          v(recv.pos.x - sx * 0.3, 0, lerp(recv.pos.z, B0.z, 0.5)),
          now + 0.25,
          tHit + flat(P0, B0) / vh + 0.4,
        );
      }
      return null;
    }
    const sw = rnd() < 0.5 ? -1 : 1;
    const target = serve
      ? v(NX + rs * (HL - 0.3 + rnd() * 0.9), 0.9, NZ + (Math.sign(recv.pos.z - NZ) || 1) * (1.4 + rnd() * 1.6))
      : v(NX + rs * (HL - 1.0 + rnd() * 2.0), 0.9, NZ + sw * rnd() * 3.4);
    const f = 0.76 + rnd() * 0.1;
    const B0 = serve
      ? v(NX + rs * (SVC - 0.5 - rnd() * 1.6), GROUND, NZ + (Math.sign(recv.pos.z - NZ) || 1) * (0.6 + rnd() * 2.6))
      : v(lerp(P0.x, target.x, f), GROUND, lerp(P0.z, target.z, f));
    const T1 = flat(P0, B0) / vh;
    const T2 = Math.max(0.4, flat(B0, target) / (vh * 0.7));
    const tc = tHit + T1 + T2;
    const P1 = planReceive(recv, target, tc);
    ball.free = false;
    ball.segs = [seg(tHit, P0, B0, T1, true), seg(tHit + T1, B0, P1, T2, false)];
    return { hitter, recv, t1: tc, P1 };
  };

  // ── 一分 ──
  const placements = (deuce: boolean) => {
    const srv = state.serve === 0 ? A : B;
    const rcv = srv === A ? B : A;
    const ss = sideOf(idx(srv));
    const right = ss > 0 ? -1 : 1;
    const sw = (deuce ? right : -right) * 1.3;
    return {
      srv,
      rcv,
      spots: new Map<Actor, V3>([
        [srv, W(ss * (HL + 0.35), sw)],
        [rcv, W(-ss * (HL + 0.4), -Math.sign(sw) * 2.6)],
      ]),
    };
  };
  let lastKind: Kind = 'rally';
  let lastShots = 0;
  function* point(): Generator<void, number, number> {
    const t0 = now;
    const deuce = (state.score[0] + state.score[1]) % 2 === 0;
    const { srv, spots } = placements(deuce);
    state.phase = 'between';
    for (const a of players) a.ctl = null;
    yield* all(...[...spots].map(([a, p]) => walk(a, [p], 2.4)));
    for (const a of players) {
      a.yaw = netYaw(Math.sign(a.pos.x - NX));
      a.pose('idle');
      sync(a);
    }
    // 总监在比赛的地方：等他出去（场地关上以后导航就挡住了）
    yield* clearCourt();
    for (const a of players) {
      a.ctl = { netYaw: a.yaw, move: null, swings: [], readyPh: rnd() };
      a.pose('ready', 0);
    }
    crowd?.setMode('idle');
    yield* wait(0.5);
    state.phase = 'point';
    const sc = srv.ctl as Ctl;
    const tServe = now + srv.serveC * SERVE_DUR;
    sc.swings.push({ name: 'serve', t0: now, dur: SERVE_DUR });
    const tToss = now + TOSS_AT * SERVE_DUR;
    const tossFrom = v(0.32, 1.05, 0.2).applyAxisAngle(Y, sc.netYaw).add(srv.pos);
    // 发球脚下也磨一下线
    wearAt(srv.pos.x, srv.pos.z, 0.4, 0.04);
    yield* until(() => now >= tToss);
    ball.on = true;
    ball.free = false;
    ball.p.copy(tossFrom);
    const P0 = contactAt(srv, 'serve', srv.pos, sc.netYaw);
    ball.segs = [seg(tToss, tossFrom, P0, tServe - tToss, false)];
    yield* until(() => now >= tServe);
    let shots = 1 + Math.floor(rnd() * 5) + (rnd() < 0.25 ? 4 : 0);
    const ending = (): Kind => {
      if (shots > 0) return 'rally';
      const r = rnd();
      return r < 0.4 ? 'out' : r < 0.55 ? 'net' : 'winner';
    };
    let k = ending();
    let shot = hit(srv, P0, k, tServe, true);
    recover(srv, tServe);
    let hitter: Actor = srv;
    let n = 1;
    while (shot) {
      const s = shot;
      yield* until(() => now >= s.t1);
      shots--;
      n++;
      hitter = s.recv;
      k = ending();
      shot = hit(s.recv, s.P1, k, s.t1, false);
      recover(s.recv, s.t1);
    }
    lastKind = k;
    lastShots = n;
    const winner = k === 'winner' ? idx(hitter) : 1 - idx(hitter);
    yield* until(() => ball.free && (ball.rest > 0.25 || ball.freeT > 2.4), 4);
    yield* wait(0.3);
    for (const a of players) {
      a.ctl = null;
      a.pose('idle');
    }
    // 压线争议：长了的出界球落在磨淡的那截线附近
    if (k === 'out' && outLong) {
      const sg = segAtPt(lastBounce.x, lastBounce.z);
      if (sg && sg.wear > sg.thr && Math.abs(lastBounce.x) - HL < 0.45) {
        state.disputes++;
        const loser = hitter;
        loser.obj.userData.lookAt?.(null);
        say(loser.obj, '压线了！', 2.2);
        say(umpObj, '出界', 2.0, 2.6);
        crowd?.setMode('idle');
        for (let i = 0; i < 2; i++) say(standPt(rnd() * 30 - 15, 1 + Math.floor(rnd() * 4)), '嘘—', 1.6, 0.9);
        yield* wait(2.6);
      }
    }
    if (!fetching && ball.on) spawn(fetchBall());
    state.lastPoint = now - t0;
    return winner;
  }
  /** 看台上某排、某个 x 的点（气泡锚） */
  const standPt = (x: number, row: number) => {
    const t = northTread(row);
    return v(x, t.y + 0.9, t.zb + 0.4);
  };
  /** 等总监离开比赛的地方，再把场地关上 */
  function* clearCourt(): Co {
    let warned = -10;
    while (inMatchRect(directorAt)) {
      if (now - warned > 2.5) {
        warned = now;
        say(umpObj, '请离场', 2.2, 2.6);
        for (const a of players) say(a.obj, '…', 1.2);
      }
      yield;
    }
    state.courtClosed = true;
  }

  // ── 比分 ──
  const PTS = ['0', '15', '30', '40'];
  type Pt = number | 'AD' | '';
  const ptOf = (n: number): Pt => [0, 15, 30, 40][Math.min(3, n)];
  const scoreText = () => {
    const [a, b] = state.score;
    const call = a >= 3 && b >= 3 && a === b ? '平分' : `${PTS[Math.min(3, a)]}–${PTS[Math.min(3, b)]}`;
    return `局 ${state.games[0]}–${state.games[1]} · ${call}`;
  };
  const showBoard = () =>
    board?.userData.setScore?.(
      [[state.games[0], state.games[1]]],
      [ptOf(state.score[0]), ptOf(state.score[1])],
      state.serve,
    );
  /** 赢一分；返回 0 = 局没完，1 = 局完了，2 = 比赛完了 */
  const award = (t: number): number => {
    state.score[t]++;
    const [a, b] = state.score;
    const done = (a >= 4 || b >= 4) && (Math.abs(a - b) >= 2 || (a >= 4 && b >= 3) || (b >= 4 && a >= 3));
    if (!done) {
      const s = state.score;
      const sv = state.serve;
      const call =
        s[0] >= 3 && s[1] >= 3 && s[0] === s[1] ? '平分' : `${PTS[Math.min(3, s[sv])]}–${PTS[Math.min(3, s[1 - sv])]}`;
      umpCall(call);
      showBoard();
      return 0;
    }
    state.games[t]++;
    state.score = [0, 0];
    state.serve = (1 - state.serve) as 0 | 1;
    showBoard();
    if (state.games[t] >= GAMES) {
      umpCall(`比赛结束 ${state.games[0]}–${state.games[1]}`);
      return 2;
    }
    umpCall(`局，${state.games[0]}–${state.games[1]}`);
    return 1;
  };
  let callUntil = -1;
  const umpCall = (text: string) => {
    say(umpObj, text, 2.0, 2.6);
    callUntil = now + 1.2;
  };

  // ── 看台的反应 ──
  let clapUntil = -1;
  /** 一分打完：全场举手鼓掌（帽子抖），前几排一半人站起来；好球全场起立 */
  const react = (good: boolean, winnerSide: number) => {
    if (!crowd) return;
    crowd.setMode('clap');
    clapUntil = now + (good ? 3.0 : 2.0);
    if (good) crowd.cheer(1, 2.4);
    else crowd.cheer(0.5, 1.5, NX + winnerSide * 6, 14);
  };

  // ── 换边 ──
  const seatOf = (i: number) => {
    const b = BENCH[i];
    const seats = benchObjs[i]?.userData.seats as [number, number, number][] | undefined;
    // 靠网那把（靠外那把在大伞底下：45° 俯视里伞把人整个挡住）
    const sx = seats ? seats.reduce((m, s) => (s[0] * b.out < m * b.out ? s[0] : m), seats[0][0]) : -0.45 * b.out;
    return v(b.x + sx, 0, b.z + 0.04);
  };
  /** 从场上走到球员席前（不穿网：先在自己半场走到网柱和裁判椅之间那一条，再横着走） */
  const toBench = (a: Actor, i: number): V3[] => {
    const seat = seatOf(i);
    const s = Math.sign(a.pos.x - NX) || 1;
    const pts: V3[] = [v(lerp(a.pos.x, NX + s * 3, 0.5), 0, WALK_Z + 0.3)];
    if (Math.sign(seat.x - NX) !== s) pts.push(v(NX + s * 0.9, 0, WALK_Z), v(NX - s * 0.9, 0, WALK_Z));
    pts.push(v(seat.x, 0, seat.z + 0.62));
    return pts;
  };
  /** 拿着毛巾：一块白的小方片挂在球童右手 */
  const towels = [0, 1].map(() => {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.06, 0.22),
      ctx.mat('clothWhite', { noShadowReceive: true, lightUp: 0.6, bands: [-0.45, 0.3], edge: 0.3 }),
    );
    m.visible = false;
    ctx.mats.prepare(m);
    scene.add(m);
    return m;
  });
  function* restOnBench(a: Actor, i: number, secs: number): Co {
    a.ctl = null;
    yield* walk(a, toBench(a, i), 1.7);
    const seat = seatOf(i);
    a.pos.set(seat.x, 0, seat.z);
    a.yaw = 0;
    sync(a);
    a.busy = true;
    const b = state.benches[i];
    const drink = b.cooler;
    if (!b.cooler) {
      state.complaints++;
      say(a.obj, '冰箱是空的！', 2.6);
    } else if (!b.umbrella) {
      state.complaints++;
      say(a.obj, '好晒…', 2.4);
    }
    if (drink) a.obj.userData.setProp?.('cup');
    let t = 0;
    const off = rnd();
    while (t < secs) {
      t += yield;
      a.pose(drink ? 'sip' : 'sit', (t / (drink ? 4 : 3.2) + off) % 1);
    }
    a.obj.userData.setProp?.('racket');
    a.pos.z = seat.z + 0.6;
    a.pose('idle');
    a.busy = false;
  }
  /** 球童：撑伞站在球员旁边（靠网那一侧）/ 递毛巾再回去 */
  function* kidUmbrella(k: Actor, i: number, secs: number): Co {
    const seat = seatOf(i);
    const at = v(seat.x - BENCH[i].out * 0.75, 0, seat.z + 0.35);
    yield* walk(k, [v(k.pos.x, 0, WALK_Z + 0.4), at], 2.6, 1.05);
    k.busy = true;
    k.yaw = BENCH[i].out > 0 ? Math.PI / 2 : -Math.PI / 2;
    k.obj.userData.setShade?.(v(seat.x, 1.3, seat.z));
    let t = 0;
    while (t < secs) {
      t += yield;
      k.pose('bkUmbrella', (t / 3.2) % 1);
    }
    k.obj.userData.setProp?.(null);
    yield* walk(k, [v(k.pos.x, 0, WALK_Z + 0.4), kidHome(k)], 2.6, 1.05);
    settle(k, k.rest, kidYaw(k));
  }
  function* kidTowel(k: Actor, i: number): Co {
    const seat = seatOf(i);
    const towel = towels[i];
    const at = v(seat.x, 0, seat.z + 0.85);
    yield* walk(k, [v(k.pos.x, 0, WALK_Z + 0.6), at], 2.6, 1.05);
    k.busy = true;
    k.yaw = Math.PI;
    let t = 0;
    towel.visible = true;
    while (t < 1.4) {
      const dt = yield;
      t += dt;
      k.pose('pickup', 0.35 + 0.25 * Math.min(1, t / 0.6));
      const hand = (k.obj.userData.handPoint?.('R') as V3 | undefined) ?? k.pos.clone().setY(0.9);
      towel.position.copy(t < 1.0 ? hand : v(seat.x + 0.1, 0.62, seat.z + 0.1));
    }
    towel.visible = false;
    yield* walk(k, [v(k.pos.x, 0, WALK_Z + 0.6), kidHome(k)], 2.6, 1.05);
    settle(k, k.rest, kidYaw(k));
  }
  let changeovers = 0;
  function* changeover(): Co {
    state.phase = 'changeover';
    state.courtClosed = false;
    changeovers++;
    say(umpObj, '换边', 2.2, 2.6);
    toast('换边 · 场地放开 14 秒');
    const REST = 13;
    const cos: Co[] = [restOnBench(A, 0, REST), restOnBench(B, 1, REST)];
    cos.push(
      (function* (): Co {
        yield* wait(1.5);
        yield* all(
          kidUmbrella(kid('kid-nw'), 0, REST - 3),
          kidUmbrella(kid('kid-ne'), 1, REST - 3),
          (function* (): Co {
            yield* wait(1.0);
            yield* all(kidTowel(kid('kid-sw'), 0), kidTowel(kid('kid-se'), 1));
          })(),
        );
      })(),
    );
    // 第一次（第三次……）换边：看台起一圈人浪
    if (changeovers % 2 === 1 && crowd) {
      cos.push(
        (function* (): Co {
          yield* wait(1.5);
          crowd.wave(1);
          yield* wait(10.5);
          crowd.setMode('idle');
        })(),
      );
    }
    yield* all(...cos);
    state.sideA = -state.sideA;
  }

  // ── 开场前 / 出场 / 散场 ──
  /** 西头球员通道外等着的地方（拱门西边） */
  const WAIT = {
    a: v(-24.6, 0, -21.9),
    b: v(-24.6, 0, -20.1),
    ump: v(-25.6, 0, -21.0),
    kids: [0, 1, 2, 3, 4, 5].map((i) => v(-20.3 - (i % 3) * 0.75, 0, i < 3 ? -23.6 : -18.4)),
  };
  const GATE = v(SPOTS.gate[0], 0, SPOTS.gate[1]);
  const UMP_SEAT = v(SPOTS.umpire[0], 0, SPOTS.umpire[1] + 0.02);
  const UMP_LADDER = v(SPOTS.umpire[0] + 0.2, 0, SPOTS.umpire[1] - 0.75);
  const placeOff = () => {
    A.pos.copy(WAIT.a);
    B.pos.copy(WAIT.b);
    A.yaw = B.yaw = Math.PI / 2;
    for (const a of players) {
      a.ctl = null;
      a.obj.userData.setProp?.('racket');
      settle(a, ['idle', 3]);
      sync(a);
    }
    if (ump) {
      ump.pos.copy(WAIT.ump);
      ump.yaw = Math.PI / 2;
      ump.obj.userData.setSeat?.(null);
      settle(ump, ['idle', 3]);
      sync(ump);
    }
    kids.forEach((k, i) => {
      k.pos.copy(WAIT.kids[i]);
      k.obj.userData.setProp?.(null);
      settle(k, ['bkStand', 3.2], i < 3 ? 0 : Math.PI);
      sync(k);
    });
  };
  /** 开场前倒计时 + 进场 */
  function* pre(): Co {
    state.phase = 'pre';
    state.countdown = state.match === 1 ? PRE : PRE + 10;
    state.delayed = 0;
    state.games = [0, 0];
    state.score = [0, 0];
    state.serve = 0;
    state.sideA = -1;
    showBoard();
    placeOff();
    // 上座率：上一场留下的杯子越多来的人越少（看戏模式自己干净）
    const dirty = cups.length / 40;
    state.attendance = clamp(1 - 0.45 * Math.min(1, dirty), 0.45, 1);
    if (dirty > 0.15 && state.match > 1) toast(`看台上还有 ${cups.length} 个杯子 · 来的人少了`, 2.6);
    if (crowd) {
      crowd.fill(state.attendance, 0);
      crowd.setMode('idle');
      crowd.lookAt(null);
      for (let b = 0; b < NBLOCKS; b++) crowd.setFill(b, 0, 0);
      spawn(
        (function* (): Co {
          const order = [2, 1, 3, 6, 0, 4, 5];
          for (const b of order) {
            if (b >= NBLOCKS) continue;
            yield* wait(1.5 + rnd() * 2.0);
            crowd.setFill(b, 1, 7 + rnd() * 4);
          }
        })(),
      );
    }
    if (seeker) spawn(seekSeat(seeker));
    while (state.countdown > 0) {
      const dt = yield;
      state.countdown = Math.max(0, state.countdown - dt);
      // 看戏模式：倒计时最后几秒沙堆自己没了（有人吹过了）
      if (auto && state.countdown < 6)
        for (const d of drifts) d.obj.userData.setAmount?.(Math.min(d.obj.userData.amount, 0.3));
    }
    // 沙没清完：推迟开场
    let boo = 0;
    let first = true;
    while (sandMax() >= SAND_BLOCK) {
      state.phase = 'delay';
      if (first) {
        first = false;
        say(umpObj, '场边有沙，推迟开场', 3.0);
        toast('沙没吹完 · 推迟开场', 2.4);
      }
      const dt = yield;
      state.delayed += dt;
      boo += dt;
      if (boo > 6) {
        boo = 0;
        for (let i = 0; i < 3; i++) say(standPt(rnd() * 34 - 17, Math.floor(rnd() * 5)), '嘘—', 1.8, 0.9);
        say(umpObj, '场边有沙，推迟', 2.0);
        // 等烦了的人走一些（这一场的上座率掉下去）
        state.attendance = Math.max(0.3, state.attendance - 0.07);
        crowd?.fill(state.attendance, 4);
      }
    }
  }
  /** 找座位的人：长廊西南角 → 西头 → 端梯 → 横走道 → 西边那条走道下去 → 坐下（藏起来，人群里补上） */
  const SEEK_PATH: V2[] = [
    SPOTS.entrySW,
    [-20.6, -13.0],
    [-20.6, -29.6],
    [-20.6, -36.35],
    [-7, -36.35],
    [-7, northTread(3).za - 0.3],
  ];
  function* seekSeat(a: Actor): Co {
    a.obj.visible = true;
    a.obj.userData.setProp?.(null);
    a.pos.set(SPOTS.entrySW[0] - 6, 0, -6.5);
    sync(a);
    yield* wait(2 + rnd() * 2);
    yield* walk(a, SEEK_PATH, 1.5);
    yield* face(a, Math.PI / 2, 0.4);
    yield* wait(0.8);
    a.obj.visible = false;
  }
  function* leaveSeat(a: Actor): Co {
    a.obj.visible = true;
    yield* walk(a, [...SEEK_PATH].reverse(), 1.6);
    a.obj.visible = false;
  }
  /** 出场：拱门 → 场上；裁判爬上椅子；球童就位 */
  function* walkout(): Co {
    state.phase = 'walkout';
    toast('球员出场', 1.8);
    crowd?.setMode('cheer');
    spawn(
      (function* (): Co {
        yield* wait(4);
        crowd?.setMode('clap');
        yield* wait(2.5);
        crowd?.setMode('idle');
      })(),
    );
    const cos: Co[] = [];
    // 球员：拱门 → 球员席前放包（站一下）→ 底线
    for (const [a, i] of [
      [A, 0],
      [B, 1],
    ] as [Actor, number][]) {
      cos.push(
        (function* (): Co {
          yield* wait(i * 0.8);
          const seat = seatOf(i);
          const via: V3[] = [GATE, v(-17.0, 0, -21 + (i ? 0.8 : -0.8)), v(-9, 0, WALK_Z + 0.5)];
          if (i === 1) via.push(v(-0.9, 0, WALK_Z), v(0.9, 0, WALK_Z));
          via.push(v(seat.x, 0, seat.z + 0.62));
          yield* walk(a, via, 1.8);
          yield* face(a, 0, 0.3);
          a.pose('idle', 0.2);
          yield* wait(1.2);
          settle(a, ['idle', 3]);
        })(),
      );
    }
    // 裁判：拱门 → 椅子北边的梯子 → 爬上去坐下
    if (ump) {
      const u = ump;
      cos.push(
        (function* (): Co {
          yield* wait(1.6);
          yield* walk(u, [GATE, v(-17, 0, -21.6), v(-1.4, 0, WALK_Z - 0.8), UMP_LADDER], 1.6);
          u.busy = true;
          u.yaw = 0;
          let t = 0;
          while (t < 1.4) {
            const dt = yield;
            t += dt;
            const k = smooth01(t / 1.4);
            u.pos.set(lerp(UMP_LADDER.x, UMP_SEAT.x, k), 1.32 * k, lerp(UMP_LADDER.z, UMP_SEAT.z, k));
            u.walkPh = (u.walkPh + dt / 0.9) % 1;
            u.pose('walk', u.walkPh);
          }
          u.pos.copy(UMP_SEAT).setY(1.32);
          u.obj.userData.setSeat?.(0.52);
          settle(u, ['sit', 3.2], 0);
        })(),
      );
    }
    // 球童：分两队（北边三个、南边三个）沿场边小跑到位
    kids.forEach((k, i) => {
      cos.push(
        (function* (): Co {
          yield* wait(0.4 + i * 0.35);
          const home = kidHome(k);
          const north = home.z < NZ;
          const lane = north ? WALK_Z + 0.2 : -14.0;
          yield* walk(k, [v(-17.2, 0, lane), v(home.x, 0, lane), home], 2.4, 1.05);
          settle(k, k.rest, kidYaw(k));
        })(),
      );
    });
    yield* all(...cos);
  }
  /** 比赛：一分接一分；单数局后换边；抢 GAMES 局 */
  function* match(): Co {
    // 开打：两人从球员席走到底线（point() 里自己走过去）
    while (true) {
      const w = yield* point();
      state.points++;
      const r = award(w);
      const good = lastKind === 'winner' || lastShots >= 6;
      react(good || r === 2, sideOf(w));
      if (r === 2) return;
      yield* wait(1.0);
      if (r === 1 && (state.games[0] + state.games[1]) % 2 === 1) yield* changeover();
    }
  }
  /** 散场：握手、挥手、走掉；球童收伞；看台一块一块走空、留下杯子 */
  function* exit(): Co {
    state.phase = 'end';
    state.courtClosed = false;
    crowd?.setMode('cheer');
    crowd?.lookAt(null);
    toast('比赛结束 · 散场', 2.2);
    // 网前握手
    const sA = Math.sign(A.pos.x - NX) || -1;
    yield* all(walk(A, [v(NX + sA * 0.6, 0, NZ + 0.4)], 1.8), walk(B, [v(NX - sA * 0.6, 0, NZ + 0.4)], 1.8));
    A.yaw = netYaw(sA);
    B.yaw = netYaw(-sA);
    for (const a of players) a.pose('idle', 0.5);
    yield* wait(1.4);
    // 朝看台挥手（举拍 = serve 的抛球那一下）
    for (const a of players) {
      a.yaw = Math.PI;
      a.busy = true;
    }
    let t = 0;
    while (t < 1.6) {
      t += yield;
      for (const a of players) a.pose('serve', 0.25 + 0.08 * Math.sin(t * 9));
    }
    crowd?.setMode('idle');
    state.phase = 'exit';
    // 看台走空：一块一块，走空的那块座位前留下杯子
    if (crowd) {
      spawn(
        (function* (): Co {
          const order = [0, 4, 5, 6, 1, 3, 2];
          for (const b of order) {
            if (b >= NBLOCKS) continue;
            yield* wait(1.2 + rnd() * 1.6);
            crowd.setFill(b, 0, 5 + rnd() * 3);
            const people = Math.round((crowd.blocks[b] ?? 0) * state.attendance);
            if (b <= 4 && !auto)
              spawn(
                (function* (): Co {
                  yield* wait(3);
                  spawnCups(b, Math.round(people / 7));
                })(),
              );
          }
        })(),
      );
    }
    if (seeker) spawn(leaveSeat(seeker));
    const cos: Co[] = [];
    for (const a of players)
      cos.push(
        walk(
          a,
          [
            v(NX + (Math.sign(a.pos.x - NX) || 1) * 0.9, 0, WALK_Z),
            v(-9, 0, WALK_Z + 0.5),
            v(-17, 0, -21),
            GATE,
            a === A ? WAIT.a : WAIT.b,
          ],
          1.7,
        ),
      );
    if (ump) {
      const u = ump;
      cos.push(
        (function* (): Co {
          u.busy = true;
          u.obj.userData.setSeat?.(null);
          let k = 0;
          while (k < 1) {
            const dt = yield;
            k = Math.min(1, k + dt / 1.2);
            u.pos.set(lerp(UMP_SEAT.x, UMP_LADDER.x, k), 1.32 * (1 - smooth01(k)), lerp(UMP_SEAT.z, UMP_LADDER.z, k));
            u.walkPh = (u.walkPh + dt / 0.9) % 1;
            u.pose('walk', u.walkPh);
          }
          yield* walk(u, [v(-1.4, 0, WALK_Z - 0.8), v(-17, 0, -21.6), GATE, WAIT.ump], 1.6);
        })(),
      );
    }
    // 球童：两个去收伞，别的直接走
    kids.forEach((k, i) => {
      cos.push(
        (function* (): Co {
          yield* wait(0.5 + i * 0.3);
          if (k.id === 'kid-nw' || k.id === 'kid-ne') {
            const bi = k.id === 'kid-nw' ? 0 : 1;
            const seat = seatOf(bi);
            yield* walk(k, [v(k.pos.x, 0, WALK_Z + 0.4), v(seat.x + BENCH[bi].out * 0.2, 0, seat.z + 0.9)], 2.4, 1.05);
            k.busy = true;
            k.yaw = Math.PI;
            let tt = 0;
            while (tt < 1.2) {
              tt += yield;
              k.pose('pickup', Math.min(1, tt / 1.2));
            }
            if (!auto) {
              state.benches[bi].umbrella = false;
              state.benches[bi].cooler = false;
            }
          }
          const north = k.pos.z < NZ;
          yield* walk(
            k,
            [v(k.pos.x, 0, north ? WALK_Z + 0.2 : -14.0), v(-17.2, 0, north ? WALK_Z + 0.2 : -14.0), WAIT.kids[i]],
            2.4,
            1.05,
          );
          settle(k, ['bkStand', 3.2]);
        })(),
      );
    });
    yield* all(...cos);
    for (const a of players) settle(a, ['idle', 3]);
    yield* wait(3);
  }
  function* show(): Co {
    while (true) {
      yield* pre();
      yield* walkout();
      yield* match();
      yield* exit();
      state.match++;
      if (!auto) toast('下一场开场前：收拾看台、吹沙、撑伞补水', 3.2);
    }
  }
  let main: Co = show();
  main.next(0);

  // ── 卖水的：在东边那条走道上上下下（比赛的时候），隔一会儿吆喝一声 ──
  if (vendor) {
    const va = vendor;
    va.obj.userData.setProp?.(null);
    spawn(
      (function* (): Co {
        const x = 7;
        while (true) {
          for (const row of [1, 3, 4, 2, 0]) {
            yield* walk(va, [v(x, 0, northTread(row).za - 0.3)], 0.9);
            yield* face(va, rnd() < 0.5 ? Math.PI / 2 : -Math.PI / 2, 0.4);
            settle(va, ['idle', 3]);
            if (rnd() < 0.5) say(va.obj, '冰水！', 1.6);
            yield* wait(3 + rnd() * 4);
          }
        }
      })(),
    );
  }
  // ── 长廊上走过的会员：来回走 ──
  strollers.forEach((s, i) => {
    s.obj.userData.setProp?.('racket');
    const z = s.pos.z;
    spawn(
      (function* (): Co {
        yield* wait(i * 3);
        while (true) {
          yield* walk(s, [v(i ? 16 : -22, 0, z)], 1.25);
          settle(s, ['idle', 3]);
          yield* wait(1.5 + rnd() * 3);
          yield* walk(s, [v(i ? -18 : 12, 0, z + (rnd() - 0.5) * 0.8)], 1.25);
          settle(s, ['idle', 3]);
          yield* wait(1.5 + rnd() * 3);
        }
      })(),
    );
  });

  // ── 沙：比赛的时候风大，三个角积得快 ──
  const sandMax = () => Math.max(...drifts.map((d) => (d.obj.userData.amount as number) ?? 0));
  if (!auto) {
    drifts[0].obj.userData.setAmount?.(0.9);
    drifts[1].obj.userData.setAmount?.(0.5);
    drifts[2].obj.userData.setAmount?.(0.4);
  }

  // ── 看球的人（头跟着球）──
  const look = new THREE.Vector3();
  const updateWatch = () => {
    const playing = state.phase === 'point' || state.phase === 'between';
    if (ball.on) look.copy(ball.p);
    else look.set(NX + sideOf(state.serve) * 8, 1.2, NZ);
    if (crowd) crowd.lookAt(playing ? look : null);
    for (const w of watchers) w.userData.lookAt?.(playing ? look : null);
    for (const k of kids) if (!k.busy) k.obj.userData.lookAt?.(playing ? look : null);
    if (ump && !ump.busy) ump.obj.userData.lookAt?.(playing ? look : null);
  };

  const restPose = (a: Actor, dt: number) => {
    const [name, per] = a.rest;
    a.restPh = (a.restPh + dt / per) % 1;
    if (a === ump && now < callUntil) a.pose('call', clamp(1 - (callUntil - now) / 1.2, 0, 1) * 0.9);
    else a.pose(name, a.restPh);
  };

  const update = (dt: number) => {
    now += dt;
    main.next(dt);
    for (let i = bg.length - 1; i >= 0; i--) if (bg[i].next(dt).done) bg.splice(i, 1);
    for (const a of players) if (a.ctl) drive(a, dt);
    for (const a of everyone) {
      if (!a.ctl && !a.busy) restPose(a, dt);
      sync(a);
    }
    if (crowd && clapUntil > 0 && now > clapUntil) {
      clapUntil = -1;
      if (crowd.mode === 'clap') crowd.setMode('idle');
    }
    // 风：比赛中积沙快（阵风大时），开场前慢
    const rate = state.phase === 'pre' || state.phase === 'delay' ? 0.004 : 0.016;
    for (const d of drifts) d.obj.userData.regrow = auto ? 0 : rate;
    updateBall(dt);
    updateWatch();
    syncUmbrellas(dt);
    drawPatches();
    drawCups();
    updatePuffs(dt);
    lastNow = now;
  };

  // 开局：伞收着、球童/球员在通道外
  syncUmbrellas(0);
  showBoard();

  return {
    update,
    state,
    ball: () => ({ x: ball.p.x, y: ball.p.y, z: ball.p.z, on: ball.on }),
    people: () =>
      everyone
        .filter((a) => a.obj.visible && a.pos.y < 0.5 && (a !== ump || a.pos.y < 0.2))
        .map((a) => ({ x: a.pos.x, z: a.pos.z, r: 0.32 })),
    scoreText,
    setDirector: (p) => {
      directorAt = p ? p.clone() : null;
    },
    drifts,
    sandMax,
    lineGood: () => lineSegs.filter((s) => s.wear <= s.thr).length / lineSegs.length,
    paintAt: (x, z) => {
      let n = 0;
      for (const sg of lineSegs) {
        if (Math.abs(sg.x - x) > 0.32 || Math.abs(sg.z - z) > 0.3) continue;
        if (sg.wear > sg.thr) {
          n++;
          patchDirty = true;
        }
        sg.wear = 0;
      }
      return n;
    },
    blowCups: (x, y, z, dt) => {
      let got = 0;
      // 站在走道（或横走道）上：附近几排（z 差 < 1.6 米、高差 < 1.6 米）、沿 x 7.5 米以内的杯子往这条走道滑
      const aisle = STANDS.aisles.reduce((m, c) => (Math.abs(c - x) < Math.abs(m - x) ? c : m), STANDS.aisles[0]);
      const onAisle = Math.abs(aisle - x) < 0.8;
      for (let i = cups.length - 1; i >= 0; i--) {
        const c = cups[i];
        if (Math.abs(c.z - z) > 1.7 || Math.abs(c.y - y) > 1.7 || Math.abs(c.x - x) > 7.5) continue;
        const to = onAisle ? aisle : x;
        const dx = to - c.x;
        if (Math.abs(dx) < 0.5) {
          puff(v(c.x, c.y, c.z), 0.12);
          cups.splice(i, 1);
          got++;
          continue;
        }
        c.x += Math.sign(dx) * Math.min(Math.abs(dx), 3.2 * dt);
        c.yaw += dt * 9;
        if (rnd() < dt * 3) puff(v(c.x, c.y, c.z), 0.08);
      }
      if (got || cups.length) cupsDirty = true;
      return got;
    },
    nearestCup: (x, z) => cups.reduce((m, c) => Math.min(m, Math.hypot(c.x - x, c.z - z)), Number.POSITIVE_INFINITY),
    prepBench: (i) => {
      state.benches[i].umbrella = true;
      state.benches[i].cooler = true;
    },
    debug: () => ({
      now,
      phase: state.phase,
      players: players.map((a) => ({ id: a.id, x: +a.pos.x.toFixed(2), z: +a.pos.z.toFixed(2), ctl: !!a.ctl })),
      ball: {
        ...ball.p,
        on: ball.on,
        free: ball.free,
        segs: ball.segs.length,
        hitAt: ball.segs.length ? ball.segs[ball.segs.length - 1].t1 : null,
        hitX: ball.segs.length
          ? segAt(ball.segs[ball.segs.length - 1], ball.segs[ball.segs.length - 1].t1, new THREE.Vector3()).x
          : null,
      },
      cups: cups.length,
      lines: lineSegs.filter((s) => s.wear > s.thr).length,
      sand: drifts.map((d) => +(d.obj.userData.amount as number).toFixed(2)),
    }),
    skip: (what) => {
      bg.length = 0;
      ball.on = false;
      if (what === 'match' || what === 'changeover') {
        for (const d of drifts) d.obj.userData.setAmount?.(Math.min(d.obj.userData.amount, 0.3));
        crowd?.fill(state.attendance, 0);
        for (let b = 0; b < NBLOCKS; b++) crowd?.setFill(b, 1, 0);
        for (const a of players) a.obj.userData.setProp?.('racket');
        A.pos.set(-HL - 0.4, 0, NZ);
        B.pos.set(HL + 0.4, 0, NZ);
        if (ump) {
          ump.pos.copy(UMP_SEAT).setY(1.32);
          ump.obj.userData.setSeat?.(0.52);
          settle(ump, ['sit', 3.2], 0);
        }
        for (const k of kids) {
          k.pos.copy(kidHome(k));
          settle(k, k.rest, kidYaw(k));
        }
        state.phase = 'between';
        main = (function* (): Co {
          if (what === 'changeover') {
            state.games = [1, 0];
            showBoard();
            yield* changeover();
          }
          yield* match();
          yield* exit();
          state.match++;
          while (true) {
            yield* pre();
            yield* walkout();
            yield* match();
            yield* exit();
            state.match++;
          }
        })();
        main.next(0);
      } else {
        main = (function* (): Co {
          yield* exit();
          state.match++;
          while (true) {
            yield* pre();
            yield* walkout();
            yield* match();
            yield* exit();
            state.match++;
          }
        })();
        main.next(0);
      }
    },
  };
}

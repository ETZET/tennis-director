// clubclay 的演出（stage 3）：近场 outer_3 的双打 + 场边（裁判、观众、记分牌、水站）+ 东步道上路过的人。
// 没有模拟：一切按演出时钟（固定 1/60 秒一步）+ 种子随机流（ctx.rng('clay-life')）推，不用 Math.random。
//
// 击球不等球（同 desert3d-v2/life.ts 的做法）：每一拍在出手那一刻就把整条轨迹算好（落地点、到接球人拍面的时刻和位置），
// 接球的人立刻起动去站位，挥拍按"拍面到达击球点的时刻 = 球到的时刻"倒推开始时间；球在那一刻直接从拍面换方向飞走。
// 每次落地 near.ballMark()；底线上横向跑超过 2 米的那一步到位时 near.slide()（滑步痕 + 一团红土）。
// 一分 ≈ 12～15 秒（走位 → 发球 → 3～7 拍 → 落地滚走 → 观众鼓掌、裁判报分）；每两局换边：四个人走到长椅坐下，
// 每队一个人去水站接一杯（水位掉一档；空了 → 冒"没水了"，坐着干等），记分牌每局翻一张，歇完换到对面。
// 裁判、观众的头跟着球（lookAt）；一分打完鼓掌两下。
// 总监闯进近场双打线以内（比赛中）→ 这一分作废（let），四个人冒"！"等他出去再重发。
// 截图 / 调试钩子：window.__clay.life = { state, ball(), racket(i), debug() }
import * as THREE from 'three';
import { CLAP_HIT, setStride } from '../clubsite/people';
import type { AssetCtx } from './ctx';
import { DIM, NEAR, SPOTS } from './layout';

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
const flat = (a: V3, b: V3) => Math.hypot(b.x - a.x, b.z - a.z);

// ── 近场的坐标（场地本地 u = 沿长边（东 +），w = 横（南 +））──
const NX = NEAR.x;
const NZ = NEAR.z;
const HL = DIM.L / 2;
const HW = DIM.DW / 2;
const SVC = DIM.SVC;
/** 场地本地 → 世界 */
const W = (u: number, w: number, y = 0) => v(NX + u, y, NZ + w);
/** 网：柱心距 12.8（z 36.2…49），高 0.95（柱 1.07、中间 0.914 取中） */
const NET_HZ = DIM.netLen / 2;
const NET_H = 0.95;
/** 红土场面比地面高 2 厘米 */
const CLAY_Y = 0.03;

const G = 9.8;
/** 挥拍（rig 的 forehand / backhand：smooth(0.35, 0.62) 的中点 = 拍面到击球点） */
const SWING = 0.72;
const C_STROKE = 0.485;
/** 发球姿势时长；击球相位 = 拍面最高的那一刻（建人时量） */
const SERVE_DUR = 1.35;
const TOSS_AT = 0.1;
/** 比赛的地方（双打边线外 0.6 米、底线后 3.5 米）：比赛中总监进来 = 打扰；场边那一条（z < 36.5）可以走 */
const COURT_RECT = { x0: NX - HL - 3.5, x1: NX + HL + 3.5, z0: NZ - HW - 0.6, z1: NZ + HW + 0.6 };

/** 场边：长椅座位（长椅中心 ±0.45、z 34.95，座高 0.52），走到座位前一步再坐下 */
const SEAT_Z = 34.95;
const BENCH_A = SPOTS.benchE[0]; // A 队（开局在东边）坐东边那张（裁判椅东边）
const BENCH_B = SPOTS.benchW[0];
const SEATS = [
  [BENCH_A - 0.45, BENCH_A + 0.45],
  [BENCH_B + 0.45, BENCH_B - 0.45],
];
/** 换边从网柱和裁判椅之间穿过去 */
const CROSS_Z = 35.95;
/** 水站正面（龙头朝南） */
const TAP = v(SPOTS.water[0], 0, 35.55);

interface Move {
  t0: number;
  t1: number;
  from: V3;
  to: V3;
  /** 到位时留一道滑步痕（底线上横跑） */
  slide: boolean;
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
  readyPh: number;
}
interface Actor {
  id: string;
  obj: THREE.Object3D;
  pos: V3;
  yaw: number;
  walkPh: number;
  pose(name: string, ph?: number): void;
  ctl: Ctl | null;
  contact: Map<string, V3>;
  serveC: number;
  rigBalls: THREE.Object3D[];
  /** 踩场的累计（每秒 wear 一下） */
  wearAcc: number;
}

function actor(id: string, obj: THREE.Object3D): Actor {
  return {
    id,
    obj,
    pos: obj.position.clone(),
    yaw: obj.rotation.y,
    walkPh: 0,
    pose: (n, ph) => obj.userData.pose?.(n, ph),
    ctl: null,
    contact: new Map(),
    serveC: 0.68,
    rigBalls: [],
    wearAcc: 0,
  };
}

/** 找球拍的拍面网格（rig：拍头几何体中心在握点下方 0.5 米） */
function findRacketHead(obj: THREE.Object3D): THREE.Mesh | null {
  let best: THREE.Mesh | null = null;
  const c = new THREE.Vector3();
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || m.parent === obj) return;
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    m.geometry.boundingBox!.getCenter(c);
    if (Math.abs(c.x) < 0.02 && Math.abs(c.y + 0.5) < 0.03 && Math.abs(c.z) < 0.02) best = m;
  });
  return best;
}
function headWorld(m: THREE.Mesh, out = new THREE.Vector3()) {
  m.geometry.boundingBox!.getCenter(out);
  m.updateWorldMatrix(true, false);
  return out.applyMatrix4(m.matrixWorld);
}

type Co = Generator<void, void, number>;

/** 红土场面的 API（assets/clay-court.ts 的 userData.clay），这里只用到这些 */
export interface ClayApi {
  ballMark(x: number, z: number, dirX?: number, dirZ?: number): void;
  slide(x: number, z: number, dirX: number, dirZ: number, len?: number): void;
  wear(x: number, z: number, r: number, amount: number): void;
  step(x: number, z: number, dirX: number, dirZ: number, side?: number): void;
  at(x: number, z: number): { wet: number; dust: number; state: string };
}

export interface Bubble {
  /** 头顶的世界坐标 */
  p: V3;
  text: string;
  /** 谁说的（同一个人只冒一个） */
  who: string;
  /** 说话的人（锚）和头顶上方多高 */
  obj: THREE.Object3D;
  dy: number;
}

export interface ClayLife {
  update(dt: number): void;
  state: {
    phase: string;
    points: number;
    shots: number;
    /** 这一局的分（A 队、B 队） */
    score: [number, number];
    /** 这一盘的局数 */
    games: [number, number];
    /** A 队在哪边：1 = 东，−1 = 西 */
    sideA: number;
    lets: number;
    /** 上一分用了几秒 */
    lastPoint: number;
    /** 水站剩几档 */
    water: number;
    /** 换边时没水喝的次数（总监不在场边的代价） */
    complaints: number;
  };
  ball(): { x: number; y: number; z: number; on: boolean };
  racket(i: number): { x: number; y: number; z: number } | null;
  /** 头顶气泡（hud 按相机投影摆） */
  bubbles(): Bubble[];
  /** 走动的人（总监导航时当成挡路的圆） */
  people(): { x: number; z: number; r: number }[];
  /** 比分字样（hud 顶栏） */
  scoreText(): string;
  /** 总监的位置（玩法模式每帧给；闯进近场 = 打扰比赛） */
  setDirector(p: V3 | null): void;
  /** 水站有人换了满桶 */
  refillWater(): void;
  /** 一团红土（落地、滑步、拖垫后沿、风起尘）：p 地面点，size 米 */
  puff(p: V3, size?: number, n?: number): void;
  debug(): unknown;
}

export interface LifeOpts {
  ctx: AssetCtx;
  scene: THREE.Object3D;
  /** SLOTS 建出来的对象（id → 对象） */
  objs: Map<string, THREE.Object3D>;
  near: ClayApi | null;
}

export function createLife({ ctx, scene, objs, near }: LifeOpts): ClayLife {
  const rnd = ctx.rng('clay-life');
  const get = (id: string) => objs.get(id) ?? null;
  const state: ClayLife['state'] = {
    phase: 'arrive',
    points: 0,
    shots: 0,
    score: [0, 0],
    games: [2, 1],
    sideA: 1,
    lets: 0,
    lastPoint: 0,
    water: 1,
    complaints: 0,
  };
  let now = 0;
  let directorAt: V3 | null = null;

  // ── 球（一个）+ 地上的小影子（太阳在后上方，影子落在球正下方偏镜头一点）──
  const R = ctx.texel * 1.1;
  const ballMesh = new THREE.Mesh(
    new THREE.IcosahedronGeometry(R, 1),
    ctx.mat('ball', { noShadowReceive: true, bands: [-2, -1] }),
  );
  ballMesh.castShadow = false;
  ballMesh.visible = false;
  ballMesh.name = 'clay-life:ball';
  scene.add(ballMesh);
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(ctx.texel * 1.3, 8).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x3a1c22, transparent: true, opacity: 0.45, depthWrite: false }),
  );
  shadow.layers.set(ctx.layers.FX);
  shadow.visible = false;
  scene.add(shadow);
  const GROUND = CLAY_Y + R;

  // ── 红土尘团（落地、滑步）：几个扁的 clayDust 小块，鼓起来再缩没（不透明、硬边）──
  const PUFFS = 24;
  const puffMesh = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 0),
    ctx.mat('clayDust', { noShadowReceive: true, lightUp: 0.6, bands: [-0.4, 0.3] }),
    PUFFS,
  );
  puffMesh.layers.set(ctx.layers.FX);
  puffMesh.castShadow = false;
  puffMesh.frustumCulled = false;
  scene.add(puffMesh);
  const puffs = Array.from({ length: PUFFS }, () => ({ life: 1, max: 1, p: new THREE.Vector3(), s: 0.1 }));
  let puffNext = 0;
  const puff = (p: V3, size = 0.18, n = 2) => {
    for (let k = 0; k < n; k++) {
      const P = puffs[puffNext];
      puffNext = (puffNext + 1) % PUFFS;
      P.life = 0;
      P.max = 0.35 + rnd() * 0.3;
      P.s = size * (0.6 + rnd() * 0.6);
      P.p.set(p.x + (rnd() - 0.5) * size * 1.4, CLAY_Y, p.z + (rnd() - 0.5) * size);
    }
  };
  const m4 = new THREE.Matrix4();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const updatePuffs = (dt: number) => {
    puffs.forEach((P, i) => {
      if (P.life >= P.max) {
        puffMesh.setMatrixAt(i, zero);
        return;
      }
      P.life += dt;
      const u = P.life / P.max;
      const s = P.s * Math.sin(Math.min(1, u) * Math.PI) * (1 + u * 0.6);
      m4.makeScale(s * 1.4, s * 0.7, s).setPosition(P.p.x, P.p.y + s * 0.4 + u * 0.12, P.p.z);
      puffMesh.setMatrixAt(i, m4);
    });
    puffMesh.instanceMatrix.needsUpdate = true;
  };

  /** 一段抛物线 */
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
  const onClay = (p: V3) => Math.abs(p.x - NX) < 16.4 && Math.abs(p.z - NZ) < 8.2;
  /** 落地：球印（方向 = 飞的方向）+ 一小团土 */
  const bounceAt = (p: V3, vel: V3, hard = 1) => {
    if (!onClay(p)) return;
    near?.ballMark(p.x, p.z, vel.x, vel.z);
    if (hard > 0.5 || rnd() < 0.5) puff(p, 0.1 + 0.06 * hard, 1);
  };

  const tmp = new THREE.Vector3();
  /** 自由飞的球：重力、落地反弹（红土软：0.55）、滚动摩擦、网、围网 / 南墙 */
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
      if (ball.p.x < 0.35 || ball.p.x > 33.15) {
        ball.p.x = clamp(ball.p.x, 0.35, 33.15);
        ball.v.x = -ball.v.x * 0.3;
      }
      if (ball.p.z < 34.0 || ball.p.z > 51.5) {
        ball.p.z = clamp(ball.p.z, 34.0, 51.5);
        ball.v.z = -ball.v.z * 0.3;
      }
      if (ball.p.y < GROUND) {
        ball.p.y = GROUND;
        if (ball.v.y < -1.2) {
          const hard = Math.min(1, -ball.v.y / 6);
          bounceAt(ball.p, ball.v, hard);
          ball.v.y = -ball.v.y * 0.55;
          ball.v.x *= 0.8;
          ball.v.z *= 0.8;
        } else {
          ball.v.y = 0;
          const f = Math.exp(-1.6 * h);
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
        const s = ball.segs.shift()!;
        if (s.bounce && s.t1 > lastNow) bounceAt(segAt(s, s.t1, tmp), segVel(s, s.t1, new THREE.Vector3()), 1);
        if (!ball.segs.length) {
          segAt(s, s.t1, ball.p);
          segVel(s, s.t1, ball.v);
          if (s.bounce) {
            ball.v.y = -ball.v.y * 0.55;
            ball.v.x *= 0.8;
            ball.v.z *= 0.8;
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
      shadow.position.set(ball.p.x, CLAY_Y + 0.01, ball.p.z + Math.max(0, ball.p.y - CLAY_Y) * 0.35);
    }
  };

  // ── 人 ──
  const need = (id: string) => {
    const o = get(id);
    if (!o) throw new Error(`clubclay life: 缺 ${id}`);
    return o;
  };
  /** A 队（开局在东）：server、net-e；B 队：returner、net-w */
  const teams: Actor[][] = [
    [actor('server', need('server')), actor('net-e', need('net-e'))],
    [actor('returner', need('returner')), actor('net-w', need('net-w'))],
  ];
  const players = teams.flat();
  const umpire = get('umpire');
  const watchers = ['spectator-1', 'spectator-2', 'spectator-3'].map(get).filter(Boolean) as THREE.Object3D[];
  const scoreboard = get('scoreboard');
  const water = get('water-station');
  const walkerObj = get('walker');
  const walker = walkerObj ? actor('walker', walkerObj) : null;
  const levels = (water?.userData.levels as number | undefined) ?? 6;
  state.water = (water?.userData.level as number | undefined) ?? 1;

  const bubbles = new Map<string, { a: THREE.Object3D; text: string; until: number; h: number }>();
  const say = (who: string, obj: THREE.Object3D | null, text: string, secs = 1.6, h = 2.0) => {
    if (obj) bubbles.set(who, { a: obj, text, until: now + secs, h });
  };

  const sync = (a: Actor) => {
    a.obj.position.copy(a.pos);
    a.obj.rotation.y = a.yaw;
  };
  /** 量拍面中心（人本地，朝向 0）在各击球姿势的击球相位上的位置 */
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
    a.obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.parent === a.obj && m.geometry.type === 'SphereGeometry') a.rigBalls.push(m);
    });
    a.obj.position.copy(p0);
    a.obj.rotation.y = r0;
    a.obj.userData.setProp?.('racket');
    a.pose('ready', 0);
  };
  for (const a of players) measure(a);
  const contactAt = (a: Actor, name: string, stand: V3, yaw: number) =>
    a.contact.get(name)!.clone().applyAxisAngle(Y, yaw).add(stand);
  const rightOf = (yaw: number) => v(-1, 0, 0).applyAxisAngle(Y, yaw);
  /** 队 t 现在在哪边（+1 东 / −1 西） */
  const sideOf = (t: number) => (t === 0 ? state.sideA : -state.sideA);
  const teamOf = (a: Actor) => (teams[0].includes(a) ? 0 : 1);
  /** 面朝网：东边的人朝西 */
  const netYaw = (side: number) => (side > 0 ? -Math.PI / 2 : Math.PI / 2);

  /** 时间轴驱动：位置按 move 插值，挥拍按排好的时刻放，其余时间跑动 / 准备姿势 */
  const drive = (a: Actor, dt: number) => {
    const c = a.ctl!;
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
      if (u >= 1) {
        if (m.slide && near) {
          // 到位前的最后 1 米是滑过来的：痕从 (到位 − 方向 × 长) 开始
          const dx = m.to.x - m.from.x;
          const dz = m.to.z - m.from.z;
          const L = Math.hypot(dx, dz) || 1;
          const len = Math.min(1.4, 0.8 + L * 0.12);
          near.slide(m.to.x - (dx / L) * len, m.to.z - (dz / L) * len, dx, dz, len);
          puff(m.to, 0.22, 3);
        }
        c.move = null;
      }
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
  };
  /** 在 [t0, t1] 里走到 to（太紧就按 6 米/秒拉长，但不晚于 latest）；底线上横跑 > 2 米 → 到位时滑一下 */
  const moveTo = (a: Actor, to: V3, t0: number, t1: number, latest = t1) => {
    const d = flat(a.pos, to);
    const end = Math.min(latest, Math.max(t1, t0 + d / 6));
    const lateral = Math.abs(to.z - a.pos.z);
    const slide = Math.abs(to.x - NX) > HL - 2.5 && lateral > 2.0 && lateral > Math.abs(to.x - a.pos.x);
    a.ctl!.move = { t0, t1: Math.max(t0 + 0.05, end), from: a.pos.clone(), to: to.clone(), slide };
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
  function* until(cond: () => boolean, max = 30): Co {
    let t = 0;
    while (!cond() && t < max) t += yield;
  }
  function* walk(a: Actor, pts: V3[], speed = 1.5, stride?: number): Co {
    const len = setStride(a.obj, stride);
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
        a.walkPh = (a.walkPh + step / len) % 1;
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

  // ── 击球规划 ──
  interface Shot {
    hitter: Actor;
    recv: Actor;
    t1: number;
    P1: V3;
  }
  /** 队里离网远的那个 = 底线的人，另一个 = 网前的人 */
  const backOf = (t: number) => {
    const [a, b] = teams[t];
    return Math.abs(a.pos.x - NX) >= Math.abs(b.pos.x - NX) ? a : b;
  };
  const frontOf = (t: number) => (backOf(t) === teams[t][0] ? teams[t][1] : teams[t][0]);
  /** 定接球：挑正反手、算站位（底线的人夹在底线附近，网前的人夹在网前），返回拍面位置（下一拍出手点） */
  const planReceive = (r: Actor, target: V3, tc: number, volley: boolean) => {
    const yaw = r.ctl!.netYaw;
    const side = rightOf(yaw);
    const rel = (target.x - r.pos.x) * side.x + (target.z - r.pos.z) * side.z;
    const stroke = rel > -0.5 ? 'forehand' : 'backhand';
    const off = r.contact.get(stroke)!.clone().applyAxisAngle(Y, yaw);
    const s = Math.sign(r.pos.x - NX) || 1;
    const du = Math.abs(target.x - off.x - NX);
    const stand = v(
      NX + s * (volley ? clamp(du, 1.8, 6) : clamp(du, HL - 2.4, HL + 2.8)),
      0,
      clamp(target.z - off.z, NZ - HW - 1.3, NZ + HW + 1.3),
    );
    const P1 = contactAt(r, stroke, stand, yaw);
    moveTo(r, stand, now + 0.1, tc - 0.32, tc - 0.04);
    r.ctl!.swings.push({ name: stroke, t0: tc - C_STROKE * SWING, dur: SWING });
    return P1;
  };
  /** 打完回位：底线的人回到底线后、网前的人回网前（横向跟着球往中间收） */
  const recover = (a: Actor, t0: number) => {
    const s = Math.sign(a.pos.x - NX) || 1;
    const back = a === backOf(teamOf(a));
    const to = back
      ? v(NX + s * (HL + 0.5), 0, NZ + (a.pos.z - NZ) * 0.4)
      : v(NX + s * 3.6, 0, NZ + (a.pos.z - NZ) * 0.6);
    a.ctl!.move = {
      t0: t0 + 0.25,
      t1: t0 + 0.25 + Math.max(0.6, flat(a.pos, to) / 3),
      from: a.pos.clone(),
      to,
      slide: false,
    };
  };
  /** 搭档跟着球横移（网前的人封住球那一侧的直线）*/
  const cover = (partner: Actor, ballZ: number, t0: number) => {
    if (partner.ctl!.swings.length) return;
    const s = Math.sign(partner.pos.x - NX) || 1;
    const back = Math.abs(partner.pos.x - NX) > HL - 3;
    const z = clamp(NZ + (ballZ - NZ) * (back ? 0.3 : 0.55) + (partner.pos.z > ballZ ? 1.6 : -1.6), NZ - HW, NZ + HW);
    const to = v(NX + s * (back ? HL + 0.3 : 3.6), 0, z);
    partner.ctl!.move = {
      t0: t0 + 0.2,
      t1: t0 + 0.2 + Math.max(0.5, flat(partner.pos, to) / 3.5),
      from: partner.pos.clone(),
      to,
      slide: false,
    };
  };

  type Kind = 'rally' | 'winner' | 'out' | 'net';
  /** 一拍：球现在在 P0 离开 hitter 的拍面。对打返回下一拍，其余返回 null（球交给物理） */
  const hit = (hitter: Actor, P0: V3, kind: Kind, tHit: number, serveTo: Actor | null): Shot | null => {
    state.shots++;
    const ht = teamOf(hitter);
    const rt = 1 - ht;
    const rs = sideOf(rt);
    ball.on = true;
    ball.rest = 0;
    for (const a of teams[rt]) if (a.ctl) a.ctl.readyPh = 0.25; // 对方出手时分腿一跳
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
    const vh = serveTo ? 17 + rnd() * 2 : 13 + rnd() * 3;
    if (kind === 'out' || kind === 'winner') {
      const recv = backOf(rt);
      const B =
        kind === 'out'
          ? rnd() < 0.6
            ? v(NX + rs * (HL + 0.4 + rnd() * 1.4), GROUND, NZ + (rnd() * 2 - 1) * 3.5)
            : v(NX + rs * (5 + rnd() * 5), GROUND, NZ + (rnd() < 0.5 ? -1 : 1) * (HW + 0.3 + rnd() * 0.9))
          : v(NX + rs * (6 + rnd() * 4), GROUND, NZ + (recv.pos.z > NZ ? -1 : 1) * (HW - 0.5 - rnd() * 1.2));
      ball.free = false;
      ball.segs = [seg(tHit, P0, B, flat(P0, B) / vh, true)];
      if (kind === 'winner') {
        // 追几步，追不上
        for (const a of teams[rt])
          if (a.ctl) {
            const sx = Math.sign(a.pos.x - NX) || 1;
            moveTo(a, v(a.pos.x - sx * 0.3, 0, lerp(a.pos.z, B.z, 0.45)), now + 0.25, tHit + flat(P0, B) / vh + 0.4);
          }
      }
      return null;
    }
    let recv: Actor;
    let target: V3;
    let volley = false;
    if (serveTo) {
      recv = serveTo;
      const sw = Math.sign(recv.pos.z - NZ) || 1;
      target = v(NX + rs * (HL - 0.3 + rnd() * 0.9), 0.9, NZ + sw * (1.6 + rnd() * 2.0));
    } else if (rnd() < 0.28 && Math.abs(frontOf(rt).pos.x - NX) < 7) {
      // 网前截击：直接打到网前那个人身边（不落地）
      recv = frontOf(rt);
      volley = true;
      target = v(recv.pos.x, 0.9, clamp(recv.pos.z + (rnd() - 0.5) * 2.4, NZ - HW + 0.4, NZ + HW - 0.4));
    } else {
      recv = backOf(rt);
      target = v(NX + rs * (HL - 1.2 + rnd() * 2.2), 0.9, NZ + (rnd() * 2 - 1) * 3.6);
    }
    let segs: Seg[];
    let tc: number;
    if (volley) {
      // 截击：P0 → 拍面，一段（过网的高度够：中途比两端高 g·T²/8）
      const T = Math.max(0.45, flat(P0, target) / (vh * 0.95));
      tc = tHit + T;
      const P1 = planReceive(recv, target, tc, true);
      segs = [seg(tHit, P0, P1, T, false)];
      ball.free = false;
      ball.segs = segs;
      cover(teams[rt][0] === recv ? teams[rt][1] : teams[rt][0], target.z, now);
      return { hitter, recv, t1: tc, P1 };
    }
    const f = serveTo ? 0 : 0.76 + rnd() * 0.1;
    const sw = Math.sign(target.z - NZ) || 1;
    const B = serveTo
      ? v(NX + rs * (SVC - 0.5 - rnd() * 1.6), GROUND, NZ + sw * (0.8 + rnd() * 2.6))
      : v(lerp(P0.x, target.x, f), GROUND, lerp(P0.z, target.z, f));
    const T1 = flat(P0, B) / vh;
    const T2 = Math.max(0.38, flat(B, target) / (vh * 0.7));
    tc = tHit + T1 + T2;
    const P1 = planReceive(recv, target, tc, false);
    ball.free = false;
    ball.segs = [seg(tHit, P0, B, T1, true), seg(tHit + T1, B, P1, T2, false)];
    cover(teams[rt][0] === recv ? teams[rt][1] : teams[rt][0], target.z, now);
    return { hitter, recv, t1: tc, P1 };
  };

  // ── 一分 ──
  /** 发球的队、每队这次轮到谁发 / 谁接平分区 */
  let serveTeam = 0;
  const serverIdx = [0, 0];
  const deuceIdx = [0, 0];
  const inCourt = (p: V3 | null) =>
    !!p && p.x > COURT_RECT.x0 && p.x < COURT_RECT.x1 && p.z > COURT_RECT.z0 && p.z < COURT_RECT.z1;
  let interrupted = false;

  /** 站位：发球的人在底线后（平分分在自己右手边），搭档在网前另一边；接发球的人在对角，搭档在发球线另一边 */
  const placements = (deuce: boolean) => {
    const st = serveTeam;
    const rt = 1 - st;
    const ss = sideOf(st);
    const srv = teams[st][serverIdx[st]];
    const sp = teams[st][1 - serverIdx[st]];
    // 发球人朝网时右手边：东边的人朝西 → 右手 = 北（w < 0）
    const right = ss > 0 ? -1 : 1;
    const sw = (deuce ? right : -right) * 1.4;
    const rcv = teams[rt][deuce ? deuceIdx[rt] : 1 - deuceIdx[rt]];
    const rp = teams[rt][0] === rcv ? teams[rt][1] : teams[rt][0];
    const rw = -Math.sign(sw) * 3.0;
    return {
      srv,
      rcv,
      spots: new Map<Actor, V3>([
        [srv, W(ss * (HL + 0.35), sw)],
        [sp, W(ss * 3.4, -Math.sign(sw) * 2.4)],
        [rcv, W(-ss * (HL - 0.2), rw)],
        [rp, W(-ss * 6.2, -Math.sign(rw) * 2.2)],
      ]),
    };
  };

  function* point(): Generator<void, number, number> {
    const t0 = now;
    const deuce = (state.score[0] + state.score[1]) % 2 === 0;
    const { srv, rcv, spots } = placements(deuce);
    state.phase = 'walk';
    for (const a of players) a.ctl = null;
    ball.on = false;
    yield* all(...[...spots].map(([a, p]) => walk(a, [p], 2.4)));
    for (const a of players) {
      a.yaw = netYaw(Math.sign(a.pos.x - NX));
      sync(a);
    }
    // 总监在场上：等他出去
    if (inCourt(directorAt)) {
      state.phase = 'blocked';
      for (const a of players) a.pose('idle');
      while (inCourt(directorAt)) {
        for (const a of players) say(a.id, a.obj, '！', 0.3, 2.1);
        say('umpire', umpire, '请离场', 0.3, 3.9);
        yield;
      }
    }
    for (const a of players) {
      a.ctl = { netYaw: a.yaw, move: null, swings: [], readyPh: rnd() };
      a.pose('ready', 0);
    }
    yield* wait(0.45);
    state.phase = 'rally';
    interrupted = false;

    const sc = srv.ctl!;
    const tServe = now + srv.serveC * SERVE_DUR;
    sc.swings.push({ name: 'serve', t0: now, dur: SERVE_DUR });
    const tToss = now + TOSS_AT * SERVE_DUR;
    const tossFrom = v(0.32, 1.05, 0.2).applyAxisAngle(Y, sc.netYaw).add(srv.pos);
    yield* until(() => now >= tToss);
    ball.on = true;
    ball.free = false;
    ball.p.copy(tossFrom);
    const P0 = contactAt(srv, 'serve', srv.pos, sc.netYaw);
    ball.segs = [seg(tToss, tossFrom, P0, tServe - tToss, false)];
    yield* until(() => now >= tServe);
    let shots = 2 + Math.floor(rnd() * 4);
    const ending = (): Kind => {
      if (shots > 0) return 'rally';
      const r = rnd();
      return r < 0.35 ? 'out' : r < 0.5 ? 'net' : 'winner';
    };
    let k = ending();
    let shot = hit(srv, P0, k, tServe, rcv);
    recover(srv, tServe);
    let hitter: Actor = srv;
    while (shot) {
      const s = shot;
      yield* until(() => now >= s.t1 || interrupted);
      if (interrupted) break;
      shots--;
      hitter = s.recv;
      k = ending();
      shot = hit(s.recv, s.P1, k, s.t1, null);
      recover(s.recv, s.t1);
    }
    if (interrupted) {
      // 打扰：这一分作废，球掉下去，重发
      state.lets++;
      ball.free = true;
      ball.segs = [];
      ball.v.set(0, 0, 0);
      for (const a of players) {
        a.ctl = null;
        a.pose('idle');
        say(a.id, a.obj, '！', 1.6, 2.1);
      }
      say('umpire', umpire, '重发！', 2.0, 3.9);
      yield* wait(1.4);
      ball.on = false;
      return -1;
    }
    const winTeam = k === 'winner' ? teamOf(hitter) : 1 - teamOf(hitter);
    yield* until(() => ball.free && (ball.rest > 0.25 || ball.freeT > 2.6), 4);
    yield* wait(0.4);
    for (const a of players) {
      a.ctl = null;
      a.pose('idle');
    }
    state.lastPoint = now - t0;
    return winTeam;
  }

  // ── 比分、记分牌 ──
  const PTS = ['0', '15', '30', '40'];
  const scoreText = () => {
    const [a, b] = state.score;
    const call = a >= 3 && b >= 3 && a === b ? '平分' : `${PTS[Math.min(3, a)]}–${PTS[Math.min(3, b)]}`;
    return `局 ${state.games[0]}–${state.games[1]} · ${call}`;
  };
  scoreboard?.userData.setScore?.([6, 3, null, state.games[0]], [4, 6, null, state.games[1]]);
  /** 赢一分；返回这一局是不是结束了（无占先：40–40 下一分定局） */
  const award = (t: number): boolean => {
    state.score[t]++;
    const [a, b] = state.score;
    const done = (a >= 4 || b >= 4) && (Math.abs(a - b) >= 2 || (a >= 4 && b >= 3) || (b >= 4 && a >= 3));
    if (!done) {
      const s = state.score;
      const call =
        s[0] >= 3 && s[1] >= 3 && s[0] === s[1]
          ? '平分'
          : `${PTS[Math.min(3, s[serveTeam])]}–${PTS[Math.min(3, s[1 - serveTeam])]}`;
      say('umpire', umpire, call, 1.8, 3.9);
      return false;
    }
    state.games[t]++;
    state.score = [0, 0];
    say('umpire', umpire, `局，${state.games[0]}–${state.games[1]}`, 2.2, 3.9);
    scoreboard?.userData.flip?.(t * 4 + 3, state.games[t]);
    // 一盘打完（6 局且领先 2 局，或 7 局）：盘那一格记下，局数清零
    const [ga, gb] = state.games;
    if ((Math.max(ga, gb) >= 6 && Math.abs(ga - gb) >= 2) || Math.max(ga, gb) >= 7) {
      scoreboard?.userData.setScore?.([ga, null, null, 0], [gb, null, null, 0]);
      state.games = [0, 0];
    }
    // 换发球：发球权换队；这个队下次换人发
    serverIdx[serveTeam] = 1 - serverIdx[serveTeam];
    serveTeam = 1 - serveTeam;
    return true;
  };

  // ── 场边的人：观众鼓掌、看球 ──
  let clapUntil = 0;
  let sitPh = 0;
  const watchPt = new THREE.Vector3();
  const updateWatchers = (dt: number) => {
    sitPh = (sitPh + dt / 3.2) % 1;
    if (ball.on) watchPt.copy(ball.p);
    else {
      // 没球：看场中间偏发球的那边
      watchPt.set(NX + sideOf(serveTeam) * 8, 1.2, NZ);
    }
    const clapping = now < clapUntil;
    watchers.forEach((o, i) => {
      const standing = o === get('spectator-3');
      if (clapping) o.userData.pose?.('clap', ((now * 2 + i * 0.13) % 1) * 1);
      else if (standing) o.userData.pose?.('idle', (sitPh + i * 0.3) % 1);
      else o.userData.pose?.('sit', (sitPh + i * 0.37) % 1);
      o.userData.lookAt?.(watchPt);
    });
    if (umpire) {
      umpire.userData.pose?.('sit', (sitPh + 0.5) % 1);
      umpire.userData.lookAt?.(watchPt);
    }
  };
  // 站着的观众鼓掌：站着拍（setSeat(null)）
  get('spectator-3')?.userData.setSeat?.(null);

  // ── 换边：走到长椅坐下、去水站接水、歇一会儿、换到对面 ──
  const benchFront = (t: number, k: number) => v(SEATS[t][k], 0, SEAT_Z + 0.75);
  /** 从场上走到场边（不穿网：先在自己半场往北走到边线外，再横着走） */
  const toSideline = (a: Actor, x: number): V3[] => {
    const s = Math.sign(a.pos.x - NX) || 1;
    const sx = Math.sign(x - NX) || s;
    const pts: V3[] = [v(a.pos.x, 0, 36.6)];
    if (sx !== s) pts.push(v(NX + s * 0.9, 0, CROSS_Z), v(NX - s * 0.9, 0, CROSS_Z));
    pts.push(v(x, 0, 35.75));
    return pts;
  };
  function* sitDown(a: Actor, seatX: number, secs: number, drink: boolean): Co {
    a.ctl = null;
    a.pos.set(seatX, 0, SEAT_Z);
    a.yaw = 0;
    sync(a);
    if (drink) a.obj.userData.setProp?.('cup');
    let t = 0;
    const off = rnd();
    while (t < secs) {
      t += yield;
      a.pose(drink ? 'sip' : 'sit', (t / (drink ? 4 : 3.2) + off) % 1);
    }
    a.obj.userData.setProp?.('racket');
    a.pos.z = SEAT_Z + 0.6;
    a.pose('idle');
  }
  function* changeover(): Co {
    state.phase = 'changeover';
    ball.on = false;
    say('umpire', umpire, '换边', 2.2, 3.9);
    const rest = 14;
    const cos: Co[] = [];
    for (const t of [0, 1]) {
      teams[t].forEach((a, k) => {
        const drinker = k === (state.games[0] + state.games[1]) % 2;
        cos.push(
          (function* (): Co {
            a.ctl = null;
            if (drinker) {
              // 先去水站接一杯
              yield* walk(a, [...toSideline(a, TAP.x), TAP], 1.8);
              yield* face(a, Math.PI, 0.3);
              a.pose('idle', 0.3);
              yield* wait(0.9);
              const lvl = (water?.userData.level as number | undefined) ?? 0;
              let got = lvl > 0.01;
              if (got && water)
                state.water = water.userData.setLevel(Math.max(0, lvl - 1 / levels)) ?? lvl - 1 / levels;
              else {
                got = false;
                state.complaints++;
                say(a.id, a.obj, '没水了！', 2.6, 2.1);
                yield* wait(1.0);
              }
              yield* walk(a, [v(TAP.x, 0, 35.75), benchFront(t, k)], 1.6);
              yield* sitDown(a, SEATS[t][k], rest - 5, got);
            } else {
              yield* walk(a, [...toSideline(a, SEATS[t][k]), benchFront(t, k)], 1.6);
              yield* sitDown(a, SEATS[t][k], rest, false);
            }
          })(),
        );
      });
    }
    yield* all(...cos);
    state.sideA = -state.sideA;
  }

  // ── 主循环：一分接一分 ──
  function* match(): Co {
    // 开局：四个人从场边那一条走上场（已经摆好，直接开打）
    while (true) {
      const w = yield* point();
      state.points++;
      if (w < 0) continue;
      clapUntil = now + 1.1;
      const gameOver = award(w);
      yield* wait(0.9);
      if (gameOver && (state.games[0] + state.games[1]) % 2 === 0) yield* changeover();
    }
  }
  const main = match();
  main.next(0);

  // ── 东步道上路过的人：来回走，走到近场东门边停下看几分 ──
  if (walker) {
    walker.obj.userData.setProp?.('racket');
    spawn(
      (function* (): Co {
        const route = [v(35.4, 0, 49.6), v(35.3, 0, 40.0), v(35.5, 0, 24.0)];
        while (true) {
          yield* walk(walker, [route[1]], 1.3);
          yield* face(walker, -Math.PI / 2, 0.5);
          let t = 0;
          while (t < 6 + rnd() * 6) {
            t += yield;
            walker.pose('idle', (t / 3) % 1);
            walker.obj.userData.lookAt?.(ball.on ? ball.p : W(0, 0, 1));
          }
          walker.obj.userData.lookAt?.(null);
          yield* walk(walker, [route[2]], 1.3);
          yield* wait(1.5);
          yield* walk(walker, [route[1], route[0]], 1.3);
          yield* wait(2 + rnd() * 3);
        }
      })(),
    );
  }

  const update = (dt: number) => {
    now += dt;
    if (state.phase === 'rally' && inCourt(directorAt)) interrupted = true;
    main.next(dt);
    for (let i = bg.length - 1; i >= 0; i--) if (bg[i].next(dt).done) bg.splice(i, 1);
    for (const a of players) {
      if (a.ctl) drive(a, dt);
      sync(a);
      // 踩场：在场上的人每秒在脚下磨一下（底线后慢慢起尘）
      a.wearAcc += dt;
      if (a.wearAcc > 1 && near && onClay(a.pos) && a.pos.z > 36.5) {
        a.wearAcc = 0;
        near.wear(a.pos.x, a.pos.z, 0.5, 0.006);
      }
    }
    if (walker) sync(walker);
    updateBall(dt);
    updateWatchers(dt);
    updatePuffs(dt);
    for (const [k, b] of bubbles) if (now > b.until) bubbles.delete(k);
    lastNow = now;
  };

  const bubbleOut: Bubble[] = [];
  return {
    update,
    state,
    ball: () => ({ x: ball.p.x, y: ball.p.y, z: ball.p.z, on: ball.on }),
    racket: (i) => {
      const a = players[i];
      if (!a) return null;
      const h = findRacketHead(a.obj);
      if (!h) return null;
      const p = headWorld(h);
      return { x: p.x, y: p.y, z: p.z };
    },
    bubbles: () => {
      bubbleOut.length = 0;
      for (const [who, b] of bubbles) {
        b.a.updateWorldMatrix(true, false);
        const p = b.a.getWorldPosition(new THREE.Vector3());
        p.y += b.h;
        bubbleOut.push({ p, text: b.text, who, obj: b.a, dy: b.h });
      }
      return bubbleOut;
    },
    people: () => [...players, ...(walker ? [walker] : [])].map((a) => ({ x: a.pos.x, z: a.pos.z, r: 0.35 })),
    scoreText,
    setDirector: (p) => {
      directorAt = p ? p.clone() : null;
    },
    refillWater: () => {
      water?.userData.setLevel?.(1);
      state.water = 1;
    },
    puff,
    debug: () => ({
      now,
      players: players.map((a) => ({ id: a.id, x: +a.pos.x.toFixed(2), z: +a.pos.z.toFixed(2), ctl: !!a.ctl })),
      ball: { ...ball.p, on: ball.on, free: ball.free, segs: ball.segs.length },
      CLAP_HIT,
    }),
  };
}

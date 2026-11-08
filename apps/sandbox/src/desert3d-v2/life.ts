// 园区日常（演出 demo，没有模拟）。四幕轮流演（?scene=rally|drill|pick|blow 只演一幕）：
//  1. rally：两个人上场，发球、对打、得分；分间总监拿扫帚扫最脏的那堆沙。
//  2. drill：教练推球车到网前喂多球，球员一拍拍打回去，球满场弹、滚到角落和路缘边。
//  3. pick：总监推捡球器按最近邻路线把散落的球一个个压进笼子，再倒回球车。
//  4. blow：教练背吹叶机上场，把积沙往场外吹（court.userData.sand.blow），沙丘变小、往下风挪。
// 击球不等球：每一拍都在出手那一刻就算好球的整条轨迹（落地点、到达接球点的时刻和位置），
// 接球的人立刻起动去截球，挥拍按"拍面到达击球点的时刻 = 球到的时刻"倒推开始时间；球在那一刻直接换方向飞走。
// 演出随机只用种子随机流。截图钩子：window.__d3v2.life = { state, ball(), racket(i) }
// 玩法模式（opts.play，main 的默认）：总监交给玩家（control.ts），这里不再派他扫沙/捡球，教练也不吹沙；
// 只轮播"对打 → 多球"，球员站位上有积沙或散球就停下来冒"!"等一会儿，球车空了教练就喂不了。life.play 是给 control 的接口。
import * as THREE from 'three';
import { FEED_RELEASE } from './assets/coach';
import type { SandGrid } from './assets/court';
import type { Fx } from './fx';
import { COURT, H, STAIRS } from './layout';
import type { AssetCtx } from './world';

type V3 = THREE.Vector3;
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const Y = new THREE.Vector3(0, 1, 0);

/** 步道：岛东沿 → 台阶脚 → 台阶顶 → 铺面东南角（y 按层；台阶上线性升） */
const stairBottomZ = STAIRS.z0 + STAIRS.run * STAIRS.steps;
const ARRIVE: V3[] = [
  v(26.5, H.low, 23.2),
  v(22.5, H.low, 21.8),
  v(17.5, H.low, 21.4),
  v(12.6, H.low, 22.6),
  v(8.2, H.low, 22.2),
  v(5.4, H.low, 20.2),
  v(4.6, H.low, stairBottomZ + 0.2),
  v(4.6, H.court, STAIRS.z0 - 0.15),
  v(4.9, H.court, 14.6),
  v(5.6, 0.04, 13.4),
];
const PAD_Y = 0.04;
/** 总监在西侧网柱旁等（迎风边，沙多在这一侧） */
const DIRECTOR_HOME = v(-7.75, H.court, 1.4);
/** 教练在东侧网柱外（裁判椅北边）等，球车停在他身边 */
const COACH_HOME = v(7.75, H.court, -2.0);
const CART_HOME = v(7.7, H.court, -3.3);
/** 喂球位：北半场网前偏东，面朝南 */
const FEED_AT = v(1.6, PAD_Y, -2.2);

const G = 9.8;
/** 挥拍时长（秒）和"拍面到击球点"的相位（rig 的 forehand/backhand：smooth(0.35, 0.62) 的中点） */
const SWING = 0.72;
const C_STROKE = 0.485;
/** 发球：姿势时长；击球相位 = 拍面最高的那一刻（建人时在 0.5～0.8 里量出来，存在 Actor.serveC） */
const SERVE_DUR = 1.35;
/** 抛球从这个相位离手（左手举到胸前） */
const TOSS_AT = 0.1;
/** 球场上能跑的范围（路缘里面） */
const BX = COURT.padHw;
const BZ = COURT.padHl;
const POST_X = 6.4;

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
  /** 排好的挥拍（按时间先后；做完就删） */
  swings: Swing[];
  readyPh: number;
}
interface Actor {
  obj: THREE.Object3D;
  pos: V3;
  /** 朝向（弧度，绕 y；0 = 朝 +z = 镜头） */
  yaw: number;
  walkPh: number;
  pose(name: string, ph?: number): void;
  /** 对打/喂球时由时间轴驱动（位置、朝向、姿势）；null = 协程直接摆 */
  ctl: Ctl | null;
  /** 姿势名 → 拍面中心在人本地坐标里的位置（朝向 0 时） */
  contact: Map<string, V3>;
  /** 发球的击球相位 */
  serveC: number;
  /** rig 自己画的抛球/喂球（演出接管：抛球由这里按重力画，正好落到拍面最高点） */
  rigBalls: THREE.Object3D[];
}

function actor(obj: THREE.Object3D): Actor {
  return {
    obj,
    pos: obj.position.clone(),
    yaw: 0,
    walkPh: 0,
    pose: (n, ph) => obj.userData.pose?.(n, ph),
    ctl: null,
    contact: new Map(),
    serveC: 0.68,
    rigBalls: [],
  };
}

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

type Co = Generator<void, void, number>;

export interface Life {
  update(dt: number, t: number): void;
  state: {
    scene: string;
    phase: string;
    score: [number, number];
    group: number;
    points: number;
    sand: number;
    loose: number;
    shots: number;
  };
  /** 对打球的位置（截图诊断用） */
  ball(): { x: number; y: number; z: number; on: boolean };
  /** 调试：散落的球、人的位置 */
  debug(): unknown;
  /** 第 i 个球员的拍面中心（世界坐标） */
  racket(i: number): { x: number; y: number; z: number } | null;
  /** 玩法模式的接口（watch 模式下也在，只是没人用） */
  play: PlayApi;
}

/** 散落在地上的球（物理在跑的那些） */
export interface LooseBall {
  p: V3;
  v: V3;
  rest: number;
}
/** 头顶冒的小气泡（"!"、"没球了"），hud 按相机投影摆 */
export interface Alert {
  p: V3;
  text: string;
}
export interface PlayApi {
  /** 总监（玩法模式下 life 不碰他） */
  director: THREE.Object3D;
  loose(): LooseBall[];
  /** 捡走一个球（进笼子） */
  collect(b: LooseBall): void;
  /** 推一下球（吹叶机） */
  kick(b: LooseBall, vx: number, vz: number, vy?: number): void;
  cart: THREE.Object3D | null;
  cartCount(): number;
  setCartCount(n: number): void;
  /** 走来走去的人（挡路的圆）：教练、球员 */
  people(): { x: number; z: number; r: number }[];
  alerts(): Alert[];
}

/** 找球拍的拍面网格（rig：拍头几何体中心在握点下方 0.5 米）；找不到就 null */
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

export function createLife(
  ctx: AssetCtx,
  scene: THREE.Scene,
  make: (asset: string, variant: number) => THREE.Object3D,
  court: THREE.Object3D | undefined,
  fx: Fx,
  hud: HTMLElement | null,
  has: (asset: string) => boolean = () => true,
  opts: { play?: boolean } = {},
): Life {
  const PLAY = !!opts.play;
  const rnd = ctx.rng('life');
  const sand = court?.userData.sand as SandGrid | undefined;
  const state: Life['state'] = {
    scene: '',
    phase: 'idle',
    score: [0, 0],
    group: 0,
    points: 0,
    sand: 0,
    loose: 0,
    shots: 0,
  };
  /** ?scene=rally|drill|pick|blow：只演这一幕 */
  const forcedScene = PLAY ? null : ctx.params.get('scene');
  /** 演出时钟（秒）：所有时间轴都按它排 */
  let now = 0;

  // ── 球：一个实例化的池（对打用 0 号），地上一个假影子（太阳在后上方，影子落在球的正下偏镜头一点） ──
  const R = ctx.texel * 1.1;
  const NB = 40;
  const ballMesh = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(R, 1),
    ctx.mat('ball', { noShadowReceive: true, bands: [-2, -1] }),
    NB,
  );
  ballMesh.castShadow = false;
  ballMesh.frustumCulled = false;
  scene.add(ballMesh);
  const shadowMesh = new THREE.InstancedMesh(
    new THREE.CircleGeometry(ctx.texel * 1.3, 8).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x1e2850, transparent: true, opacity: 0.45, depthWrite: false }),
    NB,
  );
  shadowMesh.layers.set(ctx.layers.FX);
  shadowMesh.frustumCulled = false;
  scene.add(shadowMesh);

  /** 一段抛物线：t0 时在 p0、速度 v0，只受重力 */
  interface Seg {
    t0: number;
    t1: number;
    p0: V3;
    v0: V3;
    /** 段末是落地（扬尘） */
    bounce: boolean;
  }
  interface Ball {
    p: V3;
    v: V3;
    on: boolean;
    /** free = 物理（弹、滚、撞路缘和网）；否则按 segs 走 */
    free: boolean;
    segs: Seg[];
    rest: number;
    held: boolean;
  }
  const balls: Ball[] = Array.from({ length: NB }, () => ({
    p: new THREE.Vector3(),
    v: new THREE.Vector3(),
    on: false,
    free: false,
    segs: [],
    rest: 0,
    held: false,
  }));
  const RALLY = balls[0];
  const takeBall = (): Ball | null => {
    for (let i = 1; i < NB; i++) if (!balls[i].on) return balls[i];
    return null;
  };
  /** 从 p0 出发、T 秒后到 p1 的抛物线的初速度 */
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

  const bounceFx = (p: V3, hard = 1) => {
    const s = sand?.at(p.x, p.z) ?? 0;
    if (s > 0.03) fx.puff(new THREE.Vector3(p.x, PAD_Y + s, p.z), 0.18 * hard, 3);
    else if (rnd() < 0.5) fx.puff(new THREE.Vector3(p.x, PAD_Y, p.z), 0.1, 1);
  };

  let lastNow = 0;
  const m4 = new THREE.Matrix4();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const tmp = new THREE.Vector3();
  const tmp2 = new THREE.Vector3();
  const ground = PAD_Y + R;
  /** 物理一步：重力、落地反弹、滚动摩擦（沙里更涩）、路缘和网挡、球和球轻轻推开 */
  const physics = (dt: number) => {
    const sub = 3;
    const h = dt / sub;
    for (let s = 0; s < sub; s++) {
      for (const b of balls) {
        if (!b.on || !b.free || b.held || b.rest > 0.5) continue;
        b.v.y -= G * h;
        const pz = b.p.z;
        b.p.addScaledVector(b.v, h);
        // 网：网身两柱之间、网带以下
        if (Math.sign(pz) !== Math.sign(b.p.z) && Math.abs(b.p.x) < POST_X && b.p.y < COURT.netH) {
          b.p.z = Math.sign(pz) * (R + 0.02);
          b.v.z = -b.v.z * 0.2;
          b.v.x *= 0.5;
          b.v.y *= 0.4;
        }
        // 路缘（球场外框）
        if (Math.abs(b.p.x) > BX - R) {
          b.p.x = Math.sign(b.p.x) * (BX - R);
          b.v.x = -b.v.x * 0.45;
        }
        if (Math.abs(b.p.z) > BZ - R) {
          b.p.z = Math.sign(b.p.z) * (BZ - R);
          b.v.z = -b.v.z * 0.45;
        }
        // 地面
        const sd = sand?.at(b.p.x, b.p.z) ?? 0;
        const gy = ground + sd * 0.6;
        if (b.p.y < gy) {
          b.p.y = gy;
          if (b.v.y < -1.0) {
            const hard = Math.min(1, -b.v.y / 6);
            b.v.y = -b.v.y * (sd > 0.04 ? 0.35 : 0.62);
            b.v.x *= 0.86;
            b.v.z *= 0.86;
            if (s === 0) bounceFx(b.p, 0.4 + hard);
          } else {
            b.v.y = 0;
            const f = Math.exp(-(0.9 + sd * 30) * h);
            b.v.x *= f;
            b.v.z *= f;
          }
        }
      }
      // 球和球：推开、沿法线交换速度（同质量，恢复 0.5）
      for (let i = 1; i < NB; i++) {
        const a = balls[i];
        if (!a.on || !a.free || a.held) continue;
        for (let j = i + 1; j < NB; j++) {
          const c = balls[j];
          if (!c.on || !c.free || c.held) continue;
          tmp.subVectors(c.p, a.p);
          const d = tmp.length();
          if (d >= 2 * R || d < 1e-5) continue;
          tmp.multiplyScalar(1 / d);
          const push = (2 * R - d) / 2;
          a.p.addScaledVector(tmp, -push);
          c.p.addScaledVector(tmp, push);
          const rel = tmp2.subVectors(c.v, a.v).dot(tmp);
          if (rel < 0) {
            const k = -0.75 * rel;
            a.v.addScaledVector(tmp, -k);
            c.v.addScaledVector(tmp, k);
            a.rest = 0;
            c.rest = 0;
          }
        }
      }
    }
    for (const b of balls) {
      if (!b.on || !b.free || b.held) continue;
      const onGround = b.p.y <= ground + (sand?.at(b.p.x, b.p.z) ?? 0) * 0.6 + 0.002;
      if (onGround && Math.hypot(b.v.x, b.v.z) < 0.08 && Math.abs(b.v.y) < 0.1) {
        b.v.set(0, 0, 0);
        b.rest += dt;
      } else b.rest = 0;
    }
  };
  const updateBalls = (dt: number) => {
    for (const b of balls) {
      if (!b.on || b.free || !b.segs.length) continue;
      // 走过的段末落地 → 扬尘；最后一段走完 → 交给物理
      while (b.segs.length && now >= b.segs[0].t1) {
        const s = b.segs.shift()!;
        if (s.bounce && s.t1 > lastNow) bounceFx(segAt(s, s.t1, tmp));
        if (!b.segs.length) {
          segAt(s, s.t1, b.p);
          segVel(s, s.t1, b.v);
          if (s.bounce) {
            b.v.y = -b.v.y * 0.62;
            b.v.x *= 0.86;
            b.v.z *= 0.86;
          }
          b.free = true;
          b.rest = 0;
        }
      }
      if (b.segs.length && now >= b.segs[0].t0) segAt(b.segs[0], now, b.p);
    }
    physics(dt);
    let loose = 0;
    balls.forEach((b, i) => {
      if (!b.on || b.held) {
        ballMesh.setMatrixAt(i, zero);
        shadowMesh.setMatrixAt(i, zero);
        return;
      }
      if (b.free && i > 0) loose++;
      m4.makeTranslation(b.p.x, b.p.y, b.p.z);
      ballMesh.setMatrixAt(i, m4);
      const sd = sand?.at(b.p.x, b.p.z) ?? 0;
      m4.makeTranslation(b.p.x, PAD_Y + sd * 0.6 + 0.01, b.p.z + Math.max(0, b.p.y - PAD_Y) * 0.35);
      shadowMesh.setMatrixAt(i, m4);
    });
    state.loose = loose;
    ballMesh.instanceMatrix.needsUpdate = true;
    shadowMesh.instanceMatrix.needsUpdate = true;
  };

  // ── 人 ──
  const director = actor(make('director', 0));
  director.pos.copy(DIRECTOR_HOME);
  director.yaw = Math.PI / 2;
  scene.add(director.obj);
  director.obj.userData.setProp?.(PLAY ? null : 'broom');
  const coach = has('coach') ? actor(make('coach', 0)) : null;
  if (coach) {
    coach.pos.copy(COACH_HOME);
    coach.yaw = -Math.PI / 2;
    scene.add(coach.obj);
  }
  const cart = has('ball-cart') ? make('ball-cart', 0) : null;
  if (cart) {
    cart.position.copy(CART_HOME);
    cart.rotation.y = -Math.PI / 2;
    scene.add(cart);
  }
  let cartCount = 26;
  const setCart = (n: number) => {
    cartCount = Math.max(0, n);
    cart?.userData.setCount?.(cartCount);
  };
  setCart(cartCount);
  let players: Actor[] = [];
  /** 每个人都要每帧更新的列表 */
  const cast = () => [...(PLAY ? [] : [director]), ...(coach ? [coach] : []), ...players];
  /** 头顶气泡：actor → 文字（hud 画） */
  const bubbles = new Map<Actor, string>();

  const sync = (a: Actor) => {
    a.obj.position.copy(a.pos);
    a.obj.rotation.y = a.yaw;
  };

  /** 量一下拍面中心（人本地坐标，朝向 0）在各个击球姿势的击球相位上在哪 */
  const measureContacts = (a: Actor) => {
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
    // 发球：找拍面最高的相位
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
    // rig 的抛球（root 下的小球）
    a.obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.parent === a.obj && m.geometry.type === 'SphereGeometry') a.rigBalls.push(m);
    });
    a.obj.position.copy(p0);
    a.obj.rotation.y = r0;
    a.pose('idle');
  };
  /** 人站在 stand、朝 yaw 时，姿势 name 的击球点（世界坐标） */
  const contactAt = (a: Actor, name: string, stand: V3, yaw: number) =>
    a.contact.get(name)!.clone().applyAxisAngle(Y, yaw).add(stand);

  /** 时间轴驱动的人：位置按 move 插值，挥拍按 swing 的时刻放，其余时间跑动或准备姿势 */
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
  };
  /** 从现在的位置在 [t0, t1] 里走到 to（t1 太紧就按 6 米/秒拉长，但不晚于 latest） */
  const moveTo = (a: Actor, to: V3, t0: number, t1: number, latest = t1) => {
    const d = flat(a.pos, to);
    const need = d / 6;
    const end = Math.min(latest, Math.max(t1, t0 + need));
    a.ctl!.move = { t0, t1: Math.max(t0 + 0.05, end), from: a.pos.clone(), to: to.clone() };
  };

  // ── 协程工具 ──
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
  /** 沿折线走（米/秒），走路姿势的相位跟着步子 */
  function* walk(a: Actor, pts: V3[], speed = 1.5, pose = 'walk', stride = 1.25, carry?: (a: Actor) => void): Co {
    for (const p of pts) {
      while (true) {
        const dt = yield;
        const d = new THREE.Vector3(p.x - a.pos.x, 0, p.z - a.pos.z);
        const L = d.length();
        const step = speed * dt;
        if (L <= step) {
          a.pos.x = p.x;
          a.pos.z = p.z;
          a.pos.y = p.y;
          carry?.(a);
          break;
        }
        // y 跟着水平进度插值（台阶）
        const k = step / L;
        a.pos.x += d.x * k;
        a.pos.z += d.z * k;
        a.pos.y = lerp(a.pos.y, p.y, k);
        a.yaw = turnTo(a.yaw, Math.atan2(d.x, d.z), dt * 10);
        a.walkPh = (a.walkPh + step / stride) % 1;
        a.pose(pose, a.walkPh);
        carry?.(a);
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
  /** 并行跑几个协程，全部结束才结束 */
  function* all(...cos: Co[]): Co {
    for (const c of cos) c.next(0);
    let live = cos.slice();
    while (live.length) {
      const dt = yield;
      live = live.filter((c) => !c.next(dt).done);
    }
  }

  // ── 击球规划 ─────────────────────────────────
  // 每拍在出手的时刻 t0 就定下：落地点 B、接球的人用哪种拍、站哪、拍面在哪（= 球的下一个出手点 P1）、几时到（t1）。
  // 球按两段抛物线（P0 → B → P1）走，到 t1 正好到拍面；挥拍从 t1 − C·SWING 开始，相位 C 时拍面到击球点。
  interface Shot {
    hitter: Actor;
    recv: Actor;
    t1: number;
    P1: V3;
    stroke: string;
    /** 站位（多球：轮到这个球才排跑位和挥拍） */
    stand: V3;
    sched: boolean;
  }
  /** 球员的右手方向（世界）：右手在本地 −x */
  const rightOf = (yaw: number) => v(-1, 0, 0).applyAxisAngle(Y, yaw);
  /** 定接球：给想要的击球点附近 target，挑正反手、算站位（夹在场内），返回真正的击球点 */
  const planReceive = (r: Actor, target: V3, tc: number, schedule = true) => {
    const yaw = r.ctl!.netYaw;
    const side = rightOf(yaw);
    const rel = (target.x - r.pos.x) * side.x + (target.z - r.pos.z) * side.z;
    const stroke = rel > -0.5 ? 'forehand' : 'backhand';
    const off = r.contact.get(stroke)!.clone().applyAxisAngle(Y, yaw);
    const sz = Math.sign(r.pos.z) || 1;
    const stand = v(
      clamp(target.x - off.x, -BX + 0.5, BX - 0.5),
      PAD_Y,
      sz * clamp(Math.abs(target.z - off.z), 2.5, BZ - 0.6),
    );
    const P1 = contactAt(r, stroke, stand, yaw);
    if (schedule) scheduleReceive(r, stand, stroke, tc);
    return { P1, stand, stroke };
  };
  /** 起动去站位（反应 0.1 秒，提前 0.32 秒到、跑不及最晚提前 0.04 秒到），挥拍按击球时刻倒推 */
  const scheduleReceive = (r: Actor, stand: V3, stroke: string, tc: number) => {
    moveTo(r, stand, now + 0.1, tc - 0.32, tc - 0.04);
    r.ctl!.swings.push({ name: stroke, t0: tc - C_STROKE * SWING, dur: SWING });
  };
  /** 打完回位：跟随动作做完前就开始往底线中间挪 */
  const recover = (a: Actor, t0: number, xk = 0.3) => {
    const sz = Math.sign(a.pos.z) || 1;
    const to = v(a.pos.x * xk, PAD_Y, sz * (COURT.hl + 0.3));
    a.ctl!.move = { t0: t0 + 0.25, t1: t0 + 0.25 + Math.max(0.6, flat(a.pos, to) / 3), from: a.pos.clone(), to };
  };
  /**
   * 一拍：球现在（now = t0）在 P0 离开 hitter 的拍面。
   * kind：rally（对方接得到）、winner（打到角上，对方追不到）、out（出界）、net（下网）。
   * 对打返回下一拍；其余返回 null，球交给物理。
   */
  const hit = (
    b: Ball,
    hitter: Actor,
    recv: Actor,
    P0: V3,
    kind: 'rally' | 'winner' | 'out' | 'net',
    tHit: number,
    serve = false,
  ): Shot | null => {
    state.shots++;
    const dz = -Math.sign(hitter.pos.z) || 1;
    b.on = true;
    b.held = false;
    b.rest = 0;
    if (recv.ctl) recv.ctl.readyPh = 0.25; // 分腿垫步：对方出手时一跳
    if (kind === 'net') {
      const tgt = v(P0.x * 0.6 + (rnd() - 0.5) * 2, 0.45, dz * 0.15);
      const T = flat(P0, tgt) / 13;
      b.free = true;
      b.segs = [];
      b.p.copy(P0);
      b.v.copy(launch(P0, tgt, T));
      // 已经飞了 now − tHit 秒
      b.p.addScaledVector(b.v, now - tHit);
      recv.ctl!.move = null;
      return null;
    }
    const vh = serve ? 15 + rnd() * 2 : 10.5 + rnd() * 3;
    if (kind === 'out' || kind === 'winner') {
      const B =
        kind === 'out'
          ? v((rnd() * 2 - 1) * 4, ground, dz * (COURT.hl + 0.6 + rnd() * 1.2))
          : v((rnd() < 0.5 ? -1 : 1) * (COURT.hw - 0.4 - rnd() * 0.6), ground, dz * (8 + rnd() * 3));
      b.free = false;
      b.segs = [seg(tHit, P0, B, flat(P0, B) / vh, true)];
      // 接球的人：出界就不动（看着球飞出去）；打到角上追几步，追不上
      if (kind === 'winner') {
        const sz = Math.sign(recv.pos.z) || 1;
        const chase = v(lerp(recv.pos.x, B.x, 0.55), PAD_Y, sz * (COURT.hl - 0.2));
        moveTo(recv, chase, now + 0.25, tHit + flat(P0, B) / vh + 0.5);
      }
      return null;
    }
    // 对打：先想好球到对方那边的击球点（底线附近），再按它倒推落地点
    let target: V3;
    if (serve) {
      const sx = Math.sign(recv.pos.x) || 1;
      target = v(sx * (1.2 + rnd() * 1.6), 0.9, dz * (COURT.hl - 0.4 + rnd() * 1.2));
    } else target = v((rnd() * 2 - 1) * 3.8, 0.9, dz * (COURT.hl - 1.2 + rnd() * 2.2));
    // 落地点在出手点 → 击球点连线的 70～78% 处（发球落在发球区）
    const f = serve ? 0 : 0.7 + rnd() * 0.08;
    const B = serve
      ? v(Math.sign(target.x) * (1 + rnd() * 2), ground, dz * (COURT.service - 0.5 - rnd() * 1.4))
      : v(lerp(P0.x, target.x, f), ground, lerp(P0.z, target.z, f));
    const T1 = flat(P0, B) / vh;
    const T2 = Math.max(0.38, flat(B, target) / (vh * 0.7));
    const tc = tHit + T1 + T2;
    const { P1, stroke } = planReceive(recv, target, tc);
    b.free = false;
    b.segs = [seg(tHit, P0, B, T1, true), seg(tHit + T1, B, P1, T2, false)];
    return { hitter, recv, t1: tc, P1, stroke, stand: P1, sched: true };
  };

  /** 一分：发球 + 对打若干拍；返回赢家（0 北 / 1 南） */
  function* point(server: number): Generator<void, number, number> {
    const [N, S] = players;
    const pl = [N, S];
    const srv = pl[server];
    const rcv = pl[1 - server];
    const sgn = (i: number) => (i === 0 ? -1 : 1); // 北半场 z<0
    const deuce = state.points % 2 === 0 ? 1 : -1;
    // 站位
    const sx = 1.1 * deuce * -sgn(server);
    const rx = 2.6 * deuce * sgn(server);
    yield* all(
      walk(srv, [v(sx, PAD_Y, sgn(server) * (COURT.hl + 0.4))], 2.2),
      walk(rcv, [v(rx, PAD_Y, sgn(1 - server) * (COURT.hl - 0.6))], 2.2),
    );
    srv.yaw = server === 0 ? 0 : Math.PI;
    rcv.yaw = server === 0 ? Math.PI : 0;
    if (PLAY) yield* standCheck(pl);
    for (const a of pl) {
      a.ctl = { netYaw: a.yaw, move: null, swings: [], readyPh: 0 };
      a.pose('ready', 0);
    }
    yield* wait(0.5);
    state.phase = 'rally';

    // 发球：TOSS_AT 时球从左手抛起（按重力），拍面到最高点的那一刻正好落到拍面上，从那里出去
    const tServe = now + srv.serveC * SERVE_DUR;
    srv.ctl!.swings.push({ name: 'serve', t0: now, dur: SERVE_DUR });
    const tToss = now + TOSS_AT * SERVE_DUR;
    const tossFrom = v(0.32, 1.05, 0.2).applyAxisAngle(Y, srv.ctl!.netYaw).add(srv.pos);
    RALLY.on = false;
    yield* until(() => now >= tToss);
    RALLY.on = true;
    RALLY.free = false;
    RALLY.p.copy(tossFrom);
    RALLY.segs = [seg(tToss, tossFrom, contactAt(srv, 'serve', srv.pos, srv.ctl!.netYaw), tServe - tToss, false)];
    yield* until(() => now >= tServe);
    let shots = 1 + Math.floor(rnd() * 6);
    const ending = (): 'rally' | 'winner' | 'out' | 'net' => {
      if (shots > 0) return 'rally';
      const r = rnd();
      return r < 0.4 ? 'out' : r < 0.6 ? 'net' : 'winner';
    };
    let k = ending();
    let shot = hit(RALLY, srv, rcv, contactAt(srv, 'serve', srv.pos, srv.ctl!.netYaw), k, tServe, true);
    recover(srv, tServe, 0.6);
    let hitter = server;
    while (shot) {
      const s = shot;
      yield* until(() => now >= s.t1);
      // 击球的那一刻：球从拍面直接走，不停
      shots--;
      hitter = 1 - hitter;
      k = ending();
      shot = hit(RALLY, s.recv, s.hitter, s.P1, k, s.t1);
      recover(s.recv, s.t1);
    }
    const winner = k === 'winner' ? hitter : 1 - hitter;
    // 球落地、弹两下、滚走
    yield* until(() => RALLY.free && (RALLY.rest > 0.3 || Math.abs(RALLY.p.z) > COURT.hl + 1.5), 4);
    yield* wait(0.6);
    RALLY.on = false;
    for (const a of pl) {
      a.ctl = null;
      a.pose('idle');
    }
    return winner;
  }

  /** 玩法：站位上有散球或积沙 → 冒气泡等着（最多 9 秒，之后凑合着打） */
  const standIssue = (a: Actor): string | null => {
    for (const b of balls) if (b !== RALLY && b.on && b.free && !b.held && flat(b.p, a.pos) < 1.6) return '有球！';
    if (sand) {
      let m = 0;
      for (const [dx, dz] of [
        [0, 0],
        [0.6, 0],
        [-0.6, 0],
        [0, 0.6],
        [0, -0.6],
      ])
        m = Math.max(m, sand.at(a.pos.x + dx, a.pos.z + dz));
      if (m > 0.035) return '有沙！';
    }
    return null;
  };
  function* standCheck(pl: Actor[]): Co {
    let t = 0;
    while (t < 9) {
      let any = false;
      for (const a of pl) {
        const w = standIssue(a);
        if (w) {
          bubbles.set(a, w);
          any = true;
        } else bubbles.delete(a);
      }
      if (!any) break;
      state.phase = 'waiting';
      t += yield;
    }
    for (const a of pl) bubbles.delete(a);
  }

  /** 分间：总监去扫最脏的一堆沙 */
  function* sweepBreak(): Co {
    state.phase = 'break';
    const d = sand?.dirtiest(0.05, director.pos);
    if (!d) {
      yield* wait(1.2);
      return;
    }
    const D = director;
    let side = Math.sign(D.pos.z) || 1;
    // 站在沙堆北边一点（扫帚头在身前 1.1 米），朝南推
    const stand = v(d.x, PAD_Y, d.z - 1.0);
    const route: V3[] = [];
    const targetSide = Math.sign(stand.z) || 1;
    if (targetSide !== side) route.push(v(-7.5, PAD_Y, side * 0.8), v(-7.5, PAD_Y, targetSide * 0.8));
    route.push(stand);
    yield* walk(D, route, 2.8);
    side = targetSide;
    yield* face(D, 0, 0.25);
    // 扫：来回推，前后挪一点；每 0.1 秒扫一下、扬尘
    let t = 0;
    let acc = 0;
    const x0 = D.pos.x;
    while (t < 6) {
      const dt = yield;
      t += dt;
      acc += dt;
      D.pose('sweep', (t / 1.3) % 1);
      D.pos.x = x0 + Math.sin(t * 1.1) * 0.85;
      D.pos.z = stand.z + Math.min(1.2, t * 0.18);
      if (acc > 0.1) {
        acc = 0;
        const bx = D.pos.x + Math.sin(D.yaw) * 1.15;
        const bz = D.pos.z + Math.cos(D.yaw) * 1.15;
        const got = sand?.sweep(bx, bz, 0.8, 0.05) ?? 0;
        if (got > 0.0004 && rnd() < 0.7)
          fx.puff(v(bx, PAD_Y + (sand?.at(bx, bz) ?? 0), bz + 0.2), Math.min(0.26, 0.12 + got * 12), 2);
      }
      if (t > 2.5 && (sand?.at(d.x, d.z) ?? 0) < 0.02 && (sand?.at(d.x, d.z + 0.8) ?? 0) < 0.02) break;
    }
    yield* goHome(D, side);
  }
  /** 总监从场上回西侧网柱旁（要过网就从西柱外绕） */
  function* goHome(D: Actor, side = Math.sign(D.pos.z) || 1, speed = 2.8): Co {
    const home: V3[] = [];
    if (side !== Math.sign(DIRECTOR_HOME.z)) home.push(v(-7.5, PAD_Y, side * 0.8), v(-7.5, PAD_Y, -side * 0.8));
    home.push(DIRECTOR_HOME);
    yield* walk(D, home, speed);
    yield* face(D, Math.PI / 2, 0.3);
    D.pose('idle');
  }

  const PTS = ['0', '15', '30', '40', '局'];
  const scoreText = () => {
    const [a, b] = state.score;
    return `${PTS[Math.min(4, a)]} – ${PTS[Math.min(4, b)]}`;
  };
  const newGroup = () => {
    state.group++;
    const vars = [
      [0, 1],
      [2, 3],
      [1, 2],
      [3, 0],
    ][(state.group - 1) % 4];
    players = vars.map((vi) => {
      const a = actor(make('player', vi));
      measureContacts(a);
      return a;
    });
  };
  /** 走下台阶离场（后台跑，不挡下一幕） */
  const leave = (a: Actor, via: V3[] = []) =>
    spawn(
      (function* (): Co {
        a.ctl = null;
        yield* walk(a, [...via, ...ARRIVE.slice(4).reverse()], 2.0);
        scene.remove(a.obj);
        players = players.filter((p) => p !== a);
      })(),
    );

  // ── 第一幕：对打 ─────────────────────────────────
  function* rallyScene(nPoints: number): Co {
    state.scene = 'rally';
    newGroup();
    // 从台阶顶出现（不用等 30 秒走上来）
    for (const [i, p] of players.entries()) {
      p.pos.copy(ARRIVE[7]).add(v(i * 0.6, 0, i * 0.4));
      scene.add(p.obj);
    }
    state.phase = 'arrive';
    state.score = [0, 0];
    const [N, S] = players;
    yield* all(
      walk(N, [...ARRIVE.slice(8), v(7.0, PAD_Y, 6), v(7.0, PAD_Y, -6), v(2, PAD_Y, -COURT.hl - 0.4)], 2.4),
      (function* (): Co {
        yield* wait(0.7);
        yield* walk(S, [...ARRIVE.slice(8), v(2, PAD_Y, COURT.hl + 0.4)], 2.2);
      })(),
    );
    let server = rnd() < 0.5 ? 0 : 1;
    for (let k = 0; k < nPoints; k++) {
      state.points = k;
      const w = yield* point(server);
      state.score[w]++;
      if (hud) hud.textContent = scoreText();
      // 演示轮播里只在第一分后扫一次（单演 rally 时每分都扫）
      if (PLAY) yield* wait(1.2);
      else if (k < nPoints - 1 && (forcedScene === 'rally' || k === 0)) yield* sweepBreak();
      if (k % 4 === 3) server = 1 - server;
    }
    if (hud) hud.textContent = '';
  }

  // ── 第二幕：多球 ─────────────────────────────────
  const coachFeedPoint = () => {
    if (!coach) return v(0, 1, 0);
    const f = coach.obj.userData.feedPoint?.() as V3 | undefined;
    if (f) return f.clone();
    return v(-0.35, 1.05, 0.45).applyAxisAngle(Y, coach.yaw).add(coach.pos);
  };
  const cartFollow = (a: Actor) => {
    if (!cart) return;
    // 推着走：车在身前 0.8 米，推把（车的 −z）朝人
    cart.position.set(a.pos.x + Math.sin(a.yaw) * 0.8, a.pos.y, a.pos.z + Math.cos(a.yaw) * 0.8);
    cart.rotation.y = a.yaw;
  };
  /** 喂球时球车在教练左手边（本地 +x 0.75、z 0.25） */
  const cartBeside = (a: Actor) => {
    if (!cart) return;
    cart.position.copy(v(0.75, 0, 0.25).applyAxisAngle(Y, a.yaw).add(a.pos));
    cart.rotation.y = a.yaw;
  };
  function* drillScene(nFeeds: number, staying: Actor | null): Co {
    state.scene = 'drill';
    state.phase = 'drill-setup';
    if (!coach) return;
    // 球员：上一幕留下的那个，没有就叫一个
    let P = staying;
    if (!P) {
      newGroup();
      P = players[0];
      scene.remove(players[1].obj);
      players = [P];
      P.pos.copy(ARRIVE[7]);
      scene.add(P.obj);
    }
    const pl = P;
    // 玩法：球车里没几个球了 → 教练喂不了，冒个气泡，球员走掉
    if (PLAY && cartCount < 4) {
      bubbles.set(coach, '没球了！');
      yield* wait(4);
      bubbles.delete(coach);
      leave(pl, [v(4.9, PAD_Y, COURT.hl + 0.4)]);
      return;
    }
    coach.obj.userData.setProp?.('racket');
    setCart(cartCount);
    const C = coach;
    yield* all(
      walk(
        C,
        [v(7.4, PAD_Y, -3.3), v(FEED_AT.x + 0.6, PAD_Y, FEED_AT.z - 1.4), FEED_AT],
        1.6,
        'walk',
        1.25,
        cartFollow,
      ),
      walk(pl, [v(0.5, PAD_Y, COURT.hl - 0.2)], 2.2),
    );
    yield* face(C, 0, 0.3);
    cartBeside(C);
    yield* face(pl, Math.PI, 0.2);
    pl.ctl = { netYaw: Math.PI, move: null, swings: [], readyPh: 0 };
    C.pose('ready', 0);
    yield* wait(0.4);
    state.phase = 'drill';
    const FEED_DUR = 0.8;
    const release = FEED_RELEASE;
    const pending: { b: Ball; shot: Shot }[] = [];
    let fed = 0;
    let nextFeed = now;
    let feedT0 = -1;
    while (fed < nFeeds || pending.length || (feedT0 >= 0 && now < feedT0 + FEED_DUR)) {
      // 喂球动作：每 1.25 秒一个；FEED_RELEASE 那一刻球离手
      if (fed < nFeeds && now >= nextFeed && feedT0 < 0) feedT0 = now;
      if (feedT0 >= 0) {
        const ph = (now - feedT0) / FEED_DUR;
        if (ph >= 1) {
          feedT0 = -1;
          C.pose('ready', 0);
        } else {
          C.pose('feed', ph);
          if (ph >= release && nextFeed <= now) {
            const b = cartCount > 0 ? takeBall() : null;
            if (b) {
              setCart(cartCount - 1);
              const P0 = coachFeedPoint();
              b.p.copy(P0);
              const shot = feed(b, pl, P0);
              pending.push({ b, shot });
            }
            fed++;
            nextFeed = now + 1.25;
          }
        }
      }
      // 打回去：落在北半场各处（有的下网），交给物理弹、滚
      while (pending.length && now >= pending[0].shot.t1) {
        const { b, shot } = pending.shift()!;
        const r = rnd();
        const P0 = shot.P1;
        let tgt: V3;
        let T: number;
        if (r < 0.15) {
          tgt = v(P0.x * 0.5 + (rnd() - 0.5) * 3, 0.5, 0.1);
          T = flat(P0, tgt) / 12;
        } else {
          tgt = v((rnd() * 2 - 1) * 4.6, ground, -(3 + rnd() * 8.5));
          T = flat(P0, tgt) / (11 + rnd() * 3);
        }
        b.free = true;
        b.segs = [];
        b.p.copy(P0);
        b.v.copy(launch(P0, tgt, T));
        b.p.addScaledVector(b.v, now - shot.t1);
        b.rest = 0;
        state.shots++;
        recover(pl, shot.t1, 0.25);
        pl.ctl!.move!.to.z = COURT.hl - 0.4;
      }
      // 上一个球打完了才去追下一个
      const nx = pending.find((q) => !q.shot.sched);
      if (nx && !pending.some((q) => q.shot.sched)) {
        nx.shot.sched = true;
        scheduleReceive(pl, nx.shot.stand, nx.shot.stroke, nx.shot.t1);
      }
      yield;
    }
    pl.ctl = null;
    pl.pose('idle');
    C.pose('idle');
    yield* wait(1.2);
    state.phase = 'drill-done';
    // 球员走掉；教练把车推回去
    leave(pl, [v(4.9, PAD_Y, COURT.hl + 0.4)]);
    coach.obj.userData.setProp?.(null);
    yield* walk(C, [v(C.pos.x - 0.2, PAD_Y, C.pos.z - 0.7)], 1.2);
    if (PLAY && cart) {
      // 玩法：教练自己把球车推回场边（总监要去那儿倒球）
      const cp = cart.position.clone();
      yield* walk(C, [v(cp.x, PAD_Y, cp.z - 0.85)], 1.6);
      yield* walk(C, [v(7.4, PAD_Y, -3.3), COACH_HOME], 1.6, 'walk', 1.25, cartFollow);
      cart.position.copy(CART_HOME);
      cart.rotation.y = -Math.PI / 2;
      yield* face(C, -Math.PI / 2, 0.3);
    } else yield* face(C, Math.PI / 2, 0.3);
    C.pose('idle');
  }
  /** 喂一个球：低平地送到球员正手、反弹后到击球点 */
  const feed = (b: Ball, pl: Actor, P0: V3): Shot => {
    b.on = true;
    b.held = false;
    b.free = false;
    const target = v(0.6 + (rnd() * 2 - 1) * 2.6, 0.9, COURT.hl - 1.4 + rnd() * 1.6);
    const B = v(lerp(P0.x, target.x, 0.62), ground, lerp(P0.z, target.z, 0.62));
    const T1 = flat(P0, B) / 9;
    const T2 = Math.max(0.42, flat(B, target) / 6);
    const tc = now + T1 + T2;
    const { P1, stroke, stand } = planReceive(pl, target, tc, false);
    b.segs = [seg(now, P0, B, T1, true), seg(now + T1, B, P1, T2, false)];
    state.shots++;
    return { hitter: pl, recv: pl, t1: tc, P1, stroke, stand, sched: false };
  };

  // ── 第三幕：捡球 ─────────────────────────────────
  /** 捡球器建在总监身上（rig 按 push 姿势摆在身前 1.5 米的地上）：userData.picker = { roll, setCount } */
  const picker = (): THREE.Object3D | null => (director.obj.userData.picker as THREE.Object3D | undefined) ?? null;
  let pickerCount = 0;
  /** 笼子在地上的位置（世界）：按姿势摆的本地位置转到总监的朝向上（不读世界矩阵：本帧还没同步） */
  const PICK_REACH = 1.5;
  const pickerHead = (a: Actor, out = new THREE.Vector3()) => {
    const pk = picker();
    const lz = pk?.visible ? pk.position.z : PICK_REACH;
    const lx = pk?.visible ? pk.position.x : 0;
    return out.set(
      a.pos.x + lx * Math.cos(a.yaw) + lz * Math.sin(a.yaw),
      PAD_Y,
      a.pos.z - lx * Math.sin(a.yaw) + lz * Math.cos(a.yaw),
    );
  };
  /** 把捡球器的笼子推到 to：人先转向（笼子在人身前 PICK_REACH，人朝着目标笼子才会压上去），再直着推；目标在身前太近就退半步 */
  function* push(a: Actor, to: V3, speed: number, onStep: (head: V3, step: number) => void): Co {
    const head = new THREE.Vector3();
    let t = 0;
    while (t < 12) {
      const dt = yield;
      t += dt;
      const bx = to.x - a.pos.x;
      const bz = to.z - a.pos.z;
      const D = Math.hypot(bx, bz);
      const want = Math.atan2(bx, bz);
      let dd = want - a.yaw;
      dd -= Math.round(dd / (Math.PI * 2)) * Math.PI * 2;
      if (pickerHead(a, head).distanceTo(tmp.set(to.x, PAD_Y, to.z)) < 0.15) break;
      if (D < 0.4) {
        // 目标就在脚下：退一步再说
        a.pos.x -= Math.sin(a.yaw) * speed * 0.5 * dt;
        a.pos.z -= Math.cos(a.yaw) * speed * 0.5 * dt;
        a.walkPh = (a.walkPh - (speed * 0.5 * dt) / 1.1 + 1) % 1;
        a.pose('push', a.walkPh);
        continue;
      }
      const turn = clamp(dd, -4 * dt, 4 * dt);
      a.yaw += turn;
      let step = 0;
      if (Math.abs(dd) < 0.35) {
        const gap = D - PICK_REACH;
        step = clamp(gap, -speed * 0.5 * dt, speed * dt * Math.cos(dd));
        if (Math.abs(gap) < 0.06 && Math.abs(dd) < 0.08) break;
      }
      a.pos.x += Math.sin(a.yaw) * step;
      a.pos.z += Math.cos(a.yaw) * step;
      a.pos.x = clamp(a.pos.x, -BX - 0.6, BX + 0.6);
      a.pos.z = clamp(a.pos.z, -BZ - 0.6, BZ + 0.6);
      // 原地转的时候脚也挪（相位按转过的角度走一点）
      a.walkPh = (a.walkPh + (step + Math.abs(turn) * 0.35) / 1.1 + 1) % 1;
      a.pose('push', a.walkPh);
      picker()?.userData.roll?.(dt, step / Math.max(dt, 1e-4));
      onStep(pickerHead(a, head), step);
    }
  }
  function* pickScene(): Co {
    state.scene = 'pick';
    state.phase = 'pick';
    const D = director;
    const loose = () => balls.filter((b, i) => i > 0 && b.on && b.free && !b.held);
    // 球还在滚就等一下
    yield* until(() => loose().every((b) => b.rest > 0.2), 4);
    if (!loose().length) return;
    D.obj.userData.setProp?.('picker');
    D.pose('push', 0);
    pickerCount = 0;
    picker()?.userData.setCount?.(0);
    const grab = (head: V3) => {
      for (const b of loose()) {
        if (Math.hypot(b.p.x - head.x, b.p.z - head.z) < 0.34) {
          b.held = true;
          b.on = false;
          pickerCount++;
          picker()?.userData.setCount?.(pickerCount);
        }
      }
    };
    // 贪心最近邻：先扫完自己这半场，再从西柱外绕过网扫另一半
    let side = Math.sign(D.pos.z) || 1;
    for (let pass = 0; pass < 2; pass++) {
      while (true) {
        const head = pickerHead(D);
        const mine = loose().filter((b) => Math.sign(b.p.z) === side || Math.abs(b.p.z) < 0.2);
        if (!mine.length) break;
        mine.sort((a, b) => flat(a.p, head) - flat(b.p, head));
        const tgt = mine[0];
        yield* push(D, v(tgt.p.x, 0, tgt.p.z - (Math.abs(tgt.p.z) < 0.2 ? side * 0.1 : 0)), 2.2, grab);
        grab(pickerHead(D));
      }
      if (!loose().length) break;
      // 过网：从西柱外（x = −6.75）绕
      yield* push(D, v(-6.7, 0, side * 0.9), 2.0, grab);
      yield* push(D, v(-6.7, 0, -side * 0.9), 2.0, grab);
      side = -side;
    }
    // 倒回球车
    state.phase = 'dump';
    const at = cart ? cart.position.clone() : v(FEED_AT.x + 0.75, 0, FEED_AT.z + 0.25);
    const sideC = Math.sign(at.z) || 1;
    if (sideC !== side) {
      yield* push(D, v(-6.7, 0, side * 0.9), 2.0, grab);
      yield* push(D, v(-6.7, 0, sideC * 0.9), 2.0, grab);
    }
    // 从东边正对着球车推过去（教练站在车的西边），笼子停在车东沿
    yield* push(D, v(at.x + 2.6, 0, at.z + 0.1), 2.2, () => {});
    yield* push(D, v(at.x + 0.7, 0, at.z + 0.1), 1.2, () => {});
    D.pose('push', 0);
    yield* wait(0.5);
    // 倒：每 0.06 秒一个球从笼子到车里
    while (pickerCount > 0) {
      yield* wait(0.06);
      pickerCount--;
      picker()?.userData.setCount?.(pickerCount);
      setCart(cartCount + 1);
    }
    fx.puff(v(at.x, 0.6, at.z), 0.15, 2);
    yield* wait(0.5);
    for (const b of balls) if (b.held) b.held = false;
    D.obj.userData.setProp?.('broom');
    // 先往后（北）退开，别从教练身上穿过去
    yield* walk(D, [v(D.pos.x + 0.3, PAD_Y, D.pos.z - 1.8)], 2.0);
    yield* goHome(D, Math.sign(D.pos.z) || 1, 2.4);
  }

  // ── 第四幕：吹沙 ─────────────────────────────────
  /** 吹叶机：嘴在哪、朝哪（世界坐标）；资产没给就按身前估 */
  const nozzle = (a: Actor) => {
    const n = a.obj.userData.nozzle?.() as V3 | undefined;
    const d = a.obj.userData.nozzleDir?.() as V3 | undefined;
    return {
      p: n ? n.clone() : v(a.pos.x + Math.sin(a.yaw) * 0.9, 0.35, a.pos.z + Math.cos(a.yaw) * 0.9),
      d: d ? d.clone().normalize() : v(Math.sin(a.yaw), -0.3, Math.cos(a.yaw)).normalize(),
    };
  };
  function* blowScene(): Co {
    state.scene = 'blow';
    state.phase = 'blow';
    if (!coach || !sand) return;
    const C = coach;
    C.obj.userData.setProp?.('blower');
    // 量一下 blow 姿势一个来回里管口的平均位置和方向（人本地，朝向 0）
    const aim = { off: 0, pos: v(0, 0, 0.9) };
    if (C.obj.userData.nozzle) {
      const p0 = C.obj.position.clone();
      const r0 = C.obj.rotation.y;
      C.obj.position.set(0, 0, 0);
      C.obj.rotation.y = 0;
      let sx = 0;
      let sz = 0;
      const sp = v(0, 0, 0);
      const N = 20;
      for (let k = 0; k < N; k++) {
        C.pose('blow', k / N);
        const n = C.obj.userData.nozzle() as V3;
        const d = C.obj.userData.nozzleDir() as V3;
        const l = Math.hypot(d.x, d.z) || 1;
        sx += d.x / l;
        sz += d.z / l;
        sp.add(n);
      }
      aim.off = Math.atan2(sx, sz);
      aim.pos.set(sp.x / N, 0, sp.z / N);
      C.obj.position.copy(p0);
      C.obj.rotation.y = r0;
      C.obj.updateMatrixWorld(true);
    }
    // 挑三堆最厚的沙丘（场内），每堆往最近的场边吹
    const piles = sand.homes
      .map((h) => ({ ...h, a: sand.at(h.x, h.z) }))
      .filter((h) => h.a > 0.04 && Math.abs(h.x) < BX - 0.2 && Math.abs(h.z) < BZ - 0.2)
      .sort((p, q) => q.a - p.a)
      .slice(0, 3);
    // 路线：从东柱出发，最近的先吹
    const todo = piles.slice();
    let side = Math.sign(C.pos.z) || -1;
    while (todo.length) {
      todo.sort((p, q) => Math.hypot(p.x - C.pos.x, p.z - C.pos.z) - Math.hypot(q.x - C.pos.x, q.z - C.pos.z));
      const p = todo.shift()!;
      // 往最近的边吹（东西边看 x，南北边看 z）
      const ex = BX - Math.abs(p.x);
      const ez = BZ - Math.abs(p.z);
      const dir = ex < ez ? v(Math.sign(p.x), 0, 0) : v(0, 0, Math.sign(p.z));
      // 管口扫的中心偏在人的右前方：人朝向要减掉这个偏角，管口才正对着沙堆往场边吹
      const yaw = Math.atan2(dir.x, dir.z) - aim.off;
      const no = aim.pos.clone().applyAxisAngle(Y, yaw);
      const stand = v(p.x - dir.x * 1.3 - no.x, PAD_Y, p.z - dir.z * 1.3 - no.z);
      stand.x = clamp(stand.x, -BX + 0.4, BX - 0.4);
      stand.z = clamp(stand.z, -BZ + 0.4, BZ - 0.4);
      const route: V3[] = [];
      const ts = Math.sign(stand.z) || 1;
      if (ts !== side) route.push(v(7.4, PAD_Y, side * 0.8), v(7.4, PAD_Y, ts * 0.8));
      route.push(stand);
      yield* walk(C, route, 2.3);
      side = ts;
      yield* face(C, yaw, 0.35);
      // 吹：喷嘴左右扫，人慢慢往场边走；每 0.08 秒吹一下
      let t = 0;
      let acc = 0;
      const lat = v(dir.z, 0, -dir.x);
      const s0 = stand.clone();
      while (t < 5.5) {
        const dt = yield;
        t += dt;
        acc += dt;
        C.pose('blow', (t / 1.6) % 1);
        const fwd = Math.min(2.4, t * 0.4);
        C.pos.set(
          s0.x + dir.x * fwd + lat.x * Math.sin(t * 0.9) * 0.5,
          PAD_Y,
          s0.z + dir.z * fwd + lat.z * Math.sin(t * 0.9) * 0.5,
        );
        C.pos.x = clamp(C.pos.x, -BX + 0.3, BX - 0.3);
        C.pos.z = clamp(C.pos.z, -BZ + 0.3, BZ - 0.3);
        const n = nozzle(C);
        const fl = Math.hypot(n.d.x, n.d.z) || 1;
        const dx = n.d.x / fl;
        const dz = n.d.z / fl;
        fx.spray(n.p, n.d, dt);
        if (acc > 0.08) {
          acc = 0;
          const got = sand.blow(n.p.x, n.p.z, dx, dz, 2.4, 1.3, 0.02);
          if (got > 0.0005) {
            const k = 1.2 + rnd() * 1.0;
            fx.puff(v(n.p.x + dx * k, PAD_Y + 0.05, n.p.z + dz * k), Math.min(0.3, 0.14 + got * 8), 1);
          }
        }
        if (t > 3 && sand.at(p.x, p.z) < 0.02 && sand.at(p.x + dir.x, p.z + dir.z) < 0.02) break;
      }
    }
    C.obj.userData.setProp?.(null);
    const home: V3[] = [];
    if (side !== Math.sign(COACH_HOME.z)) home.push(v(7.4, PAD_Y, side * 0.8), v(7.4, PAD_Y, -side * 0.8));
    // 先去把球车推回场边
    if (cart) {
      const cp = cart.position.clone();
      home.push(v(cp.x - Math.sin(-0.3) * 0.8 - 0.2, PAD_Y, cp.z - 0.9));
      yield* walk(C, home, 1.9);
      yield* walk(C, [v(7.4, PAD_Y, -3.3), COACH_HOME], 1.6, 'walk', 1.25, cartFollow);
      cart.position.copy(CART_HOME);
      cart.rotation.y = -Math.PI / 2;
    } else {
      home.push(COACH_HOME);
      yield* walk(C, home, 1.9);
    }
    yield* face(C, -Math.PI / 2, 0.3);
    C.pose('idle');
  }

  /** ?scene=pick：直接在场上撒一把球，从捡球开始 */
  const scatter = (n: number) => {
    const r = ctx.rng('life:scatter');
    for (let i = 0; i < n; i++) {
      const b = takeBall();
      if (!b) break;
      b.on = true;
      b.free = true;
      b.held = false;
      b.segs = [];
      b.rest = 1;
      b.v.set(0, 0, 0);
      const north = r() < 0.75;
      b.p.set((r() * 2 - 1) * 6.4, ground, (north ? -1 : 1) * (0.5 + r() * 13.2));
    }
    setCart(cartCount - n);
  };

  function* playLoop(): Co {
    yield* wait(0.3);
    while (true) {
      yield* rallyScene(3);
      const [N, S] = players;
      leave(N, [v(7.0, PAD_Y, -6), v(7.0, PAD_Y, 6)]);
      yield* drillScene(12, S);
      yield* wait(2);
    }
  }
  function* main(): Co {
    if (PLAY) {
      yield* playLoop();
      return;
    }
    yield* wait(0.3);
    const forced = forcedScene;
    while (true) {
      if (!forced || forced === 'rally') {
        yield* rallyScene(forced ? 4 : 3);
        // 北边的人走，南边的人留下来练多球
        const [N, S] = players;
        if (forced === 'rally') {
          leave(N, [v(7.0, PAD_Y, -6), v(7.0, PAD_Y, 6)]);
          leave(S);
          yield* wait(5);
        } else {
          leave(N, [v(7.0, PAD_Y, -6), v(7.0, PAD_Y, 6)]);
          if (!forced) yield* drillScene(12, S);
        }
      } else if (forced === 'drill') yield* drillScene(14, null);
      if (!forced || forced === 'drill' || forced === 'pick') {
        if (forced === 'pick') scatter(16);
        yield* pickScene();
      }
      if (!forced || forced === 'blow') {
        yield* blowScene();
        yield* wait(forced ? 3 : 1);
      }
      if (forced === 'pick' || forced === 'drill' || forced === 'blow') yield* wait(2);
    }
  }
  const co = main();
  co.next(0);
  if (!PLAY) {
    sync(director);
    director.pose('idle');
  }
  if (coach) {
    sync(coach);
    coach.pose('idle');
  }

  return {
    state,
    ball: () => ({ x: RALLY.p.x, y: RALLY.p.y, z: RALLY.p.z, on: RALLY.on }),
    debug: () => ({
      balls: balls
        .map((b, i) =>
          b.on ? [i, +b.p.x.toFixed(2), +b.p.y.toFixed(2), +b.p.z.toFixed(2), b.free, +b.rest.toFixed(1)] : null,
        )
        .filter(Boolean),
      people: cast().map((a) => [a.obj.name, +a.pos.x.toFixed(2), +a.pos.z.toFixed(2), +a.yaw.toFixed(2)]),
      head: pickerHead(director)
        .toArray()
        .map((x) => +x.toFixed(2)),
    }),
    play: {
      director: director.obj,
      loose: () => balls.filter((b, i) => i > 0 && b.on && b.free && !b.held),
      collect: (b) => {
        const B = b as Ball;
        B.on = false;
        B.held = false;
        B.free = false;
      },
      kick: (b, vx, vz, vy = 0) => {
        b.v.x += vx;
        b.v.z += vz;
        b.v.y += vy;
        b.rest = 0;
      },
      cart,
      cartCount: () => cartCount,
      setCartCount: setCart,
      people: () => [...(coach ? [coach] : []), ...players].map((a) => ({ x: a.pos.x, z: a.pos.z, r: 0.35 })),
      alerts: () => [...bubbles].map(([a, text]) => ({ p: a.pos.clone().setY(a.pos.y + 2.25), text })),
    },
    racket: (i) => {
      const a = players[i];
      if (!a) return null;
      const h = findRacketHead(a.obj);
      if (!h) return null;
      const p = headWorld(h);
      return { x: p.x, y: p.y, z: p.z };
    },
    update(dt) {
      lastNow = now;
      now += dt;
      co.next(dt);
      for (let i = bg.length - 1; i >= 0; i--) if (bg[i].next(dt).done) bg.splice(i, 1);
      for (const a of cast()) if (a.ctl) drive(a, dt);
      updateBalls(dt);
      state.sand = Math.round((sand?.total() ?? 0) * 100) / 100;
      for (const a of cast()) {
        sync(a);
        a.obj.userData.update?.(dt);
      }
    },
  };
}

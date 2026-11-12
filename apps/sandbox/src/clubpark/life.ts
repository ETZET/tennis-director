// clubpark 的日常（演出，没有模拟）：大门外的落客区 + 两片停车场。clubpark.md「动起来」那张表，改成"按时间表来车、人按状态反应"：
//   · 每 72 秒一轮（LOOP）：0 秒一辆落客的车从画外（CAR_EDGE_X）开进来停在落客点 → 门童挥手 → 代客开车门、接钥匙 →
//     会员下车走进大门（GATE_TIMING，clubdesk 那边按同一张表进门）→ 代客把车开去南停车场、倒进车位、走回岗亭挂钥匙。
//     门童去后备箱拿会员的球包，放到球包车上。
//   · 20 秒一辆自己停车的车：车道 → 北进出口 → 北通道慢慢找车位（刹车灯一闪一闪）→ 开过车位、倒进去 → 车主走墙边步道进门。
//   · 38 秒一个会员从大门出来要取车：站到代客台前等；代客去岗亭摘钥匙、去南停车场把他的车开到落客点、递钥匙，会员开车从车道往东出画。
//   · 52 秒一个会员从大门出来、走去北停车场自己的车，倒出来 / 开出来，车道往东出画。
// 车：沿圆角折线按弧长走，车头 = 切线方向（倒车反过来），轮子按速度转（setSpeed），减速 / 停着亮刹车灯（setBrake），
// 车门 setDoor 开关。前方 1.5 米探测：前面有车、人、总监、球包车就减速停住（够了，不做真物理）。人只躲开着的车。
// 车位：南停车场是代客的池子（s-near 1/2、s-far 1/2），北停车场是自己停车的池子（n-near 1/2、n-far 1/2）；
// 停着的车由这里建（main.ts 跳过 SLOTS 里的 park-*），开走的车回池子。随机只用种子随机流（ctx.rng('park:life')）。
//
// 玩法模式（opts.play）：总监交给玩家，这里提供 jobs()（接钥匙 / 挂钥匙 / 推球包车，见 play.ts）和 alerts()（头顶气泡）。
// 代客不在的时候来车，会员拿着钥匙在车边等（"代客呢？"）：总监去接钥匙 → 会员先进门；钥匙挂到岗亭，代客回来摘钥匙再去停车。
// 门童装满球包车（4 个）以后就没地方放包了（"推车满了"）：总监把推车推到大门口 = 送进去（setBags(0)）。
// 不在玩法模式（?play=0）时门童自己推车进门，总监站在岗亭前不动。
import * as THREE from 'three';
import { findBones } from './assets/staff/bones';
import { HANDOFF_AT } from './assets/staff/poses';
import type { AssetCtx } from './ctx';
import { AISLE_Z, CAR_EDGE_X, ENTRY, GATE_TIMING, LOOP, ROWS, SPOTS, stallCenter, type V2 } from './layout';

type Co = Generator<void, void, number>;
const P = Math.PI;
const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
const turnTo = (a: number, b: number, k: number) => {
  let d = b - a;
  d -= Math.round(d / (P * 2)) * P * 2;
  return a + d * Math.min(1, k);
};
/** 人的朝向：yaw 0 = 面朝 +z（镜头），atan2(dx, dz) */
const yawOf = (dx: number, dz: number) => Math.atan2(dx, dz);

// ── 路线几何：圆角折线 + 按弧长取点 ─────────────────────────────
interface Path {
  pts: V2[];
  cum: number[];
  len: number;
}
function mkPath(raw: V2[], r = 2.6): Path {
  const pts: V2[] = [raw[0]];
  for (let i = 1; i < raw.length - 1; i++) {
    const [a, b, c] = [raw[i - 1], raw[i], raw[i + 1]];
    const li = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const lo = Math.hypot(c[0] - b[0], c[1] - b[1]);
    const rr = Math.min(r, li / 2, lo / 2);
    if (rr < 0.05) {
      pts.push(b);
      continue;
    }
    const p0: V2 = [b[0] - ((b[0] - a[0]) / li) * rr, b[1] - ((b[1] - a[1]) / li) * rr];
    const p2: V2 = [b[0] + ((c[0] - b[0]) / lo) * rr, b[1] + ((c[1] - b[1]) / lo) * rr];
    for (let k = 0; k <= 8; k++) {
      const u = k / 8;
      const w0 = (1 - u) * (1 - u);
      const w1 = 2 * u * (1 - u);
      const w2 = u * u;
      pts.push([w0 * p0[0] + w1 * b[0] + w2 * p2[0], w0 * p0[1] + w1 * b[1] + w2 * p2[1]]);
    }
  }
  pts.push(raw[raw.length - 1]);
  return finish(pts);
}
/** 三次贝塞尔（倒车入位、倒出来） */
function bezier(p0: V2, c1: V2, c2: V2, p3: V2, n = 20): Path {
  const pts: V2[] = [];
  for (let k = 0; k <= n; k++) {
    const u = k / n;
    const a = (1 - u) ** 3;
    const b = 3 * u * (1 - u) ** 2;
    const c = 3 * u * u * (1 - u);
    const d = u ** 3;
    pts.push([a * p0[0] + b * c1[0] + c * c2[0] + d * p3[0], a * p0[1] + b * c1[1] + c * c2[1] + d * p3[1]]);
  }
  return finish(pts);
}
function finish(raw: V2[]): Path {
  const pts: V2[] = [];
  for (const p of raw) {
    const q = pts[pts.length - 1];
    if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.02) pts.push(p);
  }
  const cum = [0];
  for (let i = 1; i < pts.length; i++)
    cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, cum, len: cum[cum.length - 1] };
}
function pathAt(p: Path, s: number): V2 {
  s = clamp(s, 0, p.len);
  let i = 1;
  while (i < p.cum.length - 1 && p.cum[i] < s) i++;
  const s0 = p.cum[i - 1];
  const k = (s - s0) / Math.max(1e-6, p.cum[i] - s0);
  return [lerp(p.pts[i - 1][0], p.pts[i][0], k), lerp(p.pts[i - 1][1], p.pts[i][1], k)];
}

// ── 车位 ─────────────────────────────────────────
interface Stall {
  id: string;
  row: number;
  i: number;
  /** 车位中心 */
  c: V2;
  /** 通道那边：−1 = 通道在北（−z），+1 = 通道在南 */
  aisleSide: -1 | 1;
  aisleZ: number;
  car: Car | null;
  /** 有车正在往这开 / 从这开走（别的车别选它） */
  reserved: boolean;
}
/** 通道两条车道离中线多远（会车的横向间距 2.2 > 探测宽度 2.05） */
const LANE = 1.1;
/** 进出口的两条车道：西边往南开、东边往北开（靠右行） */
const ENTRY_W = ENTRY.x0 + 1.5;
const ENTRY_E = ENTRY.x1 - 1.6;
/** 车道：西行（进来）在北、东行（出去）在南 */
const DRIVE_WB = -2.0;
const DRIVE_EB = 2.0;
/** 落客区里掉头（落客点 → 西头绕一个小圈 → 东行车道）：代客开走落客的车、取车的会员开走都走这条 */
const UTURN: V2[] = [
  [64.6, -1.5],
  [63.4, 0.4],
  [65.2, DRIVE_EB],
];

// ── 车 ─────────────────────────────────────────
interface Car {
  obj: THREE.Object3D;
  kind: 'car' | 'suv';
  x: number;
  z: number;
  /** rotY（0 = 车头朝北） */
  rot: number;
  v: number;
  /** +1 前进、−1 倒车 */
  dir: 1 | -1;
  halfLen: number;
  /** 在动（引擎开着）：停着的车不亮刹车灯、别人不把它当"开着的车"躲 */
  live: boolean;
  /** 倒车入位 / 倒出来：不躲两边停着的车 */
  ignoreParked: boolean;
  /** 被挡住多久了（防死锁：两辆车互相挡 4 秒以上就无视别的开着的车 2 秒） */
  blockedFor: number;
  /** 现在挡着我的车 */
  blocker: Car | null;
  /** 连续被挡了几秒（不管被谁） */
  stuckFor: number;
  ghost: number;
  brake: boolean;
  /** 刹车灯一闪（找车位） */
  tap: number;
  stall: Stall | null;
  /** 钥匙在岗亭板上的号（−1 = 不在板上） */
  keySlot: number;
  /** 停进车位的时刻（取车 / 开走挑停得最久的） */
  parkedAt: number;
}

// ── 人 ─────────────────────────────────────────
interface Person {
  obj: THREE.Object3D;
  x: number;
  z: number;
  yaw: number;
  ph: number;
  r: number;
  /** 在车里（不显示、不挡路） */
  inCar: boolean;
  /** 现在摆的"静止"姿势（idle 由 rig 自己呼吸） */
  posed: string;
  say: string;
  sayT: number;
  /** 会员：走到哪了（统计用） */
  role: 'member' | 'valet' | 'doorman';
}

export interface ParkAlert {
  p: THREE.Vector3;
  text: string;
}

/** 总监的玩法接口要用到的东西（play.ts 读） */
export interface ParkPlayHooks {
  /** 落客点有没有会员拿着钥匙等人接（给总监接） */
  keysWaiting(): { x: number; z: number } | null;
  /** 总监接钥匙（会员把钥匙给总监、先进门；车留在落客点等代客） */
  takeKeys(): boolean;
  /** 总监手里有没有钥匙 */
  directorHasKeys(): boolean;
  /** 总监把钥匙挂到岗亭（返回是否挂上） */
  hangKeys(): boolean;
  /** 岗亭窗口前（总监挂钥匙站的地方） */
  boothWindow(): V2;
  /** 球包车 */
  trolley: THREE.Object3D | null;
  trolleyBags(): number;
  /** 总监推着车（life 每帧把车摆到总监身前）；放下时在大门口就送进去 */
  setTrolleyCarried(on: boolean): void;
  trolleyCarried(): boolean;
  /** 推车放下的地方离大门口多近算"送进去" */
  atGate(x: number, z: number): boolean;
  /** 送进去（setBags(0)） */
  deliverBags(): number;
  /** 代客台前有没有等取车、代客还没去管的会员（总监可以去岗亭摘他的钥匙） */
  pickupWaiting(): { x: number; z: number } | null;
  /** 总监在岗亭摘下等取车的会员的钥匙 */
  takePickupKeys(): boolean;
  /** 总监手里有没有取车的钥匙 */
  directorHasPickupKeys(): boolean;
  /** 总监把钥匙递给会员：会员自己去停车场开车走（代客省一趟） */
  givePickupKeys(): boolean;
  /** 总监把摘下的钥匙挂回去（不递了） */
  returnPickupKeys(): void;
  /** 等取车的会员（递钥匙时总监走到他跟前） */
  pickupMember(): THREE.Object3D | null;
}

export interface ParkLife {
  update(dt: number): void;
  alerts(): ParkAlert[];
  /** 挡路的圆：车（每辆三个）、人、推车（给总监的碰撞用） */
  obstacles(): { x: number; z: number; r: number }[];
  stats(): { wait: number; queue: number; bags: number; valet: string; served: number; cars: number };
  hooks: ParkPlayHooks;
  /** 截图诊断 */
  debug(): unknown;
}

export interface ParkLifeOpts {
  ctx: AssetCtx;
  scene: THREE.Object3D;
  make(asset: string, variant: number): THREE.Object3D;
  groundAt(x: number, z: number): number;
  /** main 已经建好的物件（岗亭、代客台、球包车、总监） */
  find(id: string): THREE.Object3D | undefined;
  /** 停着的车：SLOTS 里 park-* 的那些（车款、位置、朝向、车漆） */
  parked: { id: string; asset: string; x: number; z: number; rotY: number; variant: number }[];
  play: boolean;
  /** 玩法模式下的总监（每帧读位置：车要让他、推车跟着他） */
  director(): THREE.Object3D | null;
  /** 人说话（玩法模式：play.say 画气泡）；不给 = 只记在 alerts() 里 */
  onSay?(obj: THREE.Object3D, text: string, sec: number): void;
}

export function createParkLife(o: ParkLifeOpts): ParkLife {
  const { ctx, scene } = o;
  const rnd = ctx.rng('park:life');
  let now = 0;

  // ── 物件 ──
  const booth = o.find('valet-booth');
  const podium = o.find('valet-podium');
  const trolley = o.find('bag-trolley') ?? null;
  const keysApi = booth?.userData.keys as
    | {
        count: number;
        take(i: number): boolean;
        hang(i: number): void;
        set(n: number): void;
        free(): number;
        any(): number;
        has(i: number): boolean;
      }
    | undefined;
  const w2 = (obj: THREE.Object3D | undefined, local: THREE.Vector3 | undefined, fb: V2): V2 => {
    if (!obj || !local) return fb;
    obj.updateMatrixWorld(true);
    const p = obj.localToWorld(local.clone());
    return [p.x, p.z];
  };
  const BOOTH_WIN = w2(booth, booth?.userData.anchors?.window, [63.0, -6.8]);
  const POD_STAND = w2(podium, podium?.userData.anchors?.stand, [SPOTS.podium[0], SPOTS.podium[1] - 0.8]);
  /** 取车的会员在代客台前（南边）等 */
  const POD_FRONT: V2 = [SPOTS.podium[0] + 0.3, SPOTS.podium[1] + 1.3];
  const TROLLEY_HOME: V2 = trolley ? [trolley.position.x, trolley.position.z] : [61.5, -5.0];
  const trolleyHandle = (trolley?.userData.anchors?.handle as THREE.Vector3 | undefined)?.z ?? -1.1;
  let bags = 1;
  trolley?.userData.setBags?.(bags);

  // ── 车池 ──
  const cars: Car[] = [];
  const pool: Car[] = [];
  const HALF = { car: 2.17, suv: 2.42 };
  const newCar = (kind: 'car' | 'suv', paint: number): Car => {
    let c = pool.find((p) => p.kind === kind);
    if (c) pool.splice(pool.indexOf(c), 1);
    else {
      const obj = o.make(kind, paint);
      scene.add(obj);
      c = {
        obj,
        kind,
        x: 0,
        z: 0,
        rot: 0,
        v: 0,
        dir: 1,
        halfLen: HALF[kind],
        live: false,
        ignoreParked: false,
        blockedFor: 0,
        blocker: null,
        stuckFor: 0,
        ghost: 0,
        brake: false,
        tap: 0,
        stall: null,
        keySlot: -1,
        parkedAt: -1e9,
      };
    }
    c.obj.userData.setPaint?.(paint);
    c.obj.userData.setDoor?.(false, 'both', true);
    c.obj.visible = true;
    Object.assign(c, {
      v: 0,
      dir: 1,
      live: false,
      ignoreParked: false,
      blockedFor: 0,
      blocker: null,
      stuckFor: 0,
      ghost: 0,
      stall: null,
    });
    c.keySlot = -1;
    setBrake(c, false);
    cars.push(c);
    return c;
  };
  const dropCar = (c: Car) => {
    c.obj.visible = false;
    c.obj.userData.setSpeed?.(0);
    cars.splice(cars.indexOf(c), 1);
    pool.push(c);
  };
  const setBrake = (c: Car, on: boolean) => {
    if (c.brake === on) return;
    c.brake = on;
    c.obj.userData.setBrake?.(on);
  };
  const placeCar = (c: Car) => {
    c.obj.position.set(c.x, 0, c.z);
    c.obj.rotation.y = c.rot;
  };
  /** 车本地 (lx, lz) → 世界（车头 = 本地 −z，司机侧 = 本地 −x） */
  const carLocal = (c: Car, lx: number, lz: number): V2 => {
    const cs = Math.cos(c.rot);
    const sn = Math.sin(c.rot);
    return [c.x + lx * cs + lz * sn, c.z - lx * sn + lz * cs];
  };
  /** 车头朝向（单位向量） */
  const noseOf = (rot: number): V2 => [-Math.sin(rot), -Math.cos(rot)];
  const rotOfNose = (nx: number, nz: number) => Math.atan2(-nx, -nz);
  /** 司机门外站人的点（车门开着的时候人站在门后） */
  const doorPt = (c: Car, side: -1 | 1 = -1): V2 => carLocal(c, side * 1.45, -0.15);

  // ── 车位 ──
  const stalls: Stall[] = [];
  const mkStall = (row: number, i: number): Stall => {
    const r = ROWS[row];
    const c = stallCenter(r, i);
    const aisleZ = row < 2 ? AISLE_Z.n : AISLE_Z.s;
    const s: Stall = {
      id: `${r.id}-${i}`,
      row,
      i,
      c,
      aisleSide: aisleZ < c[1] ? -1 : 1,
      aisleZ,
      car: null,
      reserved: false,
    };
    stalls.push(s);
    return s;
  };
  /** 南停车场：代客停的（只用进出口西边的 1、2 号：倒车要先开过车位 3.6 米） */
  const SOUTH = [mkStall(2, 1), mkStall(2, 2), mkStall(3, 1), mkStall(3, 2)];
  /** 北停车场：自己停车的 */
  const NORTH = [mkStall(1, 1), mkStall(1, 2), mkStall(0, 1), mkStall(0, 2)];
  const stallById = new Map(stalls.map((s) => [s.id, s]));

  // 停着的车（main 的 SLOTS park-*）：池子里的车位交给池子，其余的就停着
  const parkedStatic: Car[] = [];
  for (const p of o.parked) {
    const kind = p.asset === 'suv' ? 'suv' : 'car';
    const c = newCar(kind, p.variant);
    c.x = p.x;
    c.z = p.z;
    c.rot = p.rotY;
    placeCar(c);
    const sid = p.id.replace('park-', '');
    const st = stallById.get(sid);
    if (st) {
      st.car = c;
      c.stall = st;
    } else parkedStatic.push(c);
  }
  // 南停车场的车钥匙都挂在岗亭的钥匙板上：池子里的两辆占 0、1 号，其余几把是别的车（不动）
  if (keysApi) {
    const southCars = cars.filter((c) => c.z > 0).length;
    keysApi.set(Math.min(keysApi.count, southCars));
    let k = 0;
    for (const s of SOUTH) if (s.car) s.car.keySlot = k++;
  }

  // ── 人 ──
  const people: Person[] = [];
  const mkPerson = (obj: THREE.Object3D, role: Person['role'], x: number, z: number, yaw = 0): Person => {
    scene.add(obj);
    const p: Person = { obj, x, z, yaw, ph: 0, r: 0.32, inCar: false, posed: '', say: '', sayT: 0, role };
    people.push(p);
    placeP(p);
    return p;
  };
  const placeP = (p: Person) => {
    p.obj.position.set(p.x, o.groundAt(p.x, p.z), p.z);
    p.obj.rotation.y = p.yaw;
    p.obj.visible = !p.inCar;
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
  const say = (p: Person, text: string, s = 2.2) => {
    p.say = text;
    p.sayT = s;
    o.onSay?.(p.obj, text, s);
  };

  const valet = mkPerson(o.make('valet', 0), 'valet', POD_STAND[0], POD_STAND[1], 0);
  valet.obj.userData.setProp?.(null);
  const doorman = mkPerson(o.make('valet', 1), 'doorman', SPOTS.doorman[0], SPOTS.doorman[1], 0.6);
  pose(doorman, 'idle');
  pose(valet, 'idle');
  const DOOR_HOME: V2 = [SPOTS.doorman[0], SPOTS.doorman[1]];

  // 门童手里的球包（本地小道具：一个胖胶囊，珊瑚红 + 奶油端带；挂在右手上）
  const bagMesh = (() => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.13, 0.5, 3, 8).rotateZ(P / 2),
      ctx.mat('clothRed', { lightUp: 0.3 }),
    );
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(0.135, 0.135, 0.09, 8).rotateZ(P / 2),
      ctx.mat('clothWhite'),
    );
    band.position.x = 0.2;
    g.add(body, band);
    ctx.mats.prepare(g);
    g.traverse((m) => {
      m.castShadow = false;
    });
    g.visible = false;
    try {
      const b = findBones(doorman.obj as THREE.Group);
      g.position.set(0, -0.12, 0.05);
      b.armR.hand.add(g);
    } catch {
      doorman.obj.add(g);
      g.position.set(-0.35, 0.5, 0.1);
    }
    return g;
  })();

  // 会员（player v0..3）：用完回池子
  const memberPool: Person[] = [];
  const newMember = (x: number, z: number, yaw = 0): Person => {
    const v = Math.floor(rnd() * 4);
    let p = memberPool.find((m) => m.obj.userData.variant === v) ?? memberPool[0];
    if (p) {
      memberPool.splice(memberPool.indexOf(p), 1);
      people.push(p);
      Object.assign(p, { x, z, yaw, inCar: false, say: '', sayT: 0, posed: '' });
    } else {
      const obj = o.make('player', v);
      obj.userData.variant = v;
      p = mkPerson(obj, 'member', x, z, yaw);
    }
    p.obj.userData.setProp?.(rnd() < 0.5 ? 'racket' : null);
    pose(p, 'idle');
    placeP(p);
    return p;
  };
  const dropMember = (p: Person) => {
    p.obj.visible = false;
    people.splice(people.indexOf(p), 1);
    memberPool.push(p);
  };

  // ── 总监（玩法模式下玩家开；只读位置） ──
  const dirPos = (): V2 | null => {
    const d = o.director();
    return d ? [d.position.x, d.position.z] : null;
  };

  // ── 挡路 ──
  interface Circ {
    x: number;
    z: number;
    r: number;
    car?: Car;
    moving?: boolean;
  }
  const carCircles = (c: Car, out: Circ[]) => {
    const [nx, nz] = noseOf(c.rot);
    const k = c.halfLen - 0.95;
    for (const s of [-k, 0, k]) out.push({ x: c.x + nx * s, z: c.z + nz * s, r: 0.95, car: c, moving: c.live });
  };
  const circles: Circ[] = [];
  const gatherCircles = () => {
    circles.length = 0;
    for (const c of cars) if (c.obj.visible) carCircles(c, circles);
    for (const p of people) if (!p.inCar && p.obj.visible) circles.push({ x: p.x, z: p.z, r: p.r });
    const d = dirPos();
    if (d) circles.push({ x: d[0], z: d[1], r: 0.35 });
    if (trolley) circles.push({ x: trolley.position.x, z: trolley.position.z, r: 0.75 });
  };

  /** 车往前（travel 方向）能开多快：前面有东西就按距离限速 */
  const clearance = (c: Car, tx: number, tz: number): number => {
    let vmax = 99;
    c.blocker = null;
    for (const q of circles) {
      if (q.car === c) continue;
      if (q.car && q.moving && c.ghost > 0) continue;
      if (q.car && !q.moving && c.ignoreParked) continue;
      const rx = q.x - c.x;
      const rz = q.z - c.z;
      const along = rx * tx + rz * tz;
      if (along <= 0) continue;
      const lat = Math.abs(rx * tz - rz * tx);
      if (lat > 0.95 + q.r + 0.12) continue;
      const gap = along - c.halfLen - q.r;
      if (gap > 6) continue;
      const lim = Math.max(0, gap - 0.7) * 1.3;
      if (lim < vmax) {
        vmax = lim;
        c.blocker = q.car ?? null;
      }
    }
    return vmax;
  };

  // ── 协程 ──
  let live: Co[] = [];
  /** 新协程先跑到第一个 yield，下一帧起和别的一起推 */
  const spawn = (c: Co) => {
    if (!c.next(0).done) live.push(c);
  };
  function* wait(s: number): Co {
    let t = 0;
    while (t < s) t += yield;
  }
  function* until(cond: () => boolean, max = 1e9): Co {
    let t = 0;
    while (!cond() && t < max) t += yield;
  }

  /** 开车：沿 path 按弧长走；rev = 倒车（车头 = 反切线）；vEnd = 段末速度（接下一段不停） */
  function* drive(
    c: Car,
    path: Path,
    vmax: number,
    opt: { rev?: boolean; vEnd?: number; search?: boolean; giveUp?: () => boolean } = {},
  ): Co {
    const rev = !!opt.rev;
    const vEnd = opt.vEnd ?? 0;
    c.dir = rev ? -1 : 1;
    c.live = true;
    let s = 0;
    const ACC = rev ? 2.2 : 2.6;
    const DEC = rev ? 2.2 : 2.3;
    while (true) {
      const dt = yield;
      const rem = path.len - s;
      if (rem <= 0.005) break;
      // 前进方向（切线，倒车时也是走的方向）
      const a = pathAt(path, s);
      const b = pathAt(path, Math.min(path.len, s + 0.25));
      let tx = b[0] - a[0];
      let tz = b[1] - a[1];
      const tl = Math.hypot(tx, tz) || 1;
      tx /= tl;
      tz /= tl;
      let vt = Math.min(vmax, Math.sqrt(vEnd * vEnd + 2 * DEC * rem));
      const cl = clearance(c, tx, tz);
      const blocked = cl < Math.max(0.05, vt * 0.5);
      if (cl < vt) vt = cl;
      // 最后一点点慢慢挪到位（没被挡的时候）
      if (vt < 0.3 && cl > 0.5 && rem > 0.01) vt = Math.min(0.3, vmax);
      // 两辆车互相挡着太久：无视别的开着的车 2 秒（防死锁）
      c.blockedFor = blocked && c.blocker?.blocker === c ? c.blockedFor + dt : 0;
      c.stuckFor = blocked && c.v < 0.05 ? c.stuckFor + dt : 0;
      if (opt.giveUp?.()) break;
      if (c.blockedFor > 1.5) {
        c.ghost = 2;
        c.blockedFor = 0;
      }
      if (c.ghost > 0) c.ghost -= dt;
      const prev = c.v;
      if (c.v < vt) c.v = Math.min(vt, c.v + ACC * dt);
      else c.v = Math.max(vt, c.v - DEC * 2 * dt);
      s = Math.min(path.len, s + c.v * dt);
      const p = pathAt(path, s);
      // 车头方向：前后各取一点（转弯平顺）
      const q0 = pathAt(path, s - 0.35);
      const q1 = pathAt(path, s + 0.35);
      let hx = q1[0] - q0[0];
      let hz = q1[1] - q0[1];
      if (rev) {
        hx = -hx;
        hz = -hz;
      }
      if (Math.hypot(hx, hz) > 1e-4) c.rot = turnTo(c.rot, rotOfNose(hx, hz), Math.min(1, dt * 14));
      c.x = p[0];
      c.z = p[1];
      placeCar(c);
      let br = c.v < prev - 0.4 * dt || c.v < 0.05;
      if (opt.search) {
        // 找车位：时不时点一下刹车
        c.tap -= dt;
        if (c.tap < -1.2 - rnd() * 1.6) c.tap = 0.35;
        if (c.tap > 0) br = true;
      }
      setBrake(c, br);
    }
    if (vEnd === 0) c.v = 0;
    setBrake(c, c.v < 0.05);
  }
  /** 停车熄火 */
  const park = (c: Car) => {
    c.v = 0;
    c.live = false;
    setBrake(c, false);
  };

  /** 人沿折线走（米/秒）；前面有开着的车就停下等 */
  function* walk(p: Person, pts: V2[], speed = 1.35, poseName = 'walk', stride = 1.25): Co {
    /** 被总监挡住了多久（挡 1.2 秒以后侧身挤过去） */
    let held = 0;
    for (const t of pts) {
      while (true) {
        const dt = yield;
        const dx = t[0] - p.x;
        const dz = t[1] - p.z;
        const L = Math.hypot(dx, dz);
        if (L < 0.02) break;
        // 让车：前方 1 米里有开着的车
        let stop = false;
        for (const q of circles) {
          if (!q.car || !q.moving || Math.abs(q.car.v) < 0.1) continue;
          const rx = q.x - p.x;
          const rz = q.z - p.z;
          const al = (rx * dx + rz * dz) / L;
          if (al > 0 && al < 1.2 + q.r && Math.abs(rx * dz - rz * dx) / L < q.r + 0.4) stop = true;
        }
        const d = dirPos();
        let ahead = false;
        if (d) {
          const rx = d[0] - p.x;
          const rz = d[1] - p.z;
          const al = (rx * dx + rz * dz) / L;
          ahead = al > 0 && al < 0.9 && Math.abs(rx * dz - rz * dx) / L < 0.6;
        }
        if (!ahead) held = 0;
        else if (held < 1.2) {
          stop = true;
          held += dt;
          if (held > 0.5 && held - dt <= 0.5 && p.role === 'member') say(p, '借过', 1.2);
        }
        if (stop) {
          pose(p, 'idle');
          continue;
        }
        const step = Math.min(L, speed * dt);
        p.x += (dx / L) * step;
        p.z += (dz / L) * step;
        p.yaw = turnTo(p.yaw, yawOf(dx, dz), dt * 10);
        p.ph = (p.ph + step / stride) % 1;
        pose(p, poseName, p.ph);
        placeP(p);
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
      placeP(p);
    }
  }
  function* faceTo(p: Person, x: number, z: number, s = 0.35): Co {
    yield* face(p, yawOf(x - p.x, z - p.z), s);
  }
  /** 播一遍姿势（phase 0 → 1，dur 秒）；at 时刻回调一次 */
  function* act(p: Person, name: string, dur: number, at?: number, cb?: () => void): Co {
    let t = 0;
    let fired = false;
    while (t < dur) {
      const dt = yield;
      t += dt;
      const ph = Math.min(1, t / dur);
      if (cb && !fired && ph >= (at ?? 1)) {
        fired = true;
        cb();
      }
      pose(p, name, ph);
    }
    if (cb && !fired) cb();
    pose(p, 'idle');
  }
  /** 上车：开门 → 人往车里挪一点、消失 → 关门 */
  function* enter(p: Person, c: Car, side: -1 | 1 = -1): Co {
    c.obj.userData.setDoor?.(true, side < 0 ? 'left' : 'right');
    yield* wait(0.45);
    const [cx, cz] = carLocal(c, side * 0.7, -0.15);
    yield* walk(p, [[cx, cz]], 1.0);
    p.inCar = true;
    placeP(p);
    yield* wait(0.15);
    c.obj.userData.setDoor?.(false, side < 0 ? 'left' : 'right');
    yield* wait(0.4);
  }
  /** 下车：开门 → 人出现在门边 → 往外走一步 → 关门 */
  function* exit(p: Person, c: Car, side: -1 | 1 = -1): Co {
    c.obj.userData.setDoor?.(true, side < 0 ? 'left' : 'right');
    yield* wait(0.4);
    const [ix, iz] = carLocal(c, side * 0.8, -0.15);
    p.x = ix;
    p.z = iz;
    const [ox, oz] = doorPt(c, side);
    p.yaw = yawOf(ox - ix, oz - iz);
    p.inCar = false;
    placeP(p);
    yield* walk(p, [[ox, oz]], 1.0);
  }
  function* closeDoor(c: Car, side: -1 | 1 = -1): Co {
    c.obj.userData.setDoor?.(false, side < 0 ? 'left' : 'right');
    yield* wait(0.4);
  }

  // ── 路线 ──
  /** 进出口：从车道到某个通道（南 / 北），靠右的那条车道 */
  const toAisle = (north: boolean, fromDrive: 'wb' | 'eb'): V2[] => {
    const aisle = north ? AISLE_Z.n : AISLE_Z.s;
    // 往北开（进北停车场）走东车道；往南开（进南停车场）走西车道
    const ex = north ? ENTRY_E : ENTRY_W;
    const laneZ = aisle - LANE; // 到了通道往西开：西行车道在通道北半（靠右）
    const dz = fromDrive === 'wb' ? DRIVE_WB : DRIVE_EB;
    return [
      [ex + (fromDrive === 'wb' ? 3 : -3), dz],
      [ex, dz + (north ? -2.4 : 2.4)],
      [ex, laneZ + (north ? 2.2 : -2.2)],
      [ex - 2.5, laneZ],
    ];
  };
  /** 从通道（东行车道）出到车道：toWest = 去落客点（西行车道），否则往东出画 */
  const fromAisle = (north: boolean, toWest: boolean, cx: number): V2[] => {
    const aisle = north ? AISLE_Z.n : AISLE_Z.s;
    const laneZ = aisle + LANE;
    // 北停车场出来往南开（西车道），南停车场出来往北开（东车道）；车已经贴着那条车道了就换另一条（转弯半径不够）
    let ex = north ? ENTRY_W : ENTRY_E;
    if (cx > ex - 1.2) ex = north ? ENTRY_E : ENTRY_W;
    const dz = toWest ? DRIVE_WB : DRIVE_EB;
    return [
      [ex, laneZ],
      [ex, dz + (north ? -2.6 : 2.6)],
      [ex + (toWest ? -3 : 3), dz],
    ];
  };

  /** 倒车入位：车在通道西行车道上开过车位 3.6 米停下，倒车画弧进位；结束时车头朝通道反方向 */
  function* reverseIn(c: Car, st: Stall): Co {
    const laneZ = st.aisleZ - LANE;
    const [sx, sz] = st.c;
    const stopX = sx - 3.6;
    // 先在车道上开到停车点
    yield* drive(
      c,
      mkPath([
        [c.x, c.z],
        [stopX, laneZ],
      ]),
      1.4,
    );
    yield* wait(0.5 + rnd() * 0.4);
    // 倒车：起点切线朝东（车头朝西），终点进车位（车头朝通道的反方向 = 离开车位时开出去）
    // 车位中心往里 0.1 米；第二个控制点在车位口外 3.2 米（从通道那边进来）
    const inZ = sz - st.aisleSide * 0.1;
    const path = bezier([stopX, laneZ], [stopX + 2.6, laneZ], [sx, sz + st.aisleSide * 3.2], [sx, inZ]);
    c.ignoreParked = true;
    yield* drive(c, path, 2.0, { rev: true });
    c.ignoreParked = false;
    park(c);
    st.car = c;
    c.stall = st;
    c.parkedAt = now;
    st.reserved = false;
  }
  /** 从车位出来到通道的东行车道（车头朝通道 = 开出来；背对通道 = 倒出来） */
  function* leaveStall(c: Car, st: Stall): Co {
    const laneZ = st.aisleZ + LANE;
    const [sx, sz] = st.c;
    const [nx, nz] = noseOf(c.rot);
    const noseToAisle = nz * (st.aisleZ - sz) > 0;
    c.ignoreParked = true;
    st.car = null;
    c.stall = null;
    if (noseToAisle) {
      const path = bezier([sx, sz], [sx + nx * 2.6, sz + nz * 2.6], [sx - 0.4, laneZ], [sx + 1.2, laneZ]);
      yield* drive(c, path, 1.6, { vEnd: 1.2 });
    } else {
      // 倒出来：屁股朝通道，倒到西边，车头朝东
      const back: V2 = [sx - nx * 3.2, sz - nz * 3.2];
      const path = bezier([sx, sz], back, [sx - 0.6, laneZ], [sx - 3.4, laneZ]);
      setBrake(c, true);
      yield* wait(0.6);
      yield* drive(c, path, 1.8, { rev: true });
      yield* wait(0.4);
    }
    c.ignoreParked = false;
    st.reserved = false;
  }

  // ── 状态（统计、玩法） ──
  interface Arrival {
    car: Car;
    driver: Person | null;
    /** 会员拿着钥匙在车边等人接 */
    waiting: boolean;
    waitT: number;
    /** 钥匙在谁手里：member / valet / director / booth */
    keys: 'member' | 'valet' | 'director' | 'booth';
    /** 车已经开走（代客接手） */
    handled: boolean;
  }
  let arrival: Arrival | null = null;
  /** 总监挂到岗亭上的、还没开走的落客车 */
  const pendingBooth: Arrival[] = [];
  let directorKeys: Arrival | null = null;
  let valetBusy = '';
  let served = 0;
  let trolleyCarried = false;
  /** 取车的会员（等代客） */
  const pickups: { m: Person; car: Car; st: Stall; ready: boolean; waitT: number; keySlot: number }[] = [];
  /** 总监从岗亭摘下的取车钥匙（递给会员之前） */
  let directorPickup: (typeof pickups)[number] | null = null;

  // ── 门童：迎车挥手、去后备箱拿包、放到球包车 ──
  let doormanTask: 'home' | 'bag' | 'push' = 'home';
  function* doormanBag(c: Car): Co {
    doormanTask = 'bag';
    // 车尾（车朝西停着：本地 +z = 东）后面一点
    const [bx, bz] = carLocal(c, 0, c.halfLen + 0.6);
    // 从南边绕到车尾（别从刚下车的会员身上穿过去）
    yield* walk(
      doorman,
      [
        [62.5, 2.4],
        [69.8, 0.9],
        [bx, bz],
      ],
      1.5,
    );
    yield* faceTo(doorman, c.x, c.z);
    yield* act(doorman, 'pickup', 0.9, 0.55, () => {
      bagMesh.visible = true;
    });
    // 去球包车（推车在哪就去哪）：先从车头北边绕出来
    yield* walk(
      doorman,
      [
        [bx - 0.2, bz - 1.7],
        [65.3, -3.4],
        [63.4, -3.2],
      ],
      1.4,
    );
    while (true) {
      const tx = trolley ? trolley.position.x : TROLLEY_HOME[0];
      const tz = trolley ? trolley.position.z : TROLLEY_HOME[1];
      yield* walk(doorman, [[tx + 1.0, tz + 0.6]], 1.4);
      yield* faceTo(doorman, tx, tz);
      if (trolleyCarried) {
        say(doorman, '推车呢？', 1.5);
        yield* wait(1.0);
        continue;
      }
      if (bags < 4) {
        yield* act(doorman, 'pickup', 0.8, 0.5, () => {
          bagMesh.visible = false;
          bags++;
          trolley?.userData.setBags?.(bags);
        });
        break;
      }
      // 满了
      say(doorman, '推车满了！', 2.5);
      if (!o.play) {
        bagMesh.visible = false;
        yield* doormanPush();
        bags = 1;
        trolley?.userData.setBags?.(bags);
        break;
      }
      yield* wait(2.5);
      if (trolleyCarried || bags < 4) continue;
      // 等太久：自己把包拎进门
      yield* wait(4);
      if (bags >= 4 && !trolleyCarried) {
        yield* walk(doorman, [[61.4, 0.4], SPOTS.gateIn], 1.5);
        doorman.obj.visible = false;
        bagMesh.visible = false;
        yield* wait(1.2);
        doorman.obj.visible = true;
        break;
      }
    }
    yield* walk(doorman, [DOOR_HOME], 1.4);
    yield* face(doorman, 0.6);
    doormanTask = 'home';
  }
  /** 门童把球包车推到大门口、送进去、推回来（不在玩法模式时） */
  function* doormanPush(): Co {
    if (!trolley) return;
    doormanTask = 'push';
    const hx = trolley.position.x;
    const hz = trolley.position.z;
    const handle = carriedOffset();
    // 站到把手后面
    const [fx, fz] = [hx - Math.sin(trolley.rotation.y) * handle, hz - Math.cos(trolley.rotation.y) * handle];
    yield* walk(doorman, [[fx, fz]], 1.4);
    yield* faceTo(doorman, hx, hz);
    pushing = doorman;
    yield* walk(
      doorman,
      [
        [61.6, -3.2],
        [61.2, -0.4],
      ],
      0.9,
      'push',
      1.1,
    );
    yield* faceTo(doorman, SPOTS.gateIn[0], SPOTS.gateIn[1]);
    yield* wait(0.8);
    bags = 0;
    trolley.userData.setBags?.(0);
    say(doorman, '送进去了', 1.5);
    yield* wait(0.6);
    yield* walk(
      doorman,
      [
        [61.4, -3.0],
        [TROLLEY_HOME[0] + 0.1, TROLLEY_HOME[1] + 1.4],
      ],
      0.9,
      'push',
      1.1,
    );
    pushing = null;
  }
  /** 推车：车在推的人身前（把手离车心 −handle.z） */
  const carriedOffset = () => -trolleyHandle;
  let pushing: Person | null = null;
  /** 推车摆到推的人身前；ease < 1 = 往那儿靠（刚抓住把手时不瞬移） */
  const placeTrolleyBy = (x: number, z: number, yaw: number, ease = 1) => {
    if (!trolley) return;
    const k = carriedOffset();
    const tx = x + Math.sin(yaw) * k;
    const tz = z + Math.cos(yaw) * k;
    trolley.position.set(lerp(trolley.position.x, tx, ease), o.groundAt(tx, tz), lerp(trolley.position.z, tz, ease));
    trolley.rotation.y = turnTo(trolley.rotation.y, yaw, ease);
  };

  // ── 代客：一个循环，按优先级接活 ──
  function* valetLoop(): Co {
    while (true) {
      // 1. 落客：车停在落客点、会员拿着钥匙等
      if (arrival && !arrival.handled && arrival.keys === 'member') {
        yield* valetDropoff(arrival);
        continue;
      }
      // 2. 总监挂到岗亭的钥匙：摘下来，去落客点把车开走
      if (pendingBooth.length) {
        yield* valetFromBooth(pendingBooth[0]);
        continue;
      }
      // 3. 取车
      const pk = pickups.find((q) => q.ready);
      if (pk) {
        yield* valetFetch(pk);
        continue;
      }
      // 闲着：回代客台站着
      if (Math.hypot(valet.x - POD_STAND[0], valet.z - POD_STAND[1]) > 0.1) {
        valetBusy = '回代客台';
        yield* walk(valet, [POD_STAND], 1.5);
        yield* face(valet, 0);
      }
      valetBusy = '';
      pose(valet, 'idle');
      yield;
    }
  }
  /** 代客到落客点：开门（usher）、接钥匙（handoff）、上车、开去停 */
  function* valetDropoff(a: Arrival): Co {
    valetBusy = '接车';
    const c = a.car;
    const [dx, dz] = doorPt(c, -1);
    // 绕到车门外：从代客台下来走到司机侧
    // 代客台在身前（南）：从东边绕过去
    yield* walk(
      valet,
      [
        [valet.x + 0.85, valet.z],
        [valet.x + 0.85, valet.z + 1.7],
        [dx - 0.9, dz + 0.5],
        [dx - 0.3, dz + 0.35],
      ],
      2.2,
      'walk',
      1.6,
    );
    // 等会员下车站好
    yield* until(() => a.waiting || a.keys !== 'member', 8);
    if (a.keys !== 'member' || a.handled) return; // 总监先接了
    const m = a.driver;
    if (m) yield* faceTo(valet, m.x, m.z);
    yield* act(valet, 'handoff', 1.4, HANDOFF_AT, () => {
      if (a.keys !== 'member') return;
      a.keys = 'valet';
      a.waiting = false;
      valet.obj.userData.setProp?.('keys');
    });
    // 回调里改了 a.keys（TS 的收窄看不见）：总监可能在代客伸手的时候抢先接了
    if ((a.keys as Arrival['keys']) !== 'valet') return;
    a.handled = true;
    if (m) spawn(memberToGate(m, c, -1, true));
    yield* wait(0.5);
    yield* valetPark(a);
  }
  /** 代客从岗亭摘总监挂的钥匙，去落客点开车 */
  function* valetFromBooth(a: Arrival): Co {
    valetBusy = '摘钥匙';
    yield* walk(valet, [BOOTH_WIN], 1.6);
    yield* face(valet, P);
    yield* act(valet, 'handoff', 1.2, HANDOFF_AT, () => {
      if (a.car.keySlot >= 0) keysApi?.take(a.car.keySlot);
      a.car.keySlot = -1;
      valet.obj.userData.setProp?.('keys');
    });
    pendingBooth.splice(pendingBooth.indexOf(a), 1);
    a.keys = 'valet';
    a.handled = true;
    const [dx, dz] = doorPt(a.car, -1);
    valetBusy = '去开车';
    yield* walk(
      valet,
      [
        [valet.x + 0.4, valet.z + 2.4],
        [dx - 0.6, dz + 0.4],
        [dx, dz],
      ],
      1.7,
    );
    yield* valetPark(a);
  }
  /** 代客上车、开去南停车场倒进车位、走回岗亭挂钥匙 */
  function* valetPark(a: Arrival): Co {
    valetBusy = '停车';
    const c = a.car;
    // 南停车场满了就停北边
    const st = pickStall(SOUTH) ?? pickStall(NORTH);
    const north = !!st && st.row < 2;
    yield* enter(valet, c, -1);
    if (arrival === a) arrival = null;
    yield* wait(0.4);
    // 落客区里掉头（往西南绕一个小圈）→ 车道东行 → 南进出口 → 通道往西
    const turn = mkPath([[c.x, c.z], ...UTURN, [ENTRY_W - 3, DRIVE_EB]], 1.6);
    yield* drive(c, turn, 3.5, { vEnd: 3.0 });
    if (!st) {
      // 没车位：开出画（不会发生：池子比车多）
      yield* drive(
        c,
        mkPath([
          [c.x, c.z],
          [CAR_EDGE_X + 2, DRIVE_EB],
        ]),
        7,
      );
      dropCar(c);
      valet.inCar = false;
      valet.x = SPOTS.edgeOut[0];
      yield* walk(valet, [POD_STAND], 3);
      return;
    }
    const lane = toAisle(north, 'eb');
    yield* drive(c, mkPath([[c.x, c.z], ...lane], 2.4), 4.0, { vEnd: 1.4 });
    yield* reverseIn(c, st);
    yield* wait(0.3);
    yield* exit(valet, c, -1);
    yield* closeDoor(c, -1);
    // 走回岗亭：通道 → 墙边步道 →（南边来的经过落客区）→ 岗亭窗口
    valetBusy = '走回岗亭';
    yield* walk(valet, [...lotToBooth(st), BOOTH_WIN], 2.6, 'walk', 1.8);
    yield* face(valet, P);
    yield* act(valet, 'handoff', 1.2, HANDOFF_AT, () => {
      valet.obj.userData.setProp?.(null);
      const k = keysApi?.free() ?? -1;
      if (k >= 0) keysApi?.hang(k);
      c.keySlot = k;
    });
    served++;
  }
  /** 停车场某个车位前 → 岗亭窗口前（不含窗口）：南边走墙边步道经过落客区，北边走北步道 */
  const lotToBooth = (st: Stall): V2[] => {
    const front = st.aisleZ - st.aisleSide * 3.3;
    const x = st.c[0] - 1.45;
    if (st.row >= 2)
      return [
        [x, front],
        [62.4, st.aisleZ - 0.8],
        [61.6, 9.4],
        [61.7, 0.0],
        [BOOTH_WIN[0] + 0.3, BOOTH_WIN[1] + 1.2],
      ];
    return [
      [x, front],
      [62.4, st.aisleZ + 0.8],
      [61.55, -12],
      [61.6, -8.2],
      [62.4, -6.9],
    ];
  };
  /** 岗亭（或大门口）→ 某个车位的司机门：lotToBooth 反过来 */
  const boothToLot = (st: Stall, c: Car): V2[] => [...lotToBooth(st).reverse(), doorPt(c, -1)];
  /** 取车：摘钥匙 → 去车位 → 开到落客点 → 递钥匙 → 会员开走 */
  function* valetFetch(pk: (typeof pickups)[number]): Co {
    pk.ready = false;
    const c = pk.car;
    valetBusy = '取车';
    yield* walk(valet, [BOOTH_WIN], 1.6);
    yield* face(valet, P);
    yield* act(valet, 'handoff', 1.2, HANDOFF_AT, () => {
      if (c.keySlot >= 0) keysApi?.take(c.keySlot);
      c.keySlot = -1;
      valet.obj.userData.setProp?.('keys');
    });
    say(pk.m, '谢谢！', 1.2);
    valetBusy = '取车';
    const st = pk.st;
    yield* walk(valet, boothToLot(st, c), 2.6, 'walk', 1.8);
    yield* enter(valet, c, -1);
    // 会员看见车来了：先从代客台前走到落客区南边等（车头西边绕过去）
    const m = pk.m;
    spawn(
      walk(
        m,
        [
          [64.4, -3.0],
          [64.4, -0.3],
          [65.6, -0.25],
        ],
        1.3,
      ),
    );
    yield* leaveStall(c, st);
    // 进出口往北 → 车道西行 → 落客点；落客点上有车（等代客接的）就停在它后面，在那儿交钥匙
    const back = mkPath([[c.x, c.z], ...fromAisle(st.row < 2, true, c.x), SPOTS.dropoff], 2.4);
    yield* drive(c, back, 4.0, { giveUp: () => c.stuckFor > 0.8 && c.x < ENTRY.x0 && c.z < 0 });
    park(c);
    c.live = true;
    yield* exit(valet, c, -1);
    // 会员过来（落客的车身南边），代客递钥匙
    pickups.splice(pickups.indexOf(pk), 1);
    const [ex, ez] = doorPt(c, -1);
    const meet: V2 = [ex - 0.9, ez + 0.15];
    spawn(
      (function* (): Co {
        yield* until(() => Math.hypot(m.x - 65.6, m.z + 0.25) < 0.05, 10);
        yield* walk(m, [meet], 1.4);
      })(),
    );
    yield* walk(valet, [[ex + 0.7, ez + 0.25]], 1.2);
    yield* until(() => Math.hypot(m.x - meet[0], m.z - meet[1]) < 0.05, 15);
    yield* faceTo(valet, m.x, m.z);
    yield* faceTo(m, valet.x, valet.z, 0.2);
    yield* act(valet, 'handoff', 1.4, HANDOFF_AT, () => {
      valet.obj.userData.setProp?.(null);
    });
    say(m, '谢谢', 1.2);
    served++;
    spawn(memberDriveOff(m, c));
    yield* wait(0.6);
  }
  /** 会员上车 → （前面的落客车开走以后）落客区里掉头 → 车道往东出画 */
  function* memberDriveOff(m: Person, c: Car): Co {
    yield* walk(m, [doorPt(c, -1)], 1.2);
    yield* enter(m, c, -1);
    dropMember(m);
    yield* wait(0.5);
    const pts: V2[] = [[c.x, c.z]];
    if (c.x > SPOTS.dropoff[0] + 1) pts.push(SPOTS.dropoff);
    pts.push(...UTURN, [CAR_EDGE_X + 3, DRIVE_EB]);
    yield* drive(c, mkPath(pts, 1.6), 7);
    dropCar(c);
  }
  /** 会员从车边走进大门（driver：顺路把门关上） */
  function* memberToGate(m: Person, c: Car | null, side: -1 | 1, closeDoorAfter: boolean): Co {
    m.say = '';
    if (c && closeDoorAfter) c.obj.userData.setDoor?.(false, side < 0 ? 'left' : 'right');
    const pts: V2[] =
      side < 0
        ? [[m.x - 1.4, m.z + 0.3]]
        : [
            [m.x - 1.2, m.z - 0.5],
            [65.0, -2.9],
          ];
    pts.push([62.6, 0.2], SPOTS.gateIn, [57.6, 0.6]);
    yield* walk(m, pts, 1.3);
    dropMember(m);
  }

  // ── 来车：落客 ──
  /** 车道西行车道画外那头有车（排队排到画外了）：等它往前挪 */
  const edgeBusy = () => cars.some((c) => c.live && Math.abs(c.z - DRIVE_WB) < 0.8 && c.x > CAR_EDGE_X - 8);
  function* arriveDropoff(): Co {
    // 两片停车场都没空位了（代客忙不过来，取车的人越积越多）：这一辆不来
    if (![...SOUTH, ...NORTH].some((s) => !s.car && !s.reserved)) return;
    yield* until(() => !edgeBusy(), 60);
    const kind = rnd() < 0.75 ? 'car' : 'suv';
    const c = newCar(kind, Math.floor(rnd() * 7));
    c.x = CAR_EDGE_X;
    c.z = DRIVE_WB;
    c.rot = P / 2;
    placeCar(c);
    const drv = newMember(0, 0);
    drv.inCar = true;
    placeP(drv);
    const pass = rnd() < 0.45 ? newMember(0, 0) : null;
    if (pass) {
      pass.inCar = true;
      placeP(pass);
    }
    const a: Arrival = { car: c, driver: drv, waiting: false, waitT: 0, keys: 'member', handled: false };
    // 落客点被占（上一辆还没开走）：在后面排队
    yield* drive(c, mkPath([[c.x, c.z], [90, DRIVE_WB], SPOTS.dropoff]), 7);
    park(c);
    c.live = true; // 还算"在路上"（别人会躲它）
    arrival = a;
    yield* wait(0.3);
    // 司机下车，乘客从北边下
    spawn(exit(drv, c, -1));
    if (pass) spawn(exit(pass, c, 1));
    yield* wait(1.1);
    if (pass) spawn(memberToGate(pass, c, 1, true));
    // 门童去拿包
    if (doormanTask === 'home') spawn(doormanBag(c));
    // 等人接钥匙
    yield* faceTo(drv, POD_STAND[0], POD_STAND[1]);
    a.waiting = true;
    while (a.keys === 'member') {
      const dt = yield;
      a.waitT += dt;
      if (a.waitT > 5 && (a.waitT % 6) - dt < 0) say(drv, a.waitT > 14 ? '代客呢？' : '钥匙给谁？', 2.4);
    }
    a.waiting = false;
    // 钥匙交出去了（代客或总监）：会员已经被送进门（memberToGate 由接钥匙的那边 spawn）
  }

  // ── 来车：自己停车 ──
  function* arriveSelf(): Co {
    yield* until(() => !edgeBusy(), 60);
    const kind = rnd() < 0.6 ? 'suv' : 'car';
    const st = pickStall(NORTH);
    if (!st) return;
    const c = newCar(kind, Math.floor(rnd() * 7));
    c.x = CAR_EDGE_X;
    c.z = DRIVE_WB;
    c.rot = P / 2;
    placeCar(c);
    const drv = newMember(0, 0);
    drv.inCar = true;
    placeP(drv);
    yield* drive(c, mkPath([[c.x, c.z], ...toAisle(true, 'wb')], 2.6), 6, { vEnd: 1.4 });
    // 通道里慢慢找（刹车灯一闪一闪）
    const laneZ = st.aisleZ - LANE;
    const sx = st.c[0];
    yield* drive(
      c,
      mkPath([
        [c.x, c.z],
        [sx + 2.6, laneZ],
      ]),
      1.5,
      { search: true, vEnd: 1.0 },
    );
    yield* reverseIn(c, st);
    yield* wait(0.5);
    yield* exit(drv, c, -1);
    yield* closeDoor(c, -1);
    // 走去大门：车位前 → 通道 → 墙边步道 → 落客区 → 进门
    const front = st.aisleZ - st.aisleSide * 3.3;
    yield* walk(
      drv,
      [[drv.x, front], [62.4, st.aisleZ + 0.6], [61.55, -12], [61.6, -3.0], SPOTS.gateIn, [57.6, 0.6]],
      1.3,
    );
    dropMember(drv);
  }

  // ── 出去：取车（代客） ──
  function* departValet(): Co {
    // 代客台前最多两个人等（再多就不来了：不让队伍无限长）
    if (pickups.length >= 2) return;
    const st = [...SOUTH, ...NORTH]
      .filter((s) => s.car && !s.reserved && !s.car.live && s.car.keySlot >= 0)
      .sort((a, b) => (a.car?.parkedAt ?? 0) - (b.car?.parkedAt ?? 0))[0];
    if (!st?.car) return;
    st.reserved = true;
    // 好几个人等取车：排在代客台前、往西挨着站
    const slotN = pickups.length;
    const m = newMember(57.6, 0.6, P / 2);
    const at: V2 = [POD_FRONT[0] - slotN * 0.9, POD_FRONT[1] + slotN * 0.25];
    yield* walk(m, [SPOTS.gateIn, [62.0, -1.2], at], 1.3);
    yield* faceTo(m, SPOTS.podium[0], SPOTS.podium[1]);
    const pk = { m, car: st.car, st, ready: true, waitT: 0, keySlot: st.car.keySlot };
    pickups.push(pk);
    while (pickups.includes(pk) && pk.ready) {
      const dt = yield;
      pk.waitT += dt;
      if (pk.waitT > 8 && (pk.waitT % 7) - dt < 0) say(m, '我的车…', 2);
    }
  }
  /** 总监递了钥匙：会员自己走去停车场、开车走（车位朝向不管，leaveStall 会倒出来或开出来） */
  function* memberSelfFetch(pk: (typeof pickups)[number]): Co {
    const { m, car: c, st } = pk;
    say(m, '谢谢总监！', 1.6);
    yield* wait(0.4);
    yield* walk(m, [[62.4, -1.6], ...boothToLot(st, c).slice(st.row >= 2 ? 1 : 0)], 1.45);
    yield* enter(m, c, -1);
    dropMember(m);
    yield* wait(0.5);
    yield* leaveStall(c, st);
    yield* drive(c, mkPath([[c.x, c.z], ...fromAisle(st.row < 2, false, c.x), [CAR_EDGE_X + 3, DRIVE_EB]], 2.6), 6);
    dropCar(c);
  }
  // ── 出去：自己取车（北停车场） ──
  function* departSelf(): Co {
    const st = NORTH.filter((s) => s.car && !s.reserved && !s.car.live && s.car.keySlot < 0).sort(
      (a, b) => (a.car?.parkedAt ?? 0) - (b.car?.parkedAt ?? 0),
    )[0];
    if (!st?.car) return;
    st.reserved = true;
    const c = st.car;
    const m = newMember(57.6, 0.6, P / 2);
    const front = st.aisleZ - st.aisleSide * 3.3;
    const [dx, dz] = doorPt(c, -1);
    yield* walk(m, [SPOTS.gateIn, [61.6, -3.0], [61.55, -12], [62.4, st.aisleZ + 0.6], [dx, front], [dx, dz]], 1.3);
    yield* enter(m, c, -1);
    dropMember(m);
    yield* wait(0.6);
    yield* leaveStall(c, st);
    yield* drive(c, mkPath([[c.x, c.z], ...fromAisle(true, false, c.x), [CAR_EDGE_X + 3, DRIVE_EB]], 2.6), 6);
    dropCar(c);
  }

  /** 选车位：池子里空着、没人预订的；近排优先（远排在遮阳棚底下，倒车入位看不见），同排里离大门近的优先（两个里随机一个） */
  const nearRow = (s: Stall) => (s.row === 1 || s.row === 2 ? 0 : 1);
  const pickStall = (pool: Stall[]): Stall | null => {
    const free = pool.filter((s) => !s.car && !s.reserved).sort((a, b) => nearRow(a) - nearRow(b) || a.c[0] - b.c[0]);
    if (!free.length) return null;
    const s = free[free.length > 1 && nearRow(free[1]) === nearRow(free[0]) && rnd() < 0.35 ? 1 : 0];
    s.reserved = true;
    return s;
  };

  // ── 时间表 ──
  const schedule: [number, () => Co][] = [
    [GATE_TIMING.dropoff, arriveDropoff],
    [GATE_TIMING.selfPark, arriveSelf],
    [GATE_TIMING.pickup, departValet],
    [GATE_TIMING.selfLeave, departSelf],
  ];
  // 玩法模式：多一辆落客、多一个取车 —— 代客一个人忙不过来，总监不帮忙会员就得等
  if (o.play) schedule.push([GATE_TIMING.rush[0], arriveDropoff], [GATE_TIMING.rush[1], departValet]);
  const fired = new Set<string>();
  spawn(valetLoop());

  // 门童：来车时挥手（车在 x 100 以内、还没停），会员经过时请进
  const doormanReact = (dt: number) => {
    if (doormanTask !== 'home') return;
    const coming = arrival === null && cars.some((c) => c.live && c.z < 0 && c.x < 100 && c.x > 70 && c.rot > 1);
    if (coming) {
      doorman.yaw = turnTo(doorman.yaw, 0.9, dt * 6);
      pose(doorman, 'wave');
    } else {
      const near = people.find(
        (p) => p.role === 'member' && !p.inCar && Math.hypot(p.x - doorman.x, p.z - doorman.z) < 3 && p.x > 59.5,
      );
      if (near) {
        doorman.yaw = turnTo(doorman.yaw, yawOf(near.x - doorman.x, near.z - doorman.z), dt * 5);
        pose(doorman, 'usher');
      } else {
        doorman.yaw = turnTo(doorman.yaw, 0.6, dt * 3);
        pose(doorman, 'idle');
      }
    }
    placeP(doorman);
  };

  const update = (dt: number) => {
    now += dt;
    const k = Math.floor(now / LOOP);
    const tl = now - k * LOOP;
    for (const [t, f] of schedule) {
      const key = `${k}:${t}`;
      if (tl >= t && !fired.has(key)) {
        fired.add(key);
        spawn(f());
      }
    }
    gatherCircles();
    const cur = live;
    live = [];
    for (const c of cur) if (!c.next(dt).done) live.push(c);
    doormanReact(dt);
    // 推车跟着推的人
    if (trolleyCarried) {
      const d = o.director();
      if (d) placeTrolleyBy(d.position.x, d.position.z, d.rotation.y, Math.min(1, dt * 9));
    } else if (pushing) placeTrolleyBy(pushing.x, pushing.z, pushing.yaw, Math.min(1, dt * 9));
    for (const c of cars) {
      c.obj.userData.setSpeed?.(c.v * c.dir);
      c.obj.userData.update?.(dt);
    }
    for (const p of people) {
      if (p.sayT > 0) p.sayT -= dt;
      p.obj.userData.update?.(dt);
    }
  };

  const hooks: ParkPlayHooks = {
    keysWaiting: () => {
      const a = arrival;
      if (!a?.waiting || a.keys !== 'member' || !a.driver) return null;
      return { x: a.driver.x, z: a.driver.z };
    },
    takeKeys: () => {
      const a = arrival;
      if (a?.keys !== 'member' || !a.driver) return false;
      a.keys = 'director';
      a.waiting = false;
      a.handled = false;
      directorKeys = a;
      say(a.driver, '谢谢总监！', 1.6);
      spawn(memberToGate(a.driver, a.car, -1, true));
      return true;
    },
    directorHasKeys: () => directorKeys !== null,
    hangKeys: () => {
      const a = directorKeys;
      if (!a) return false;
      const k = keysApi?.free() ?? -1;
      if (k >= 0) keysApi?.hang(k);
      a.car.keySlot = k;
      a.keys = 'booth';
      directorKeys = null;
      pendingBooth.push(a);
      return true;
    },
    boothWindow: () => BOOTH_WIN,
    trolley,
    trolleyBags: () => bags,
    setTrolleyCarried: (on: boolean) => {
      trolleyCarried = on;
    },
    trolleyCarried: () => trolleyCarried,
    atGate: (x: number, z: number) => x < 62.4 && Math.abs(z) < 3.2,
    deliverBags: () => {
      const n = bags;
      bags = 0;
      trolley?.userData.setBags?.(0);
      return n;
    },
    pickupWaiting: () => {
      const pk = pickups.find((q) => q.ready && q.waitT > 0);
      return pk ? { x: pk.m.x, z: pk.m.z } : null;
    },
    takePickupKeys: () => {
      const pk = pickups.find((q) => q.ready && q.waitT > 0);
      if (!pk || directorPickup) return false;
      pk.ready = false;
      if (pk.car.keySlot >= 0) keysApi?.take(pk.car.keySlot);
      pk.car.keySlot = -1;
      directorPickup = pk;
      return true;
    },
    directorHasPickupKeys: () => directorPickup !== null,
    givePickupKeys: () => {
      const pk = directorPickup;
      if (!pk) return false;
      directorPickup = null;
      pickups.splice(pickups.indexOf(pk), 1);
      served++;
      spawn(memberSelfFetch(pk));
      return true;
    },
    returnPickupKeys: () => {
      const pk = directorPickup;
      if (!pk) return;
      directorPickup = null;
      const k = pk.keySlot >= 0 && !keysApi?.has(pk.keySlot) ? pk.keySlot : (keysApi?.free() ?? -1);
      if (k >= 0) keysApi?.hang(k);
      pk.car.keySlot = k;
      pk.ready = true;
    },
    pickupMember: () => directorPickup?.m.obj ?? pickups.find((q) => q.waitT > 0)?.m.obj ?? null,
  };

  return {
    update,
    alerts: () => {
      const out: ParkAlert[] = [];
      for (const p of people)
        if (p.sayT > 0 && p.say && !p.inCar && p.obj.visible)
          out.push({ p: new THREE.Vector3(p.x, o.groundAt(p.x, p.z) + 2.25, p.z), text: p.say });
      return out;
    },
    obstacles: () => {
      const out: { x: number; z: number; r: number }[] = [];
      for (const c of cars) if (c.obj.visible) carCircles(c, out);
      for (const p of people) if (!p.inCar && p.obj.visible) out.push({ x: p.x, z: p.z, r: p.r });
      if (trolley && !trolleyCarried) out.push({ x: trolley.position.x, z: trolley.position.z, r: 0.7 });
      return out;
    },
    stats: () => ({
      wait: arrival?.waiting ? arrival.waitT : 0,
      queue: cars.filter((c) => c.live && c.z < 0 && c.x > SPOTS.dropoff[0] + 2 && c.x < 95 && c.v < 0.2).length,
      bags,
      valet: valetBusy || '空闲',
      served,
      cars: cars.length,
    }),
    hooks,
    debug: () => ({
      now,
      cars: cars.map((c) => ({
        kind: c.kind,
        x: +c.x.toFixed(2),
        z: +c.z.toFixed(2),
        rot: +c.rot.toFixed(2),
        v: +c.v.toFixed(2),
        live: c.live,
        stall: c.stall?.id,
      })),
      people: people.map((p) => ({
        role: p.role,
        x: +p.x.toFixed(2),
        z: +p.z.toFixed(2),
        inCar: p.inCar,
        say: p.sayT > 0 ? p.say : '',
      })),
      valet: valetBusy,
      bags,
      stalls: stalls.map((s) => `${s.id}:${s.car ? 'X' : '.'}${s.reserved ? 'r' : ''}`).join(' '),
    }),
  };
}

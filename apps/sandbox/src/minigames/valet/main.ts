// 小游戏 4 · 代客泊车（停车场，clubpark）：会员的车一辆接一辆开到大门外的落客点。120 秒里总监去车门边接钥匙、
// 自己把车开进派给你的车位（地上金框 + 箭头 + 导航点），停正、停住 = 停好；走回落客点接下一辆。
// - 开车（手机）：开车时整个画面是触摸板，按住拖 = 往哪拖车就往哪开；拖向车尾 = 倒车（摇杆上 D / R）；松手 = 刹车。
//   车是 clubpark 的车模（car / suv，轮子转、前轮打方向、刹车灯、车身点头侧倾），运动学自行车模型同 life.ts（rules.ts）。
// - 停好：车身四个角都在线里（压线 0.18 米以内）、和车位方向差 ≤ 10°、停住半秒。离车位近了出停车仪表（角度 / 入位 / 差什么）。
// - 剐蹭：撞到别的车、花坛路缘、柱子、人 → 按撞的速度赔钱（8～40，撞人另 +15），车主 / 路人冒一句；慢慢蹭（< 0.45 米/秒）不算。
// - 耐心：排队的车顶上一条耐心条；见底 = 会员等急了（−15，这辆的小费减半）。来车越来越密、会员越来越没耐心。
// - 取车：38 秒起，隔一阵就有会员出门要自己的车（你停的、停了 14 秒以上的）：车上出箭头，去开出来送到车道南沿的取车点。
// - 小费 = 分：停好一辆 20 底 + 快 0..25 + 停得正 0..15 + 零剐蹭 10 + 会员高兴 0..10；取车 20 + 等得少 0..20 + 零剐蹭 10。
// 派车位：先派离代客台近的、宽敞的；越往后越远、越夹在车中间（rules.chooseBay）。
// 星级线：机器人（bot.ts，照导航线开、和手指同一个摇杆）一局 210 分（停 4 辆、取 1 次、刮 1 下、2 位等急了）→ 100 / 200 / 300。
// 场面：场景原样（clubpark 的 Region，日常演出关掉）：停着的车（SLOTS 的 park-*）留着当障碍；白模里定格的车、人收掉，门童挪到长椅边。
import '../../clubsite/render/colors';
import * as THREE from 'three';
import { CLOUDS, PARKED, ROWS, stallCenter } from '../../clubpark/layout';
import { createParkRegion } from '../../clubpark/scene';
import type { Shape } from '../../clubsite/play';
import { mountMinigame } from '../shell';
import { type Follow, followStick, newFollow } from './bot';
import { BAY_GOLD, BAY_GREEN, BAY_ORANGE, bayMark, guideDots } from './fx';
import { createDriveUi, type PatBar } from './hud';
import {
  ANGRY_COST,
  allBays,
  arrivalGap,
  type Bay,
  type Box,
  BUMP_MIN_V,
  boxPen,
  boxRim,
  bumpCost,
  type CarKind,
  type CarState,
  carBox,
  chooseBay,
  DIMS,
  DURATION,
  FETCH,
  FETCH_ANGRY_COST,
  fetchTip,
  firstHit,
  intentFromStick,
  kindFor,
  noseOf,
  PARK,
  PICKUP,
  PICKUP_R,
  PICKUP_STAND,
  parkCheck,
  parkTip,
  patienceFor,
  pointDepth,
  QUEUE,
  type RoutePt,
  rotOf,
  routeLen,
  routeToBay,
  routeToPickup,
  type Solid,
  STARS,
  settle,
  stepCar,
  type Tag,
  wrapPi,
} from './rules';

type V2 = [number, number];
const P = Math.PI;
const WEST = P / 2;
/** 总监开局：代客台东南边，看着落客点 */
const START: V2 = [64.6, -3.1];
/** 大门（会员进出） */
const GATE_IN: V2 = [59.4, 0.6];
/** 门童挪到长椅边（原来站在南门柱外，正好在掉头的地方） */
const DOORMAN: V2 = [61.2, 6.9];
/** 车从画外（东边）开进来 */
const SPAWN_X = 101;
/** 开走的车开到这里就收掉 */
const GONE_X = 104;

type Role = 'static' | 'queue' | 'player' | 'parked' | 'leave';

interface Member {
  obj: THREE.Object3D;
  x: number;
  z: number;
  yaw: number;
  ph: number;
  path: V2[];
  onArrive: (() => void) | null;
  on: boolean;
}

interface VCar {
  id: number;
  kind: CarKind;
  obj: THREE.Object3D;
  s: CarState;
  role: Role;
  /** 第几辆来的（静态车 −1） */
  k: number;
  /** 排队的位置（0 = 落客点） */
  slot: number;
  arrived: boolean;
  pat: number;
  patMax: number;
  angry: boolean;
  member: Member | null;
  bay: Bay | null;
  parkedAt: number;
  /** 自动驾驶的路（排队、开走） */
  path: V2[] | null;
  pi: number;
  /** 车模的动作：上一步的速度 */
  mv: number;
  own: boolean;
}

mountMinigame({
  id: 'valet',
  title: '代客泊车',
  tag: '小游戏 4 · 停车场',
  goal: '会员的车一辆接一辆开到大门外。接过钥匙，把车停进派给你的车位，又快又正、别刮着！',
  howto: [
    '走到车门边的会员跟前点「接钥匙」，就坐进车里了',
    '开车：按住画面拖，往哪拖车就往哪开；拖向车尾 = 倒车（摇杆显示 R）；松手刹车',
    '跟着地上的金点开到金框车位（红点 = 倒车），四个角都进线、停正、停住 = 停好',
    '排队的车有耐心条；有会员来取车就把他的车开到车道南沿的取车点',
  ],
  region: (host) => createParkRegion(host),
  clouds: CLOUDS,
  life: false,
  hour: 16,
  weather: 'clear',
  start: { start: START, yaw: Math.PI / 2 + 0.4 },
  camera: { lead: { portrait: 1.2, landscape: 0.4 }, dead: [0.9, 1.2] },
  duration: DURATION,
  stars: STARS,
  scoreLabel: '小费',
  setup(mg) {
    const { scene, play, region } = mg;
    const { kit } = region;
    const D = play.director;
    const nav = play.nav;
    const params = mg.params;

    // ── 场面：白模里定格的车、人收掉；门童挪开 ──
    for (const id of [
      'car-dropoff',
      'member-driver',
      'valet',
      'member-walk',
      'member-n',
      'member-lot',
      'car-arrive',
      'car-search',
      'car-leave',
      // 墙里那块灰盒子（clubdesk 场景的示意）：小游戏里只看墙外
      'clubdesk',
    ]) {
      const o = scene.getObjectByName(`slot:${id}`);
      if (o) o.visible = false;
    }
    const doorman = scene.getObjectByName('slot:doorman');
    if (doorman) {
      doorman.position.set(DOORMAN[0], mg.groundAt(DOORMAN[0], DOORMAN[1]), DOORMAN[1]);
      doorman.rotation.y = 1.9;
    }
    const trolley = scene.getObjectByName('slot:bag-trolley');

    // ── 车位 ──
    const BAYS = allBays();
    const bayById = new Map(BAYS.map((b) => [b.id, b]));

    // ── 车 ──
    const cars: VCar[] = [];
    const pool: Record<CarKind, THREE.Object3D[]> = { car: [], suv: [] };
    let carSeq = 0;
    const placeCar = (c: VCar) => {
      c.obj.position.set(c.s.x, mg.groundAt(c.s.x, c.s.z), c.s.z);
      c.obj.rotation.y = c.s.rot;
    };
    const ud = (c: VCar) =>
      c.obj.userData as {
        setSpeed?(v: number): void;
        setMotion?(steer: number, ax: number, ay: number): void;
        setBrake?(on: boolean): void;
        setDoor?(open: boolean, side?: 'left' | 'right' | 'both', instant?: boolean): void;
        setPaint?(v: number): void;
        update?(dt: number): void;
      };
    // 停着的车（场景 SLOTS 的 park-*）：原样留着，当障碍；它们占的车位不派
    const staticTaken = new Set<string>();
    for (const [r, i, asset] of PARKED) {
      const row = ROWS[r];
      const obj = scene.getObjectByName(`slot:park-${row.id}-${i}`);
      if (!obj) continue;
      const [x, z] = stallCenter(row, i);
      cars.push({
        id: ++carSeq,
        kind: asset,
        obj,
        s: { x, z: z + row.nose * 0.15, rot: row.nose < 0 ? 0 : P, v: 0, steer: 0, gear: 1 },
        role: 'static',
        k: -1,
        slot: -1,
        arrived: true,
        pat: 0,
        patMax: 1,
        angry: false,
        member: null,
        bay: bayById.get(`${row.id}-${i}`) ?? null,
        parkedAt: -1e9,
        path: null,
        pi: 0,
        mv: 0,
        own: false,
      });
      staticTaken.add(`${row.id}-${i}`);
    }
    const newCar = (kind: CarKind, paint: number, x: number, z: number, rot: number): VCar => {
      const obj = pool[kind].pop() ?? kit.makeAsset(kind, paint).obj;
      obj.name = `valet:car-${kind}`;
      if (!obj.parent) scene.add(obj);
      obj.visible = true;
      const c: VCar = {
        id: ++carSeq,
        kind,
        obj,
        s: { x, z, rot, v: 0, steer: 0, gear: 1 },
        role: 'queue',
        k: 0,
        slot: 0,
        arrived: false,
        pat: 0,
        patMax: 1,
        angry: false,
        member: null,
        bay: null,
        parkedAt: 0,
        path: null,
        pi: 0,
        mv: 0,
        own: true,
      };
      ud(c).setPaint?.(paint);
      ud(c).setDoor?.(false, 'both', true);
      ud(c).setBrake?.(false);
      placeCar(c);
      cars.push(c);
      return c;
    };
    const dropCar = (c: VCar) => {
      const i = cars.indexOf(c);
      if (i >= 0) cars.splice(i, 1);
      if (!c.own) return;
      c.obj.visible = false;
      ud(c).setSpeed?.(0);
      pool[c.kind].push(c.obj);
    };
    const boxOf = (c: VCar, pad = 0) => carBox(c.s, c.kind, pad);
    /** 车本地（右 lx、前 −lz，同 life.ts 的 carLocal：司机侧 = 本地 −x）→ 世界 */
    const carLocal = (c: VCar, lx: number, lz: number): V2 => {
      const cs = Math.cos(c.s.rot);
      const sn = Math.sin(c.s.rot);
      return [c.s.x + lx * cs + lz * sn, c.s.z - lx * sn + lz * cs];
    };
    /** 车的动作（轮子、前轮、点头侧倾、刹车灯）：按这一步的速度变化 */
    const animCar = (c: VCar, dt: number, engine: boolean) => {
      const v = c.s.v;
      const ax = THREE.MathUtils.clamp((v - c.mv) / Math.max(dt, 1e-4), -6, 6);
      const w = (v * Math.tan(c.s.steer)) / 2.8;
      c.mv = v;
      const u = ud(c);
      u.setSpeed?.(v);
      u.setMotion?.(c.s.steer, ax, THREE.MathUtils.clamp(-v * w, -5, 5));
      u.setBrake?.(engine && (ax * Math.sign(v || 1) < -0.5 || Math.abs(v) < 0.05));
    };
    // 走路的总监躲车（每辆三个圆，同 life.ts）
    play.addBlocker(() => {
      const out: { x: number; z: number; r: number }[] = [];
      for (const c of cars) {
        if (!c.obj.visible || c === driving) continue;
        const [nx, nz] = noseOf(c.s.rot);
        const d = DIMS[c.kind];
        const k = d.hl - d.hw;
        for (const s of [-k, 0, k]) out.push({ x: c.s.x + nx * s, z: c.s.z + nz * s, r: d.hw });
      }
      if (trolley) out.push({ x: trolley.position.x, z: trolley.position.z, r: 0.65 });
      return out;
    });

    // ── 会员（clubsite 的球员，场景 kit 建）──
    const members: Member[] = [];
    const memberPool: THREE.Object3D[] = [];
    const memberRng = mg.rng('members');
    const newMember = (x: number, z: number, yaw = 0): Member => {
      const obj = memberPool.pop() ?? kit.makeAsset('player', Math.floor(memberRng() * 4)).obj;
      if (!obj.parent) scene.add(obj);
      obj.visible = true;
      obj.userData.setProp?.(memberRng() < 0.5 ? 'racket' : null);
      obj.userData.pose?.('idle');
      const m: Member = { obj, x, z, yaw, ph: 0, path: [], onArrive: null, on: true };
      members.push(m);
      placeMember(m);
      return m;
    };
    const placeMember = (m: Member) => {
      m.obj.position.set(m.x, mg.groundAt(m.x, m.z), m.z);
      m.obj.rotation.y = m.yaw;
    };
    const dropMember = (m: Member) => {
      m.on = false;
      m.obj.visible = false;
      const i = members.indexOf(m);
      if (i >= 0) members.splice(i, 1);
      memberPool.push(m.obj);
    };
    const walk = (m: Member, path: V2[], then: (() => void) | null = null) => {
      m.path = path.slice();
      m.onArrive = then;
    };
    const stepMember = (m: Member, dt: number) => {
      const t = m.path[0];
      if (t) {
        const dx = t[0] - m.x;
        const dz = t[1] - m.z;
        const d = Math.hypot(dx, dz);
        const step = 1.5 * dt;
        if (d <= step) {
          m.x = t[0];
          m.z = t[1];
          m.path.shift();
        } else {
          m.x += (dx / d) * step;
          m.z += (dz / d) * step;
        }
        if (d > 0.01) {
          let dy = Math.atan2(dx, dz) - m.yaw;
          dy -= Math.round(dy / (P * 2)) * P * 2;
          m.yaw += dy * Math.min(1, dt * 10);
        }
        m.ph = (m.ph + step / 1.1) % 1;
        m.obj.userData.pose?.('walk', m.ph);
        if (!m.path.length) {
          m.obj.userData.pose?.('idle');
          const f = m.onArrive;
          m.onArrive = null;
          f?.();
        }
      }
      placeMember(m);
      m.obj.userData.update?.(dt);
    };
    const head = (m: Member) => new THREE.Vector3(m.x, mg.groundAt(m.x, m.z) + 1.0, m.z);

    // ── 静态的挡车的东西：场景导航的挡路形状（花坛、种植带、岗亭、代客台、立牌、长椅、门柱、遮阳棚柱子、植物）──
    const solidOf = (sh: Shape): Solid | null => {
      if ('poly' in sh) {
        let cx = 0;
        let cz = 0;
        for (const [x, z] of sh.poly) {
          cx += x;
          cz += z;
        }
        cx /= sh.poly.length;
        cz /= sh.poly.length;
        let rad = 0;
        for (const [x, z] of sh.poly) rad = Math.max(rad, Math.hypot(x - cx, z - cz));
        return { kind: 'poly', pts: sh.poly, tag: 'curb', cx, cz, rad };
      }
      if ('r' in sh && 'x' in sh) return { kind: 'circle', x: sh.x, z: sh.z, r: sh.r, tag: 'pole' };
      if ('x0' in sh) {
        const big = Math.max(sh.x1 - sh.x0, sh.z1 - sh.z0) > 1.8;
        return {
          kind: 'box',
          b: {
            x: (sh.x0 + sh.x1) / 2,
            z: (sh.z0 + sh.z1) / 2,
            nx: 0,
            nz: -1,
            hl: (sh.z1 - sh.z0) / 2,
            hw: (sh.x1 - sh.x0) / 2,
          },
          tag: big ? 'curb' : 'pole',
        };
      }
      return null;
    };
    const STATIC: Solid[] = [];
    for (const sh of nav.blockedShapes()) {
      const s = solidOf(sh);
      if (s) STATIC.push(s);
    }
    if (trolley) STATIC.push({ kind: 'circle', x: trolley.position.x, z: trolley.position.z, r: 0.6, tag: 'pole' });
    /** 车身外沿出了能开的地方（地图边、台地崖壁、墙）几个点 */
    const outside = (b: Box) => {
      let n = 0;
      for (const [x, z] of boxRim(b, 0.6)) if (nav.height(x, z) === null) n++;
      return n;
    };

    // ── 地上的提示 ──
    const bayFx = bayMark();
    scene.add(bayFx.obj);
    const dots = guideDots();
    scene.add(dots.obj);
    const pickRing = mg.ring(PICKUP[0], PICKUP[1], PICKUP_R, 0xfff3d6);
    pickRing.visible = false;
    const pickMat = pickRing.material as THREE.MeshBasicMaterial;

    // ── 界面 ──
    const ui = createDriveUi();

    // ── 一局的状态 ──
    let round = 0;
    let driving: VCar | null = null;
    let job: 'park' | 'fetch' | null = null;
    let route: RoutePt[] = [];
    let routeI = 0;
    let keyAt = 0;
    let tripBumps = 0;
    let patAtKey = 1;
    let angryAtKey = false;
    let holdT = 0;
    let lastBump = -9;
    let lastEdgeToast = -9;
    /** 调试：撞了什么（__mg.state().bumpLog） */
    const bumpLog: string[] = [];
    let look = new THREE.Vector2();
    let arrivals = 0;
    let nextArrival = 0;
    let nextFetch: number = FETCH.first;
    let fetch: { car: VCar; m: Member; pat: number; patMax: number; ready: boolean } | null = null;
    let firstDrive = true;
    const tally = { parked: 0, fetched: 0, perfect: 0, bumps: 0, damage: 0, angry: 0, tips: 0 };
    const carRng = () => mg.rng(`cars:${mg.round}`);
    let rngCar = carRng();
    let rngFetch = mg.rng(`fetch:${mg.round}`);

    const queueCars = () => cars.filter((c) => c.role === 'queue').sort((a, b) => a.slot - b.slot);
    const atDropoff = (): VCar | null => {
      const c = cars.find((q) => q.role === 'queue' && q.slot === 0 && q.arrived);
      return c ?? null;
    };
    const waitingMember = (): Member | null => {
      const c = atDropoff();
      return c?.member && !c.member.path.length ? c.member : null;
    };

    // 车位有没有车（车心在车位框里），或者派出去了
    const taken = (id: string) => {
      if (staticTaken.has(id)) return true;
      const b = bayById.get(id);
      if (!b) return true;
      for (const c of cars) {
        if (c.role === 'static') continue;
        if (c.bay?.id === id && (c.role === 'parked' || c === driving)) return true;
        if (c.s.x > b.x0 && c.s.x < b.x1 && c.s.z > b.z0 && c.s.z < b.z1) return true;
      }
      return false;
    };

    // ── 来车 ──
    const spawnArrival = () => {
      const q = queueCars();
      if (q.length >= QUEUE.length) return false;
      const k = arrivals++;
      const kind = kindFor(k, rngCar());
      const paint = Math.floor(rngCar() * 7);
      const c = newCar(kind, paint, SPAWN_X, QUEUE[0][1], WEST);
      c.k = k;
      c.slot = q.length;
      c.patMax = patienceFor(k);
      c.pat = c.patMax;
      c.path = [[QUEUE[c.slot][0], QUEUE[c.slot][1]]];
      c.pi = 0;
      c.s.v = 4.5;
      return true;
    };
    /** 一辆车停到落客点：开车门、会员下车站到车门外 */
    const memberOut = (c: VCar) => {
      ud(c).setDoor?.(true, 'left');
      const [x, z] = carLocal(c, -1.45, -0.15);
      const m = newMember(x, z, 0.3);
      c.member = m;
    };

    // ── 自动驾驶（排队、开走的车）：纯追踪 + 按剩下的路刹车，前面有东西就停 ──
    const autoStep = (c: VCar, dt: number) => {
      let vt = 0;
      let steer = c.s.steer;
      if (c.path && c.pi < c.path.length) {
        let t = c.path[c.pi];
        while (c.pi < c.path.length - 1 && Math.hypot(t[0] - c.s.x, t[1] - c.s.z) < 3) t = c.path[++c.pi];
        const last = c.path[c.path.length - 1];
        const rem = Math.hypot(last[0] - c.s.x, last[1] - c.s.z);
        const err = wrapPi(rotOf(t[0] - c.s.x, t[1] - c.s.z) - c.s.rot);
        steer = THREE.MathUtils.clamp(err * 1.8, -0.7, 0.7);
        const vmax = c.role === 'leave' ? 6.5 : 5;
        vt = Math.min(vmax, Math.sqrt(2 * 2.4 * Math.max(0, rem - 0.04)));
        if (rem < 0.06 && c.pi >= c.path.length - 1) {
          vt = 0;
          if (Math.abs(c.s.v) < 0.05) c.path = null;
        }
        // 前面有车 / 人：停
        const probe = carBox(
          {
            x: c.s.x + noseOf(c.s.rot)[0] * (0.9 + c.s.v * 0.5),
            z: c.s.z + noseOf(c.s.rot)[1] * (0.9 + c.s.v * 0.5),
            rot: c.s.rot,
          },
          c.kind,
          0.15,
        );
        if (blockedFor(c, probe)) vt = 0;
      }
      const prev = c.s;
      c.s = stepCar(c.s, { v: vt, steer, gear: 1 }, dt);
      // 自动驾驶的车不会压进别的车里（被总监的车顶着：就停着）
      if (blockedFor(c, boxOf(c), true)) c.s = { ...prev, v: 0 };
      placeCar(c);
    };
    const blockedFor = (c: VCar, b: Box, hard = false): boolean => {
      for (const o of cars) {
        if (o === c || !o.obj.visible) continue;
        if (Math.abs(o.s.x - b.x) + Math.abs(o.s.z - b.z) > 10) continue;
        const ob = boxOf(o);
        const nxt = boxPen(b, ob);
        // hard：这一步会不会比现在压得更深（被顶着就停着，不往里钻）
        if (hard ? nxt > 0.02 && nxt > boxPen(boxOf(c), ob) + 1e-4 : nxt > 0) return true;
      }
      if (!hard) {
        const dd = D.visible ? [{ x: D.position.x, z: D.position.z }] : [];
        for (const m of members) if (m.on && m !== c.member) dd.push({ x: m.x, z: m.z });
        for (const p of dd) if (pointDepth({ ...b, hw: b.hw + 0.35, hl: b.hl + 0.2 }, p.x, p.z) > 0) return true;
      }
      return false;
    };

    // ── 开车 ──
    const enterCar = (c: VCar, j: 'park' | 'fetch') => {
      driving = c;
      job = j;
      c.role = 'player';
      c.path = null;
      c.s = { ...c.s, v: 0, gear: 1 };
      ud(c).setDoor?.(false, 'both');
      D.visible = false;
      keyAt = mg.elapsed;
      tripBumps = 0;
      holdT = 0;
      look = new THREE.Vector2();
      if (j === 'park') {
        const bay = chooseBay(BAYS, taken, tally.parked);
        c.bay = bay;
        route = bay ? routeToBay(bay, [c.s.x, c.s.z]) : [];
      } else {
        const b = c.bay;
        route = b ? routeToPickup(b, c.s.rot) : [];
      }
      routeI = 0;
      botFollow = newFollow();
      dots.set(route, mg.groundAt);
      ui.setDriving(true);
      ui.setGear(1);
      if (firstDrive) {
        firstDrive = false;
        mg.toast('跟着金点开 · 红点那段倒车', 2.4);
      }
    };
    /** 下车的地方：司机门外、副驾门外、车尾、车头，哪个能站就站哪 */
    const exitSpot = (c: VCar): V2 => {
      const d = DIMS[c.kind];
      const cand: V2[] = [
        carLocal(c, -(d.hw + 0.5), 0),
        carLocal(c, d.hw + 0.5, 0),
        carLocal(c, 0, d.hl + 0.6),
        carLocal(c, 0, -(d.hl + 0.6)),
        carLocal(c, -(d.hw + 0.5), d.hl),
        carLocal(c, d.hw + 0.5, d.hl),
      ];
      for (const [x, z] of cand) {
        if (nav.standAt(x, z) === null) continue;
        if (cars.some((o) => o.obj.visible && pointDepth(boxOf(o, 0.3), x, z) > 0)) continue;
        return [x, z];
      }
      const f = nav.nearestFree(c.s.x, c.s.z + (c.s.z > 0 ? 6 : -6), 5);
      return f ? [f[0], f[1]] : [c.s.x, c.s.z];
    };
    const leaveCar = () => {
      const c = driving;
      if (!c) return;
      driving = null;
      job = null;
      route = [];
      dots.set(null, mg.groundAt);
      bayFx.set(null);
      pickRing.visible = false;
      ui.setDriving(false);
      ui.gauge(null);
      ui.forceStick(null);
      const [x, z] = exitSpot(c);
      play.teleport(x, z, Math.atan2(START[0] - x, START[1] - z));
      D.visible = true;
      c.s = { ...c.s, v: 0, steer: c.s.steer * 0.5 };
      animCar(c, 1 / 60, false);
      ud(c).setBrake?.(false);
    };
    const completePark = (q: number) => {
      const c = driving;
      if (!c) return;
      const tip = parkTip({
        secs: mg.elapsed - keyAt,
        dist: routeLen(route),
        q,
        bumps: tripBumps,
        patience: patAtKey,
        angry: angryAtKey,
      });
      tally.parked++;
      tally.tips += tip.total;
      const perfect = q >= 0.8;
      if (perfect) tally.perfect++;
      const top = new THREE.Vector3(c.s.x, mg.groundAt(c.s.x, c.s.z) + 2.0, c.s.z);
      mg.addScore(tip.total, top, { text: `+${tip.total} 小费`, big: true, color: 'green' });
      const bits = tip.parts.filter((p) => p.label !== '底' && p.value > 0).map((p) => `${p.label}+${p.value}`);
      mg.toast(`${perfect ? '漂亮！' : '停好了'} ${bits.join(' ')}`, 2.4);
      c.role = 'parked';
      c.parkedAt = mg.elapsed;
      leaveCar();
    };
    const completeFetch = () => {
      const c = driving;
      const f = fetch;
      if (!c || !f) return;
      const tip = fetchTip(f.pat / f.patMax, tripBumps);
      tally.fetched++;
      tally.tips += tip;
      const top = new THREE.Vector3(c.s.x, mg.groundAt(c.s.x, c.s.z) + 2.0, c.s.z);
      mg.addScore(tip, top, { text: `+${tip} 取车`, big: true, color: 'green' });
      mg.toast('车送到了 · 会员开走了', 1.8);
      play.say(f.m.obj, '谢谢！', 1.4);
      c.bay = null;
      leaveCar();
      // 会员上车，开走
      const m = f.m;
      const [dx, dz] = carLocal(c, -(DIMS[c.kind].hw + 0.4), 0);
      walk(m, [[dx, dz]], () => {
        dropMember(m);
        c.role = 'leave';
        c.path = [
          [c.s.x + noseOf(c.s.rot)[0] * 4, 2.0],
          [PICKUP[0] + 8, 2.0],
          [GONE_X + 2, 2.0],
        ];
        c.pi = 0;
      });
      c.role = 'leave';
      c.path = null;
      fetch = null;
      nextFetch = mg.elapsed + FETCH.gap;
    };
    const bump = (hit: Solid | 'edge' | 'out', speed: number, at: V2) => {
      if (mg.elapsed - lastBump < 0.7) return;
      if (hit === 'edge') {
        if (mg.elapsed - lastEdgeToast > 3) {
          lastEdgeToast = mg.elapsed;
          mg.toast('别开出停车场', 1.2);
        }
        return;
      }
      if (speed < BUMP_MIN_V) return;
      lastBump = mg.elapsed;
      bumpLog.push(
        `${mg.elapsed.toFixed(1)}s ${hit === 'out' ? 'out' : `${hit.kind}:${hit.tag}`} v${speed.toFixed(1)} @${at[0].toFixed(1)},${at[1].toFixed(1)} ${job}`,
      );
      const tag: Tag = hit === 'out' ? 'curb' : hit.tag;
      const cost = bumpCost(speed, tag);
      tally.bumps++;
      tally.damage += cost;
      tripBumps++;
      const what =
        tag === 'car' ? '刮到车了' : tag === 'person' ? '差点撞到人！' : tag === 'pole' ? '撞柱子了' : '蹭到路缘了';
      mg.addScore(-cost, [at[0], at[1]], { text: `-${cost} ${what}`, color: 'red', big: true });
      const owner =
        tag === 'car' ? '我的车！！' : tag === 'person' ? '看着点！' : driving?.bay ? '轻点开我的车…' : '小心点！';
      if (hit !== 'out' && hit.kind === 'circle' && tag === 'person') {
        const m = members.find((q) => Math.abs(q.x - hit.x) < 0.01 && Math.abs(q.z - hit.z) < 0.01);
        if (m) play.say(m.obj, owner, 1.6);
      } else play.say(new THREE.Vector3(at[0], mg.groundAt(at[0], at[1]) + 1.6, at[1]), owner, 1.6);
      if (driving) ud(driving).setMotion?.(driving.s.steer, -6 * Math.sign(speed || 1), 4);
    };
    const driveStep = (dt: number) => {
      const c = driving;
      if (!c) return;
      const st = ui.stick();
      const it = intentFromStick(st.x, st.y, c.s);
      const next = stepCar(c.s, it, dt);
      const cur = boxOf(c);
      const nb = carBox(next, c.kind);
      // 动态的：别的车、人（门童、会员）
      const solids: Solid[] = STATIC.slice();
      for (const o of cars) if (o !== c && o.obj.visible) solids.push({ kind: 'box', b: boxOf(o), tag: 'car' });
      for (const m of members) if (m.on) solids.push({ kind: 'circle', x: m.x, z: m.z, r: 0.3, tag: 'person' });
      if (doorman) solids.push({ kind: 'circle', x: DOORMAN[0], z: DOORMAN[1], r: 0.3, tag: 'person' });
      const hit = firstHit(cur, nb, solids);
      const out = !hit && outside(nb) > outside(cur);
      if (hit || out) {
        const speed = Math.abs(c.s.v);
        const sg = Math.sign(c.s.v || 1);
        const at: V2 = [nb.x + nb.nx * nb.hl * sg, nb.z + nb.nz * nb.hl * sg];
        bump(hit ?? (nb.x > 88.5 ? 'edge' : 'out'), speed, at);
        c.s = { ...c.s, v: 0, steer: next.steer, gear: next.gear };
      } else c.s = next;
      placeCar(c);
      animCar(c, dt, true);
      ui.setGear(c.s.gear);
      // 镜头：总监（藏着）跟着车，往车开的方向多看一点
      const [nx, nz] = noseOf(c.s.rot);
      const lk = THREE.MathUtils.clamp(c.s.v, -2.5, 6) * 0.55;
      look.x += (nx * lk - look.x) * Math.min(1, dt * 2.5);
      look.y += (nz * lk - look.y) * Math.min(1, dt * 2.5);
      play.teleport(c.s.x + look.x, c.s.z + look.y, D.rotation.y);
      // 导航点：车走到哪了
      let best = routeI;
      let bd = Infinity;
      for (let i = routeI; i < Math.min(route.length, routeI + 30); i++) {
        const d = Math.hypot(route[i].x - c.s.x, route[i].z - c.s.z);
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
      if (bd < 4) routeI = best;
      dots.from(routeI);

      if (job === 'park' && c.bay) {
        const bay = c.bay;
        const pc = parkCheck(boxOf(c), c.s.rot, bay);
        const near = Math.hypot(c.s.x - bay.cx, c.s.z - bay.cz) < 7.5;
        bayFx.set(bay, mg.groundAt(bay.cx, bay.cz));
        bayFx.color(pc.ok ? BAY_GREEN : pc.fill > 0.5 ? BAY_ORANGE : BAY_GOLD);
        if (near) {
          const stopped = Math.abs(c.s.v) < PARK.stopV;
          const status = pc.ok
            ? stopped
              ? '停住了…'
              : '停正了 · 松手刹车'
            : pc.fill > 0.6 && pc.angle > PARK.angleOk
              ? `歪了 ${Math.round(pc.angle)}° · 摆正一点`
              : pc.fill > 0.6
                ? '压线了 · 再往里 / 往中间挪'
                : '开进金框里';
          ui.gauge({
            angle: pc.angle,
            fill: pc.fill,
            ok: pc.ok,
            status,
            tone: pc.ok ? 'ok' : pc.fill > 0.6 ? 'bad' : '',
          });
        } else ui.gauge(null);
        if (pc.ok && Math.abs(c.s.v) < PARK.stopV) holdT += dt;
        else holdT = 0;
        if (holdT >= PARK.holdSec) completePark(pc.q);
      } else if (job === 'fetch') {
        const d = Math.hypot(c.s.x - PICKUP[0], c.s.z - PICKUP[1]);
        pickMat.color.set(d < PICKUP_R ? BAY_GREEN : 0xfff3d6);
        if (d < PICKUP_R && Math.abs(c.s.v) < 0.4) holdT += dt;
        else holdT = 0;
        if (holdT >= 0.3 && fetch?.ready) completeFetch();
      }
    };

    // ── 互动点：接钥匙（落客点车门边的会员）、开车（要取的车）──
    let opN = 0;
    play.add({
      id: 'valet-keys',
      at: () => {
        const m = waitingMember();
        return m ? head(m) : new THREE.Vector3(0, -50, 0);
      },
      radius: 1.7,
      priority: 3,
      label: () => (mg.state === 'playing' && !driving && waitingMember() ? '接钥匙' : ''),
      canUse: () => mg.state === 'playing' && !driving && !!waitingMember(),
      onUse: (p) => {
        const c = atDropoff();
        const m = c?.member;
        if (!c || !m) return;
        const r = round;
        const op = ++opN;
        p.busy({
          name: 'keys',
          dur: 0.55,
          pose: 'pickup',
          face: head(m),
          mid: () => {
            if (r !== round || mg.state !== 'playing' || op !== opN) return;
            patAtKey = c.pat / c.patMax;
            angryAtKey = c.angry;
            play.say(m.obj, c.angry ? '总算来了…' : '谢谢，交给你了！', 1.4);
            c.member = null;
            walk(m, [[63.6, 1.4], GATE_IN], () => dropMember(m));
          },
          end: () => {
            if (r !== round || mg.state !== 'playing' || op !== opN) return;
            enterCar(c, 'park');
          },
        });
      },
    });
    const fetchAt = new THREE.Vector3();
    play.add({
      id: 'valet-fetch',
      at: () => {
        const c = fetch?.car;
        if (c?.role !== 'parked') return fetchAt.set(0, -50, 0);
        return fetchAt.set(c.s.x, mg.groundAt(c.s.x, c.s.z) + 1.2, c.s.z);
      },
      radius: 3.0,
      priority: 2,
      stand: () => (fetch ? exitSpot(fetch.car) : null),
      label: () => (mg.state === 'playing' && !driving && fetch?.car.role === 'parked' ? '开车' : ''),
      canUse: () => mg.state === 'playing' && !driving && fetch?.car.role === 'parked',
      onUse: (p) => {
        const f = fetch;
        if (!f) return;
        const r = round;
        p.busy({
          name: 'door',
          dur: 0.4,
          pose: 'pickup',
          face: new THREE.Vector3(f.car.s.x, 1, f.car.s.z),
          end: () => {
            if (r !== round || mg.state !== 'playing' || fetch !== f) return;
            enterCar(f.car, 'fetch');
            pickRing.visible = true;
          },
        });
      },
    });

    // ── 标记：派的车位、取车点、要取的车、等着接钥匙的会员 ──
    const bayTop = new THREE.Vector3();
    mg.marker(
      'bay',
      () => {
        const b = driving && job === 'park' ? driving.bay : null;
        if (!b) return null;
        return bayTop.set(b.cx, mg.groundAt(b.cx, b.cz) + 0.4, b.cz);
      },
      { label: '停这里' },
    );
    const pkTop = new THREE.Vector3(PICKUP[0], 0.6, PICKUP[1]);
    mg.marker('pickup', () => (driving && job === 'fetch' ? pkTop : null), { label: '交车', color: '#fff3d6' });
    const fTop = new THREE.Vector3();
    mg.marker(
      'fetch',
      () => {
        const c = fetch?.car;
        if (!c || driving || c.role !== 'parked') return null;
        return fTop.set(c.s.x, mg.groundAt(c.s.x, c.s.z) + 1.9, c.s.z);
      },
      { label: '取车', color: '#8fe36a' },
    );
    const kTop = new THREE.Vector3();
    mg.marker(
      'keys',
      () => {
        const m = waitingMember();
        if (!m || driving) return null;
        if (Math.hypot(D.position.x - m.x, D.position.z - m.z) < 2.2) return null;
        return kTop.set(m.x, mg.groundAt(m.x, m.z) + 2.3, m.z);
      },
      { label: '接钥匙' },
    );

    // ── 机器人 ──
    let botOn = params.get('bot') === '1';
    let botFollow: Follow = newFollow();
    let botUse = 0;
    let botTap = 0;
    const botStep = (dt: number) => {
      if (!botOn || mg.state !== 'playing') return;
      if (driving) {
        ui.forceStick(followStick(route, botFollow, driving.s, dt));
        return;
      }
      ui.forceStick(null);
      if (play.isBusy()) return;
      if (botUse > 0) {
        botUse = 0;
        play.setUse(false);
        return;
      }
      // 先取车（会员等不了太久，或者落客点没人），再接钥匙
      const f = fetch;
      const m = waitingMember();
      let goal: V2 | null = null;
      let use = false;
      const fetchable = f && f.car.role === 'parked';
      if (fetchable && (!m || f.pat / f.patMax < 0.6)) {
        const [sx, sz] = exitSpot(f.car);
        goal = [sx, sz];
        use = Math.hypot(D.position.x - f.car.s.x, D.position.z - f.car.s.z) < 2.9;
      } else if (m) {
        goal = [m.x - 0.2, m.z + 0.7];
        use = Math.hypot(D.position.x - m.x, D.position.z - m.z) < 1.6;
      } else goal = [START[0] + 1.2, START[1] + 0.8];
      if (use) {
        play.setStick(0, 0);
        play.setUse(true);
        botUse = 1;
        return;
      }
      botTap -= dt;
      if (goal && (botTap <= 0 || play.pathLeft() === 0)) {
        if (Math.hypot(D.position.x - goal[0], D.position.z - goal[1]) > 0.4) play.tapWorld(goal[0], goal[1]);
        botTap = 1.0;
      }
    };

    // ── 每步：车、人、排队、取车 ──
    const v3 = new THREE.Vector3();
    mg.onStep((dt) => {
      for (const m of members.slice()) stepMember(m, dt);
      for (const c of cars) if (c.own) ud(c).update?.(dt);
    });

    const stepWorld = (dt: number) => {
      // 来车
      if (mg.elapsed >= nextArrival) {
        if (spawnArrival()) nextArrival = mg.elapsed + arrivalGap(arrivals - 1);
        else nextArrival = mg.elapsed + 2;
      }
      // 排队往前挪：前一个位置空了、那块地方没车
      const q = queueCars();
      for (const c of q) {
        if (c.slot === 0 || c.path) continue;
        const want = c.slot - 1;
        if (q.some((o) => o !== c && o.slot === want)) continue;
        const spot = QUEUE[want];
        const box = carBox({ x: spot[0], z: spot[1], rot: WEST }, c.kind, 0.3);
        if (cars.some((o) => o !== c && o.obj.visible && boxPen(box, boxOf(o)) > 0)) continue;
        if (want === 0 && D.visible && pointDepth({ ...box, hw: box.hw + 0.2 }, D.position.x, D.position.z) > 0)
          continue;
        c.slot = want;
        c.arrived = false;
        c.path = [[spot[0], spot[1]]];
        c.pi = 0;
      }
      // 自动驾驶的车
      for (const c of cars.slice()) {
        if (c.role !== 'queue' && c.role !== 'leave') continue;
        autoStep(c, dt);
        animCar(c, dt, true);
        if (c.role === 'queue' && !c.path && !c.arrived) {
          c.arrived = true;
          if (c.slot === 0) memberOut(c);
        }
        if (c.role === 'leave' && c.s.x > GONE_X) dropCar(c);
      }
      // 耐心
      for (const c of q) {
        if (!c.arrived && c.slot === QUEUE.length - 1 && c.s.x > QUEUE[QUEUE.length - 1][0] + 4) continue;
        c.pat = Math.max(0, c.pat - dt);
        if (c.pat <= 0 && !c.angry) {
          c.angry = true;
          tally.angry++;
          mg.addScore(-ANGRY_COST, [c.s.x, c.s.z], { text: `-${ANGRY_COST} 等急了`, color: 'red', big: true });
          const who = c.member?.obj ?? new THREE.Vector3(c.s.x, mg.groundAt(c.s.x, c.s.z) + 1.8, c.s.z);
          play.say(who, '还要等多久？！', 2.2);
          mg.toast('会员等急了：这辆小费减半', 1.8);
        }
      }
      // 取车
      if (!fetch && mg.elapsed >= nextFetch) {
        const cand = cars.filter((c) => c.role === 'parked' && mg.elapsed - c.parkedAt >= FETCH.minAge);
        if (cand.length && mg.timeLeft > 22) {
          const car = cand[Math.floor(rngFetch() * cand.length)];
          const m = newMember(GATE_IN[0], GATE_IN[1], P / 2);
          const f = { car, m, pat: FETCH.patience, patMax: FETCH.patience, ready: false };
          fetch = f;
          walk(m, [[63.6, 3.2], [70, 3.9], PICKUP_STAND], () => {
            f.ready = true;
            m.yaw = 0;
          });
          play.say(m.obj, '我的车，麻烦开出来！', 2.4);
          mg.toast('有会员要取车 → 找绿箭头那辆，开到车道南沿', 2.6);
        } else nextFetch = mg.elapsed + 3;
      }
      if (fetch) {
        const f = fetch;
        f.pat = Math.max(0, f.pat - dt);
        if (f.pat <= 0 && f.car.role === 'parked') {
          tally.angry++;
          mg.addScore(-FETCH_ANGRY_COST, [f.m.x, f.m.z], {
            text: `-${FETCH_ANGRY_COST} 等不及了`,
            color: 'red',
            big: true,
          });
          play.say(f.m.obj, '算了，我自己去拿！', 2.2);
          const m = f.m;
          walk(m, [[70, 3.9], [63.6, 3.2], GATE_IN], () => dropMember(m));
          fetch = null;
          nextFetch = mg.elapsed + FETCH.gap;
        }
      }
    };

    // 耐心条（画面外的贴边）
    const W = () => innerWidth;
    const H = () => innerHeight;
    const barList: PatBar[] = [];
    const frameBars = () => {
      barList.length = 0;
      if (mg.state !== 'playing') {
        ui.bars(barList);
        return;
      }
      const put = (id: number, p: THREE.Vector3, frac: number, angry: boolean, label?: string) => {
        const s = mg.project(p);
        const m = 28;
        const x = THREE.MathUtils.clamp(s.x, m, W() - m);
        const y = THREE.MathUtils.clamp(s.y, 150, H() - 120);
        barList.push({ id, x, y, frac, angry, label, edge: x !== s.x || y !== s.y });
      };
      for (const c of queueCars()) {
        if (!c.arrived && c.pat >= c.patMax) continue;
        put(
          c.id,
          v3.set(c.s.x, mg.groundAt(c.s.x, c.s.z) + 2.0, c.s.z),
          c.pat / c.patMax,
          c.angry,
          c.slot === 0 ? '' : `排队 ${c.slot}`,
        );
      }
      if (fetch) {
        const m = fetch.m;
        put(-1, new THREE.Vector3(m.x, mg.groundAt(m.x, m.z) + 2.5, m.z), fetch.pat / fetch.patMax, false, '取车');
      }
      ui.bars(barList);
    };

    const showStats = () => {
      mg.stat('parked', '停好', tally.parked);
      const n = queueCars().length;
      mg.stat('queue', '排队', n, n >= 3 ? 'warn' : null);
    };

    const clearAll = () => {
      for (const c of cars.slice()) if (c.role !== 'static') dropCar(c);
      for (const m of members.slice()) dropMember(m);
    };

    Object.assign(window, {
      __valet: {
        bot: (on: boolean) => {
          botOn = on;
          if (!on) ui.forceStick(null);
        },
        drive: (x: number, y: number) => ui.forceStick({ x, y }),
        release: () => ui.forceStick(null),
        driving: () => (driving ? { ...driving.s, bay: driving.bay?.id, job } : null),
        route: () => route,
      },
    });

    return {
      reset() {
        round++;
        opN++;
        clearAll();
        // 上一局开着的车已经收掉了：界面、地上的提示复位（总监壳已经放回开局的地方）
        driving = null;
        route = [];
        job = null;
        fetch = null;
        arrivals = 0;
        rngCar = carRng();
        rngFetch = mg.rng(`fetch:${mg.round}`);
        Object.assign(tally, { parked: 0, fetched: 0, perfect: 0, bumps: 0, damage: 0, angry: 0, tips: 0 });
        nextFetch = FETCH.first;
        bumpLog.length = 0;
        lastBump = -9;
        firstDrive = true;
        D.visible = true;
        // 开局：第一辆已经停在落客点、会员在车门边等着
        spawnArrival();
        const c = cars[cars.length - 1];
        c.s = { ...c.s, x: QUEUE[0][0], z: QUEUE[0][1], v: 0 };
        c.path = null;
        c.arrived = true;
        placeCar(c);
        memberOut(c);
        ud(c).setDoor?.(true, 'left', true);
        nextArrival = 9;
        bayFx.set(null);
        dots.set(null, mg.groundAt);
        pickRing.visible = false;
        ui.setDriving(false);
        ui.gauge(null);
        ui.bars([]);
        showStats();
      },
      start() {
        const m = waitingMember();
        if (m) play.say(m.obj, '总监，帮我停一下车！', 2.4);
      },
      step(dt) {
        stepWorld(dt);
        driveStep(dt);
        botStep(dt);
        showStats();
      },
      frame() {
        frameBars();
        bayFx.pulse(mg.t);
      },
      finish() {
        if (driving) leaveCar();
        ui.setDriving(false);
        ui.gauge(null);
        ui.bars([]);
        return settle(tally);
      },
      debug: () => ({
        driving: driving
          ? {
              x: +driving.s.x.toFixed(2),
              z: +driving.s.z.toFixed(2),
              rot: +driving.s.rot.toFixed(2),
              v: +driving.s.v.toFixed(2),
              bay: driving.bay?.id,
              job,
            }
          : null,
        queue: queueCars().map((c) => ({
          slot: c.slot,
          arrived: c.arrived,
          pat: +c.pat.toFixed(1),
          x: +c.s.x.toFixed(1),
        })),
        parkedCars: cars.filter((c) => c.role === 'parked').map((c) => c.bay?.id),
        fetch: fetch ? { car: fetch.car.bay?.id, pat: +fetch.pat.toFixed(1), ready: fetch.ready } : null,
        tally: { ...tally },
        bumpLog,
        routeI,
        routeN: route.length,
      }),
    };
  },
});

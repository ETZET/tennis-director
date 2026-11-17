// valley 的车：一辆球车、一辆汽车（白模）。走到车旁边"上车"，按住画面开车（同走路的手势：车往手指那边开，手指离车越远越快；
// 车的手感在 clubsite/play/drive.ts：惯性、转弯半径、倒车、侧滑），慢下来"下车"。开车时镜头拉远、往前看（看得到前面的路），总监藏起来（坐在车里）。
// 演出（只读 play.state().drive）：车身拐弯往外侧倾、刹车点头、加速抬头、沙地上颠、后轮扬沙、撞上东西震手机。
// 汽车开下路不是撞墙：沙地上极速和抓地打折（DRIVE.car.offroad），路是快的。
// 路障（锁着的区域的路口）也在这里：按锁的状态重摆。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { DriveSpec, Play } from '../clubsite/play';
import { box } from '../clubsite/render/geo';
import { along, ROADS, regionAt } from './layout';
import type { Mode, ValleyNav } from './nav';
import type { MapCtx, PalKey } from './reuse';
import { inClubBox, inFloor, onRoad } from './terrain';

/**
 * 两辆车的手感（drive.ts 的参数）。offroad：路以外（沙地、草）极速 / 抓地乘多少；rear：后轮（扬沙的地方，车身坐标）。
 * 球车：慢、拐得急（半径 2.4 米）、抓地好、哪儿都能开；汽车：快、起步要 3 秒多、拐弯半径 4.5 米、急弯会甩一点尾，沙地上慢一半多。
 */
export const DRIVE = {
  cart: {
    speed: 7.5,
    turn: 2.6,
    radius: 2.4,
    accel: 4.5,
    grip: 13,
    reverse: 3,
    reach: 0.9,
    offroad: 0.8,
    zoom: 1.45,
    rear: [0.58, -0.75] as const,
    name: '球车',
  },
  car: {
    speed: 17,
    turn: 2.0,
    radius: 4.5,
    accel: 7.5,
    brake: 20,
    coast: 5,
    grip: 9,
    reverse: 5,
    reach: 2.1,
    offroad: 0.4,
    zoom: 2.1,
    rear: [0.92, -1.55] as const,
    name: '汽车',
  },
} as const;

const geo = (parts: [THREE.BufferGeometry, PalKey][], mat: (k: PalKey) => THREE.Material) => {
  const g = new THREE.Group();
  const by = new Map<PalKey, THREE.BufferGeometry[]>();
  for (const [p, k] of parts) {
    const n = p.index ? p.toNonIndexed() : p;
    for (const a of Object.keys(n.attributes)) if (a !== 'position' && a !== 'normal') n.deleteAttribute(a);
    by.set(k, [...(by.get(k) ?? []), n]);
  }
  for (const [k, list] of by) {
    const m = new THREE.Mesh(mergeGeometries(list), mat(k));
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  }
  return g;
};
const wheel = (x: number, z: number, r: number, w = 0.3) =>
  new THREE.CylinderGeometry(r, r, w, 10).rotateZ(Math.PI / 2).translate(x, r, z);
/** 转过的盒子（绕 x 轴斜 tilt）：中心 (x, y, z) */
const tbox = (w: number, h: number, d: number, x: number, y: number, z: number, tilt: number) =>
  new THREE.BoxGeometry(w, h, d).rotateX(tilt).translate(x, y, z);

/**
 * 球车（车头朝 +z，同总监的 yaw 0）：白车身 + 前脸 + 青色座椅和靠背 + 四根 2 纹素以上的顶棚柱 + 条纹顶棚 + 车尾的球包架（两只包）。
 * 原来柱子 0.08 米（球车镜头下 1 纹素多一点，时有时无）、车身就是一块白砖。
 */
function cartModel(mat: (k: PalKey) => THREE.Material) {
  return geo(
    [
      [box(1.25, 0.42, 2.3, 0, 0.24, 0), 'clothWhite'],
      [box(1.2, 0.36, 0.55, 0, 0.66, 0.88), 'clothWhite'], // 前脸
      [box(1.0, 0.06, 0.2, 0, 0.66, 1.17), 'signPaint'], // 前灯条
      [box(1.15, 0.18, 0.68, 0, 0.66, -0.2), 'clothTeal'], // 座垫
      [box(1.15, 0.55, 0.14, 0, 0.84, -0.56), 'clothTeal'], // 靠背
      [box(0.12, 1.36, 0.12, -0.56, 0.66, 0.62), 'metal'],
      [box(0.12, 1.36, 0.12, 0.56, 0.66, 0.62), 'metal'],
      [box(0.12, 1.36, 0.12, -0.56, 0.66, -0.66), 'metal'],
      [box(0.12, 1.36, 0.12, 0.56, 0.66, -0.66), 'metal'],
      [box(1.4, 0.12, 2.0, 0, 2.02, -0.02), 'canvasStripe'], // 顶棚
      [box(0.95, 0.12, 0.42, 0, 0.66, -1.02), 'metal'], // 球包架
      [new THREE.CylinderGeometry(0.16, 0.16, 0.95, 8).translate(-0.24, 0.78 + 0.475, -1.04), 'clothRed'],
      [new THREE.CylinderGeometry(0.16, 0.16, 0.85, 8).translate(0.24, 0.78 + 0.425, -1.04), 'clothBlue'],
      [wheel(-0.58, 0.78, 0.23, 0.2), 'ironwork'],
      [wheel(0.58, 0.78, 0.23, 0.2), 'ironwork'],
      [wheel(-0.58, -0.75, 0.23, 0.2), 'ironwork'],
      [wheel(0.58, -0.75, 0.23, 0.2), 'ironwork'],
    ],
    mat,
  );
}
/**
 * 六十年代的长车身敞篷（棕榈泉的老车）：红车身 + 尾鳍 + 镀铬保险杠 + 白色前后排座椅 + 斜的挡风玻璃 + 深色轮胎。
 * 原来"腰线"是一整块盖在车顶的白板（从上往下看整辆车是白的）、轮子是锈红色。
 */
function carModel(mat: (k: PalKey) => THREE.Material) {
  return geo(
    [
      [box(2.0, 0.55, 4.8, 0, 0.3, 0), 'carRed'],
      [box(1.94, 0.1, 1.5, 0, 0.85, 1.62), 'carRed'], // 引擎盖
      [box(1.94, 0.1, 1.1, 0, 0.85, -1.84), 'carRed'], // 后备箱盖
      [box(0.16, 0.36, 1.3, -0.92, 0.85, -1.75), 'carRed'], // 尾鳍
      [box(0.16, 0.36, 1.3, 0.92, 0.85, -1.75), 'carRed'],
      [box(0.14, 0.12, 2.1, -0.93, 0.85, -0.2), 'carRed'], // 两边的车门沿
      [box(0.14, 0.12, 2.1, 0.93, 0.85, -0.2), 'carRed'],
      [box(1.72, 0.04, 2.1, 0, 0.82, -0.2), 'ironwork'], // 车厢地板（敞篷里面是深色的）
      [box(1.6, 0.26, 0.62, 0, 0.86, 0.32), 'clothWhite'], // 前排
      [box(1.6, 0.42, 0.14, 0, 0.86, 0.0), 'clothWhite'],
      [box(1.6, 0.26, 0.6, 0, 0.86, -0.82), 'clothWhite'], // 后排
      [box(1.6, 0.42, 0.14, 0, 0.86, -1.12), 'clothWhite'],
      [tbox(1.76, 0.5, 0.06, 0, 1.12, 0.86, -0.4), 'silverBlue'], // 挡风玻璃
      [box(2.06, 0.18, 0.22, 0, 0.32, 2.45), 'silverBlue'], // 前后保险杠（镀铬）
      [box(2.06, 0.18, 0.22, 0, 0.32, -2.45), 'silverBlue'],
      [box(0.36, 0.2, 0.06, -0.66, 0.6, 2.41), 'signPaint'], // 前灯
      [box(0.36, 0.2, 0.06, 0.66, 0.6, 2.41), 'signPaint'],
      [box(0.2, 0.22, 0.06, -0.84, 0.75, -2.41), 'clothRed'], // 尾灯
      [box(0.2, 0.22, 0.06, 0.84, 0.75, -2.41), 'clothRed'],
      [wheel(-0.92, 1.5, 0.36, 0.3), 'ironwork'],
      [wheel(0.92, 1.5, 0.36, 0.3), 'ironwork'],
      [wheel(-0.92, -1.55, 0.36, 0.3), 'ironwork'],
      [wheel(0.92, -1.55, 0.36, 0.3), 'ironwork'],
    ],
    mat,
  );
}

export interface Vehicles {
  /** 现在开着的（没开 = null） */
  driving(): Mode;
  /** 每步：车跟着总监、镜头缩放往目标靠 */
  step(dt: number): void;
  /** 锁的状态变了：重摆路障 */
  barriers(locked: ReadonlySet<string>): void;
  /** 车的位置（小地图） */
  where(): { kind: 'cart' | 'car'; x: number; z: number }[];
}

export function mountVehicles(o: {
  scene: THREE.Scene;
  play: Play;
  director: THREE.Object3D;
  ctx: MapCtx;
  vnav: ValleyNav;
  /** 挡路表要重算（开车 / 下车：俱乐部的门开关） */
  refreshBlocked(): void;
}): Vehicles {
  const { scene, play, director: D, ctx, vnav } = o;
  const mats = new Map<PalKey, THREE.Material>();
  const mat = (k: PalKey) => {
    let m = mats.get(k);
    if (!m) {
      m = ctx.mat(k);
      mats.set(k, m);
    }
    return m;
  };
  // obj：位置和朝向（跟着总监）；body：车身（侧倾、点头、颠，绕车底中心）
  const rigged = (model: THREE.Group) => {
    const obj = new THREE.Group();
    obj.add(model);
    return { obj, body: model };
  };
  const cars = {
    cart: { ...rigged(cartModel(mat)), kind: 'cart' as const },
    car: { ...rigged(carModel(mat)), kind: 'car' as const },
  };
  // 停在大门外车道北边（clubpark 的停车场东头外面）
  cars.cart.obj.position.set(100, 0, -7.5);
  cars.cart.obj.rotation.y = Math.PI / 2;
  cars.car.obj.position.set(110, 0, -8);
  cars.car.obj.rotation.y = Math.PI / 2;
  scene.add(cars.cart.obj, cars.car.obj);

  let mode: Mode = 'walk';
  let zoomK = 1;
  /** (x, z) 附近 12 米以内最近的、四周 1.5 米都能站的点（按现在的 vnav.mode：别停在路边上一开就卡）；都不行就原地 */
  const roomy = (x: number, z: number) =>
    [
      [0, 0],
      [1.5, 0],
      [-1.5, 0],
      [0, 1.5],
      [0, -1.5],
    ].every(([dx, dz]) => play.nav.standAt(x + dx, z + dz) !== null);
  const nearestStand = (x: number, z: number): [number, number] => {
    if (roomy(x, z)) return [x, z];
    for (let r = 0.5; r <= 12; r += 0.5)
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        const p: [number, number] = [x + Math.cos(a) * r, z + Math.sin(a) * r];
        if (roomy(p[0], p[1])) return p;
      }
    return [x, z];
  };
  for (const c of Object.values(cars)) {
    play.add({
      id: `valley:board:${c.kind}`,
      at: () => c.obj.position.clone().setY(0.6),
      radius: c.kind === 'car' ? 3 : 2.4,
      priority: 5,
      label: () => (mode === 'walk' ? `开${DRIVE[c.kind].name}` : ''),
      canUse: () => mode === 'walk' && !play.held(),
      autoUse: false,
      onUse: () => {
        mode = c.kind;
        vnav.mode = c.kind;
        play.drive(driveSpec(c.kind));
        c.obj.userData.followsDirector = true;
        o.refreshBlocked();
        // 上车：总监挪到车的位置、朝车头，藏起来。车停的地方开车站不住（汽车停在路边、路外）就挪到最近的能开的地方
        const at = nearestStand(c.obj.position.x, c.obj.position.z);
        c.obj.position.set(at[0], 0, at[1]);
        play.teleport(at[0], at[1], c.obj.rotation.y);
        D.visible = false;
        play.toast('按住画面往手指那边开 · 按在车后面倒车', 3);
      },
    });
  }
  play.add({
    id: 'valley:alight',
    at: () => D.position.clone(),
    radius: 99,
    priority: 50,
    noMark: true,
    label: () => (mode === 'walk' ? '' : '下车'),
    // 慢下来（< 2 米/秒）就能下：不用等车完全停死
    canUse: (s) => mode !== 'walk' && s.speed < 2,
    autoUse: false,
    onUse: () => {
      const c = cars[mode as 'cart' | 'car'];
      c.obj.userData.followsDirector = false;
      // 下车：站到车左边（能站就站，不能站就车后面）
      const yaw = c.obj.rotation.y;
      const side: [number, number] = [c.obj.position.x + Math.cos(yaw) * 1.8, c.obj.position.z - Math.sin(yaw) * 1.8];
      const back: [number, number] = [c.obj.position.x - Math.sin(yaw) * 3.4, c.obj.position.z - Math.cos(yaw) * 3.4];
      mode = 'walk';
      vnav.mode = 'walk';
      play.drive(null);
      o.refreshBlocked();
      const ok = (p: [number, number]) => play.nav.standAt(p[0], p[1]) !== null;
      const at = ok(side) ? side : ok(back) ? back : side;
      play.teleport(at[0], at[1], yaw);
      D.visible = true;
    },
  });

  const driveSpec = (kind: 'cart' | 'car'): DriveSpec => {
    const d = DRIVE[kind];
    return {
      ...d,
      // 路（含俱乐部里的停车场、车道）= 1，别的地方打折
      ground: (x, z) => (inClubBox(x, z) || onRoad(x, z, 0.2) ? 1 : d.offroad),
    };
  };

  // ── 扬沙：后轮后面冒的小土块（池子轮着用）──
  const DUST_N = 28;
  const DUST_LIFE = 0.9;
  const dustGeo = new THREE.BoxGeometry(0.7, 0.55, 0.7);
  const dust = Array.from({ length: DUST_N }, () => {
    const m = new THREE.Mesh(dustGeo, mat('sand'));
    m.visible = false;
    m.userData.age = DUST_LIFE;
    scene.add(m);
    return m;
  });
  let dustNext = 0;
  let dustT = 0;
  let puffs = 0;
  const puff = (x: number, z: number, vx: number, vz: number) => {
    const m = dust[dustNext];
    dustNext = (dustNext + 1) % DUST_N;
    // 不用 Math.random：按序号的确定性抖动（只管画面）
    const j = Math.sin(++puffs * 12.9898) * 43758.5453;
    const r = j - Math.floor(j);
    m.position.set(x + (r - 0.5) * 0.5, 0.15, z + (r - 0.5) * 0.4);
    m.rotation.y = r * Math.PI;
    m.userData.age = 0;
    m.userData.vx = vx;
    m.userData.vz = vz;
    m.visible = true;
  };
  const stepDust = (dt: number) => {
    for (const m of dust) {
      if (!m.visible) continue;
      const a = (m.userData.age += dt);
      if (a >= DUST_LIFE) {
        m.visible = false;
        continue;
      }
      const k = a / DUST_LIFE;
      m.position.x += m.userData.vx * dt;
      m.position.z += m.userData.vz * dt;
      m.position.y += dt * 0.9;
      // 先鼓起来再缩没
      const sc = k < 0.3 ? 0.6 + (k / 0.3) * 0.8 : 1.4 * (1 - (k - 0.3) / 0.7);
      m.scale.setScalar(Math.max(0.01, sc));
    }
  };

  // ── 车身的演出 ──
  let simT = 0;
  let buzzT = 0;
  let jolt = 0;
  const ease = (cur: number, to: number, k: number) => cur + (to - cur) * k;
  const stepBody = (dt: number) => {
    simT += dt;
    const ds = play.state().drive;
    for (const c of Object.values(cars)) {
      const b = c.body;
      const k = 1 - Math.exp(-dt * 9);
      if (mode !== c.kind || !ds) {
        b.rotation.x = ease(b.rotation.x, 0, k);
        b.rotation.z = ease(b.rotation.z, 0, k);
        b.position.y = ease(b.position.y, 0, k);
        continue;
      }
      // 撞上：震一下手机（Android；iOS Safari 没有 vibrate），车身往前一磕
      if (ds.hit > 2.5) {
        jolt = Math.min(0.14, ds.hit * 0.012);
        if (simT - buzzT > 0.35) {
          buzzT = simT;
          navigator.vibrate?.(Math.min(60, Math.round(ds.hit * 5)));
        }
      }
      jolt *= Math.exp(-dt * 7);
      // 拐弯往外侧倾（往左拐 yawRate > 0：车身往右手倒 = 绕 z 正转）；刹车点头、加速抬头（绕 x 正转 = 车头往下）
      const roll = THREE.MathUtils.clamp(ds.v * ds.yawRate * 0.005, -0.09, 0.09);
      const pitch = THREE.MathUtils.clamp(-ds.accel * 0.005, -0.05, 0.08) + jolt;
      b.rotation.z = ease(b.rotation.z, roll, k);
      b.rotation.x = ease(b.rotation.x, pitch, k);
      // 沙地上颠（越快颠得越密）
      const sp = Math.hypot(ds.vx, ds.vz);
      const rough = (1 - ds.ground) * Math.min(1, sp / 4);
      b.position.y = rough * 0.07 * Math.abs(Math.sin(simT * (9 + sp * 0.8)));
      // 扬沙：沙地上开得快，或者侧滑得厉害
      const slip = Math.abs(ds.side);
      if ((ds.ground < 0.99 && sp > 2.5) || slip > 2.2) {
        dustT -= dt;
        if (dustT <= 0) {
          dustT = sp > 9 || slip > 3.5 ? 0.04 : 0.08;
          const [wx, wz] = DRIVE[c.kind].rear;
          const yaw = c.obj.rotation.y;
          const cs = Math.cos(yaw);
          const sn = Math.sin(yaw);
          for (const sx of [-wx, wx]) {
            // 车身坐标 (sx, wz) → 世界（three 绕 y 转：x' = x cos + z sin，z' = −x sin + z cos）
            const x = c.obj.position.x + sx * cs + wz * sn;
            const z = c.obj.position.z - sx * sn + wz * cs;
            puff(x, z, -ds.vx * 0.15, -ds.vz * 0.15);
          }
        }
      }
    }
    stepDust(dt);
  };

  // ── 路障 ──
  const barrierRoot = new THREE.Group();
  barrierRoot.name = 'valley:barriers';
  scene.add(barrierRoot);
  /**
   * 路障：一排两米宽的 A 字木马（两条腿、上下两道条纹横杆），中间留缝，横着拦满路面；正中后面一块"封路"牌立在自己的两条腿上。
   * 原来是路两头两根杆子拉一整条 14 米的横杆（中间没有支撑），牌子悬在横杆上面 0.1 米、底下什么都没有。
   */
  const barrierGeo = (w: number) => {
    const g = new THREE.Group();
    const parts: [THREE.BufferGeometry, PalKey][] = [];
    const n = Math.max(1, Math.round((w + 0.4) / 2.5));
    const unit = Math.min(2.3, (w + 0.4) / n - 0.3);
    for (let i = 0; i < n; i++) {
      const cx = -w / 2 - 0.2 + ((i + 0.5) * (w + 0.4)) / n;
      for (const s of [-1, 1]) {
        const lx = cx + s * (unit / 2 - 0.15);
        // A 字腿：前后两根斜杆 + 一条脚
        parts.push([tbox(0.1, 1.05, 0.1, lx, 0.5, 0.17, 0.32), 'woodWeathered']);
        parts.push([tbox(0.1, 1.05, 0.1, lx, 0.5, -0.17, -0.32), 'woodWeathered']);
        parts.push([box(0.12, 0.08, 0.8, lx, 0, 0), 'woodWeathered']);
      }
      // 条纹横杆：橙白相间（一节 0.55 米，≥ 6 纹素）
      const seg = Math.max(2, Math.round(unit / 0.55));
      for (let k = 0; k < seg; k++) {
        const x = cx - unit / 2 + ((k + 0.5) * unit) / seg;
        const key: PalKey = (k + i) % 2 ? 'clothWhite' : 'toolOrange';
        parts.push([box(unit / seg, 0.26, 0.08, x, 0.74, 0.06), key]);
        parts.push([box(unit / seg, 0.2, 0.08, x, 0.34, 0.06), (k + i + 1) % 2 ? 'clothWhite' : 'toolOrange']);
      }
    }
    // 牌子：在横杆后面 0.9 米，自己两条腿
    parts.push([box(0.1, 1.3, 0.1, -0.6, 0, -0.9), 'metal']);
    parts.push([box(0.1, 1.3, 0.1, 0.6, 0, -0.9), 'metal']);
    parts.push([box(1.7, 0.9, 0.08, 0, 1.25, -0.9), 'signBoard']);
    parts.push([box(1.3, 0.22, 0.1, 0, 1.6, -0.88), 'signPaint']);
    g.add(geo(parts, mat));
    return g;
  };
  const regionKey = (x: number, z: number) =>
    inClubBox(x, z) ? 'club' : inFloor(x, z) ? (regionAt(x, z)?.id ?? null) : 'mountain';

  return {
    driving: () => mode,
    step(dt) {
      if (mode !== 'walk') {
        const c = cars[mode];
        c.obj.position.set(D.position.x, D.position.y, D.position.z);
        c.obj.rotation.y = D.rotation.y;
      }
      stepBody(dt);
      // 镜头：开车拉远，走路拉回来（按每秒 1.5 倍的速度靠过去）
      const want = mode === 'walk' ? 1 : DRIVE[mode].zoom;
      if (Math.abs(want - zoomK) > 1e-3) {
        const step = Math.exp(Math.sign(want - zoomK) * Math.min(Math.abs(Math.log(want / zoomK)), dt * Math.log(1.5)));
        zoomK *= step;
        play.zoomBy(step);
      }
    },
    barriers(locked) {
      for (const c of [...barrierRoot.children]) c.removeFromParent();
      for (const r of ROADS) {
        let prev: { key: string | null; p: readonly [number, number] } | null = null;
        for (const [, p, t] of along(r.pts, 1)) {
          const key = regionKey(p[0], p[1]);
          if (prev && key !== prev.key) {
            const aL = prev.key !== null && locked.has(prev.key);
            const bL = key !== null && locked.has(key);
            if (aL !== bL) {
              // 立在开着的这一边，横着拦住路
              const at = bL ? prev.p : p;
              const b = barrierGeo(r.w + (r.kind === 'trail' ? 0.8 : 0));
              b.position.set(at[0], 0, at[1]);
              // 本地 x（栏杆的长边）对着路的法线 (−tz, tx)
              b.rotation.y = Math.atan2(-t[0], -t[1]);
              barrierRoot.add(b);
            }
          }
          prev = { key, p };
        }
      }
    },
    where: () => Object.values(cars).map((c) => ({ kind: c.kind, x: c.obj.position.x, z: c.obj.position.z })),
  };
}

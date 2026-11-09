// #6 ball-machine：发球机（青训东场，rotY −π/2 朝西出球）。本地原点 = 脚印中心的地面（y 0），出球管朝本地 +z。
// 方方的俱乐部蓝机身（一圈白腰带）+ 前面一根深色出球管 + 顶上一个敞口的绿漆球斗（白沿；球堆冒尖 = 满，见底 = 快空，
// 斗里是暗档的深色，几个球在里面也跳出来）+ 后面两个胖轮子（⌀ 0.26 ≈ 3 设计纹素）+ 一根拉杆。侧面（本地 +x，场景里朝镜头）一个小灯。
// 尺寸 0.62 × 0.95（不算冒尖的球和拉杆）× 0.85 米 ≈ 7 × 14 设计纹素。
// 变体：v0 满（80 个）· v1 快空（8 个，场景里用这个：少年站着等 → 总监要来加球）。
// userData（stage 3）：
//   setCount(n)       0..80：球斗里的球（显示成 0～45 个球，从斗底往上堆，满了冒尖）
//   count()           还剩几个
//   fire() → { from, dir } | null   出一个球：出球管往回一缩（0.2 秒弹回）、count − 1；返回出球口的世界坐标和世界方向（球从这里飞出去，
//                     飞的球用 tennis-ball 的 add / setBall 画）；没球了 → null
//   muzzle(out?)      出球口（管口中心）的世界坐标
//   muzzleDir(out?)   出球方向（世界，单位向量，略往上 8°）
//   setOn(bool) / on()  侧面的小灯（开 = 亮绿，关 = 深灰）；关着的时候 fire() 也照样出球，开关只是给人看的
//   handle()          拉杆把手的世界坐标（总监推着走时手放这里）
// 动画：userData.update(dt) 只管出球管的回弹。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ToonOpts } from '../../clubfront/toon';
import { BALL_RAMP, ballKit } from '../../clubsite/assets/tennis-ball';
import type { AssetCtx } from '../world';

const MAX = 80;
/** 斗里球的缩放（网球是 ⌀ 0.2 的放大球；斗里 ⌀ 0.16，一层 3 × 3 放得下） */
const BS = 0.8;

/** 朝镜头的竖直面：太阳在后上方 → 光往上偏、档位放宽，落中档（不是一整块暗档） */
const FACING: ToonOpts = { lightUp: 0.55, bands: [-0.4, 0.35], noShadowReceive: true };

const box = (w: number, h: number, d: number, x: number, y: number, z: number) =>
  new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z).toNonIndexed();

function clean(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const n = g.index ? g.toNonIndexed() : g;
  for (const a of Object.keys(n.attributes)) if (a !== 'position' && a !== 'normal') n.deleteAttribute(a);
  return n;
}

export function build(ctx: AssetCtx): THREE.Object3D {
  const root = new THREE.Group();
  root.name = 'ball-machine';
  const add = (geos: THREE.BufferGeometry[], mat: THREE.Material, name: string, cast = true) => {
    const m = new THREE.Mesh(mergeGeometries(geos.map(clean)), mat);
    m.name = `ball-machine:${name}`;
    ctx.mats.prepare(m, { cast, receive: false });
    root.add(m);
    return m;
  };

  // ── 机身：俱乐部蓝的方盒（y 0.1..0.52）+ 白腰带 ──
  add([box(0.56, 0.42, 0.62, 0, 0.1, -0.01)], ctx.mat('counter', { ...FACING, edge: 0.5, convex: 0.35 }), 'body');
  add([box(0.58, 0.12, 0.64, 0, 0.36, -0.01)], ctx.mat('clothWhite', { ...FACING, edge: 0.4, convex: 0.3 }), 'band');

  // ── 轮子（后）、两只小脚（前）、轮毂 ──
  const wheel = (x: number) =>
    new THREE.CylinderGeometry(0.13, 0.13, 0.08, 12).rotateZ(Math.PI / 2).translate(x, 0.13, -0.24);
  add(
    [wheel(0.33), wheel(-0.33), box(0.1, 0.1, 0.1, 0.2, 0, 0.24), box(0.1, 0.1, 0.1, -0.2, 0, 0.24)],
    ctx.mat('ironwork', { lightUp: 0.4, edge: 0.4, convex: 0.3, noShadowReceive: true }),
    'wheels',
  );
  add(
    [box(0.03, 0.09, 0.09, 0.385, 0.085, -0.24), box(0.03, 0.09, 0.09, -0.385, 0.085, -0.24)],
    ctx.mat('metal', { edge: 0.2, convex: 0, noShadowReceive: true }),
    'hubs',
    false,
  );

  // ── 球斗：上大下小的方漏斗（外面绿漆，里面深色），顶上一圈白沿 ──
  const funnel = (rt: number, rb: number) =>
    new THREE.CylinderGeometry(rt, rb, 0.4, 4, 1, true).rotateY(Math.PI / 4).translate(0, 0.52 + 0.2, -0.02);
  const S2 = Math.SQRT2;
  add(
    [funnel((0.66 / 2) * S2, (0.52 / 2) * S2)],
    ctx.mat('metal', { ...FACING, edge: 0.45, convex: 0.3, side: THREE.FrontSide }),
    'hopper',
  );
  const inner = add(
    [funnel((0.6 / 2) * S2, (0.46 / 2) * S2), box(0.46, 0.02, 0.46, 0, 0.53, -0.02)],
    ctx.mat('ironwork', { edge: 0.1, convex: 0, bands: [2, 3], side: THREE.DoubleSide, noShadowReceive: true }),
    'hopper-inside',
    false,
  );
  inner.renderOrder = -1;
  const rim: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    rim.push(box(0.7, 0.05, 0.06, 0, 0.9, -0.02 + s * 0.32));
    rim.push(box(0.06, 0.05, 0.58, s * 0.32, 0.9, -0.02));
  }
  add(rim, ctx.mat('clothWhite', { edge: 0.5, convex: 0.4, noShadowReceive: true }), 'rim', false);

  // ── 拉杆（后面，往后上斜）+ 把手横杠 ──
  const rod = new THREE.BoxGeometry(0.09, 0.56, 0.09).rotateX(-0.42).translate(0, 0.66, -0.43);
  const grip = new THREE.CylinderGeometry(0.045, 0.045, 0.34, 8).rotateZ(Math.PI / 2).translate(0, 0.93, -0.55);
  add([rod, grip], ctx.mat('ironwork', { lightUp: 0.4, edge: 0.4, convex: 0.3, noShadowReceive: true }), 'handle');

  // ── 出球管（前面，可以往回缩）+ 管口的暗圈 ──
  const muzzle = new THREE.Group();
  muzzle.name = 'ball-machine:muzzle';
  muzzle.position.set(0, 0.33, 0.3);
  const tube = new THREE.Mesh(
    clean(new THREE.CylinderGeometry(0.09, 0.1, 0.24, 10).rotateX(Math.PI / 2).translate(0, 0, 0.12)),
    ctx.mat('ironwork', { lightUp: 0.5, bands: [-0.3, 0.35], edge: 0.45, convex: 0.35, noShadowReceive: true }),
  );
  ctx.mats.prepare(tube, { cast: true, receive: false });
  muzzle.add(tube);
  root.add(muzzle);
  const tip = new THREE.Vector3(0, 0.33, 0.56);
  const dirLocal = new THREE.Vector3(0, Math.sin((8 * Math.PI) / 180), Math.cos((8 * Math.PI) / 180));

  // ── 侧面的小灯（本地 +x 面，靠前）──
  const lampOn = ctx.mats.toon(0xffffff, {
    ramp: [0x9cff70, 0x6cea5e, 0x3cb062],
    edge: 0,
    convex: 0,
    bands: [-2, -1.5],
    noShadowReceive: true,
  });
  const lampOff = ctx.mats.toon(0xffffff, {
    ramp: [0x5a586c, 0x46445a, 0x34324a],
    edge: 0,
    convex: 0,
    bands: [-2, -1.5],
    noShadowReceive: true,
  });
  const lamp = new THREE.Mesh(clean(box(0.03, 0.1, 0.1, 0.29, 0.2, 0.16)), lampOff);
  lamp.name = 'ball-machine:lamp';
  root.add(lamp);
  let on = false;
  const setOn = (v: boolean) => {
    on = v;
    lamp.material = v ? lampOn : lampOff;
  };

  // ── 斗里的球：45 个位置，从斗底往上（最后两层冒出斗沿 = 满）──
  const rnd = ctx.rng('ball-machine:heap');
  const slots: THREE.Vector3[] = [];
  const layer = (y: number, xs: number[], jitter = 0.02) => {
    for (const z of xs)
      for (const x of xs)
        slots.push(new THREE.Vector3(x + (rnd() - 0.5) * jitter, y, z - 0.02 + (rnd() - 0.5) * jitter));
  };
  layer(0.62, [-0.15, 0, 0.15]);
  layer(0.76, [-0.16, 0, 0.16]);
  layer(0.9, [-0.24, -0.08, 0.08, 0.24]);
  layer(1.02, [-0.15, 0, 0.15], 0.04);
  slots.push(new THREE.Vector3(-0.06, 1.12, 0.0), new THREE.Vector3(0.07, 1.11, -0.05));
  const kit = ballKit(ctx);
  // 斗里的球：每个球朝下的那圈落中档（不要暗档、不描边 —— 描边在球缝里压出一格格褐点，满斗就是一层噪点），一个个球读得出来
  const heapMat = ctx.mats.toon(0xffffff, {
    ramp: BALL_RAMP,
    edge: 0,
    convex: 0.25,
    lightUp: 0.3,
    bands: [-0.9, 0.3],
    noShadowReceive: true,
  });
  const heap = new THREE.InstancedMesh(kit.geo, heapMat, slots.length);
  heap.name = 'ball-machine:balls';
  heap.frustumCulled = false;
  const m4 = new THREE.Matrix4();
  const sc = new THREE.Vector3(BS, BS, BS);
  const q0 = new THREE.Quaternion();
  slots.forEach((p, i) => {
    heap.setMatrixAt(i, m4.compose(p, q0, sc));
  });
  ctx.mats.prepare(heap, { cast: false, receive: false });
  root.add(heap);
  let count = 0;
  const setCount = (n: number) => {
    count = Math.max(0, Math.min(MAX, Math.round(n)));
    heap.count = count === 0 ? 0 : Math.max(1, Math.round((count / MAX) * slots.length));
  };
  setCount(ctx.variant === 1 ? 8 : MAX);

  // ── 出球 ──
  let recoil = 0;
  const muzzleAt = (out = new THREE.Vector3()) => {
    root.updateWorldMatrix(true, false);
    return root.localToWorld(out.copy(tip));
  };
  const muzzleDir = (out = new THREE.Vector3()) => {
    root.updateWorldMatrix(true, false);
    return out.copy(dirLocal).transformDirection(root.matrixWorld);
  };
  const fire = () => {
    if (count <= 0) return null;
    setCount(count - 1);
    recoil = 1;
    return { from: muzzleAt(), dir: muzzleDir() };
  };

  Object.assign(root.userData, {
    setCount,
    count: () => count,
    fire,
    muzzle: muzzleAt,
    muzzleDir,
    setOn,
    on: () => on,
    handle: (out = new THREE.Vector3()) => {
      root.updateWorldMatrix(true, false);
      return root.localToWorld(out.set(0, 0.93, -0.55));
    },
    update: (dt: number) => {
      if (recoil <= 0) return;
      recoil = Math.max(0, recoil - dt / 0.2);
      // 一缩（0.07 米 ≈ 1 设计纹素）再弹回：前 30% 缩到底，其余慢慢回
      const k = recoil > 0.7 ? (1 - recoil) / 0.3 : recoil / 0.7;
      muzzle.position.z = 0.3 - 0.07 * k;
    },
  });
  setOn(ctx.variant !== 1);
  return root;
}

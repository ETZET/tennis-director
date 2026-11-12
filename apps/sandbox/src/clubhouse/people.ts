// 健身房的人（B1）：在 clubsite/people 建好的大人（player v0..3、coach、director）上面再包一层健身姿势 + 杠铃、划船机拉手、毛巾。
// 只读 clubsite/people（findBones、reach、orient……），那边的文件一个不改。照 clubpool/people.ts 的做法。
//
// ── 用法 ──
//   gymPerson(obj, ctx?, { loop? })   幂等；不是人（没有 userData.pose / setSeat）原样返回。包住 userData.pose / period / update / poses：
//                           pose(name)        不给 phase = 按 GYM_PERIOD[name] 秒一遍循环（update(dt) 推）
//                           pose(name, phase) 定格；loop: true（场景里）= 从这个 phase 开始接着循环（同一组的人错开拍子）
//                           别的名字原样交给 clubsite/people。setProp / hold / release / drop / lookAt / setSeat 之后自动重摆。
//                           ctx 只给道具用（杠铃、拉手、毛巾；不给就没有）。场景里要在 collectUpdaters 之前包（它收的是 update 的引用）。
//   userData.gymPose()      现在的健身姿势（没有 = null）
//
// ── 姿势（phase 0..1 一遍，秒数 = GYM_PERIOD）── root 原点 = 器械的落地点（root y = 楼板），接口高度见 stage2-common.md：
//   run 0.7         跑步机：脚落在 RUN_BELT（0.28）上，原地跑（一遍 = 左右各一步），跑带往后带脚；手臂前后甩
//   row 2.6         划船机：root = 座的静止位，臀在 ROW_SEAT（0.32）上，脚蹬在 root 前 ROW_FOOT（1.0）；0..0.32 蹬腿后仰拉到胸口 → 回桨前倾滑回去。
//                   Q 版腿只有 0.5 米：腿按比例拉长（大腿、小腿一起，ROW_LEG ≈ 2 倍）才够得着 1 米外的脚蹬；臀前后滑 ROW_HIP_Z，
//                   旁边的 gym-rowers 的座（userData.seats）跟着一起滑
//   cycle 0.75      动感单车：臀在 CYCLE_SEAT（0.85），手在把手 CYCLE_BARS（y 1.0、身前 0.47；gym-bikes 的座 z −0.27、把手 z ≈ 0.2），脚踩着曲柄转（CYCLE_CRANK），腿拉长到够得着
//   benchPress 3    卧推：仰躺在凳面 BENCH_PAD（0.45）上，头朝 −z（rotY 0 = 头朝北），双脚蹬在凳尾；杠铃 0..0.45 落到胸口 → 0.55..0.85 推起
//                   root = 凳子中心；杠铃高度 benchBarY(p)、杠铃在 root 前 BENCH_BAR_Z
//   spot 3          保护：root = 凳子中心（和卧推的人放在同一个点、同一个 phase）。人站在凳头东边、躺着的人的头旁边（SPOT_AT，斜着朝杠铃；
//                   Q 版的头大，站正后面的话两颗头叠成一颗），双手托在杠铃下面（SPOT_HANDS），跟着 benchBarY 一起上下
//   squat 3         杠铃深蹲：杠铃扛在上背（肩后），双手握杠；0.1..0.45 蹲下 → 0.55..0.9 站起
//   punch 1.2       打沙袋：正架（左脚在前），0..0.32 左手刺拳 → 0.5..0.84 右手直拳；沙袋中心在 root 前 BAG_DIST、高 BAG_Y
//   sledPush 0.9    推雪橇：身子前倾、双臂伸直扶在雪橇把手上（root 前 SLED_HANDLE），两条腿轮流往后蹬（一遍 = 左右各一步）
//   stretch 4       拉伸：设过座位（setSeat(h) / slot 的 seat）= 坐在 h 上体前屈、手够脚尖；没设 = 站着拉右腿股四头（右手抓脚踝）。一遍 = 一次呼吸
//   coachLead 1.6   教练台上领操：四拍（双臂侧平举 → 上举成 V → 侧平举 → 放下），脚左右并步
//   deskServe 3.6   前台递毛巾：0.1..0.25 弯腰从台下拿 → 0.3..0.45 双手捧着越过台面递出去 → 0.7 被接走 → 收回扶在台面上
//                   台面 DESK_TOP（1.05）、台子北沿在 root 前 ≈ 0.2
//
// ── 哪些人能用 ──
//   大人（player、coach、director）。孩子没按比例算（接口高度是大人的）。director 戴草帽：可以用，但别让总监躺凳子。
import * as THREE from 'three';
import {
  type Arm,
  type Bones,
  clamp,
  env,
  findBones,
  keys,
  lerp,
  orient,
  pointIn,
  reach,
  smooth,
  V,
} from '../clubsite/people/bones';
import { SHIN, SHIN_ANKLE, THIGH } from '../clubsite/people/legs';
import { PERSON, type PeopleCtx } from '../clubsite/people/props';

export const GYM_POSES = [
  'run',
  'row',
  'cycle',
  'benchPress',
  'spot',
  'squat',
  'punch',
  'sledPush',
  'stretch',
  'coachLead',
  'deskServe',
] as const;
export type GymPose = (typeof GYM_POSES)[number];
export const GYM_PERIOD: Record<GymPose, number> = {
  run: 0.7,
  row: 2.6,
  cycle: 0.75,
  benchPress: 3,
  spot: 3,
  squat: 3,
  punch: 1.2,
  sledPush: 0.9,
  stretch: 4,
  coachLead: 1.6,
  deskServe: 3.6,
};
const isGym = (n: unknown): n is GymPose => typeof n === 'string' && (GYM_POSES as readonly string[]).includes(n);

// ── 器械的接口（root 本地，米；root y = 楼板）──────────────────
/** 跑步机跑带顶 */
export const RUN_BELT = 0.28;
/** 划船机座面、脚蹬在座前多远（脚蹬中心高 ROW_FOOT_Y） */
export const ROW_SEAT = 0.32;
export const ROW_FOOT = 1.0;
export const ROW_FOOT_Y = 0.22;
/** 划船：臀在座上前后滑的范围 [拉完（腿伸直）, 前倾抓桨]（root 前多少米；gym-rowers 的座能往前滑 0.2）。座跟着臀滑（见 rowSeat） */
export const ROW_HIP_Z: [number, number] = [0, 0.2];
/** 动感单车座面、把手（y、身前 z、左右 ±x） */
export const CYCLE_SEAT = 0.85;
export const CYCLE_BARS = { y: 1.0, z: 0.47, x: 0.2 } as const;
/** 曲柄中心（y、身前 z）和半径 */
export const CYCLE_CRANK = { y: 0.4, z: 0.26, r: 0.13 } as const;
/**
 * 卧推凳面；躺着时髋在 root 本地（root = 凳子中心）；杠铃在 root 前 BENCH_BAR_Z。gym-bench 的凳垫 z −0.5…0.74、头端立柱 z −0.66（杠托 1.0）：
 * 人往南躺，头的后沿刚好贴着立柱（凳子自己架着的那根杠就在头后上方 = 杠铃架）
 */
export const BENCH_PAD = 0.45;
export const BENCH_HIP = { y: BENCH_PAD + 0.18, z: 0.52 } as const;
export const BENCH_BAR_Z = 0.06;
/** 杠铃最高（手臂伸直）/ 最低（碰到胸口） */
export const BENCH_BAR_TOP = 1.07;
export const BENCH_BAR_LOW = 0.88;
/** 保护的人（root = 凳子中心）：站在凳头角上的位置（root 本地）、朝向（绕 y），两只手托在杠铃下面的 x */
export const SPOT_AT = { x: 0.56, z: -0.36, yaw: -0.5 } as const;
export const SPOT_HANDS: [number, number] = [0, 0.2];
/** 沙袋：中心离 root 多远、多高、半径（沙袋架：中心 y 1.2、直径 0.4） */
export const BAG_DIST = 0.8;
export const BAG_Y = 1.2;
export const BAG_R = 0.2;
/** 雪橇把手：root 前多远、多高 */
export const SLED_HANDLE = { z: 0.6, y: 0.95, x: 0.24 } as const;
/** 前台台面 */
export const DESK_TOP = 1.05;

/** 卧推 / 保护共用的杠铃高度（root 所在的楼板上多高） */
export function benchBarY(p: number): number {
  return keys(p, [
    [0, BENCH_BAR_TOP],
    [0.12, BENCH_BAR_TOP],
    [0.45, BENCH_BAR_LOW],
    [0.55, BENCH_BAR_LOW],
    [0.85, BENCH_BAR_TOP],
    [1, BENCH_BAR_TOP],
  ]);
}
/** deskServe：毛巾在手上的那一段 */
export const DESK_TOWEL: [number, number] = [0.2, 0.7];
/** punch：拳头碰到沙袋的 phase（刺拳、直拳） */
export const PUNCH_HITS: [number, number] = [0.16, 0.67];

// ── 骨骼的小工具（只读 clubsite/people 的结构）────────────────

interface KneeRef {
  leg: THREE.Group;
  /** legs.ts 的膝盖腿组（alt）→ [大腿网格, 短裤套?, knee] */
  thigh: THREE.Mesh;
  knee: THREE.Group;
  shin: THREE.Group;
  ankle: THREE.Group;
}
/** legs.ts 加的膝盖腿：腿组里唯一的 Group（alt）→ [大腿、短裤套、knee]；knee → [shin, ankle] */
function kneeRef(leg: THREE.Group): KneeRef {
  const alt = leg.children.find((c) => (c as THREE.Group).isGroup) as THREE.Group | undefined;
  const knee = alt?.children.find((c) => (c as THREE.Group).isGroup) as THREE.Group | undefined;
  const thigh = alt?.children[0] as THREE.Mesh | undefined;
  if (!alt || !knee || !thigh?.isMesh || knee.children.length < 2)
    throw new Error('clubhouse/people：找不到膝盖腿（legs.ts 的结构变了？）');
  return { leg, thigh, knee, shin: knee.children[0] as THREE.Group, ankle: knee.children[1] as THREE.Group };
}
/** 膝盖腿复原（clubsite/people 的 knees.show(false) 不管大腿的拉长和膝的位置） */
function unstretch(k: KneeRef) {
  k.thigh.scale.y = 1;
  k.knee.position.y = -THIGH;
}

const SOLE = SHIN - SHIN_ANKLE;
const DOWN = V(0, -1, 0);
const FWD = V(0, 0, 1);

interface LegOpts {
  /** 膝盖往哪边顶（body 方向；默认往前） */
  knee?: THREE.Vector3;
  /** 鞋尖朝哪（默认往前） */
  toe?: THREE.Vector3;
  /** 鞋底的法线朝哪（默认朝下；蹬在划船机的脚蹬上 = 斜着朝前） */
  down?: THREE.Vector3;
  /** 腿的比例：给数 = 大腿、小腿都按它拉长；不给 = 够不着时自动拉长，最多 max（默认 1.08） */
  s?: number;
  max?: number;
}

/**
 * 两节腿的 IK（body 坐标）：鞋底落在 sole，膝盖往 knee 那边顶，鞋按 toe / down 摆平。大腿、小腿一样长（各 0.22 × s）。
 * 腿组用 orient 摆（不是只转 x）：躺着、分腿、斜蹬都行。返回还差多远（够不着时 > 0）。
 */
function legTo(e: Env, k: KneeRef, sole: THREE.Vector3, o: LegOpts = {}): number {
  const { body } = e;
  const down = o.down ?? DOWN;
  const pivot = pointIn(body, k.leg, V(0, 0, 0));
  const ankle = sole.clone().addScaledVector(down, -SOLE);
  const t = ankle.sub(pivot);
  const d0 = t.length();
  const s = o.s ?? clamp(d0 / (2 * THIGH * 0.985), 1, o.max ?? 1.08);
  const L = THIGH * s;
  const d = clamp(d0, 0.04, 2 * L * 0.9995);
  t.normalize();
  const hint = (o.knee ?? FWD).clone();
  hint.addScaledVector(t, -hint.dot(t));
  if (hint.lengthSq() < 1e-6) hint.set(0, 0, 1).addScaledVector(t, -t.z);
  hint.normalize();
  const c = d / (2 * L);
  const sn = Math.sqrt(Math.max(0, 1 - c * c));
  // 大腿 u、小腿 w：等腰三角形，膝盖顶在 hint 那边
  const u = t.clone().multiplyScalar(c).addScaledVector(hint, sn);
  const w = t.clone().multiplyScalar(c).addScaledVector(hint, -sn);
  // 腿组：本地 −y = 大腿；膝往本地 −z 弯（knee.rotation.x > 0）→ 本地 +z = 小腿离开大腿那一侧的反方向
  const zl = w.clone().addScaledVector(u, -w.dot(u)).negate();
  if (zl.lengthSq() < 1e-8) zl.copy(hint);
  orient(k.leg, body, u, zl);
  k.knee.rotation.set(Math.acos(clamp(u.dot(w), -1, 1)), 0, 0);
  k.knee.position.y = -THIGH * s;
  k.thigh.scale.y = s;
  k.shin.scale.y = s;
  k.ankle.position.y = -SHIN_ANKLE * s;
  orient(k.ankle, body, down, o.toe ?? FWD);
  return Math.max(0, d0 - 2 * L);
}

interface Env {
  b: Bones;
  root: THREE.Group;
  body: THREE.Object3D;
  kR: KneeRef;
  kL: KneeRef;
  seat: { h: number; foot: number } | null;
  props: Props;
  /** row：跟着滑的划船机座（undefined = 还没找；null = 附近没有） */
  rowSeat?: { mesh: THREE.Mesh; range: [number, number] } | null;
}

interface Props {
  bar: THREE.Object3D | null;
  handle: THREE.Object3D | null;
  towel: THREE.Object3D | null;
}

/** 髋（root 本地） */
const hipAt = (e: Env, y: number, z = 0, x = 0) => e.b.hips.position.set(x, y, z);
/** 躯干本地的点 → body 坐标 */
const inTorso = (e: Env, x: number, y: number, z: number) => pointIn(e.body, e.b.torso, V(x, y, z));
const shoulder = (e: Env, arm: Arm) => pointIn(e.body, e.b.torso, arm.sh.position.clone());
/** 躯干本地的方向 → body 方向 */
const torsoDir = (e: Env, x: number, y: number, z: number) =>
  inTorso(e, x, y, z)
    .sub(inTorso(e, 0, 0, 0))
    .normalize();
/** 摆一件道具（沿本地 y 建的：杠铃、拉手）：中心 c、杠的方向 axis（body 坐标） */
function place(e: Env, o: THREE.Object3D | null, c: THREE.Vector3, axis: THREE.Vector3, up = V(0, 1, 0)) {
  if (!o) return;
  o.visible = true;
  o.position.copy(c);
  orient(o, e.body, axis, up);
}

// ── 姿势 ──────────────────────────────────────────

function run(e: Env, p: number) {
  const { b } = e;
  const a = p * Math.PI * 2;
  hipAt(e, RUN_BELT + 0.41 + 0.025 * Math.cos(2 * a));
  b.torso.rotation.set(0.16, 0.12 * Math.sin(a), 0);
  b.head.rotation.set(-0.14, -0.1 * Math.sin(a), 0);
  // 一条腿：0..0.55 踩在跑带上被带着往后（z 0.22 → −0.26），之后抬起来（脚跟往后上踢）往前收
  const footZ = (ph: number) => {
    const f = ((ph % 1) + 1) % 1;
    if (f < 0.55) return { z: lerp(0.22, -0.26, f / 0.55), y: 0, swing: 0 };
    const t = (f - 0.55) / 0.45;
    return { z: lerp(-0.26, 0.22, smooth(0, 1, t)), y: 0.26 * Math.sin(Math.PI * t) * (1 - 0.35 * t), swing: t };
  };
  const fR = footZ(p);
  const fL = footZ(p + 0.5);
  for (const [k, side, f] of [
    [e.kR, -1, fR],
    [e.kL, 1, fL],
  ] as const) {
    legTo(e, k, V(side * 0.12, RUN_BELT + f.y, f.z), {
      knee: V(0, -0.1, 1),
      toe: V(0, -0.35 * Math.sin(Math.PI * f.swing), 1),
      down: V(0, -1, -0.35 * Math.sin(Math.PI * f.swing)).normalize(),
      max: 1.08,
    });
  }
  // 手臂和对侧的腿一起前后甩（rotation.x > 0 = 往后），微微往外张
  b.armR.sh.rotation.set(-0.3 - 2.4 * fL.z, 0, -0.16);
  b.armL.sh.rotation.set(-0.3 - 2.4 * fR.z, 0, 0.16);
}

/** 划船机脚蹬的法线（鞋底朝它）：gym-rowers 的脚蹬是竖着的板 → 鞋底朝前、略朝下；鞋尖朝上 */
const ROW_PLATE = V(0, -0.3, 0.954);
/** 划船：腿要拉长到够得着 ROW_FOOT 的脚蹬（按拉完时腿伸直算一个固定的比例） */
export const ROW_LEG = (() => {
  const pivot = V(0.115, ROW_SEAT + 0.1, ROW_HIP_Z[0]);
  const ankle = V(0.13, ROW_FOOT_Y, ROW_FOOT - 0.08).addScaledVector(ROW_PLATE, -SOLE);
  return Math.max(1, pivot.distanceTo(ankle) / (2 * THIGH * 0.99));
})();

function row(e: Env, p: number) {
  const { b } = e;
  // u：1 = 前倾抓桨（臀滑到前面），0 = 拉完（腿伸直、后仰、拉手到胸口）。0..0.4 蹬（快），0.4..1 回（慢：先送手、再倾、再滑）
  const slide = keys(p, [
    [0, 1],
    [0.32, 0],
    [0.5, 0],
    [0.95, 1],
    [1, 1],
  ]);
  const lean = keys(p, [
    [0, 0.38],
    [0.12, 0.3],
    [0.36, -0.28],
    [0.48, -0.28],
    [0.68, 0.38],
    [1, 0.38],
  ]);
  const pull = keys(p, [
    [0, 0],
    [0.14, 0.05],
    [0.38, 1],
    [0.44, 1],
    [0.6, 0],
    [1, 0],
  ]);
  const hz = lerp(ROW_HIP_Z[0], ROW_HIP_Z[1], slide);
  hipAt(e, ROW_SEAT + 0.1, hz);
  b.torso.rotation.set(lean, 0, 0);
  b.head.rotation.set(-0.12 - lean * 0.5, 0, 0);
  // 脚蹬：斜着朝前上（鞋尖朝上偏前），鞋底贴着脚蹬
  for (const [k, side] of [
    [e.kR, -1],
    [e.kL, 1],
  ] as const) {
    legTo(e, k, V(side * 0.13, ROW_FOOT_Y, ROW_FOOT - 0.08), {
      knee: V(side * 0.15, 1, 0.2),
      toe: V(0, 0.954, 0.3),
      down: ROW_PLATE,
      s: ROW_LEG,
    });
  }
  // 拉手：抓桨时在脚蹬前上方（伸直手臂），拉完到胸口下面
  const catchAt = V(0, 0.6, hz + 0.52);
  const chest = inTorso(e, 0, 0.14, 0.32);
  const h = catchAt.lerp(chest, pull);
  const hr = h.clone().add(V(-0.13, 0, 0));
  const hl = h.clone().add(V(0.13, 0, 0));
  reach(e.body, b.armR, hr, [0.75, 1.25]);
  reach(e.body, b.armL, hl, [0.75, 1.25]);
  place(e, e.props.handle, h.clone().add(V(0, 0, 0.04)), V(1, 0, 0));
  rowSeat(e, hz);
}

/**
 * 划船机的座跟着臀滑：gym-rowers 的 userData.seats（单独的座网格，position.z = 滑的偏移，0 = 静止位 = 这个人的 root）、seatRange [前, 后]。
 * 第一次用时在同一个父级里找离 root 最近（< 0.3 米）的那个座。
 */
function rowSeat(e: Env, hz: number) {
  if (e.rowSeat === undefined) {
    const parent = e.root.parent;
    if (!parent) return;
    e.rowSeat = null;
    e.root.updateWorldMatrix(true, false);
    const at = e.root.getWorldPosition(new THREE.Vector3());
    for (const o of parent.children) {
      const seats = o.userData.seats as THREE.Mesh[] | undefined;
      if (!Array.isArray(seats) || !seats[0]?.isMesh) continue;
      const range = (o.userData.seatRange as [number, number] | undefined) ?? [0.2, -0.5];
      for (const m of seats) {
        m.geometry.computeBoundingBox();
        const c = m.geometry.boundingBox!.getCenter(new THREE.Vector3());
        m.updateWorldMatrix(true, false);
        m.parent!.localToWorld(c);
        if (Math.hypot(c.x - at.x, c.z - at.z) < 0.3) e.rowSeat = { mesh: m, range };
      }
    }
  }
  if (e.rowSeat) {
    const [front, back] = e.rowSeat.range;
    e.rowSeat.mesh.position.z = clamp(hz, back, front);
  }
}

/** 单车：腿的比例按曲柄最低点算（够得着、但最高点还弯着膝） */
export const CYCLE_LEG = (() => {
  const pivot = V(0.115, CYCLE_SEAT + 0.1, 0);
  const low = V(0.14, CYCLE_CRANK.y - CYCLE_CRANK.r + SOLE, CYCLE_CRANK.z);
  return Math.max(1, pivot.distanceTo(low) / (2 * THIGH * 0.97));
})();

function cycle(e: Env, p: number) {
  const { b } = e;
  const a = p * Math.PI * 2;
  hipAt(e, CYCLE_SEAT + 0.1 + 0.008 * Math.sin(2 * a), 0, 0.012 * Math.sin(a));
  b.torso.rotation.set(0.6, 0.05 * Math.sin(a), 0.03 * Math.sin(a));
  b.head.rotation.set(-0.45, 0, 0);
  // 两只脚在曲柄圈上，差半圈；鞋尖顺着蹬的方向略点一下
  for (const [k, side, off] of [
    [e.kR, -1, 0],
    [e.kL, 1, Math.PI],
  ] as const) {
    const th = a + off;
    const sole = V(
      side * 0.14,
      CYCLE_CRANK.y + CYCLE_CRANK.r * Math.cos(th),
      CYCLE_CRANK.z + CYCLE_CRANK.r * Math.sin(th),
    );
    legTo(e, k, sole, { knee: V(side * 0.12, 0.2, 1), toe: V(0, -0.15, 1), s: CYCLE_LEG });
  }
  reach(e.body, b.armR, V(-CYCLE_BARS.x, CYCLE_BARS.y, CYCLE_BARS.z), [0.8, 1.25]);
  reach(e.body, b.armL, V(CYCLE_BARS.x, CYCLE_BARS.y, CYCLE_BARS.z), [0.8, 1.25]);
}

function benchPress(e: Env, p: number) {
  const { b } = e;
  const y = benchBarY(p);
  // 仰躺：髋组转 −π/2（躯干朝 −z、胸口朝上）
  hipAt(e, BENCH_HIP.y, BENCH_HIP.z);
  b.hips.rotation.set(-Math.PI / 2, 0, 0);
  b.torso.rotation.set(0, 0, 0);
  const strain = env(p, 0.5, 0.6, 0.8, 0.88);
  b.torso.scale.y = 1;
  // 头枕在凳面上、略抬起看杠铃（下巴往胸口收一点，脸朝脚那头 = 镜头）：头低一点，保护的人的头才露得出来
  b.head.rotation.set(0.55 + 0.06 * strain, 0, 0);
  // 双脚蹬在凳尾（膝盖朝上），两腿略分
  const zf = 0.68;
  legTo(e, e.kR, V(-0.16, BENCH_PAD, zf), { knee: V(-0.3, 1, 0.3), max: 1.4 });
  legTo(e, e.kL, V(0.16, BENCH_PAD, zf), { knee: V(0.3, 1, 0.3), max: 1.4 });
  // 握距：杠铃低的时候手臂往两边撇（Q 版手臂不能弯：撇开 = 肘往外）
  const sh = shoulder(e, b.armL);
  const dy = y - sh.y;
  const gx = Math.min(0.58, Math.abs(sh.x) + Math.sqrt(Math.max(0.005, 0.44 * 0.44 - dy * dy)));
  reach(e.body, b.armR, V(-gx, y, BENCH_BAR_Z), [0.8, 1.15]);
  reach(e.body, b.armL, V(gx, y, BENCH_BAR_Z), [0.8, 1.15]);
  place(e, e.props.bar, V(0, y, BENCH_BAR_Z), V(1, 0, 0));
}

function spot(e: Env, p: number) {
  const { b } = e;
  const y = benchBarY(p);
  const tense = env(p, 0.45, 0.55, 0.8, 0.9);
  // root = 凳子中心（和卧推的人同一个点）：人站在凳头东边（SPOT_AT，凳子立柱的东南、躺着的人的头旁边），斜着朝杠铃。
  // Q 版的头大、手臂短：站正后面或者一弯腰，自己的头就叠到躺着的人的头上（俯 45° 看成一个人），所以偏开一个身位、站得比较直，
  // 手臂拉长往前下伸，托在杠铃中段下面（卧推的手里面）
  const { x, z, yaw } = SPOT_AT;
  const c = Math.cos(yaw);
  const sn = Math.sin(yaw);
  const at = (lx: number, lz: number, ly = 0) => V(x + lx * c + lz * sn, ly, z - lx * sn + lz * c);
  hipAt(e, 0.5, z, x);
  b.hips.rotation.set(0, yaw, 0);
  b.torso.rotation.set(0.18 + 0.05 * tense, 0, 0);
  b.head.rotation.set(0.3, 0, 0);
  const fwd = V(sn, 0, c);
  legTo(e, e.kR, at(-0.2, 0.02), { knee: fwd.clone().add(at(-0.3, 0).sub(at(0, 0))), toe: fwd });
  legTo(e, e.kL, at(0.2, 0.02), { knee: fwd.clone().add(at(0.3, 0).sub(at(0, 0))), toe: fwd });
  const hy = y - 0.1;
  reach(e.body, b.armR, V(SPOT_HANDS[0], hy, BENCH_BAR_Z), [0.85, 1.8]);
  reach(e.body, b.armL, V(SPOT_HANDS[1], hy, BENCH_BAR_Z), [0.85, 1.8]);
}

function squat(e: Env, p: number) {
  const { b } = e;
  const d = keys(p, [
    [0, 0],
    [0.1, 0],
    [0.45, 1],
    [0.55, 1],
    [0.9, 0],
    [1, 0],
  ]);
  hipAt(e, lerp(0.47, 0.3, d), lerp(0, -0.17, d));
  b.torso.rotation.set(lerp(0.08, 0.62, d), 0, 0);
  b.head.rotation.set(-lerp(0.05, 0.5, d), 0, 0);
  legTo(e, e.kR, V(-0.27, 0, 0.06), { knee: V(-0.45, 0, 1), toe: V(-0.35, 0, 1) });
  legTo(e, e.kL, V(0.27, 0, 0.06), { knee: V(0.45, 0, 1), toe: V(0.35, 0, 1) });
  // 杠铃扛在上背（肩后、头下面），双手握在外面
  const c = inTorso(e, 0, 0.42, -0.28);
  const ax = torsoDir(e, 1, 0, 0);
  place(e, e.props.bar, c, ax, torsoDir(e, 0, 1, 0));
  reach(e.body, b.armR, inTorso(e, -0.6, 0.43, -0.26), [0.8, 1.3]);
  reach(e.body, b.armL, inTorso(e, 0.6, 0.43, -0.26), [0.8, 1.3]);
}

function punch(e: Env, p: number) {
  const { b } = e;
  const jab = env(p, 0.04, PUNCH_HITS[0], PUNCH_HITS[0] + 0.04, 0.32);
  const cross = env(p, 0.52, PUNCH_HITS[1], PUNCH_HITS[1] + 0.04, 0.84);
  const bounce = Math.cos(p * Math.PI * 4);
  hipAt(e, 0.45 + 0.02 * bounce, -0.03);
  // 正架：左肩在前（rotation.y < 0），出直拳时右肩转到前面
  b.torso.rotation.set(0.14 + 0.06 * cross, -0.32 - 0.14 * jab + 0.6 * cross, 0);
  b.head.rotation.set(-0.1, 0.25 - 0.4 * cross, 0);
  legTo(e, e.kL, V(0.17, 0, 0.17), { knee: V(0.3, 0, 1), toe: V(0.25, 0, 1) });
  legTo(e, e.kR, V(-0.19, 0, -0.2 + 0.03 * cross), { knee: V(-0.3, 0, 1), toe: V(-0.5, 0, 1) });
  // 护在下巴两边 → 打在沙袋朝人的那一面（中心偏下一点）
  const guardL = inTorso(e, 0.16, 0.56, 0.26);
  const guardR = inTorso(e, -0.16, 0.52, 0.24);
  const hit = (x: number) => V(x, BAG_Y - 0.1, BAG_DIST - BAG_R - 0.06);
  reach(e.body, b.armL, guardL.lerp(hit(0.06), jab), [0.7, 1.3]);
  reach(e.body, b.armR, guardR.lerp(hit(-0.04), cross), [0.7, 1.3]);
}

function sledPush(e: Env, p: number) {
  const { b } = e;
  const a = p * Math.PI * 2;
  hipAt(e, 0.4 + 0.015 * Math.cos(2 * a), -0.1);
  b.torso.rotation.set(0.75, 0, 0.04 * Math.sin(a));
  b.head.rotation.set(-0.55, 0, 0);
  // 一条腿：0..0.6 踩着地往后蹬（z 0.02 → −0.44），之后膝盖往前顶、脚离地收回来
  const foot = (ph: number) => {
    const f = ((ph % 1) + 1) % 1;
    if (f < 0.6) return V(0, 0, lerp(0.02, -0.44, f / 0.6));
    const t = (f - 0.6) / 0.4;
    return V(0, 0.16 * Math.sin(Math.PI * t), lerp(-0.44, 0.02, smooth(0, 1, t)));
  };
  const fR = foot(p).add(V(-0.13, 0, 0));
  const fL = foot(p + 0.5).add(V(0.13, 0, 0));
  legTo(e, e.kR, fR, { knee: V(0, -0.2, 1), max: 1.15 });
  legTo(e, e.kL, fL, { knee: V(0, -0.2, 1), max: 1.15 });
  reach(e.body, b.armR, V(-SLED_HANDLE.x, SLED_HANDLE.y, SLED_HANDLE.z), [0.85, 1.3]);
  reach(e.body, b.armL, V(SLED_HANDLE.x, SLED_HANDLE.y, SLED_HANDLE.z), [0.85, 1.3]);
}

function stretch(e: Env, p: number) {
  const { b } = e;
  const breath = Math.sin(p * Math.PI * 2);
  if (e.seat) {
    // 坐在 h 上体前屈：腿顺着 +z 伸直（鞋尖朝上），呼气时往下压
    const h = e.seat.h;
    hipAt(e, h + 0.1, 0);
    const fold = 0.7 + 0.14 * (0.5 - 0.5 * breath);
    b.torso.rotation.set(fold, 0, 0);
    b.head.rotation.set(-0.15, 0, 0);
    for (const [k, side] of [
      [e.kR, -1],
      [e.kL, 1],
    ] as const) {
      legTo(e, k, V(side * 0.12, h + 0.12, 0.49), {
        knee: V(0, 1, 0),
        toe: V(0, 1, 0.1),
        down: V(0, 0.1, 1).normalize(),
      });
    }
    const tz = 0.47 + 0.04 * (0.5 - 0.5 * breath);
    reach(e.body, b.armR, V(-0.15, h + 0.2, tz), [0.65, 1.2]);
    reach(e.body, b.armL, V(0.15, h + 0.2, tz), [0.65, 1.2]);
    return;
  }
  // 站着拉右腿股四头：左腿撑地，右脚往后上抬、右手抓住脚踝；左臂往外张着保持平衡
  hipAt(e, 0.49, 0, 0.03);
  b.torso.rotation.set(0.05, 0, -0.04 + 0.02 * breath);
  b.head.rotation.set(-0.05, 0, 0);
  legTo(e, e.kL, V(0.13, 0, 0.02));
  const ank = V(-0.14, 0.58 + 0.02 * breath, -0.2);
  const down = V(0, -0.4, -0.3).normalize();
  legTo(e, e.kR, ank.clone().addScaledVector(down, SOLE), { knee: V(0, -1, 0.25), toe: V(0, 0.6, -0.8), down });
  reach(e.body, b.armR, ank.clone().add(V(-0.02, 0.02, 0.02)), [0.8, 1.3]);
  reach(e.body, b.armL, V(0.6, 0.86 + 0.03 * breath, 0.12), [0.85, 1.2]);
}

function coachLead(e: Env, p: number) {
  const { b } = e;
  // 四拍的手（body 坐标）：侧平举 → 上举 V → 侧平举 → 放下
  const out = (s: number) => V(s * 0.66, 1.0, 0.06);
  const up = (s: number) => V(s * 0.46, 1.36, 0.12);
  const low = (s: number) => V(s * 0.36, 0.6, 0.1);
  const hand = (s: number) => {
    const ks: [number, THREE.Vector3][] = [
      [0, low(s)],
      [0.12, out(s)],
      [0.25, out(s)],
      [0.37, up(s)],
      [0.5, up(s)],
      [0.62, out(s)],
      [0.75, out(s)],
      [0.87, low(s)],
      [1, low(s)],
    ];
    let i = 1;
    while (i < ks.length - 1 && p > ks[i][0]) i++;
    return ks[i - 1][1].clone().lerp(ks[i][1], smooth(ks[i - 1][0], ks[i][0], p));
  };
  // 并步：0..0.5 往右（人物的 −x）跨一步、左脚并过去，0.5..1 往左
  const sx = Math.sin(p * Math.PI * 2);
  const dip = 0.5 - 0.5 * Math.cos(p * Math.PI * 8);
  hipAt(e, 0.49 - 0.04 * dip, 0, -0.07 * sx);
  b.torso.rotation.set(0.04, 0, 0.06 * sx);
  b.head.rotation.set(-0.06, 0, -0.05 * sx);
  const wide = 0.3;
  const narrow = 0.12;
  const xR = -lerp(narrow, wide, Math.max(0, sx));
  const xL = lerp(narrow, wide, Math.max(0, -sx));
  const liftR = 0.08 * Math.max(0, Math.sin(p * Math.PI * 4)) * (sx > 0 ? 1 : 0);
  const liftL = 0.08 * Math.max(0, -Math.sin(p * Math.PI * 4)) * (sx < 0 ? 1 : 0);
  legTo(e, e.kR, V(xR - 0.07 * sx, liftR, 0.03), { knee: V(-0.2, 0, 1), toe: V(-0.15, 0, 1) });
  legTo(e, e.kL, V(xL - 0.07 * sx, liftL, 0.03), { knee: V(0.2, 0, 1), toe: V(0.15, 0, 1) });
  reach(e.body, b.armR, hand(-1), [0.85, 1.25]);
  reach(e.body, b.armL, hand(1), [0.85, 1.25]);
}

function deskServe(e: Env, p: number) {
  const { b } = e;
  const bend = env(p, 0.06, 0.16, 0.22, 0.32);
  const out = env(p, 0.26, 0.42, 0.7, 0.84);
  hipAt(e, 0.49 - 0.06 * bend, -0.03 * bend);
  b.torso.rotation.set(0.06 + 0.4 * bend + 0.22 * out, 0, 0);
  b.head.rotation.set(-0.1 - 0.25 * bend - 0.1 * out, 0, 0);
  legTo(e, e.kR, V(-0.13, 0, 0.0), { knee: V(0, 0, 1) });
  legTo(e, e.kL, V(0.13, 0, 0.0), { knee: V(0, 0, 1) });
  // 手：扶在台面北沿（rest）→ 台下拿毛巾 → 越过台面捧出去
  const rest = V(0, DESK_TOP + 0.08, 0.3);
  const under = V(0, 0.74, 0.2);
  const over = V(0, DESK_TOP + 0.17 + 0.015 * Math.sin(p * Math.PI * 6), 0.5);
  const c = rest.clone().lerp(under, bend).lerp(over, out);
  const w = lerp(0.22, 0.15, Math.max(bend, out));
  reach(e.body, b.armR, c.clone().add(V(-w, 0, 0)), [0.8, 1.3]);
  reach(e.body, b.armL, c.clone().add(V(w, 0, 0)), [0.8, 1.3]);
  const t = e.props.towel;
  if (t) {
    const on = p > DESK_TOWEL[0] && p < DESK_TOWEL[1];
    t.visible = on;
    if (on) {
      const fr = pointIn(e.body, b.armR.hand, V(0, 0, 0));
      const fl = pointIn(e.body, b.armL.hand, V(0, 0, 0));
      t.position.copy(fr.add(fl).multiplyScalar(0.5)).add(V(0, 0.15, 0));
      t.rotation.set(0, 0, 0);
    }
  }
}

function applyGymPose(e: Env, n: GymPose, p: number) {
  for (const o of [e.props.bar, e.props.handle, e.props.towel]) if (o) o.visible = false;
  switch (n) {
    case 'run':
      return run(e, p);
    case 'row':
      return row(e, p);
    case 'cycle':
      return cycle(e, p);
    case 'benchPress':
      return benchPress(e, p);
    case 'spot':
      return spot(e, p);
    case 'squat':
      return squat(e, p);
    case 'punch':
      return punch(e, p);
    case 'sledPush':
      return sledPush(e, p);
    case 'stretch':
      return stretch(e, p);
    case 'coachLead':
      return coachLead(e, p);
    case 'deskServe':
      return deskServe(e, p);
  }
}

/** 健身姿势用到哪件道具 */
const PROP_OF: Partial<Record<GymPose, keyof Props>> = {
  benchPress: 'bar',
  squat: 'bar',
  row: 'handle',
  deskServe: 'towel',
};

// ── 道具（胖：可见的部分 ≥ 3 纹素，杆 = 1 纹素）────────────────

const PROP_OPTS = { ...PERSON, edge: 0.4, convex: 0.3 } as const;
function mesh(geo: THREE.BufferGeometry, mat: THREE.Material) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  return m;
}

/** 杠铃：沿本地 y 的杠（1 纹素粗、1.9 米）+ 两头各一片蓝色杠铃片（直径 0.42、厚 0.12）+ 卡箍；原点 = 杠的中点 */
export function buildBar(ctx: PeopleCtx): THREE.Group {
  const g = new THREE.Group();
  g.name = 'gym-bar';
  const steel = ctx.mat('metal', PROP_OPTS);
  const plate = ctx.mat('clothBlue', { ...PROP_OPTS, edge: 0.5 });
  g.add(mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.9, 6, 1), steel));
  for (const s of [-1, 1]) {
    g.add(mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.12, 12, 1).translate(0, s * 0.82, 0), plate));
    g.add(mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.06, 8, 1).translate(0, s * 0.73, 0), steel));
  }
  ctx.mats.prepare(g);
  return g;
}

/** 划船机的拉手：沿本地 y 的一根横把（1 纹素粗、0.5 米，两头深色握把） */
export function buildHandle(ctx: PeopleCtx): THREE.Group {
  const g = new THREE.Group();
  g.name = 'gym-row-handle';
  const steel = ctx.mat('metal', PROP_OPTS);
  const grip = ctx.mat('ironwork', PROP_OPTS);
  g.add(mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.2, 6, 1), steel));
  for (const s of [-1, 1])
    g.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.15, 6, 1).translate(0, s * 0.175, 0), grip));
  ctx.mats.prepare(g);
  return g;
}

/** 叠好的毛巾：白（0.42 × 0.12 × 0.3）+ 一条青边（同前台台面上那摞） */
export function buildTowel(ctx: PeopleCtx): THREE.Group {
  const g = new THREE.Group();
  g.name = 'gym-towel';
  const white = ctx.mat('clothWhite', { ...PERSON, edge: 0.35, convex: 0.25 });
  const teal = ctx.mat('clothTeal', { ...PERSON, edge: 0.35, convex: 0.2 });
  g.add(mesh(new THREE.BoxGeometry(0.42, 0.12, 0.3), white));
  g.add(mesh(new THREE.BoxGeometry(0.1, 0.125, 0.305).translate(0.1, 0, 0), teal));
  ctx.mats.prepare(g);
  return g;
}

type Fn = (...a: unknown[]) => unknown;
const REAPPLY = ['setProp', 'hold', 'release', 'drop', 'lookAt'] as const;

export interface GymOpts {
  /** pose(name, phase) 不定格：从 phase 开始接着循环（场景里用，同一组人错开拍子） */
  loop?: boolean;
}

/** 像不像 clubsite/people 建的人（有 pose / setSeat，第一个孩子是髋组） */
function personLike(obj: THREE.Object3D): boolean {
  const ud = obj.userData;
  return (
    typeof ud.pose === 'function' && typeof ud.setSeat === 'function' && !!(obj.children[0] as THREE.Group)?.isGroup
  );
}

/**
 * 给 clubsite/people 建好的人加上健身姿势（幂等）。不是人就原样返回。ctx 给道具用（不给就没有杠铃、拉手、毛巾）。返回 obj 自己。
 */
export function gymPerson<T extends THREE.Object3D>(obj: T, ctx?: PeopleCtx, opts: GymOpts = {}): T {
  const ud = obj.userData;
  if (ud.__gym || !personLike(obj)) return obj;
  const root = obj as unknown as THREE.Group;
  let b: Bones;
  let kR: KneeRef;
  let kL: KneeRef;
  try {
    b = findBones(root, false);
    kR = kneeRef(b.legR);
    kL = kneeRef(b.legL);
  } catch {
    return obj;
  }
  ud.__gym = true;
  const body = (root.getObjectByName('kid-body') as THREE.Object3D | undefined) ?? root;
  const props: Props = { bar: null, handle: null, towel: null };
  const e: Env = { b, root, body, kR, kL, seat: null, props };
  const base = {
    pose: ud.pose as (n: string, ph?: number) => void,
    period: ud.period as (n?: string) => number,
    update: ud.update as (dt: number, t?: number) => void,
    setSeat: ud.setSeat as (h: number | null, foot?: number) => void,
  };
  const q = ctx?.params ?? new URLSearchParams(typeof location === 'undefined' ? '' : location.search);
  if (q.has('seat') && q.get('seat') !== 'none')
    e.seat = { h: Number(q.get('seat')), foot: Number(q.get('foot') ?? 0) };

  /** 道具按需建（大多数人用不到） */
  const need = (n: GymPose) => {
    const k = PROP_OF[n];
    if (!k || !ctx || props[k]) return;
    const o = k === 'bar' ? buildBar(ctx) : k === 'handle' ? buildHandle(ctx) : buildTowel(ctx);
    o.visible = false;
    body.add(o);
    props[k] = o;
  };

  let cur: GymPose | null = null;
  let phase = 0;
  let fixed = false;

  const reset = () => {
    unstretch(kR);
    unstretch(kL);
    for (const o of [props.bar, props.handle, props.towel]) if (o) o.visible = false;
  };
  const apply = () => {
    reset();
    if (!cur) return;
    // 底子：clubsite/people 的 sit（换上膝盖腿、骨骼复位；phase 0 = 没有呼吸的偏移），上面整个重摆
    base.pose('sit', 0);
    applyGymPose(e, cur, phase);
  };

  ud.pose = (n: string, ph?: number) => {
    if (isGym(n)) {
      if (cur !== n && ph === undefined) phase = 0;
      cur = n;
      need(n);
      fixed = ph !== undefined && !opts.loop;
      if (ph !== undefined) phase = ((ph % 1) + 1) % 1;
      apply();
    } else {
      cur = null;
      reset();
      base.pose(n, ph);
    }
  };
  ud.poses = [...((ud.poses as string[]) ?? []), ...GYM_POSES];
  ud.period = (n?: string) => (isGym(n) ? GYM_PERIOD[n] : n === undefined && cur ? GYM_PERIOD[cur] : base.period(n));
  ud.update = (dt: number, t?: number) => {
    if (!cur) {
      base.update(dt, t);
      return;
    }
    if (fixed) return;
    phase = (phase + dt / GYM_PERIOD[cur]) % 1;
    apply();
  };
  ud.setSeat = (h: number | null, foot = 0) => {
    e.seat = h === null ? null : { h, foot };
    base.setSeat(h, foot);
    if (cur) apply();
  };
  for (const k of REAPPLY) {
    const f = ud[k] as Fn | undefined;
    if (!f) continue;
    ud[k] = (...a: unknown[]) => {
      const r = f(...a);
      if (cur) apply();
      return r;
    };
  }
  ud.gymPose = () => cur;
  return obj;
}

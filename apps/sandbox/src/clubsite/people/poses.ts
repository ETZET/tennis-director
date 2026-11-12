// 新姿势（rig 没有的）：在 rig 的 idle（骨骼已复位）上面再摆。phase 0..1 播一遍；不给 phase 时按 PERIOD 循环。
// 坐标：body 空间 = 成人的 root 本地坐标（米，正面 +z、右手 −x、地面 y 0）。孩子身上 body 是缩过的空间，姿势照成人写。
// 手臂是一整根（肩 → 拳头 0.44 米），只能转肩，reach() 允许顺着手臂拉长/缩短一点让拳头正好落在目标上。
// 腿：走路类（drag、water、skim、pour）用 rig 原来的直腿；坐、蹲、低重心（sit、clap、sip、crank、dink）换膝盖腿（legs.ts）。
import * as THREE from 'three';
import { type Bones, env, HIP_Y, keys, keysV, lerp, orient, pointIn, reach, smooth, V } from './bones';
import type { Holder } from './hold';
import type { KneeLegs } from './legs';
import { walkLegs } from './rig/rig';

export const NEW_POSES = [
  'sit',
  'clap',
  'sip',
  'call',
  'drag',
  'water',
  'crank',
  'skim',
  'squeegee',
  'dink',
  'dinkB',
  'pour',
  'bkCrouch',
  'bkStand',
  'bkRoll',
  'bkUmbrella',
] as const;
export type NewPose = (typeof NEW_POSES)[number];

/** 每个姿势播一遍的秒数（画廊自动播放；演出按需要自己推 phase） */
export const NEW_PERIOD: Record<NewPose, number> = {
  sit: 3.2,
  clap: 0.5,
  sip: 4,
  drag: 1.1,
  water: 2.4,
  crank: 0.6,
  skim: 1.2,
  dink: 0.6,
  dinkB: 0.6,
  pour: 1.2,
  call: 2.5,
  squeegee: 1.6,
  bkCrouch: 2.4,
  bkStand: 3.2,
  bkRoll: 1.2,
  bkUmbrella: 3.2,
};

/** clap：两只手拍到一起的 phase */
export const CLAP_HIT = 0.5;
/** sip：杯子碰到嘴的那一段 */
export const SIP_AT: [number, number] = [0.42, 0.62];
/** dink / dinkB：拍面碰球的 phase */
export const DINK_HIT = 0.55;
/** pour：壶嘴朝下、出水的那一段 */
export const POUR_FLOW: [number, number] = [0.38, 0.66];
/** skim：网圈在水里往回拖的那一段（之前是抬起来往外推） */
export const SKIM_WET: [number, number] = [0.45, 1];
/** call（裁判报分）：手举在最高的那一段 */
export const CALL_UP: [number, number] = [0.3, 0.6];
/** squeegee：刮头贴地往前推的那一段（之后抬起一点收回来） */
export const SQUEEGEE_PUSH: [number, number] = [0, 0.55];
/** bkRoll：球离手的 phase（userData.rollPoint() 是这一刻球的位置） */
export const BK_ROLL_RELEASE = 0.5;
/** bkRoll：球离手时拳头的位置（body 坐标）；滚的方向 = 人物的 +z */
export const BK_ROLL_HAND = V(-0.22, 0.12, 0.52);

/** 摆姿势要的东西（person.ts 建好传进来） */
export interface PoseEnv {
  b: Bones;
  /** 成人坐标空间（孩子是缩过的） */
  body: THREE.Object3D;
  knees: KneeLegs;
  /** 右手的握持组（工具、杯子） */
  holder: Holder;
  /** 匹克球拍（挂在右拳上；没有拿就是 null） */
  paddle: THREE.Group | null;
  /** 座面高度（臀下沿落在这里）和脚踩的高度（body 坐标，米） */
  seat: { h: number; foot: number } | null;
  /** 绞盘转轴（body 坐标） */
  crank: THREE.Vector3;
  /** 捞网：水面比人站的地面高多少（喷泉池水比广场高 0.42；body 坐标 y） */
  skim: { water: number };
  /** 拖垫的绳子（三段：拳头 → 肩上 → 背后），drag 才显示 */
  rope: { segs: THREE.Mesh[]; tail: THREE.Vector3 };
  /** 结果：工具的方向（water 的出水方向等），body 坐标 */
  out: { dir: THREE.Vector3 | null; crankAngle: number };
  /** 撑伞：伞要遮住的那一点（body 坐标，只用 x、z；默认在人的左前方） */
  shade: THREE.Vector3;
  /** 球童手里的球（bkRoll 出手前显示；挂在右拳上） */
  ball: THREE.Object3D;
}

/** 臀的高度（成人单位），坐着时由座面算：臀部网格下沿在髋下 0.11 */
const BUTT = 0.1;

/** 有工具时：工具上的点（工具本地）→ body 坐标 */
const toolPt = (e: PoseEnv, local: THREE.Vector3) => pointIn(e.body, e.holder.tool!, local);
/** 右拳中心（body 坐标） */
const fistR = (e: PoseEnv) => pointIn(e.body, e.b.armR.hand, V(0, 0, 0));

/** 坐下：臀落在座面上，大腿平伸略往下、小腿竖直（拉长到脚着地，最多 1.9 倍；座太高就悬着），手按在大腿上 */
function seated(e: PoseEnv, lean = -0.06): { hipY: number; chestY: number } {
  const { b, knees } = e;
  const s = e.seat ?? { h: 0.5, foot: 0 };
  const hipY = s.h + BUTT;
  const hipX = -1.32;
  knees.show(true);
  const shin = THREE.MathUtils.clamp(knees.shinFor(hipY - s.foot, hipX), 0.55, 1.9);
  knees.set('R', hipX, -0.08, -hipX, shin);
  knees.set('L', hipX, 0.08, -hipX, shin);
  b.hips.position.y = hipY;
  b.torso.rotation.x = lean;
  b.head.rotation.x = -0.06;
  return { hipY, chestY: hipY + 0.08 + 0.3 };
}

/** 站着拿工具时的默认握法：短的顺着手臂垂着，长的（> 1.2 米）竖着扛在身侧（干活那头朝上） */
export function carryTool(e: PoseEnv): void {
  const g = e.holder.grip;
  if (!g) return;
  if (g.len > 1.2) orient(e.holder.group, e.body, V(0.05, 1, -0.12), V(0, 0, 1));
  else e.holder.group.quaternion.identity();
}

/**
 * 推着长工具走（扫线刷、捞网杆贴地推）：rig 的 push 姿势（走路的腿、前倾）上面，
 * 右手低握杆尾、工具头落在身前地上，左手握 at2。
 */
export function pushTool(e: PoseEnv, p: number): void {
  const { b, body, holder } = e;
  const g = holder.grip;
  if (!g) return;
  const s = Math.sin(p * Math.PI * 2);
  reach(body, b.armR, V(-0.2, 0.68, 0.32 + Math.abs(s) * 0.03));
  const f = fistR(e);
  const len = g.len || 1.4;
  const dy = Math.min(len * 0.95, f.y - 0.08);
  const dir = V(0.12, -dy, Math.sqrt(len * len - dy * dy)).normalize();
  orient(holder.group, body, dir, V(0, 1, 0));
  if (g.at2) reach(body, b.armL, toolPt(e, g.at2));
}

/**
 * 推车（划线车、卷盘车，hold.ts 的 cart）：车立在身前地上，推把中点在身前 0.5 米，两只手握推把两端；
 * walking = 走路的腿（rig 的 push / walk 已经摆好了腿），否则站着扶着车。
 */
export function cartTool(e: PoseEnv, p: number, walking: boolean): void {
  const { b, body, holder } = e;
  const g = holder.grip;
  if (!g?.cart) return;
  const s = walking ? Math.sin(p * Math.PI * 2) : 0;
  b.torso.rotation.x = walking ? 0.2 : 0.1;
  b.head.rotation.x = -0.15;
  const [r, l] = holder.placeCart(V(0, g.at.y, 0.5 + Math.abs(s) * 0.03));
  reach(body, b.armR, r, [0.8, 1.3]);
  reach(body, b.armL, l, [0.8, 1.3]);
}

/** 球童蹲着：膝盖往外分、臀压低、上身前倾，双手扶膝（deep = 0..1 蹲多深） */
function crouch(e: PoseEnv, deep: number): void {
  const { b, knees, body } = e;
  knees.show(true);
  const hipX = lerp(-0.7, -1.2, deep);
  const knee = lerp(1.0, 2.0, deep);
  knees.set('R', hipX, -0.32, knee);
  knees.set('L', hipX, 0.32, knee);
  b.hips.position.y = knees.drop(hipX, knee) - 0.01;
  b.torso.rotation.x = lerp(0.35, 0.5, deep);
  b.head.rotation.x = -0.45;
  const ky = b.hips.position.y + 0.05;
  reach(body, b.armR, V(-0.17, ky, 0.24), [0.75, 1.2]);
  reach(body, b.armL, V(0.17, ky, 0.24), [0.75, 1.2]);
}

export function applyNewPose(e: PoseEnv, name: NewPose, p: number): void {
  const { b, body, knees, holder } = e;
  const breath = Math.sin(p * Math.PI * 2);
  e.out.dir = null;
  e.ball.visible = false;
  switch (name) {
    case 'sit': {
      // 坐着（观众、裁判、长椅上歇脚的）：一遍 = 一次呼吸。手按在大腿中间，身子略往后靠
      const { hipY } = seated(e);
      b.torso.scale.y = 1 + breath * 0.03;
      b.head.position.y += breath * 0.035;
      reach(body, b.armR, V(-0.19, hipY + 0.14, 0.2));
      reach(body, b.armL, V(0.19, hipY + 0.14, 0.2));
      break;
    }
    case 'clap': {
      // 鼓掌（坐着；setSeat(null) 后站着）：0 两手分开在胸前两侧 → CLAP_HIT 拍到一起 → 分开。一遍 = 拍一下
      const t = 0.5 - 0.5 * Math.cos(p * Math.PI * 2);
      let chestY: number;
      if (e.seat) chestY = seated(e, 0.04).chestY;
      else {
        chestY = HIP_Y + 0.08 + 0.3;
        b.armR.sh.rotation.z = 0;
      }
      b.head.rotation.x = -0.12;
      reach(body, b.armR, V(lerp(-0.26, -0.035, t), chestY + 0.02 + t * 0.05, lerp(0.3, 0.4, t)));
      reach(body, b.armL, V(lerp(0.26, 0.035, t), chestY + 0.02 + t * 0.05, lerp(0.3, 0.4, t)));
      break;
    }
    case 'sip': {
      // 坐着喝（setProp('cup')）：0..0.3 杯子在右大腿上 → 抬到嘴边（SIP_AT 段停住、头略仰）→ 放回
      const { hipY } = seated(e);
      const up = smooth(0.28, SIP_AT[0], p) * (1 - smooth(SIP_AT[1], 0.8, p));
      b.torso.scale.y = 1 + breath * 0.02;
      b.head.rotation.x = -0.06 - 0.16 * up;
      const mouthY = hipY + 0.08 + 0.46 + 0.16;
      reach(body, b.armR, V(-0.2, hipY + 0.16, 0.24).lerp(V(-0.1, mouthY - 0.12, 0.36), up));
      reach(body, b.armL, V(0.19, hipY + 0.14, 0.2));
      // 杯口往嘴那边歪
      const tilt = 0.7 * up;
      orient(holder.group, body, V(0, -Math.cos(tilt), Math.sin(tilt)), V(0, Math.sin(tilt), Math.cos(tilt)));
      break;
    }
    case 'drag': {
      // 拖垫（总监拖红土场）：拉绳搭在右肩上、双手在胸前攥着绳往前拉；身子前倾 0.32、步子小而沉。走路循环。
      // 绳子从拳头翻过右肩垂到背后腰高（userData.ropePoint()，拖垫的绳从这里接下去）
      const s = walkLegs(b, p, 0.42);
      b.torso.rotation.x = 0.32;
      b.torso.rotation.y = s * 0.06;
      b.head.rotation.x = -0.3;
      const bob = Math.abs(s) * 0.03;
      reach(body, b.armR, V(-0.17, 0.92 + bob, 0.46));
      reach(body, b.armL, V(-0.02, 0.8 + bob, 0.5));
      // 绳：拳头 → 右肩顶上 → 背后腰高
      const a = fistR(e);
      const top = pointIn(body, b.torso, V(-0.2, 0.55, -0.02));
      const back = pointIn(body, b.torso, V(-0.18, 0.08, -0.3));
      e.rope.tail.copy(back);
      const pts = [a, top, back];
      e.rope.segs.forEach((m, i) => {
        const from = pts[i];
        const to = pts[i + 1];
        m.visible = true;
        m.position.copy(from).add(to).multiplyScalar(0.5);
        m.quaternion.setFromUnitVectors(V(0, 1, 0), to.clone().sub(from).normalize());
        m.scale.set(1, from.distanceTo(to) + 0.04, 1);
      });
      break;
    }
    case 'water': {
      // 浇水（拿着喷头 hold(...)）：两脚分开站稳，右手握喷头在右胯前，左手托着后面的水管（工具的 at2）；
      // 出水方向朝前下，一遍 = 左右扫一趟（中心偏右前）。userData.nozzle() / nozzleDir()
      const yaw = -0.15 + Math.sin(p * Math.PI * 2) * 0.45;
      b.hips.position.y = HIP_Y - 0.04;
      b.legR.rotation.set(0.1, 0, -0.2);
      b.legL.rotation.set(-0.15, 0, 0.2);
      b.torso.rotation.x = 0.12;
      b.torso.rotation.y = yaw * 0.45;
      b.head.rotation.y = yaw * 0.35;
      b.head.rotation.x = -0.1;
      reach(body, b.armR, V(-0.26 + Math.sin(yaw) * 0.16, 0.68, 0.26 + Math.cos(yaw) * 0.1));
      const dir = V(Math.sin(yaw) * 0.85, -0.42, Math.cos(yaw) * 0.85).normalize();
      e.out.dir = dir;
      if (holder.grip) {
        orient(holder.group, body, dir, V(0, 1, 0));
        const g2 = holder.grip.at2;
        reach(body, b.armL, g2 ? toolPt(e, g2) : fistR(e).add(V(0.16, -0.06, -0.14)));
      } else reach(body, b.armL, fistR(e).add(V(0.18, -0.04, -0.1)));
      break;
    }
    case 'crank': {
      // 摇绞盘（总监给网绷紧）：半蹲、上身前倾、右手绕转轴画圈（一遍 = 一圈），左手扶在网柱上（转轴右上方）。
      // 转轴：userData.setCrank(世界坐标)；拿着摇把（hold）时摇把的 axis 一直指着转轴 → 曲柄跟着手转
      knees.show(true);
      const hipX = -0.95;
      const knee = 1.45;
      knees.set('R', hipX - 0.1, -0.2, knee);
      knees.set('L', hipX + 0.15, 0.2, knee - 0.1);
      b.hips.position.y = knees.drop(hipX, knee) - 0.01;
      b.torso.rotation.x = 0.42;
      b.torso.rotation.y = -0.18;
      b.head.rotation.x = -0.32;
      const th = -p * Math.PI * 2;
      e.out.crankAngle = th;
      const r = 0.15;
      const c = e.crank;
      reach(body, b.armR, V(c.x + Math.cos(th) * r, c.y + Math.sin(th) * r, c.z - 0.06), [0.75, 1.25]);
      if (holder.grip) {
        const f = fistR(e);
        orient(holder.group, body, c.clone().sub(f), V(0, 0, -1));
      }
      reach(body, b.armL, V(c.x + 0.2, c.y + 0.22, c.z + 0.02), [0.75, 1.25]);
      break;
    }
    case 'skim': {
      // 捞叶子（长杆捞网 hold(...)，工具要有 tip = 网圈中心、at2 = 前手）：左脚在前的弓步，右手握杆尾在胯边、左手在前；
      // 0..0.4 网圈抬出水面往外推 → SKIM_WET（0.45..1）网圈贴着水面往回拖（水面高 = setSkim({ water })）。
      // 网圈总落在水面上：杆的仰角按拳头高度和杆长算。userData.toolTip() = 网圈中心（世界坐标）
      const out = keys(p, [
        [0, 0],
        [0.4, 1],
        [SKIM_WET[0], 1],
        [1, 0],
      ]);
      const lift = 0.14 * smooth(0.02, 0.1, p) * (1 - smooth(0.32, SKIM_WET[0], p));
      const yaw = Math.sin(p * Math.PI * 2) * 0.12;
      b.hips.position.y = HIP_Y - 0.04;
      b.legL.rotation.set(-0.38, 0, 0.12);
      b.legR.rotation.set(0.28, 0, -0.12);
      b.torso.rotation.x = 0.16 + 0.14 * out;
      b.torso.rotation.y = -0.22 + yaw;
      b.head.rotation.x = -0.2;
      reach(body, b.armR, V(-0.24, 0.7 + 0.1 * out, 0.06 + 0.36 * out));
      const g = holder.grip;
      const f = fistR(e);
      const len = g?.len || 2.6;
      const dy = THREE.MathUtils.clamp(e.skim.water + lift - f.y, -len * 0.9, len * 0.5);
      const h = Math.sqrt(len * len - dy * dy);
      const dir = V(Math.sin(yaw + 0.08) * h, dy, Math.cos(yaw + 0.08) * h).normalize();
      e.out.dir = dir;
      if (g) {
        orient(holder.group, body, dir, V(0, 1, 0));
        reach(body, b.armL, g.at2 ? toolPt(e, g.at2) : f.clone().addScaledVector(dir, 0.6), [0.8, 1.25]);
      } else reach(body, b.armL, f.clone().addScaledVector(dir, 0.6), [0.8, 1.25]);
      break;
    }
    case 'dink':
    case 'dinkB': {
      // 匹克球 dink（厨房线上的轻吊）：膝盖弯、低重心、上身前倾；拍子在身前低处，拍面朝上开着，轻轻往前上推。
      // dink = 正手（身体右侧），dinkB = 反手（拍子横过身前到左侧）。0..0.35 小引拍 → DINK_HIT 碰球 → 0.75 随挥停在身前 → 回准备
      knees.show(true);
      const hipX = -0.55;
      const knee = 0.85;
      knees.set('R', hipX, -0.22, knee);
      knees.set('L', hipX - 0.1, 0.22, knee);
      b.hips.position.y = knees.drop(hipX, knee) - 0.01;
      const fh = name === 'dink';
      const hit = smooth(0.35, DINK_HIT, p);
      b.torso.rotation.x = 0.34 - 0.06 * hit;
      b.torso.rotation.y =
        (fh ? -1 : 1) *
        keys(p, [
          [0, 0.05],
          [0.35, 0.22],
          [DINK_HIT, 0.0],
          [0.8, -0.08],
          [1, 0.05],
        ]);
      b.head.rotation.x = -0.26;
      const sx = fh ? 1 : -1;
      const hand = fh
        ? keysV(p, [
            [0, V(-0.34, 0.6, 0.48)],
            [0.35, V(-0.42, 0.54, 0.3)],
            [DINK_HIT, V(-0.28, 0.6, 0.62)],
            [0.78, V(-0.2, 0.76, 0.66)],
            [1, V(-0.34, 0.6, 0.48)],
          ])
        : keysV(p, [
            [0, V(-0.08, 0.6, 0.5)],
            [0.35, V(0.14, 0.56, 0.32)],
            [DINK_HIT, V(0.04, 0.6, 0.62)],
            [0.78, V(-0.08, 0.76, 0.66)],
            [1, V(-0.08, 0.6, 0.5)],
          ]);
      reach(body, b.armR, hand);
      // 左手：正手时在身前左边平衡，反手时扶一下拍颈附近
      reach(body, b.armL, fh ? V(0.34, 0.74, 0.36) : hand.clone().add(V(0.16, 0.06, -0.06)));
      if (e.paddle) {
        // 拍头方向：准备时朝前上 → 引拍时朝侧后 → 碰球时朝前下（拍面朝上开着）→ 随挥朝前上
        const d = keysV(p, [
          [0, V(-0.25 * sx, 0.35, 1)],
          [0.35, V(-0.8 * sx, 0.1, 0.5)],
          [DINK_HIT, V(-0.2 * sx, -0.3, 1)],
          [0.78, V(-0.1 * sx, 0.45, 1)],
          [1, V(-0.25 * sx, 0.35, 1)],
        ]);
        orient(e.paddle, body, d, V(0, 0.9, 0.35));
      }
      break;
    }
    case 'pour': {
      // 浇花（拿着浇水壶 hold(...)，提手是握点、tip = 壶嘴、at2 = 壶身后下角）：右手把壶提到身前腰高 → 往前倾，
      // 壶嘴朝下出水（POUR_FLOW）→ 回正放下。左手托着壶身。userData.toolTip() = 壶嘴
      const up = env(p, 0, 0.25, 0.78, 1);
      const tilt = 1.0 * env(p, 0.22, POUR_FLOW[0], POUR_FLOW[1], 0.8);
      b.hips.position.y = HIP_Y - 0.02 * up;
      b.legL.rotation.x = -0.18;
      b.legR.rotation.x = 0.1;
      b.torso.rotation.x = 0.14 * up;
      b.head.rotation.x = 0.12 * up;
      reach(body, b.armR, V(-0.3, 0.56, 0.08).lerp(V(-0.2, 0.84, 0.44), up));
      orient(holder.group, body, V(0, -Math.cos(tilt), -Math.sin(tilt)), V(0, -Math.sin(tilt), Math.cos(tilt)));
      e.out.dir = V(0, -Math.sin(tilt), Math.cos(tilt));
      const g2 = holder.grip?.at2;
      if (g2) reach(body, b.armL, toolPt(e, g2), [0.8, 1.3]);
      else reach(body, b.armL, V(0.3, 0.55, 0.05).lerp(V(0.05, 0.7, 0.4), up));
      break;
    }
    case 'call': {
      // 裁判报分（坐着）：CALL_UP 段右手举过头（手掌朝前），左手留在大腿上；头略抬
      const { hipY, chestY } = seated(e, 0);
      const up = env(p, 0.12, CALL_UP[0], CALL_UP[1], 0.8);
      b.head.rotation.x = -0.06 - 0.12 * up;
      reach(body, b.armR, V(-0.19, hipY + 0.14, 0.2).lerp(V(-0.34, chestY + 0.62, 0.14), up), [0.8, 1.25]);
      reach(body, b.armL, V(0.19, hipY + 0.14, 0.2));
      break;
    }
    case 'squeegee': {
      // 刮水（长柄刮水板 hold(...)，tip = 刮头底边中点，at2 = 前手）：弓步，双手握柄，
      // SQUEEGEE_PUSH 段刮头贴地往前推 → 抬起 6 厘米收回来。toolTip() = 刮头（水洼的 squeegee(x, z, …) 用它）
      const g = holder.grip;
      const k = keys(p, [
        [0, 0],
        [SQUEEGEE_PUSH[1], 1],
        [0.65, 1],
        [1, 0],
      ]);
      const lift = 0.06 * smooth(SQUEEGEE_PUSH[1], 0.65, p) * (1 - smooth(0.9, 1, p));
      b.hips.position.y = HIP_Y - 0.05;
      b.legL.rotation.set(-0.42, 0, 0.1);
      b.legR.rotation.set(0.32, 0, -0.1);
      b.torso.rotation.x = 0.22 + 0.16 * k;
      b.head.rotation.x = -0.28;
      reach(body, b.armR, V(-0.2, 0.78 - 0.06 * k, 0.16 + 0.34 * k));
      const f = fistR(e);
      const len = g?.len || 1.6;
      const dy = THREE.MathUtils.clamp(0.05 + lift - f.y, -len * 0.95, 0);
      const dir = V(0.08, dy, Math.sqrt(len * len - dy * dy)).normalize();
      e.out.dir = V(0, 0, 1);
      if (g && !g.cart) {
        orient(holder.group, body, dir, V(0, 0.3, 1));
        reach(body, b.armL, g.at2 ? toolPt(e, g.at2) : f.clone().addScaledVector(dir, 0.45), [0.8, 1.25]);
      } else reach(body, b.armL, f.clone().addScaledVector(dir, 0.45), [0.8, 1.25]);
      break;
    }
    case 'bkCrouch': {
      // 球童蹲在网柱旁 / 底线角：膝盖外分、双手扶膝、头抬起看场上；一遍 = 一次呼吸（身子一起一伏 1 厘米）
      crouch(e, 1);
      b.hips.position.y += breath * 0.012;
      break;
    }
    case 'bkStand': {
      // 球童站在底线角：两脚略分、手背在身后（两只手在腰后碰在一起），一遍 = 一次呼吸
      b.legR.rotation.z = -0.08;
      b.legL.rotation.z = 0.08;
      b.torso.scale.y = 1 + breath * 0.03;
      b.head.position.y += breath * 0.03;
      reach(body, b.armR, V(-0.07, 0.6, -0.2), [0.85, 1.15]);
      reach(body, b.armL, V(0.07, 0.6, -0.2), [0.85, 1.15]);
      break;
    }
    case 'bkRoll': {
      // 把球滚给发球的人（朝人物 +z）：蹲着 → 0..0.3 右手往后引 → BK_ROLL_RELEASE 贴地往前送、松手 → 随挥 → 回到蹲
      const lift = env(p, 0.1, 0.3, 0.7, 0.95);
      crouch(e, 1 - 0.45 * lift);
      b.torso.rotation.x += 0.15 * smooth(0.3, BK_ROLL_RELEASE, p) * (1 - smooth(0.7, 1, p));
      b.torso.rotation.y = keys(p, [
        [0, 0],
        [0.3, 0.3],
        [BK_ROLL_RELEASE, -0.1],
        [0.8, 0],
      ]);
      const rest = V(-0.17, b.hips.position.y + 0.05, 0.24);
      reach(
        body,
        b.armR,
        keysV(p, [
          [0.05, rest],
          [0.3, V(-0.32, 0.3, -0.18)],
          [BK_ROLL_RELEASE, BK_ROLL_HAND],
          [0.72, V(-0.18, 0.28, 0.62)],
          [0.95, rest],
        ]),
        [0.75, 1.3],
      );
      e.ball.visible = p > 0.04 && p < BK_ROLL_RELEASE;
      break;
    }
    case 'bkUmbrella': {
      // 换边时给坐着的球员撑伞（setProp('umbrella')，pose 会自己拿上）：站在长椅旁，右手在胸前握伞柄、左手在下面；
      // 伞往 setShade(世界坐标) 那边斜（默认左前方 0.7 米），伞面盖住坐着的人的头。一遍 = 一次呼吸（伞轻轻晃）
      b.legR.rotation.z = -0.06;
      b.legL.rotation.z = 0.06;
      b.torso.scale.y = 1 + breath * 0.02;
      b.head.rotation.x = -0.1;
      reach(body, b.armR, V(-0.1, 1.0 + breath * 0.01, 0.24), [0.8, 1.2]);
      const f = fistR(e);
      const h = V(e.shade.x - f.x, 0, e.shade.z - f.z);
      if (h.length() > 0.9) h.setLength(0.9);
      const dir = V(h.x + breath * 0.03, 1.25, h.z);
      if (holder.grip) {
        orient(holder.group, body, dir, V(0, 0, 1));
        const g2 = holder.grip.at2;
        reach(body, b.armL, g2 ? toolPt(e, g2) : f.clone().add(V(0.05, -0.2, 0)), [0.8, 1.25]);
      }
      break;
    }
  }
}

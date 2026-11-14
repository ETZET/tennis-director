// 给 desert3d-v2 的 buildPerson 建好的人包一层：新姿势、膝盖腿、匹克球拍、杯子、手里挂任意工具、看向某一点、孩子的比例。
// rig 只当"给一个姿势名 + phase 就把骨骼摆好"的函数用（userData.pose(name, phase) 总给 phase）；时间、呼吸、道具都在这里管。
// API 见 index.ts 顶上的说明。
import * as THREE from 'three';
import { type Bones, findBones, HIP_Y, orient, reach, V } from './bones';
import { type GripSpec, Holder } from './hold';
import { addKneeLegs } from './legs';
import {
  applyNewPose,
  BK_ROLL_HAND,
  carryTool,
  cartTool,
  NEW_PERIOD,
  NEW_POSES,
  type NewPose,
  type PoseEnv,
  pushTool,
} from './poses';
import {
  buildBall,
  buildCup,
  buildPaddle,
  buildStandIn,
  buildUmbrella,
  PERSON,
  type PeopleCtx,
  STAND_INS,
  type StandIn,
} from './props';

/** rig 的姿势和每遍秒数（rig.ts 的 POSES / PERIOD 不导出 PERIOD，照抄） */
export const RIG_PERIOD = {
  idle: 3,
  walk: 0.9,
  ready: 1.2,
  forehand: 1.1,
  backhand: 1.1,
  serve: 1.6,
  sweep: 1.3,
  feed: 1.6,
  blow: 2.4,
  push: 0.9,
  pickup: 0.5,
  dump: 1.6,
} as const;
type RigPose = keyof typeof RIG_PERIOD;
const RIG_POSES = Object.keys(RIG_PERIOD) as RigPose[];
const RIG_PROPS = ['racket', 'broom', 'blower', 'picker'] as const;
type RigProp = (typeof RIG_PROPS)[number];

export const ALL_POSES = [...RIG_POSES, ...NEW_POSES];
export type PoseName = RigPose | NewPose;

export interface PersonOpts {
  /** rig 在右手里建了网球拍（球员、教练） */
  hasRacket: boolean;
  /** 匹克球拍的颜色（调色板名字；默认 paddle 珊瑚） */
  paddleKey?: string;
  /** setProp('racket') 当成 'paddle'（匹克球场景：没有网球拍） */
  racketIsPaddle?: boolean;
  /** 孩子 / 少年的比例（KID、TEEN）；不给 = 大人 */
  scale?: BodyScale;
  /** 默认手里拿什么（不给 = rig 的默认） */
  defaultProp?: string | null;
}

export interface BodyScale {
  /** 身子整体（臀以下的一切和上身） */
  body: number;
  /** 腿再短多少 */
  leg: number;
  /** 头再大多少 */
  head: number;
}
/** 孩子：身子整体 0.66、腿再短 0.85、头放大 1.24 → 身高 ≈ 1.2 米、头 ≈ 0.5 米（头身比 ≈ 1:2.4，成人 ≈ 1:2.9） */
export const KID: BodyScale = { body: 0.66, leg: 0.85, head: 1.24 };
/** 少年（球童）：0.8 / 0.92 / 1.12 → 身高 ≈ 1.45 米 */
export const TEEN: BodyScale = { body: 0.8, leg: 0.92, head: 1.12 };

const isRigPose = (n: string): n is RigPose => n in RIG_PERIOD;
const isNewPose = (n: string): n is NewPose => (NEW_POSES as readonly string[]).includes(n);
const isRigProp = (n: string): n is RigProp => (RIG_PROPS as readonly string[]).includes(n);

export function wrapPerson(ctx: PeopleCtx, root: THREE.Group, opts: PersonOpts): THREE.Group {
  const b: Bones = findBones(root, opts.hasRacket);
  const rigPose = root.userData.pose as (n: string, ph?: number) => void;
  const rigSetProp = root.userData.setProp as (n: string | null) => void;
  const rigNozzle = root.userData.nozzle as (() => THREE.Vector3) | undefined;
  const rigNozzleDir = root.userData.nozzleDir as (() => THREE.Vector3) | undefined;
  const picker = root.userData.picker as THREE.Object3D | undefined;
  /** rig 建好时手里的道具（球员、教练 racket，总监 broom；?prop 设过的话按它） */
  const rigProp0 = ((root.userData.prop as () => string | null)?.() ?? null) as RigProp | null;

  // ── 孩子：身子、头、腿按比例缩（root 自己的 scale 留给场景摆放）──
  let body: THREE.Object3D = root;
  let hipK = 1;
  const sc = opts.scale;
  if (sc) {
    b.hips.scale.setScalar(sc.body);
    b.head.scale.setScalar(sc.head);
    b.legR.scale.y = b.legL.scale.y = sc.leg;
    hipK = sc.body * sc.leg;
    // 腿短：walk 一个周期走得也短（strideOf 读它）
    root.userData.strideK = hipK;
    // body 空间：成人坐标 → 孩子身上（上身缩 body，臀的高度缩 body × leg）
    body = new THREE.Group();
    body.name = 'kid-body';
    body.position.y = -HIP_Y * sc.body * (1 - sc.leg);
    body.scale.setScalar(sc.body);
    root.add(body);
  }

  const knees = addKneeLegs(b);
  const holder = new Holder(b.armR.hand, body);
  // 匹克球拍：挂在右拳上（同 rig 的球拍），rig 的姿势里照抄球拍的朝向
  const paddle = buildPaddle(ctx, opts.paddleKey ?? 'paddle');
  paddle.visible = false;
  paddle.rotation.set(-0.35, 0, 0);
  b.armR.hand.add(paddle);
  const cup = buildCup(ctx);
  const umbrella = buildUmbrella(ctx);
  const ball = buildBall(ctx);
  b.armR.hand.add(ball);
  // 拖垫的绳子（三段 1 纹素粗；drag 才显示）
  const ropeMat = ctx.mat('dryGrass', { ...PERSON, edge: 0.3, convex: 0 });
  const segs = [0, 1].map(() => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1, 5, 1), ropeMat);
    m.visible = false;
    body.add(m);
    return m;
  });
  ctx.mats.prepare(root);

  const e: PoseEnv = {
    b,
    body,
    knees,
    holder,
    paddle: null,
    seat: { h: 0.52, foot: 0 },
    crank: V(-0.12, 0.62, 0.55),
    skim: { water: 0.42 },
    rope: { segs, tail: V(0, 0.6, -0.3) },
    out: { dir: null, crankAngle: 0 },
    shade: V(0.7, 0, 0.2),
    ball,
  };

  // ── 状态 ──
  let current: PoseName = 'idle';
  let phase = 0;
  let fixed = false;
  /** 手里拿的：rig 的道具名、paddle、cup、tool（hold 进来的工具，toolName 是它的名字）、null */
  let held: string | null = null;
  let toolName: string | null = null;
  let rigProp: RigProp | null = rigProp0;
  let look: THREE.Vector3 | null = null;
  const tools: Record<string, { obj: THREE.Object3D; grip?: GripSpec }> = {};

  const setRigProp = (n: RigProp | null) => {
    if (rigProp === n) return;
    rigProp = n;
    rigSetProp(n);
  };

  /** 姿势之后：孩子的臀高、看向某一点 */
  const post = () => {
    if (hipK !== 1) {
      b.hips.position.y *= hipK;
      b.hips.position.z *= sc!.body;
    }
    if (look) {
      root.updateMatrixWorld(true);
      const t = b.torso.worldToLocal(look.clone()).sub(b.head.position);
      const yaw = THREE.MathUtils.clamp(Math.atan2(t.x, t.z), -1.35, 1.35);
      // 转不过来的部分分给躯干一点
      const extra = yaw - THREE.MathUtils.clamp(yaw, -0.85, 0.85);
      b.torso.rotation.y += extra * 0.6;
      b.head.rotation.y = yaw - extra * 0.6;
      const pitch = Math.atan2(t.y - 0.3, Math.hypot(t.x, t.z));
      b.head.rotation.x += THREE.MathUtils.clamp(-pitch * 0.5, -0.3, 0.3);
    }
  };

  const apply = () => {
    const p = phase;
    // 复位这一层自己加的东西（rig 的 reset 不管 scale、膝盖腿、绳子）
    knees.show(false);
    b.armR.sh.scale.set(1, 1, 1);
    b.armL.sh.scale.set(1, 1, 1);
    for (const s of segs) s.visible = false;
    paddle.visible = held === 'paddle';
    e.paddle = held === 'paddle' ? paddle : null;
    holder.group.quaternion.identity();
    paddle.rotation.set(-0.35, 0, 0);
    ball.visible = false;

    if (isNewPose(current)) {
      setRigProp(null);
      rigPose('idle', 0);
      b.armR.sh.rotation.z = -0.12;
      b.armL.sh.rotation.z = 0.12;
      applyNewPose(e, current, p);
      // 拿着球拍、杯子以外的东西坐下：拍子收起来（观众不举着拍子）
      if (held === 'paddle' && current !== 'dink' && current !== 'dinkB') {
        paddle.visible = !['sit', 'clap', 'sip', 'call'].includes(current);
        orient(paddle, body, V(-0.1, -1, 0.3));
      }
    } else {
      const rp: RigProp | null = held && isRigProp(held) ? held : held === 'paddle' && b.racket ? 'racket' : null;
      setRigProp(rp);
      rigPose(current, p);
      if (held === 'paddle' && b.racket) {
        // rig 摆的是球拍：把球拍藏起来，匹克球拍照抄它的朝向
        b.racket.visible = false;
        paddle.quaternion.copy(b.racket.quaternion);
      }
      if (current === 'idle') {
        // 呼吸（同 rig 的 update：躯干一伸一缩、头和肩跟着上下）
        const s = Math.sin(p * Math.PI * 2);
        b.torso.scale.y = 1 + s * 0.035;
        b.head.position.y += s * 0.045;
        b.armR.sh.position.y += s * 0.02;
        b.armL.sh.position.y += s * 0.02;
        if (!rp) {
          b.armR.sh.rotation.z = -0.12 - s * 0.03;
          b.armL.sh.rotation.z = 0.12 + s * 0.03;
        }
      }
      if (held === 'tool' || held === 'cup' || held === 'umbrella') {
        if (holder.cart) cartTool(e, p, current === 'push' || current === 'walk');
        else if (current === 'push') pushTool(e, p);
        else carryTool(e);
      }
    }
    post();
  };

  const pose = (n: string, ph?: number) => {
    current = isRigPose(n) || isNewPose(n) ? n : 'idle';
    // 撑伞：手里没有伞就自己拿上
    if (current === 'bkUmbrella' && held !== 'umbrella') {
      releaseTool();
      holder.attach(umbrella);
      held = 'umbrella';
    }
    fixed = ph !== undefined;
    phase = (((ph ?? 0) % 1) + 1) % 1;
    apply();
  };
  const period = () => (isNewPose(current) ? NEW_PERIOD[current] : RIG_PERIOD[current]);

  const releaseTool = (to?: THREE.Object3D | null) => {
    const t = holder.release(to);
    if (held === 'tool' || held === 'cup' || held === 'umbrella') held = null;
    toolName = null;
    return t;
  };
  const setProp = (nIn: string | null) => {
    let n = nIn;
    if (n === 'racket' && opts.racketIsPaddle) n = 'paddle';
    if (n !== 'tool') releaseTool();
    if (n === null || n === 'none') held = null;
    else if (isRigProp(n)) held = n;
    else if (n === 'paddle') held = 'paddle';
    else if (n === 'cup') {
      holder.attach(cup, { at: [0, 0, 0] });
      held = 'cup';
    } else if (n === 'umbrella') {
      holder.attach(umbrella);
      held = 'umbrella';
    } else if (tools[n]) {
      holder.attach(tools[n].obj, tools[n].grip);
      held = 'tool';
      toolName = n;
    } else if ((STAND_INS as string[]).includes(n)) {
      tools[n] = { obj: buildStandIn(ctx, n as StandIn) };
      holder.attach(tools[n].obj);
      held = 'tool';
      toolName = n;
    } else held = null;
    apply();
  };

  // ── userData ──
  const ud = root.userData;
  ud.pose = pose;
  ud.poses = ALL_POSES;
  /** 是一个人（clubwalk 的演员表按它在场景里找人）；poseName() 现在的姿势（点人时"在干什么"用） */
  ud.isPerson = true;
  ud.poseName = () => current;
  ud.period = (n?: string) => (n && isNewPose(n) ? NEW_PERIOD[n] : n && isRigPose(n) ? RIG_PERIOD[n] : period());
  ud.update = (dt: number) => {
    if (fixed) return;
    phase = (phase + dt / period()) % 1;
    apply();
    // 画廊自动播放：推着走时捡球器的笼子跟着滚（演出里由调用方 picker.userData.roll）
    if (picker && held === 'picker' && (current === 'push' || current === 'walk')) picker.userData.roll?.(dt, 1.1);
  };
  ud.setProp = setProp;
  ud.prop = () => (held === 'tool' ? toolName : held);
  /** bkUmbrella：伞往这个世界坐标点那边斜（坐着的球员）；null = 默认左前方 0.7 米 */
  ud.setShade = (p: THREE.Vector3 | null) => {
    if (p) {
      root.updateMatrixWorld(true);
      e.shade.copy(body.worldToLocal(p.clone()));
    } else e.shade.set(0.7, 0, 0.2);
    apply();
  };
  /** bkRoll：球离手（BK_ROLL_RELEASE）那一刻球的世界坐标、滚的方向（人物的 +z，世界坐标单位向量） */
  ud.rollPoint = () => {
    root.updateMatrixWorld(true);
    return body.localToWorld(BK_ROLL_HAND.clone().setY(0.1));
  };
  ud.rollDir = () => {
    root.updateMatrixWorld(true);
    return new THREE.Vector3(0, 0, 1).transformDirection(root.matrixWorld);
  };
  /** 登记一件工具（之后 setProp(name) 就拿起它；SLOTS 的 prop 可以写这个名字） */
  ud.addTool = (name: string, obj: THREE.Object3D, grip?: GripSpec) => {
    tools[name] = { obj, grip };
  };
  /** 直接把一件工具拿到右手（grip 不给就读 obj.userData.grip） */
  ud.hold = (obj: THREE.Object3D, grip?: GripSpec, name = obj.name || 'tool') => {
    tools[name] = { obj, grip };
    setProp(name);
  };
  /** 松手：工具挂到 to（默认人物的父级，保持世界位置）；返回工具 */
  ud.release = (to?: THREE.Object3D | null) => {
    const t = releaseTool(to === undefined ? root.parent : to);
    apply();
    return t;
  };
  /** 放到脚边的地上：松手，工具回到自己的放置朝向（只保留人的朝向），落地（y = 人的地面） */
  ud.drop = () => {
    const t = releaseTool(root.parent);
    if (t) {
      const yaw = new THREE.Euler().setFromQuaternion(root.getWorldQuaternion(new THREE.Quaternion()), 'YXZ').y;
      t.rotation.set(0, yaw, 0);
      t.position.y = root.position.y;
      if (t.userData.state === 'held') t.userData.setState?.('ground');
      t.userData.onDrop?.();
    }
    apply();
    return t;
  };
  ud.tool = () => holder.tool;
  /** 工具的 tip（网圈、出水口、壶嘴）的世界坐标；没有就 null */
  ud.toolTip = () => (holder.tool && holder.grip?.tip ? holder.world(holder.grip.tip) : null);
  /** 拳头中心的世界坐标 */
  ud.handPoint = (side: 'R' | 'L' = 'R') => {
    root.updateMatrixWorld(true);
    return (side === 'R' ? b.armR.hand : b.armL.hand).getWorldPosition(new THREE.Vector3());
  };
  /** 头转向一个世界坐标点（±1.35 弧度，超过 0.85 的部分躯干分一点）；null 恢复。所有姿势都生效 */
  ud.lookAt = (p: THREE.Vector3 | null) => {
    look = p ? p.clone() : null;
    apply();
  };
  /** 座面高度 h（米，人物本地；长椅 0.52，裁判椅 1.77）和脚踩的高度 foot（裁判椅的平台 1.54）；null = 站着（clap 站着拍） */
  ud.setSeat = (h: number | null, foot = 0) => {
    e.seat = h === null ? null : { h, foot };
    apply();
  };
  /** 绞盘转轴的世界坐标（crank 姿势的手绕它画圈）；null = 默认（身前右下 (−0.12, 0.62, 0.55)） */
  ud.setCrank = (p: THREE.Vector3 | null) => {
    if (p) {
      root.updateMatrixWorld(true);
      e.crank.copy(body.worldToLocal(p.clone()));
    } else e.crank.set(-0.12, 0.62, 0.55);
    apply();
  };
  /** crank：当前曲柄角（弧度，0 = 手在转轴右边（人物 −x），一遍转一圈）——让绞盘的鼓跟着转 */
  ud.crankAngle = () => e.out.crankAngle;
  /** skim：水面比人站的地面高多少米（默认 0.42 = 喷泉池水比广场高 0.42） */
  ud.setSkim = (o: { water?: number }) => {
    if (o.water !== undefined) e.skim.water = o.water;
    apply();
  };
  /** water / 吹叶机：出水口（世界坐标） */
  ud.nozzle = () => {
    if (current === 'water' || held === 'tool') {
      const tip = ud.toolTip() as THREE.Vector3 | null;
      if (tip) return tip;
      root.updateMatrixWorld(true);
      return b.armR.hand.localToWorld(V(0, -0.25, 0));
    }
    return rigNozzle?.() ?? b.armR.hand.getWorldPosition(new THREE.Vector3());
  };
  /** water / skim / pour：工具朝的方向（世界坐标单位向量）；吹叶机交给 rig */
  ud.nozzleDir = () => {
    if (e.out.dir && isNewPose(current)) {
      root.updateMatrixWorld(true);
      return e.out.dir.clone().transformDirection(body.matrixWorld);
    }
    return rigNozzleDir?.() ?? new THREE.Vector3(0, -1, 0);
  };
  /** drag：绳子从背后腰高垂下去的点（世界坐标）—— 拖垫的绳从这里接到拖杆 */
  ud.ropePoint = () => {
    root.updateMatrixWorld(true);
    if (current !== 'drag') return b.torso.localToWorld(V(-0.18, 0.08, -0.3));
    return body.localToWorld(e.rope.tail.clone());
  };
  /** 摆一个姿势时拳头能不能够到（调试用）：reach 的余量 */
  ud._reach = (side: 'R' | 'L', target: THREE.Vector3) => reach(body, side === 'R' ? b.armR : b.armL, target);

  // ── 默认道具、画廊参数 ──
  // ?prop=paddle|cup|racket|broom|blower|picker|none|<代用工具 skim|hose|crank|can|brush>
  // ?seat=<座高>|none &foot=<脚高> · ?look=x,y,z（世界坐标）· ?water=<水面高> · ?pose=<名字>&phase=<0..1>
  const q = ctx.params;
  const prq = q.get('prop');
  if (q.has('seat'))
    e.seat = q.get('seat') === 'none' ? null : { h: Number(q.get('seat')), foot: Number(q.get('foot') ?? 0) };
  if (q.has('water')) e.skim.water = Number(q.get('water'));
  if (q.has('look')) {
    const [x, y, z] = (q.get('look') ?? '').split(',').map(Number);
    look = V(x, y, z);
  }
  const pq = q.get('pose');
  const phq = q.get('phase');
  current = pq && (isRigPose(pq) || isNewPose(pq)) ? pq : 'idle';
  phase = phq !== null ? Number(phq) % 1 : 0;
  fixed = phq !== null;
  const def =
    prq !== null ? (prq === 'none' ? null : prq) : opts.defaultProp !== undefined ? opts.defaultProp : undefined;
  if (def !== undefined) setProp(def);
  else {
    held = rigProp0 === 'racket' && opts.racketIsPaddle ? 'paddle' : rigProp0;
    apply();
  }
  return root;
}

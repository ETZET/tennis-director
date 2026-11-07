// Q 版人物的骨骼和姿势（player、director 共用）。
// 骨骼 = 一层层 THREE.Group（臀 → 躯干 → 头 / 肩 → 手；臀 → 腿），每个部件一个小网格，法线按部件中心算（blobNormals）→ 每块都是清楚的亮顶、中腰、暗底。
// 尺寸按 0.09 米/纹素：手臂、腿 ≥ 0.24 米粗（≈ 3 纹素），头直径 0.62 米（≈ 7 纹素），总高 ≈ 1.8 米。
// 正面朝 +z（镜头）；人物的右手在 −x。
// userData.pose(name, phase)：idle / walk / ready / forehand / backhand / serve / sweep / feed / blow / push，phase 0..1。
// userData.setProp('racket' | 'broom' | 'blower' | 'picker' | null)：换手里的道具（只认 Look 里建了的）。
// 拿吹叶机时 userData.nozzle() / nozzleDir()（世界坐标）；拿捡球器时 userData.picker 是捡球器对象（roll / setCount）。
// userData.update(dt, t)：idle 时呼吸；没有固定 phase 时其他姿势按时间循环播放。
import * as THREE from 'three';
import { blobNormals } from '../../toon';
import type { AssetCtx } from '../../world';

type Mat = THREE.Material;

export interface Look {
  skin: Mat;
  hair: Mat;
  shirt: Mat;
  /** 短裤、裙子、长裤 */
  bottom: Mat;
  bottomKind: 'shorts' | 'skirt' | 'pants';
  shoes: Mat;
  hairStyle: 'short' | 'ponytail' | 'cap';
  /** 帽子（cap 发型的帽舌颜色） */
  cap?: Mat;
  /** 领口、袖口的滚边 */
  trim?: Mat;
  /** 宽檐草帽（总监） */
  straw?: { hat: Mat; band: Mat };
  hold: { kind: 'racket'; frame: Mat; strings: Mat; grip: Mat; ball: Mat } | { kind: 'broom'; wood: Mat; head: Mat };
  /** 太阳镜（代替两只眼睛：一条 4 纹素宽的深色横条） */
  shades?: Mat;
  /** 胡子（脸下半一块 3 纹素宽的色块，年纪大的人） */
  mustache?: Mat;
  /** 胸前的哨子（一个 2～3 纹素的亮块） */
  whistle?: Mat;
  /** 躯干横向放大（发福），默认 1 */
  stout?: number;
  /** 手提吹叶机（教练）：橙色机身 + 粗管。setProp('blower') 时拿在手上 */
  blower?: { body: Mat; tube: Mat; dark: Mat };
  /** 推式捡球器（总监）：外面建好的对象（assets/ball-picker.ts），userData.handle = 柄的转轴组，柄沿本地 +y */
  picker?: THREE.Object3D;
}

export const POSES = [
  'idle',
  'walk',
  'ready',
  'forehand',
  'backhand',
  'serve',
  'sweep',
  'feed',
  'blow',
  'push',
] as const;
export type PoseName = (typeof POSES)[number];
/** 手里的道具（setProp）：只有这个人建了的才能拿 */
export type PropName = 'racket' | 'broom' | 'blower' | 'picker';
/** feed：球离手（被球拍送出去）的 phase */
export const FEED_RELEASE = 0.6;

/** 每个姿势循环一次的秒数（画廊里自动播放用） */
const PERIOD: Record<PoseName, number> = {
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
};

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const lerp = THREE.MathUtils.lerp;
const smooth = (a: number, b: number, t: number) => {
  const k = THREE.MathUtils.clamp((t - a) / (b - a), 0, 1);
  return k * k * (3 - 2 * k);
};

/** 一个部件：几何体平移到位、法线从部件中心往外（球面法线）。 */
function part(geo: THREE.BufferGeometry, mat: Mat, at: THREE.Vector3, center?: THREE.Vector3): THREE.Mesh {
  geo.translate(at.x, at.y, at.z);
  blobNormals(geo, center ?? at.clone());
  return new THREE.Mesh(geo, mat);
}
/** 手臂、腿：保留胶囊自己的法线（横向一圈亮暗，不会整条下半截落暗档） */
function limb(geo: THREE.BufferGeometry, mat: Mat, at: THREE.Vector3): THREE.Mesh {
  geo.translate(at.x, at.y, at.z);
  return new THREE.Mesh(geo, mat);
}

const HIP_Y = 0.5;
const SH_X = 0.27;

export function buildPerson(ctx: AssetCtx, look: Look, name: string): THREE.Group {
  const root = new THREE.Group();
  root.name = name;

  // ── 骨骼 ──
  const hips = new THREE.Group();
  hips.position.set(0, HIP_Y, 0);
  root.add(hips);
  const torso = new THREE.Group();
  torso.position.set(0, 0.08, 0);
  hips.add(torso);
  const head = new THREE.Group();
  head.position.set(0, 0.46, 0);
  torso.add(head);
  const mkArm = (side: 1 | -1) => {
    const sh = new THREE.Group();
    sh.position.set(side * SH_X, 0.4, 0);
    torso.add(sh);
    const hand = new THREE.Group();
    hand.position.set(0, -0.44, 0);
    sh.add(hand);
    return { sh, hand };
  };
  const armR = mkArm(-1);
  const armL = mkArm(1);
  const mkLeg = (side: 1 | -1) => {
    const g = new THREE.Group();
    g.position.set(side * 0.115, 0, 0);
    hips.add(g);
    return g;
  };
  const legR = mkLeg(-1);
  const legL = mkLeg(1);

  // ── 身体网格 ──
  // 躯干：八棱柱（平的一面朝前），上宽下窄，前后压扁
  {
    const g = new THREE.CylinderGeometry(0.25, 0.22, 0.46, 8, 1);
    g.rotateY(Math.PI / 8);
    g.scale(look.stout ?? 1, 1, 0.74 * (look.stout ?? 1));
    torso.add(part(g, look.shirt, V(0, 0.25, 0), V(0, 0.18, 0)));
    if (look.whistle) {
      // 哨子：胸口偏右一个小亮块（3 × 2 纹素），挂绳太细不画
      const w = new THREE.BoxGeometry(0.2, 0.14, 0.12);
      torso.add(part(w, look.whistle, V(-0.06, 0.3, 0.2 * (look.stout ?? 1)), V(-0.06, 0.4, 0.1)));
    }
    if (look.trim) {
      // 领口一圈（2 纹素高）+ 下摆一圈
      const c = new THREE.CylinderGeometry(0.17, 0.24, 0.1, 8, 1);
      c.rotateY(Math.PI / 8);
      c.scale(1, 1, 0.78);
      torso.add(part(c, look.trim, V(0, 0.47, 0), V(0, 0.3, 0)));
      const h = new THREE.CylinderGeometry(0.225, 0.225, 0.08, 8, 1);
      h.rotateY(Math.PI / 8);
      h.scale(1, 1, 0.78);
      torso.add(part(h, look.trim, V(0, 0.02, 0), V(0, 0.15, 0)));
    }
  }
  // 臀：短裤 / 裙子 / 长裤的裤腰
  {
    const k = look.bottomKind;
    const g =
      k === 'skirt'
        ? new THREE.CylinderGeometry(0.23, 0.34, 0.3, 8, 1)
        : new THREE.CylinderGeometry(0.235, 0.25, k === 'pants' ? 0.2 : 0.26, 8, 1);
    g.rotateY(Math.PI / 8);
    g.scale(1, 1, 0.8);
    hips.add(part(g, look.bottom, V(0, k === 'skirt' ? -0.04 : 0.02, 0), V(0, 0.15, 0)));
  }
  // 腿：一根胶囊 + 鞋（长裤时腿就是裤子）
  for (const leg of [legL, legR]) {
    const legMat = look.bottomKind === 'pants' ? look.bottom : look.skin;
    const r = look.bottomKind === 'pants' ? 0.135 : 0.115;
    const g = new THREE.CapsuleGeometry(r, 0.26, 2, 8);
    leg.add(limb(g, legMat, V(0, -0.24, 0)));
    const s = new THREE.BoxGeometry(0.22, 0.12, 0.32);
    leg.add(part(s, look.shoes, V(0, -0.44, 0.04), V(0, -0.3, 0.02)));
  }
  // 手臂：短袖（衣服色）+ 前臂（皮肤）+ 拳头
  for (const a of [armL, armR]) {
    const sl = new THREE.CapsuleGeometry(0.14, 0.06, 2, 8);
    a.sh.add(part(sl, look.shirt, V(0, -0.08, 0)));
    if (look.trim) {
      const cuff = new THREE.CylinderGeometry(0.15, 0.15, 0.07, 8, 1);
      a.sh.add(part(cuff, look.trim, V(0, -0.2, 0)));
    }
    const fa = new THREE.CapsuleGeometry(0.115, 0.16, 2, 8);
    a.sh.add(limb(fa, look.skin, V(0, -0.3, 0)));
    const h = new THREE.SphereGeometry(0.12, 8, 6);
    a.hand.add(part(h, look.skin, V(0, 0, 0)));
  }
  // 头：大圆头（略压扁）
  {
    const g = new THREE.SphereGeometry(0.36, 12, 9);
    g.scale(1, 0.93, 0.95);
    head.add(part(g, look.skin, V(0, 0.33, 0)));
    // 耳朵露一点（侧面，2 纹素）
    // 头发：一顶往后倾的帽壳（前额露脸，后脑盖到脖子）
    // 头发：一顶往后倾 0.9 弧度的半球壳 —— 45° 俯视下头顶、后脑是头发，前面露出一张大脸
    const cap = new THREE.SphereGeometry(0.385, 12, 7, 0, Math.PI * 2, 0, Math.PI * 0.5);
    cap.rotateX(-0.9);
    head.add(part(cap, look.hair, V(0, 0.35, -0.01), V(0, 0.35, 0)));
    // 刘海：额头上一片（不然发际线是一条直线）
    const fringe = new THREE.SphereGeometry(0.39, 10, 3, Math.PI * 0.2, Math.PI * 0.6, Math.PI * 0.18, Math.PI * 0.14);
    head.add(part(fringe, look.hair, V(0, 0.34, 0), V(0, 0.34, 0)));
    // 眼睛：两个深色小块（1 纹素，脸上唯一的细节）
    if (look.shades) {
      // 太阳镜：一条横贯两眼的深色条（4 × 1.5 纹素），两端包到侧面
      const sg = new THREE.BoxGeometry(0.44, 0.14, 0.1);
      head.add(part(sg, look.shades, V(0, 0.3, 0.33), V(0, 0.5, 0.2)));
    } else {
      for (const ex of [-0.13, 0.13]) {
        const e = new THREE.BoxGeometry(0.1, 0.13, 0.08);
        head.add(part(e, look.hair, V(ex, 0.3, 0.34)));
      }
    }
    if (look.mustache) {
      // 胡子：鼻子下面一块（3 × 1 纹素），和太阳镜之间露一纹素的脸
      const mg = new THREE.BoxGeometry(0.3, 0.09, 0.1);
      head.add(part(mg, look.mustache, V(0, 0.13, 0.31), V(0, 0.3, 0.2)));
    }
    if (look.hairStyle === 'ponytail') {
      // 马尾：后脑一个发髻 + 往下垂的一团（侧面、背面都看得出来）
      const p = new THREE.SphereGeometry(0.17, 8, 6);
      p.scale(1, 1.2, 1);
      head.add(part(p, look.hair, V(0, 0.46, -0.4)));
      const p2 = new THREE.SphereGeometry(0.14, 8, 6);
      p2.scale(1, 1.5, 1);
      head.add(part(p2, look.hair, V(0, 0.2, -0.47)));
    }
    if (look.hairStyle === 'cap' && look.cap) {
      // 棒球帽：帽壳盖住头发上半 + 一块朝前的帽舌（3 纹素深）
      const c = new THREE.SphereGeometry(0.4, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.42);
      c.rotateX(-0.12);
      head.add(part(c, look.cap, V(0, 0.38, 0), V(0, 0.34, 0)));
      const bill = new THREE.CylinderGeometry(0.24, 0.26, 0.05, 10, 1, false, -Math.PI / 2, Math.PI);
      bill.scale(1.15, 1, 1.3);
      head.add(part(bill, look.cap, V(0, 0.5, 0.28), V(0, 0.9, 0.28)));
    }
    if (look.straw) {
      // 宽檐草帽（照参考图的钓鱼人）：帽檐是一个很浅的锥（往下垂），直径 ≈ 1.1 米，顶面亮、下沿一圈暗；
      // 帽冠：底下一圈帽带（和帽冠一样粗，只在正面露一条）+ 上面的草编冠 + 圆顶
      const brim = new THREE.CylinderGeometry(0.36, 0.58, 0.1, 18, 1);
      head.add(part(brim, look.straw.hat, V(0, 0.5, 0), V(0, 0.2, 0)));
      const band = new THREE.CylinderGeometry(0.31, 0.315, 0.11, 12, 1);
      head.add(part(band, look.straw.band, V(0, 0.59, 0), V(0, 0.59, 0)));
      const crown = new THREE.CylinderGeometry(0.26, 0.3, 0.17, 12, 1);
      head.add(part(crown, look.straw.hat, V(0, 0.715, 0), V(0, 0.55, 0)));
      const top = new THREE.SphereGeometry(0.26, 12, 4, 0, Math.PI * 2, 0, Math.PI * 0.5);
      top.scale(1, 0.35, 1);
      head.add(part(top, look.straw.hat, V(0, 0.8, 0), V(0, 0.6, 0)));
    }
  }

  // 没戴草帽的人：整颗头往后仰一点（脸朝镜头），45° 俯视下脸才露得出来
  if (!look.straw) {
    const tilt = new THREE.Group();
    tilt.rotation.x = -0.32;
    tilt.position.z = 0.04;
    for (const c of [...head.children]) tilt.add(c);
    head.add(tilt);
  }

  // ── 手里的东西 ──
  let racket: THREE.Group | null = null;
  let ball: THREE.Mesh | null = null;
  let broom: THREE.Group | null = null;
  const hold = look.hold;
  if (hold.kind === 'racket') {
    racket = new THREE.Group();
    // 拍柄从拳头往外 0.22，拍头是一个扁椭圆（框色）中间嵌一块浅色拍面；整个拍头约 5 纹素宽
    const grip = new THREE.BoxGeometry(0.09, 0.26, 0.09);
    racket.add(part(grip, hold.grip, V(0, -0.15, 0)));
    const fr = new THREE.SphereGeometry(1, 14, 6);
    fr.scale(0.23, 0.27, 0.06);
    racket.add(part(fr, hold.frame, V(0, -0.5, 0)));
    const st = new THREE.SphereGeometry(1, 12, 6);
    st.scale(0.15, 0.19, 0.075);
    racket.add(part(st, hold.strings, V(0, -0.5, 0)));
    armR.hand.add(racket);
    // 发球抛的球：只在 serve 里出现
    const b = new THREE.SphereGeometry(0.13, 8, 6);
    ball = part(b, hold.ball, V(0, 0, 0));
    ball.visible = false;
    root.add(ball);
  } else {
    broom = new THREE.Group();
    // 推扫帚：原点在扫帚头底面中心（地面上），木柄沿本地 +y
    const bristle = new THREE.BoxGeometry(0.66, 0.16, 0.22);
    broom.add(part(bristle, hold.head, V(0, 0.08, 0), V(0, -0.05, 0)));
    const back = new THREE.BoxGeometry(0.7, 0.1, 0.16);
    broom.add(part(back, hold.wood, V(0, 0.21, 0), V(0, 0.1, 0)));
    const stick = new THREE.CylinderGeometry(0.055, 0.055, 1.35, 6, 1);
    broom.add(part(stick, hold.wood, V(0, 0.26 + 0.675, 0)));
    root.add(broom);
  }
  // 吹叶机：挂在右手上。本地原点 = 握把（拳头），管子沿本地 −y 伸出去（pointIn 让 −y 指向吹的方向），
  // 机身在握把"上面"（本地 +z：管子朝前下时 +z 朝上偏前）。管子粗 0.26 米（3 纹素），管口一圈橙色。
  let blower: THREE.Group | null = null;
  const NOZZLE = V(0, -1.0, 0.06);
  if (look.blower) {
    const b = look.blower;
    blower = new THREE.Group();
    // 机身：一个胖圆角块（4 × 4 纹素），握把在它下面
    const body = new THREE.CapsuleGeometry(0.16, 0.1, 3, 8);
    body.scale(1.05, 1, 1);
    blower.add(part(body, b.body, V(0, 0.1, 0.15), V(0, 0.14, 0.2)));
    // 机身侧面的深色进风口（一块 3 纹素的圆盘，朝右/外侧）
    const intake = new THREE.CylinderGeometry(0.13, 0.13, 0.06, 10, 1);
    intake.rotateZ(Math.PI / 2);
    blower.add(part(intake, b.dark, V(-0.18, 0.12, 0.15), V(0, 0.12, 0.15)));
    // 管子：从机身前端到管口，略收窄
    const tube = new THREE.CylinderGeometry(0.115, 0.135, 0.82, 10, 1);
    blower.add(limb(tube, b.tube, V(0, -0.5, 0.06)));
    // 管口：一圈深色箍（2 纹素长）—— 管子的末端一眼看得出来
    const tip = new THREE.CylinderGeometry(0.14, 0.135, 0.16, 10, 1);
    blower.add(limb(tip, b.dark, V(0, -0.93, 0.06)));
    blower.visible = false;
    armR.hand.add(blower);
  }
  // 捡球器：外面建好的对象，放在 root 下按姿势摆（像扫帚）；柄的转轴组在 userData.handle
  const picker = look.picker ?? null;
  if (picker) {
    picker.visible = false;
    root.add(picker);
  }
  // feed 的球（球拍的人才有）：从左手里拿出来、落下、被球拍送出去
  let feedBall: THREE.Mesh | null = null;
  if (hold.kind === 'racket') {
    const b = new THREE.SphereGeometry(0.13, 8, 6);
    feedBall = part(b, hold.ball, V(0, 0, 0));
    feedBall.visible = false;
    root.add(feedBall);
  }
  // 当前拿着的道具：默认是 hold 的那一样
  let held: PropName | null = hold.kind;
  const applyProp = () => {
    if (racket) racket.visible = held === 'racket';
    if (broom) broom.visible = held === 'broom';
    if (blower) blower.visible = held === 'blower';
    if (picker) picker.visible = held === 'picker';
  };

  // ── 姿势 ──
  const bones = [hips, torso, head, armR.sh, armL.sh, legR, legL, armR.hand, armL.hand];
  const base = bones.map((b) => b.position.clone());
  const reset = () => {
    bones.forEach((b, i) => {
      b.position.copy(base[i]);
      b.rotation.set(0, 0, 0);
    });
    torso.scale.set(1, 1, 1);
    if (racket) racket.rotation.set(-0.35, 0, 0);
    if (ball) ball.visible = false;
    if (feedBall) feedBall.visible = false;
  };
  const tmp = new THREE.Vector3();
  const tmpQ = new THREE.Quaternion();
  const DOWN = V(0, -1, 0);
  /** 把手臂指向 root 本地坐标里的一个点（简易 IK：只转肩） */
  const aim = (a: { sh: THREE.Group }, target: THREE.Vector3) => {
    root.updateMatrixWorld(true);
    tmp.copy(target);
    root.localToWorld(tmp);
    a.sh.parent!.worldToLocal(tmp);
    tmp.sub(a.sh.position).normalize();
    a.sh.quaternion.setFromUnitVectors(DOWN, tmp);
    // 父级旋转已经在 worldToLocal 里抵掉了
    void tmpQ;
  };
  const qa = new THREE.Quaternion();
  const qb = new THREE.Quaternion();
  const qc = new THREE.Quaternion();
  const dv = new THREE.Vector3();
  /** 让 obj 的本地 −y 指向 space 坐标系里的方向 dir（球拍：拍头方向按躯干/身体坐标写，好调） */
  const pointIn = (obj: THREE.Object3D, space: THREE.Object3D, dir: THREE.Vector3) => {
    root.updateMatrixWorld(true);
    space.getWorldQuaternion(qa);
    obj.parent!.getWorldQuaternion(qb);
    qc.setFromUnitVectors(DOWN, dv.copy(dir).normalize());
    obj.quaternion.copy(qb.invert().multiply(qa).multiply(qc));
  };
  /** 两个方向之间插值（球拍挥动） */
  const mixDir = (a: THREE.Vector3, b: THREE.Vector3, t: number) => a.clone().lerp(b, t).normalize();
  /** 扫帚：头在 (x, z)，柄往后倾 tilt（弧度），绕竖轴 yaw */
  const placeBroom = (x: number, z: number, tilt: number, yaw: number) => {
    if (!broom) return;
    broom.position.set(x, 0, z);
    broom.rotation.set(tilt, yaw, 0, 'YXZ');
  };
  const broomPoint = (u: number) => {
    // 柄上离扫帚头 u 米处（root 本地）
    broom!.updateMatrix();
    return V(0, 0.26 + u, 0).applyMatrix4(broom!.matrix);
  };
  /** 捡球器：笼子落在 (x, z)，柄往后倾 tilt（负 = 柄朝 −z 倒向人），绕竖轴 yaw */
  const placePicker = (x: number, z: number, tilt: number, yaw: number) => {
    if (!picker) return;
    picker.position.set(x, 0, z);
    picker.rotation.set(0, yaw, 0);
    picker.userData.setTilt?.(tilt);
  };
  /** 捡球器的握把（T 形横把中心）偏 dx 米处，root 本地 */
  const gripAt = (dx: number) => {
    root.updateMatrixWorld(true);
    const w = picker!.userData.gripPoint(dx) as THREE.Vector3;
    return root.worldToLocal(w);
  };
  /** 吹叶机：右手放到 hand（root 本地）附近、管子指向 dir（root 本地方向），左手扶管子 */
  const holdBlower = (hand: THREE.Vector3, dir: THREE.Vector3) => {
    if (!blower) return;
    aim(armR, hand);
    pointIn(blower, root, dir);
    root.updateMatrixWorld(true);
    const t = root.worldToLocal(blower.localToWorld(V(0, -0.36, 0.06)));
    aim(armL, t);
  };
  const walkLegs = (p: number, amp: number) => {
    const s = Math.sin(p * Math.PI * 2);
    legR.rotation.x = s * amp;
    legL.rotation.x = -s * amp;
    hips.position.y = HIP_Y + Math.abs(Math.cos(p * Math.PI * 2)) * 0.04 - 0.02;
    return s;
  };

  /** 推捡球器：走路的腿，身子前倾，双手低低地握住横把两端，笼子在身前 1.5 米处的地上 */
  const pushPose = (p: number) => {
    const s = walkLegs(p, 0.42);
    torso.rotation.set(0.2, 0, 0);
    head.rotation.x = -0.18;
    // 柄跟着步子轻轻一推一推（笼子前后挪 4 厘米，柄角不变）
    placePicker(0, 1.5 + Math.abs(s) * 0.04, -1.1, 0);
    aim(armR, gripAt(-0.15));
    aim(armL, gripAt(0.15));
  };
  /** 关键帧：[phase, 值] 按 phase 排好，段间 smoothstep */
  const keys = (p: number, ks: [number, number][]) => {
    if (p <= ks[0][0]) return ks[0][1];
    for (let i = 1; i < ks.length; i++) {
      if (p <= ks[i][0]) return lerp(ks[i - 1][1], ks[i][1], smooth(ks[i - 1][0], ks[i][0], p));
    }
    return ks[ks.length - 1][1];
  };
  const keysV = (p: number, ks: [number, THREE.Vector3][]) =>
    V(
      keys(
        p,
        ks.map(([t, v]) => [t, v.x] as [number, number]),
      ),
      keys(
        p,
        ks.map(([t, v]) => [t, v.y] as [number, number]),
      ),
      keys(
        p,
        ks.map(([t, v]) => [t, v.z] as [number, number]),
      ),
    );
  /** feed 的两个关键位置（root 本地）：0.5 时左手里的球、FEED_RELEASE 时拍面中心。建好后各跑一次姿势量出来 */
  const feedHand = V(0.15, 0.95, 0.45);
  const feedHit = V(-0.1, 0.6, 0.55);
  const handBall = () => {
    root.updateMatrixWorld(true);
    return root.worldToLocal(armL.hand.localToWorld(V(0, -0.1, 0.06)));
  };
  const racketFace = () => {
    root.updateMatrixWorld(true);
    // 拍面中心沿拍面法线（球拍本地 +z；送球时朝上）挪一个球的半径 + 拍框厚：球躺在拍面上，不被拍子挡住
    return root.worldToLocal(racket!.localToWorld(V(0, -0.5, 0.2)));
  };
  /** 吹叶机：一个来回 = 左右扫一趟 */
  const blowYaw = (p: number) => -0.75 + Math.sin(p * Math.PI * 2) * 0.35;

  let current: PoseName = 'idle';
  let phase = 0;
  const pose = (nameIn: string, ph = 0) => {
    const n = (POSES as readonly string[]).includes(nameIn) ? (nameIn as PoseName) : 'idle';
    current = n;
    phase = ((ph % 1) + 1) % 1;
    const p = phase;
    reset();
    switch (n) {
      case 'idle': {
        armR.sh.rotation.z = -0.12;
        armL.sh.rotation.z = 0.12;
        if (broom && held === 'broom') {
          placeBroom(-0.55, 0.14, 0.08, Math.PI / 4);
          aim(armR, broomPoint(0.55));
        }
        if (held === 'blower') holdBlower(V(-0.42, 0.5, 0.08), V(-0.1, -1, 0.35));
        if (picker && held === 'picker') {
          // 捡球器立在身侧（柄几乎竖着），右手搭在横把上
          placePicker(-0.6, 0.2, -0.25, 0);
          aim(armR, gripAt(0));
        }
        break;
      }
      case 'walk': {
        const s = walkLegs(p, 0.55);
        armR.sh.rotation.x = s * 0.6;
        armL.sh.rotation.x = -s * 0.6;
        armR.sh.rotation.z = -0.1;
        armL.sh.rotation.z = 0.1;
        torso.rotation.y = s * 0.12;
        if (broom && held === 'broom') {
          // 扫帚竖着提在身侧，离地一点，跟着步子晃
          placeBroom(-0.55, 0.15 + s * 0.08, 0.1 + s * 0.08, Math.PI / 4);
          broom.position.y = 0.1;
          aim(armR, broomPoint(0.5));
        }
        if (held === 'blower') holdBlower(V(-0.42, 0.52, 0.1 + s * 0.1), V(-0.1, -1, 0.35 + s * 0.15));
        if (picker && held === 'picker') {
          // 拿着捡球器走 = 推着走
          pushPose(p);
        }
        break;
      }
      case 'ready': {
        // 半蹲、身子前倾、拍子举在身前；脚下轻轻弹
        const b = Math.sin(p * Math.PI * 2);
        hips.position.y = HIP_Y - 0.07 + b * 0.02;
        legR.rotation.z = -0.22;
        legL.rotation.z = 0.22;
        legR.rotation.x = -0.15;
        legL.rotation.x = -0.15;
        torso.rotation.x = 0.28;
        head.rotation.x = -0.2;
        armR.sh.rotation.set(-0.9, 0, -0.35);
        armL.sh.rotation.set(-0.9, 0, 0.55);
        // 拍头朝上、举在右肩前（剪影里拍子和身子分开）
        if (racket && held === 'racket') pointIn(racket, torso, V(-0.3, 1, 0.2));
        break;
      }
      case 'forehand': {
        // 0..0.4 引拍（右肩转到后面）→ 0.4..0.6 挥过身前 → 0.6..1 随挥到左肩上
        const k = smooth(0.35, 0.62, p);
        const back = smooth(0, 0.3, p) * (1 - k);
        hips.position.y = HIP_Y - 0.05;
        legR.rotation.z = -0.2;
        legL.rotation.z = 0.2;
        legL.rotation.x = -0.3 * k;
        legR.rotation.x = 0.25 * k;
        torso.rotation.y = lerp(-0.25, 1.0, k) - back * 0.7;
        torso.rotation.x = 0.15;
        head.rotation.y = -torso.rotation.y * 0.6;
        armR.sh.rotation.set(lerp(-0.3, -1.4, k), 0, lerp(-1.25, -0.2, k));
        armL.sh.rotation.set(-1.0 + k * 0.6, 0, 0.6 - k * 0.3);
        // 拍头：引拍时朝后上 → 击球时在身侧朝外 → 随挥到左肩上
        if (racket && held === 'racket') {
          const d =
            k < 0.5
              ? mixDir(V(-0.85, 0.6, -0.3), V(-1, 0.05, 0.35), k * 2)
              : mixDir(V(-1, 0.05, 0.35), V(0.6, 0.75, -0.25), k * 2 - 1);
          pointIn(racket, torso, d);
        }
        break;
      }
      case 'backhand': {
        // 双手反手：引拍到左侧 → 挥到右肩上
        const k = smooth(0.35, 0.62, p);
        const back = smooth(0, 0.3, p) * (1 - k);
        hips.position.y = HIP_Y - 0.05;
        legR.rotation.z = -0.2;
        legL.rotation.z = 0.2;
        legR.rotation.x = -0.3 * k;
        legL.rotation.x = 0.25 * k;
        torso.rotation.y = lerp(0.3, -1.0, k) + back * 0.7;
        torso.rotation.x = 0.15;
        head.rotation.y = -torso.rotation.y * 0.6;
        armR.sh.rotation.set(lerp(-0.5, -1.6, k), 0, lerp(0.9, 0.0, k));
        armL.sh.rotation.set(lerp(-0.4, -1.4, k), 0, lerp(0.3, -0.3, k));
        if (racket && held === 'racket') {
          const d =
            k < 0.5
              ? mixDir(V(0.85, 0.6, -0.3), V(1, 0.05, 0.35), k * 2)
              : mixDir(V(1, 0.05, 0.35), V(-0.6, 0.75, -0.25), k * 2 - 1);
          pointIn(racket, torso, d);
        }
        break;
      }
      case 'serve': {
        // 0..0.45 抛球（左手举起，球升到头上）、拍子背到脑后 → 0.5..0.65 向上挥到最高点击球 → 往前下随挥
        const toss = smooth(0.05, 0.4, p);
        const hit = smooth(0.48, 0.68, p);
        const follow = smooth(0.68, 0.95, p);
        torso.rotation.y = lerp(-0.6, 0.4, hit);
        torso.rotation.x = lerp(-0.15 * toss, 0.35, follow);
        hips.position.y = HIP_Y - 0.06 * toss * (1 - hit) + 0.05 * hit * (1 - follow);
        legL.rotation.x = -0.2;
        legR.rotation.x = 0.15;
        head.rotation.x = -0.35 * toss * (1 - follow);
        // 左手：放下 → 举过头（抛球）→ 收回胸前
        armL.sh.rotation.set(lerp(lerp(-0.2, -2.9, toss), -0.9, hit), 0, 0.2);
        // 右手：后摆到脑后（大于 π 的 x = 朝后上方）→ 向上 → 前下
        const ax = lerp(lerp(0.2, 2.4, toss), 3.5, hit) + follow * 2.0;
        armR.sh.rotation.set(ax, 0, -0.25);
        if (racket && held === 'racket') racket.rotation.set(lerp(-0.3, 1.2, toss * (1 - hit)), 0, 0);
        if (ball && held === 'racket' && p > 0.05 && p < 0.62) {
          ball.visible = true;
          // 球：从左手里抛起，最高点在头顶前上方
          // 球：从左手里抛起，最高点（u = 0.8）在头顶前上方，落一点点时被击中
          const u = (p - 0.05) / 0.57;
          const y = 1.0 + 1.75 * (1 - (1 - u / 0.8) ** 2);
          ball.position.set(lerp(0.3, -0.05, u), y, lerp(0.15, 0.3, u));
        }
        break;
      }
      case 'sweep': {
        // 推扫：扫帚在身前，柄往后倾，双手一前一后握柄；扫帚头前后推，身子跟着前倾
        const s = Math.sin(p * Math.PI * 2);
        const push = (s + 1) / 2;
        hips.position.y = HIP_Y - 0.04;
        legR.rotation.x = -0.35;
        legL.rotation.x = 0.3;
        // 身子只略前倾（宽檐帽在 45° 俯视下会盖住整个人），头往回仰一点让帽檐保持水平
        torso.rotation.x = 0.12 + push * 0.06;
        torso.rotation.y = -0.15;
        head.rotation.x = -0.1;
        if (broom && held === 'broom') {
          placeBroom(-0.1, 0.95 + push * 0.35, -1.12, 0);
          aim(armR, broomPoint(0.95));
          aim(armL, broomPoint(0.55));
        }
        break;
      }
      case 'feed': {
        // 喂球（教练，侧身站在球车旁）：0..0.25 左手探进左边腰旁的球筐（身子往左歪）→ 0.25..0.48 拿一个球抬到身前胸口
        // → 0.5 松手，球往下掉；右手的拍子同时从身后低低地往前送 → FEED_RELEASE（0.6）拍面在身前腰下碰到球 → 往前上随挥 → 回到准备
        const dip = keys(p, [
          [0, 0.2],
          [0.12, 1],
          [0.22, 1],
          [0.42, 0],
          [1, 0.2],
        ]);
        hips.position.y = HIP_Y - 0.04 - dip * 0.06;
        legR.rotation.z = -0.18;
        legL.rotation.z = 0.18 + dip * 0.08;
        legL.rotation.x = -0.2;
        legR.rotation.x = 0.12;
        torso.rotation.z = -0.3 * dip;
        torso.rotation.x =
          0.1 +
          0.18 * dip +
          keys(p, [
            [0.45, 0],
            [0.6, 0.15],
            [0.8, 0],
          ]);
        torso.rotation.y = keys(p, [
          [0.25, 0.15],
          [0.5, -0.35],
          [0.62, 0.15],
          [0.8, 0.35],
          [1, 0.15],
        ]);
        head.rotation.z = 0.2 * dip;
        // 左手：放在身侧 → 探进球筐（腰左外侧）→ 举到胸前 → 松手后停一下再放下
        aim(
          armL,
          keysV(p, [
            [0, V(0.5, 0.55, 0.15)],
            [0.12, V(0.75, 0.3, 0.25)],
            [0.22, V(0.75, 0.3, 0.25)],
            [0.45, V(0.15, 1.05, 0.6)],
            [0.62, V(0.18, 1.05, 0.55)],
            [0.85, V(0.45, 0.55, 0.2)],
            [1, V(0.5, 0.55, 0.15)],
          ]),
        );
        // 右手（拍子）：垂在身侧 → 往后引 → 低低地往前送（击球）→ 往前上随挥 → 回来
        armR.sh.rotation.x = keys(p, [
          [0.25, 0.1],
          [0.5, 1.0],
          [FEED_RELEASE, -0.55],
          [0.78, -1.75],
          [1, 0.1],
        ]);
        armR.sh.rotation.z = -0.25;
        if (racket && held === 'racket') {
          const back = V(-0.25, -0.35, -1);
          const hitD = V(-0.15, -0.35, 1);
          const up = V(-0.1, 0.9, 0.5);
          const rest = V(-0.35, -1, 0.25);
          const d =
            p < 0.25
              ? rest
              : p < 0.5
                ? mixDir(rest, back, smooth(0.25, 0.5, p))
                : p < FEED_RELEASE
                  ? mixDir(back, hitD, smooth(0.5, FEED_RELEASE, p))
                  : p < 0.78
                    ? mixDir(hitD, up, smooth(FEED_RELEASE, 0.78, p))
                    : mixDir(up, rest, smooth(0.78, 1, p));
          pointIn(racket, torso, d);
        }
        // 球：0.18 起在左手里，0.5 松手 → 落到拍面（带一点重力加速），FEED_RELEASE 之后交给演出（隐藏）
        if (feedBall && held === 'racket' && p >= 0.18 && p <= FEED_RELEASE + 1e-6) {
          feedBall.visible = true;
          if (p <= 0.5) feedBall.position.copy(handBall());
          else {
            const u = Math.min(1, (p - 0.5) / (FEED_RELEASE - 0.5));
            feedBall.position.lerpVectors(feedHand, feedHit, u * u);
          }
        }
        break;
      }
      case 'blow': {
        // 吹叶机：两脚分开站稳，右手握机身在右胯前，左手扶管子；管口朝前下，左右慢慢扫
        const yaw = blowYaw(p);
        hips.position.y = HIP_Y - 0.04;
        legR.rotation.z = -0.2;
        legL.rotation.z = 0.2;
        legL.rotation.x = -0.15;
        legR.rotation.x = 0.1;
        torso.rotation.x = 0.14;
        // 扫的中心偏右前方（−x）：管子在画面里是一条斜线，不和身子、腿叠在一起
        torso.rotation.y = yaw * 0.45;
        head.rotation.y = yaw * 0.35;
        if (blower && held === 'blower') {
          const hand = V(-0.3 + Math.sin(yaw) * 0.14, 0.62, 0.18 + Math.cos(yaw) * 0.06);
          holdBlower(hand, V(Math.sin(yaw) * 0.8, -0.6, Math.cos(yaw) * 0.8));
        }
        break;
      }
      case 'push': {
        if (picker && held === 'picker') pushPose(p);
        else walkLegs(p, 0.42);
        break;
      }
    }
  };

  let breathT = 0;
  let fixed = false;
  const update = (dt: number) => {
    breathT += dt;
    if (current === 'idle') {
      const b = Math.sin(breathT * ((Math.PI * 2) / PERIOD.idle));
      torso.scale.y = 1 + b * 0.035;
      head.position.y = base[2].y + b * 0.045;
      armR.sh.position.y = armL.sh.position.y = base[3].y + b * 0.02;
      if (held === 'blower' || held === 'picker') {
        // 拿着吹叶机/捡球器：胳膊跟着道具，不随呼吸摆
        pose('idle', 0);
        return;
      }
      armR.sh.rotation.z = -0.12 - b * 0.03;
      armL.sh.rotation.z = 0.12 + b * 0.03;
      if (broom && held === 'broom') aim(armR, broomPoint(0.55));
    } else if (!fixed) {
      pose(current, phase + dt / PERIOD[current]);
      // 画廊自动播放：推着走时笼子跟着滚（演出里由调用方 picker.userData.roll）
      if (picker && held === 'picker' && (current === 'push' || current === 'walk')) picker.userData.roll?.(dt, 1.1);
    }
  };

  root.userData.pose = (n: string, ph?: number) => {
    fixed = ph !== undefined;
    pose(n, ph ?? 0);
  };
  root.userData.update = (dt: number) => update(dt);
  root.userData.poses = POSES;
  /** 换手里的道具（只认这个人建了的：球员 racket，总监 broom/picker，教练 racket/blower）；null = 空手。换完按当前姿势重摆 */
  root.userData.setProp = (name: PropName | null) => {
    const ok =
      name === null ||
      (name === 'racket' && !!racket) ||
      (name === 'broom' && !!broom) ||
      (name === 'blower' && !!blower) ||
      (name === 'picker' && !!picker);
    held = ok ? name : null;
    applyProp();
    pose(current, phase);
  };
  root.userData.prop = () => held;
  if (blower) {
    /** 吹叶机管口的世界坐标（当前姿势） */
    root.userData.nozzle = () => {
      root.updateMatrixWorld(true);
      return blower!.localToWorld(NOZZLE.clone());
    };
    /** 吹叶机吹的方向（世界坐标，单位向量） */
    root.userData.nozzleDir = () => {
      root.updateMatrixWorld(true);
      return V(0, -1, 0).applyQuaternion(blower!.getWorldQuaternion(new THREE.Quaternion())).normalize();
    };
  }
  if (picker) root.userData.picker = picker;
  if (racket) {
    /** feed：FEED_RELEASE 时球（拍面中心）的世界坐标 —— 演出从这里把球送出去（朝人物的 +z） */
    root.userData.feedPoint = () => {
      root.updateMatrixWorld(true);
      return root.localToWorld(feedHit.clone());
    };
  }

  // 量 feed 的两个关键位置（用默认道具；没有球拍就跳过）
  if (racket) {
    const h0 = held;
    held = 'racket';
    pose('feed', 0.5);
    feedHand.copy(handBall());
    pose('feed', FEED_RELEASE);
    feedHit.copy(racketFace());
    held = h0;
  }
  applyProp();
  // 画廊/截图：?pose=<name>&phase=<0..1>（不给 phase → 自动播放）；?prop=<racket|broom|blower|picker|none>
  const prq = ctx.params.get('prop');
  if (prq !== null) root.userData.setProp(prq === 'none' ? null : prq);
  const pq = ctx.params.get('pose');
  const phq = ctx.params.get('phase');
  pose(pq ?? 'idle', phq !== null ? Number(phq) : 0);
  fixed = phq !== null;
  ctx.mats.prepare(root);
  return root;
}

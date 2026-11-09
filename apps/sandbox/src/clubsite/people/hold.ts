// 手里拿东西的通用接口：别的代理画的工具（扫线刷、捞网、喷头、摇把、浇水壶……）按"握点"挂到人手上。
//
// 握点（Grip，写在工具自己的 userData.grip 里，或者 hold(obj, grip) 时传进来；坐标都是工具的本地坐标，米）：
//   at    拳头握住的那一点（必填）
//   axis  从握点指向"干活那头"的方向（喷头的出水口、捞网的网圈、刷头、壶身…），默认 (0, −1, 0)
//   up    工具的"上面 / 正面"（喷头扳机朝下时的反方向、壶嘴朝的方向、拍面法线…），默认 (0, 0, 1)；和 axis 正交化
//   at2   第二只手握的点（长杆、水管）：姿势会让另一只手伸过去
//   tip   干活那头的点（出水口、网圈中心、壶嘴）：userData.toolTip() 给演出用（水雾、水花从这里出）
// 拿到手上后：握点落在拳头中心，axis 顺着姿势给的方向，up 朝姿势给的"上"。各姿势怎么摆见 poses.ts。
// 规则同 rig：−y = 从握把指向干活那头，+z = 道具的上面（rig 的球拍也是这样挂的）。
// 也认工具代理的写法（clubsite/tools/kit.ts 的 Grip）：pos = at、pos2 = at2；tip 不给时依次找
// userData.tip、ringCenter()（捞网）、headCenter()（扫线刷）。拿起时先 userData.setState?.('held')。
import * as THREE from 'three';

type V3 = THREE.Vector3 | readonly [number, number, number];

export interface GripSpec {
  at?: V3;
  /** 工具代理的写法（= at） */
  pos?: V3;
  /** 工具代理的写法（= at2） */
  pos2?: V3;
  axis?: V3;
  up?: V3;
  at2?: V3;
  tip?: V3;
  /**
   * 推车（划线车、水管卷盘车）：工具自己立在地上，不挂在手上；人站在推把后面，两只手握 at / at2（推把两端，
   * 没给 at2 就在 at 两边各 0.2 米）。推车请写 cart: true；不写时猜：at 离工具自己的地面 > 0.5 米、又没有 tip = 推车
   * （水管卷盘车是这样；扫线刷 'held' 状态 at 也高，但有 tip，算长杆）。
   */
  cart?: boolean;
}

export interface Grip {
  at: THREE.Vector3;
  axis: THREE.Vector3;
  up: THREE.Vector3;
  at2: THREE.Vector3 | null;
  tip: THREE.Vector3 | null;
  /** 握点到 tip 的距离（没有 tip 时 0） */
  len: number;
  cart: boolean;
}

const vec = (v: V3): THREE.Vector3 =>
  (v as THREE.Vector3).isVector3 ? (v as THREE.Vector3).clone() : new THREE.Vector3(...(v as [number, number, number]));

export function readGrip(obj: THREE.Object3D, spec?: GripSpec): Grip {
  const s = spec ?? (obj.userData.grip as GripSpec | undefined) ?? { at: [0, 0, 0] };
  const at = vec(s.at ?? s.pos ?? [0, 0, 0]);
  const ud = obj.userData;
  const tipV: V3 | undefined =
    s.tip ??
    ud.tip ??
    (ud.ringCenter?.() as THREE.Vector3 | undefined) ??
    (ud.headCenter?.() as THREE.Vector3 | undefined);
  const axis = vec(s.axis ?? [0, -1, 0]).normalize();
  const up = vec(s.up ?? [0, 0, 1]);
  const tip = tipV ? vec(tipV) : null;
  const at2 = s.at2 ?? s.pos2;
  const cart = s.cart ?? (at.y > 0.5 && !tip);
  return { at, axis, up, at2: at2 ? vec(at2) : null, tip, len: tip ? tip.distanceTo(at) : 0, cart };
}

/**
 * 一只手里的握持组：挂在拳头上，姿势用 orient() 摆它（−y = axis，+z = up）；工具挂在它下面，握点在原点。
 */
export class Holder {
  readonly group = new THREE.Group();
  tool: THREE.Object3D | null = null;
  grip: Grip | null = null;

  /** 推车挂在这里（人物的 body 空间），不挂在手上 */
  private cartParent: THREE.Object3D;
  /** 推车：绕竖轴转多少（让 axis 的水平分量朝人的 +z） */
  private cartQ = new THREE.Quaternion();

  constructor(hand: THREE.Object3D, cartParent: THREE.Object3D) {
    this.group.name = 'holder';
    hand.add(this.group);
    this.cartParent = cartParent;
  }

  get cart(): boolean {
    return !!this.grip?.cart;
  }

  attach(obj: THREE.Object3D, spec?: GripSpec): void {
    this.release();
    // 工具代理的工具有两个状态（地上 / 手里），握点是 'held' 状态的坐标
    if (obj.userData.state === 'ground') obj.userData.setState?.('held');
    const g = readGrip(obj, spec);
    if (g.cart) {
      // 推车：只转朝向（axis 的水平分量 → 人的 +z），立在 body 的地面上；位置由姿势 placeCart 摆
      this.cartQ.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.atan2(g.axis.x, g.axis.z));
      obj.quaternion.copy(this.cartQ);
      obj.position.set(0, 0, 0);
      obj.scale.setScalar(1);
      obj.visible = true;
      this.cartParent.add(obj);
      this.tool = obj;
      this.grip = g;
      return;
    }
    // 工具的本地基：y_t = −axis，z_t = up（正交化），x_t = y × z。握持组坐标 → 工具坐标就是这个基；反过来取逆
    const y = g.axis.clone().negate();
    const z = g.up.clone().addScaledVector(y, -g.up.dot(y));
    if (z.lengthSq() < 1e-6) z.set(1, 0, 0).addScaledVector(y, -y.x);
    z.normalize();
    const x = new THREE.Vector3().crossVectors(y, z).normalize();
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z)).invert();
    obj.quaternion.copy(q);
    obj.position.copy(g.at).applyQuaternion(q).negate();
    obj.scale.setScalar(1);
    obj.visible = true;
    this.group.add(obj);
    this.tool = obj;
    this.grip = g;
  }

  /** 松手：工具留在原地（保持世界位置，挂回 to，默认人物的父级），返回它 */
  release(to?: THREE.Object3D | null): THREE.Object3D | null {
    const t = this.tool;
    if (!t) return null;
    this.tool = null;
    this.grip = null;
    if (to) to.attach(t);
    else t.removeFromParent();
    return t;
  }

  /**
   * 推车：把推把中点（at）摆到 body 坐标 target 的水平位置（高度不动，车轮留在地上）；返回两只手该握的点（body 坐标）
   */
  placeCart(target: THREE.Vector3): [THREE.Vector3, THREE.Vector3] {
    const g = this.grip!;
    const t = this.tool!;
    const a = g.at.clone().applyQuaternion(this.cartQ);
    t.position.set(target.x - a.x, 0, target.z - a.z);
    const r = a.clone().add(t.position);
    const l = g.at2
      ? g.at2.clone().applyQuaternion(this.cartQ).add(t.position)
      : r.clone().add(new THREE.Vector3(0.2, 0, 0));
    if (!g.at2) r.x -= 0.2;
    // 右手在 −x：两点里 x 小的给右手
    return r.x <= l.x ? [r, l] : [l, r];
  }

  /** 工具本地点 → 世界坐标 */
  world(local: THREE.Vector3): THREE.Vector3 {
    this.group.updateMatrixWorld(true);
    return this.tool!.localToWorld(local.clone());
  }
}

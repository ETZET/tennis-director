// 从 desert3d-v2 的 buildPerson 建好的人身上取骨骼（只读那边的结构，不改那边的文件），加上摆姿势的小工具。
// rig.ts 的建法：root → hips（第一个孩子）→ [torso, legR, legL, 臀部网格…]；torso → [head, armR.sh, armL.sh, …]；sh → [hand, …]；
// 腿组 → [腿胶囊, 鞋]。没戴草帽的人 head 下只有一个 tilt 组（整颗头往后仰 0.32，脸朝镜头）。
// 正面朝 +z（镜头），人物的右手在 −x。肩在躯干 (±0.27, 0.4)，拳头离肩 0.44 米（手臂是一整根，只能转肩）。
import * as THREE from 'three';

export interface Arm {
  sh: THREE.Group;
  hand: THREE.Group;
}

export interface Bones {
  root: THREE.Group;
  hips: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  /** 头的后仰组（头上加东西挂这里，跟着脸走）；戴草帽的人就是 head 自己 */
  tilt: THREE.Object3D;
  armR: Arm;
  armL: Arm;
  legR: THREE.Group;
  legL: THREE.Group;
  /** 腿组里原来的网格（胶囊 + 鞋）：换膝盖腿时藏起来 */
  legMeshes: THREE.Mesh[];
  /** 臀部网格（短裤 / 裙子 / 长裤的裤腰） */
  bottom: THREE.Mesh | null;
  /** 网球拍（rig 建在右手里的那个组；没有就是 null） */
  racket: THREE.Group | null;
}

/** rig 的常数（rig.ts 不导出，照抄；rig 改了要跟着改） */
export const HIP_Y = 0.5;
/** 肩到拳头 */
export const ARM = 0.44;

const grp = (o: THREE.Object3D | undefined, what: string): THREE.Group => {
  if (!o || !(o as THREE.Group).isGroup) throw new Error(`clubsite/people：找不到 ${what}（rig.ts 的结构变了？）`);
  return o as THREE.Group;
};

export function findBones(root: THREE.Group, hasRacket: boolean): Bones {
  const hips = grp(root.children[0], 'hips');
  const torso = grp(hips.children[0], 'torso');
  const head = grp(torso.children[0], 'head');
  const shA = grp(torso.children[1], 'arm');
  const shB = grp(torso.children[2], 'arm');
  // 右手在 −x（rig 的约定）：按位置认
  const [r, l] = shA.position.x < shB.position.x ? [shA, shB] : [shB, shA];
  const legA = grp(hips.children[1], 'leg');
  const legB = grp(hips.children[2], 'leg');
  const [lr, ll] = legA.position.x < legB.position.x ? [legA, legB] : [legB, legA];
  const tilt = head.children.length === 1 && (head.children[0] as THREE.Group).isGroup ? head.children[0] : head;
  const handR = grp(r.children[0], 'armR.hand');
  const legMeshes = [...lr.children, ...ll.children].filter((c) => (c as THREE.Mesh).isMesh) as THREE.Mesh[];
  const bottom = (hips.children.find((c) => (c as THREE.Mesh).isMesh) as THREE.Mesh | undefined) ?? null;
  // 球拍：rig 先把球拍加进右手（在吹叶机之前），是右手里的第一个组
  const racket = hasRacket ? ((handR.children.find((c) => (c as THREE.Group).isGroup) as THREE.Group) ?? null) : null;
  return {
    root,
    hips,
    torso,
    head,
    tilt,
    armR: { sh: r, hand: handR },
    armL: { sh: l, hand: grp(l.children[0], 'armL.hand') },
    legR: lr,
    legL: ll,
    legMeshes,
    bottom,
    racket,
  };
}

export const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
export const lerp = THREE.MathUtils.lerp;
export const clamp = THREE.MathUtils.clamp;
export const smooth = (a: number, b: number, t: number) => {
  const k = clamp((t - a) / (b - a), 0, 1);
  return k * k * (3 - 2 * k);
};
/** 进 a..b、出 c..d 的包络（0 → 1 → 0） */
export const env = (p: number, a: number, b: number, c: number, d: number) => smooth(a, b, p) * (1 - smooth(c, d, p));
/** 关键帧：[phase, 值] 按 phase 排好，段间 smoothstep */
export function keys(p: number, ks: [number, number][]): number {
  if (p <= ks[0][0]) return ks[0][1];
  for (let i = 1; i < ks.length; i++) {
    if (p <= ks[i][0]) return lerp(ks[i - 1][1], ks[i][1], smooth(ks[i - 1][0], ks[i][0], p));
  }
  return ks[ks.length - 1][1];
}
export function keysV(p: number, ks: [number, THREE.Vector3][]): THREE.Vector3 {
  const pick = (f: (v: THREE.Vector3) => number) =>
    keys(
      p,
      ks.map(([t, v]) => [t, f(v)] as [number, number]),
    );
  return V(
    pick((v) => v.x),
    pick((v) => v.y),
    pick((v) => v.z),
  );
}

const DOWN = V(0, -1, 0);
const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();

/**
 * 手臂指向 space 坐标系里的一点（简易 IK：只转肩，同 rig 的 aim）。
 * stretch = [最短, 最长]：手臂顺着自己拉长/缩短一点（sh.scale.y），拳头正好落在目标上；给 null 不拉（拳头停在 0.44 米处）。
 * 返回拳头离目标还差多少米（够不着的时候 > 0）。
 */
export function reach(
  space: THREE.Object3D,
  arm: Arm,
  target: THREE.Vector3,
  stretch: [number, number] | null = [0.88, 1.16],
): number {
  space.updateMatrixWorld(true);
  tmp.copy(target);
  space.localToWorld(tmp);
  arm.sh.parent!.worldToLocal(tmp);
  tmp.sub(arm.sh.position);
  const d = tmp.length();
  arm.sh.quaternion.setFromUnitVectors(DOWN, tmp2.copy(tmp).normalize());
  if (stretch) arm.sh.scale.y = clamp(d / ARM, stretch[0], stretch[1]);
  return Math.max(0, d - ARM * arm.sh.scale.y);
}

const qa = new THREE.Quaternion();
const qb = new THREE.Quaternion();
const m4 = new THREE.Matrix4();
const ax = new THREE.Vector3();
const ay = new THREE.Vector3();
const az = new THREE.Vector3();
/**
 * 摆一个东西的朝向：它的本地 −y 指向 space 坐标系里的方向 dir，本地 +z 尽量朝 up（正交化）。
 * 道具、球拍、手里的握持组都按这个约定：−y = 从握把指向干活的那头，+z = 道具的"上面"/正面。
 */
export function orient(
  obj: THREE.Object3D,
  space: THREE.Object3D,
  dir: THREE.Vector3,
  up: THREE.Vector3 = V(0, 0, 1),
): void {
  space.updateMatrixWorld(true);
  ay.copy(dir).normalize().negate();
  az.copy(up).addScaledVector(ay, -up.dot(ay));
  if (az.lengthSq() < 1e-6) az.set(0, 0, 1).addScaledVector(ay, -ay.z);
  if (az.lengthSq() < 1e-6) az.set(1, 0, 0);
  az.normalize();
  ax.crossVectors(ay, az).normalize();
  m4.makeBasis(ax, ay, az);
  qa.setFromRotationMatrix(m4);
  space.getWorldQuaternion(qb);
  qa.premultiply(qb);
  obj.parent!.getWorldQuaternion(qb);
  obj.quaternion.copy(qb.invert().multiply(qa));
}

/** 一个子物体上的本地点 → space 坐标 */
export function pointIn(space: THREE.Object3D, obj: THREE.Object3D, local: THREE.Vector3): THREE.Vector3 {
  space.updateMatrixWorld(true);
  return space.worldToLocal(obj.localToWorld(local.clone()));
}

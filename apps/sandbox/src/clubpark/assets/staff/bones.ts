// 从 desert3d-v2 的 buildPerson 建好的人身上取骨骼（只读那边的结构，不改那边的文件）。
// rig.ts 的建法：root → hips（第一个孩子）→ [torso, legR, legL, …]；torso → [head, armR.sh, armL.sh, …]；sh → [hand, …]；
// 没戴草帽的人 head 下只有一个 tilt 组（整颗头往后仰 0.32，脸朝镜头），帽子、头上的东西要挂进 tilt。
import * as THREE from 'three';

export interface Bones {
  root: THREE.Group;
  hips: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  /** 头的后仰组（头上加东西挂这里，跟着脸走） */
  tilt: THREE.Object3D;
  armR: { sh: THREE.Group; hand: THREE.Group };
  armL: { sh: THREE.Group; hand: THREE.Group };
  legR: THREE.Group;
  legL: THREE.Group;
}

const grp = (o: THREE.Object3D | undefined, what: string): THREE.Group => {
  if (!o || !(o as THREE.Group).isGroup) throw new Error(`staff/bones：找不到 ${what}（rig.ts 的结构变了？）`);
  return o as THREE.Group;
};

export function findBones(root: THREE.Group): Bones {
  const hips = grp(root.children[0], 'hips');
  const torso = grp(hips.children[0], 'torso');
  const head = grp(torso.children[0], 'head');
  const shR = grp(torso.children[1], 'armR');
  const shL = grp(torso.children[2], 'armL');
  // 右手在 −x（rig 的约定）：顺序变了就按位置认
  const [r, l] = shR.position.x < shL.position.x ? [shR, shL] : [shL, shR];
  const legA = grp(hips.children[1], 'legR');
  const legB = grp(hips.children[2], 'legL');
  const [lr, ll] = legA.position.x < legB.position.x ? [legA, legB] : [legB, legA];
  const tilt = head.children.length === 1 && (head.children[0] as THREE.Group).isGroup ? head.children[0] : head;
  return {
    root,
    hips,
    torso,
    head,
    tilt,
    armR: { sh: r, hand: grp(r.children[0], 'armR.hand') },
    armL: { sh: l, hand: grp(l.children[0], 'armL.hand') },
    legR: lr,
    legL: ll,
  };
}

const DOWN = new THREE.Vector3(0, -1, 0);
const tmp = new THREE.Vector3();
/** 把手臂指向 root 本地坐标里的一点（简易 IK：只转肩，同 rig.ts 的 aim） */
export function aim(b: Bones, arm: { sh: THREE.Group }, target: THREE.Vector3): void {
  b.root.updateMatrixWorld(true);
  tmp.copy(target);
  b.root.localToWorld(tmp);
  arm.sh.parent!.worldToLocal(tmp);
  tmp.sub(arm.sh.position).normalize();
  arm.sh.quaternion.setFromUnitVectors(DOWN, tmp);
}

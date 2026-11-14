// 水里的人怎么动（clubsite/people 没有游泳的姿势：每步先摆 idle 定格，再按 bones.ts 的 reach 把两只胳膊摆到位）。
// 人站在池底往下沉（水面不透明，水下的身子看不见），露出来的是头、肩和举出水面的胳膊：
//   crawl     自由泳：两只胳膊一前一后抡圈（出水 → 往前插 → 水下划 → 从后面出来），身子往前趴一点
//   tread     踩水：胳膊在水下往两边划（看不见），头一点一点
//   wave      招手（假警报）：一只手举过头左右摆，另一只踩水 —— 和呛水不一样：只有一只手、节奏匀、不往下沉
//   splash    玩水：两只手往前拍水面（匀的）
//   struggle  呛水：身子竖起来、往后仰，两只手乱举乱扑腾（节奏不匀），头一沉一沉；amp 0..1 = 扑腾得多厉害
import * as THREE from 'three';
import { type Bones, findBones, reach } from '../../clubsite/people/bones';

export type Stroke = 'crawl' | 'tread' | 'wave' | 'splash' | 'struggle';

export interface SwimRig {
  obj: THREE.Object3D;
  /** 摆胳膊的坐标系（大人 = 人本身；孩子 = kid-body） */
  body: THREE.Object3D;
  b: Bones;
  /** 两肩在 body 坐标里的位置（idle 定格时） */
  shR: THREE.Vector3;
  shL: THREE.Vector3;
  kid: boolean;
}

const tmp = new THREE.Vector3();

export function rigOf(obj: THREE.Object3D, kid: boolean): SwimRig {
  const b = findBones(obj as THREE.Group, false);
  const body = obj.children.find((c) => c.name === 'kid-body') ?? obj;
  obj.userData.setSeat?.(null);
  obj.userData.pose?.('idle', 0.3);
  obj.updateMatrixWorld(true);
  const sh = (g: THREE.Object3D) => body.worldToLocal(g.getWorldPosition(new THREE.Vector3()));
  return { obj, body, b, shR: sh(b.armR.sh), shL: sh(b.armL.sh), kid };
}

/** 头顶（世界坐标）：标记、气泡、水花从这里算 */
export function headTop(r: SwimRig, out: THREE.Vector3, up = 0.25): THREE.Vector3 {
  r.b.head.getWorldPosition(out);
  out.y += up * (r.kid ? 0.8 : 1);
  return out;
}

/** 拳头（世界坐标） */
export function fist(r: SwimRig, side: 'R' | 'L', out: THREE.Vector3): THREE.Vector3 {
  return (side === 'R' ? r.b.armR.hand : r.b.armL.hand).getWorldPosition(out);
}

/**
 * 摆一步。ph = 这个动作自己的相位（秒数随意，函数里取小数），t = 模拟时间（乱扑腾的不规则节奏用），amp = 呛水的厉害程度。
 * 先 idle 定格（rig 把骨骼摆回站姿），再改躯干、头、两只胳膊。
 */
export function swimPose(r: SwimRig, stroke: Stroke, ph: number, t: number, amp = 1, seed = 0) {
  const { obj, body, b, shR, shL } = r;
  obj.userData.pose?.('idle', 0.3);
  b.torso.rotation.z = 0;
  b.head.rotation.y = 0;
  const a = (ph % 1) * Math.PI * 2;
  const arm = (side: 'R' | 'L', dx: number, dy: number, dz: number) => {
    const s = side === 'R' ? shR : shL;
    reach(body, side === 'R' ? b.armR : b.armL, tmp.set(s.x + dx, s.y + dy, s.z + dz), [0.85, 1.2]);
  };
  switch (stroke) {
    case 'crawl': {
      // 胳膊绕肩画竖圈（yz 平面）：0 = 举在头顶，π/2 = 往前伸，π = 水下，3π/2 = 身后
      b.torso.rotation.x = 0.32;
      b.head.rotation.x = 0.1 + 0.08 * Math.sin(a * 2);
      b.head.rotation.y = 0.35 * Math.sin(a);
      arm('R', -0.06, 0.5 * Math.cos(a), 0.5 * Math.sin(a));
      arm('L', 0.06, 0.5 * Math.cos(a + Math.PI), 0.5 * Math.sin(a + Math.PI));
      break;
    }
    case 'tread': {
      b.head.rotation.x = -0.05 + 0.05 * Math.sin(a * 2);
      arm('R', -0.32 - 0.1 * Math.sin(a), -0.3, 0.12 + 0.12 * Math.cos(a));
      arm('L', 0.32 + 0.1 * Math.sin(a), -0.3, 0.12 - 0.12 * Math.cos(a));
      break;
    }
    case 'wave': {
      // 招手：右手举过头、手腕那头左右摆（匀的），左手踩水
      b.head.rotation.x = -0.12;
      arm('R', -0.12 + 0.16 * Math.sin(a * 2), 0.44, 0.08);
      arm('L', 0.32, -0.3, 0.14);
      break;
    }
    case 'splash': {
      // 两只手一起往前拍水面
      const k = Math.abs(Math.sin(a));
      b.torso.rotation.x = 0.12;
      arm('R', -0.2, -0.12 + 0.3 * k, 0.38);
      arm('L', 0.2, -0.12 + 0.3 * k, 0.38);
      break;
    }
    case 'struggle': {
      // 不匀的节奏：两个不成整数比的正弦叠起来（每个人的 seed 不一样），两只手轮流往上够、往下拍
      const w1 = Math.sin(t * 7.3 + seed) + 0.6 * Math.sin(t * 11.9 + seed * 2.1);
      const w2 = Math.sin(t * 8.7 + seed * 1.7 + 1.3) + 0.6 * Math.sin(t * 13.1 + seed * 0.7);
      b.torso.rotation.x = -0.18 * amp;
      b.torso.rotation.z = 0.12 * amp * Math.sin(t * 3.1 + seed);
      b.head.rotation.x = -0.45 * amp + 0.1 * Math.sin(t * 5.3 + seed);
      const up = 0.12 + 0.34 * amp;
      arm('R', -0.22 + 0.1 * w1, up + 0.12 * w1, 0.1 + 0.08 * w2);
      arm('L', 0.22 + 0.1 * w2, up + 0.12 * w2, 0.1 - 0.08 * w1);
      break;
    }
  }
}

/** 呛水时头一沉一沉（米，往下为正）：不匀的；amp 0..1 */
export function struggleDip(t: number, seed: number, amp: number): number {
  const w = 0.5 + 0.5 * Math.sin(t * 2.3 + seed) * Math.sin(t * 3.7 + seed * 1.9);
  return amp * (0.06 + 0.2 * w * w);
}

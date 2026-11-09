// 门童、代客自己的姿势（rig 没有的）：在 rig 的 idle（骨骼已复位）上面再摆。
// 手臂是一整根（肩 → 拳头 0.44 米），只能转肩；所以动作都靠"手臂指向哪里 + 身子怎么倾"读出来。
// 正面朝 +z，右手在 −x（同 rig）。phase 0..1 播一遍；画廊里不给 phase 时循环。
import * as THREE from 'three';
import { aim, type Bones } from './bones';

export const STAFF_POSES = ['wave', 'usher', 'handoff'] as const;
export type StaffPose = (typeof STAFF_POSES)[number];

/** handoff：手伸到最远、钥匙换手的 phase（演出在这一刻 setProp('keys') / setProp(null)） */
export const HANDOFF_AT = 0.5;

/** 每个姿势播一遍的秒数（画廊自动播放用；演出按需要自己推 phase） */
export const STAFF_PERIOD: Record<StaffPose, number> = {
  wave: 2.2,
  usher: 2.4,
  handoff: 1.6,
};

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const smooth = (a: number, b: number, t: number) => {
  const k = THREE.MathUtils.clamp((t - a) / (b - a), 0, 1);
  return k * k * (3 - 2 * k);
};
/** 进 a..b、出 c..d 的包络（0 → 1 → 0） */
const env = (p: number, a: number, b: number, c: number, d: number) => smooth(a, b, p) * (1 - smooth(c, d, p));

/** 手臂垂在身侧时拳头的位置（root 本地；含 idle 那 0.12 的外张） */
const REST_R = V(-0.32, 0.55, 0.02);
const REST_L = V(0.32, 0.55, 0.02);

export function applyStaffPose(b: Bones, name: StaffPose, p: number): void {
  switch (name) {
    case 'wave': {
      // 挥手（门童迎客）：0..0.18 左手往外上方举起 → 0.18..0.82 左右挥三下 → 0.82..1 放下。
      // 用左手（本地 +x）：门童站在南门柱外、rotY 0.6 时左手朝东北 = 朝开进来的车，右手那边是门柱（会挡住手）；
      // 右手留给 usher（"这边请"指向大门）。举起的手（白手套）落在帽檐外侧、脸的高度，远看也认得出来。身子往反侧微歪。
      const up = env(p, 0, 0.18, 0.82, 1);
      const w = Math.sin(((p - 0.18) / 0.64) * Math.PI * 6) * smooth(0.14, 0.24, p) * (1 - smooth(0.76, 0.86, p));
      // 手臂往外上方斜举 ≈ 50°（肩在 (0.27, 0.98)，手臂只有 0.44 米，举不过头）：45° 俯视下竖直方向只剩 0.7 倍，
      // 所以往上要比往外多给 → 屏幕上读成"举起"而不是"伸平"；手落在帽檐外侧，左右摆 ±0.2
      const hand = REST_L.clone().lerp(V(0.78 + w * 0.2, 1.75, 0.15), up);
      b.armL.sh.position.y += 0.05 * up; // 耸一点肩，手再高 5 厘米
      aim(b, b.armL, hand);
      b.torso.rotation.z = -0.06 * up;
      b.head.rotation.z = 0.08 * up;
      b.head.rotation.x = -0.06 * up;
      break;
    }
    case 'usher': {
      // 请进（门童、代客开门）：0..0.3 欠身、右手从身侧往外打开到腰高（掌心朝前的"这边请"）→ 停 → 0.8..1 收回。
      // 欠身 0.22 弧度：帽子往前点一下，45° 俯视下读得出是在鞠躬；手伸出去 ≈ 0.75 米，离开身子的剪影。
      const k = env(p, 0, 0.3, 0.8, 1);
      b.torso.rotation.x = 0.22 * k;
      b.torso.rotation.y = -0.22 * k;
      b.head.rotation.x = 0.08 * k;
      b.head.rotation.y = -0.12 * k;
      aim(b, b.armR, REST_R.clone().lerp(V(-0.72, 0.82, 0.38), k));
      // 左手收到身前肚子上（鞠躬的另一只手）
      aim(b, b.armL, REST_L.clone().lerp(V(0.12, 0.66, 0.34), k));
      break;
    }
    case 'handoff': {
      // 接 / 递钥匙：0..0.4 右手往前伸到胸口高（身前 0.55 米）→ HANDOFF_AT 停在最远 → 0.6..1 收回身侧。身子跟着前倾一点。
      const k = env(p, 0, 0.4, 0.6, 1);
      b.torso.rotation.x = 0.12 * k;
      b.head.rotation.x = 0.05 * k;
      aim(b, b.armR, REST_R.clone().lerp(V(-0.16, 0.98, 0.58), k));
      break;
    }
  }
}

// 画面这边的站位契约（冻结）：clubsite/sim 的每个地点（PlaceId）在世界里怎么站。spots.ts 填表，演出（clubwalk/sim/*）读表。
// 坐标是世界坐标（米，clubsite/world.ts 那一套，y 朝上，北 = −z，东 = +x）。
import type { PlaceId } from '../../clubsite/sim/types';

/** 姿势名：clubsite/people 的 ALL_POSES（rig 的 idle、walk、ready、forehand、backhand、serve…… + poses.ts 的 sit、sip、clap、dink、pour、drag、skim……） */
export type PoseName = string;

export interface Spot {
  x: number;
  z: number;
  /** 地面以上的高度（看台、二楼、吧凳）；不给 = 导航的地面高度 */
  y?: number;
  /** 朝向（弧度，0 = 朝 +z / 南，π/2 = 朝 +x / 东；同 rig 的 rotation.y） */
  yaw: number;
  /** 站在这个位置默认摆什么姿势（不给 = 按 doing 的默认，见 pose.ts） */
  pose?: PoseName;
}

export interface PlaceSpots {
  /** 在这里干事的位置，个数 = places.ts 里这个地点的 cap（第 i 个人站 spots[i % length]） */
  spots: Spot[];
  /** 排队：从队头往外排的一串点（第 k 个排队的人站在 queue[k]，超出的沿最后两点的方向往外延，间距 1.1 米） */
  queue?: Spot[];
  /**
   * 走过来的路最后进到哪（门口、场地的门）：导航从这里接到站位，免得人穿过围网、柜台。不给 = 直接寻路到站位。
   * 在室内 / 楼上的地点（会所二楼、负一层）也用它：走到 door 就"进去了"（人藏起来），出来时从 door 冒出来。
   */
  door?: { x: number; z: number };
  /** 在里面看不见（室内的更衣室、健身房、楼上）：人走到 door 就藏起来 */
  hidden?: boolean;
}

export type SpotTable = Readonly<Record<PlaceId, PlaceSpots>>;

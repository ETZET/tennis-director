import type { XZ } from '@td/shared';
import type { Venue } from '../activities/types';
import type { RainLighting } from '../ambient/rain';
import type { CameraPose, OrbitLimits } from '../camera/orbit';
import type { CourtFrame } from './frame';
import type { LightingDef, Stage } from './stage';

/**
 * 一张地图在画面这一侧要提供的东西（游戏 app 只认这个接口，不直接引用某个场景的模块）。
 * 名字和内容里地图的锚点一一对应：模拟只说"在 outer_1"，在哪儿、怎么走过去由这里决定。
 */
export interface Site {
  readonly id: string;
  readonly lighting: LightingDef;
  readonly rain: RainLighting;
  readonly camera: { readonly overview: CameraPose; readonly portrait: CameraPose; readonly limits: OrbitLimits };
  /** 活动动画库的场地风格 */
  readonly venue: Venue;
  /** 园区范围（路人、风滚草在这里面活动） */
  readonly bounds: { readonly x0: number; readonly x1: number; readonly z0: number; readonly z1: number };
  /** 人和球脚下的高度 */
  groundY(x: number, z: number): number;
  /** 每个地点的中心（活动牌挂在这儿） */
  readonly anchors: Readonly<Record<string, XZ>>;
  /** 每个地点上人站在哪儿（地点牌也挂在这儿） */
  readonly stands: Readonly<Record<string, XZ>>;
  /** 两个地点之间步行的折线（含两头的站位） */
  routeLine(a: string, b: string): XZ[] | null;
  /** 地点 → 那儿的球场（演出、路人打球、员工朝向用）；一个地点可以有几块场地 */
  readonly courts: Readonly<Record<string, readonly CourtFrame[]>>;
  /** 地点 → 不是球场的空地（烧烤会之类的演出） */
  readonly grounds: Readonly<Record<string, CourtFrame>>;
  /** 建静态场景 */
  build(stage: Stage): void;
  /** 设施状态的画面层 */
  createOverlays(stage: Stage): { set(facility: string, state: string): void };
  /** 天空和远景的动画（没有就什么也不做） */
  createSky(stage: Stage): { update(dt: number, now: number, rain: number): void };
}

/** 折线上走过比例 u（0..1）处的点。 */
export function pointAlong(pts: readonly XZ[], u: number): XZ {
  let total = 0;
  for (let i = 1; i < pts.length; i++)
    total += Math.hypot((pts[i] as XZ).x - (pts[i - 1] as XZ).x, (pts[i] as XZ).z - (pts[i - 1] as XZ).z);
  let left = Math.max(0, Math.min(1, u)) * total;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1] as XZ;
    const b = pts[i] as XZ;
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    if (left <= d || i === pts.length - 1) {
      const f = d > 0 ? Math.min(1, left / d) : 1;
      return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f };
    }
    left -= d;
  }
  return pts[pts.length - 1] ?? { x: 0, z: 0 };
}

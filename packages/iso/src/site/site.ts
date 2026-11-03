import type { XZ } from '@td/shared';
import type { Venue } from '../activities/types';
import type { IsoCameraPose } from '../core/camera';
import type { IsoWorld } from '../core/world';
import type { CourtFrame } from '../world/frame';

/**
 * 一张地图在画面这一侧要提供的东西（游戏 app 只认这个接口，不直接引用某个场景的模块；ADR 0016、0019）。
 * 名字和内容里地图的锚点一一对应：模拟只说"在 outer_1"，在哪儿、怎么走过去由这里决定。
 */
export interface Site {
  readonly id: string;
  /** 起始天色（之后由 daylight 按游戏时钟设） */
  readonly sky: string;
  readonly camera: {
    readonly overview: IsoCameraPose;
    readonly portrait: IsoCameraPose;
    readonly limits: {
      readonly zoom: readonly [number, number];
      readonly tx: readonly [number, number];
      readonly tz: readonly [number, number];
    };
  };
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
  /** 地面贴图 + 静态节点；同一条种子随机流，顺序就是画面 */
  build(w: IsoWorld): void;
  /**
   * 设施状态的画面层。wear（可选）：状况往下掉时的画面信号，amount 0 干净、1 快掉档、再往上已经掉档
   * （准则 6"先出画面信号，再掉档"；状况怎么换算成 amount 由游戏决定）
   */
  createOverlays(w: IsoWorld): {
    set(facility: string, state: string): void;
    wear?(facility: string, amount: number): void;
  };
  /** 天空和远景的动画（没有就什么也不做）；wind 0 无风 .. 1 大风（可选，默认 0.3） */
  createSky(w: IsoWorld): { update(dt: number, now: number, rain: number, wind?: number): void };
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

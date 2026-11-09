// 可挂载的场景模块（"区域"）的接口：一个俱乐部场景 = 一个区域，独立页面（src/<场景>/main.ts）和大世界（src/clubwalk/）都用它。
// 场景的 src/<场景>/scene.ts 导出 create<场景>Region(host) → Region；main.ts 只剩页面的壳（管线、太阳、天、标签、画廊、循环）。
//
// 独立页面：host.parent = 页面的 scene（和拆模块之前一模一样：东西直接加进 scene，像素不变）。
// 大世界（clubwalk）：host.parent = 这个区域自己的 Group；host.director = 唯一的总监（区域不自己建，slot('director') 给这个）；
//   区域照常把整块地（含给邻居做背景的部分、地图边的山）都建出来，clubwalk 再按区域的范围裁掉范围外的地形、藏掉范围外的摆件、
//   拿掉山（底图有）。所以场景模块不用知道自己在大世界里，只要做到下面几条：
//   1. 东西都加到 host.parent 下面，按名字找东西用 host.parent.getObjectByName（不是 scene：大世界里别的区域也有 slot:bench）；
//   2. 地形放在名字是 'terrain' 的 Group 里，摆件（SLOTS）名字 'slot:<id>'；地图边的山是 clubsite/mountains 的 'mtn'；
//   3. 有 host.director 时不建自己的 director，用它（life 里按 slot('director') 拿的，也给它）；
//   4. 总监的活登记在 attach(play) 里（互动点、手里的东西、挡路的人、顶栏），不在建场景的时候；
//   5. 导航给世界坐标的形状（nav()），能走的范围可以比区域大（clubwalk 只取区域范围里的）。
// 看图模式的白模标签走 host.label（大世界不给）。
import type * as THREE from 'three';
import type { CameraOpts, Play, Ramp, Rect, Shape } from './play';
import type { SharedUniforms } from './render/ctx';

export interface RegionHost {
  /** 页面的场景（总监、手里的东西挂在这里 = play.scene） */
  scene: THREE.Scene;
  /** 这个区域的东西加到哪：独立页面 = scene；大世界 = 区域自己的 Group（变换是单位矩阵，坐标照旧是世界坐标） */
  parent: THREE.Object3D;
  /** 共用的 uniform（时间、风、云影）：大世界里所有区域同一份 */
  uniforms: SharedUniforms;
  params: URLSearchParams;
  /** 当前的米/纹素（pipe.rig.metersPerTexel；材质按纹素对齐用） */
  texelMeters(): number;
  /** 设计纹素（米）：素材按 2× 的纹素建模，和像素级别无关 */
  designTexel: number;
  /** 演出（life.ts）开不开 */
  life: boolean;
  /** 玩法：总监交给玩家（life 不演总监） */
  play: boolean;
  /** 大世界：唯一的总监（clubsite/people 的 director，已经在 scene 里）；区域不建自己的 */
  director?: THREE.Object3D;
  /** 看图模式的白模标签（独立页面）；不给 = 不贴 */
  label?(text: string, p: THREE.Vector3, kind: string, below?: boolean): void;
}

/** 区域的导航（世界坐标，同 clubsite/play 的 NavSpec 减去 groundAt） */
export interface RegionNav {
  bounds: Rect;
  walkable?: Shape[];
  blocked?: Shape[];
  ramps?: Ramp[];
  /** 能直接迈上去的高差（米，默认 0.3；看台的端梯要 0.36） */
  stepUp?: number;
}

/** 独立页面开局的总监：站哪、朝哪、相机 */
export interface RegionStart {
  start: readonly [number, number];
  yaw?: number;
  camera?: CameraOpts;
  hint?: string;
}

/** attach(play) 的返回：每个模拟步（play.update 之后）调一次 step */
export interface RegionJobs {
  step(dt: number): void;
}

export interface Region {
  /** 场景名（clubpickle…） */
  readonly id: string;
  readonly root: THREE.Object3D;
  /** 地面高度（台地、草坪、台阶外的地面；坡道由 nav().ramps 覆盖） */
  groundAt(x: number, z: number): number;
  /** 建好以后才有（有的挡路形状按摆好的资产量） */
  nav(): RegionNav;
  /** 场景里的总监（独立页面 mountPlay 用；大世界 = host.director） */
  director(): THREE.Object3D | null;
  /** 独立页面的开局 */
  readonly start: RegionStart;
  /** 每个模拟步（固定 1/60 秒），play.update 之前：资产的 userData.update + life */
  update(dt: number, t: number): void;
  /** 每个模拟步，play.update 和 jobs.step 之后（要在总监动完以后再跑的，例如 clubplaza 的 life.post） */
  post?(dt: number, t: number): void;
  /** 登记总监的活（一次）。没开 life 的场景可以返回 null */
  attach(play: Play): RegionJobs | null;
  /** 白模的计数（看图模式左下角的字） */
  readonly counts: Record<string, number>;
  /** 调试钩子（window.__<场景> 里原来有的：life、palOpts、own、reused…） */
  readonly debug: Record<string, unknown>;
}

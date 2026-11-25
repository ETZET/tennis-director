// fx 的各部分共用的类型和小工具（index.ts 拼起来；各部分只 import 这里，不互相 import）。
import type * as THREE from 'three';
import type { FoodKit } from '../../../clubfood/scene';
import type { ParkKit } from '../../../clubpark/scene';
import type { PeopleCtx } from '../../../clubsite/people/props';
import type { AgentView, SimState } from '../../../clubsite/sim/types';
import type { Rect } from '../../../clubsite/world';

/** mount.ts 的演员（只读这几样；x / z 在 cars.ts 里会改：下车、上车的人站到自己的车门边） */
export interface FxActor {
  id: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  hidden: boolean;
  moving: boolean;
  walkPh: number;
  hash: number;
  kind: 'adult' | 'kid' | 'teen';
  body: { obj: THREE.Object3D; prop: string | null | undefined } | null;
  /** 正在走的那段路（cars.ts 把去停车场的那段的终点换成自己的车门） */
  leg: { key: string; way: [number, number][]; route: unknown } | null;
}

export interface FxFrame {
  /** 真实秒（这一帧）、真实时间（mount 的 rt：挥拍的节奏按它走） */
  dt: number;
  rt: number;
  /** 引擎的分钟（带小数：两步之间插值） */
  now: number;
  /** 加速档（游戏分钟 / 真实秒）：按真实时间演的东西（递出窗口、开车）要换算 */
  speed: number;
  s: SimState;
  views: readonly AgentView[];
  actors: ReadonlyMap<string, FxActor>;
  /** 取景（外扩一圈）：外面的车、球不建 */
  view: Rect;
}

export interface SimFx {
  frame(f: FxFrame): void;
  /** 关掉观察：道具都藏起来，场景的车放回来 */
  off(): void;
  stats(): Record<string, unknown>;
  /**
   * 预热（观察一打开就调）：托盘、杯子、车、关摊的卷帘先建好放进池子，再建几个"替身"摆遍新姿势、拿遍道具，
   * 全部在镜头底下的地面以下画两帧（编译着色器、上传几何），然后收起来。分在接下来的几十帧里做（每帧 ≤ 4 毫秒），
   * 要等第一具身子出来（材质上下文从它身上拿）才开始。之后第一次出托盘、第一次躺下就不卡了。
   */
  prewarm(): void;
}

/** 道具要的材质上下文：各场景的 kit（同一套 uniforms → 跟着天光、配色方案走） */
export interface FxKits {
  people: PeopleCtx;
  food: FoodKit;
  park: ParkKit;
}

export interface FxHost {
  scene: THREE.Scene;
  pipe: { rig: { metersPerTexel: number; target: THREE.Vector3 } };
  /** 建一具 Q 版人（预热的替身；mount 的 SimHost.make） */
  make?(kind: 'adult' | 'kid' | 'teen'): THREE.Object3D;
  /** 预编着色器（mount 的 SimHost.prewarm = pipe.prewarm）：root 里看得见的网格三套 pass 都编好 */
  prewarm?(root: THREE.Object3D): Promise<unknown>;
}

export interface FxPart {
  frame(f: FxFrame, k: FxKits): void;
  off(): void;
  stats?(): Record<string, unknown>;
}

// ── 共用的小工具 ─────────────────────────────────────────────────────────────

/** 同 mount.ts 的 hashOf（FNV-1a → 0..1）：每个人、每块场的节奏错开都按它 */
export const hashOf = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10007) / 10007;
};

export const inRect = (r: Rect, x: number, z: number, m = 0) =>
  x > r.x0 - m && x < r.x1 + m && z > r.z0 - m && z < r.z1 + m;

/** 一个人的身子此刻能不能摆（有身子、看得见） */
export function bodyOf(a: FxActor | undefined): THREE.Object3D | null {
  const o = a?.body?.obj;
  return o && !a.hidden && o.visible ? o : null;
}

/** 两只拳头的中点（世界坐标；拿托盘、递东西） */
export function handsMid(o: THREE.Object3D, out: THREE.Vector3): THREE.Vector3 {
  const hp = o.userData.handPoint as ((s: 'R' | 'L') => THREE.Vector3) | undefined;
  if (!hp) return out.copy(o.position);
  const r = hp('R');
  const l = hp('L');
  return out.copy(r).add(l).multiplyScalar(0.5);
}

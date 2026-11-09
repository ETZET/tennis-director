// clubmap2 的取景（屏幕坐标）—— mountains.ts 按默认视角的天际线压山高，clubmap2/main.ts 按它自动取景，两边用同一套数。
//
// 正交相机，俯角 PITCH，方位 yaw：屏幕横向 sx = p·r，竖向 v = y·cosφ − (p·c)·sinφ（c = 朝镜头的水平方向）。
// 默认横屏取景（yaw 38°，从东南看，远边 = 西北）：先框住 FIT（围墙、停车场、高尔夫），再在上面加最多 HEADROOM 的余量
// （俱乐部缩小约 15%），余量里是远边的山梁和一条天。横屏比 1.38 宽的画面都是竖向卡住，所以天际线和画面比例无关。
import { FIT } from './world';

export const PITCH = (45 * Math.PI) / 180;
/** 默认视角（横屏）的方位（度）；竖屏默认 62° */
export const VIEW_YAW = 38;
export const VIEW_YAW_PORTRAIT = 62;
/** 取景框上面最多加地图高度的这么多（0.2 → 俱乐部缩小 1 − 1/1.2 ≈ 17%；FIT 的东南角同时收了一点，实际比原来小 15%） */
export const HEADROOM = 0.2;
/** 山顶上面至少留这么多天（占画面高度） */
export const SKY_STRIP = 0.04;
/** 自动取景时内容放大一点（四周的 FIT 余量出画一点） */
export const FIT_TIGHT = 0.98;
/** FIT 四角的顶算到多高（米，墙、树、会所） */
export const FIT_TOP = 10;

/** 水平朝右、朝镜头的单位向量（x, z） */
export function axes(yawDeg: number): { r: [number, number]; c: [number, number] } {
  const a = (yawDeg * Math.PI) / 180;
  return { r: [Math.cos(a), -Math.sin(a)], c: [Math.sin(a), Math.cos(a)] };
}

/** 世界点 → 屏幕（米）：[横, 竖] */
export function screenOf(x: number, y: number, z: number, yawDeg: number): [number, number] {
  const { r, c } = axes(yawDeg);
  return [x * r[0] + z * r[1], y * Math.cos(PITCH) - (x * c[0] + z * c[1]) * Math.sin(PITCH)];
}

/** FIT 框（顶 FIT_TOP、底 −1）在屏幕上的范围 */
export function fitRange(yawDeg: number): { sx0: number; sx1: number; v0: number; v1: number } {
  let sx0 = Infinity;
  let sx1 = -Infinity;
  let v0 = Infinity;
  let v1 = -Infinity;
  for (const x of [FIT.x0, FIT.x1])
    for (const z of [FIT.z0, FIT.z1])
      for (const y of [FIT_TOP, -1]) {
        const [sx, v] = screenOf(x, y, z, yawDeg);
        sx0 = Math.min(sx0, sx);
        sx1 = Math.max(sx1, sx);
        v0 = Math.min(v0, v);
        v1 = Math.max(v1, v);
      }
  return { sx0, sx1, v0, v1 };
}

/**
 * 默认横屏取景里天际线的屏幕高度 v：画面顶 = 地图底 + (地图高 + 最大余量)·FIT_TIGHT，再往下留 SKY_STRIP 的天。
 * mountains.ts 把远边的山顶压在这条线以下（每道山梁再往下错开一点 → 一层层）。
 */
export function skylineV(yawDeg = VIEW_YAW): number {
  const { v0, v1 } = fitRange(yawDeg);
  const V = (v1 - v0) * (1 + HEADROOM) * FIT_TIGHT;
  return v0 + V * (1 - SKY_STRIP);
}

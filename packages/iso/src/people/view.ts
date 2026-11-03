/**
 * 人物和特效需要知道的镜头信息：转角（决定精灵朝向）和"每个素材像素合多少米"（挂点换算）。
 * 画面每帧（或转角、缩放变化时）调用 setPeopleView；没调用时按 0 度、1 档精灵算。
 */

import { HV, K1 } from '../core/proj';

export { HV, K1 };

const view = { ang: 0, c: 1, s: 0, k: K1, spriteScale: 1 };

/**
 * 设镜头转角（弧度，和投影的 ang 一致）；k 是当前每米缓冲像素，spriteScale 是精灵档位。
 * 后两个不给时按 1 档（挂点换算按 K1）。
 */
export function setPeopleView(ang: number, k?: number, spriteScale?: number): void {
  view.ang = ang;
  view.c = Math.cos(ang);
  view.s = Math.sin(ang);
  if (k != null && k > 0) view.k = k;
  if (spriteScale != null && spriteScale > 0) view.spriteScale = spriteScale;
  else if (k != null && k > 0) view.spriteScale = Math.max(1, Math.round(k / K1));
}

export function peopleView(): Readonly<typeof view> {
  return view;
}

/** 世界方向 (fx, fz) 在屏幕上的走向：sdx > 0 朝右，sdy > 0 朝下（朝镜头）。 */
export function screenDir(fx: number, fz: number, ang = view.ang): { sdx: number; sdy: number } {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const rx = c * fx - s * fz;
  const rz = s * fx + c * fz;
  return { sdx: rx - rz, sdy: rx + rz };
}

/**
 * 素材像素偏移（dx 向右、dy 向下，单位是素材像素）→ 世界偏移（米），投影后正好落在精灵的那个像素上。
 * toCam 是额外往镜头方向挪的距离（米，不改变屏幕位置，只让深度排序把挂着的东西画在前面）。
 */
export function artOffsetToWorld(dx: number, dy: number, toCam = 0): { x: number; y: number; z: number } {
  const m = view.spriteScale / view.k; // 每个素材像素合多少"k 单位"
  const bx = dx * m; // 屏幕横向（以 k 为 1 米）
  const by = dy * m;
  // 屏幕横向 bx：rx - rz = bx，rx + rz = 0
  let rx = bx / 2;
  let rz = -bx / 2;
  let y = -by / HV;
  // 朝镜头：rx、rz 同增 d，y 增 d/HV，屏幕位置不变
  rx += toCam;
  rz += toCam;
  y += (2 * toCam) / 2 / HV;
  const { c, s } = view;
  // 反转：rx = c x - s z，rz = s x + c z
  return { x: c * rx + s * rz, y, z: -s * rx + c * rz };
}

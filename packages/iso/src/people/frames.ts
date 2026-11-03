import { type ArtAnim, type Facing, FRAME_FALLBACK, type PersonSheet, type PixelArt } from '../art/format';
import { type KeyPose, type PoseName, STROKES, type StrokeName } from './poses';
import { screenDir } from './view';

/**
 * 人物精灵的取帧逻辑（纯函数，node 里能测）：朝向、姿势 → 帧名、击球分段、按名字取帧和回退。
 */

/** 按世界朝向（yaw：面朝 (sin yaw, cos yaw)）和镜头转角选底图朝向和是否翻转。 */
export function facingFor(yaw: number, ang?: number): { facing: Facing; flip: boolean } {
  const { sdx, sdy } = screenDir(Math.sin(yaw), Math.cos(yaw), ang);
  return { facing: sdy < -0.05 ? 'back' : 'front', flip: sdx < -0.05 };
}

/** FRAME_FALLBACK 之外的回退（精灵表没画的分段） */
const EXTRA_FALLBACK: Readonly<Record<string, readonly string[]>> = {
  sT2: ['sT'],
  bhB: ['fhB'],
  bhC: ['fhC'],
  bhF: ['fhF'],
};

/** 按名字取一组帧：取不到就按 FRAME_FALLBACK 往回找，最后用 idle；另一个朝向有也行。 */
export function resolveAnim(sheet: PersonSheet, name: string, facing: Facing): { name: string; anim: ArtAnim } | null {
  const seen = new Set<string>();
  const order: string[] = [];
  const visit = (n: string) => {
    if (seen.has(n)) return;
    seen.add(n);
    order.push(n);
    for (const f of FRAME_FALLBACK[n] ?? EXTRA_FALLBACK[n] ?? []) visit(f);
  };
  visit(name);
  visit('idle');
  for (const n of order) {
    const a = sheet.anims[n];
    if (!a) continue;
    const an = a[facing] ?? a[facing === 'front' ? 'back' : 'front'];
    if (an?.frames.length) return { name: n, anim: an };
  }
  return null;
}

/** 循环动画按时间取第几帧。 */
export function loopIndex(anim: ArtAnim, t: number): number {
  const n = anim.frames.length;
  if (n <= 1) return 0;
  return ((Math.floor(Math.max(0, t) / Math.max(0.01, anim.dt)) % n) + n) % n;
}

/** 走路按步伐相位取帧：相位走 2π 是一整个迈步周期。 */
export function phaseIndex(anim: ArtAnim, phase: number): number {
  const n = anim.frames.length;
  if (n <= 1) return 0;
  const i = Math.floor((phase / (Math.PI * 2)) * n);
  return ((i % n) + n) % n;
}

/**
 * 击球进行到 t 秒（相对击球时刻）时用哪个关键姿势的帧：取最近的关键帧（BASE / BASE+ 换成基础姿势）。
 * 击球还没开始（早于第一帧）或已结束返回 null。
 */
export function strokeKey(type: StrokeName, t: number, base: PoseName): PoseName | null {
  const fr = STROKES[type] as readonly (readonly [number, KeyPose])[];
  const first = fr[0];
  const last = fr[fr.length - 1];
  if (!first || !last || t < first[0] || t >= last[0]) return null;
  let i = 0;
  while (i < fr.length - 2 && t >= (fr[i + 1] as readonly [number, KeyPose])[0]) i++;
  const a = fr[i] as readonly [number, KeyPose];
  const b = fr[i + 1] as readonly [number, KeyPose];
  const k = (t - a[0]) / (b[0] - a[0]) < 0.5 ? a[1] : b[1];
  return k === 'BASE' || k === 'BASE+' ? base : k;
}

/** 坐着的基础姿势（有 seatY 但基础姿势不是这几个时，按 seated 画） */
export const SEATED = new Set<string>(['seated', 'seatPhone', 'sitGround']);

/** 一帧的选择结果 */
export interface FramePick {
  /** 想要的帧名（回退前） */
  want: string;
  /** 实际取到的帧名 */
  name: string;
  index: number;
  facing: Facing;
  flip: boolean;
  art: PixelArt | null;
}

/** 取帧需要的人物状态 */
export interface FrameState {
  yaw: number;
  base: PoseName;
  seated: boolean;
  down: 'face' | 'back' | null;
  /** 当前击球关键姿势（strokeKey 的结果） */
  strokeKey: PoseName | null;
  gesture: { name: string; t: number } | null;
  /** 平滑后的速度（米/秒）和步伐相位 */
  speed: number;
  phase: number;
  hop: boolean;
  now: number;
  /** 抱着纸箱（carryBox 帧自带箱子；走路时两帧轮流，站着用第 0 帧） */
  carryBox?: boolean;
}

/** 跑步的速度门槛（米/秒） */
export const RUN_SPEED = 2.2;
/** 低于这个速度算站着 */
export const WALK_SPEED = 0.25;

/** 按人物状态选帧。 */
export function pickFrame(sheet: PersonSheet, s: FrameState, ang?: number): FramePick {
  const { facing, flip } = facingFor(s.yaw, ang);
  let want: string;
  let mode: 'loop' | 'phase' | 'gest' = 'loop';
  let t = s.now;
  if (s.down) want = s.down === 'face' ? 'fallFace' : 'fallBack';
  else if (s.strokeKey) want = s.strokeKey;
  else if (s.gesture) {
    want = s.gesture.name;
    mode = 'gest';
    t = s.gesture.t;
  } else if (s.hop) want = 'hop';
  else if (s.carryBox) {
    want = 'carryBox';
    mode = 'phase';
  } else if (s.speed > WALK_SPEED && !s.seated) {
    want = s.speed > RUN_SPEED ? 'run' : 'walk';
    mode = 'phase';
  } else if (s.seated && !SEATED.has(s.base)) want = 'seated';
  else want = s.base;
  const r = resolveAnim(sheet, want, facing);
  if (!r) return { want, name: want, index: 0, facing, flip, art: null };
  // 手势回退到了别的帧（例如没画这个手势）时照样按时间循环
  const index =
    mode === 'phase'
      ? want === 'carryBox' && s.speed <= WALK_SPEED
        ? 0
        : phaseIndex(r.anim, s.phase)
      : loopIndex(r.anim, t);
  return { want, name: r.name, index, facing, flip, art: r.anim.frames[index] ?? null };
}

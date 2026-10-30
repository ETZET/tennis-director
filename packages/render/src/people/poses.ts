import { lerp } from '@td/shared';

/**
 * 姿势：上身转体(uy)、前倾(ux)、低头(hx)、右臂(rz 外展, rx 前举)、左臂(lz, lx)、下蹲(crouch)。
 * 单位是弧度；crouch 是身体下沉比例。
 */
export interface Pose {
  uy: number;
  ux: number;
  hx: number;
  rz: number;
  rx: number;
  lz: number;
  lx: number;
  crouch: number;
}

export const POSE_KEYS = ['uy', 'ux', 'hx', 'rz', 'rx', 'lz', 'lx', 'crouch'] as const;

export const POSES = {
  relaxed: { uy: 0, ux: 0, hx: 0, rz: -0.12, rx: -0.15, lz: 0.12, lx: -0.05, crouch: 0 },
  slump: { uy: 0, ux: 0.18, hx: 0.35, rz: -0.08, rx: -0.05, lz: 0.08, lx: -0.05, crouch: 0 },
  ready: { uy: 0, ux: 0.12, hx: 0, rz: -0.22, rx: -0.5, lz: 0.2, lx: -0.4, crouch: 0.04 },
  pbReady: { uy: 0, ux: 0.28, hx: -0.1, rz: -0.3, rx: -0.95, lz: 0.25, lx: -0.6, crouch: 0.12 },
  seated: { uy: 0, ux: 0.06, hx: 0.1, rz: -0.12, rx: -0.55, lz: 0.12, lx: -0.55, crouch: 0 },
  seatPhone: { uy: 0, ux: 0.14, hx: 0.5, rz: -0.12, rx: -0.45, lz: 0.18, lx: -1.5, crouch: 0 },
  sitGround: { uy: 0, ux: 0.3, hx: 0.4, rz: -0.15, rx: -0.75, lz: 0.15, lx: -0.75, crouch: 0 },
  phoneStand: { uy: 0, ux: 0.06, hx: 0.42, rz: -0.12, rx: -0.15, lz: 0.15, lx: -1.45, crouch: 0 },
  director: { uy: 0, ux: 0.08, hx: 0, rz: -0.15, rx: -0.75, lz: 0.22, lx: -1.15, crouch: 0 },
  carry: { uy: 0, ux: 0.05, hx: 0.15, rz: 0.2, rx: -1.25, lz: -0.2, lx: -1.25, crouch: 0 },
  fhB: { uy: -1.2, ux: 0.1, hx: 0, rz: -1.1, rx: -0.1, lz: 0.4, lx: -1.1, crouch: 0.08 },
  fhC: { uy: 0.15, ux: 0.1, hx: 0, rz: -1.25, rx: -0.3, lz: 0.3, lx: -0.5, crouch: 0.06 },
  fhF: { uy: 1.3, ux: 0.05, hx: 0, rz: -2.2, rx: -0.45, lz: 0.2, lx: 0.1, crouch: 0.03 },
  bhB: { uy: 1.2, ux: 0.1, hx: 0, rz: 1.0, rx: -0.2, lz: 0.7, lx: -0.7, crouch: 0.08 },
  bhC: { uy: -0.1, ux: 0.1, hx: 0, rz: 1.25, rx: -0.3, lz: 0.9, lx: -0.6, crouch: 0.06 },
  bhF: { uy: -1.3, ux: 0.05, hx: 0, rz: 2.2, rx: -0.45, lz: 1.6, lx: -0.4, crouch: 0.03 },
  dkB: { uy: -0.45, ux: 0.32, hx: 0, rz: -0.6, rx: 0.15, lz: 0.3, lx: -0.6, crouch: 0.15 },
  dkC: { uy: 0.05, ux: 0.3, hx: 0, rz: -0.55, rx: -0.75, lz: 0.3, lx: -0.6, crouch: 0.14 },
  dkF: { uy: 0.3, ux: 0.25, hx: 0, rz: -0.55, rx: -1.35, lz: 0.3, lx: -0.6, crouch: 0.12 },
  fdB: { uy: -0.4, ux: 0.2, hx: 0.2, rz: -0.5, rx: 0.6, lz: 0.2, lx: -1.2, crouch: 0.05 },
  fdC: { uy: 0.1, ux: 0.18, hx: 0.3, rz: -0.4, rx: -0.6, lz: 0.2, lx: -1.2, crouch: 0.04 },
  fdF: { uy: 0.35, ux: 0.15, hx: 0.4, rz: -0.45, rx: -1.2, lz: 0.2, lx: -1.3, crouch: 0.02 },
} satisfies Record<string, Pose>;

export type PoseName = keyof typeof POSES;
/** 姿势名，或 BASE 表示角色当前的基础姿势。 */
export type KeyPose = PoseName | 'BASE';

/** 击球关键帧：[相对击球时刻的秒数, 姿势]。 */
export const STROKES = {
  fh: [
    [-0.85, 'BASE'],
    [-0.28, 'fhB'],
    [0, 'fhC'],
    [0.22, 'fhF'],
    [0.65, 'BASE'],
  ],
  bh: [
    [-0.85, 'BASE'],
    [-0.28, 'bhB'],
    [0, 'bhC'],
    [0.22, 'bhF'],
    [0.65, 'BASE'],
  ],
  dk: [
    [-0.55, 'BASE'],
    [-0.2, 'dkB'],
    [0, 'dkC'],
    [0.2, 'dkF'],
    [0.5, 'BASE'],
  ],
  feed: [
    [-0.6, 'BASE'],
    [-0.2, 'fdB'],
    [0, 'fdC'],
    [0.25, 'fdF'],
    [0.8, 'BASE'],
  ],
} satisfies Record<string, readonly (readonly [number, KeyPose])[]>;

export type StrokeName = keyof typeof STROKES;

/** 叠加在姿势上的手势。w 是 0..1 的淡入淡出权重。 */
export type Gesture = (P: Pose, now: number, w: number) => void;

export const GESTURES = {
  argue: (P, now, w) => {
    P.rx = lerp(P.rx, -2.5 + Math.sin(now * 11) * 0.3, w);
    P.lx = lerp(P.lx, -2.5 - Math.sin(now * 11) * 0.3, w);
    P.rz = lerp(P.rz, -0.5, w);
    P.lz = lerp(P.lz, 0.5, w);
    P.hx = lerp(P.hx, -0.1, w);
  },
  talk: (P, now, w) => {
    P.rx = lerp(P.rx, -0.95 + Math.sin(now * 6.5) * 0.25, w);
    P.rz = lerp(P.rz, -0.35, w);
  },
  shrug: (P, _now, w) => {
    P.rz = lerp(P.rz, -0.7, w);
    P.lz = lerp(P.lz, 0.7, w);
    P.rx = lerp(P.rx, -0.35, w);
    P.lx = lerp(P.lx, -0.35, w);
    P.hx = lerp(P.hx, -0.15, w);
  },
  hand: (P, _now, w) => {
    P.rx = lerp(P.rx, -1.35, w);
    P.rz = lerp(P.rz, -0.1, w);
  },
  point: (P, _now, w) => {
    P.rx = lerp(P.rx, -1.6, w);
    P.rz = lerp(P.rz, -0.5, w);
  },
  wave: (P, now, w) => {
    P.rx = lerp(P.rx, -2.9, w);
    P.rz = lerp(P.rz, -0.4 + Math.sin(now * 9) * 0.35, w);
  },
  cheer: (P, _now, w) => {
    P.rx = lerp(P.rx, -2.8, w);
    P.lx = lerp(P.lx, -2.8, w);
    P.rz = lerp(P.rz, -0.3, w);
    P.lz = lerp(P.lz, 0.3, w);
  },
} satisfies Record<string, Gesture>;

export type GestureName = keyof typeof GESTURES;

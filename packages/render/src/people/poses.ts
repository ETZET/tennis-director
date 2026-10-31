import { clamp, lerp } from '@td/shared';

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
  // ---- 活动动画库（ADR 0010）用到的姿势 ----
  /** 起跑预备 */
  set: { uy: 0, ux: 0.6, hx: -0.35, rz: -0.1, rx: 0.5, lz: 0.1, lx: -0.7, crouch: 0.2 },
  /** 双手扶膝喘气 */
  handsKnees: { uy: 0, ux: 0.8, hx: -0.55, rz: -0.05, rx: -0.55, lz: 0.05, lx: -0.55, crouch: 0.14 },
  /** 拔河 */
  pull: { uy: 0, ux: -0.5, hx: 0.25, rz: -0.08, rx: -1.25, lz: 0.08, lx: -1.25, crouch: 0.26 },
  /** 举着伞 */
  umbrella: { uy: 0, ux: 0, hx: 0, rz: -0.06, rx: -3.0, lz: 0.12, lx: -0.05, crouch: 0 },
  /** 单膝跪地（摄影记者） */
  kneel: { uy: 0, ux: 0.25, hx: 0, rz: 0.2, rx: -1.6, lz: -0.2, lx: -1.6, crouch: 0.42 },
  /** 用拍子颠球 */
  juggle: { uy: 0, ux: 0.05, hx: 0.35, rz: -0.08, rx: -1.45, lz: 0.15, lx: -0.2, crouch: 0 },
  /** 指尖转篮球 */
  spinball: { uy: 0, ux: 0, hx: -0.25, rz: -0.05, rx: -3.0, lz: 0.12, lx: -0.05, crouch: 0 },
  /** 瑜伽：双手举过头 */
  yoga: { uy: 0, ux: 0, hx: -0.1, rz: 0.18, rx: -2.95, lz: -0.18, lx: -2.95, crouch: 0 },
  /** 烤架前翻肉饼 */
  grill: { uy: 0, ux: 0.15, hx: 0.35, rz: -0.12, rx: -0.95, lz: 0.2, lx: -0.55, crouch: 0 },
  /** 球童蹲在网边 */
  crouchBK: { uy: 0, ux: 0.45, hx: -0.2, rz: -0.12, rx: -0.6, lz: 0.12, lx: -0.6, crouch: 0.3 },
  /** 弯腰捡东西、拔草 */
  stoop: { uy: 0, ux: 1.0, hx: -0.3, rz: -0.1, rx: -1.0, lz: 0.1, lx: -0.9, crouch: 0.2 },
  // 发球
  sR: { uy: -0.9, ux: 0, hx: 0, rz: -0.2, rx: -0.4, lz: 0.15, lx: -0.6, crouch: 0.02 },
  sT: { uy: -0.95, ux: -0.15, hx: 0, rz: -0.3, rx: 2.3, lz: 0.15, lx: 3.05, crouch: 0.06 },
  sT2: { uy: -0.9, ux: -0.32, hx: 0, rz: -0.3, rx: 2.2, lz: 0.2, lx: 2.9, crouch: 0.17 },
  sC: { uy: -0.1, ux: 0.2, hx: 0, rz: -0.15, rx: 3.5, lz: 0.2, lx: 1.2, crouch: -0.04 },
  sF: { uy: 0.75, ux: 0.45, hx: 0, rz: 0.35, rx: 5.4, lz: 0.3, lx: -0.5, crouch: 0.1 },
  // 下手抛球
  tsB: { uy: 0, ux: 0.15, hx: 0, rz: -0.15, rx: 0.8, lz: 0.12, lx: -0.6, crouch: 0 },
  tsF: { uy: 0, ux: 0.05, hx: 0, rz: -0.15, rx: -1.4, lz: 0.12, lx: -0.3, crouch: 0 },
  // 截击
  vB: { uy: 0, ux: 0.15, hx: 0, rz: -0.6, rx: -0.7, lz: 0.12, lx: -0.6, crouch: 0.1 },
  vC: { uy: 0, ux: 0.2, hx: 0, rz: -0.3, rx: -1.5, lz: 0.12, lx: -0.6, crouch: 0.12 },
} satisfies Record<string, Pose>;

export type PoseName = keyof typeof POSES;
/** 姿势名，或 BASE 表示角色当前的基础姿势；BASE+ 是右臂多转一整圈的基础姿势（发球收拍）。 */
export type KeyPose = PoseName | 'BASE' | 'BASE+';

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
  serve: [
    [-1.6, 'BASE'],
    [-1.25, 'sR'],
    [-0.85, 'sT'],
    [-0.2, 'sT2'],
    [0, 'sC'],
    [0.25, 'sF'],
    [0.85, 'BASE+'],
  ],
  toss: [
    [-0.5, 'BASE'],
    [-0.2, 'tsB'],
    [0, 'tsF'],
    [0.45, 'BASE'],
  ],
  volley: [
    [-0.35, 'BASE'],
    [-0.12, 'vB'],
    [0, 'vC'],
    [0.35, 'BASE'],
  ],
} satisfies Record<string, readonly (readonly [number, KeyPose])[]>;

export type StrokeName = keyof typeof STROKES;

/** 叠加在姿势上的手势。w 是 0..1 的淡入淡出权重，u 是手势进行到的比例（0..1）。 */
export type Gesture = (P: Pose, now: number, w: number, u: number) => void;

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
  // ---- 活动动画库用到的手势 ----
  clap: (P, now, w) => {
    const c = Math.abs(Math.sin(now * 14)) * 0.35;
    P.rx = lerp(P.rx, -1.35, w);
    P.lx = lerp(P.lx, -1.35, w);
    P.rz = lerp(P.rz, 0.25 + c, w);
    P.lz = lerp(P.lz, -0.25 - c, w);
  },
  /** 左手拿水瓶喝水 */
  drink: (P, _now, w) => {
    P.lx = lerp(P.lx, -2.55, w);
    P.lz = lerp(P.lz, -0.6, w);
    P.hx = lerp(P.hx, -0.5, w);
  },
  /** 往头上浇水 */
  pour: (P, _now, w) => {
    P.lx = lerp(P.lx, -3.1, w);
    P.lz = lerp(P.lz, -0.25, w);
    P.hx = lerp(P.hx, 0.25, w);
  },
  whistle: (P, _now, w) => {
    P.lx = lerp(P.lx, -2.35, w);
    P.lz = lerp(P.lz, -0.62, w);
  },
  throw: (P, _now, _w, u) => {
    P.rx = u < 0.45 ? lerp(-0.2, 0.9, u / 0.45) : lerp(0.9, -2.2, clamp((u - 0.45) / 0.25, 0, 1));
    P.uy = u < 0.45 ? -0.5 * (u / 0.45) : lerp(-0.5, 0.5, clamp((u - 0.45) / 0.3, 0, 1));
  },
  /** 摔拍 */
  smash: (P, _now, _w, u) => {
    P.rx = u < 0.35 ? lerp(-0.6, -3.0, u / 0.35) : lerp(-3.0, 0.5, clamp((u - 0.35) / 0.15, 0, 1));
    P.ux = u > 0.4 ? 0.5 : 0.1;
  },
  /** 用铲子翻肉饼 */
  flip: (P, _now, w, u) => {
    P.rx = lerp(P.rx, -1.0 - Math.sin(u * Math.PI) * 0.9, w);
  },
  /** 弯腰签字 */
  sign: (P, now, w) => {
    P.ux = lerp(P.ux, 0.4, w);
    P.rx = lerp(P.rx, -0.8 + Math.sin(now * 16) * 0.08, w);
    P.rz = lerp(P.rz, 0.15, w);
    P.hx = lerp(P.hx, 0.4, w);
  },
  /** 握手 */
  shake: (P, now, w) => {
    P.rx = lerp(P.rx, -1.05 + Math.sin(now * 18) * 0.12, w);
    P.rz = lerp(P.rz, 0.05, w);
  },
  facepalm: (P, _now, w) => {
    P.rx = lerp(P.rx, -2.5, w);
    P.rz = lerp(P.rz, 0.55, w);
    P.hx = lerp(P.hx, 0.35, w);
    P.ux = lerp(P.ux, 0.15, w);
  },
  /** 双手举手机拍照 */
  photo: (P, _now, w) => {
    P.rx = lerp(P.rx, -1.7, w);
    P.lx = lerp(P.lx, -1.7, w);
    P.rz = lerp(P.rz, 0.22, w);
    P.lz = lerp(P.lz, -0.22, w);
  },
  /** 用手扇风 */
  fan: (P, now, w) => {
    P.lx = lerp(P.lx, -2.2, w);
    P.lz = lerp(P.lz, -0.4 + Math.sin(now * 12) * 0.3, w);
  },
  dance: (P, now, w) => {
    P.rx = lerp(P.rx, -2.6 + Math.sin(now * 8) * 0.6, w);
    P.lx = lerp(P.lx, -2.6 - Math.sin(now * 8) * 0.6, w);
    P.uy = lerp(P.uy, Math.sin(now * 4) * 0.4, w);
  },
  /** 被砸到头，双手捂头 */
  bonk: (P, _now, w) => {
    P.rx = lerp(P.rx, -2.7, w);
    P.lx = lerp(P.lx, -2.7, w);
    P.rz = lerp(P.rz, 0.55, w);
    P.lz = lerp(P.lz, -0.55, w);
    P.hx = lerp(P.hx, 0.3, w);
  },
  /** 花式击球：转身 + 挥拍 */
  trick: (P, _now, w, u) => {
    P.uy = lerp(P.uy, Math.sin(u * Math.PI * 2) * 1.3, w);
    P.rx = lerp(P.rx, -1.4 - Math.sin(u * Math.PI) * 1.3, w);
  },
  /** 举分数牌 */
  cardUp: (P, _now, w) => {
    P.rx = lerp(P.rx, -2.95, w);
    P.rz = lerp(P.rz, -0.1, w);
  },
  hug: (P, _now, w) => {
    P.rx = lerp(P.rx, -1.5, w);
    P.lx = lerp(P.lx, -1.5, w);
    P.rz = lerp(P.rz, 0.7, w);
    P.lz = lerp(P.lz, -0.7, w);
  },
  cry: (P, now, w) => {
    P.rx = lerp(P.rx, -2.3, w);
    P.lx = lerp(P.lx, -2.3, w);
    P.rz = lerp(P.rz, 0.7, w);
    P.lz = lerp(P.lz, -0.7, w);
    P.hx = lerp(P.hx, -0.2 + Math.sin(now * 20) * 0.08, w);
  },
  /** 耙地 / 扫地：双手前后拉 */
  rake: (P, now, w) => {
    const k = Math.sin(now * 5) * 0.35;
    P.ux = lerp(P.ux, 0.35, w);
    P.rx = lerp(P.rx, -1.1 + k, w);
    P.lx = lerp(P.lx, -0.9 + k, w);
    P.rz = lerp(P.rz, 0.2, w);
    P.lz = lerp(P.lz, -0.2, w);
  },
} satisfies Record<string, Gesture>;

export type GestureName = keyof typeof GESTURES;

// 场景尺寸（米）。球场中心在原点，长轴沿 z。
export const COURT = {
  /** 双打场地半宽、半长 */
  hw: 10.97 / 2,
  hl: 23.77 / 2,
  /** 单打边线半宽 */
  shw: 8.23 / 2,
  /** 发球线到网的距离 */
  service: 6.4,
  /** 硬地铺面（含缓冲区）半宽、半长 */
  padHw: 9,
  padHl: 18,
  netH: 0.914,
  postH: 1.07,
};

/** 浮空岛（地台）范围：地台外不放任何东西（ADR 0005） */
export const ISLAND = { x0: -17, x1: 17, z0: -27, z1: 27, top: 0, depth: 6 };

/** 围栏（铁丝网 + 挡风布）沿硬地铺面外沿；入口在东侧长边中间 */
export const FENCE = { hw: COURT.padHw, hl: COURT.padHl, h: 3.2, gateZ: 0, gateW: 2.4 };

/** 人从哪来、到哪去（步道终点在岛东南角） */
export const PATH = {
  arrive: { x: 15, z: 22 },
  gate: { x: FENCE.hw + 0.8, z: FENCE.gateZ },
  bench: { x: FENCE.hw - 1.2, z: 3.5 },
};

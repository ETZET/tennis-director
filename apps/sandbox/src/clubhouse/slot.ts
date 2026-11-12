// 摆件（占位、资产、人）的位置类型 + 小工具。只依赖 view.ts 的类型（slots-*.ts 从这里拿，避免和 layout.ts 循环 import）。
import type { Floor, HouseView } from './view';

/**
 * 资产位置。level = 在哪一层（不给 = 1；y 不给时放在那一层的地面 FLOOR_Y[level]）；
 * mode：'in' = 只在剖面（家具、里面的人），'out' = 只在外观（钟楼、屋顶上的东西），不给 = 都在（外观看得到的露台家具、四周的植物）。
 * views 直接指定在哪几种看法里显示（覆盖 level / mode 的规则，view.ts 的 viewsFor）。
 */
export interface Slot {
  id: string;
  asset: string;
  x: number;
  z: number;
  y?: number;
  rotY?: number;
  s?: number;
  variant?: number;
  level?: Floor;
  mode?: 'in' | 'out';
  views?: HouseView[];
  /** 人物：固定姿势 [名字, phase] */
  pose?: [string, number];
  /** 人物：手里拿什么（null = 空手） */
  prop?: string | null;
  /** 标签文字（不给 = id） */
  label?: string;
  labelBelow?: boolean;
  noLabel?: boolean;
  labelAt?: [number, number, number];
  /** 人物：坐着（clubsite/people 的 setSeat(座高, 脚踩的高度)） */
  seat?: [number, number?];
  /** 人物：头转向这个世界坐标点 */
  look?: [number, number, number];
  /** 不挡路（导航不算它的脚印；挂墙的板、地毯这类） */
  noBlock?: boolean;
}

const P = Math.PI;
/** 朝向（rotY）：资产本地 +z 是正面。0 = 面朝镜头（南）、W = 面朝西、EA = 面朝东、N = 面朝北（背对镜头） */
export const FACE = { S: 0, W: -P / 2, E: P / 2, N: P } as const;

/** 一个人（clubsite/people 的 player；asset 可以在 extra 里换成 coach / director） */
export const person = (
  id: string,
  x: number,
  z: number,
  rotY: number,
  v: number,
  pose: string,
  phase: number,
  extra: Partial<Slot> = {},
): Slot => ({ id, asset: 'player', x, z, rotY, variant: v, pose: [pose, phase], prop: null, noLabel: true, ...extra });

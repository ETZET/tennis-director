// 占位规格的类型（placeholders.ts 按它画灰盒；specs-*.ts 是各组的清单）。只放类型，不 import 场景的东西（避免循环 import）。
import type { Spec as PlazaSpec } from '../clubplaza/placeholders';
import type { Pal } from './palette';

/** 每个资产的大致外形（米）：w 宽（本地 x）、d 深（本地 z）、h 高；shape 决定占位的样子；n = 清单编号（标签里显示） */
export interface Spec {
  w: number;
  d: number;
  h: number;
  shape:
    | PlazaSpec['shape']
    | 'tower'
    | 'doorway'
    | 'archwin'
    | 'balcony'
    | 'vine'
    | 'wallfountain'
    | 'fireplace'
    | 'flat'
    | 'sofa'
    | 'table'
    | 'counter'
    | 'shelves'
    | 'stool'
    | 'cafetable'
    | 'desk'
    | 'board'
    | 'machine'
    | 'rail'
    | 'lockers'
    | 'showers'
    | 'tub'
    | 'stairs';
  crown?: number;
  n?: number;
  /** 中文短名（标签） */
  name?: string;
  /** 在哪（清单分组） */
  where?: string;
  /** 计划的主体材质（?accent=2 的"颜色白模"里占位的灰换成它，量画完以后的饱和度用；资产阶段的大面积底色） */
  base?: keyof Pal;
}

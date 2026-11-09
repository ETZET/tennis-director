// clubmap2 微缩地图自己的东西：地图上的中文标签。整座俱乐部的坐标（SITE、COURTS、DESK……）在 clubsite/world.ts，各场景共用。
import { DESK } from '../clubsite/world';

/** 中文标签：文字、位置（x, y, z） */
export const LABELS: { text: string; x: number; y: number; z: number; big?: boolean }[] = [
  { text: '露天前台（新）', x: DESK.x, y: 7, z: DESK.z, big: true },
  { text: '大门', x: 61, y: 6, z: 0 },
  { text: '停车场', x: 76, y: 2, z: -16 },
  { text: '停车场', x: 76, y: 2, z: 16 },
  { text: '会所', x: -51, y: 14, z: -25, big: true },
  { text: '露台餐厅', x: -31.5, y: 4, z: -23 },
  { text: '泳池', x: -50, y: 2, z: 8 },
  { text: '中心球场', x: 0, y: 9, z: -21, big: true },
  { text: '青训', x: 0, y: 3, z: 6 },
  { text: '会员场', x: -17, y: 3, z: 25 },
  { text: '红土场', x: 17, y: 3, z: 34, big: true },
  { text: '匹克球', x: 44, y: 3, z: 6 },
  { text: '棕榈喷泉', x: 44, y: 8, z: -24 },
  { text: '球员草坪', x: 46.5, y: 3, z: 25.5 },
  { text: '高尔夫球场', x: 20, y: 2, z: 64 },
];

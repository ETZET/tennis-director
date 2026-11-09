// 共用资产的大致外形（米）：占位体块、画廊取景、自动缩放用。原来在 desert3d-v2/placeholders.ts（这些资产大多从那边搬到了
// clubsite/nature、clubsite/assets、clubsite/people/rig）；desert3d-v2 和各 club* 场景的 placeholders.ts 都从这里展开再加自己的。
/** 每个资产的大致外形（米）：w 宽（x）、d 深（z）、h 高；shape 决定占位的样子 */
export interface Spec {
  w: number;
  d: number;
  h: number;
  shape: 'tree' | 'palm' | 'blob' | 'column' | 'box' | 'person' | 'flat' | 'sail';
  /** 树、蒲葵：树冠的半径（米） */
  crown?: number;
}

export const SPECS: Record<string, Spec> = {
  // 球场 = desert3d-v2 的铺面（layout.ts COURT.padHw / padHl = 7.0 / 14.2）
  court: { w: 7.0 * 2, d: 14.2 * 2, h: 0.05, shape: 'flat' },
  net: { w: 12.8, d: 0.15, h: 1.07, shape: 'box' },
  'umpire-chair': { w: 1.0, d: 1.0, h: 2.3, shape: 'box' },
  bench: { w: 1.9, d: 0.55, h: 0.85, shape: 'box' },
  'ball-hopper': { w: 0.55, d: 0.55, h: 0.95, shape: 'box' },
  'shade-sail': { w: 4.6, d: 3.4, h: 3.0, shape: 'sail' },
  player: { w: 0.7, d: 0.5, h: 1.8, shape: 'person' },
  director: { w: 0.8, d: 0.6, h: 1.85, shape: 'person' },
  'fan-palm': { w: 5, d: 5, h: 8.5, shape: 'palm', crown: 2.4 },
  'palo-verde': { w: 5.5, d: 5, h: 5.0, shape: 'tree', crown: 2.7 },
  'smoke-tree': { w: 3.6, d: 3.4, h: 3.6, shape: 'tree', crown: 1.8 },
  creosote: { w: 2.0, d: 1.8, h: 1.5, shape: 'blob' },
  brittlebush: { w: 1.4, d: 1.3, h: 0.9, shape: 'blob' },
  ocotillo: { w: 2.4, d: 2.2, h: 3.6, shape: 'column' },
  'barrel-cactus': { w: 0.8, d: 0.8, h: 1.0, shape: 'column' },
  cholla: { w: 1.2, d: 1.1, h: 1.5, shape: 'column' },
  agave: { w: 1.8, d: 1.8, h: 0.9, shape: 'blob' },
  rocks: { w: 2.6, d: 2.0, h: 1.2, shape: 'blob' },
  tumbleweed: { w: 0.9, d: 0.9, h: 0.8, shape: 'blob' },
};

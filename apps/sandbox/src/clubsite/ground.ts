// 地图的地面（不是浮空岛了）：一整块平的沙地，从地图中间一直铺到很远（画外）。
// 正交俯视里地面没有地平线：远边的沙地只要露出来就会一直往屏幕上走 —— 远边山脊后面的那部分由 mountains.ts 的天幕挡掉
// （只写深度，露出背景的天）；近边（镜头这边）的沙地一直铺到画面下沿外面，竖屏下面、转过来以后都不会露出底。
// 场景自己的高差（台地、下沉草坪……）在场景的 terrain.ts 里挖洞、加墙。
import type * as THREE from 'three';
import { CURTAIN_TOP, edgeLoop, type V2 } from './mountains';
import { topGeo } from './render/geo';

/**
 * 地面铺到离 DESERT 多远（米）：竖屏（clubmap2 默认取景竖向有大量富余）画面下沿要用到地图边外 ~200 米的近处沙地。
 * 天幕要比它（圆角对角线上 √2 倍）高（CURTAIN_TOP），远边山脊后面一直到这里的沙地才都被挡住。
 * 缩到最远（clubmap2 双指缩小到底）能看到地面的圆角边 —— 那时整个地图只有巴掌大，不管。
 */
export const GROUND_REACH = Math.min(300, (CURTAIN_TOP - 20) / Math.SQRT2);

/** 地面的外轮廓（圆角矩形，每 30 米一个点） */
export function groundLoop(): V2[] {
  return edgeLoop(GROUND_REACH, 30, 30).pts.map((q) => q.p);
}

/** 地面（y 高，默认 0）：holes = 场景里挖掉的地方（低一级的沙漠、下沉草坪、另铺的区域……），每个是闭合轮廓 */
export function groundGeo(holes: V2[][] = [], y = 0): THREE.BufferGeometry {
  return topGeo(groundLoop(), y, holes);
}

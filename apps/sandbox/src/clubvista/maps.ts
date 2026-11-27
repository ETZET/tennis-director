// clubvista 的分图（设计图、连接图、原则自评见 docs/lab/2026-11-07-3d-pixel/clubvista.md）。一张图一个文件 map-<id>.ts。
// 第 2 轮起：竖屏优先的竖条图。能走的核心 ~28 米宽（x 0…28）、48～60 米深（z 0…D）：竖屏一屏 ≈ 18 × 54 米，
// 从下到上一条"入口 → 目的地 → 歇脚"，镜头跟着人往上滚；核心两侧各 ~15 米是密的自然边（棕榈台地、仙人掌丛、干河床），
// 横屏（≈ 58 × 46 米）一屏正好看到核心 + 两边的框。球场按真尺寸（连外圈 18.3 × 36.6 米），长边南北向。
// 共同的骨架（照《垂钓手记》的溪流图）：
//   北边（画面上方）最高：一道崖（L2）顶上一排树，朝镜头的崖壁是一条暗带；
//   中间最低、最空：每张图最大的一块安静的冷色面（干河床 / 球场 / 池水 / 练习场）；
//   左右两边是密的自然边，南边（近处）是马路或矮灌木丛；主路（深一档的土路）从下面斜着弯上去，支路是踏脚石。
// 第三轮（2026-11-26）：内场（clubwalk）剩下的地方也改成分图 —— 九张图，连接图在 clubgame/worldmap.ts 和 clubvista.md「第三轮」。
import { academy } from './map-academy';
import { arrive } from './map-arrive';
import { court } from './map-court';
import { golf } from './map-golf';
import { lobby } from './map-lobby';
import { plaza } from './map-plaza';
import { practice } from './map-practice';
import { rest } from './map-rest';
import { street } from './map-street';
import type { MapDef, Prop } from './mapdef';

export const MAPS: MapDef[] = [arrive, court, rest, practice, plaza, lobby, street, academy, golf];
/**
 * 图和图在世界里的间距（米）。0 = 所有图叠在同一块地方，只显示当前那张（藏起来的不画、不投影）：
 * 寻路网格只要铺一张图那么大（< 15 万格，整图 A* 不走粗网格那条近路，长路线也找得到），换图时换导航的高度和挡路的形状。
 */
export const MAP_GAP = 0;
export const mapIndex = (id: string) => MAPS.findIndex((m) => m.id === id);
export const ox = (id: string) => mapIndex(id) * MAP_GAP;
export type { Prop };

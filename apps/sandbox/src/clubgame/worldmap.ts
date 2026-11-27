// 合并 ui 和 world 两个分支时 apps/sandbox/src/clubgame/worldmap.ts 用这一份（两边都改了这个文件）：
// 内容读 world 的 clubgame/mapgraph.ts（九张图 + ?inner=1 的旧内场），画法是 ui 的 clubsite/hud/minimap.ts。
// 整个游戏的像素小地图（右下地图键点开）：每张图一块剪影小牌、点点的小路、你在哪、出口、有人在找你的图。只看信息，点了不去哪（玩法准则 1）。
import { createMiniMap, type MiniGraph, seekScenes } from '../clubsite/hud';
import { CAST_SCENE, mapName } from '../clubvista/text';
import { EXITS, INNER_LINKS, INNER_NODE, LINKS, NODES } from './mapgraph';

export interface WorldMap {
  open(): void;
  close(): void;
  isOpen(): boolean;
  toggle(): void;
}

/** 演员表的场景 → 图（没有专门的图 = 旧内场） */
const sceneToMap = (scene: string): string => Object.entries(CAST_SCENE).find(([, s]) => s === scene)?.[0] ?? 'club';

/** where = 现在在哪张图；detail = 这张图里更细的地名（旧内场的分区，'' = 没有）；inner = 旧内场接没接（?inner=1，多画一块牌子） */
export function createWorldMap(where: () => string, detail: () => string = () => '', inner = false): WorldMap {
  const graph: MiniGraph = {
    nodes: [...NODES, ...(inner ? [INNER_NODE] : [])],
    links: [...LINKS, ...(inner ? INNER_LINKS : [])],
    exits: EXITS,
  };
  return createMiniMap({
    graph: () => graph,
    where,
    detail,
    name: mapName,
    seeking: () => [...new Set(seekScenes().map(sceneToMap))],
  });
}

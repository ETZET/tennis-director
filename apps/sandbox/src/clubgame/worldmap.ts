// 整个游戏的像素小地图（右下地图键点开）：画法在 clubsite/hud/minimap.ts（每张图一块剪影小牌、点点的小路、你在哪、出口、
// 有人在找你的图）。这里只给内容：图、格子、连接、出口。只看信息，点了不去哪（玩法准则 1：不是菜单）。
// world 代理把内容搬到 clubgame/mapgraph.ts（九张图）以后，这里改成读它。
import { createMiniMap, type MiniGraph, seekScenes } from '../clubsite/hud';
import { KEYS } from '../clubsite/hud/colors';
import { CAST_SCENE, mapName } from '../clubvista/text';

const GRAPH: MiniGraph = {
  nodes: [
    { id: 'practice', col: 0, row: 0, fill: KEYS.p },
    { id: 'court', col: 0, row: 1, fill: KEYS.b },
    { id: 'oasis', col: 1, row: 1, fill: KEYS.A },
    { id: 'arrive', col: 0, row: 2, fill: KEYS.T },
    { id: 'club', col: 1, row: 2, fill: KEYS.R },
  ],
  links: [
    ['arrive', 'court'],
    ['court', 'practice'],
    ['court', 'oasis'],
    ['arrive', 'club'],
  ],
  exits: {
    arrive: [
      ['n', 'court'],
      ['e', 'club'],
    ],
    court: [
      ['n', 'practice'],
      ['e', 'oasis'],
      ['s', 'arrive'],
    ],
    oasis: [['w', 'court']],
    practice: [['s', 'court']],
    club: [['w', 'arrive']],
  },
};

export interface WorldMap {
  open(): void;
  close(): void;
  isOpen(): boolean;
  toggle(): void;
}

/** 演员表的场景 → 图（没有专门的图 = 内场） */
const sceneToMap = (scene: string): string => Object.entries(CAST_SCENE).find(([, s]) => s === scene)?.[0] ?? 'club';

/** where = 现在在哪张图；detail = 这张图里更细的地名（内场的分区，'' = 没有） */
export function createWorldMap(where: () => string, detail: () => string = () => ''): WorldMap {
  return createMiniMap({
    graph: () => GRAPH,
    where,
    detail,
    name: mapName,
    seeking: () => [...new Set(seekScenes().map(sceneToMap))],
  });
}

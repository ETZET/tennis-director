// 整个游戏的连接图（内容）：有哪些图、在小地图上排在哪一格、哪两张之间有路、每张图的出口朝哪通到哪。
// 画法在 worldmap.ts（像素小地图）；这里只有数据。设计见 docs/lab/2026-11-07-3d-pixel/clubvista.md「第三轮：连接图」。
//
//            练习场                                    青训场
//              │（西北石阶）                              │
//            中心球场 ── 歇脚 ──（后门）── 会所大堂        球场街
//              │                    （正门）│              │
//            到达 · 前台 ─────────────── 喷泉广场 ─────────┘
//          （公交站、停车场）                │
//                                         果岭
import { KEYS } from '../clubsite/hud/colors';

export type Dir = 'n' | 's' | 'e' | 'w';
/** 牌子上画的小记号 */
export type Mark = 'court' | 'courts' | 'pool' | 'road' | 'fountain' | 'house' | 'flag' | 'wall' | 'blocks';

export interface MapNode {
  id: string;
  /** 小地图上的格子（列 0…3 从西到东，行 0…3 从北到南） */
  col: number;
  row: number;
  /** 底色、记号的色（像素界面的色键） */
  fill: number;
  mark: number;
  kind: Mark;
}

export const NODES: MapNode[] = [
  { id: 'practice', col: 0, row: 0, fill: KEYS.p, mark: KEYS.W, kind: 'wall' },
  { id: 'academy', col: 3, row: 0, fill: KEYS.p, mark: KEYS.W, kind: 'courts' },
  { id: 'court', col: 0, row: 1, fill: KEYS.b, mark: KEYS.W, kind: 'court' },
  { id: 'oasis', col: 1, row: 1, fill: KEYS.A, mark: KEYS.P, kind: 'pool' },
  { id: 'lobby', col: 2, row: 1, fill: KEYS.S, mark: KEYS.R, kind: 'house' },
  { id: 'street', col: 3, row: 1, fill: KEYS.R, mark: KEYS.W, kind: 'courts' },
  { id: 'arrive', col: 0, row: 2, fill: KEYS.T, mark: KEYS.S, kind: 'road' },
  { id: 'plaza', col: 2, row: 2, fill: KEYS.T, mark: KEYS.A, kind: 'fountain' },
  { id: 'golf', col: 2, row: 3, fill: KEYS.p, mark: KEYS.W, kind: 'flag' },
];
/** ?inner=1 时多一块：旧内场（clubwalk 的整座俱乐部，作对照） */
export const INNER_NODE: MapNode = { id: 'club', col: 0, row: 3, fill: KEYS.R, mark: KEYS.W, kind: 'blocks' };

/** 哪两张图之间有路；第三项 'hv' = 不在同一行 / 列：先横着走到对方那一列，再竖着走 */
export const LINKS: [string, string, 'hv'?][] = [
  ['arrive', 'court'],
  ['court', 'practice'],
  ['court', 'oasis'],
  ['oasis', 'lobby'],
  ['lobby', 'plaza'],
  ['arrive', 'plaza'],
  ['plaza', 'street', 'hv'],
  ['street', 'academy'],
  ['plaza', 'golf'],
];
export const INNER_LINKS: [string, string, 'hv'?][] = [['arrive', 'club']];

/** 每张图的出口在哪个方向、通到哪（卡片底下那行：这张图往哪走能去哪） */
export const EXITS: Record<string, [Dir, string][]> = {
  arrive: [
    ['n', 'court'],
    ['e', 'plaza'],
  ],
  court: [
    ['n', 'practice'],
    ['e', 'oasis'],
    ['s', 'arrive'],
  ],
  oasis: [
    ['w', 'court'],
    ['n', 'lobby'],
  ],
  practice: [['s', 'court']],
  plaza: [
    ['w', 'arrive'],
    ['n', 'lobby'],
    ['e', 'street'],
    ['s', 'golf'],
  ],
  lobby: [
    ['s', 'plaza'],
    ['w', 'oasis'],
  ],
  street: [
    ['w', 'plaza'],
    ['n', 'academy'],
  ],
  academy: [['s', 'street']],
  golf: [['n', 'plaza']],
  club: [['e', 'arrive']],
};

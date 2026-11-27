// ════════════════════════════════════════════════════════════════════════════════════════
// F · 会所大堂（室内：黑底上浮着的单间 —— 一层大堂 + 商店 + 休息区）
//   第 2 轮：房间改成竖长（15 × 28 米，x 6.5…21.5、z 4…32），竖屏拉近（0.95）：房间宽占满屏 ~90%、高占 ~60%，人 ≥ 18 px。
//   竖屏一屏从上到下：
//   北墙（白灰泥，2.6 米高，墙顶一条深色墙厚）= 最大的立面：西头壁炉 + 奖杯柜，正中会徽招牌夹两扇拱窗，东头球拍墙；
//   北半：接待台在北墙正中（前台员工 + 台前问事的会员，两头陶罐 + 龙舌兰）；西北壁炉前一条长椅（等前台的人）；
//         东半是商店（深色木地板：球拍墙、鞋墙、两架衣服、穿线机、收银台，店员和挑东西的客人）；
//   中段：浅陶土石板的大走道（正门 → 接待台，最大的安静面），西墙侧门（→ 歇脚的露台）+ 门边公告板；
//   南半：西南休息区（橡木地板 + 红地毯 + 两张对着的沙发 + 茶几，有人坐着 —— 红地毯是这一屏唯一的暖色焦点，壁炉的火在北头呼应）；
//         东南咖啡角（吧台朝南、咖啡师在台后，吧凳、小圆桌，有人坐着）；
//   南墙只有一道矮墙脚（0.45 米，朝镜头的冷暗带），正中留门洞（→ 喷泉广场），门外一块门垫；门里两边陶罐，东边一个橱窗模特。
//   层：地板 0 / 木地板 0.01 / 地毯 · 门垫 0.02 / 南墙脚 0.45 / 北墙、东西墙 2.6。
// ════════════════════════════════════════════════════════════════════════════════════════
import { type MapDef, type Prop, rect } from './mapdef';

const PI = Math.PI;
/** 房间（墙里面）：x X0…X1、z Z0…Z1 */
const X0 = 6.5;
const X1 = 21.5;
const Z0 = 4;
const Z1 = 32;
const WALL_H = 2.6;
const T = 0.6; // 墙厚
/** 正门（南墙正中）、侧门（西墙）的洞 */
const DOOR_X = 14;
const DOOR_W = 2.8;
const SIDE_Z = 17;
const SIDE_W = 2.4;
/** 北墙里面贴墙摆的东西的 z（资产背面贴墙） */
const N = Z0;
/** 商店（东半）、休息区（西南）、咖啡角（东南）的地板范围 */
const SHOP_X = 16.6;
const SHOP_Z = 19.6;
const SOUTH_Z = 22;

const wallProps: Prop[] = [
  // 西头：奖杯柜 + 壁炉（烧着）
  { a: 'lobby:trophy-case', x: 7.8, z: N + 0.2, s: 0.65 },
  { a: 'lobby:fireplace', x: 10.1, z: N + 0.4, v: 0 },
  // 正中：接待台背后，会徽招牌 + 两扇拱窗
  { a: 'arch-window', x: 11.95, z: N + 0.16, y: 0.4, block: false },
  { a: 'lobby:club-sign', x: DOOR_X, z: N + 0.08, y: 1.5, s: 0.8, block: false },
  { a: 'arch-window', x: 16.05, z: N + 0.16, y: 0.4, block: false },
  // 东头：球拍墙（商店的主货架）
  { a: 'lobby:racket-wall', x: 19.4, z: N + 0.2, s: 0.9 },
];

const reception: Prop[] = [
  // 接待台：两张台子拼成一条，前台员工站在台后（北边），一个刚进门的会员在台前问事
  { a: 'lobby:counter', x: DOOR_X - 1, z: 7.6 },
  { a: 'lobby:counter', x: DOOR_X + 1, z: 7.6 },
  { a: 'coach', x: DOOR_X - 0.6, z: 6.7, r: 0, pose: 'idle', v: 1 },
  { a: 'player', x: DOOR_X + 0.7, z: 8.8, r: PI, pose: 'idle', v: 2, prop: 'racket' },
  // 接待台西头一组陶罐 + 龙舌兰（大小错开）
  { a: 'pot', x: 11.6, z: 7.2 },
  { a: 'agave', x: 11.6, z: 7.2, y: 0.85, s: 0.55, block: false },
  { a: 'pot', x: 11.2, z: 8.1, s: 0.7 },
  // 西北：壁炉前一条长椅（等前台叫号的人；孩子坐着晃腿，家长看手里的单子）
  { a: 'bench', x: 9.4, z: 7.4 },
  { a: 'kid', x: 8.9, z: 7.5, pose: 'sit', v: 1, block: false },
  { a: 'player', x: 9.9, z: 7.5, pose: 'sip', prop: 'cup', v: 3, block: false },
  { a: 'kit-bag', x: 7.6, z: 8.2, r: PI / 2 - 0.25, v: 0 },
  // 西墙中段：树池里一棵小棕榈（室内的"边"）+ 一张小圆桌，两个会员边喝边聊（等场地）
  { a: 'tree-planter', x: 7.9, z: 11, s: 0.75 },
  { a: 'fan-palm', x: 7.9, z: 11, y: 0.45, s: 0.55, v: 1, block: false },
  { a: 'patio-table', x: 10.6, z: 12.6 },
  { a: 'player', x: 9.9, z: 12.7, r: PI / 2, pose: 'sip', prop: 'cup', seat: [0.47, 0], v: 1, block: false },
  { a: 'coach', x: 11.3, z: 12.7, r: -PI / 2, pose: 'sit', seat: [0.47, 0], block: false },
  // 侧门两边：公告板（北边，立着）+ 陶罐（南边）
  { a: 'lobby:notice-board', x: 7.6, z: 14.8, y: 0.3, s: 0.8 },
  { a: 'pot', x: 7.2, z: 19.4 },
  { a: 'agave', x: 7.2, z: 19.4, y: 0.85, s: 0.55, v: 1, block: false },
];

const shop: Prop[] = [
  // 商店（东半，北墙球拍墙往南）：鞋墙立着、两架衣服错开、穿线机贴东墙，收银台在南边对着走道；店员、穿线师、两个挑东西的客人
  { a: 'player', x: 18.6, z: 5.9, r: PI, pose: 'idle', v: 0, prop: 'racket' },
  { a: 'lobby:shoe-wall', x: 19.6, z: 9.4 },
  { a: 'lobby:clothes-rack', x: 17.8, z: 12.2 },
  { a: 'lobby:clothes-rack', x: 20.4, z: 13.2 },
  { a: 'player', x: 20.3, z: 14.2, r: PI, pose: 'idle', v: 1 },
  { a: 'lobby:stringing-machine', x: 20.6, z: 16.2 },
  { a: 'coach', x: 20.6, z: 15.4, r: 0, pose: 'idle', v: 0 },
  { a: 'lobby:counter', x: 18.2, z: 18.6 },
  { a: 'player', x: 18.2, z: 17.8, r: 0, pose: 'idle', v: 2 },
  { a: 'kid', x: 17.6, z: 19.6, r: PI, pose: 'idle', v: 2 },
];

const lounge: Prop[] = [
  // 西南休息区：红地毯 + 茶几 + 两张对着的沙发（侧对镜头）；一个人捧着咖啡，对面一个人坐着
  { a: 'lobby:rug', x: 9.6, z: 26, y: 0.02, block: false },
  { a: 'lobby:coffee-table', x: 9.6, z: 26 },
  { a: 'lobby:sofa', x: 7.5, z: 26, r: PI / 2 },
  { a: 'lobby:sofa', x: 11.7, z: 26, r: -PI / 2 },
  { a: 'player', x: 7.65, z: 25.5, r: PI / 2, pose: 'sip', prop: 'cup', seat: [0.45, 0], v: 3, block: false },
  { a: 'player', x: 11.55, z: 26.6, r: -PI / 2, pose: 'sit', seat: [0.45, 0], v: 0, block: false },
  { a: 'pot', x: 7.3, z: 30.9 },
  { a: 'pot', x: 8.1, z: 31.3, s: 0.7 },
  // 东南咖啡角：吧台朝南（咖啡师站在北边台后），台前两张吧凳一个人坐着；旁边一张小圆桌两个人
  { a: 'lobby:cafe-counter', x: 18.8, z: 24 },
  { a: 'lobby:pastry-case', x: 18.15, z: 24, y: 1.1, block: false },
  { a: 'umpire', x: 18.8, z: 22.9, r: 0, pose: 'idle', v: 0 },
  { a: 'lobby:bar-stool', x: 18, z: 25.1 },
  { a: 'lobby:bar-stool', x: 19.6, z: 25.1 },
  { a: 'player', x: 18, z: 25.1, r: PI, pose: 'sip', prop: 'cup', seat: [0.75, 0.3], v: 1, block: false },
  { a: 'patio-table', x: 19, z: 28 },
  { a: 'player', x: 18.3, z: 28.1, r: PI / 2, pose: 'sip', prop: 'cup', seat: [0.47, 0], v: 2, block: false },
  { a: 'player', x: 19.7, z: 28.1, r: -PI / 2, pose: 'sit', seat: [0.47, 0], v: 0, block: false },
  // 正门里两边：陶罐 + 龙舌兰；东边一个橱窗模特（朝门外）
  { a: 'pot', x: 11.9, z: 31.1 },
  { a: 'agave', x: 11.9, z: 31.1, y: 0.85, s: 0.55, v: 2, block: false },
  { a: 'pot', x: 16.1, z: 31.1 },
  { a: 'agave', x: 16.1, z: 31.1, y: 0.85, s: 0.55, block: false },
  { a: 'lobby:window-display', x: 19.6, z: 31.2 },
];

export const lobby: MapDef = {
  id: 'lobby',
  name: '会所大堂',
  W: 28,
  D: 34,
  view: { x0: 2, x1: 26, z0: 1, z1: 35 },
  portraitZoom: 0.95,
  interior: true,
  plates: [
    // 地板：整间浅陶土石板（安静的大面），门洞外伸出一块门垫，侧门外伸出一小块
    {
      id: 'floor',
      pts: [
        [X0 - T, Z0 - T],
        [X1 + T, Z0 - T],
        [X1 + T, Z1 + T],
        [DOOR_X + DOOR_W / 2, Z1 + T],
        [DOOR_X + DOOR_W / 2, Z1 + 2.4],
        [DOOR_X - DOOR_W / 2, Z1 + 2.4],
        [DOOR_X - DOOR_W / 2, Z1 + T],
        [X0 - T, Z1 + T],
        [X0 - T, SIDE_Z + SIDE_W / 2],
        [X0 - 2.4, SIDE_Z + SIDE_W / 2],
        [X0 - 2.4, SIDE_Z - SIDE_W / 2],
        [X0 - T, SIDE_Z - SIDE_W / 2],
      ],
      h: 0,
      top: 'paving',
      el: 'flag',
      wall: 'none',
      smooth: 0,
    },
    // 商店（东半北段）、休息区（西南）、咖啡角（东南）：深色木地板 —— 走道是浅石板，两边的区一眼分开
    { id: 'shop', pts: rect(SHOP_X, Z0, X1, SHOP_Z), h: 0.01, top: 'floorWood', el: 'none', wall: 'none', smooth: 0 },
    { id: 'lounge', pts: rect(X0, SOUTH_Z, 12.6, Z1), h: 0.01, top: 'floorWood', el: 'none', wall: 'none', smooth: 0 },
    { id: 'cafe', pts: rect(16.4, 21.6, X1, 30), h: 0.01, top: 'floorWood', el: 'none', wall: 'none', smooth: 0 },
    // 门垫（正门外）
    {
      id: 'mat',
      pts: rect(DOOR_X - 1, Z1 + 0.2, DOOR_X + 1, Z1 + 1.6),
      h: 0.02,
      top: 'rubber',
      el: 'none',
      wall: 'none',
      smooth: 0,
    },
    // 墙：北墙（高）、东西墙（高，细）、南墙脚（矮）
    { id: 'wall-n', pts: rect(X0 - T, Z0 - T, X1 + T, Z0), h: WALL_H, top: 'wallCut', wall: 'stucco', smooth: 0 },
    {
      id: 'wall-w1',
      pts: rect(X0 - T, Z0, X0, SIDE_Z - SIDE_W / 2),
      h: WALL_H,
      top: 'wallCut',
      wall: 'stucco',
      smooth: 0,
    },
    {
      id: 'wall-w2',
      pts: rect(X0 - T, SIDE_Z + SIDE_W / 2, X0, Z1 + T),
      h: WALL_H,
      top: 'wallCut',
      wall: 'stucco',
      smooth: 0,
    },
    { id: 'wall-e', pts: rect(X1, Z0, X1 + T, Z1 + T), h: WALL_H, top: 'wallCut', wall: 'stucco', smooth: 0 },
    {
      id: 'wall-s1',
      pts: rect(X0, Z1, DOOR_X - DOOR_W / 2, Z1 + T),
      h: 0.45,
      top: 'wallCut',
      wall: 'stucco',
      smooth: 0,
    },
    {
      id: 'wall-s2',
      pts: rect(DOOR_X + DOOR_W / 2, Z1, X1, Z1 + T),
      h: 0.45,
      top: 'wallCut',
      wall: 'stucco',
      smooth: 0,
    },
  ],
  strips: [],
  stairs: [],
  courts: [],
  props: [...wallProps, ...reception, ...shop, ...lounge],
  noWalk: [],
  exits: [
    { to: 'plaza', entry: 'fromLobby', at: [DOOR_X, Z1 + 2], r: 0.9 },
    { to: 'oasis', entry: 'fromLobby', at: [X0 - 2, SIDE_Z], r: 0.9 },
  ],
  entries: {
    fromPlaza: { at: [DOOR_X, Z1 - 1.6], yaw: PI },
    fromOasis: { at: [X0 + 1.6, SIDE_Z], yaw: PI / 2 },
  },
  start: { at: [DOOR_X, Z1 - 1.6], yaw: PI },
  clouds: [],
  shot: { port: [DOOR_X, 18], land: [DOOR_X, 18] },
  spots: [
    { id: 'door-plaza', kind: 'door', at: [DOOR_X, Z1 + 1], yaw: PI, note: '正门（← 喷泉广场）' },
    { id: 'door-oasis', kind: 'door', at: [X0 - 1, SIDE_Z], yaw: PI / 2, note: '侧门（← 歇脚的露台）' },
    { id: 'reception', kind: 'work', at: [DOOR_X + 0.6, 6.7], yaw: 0, note: '接待台后面（前台员工 / 总监）' },
    { id: 'reception-q', kind: 'queue', at: [DOOR_X - 0.6, 9], yaw: PI, note: '接待台前排队，往南排' },
    { id: 'wait-bench', kind: 'rest', at: [9.4, 7.5], yaw: 0, seat: 0.45, note: '壁炉前的长椅（等前台）' },
    { id: 'racket-wall', kind: 'watch', at: [20, 6], yaw: PI, note: '站着看球拍墙' },
    { id: 'shoe-wall', kind: 'watch', at: [19.6, 10.5], yaw: PI, note: '挑鞋' },
    { id: 'stringing', kind: 'work', at: [19.6, 15.6], yaw: 0, note: '穿线机旁' },
    { id: 'till', kind: 'work', at: [18.8, 17.8], yaw: 0, note: '商店收银台后面' },
    { id: 'till-q', kind: 'queue', at: [18.6, 20.2], yaw: PI, note: '收银台前排队' },
    { id: 'chat-table', kind: 'rest', at: [9.9, 12.7], yaw: PI / 2, seat: 0.47, note: '西墙小圆桌（等场地）' },
    { id: 'notice', kind: 'watch', at: [8.6, 15.9], yaw: PI, note: '看公告板' },
    { id: 'sofa-w', kind: 'rest', at: [7.65, 26.5], yaw: PI / 2, seat: 0.45, note: '西沙发' },
    { id: 'sofa-e', kind: 'rest', at: [11.55, 25.5], yaw: -PI / 2, seat: 0.45, note: '东沙发' },
    { id: 'cafe-bar', kind: 'work', at: [19.4, 22.9], yaw: 0, note: '咖啡吧台后面' },
    { id: 'cafe-stool', kind: 'rest', at: [19.6, 25.1], yaw: PI, seat: 0.75, note: '吧凳' },
    { id: 'cafe-table', kind: 'rest', at: [19.7, 28.1], yaw: -PI / 2, seat: 0.47, note: '小圆桌' },
  ],
  walks: [
    { name: '正门 → 接待台', from: [DOOR_X, Z1 - 1.6], to: [DOOR_X - 0.6, 9.2] },
    { name: '正门 → 沙发', from: [DOOR_X, Z1 - 1.6], to: [9.6, 28.4] },
    { name: '侧门 → 商店收银台', from: [X0 + 1.6, SIDE_Z], to: [18.6, 20.2] },
    { name: '走出正门', from: [DOOR_X, 18], to: [DOOR_X, Z1 + 2], expect: 'plaza' },
    { name: '走出侧门', from: [13, SIDE_Z], to: [X0 - 2, SIDE_Z], expect: 'oasis' },
  ],
};

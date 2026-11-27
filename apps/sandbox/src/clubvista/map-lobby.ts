// ════════════════════════════════════════════════════════════════════════════════════════
// F · 会所大堂（室内：黑底上浮着的单间 —— 一层大堂 + 商店）
//   房间 20 × 18 米（x 4…24、z 4…22），房间以外是近黑的虚空（MapDef.interior），像《星露谷》的室内。
//   竖屏（拉远 1.25，≈ 22 米宽）一屏装下整间屋，上下是黑。从上到下：
//   北墙（白灰泥，2.6 米高，墙顶一条深色墙厚）= 画面里最大的一块立面，靠墙全是高东西：
//     西头奖杯柜 + 壁炉（烧着的火 = 唯一的暖色焦点，地毯的红跟它成一组）+ 球赛电视、中间接待台背后的会徽 + 两扇拱窗、东头球拍墙 + 鞋墙；
//     北墙的影子落在墙脚一条（冷灰紫的带子），接待台和沙发都在影子外面；
//   中间是浅陶土石板的大堂（最大的安静面，正门 → 接待台的走道），两边是深色木地板的两个分区：
//     西北休息区：地毯 + 茶几 + 两张对着的沙发（两个人坐着）；西南咖啡角：吧台（咖啡师在台后）+ 吧凳 + 小圆桌（三个人）；
//     大堂西边一条长椅（打完球的人等朋友，球拍包在脚边）、侧门里一块公告板；
//     东半间商店：两架衣服、穿线机（穿线师）、纪念品架、展示桌（孩子在挑）、收银台（店员 + 客人）、南墙角的橱窗模特；
//   南墙只有一道矮墙脚（0.45 米，朝镜头的冷暗带），正中留门洞（→ 喷泉广场），门外伸出一块门垫；门里两边陶罐 + 龙舌兰。
//   西墙一个侧门（→ 歇脚的露台），门外伸出一小块地板。
//   层：地板 0 / 木地板 0.01 / 地毯 · 门垫 0.02 / 南墙脚 0.45 / 北墙、东西墙 2.6。
// ════════════════════════════════════════════════════════════════════════════════════════
import { type MapDef, type Prop, rect } from './mapdef';

const PI = Math.PI;
/** 房间（墙里面）：x X0…X1、z Z0…Z1 */
const X0 = 4;
const X1 = 24;
const Z0 = 4;
const Z1 = 22;
const WALL_H = 2.6;
const T = 0.6; // 墙厚
/** 正门（南墙正中）、侧门（西墙）的洞 */
const DOOR_X = 14;
const DOOR_W = 2.8;
const SIDE_Z = 13;
const SIDE_W = 2.4;
/** 北墙里面贴墙摆的东西的 z（资产背面贴墙） */
const N = Z0;

const wallProps: Prop[] = [
  // 西头：奖杯柜 + 壁炉（烧着）+ 壁炉东边挂一台球赛电视
  { a: 'lobby:trophy-case', x: 5.5, z: N + 0.2, s: 0.8 },
  { a: 'lobby:fireplace', x: 8.2, z: N + 0.4, v: 0 },
  { a: 'lobby:match-tv', x: 10.2, z: N + 0.07, y: 1.4, block: false },
  // 中间：接待台背后，会徽招牌 + 两扇拱窗
  { a: 'arch-window', x: 11.9, z: N + 0.16, y: 0.4, block: false },
  { a: 'lobby:club-sign', x: DOOR_X, z: N + 0.08, y: 1.5, block: false },
  { a: 'arch-window', x: 16.1, z: N + 0.16, y: 0.4, block: false },
  // 东头：球拍墙 + 鞋墙（专卖店的主货架都贴北墙）
  { a: 'lobby:racket-wall', x: 19.2, z: N + 0.2, s: 0.9 },
  { a: 'lobby:shoe-wall', x: 22.5, z: N + 0.25 },
];

const reception: Prop[] = [
  // 接待台：两张台子拼成 4 米一条，前台员工站在台后（北边），一个刚进门的会员在台前问事
  { a: 'lobby:counter', x: DOOR_X - 1, z: 7.8 },
  { a: 'lobby:counter', x: DOOR_X + 1, z: 7.8 },
  { a: 'coach', x: DOOR_X - 0.6, z: 6.9, r: 0, pose: 'idle', v: 1 },
  { a: 'player', x: DOOR_X + 0.6, z: 9, r: PI, pose: 'idle', v: 2, prop: 'racket' },
  // 接待台两头各一组陶罐 + 龙舌兰（大小错开）
  { a: 'pot', x: 10.9, z: 6.4 },
  { a: 'agave', x: 10.9, z: 6.4, y: 0.85, s: 0.55, block: false },
  { a: 'pot', x: 11.5, z: 7.1, s: 0.7 },
  { a: 'pot', x: 17.1, z: 6.4 },
  { a: 'agave', x: 17.1, z: 6.4, y: 0.85, s: 0.55, v: 1, block: false },
  // 正门里两边各一组陶罐（门洞两边，"到了"）
  { a: 'pot', x: 11.6, z: 21.1 },
  { a: 'agave', x: 11.6, z: 21.1, y: 0.85, s: 0.55, v: 2, block: false },
  { a: 'pot', x: 10.9, z: 21.4, s: 0.7 },
  { a: 'pot', x: 16.4, z: 21.1 },
  { a: 'agave', x: 16.4, z: 21.1, y: 0.85, s: 0.55, block: false },
];

const lounge: Prop[] = [
  // 壁炉前：地毯 + 茶几 + 两张对着的沙发（侧对镜头）；一个人坐着烤火喝咖啡，对面一个人坐着
  { a: 'lobby:rug', x: 8.2, z: 8.8, y: 0.02, block: false },
  { a: 'lobby:coffee-table', x: 8.2, z: 8.8 },
  { a: 'lobby:sofa', x: 6.1, z: 8.8, r: PI / 2 },
  { a: 'lobby:sofa', x: 10.3, z: 8.8, r: -PI / 2 },
  { a: 'player', x: 6.25, z: 8.3, r: PI / 2, pose: 'sip', prop: 'cup', seat: [0.45, 0], v: 3, block: false },
  { a: 'player', x: 10.15, z: 9.4, r: -PI / 2, pose: 'sit', seat: [0.45, 0], v: 0, block: false },
  // 咖啡角（西南）：吧台朝南（咖啡师站在北边台后），台前两张吧凳一个人坐着；旁边一张小圆桌两个人
  { a: 'lobby:cafe-counter', x: 7.4, z: 17.6 },
  { a: 'lobby:pastry-case', x: 6.75, z: 17.6, y: 1.1, block: false },
  { a: 'umpire', x: 7.4, z: 16.5, r: 0, pose: 'idle', v: 0 },
  { a: 'lobby:bar-stool', x: 6.6, z: 18.6 },
  { a: 'lobby:bar-stool', x: 8.2, z: 18.6 },
  { a: 'player', x: 6.6, z: 18.6, r: PI, pose: 'sip', prop: 'cup', seat: [0.75, 0.3], v: 1, block: false },
  { a: 'patio-table', x: 7.6, z: 20.6 },
  { a: 'player', x: 6.9, z: 20.7, r: PI / 2, pose: 'sip', prop: 'cup', seat: [0.47, 0], v: 2, block: false },
  { a: 'player', x: 8.3, z: 20.7, r: -PI / 2, pose: 'sit', seat: [0.47, 0], v: 0, block: false },
  // 休息区南边的长椅：打完球的人等朋友（球拍包靠在脚边）—— 从正门进来往左看到的第二个歇脚处
  { a: 'bench', x: 9.4, z: 13.6 },
  { a: 'player', x: 8.9, z: 13.7, pose: 'sit', prop: 'racket', v: 2, block: false },
  { a: 'kit-bag', x: 10.5, z: 13.85, r: PI / 2 - 0.25, v: 0 },
  // 侧门里的公告板（立着，朝南）
  { a: 'lobby:notice-board', x: 5, z: 15.4, y: 0.3, s: 0.8 },
  // 西北角、侧门两边的陶罐
  { a: 'pot', x: 4.6, z: 11.4, s: 0.85 },
  { a: 'pot', x: 4.6, z: 14.7 },
  { a: 'agave', x: 4.6, z: 14.7, y: 0.85, s: 0.55, v: 1, block: false },
];

const shop: Prop[] = [
  // 商店：两架衣服错开、一张展示桌、穿线机，纪念品架立着，收银台在南边对着走道；店员、穿线师、两个挑东西的客人
  { a: 'lobby:clothes-rack', x: 18.6, z: 9.8 },
  { a: 'lobby:clothes-rack', x: 20.8, z: 10.8 },
  { a: 'player', x: 20.7, z: 11.8, r: PI, pose: 'idle', v: 0 },
  { a: 'lobby:stringing-machine', x: 22.9, z: 7.6 },
  { a: 'coach', x: 22.9, z: 6.8, r: 0, pose: 'idle', v: 0 },
  { a: 'lobby:merch-shelves', x: 22.8, z: 13.2, s: 0.85 },
  { a: 'lobby:display-table', x: 19.2, z: 15 },
  { a: 'kid', x: 19, z: 16, r: PI, pose: 'idle', v: 2 },
  { a: 'lobby:counter', x: 21.8, z: 18.6 },
  { a: 'player', x: 21.8, z: 17.8, r: 0, pose: 'idle', v: 1 },
  { a: 'lobby:window-display', x: 22.6, z: 21.3 },
];

export const lobby: MapDef = {
  id: 'lobby',
  name: '会所大堂',
  W: 28,
  D: 26,
  view: { x0: 0, x1: 28, z0: 1, z1: 26 },
  portraitZoom: 1.25,
  interior: true,
  plates: [
    // 地板：整间陶砖（安静的大面），门洞外伸出一小块门垫，侧门外伸出一小块
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
    // 西半间休息区：橡木地板
    { id: 'lounge', pts: rect(X0, Z0, 11.8, 12), h: 0.01, top: 'floorWood', el: 'none', wall: 'none', smooth: 0 },
    // 东半间商店：深色木地板
    { id: 'shop', pts: rect(17.2, Z0, X1, Z1), h: 0.01, top: 'floorWood', el: 'none', wall: 'none', smooth: 0 },
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
  props: [...wallProps, ...reception, ...lounge, ...shop],
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
  shot: { port: [DOOR_X, 13], land: [DOOR_X, 13] },
  spots: [
    { id: 'door-plaza', kind: 'door', at: [DOOR_X, Z1 + 1], yaw: PI, note: '正门（← 喷泉广场）' },
    { id: 'door-oasis', kind: 'door', at: [X0 - 1, SIDE_Z], yaw: PI / 2, note: '侧门（← 歇脚的露台）' },
    { id: 'reception', kind: 'work', at: [DOOR_X, 6.9], yaw: 0, note: '接待台后面（前台员工 / 总监）' },
    { id: 'reception-q', kind: 'queue', at: [DOOR_X - 0.6, 9.1], yaw: PI, note: '接待台前排队，往南排' },
    { id: 'till', kind: 'work', at: [21.8, 17.8], yaw: 0, note: '商店收银台后面' },
    { id: 'till-q', kind: 'queue', at: [21.8, 19.7], yaw: PI, note: '收银台前排队' },
    { id: 'stringing', kind: 'work', at: [22.9, 6.8], yaw: 0, note: '穿线机后面' },
    { id: 'racket-wall', kind: 'watch', at: [19.2, 5.8], yaw: PI, note: '站着看球拍墙' },
    { id: 'shoe-wall', kind: 'watch', at: [22.2, 9.3], yaw: PI, note: '挑鞋' },
    { id: 'cafe-bar', kind: 'work', at: [7.4, 16.5], yaw: 0, note: '咖啡吧台后面' },
    { id: 'cafe-stool', kind: 'rest', at: [8.2, 18.6], yaw: PI, seat: 0.75, note: '吧凳' },
    { id: 'bench', kind: 'rest', at: [9.9, 13.7], yaw: 0, seat: 0.45, note: '大堂长椅（等人）' },
    { id: 'cafe-table', kind: 'rest', at: [8.3, 20.7], yaw: -PI / 2, seat: 0.47, note: '小圆桌' },
    { id: 'sofa-w', kind: 'rest', at: [6.25, 9.3], yaw: PI / 2, seat: 0.45, note: '西沙发，对着东沙发' },
    { id: 'sofa-e', kind: 'rest', at: [10.15, 8.3], yaw: -PI / 2, seat: 0.45, note: '东沙发' },
    { id: 'fireplace', kind: 'work', at: [8.2, 6.6], yaw: PI, note: '壁炉前（添柴）' },
  ],
  walks: [
    { name: '正门 → 接待台', from: [DOOR_X, Z1 - 1.6], to: [DOOR_X - 0.6, 9.4] },
    { name: '正门 → 沙发', from: [DOOR_X, Z1 - 1.6], to: [8.2, 11] },
    { name: '侧门 → 商店收银台', from: [X0 + 1.6, SIDE_Z], to: [21.8, 19.7] },
    { name: '走出正门', from: [DOOR_X, 12], to: [DOOR_X, Z1 + 2], expect: 'plaza' },
    { name: '走出侧门', from: [12, 13], to: [X0 - 2, SIDE_Z], expect: 'oasis' },
  ],
};

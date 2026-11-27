// F · 会所大堂（室内：黑底上浮着的单间，一层大堂 / 商店街）
// （骨架：只有地面、一条路、出入口。这张图的代理照 clubvista.md「第三轮」的连接图和 map-rest.ts 的样板把它做出来；
//   出入口的名字（exits 的 to / entry、entries 的 key）不能改，位置可以挪。）
import { type MapDef, rect, trail } from './mapdef';

const PI = Math.PI;

export const lobby: MapDef = {
  id: 'lobby',
  name: '会所大堂',
  W: 28,
  D: 24,
  view: { x0: -6, x1: 34, z0: -4, z1: 28 },
  interior: true,
  plates: [{ id: 'floor', pts: rect(2, 4, 26, 21), h: 0, top: 'paving', el: 'none', wall: 'none', smooth: 0 }],
  strips: [],
  stairs: [],
  courts: [],
  props: [],
  noWalk: [],
  exits: [
    { to: 'plaza', entry: 'fromLobby', at: [14, 21.4], r: 1 },
    { to: 'oasis', entry: 'fromLobby', at: [1.6, 12], r: 1 },
  ],
  entries: {
    fromPlaza: { at: [14, 19], yaw: PI },
    fromOasis: { at: [4, 12], yaw: PI / 2 },
  },
  start: { at: [14, 19], yaw: PI },
  clouds: [],
  spots: [],
};
void trail;
void PI;

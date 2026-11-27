// E · 喷泉广场（棕榈喷泉 + 会所正面 + 餐车集市角）：整个俱乐部的中枢
// （骨架：只有地面、一条路、出入口。这张图的代理照 clubvista.md「第三轮」的连接图和 map-rest.ts 的样板把它做出来；
//   出入口的名字（exits 的 to / entry、entries 的 key）不能改，位置可以挪。）
import { type MapDef, rect, trail, VIEW } from './mapdef';

const PI = Math.PI;

export const plaza: MapDef = {
  id: 'plaza',
  name: '喷泉广场',
  W: 28,
  D: 48,
  view: VIEW(48),
  plates: [{ id: 'ground', pts: rect(-30, -16, 60, 68), h: 0, top: 'turf', el: 'none', wall: 'none', smooth: 0 }],
  strips: [],
  stairs: [],
  courts: [],
  props: [],
  noWalk: [],
  exits: [
    { to: 'arrive', entry: 'fromPlaza', at: [-12, 30], r: 2 },
    { to: 'lobby', entry: 'fromPlaza', at: [14, 6.2], r: 1 },
    { to: 'street', entry: 'fromPlaza', at: [40, 26], r: 2 },
    { to: 'golf', entry: 'fromPlaza', at: [14, 51], r: 2 },
  ],
  entries: {
    fromArrive: { at: [-8, 30], yaw: PI / 2 },
    fromLobby: { at: [14, 8.4], yaw: 0 },
    fromStreet: { at: [36, 26], yaw: -PI / 2 },
    fromGolf: { at: [14, 47], yaw: PI },
  },
  start: { at: [-8, 30], yaw: PI / 2 },
  clouds: [],
  spots: [],
};
void trail;
void PI;

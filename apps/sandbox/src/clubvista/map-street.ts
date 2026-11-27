// G · 球场街（红土场 + 匹克球场，一条街串起来）
// （骨架：只有地面、一条路、出入口。这张图的代理照 clubvista.md「第三轮」的连接图和 map-rest.ts 的样板把它做出来；
//   出入口的名字（exits 的 to / entry、entries 的 key）不能改，位置可以挪。）
import { type MapDef, rect, trail, VIEW } from './mapdef';

const PI = Math.PI;

export const street: MapDef = {
  id: 'street',
  name: '球场街',
  W: 28,
  D: 56,
  view: VIEW(56),
  plates: [{ id: 'ground', pts: rect(-30, -16, 60, 76), h: 0, top: 'turf', el: 'none', wall: 'none', smooth: 0 }],
  strips: [],
  stairs: [],
  courts: [],
  props: [],
  noWalk: [],
  exits: [
    { to: 'plaza', entry: 'fromStreet', at: [-12, 40], r: 2 },
    { to: 'academy', entry: 'fromStreet', at: [14, -3], r: 2 },
  ],
  entries: {
    fromPlaza: { at: [-8, 40], yaw: PI / 2 },
    fromAcademy: { at: [14, 1.5], yaw: 0 },
  },
  start: { at: [-8, 40], yaw: PI / 2 },
  clouds: [],
  spots: [],
};
void trail;
void PI;

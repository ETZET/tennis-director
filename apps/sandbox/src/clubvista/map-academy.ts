// H · 青训场（会员场 / 青训场：一排硬地场 + 训练营）
// （骨架：只有地面、一条路、出入口。这张图的代理照 clubvista.md「第三轮」的连接图和 map-rest.ts 的样板把它做出来；
//   出入口的名字（exits 的 to / entry、entries 的 key）不能改，位置可以挪。）
import { type MapDef, rect, trail, VIEW } from './mapdef';

const PI = Math.PI;

export const academy: MapDef = {
  id: 'academy',
  name: '青训场',
  W: 28,
  D: 56,
  view: VIEW(56),
  plates: [{ id: 'ground', pts: rect(-30, -16, 60, 76), h: 0, top: 'turf', el: 'none', wall: 'none', smooth: 0 }],
  strips: [],
  stairs: [],
  courts: [],
  props: [],
  noWalk: [],
  exits: [{ to: 'street', entry: 'fromAcademy', at: [14, 59], r: 2 }],
  entries: {
    fromStreet: { at: [14, 55], yaw: PI },
  },
  start: { at: [14, 55], yaw: PI },
  clouds: [],
  spots: [],
};
void trail;
void PI;

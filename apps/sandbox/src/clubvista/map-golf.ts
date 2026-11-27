// I · 果岭（高尔夫推杆果岭 + 练习打位）
// （骨架：只有地面、一条路、出入口。这张图的代理照 clubvista.md「第三轮」的连接图和 map-rest.ts 的样板把它做出来；
//   出入口的名字（exits 的 to / entry、entries 的 key）不能改，位置可以挪。）
import { type MapDef, rect, trail, VIEW } from './mapdef';

const PI = Math.PI;

export const golf: MapDef = {
  id: 'golf',
  name: '果岭',
  W: 28,
  D: 52,
  view: VIEW(52),
  plates: [{ id: 'ground', pts: rect(-30, -16, 60, 72), h: 0, top: 'turf', el: 'none', wall: 'none', smooth: 0 }],
  strips: [],
  stairs: [],
  courts: [],
  props: [],
  noWalk: [],
  exits: [{ to: 'plaza', entry: 'fromGolf', at: [14, -3], r: 2 }],
  entries: {
    fromPlaza: { at: [14, 1.5], yaw: 0 },
  },
  start: { at: [14, 1.5], yaw: 0 },
  clouds: [],
  spots: [],
};
void trail;
void PI;

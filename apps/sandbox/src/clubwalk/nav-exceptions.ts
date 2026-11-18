// 导航体检（clubwalk/audit.ts）的例外：画面上看着能走、导航故意不让走（或者体检量不准）的地方，一条一个原因。
// 体检照样报这些片，标上 exc（例外的 id），验收（walkaudit.mjs --check）不算它们。
// 新加一条 = 一个玩法 / 画面上的决定，写清楚为什么；不要拿它盖住真的问题。
import { KIDS_ZONE } from '../clubcourts/layout';
import { CLUBHOUSE, GOLF_POND, GROUNDS, POOL, type Rect } from '../clubsite/world';
import { STANDS } from '../clubstadium/layout';

export interface NavException {
  id: string;
  /** 片的中心落在这些范围里才算（world 米） */
  rects: Rect[];
  /** 哪几种对不上（A 穿模、B 空气墙、C 脚不着地、D 踩空） */
  kinds: ('A' | 'B' | 'C' | 'D')[];
  /** 片至少这么大才算（米²；不给 = 都算） */
  minArea?: number;
  /** 反过来：中心在 rects 外面才算 */
  outside?: boolean;
  why: string;
}

const N = STANDS.north;

export const NAV_EXCEPTIONS: NavException[] = [
  {
    id: 'kids-zone',
    rects: [KIDS_ZONE],
    kinds: ['B'],
    why: '青训西场训练时孩子排队、打球的那一块不让进（clubcourts/layout.ts 的 KIDS_ZONE；推捡球器贴着它走）',
  },
  {
    id: 'stand-rows',
    rects: [{ x0: N.x0, x1: N.x1, z0: N.front - N.n * N.deep, z1: N.front }],
    kinds: ['B'],
    why: '北看台座椅那几排的踏面只给观众坐：总监走端梯、横走道、四条走道（clubstadium/play.ts 的座位块）',
  },
  {
    id: 'water',
    rects: [
      POOL,
      {
        x0: GOLF_POND.x - GOLF_POND.rx - 1,
        x1: GOLF_POND.x + GOLF_POND.rx + 1,
        z0: GOLF_POND.z - GOLF_POND.rz - 1,
        z1: GOLF_POND.z + GOLF_POND.rz + 1,
      },
    ],
    kinds: ['B'],
    why: '泳池、高尔夫水塘的水面和地面差不多高，体检当成平地；水里不能走',
  },
  {
    id: 'desert-edge',
    rects: [GROUNDS],
    outside: true,
    minArea: 50,
    kinds: ['B'],
    why: '围墙外的大片沙漠是 clubwalk 的地图边（停车场、高尔夫外面）；山谷（src/valley）里另算',
  },
  {
    id: 'house-exterior',
    rects: [CLUBHOUSE],
    kinds: ['C', 'D'],
    why: '体检按外观量：楼里的楼梯、地下一层在外观里藏着（进门才切剖面），量不到地面',
  },
];

/** 这一片属于哪条例外（没有 = null） */
export function exceptionOf(kind: 'A' | 'B' | 'C' | 'D', cx: number, cz: number, area: number): string | null {
  for (const e of NAV_EXCEPTIONS) {
    if (!e.kinds.includes(kind) || (e.minArea && area < e.minArea)) continue;
    const inside = e.rects.some((r) => cx >= r.x0 && cx <= r.x1 && cz >= r.z0 && cz <= r.z1);
    if (inside !== !e.outside) continue;
    return e.id;
  }
  return null;
}

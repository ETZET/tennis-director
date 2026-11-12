// 大世界的区域表：每个细节场景一行（场景模块 + 地点名 + 它管的范围）。范围互不重叠；不在任何区域里的地方走底图。
// 范围的边尽量落在"两边地面一样"的缝上（步道边、墙外），不切过墙、台阶、围网。
// 接新场景（第二阶段）：场景照 clubsite/region.ts 拆好 create<场景>Region，在这里加一行，范围别和别人重叠。

import { createClayRegion } from '../clubclay/scene';
import { createCourtsRegion } from '../clubcourts/scene';
import { createDeskRegion } from '../clubdesk/scene';
import { createFoodRegion } from '../clubfood/scene';
import { createGolfRegion } from '../clubgolf/scene';
import { createHouseRegion } from '../clubhouse/scene';
import { WALL_OUT } from '../clubpark/layout';
import { createParkRegion } from '../clubpark/scene';
import { createPickleRegion } from '../clubpickle/scene';
import { createPlazaRegion } from '../clubplaza/scene';
import { createPoolRegion } from '../clubpool/scene';
import type { Region, RegionHost } from '../clubsite/region';
import type { Rect } from '../clubsite/world';
import { createStadiumRegion } from '../clubstadium/scene';

export interface RegionDef {
  id: string;
  /** 地点名（进入时 HUD 上淡出） */
  name: string;
  /** 这个区域管的范围（世界米，互不重叠） */
  rects: Rect[];
  /**
   * 范围里的这几块，导航问别的区域（画面、地形、摆件还归这个区域）：这个区域的场景不管那块地的导航，
   * 邻居的场景管（例如匹克球范围里的草坪西半，草坪和下去的台阶在前台的导航里）。邻居没建好就还问自己。
   */
  navFrom?: { r: Rect; from: string }[];
  create(host: RegionHost): Region;
}

export const REGIONS: RegionDef[] = [
  {
    id: 'clubpark',
    name: '停车场 · 到达',
    // 东墙（x 60，厚 0.7，门柱到 60.85）以东：落客区、两片停车场、车道到山口前
    rects: [{ x0: 61, x1: 140, z0: -45, z1: 45 }],
    create: createParkRegion,
  },
  {
    id: 'clubdesk',
    name: '露天前台',
    // 到达小院、凉棚、东墙和大门（墙里那面）、往南到草坪东半
    rects: [{ x0: 52, x1: 61, z0: -8.6, z1: 34 }],
    // 东墙外皮（x 60.35）到 61：墙外落客区的连锁砖，前台的导航在墙外只开了门洞那段，停车场的导航管这条
    navFrom: [{ r: { x0: WALL_OUT, x1: 61, z0: -8.6, z1: 34 }, from: 'clubpark' }],
    create: createDeskRegion,
  },
  {
    id: 'clubpickle',
    name: '匹克球场',
    // 围场 + 长廊这一段 + 东步道北段；草坪西半（和前台同一份下沉草坪）
    rects: [
      { x0: 33.6, x1: 52, z0: -8.6, z1: 16.6 },
      { x0: 36, x1: 52, z0: 16.6, z1: 34 },
    ],
    // 草坪西半：匹克球的导航只到长廊南沿（z 16.6），草坪（−0.5）和长廊下去的台阶（x 47.4…49.6）在前台的导航里
    navFrom: [{ r: { x0: 36, x1: 52, z0: 16.6, z1: 34 }, from: 'clubdesk' }],
    create: createPickleRegion,
  },
  {
    id: 'clubplaza',
    name: '棕榈喷泉广场',
    // 抬高的广场连西沿挡土墙（x 32）、两段台阶、北墙
    rects: [{ x0: 31, x1: 61, z0: -44, z1: -8.6 }],
    create: createPlazaRegion,
  },
  {
    id: 'clubstadium',
    name: '中心球场',
    // 场地、三面看台、西头的球员通道和工具角（会所餐车院子东沿 x −21.4，z > −30 收到 −22.6）、南边的长廊、去广场的小路
    rects: [
      { x0: -21.4, x1: 31, z0: -44, z1: -8.6 },
      { x0: -22.6, x1: -21.4, z0: -30, z1: -8.6 },
      { x0: -21.4, x1: 33.6, z0: -8.6, z1: -4.4 },
    ],
    create: createStadiumRegion,
  },
  {
    id: 'clubcourts',
    name: '会员场 · 青训',
    // 青训两片（东头 x 27 以东场景没画，走底图）、两排之间的步道、会员场、西步道
    rects: [
      { x0: -38.5, x1: 27, z0: -4.4, z1: 16.6 },
      { x0: -38.5, x1: -1, z0: 16.6, z1: 47 },
    ],
    create: createCourtsRegion,
  },
  {
    id: 'clubclay',
    name: '红土场',
    // 两片红土 + 东步道南段；西边到红土和会员场之间那道围网（x 0）外面一点
    rects: [{ x0: -1, x1: 36, z0: 16.6, z1: 53 }],
    create: createClayRegion,
  },
  {
    id: 'clubhouse',
    name: '会所',
    // 会所和它北边、西边到围墙脚；拱廊前的小院（x −46…−40、z −27 以南）留给餐车院子（clubfood）
    rects: [
      { x0: -64.5, x1: -46, z0: -44, z1: -1 },
      { x0: -46, x1: -40, z0: -44, z1: -27 },
    ],
    create: createHouseRegion,
  },
  {
    id: 'clubpool',
    name: '泳池',
    // 池畔平台一圈 + 北门外去会所南门的小路东边
    rects: [
      { x0: -64.5, x1: -38.5, z0: -1, z1: 20 },
      { x0: -46, x1: -38.5, z0: -9.4, z1: -1 },
    ],
    create: createPoolRegion,
  },
  {
    id: 'clubgolf',
    name: '高尔夫',
    // 南墙（西段，开了门：西步道南头）以南；红土场那段南墙归红土场
    rects: [
      { x0: -64.5, x1: -1, z0: 51.4, z1: 78 },
      { x0: -1, x1: 36, z0: 53, z1: 78 },
      { x0: 36, x1: 96, z0: 51.4, z1: 78 },
    ],
    create: createGolfRegion,
  },
  {
    id: 'clubfood',
    name: '餐车院子',
    // world.ts 的 FOOD_COURT（z > −30 那段东沿收到 x −22.6，球员通道归中心球场）+ 会所拱廊前的小院 ARCADE_YARD
    rects: [
      { x0: -40, x1: -21.4, z0: -44, z1: -30 },
      { x0: -40, x1: -22.6, z0: -30, z1: -9.4 },
      { x0: -46, x1: -40, z0: -27, z1: -9.4 },
    ],
    create: createFoodRegion,
  },
];

export const inRects = (rects: readonly Rect[], x: number, z: number) =>
  rects.some((r) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1);

/** 两组矩形之间最近的距离（米；相交 = 0） */
export function rectDist(a: Rect, b: Rect): number {
  const dx = Math.max(0, a.x0 - b.x1, b.x0 - a.x1);
  const dz = Math.max(0, a.z0 - b.z1, b.z0 - a.z1);
  return Math.hypot(dx, dz);
}

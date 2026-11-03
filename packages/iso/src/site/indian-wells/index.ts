import type { IsoWorld } from '../../core/world';
import { CourtFrame } from '../../world/frame';
import type { Site } from '../site';
import { SLAB } from './ground';
import {
  ANCHORS,
  F_O1,
  F_O2,
  F_O3,
  F_P1,
  F_P2,
  F_PB1,
  F_PB2,
  F_PK4,
  F_S1,
  F_TN2,
  GROUNDS,
  groundY,
  LAWN,
  routeLine,
  SITE,
  STANDS,
} from './layout';
import { buildIndianWells, createFacilityOverlays, createSky } from './overlays';

export { SLAB } from './ground';
export * from './layout';
export { buildIndianWells, createFacilityOverlays } from './overlays';
export type { PlaqueRow } from './plaque';
export {
  FACILITIES,
  FACILITY_STATES,
  type Facility,
  INITIAL_STATES,
  type Look,
  RESTORED_STATES,
  UPGRADES,
  VARIANTS,
} from './state';

/** 球员草坪：烧烤会、开放日之类不在球场上的演出（喷泉那一带的景观，归 plaza） */
const PLAZA_GROUND = new CourtFrame((LAWN.x0 + LAWN.x1) / 2, 0, (LAWN.z0 + LAWN.z1) / 2, 0, 9.5, 8.7);

/** 每个地点原来的球场（没设变体时） */
const COURTS: Readonly<Record<string, readonly CourtFrame[]>> = {
  stadium_1: [F_S1],
  stadium_3: [F_PB1, F_PB2],
  practice: [F_P1, F_P2],
  outer_1: [F_O1],
  outer_23: [F_O2, F_O3],
};

/** 变体改了场地画法的地点（outer_23 的 clay / hard 只换颜色，场地不变） */
const VARIANT_COURTS: Readonly<Record<string, Readonly<Record<string, readonly CourtFrame[]>>>> = {
  stadium_3: { pickle4: F_PK4, tennis2: F_TN2 },
};

/** 围墙的中心（默认镜头对着它） */
const CLUB = { x: (GROUNDS.x0 + GROUNDS.x1) / 2, z: (GROUNDS.z0 + GROUNDS.z1) / 2 };

/**
 * Palm Oasis Racquet Club（Indian Wells, CA）：整局唯一的地图，开局荒了十年（ADR 0018）。
 * 内容和存档里的地图 id 仍然是 indian_wells。createIsoWorld 时把 `SLAB` 传给 slab（地面贴图和浮空岛的范围）。
 */
export const INDIAN_WELLS: Site = {
  id: 'indian_wells',
  sky: '#e9d3b4',
  camera: {
    // zoom 就是 k（每米缓冲像素）：3 时围墙差不多铺满桌面（缓冲 720 宽）；
    // 手机竖屏（缓冲 390 宽）"围墙铺满宽度"约 k = 2，默认放大约 1.5 倍到 3，拖动看两边
    overview: { tx: CLUB.x, tz: CLUB.z, zoom: 3, rot: 0 },
    portrait: { tx: CLUB.x + 4, tz: CLUB.z - 4, zoom: 4, rot: 0 },
    limits: { zoom: [2, 15.6], tx: [SITE.x0 + 10, SITE.x1 - 10], tz: [SITE.z0 + 10, SITE.z1 - 10] },
  },
  venue: 'hollow',
  bounds: SITE,
  groundY,
  anchors: ANCHORS,
  stands: STANDS,
  routeLine,
  courts: COURTS,
  courtsFor: (anchor, variant) => (variant ? VARIANT_COURTS[anchor]?.[variant] : undefined) ?? COURTS[anchor] ?? [],
  grounds: { plaza: PLAZA_GROUND },
  build: (w: IsoWorld) => buildIndianWells(w),
  createOverlays: (w: IsoWorld) => createFacilityOverlays(w),
  createSky: (w: IsoWorld) => createSky(w),
};

/** createIsoWorld 用的选项（天色、园区范围、浮空岛范围） */
export const INDIAN_WELLS_WORLD = { sky: INDIAN_WELLS.sky, bounds: SITE, slab: SLAB } as const;

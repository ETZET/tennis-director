import { mulberry32 } from '@td/shared';
import * as THREE from 'three';
import { createBuildContext } from '../../world/build-context';
import { CourtFrame } from '../../world/frame';
import type { Site } from '../../world/site';
import { createIndianWellsSky } from './ambient';
import { buildIndianWells } from './build';
import {
  ANCHORS,
  F_O1,
  F_O2,
  F_O3,
  F_P1,
  F_P2,
  F_S1,
  F_S2,
  F_S3,
  groundY,
  PLAZA,
  routeLine,
  SITE,
  STANDS,
} from './layout';
import { createFacilityOverlays } from './overlays';

export * from './layout';
export { createFacilityOverlays, type FacilityOverlays } from './overlays';

/** 静态场景的随机种子（BNP Paribas Open 在这里办了几十年） */
export const INDIAN_WELLS_SEED = 2000;

/** 广场北半边一块空地：烧烤会、开放日之类不在球场上的演出 */
const PLAZA_GROUND = new CourtFrame((PLAZA.x0 + PLAZA.x1) / 2, 0, -9, 0, 12, 7);

/** Indian Wells Tennis Garden：整局唯一的地图，开局是废弃的（2026-11-01）。 */
export const INDIAN_WELLS: Site = {
  id: 'indian_wells',
  lighting: {
    // 沙漠的下午：干燥、偏暖的天色
    sky: '#e9d3b4',
    // 照参考图：不投阴影；天色和灯光由 daylight 按游戏时钟设
    shadows: false,
    hemi: { sky: '#f4e4cc', ground: '#a88a64', intensity: 0.82 },
    sun: {
      color: '#fff1d8',
      intensity: 0.62,
      position: [60, 110, -50],
      shadowExtent: 130,
      shadowNear: 10,
      shadowFar: 380,
      shadowBias: -0.0006,
      shadowMapSize: 2048,
    },
  },
  rain: {
    hemi: [0.82, 0.6],
    sun: [0.62, 0.3],
    sky: new THREE.Color('#e9d3b4'),
    skyRain: new THREE.Color('#9a9488'),
  },
  camera: {
    // 默认看整个园区（十个地点和地点牌都在 HUD 之间的空当里）：桌面从东南看，背后（西北）是群山
    overview: { yaw: 0.7, pitch: 0.72, zoom: 0.256, tx: -1, tz: -8 },
    // 竖屏从东边看过去：园区的长边竖着放，西边的群山在上面
    portrait: { yaw: 1.3, pitch: 0.95, zoom: 0.4, tx: -15.5, tz: -9 },
    limits: { zoom: [0.2, 3.2], pitch: [0.4, 1.3], tx: [SITE.x0 + 10, SITE.x1 - 10], tz: [SITE.z0 + 10, SITE.z1 - 10] },
  },
  venue: 'hollow',
  bounds: SITE,
  groundY,
  anchors: ANCHORS,
  stands: STANDS,
  routeLine,
  courts: {
    stadium_1: [F_S1],
    stadium_2: [F_S2],
    stadium_3: [F_S3],
    practice: [F_P1, F_P2],
    outer_1: [F_O1],
    outer_23: [F_O2, F_O3],
  },
  grounds: { plaza: PLAZA_GROUND },
  build(stage) {
    buildIndianWells(createBuildContext(stage.scene, mulberry32(INDIAN_WELLS_SEED)));
  },
  createOverlays: createFacilityOverlays,
  createSky: createIndianWellsSky,
};

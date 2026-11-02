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
  F_PB1,
  F_PB2,
  F_S1,
  groundY,
  LAWN,
  routeLine,
  SITE,
  STANDS,
} from './layout';
import { createFacilityOverlays } from './overlays';

export * from './layout';
export { createFacilityOverlays, type FacilityOverlays } from './overlays';

/** 静态场景的随机种子 */
export const INDIAN_WELLS_SEED = 2000;

/** 球员草坪：烧烤会、开放日之类不在球场上的演出（喷泉那一带的景观，归 plaza） */
const PLAZA_GROUND = new CourtFrame((LAWN.x0 + LAWN.x1) / 2, 0, (LAWN.z0 + LAWN.z1) / 2, 0, 9.5, 8.7);

/**
 * Palm Oasis Racquet Club（Indian Wells, CA）：整局唯一的地图，开局荒了十年（ADR 0018）。
 * 内容和存档里的地图 id 仍然是 indian_wells。
 */
export const INDIAN_WELLS: Site = {
  id: 'indian_wells',
  lighting: {
    // 天色和灯光由 world/daylight.ts 按游戏时钟设；这里是起始值
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
    // 照参考图的默认视角：从东南看整个俱乐部，背后是画出来的群山
    overview: { yaw: 0.66, pitch: 0.55, zoom: 0.62, tx: -2, tz: 4 },
    portrait: { yaw: 0.66, pitch: 0.6, zoom: 0.85, tx: 6, tz: -2 },
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
    stadium_3: [F_PB1, F_PB2],
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

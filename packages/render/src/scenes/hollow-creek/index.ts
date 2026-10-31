import { mulberry32 } from '@td/shared';
import * as THREE from 'three';
import { createIslandSky, type IslandSky } from '../../ambient/sky';
import type { CameraPose, OrbitLimits } from '../../camera/orbit';
import { createBuildContext } from '../../world/build-context';
import type { LightingDef, Stage } from '../../world/stage';
import { buildHollowCreek, type HollowCreekStatic } from './build';
import { ISLAND } from './layout';

export * from './layout';
export { createFacilityOverlays, type FacilityOverlays } from './overlays';

/** 第一幕：Hollow Creek 网球俱乐部（1974 年建，阴天，正在出售）。 */
export const HOLLOW_CREEK_SEED = 1974;

export const HOLLOW_CREEK_LIGHTING: LightingDef = {
  // 设计稿 Day · Cloud（多云的下午）
  sky: '#a3bac8',
  // 岛下很深处的云渐渐融进天色
  fog: { near: 300, far: 520 },
  hemi: { sky: '#c3cbcf', ground: '#5e5545', intensity: 0.78 },
  sun: {
    color: '#dfe2e0',
    intensity: 0.5,
    position: [30, 85, -40],
    shadowExtent: 80,
    shadowNear: 10,
    shadowFar: 280,
    shadowBias: -0.0006,
    shadowMapSize: 2048,
  },
};

/** 下雨时的天色和灯光（Dale 被开除后开始下雨）。 */
export const HOLLOW_CREEK_RAIN = {
  hemi: [0.78, 0.56],
  sun: [0.5, 0.24],
  sky: new THREE.Color('#a3bac8'),
  // 设计稿 Day · Rain
  skyRain: new THREE.Color('#6f8291'),
} as const;

/** 默认视角：一打开就看到整座浮空岛（岛底、四周的天空），两岸和中间的小溪都在画面里。 */
export const HOLLOW_CREEK_CAMERA: Record<'overview', CameraPose> = {
  overview: { yaw: -0.62, pitch: 0.66, zoom: 0.37, tx: -3, tz: 5 },
};

/** 竖屏手机：岛铺满屏幕宽度。 */
export const HOLLOW_CREEK_CAMERA_PORTRAIT: CameraPose = { yaw: -0.62, pitch: 0.66, zoom: 0.56, tx: -7, tz: 8 };

/** 最远能拉到看见整座浮空岛、岛底和四周的云。 */
export const HOLLOW_CREEK_CAMERA_LIMITS: OrbitLimits = {
  zoom: [0.26, 3.2],
  pitch: [0.4, 1.3],
  tx: [ISLAND.x0 + 4, ISLAND.x1 - 4],
  tz: [ISLAND.z0 + 4, ISLAND.z1 - 4],
};

/** 岛四周的天空：云、浮在岛边的小土块。 */
export function createHollowCreekSky(stage: Stage): IslandSky {
  return createIslandSky(stage.scene, {
    island: ISLAND,
    seed: 0xc10d5,
    cloud: ['#d0d5d9', '#8a939b'],
  });
}

/** 在已经建好的舞台上构建 Hollow Creek 的静态场景。 */
export function buildHollowCreekStage(stage: Stage, seed = HOLLOW_CREEK_SEED): HollowCreekStatic {
  return buildHollowCreek(createBuildContext(stage.scene, mulberry32(seed)));
}

export type { HollowCreekStatic };

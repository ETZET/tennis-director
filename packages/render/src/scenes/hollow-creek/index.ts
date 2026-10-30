import { mulberry32 } from '@td/shared';
import * as THREE from 'three';
import { createIslandSky, type IslandSky } from '../../ambient/sky';
import type { CameraPose, OrbitLimits } from '../../camera/orbit';
import { createBuildContext } from '../../world/build-context';
import type { LightingDef, Stage } from '../../world/stage';
import { buildHollowCreek, type HollowCreekStatic } from './build';
import { ISLAND } from './layout';

export * from './layout';

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
  hemi: [0.78, 0.62],
  sun: [0.5, 0.3],
  sky: new THREE.Color('#a3bac8'),
  // 设计稿 Day · Rain
  skyRain: new THREE.Color('#728694'),
} as const;

export const HOLLOW_CREEK_CAMERA: Record<'overview', CameraPose> = {
  overview: { yaw: -0.62, pitch: 0.66, zoom: 0.74, tx: 9, tz: 0.5 },
};

/** 最远能拉到看见整座浮空岛、岛底和四周的云（原型最远 0.5）。 */
export const HOLLOW_CREEK_CAMERA_LIMITS: OrbitLimits = {
  zoom: [0.26, 3.2],
  pitch: [0.4, 1.3],
  tx: [-55, 60],
  tz: [-55, 55],
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

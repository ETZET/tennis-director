import { mulberry32 } from '@td/shared';
import * as THREE from 'three';
import type { CameraPose } from '../../camera/orbit';
import { createBuildContext } from '../../world/build-context';
import type { LightingDef, Stage } from '../../world/stage';
import { buildHollowCreek, type HollowCreekStatic } from './build';

export * from './layout';

/** 第一幕：Hollow Creek 网球俱乐部（1974 年建，阴天，正在出售）。 */
export const HOLLOW_CREEK_SEED = 1974;

export const HOLLOW_CREEK_LIGHTING: LightingDef = {
  sky: '#8e979a',
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
  sky: new THREE.Color('#8e979a'),
  skyRain: new THREE.Color('#6c7477'),
} as const;

export const HOLLOW_CREEK_CAMERA: Record<'overview', CameraPose> = {
  overview: { yaw: -0.62, pitch: 0.66, zoom: 0.74, tx: 9, tz: 0.5 },
};

/** 在已经建好的舞台上构建 Hollow Creek 的静态场景。 */
export function buildHollowCreekStage(stage: Stage, seed = HOLLOW_CREEK_SEED): HollowCreekStatic {
  return buildHollowCreek(createBuildContext(stage.scene, mulberry32(seed)));
}

export type { HollowCreekStatic };

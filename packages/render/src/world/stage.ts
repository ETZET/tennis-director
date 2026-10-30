import * as THREE from 'three';

/** 场景的光照和天色。每个场景各有一套（Hollow Creek 是阴天）。 */
export interface LightingDef {
  sky: string;
  /** 雾：远处的海面渐渐融进天色（正交相机按视线方向的深度算） */
  fog?: { near: number; far: number };
  hemi: { sky: string; ground: string; intensity: number };
  sun: {
    color: string;
    intensity: number;
    position: readonly [number, number, number];
    /** 阴影相机半宽 */
    shadowExtent: number;
    shadowNear: number;
    shadowFar: number;
    shadowBias: number;
    shadowMapSize: number;
  };
}

/** 渲染器、场景图、正交相机和两盏灯。 */
export interface Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly cam: THREE.OrthographicCamera;
  readonly hemi: THREE.HemisphereLight;
  readonly sun: THREE.DirectionalLight;
  readonly container: HTMLElement;
}

export function createStage(container: HTMLElement, L: LightingDef): Stage {
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.BasicShadowMap;
  renderer.setClearColor(new THREE.Color(L.sky));
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  if (L.fog) scene.fog = new THREE.Fog(new THREE.Color(L.sky), L.fog.near, L.fog.far);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 700);
  const hemi = new THREE.HemisphereLight(L.hemi.sky, L.hemi.ground, L.hemi.intensity);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(L.sun.color, L.sun.intensity);
  sun.position.set(...L.sun.position);
  sun.castShadow = true;
  sun.shadow.mapSize.set(L.sun.shadowMapSize, L.sun.shadowMapSize);
  const e = L.sun.shadowExtent;
  Object.assign(sun.shadow.camera, {
    left: -e,
    right: e,
    top: e,
    bottom: -e,
    near: L.sun.shadowNear,
    far: L.sun.shadowFar,
  });
  sun.shadow.bias = L.sun.shadowBias;
  scene.add(sun);
  scene.add(sun.target);
  return { renderer, scene, cam, hemi, sun, container };
}

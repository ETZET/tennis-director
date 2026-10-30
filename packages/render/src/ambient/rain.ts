import { lerp, range } from '@td/shared';
import * as THREE from 'three';
import { boxGeo } from '../people/parts';
import type { Stage } from '../world/stage';

export interface Rain {
  start(): void;
  /** 0 晴到 1 雨，淡入淡出的当前值 */
  amount(): number;
  /** 雨跟着相机目标点走；同时把天色和灯光压暗 */
  update(dt: number, cx: number, cz: number): void;
}

export interface RainLighting {
  /** 晴 → 雨 的半球光强度 */
  hemi: readonly [number, number];
  /** 晴 → 雨 的平行光强度 */
  sun: readonly [number, number];
  sky: THREE.Color;
  skyRain: THREE.Color;
}

/** 800 根雨丝的实例化网格，淡入淡出。 */
export function createRain(stage: Stage, lighting: RainLighting, n = 800): Rain {
  const rr = (a: number, b: number) => range(Math.random, a, b);
  const mesh = new THREE.InstancedMesh(
    boxGeo(0.03, 0.5, 0.03),
    new THREE.MeshBasicMaterial({ color: '#c7d3da', transparent: true, opacity: 0 }),
    n,
  );
  mesh.frustumCulled = false;
  stage.scene.add(mesh);
  const P: { x: number; y: number; z: number }[] = [];
  // 浮空岛：雨一直落到岛底下的虚空里
  for (let i = 0; i < n; i++) P.push({ x: rr(-50, 50), y: rr(-40, 26), z: rr(-50, 50) });
  const d = new THREE.Object3D();
  let on = 0;
  let target = 0;
  const mat = mesh.material as THREE.MeshBasicMaterial;
  return {
    start() {
      target = 1;
    },
    amount: () => on,
    update(dt, cx, cz) {
      on = lerp(on, target, 1 - Math.exp(-dt * 0.5));
      mat.opacity = 0.5 * on;
      if (on < 0.01) {
        mesh.visible = false;
        return;
      }
      mesh.visible = true;
      for (let i = 0; i < n; i++) {
        const p = P[i] as (typeof P)[number];
        p.y -= 17 * dt;
        p.x += 2.5 * dt;
        if (p.y < -40) {
          p.y = rr(20, 26);
          p.x = rr(-50, 50);
          p.z = rr(-50, 50);
        }
        d.position.set(cx + p.x, p.y, cz + p.z);
        d.rotation.z = -0.14;
        d.updateMatrix();
        mesh.setMatrixAt(i, d.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      stage.hemi.intensity = lerp(lighting.hemi[0], lighting.hemi[1], on);
      stage.sun.intensity = lerp(lighting.sun[0], lighting.sun[1], on);
      const sky = lighting.sky.clone().lerp(lighting.skyRain, on);
      stage.renderer.setClearColor(sky);
      // 雾和天色一起变暗，远处的云才不会露出一圈亮边
      if (stage.scene.fog) stage.scene.fog.color.copy(sky);
    },
  };
}

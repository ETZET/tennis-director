import type { XZ } from '@td/shared';
import * as THREE from 'three';
import { boxGeo, part } from '../people/parts';

export interface Car {
  readonly g: THREE.Group;
  /** 发动，沿路径开走 */
  start(): void;
  update(dt: number, now: number): void;
}

/** 一辆体素小汽车，开动时排尾气。carY 给出路面高度。 */
export function createCar(
  scene: THREE.Object3D,
  carY: (x: number, z: number) => number,
  x: number,
  z: number,
  col: string,
  trim: string,
  path: readonly XZ[],
  /** 开到路线尽头就缩小消失（浮空岛：路在岛边断开，边外什么都没有） */
  vanishAtEnd = false,
): Car {
  const g = new THREE.Group();
  g.position.set(x, carY(x, z), z);
  scene.add(g);
  part(g, 4.2, 0.55, 1.8, 0, 0.42, 0, col);
  part(g, 2.3, 0.55, 1.62, -0.25, 0.97, 0, col);
  part(g, 2.32, 0.42, 1.66, -0.25, 1.0, 0, '#2c3a44');
  part(g, 1.0, 0.3, 1.0, 1.2, 0.6, 0.42, trim);
  part(g, 0.06, 0.18, 0.4, 2.11, 0.5, 0.6, '#e8e2c8');
  part(g, 0.06, 0.18, 0.4, 2.11, 0.5, -0.6, '#4a4a44');
  part(g, 0.06, 0.16, 0.4, -2.11, 0.5, 0.6, '#9a2a24');
  part(g, 0.06, 0.16, 0.4, -2.11, 0.5, -0.6, '#9a2a24');
  const wheels = (
    [
      [1.35, 0.9],
      [-1.35, 0.9],
      [1.35, -0.9],
      [-1.35, -0.9],
    ] as const
  ).map(([a, b]) => part(g, 0.7, 0.7, 0.28, a, 0.33, b, '#1c1c1c'));
  const puffs: { m: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>; t: number }[] = [];
  for (let k = 0; k < 8; k++) {
    const m = new THREE.Mesh(
      boxGeo(0.3, 0.3, 0.3),
      new THREE.MeshBasicMaterial({ color: '#9a9f9f', transparent: true, opacity: 0 }),
    );
    scene.add(m);
    puffs.push({ m, t: -9 });
  }
  let moving = false;
  let v = 0;
  let pi = 0;
  let pt = 0;
  let goneT: number | null = null;
  return {
    g,
    start() {
      moving = true;
    },
    update(dt, now) {
      for (const p of puffs) {
        const a = now - p.t;
        if (a < 0 || a > 1.2) {
          p.m.material.opacity = 0;
          continue;
        }
        p.m.material.opacity = 0.45 * (1 - a / 1.2);
        p.m.position.y += dt * 0.5;
        p.m.scale.setScalar(1 + a * 1.5);
      }
      if (moving && vanishAtEnd && pi >= path.length) {
        goneT ??= now;
        const k = Math.min(1, (now - goneT) / 0.8);
        g.scale.setScalar(Math.max(0.001, 1 - k));
        if (k >= 1) g.visible = false;
        return;
      }
      if (!moving || pi >= path.length) return;
      const tg = path[pi] as XZ;
      const dx = tg.x - g.position.x;
      const dz = tg.z - g.position.z;
      const d = Math.hypot(dx, dz);
      v = Math.min(10, v + 3 * dt);
      const s = v * dt;
      if (d < Math.max(s, 0.3)) pi++;
      else {
        g.position.x += (dx / d) * s;
        g.position.z += (dz / d) * s;
        const ty = Math.atan2(-dz, dx);
        let dy = ty - g.rotation.y;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        g.rotation.y += dy * Math.min(1, dt * 3);
      }
      g.position.y = carY(g.position.x, g.position.z);
      for (const w of wheels) w.rotation.z -= s / 0.35;
      pt -= dt;
      if (pt < 0 && v > 0.3) {
        pt = 0.14;
        const p = puffs.find((q) => now - q.t > 1.2) || (puffs[0] as (typeof puffs)[number]);
        p.t = now;
        const c = Math.cos(g.rotation.y);
        const sn = -Math.sin(g.rotation.y);
        p.m.position.set(g.position.x - c * 2.3, g.position.y + 0.35, g.position.z - sn * 2.3);
      }
    },
  };
}

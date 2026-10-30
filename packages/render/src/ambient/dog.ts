import { range } from '@td/shared';
import * as THREE from 'three';
import { part } from '../people/parts';

export interface Dog {
  readonly g: THREE.Group;
  update(dt: number, now: number): void;
}

/** 一只沿固定巡游点闲逛的流浪狗，到点后停下嗅地面、摇尾巴。 */
export function createDog(
  scene: THREE.Object3D,
  groundY: (x: number, z: number) => number,
  waypoints: readonly (readonly [number, number])[],
): Dog {
  const g = new THREE.Group();
  scene.add(g);
  const C = '#7a5a3a';
  part(g, 0.3, 0.28, 0.72, 0, 0.42, 0, C);
  const head = new THREE.Group();
  head.position.set(0, 0.55, 0.38);
  g.add(head);
  part(head, 0.24, 0.22, 0.24, 0, 0.06, 0.06, C);
  part(head, 0.13, 0.1, 0.14, 0, 0, 0.22, '#5a3f28');
  part(head, 0.06, 0.06, 0.04, 0, 0.04, 0.3, '#111');
  part(head, 0.07, 0.12, 0.05, 0.09, 0.2, 0, '#5a3f28');
  part(head, 0.07, 0.12, 0.05, -0.09, 0.2, 0, '#5a3f28');
  const tail = new THREE.Group();
  tail.position.set(0, 0.52, -0.36);
  g.add(tail);
  part(tail, 0.06, 0.06, 0.28, 0, 0.06, -0.12, C);
  tail.rotation.x = -0.7;
  const legs = (
    [
      [0.1, 0.26],
      [-0.1, 0.26],
      [0.1, -0.26],
      [-0.1, -0.26],
    ] as const
  ).map(([x, z]) => {
    const l = new THREE.Group();
    l.position.set(x, 0.3, z);
    g.add(l);
    part(l, 0.08, 0.3, 0.08, 0, -0.15, 0, '#6a4b30');
    return l;
  });
  const first = waypoints[0] ?? [0, 0];
  let i = 0;
  const pos = { x: first[0], z: first[1] };
  let yaw = 0;
  let wait = 0;
  let phase = 0;
  return {
    g,
    update(dt, now) {
      if (wait > 0) {
        wait -= dt;
        head.rotation.x = 0.55 + Math.sin(now * 5) * 0.1;
        tail.rotation.y = Math.sin(now * 9) * 0.6;
      } else {
        const tg = waypoints[i] ?? first;
        const dx = tg[0] - pos.x;
        const dz = tg[1] - pos.z;
        const d = Math.hypot(dx, dz);
        const sp = 1.5 * dt;
        if (d < sp) {
          pos.x = tg[0];
          pos.z = tg[1];
          i = (i + 1) % waypoints.length;
          wait = range(Math.random, 1.5, 4);
        } else {
          pos.x += (dx / d) * sp;
          pos.z += (dz / d) * sp;
          phase += sp * 9;
          let dy = Math.atan2(dx, dz) - yaw;
          dy = Math.atan2(Math.sin(dy), Math.cos(dy));
          yaw += dy * Math.min(1, dt * 6);
        }
        head.rotation.x = 0.1;
        tail.rotation.y = Math.sin(now * 4) * 0.3;
      }
      legs.forEach((l, k) => {
        l.rotation.x = wait > 0 ? 0 : Math.sin(phase + (k === 0 || k === 3 ? 0 : Math.PI)) * 0.6;
      });
      g.position.set(pos.x, groundY(pos.x, pos.z), pos.z);
      g.rotation.y = yaw;
    },
  };
}

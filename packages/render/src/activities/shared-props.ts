import * as THREE from 'three';
import { part } from '../people/parts';
import type { Act } from './runtime';

/** 标志桶（Hollow Creek 用旧油漆桶代替），被球打中会飞起来，过一会儿复位。 */
export interface Cone {
  g: THREE.Group;
  home: { x: number; z: number };
  flying: boolean;
}

export function mkCone(a: Act, x: number, z: number): Cone {
  const g = new THREE.Group();
  g.position.set(x, 0.02, z);
  if (a.venue === 'hollow') {
    part(g, 0.3, 0.4, 0.3, 0, 0.2, 0, '#8a8f93');
    part(g, 0.34, 0.05, 0.34, 0, 0.4, 0, '#5a5f63');
    part(g, 0.31, 0.1, 0.31, 0, 0.22, 0, '#a8552a');
    part(g, 0.03, 0.2, 0.3, 0, 0.5, 0, '#3a3a3a');
  } else {
    part(g, 0.36, 0.04, 0.36, 0, 0.02, 0, '#ec6b23');
    part(g, 0.24, 0.14, 0.24, 0, 0.11, 0, '#ec6b23');
    part(g, 0.17, 0.07, 0.17, 0, 0.21, 0, '#f4f1e8');
    part(g, 0.11, 0.1, 0.11, 0, 0.29, 0, '#ec6b23');
  }
  a.group.add(g);
  return { g, home: { x, z }, flying: false };
}

export function knockCone(a: Act, cone: Cone): void {
  if (cone.flying) return;
  cone.flying = true;
  a.fling(
    cone.g,
    { x: a.rr(0.5, 3), y: a.rr(3.5, 5), z: a.rr(-2, 2) },
    { x: a.rr(-12, 12), z: a.rr(-12, 12) },
    {
      drop: true,
      onRest: () =>
        a.at(1.4, () => {
          cone.g.position.set(cone.home.x, 0.02, cone.home.z);
          cone.g.rotation.set(0, 0, 0);
          cone.flying = false;
          a.fx.sparkle(cone.home.x, 0.3, cone.home.z, 6, '#ffffff');
        }),
    },
  );
}

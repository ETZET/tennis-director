import { range } from '@td/shared';
import * as THREE from 'three';
import { part } from '../people/parts';

const rr = (a: number, b: number) => range(Math.random, a, b);

/** 一只乌鸦：平时转头，受惊后飞走。 */
export class Crow {
  readonly g: THREE.Group;
  private readonly head: THREE.Mesh;
  private readonly wl: THREE.Group;
  private readonly wr: THREE.Group;
  private fly: { t0: number; v: { x: number; y: number; z: number } } | null = null;

  constructor(scene: THREE.Object3D, x: number, y: number, z: number, yaw: number) {
    const g = new THREE.Group();
    this.g = g;
    g.position.set(x, y, z);
    g.rotation.y = yaw;
    scene.add(g);
    part(g, 0.22, 0.2, 0.36, 0, 0.12, 0, '#18181c');
    this.head = part(g, 0.15, 0.15, 0.15, 0, 0.27, 0.2, '#18181c');
    part(g, 0.05, 0.05, 0.1, 0, 0.26, 0.32, '#5a5a5a');
    part(g, 0.14, 0.04, 0.2, 0, 0.12, -0.25, '#18181c');
    this.wl = new THREE.Group();
    this.wl.position.set(0.11, 0.18, 0);
    g.add(this.wl);
    part(this.wl, 0.3, 0.03, 0.24, 0.15, 0, 0, '#222227');
    this.wr = new THREE.Group();
    this.wr.position.set(-0.11, 0.18, 0);
    g.add(this.wr);
    part(this.wr, 0.3, 0.03, 0.24, -0.15, 0, 0, '#222227');
    this.wl.scale.x = 0.35;
    this.wr.scale.x = 0.35;
  }

  /** 在 t 时刻惊飞。 */
  scare(t: number): void {
    const a = rr(-0.6, 0.6) + Math.PI;
    this.fly = { t0: t, v: { x: Math.sin(a) * rr(4, 6), y: rr(2.5, 4), z: Math.cos(a) * rr(4, 6) } };
    this.g.rotation.y = a;
  }

  update(now: number, dt: number): void {
    if (!this.fly) {
      this.head.rotation.y = Math.sin(now * 1.3 + this.g.position.x) * 0.5;
      return;
    }
    const t = now - this.fly.t0;
    if (t < 0) return;
    if (t > 10) {
      this.g.visible = false;
      return;
    }
    this.g.position.x += this.fly.v.x * dt;
    this.g.position.y += this.fly.v.y * dt * (1 - t / 14);
    this.g.position.z += this.fly.v.z * dt;
    const f = Math.sin(now * 22) * 0.9;
    this.wl.scale.x = 1;
    this.wr.scale.x = 1;
    this.wl.rotation.z = f;
    this.wr.rotation.z = -f;
  }
}

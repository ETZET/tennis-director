import { range } from '@td/shared';
import { CROW } from '../art/creatures/crow';
import type { Node } from '../core/graph';
import { Critter } from './critter';

const rr = (a: number, b: number) => range(Math.random, a, b);

/**
 * 一只乌鸦：停着时转头，落在地上（y 低）时还会啄地、蹦一下；受惊后扑着翅膀飞走，十秒后消失。
 * yaw 同旧版（three 的 rotation.y：头朝 (sin yaw, cos yaw)）。
 */
export class Crow {
  readonly g: Critter;
  private fly: { t0: number; v: { x: number; y: number; z: number } } | null = null;
  private next = rr(1, 3);
  private act: 'perch' | 'look' | 'peck' | 'hop' = 'perch';
  private actT = 0;
  private readonly home: { x: number; y: number; z: number };

  constructor(scene: Node, x: number, y: number, z: number, yaw: number) {
    const g = new Critter(CROW.perch, undefined, 0.2);
    this.g = g;
    g.name = 'crow';
    g.position.set(x, y, z);
    g.dir.x = Math.sin(yaw);
    g.dir.z = Math.cos(yaw);
    this.home = { x, y, z };
    scene.add(g);
  }

  /** 在 t 时刻惊飞。 */
  scare(t: number): void {
    const a = rr(-0.6, 0.6) + Math.PI + Math.atan2(this.g.dir.x, this.g.dir.z);
    this.fly = { t0: t, v: { x: Math.sin(a) * rr(4, 6), y: rr(2.5, 4), z: Math.cos(a) * rr(4, 6) } };
  }

  update(now: number, dt: number): void {
    const g = this.g;
    g.t += dt;
    if (this.fly && now >= this.fly.t0) {
      const t = now - this.fly.t0;
      if (t > 10) {
        g.visible = false;
        return;
      }
      g.lift = 0;
      g.play(CROW.fly);
      g.dir.x = this.fly.v.x;
      g.dir.z = this.fly.v.z;
      g.position.x += this.fly.v.x * dt;
      g.position.y += this.fly.v.y * dt * (1 - t / 14);
      g.position.z += this.fly.v.z * dt;
      return;
    }
    // 停着：隔一阵换个小动作
    this.actT += dt;
    if (this.actT > this.next) {
      this.actT = 0;
      const ground = this.home.y < 0.3;
      const r = Math.random();
      this.act = r < 0.4 ? 'look' : ground && r < 0.75 ? 'peck' : ground && r < 0.9 ? 'hop' : 'perch';
      this.next = this.act === 'hop' ? 0.35 : rr(0.8, 2.6);
      if (this.act === 'hop' || Math.random() < 0.3) {
        // 蹦的时候顺便转个身
        const a = Math.atan2(g.dir.x, g.dir.z) + rr(-1.5, 1.5);
        g.dir.x = Math.sin(a);
        g.dir.z = Math.cos(a);
      }
      if (this.act === 'hop') {
        g.position.x = this.home.x + rr(-0.3, 0.3);
        g.position.z = this.home.z + rr(-0.3, 0.3);
      }
    }
    g.play(CROW[this.act]);
    g.lift = this.act === 'hop' ? Math.sin(Math.min(1, this.actT / 0.35) * Math.PI) * 0.18 : 0;
  }
}

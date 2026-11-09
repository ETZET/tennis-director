// 风：阵风包络（平静 → 起风 → 阵风顶 → 回落，偶尔一阵大风）+ 风向围绕初始方向慢慢摆。
// 只写 w.uniforms.uGust / uWind；其他效果都读这里的 dir / speed / gust。
import * as THREE from 'three';
import type { World } from '../../world';

type Phase = 'calm' | 'rise' | 'hold' | 'fall';

export class Wind {
  /** 当前风向（单位向量，xz） */
  readonly dir = new THREE.Vector2(1, 0);
  /** 阵风 0..1 */
  gust = 0.25;
  /** 基础风力（?wind 参数，0..1） */
  readonly base: number;
  /** 地面附近沙粒的风速（米/秒） */
  speed = 0;
  /** 刚刚是不是一阵大风的顶 */
  strong = false;

  private baseAngle: number;
  private angle: number;
  private phase: Phase = 'calm';
  private phaseLeft: number;
  private level = 0.2;
  private from = 0.2;
  private to = 0.2;
  private phaseLen = 1;
  private rnd: () => number;

  constructor(private w: World) {
    const v = w.uniforms.uWind.value;
    this.base = v.length();
    this.baseAngle = this.base > 1e-4 ? Math.atan2(v.y, v.x) : Math.atan2(0.35, 0.8);
    this.angle = this.baseAngle;
    this.rnd = w.rng('fx:wind');
    this.phaseLeft = 2 + this.rnd() * 3;
    this.update(0, 0);
  }

  private next() {
    const r = this.rnd;
    const breakBoost = this.w.play.phase === 'break' ? 0.15 : 0;
    this.from = this.level;
    switch (this.phase) {
      case 'calm':
        this.phase = 'rise';
        this.strong = r() < 0.18 + breakBoost;
        this.to = this.strong ? 0.92 + r() * 0.08 : 0.5 + r() * 0.3;
        this.phaseLen = 1.5 + r() * 2.5;
        break;
      case 'rise':
        this.phase = 'hold';
        this.to = this.level;
        this.phaseLen = (this.strong ? 3 : 2) + r() * 4;
        break;
      case 'hold':
        this.phase = 'fall';
        this.to = 0.1 + r() * 0.2;
        this.phaseLen = 2 + r() * 3;
        break;
      case 'fall':
        this.phase = 'calm';
        this.strong = false;
        this.to = this.level;
        this.phaseLen = 4 + r() * 9;
        break;
    }
    this.phaseLeft = this.phaseLen;
  }

  update(dt: number, t: number) {
    this.phaseLeft -= dt;
    if (this.phaseLeft <= 0) this.next();
    const k = 1 - Math.max(0, this.phaseLeft) / this.phaseLen;
    const s = k * k * (3 - 2 * k);
    this.level = this.from + (this.to - this.from) * s;
    // 小抖动：阵风里风不是平的
    const flutter = 0.05 * Math.sin(t * 2.7) + 0.04 * Math.sin(t * 4.3 + 1.3) + 0.03 * Math.sin(t * 7.1 + 0.4);
    this.gust = THREE.MathUtils.clamp(this.level + flutter * (0.4 + this.level), 0, 1);

    // 风向：慢慢绕初始方向摆，阵风时稍微偏一点
    this.angle =
      this.baseAngle +
      0.22 * Math.sin(t * 0.047) +
      0.1 * Math.sin(t * 0.13 + 1.7) +
      0.06 * this.gust * Math.sin(t * 0.6);
    this.dir.set(Math.cos(this.angle), Math.sin(this.angle));
    this.speed = (1.5 + 9 * this.base) * (0.3 + 0.9 * this.gust);

    const u = this.w.uniforms;
    u.uGust.value = this.gust;
    u.uWind.value.copy(this.dir).multiplyScalar(this.base);
  }
}

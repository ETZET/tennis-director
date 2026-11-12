// 走路平顺的数值检查：模拟各种刷新率的 rAF，比较旧循环（直接累加）和新循环（snapDelta + ViewLerp）
// 每个画出来的帧里总监"看起来"挪了多少。匀速 3 m/s 走，理想是每帧挪 3·帧间隔；指标 = 每帧位移的变异系数（越小越顺）
// 和"停一帧"（画出来的帧之间总监没动）的次数。
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { snapDelta, ViewLerp } from './smooth';

const DT = 1 / 60;
const SPEED = 3;

/** frames：每帧的 rAF 时间戳（秒）；返回每个画出来的帧里总监的 x */
function run(frames: number[], smooth: boolean): number[] {
  const director = new THREE.Object3D();
  const rig = { target: new THREE.Vector3() };
  const scene = new THREE.Object3D();
  const lerp = new ViewLerp(director, rig, scene);
  let acc = 0;
  let last = frames[0];
  const shown: number[] = [];
  for (const now of frames.slice(1)) {
    let real = Math.min(0.1, now - last);
    last = now;
    if (smooth) real = snapDelta(real);
    acc += real;
    while (acc >= DT) {
      if (smooth) lerp.mark();
      director.position.x += SPEED * DT;
      rig.target.x = director.position.x;
      acc -= DT;
    }
    if (smooth) lerp.begin(acc / DT);
    shown.push(director.position.x);
    lerp.end();
  }
  return shown;
}

function stats(shown0: number[]) {
  // 开头几帧（还没走满一步）不算
  const shown = shown0.slice(5);
  const d = shown.slice(1).map((x, i) => x - shown[i]);
  const mean = d.reduce((a, b) => a + b, 0) / d.length;
  const cv = Math.sqrt(d.reduce((a, b) => a + (b - mean) ** 2, 0) / d.length) / mean;
  return { cv, frozen: d.filter((v) => v < 1e-9).length, double: d.filter((v) => v > mean * 1.6).length };
}

/** 刷新率 hz、时间戳抖动 ±jitter 秒（Chrome 的 rAF 时间戳会差零点几毫秒），共 n 帧；伪随机固定种子 */
function vsync(hz: number, jitter: number, n = 3000): number[] {
  let s = 7;
  const rnd = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  return Array.from({ length: n }, (_, i) => i / hz + (rnd() * 2 - 1) * jitter);
}

describe('走路平顺（snapDelta + ViewLerp）', () => {
  // 真屏幕不是正好 60.000 Hz（59.94、60.03……）：累加器的余量慢慢漂过 0，漂到 0 附近时时间戳的抖动让旧循环一阵一阵地停帧、跳两步
  for (const hz of [59.94, 60.03]) {
    it(`${hz} Hz、时间戳抖 ±0.5 毫秒：旧循环会停帧 / 跳两步，新循环每帧一步`, () => {
      const f = vsync(hz, 0.0005);
      const old = stats(run(f, false));
      const now = stats(run(f, true));
      expect(old.frozen + old.double).toBeGreaterThan(5);
      expect(now.frozen).toBe(0);
      expect(now.double).toBe(0);
      expect(now.cv).toBeLessThan(0.01);
    });
  }

  it('120 Hz：新循环匀速（插值），旧循环 0/1 步交替', () => {
    const f = vsync(120, 0.0003);
    const old = stats(run(f, false));
    const now = stats(run(f, true));
    expect(old.frozen).toBeGreaterThan(200);
    expect(now.frozen).toBe(0);
    expect(now.cv).toBeLessThan(0.05);
  });

  it('90 Hz（不是 60 的整数倍）：插值把 1,1,0 的节奏抹平', () => {
    const f = vsync(90, 0.0003);
    const old = stats(run(f, false));
    const now = stats(run(f, true));
    expect(old.cv).toBeGreaterThan(0.5);
    expect(now.frozen).toBe(0);
    expect(now.cv).toBeLessThan(0.1);
  });

  it('模拟状态不受插值影响：走完的位置和旧循环只差累加器里那一点', () => {
    const f = vsync(60, 0.0005);
    const a = run(f, false);
    const b = run(f, true);
    expect(Math.abs(a.at(-1)! - b.at(-1)!)).toBeLessThan(SPEED * DT * 2);
  });

  it('瞬移（一步超过 1 米）不插值', () => {
    const director = new THREE.Object3D();
    const rig = { target: new THREE.Vector3() };
    const lerp = new ViewLerp(director, rig, new THREE.Object3D());
    lerp.mark();
    director.position.x = 5;
    rig.target.x = 5;
    lerp.begin(0.5);
    expect(director.position.x).toBe(5);
    expect(rig.target.x).toBe(5);
    lerp.end();
  });

  it('跟着总监的东西（userData.followsDirector）跟着插值，画完放回', () => {
    const scene = new THREE.Object3D();
    const director = new THREE.Object3D();
    const tray = new THREE.Object3D();
    tray.userData.followsDirector = true;
    scene.add(tray);
    const rig = { target: new THREE.Vector3() };
    const lerp = new ViewLerp(director, rig, scene);
    lerp.mark();
    director.position.x = 0.05;
    tray.position.set(0.45, 1, 0);
    lerp.begin(0.5);
    expect(director.position.x).toBeCloseTo(0.025);
    expect(tray.position.x).toBeCloseTo(0.425);
    lerp.end();
    expect(tray.position.x).toBeCloseTo(0.45);
    expect(director.position.x).toBeCloseTo(0.05);
  });
});

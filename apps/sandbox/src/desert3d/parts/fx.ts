// fx 部件：风（阵风包络、风向摆动）、风沙粒子（流沙、沙带、尘卷风、尘团）、风滚草和飞的碎片、
// 风吹沙上场（w.dirt.deposit）、天空（渐变、太阳、云、鸟）。实现 w.fx（puff）。
// URL：sand=（风沙堆积倍数，默认 1）、devil=（第一个尘卷风几秒后出现）。
import * as THREE from 'three';
import type { Build } from '../world';
import { Dust } from './fx/particles';
import { Sky } from './fx/sky';
import { Tumble } from './fx/tumble';
import { Wind } from './fx/wind';

export const build: Build = (w) => {
  const wind = new Wind(w);
  const dust = new Dust(w, wind);
  w.scene.add(dust.points);
  w.fx = { puff: (pos, size, count) => dust.puff(pos, size, count) };

  const tumble = new Tumble(w, wind, (p, s, c) => dust.puff(p, s, c));
  w.scene.add(tumble.root);
  const sky = new Sky(w, wind);
  w.scene.add(sky.root);

  // 粒子随时刻变色（夜里别发光）
  const tint = new THREE.Color();
  const sunDir = new THREE.Vector3();
  const sunCol = new THREE.Color();
  const updateTint = () => {
    sunDir.copy(w.sun.position).normalize();
    const day = THREE.MathUtils.smoothstep(sunDir.y, -0.05, 0.35);
    // 太阳色归一化后只取三成，白天接近 1，夜里压暗偏冷
    const sc = w.sun.color;
    const mx = Math.max(sc.r, sc.g, sc.b, 1e-3);
    sunCol.setRGB(sc.r / mx, sc.g / mx, sc.b / mx);
    tint
      .setRGB(1, 1, 1)
      .lerp(sunCol, 0.2)
      .multiplyScalar(0.98 * day)
      .lerp(w.hemi.color, 0.35 * (1 - day));
    tint.multiplyScalar(0.45 + 0.55 * day);
    dust.setTint(tint);
  };

  // 每次渲染前把粒子写进顶点缓冲（固定步长可能一帧跑好几步，只写一次）
  const prev = w.scene.onBeforeRender;
  w.scene.onBeforeRender = function (...args) {
    prev.apply(this, args);
    dust.flush();
  };

  // 调试：window.__fx
  Object.assign(window, { __fx: { wind, dust, tumble } });

  return {
    update(dt, t) {
      wind.update(dt, t);
      dust.update(dt, t);
      tumble.update(dt, t);
      sky.update(dt, t);
      updateTint();
    },
  };
};

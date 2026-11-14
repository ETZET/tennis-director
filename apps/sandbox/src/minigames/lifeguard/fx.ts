// 水上的小效果：水花（一个 InstancedMesh 的小方块，抛出去落回水面）、涟漪（水面上扩开、变淡的白圈，FX 层）。
// 都是一池子预先建好的，不用的缩成 0 / 藏起来；时间走模拟时间（step 里推）。
import * as THREE from 'three';

export interface Splash {
  /** 在 (x, y, z) 溅 n 滴：横向散 spread 米/秒，往上 up 米/秒 */
  emit(x: number, y: number, z: number, n: number, spread: number, up: number, size?: number): void;
  /** 水面上一圈涟漪：从 r0 扩到 r1，dur 秒 */
  ripple(x: number, z: number, r0: number, r1: number, dur: number, alpha?: number): void;
  step(dt: number): void;
  clear(): void;
}

export function createSplash(
  scene: THREE.Scene,
  mat: THREE.Material,
  water: number,
  rng: () => number,
  N = 220,
  R = 28,
): Splash {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mesh = new THREE.InstancedMesh(geo, mat, N);
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.name = 'lifeguard:splash';
  scene.add(mesh);
  const P = Array.from({ length: N }, () => ({ on: false, p: new THREE.Vector3(), v: new THREE.Vector3(), s: 0.08 }));
  let next = 0;
  const m4 = new THREE.Matrix4();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < N; i++) mesh.setMatrixAt(i, zero);

  // 涟漪：一圈白（FX 层：不描边、不受光），透明度随时间掉
  const rgeo = new THREE.RingGeometry(0.86, 1, 28, 1).rotateX(-Math.PI / 2);
  const rings = Array.from({ length: R }, () => {
    const m = new THREE.Mesh(
      rgeo,
      new THREE.MeshBasicMaterial({ color: 0xf4fdff, transparent: true, opacity: 0, depthWrite: false }),
    );
    m.layers.set(1);
    m.renderOrder = 2;
    m.frustumCulled = false;
    m.visible = false;
    scene.add(m);
    return { m, t: 0, dur: 1, r0: 0.2, r1: 1, a: 0.8 };
  });
  let rnext = 0;

  return {
    emit(x, y, z, n, spread, up, size = 0.08) {
      for (let k = 0; k < n; k++) {
        const q = P[next];
        next = (next + 1) % N;
        const ang = rng() * Math.PI * 2;
        const sp = spread * (0.4 + 0.6 * rng());
        q.on = true;
        q.p.set(x + Math.cos(ang) * 0.08, y, z + Math.sin(ang) * 0.08);
        q.v.set(Math.cos(ang) * sp, up * (0.6 + 0.5 * rng()), Math.sin(ang) * sp);
        q.s = size * (0.7 + 0.6 * rng());
      }
    },
    ripple(x, z, r0, r1, dur, alpha = 0.75) {
      const r = rings[rnext];
      rnext = (rnext + 1) % R;
      r.t = 0;
      r.dur = dur;
      r.r0 = r0;
      r.r1 = r1;
      r.a = alpha;
      r.m.position.set(x, water + 0.02, z);
      r.m.visible = true;
    },
    step(dt) {
      for (let i = 0; i < N; i++) {
        const q = P[i];
        if (!q.on) continue;
        q.v.y -= 9.8 * dt;
        q.p.addScaledVector(q.v, dt);
        if (q.p.y < water) {
          q.on = false;
          mesh.setMatrixAt(i, zero);
          continue;
        }
        m4.makeScale(q.s, q.s, q.s).setPosition(q.p);
        mesh.setMatrixAt(i, m4);
      }
      mesh.instanceMatrix.needsUpdate = true;
      for (const r of rings) {
        if (!r.m.visible) continue;
        r.t += dt;
        const k = r.t / r.dur;
        if (k >= 1) {
          r.m.visible = false;
          continue;
        }
        r.m.scale.setScalar(r.r0 + (r.r1 - r.r0) * Math.sqrt(k));
        (r.m.material as THREE.MeshBasicMaterial).opacity = r.a * (1 - k);
      }
    },
    clear() {
      for (let i = 0; i < N; i++) {
        P[i].on = false;
        mesh.setMatrixAt(i, zero);
      }
      mesh.instanceMatrix.needsUpdate = true;
      for (const r of rings) r.m.visible = false;
    },
  };
}

// 投影剔除（2026-11-22 性能）：阴影相机是跟着总监的 68 米方框、沿太阳方向 200 米深，傍晚太阳低的时候
// 框里一大半投影的东西影子根本落不进画面（俱乐部那边的车、人、灌木，镇子另一头的花池），每件照样多画一遍。
// 每次画颜色（这一遍顺带画阴影图）之前，逐件算"影子能落到哪"：包围球沿背着太阳的方向扫到地面以下，
// 这条胶囊碰不到镜头的取景盒（正交相机的长方体，四周多留 1 米给 PCF 的软边）就这一帧不投影，画完马上恢复。
// 判断是严格的：画面上能看到的点 P 被 Q 挡住 ⇔ Q 在 P 朝太阳的射线上 ⇔ P 在 Q 背着太阳扫出去的线上，所以画面不变。
// 只动原来就投影的网格的 castShadow，而且只在这一遍里；骨骼网格（总监、cast）、不做视锥剔除的不动。
import * as THREE from 'three';

/** 地面最低多少（山脚、泳池底）：扫到这以下就不用再扫了 */
const FLOOR_Y = -3;
/** 取景盒外多留的余量（米）：PCF 半径 4 个阴影纹素 ≈ 0.13 米 + normalBias，再多留些 */
const MARGIN = 1;

export function mountShadowCull(scene: THREE.Scene, camera: THREE.OrthographicCamera, renderer: THREE.WebGLRenderer) {
  const sun = (() => {
    let s: THREE.DirectionalLight | null = null;
    scene.traverse((o) => {
      const l = o as THREE.DirectionalLight;
      if (!s && l.isDirectionalLight && l.castShadow) s = l;
    });
    return s as THREE.DirectionalLight | null;
  })();
  const off: THREE.Mesh[] = [];
  const dir = new THREE.Vector3();
  const inv = new THREE.Matrix4();
  const c = new THREE.Vector3();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const sph = new THREE.Sphere();
  let enabled = true;
  const before = scene.onBeforeRender.bind(scene);
  const after = scene.onAfterRender.bind(scene);

  /** 线段 a→b 碰不碰 [lo, hi] 的长方体（Liang–Barsky） */
  const segBox = (
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    lo: number[],
    hi: number[],
  ) => {
    let t0 = 0;
    let t1 = 1;
    const p = [ax, ay, az];
    const d = [bx - ax, by - ay, bz - az];
    for (let k = 0; k < 3; k++) {
      if (Math.abs(d[k]) < 1e-9) {
        if (p[k] < lo[k] || p[k] > hi[k]) return false;
        continue;
      }
      let u0 = (lo[k] - p[k]) / d[k];
      let u1 = (hi[k] - p[k]) / d[k];
      if (u0 > u1) [u0, u1] = [u1, u0];
      t0 = Math.max(t0, u0);
      t1 = Math.min(t1, u1);
      if (t0 > t1) return false;
    }
    return true;
  };

  scene.onBeforeRender = (...args) => {
    before(...args);
    const cam = args[2];
    if (!enabled || !sun || cam !== camera || !renderer.shadowMap.enabled || !renderer.shadowMap.autoUpdate) return;
    dir.subVectors(sun.position, sun.target.position).normalize();
    // 太阳贴着地平线（或者在下面）：影子无限长，不剔
    if (dir.y < 0.03) return;
    camera.updateMatrixWorld();
    inv.copy(camera.matrixWorld).invert();
    const lo = [camera.left, camera.bottom, -camera.far];
    const hi = [camera.right, camera.top, -camera.near];
    scene.traverseVisible((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !m.castShadow || !m.frustumCulled || (m as unknown as THREE.SkinnedMesh).isSkinnedMesh) return;
      const im = m as unknown as THREE.InstancedMesh;
      if (im.isInstancedMesh) {
        if (!im.boundingSphere) im.computeBoundingSphere();
        sph.copy(im.boundingSphere as THREE.Sphere);
      } else {
        const g = m.geometry;
        if (!g.boundingSphere) g.computeBoundingSphere();
        sph.copy(g.boundingSphere as THREE.Sphere);
      }
      sph.applyMatrix4(m.matrixWorld);
      c.copy(sph.center);
      const rad = sph.radius + MARGIN;
      // 扫到整个球都在 FLOOR_Y 以下
      const t = Math.max(0, (c.y + sph.radius - FLOOR_Y) / dir.y);
      a.copy(c).applyMatrix4(inv);
      b.copy(c).addScaledVector(dir, -t).applyMatrix4(inv);
      const l2 = [lo[0] - rad, lo[1] - rad, lo[2] - rad];
      const h2 = [hi[0] + rad, hi[1] + rad, hi[2] + rad];
      if (segBox(a.x, a.y, a.z, b.x, b.y, b.z, l2, h2)) return;
      m.castShadow = false;
      off.push(m);
    });
  };
  scene.onAfterRender = (...args) => {
    after(...args);
    for (const m of off) m.castShadow = true;
    off.length = 0;
  };
  return {
    set enabled(v: boolean) {
      enabled = v;
    },
    get enabled() {
      return enabled;
    },
  };
}

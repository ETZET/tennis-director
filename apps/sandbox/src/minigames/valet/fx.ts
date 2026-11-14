// 代客泊车的地面提示（FX 层：只进颜色 pass，不描边、不受光，像素风的实心色块）：
//   bayMark   派给你的车位：一圈粗框 + 淡淡的底色（金 = 去那；绿 = 停正了；橙 = 进去了但歪 / 压线）
//   guideDots 导航线：地上一串小方点，金色 = 往前开，珊瑚红 = 倒车；车开过去的那段不画
import * as THREE from 'three';
import type { RoutePt } from './rules';

const FX = 1;
const prep = (m: THREE.Mesh | THREE.InstancedMesh, order = 2) => {
  m.layers.set(FX);
  m.renderOrder = order;
  m.frustumCulled = false;
  m.castShadow = false;
  m.receiveShadow = false;
};

export const BAY_GOLD = 0xffd23c;
export const BAY_GREEN = 0x8fe36a;
export const BAY_ORANGE = 0xf07c4c;

export interface BayMark {
  obj: THREE.Group;
  /** 摆到一个车位上（x0..x1 × z0..z1，地面高 y）；null = 藏起来 */
  set(r: { x0: number; x1: number; z0: number; z1: number } | null, y?: number): void;
  color(c: number): void;
  /** 每帧：框一闪一闪（steps，像素风） */
  pulse(t: number): void;
}

export function bayMark(): BayMark {
  const g = new THREE.Group();
  g.name = 'valet:bay';
  const lineMat = new THREE.MeshBasicMaterial({ color: BAY_GOLD, transparent: true, opacity: 0.95, depthWrite: false });
  const fillMat = new THREE.MeshBasicMaterial({ color: BAY_GOLD, transparent: true, opacity: 0.2, depthWrite: false });
  const fill = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), fillMat);
  prep(fill, 1);
  g.add(fill);
  const W = 0.16;
  const edges = [0, 1, 2, 3].map(() => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), lineMat);
    prep(m, 2);
    g.add(m);
    return m;
  });
  g.visible = false;
  return {
    obj: g,
    set(r, y = 0) {
      if (!r) {
        g.visible = false;
        return;
      }
      g.visible = true;
      const cx = (r.x0 + r.x1) / 2;
      const cz = (r.z0 + r.z1) / 2;
      const w = r.x1 - r.x0;
      const d = r.z1 - r.z0;
      g.position.set(cx, y + 0.035, cz);
      fill.scale.set(w, 1, d);
      // 上下左右四条边（框画在线的里面一点：不盖住场景画的白线）
      const [n, s, wv, e] = edges;
      n.scale.set(w, 1, W);
      n.position.set(0, 0.002, -d / 2 + W / 2 + 0.06);
      s.scale.set(w, 1, W);
      s.position.set(0, 0.002, d / 2 - W / 2 - 0.06);
      wv.scale.set(W, 1, d);
      wv.position.set(-w / 2 + W / 2 + 0.06, 0.002, 0);
      e.scale.set(W, 1, d);
      e.position.set(w / 2 - W / 2 - 0.06, 0.002, 0);
    },
    color(c) {
      lineMat.color.set(c);
      fillMat.color.set(c);
    },
    pulse(t) {
      fillMat.opacity = Math.floor(t * 3) % 2 ? 0.14 : 0.26;
    },
  };
}

export interface GuideDots {
  obj: THREE.InstancedMesh;
  /** 换一条导航线（null = 不画） */
  set(route: readonly RoutePt[] | null, groundAt: (x: number, z: number) => number): void;
  /** 车走到第几个点了：前面的才画 */
  from(i: number): void;
}

const DOT_FWD = new THREE.Color(0xffd23c);
const DOT_REV = new THREE.Color(0xff6f61);

export function guideDots(max = 160): GuideDots {
  const geo = new THREE.PlaneGeometry(0.3, 0.3).rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false });
  const mesh = new THREE.InstancedMesh(geo, mat, max);
  mesh.name = 'valet:guide';
  prep(mesh, 2);
  mesh.count = 0;
  const m4 = new THREE.Matrix4();
  let pts: { x: number; y: number; z: number; rev: boolean }[] = [];
  let start = -1;
  const draw = (i0: number) => {
    let n = 0;
    // 每隔一个点画一个（点 0.8 米一个 → 方点 1.6 米一个）
    for (let i = i0 + 1; i < pts.length && n < max; i += 2) {
      const p = pts[i];
      m4.makeTranslation(p.x, p.y, p.z);
      mesh.setMatrixAt(n, m4);
      mesh.setColorAt(n, p.rev ? DOT_REV : DOT_FWD);
      n++;
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  };
  return {
    obj: mesh,
    set(route, groundAt) {
      pts = (route ?? []).map((p) => ({ x: p.x, y: groundAt(p.x, p.z) + 0.04, z: p.z, rev: p.rev }));
      start = -1;
      mesh.visible = pts.length > 0;
      draw(0);
    },
    from(i) {
      const k = i - (i % 2);
      if (k === start) return;
      start = k;
      draw(k);
    },
  };
}

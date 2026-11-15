// clubbuild 的界面覆盖层（只在 FX 图层画：不进法线/深度，不描边、不投影）：
// TileLayer = 一格一块的实例化色块（落点提示、步道预览、拆除选中）；Outline = 一圈框（实线 = 选中，虚线 = 搬走前的原位）。
// 都是演出，不碰模拟。game.ts 用。
import * as THREE from 'three';
import { LOT_D, LOT_W, TILE } from './catalog';
import { placedCenter } from './sim';

const plane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

/** 一格一块的色块层 */
export class TileLayer {
  readonly mesh: THREE.InstancedMesh;
  readonly mat: THREE.MeshBasicMaterial;
  private m = new THREE.Matrix4();
  private c = new THREE.Color();

  constructor(
    scene: THREE.Scene,
    opts: { opacity: number; y: number; inset?: number; order?: number; depthTest?: boolean },
  ) {
    this.mat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: opts.opacity,
      depthWrite: false,
      depthTest: opts.depthTest ?? false,
    });
    this.mesh = new THREE.InstancedMesh(plane, this.mat, LOT_W * LOT_D);
    this.mesh.layers.set(1);
    this.mesh.renderOrder = opts.order ?? 6;
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.y = opts.y;
    this.inset = opts.inset ?? 0.9;
    scene.add(this.mesh);
  }
  private y: number;
  private inset: number;

  set(list: { c: number; r: number; color: number }[]) {
    const n = Math.min(list.length, LOT_W * LOT_D);
    this.mesh.count = n;
    for (let i = 0; i < n; i++) {
      const t = list[i];
      const [x, z] = placedCenter({ id: 'path', col: t.c, row: t.r, rot: 0 });
      this.m.makeScale(TILE * this.inset, 1, TILE * this.inset).setPosition(x, this.y, z);
      this.mesh.setMatrixAt(i, this.m);
      this.mesh.setColorAt(i, this.c.set(t.color));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  clear() {
    this.mesh.count = 0;
  }
}

/** 一圈框：实线（4 条）或虚线（每条拆成几段） */
export class Outline {
  readonly mat: THREE.MeshBasicMaterial;
  private mesh: THREE.InstancedMesh;
  private m = new THREE.Matrix4();

  constructor(scene: THREE.Scene, color: number, order = 7) {
    this.mat = new THREE.MeshBasicMaterial({
      color,
      depthWrite: false,
      depthTest: false,
      transparent: true,
      opacity: 1,
    });
    this.mesh = new THREE.InstancedMesh(plane, this.mat, 256);
    this.mesh.layers.set(1);
    this.mesh.renderOrder = order;
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
  }

  /** 中心 (x, z)、宽 w、深 d（米）；dash > 0 = 虚线（段长 dash 米，空一半） */
  show(x: number, z: number, w: number, d: number, opts: { t?: number; y?: number; dash?: number } = {}) {
    const t = opts.t ?? 0.4;
    const y = opts.y ?? 0.7;
    const bars: [number, number, number, number][] = [];
    const edge = (x0: number, z0: number, x1: number, z1: number) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const horiz = Math.abs(z1 - z0) < 1e-6;
      const dash = opts.dash ?? 0;
      const n = dash > 0 ? Math.max(1, Math.round(len / (dash * 1.6))) : 1;
      const seg = dash > 0 ? len / n : len;
      const on = dash > 0 ? seg * 0.6 : len;
      for (let i = 0; i < n; i++) {
        const k = (i * seg + on / 2) / len;
        const cx = x0 + (x1 - x0) * k;
        const cz = z0 + (z1 - z0) * k;
        bars.push(horiz ? [cx, cz, on, t] : [cx, cz, t, on]);
      }
    };
    const l = x - w / 2 + t / 2;
    const r = x + w / 2 - t / 2;
    const n = z - d / 2 + t / 2;
    const s = z + d / 2 - t / 2;
    edge(x - w / 2, n, x + w / 2, n);
    edge(x - w / 2, s, x + w / 2, s);
    edge(l, z - d / 2, l, z + d / 2);
    edge(r, z - d / 2, r, z + d / 2);
    const k = Math.min(bars.length, 256);
    this.mesh.count = k;
    for (let i = 0; i < k; i++) {
      const [bx, bz, bw, bd] = bars[i];
      this.m.makeScale(bw, 1, bd).setPosition(bx, y, bz);
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  hide() {
    this.mesh.count = 0;
  }
}
